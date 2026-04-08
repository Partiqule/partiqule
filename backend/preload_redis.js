#!/usr/bin/env node
/**
 * Partiqule — One-time Redis preload script
 * Loads the entire calibration dataset into Upstash Redis
 *
 * Run from backend directory:
 *   UPSTASH_REDIS_REST_URL=xxx UPSTASH_REDIS_REST_TOKEN=xxx node preload_redis.js
 *
 * Or with .env file:
 *   node preload_redis.js
 */

try { require("dotenv").config(); } catch(e) { /* dotenv optional — use env vars directly */ }
const { CALIBRATION, applyProductCalibration, normalise } = require("./calibration");

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const REDIS_TTL   = 60 * 60 * 24 * 365; // 1 year for calibration entries — they don't go stale

if (!REDIS_URL || !REDIS_TOKEN) {
  console.error("Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN");
  console.error("Add them to your .env file or pass as env vars");
  process.exit(1);
}

console.log("ENV CHECK:");
console.log("  URL:", REDIS_URL.slice(0, 50) + "...");
console.log("  TOKEN:", REDIS_TOKEN.slice(0, 15) + "...\n");

async function testConnection() {
  try {
    const r = await fetch(`${REDIS_URL}/ping`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const text = await r.text();
    console.log("  Redis ping:", r.status, text);
    return r.ok;
  } catch(e) {
    console.error("  Redis connection failed:", e.message);
    console.error("  Check your URL starts with https:// and token is correct");
    return false;
  }
}

// Mirrors server.js cacheKey logic
function cacheKey(q, category) {
  const norm = q.toLowerCase().trim().replace(/\s+/g, " ");
  return category ? `${category}:${norm}` : norm;
}

// Mirrors server.js detectCategory — simplified version covering all calibration categories
function detectCategory(entry) {
  return entry.category || "other";
}

// Build a minimal scored result from a calibration entry
function buildResult(name, entry) {
  const midScore = Math.round((entry.floor + entry.ceiling) / 2);
  return applyProductCalibration({
    product_name: name,
    score: midScore,
    overall_score: midScore,
    category: entry.category || "other",
    confidence: entry.confidence || "high",
    dimensions: {
      materials:    { score: 5, concerns: entry.substances || [] },
      usage_exposure: { score: 5, concerns: [] },
      packaging:    { score: 5, concerns: [] },
      sustainability: { score: 5, concerns: [] },
    },
    concerns: entry.substances || [],
    flagged_substances: entry.substances || [],
    summary: entry.reason || "",
    alternatives: [],
    ai_alternatives: [],
    _preloaded: true,
    _calibration: true,
  });
}

async function redisSet(key, value) {
  const r = await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ value: JSON.stringify(value), ex: REDIS_TTL }),
  });
  if (!r.ok) throw new Error(`Redis set failed: ${r.status}`);
  return r.json();
}

async function main() {
  console.log(`\nPartiqule Redis Preloader`);
  console.log(`========================`);
  console.log(`Calibration entries: ${CALIBRATION.size}\n`);

  console.log("Testing connection...");
  const connected = await testConnection();
  if (!connected) {
    console.error("\nCannot connect to Redis. Check credentials and try again.");
    process.exit(1);
  }
  console.log("Connected!\n");

  const entries = [...CALIBRATION.entries()];
  let loaded = 0, failed = 0, skipped = 0;

  // Deduplicate by generated cache key — multiple calibration keys can map
  // to the same product (e.g. "carter's" and "carters")
  const seen = new Set();

  for (let i = 0; i < entries.length; i++) {
    const [calibKey, entry] = entries[i];

    // Skip nutrition-only entries (no floor/ceiling = not a full product entry)
    if (entry.floor == null || entry.ceiling == null) {
      skipped++;
      continue;
    }

    // Use the calibration key as the product name for cache purposes
    const productName = calibKey;
    const category    = detectCategory(entry);
    const key         = cacheKey(productName, category);

    if (seen.has(key)) { skipped++; continue; }
    seen.add(key);

    try {
      const result = buildResult(productName, entry);
      await redisSet(key, result);
      loaded++;

      // Progress every 50 entries
      if (loaded % 50 === 0) {
        console.log(`  Loaded ${loaded} / ${entries.length - skipped} (${failed} failed)...`);
      }

      // Small delay to avoid hammering Upstash free tier rate limits
      if (loaded % 100 === 0) await new Promise(r => setTimeout(r, 500));

    } catch(e) {
      console.warn(`  Failed: "${productName}" — ${e.message}`);
      failed++;
    }
  }

  console.log(`\nDone!`);
  console.log(`  Loaded:  ${loaded}`);
  console.log(`  Skipped: ${skipped} (nutrition-only or duplicate entries)`);
  console.log(`  Failed:  ${failed}`);
  console.log(`\nAll calibration products are now permanently cached in Redis.`);
  console.log(`Every named brand in your database will return instantly on first scan.`);
}

main().catch(e => {
  console.error("Fatal error:", e.message);
  process.exit(1);
});
