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
        system: `You are analyzing a product photo. Your job is to IDENTIFY the product (what it is, brand, variant) and separately REPORT WHAT YOU LITERALLY SEE on the ingredient label. These are two independent judgments: identity confidence is about how sure you are of WHAT THE PRODUCT IS; label legibility is about how readable the ingredient panel is. A photo can show a crystal-clear product name with a blurry ingredient panel — that is HIGH identity confidence and LOW label legibility. Do NOT let unreadable ingredients drag down your identity confidence. Return only valid JSON, no markdown. Never use apostrophes inside JSON string values.`,
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
- 0.90-1.00: You can read the full product name and brand clearly on the package.
- 0.70-0.89: You can read most of the name/brand; minor ambiguity (exact variant unclear).
- 0.45-0.69: You can see the general product type (e.g. "athletic socks", "muffins") but the specific brand or full name is not clearly visible.
- 0.20-0.44: You have a rough guess about what the object is but it could be several products.
- 0.00-0.19: The image does not show a consumer product, or the product is completely indeterminate (a hand, a blurry smear, a landscape).

CRITICAL RULES:
- Confidence is ONLY about product identity. It is INDEPENDENT of whether the ingredient list is readable. If you can clearly read "Abes Mini Muffins" on the package but the back-label ingredients are blurry, confidence should be 0.85+ and label_legibility should be "partial" or "minimal". DO NOT lower confidence because ingredients are unreadable — that is what label_legibility is for.
- If label_ingredients is returned, every item must be something you can LITERALLY READ in the photo
- If you cannot clearly read the ingredient list, set label_ingredients to null and label_legibility to the appropriate non-full value
- Never fabricate ingredients based on product type assumptions
- label_legibility "full" means the ingredient list is not cut off, text is legible, and at least the first 5 to 8 ingredients are clearly readable` },
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

    return {
      product_name: String(parsed.product_name || "").trim() || "Scanned product",
      brand: parsed.brand ? String(parsed.brand).trim() : null,
      variant: parsed.variant ? String(parsed.variant).trim() : null,
      category: typeof parsed.category === "string" ? parsed.category : null,
      confidence,
      label_ingredients: labelIngredients,
      label_legibility: legibility,
      reasoning: String(parsed.reasoning || "").slice(0, 400),
    };
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
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
      if (c === lbl || c.includes(lbl) || lbl.includes(c)) { matched = true; break; }
    }
    if (matched) overlap.push(lbl); else labelOnly.push(lbl);
  }
  const cascadeOnly = [];
  for (const c of cascadeNorm) {
    let matched = false;
    for (const lbl of labelNorm) {
      if (lbl === c || lbl.includes(c) || c.includes(lbl)) { matched = true; break; }
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
