// R5b.1 Ask mode backend.
//
// POST /ask streams SSE events with the pipeline:
//   1. Pass 1 (Haiku) classifies intent + extracts structured fields.
//   2. Retrieval queries the calibration map for matching products.
//   3. Pass 2 (Haiku, parallel per product) frames the "why" copy.
//   4. SSE events fire as each stage completes: thinking → intent →
//      item (per product) → done. Refusals fire "refuse"; failures
//      fire "error".
//
// Type 2 (knowledge) and type 3 (context) queries are refused in this
// phase. R5b.2 and R5b.3 wire those routes through knowledge.js and
// contexts.js respectively.
//
// Trust safeguards (per partiqule-decision-log.md):
//   - Score lookups happen server-side. The LLM never quotes a number.
//   - Pass 2 system prompt forbids "safe", causation language, and
//     unsourced regulatory claims. Scrubber checks output; a forbidden
//     phrase triggers fallback to templated framing.
//   - Every request lands a row in ask_responses for spot-check audit.

"use strict";

const crypto = require("crypto");

// ── ENV ──────────────────────────────────────────────────────────
const ASK_PASS1_MODEL = process.env.ASK_PASS1_MODEL || "claude-haiku-4-5-20251001";
const ASK_PASS2_MODEL = process.env.ASK_PASS2_MODEL || "claude-haiku-4-5-20251001";
const ASK_INTENT_CACHE_TTL_S  = parseInt(process.env.ASK_INTENT_CACHE_TTL_SECONDS  || "86400",  10);
const ASK_FRAMING_CACHE_TTL_S = parseInt(process.env.ASK_FRAMING_CACHE_TTL_SECONDS || "604800", 10);
const ASK_RATE_LIMIT_ANON = parseInt(process.env.ASK_RATE_LIMIT_ANON_PER_HOUR || "20",  10);
const ASK_RATE_LIMIT_AUTH = parseInt(process.env.ASK_RATE_LIMIT_AUTH_PER_HOUR || "100", 10);

// ── HELPERS ──────────────────────────────────────────────────────
const normaliseQuery = (s) => String(s || "")
  .toLowerCase()
  .trim()
  .replace(/[\x00-\x1f]/g, "")
  .replace(/\s+/g, " ");

const intentCacheKey = (q) => `ask:intent:v1:${crypto.createHash("sha1").update(q).digest("hex").slice(0, 16)}`;

const framingCacheKey = (productKey, contextSig) =>
  `ask:framing:v1:${crypto.createHash("sha1").update(productKey + "|" + contextSig).digest("hex").slice(0, 16)}`;

const contextSignature = (intent) => {
  const audience = intent.audience || "any";
  const constraints = Array.isArray(intent.constraints)
    ? [...intent.constraints].map(s => String(s).toLowerCase().trim()).sort().join(",")
    : "";
  const occasion = String(intent.occasion || "").toLowerCase().trim();
  return `${audience}|${constraints}|${occasion}`;
};

// ── SSE WRITER ───────────────────────────────────────────────────
function makeSseWriter(res) {
  let closed = false;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  const emit = (event, payload) => {
    if (closed) return;
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(payload || {})}\n\n`);
      if (typeof res.flush === "function") res.flush();
    } catch { closed = true; }
  };
  const end = () => {
    if (closed) return;
    closed = true;
    try { res.end(); } catch {}
  };
  return { emit, end };
}

// ── PASS 1: INTENT CLASSIFIER ────────────────────────────────────
const PASS1_SYSTEM = `You classify product-safety questions and extract structured intent. Return strict JSON, no prose.

Schema:
{
  "type": "product" | "knowledge" | "context" | "unclear",
  "confidence": 0.0-1.0,
  "restatement": "one short sentence rephrasing the user's intent in second person; no first person; no medical claims; never use the word safe",
  "category": "slug like sippy_cup, sunscreen, laundry_detergent, prenatal_vitamin; null for non-product types",
  "audience": "adult" | "child" | "baby" | null,
  "age_range_months": [min, max] | null,
  "constraints": ["fragrance free", "non-toxic", ...],
  "occasion": "pregnancy" | "newborn" | "back to school" | null
}

Type rules:
- "product"   — user wants product recommendations ("sippy cup for 18 month old", "best laundry detergent")
- "knowledge" — user asks about a chemical or term ("what is pfas", "are phthalates a concern")
- "context"   — user wants a bundle for a life moment ("what should i buy for a ski trip", "newborn essentials")
- "unclear"   — gibberish, too vague, or off-topic

Voice rules for the restatement field:
- Never use the word "safe"
- Never use first person ("we", "our", "I")
- No medical claims ("cures", "causes", "treats")
- Score-anchored when possible ("here's what scored cleanest")

Return strict JSON only. No backticks, no markdown.`;

async function classifyIntent({ callClaude }, query) {
  const userPrompt = `Query: "${query}"`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const parsed = await callClaude(PASS1_SYSTEM, userPrompt, 400, 1);
      if (!parsed || typeof parsed !== "object") throw new Error("non-object");
      if (!["product", "knowledge", "context", "unclear"].includes(parsed.type)) throw new Error("bad type");
      let conf = Number(parsed.confidence);
      if (!Number.isFinite(conf) || conf < 0 || conf > 1) conf = 0.5;
      parsed.confidence = conf;
      parsed.restatement = typeof parsed.restatement === "string" ? parsed.restatement : "";
      parsed.constraints = Array.isArray(parsed.constraints) ? parsed.constraints.filter(s => typeof s === "string") : [];
      parsed.category = typeof parsed.category === "string" ? parsed.category : null;
      parsed.audience = ["adult", "child", "baby"].includes(parsed.audience) ? parsed.audience : null;
      parsed.occasion = typeof parsed.occasion === "string" ? parsed.occasion : null;
      return parsed;
    } catch (e) {
      if (attempt === 1) throw new Error(`Pass 1 failed: ${e.message}`);
    }
  }
}

// ── RETRIEVAL ────────────────────────────────────────────────────
// Light-touch keyword expansion. The category slug from Pass 1 maps
// to one or more match patterns we apply to calibration keys. Anything
// unmapped falls through to a substring match against the slug words.
const CATEGORY_KEYWORDS = {
  sippy_cup:           [/\bsippy\b/, /\btoddler\s+(cup|bottle)/, /\btrainer\s+cup/],
  water_bottle:        [/\bwater\s+bottle/, /\bhydro\s*flask/, /\byeti/, /\bowala/, /\bkanteen/, /\bstanley/, /\bnalgene/],
  sunscreen:           [/\bsunscreen/, /\bspf\b/, /\bsunblock/, /\bmineral\s+sun/],
  laundry_detergent:   [/\blaundry/, /\btide\b/, /\bpersil/, /\bgain\b/, /\bdownfree/, /\bdownfreely/, /\bdownmom/, /\bblueland\s+laundry/, /\bbranch\s+basics\s+laundry/, /\bmolly.?s\s+suds/, /\bdropps/, /\btru\s+earth/],
  dish_soap:           [/\bdish\s+(soap|liquid)/, /\bdishwashing\s+liquid/],
  dishwasher_detergent:[/\bdishwasher/, /\bcascade/, /\bfinish\s+(tab|powder|pod)/],
  all_purpose_cleaner: [/\ball.?purpose/, /\bmulti.?surface/, /\bgranite\s+cleaner/, /\bglass\s+cleaner/],
  shampoo:             [/\bshampoo/],
  conditioner:         [/\bconditioner\b/],
  deodorant:           [/\bdeodorant/, /\bantiperspirant/],
  toothpaste:          [/\btoothpaste/],
  cleanser:            [/\bcleanser/, /\bface\s+wash/],
  moisturizer:         [/\bmoisturiz/, /\bface\s+cream\b/, /\bday\s+cream/],
  serum:               [/\bserum\b/],
  diaper:              [/\bdiaper/],
  baby_wipes:          [/\bbaby\s+wipe/, /\bsensitive\s+wipe/],
  baby_wash:           [/\bbaby\s+(wash|shampoo|soap)/, /\bbaby\s+bath/],
  baby_lotion:         [/\bbaby\s+(lotion|cream|oil)/],
  pacifier:            [/\bpacifier/, /\bbinky/],
  formula:             [/\bformula\b/],
  prenatal_vitamin:    [/\bprenatal/],
  stretch_mark_oil:    [/\bstretch\s+mark/, /\bbio\s*oil/, /\bbelly\s+oil/],
  cereal:              [/\bcereal/, /\bcheerios|\bchex|\bgranola/],
  yogurt_pouch:        [/\byogurt\s+pouch/, /\bsiggi/, /\bstonyfield/],
  fruit_pouch:         [/\bfruit\s+pouch/, /\bpouch.*organic/],
  snack:               [/\bsnack/, /\bcracker/, /\bchip/, /\bpretzel/],
  pajama:              [/\bpajama|\bpj\b|\bsleepwear/],
  legging:             [/\blegging/],
  cookware:            [/\bpan\b|\bskillet|\bcookware|\bdutch\s+oven|\bcast\s+iron|\bnonstick/],
};

function categoryPatterns(slug) {
  if (!slug) return [];
  const direct = CATEGORY_KEYWORDS[slug];
  if (direct) return direct;
  // Fallback: try the slug words against the key
  const words = String(slug).toLowerCase().split(/[_\s]+/).filter(Boolean);
  if (!words.length) return [];
  return [new RegExp(`\\b${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+")}\\b`)];
}

function effectiveScore(entry, intent) {
  if (intent.audience === "child" || intent.audience === "baby") {
    if (typeof entry.kidsFloor === "number") return entry.kidsFloor;
  }
  return typeof entry.floor === "number" ? entry.floor : 5;
}

function retrieveProducts({ CALIBRATION }, intent) {
  if (intent.type !== "product") return [];
  // Normalize whitespace and hyphens to underscores so Pass 1's natural
  // phrasing ("sippy cup", "laundry-detergent") resolves to the snake_case
  // keys used by CATEGORY_KEYWORDS and entry.product_family tags.
  const slug = String(intent.category || "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
  const patterns = categoryPatterns(slug);

  const candidates = [];
  for (const [key, entry] of CALIBRATION.entries()) {
    // Prefer the explicit product_family tag on the calibration entry.
    // Brand-named entries that don't repeat the category in their key
    // (e.g. "ezpz tiny cup" as a sippy cup) only surface this way.
    const familyHit = entry && entry.product_family && entry.product_family === slug;
    const keyHit = !familyHit && patterns.length && patterns.some(p => p.test(key));
    if (!familyHit && !keyHit) continue;
    candidates.push({ key, entry, score: effectiveScore(entry, intent) });
  }

  candidates.sort((a, b) => a.score - b.score);
  return candidates.slice(0, 3);
}

// ── PASS 2: PER-ITEM FRAMING ─────────────────────────────────────
const PASS2_SYSTEM = `You write one-line product framing for Partiqule.

Voice rules (HARD CONSTRAINTS — output must satisfy all):
- Never use the word "safe" in any form. Use score-anchored language ("scored cleanest", "low score", "minimal flags", "cleaner than category baseline").
- Never use first person: "we", "our", "I" are forbidden.
- No causation claims: forbidden phrases include "causes", "linked to", "may prevent", "associated with".
- No unsourced regulatory claims: forbidden include "banned by", "warned by", "Prop 65", "studies show", "research suggests", "doctors recommend". You may quote the calibration entry's reason field verbatim if it states a sourced fact.
- Specific receipts: name an ingredient, certification, or composition tier. Avoid abstract claims.

Input: a Partiqule calibration entry plus the user's parsed intent context.

Return strict JSON only:
{
  "why": "one short sentence, max 80 characters, names a specific receipt",
  "detailed_flags": [
    { "label": "Material" | "Fragrance" | "Sugar" | etc., "kind": "good" | "concern" | "neutral", "detail": "one short sentence, max 120 characters" }
  ],
  "calibration_note": "optional one sentence, max 150 characters"
}

Return strict JSON only. No backticks, no markdown.`;

const FORBIDDEN_RE = [
  /\bsafe\b/i,
  /\bcauses\b/i,
  /\blinked\s+to\b/i,
  /\bmay\s+prevent\b/i,
  /\bassociated\s+with\b/i,
  /\bbanned\s+by\b/i,
  /\bwarned\s+by\b/i,
  /\bprop\s*65\b/i,
  /\bstudies\s+show\b/i,
  /\bresearch\s+suggests\b/i,
  /\bdoctors\s+recommend\b/i,
  /\bwe\b/i,
  /\bour\b/i,
  /\bI\b/,
];

const containsForbidden = (text) => {
  const s = String(text || "");
  return FORBIDDEN_RE.some(re => re.test(s));
};

function templatedFraming(key, entry) {
  const floor = typeof entry.floor === "number" ? entry.floor : 5;
  const tier = floor <= 2 ? "Clean tier" : floor <= 4 ? "Decent tier" : floor <= 6 ? "Watch tier" : "Avoid tier";
  const subs = Array.isArray(entry.substances) ? entry.substances.slice(0, 2) : [];
  const head = subs.length ? `${tier}. ${subs[0]}` : `${tier} per calibration.`;
  return {
    why: head.length > 80 ? head.slice(0, 77) + "..." : head,
    detailed_flags: (entry.substances || []).slice(0, 4).map(s => {
      const text = String(s || "");
      const label = text.split(/[—:|·]/)[0].trim().slice(0, 40) || "Note";
      return { label, kind: "neutral", detail: text.slice(0, 120) };
    }),
    calibration_note: entry.reason ? String(entry.reason).slice(0, 150) : null,
  };
}

async function frameItem({ callClaude, redisGet, redisSetEx, hasRedis }, key, entry, intent) {
  const sig = contextSignature(intent);
  const cacheKey = framingCacheKey(key, sig);
  let cached = false;
  if (hasRedis) {
    try {
      const hit = await redisGet(cacheKey);
      if (hit && typeof hit === "object" && typeof hit.why === "string" && !containsForbidden(hit.why)) {
        return { framing: hit, cached: true };
      }
    } catch {}
  }

  const slim = {
    floor: entry.floor,
    ceiling: entry.ceiling,
    kidsFloor: entry.kidsFloor,
    substances: Array.isArray(entry.substances) ? entry.substances.slice(0, 6) : [],
    reason: typeof entry.reason === "string" ? entry.reason.slice(0, 600) : "",
    category: entry.category,
  };
  const userPrompt = `Product key: ${key}
Calibration: ${JSON.stringify(slim)}
User intent: ${JSON.stringify({
    audience: intent.audience,
    age_range_months: intent.age_range_months,
    constraints: intent.constraints,
    occasion: intent.occasion,
  })}`;

  let parsed;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      parsed = await callClaude(PASS2_SYSTEM, userPrompt, 500, 1);
      if (!parsed || typeof parsed !== "object") throw new Error("non-object");
      const why = String(parsed.why || "").trim();
      if (!why || containsForbidden(why)) throw new Error("voice violation in why");
      const flags = Array.isArray(parsed.detailed_flags)
        ? parsed.detailed_flags
            .filter(f => f && typeof f.label === "string" && !containsForbidden(f.detail))
            .slice(0, 6)
            .map(f => ({
              label: String(f.label).slice(0, 40),
              kind: ["good", "concern", "neutral"].includes(f.kind) ? f.kind : "neutral",
              detail: typeof f.detail === "string" ? f.detail.slice(0, 120) : "",
            }))
        : [];
      const note = typeof parsed.calibration_note === "string" ? parsed.calibration_note.slice(0, 150) : null;
      if (note && containsForbidden(note)) throw new Error("voice violation in note");
      const framing = {
        why: why.slice(0, 80),
        detailed_flags: flags,
        calibration_note: note || null,
      };
      if (hasRedis) redisSetEx(cacheKey, framing, ASK_FRAMING_CACHE_TTL_S).catch(() => {});
      return { framing, cached: false };
    } catch (e) {
      if (attempt === 1) {
        return { framing: templatedFraming(key, entry), cached: false, fallback: true };
      }
    }
  }
}

// ── RATE LIMITING ────────────────────────────────────────────────
// Atomic INCR pattern. Upstash returns the new count after the increment;
// when count===1 the key was missing pre-increment, so we set EXPIRE to
// prime the 1-hour window. Subsequent hits skip EXPIRE so the window
// elapses cleanly rather than rolling forward indefinitely.
//
// Replaces the prior GET + SETEX flow, which had a read-then-write race
// where N parallel requests could all read count=0 before any of them
// wrote count=1 — letting every concurrent burst skip the gate.
async function rateLimitTake({ redisIncr, redisExpire, hasRedis }, scopeKey, limit) {
  if (!hasRedis) return { allowed: true, count: 0 };
  const key = `ask:rl:${scopeKey}`;
  try {
    const count = await redisIncr(key);
    if (count === null) return { allowed: true, count: 0 }; // fail open on Redis error
    if (count === 1) {
      // Fire-and-forget: if EXPIRE fails, the key persists past the hour
      // window. Soft failure — at worst the limit gets stricter, never
      // looser. We do not await this in the hot path.
      redisExpire(key, 3600).catch(() => {});
    }
    if (count > limit) return { allowed: false, count };
    return { allowed: true, count };
  } catch {
    return { allowed: true, count: 0 }; // fail open
  }
}

// ── AUDIT LOG ────────────────────────────────────────────────────
async function writeAuditLog({ supabaseAdmin }, row) {
  if (!supabaseAdmin) return;
  try {
    await supabaseAdmin.from("ask_responses").insert(row);
  } catch (e) {
    console.warn("[ask] audit log write failed:", e?.message);
  }
}

// ── ROUTE REGISTRATION ───────────────────────────────────────────
function registerAskRoutes(app, deps) {
  const {
    callClaude,
    supabaseAdmin,
    redisGet,
    redisSetEx,
    redisDel,
    redisIncr,
    redisExpire,
    hasRedis,
    CALIBRATION,
  } = deps;

  app.post("/ask", async (req, res) => {
    const requestStartMs = Date.now();
    const sse = makeSseWriter(res);
    sse.emit("thinking", {});

    // Parse body. The express.json middleware already ran.
    const rawQuery = typeof req.body?.query === "string" ? req.body.query : "";
    const query = rawQuery.slice(0, 500).replace(/[\x00-\x1f]/g, "").trim();
    const normalized = normaliseQuery(query);

    if (!normalized || normalized.length < 3) {
      sse.emit("refuse", { reason: "too_short", message: "Tell us what you're shopping for." });
      sse.end();
      writeAuditLog(deps, {
        query: rawQuery, normalized_query: normalized,
        error: "too_short", duration_ms: Date.now() - requestStartMs,
        cached_intent: false, cached_framings: [],
      });
      return;
    }

    // Optional auth — strip token, validate. Anonymous traffic allowed.
    let userId = null;
    try {
      const header = req.headers.authorization || "";
      const m = header.match(/^Bearer\s+(.+)$/i);
      if (m && supabaseAdmin) {
        const { data } = await supabaseAdmin.auth.getUser(m[1]);
        if (data?.user?.id) userId = data.user.id;
      }
    } catch {}

    // Rate limit: anon by IP, authed by user.
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
    const scopeKey = userId ? `user:${userId}` : `ip:${ip}`;
    const limit = userId ? ASK_RATE_LIMIT_AUTH : ASK_RATE_LIMIT_ANON;
    const rl = await rateLimitTake(deps, scopeKey, limit);
    if (!rl.allowed) {
      sse.emit("error", { error: "rate_limit", message: "Take a break. Try again in a bit." });
      sse.end();
      writeAuditLog(deps, {
        user_id: userId, query: rawQuery, normalized_query: normalized,
        error: "rate_limit", duration_ms: Date.now() - requestStartMs,
        cached_intent: false, cached_framings: [],
      });
      return;
    }

    // Pass 1: intent. Cache by normalized query.
    const intentKey = intentCacheKey(normalized);
    let intent = null;
    let cachedIntent = false;
    if (hasRedis) {
      try {
        const hit = await redisGet(intentKey);
        if (hit && typeof hit === "object" && hit.type) {
          intent = hit;
          cachedIntent = true;
        }
      } catch {}
    }
    if (!intent) {
      try {
        intent = await classifyIntent({ callClaude }, query);
      } catch (e) {
        console.error("[ask] Pass 1 failed:", e.message);
        sse.emit("refuse", { reason: "unclear", message: "Tell us more about what you need." });
        sse.end();
        writeAuditLog(deps, {
          user_id: userId, query: rawQuery, normalized_query: normalized,
          error: "pass1_failed", duration_ms: Date.now() - requestStartMs,
          cached_intent: false, cached_framings: [],
        });
        return;
      }
      if (hasRedis) redisSetEx(intentKey, intent, ASK_INTENT_CACHE_TTL_S).catch(() => {});
    }

    sse.emit("intent", {
      type: intent.type,
      restatement: intent.restatement || "",
      category: intent.category || null,
      audience: intent.audience || null,
      age_range_months: intent.age_range_months || null,
      constraints: intent.constraints || [],
      occasion: intent.occasion || null,
      confidence: intent.confidence,
      cached: cachedIntent,
    });

    // Refusal branches: this phase only ships type "product".
    if (intent.type === "knowledge") {
      sse.emit("refuse", { reason: "knowledge_not_yet", message: "Knowledge answers ship soon. Try asking for a product instead." });
      sse.end();
      writeAuditLog(deps, {
        user_id: userId, query: rawQuery, normalized_query: normalized,
        parsed_intent: intent, classification_confidence: intent.confidence,
        error: "refused_knowledge", duration_ms: Date.now() - requestStartMs,
        cached_intent: cachedIntent, cached_framings: [],
      });
      return;
    }
    if (intent.type === "context") {
      sse.emit("refuse", { reason: "context_not_yet", message: "Bundles for life moments ship soon. Try asking for a single product instead." });
      sse.end();
      writeAuditLog(deps, {
        user_id: userId, query: rawQuery, normalized_query: normalized,
        parsed_intent: intent, classification_confidence: intent.confidence,
        error: "refused_context", duration_ms: Date.now() - requestStartMs,
        cached_intent: cachedIntent, cached_framings: [],
      });
      return;
    }
    if (intent.type === "unclear" || intent.confidence < 0.4) {
      sse.emit("refuse", { reason: "unclear", message: "Tell us more about what you need." });
      sse.end();
      writeAuditLog(deps, {
        user_id: userId, query: rawQuery, normalized_query: normalized,
        parsed_intent: intent, classification_confidence: intent.confidence,
        error: "refused_unclear", duration_ms: Date.now() - requestStartMs,
        cached_intent: cachedIntent, cached_framings: [],
      });
      return;
    }

    // Retrieve. Type === "product" past here.
    const candidates = retrieveProducts({ CALIBRATION }, intent);
    if (!candidates.length) {
      sse.emit("done", {
        item_count: 0,
        no_results: true,
        no_results_message: "Nothing in our database scores well for this yet. Worth scanning options yourself.",
      });
      sse.end();
      writeAuditLog(deps, {
        user_id: userId, query: rawQuery, normalized_query: normalized,
        parsed_intent: intent, classification_confidence: intent.confidence,
        retrieved_product_ids: [], framing_outputs: [], final_response: { items: [] },
        duration_ms: Date.now() - requestStartMs,
        cached_intent: cachedIntent, cached_framings: [],
      });
      return;
    }

    // Pass 2 in parallel. Emit each item as it resolves so the frontend
    // can render progressively. Final ordering happens client-side by
    // score ascending — events may arrive out of order.
    const framingsForLog = [];
    const cachedFramingKeys = [];
    const itemPromises = candidates.map(async ({ key, entry, score }) => {
      try {
        const { framing, cached } = await frameItem(
          { callClaude, redisGet, redisSetEx, hasRedis },
          key, entry, intent
        );
        if (cached) cachedFramingKeys.push(key);
        const item = buildItemPayload(key, entry, intent, framing, score);
        sse.emit("item", item);
        framingsForLog.push({ key, framing, cached });
        return { ok: true, key };
      } catch (e) {
        // Fallback: emit a templated framing so the user still sees the
        // item rather than a missing slot.
        const framing = templatedFraming(key, entry);
        const item = buildItemPayload(key, entry, intent, framing, score);
        sse.emit("item", item);
        framingsForLog.push({ key, framing, cached: false, fallback: true });
        return { ok: false, key, error: e?.message };
      }
    });

    await Promise.allSettled(itemPromises);

    sse.emit("done", { item_count: candidates.length, no_results: false });
    sse.end();

    writeAuditLog(deps, {
      user_id: userId,
      query: rawQuery,
      normalized_query: normalized,
      parsed_intent: intent,
      classification_confidence: intent.confidence,
      retrieved_product_ids: candidates.map(c => c.key),
      framing_outputs: framingsForLog,
      final_response: { items: framingsForLog.map(f => f.framing) },
      duration_ms: Date.now() - requestStartMs,
      cached_intent: cachedIntent,
      cached_framings: cachedFramingKeys,
    });
  });
}

// ── HELPERS ──────────────────────────────────────────────────────
function buildItemPayload(key, entry, intent, framing, score) {
  const productName = toTitleCaseForDisplay(key);
  const audience = intent.audience;
  const kidScore = typeof entry.kidsFloor === "number" ? entry.kidsFloor : null;
  return {
    id: key,
    product_name: productName,
    score,
    kid_score: kidScore,
    category: entry.category || null,
    anchor: "calibration",
    calibration_key: key,
    flags: Array.isArray(entry.substances)
      ? entry.substances.map(s => String(s).slice(0, 60))
      : [],
    why: framing.why,
    detailed_flags: framing.detailed_flags || [],
    calibration_note: framing.calibration_note || null,
    image_url: null,
    // buy_links are computed client-side from product_name via the existing
    // buyLinksFor helper — keeps server payload small and avoids leaking the
    // Amazon partner tag into another module.
    buy_links: null,
  };
}

function toTitleCaseForDisplay(key) {
  return String(key)
    .split(" ")
    .map(w => w.length <= 2 ? w : w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function envChecks() {
  return {
    ASK_PASS1_MODEL,
    ASK_PASS2_MODEL,
    ASK_INTENT_CACHE_TTL_S,
    ASK_FRAMING_CACHE_TTL_S,
    ASK_RATE_LIMIT_ANON,
    ASK_RATE_LIMIT_AUTH,
  };
}

module.exports = { registerAskRoutes, envChecks };
