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

// Tier 4 name-match acceptance. Trigram alone is too strict when the AI
// returns the canonical longer variant of a short query (e.g. query "Abes
// Mini Muffins" returns "Abe's Gluten Free Chocolate Chip Mini Muffins" —
// same product, trigram Jaccard ~0.29). We accept if EITHER:
//   (a) trigram >= TIER4_MIN_SIMILARITY against the original or canonicalized
//       query (handles typical close matches), OR
//   (b) every meaningful token from the query appears in the returned name
//       (handles "query is a strict subset of a longer canonical name"), OR
//   (c) the AI's reported brand matches a token in the query (handles
//       "Abes" + brand="Abe's Muffins").
// Rejects wildly different products (e.g. query "Abes Muffins" returned
// "Starbucks Latte") because neither the trigram nor the token-subset test
// passes.
const TIER4_STOPWORDS = new Set(["the","a","an","and","or","of","with","for","in","on","to","by","from"]);
function _tokenize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(t => t && !TIER4_STOPWORDS.has(t));
}
function isTier4NameAcceptable(originalQuery, usedQuery, returnedName, returnedBrand) {
  const sim = Math.max(
    trigramSimilarity(originalQuery, returnedName),
    trigramSimilarity(usedQuery, returnedName),
  );
  if (sim >= TIER4_MIN_SIMILARITY) return true;

  const returnedTokens = new Set([
    ..._tokenize(returnedName),
    ..._tokenize(returnedBrand),
  ]);
  const queryTokens = _tokenize(originalQuery);
  const usedTokens = _tokenize(usedQuery);
  const tokensAreSubset = (qt) => qt.length > 0 && qt.every(t => {
    if (returnedTokens.has(t)) return true;
    // Singular/plural tolerance: "muffins" matches "muffin" in returned name.
    if (t.endsWith("s") && returnedTokens.has(t.slice(0, -1))) return true;
    if (returnedTokens.has(t + "s")) return true;
    return false;
  });
  if (tokensAreSubset(queryTokens) || tokensAreSubset(usedTokens)) return true;

  return false;
}

async function _tier4OneCall(query, { incrementApiCount, checkApiBudget }, attemptKind = "verbatim") {
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
- For non-consumable products (clothing, home, accessory, toy, kitchen, home_furnishing — including watches, jewelry, bags, eyewear, leather goods, hardware, electronics housings), return the MATERIAL COMPOSITION as the "ingredients" array. This is the cascade's ingredient-equivalent for those categories. Examples:
  - Textile composition strings: ["72% nylon", "25% polyester", "3% spandex"]
  - Watches/jewelry: ["stainless steel case", "leather strap", "mineral crystal", "silicone gasket"]
  - Bags: ["full-grain leather exterior", "polyester lining", "metal hardware"]
  - Toys: ["ABS plastic", "polyester filling", "polypropylene"]
  Pull these from spec pages, brand "materials" sections, retailer "About this item" / "Specifications", or care labels. If only a narrative description is available ("crafted from calfskin with a sapphire crystal"), extract the named materials as separate array entries. found:true is correct as long as you can identify the primary materials; a percentage breakdown is not required for non-textile categories.
- You MAY return ingredients for the closest available variant of the queried product, but name_mismatch downstream will reject anything wildly off. Use judgment.
- Never use apostrophes inside JSON string values; use plain text.`,
        messages: [{
          role: "user",
          content: `Find the ingredient list — or, for non-consumable products like watches, jewelry, bags, clothing, toys, or home goods, the material composition (case material, strap, lining, filling, etc.) — for: "${query}". Search multiple retailers and the brand's own site. If the exact variant is not listed, use the closest available variant and report its full name. Return the JSON.`,
        }],
      }),
    });
    clearTimeout(timeout);
    const finish = (outcome) => {
      const duration = Date.now() - start;
      console.log(JSON.stringify({
        level: "info", event: "tier4_attempt",
        ts: new Date().toISOString(),
        query, attempt_kind: attemptKind,
        duration_ms: duration,
        result: outcome.ok ? "success" : outcome.reason,
        ingredient_count: outcome.parsed?.ingredients?.length || 0,
        source_domain: outcome.parsed?.source_domain || null,
      }));
      return { ...outcome, duration };
    };
    if (!res.ok) {
      console.warn(`[tier4] http ${res.status}`);
      return finish({ ok: false, reason: `http_${res.status}` });
    }
    const data = await res.json();
    const text = (data.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("")
      .trim();
    const jsonStr = extractJsonFromText(text);
    if (!jsonStr) return finish({ ok: false, reason: "no_json" });
    let parsed;
    try { parsed = JSON.parse(jsonStr); }
    catch (e) { return finish({ ok: false, reason: `parse_${e.message}` }); }
    if (!parsed.found) return finish({ ok: false, reason: "not_found", parsed });
    if (!Array.isArray(parsed.ingredients) || parsed.ingredients.length === 0) {
      return finish({ ok: false, reason: "empty_ingredients", parsed });
    }
    return finish({ ok: true, parsed });
  } catch (e) {
    clearTimeout(timeout);
    const duration = Date.now() - start;
    const reason = e.name === "AbortError" ? "timeout" : `error_${e.message}`;
    console.log(JSON.stringify({
      level: "info", event: "tier4_attempt",
      ts: new Date().toISOString(),
      query, attempt_kind: attemptKind,
      duration_ms: duration,
      result: reason,
      ingredient_count: 0,
      source_domain: null,
    }));
    return { ok: false, reason, duration };
  }
}

async function tier4WebExtract(productName, deps = {}) {
  const started = Date.now();
  // Attempt 1: verbatim query.
  let attempt = await _tier4OneCall(productName, deps, "verbatim");
  let usedQuery = productName;

  // Attempt 2: canonicalized query. Retry budget is bounded by the existing
  // per-call checkApiBudget/incrementApiCount; if the budget is exhausted the
  // second call will throw and bail.
  if (!attempt.ok) {
    const canonical = canonicalizeQuery(productName);
    if (canonical && canonical.toLowerCase() !== productName.toLowerCase()) {
      console.log(`[tier4] retry1 query="${productName}" canonical="${canonical}" reason=${attempt.reason}`);
      attempt = await _tier4OneCall(canonical, deps, "canonical");
      usedQuery = canonical;
    }
  }

  if (!attempt.ok) {
    console.log(`[tier4] miss query="${productName}" reason=${attempt.reason} duration=${Date.now()-started}ms`);
    return null;
  }

  const parsed = attempt.parsed;
  const returnedName = String(parsed.product_name || "");
  if (returnedName && !isTier4NameAcceptable(productName, usedQuery, returnedName, parsed.brand)) {
    console.log(`[tier4] name_mismatch query="${productName}" returned="${returnedName}" (no trigram or token-subset match)`);
    return null;
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
// ── Sourcing flags ──────────────────────────────────────────────
// Extracted from product names to surface on the result UI as small
// chips. Tone drives visual treatment in the frontend (moss / amber).
//
//   tone: "positive"  → moss chip with checkmark (clean signal)
//   tone: "caution"   → amber chip (worth knowing about)
//
// Both intrinsic flags (implied by the matched whole-food pattern —
// e.g. "atlantic salmon" → farm_raised) and explicit flags (mined
// from the product name string — e.g. "wild caught", "grass-fed",
// "organic") are merged. Explicit flags win when there's a conflict
// (a product literally labeled "Wild Atlantic Salmon" is wild_caught,
// not farm_raised).
function detectSourcingFlags(productName) {
  const norm = String(productName || "").toLowerCase();
  const flags = [];
  const add = (type, label, tone) => {
    if (!flags.find(f => f.type === type)) flags.push({ type, label, tone });
  };

  // ── Positive sourcing markers ──
  if (/\bwild[-\s]?caught\b|\bwild salmon|\bwild shrimp|\bwild sockeye|\bwild coho|\bwild chinook|\bwild halibut|\bwild cod|\bwild tuna|\balaskan salmon\b/.test(norm)) add("wild_caught", "Wild caught", "positive");
  if (/\bsockeye|\bcoho|\bchinook|\bking salmon|\bpink salmon|\bchum salmon\b/.test(norm) && !/farm/.test(norm)) add("wild_pacific", "Wild Pacific", "positive");
  if (/grass[-\s]?fed/.test(norm))                 add("grass_fed", "Grass-fed", "positive");
  if (/pasture[-\s]?raised/.test(norm))            add("pasture_raised", "Pasture-raised", "positive");
  if (/cage[-\s]?free/.test(norm))                 add("cage_free", "Cage-free", "positive");
  if (/free[-\s]?range/.test(norm))                add("free_range", "Free-range", "positive");
  if (/usda organic/.test(norm))                   add("usda_organic", "USDA Organic", "positive");
  else if (/\borganic\b/.test(norm))               add("organic", "Organic", "positive");
  if (/heritage breed|heritage (pig|cattle|chicken|turkey)/.test(norm)) add("heritage", "Heritage breed", "positive");
  if (/non[-\s]?gmo/.test(norm))                   add("non_gmo", "Non-GMO", "positive");
  if (/\bmsc certified|marine stewardship/.test(norm)) add("msc_certified", "MSC Certified", "positive");
  if (/\basc certified|aquaculture stewardship/.test(norm)) add("asc_certified", "ASC Certified", "positive");
  if (/certified humane|animal welfare approved/.test(norm)) add("humane", "Certified Humane", "positive");
  if (/antibiotic[-\s]?free|no antibiotics/.test(norm)) add("antibiotic_free", "Antibiotic-free", "positive");
  if (/hormone[-\s]?free|no (added )?hormones/.test(norm)) add("hormone_free", "Hormone-free", "positive");

  // ── Caution sourcing markers ──
  // Farm-raised: explicit text OR the implicit case of Atlantic salmon
  // without a wild qualifier (Atlantic salmon is overwhelmingly farmed).
  const hasWild = flags.find(f => f.type === "wild_caught" || f.type === "wild_pacific");
  if (!hasWild) {
    if (/farm[-\s]?raised|farmed\b/.test(norm))    add("farm_raised", "Farm-raised", "caution");
    else if (/atlantic salmon/.test(norm))         add("farm_raised", "Farm-raised", "caution");
  }
  if (/conventional|feedlot/.test(norm))           add("conventional", "Conventional", "caution");
  if (/(processed|cured|smoked|nitrate)/.test(norm) && /(meat|sausage|bacon|ham|hot dog|deli)/.test(norm)) add("processed", "Processed meat", "caution");

  return flags;
}

// ── Whole-foods detector ──────────────────────────────────────────
// Whole foods (salmon, chicken, eggs, fresh produce, plain dairy) ARE the
// ingredient — there's no printed ingredient list to scan because the
// product itself is the ingredient. The previous Tier 5 fallback returned
// a generic "guessing from the product type" message which was honest for
// branded packaged goods but wrong for whole foods. Sara hit this on a
// Trader Joe's Atlantic salmon scan.
//
// Detector returns null when the product name doesn't look like a whole
// food, OR an object with { floor, ceiling, why, wholeFood: true } that
// Tier 5 uses to build a real high-confidence result.
//
// Tiers (rough):
//   floor 1-3  wild fish, fresh produce, eggs, plain nuts/seeds, plain
//              whole grains, wild game, plain organic dairy
//   floor 2-4  farmed Atlantic salmon, conventional poultry, conventional
//              plain dairy
//   floor 3-5  conventional red meat (ground beef, steak), pork
//   floor 5-7  processed meats (bacon, sausage, hot dogs, deli meat)
function detectWholeFood(productName) {
  const norm = String(productName || "").toLowerCase().trim();
  if (!norm) return null;

  // Strip common brand prefixes so "trader joe's atlantic salmon" matches
  // the same patterns as "atlantic salmon".
  const stripped = norm
    .replace(/\b(trader joe'?s?|whole foods|365|kirkland|costco|aldi|publix|wegmans|sprouts|natural grocers|fresh market|kroger|safeway|walmart|target|sam'?s club|harris teeter)\b/g, "")
    .replace(/\b(pro cut|fresh|frozen|raw|wild caught|wild-caught|skin on|skinless|boneless|center cut|cage-?free|free-?range|pasture-?raised|grass-?fed|grass fed|organic|natural|certified humane|antibiotic-?free|hormone-?free|all natural)\b/g, "")
    .replace(/\b(filet|fillet|portion|portions|steaks?|chops?|breasts?|thighs?|wings?|drumsticks?|tenderloin|loin|chuck|rib(eye)?|brisket|roast|short rib|sirloin)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Order matters — most specific patterns first.
  const patterns = [
    // Wild fish & shellfish — clean
    { match: /(wild salmon|wild-caught salmon|alaskan salmon|sockeye|coho|chinook|king salmon|pink salmon|chum salmon)/, floor:1, ceiling:3,
      why:"Wild-caught salmon — clean protein with omega-3s. Lower contaminant load than farmed counterparts. Sustainably caught Pacific salmon (sockeye, coho, chinook) is the cleanest tier." },
    { match: /(halibut|cod|haddock|pollock|mahi mahi|mahi-mahi|sea bass|black bass|striped bass|snapper|rockfish|sole|flounder|trout|arctic char|tilapia)/, floor:1, ceiling:3,
      why:"Whole white fish — clean lean protein. Wild-caught is the cleanest; farmed varieties (especially imported tilapia) have somewhat higher contaminant exposure." },
    { match: /(sardine|mackerel|anchov|herring)/, floor:1, ceiling:3,
      why:"Small oily fish — exceptional omega-3 source with very low mercury. Among the cleanest seafood choices." },
    { match: /(tuna)(?!\s+(casserole|salad|melt|sandwich))/, floor:2, ceiling:4,
      why:"Tuna — high protein and omega-3s but mercury accumulation is a real concern. Skipjack and chunk light have lower mercury than albacore or yellowfin. Limit to 2-3 servings/week." },
    { match: /(wild shrimp|wild prawn|spot prawn|gulf shrimp)/, floor:1, ceiling:3,
      why:"Wild-caught shrimp/prawns — clean lean protein, low mercury." },
    { match: /(shrimp|prawn|scallop|oyster|mussel|clam|crab|lobster)(?!\s+(chip|cracker|flavor))/, floor:2, ceiling:4,
      why:"Shellfish — clean protein. Farmed and imported varieties may carry higher antibiotic and PCB exposure than wild domestic." },

    // Farmed Atlantic salmon — middle tier, common case
    { match: /(atlantic salmon|farmed salmon|farm-?raised salmon|norwegian salmon|scottish salmon)/, floor:2, ceiling:4,
      why:"Farmed Atlantic salmon — typically carries higher PCB and contaminant load than wild caught due to feed and pen conditions. Color is added via astaxanthin. Still a clean protein source with omega-3s, just one tier below the wild-caught benchmark. For maximum clean omega-3 density, choose wild Pacific salmon when available." },
    { match: /(salmon)/, floor:2, ceiling:4,
      why:"Salmon — clean protein with omega-3s. Wild-caught (sockeye, coho, chinook) is the cleanest tier; farmed Atlantic carries higher PCB load. The product page didn't specify which — the score reflects the typical range." },

    // Whole eggs
    { match: /^(eggs?|chicken eggs?|brown eggs?|white eggs?|jumbo eggs?|large eggs?|extra large eggs?|cage.?free eggs?|free.?range eggs?|pasture.?raised eggs?|organic eggs?|farm fresh eggs?)\s*$/, floor:1, ceiling:3,
      why:"Whole eggs — complete protein, B12, choline. Pasture-raised eggs have measurably higher omega-3 and vitamin D than conventional. Look for Certified Humane or Animal Welfare Approved labels." },

    // Plain nuts and seeds
    { match: /^(raw |dry roasted |roasted )?(almond|cashew|walnut|pecan|pistachio|macadamia|brazil nut|hazelnut|peanut|chia seed|flax seed|flaxseed|hemp seed|hemp heart|pumpkin seed|pepita|sunflower seed|sesame seed)s?\s*$/, floor:1, ceiling:3,
      why:"Plain nuts and seeds — minimally processed, healthy fats and protein. Watch for added oils (often canola or palm) and salt in flavored varieties." },

    // Plain whole grains
    { match: /^(brown rice|jasmine rice|basmati rice|wild rice|black rice|red rice|quinoa|oats|rolled oats|steel.?cut oats|old.?fashioned oats|barley|farro|millet|buckwheat|wheat berries|spelt|amaranth|teff|sorghum|bulgur|freekeh)\s*$/, floor:1, ceiling:3,
      why:"Whole grain — minimally processed carbohydrate source. Look for organic when possible (especially for oats due to glyphosate residue concerns) and watch for added flavorings on flavored varieties." },

    // Wild game
    { match: /(elk|venison|bison|buffalo|wild boar|rabbit)(?!\s+(chip|jerky|sausage|hot dog))/, floor:1, ceiling:3,
      why:"Wild game / pasture-raised alternatives — leaner than conventional red meat, no feedlot exposure. Naturally lower in saturated fat and higher in CLA and omega-3." },

    // Conventional poultry
    { match: /^(chicken|turkey|duck|cornish hen|whole chicken|whole turkey|ground turkey|ground chicken)/, floor:2, ceiling:4,
      why:"Conventional poultry — lean protein. Look for organic and pasture-raised for lower antibiotic exposure and better omega-3 ratios. Skin and dark meat carry slightly more saturated fat but more nutrients." },

    // Plain dairy (no additives)
    { match: /^(whole milk|2% milk|1% milk|skim milk|nonfat milk|reduced fat milk|milk|heavy cream|whipping cream|half and half|half-and-half|plain greek yogurt|plain yogurt|plain skyr|cottage cheese|cream cheese|sour cream|butter|unsalted butter|salted butter|ricotta|mascarpone|kefir)\s*$/, floor:2, ceiling:4,
      why:"Plain dairy — calcium, protein, and naturally occurring fats. Conventional dairy carries trace pesticide and antibiotic exposure; organic and grass-fed are cleaner. Look for A2 milk if you have sensitivities." },

    // Aged cheese (slightly higher tier — sodium concern)
    { match: /^(cheddar|mozzarella|parmesan|parmigiano|gouda|swiss|brie|camembert|blue cheese|feta|goat cheese|gruyere|manchego|pecorino|asiago|provolone|colby|monterey jack|havarti|fontina)\s*$/, floor:2, ceiling:4,
      why:"Aged cheese — calcium and protein, but high sodium. Raw-milk and grass-fed varieties have measurably better fatty acid profiles." },

    // Pork (other than processed)
    { match: /^(pork|pork chop|pork loin|pork tenderloin|pork shoulder|pork belly|ground pork)\s*$/, floor:3, ceiling:5,
      why:"Pork — conventional pigs raised in concentrated feeding operations carry higher antibiotic and arsenic exposure. Look for pasture-raised, heritage breed, or certified humane labels for cleaner sourcing." },

    // Conventional red meat
    { match: /(ground beef|beef|ribeye|sirloin|chuck|brisket|tenderloin|filet mignon|flank steak|skirt steak|hanger steak|t-bone|porterhouse|new york strip|strip steak|short rib|prime rib|chuck roast|round roast|stew meat|veal|lamb|leg of lamb|lamb chop)(?!\s+(jerky|stick|crisp|chip))/, floor:3, ceiling:5,
      why:"Conventional red meat — feedlot-raised cattle carry higher hormone, antibiotic, and saturated fat profiles. Grass-fed and pasture-raised have measurably better omega-3 ratios and lower inflammatory load. Look for 100% grass-fed labels (not just 'grass-fed') to avoid grain-finished beef." },

    // Processed meats — IARC group 1 carcinogen
    { match: /(bacon|sausage|ham|salami|pepperoni|hot dog|deli meat|lunch meat|cold cut|prosciutto|mortadella|chorizo|kielbasa|bratwurst|pastrami|corned beef|jerky|meat stick)/, floor:5, ceiling:7,
      why:"Processed meat — IARC Group 1 carcinogen due to nitrates, sodium, and smoke compounds (HCAs, PAHs). Even 'uncured' varieties typically use celery powder which contributes the same nitrates. Limit consumption; look for nitrate-free pasture-raised options for occasional use." },

    // Fresh produce — broad catch-all (last because pattern is loose)
    { match: /^(fresh\s+)?(banana|apple|orange|tangerine|clementine|mandarin|grapefruit|pear|berry|berries|strawberr|blueberr|raspberr|blackberr|cranberr|grape|kiwi|melon|watermelon|cantaloupe|honeydew|peach|plum|nectarine|cherry|cherries|pineapple|mango|papaya|guava|fig|date|pomegranate|persimmon|avocado|tomato|cucumber|lettuce|romaine|arugula|spinach|kale|chard|collard|broccoli|cauliflower|brussels sprout|cabbage|bok choy|carrot|celery|onion|shallot|leek|garlic|ginger|potato|sweet potato|yam|squash|butternut|acorn squash|spaghetti squash|zucchini|cucumber|pepper|bell pepper|jalapeño|jalapeno|chili|tomato|eggplant|mushroom|portobello|shiitake|asparagus|artichoke|beet|radish|turnip|parsnip|fennel|corn on the cob|edamame|peas|green bean|snap pea|snow pea|cilantro|parsley|basil|mint|rosemary|thyme|sage|oregano|dill|chives)s?\s*$/, floor:1, ceiling:3,
      why:"Fresh whole produce — minimally processed, no additives. Organic is cleanest for the 'Dirty Dozen' (strawberries, spinach, kale, peaches, etc.); 'Clean Fifteen' items (avocado, pineapple, onion) carry low pesticide residue even conventional." },
  ];

  // Run patterns against both the original normalized name AND the
  // brand-stripped version, return the first match.
  for (const p of patterns) {
    if (p.match.test(stripped) || p.match.test(norm)) return { ...p, wholeFood: true };
  }
  return null;
}

function tier5CategoryPrior(productName, category, { categoryAverages, categoryContext } = {}) {
  // Whole-foods interception — when the product name looks like a whole
  // food (salmon, chicken, eggs, fresh produce, plain dairy, etc.), the
  // generic "guessing from product type" message is wrong because the
  // product IS the ingredient. Return a real high-confidence result.
  const wholeFood = detectWholeFood(productName);
  if (wholeFood) {
    const score = Math.round((wholeFood.floor + wholeFood.ceiling) / 2);
    const summary = wholeFood.why;
    const sourcingFlags = detectSourcingFlags(productName);
    return {
      syntheticResult: {
        product_name: productName,
        category: category || "food",
        score,
        overall_score: score,
        confidence: "high",
        confidence_note: "Whole food — the product itself is the ingredient. Score reflects typical contaminant and processing profile for this category.",
        summary,
        summary_short: summary,
        summary_long: summary,
        concerns: [],
        flagged_substances: [],
        identified_plastics: [],
        harmful_chemicals: [],
        natural_materials: [],
        ingredient_list: [productName],
        sourcing_flags: sourcingFlags,
        dimensions: {
          materials:      { score, label: summary, concerns: [] },
          usage_exposure: { score, label: "Consumed as a primary food source.", concerns: [], frequency: "weekly", type: "ingestion", intensity: "leave-on", vulnerable: false },
          packaging:      { score: 3, label: "Whole food — packaging varies by retailer (typically minimal).", concerns: [], primary: "varies", refillable: false, end_of_life: "varies" },
          sustainability: { score, label: "Whole food sustainability depends on sourcing — wild vs. farmed, organic vs. conventional, local vs. imported.", concerns: [], reusable: false, replaces_single_use: false, replaces_count: null, circularity: "single-use" },
        },
        is_child_product: false,
        child_score: score,
        child_bumps: [],
        pregnancy_score: score,
        pregnancy_bumps: [],
        peer_comparison: "Whole food — clean ingredient profile",
        scan_next: [],
        nutrition: null,
        alternatives: [],
        ai_alternatives: [],
        product_family: null,
        category_score_context: "Whole foods score 1-5 depending on processing and sourcing",
        whole_food: true,
        // Source-provenance fields
        source: "whole_food_inference",
        source_label: "Whole food",
        source_confidence: null,
        // Whole-food results ARE cacheable — they're deterministic from name.
        _skipCache: false,
      },
    };
  }

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
