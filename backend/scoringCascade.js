// backend/scoringCascade.js
// Five-tier scoring cascade for text-only /analyze queries. Tiers 1 and 2 live
// in server.js (in-memory CALIBRATION + cacheGet). This module owns 3, 4, 5:
//
//   Tier 3 — Open Food / Beauty / Products Facts text search (strict)
//   Tier 4 — Anthropic web_search_20250305 → JSON ingredient extraction
//   Tier 5 — Category-prior best guess (no AI, no chemistry, contained)
//
// All three return a Pass-0-shaped object so the caller in server.js can plug
// the result into the existing pass1(productName, materialContext, category)
// flow with minimal branching:
//
//   { ingredients, source, sourceUrl, sourceLabel, sourceConfidence,
//     productData, brand, category }
//
// or, for Tier 5, a fully-built `syntheticResult` instead of ingredients.
//
// Why a separate module: server.js is already 7,700 lines. Confining cascade
// logic + dedupe + the strict OFF search heuristics here keeps the orchestrator
// in /analyze short and readable.

const USER_AGENT = "Partiqule/1.0 (paul@partiqule.com)";
const FACTS_TIMEOUT_MS = 6000;
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

// ── Trigram similarity (Jaccard on padded 3-char windows) ─────────
// Duplicated from server.js's /search implementation rather than imported, so
// this module stays self-contained. Same threshold semantics as /search.
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

// ── Tier 3: Open Facts text search ────────────────────────────────
// Three Open Facts databases support text search via the legacy CGI endpoint.
// The newer v2 API is barcode-only. We fan out across food / beauty / products
// in parallel and pick the strongest match across all three.
const OPEN_FACTS_TEXT_SOURCES = [
  {
    source: "open_food_facts",
    searchUrl: "https://world.openfoodfacts.org/cgi/search.pl",
    pageBase:  "https://world.openfoodfacts.org/product/",
  },
  {
    source: "open_beauty_facts",
    searchUrl: "https://world.openbeautyfacts.org/cgi/search.pl",
    pageBase:  "https://world.openbeautyfacts.org/product/",
  },
  {
    source: "open_products_facts",
    searchUrl: "https://world.openproductsfacts.org/cgi/search.pl",
    pageBase:  "https://world.openproductsfacts.org/product/",
  },
];

// Strict acceptance criteria — chosen to avoid the Danimals fabrication failure
// mode that motivated disabling text scoring. We only accept a candidate if:
//   1. trigram similarity to the query (against OFF's product_name) ≥ 0.7
//   2. ingredients_text is non-empty after trim (so we have real chemistry)
//   3. the OFF product is marked `complete` (truthy)
// Looser thresholds re-create the failure mode: the AI is then given OFF data
// for some random foreign product with a similar name, and Pass 1 dutifully
// scores those wrong ingredients with high confidence.
const TIER3_MIN_SIMILARITY = 0.7;

function pickBestOpenFactsMatch(query, products, source, pageBase) {
  let best = null;
  for (const p of products || []) {
    const name = p.product_name_en || p.product_name || "";
    if (!name) continue;
    const ingredients = (p.ingredients_text_en || p.ingredients_text || "").trim();
    if (!ingredients) continue;
    // OFF stores `complete` as 0/1 — coerce to boolean. Some entries lack the
    // field; treat "missing complete flag" as "incomplete" rather than guessing.
    if (!p.complete) continue;
    const sim = trigramSimilarity(query, name);
    if (sim < TIER3_MIN_SIMILARITY) continue;
    if (!best || sim > best.sim) {
      best = {
        sim,
        product: p,
        ingredients,
        productName: name,
        brand: p.brands || "",
        sourceUrl: p.code ? pageBase + encodeURIComponent(p.code) : null,
        rawSource: source,
      };
    }
  }
  return best;
}

async function searchOneOpenFacts(query, target) {
  const url = `${target.searchUrl}?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=10`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(FACTS_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const best = pickBestOpenFactsMatch(query, json.products || [], target.source, target.pageBase);
    return best;
  } catch (e) {
    console.warn(`[Tier3] ${target.source} text search failed:`, e.message);
    return null;
  }
}

async function tier3OpenFactsTextSearch(productName) {
  const start = Date.now();
  const results = await Promise.allSettled(
    OPEN_FACTS_TEXT_SOURCES.map(t => searchOneOpenFacts(productName, t))
  );
  let best = null;
  for (const r of results) {
    if (r.status !== "fulfilled" || !r.value) continue;
    if (!best || r.value.sim > best.sim) best = r.value;
  }
  const duration_ms = Date.now() - start;
  if (!best) {
    console.log(`[tier3] no_match query="${productName}" duration=${duration_ms}ms`);
    return null;
  }
  console.log(`[tier3] hit query="${productName}" matched="${best.productName}" sim=${best.sim.toFixed(2)} source=${best.rawSource} duration=${duration_ms}ms`);
  // Map raw source name to a user-facing label. Same naming used in server.js
  // ingredient-source mapping table (see CLAUDE.md "Ingredient Source Display").
  const sourceLabel =
    best.rawSource === "open_food_facts"     ? "Sourced from Open Food Facts" :
    best.rawSource === "open_beauty_facts"   ? "Sourced from Open Beauty Facts" :
                                                "Sourced from Open Products Facts";
  return {
    ingredients: best.ingredients,
    source: best.rawSource,
    sourceUrl: best.sourceUrl,
    sourceLabel,
    sourceConfidence: "medium",
    productName: best.productName,
    brand: best.brand,
    rawProduct: best.product,
  };
}

// ── Tier 4: web_search_20250305 → JSON extraction ─────────────────
// Single Claude turn that uses Anthropic's server-side web_search tool to find
// the product, fetch retailer/brand pages, and return a strict JSON
// {product_name, brand, ingredients[], category, source_domain}. The model
// validates each field; we also validate post-parse that ingredients is a
// non-empty array. If anything is off we return null and the cascade falls to
// Tier 5. Timeout 8s — anything longer is a bad bet vs. letting Tier 5 answer
// instantly with the honest "best guess" label.
const TIER4_TIMEOUT_MS = 12000;

function extractJsonFromText(text) {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escaped) { escaped = false; continue; }
    if (c === "\\" && inString) { escaped = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (!inString) {
      if (c === "{") depth++;
      if (c === "}") { depth--; if (depth === 0) return text.slice(start, i + 1); }
    }
  }
  return null;
}

async function tier4WebExtract(productName, { incrementApiCount, checkApiBudget } = {}) {
  const start = Date.now();
  if (typeof checkApiBudget === "function") checkApiBudget();
  if (typeof incrementApiCount === "function") incrementApiCount();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIER4_TIMEOUT_MS);
  try {
    const res = await fetch(ANTHROPIC_API, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1200,
        temperature: 0,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        system: `You are a product-data extraction agent. Use web_search to find the product the user names, then read retailer or brand pages to extract its ingredient list verbatim. Prefer the manufacturer's own page or a major retailer (Amazon, Target, Walmart, Sephora, Ulta) over aggregators or news sites.

Return ONLY raw JSON (no markdown, no preamble) in this exact shape:

{
  "product_name": "string — the canonical product name as listed on the source page",
  "brand": "string — the brand, or empty string if not specified",
  "ingredients": ["array", "of", "ingredient", "strings"],
  "category": "string — one of: food, beverage, snack, supplement, restaurant, personal_care, skincare, cleaning, home, clothing, baby, toy, home_furnishing, kitchen, accessory, other",
  "source_domain": "string — the domain you read the ingredients from, e.g. amazon.com",
  "found": true | false
}

Hard rules:
- ingredients MUST be exactly as printed on the source page. Do NOT paraphrase, deduplicate, or add ingredients you have prior knowledge of. Order matters.
- If you cannot find a clear ingredient list on a credible page, set "found": false and return an empty ingredients array. Do NOT guess.
- If the product name on the page does not match the query, set "found": false. Do NOT substitute a similar product.
- Never use apostrophes inside JSON string values; use plain text.`,
        messages: [{
          role: "user",
          content: `Find the ingredient list for: "${productName}". Search the web, read the most credible source page, and return the JSON.`,
        }],
      }),
    });
    clearTimeout(timeout);
    if (!res.ok) {
      console.warn(`[tier4] http ${res.status}`);
      return null;
    }
    const data = await res.json();
    const text = (data.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("")
      .trim();
    const jsonStr = extractJsonFromText(text);
    if (!jsonStr) {
      console.warn(`[tier4] no JSON in response (len=${text.length})`);
      return null;
    }
    let parsed;
    try { parsed = JSON.parse(jsonStr); }
    catch (e) { console.warn(`[tier4] JSON parse failed: ${e.message}`); return null; }
    if (!parsed.found) {
      console.log(`[tier4] not_found query="${productName}" duration=${Date.now()-start}ms`);
      return null;
    }
    if (!Array.isArray(parsed.ingredients) || parsed.ingredients.length === 0) {
      console.log(`[tier4] empty_ingredients query="${productName}"`);
      return null;
    }
    // Sanity guard: if the AI returns a name wildly different from the query,
    // treat as no-match. Same threshold as Tier 3 for consistency.
    const returnedName = String(parsed.product_name || "");
    if (returnedName) {
      const sim = trigramSimilarity(productName, returnedName);
      if (sim < TIER3_MIN_SIMILARITY) {
        console.log(`[tier4] name_mismatch query="${productName}" returned="${returnedName}" sim=${sim.toFixed(2)}`);
        return null;
      }
    }
    const ingredientText = parsed.ingredients.map(s => String(s).trim()).filter(Boolean).join(", ");
    const sourceDomain = String(parsed.source_domain || "").trim().toLowerCase().replace(/^www\./, "");
    const sourceLabel = sourceDomain ? `Sourced from ${sourceDomain}` : "Sourced from web search";
    console.log(`[tier4] hit query="${productName}" domain=${sourceDomain} ingredients=${parsed.ingredients.length} duration=${Date.now()-start}ms`);
    return {
      ingredients: ingredientText,
      ingredientArray: parsed.ingredients,
      source: "web_search",
      sourceUrl: null, // Anthropic web_search doesn't surface canonical URLs reliably
      sourceLabel,
      sourceConfidence: "medium",
      productName: returnedName || productName,
      brand: String(parsed.brand || ""),
      category: String(parsed.category || ""),
      sourceDomain,
    };
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === "AbortError") {
      console.warn(`[tier4] timeout after ${TIER4_TIMEOUT_MS}ms`);
    } else {
      console.warn(`[tier4] error: ${e.message}`);
    }
    return null;
  }
}

// ── Tier 5: category-prior best guess (no AI, no chemistry) ───────
// Last-resort fallback. We do NOT call Pass 1 here because Pass 1 without an
// ingredient list fabricates flagged_substances and harmful_chemicals from
// training priors — exactly the failure mode that prompted disabling the text
// path on 2026-04-18. Instead we synthesize a minimal-shape result with:
//   - score = category midpoint (CATEGORY_AVERAGES, rounded)
//   - all dimensions = same midpoint (UI renders without errors)
//   - empty flagged_substances / harmful_chemicals / ingredient_list
//   - honest summary that names the limitation
//   - sourceConfidence: "low" + sourceLabel: "Best guess from product name"
// Substance floors are bypassed by callers because there's nothing to floor.
function tier5CategoryPrior(productName, category, { categoryAverages, categoryContext } = {}) {
  const cat = category || "other";
  const avgEntry = (categoryAverages || {})[cat] || (categoryAverages || {}).other || { avg: 5.5 };
  const score = Math.round(avgEntry.avg);
  const summaryShort = `Without the ingredient list I'm guessing from the product type. Scan the barcode or label for a verified score.`;
  return {
    syntheticResult: {
      product_name: productName,
      category: cat,
      score,
      overall_score: score,
      confidence: "low",
      confidence_note: "No verified ingredient data available — score reflects the typical range for this product category, not this specific item.",
      summary: summaryShort,
      summary_short: summaryShort,
      summary_long: summaryShort,
      concerns: [],
      flagged_substances: [],
      identified_plastics: [],
      harmful_chemicals: [],
      natural_materials: [],
      ingredient_list: [],
      dimensions: {
        materials:      { score, label: "", concerns: [] },
        usage_exposure: { score, label: "", concerns: [], frequency: "unknown", type: "unknown", intensity: "unknown", vulnerable: false },
        packaging:      { score, label: "", concerns: [], primary: "unknown", refillable: false, end_of_life: "unknown" },
        sustainability: { score, label: "", concerns: [], reusable: false, replaces_single_use: false, replaces_count: null, circularity: "unknown" },
      },
      is_child_product: false,
      child_score: score,
      child_bumps: [],
      pregnancy_score: score,
      pregnancy_bumps: [],
      peer_comparison: "Estimate only — scan the label for a real score",
      scan_next: [],
      nutrition: null,
      alternatives: [],
      ai_alternatives: [],
      product_family: null,
      category_score_context: (categoryContext || {})[cat] || (categoryContext || {}).other || "",
      // Source-provenance fields (see "Five-Tier Scoring Cascade" in CLAUDE.md)
      source: "ai_text_only_estimate",
      source_label: "Best guess from product name",
      source_confidence: "low",
      // Tier 5 is intentionally NOT cached. Callers should skip cacheSet for
      // this result so that next visit re-runs the cascade — OFF or web search
      // may have answers next time.
      _skipCache: true,
    },
  };
}

// ── In-flight query deduplication ─────────────────────────────────
// Prevents cost spikes when many users (or one user mashing the button) submit
// the same query simultaneously. Keys are normalized "query|category" strings.
// Same Promise is awaited by every concurrent caller; the slot is cleared 5
// minutes after the Promise settles so a follow-up visit re-runs the cascade
// (Tier 4/5 results are intentionally not cached at the score-cache layer).
const DEDUPE_TTL_MS = 5 * 60 * 1000;
const inflight = new Map();

function dedupeKey(query, category) {
  return `${(query || "").toLowerCase().trim()}|${category || "other"}`;
}

async function dedupeInflight(query, category, fn) {
  const key = dedupeKey(query, category);
  const existing = inflight.get(key);
  if (existing && existing.expiresAt > Date.now()) {
    return existing.promise;
  }
  const promise = (async () => fn())();
  const slot = { promise, expiresAt: Date.now() + DEDUPE_TTL_MS };
  inflight.set(key, slot);
  // Clear the slot 5 min after settle so the next request can run fresh.
  promise.finally(() => {
    setTimeout(() => {
      const current = inflight.get(key);
      if (current && current.promise === promise) inflight.delete(key);
    }, DEDUPE_TTL_MS).unref?.();
  });
  return promise;
}

module.exports = {
  tier3OpenFactsTextSearch,
  tier4WebExtract,
  tier5CategoryPrior,
  dedupeInflight,
  // exposed for tests
  _internal: { trigramSimilarity, pickBestOpenFactsMatch, TIER3_MIN_SIMILARITY },
};
