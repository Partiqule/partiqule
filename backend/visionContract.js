// backend/visionContract.js
// Vision contract for label-truth enforcement (feature-flagged via
// VISION_CONTRACT_V2). The photo path is refactored from
//
//   "one vision call that identifies AND scores"         — legacy, Pass 1 scores from pixels
//
// to
//
//   "identify from photo → cascade verifies ingredients → score from verified data"
//
// Label reads become a verification signal, not the source of truth. If the
// cascade (calibration / prior scan / OFF / web search) can supply verified
// ingredients, Pass 1 scores from those. Otherwise we either (a) score from
// the label when it's fully legible, flagged as "photo_verified", or
// (b) refuse and ask the user for a better photo.
//
// Three surfaces in this module:
//   1. callClaudeVisionIdentify — Haiku vision call with the slim
//      identification contract. Returns product identity + legibility-
//      tagged label ingredients. No scoring.
//   2. In-memory identification store — keyed by identificationId so the
//      frontend can confirm-and-resume without re-running vision.
//   3. reconcileIngredients — label vs cascade overlap, returns
//      normalized agreement ratio for audit logging.

const { randomUUID } = require("crypto");

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const VISION_MODEL = "claude-haiku-4-5-20251001";
const VISION_TIMEOUT_MS = 25_000;
const IDENT_TTL_MS = 10 * 60 * 1000;
const LEGIBILITY_VALUES = ["full", "partial", "minimal", "unreadable"];

// ── Identification store ─────────────────────────────────────────
// Short-lived in-memory cache keyed on identificationId. Confirmation
// modal POSTs the id back to /analyze, backend retrieves the stored
// identification and resumes from the cascade step without re-running
// vision. 10-minute TTL covers the realistic think-time window.
const identifications = new Map();

function putIdentification(record) {
  const id = randomUUID();
  identifications.set(id, { ...record, createdAt: Date.now() });
  return id;
}

function getIdentification(id) {
  if (!id || typeof id !== "string") return null;
  const rec = identifications.get(id);
  if (!rec) return null;
  if (Date.now() - rec.createdAt > IDENT_TTL_MS) {
    identifications.delete(id);
    return null;
  }
  return rec;
}

// Periodic cleanup so the Map doesn't grow unbounded.
setInterval(() => {
  const cutoff = Date.now() - IDENT_TTL_MS;
  for (const [k, v] of identifications) if (v.createdAt < cutoff) identifications.delete(k);
}, 60_000).unref?.();

// ── Vision identification call ───────────────────────────────────
// Slim contract: product identity + label ingredients (literal reads
// only) + legibility tag. The system prompt is deliberately small so
// the token budget favors accurate OCR over narrative. The AI must
// NOT infer ingredients from product priors — that failure mode is
// the whole reason this module exists.
async function callClaudeVisionIdentify(imageBase64, mediaType, deps = {}) {
  const { checkApiBudget, incrementApiCount } = deps;
  if (typeof checkApiBudget === "function") checkApiBudget();
  if (typeof incrementApiCount === "function") incrementApiCount();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);
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
        model: VISION_MODEL,
        max_tokens: 900,
        temperature: 0,
        system: `You are analyzing a product photo. Your job is to IDENTIFY the product (what it is, brand, variant) and separately REPORT WHAT YOU LITERALLY SEE on the ingredient/composition label. These are two independent judgments: identity confidence is about how sure you are of WHAT THE PRODUCT IS; label legibility is about how readable the ingredient / material-composition panel is. A photo can show a crystal-clear product name with a blurry ingredient panel — that is HIGH identity confidence and LOW label legibility. Do NOT let unreadable ingredients drag down your identity confidence. Return only valid JSON, no markdown. Never use apostrophes inside JSON string values.

READ IN THIS ORDER — the hierarchy on almost every consumer package:
1. BRAND first. It's nearly always the largest, most prominent text — the wordmark at the top or bottom (CLINIQUE, TATCHA, RMS BEAUTY, DR. BRONNERS, SALT AND STONE, LIQUID DEATH). Read it as a LOGO, not a generic word. If you cannot clearly read the brand, confidence drops to 0.45 or lower regardless of how recognizable the product type looks — you do not actually know what this product is.
2. PRODUCT NAME second, positioned next to or below the brand in smaller text. Return what is literally printed ("Pop Lip & Cheek Oil", "Dewy Skin Cream", "Black Soap"). NEVER fabricate a product name from category hints — "it looks like lipstick" is not a product name. If the package says "Lip & Cheek Oil", return that, not "Liquid Lipstick".
3. VARIANT / SHADE / FLAVOR third, often a named color, flavor, or style (Black Honey, Almond, Mountain Berry, Cherry Blossom).

WHAT TO READ FOR IDENTITY (confidence signal — any ONE of these is enough for a high-confidence identification):
- Front-package product name and brand (food, beverage, personal care, home, supplement)
- Brand wordmark / logo on a garment (Nike swoosh, Patagonia wordmark, Lululemon Omega, adidas trefoil, etc.) — treat as strong brand signal
- Hangtag on clothing, shoes, or accessories (brand + product name + style/SKU)
- Interior care label on clothing (brand + size + country of origin) — brand alone from a care label is enough for a partial identification; combine with visual cues about garment type
- Barcode numbers printed on packaging or tags (these won't be decoded here, but the surrounding text usually names the product)
- Shelf sign or neck label on bottles/jars
- Box/package back panel (brand, variant, flavor, size)

WHAT TO READ FOR LABEL CONTENTS (label_ingredients field):
- Food/beverage/supplement/cleaning: the ingredient list ("sugar, flour, canola oil, ..."). Report verbatim, in order.
- Personal care: the INCI-style ingredient list. Report verbatim.
- Clothing / textile / shoes: the material composition on the CARE LABEL. Report each fiber percentage as its own array element, never bundled. Format: each fiber on its own line, where percentages sum to 100. Correct shape: ["<pct>% <fiber_a>", "<pct>% <fiber_b>"]. Wrong shape: ["<pct>% <fiber_a>, <pct>% <fiber_b>"] (do not bundle multiple fibers into one string). For multi-component garments, prefix each line with the section name (Shell, Lining, Trim, etc.) followed by a colon. Read the percentages from the label you actually see; do not invent percentages. The scoring pipeline treats material composition as the ingredient-equivalent for textile products.
- Accessories (bags, wallets, watches, jewelry): the material tag if visible ("Genuine leather", "316L stainless steel", "PU exterior, cotton lining").
- Home/furnishing: fabric content tag, finish/coating labels.
If none of these panels is readable, set label_ingredients to null and label_legibility to the appropriate non-full value — but still return the product identity.`,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            { type: "text", text: `Analyze this product photo. Return JSON:

{
  "product_name": "exact name from label, or best guess",
  "brand": "brand from label, or null",
  "variant": "specific variant or flavor if applicable, or null",
  "category": "food|beverage|personal_care|home|kitchen|home_furnishing|clothing|baby|toy|supplement|restaurant|accessory|other",
  "confidence": 0.0 to 1.0,
  "label_ingredients": [array of ingredients you LITERALLY SEE on the label, in order. Only include ingredients you can READ. Do not infer ingredients you think are typical for this product type. If ingredient list is not visible or not fully legible, return null.],
  "label_legibility": "full" | "partial" | "minimal" | "unreadable",
  "reasoning": "brief explanation of what you saw and how confident you are, under 30 words"
}

CONFIDENCE SCALE (identity only — NOT ingredient readability):
- 0.90-1.00: You can read BOTH the brand wordmark AND the product name clearly on the package, hangtag, or visible brand logo.
- 0.70-0.89: Brand AND product name both readable, minor ambiguity (exact variant or model unclear). Clothing examples: clear brand wordmark visible on garment plus recognizable garment type ("Nike ankle socks", "Patagonia fleece").
- 0.45-0.69: You can see the general product type (e.g. "athletic socks", "muffins", "running shoes", "lip balm") but the BRAND is not clearly readable. DEFAULT TO THIS BAND when you cannot clearly name the brand — do not guess a brand from package style or color.
- 0.20-0.44: You have a rough guess about what the object is but it could be several products.
- 0.00-0.19: The image does not show a consumer product, or the product is completely indeterminate (a hand, a blurry smear, a landscape).

BRAND-MISSING RULE: If you cannot clearly read a brand wordmark, confidence CANNOT exceed 0.69, regardless of how recognizable the product type is. A "lip oil" with no readable brand is a 0.55-confidence identification, not a 0.90, because you do not know whose lip oil it is. The cascade will ask the user to confirm.

CATEGORY CUES (for the category field):
- Visible care label, sewn-in brand tag, fabric weave, stitching, garment hangtag, apparel graphic → clothing.
- Shoe/sneaker/boot silhouette with brand logo → clothing.
- Nutrition Facts panel visible → food or beverage.
- Supplement Facts panel visible → supplement.
- Drug Facts panel or Rx label → personal_care (OTC skincare/haircare route here too).
- INCI ingredient list with water/aqua/glycerin at top → personal_care.
- Cleaning bottle with hazard warnings / SDS language → home.

CRITICAL RULES:
- Confidence is ONLY about product identity. It is INDEPENDENT of whether the ingredient list is readable. If you can clearly read "Abes Mini Muffins" on the package but the back-label ingredients are blurry, confidence should be 0.85+ and label_legibility should be "partial" or "minimal". DO NOT lower confidence because ingredients are unreadable — that is what label_legibility is for.
- A clothing item with a visible brand wordmark (on the garment or on a hangtag) plus a recognizable garment type is a HIGH-confidence identification even without a visible care label. The scoring cascade will find the material composition online from the brand and product name.
- RETAILER SCREENSHOT RULE: When the photo is a screenshot of an Amazon, Target, Walmart, or other retailer page, the brand storefront button often reads "Visit the Store" / "Shop the [Brand] Store" / "Visit [Brand] Store" — these are NEVER product names. Read past the storefront chrome to find the actual product title (usually in larger text directly above or below the brand wordmark, or in the "About this item" section). Other retailer UI strings to ignore as product names: "Sponsored", "Add to Cart", "Buy Now", "Customer Reviews", "Free Returns", "100+ bought in past month". If you can read the brand wordmark but the actual product title isn't visible in the screenshot, return brand only and confidence 0.55 — do not return UI button text as the product name.
- If label_ingredients is returned, every item must be something you can LITERALLY READ in the photo (or material composition on a care label, for textile products).
- If you cannot clearly read the ingredient list or composition label, set label_ingredients to null and label_legibility to the appropriate non-full value.
- Never fabricate ingredients or material percentages based on product type assumptions.
- For textile composition labels, fiber percentages must sum to 100%. If your reading sums to less than 100%, the label contains additional fibers you have not yet read. Re-read the label and look for smaller text, secondary lines, or stretch fibers (elastane, spandex, lycra) that often appear below the primary fiber on a separate line. Reporting only the dominant fiber when the label clearly shows additional fibers is a fabrication. Read what is on the label, not what is typical for the category.
- Never fabricate a product_name from category hints. If the package clearly says "Lip & Cheek Oil" but you cannot read the brand, return product_name: "Lip & Cheek Oil" with brand: null and confidence ≤ 0.65 — do not substitute "Liquid Lipstick" or any other guess based on what the product looks like it could be. The cascade will ask the user to confirm.
- label_legibility "full" means the ingredient list / material composition is not cut off, text is legible, and the list is substantially complete (5+ ingredients for food/personal care, or all shell/lining/trim lines for textile).` },
          ],
        }],
      }),
    });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`vision_identify http ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = (data.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("")
      .trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("vision_identify no JSON in response");
    const parsed = JSON.parse(text.slice(start, end + 1));

    const confidence = typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0;
    const legibility = LEGIBILITY_VALUES.includes(parsed.label_legibility)
      ? parsed.label_legibility
      : "unreadable";
    const labelIngredients = Array.isArray(parsed.label_ingredients)
      ? parsed.label_ingredients.map(s => String(s).trim()).filter(Boolean)
      : null;

    // Retailer-chrome filter: when a user screenshots an Amazon/Target/etc.
    // listing, the vision model sometimes returns the brand storefront button
    // text ("Visit the Store") as the product name. Strip these — they're
    // never product names. Confidence drops so the user sees the confirmation
    // modal instead of a Tier 5 best-guess on the wrong identity.
    let productName = String(parsed.product_name || "").trim();
    let brandOut = parsed.brand ? String(parsed.brand).trim() : null;
    let confidenceOut = confidence;
    if (productName && looksLikeRetailerChrome(productName)) {
      console.warn(`[vision_identify] retailer chrome detected as product_name: "${productName}" — falling back to brand only`);
      // If we have a brand, fall through to brand-only identification at
      // medium confidence so the cascade can still try (brand + category)
      // and the user gets the confirmation modal.
      productName = brandOut || "";
      confidenceOut = Math.min(confidenceOut, 0.55);
    }

    return {
      product_name: productName || "Scanned product",
      brand: brandOut,
      variant: parsed.variant ? String(parsed.variant).trim() : null,
      category: typeof parsed.category === "string" ? parsed.category : null,
      confidence: confidenceOut,
      label_ingredients: labelIngredients,
      label_legibility: legibility,
      reasoning: String(parsed.reasoning || "").slice(0, 400),
    };
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// Retailer storefront/UI strings that the vision model sometimes returns
// as product_name when the user screenshots an Amazon, Target, Walmart,
// etc. listing. None of these are real product names. Match is exact-ish
// (case-insensitive, trimmed). Triggers a fallback to brand-only id at
// medium confidence in callClaudeVisionIdentify.
const RETAILER_CHROME_STRINGS = [
  /^visit the store$/i,
  /^visit [a-z0-9'&\-\s]+ store$/i,
  /^shop the [a-z0-9'&\-\s]+ store$/i,
  /^shop [a-z0-9'&\-\s]+$/i,
  /^sponsored$/i,
  /^add to cart$/i,
  /^buy now$/i,
  /^customer reviews$/i,
  /^free returns$/i,
  /^\d+\+ bought in past month$/i,
  /^see more from [a-z0-9'&\-\s]+$/i,
  /^amazon's choice$/i,
  /^best seller$/i,
  /^prime$/i,
];
function looksLikeRetailerChrome(name) {
  const t = String(name || "").trim();
  if (!t) return false;
  return RETAILER_CHROME_STRINGS.some(re => re.test(t));
}

// ── Reconciliation ───────────────────────────────────────────────
// Rough set-overlap between label-read ingredients and cascade-verified
// ingredients. Used for audit logging, not scoring decisions. Returns
// { agreementPct, overlap[], labelOnly[], cascadeOnly[], agreed }.
// Threshold of 0.5 is generous — many labels abbreviate or reorder
// relative to manufacturer listings, and the point is to flag gross
// divergences (AI hallucinated something, or label and cascade are
// plainly different products), not nitpick phrasing.
function normalizeIngredient(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Synonym groups used by the reconciler. Each group is a set of terms that
// mean the same thing for scoring purposes — the label might print "spandex"
// while the cascade source says "elastane", or vice versa. Without these,
// vision_cascade_disagreement logs fire for near-identical formulations just
// because different vocabularies were used. Keep groups narrow enough that
// synonymy is actual identity, not mere adjacency.
const SYNONYM_GROUPS = [
  ["spandex", "elastane", "lycra"],
  ["lyocell", "tencel"],
  ["viscose", "rayon"],
  ["aqua", "water"],
  ["tocopherol", "vitamin e"],
  ["ascorbic acid", "vitamin c"],
  ["sodium chloride", "salt"],
];

function synonymMatch(a, b) {
  for (const group of SYNONYM_GROUPS) {
    if (group.some(g => a.includes(g)) && group.some(g => b.includes(g))) return true;
  }
  return false;
}

function reconcileIngredients(labelList, cascadeIngredients) {
  const labelNorm = (labelList || []).map(normalizeIngredient).filter(Boolean);
  let cascadeSplit;
  if (Array.isArray(cascadeIngredients)) {
    cascadeSplit = cascadeIngredients;
  } else {
    cascadeSplit = String(cascadeIngredients || "").split(/,(?![^(]*\))/);
  }
  const cascadeNorm = cascadeSplit.map(normalizeIngredient).filter(Boolean);
  const cascadeSet = new Set(cascadeNorm);

  const overlap = [];
  const labelOnly = [];
  for (const lbl of labelNorm) {
    let matched = false;
    for (const c of cascadeSet) {
      if (c === lbl || c.includes(lbl) || lbl.includes(c) || synonymMatch(lbl, c)) { matched = true; break; }
    }
    if (matched) overlap.push(lbl); else labelOnly.push(lbl);
  }
  const cascadeOnly = [];
  for (const c of cascadeNorm) {
    let matched = false;
    for (const lbl of labelNorm) {
      if (lbl === c || lbl.includes(c) || c.includes(lbl) || synonymMatch(lbl, c)) { matched = true; break; }
    }
    if (!matched) cascadeOnly.push(c);
  }
  const agreementPct = labelNorm.length ? overlap.length / labelNorm.length : 1;
  return {
    agreementPct,
    overlap,
    labelOnly,
    cascadeOnly,
    agreed: agreementPct >= 0.5,
  };
}

module.exports = {
  callClaudeVisionIdentify,
  putIdentification,
  getIdentification,
  reconcileIngredients,
  LEGIBILITY_VALUES,
};
