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
const { cacheKey } = require("./cacheKeys");

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

// cacheKey now imported from ./cacheKeys above. The previous local
// definition omitted the promptVersion prefix the runtime server uses,
// so every preloaded entry was orphaned in Redis. Verified 2026-04-28
// by tracing the home carousel.

// Home-screen carousel items. These need to resolve from Redis on
// first tap, never trigger a fresh Pass 1 / Pass 2. Names match the
// exact strings in frontend/src/App.jsx lines 7982-8007 (main showcase)
// and 8067-8074 (Today comparison). Items already in CALIBRATION are
// included for redundancy: explicit preload guarantees the cache key
// matches what the tap handler reads, even if calibration keys differ
// from carousel display strings.
const CAROUSEL_ITEMS = [
  // Main showcase-track carousel
  { name: "M&Ms",                category: "food",          floor: 7, ceiling: 9, substances: ["Red 40","Yellow 5","artificial colors"], reason: "Petroleum dyes (Red 40, Yellow 5) linked to childhood ADHD per McCann 2007. EU requires warning label." },
  { name: "Tide Pods",           category: "home",          floor: 5, ceiling: 7, substances: ["PVA","synthetic fragrance","optical brighteners"], reason: "PVA pod film microplastic plus synthetic fragrance plus 1,4-dioxane trace." },
  { name: "Honey Nut Cheerios",  category: "food",          floor: 6, ceiling: 8, substances: ["BHT","glyphosate residue","added sugar"], reason: "BHT preservative plus EWG-confirmed glyphosate residue plus added sugar." },
  { name: "Liquid Death",        category: "food_beverage", floor: 1, ceiling: 2, substances: [], reason: "Mountain spring water in aluminum can. No additives, plastic-free packaging." },
  { name: "Neutrogena SPF",      category: "personal_care", floor: 5, ceiling: 7, substances: ["oxybenzone","octinoxate","synthetic fragrance"], reason: "Chemical sunscreen with hormone-disrupting filters. EWG flag for endocrine disruption." },
  { name: "RXBAR",               category: "food",          floor: 1, ceiling: 3, substances: [], reason: "Dates, eggs, nuts, sea salt. Whole-food bar with no additives." },
  { name: "Huggies Diapers",     category: "baby",          floor: 6, ceiling: 8, substances: ["fragrance","dyes","ECF bleaching"], reason: "Synthetic fragrance and dyes against newborn skin, plus ECF chlorine bleaching." },
  { name: "Skittles",            category: "food",          floor: 7, ceiling: 9, substances: ["Red 40","Yellow 5","Yellow 6","Blue 1","titanium dioxide"], reason: "Five petroleum dyes plus titanium dioxide (EU food ban 2022) plus added sugar." },
  { name: "Lodge Cast Iron",     category: "kitchen",       floor: 1, ceiling: 2, substances: [], reason: "Pure iron, no coating. Naturally non-stick when seasoned. Lifetime cookware." },
  { name: "Teflon Pan",          category: "kitchen",       floor: 7, ceiling: 9, substances: ["PTFE","PFAS"], reason: "PTFE non-stick coating off-gasses at high heat. Manufacturing process tied to legacy PFAS contamination." },
  { name: "Oat Yeah Oat Milk",   category: "food_beverage", floor: 2, ceiling: 4, substances: ["sunflower oil","gellan gum"], reason: "Oats, water, sunflower oil, gellan gum stabilizer. Clean compared to dairy alternatives with seed-oil heavy formulations." },
  { name: "Dawn Dish Soap",      category: "home",          floor: 4, ceiling: 6, substances: ["synthetic fragrance","SLS","methylisothiazolinone"], reason: "Synthetic fragrance, SLS surfactant, MIT preservative (EU restricted). Fragrance-free Branch Basics is the cleaner swap." },
  // Today comparison rotation
  { name: "Heinz Ketchup",       category: "food",          floor: 3, ceiling: 5, substances: ["high fructose corn syrup","caramel color"], reason: "HFCS and caramel color. Annie's organic ketchup is the cleaner same-category swap." },
  { name: "Annie's Ketchup",     category: "food",          floor: 1, ceiling: 3, substances: [], reason: "Organic tomatoes, sugar, vinegar, salt, spice. Five-ingredient clean ketchup." },
  { name: "Blueland Laundry",    category: "home",          floor: 1, ceiling: 2, substances: [], reason: "Plant-based, no PVA film, no synthetic fragrance, refillable system." },
  { name: "Badger Mineral SPF",  category: "personal_care", floor: 1, ceiling: 3, substances: ["non-nano zinc oxide"], reason: "Mineral sunscreen with non-nano zinc oxide. No chemical filters. EWG verified." },
  { name: "Febreze Air",         category: "home",          floor: 6, ceiling: 8, substances: ["synthetic fragrance","VOCs","propellants"], reason: "Synthetic fragrance VOCs persist in indoor air. Asthma trigger and endocrine disruption concern." },
  { name: "Branch Basics",       category: "home",          floor: 1, ceiling: 2, substances: [], reason: "Plant-based concentrate, fragrance-free, MADE SAFE certified. Single-ingredient cleaner." },
  { name: "Gatorade",            category: "food_beverage", floor: 5, ceiling: 6, substances: ["high fructose corn syrup","artificial colors"], reason: "HFCS and synthetic dyes (Yellow 5, Red 40 in some flavors). High sugar load." },
  { name: "Liquid IV",           category: "food_beverage", floor: 3, ceiling: 5, substances: ["sucralose","natural flavors","cane sugar"], reason: "Cleaner than Gatorade but still contains sucralose plus added sugar plus B-vitamin megadose." },
  { name: "Branch Basics Dish",  category: "home",          floor: 1, ceiling: 2, substances: [], reason: "Same Branch Basics concentrate. Fragrance-free, plant-based, MADE SAFE certified." },
  { name: "Lay's Chips",         category: "food",          floor: 4, ceiling: 6, substances: ["industrial seed oils","natural flavors"], reason: "Sunflower or canola oil base plus natural flavors umbrella term. Siete (avocado oil) is the cleaner swap." },
  { name: "Siete Chips",         category: "food",          floor: 1, ceiling: 3, substances: [], reason: "Avocado oil, sea salt, cassava flour. Clean tortilla chip with no industrial seed oils." },
];

// Mirrors server.js detectCategory — simplified version covering all calibration categories
function detectCategory(entry) {
  return entry.category || "other";
}

// Build a minimal scored result from a calibration entry. Marked
// enriched:false so the runtime trigger in /analyze and /barcode can
// fire a one-shot Pass 1 enrichment that layers AI-generated reasoning
// over the locked calibration score.
function buildResult(name, entry) {
  const midScore = Math.round((entry.floor + entry.ceiling) / 2);
  const result = applyProductCalibration({
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
  result.enriched = false;
  return result;
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

  // Carousel items first — these are the home-screen first-impression
  // CTAs and need to be hot in Redis before the broader calibration set
  // even starts loading.
  console.log(`Loading ${CAROUSEL_ITEMS.length} CAROUSEL_ITEMS first (first-impression CTAs)...`);
  for (const c of CAROUSEL_ITEMS) {
    const midScore = Math.round((c.floor + c.ceiling) / 2);
    const result = applyProductCalibration({
      product_name: c.name,
      score: midScore,
      overall_score: midScore,
      category: c.category,
      confidence: "high",
      dimensions: {
        materials:    { score: 5, concerns: c.substances || [] },
        usage_exposure: { score: 5, concerns: [] },
        packaging:    { score: 5, concerns: [] },
        sustainability: { score: 5, concerns: [] },
      },
      concerns: c.substances || [],
      flagged_substances: c.substances || [],
      summary: c.reason,
      alternatives: [],
      ai_alternatives: [],
      _preloaded: true,
      _carousel: true,
    });
    result.enriched = false;
    try {
      const k = cacheKey(c.name, c.category);
      await redisSet(k, result);
      console.log(`  Carousel: ${c.name.padEnd(28)} -> ${k}`);
      loaded++;
    } catch (e) {
      console.warn(`  Carousel failed: ${c.name} - ${e.message}`);
      failed++;
    }
  }

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
