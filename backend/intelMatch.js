// backend/intelMatch.js
// Pure relevance matching for intelligence cards. No I/O — callers pass the
// data in. See CLAUDE.md "Intel Card Relevance" for the rules.
//
// A card fires when:
//   1. Relevance: product_families matches the scan's family (path A), OR
//      specific_products matches the scan's product_name (path B), OR
//      product_families intersects the user's 30-day scan history (path C).
//      A card with neither product_families nor specific_products is treated
//      as broad-advisory and passes the relevance gate automatically.
//   2. Ingredient triggers: when card.ingredient_triggers is populated,
//      at least one trigger must word-boundary match an entry in the scan's
//      ingredient_list. Empty triggers skip this gate.

const MIN_SUBSTRING_LEN = 10;

function normalizeForMatch(s) {
  // Strip apostrophes before collapsing punctuation so "Burt's" becomes
  // "burts" (matching the common stripped form) rather than "burt s".
  return String(s || "")
    .toLowerCase()
    .replace(/['\u2018\u2019\u201b\u2032]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Short entries (<10 chars after normalization) require word-boundary token
// match so "Tide" does not match "Riptide Beverage". Longer entries allow
// bidirectional substring so "Armani Luminous Silk" matches both
// "Armani Luminous Silk Foundation" (forward) and shorter variants (reverse).
function specificProductMatches(specificProducts, productName) {
  if (!Array.isArray(specificProducts) || specificProducts.length === 0) return false;
  const target = normalizeForMatch(productName);
  if (!target) return false;
  for (const p of specificProducts) {
    const entry = normalizeForMatch(p);
    if (!entry) continue;
    if (entry.length < MIN_SUBSTRING_LEN) {
      const re = new RegExp(`\\b${escapeRegex(entry)}\\b`, "i");
      if (re.test(target)) return true;
    } else {
      if (target.includes(entry) || entry.includes(target)) return true;
    }
  }
  return false;
}

// Word-boundary match against the structured ingredient_list array (not
// narrative text). Each trigger becomes a \b-anchored regex tested against
// each ingredient entry. "parabens" won't match "methylparaben" — literal
// word matches only.
function ingredientTriggerMatches(triggers, ingredientList) {
  if (!Array.isArray(triggers) || triggers.length === 0) return false;
  if (!Array.isArray(ingredientList) || ingredientList.length === 0) return false;
  for (const raw of triggers) {
    const t = String(raw || "").trim();
    if (!t) continue;
    const re = new RegExp(`\\b${escapeRegex(t)}\\b`, "i");
    for (const ing of ingredientList) {
      if (re.test(String(ing || ""))) return true;
    }
  }
  return false;
}

function filterRelevantCards(cards, { productFamily, productName, ingredientList, userFamilies, limit = 3 } = {}) {
  if (!Array.isArray(cards) || cards.length === 0) return [];
  const ingredients = Array.isArray(ingredientList) ? ingredientList : [];
  const currentFamily = productFamily || null;
  const currentName = productName || "";
  const history = userFamilies instanceof Set ? userFamilies : null;

  const out = [];
  for (const card of cards) {
    const hasFamilies = Array.isArray(card.product_families) && card.product_families.length > 0;
    const hasSpecific = Array.isArray(card.specific_products) && card.specific_products.length > 0;
    const hasTriggers = Array.isArray(card.ingredient_triggers) && card.ingredient_triggers.length > 0;

    let relevant = !hasFamilies && !hasSpecific; // broad-advisory default
    if (!relevant && hasFamilies && currentFamily && card.product_families.includes(currentFamily)) relevant = true;
    if (!relevant && hasSpecific && specificProductMatches(card.specific_products, currentName)) relevant = true;
    if (!relevant && hasFamilies && history) {
      for (const f of card.product_families) if (history.has(f)) { relevant = true; break; }
    }
    if (!relevant) continue;

    if (hasTriggers && !ingredientTriggerMatches(card.ingredient_triggers, ingredients)) continue;

    out.push(card);
    if (out.length >= limit) break;
  }
  return out;
}

// True when a card has no targeting anchor at all. Such a card would fire on
// every scan globally and is almost always an AI or admin authoring mistake.
// Both writeIntelligenceCard (AI-drafted cards) and /api/intelligence/approve
// (admin-reviewed cards) reject when this returns true.
function isOverBroadCard(card) {
  if (!card || typeof card !== "object") return true;
  const noFamilies = !Array.isArray(card.product_families) || card.product_families.length === 0;
  const noSpecific = !Array.isArray(card.specific_products) || card.specific_products.length === 0;
  const noTriggers = !Array.isArray(card.ingredient_triggers) || card.ingredient_triggers.length === 0;
  return noFamilies && noSpecific && noTriggers;
}

module.exports = {
  specificProductMatches,
  ingredientTriggerMatches,
  filterRelevantCards,
  isOverBroadCard,
  normalizeForMatch,
};
