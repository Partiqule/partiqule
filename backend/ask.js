// R5b.1 + R5b.2 Ask mode backend.
//
// POST /ask streams SSE events with the pipeline:
//   1. Pass 1 (Haiku) classifies intent + extracts structured fields.
//   2a. Type "product" → retrieve from calibration, Pass 2 frames each
//       item, SSE "item" events stream as framings resolve.
//   2b. Type "knowledge" → look up curated entry in knowledge.js. If
//       authenticated, intersect entry.partiqule_flags with the user's
//       recent scans to surface "things in your home with this".
//       Pass 2 frames the curated copy into voice. Emits one
//       "knowledge" event, then a "match" event per home-matched
//       product. Refuses if no live entry covers the subject.
//   3. SSE events: thinking → intent → (item | knowledge + match*) →
//      done. Refusals fire "refuse"; failures fire "error".
//
// Type 3 (context) queries still refuse. R5b.3 wires that route.
//
// Trust safeguards (per partiqule-decision-log.md):
//   - Knowledge content comes from curated entries in knowledge.js.
//     The LLM is a stylist, not a researcher: it paraphrases curated
//     copy into voice but cannot introduce new claims.
//   - Score lookups happen server-side. The LLM never quotes a number.
//   - Pass 2 system prompt forbids "safe", causation language, and
//     unsourced regulatory claims. Scrubber checks output; a forbidden
//     phrase triggers fallback to templated framing built from the
//     entry directly.
//   - Every request lands a row in ask_responses for spot-check audit.

"use strict";

const crypto = require("crypto");
const { KNOWLEDGE_ENTRIES, findEntry: findKnowledgeEntryById } = require("./knowledge");
const { FLAG_DEFS, detectFlags } = require("./flagDetection");

// ── ENV ──────────────────────────────────────────────────────────
const ASK_PASS1_MODEL = process.env.ASK_PASS1_MODEL || "claude-haiku-4-5-20251001";
const ASK_PASS2_MODEL = process.env.ASK_PASS2_MODEL || "claude-haiku-4-5-20251001";
const ASK_INTENT_CACHE_TTL_S  = parseInt(process.env.ASK_INTENT_CACHE_TTL_SECONDS  || "86400",  10);
const ASK_FRAMING_CACHE_TTL_S = parseInt(process.env.ASK_FRAMING_CACHE_TTL_SECONDS || "604800", 10);
const ASK_RATE_LIMIT_ANON = parseInt(process.env.ASK_RATE_LIMIT_ANON_PER_HOUR || "20",  10);
const ASK_RATE_LIMIT_AUTH = parseInt(process.env.ASK_RATE_LIMIT_AUTH_PER_HOUR || "100", 10);

// ── HELPERS ──────────────────────────────────────────────────────
// Trailing punctuation is stripped so "what is pfas?" and "what is pfas"
// produce the same intent cache key. The substance/subject lookups apply
// a stricter normalizeSubject in findKnowledgeEntry, but the intent cache
// only needs query-level consistency.
const normaliseQuery = (s) => String(s || "")
  .toLowerCase()
  .trim()
  .replace(/[\x00-\x1f]/g, "")
  .replace(/\s+/g, " ")
  .replace(/[?!.,;:]+$/, "")
  .trim();

const intentCacheKey = (q) => `ask:intent:v1:${crypto.createHash("sha1").update(q).digest("hex").slice(0, 16)}`;

const framingCacheKey = (productKey, contextSig) =>
  `ask:framing:v1:${crypto.createHash("sha1").update(productKey + "|" + contextSig).digest("hex").slice(0, 16)}`;

// Knowledge framing cache key: per-entry, per-personalization-bucket.
// Bucket is "none" / "few" (1–2) / "many" (3–5) — never the exact match
// count, so a personalization-aware voice line caches sensibly.
const personalizationBucket = (n) => {
  if (!n || n <= 0) return "none";
  if (n <= 2) return "few";
  return "many";
};
const knowledgeCacheKey = (entryId, bucket) =>
  `ask:knowledge:v1:${entryId}:${bucket}`;

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
  "subject": "the chemical, ingredient, certification, or material being asked about (e.g. 'PFAS', 'phthalates', 'USDA Organic', 'recycled polyester'). Only set when type is 'knowledge'. Null otherwise.",
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
      parsed.subject = typeof parsed.subject === "string" ? parsed.subject : null;
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

// ── KNOWLEDGE: ENTRY LOOKUP ──────────────────────────────────────
// Pass 1 emits { subject } in the parsed intent for type "knowledge".
// We resolve the subject string against KNOWLEDGE_ENTRIES, accepting a
// match on id slug or subject display name. Only live entries qualify
// — draft and needs_curation are treated as missing.
const slugify = (s) => String(s || "")
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "");

// Pass 1 preserves the user's punctuation and articles in the subject
// field — "pfas?" or "the PFAS" instead of "pfas". Strip those before
// slugify so the direct id lookup hits cleanly without relying on the
// last-resort substring fallback.
const normalizeSubject = (s) => String(s || "")
  .toLowerCase()
  .trim()
  .replace(/^the\s+/, "")
  .replace(/[?!.,;:]+$/, "")
  .trim();

function findKnowledgeEntry(intent) {
  const subject = normalizeSubject(intent?.subject);
  if (!subject) return null;
  const wanted = slugify(subject);
  if (!wanted) return null;

  // Direct id hit. Cheapest path.
  const direct = findKnowledgeEntryById(wanted);
  if (direct && direct.status === "live") return direct;

  // Fall back to subject-name match. PFAS as a subject string slugifies
  // to "pfas" so this path picks up casing/alias variants ("Pfas",
  // "P F A S") that the id lookup already handles, but it also picks
  // up multi-word subjects ("BPA and BPS", "synthetic dyes").
  for (const e of KNOWLEDGE_ENTRIES) {
    if (e.status !== "live") continue;
    if (slugify(e.subject) === wanted) return e;
  }

  // Last-resort substring match against subject. Handles
  // "what are phthalates" → "Phthalates". Strict to avoid surfacing the
  // wrong entry: the wanted slug must contain or equal the entry's slug.
  for (const e of KNOWLEDGE_ENTRIES) {
    if (e.status !== "live") continue;
    const entrySlug = slugify(e.subject);
    if (!entrySlug) continue;
    if (wanted === entrySlug) return e;
    if (wanted.split("_").includes(entrySlug)) return e;
  }
  return null;
}

// ── KNOWLEDGE: FLAG INTERSECTION ─────────────────────────────────
// INTERIM IMPLEMENTATION (R5b.2). The earlier design assumed scans
// persist a structured flagged_substances array on result_json. They
// don't — the deterministic flagDetection output is computed at scoring
// time but not written to the scan record. result_json carries free-text
// `concerns` arrays, AI summaries, materials descriptions, and the
// calibration `reason` field; substance names are present as narrative
// text only.
//
// Until structured flags persist on scan write (tracked as R5b.2.1 on
// the backlog), this routine stringifies result_json and runs the
// deterministic detectFlags() against the resulting text. detectFlags
// already enforces word-boundary matching and negation filtering via
// the same window-based isMatchNegated check used everywhere else, so
// "PFAS-free", "no PTFE", "free of phthalates", and "without parabens"
// all suppress correctly — no separate negation pass needed here.
//
// The entry.partiqule_flags array maps to FLAG_DEFS group keys. Slugs
// that aren't FLAG_DEFS keys (e.g. raw substance names like "ptfe",
// "fluoropolymer") are typically already covered as patterns inside the
// parent group (FLAG_DEFS.pfas covers all of them), so missing groups
// rarely matter in practice — but they will once entries like bpa_bps
// land without an existing FLAG_DEFS.bpa group.

function entryFlagGroupKeys(entry) {
  const out = [];
  for (const f of entry?.partiqule_flags || []) {
    const lower = String(f || "").toLowerCase().trim();
    if (!lower) continue;
    if (FLAG_DEFS[lower] && !out.includes(lower)) out.push(lower);
  }
  return out;
}

function stringifyResultJson(r) {
  if (!r) return "";
  try { return JSON.stringify(r); } catch { return ""; }
}

function scanHitsEntry(resultJson, groupKeys) {
  if (!groupKeys.length) return false;
  const haystack = stringifyResultJson(resultJson);
  if (!haystack) return false;
  const detection = detectFlags(haystack, null);
  for (const k of groupKeys) {
    if (detection.flags[k]?.present) return true;
  }
  return false;
}

async function findHomeMatchesForEntry({ supabaseAdmin }, userId, entry) {
  if (!supabaseAdmin || !userId || !entry) return [];
  const groupKeys = entryFlagGroupKeys(entry);
  if (!groupKeys.length) return [];
  try {
    const cutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("scans")
      .select("id, product_name, result_json, scanned_at")
      .eq("user_id", userId)
      .gte("scanned_at", cutoff)
      .order("scanned_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    const matches = [];
    const seenNames = new Set();
    for (const row of data || []) {
      const r = row?.result_json || {};
      if (!scanHitsEntry(r, groupKeys)) continue;
      const name = row.product_name || r.product_name || "Unnamed scan";
      const key = String(name).toLowerCase().trim();
      if (seenNames.has(key)) continue;
      seenNames.add(key);
      const score = typeof r.overall_score === "number" ? r.overall_score
        : (typeof r.score === "number" ? r.score : null);
      matches.push({
        id: row.id,
        name,
        score,
        product_image_url: r.product_image_url || r.image_url || null,
        scanned_at: row.scanned_at,
      });
      if (matches.length >= 5) break;
    }
    return matches;
  } catch (e) {
    console.warn("[ask] home-match scan lookup failed:", e?.message);
    return [];
  }
}

// ── KNOWLEDGE: PASS 2 FRAMING ────────────────────────────────────
const KNOWLEDGE_PASS2_SYSTEM = `You write an educational explanation card for Partiqule's Ask mode.

You are a stylist, not a researcher. The user gave you a curated knowledge entry. Your job is to paraphrase that entry into Partiqule's voice. You may NOT introduce new facts, claims, regulatory references, or study results beyond what the entry already contains. The entry IS the attestation layer; everything in it is sourced and reviewed.

Voice rules (HARD CONSTRAINTS — output must satisfy all):
- Never use the word "safe" in any form.
- Never use first person: "we", "our", "I" are forbidden.
- Refer to Partiqule by name, not as "we".
- No moralizing, no panic. Plain, calm, specific.
- Knowledge entries describe associations and regulatory posture — paraphrasing those is allowed because the entry sources them. Do not introduce additional causation language ("causes", "linked to") beyond what the entry text already states.

Input: a knowledge entry (subject, plain_language_explanation, health_safety_context, sources) plus a personalization bucket ("none" / "few" / "many") indicating how many products the user has scanned with this concern.

Return strict JSON only:
{
  "explanation": "paraphrase the plain_language_explanation in 60–90 words. Reads aloud well. No new facts.",
  "context_lines": [
    "one short sentence per major regulatory or health point from health_safety_context. 3–5 lines. Each line stands alone and reads cleanly."
  ],
  "home_connection": "one short sentence acknowledging the personalization bucket. 'none' → null. 'few' → naming that a couple of products in the user's home contain this. 'many' → naming several products. Do not invent specifics. Null when bucket is 'none'."
}

Return strict JSON only. No backticks, no markdown.`;

function templatedKnowledgeFraming(entry, matchCount) {
  // Defensive fallback: hand the curated copy straight through, broken
  // into a paragraph plus short context lines. Trust the source.
  const explanation = String(entry.plain_language_explanation || "").trim();
  const contextRaw = String(entry.health_safety_context || "").trim();
  const lines = contextRaw
    .split(/(?<=[.?!])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .slice(0, 5);
  let home = null;
  if (matchCount === 1) home = "One thing in your home has this.";
  else if (matchCount === 2) home = "Two things in your home have this.";
  else if (matchCount >= 3) home = `${matchCount} things in your home have this.`;
  return {
    explanation,
    context_lines: lines,
    home_connection: home,
  };
}

async function frameKnowledgeEntry({ callClaude, redisGet, redisSetEx, hasRedis }, entry, matchCount) {
  const bucket = personalizationBucket(matchCount);
  const cacheKey = knowledgeCacheKey(entry.id, bucket);
  if (hasRedis) {
    try {
      const hit = await redisGet(cacheKey);
      if (hit && typeof hit === "object" && typeof hit.explanation === "string" && !containsForbidden(hit.explanation)) {
        return { framing: hit, cached: true, fallback: false };
      }
    } catch {}
  }

  const slim = {
    subject: entry.subject,
    plain_language_explanation: entry.plain_language_explanation,
    health_safety_context: entry.health_safety_context,
    sources: Array.isArray(entry.sources)
      ? entry.sources.map(s => ({ name: s.name, date: s.date }))
      : [],
    personalization_bucket: bucket,
  };
  const userPrompt = `Knowledge entry: ${JSON.stringify(slim)}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const parsed = await callClaude(KNOWLEDGE_PASS2_SYSTEM, userPrompt, 800, 1);
      if (!parsed || typeof parsed !== "object") throw new Error("non-object");

      const explanation = String(parsed.explanation || "").trim();
      if (!explanation || containsForbidden(explanation)) throw new Error("voice violation in explanation");

      const contextLines = Array.isArray(parsed.context_lines)
        ? parsed.context_lines
            .map(s => String(s || "").trim())
            .filter(s => s.length > 0 && !containsForbidden(s))
            .slice(0, 5)
        : [];

      let homeConnection = parsed.home_connection;
      if (homeConnection != null) {
        homeConnection = String(homeConnection).trim();
        if (!homeConnection || containsForbidden(homeConnection)) homeConnection = null;
      } else {
        homeConnection = null;
      }
      if (bucket === "none") homeConnection = null;

      const framing = {
        explanation: explanation.slice(0, 800),
        context_lines: contextLines,
        home_connection: homeConnection,
      };
      if (hasRedis) redisSetEx(cacheKey, framing, ASK_FRAMING_CACHE_TTL_S).catch(() => {});
      return { framing, cached: false, fallback: false };
    } catch (e) {
      if (attempt === 1) {
        return { framing: templatedKnowledgeFraming(entry, matchCount), cached: false, fallback: true };
      }
    }
  }
}

// ── KNOWLEDGE: SUGGESTED ACTION ──────────────────────────────────
// Deterministic per-entry mapping so the LLM cannot invent a category
// that maps to nothing. Falls back to "scan_more" when nothing better.
const SUGGESTED_ACTION_BY_ID = {
  pfas:                       { kind: "see_options", category: "cookware",       label: "See cleaner cookware" },
  phthalates:                 { kind: "see_options", category: "all_purpose_cleaner", label: "See fragrance-free options" },
  parabens:                   { kind: "see_options", category: "shampoo",        label: "See cleaner personal care" },
  bpa_bps:                    { kind: "see_options", category: "water_bottle",   label: "See BPA-free options" },
  microplastics:              { kind: "scan_more",                                label: "Scan something to check" },
  lead:                       { kind: "scan_more",                                label: "Scan a product to check" },
  cadmium:                    { kind: "scan_more",                                label: "Scan a product to check" },
  mercury:                    { kind: "scan_more",                                label: "Scan a product to check" },
  synthetic_dyes:             { kind: "see_options", category: "cereal",         label: "See dye-free options" },
  sls_sles:                   { kind: "see_options", category: "shampoo",        label: "See sulfate-free options" },
  formaldehyde_releasers:     { kind: "see_options", category: "shampoo",        label: "See cleaner personal care" },
  triclosan:                  { kind: "see_options", category: "dish_soap",      label: "See triclosan-free options" },
  oxybenzone:                 { kind: "see_options", category: "sunscreen",      label: "See mineral sunscreens" },
  octinoxate:                 { kind: "see_options", category: "sunscreen",      label: "See mineral sunscreens" },
  glyphosate:                 { kind: "scan_more",                                label: "Scan a product to check" },
  natural_flavors:            { kind: "scan_more",                                label: "Scan a product to check" },
  high_fructose_corn_syrup:   { kind: "scan_more",                                label: "Scan a product to check" },
  artificial_sweeteners:      { kind: "scan_more",                                label: "Scan a product to check" },
  sodium_nitrite:             { kind: "scan_more",                                label: "Scan a product to check" },
  carrageenan:                { kind: "scan_more",                                label: "Scan a product to check" },
};

function suggestedActionFor(entry) {
  const mapped = SUGGESTED_ACTION_BY_ID[entry.id];
  if (mapped) return mapped;
  if (entry.category === "certification") return { kind: "learn_more", label: "Scan to see who's certified" };
  if (entry.category === "material")      return { kind: "learn_more", label: "Scan to see what it's made of" };
  return { kind: "scan_more", label: "Scan a product to check" };
}

// ── KNOWLEDGE: REQUEST HANDLER ───────────────────────────────────
async function handleKnowledgeQuery(deps, ctx) {
  const { sse, intent, userId, rawQuery, normalized, cachedIntent, requestStartMs } = ctx;
  const entry = findKnowledgeEntry(intent);

  if (!entry) {
    sse.emit("refuse", {
      reason: "knowledge_subject_not_live",
      message: "Knowledge on that subject ships soon. Try asking for a product instead.",
    });
    sse.end();
    writeAuditLog(deps, {
      user_id: userId, query: rawQuery, normalized_query: normalized,
      parsed_intent: intent, classification_confidence: intent.confidence,
      error: "knowledge_subject_not_live",
      duration_ms: Date.now() - requestStartMs,
      cached_intent: cachedIntent, cached_framings: [],
    });
    return;
  }

  // Personalization: home matches. Anonymous users skip.
  const matches = userId
    ? await findHomeMatchesForEntry(deps, userId, entry)
    : [];

  // Pass 2 framing — voice rewrite of curated copy.
  const { framing, cached: framingCached, fallback } = await frameKnowledgeEntry(deps, entry, matches.length);

  const knowledgePayload = {
    entry_id: entry.id,
    subject: entry.subject,
    category: entry.category,
    explanation: framing.explanation,
    context_lines: framing.context_lines || [],
    home_connection: matches.length > 0 ? framing.home_connection : null,
    match_count: matches.length,
    sources: Array.isArray(entry.sources)
      ? entry.sources.map(s => ({ name: s.name, url: s.url, date: s.date || null }))
      : [],
    suggested_action: suggestedActionFor(entry),
    framing_fallback: !!fallback,
    framing_cached: !!framingCached,
  };
  sse.emit("knowledge", knowledgePayload);

  // Emit each home match as its own event, paralleling type 1's "item"
  // stream. Frontend can render incrementally if backend ever fetches
  // matches async per product.
  for (const m of matches) {
    sse.emit("match", {
      id: m.id,
      name: m.name,
      score: m.score,
      product_image_url: m.product_image_url || null,
      scanned_at: m.scanned_at || null,
    });
  }

  sse.emit("done", {
    item_count: matches.length,
    no_results: false,
    response_type: "knowledge",
  });
  sse.end();

  writeAuditLog(deps, {
    user_id: userId,
    query: rawQuery,
    normalized_query: normalized,
    parsed_intent: intent,
    classification_confidence: intent.confidence,
    knowledge_entry_id: entry.id,
    retrieved_product_ids: matches.map(m => m.id),
    framing_outputs: [{ entry_id: entry.id, framing, cached: framingCached, fallback: !!fallback }],
    final_response: {
      response_type: "knowledge",
      entry_id: entry.id,
      match_count: matches.length,
    },
    duration_ms: Date.now() - requestStartMs,
    cached_intent: cachedIntent,
    cached_framings: framingCached ? [entry.id] : [],
  });
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
      subject: intent.subject || null,
      audience: intent.audience || null,
      age_range_months: intent.age_range_months || null,
      constraints: intent.constraints || [],
      occasion: intent.occasion || null,
      confidence: intent.confidence,
      cached: cachedIntent,
    });

    // Type 2: knowledge. Route through the curated knowledge base.
    if (intent.type === "knowledge") {
      await handleKnowledgeQuery(deps, {
        sse, intent, userId, rawQuery, normalized, cachedIntent, requestStartMs,
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
