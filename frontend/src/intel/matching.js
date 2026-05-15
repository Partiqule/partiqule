// R3e — intel card matching. Conservative by design: a false positive
// (card surfaces because of weak keyword overlap) erodes trust faster
// than a missed match.
//
// matchesHistory(card, history) returns true when ANY of three signals
// fires. Used by:
//   • R3e Items page — to pick which live intel cards belong above
//     the scan list under "Worth knowing"
//   • R3f Home tile — partitionByHistory exposes the inverse so the
//     "general" intel that didn't match can land on the Home surface
//     once /feed retires
//
// The for-you cards from generateForYouCards are already personalized
// to history; they bypass this matcher and surface unconditionally.

const MIN_PRODUCT_TOKEN = 4;

const lower = (s) => String(s || "").toLowerCase().trim();

const collectUserText = (history) => {
  if (!Array.isArray(history) || !history.length) return "";
  return history.flatMap(h => [
    ...(h.harmful_chemicals || []),
    ...(h.flagged_substances || []),
    ...((h.concerns || []).map(c => typeof c === "string" ? c : (c && c.concern) || "")),
    h.summary || "",
  ]).join(" ").toLowerCase();
};

const collectUserCategories = (history) => {
  return new Set((history || []).map(h => h.category).filter(Boolean));
};

const collectUserProductNames = (history) => {
  return (history || [])
    .map(h => lower(h.product_name))
    .filter(name => name && name.length >= MIN_PRODUCT_TOKEN);
};

const cardText = (card) => {
  return [
    card?.headline || "",
    card?.body || "",
    card?.summary || "",
  ].join(" ").toLowerCase();
};

// True when ANY of three signals fires:
//   1. ingredient_triggers — card declares specific ingredient keywords;
//      we look for them in the user's harmful_chemicals / concerns /
//      flagged_substances / summary strings (the same fields FeedPage
//      already uses for its isPersonal flag).
//   2. category_triggers — card declares product family categories; we
//      look for matches in the user's scanned categories.
//   3. product name overlap — the card's headline or body explicitly
//      names a product the user has scanned. Case-insensitive substring,
//      with a minimum 4-char token so common words don't drive matches.
//
// If the card has none of these triggers and no product overlap, it
// stays general and won't surface on the Items page.
export function matchesHistory(card, history) {
  if (!card) return false;
  if (!Array.isArray(history) || !history.length) return false;

  // Signal 1: ingredient triggers
  const userContent = collectUserText(history);
  const ingredientTriggers = card.ingredient_triggers || [];
  if (ingredientTriggers.some(t => userContent.includes(lower(t)))) return true;

  // Signal 2: category triggers
  const userCats = collectUserCategories(history);
  const categoryTriggers = card.category_triggers || [];
  if (categoryTriggers.some(c => userCats.has(c))) return true;

  // Signal 3: product name overlap inside the card's prose
  const cardContent = cardText(card);
  if (cardContent.length) {
    const userNames = collectUserProductNames(history);
    if (userNames.some(name => cardContent.includes(name))) return true;
  }

  return false;
}

// Splits a card array into matching vs unmatched buckets. Reserved for
// R3f, where the unmatched bucket will feed the Home "Worth knowing"
// tile after /feed is retired.
export function partitionByHistory(cards, history) {
  const matching = [];
  const unmatched = [];
  for (const c of cards || []) {
    if (matchesHistory(c, history)) matching.push(c);
    else unmatched.push(c);
  }
  return { matching, unmatched };
}
