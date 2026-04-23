// backend/pass0.js
// Pass 0 — ingredient resolution layer. Runs before Pass 1 scoring to source
// a verified ingredient list from external databases before the AI ever sees
// the product. If no verified ingredients can be found, Pass 0 returns
// source: "none" and callers decide whether to proceed (barcode: fallback UI;
// text: cascade Tier 3/4/5 in scoringCascade.js; image: AI still scores from pixels).
//
// Resolution order:
//   1. Barcode → Open Food Facts (v2)
//   2. Barcode → Open Beauty Facts (v2)
//   3. Barcode → Open Products Facts (v2)   ← kept to preserve existing coverage
//   4. productName → Supabase scans.result_json->>'ingredient_list' (last 12 months)
//   5. image → stub (returns source: "none" until vision path is refactored)
//   6. none
//
// Exports:
//   resolveIngredients({ productName, barcode, image, category, supabase })
//     -> { ingredients, source, confidence, sourceUrl, verifiedAt, rawProduct }

const { lookupBarcode } = require("./barcodeIndex");
const { externalBarcodeLookup } = require("./barcodeLookup");

const USER_AGENT = "Partiqule/1.0 (paul@partiqule.com)";
const FACTS_TIMEOUT_MS = 6000;
const SUPABASE_CACHE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000; // 12 months

const BARCODE_ATTEMPTS = [
  {
    source: "open_food_facts",
    apiBase: "https://world.openfoodfacts.org/api/v2/product/",
    pageBase: "https://world.openfoodfacts.org/product/",
  },
  {
    source: "open_beauty_facts",
    apiBase: "https://world.openbeautyfacts.org/api/v2/product/",
    pageBase: "https://world.openbeautyfacts.org/product/",
  },
  {
    source: "open_products_facts",
    apiBase: "https://world.openproductsfacts.org/api/v2/product/",
    pageBase: "https://world.openproductsfacts.org/product/",
  },
];

async function fetchFactsProduct(apiBase, barcode) {
  const url = apiBase + encodeURIComponent(barcode) + ".json";
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(FACTS_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const json = await res.json();
  if (json.status !== 1 || !json.product) return null;
  return json.product;
}

function extractIngredientText(product) {
  if (!product) return "";
  return product.ingredients_text_en || product.ingredients_text || "";
}

async function tryBarcode(barcode) {
  // Stage 1: Open Food / Beauty / Products Facts in parallel.
  // Preference order: food > beauty > product. Matches legacy /barcode behavior.
  const results = await Promise.allSettled(
    BARCODE_ATTEMPTS.map((a) => fetchFactsProduct(a.apiBase, barcode))
  );
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status !== "fulfilled" || !r.value) continue;
    const product = r.value;
    const ingredients = extractIngredientText(product);
    const confidence = ingredients ? "high" : "medium";
    return {
      ingredients: ingredients || null,
      source: BARCODE_ATTEMPTS[i].source,
      confidence,
      sourceUrl: BARCODE_ATTEMPTS[i].pageBase + encodeURIComponent(barcode),
      verifiedAt: new Date().toISOString(),
      rawProduct: product,
    };
  }

  // Stage 2: Local barcode index. Hand-curated UPC → product-name map for
  // brands we've already calibrated (Blueland, Method, Huggies, etc.) but
  // that aren't in any of the OFF-family databases.
  const localName = lookupBarcode(barcode);
  if (localName) {
    return {
      ingredients: null,
      source: "barcode_index",
      confidence: "medium",
      sourceUrl: null,
      verifiedAt: new Date().toISOString(),
      rawProduct: { product_name: localName, _source: "local_barcode_index" },
    };
  }

  // Stage 3: External barcode lookup API (gated on BARCODE_LOOKUP_PROVIDER env).
  // Returns a product-name-only record; the /barcode handler runs it through
  // calibration + cascade the same way the local index does.
  const external = await externalBarcodeLookup(barcode);
  if (external && external.product_name) {
    return {
      ingredients: null,
      source: "barcode_external",
      confidence: "medium",
      sourceUrl: null,
      verifiedAt: new Date().toISOString(),
      rawProduct: {
        product_name: external.product_name,
        brands: external.brand || "",
        _source: external._source,
      },
    };
  }

  return null;
}

async function tryScansCache(productName, supabase) {
  if (!supabase || !productName) return null;
  try {
    const cutoff = new Date(Date.now() - SUPABASE_CACHE_MAX_AGE_MS).toISOString();
    // Escape LIKE wildcards so product names containing % or _ match literally
    const safe = String(productName).replace(/[%_]/g, (c) => "\\" + c);
    const { data, error } = await supabase
      .from("scans")
      .select("product_name, result_json, scanned_at")
      .ilike("product_name", safe)
      .gte("scanned_at", cutoff)
      .order("scanned_at", { ascending: false })
      .limit(1);
    if (error || !data || !data.length) return null;
    const row = data[0];
    const ingList = row.result_json?.ingredient_list;
    if (!Array.isArray(ingList) || ingList.length === 0) return null;
    return {
      ingredients: ingList.join(", "),
      source: "supabase_scans",
      confidence: "medium",
      sourceUrl: null,
      verifiedAt: row.scanned_at || null,
      rawProduct: row.result_json || null,
    };
  } catch (e) {
    console.warn("[PASS0] Supabase cache lookup failed:", e.message);
    return null;
  }
}

function noneResult() {
  return {
    ingredients: null,
    source: "none",
    confidence: "none",
    sourceUrl: null,
    verifiedAt: null,
    rawProduct: null,
  };
}

async function resolveIngredients({ productName, barcode, image, category, supabase } = {}) {
  const start = Date.now();
  let result = null;
  try {
    if (barcode) {
      result = await tryBarcode(barcode);
    }
    if (!result && productName) {
      result = await tryScansCache(productName, supabase);
    }
    // image branch — stub for this session. callClaudeVision still handles
    // image-path scoring end-to-end. A future session will add an OCR-only
    // Claude call here so Pass 0 can supply ingredients to Pass 1.
    if (!result) result = noneResult();
  } catch (e) {
    console.warn("[PASS0] resolveIngredients error:", e.message);
    result = noneResult();
  }
  const duration_ms = Date.now() - start;
  console.log(
    "[pass0_resolution]",
    JSON.stringify({
      productName: productName || null,
      barcode: barcode ? true : false,
      image: image ? true : false,
      category: category || null,
      source: result.source,
      confidence: result.confidence,
      duration_ms,
    })
  );
  return result;
}

module.exports = { resolveIngredients };
