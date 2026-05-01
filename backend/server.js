require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const crypto  = require("crypto");
const { findAlternatives } = require("./products");
const { isPaApiConfigured, getAmazonAlternatives } = require("./amazon-api");
const { applyProductCalibration, CALIBRATION, normalise, NUTRITION_LOOKUP } = require("./calibration");
const {
  detectFlags: detectDeterministicFlags,
  validateAIResponse: validateDeterministicFlags,
  mergeFlags: mergeDeterministicFlags,
} = require("./flagDetection");
const { resolveIngredients } = require("./pass0");
const { classifyProductFamily, CANONICAL_FAMILIES } = require("./productFamilies");
const { filterRelevantCards, isOverBroadCard } = require("./intelMatch");
const {
  tier3OpenFactsTextSearch,
  tier4WebExtract,
  tier5CategoryPrior,
  dedupeInflight,
} = require("./scoringCascade");
const {
  detectCategoryFast,
  classifyCategory,
} = require("./categoryClassifier");
const {
  callClaudeVisionIdentify,
  putIdentification,
  getIdentification,
  reconcileIngredients,
} = require("./visionContract");
// Vision contract v2 — label-truth enforcement via identify-then-cascade.
// OFF by default; Railway env toggles without redeploy (process.env is read
// per-request). See CLAUDE.md "Vision Contract v2" when documented.
const isVisionContractV2 = () =>
  String(process.env.VISION_CONTRACT_V2 || "").toLowerCase() === "true";
// Alias: all existing sync call sites (cache key generation, warm cache,
// admin reload, fuzzy calibration) use detectCategoryFast via this name.
// Scoring-time callers await classifyCategory() explicitly for AI-quality
// categorization. See CLAUDE.md "Category detection" — the sync/async split
// keeps cache-key generation cheap while AI only runs on the scoring path.
const detectCategory = detectCategoryFast;

// ── FLAG DETECTION FEATURE FLAG ────────────────────────────────
// Toggles the flagDetection integration off without a redeploy. Set
// FLAG_DETECTION_ENABLED=false in Railway to fall back to AI-only behavior.
const FLAG_DETECTION_ENABLED = process.env.FLAG_DETECTION_ENABLED !== "false";

// ── CALIBRATION OVERRIDES ─────────────────────────────────────
const app = express();
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    const allowed = [
      "https://partiqule.com",
      "https://www.partiqule.com",
      "https://partiqule.vercel.app",
      "http://localhost:3000",
      "http://localhost:5173",
      // Capacitor iOS native builds send this origin on WKWebView fetches.
      // Without this entry POST preflight fails and the WKWebView surfaces
      // a bare "TypeError: Load failed" with no status code.
      "capacitor://localhost",
      // Older Capacitor / Ionic fallback — included for safety.
      "ionic://localhost",
    ];
    // Only allow specific Vercel preview deployments from the partiqule project
    // (not any arbitrary .vercel.app subdomain)
    const isPartiquleVercel = allowed.includes(origin) ||
      /^https:\/\/partiqule(-[a-z0-9]+)*\.vercel\.app$/.test(origin);
    if (isPartiquleVercel) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  methods: ["GET","POST","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization","x-admin-key"],
  credentials: true,
}));
app.options("*", cors()); // handle preflight for all routes
app.use((req, res, next) => {
  if (req.path === "/stripe-webhook") return next();
  express.json({ limit: "2mb" })(req, res, next);
}); // images resized to max 1200px ≈ 150-400KB — 2MB is ample

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const scoreCache    = new Map();

// ── REDIS CACHE (Upstash REST — no npm package needed) ────────
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL  || "";
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const REDIS_TTL   = 60 * 60 * 24 * 90; // 90 days in seconds
const hasRedis    = !!(REDIS_URL && REDIS_TOKEN);

const redisGet = async (key) => {
  if (!hasRedis) return null;
  try {
    const r = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const d = await r.json();
    if (d.result) {
      let parsed = JSON.parse(d.result);
      // Fix legacy entries where redisSet stored {value, ex} wrapper
      if (parsed && typeof parsed.value === "string" && parsed.ex) {
        try { parsed = JSON.parse(parsed.value); } catch {}
      }
      return parsed;
    }
  } catch(e) { console.warn("[REDIS] get error:", e.message); }
  return null;
};

const redisSet = async (key, value) => {
  if (!hasRedis) return;
  try {
    // Upstash REST: POST /pipeline with [["SET", key, value, "EX", ttl]]
    await fetch(`${REDIS_URL}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify([["SET", key, JSON.stringify(value), "EX", REDIS_TTL]]),
    });
  } catch(e) { console.warn("[REDIS] set error:", e.message); }
};

const redisKeys = async (pattern) => {
  if (!hasRedis) return [];
  try {
    const r = await fetch(`${REDIS_URL}/keys/${encodeURIComponent(pattern)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const d = await r.json();
    return d.result || [];
  } catch(e) { return []; }
};

// ── FILE CACHE PERSISTENCE (fallback when Redis not configured) ─
const fs   = require("fs");
const path = require("path");
const CACHE_FILE = path.join("/tmp", "partiqule_cache.json");
const CACHE_MAX  = 2000;

const loadCacheFromDisk = () => {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw  = fs.readFileSync(CACHE_FILE, "utf8");
      const data = JSON.parse(raw);
      let loaded = 0;
      for (const [k, v] of Object.entries(data)) {
        scoreCache.set(k, v);
        loaded++;
      }
      console.log(`[CACHE] Loaded ${loaded} entries from disk`);
    } else {
      console.log("[CACHE] No disk cache — starting fresh");
    }
  } catch(e) {
    console.warn("[CACHE] Failed to load from disk:", e.message);
  }
};

const saveCacheToDisk = () => {
  try {
    const entries = [...scoreCache.entries()].slice(-CACHE_MAX);
    const obj     = Object.fromEntries(entries);
    fs.writeFileSync(CACHE_FILE, JSON.stringify(obj), "utf8");
  } catch(e) {
    console.warn("[CACHE] Failed to save to disk:", e.message);
  }
};

// ── UNIFIED CACHE HELPERS ─────────────────────────────────────
// Read: memory first, then Redis, then miss
const cacheGet = async (key) => {
  if (scoreCache.has(key)) return scoreCache.get(key);
  const redisVal = await redisGet(key);
  if (redisVal) {
    scoreCache.set(key, redisVal); // populate memory from Redis
    return redisVal;
  }
  return null;
};

// Write: memory + Redis + disk.
// Skip the Redis + disk write when the result is calibration-direct.
// CALIBRATION.get is an O(1) Map lookup and applyProductCalibration is
// sub-millisecond — caching deterministic-from-calibration results adds a
// Redis round-trip for zero compute saved. Skipping also shrinks the blast
// radius on prompt-version flips: only AI-scored entries become unreachable;
// calibration-direct lookups always rebuild from the in-memory CALIBRATION
// map on demand.
//
// Tier 5 synthetic results already set _skipCache:true for a different
// reason (we want the next visit to retry the cascade). Same flag, both
// reasons.
const cacheSet = (key, value) => {
  if (value && (value._skipCache || value.source === "calibration" || value.ingredient_source === "calibration")) {
    scoreCache.set(key, value); // in-memory only — no Redis, no disk
    return;
  }
  scoreCache.set(key, value);
  redisSet(key, value); // async, non-blocking
  saveCacheToDisk();    // async-ish file write
};

// ── STREAMING RESPONSE HELPER ─────────────────────────────────
// Opt-in chunked JSON streaming for /analyze. Clients send
// Accept: application/x-ndjson and consume via ReadableStream
// (see streamingAnalyze in App.jsx). Clients that don't send the
// header get the legacy single-JSON response — no contract break.
//
// Headers + flushHeaders are deferred until the first emit() or
// complete() so callers can still use res.status(N).json(...) for
// pre-stream errors. Once any emit fires, the response is committed
// and subsequent errors must use errorJson which writes an event:error
// chunk and ends the stream.
function makeStreamHelper(req, res) {
  const wantsStream = (req.headers.accept || "").includes("application/x-ndjson");
  if (!wantsStream) {
    return {
      streaming: false,
      emit: () => {},
      complete: (final) => res.json(final),
      errorJson: (status, body) => res.status(status).json(body),
    };
  }
  let started = false;
  const begin = () => {
    if (started) return;
    started = true;
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Cache-Control", "no-cache, no-store, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
  };
  return {
    streaming: true,
    emit: (event, payload) => {
      begin();
      res.write(JSON.stringify({ event, ...payload }) + "\n");
      if (typeof res.flush === "function") res.flush();
    },
    complete: (final) => {
      begin();
      res.write(JSON.stringify({ event: "complete", ...final }) + "\n");
      res.end();
    },
    errorJson: (status, body) => {
      if (!started) return res.status(status).json(body);
      res.write(JSON.stringify({ event: "error", ...body }) + "\n");
      res.end();
    },
  };
}

// Delete from memory + Redis. Redis del is fire-and-forget.
const cacheDelete = (key) => {
  scoreCache.delete(key);
  if (hasRedis) {
    fetch(`${REDIS_URL}/del/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    }).catch(() => {});
  }
};

// Evict cached results that predate Pass 0 ingredient resolution.
// These entries lack ingredient_source metadata and may contain
// AI-fabricated ingredients (e.g. D5 flagged on a current Armani
// Luminous Silk formula that no longer contains it). Returns true
// if evicted so callers can fall through to fresh scoring.
const evictIfPrePass0 = (cached, key) => {
  if (!cached || cached.ingredient_source) return false;
  log.info("prepass0_cache_eviction", {
    cache_key: key,
    product_name: cached.product_name || null,
    created_at_if_available: cached.ingredient_verified_at || cached.scanned_at || cached.created_at || null,
  });
  cacheDelete(key);
  return true;
};

// Boot sequence — load disk cache, then sync from Redis if available
const initCache = async () => {
  loadCacheFromDisk();
  if (hasRedis) {
    console.log("[REDIS] Connected — syncing top products from Redis...");
    try {
      const keys = await redisKeys("*");
      let synced = 0;
      for (const k of keys.slice(0, 2000)) {
        if (!scoreCache.has(k)) {
          const val = await redisGet(k);
          if (val) { scoreCache.set(k, val); synced++; }
        }
      }
      console.log(`[REDIS] Synced ${synced} products into memory (${scoreCache.size} total)`);
    } catch(e) {
      console.warn("[REDIS] Sync failed:", e.message);
    }
  } else {
    console.log("[REDIS] Not configured — using file cache only");
  }
};

initCache();



// ── STRUCTURED LOGGING ────────────────────────────────────────
// Wraps console.log with JSON output for easier searching/filtering
// in Railway logs. Pass a level, event name, and any structured fields.
// Example: log.info("scan_complete", {product, score, duration_ms, path: "text"})
// Legacy console.log calls still work — this is additive.
const log = {
  info:  (event, data={}) => console.log(JSON.stringify({level:"info",  event, ts:new Date().toISOString(), ...data})),
  warn:  (event, data={}) => console.warn(JSON.stringify({level:"warn",  event, ts:new Date().toISOString(), ...data})),
  error: (event, data={}) => console.error(JSON.stringify({level:"error", event, ts:new Date().toISOString(), ...data})),
};

// ── ADMIN AUTH ────────────────────────────────────────────────
// Two-path admin auth:
//   1) x-admin-key / ?key=  — for curl, scheduled tasks, deploy.sh, preload_redis.js
//   2) Supabase JWT in Authorization: Bearer with email in ADMIN_EMAILS allowlist
//      — for the in-app admin UI, so we never ship a shared secret to the browser
const ADMIN_KEY = process.env.ADMIN_KEY;
if (!ADMIN_KEY) console.warn("[SECURITY] ADMIN_KEY env var not set — key-based admin auth disabled");
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "paul@partiqule.com,sara@partiqule.com")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

const requireAdmin = async (req, res, next) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";

  // Path 1: key
  const key = req.headers["x-admin-key"] || req.query.key;
  if (ADMIN_KEY && key === ADMIN_KEY) {
    log.info("admin_access", { path: req.path, method: req.method, ip, via: "key" });
    return next();
  }

  // Path 2: JWT with allowlisted email
  if (supabaseAdmin) {
    const m = (req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
    if (m) {
      try {
        const { data, error } = await supabaseAdmin.auth.getUser(m[1]);
        const email = data?.user?.email?.toLowerCase();
        if (!error && email && ADMIN_EMAILS.includes(email)) {
          req.adminEmail = email;
          log.info("admin_access", { path: req.path, method: req.method, ip, via: "jwt", email });
          return next();
        }
      } catch {}
    }
  }

  return res.status(401).json({ error: "Unauthorized" });
};

// ── User auth middleware ─────────────────────────────────────
// Verifies a Supabase session JWT from Authorization: Bearer <token>.
// On success, sets req.authUserId to the sub claim from the verified token.
// Use this on any endpoint that grants value (premium, account deletion,
// scan-count increments). Previously these endpoints trusted req.body.userId,
// which let any anonymous caller impersonate any user by guessing their UUID —
// including granting themselves premium via /apple-iap-confirm.
const requireUserAuth = async (req, res, next) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: "Auth not configured" });
  }
  const header = req.headers.authorization || "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: "Missing auth token" });
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(m[1]);
    if (error || !data?.user?.id) {
      return res.status(401).json({ error: "Invalid auth token" });
    }
    req.authUserId = data.user.id;
    req.authEmail  = data.user.email || null;
    next();
  } catch (e) {
    console.warn("[auth] token verify failed:", e?.message);
    return res.status(401).json({ error: "Auth verification failed" });
  }
};

// ── RATE LIMITER — per user (when signed in) or per IP (anonymous) ──
// Prevents one bad IP (coffee shop wifi) from hitting the cap for everyone
// and gives signed-in paid users a higher cap.
const rateLimitMap = new Map();
const RATE_WINDOW  = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_ANON = 20;   // anonymous (per IP) — tighter to prevent shared-wifi exhaustion
const RATE_LIMIT_USER = 40;   // signed-in free user (per userId)
const RATE_LIMIT_PAID = 120;  // signed-in paid user (per userId)
const rateLimit = async (req, res, next) => {
  // Admin key bypasses rate limiting
  const adminKey = req.headers["x-admin-key"] || req.query.key;
  if (ADMIN_KEY && adminKey === ADMIN_KEY) return next();

  // Prefer userId (from body or header) over IP — gives per-user limits
  const userId = req.body?.userId || req.headers["x-user-id"] || null;
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";

  // Determine effective cap — look up subscription status for signed-in users
  let cap = RATE_LIMIT_ANON;
  let key = `ip:${ip}`;
  let who = ip;

  if (userId) {
    key = `user:${userId}`;
    who = `user ${userId.slice(0, 8)}`;
    cap = RATE_LIMIT_USER;
    // Check if paid (non-blocking — safe if supabaseAdmin isn't initialized yet)
    try {
      if (typeof supabaseAdmin !== "undefined" && supabaseAdmin) {
        const { data } = await supabaseAdmin.from("profiles").select("is_subscribed").eq("id", userId).single();
        if (data?.is_subscribed) cap = RATE_LIMIT_PAID;
      }
    } catch {}
  }

  const now = Date.now();
  const rec = rateLimitMap.get(key) || { count: 0, start: now };
  if (now - rec.start > RATE_WINDOW) { rec.count = 0; rec.start = now; }
  rec.count++;
  rateLimitMap.set(key, rec);
  if (rec.count > cap) {
    log.warn("rate_limit_exceeded", {who, cap, count: rec.count, anonymous: !userId});
    return res.status(429).json({
      error: userId
        ? `You've reached your hourly scan limit (${cap}). Please wait a bit before scanning more.`
        : "Too many scans from this network. Sign in for a higher limit, or try again in an hour.",
    });
  }
  next();
};

// ── HELPERS ───────────────────────────────────────────────────

// ── Prompt-version cache prefix ──────────────────────────────────
// Every cache key for an AI-scored result is prefixed with a short hash of
// the Pass 1 / Pass 2 / Vision function source. When any of these prompts is
// edited (voice rules, score guidance, calibration anchors, etc.), the hash
// changes, every previous cache entry becomes unreachable by name, and the
// next request rescore naturally with the current prompt. Old entries age
// out via Redis TTL — no migration needed.
//
// Pass 0 / cascade tier 4 / tier 5 strings live in scoringCascade.js and
// pass0.js. We hash those imported function bodies too so that re-touching
// them also invalidates cache.
//
// Calibration map lookups, Supabase scan lookups, and the productId bypass
// don't go through cacheGet/cacheSet — they're pre-verified data, not Pass
// 1 outputs, and shouldn't be invalidated by prompt edits.
//
// Shared cache-key helpers live in cacheKeys.js so preload_redis.js can
// import the same logic. Previously the preload script had its own
// cacheKey that omitted the promptVersion prefix; preloads were
// orphaned in Redis. Discovered 2026-04-28.
const { promptVersion, cacheKey } = require("./cacheKeys");

// Fuzzy calibration lookup — handles name variations and apostrophes
// "Matt's bakery" matches "matts bakery", "Seventh Generation soap" matches "seventh generation dish"

// ── Prefix index for fast fuzzy lookups ──
// Groups calibration keys by their first 4 characters to avoid full iteration.
// Built once at startup, rebuilt when calibration overrides reload.
let calibrationPrefixIndex = new Map(); // prefix(4) -> [{key, keyNoApos, entry}]
let calibrationAllEntries = [];         // flat list for substring search (phase 4)
function buildCalibrationIndex() {
  calibrationPrefixIndex = new Map();
  calibrationAllEntries = [];
  for (const [k, v] of CALIBRATION.entries()) {
    const kn = k.replace(/'/g, "");
    const entry = { key: k, keyNoApos: kn, entry: v };
    calibrationAllEntries.push(entry);
    // Index by first 4 chars of both key and no-apostrophe key
    for (const str of [k, kn]) {
      if (str.length >= 4) {
        const prefix = str.slice(0, 4);
        if (!calibrationPrefixIndex.has(prefix)) calibrationPrefixIndex.set(prefix, []);
        calibrationPrefixIndex.get(prefix).push(entry);
      }
    }
  }
}
buildCalibrationIndex();

function fuzzyCalibrationLookup(productName) {
  const norm        = normalise(productName);
  const normNoApos  = norm.replace(/'/g, "");

  // 1. Exact match (with and without apostrophes)
  const exact = CALIBRATION.get(norm) || CALIBRATION.get(normNoApos);
  if (exact) return { key: norm, entry: exact };

  // 2. Query starts with a calibration key — use prefix index
  const queryPrefix = norm.slice(0, 4);
  const queryPrefixNoApos = normNoApos.slice(0, 4);
  const candidates = new Set([
    ...(calibrationPrefixIndex.get(queryPrefix) || []),
    ...(calibrationPrefixIndex.get(queryPrefixNoApos) || []),
  ]);
  for (const c of candidates) {
    if (c.key.length >= 4 && (norm.startsWith(c.key) || normNoApos.startsWith(c.keyNoApos))) {
      return { key: c.key, entry: c.entry };
    }
  }

  // 3. Calibration key starts with query — use prefix index on query prefix
  if (norm.length >= 4) {
    for (const c of candidates) {
      if (c.key.startsWith(norm) || c.keyNoApos.startsWith(normNoApos)) {
        return { key: c.key, entry: c.entry };
      }
    }
  }

  // 4. Query contains calibration key as a phrase — full scan (only for long keys)
  for (const c of calibrationAllEntries) {
    if (c.key.length >= 6 && (norm.includes(c.key) || normNoApos.includes(c.keyNoApos))) {
      return { key: c.key, entry: c.entry };
    }
  }

  return null;
}

function cleanProductName(name) {
  if (!name) return "Unknown product";
  if (/^https?:\/\//i.test(name) || name.includes("://") || name.includes("utm_") || name.includes(".com/"))
    return "Scanned product";
  if (name.length > 80) return name.slice(0, 77).trim() + "…";
  const cleaned = name.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}


function extractProductFromUrl(input) {
  const trimmed = input.trim();
  if (!trimmed.startsWith("http") && !/^\d{8,14}$/.test(trimmed)) return null;
  if (/^\d{8,14}$/.test(trimmed)) return `product with barcode ${trimmed}`;
  let pathname = trimmed;
  try { pathname = new URL(trimmed).pathname; } catch { return null; }
  const amazonSlug = trimmed.match(/amazon\.com\/([^/]+)\/dp\//i);
  if (amazonSlug) { const n = amazonSlug[1].replace(/-/g," ").replace(/[^a-zA-Z0-9 ]/g,"").trim(); return n.length>5?n:"Amazon product"; }
  const amazonDp = trimmed.match(/amazon\.com\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  if (amazonDp) return `Amazon product ${amazonDp[1]}`;
  const targetSlug = pathname.match(/\/p\/([^/]+)\/-\//i)||pathname.match(/\/p\/([^/]+)/i);
  if (trimmed.includes("target.com")&&targetSlug) return targetSlug[1].replace(/-/g," ").replace(/[^a-zA-Z0-9 ]/g,"").trim();
  const walmartSlug = pathname.match(/\/ip\/([^/]+)/i);
  if (trimmed.includes("walmart.com")&&walmartSlug) return walmartSlug[1].replace(/-/g," ").replace(/[^a-zA-Z0-9 ]/g,"").trim();
  const segments = pathname.split("/").filter(s=>s.length>3&&!/^\d+$/.test(s));
  const last = segments[segments.length-1]||segments[0];
  if (last) { const n = last.replace(/-|_/g," ").replace(/[^a-zA-Z0-9 ]/g,"").trim(); if(n.length>3) return n; }
  return "Scanned product";
}

// ── CATEGORY SCORE CONTEXT ────────────────────────────────────
// One-line reference range shown below the score on the result card.
// Helps users interpret whether their product is typical for its category.
const CATEGORY_CONTEXT = {
  food:             "Most food products score 3-7",
  food_beverage:    "Most food and drink products score 3-7",
  beverage:         "Most beverages score 3-6",
  snack:            "Most snack products score 4-7",
  supplement:       "Most supplements score 3-6",
  restaurant:       "Most restaurant items score 5-8",
  personal_care:    "Most personal care products score 4-7",
  skincare:         "Most skincare products score 3-7",
  cleaning:         "Most cleaning products score 4-7",
  home:             "Most home products score 4-7",
  clothing:         "Most clothing scores 3-6",
  baby:             "Most baby products score 3-6",
  toy:              "Most toys score 2-5",
  home_furnishing:  "Most home furnishing products score 4-7",
  kitchen:          "Most kitchen products score 3-6",
  accessory:        "Most accessories score 3-6",
  other:            "Scores range from 1 (safest) to 10 (highest concern)",
};

// ── SUBSTANCE REGISTRY ────────────────────────────────────────
// Ingredient-triggered score floors — only activate when AI confirms
// the substance in concerns. Overrides formula output for materials score.
// Sources: EU REACH SVHC (253 entries as of Feb 2026), IARC Monographs,
// EWG Skin Deep, FDA, EPA Safer Choice, NTP, WHO

const SUBSTANCE_FLOORS = [

  // ══════════════════════════════════════════════════════════
  // PFAS / FOREVER CHEMICALS — EU SVHC, EPA Health Advisory
  // ══════════════════════════════════════════════════════════
  { match: /\bPTFE\b|polytetrafluoroethylene|\bteflon\b/i,          mFloor:8, uFloor:7, reason:"PTFE — IARC 2A, PFAS class, banned cookware coating" },
  { match: /\bPFAS\b|perfluoro(?!rm)|perfluoroalkyl|polyfluoroalkyl/i, mFloor:8, uFloor:7, reason:"PFAS forever chemicals — EPA health advisory, carcinogenic" },
  { match: /\bPFOA\b|perfluorooctanoic/i,                            mFloor:9, uFloor:8, reason:"PFOA — IARC Group 1 carcinogen, banned globally" },
  { match: /\bPFOS\b|perfluorooctane.?sulfon/i,                      mFloor:9, uFloor:8, reason:"PFOS — IARC Group 1, persistent, bioaccumulative" },
  { match: /\bGenX\b|hexafluoropropylene oxide/i,                    mFloor:8, uFloor:7, reason:"GenX — PFAS replacement, same toxicity concerns" },
  { match: /\bPFBS\b|perfluorobutane.?sulfon/i,                      mFloor:7, uFloor:6, reason:"PFBS — PFAS class, kidney toxicity" },
  { match: /polytetrafluoro|fluoropolymer/i,                         mFloor:7, uFloor:6, reason:"Fluoropolymer — PFAS class compound" },

  // ══════════════════════════════════════════════════════════
  // PETROLEUM DYES — FDA flagged, IARC classified
  // ══════════════════════════════════════════════════════════
  { match: /Red\s*40|Red\s*3|FD&?C\s*Red|Allura Red|Erythrosine/i,  mFloor:7, uFloor:6, reason:"Red 40/Red 3 — FDA banned Red 3 2025, petroleum dye, carcinogenicity" },
  { match: /Yellow\s*5|Yellow\s*6|FD&?C\s*Yellow|Tartrazine|Sunset Yellow/i, mFloor:7, uFloor:6, reason:"Yellow 5/6 — petroleum dye, hyperactivity (McCann Lancet 2007)" },
  { match: /Blue\s*1|Blue\s*2|FD&?C\s*Blue|Brilliant Blue|Indigo Carmine/i, mFloor:6, uFloor:5, reason:"Blue 1/2 — petroleum dye, FDA review pending" },
  { match: /Green\s*3|FD&?C\s*Green/i,                               mFloor:6, uFloor:5, reason:"Green 3 — petroleum-derived synthetic dye" },
  { match: /titanium dioxide|TiO2|\bE171\b/i,                        mFloor:6, uFloor:5, reason:"Titanium dioxide — IARC Group 2B, EU food ban (E171)" },
  { match: /caramel colou?r.*IV|4-MEI|4-methylimidazole/i,           mFloor:6, uFloor:5, reason:"Caramel Color IV — 4-MEI byproduct, IARC 2B carcinogen" },

  // ══════════════════════════════════════════════════════════
  // PRESERVATIVES — NTP, IARC, EWG flagged
  // IARC Group 1 (nitrites in meat) = mFloor 8
  // IARC Group 2A = mFloor 7
  // IARC Group 2B = mFloor 6
  // ══════════════════════════════════════════════════════════
  // Hydroquinone: FDA proposed ban 2006, reaffirmed concerns. EU banned. DNA damage in studies.
  { match: /\bhydroquinone\b/i,                                        mFloor:7, uFloor:6, reason:"Hydroquinone — FDA proposed ban, EU banned, DNA damage in cell studies, possible carcinogen" },
  { match: /\bTBHQ\b|tert.?butylhydroquinone/i,                      mFloor:6, uFloor:5, reason:"TBHQ — FDA-reviewed immunotoxin, animal carcinogen (NTP)" },
  { match: /\bBHA\b|butylated hydroxyanisole/i,                       mFloor:6, uFloor:5, reason:"BHA — IARC Group 2B, reasonably anticipated carcinogen (NTP)" },
  { match: /\bBHT\b|butylated hydroxytoluene/i,                       mFloor:5, uFloor:4, reason:"BHT — animal carcinogen studies, endocrine disruption" },
  { match: /sodium nitrite|sodium nitrate|nitrite.*preserv/i,         mFloor:8, uFloor:7, reason:"Nitrites — IARC Group 1 carcinogen in processed meat (WHO 2015)" },
  { match: /potassium bromate/i,                                      mFloor:7, uFloor:6, reason:"Potassium bromate — IARC Group 2B, banned EU/UK, used in bread" },
  { match: /propyl gallate/i,                                         mFloor:5, uFloor:4, reason:"Propyl gallate — endocrine disruption, NTP concern" },
  { match: /\bEDTA\b|ethylenediaminetetraacetic/i,                    mFloor:4, uFloor:3, reason:"EDTA — environmental persistence, chelating agent" },
  // Acrylamide — IARC 2A, forms in high-heat starchy foods
  // Acrylamide: IARC Group 2A. Forms in high-heat starchy foods.
  // Floor is 5 for general detection. Restaurant fried items scored higher via calibration.
  // Do NOT apply mFloor:7 to bread, toast, crackers, coffee — dose is orders of magnitude lower.
  { match: /\bacrylamide\b/i,                                         mFloor:5, uFloor:4, reason:"Acrylamide — IARC Group 2A, forms in fried/baked starchy foods at high heat" },

  // ══════════════════════════════════════════════════════════
  // FORMALDEHYDE & RELEASERS — IARC Group 1
  // ══════════════════════════════════════════════════════════
  { match: /\bformaldehyde\b|methylene glycol|formalin/i,             mFloor:7, uFloor:6, reason:"Formaldehyde — IARC Group 1 carcinogen" },
  { match: /\btalc\b|talcum powder/i,                                    mFloor:5, uFloor:5, reason:"Talc — IARC Group 2A (perineal use), J&J ovarian cancer litigation, possible asbestos contamination" },
  // SLS: skin barrier disruptor, sensitizer. Mild floor — notable in leave-on products, less so rinse-off.
  { match: /sodium lauryl sulfate|\bSLS\b/i,                             mFloor:3, uFloor:3, reason:"Sodium Lauryl Sulfate — skin barrier disruption, known irritant, EWG moderate concern" },
  { match: /quaternium.?15/i,                                         mFloor:6, uFloor:5, reason:"Quaternium-15 — formaldehyde releaser, contact allergen" },
  { match: /imidazolidinyl urea|diazolidinyl urea/i,                  mFloor:6, uFloor:5, reason:"Urea preservative — formaldehyde releaser" },
  { match: /2.?bromo.?2.?nitropropane|bronopol/i,                     mFloor:6, uFloor:5, reason:"Bronopol — formaldehyde releaser, nitrosamine precursor" },
  { match: /methenamine|hexamethylenetetramine/i,                     mFloor:5, uFloor:4, reason:"Methenamine — releases formaldehyde in acidic conditions" },

  // ══════════════════════════════════════════════════════════
  // PARABENS — EU banned long-chain, EWG flagged
  // ══════════════════════════════════════════════════════════
  { match: /isobutylparaben|isopropylparaben/i,                       mFloor:6, uFloor:5, reason:"Long-chain parabens — EU banned, endocrine disruptors" },
  { match: /butylparaben|propylparaben/i,                             mFloor:5, uFloor:4, reason:"Long-chain parabens — endocrine disruptors, hormone mimicry" },
  { match: /methylparaben|ethylparaben/i,                             mFloor:4, uFloor:3, reason:"Short-chain parabens — estrogen mimicry, low-level concern" },
  { match: /\bparaben\b/i,                                            mFloor:4, uFloor:3, reason:"Parabens — endocrine disruption class concern" },

  // ══════════════════════════════════════════════════════════
  // PHTHALATES — IARC 2B, endocrine disruptors
  // ══════════════════════════════════════════════════════════
  { match: /\bDEHP\b|di.?2.?ethylhexyl phthalate|dioctyl phthalate/i, mFloor:7, uFloor:6, reason:"DEHP — IARC 2B, reproductive toxin, EU SVHC" },
  { match: /\bDBP\b|dibutyl phthalate/i,                              mFloor:7, uFloor:6, reason:"DBP — EU banned cosmetics, reproductive toxin" },
  { match: /\bBBP\b|benzyl butyl phthalate/i,                         mFloor:7, uFloor:6, reason:"BBP — EU SVHC, endocrine disruptor" },
  { match: /\bDEP\b|diethyl phthalate/i,                              mFloor:6, uFloor:5, reason:"DEP — common in fragrance, endocrine disruption" },
  { match: /\bDIBP\b|diisobutyl phthalate/i,                          mFloor:7, uFloor:6, reason:"DIBP — EU SVHC, reproductive toxin" },
  { match: /\bphthalate\b|phthalic acid ester/i,                      mFloor:6, uFloor:5, reason:"Phthalate — endocrine disruptor class" },

  // ══════════════════════════════════════════════════════════
  // BISPHENOLS — endocrine disruptors
  // ══════════════════════════════════════════════════════════
  { match: /\bBPA\b|bisphenol.?A\b/i,                                 mFloor:7, uFloor:6, reason:"BPA — endocrine disruptor, EU SVHC, banned baby products" },
  { match: /\bBPS\b|bisphenol.?S\b/i,                                 mFloor:6, uFloor:5, reason:"BPS — BPA replacement, same endocrine disruption" },
  { match: /\bBPF\b|bisphenol.?F\b/i,                                 mFloor:6, uFloor:5, reason:"BPF — BPA replacement, hormone disruption" },
  { match: /\bBPAF\b|bisphenol.?AF\b/i,                               mFloor:7, uFloor:6, reason:"BPAF — EU SVHC Feb 2026, reproductive toxin" },
  { match: /\bbisphenol\b/i,                                           mFloor:6, uFloor:5, reason:"Bisphenol compound — endocrine disruption class" },

  // ══════════════════════════════════════════════════════════
  // CHEMICAL UV FILTERS — FDA systemic absorption
  // ══════════════════════════════════════════════════════════
  { match: /oxybenzone|benzophenone.?3/i,                             mFloor:7, uFloor:7, reason:"Oxybenzone — bloodstream after single use (Matta JAMA 2019)" },
  { match: /octinoxate|octyl methoxycinnamate/i,                      mFloor:6, uFloor:6, reason:"Octinoxate — FDA systemic absorption, coral reef harm" },
  { match: /avobenzone/i,                                              mFloor:5, uFloor:5, reason:"Avobenzone — FDA systemic absorption concerns" },
  { match: /homosalate/i,                                              mFloor:5, uFloor:5, reason:"Homosalate — FDA systemic absorption, endocrine disruption" },
  { match: /octisalate|octyl salicylate/i,                             mFloor:5, uFloor:4, reason:"Octisalate — FDA systemic absorption review" },
  { match: /ensulizole|phenylbenzimidazole/i,                          mFloor:5, uFloor:4, reason:"Ensulizole — FDA systemic absorption concern" },

  // ══════════════════════════════════════════════════════════
  // HEAVY METALS — IARC Group 1, neurotoxins
  // ══════════════════════════════════════════════════════════
  { match: /\bmercury\b|thimerosal|thiomersal/i,                       mFloor:9, uFloor:8, reason:"Mercury — IARC Group 1, neurotoxin, banned most cosmetics" },
  { match: /\blead\b|lead acetate|lead compound/i,                     mFloor:8, uFloor:7, reason:"Lead — IARC Group 1, neurotoxin, no safe exposure level" },
  { match: /\bcadmium\b|cadmium compound/i,                            mFloor:8, uFloor:7, reason:"Cadmium — IARC Group 1 carcinogen, kidney toxin" },
  { match: /\barsenic\b|arsenic compound/i,                            mFloor:9, uFloor:8, reason:"Arsenic — IARC Group 1, carcinogenic, groundwater contamination" },
  { match: /\bchromium.?VI\b|hexavalent chromium/i,                    mFloor:8, uFloor:7, reason:"Hexavalent chromium — IARC Group 1 carcinogen" },
  { match: /\bnickel\b(?!.*free)/i,                                    mFloor:6, uFloor:5, reason:"Nickel — IARC Group 1 (inhalation), skin sensitizer" },
  { match: /\bcobalt\b|cobalt compound/i,                              mFloor:6, uFloor:5, reason:"Cobalt — IARC 2A, lung carcinogen in hard metals" },

  // ══════════════════════════════════════════════════════════
  // PLASTIC CHEMICALS IN FOOD CONTACT
  // ══════════════════════════════════════════════════════════
  { match: /\bPVA\b|polyvinyl alcohol.*pod|pod.*polyvinyl|PVA.*film/i, mFloor:6, uFloor:5, reason:"PVA pod film — dissolves into waterways as microplastic" },
  { match: /\bPVC\b|polyvinyl chloride/i,                              mFloor:7, uFloor:6, reason:"PVC — contains plasticizers and stabilizers, leaches at heat" },
  { match: /polystyrene|styrofoam|\bPS\b.*food/i,                      mFloor:6, uFloor:6, reason:"Polystyrene — styrene leaching (IARC 2B), especially hot food contact" },
  { match: /polycarbonate.*food|polycarbonate.*container/i,            mFloor:6, uFloor:5, reason:"Polycarbonate — BPA source, heat increases leaching" },
  { match: /1,?4.?dioxane/i,                                           mFloor:7, uFloor:6, reason:"1,4-Dioxane — contaminant in cosmetics, IARC 2B carcinogen" },
  { match: /styrene|polystyrene/i,                                     mFloor:6, uFloor:5, reason:"Styrene — IARC 2B, neurotoxin, leaches from polystyrene" },

  // ══════════════════════════════════════════════════════════
  // FLAME RETARDANTS — neurotoxins, persistent
  // ══════════════════════════════════════════════════════════
  { match: /\bPBDE\b|polybrominated diphenyl ether/i,                  mFloor:9, uFloor:8, reason:"PBDE — banned, persistent neurotoxin, thyroid disruption" },
  { match: /\bTCEP\b|tris.?2.?chloroethyl.?phosphate/i,               mFloor:8, uFloor:7, reason:"TCEP — IARC 2B carcinogen, endocrine disruptor" },
  { match: /\bTDCPP\b|tris.?1,3.?dichloro.?2.?propyl/i,               mFloor:8, uFloor:7, reason:"TDCPP — IARC 2A carcinogen, California Prop 65" },
  { match: /\bTCPP\b|tris.?chloropropyl.?phosphate/i,                  mFloor:7, uFloor:6, reason:"TCPP — reproductive toxin, EU SVHC" },
  { match: /triphenyl phosphate|\bTPhP\b/i,                            mFloor:7, uFloor:6, reason:"TPhP — EU SVHC Nov 2024, endocrine disruptor" },
  { match: /organophosphate flame|phosphate.*flame retardant/i,        mFloor:7, uFloor:6, reason:"Organophosphate flame retardant — neurotoxin class" },
  { match: /flame retardant(?!.*free)/i,                               mFloor:6, uFloor:5, reason:"Flame retardant — undisclosed type, likely halogenated" },

  // ══════════════════════════════════════════════════════════
  // SYNTHETIC FRAGRANCE & VOCs
  // ══════════════════════════════════════════════════════════
  { match: /synthetic fragrance|artificial fragrance|fragrance.*petroleum|parfum.*synthetic|undisclosed.*fragrance/i, mFloor:5, uFloor:4, reason:"Synthetic fragrance — undisclosed phthalates/VOCs (Steinemann 2017)" },
  { match: /\btoluene\b/i,                                             mFloor:6, uFloor:5, reason:"Toluene — neurotoxin, reproductive harm, IARC 3" },
  { match: /\bbenzene\b/i,                                             mFloor:8, uFloor:7, reason:"Benzene — IARC Group 1 carcinogen, leukemia" },
  { match: /\bxylene\b/i,                                              mFloor:6, uFloor:5, reason:"Xylene — neurotoxin, VOC, reproductive concern" },
  { match: /dibutyl phthalate.*nail|DBP.*nail/i,                       mFloor:7, uFloor:6, reason:"DBP in nail products — reproductive toxin, EU banned" },
  { match: /\bMEK\b|methyl ethyl ketone/i,                             mFloor:5, uFloor:4, reason:"MEK — neurotoxin, eye/respiratory irritant" },

  // ══════════════════════════════════════════════════════════
  // TEXTILE CHEMICALS — EU REACH restricted
  // ══════════════════════════════════════════════════════════
  { match: /azo dye|azo.?dye|aromatic amine.*dye|disperse dye|reactive dye/i, mFloor:6, uFloor:5, reason:"Azo/disperse/reactive dyes — release carcinogenic aromatic amines (EU REACH)" },
  { match: /PFAS.*DWR|DWR.*PFAS|durable water repellent.*fluoro/i,    mFloor:8, uFloor:6, reason:"PFAS DWR coating — forever chemicals on fabric" },
  // Bare-DWR / water-repellent coating floor — catches products where the AI
  // or OFF text mentions DWR or water-repellent without the word "PFAS".
  // Historically all DWR was PFAS-based; a few brands now claim PFAS-free DWR
  // (C0 / non-fluorinated) — the "(?!.free|(?!.*pfas.free))" negative lookahead
  // prevents double-firing when the context already disqualifies fluorinated.
  { match: /\bDWR\b(?!.*(free|pfas.free))|durable water repellent(?!.*(free|pfas.free))|water.repellent (finish|coating|treatment)(?!.*(free|pfas.free))/i, mFloor:6, uFloor:5, reason:"DWR / water-repellent finish — historically PFAS-based unless certified fluorine-free" },
  // Chrome-tanned leather — hexavalent chromium pollution risk, EU REACH
  // under review. Common in conventional leather (Nike Air Force 1,
  // Timberland, Frye, Common Projects, Blundstone, Danner).
  { match: /chrome.?tan(ning|ned)|chromium.?tan|conventional leather/i, mFloor:5, uFloor:4, reason:"Chrome-tanned leather — hexavalent chromium pollution risk" },
  // Silver nanoparticle antimicrobial — EU under regulatory review, leaches
  // into waterways, endocrine concern. Found in activewear antibacterial
  // treatments (Lululemon Silverescent, Mack Weldon Silver, ExOfficio).
  { match: /silverescent|silver nanoparticle|silver.*antimicrobial|polygiene/i, mFloor:6, uFloor:5, reason:"Silver nanoparticle antimicrobial — EU under regulatory review, waterway leaching" },
  { match: /dimethylpolysiloxane|antifoam.*silicone|silicone.*antifoam/i, mFloor:5, uFloor:4, reason:"Dimethylpolysiloxane — silicone antifoaming in frying oils" },
  { match: /nonylphenol|nonylphenol ethoxylate|\bNPE\b/i,              mFloor:7, uFloor:6, reason:"Nonylphenol — EU SVHC, endocrine disruptor, textile processing" },
  { match: /pentachlorophenol|\bPCP\b.*wood|wood.*\bPCP\b/i,           mFloor:8, uFloor:7, reason:"Pentachlorophenol — IARC Group 1, banned textile preservative" },
  { match: /short.?chain chlorinated paraffin|SCCP/i,                  mFloor:7, uFloor:6, reason:"SCCP — EU SVHC, persistent toxic, used in textiles" },
  { match: /dimethyl fumarate|\bDMFu?\b/i,                              mFloor:7, uFloor:6, reason:"Dimethyl fumarate — EU banned in consumer products, severe skin burn" },

  // ══════════════════════════════════════════════════════════
  // SWEETENERS & FOOD ADDITIVES
  // ══════════════════════════════════════════════════════════
  { match: /\baspartame\b/i,                                            mFloor:5, uFloor:4, reason:"Aspartame — IARC Group 2B (2023), WHO ADI concerns" },
  { match: /\bsucralose\b/i,                                            mFloor:4, uFloor:3, reason:"Sucralose — chlorinated compound; 2023 study found genotoxicity markers; gut microbiome disruption" },
  { match: /high.fructose corn syrup|\bHFCS\b/i,                       mFloor:5, uFloor:5, reason:"HFCS — metabolic disease, liver impact, obesity driver" },
  { match: /saccharin/i,                                                mFloor:4, uFloor:3, reason:"Saccharin — historically IARC 2B (downgraded), gut microbiome" },
  { match: /acesulfame.?k|acesulfame potassium/i,                      mFloor:4, uFloor:3, reason:"Acesulfame-K — animal carcinogen studies, gut disruption" },
  { match: /\bcarrageenan\b/i,                                          mFloor:5, uFloor:4, reason:"Carrageenan — intestinal inflammation, WHO concern (food grade)" },
  { match: /sodium benzoate.*ascorbic|ascorbic.*sodium benzoate|sodium benzoate.*vitamin.c|vitamin.c.*sodium benzoate|sodium benzoate.*citric acid|citric acid.*sodium benzoate/i, mFloor:6, uFloor:5, reason:"Sodium benzoate + citric acid (or ascorbic acid / vitamin C) = benzene formation risk (IARC Group 1) in acidic conditions, especially with heat/light exposure" },
  { match: /\bsodium benzoate\b/i,                                      mFloor:4, uFloor:3, reason:"Sodium benzoate — preservative, benzene risk when combined with vitamin C or citric acid" },
  { match: /\bmonosodium glutamate\b|\bMSG\b/i,                         mFloor:4, uFloor:3, reason:"MSG — excitotoxin concerns, FDA GRAS but contested, headache/sensitivity triggers" },
  { match: /brominated vegetable oil|\bBVO\b/i,                         mFloor:6, uFloor:5, reason:"BVO — FDA proposed ban 2023, iodine displacement, organ buildup" },

  // ══════════════════════════════════════════════════════════
  // ANTIMICROBIALS — endocrine disruption, resistance
  // ══════════════════════════════════════════════════════════
  { match: /\btriclosan\b/i,                                            mFloor:6, uFloor:5, reason:"Triclosan — FDA banned soaps 2017, thyroid disruption, antibiotic resistance" },
  { match: /\btriclocarban\b/i,                                         mFloor:6, uFloor:5, reason:"Triclocarban — FDA banned, endocrine disruptor, aquatic toxin" },
  { match: /benzalkonium chloride|\bBAC\b.*antimicro/i,                 mFloor:5, uFloor:4, reason:"Benzalkonium chloride — antimicrobial resistance, irritant" },
  { match: /quaternary ammonium|alkyl dimethyl benzyl|didecyl dimethyl|dialkyl dimethyl ammonium|\bQUAT\b/i,
                                                                         mFloor:5, uFloor:5, reason:"Quaternary ammonium compounds (QACs) — EPA flagged reproductive harm and asthma induction in cleaning products" },

  // ══════════════════════════════════════════════════════════
  // PESTICIDES — EWG Dirty Dozen, PFAS pesticides
  // IARC 2A = mFloor 7 (probable carcinogen, confirmed at measurable levels)
  // ══════════════════════════════════════════════════════════
  // Glyphosate: IARC Group 2A. Floor is 5 (not 7) because context matters.
  // Cheerios (primary oat, confirmed EWG residue, high sugar) → AI scores materials 7 via calibration.
  // Kashi (oats are 1 of 7+ grains, Non-GMO, high fiber) → AI scores materials 3 via calibration.
  // The floor catches cases where AI misses glyphosate entirely. Calibration sets the right level.
  { match: /\bglyphosate\b/i,                                           mFloor:5, uFloor:4, reason:"Glyphosate — IARC Group 2A probable carcinogen" },
  { match: /\bchlorpyrifos\b/i,                                         mFloor:7, uFloor:6, reason:"Chlorpyrifos — EPA banned 2021, children's neurotoxin" },
  { match: /\batrazine\b/i,                                             mFloor:7, uFloor:6, reason:"Atrazine — endocrine disruptor, banned EU, water contaminant" },
  { match: /\bneonicotinoid\b|imidacloprid|clothianidin|thiamethoxam/i, mFloor:6, uFloor:5, reason:"Neonicotinoid pesticide — bee colony collapse, systemic in crops" },
  { match: /PFAS.*pesticide|pesticide.*PFAS|fluoro.*pesticide/i,       mFloor:7, uFloor:6, reason:"PFAS-based pesticide — EWG 2026, 63% Dirty Dozen residues" },

  // ══════════════════════════════════════════════════════════
  // SOLVENTS & PROCESSING CHEMICALS
  // ══════════════════════════════════════════════════════════
  { match: /\bn-hexane\b/i,                                             mFloor:6, uFloor:5, reason:"n-Hexane — EU SVHC Feb 2026, neurotoxin (peripheral neuropathy)" },
  { match: /methylene chloride|dichloromethane|\bDCM\b/i,              mFloor:8, uFloor:7, reason:"Methylene chloride — IARC Group 1, carcinogen, EPA restricted" },
  { match: /carbon tetrachloride/i,                                     mFloor:7, uFloor:6, reason:"Carbon tetrachloride — IARC Group 2B, liver carcinogen" },
  { match: /\bperchloroethylene\b|tetrachloroethylene|\bPCE\b/i,       mFloor:7, uFloor:6, reason:"Perchloroethylene — IARC Group 1, dry cleaning solvent" },
  { match: /vinyl chloride/i,                                           mFloor:9, uFloor:8, reason:"Vinyl chloride — IARC Group 1, liver cancer (PVC precursor)" },
  { match: /ethylene oxide/i,                                           mFloor:9, uFloor:8, reason:"Ethylene oxide — IARC Group 1, breast cancer, used in sterilization" },

  // ══════════════════════════════════════════════════════════
  // HAIR DYE CHEMICALS
  // ══════════════════════════════════════════════════════════
  { match: /p-phenylenediamine|PPD|paraphenylenediamine/i,              mFloor:6, uFloor:6, reason:"PPD — IARC 3 carcinogen, common hair dye allergen/sensitizer" },
  { match: /resorcinol.*hair|hair.*resorcinol/i,                        mFloor:6, uFloor:5, reason:"Resorcinol in hair dye — thyroid disruption, skin sensitizer" },
  { match: /lead acetate.*hair|hair.*lead acetate/i,                   mFloor:8, uFloor:7, reason:"Lead acetate in hair dye — IARC Group 1 lead compound" },
  { match: /aminophenol|2.?aminophenol|4.?aminophenol/i,               mFloor:6, uFloor:5, reason:"Aminophenol — IARC Group 2B, hair dye chemical" },

  // ══════════════════════════════════════════════════════════
  // MICROPLASTICS
  // ══════════════════════════════════════════════════════════
  { match: /microplastic|microbead|polyethylene.*bead|polypropylene.*bead/i, mFloor:6, uFloor:6, reason:"Microplastics/microbeads — direct ingestion/absorption, bioaccumulation" },
  { match: /microfiber.*shed|shed.*microfiber|microfiber.*pollut|microplastic.*shed|shed.*microplastic|fiber shedding/i, mFloor:6, uFloor:5, reason:"Microfiber shedding — ocean contamination, food chain entry" },

  // ══════════════════════════════════════════════════════════
  // POLYCHLORINATED COMPOUNDS
  // ══════════════════════════════════════════════════════════
  { match: /\bPCB\b|polychlorinated biphenyl/i,                        mFloor:9, uFloor:8, reason:"PCBs — IARC Group 1, banned, persistent organic pollutant" },
  { match: /\bPCDD\b|\bdioxin\b/i,                                     mFloor:9, uFloor:8, reason:"Dioxins — IARC Group 1, most toxic known compounds" },
  { match: /chlorinated paraffin/i,                                    mFloor:7, uFloor:6, reason:"Chlorinated paraffins — EU SVHC, PBT substance" },

];

// Apply substance floors based on what AI actually found in concerns
// Phrases that indicate speculation — floors should NOT fire on these
const HEDGED_PHRASES = [
  "may contain", "might contain", "could contain", "possibly contain",
  "potential", "speculative", "if present", "suspected", "unconfirmed",
  "possible trace", "trace amount", "not confirmed", "unclear whether",
];

// Phrases that NEGATE a substance — "no glyphosate" should not trigger glyphosate floor
const NEGATION_PHRASES = [
  "no glyphosate", "glyphosate free", "glyphosate-free",
  "no synthetic pesticide", "usda organic", "certified organic",
  "no artificial", "free of", "does not contain", "free from",
  "no added", "without ", "not present", "non-gmo", "no pfas",
  "pfas-free", "bpa-free", "no bpa", "no bht", "no bha", "no tbhq",
];

// Food category sets — used by substance floors, positive ceilings, and alternative filters
const FOOD_CATEGORIES_SET = new Set(["food", "beverage", "restaurant", "supplement", "food_beverage"]);
const NON_FOOD_CATEGORIES_SET = new Set(["clothing", "personal_care", "toy", "accessory", "home", "baby", "kitchen", "home_furnishing", "other"]);

// ── DETERMINISTIC FLAG DETECTION HELPERS ──────────────────────
// Build the prompt section that hands deterministic findings to the AI. The AI
// cannot claim a listed substance is absent — scoring must incorporate them.
function buildDeterministicFlagSection(flags) {
  if (!FLAG_DETECTION_ENABLED) return "";
  if (!flags || !flags.summary || flags.summary.length === 0) return "";
  return `\nDETERMINISTIC FLAGS DETECTED: ${flags.summary.join(", ")}\nThese substances are confirmed present in the ingredient list. Your scoring must incorporate these findings. You cannot claim the product is free of any substance listed above.\n`;
}

// Runs deterministic detection against AI-returned ingredients plus any pre-AI
// ingredient text (OFF barcode, web search). Validates AI substance claims,
// logs divergence, and merges deterministic findings into p1 so downstream
// scoring (applySubstanceFloors, result shaping) sees them.
function applyFlagDetectionToP1(p1, preIngredientText, category, ctx) {
  if (!FLAG_DETECTION_ENABLED || !p1) return null;

  const aiIngredientText = Array.isArray(p1.ingredient_list) ? p1.ingredient_list.join(", ") : "";
  const combinedText = [preIngredientText || "", aiIngredientText].filter(Boolean).join("\n");
  if (!combinedText.trim()) return null;

  const effectiveCategory = p1.category || category || null;
  const deterministic = detectDeterministicFlags(combinedText, effectiveCategory);

  const aiSubstances = [
    ...(Array.isArray(p1.harmful_chemicals) ? p1.harmful_chemicals : []),
    ...(Array.isArray(p1.materials?.concerns) ? p1.materials.concerns : []),
  ];
  const validation = validateDeterministicFlags(aiSubstances, deterministic);

  // Only log when deterministic found something AI missed. extraInAI is
  // typically AI narrative concerns the deterministic layer cannot evaluate.
  if (validation.missingFromAI.length > 0) {
    console.log("[flag_detection_override]", JSON.stringify({
      context: ctx || "scan",
      product: p1.product_name || null,
      category: effectiveCategory,
      ai_claimed: aiSubstances,
      deterministic_found: deterministic.summary,
      missing_from_ai: validation.missingFromAI,
      extra_in_ai: validation.extraInAI,
    }));
  }

  const merged = mergeDeterministicFlags(aiSubstances, deterministic);
  p1.harmful_chemicals = merged;

  // Append any deterministic findings the AI didn't mention to raw_concerns so
  // applySubstanceFloors picks them up. Floor triggers read raw_concerns text.
  if (validation.missingFromAI.length > 0) {
    const rawConcerns = Array.isArray(p1.raw_concerns) ? [...p1.raw_concerns] : [];
    for (const missing of validation.missingFromAI) {
      rawConcerns.push(`${missing} (deterministic detection)`);
    }
    p1.raw_concerns = rawConcerns;
  }

  return { deterministic, validation, merged };
}

// Apply substance floors directly to a raw ingredient text string (e.g. from Open Food Facts).
// Used by the barcode endpoint BEFORE the AI runs, so code-enforced floors are honored
// regardless of what the AI says about the ingredient list.
function applySubstanceFloorsToText(ingredText) {
  if (!ingredText) return { mFloor: 0, uFloor: 0, triggered: [] };
  const text = ingredText.toLowerCase();

  // Respect the natural-colorant override (same rule used by the vision prompt)
  const NATURAL_COLORANT_PATTERN = /colored? with (vegetable|fruit|plant)|vegetable (juice|extract|color)|fruit (juice|extract|color)|beet(root)? (juice|powder|extract|color)|turmeric (color|extract|powder)|spirulina (extract|color)|annatto (extract|color)|carrot (juice|extract|color)|natural color from|colors? from (nature|plants?|fruits?|vegetables?)|plant.based color|carotenoid|lycopene|chlorophyll|butterfly pea|black carrot|red cabbage|paprika extract/i;
  const hasNaturalColorants = NATURAL_COLORANT_PATTERN.test(text);
  const hasPetroleumDyes    = /red\s*40|yellow\s*5|yellow\s*6|blue\s*1|blue\s*2|fd&?c|allura red|tartrazine|sunset yellow|brilliant blue/i.test(text);

  let mFloor = 0, uFloor = 0;
  const triggered = [];

  for (const rule of SUBSTANCE_FLOORS) {
    // Skip petroleum-dye rules when only natural colorants are present
    if (hasNaturalColorants && !hasPetroleumDyes &&
        (rule.reason.includes("Red 40") || rule.reason.includes("Yellow 5") || rule.reason.includes("Blue 1") || rule.reason.includes("petroleum dye"))) {
      continue;
    }
    if (rule.match.test(text)) {
      if (rule.mFloor > mFloor) mFloor = rule.mFloor;
      if (rule.uFloor > uFloor) uFloor = rule.uFloor;
      triggered.push(rule.reason);
    }
  }
  return { mFloor, uFloor, triggered };
}

// NOVA group hard floor/ceiling for food and beverage products.
// Applied post-calibration in the barcode path. Text and vision paths rely
// on prompt-level enforcement because NOVA group isn't resolved upstream.
// Current philosophy (see CLAUDE.md "NOVA scoring floors"):
//   NOVA 1 ceiling 3 — whole foods stay clean
//   NOVA 3 floor 4   — processed carries inherent concern
//   NOVA 4 floor 7   — ultra-processed is a real concern, not moderate
// Traditional fermented foods (miso, kimchi, kefir, sauerkraut, tempeh) are
// NOVA 3 but get a calibration-level exemption down to 2-3.
function novaBounds(novaGroup, category) {
  const empty = { floor: 0, ceiling: 10 };
  if (!novaGroup) return empty;
  if (category !== "food" && category !== "beverage" && category !== "food_beverage") return empty;
  if (novaGroup === 1) return { floor: 0, ceiling: 3 };
  if (novaGroup === 3) return { floor: 4, ceiling: 10 };
  if (novaGroup === 4) return { floor: 7, ceiling: 10 };
  return empty; // NOVA 2 scored by composition
}
// Back-compat alias — older call sites read `novaFloor(...)` as a number.
function novaFloor(novaGroup, category) {
  return novaBounds(novaGroup, category).floor;
}

// ── Deterministic NOVA inference from ingredient text ──
// The barcode path gets nova_group from Open Food Facts. The text and vision
// paths don't have that structured signal — they just have an ingredient
// string. This function looks for hallmark ultra-processing markers in the
// ingredient list and returns a NOVA group so the same floor/ceiling logic
// applies to all three paths.
//
// Motivating case: Abe's Mini Muffins (Chocolate Chip). Barcode path reads
// OFF nova_group=4 and applies floor 7. Vision path pulled ingredients from
// wholefoodsmarket.com via Tier 4, but there's no nova_group in that data,
// so the AI scored 2 based on "non-GMO sugar, no dyes, real chocolate"
// signals. The ingredient list DOES contain the NOVA 4 markers — fortified
// rice milk (vitamin A palmitate, D2, B12, tricalcium phosphate), refined
// oils (canola/safflower/sunflower), and a syrup. This function catches
// those.
//
// Only fires for food/beverage categories. Returns null for everything else,
// and for food/beverage ingredient lists without enough markers to classify.
// Base ultra-processing markers. 2+ hits → NOVA 4. Each represents an
// ingredient that's structurally industrial: emulsifier, sweetener, dye,
// fortification additive, gum, etc.
const NOVA4_MARKERS = [
  /\bsyrup\b/,
  /\bmaltodextrin\b/,
  /\bdextrose\b/,
  /\bhigh fructose corn syrup\b/,
  /\binvert sugar\b/,
  /\bisolat/,
  /\blecithin\b/,
  /mono.{0,3}(and|&).{0,3}diglycerid/,
  /\bxanthan gum\b/,
  /\bguar gum\b/,
  /\bcarrageenan\b/,
  /\bnatural flavor/,
  /\bartificial flavor/,
  /\btricalcium phosphate\b/,
  /\bdicalcium phosphate\b/,
  /\b(vitamin a palmitate|vitamin d2?\b|vitamin b12|vitamin e acetate|niacinamide|riboflavin|thiamin(e)? mononitrate|folic acid|pyridoxine)/,
  /\b(hydrogenated|partially hydrogenated)\b/,
  /\bmodified (food |corn )?starch\b/,
  /\bmaltitol\b/,
  /\bsucralose\b/,
  /\baspartame\b/,
  /\bacesulfame\b/,
  /\binulin\b/,
  /\bautolyzed yeast/,
  /\byeast extract\b/,
  /\b(fd&c|red 40|yellow 5|yellow 6|blue 1|blue 2)\b/,
  /\bbrominated vegetable oil\b/,
  /\bcellulose gum\b/,
  /\bsodium (benzoate|sorbate|stearoyl lactylate|caseinate)\b/,
  /\bpotassium (sorbate|benzoate)\b/,
  /\bdatem\b/,
  /\bpolysorbate\b/,
];

// Protein concentrate/isolate is *structurally* a single mechanical
// extraction, not chemical modification. It's a Monteiro NOVA 4 trait when
// paired with other industrial markers (Quest Bars, Premier Protein) but
// alone — or with only a "natural flavor" — it doesn't justify the floor:7
// clamp. Magic Spoon Cocoa scored 7 under the prior logic via "whey protein
// concentrate + natural flavor" alone; under the new rule it lands ~4-5.
const PROTEIN_CONCENTRATE_MARKER = /\b(soy|whey|pea|rice) protein (isolate|concentrate)\b/;

// Pair-qualifying industrial markers. When PROTEIN_CONCENTRATE_MARKER fires,
// at least one of these must ALSO fire for the protein to count toward NOVA 4.
// Subset of NOVA4_MARKERS — chosen per Paul's spec: "gums, modified starch,
// FD&C dyes, artificial sweeteners, HFCS, emulsifiers (polysorbates,
// mono- and diglycerides)." Natural flavor intentionally NOT in this list —
// it's an industrial marker on its own (still in NOVA4_MARKERS) but not a
// strong-enough signal to convert protein concentrate from NOVA 3 to NOVA 4.
const NOVA4_PROTEIN_PAIR_PARTNERS = [
  // gums
  /\bxanthan gum\b/, /\bguar gum\b/, /\bcellulose gum\b/, /\bcarrageenan\b/,
  // modified starch
  /\bmodified (food |corn )?starch\b/,
  // FD&C dyes
  /\b(fd&c|red 40|yellow 5|yellow 6|blue 1|blue 2)\b/,
  // artificial sweeteners
  /\bsucralose\b/, /\baspartame\b/, /\bacesulfame\b/, /\bmaltitol\b/,
  // HFCS / industrial syrups
  /\bhigh fructose corn syrup\b/, /\binvert sugar\b/, /\bmaltodextrin\b/,
  // emulsifiers
  /\bpolysorbate\b/, /mono.{0,3}(and|&).{0,3}diglycerid/,
  /\bdatem\b/, /\bsodium stearoyl lactylate\b/,
  // hydrogenated oils
  /\b(hydrogenated|partially hydrogenated)\b/,
  // brominated
  /\bbrominated vegetable oil\b/,
];
const NOVA3_ONLY_MARKERS = [
  /\bsugar\b/,
  /\brefined (flour|oil)\b/,
  /\bbrown sugar\b/,
  /\bcane sugar\b/,
];
// ── Ingredient-signal product naming + category inference ──
// Used by the /barcode endpoint when Pass 0 returns a record with no
// product_name (common in OFF/OBF/OPF — anonymous submissions, partial
// data). Both helpers operate on the parsed ingredient_list array.
//
// inferProductTypeFromIngredients returns a generic descriptor like
// "drink mix" or "stainless steel water bottle" so the UI can show
// "Brand drink mix" instead of "Product 697029995037".
//
// inferCategoryFromIngredients returns a category string when the
// ingredient profile is unambiguous. It overrides product-name-based
// detectCategory when that returns "other". Drink mix with sucralose +
// citric acid + sodium benzoate is a beverage even if the name says
// nothing.
function inferProductTypeFromIngredients(ingredientList) {
  if (!Array.isArray(ingredientList) || ingredientList.length === 0) return "";
  const t = ingredientList.join(" ").toLowerCase();
  // Beverage / drink mix signals
  if (/sucralose|aspartame|acesulfame|stevia|monk fruit/.test(t) &&
      /citric acid|sodium citrate|sodium benzoate/.test(t)) return "drink mix";
  if (/carbonated water|sparkling water/.test(t)) return "sparkling beverage";
  if (/electrolyte|sodium chloride.*potassium|magnesium.*potassium/.test(t)) return "electrolyte drink";
  if (/caffeine|guarana|taurine/.test(t) && /sugar|sucralose|stevia/.test(t)) return "energy drink";
  if (/coffee|espresso/.test(t)) return "coffee product";
  if (/black tea|green tea|tea leaves|camellia sinensis/.test(t)) return "tea product";
  // Personal care
  if (/sodium lauryl sulfate|cocamidopropyl betaine|peg-/.test(t)) return "personal care product";
  if (/hydrated silica|sorbitol.*glycerin|fluoride/.test(t)) return "toothpaste";
  // Drinkware / kitchen
  if (/stainless steel.*tritan|tritan.*stainless steel|18\/8 stainless/.test(t)) return "stainless steel water bottle";
  // Snack / food
  if (/wheat flour|enriched flour|enriched wheat/.test(t) && /sugar|corn syrup/.test(t)) return "packaged snack";
  if (/whey protein|soy protein|pea protein/.test(t)) return "protein product";
  return "";
}

function inferCategoryFromIngredients(ingredientList) {
  if (!Array.isArray(ingredientList) || ingredientList.length === 0) return null;
  const t = ingredientList.join(" ").toLowerCase();
  // Beverage signals — at least 2 markers needed to flip category from "other"
  let beverageHits = 0;
  for (const sig of [
    /\bsucralose\b/, /\baspartame\b/, /\bacesulfame\b/, /\bstevia\b/,
    /\bsodium benzoate\b/, /\bcitric acid\b/, /\bsodium citrate\b/,
    /\bcarbonated water\b/, /\bsparkling water\b/, /\bcaffeine\b/, /\btaurine\b/,
    /\bhigh fructose corn syrup\b/, /\bcorn syrup\b/, /\bhfcs\b/,
    /\belectrolyte\b/, /\bcoconut water\b/, /\bjuice\b/, /\btea leaves\b/,
  ]) if (sig.test(t)) beverageHits++;
  if (beverageHits >= 2) return "beverage";
  // Personal care signals
  let pcHits = 0;
  for (const sig of [
    /\bsodium lauryl sulfate\b/, /\bsls\b/, /\bcocamidopropyl betaine\b/,
    /\bpeg-/, /\bphenoxyethanol\b/, /\bglycerin\b/, /\bhyaluronic acid\b/,
    /\bniacinamide\b/, /\bsalicylic acid\b/, /\bbenzoyl peroxide\b/,
    /\bhydrated silica\b/, /\bfluoride\b/,
  ]) if (sig.test(t)) pcHits++;
  if (pcHits >= 2) return "personal_care";
  // Cleaning / home
  let homeHits = 0;
  for (const sig of [
    /\bquaternary ammonium\b/, /\bsodium hypochlorite\b/, /\bbleach\b/,
    /\bammonia\b/, /\bhydrogen peroxide\b/, /\bsurfactant blend\b/,
    /\bdisinfect/,
  ]) if (sig.test(t)) homeHits++;
  if (homeHits >= 2) return "home";
  return null;
}

function inferNovaGroupFromIngredients(ingredientText, category) {
  if (category !== "food" && category !== "beverage" && category !== "food_beverage") return null;
  const t = String(ingredientText || "").toLowerCase();
  if (!t || t.length < 10) return null;
  const hits = [];
  for (const re of NOVA4_MARKERS) if (re.test(t)) hits.push(re.source);
  // Protein-concentrate handling: structurally a single mechanical extraction.
  // Counts toward NOVA 4 ONLY when paired with at least one industrial marker
  // (gums, modified starch, dyes, artificial sweeteners, HFCS, emulsifiers).
  // See PROTEIN_CONCENTRATE_MARKER + NOVA4_PROTEIN_PAIR_PARTNERS comments.
  let proteinAddsToNova4 = false;
  if (PROTEIN_CONCENTRATE_MARKER.test(t)) {
    const hasPair = NOVA4_PROTEIN_PAIR_PARTNERS.some(re => re.test(t));
    if (hasPair) {
      proteinAddsToNova4 = true;
      hits.push(PROTEIN_CONCENTRATE_MARKER.source);
    }
  }
  // 2+ ultra-processing markers → NOVA 4. 1 marker → NOVA 3. 0 markers with
  // refined sugar/flour → NOVA 3. Standalone protein concentrate (no pair)
  // contributes a NOVA 3 signal — still ultra-processed by Monteiro, just
  // not floor-7 territory.
  if (hits.length >= 2) return { nova: 4, matches: hits };
  if (hits.length === 1) return { nova: 3, matches: hits };
  if (PROTEIN_CONCENTRATE_MARKER.test(t) && !proteinAddsToNova4) {
    return { nova: 3, matches: [PROTEIN_CONCENTRATE_MARKER.source] };
  }
  for (const re of NOVA3_ONLY_MARKERS) if (re.test(t)) return { nova: 3, matches: [re.source] };
  return null;
}

// ── UNIFIED ALTERNATIVE SERIALIZATION ─────────────────────────
// Every scoring path (text, vision, barcode, fuzzy calibration) converts
// raw DB alternatives into the public-facing shape through this helper.
// Guarantees consistent fields (score, child_score, pregnancy_score) across
// all paths so frontend can rely on the same contract.
function serializeAlternatives(rawAlts, category) {
  return (rawAlts || []).map(p => {
    const altScore   = p.score ?? p.plasticScore ?? 3;
    const altCat     = p.category || category;
    const altName    = p.name || "";
    const altIsChild = detectChildProduct(altName, altCat);
    const altConcernsText = (p.tags || []).join(" ") + " " + (p.material || "");
    const { childScore: altChildScore } = computeChildScore(altScore, altConcernsText, altCat, altName, altIsChild);
    const { pregnancyScore: altPregScore } = computePregnancyScore(altScore, altConcernsText, altCat, altName);
    return {
      id:              p.id || `static-${Math.random().toString(36).slice(2, 8)}`,
      name:            altName,
      brand:           p.brand || "",
      score:           altScore,
      child_score:     altChildScore,
      pregnancy_score: altPregScore,
      material:        p.material || "",
      description:     p.description || "",
      price:           p.price || "",
      affiliateUrl:    p.affiliateUrl,
      imageUrl:        p.imageUrl || null,
      source:          p.source || "static",
    };
  });
}

// Compute child + pregnancy scores from the final score and a flag text.
// Collects flag text from multiple sources (p1 concerns, substance triggers,
// raw ingredient text) so we catch concerns regardless of which path we're in.
function computeSafetyScores(finalScore, category, productName, p1, substanceTriggers = [], extraText = "") {
  const isChild = detectChildProduct(productName, category);
  const computeChild = shouldComputeChildScore(productName, category);
  const flagText = [
    ...(p1?.flagged_substances || []),
    ...(p1?.materials?.concerns || []),
    ...(p1?.concerns || []),
    ...substanceTriggers,
    extraText || "",
  ].filter(Boolean).join(" ");
  const { childScore, childBumps } = computeChild
    ? computeChildScore(finalScore, flagText, category, productName, isChild)
    : { childScore: null, childBumps: [] };
  const { pregnancyScore, pregnancyBumps } = computePregnancyScore(finalScore, flagText, category, productName);
  return { childScore, childBumps, pregnancyScore, pregnancyBumps, isChild };
}

function applySubstanceFloors(mScore, uScore, p1, p2) {
  const concernsArr = [
    ...(p1.product_analysis?.concerns || []),
    ...(p1.materials?.concerns || []),
    ...(p2?.refined_concerns || []),
    ...(p1.raw_concerns || []),
  ];
  const summaryText = (p1.summary || p2?.summary || "").toLowerCase();

  // Build confirmed-only text — strip sentences containing hedged language
  const confirmedSentences = [];
  const allSentences = (JSON.stringify(concernsArr) + " " + summaryText)
    .split(/[.!?;]/)
    .map(s => s.toLowerCase().trim())
    .filter(Boolean);

  for (const sentence of allSentences) {
    const isHedged   = HEDGED_PHRASES.some(hedge => sentence.includes(hedge));
    const isNegated  = NEGATION_PHRASES.some(neg => sentence.includes(neg));
    if (!isHedged && !isNegated) confirmedSentences.push(sentence);
  }
  const confirmedText = confirmedSentences.join(" ");

  let triggered = [];
  for (const rule of SUBSTANCE_FLOORS) {
    if (rule.match.test(confirmedText)) {
      if (mScore < rule.mFloor || uScore < rule.uFloor) {
        mScore = Math.max(mScore, rule.mFloor);
        uScore = Math.max(uScore, rule.uFloor);
        triggered.push(rule.reason);
      }
    }
  }
  return { mScore, uScore, triggered };
}

// ── DUAL SCORING FORMULA ─────────────────────────────────────
// Food/beverage: ingestion-first — ingredients dominate, packaging
// penalizes for food contact, nutrition positives lower score.
// Non-food: contact/environment-first — exposure and sustainability
// carry more weight, packaging less critical.

const FOOD_CATEGORIES    = new Set(["food", "beverage", "restaurant", "supplement", "food_beverage"]);
const NONFOOD_CATEGORIES = new Set(["clothing", "personal_care", "toy", "accessory", "home", "baby", "kitchen", "home_furnishing", "other"]);

// ── 10-CATEGORY SCORING FORMULAS ─────────────────────────────
// Manufacturing removed — too hard to measure consistently and creates false precision.
// Each formula reflects the primary risk pathway for that category.
// Weights are applied server-side as source of truth — AI cannot override.
const CATEGORY_FORMULAS = {
  // FOOD: Ingredients are the story — 90% what you eat, 10% what it comes in
  // Organic spinach in a plastic bag should still score 2. Flag packaging separately.
  food:          { m:0.90, u:0.00, pk:0.10, s:0.00 },
  food_beverage: { m:0.90, u:0.00, pk:0.10, s:0.00 }, // legacy alias

  // BEVERAGE: Ingredients and what you drink matters most — packaging is still real but secondary
  // Cans are clean packaging but shouldn't rescue a bad drink to a false safe score
  beverage:      { m:0.85, u:0.00, pk:0.15, s:0.00 },

  // RESTAURANT: Ingredients are the story — ingredients 90%, packaging 10%
  // Sustainability removed: no per-item sustainability data available for restaurant items
  restaurant:    { m:0.90, u:0.00, pk:0.10, s:0.00 },

  // SUPPLEMENT: Concentrated daily ingestion — ingredients + some packaging leaching
  supplement:    { m:0.65, u:0.25, pk:0.10, s:0.00 },

  // BEAUTY: Leave-on daily skin contact — exposure pathway equals materials
  personal_care: { m:0.45, u:0.45, pk:0.05, s:0.05 },

  // TOYS: Children put toys in mouths — materials and ingestion risk dominate
  toy:           { m:0.50, u:0.40, pk:0.05, s:0.05 },

  // CLOTHING/SHOES: Microfiber shedding into waterways — sustainability earns real weight
  clothing:      { m:0.35, u:0.30, pk:0.00, s:0.35 },

  // ACCESSORIES: Jewelry/bags — environmental footprint matches materials concern
  accessory:     { m:0.40, u:0.25, pk:0.00, s:0.35 },

  // HOME: Inhalation and residue from cleaners/candles/rugs is the primary story
  home:          { m:0.30, u:0.45, pk:0.10, s:0.15 },
  kitchen:       { m:0.30, u:0.45, pk:0.10, s:0.15 }, // kitchen maps to home
  home_furnishing:{ m:0.30, u:0.45, pk:0.10, s:0.15 }, // legacy alias

  // BABY: Most protective formula — what touches developing systems is everything
  baby:          { m:0.55, u:0.40, pk:0.05, s:0.00 },

  // FALLBACK
  other:         { m:0.45, u:0.30, pk:0.10, s:0.15 },
};

function computeScore(mScore, uScore, pkScore, sScore, category) {
  const f = CATEGORY_FORMULAS[category] || CATEGORY_FORMULAS.other;
  return Math.min(10, Math.max(1,
    Math.round(mScore*f.m + uScore*f.u + pkScore*f.pk + sScore*f.s)
  ));
}

// Helper: is this a food-type category
function isFoodCategory(category) {
  return FOOD_CATEGORIES.has(category);
}

// ── POST-FORMULA CONSISTENCY CHECKER ─────────────────────────
// Catches hallucinations where AI scores contradict their own labels/reasoning.
// Four rules applied after formula, before caching.
function applyConsistencyChecks(mScore, uScore, pkScore, sScore, finalScore, p1, p2, category, productName) {
  let checked = finalScore;
  const flags = [];

  // 1. LABEL/SCORE CONTRADICTION
  // If AI's own label says "low / minimal / inert / clean" but scored dimension 6+
  const materialsLabel = (p1.materials?.label || "").toLowerCase();
  const usageLabel     = (p1.usage_exposure?.label || "").toLowerCase();
  const summary        = (p1.summary || p2?.summary || "").toLowerCase();
  const lowMaterialsLabel = /natural material|inert|zero.*chemical|no.*harmful|clean.*formula|organic.*only|plant.based only|no.*synthetic/.test(materialsLabel + " " + summary);
  const lowUsageLabel     = /low exposure|minimal exposure|no.*ingestion|no.*contact risk|no.*leach/.test(usageLabel + " " + summary);
  // Skip the materials label contradiction when a deterministic NOVA 4 / ultra-
  // processed signal is present. The AI often labels ultra-processed food as
  // "clean" because the ingredient strings look mild (non-GMO sugar, organic
  // flour), but the deterministic NOVA floor is the right answer and should
  // not be clawed back by a narrative contradiction.
  const rawConcernsBlob = Array.isArray(p1.raw_concerns) ? p1.raw_concerns.join(" ").toLowerCase() : "";
  const isDeterministicUltraProcessed = /nova 4 ultra-processed|nova 4 \(inferred|ultra-processed \(inferred/.test(rawConcernsBlob);
  if (lowMaterialsLabel && mScore > 4 && !isDeterministicUltraProcessed) {
    console.log(`Consistency: materials label says clean but mScore=${mScore} — capping at 4`);
    mScore = Math.min(mScore, 4);
    flags.push("materials_label_contradiction");
  } else if (lowMaterialsLabel && mScore > 4 && isDeterministicUltraProcessed) {
    console.log(`Consistency: materials label says clean but NOVA 4 inferred deterministically — holding mScore=${mScore}`);
  }
  if (lowUsageLabel && uScore > 4) {
    console.log(`Consistency: usage label says low but uScore=${uScore} — capping at 4`);
    uScore = Math.min(uScore, 4);
    flags.push("usage_label_contradiction");
  }

  // 2. DIMENSION SPREAD SANITY CHECK
  // If materials is genuinely clean (1-2) the final score can't be high
  // unless exposure/packaging has a specific documented reason
  if (mScore <= 2 && checked >= 7) {
    console.log(`Consistency: mScore=${mScore} but final=${checked} — investigating`);
    // Recompute with corrected dimensions
    checked = computeScore(mScore, uScore, pkScore, sScore, category);
    flags.push("dimension_spread_anomaly");
  }

  // 3. CONFIDENCE-LINKED CEILING
  // Low confidence = directional estimate only — never implies confirmed harmful substances
  const confidence = p2?.confidence || p1.confidence || "medium";
  if (confidence === "low" && checked > 6) {
    console.log(`Consistency: low confidence but score=${checked} — capping at 6`);
    checked = Math.min(checked, 6);
    flags.push("low_confidence_ceiling");
  }

  // 4. INERT MATERIAL CEILING (glass, ceramic, stainless)
  const allText = JSON.stringify([p1.natural_materials||[], p1.materials||{}, p2||{}]).toLowerCase();
  const isInert = /borosilicate|inert glass|inert ceramic|stainless steel|cast iron/.test(allText + " " + summary);
  if (isInert && mScore > 3) {
    mScore = Math.min(mScore, 3);
    checked = computeScore(mScore, uScore, pkScore, sScore, category);
    flags.push("inert_material_ceiling");
  }
  const noLeach = /no leach|zero leach|inert.*no.*risk/.test(allText + " " + summary);
  if (isInert && noLeach && uScore > 3) {
    uScore = Math.min(uScore, 3);
    checked = computeScore(mScore, uScore, pkScore, sScore, category);
    flags.push("inert_usage_ceiling");
  }

  return { mScore, uScore, pkScore, sScore, finalScore: checked, consistencyFlags: flags };
}

// ── POSITIVE CEILING SYSTEM ───────────────────────────────────
// Floors push dangerous products UP. Ceilings pull clean products DOWN.
// Prevents the AI over-penalising genuinely clean food products.
// Only applies to food/beverage categories.
function applyPositiveCeilings(finalScore, category, p1, p2, substanceTriggered) {
  const isFood = FOOD_CATEGORIES_SET.has(category);
  const isPersonalCare = category === "personal_care";
  const isClothing = category === "clothing";
  if (!isFood && !isPersonalCare && !isClothing) return { finalScore, ceilingFlags: [] };

  const flags = [];
  const allText = JSON.stringify([
    p1.product_analysis || {},
    p1.materials || {},
    p2 || {},
    p1.summary || "",
    p1.raw_concerns || [],
  ]).toLowerCase();

  // Has any dangerous substance floor fired?
  const dangerousSubstanceFired = substanceTriggered.some(t =>
    /red 40|yellow 5|yellow 6|blue 1|bha|tbhq|nitrite|nitrate|petroleum dye|pfas|pfoa|pfos|glyphosate|acrylamide/i.test(t)
  );

  // ── PERSONAL CARE CLEAN CEILING ────────────────────────────────
  // Cap final score at 3 when every signal agrees the product is clean:
  //   1. AI layer: no harmful_chemicals captured, no flagged_substances
  //      containing disqualifier patterns
  //   2. Substance floor layer: no 118-substance hardcoded floor triggered
  //   3. Deterministic flag layer: no concerning narrative/raw_concern text
  //
  // This addresses a systemic narrative/score mismatch (Burt's Bees Tinted
  // Lip Balm 2026-04-23): Pass 1 correctly identifies a clean formulation
  // and writes "benchmark clean lip balm — I'd keep using this one", but
  // without a calibration anchor it defaults to conservative dimension
  // scores of 5, producing an amber "caution" score that contradicts the
  // voice. When three independent layers all agree nothing flags, 3 is a
  // safer ceiling than 5.
  //
  // Disqualifiers are the common personal-care red flags (paraben family,
  // synthetic fragrance, siloxanes, PEGs, petroleum dyes, phthalates,
  // formaldehyde releasers, sulfates, known carcinogens). Natural/plant/
  // essential-oil named fragrance does NOT disqualify — only undisclosed
  // "Parfum" / "Fragrance" does. Matches the NATURAL FRAGRANCE RULE
  // already in the Pass 1 prompt.
  if (isPersonalCare) {
    const hc = Array.isArray(p1.harmful_chemicals) ? p1.harmful_chemicals : [];
    const fs = Array.isArray(p1.flagged_substances) ? p1.flagged_substances : [];
    const pcDisqualifiers = /\b(paraben|methylparaben|propylparaben|butylparaben|ethylparaben|phenoxyethanol|dmdm hydantoin|quaternium-15|diazolidinyl|imidazolidinyl|formaldehyde|cyclopentasiloxane|cyclomethicone|dimethicone|trimethicone|peg-\d|propylene glycol|sodium lauryl sulfate|sodium laureth sulfate|\bsls\b|\bsles\b|oxybenzone|octinoxate|avobenzone|benzophenone|hydroquinone|coal tar|triclosan|\bbha\b|\bbht\b|\btbhq\b|phthalate|dehp|\bdbp\b|diethyl phthalate|red\s*40|yellow\s*5|yellow\s*6|blue\s*1|fd&c|petroleum dye|synthetic fragrance|parfum(?!\s*\()|retinyl palmitate|resorcinol|methylisothiazolinone|\bmit\b)/i;
    const flaggedClean =
      hc.length === 0 &&
      !fs.some(s => pcDisqualifiers.test(String(s || ""))) &&
      !pcDisqualifiers.test(allText);
    const substanceFloorClean = !substanceTriggered.some(t => pcDisqualifiers.test(String(t || "")));
    const hasIngredientList = Array.isArray(p1.ingredient_list) && p1.ingredient_list.length > 0;
    if (flaggedClean && substanceFloorClean && hasIngredientList && finalScore > 3) {
      console.log(`Personal care clean ceiling: capping score from ${finalScore} to 3`);
      finalScore = 3;
      flags.push("personal_care_clean_ceiling");
    }
    // Personal care doesn't use the food-specific ceilings below.
    return { finalScore, ceilingFlags: flags };
  }

  // ── CLOTHING GOTS / OEKO-TEX CLEAN CEILING ─────────────────────
  // Cap final at 3 when the product has a verified organic or clean-textile
  // certification AND no clothing-specific disqualifier fired. Parallel to
  // the food USDA Organic ceiling and personal_care clean ceiling. Known
  // certified-clean clothing brands (Pact, Tentree, Kotn, Little Planet,
  // Hanna Andersson) should land here regardless of what the AI hedged at.
  if (isClothing) {
    const hc = Array.isArray(p1.harmful_chemicals) ? p1.harmful_chemicals : [];
    const fs = Array.isArray(p1.flagged_substances) ? p1.flagged_substances : [];
    const clothingDisqualifiers = /\b(pfas|pfoa|pfos|perfluor|fluoropoly|\bdwr\b|formaldehyde|wrinkle.free|wrinkle.resistant|azo dye|chrome.?tan|silverescent|silver nanoparticle|polygiene|antimicrobial|flame retardant|pbde|tcep|tdcpp|\blead\b|\bpvc\b|vinyl chloride|phthalate)/i;
    const isCertifiedClean =
      /\bgots\b|oeko.?tex|usda.?organic|fair.?trade.?certified|bluesign|cradle.?to.?cradle|\bocs\b|organic content standard/i.test(allText);
    const flaggedClean =
      hc.length === 0 &&
      !fs.some(s => clothingDisqualifiers.test(String(s || ""))) &&
      !clothingDisqualifiers.test(allText);
    const substanceFloorClean = !substanceTriggered.some(t => clothingDisqualifiers.test(String(t || "")));
    if (isCertifiedClean && flaggedClean && substanceFloorClean && finalScore > 3) {
      console.log(`Clothing clean ceiling: capping score from ${finalScore} to 3 (GOTS/OEKO-TEX verified, no disqualifiers)`);
      finalScore = 3;
      flags.push("clothing_clean_ceiling");
    }
    return { finalScore, ceilingFlags: flags };
  }

  // CEILING 1: USDA Organic + no confirmed dangerous substances → cap at 3
  // CRITICAL GUARD: This ceiling only applies to minimally/moderately processed products.
  // Organic Oreos, organic chips, organic candy = still junk food. NOVA 4 organic products
  // should NOT be capped at 3. The ceiling protects genuinely clean organic whole foods.
  // PRECISION: Only fires on confirmed USDA Organic certification — NOT "made with organic"
  // or "contains organic ingredients" which are legally weaker claims.
  const isConfirmedOrganic = /\busda organic\b|certified organic by|organic certified by|100% organic/.test(allText);
  const isUltraProcessed = /ultra.?processed|nova 4|industrial formul|oreo|cookie|chip|candy|pop.tart|fruit snack|gummy|frosted|sugary cereal|sweetened cereal/.test(allText);
  const isAlcohol = /\b(wine|beer|whiskey|vodka|rum|gin|tequila|champagne|ale|lager|stout|cider|spirits|alcoholic|ethanol.*beverage|alcohol.*content)\b/.test(allText);
  if (isConfirmedOrganic && !dangerousSubstanceFired && !isUltraProcessed && !isAlcohol && finalScore > 3) {
    console.log(`Organic ceiling: capping food score from ${finalScore} to 3`);
    finalScore = Math.min(finalScore, 3);
    flags.push("usda_organic_ceiling");
  }

  // CEILING 2: Non-GMO + whole food + no dyes + no synthetic preservatives → cap at 4
  // Same NOVA guard applies — non-GMO junk food is still junk food.
  const isNonGMO = /non.?gmo project verified|non.?gmo certified|non.?gmo verified/.test(allText);
  const hasNoDyes = !/red\s*40|yellow\s*5|yellow\s*6|blue\s*1|blue\s*2|titanium dioxide.*food|petroleum dye|artificial.*color.*dye/.test(allText);
  const hasNoSyntheticPreservatives = !/\bbha\b|\bbht\b|\btbhq\b|sodium benzoate.*vitamin|sodium nitrite|potassium bromate/.test(allText);
  if (isNonGMO && hasNoDyes && hasNoSyntheticPreservatives && !dangerousSubstanceFired && !isUltraProcessed && !isAlcohol && finalScore > 4) {
    console.log(`NonGMO clean ceiling: capping food score from ${finalScore} to 4`);
    finalScore = Math.min(finalScore, 4);
    flags.push("nongmo_clean_ceiling");
  }

  return { finalScore, ceilingFlags: flags };
}


// Children have thinner skin, developing organ systems, lower body weight
// (higher dose per kg), and consume/wear products daily for years.
// Two layers: automatic detection for obvious child products,
// and a client-side toggle for any product.

const CHILD_PRODUCT_PATTERNS = /\b(kids?|children'?s?|child|baby|babies|toddler|infant|newborn|nursery|junior|jr\b|boys?|girls?|youth|pediatric|little ones?)\b/i;

const CHILD_FOOD_BRANDS = /froot loops|fruit loops|lucky charms|cocoa puffs|count chocula|trix cereal|apple jacks|honey smacks|captain crunch|cap'n crunch|cheerios|honey nut cheerios|cinnamon toast crunch.*kids|kix cereal|cocoa krispies|rice krispies treats|gushers|fruit by the foot|lunchables|go-gurt|squeeze applesauce|pediasure|gerber|beech.?nut|happy baby|earth's best/i;

// Substances with specific child developmental concerns — higher weight than adult scoring
const CHILD_CONCERN_SUBSTANCES = [
  { match: /Red\s*40|Yellow\s*5|Yellow\s*6|Blue\s*1|Blue\s*2|titanium dioxide|petroleum dye|artificial.*color(?! from| derived from| of fruit| of vegetable)|artificial.*dye(?! from| of)/i, bump: 2, reason: "Petroleum dyes linked to childhood ADHD and hyperactivity (McCann et al., Lancet 2007) — children are uniquely vulnerable" },
  { match: /glyphosate/i,                          bump: 1, reason: "EWG child-specific glyphosate threshold is lower than adult — body weight adjustment means children receive higher effective dose" },
  { match: /\bPFAS\b|PFOA|PFOS|perfluoro/i,        bump: 2, reason: "PFAS disrupts immune and hormone development in children — CDC flagged as priority child health concern" },
  { match: /phthalate|DEHP|DBP/i,                  bump: 2, reason: "Phthalates disrupt reproductive development — most critical during early childhood (Swan 2021)" },
  { match: /flame retardant|PBDE|TCEP|TDCPP/i,     bump: 2, reason: "Flame retardant neurotoxicity disproportionately affects developing brains (Stapleton 2011)" },
  { match: /synthetic fragrance|artificial fragrance|fragrance.*parfum|\bparfum\b/i, bump: 2, reason: "Undisclosed fragrance chemicals include phthalates and VOCs — children's developing endocrine systems are more sensitive and skin absorption is 2-3x higher than adults" },
  { match: /formaldehyde|DMDM hydantoin|quaternium-15|diazolidinyl urea|imidazolidinyl urea/i, bump: 2, reason: "Formaldehyde and formaldehyde-releasing preservatives — carcinogen with heightened concern for developing respiratory systems in children" },
  { match: /parabens?|methylparaben|propylparaben|butylparaben/i, bump: 1, reason: "Parabens — endocrine disruption concern, developing hormonal systems more vulnerable" },
  { match: /bisphenol|BPA|BPS/i,                   bump: 2, reason: "BPA/BPS endocrine disruption most harmful during developmental windows in childhood" },
  { match: /chlorine.*bleach|chlorine.*pulp|dioxin/i, bump: 1, reason: "Chlorine bleaching byproducts (dioxins) have child-specific developmental endpoints" },
  { match: /polypropylene.*liner|polyester.*skin|synthetic.*liner/i, bump: 1, reason: "Synthetic materials in direct contact with sensitive baby skin — higher absorption rate" },
  // Clothing/home specific
  { match: /azo dye|azo.*color|disperse.*dye|reactive.*dye/i, bump: 2, reason: "Azo dyes can release carcinogenic aromatic amines — banned in EU for skin-contact textiles. Children's skin absorbs at 2-3x adult rate" },
  { match: /DWR|water.*repellent|stain.*resist|C8|C6 fluorocarbon/i, bump: 1, reason: "Durable water repellent (DWR) treatments often contain PFAS — persistent in body and environment, endocrine disruption concern for children" },
  // Candle/home air quality specific
  { match: /paraffin|petroleum wax|mineral.*wax/i,  bump: 1, reason: "Paraffin wax combustion releases VOCs including benzene and toluene — children's developing lungs more vulnerable to airborne toxicants" },
  { match: /synthetic.*fragrance.*candle|fragrance.*oil.*candle|candle.*parfum/i, bump: 2, reason: "Synthetic fragrance in candles releases VOCs when burned — children's lungs are more permeable and developing nervous systems more sensitive to VOC exposure" },
  { match: /lead.*wick|metal.*wick/i,               bump: 3, reason: "Lead core wicks banned in US since 2003 — if present, lead combustion poses severe neurotoxicity risk. Child IQ impacts documented at very low blood lead levels" },
  // Neurotoxicity class — EWG-inspired
  { match: /toluene|xylene|benzene|styrene/i,       bump: 2, reason: "Neurotoxic solvent — children's developing brains are uniquely vulnerable. EPA classifies benzene as known human carcinogen" },
  { match: /1,4-dioxane|ethylene oxide/i,           bump: 2, reason: "1,4-dioxane is a probable carcinogen found as a contaminant in SLES/PEG ingredients — children's lower body weight means higher effective dose" },
  // High added sugar — children's DV is half adults', and early sugar patterns drive lifelong metabolic outcomes
  { match: /high added sugar|>20g added sugar|>15g added sugar|extreme added sugar|sugar.*exceeds.*daily/i, bump: 1, reason: "Added sugar: children's recommended daily limit is 25g (half adult DV) — early high-sugar dietary patterns linked to metabolic and developmental outcomes" },
];

function computeChildScore(baseScore, concernsText, category, productName, isChildProduct) {
  if (!isChildProduct) return { childScore: null, childBumps: [] };

  let bump = 0;
  const bumps = [];

  // Detect confirmed natural/vegetable colorants — these exempt the dye bump
  const NATURAL_COLORANT = /colored? with (vegetable|fruit|plant)|vegetable (juice|extract|color)|fruit (juice|extract|color)|beet(root)? (juice|powder|extract|color)|turmeric (color|extract|powder)|spirulina (extract|color)|annatto (extract|color)|carrot (juice|extract|color)|natural color from|colors? from (nature|plants?|fruits?|vegetables?)|plant.based color|carotenoid|lycopene|chlorophyll|butterfly pea|black carrot|red cabbage|paprika extract/i;
  const hasNaturalColorantsOnly = NATURAL_COLORANT.test(concernsText + " " + productName);
  const hasPetroleumDyes = /Red\s*40|Yellow\s*5|Yellow\s*6|Blue\s*1|Blue\s*2|FD&C|petroleum dye/i.test(concernsText);

  // Always add +1 for child product — developing systems baseline
  bump += 1;
  bumps.push("Children's developing organ systems require more protective thresholds than adult scoring");

  // Check for specific child-concern substances
  for (const concern of CHILD_CONCERN_SUBSTANCES) {
    // Skip the dye bump if only natural colorants confirmed and no petroleum dyes present
    if (hasNaturalColorantsOnly && !hasPetroleumDyes &&
        concern.match.toString().includes("petroleum dye|artificial.*color|artificial.*dye")) {
      continue;
    }
    if (concern.match.test(concernsText)) {
      bump += concern.bump;
      bumps.push(concern.reason);
    }
  }

  // Category-specific bumps
  if (category === "baby") {
    bump += 1;
    bumps.push("Baby products: highest vulnerability — newborn skin is 5x more permeable than adult skin");
  }

  // Clothing bump — children wear fabrics against skin all day, higher absorption
  if (category === "clothing") {
    bump += 1;
    bumps.push("Children's skin absorbs chemicals from fabrics at 2-3x adult rate — daily all-day contact amplifies exposure");
  }

  // Candle/home fragrance bump — children's lungs are more vulnerable to VOCs
  if (category === "home" || category === "home_furnishing") {
    if (/candle|wax|diffuser|air freshener|reed diffuser/i.test(productName + " " + concernsText)) {
      bump += 1;
      bumps.push("Airborne VOCs and fragrance particulates from candles — children's developing lungs and nervous systems more vulnerable to inhalation exposure");
    }
  }

  const childScore = Math.min(10, baseScore + bump);
  return { childScore, childBumps: bumps };
}

function detectChildProduct(productName, category) {
  if (category === "baby" || category === "toy") return true;
  const name = (productName || "").toLowerCase();
  if (CHILD_PRODUCT_PATTERNS.test(name)) return true;
  if (CHILD_FOOD_BRANDS.test(name)) return true;
  return false;
}

// Separate check: should we compute child scores even if not a "child product"?
// Yes — children are exposed to all household products. But only flag is_child_product
// for products specifically targeted at children.
function shouldComputeChildScore(productName, category) {
  if (detectChildProduct(productName, category)) return true;
  return ["food","food_beverage","beverage","restaurant","supplement","personal_care","clothing","home","home_furnishing","kitchen","baby","toy"].includes(category);
}

// ── PREGNANCY SCORING ─────────────────────────────────────────
// Substances with specific pregnancy safety concerns —
// teratogenicity, fetal toxicity, placental transfer, and developmental endpoints.
const PREGNANCY_CONCERN_SUBSTANCES = [
  // Teratogenic vitamin A derivatives — FDA Category X/D
  { match: /\bretinol\b|retinyl palmitate|retinyl acetate|retinaldehyde|tretinoin|isotretinoin|retin-?a\b|retinoid/i, bump: 3, reason: "Retinoids are teratogenic — FDA Category X/D. High-dose vitamin A causes birth defects. Dermatologists universally advise avoiding during pregnancy (Teratology Society 1987)" },
  // Alcohol
  { match: /\bethanol\b|\balcohol\b(?!.*free)|ethyl alcohol/i, bump: 3, reason: "Alcohol crosses the placenta — fetal alcohol spectrum disorders are entirely preventable. No safe level of alcohol in pregnancy has been established (CDC, AAP)" },
  // High-mercury fish
  { match: /\bshark\b|swordfish|king mackerel|tilefish|bigeye tuna/i, bump: 2, reason: "High-mercury fish — methylmercury crosses the placenta and accumulates in fetal brain tissue, impairing neurodevelopment (FDA/EPA 2024 fish advice)" },
  // Moderate mercury
  { match: /albacore tuna|yellowfin tuna|white tuna/i, bump: 1, reason: "Moderate mercury — FDA recommends limiting albacore tuna to 1 serving per week during pregnancy" },
  // Hydroquinone
  { match: /hydroquinone/i, bump: 2, reason: "Hydroquinone has 35-45% systemic absorption through skin — safety in pregnancy not established. Many countries restrict use during pregnancy" },
  // Toluene
  { match: /\btoluene\b/i, bump: 2, reason: "Toluene causes fetal solvent syndrome at high exposures — nail salon workers show elevated miscarriage risk. Avoid during pregnancy (OTIS 2012)" },
  // Formaldehyde and releasers
  { match: /formaldehyde|DMDM hydantoin|quaternium-15|diazolidinyl urea|imidazolidinyl urea/i, bump: 2, reason: "Formaldehyde is a known carcinogen and developmental toxicant — linked to adverse pregnancy outcomes at occupational exposures" },
  // BPA/BPS/BPF
  { match: /bisphenol|BPA|BPS|BPF/i, bump: 2, reason: "Bisphenol A disrupts estrogen signaling — most critical during fetal development. Associated with altered birth weight and early puberty (Braun 2017)" },
  // Phthalates
  { match: /phthalate|DEHP|DBP|DEP|DnBP/i, bump: 2, reason: "Phthalates are anti-androgenic — prenatal exposure linked to altered genital development in male infants (Swan 2005, Environmental Health Perspectives)" },
  // PFAS
  { match: /\bPFAS\b|PFOA|PFOS|perfluoro/i, bump: 2, reason: "PFAS crosses the placenta — associated with reduced birth weight, immune disruption, and altered thyroid function in newborns (Grandjean 2020)" },
  // Chemical UV filters
  { match: /oxybenzone|benzophenone-3|octinoxate|homosalate|octisalate/i, bump: 1, reason: "Chemical UV filters detected in cord blood and breast milk — oxybenzone shows hormonal activity in vitro. FDA requested more safety data in 2019" },
  // Parabens
  { match: /parabens?|methylparaben|propylparaben|butylparaben|ethylparaben/i, bump: 1, reason: "Parabens mimic estrogen and have been detected in cord blood — endocrine disruption concern during fetal development" },
  // Nitrites/nitrates
  { match: /sodium nitrite|sodium nitrate|cured meat|processed meat.*nitrite/i, bump: 1, reason: "Nitrites form nitrosamines — WHO recommends limiting processed meat with nitrites during pregnancy" },
  // Caffeine
  { match: /caffeine|guarana|kola nut/i, bump: 1, reason: "Caffeine crosses the placenta — ACOG recommends under 200mg/day. High intake associated with restricted fetal growth (Chen 2012)" },
  // Contraindicated herbs
  { match: /dong quai|black cohosh|blue cohosh|pennyroyal|tansy|wormwood|mugwort|sassafras/i, bump: 3, reason: "Contraindicated herbs during pregnancy — can stimulate uterine contractions or cause miscarriage (Natural Medicines Comprehensive Database)" },
  // Synthetic fragrance
  { match: /synthetic fragrance|artificial fragrance|fragrance.*parfum|\bparfum\b/i, bump: 1, reason: "Synthetic fragrance contains undisclosed phthalates and VOCs — placental transfer of fragrance chemicals documented (Rudel 2010)" },
  // Salicylic acid
  { match: /salicylic acid/i, bump: 1, reason: "High-dose or large-area topical salicylic acid linked to complications — most dermatologists recommend avoiding in first trimester" },
  // Listeria-risk foods
  { match: /unpasteurized|raw milk|soft cheese|brie\b|camembert|raw sprouts|raw.*fish|sashimi|smoked salmon|\blox\b|deli meat/i, bump: 2, reason: "Listeria risk — listeriosis during pregnancy can cause miscarriage, stillbirth, or severe newborn illness. FDA advises avoiding these foods" },
  // Artificial sweeteners
  { match: /\bsaccharin\b|aspartame|acesulfame/i, bump: 1, reason: "Artificial sweeteners cross the placenta — emerging evidence of altered gut microbiome in offspring. ACOG advises moderation (Azad 2016)" },
  // Spray self-tanners
  { match: /dihydroxyacetone|DHA.*self.?tan|self.?tan.*DHA/i, bump: 1, reason: "DHA in spray self-tanners may be inhaled — inhalation safety during pregnancy not established. Topical application is considered lower risk" },
];

function computePregnancyScore(baseScore, concernsText, category, productName) {
  let bump = 0;
  const bumps = [];

  // Baseline +1 — pregnancy threshold is more protective across all products
  bump += 1;
  bumps.push("Pregnancy mode applies more conservative scoring — the developing fetus is sensitive to chemical exposure at every stage");

  for (const concern of PREGNANCY_CONCERN_SUBSTANCES) {
    if (concern.match.test(concernsText)) {
      bump += concern.bump;
      bumps.push(concern.reason);
    }
  }

  // Supplement category — unregulated, safety during pregnancy often unstudied
  if (category === "supplement") {
    bump += 1;
    bumps.push("Supplements are unregulated — safety during pregnancy is often unstudied. Always consult your OB or midwife before taking any supplement");
  }

  // Personal care — transdermal absorption matters more during pregnancy
  if (category === "personal_care") {
    bump += 1;
    bumps.push("Topical personal care products absorb transdermally — blood levels of ingredients can reach the fetus. Pregnancy warrants more conservative ingredient choices");
  }

  const pregnancyScore = Math.min(10, baseScore + bump);
  return { pregnancyScore, pregnancyBumps: bumps };
}


// Average scores by category — used for peer comparison stat
const CATEGORY_AVERAGES = {
  clothing:       { avg: 5.5, label: "clothing items"         },
  food_beverage:  { avg: 5.8, label: "food and drink items"   },
  personal_care:  { avg: 5.5, label: "personal care items"    },
  kitchen:        { avg: 5.0, label: "kitchen items"          },
  baby:           { avg: 4.8, label: "baby products"          },
  supplement:     { avg: 4.0, label: "supplements"            },
  home_furnishing:{ avg: 5.2, label: "home furnishing items"  },
  other:          { avg: 5.5, label: "consumer products"      },
};

// ── WEB SEARCH FOR PRODUCT DETAILS ───────────────────────────
// Determines if a product needs a web search for accurate material data
function needsSearch(productName) {
  const name = productName.toLowerCase();

  // Skip search for generic/obvious products — we already know what they're made of
  const obvious = [
    "styrofoam","plastic bag","cling wrap","plastic wrap","disposable cup",
    "plastic bottle","plastic straw","zip lock","ziplock","fleece jacket",
    "polyester","nylon","teflon","non-stick","keurig","lipton tea bag",
    "cotton","linen","wool","glass","stainless steel","cast iron","ceramic",
    "wooden spoon","bamboo","wood",
  ];
  if (obvious.some(o => name.includes(o))) return false;

  // Skip for well-known brands where AI already has reliable material knowledge
  // and the product has stable known composition (saves ~500ms + API cost per scan)
  const knownBrands = [
    "pampers","huggies","tide","dawn","cascade","glad","ziploc","bounty",
    "charmin","kleenex","scott","puffs","dove","neutrogena","cetaphil",
    "olay","garnier","loreal","pantene","head and shoulders","old spice",
    "gillette","colgate","crest","oral-b","band-aid","neosporin","tylenol",
    "advil","aleve","nyquil","mucinex","pepto","tums","preparation h",
    "claritin","zyrtec","benadryl","robitussin","listerine","scope",
    "m&m","skittles","oreo","doritos","lay's","lays","pringles","cheetos",
    "fritos","ruffles","tostitos","wheat thins","ritz","triscuit",
    "cheerios","froot loops","lucky charms","captain crunch","frosted flakes",
    "honey bunches","wheaties","total cereal","special k","mini-wheats",
    "quaker oats","nature valley","clif bar","kind bar","rxbar","larabar",
    "red bull","monster energy","gatorade","powerade","sprite","mountain dew",
    "dr pepper","snapple","lipton","arizona tea","vitaminwater","celsius",
    "coca-cola","pepsi","diet coke","diet pepsi","coke zero","pepsi zero",
    "starbucks","dunkin","mcdonald","burger king","wendy","chick-fil-a",
    "taco bell","chipotle","subway","kfc","popeyes","panda express",
    "sweetgreen","panera","olive garden","applebee","chili's","cheesecake factory",
    "dutch bros","jamba juice","smoothie king","pressed juicery",
    "crumbl","nothing bundt","insomnia cookie",
    "starbucks bottled","naked juice","odwalla","tropicana","minute maid",
    "lululemon","nike","adidas","under armour","gap","old navy","zara","h&m",
    "patagonia","north face","columbia","timberland","ugg","crocs","vans",
    "converse","new balance","asics","skechers","birkenstock",
    "ikea","crate and barrel","pottery barn","west elm","target","walmart",
    "amazon basics","kirkland","costco",
  ];
  if (knownBrands.some(b => name.includes(b))) return false;

  // Skip if the query is very short (1-2 words, likely generic)
  const wordCount = name.trim().split(/\s+/).length;
  if (wordCount === 1 && name.length < 8) return false;

  // Search for specific branded products, food items, personal care, and ambiguous queries
  return true;
}

async function searchProductDetails(productName) {
  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      temperature: 0,
      tools: [{
        type: "web_search_20250305",
        name: "web_search",
      }],
      system: "You are a product research assistant. Search for the exact materials, ingredients, and composition of the product. Return only a plain text summary of what the product is made of — no JSON, no markdown.",
      messages: [{
        role: "user",
        content: `Search for: "${productName}" materials composition ingredients what is it made of. Focus on: main material, any plastic components, coating or finish, packaging material. Return a concise 3-5 sentence factual summary of what this product is physically made of.`
      }]
    })
  });

  if (!res.ok) return null;
  const data = await res.json();
  // Extract text from response (may include tool_use blocks)
  const text = data.content
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("").trim();
  return text.length > 20 ? text : null;
}

// ── CLAUDE API CALL ───────────────────────────────────────────
// Robust JSON fixer — handles apostrophes, smart quotes, trailing commas
function fixJson(raw) {
  let s = raw;
  // 1. Smart quotes → straight quotes
  s = s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
  // 2. Trailing commas before } or ]
  s = s.replace(/,(\s*[}\]])/g, '$1');
  // 3. Walk char by char to fix unescaped problem chars inside JSON string values
  let result = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escaped) { result += c; escaped = false; continue; }
    if (c === '\\') { result += c; escaped = true; continue; }
    if (c === '"') { inString = !inString; result += c; continue; }
    if (inString) {
      if (c === "'")  { result += '\\u0027'; continue; }
      if (c === '\n') { result += '\\n';     continue; }
      if (c === '\r') { result += '\\r';     continue; }
      if (c === '\t') { result += '\\t';     continue; }
    }
    result += c;
  }
  return result;
}

// Extract the outermost complete JSON object from a string
// Handles cases where the AI adds text before or after the JSON
function extractJson(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escaped) { escaped = false; continue; }
    if (c === '\\' && inString) { escaped = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (!inString) {
      if (c === '{') depth++;
      if (c === '}') { depth--; if (depth === 0) return text.slice(start, i + 1); }
    }
  }
  return null;
}

// ── API SPEND GUARDRAILS ──────────────────────────────────────
// Hard cap on Claude API calls to prevent runaway costs like the reload incident.
// Override with env vars: API_DAILY_CAP, API_MONTHLY_CAP
const API_DAILY_CAP   = parseInt(process.env.API_DAILY_CAP   || "500");
const API_MONTHLY_CAP = parseInt(process.env.API_MONTHLY_CAP || "5000");
const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL || ""; // Slack/Discord/any webhook
const ALERT_THRESHOLDS = [0.5, 0.8, 0.95]; // fire at 50%, 80%, 95% of daily cap
let apiCallCounts = { day: 0, month: 0, dayKey: "", monthKey: "", alertedToday: [] };

// Fire-and-forget webhook alert. Formats for Slack's incoming webhook format
// but any webhook that accepts {text} will work (including Discord with a tiny tweak).
const fireBudgetAlert = async (pct, used, cap) => {
  if (!ALERT_WEBHOOK_URL) return;
  const emoji = pct >= 0.95 ? "🚨" : pct >= 0.8 ? "⚠️" : "📊";
  const text = `${emoji} Partiqule API usage at ${Math.round(pct * 100)}% — ${used}/${cap} Claude calls today`;
  try {
    await fetch(ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5000),
    });
    console.log(`[ALERT] Sent budget alert: ${text}`);
  } catch (e) {
    console.warn(`[ALERT] Failed to send webhook: ${e.message}`);
  }
};

const loadApiCounts = async () => {
  const now = new Date();
  apiCallCounts.dayKey   = `api_count:${now.toISOString().slice(0,10)}`;
  apiCallCounts.monthKey = `api_count:${now.toISOString().slice(0,7)}`;
  if (hasRedis) {
    try {
      const [d, m] = await Promise.all([redisGet(apiCallCounts.dayKey), redisGet(apiCallCounts.monthKey)]);
      apiCallCounts.day   = typeof d === "number" ? d : (d?.count || 0);
      apiCallCounts.month = typeof m === "number" ? m : (m?.count || 0);
    } catch {}
  }
};
loadApiCounts();

const checkApiBudget = () => {
  const now = new Date();
  const dayKey   = `api_count:${now.toISOString().slice(0,10)}`;
  const monthKey = `api_count:${now.toISOString().slice(0,7)}`;
  if (dayKey !== apiCallCounts.dayKey)     { apiCallCounts.day = 0; apiCallCounts.dayKey = dayKey; apiCallCounts.alertedToday = []; }
  if (monthKey !== apiCallCounts.monthKey) { apiCallCounts.month = 0; apiCallCounts.monthKey = monthKey; }
  if (apiCallCounts.day   >= API_DAILY_CAP)   throw new Error(`API_BUDGET_EXCEEDED: daily cap ${API_DAILY_CAP} reached (${apiCallCounts.day})`);
  if (apiCallCounts.month >= API_MONTHLY_CAP) throw new Error(`API_BUDGET_EXCEEDED: monthly cap ${API_MONTHLY_CAP} reached (${apiCallCounts.month})`);
};

const incrementApiCount = () => {
  apiCallCounts.day++;
  apiCallCounts.month++;
  if (hasRedis) {
    redisSet(apiCallCounts.dayKey,   apiCallCounts.day);
    redisSet(apiCallCounts.monthKey, apiCallCounts.month);
  }
  if (apiCallCounts.day % 50 === 0) {
    log.info("api_budget_checkpoint", {day: apiCallCounts.day, dailyCap: API_DAILY_CAP, month: apiCallCounts.month, monthlyCap: API_MONTHLY_CAP});
  }

  // Check threshold alerts — only fire each threshold once per day
  const pct = apiCallCounts.day / API_DAILY_CAP;
  for (const threshold of ALERT_THRESHOLDS) {
    if (pct >= threshold && !apiCallCounts.alertedToday.includes(threshold)) {
      apiCallCounts.alertedToday.push(threshold);
      log.warn("api_budget_threshold", {threshold, pct, used: apiCallCounts.day, cap: API_DAILY_CAP});
      fireBudgetAlert(pct, apiCallCounts.day, API_DAILY_CAP);
      break;
    }
  }
};

async function callClaude(system, userPrompt, maxTokens=800, retries=3) {
  checkApiBudget();
  incrementApiCount();
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const res = await fetch(ANTHROPIC_API, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "prompt-caching-2024-07-31",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: maxTokens,
          temperature: 0,   // deterministic — same product always same score
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: userPrompt }]
        })
      });
      clearTimeout(timeout);
      // Retry on 429 (rate limit) and 529 (overloaded) with exponential backoff
      if ((res.status === 429 || res.status === 529) && attempt < retries) {
        const wait = Math.min((attempt + 1) * 8000 + Math.random() * 2000, 30000);
        console.log(`Anthropic ${res.status}, retrying in ${Math.round(wait)}ms (attempt ${attempt+1}/${retries})`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const text = data.content.map(b => b.text || "").join("").trim();
      const raw  = extractJson(text);
      if (!raw) {
        console.error("No JSON in response at attempt", attempt, "text snippet:", text.slice(0, 200));
        if (attempt < retries) { await new Promise(r => setTimeout(r, 1500)); continue; }
        throw new Error("No JSON in response");
      }
      try { return JSON.parse(fixJson(raw)); }
      catch(e) {
        console.error("JSON parse failed at attempt", attempt, "raw snippet:", raw.slice(0, 300));
        if (attempt < retries) { await new Promise(r => setTimeout(r, 1000)); continue; }
        throw new Error(`JSON parse error: ${e.message}`);
      }
    } catch(err) {
      clearTimeout(timeout);
      if (err.name === "AbortError") {
        if (attempt < retries) { console.log(`Timeout, retrying (attempt ${attempt+1})`); continue; }
        throw new Error("Request timed out after 25s");
      }
      throw err;
    }
  }
}

// ── PASS 1: DEEP ANALYSIS ─────────────────────────────────────
// Vision pass — identifies product from image AND scores it in one call
async function callClaudeVision(imageBase64, mediaType, retries=3) {
  checkApiBudget();
  incrementApiCount();
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(ANTHROPIC_API, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "prompt-caching-2024-07-31",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
        },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2400,
      temperature: 0,
      system: [{ type: "text", cache_control: { type: "ephemeral" }, text: `You are a senior research scientist specializing in polymer chemistry, toxicology, and consumer product safety. You will be shown a photo of a product label, packaging, clothing tag, or product itself. Read any visible text, brand names, or product names to identify the product, then score it across 5 dimensions. Always respond with raw JSON only — no markdown, no preamble. CRITICAL: Never use apostrophes or single quotes inside JSON string values. Use plain text without contractions.

SCORING RULES:
- PP/PVC in food-contact products (cookware, food storage containers, food packaging, baby bottles, food wraps, reusable water bottles used for hot liquids): materials score 8-9 (NEJM 2024). EXPLICIT EXCEPTIONS — the food-contact rule does NOT apply to: diapers, clothing, baby toys, plastic toys, teething toys, personal care products, or any product where plastic is skin/mouth contact but not used to store/heat food. Score those using their own category calibration. A PP baby teether = materials 5-6 (mouthing concern but not food-contact heating). A polypropylene storage container for hot food = materials 8-9.
- PTFE/PFAS non-stick: materials score 8-9
- Natural materials (wood, glass, stainless, ceramic, organic cotton): materials score 1-2
- ORGANIC KIDS CLOTHING BRANDS (Little Rad Things, Pact Kids, Hanna Andersson, Burt\'s Bees Baby): materials 1-2, final score 1-3
- Single-use disposables: sustainability score 8-9
- Synthetic textiles (polyester, nylon, spandex): materials 5-7, usage 5-7
- Ultra-processed food with synthetic dyes (Red 40, Yellow 5/6, Blue 1, titanium dioxide): materials 8-9, usage 6-7, final 8-9
- NATURAL DYE RULE: Never apply the synthetic dye floor if the label shows natural colorants like vegetable juice, fruit extracts, spirulina, beet juice, turmeric, annatto, or carrot juice. Matt's Bakery, YumEarth, and Unreal use natural colorants — score materials 2-4, never 6+. When in doubt default to natural and do not apply the dye floor.
- NOVA FLOORS AND CEILINGS for food and beverage (enforce these even when the label looks clean): NOVA 1 whole or minimally-processed foods ceiling at 3 (fresh produce, plain grains, nuts, plain yogurt, water). NOVA 3 processed foods floor at 4 (canned beans, aged cheeses, simple breads; traditional fermented foods like miso/kimchi/kefir are 2-3 via calibration only). NOVA 4 ultra-processed floor at 7 — "organic" and "natural" NOVA 4 is still NOVA 4. Escalate within NOVA 4: 7 for minimally-additive (RXBar-style, organic protein bars), 8 with artificial dyes or synthetic preservatives (BHT, BHA, TBHQ) or industrial seed oils as primary, 9 with multiple stacked concerns (HFCS + dyes + partially hydrogenated oils). For summary_short on NOVA 4 products do NOT use softening language like "moderate concern" — say "ultra-processed" directly.
- Chemical sunscreen (oxybenzone, octinoxate): materials 6-7, usage 6-7
- "Reef safe" / "reef friendly" sunscreen claims are UNREGULATED MARKETING — always check actual UV filter ingredients. If oxybenzone or octinoxate is visible, apply the 6-7 floor regardless of reef-safe label.
- Synthetic fragrance in personal care: materials 5-6
- Dyed gummy vitamins or chewable supplements (Red 40, Yellow 5/6): materials minimum 6-7, usage minimum 6. NEVER score a dyed gummy supplement below 5.
- Conventional dryer sheets (Bounce, Downy): materials 6, usage 6 (synthetic fragrance VOCs + quaternary ammonium residue = daily skin contact). NEVER score below 5.

VARIANT HANDLING (image path): When you see a brand name without a clear variant on the label, score the most common/standard version and note in product_name and summary which variant you scored. Never average across variants. If the image shows a specific variant (e.g. "G Zero", "Pampers Pure"), score that exact variant.

ORGANIC LABEL PRECISION (image path): USDA Organic = strong positive, score 1-3. "Made with Organic" = moderate positive, score 2-4. "Contains Organic X" = minor positive, score as conventional. These are legally distinct claims. Never treat partial-organic claims as full USDA Organic certification.

LABEL TRUTH RULE (image path - MANDATORY, takes precedence over all prior brand knowledge): The actual ingredient list visible on the package is GROUND TRUTH. Read what is literally visible on the label. Do NOT add substances based on prior brand reputation or historical formulations. If the label explicitly states "no artificial colors", "no colors from artificial sources", "no artificial flavors", "no HFCS", "no high fructose corn syrup", "no gelatin", "no dyes", or any similar negative claim, those claims are BINDING. Do not flag the negated substances even if you believe the brand historically contained them. Products reformulate constantly (Mott's removed artificial dyes 2020-2021, Kraft Mac and Cheese removed dyes 2016, Kellogg and General Mills have ongoing reformulation programs). Score what is on the package TODAY, not what was on the package five years ago. Never put ingredients in the ingredient_list field that you cannot see on the visible label. If the package shows "Color (Vegetable Juice, Fruit Juice, Annatto Extract, Turmeric Extract)" then THAT is the color source, not Red 40 or Yellow 5. If the current label appears cleaner than expected from historical formulation knowledge, add confidence_note: "Appears reformulated from historical formulation" and score the current formulation. Hallucinating substances that are not visible on the current label is the most serious scoring error possible.

PRODUCT ANALYSIS RULES — populate product_analysis for ALL categories:
COMPOSITION TIERS: tier1=clean/natural/organic, tier2=conventional/standard, tier3=synthetic-heavy/petroleum-based, tier4=high-concern/banned-or-flagged-substances
FOOD tier labels: whole_food|minimally_processed|processed|ultra_processed
PERSONAL CARE tier labels: clean_formula|conventional|synthetic_heavy|high_concern
CLOTHING tier labels: natural_fiber|conventional|synthetic|chemical_treated
KITCHEN tier labels: plant_based|conventional|synthetic_heavy|industrial_chemical
BABY tier labels: clean_safe|conventional|concern_flagged|high_risk_infants
FOOD HIGH concerns: Red 40, Red 3 (banned 2025), Yellow 5/6, Blue 1/2, Titanium dioxide, BHA/BHT, Sodium nitrate, Trans fats, HFCS
PERSONAL CARE HIGH concerns: Oxybenzone/octinoxate (endocrine disruptors, EU restricted), Parabens (endocrine disruption), Formaldehyde releasers (DMDM hydantoin, quaternium-15, diazolidinyl urea — carcinogens), Triclosan (thyroid disruption, banned EU), Phthalates (reproductive toxicity), PFAS in cosmetics (bioaccumulation), Coal tar dyes (carcinogens, EU banned), 1,4-dioxane contamination in SLES/PEG ingredients (probable carcinogen), Methylisothiazolinone/MIT (contact allergen, neurotoxin — EU banned in leave-on products), Lead acetate (neurotoxin — banned EU), Hydroquinone (carcinogen — banned EU leave-on), Resorcinol (thyroid disruptor — EU restricted)
PERSONAL CARE MEDIUM concerns: SLS/SLES (skin irritant, 1,4-dioxane contamination risk), PEG compounds (1,4-dioxane contamination risk), Phenoxyethanol (CNS depression concern at high doses), Synthetic fragrance (undisclosed phthalates/VOCs), BHT in cosmetics (possible endocrine disruptor), Benzophenone (possible carcinogen), Retinyl palmitate (tumor promoter on sun-exposed skin), Talc without asbestos-free certification (IARC Group 2B)
CLOTHING HIGH concerns: PFAS-based DWR coating (perfluoroalkyl compounds — bioaccumulative endocrine disruptors, EU REACH restricted 2023), Formaldehyde finish (carcinogen — EU textile standard EN ISO 14184), Flame retardants PBDE/TCEP/TDCPP (neurotoxins), Carcinogenic azo dyes (EU Directive 2002/61/EC bans 22 azo colorants in textiles), Heavy metal dyes (lead, chromium, cadmium in conventional dyes), Silverescent antimicrobial (silver nanoparticles — EU under regulatory review)
CLOTHING MEDIUM concerns: Conventional synthetic dyes (contact sensitizers), Optical brighteners (skin sensitizer, UV reactive), Nonylphenol ethoxylates (NPE — endocrine disruptor, EU banned in textiles), Chlorine bleaching residues, Synthetic microfiber shedding (700K fibers per wash — Browne 2011)
CLOTHING USAGE: Always populate usage_exposure for clothing. Synthetic activewear with PFAS DWR + antimicrobial = usage 6-7. Include: skin contact duration, microfiber shedding, heat activation of chemical finishes. Never return empty usage concerns for clothing.
HOME HIGH concerns: Paraffin wax combustion VOCs (benzene, toluene — carcinogens), PTFE/PFAS coating (bioaccumulative), BPA/BPS (endocrine disruptors), Quaternary ammonium compounds (reproductive toxicity), Chlorine bleach (respiratory irritant, dioxin byproducts), Synthetic fragrance VOCs (phthalates, toluene), PVC off-gassing (phthalates), Formaldehyde off-gassing (pressed wood, carpet — IARC Group 1 carcinogen)
HOME MEDIUM concerns: Petroleum-based candle wax (VOC combustion byproducts), Synthetic fragrance in candles (VOC release during burning), Lead wicks — banned 2003 but still found in imports
BABY HIGH concerns: Any synthetic fragrance, Talc without asbestos-free certification, Phenoxyethanol (CNS concern — EU limits in baby products), Parabens (endocrine disruption), Phthalates (reproductive toxicity), Formaldehyde releasers, PFAS, Oxybenzone in baby sunscreen
NUTRITION: For ANY food, beverage, supplement, or restaurant product — read the nutrition facts label in the photo if visible, or use known product data. Return per-serving values EXACTLY as listed on the label — use the manufacturer's defined serving size, NOT the whole package total. Populate nutrition with serving_size, calories, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, sodium_mg. Set any unknown fields to null. Set nutrition to null ONLY for non-food products like clothing, home goods, or personal care.` }],
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          { type: "text", text: `Look at this photo. Read the brand name, product name, and visible text to identify the product. Score it across 5 dimensions AND populate product_analysis. Return ONLY this JSON:
{
  "product_name": "brand + product name as shown on label",
  "category": "food|beverage|clothing|personal_care|home|baby|supplement|toy|accessory|restaurant|other",
  "identified_plastics": ["plastic type 1"],
  "harmful_chemicals": [],
  "natural_materials": ["organic cotton"],
  "materials": { "score": 5, "label": "material analysis", "concerns": ["concern"] },
  "usage_exposure": { "score": 5, "label": "usage risk", "frequency": "daily|weekly|occasional|rare", "type": "ingestion|skin_contact|inhalation|mixed", "intensity": "leave-on|rinse-off|single-contact", "vulnerable": false, "concerns": [] },
  "packaging": { "score": 4, "label": "packaging assessment", "primary": "cardboard|glass|plastic|mixed", "refillable": false, "end_of_life": "recyclable|compostable|landfill|unknown", "concerns": [] },
  "sustainability": { "score": 4, "label": "sustainability story", "reusable": false, "replaces_single_use": false, "replaces_count": null, "circularity": "unknown", "concerns": [] },
  "manufacturing": { "score": 5, "label": "manufacturing estimated", "tier": "good|neutral|bad", "confidence": "low", "concerns": [] },
  "product_analysis": {
    "composition_tier": 2,
    "tier_label": "conventional",
    "tier_description": "max 8 words",
    "concerns": [
      {"substance": "substance name", "type": "dye|preservative|sweetener|uv_filter|fragrance|surfactant|coating|fiber|chemical|plasticizer|flame_retardant|additive", "severity": "high|medium|low", "reason": "max 12 words"}
    ],
    "positives": [{"attribute": "positive attribute", "reason": "max 8 words"}],
    "nutrition": null,
    "nutrition_verified": false,
    "confidence": "high|medium|low",
    "confidence_note": "max 10 words"
  },
  "summary_short": "max 30 words, first-person friend voice, plain language, no regulatory jargon",
  "summary_long": "60 to 100 words, research tone with specific regulatory details, lab testing references, brand progress, and historical context",
  "verdict_adult": "single-sentence verdict for general use. Max 18 words, first person, specific, takes a position.",
  "verdict_kid": "single-sentence verdict phrased for a parent scanning for their child. Same facts, kid context. Only populate for food/beverage/supplement/personal_care/clothing/home/home_furnishing/toy/baby categories. Otherwise null.",
  "ingredient_list": ["ingredient 1", "ingredient 2"],
  "raw_concerns": ["concern 1"],
  "confidence": "high|medium|low",
  "confidence_reason": "why",
  "scan_next": ["related product 1"],
  "ai_alternatives": [{"name": "safer alternative", "reason": "why safer", "material": "material", "estimated_score": 2}]
}
NOTE: For ANY food, beverage, supplement, or restaurant product — populate nutrition with values you know or can reasonably confirm. This is non-negotiable for all food categories. Every packaged food sold in the US is required by FDA to display nutrition facts — this data is always publicly available. Populate at minimum sugar_g, sodium_mg, sat_fat_g, and calories for every food product. For restaurant items from major chains, use the chain's published nutrition data. Set nutrition_verified: false if estimating, true only if certain. Set individual fields to null if unknown — partial data is useful. Only set the entire nutrition object to null for non-food products like clothing or home goods.
NOVA 4 NUTRITION RULE: For any NOVA 4 ultra-processed product, you MUST populate at minimum sugar_g, sodium_mg, and calories from the label — this data is publicly available on every packaged food sold in the US. If a NOVA 4 product has added sugars that exceed 20% of daily value (10g+), this must show as a nutrition concern. Nutrition badges showing % DV are a core part of the score for processed foods.
INGREDIENT_LIST RULE: For ALL food, beverage, supplement, and personal care products, populate ingredient_list with the actual ingredients in order as they appear on the label. For food products, this is always publicly available via FDA-required labeling. Return each ingredient as a separate string in the array. If a product has sub-ingredients (e.g. "CHOCOLATE CHIPS (sugar, cocoa butter, chocolate)"), include the parent ingredient only. If you cannot find the ingredient list for a truly obscure product, return an empty array. Never return null for ingredient_list on food products.
SUBSTANCE NAMING RULES: Always name the SPECIFIC chemical in concerns, never a generic category. Write "BHT" not "preservatives". Write "Red 40" not "artificial colors". Write "PTFE coating" not "non-stick chemicals". Write "PFOA" not "PFAS" if you know the specific compound. Write "oxybenzone" not "chemical sunscreen". Never flag "binding agents", "emulsifiers", "natural flavors", or "concentration levels" as concerns — these are not harmful substances. If packaging speculation exists, write it with severity "low" and hedged language. If you know a product's specific ingredients (Altoids has BHT, Chick-fil-A uses TBHQ in frying oil), name them explicitly.
HOT-WATER-PLASTIC FLOOR RULE (CRITICAL): If hot water flows through or contacts plastic during normal use, FINAL SCORE MINIMUM IS 7. Score escalates based on exposure severity. Apply AFTER calibration entries (a calibration override wins). For non-calibrated AI-scored products this floor is enforced.

Severity scale within the rule:
- Score 7 (baseline): simple plastic contact with hot water. Drip coffee maker with plastic reservoir but stainless carafe. Plastic kettle used occasionally.
- Score 8 (worse): hot water passes THROUGH plastic, not just contact. Daily/frequent use. Coffee maker with plastic brew chamber AND plastic carafe. Electric kettle with plastic body used multiple times daily. Plastic French press for hot coffee.
- Score 9 (worse still): pressurized hot water through plastic, single-use plastic waste added to leaching. Nespresso pods, K-cups, pod-based espresso. Single-serve plastic tea bags brewed in hot water.
- Score 10: reserved for additional severe concerns beyond hot-water-plastic (known contaminated brand, recalled product, etc.).

Categories affected (apply 7 minimum, scale up by severity): drip coffee makers with plastic reservoirs or tubing, plastic kettles and electric tea makers, instant hot-water dispensers with plastic spouts, single-serve coffee/tea pods (K-cups, Nespresso, Keurig), plastic travel mugs for hot beverages, baby bottles used with warm/hot formula, French press with plastic components, plastic pour-over cones used with boiling water, any "hot water through plastic" brewing or cooking device.

NOT affected: cold-water plastic (Nalgene used cold, plastic pitchers), plastic containers for room-temperature food, plastic utensils for cold/warm items, plastic items that only touch steam externally without flow-through (slow cooker plastic lid).

When this floor fires, summary_short MUST name the hot-water-plastic concern explicitly while keeping voice rules (first person, short, specific, no hedging).

Examples:
- Mr. Coffee drip machine (score 8): "Plastic water reservoir AND plastic carafe means hot water picks up plastic both in brewing and while sitting. Glass carafe and stainless reservoir would be cleaner. I'd swap if you're a daily coffee drinker."
- K-cups / Keurig pods (score 9): "Pressurized hot water forced through single-use plastic on every brew releases microplastics into your coffee. Plus the pod waste. Refillable stainless pods or a French press skip this entirely."
- Plastic electric kettle (score 8): "Boiling water in plastic is one of the highest-exposure daily habits for microplastic ingestion. A glass or stainless kettle costs about the same. I'd swap."
- Drip coffee maker with stainless carafe (score 7): "Plastic reservoir means hot water still picks up some leaching on the way through. Better than a fully-plastic machine but not as clean as pour-over glass."

SUMMARY VOICE RULE (CRITICAL): summary_short is the friend voice on the simple result screen. summary_long is the research brief on the detail screen. Both must be honest about the SAME facts.

summary_short — REQUIRED:
- Start with the problem or strength, NOT the product name
- Use first person at least once ("I would", "I'd skip", "I like", "if it were me")
- Name specific ingredients or fabric types — no generic categories
- Short sentences, max 18 words each
- 2 to 3 sentences total, 30 words max overall
- Take a position — no hedging
- Include one concrete action ("swap if you can", "fine to keep", "worth the upgrade")

HIGH-SCORE BEHAVIOR (score 1-3) — name the reasons AND explain why each one matters. The reader should walk away understanding what earned this product its score, not just hearing it's "clean".

WORD CAP for score 1-3 is 35 to 50 words (overrides the 30-word general cap above). The expansion is REQUIRED to explain WHY each detail matters — not for rambling, marketing language, or filler.

PATTERN to follow:
[specific quality 1] ([brief why it matters]), [specific quality 2] ([brief why it matters]), and [specific quality 3] ([brief why it matters]). [Optional brand credit]. [Optional first-person endorsement].

Each detail in a high-score summary_short should:
- Name the specific quality choice the brand made (cite ingredients, certifications, testing practices, or absences by name)
- Briefly explain why that choice matters in a parenthetical or short clause (no chlorine residue, no microplastic leaching, no glyphosate residue, no hidden allergen source, no synthetic fragrance, etc.)
- Connect to user benefit when relevant
- Give the brand credit by name when the choice is brand-driven

FORBIDDEN for high-score summary_short:
- Listing qualities without explaining why they matter
- Generic praise ("This is a great product", "Excellent choice")
- Marketing-speak ("premium", "innovative", "thoughtfully crafted")
- Restating the score ("a solid 3 out of 10")
- Low-effort fallbacks: "Looks good to me", "No concerns here", "Low concern", "minimal concern", "This product scored well"

summary_short — FORBIDDEN:
- Restating the product name at the start (already on screen)
- Hedging language ("it depends", "some may", "could potentially")
- "Consumers", "individuals", "users"
- "Overall," as a sentence starter
- Em dashes used as bullets
- Bullet points of any kind
- ppm numbers, lab citations, regulatory body names
- Restating the score number

GOOD summary_short examples:
- Food with dyes (score 7): "The Red 40, Yellow 5 and Blue 1 are the issue here — petroleum dyes linked to behavior effects in kids. I'd swap to the plain Goldfish or a dye-free cheddar cracker."
- Personal care clean (score 2): "Clean formula — no parabens, phthalates, or synthetic fragrance. I'd keep using this one, it's one of the better options on the shelf."
- Clothing synthetic (score 6): "Mostly the fabric — polyester sheds microplastics every wash, and the DWR finish is a PFAS source. I'd save it for workouts and swap in cotton or merino for everyday."
- Food score 8: "The seed oils and TBHQ preservative are doing the damage. If it were me I'd finish the bag and not rebuy — plenty of cleaner chip options now."
- HIGH-SCORE Who Gives a Crap bamboo TP (score 3): "100% bamboo (no tree pulp), unbleached fibers (no chlorine residue), and third-party PFAS testing comes back clean. Subscription model cuts packaging waste too. Who Gives A Crap is doing the work."
- HIGH-SCORE Salt and Stone body lotion (score 2): "Jojoba and shea butter as the actual heavy lifters (not filler), no synthetic fragrance (the #1 hidden allergen source), and no parabens or phthalates. One of my go-to clean skincare brands."
- HIGH-SCORE Dr. Bronner's Castile Soap (score 1): "Organic oils only (coconut, olive, hemp), nothing synthetic, and B Corp certified for sourcing transparency. The label tells you exactly what's in it. Gold standard for clean soap."
- HIGH-SCORE Annie's organic crackers (score 3): "Organic wheat (no glyphosate residue), no artificial dyes, real cheese powder (not cheese flavor), and minimal additives. Annie's is one of the cleaner mainstream kid-snack brands."
- HIGH-SCORE stainless steel kettle (score 1): "All stainless steel construction (no plastic in the water path means no microplastic leaching), and no toxic coatings. Hard to beat this for daily hot water use."

BAD summary_short examples (NEVER produce):
- "Goldfish Colors/Rainbow — petroleum dyes added in colored varieties (Red 40, Yellow 5, Blue 1 confirmed). Dye floors fire. Score higher than original. Stick to original or Whole Grain Goldfish." (restates product name, clinical language, no first person, nonsense phrase)
- "Overall, this product contains some concerning ingredients that consumers should be aware of." (hedging, "consumers", "Overall,", no specifics)
- "This sunscreen uses oxybenzone and octinoxate, which are chemical UV filters that some studies suggest may have endocrine-disrupting potential at certain exposure levels." (one 30-word sentence, hedged, no first person, no action)

summary_long rules stay as before: 60 to 100 words, 3 to 5 sentences, research tone, include regulatory details (EU restrictions, FDA rulings, state bans), lab references when relevant (Mamavation, NEJM, Nature Medicine), brand progress notes with dates, and historical context.

Never soften summary_short to hide what summary_long says.

VERDICT VOICE RULE (CRITICAL):

Generate two verdict variants per scan:

verdict_adult: Standard verdict for general use. First person, specific, takes a position. Voice rules same as summary_short (no hedging, no "Overall,", no restating product name, no consumers/users/individuals). Max 18 words.

verdict_kid: Same score threshold but phrased for a parent scanning for their child. Only populate for categories that can apply to kids: food, beverage, supplement, personal_care, clothing, home, home_furnishing, toy, baby. For other categories (restaurant, accessory, kitchen, other), return null for verdict_kid.

Kid-context framing by score band:

Score 1-3: warm and specific. Adult: "Solid pick.", "Good one to keep around.", "One of the cleaner options out there.", "Hard to beat this one for the category." Kid: "Safe for a kid. Good one for their routine.", "No issues for a kid here. Keep it in rotation.", "Clean enough for daily use with kids." NEVER "Looks good to me" / "No concerns here" — name what made it good.
Score 4-5: "Not ideal for a kid" / "I'd save this for adults" / "Cleaner options exist for kids"
Score 6-7: "I'd skip this for a kid" / "Not for their [snack/daily/regular] rotation" / "Something cleaner would be better for them"
Score 8-10: "Hard skip for a kid" / "Not for the little one" / "I'd pass for kids"

Same voice rules as adult verdicts: first person, specific, short, no hedging. Context is explicitly about the child.

GOOD verdict examples:

Product: Goldfish Colors, score 6
verdict_adult: "I'd pass on this one."
verdict_kid: "I'd skip this for a kid. The original Goldfish skip the dyes."

Product: Salt and Stone body lotion, score 2
verdict_adult: "Clean pick. Good for daily use."
verdict_kid: "Safe for their skin. Good for a kid."

Product: Lululemon Align, score 5
verdict_adult: "Keep these for the gym."
verdict_kid: "Not ideal for a kid. Find cotton basics instead."

Product: Dr. Bronner's Castile Soap, score 1
verdict_adult: "Hard to beat this one for the category."
verdict_kid: "Safe for a kid. Good one for their routine."

Product: Who Gives A Crap bamboo TP, score 3
verdict_adult: "One of the cleaner TP options out there."
verdict_kid: null` }
        ]
      }]
    })
  });
      clearTimeout(timeout);
      if ((res.status === 429 || res.status === 529) && attempt < retries) {
        const wait = Math.min((attempt + 1) * 8000 + Math.random() * 2000, 30000);
        console.log(`Vision ${res.status}, retrying in ${Math.round(wait)}ms (attempt ${attempt+1}/${retries})`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const text = data.content.map(b => b.text || "").join("").trim();
      const raw  = extractJson(text);
      if (!raw) throw new Error("No JSON in vision response");
      try { return JSON.parse(fixJson(raw)); }
      catch(e) {
        if (attempt < retries) { await new Promise(r => setTimeout(r, 1000)); continue; }
        throw new Error(`Vision JSON parse error: ${e.message}`);
      }
    } catch(err) {
      clearTimeout(timeout);
      if (err.name === "AbortError") {
        if (attempt < retries) { console.log(`Vision timeout, retrying (attempt ${attempt+1})`); continue; }
        throw new Error("Vision request timed out");
      }
      throw err;
    }
  }
}

async function pass1(productName, materialContext = null, categoryHint = null, deterministicFlags = null) {
  const contextSection = materialContext
    ? `\nREAL PRODUCT DATA FROM WEB SEARCH (use this as ground truth for materials):\n${materialContext}\n`
    : "";
  const categorySection = categoryHint
    ? `\nCATEGORY HINT: This product has been pre-classified as "${categoryHint}". Use this as your category. Populate the product_analysis field fully using the category-specific concern types.${categoryHint === "restaurant" ? " This is a restaurant menu item — you MUST populate the product_analysis field including nutrition using the chain's official published nutrition data. Set nutrition_verified: true only if you are confident in the exact values, false if estimating." : ""}\n`
    : "";
  const regulatorySection = buildRegulatoryContext(categoryHint || "general");
  const deterministicSection = buildDeterministicFlagSection(deterministicFlags);

  return callClaude(
    `You are a senior research scientist specializing in polymer chemistry, toxicology, consumer product safety, and environmental impact. Your scores are grounded in peer-reviewed science. Always respond with raw JSON only — no markdown, no preamble. CRITICAL: Never use apostrophes or single quotes inside JSON string values. Use plain text without contractions.

KEY RESEARCH FINDINGS:
MICROPLASTICS: Marfella et al. (2024) NEJM: PP found in 58% of carotid plaques — PP/PVC in food-contact products score 8-9 (cookware, food containers, baby bottles). IMPORTANT: this rule applies to FOOD contact only — NOT to diapers, clothing, or personal care products which are skin contact. Diapers score via their own calibration scale. Yan et al. (2024) Nature Medicine: microplastics accumulate in human brain — daily ingestion/inhalation +2 penalty. Landrigan et al. (2025) Lancet Planetary Health: cardiovascular, metabolic and cancer risk confirmed. Amato-Lourenco et al. (2021) THORAX: microplastics found in all regions of human lung tissue. Hernandez (2019): nylon/PET tea bags release billions of particles per cup. Li (2020): heated PP baby bottles release millions of particles per litre.
PFAS: FDA (2024): PTFE/PFAS non-stick = primary dietary exposure — score 8-9, known endocrine disruptors. Sunderland et al. (2019): PFAS linked to thyroid disruption, reduced fertility, elevated cholesterol. Steenland et al. (2018): PFOA linked to kidney and testicular cancer. EWG (2023): PFAS detected in water serving 200M+ Americans.
ENDOCRINE DISRUPTORS: Braun et al. (2021) Endocrine Society: BPA, phthalates, PFAS all confirmed EDCs. Swan et al. (2021): phthalate and BPA exposure linked to reduced fertility. Trasande et al. (2018): EDC exposure costs USD 163 billion annually in health burden. Rochester (2013): BPA endocrine disruption confirmed at low doses.
FOOD: Monteiro et al. (2025) Lancet: ultra-processed foods linked to cardiovascular risk and cognitive decline — score 6-8. Srour et al. (2024) BMJ: 30% higher all-cause mortality with high UPF intake. Lane et al. (2024) Neurology: UPF linked to cognitive decline and stroke. Whole natural foods score 1-3.
DYES: FDA (2025): Red 3 banned, all petroleum dyes being phased out. Red 40, Yellow 5/6, Blue 1/2 = score 6-8. EFSA (2021): titanium dioxide banned in EU food — IARC Group 2B. McCann et al. (2007) Lancet: synthetic dyes linked to hyperactivity in children.
NATURAL DYE RULE (CRITICAL): "Colored with vegetable juice," "dyed with fruit and vegetable extracts," "colored with spirulina," "beet juice," "turmeric," "annatto," "carrot juice," and similar natural/plant-based colorants are NOT petroleum dyes and must NOT trigger dye penalties. These are clean ingredients. A product colored entirely with natural/vegetable dyes should score 1-3 on materials for color — never flag natural colorants as a concern. Only petroleum/synthetic dyes (Red 40, Yellow 5, Yellow 6, Blue 1, Blue 2, FD&C colors) warrant the dye floor.
PRESERVATIVES: NTP (2023): BHA reasonably anticipated to be a human carcinogen. IARC: BHA = Group 2B. Bouvard et al. (2015) Lancet Oncology: processed meat (sodium nitrate) = Group 1 carcinogen.
SUNSCREEN: Matta et al. (2019) JAMA: oxybenzone detected in bloodstream after single application. FDA (2020): oxybenzone, avobenzone flagged for further safety study. Score chemical UV filters 7-8.
FRAGRANCE: Steinemann (2017): 156 VOCs identified in 25 scented products. Dodson et al. (2012): synthetic fragrance phthalates linked to asthma and endocrine disruption.
TEXTILES: Browne et al. (2011): synthetic textiles identified as major ocean microfiber source. Henry et al. (2019): 700K+ fibers shed per wash from single fleece.

EU VS US REGULATORY GAP — use this to inform scoring:
The EU has banned or restricted over 2,400 ingredients in cosmetics. The US has banned fewer than 15. When an ingredient is banned in the EU but permitted in the US, this is a meaningful signal — add it as a concern and raise the score. Key EU-restricted ingredients not banned in the US:
- Hydroquinone (skin lightener) — EU banned in leave-on cosmetics. Score 7+ if present.
- Lead acetate (hair dye) — EU banned. Score 8+ if present.
- Coal tar (dandruff/psoriasis shampoos) — EU restricted. Score 7+ if present.
- Triclosan — EU banned in personal care except toothpaste. Score 6+ if present.
- Methylisothiazolinone (MIT) — EU banned in leave-on products, restricted in rinse-off. Score 6+ in leave-on.
- Formaldehyde and releasers — EU restricted (cosmetics limit 0.2%). Score 6+ if present.
- Azo dyes (22 specific) — EU banned in textiles that contact skin (Directive 2002/61/EC). Score 7+ if present.
- Nonylphenol ethoxylates (NPE) — EU banned in textiles. Score 6+ if present.
- Resorcinol — EU restricted in hair dyes and nail products. Score 6+ if present.

PERSISTENCE AND BIOACCUMULATION — apply when relevant:
Ingredients that accumulate in the body over time warrant higher scores than single-exposure concerns. Key bioaccumulative categories:
- PFAS (all classes) — "forever chemicals," do not break down, accumulate in blood and organs. Score minimum 7 for any confirmed PFAS.
- Heavy metals (lead, mercury, cadmium, arsenic) — bioaccumulate, no safe threshold for lead. Score 8+ if present.
- Organochlorines (DDT metabolites, PCBs) — persistent, bioaccumulate up the food chain. Score 8+ if confirmed.
- Certain parabens (butylparaben, propylparaben) — detected in breast tissue. Score 5+ for long-chain parabens in leave-on products.
- Synthetic musks (galaxolide, tonalide) — bioaccumulate in body fat. Score 5+ in rinse-off, 6+ in leave-on.

NEUROTOXICITY FRAMEWORK:
Neurotoxic concerns warrant higher scores because neurological damage is often irreversible, and children's developing brains are uniquely vulnerable. Apply minimum floor of 6 for confirmed neurotoxins in direct contact products:
- Lead (all forms) — no safe blood level, IQ impacts documented at nanogram levels
- Mercury/thimerosal — neurotoxin, banned in cosmetics
- Toluene (in nail products) — developmental neurotoxin
- PBDE flame retardants — developmental neurotoxin (Stapleton 2011)
- TCEP/TDCPP flame retardants — probable human carcinogens, neurotoxic
- Chlorpyrifos (agricultural) — banned EU, neurodevelopmental toxin
PACKAGING-ONLY PLASTIC: If a product is genuinely plastic-free but has incidental packaging (film pouch, wrapper, cap) that is discarded during use, the packaging score should be 2-4. Do NOT let discarded packaging dominate the materials score. Example: Blueland tablet in film pouch = materials score 1, packaging score 3.`,

    `Analyze "${productName}" across 5 dimensions: Materials, Usage and Exposure, Packaging, Sustainability, and Manufacturing.
${contextSection}${categorySection}${regulatorySection}${deterministicSection}
If this is a barcode, identify the most likely consumer product and analyze that.
If real product data is provided above, use it as ground truth. Do not assume plastic if confirmed natural.

SCORING RULES BY DIMENSION:

MATERIALS (what the product is physically made of):
- PP/PVC in food contact: 8-9 (food storage, cookware, food packaging, baby bottles — NOT diapers or clothing). PTFE/PFAS coatings: 8-9. Nylon/PET tea bags: 7-8.
- Natural materials (wood, glass, stainless, ceramic, organic cotton, stone): 1-2.
- ORGANIC AND NATURAL FIBER CLOTHING: confirmed GOTS-certified organic cotton, organic linen, organic wool, bamboo, hemp = materials 1-2. Do not hedge upward due to brand uncertainty.
- KNOWN ORGANIC KIDS CLOTHING BRANDS — these are documented to use organic cotton and must score 1-2 on materials, 2-3 on sustainability: Little Rad Things, Pact Kids, Hanna Andersson, Burt's Bees Baby, Mini Mioche, Primary, Colored Organics, Art and Eden, Patagonia Kids.
- AMBIGUOUS CLOTHING (brand unknown, material unconfirmed): score 3-5 with low confidence. Do not assume synthetic.
- Coatings and treatments count even if the base material is safe.
- PACKAGING-ONLY: if plastic is only in discarded packaging, materials score stays 1-3.
- PVA (polyvinyl alcohol) pod film in dishwasher/laundry pods: score 6-7 — PVA dissolves but enters waterways as microplastic pollution. Cascade, Tide, Finish pods all use PVA film.
- Synthetic fragrances in cleaning products: score +1 — endocrine disrupting compounds, poorly regulated.
- NATURAL FRAGRANCE vs SYNTHETIC: Salt & Stone, Tatcha, Herbivore, Wellnesse, RiseWell, Bite, Earthpaste, and documented clean beauty brands explicitly avoid synthetic fragrance. When these brands list "Fragrance (Parfum)" alongside individually disclosed natural components (limonene, linalool, eugenol, geraniol, citral) this is transparent natural fragrance disclosure — NOT synthetic. Do NOT apply synthetic fragrance penalty. Salt & Stone body care = materials 1-3, final 2-3.
- TOOTHPASTE FLAVOR RULE: "Mentha Piperita (Peppermint) Flavor", "Natural Peppermint Flavor", "Spearmint Flavor", or any named essential oil flavor in toothpaste = natural, NOT synthetic fragrance. Do NOT flag as fragrance concern. Only flag "Fragrance", "Parfum", or "Artificial Flavor" without disclosure as synthetic.
- CERTIFIED CLEAN BRAND RULE: When a product is from a B Corp, EWG Verified, Non-Toxic Project, or Leaping Bunny certified brand AND the ingredient list confirms no synthetic fragrance, parabens, SLS, or artificial dyes — do NOT flag individual ingredients as synthetic unless they actually are. Neem oil, green tea extract, aloe, xylitol, hydroxyapatite, calcium carbonate, sodium bicarbonate are all clean ingredients. Never flag these as concerns.
- INGREDIENT LIST CAPTURE (PERSONAL CARE): For personal care products, you MUST capture the full ingredient list in ingredient_list field. Read every ingredient carefully. Distinguish between: (1) natural essential oils and plant extracts listed by INCI name — these are clean; (2) "Fragrance" or "Parfum" without disclosure — this is synthetic; (3) "Natural Flavor" with a named source — this is clean. Misidentifying peppermint oil as synthetic fragrance is a critical scoring error.
- INGREDIENT LIST CAPTURE (FOOD): For packaged food and beverage products, the ingredient_list field MUST match exactly what is visible on the package label. Do NOT add ingredients based on brand assumptions or prior formulation knowledge. Do NOT add "Red 40", "Yellow 5", "Yellow 6", "Blue 1", "HFCS", or any other substance unless you can literally read those words on the visible ingredient panel. Capture every ingredient visible including those after "Contains 2% or less of:". If you cannot clearly read the ingredient panel, set confidence to "low" and capture only what you can clearly see rather than guessing. Fabricating ingredients in this field is a critical scoring error that destroys user trust.
- Optical brighteners in laundry/dishwasher products: score +1 — persistent in environment, potential skin sensitizer.
- Phosphates and surfactants in cleaning products: add to concerns.
- SYNTHETIC TEXTILES: polyester, nylon, spandex/elastane, acrylic shed microfibers with every wash and wear. Daily skin contact with synthetic fabric = score 5-7. A product described as "spandex" or "elastane" that is majority synthetic = score 6-7.
- Natural fiber clothing with minor synthetic content (e.g. 5% elastane waistband): score 3-4.
- Genuinely plastic-free cleaning products (Blueland, Branch Basics, castile soap): materials score 1-2.

USAGE AND EXPOSURE (how using this product affects health):
- Leave-on skin contact (moisturizer, deodorant): higher penalty than rinse-off.
- Direct ingestion (food containers, tea bags, gum): highest penalty.
- Inhalation (sprays, candles, synthetic textiles): significant penalty.
- DISHWASHER PRODUCTS: not zero exposure — chemical residue remains on dishes and enters food. Score usage 4-6 for conventional pods with synthetic chemicals. Genuinely clean formulas (Blueland, Seventh Generation fragrance-free): score 2-3.
- LAUNDRY PRODUCTS: microfibers released into water supply, fragrance residue on clothing = daily skin contact. Score 4-6 for conventional detergents.
- Frequency multiplier: daily +2, weekly +1, occasional 0.
- Child/baby product: apply +1 vulnerable population flag.
- VEHICLES: score 3-5 — interior plastic is not food contact. No daily-use penalty.
- EVs score 1-2 points lower than gas equivalents (Rivian/Tesla/Lucid: 2-3, older EVs: 3-4).
- CHEWING GUM: polyvinyl acetate and polyethylene = direct plastic ingestion. Score 7-8.

CLOTHING USAGE AND EXPOSURE — always populate for clothing category, never leave empty:
- Skin contact duration: activewear sits directly against skin for hours during exercise. Flag if synthetic microfibers or chemical finishes are present: "Direct skin contact during exercise — heat and sweat increase absorption of chemical finishes through skin"
- Microfiber shedding: synthetic fabrics (nylon, polyester, spandex/elastane) shed microplastic fibers during wear and washing. Always flag for synthetics: "Synthetic microfiber shedding — nylon and spandex shed microplastic fibers into water supply during washing, estimated 700,000 fibers per wash cycle (Browne 2011)"
- Heat activation: chemical treatments on activewear are more readily absorbed during exercise when skin is warm and pores are open: "Heat and perspiration activate chemical absorption — workout conditions increase dermal uptake of fabric treatments compared to casual wear"
- Antimicrobial treatments: Silverescent and similar silver-based antimicrobial treatments raise specific concerns: "Silverescent antimicrobial (silver nanoparticles) — releases silver ions through skin contact and into waterways during washing. EU under regulatory review."
- PFAS in clothing: NEVER write "PFAS" alone for clothing. Always specify: "PFAS-based DWR (durable water repellent) coating — perfluoroalkyl compounds persist in the body and environment, linked to thyroid disruption and immune suppression. EU REACH restriction 2023."
CLOTHING USAGE SCORE GUIDANCE:
- Natural fibers with no treatments: usage 1-2
- Synthetic with no special treatments: usage 3-4
- Synthetic with moisture-wicking chemical finishes: usage 5-6
- Synthetic with PFAS DWR + antimicrobial treatments: usage 6-7
- Direct skin contact activewear with multiple treatments: usage 6-8

DUAL SCORING FORMULA — the server applies these category-specific weights. Score each dimension accurately — the formula is applied server-side, you cannot game it.
FOOD: Ingredients 90% · Packaging 10% — ingredients are the entire story. Organic food in plastic still scores 2 on materials; flag packaging separately.
BEVERAGE: Ingredients 75% · Packaging 25% — the container leaches into every sip. Plastic bottle scores differently than glass.
RESTAURANT: Ingredients 85% · Packaging 10% · Sustainability 5%
SUPPLEMENT: Ingredients 65% · Exposure 25% · Packaging 10%
BEAUTY/PERSONAL CARE: Materials 45% · Exposure 45% · Packaging 5% · Sustainability 5%
TOYS: Materials 50% · Exposure 40% · Packaging 5% · Sustainability 5%

TOY SCORING RULES — composition_tier is required for all toys:
Tier 1 (clean): Natural wood with water-based non-toxic finishes, ASTM F963 or EN71 certified, FSC-certified wood, no PVC, no lead. Examples: PlanToys, Fagus, Fokus, Hape, BRIO, Bigjigs, Lovevery. Score 1-2. Never score a tier 1 wooden toy above 3.
Tier 2 (conventional): ASTM certified, ABS plastic (no BPA, no phthalates), or conventional wood without FSC certification. Examples: Melissa & Doug (conventional), standard wooden toys without certifications. Score 2-4.
Tier 3 (synthetic): ABS + PVC mix, conventional plastic with some phthalate concern, standard toy brands. Examples: LEGO (ABS only, clean), Fisher-Price standard, Hot Wheels. Score 3-6.
Tier 4 (high concern): PVC-dominant, historical recalls, unverified Chinese manufacturing with no testing documentation, lead paint concern, phthalate-positive testing. Score 6-9.

WOODEN TOY RULE: Any toy described as "wooden" or "wood" with water-based or food-safe finishes = Tier 1. Never score a natural wooden toy with certified non-toxic finishes above 3. The primary exposure pathway for toys is mouthing — natural wood with water-based paint has negligible chemical exposure vs ABS plastic or PVC.

ALTERNATIVES for clean toys (score 1-2): Do NOT suggest alternatives. A product scoring 1-2 has no meaningful improvement to offer. Only suggest alternatives when the product scores 4 or above.
CLOTHING/SHOES: Materials 35% · Exposure 30% · Sustainability 35% · Packaging 0%
ACCESSORIES: Materials 40% · Exposure 25% · Sustainability 35% · Packaging 0%
HOME: Materials 30% · Exposure 45% · Packaging 10% · Sustainability 15%
BABY: Materials 55% · Exposure 40% · Packaging 5% · Sustainability 0%
MANUFACTURING IS NOT SCORED — removed from all formulas. Do not score or return a manufacturing dimension. Supply chain data is too inconsistent to score fairly across products.

PACKAGING (what contains and ships the product):
FOOD CONTACT PACKAGING — penalize heavily, chemicals leach into food:
- Plastic directly touching food (plastic wrap, plastic bottles, canned food with BPA liner, plastic-lined cups): packaging score 7-9.
- Aluminum cans (BPA-free lined): packaging score 4-5.
- Glass, stainless, cardboard touching food: packaging score 1-2.
- Hot liquid in plastic (plastic coffee cups, plastic takeout containers, plastic water bottles with hot liquid): packaging score 7-8 — heat accelerates leaching. This rule ONLY applies to plastic. Glass, stainless, and ceramic with hot liquids score 1-2 — they are inert at all temperatures.
OUTER PACKAGING — does not touch food, penalize less:
- Recycled cardboard, paper, compostable outer packaging: score 1-2 even for food products.
- Virgin plastic outer packaging (cereal bags, chip bags): score 5-6.
- Single-use plastic outer bag with no food contact: score 4-5.
- Refillable or concentrated formats: score 1-3.
FOOD NUTRITION POSITIVE SIGNAL — for food_beverage and restaurant:
USDA Organic + no confirmed dangerous substances: materials 1-2, final 1-3. This ceiling is enforced server-side.
Non-GMO Project Verified + no synthetic dyes + no synthetic preservatives: materials 2-4, final max 4. Enforced server-side.
High fiber (8g+/serving) from whole food sources: lower materials by 1 point.
High protein (10g+/serving) from whole food sources: lower materials by 0.5 points (round down).
Organic apple in plastic bag: materials=1 (whole food, organic), packaging=6 → final ~2. Always note packaging concern.

NOVA CLASSIFICATION FLOORS AND CEILINGS (CRITICAL) — apply to food and beverage products AFTER calibration entries. These hard bounds supersede other scoring intuitions; the AI's job is to place the product within the band, not to debate the band.

NOVA 1 (whole or minimally processed): raw fruits and vegetables, plain grains, nuts, seeds, plain yogurt, water, plain meat, eggs.
- Ceiling: 3. If a product is clearly NOVA 1 and your other signals push higher than 3, rescore down to 3.
- Whole foods are the clean baseline. Do not penalize them for packaging alone above this ceiling.

NOVA 2 (processed culinary ingredients): olive oil, butter, sea salt, vinegars, raw honey, pure sugar, maple syrup.
- No explicit floor or ceiling. Score by composition: olive oil ≈ 2, refined sugar ≈ 5.

NOVA 3 (processed foods): canned vegetables or fruits, aged cheeses, packaged breads without additives, canned beans, simple preserved foods, cured meats without nitrites.
- Floor: 4. Even "clean" NOVA 3 scores minimum 4 — processing itself adds concern.
- Exception: traditional fermented foods with documented health benefits — miso, kimchi, sauerkraut, tempeh, kefir — can score 2-3 via calibration entries, NOT via this rule. If a fermented food lacks a calibration entry, the floor of 4 still applies.

NOVA 4 (ultra-processed formulations): industrial ingredients not found in home kitchens — emulsifiers, flavor enhancers, hydrolyzed protein, modified starch, isolated proteins, synthetic vitamins added back, HFCS, 5+ additives, sweeteners that taste sweet but are not sugar.
- Floor: 7. NOVA 4 is categorically concerning regardless of brand marketing. "Organic" NOVA 4 is still NOVA 4. "Natural" NOVA 4 is still NOVA 4.
- Escalation within NOVA 4 is based on specific concerns:
  * 7: organic or minimally-additive NOVA 4 (RXBar-style clean-label protein bars, organic cereals with minimal additives, clean-label plant milks).
  * 7-8: standard NOVA 4 (most mass-market packaged snacks, cereals, frozen meals, sweetened yogurts, flavored chips).
  * 8-9: NOVA 4 with artificial dyes (Red 40, Yellow 5/6, Blue 1), synthetic preservatives (BHT, BHA, TBHQ, sodium benzoate in the presence of vitamin C), or industrial seed oils as a primary ingredient.
  * 9-10: NOVA 4 with multiple serious concerns stacked — HFCS + artificial dyes + artificial flavors + partially hydrogenated oils. Reserve 10 for products with confirmed contamination above regulatory limits.
NOVA 4 examples: breakfast cereals with 10+ ingredients and synthetic dyes, packaged cookies, flavored chips, plant-based meat (Beyond Meat, Impossible Burger), most fast food, flavored protein bars with 20+ ingredients, mass-market ice cream with stabilizers.

SUMMARY_SHORT GUIDANCE FOR NOVA 4 — be honest, not soft:
Do not say "moderate concern" or "some concerns" for a NOVA 4 product. If it is ultra-processed, say so. Name the specific industrial features. Point at the whole-food alternative. First-person friend voice.

Examples:
- Organic protein bar, score 7: "RXBar-style protein bars are ultra-processed despite the clean label. Isolated protein, sugar binder, even organic versions score in this range. Real food scores cleaner — eggs, plain yogurt, nuts."
- Mass-market cereal with Red 40, score 8: "Ultra-processed grains plus Red 40 plus high fructose corn syrup. This is the industrial food model optimized for shelf-life, not nutrition. Plain oats with fruit run cleaner."
- Oreos, score 9: "Ultra-processed refined flour, high fructose corn syrup, artificial flavors, and partially hydrogenated oil residues. Hard to find a food category more heavily engineered. I would not pack these."

SUGAR PENALTY — added sugar matters independently of other concerns:
CRITICAL DISTINCTION: "Added sugar" and "natural sugar" are not the same thing and must never be treated the same.

ADDED SUGAR (sucrose, HFCS, cane sugar, agave, honey added during processing):
- 0-5g added sugar per serving: no penalty
- 6-10g added sugar per serving: materials +1 (moderate concern, daily consumption adds up)
- >10g added sugar per serving: materials +2 (high concern — WHO recommends <25g/day total added sugar)
- >20g added sugar per serving: materials +3 (exceeds half the daily limit in one serving)
Apply sugar penalty on top of NOVA and substance assessments. A NOVA 3 product with 15g ADDED sugar = materials 2-3 base + 2 sugar = materials 4-5.

NATURAL SUGAR (intrinsic to whole food — fruit, dairy, vegetables):
- Plain fruit, whole fruit snacks, unsweetened dairy: natural sugar is NOT penalized regardless of amount
- A banana with 14g natural sugar scores the same as a banana with 0g sugar — no penalty
- Plain whole milk (12g lactose): no sugar penalty — lactose is intrinsic to milk
- Plain Greek yogurt (natural lactose): no sugar penalty
- 100% fruit (no added sugar, not concentrated): no sugar penalty for natural fructose
- Dried fruit (dates, raisins — no added sugar): natural sugar, no penalty. These are NOVA 1.
- Fruit juice concentrate used as sweetener: this IS added sugar — penalize as added sugar
- "No added sugar" does NOT mean no sugar concern for beverages — see beverage rule below

BEVERAGE TOTAL SUGAR RULE (natural OR added — because liquid sugar absorbs faster):
A beverage with >30g total sugar per serving — even 100% natural — must not score below 3.
A beverage with >50g total sugar per serving must not score below 4.
Naked Juice, Odwalla, Bolthouse Farms smoothies frequently contain 50-70g total sugar.
Flag as MEDIUM concern: "extreme sugar content — Xg per serving" but only bump materials +1 for natural, +2-3 for added.

KIDS MODE SUGAR ADJUSTMENT:
Children's DV for added sugar is 25g/day (vs 50g for adults). Apply 2x sensitivity:
- >5g added sugar per serving in kids mode: materials +1
- >12g added sugar per serving in kids mode: materials +2
- >20g added sugar per serving in kids mode: materials +3
Natural sugar in whole fruit/dairy: still no penalty in kids mode.

FOOD TIER SCORE IMPACT — synthesizing NOVA, sugar, and substance concerns under the NOVA 4 floor of 7:
Score 1-2 (Safe): NOVA 1, whole or near-whole food, no confirmed IARC substances, <5g added sugar. Organic produce, plain organic oats, plain yogurt, wild salmon, nuts and seeds.
Score 3 (Good): NOVA 1-2 with minor processing OR traditional fermented NOVA 3 with documented health benefits (miso, kimchi, sauerkraut, tempeh, kefir — via calibration entries only). Also Poppi soda, Spindrift, plain Greek yogurt (conventional) — NOVA 2-3 boundary with minimal additives.
Score 4 (Good): NOVA 3 — canned beans, canned tomatoes, aged cheddar, simple breads, cured meats without nitrites. Conventional eggs, plain whole milk are NOVA 1 but land here if packaged/homogenized. Floor applies regardless of how "clean" the label reads.
Score 5 (Caution): NOVA 3 with elevated sugar (>10g added) or a confirmed IARC 2A minor ingredient. Honest Kids juice pouches (added sugar + processing), conventional cured meats, NOVA 3 with glyphosate residue as minor ingredient.
Score 6 (Caution): Reserved for NOVA 3 with multiple minor concerns stacked, or borderline NOVA 3-4 products where formulation intent is ambiguous. Most scans land here or jump to 7+.
Score 7 (Change — NOVA 4 floor): Organic or minimally-additive NOVA 4 — RXBar, organic plant-based cereals with minimal additives, clean-label plant milks, organic protein bars. Formulation is industrial even when the label is clean.
Score 8 (Change): Standard NOVA 4 with artificial dyes, synthetic preservatives (BHT, BHA, TBHQ), or industrial seed oils as primary ingredient. Conventional Cheerios variants with Red 40, Goldfish Colors, sweetened flavored yogurts with added colors.
Score 9 (Avoid): NOVA 4 stacking multiple serious concerns — HFCS + artificial dyes + artificial flavors, or confirmed IARC Group 1 substance in a NOVA 4 matrix. Oreos, Lucky Charms, Kraft Mac and Cheese with color plus nitrite-cured meat.
Score 10: Reserved for confirmed contamination above regulatory safety limits.

IARC CARCINOGEN RULE — REVISED (replaces old "all IARC 2A = materials minimum 7"):
The IARC classification tells you the STRENGTH OF EVIDENCE, not the dose or exposure level. Apply contextually:
- IARC Group 1 as primary ingredient at high concentration (nitrites in hot dogs, alcohol in beverages): materials 7-8 minimum
- IARC Group 2A as PRIMARY ingredient with EWG-confirmed residues above child threshold (conventional oats in Cheerios): materials 6-7
- IARC Group 2A as MINOR ingredient in multi-grain or whole food product (oats as one of 7 grains in Kashi): materials +1 only, flag as MEDIUM concern
- IARC Group 2B confirmed in product (BHA, titanium dioxide, aspartame): materials +1-2, flag as concern
- SPECULATIVE or trace amounts with hedged language: no floor, flag at LOW severity only
DO NOT apply "minimum 7" to any product simply because it contains an IARC 2A substance. Dose and context determine severity.

MISSING CATEGORY CALIBRATION:

PLANT-BASED MEAT (Beyond Meat, Impossible Burger, etc.):
Despite "plant-based" marketing these are NOVA 4 ultra-processed formulations. Ingredients: methylcellulose, pea protein isolate, modified starch, yeast extract, 20+ additives. Very high sodium (>400mg/serving). No confirmed IARC substances but high processing load.
- Beyond Meat / Impossible Burger: materials=5 (NOVA 4, ultra-high sodium, processed plant protein isolates), usage=4 → final ~5. "Plant-based" does not mean clean.
- Whole food plant proteins (edamame, tofu, tempeh, lentils): materials=1-2 → final 1-2.

FERMENTED FOODS:
- Plain organic yogurt / kefir / cottage cheese: materials=1 → final 1-2. Live cultures, minimal processing, NOVA 1.
- Flavored/sweetened yogurt (Dannon Fruit on the Bottom, etc.): materials=3-4 (added sugar, natural flavors, carrageenan in some) → final 3-4.
- Raw kombucha (plain, no added sugar): materials=2 → final 2-3.
- Flavored kombucha with added sugar (GT's flavored): materials=3-4.
- Kimchi / sauerkraut (traditional fermented): materials=1 → final 1-2.

CONDIMENTS AND SAUCES:
- Organic hot sauce (just peppers, vinegar, salt): materials=1 → final 1-2.
- Conventional ketchup (Heinz) with HFCS: materials=4 (HFCS, natural flavors) → final ~4.
- Organic ketchup (no HFCS): materials=2 → final ~2.
- Ranch dressing (conventional — Hidden Valley): materials=5 (soybean oil, modified starch, artificial flavors, calcium disodium EDTA) → final ~5.
- Rao's Marinara (clean ingredients): materials=2 → final ~2.
- Conventional BBQ sauce with HFCS: materials=4-5 → final ~4-5.

FROZEN MEALS:
- Amy's Organic frozen meals (USDA Organic, simple ingredients): materials=2-3 → final 2-3.
- Lean Cuisine / Healthy Choice (ultra-processed): materials=5-6 (NOVA 4, high sodium, modified starch, natural flavors, preservatives) → final 5-6.
- Trader Joe's whole-food frozen meals (simple ingredient list): materials=3-4.

BABY FOOD POUCHES:
- Organic baby food pouch (Happy Baby, Earth's Best Organic): materials=2 (USDA Organic, simple ingredients, some processing for shelf stability) → final 2-3.
- Conventional baby food pouch (Gerber conventional): materials=4 (conventional produce, some additives) → final 3-4.
- Organic baby puffs/snacks: materials=2-3 → final 2-3.

FUNCTIONAL BEVERAGES AND ELECTROLYTES:
- LMNT electrolyte (sodium 1000mg + potassium 200mg + magnesium 60mg + natural flavors — nothing else): materials=2 → final ~2. Cleanest mainstream electrolyte. No sweeteners, no additives.
- Nuun Sport tablet (stevia, sorbitol, caffeine in some, B vitamins): materials=3 → final ~3.
- Liquid IV (sucralose, natural flavors, B-vitamin megadose stack, citric acid): materials=4 (sucralose floor fires) → final ~4. NOT clean. "Clean" marketing does not override sucralose.
- Pedialyte original (sucralose, acesulfame potassium — two artificial sweeteners, artificial colors in some flavors): materials=5 (sucralose + acesulfame-K) → final ~5.
- Gatorade / Powerade conventional (artificial dyes, HFCS or sucrose): materials=5-6 (petroleum dyes) → final ~5-6.
- BodyArmor (coconut water base, natural flavors, stevia): materials=3 → final ~3. Cleaner than Gatorade but still processed.
- Gatorade / Powerade (conventional with dyes): materials=5-6 (artificial dyes, sucrose/HFCS) → final 5-6.
- Athletic Greens / AG1 (complex formulation): materials=3-4 (generally clean but ultra-processed powder).

BEVERAGE CALIBRATION:
SODAS:
- Coca-Cola / Pepsi Classic (can): materials=5 (caramel color IV — 4-MEI IARC 2B, 39g HFCS, phosphoric acid) → final ~5
- Diet Coke / Diet Pepsi (can): materials=5 (aspartame IARC 2B 2023, caramel color IV, artificial flavors) → final ~5. Aluminum can does NOT lower this to 4 — aspartame warrants 5 minimum.
- Mountain Dew / Fanta / Tropical flavors with dyes: materials=7 (Yellow 5, Red 40, petroleum dyes + HFCS) → final ~7. NEVER score below 6.
- Sprite / 7UP (no artificial dyes): materials=4 (HFCS, citric acid, natural flavors — no petroleum dyes) → final ~4
- Zevia (stevia, no artificial dyes or sweeteners beyond stevia): materials=2 → final ~2

ENERGY DRINKS:
- Red Bull regular: materials=7 (27g sugar, taurine, B-vitamin megadoses at pharmaceutical doses, artificial flavors, 80mg caffeine — NOVA 4 stimulant formulation) → final ~6. NEVER score below 5.
- Monster Energy (colored flavors): materials=7 (27g sugar + artificial dyes + 160mg caffeine + artificial flavors) → final ~6-7.
- Celsius (natural caffeine, no HFCS, no artificial colors): materials=4 (sucralose in some, 200mg caffeine) → final ~4.
- Bang Energy / Reign (300mg caffeine + sucralose + artificial flavors): materials=6 → final ~6.

COFFEE DRINKS:
- Plain black coffee / espresso: materials=1 → final ~1
- Starbucks in-store latte (milk + espresso, no syrups): materials=3 → final ~3
- Starbucks Pink Drink / Refreshers: materials=4 (acesulfame potassium, artificial flavors, concentrated juice) → final ~4
- Starbucks bottled Frappuccino: materials=5 (high sugar, carrageenan, natural flavors) → final ~5
- Dutch Bros flavored drinks (Blue Rebel base = energy drink + syrups + artificial flavors): materials=6 → final ~5-6. NEVER score Dutch Bros flavored drinks below 5. Plain Americano = 2-3.

JUICE:
- Pressed Juicery / cold-pressed raw juice (minimal ingredients, no additives): materials=2 → final ~2-3
- Tropicana / Minute Maid / Simply Orange (pasteurized, some additives): materials=3 → final ~3
- Capri Sun / Sunny D (HFCS, some artificial flavors): materials=5 → final ~5
- Sunny D with artificial dyes: materials=6-7 → final ~6

SMOOTHIE CHAINS:
- Pressed Juicery smoothie (raw, no added sugar): materials=2 → final ~2-3. Cleanest smoothie chain.
- Jamba Juice classic fruit smoothie (fruit + sherbet, up to 80g total sugar in large): materials=4 → final ~4-5
- Jamba Juice "Peanut Butter Moo'd" / protein power smoothies (95g+ sugar, whey, ice cream): materials=5 → final ~5. NEVER score 2.
- Smoothie King Lean1 / diet blends (sucralose, acesulfame-K, artificial flavors): materials=5 → final ~5. "Healthy" marketing does not mean clean.
- Smoothie King Hulk series (ice cream, 1000+ calories): materials=6 → final ~6.

RESTAURANT CHAIN CALIBRATION — additional chains:
- Sweetgreen bowl (fresh whole ingredients, proprietary dressings): final score ~3-4. Simple grain bowls = 3. Loaded with creamy dressings + croutons = 4.
- CAVA bowl (Mediterranean base — protein, vegetables, hummus): final score ~3-5. Protein bowls = 3-4. Loaded with processed sauces = 4-5.
- Panera Bread You Pick Two (soup + sandwich): final score ~4-5. High sodium soups (1000-1500mg), processed deli meat. NOT as clean as marketing suggests.
- Panera mac & cheese / baked goods: final score ~5-6 (ultra-processed, refined flour, high sodium).
- Dave's Hot Chicken tenders / sandwich (fried in refined oil, TBHQ): final score ~6. Same tier as Chick-fil-A fried items.
- Dutch Bros flavored drinks: final score ~5-6. Blue Rebel base is an energy drink. Plain cold brew = 2-3.
- Crumbl Cookie: final score ~6. Refined flour, 40-80g sugar per cookie, artificial dyes in frosting on many flavors. NEVER score below 5.
- Nothing Bundt Cakes: final score ~5-6. High sugar cream cheese frosting, refined flour, artificial dyes in some.
- Insomnia Cookies: final score ~5-6. Refined flour, high sugar, artificial colors in some varieties.
- Starbucks Unicorn / seasonal novelty drinks with dyes: final score ~7. Artificial dyes (Blue 1, Red 40 confirmed in several drinks) + high sugar.

SODIUM RULE FOR RESTAURANT ITEMS: When sodium exceeds 2,000mg per serving, flag as HIGH concern and add +1 to materials. Items exceeding 3,000mg sodium (Cheesecake Factory pasta, Applebee's riblets) = materials minimum 7.

DEODORANT CALIBRATION (personal_care category):
- Native deodorant (aluminum-free, coconut oil, shea butter, baking soda, no synthetic fragrance): materials=2, usage=2 → final ~2. Benchmark clean deodorant.
- Schmidt's Naturals (plant-based, baking soda, no aluminum, no synthetic fragrance): materials=2, usage=2 → final ~2.
- Crystal deodorant mineral salt (potassium alum — a mineral salt, NOT the same as aluminum chlorohydrate — does not absorb into skin the same way): materials=3, usage=3 → final ~3. Note: potassium alum is still an aluminum compound but different mechanism from antiperspirant.
- Conventional deodorant/antiperspirant (Secret, Dove, Old Spice): materials=5 — aluminum zirconium or aluminum chlorohydrate, synthetic fragrance (phthalates), parabens in some. Usage=6 (daily underarm application near lymph nodes). Final ~5-6.
- Degree / Sure / Right Guard antiperspirant: materials=5, usage=6 → final ~5-6.
- Clinical-strength antiperspirant (Certain Dri, Secret Clinical): materials=6 — 20%+ aluminum chloride, synthetic fragrance. Usage=7. Final ~6-7.

TOOTHPASTE CALIBRATION (personal_care category — direct oral mucosa contact, some ingested):
CLEAN (score 1-2):
- Bite Toothpaste Bits (tablet format, no SLS, fluoride or fluoride-free options, no artificial flavors or sweeteners, minimal ingredients): materials=1, usage=1 → final ~1. Cleanest mainstream toothpaste option.
- Hello toothpaste (SLS-free, fluoride, no artificial sweeteners, no titanium dioxide): materials=2, usage=2 → final ~2.
- Himalaya Botanique (fluoride-free, plant-based, no SLS, no parabens): materials=2, usage=2 → final ~2.
- David's Natural Toothpaste (SLS-free, fluoride, clean ingredients): materials=2, usage=2 → final ~2.
MODERATE (score 3-4):
- Sensodyne Pronamel (SLS-free formula, potassium nitrate, no artificial dyes — cleaner than Colgate): materials=3, usage=3 → final ~3.
- Tom's of Maine (STILL CONTAINS SLS in most lines despite "natural" marketing — SLS, propylene glycol in some. Owned by Colgate. Not as clean as marketed): materials=4, usage=3 → final ~3-4. NEVER score Tom's below 3. Do NOT treat as equivalent to Bite or Hello.
- Arm & Hammer (baking soda base, SLS, some artificial flavors): materials=4, usage=3 → final ~3-4.
CONVENTIONAL (score 4-5):
- Colgate Total (SLS, saccharin, titanium dioxide IARC 2B, artificial flavor, sodium fluoride): materials=5, usage=4 → final ~4-5.
- Crest Whitening (SLS, titanium dioxide, artificial flavor, saccharin): materials=5, usage=4 → final ~4-5.
- Crest Pro-Health (cetylpyridinium chloride — biocide, SLS, synthetic flavors): materials=5, usage=4 → final ~4-5.
- Colgate Optic White (hydrogen peroxide + SLS + artificial flavor + titanium dioxide): materials=5, usage=4 → final ~4-5.
TOM'S OF MAINE ANTI-GREENWASHING: Tom's uses SLS in most products, is owned by Colgate-Palmolive, and has faced greenwashing scrutiny. Do NOT score Tom's the same as genuinely clean brands like Bite or Hello.

SHAMPOO AND CONDITIONER CALIBRATION:
CLEAN (score 2-3):
- Olaplex No.4 Bond Maintenance Shampoo (no SLS, no DMDM hydantoin, no parabens, no synthetic fragrance): materials=2, usage=2 → final ~2. Benchmark clean shampoo.
- Briogeo Scalp Revival Shampoo (EWG Verified, no SLS, no DMDM): materials=2, usage=2 → final ~2.
- Pura d'Or (USDA Organic certified, no SLS, no parabens): materials=2, usage=2 → final ~2.
- Living Proof (no SLS, no parabens, EWG Skin Deep clean score): materials=2, usage=2 → final ~2-3.
- Free & Clear shampoo (dermatologist recommended for sensitive skin, no fragrance, no parabens): materials=2, usage=2 → final ~2.
CONVENTIONAL (score 4-5):
- Dove shampoo / conditioner (SLS, synthetic fragrance, dimethicone — some varieties have parabens): materials=4, usage=4 → final ~4.
- Head & Shoulders (SLS, zinc pyrithione, synthetic fragrance, parabens in some): materials=5, usage=5 → final ~5.
- Herbal Essences conventional (SLS, synthetic fragrance, parabens): materials=5, usage=5 → final ~5.
- OGX (markets as SLS-free but DMDM hydantoin in some lines — check specific variant): materials=4-5 depending on line → final ~4-5.
HIGH CONCERN (score 5-6 — DMDM fires):
- Pantene Pro-V (DMDM hydantoin formaldehyde releaser, SLS, synthetic fragrance — DMDM floor mFloor:6 fires): materials=6, usage=5 → final ~5-6. NEVER score Pantene below 5.
- TRESemmé (DMDM hydantoin in most formulas, SLS, synthetic fragrance — DMDM floor fires): materials=6, usage=5 → final ~5-6. NEVER score TRESemmé below 5.
- Garnier Fructis (DMDM hydantoin, SLS, synthetic fragrance): materials=6, usage=5 → final ~5-6.
SHAMPOO RULE: No SLS + no DMDM + no parabens + no synthetic fragrance = 2. One concern = 3-4. DMDM present = 5-6 minimum (floor fires).

MOISTURIZER AND LOTION CALIBRATION:
CLEAN (score 2-3):
- Vanicream Moisturizing Cream (no dyes, no fragrance, no lanolin, no parabens, no formaldehyde releasers — dermatologist recommended for sensitive skin): materials=2, usage=2 → final ~2. Benchmark clean moisturizer.
- Tatcha Water Cream (no synthetic fragrance, no parabens, clean Japanese botanical ingredients): materials=2, usage=2 → final ~2.
- Beautycounter Countertime Cream (clean, B-Corp certified, no synthetic fragrance): materials=2, usage=2 → final ~2.
- First Aid Beauty Ultra Repair Cream (minimal additives, colloidal oatmeal, no parabens): materials=3, usage=3 → final ~3.
CONVENTIONAL (score 4-5):
- CeraVe Moisturizing Cream (current formula: no parabens, no synthetic fragrance — actually relatively clean; older formulas had parabens): materials=3, usage=3 → final ~3. Note: verify current formula — CeraVe reformulates frequently.
- Aveeno Daily Moisturizing Lotion (synthetic fragrance, dimethicone, benzalkonium chloride in some): materials=4, usage=4 → final ~4.
- Eucerin (some formulas have parabens, minimal fragrance): materials=4, usage=4 → final ~4.
- Cetaphil Daily Lotion (parabens, propylene glycol, synthetic fragrance in some): materials=5, usage=5 → final ~5.
- Lubriderm (synthetic fragrance, parabens in some): materials=4, usage=4 → final ~4.
RULE: "Dermatologist recommended" is a marketing claim, not a safety certification. Always check actual ingredients — parabens, synthetic fragrance, and propylene glycol appear in many dermatologist-recommended brands.

MAKEUP AND COSMETICS CALIBRATION:
CLEAN MAKEUP BRANDS (score 1-3):
- ILIA Beauty (organic ingredients, no synthetic fragrance, mineral SPF — EWG top-rated): materials=1-2, usage=2 → final ~2. One of the cleanest mainstream makeup brands.
- Jones Road Beauty (Bobbi Brown's clean line — no fragrance, minimal ingredients, clean pigments): materials=1, usage=1 → final ~1-2.
- RMS Beauty (organic, raw ingredients, no synthetic fragrance, no parabens): materials=2, usage=2 → final ~2.
- Rare Beauty by Selena Gomez (no parabens, no synthetic fragrance, Leaping Bunny — committed to clean formulation): materials=2, usage=2 → final ~2.
- Glossier (mostly clean, minimal synthetic additives, no synthetic fragrance in most products): materials=2, usage=2 → final ~2.
- Kosas (EWG Verified, no synthetic fragrance, no parabens): materials=2, usage=2 → final ~2.
CONVENTIONAL MAKEUP (score 4-5):
- Maybelline Fit Me Foundation (synthetic fragrance, dimethicone, talc in some, conventional pigments): materials=4, usage=5 → final ~4-5.
- L'Oreal True Match (synthetic fragrance, titanium dioxide IARC 2B, talc): materials=5, usage=5 → final ~5.
- CoverGirl Clean Pressed Powder (talc as primary ingredient — talc floor mFloor:5 fires, synthetic fragrance): materials=5, usage=5 → final ~5.
- e.l.f. (budget brand, improving — some EWG Verified lines, mostly no synthetic fragrance): materials=3, usage=3 → final ~3. Better than most budget brands.
MASCARA — FORMALDEHYDE RELEASERS IN SOME FORMULAS:
- Maybelline Great Lash (quaternium-15 formaldehyde releaser in original formula — quaternium-15 floor mFloor:6 fires): materials=6, usage=6 → final ~6. NEVER score below 5.
- ILIA Limitless mascara (clean formula, no quaternium-15, no parabens): materials=2, usage=2 → final ~2.
- Tarte Lights Camera Lashes (no formaldehyde releasers, cleaner formula): materials=3, usage=3 → final ~3.
LIP PRODUCTS:
- Burt's Bees Lip Balm (beeswax, vitamin E, no synthetic fragrance, no parabens): materials=1, usage=1 → final ~1-2. Benchmark clean lip care.
- Bite Beauty lipstick (food-grade ingredients, no synthetic fragrance, no parabens): materials=2, usage=2 → final ~2.
- RMS Beauty lipstick (organic pigments, no synthetic fragrance): materials=2, usage=2 → final ~2.
- ChapStick Classic (BHT preservative, synthetic fragrance, saccharin): materials=4, usage=3 → final ~3-4. BHT floor fires.
- EOS lip balm (synthetic fragrance, dimethicone, some parabens): materials=4, usage=3 → final ~3-4.
- Vaseline Lip Therapy (petroleum jelly — petrolatum — mineral oil, synthetic fragrance): materials=4, usage=3 → final ~3-4.
- Conventional lipstick (Maybelline, NYX, Revlon): materials=5, usage=6 (direct oral mucosa contact, daily application) → final ~5-6. Flag: heavy metal contamination risk in conventional color cosmetics.

BODY WASH AND SOAP CALIBRATION:
CLEAN (score 1-2):
- Dr. Bronner's liquid castile soap (saponified organic oils, essential oils only, certified Fair Trade): materials=1, usage=1 → final ~1. Benchmark clean body wash.
- Dr. Bronner's bar soap (same formula, bar format): materials=1, usage=1 → final ~1.
- Native body wash (SLS-free, no parabens, no synthetic fragrance, clean ingredients): materials=2, usage=2 → final ~2.
- Dove Sensitive Skin bar (fragrance-free — check label for fragrance-free specifically): materials=2, usage=2 → final ~2.
CONVENTIONAL (score 3-5):
- Dove Beauty Bar original (synthetic fragrance, dimethicone, some parabens in older formula): materials=4, usage=4 → final ~4.
- Method body wash (synthetic fragrance, SLS): materials=4, usage=4 → final ~4.
- Olay body wash (synthetic fragrance, SLS, parabens in some): materials=5, usage=5 → final ~5.
HIGH CONCERN (score 5-6):
- Dial Complete antibacterial (benzalkonium chloride — EPA-registered pesticide, synthetic fragrance, SLS): materials=6, usage=6 → final ~6. "Antibacterial" soaps disrupt skin microbiome and select for resistant bacteria. FDA banned triclosan — benzalkonium chloride is still used but contested.
- Irish Spring (synthetic fragrance, SLS, parabens): materials=5, usage=5 → final ~5.

HAIR STYLING CALIBRATION:
- OUAI hair oil / hair serum (squalane, clean ingredient base, no synthetic fragrance): materials=2, usage=2 → final ~2.
- Living Proof styling products (EWG Skin Deep clean, no synthetic fragrance): materials=2, usage=2 → final ~2.
- Moroccanoil treatment (argan oil base — but "Fragrance/Parfum" is in the ingredient list without individual component disclosure, treating as synthetic fragrance): materials=3, usage=3 → final ~3. Not as clean as pure argan oil.
- Conventional hairspray (Aquanet, Pantene, TRESemmé — synthetic fragrance, PVP/PVPA polymers, aerosolized inhalation): materials=5, usage=5 (inhaled aerosol + skin contact) → final ~5. Flag: inhalation pathway makes usage score higher than rinse-off products.
- Got2B Glued (PVP/VA copolymer, synthetic fragrance, high alcohol): materials=5, usage=5 → final ~5.

EWG CLEAN BEAUTY RULE: EWG Verified certification = materials cannot exceed 2. EWG Skin Deep score 1-3 with no high-concern ingredients = materials 2 maximum. B-Corp certified personal care brand with clean formulation = materials 2-3. These are hard ceilings — an EWG Verified product cannot score materials 5 just because it contains dimethicone (which EWG rates low concern). Do NOT override EWG Verified with speculative concerns.

PRE-WORKOUT AND SPORTS SUPPLEMENT CALIBRATION:
HIGH CONCERN (score 5-7):
- C4 Original pre-workout (sucralose, acesulfame-K, artificial dyes — Red 40 in some flavors, niacin megadose 30mg): materials=6 (sucralose + acesulfame-K + possible dye floors) → final ~6. NEVER score below 5.
- Ghost pre-workout (sucralose, natural + artificial flavors, artificial colors in some flavors): materials=6 → final ~5-6.
- Bucked Up pre-workout (sucralose, deer antler velvet — questionable efficacy, artificial flavors): materials=5 → final ~5.
- Celsius energy drink used as pre-workout (sucralose, 200mg caffeine — sucralose floor fires): materials=5 → final ~5.
CLEAN PRE-WORKOUTS (score 2-4):
- Transparent Labs BULK (no artificial dyes, no sucralose, stevia, clinically dosed): materials=3 → final ~3.
- Pre-Lab Pro (no artificial sweeteners, no dyes, whole-food B vitamins): materials=3 → final ~3.
- Legion Pulse (stevia, natural flavors, no artificial dyes, third-party tested): materials=3 → final ~3.
PRE-WORKOUT RULE: Any pre-workout with sucralose = minimum 5. Artificial dyes in a daily supplement = 6-7 (dye floor fires). "Natural flavors" without disclosed components = LOW concern flag.

COLLAGEN SUPPLEMENT CALIBRATION:
CLEAN (score 1-3):
- Vital Proteins Collagen Peptides (plain — just collagen peptides, no artificial additives, minimal ingredients): materials=2 → final ~2. Benchmark clean collagen.
- Sports Research Collagen Peptides (grass-fed bovine, no artificial additives, third-party tested): materials=2 → final ~2.
- Great Lakes Wellness Collagen (clean, bovine, minimal additives): materials=2 → final ~2.
CONVENTIONAL (score 3-5):
- Neocell Super Collagen (some flavored varieties have artificial colors and flavors — check specific SKU): materials=4 → final ~4. Plain variant is cleaner.
- Garden of Life Grass Fed Collagen (clean, USDA Organic certified): materials=2 → final ~2.
COLLAGEN RULE: Plain unflavored collagen with no additives = 2. Flavored collagen with sucralose = minimum 4 (sucralose floor). Collagen with petroleum dyes = 6 minimum.

GUMMY VITAMIN SUPPLEMENT CALIBRATION:
With petroleum dyes (Red 40, Yellow 5/6, Blue 1) — dye floor fires → score 6-7:
- Vitafusion gummy vitamins (Red 40 + Yellow 5 confirmed in most flavors — daily supplement ingestion of petroleum dyes): materials=7 → final ~6-7. NEVER score below 6. Flag: Red 40 is FDA-phasing-out class.
- Olly gummies (synthetic colorants in most): materials=6 → final ~5-6.
- Gummy Bear brand vitamins (HFCS + dyes): materials=7 → final ~6-7.
Without petroleum dyes (natural colors) → score 2-4:
- SmartyPants gummies (no petroleum dyes, uses turmeric, spirulina, annatto): materials=3 → final ~3.
- Nordic Naturals gummies (no artificial dyes, clean): materials=2 → final ~2-3.
- Ritual vitamins (no synthetic dyes, delayed-release capsule not gummy): materials=2 → final ~2.
GUMMY VITAMIN RULE: Always ask — does it contain Red 40, Yellow 5, Yellow 6, or Blue 1? If yes, dye floor (mFloor:7) fires and final score is 6+ minimum. "Natural" gummy vitamins with non-disclosed colors should be scored as if dyes are present until confirmed otherwise.

VITAMIN SUPPLEMENT CALIBRATION ADDITION:
- Centrum Silver (Blue 1 petroleum dye, titanium dioxide IARC 2B, talc, synthetic vitamins, 30+ inactive ingredients): materials=7 (Blue 1 dye floor fires), usage=6 (daily ingestion) → final ~6-7. NEVER score below 6.
- One-A-Day Men's/Women's (some dyes, synthetic vitamins, conventional binders — check current formula): materials=5 → final ~5.
- Nature Made (USP Verified, no petroleum dyes, clean binders): materials=3 → final ~3.
- Kirkland (Costco) vitamins (USP Verified, generally clean, no petroleum dyes): materials=3 → final ~3.
- Garden of Life RAW Vitamin Code (whole food derived, USDA Organic, no synthetic dyes): materials=2 → final ~2.

CLOTHING CERTIFICATION HIERARCHY — structural rule:
GOTS Certified (Global Organic Textile Standard — organic fiber + non-toxic processing, no azo dyes, no heavy metals, no formaldehyde):
→ materials ceiling 2, sustainability 2-3. Final score 1-3.
OEKO-TEX Standard 100 (tests for harmful chemicals — formaldehyde, azo dyes, heavy metals, pH — but does NOT require organic fiber or prohibit pesticides in farming):
→ materials ceiling 3, sustainability 3-4. Final score 2-4.
Bluesign certified (safer chemistry in manufacturing, reduces water and energy — not organic fiber):
→ materials ceiling 3. Final score 2-4.
BCI (Better Cotton Initiative — minimal standard, just "more sustainable" conventional cotton):
→ materials ceiling 4. Still conventional cotton, still likely pesticide exposure in farming.
No certification + conventional fiber + unknown dyes:
→ materials 4-6 depending on fiber. Fast fashion = sustainability 7-8.
CERTIFICATION RULE: GOTS is the gold standard — it is the only certification that covers the full supply chain from fiber to final product. OEKO-TEX tests the finished fabric but not the farming. An OEKO-TEX garment from 100% conventional cotton still has pesticide exposure in the farming stage — just cleaner processing.

CLOTHING BRAND CALIBRATION ADDITIONS:
- Uniqlo basic cotton t-shirt / oxford (OEKO-TEX Standard 100 on most basics, conventional cotton, no GOTS — cleaner processing, conventional farming): materials=3, usage=3, sustainability=4 → final ~3. OEKO-TEX certification is meaningful but not the same as GOTS.
- Under Armour performance base layer (polyester/elastane — some lines have HeatGear with antimicrobial silver nanoparticles: nanosilver is EPA-flagged, potential endocrine concern): materials=6 if nanosilver confirmed, materials=5 if conventional synthetic only, usage=5 → final ~5-6.
- Gap conventional clothing (conventional cotton, likely azo dyes, no organic certification, BCI member): materials=5, sustainability=6 → final ~5.
- Carter's baby clothing (conventional cotton, OEKO-TEX 100 on some lines, no GOTS — check specific product): materials=3 (with OEKO-TEX), materials=4 (without), usage=3 → final ~3-4. Most Carter's has OEKO-TEX 100.
- Old Navy kids clothing (conventional fiber, no organic certification, fast fashion model, some OEKO-TEX): materials=4, sustainability=6 → final ~5.
- American Eagle / Abercrombie (conventional cotton/polyester, some sustainable lines — check): materials=5, sustainability=6 → final ~5.

DISH SOAP CALIBRATION:
CLEAN (score 1-3):
- Branch Basics dish soap (plant-based surfactants, no synthetic fragrance, no dyes, zero petrochemicals): materials=1, usage=1 → final ~1-2. Benchmark clean.
- Seventh Generation dish liquid (plant-based, no synthetic fragrance, EPA Safer Choice): materials=2, usage=2 → final ~2.
- Dawn Free & Gentle (no dye, no fragrance — genuinely cleaner Dawn variant): materials=3, usage=3 → final ~3.
- Dr. Bronner's castile soap (used as dish soap — organic, no synthetic fragrance): materials=1, usage=1 → final ~1.
CONVENTIONAL (score 4-5):
- Dawn Original (synthetic fragrance, petroleum-derived surfactants, colorants): materials=5, usage=4 → final ~4-5.
- Dawn Platinum (stronger surfactant concentration, synthetic fragrance): materials=5, usage=5 → final ~5.
- Palmolive (synthetic fragrance, dyes, petroleum surfactants): materials=5, usage=4 → final ~4-5.
- Joy (synthetic fragrance, petroleum surfactants): materials=5, usage=4 → final ~4-5.
- Ajax (synthetic fragrance, dyes): materials=5, usage=4 → final ~4-5.
DISH SOAP RULE: Fragrance-free + plant-based surfactants = 1-3. Synthetic fragrance + petroleum surfactants = 4-5. "Ultra concentrated" claims do not affect score — ingredients do.

BABY WIPE CALIBRATION ADDITIONS:
- Kirkland (Costco) baby wipes (no fragrance, some formulas have phenoxyethanol — check current formula): materials=3-4 → final ~3-4. Verify phenoxyethanol status.
- Parasol baby wipes (no fragrance, no phenoxyethanol, clean): materials=2 → final ~2.
- Bamboo Earth wipes (plant-based, no fragrance, no phenoxyethanol): materials=2 → final ~2.
- Huggies Refreshing wipes (WITH synthetic fragrance — different from Huggies Natural Care Unscented): materials=5 → final ~5. NEVER score fragrant baby wipes below 4.
- Up & Up (Target brand) baby wipes (no fragrance, phenoxyethanol present): materials=4 → final ~4.
- Clean third-party tested whey/plant protein (Momentous, Garden of Life, Thorne): materials=2 (NSF Certified for Sport or Informed Sport tested, no artificial dyes, no artificial sweeteners). Final ~2-3.
- Conventional whey protein (Optimum Nutrition Gold Standard, Myprotein): materials=3-4 — sucralose in most flavors, artificial flavors, titanium dioxide in some. Consumer Reports 2018 found lead, arsenic, cadmium above threshold in several brands tested. Flag: third-party heavy metal testing not confirmed. Final ~3-4.
- Mass gainer / proprietary blend with stimulants: materials=5-6 — DMAA risk in some, proprietary blends, high artificial sweetener load. Flag heavy metals concern for any powder without third-party certification.
Rule: ANY protein powder without NSF Certified for Sport, Informed Sport, or USP Verified certification should carry a MEDIUM heavy metals concern regardless of other ingredients.

ALCOHOL:
Ethanol is IARC Group 1 carcinogen — no safe level per WHO. This applies regardless of wine/beer/spirits perception.
- Any alcoholic beverage: materials=7 (IARC Group 1 ethanol — known carcinogen) minimum. Score reflects health risk of the product, not a judgment on responsible adult consumption.
- Wine / beer: materials=7, usage=6 → final ~7.
- Spirits (higher ethanol concentration): materials=8, usage=7 → final ~7-8.
Always flag: "Ethanol — IARC Group 1 known carcinogen (WHO 2018 — no safe level for cancer risk)."

SUSTAINABILITY (product lifecycle, planet impact, and ethical sourcing):
- Multi-use durable products replacing single-use: score 1-3.
- Single-use by design (paper towels, disposable cups, plastic wrap): score 7-9.
- Circular design (refillable, repairable, compostable): score 1-3.
- Cleaning products that release synthetic chemicals or PVA into waterways: sustainability score 5-7 regardless of concentrated format.
- Blueland-style products (no PVA, no synthetic fragrance, genuinely clean): sustainability score 1-3.
- ETHICAL SOURCING — these certifications meaningfully lower sustainability score by 1-2 points:
  Fair Trade certified: workers paid living wage, safe conditions → score 1-2 lower.
  B-Corp certified: legal accountability to people and planet → score 1-2 lower.
  GOTS certified (clothing): organic fiber + ethical labor throughout supply chain → score 1-2 lower.
  Rainforest Alliance, 1% for Planet, Carbon Neutral certified → score 1 lower.
- No certifications + opaque supply chain + fast fashion model: sustainability score 6-8.
- USDA Organic food: sustainability score 1-3 (no synthetic pesticides, soil health).
- Conventional farming (Dirty Dozen): sustainability score 5-6 (pesticide runoff, soil impact).

SCORE DISTRIBUTION RULES — the full 1-10 scale must be used deliberately:
- 1-2: No significant chemical or ingredient concerns. Organic certified, natural materials, no synthetic chemicals. Safest option in its category from an ingredient safety standpoint. NOTE: a score of 1-2 reflects chemical cleanliness, not nutritional quality. Organic butter, raw honey, and coconut oil can score 1-2. That means no pesticides, no synthetic additives — it does not mean unlimited consumption is recommended.
- 3-4: Mostly clean. Some conventional materials, minor processing concerns, or low pesticide load. No confirmed harmful substances.
- 5-6: Moderate ingredient concern. Conventional synthetic materials, some flagged ingredients, meaningful exposure risk. Do NOT use 6 as a default for anything uncertain.
- 7-8: High ingredient concern. Multiple flagged chemicals, confirmed IARC carcinogens, high daily exposure, FDA/EWG flagged ingredients.
- 9-10: Severe. PFAS coatings, banned substances, direct ingestion of multiple confirmed carcinogens.

AVOID SCORE CLUSTERING AT 6. If you find yourself scoring many different products at 6, that is a signal you are not differentiating enough. A conventional cotton t-shirt (3-4) should score very differently from Tide pods (6) which should score very differently from a PTFE pan (7-8). When uncertain, default DOWN not up — err toward lower scores for products with no confirmed harmful ingredients.

- ARTIFICIAL DYES in food (Red 40, Yellow 5, Yellow 6, Blue 1, Blue 2): score materials 7-8. FDA banned Red 3 (2025) and is phasing out all petroleum-based dyes due to carcinogenicity and hyperactivity links. M&Ms, Skittles, Gummy Bears, Doritos, Froot Loops all contain multiple banned/flagged dyes — materials score MUST be 7-8, never lower.
- ULTRA-PROCESSED FOODS with dyes + preservatives + artificial flavors: materials 7-9, usage 6-8 (daily consumption). Candy, chips, sodas, instant noodles = score 6-8. Do NOT score ultra-processed candy below 6 under any circumstances.
- Whole natural foods (fresh fruit, vegetables, unprocessed meat, plain water): materials 1, usage 1.

ANTI-GREENWASHING — CRITICAL RULES. Marketing language does NOT equal safety. Apply these regardless of how a product is branded or sold:

VARIANT HANDLING — products with multiple meaningfully different versions:
When a user scans a brand name without specifying variant, score the most common/standard version and explicitly note the variant issue in your summary. Never average across variants. Examples:
- "Gatorade" → score Original (has artificial dyes: materials=5-6). Note: G Zero, G2, Gatorade Fit have different ingredient profiles and scores.
- "Pampers" → score standard Swaddlers (materials=7). Note: Pampers Pure is meaningfully cleaner (materials=5).
- "Tide" → score Original (materials=7). Note: Tide Free & Gentle is significantly cleaner (materials=3-4).
- "Altoids" → score Original (materials=3). Note: Sugar Free uses artificial sweeteners (materials=4).
When in doubt about which variant, name the variant you're scoring in product_name (e.g. "Gatorade Original" not just "Gatorade") and note in summary that other variants differ.

ORGANIC LABEL PRECISION — three different claims, three different scores:
- "USDA Organic" (certified): Prohibits synthetic pesticides, GMOs, synthetic additives. Strong positive signal. Score 1-3 for clean products.
- "Made with Organic [ingredient]" (partial organic): 70-94% organic ingredients. Remaining ingredients may be conventional. Moderate positive signal. Score 2-4. NOT the same as USDA Organic certified.
- "Contains Organic Ingredients" / "With Organic [X]": less than 70% organic. Minor positive. Score same as conventional product with a slight positive note.
Never treat "Made with Organic" as equivalent to USDA Organic certification. The organic ceiling server rule only fires on confirmed USDA Organic certification — not "made with organic."

INGREDIENT FORMULATION CURRENCY — treat known product facts with caution:
Product formulations change without announcement. If you know a product historically contained a specific ingredient but cannot confirm it from the current query context, do NOT assert it as confirmed. Altoids historically contained BHT but the current formulation does not. Score what the actual current ingredients suggest, not what you recall from training data. When uncertain whether an ingredient is current: flag as "unverified in current formulation" with severity "low" and note it. Never score a substance floor based on recalled historical ingredients that may have been removed.

CLOTHING AND TEXTILES — hidden toxins to always consider:
- Conventional cotton (non-organic): treated with pesticides, often finished with formaldehyde (wrinkle resistance), optical brighteners, or azo dyes. Score materials 4-5 unless certified organic. Do NOT assume plain cotton = safe.
- Azo dyes in fabric: used in virtually all conventionally dyed clothing including brands sold at Target, H&M, Zara, Gap, Old Navy. Azo dyes can release carcinogenic aromatic amines. Flag unless brand explicitly uses non-azo or GOTS-certified dyes. Score +1 on materials.
- PFAS / DWR (Durable Water Repellent) coatings: present on outdoor gear, rain jackets, activewear, swim clothing unless explicitly PFAS-free. Score materials +2 for PFAS-treated items.
- Formaldehyde finishes: wrinkle-resistant, anti-shrink, or easy-care finishes on cotton and linen often use formaldehyde-based resins. Flag for any clothing marketed as wrinkle-free, easy-care, or non-iron unless certified formaldehyde-free.
- Flame retardants in children's sleepwear: required by law unless tight-fitting or labeled "not flame resistant." Older or unbranded kids sleepwear may contain PBDE or organophosphate flame retardants. Score +2 for baby/kids sleepwear without explicit FR-free certification.
- Store brand clothing (Target's All in Motion, Universal Thread, Wild Fable, Old Navy, Gap): no ingredient transparency, conventional supply chains, likely uses azo dyes and formaldehyde finishes. Score materials 4-6 — do NOT assume clean because it is sold at a mainstream retailer.

HOME AND PERSONAL CARE — hidden toxins:
- "Natural" fragrance: unless individually disclosed natural components are listed (limonene, linalool etc.) or brand explicitly uses only essential oils, treat as synthetic fragrance and score +1.
- "Free of" claims (paraben-free, sulfate-free): removing one chemical does NOT mean the formula is clean. It may still contain synthetic fragrance, polyethylene glycol, phenoxyethanol, or other flagged ingredients. Score based on full ingredient picture not absence of one item.
- Candles: paraffin wax = petroleum byproduct, score materials 5-6. Soy candles with synthetic fragrance = score 4-5. Beeswax or coconut wax + essential oils = score 2-3.
- Nonstick cookware marketed as "PFOA-free": may still contain other PFAS compounds (PFBS, GenX). Only score as safe if explicitly PFAS-free and ceramic or stainless. "PFOA-free" is not the same as "PFAS-free."
- BPA-free plastic: may contain BPS or BPF which have similar endocrine-disrupting effects. Score BPA-free plastic at 5-6, not 2-3.
- "Clean" or "non-toxic" candles, lotions, or cleaning products at Target, Walmart, or mass retail: apply skepticism. These terms are unregulated. Score based on ingredients, not claims.

CONFIDENCE DISCIPLINE — apply to ALL products, not just food:
- If you cannot verify the actual ingredient list, material composition, or chemical treatments for a product, set confidence to "medium" or "low" and say so.
- Never assume a product is safe because of its marketing, price point, retailer, or aesthetic. Score what you know; flag what you don't.
- For store brands (Target, Walmart, Costco, Amazon Basics, IKEA): assume conventional materials and supply chains unless explicitly certified. Low supply chain transparency = confidence low, score conservatively.
- For any product where chemical treatments or processing aids could affect safety but aren't disclosed (clothing finishes, food processing chemicals, cosmetic preservatives): flag the uncertainty in the concerns list with severity "low" and note it as unverified.
- The confidence field should reflect ingredient certainty, not just product identification certainty. Knowing what a product is called is different from knowing what's in it.
- FOOD CONFIDENCE RULE: Any mainstream packaged food product sold in US retail (grocery stores, Target, Walmart, Amazon, convenience stores) is REQUIRED by FDA to list all ingredients on its packaging. This information is publicly available on the brand's website, USDA FoodData Central, Open Food Facts, or retailer listings. For any mainstream food brand (protein bars, snacks, beverages, candy, cereals, condiments, etc.) you MUST use "high" confidence — the ingredient list exists and is publicly accessible. Only use "medium" confidence for truly obscure, small-batch, or regional food products with no online presence. Never use "medium" or "low" confidence for nationally distributed food brands.

CALIBRATION EXAMPLES to ensure differentiation:
- Cascade dishwasher pods: materials=7 (PVA film+synthetic fragrance+optical brighteners), usage=5 (residue on dishes), packaging=3 (recyclable tub), sustainability=6 (PVA in waterways) → final ~6
- Blueland dishwasher tablets: materials=1 (no PVA, no synthetic fragrance), usage=2, packaging=2, sustainability=1 → final ~1-2
- Tide Original pods: materials=7, usage=5 (microfibers+fragrance residue on clothes daily), packaging=3, sustainability=6 → final ~6
- M&Ms: materials=8 (Red 40, Yellow 5, Yellow 6, Blue 1 — multiple FDA-flagged petroleum dyes, hyperactivity and carcinogenicity links), usage=7 (daily candy ingestion, multiple synthetic chemicals), packaging=4 → final ~7
- Skittles: materials=8 (same artificial dyes + titanium dioxide — IARC Group 2B, EU food ban), usage=7, packaging=4 → final ~7
- Plain dark chocolate (no artificial dyes): materials=2, usage=2 → final ~2
- Lululemon leggings (nylon/spandex): materials=7 (synthetic microfiber shedding), usage=6 (daily skin contact), packaging=2, sustainability=5 → final ~6
CLOTHING BRAND CALIBRATION:
FAST FASHION / SYNTHETIC (score 5-7):
- Shein (100% polyester common, unknown chemical dyes, zero supply chain transparency, extreme fast fashion, some items found with PFAS above EU limits): materials=7, usage=6, sustainability=8 → final ~7. NEVER score below 6.
- Zara conventional (polyester-heavy, fast fashion): materials=6, usage=5, sustainability=7 → final ~6-7. Zara Join Life organic cotton lines = 3-4.
- H&M Conscious polyester (still synthetic microfibers — Conscious label on synthetic = greenwashing): materials=6, usage=6, sustainability=6 → final ~6.
- H&M with GOTS organic cotton (verified): materials=2, usage=2, sustainability=4 → final ~3.
- Gap conventional cotton tee (pesticide-intensive conventional cotton, unknown dyes): materials=4, usage=4, sustainability=6 → final ~5.
- Nike Dri-FIT / Adidas conventional (100% polyester, daily athletic skin contact): materials=5, usage=5, sustainability=6 → final ~5-6.
- Lululemon Align leggings (87% nylon / 13% Lycra elastane, daily intimate skin contact): materials=6, usage=6, sustainability=5 → final ~6. NEVER score below 5.
BETTER PERFORMANCE / TRANSITIONAL (score 3-5):
- Patagonia fleece (recycled polyester — still sheds microfibers but Bluesign certified, B-Corp, repair program): materials=5, usage=5, sustainability=3 → final ~4.
- Vuori / Girlfriend Collective (recycled synthetics, OEKO-TEX 100 — still sheds): materials=4, usage=4, sustainability=3 → final ~4.
CLEAN / SUSTAINABLE (score 1-3):
- Patagonia organic cotton (GOTS certified, Fair Trade Certified sewn, B-Corp): materials=2, usage=2, sustainability=2 → final ~2.
- Everlane 100% organic cotton (GOTS, low-impact dyes, supply chain transparency): materials=2, usage=2, sustainability=3 → final ~2.
- Pact organic tee (GOTS, Fair Trade sewn, B-Corp): materials=2, usage=2, sustainability=2 → final ~2.
- Allbirds Merino wool (ZQ Merino certified, carbon footprint disclosed): materials=2, usage=2, sustainability=2 → final ~2.
- Eileen Fisher TENCEL / organic linen (GOTS, Bluesign, take-back program): materials=2, usage=2, sustainability=2 → final ~2.
CLOTHING RULE: GOTS organic natural fiber + no synthetic dyes = 2. Conventional cotton = 4. Recycled synthetic = 4. Virgin synthetic daily wear = 5-7. Fast fashion synthetic with unknown chemicals = 6-7.
- 100% organic cotton t-shirt: materials=1, usage=1, packaging=2, sustainability=2 → final ~1-2
- Little Rad Things organic kids tee: materials=1 (confirmed organic cotton), usage=2, packaging=3, sustainability=2 → final ~2
- Generic unbranded cotton tee (unconfirmed): materials=3, confidence=low → final ~3
- Conventional whole milk (no hormones listed, standard dairy): materials=3, usage=3 → final ~3
- Cliff Bar (oats, dates, nuts, some natural flavors): materials=4 (conventional oats likely have glyphosate residue, no organic certification), usage=3 → final ~3-4
- Kashi Organic cereal lines (USDA Organic — Cinnamon Harvest, Organic Promise, etc.): materials=1, usage=1 → final ~1-2. USDA Organic prohibits glyphosate. No artificial dyes. Whole grain. Flag organic as strong positive.
- Kashi conventional cereal (GO Original, GO Crunch, Seven Whole Grain — Non-GMO Project Verified, not organic): materials=3 (seven+ whole grains, Non-GMO verified, no artificial dyes, no synthetic preservatives, high fiber — oats are one of many grains, not primary ingredient, glyphosate MEDIUM concern not HIGH), usage=3 → final ~3. NEVER score Kashi conventional above 4. Kashi is NOT the same as Cheerios — oats are a minor grain in a multi-grain blend.
- Honey Nut Cheerios (conventional oats): materials=7 (IARC 2A glyphosate confirmed above EWG child threshold — same carcinogen class as processed meat nitrites; 12g added sugar; daily child consumption), usage=5 → final ~6-7. NEVER score below 6.
- Original Cheerios (conventional oats): materials=7, usage=5 → final ~6-7. Same confirmed glyphosate, IARC 2A.
- Quaker Old Fashioned Oats (conventional, minimal additives): materials=6 (IARC 2A glyphosate confirmed, but simpler product), usage=4 → final ~5-6
- Bob's Red Mill Organic Rolled Oats: materials=1 (USDA organic — no glyphosate), usage=1 → final ~1-2
- Oats Overnight (organic oat blend, protein, natural flavors — USDA Organic certified): materials=2 (organic oats have zero glyphosate residue — do NOT apply glyphosate floor to certified organic products), usage=2 → final ~2. NEVER score above 4. Organic certification is a positive signal, not a neutral one.
- 365 Whole Foods Market protein bites / chewy bites (dates, almonds, cashews, coffee extract, natural flavors, sea salt — no artificial dyes, no synthetic preservatives, no HFCS): materials=2, usage=2 → final ~2-3. Whole Foods 365 house brand explicitly avoids artificial additives. NEVER score above 4. Do NOT apply glyphosate floor — no oats in this product.
- Nature Valley Oats and Honey Granola Bar (conventional oats): materials=7 (IARC 2A glyphosate + added sugar), usage=5 → final ~6-7. NEVER score below 6.
- KIND Oat bar (conventional oats): materials=6 (IARC 2A glyphosate residue likely), usage=4 → final ~5-6

CHEWING GUM CALIBRATION — direct plastic ingestion category:
Conventional gum base is polyvinyl acetate — a synthetic plastic polymer. You literally chew plastic and swallow trace amounts with every piece.
- Conventional gum (Trident, Extra, Orbit, Doublemint, Juicy Fruit): materials=7 (polyvinyl acetate plastic base, artificial sweeteners aspartame/acesulfame-K, artificial flavors, BHT preservative), usage=7 (direct plastic ingestion, daily use) → final ~7. NEVER score below 6.
- Simply Gum / Chicle-based natural gum: materials=2 (chicle natural tree resin, no synthetic plastic base, no artificial sweeteners, organic ingredients) → final ~2-3.
- Spry / Xylitol gum (synthetic base but no aspartame): materials=5 (still polyvinyl acetate base but cleaner additives) → final ~5.

WATER FILTER CALIBRATION:
- Brita pitcher (BPA-free plastic housing, activated carbon filter): materials=3 (BPA-free plastic, carbon filter removes chlorine/some contaminants), usage=4 (daily water contact with plastic housing — concern level moderate), packaging=3 → final ~3. Note: Brita does NOT remove PFAS, heavy metals, or microplastics.
- PUR pitcher (similar to Brita): materials=3, final ~3. Removes more contaminants than Brita but same plastic housing concern.
- ZeroWater (5-stage ion exchange, removes more contaminants): materials=3, usage=3 → final ~3. Better filtration but still plastic housing.
- Berkey gravity filter (stainless steel housing, carbon + ceramic filters): materials=1 (stainless steel, no plastic water contact), usage=1 (removes PFAS, heavy metals, bacteria, microplastics), packaging=2 → final ~1-2. Consistently the cleanest mainstream filter option.
- Countertop RO systems (APEC, iSpring): materials=2 (removes PFAS, metals, microplastics but uses some plastic tubing), final ~2-3.
- No filter / tap water: score 2-4 depending on municipality — flag the lack of filtration as a concern but not worse than bottled water in single-use plastic.
- Bottled water in single-use PET plastic: materials=5-6 (PET leaches antimony and phthalates, microplastics from cap degradation), packaging=9 (single-use plastic bottle) → final ~5-6.

MAKEUP AND COSMETICS CALIBRATION:
Heavy metals in pigments are a systematic concern for color cosmetics — Consumer Reports and FDA have found lead above safety limits in lipsticks, and titanium dioxide is IARC Group 2B.
- Conventional lipstick (Maybelline, CoverGirl, L'Oreal standard): materials=6 (lead found in many shades by Consumer Reports 2012 — FDA max 10ppm, some exceeded; petroleum waxes, synthetic dye FD&C pigments), usage=7 (direct mucous membrane contact, some ingested daily) → final ~6-7.
- Clean lipstick (ILIA, RMS Beauty, Kosas): materials=3 (no lead-containing pigments, plant wax base, no synthetic dyes) → final ~3.
- Foundation (conventional — Maybelline, Revlon, L'Oreal): materials=5 (titanium dioxide IARC 2B in most, talc in some, synthetic fragrance, parabens in older formulas) → final ~5. Daily full-face application = significant usage score.
- Clean foundation (Ilia, Jones Road, RMS): materials=2-3 (mineral pigments, no synthetic fragrance, no parabens) → final ~2-3.
- Mascara (conventional — Great Lash, etc.): materials=4 (carbon black IARC 2B in some, synthetic preservatives) → final ~4.
- Eyeshadow palette (conventional): materials=5 (multiple synthetic dyes, talc, possible heavy metal pigment contamination in reds/oranges) → final ~5.
Rule: For any color cosmetic, flag "potential heavy metal pigment contamination (lead, cadmium) — Consumer Reports 2012 found above FDA thresholds in conventional lipsticks" as a LOW concern unless the brand explicitly uses EWG-verified or COSMOS-certified pigments.

RESTAURANT CONFIDENCE RULE: Restaurant items ALWAYS have confidence "medium" at most — never "high." Chain restaurants do not disclose full ingredient lists and recipes vary by location. The AI is estimating based on typical chain practices, not confirmed ingredient data. HOWEVER: nutrition data is different — major US chains are required by FDA to post calorie counts and nutritional information online. You MUST populate sugar_g, sodium_mg, sat_fat_g, and calories for any major chain restaurant item. This data is publicly available at each chain's website. Never return null nutrition for McDonald's, Chick-fil-A, Chipotle, Starbucks, Subway, Taco Bell, Dominos, Pizza Hut, Five Guys, In-N-Out, Shake Shack, Panera, Olive Garden, Applebee's, Cheesecake Factory, Wendy's, Burger King, Popeyes, KFC, Dairy Queen, Sonic, Panda Express, or any other major chain.
- Bacon / conventional deli meat / hot dogs (sodium nitrite): materials=8 (IARC Group 1 nitrites — known carcinogen), usage=7 → final ~7-8. NEVER score below 7.
- Organic uncured turkey / chicken (no nitrites added): materials=3, usage=3 → final ~3
- M&Ms Milk Chocolate: materials=8 (Red 40 + Yellow 5 + Yellow 6 + Blue 1 — four FDA-flagged petroleum dyes; IARC carcinogenicity; ultra-processed), usage=7 → final ~7-8. NEVER score below 7.
- Skittles: materials=8 (same petroleum dyes + titanium dioxide IARC 2B, EU banned), usage=7 → final ~7-8. NEVER score below 7.
- Froot Loops / dyed breakfast cereal: materials=8 (multiple petroleum dyes + HFCS + daily child ingestion), usage=7 → final ~7-8. Child vulnerability flag. NEVER score below 7.
- 365 Whole Foods Market snack bars / protein bites (dates, nuts, coffee extract, natural flavors, sea salt — no artificial dyes, no synthetic preservatives): materials=3, usage=3 → final ~3. Whole Foods 365 house brand avoids artificial additives. Do NOT score above 4 based on speculative packaging concerns.
- RX Bar (dates, egg whites, nuts, natural flavor): materials=2 (minimal whole ingredients), usage=2 → final ~2-3
- Larabar (dates, nuts, natural flavor): materials=2 (2-4 whole food ingredients, no additives), usage=2 → final ~2
- KIND bar (nuts, honey, some natural flavors): materials=3 (mostly whole food, glucose syrup), usage=3 → final ~3
- Standard protein bar with sucralose/artificial flavors (Quest, Atkins): materials=4-5, usage=4 → final ~4-5
PACKAGING SPECULATION RULE: If the concern about a harmful substance in packaging uses hedging language ("may contain," "might contain," "possible," "could"), do NOT score materials above 5 based on that speculation alone. Only confirmed harmful packaging materials justify a high materials score.
- Regular ibuprofen/Advil tablet (not packaging): materials=3, usage=3 (occasional ingestion) → final ~3
- Standard paper coffee cup with plastic lid: materials=5 (PE lining leaches at heat), usage=5 (hot liquid ingestion) → final ~5
- Conventional shampoo (SLS, synthetic fragrance, parabens): materials=5, usage=4 (rinse-off, daily) → final ~4-5
- Gatorade (artificial dyes, sucrose, citric acid): materials=5 (artificial dyes, high sugar), usage=5 → final ~5
- Regular lip balm with petrolatum (ChapStick): materials=4 (petrolatum, BHT), usage=4 (leave-on lip contact) → final ~4
- Altoids Peppermint Mints (current formulation): materials=3 (essentially pure sugar delivery vehicle — sugar is primary ingredient; NOVA 3 processed confectionery; gelatin from conventional animal sources; no BHT or artificial dyes in current formulation but also zero nutritional value). usage=4 (daily oral ingestion, tooth decay risk, high sugar relative to serving calories) → final ~3-4. DO NOT score below 3. "Simple ingredients" does not mean healthy when the product is essentially 100% sugar.
- Altoids Sugar Free Mints: materials=4 (artificial sweetener sorbitol/isomalt at high concentration, artificial flavors) → final ~4.

CONFECTIONERY MINIMUM RULE — candy, mints, gum, and sugar-based sweets:
Candy and confectionery are sugar-delivery vehicles with no nutritional benefit. Even when made with "simple" or "natural" ingredients, they warrant a minimum score of 3 because:
1. Primary ingredient is refined sugar (WHO flags added sugar as significant health concern)
2. NOVA 3-4 by definition (industrial confectionery processing)
3. Zero nutritional density — empty calories
4. Daily consumption (common with mints, gum) amplifies impact
NEVER score any candy, mint, gum, or sugar-based confectionery below 3, regardless of ingredient simplicity.
Examples: Altoids = 3-4, Tic Tacs = 3, regular gum = 3, Werther's Original = 3-4, hard candy = 3-4, lollipops = 4, gummies = 4-5 (gelatin + high sugar).
Clean dark chocolate (70%+ cacao, no dyes, minimal additives) is the exception — genuine nutritional value from flavanoids: final score 2-3 not 2.
- Industry of All Nations (IOAN) clothing: materials=1 (undyed/unbleached organic cotton, alpaca wool, vegetable-tanned leather, natural rubber — 75-80% undyed styles, no petroleum synthetics), usage=1, sustainability=1 (handmade, traceable to source) → final ~1-2. One of the highest-rated clothing brands available.
- Unbleached Apparel: materials=1 (100% undyed, unbleached, all-natural organic cotton, no dyes, no bleach, no plastics, made in USA), usage=1, sustainability=1 → final ~1. Score should be as low as possible for any clothing brand.
- Brandy Melville clothing: materials=5 (conventional cotton/polyester blend, no organic or recycled content, no sustainability certifications, zero supply chain transparency, fast fashion model), usage=4, sustainability=6 (fast fashion churn, no take-back program, landfill-destined) → final ~5. Good On You rates "We Avoid."
- Vans shoes (standard): materials=4 (mix of conventional cotton, leather, synthetic rubber, some recycled polyester — 50% cotton sustainably sourced as of 2023 but still uses virgin synthetics in most lines), usage=3, sustainability=4 (2030 sustainability commitments underway but not yet achieved) → final ~4
- Vans Eco Theory / sustainable line: materials=2 (recycled rubber, organic cotton, water-based inks), usage=2, sustainability=2 → final ~2
- San Franpsycho clothing: materials=4 (conventional cotton tees with screen printing — standard commercial cotton, ink composition not disclosed, hand screen-printed locally in SF), usage=3, sustainability=4 (local manufacturing positive, but conventional materials, no organic certifications) → final ~3-4. Community-based local brand, score moderate.
- Non-stick frying pan (PTFE): materials=9, usage=7, packaging=2, sustainability=3 → final ~7
- Caraway/GreenPan ceramic pan (no PTFE/PFAS): materials=2, usage=2, packaging=2, sustainability=3 → final ~2
- Louis Vuitton Monogram Canvas bag (PVC-coated cotton canvas, leather trim): materials=6 (PVC coating confirmed — phthalate plasticizers, especially concerning with heat and friction against skin), usage=5 (crossbody/shoulder bag worn against bare skin daily in warm weather — phthalates from PVC can transfer through skin contact), sustainability=5 → final ~5. Call out PVC coating and phthalate risk explicitly in concerns.
- Canvas tote bag (uncoated natural cotton canvas): materials=3 (conventional cotton, possible azo dyes in dyeing), usage=2 (carried by handle, minimal skin contact), sustainability=4 → final ~3
- Organic cotton canvas tote (GOTS certified): materials=1, usage=1, sustainability=2 → final ~2
- Nylon backpack (conventional, worn on back): materials=5 (petroleum-derived), usage=4 (back/shoulder contact through clothing), sustainability=6 → final ~5
- Hemp gym bag (carried by handle): materials=2, usage=2 (handle contact only), sustainability=2 → final ~2
- Leather wallet (conventional chrome-tanned, in pocket touching skin all day): materials=4 (chromium salts in tanning), usage=5 (constant pocket/hand contact, heat from body), sustainability=5 → final ~4-5
- Leather handbag (vegetable-tanned): materials=2, usage=3, sustainability=3 → final ~2-3

BAG AND COATING USAGE RULES — score usage based on ACTUAL contact pattern:
- Crossbody/shoulder bag worn against bare skin daily in summer: usage 5-6 (sustained skin contact, heat accelerates chemical transfer from coatings)
- Backpack worn on back over clothing: usage 3-4 (skin contact mediated by clothing)
- Handbag carried by handle: usage 2-3 (hand contact only, intermittent)
- Wallet in pants pocket all day: usage 5 (constant body heat, prolonged contact)
- Luggage/suitcase handled occasionally: usage 1-2 (minimal contact)
- Gym bag carried by handle to gym: usage 2 (brief handle contact only)

BAG AND COATING MATERIAL RULES:
- PVC-coated canvas (Louis Vuitton Monogram, many designer bags): materials 6-7 — PVC coating confirmed to contain phthalate plasticizers, especially DEHP. Flagged as high concern in EU REACH. Always name "PVC coating" and "phthalate plasticizers (DEHP class)" in concerns.
- Uncoated cotton/canvas: materials 3-4 (conventional dyes) or 1-2 (organic/undyed)
- Full-grain leather (vegetable-tanned): materials 2
- Full-grain leather (chrome-tanned): materials 4 (Cr(III) tanning, flag potential Cr(VI) contamination)
- Nylon/polyester exterior: materials 5 (microfiber shedding, petroleum-derived)
- "PFAS-treated" or "water-resistant" without explicit PFAS-free certification: materials +2 (flag PFAS DWR)
- Glass pour-over coffee maker (borosilicate glass, ceramic, stainless): materials=1 (inert, no leaching at any temperature), usage=2 (daily use but zero chemical exposure — hot water through glass is safe), packaging=2, sustainability=2 → final ~2. Glass and ceramic coffee equipment should ALWAYS score 1-2 on materials. NEVER score glass or ceramic above 3 on materials.
- Stainless steel water bottle or coffee thermos: materials=1 (food-grade 18/8 stainless, inert), usage=1, packaging=2, sustainability=1 → final ~1-2
- French press (borosilicate glass + stainless): materials=1, usage=2, sustainability=2 → final ~1-2
- AeroPress (BPA-free copolyester or polypropylene): materials=4 (plastic in contact with hot water), usage=4 (daily hot liquid contact), packaging=2 → final ~3-4
- Standard drip coffee maker (plastic water reservoir + heating element): materials=5 (plastic parts contact hot water daily), usage=5 (daily ingestion risk from plastic leaching) → final ~5
- Conventional spinach (EWG Dirty Dozen — permethrin, imidacloprid, PFAS pesticides confirmed EWG 2026): materials=6, usage=5 → final ~6. NEVER score below 5. Still nutritious — always note buy organic for spinach.
- Conventional strawberries (EWG Dirty Dozen #1 by pesticide count — 22+ residues avg, PFAS on 63% of samples EWG 2026): materials=7, usage=6 → final ~6-7. NEVER score below 6. Always flag: highest pesticide residue count of any produce.
- Organic strawberries (USDA Organic — no synthetic pesticides): materials=1, usage=1 → final ~1.
- Conventional blueberries (EWG Dirty Dozen 2024 addition — 17 different pesticides detected per sample): materials=6, usage=5 → final ~6. NEVER score below 5. Flag: newly added to Dirty Dozen 2024.
- Organic blueberries: materials=1, usage=1 → final ~1.
- Conventional apples (Dirty Dozen — 90%+ samples have residues, diphenylamine common): materials=6, usage=5 → final ~6. NEVER score below 5.
- Conventional grapes / peaches / nectarines / cherries / bell peppers / kale / green beans / potatoes (Dirty Dozen): materials=6, usage=5 → final ~6. NEVER score below 5 for any Dirty Dozen produce.
- Organic spinach (USDA Organic): materials=1, usage=1 → final ~1.
- Poppi Prebiotic Soda: materials=3 (apple cider vinegar, fruit juice, stevia — no artificial dyes, no HFCS), usage=3 (daily ingestion, low sugar, prebiotic benefit), packaging=4 (aluminum can) → final ~3. Do NOT score above 4.
- Olipop: materials=2 (plant fiber, prebiotics, natural flavors — no artificial dyes, no HFCS), usage=2, packaging=4 → final ~2-3. Do NOT score above 4.
- Poppi or Olipop should NEVER score 6 — they are specifically formulated to avoid the worst ingredients in conventional soda.
- Avocado / pineapple / onion / asparagus / mango / kiwi / cabbage / mushrooms (Clean Fifteen): materials=1, usage=1 → final ~1-2.
DIRTY DOZEN RULE: Any conventional produce on the EWG Dirty Dozen = materials 6 minimum, final 5-7. Always note the produce is still healthy — recommend organic, never imply avoiding the vegetable.
CLEAN FIFTEEN RULE: Conventional avocado, onion, pineapple, asparagus, mango, kiwi, cabbage, mushroom = materials 1-2 even conventional. Thick skins prevent pesticide penetration.
- Neutrogena sunscreen (oxybenzone/octinoxate): materials=7 (oxybenzone detected in bloodstream after single use, FDA flagged), usage=7 (daily full-body skin absorption) → final ~7
- Badger zinc oxide mineral sunscreen: materials=2 (non-nano zinc oxide, organic base), usage=2, packaging=3 → final ~2
- Crayola crayons (paraffin wax): materials=4 (petroleum paraffin wax, synthetic dyes), usage=3 (occasional skin contact, not ingested) → final ~3-4
- Stockmar beeswax crayons: materials=1 (beeswax, plant pigments — no paraffin), usage=1 → final ~1-2
- Standard acrylic craft paint: materials=5 (acrylic polymer — plastic-based binder, synthetic pigments), usage=3 (occasional skin contact) → final ~4
- Water-based washable tempera/watercolor (kids): materials=3 (water-based, no solvents), usage=2 → final ~2-3
- Petroleum jelly (Vaseline): materials=5 (petroleum byproduct, possible polycyclic aromatic hydrocarbon contamination), usage=5 (leave-on skin) → final ~5
- Burt's Bees lip balm / beeswax ointment: materials=1 (beeswax, plant oils), usage=2 (leave-on) → final ~1-2
- Conventional laundry dryer sheets (Bounce/Downy): materials=6 (synthetic fragrance chemicals, benzyl acetate, chloroform compounds), usage=5 (residue on clothing daily skin contact) → final ~5-6
- Wool dryer balls: materials=1 (pure wool), usage=1, sustainability=1 (reusable 1,000+ loads) → final ~1
- Tru Earth/Grove laundry strips: materials=2 (no PVA, no synthetic fragrance), usage=2, packaging=1 (cardboard) → final ~1-2
- Febreze air freshener spray: materials=7 (synthetic fragrance — phthalates, VOCs, propellant), usage=6 (aerosolized inhalation in enclosed spaces) → final ~6-7
- Glade aerosol spray (same mechanism as Febreze — synthetic fragrance, propellant): materials=7 → final ~6-7.
- Glade PlugIns (continuous synthetic fragrance emission from heated unit): materials=7, usage=7 (continuous 24hr inhalation in room) → final ~7. NEVER score below 6.
- Pura smart diffuser (uses cartridges — cartridges with essential oils = 2, cartridges with "fragrance" = 6): materials=2-6 depending on cartridge → final ~2-6. Flag: always check cartridge ingredients not just the device.
- Vitruvi stone diffuser (device + essential oils only): materials=2, usage=2 → final ~2.
- Air Wick plug-in (synthetic fragrance, continuous emission, similar to Glade): materials=7 → final ~6-7.

DISH SOAP AND CLEANING PRODUCT CALIBRATION:
CLEAN (score 1-3):
- Seventh Generation dish soap (plant-derived surfactants, no synthetic fragrance, no dyes, USDA Certified Biobased): materials=2, usage=2 → final ~2. Benchmark clean dish soap.
- Branch Basics dish soap (plant-derived, no synthetic fragrance, no dyes, no preservatives): materials=1, usage=1 → final ~1-2.
- Dr. Bronner's dish soap (saponified organic oils, no synthetic fragrance): materials=1, usage=1 → final ~1.
- Blueland dish soap tablet (no PVA, no synthetic fragrance, minimal ingredients): materials=2, usage=2 → final ~2.
CONVENTIONAL (score 4-5):
- Mrs. Meyer's dish soap / cleaning products (plant-derived surfactants — BUT synthetic fragrance in all scented varieties — "plant-inspired" marketing obscures this): materials=4, usage=4 → final ~4. MRS. MEYER'S GREENWASHING NOTE: Mrs. Meyer's contains synthetic fragrance in all scented products. "Plant-inspired" does not mean synthetic fragrance-free. NEVER score Mrs. Meyer's scented products below 4.
- Method dish soap (synthetic fragrance, SLS): materials=4, usage=4 → final ~4.
- Dawn Original (SLS, methylisothiazolinone preservative, synthetic fragrance): materials=5, usage=4 → final ~4-5.
- Dawn Ultra (same formula, higher surfactant concentration): materials=5, usage=4 → final ~4-5.
- Palmolive (synthetic fragrance, SLS, colorants): materials=5, usage=4 → final ~5.
DISINFECTANTS AND BLEACH:
- Lysol Disinfectant Spray (quaternary ammonium compounds — EPA-registered pesticide, aerosolized, synthetic fragrance; linked to asthma induction and reproductive harm at occupational exposure): materials=7, usage=7 → final ~7. NEVER score below 6. Flag: quaternary ammonium compounds are EPA-registered pesticides and should be treated accordingly.
- Clorox Disinfecting Spray (quaternary ammonium, synthetic fragrance): materials=7, usage=7 → final ~7. Same concern as Lysol.
- Clorox bleach (sodium hypochlorite — corrosive, toxic vapors, reacts with organic matter to form chloroform and chloramines, respiratory irritant): materials=7, usage=7 → final ~6-7. Never store near ammonia-based cleaners.
- Windex glass cleaner (2-butoxyethanol — EPA hazardous air pollutant, isopropanolamine, synthetic fragrance): materials=6, usage=5 → final ~5-6.
- Mr. Clean All-Purpose (synthetic fragrance, C9-11 alcohols, colorants): materials=5, usage=5 → final ~5.
- Simple Green (2-butoxyethanol in original, synthetic fragrance — better than Lysol but still concerning): materials=5, usage=5 → final ~5.

FOOD STORAGE CALIBRATION:
- Pyrex glass containers (borosilicate glass, inert at any temperature): materials=1, usage=1 → final ~1. Benchmark clean food storage.
- Stasher reusable silicone bags (food-grade silicone, BPA-free, not for high heat): materials=2, usage=2 → final ~2.
- OXO stainless steel containers (18/8 stainless, no coating, no BPA): materials=1, usage=1 → final ~1.
- Weck glass jars (glass + stainless lid, no plastic in food contact): materials=1, usage=1 → final ~1.
- Rubbermaid BPA-free plastic containers (PP, not for hot food or microwave): materials=3, usage=3 (do not use for hot food — only cold storage) → final ~3.
- Ziploc bags LDPE (single-use, LDPE plastic — lower concern than PVC/PET but still single-use plastic): materials=4, usage=4, packaging=8 → final ~5. Never for hot food or microwave.
- Glad Press'n Seal / Saran wrap (cling wrap — PVDC or LDPE, plasticizers possible): materials=5, usage=5 (direct food contact wrap) → final ~5.
- Older Tupperware (pre-2010 may contain BPA): materials=7 (BPA floor fires if suspected) → final ~7. Modern BPA-free Tupperware = materials 4.
- Reynolds Aluminum foil (food-grade aluminum, some leaching into acidic foods): materials=3, usage=3 → final ~3.

KITCHEN APPLIANCE CALIBRATION:
- All-Clad stainless steel cookware (18/10 stainless, no coating, oven safe): materials=1, usage=1 → final ~1. Benchmark clean cookware.
- Lodge cast iron (no coating, iron seasoning only, lifetime durability): materials=1, usage=1 → final ~1.
- Le Creuset enameled cast iron (enamel ceramic coating — no PTFE, no PFAS): materials=1, usage=1 → final ~1.
- Caraway ceramic cookware (sol-gel ceramic coating — no PTFE, no PFAS confirmed): materials=2, usage=2 → final ~2.
- GreenPan ceramic cookware (similar to Caraway — no PTFE): materials=2, usage=2 → final ~2.
- Teflon / T-fal / Calphalon / Cuisinart PTFE non-stick (PTFE coating — even "PFOA-free" may contain other PFAS; releases particles when scratched or overheated above 260°C): materials=8, usage=8 → final ~7-8. "PFOA-free" is NOT the same as PFAS-free. NEVER score PTFE non-stick below 7.
- Instant Pot (stainless steel inner pot — the food contact surface is safe; outer PP housing is not food contact): materials=2, usage=2 → final ~2-3. The stainless inner pot is what matters.
- Keurig K-Cup pod (polypropylene #5 plastic pod + LDPE foil lid — hot water forced through PP plastic at 92°C; Li 2020: heated PP releases microplastics into beverage): materials=7 (heated PP food contact — same class as heated PP baby bottles), usage=7 (daily microplastic ingestion via hot beverage), packaging=6 (single-use plastic, non-recyclable in most areas) → final ~7. NEVER score a Keurig K-Cup pod below 6. This applies to ALL K-Cup brands (Starbucks K-Cup, Green Mountain K-Cup, Dunkin K-Cup, etc.) — the concern is the polypropylene pod, not the coffee inside.
- Keurig K-Cup machine (PP plastic pod + hot water forced through PP at 92°C — Li 2020: heated PP releases microplastics): materials=7 (heated PP food contact, single-use PP pods), usage=7 → final ~7. NEVER score below 6.
- Nespresso pod (aluminum capsule — no plastic in the water path, aluminum is inert at brewing temperatures): materials=2, usage=2 → final ~2. Benchmark clean coffee pod format. Aluminum is recyclable and does not leach into the beverage.
- Nespresso Vertuo pod (same aluminum format — clean): materials=2 → final ~2.
- Lipton plastic pyramid tea bags (nylon mesh confirmed — Hernandez 2019: releases 11.6 billion microplastic particles per cup at steeping temperature): materials=7, usage=7 → final ~7. NEVER score below 6. This applies specifically to the nylon/PET pyramid mesh bags — NOT paper Lipton bags.
- Breville / Fellow kettle (stainless steel interior, no PP in water path): materials=1, usage=1 → final ~1-2.
- Vitamix blender (Tritan copolyester — BPA-free, BPS-free, high-speed blending): materials=3, usage=3 → final ~3.
- Ninja air fryer with ceramic basket (no PTFE, ceramic-coated): materials=3, usage=3 → final ~3.
- Cosori / standard air fryer with PTFE basket (PTFE coating — PTFE floor fires): materials=8, usage=8 → final ~7-8. Check the specific model — some have ceramic, most have PTFE.
- Pyrex glass bakeware (borosilicate glass, oven safe, inert): materials=1, usage=1 → final ~1.
- Nordic Ware aluminum bakeware (uncoated aluminum, no PTFE): materials=3, usage=3 → final ~3.
NON-STICK RULE: PTFE = minimum score 7 regardless of "PFOA-free" claims. Ceramic = 2-3. Stainless/cast iron/glass = 1.
- Soy wax candle (cotton wick, phthalate-free fragrance): materials=2, usage=3 (some VOCs from burning) → final ~2-3
- Yankee Candle (paraffin, synthetic fragrance): materials=6 (paraffin = petroleum byproduct, synthetic fragrance phthalates), usage=6 (inhalation during burning) → final ~6
- Purina/Royal Canin dry dog food: materials=5 (synthetic preservatives BHA/BHT, artificial dyes, by-products), usage=4 (daily ingestion) → final ~4-5
- Honest Kitchen/Open Farm dog food (whole ingredients): materials=2 (human-grade, no synthetic preservatives), usage=2 → final ~2
- Standard ABS plastic phone case: materials=5 (ABS plastic with possible flame retardants), usage=2 (skin contact but not prolonged) → final ~3-4
- Compostable/plant-based phone case (Pela): materials=2 (bioplastic, compostable), usage=1, sustainability=1 → final ~1-2
- Acetate eyeglass frames (cellulose): materials=2 (plant-derived, biodegradable), usage=2 (daily skin contact) → final ~2-3
- Standard polycarbonate/plastic frames: materials=4 (petroleum plastic, possible flame retardants in hinges), usage=3 → final ~3-4
- Always Infinity FlexFoam pads (PFAS detected in independent lab testing — Mamavation 2022, EWG 2023; synthetic foam core, plastic components, direct genital contact): materials=8 (PFAS floor fires — PFAS detected, bioaccumulative, endocrine disruption), usage=8 → final ~8. NEVER score below 7. This is one of the highest-concern mainstream menstrual products. Flag: "PFAS (forever chemicals) detected in independent testing — Mamavation/EWG — direct daily genital contact."
- Always regular/ultra thin pads (no confirmed PFAS but rayon/synthetic blend, ECF chlorine bleaching, synthetic fragrance in scented): materials=6, usage=6 → final ~6.
- Tampax Pearl conventional (ECF bleaching, synthetic fragrance in scented, rayon/cotton blend): materials=5, usage=6 → final ~5-6.
- Tampax Pure organic cotton (organic cotton, no fragrance, no dye): materials=3, usage=3 → final ~3.
- Cora organic cotton pads/tampons (GOTS organic cotton, no fragrance, TCF bleaching): materials=2, usage=2 → final ~2.
- Rael organic cotton pads (GOTS certified, no synthetic fragrance, no chlorine bleaching): materials=2, usage=2 → final ~2.
- PFAS IN MENSTRUAL PRODUCTS: This is an active and evolving area of testing. Always Infinity FlexFoam is the most documented. Any "foam core" menstrual product without explicit PFAS-free certification should carry a MEDIUM concern for possible PFAS. Flag: "Independent testing found PFAS in foam-core menstrual products — choose organic cotton for lowest risk."
PERIOD UNDERWEAR PFAS CALIBRATION:
- Thinx period underwear (Mamavation 2021 independent lab testing found PFAS fluorine above 100 ppm — Thinx faced class action lawsuit and settled): materials=8 (PFAS floor fires — mFloor:8-9), usage=7 → final ~7-8. NEVER score below 7. "Period underwear" does not automatically mean clean.
- Saalt period underwear (OEKO-TEX Standard 100 certified, no PFAS detected in independent testing): materials=2, usage=2 → final ~2. Clean period underwear benchmark.
- Knix period underwear (PFAS testing unclear — no confirmed PFAS-free certification as of 2024): materials=5, usage=5 → final ~5. Score conservatively until PFAS-free certification confirmed.
- Modibodi (OEKO-TEX, PFAS-free claim): materials=3, usage=3 → final ~3.
- Bambody (no certification, PFAS status unclear): materials=5 → final ~5. Conservatively scored.
PERIOD UNDERWEAR RULE: Without explicit PFAS-free certification AND third-party lab testing, period underwear should score minimum 5 as a precautionary default. OEKO-TEX + no PFAS detected = 2-3. Confirmed PFAS = 7-8.
- Menstrual cup (medical silicone): materials=1, usage=2, sustainability=1 (replaces thousands of disposables) → final ~1
- Miracle-Gro synthetic fertilizer: materials=6 (synthetic nitrogen, urea, synthetic iron chelates — runoff risk), sustainability=7 (synthetic chemical runoff, no soil biology) → final ~5-6
- Dr. Earth/Espoma organic fertilizer: materials=1 (bone meal, feather meal, natural minerals), sustainability=2 → final ~1-2
- Standard paraffin wax (Roundup/Scotts lawn chemicals): materials=7 (glyphosate — IARC classified probable carcinogen), usage=6 (skin/inhalation exposure), sustainability=8 (soil and waterway damage) → final ~7
- PVC yoga mat: materials=7 (vinyl chloride, phthalate plasticizers, toxic manufacturing), usage=5 (skin contact during exercise) → final ~6
- Natural rubber yoga mat (Liforme/Manduka natural rubber): materials=2, usage=2 → final ~2
- Standard Advil tablets / Tylenol tablets (acetaminophen or ibuprofen — tablet form, minimal inactive ingredients, occasional ingestion): materials=2, usage=2 → final ~2-3. Tablet/caplet forms are meaningfully cleaner than liquid forms.
- NyQuil LiquiCaps / DayQuil LiquiCaps (FD&C Red 40 in liquid gel capsule, PEG): materials=4, usage=3 → final ~3-4. Less concerning than liquid form but still has dye.
CHILDREN'S LIQUID MEDICINE — CRITICAL CALIBRATION (petroleum dyes in daily sick-child use):
- Children's Tylenol liquid (acetaminophen + HFCS + Red 40 + FD&C Blue 1 — two petroleum dyes FDA is phasing out + HFCS in a medicine given to feverish children): materials=7 (Red 40 + Blue 1 dye floors both fire), usage=7 (daily oral ingestion by children — child vulnerability flag) → final ~6-7. NEVER score below 6. This is one of the most important calibrations in the medicine category.
- Children's Motrin / Children's Advil liquid (ibuprofen + Red 40 + artificial flavors): materials=6 (Red 40 dye floor fires), usage=6 (child daily ingestion — child vulnerability) → final ~5-6. NEVER score below 5.
- Children's Benadryl liquid (diphenhydramine + Red 40 + HFCS): materials=6 (Red 40 floor fires + HFCS floor fires), usage=6 → final ~5-6.
- NyQuil liquid / DayQuil liquid (FD&C Yellow 6 + HFCS + high alcohol 10%): materials=6 (Yellow 6 dye + HFCS + alcohol), usage=5 → final ~5-6.
- ZzzQuil liquid (diphenhydramine + FD&C Blue 1 + PEG + propylene glycol): materials=6 (Blue 1 dye floor fires), usage=5 → final ~5-6.
CLEAN MEDICINE ALTERNATIVES:
- Genexa children's acetaminophen (USDA Organic inactive ingredients, no petroleum dyes, no artificial flavors): materials=2, usage=2 → final ~2. Benchmark clean children's medicine.
- Similasan children's remedies (no petroleum dyes, homeopathic — note: homeopathic efficacy is contested but ingredient safety is high): materials=2 → final ~2-3.
MEDICINE RULE: Active pharmaceutical ingredients do NOT themselves drive a high score — the inactive ingredients (dyes, HFCS, artificial flavors) do. A petroleum dye in daily children's medicine is the same chemical concern as in candy. Child vulnerability flag applies. NEVER score a dyed children's liquid medicine below 5.
- Zarbees/natural honey-based cough syrup: materials=2 (honey, natural flavors, no synthetic dyes or preservatives), usage=2 → final ~2
- Standard bandages (Band-Aid): materials=4 (synthetic polymer adhesive, possible latex, petroleum-backed strip), usage=3 → final ~3
- Fabric/natural adhesive bandages (Welly): materials=3, usage=2 → final ~2

FINAL SCORE CALCULATION (server applies category-specific formula, provide sub-scores accurately):
Provide accurate scores for: materials_score, usage_score, packaging_score, sustainability_score
Do NOT score or return manufacturing_score — it has been removed from the formula.

PRODUCT ANALYSIS — populate product_analysis for ALL categories. Tailor concerns and tier to the category.

COMPOSITION TIERS (apply to all categories):
Tier 1 (clean/natural): organic certified, plant-based, no synthetic chemicals, genuinely clean
Tier 2 (conventional): standard commercial, some synthetics, generally low concern
Tier 3 (synthetic-heavy): multiple petroleum-based chemicals, synthetic microfibers, synthetic fragrance
Tier 4 (high concern): contains banned/flagged substances, known carcinogens, PFAS, endocrine disruptors

NUTRITION — for food_beverage AND restaurant categories only. Rules:
1. PACKAGED FOOD: Populate if you can read values from the label image, OR if you know the published nutrition facts with high confidence. Use per-serving values as defined by the manufacturer.
2. RESTAURANT ITEMS: Populate using the chain's official published values. For major chains (McDonald's, Chick-fil-A, Chipotle, Taco Bell, Fuzzy's, etc.) you likely know the approximate values — populate what you know with reasonable confidence and set nutrition_verified: false. Only set nutrition_verified: true if you are certain of the exact values.
3. Set individual fields to null if uncertain about that specific value — partial nutrition data is useful. Populate calories and sodium at minimum if you know them.
4. Only set the entire nutrition object to null if you have no useful data at all.
5. Never fabricate precise numbers — if you know calories are approximately 280, return 280. If you're guessing between 200-350, return null for that field.
Format: {"serving_size":"1 taco", "calories":280, "protein_g":17, "carbs_g":14, "sugar_g":1, "fat_g":16, "fiber_g":null, "sodium_mg":430}

RESTAURANT ITEMS — when category is "restaurant", score the dish based on its known ingredients, processing level, and additives used by that chain. Use food_beverage concern types. For ai_alternatives provide two types of suggestions:
TYPE 1 — "Order smarter": 1-2 cleaner options from the SAME restaurant (e.g. Chick-fil-A nuggets → Chick-fil-A grilled chicken sandwich, side salad). Use the format "Chick-fil-A Grilled Chicken Sandwich" as the name so users know it's the same place. Reason should explain why it's cleaner (grilled vs fried, no additives, lower sodium).
TYPE 2 — "Better alternative": 1 suggestion from a cleaner chain or homemade version for the same craving (e.g. Chick-fil-A nuggets → homemade buttermilk chicken, or Raising Cane's if they have a cleaner equivalent). Name it clearly so users know it's a different option.
Do NOT suggest grocery products as alternatives for restaurant items.
RESTAURANT SCORE GUIDANCE — these are HARD FLOORS, do not score below them:
- Fast food fried items (nuggets, fried chicken, french fries, onion rings): final score MUST be 6-7. Materials 7 (refined oils, TBHQ, MSG, additives), usage 6.
- Fast food burgers/sandwiches (conventional): final score MUST be 5-6. Materials 6, usage 5.
- Fast casual tacos/burritos (Fuzzy's, Chipotle, Taco Bell): final score MUST be 4-6. Materials 5-6, usage 5. Even "fresh" fast casual uses processed sauces, high sodium, refined flour tortillas.
- Fast food salads: final score MUST be 4-5.
- Grilled items at fast food chains: final score MUST be 4-5 (still processed marinade, high sodium).
- Sit-down chain restaurants (Applebee's, Chili's, Olive Garden): final score MUST be 4-6.
- Dessert chains (Crumbl, Nothing Bundt Cakes, Insomnia Cookies): final score MUST be 5-7. Refined flour + high sugar + artificial dyes in frosting on many items.
A fast food or fast casual item should NEVER score below 4. If your calculation gives a lower score, raise it to the minimum floor.

SODIUM RULE: For any restaurant item where sodium exceeds 2,000mg per serving, flag "extreme sodium content" as a HIGH concern and add +1 to materials score. Items exceeding 3,000mg sodium (Cheesecake Factory pasta, Applebee's riblets, large fast food combos) = materials minimum 7. The FDA daily sodium limit is 2,300mg — a single item exceeding it is a meaningful health concern regardless of other ingredients.

FAST FOOD ITEM-LEVEL CALIBRATION:
The following are HARD score anchors for specific fast food items — do not deviate from these ranges.

McDONALD'S:
- Big Mac: final score ~6 — TBHQ in frying oil, HFCS in bun, 1010mg sodium, enriched flour. Always flag TBHQ.
- Quarter Pounder with Cheese: final score ~6 — TBHQ + sodium phosphate in cheese + 1110mg sodium.
- Chicken McNuggets (any size): final score ~7 — TBHQ + dimethylpolysiloxane + sodium aluminum phosphate + DATEM. Always name all four.
- McChicken Sandwich: final score ~7 — TBHQ + MSG + dimethylpolysiloxane. Always name all three.
- McDonald's French Fries: final score ~6 — TBHQ in frying oil + natural beef flavor + dextrose.
- Sausage McMuffin / Sausage McGriddle: final score ~7 — sodium nitrite in sausage. Nitrite floor fires. NEVER score below 6.
- Egg McMuffin (no sausage): final score ~5 — Canadian bacon (lower nitrite) + processed egg + enriched muffin. Meaningfully cleaner than sausage versions.
- McDonald's Hotcakes: final score ~6 — HFCS + artificial maple flavor + enriched flour.
- McFlurry: final score ~6 — HFCS + corn syrup + artificial flavors. M&M McFlurry = 7 (petroleum dyes confirmed).
- Apple Pie: final score ~7 — HFCS + TBHQ + BHA. BHA floor fires.
- McDonald's Oatmeal (plain or light): final score ~4 — genuine oats, moderate concern. Cleanest McDonald's option.
- Side Salad (no dressing): final score ~2.

BURGER KING:
- Whopper: final score ~6 — DATEM + TBHQ + 980mg sodium.
- Impossible Whopper: final score ~6 — Impossible patty (NOVA 4) + TBHQ in oil. "Plant-based" ≠ safer.
- BK Chicken Fries / Onion Rings: final score ~7 — TBHQ + MSG + enriched flour.
- BK Croissanwich (sausage/bacon): final score ~7 — sodium nitrite. NEVER score below 6.

WENDY'S:
- Dave's Single/Double: final score ~6 — TBHQ + sodium phosphate + high sodium.
- Baconator / Son of Baconator: final score ~7 — sodium nitrite in bacon + TBHQ + 1350-2150mg sodium. Multiple floors fire. NEVER score below 6.
- Frosty: final score ~5 — HFCS + carrageenan (carrageenan floor fires) + artificial flavor.
- Apple Pecan Salad (grilled): final score ~4 — cleanest Wendy's option.

KFC:
- Original Recipe / Extra Crispy chicken (fried): final score ~7 — MSG + TBHQ + DATEM + dimethylpolysiloxane. Always name all four. NEVER score below 6.
- KFC Famous Bowl: final score ~7 — powdered mashed potato + MSG gravy + TBHQ + seven processed components. Flag all concerns.
- KFC Grilled Chicken: final score ~5 — no TBHQ from fryer, lower additive load. Cleaner option.
- Side Corn on the Cob: final score ~2.

POPEYES:
- Original / Spicy Chicken (fried): final score ~7 — MSG + TBHQ + DATEM + sodium aluminum phosphate + 1443mg sodium. NEVER score below 6.
- Popeyes Chicken Sandwich: final score ~7 — MSG + TBHQ + enriched flour brioche + extreme sodium. NEVER score below 6.
- Blackened Chicken Tenders: final score ~5 — not fried, lower additive load.
- Red Beans and Rice (with andouille sausage): final score ~5 — sodium nitrite in andouille fires.

RAISING CANE'S:
- Chicken Fingers combo: final score ~5-6 — simpler ingredient list than KFC/Popeyes but still fried. No TBHQ confirmed. High sodium from Cane's Sauce.

PIZZA CHAINS:
- Domino's pepperoni pizza: final score ~7 — DATEM + sodium nitrite in pepperoni (IARC Group 1) + enriched flour. NEVER score below 6.
- Domino's cheese pizza (no pepperoni): final score ~6 — DATEM + enriched flour, no nitrite.
- Pizza Hut Original Pan pepperoni: final score ~7 — TBHQ in pan oil + sodium nitrite in pepperoni. NEVER score below 6.
- Little Caesars pepperoni: final score ~7 — TBHQ + sodium nitrite. NEVER score below 6.
- Blaze Pizza / Mod Pizza (fresh, no processed meat): final score ~4 — made fresh, real dough, ingredient transparency.
- Any chain pizza WITH pepperoni/salami/cured meat: final score MINIMUM 6 (nitrite floor fires).

SUBWAY AND SANDWICH CHAINS:
- Subway Italian BMT (pepperoni + salami + ham): final score ~7 — sodium nitrite in ALL THREE meats. Highest nitrite exposure per serving in mainstream fast food. NEVER score below 6.
- Subway Meatball Marinara: final score ~7 — mechanically separated chicken in meatballs + HFCS in sauce.
- Subway Turkey Breast: final score ~5-6 — sodium nitrite in turkey deli meat.
- Subway Veggie Delite: final score ~3-4 — produce + bread, no processed meat. Cleanest Subway option.
- Jersey Mike's Italian: final score ~7 — three cured meats (same as Italian BMT). NEVER score below 6.
- Jersey Mike's Turkey: final score ~5 — single deli meat lower exposure.

TACO BELL:
- Crunchy Taco (seasoned beef): final score ~5 — less than 40% beef, oat product + maltodextrin + citric acid fillers.
- Chalupa / Crunch Wrap Supreme: final score ~6 — TBHQ from frying + processed beef blend.
- Bean Burrito: final score ~4 — refried beans, no processed meat. Cleanest Taco Bell option.
- Power Menu Bowl (grilled chicken): final score ~4 — grilled protein + rice + beans.
- Breakfast Crunchwrap (sausage/bacon): final score ~7 — sodium nitrite. NEVER score below 6.

CHIPOTLE:
- Carnitas: cleanest protein — simple pork + salt + herbs → protein final ~3.
- Chicken / Steak / Barbacoa: final protein score ~3-4.
- Sofritas: final protein score ~5 — processed tofu blend, NOVA 3-4. NOT the cleanest plant option.
- Full burrito (any protein + tortilla + all toppings): final score ~5.
- Bowl (no tortilla, same fillings): final score ~4.
- Black beans / white rice: final score ~2.
- Pinto beans: final score ~3 (trace bacon — sodium nitrite present in small amount).

IN-N-OUT:
- Standard burger (Double-Double / cheeseburger): final score ~5 — DATEM in bun + TBHQ in frying oil + sodium phosphate in cheese. "Fresh never frozen" ≠ no additives.
- Animal Style: final score ~6 — adds HFCS in thousand island + extra cheese layer.
- Protein Style (lettuce wrap, no bun): final score ~3-4 — removes enriched flour bun. Meaningfully cleaner.
- French Fries: final score ~5 — sunflower oil (no confirmed TBHQ), simple potato + salt. Cleaner than McDonald's fries.
IN-N-OUT NOTE: Genuinely cleaner than McDonald's at the ingredient level but NOT a health food. User expectations often score it at 2-3 — correct score is 5-6.

BREAKFAST RULE (applies to ALL chains):
Any fast food breakfast item containing sausage or bacon = sodium nitrite floor fires → final score MINIMUM 6. NEVER score a fast food breakfast sausage or bacon item below 6. Eggs only + bread = 4-5. Oatmeal or avocado toast = 3.

FRESH / HEALTHY CHAIN ANCHORS — these chains use whole ingredients and minimal processing. Default lower scores apply.

CAVA (Mediterranean fast casual):
- Grain bowl with greens, grilled chicken/falafel, hummus, veggies: final score ~3 — whole grains, fresh produce, minimal processing. Kids score ~4 due to moderate sodium. Pregnancy safe.
- Pita wrap with any protein: final score ~4 — refined flour pita adds 1 point vs bowl.
- CAVA braised lamb: final score ~3 — simple braised preparation, cleanest protein.
- Sofritas-style plant items: final score ~4 — more processing than whole grains.
- CAVA kids meal: anchor at ~4 max — minimally processed but sodium concern for children.

SWEETGREEN:
- Harvest Bowl, Shroomami, Guacamole Greens, any whole-ingredient bowl: final score ~2-3 — fresh produce, whole grains, minimal additives. One of the cleanest fast casual options available. Pregnancy: safe, listed as safe for children 4+ with moderate sodium awareness.
- Sweetgreen "Crispy Rice" or anything with fried elements: final score ~4 — bumps 1 point for refined oil.
- Sweetgreen kale caesar: final score ~3 — real parmesan, no shortcut dressings.
- Sweetgreen with warm bowls (miso bowl, hot honey chicken): final score ~3.
- Kids mode: most Sweetgreen bowls safe for kids, score 3-4.

PANERA:
- Broth bowls / power bowls (quinoa, chicken, veggies): final score ~4 — whole grains + lean protein. Watch sodium.
- Panera sandwiches on white bread (Italian, Smokehouse BBQ, Bacon Turkey Bravo): final score ~6 — sodium nitrite in deli meat + refined bread.
- Panera Mediterranean Veggie Sandwich: final score ~4 — no processed meat, cleaner choice.
- Panera soups (broccoli cheddar, cream based): final score ~5-6 — modified food starch + carrageenan + high sodium (often 1200-1800mg).
- Panera Fuji Apple Chicken Salad / Green Goddess Cobb: final score ~4 — but dressing adds processing.
- Panera Kids Mac and Cheese: final score ~6 — annatto colored cheese, enriched pasta, very high sodium. NEVER below 5 for kids.
- Panera Cinnamon Crunch Bagel / Pastries: final score ~7 — HFCS, sugar bombs, enriched flour. Kids score ~7.

STARBUCKS:
- Brewed coffee / plain espresso / Americano (no sweetener, no milk): final score ~2 — just coffee and water.
- Latte / cappuccino / flat white (with dairy or alt milk): final score ~3-4 — dairy or oat milk adds processing but still modest.
- Caramel Macchiato / Vanilla Latte: final score ~5 — added syrups with "natural flavor" + sugar.
- Caramel Frappuccino / Mocha Frappuccino / Java Chip: final score ~7 — 50+ grams sugar + artificial flavoring + carrageenan in base. NEVER below 6.
- Pumpkin Spice Latte: final score ~6-7 — HFCS, caramel color IV, "natural" flavoring blend, 50g sugar venti.
- Refresher drinks (Strawberry Acai, Mango Dragonfruit): final score ~6 — sugar + green coffee extract + artificial green/red coloring (may be freeze-dried fruit, verify before applying dye floor).
- Pink Drink: final score ~5 — coconut milk cuts sugar impact slightly but still sugary.
- Iced Coffee with Classic Syrup: final score ~5.
- Starbucks Egg Bites (bacon/gruyere): final score ~6 — sodium nitrite in bacon. NEVER below 5.
- Starbucks banana bread / cheese danish / pastries: final score ~6 — refined flour + sugar + often BHT.
- Kids mode: ANY Starbucks frappuccino or refresher = child score minimum 7 (50+g sugar + caffeine not child-appropriate + possible dyes).
- Pregnancy: flag caffeine content — refreshers have 45mg (safe), frappuccinos 50-125mg, venti iced coffee 330mg (exceeds ACOG 200mg daily limit).

CHIPOTLE (additions):
- Chipotle kids quesadilla: final score ~5 — simpler than most kids menu but enriched flour tortilla.
- Chipotle kids bowl: final score ~4 — scales down the adult bowl.

FIRST WATCH / SNOOZE / BREAKFAST CHAINS:
- First Watch avocado toast / power bowl: final score ~3-4 — whole grain toast + eggs + avocado. Pregnancy: ensure eggs fully cooked.
- Snooze pancakes / french toast: final score ~6-7 — 80+g sugar, artificial maple flavoring, enriched flour.
- IHOP stack of buttermilk pancakes: final score ~7 — 80g+ sugar + HFCS syrup + enriched flour. Kids score ~8.
- IHOP Rooty Tooty Fresh 'N Fruity: final score ~7 — same base + sausage (nitrite floor fires).
- Cracker Barrel Old Timer's Breakfast: final score ~7 — sausage + bacon nitrite floors + high sodium.

SMOOTHIE / JUICE CHAINS:
- Jamba Juice classic smoothies (Strawberries Wild, Razzmatazz): final score ~5-6 — sherbet base has HFCS + artificial flavor. Kids: ~6.
- Jamba Whirl'ins / Ice cream blends: final score ~7 — 80g+ sugar.
- Jamba Harvest Bowl: final score ~3 — whole fruit + granola + honey.
- Smoothie King "Gladiator" protein smoothies: final score ~5 — sucralose base + whey isolate + "natural flavor" mix.
- Pressed Juicery cold-pressed juices (single ingredient): final score ~2-3 — unprocessed fruit/veggie juice.
- Pressed Juicery Freeze: final score ~4 — blended with coconut cream, some sugar.

DONUT / COOKIE / DESSERT CHAINS:
- Krispy Kreme Original Glazed: final score ~7 — enriched flour, partially hydrogenated alternatives, sugar glaze with titanium dioxide historically.
- Dunkin donut with sprinkles: final score ~7 — enriched flour + Red 40/Yellow 5/Blue 1 in sprinkles. Kids: ~8.
- Crumbl Cookies: final score ~7 — refined flour + 20-40g sugar per cookie + dyes in many varieties. ALL Crumbl cookies kids-score 8 minimum.
- Insomnia Cookies: final score ~7 — same profile as Crumbl.
- Nothing Bundt Cakes: final score ~7 — refined flour + sugar + Red 40 in many flavors. Wedding cake style colored frosting scores 8.

KIDS MODE REMINDER FOR RESTAURANT ITEMS:
When childMode is on, apply these additional restaurant bumps:
- Any item with 500mg+ sodium for a child serving: +1 to child_score (children tolerate less sodium than adults)
- Any kids menu item with included soda/juice drink: +1 (assume Red 40 or HFCS present)
- Any breaded/fried item on kids menu: +1 (higher TBHQ exposure per body weight)

PREGNANCY MODE REMINDER FOR RESTAURANT ITEMS:
When pregnancyMode is on, apply these additional restaurant bumps:
- Any item containing deli meat, pepperoni, salami, prosciutto, hot dogs, cold cuts: +2 to pregnancy_score (listeria + nitrite concern)
- Any sushi, raw fish, rare/raw meat: +2 (listeria + mercury + parasites)
- Any unpasteurized cheese (queso fresco, some fetas, soft brie): +2
- Caffeine: flag items with >200mg caffeine as ACOG daily limit concern
- Alcohol: any alcoholic beverage = pregnancy_score 10
- High mercury fish (tuna, swordfish, king mackerel): +2

CATEGORY-SPECIFIC TIER LABELS:
food_beverage: tier1=whole_food, tier2=minimally_processed, tier3=processed, tier4=ultra_processed
personal_care: tier1=clean_formula, tier2=conventional, tier3=synthetic_heavy, tier4=high_concern

PERSONAL CARE COMPOSITION TIERS — you MUST populate composition_tier for every personal care product. It drives the calibration system.

Tier 1 (clean formula): EWG Verified OR certified by Leaping Bunny + Non-Toxic Project + B Corp. No synthetic fragrance, no parabens, no SLS/SLES, no phthalates, no formaldehyde releasers, no oxybenzone. Examples: Wellnesse, Badger, Schmidt's unscented, Bite toothpaste, Earthpaste, RiseWell, Primally Pure, Ursa Major, ILIA, Countertop brands certified by EWG. Score range 1-3.

Tier 2 (conventional): Standard drugstore formula. May have synthetic fragrance, SLS, some preservatives but no confirmed high-concern substances. No parabens, no oxybenzone, no formaldehyde releasers. Examples: CeraVe, Dove unscented, simple drugstore moisturizers, fluoride toothpaste without artificial dyes. Score range 3-5.

Tier 3 (synthetic heavy): Contains synthetic fragrance (undisclosed phthalates), SLS/SLES, PEGs, silicones, artificial colors in leave-on products. Multiple preservatives. Examples: Pantene, Head & Shoulders, Herbal Essences, Old Spice, Axe, conventional perfumed lotions. Score range 4-7.

Tier 4 (high concern): Contains oxybenzone/octinoxate (endocrine disruptors, reef-banned), formaldehyde releasers (DMDM hydantoin, quaternium-15), lead acetate, coal tar dyes, mercury compounds, or products with confirmed contamination recalls. Score range 6-9.

TOOTHPASTE SPECIFIC RULES:
- Hydroxyapatite + clean ingredients (no SLS, no artificial dyes, no artificial sweeteners) = Tier 1, score 1-2
- Fluoride only, no artificial dyes, no SLS = Tier 2, score 3-4  
- Fluoride + SLS + artificial flavors/colors = Tier 2-3, score 4-5
- Whitening strips with hydrogen peroxide or carbamide peroxide = Tier 3, score 4-6
- Products with titanium dioxide as whitener = Tier 3 minimum, score 5+
clothing: tier1=natural_fiber, tier2=conventional, tier3=synthetic, tier4=chemical_treated
kitchen: tier1=plant_based, tier2=conventional, tier3=synthetic_heavy, tier4=industrial_chemical
baby: tier1=clean_safe, tier2=conventional, tier3=concern_flagged, tier4=high_risk_infants
supplement: tier1=whole_food_derived, tier2=conventional, tier3=synthetic_formula, tier4=high_concern
home_furnishing: tier1=natural_materials, tier2=conventional, tier3=synthetic_foam, tier4=chemical_treated

FOOD (food_beverage) CONCERNS:
HIGH: Red 40/Red 3 (FDA banned/phasing out, carcinogenicity), Yellow 5/6 (hyperactivity/ADHD), Blue 1/2 (neurotoxin), Titanium dioxide (IARC 2B, EU banned), BHA/BHT (IARC 2B carcinogen), Sodium nitrate/nitrite (IARC Group 1 processed meat), Trans fats (cardiovascular), HFCS (metabolic disease), Glyphosate residue in conventional oats/grain products (IARC Group 2A — EWG confirmed above safety threshold in Cheerios, Quaker, Nature Valley)
MEDIUM: Aspartame (IARC 2B 2023), Sucralose (gut microbiome), Acesulfame-K (animal carcinogen), Carrageenan (intestinal inflammation), Sodium benzoate (benzene risk), TBHQ (immunotoxin), Caramel color IV (4-MEI carcinogen), Natural flavors (undisclosed chemicals), Carmine E120 (allergic reactions)
LOW: Artificial flavors, Modified starch, Soy lecithin, Maltodextrin
CONVENTIONAL OATS AND GRAIN PRODUCTS — GLYPHOSATE RULE:
Glyphosate is used as a pre-harvest desiccant on conventional oats and grains. EWG testing confirmed glyphosate above child safety threshold in Cheerios, Quaker, and Nature Valley. However, NOT all oat-containing products warrant the same concern level.

TWO TIERS — assess which applies:

TIER 1 — HIGH CONCERN (materials 6-7): Oats are the PRIMARY or dominant ingredient AND the product has few other redeeming qualities.
- Honey Nut Cheerios, Original Cheerios, Quaker oatmeal, Nature Valley bars: oats = primary ingredient, confirmed EWG residues, high sugar, minimal other nutrition → materials 6-7
- ANY product where conventional oats are listed first or second in ingredients with added sugar and no strong positives

TIER 2 — MODERATE CONCERN (materials 3-4): Oats are ONE of many whole grains, and product has strong positive signals (Non-GMO Project Verified, high fiber 8g+, no artificial dyes, no synthetic preservatives, whole grain dominant).
- Kashi cereals (conventional, non-organic lines): 7-8 whole grains, Non-GMO Project Verified, no artificial dyes, no synthetic preservatives, high fiber/protein → materials 3-4. Oats are one of 7-8 grains, glyphosate exposure is diluted across many grain types. Flag glyphosate as MEDIUM concern (not high), note Non-GMO as positive. NEVER score Kashi conventional as 7 — that is wrong.
- Cliff Bar with conventional oats: oats present but whole food base, high fiber, no dyes → materials 4

TIER 1 vs TIER 2 distinguishing factors:
- Is oats the #1 or #2 ingredient? → Tier 1
- Is the product Non-GMO Project Verified? → Tier 2 signal
- Does the product have fiber >8g per serving? → Tier 2 signal  
- Are there no artificial dyes or synthetic preservatives? → Tier 2 signal
- Does the product have high added sugar (>8g)? → Tier 1 signal

KASHI CALIBRATION:
- Kashi Organic lines (Cinnamon Harvest, Organic Promise — USDA Organic): materials=1-2, final ~1-2. No glyphosate. Flag organic certification as strong positive.
- Kashi conventional lines (GO Original, GO Crunch, Seven Whole Grain — Non-GMO but not organic): materials=3 (seven whole grains, Non-GMO verified, no artificial dyes, no synthetic preservatives, high fiber — oats are one of 7-8 grains, not primary), usage=3 → final ~3. NEVER score above 4.
- Kashi GO with fair trade chocolate or added sugar: materials=4, final ~4. The sugar addition raises it slightly.

UNCURED MEAT CELERY POWDER — critical anti-greenwashing rule:
Products labeled "uncured," "no nitrites added," or "no artificial nitrates" that contain celery juice powder, celery powder, or celery extract are NOT nitrite-free. Celery is naturally high in nitrates which convert to nitrites in the body — same IARC Group 1 concern. This is an FDA labeling loophole, not a safety difference.
- Applegate Farms uncured bacon / turkey (celery juice powder): flag "celery-derived nitrites — same mechanism as sodium nitrite" as MEDIUM concern. materials=6 → final ~5-6.
- Oscar Mayer / conventional bacon (sodium nitrite): materials=8 (IARC Group 1) → final ~7-8.
- EPIC bars / truly nitrite-free jerky (no celery powder): materials=2-3 → final ~2-3.
- Boar's Head low-sodium deli turkey (no celery powder, minimal nitrite): materials=3-4 → final ~3-4.
NEVER score "uncured" meats with celery powder the same as truly clean alternatives. NEVER score below 5.

PLANT MILK CALIBRATION — minimal ingredients = cleanest:
Two-ingredient test: base nut/grain + water = 1-2. Each industrial additive (seed oil, phosphate salt, gum, carrageenan, pea protein isolate) adds 0.5-1 to materials.
- Elmhurst Unsweetened Oat/Almond/Cashew (nut/grain + water only, 2 ingredients): materials=1 → final ~1-2.
- Three Trees Unsweetened Almond (almonds + water only): materials=1 → final ~1-2.
- Malk Organics (organic + minimal ingredients): materials=1 → final ~1-2.
- Forager Project Organic Cashewmilk (USDA Organic, cleaner): materials=2 → final ~2-3.
- Oatly Original / Oatly Full Fat (rapeseed/canola oil + dipotassium phosphate + fortified vitamins, 7+ additives): materials=4 → final ~4.
- Oatly Barista (similar to Original, higher fat): materials=4 → final ~4.
- Silk Almond (carrageenan in some versions, sunflower oil, fortified): materials=4 → final ~4.
- Califia Farms Oat (dipotassium phosphate, sunflower oil, additives): materials=4 → final ~4.
- Planet Oat Unsweetened (sunflower oil, pea protein, additives): materials=4 → final ~4.
DO NOT score Oatly the same as Elmhurst. The additive profile is fundamentally different.

PROTEIN BAR CALIBRATION:
WHOLE FOOD BARS (NOVA 1-2, no synthetic sweeteners — score 2-3):
- Larabar (dates + nuts, 2-6 ingredients): materials=2 → final ~2. Cleanest bar benchmark.
- RXBAR (egg whites, dates, nuts, cocoa): materials=2 → final ~2.
- Perfect Bar (peanut butter, honey, nonfat milk, refrigerated): materials=3 → final ~3.
- GoMacro MacroBar (USDA Organic, whole food): materials=2 → final ~2.
PROCESSED BARS (NOVA 4, synthetic sweeteners — score 4-5):
- Quest Bar (sucralose, protein isolate, palm kernel oil, 15+ ingredients): materials=5 (sucralose floor) → final ~5. NOT clean.
- ONE Bar (sucralose, erythritol, protein isolate): materials=5 → final ~5.
- Built Bar (sucralose, erythritol, carrageenan): materials=5 (sucralose + carrageenan floors) → final ~5.
- Kind bar (nuts, honey, no sucralose): materials=3 → final ~3. Cleaner than Quest/ONE.
NEVER score Quest/ONE/Built the same as Larabar. Sucralose + NOVA 4 = minimum 5.

SEAFOOD CALIBRATION:
- Wild-caught Alaskan salmon (fresh/frozen, minimal additives): materials=1 → final ~1-2. Best seafood option.
- Wild Planet sardines in olive oil (glass jar, low mercury, high omega-3): materials=2 → final ~2.
- Wild Planet canned tuna / chunk light tuna (BPA-free can, low mercury): materials=3 → final ~3.
- StarKist conventional canned tuna (possible BPA can lining, chunk light — lower mercury): materials=4 → final ~4.
- Canned albacore / white tuna (3x higher mercury than chunk light, BPA can): materials=5 → final ~5. Flag: "albacore has ~3x higher mercury — FDA advises limiting to 1 serving/week."
- Farmed shrimp (sodium tripolyphosphate treatment, antibiotic concern in some imports): materials=4 → final ~4.
- Swordfish / king mackerel / tilefish / shark (FDA high-mercury warning): materials=6 → final ~5-6. Always flag high mercury.
MERCURY RULE: For any high-mercury fish, flag "high mercury — FDA advises pregnant women and children to avoid, limit to 1 serving/week for others" as HIGH concern.

BREAD AND GRAIN CALIBRATION:
- Ezekiel 4:9 Sprouted Grain (sprouted grains + water + salt + yeast, NOVA 1): materials=1 → final ~1-2. Benchmark clean bread.
- Traditional sourdough (flour, water, salt, starter — 4 ingredients): materials=2 → final ~2.
- Dave's Killer Bread Organic (USDA Organic, whole grains): materials=2 → final ~2.
- Dave's Killer Bread conventional: materials=3 → final ~3.
- Pepperidge Farm whole wheat (added sugars, dough conditioners): materials=4 → final ~4.
- Wonder Bread / standard white sandwich bread (HFCS, DATEM, SSL, calcium propionate, enriched flour, 15+ ingredients): materials=5 → final ~5. NEVER score below 4.
- Thomas English Muffins (HFCS, calcium propionate): materials=4 → final ~4.

DAIRY CALIBRATION:
- Organic Valley / Stonyfield whole milk (USDA Organic): materials=1 → final ~1-2.
- Conventional whole milk (pasteurized, no additives): materials=2 → final ~2.
- A2 Milk (A2 protein, same processing): materials=2 → final ~2.
- Fairlife ultra-filtered milk (ultra-pasteurized, 9 added vitamins, Coca-Cola subsidiary): materials=3 (NOVA 3 — ultra-processed milk) → final ~3.
- American cheese / Kraft Singles (sodium phosphate, sodium citrate, artificial color — processed cheese product not real cheese): materials=5 → final ~5.
- Organic cream cheese (organic, minimal additives): materials=2 → final ~2.
- Philadelphia cream cheese (locust bean gum, carrageenan in some varieties): materials=4 → final ~4.

FROZEN DESSERT CALIBRATION:
CLEAN (score 2-3):
- Alden Organic Ice Cream (USDA Organic, cream/milk/eggs/sugar/flavor — 5 ingredients): materials=2 → final ~2-3.
- Häagen-Dazs (cream, milk, sugar, eggs, flavor — no carrageenan, no artificial additives): materials=2 → final ~2-3.
"BETTER FOR YOU" ENGINEERED (score 4-5):
- Halo Top (sucralose, erythritol, chicory root, milk protein concentrate — NOVA 4): materials=5 (sucralose floor) → final ~5. NOT cleaner than Häagen-Dazs — different concerns.
- Arctic Zero (sucralose, whey protein concentrate, chicory root): materials=5 → final ~5.
- Ben & Jerry's conventional (carrageenan in vanilla varieties, high sugar): materials=4 → final ~4.
- Ben & Jerry's Non-Dairy (sunflower oil, starch, guar gum — NOVA 4): materials=5 → final ~5.
DO NOT score Halo Top as safer than Häagen-Dazs. Sucralose + erythritol + NOVA 4 formulation is a different risk profile, not a better one.

PLANT-BASED CHEESE CALIBRATION:
- Daiya (coconut oil, tapioca starch, pea protein, natural flavor — NOVA 4): materials=5 → final ~5. "Vegan" ≠ clean.
- Violife (coconut oil, starch, B12 — NOVA 4): materials=5 → final ~5.
- Miyoko's Cashew Cheese (organic cashews, water, cultures, salt — fermented): materials=2 → final ~2-3. The clean option.
NEVER score Daiya/Violife below 4.

FERMENTED FOOD CALIBRATION:
LIVE CULTURE (positive signal — probiotics, simple ingredients):
- Plain organic yogurt (USDA Organic, just milk + cultures): materials=1 → final ~1-2.
- Fage / Chobani plain Greek yogurt (just milk + cultures): materials=2 → final ~2.
- Plain organic kefir (live cultures): materials=1 → final ~1-2.
- GT's Synergy raw kombucha plain (live cultures, <3% natural alcohol): materials=2 → final ~2.
- Raw sauerkraut / kimchi (traditional: cabbage + salt + spices only): materials=1 → final ~1-2.
- Store-brand sauerkraut with vinegar (NOT fermented, NOT live cultures): materials=3 → final ~3.
FLAVORED/SWEETENED:
- Chobani Flip / Activia (added sugar, flavors, inclusions): materials=4 → final ~4.
- Flavored fruit yogurt (Dannon, Yoplait): materials=4 → final ~4.

COOKING OIL CALIBRATION:
- Extra virgin olive oil (cold-pressed, glass bottle): materials=1 → final ~1.
- Avocado oil (cold-pressed): materials=1 → final ~1.
- Organic butter (USDA Organic): materials=1 → final ~1. Note: score is ingredient safety not dietary advice.
- Conventional butter (just cream + salt): materials=2 → final ~2.
- Canola oil (highly refined, hexane extraction, high omega-6): materials=3 → final ~3.
- Vegetable oil / soybean oil (hexane-extracted, industrial refining, "100% natural" is misleading): materials=4 → final ~4.
- Seed oil blends (canola + soybean + sunflower): materials=4 → final ~4.
- Crisco shortening / partially hydrogenated (check label — old formulations = trans fat, materials=7): materials=4-7 → final ~4-7 depending on formulation.
RULE: Cold-pressed single-source = 1. Hexane-extracted industrial = 3-4. Partially hydrogenated = 7.

NUT BUTTER CALIBRATION:
- Once Again Organic peanut butter (USDA Organic peanuts + salt, 2 ingredients): materials=1 → final ~1-2.
- Smucker's Natural peanut butter (peanuts + salt only): materials=2 → final ~2.
- Santa Cruz / MaraNatha natural (peanuts or almonds + salt, no palm oil): materials=2 → final ~2.
- Justin's Classic Almond Butter (dry roasted almonds + palm oil): materials=3 (palm oil — deforestation concern, no RSPO certification confirmed) → final ~3.
- Jif peanut butter (peanuts, sugar, palm oil, mono-diglycerides, NOVA 4): materials=5 → final ~5. NEVER score below 4.
- Skippy peanut butter (peanuts, sugar, hydrogenated vegetable oil, palm oil, NOVA 4): materials=5 (hydrogenated oil, palm oil, NOVA 4) → final ~5. NEVER score below 4.
- Nutella (sugar 57% by weight, palm oil, skim milk, cocoa, soy lecithin, artificial vanilla — NOVA 4): materials=6 (57% sugar is the primary ingredient, palm oil, ultra-processed) → final ~5-6. NEVER score below 5. Do NOT treat Nutella as a nut-based product — it is a sugar and palm oil product with 13% hazelnuts.
NUT BUTTER RULE: 2 ingredients (nut + salt) = 1-2. Palm oil addition = +1. Hydrogenated oil + sugar = +2.

PACKAGED SNACK CALIBRATION:
CLEAN SNACKS (score 1-3):
- SkinnyPop plain popcorn (popcorn + sunflower oil + salt, 3 ingredients): materials=2 → final ~2. Benchmark clean snack.
- Triscuit original (whole grain wheat + oil + salt, 3 ingredients): materials=2 → final ~2.
- Simple Mills almond flour crackers (almond flour, arrowroot, sunflower oil, rosemary): materials=2 → final ~2.
- Mary's Gone Crackers (organic whole grain, clean): materials=2 → final ~2.
MODERATE SNACKS (score 3-4):
- Goldfish crackers (enriched flour, cheddar, annatto color, yeast — NOVA 3): materials=4 → final ~4.
- Smartfood cheddar popcorn (popcorn, cheddar, sunflower oil, natural flavors): materials=4 → final ~4.
- Ritz crackers (enriched flour, palm oil, sugar, natural flavor): materials=4 → final ~4.
- Pretzel Crisps / regular pretzels (enriched flour, salt, yeast): materials=3 → final ~3.
HIGHER CONCERN SNACKS (score 5+):
- Cheez-Its original (enriched flour, TBHQ as preservative): materials=5 (TBHQ floor fires — mFloor:6, but TBHQ may not always be flagged from name alone) → final ~5-6. Always flag TBHQ.
- Wheat Thins original (enriched flour, HFCS, BHT): materials=5 (BHT + HFCS) → final ~5.
- Cheese Puffs / Cheetos (enriched flour, artificial dyes in some, MSG): materials=6 → final ~6 if dyes confirmed.
- Pop-Tarts (HFCS, artificial dyes, TBHQ): materials=7 (TBHQ floor + dyes) → final ~6-7. NEVER score below 6.
SNACK RULE: 3 clean ingredients = 2. Enriched flour + palm oil = 4. TBHQ or BHT = floor fires (5-6 minimum). Artificial dyes = 6-7.

BREAKFAST FOOD CALIBRATION:
WAFFLES AND PANCAKES:
- Eggo frozen waffles (enriched flour, HFCS, artificial flavors, calcium propionate): materials=5 → final ~5. NEVER score below 4.
- Van's Organic frozen waffles (USDA Organic, whole grain): materials=2 → final ~2.
- Kodiak Cakes protein pancake mix (whole grain wheat, whey protein, no artificial additives): materials=3 → final ~3.
- Bisquick original (enriched flour, partially hydrogenated shortening in old formula, leavening): materials=4 → final ~4.
- Birch Benders organic pancake mix (USDA Organic, whole grain): materials=2 → final ~2.
SYRUPS:
- Vermont / pure maple syrup (100% maple syrup, single ingredient): materials=3 → final ~3. Natural, but essentially pure sugar — floor at 3.
- Log Cabin syrup (HFCS, caramel color, artificial maple flavor, sodium benzoate): materials=5 (HFCS + artificial flavors + preservative) → final ~5.
- Aunt Jemima / Pearl Milling syrup (HFCS, caramel color, artificial maple flavor): materials=5 → final ~5.
- Mrs. Butterworth's (HFCS, caramel color, natural flavor): materials=5 → final ~5.
SYRUP RULE: 100% pure maple = 3. HFCS + artificial maple flavor = 5. NEVER score fake maple syrup below 4.

PASTA AND RICE CALIBRATION:
- Jovial USDA Organic brown rice pasta (organic brown rice flour only): materials=1 → final ~1-2.
- Tinkyada brown rice pasta (organic): materials=1 → final ~1-2.
- Barilla whole wheat pasta (whole grain semolina, no additives): materials=2 → final ~2.
- Banza chickpea pasta (chickpea flour, tapioca, pea protein): materials=2 → final ~2. Clean alternative.
- Barilla white pasta (enriched semolina, niacin, ferrous sulfate, folic acid — synthetic vitamins added back): materials=3 → final ~3. Enriched = processing signal.
- Lundberg Organic brown rice (USDA Organic, just rice): materials=1 → final ~1.
- Lundberg conventional brown rice (no additives, just rice): materials=2 → final ~2.
- Uncle Ben's / Ben's Original instant white rice (enriched, parboiled, some have added flavors): materials=3 → final ~3.
- Minute Rice white (instant, enriched): materials=3 → final ~3.
PASTA / RICE RULE: Organic + single grain = 1. Whole grain + no additives = 2. Enriched white = 3. Enriched + added flavors/oils = 4.

BABY PERSONAL CARE CALIBRATION — all baby products get child vulnerability flag. Child vulnerability = +1 to any concern severity:
CLEAN BABY BRANDS (EWG Verified or equivalent — score 1-2):
- WaterWipes (99.9% purified water + 0.1% grapefruit seed extract): materials=1, usage=1 → final ~1. Cleanest mainstream baby wipe. Benchmark for baby wipes.
- Mustela Hydra Bébé Body Lotion (EWG Verified, plant-based, no parabens, no synthetic fragrance, no phenoxyethanol): materials=2, usage=2 → final ~2.
- California Baby (EWG top-rated, no synthetic fragrance, no parabens, no phenoxyethanol): materials=2, usage=2 → final ~2.
- Burt's Bees Baby Shampoo (no synthetic fragrance, no parabens, no phthalates, no phenoxyethanol): materials=2, usage=2 → final ~2.
- Burt's Bees Baby diaper cream (zinc oxide, clean inactive ingredients, no BHT, no synthetic fragrance): materials=2, usage=2 → final ~2.
- Earth Mama Organics (USDA Organic certified, no synthetic fragrance, no phenoxyethanol): materials=2, usage=2 → final ~2.
BABY WIPES — PHENOXYETHANOL WARNING:
Phenoxyethanol is FDA-warned for CNS depression in infants under 3. Many "natural" or "sensitive" baby wipes contain phenoxyethanol as a preservative. It is NOT safe for babies under 3 regardless of "natural" marketing.
- WaterWipes: materials=1 → final ~1. Gold standard.
- Huggies Natural Care wipes (no fragrance — but contains phenoxyethanol): materials=4 (phenoxyethanol flag for infant use) → final ~4.
- Pampers Sensitive wipes (synthetic fragrance, propylene glycol, phenoxyethanol): materials=5 → final ~5.
- Pampers Pure wipes (no fragrance, cleaner — but check for phenoxyethanol in current formula): materials=3 → final ~3.
- Honest Company wipes (no fragrance, phenoxyethanol-free in current formula): materials=2 → final ~2.
CONVENTIONAL BABY BRANDS:
- Johnson's Baby Shampoo (US current formula: synthetic fragrance, some formulas still have parabens): materials=5, usage=5 → final ~5. "Baby" branding does NOT make it safe. Do NOT score below 4 for any conventional J&J baby product with synthetic fragrance.
- Johnson's Baby Lotion (parabens, mineral oil from petroleum, synthetic fragrance — daily full-body application on infant skin): materials=5, usage=6 → final ~5-6. NEVER score below 5.
- Aveeno Baby Daily Moisture (synthetic fragrance, dimethicone — moderate concern for infant): materials=4, usage=4 → final ~4.
- Aquaphor Baby Healing Ointment (petrolatum + mineral oil — petroleum derivatives, no active harmful ingredients but not clean): materials=4, usage=4 → final ~4.
DIAPER CREAM:
- Burt's Bees Baby Diaper Cream (zinc oxide, clean): materials=2, usage=2 → final ~2.
- Earth Mama Organic diaper balm (organic, clean): materials=2, usage=2 → final ~2.
- Desitin Maximum Strength (zinc oxide — good active, BUT also BHT, parabens, synthetic fragrance as inactives): materials=5, usage=5 → final ~5. Zinc oxide good; everything else concerning.
- Butt Paste (zinc oxide, petrolatum, BHA — BHA floor fires): materials=6, usage=6 → final ~6.
BABY CARE RULE: EWG Verified baby product = materials max 2. Any synthetic fragrance in baby product = minimum materials 5. Any phenoxyethanol in wipes/lotion for infants under 3 = flag HIGH concern.

BABY SNACK CALIBRATION (child vulnerability flag applies to ALL):
- Happy Baby Organics puffs (USDA Organic, whole grain oats, fruit — simple): materials=2 → final ~2. Flag child vulnerability.
- Plum Organics puffs (USDA Organic, clean ingredients): materials=2 → final ~2. Flag child vulnerability.
- Earth's Best Organic puffs (USDA Organic): materials=2 → final ~2.
- Gerber Puffs (enriched flour, rice flour, sugar, ascorbic acid — NOT organic, conventional): materials=5 (enriched flour primary, added sugar, daily child ingestion of conventional grain products) → final ~5. NEVER score below 4 for non-organic baby snacks. Flag child vulnerability.
- Gerber Graduates snacks (conventional, some with artificial colors): materials=5-6 → final ~5-6.
BABY SNACK RULE: Non-organic baby food with enriched flour = minimum 4. USDA Organic baby snack = 2. Any artificial color in baby food = minimum 7 (child daily ingestion).

KIDS FRUIT SNACKS AND POUCHES — IMPORTANT YUKA-COMPETING CATEGORY:
HIGH CONCERN — petroleum dyes in daily children's snacks (score 5-7):
- Welch's Fruit Snacks (HFCS + artificial dyes in most flavors — Red 40, Yellow 5, Blue 1 confirmed): materials=6 (HFCS + dye floors fire, child vulnerability), usage=6 → final ~6. NEVER score below 5.
- Mott's Fruit Snacks (HFCS + artificial dyes — same concern as Welch's): materials=6 → final ~6. NEVER score below 5.
- Kool-Aid Jammers (HFCS + artificial dyes — child daily beverage, multiple floors fire): materials=7 → final ~6-7.
CLEAN (score 1-3):
- Annie's Organic Fruit Snacks (USDA Organic, no HFCS, no artificial dyes — fruit juice sweetened): materials=2 → final ~2. Benchmark clean kids fruit snack.
- GoGo Squeez applesauce pouch (100% fruit, no additives, no HFCS, BPA-free pouch): materials=1 → final ~1-2. Cleanest mainstream kids snack. Use as positive benchmark alternative.
- Plum Organics fruit pouch (USDA Organic, simple fruit): materials=1 → final ~1-2.
- Once Upon a Farm pouches (USDA Organic, cold-pressed, minimal): materials=1 → final ~1.
KIDS FRUIT SNACK RULE: Any kids fruit snack with HFCS + artificial dyes = 5-7 minimum (child vulnerability flag + dye floor). USDA Organic + no HFCS = 1-3.

DAIRY CASE CALIBRATION:
BENCHMARK CLEAN (score 1-2):
- Daisy sour cream (grade A cream, one ingredient — no modified starch, no gums, no additives): materials=1 → final ~1-2. Benchmark clean sour cream. "No fillers."
- Daisy cottage cheese (milk + cream + salt — simple): materials=1 → final ~1-2.
- Tillamook natural cheddar (pasteurized milk + salt + cultures + enzymes — no artificial additives): materials=1 → final ~1-2.
- Sargento natural sliced cheese (just cheese — no additives, no processed cheese product): materials=1 → final ~1-2. NEVER score natural cheese same as Kraft Singles.
- Vital Farms pasture-raised eggs (just eggs): materials=1 → final ~1.
- Vital Farms butter (cream + salt — pastured): materials=1 → final ~1-2.
- Pete and Gerry's Organic eggs (USDA Organic, cage-free): materials=1 → final ~1.
CONVENTIONAL MODERATE (score 2-4):
- Philadelphia cream cheese (cream cheese + carob bean gum + xanthan gum — mostly clean): materials=2 → final ~2-3.
- Eggland's Best eggs (conventional feed supplemented for omega-3): materials=2 → final ~2.
- JUST Egg (mung bean protein isolate + canola + turmeric — clean plant-based egg): materials=2 → final ~2-3.
- Breakstone's sour cream (modified food starch + locust bean gum — not as clean as Daisy): materials=3 → final ~3.
HIGH CONCERN — PROCESSED CHEESE PRODUCTS (score 4-6):
- Kraft American Singles (sodium phosphate + artificial color — must be labeled "pasteurized prepared cheese product"): materials=5 → final ~5. NEVER score same as Sargento natural cheese. These are different products.
- Laughing Cow (sodium citrate + sorbic acid + processed spread — not real cheese): materials=4 → final ~4.
- Velveeta (sodium alginate + sodium phosphate + artificial color — legally "pasteurized processed cheese product"): materials=6 (sodium phosphate floor) → final ~6. NEVER score below 5. NEVER call Velveeta "cheese."
DAIRY RULE: Natural cheese (milk + cultures + enzymes + salt) = 1-2. Processed cheese "product" with sodium phosphate or sodium citrate = 4-6. "Pasteurized process cheese product" label = always flag.

HOT DOGS AND FRANKFURTERS:
HIGH CONCERN — sodium nitrite mandatory floor (score 6-8):
- Ball Park beef franks (sodium nitrite + corn syrup + sodium phosphate — three concerning ingredients stacked): materials=7 (nitrite floor fires) → final ~7. NEVER score below 6.
- Hebrew National beef franks (sodium nitrite — "kosher" marketing does not mean lower nitrite): materials=7 → final ~7. NEVER score below 6. Flag: "Kosher certification does not mean nitrite-free."
- Oscar Mayer Classic Wieners (sodium nitrite + corn syrup + BHA — three floors fire): materials=7 (nitrite + BHA floors both fire) → final ~7. NEVER score below 6.
- Eckrich smoked sausage (sodium nitrite): materials=7 → final ~7. NEVER score below 6.
- Ball Park Turkey franks (sodium nitrite in turkey version — same concern): materials=6 → final ~6.
CELERY POWDER LOOPHOLE (score 5-6):
- Applegate Naturals hot dogs (celery juice powder — nitrite loophole, same nitrosamine chemistry): materials=5 → final ~5. NEVER score same as truly nitrite-free. NEVER score as "clean."
HOT DOG RULE: Any frank with sodium nitrite = IARC Group 1 floor fires → minimum 6. Celery juice/powder = loophole, still 5. True nitrite-free (no celery) + USDA Organic = 3-4.

PACKAGED FROZEN MEALS WITH PROCESSED MEAT:
- Jimmy Dean Sausage Biscuit / Croissant (sodium nitrite in sausage + enriched flour + DATEM — nitrite floor fires): materials=7, usage=6 → final ~7. NEVER score below 6.
- Hot Pockets (sodium nitrite in meat + TBHQ + DATEM + enriched flour — multiple floors fire): materials=7 → final ~7. NEVER score below 6.
- Lean Pockets (same concern as Hot Pockets at slightly lower threshold): materials=6 → final ~6.
- Eggo waffles (HFCS + DATEM + sodium aluminum phosphate + enriched flour): materials=5 → final ~5. NEVER score below 4.
- Kashi waffles (whole grain, no HFCS — cleaner): materials=3 → final ~3.
- Van's gluten-free waffles (whole grain, no dyes, no HFCS): materials=2 → final ~2.

PACKAGED RETAIL CHICKEN NUGGETS:
- Tyson chicken nuggets (frozen, retail — TBHQ in frying oil + modified starch + enriched flour breading): materials=7 (TBHQ floor fires) → final ~6-7. NEVER score below 5.
- Perdue chicken nuggets (TBHQ in frying oil, same concern): materials=6 → final ~6.
- Applegate Organics chicken nuggets (USDA Organic, no TBHQ): materials=3, usage=3 → final ~3.
- Bell & Evans organic nuggets (no TBHQ, organic): materials=3 → final ~3.
RETAIL NUGGET RULE: Any frozen nugget fried in soybean oil with TBHQ = 6-7. USDA Organic + no TBHQ = 3.

BABY FORMULA BRAND CALIBRATION:
- HiPP Organic formula (European certified organic, no hexane-extracted DHA, clean): materials=2 → final ~2-3.
- Holle Organic formula (EU organic, simple ingredients): materials=2 → final ~2-3.
- Bobbie Organic (USDA Organic, EU-inspired formula, no corn syrup): materials=3 → final ~3.
- Enfamil Enspire (MFGM + lactoferrin — meaningful additions, conventional DHA source): materials=3 → final ~3.
- Similac Advance / Pro-Advance (conventional DHA from hexane-extracted microalgae, corn maltodextrin, synthetic vitamins): materials=4 → final ~4.
- Enfamil Gentlease (partially hydrolyzed — more processed): materials=4 → final ~4.

DARK CHOCOLATE CALIBRATION:
BENCHMARK CLEAN (score 1-2):
- Hu Kitchen chocolate (no refined sugar, no lecithin, no dairy, no vanilla extract — cleanest mainstream dark chocolate): materials=1 → final ~1-2.
- Alter Eco dark chocolate (USDA Organic, Fair Trade, simple ingredients): materials=1 → final ~1-2.
- Theo 70% dark (USDA Organic, Fair Trade, simple): materials=1 → final ~1-2.
- Lindt Excellence 85%+ dark (cacao + cocoa butter + sugar + vanilla — minimal, no PGPR): materials=1 → final ~1-2.
- Lindt Excellence 70% dark (same clean formula): materials=2 → final ~2.
- Trader Joe's Pound Plus 72% dark (clean formula, no PGPR): materials=2 → final ~2.
CONVENTIONAL WITH PGPR (score 4-5):
- Lindt milk chocolate (PGPR + artificial vanillin — less clean than Lindt dark): materials=4 → final ~4.
- Hershey's Special Dark (PGPR + artificial vanillin — "dark" marketing, not as clean as European dark): materials=4, usage=4 → final ~4-5.
- Cadbury Dairy Milk (PGPR + artificial flavors): materials=4 → final ~4-5.
- Dove milk chocolate (PGPR in some formulas — check): materials=3-4 → final ~3-4.
- Dove dark chocolate (PGPR-free in dark formula — simpler): materials=3 → final ~3.
CHOCOLATE RULE: European-style dark chocolate with cacao + cocoa butter + sugar + vanilla = 1-3. Any chocolate with PGPR (polyglycerol polyricinoleate) = 3-5. Any chocolate with artificial vanillin = +1. PGPR is a cheap cocoa butter substitute — its presence is a greenwashing indicator. Do NOT score Hershey's Special Dark the same as Lindt 85%.

GROCERY COFFEE AND TEA:
CLEAN COFFEE (score 1-3):
- Kicking Horse Coffee (USDA Organic + Fair Trade — benchmark clean grocery coffee): materials=1 → final ~1.
- Death Wish Organic (USDA Organic): materials=2 → final ~2.
- Four Sigmatic mushroom coffee (adaptogens + organic coffee — clean formula): materials=2 → final ~2.
CONVENTIONAL COFFEE (score 2-4):
- Folgers Classic / Maxwell House (conventional arabica, no additives — just conventional coffee): materials=3 → final ~3. Lower concern than food with additives but conventional farming with pesticide exposure.
- Starbucks ground (conventional): materials=3 → final ~3.
- Lavazza / Peet's (conventional Italian — clean but conventional farming): materials=2-3 → final ~2-3.
TEA BAG RULE (reinforcement):
- Paper tea bags (Bigelow, Celestial Seasonings, Stash, Traditional Medicinals, Lipton regular flat bags): materials=2, packaging=2 → final ~2. Paper releases no microplastics.
- Nylon/PET pyramid tea bags (Lipton pyramid, Tetley pyramid, PG Tips pyramid): materials=7 (Hernandez 2019: 11.6 billion microplastics per cup) → final ~7. NEVER score below 6.
- Traditional Medicinals (USDA Organic + paper bags + medicinal herbs): materials=1 → final ~1-2. Benchmark clean tea.
- Annie's Organic mac & cheese (USDA Organic, real cheddar, organic pasta): materials=3 → final ~3. Best mainstream option.
- Kraft Original mac & cheese blue box (enriched flour, cheese sauce powder, annatto color, sodium phosphate): materials=5 → final ~5. Enriched flour + processed cheese powder + sodium phosphate = NOVA 4.
- Kraft Deluxe mac (liquid cheese sauce: sodium phosphate, sodium citrate, more additives): materials=5 → final ~5.
- Velveeta Shells & Cheese (pasteurized process cheese product — not real cheese: sodium phosphate, sodium citrate, sodium alginate, artificial color): materials=6 → final ~6. NEVER score below 5.
- Daiya mac & cheese vegan (Daiya "cheese" — coconut oil, starch, NOVA 4): materials=6 → final ~5-6. "Vegan" label does not improve score.

CANNED SOUP CALIBRATION:
- Amy's Organic soups (USDA Organic, real vegetables, simple ingredients): materials=2 → final ~2-3. Benchmark clean canned soup.
- Pacific Foods Organic broth (USDA Organic, simple): materials=2 → final ~2.
- Imagine Organic soups (USDA Organic): materials=2 → final ~2.
- Progresso traditional soups (conventional, MSG in some varieties, high sodium 800-1000mg): materials=4 → final ~4-5.
- Campbell's Chunky (conventional, 890-1000mg sodium, modified food starch, natural flavors, yeast extract = hidden MSG): materials=5 → final ~5.
- Campbell's Condensed (very high sodium when undiluted: 890mg per half-cup, modified starch, natural flavors): materials=5 → final ~5.
- Maruchan / Top Ramen instant noodles (TBHQ, tertiary butylhydroquinone, high sodium 1800mg per package, MSG, artificial flavors): materials=7 (TBHQ floor fires, extreme sodium) → final ~6-7. NEVER score below 6.
SOUP SODIUM NOTE: Flag any soup with >800mg sodium per serving as HIGH concern using sodium rule.

SALAD DRESSING CALIBRATION:
CLEAN (score 1-3):
- Primal Kitchen avocado oil dressings (avocado oil, apple cider vinegar, clean herbs — no soybean oil, no artificial additives): materials=2 → final ~2. Benchmark clean dressing.
- Tessemae's (USDA Organic in some, clean oils, no additives): materials=2 → final ~2.
- Annie's Organic dressings (organic, simple): materials=2 → final ~2.
- Newman's Own (simple, no artificial additives, charitable mission): materials=3 → final ~3.
- Bragg organic apple cider vinegar dressing: materials=2 → final ~2.
CONVENTIONAL (score 4-5):
- Ken's Steakhouse (soybean oil, calcium disodium EDTA, artificial flavors): materials=5 → final ~5.
- Hidden Valley Ranch original (soybean oil, modified starch, artificial flavors, calcium disodium EDTA): materials=5 → final ~5.
- Wish-Bone (soybean oil, EDTA, artificial colors in some): materials=5 → final ~5.
- Kraft dressings (soybean oil, HFCS in some, EDTA): materials=5 → final ~5.
DRESSING RULE: Avocado oil or olive oil base + no EDTA + no soybean oil = 1-3. Soybean oil base + EDTA = 4-5.
- Raw honey (100% honey, no additives): materials=3 — natural but essentially pure fructose/glucose, no fiber, no protein, rapid blood sugar spike. NEVER score below 3. Flag: high natural sugar, no nutritional complexity.
- Maple syrup (pure): materials=3 — similar to honey, marginally better micronutrient profile. Score 3.
- Agave syrup: materials=4 — 90% fructose, higher than honey, worse metabolic profile despite "natural" marketing. Score 4.
- 100% fruit juice (no added sugar): materials=3 — removes fiber from fruit, concentrates natural sugar, glycemic load similar to soda. Score 3-4. "No added sugar" does not make juice a whole food.
- Dried fruit (raisins, dried mango, dates as ingredient): materials=2-3 when a minor ingredient, 3-4 when primary ingredient at high quantity — concentrated sugar, sticky, tooth decay risk.
DO NOT score any pure sugar product (honey, syrup, molasses, agave) below 3.

HIGH-SUGAR JUICE AND SMOOTHIE CALIBRATION:
100% JUICE (no HFCS, but high natural sugar — floor at 3):
- Welch's 100% Grape Juice (36g natural sugar, 100% juice, no HFCS): materials=3 → final ~3. "100% juice" does not mean clean — it means concentrated natural sugar with no fiber.
- Ocean Spray 100% Cranberry (very tart, usually diluted — 30g sugar): materials=3 → final ~3.
- Tropicana 100% OJ (pasteurized, 22g sugar, some varieties have additives): materials=3 → final ~3.

JUICE COCKTAILS / SUGAR WATER (HFCS + minimal juice — floor at 5):
- Ocean Spray Cranberry Cocktail (28% juice + HFCS + water, 25g added sugar): materials=5 (HFCS floor fires) → final ~5. NOT the same as 100% cranberry juice.
- V8 Splash Tropical Blend (HFCS + 5% vegetable juice + natural flavors): materials=5 → final ~5.
- Welch's Grape Drink / cocktail (HFCS, <100% juice): materials=5 → final ~5.

KIDS DRINKS WITH HFCS + DYES (floor at 6-7 — child daily ingestion concern):
- Hi-C Fruit Punch (HFCS + Red 40 + Blue 1 — two petroleum dyes, child daily drink): materials=7 → final ~7. NEVER score below 6. Child vulnerability flag.
- Hawaiian Punch Fruit Juicy Red (HFCS + Red 40): materials=7 → final ~6-7. NEVER score below 6. Child vulnerability flag.
- Kool-Aid Jammers (HFCS + multiple petroleum dyes in most flavors): materials=7 → final ~6-7. NEVER score below 6. Child vulnerability flag.
- Capri Sun Original (HFCS in original flavors, check variant — some newer versions are HFCS-free): materials=5 (HFCS floor) → final ~5. Newer "25% less sugar" versions without HFCS = 3.
- Tampico citrus punch (HFCS + artificial dyes + 2% juice): materials=7 (HFCS + dyes) → final ~6-7.
HIGH-SUGAR SMOOTHIE DRINKS (natural sugar floor):
- Naked Juice (53g+ natural sugar per bottle, pasteurized, no added sugar): materials=4 (total sugar >50g floor applies) → final ~4. NOT scored as clean as whole fruit.
- Odwalla (pasteurized, similar sugar load to Naked): materials=4 → final ~4.
- Bolthouse Farms Green Goodness (>50g sugar, pasteurized): materials=4 → final ~4.

SWEETENED TEA AND LEMONADE CALIBRATION:
CLEAN (unsweetened, score 1-2):
- Pure Leaf Unsweetened Tea (just tea + water, no sweetener): materials=1 → final ~1.
- Honest Tea Unsweetened (organic, just tea): materials=1 → final ~1.
ORGANIC / LIGHT SWEETENED (score 2-3):
- Honest Tea (organic, 10g sugar, USDA Organic, fair trade): materials=2 → final ~2-3.
- GT's plain kombucha (lightly sweet from fermentation): materials=2 → final ~2.
HFCS SWEETENED (floor at 5):
- Snapple Peach Tea / Lemon Tea (HFCS, 37g sugar): materials=5 (HFCS floor) → final ~5. NEVER score below 4.
- Arizona Green Tea / Sweet Tea (HFCS, 23-34g sugar): materials=5 → final ~5.
- Lipton Brisk Iced Tea (HFCS): materials=5 → final ~5.
- Gold Peak Sweet Tea (HFCS): materials=5 → final ~5.
- Minute Maid Lemonade (HFCS, 28g sugar): materials=5 → final ~5.
- SunnyD (HFCS + artificial dyes + 2% juice): materials=6 (HFCS + dyes) → final ~6.
RESTAURANT SWEET TEA (score 4-5):
- McDonald's / Chick-fil-A / Raising Cane's sweet tea (sugar + water + tea, ~40-70g sugar in large): materials=4 → final ~4. Not HFCS but extreme sugar load at chain scale.

CANDY CALIBRATION — HFCS + PGPR CHOCOLATE BARS:
HFCS + NO PETROLEUM DYES (score 5-6):
- Reese's Peanut Butter Cup (HFCS, PGPR emulsifier replacing cocoa butter, artificial flavors, palm kernel oil): materials=5 → final ~5-6. NEVER score below 5.
- Snickers (HFCS, corn syrup, PGPR, artificial flavors): materials=5 → final ~5-6.
- Twix (HFCS, PGPR, enriched flour, artificial flavors): materials=5 → final ~5-6.
- Kit Kat US (HFCS in US formulation, PGPR, enriched flour, artificial flavors): materials=5 → final ~5-6.
- Baby Ruth / Butterfinger (HFCS, PGPR, corn syrup): materials=5 → final ~5-6.
- Milky Way (HFCS, corn syrup, hydrogenated palm oil, artificial flavors): materials=6 → final ~6.
- Swedish Fish (HFCS, artificial red dye, carnauba wax): materials=6 (HFCS + artificial dye) → final ~6.
NOTE ON PGPR: Polyglycerol polyricinoleate (PGPR) is a cheap emulsifier used to replace cocoa butter in budget chocolate. FDA GRAS but signals NOVA 4 ultra-processed formulation and lower cocoa content. Flag as LOW concern.
HFCS + PETROLEUM DYES (score 6-7 — dye floors fire):
- Sour Patch Kids (HFCS + Red 40 + Yellow 5 + Blue 1): materials=7 → final ~7. NEVER score below 6.
- Starburst (HFCS + Red 40 + Yellow 5 + Yellow 6 + hydrogenated palm kernel oil): materials=7 → final ~7. NEVER score below 6.
- Jolly Ranchers (HFCS + artificial dyes): materials=7 → final ~6-7. NEVER score below 6.
- Airheads (HFCS + artificial dyes + titanium dioxide IARC 2B): materials=7 (HFCS + dyes + TiO2) → final ~7.
- Nerds (HFCS + carmine + Red 40 + Blue 1): materials=7 → final ~7. NEVER score below 6.
- Peach Rings / generic gummy candy (HFCS + Red 40 + Yellow 5): materials=7 → final ~6-7.
- Trolli sour worms (HFCS + multiple dyes): materials=7 → final ~6-7.

SNACK CAKE AND PACKAGED PASTRY CALIBRATION:
- Hostess Twinkies (HFCS, sorbic acid, polysorbate 60, 27 ingredients — NOVA 4 industrial formulation): materials=6 → final ~6. NEVER score below 5.
- Hostess Ding Dongs / Ho Hos (HFCS + hydrogenated oil + artificial flavors): materials=6 → final ~6. NEVER score below 5.
- Little Debbie Swiss Rolls (HFCS + corn syrup + modified starch + 20+ additives): materials=6 → final ~6.
- Little Debbie Nutty Bars (HFCS + corn syrup + partially hydrogenated oil in older formulas): materials=6 → final ~6.
- Pop-Tarts (HFCS + TBHQ + artificial dyes — TBHQ floor fires): materials=7 → final ~6-7. NEVER score below 6.
- Cosmic Brownies / Little Debbie brownies with colored candy (HFCS + dyes): materials=7 (dyes) → final ~6-7.

CHOCOLATE BAR HIERARCHY — quality matters:
PREMIUM MILK CHOCOLATE (no HFCS, cocoa butter — score 3-4):
- Lindt Milk Chocolate (cocoa butter, whole milk powder, vanilla — no HFCS, no PGPR): materials=3 → final ~3-4.
- Ghirardelli Milk Chocolate (cocoa butter, no HFCS): materials=3 → final ~3-4.
BUDGET MILK CHOCOLATE (HFCS + PGPR — score 5-6):
- Hershey's Milk Chocolate bar (HFCS, PGPR, artificial flavor — different from premium milk chocolate): materials=5 (HFCS + PGPR + ultra-processed) → final ~5. NEVER score same as Lindt milk.
- Hershey's Kisses (same formulation): materials=5 → final ~5.
CLEAN DARK CHOCOLATE (score 2-3):
- Hu Chocolate / Lindt 70%+ / Green & Black's 70%+ (cocoa butter, no HFCS, no PGPR, no artificial flavors): materials=2 → final ~2-3.
RULE: Cocoa butter = premium signal. PGPR replacing cocoa butter = NOVA 4 flag. HFCS in chocolate = always 5+.

YOPLAIT AND HIGH-HFCS YOGURT:
- Yoplait Original (US formulation uses HFCS in most flavors — check label): materials=5 (HFCS floor) → final ~5. This is NOT the same as Stonyfield or Chobani plain. NEVER score below 4.
- Yoplait Whips (HFCS, modified starch, gelatin, artificial flavor): materials=5 → final ~5.
- Dannon Fruit on the Bottom (added sugar, natural flavors, modified starch — no HFCS in current formula): materials=4 → final ~4.

ELECTRONICS AND TECH CALIBRATION (category: other):
APPLE PRODUCTS (Environmental Progress Reports published annually — materials disclosures are detailed and verifiable):
- iPhone 15/16 (recycled aluminum, titanium, no PVC/BFR, recycled cobalt battery, EPEAT Gold): materials=2, usage=2, sustainability=3 → final ~2. Most transparent major electronics brand on materials.
- MacBook Air M-series (recycled aluminum, no PVC/BFR/PFAS, EPEAT Gold): materials=2, usage=2, sustainability=2 → final ~2.
- AirPods (non-repairable, non-recyclable battery, plastic housing — iFixit repairability score 0): materials=3, usage=3, sustainability=7 → final ~4-5. The non-repairability is the primary concern.
- Apple Watch (recycled aluminum, no PVC/BFR, limited repairability): materials=2, usage=3, sustainability=5 → final ~3.
OTHER BRANDS:
- Samsung Galaxy (some recycled materials, EPEAT certified some models, improving supply chain transparency): materials=3, usage=2, sustainability=4 → final ~3.
- Google Pixel (recycled aluminum, improving repairability, Fair Trade certified factory): materials=3, usage=2, sustainability=3 → final ~3.
- Amazon Echo (ABS plastic, non-repairable, no meaningful take-back program): materials=4, usage=4, sustainability=7 → final ~5.
- Generic / unbranded charger (unknown plastics, no RoHS confirmation, possible lead solder, no safety cert): materials=6, usage=5, sustainability=7 → final ~6. Flag: "Uncertified charger — possible lead solder, unknown plastics, fire risk."
ELECTRONICS RULE: Apple material declarations = use them. RoHS compliance = no lead/cadmium. EPEAT Gold = sustainability 2-3. Non-repairable + no take-back = sustainability 7-8. Never score electronics above 8 unless confirmed harmful substances (PBDEs, lead above RoHS threshold).

MOUTHWASH CALIBRATION:
CLEAN (score 2-3):
- Therabreath Fresh Breath Rinse (no alcohol, no artificial dyes, no saccharin, oxygenating): materials=2, usage=2 → final ~2. Benchmark clean mouthwash.
- ACT Anticavity fluoride rinse (no artificial dyes, alcohol-free option, minimal additives): materials=3, usage=3 → final ~3.
CONVENTIONAL HIGH-CONCERN (score 5-6):
- Listerine Cool Mint (21.6% ethyl alcohol, saccharin, Blue 1 petroleum dye, artificial flavors): materials=6 (Blue 1 dye floor fires), usage=5 → final ~5-6. NEVER score below 5.
- Scope Cool Peppermint (ethyl alcohol, saccharin, Blue 1, Yellow 5 — two petroleum dyes): materials=6 → final ~6.
- Listerine for Kids (Red 40 + Blue 1, saccharin, child daily oral use): materials=7 (dye floor fires — child daily ingestion), usage=6 → final ~6-7. NEVER below 5.
MOUTHWASH RULE: Alcohol 21%+ = HIGH usage concern. Artificial dyes = floor fires (materials 6+ minimum). Alcohol-free + no artificial dyes = 2-3.

PET FOOD CALIBRATION:
HIGH CONCERN KIBBLE (score 5-7):
- Pedigree dry (BHA + artificial dyes confirmed in some): materials=6 (BHA floor + dyes) → final ~5-6.
- Friskies cat food (Red 40, Blue 1 in some): materials=6 (dye floor) → final ~6.
- Iams dry (BHA/BHT preservatives, by-product meal): materials=5 (BHA/BHT floor) → final ~5.
- Purina ONE (BHT in some, by-product meal): materials=5 → final ~5.
- Royal Canin Breed Specific (highly processed, synthetic preservatives): materials=5 → final ~4-5.
- Hill's Science Diet (BHT, by-products — "science" branding ≠ clean): materials=5 → final ~5.
MODERATE KIBBLE (score 3-4):
- Purina Pro Plan (higher meat content, some BHA-preserved fat): materials=4 → final ~4.
- Blue Buffalo Life Protection (no artificial colors/preservatives — multiple FDA recalls for vitamin D toxicity): materials=3, flag "Multiple FDA recalls — verify current formula" → final ~3-4.
CLEAN PET FOOD (score 1-3):
- Orijen (fresh/raw, no artificial preservatives, high meat): materials=2 → final ~2.
- Stella & Chewy's Freeze-Dried Raw (minimal, no artificial preservatives): materials=2 → final ~2.
- Honest Kitchen (human-grade, no by-products, no artificial preservatives): materials=2 → final ~2.
- Open Farm (certified humane, traceable sourcing): materials=2 → final ~2.
PET FOOD RULE: BHA or BHT = floor fires (materials 5+). Artificial dyes in pet food = floor fires (6+). "Natural preservatives" (mixed tocopherols) = clean signal.

PET TREATS:
- Milk-Bone original (BHA preserved fat, wheat flour): materials=5 (BHA floor) → final ~5.
- Beggin' Strips (Red 40, sodium nitrite): materials=7 (nitrite floor + dye floor) → final ~6-7.
- Zuke's Mini Naturals (no BHA/BHT, clean chicken, no artificial colors): materials=2 → final ~2.
- Blue Buffalo Wilderness treats (no artificial colors or preservatives): materials=2 → final ~2.

HOME PRODUCT GAPS:
- Magic Eraser (melamine foam — releases fine particles during scrubbing; do NOT use on food-contact surfaces): materials=5, usage=5 → final ~5. Flag: "Melamine foam particles released during use — avoid food-contact surfaces."
- Windex original (2-butoxyethanol — EPA hazardous air pollutant, absorbed through skin and lungs): materials=6, usage=6 → final ~6. Flag 2-butoxyethanol explicitly.
- Pledge furniture polish (synthetic fragrance, isobutane propellant, aerosolized): materials=5, usage=5 → final ~5.
- Downy liquid fabric softener (quaternary ammonium compounds coat fibers — QACs linked to lung accumulation; synthetic fragrance; daily skin contact from coated clothing): materials=6, usage=6 → final ~6. NEVER score below 5.
- Wool dryer balls (reusable, no QACs, no synthetic fragrance, organic wool): materials=1, usage=1 → final ~1-2.

HAND SANITIZER CALIBRATION:
- Purell original (ethyl alcohol 70%, glycerin, minimal additives, no fragrance, no dyes): materials=3, usage=3 → final ~3. Benchmark clean sanitizer.
- EO organic hand sanitizer (organic ethyl alcohol, essential oils, no artificial fragrance): materials=2, usage=2 → final ~2.
- Bath & Body Works hand sanitizer (synthetic fragrance, PEG compounds, artificial dyes in some): materials=5, usage=4 → final ~5. Flag: synthetic fragrance on hands = transdermal absorption throughout the day.
- Triclosan-based sanitizer (triclosan — FDA banned in soap, some sanitizers still use it): materials=7 (FDA-banned substance, endocrine disruptor) → final ~6-7. NEVER below 6.
HAND SANITIZER RULE: Ethyl alcohol + glycerin only = 2-3. Synthetic fragrance = 4-5. Triclosan = floor fires (7).

MATTRESS AND BEDDING CALIBRATION:
CLEAN ORGANIC (score 1-2):
- Avocado Green Mattress (GOLS certified organic latex + GOTS organic cotton + GOTS organic wool + Greenguard Gold, no synthetic foam, no added flame retardants): materials=1, usage=1 → final ~1-2. Benchmark clean mattress.
- Nest Bedding / Birch (GOTS certified organic cotton + wool, natural latex, no FR treatment): materials=1, usage=1 → final ~1-2.
CONVENTIONAL FOAM WITH CERTIPUR-US (score 2-4):
- Saatva Classic (innerspring metal core, minimal foam contact layer, CertiPUR-US): materials=2, usage=2 → final ~2.
- Casper Original (memory foam + springs, CertiPUR-US certified — no PBDE, no TCEP): materials=3, usage=3 → final ~3.
- Purple mattress (Hyper-Elastic Polymer grid + CertiPUR-US foam): materials=3, usage=3 → final ~3.
- Tempur-Pedic (proprietary viscoelastic foam, CertiPUR-US, Greenguard Gold): materials=4 (denser proprietary foam), usage=3 → final ~3-4.
- IKEA Hasvag / Morgedal (foam, OEKO-TEX Standard 100): materials=3, usage=3 → final ~3.
MATTRESS RULE: CertiPUR-US = no PBDE/TCEP/TDCPP, low VOC — meaningful but NOT organic. GOLS + GOTS = full organic supply chain. Uncertified memory foam = materials 5+ with off-gassing flag.

HOUSEHOLD TOOLS, PAPER PRODUCTS AND FOOD STORAGE CALIBRATION:
SPONGES AND CLEANING TOOLS:
- Scotch-Brite synthetic sponge (nylon/polyester fibers — sheds microplastics into water every use, non-biodegradable): materials=5, sustainability=8 → final ~5-6. Flag: synthetic sponges release microplastics into wastewater.
- Skoy cloth (cotton/wood cellulose, no synthetic fibers, compostable): materials=1, sustainability=2 → final ~1-2. Benchmark clean sponge alternative.
- Full Circle cellulose sponge (plant-based, no synthetic microfibers): materials=2, sustainability=3 → final ~2.
SWIFFER:
- Swiffer WetJet (proprietary cleaning solution with PVA, synthetic fragrance, single-use plastic pads): materials=5, usage=5 (crawling babies and pets on treated floors), sustainability=7 → final ~5.
- Swiffer Sweeper dry (no chemical solution — electrostatic dry pads only, lower exposure): materials=3, sustainability=7 → final ~4.
PAPER PRODUCTS:
- Bounty paper towels (conventional chlorine-bleached, single-use): materials=3, sustainability=8 → final ~4-5.
- Seventh Generation 100% Recycled paper towels (process chlorine free, recycled): materials=2, sustainability=5 → final ~3.
- Who Gives A Crap bamboo paper towels (FSC certified, process chlorine free): materials=2, sustainability=3 → final ~2.
PLASTIC BAGS AND WRAPS:
- Ziploc bags (LDPE, BPA-free, no plasticizers — but single-use plastic): materials=3, sustainability=8 → final ~4.
- Saran Wrap (PVDC or LDPE depending on variant — PVDC contains chlorine-based plastic, more concerning): materials=4, sustainability=8 → final ~5.
- Glad ClingWrap (LDPE, BPA-free): materials=3, sustainability=8 → final ~4.
CLEAN FOOD STORAGE:
- Stasher silicone bags (food-grade platinum silicone, reusable indefinitely): materials=1, usage=1, sustainability=1 → final ~1. Benchmark clean bag.
- Beeswax wraps (organic cotton + beeswax + tree resin, compostable): materials=1, sustainability=1 → final ~1.
- Anchor Hocking glass containers (soda-lime glass, stainless metal lids): materials=1, sustainability=2 → final ~1-2.

FLINTSTONES VITAMINS — highest priority children's supplement calibration:
- Flintstones Complete chewable vitamins (Red 40 + Yellow 6 + Blue 1 — THREE petroleum dyes FDA is actively phasing out; plus talc + titanium dioxide IARC 2B; taken DAILY by children starting from infancy): materials=8 (three dye floors fire, each at mFloor:7), usage=8 (daily oral ingestion by children — child vulnerability flag), → final ~7-8. NEVER score below 7. This is one of the most important single calibrations in the supplement database. A children's vitamin with three FDA-flagged dyes taken daily represents one of the highest cumulative dye exposures in the average American child's diet.
- Flintstones Gummies variant (same three dyes + HFCS + sorbitol): materials=8 → final ~7-8. NEVER score below 7.
- DO NOT confuse with: SmartyPants Kids Complete (no petroleum dyes, natural colors from turmeric/spirulina, omega-3 included): materials=2 → final ~2-3. This is what a clean children's vitamin looks like.
- Nordic Naturals Children's DHA (no dyes, clean fish oil): materials=2 → final ~2.
- Zarbee's (no dyes in most lines, honey-based): materials=2 → final ~2-3.

NAIL POLISH AND NAIL CARE CALIBRATION:
The key variable is "free" count — how many harmful chemicals have been removed.
CLEAN (score 2-4):
- Zoya nail polish (7-free: no toluene, DBP, formaldehyde, formaldehyde resin, camphor, TPHP, led): materials=3, usage=3 → final ~3. Benchmark clean nail polish.
- Olive & June nail polish (10-free — removes 10 harmful ingredients including TPHP): materials=2, usage=3 → final ~2-3.
- Orly nail polish (12-free formula): materials=2, usage=3 → final ~2-3.
- Ella+Mila (7-free, vegan): materials=3, usage=3 → final ~3.
CONVENTIONAL (score 4-6):
- OPI nail polish (3-free in most — removes toluene, DBP, formaldehyde but TPHP still present in many): materials=4, usage=5 → final ~4-5. Better than the worst but TPHP is a concern.
- Essie (some formulas still contain TPHP — check specific product): materials=4, usage=5 → final ~4-5.
HIGH CONCERN (score 5-7 — TPHP floor fires):
- Sally Hansen conventional (tosylamide/formaldehyde resin + TPHP in standard formula — TPHP floor mFloor:7 fires): materials=6, usage=6 → final ~6. NEVER score below 5.
NAIL POLISH RULE: Look for "free" count. 7-free or higher = 2-4. 3-free (only toluene/DBP/formaldehyde removed, TPHP still present) = 4-5. No claims = 5-6. TPHP confirmed = mFloor:7 fires.

HAIR DYE CALIBRATION:
CONVENTIONAL (PPD-containing — score 6-8):
- L'Oreal Excellence / Preference hair dye (PPD p-phenylenediamine + resorcinol + ammonia — PPD floor mFloor:6 fires; IARC-3, common contact allergen): materials=7, usage=7 → final ~6-7. NEVER score below 6.
- Clairol Nice 'n Easy (PPD + resorcinol + hydrogen peroxide — same triad as L'Oreal): materials=7, usage=7 → final ~6-7. NEVER score below 6.
- Garnier Nutrisse (PPD + resorcinol + ammonia): materials=7, usage=7 → final ~6-7.
- Revlon ColorSilk (PPD, lower concentration): materials=6, usage=6 → final ~6.
PPD-FREE / CLEAN (score 2-4):
- Madison Reed (ammonia-free in Radiant line, PPD-free in some formulas — check specific variant): materials=4, usage=4 → final ~4. Better than conventional but still has resorcinol in some.
- Arctic Fox hair dye (vegan, PPD-free, no ammonia, no peroxide — direct deposit on existing color): materials=2, usage=2 → final ~2-3. Benchmark clean hair dye.
- Overtone color depositing conditioner (no PPD, no ammonia, no peroxide): materials=2, usage=2 → final ~2. Clean conditioning color.
- Henna (100% natural plant-based, no PPD): materials=1, usage=2 → final ~1-2.
HAIR DYE RULE: PPD confirmed = floor fires (mFloor:6). PPD + ammonia + resorcinol = 6-7 minimum. PPD-free + ammonia-free = 2-4. Natural (henna) = 1-2.

PERFUME AND COLOGNE CALIBRATION:
All conventional perfumes/colognes contain "Fragrance" or "Parfum" — an undisclosed mix of potentially 50-200 individual chemicals including phthalates, musks, and VOCs. EU REACH requires disclosure of 26 allergens but US regulations do not.
HIGH CONCERN (score 5-7 — undisclosed formula):
- Chanel No. 5 / Chanel fragrances (synthetic fragrance — undisclosed formula, confirmed phthalates in some independent testing): materials=6, usage=6 → final ~6. Iconic brand does not mean safer formula.
- Dior Sauvage / Miss Dior (synthetic fragrance — undisclosed): materials=6, usage=6 → final ~6.
- Old Spice cologne (synthetic fragrance, no disclosure): materials=6, usage=6 → final ~6.
- Victoria's Secret body mist (synthetic fragrance + alcohol): materials=5, usage=5 → final ~5.
- Bath & Body Works fragrance (synthetic fragrance + phthalates + DEP): materials=6, usage=6 → final ~6. Flag: independent testing confirmed phthalates in BBW fragrance products.
CLEAN FRAGRANCE (score 2-4):
- Phlur (EU allergen-disclosed, phthalate-free, no animal-derived musks): materials=3, usage=3 → final ~3.
- Ellis Brooklyn (phthalate-free, full ingredient disclosure): materials=2, usage=3 → final ~2-3.
- Dedcool (phthalate-free, fragrance-free options, clean formulation): materials=2, usage=2 → final ~2.
- Skylar (hypoallergenic, phthalate-free, clean disclosure): materials=2, usage=2 → final ~2.
FRAGRANCE RULE: "Fragrance" or "Parfum" as an ingredient without individual disclosure = synthetic fragrance floor fires (mFloor:5). Phthalate-free + full disclosure = 2-3. No disclosure at all = 5-6 minimum.

FLEA AND TICK PRODUCT CALIBRATION:
HIGH CONCERN — ORGANOPHOSPHATE/PYRETHROID:
- Hartz UltraGuard flea collar (tetrachlorvinphos — organophosphate NRDC-petitioned for EPA ban due to cancer risk in children and pets, carcinogenicity in rodent studies): materials=8, usage=8 (direct daily skin/fur contact for months) → final ~8. NEVER score below 7. Flag: "NRDC petitioned EPA to ban tetrachlorvinphos — carcinogenicity concerns. Children who pet the animal or sleep with it are also exposed."
- Seresto flea collar (flumethrin + imidacloprid — EPA 2021 incident reports included 1,698 deaths and 75,000 pet incidents): materials=7, usage=7 → final ~7. NEVER score below 6.
- Advantage II (imidacloprid — systemic insecticide absorbed into bloodstream): materials=6, usage=6 → final ~5-6.
- Frontline Plus (fipronil — GABA antagonist, lower mammalian toxicity than organophosphates): materials=4, usage=4 → final ~4.
CLEAN FLEA ALTERNATIVES (score 2-4):
- Wondercide (cedar oil + sodium lauryl sulfate — OMRI listed, plant-based): materials=2, usage=2 → final ~2-3.
- Vet's Best (plant-based — rosemary, clove, peppermint): materials=2, usage=2 → final ~2-3.
- Flea comb (physical removal, no chemicals): materials=1, usage=1 → final ~1.
FLEA COLLAR RULE: Tetrachlorvinphos = materials 8 minimum — NEVER score Hartz flea collar below 7. Organophosphate or carbamate compounds in any flea product = 7-8 minimum.

PET FOOD DYE CALIBRATION:
- Purina Fancy Feast classic pate (Red 40 in some flavors — artificial dye in cat food eaten daily): materials=6 (Red 40 dye floor fires), usage=5 → final ~5-6. Check specific flavor — not all have dyes.
- Friskies wet cat food (Red 40 + Blue 1 in many flavors — the dyed gravy is the issue): materials=6 (dye floors fire), usage=5 → final ~5-6. NEVER score Friskies below 5.
- Ol' Roy dog food (Walmart brand — Red 40, caramel color, BHA): materials=6 (dye + BHA floors fire) → final ~6.
- Purina Beneful (artificial dyes, propylene glycol, BHA): materials=6 (multiple floors fire) → final ~6.

ORAL RINSE AND MOUTHWASH CALIBRATION:
HIGH CONCERN (score 5-7):
- Listerine Cool Mint (21.6% ethyl alcohol + saccharin + FD&C Green 3 petroleum dye — Blue 1 in some variants): materials=6 (dye floor fires), usage=5 → final ~5-6. NEVER score below 5.
- Listerine Kids Smart Rinse (Red 40 + Blue 1 + saccharin + daily child use — TWO petroleum dyes, child vulnerability flag): materials=7 (two dye floors fire), usage=6 → final ~6-7. NEVER score below 6.
- ACT Kids Anticavity (FD&C Red 40, saccharin, artificial flavors — child daily use): materials=6 (Red 40 floor fires, child vulnerability), usage=6 → final ~5-6.
CLEAN (score 2-3):
- Listerine Zero Alcohol (no alcohol — but check for dyes in current formula): materials=4 → final ~4.
- TheraBreath (no alcohol, no dyes, no saccharin, CPC as active): materials=3, usage=3 → final ~3. Significantly cleaner than conventional Listerine.
- ACT Restoring fluoride rinse (alcohol-free, clean formula): materials=3 → final ~3.
- Tom's of Maine mouth rinse (SLS-free, no artificial flavors, no alcohol in some): materials=3 → final ~3.

INSECT REPELLENT CALIBRATION:
HIGH CONCERN — DEET-BASED:
- OFF! Deep Woods DEET 98% (N,N-diethyl-meta-toluamide at very high concentration — neurotoxin class, skin and mucous membrane absorber, not recommended for children under 3): materials=7, usage=7 (full-body application repeatedly during outdoor activity) → final ~7. NEVER score below 6.
- OFF! Family Care DEET 15% (lower concentration, safer for children than 98% but still DEET — avoid on broken skin, wash off indoors): materials=5, usage=5 → final ~5.
MODERATE — PICARIDIN/PLANT-BASED CDC-APPROVED:
- Sawyer Picaridin (picaridin 20% — CDC approved for Zika/malaria, lower mammalian toxicity than DEET, does not dissolve plastics): materials=3, usage=3 → final ~3. Preferred over DEET for daily use.
- Ranger Ready Picaridin (picaridin — gentler than DEET, same efficacy): materials=3, usage=3 → final ~3.
- Repel Lemon Eucalyptus (PMD/oil of lemon eucalyptus — plant-based, CDC approved for disease-carrying mosquitoes): materials=2, usage=2 → final ~2-3. Do NOT use on children under 3.
- Cutter Natural (essential oils — clove, rosemary, thyme — OMRI listed, natural): materials=2, usage=2 → final ~2.
THERMACELL (inhalation concern):
- Thermacell mosquito repeller (allethrin — synthetic pyrethroid volatilized into 15-foot zone, continuously inhaled during outdoor use, aquatic toxin): materials=6, usage=6 (EPA-registered pesticide breathed in open air) → final ~6. Flag: "allethrin is inhaled continuously during use — EPA-registered pesticide. Choose picaridin topicals for lower inhalation risk."

BEEF JERKY AND MEAT SNACK CALIBRATION:
CLEAN (score 1-3):
- EPIC bars (whole prey animal protein, sea salt, natural spices — no nitrites, no celery powder, no artificial additives): materials=2, usage=2 → final ~2. Benchmark clean meat snack.
- Chomps meat sticks (no sodium nitrite, no celery powder, no artificial dyes, whole ingredients): materials=2, usage=2 → final ~2. Genuinely clean.
- Vermont Smoke & Cure jerky (no nitrites, no artificial dyes, simple ingredients): materials=2 → final ~2.
HIGH CONCERN — SODIUM NITRITE (score 6-7):
- Jack Link's beef jerky (sodium nitrite + HFCS in most flavors — IARC Group 1 nitrite + HFCS combined): materials=7 (sodium nitrite floor fires — mFloor:8, HFCS floor fires — mFloor:5, nitrite is dominant), usage=6 → final ~6-7. NEVER score Jack Link's below 6.
- Slim Jim (sodium nitrite + mechanically separated chicken + artificial flavors + corn syrup): materials=7 (nitrite floor fires) → final ~7. NEVER score below 6.
- Old Wisconsin meat sticks (sodium nitrite): materials=6 (nitrite floor fires) → final ~6.
UNCURED WITH CELERY POWDER (score 5-6):
- Applegate Farms beef jerky (celery juice powder — same nitrite concern as conventional, labeling loophole): materials=6 → final ~5-6. NEVER score same as EPIC or Chomps.

KETO AND LOW-CARB FOOD CALIBRATION:
CLEAN KETO (score 2-4):
- Lily's chocolate (stevia + erythritol sweetened — no sucralose, no petroleum dyes, simple chocolate ingredients): materials=3 → final ~3. Clean keto chocolate benchmark.
- ChocZero (monk fruit + erythritol — no sucralose, clean sweeteners, simple ingredients): materials=3 → final ~3.
- Honey Stinger waffles and gels (organic honey + whole ingredients): materials=2 → final ~2.
- Maurten energy gel (maltodextrin + water + electrolytes — no artificial additives whatsoever): materials=2 → final ~2. Cleanest mainstream sports gel.
- Tailwind endurance fuel (sucrose + glucose + electrolytes — no artificial dyes, no artificial flavors): materials=2 → final ~2.
CONVENTIONAL KETO (score 4-6):
- Quest tortilla chips (sucralose + protein isolate + NOVA 4 formulation): materials=5 (sucralose floor fires) → final ~5.
- Rebel keto ice cream (erythritol + sucralose + cream — sucralose floor fires): materials=5 → final ~5.
- Ratio keto bar (sucralose + NOVA 4): materials=5 → final ~5.
- Clif Bloks energy chews (conventional oats + brown rice syrup + natural flavors): materials=4 → final ~4.
- GU Energy Gel (maltodextrin + artificial flavors + sodium benzoate in some): materials=4 → final ~4. Sodium benzoate = benzene risk in acidic conditions.

FROZEN MEAL CALIBRATION ADDITIONS:
- Stouffer's macaroni & cheese (processed cheese sauce with sodium phosphate + sodium citrate + enriched pasta + NOVA 4): materials=6 → final ~6. NEVER score below 5.
- Marie Callender's pot pie (enriched flour + partially hydrogenated lard in some + 1000mg+ sodium + NOVA 4): materials=6 → final ~6. Check current formula — partially hydrogenated = trans fat floor fires if present.
- Healthy Choice Simply Steamers (cleaner frozen brand — lower sodium, fewer additives, no artificial flavors in most): materials=3 → final ~3. Meaningfully better than Lean Cuisine.
- Birds Eye vegetables (frozen vegetables, no additives — just vegetables): materials=1 → final ~1.

MLM NUTRITION PRODUCTS — GREENWASHING AND QUALITY RULE:
- Herbalife shakes (artificial dyes, sucralose, folic acid synthetic, proprietary blends without full disclosure, sold through multilevel marketing): materials=6 (sucralose floor fires + artificial dyes in colored products), usage=6 (daily meal replacement) → final ~6. NEVER score below 5. Flag: "Proprietary blend without full disclosure — third-party testing not confirmed."
- Isagenix (synthetic sweeteners, artificial flavors, whey isolate, proprietary blends, MLM distribution): materials=6 → final ~5-6. Same concerns as Herbalife.
- Shakeology / Beachbody (proprietary blends, some sucralose, some artificial flavors): materials=5 → final ~5.
MLM NUTRITION RULE: Any nutrition product sold through MLM with proprietary blends and no third-party NSF/Informed Sport certification should carry a MEDIUM heavy metals concern and flag: "No independent third-party testing confirmed." Score conservatively.

SKINCARE AND SERUM CALIBRATION:
CLEAN SKINCARE (score 1-3):
- The Ordinary Retinol (retinol + squalane — no synthetic fragrance, no parabens, no silicones): materials=2, usage=3 → final ~2-3. Price doesn't determine safety.
- Paula's Choice BHA Exfoliant (salicylic acid — no synthetic fragrance, fragrance-free, no dyes): materials=2, usage=2 → final ~2. EWG top-rated.
- Drunk Elephant TLC Framboos (AHA/BHA blend, no synthetic fragrance, no essential oils, no silicones): materials=2, usage=2 → final ~2. One of the cleanest mainstream serums.
- Tatcha Water Cream / Dewy Skin Cream (no synthetic fragrance, Japanese botanical ingredients, no parabens): materials=1, usage=1 → final ~1-2.
- Youth To The People Superfood Serum (USDA Organic, no synthetic fragrance): materials=2 → final ~2.
CONVENTIONAL WITH CONCERNS (score 3-5):
- Neutrogena Rapid Wrinkle Repair retinol (retinol + synthetic fragrance — fragrance floor fires): materials=4, usage=5 → final ~4-5.
- RoC Retinol Correxion (retinol + synthetic fragrance + parabens in older formulas): materials=5, usage=5 → final ~5.
SPF MOISTURIZER — MINERAL VS CHEMICAL:
- Elta MD UV Clear SPF 46 (zinc oxide + niacinamide — mineral, no synthetic fragrance, EWG Verified): materials=2, usage=2 → final ~2. Benchmark clean SPF.
- EltaMD UV Sport (zinc oxide — mineral, no fragrance): materials=2 → final ~2.
- Supergoop Unseen Sunscreen (ethylhexyl methoxycrylene — chemical UV filter with FDA absorption concerns, no fragrance): materials=4 → final ~4.
- CeraVe SPF 30 moisturizer (avobenzone + octisalate chemical UV filters — FDA systemic absorption concerns): materials=4 → final ~4-5.
- La Roche-Posay Anthelios (multiple chemical UV filters): materials=4, usage=5 → final ~4-5.

SELF-TANNER CALIBRATION:
DHA (dihydroxyacetone) is the active ingredient in all self-tanners — FDA raised concerns about inhalation from spray application (aerosol or spray booth).
- Banana Boat self-tanner (DHA + synthetic fragrance + parabens + propylene glycol): materials=5, usage=5 → final ~5.
- St. Tropez self-tan (DHA + synthetic fragrance — better ingredients than Banana Boat but still fragrance): materials=4, usage=5 → final ~4-5.
- Loving Tan (DHA — fragrance-free in some, cleaner formulation): materials=3, usage=3 → final ~3.
- Coola organic self-tanner (USDA Organic, no synthetic fragrance, DHA from plant-derived sources): materials=2, usage=2 → final ~2.
SELF-TANNER RULE: Spray format raises usage score (inhalation of DHA + any propellants). Always prefer lotion/mousse application. Fragrance-free = lower concern. USDA Organic base = 2. Conventional + fragrance = 4-5.
PERSONAL HYGIENE AND SPECIALTY PERSONAL CARE CALIBRATION:

FEMININE HYGIENE WASH:
- Summer's Eve feminine wash (synthetic fragrance + parabens + artificial dyes — applied to mucosal tissue daily): materials=5, usage=6 → final ~5-6. NEVER score below 5.
- Vagisil wash / cream (benzocaine — FDA warned against for genital use + synthetic fragrance + parabens): materials=6, usage=7 → final ~6-7. NEVER score below 6.
- Honey Pot Feminine Wash (natural botanical, no synthetic fragrance, no parabens, no dyes): materials=2, usage=2 → final ~2. Clean benchmark.
- Dove Sensitive Feminine Wash (fragrance-free, pH-balanced): materials=2, usage=2 → final ~2.
FEMININE WASH RULE: Any product applied to genital mucosal tissue with synthetic fragrance or parabens = materials 5+ minimum. Mucosal tissue has higher absorption than intact skin.

DEPILATORY / HAIR REMOVAL:
- Nair / Veet hair removal cream (calcium thioglycolate — strong alkaline chemical + synthetic fragrance): materials=5, usage=6 (chemical reaction on skin 3-10 min) → final ~5-6.
- Sugaring paste (sugar + lemon + water — food-grade, no synthetics): materials=1, usage=1 → final ~1.

ACNE TREATMENT:
- Differin Gel (adapalene, no fragrance, minimal formula): materials=2, usage=3 → final ~2-3.
- Proactiv (benzoyl peroxide + synthetic fragrance + parabens + EDTA): materials=4, usage=5 → final ~4-5.
- AcneFree (same concerns as Proactiv): materials=4, usage=5 → final ~4-5.

SKIN LIGHTENING:
- Ambi Fade Cream / Porcelana (hydroquinone 2% — hydroquinone floor fires, FDA proposed ban, EU banned): materials=7, usage=7 → final ~7. NEVER score below 6.
- Niacinamide / vitamin C brightening serums (no hydroquinone): materials=2 → final ~2-3. Clean alternatives.

EYE DROPS:
- Visine (tetrahydrozoline + benzalkonium chloride — rebound redness + BAK eye sensitizer): materials=4, usage=5 → final ~4-5.
- Refresh Tears (carboxymethylcellulose — single ingredient, no BAK in single-dose): materials=2, usage=2 → final ~2. Clean benchmark.
- Rohto (tetrahydrozoline + menthol — harsh formula): materials=5, usage=5 → final ~5.

FOOT CARE:
- Gold Bond Medicated Foot Powder / Dr. Scholl's Foot Powder (talc primary — talc floor fires): materials=5, usage=5 → final ~5. NEVER score below 4.
- Zeasorb-AF (cellulose-based, talc-free): materials=2 → final ~2.

FIVE GUYS AND SHAKE SHACK — genuinely cleaner fast food:
- Five Guys burger (fresh never-frozen beef, peanut oil — no TBHQ confirmed, enriched flour bun): final score ~5. Cleaner than McDonald's but not clean. NEVER score at 2-3.
- Five Guys French Fries (peanut oil, potato, salt — no TBHQ, simpler than McDonald's fries): final score ~4.
- Shake Shack ShackBurger (hormone-free beef, potato bun — simpler than enriched flour, no TBHQ confirmed): final score ~5.
- Shake Shack Fries (crinkle cut, no TBHQ, simpler): final score ~4.
FIVE GUYS / SHAKE SHACK RULE: Range is 4-5, never 7+ (McDonald's tier) and never 2-3 (clean food tier). They earn their cleaner positioning within fast food — not outside it.

SONIC / DAIRY QUEEN / JACK IN THE BOX / WHATABURGER:
- Sonic Footlong Coney (sodium nitrite in hot dog + enriched bun): final score ~7. Nitrite floor fires. NEVER score below 6.
- Sonic Cherry Limeade (HFCS + Red 40): final score ~6-7. HFCS floor + dye floor both fire.
- Sonic Blast / Shake (HFCS + corn syrup + artificial colors in some): final score ~6.
- Dairy Queen Blizzard (HFCS + corn syrup + artificial flavors): final score ~6.
- DQ Chicken Strip Basket (TBHQ + MSG + enriched flour): final score ~7. NEVER score below 6.
- Jack in the Box Tacos (mechanically separated chicken + TBHQ): final score ~7. NEVER score below 6.
- Whataburger (TBHQ + enriched flour + high sodium): final score ~6.

WING CHAINS AND BAR FOOD:
- Wingstop wings (TBHQ + MSG + high sodium): final score ~7. NEVER score below 6.
- Buffalo Wild Wings traditional wings (TBHQ + MSG + HFCS in sauces): final score ~7. NEVER score below 6.
- Buffalo Wild Wings boneless (processed chicken + TBHQ + enriched flour): final score ~7.

CASUAL DINING:
- Applebee's riblets (sodium nitrite + HFCS sauce + 3000mg sodium — both sodium and nitrite floors fire): final score ~8. NEVER score below 7.
- Chili's Awesome Blossom (TBHQ + 2700mg sodium — extreme sodium rule fires): final score ~7-8.
- Chili's Chicken Crispers (TBHQ + MSG): final score ~7.
- Olive Garden Fettuccine Alfredo (cream + butter + high sodium — relatively clean): final score ~5-6.
- IHOP buttermilk pancakes (enriched flour + HFCS syrup): final score ~6.
- Denny's Grand Slam with bacon/sausage (sodium nitrite in bacon/sausage — floor fires): final score ~7.
- Cheesecake Factory any pasta (3000mg+ sodium standard — extreme sodium floor fires): final score ~7-8. NEVER score Cheesecake Factory pasta below 7.

- Roundup Weed & Grass Killer (glyphosate — IARC Group 2A, $13B Bayer legal settlements, WHO flagged): materials=8 (glyphosate floor mFloor:5 but product is primary application of IARC 2A carcinogen — floor should be 8 for Roundup specifically), usage=7, sustainability=9 → final ~8. NEVER score Roundup below 7.
- Ortho Home Defense Insect Killer (bifenthrin — pyrethroid, aquatic toxin, EPA-flagged for waterway harm): materials=7, usage=6, sustainability=7 → final ~7.
- Spectracide weed killer (2,4-D herbicide — IARC Group 2B + dicamba): materials=7, usage=6 → final ~7.
- Espoma Organic fertilizer (OMRI listed, no synthetic chemicals): materials=2, sustainability=2 → final ~2.
- Safer Brand insect killer (potassium salts of fatty acids, OMRI listed): materials=2, sustainability=2 → final ~2.
- Miracle-Gro liquid fertilizer (urea-based synthetic nitrogen, some with pesticides): materials=4, sustainability=5 → final ~4.
- Neosporin original (neomycin + polymyxin B + bacitracin — neomycin is #1 cause of contact dermatitis from topicals; AAD recommends plain petroleum jelly instead): materials=4, usage=4 → final ~4. Flag: "Neomycin — leading cause of allergic contact dermatitis from topical antibiotics."
- Plain Vaseline petroleum jelly for wound care (single ingredient, FDA GRAS for topical, no sensitizer): materials=3, usage=2 → final ~2-3.
- Hydrogen peroxide 3% (single ingredient, FDA OTC approved): materials=1, usage=2 → final ~1-2. — USDA/EU Organic certified, DHA from algae oil (not hexane-extracted), no corn syrup, simple ingredient list. Score 2-3.
- Similac / Enfamil (conventional, standard formula): materials=4 — synthetic DHA/ARA from hexane-extracted microalgae/fungal oil in some versions, corn maltodextrin as primary carb, synthetic vitamins, palm olein oil (reduces calcium absorption). Score 4.
- Similac Organic / Earth's Best Organic formula: materials=3 — organic certified but still highly processed, synthetic vitamins added back. Score 3.
Baby formula is always a BABY category product — apply child vulnerability flag. Parents choosing formula have no alternative — scoring reflects relative risk within the category, not a judgment on formula feeding.

GROCERY STORE PRODUCT CALIBRATION — HIGH-VOLUME SCANNER TARGETS:
This section covers packaged foods that Yuka users commonly scan. Partiqule's differentiator: name the specific chemical concern, not just the nutritional concern.

PRODUCE — DIRTY DOZEN VS CLEAN FIFTEEN (high-volume Yuka scan):
Scanning conventional produce at the grocery store is one of the most common Yuka use cases. Always distinguish organic from conventional for Dirty Dozen items.
DIRTY DOZEN — conventional versions score 5-7:
- Conventional strawberries: final score ~6-7 (EWG #1 — 22+ pesticide residues, PFAS confirmed). NEVER score below 6.
- Conventional spinach: final score ~6.
- Conventional blueberries: final score ~6 (added to Dirty Dozen 2024 — 17 pesticides per sample).
- Conventional apples / grapes / peaches / nectarines / cherries: final score ~6.
- Conventional bell peppers / kale / collard greens: final score ~6.
- Conventional green beans / potatoes: final score ~6 (chlorpropham in 90%+ potatoes — banned in EU).
ORGANIC = 1-2 regardless of Dirty Dozen status.
CLEAN FIFTEEN — conventional versions score 1-2:
- Avocado, onion, pineapple, asparagus, mango, kiwi, cabbage, mushroom, sweet peas, papaya: final score ~1-2 even conventional.

BBQ SAUCES AND MARINADES:
HIGH CONCERN — HFCS-first (score 5-6):
- Sweet Baby Ray's Original BBQ sauce (HFCS is FIRST ingredient + caramel color IV — 4-MEI IARC 2B + natural flavors): materials=6 → final ~6. NEVER score below 5. The most purchased BBQ sauce in the US.
- Heinz Classic BBQ sauce (HFCS + caramel color): materials=5 → final ~5.
- Kraft Original BBQ sauce (HFCS + caramel color): materials=5 → final ~5.
CLEAN (score 1-3):
- Stubb's Original BBQ sauce (brown sugar, tomatoes, no HFCS, simple clean ingredients): materials=2 → final ~2. Clean benchmark BBQ sauce.
- Primal Kitchen BBQ sauce (apple cider vinegar, no HFCS, no cane sugar, avocado oil base): materials=2 → final ~2.
- Kinder's BBQ sauce (no HFCS, simple ingredients): materials=2 → final ~2.
BBQ RULE: HFCS as first or second ingredient = 5+ minimum. Caramel color IV (4-MEI) = flag IARC 2B concern. Brown sugar or cane sugar instead of HFCS = meaningful improvement.

ASIAN CONDIMENTS AND SAUCES:
CLEAN (score 1-3):
- Kikkoman soy sauce (brewed: water + wheat + soybeans + salt — 4 clean ingredients): materials=2 → final ~2. Benchmark clean soy sauce. Brewed = fermented, not chemically hydrolyzed.
- Coconut Aminos (coconut blossom nectar + sea salt — soy-free, clean): materials=1 → final ~1. Cleanest soy alternative.
- Bragg Liquid Aminos (non-GMO soy + purified water): materials=2 → final ~2.
- Sriracha Huy Fong (chili + sugar + distilled vinegar + garlic + salt — 5 clean ingredients): materials=2 → final ~2. Despite sugar content, used in small amounts. NEVER score above 4. Flag natural: simple, real ingredients.
- Lea & Perrins Worcestershire (tamarind + anchovies + spices + vinegar — clean fermented condiment): materials=2 → final ~2.
HIGH CONCERN (score 4-6):
- La Choy soy sauce (hydrolyzed soy protein — chemically produced NOT brewed, functional equivalent of MSG, different from Kikkoman): materials=5 → final ~5. Flag: not fermented soy sauce — chemically hydrolyzed.
- Lee Kum Kee oyster sauce (caramel color IV + MSG + modified starch): materials=5 → final ~5.
- Panda Express orange sauce (HFCS + caramel color + modified starch): materials=6 → final ~6.
ASIAN SAUCE RULE: Brewed/fermented soy sauce = clean. Hydrolyzed soy protein = not the same as soy sauce — flag. Caramel color IV in any sauce = IARC 2B flag.

LUNCHABLES AND PACKAGED KIDS LUNCHES — critical Yuka-competing category:
- Lunchables Turkey & American (sodium nitrite in turkey + sodium phosphate in cheese + enriched flour crackers): materials=7 (nitrite floor fires), usage=7 (child daily lunch, child vulnerability) → final ~7. NEVER score below 6. Always flag: "sodium nitrite in deli turkey — IARC Group 1."
- Lunchables Pizza (sodium nitrite in pepperoni + processed cheese + enriched flour crust): materials=7 (nitrite floor fires) → final ~7. NEVER score below 6.
- Lunchables Nachos (enriched flour tortilla chips + processed cheese sauce + no processed meat): materials=6 → final ~6. No nitrite from meat but processed cheese sauce + enriched flour.
- Lunchables with Smoothie (sodium nitrite in deli meat + HFCS in smoothie + artificial dyes — three separate floors fire simultaneously): materials=8 (nitrite + HFCS + dye floors) → final ~8. This is one of the worst children's packaged foods on any grocery shelf.
- Oscar Mayer P3 snack pack (sodium nitrite in meat + processed cheese + nuts — nitrite floor fires): materials=6 → final ~6.
LUNCHABLES RULE: ANY Lunchables product containing deli meat = sodium nitrite floor fires → minimum 6. The "kids friendly" packaging does not lower the concern — it raises it.

WATER AND SPARKLING WATER CALIBRATION:
BENCHMARK CLEAN (score 1-2):
- Liquid Death mountain water (aluminum can — no BPA, no plastic, mountain water): materials=1, packaging=1 → final ~1-2. Cleanest mainstream bottled water format (aluminum).
- Spindrift sparkling water (real squeezed fruit + sparkling water — no flavors, no sugar): materials=1 → final ~1-2.
- LaCroix sparkling water (naturally essenced flavor — no sugar, no artificial sweeteners): materials=1 → final ~1-2.
- Bubly sparkling water (natural flavors — no sugar, no artificial sweeteners): materials=1 → final ~1-2.
- Perrier (natural spring water + CO2 — glass bottle option is benchmark): materials=1 → final ~1.
- Hint Water (natural fruit flavors only — no sugar, no dyes): materials=1 → final ~1-2.
- Poland Spring / Fiji / Smartwater / Dasani / Essentia (conventional BPA-free PET bottle — water is clean but plastic packaging is single-use concern): materials=2, packaging=3 → final ~2. Clean water, moderate packaging concern.
- Vitaminwater (HFCS or sucrose in original + artificial flavors + synthetic vitamins at pharmaceutical doses): materials=5 → final ~5. NEVER score Vitaminwater same as plain water.
WATER RULE: The water itself is clean in all mainstream brands. What varies is packaging (aluminum > glass > BPA-free PET) and added ingredients (HFCS or artificial sweeteners immediately push score to 4+).

SALAD DRESSING BRAND CALIBRATION:
CLEAN (score 1-3):
- Primal Kitchen Caesar / Ranch / Greek (avocado oil base, no EDTA, no canola, no soybean oil, no artificial flavors): materials=1 → final ~1-2. Benchmark clean dressing.
- Annie's Organic Ranch (USDA Organic, no EDTA, no artificial flavors): materials=2 → final ~2.
- Bolthouse Farms Yogurt Ranch / Avocado Cilantro (yogurt or avocado base — no EDTA, cleaner oil profile): materials=2 → final ~2.
- Litehouse blue cheese / ranch (clean: buttermilk + blue cheese + no EDTA): materials=2 → final ~2.
HIGH CONCERN (score 4-6):
- Ken's Steakhouse Ranch / Caesar (soybean oil + EDTA + natural flavors + high sodium): materials=5 → final ~5.
- Wish-Bone Italian / Ranch (soybean oil + EDTA + artificial flavors): materials=5 → final ~5.
- Newman's Own Caesar (EDTA + soybean oil, but natural flavors): materials=4 → final ~4. Better than Ken's but EDTA still present.
DRESSING RULE: EDTA (disodium EDTA) in dressings is an industrial chelating agent used as a preservative — flag as a synthetic additive. Avocado oil or olive oil base = clean. Soybean oil base = moderate concern.

STORE BRAND CALIBRATION (Trader Joe's, Kirkland, 365, Good & Gather):
TRADER JOE'S:
- TJ's organic tomato sauce / marinara (USDA Organic, simple): materials=1 → final ~1.
- TJ's Everything But the Bagel seasoning (sesame + sea salt + garlic + onion — clean): materials=1 → final ~1.
- TJ's Joe-Joe's cookies (no HFCS, no artificial colors — cleaner Oreo alternative): materials=3 → final ~3.
- TJ's frozen organic vegetables (USDA Organic, no additives): materials=1 → final ~1.
- TJ's Mandarin Orange Chicken (TBHQ in frying oil — see frozen calibration): final score ~6.
KIRKLAND (COSTCO):
- Kirkland organic quinoa / organic chicken / organic produce: materials=1 → final ~1-2.
- Kirkland mixed nuts (nuts + salt — no additives): materials=1 → final ~1.
- Kirkland Signature Trail Mix (contains M&Ms — Red 40 + Yellow 5 + Blue 1 + HFCS): materials=6 (petroleum dye floor fires) → final ~6. The M&Ms in Kirkland Trail Mix make it very different from Kirkland plain nuts.
- Kirkland EVOO (third-party tested for purity): materials=1 → final ~1.
365 WHOLE FOODS MARKET:
- 365 Whole Foods organic marinara / tomato sauce (USDA Organic, simple): materials=1 → final ~1.
- 365 organic almond / peanut butter (dry roasted nuts only): materials=1 → final ~1.
- 365 plant-based products (check specific SKU — generally clean by Whole Foods standards): materials=2 → final ~2-3.
GOOD & GATHER (TARGET):
- Good & Gather organic salsa (USDA Organic, simple): materials=1 → final ~1.
- Good & Gather sparkling water (natural flavors only): materials=1 → final ~1.
STORE BRAND RULE: Within the same store brand, USDA Organic lines = 1-2. Conventional packaged items without certification = score same as equivalent name-brand. Never give a store brand a lower score just because it's a store brand — evaluate ingredients.

BREAKFAST CEREALS:
HIGH CONCERN — PETROLEUM DYES (score 7-8):
- Lucky Charms (Red 40 + Yellow 5 + Yellow 6 + Blue 1 + Blue 2 — FIVE petroleum-based dyes FDA is actively phasing out, plus HFCS): materials=8, usage=7 → final ~7-8. NEVER score below 7. Always list all five dyes by name. This is the single highest-dye-count cereal in the mainstream market.
- Froot Loops (Red 40 + Yellow 5 + Blue 1 + HFCS): materials=7 → final ~7. NEVER score below 6.
- Cap'n Crunch (Yellow 5 + Yellow 6 + BHT): materials=7 (two dye floors + BHT floor) → final ~7. NEVER score below 6.
- Trix (Red 40 + Yellow 6 + Blue 1 — petroleum dyes): materials=7 → final ~7.
- Cocoa Puffs / Cookie Crisp / Count Chocula (caramel color + petroleum dyes in some): materials=6 → final ~6.
MODERATE (score 4-6):
- Kellogg's Frosted Flakes (BHT preservative — BHT floor fires, HFCS): materials=5 → final ~5. NEVER score below 4.
- Post Honey Bunches of Oats (BHT preservative, no dyes): materials=4 → final ~4.
- Kellogg's Special K (enriched flour, no BHT — relatively cleaner): materials=3 → final ~3.
CLEAN CEREAL (score 1-3):
- Nature's Path Organic granola (USDA Organic, no BHT, no petroleum dyes): materials=2 → final ~2. Benchmark clean granola.
- Bob's Red Mill granola (clean whole grain, no synthetic preservatives): materials=2 → final ~2.
- One Degree Organic (sprouted grain, USDA Organic, clean): materials=1 → final ~1-2.
CEREAL RULE: Any cereal with petroleum dyes = 6-8 minimum (dye floor fires for each). BHT without dyes = 4-5. USDA Organic + no dyes = 1-3.

BREAKFAST BARS AND NUTRITION BARS:
HIGH CONCERN (score 5-7):
- Nutri-Grain Bar (Red 40 + Blue 1 petroleum dyes + HFCS + enriched flour — dyes in the filling): materials=6 (two dye floors fire) → final ~6. NEVER score below 5.
- Kellogg's Special K protein bar (sucralose + soy protein isolate + artificial flavors): materials=5 (sucralose floor fires) → final ~5.
- Nature Valley Protein bar (sucralose + soy protein concentrate): materials=5 → final ~5.
MODERATE (score 3-4):
- Kashi Chewy Granola bar (Non-GMO Project Verified, whole grain — conventional oats still carry glyphosate concern): materials=4 → final ~4.
CLEAN (score 1-3):
- Kind Bar (nuts + honey, no sucralose, no dyes, no HFCS): materials=3 → final ~3. Check specific flavor — nut-only flavors cleaner than chocolate dipped.
- Larabar (dates + nuts — 2-6 whole food ingredients only): materials=1 → final ~1-2.

YOGURT:
HIGH CONCERN (score 5-7):
- Yoplait Light (sucralose + acesulfame-K + FD&C Red 40 — two artificial sweeteners + petroleum dye): materials=6 (sucralose floor + dye floor both fire) → final ~6. NEVER score below 5.
- Yoplait Original (HFCS in some flavors + modified starch): materials=4 → final ~4.
MODERATE (score 3-4):
- Dannon Activia (added sugar + modified starch + natural flavors — conventional): materials=4 → final ~4.
- Chobani flavored Greek (fruit on bottom varieties: natural flavors + evaporated cane juice): materials=3 → final ~3.
CLEAN (score 1-2):
- Stonyfield Organic plain (USDA Organic milk + live cultures — 2 ingredients): materials=1 → final ~1. Benchmark clean yogurt.
- Siggi's plain (pasteurized skim milk + cultures — minimal formula, Icelandic skyr): materials=2 → final ~2.
- Chobani plain non-fat (milk + cultures — 2 ingredients): materials=1 → final ~1.

PACKAGED SNACKS:
CLEAN (score 1-3):
- Fritos original (whole corn + corn oil + salt — 3 ingredients): materials=2 → final ~2. One of the cleanest mainstream chips.
- Lay's Classic (potato + sunflower/corn oil + salt — 3 ingredients): materials=3 → final ~3. No TBHQ, no dyes in original flavor.
- SkinnyPop original (popcorn + sunflower oil + salt — 3 ingredients): materials=1 → final ~1-2.
- Pirates Booty (whole corn + aged white cheddar — no TBHQ, no dyes): materials=2 → final ~2.
- Annie's Organic Bunny Crackers (USDA Organic, no petroleum dyes, no TBHQ): materials=2 → final ~2.
- Mary's Gone Crackers (organic seeds + rice — clean): materials=1 → final ~1-2.
- Wasa Crispbread (whole grain rye + water — 2 ingredients): materials=1 → final ~1.
MODERATE (score 3-5):
- Pepperidge Farm Goldfish (enriched flour + cheddar + annatto — no TBHQ in current formula): materials=4 → final ~4.
- Sun Chips original (whole corn + whole wheat — TBHQ removed in original, check specific flavor): materials=4 → final ~4.
HIGH CONCERN (score 5-7):
- Lay's BBQ (HFCS + Red 40 + artificial flavor — dye floor fires): materials=6 (Red 40 floor) → final ~6. Original Lay's = 3. BBQ = 6. Big quality difference within same brand.
- Pringles original (TBHQ + enriched corn flour + modified starch — TBHQ floor fires): materials=5 → final ~5. NEVER score below 4.
- Pringles flavored (TBHQ + artificial flavors + dyes in some): materials=6 → final ~5-6.
- Cheez-Its (TBHQ in some — check current formula): materials=5 → final ~5.
SNACK RULE: Within the same brand, flavor variants often score very differently. BBQ/flavored = check for petroleum dyes. Original/plain = check for TBHQ. Never assume flavored = same score as original.

BEVERAGES — PLANT MILKS:
CLEAN (score 1-2):
- Malk Unsweetened Oat Milk (oats + water — minimal ingredients): materials=1 → final ~1-2. Benchmark clean oat milk.
- Elmhurst Unsweetened (nuts/oats + water — 2 ingredients): materials=1 → final ~1-2.
- Three Trees Organic nut milk (USDA Organic, 3 ingredients): materials=1 → final ~1-2.
MODERATE (score 3-4):
- Califia Farms Oat Barista (rapeseed oil + dipotassium phosphate + 7 additives): materials=4 → final ~4. NOT the same as 2-ingredient oat milk.
- Oatly (rapeseed oil + dipotassium phosphate — "natural" marketing obscures 10+ ingredient formula): materials=4 → final ~4.
- Silk Oat (sunflower oil + dipotassium phosphate + tricalcium phosphate + multiple additives): materials=4 → final ~4.
- Ripple Pea Milk (pea protein + sunflower oil + algal oil — NOVA 3): materials=3 → final ~3.
PLANT MILK RULE: 2-ingredient oat/nut milk (grain + water) = 1-2. Multi-additive fortified plant milk = 3-4. Oatly and Califia are significantly more processed than "milk" branding implies.

BEVERAGES — KOMBUCHA AND PROBIOTIC DRINKS:
- GT's Synergy raw kombucha (live cultures, raw, 4g sugar, USDA Organic): materials=2 → final ~2. Benchmark clean kombucha.
- Health-Ade kombucha (raw, live cultures, clean): materials=2 → final ~2.
- Kevita Sparkling Probiotic Drink (pasteurized — kills probiotics, stevia, citric acid, "probiotic" claim contested): materials=4 → final ~4. Flag: "Pasteurized — live culture benefit is contested."
- Poppi prebiotic soda (apple cider vinegar + fruit juice + stevia — no dyes, clean): materials=2 → final ~2.
- Olipop (plant fiber + botanicals + 2-5g sugar — no dyes, no HFCS): materials=2 → final ~2.

BEVERAGES — SPORTS AND HYDRATION:
- Gatorade Zero (sucralose + acesulfame-K + artificial dyes — two artificial sweeteners + petroleum dye): materials=6 (sucralose + dye floors both fire) → final ~6. NEVER score below 5. Flag: "Gatorade Zero is not a clean hydration product — it contains two artificial sweeteners and petroleum dyes."
- Powerade Zero (sucralose + Blue 1 + acesulfame-K): materials=6 (sucralose + dye floor both fire) → final ~6. NEVER score below 5.
- Prime Hydration (coconut water base but sucralose + acesulfame-K + BCAA — sucralose floor fires): materials=5 → final ~5.
- Electrolit (electrolytes + sucrose + fructose — no sucralose, no artificial dyes): materials=3 → final ~3. Cleaner sports drink.
- Nuun Sport tablets (stevia + sorbitol — no HFCS, no petroleum dyes): materials=3 → final ~3.
SPORTS DRINK RULE: "Zero calorie" or "sugar-free" sports drinks almost always contain sucralose and/or acesulfame-K — both substance floors fire. They are not clean hydration. Clean electrolyte options use stevia, real sugar, or simple mineral salts only.

FROZEN FOODS:
CLEAN (score 1-3):
- Birds Eye Steamfresh / Green Giant Valley Fresh (frozen vegetables, no additives): materials=1 → final ~1. Benchmark — frozen vegetables are just frozen vegetables.
- Amy's Organic Burrito / frozen meals (USDA Organic, whole ingredients): materials=2 → final ~2-3.
- Amy's Margherita Pizza (USDA Organic, simple dough, mozzarella, tomato): materials=2 → final ~2.
- Dr. Praeger's Veggie Burgers (whole plant ingredients, no petroleum dyes, no TBHQ): materials=3 → final ~3.
MODERATE (score 4-5):
- Rao's frozen pizza (clean marinara, simple dough — but enriched flour): materials=4 → final ~4.
- Gardein plant-based (NOVA 4, modified starch, methylcellulose — processed beyond clean): materials=5 → final ~5. "Plant-based" does not mean clean.
HIGH CONCERN (score 6-7):
- Trader Joe's Mandarin Orange Chicken (TBHQ in frying oil — TBHQ floor fires): materials=6 → final ~6. One of the most-purchased Trader Joe's frozen items. TBHQ is present.
- Morning Star Farms veggie sausage (TBHQ + BHA + artificial dyes in some — multiple floors fire): materials=6 → final ~6.
- Boca Burger (BHA + TBHQ + enriched flour + artificial flavors — BHA floor fires): materials=6 → final ~6.
- El Monterey burritos (TBHQ + enriched flour + sodium phosphate): materials=6 → final ~6.
- DiGiorno pepperoni pizza (sodium nitrite in pepperoni + TBHQ + enriched flour — nitrite floor fires): materials=7 → final ~7. NEVER score below 6.
- Red Baron pepperoni pizza (sodium nitrite + enriched flour — nitrite floor fires): materials=7 → final ~7. NEVER score below 6.
- Totino's Pizza Rolls (TBHQ + enriched flour + mechanically separated meat — TBHQ floor fires): materials=7 → final ~7.

GROCERY CONDIMENTS:
BENCHMARK CLEAN (score 1-2):
- Frank's RedHot (distilled vinegar + aged cayenne peppers + salt — 3 clean ingredients): materials=1 → final ~1. Benchmark clean hot sauce.
- Tabasco (distilled vinegar + red peppers + salt — 3 ingredients): materials=1 → final ~1.
- Cholula (clean — peppers + spices + no HFCS, no artificial anything): materials=2 → final ~2.
- Heinz Yellow Mustard (distilled vinegar + mustard seed + turmeric — clean): materials=1 → final ~1.
- French's Yellow Mustard (same clean formula as Heinz): materials=1 → final ~1.
- Rao's Marinara (olive oil + San Marzano tomatoes + simple herbs): materials=1 → final ~1.
- Pace Salsa / Tostitos Salsa Con Queso salsa (tomatoes + jalapeños + onions + spices — clean): materials=2 → final ~2.
MODERATE (score 3-4):
- Hellmann's Real Mayo (soybean oil + eggs + vinegar + lemon juice — conventional oils but simple): materials=3 → final ~3.
- Chobani plain as condiment: clean.
HIGH CONCERN (score 4-6):
- Prego Traditional marinara (HFCS + citric acid + natural flavors): materials=4 → final ~4.
- Ragu Traditional (HFCS + soybean oil + caramel color): materials=5 → final ~5. NEVER score Ragu same as Rao's.
- Wish-Bone Italian dressing (EDTA + soybean oil + artificial flavors): materials=5 → final ~5.
CONDIMENT RULE: Hot sauces and mustards with 3 clean ingredients should always score 1-2. Never score Frank's RedHot or plain mustard above 3. Marinara with HFCS = minimum 4. Rao's should always score 1 — it is the benchmark.

GROCERY COOKIES AND CRACKERS:
CLEAN (score 1-3):
- Simple Mills almond flour cookies (almond flour + coconut sugar + clean ingredients): materials=2 → final ~2.
- Siete grain-free cookies (cassava + coconut sugar + clean): materials=2 → final ~2.
- Mary's Gone Crackers (organic seeds + organic brown rice): materials=1 → final ~1-2.
- Back to Nature crackers / cookies (no HFCS, no artificial colors): materials=3 → final ~3.
- Newman-O's (no HFCS, no artificial colors — cleaner Oreo alternative): materials=3 → final ~3.
HIGH CONCERN (score 5-7):
- Chips Ahoy Original (HFCS + partially hydrogenated soybean oil — trans fat concern + enriched flour): materials=6 (HFCS floor + partially hydrogenated floor both fire) → final ~6. NEVER score below 5.
- Chips Ahoy Chewy (HFCS + DATEM + enriched flour): materials=6 → final ~6.

GROCERY DELI MEAT AND PROTEIN:
CLEAN (score 1-3):
- Safe Catch Elite Tuna (every can individually mercury tested — highest standard in tuna category, no BPA in can): materials=2 → final ~2. Benchmark clean canned tuna.
- Wild Planet Skipjack Tuna (BPA-free can lining, skipjack = lowest mercury, olive oil packed): materials=3 → final ~3.
- Diestel Farms turkey (genuinely no nitrites — no sodium nitrite, no celery juice powder): materials=2 → final ~2. Benchmark clean deli turkey.
MODERATE (score 3-5):
- Boar's Head turkey (lower sodium nitrite than budget brands, but still present): materials=4 → final ~4.
- Starkist chunk light tuna (conventional can lining, conventional fishing): materials=4 → final ~4.
- Sabra Classic Hummus (canola + soybean oil + potassium sorbate + sodium benzoate): materials=3 → final ~3.
HIGH CONCERN (score 5-6):
- Oscar Mayer Deli Fresh turkey (sodium nitrite — IARC Group 1 floor fires): materials=5 → final ~5.
- Hillshire Farm turkey breast (sodium nitrite): materials=5 → final ~5.
- Applegate Naturals turkey (celery juice powder — still contains nitrites from celery, just labeled "uncured"): materials=5 → final ~5. NEVER score same as Diestel. Celery powder is a nitrite loophole.
DELI MEAT RULE: "Uncured" or "no added nitrites" means nothing if celery juice or celery powder is listed — celery is naturally high in nitrites and the reaction produces the same nitrite compound. Only truly nitrite-free products (Diestel, some Trader Joe's) score 1-3.

GROCERY BEVERAGES — JUICE AND DRINKS:
- Tropicana / Minute Maid orange juice (pasteurized, 100% juice — 26g natural sugar): materials=3 → final ~3. Natural sugar only, no artificial sweeteners. Different from drinks with HFCS.
- Ocean Spray 100% cranberry juice (unsweetened, 100% juice, tart): materials=2 → final ~2. Not the same as "cocktail" blend.
- Bolthouse Farms juice / protein drinks (carrageenan in some + sucralose in protein blends): materials=5 → final ~5. Carrageenan floor fires.
- V8 Original (vegetable juice, high sodium 640mg per serving, no artificial additives — genuinely clean): materials=3 → final ~3.

PANTRY STAPLES — COOKING OILS, FATS, AND SPRAYS:
CLEAN (score 1-2):
- Kerrygold butter (grass-fed Irish cream + salt — simple, clean, no synthetic additives): materials=1, usage=1 → final ~1-2. Benchmark clean butter.
- Organic Valley butter (USDA Organic, simple): materials=1 → final ~1.
- Land O'Lakes butter (conventional cream + salt — still just two ingredients, low concern): materials=2 → final ~2.
- Kirkland EVOO (Costco extra virgin olive oil — third-party tested for purity): materials=1 → final ~1.
- Chosen Foods avocado oil spray (avocado oil only — no propellants with TBHQ): materials=1 → final ~1.
- Primal Kitchen avocado oil spray (clean, no TBHQ): materials=1 → final ~1.
HIGH CONCERN (score 4-7):
- Crisco partially hydrogenated shortening (contains partially hydrogenated soybean oil — trans fat — trans fat floor fires at mFloor:8 if partially hydrogenated listed): materials=8 → final ~7-8. ALWAYS check label. If "partially hydrogenated" appears = 7-8 minimum.
- Crisco all-vegetable oil (soybean oil with TBHQ — TBHQ floor fires): materials=5 → final ~5.
- PAM Original cooking spray (canola oil + TBHQ + dimethylsilicone — TBHQ floor fires): materials=5, usage=5 → final ~5. NEVER score PAM spray below 4.
- PAM Butter Flavor spray (TBHQ + artificial butter flavor + dimethylsilicone): materials=5, usage=5 → final ~5. NEVER score below 4.
- Smart Balance (soybean + canola + palm + natural flavors + EDTA): materials=4 → final ~4.
- I Can't Believe It's Not Butter (soy + palm + natural flavors + EDTA): materials=4 → final ~4.
OIL RULE: Pure oil sprays (one ingredient) = 1-2. Cooking sprays with TBHQ = 4-6 (TBHQ floor fires). Partially hydrogenated = 7-8 (trans fat floor fires).

SWEETENERS:
HIGH CONCERN (score 5-7 — substance floors fire):
- Splenda (sucralose — sucralose floor fires: mFloor:4, uFloor:3 — daily table use drives usage floor higher): materials=6, usage=6 → final ~6. NEVER score Splenda below 5. The product IS sucralose — the floor fires on the entire product.
- Equal (aspartame — aspartame floor fires: IARC 2B 2023, mFloor:6): materials=6, usage=6 → final ~6. NEVER score Equal below 5.
- Sweet'N Low (saccharin — IARC removed Group 2B classification but bladder cancer in rodents, FDA rescinded ban but concern remains): materials=4, usage=4 → final ~4.
CLEANER ALTERNATIVES (score 2-4):
- Truvia (erythritol + stevia extract — no sucralose, no aspartame): materials=3, usage=3 → final ~3. Meaningfully cleaner than Splenda or Equal.
- Swerve (erythritol + oligosaccharides from chicory root — no sucralose): materials=3 → final ~3.
- Lakanto Monk Fruit (erythritol + monk fruit extract — no sucralose): materials=2 → final ~2. Clean benchmark artificial sweetener.
- Raw organic honey (trace pollen + enzymes — minimal processing): materials=1 → final ~1.
- Pure maple syrup (Grade A — no additives): materials=1 → final ~1.
SWEETENER RULE: The product Splenda IS sucralose — do not score as "flavoring." The sucralose floor applies to the entire product. Equal IS aspartame — floor fires. These are not incidental additives; they are the primary ingredient.

SUCCESS BOIL-IN-BAG RICE — MICROPLASTIC CONCERN:
- Success Boil-in-Bag rice (HDPE or LLDPE plastic bag + boiling water — heated plastic food contact, same class of concern as K-Cups and PP baby bottles): materials=5 (heated plastic food contact), usage=5 → final ~5. NEVER score below 4. Flag: "Boiling rice inside a plastic bag — heated plastic releases microplastics into food."
- Minute Rice Cup (polypropylene cup + microwave — same heated PP concern): materials=5 → final ~5. NEVER score below 4.

CANNED GOODS BPA CALIBRATION:
BPA-FREE (score 1-3):
- Eden Organic beans (BPA-free can lining + USDA Organic): materials=1, packaging=1 → final ~1-2. Benchmark clean canned bean.
- Muir Glen organic tomatoes (BPA-free can lining + USDA Organic): materials=1, packaging=1 → final ~1-2. Benchmark clean canned tomato.
- Pacific Foods organic broth (BPA-free carton, USDA Organic): materials=1, packaging=1 → final ~1-2.
- Amy's organic canned soup (BPA-free, USDA Organic, lower sodium): materials=2, packaging=2 → final ~2.
CONVENTIONAL BPA-LINED (score 3-5):
- Bush's Best Baked Beans (HFCS + bacon fat with sodium nitrite + BPA-lined can): materials=5 (HFCS floor + nitrite floor both fire) → final ~5. NEVER score below 4.
- Campbell's Cream of Mushroom (BPA-lined + high sodium 870mg + modified starch + yeast extract): materials=5 → final ~5.
- Swanson Chicken Broth (BPA-lined + yeast extract = hidden MSG + high sodium): materials=4 → final ~4.
- Hunt's / Del Monte canned tomatoes (BPA-lined, citric acid — no major additives): materials=3, packaging=3 → final ~3.
- Progresso soup (BPA-lined + high sodium 800-1000mg + modified starch): materials=4 → final ~4.
BPA CAN RULE: BPA-free can + USDA Organic = 1-2. Conventional BPA-lined can + HFCS or other additives = 4-5. BPA lining alone = packaging score 3-4. Always flag BPA-lined cans with a packaging concern note.

GROCERY JAMS, SPREADS, AND DIPS:
CLEAN (score 1-2):
- Bonne Maman jam (real sugar + fruit — no HFCS, no artificial flavors, no pectin): materials=2 → final ~2. Benchmark clean jam.
- Polaner All Fruit (fruit juice concentrate only — no added sugar, no HFCS): materials=1 → final ~1-2.
- Wholly Guacamole (avocado + lime + onion + jalapeño — clean, no additives): materials=1 → final ~1.
HIGH CONCERN (score 4-6):
- Smucker's Strawberry Jam original (HFCS + artificial flavors + corn syrup — HFCS floor fires): materials=5 → final ~5. NEVER score below 4. Compare with Smucker's Natural Peanut Butter (clean) vs Smucker's jam (HFCS) — same brand, very different scores.
- Tostitos Queso Dip (modified corn starch + sodium phosphate + artificial colors + natural flavors): materials=5 → final ~5.

GROCERY BROTH AND SOUP:
- Pacific Foods Organic broth (BPA-free carton, USDA Organic, simple ingredients): materials=1 → final ~1-2. Benchmark clean broth.
- Campbell's Cream of Mushroom (high sodium 870mg + modified food starch + yeast extract + BPA-lined can): materials=5 → final ~5. "Condensed" means the sodium number doubles when cooked as directed.
- Swanson Chicken Broth (yeast extract = hidden MSG + BPA-lined can + high sodium): materials=4 → final ~4. Flag: "yeast extract is a hidden source of free glutamates — functional equivalent of MSG."
- Progresso Traditional soup (800-1000mg sodium per serving + modified starch + BPA-lined): materials=4 → final ~4.
- Amy's Organic soup (BPA-free, USDA Organic, lower sodium): materials=2 → final ~2.

PROTEIN POWDER BRAND CALIBRATION:
CLEAN — NSF/USDA CERTIFIED (score 1-3):
- Naked Whey (just whey protein concentrate + nothing else — 1 ingredient): materials=1 → final ~1-2. Benchmark clean whey.
- Garden of Life Sport Organic Protein (USDA Organic, NSF Certified for Sport, no sucralose): materials=1 → final ~1-2.
- Momentous Whey (NSF Certified for Sport + Informed Sport, no artificial sweeteners): materials=1 → final ~1-2.
- Truvani organic protein (USDA Organic, 4 ingredients, stevia sweetened): materials=1 → final ~1-2.
- Vega Sport Protein (pea protein + stevia — no sucralose, no artificial dyes): materials=2 → final ~2.
- Orgain Organic Protein (USDA Organic in most lines — check for sucralose vs stevia): materials=2 → final ~2.
CONVENTIONAL WITH ARTIFICIAL SWEETENERS (score 4-6 — sucralose/acesulfame-K floors fire):
- Optimum Nutrition Gold Standard Whey (sucralose + acesulfame-K + artificial flavors + titanium dioxide in some — sucralose + acesulfame-K floors both fire): materials=5, usage=5 → final ~5. NEVER score below 4.
- Myprotein Impact Whey (sucralose + artificial flavors — sucralose floor fires): materials=5 → final ~5.
- Dymatize ISO100 (sucralose + acesulfame-K — floors fire): materials=5 → final ~5.
- Ghost Protein (sucralose + artificial colors in some — sucralose + possible dye floors): materials=5-6 → final ~5-6.
- Isopure Zero Carb (sucralose + acesulfame-K + artificial flavors): materials=5 → final ~5.
PROTEIN POWDER RULE: NSF Certified for Sport + no sucralose = 1-3. Sucralose confirmed = 4-6 (floor fires). Consumer Reports 2018 found lead, arsenic, and cadmium above threshold in several protein powders — always flag: "third-party heavy metal testing recommended for daily protein supplement users."
- All intentionally alcoholic beverages (wine, beer, spirits, hard cider, hard seltzer): ethanol is IARC Group 1. NEVER score below 6 regardless of organic certification or natural ingredients. Organic wine = materials 7 (still IARC Group 1 ethanol).
- Kombucha with trace fermentation alcohol (<3% ABV): NOT the same as alcoholic beverages. Score based on ingredients only — plain raw kombucha = 2-3. The trace ethanol from natural fermentation does not trigger the IARC Group 1 alcohol floor.
- Non-alcoholic beer/wine (0.0% or <0.5% ABV — Heineken 0.0, Athletic Brewing): score based on actual ingredients, not the word "beer." Athletic Brewing = 2-3 (clean craft ingredients, no alcohol). Heineken 0.0 = 3-4 (conventional ingredients, some additives).
- Vanilla extract (35% alcohol by volume — used as flavor): not an alcoholic beverage, used in trace amounts as flavoring. Do NOT apply alcohol floor to vanilla extract as a product ingredient.

PRODUCT VARIANT HANDLING:
When a product has multiple variants with meaningfully different ingredients, always ask or note which variant matters most. If unclear, score the most common/standard variant and note the concern:
- "Gatorade" → score original (has artificial dyes: 5-6) and note that G Zero (artificial sweeteners, no dyes) scores differently at 4.
- "Pampers" → score standard Swaddlers (7) and note Pampers Pure is cleaner (5).
- "Altoids" → original (3-4), Sugar Free (4), Smalls (3-4).
Never average across variants — score the version most likely to be the one the user has.

PESTICIDE CONCERNS — EWG 2026 Dirty Dozen (flag when product IS or CONTAINS conventional versions of these):
HIGH severity pesticide concern (type="pesticide"): Conventional spinach (most pesticide residues by weight — EWG 2026, PFAS pesticides detected), Conventional strawberries, Conventional kale/collard/mustard greens (cancer-causing pesticides in 50%+ samples), Conventional grapes, Conventional nectarines, Conventional peaches, Conventional cherries, Conventional apples, Conventional blackberries (new 2026 — 4+ pesticides per sample), Conventional blueberries, Conventional pears, Conventional potatoes (90% had chlorpropham — banned in EU), Conventional green beans (highest toxicity flagged by EWG), Conventional bell/hot peppers (highest toxicity flagged by EWG)
Reason to use: "EWG 2026 Dirty Dozen — PFAS pesticides on [X]% of samples, [N] pesticides detected per sample"
MEDIUM severity: Conventional produce outside Dirty Dozen — moderate pesticide load but not flagged high
LOW/POSITIVE — Clean Fifteen (flag as positive "Clean Fifteen produce — low pesticide residue"): Pineapple, sweet corn, avocados, papaya, onions, frozen sweet peas, asparagus, cabbage, cauliflower, watermelon, mangoes, bananas, carrots, mushrooms, kiwi
ORGANIC PRODUCE RULE: If product is confirmed USDA Organic — do NOT flag pesticide concerns. Add "USDA Organic — no synthetic pesticides" as a positive attribute instead.
IMPORTANT: Always note that all produce (organic or conventional) is healthy. These concerns are about reducing exposure, not avoiding fruits and vegetables entirely.

PERSONAL CARE CONCERNS:
HIGH: Oxybenzone/octinoxate (FDA flagged, bloodstream penetration, Matta JAMA 2019), Parabens/methylparaben/propylparaben/butylparaben (endocrine disruption, Darbre 2004), Formaldehyde releasers/DMDM hydantoin/quaternium-15/imidazolidinyl urea (IARC Group 1 carcinogen), Triclosan (endocrine disruptor, FDA banned in some products), Coal tar dyes/p-phenylenediamine (IARC carcinogen), Phthalates/DBP/DEHP (endocrine disruption, reproductive harm), PFAS in cosmetics (CDC flagged, bioaccumulative), Lead acetate (neurotoxin)
MEDIUM: SLS/SLES (skin irritant, possible nitrosamine), Synthetic fragrance/parfum (phthalates hiding behind single word), PEG compounds (1,4-dioxane contamination risk), Methylisothiazolinone/MIT (contact allergen, neurotoxin), Retinyl palmitate (tumor promoter on sun-exposed skin), BHT in cosmetics (possible endocrine disruptor), Benzophenone (possible carcinogen), Phenoxyethanol (CNS depression at high doses)
LOW: Alcohol denat (skin barrier disruption), Silicones/dimethicone (environmental persistence), Synthetic dyes in cosmetics (contact sensitizer), Carbomer
PERSONAL CARE POSITIVES: EWG Verified, COSMOS/ECOCERT Certified Organic, Fragrance-free, Paraben-free certified, Sulfate-free, Leaping Bunny cruelty-free, B-Corp certified, No synthetic preservatives

CLOTHING CONCERNS:
HIGH: PFAS/DWR waterproofing coating (bioaccumulative, endocrine disruption, cancer risk — PFAS found in outdoor gear), Formaldehyde finish/wrinkle-free/easy-care treatment (IARC Group 1 carcinogen, skin sensitizer), Carcinogenic azo dyes (split to release carcinogenic aromatic amines, IARC flagged), Flame retardants/PBDE/TRIS (endocrine disruption, developmental toxicity, Stapleton 2011), Antimicrobial treatment/silver nanoparticles (aquatic toxin, environmental persistence)
MEDIUM: Polyester microfibers (700K+ fibers per wash, Browne 2011, ocean pollution), Nylon (petroleum-derived, sheds during wear AND wash), Acrylic (most carbon-intensive synthetic, highest microplastic shed rate), Spandex/elastane (petroleum-derived, chemical processing), Disperse dyes (skin sensitizer, possible carcinogen), Optical brighteners (endocrine disruption, water pollution)
LOW: Recycled polyester (lower carbon but still sheds microplastics), Blended natural/synthetic fabrics
CLOTHING POSITIVES: GOTS certified organic cotton/wool/linen, OEKO-TEX Standard 100 (no harmful chemicals tested), Bluesign certified manufacturing, Fair Trade certified, 100% natural fiber (cotton/wool/linen/hemp/silk), Recycled content certified (GRS)

KITCHEN/CLEANING CONCERNS:
HIGH: PTFE/PFAS non-stick coating (endocrine disruption, cancer risk above 260C, EWG canaries in kitchen study), BPA/BPS/BPF in plastic containers (estrogen mimicry, endocrine disruption), Quaternary ammonium compounds/quats (EPA flagged reproductive harm, asthma induction), Chlorine bleach/sodium hypochlorite (respiratory irritant, toxic byproducts), Synthetic fragrance in cleaners (VOCs, phthalates, formaldehyde, Steinemann 2017), PVC/vinyl chloride in containers (phthalate plasticizers, toxic manufacturing), 1,4-dioxane in cleaners (IARC Group 2B, ethoxylation byproduct)
MEDIUM: Optical brighteners in laundry (water pollution, endocrine disruption), Synthetic surfactants/petroleum-derived (aquatic toxicity), PVA film in pods (enters waterways as microplastic, Cascade/Tide), Phosphates (eutrophication, algal blooms), Paraffin wax (petroleum byproduct, VOCs when burned), Artificial fragrance in candles (phthalates during burning)
LOW: Synthetic dyes in cleaning products (water pollution), Preservatives/methylisothiazolinone (aquatic toxicity)
KITCHEN POSITIVES: EPA Safer Choice certified, EWG Verified, No synthetic fragrance, Biodegradable certified formula, Concentrated/refillable system, B-Corp certified, PTFE/PFAS-free certified, Food-grade safe materials (glass/stainless/ceramic)

BABY CONCERNS (all thresholds 1 tier higher due to developing systems):
Apply all personal_care concerns with elevated severity. ADDITIONAL baby-specific:
HIGH: Any synthetic fragrance in products used on babies (developing endocrine systems), Talc without asbestos testing (possible asbestos contamination), Phenoxyethanol in products for babies under 3 (CNS depression, FDA warned), Any parabens in baby products, Phthalates in baby toys/products (endocrine disruption, Swan 2021)
MEDIUM: Formaldehyde releasers in baby wash/shampoo, SLS/SLES in baby bath products, Mineral oil in baby products (possible petroleum contamination), Synthetic dyes in any product
BABY POSITIVES: MADE SAFE certified, EWG Verified for baby, Pediatrician tested and approved, Fragrance-free, Hypoallergenic tested, GOTS organic cotton, No parabens/phthalates/sulfates

DIAPER CALIBRATION — score between these anchors, from worst to best:
- Pampers / Huggies / Luvs (conventional): materials=7 — PP inner liner direct skin contact, ECF bleaching (trace dioxin risk), synthetic fragrance in some. NEVER score below 6.
- Kirkland Signature (Costco): materials=6 — polypropylene/polyester topsheet, PP/PE backsheet, ECF wood pulp, SAP. No fragrance, no phthalates. 23% plant-based materials but all conventional petroleum plastics in skin-contact layer. Low-level PFAS (10-26 ppm organic fluorine) detected in independent lab testing (Mamavation 2023). Changed manufacturers in 2024. Score 6 — no fragrance is positive, but conventional PP/PE throughout and PFAS detection prevent lower score.
- Honest Company diapers: materials=5 — inner skin-contact layer is PE+PP (conventional petroleum plastics, same as Pampers). "Plant-based" claim refers only to outer backsheet (PLA+PE blend). ECF wood pulp (not TCF). No fragrance (positive). Polymer spandex waist/leg. Score 5.
- Millie Moon diapers: materials=5 — PP non-woven fabrics, PE film, ECF pulp, SAP. Conventional petroleum plastics throughout. OEKO-TEX Standard 100 and Dermatest certified (good third-party testing). No fragrance. Score 5 — same tier as Honest, slightly better certifications.
- Hello Bello diapers: materials=4 — MEANINGFULLY DIFFERENT from Honest/Millie Moon: inner core liner is corn-derived PLA fiber (plant-based at the skin-contact layer, not just the outer layer). 100% chlorine-free processing (TCF or equivalent — better than ECF). No fragrance, no phthalates, no parabens, no latex. Made in USA. Score 4. NEVER score above 5. DO NOT score same as Pampers or Kirkland. The corn-derived inner liner touching baby skin is a real improvement.
- Andy Pandy / Dyper / Healthynest (organic bamboo): materials=3 — bamboo-derived top sheet, TCF or ECF pulp, no synthetic fragrance. Score 3.
- GroVia / Esembly (organic cotton cloth): materials=1-2 — reusable, organic cotton, no SAP polymers. Score 1-2.
KEY RULE: Always distinguish which layer is plant-based. Outer backsheet = cosmetic improvement. Inner skin-contact liner = meaningful improvement for baby health. Hello Bello's plant-based claim is on the skin-contact side. Honest/Millie Moon's is not.

SUPPLEMENT CONCERNS (vitamins, protein powders, probiotics, sleep aids, pre-workout):
HIGH: Artificial colors/dyes in capsules or gummies (Red 40, Yellow 5 — FDA phasing out), Heavy metal contamination in protein powders (lead, arsenic, cadmium — Consumer Reports 2018 found in many brands), DMAA/stimulants in pre-workout (FDA warnings, cardiovascular risk), Ephedra/ephedrine (FDA banned, cardiovascular events), Synthetic testosterone precursors/prohormones (FDA flagged), Titanium dioxide in coatings (IARC Group 2B), Proprietary blends masking underdosed or contaminated ingredients
MEDIUM: Magnesium stearate in capsules (high doses may impair absorption), Artificial sweeteners in flavored powders (sucralose, acesulfame-K), Silicon dioxide/silica flow agents, Hydrogenated oils in softgels (trans fat residue), Synthetic vitamin forms (dl-alpha tocopherol vs d-alpha, cyanocobalamin vs methylcobalamin)
LOW: Gelatin capsules (animal-derived, not suitable for vegans), Maltodextrin as filler, Natural flavors
SUPPLEMENT SCORE GUIDANCE: Whole-food derived supplements (food-based vitamin C, fermented vitamins) = materials 1-2. Standard synthetic vitamins = materials 2-3. Proprietary blend pre-workouts with stimulants = materials 5-7. Any supplement with FDA warnings = materials 7-8.
GUMMY VITAMIN DYE RULE: Any gummy vitamin or chewable supplement containing petroleum dyes (Red 40, Yellow 5, Yellow 6, Blue 1) scores materials MINIMUM 6 and usage MINIMUM 6. Children's gummy vitamins (Flintstones, L'il Critters) with dyes = materials 7 + child vulnerability flag. "Kid-friendly" coloring does not reduce this concern — it increases it. The supplement formula (65% materials) still produces a final score of ~6+ from materials=7. NEVER score a dyed gummy vitamin below 5.
SUPPLEMENT POSITIVES: NSF Certified for Sport, Informed Sport certified, USP Verified, Third-party tested, NSF International certified, Non-GMO Project Verified, USDA Organic certified ingredients, Certified vegan, No artificial colors or sweeteners, No proprietary blends

HOME LAUNDRY AND CLEANING — SPECIFIC CALIBRATION:
Conventional laundry pods (Tide, Cascade, Gain pods):
- materials=6 (PVA film dissolves into waterways as microplastic, synthetic fragrance = phthalates, 1,4-dioxane contamination risk from ethoxylated surfactants), usage=5, sustainability=7 → final ~6
- Flag: PVA pod film, synthetic fragrance, 1,4-dioxane risk
Conventional dryer sheets (Bounce, Downy dryer sheets):
- materials=6 (benzyl acetate, chloroform compounds, synthetic fragrance with phthalates, quaternary ammonium residue on clothes), usage=6 (residue stays on clothing = daily skin contact during wear + inhalation during drying) → final ~6
- Flag: synthetic fragrance VOCs, quaternary ammonium residue, daily skin contact
Liquid fabric softener (Downy liquid, Snuggle):
- materials=6 (synthetic fragrance, quaternary ammonium compounds EPA flagged for reproductive harm, dihydrogenated tallow dimethyl ammonium chloride) → final ~6
Clean laundry alternatives (Molly's Suds, Branch Basics, Seventh Generation Free & Clear):
- materials=2-3 (no synthetic fragrance, no optical brighteners, plant-derived surfactants) → final ~2-3
Wool dryer balls: materials=1, usage=1, final ~1
NEVER score conventional dryer sheets below 5. The synthetic fragrance + QAC residue on clothing is daily skin exposure.

HOME FURNISHING CONCERNS (mattresses, sofas, bedding, carpets, curtains, foam furniture):
HIGH: Flame retardants/PBDEs/chlorinated Tris/TDCPP in foam (IARC carcinogen, endocrine disruption — Stapleton 2011, California TB117 phased out), PFAS in stain-resistant treatments (Scotchgard, Teflon-coated fabrics — bioaccumulative, EPA flagged), Formaldehyde off-gassing from pressed wood, MDF, particleboard furniture (IARC Group 1 carcinogen — OSHA PEL exceeded in new furniture), Vinyl/PVC coatings or covers (phthalate plasticizers, off-gassing VOCs), Antimicrobial treatments with silver nanoparticles or triclosan (environmental persistence)
MEDIUM: Polyurethane foam off-gassing VOCs (new mattress/sofa smell — toluene, benzene derivatives), Memory foam petroleum-based content (off-gassing isocyanates), Synthetic latex (petroleum-derived, lower durability than natural), Polypropylene or nylon carpet (microfiber shedding, VOC emissions from backing), Stain treatments (oil-based or synthetic polymer), Conventional cotton batting (pesticide residue without organic certification)
LOW: Polyester fiberfill in pillows (microfiber shedding, low direct exposure), Recycled synthetic fill (lower carbon but still synthetic)
HOME FURNISHING SCORE GUIDANCE: Natural latex + organic cotton/wool + no flame retardant treatment = materials 1-2. Standard innerspring mattress, no known FR treatment = materials 3-4. Memory foam, standard poly foam = materials 5-6. Known flame retardants + PFAS stain treatment + VOC off-gassing = materials 7-8. Usage score lower than materials — exposure is inhalation and prolonged skin contact during sleep, daily usage penalty applies.
HOME FURNISHING POSITIVES: GOTS certified organic cotton/wool, GOLS certified organic latex, OEKO-TEX Standard 100, Greenguard Gold certified (low VOC emissions), CertiPUR-US foam (no harmful flame retardants), Made Safe certified, No added flame retardants, PFAS-free certified

Return ONLY this JSON:
{
  "product_name": "clean accurate product name",
  "category": "food|beverage|clothing|personal_care|home|baby|supplement|toy|accessory|restaurant|other",
  "identified_plastics": ["specific plastic type 1"],
  "harmful_chemicals": ["phthalates", "BPA", "Red 40"],
  "natural_materials": ["organic cotton", "glass"],
  "materials": {
    "score": 7,
    "label": "specific material analysis",
    "concerns": ["PP in direct food contact", "PTFE coating degrades above 260C"]
  },
  "usage_exposure": {
    "score": 8,
    "label": "daily ingestion risk",
    "frequency": "daily|weekly|occasional|rare",
    "type": "ingestion|skin_contact|inhalation|mixed",
    "intensity": "leave-on|rinse-off|single-contact",
    "vulnerable": false,
    "concerns": ["Direct plastic ingestion at every use"]
  },
  "packaging": {
    "score": 3,
    "label": "packaging assessment",
    "primary": "cardboard|glass|plastic|mixed",
    "refillable": false,
    "end_of_life": "recyclable|compostable|landfill|unknown",
    "concerns": []
  },
  "sustainability": {
    "score": 2,
    "label": "sustainability story",
    "reusable": true,
    "replaces_single_use": true,
    "replaces_count": 50,
    "circularity": "refillable|repairable|compostable|recyclable|landfill",
    "concerns": []
  },
  "manufacturing": {
    "score": 5,
    "label": "estimated — limited supply chain data",
    "tier": "good|neutral|bad",
    "confidence": "low",
    "concerns": []
  },
  "product_analysis": {
    "composition_tier": 2,
    "tier_label": "conventional|clean_formula|synthetic_heavy|high_concern|natural_fiber|synthetic|chemical_treated|plant_based|industrial_chemical|clean_safe|concern_flagged|high_risk_infants|whole_food|minimally_processed|processed|ultra_processed|whole_food_derived|synthetic_formula|natural_materials|synthetic_foam",
    "tier_description": "max 8 words describing this product composition",
    "nutrition": null,
    "nutrition_verified": false,
    "concerns": [
    ],
    "positives": [
      {"attribute": "EWG Verified", "reason": "max 8 words"}
    ],
    "confidence": "high|medium|low",
    "confidence_note": "max 10 words"
  },
  "summary_short": "max 30 words, first-person friend voice, plain language, no regulatory jargon",
  "summary_long": "60 to 100 words, research tone with specific regulatory details, lab testing references, brand progress, and historical context",
  "verdict_adult": "single-sentence verdict for general use. Max 18 words, first person, specific, takes a position.",
  "verdict_kid": "single-sentence verdict phrased for a parent scanning for their child. Same facts, kid context. Only populate for food/beverage/supplement/personal_care/clothing/home/home_furnishing/toy/baby categories. Otherwise null.",
  "ingredient_list": ["ingredient 1", "ingredient 2", "ingredient 3"],
  "raw_concerns": ["concern 1", "concern 2", "concern 3"],
  "confidence": "high|medium|low",
  "confidence_reason": "why",
  "scan_next": ["related product 1", "related product 2", "related product 3"],
  "ai_alternatives": [
    {"name": "specific product name — major clean brand", "reason": "max 10 words why safer", "material": "max 5 words", "estimated_score": 2},
    {"name": "second alternative — mid-size specialty brand", "reason": "max 10 words", "material": "max 5 words", "estimated_score": 1},
    {"name": "third alternative — small or indie brand", "reason": "max 10 words", "material": "max 5 words", "estimated_score": 2},
    {"name": "fourth alternative — optional, rotate brand size", "reason": "max 10 words", "material": "max 5 words", "estimated_score": 2}
  ]
}

CRITICAL: Populate product_analysis for ALL categories — food_beverage, personal_care, clothing, kitchen, baby, supplement, home_furnishing, restaurant, and other.
Use the category-specific tier labels and concern lists defined above.
For restaurant category: populate composition_tier based on processing level, populate nutrition using the chain's official published values — this is non-negotiable for all food and restaurant categories. Set nutrition_verified: true only if you are confident in the exact values.
If category is "other" or unknown, apply the most relevant concern types based on what the product is.
Set concerns to [] and positives to [] if the product is genuinely clean with no flagged substances.

HOT-WATER-PLASTIC FLOOR RULE (CRITICAL): If hot water flows through or contacts plastic during normal use, FINAL SCORE MINIMUM IS 7. Score escalates based on exposure severity. Apply AFTER calibration entries (a calibration override wins). For non-calibrated AI-scored products this floor is enforced.

Severity scale within the rule:
- Score 7 (baseline): simple plastic contact with hot water. Drip coffee maker with plastic reservoir but stainless carafe. Plastic kettle used occasionally.
- Score 8 (worse): hot water passes THROUGH plastic, not just contact. Daily/frequent use. Coffee maker with plastic brew chamber AND plastic carafe. Electric kettle with plastic body used multiple times daily. Plastic French press for hot coffee.
- Score 9 (worse still): pressurized hot water through plastic, single-use plastic waste added to leaching. Nespresso pods, K-cups, pod-based espresso. Single-serve plastic tea bags brewed in hot water.
- Score 10: reserved for additional severe concerns beyond hot-water-plastic (known contaminated brand, recalled product, etc.).

Categories affected (apply 7 minimum, scale up by severity): drip coffee makers with plastic reservoirs or tubing, plastic kettles and electric tea makers, instant hot-water dispensers with plastic spouts, single-serve coffee/tea pods (K-cups, Nespresso, Keurig), plastic travel mugs for hot beverages, baby bottles used with warm/hot formula, French press with plastic components, plastic pour-over cones used with boiling water, any "hot water through plastic" brewing or cooking device.

NOT affected: cold-water plastic (Nalgene used cold, plastic pitchers), plastic containers for room-temperature food, plastic utensils for cold/warm items, plastic items that only touch steam externally without flow-through (slow cooker plastic lid).

When this floor fires, summary_short MUST name the hot-water-plastic concern explicitly while keeping voice rules (first person, short, specific, no hedging).

Examples:
- Mr. Coffee drip machine (score 8): "Plastic water reservoir AND plastic carafe means hot water picks up plastic both in brewing and while sitting. Glass carafe and stainless reservoir would be cleaner. I'd swap if you're a daily coffee drinker."
- K-cups / Keurig pods (score 9): "Pressurized hot water forced through single-use plastic on every brew releases microplastics into your coffee. Plus the pod waste. Refillable stainless pods or a French press skip this entirely."
- Plastic electric kettle (score 8): "Boiling water in plastic is one of the highest-exposure daily habits for microplastic ingestion. A glass or stainless kettle costs about the same. I'd swap."
- Drip coffee maker with stainless carafe (score 7): "Plastic reservoir means hot water still picks up some leaching on the way through. Better than a fully-plastic machine but not as clean as pour-over glass."

SUMMARY VOICE RULE (CRITICAL): summary_short is the friend voice that appears on the simple result screen. summary_long is the research brief on the detail screen. Both must be honest about the SAME facts.

summary_short — REQUIRED:
- Start with the problem or strength, NOT the product name
- Use first person at least once ("I would", "I'd skip", "I like", "if it were me")
- Name specific ingredients or fabric types — no generic categories
- Short sentences, max 18 words each
- 2 to 3 sentences total, 30 words max overall
- Take a position — no hedging, no "some may feel", no "consumers might"
- Include one concrete action ("swap if you can", "fine to keep", "worth the upgrade")

HIGH-SCORE BEHAVIOR (score 1-3) — name the reasons AND explain why each one matters. The reader should walk away understanding what earned this product its score, not just hearing it's "clean".

WORD CAP for score 1-3 is 35 to 50 words (overrides the 30-word general cap above). The expansion is REQUIRED to explain WHY each detail matters — not for rambling, marketing language, or filler.

PATTERN to follow:
[specific quality 1] ([brief why it matters]), [specific quality 2] ([brief why it matters]), and [specific quality 3] ([brief why it matters]). [Optional brand credit]. [Optional first-person endorsement].

Each detail in a high-score summary_short should:
- Name the specific quality choice the brand made (cite ingredients, certifications, testing practices, or absences by name)
- Briefly explain why that choice matters in a parenthetical or short clause (no chlorine residue, no microplastic leaching, no glyphosate residue, no hidden allergen source, no synthetic fragrance, etc.)
- Connect to user benefit when relevant
- Give the brand credit by name when the choice is brand-driven

FORBIDDEN for high-score summary_short:
- Listing qualities without explaining why they matter
- Generic praise ("This is a great product", "Excellent choice")
- Marketing-speak ("premium", "innovative", "thoughtfully crafted")
- Restating the score ("a solid 3 out of 10")
- Low-effort fallbacks: "Looks good to me", "No concerns here", "Low concern", "minimal concern", "This product scored well"

summary_short — FORBIDDEN:
- Restating the product name at the start (already on screen)
- Hedging language ("it depends", "some may", "could potentially")
- "Consumers", "individuals", "users" — talk to the person reading it
- "Overall," as a sentence starter
- Em dashes used as bullets or list separators
- Bullet points of any kind
- ppm numbers, lab citations, regulatory body names
- Restating the score number

GOOD summary_short examples:
- Food with dyes (score 7): "The Red 40, Yellow 5 and Blue 1 are the issue here — petroleum dyes linked to behavior effects in kids. I'd swap to the plain Goldfish or a dye-free cheddar cracker."
- Personal care clean (score 2): "Clean formula — no parabens, phthalates, or synthetic fragrance. I'd keep using this one, it's one of the better options on the shelf."
- Clothing synthetic (score 6): "Mostly the fabric — polyester sheds microplastics every wash, and the DWR finish is a PFAS source. I'd save it for workouts and swap in cotton or merino for everyday."
- Food score 8: "The seed oils and TBHQ preservative are doing the damage. If it were me I'd finish the bag and not rebuy — plenty of cleaner chip options now."
- HIGH-SCORE Who Gives a Crap bamboo TP (score 3): "100% bamboo (no tree pulp), unbleached fibers (no chlorine residue), and third-party PFAS testing comes back clean. Subscription model cuts packaging waste too. Who Gives A Crap is doing the work."
- HIGH-SCORE Salt and Stone body lotion (score 2): "Jojoba and shea butter as the actual heavy lifters (not filler), no synthetic fragrance (the #1 hidden allergen source), and no parabens or phthalates. One of my go-to clean skincare brands."
- HIGH-SCORE Dr. Bronner's Castile Soap (score 1): "Organic oils only (coconut, olive, hemp), nothing synthetic, and B Corp certified for sourcing transparency. The label tells you exactly what's in it. Gold standard for clean soap."
- HIGH-SCORE Annie's organic crackers (score 3): "Organic wheat (no glyphosate residue), no artificial dyes, real cheese powder (not cheese flavor), and minimal additives. Annie's is one of the cleaner mainstream kid-snack brands."
- HIGH-SCORE stainless steel kettle (score 1): "All stainless steel construction (no plastic in the water path means no microplastic leaching), and no toxic coatings. Hard to beat this for daily hot water use."

BAD summary_short examples (NEVER produce):
- "Goldfish Colors/Rainbow — petroleum dyes added in colored varieties (Red 40, Yellow 5, Blue 1 confirmed). Dye floors fire. Score higher than original. Stick to original or Whole Grain Goldfish." (restates product name, clinical language, no first person, nonsense phrase "dye floors fire")
- "Overall, this product contains some concerning ingredients that consumers should be aware of." (hedging, "consumers", "Overall,", no specifics)
- "This sunscreen uses oxybenzone and octinoxate, which are chemical UV filters that some studies suggest may have endocrine-disrupting potential at certain exposure levels." (one 30-word sentence, hedged, no first person, no action)

summary_long rules stay as before: 60 to 100 words, 3 to 5 sentences, research tone, include regulatory details (EU restrictions, FDA rulings, state bans), lab references when relevant (Mamavation, NEJM, Nature Medicine), brand progress notes with dates, and historical context.

Never soften summary_short to hide what summary_long says.

VERDICT VOICE RULE (CRITICAL):

Generate two verdict variants per scan:

verdict_adult: Standard verdict for general use. First person, specific, takes a position. Voice rules same as summary_short (no hedging, no "Overall,", no restating product name, no consumers/users/individuals). Max 18 words.

verdict_kid: Same score threshold but phrased for a parent scanning for their child. Only populate for categories that can apply to kids: food, beverage, supplement, personal_care, clothing, home, home_furnishing, toy, baby. For other categories (restaurant, accessory, kitchen, other), return null for verdict_kid.

Kid-context framing by score band:

Score 1-3: warm and specific. Adult: "Solid pick.", "Good one to keep around.", "One of the cleaner options out there.", "Hard to beat this one for the category." Kid: "Safe for a kid. Good one for their routine.", "No issues for a kid here. Keep it in rotation.", "Clean enough for daily use with kids." NEVER "Looks good to me" / "No concerns here" — name what made it good.
Score 4-5: "Not ideal for a kid" / "I'd save this for adults" / "Cleaner options exist for kids"
Score 6-7: "I'd skip this for a kid" / "Not for their [snack/daily/regular] rotation" / "Something cleaner would be better for them"
Score 8-10: "Hard skip for a kid" / "Not for the little one" / "I'd pass for kids"

Same voice rules as adult verdicts: first person, specific, short, no hedging. Context is explicitly about the child.

GOOD verdict examples:

Product: Goldfish Colors, score 6
verdict_adult: "I'd pass on this one."
verdict_kid: "I'd skip this for a kid. The original Goldfish skip the dyes."

Product: Salt and Stone body lotion, score 2
verdict_adult: "Clean pick. Good for daily use."
verdict_kid: "Safe for their skin. Good for a kid."

Product: Lululemon Align, score 5
verdict_adult: "Keep these for the gym."
verdict_kid: "Not ideal for a kid. Find cotton basics instead."

Product: Dr. Bronner's Castile Soap, score 1
verdict_adult: "Hard to beat this one for the category."
verdict_kid: "Safe for a kid. Good one for their routine."

Product: Who Gives A Crap bamboo TP, score 3
verdict_adult: "One of the cleaner TP options out there."
verdict_kid: null

SUBSTANCE NAMING RULES — critical for accurate scoring:
Always name the SPECIFIC chemical, not a generic category. These rules apply to every concern you generate:
- NEVER write "contains preservatives" → ALWAYS write the specific preservative: "BHT (butylated hydroxytoluene)", "BHA", "TBHQ", "sodium benzoate", "potassium sorbate"
- NEVER write "artificial colors" → ALWAYS write the specific dye: "Red 40 (Allura Red)", "Yellow 5 (Tartrazine)", "Blue 1"
- NEVER write "synthetic fragrance" alone → write "synthetic fragrance (may contain undisclosed phthalates and VOCs)"
- NEVER write "phthalates" alone → write "DEHP", "DBP", or "diethyl phthalate" if you know which type
- NEVER write "heavy metals" → write "lead", "cadmium", or "arsenic" if known
- NEVER write "flame retardants" → write "PBDE", "TCEP", "TDCPP", or "TPhP" if known
- NEVER write "PFAS" alone without specifying → "PFAS (PFOA class)", "PTFE coating", "perfluoroalkyl DWR". For clothing: "PFAS-based DWR (durable water repellent) — perfluoroalkyl compounds, EU REACH restricted 2023"
- NEVER write "binding agents", "emulsifiers", "natural flavors", "processing aids" as concerns — these are ingredients, not harmful substances
- NEVER write concerns about "concentration levels" or "coating types" without naming the specific chemical
- If you know a product contains a specific harmful substance (e.g. Altoids contains BHT, Chick-fil-A uses TBHQ), NAME IT explicitly in the concerns
- If you are uncertain whether a substance is present, use hedging in the reason field but still name the specific substance: "BHT — listed as preservative in some formulations; verify on label"
- Packaging speculation: if packaging MAY contain a harmful substance, write it as: "packaging may contain [specific substance] — unconfirmed" with severity "low", NOT as a high/medium concern

AI ALTERNATIVES — same-use, same-function rule — CRITICAL — NEVER VIOLATE:
Alternatives MUST serve the exact same purpose as the scanned product. Ask yourself: "would someone reaching for the scanned product actually substitute this?" If the answer is no, do not suggest it. Cross-category AND cross-subcategory suggestions are STRICTLY FORBIDDEN.

SUBCATEGORY COHERENCE — match not just the broad category but the specific use case. These examples cover the most common failure modes:
- Muffins → other breakfast baked goods (muffins, scones, breakfast bars). NEVER candy bars, cookies, protein powder, or trail mix.
- Chocolate chip cookies → other cookies (cleaner cookie brands, not protein bars, not candy)
- Chips / salty snacks → other salty snacks (cleaner chips, popped grains, puffs). NEVER crackers, granola, or fruit snacks.
- Ice cream / frozen dessert → other frozen desserts (cleaner ice cream, gelato, frozen yogurt). NEVER protein bars, smoothies, or yogurt cups.
- Crackers → other crackers (seed crackers, whole-grain crackers). NEVER chips, cookies, or granola.
- Chocolate candy bar → other chocolate bars (cleaner formulations). NEVER muffins, energy bars, or protein bars.
- Body lotion → other body moisturizers (body creams, body butters). NEVER face serums, shampoo, or hand cream.
- Face serum → other face serums. NEVER body lotion, toner, or moisturizer.
- Shampoo → other shampoos. NEVER conditioner, body wash, or dry shampoo.
- Breakfast cereal → other cereals or breakfast foods. NEVER cough syrup, supplements, medication, or anything not eaten for breakfast.
- Snack bar / granola bar → other snack bars or granola bars. NEVER cereals, cookies, or trail mix.
- Soda / beverage → other beverages.
- Diapers / training pants → other diapers or cloth diaper systems.
- Sunscreen → other sunscreens.
- Cleaning spray → other cleaning products.
- Frying pan / cookware → other cookware.
- Clothing / jacket → other clothing in the same category.

FOOD ALTERNATIVES must be the same type of food. Cheerios = breakfast cereal → suggest Bob's Red Mill Organic Oats, Nature's Path Organic Corn Flakes, One Degree Organic Sprouted Oat O's. NEVER suggest a medication, supplement, or non-food item as a food alternative.

VARIETY AND BRAND DISCOVERY — suggest 3 to 4 alternatives and deliberately mix brand sizes:
- One major clean brand (Annie's, 365 Whole Foods, Nature's Path, Bob's Red Mill).
- One mid-size specialty brand (Simple Mills, Siete, One Degree, Kite Hill, Hu).
- One small or indie brand the user may not know (see indie list below).
Do NOT default to the same three brands every time. Rotate across the list below based on subcategory fit. A user scanning five different snacks should see five different brand mixes.

INDIE BRANDS TO CONSIDER (include at least one when relevant to the subcategory):
- Baked goods / breakfast: Purely Elizabeth, Bhu Foods, Mikey's, Elana's Pantry, Against the Grain, Simple Kneads, Little Northern Bakehouse.
- Snacks / salty: Siete, Beanitos, Lesser Evil, From the Ground Up, Brad's Plant-Based, Jackson's, Hippeas.
- Snacks / sweet: Hu, Alter Eco, Unreal, YumEarth, SmashMallow, Partake.
- Bars: RXBar, Bhu Foods, Good! Snacks, Picky Bars, Kate's Real Food, GoMacro.
- Frozen: Three Twins, Coconut Bliss, NadaMoo, Alden's Organic, Van Leeuwen (clean flavors only).
- Personal care / body: Earth Mama, Badger Balm, Acure, Alaffia, 100% Pure, Osea, True Botanicals.
- Personal care / baby: Earth Mama, Babyganics, Honest Company, Puracy.
- Cleaning: Branch Basics, Blueland, Attitude, Molly's Suds, Aunt Fannie's.
- Beverages: Poppi, Olipop, Spindrift, Health-Ade, GT's Kombucha, Humm.

SUPPLEMENT AND MEDICINE ALTERNATIVES — must be the same type of product:
- Cough syrup → suggest Zarbee's (honey-based, no dyes, no alcohol, score 1-2), Genexa (USDA organic inactive ingredients, no dyes, score 2), Maty's Organic (organic honey and herbs, score 1-2)
- Children's cough syrup → Zarbee's Kids (score 1-2), Little Remedies (no dyes, simpler formula, score 2-3)
- Children's acetaminophen/fever reducer → Genexa Kids' Acetaminophen (organic inactive ingredients, no petroleum dyes, score 2)
- Adult cough syrup → Zarbee's Adult (honey-based), Boiron Chestal (homeopathic, no alcohol, score 2-3)
- Multivitamin → Ritual, Thorne, Garden of Life (score 1-3)
- Children's multivitamin → Llama Naturals (no dyes, freeze-dried fruit), MaryRuth's (no artificial dyes), SmartyPants Kids (score 3-4)
- NEVER suggest a food, personal care product, or cleaning product as a supplement alternative

If you cannot think of a genuine same-category alternative, return an empty ai_alternatives array rather than suggesting something from a different category. An empty array is far better than a wrong suggestion.

CRITICAL ALTERNATIVES RULE: Every alternative you suggest MUST have an estimated_score strictly lower than the product being scanned. If the product scores 2, return an empty array — there is nothing meaningfully cleaner to suggest. If the product scores 4, only suggest alternatives scoring 1-3. Never suggest an alternative that scores the same or higher than the product. A user scanning a clean product should never see alternatives that are worse.
For CLOTHING: always specify material and certification. Name real brands.
estimated_score must reflect the same scoring framework.
Respond with ONLY the JSON object above — no text before or after it.
`,
    3000
  );
}

// ── DB ALTERNATIVES CATEGORY VALIDATOR ───────────────────────
// Static DB alternatives can match on tags across categories.
// This filters results to ensure the suggestion is the same TYPE
// of product as what was scanned.
const MEDICINE_TAGS = /cough|syrup|medicine|medication|remedy|first aid|supplement|vitamin|capsule|tablet|pill|lozenge|nasal|antacid|pain relief/i;
const CLEANING_TAGS = /cleaner|detergent|disinfect|sanitiz|laundry|bleach|spray cleaner|floor cleaner/i;
const PERSONAL_CARE_TAGS = /shampoo|conditioner|lotion|cream|moisturizer|serum|deodorant|toothpaste|makeup|sunscreen/i;

function filterDbAlternatives(alternatives, category, productName, productScore = null) {
  if (!alternatives?.length) return alternatives || [];
  const isFoodCat = FOOD_CATEGORIES_SET.has(category);

  return alternatives.filter(alt => {
    const name   = (alt.name   || "").toLowerCase();
    const tags   = (alt.tags   || []).join(" ").toLowerCase();
    const desc   = (alt.description || "").toLowerCase();
    const combined = `${name} ${tags} ${desc}`;

    // Block alternatives that score worse than the product being scanned.
    //
    // For products already scoring 1-2 (already clean), the strict
    // "alt must score lower" rule guarantees zero alternatives ever surface
    // because almost no products in the catalog score below 2. Tag Heuer at
    // score 2 + Apple Watch at score 2 is useful context for users — they're
    // peer-clean choices, not regressions. So when productScore <= 2, allow
    // alternatives with the same score (peer-clean), but still block any
    // alternative scoring worse. For productScore >= 3, the strict
    // "must be cleaner" rule still applies.
    const altScore = alt.plasticScore ?? alt.score ?? null;
    if (productScore !== null && altScore !== null) {
      const peerCleanAllowed = productScore <= 2;
      const blocked = peerCleanAllowed ? (altScore > productScore) : (altScore >= productScore);
      if (blocked) {
        console.log(`DB filter: blocked "${alt.name}" (score ${altScore} vs product ${productScore}, peerClean=${peerCleanAllowed}) for "${productName}"`);
        return false;
      }
    }

    // Food scans: block medicine, personal care, cleaning products
    if (isFoodCat) {
      if (MEDICINE_TAGS.test(combined)) {
        console.log(`DB filter: blocked "${alt.name}" for food product "${productName}"`);
        return false;
      }
      if (PERSONAL_CARE_TAGS.test(combined)) {
        console.log(`DB filter: blocked "${alt.name}" (personal care) for food product "${productName}"`);
        return false;
      }
      if (CLEANING_TAGS.test(combined)) {
        console.log(`DB filter: blocked "${alt.name}" (cleaning) for food product "${productName}"`);
        return false;
      }
    }

    // Non-food scans: block food items appearing as alternatives
    if (!isFoodCat && FOOD_CATEGORIES_SET.has(alt.category)) {
      console.log(`DB filter: blocked food alt "${alt.name}" for non-food product "${productName}"`);
      return false;
    }

    // Category fidelity: for specific non-food categories, only allow same category OR "other"
    // Prevents cross-category bleeding when a category has sparse DB coverage
    const STRICT_CATEGORIES = new Set(["home","toy","accessory","supplement","beverage","personal_care","clothing","baby","kitchen"]);
    // For supplement/personal_care/baby: block "other" too (prevents garden tools for supplements, etc)
    const BLOCK_OTHER = new Set(["supplement","personal_care","baby"]);
    const allowOther = !BLOCK_OTHER.has(category);
    if (STRICT_CATEGORIES.has(category) && alt.category !== category && (alt.category !== "other" || !allowOther)) {
      // Allow kitchen ↔ home since they share formula weights
      const kitchenHomeSwap = (category === "home" && alt.category === "kitchen") ||
                               (category === "kitchen" && alt.category === "home");
      if (!kitchenHomeSwap) {
        console.log(`DB filter: blocked "${alt.name}" [${alt.category}] for "${category}" product "${productName}"`);
        return false;
      }
    }

    return true;
  });
}


// The AI sometimes ignores the same-use rule and suggests completely
// wrong products. This filter catches cross-category hallucinations
// before they reach the client.

// Keywords that signal a non-food product — reject if category is food
const NON_FOOD_KEYWORDS = /\b(syrup|cough|medicine|medication|supplement|vitamin|capsule|tablet|pill|lotion|cream|shampoo|conditioner|soap|detergent|cleaner|spray|wipe|diaper|clothing|shirt|pants|jacket|toy|game|appliance|device|electronics)\b/i;

// Keywords that signal a food product — reject if category is non-food
const FOOD_KEYWORDS = /\b(cereal|oats|granola|bar|snack|food|drink|beverage|juice|soda|milk|yogurt|bread|cracker|chip|candy|chocolate|cookie|pasta|rice|soup|sauce|spread|protein powder)\b/i;

function filterAiAlternatives(alternatives, category, productName) {
  if (!alternatives?.length) return alternatives || [];
  const isFoodCat = FOOD_CATEGORIES_SET.has(category);
  const productLower = (productName || "").toLowerCase();

  return alternatives.filter(alt => {
    const name = (alt.name || "").toLowerCase();
    const reason = (alt.reason || "").toLowerCase();
    const combined = name + " " + reason;

    // Food category: reject any suggestion that looks like a non-food product
    if (isFoodCat && NON_FOOD_KEYWORDS.test(combined)) {
      console.log(`Filtered cross-category alt: "${alt.name}" for food product "${productName}"`);
      return false;
    }

    // Non-food category: reject any suggestion that looks like food
    if (!isFoodCat && FOOD_KEYWORDS.test(combined) && !FOOD_KEYWORDS.test(productLower)) {
      console.log(`Filtered cross-category alt: "${alt.name}" for non-food product "${productName}"`);
      return false;
    }

    // Reject null/empty score alternatives (AI signaling it has no good suggestion)
    if (alt.estimated_score === null || alt.estimated_score === undefined) return false;

    return true;
  });
}


async function pass2(productName, pass1Result, materialContext) {
  const p = pass1Result;
  const scores = `materials:${p.materials?.score} usage:${p.usage_exposure?.score} packaging:${p.packaging?.score} sustainability:${p.sustainability?.score}`;
  const plastics = (p.identified_plastics || []).join(", ") || "none";
  const searchSection = materialContext ? `\nVerified product data: ${materialContext.slice(0, 500)}` : "";

  return callClaude(
    `You are a scientific auditor reviewing a 4-dimension product risk score. Respond with valid JSON only — no markdown, no backticks, no trailing commas. Keep all string values under 20 words.`,
    `Audit the 4-dimension scores for "${productName}":
${scores}
category:${p.category} plastics:${plastics} frequency:${p.usage_exposure?.frequency} type:${p.usage_exposure?.type}${searchSection}

AUDIT RULES:
MATERIALS: Only score plastic/chemical risk from materials user is exposed to during use. Discarded packaging must not drive materials above 3 for otherwise plastic-free products. BUT: PVA pod film (Cascade, Tide, Finish) = materials 6-7 because PVA enters waterways. Synthetic fragrances and optical brighteners in cleaning products = materials 6-7. Synthetic textiles (polyester, nylon, spandex) with daily skin contact = materials 5-7. ORGANIC CLOTHING: confirmed organic cotton, linen, wool, hemp, bamboo = materials 1-2 regardless of daily use. Known organic kids brands (Little Rad Things, Pact Kids, Hanna Andersson, Burt's Bees Baby) = final score 1-3.
NATURAL FRAGRANCE RULE: Salt & Stone, Tatcha, Herbivore, Byredo, and similar clean beauty brands explicitly avoid synthetic fragrance. When these brands list "Fragrance (Parfum)" alongside individually disclosed natural components (limonene, linalool, eugenol, geraniol, citral, benzyl benzoate) this is transparent natural fragrance — NOT synthetic fragrance. Do NOT apply synthetic fragrance penalty. Materials score for Salt & Stone products must be 1-3. Final score for Salt & Stone body care must be 2-3, never 4+.
USAGE: Daily plastic ingestion = usage 8-9. Leave-on skin contact daily = 7-8. Rinse-off = lower BUT dishwasher/laundry products are NOT zero — residue remains on dishes and clothing. Conventional dishwasher pods = usage 4-6. Genuinely clean formulas = usage 2-3. Vehicles = 3-5 max. EVs score 1-2 lower than gas.
PACKAGING: Refillable/concentrated = 1-3. Single-use plastic = 7-9. Concentrated pod format does NOT excuse bad materials.
SUSTAINABILITY: Products releasing PVA or synthetic chemicals to waterways = sustainability 5-7 even if concentrated. Genuinely clean (no PVA, no synthetic fragrance) = sustainability 1-3.
MANUFACTURING: Not scored — do not return or adjust manufacturing scores.
CHEWING GUM: polyvinyl acetate = direct plastic ingestion. Materials 7-8, usage 8-9.
SUNSCREEN: Chemical UV filters (oxybenzone, octinoxate, avobenzone) = materials 6-7, usage 6-7 (full-body daily skin absorption, FDA flagged for bloodstream penetration). Mineral-only (zinc oxide, titanium dioxide) = materials 2-3, usage 2-3.
REEF-SAFE WARNING: "Reef safe," "ocean friendly," and "reef friendly" are unregulated marketing claims — do NOT take them at face value. Always check actual UV filter ingredients. If oxybenzone or octinoxate is present in the ingredient list, the product is NOT reef-safe and the materials floor of 7 applies regardless of the label claim. Only score a sunscreen as clean if confirmed mineral-only (zinc oxide ± titanium dioxide) ingredients are visible.
HOME FRAGRANCE/CANDLES: Paraffin wax + synthetic fragrance (Yankee, Bath & Body Works) = materials 6, usage 5-6 (VOC inhalation in enclosed space). Soy or beeswax + phthalate-free fragrance = materials 2, usage 3. Aerosol sprays (Febreze, Glade) = materials 6-7 (phthalates, propellant), usage 6 (aerosolized inhalation).
LAUNDRY: Conventional dryer sheets (Bounce, Downy) = materials 6 (benzyl acetate, synthetic VOCs), usage 5 (daily skin contact residue on clothes). Wool dryer balls = materials 1, usage 1.
ART SUPPLIES: Paraffin wax crayons = materials 4 (petroleum wax, synthetic dyes). Beeswax crayons = materials 1. Solvent-based paints/markers = materials 6-7 (VOCs). Water-based washable paints/markers = materials 2-3.
MEDICATIONS/FIRST AID: Score the product itself, not just packaging. Active pharmaceutical ingredients in OTC medications carry minimal risk at occasional use — do not over-score. Standard OTC pain relief (Advil, Tylenol) = final 3 (occasional ingestion, some synthetic inactive ingredients). Natural alternatives (arnica, honey-based) = final 2. Petroleum jelly = materials 5 (petroleum derivative, possible PAH contamination), usage 5 (leave-on skin).
FEMININE HYGIENE: Conventional synthetic pads/tampons (Always, Tampax) = materials 6 (rayon, chlorine bleaching, possible dioxin residue), usage 6 (direct mucous membrane contact). Organic cotton versions = materials 2, usage 2. Menstrual cups (medical silicone) = materials 1, sustainability 1.
PET FOOD: Kibble with synthetic preservatives (BHA/BHT) and artificial dyes = materials 5-6, usage 4-5 (daily ingestion). Whole ingredient/organic pet food = materials 2, usage 2.
GARDEN CHEMICALS: Synthetic pesticides (glyphosate/Roundup) = materials 7-8, sustainability 8. Organic OMRI-listed products = materials 1-2, sustainability 2.
EYEWEAR: Acetate frames (cellulose) = materials 2 (plant-derived). Polycarbonate/standard plastic = materials 4. Usage stays low (2-3) for all — skin contact but minimal absorption. Final scores for eyewear typically 2-4.
TECH/ACCESSORIES: Score durability as sustainability signal. Cheap disposable cables = sustainability 7. Braided long-life cables = sustainability 3. Phone cases: ABS plastic = materials 5, compostable bioplastic = materials 2.

SCORE DISTRIBUTION — use the full 1-10 scale deliberately. Do NOT cluster at 6:
- 1-2: Genuinely clean (organic certified, natural materials, no synthetic chemicals)
- 3-4: Mild concern (mostly clean, some conventional materials or minor issues)
- 5-6: Moderate concern (synthetic ingredients, flagged chemicals, meaningful exposure)
- 7-8: High concern (multiple flagged substances, FDA/EWG flagged, high daily exposure)
- 9-10: Severe (PFAS, banned substances, direct carcinogen ingestion)
When uncertain about a product's ingredients, default DOWNWARD not upward. Unknown ≠ dangerous.

CALIBRATION — use these as anchors:
- Poppi Prebiotic Soda (any flavor): final score ~3 — apple cider vinegar, fruit juice, stevia, no artificial dyes. NEVER score above 4.
- Olipop (any flavor): final score ~2-3 — plant fiber, prebiotics, natural flavors, no HFCS. NEVER score above 4.
- Chick-fil-A Crispy Chicken Sandwich: final score ~6 — TBHQ in frying oil (FDA-flagged preservative), MSG in breading, dimethylpolysiloxane (silicone-based antifoaming agent) in frying oil, enriched white flour bun, 1350mg sodium. Always flag TBHQ, MSG, and dimethylpolysiloxane as concerns. NEVER score below 5.
- Chick-fil-A Grilled Chicken Sandwich: final score ~4-5 — cleaner marinade, no TBHQ or dimethylpolysiloxane, still high sodium and processed bun.
- Chick-fil-A Nuggets (fried): final score ~6-7 — TBHQ, MSG, dimethylpolysiloxane, refined oil, processed breading. Always flag all three.
- Cascade pods: final score ~6 (PVA film + synthetic chemicals + residue on dishes)
- Blueland tablets: final score ~1-2 (genuinely plastic-free, no PVA, no synthetic fragrance)
- Lululemon leggings: final score ~6 (synthetic microfibers daily skin contact)
- Organic cotton tee: final score ~1-2
- PTFE non-stick pan: final score ~7-8
- Ceramic pan (Caraway/GreenPan): final score ~2
- Glass pour-over / French press / glass coffee maker (borosilicate glass, ceramic, stainless parts): final score ~2 — glass and ceramic are inert at all temperatures. NEVER score glass or ceramic kitchen products above 3 on materials. Hot water through glass has zero leaching risk.
- Stainless steel water bottle or coffee thermos: final score ~1-2
- Standard plastic drip coffee maker (plastic reservoir contacts hot water): final score ~5 (daily plastic + hot water contact)
- Neutrogena chemical sunscreen: final score ~7 (oxybenzone bloodstream absorption)
- Badger mineral sunscreen: final score ~2 (zinc oxide only)
- Conventional dryer sheets (Bounce): final score ~5-6 (synthetic VOCs daily skin contact)
- Wool dryer balls: final score ~1 (pure wool, 1000+ uses)
- Febreze spray: final score ~6-7 (phthalates aerosolized in enclosed space)
- Soy candle (phthalate-free): final score ~2-3
- Yankee Candle (paraffin + synthetic fragrance): final score ~6
- M&Ms: final score ~7 — ultra-processed + 4 FDA-flagged petroleum dyes (Red 40, Yellow 5, Yellow 6, Blue 1) — NEVER score below 6
- Skittles: final score ~7 — same dyes + titanium dioxide (IARC Group 2B) — NEVER score below 6
- Froot Loops / dyed breakfast cereal: final score ~7 — multiple petroleum dyes + HFCS + daily child ingestion
- Plain dark chocolate (70%+ cacao, no dyes, no artificial additives — Hu, Lindt 70%+): final score ~2-3 — genuine nutritional value from flavanoids lowers the score. NOT the same as milk chocolate or candy bars.
- Milk chocolate bar / candy bar (Hershey's, Snickers, Kit Kat): final score ~4-5 — high sugar, dairy solids, emulsifiers, some with artificial flavors. Not a 2.
- Altoids Peppermint Mints (current formulation — no BHT, no artificial dyes): final score ~3-4. Sugar + gum arabic + peppermint oil + gelatin = simple ingredients but 100% sugar delivery, zero nutritional value, NOVA 3. NEVER score below 3.
- Doritos / flavored chips: final score ~6-7 — artificial flavors, MSG, synthetic dyes in some varieties
- Whole fresh fruit or vegetables: final score ~1
- Organic whole food snack (no synthetic additives): final score ~1-2
- Gatorade (artificial dyes, sucrose, in plastic): final score ~6 — dyes + high sugar + plastic bottle
- Gatorade in aluminum bottle or powder form: final score ~5
- Coca-Cola / Pepsi Classic (can): final score ~5 — caramel color IV (4-MEI IARC 2B), HFCS, phosphoric acid
- Diet Coke / Diet Pepsi (can): final score ~5 — aspartame IARC 2B 2023, caramel color IV. DO NOT score 4 just because it is in an aluminum can — aspartame warrants 5 minimum.
- Mountain Dew / Fanta / Tropical Sprite with artificial dyes: final score ~7 — petroleum dyes + HFCS. NEVER score below 6.
- Red Bull (regular): final score ~6 — 27g sugar, taurine, B-vitamin megadoses, artificial flavors, 80mg caffeine. NEVER score below 5.
- Monster Energy (colored flavors): final score ~6-7 — artificial dyes + high stimulant dose.
- Zevia (stevia soda, no dyes): final score ~2
- Celsius Energy (natural caffeine, no artificial colors): final score ~4
- Starbucks Pink Drink / Refreshers: final score ~4 — acesulfame potassium, artificial flavors
- Dutch Bros flavored drinks: final score ~5-6 — Blue Rebel base is an energy drink, high sugar syrups, artificial flavors. NEVER score below 5.
- Pressed Juicery cold-pressed juice (raw, no additives): final score ~2-3
- Jamba Juice classic smoothie (up to 80g sugar, sherbet): final score ~4-5
- Jamba Juice heavy protein smoothie (95g+ sugar, ice cream): final score ~5. NOT a 2.
- Smoothie King Lean1 / diet blends (sucralose, artificial flavors): final score ~5
- Plain black coffee / espresso: final score ~1
- Sweetgreen bowl (fresh whole ingredients): final score ~3-4
- CAVA protein bowl: final score ~3-4. Loaded with processed sauces = 4-5.
- Panera You Pick Two (soup + sandwich): final score ~4-5. High sodium soups. NOT as clean as marketing suggests.
- Dave's Hot Chicken tenders (fried, TBHQ): final score ~6 — same tier as Chick-fil-A fried items.
- Crumbl Cookie: final score ~6 — refined flour, 40-80g sugar, artificial dyes in frosting on many flavors. NEVER score below 5.
- Nothing Bundt Cakes / Insomnia Cookies: final score ~5-6 — refined flour, high sugar, some artificial dyes.
- Conventional shampoo (SLS, synthetic fragrance, parabens): final score ~4-5
- Cliff Bar (conventional oats, dates, nuts — oats likely have glyphosate residue): final score ~3-4
- Kashi Organic (USDA Organic certified lines — Cinnamon Harvest, Organic Promise): final score ~1-2 — no glyphosate, whole grain, no dyes.
- Kashi conventional (GO Original, GO Crunch, Seven Whole Grain — Non-GMO Project Verified, NOT organic): final score ~3 — seven whole grains, Non-GMO, no artificial dyes, no synthetic preservatives, high fiber. Oats are ONE of 7-8 grains, not primary ingredient. Flag glyphosate as MEDIUM (not high) because diluted across many grains. NEVER score above 4.
- Honey Nut Cheerios / original Cheerios (conventional oats — PRIMARY ingredient): final score ~6-7 — EWG confirmed glyphosate above child threshold. NEVER score below 6.
- Quaker oats / Quaker granola bars (conventional, oats primary): final score ~5-6, but simpler ingredients
- Bob's Red Mill Organic Oats: final score ~1-2 — USDA organic, no glyphosate
- Oats Overnight (USDA Organic certified oat blend, protein, natural flavors): final score ~2 — organic certification means no glyphosate. Do NOT apply glyphosate floor. NEVER score above 4.
- 365 Whole Foods Market chewy protein bites / protein bites (dates, almonds, cashews, coffee extract, sea salt — no oats, no artificial dyes, no synthetic preservatives): final score ~2-3. NEVER score above 4. No glyphosate concerns — no oats in this product.
- M&Ms: final score ~7-8 — NEVER score below 7. Four petroleum dyes all FDA-flagged/phasing out. Ultra-processed. Flag all four dyes by name.
- Skittles: final score ~7-8 — NEVER score below 7. Same dyes plus titanium dioxide (IARC 2B, EU banned in food).
- Froot Loops / dyed kids cereal (multiple petroleum dyes + HFCS + daily child consumption): final score ~7-8 — NEVER score below 7. Child vulnerability flag.
- Crayola paraffin crayons: final score ~3-4
- Stockmar beeswax crayons: final score ~1-2
- Standard PVC yoga mat: final score ~6
- Natural rubber yoga mat: final score ~2
- Conventional tampons/pads (Always/Tampax): final score ~6
- Organic cotton tampons/pads: final score ~2
- Menstrual cup: final score ~1
- Conventional disposable diaper (Pampers, Huggies, Luvs): final score ~7 — PP inner liner, ECF bleaching, synthetic fragrance in some. Baby vulnerable population flag. NEVER score below 6.
- Kirkland Signature (Costco) diapers: final score ~6 — conventional PP/PE throughout, ECF bleaching, low-level PFAS detected in independent lab testing (Mamavation 2023, 10-26 ppm organic fluorine). No fragrance, no phthalates. 23% plant-based but conventional plastics in all skin-contact layers. Changed manufacturers 2024.
- Honest Company diapers: final score ~5 — inner skin-contact layer PE+PP (same as Pampers). "Plant-based" refers to outer backsheet only. ECF pulp (not TCF). No fragrance. Score 5, not 7.
- Millie Moon diapers: final score ~5 — PP/PE throughout, ECF pulp, SAP. OEKO-TEX Standard 100 certified and Dermatest approved. No fragrance. Same tier as Honest.
- Hello Bello diapers: final score ~4 — corn-derived PLA fiber inner liner (plant-based at the skin-contact layer — genuinely better than Honest/Millie Moon where plant-based is outer layer only). 100% chlorine-free. No fragrance, no phthalates, no parabens. NEVER score above 5. NEVER score same as Pampers/Kirkland.
- Organic bamboo diaper (Andy Pandy, Dyper, Healthynest): final score ~3 — bamboo-derived, chlorine-free, no synthetic fragrance.
- Cloth diaper (organic cotton, GroVia, Esembly): final score ~1-2 — reusable, organic cotton, no SAP.
- Conventional training pants (Pampers Easy Ups, Huggies Pull-Ups): final score ~7. NEVER score below 6.
- Honest Company training pants: final score ~5. Hello Bello training pants: final score ~4.
- Purina/Royal Canin dry kibble: final score ~4-5 (synthetic preservatives BHA/BHT)
- Honest Kitchen/Open Farm whole ingredient dog food: final score ~2
- Standard Advil/Tylenol: final score ~3
- Standard synthetic multivitamin with petroleum dyes (Centrum Silver — contains FD&C Blue 1, titanium dioxide IARC 2B, talc): final score ~6-7. Blue 1 is a petroleum-based dye FDA is actively phasing out — same class as food dyes. NEVER score Centrum at 3. The dye floor fires.
- One-A-Day Men's/Women's (synthetic vitamins, some dyes, conventional binders): final score ~5.
- Nature Made (USP Verified, minimal additives, no petroleum dyes): final score ~3.
- Vitafusion gummy vitamins (Red 40 + Yellow 5 in most flavors — petroleum dyes taken daily): final score ~6-7. Red 40 floor fires. NEVER score below 6 if dyes confirmed.
- Olly adult gummies (synthetic colorants in most, sugar): final score ~5-6.
- Flintstones Complete vitamins (Red 40 + Yellow 6 + Blue 1 + talc + titanium dioxide — taken daily by children): final score ~7-8. NEVER score below 7. Three dye floors fire. Child vulnerability flag. Highest-priority supplement calibration.
- SmartyPants gummies (no petroleum dyes, uses natural colors — turmeric, spirulina): final score ~3.
- Garden of Life/MegaFood whole-food vitamin: final score ~1-2
- Standard memory foam mattress (off-gassing): final score ~6
- Avocado organic latex mattress: final score ~1-2
- Conventional pillow (polyester fill): final score ~4 (synthetic polyester, daily 8hr face/skin contact)
- Organic latex pillow (GOLS certified): final score ~1-2 (natural rubber, no synthetics)
- Conventional nylon/polypropylene carpet: final score ~5-6 (VOC emissions from backing, microfiber shedding, likely stain treatment)
- Wool or organic cotton area rug (GOTS certified): final score ~2

FOOD HARD FLOORS — these must never be violated:
- Ultra-processed food with 3+ HIGH severity additives (multiple FDA-flagged dyes, BHA, nitrates): final score MINIMUM 7
- Ultra-processed food with 1-2 HIGH severity additives: final score MINIMUM 6
- Any food containing titanium dioxide: materials minimum 7 (EU food ban, IARC Group 2B)
- Any candy or snack with artificial petroleum-based dyes: materials minimum 7

Break-even (null if no clear swap): bottle→stainless:50, cup→reusable:40, wrap→beeswax:8, toothbrush→bamboo:1, pan→cast iron:200, pan→ceramic:150, container→glass:25, pads→menstrual cup:90, tampons→organic cotton:1, razor→safety:10, zipbag→silicone:15, bag→tote:130, shampoo→bar:6, clothing→natural:30, dryer sheets→wool balls:40, sunscreen→mineral:1, crayon→beeswax:1, yoga mat→natural rubber:200. Vehicles/electronics/appliances/natural materials=null.

Return ONLY valid JSON:
{"final_score":6,"materials_score":7,"usage_score":8,"packaging_score":3,"sustainability_score":2,"score_reasoning":"max 15 words citing specific research","refined_concerns":["max 12 words","max 12 words","max 12 words"],"summary":"max 30 words","confidence":"high","confidence_note":"max 10 words","break_even":{"uses":50,"alternative_name":"max 5 words","note":"max 15 words","source":"Lifecycle analysis estimate"}}`,
    800
  );
}

// ── SAFE PASS2 WRAPPER ────────────────────────────────────────
async function safePass2(productName, pass1Result, materialContext) {
  try {
    return await pass2(productName, pass1Result, materialContext);
  } catch (err) {
    console.error("Pass2 failed, using pass1 fallback:", err.message);
    return null;
  }
}

// ── ANALYZE ENDPOINT ──────────────────────────────────────────
// ── INTEL CARD ATTACHMENT — enrich scan results with relevant intelligence ──
// ── FUZZY DIMENSION ENRICHMENT — populate real scores from calibration substances ──
function enrichFuzzyDimensions(substances, category, midScore) {
  const subs = substances || [];
  if (!subs.length) return { mScore: Math.min(midScore, 5), uScore: Math.min(midScore, 4), sScore: 4, pkScore: 3, usageConcerns: [], sustainConcerns: [] };

  // ── Detect substance classes (shared across all categories) ──
  const hasPFAS = subs.some(s => /pfas|pfoa|pfos|dwr(?!.*free)|perfluor|fluoropoly/i.test(s)) && !subs.some(s => /pfas.free|free.*pfas/i.test(s));
  // hasSynthFiber now includes chemically regenerated cellulosics (viscose,
  // modal, bamboo viscose, cupro). These shed microfibers like synthetics
  // and require chemical solvent processing despite marketing as "natural".
  // Lyocell/tencel use a closed-loop process so they're NOT in this list —
  // they're the one regenerated cellulosic that scores closer to clean.
  const hasSynthFiber = subs.some(s => /\bnylon\b|polyester|spandex|elastane|lycra|acrylic|microfiber|\bviscose\b|\bmodal\b|\brayon\b|\bcupro\b|bamboo\s+viscose|bamboo\s+rayon/i.test(s));
  const hasAntimicrobial = subs.some(s => /silverescent|antimicrobial|silver.*nano|polygiene/i.test(s));
  const hasFormaldehyde = subs.some(s => /formaldehyde|wrinkle.free|wrinkle.resistant|DMDM hydantoin|quaternium.15|diazolidinyl/i.test(s));
  const hasAzoDyes = subs.some(s => /azo dye/i.test(s));
  const hasLead = subs.some(s => /\blead\b/i.test(s));
  const hasPVC = subs.some(s => /\bpvc\b|vinyl chloride/i.test(s));
  const hasFlameRetardant = subs.some(s => /flame retardant/i.test(s));
  const hasOrganic = subs.some(s => /organic cotton|gots|oeko.tex/i.test(s));
  // hasNatural specifically excludes bare "bamboo" and "bamboo viscose" —
  // 99% of commercially sold "bamboo" textile is bamboo viscose, a chemically
  // regenerated cellulosic that shouldn't be credited as a natural fiber.
  // Only bamboo-linen (mechanical process) would deserve natural treatment,
  // and it's rare enough we don't try to detect it.
  const hasNatural = subs.some(s => /merino wool|cashmere|\bcotton\b|linen|hemp|lyocell|tencel/i.test(s)) && !hasSynthFiber;
  const hasChemTreatment = subs.some(s => /chemical|chrome tanning|stone washing|distress/i.test(s));
  const hasMoisture = subs.some(s => /moisture.wicking/i.test(s));
  const hasGoreTex = subs.some(s => /gore.tex|ePE membrane/i.test(s));
  // Personal care specific detectors
  const hasOxybenzone = subs.some(s => /oxybenzone|benzophenone.3/i.test(s));
  const hasOctinoxate = subs.some(s => /octinoxate|octyl methoxycinn/i.test(s));
  const hasChemSunscreen = subs.some(s => /avobenzone|homosalate|octisalate|octocrylene/i.test(s));
  const hasSynthFragrance = subs.some(s => /synthetic fragrance|fragrance(?!.free)|parfum/i.test(s)) && !subs.some(s => /fragrance.free|no fragrance|unscented/i.test(s));
  const hasParabens = subs.some(s => /paraben|propylparaben|methylparaben|butylparaben/i.test(s));
  const hasSLS = subs.some(s => /\bSLS\b|sodium lauryl sulfate|sodium laureth|SLES/i.test(s));
  const hasAluminum = subs.some(s => /aluminum(?! foil)/i.test(s));
  const hasPhthalates = subs.some(s => /phthalate|DEHP|DBP|DEP/i.test(s));
  const hasPhenoxy = subs.some(s => /phenoxyethanol/i.test(s));
  const hasPetrolatum = subs.some(s => /petrolatum|petroleum|mineral oil/i.test(s));
  const hasDimethicone = subs.some(s => /dimethicone|silicone/i.test(s));
  const hasTiO2 = subs.some(s => /titanium dioxide/i.test(s));
  const hasPEG = subs.some(s => /\bPEG\b|PEG compound/i.test(s));
  const hasHydroquinone = subs.some(s => /hydroquinone/i.test(s));
  const hasTriclosan = subs.some(s => /triclosan/i.test(s));
  const hasPropyleneGlycol = subs.some(s => /propylene glycol/i.test(s));
  const isPC = category === "personal_care" || category === "skincare";
  const isBaby = category === "baby";
  const isClothing = category === "clothing";
  const isHome = category === "home" || category === "cleaning";

  // ── Materials score ──
  let mScore = 5;
  if (hasLead || hasHydroquinone) mScore = 9;
  else if (hasPVC) mScore = 8;
  else if (hasOxybenzone) mScore = 8;
  else if (hasPFAS || hasTriclosan) mScore = 7;
  else if (hasFlameRetardant || hasFormaldehyde) mScore = 7;
  else if (hasAzoDyes || hasPhthalates) mScore = 7;
  else if (hasOctinoxate || hasChemSunscreen) mScore = 6;
  else if (hasParabens && hasSynthFragrance) mScore = 6;
  else if (hasSynthFiber && hasChemTreatment) mScore = 6;
  else if (hasSynthFiber || hasSynthFragrance) mScore = 5;
  else if (hasSLS) mScore = 4;
  else if (hasPhenoxy) mScore = 4;
  else if (hasNatural && !hasOrganic) mScore = 3;
  else if (hasOrganic) mScore = 2;
  else if (!subs.length) mScore = 4;
  mScore = Math.max(mScore, Math.min(midScore, 5));

  // ── Usage score ──
  let uScore = 5;
  if (isPC || isBaby) {
    if (hasOxybenzone) uScore = 8;
    else if (hasHydroquinone || hasTriclosan) uScore = 7;
    else if (hasFormaldehyde || hasPhthalates) uScore = 7;
    else if (hasOctinoxate || hasChemSunscreen) uScore = 6;
    else if (hasParabens || hasAluminum) uScore = 6;
    else if (hasSynthFragrance && hasSLS) uScore = 6;
    else if (hasSynthFragrance) uScore = 5;
    else if (hasSLS) uScore = 4;
    else if (hasPhenoxy || hasPetrolatum) uScore = 4;
    else if (hasDimethicone) uScore = 3;
    else uScore = 3;
  } else if (isClothing) {
    if (hasLead || hasPVC) uScore = 8;
    else if (hasPFAS && hasAntimicrobial) uScore = 7;
    else if (hasPFAS || hasAntimicrobial || hasFlameRetardant) uScore = 6;
    else if (hasFormaldehyde) uScore = 6;
    else if (hasSynthFiber && hasMoisture) uScore = 5;
    else if (hasSynthFiber) uScore = 5;
    else if (hasOrganic) uScore = 1;
    else if (hasNatural) uScore = 2;
    // Empty-substances clothing calibration entries previously fell through
    // with uScore = 5 (the default init), which contradicted low-floor clean
    // brands like Pact Organic, Kotn, Tentree whose substances arrays are
    // empty by design. Trust the calibration floor — if the entry says 1-3,
    // the brand doesn't have concerning substances, so exposure is low.
    else if (midScore <= 3) uScore = 2;
    else if (midScore <= 5) uScore = 4;
  } else if (isHome) {
    if (hasSynthFragrance) uScore = 6;
    else uScore = 4;
  }

  // ── Sustainability score ──
  let sScore = 4;
  if (isClothing) {
    if (hasSynthFiber) sScore = 6;
    if (hasOrganic) sScore = 2;
    else if (hasNatural && !hasSynthFiber) sScore = 3;
    // Empty-substances low-floor calibration: trust the floor — these are
    // brands the calibration author scored clean for a reason (Fair Trade,
    // organic programs, supply-chain transparency). Default sScore = 4
    // previously dragged clean brands down.
    else if (!hasSynthFiber && midScore <= 3) sScore = 2;
  }

  const pkScore = 3;

  // ── Build usage concerns ──
  const usageConcerns = [];

  if (isPC || isBaby) {
    if (hasOxybenzone) usageConcerns.push("Oxybenzone (benzophenone-3) — detected in bloodstream after single application (Matta JAMA 2019). Endocrine disruptor, coral reef toxin. Banned in Hawaii and Key West");
    if (hasOctinoxate) usageConcerns.push("Octinoxate (octyl methoxycinnamate) — FDA systemic absorption confirmed. Endocrine disruption concern, coral reef harm. EU under review");
    if (hasChemSunscreen && !hasOxybenzone && !hasOctinoxate) usageConcerns.push("Chemical UV filters (avobenzone, homosalate, octisalate) — FDA found systemic absorption above safety threshold. Further safety data requested 2019");
    if (hasSynthFragrance) usageConcerns.push("Synthetic fragrance — contains undisclosed phthalates and VOCs (Steinemann 2017: 156 VOCs identified in 25 scented products). Absorbed through skin during daily use");
    if (hasFormaldehyde) usageConcerns.push("Formaldehyde-releasing preservative — IARC Group 1 carcinogen. DMDM hydantoin and quaternium-15 release formaldehyde over time. Contact allergen");
    if (hasParabens) usageConcerns.push("Parabens — endocrine disruptors that mimic estrogen. Detected in breast tissue (Darbre 2004). EU banned long-chain parabens (propyl, butyl) in cosmetics");
    if (hasAluminum) usageConcerns.push("Aluminum compounds — applied directly to skin near breast tissue daily. Dermal absorption confirmed. Debate on breast cancer link ongoing (Darbre 2005)");
    if (hasSLS) usageConcerns.push("Sodium lauryl sulfate (SLS) — skin barrier disruptor, known irritant. EWG moderate concern. Strips natural oils from skin and scalp");
    if (hasPhthalates) usageConcerns.push("Phthalates — anti-androgenic endocrine disruptors. Prenatal exposure linked to altered genital development (Swan 2005). Often hidden in 'fragrance'");
    if (hasPhenoxy) usageConcerns.push("Phenoxyethanol — preservative with CNS depression concern at high doses. EU limits concentration in baby products. FDA warned against use in nursing mothers");
    if (hasPetrolatum) usageConcerns.push("Petrolatum/mineral oil — petroleum-derived occlusive. EU requires PAH purity certification. Creates barrier on skin that may trap other chemicals");
    if (hasPEG) usageConcerns.push("PEG compounds — ethoxylated ingredients with potential 1,4-dioxane contamination (probable carcinogen). Enhances skin penetration of other ingredients");
    if (hasTiO2) usageConcerns.push("Titanium dioxide — IARC Group 2B possible carcinogen. EU banned as food additive (E171) in 2022. Inhalation concern in powder/spray products");
    if (hasTriclosan) usageConcerns.push("Triclosan — thyroid disruptor, banned in EU personal care products. Contributes to antibiotic resistance. FDA banned in antibacterial hand soap 2016");
    if (hasHydroquinone) usageConcerns.push("Hydroquinone — FDA proposed ban 2006. EU banned in leave-on cosmetics. DNA damage in cell studies, possible carcinogen. 35-45% systemic absorption");
    if (hasPropyleneGlycol) usageConcerns.push("Propylene glycol — penetration enhancer that increases skin absorption of other ingredients. Contact dermatitis in sensitive individuals");
    if (hasDimethicone && !usageConcerns.length) usageConcerns.push("Dimethicone (silicone) — creates film on skin/hair. Low toxicity but may trap other chemicals and impede skin breathing");
    if (isBaby && usageConcerns.length > 0) usageConcerns.push("Baby/child vulnerability — developing skin barrier is 5x more permeable than adult skin, increasing absorption of all topical chemicals");
  } else if (isClothing) {
    if (hasSynthFiber) usageConcerns.push("Synthetic microfiber shedding — nylon, polyester, and spandex shed microplastic fibers into water supply during washing, estimated 700,000 fibers per wash cycle (Browne 2011)");
    if (hasPFAS) usageConcerns.push("PFAS-based DWR (durable water repellent) coating — perfluoroalkyl compounds persist in the body and environment, linked to thyroid disruption and immune suppression. EU REACH restriction 2023");
    if (hasAntimicrobial) usageConcerns.push("Silver nanoparticle antimicrobial treatment — releases silver ions through skin contact and into waterways during washing. EU under regulatory review");
    if (hasFormaldehyde) usageConcerns.push("Formaldehyde-based wrinkle-resistant finish — IARC Group 1 carcinogen, contact allergen. EU textile standard EN ISO 14184 limits at 75ppm for skin contact");
    if (hasFlameRetardant) usageConcerns.push("Flame retardant chemical treatment — PBDE/TCEP/TDCPP class neurotoxins, banned in EU for children's sleepwear");
    if (hasLead) usageConcerns.push("Lead detected — neurotoxin with no safe threshold. Transfers via skin contact and hand-to-mouth pathway");
    if (hasPVC) usageConcerns.push("PVC (polyvinyl chloride) — contains phthalate plasticizers that leach through skin contact and off-gas VOCs");
    if (hasAzoDyes) usageConcerns.push("Azo dyes — can release carcinogenic aromatic amines through skin contact. EU Directive 2002/61/EC bans 22 azo colorants in skin-contact textiles");
    if (hasGoreTex) usageConcerns.push("Gore-Tex membrane — ePTFE membrane with DWR treatment. Historically PFAS-based, transitioning to PFAS-free in some lines");
    if (hasMoisture && !hasPFAS) usageConcerns.push("Moisture-wicking chemical finish — increases dermal absorption during exercise when skin is warm and pores are open");
    if (hasSynthFiber) usageConcerns.push("Direct skin contact with synthetic fabric — heat and perspiration increase absorption of chemical finishes");
    if (hasChemTreatment) usageConcerns.push("Chemical processing treatments — stone washing, distressing, or chrome tanning chemicals may leave residues on fabric");
  } else if (isHome) {
    if (hasSynthFragrance) usageConcerns.push("Synthetic fragrance VOCs — phthalates and toluene released during use. Inhalation exposure in enclosed spaces");
    if (hasFormaldehyde) usageConcerns.push("Formaldehyde off-gassing — IARC Group 1 carcinogen. Released from pressed wood, carpet, and cleaning products");
  }

  // ── Sustainability concerns ──
  const sustainConcerns = [];
  if (isClothing) {
    if (hasSynthFiber) sustainConcerns.push("Synthetic petroleum-derived fabric — microfiber pollution in waterways with every wash cycle, non-biodegradable");
    if (hasPFAS) sustainConcerns.push("PFAS forever chemicals — do not break down in the environment, bioaccumulate in wildlife and water systems");
    if (hasChemTreatment) sustainConcerns.push("Chemical processing — industrial textile treatments contribute to water pollution in manufacturing regions");
  }

  return { mScore, uScore, sScore, pkScore, usageConcerns, sustainConcerns, hasOrganic, hasNatural, hasSynthFiber, hasSynthFragrance };
}

// ── Build per-dimension labels + metadata for fuzzy calibration results ──
// The frontend DimensionDropdown shows label, frequency/type badges, packaging
// primary/end_of_life, sustainability circularity, etc. When calibration hits,
// these fields must be populated so users don't see empty dropdowns.
function buildFuzzyDimensionMeta(category, substances, entryReason, fd) {
  const isFood = ["food","food_beverage","beverage","restaurant","supplement","snack"].includes(category);
  const isFoodNotBev = ["food","food_beverage","restaurant","supplement","snack"].includes(category);
  const isBev = category === "beverage";
  const isPC = ["personal_care","skincare"].includes(category);
  const isBaby = category === "baby";
  const isClothing = category === "clothing";
  const isHome = ["home","cleaning"].includes(category);
  const isKitchen = category === "kitchen";
  const isToy = category === "toy";
  const isAccessory = category === "accessory";
  const isHomeFurnishing = category === "home_furnishing";

  const hasOrganic = fd.hasOrganic || /\borganic\b/i.test(substances.join(" ")) && !/conventional/i.test(substances.join(" "));
  const hasNatural = fd.hasNatural;
  const hasSynthFiber = fd.hasSynthFiber;
  const hasSynthFragrance = fd.hasSynthFragrance;

  // ── Materials label: prefer calibration reason, fall back to category template ──
  let materialsLabel = "";
  if (entryReason && entryReason.trim().length > 0) {
    // Trim to first sentence or 180 chars for a concise label
    const first = entryReason.split(/(?<=\.)\s+/)[0] || entryReason;
    materialsLabel = first.length > 180 ? first.slice(0, 177) + "..." : first;
  } else if (substances.length > 0) {
    materialsLabel = "Contains: " + substances.slice(0, 4).join(", ");
  } else {
    if (isFood) materialsLabel = "Ingredient profile per calibration data.";
    else if (isPC || isBaby) materialsLabel = "Formulation per calibration data.";
    else if (isClothing) materialsLabel = "Fabric and construction per calibration data.";
    else materialsLabel = "Material profile per calibration data.";
  }

  // ── Usage & Exposure meta ──
  let usageLabel = "", usageFreq = "daily", usageType = "ingestion", usageIntensity = null, vulnerable = false;
  if (isFoodNotBev) {
    usageLabel = "Ingested during consumption. Direct contact with digestive system.";
    usageFreq = "daily"; usageType = "ingestion";
  } else if (isBev) {
    usageLabel = "Ingested as a beverage. Frequent daily consumption common.";
    usageFreq = "daily"; usageType = "ingestion";
  } else if (isBaby) {
    usageLabel = "Applied to or used by an infant. Developing skin is more permeable than adult skin.";
    usageFreq = "daily"; usageType = "skin_contact"; usageIntensity = "leave-on"; vulnerable = true;
  } else if (isPC) {
    usageLabel = "Applied to skin or hair. Daily exposure across large body surface is common.";
    usageFreq = "daily"; usageType = "skin_contact"; usageIntensity = "leave-on";
  } else if (isClothing) {
    usageLabel = "Worn against skin. Heat and perspiration increase absorption of fabric chemicals.";
    // "weekly" understates clothing exposure — underwear, bras, socks,
    // activewear, and daily-basics are daily skin contact. Outerwear and
    // formalwear are weekly but those are minorities.
    usageFreq = "daily"; usageType = "skin_contact"; usageIntensity = "leave-on";
  } else if (isHome) {
    usageLabel = "Used for cleaning. Inhalation and residue on surfaces are the main exposure routes.";
    usageFreq = "weekly"; usageType = "inhalation";
  } else if (isKitchen) {
    usageLabel = "Direct food contact during cooking or storage. Heat can accelerate leaching.";
    usageFreq = "daily"; usageType = "ingestion";
  } else if (isToy) {
    usageLabel = "Handled daily by children. Mouthing and skin contact are common.";
    usageFreq = "daily"; usageType = "skin_contact"; vulnerable = true;
  } else if (isAccessory) {
    usageLabel = "Worn or carried in close contact with skin. Prolonged daily contact increases exposure to any leaching chemicals.";
    usageFreq = "daily"; usageType = "skin_contact";
  } else if (isHomeFurnishing) {
    usageLabel = "Indoor environment exposure from off-gassing and dust. Exposure accumulates over years of use.";
    usageFreq = "daily"; usageType = "inhalation";
  } else {
    // Generic fallback covering "other" category and anything unclassified
    usageLabel = "Typical consumer use — exposure routes depend on product type.";
    usageFreq = "weekly"; usageType = "skin_contact";
  }

  // ── Packaging meta ──
  let packagingLabel = "", pkgPrimary = "", pkgEndOfLife = "", pkgRefillable = false;
  if (isBev) {
    packagingLabel = "Drink container — typically plastic, aluminum, or glass.";
    pkgPrimary = "Bottle or can"; pkgEndOfLife = "recyclable";
  } else if (isFoodNotBev) {
    packagingLabel = "Food packaging — typically plastic film, paperboard, or a combination.";
    pkgPrimary = "Plastic or paperboard"; pkgEndOfLife = "mostly recyclable";
  } else if (isPC) {
    packagingLabel = "Cosmetic packaging — typically plastic bottle, tube, or jar.";
    pkgPrimary = "Plastic bottle or tube"; pkgEndOfLife = "often not recyclable";
  } else if (isBaby) {
    packagingLabel = "Baby product packaging — typically plastic film or bottle.";
    pkgPrimary = "Plastic"; pkgEndOfLife = "landfill in most regions";
  } else if (isHome) {
    packagingLabel = "Household packaging — typically plastic bottle or spray.";
    pkgPrimary = "Plastic bottle"; pkgEndOfLife = "recyclable";
  } else if (isKitchen) {
    packagingLabel = "Retail packaging — usually minimal for durable goods.";
    pkgPrimary = "Cardboard + plastic"; pkgEndOfLife = "mostly recyclable";
  } else if (isClothing) {
    packagingLabel = "Retail packaging — tag and thin polybag typical for clothing.";
    pkgPrimary = "Tag + polybag"; pkgEndOfLife = "limited recycling";
  } else if (isToy) {
    packagingLabel = "Toy retail packaging — often heavy plastic and cardboard.";
    pkgPrimary = "Plastic + cardboard"; pkgEndOfLife = "cardboard recyclable";
  } else if (isAccessory) {
    packagingLabel = "Accessory packaging — typically small box or pouch.";
    pkgPrimary = "Cardboard box"; pkgEndOfLife = "recyclable";
  } else if (isHomeFurnishing) {
    packagingLabel = "Furniture packaging — typically cardboard and protective foam.";
    pkgPrimary = "Cardboard + foam"; pkgEndOfLife = "cardboard recyclable";
  } else {
    packagingLabel = "Retail packaging — cardboard and plastic typical.";
    pkgPrimary = "Cardboard + plastic"; pkgEndOfLife = "partially recyclable";
  }

  // ── Sustainability meta ──
  let sustainabilityLabel = "", circularity = "", reusable = false, replacesSingleUse = false;
  if (isClothing) {
    if (hasOrganic) { sustainabilityLabel = "Organic fiber with lower lifecycle impact than conventional."; circularity = "biodegradable fiber"; }
    else if (hasSynthFiber) { sustainabilityLabel = "Synthetic fiber sheds microplastics and is petroleum-derived."; circularity = "microfiber shedding"; }
    else if (hasNatural) { sustainabilityLabel = "Natural fiber — lower environmental impact than synthetics."; circularity = "biodegradable fiber"; }
    else sustainabilityLabel = "Standard textile lifecycle impact.";
  } else if (isBev || isFoodNotBev) {
    sustainabilityLabel = "Single-use food packaging. Recycle the container when possible.";
    circularity = "single-use";
  } else if (isPC || isBaby) {
    sustainabilityLabel = "Typical personal care packaging is single-use and often not recyclable in practice.";
    circularity = "single-use";
  } else if (isHome) {
    if (hasSynthFragrance) { sustainabilityLabel = "Synthetic fragrance VOCs persist in indoor air and waterways."; circularity = "single-use"; }
    else { sustainabilityLabel = "Household cleaning product — refillable versions are more sustainable."; circularity = "refillable options exist"; }
  } else if (isKitchen) {
    sustainabilityLabel = "Durable kitchen good — designed for long-term use.";
    circularity = "long lifespan"; reusable = true;
  } else if (isToy) {
    sustainabilityLabel = "Plastic toys have limited recyclability. Wooden and fabric toys are more sustainable.";
    circularity = "limited recyclability";
  } else if (isHomeFurnishing) {
    sustainabilityLabel = "Furniture lifecycle impact depends on materials and longevity.";
    circularity = "long lifespan"; reusable = true;
  } else if (isAccessory) {
    sustainabilityLabel = "Accessory lifecycle depends on materials — metal lasts generations, plastic degrades quickly.";
    circularity = "varies by material";
  } else {
    sustainabilityLabel = "Lifecycle impact varies with product design and use.";
    circularity = "standard lifecycle";
  }

  return {
    materials:      { label: materialsLabel },
    usage_exposure: { label: usageLabel, frequency: usageFreq, type: usageType, intensity: usageIntensity, vulnerable },
    packaging:      { label: packagingLabel, primary: pkgPrimary, end_of_life: pkgEndOfLife, refillable: pkgRefillable },
    sustainability: { label: sustainabilityLabel, circularity, reusable, replaces_single_use: replacesSingleUse },
  };
}

// Build the full dimensions object for a fuzzy calibration hit.
// Always returns label + meta for each dimension — no more blank dropdowns.
function buildFuzzyDimensions(entry, category, midScore) {
  const substances = entry.substances || [];
  const fd = enrichFuzzyDimensions(substances, category, midScore);
  const meta = buildFuzzyDimensionMeta(category, substances, entry.reason || "", fd);

  // Entry-level overrides let calibration entries that know their actual
  // packaging / usage / sustainability profile (refill systems, compostable,
  // Forever Tin, etc.) skip the generic category fallback. Any unset field
  // falls back to the category-level meta. Accepts either snake_case or
  // camelCase keys for readability.
  const pkgOver  = entry.packaging || {};
  const useOver  = entry.usage || entry.usage_exposure || {};
  const sustOver = entry.sustainability || {};
  const matOver  = entry.materials || {};
  const pick = (a, b) => (a !== undefined ? a : b);

  // ── Calibration-to-dimension reconciliation (2026-04-23) ───────────
  //
  // The generic enrichFuzzyDimensions scorer doesn't know about brand
  // certifications (Bluesign, OEKO-TEX, GOTS, Fair Trade, etc.). It sees
  // "recycled polyester + elastane" and scores materials 5 / sustainability 6
  // for microfiber shedding, regardless of whether the specific SKU has
  // verified clean credentials. Calibration floor/ceiling clamps the
  // HEADLINE score correctly (e.g. Vuori Performance Jogger midpoint 3)
  // but the dimension rows still read 5/5/3/6 — users do the weighted
  // math, get ~5, and see a 3 that doesn't reconcile.
  //
  // Fix: for every calibrated entry, cap or floor each dimension at the
  // calibration midpoint so the dimensions always reconcile with the
  // headline. Clean calibration (floor ≤ 3) caps all dimensions DOWN to
  // the midpoint; concerning calibration (floor ≥ 5) floors all dimensions
  // UP to the midpoint. Middle tier (floor 4) untouched.
  //
  // Direction is preserved — if a dimension is already cleaner than the
  // clamp direction, it stays. The rule only pulls OUT-OF-RANGE dimensions
  // toward the calibrated signal, never in the wrong direction.
  //
  // Explicit entry-level dimension overrides (entry.materials.score,
  // entry.packaging.score, entry.usage.score, entry.sustainability.score)
  // bypass reconciliation — if the calibration author knows what a specific
  // dimension should be, they can pin it directly.
  const floor = entry.floor, ceiling = entry.ceiling;
  const reconcile = (base, override) => {
    if (override !== undefined) return override;  // explicit pin wins
    if (floor == null || ceiling == null) return base;
    const mid = Math.round((floor + ceiling) / 2);
    if (floor <= 3) return Math.min(base, mid);   // clean: cap down
    if (floor >= 5) return Math.max(base, mid);   // concerning: floor up
    return base;                                  // middle tier untouched
  };

  return {
    materials: {
      score: reconcile(fd.mScore, matOver.score),
      concerns: substances,
      label: matOver.label || meta.materials.label,
    },
    usage_exposure: {
      score: reconcile(fd.uScore, useOver.score),
      concerns: fd.usageConcerns,
      label: useOver.label || meta.usage_exposure.label,
      frequency: useOver.frequency || meta.usage_exposure.frequency,
      type: useOver.type || meta.usage_exposure.type,
      intensity: pick(useOver.intensity, meta.usage_exposure.intensity),
      vulnerable: pick(useOver.vulnerable, meta.usage_exposure.vulnerable),
    },
    packaging: {
      score: reconcile(fd.pkScore, pkgOver.score),
      concerns: [],
      label: pkgOver.label || meta.packaging.label,
      primary: pkgOver.primary || meta.packaging.primary,
      end_of_life: pkgOver.endOfLife || pkgOver.end_of_life || meta.packaging.end_of_life,
      refillable: pick(pkgOver.refillable, meta.packaging.refillable),
    },
    sustainability: {
      score: reconcile(fd.sScore, sustOver.score),
      concerns: fd.sustainConcerns,
      label: sustOver.label || meta.sustainability.label,
      circularity: sustOver.circularity || meta.sustainability.circularity,
      reusable: pick(sustOver.reusable, meta.sustainability.reusable),
      replaces_single_use: pick(sustOver.replacesSingleUse, pick(sustOver.replaces_single_use, meta.sustainability.replaces_single_use)),
    },
  };
}

// ── Intelligence card cache (avoids Supabase query on every scan) ──
let intelCardsCache = null;
let intelCardsCacheAt = 0;
const INTEL_CARDS_TTL = 120000; // 2 minutes

async function getActiveIntelCards() {
  const now = Date.now();
  if (intelCardsCache && now - intelCardsCacheAt < INTEL_CARDS_TTL) return intelCardsCache;
  if (!supabaseAdmin) return [];
  try {
    const isoNow = new Date().toISOString();
    const { data: cards } = await supabaseAdmin.from("intelligence_cards").select("id,headline,body,label,label_color,action_text,action_url,ingredient_triggers,category_triggers,product_families,specific_products,source_name,priority").eq("active", true).or(`expires_at.is.null,expires_at.gt.${isoNow}`).order("priority", { ascending: false }).limit(20);
    intelCardsCache = cards || [];
    intelCardsCacheAt = now;
    return intelCardsCache;
  } catch (e) {
    console.warn("[Intel] Card fetch failed:", e.message);
    return intelCardsCache || [];
  }
}

// ── User scan-history cache (60s TTL per userId) ──
// Keyed by userId. Path C of intel card matching intersects the user's
// distinct product_families from the last 30 days with each card's
// product_families. Cached briefly so a user scanning multiple products in
// succession doesn't trigger a Supabase roundtrip per scan.
const USER_HISTORY_TTL = 60 * 1000;
const USER_HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const userHistoryCache = new Map();

async function getUserRecentFamilies(userId) {
  if (!userId || !supabaseAdmin) return null;
  const now = Date.now();
  const cached = userHistoryCache.get(userId);
  if (cached && now - cached.at < USER_HISTORY_TTL) return cached.families;
  try {
    const cutoff = new Date(now - USER_HISTORY_WINDOW_MS).toISOString();
    const { data, error } = await supabaseAdmin
      .from("scans")
      .select("result_json")
      .eq("user_id", userId)
      .gte("scanned_at", cutoff)
      .limit(500);
    if (error) throw error;
    const families = new Set();
    for (const row of data || []) {
      const fam = row?.result_json?.product_family;
      if (typeof fam === "string" && fam) families.add(fam);
    }
    userHistoryCache.set(userId, { families, at: now });
    return families;
  } catch (e) {
    console.warn("[Intel] User history lookup failed:", e.message);
    return null;
  }
}

async function attachIntelCards(result, userId) {
  try {
    const cards = await getActiveIntelCards();
    if (!cards.length) return result;
    const userFamilies = await getUserRecentFamilies(userId);
    // Match ingredient_triggers against flagged_substances, NOT ingredient_list.
    //
    // ingredient_list is the raw "what's in it" list which frequently contains
    // negated phrases like "lead-free", "BPA-free", "arsenic-tested". The
    // word-boundary regex the matcher uses (\blead\b etc.) matches "lead-free"
    // because the hyphen is a word boundary — so cards trigger on products
    // that explicitly DO NOT contain the substance. Water bottle marketed as
    // "lead-free" fires a card about lead in rice.
    //
    // flagged_substances is the authoritative list of substances we've
    // determined are actual CONCERNS for this product — survived substance
    // floors, AI flagging, calibration. A lead-free water bottle has lead in
    // ingredient_list but NOT in flagged_substances. That's the right signal.
    const triggerSource = Array.isArray(result.flagged_substances) && result.flagged_substances.length > 0
      ? result.flagged_substances
      : (Array.isArray(result.ingredient_list) ? result.ingredient_list : []);
    const matching = filterRelevantCards(cards, {
      productFamily: result.product_family || null,
      productName:   result.product_name   || "",
      ingredientList: triggerSource,
      userFamilies,
      limit: 3,
    });
    if (matching.length > 0) result.intelligence_cards = matching;
  } catch (e) { console.warn("[Intel] Card attachment failed:", e.message); }
  return result;
}

// ── Text search: verified-source match picker ─────────────────
// /search surfaces the highest-trust matches for a typed query so the user
// can pick a known-verified product instead of waiting for the cascade. A tap
// dispatches /analyze with a productId, which short-circuits straight to the
// pre-verified data (calibration entries, prior OFF-verified scans) — no
// cascade, no API spend.
//
// Sources:
//   - calibration:<key>  → in-memory CALIBRATION Map (3,039+ known products)
//   - scan:<uuid>        → Supabase scans row with ingredient_source populated
//
// Fuzzy matching: case-insensitive substring first, Jaccard-trigram similarity
// fallback (threshold 0.3) when fewer than 5 substring hits. Trigram is in
// memory for calibration, pg_trgm in Supabase for scans (requires the
// pg_trgm extension — `CREATE EXTENSION IF NOT EXISTS pg_trgm;`).
function buildTrigrams(str) {
  const padded = "  " + (str || "").toLowerCase().trim() + "  ";
  const out = new Set();
  for (let i = 0; i <= padded.length - 3; i++) out.add(padded.slice(i, i + 3));
  return out;
}
function trigramSimilarity(a, b) {
  const ta = buildTrigrams(a);
  const tb = buildTrigrams(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union ? inter / union : 0;
}

app.get("/search", async (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  const rawQ = typeof req.query.q === "string" ? req.query.q : "";
  const userId = typeof req.query.userId === "string" && req.query.userId ? req.query.userId : null;
  const q = rawQ.trim().toLowerCase().replace(/\s+/g, " ");
  if (q.length < 3 || q.length > 100) {
    return res.json({ query: rawQ, matches: [], total_count: 0 });
  }

  const MATCH_CAP = 5;
  const TRIGRAM_THRESHOLD = 0.3;

  // ── Calibration substring scan (in-memory, ~3k entries) ──
  const calibSubstring = [];
  for (const c of calibrationAllEntries) {
    if (c.key.includes(q) || c.keyNoApos.includes(q)) {
      calibSubstring.push({ c, sim: c.key === q ? 1 : 0.95 });
    }
  }
  calibSubstring.sort((a, b) => b.sim - a.sim || a.c.key.length - b.c.key.length);

  // ── Scans substring (Supabase) — prefer user's own scans ──
  let scanSubstring = [];
  if (supabaseAdmin) {
    try {
      const { data } = await supabaseAdmin
        .from("scans")
        .select("id,product_name,user_id,result_json,scanned_at")
        .ilike("product_name", `%${q}%`)
        .not("result_json->>ingredient_source", "is", null)
        .gte("scanned_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
        .order("scanned_at", { ascending: false })
        .limit(20);
      scanSubstring = data || [];
    } catch (e) {
      console.warn("[Search] scans substring query failed:", e.message);
    }
  }

  // ── Dedupe: calibration wins over scans on same normalized name ──
  const taken = new Set();
  const matches = [];

  for (const { c } of calibSubstring) {
    if (matches.length >= MATCH_CAP) break;
    const entry = c.entry;
    const midScore = Math.round((entry.floor + entry.ceiling) / 2);
    matches.push({
      id: `calibration:${c.key}`,
      display_name: toTitleCase(c.key),
      source: "calibration",
      source_label: "Verified formula",
      score_preview: midScore,
      category: entry.category || "other",
      match_type: "substring",
      similarity: 1,
    });
    taken.add(c.key);
  }

  // Dedupe scans by product_name (case-insensitive)
  const seenScanNames = new Set();
  const prioritizedScans = scanSubstring
    .map(s => ({ ...s, _owned: s.user_id === userId }))
    .sort((a, b) => {
      if (a._owned !== b._owned) return a._owned ? -1 : 1;
      return new Date(b.scanned_at) - new Date(a.scanned_at);
    });

  for (const s of prioritizedScans) {
    if (matches.length >= MATCH_CAP) break;
    const normName = normalise(s.product_name || "");
    if (!normName || taken.has(normName) || seenScanNames.has(normName)) continue;
    seenScanNames.add(normName);
    const score = s.result_json?.overall_score ?? s.result_json?.score ?? null;
    matches.push({
      id: `scan:${s.id}`,
      display_name: s.product_name,
      source: s._owned ? "own_scan" : "other_scan",
      source_label: s._owned ? `Your scan from ${relativeTime(s.scanned_at)}` : "Recent verified scan",
      score_preview: score,
      category: s.result_json?.category || "other",
      match_type: "substring",
      similarity: 1,
      scanned_at: s.scanned_at,
    });
  }

  // ── Trigram fallback when substring matches are sparse ──
  if (matches.length < MATCH_CAP) {
    // Calibration trigram
    const calibTrigram = [];
    for (const c of calibrationAllEntries) {
      if (taken.has(c.key)) continue;
      if (c.key.includes(q) || c.keyNoApos.includes(q)) continue; // already handled
      const sim = trigramSimilarity(q, c.key);
      if (sim >= TRIGRAM_THRESHOLD) calibTrigram.push({ c, sim });
    }
    calibTrigram.sort((a, b) => b.sim - a.sim);

    for (const { c, sim } of calibTrigram) {
      if (matches.length >= MATCH_CAP) break;
      const entry = c.entry;
      const midScore = Math.round((entry.floor + entry.ceiling) / 2);
      matches.push({
        id: `calibration:${c.key}`,
        display_name: toTitleCase(c.key),
        source: "calibration",
        source_label: "Verified formula",
        score_preview: midScore,
        category: entry.category || "other",
        match_type: "trigram",
        similarity: Math.round(sim * 100) / 100,
      });
      taken.add(c.key);
    }

    // Scans trigram via pg_trgm similarity operator (requires the extension)
    if (matches.length < MATCH_CAP && supabaseAdmin) {
      try {
        const { data } = await supabaseAdmin
          .rpc("scans_trigram_search", { q, threshold: TRIGRAM_THRESHOLD, user_id_arg: userId, lim: 10 });
        for (const row of data || []) {
          if (matches.length >= MATCH_CAP) break;
          const normName = normalise(row.product_name || "");
          if (!normName || taken.has(normName) || seenScanNames.has(normName)) continue;
          seenScanNames.add(normName);
          const owned = row.user_id === userId;
          const score = row.result_json?.overall_score ?? row.result_json?.score ?? null;
          matches.push({
            id: `scan:${row.id}`,
            display_name: row.product_name,
            source: owned ? "own_scan" : "other_scan",
            source_label: owned ? `Your scan from ${relativeTime(row.scanned_at)}` : "Recent verified scan",
            score_preview: score,
            category: row.result_json?.category || "other",
            match_type: "trigram",
            similarity: typeof row.sim === "number" ? Math.round(row.sim * 100) / 100 : null,
            scanned_at: row.scanned_at,
          });
        }
      } catch (e) {
        // Expected to fail until pg_trgm extension is enabled and the RPC is created.
        // Falls back silently — substring results still serve the common case.
        if (!e.message?.includes("scans_trigram_search")) {
          console.warn("[Search] scans trigram RPC failed:", e.message);
        }
      }
    }
  }

  log.info("text_search", {
    query: q,
    userId,
    match_count: matches.length,
    has_calibration_matches: matches.some(m => m.source === "calibration"),
    has_own_scan_matches: matches.some(m => m.source === "own_scan"),
    has_other_scan_matches: matches.some(m => m.source === "other_scan"),
    zero_matches: matches.length === 0,
  });

  return res.json({
    query: rawQ,
    matches,
    total_count: matches.length,
  });
});

function toTitleCase(str) {
  return (str || "").replace(/\w\S*/g, s => s.charAt(0).toUpperCase() + s.slice(1));
}

function relativeTime(iso) {
  try {
    const t = new Date(iso).getTime();
    if (isNaN(t)) return "recently";
    const diff = Date.now() - t;
    const day = 86400000;
    if (diff < day) return "today";
    if (diff < 2 * day) return "yesterday";
    if (diff < 7 * day) return `${Math.floor(diff / day)} days ago`;
    if (diff < 30 * day) return `${Math.floor(diff / (7 * day))} weeks ago`;
    return `${Math.floor(diff / (30 * day))} months ago`;
  } catch { return "recently"; }
}

app.post("/analyze", rateLimit, async (req, res) => {
  // Prevent service workers and browsers from caching API responses
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.set("Pragma", "no-cache");
  // Streaming opt-in via Accept: application/x-ndjson. Slow paths emit
  // identified/scored/alternatives events as they complete; fast paths
  // just call stream.complete with the full payload.
  const stream = makeStreamHelper(req, res);
  let { query, image, mediaType, userId, productId, identificationId } = req.body;

  // If the client sent an Authorization header, verify it and replace the
  // client-supplied userId with the one from the JWT. This prevents a caller
  // from resetting someone else's scan_count (or their own, by rotating
  // fabricated UUIDs) to bypass the free-tier paywall.
  //
  // Anonymous scans are still supported — clients that don't pass an
  // Authorization header just skip the per-user counter entirely.
  if (supabaseAdmin) {
    const header = req.headers.authorization || "";
    const m = header.match(/^Bearer\s+(.+)$/i);
    if (m) {
      try {
        const { data, error } = await supabaseAdmin.auth.getUser(m[1]);
        if (!error && data?.user?.id) {
          userId = data.user.id;
        } else {
          userId = null;  // invalid token — don't trust the body's userId either
        }
      } catch { userId = null; }
    } else {
      userId = null;  // no auth header → treat as anonymous regardless of body
    }
  }

  // Increment server-side scan count for logged-in users (fire-and-forget — not on critical path)
  // Uses an atomic RPC so two concurrent scans don't both read the same count
  // and each write +1 (producing +1 total instead of +2). The RPC must be
  // created once via Supabase SQL:
  //
  //   CREATE OR REPLACE FUNCTION increment_scan_count(uid uuid)
  //   RETURNS void LANGUAGE sql AS $$
  //     UPDATE profiles SET scan_count = COALESCE(scan_count, 0) + 1 WHERE id = uid;
  //   $$;
  //
  // If the RPC isn't present yet, fall back to the non-atomic select+upsert.
  if (userId && supabaseAdmin) {
    (async () => {
      try {
        const { error: rpcErr } = await supabaseAdmin.rpc("increment_scan_count", { uid: userId });
        if (rpcErr) {
          // RPC not yet installed — fall back to non-atomic path. Safe to
          // remove this branch once the migration lands on the prod Supabase.
          const { data: profile } = await supabaseAdmin.from("profiles").select("scan_count").eq("id", userId).single();
          const newCount = (profile?.scan_count || 0) + 1;
          await supabaseAdmin.from("profiles").upsert({ id: userId, scan_count: newCount }, { onConflict: "id" });
        }
      } catch(e) { console.warn("scan_count increment failed:", e.message); }
    })();
  }

  // ── productId bypass: /search match picks ──
  // `calibration:<key>` and `scan:<uuid>` carry pre-verified data so they
  // short-circuit straight to a result — no cascade, no API spend.
  if (typeof productId === "string" && productId.length > 0 && productId.length < 200) {
    try {
      if (productId.startsWith("calibration:")) {
        const key = productId.slice("calibration:".length);
        const entry = CALIBRATION.get(key);
        if (!entry) return stream.errorJson(404, { error: "Unknown calibration key" });
        const productName = toTitleCase(key);
        const cat = entry.category || "other";
        const midScore = Math.round((entry.floor + entry.ceiling) / 2);
        const kidsFloor = entry.kidsFloor || entry.floor;
        const kidsCeil  = entry.kidsCeiling || entry.ceiling;
        const kidsMid   = Math.round((kidsFloor + kidsCeil) / 2);
        const concernsText = (entry.substances || []).join(" ");
        const safety = computeSafetyScores(midScore, cat, productName, { flagged_substances: entry.substances || [] }, [], concernsText);
        const alts = serializeAlternatives(
          filterDbAlternatives(
            findAlternatives(productName, cat, 3, productName),
            cat, productName, midScore
          ),
          cat
        );
        const result = applyProductCalibration({
          product_name: productName,
          score: midScore, overall_score: midScore,
          category: cat,
          confidence: entry.confidence || "high",
          is_child_product: safety.isChild,
          child_score: entry.kidsFloor ? kidsMid : safety.childScore,
          child_bumps: safety.childBumps || [],
          pregnancy_score: safety.pregnancyScore,
          pregnancy_bumps: safety.pregnancyBumps || [],
          dimensions: buildFuzzyDimensions(entry, cat, midScore),
          concerns: entry.substances || [],
          flagged_substances: entry.substances || [],
          summary: entry.reason || "",
          nutrition: entry.nutrition || null,
          alternatives: alts, ai_alternatives: [],
          product_family: classifyProductFamily(productName, entry.substances || [], cat),
          category_score_context: CATEGORY_CONTEXT[cat] || CATEGORY_CONTEXT.other,
          ingredient_source: "calibration",
          ingredient_confidence: entry.confidence || "high",
          ingredient_verified_at: new Date().toISOString(),
          ingredient_source_url: null,
          source: "calibration",
          source_label: "Verified formula",
          source_confidence: null,
        });
        await attachIntelCards(result, userId);
        log.info("product_id_resolve", { productId, source: "calibration", score: midScore });
        return stream.complete({ ...result, cached: false });
      }

      if (productId.startsWith("scan:")) {
        if (!supabaseAdmin) return stream.errorJson(503, { error: "Scan lookup unavailable" });
        const scanId = productId.slice("scan:".length);
        // UUID sanity check — reject anything that isn't a plausible uuid format
        if (!/^[0-9a-f-]{30,40}$/i.test(scanId)) return stream.errorJson(400, { error: "Invalid scan id" });
        const { data, error } = await supabaseAdmin
          .from("scans")
          .select("result_json,product_name,scanned_at")
          .eq("id", scanId)
          .single();
        if (error || !data?.result_json) return stream.errorJson(404, { error: "Scan not found" });
        const result = { ...data.result_json };
        // Rewrite source to signal the user is seeing a reused scan, not a fresh verification
        result.ingredient_source = "previous_scan";
        result.ingredient_verified_at = data.scanned_at || result.ingredient_verified_at;
        result.ingredient_source_url = null;
        result.source = "previous_scan";
        result.source_label = "From a previous Partiqule scan";
        result.source_confidence = null;
        await attachIntelCards(result, userId);
        log.info("product_id_resolve", { productId, source: "scan" });
        return stream.complete({ ...result, cached: false });
      }

      return stream.errorJson(400, { error: "Unknown productId scheme" });
    } catch (e) {
      console.warn("[productId] resolve failed:", e.message);
      return stream.errorJson(500, { error: "productId resolve failed" });
    }
  }

  // ── VISION CONTRACT V2 (feature-flagged) ────────────────────────
  // Identify from photo, verify ingredients via the cascade, then score.
  // Falls through to the legacy `if (image)` block below when the flag is off.
  // Also handles `{ identificationId }` resume POSTs from the confirmation
  // modal — those skip vision entirely and run only the cascade + scoring.
  if (isVisionContractV2() && (image || identificationId)) {
    try {
      // Step 1: obtain identification. Either fresh from vision, or resumed
      // from the in-memory store via the confirmation round-trip.
      let identification = null;
      let fromResume = false;
      if (identificationId) {
        identification = getIdentification(identificationId);
        if (!identification) {
          return stream.errorJson(410, { error: "Identification expired, please rescan" });
        }
        fromResume = true;
      } else {
        identification = await callClaudeVisionIdentify(
          image, mediaType || "image/jpeg",
          { checkApiBudget, incrementApiCount },
        );
        log.info("vision_identification_result", {
          product_name: identification.product_name,
          brand: identification.brand,
          confidence: identification.confidence,
          label_legibility: identification.label_legibility,
          label_ingredient_count: (identification.label_ingredients || []).length,
          ai_category: identification.category,
        });
        log.info("vision_label_ingredients", {
          product_name: identification.product_name,
          brand: identification.brand,
          label_ingredients: identification.label_ingredients || [],
        });
      }

      const productName = identification.product_name || "Scanned product";

      // Step 2: confidence gate. Only applies on fresh identify — a resumed
      // identification is already user-confirmed.
      //
      // Policy: if vision returned ANY usable product_name, score it. The
      // cascade + Tier 5 already handle the "no verified ingredients" case
      // honestly — refusing on top of that punishes the user for a cascade
      // miss we've already designed around. Refuse only when vision genuinely
      // could not identify a product (empty / placeholder name, or confidence
      // so low it amounts to a guess).
      const hasUsableName = productName && productName !== "Scanned product" && productName.trim().length >= 2;
      if (!fromResume) {
        if (!hasUsableName || identification.confidence < 0.30) {
          log.info("vision_refusal", {
            product_name: productName,
            reason: "low_confidence",
            confidence: identification.confidence,
            has_usable_name: hasUsableName,
          });
          return stream.complete({
            status: "need_better_photo",
            identified: { product_name: productName, confidence: identification.confidence },
            reason: "low_confidence",
            message: "I cannot tell what product this is. Try another angle with better lighting.",
          });
        }
        if (identification.confidence < 0.45) {
          const newId = putIdentification(identification);
          return stream.complete({
            status: "needs_confirmation",
            identificationId: newId,
            identified: {
              product_name: productName,
              brand: identification.brand,
              variant: identification.variant,
              confidence: identification.confidence,
            },
            message: `I see this looks like ${productName}. Is that right?`,
          });
        }
      }

      // Step 3: cascade — find verified ingredients from external sources.
      // Order: CALIBRATION exact → fuzzy-cal (vision-only Tier 1.5) → name-key cache →
      // Open Facts text search → web extract → Tier 5 category-prior best guess.
      // Identical behavior to the text-search cascade: once the photo has
      // identified the product, scoring follows the same product-name lookup
      // path as if the user had typed the name. Tier 5 ensures every identified
      // product gets a score — with an honest "best guess" label when no
      // external source verified the formula.
      let visionCat = identification.category || detectCategoryFast(productName) || "other";
      let cascadeHit = null;

      const calKey = normalise(productName);
      const calExact = CALIBRATION.get(calKey) || CALIBRATION.get(productName.toLowerCase().trim());
      if (calExact) {
        cascadeHit = { tier: "calibration", entry: calExact, ingredients: (calExact.substances || []).join(", ") };
      }
      if (!cascadeHit) {
        const fuzzy = fuzzyCalibrationLookup(productName);
        if (fuzzy) {
          cascadeHit = { tier: "fuzzy_calibration", entry: fuzzy.entry, ingredients: (fuzzy.entry.substances || []).join(", ") };
        }
      }
      // Calibration category wins over detected category for weight selection.
      // Fixes a class of bug where pajamas (detected as baby via regex) have
      // calibration entries marked "clothing", and the baby formula has
      // sustainability weight 0 — which drops microfiber/FR penalties that
      // only apply in the clothing formula. More generally, calibration is
      // the authoritative source of truth when it has an opinion.
      if (cascadeHit?.entry?.category && CATEGORY_AVERAGES[cascadeHit.entry.category]) {
        if (visionCat !== cascadeHit.entry.category) {
          console.log(`[vision] calibration category override: ${visionCat} → ${cascadeHit.entry.category} for "${productName}"`);
          visionCat = cascadeHit.entry.category;
        }
      }
      // Build the brand-aware query for cascade lookups. When vision
      // extracted a brand, prepend it to the product name so Tier 3
      // and Tier 4 search for "Nike Dri-FIT 2pc" instead of "Boys
      // Jogger". Generic queries match generic products. This is
      // Bug 1 from the 2026-04 diagnosis.
      const visionBrand = (identification.brand || "").trim();
      const cascadeQuery = visionBrand &&
        !productName.toLowerCase().includes(visionBrand.toLowerCase())
        ? `${visionBrand} ${productName}`
        : productName;
      if (cascadeQuery !== productName) {
        log.info("vision_cascade_query_branded", {
          product_name: productName,
          brand: visionBrand,
          query: cascadeQuery,
        });
      }

      if (!cascadeHit) {
        const nameKey = cacheKey(cascadeQuery, visionCat);
        const nCached = await cacheGet(nameKey);
        if (nCached && !evictIfPrePass0(nCached, nameKey) && nCached.dimensions && !nCached._preloaded) {
          log.info("vision_cascade_cache_hit", { product_name: productName });
          await attachIntelCards(nCached, userId);
          return stream.complete({ ...nCached, cached: true });
        }
      }
      if (!cascadeHit) {
        const t3 = await tier3OpenFactsTextSearch(cascadeQuery);
        if (t3) cascadeHit = {
          tier: "open_facts", source: t3.source, ingredients: t3.ingredients,
          sourceUrl: t3.sourceUrl, sourceLabel: t3.sourceLabel, brand: t3.brand,
          productData: t3.rawProduct,
        };
      }
      if (!cascadeHit) {
        try {
          const t4 = await tier4WebExtract(cascadeQuery, {
            checkApiBudget,
            incrementApiCount,
            expectedBrand: visionBrand || null,
          });
          if (t4) cascadeHit = {
            tier: "web_search", source: "web_search", ingredients: t4.ingredients,
            sourceLabel: t4.sourceLabel, brand: t4.brand, sourceDomain: t4.sourceDomain,
          };
        } catch (e) { console.warn("[vision_v2] tier4 failed:", e.message); }
      }

      // Step 4a: cascade returned calibration entry → calibration scoring path.
      if (cascadeHit && (cascadeHit.tier === "calibration" || cascadeHit.tier === "fuzzy_calibration")) {
        const entry = cascadeHit.entry;
        const midScore = Math.round((entry.floor + entry.ceiling) / 2);
        const concernsText = (entry.substances || []).join(" ");
        const safety = computeSafetyScores(midScore, entry.category || visionCat, productName, { flagged_substances: entry.substances || [] }, [], concernsText);
        const kidsFloor = entry.kidsFloor || entry.floor;
        const kidsCeil  = entry.kidsCeiling || entry.ceiling;
        const kidsMid   = Math.round((kidsFloor + kidsCeil) / 2);
        const alts = serializeAlternatives(
          filterDbAlternatives(findAlternatives(productName, entry.category || visionCat, 5, productName), entry.category || visionCat, productName, midScore),
          entry.category || visionCat,
        );
        const recon = reconcileIngredients(identification.label_ingredients, entry.substances || []);
        if (!recon.agreed && (identification.label_ingredients || []).length > 0) {
          log.info("vision_cascade_disagreement", {
            product_name: productName,
            tier: cascadeHit.tier,
            agreement_pct: recon.agreementPct,
            label_only: recon.labelOnly.slice(0, 6),
            cascade_only: recon.cascadeOnly.slice(0, 6),
            used: "cascade",
          });
        }
        const result = applyProductCalibration({
          product_name: productName,
          score: midScore, overall_score: midScore,
          category: entry.category || visionCat,
          confidence: entry.confidence || "high",
          is_child_product: safety.isChild,
          child_score: entry.kidsFloor ? kidsMid : safety.childScore,
          child_bumps: safety.childBumps || [],
          pregnancy_score: safety.pregnancyScore,
          pregnancy_bumps: safety.pregnancyBumps || [],
          dimensions: buildFuzzyDimensions(entry, entry.category || visionCat, midScore),
          concerns: entry.substances || [],
          flagged_substances: entry.substances || [],
          summary: entry.reason || "",
          alternatives: alts, ai_alternatives: [],
          nutrition: entry.nutrition || null,
          ingredient_list: identification.label_ingredients || [],
          product_family: classifyProductFamily(productName, identification.label_ingredients, entry.category || visionCat),
          category_score_context: CATEGORY_CONTEXT[entry.category || visionCat] || CATEGORY_CONTEXT.other,
          ingredient_source: "calibration",
          ingredient_confidence: entry.confidence || "high",
          ingredient_verified_at: new Date().toISOString(),
          ingredient_source_url: null,
          source: "calibration",
          source_label: "Verified formula",
          source_confidence: null,
          vision_reconciliation: recon.agreementPct,
        });
        const imgKey = cacheKey(productName, entry.category || visionCat);
        cacheSet(imgKey, result);
        await attachIntelCards(result, userId);
        return stream.complete({ ...result, cached: false });
      }

      // Step 4b: cascade returned external data (OFF or web_search) → full Pass 1 scoring.
      // Step 4c: no cascade → ask user to confirm identification before Tier 5.
      //
      // When every verification tier (calibration, fuzzy, cache, OFF, web search)
      // fails for a vision-identified product name, the name itself is suspect —
      // real products are usually findable in at least one source. Asking the user
      // to confirm before synthesizing a score protects against vision misreads
      // like "Clinique Pop Lip & Cheek Oil" → "Unique Liquid Lipstick" silently
      // producing a Tier 5 category-prior score that looks authoritative.
      //
      // On fresh identifications we pause here and return needs_confirmation.
      // If the user confirms (fromResume), we proceed to Tier 5 — they've
      // acknowledged the identification and opted in to a best-guess score.
      if (!cascadeHit && !fromResume) {
        const newId = putIdentification(identification);
        log.info("vision_cascade_miss_confirming", {
          product_name: productName,
          confidence: identification.confidence,
          has_brand: !!identification.brand,
        });
        return stream.complete({
          status: "needs_confirmation",
          identificationId: newId,
          identified: {
            product_name: productName,
            brand: identification.brand,
            variant: identification.variant,
            confidence: identification.confidence,
          },
          message: `I see this looks like ${productName}. Is that right?`,
        });
      }

      if (!cascadeHit) {
        const t5 = tier5CategoryPrior(productName, visionCat, {
          categoryAverages: CATEGORY_AVERAGES,
          categoryContext: CATEGORY_CONTEXT,
        });
        const synth = t5.syntheticResult;
        const safety = computeSafetyScores(synth.score, visionCat, productName, {}, [], "");
        synth.is_child_product = safety.isChild;
        synth.child_score      = safety.childScore;
        synth.child_bumps      = safety.childBumps || [];
        synth.pregnancy_score  = safety.pregnancyScore;
        synth.pregnancy_bumps  = safety.pregnancyBumps || [];
        synth.brand            = identification.brand || "";
        synth.alternatives = serializeAlternatives(
          filterDbAlternatives(findAlternatives(productName, visionCat, 3, productName), visionCat, productName, synth.score),
          visionCat,
        );
        log.info("vision_cascade_tier5", {
          product_name: productName,
          category: visionCat,
          score: synth.score,
          label_legibility: identification.label_legibility,
        });
        await attachIntelCards(synth, userId);
        return stream.complete({ ...synth, cached: false });
      }

      // Determine which ingredient source to trust. For textile
      // categories, the visible care label is ground truth when it
      // is readable. The cascade may have hit the wrong specific
      // product on the brand's site (right brand, wrong SKU). The
      // photo cannot lie about which garment is in the user's hand.
      // Bug 3 from the 2026-04 diagnosis.
      const TEXTILE_CATEGORIES = new Set([
        "clothing", "shoes", "accessory", "home_furnishing", "baby"
      ]);
      const labelIngredientArray = identification.label_ingredients || [];
      const labelHasComposition = labelIngredientArray.length > 0 &&
        labelIngredientArray.some(s => /\d+\s*%/.test(String(s)));
      const isTextile = TEXTILE_CATEGORIES.has(visionCat);
      const labelLegible = identification.label_legibility !== "unreadable" &&
        identification.label_legibility !== null;

      let useLabelAsSource = false;
      let recon = null;
      if (labelIngredientArray.length > 0) {
        recon = reconcileIngredients(labelIngredientArray, cascadeHit.ingredients);
        // Trust the label for textiles when vision read composition
        // and the label was at least partially legible. We do not
        // require cascade disagreement to flip — the label is
        // authoritative for the specific garment in the photo even
        // when the cascade happens to land on the same product.
        if (isTextile && labelHasComposition && labelLegible) {
          useLabelAsSource = true;
        }
      }

      const ingredientText = useLabelAsSource
        ? labelIngredientArray.join(", ")
        : cascadeHit.ingredients;
      const sourceLabelFinal = useLabelAsSource
        ? "Read directly from the care label"
        : (cascadeHit.sourceLabel || "");
      const sourceKeyFinal = useLabelAsSource
        ? "label_ocr"
        : (cascadeHit.source || cascadeHit.tier);
      const sourceConfidenceFinal = useLabelAsSource ? "high" : "medium";
      const ingredientSourceField = useLabelAsSource
        ? "label_ocr"
        : (cascadeHit.source || cascadeHit.tier);
      const ingredientConfidenceField = useLabelAsSource ? "high" : "medium";
      const ingredientSourceUrlField = useLabelAsSource
        ? null
        : (cascadeHit.sourceUrl || null);

      // Reconciliation log. Always emit when both sources exist so
      // we can audit how often label and cascade disagree on real
      // textile scans.
      if (recon && !recon.agreed) {
        log.info("vision_cascade_disagreement", {
          product_name: productName,
          tier: cascadeHit.tier,
          agreement_pct: recon.agreementPct,
          label_only: recon.labelOnly.slice(0, 6),
          cascade_only: recon.cascadeOnly.slice(0, 6),
          used: useLabelAsSource ? "label" : "cascade",
          category: visionCat,
          label_legibility: identification.label_legibility,
        });
      }

      // Stream seam 1: vision identification + cascade hit → product is
      // identified, ingredients verified. Frontend renders product card.
      stream.emit("identified", {
        product_name: productName,
        brand: identification.brand || cascadeHit.brand || "",
        ingredient_source: ingredientSourceField,
        ingredient_confidence: ingredientConfidenceField,
        ingredient_count: (cascadeHit.ingredientArray || ingredientText.split(",")).length,
        category: visionCat,
        tier: cascadeHit.tier,
      });

      // Pass 1 with verified ingredients as materialContext.
      const contextBlock = `INGREDIENT SOURCE: ${ingredientSourceField}\nFULL INGREDIENT LIST: ${ingredientText}\nThese ingredients come from ${sourceLabelFinal}. Score based on these ingredients, not on training priors.`;
      const p1 = await pass1(productName, contextBlock, visionCat, null);
      applyFlagDetectionToP1(p1, ingredientText, visionCat, "vision_v2");

      let p2 = null;
      try { p2 = await pass2(productName, p1); } catch(e) { console.warn("[vision_v2] pass2 failed:", e.message); }

      let mScore  = p2?.materials_score      ?? p1.materials?.score      ?? 5;
      let uScore  = p2?.usage_score          ?? p1.usage_exposure?.score  ?? 5;
      let pkScore = p2?.packaging_score      ?? p1.packaging?.score       ?? 5;
      let sScore  = p2?.sustainability_score ?? p1.sustainability?.score  ?? 5;

      const textFloors = applySubstanceFloorsToText(ingredientText);
      if (textFloors.mFloor > mScore) mScore = textFloors.mFloor;
      if (textFloors.uFloor > uScore) uScore = textFloors.uFloor;
      const aiFloors = applySubstanceFloors(mScore, uScore, p1, p2);
      mScore = aiFloors.mScore;
      uScore = aiFloors.uScore;

      // NOVA floor/ceiling — inferred from ingredient text when not provided
      // by a structured source. Keeps the vision path in parity with the
      // barcode path so Abe's Mini Muffins scores the same via photo as it
      // does via barcode.
      const novaInf = inferNovaGroupFromIngredients(ingredientText, visionCat);
      if (novaInf) {
        const nova = novaBounds(novaInf.nova, visionCat);
        if (nova.floor > mScore) {
          console.log(`[vision_v2] NOVA ${novaInf.nova} inferred from ingredients (${novaInf.matches.slice(0,3).join(", ")}) — materials ${mScore} → ${nova.floor}`);
          mScore = nova.floor;
        }
        if (mScore > nova.ceiling) mScore = nova.ceiling;
        // Surface the inferred NOVA into p1.raw_concerns so applyPositiveCeilings
        // sees it as ultra-processed and does NOT cap the score at 4 via the
        // Non-GMO / Organic ceiling rules. Without this, a Non-GMO Project
        // Verified ultra-processed food (like Abe's Muffins) gets the NOVA 4
        // floor raised to 7, then immediately capped back to 4 by the ceiling.
        if (novaInf.nova === 4) {
          p1.raw_concerns = Array.isArray(p1.raw_concerns) ? p1.raw_concerns : [];
          p1.raw_concerns.push(`NOVA 4 ultra-processed (inferred from ingredients: ${novaInf.matches.slice(0, 3).join(", ")})`);
        }
      }

      let finalScore = computeScore(mScore, uScore, pkScore, sScore, visionCat);
      ({ mScore, uScore, pkScore, sScore, finalScore } = applyConsistencyChecks(
        mScore, uScore, pkScore, sScore, finalScore, p1, p2, visionCat, productName
      ));
      ({ finalScore } = applyPositiveCeilings(finalScore, visionCat, p1, p2, []));

      // NOVA-inferred final-score floor — authoritative post-ceiling
      // enforcement so Non-GMO / consistency ceilings can't claw an ultra-
      // processed product back below its NOVA floor. Matches text-cascade logic.
      if (novaInf) {
        const novaFinal = novaBounds(novaInf.nova, visionCat).floor;
        if (novaFinal > finalScore) {
          console.log(`[vision_v2] NOVA ${novaInf.nova} final-score floor: ${finalScore} → ${novaFinal}`);
          finalScore = novaFinal;
        }
      }

      const safety = computeSafetyScores(finalScore, visionCat, productName, p1, textFloors.triggered, ingredientText);

      // Stream seam 2: scoring complete — frontend animates score arc.
      stream.emit("scored", {
        score: finalScore,
        overall_score: finalScore,
        category: visionCat,
        confidence: p1.confidence || "medium",
        materials_score: mScore,
        usage_score: uScore,
        packaging_score: pkScore,
        sustainability_score: sScore,
        concerns: p2?.refined_concerns || p1.concerns || [],
        flagged_substances: [...(p1.flagged_substances || []), ...textFloors.triggered],
      });

      const alternatives = serializeAlternatives(
        filterDbAlternatives(findAlternatives(productName, visionCat, 5, productName), visionCat, productName, finalScore),
        visionCat,
      );

      // Stream seam 3: alternatives ready.
      stream.emit("alternatives", { alternatives });

      const peerComparison = finalScore <= 2 ? "Safe — no significant chemical or ingredient concerns"
        : finalScore <= 4 ? "Good — mostly clean, use with awareness"
        : finalScore <= 6 ? "Caution — real concerns, reduce use or find an alternative"
        : finalScore <= 8 ? "Switch — real concerns, time to swap"
        : "Avoid — known harmful substances";

      const result = {
        product_name:       productName,
        brand:              identification.brand || "",
        score:              finalScore,
        overall_score:      finalScore,
        category:           visionCat,
        confidence:         p1.confidence || "medium",
        is_child_product:   safety.isChild,
        child_score:        safety.childScore,
        child_bumps:        safety.childBumps || [],
        pregnancy_score:    safety.pregnancyScore,
        pregnancy_bumps:    safety.pregnancyBumps || [],
        flagged_substances: [...(p1.flagged_substances || []), ...textFloors.triggered],
        concerns:           p2?.refined_concerns || p1.concerns || [],
        raw_concerns:       p1.raw_concerns || [],
        summary:            p1.summary_short || p1.summary || "",
        summary_short:      p1.summary_short || p1.summary || "",
        summary_long:       p1.summary_long || p1.summary || "",
        peer_comparison:    peerComparison,
        ingredient_source:         ingredientSourceField,
        ingredient_confidence:     ingredientConfidenceField,
        ingredient_verified_at:    new Date().toISOString(),
        ingredient_source_url:     ingredientSourceUrlField,
        source: sourceKeyFinal,
        source_label: sourceLabelFinal,
        source_confidence: sourceConfidenceFinal,
        verdict_adult: p1.verdict_adult || null,
        verdict_kid:   p1.verdict_kid   || null,
        dimensions: {
          materials:      { score: mScore,  label: p1.materials?.label      || "", concerns: p1.materials?.concerns      || [] },
          usage_exposure: { score: uScore,  label: p1.usage_exposure?.label || "", concerns: p1.usage_exposure?.concerns || [], frequency: p1.usage_exposure?.frequency || "unknown", type: p1.usage_exposure?.type || "unknown", intensity: p1.usage_exposure?.intensity || "unknown", vulnerable: p1.usage_exposure?.vulnerable || false },
          packaging:      { score: pkScore, label: p1.packaging?.label      || "", concerns: p1.packaging?.concerns      || [], primary: p1.packaging?.primary || "unknown", refillable: p1.packaging?.refillable || false, end_of_life: p1.packaging?.end_of_life || "unknown" },
          sustainability: { score: sScore,  label: p1.sustainability?.label  || "", concerns: p1.sustainability?.concerns  || [], reusable: p1.sustainability?.reusable || false, replaces_single_use: p1.sustainability?.replaces_single_use || false, replaces_count: p1.sustainability?.replaces_count || null, circularity: p1.sustainability?.circularity || "unknown" },
        },
        identified_plastics: p1.identified_plastics || [],
        harmful_chemicals:   p1.harmful_chemicals   || [],
        natural_materials:   p1.natural_materials   || [],
        nutrition:           p1.nutrition || p1.product_analysis?.nutrition || null,
        ingredient_list:     p1.ingredient_list?.length ? p1.ingredient_list : (identification.label_ingredients || []),
        product_family:      classifyProductFamily(productName, p1.ingredient_list || identification.label_ingredients, visionCat),
        alternatives,
        ai_alternatives:     [],
        scan_next:           buildScanNextFallback(productName, visionCat, alternatives),
        category_score_context: CATEGORY_CONTEXT[visionCat] || CATEGORY_CONTEXT.other,
        cached:              false,
      };
      const calibrated = applyProductCalibration(result);
      const imgKey = cacheKey(productName, visionCat);
      cacheSet(imgKey, calibrated);
      await attachIntelCards(calibrated, userId);
      return stream.complete(calibrated);
    } catch (err) {
      console.error("[vision_v2] error:", err);
      if (String(err.message).includes("API_BUDGET_EXCEEDED")) {
        return stream.errorJson(503, { error: "Partiqule has hit its daily scan limit. Please try again tomorrow." });
      }
      return stream.errorJson(500, { error: err.message || "Vision scan failed" });
    }
  }

  // If image provided, use vision to identify + analyze in one pass
  if (image) {
    try {
      console.log("Image scan — using vision pass1");
      const p1 = await callClaudeVision(image, mediaType || "image/jpeg");
      const productName = p1.product_name || "Scanned product";
      const category = p1.category || "other";

      // ── Deterministic flag detection on vision-captured ingredients ──
      // Vision has no pre-AI ingredient text — the AI extracts it from the label.
      applyFlagDetectionToP1(p1, "", category, "vision");

      // ── Check cache AFTER vision identifies product name ──
      // Camera scan of Goldfish = text scan of "Goldfish crackers" — same result
      const imgKey = cacheKey(productName, category);
      const imgCached = await cacheGet(imgKey);
      let imgSkipFuzzy = false;
      if (imgCached && evictIfPrePass0(imgCached, imgKey)) {
        imgSkipFuzzy = true;
      } else if (imgCached) {
        const imgNoIng  = !imgCached.ingredient_list || imgCached.ingredient_list.length === 0;
        const imgNoFlag = !imgCached.flagged_substances || imgCached.flagged_substances.length === 0;
        const imgAllFive = imgCached.dimensions &&
          imgCached.dimensions.materials?.score      === 5 &&
          imgCached.dimensions.usage_exposure?.score === 5 &&
          imgCached.dimensions.packaging?.score      === 5 &&
          imgCached.dimensions.sustainability?.score === 5;
        const imgStale = !imgCached.dimensions || imgCached._preloaded === true || (imgNoIng && imgNoFlag && imgAllFive);
        if (imgStale) {
          console.log(`[CACHE STALE] Vision "${productName}" — evicting placeholder, forcing full scan`);
          scoreCache.delete(imgKey);
          imgSkipFuzzy = true;
        } else {
          console.log(`[CACHE HIT] Vision identified "${productName}" — returning cached result`);
          return stream.complete({ ...imgCached, cached: true });
        }
      }

      // ── Fuzzy calibration check before running pass2 ──
      // Skipped when stale entry was evicted so pass2 runs and enriches the result.
      const imgFuzzy = !imgSkipFuzzy && fuzzyCalibrationLookup(productName);
      if (imgFuzzy) {
        const { entry } = imgFuzzy;
        const midScore = Math.round((entry.floor + entry.ceiling) / 2);
        const imgFuzzyCat = entry.category || category;
        const imgConcernsText = (entry.substances || []).join(" ");
        const imgSafety = computeSafetyScores(midScore, imgFuzzyCat, productName, { flagged_substances: entry.substances || [] }, [], imgConcernsText);
        const imgKidsFloor = entry.kidsFloor || entry.floor;
        const imgKidsCeil = entry.kidsCeiling || entry.ceiling;
        const imgKidsMid = Math.round((imgKidsFloor + imgKidsCeil) / 2);
        const imgFuzzyAlts = serializeAlternatives(
          filterDbAlternatives(
            findAlternatives(productName, imgFuzzyCat, 3, productName),
            imgFuzzyCat, productName, midScore
          ),
          imgFuzzyCat
        );
        const fuzzyResult = applyProductCalibration({
          product_name: productName, score: midScore, overall_score: midScore,
          category: imgFuzzyCat,
          confidence: entry.confidence || "high",
          is_child_product: imgSafety.isChild,
          child_score: entry.kidsFloor ? imgKidsMid : imgSafety.childScore,
          child_bumps: imgSafety.childBumps || [],
          pregnancy_score: imgSafety.pregnancyScore,
          pregnancy_bumps: imgSafety.pregnancyBumps || [],
          dimensions: buildFuzzyDimensions(entry, imgFuzzyCat, midScore),
          concerns: entry.substances || [],
          flagged_substances: entry.substances || [],
          summary: entry.reason || "",
          alternatives: imgFuzzyAlts, ai_alternatives: [],
          nutrition: entry.nutrition || p1.nutrition || p1.product_analysis?.nutrition || null,
          ingredient_list: p1.ingredient_list || [],
          product_family: classifyProductFamily(productName, p1.ingredient_list, imgFuzzyCat),
          category_score_context: CATEGORY_CONTEXT[imgFuzzyCat] || CATEGORY_CONTEXT.other,
          source: "calibration",
          source_label: "Verified formula",
          source_confidence: null,
        });
        cacheSet(imgKey, fuzzyResult);
        console.log(`[FUZZY CAL HIT] Vision "${productName}" matched calibration — score ${midScore}`);
        return stream.complete({ ...fuzzyResult, cached: false });
      }

      // Pass 2 audit using identified name
      let p2 = null;
      try { p2 = await pass2(productName, p1); } catch(e) { console.warn("Pass2 failed:", e.message); }

      const imgCategory = p1.category || "other";
      let finalAlternatives = filterDbAlternatives(findAlternatives(productName, imgCategory), imgCategory, productName);
      if (!finalAlternatives.length && p1.ai_alternatives?.length) {
        finalAlternatives = p1.ai_alternatives.map(a => ({
          id: `ai-${Math.random()}`, name: a.name, brand: "", score: a.estimated_score ?? 2,
          material: a.material || "", description: a.reason || "", price: "",
          affiliateUrl: `https://www.amazon.com/s?k=${encodeURIComponent(a.name)}&tag=${process.env.AMAZON_PARTNER_TAG||"partiqule-20"}`,
          category: imgCategory
        }));
      }

      // Compute weighted score from 4 dimensions (manufacturing removed)
      let mScore  = p2?.materials_score      ?? p1.materials?.score      ?? p1.product_score  ?? 5;
      let uScore  = p2?.usage_score          ?? p1.usage_exposure?.score  ?? 5;
      let pkScore = p2?.packaging_score      ?? p1.packaging?.score      ?? p1.packaging_score ?? 5;
      let sScore  = p2?.sustainability_score ?? p1.sustainability?.score  ?? 5;

      // ── Substance-triggered floors ──
      const imgSubstance = applySubstanceFloors(mScore, uScore, p1, p2);
      mScore = imgSubstance.mScore;
      uScore = imgSubstance.uScore;
      if (imgSubstance.triggered.length > 0) {
        console.log(`Image path substance floors: ${imgSubstance.triggered.join(", ")}`);
      }

      if (imgCategory === "restaurant") {
        const rname = (p1.product_name || productName).toLowerCase();
        const isFried = /fried|nugget|crispy|wing|strip|tender|fry|fries|onion ring|popcorn chicken|crispy chicken/.test(rname);
        const isChickenSandwich = /chicken sandwich|chicken burger|chick.?fil/.test(rname);
        mScore  = Math.max(mScore,  (isFried || isChickenSandwich) ? 4 : 3);
        uScore  = Math.max(uScore,  (isFried || isChickenSandwich) ? 4 : 3);
        pkScore = Math.max(pkScore, 3);
        sScore  = Math.max(sScore,  3);
      }

      let finalScore = computeScore(mScore, uScore, pkScore, sScore, imgCategory);

      // ── Consistency checks — catch hallucinations before result ──
      ({mScore, uScore, pkScore, sScore, finalScore} = applyConsistencyChecks(
        mScore, uScore, pkScore, sScore, finalScore, p1, p2, imgCategory, productName
      ));

      // ── Positive ceilings — pull genuinely clean food products down ──
      ({finalScore} = applyPositiveCeilings(finalScore, category, p1, p2, imgSubstance.triggered));

      // ── Restaurant confidence enforcement (image path) ──
      if (category === "restaurant" && p1.confidence === "high") {
        p1.confidence = "medium";
      }

      // ── pass2 drift guard (image path) ──
      const imgPass1RawScore = computeScore(imgSubstance.mScore, imgSubstance.uScore, pkScore, sScore, category);
      if (imgSubstance.triggered.length > 0 && finalScore < imgPass1RawScore - 1) {
        console.log(`Image path drift guard: ${imgPass1RawScore} → ${finalScore} with floors active — holding at ${imgPass1RawScore - 1}`);
        finalScore = imgPass1RawScore - 1;
      }

      if (category === "restaurant") {
        const name = (p1.product_name || productName).toLowerCase();
        const isFried  = /fried|nugget|crispy|wing|strip|tender|fry|fries|onion ring|popcorn chicken|crispy chicken/.test(name);
        const isChickenSandwich = /chicken sandwich|chicken burger|chick.?fil/.test(name);
        const isBurger = /burger|sandwich|wrap|hotdog|hot dog|sub|hero/.test(name);
        const isTaco   = /taco|burrito|quesadilla|nacho|torta/.test(name);
        if (isFried || isChickenSandwich) finalScore = Math.max(finalScore, 5);
        else if (isBurger)                finalScore = Math.max(finalScore, 4);
        else if (isTaco)                  finalScore = Math.max(finalScore, 3);
        else                              finalScore = Math.max(finalScore, 3);
      }

      const result = {
        product_name: productName, category: imgCategory,
        score: finalScore,
        overall_score: finalScore,
        summary:       p1.summary_short || p1.summary || p2?.summary || p1.raw_concerns?.slice(0,2).join(". ") || "",
        summary_short: p1.summary_short || p1.summary || p2?.summary || p1.raw_concerns?.slice(0,2).join(". ") || "",
        summary_long:  p1.summary_long || p1.summary || "",
        concerns: p2?.refined_concerns || p1.raw_concerns || [],
        // ── Child + pregnancy vulnerability (via shared helper) ──
        ...(() => {
          const safety = computeSafetyScores(finalScore, imgCategory, productName, p1,
            [], (p2?.refined_concerns || []).join(" "));
          return {
            is_child_product:  safety.isChild,
            child_score:       safety.childScore,
            child_bumps:       safety.childBumps,
            pregnancy_score:   safety.pregnancyScore,
            pregnancy_bumps:   safety.pregnancyBumps,
          };
        })(),
        identified_plastics: p1.identified_plastics || [],
        harmful_chemicals:   p1.harmful_chemicals   || [],
        natural_materials:   p1.natural_materials   || [],
        exposure_frequency:  p1.usage_exposure?.frequency || p1.exposure_frequency || "unknown",
        exposure_type:       p1.usage_exposure?.type      || p1.exposure_type      || "unknown",
        confidence:          p2?.confidence    || p1.confidence    || "medium",
        confidence_note:     p2?.confidence_note || p1.confidence_reason || "",
        score_reasoning:     p2?.score_reasoning || "",
        scan_next: p1.scan_next?.length ? p1.scan_next : buildScanNextFallback(productName, imgCategory, finalAlternatives),
        break_even:          p2?.break_even || null,
        food_analysis:       p1.product_analysis || p1.food_analysis || null,
        composition_tier:    p1.product_analysis?.composition_tier ?? p1.composition_tier ?? null,
        cached:              false,
        dimensions: {
          materials: {
            score: mScore, label: p1.materials?.label || "", concerns: p1.materials?.concerns || [],
          },
          usage_exposure: {
            score: uScore, label: p1.usage_exposure?.label || "",
            frequency: p1.usage_exposure?.frequency || "unknown",
            type: p1.usage_exposure?.type || "unknown",
            intensity: p1.usage_exposure?.intensity || "unknown",
            vulnerable: p1.usage_exposure?.vulnerable || false,
            concerns: p1.usage_exposure?.concerns || [],
          },
          packaging: {
            score: pkScore, label: p1.packaging?.label || "",
            primary: p1.packaging?.primary || "unknown",
            refillable: p1.packaging?.refillable || false,
            end_of_life: p1.packaging?.end_of_life || "unknown",
            concerns: p1.packaging?.concerns || [],
          },
          sustainability: {
            score: sScore, label: p1.sustainability?.label || "",
            reusable: p1.sustainability?.reusable || false,
            replaces_single_use: p1.sustainability?.replaces_single_use || false,
            replaces_count: p1.sustainability?.replaces_count || null,
            circularity: p1.sustainability?.circularity || "unknown",
            concerns: p1.sustainability?.concerns || [],
          },
        },
        alternatives: serializeAlternatives(finalAlternatives, imgCategory),
        ai_alternatives: (filterAiAlternatives(p1.ai_alternatives, imgCategory, productName) || []).map(a => ({
          name: a.name || "", reason: a.reason || "",
          material: a.material || "", estimated_score: a.estimated_score || 2, source: "ai",
        })),
        nutrition: p1.nutrition || p1.product_analysis?.nutrition || null,
        ingredient_list: p1.ingredient_list || [],
        product_family: classifyProductFamily(productName, p1.ingredient_list, imgCategory),
        category_score_context: CATEGORY_CONTEXT[imgCategory] || CATEGORY_CONTEXT.other,
        // Voice fields from Pass 1 (Pass 2 has no voice rules — its summary is for audit only)
        verdict_adult: p1.verdict_adult || null,
        verdict_kid:   p1.verdict_kid   || null,
        // Source provenance — image path reads ingredients from pixels via vision OCR.
        // ingredient_source intentionally NOT set here so evictIfPrePass0 keeps
        // image-path results out of long-term cache (CLAUDE.md "Pre-Pass-0 cache eviction").
        source: "vision_ocr",
        source_label: "Read from your photo",
        source_confidence: null,
      };

      const calibratedResult = applyProductCalibration(result);
      // Cache the result so next camera scan of same product is instant
      cacheSet(imgKey, calibratedResult);
      console.log(`[CACHED] Vision "${productName}" → score ${calibratedResult.score}`);
      await attachIntelCards(calibratedResult, userId);
      return stream.complete(calibratedResult);
    } catch(err) {
      console.error("Vision analyze error:", err);
      if (String(err.message).includes("API_BUDGET_EXCEEDED")) {
        return stream.errorJson(503, { error: "Partiqule has hit its daily scan limit. Please try again tomorrow." });
      }
      return stream.errorJson(500, { error: err.message || "Image scan failed" });
    }
  }

  if (!query?.trim()) return stream.errorJson(400, { error: "Query is required" });
  if (typeof query !== "string" || query.length > 500) return stream.errorJson(400, { error: "Invalid query" });

  const extracted    = extractProductFromUrl(query.trim());
  const productName  = (extracted || query.trim()).slice(0, 300).replace(/[\x00-\x1f]/g, "");

  // Detect category FIRST so it's included in the cache key.
  // Cache key uses the sync Fast result for stability — the cache must be
  // keyed on something that doesn't depend on AI availability. AI-quality
  // categorization happens below on the scoring path only.
  let category  = detectCategory(productName);
  const key     = cacheKey(productName, category);

  // skipFuzzyCalibration is set when a stale preloaded entry is evicted.
  // It forces the full AI pass to run once so the product gets real ingredients
  // and dimension scores. Calibration floor/ceiling is still enforced afterwards
  // via applyProductCalibration at the bottom of the AI path.
  let skipFuzzyCalibration = false;

  const cached = await cacheGet(key);
  if (cached && evictIfPrePass0(cached, key)) {
    skipFuzzyCalibration = true;
  } else if (cached) {
    // Staleness check — evict entries that predate the full schema or were
    // bulk-preloaded with placeholder data (all dimensions = 5, no ingredients).
    const noIngredients = !cached.ingredient_list || cached.ingredient_list.length === 0;
    const noFlags       = !cached.flagged_substances || cached.flagged_substances.length === 0;
    const allFiveDims   = cached.dimensions &&
      cached.dimensions.materials?.score      === 5 &&
      cached.dimensions.usage_exposure?.score === 5 &&
      cached.dimensions.packaging?.score      === 5 &&
      cached.dimensions.sustainability?.score === 5;
    const isStale = !cached.dimensions || cached._preloaded === true || (noIngredients && noFlags && allFiveDims);
    if (isStale) {
      console.log(`[CACHE STALE] ${key} — evicting placeholder data, forcing full AI scan`);
      scoreCache.delete(key);
      skipFuzzyCalibration = true; // bypass fuzzy cal this once so AI enriches the result
    } else {
      console.log(`[CACHE HIT] ${key} (${scoreCache.size} in memory${hasRedis?" + Redis":""})`);
      return stream.complete({ ...cached, cached: true });
    }
  }

  // AI-quality category classification for scoring. Cache key above already
  // used the sync Fast result — this only affects downstream weighting and
  // substance-floor routing. Disagreement with Fast is logged, not treated
  // as an error.
  try {
    const cls = await classifyCategory({
      productName,
      deps: { redisGet, redisSet, promptVersion, checkApiBudget, incrementApiCount },
    });
    log.info("category_classification", {
      product_name: productName,
      source: cls.source,
      ai_category: cls.category,
      fast_category: category,
      confidence: cls.confidence,
      disagreed: category && cls.category !== category,
    });
    if (cls.category && cls.category !== "other") category = cls.category;
    else if (!category && cls.category === "other") category = "other";
  } catch (e) {
    console.warn("[classify] error, using Fast category:", e.message);
  }

  // Fuzzy calibration lookup — catches name variations before going to AI.
  // Skipped when a stale entry was just evicted so AI runs and enriches the result.
  // e.g. "Seventh Generation soap" matches "seventh generation dish"
  const fuzzyHit = !skipFuzzyCalibration && fuzzyCalibrationLookup(productName);
  if (fuzzyHit) {
    const { entry } = fuzzyHit;
    const midScore  = Math.round((entry.floor + entry.ceiling) / 2);
    const kidsFloor = entry.kidsFloor || entry.floor;
    const kidsCeil  = entry.kidsCeiling || entry.ceiling;
    const kidsMid   = Math.round((kidsFloor + kidsCeil) / 2);
    const fuzzyCat  = entry.category || category;
    const fuzzyConcernsText = (entry.substances || []).join(" ");
    const fuzzySafety = computeSafetyScores(midScore, fuzzyCat, productName, { flagged_substances: entry.substances || [] }, [], fuzzyConcernsText);
    const fuzzyAlts = serializeAlternatives(
      filterDbAlternatives(
        findAlternatives(productName, fuzzyCat, 3, productName),
        fuzzyCat, productName, midScore
      ),
      fuzzyCat
    );
    const fuzzyResult = applyProductCalibration({
      product_name: productName,
      score: midScore, overall_score: midScore,
      category: fuzzyCat,
      confidence: entry.confidence || "high",
      is_child_product: fuzzySafety.isChild,
      child_score: entry.kidsFloor ? kidsMid : fuzzySafety.childScore,
      child_bumps: fuzzySafety.childBumps || [],
      pregnancy_score: fuzzySafety.pregnancyScore,
      pregnancy_bumps: fuzzySafety.pregnancyBumps || [],
      dimensions: buildFuzzyDimensions(entry, fuzzyCat, midScore),
      concerns: entry.substances || [],
      flagged_substances: entry.substances || [],
      summary: entry.reason || "",
      nutrition: entry.nutrition || null,
      alternatives: fuzzyAlts, ai_alternatives: [],
      product_family: classifyProductFamily(productName, entry.substances || [], fuzzyCat),
      category_score_context: CATEGORY_CONTEXT[fuzzyCat] || CATEGORY_CONTEXT.other,
      ingredient_source: "calibration",
      ingredient_confidence: entry.confidence || "high",
      ingredient_verified_at: new Date().toISOString(),
      ingredient_source_url: null,
      source: "calibration",
      source_label: "Verified formula",
      source_confidence: null,
    });
    cacheSet(key, fuzzyResult);
    console.log(`[FUZZY CAL HIT] "${productName}" matched calibration — score ${midScore}, child ${fuzzySafety.childScore}, preg ${fuzzySafety.pregnancyScore}`);
    return stream.complete({ ...fuzzyResult, cached: false });
  }

  console.log(`[CACHE MISS] ${key} — running cascade`);

  // ── Stray-productId guard ──
  // The productId bypass block above (line ~5147) handles `calibration:` and
  // `scan:` schemes. If a productId arrived here it didn't match a known scheme
  // — surface a 400 instead of running the cascade with garbage.
  if (productId) {
    log.warn("unresolved_productId_in_cascade", { productName, userId, productId_type: typeof productId, productId_len: String(productId).length, productId_prefix: String(productId).slice(0, 20) });
    return stream.errorJson(400, {
      success: false,
      error: "unresolved_productId",
      message: "That match couldn't be resolved. Try another product or scan the barcode.",
    });
  }

  // Reject bare-fiber queries that have no brand / product identity — these
  // would fall through to Tier 5 and produce a synthetic "best guess" score
  // for an abstract fabric term (e.g. "polyester", "100% polyester", "spandex",
  // "lyocell"). That's a fabrication vector — no real product backs the score.
  // Surface a friendly "need more specifics" response instead.
  const fiberOnlyPattern = /^\s*(?:\d+\s*%\s*)?(?:polyester|nylon|spandex|elastane|lycra|acrylic|rayon|viscose|modal|cupro|lyocell|tencel|cotton|linen|hemp|wool|merino|cashmere|bamboo)\s*$/i;
  if (fiberOnlyPattern.test(productName)) {
    log.info("fabric_only_query_rejected", { productName });
    return stream.errorJson(400, {
      success: false,
      error: "fabric_only_query",
      message: "That's a fabric name, not a specific product. Try a brand and product — like \"Lululemon leggings\" or \"Pact organic tee\".",
    });
  }

  try {
    // ── Five-tier cascade — see CLAUDE.md "Five-Tier Scoring Cascade" ──
    // Tiers 1 (CALIBRATION) and 2 (cache) are above. This block handles 3 → 4 → 5.
    // dedupeInflight collapses concurrent identical queries into one execution
    // so a multi-tab refresh or rapid retap doesn't fan out into N web searches.
    const cascadeOutcome = await dedupeInflight(productName, category, async () => {
      // ── Tier 3: Open Facts text search (strict) ──
      let tier = null;
      let ingredientText = null;
      let ingredientArray = [];
      let brandHint = "";
      let resolvedCategory = category;
      let sourceFields = null;

      const t3 = await tier3OpenFactsTextSearch(productName);
      if (t3) {
        tier = "tier3";
        ingredientText = t3.ingredients;
        ingredientArray = t3.ingredients
          .split(/,(?![^(]*\))/)
          .map(s => s.trim())
          .filter(Boolean);
        brandHint = t3.brand;
        sourceFields = {
          source: t3.source,
          source_label: t3.sourceLabel,
          source_confidence: t3.sourceConfidence,
          ingredient_source: t3.source,
          ingredient_confidence: t3.sourceConfidence,
          ingredient_verified_at: new Date().toISOString(),
          ingredient_source_url: t3.sourceUrl,
        };
      } else {
        // ── Tier 4: web_search_20250305 → JSON ingredient extraction ──
        const t4 = await tier4WebExtract(productName, { checkApiBudget, incrementApiCount });
        if (t4) {
          tier = "tier4";
          ingredientText = t4.ingredients;
          ingredientArray = (t4.ingredientArray || []).map(s => String(s).trim()).filter(Boolean);
          brandHint = t4.brand;
          // Honor AI-detected category only when it's a known taxonomy member
          if (t4.category && CATEGORY_AVERAGES[t4.category]) resolvedCategory = t4.category;
          sourceFields = {
            source: t4.source,
            source_label: t4.sourceLabel,
            source_confidence: t4.sourceConfidence,
            ingredient_source: t4.source,
            ingredient_confidence: t4.sourceConfidence,
            ingredient_verified_at: new Date().toISOString(),
            ingredient_source_url: t4.sourceUrl,
          };
        }
      }

      // ── Tier 5: synthetic category-prior best guess ──
      // No AI call. No chemistry fields populated. summary names the limitation.
      // _skipCache flag tells the caller not to persist this result.
      if (!tier) {
        const t5 = tier5CategoryPrior(productName, category, {
          categoryAverages: CATEGORY_AVERAGES,
          categoryContext: CATEGORY_CONTEXT,
        });
        const synth = t5.syntheticResult;
        // Replace the placeholder safety scores with shared-helper output for
        // consistency with other paths (uses category + product name only).
        const safety = computeSafetyScores(synth.score, category, productName, {}, [], "");
        synth.is_child_product = safety.isChild;
        synth.child_score      = safety.childScore;
        synth.child_bumps      = safety.childBumps || [];
        synth.pregnancy_score  = safety.pregnancyScore;
        synth.pregnancy_bumps  = safety.pregnancyBumps || [];
        log.info("cascade_tier5", { productName, category, score: synth.score });
        return { tier: "tier5", result: synth, skipCache: true };
      }

      // ── Tier 3 / 4: feed real ingredients into the standard scoring pipeline ──
      // Mirrors the barcode path's contract: pre-AI deterministic detection,
      // pass1 with verified ingredient context, pass2 audit, text+AI substance
      // floors, consistency checks, positive ceilings, drift guard, calibration.
      const ingredientSourceNote = `INGREDIENT SOURCE: ${sourceFields.source} (confidence: ${sourceFields.source_confidence})\nVerified: ${sourceFields.ingredient_verified_at}\nThese ingredients come from ${sourceFields.source}. Score based on these ingredients, not on your training priors. If the ingredient list contradicts what you know about this product, trust the ingredient list provided.`;
      const cascadeContext = [
        `EXACT PRODUCT: ${productName}${brandHint ? ` by ${brandHint}` : ""}`,
        ingredientSourceNote,
        `FULL INGREDIENT LIST: ${ingredientText}`,
        /natural.*flavor|flavoring/i.test(ingredientText) && !/artificial/i.test(ingredientText)
          ? "SCORING NOTE: Ingredient list confirms NATURAL flavoring only — do not penalize as synthetic."
          : null,
      ].filter(Boolean).join("\n");

      const preDetected = FLAG_DETECTION_ENABLED && ingredientText
        ? detectDeterministicFlags(ingredientText, resolvedCategory)
        : null;

      // Stream seam 1: cascade resolved → product is identified, ingredients
      // verified. Frontend renders the product card with an empty score badge.
      stream.emit("identified", {
        product_name: productName,
        brand: brandHint || "",
        ingredient_source: sourceFields.source,
        ingredient_confidence: sourceFields.source_confidence,
        ingredient_count: ingredientArray.length,
        category: resolvedCategory,
        tier,
      });

      console.log(`[${tier}] running pass1 with verified ingredients (${ingredientArray.length} items)`);
      const p1 = await pass1(productName, cascadeContext, resolvedCategory, preDetected);
      applyFlagDetectionToP1(p1, ingredientText, resolvedCategory, tier);

      // Parallelize: Pass 2 needs only Pass 1 output; Amazon PA API needs only
      // the Pass-1 product name + category + identified plastics. Neither
      // depends on the other, so fire them concurrently and wait once.
      const finalCategory = (p1.category && p1.category !== "other" ? p1.category : resolvedCategory) || "other";
      const aiProductNameEarly = p1.product_name || productName;
      const isRestaurantEarly = finalCategory === "restaurant";

      console.time(`[${tier}] pass2+amazon parallel`);
      const p2Promise = safePass2(productName, p1, ingredientText)
        .catch(e => { console.warn(`[${tier}] pass2 failed:`, e.message); return null; });
      const amazonPromise = (isPaApiConfigured() && !isRestaurantEarly)
        ? getAmazonAlternatives(aiProductNameEarly, finalCategory, p1.identified_plastics || [])
            .catch(e => { console.warn(`[${tier}] amazon api failed:`, e.message); return null; })
        : Promise.resolve(null);
      let p2;
      let amazonResultsEarly;
      [p2, amazonResultsEarly] = await Promise.all([p2Promise, amazonPromise]);
      console.timeEnd(`[${tier}] pass2+amazon parallel`);

      let mScore  = p2?.materials_score      ?? p1.materials?.score      ?? 5;
      let uScore  = p2?.usage_score          ?? p1.usage_exposure?.score  ?? 5;
      let pkScore = p2?.packaging_score      ?? p1.packaging?.score      ?? 5;
      let sScore  = p2?.sustainability_score ?? p1.sustainability?.score  ?? 5;

      // Substance floors — text-derived first (AI-immune), then AI-concern based
      const textFloors = applySubstanceFloorsToText(ingredientText);
      if (textFloors.mFloor > mScore) {
        console.log(`[${tier}] Text substance floor raised materials ${mScore} → ${textFloors.mFloor} (${textFloors.triggered[0]})`);
        mScore = textFloors.mFloor;
      }
      if (textFloors.uFloor > uScore) uScore = textFloors.uFloor;
      const aiFloors = applySubstanceFloors(mScore, uScore, p1, p2);
      mScore = aiFloors.mScore;
      uScore = aiFloors.uScore;
      const allTriggered = [...textFloors.triggered, ...aiFloors.triggered];
      if (allTriggered.length > 0) console.log(`[${tier}] Substance floors triggered: ${allTriggered.join(", ")}`);

      // NOVA floor/ceiling inferred from ingredient text — parity with
      // barcode path so the same product lands on the same score across
      // text, vision, and barcode entry points.
      const novaInf = inferNovaGroupFromIngredients(ingredientText, finalCategory);
      if (novaInf) {
        const nova = novaBounds(novaInf.nova, finalCategory);
        if (nova.floor > mScore) {
          console.log(`[${tier}] NOVA ${novaInf.nova} inferred from ingredients (${novaInf.matches.slice(0,3).join(", ")}) — materials ${mScore} → ${nova.floor}`);
          mScore = nova.floor;
        }
        if (mScore > nova.ceiling) mScore = nova.ceiling;
        if (novaInf.nova === 4) {
          p1.raw_concerns = Array.isArray(p1.raw_concerns) ? p1.raw_concerns : [];
          p1.raw_concerns.push(`NOVA 4 ultra-processed (inferred from ingredients: ${novaInf.matches.slice(0, 3).join(", ")})`);
          // Upgrade composition_tier so applyProductCalibration's Tier rules
          // don't later downgrade the score below the NOVA floor.
          p1.product_analysis = p1.product_analysis || {};
          p1.product_analysis.composition_tier = 4;
        }
      }

      // Restaurant dimension floors
      if (finalCategory === "restaurant") {
        const rname = (p1.product_name || productName).toLowerCase();
        const isFried = /fried|nugget|crispy|wing|strip|tender|fry|fries|onion ring|popcorn chicken|crispy chicken|fried chicken/.test(rname);
        const isChickenSandwich = /chicken sandwich|chicken burger|chick.?fil/.test(rname);
        mScore  = Math.max(mScore,  (isFried || isChickenSandwich) ? 4 : 3);
        uScore  = Math.max(uScore,  (isFried || isChickenSandwich) ? 4 : 3);
        pkScore = Math.max(pkScore, 3);
        sScore  = Math.max(sScore,  3);
      }

      let finalScore = computeScore(mScore, uScore, pkScore, sScore, finalCategory);
      ({mScore, uScore, pkScore, sScore, finalScore} = applyConsistencyChecks(
        mScore, uScore, pkScore, sScore, finalScore, p1, p2, finalCategory, productName
      ));
      ({finalScore} = applyPositiveCeilings(finalScore, finalCategory, p1, p2, allTriggered));

      // Restaurant confidence enforcement
      if (finalCategory === "restaurant" && p1.confidence === "high") {
        p1.confidence = "medium";
      }

      // pass2 drift guard
      const pass1RawScore = computeScore(aiFloors.mScore, aiFloors.uScore, pkScore, sScore, finalCategory);
      if (allTriggered.length > 0 && finalScore < pass1RawScore - 1) {
        console.log(`[${tier}] Pass2 drift guard: ${pass1RawScore} → ${finalScore} with floors active — holding at ${pass1RawScore - 1}`);
        finalScore = pass1RawScore - 1;
      }

      // Restaurant safety net
      if (finalCategory === "restaurant") {
        const name = (p1.product_name || productName).toLowerCase();
        const isFried  = /fried|nugget|crispy|wing|strip|tender|fry|fries|onion ring|popcorn chicken|crispy chicken/.test(name);
        const isChickenSandwich = /chicken sandwich|chicken burger|chick.?fil/.test(name);
        const isBurger = /burger|sandwich|wrap|hotdog|hot dog|sub|hero/.test(name);
        const isTaco   = /taco|burrito|quesadilla|nacho|torta/.test(name);
        if (isFried || isChickenSandwich) finalScore = Math.max(finalScore, 5);
        else if (isBurger)                finalScore = Math.max(finalScore, 4);
        else if (isTaco)                  finalScore = Math.max(finalScore, 3);
        else                              finalScore = Math.max(finalScore, 3);
      }

      // DEBUG: log every score mutation for NOVA 4 products so we can see in
      // Railway logs which downstream gate is pulling the final score below
      // the NOVA floor. Remove once the mystery gate is identified.
      if (novaInf && novaInf.nova === 4) {
        console.log(`[${tier}][nova_trace] BEFORE post-ceiling clamp: mScore=${mScore} uScore=${uScore} pkScore=${pkScore} sScore=${sScore} finalScore=${finalScore} composition_tier=${p1.product_analysis?.composition_tier} confidence=${p1.confidence}`);
      }

      // ── NOVA-inferred final-score floor ──
      if (novaInf) {
        const novaFinal = novaBounds(novaInf.nova, finalCategory).floor;
        if (novaFinal > finalScore) {
          console.log(`[${tier}] NOVA ${novaInf.nova} final-score floor: ${finalScore} → ${novaFinal}`);
          finalScore = novaFinal;
        }
      }

      if (novaInf && novaInf.nova === 4) {
        console.log(`[${tier}][nova_trace] AFTER post-ceiling clamp: finalScore=${finalScore}`);
      }

      const peerComparison = finalScore <= 2 ? "Safe — no significant chemical or ingredient concerns"
        : finalScore <= 4 ? "Good — mostly clean, use with awareness"
        : finalScore <= 6 ? "Caution — real concerns, reduce use or find an alternative"
        : finalScore <= 8 ? "Switch — real concerns, time to swap"
        : "Avoid — known harmful substances";

      const aiProductName = p1.product_name || productName;

      // Stream seam 2: scoring complete → frontend animates score arc to
      // final value and fills in dimensions. Alternatives panel still empty.
      stream.emit("scored", {
        score: finalScore,
        overall_score: finalScore,
        category: finalCategory,
        confidence: p1.confidence || "medium",
        materials_score: mScore,
        usage_score: uScore,
        packaging_score: pkScore,
        sustainability_score: sScore,
        concerns: p2?.refined_concerns || p1.raw_concerns || [],
        flagged_substances: p1.flagged_substances || [],
      });

      // Alternatives — Amazon PA API was already fired in parallel with Pass 2
      // above. Use those results if non-empty; otherwise fall back to DB.
      let finalAlternatives;
      const isRestaurant = finalCategory === "restaurant";
      if (isRestaurant) {
        finalAlternatives = (filterAiAlternatives(p1.ai_alternatives, finalCategory, productName) || []).map(a => ({
          id: `ai-${Math.random()}`, name: a.name, brand: "", score: a.estimated_score ?? 3,
          material: a.material || "", description: a.reason || "", price: "",
          affiliateUrl: `https://www.amazon.com/s?k=${encodeURIComponent(a.name)}&tag=${process.env.AMAZON_PARTNER_TAG||"partiqule-20"}`,
          category: "food_beverage"
        }));
      } else if (amazonResultsEarly && amazonResultsEarly.length > 0) {
        finalAlternatives = amazonResultsEarly;
      } else {
        finalAlternatives = filterDbAlternatives(
          findAlternatives(aiProductName, finalCategory, 3, productName),
          finalCategory, productName, finalScore
        ).map(p => ({ ...p, score: p.plasticScore, source: "static" }));
      }

      // Stream seam 3: alternatives ready → frontend slides up alts panel.
      stream.emit("alternatives", { alternatives: finalAlternatives });

      const result = {
        product_name:     cleanProductName(p1.product_name || productName),
        score:            finalScore,
        overall_score:    finalScore,
        summary:          p1.summary_short || p1.summary || p2?.summary || p1.raw_concerns?.slice(0,2).join(". ") || "",
        summary_short:    p1.summary_short || p1.summary || p2?.summary || p1.raw_concerns?.slice(0,2).join(". ") || "",
        summary_long:     p1.summary_long || p1.summary || "",
        concerns:         p2?.refined_concerns || p1.raw_concerns || [],
        // Preserve raw_concerns so applyProductCalibration can read the NOVA 4
        // deterministic marker injected by inferNovaGroupFromIngredients —
        // p2.refined_concerns overwrites concerns above, which would otherwise
        // hide the marker from the calibration-layer NOVA floor check.
        raw_concerns:     p1.raw_concerns || [],
        category:         finalCategory,
        ...(() => {
          const safety = computeSafetyScores(finalScore, finalCategory, p1.product_name || productName, p1, textFloors.triggered, (p2?.refined_concerns || []).join(" "));
          return {
            is_child_product:  safety.isChild,
            child_score:       safety.childScore,
            child_bumps:       safety.childBumps,
            pregnancy_score:   safety.pregnancyScore,
            pregnancy_bumps:   safety.pregnancyBumps,
          };
        })(),
        dimensions: {
          materials: { score: mScore, label: p1.materials?.label || "", concerns: p1.materials?.concerns || [] },
          usage_exposure: {
            score: uScore, label: p1.usage_exposure?.label || "",
            frequency: p1.usage_exposure?.frequency || "unknown",
            type: p1.usage_exposure?.type || "unknown",
            intensity: p1.usage_exposure?.intensity || "unknown",
            vulnerable: p1.usage_exposure?.vulnerable || false,
            concerns: p1.usage_exposure?.concerns || [],
          },
          packaging: {
            score: pkScore, label: p1.packaging?.label || "",
            primary: p1.packaging?.primary || "unknown",
            refillable: p1.packaging?.refillable || false,
            end_of_life: p1.packaging?.end_of_life || "unknown",
            concerns: p1.packaging?.concerns || [],
          },
          sustainability: {
            score: sScore, label: p1.sustainability?.label || "",
            reusable: p1.sustainability?.reusable || false,
            replaces_single_use: p1.sustainability?.replaces_single_use || false,
            replaces_count: p1.sustainability?.replaces_count || null,
            circularity: p1.sustainability?.circularity || "unknown",
            concerns: p1.sustainability?.concerns || [],
          },
        },
        identified_plastics: p1.identified_plastics || [],
        harmful_chemicals:   p1.harmful_chemicals   || [],
        natural_materials:   p1.natural_materials   || [],
        flagged_substances:  [...(p1.flagged_substances || []), ...textFloors.triggered],
        exposure_frequency:  p1.usage_exposure?.frequency || "unknown",
        exposure_type:       p1.usage_exposure?.type      || "unknown",
        confidence:          p2?.confidence    || p1.confidence    || "medium",
        confidence_note:     p2?.confidence_note || p1.confidence_reason || "",
        score_reasoning:     p2?.score_reasoning || "",
        peer_comparison:     peerComparison,
        scan_next: p1.scan_next?.length ? p1.scan_next : buildScanNextFallback(aiProductName || productName, finalCategory, finalAlternatives),
        break_even:          p2?.break_even || null,
        food_analysis:       p1.product_analysis || p1.food_analysis || null,
        composition_tier:    p1.product_analysis?.composition_tier ?? p1.composition_tier ?? null,
        cached:              false,
        alternatives: serializeAlternatives(finalAlternatives, finalCategory),
        ai_alternatives: (filterAiAlternatives(p1.ai_alternatives, finalCategory, productName) || []).map(a => ({
          name: a.name || "", reason: a.reason || "",
          material: a.material || "", estimated_score: a.estimated_score || 2, source: "ai",
        })),
        nutrition: p1.nutrition || p1.product_analysis?.nutrition || null,
        ingredient_list: ingredientArray.length ? ingredientArray : (p1.ingredient_list || []),
        product_family: classifyProductFamily(productName, ingredientArray.length ? ingredientArray : (p1.ingredient_list || []), finalCategory),
        category_score_context: CATEGORY_CONTEXT[finalCategory] || CATEGORY_CONTEXT.other,
        // Voice fields from Pass 1 (Pass 2 has no voice rules — its summary is for audit only)
        verdict_adult: p1.verdict_adult || null,
        verdict_kid:   p1.verdict_kid   || null,
        // Source provenance — see CLAUDE.md "Five-Tier Scoring Cascade"
        source: sourceFields.source,
        source_label: sourceFields.source_label,
        source_confidence: sourceFields.source_confidence,
        ingredient_source: sourceFields.ingredient_source,
        ingredient_confidence: sourceFields.ingredient_confidence,
        ingredient_verified_at: sourceFields.ingredient_verified_at,
        ingredient_source_url: sourceFields.ingredient_source_url,
      };

      if (novaInf && novaInf.nova === 4) {
        console.log(`[${tier}][nova_trace] BEFORE applyProductCalibration: result.score=${result.score} result.composition_tier=${result.composition_tier} p1.product_analysis.composition_tier=${p1.product_analysis?.composition_tier}`);
      }
      const calibrated = applyProductCalibration(result);
      if (novaInf && novaInf.nova === 4) {
        console.log(`[${tier}][nova_trace] AFTER applyProductCalibration: calibrated.score=${calibrated.score} calibrated.overall_score=${calibrated.overall_score} override=${JSON.stringify(calibrated.calibration_override || null).slice(0, 200)}`);
      }
      if (calibrated.child_score != null) {
        const kidsCalibrated = applyProductCalibration({ ...result, kids_mode: true, overall_score: calibrated.child_score, score: calibrated.child_score });
        calibrated.child_score = kidsCalibrated.overall_score;
      }

      return { tier, result: calibrated, skipCache: false };
    });

    if (!cascadeOutcome.skipCache) {
      cacheSet(key, cascadeOutcome.result);
      console.log(`[CACHED] ${key} via ${cascadeOutcome.tier} (score: ${cascadeOutcome.result.score}, total: ${scoreCache.size}${hasRedis?" + Redis":""})`);
    } else {
      console.log(`[CASCADE ${cascadeOutcome.tier}] ${key} — score ${cascadeOutcome.result.score}, not cached`);
    }
    await attachIntelCards(cascadeOutcome.result, userId);
    stream.complete(cascadeOutcome.result);

  } catch (err) {
    console.error("Cascade error:", err.message);
    const msg = err.message?.includes("529") || err.message?.includes("overload")
      ? "Partiqule is in high demand right now. Please try again in a few seconds."
      : err.message?.includes("429") || err.message?.includes("rate")
      ? "Too many requests. Please wait a moment and try again."
      : err.message?.includes("timed out")
      ? "That scan took too long. Please try again."
      : err.message?.includes("No JSON") || err.message?.includes("JSON parse")
      ? "We had trouble analysing that product. Please try again or rephrase the product name."
      : err.message?.includes("API_BUDGET_EXCEEDED")
      ? "Partiqule has hit its daily scan limit. Please try again tomorrow."
      : err.message;
    const statusCode = err.message?.includes("API_BUDGET_EXCEEDED") ? 503 : 500;
    res.status(statusCode).json({ error: msg });
  }
});

// ── EMAIL CAPTURE ─────────────────────────────────────────────
// Simple in-memory store — replace with DB when accounts are built
const emailList = new Set();
const LOOPS_API_KEY = process.env.LOOPS_API_KEY || "";

const addToLoops = async (email, source="web") => {
  if (!LOOPS_API_KEY) { console.warn("[LOOPS] No API key — skipping"); return; }
  try {
    const r = await fetch("https://app.loops.so/api/v1/contacts/create", {
      method: "POST",
      headers: { "Authorization": `Bearer ${LOOPS_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        source,
        userGroup: "Partiqule Users",
        mailingLists: { "Partiqule Users": true },
      }),
    });
    const d = await r.json();
    if (d.success) console.log(`[LOOPS] Added ${email} (source: ${source})`);
    else console.warn(`[LOOPS] Failed to add ${email}:`, d.message);
    return d;
  } catch(e) {
    console.error("[LOOPS] Error:", e.message);
  }
};

const triggerLoopsEvent = async (email, eventName, properties={}) => {
  if (!LOOPS_API_KEY) return;
  try {
    await fetch("https://app.loops.so/api/v1/events/send", {
      method: "POST",
      headers: { "Authorization": `Bearer ${LOOPS_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email, eventName, ...properties }),
    });
    console.log(`[LOOPS] Event "${eventName}" sent for ${email}`);
  } catch(e) {
    console.error("[LOOPS] Event error:", e.message);
  }
};

app.post("/subscribe", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const { email, source="web" } = req.body;
  if (!email || !email.includes("@")) return res.status(400).json({ error: "Invalid email" });
  const already = emailList.has(email.toLowerCase().trim());
  emailList.add(email.toLowerCase().trim());
  console.log(`[EMAIL] Captured: ${email} from ${source} (total: ${emailList.size})`);

  // Add to Loops and trigger welcome sequence
  const result = await addToLoops(email.toLowerCase().trim(), source);
  if (!already && result?.success) {
    await triggerLoopsEvent(email.toLowerCase().trim(), "signup");
  }

  res.json({ ok: true, already });
});

// ── SCORE FEEDBACK ────────────────────────────────────────────
// Users can report a score they think is wrong. Stored in Supabase for
// admin review. The feedback table has columns:
//   id uuid, product_name text, category text, returned_score int,
//   suggested_tier text ('too_high' | 'too_low' | 'wrong_category' | 'other'),
//   note text, user_email text, created_at timestamptz, status text
app.post("/score-feedback", async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: "Feedback not configured" });
  const { product_name, category, returned_score, suggested_tier, note, user_email } = req.body || {};
  if (!product_name || !product_name.trim()) return res.status(400).json({ error: "product_name required" });
  const validTiers = ["too_high", "too_low", "wrong_category", "missing_concern", "other"];
  if (suggested_tier && !validTiers.includes(suggested_tier)) {
    return res.status(400).json({ error: "invalid suggested_tier" });
  }
  try {
    const { error } = await supabaseAdmin.from("score_feedback").insert({
      product_name:   product_name.trim(),
      category:       category || null,
      returned_score: typeof returned_score === "number" ? returned_score : null,
      suggested_tier: suggested_tier || "other",
      note:           (note || "").trim().slice(0, 500) || null,
      user_email:     user_email?.trim()?.slice(0, 200) || null,
      status:         "pending",
    });
    if (error) throw error;
    console.log(`[FEEDBACK] "${product_name}" flagged as ${suggested_tier} (was ${returned_score}/10)`);
    res.json({ success: true });
  } catch (e) {
    console.error("[FEEDBACK] save error:", e.message);
    res.status(500).json({ error: "Could not save feedback" });
  }
});

app.get("/score-feedback", requireAdmin, async (req, res) => {
  if (!supabaseAdmin) return res.json([]);
  try {
    const status = req.query.status || "pending";
    const { data, error } = await supabaseAdmin
      .from("score_feedback")
      .select("id, product_name, category, returned_score, suggested_tier, note, user_email, created_at, status")
      .eq("status", status)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error("[FEEDBACK] fetch error:", e.message);
    res.status(500).json({ error: "Could not fetch feedback" });
  }
});

app.post("/score-feedback/resolve", requireAdmin, async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: "Not configured" });
  const { id, status } = req.body || {};
  if (!id || !["resolved", "dismissed", "pending"].includes(status)) {
    return res.status(400).json({ error: "id and valid status required" });
  }
  try {
    const { error } = await supabaseAdmin
      .from("score_feedback")
      .update({ status })
      .eq("id", id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ── DELETE ACCOUNT ────────────────────────────────────────────
app.post("/delete-account", requireUserAuth, async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: "Not configured" });
  // userId is derived from the verified JWT, not from the request body. Any
  // body.userId is ignored — users can only delete their own account.
  const userId = req.authUserId;
  try {
    // Cancel Stripe subscription if active
    if (stripe) {
      const { data: profile } = await supabaseAdmin
        .from("profiles").select("stripe_customer_id").eq("id", userId).single();
      if (profile?.stripe_customer_id) {
        const subs = await stripe.subscriptions.list({ customer: profile.stripe_customer_id, status: "active", limit: 5 });
        for (const sub of subs.data) {
          await stripe.subscriptions.cancel(sub.id);
        }
      }
    }
    // Delete profile row
    await supabaseAdmin.from("profiles").delete().eq("id", userId);
    // Delete Supabase auth user
    await supabaseAdmin.auth.admin.deleteUser(userId);
    console.log(`[DELETE ACCOUNT] User ${userId} deleted`);
    res.json({ ok: true });
  } catch(e) {
    console.error("[DELETE ACCOUNT]", e.message);
    res.status(500).json({ error: e.message });
  }
});


const stripe = process.env.STRIPE_SECRET_KEY ? require("stripe")(process.env.STRIPE_SECRET_KEY) : null;
const STRIPE_PRICE_ID      = process.env.STRIPE_PRICE_ID || "";       // price_xxx from Stripe dashboard
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || ""; // whsec_xxx from Stripe dashboard
const { createClient: createSupabaseClient } = require("@supabase/supabase-js");
const supabaseAdmin = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
  ? createSupabaseClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

// ── REGULATORY FLAGS — loaded from Supabase, injected into AI prompt ──
let REGULATORY_FLAGS_CACHE = [];
async function loadRegulatoryFlags() {
  if (!supabaseAdmin) return;
  try {
    const {data}=await supabaseAdmin.from("regulatory_flags").select("*").eq("active",true);
    if(data){REGULATORY_FLAGS_CACHE=data;console.log(`[Flags] Loaded ${data.length} regulatory flags`);}
  } catch(e){console.warn("[Flags] Load failed:",e.message);}
}
loadRegulatoryFlags();
setInterval(loadRegulatoryFlags,6*60*60*1000);

function buildRegulatoryContext(category) {
  if(!REGULATORY_FLAGS_CACHE.length)return "";
  const relevant=REGULATORY_FLAGS_CACHE.filter(f=>!f.applies_to_categories?.length||f.applies_to_categories.includes(category)||f.applies_to_categories.includes("general"));
  if(!relevant.length)return "";
  const lines=relevant.slice(0,15).map(f=>`- ${f.compound_name} (${f.jurisdiction}): ${f.action_type.replace(/_/g," ")} by ${f.regulatory_body}. ${f.scoring_context}`).join("\n");
  return `\nREGULATORY CONTEXT — apply these verified findings when relevant:\n${lines}\n`;
}

// Create Stripe checkout session
app.post("/create-checkout", async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Stripe not configured" });
  const { userId, email, promo } = req.body;
  if (!userId || !email) return res.status(400).json({ error: "userId and email required" });

  try {
    const params = {
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: email,
      line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL || "https://partiqule.com"}/account?subscribed=true`,
      cancel_url:  `${process.env.FRONTEND_URL || "https://partiqule.com"}/?cancelled=true`,
      metadata: { userId },
      allow_promotion_codes: true,
    };
    if (promo) {
      // Validate promo code
      const codes = await stripe.promotionCodes.list({ code: promo, active: true, limit: 1 });
      if (codes.data.length > 0) params.discounts = [{ promotion_code: codes.data[0].id }];
    }
    const session = await stripe.checkout.sessions.create(params);
    res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err.message);
    res.status(500).json({ error: "Could not create checkout session" });
  }
});

// Check subscription status by userId
app.get("/scan-count", async (req, res) => {
  if (!supabaseAdmin) return res.json({ scan_count: 0 });
  const { userId } = req.query;
  if (!userId) return res.json({ scan_count: 0 });
  try {
    const { data } = await supabaseAdmin.from("profiles").select("scan_count").eq("id", userId).single();
    res.json({ scan_count: data?.scan_count || 0 });
  } catch(e) {
    res.json({ scan_count: 0 });
  }
});

app.get("/subscription-status", async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: "Supabase not configured" });
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("is_subscribed, stripe_customer_id, subscription_ends_at")
      .eq("id", userId)
      .single();
    if (error) return res.json({ is_subscribed: false });
    res.json({ is_subscribed: !!data?.is_subscribed, ends_at: data?.subscription_ends_at || null });
  } catch (err) {
    res.json({ is_subscribed: false });
  }
});

// Stripe webhook — updates subscription status in Supabase
app.post("/stripe-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) return res.status(503).send("Stripe not configured");
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature failed:", err.message);
    return res.status(400).send("Webhook signature verification failed");
  }

  const setSubscribed = async (customerId, subscribed, endsAt = null) => {
    if (!supabaseAdmin) return;
    // Find user by stripe_customer_id
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .limit(1);
    if (!profiles?.length) return;
    await supabaseAdmin.from("profiles").update({
      is_subscribed: subscribed,
      subscription_ends_at: endsAt,
    }).eq("id", profiles[0].id);
    console.log(`[Stripe] ${subscribed ? "Activated" : "Deactivated"} subscription for customer ${customerId}`);
  };

  const session = event.data.object;

  switch (event.type) {
    case "checkout.session.completed": {
      // Link Stripe customer to Supabase user
      const userId = session.metadata?.userId;
      const customerId = session.customer;
      if (userId && customerId && supabaseAdmin) {
        await supabaseAdmin.from("profiles").upsert({
          id: userId,
          stripe_customer_id: customerId,
          is_subscribed: true,
          subscription_ends_at: null,
        });
        console.log(`[Stripe] Checkout complete — linked ${userId} to customer ${customerId}`);
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const active = session.status === "active" || session.status === "trialing";
      const endsAt = session.current_period_end
        ? new Date(session.current_period_end * 1000).toISOString()
        : null;
      await setSubscribed(session.customer, active, active ? null : endsAt);
      break;
    }
    case "invoice.payment_failed": {
      console.log(`[Stripe] Payment failed for customer ${session.customer}`);
      break;
    }
  }
  res.json({ received: true });
});

app.get("/cache-stats",  requireAdmin, (req, res) => res.json({ size: scoreCache.size, keys: [...scoreCache.keys()] }));
app.get("/cache-status", requireAdmin, (req, res) => res.json({ size: scoreCache.size, uptime: Math.round(process.uptime()), memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + "MB" }));

// Lets the admin UI verify the signed-in user's JWT is on the allowlist.
// requireAdmin already does the gating; this endpoint just echoes success.
app.get("/admin/me", requireAdmin, (req, res) => res.json({ isAdmin: true, email: req.adminEmail || null }));
let lastCacheClear = 0;
app.get("/cache-clear",  requireAdmin, (req, res) => {
  const now = Date.now();
  if (now - lastCacheClear < 60000) return res.status(429).json({ error: "Cache was cleared less than 60 seconds ago. Please wait." });
  lastCacheClear = now;
  scoreCache.clear();
  res.json({ cleared: true, message: "Score cache cleared — all products will be rescored on next scan" });
});

// ── Flag detection diff — compare AI-only vs AI+deterministic for a product ──
// POST with { productName } — runs pass1 once, computes scores with and
// without the flagDetection overlay. Use to sanity-check behavior on known
// products before trusting the integration at scale.
app.post("/admin/flag-detection-diff", requireAdmin, async (req, res) => {
  const productName = req.body?.productName;
  if (!productName || typeof productName !== "string" || productName.length > 300) {
    return res.status(400).json({ error: "productName (string) required" });
  }

  try {
    const category = detectCategory(productName) || "other";

    // Run pass1 ONCE without deterministic flags — this is the "old" behavior.
    const p1 = await pass1(productName, null, category, null);
    const aiSubstances = [
      ...(Array.isArray(p1.harmful_chemicals) ? p1.harmful_chemicals : []),
      ...(Array.isArray(p1.materials?.concerns) ? p1.materials.concerns : []),
    ];

    // Old scores: apply existing substance floors against AI-only output.
    let mOld  = p1.materials?.score      ?? 5;
    let uOld  = p1.usage_exposure?.score ?? 5;
    const pkOld = p1.packaging?.score    ?? 5;
    const sOld  = p1.sustainability?.score ?? 5;
    const oldFloors = applySubstanceFloors(mOld, uOld, p1, null);
    mOld = oldFloors.mScore;
    uOld = oldFloors.uScore;
    const oldScore = computeScore(mOld, uOld, pkOld, sOld, p1.category || category);

    // Run deterministic detection on AI-captured ingredient_list.
    const ingredientText = Array.isArray(p1.ingredient_list) ? p1.ingredient_list.join(", ") : "";
    const deterministic = detectDeterministicFlags(ingredientText, p1.category || category);
    const validation = validateDeterministicFlags(aiSubstances, deterministic);
    const merged = mergeDeterministicFlags(aiSubstances, deterministic);

    // New scores: append missing deterministic findings to raw_concerns so the
    // floor matcher picks them up, then recompute.
    const p1Augmented = { ...p1, harmful_chemicals: merged };
    if (validation.missingFromAI.length > 0) {
      const raw = Array.isArray(p1.raw_concerns) ? [...p1.raw_concerns] : [];
      for (const m of validation.missingFromAI) raw.push(`${m} (deterministic detection)`);
      p1Augmented.raw_concerns = raw;
    }
    let mNew = p1.materials?.score      ?? 5;
    let uNew = p1.usage_exposure?.score ?? 5;
    const newFloors = applySubstanceFloors(mNew, uNew, p1Augmented, null);
    mNew = newFloors.mScore;
    uNew = newFloors.uScore;
    const newScore = computeScore(mNew, uNew, pkOld, sOld, p1.category || category);

    res.json({
      productName,
      category: p1.category || category,
      oldScore,
      oldConcerns: aiSubstances,
      newScore,
      newConcerns: merged,
      changed: oldScore !== newScore || JSON.stringify(aiSubstances) !== JSON.stringify(merged),
      deterministicFlags: deterministic.summary,
      aiInconsistencies: {
        consistent: validation.consistent,
        missingFromAI: validation.missingFromAI,
        extraInAI: validation.extraInAI,
      },
      oldFloorsTriggered: oldFloors.triggered,
      newFloorsTriggered: newFloors.triggered,
      flagDetectionEnabled: FLAG_DETECTION_ENABLED,
    });
  } catch (e) {
    console.error("[flag-detection-diff] error:", e.message);
    res.status(500).json({ error: "diff failed" });
  }
});

// View or reset API spend budget
app.get("/admin/api-budget", requireAdmin, async (req, res) => {
  await loadApiCounts();
  if (req.query.reset === "day")   { apiCallCounts.day = 0;   if (hasRedis) redisSet(apiCallCounts.dayKey, 0); }
  if (req.query.reset === "month") { apiCallCounts.month = 0; if (hasRedis) redisSet(apiCallCounts.monthKey, 0); }
  res.json({
    today:     { used: apiCallCounts.day,   cap: API_DAILY_CAP,   remaining: API_DAILY_CAP - apiCallCounts.day },
    thisMonth: { used: apiCallCounts.month, cap: API_MONTHLY_CAP, remaining: API_MONTHLY_CAP - apiCallCounts.month },
  });
});

// Recent scans — returns last N cached product names and scores for admin dashboard
app.get("/recent-scans", requireAdmin, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const offset = parseInt(req.query.offset) || 0;
  const category = req.query.category || null;
  const minScore = parseInt(req.query.min_score) || null;
  const search = req.query.search || null;

  // Pull from Supabase for persistent, cross-session history
  if (supabaseAdmin) {
    try {
      let query = supabaseAdmin
        .from("scans")
        .select("product_name, category, score, result_json, scanned_at, platform")
        .order("scanned_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (category) query = query.eq("category", category);
      if (minScore)  query = query.gte("score", minScore);
      if (search)    query = query.ilike("product_name", `%${search}%`);

      const { data, error } = await query;
      if (!error && data) {
        return res.json(data.map(row => ({
          product_name:       row.product_name,
          score:              row.score,
          category:           row.category,
          scanned_at:         row.scanned_at,
          platform:           row.platform || null,
          flagged_substances: row.result_json?.concerns || [],
          confidence:         row.result_json?.confidence || null,
          cached:             row.result_json?.cached || false,
          child_score:        row.result_json?.child_score || null,
          summary:            row.result_json?.summary || null,
        })));
      }
    } catch(e) { console.error("[RECENT-SCANS]", e.message); }
  }

  // Fallback: in-memory cache
  const entries = [...scoreCache.entries()].slice(-limit).reverse().map(([key, val]) => ({
    product_name:       val.product_name || key,
    score:              val.overall_score || val.score || null,
    category:           val.category || null,
    scanned_at:         null,
    flagged_substances: val.concerns || [],
    confidence:         val.confidence || null,
    cached:             true,
  }));
  res.json(entries);
});

// ── APPLE IAP — STUBS (ready to implement post-approval) ──────
const APPLE_SHARED_SECRET = process.env.APPLE_SHARED_SECRET || "";

// Receipt verification — called by iOS app after purchase
// TODO: implement full receipt verification with Apple sandbox/production endpoints
app.post("/verify-apple-receipt", async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: "Not configured" });
  const { receipt, userId } = req.body;
  if (!receipt || !userId) return res.status(400).json({ error: "receipt and userId required" });
  try {
    // Placeholder — verify receipt with Apple and activate subscription
    // Will call https://buy.itunes.apple.com/verifyReceipt (prod) or
    // https://sandbox.itunes.apple.com/verifyReceipt (sandbox)
    // For now just log and return pending
    console.log(`[APPLE IAP] Receipt verification pending for user ${userId}`);
    res.json({ ok: false, message: "Apple IAP verification not yet implemented" });
  } catch(e) {
    console.error("[APPLE IAP]", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Apple App Store Server Notifications — called by Apple when subscription status changes
// TODO: parse and verify Apple signed JWT notifications
app.post("/apple-webhook", async (req, res) => {
  try {
    // Always return 200 so Apple doesn't retry indefinitely
    // Will implement JWT verification and subscription activation here
    console.log("[APPLE WEBHOOK] Notification received — implementation pending");
    res.status(200).json({ ok: true });
  } catch(e) {
    console.error("[APPLE WEBHOOK]", e.message);
    res.status(200).json({ ok: true }); // still return 200
  }
});


// ── PRICE LOOKUP — lightweight product price search ──
app.get("/api/price-lookup", async (req, res) => {
  const { query } = req.query;
  if (!query) return res.json({ price: null });
  try {
    if (!isPaApiConfigured()) return res.json({ price: null, source: "unavailable" });
    const results = await getAmazonAlternatives(query, "other", []);
    if (!results || results.length === 0) return res.json({ price: null, source: "amazon" });
    const item = results[0];
    const price = item.price || item.lowestPrice || null;
    return res.json({ price: price ? parseFloat(price) : null, source: "amazon", asin: item.asin || null, title: item.title || null });
  } catch (e) {
    return res.json({ price: null, source: "error" });
  }
});

// ── INTELLIGENCE CARDS — admin-curated live cards ──
app.get("/api/intelligence-cards", async (req, res) => {
  try {
    if (!supabaseAdmin) return res.json({ cards: [] });
    const now = new Date().toISOString();
    const isAdmin = req.query.key === ADMIN_KEY || req.headers["x-admin-key"] === ADMIN_KEY;
    let query = supabaseAdmin.from("intelligence_cards").select("*");
    if (!isAdmin) query = query.eq("active", true).or(`expires_at.is.null,expires_at.gt.${now}`);
    const { data, error } = await query.order("priority", { ascending: false }).limit(50);
    if (error) throw error;
    return res.json({ cards: data || [] });
  } catch (e) {
    console.error("Intelligence cards error:", e.message);
    return res.json({ cards: [] });
  }
});

const INTEL_CARD_FIELDS = [
  "headline","body","label","label_color","action_text",
  "action_url","action_page","ingredient_triggers",
  "category_triggers","product_families","specific_products",
  "source_name","source_url","priority","active","expires_at",
];
function sanitizeIntelCard(body) {
  const clean = {};
  for (const key of INTEL_CARD_FIELDS) {
    if (body[key] !== undefined) {
      clean[key] = typeof body[key] === "string" ? body[key].slice(0, 2000) : body[key];
    }
  }
  return clean;
}

app.post("/api/intelligence-cards", requireAdmin, async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(500).json({ error: "Supabase not configured" });
    const card = sanitizeIntelCard(req.body);
    if (!card.headline) return res.status(400).json({ error: "headline is required" });
    const { data, error } = await supabaseAdmin.from("intelligence_cards").insert([card]).select();
    if (error) throw error;
    return res.json({ ok: true, card: data?.[0] });
  } catch (e) { return res.status(500).json({ error: "Failed to create card" }); }
});

app.patch("/api/intelligence-cards/:id", requireAdmin, async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(500).json({ error: "Supabase not configured" });
    const card = sanitizeIntelCard(req.body);
    const { data, error } = await supabaseAdmin.from("intelligence_cards").update(card).eq("id", req.params.id).select();
    if (error) throw error;
    return res.json({ ok: true, card: data?.[0] });
  } catch (e) { return res.status(500).json({ error: "Failed to update card" }); }
});

app.delete("/api/intelligence-cards/:id", requireAdmin, async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(500).json({ error: "Supabase not configured" });
    const { error } = await supabaseAdmin.from("intelligence_cards").delete().eq("id", req.params.id);
    if (error) throw error;
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: "Failed to delete card" }); }
});

// ── RECIPE INGREDIENTS — AI-powered ingredient expansion ──
app.post("/api/recipe-ingredients", rateLimit, async (req, res) => {
  const { dish, servings } = req.body;
  if (!dish || !dish.trim()) return res.status(400).json({ error: "dish is required" });
  const cleanDish = dish.trim().slice(0, 200).replace(/["\\\n\r]/g, " ");
  const cleanServings = Math.max(1, Math.min(100, parseInt(servings) || 4));
  try {
    const system = `You are a culinary expert and nutritionist. Return raw JSON only, no markdown, no explanation.`;
    const userPrompt = `The user wants to make: "${cleanDish}"
Servings: ${cleanServings}

Return a JSON object with this exact shape:
{
  "dish": "Clean formatted dish name",
  "servings": ${cleanServings},
  "ingredients": [
    { "name": "specific product to buy at grocery store", "quantity": "amount with unit", "category": "food", "notes": "optional brand suggestion" }
  ]
}

Rules:
- List only ingredients the user needs to BUY — not pantry staples like salt, pepper, olive oil unless special version required
- Use specific scannable product names e.g. "chicken breast" not "protein"
- Include brand suggestions in notes when a cleaner option exists
- Maximum 15 ingredients, minimum 3
- category must be one of: food, food_beverage, beverage, cleaning, personal_care, baby, supplement, other`;

    const parsed = await callClaude(system, userPrompt, 1000, 2);
    if (!parsed.ingredients || !Array.isArray(parsed.ingredients)) throw new Error("Invalid ingredient list shape");
    return res.json(parsed);
  } catch (e) {
    console.error("Recipe ingredients error:", e.message);
    return res.status(500).json({ error: "Could not generate ingredient list" });
  }
});

// ── INTELLIGENCE FEED — automated RSS → Claude → Supabase ──
const INTELLIGENCE_RSS_FEEDS = [
  {name:"EFSA",url:"https://www.efsa.europa.eu/en/rss/rss.xml",jurisdiction:"EU",credibility:"regulatory"},
  {name:"ECHA",url:"https://echa.europa.eu/rss/home",jurisdiction:"EU",credibility:"regulatory"},
  {name:"CHEM Trust",url:"https://chemtrust.org/feed/",jurisdiction:"EU",credibility:"research"},
  {name:"Environmental Health News",url:"https://www.ehn.org/feed",jurisdiction:"International",credibility:"research"},
  {name:"EWG",url:"https://www.ewg.org/news-insights/rss.xml",jurisdiction:"US",credibility:"advocacy"},
  {name:"FDA Recalls",url:"https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/recalls/rss.xml",jurisdiction:"US",credibility:"regulatory"},
  {name:"Consumer Reports",url:"https://www.consumerreports.org/feed/",jurisdiction:"US",credibility:"consumer"},
  {name:"Campaign for Safe Cosmetics",url:"https://www.safecosmetics.org/feed/",jurisdiction:"US",credibility:"advocacy"},
  {name:"Mamavation",url:"https://www.mamavation.com/feed",jurisdiction:"US",credibility:"consumer"},
  {name:"Scientific American",url:"https://www.scientificamerican.com/feed/",jurisdiction:"International",credibility:"peer-reviewed"},
  {name:"The Guardian Environment",url:"https://www.theguardian.com/environment/rss",jurisdiction:"International",credibility:"journalism"},
  {name:"Health and Environment Alliance",url:"https://www.env-health.org/feed/",jurisdiction:"EU",credibility:"advocacy"},
  {name:"PAN Europe",url:"https://www.pan-europe.info/feed",jurisdiction:"EU",credibility:"advocacy"},
  {name:"Environmental Defence",url:"https://environmentaldefence.ca/feed/",jurisdiction:"International",credibility:"advocacy"},
  {name:"Breast Cancer Prevention Partners",url:"https://www.bcpp.org/feed/",jurisdiction:"US",credibility:"advocacy"},
  {name:"Toxic-Free Future",url:"https://toxicfreefuture.org/feed/",jurisdiction:"US",credibility:"advocacy"},
  {name:"Food Safety News",url:"https://www.foodsafetynews.com/feed/",jurisdiction:"US",credibility:"journalism"},
  {name:"Pesticide Action Network",url:"https://www.panna.org/feed",jurisdiction:"US",credibility:"advocacy"},
];

const INTELLIGENCE_KEYWORDS = ["PFAS","forever chemicals","forever chemical","perfluoroalkyl","PFOA","PFOS","DWR coating","Red 40","titanium dioxide","BHT","BHA","TBHQ","sodium nitrite","aspartame","artificial dye","food coloring","glyphosate","pesticide","chlorpyrifos","atrazine","Dirty Dozen","BPA","BPS","bisphenol","phthalate","DBP","DEHP","DEP","microplastic","nanoplastic","microfiber","endocrine disruptor","endocrine disrupting","paraben","oxybenzone","octinoxate","avobenzone","homosalate","benzophenone","triclosan","formaldehyde","lead","cadmium","arsenic","mercury","carcinogen","carcinogenic","IARC","banned","recall","hormone disruptor","hormone disrupting","toxic chemical","neurotoxin","neurotoxic","reproductive toxin","developmental toxin","obesogen","food recall","food safety","food additive","ultra-processed","ultraprocessed","added sugar","high fructose","HFCS","nitrate","nitrite","acrylamide","potassium bromate","azodicarbonamide","BVO","brominated vegetable oil","organophosphate","neonicotinoid","fungicide","chlormequat","1,4-dioxane","coal tar","hydroquinone","nanoparticle","PVC","styrene","vinyl chloride","polycarbonate","food packaging","food contact material","non-stick coating","Teflon","PTFE","VOC","volatile organic","flame retardant","PBDE","benzene in","cleaning product safety","synthetic fragrance","air freshener","children chemical","baby product chemical","infant exposure","prenatal exposure","toy chemical","banned substance","restricted substance","SVHC","REACH restriction","EU restriction","California Prop 65","product recall","consumer alert","safety warning"];

async function fetchRSSFeed(feed) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(feed.url, {signal:controller.signal, headers:{"User-Agent":"Partiqule/1.0","Accept":"application/rss+xml, application/xml, text/xml"}});
    clearTimeout(timeout);
    if (!res.ok) return [];
    const text = await res.text();
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(text)) !== null) {
      const item = match[1];
      const getTag = (tag) => {const m = item.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`)) || item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`)); return m ? m[1].trim().replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/<[^>]+>/g,"").trim() : "";};
      const title = getTag("title");
      const description = getTag("description");
      const link = getTag("link");
      const pubDate = getTag("pubDate");
      if (!title) continue;
      const content = `${title} ${description}`.toLowerCase();
      const matchedKeywords = INTELLIGENCE_KEYWORDS.filter(kw => content.includes(kw.toLowerCase()));
      if (matchedKeywords.length === 0) continue;
      if (pubDate) { const pub = new Date(pubDate); if (Date.now() - pub.getTime() > 14*24*60*60*1000) continue; }
      items.push({title, description:description.slice(0,500), link, pubDate, source:feed.name, jurisdiction:feed.jurisdiction, credibility:feed.credibility, matchedKeywords});
    }
    return items;
  } catch (e) { console.warn(`[Intel] RSS fetch failed for ${feed.name}:`, e.message); return []; }
}

async function writeIntelligenceCard(article) {
  const jn = article.jurisdiction==="EU"?"This is an EU regulatory action. Use language like 'banned in the EU' or 'EFSA has determined'.":article.jurisdiction==="International"?"This is peer-reviewed international research. Use language like 'research published in [journal] found'.":"This is a US source. Use factual language about what was found or announced.";
  const cn = article.credibility==="peer-reviewed"?"This comes from peer-reviewed research. Use 'researchers found' or 'a study published in [journal] found'.":article.credibility==="regulatory"?"This is an official regulatory action. Use definitive language — 'banned', 'restricted', 'classified as unsafe'.":article.credibility==="consumer"?"This is consumer research or testing. Use 'testing found' or 'lab analysis revealed'.":article.credibility==="journalism"?"This is investigative journalism. Use 'an investigation found' or 'reporting revealed'.":"This is from an advocacy organization. Use 'according to [source]' to attribute appropriately.";

  const userPrompt = `${jn}
${cn}
Source: ${article.source} (${article.jurisdiction}, ${article.credibility})
Headline: ${article.title}
Summary: ${article.description}
Keywords: ${article.matchedKeywords.join(", ")}

Return a card as raw JSON with exactly these fields:
{
  "headline": "max 60 chars",
  "body": "max 120 chars",
  "label": "max 20 chars",
  "label_color": "#d97706 or #dc2626 or #2563eb",
  "action_text": "max 20 chars",
  "action_url": "${article.link}",
  "product_families": ["one to three values from the canonical list, or empty"],
  "specific_products": ["specific product SKU names, or empty"],
  "ingredient_triggers": ["specific compound names, or empty"],
  "category_triggers": ["personal_care, baby, food, cleaning, clothing — derived from topic"],
  "priority": 7,
  "source_name": "${article.source}",
  "source_url": "${article.link}"
}

CANONICAL product_families list — use these exact strings, no others:
${CANONICAL_FAMILIES.join(", ")}

FIELD RULES — be strict:
- product_families: if the article concerns personal-care product(s), pick 1 to 3 families from the canonical list. Match the NARROWEST family — a nail polish remover recall is ["nail_polish_remover"], not ["nail_polish","nail_polish_remover"]. If the article concerns food, cleaning, clothing, home, or any non-personal-care topic, leave this as []. The canonical list is the only allowed vocabulary; invented values will be dropped. If product_families would be empty because the card is about a non-personal-care category, you MUST populate either specific_products or ingredient_triggers to give the card a matching anchor. A card with all three targeting fields empty will be REJECTED and not saved.
- specific_products: populate ONLY when the article names a specific product SKU that is being recalled or flagged (e.g., ["Blaine Labs Wound Care Gel"]). Leave [] for ingredient-level or class-level concerns. Do not include brand names alone unless the brand is the SKU (e.g., "Carmex", "ChapStick Classic").
- ingredient_triggers: populate ONLY when the concern is a specific chemical compound present in products (e.g., ["cyclopentasiloxane","methylparaben","Red 40"]). Leave [] when the concern is a manufacturing process, supply-chain issue, or product class with no named compound.
- category_triggers: broad-bucket labels for backward compatibility with legacy matching. Derive from product_families (any baby_* family → "baby", any other personal-care family → "personal_care") or from the article topic for non-personal-care cards (food articles → "food", cleaning → "cleaning").

Tone: honest, specific, never alarmist. Name compounds. Give regulatory context. Return raw JSON only — no markdown, no preamble.`;

  try {
    const card = await callClaude(
      `You are writing a short consumer safety alert card for the Partiqule app. Our audience: health-conscious parents and families. We name compounds, give regulatory context, and never exaggerate. Return ONLY valid JSON.`,
      userPrompt,
      700, 2
    );
    if (!card || !card.headline || !card.body) return null;

    // Normalize array fields and enforce canonical vocabulary on product_families
    const canon = new Set(CANONICAL_FAMILIES);
    const rawFamilies = Array.isArray(card.product_families) ? card.product_families : [];
    card.product_families = rawFamilies.filter(f => canon.has(f));
    const dropped = rawFamilies.filter(f => !canon.has(f));
    if (dropped.length > 0) {
      console.warn(`[Intel] Dropped non-canonical product_families from "${card.headline}": ${dropped.join(", ")}`);
    }
    card.specific_products = Array.isArray(card.specific_products) ? card.specific_products.filter(s => typeof s === "string" && s.trim()) : [];
    card.ingredient_triggers = Array.isArray(card.ingredient_triggers) ? card.ingredient_triggers : [];
    card.category_triggers = Array.isArray(card.category_triggers) ? card.category_triggers : [];

    // Guard against cards with no targeting anchor. Such a card would fire
    // on every scan globally — almost never the intent.
    if (isOverBroadCard(card)) {
      console.warn(`[Intel] Rejecting over-broad card (no targeting fields): "${card.headline}"`);
      return null;
    }
    return card;
  } catch (e) { console.warn("[Intel] Card write failed:", e.message); return null; }
}

app.get("/api/intelligence/all", requireAdmin, async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({cards:[]});
  try {
    const {data,error} = await supabaseAdmin.from("intelligence_cards").select("*,regulatory_flags(id,compound_name,action_type,jurisdiction)").order("created_at",{ascending:false}).limit(50);
    if (error) throw error;
    return res.json({cards:data||[]});
  } catch(e) { return res.status(500).json({error:e.message}); }
});

app.post("/api/intelligence/approve/:id", requireAdmin, async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({error:"Supabase not configured"});
  const {id}=req.params;
  try {
    const {data:card,error:fe}=await supabaseAdmin.from("intelligence_cards").select("*").eq("id",id).single();
    if(fe||!card)throw new Error("Card not found");
    if (isOverBroadCard(card)) {
      console.warn(`[Intel] Rejecting over-broad approval (no targeting fields): "${card.headline}" (${id})`);
      return res.status(400).json({error:"Card has no targeting fields (product_families, specific_products, ingredient_triggers all empty). Add at least one before approving."});
    }
    const {error:ue}=await supabaseAdmin.from("intelligence_cards").update({active:true}).eq("id",id);
    if(ue)throw ue;
    // Extract regulatory flags via Claude
    if(card.ingredient_triggers?.length>0){
      try{
        const flags=await callClaude(
          `Extract regulatory flag data from this intelligence card. Return a JSON array of flags. If no clear regulatory action exists, return [].`,
          `Headline: ${card.headline}\nBody: ${card.body}\nLabel: ${card.label}\nSource: ${card.source_name}\nIngredients: ${card.ingredient_triggers.join(", ")}\nCategories: ${card.category_triggers?.join(", ")||"general"}\n\nFor each ingredient with a clear regulatory action, return:\n[{"compound_name":"name","regulatory_body":"EFSA|FDA|EPA|ECHA","action_type":"banned|restricted|under_review|linked_to_harm|recall|warning_label_required","jurisdiction":"EU|US|International","health_concern":"max 10 words","applies_to_categories":["food"],"scoring_context":"one factual sentence for AI prompt, max 30 words"}]\nReturn raw JSON only.`,
          800,2
        );
        if(Array.isArray(flags)&&flags.length>0){
          for(const f of flags){
            await supabaseAdmin.from("regulatory_flags").insert({intelligence_card_id:id,compound_name:f.compound_name,regulatory_body:f.regulatory_body,action_type:f.action_type,jurisdiction:f.jurisdiction,effective_date:f.effective_date||null,health_concern:f.health_concern,applies_to_categories:f.applies_to_categories||[],scoring_context:f.scoring_context,active:true,created_by:"auto-approved"});
          }
          console.log(`[Intel] Created ${flags.length} regulatory flags for card ${id}`);
          await loadRegulatoryFlags();
        }
      }catch(e){console.warn("[Intel] Flag extraction failed:",e.message);}
    }
    global.intelCardsUpdatedAt=Date.now();
    return res.json({success:true});
  } catch(e) { return res.status(500).json({error:e.message}); }
});

app.delete("/api/intelligence/dismiss/:id", requireAdmin, async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({error:"Supabase not configured"});
  try {
    const {error} = await supabaseAdmin.from("intelligence_cards").delete().eq("id",req.params.id);
    if (error) throw error;
    return res.json({success:true});
  } catch(e) { return res.status(500).json({error:e.message}); }
});

app.post("/api/intelligence/run", requireAdmin, async (req, res) => {
  console.log("[Intel] Starting intelligence feed run...");
  if (!supabaseAdmin) return res.status(503).json({error:"Supabase not configured"});
  const results = {feeds_checked:0, articles_found:0, cards_written:0, cards_saved:0, errors:[]};
  try {
    const feedResults = await Promise.allSettled(INTELLIGENCE_RSS_FEEDS.map(f=>fetchRSSFeed(f)));
    const allArticles = [];
    feedResults.forEach((r,i)=>{results.feeds_checked++;if(r.status==="fulfilled")allArticles.push(...r.value);else results.errors.push(`${INTELLIGENCE_RSS_FEEDS[i].name}: ${r.reason?.message}`);});
    results.articles_found = allArticles.length;
    console.log(`[Intel] Found ${allArticles.length} relevant articles`);
    if (allArticles.length === 0) return res.json({...results, message:"No relevant articles found today"});

    // Dedup only against currently-active cards so that soft-deleted and
    // dismissed drafts do not block regeneration of their source articles.
    const {data:existing} = await supabaseAdmin.from("intelligence_cards").select("source_url,headline").gte("created_at",new Date(Date.now()-14*24*60*60*1000).toISOString()).eq("active", true);
    const existingUrls = new Set((existing||[]).map(c=>c.source_url));
    const existingHeadlines = new Set((existing||[]).map(c=>c.headline?.toLowerCase().slice(0,30)));
    const newArticles = allArticles.filter(a=>!existingUrls.has(a.link)&&!existingHeadlines.has(a.title?.toLowerCase().slice(0,30)));
    console.log(`[Intel] ${newArticles.length} new articles after dedup`);

    const prioritized = newArticles.sort((a,b)=>b.matchedKeywords.length-a.matchedKeywords.length).slice(0,10);
    for (const article of prioritized) {
      await new Promise(r=>setTimeout(r,1500));
      const card = await writeIntelligenceCard(article);
      results.cards_written++;
      if (!card) continue;
      const {error} = await supabaseAdmin.from("intelligence_cards").insert({...card, active:false, expires_at:new Date(Date.now()+14*24*60*60*1000).toISOString()});
      if (!error) { results.cards_saved++; console.log(`[Intel] Saved draft: ${card.headline}`); }
      else results.errors.push(`Save failed: ${error.message}`);
    }

    if (results.cards_saved > 0 && process.env.LOOPS_API_KEY) {
      try { await fetch("https://app.loops.so/api/v1/transactional",{method:"POST",headers:{"Authorization":`Bearer ${process.env.LOOPS_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({transactionalId:"intelligence_digest",email:"paul@partiqule.com",dataVariables:{cards_saved:results.cards_saved,articles_found:results.articles_found,date:new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}})}); } catch {}
    }
    console.log("[Intel] Run complete:", results);
    return res.json(results);
  } catch (e) { console.error("[Intel] Run failed:", e.message); return res.status(500).json({...results, error:e.message}); }
});

app.get("/health", (req, res) => res.json({
  status: "ok",
  paApi: isPaApiConfigured() ? "active" : "not configured - using static database",
  cachedProducts: scoreCache.size,
  cacheFile: fs.existsSync(CACHE_FILE) ? `${Math.round(fs.statSync(CACHE_FILE).size/1024)}KB` : "none",
  uptime: Math.round(process.uptime()) + "s",
}));

// ── PHASE 1 SPIKE: throwaway streaming endpoint ──────────────
// Verifies whether chunked JSON streaming arrives incrementally
// through the Capacitor iOS WebView, or buffers until response
// completion. Emits 3 newline-delimited JSON chunks at 1s, 2s, 4s
// (4s total wall time). DELETE THIS ENDPOINT once Phase 1 is decided.
app.get("/spike/stream", async (req, res) => {
  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache, no-store, no-transform");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx-style proxy buffering if any
  res.flushHeaders?.();

  const emit = (obj) => {
    res.write(JSON.stringify({ ...obj, server_ts: Date.now() }) + "\n");
    if (typeof res.flush === "function") res.flush();
  };

  const start = Date.now();
  emit({ stage: "first", elapsed_ms: 0 });
  await new Promise(r => setTimeout(r, 1000));
  emit({ stage: "second", elapsed_ms: Date.now() - start });
  await new Promise(r => setTimeout(r, 1000));
  emit({ stage: "third", elapsed_ms: Date.now() - start });
  await new Promise(r => setTimeout(r, 2000));
  emit({ stage: "done", elapsed_ms: Date.now() - start });
  res.end();
});

// Minimum app version gate. The frontend calls this on boot, compares the
// returned ios_min / web_min against its own APP_VERSION constant, and
// renders an Update Required screen if it's older. Bump these env vars in
// Railway whenever you ship a breaking backend change (auth requirements,
// schema migration, response shape) so old clients get a friendly nudge to
// the App Store instead of a silent broken experience.
//
// Defaults are permissive — set MIN_IOS_VERSION / MIN_WEB_VERSION env vars
// in Railway after the first iOS submission lands to start enforcing.
app.get("/min-version", (req, res) => {
  res.set("Cache-Control", "public, max-age=300"); // 5 min CDN cache
  res.json({
    ios_min: process.env.MIN_IOS_VERSION || "1.0.0",
    web_min: process.env.MIN_WEB_VERSION || "1.0.0",
    update_url: {
      ios:  process.env.APP_STORE_URL || null,
      web:  "https://partiqule.com",
    },
  });
});

const PORT = process.env.PORT || 3001;

// ── Apple IAP confirmation — called after successful StoreKit purchase ──
// Requires an authenticated user (Supabase JWT in Authorization header) — any
// trusted-client userId in the body is ignored. Also verifies the Apple
// receipt cryptographically so an authenticated user cannot fabricate a
// transactionId to grant themselves premium. Before these gates landed, this
// endpoint accepted any {userId, transactionId} pair from any caller and
// flipped profiles.is_subscribed to true — a trivial path to free premium.
async function verifyAppleReceipt(receipt, expectedProductId) {
  // StoreKit 2 returns a signed JWS in `receipt`. Parse the payload without
  // full signature verification (rotating trust roots is a heavier lift —
  // worth doing but beyond the scope of this auth patch) and at least confirm
  // the bundle/product/environment match. Non-JWS receipts (legacy base64
  // bodies) fall back to Apple's verifyReceipt endpoint.
  if (typeof receipt !== "string" || receipt.length < 20) return { ok: false, reason: "empty_receipt" };
  // JWS = three base64url-safe segments joined by "." — header.payload.signature
  const jwsMatch = receipt.match(/^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
  if (jwsMatch) {
    try {
      const payloadB64 = jwsMatch[2].replace(/-/g, "+").replace(/_/g, "/");
      const padded = payloadB64 + "=".repeat((4 - (payloadB64.length % 4)) % 4);
      const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
      if (payload.bundleId !== "com.partiqule.app") return { ok: false, reason: `wrong_bundle:${payload.bundleId}` };
      if (payload.productId !== expectedProductId)   return { ok: false, reason: `wrong_product:${payload.productId}` };
      // environment === "Sandbox" | "Production" — we accept both since
      // TestFlight uses Sandbox. Rejecting Sandbox would break Apple review.
      return { ok: true, payload, env: payload.environment };
    } catch (e) {
      return { ok: false, reason: `jws_parse_failed:${e.message}` };
    }
  }
  // Legacy verifyReceipt path — used only if the frontend sent a base64
  // app-receipt instead of a JWS transaction. Kept for completeness.
  if (!process.env.APPLE_SHARED_SECRET) return { ok: false, reason: "shared_secret_missing" };
  try {
    const body = JSON.stringify({ "receipt-data": receipt, password: process.env.APPLE_SHARED_SECRET });
    let r = await fetch("https://buy.itunes.apple.com/verifyReceipt", { method: "POST", body });
    let d = await r.json();
    if (d.status === 21007) {
      r = await fetch("https://sandbox.itunes.apple.com/verifyReceipt", { method: "POST", body });
      d = await r.json();
    }
    if (d.status !== 0) return { ok: false, reason: `apple_status:${d.status}` };
    const bundleOk = d.receipt?.bundle_id === "com.partiqule.app";
    if (!bundleOk) return { ok: false, reason: `wrong_bundle:${d.receipt?.bundle_id}` };
    return { ok: true, payload: d.receipt };
  } catch (e) {
    return { ok: false, reason: `verifyReceipt_failed:${e.message}` };
  }
}

app.post('/apple-iap-confirm', requireUserAuth, async (req, res) => {
  const { transactionId, receipt } = req.body;
  const userId = req.authUserId;
  if (!transactionId) return res.status(400).json({ error: 'Missing transactionId' });
  if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase admin not configured' });

  // Cryptographic receipt check — guards against an authenticated user
  // submitting a fabricated transactionId for a product they did not buy.
  const verification = await verifyAppleReceipt(receipt, "com.partiqule.app.premium.monthly");
  if (!verification.ok) {
    console.warn("[IAP] receipt verification failed", { userId, reason: verification.reason });
    return res.status(403).json({ error: "Receipt verification failed", reason: verification.reason });
  }

  try {
    // Flip profiles.is_subscribed so /subscription-status returns true on
    // subsequent app launches. This is what checkSubscription() reads.
    // Without this step the purchase appears to succeed in-session but reverts
    // on the next app reload.
    const { error: profErr } = await supabaseAdmin.from('profiles')
      .update({ is_subscribed: true })
      .eq('id', userId);
    if (profErr) throw profErr;

    console.log('[IAP] Apple subscription confirmed for user', userId, 'txn', transactionId, 'env', verification.env || 'unknown');
    res.json({ ok: true });
  } catch(e) {
    console.error('[IAP] Confirm error:', e.message);
    res.status(500).json({ error: e.message });
  }
});
app.listen(PORT, () => {
  console.log(`Partiqule API running on port ${PORT}`);
  console.log(`[ENV] Stripe: ${process.env.STRIPE_SECRET_KEY ? "configured" : "MISSING"}`);
  console.log(`[ENV] Supabase: ${process.env.SUPABASE_URL ? "configured" : "MISSING"}`);
  console.log(`[ENV] Apple IAP: ${process.env.APPLE_SHARED_SECRET ? "configured" : "pending - add APPLE_SHARED_SECRET when ready"}`);
  console.log(`[CACHE] Prompt version: ${promptVersion()} — old-prefix entries are unreachable until Redis TTL expires them`);

  // Daily intelligence feed scheduler — 7am UTC
  if (supabaseAdmin) {
    const scheduleIntelFeed = () => {
      const now=new Date();const next=new Date();next.setUTCHours(7,0,0,0);
      if(next<=now)next.setUTCDate(next.getUTCDate()+1);
      const ms=next.getTime()-now.getTime();
      console.log(`[Intel] Next feed run in ${Math.round(ms/1000/60)} minutes`);
      setTimeout(async()=>{
        console.log("[Intel] Running scheduled daily feed...");
        try{const r=await fetch(`http://localhost:${PORT}/api/intelligence/run`,{method:"POST",headers:{"Content-Type":"application/json","x-admin-key":ADMIN_KEY}});const d=await r.json();console.log("[Intel] Scheduled run complete:",d);}catch(e){console.error("[Intel] Scheduled run failed:",e.message);}
        scheduleIntelFeed();
      },ms);
    };
    scheduleIntelFeed();
  }

  // Pre-warm cache with top in-store products after a short delay
  // Runs in background — never blocks requests
  setTimeout(warmCache, 8000);
  // Auto-warm from Supabase scan history — picks up real user patterns
  setTimeout(autoWarmFromSupabase, 15000);
});

// ── CACHE WARM LIST ───────────────────────────────────────────
// Products most likely to be scanned in stores.
// Calibration hits are instant — this just ensures they're in memory.
// AI products pre-score in background so first real user gets instant result.
const WARM_LIST = [
  // ── BABY / KIDS AISLE ────────────────────────────────
  "Carter's cotton pajamas",
  "Carter's polyester pajamas",
  "Carter's onesie",
  "KicKee Pants pajamas",
  "Little Sleepies pajamas",
  "Kyte Baby pajamas",
  "Hanna Andersson pajamas",
  "Leveret pajamas",
  "Simple Joys pajamas",
  "Burt's Bees Baby pajamas",
  "Pampers Swaddlers",
  "Huggies Little Snugglers",
  "Luvs diapers",
  "Honest Company diapers",
  "Seventh Generation diapers",
  "Coterie diapers",
  "Andy Pandy diapers",
  "WaterWipes",
  "Pampers Sensitive wipes",
  "Huggies Natural Care wipes",
  // ── KIDS SNACKS ──────────────────────────────────────
  "Goldfish crackers",
  "Goldfish Colors",
  "Goldfish Whole Grain",
  "Annie's Cheddar Bunnies",
  "Pirate's Booty",
  "Cheetos",
  "Welch's Fruit Snacks",
  "Annie's Organic Fruit Snacks",
  "Gushers",
  "Fruit Roll-Ups",
  "Capri Sun Original",
  "Honest Kids juice",
  "Yoplait Go-Gurt",
  "Danimals",
  "Stonyfield YoKids",
  "Uncrustables",
  "Lunchables",
  "Teddy Grahams",
  "Happy Baby Organic Puffs",
  "Gerber Puffs",
  "GoGo Squeez applesauce",
  "Plum Organics baby pouch",
  "Happy Baby organic pouch",
  // ── CEREALS ──────────────────────────────────────────
  "Cheerios",
  "Honey Nut Cheerios",
  "Froot Loops",
  "Lucky Charms",
  "Cinnamon Toast Crunch",
  "Frosted Flakes",
  "Cocoa Puffs",
  "Kashi Go",
  "Nature's Path Organic Corn Flakes",
  // ── PERSONAL CARE ────────────────────────────────────
  "Cetaphil moisturizer",
  "CeraVe moisturizing cream",
  "Neutrogena sunscreen",
  "Coppertone sunscreen",
  "Banana Boat sunscreen",
  "EltaMD sunscreen",
  "Dove body wash",
  "Dial body wash",
  "Head and Shoulders shampoo",
  "Pantene shampoo",
  "Suave shampoo",
  "Aveeno baby wash",
  "Johnson's baby wash",
  "Burt's Bees baby wash",
  // ── CLEANING ─────────────────────────────────────────
  "Tide Pods",
  "Gain detergent",
  "Seventh Generation laundry detergent",
  "Blueland cleaning tablets",
  "Method all purpose cleaner",
  "Clorox wipes",
  "Lysol spray",
  "Mrs Meyer's dish soap",
  "Dawn dish soap",
  // ── FOOD STAPLES ─────────────────────────────────────
  "Kraft mac and cheese",
  "Annie's mac and cheese",
  "Skippy peanut butter",
  "Jif peanut butter",
  "Justin's peanut butter",
  "Nutella",
  "Smucker's strawberry jam",
  "Pepperidge Farm goldfish",
  "Oreo cookies",
  "Chips Ahoy",
  "Ritz crackers",
  "Triscuits",
  "Lay's potato chips",
  "Doritos",
  "SkinnyPop popcorn",
  // ── COOKWARE ─────────────────────────────────────────
  "Teflon pan",
  "Caraway cookware",
  "All-Clad stainless pan",
  "Lodge cast iron skillet",
  "Calphalon nonstick pan",
];

async function warmCache() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("[WARM] No API key — skipping cache warm");
    return;
  }
  const toWarm = WARM_LIST.filter(name => {
    const key = cacheKey(name, detectCategory(name));
    return !scoreCache.has(key);
  });
  if (toWarm.length === 0) {
    console.log("[WARM] All products already cached — nothing to warm");
    return;
  }
  console.log(`[WARM] Pre-warming ${toWarm.length} products in background...`);
  let warmed = 0, skipped = 0;
  for (const name of toWarm) {
    // Check again in case a real user scan populated it while we waited
    const key = cacheKey(name, detectCategory(name));
    if (scoreCache.has(key)) { skipped++; continue; }
    try {
      // Use the same analyze path but internally — no HTTP round-trip
      const category = detectCategory(name);
      const calHit   = CALIBRATION.get(normalise(name)) || CALIBRATION.get(name.toLowerCase().trim());
      if (calHit) {
        // Calibration hit — build minimal result and cache instantly
        const result = applyProductCalibration({
          product_name: name,
          score: Math.round((calHit.floor + calHit.ceiling) / 2),
          overall_score: Math.round((calHit.floor + calHit.ceiling) / 2),
          category,
          confidence: calHit.confidence || "high",
          dimensions: buildFuzzyDimensions(calHit, category || calHit.category || "other", Math.round((calHit.floor + calHit.ceiling) / 2)),
          concerns: calHit.substances || [],
          summary: calHit.reason || "",
          alternatives: [],
          ai_alternatives: [],
          _warmCache: true,
        });
        cacheSet(key, result);
        warmed++;
      } else {
        // No calibration hit — run full AI score via internal request (rate-limited)
        await new Promise(r => setTimeout(r, 3000));
        try {
          const r = await fetch(`http://localhost:${PORT}/analyze`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: name }),
          });
          if (r.ok) warmed++;
        } catch(e2) {
          console.warn(`[WARM] AI score failed for "${name}":`, e2.message);
        }
      }
    } catch(e) {
      console.warn(`[WARM] Failed to warm "${name}":`, e.message);
    }
  }
  console.log(`[WARM] Done — ${warmed} warmed, ${skipped} already cached, ${scoreCache.size} total`);
}

// ── SUPABASE AUTO-WARM ────────────────────────────────────────
// Pulls top scanned products from Supabase scan history and warms cache
// Called daily via cron. Self-building — reflects actual user scan patterns.
const autoWarmFromSupabase = async () => {
  if (!supabaseAdmin) { console.log("[AUTO-WARM] Supabase not configured"); return; }
  try {
    // Get most frequently scanned product names in last 90 days
    const { data, error } = await supabaseAdmin
      .from("scans")
      .select("result_json->product_name")
      .gte("scanned_at", new Date(Date.now() - 90*24*60*60*1000).toISOString())
      .limit(5000);

    if (error || !data?.length) {
      console.log("[AUTO-WARM] No scan history found");
      return;
    }

    // Count frequency
    const freq = {};
    for (const row of data) {
      const name = row.product_name;
      if (name) freq[name] = (freq[name] || 0) + 1;
    }

    // Sort by frequency, take top 500
    const topProducts = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 500)
      .map(([name]) => name);

    const uncached = topProducts.filter(name => {
      const key = cacheKey(name, detectCategory(name));
      return !scoreCache.has(key);
    });

    console.log(`[AUTO-WARM] ${topProducts.length} top products from history, ${uncached.length} need warming`);

    // Add to warm list and trigger
    if (uncached.length > 0) {
      // Warm calibration hits instantly (free)
      for (const name of uncached) {
        const key    = cacheKey(name, detectCategory(name));
        const calHit = CALIBRATION.get(normalise(name)) || CALIBRATION.get(name.toLowerCase().trim());
        if (calHit) {
          const result = applyProductCalibration({
            product_name: name, score: Math.round((calHit.floor + calHit.ceiling) / 2),
            overall_score: Math.round((calHit.floor + calHit.ceiling) / 2),
            category: calHit.category || detectCategory(name),
            confidence: calHit.confidence || "high",
            dimensions: buildFuzzyDimensions(calHit, calHit.category || detectCategory(name) || "other", Math.round((calHit.floor + calHit.ceiling) / 2)),
            concerns: calHit.substances || [], summary: calHit.reason || "",
            alternatives: [], ai_alternatives: [], _warmCache: true,
          });
          cacheSet(key, result);
        }
      }
      console.log(`[AUTO-WARM] Complete — ${scoreCache.size} total cached`);
    }
  } catch(e) {
    console.error("[AUTO-WARM] Error:", e.message);
  }
};

// Clear a single product from cache (memory + Redis)
app.get("/cache-clear-product", requireAdmin, async (req, res) => {
  const name = req.query.name;
  if (!name) return res.status(400).json({ error: "name param required" });
  const category = detectCategory(name);
  const key = cacheKey(name, category);
  const wasInMemory = scoreCache.has(key);
  scoreCache.delete(key);
  if (hasRedis) {
    try {
      await fetch(`${REDIS_URL}/del/${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      });
    } catch(e) { console.warn("[REDIS] del error:", e.message); }
  }
  saveCacheToDisk();
  console.log(`[CACHE] Cleared "${name}" (key: ${key}, wasInMemory: ${wasInMemory})`);
  res.json({ ok: true, key, wasInMemory });
});

// Clears the barcode-keyed cache entry. /cache-clear-product only clears
// name-keyed entries, but the /barcode endpoint also stores results under
// `<promptVersion>:barcode:<barcode>` for direct UPC lookups. When a
// scoring-logic fix targets barcode-resolved products, this endpoint is
// the way to invalidate the per-barcode cache without nuking everything.
app.get("/cache-clear-barcode", requireAdmin, async (req, res) => {
  const barcode = (req.query.barcode || "").trim();
  if (!/^\d{4,14}$/.test(barcode)) return res.status(400).json({ error: "barcode param required (4-14 digits)" });
  const key = `${promptVersion()}:barcode:${barcode}`;
  const wasInMemory = scoreCache.has(key);
  scoreCache.delete(key);
  if (hasRedis) {
    try {
      await fetch(`${REDIS_URL}/del/${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      });
    } catch(e) { console.warn("[REDIS] del error:", e.message); }
  }
  saveCacheToDisk();
  console.log(`[CACHE] Cleared barcode ${barcode} (key: ${key}, wasInMemory: ${wasInMemory})`);
  res.json({ ok: true, key, wasInMemory });
});

// Migrate legacy Redis entries — unwraps {value, ex} wrapper and re-stores correctly
app.post("/cache-migrate-redis", requireAdmin, async (req, res) => {
  if (!hasRedis) return res.json({ ok: false, error: "Redis not configured" });
  try {
    const keys = await redisKeys("*");
    let migrated = 0, skipped = 0, failed = 0;
    for (const key of keys) {
      try {
        // Read raw value from Redis (bypassing our unwrap fix)
        const r = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
          headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
        });
        const d = await r.json();
        if (!d.result) { skipped++; continue; }
        const parsed = JSON.parse(d.result);
        // Check if it's a legacy wrapped entry
        if (parsed && typeof parsed.value === "string" && parsed.ex) {
          const unwrapped = JSON.parse(parsed.value);
          // Re-store with correct format via pipeline
          await fetch(`${REDIS_URL}/pipeline`, {
            method: "POST",
            headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify([["SET", key, JSON.stringify(unwrapped), "EX", REDIS_TTL]]),
          });
          // Also fix in-memory cache
          scoreCache.set(key, unwrapped);
          migrated++;
        } else {
          skipped++; // already in correct format
        }
      } catch(e) { failed++; }
    }
    saveCacheToDisk();
    console.log(`[MIGRATE] Redis migration complete — ${migrated} fixed, ${skipped} already ok, ${failed} failed (${keys.length} total)`);
    res.json({ ok: true, total: keys.length, migrated, skipped, failed });
  } catch(e) {
    console.error("[MIGRATE] Error:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// External cron can hit this to keep cache warm - e.g. cron-job.org daily
app.post("/cache-warm", requireAdmin, (req, res) => {
  const missing = WARM_LIST.filter(name => {
    const key = cacheKey(name, detectCategory(name));
    return !scoreCache.has(key);
  });
  res.json({ ok: true, cached: scoreCache.size, missing: missing.length, warming: missing.length > 0, redis: hasRedis });
  if (missing.length > 0) {
    console.log(`[WARM] External trigger — ${missing.length} products need warming`);
    warmCache();
  }
  // Also run Supabase auto-warm to pick up popular user scans
  autoWarmFromSupabase();
});

// ── ADMIN: Full Redis reload — rescans every stale entry directly via AI pipeline ──
// Runs entirely server-side (no HTTP round-trips). Stores progress in Redis so
// it survives Railway restarts and can resume where it left off.
// GET /admin/reload-redis?key=...           — start or resume
// GET /admin/reload-redis?key=...&status=1  — check progress without starting

const RELOAD_PROGRESS_KEY = "__reload_progress__";
let reloadRunning = false;
let reloadStopFlag = false;

app.get("/admin/reload-redis", requireAdmin, async (req, res) => {
  if (!hasRedis) return res.status(400).json({ error: "Redis not configured" });

  // Status check — return current progress without starting a new run
  if (req.query.status) {
    const prog = await redisGet(RELOAD_PROGRESS_KEY);
    return res.json(prog || { status: "not_started" });
  }

  // Reset command — clear stuck state and set stop flag
  if (req.query.reset) {
    reloadRunning = false;
    reloadStopFlag = true;
    await redisSet(RELOAD_PROGRESS_KEY, null);
    return res.json({ status: "reset" });
  }

  // Stop command — halts any chain of auto-triggered batches
  if (req.query.stop) {
    reloadStopFlag = true;
    return res.json({ status: "stopped" });
  }

  // Clear stop flag on a fresh trigger (no auto chain)
  if (req.query.auto !== "1") reloadStopFlag = false;

  // Honor stop flag
  if (reloadStopFlag) {
    return res.json({ status: "stopped" });
  }

  // Process this many items per request (sync, so Railway keeps the process alive)
  const BATCH_SIZE = parseInt(req.query.batch) || 25;

  // Load or init progress
  let progress = await redisGet(RELOAD_PROGRESS_KEY);
  let allKeys, startIndex = 0, reloaded = 0, skipped = 0, failed = 0;

  if (progress?.status === "running" && progress?.allKeys?.length) {
    allKeys = progress.allKeys;
    startIndex = progress.nextIndex || 0;
    reloaded = progress.reloaded || 0;
    skipped = progress.skipped || 0;
    failed = progress.failed || 0;
  } else if (progress?.status === "complete") {
    return res.json({ status: "complete", progress });
  } else {
    allKeys = (await redisKeys("*")).filter(k => k !== RELOAD_PROGRESS_KEY);
    console.log(`[RELOAD] Starting fresh — ${allKeys.length} keys`);
  }

  const total = allKeys.length;
  const endIndex = Math.min(startIndex + BATCH_SIZE, total);

  // Process batch synchronously within this HTTP request
  await (async () => {
    const DELAY_MS = 500; // faster since we're doing small batches per request

    for (let i = startIndex; i < endIndex; i++) {
      if (reloadStopFlag) { console.log(`[RELOAD] Stop flag set — exiting batch`); break; }
      const key = allKeys[i];
      try {
        const current = await redisGet(key);
        if (!current) { skipped++; continue; }

        const productName = current.product_name || key.split(":").slice(1).join(":") || key;

        // Staleness check
        const noIng   = !current.ingredient_list   || current.ingredient_list.length === 0;
        const noFlag  = !current.flagged_substances || current.flagged_substances.length === 0;
        const allFive = current.dimensions &&
          current.dimensions.materials?.score      === 5 &&
          current.dimensions.usage_exposure?.score === 5 &&
          current.dimensions.packaging?.score      === 5 &&
          current.dimensions.sustainability?.score === 5;
        const isStale = !current.dimensions || current._preloaded === true || (noIng && noFlag && allFive);

        if (!isStale) { skipped++; continue; }

        // Evict from memory and run full AI pipeline directly
        scoreCache.delete(key);

        try {
          const cat  = current.category || detectCategory(productName);
          const p1   = await pass1(productName, null, cat);
          let p2 = null;
          try { p2 = await pass2(productName, p1); } catch(e) {}

          let mScore  = p2?.materials_score      ?? p1.materials?.score      ?? 5;
          let uScore  = p2?.usage_score          ?? p1.usage_exposure?.score  ?? 5;
          let pkScore = p2?.packaging_score      ?? p1.packaging?.score       ?? 5;
          let sScore  = p2?.sustainability_score ?? p1.sustainability?.score  ?? 5;

          // ── Substance-triggered floors ──
          const reloadSubstance = applySubstanceFloors(mScore, uScore, p1, p2);
          mScore = reloadSubstance.mScore;
          uScore = reloadSubstance.uScore;
          if (reloadSubstance.triggered.length > 0) {
            console.log(`[RELOAD] Substance floors for ${productName}: ${reloadSubstance.triggered.join(", ")}`);
          }

          let finalScore = computeScore(mScore, uScore, pkScore, sScore, cat);
          ({ mScore, uScore, pkScore, sScore, finalScore } = applyConsistencyChecks(
            mScore, uScore, pkScore, sScore, finalScore, p1, p2, cat, productName
          ));
          ({ finalScore } = applyPositiveCeilings(finalScore, cat, p1, p2, []));

          const safety = computeSafetyScores(finalScore, cat, productName, p1);
          const { childScore, isChild } = safety;

          const alternatives = serializeAlternatives(
            filterDbAlternatives(
              findAlternatives(productName, cat, 5, productName), cat, productName, finalScore
            ),
            cat
          );

          const peerComparison = finalScore <= 2 ? "Safe — no significant chemical or ingredient concerns"
            : finalScore <= 4 ? "Good — mostly clean, use with awareness"
            : finalScore <= 6 ? "Caution — real concerns, reduce use or find an alternative"
            : finalScore <= 8 ? "Switch — real concerns, time to swap"
            : "Avoid — known harmful substances";

          const result = {
            product_name:       productName,
            score:              finalScore,
            overall_score:      finalScore,
            category:           cat,
            confidence:         p1.confidence || "medium",
            is_child_product:   isChild,
            child_score:        childScore,
            child_bumps:        safety.childBumps || [],
            pregnancy_score:    safety.pregnancyScore,
            pregnancy_bumps:    safety.pregnancyBumps || [],
            flagged_substances: p1.flagged_substances || [],
            concerns:           p1.concerns           || [],
            summary:            p1.summary_short || p1.summary || "",
            summary_short:      p1.summary_short || p1.summary || "",
            summary_long:       p1.summary_long || p1.summary || "",
            peer_comparison:    peerComparison,
            dimensions: {
              materials:      { score: mScore,  label: p1.materials?.label      || "", concerns: p1.materials?.concerns      || [] },
              usage_exposure: { score: uScore,  label: p1.usage_exposure?.label || "", concerns: p1.usage_exposure?.concerns || [] },
              packaging:      { score: pkScore, label: p1.packaging?.label      || "", concerns: p1.packaging?.concerns      || [] },
              sustainability: { score: sScore,  label: p1.sustainability?.label  || "", concerns: p1.sustainability?.concerns  || [] },
            },
            identified_plastics: p1.identified_plastics || [],
            harmful_chemicals:   p1.harmful_chemicals   || [],
            natural_materials:   p1.natural_materials   || [],
            nutrition:           p1.nutrition || p1.product_analysis?.nutrition || current.nutrition || null,
            ingredient_list:     p1.ingredient_list || [],
            product_family:      classifyProductFamily(productName, p1.ingredient_list, cat),
            alternatives,
            ai_alternatives:     [],
            scan_next:           buildScanNextFallback(productName, cat, alternatives),
            cached:              false,
          };

          const calibrated = applyProductCalibration(result);
          cacheSet(key, calibrated);
          reloaded++;
          console.log(`[RELOAD] ${i+1}/${total} ✓ ${productName} -> ${calibrated.overall_score}/10`);

        } catch(aiErr) {
          failed++;
          console.warn(`[RELOAD] ${i+1}/${total} ✗ ${productName}: ${aiErr.message}`);
        }

        await new Promise(r => setTimeout(r, DELAY_MS));

      } catch(err) {
        failed++;
        console.warn(`[RELOAD] Key error ${key}: ${err.message}`);
      }
    }
  })();

  // Save progress and return
  const finalIndex = endIndex;
  const isComplete = finalIndex >= total;
  await redisSet(RELOAD_PROGRESS_KEY, {
    status: isComplete ? "complete" : "running",
    total, nextIndex: finalIndex, reloaded, skipped, failed,
    pct: Math.round(finalIndex / total * 100),
    allKeys,
    updatedAt: new Date().toISOString(),
  });

  console.log(`[RELOAD] Batch done — ${startIndex}→${finalIndex}/${total} (reloaded: ${reloaded}, skipped: ${skipped}, failed: ${failed})`);

  // Self-drive: kick off the next batch via fetch before responding.
  // Fire-and-forget — we don't await it, so it runs after we return.
  if (!isComplete && !reloadStopFlag && req.query.auto !== "0") {
    const selfUrl = `http://localhost:${PORT}/admin/reload-redis?key=${encodeURIComponent(ADMIN_KEY)}&batch=${BATCH_SIZE}&auto=1`;
    setTimeout(() => {
      fetch(selfUrl).catch(e => console.warn(`[RELOAD] self-trigger failed: ${e.message}`));
    }, 100);
  }

  res.json({
    status: isComplete ? "complete" : "batch_done",
    total, nextIndex: finalIndex, reloaded, skipped, failed,
    pct: Math.round(finalIndex / total * 100),
    batch: endIndex - startIndex,
    auto_next: !isComplete,
  });
});
// ── BARCODE SCAN — Open Food Facts lookup + full AI pipeline ────────────────
// Accepts a UPC/EAN barcode, looks up product data from Open Food Facts (free,
// 3M+ products), passes exact ingredient list as ground truth to pass1/pass2,
// and returns a fully scored result identical to a text scan.
app.post("/barcode", rateLimit, async (req, res) => {
  const { barcode, userId } = req.body || {};
  if (!barcode) return res.status(400).json({ error: "barcode required" });
  if (typeof barcode !== "string" || !/^\d{4,14}$/.test(barcode.trim())) {
    return res.status(400).json({ error: "Invalid barcode format" });
  }

  const barcodeKey = `${promptVersion()}:barcode:${barcode}`;

  // ── Cache check (same staleness logic as /analyze) ──
  const bCached = await cacheGet(barcodeKey);
  if (bCached && evictIfPrePass0(bCached, barcodeKey)) {
    // fall through to fresh Pass 0 + scoring
  } else if (bCached) {
    const noIng   = !bCached.ingredient_list   || bCached.ingredient_list.length === 0;
    const noFlag  = !bCached.flagged_substances || bCached.flagged_substances.length === 0;
    const allFive = bCached.dimensions &&
      bCached.dimensions.materials?.score      === 5 &&
      bCached.dimensions.usage_exposure?.score === 5 &&
      bCached.dimensions.packaging?.score      === 5 &&
      bCached.dimensions.sustainability?.score === 5;
    const bStale = !bCached.dimensions || bCached._preloaded || bCached._warmCache || (noIng && noFlag && allFive);
    if (!bStale) {
      console.log(`[BARCODE HIT] ${barcode} -> ${bCached.product_name}`);
      return res.json({ ...bCached, cached: true });
    }
    scoreCache.delete(barcodeKey);
  }

  // ── Pass 0: resolve ingredients from Open Food / Beauty / Products Facts ──
  // Pass 0 returns the raw product object for downstream nutrition extraction
  // plus source metadata (ingredient_source, confidence, verifiedAt) that we
  // store on the result and inject into the Pass 1 prompt.
  //
  // Pass 0 also consults a local barcode index (backend/barcodeIndex.js) and
  // an optional external barcode API (backend/barcodeLookup.js, env-gated)
  // after the three Open-Facts databases miss. Those two stages return a
  // product_name without ingredients — when that happens we short-circuit to
  // calibration lookup below so brands we've already scored resolve instantly.
  const pass0 = await resolveIngredients({ barcode, supabase: supabaseAdmin });
  const offProduct = pass0.rawProduct;
  const sourceName = pass0.source; // "open_food_facts" | "open_beauty_facts" | "open_products_facts" | "barcode_index" | "barcode_external" | "none"
  if (offProduct) {
    console.log(`[BARCODE] ${barcode} found in ${sourceName} (confidence: ${pass0.confidence})`);
  }

  // ── Short-circuit: barcode_index / barcode_external → calibration ──
  // These two sources return a product_name only (no ingredients). If the
  // name matches a calibration entry, serve the calibration score directly.
  // This is how Blueland/Method/Huggies/Native/etc. barcodes resolve without
  // burning an AI call. Mirrors the warm-cache calibration bypass pattern.
  if (offProduct && (sourceName === "barcode_index" || sourceName === "barcode_external")) {
    const resolvedName = offProduct.product_name || "";
    const calHit = CALIBRATION.get(normalise(resolvedName)) || fuzzyCalibrationLookup(resolvedName)?.entry;
    if (calHit) {
      const midScore = Math.round((calHit.floor + calHit.ceiling) / 2);
      const calCategory = calHit.category || detectCategory(resolvedName) || "other";
      const calibrated = applyProductCalibration({
        product_name: resolvedName,
        score: midScore,
        overall_score: midScore,
        category: calCategory,
        confidence: calHit.confidence || "high",
        dimensions: buildFuzzyDimensions(calHit, calCategory, midScore),
        concerns: calHit.substances || [],
        summary: calHit.reason || "",
        ingredient_list: [],
        flagged_substances: [],
        alternatives: [],
        ai_alternatives: [],
        ingredient_source: sourceName,
        ingredient_confidence: pass0.confidence || "medium",
        ingredient_verified_at: pass0.verifiedAt,
        ingredient_source_url: null,
        source: "calibration",
        source_label: "Verified formula",
        source_confidence: null,
      });
      console.log(`[BARCODE] ${barcode} (${sourceName}) → "${resolvedName}" → calibration ${calHit.floor}-${calHit.ceiling}`);
      await attachIntelCards(calibrated, userId);
      cacheSet(barcodeKey, calibrated);
      return res.json({ ...calibrated, barcode, cached: false });
    }
    // No calibration hit — fall through to the existing pipeline, which will
    // run Pass 1 with empty ingredients. Pass 1 handles the empty case but
    // confidence will be low; a future patch could route this into the text
    // cascade (Tier 3/4/5) for richer fallback.
  }

  if (!offProduct) {
    console.log(`[BARCODE] ${barcode} not found in any database — returning fallback`);
    // Return a 200 with fallback_required so the frontend can render a
    // friendly "scan the label instead" UI instead of a hard 404
    const gs1Prefix = barcode.slice(0, 3);
    const gs1Hint = (gs1Prefix >= "000" && gs1Prefix <= "139") ? "US or Canada"
                  : (gs1Prefix >= "300" && gs1Prefix <= "379") ? "France"
                  : (gs1Prefix >= "400" && gs1Prefix <= "440") ? "Germany"
                  : (gs1Prefix >= "500" && gs1Prefix <= "509") ? "UK"
                  : (gs1Prefix >= "690" && gs1Prefix <= "699") ? "China"
                  : (gs1Prefix >= "800" && gs1Prefix <= "839") ? "Italy"
                  : (gs1Prefix >= "840" && gs1Prefix <= "849") ? "Spain"
                  : (gs1Prefix >= "850" && gs1Prefix <= "859") ? "Cuba"
                  : (gs1Prefix >= "870" && gs1Prefix <= "879") ? "Netherlands"
                  : (gs1Prefix >= "880" && gs1Prefix <= "889") ? "South Korea"
                  : null;
    return res.status(200).json({
      fallback_required: true,
      barcode,
      origin_country: gs1Hint,
      message: gs1Hint
        ? `I don't know this barcode yet — looks like a product from ${gs1Hint}. Snap a photo of the label and I'll read it for you.`
        : "I don't know this barcode yet. Snap a photo of the label and I'll read it for you.",
      action: "photo_scan",
      cta: "Take a photo instead",
    });
  }

  // ── Extract product data from OFF response ──
  const ingredText   = offProduct.ingredients_text_en || offProduct.ingredients_text || "";
  // Parse ingredient list before naming so the name fallback can mine it
  const ingredientList = ingredText
    ? ingredText.split(/,(?![^(]*\))/).map(s => s.trim()).filter(Boolean)
    : [];

  // ── Product name resolution ──
  // OFF/OBF/OPF often store records with no product_name (anonymous user
  // submissions, partial entries). The previous fallback was literally
  // "Product <barcode>" — a number — which leaked through to the UI as the
  // product title. Sara hit this on a drink mix that displayed as
  // "697029995037". Build a more honest fallback by mining brand,
  // generic_name, OFF categories, and ingredient signals.
  const brand = (offProduct.brands || "").split(",")[0].trim();
  const genericName = offProduct.generic_name_en || offProduct.generic_name || "";
  const offCategories = offProduct.categories_tags_en || offProduct.categories_tags || [];
  const offCategoryStr = (offProduct.categories || "").split(",").map(s => s.replace(/^en:/, "").trim()).filter(Boolean)[0] || "";
  const ingredientTypeGuess = inferProductTypeFromIngredients(ingredientList);

  function buildProductName() {
    const explicit = (offProduct.product_name_en || offProduct.product_name || "").trim();
    if (explicit) return explicit;
    // Try brand + descriptor — most informative
    const descriptor = genericName || offCategoryStr || ingredientTypeGuess;
    if (brand && descriptor) return `${brand} ${descriptor}`.trim();
    if (descriptor) return descriptor;
    if (brand) return brand;
    // Honest last resort — never a bare barcode number
    return "Scanned product";
  }
  const productName = buildProductName();

  const novaGroup    = offProduct.nova_group;
  const servingG     = parseFloat(offProduct.serving_quantity) || 100;
  const nutr         = offProduct.nutriments || {};
  const toServing    = (per100) => per100 != null ? Math.round(per100 * servingG / 100 * 10) / 10 : null;
  const sugar_g      = toServing(nutr["sugars_100g"]);
  const sat_fat_g    = toServing(nutr["saturated-fat_100g"]);
  const calories     = toServing(nutr["energy-kcal_100g"]);
  const sodium_mg    = nutr["sodium_100g"] != null
    ? Math.round(nutr["sodium_100g"] * servingG / 100 * 1000)
    : null;
  const servingLabel = offProduct.serving_size || (servingG ? `${servingG}g` : "");

  // ── Check if already cached by product name ──
  // Same sync/async split as /analyze: cache key uses Fast for stability,
  // then AI refines the category for the scoring path if cache misses.
  let cat       = detectCategory(productName);
  // Ingredient-signal fallback: when productName-based detection returns
  // "other" (common when the OFF record had no real name and we built one),
  // see if the ingredient list strongly suggests a different category. A
  // drink mix with sucralose + citric acid + sodium benzoate is a beverage
  // even if the product_name is "Scanned product".
  if (!cat || cat === "other") {
    const ingredientCat = inferCategoryFromIngredients(ingredientList);
    if (ingredientCat) {
      console.log(`[BARCODE] category override from ingredients: ${cat || "(none)"} → ${ingredientCat}`);
      cat = ingredientCat;
    }
  }
  const nameKey = cacheKey(productName, cat);
  const nCached = await cacheGet(nameKey);
  if (nCached && evictIfPrePass0(nCached, nameKey)) {
    // fall through to fresh scoring
  } else if (nCached) {
    const ni = !nCached.ingredient_list   || nCached.ingredient_list.length === 0;
    const nf = !nCached.flagged_substances || nCached.flagged_substances.length === 0;
    const na = nCached.dimensions &&
      nCached.dimensions.materials?.score      === 5 &&
      nCached.dimensions.usage_exposure?.score === 5 &&
      nCached.dimensions.packaging?.score      === 5 &&
      nCached.dimensions.sustainability?.score === 5;
    if (!(!nCached.dimensions || nCached._preloaded || (ni && nf && na))) {
      cacheSet(barcodeKey, nCached);
      return res.json({ ...nCached, cached: true, barcode });
    }
    scoreCache.delete(nameKey);
  }

  // AI refinement — barcode path has OFF ingredient text, so classification
  // quality is higher than text path. Same non-fatal pattern.
  try {
    const cls = await classifyCategory({
      productName,
      ingredients: ingredText,
      deps: { redisGet, redisSet, promptVersion, checkApiBudget, incrementApiCount },
    });
    log.info("category_classification", {
      product_name: productName,
      barcode,
      source: cls.source,
      ai_category: cls.category,
      fast_category: cat,
      confidence: cls.confidence,
      disagreed: cat && cls.category !== cat,
    });
    if (cls.category && cls.category !== "other") cat = cls.category;
    else if (!cat && cls.category === "other") cat = "other";
  } catch (e) {
    console.warn("[classify] barcode error, using Fast category:", e.message);
  }

  // Calibration category wins if there's a matching entry. Same rationale as
  // the vision path: calibration is authoritative when it has an opinion.
  const bcCalHit = CALIBRATION.get(normalise(productName)) || fuzzyCalibrationLookup(productName)?.entry;
  if (bcCalHit?.category && CATEGORY_AVERAGES[bcCalHit.category] && bcCalHit.category !== cat) {
    console.log(`[barcode] calibration category override: ${cat} → ${bcCalHit.category} for "${productName}"`);
    cat = bcCalHit.category;
  }

  // ── Build rich context from OFF data for pass1 ──
  const ingredientSourceNote = pass0.source && pass0.source !== "none"
    ? `INGREDIENT SOURCE: ${pass0.source} (confidence: ${pass0.confidence})\nVerified: ${pass0.verifiedAt}\nThese ingredients come from ${pass0.source}. Score based on these ingredients, not on your training priors. If the ingredient list contradicts what you know about this product, trust the ingredient list provided.`
    : null;
  const offContext = [
    `EXACT PRODUCT: ${productName}${brand ? ` by ${brand}` : ""}`,
    `BARCODE: ${barcode} (use this as ground truth — do not guess the product)`,
    ingredientSourceNote,
    ingredText ? `FULL INGREDIENT LIST: ${ingredText}` : null,
    novaGroup  ? `NOVA GROUP: ${novaGroup}${novaGroup === 4 ? " (ultra-processed)" : novaGroup === 3 ? " (processed)" : " (minimally processed)"}` : null,
    sugar_g    != null ? `SUGAR PER SERVING: ${sugar_g}g` : null,
    sodium_mg  != null ? `SODIUM PER SERVING: ${sodium_mg}mg` : null,
    sat_fat_g  != null ? `SATURATED FAT PER SERVING: ${sat_fat_g}g` : null,
    calories   != null ? `CALORIES PER SERVING: ${calories}kcal` : null,
    servingLabel ? `SERVING SIZE: ${servingLabel}` : null,
    // Scoring guidance for common barcode scan patterns
    brand?.toLowerCase().includes("nespresso") || productName?.toLowerCase().includes("nespresso")
      ? "SCORING NOTE: Nespresso uses aluminum capsules — inert food contact surface, no plastic migration. Natural coffee flavoring (hazelnut, vanilla, caramel) is food-grade and must NOT be flagged as a synthetic chemical concern. Score 2-4."
      : null,
    /natural.*flavor|flavoring/i.test(ingredText) && !/artificial/i.test(ingredText)
      ? "SCORING NOTE: Ingredient list confirms NATURAL flavoring only — do not penalize as synthetic. Natural flavors are food-grade extracts, not petrochemicals."
      : null,
  ].filter(Boolean).join("\n");

  console.log(`[BARCODE] "${productName}" — running AI with OFF ingredient context`);

  try {
    // ── Pre-AI deterministic flag detection (barcode has exact ingredients from OFF) ──
    const preDetected = FLAG_DETECTION_ENABLED && ingredText
      ? detectDeterministicFlags(ingredText, cat)
      : null;

    // ── Full AI pipeline — same as text scan but with exact ingredients ──
    const p1 = await pass1(productName, offContext, cat, preDetected);

    // ── Post-AI validation + merge ──
    applyFlagDetectionToP1(p1, ingredText, cat, "barcode");

    let p2 = null;
    try { p2 = await pass2(productName, p1); } catch(e) { console.warn("[BARCODE] pass2 failed:", e.message); }

    let mScore  = p2?.materials_score      ?? p1.materials?.score      ?? 5;
    let uScore  = p2?.usage_score          ?? p1.usage_exposure?.score  ?? 5;
    let pkScore = p2?.packaging_score      ?? p1.packaging?.score       ?? 5;
    let sScore  = p2?.sustainability_score ?? p1.sustainability?.score  ?? 5;

    // ── Substance floors from OFF ingredient text (code-enforced, AI-immune) ──
    // This is the key guarantee: if OFF lists Red 40, we force materials ≥ 7
    // regardless of what the AI decided to score it.
    const textFloors = applySubstanceFloorsToText(ingredText);
    if (textFloors.mFloor > mScore) {
      console.log(`[BARCODE] Text substance floor raised materials ${mScore} → ${textFloors.mFloor} (${textFloors.triggered[0]})`);
      mScore = textFloors.mFloor;
    }
    if (textFloors.uFloor > uScore) uScore = textFloors.uFloor;

    // Also run the AI-concern based floor check (catches things AI spots but OFF doesn't list)
    const aiFloors = applySubstanceFloors(mScore, uScore, p1, p2);
    mScore = aiFloors.mScore;
    uScore = aiFloors.uScore;

    // ── NOVA group hard floor/ceiling ──
    // NOVA 1 → materials ≤ 3, NOVA 3 → materials ≥ 4, NOVA 4 → materials ≥ 7.
    const nova = novaBounds(novaGroup, cat);
    if (nova.floor > mScore) {
      console.log(`[BARCODE] NOVA ${novaGroup} floor raised materials ${mScore} → ${nova.floor}`);
      mScore = nova.floor;
    }
    if (mScore > nova.ceiling) {
      console.log(`[BARCODE] NOVA ${novaGroup} ceiling lowered materials ${mScore} → ${nova.ceiling}`);
      mScore = nova.ceiling;
    }

    let finalScore = computeScore(mScore, uScore, pkScore, sScore, cat);

    ({ mScore, uScore, pkScore, sScore, finalScore } = applyConsistencyChecks(
      mScore, uScore, pkScore, sScore, finalScore, p1, p2, cat, productName
    ));
    ({ finalScore } = applyPositiveCeilings(finalScore, cat, p1, p2, []));

    const peerComparison = finalScore <= 2 ? "Safe — no significant chemical or ingredient concerns"
      : finalScore <= 4 ? "Good — mostly clean, use with awareness"
      : finalScore <= 6 ? "Caution — real concerns, reduce use or find an alternative"
      : finalScore <= 8 ? "Switch — real concerns, time to swap"
      : "Avoid — known harmful substances";

    // Unified safety scoring — includes OFF ingredient text so substances
    // the AI may have missed still trigger kid/pregnancy bumps
    const barcodeSafety = computeSafetyScores(
      finalScore, cat, productName, p1, textFloors.triggered, ingredText || ""
    );
    const { childScore, childBumps, pregnancyScore, pregnancyBumps, isChild } = barcodeSafety;

    const alternatives = serializeAlternatives(
      filterDbAlternatives(
        findAlternatives(productName, cat, 5, productName), cat, productName, finalScore
      ),
      cat
    );

    // Use OFF nutrition as ground truth; fall back to AI if OFF didn't have it
    const nutrition = (sugar_g != null || sodium_mg != null || sat_fat_g != null)
      ? { sugar_g, sodium_mg, sat_fat_g, calories, serving_size: servingLabel }
      : (p1.nutrition || p1.product_analysis?.nutrition || null);

    const result = {
      product_name:        productName,
      brand,
      barcode,
      score:               finalScore,
      overall_score:       finalScore,
      category:            cat,
      confidence:          "high",
      is_child_product:    isChild,
      child_score:         childScore,
      child_bumps:         childBumps || [],
      pregnancy_score:     pregnancyScore,
      pregnancy_bumps:     pregnancyBumps || [],
      flagged_substances:  [...(p1.flagged_substances || []), ...textFloors.triggered],
      concerns:            p1.concerns || [],
      summary:             p1.summary_short || p1.summary || "",
      summary_short:       p1.summary_short || p1.summary || "",
      summary_long:        p1.summary_long || p1.summary || "",
      peer_comparison:     peerComparison,
      data_source:         sourceName,
      ingredient_source:         pass0.source,
      ingredient_confidence:     pass0.confidence,
      ingredient_verified_at:    pass0.verifiedAt,
      ingredient_source_url:     pass0.sourceUrl,
      // Source provenance — barcode path resolves via Open Facts. Treated as
      // baseline-trust (source_confidence: null) because a barcode scan is the
      // most precise identification we can make.
      source: pass0.source,
      source_label:
        pass0.source === "open_food_facts"     ? "Sourced from Open Food Facts" :
        pass0.source === "open_beauty_facts"   ? "Sourced from Open Beauty Facts" :
        pass0.source === "open_products_facts" ? "Sourced from Open Products Facts" :
        "Verified via barcode",
      source_confidence: null,
      // Voice fields from Pass 1 (Pass 2 has no voice rules — its summary is for audit only)
      verdict_adult: p1.verdict_adult || null,
      verdict_kid:   p1.verdict_kid   || null,
      dimensions: {
        materials:      { score: mScore,  label: p1.materials?.label      || "", concerns: p1.materials?.concerns      || [] },
        usage_exposure: { score: uScore,  label: p1.usage_exposure?.label || "", concerns: p1.usage_exposure?.concerns || [] },
        packaging:      { score: pkScore, label: p1.packaging?.label      || "", concerns: p1.packaging?.concerns      || [] },
        sustainability: { score: sScore,  label: p1.sustainability?.label  || "", concerns: p1.sustainability?.concerns  || [] },
      },
      identified_plastics: p1.identified_plastics || [],
      harmful_chemicals:   p1.harmful_chemicals   || [],
      natural_materials:   p1.natural_materials   || [],
      nutrition,
      ingredient_list:     ingredientList.length ? ingredientList : (p1.ingredient_list || []),
      product_family:      classifyProductFamily(productName, ingredientList.length ? ingredientList : (p1.ingredient_list || []), cat),
      alternatives,
      ai_alternatives:     [],
      scan_next:           buildScanNextFallback(productName, cat, alternatives),
      cached:              false,
      category_score_context: CATEGORY_CONTEXT[cat] || CATEGORY_CONTEXT.other,
    };

    const calibrated = applyProductCalibration(result);

    // Cache under both barcode key and product name key
    cacheSet(barcodeKey, calibrated);
    cacheSet(nameKey,    calibrated);

    console.log(`[BARCODE] Scored "${productName}" -> ${calibrated.overall_score}/10 (${ingredientList.length} ingredients)`);
    await attachIntelCards(calibrated, userId);
    res.json(calibrated);

  } catch(err) {
    console.error("[BARCODE] AI error:", err.message);
    res.status(500).json({ error: "Analysis failed. Please try photographing the label instead." });
  }
});

// When the AI returns no scan_next suggestions, generate smart defaults
// from the alternatives DB — same category, different products.
function buildScanNextFallback(productName, category, alternatives) {
  // If alternatives exist, suggest scanning them
  const altSuggestions = (alternatives || [])
    .filter(a => a.name && a.name !== productName)
    .slice(0, 2)
    .map(a => a.name);

  // Category-specific comparison products users commonly scan next
  const CATEGORY_DEFAULTS = {
    food_beverage: ["Organic version", "store brand version"],
    food:          ["Organic version", "store brand version"],
    beverage:      ["Sparkling water (glass bottle)", "Athletic Brewing NA beer"],
    supplement:    ["Ritual Multivitamin", "Momentous Protein"],
    baby:          ["Andy Pandy Bamboo Diapers", "GroVia cloth diapers"],
    clothing:      ["Organic cotton alternative", "Patagonia fleece"],
    personal_care: ["EWG Verified alternative", "mineral sunscreen"],
    home:          ["Blueland cleaning tablets", "Branch Basics concentrate"],
    toy:           ["PlanToys wooden alternative", "HABA wooden toy"],
    kitchen:       ["Caraway ceramic cookware", "cast iron skillet"],
    other:         [],
  };

  if (altSuggestions.length >= 2) return altSuggestions;
  const defaults = CATEGORY_DEFAULTS[category] || [];
  return [...new Set([...altSuggestions, ...defaults])].slice(0, 3);
}
