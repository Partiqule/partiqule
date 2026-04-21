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
// non-empty array.
//
// Tier 4 is intentionally AGGRESSIVE. For nearly every consumer product on a
// US/UK shelf, an ingredient list exists online (retailer PDPs, brand sites,
// nutrition databases, SmartLabel, EWG, OFF scan entries indexed outside OFF's
// search API). The previous "if in doubt, return found:false" stance kept
// fabrications out but also caused real products (Abes Mini Muffins, Athletic
// Ankle Socks) to land in Tier 5 when ingredients were obviously findable.
// The prompt below tells the AI to search hard, try multiple sources, and
// accept the closest-matching VARIANT of the queried product rather than
// giving up. The tier-specific similarity gate is relaxed to 0.45 (vs. 0.7
// for Tier 3) because the AI is itself judging whether the returned product
// is the right one — the trigram check is a sanity guard, not the primary
// filter. Up to 2 attempts: the second uses a canonicalized query (adds
// apostrophes, strips size/unit qualifiers) if the first misses.
const TIER4_TIMEOUT_MS = 22000;
const TIER4_MIN_SIMILARITY = 0.45;

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

// Canonicalize a query for a retry pass when the first attempt misses. Adds
// the apostrophe back into "Abes" → "Abe's", strips size/unit qualifiers
// that often appear in ID'd product names but not in retailer titles.
function canonicalizeQuery(q) {
  let out = String(q || "").trim();
  // Re-apostrophize common possessive brand prefixes dropped by vision OCR
  out = out.replace(/\b(Abes|Annies|Amys|Traders|Trader Joes|Reeses|Hersheys|Kelloggs|Campbells|Moms|Bens|Jennies|Ghirardellis|Newmans|Smuckers|Tazos|Raos|Lays|Tims|Thomass)\b/gi, m => {
    const map = {
      "abes":"Abe's","annies":"Annie's","amys":"Amy's","traders":"Trader's",
      "trader joes":"Trader Joe's","reeses":"Reese's","hersheys":"Hershey's",
      "kelloggs":"Kellogg's","campbells":"Campbell's","moms":"Mom's",
      "bens":"Ben's","jennies":"Jennie's","ghirardellis":"Ghirardelli's",
      "newmans":"Newman's","smuckers":"Smucker's","tazos":"Tazo's",
      "raos":"Rao's","lays":"Lay's","tims":"Tim's","thomass":"Thomas'",
    };
    return map[m.toLowerCase()] || m;
  });
  // Strip common qualifiers that narrow retailer searches
  out = out
    .replace(/\b\d+\s*(oz|fl oz|lb|lbs|g|kg|ml|l|count|ct|pack|pk)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return out;
}

async function _tier4OneCall(query, { incrementApiCount, checkApiBudget }) {
  if (typeof checkApiBudget === "function") checkApiBudget();
  if (typeof incrementApiCount === "function") incrementApiCount();
  const start = Date.now();
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
        max_tokens: 1600,
        temperature: 0,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
        system: `You are a consumer-product ingredient-extraction agent. Your job is to find and return the published ingredient list for the product the user names. Ingredient lists for nearly every mass-market product are available online — on retailer PDPs (Amazon, Target, Walmart, Kroger, Whole Foods, iHerb, Sephora, Ulta, Thrive Market), brand websites, SmartLabel.org, Open Food Facts, Open Beauty Facts, EWG, Yuka, manufacturer PDFs, FDA filings, or nutrition databases. Search hard, try multiple sources, and do not give up after one query.

Recommended search strategy:
  1. First try "<product name> ingredients" on major retailers and brand domains.
  2. If the exact variant isn't found, search the brand or family name and look for the variant on the brand's own PDP listing.
  3. If the first search returns only reviews/blogs/news, refine with "<brand> <product> ingredients list" or "<brand> <product> site:<retailer>".
  4. If you find a VARIANT of the same product (e.g. query is "Abes Mini Muffins" and the brand page lists "Abe's Chocolate Chip Mini Muffins"), return that variant's ingredients — it is far more useful than returning nothing. Report the variant's full name in product_name.

Return ONLY raw JSON (no markdown, no preamble) in this exact shape:

{
  "product_name": "string — the canonical product name as listed on the source page, including variant/flavor",
  "brand": "string — the brand, or empty string if not specified",
  "ingredients": ["array", "of", "ingredient", "strings"],
  "category": "string — one of: food, beverage, snack, supplement, restaurant, personal_care, skincare, cleaning, home, clothing, baby, toy, home_furnishing, kitchen, accessory, other",
  "source_domain": "string — the domain you read the ingredients from, e.g. amazon.com",
  "found": true | false
}

Hard rules:
- ingredients MUST be exactly as printed on the source page. Do NOT paraphrase, deduplicate, or add ingredients you have prior knowledge of. Order matters.
- found:true is the strongly preferred outcome. Only set found:false if after multiple searches across different domains no credible ingredient list exists online.
- For a clothing/home/accessory product where material composition is printed on the label (e.g. "72% nylon, 25% polyester, 3% spandex"), return those as "ingredients" — the cascade treats material composition as the ingredient-equivalent for those categories.
- You MAY return ingredients for the closest available variant of the queried product, but name_mismatch downstream will reject anything wildly off. Use judgment.
- Never use apostrophes inside JSON string values; use plain text.`,
        messages: [{
          role: "user",
          content: `Find the ingredient list (or material composition, for textile/clothing products) for: "${query}". Search multiple retailers and the brand's own site. If the exact variant is not listed, use the closest available variant and report its full name. Return the JSON.`,
        }],
      }),
    });
    clearTimeout(timeout);
    if (!res.ok) {
      console.warn(`[tier4] http ${res.status}`);
      return { ok: false, reason: `http_${res.status}`, duration: Date.now() - start };
    }
    const data = await res.json();
    const text = (data.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("")
      .trim();
    const jsonStr = extractJsonFromText(text);
    if (!jsonStr) return { ok: false, reason: "no_json", duration: Date.now() - start };
    let parsed;
    try { parsed = JSON.parse(jsonStr); }
    catch (e) { return { ok: false, reason: `parse_${e.message}`, duration: Date.now() - start }; }
    if (!parsed.found) return { ok: false, reason: "not_found", duration: Date.now() - start };
    if (!Array.isArray(parsed.ingredients) || parsed.ingredients.length === 0) {
      return { ok: false, reason: "empty_ingredients", duration: Date.now() - start };
    }
    return { ok: true, parsed, duration: Date.now() - start };
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === "AbortError") return { ok: false, reason: "timeout", duration: Date.now() - start };
    return { ok: false, reason: `error_${e.message}`, duration: Date.now() - start };
  }
}

async function tier4WebExtract(productName, deps = {}) {
  const started = Date.now();
  // Attempt 1: verbatim query.
  let attempt = await _tier4OneCall(productName, deps);
  let usedQuery = productName;

  // Attempt 2: canonicalized query. Retry budget is bounded by the existing
  // per-call checkApiBudget/incrementApiCount; if the budget is exhausted the
  // second call will throw and bail.
  if (!attempt.ok) {
    const canonical = canonicalizeQuery(productName);
    if (canonical && canonical.toLowerCase() !== productName.toLowerCase()) {
      console.log(`[tier4] retry1 query="${productName}" canonical="${canonical}" reason=${attempt.reason}`);
      attempt = await _tier4OneCall(canonical, deps);
      usedQuery = canonical;
    }
  }

  if (!attempt.ok) {
    console.log(`[tier4] miss query="${productName}" reason=${attempt.reason} duration=${Date.now()-started}ms`);
    return null;
  }

  const parsed = attempt.parsed;
  const returnedName = String(parsed.product_name || "");
  if (returnedName) {
    const sim = Math.max(
      trigramSimilarity(productName, returnedName),
      trigramSimilarity(usedQuery, returnedName),
    );
    if (sim < TIER4_MIN_SIMILARITY) {
      console.log(`[tier4] name_mismatch query="${productName}" returned="${returnedName}" sim=${sim.toFixed(2)} threshold=${TIER4_MIN_SIMILARITY}`);
      return null;
    }
  }
  const ingredientText = parsed.ingredients.map(s => String(s).trim()).filter(Boolean).join(", ");
  const sourceDomain = String(parsed.source_domain || "").trim().toLowerCase().replace(/^www\./, "");
  const sourceLabel = sourceDomain ? `Sourced from ${sourceDomain}` : "Sourced from web search";
  console.log(`[tier4] hit query="${productName}" used="${usedQuery}" domain=${sourceDomain} ingredients=${parsed.ingredients.length} duration=${Date.now()-started}ms`);
  return {
    ingredients: ingredientText,
    ingredientArray: parsed.ingredients,
    source: "web_search",
    sourceUrl: null,
    sourceLabel,
    sourceConfidence: "medium",
    productName: returnedName || productName,
    brand: String(parsed.brand || ""),
    category: String(parsed.category || ""),
    sourceDomain,
  };
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
