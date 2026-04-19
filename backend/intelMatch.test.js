#!/usr/bin/env node
// Test suite for backend/intelMatch.js
// Run: node backend/intelMatch.test.js

const { specificProductMatches, ingredientTriggerMatches, filterRelevantCards, isOverBroadCard } = require("./intelMatch");

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) { try { fn(); passed++; } catch (e) { failed++; failures.push(`FAIL: ${name}\n       ${e.message}`); } }
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

// ────────────────────────────────────────────────────────────────
// specificProductMatches — short entries require word-boundary
// ────────────────────────────────────────────────────────────────
test("Carmex (6) matches 'Carmex Original Lip Balm'", () => {
  assert(specificProductMatches(["Carmex"], "Carmex Original Lip Balm") === true);
});
test("Carmex does NOT match 'Car mechanical exhaust' (word boundary)", () => {
  assert(specificProductMatches(["Carmex"], "Car mechanical exhaust") === false);
});
test("Tide (4) matches 'Tide Pods Original'", () => {
  assert(specificProductMatches(["Tide"], "Tide Pods Original") === true);
});
test("Tide does NOT match 'Riptide Beverage' (word boundary)", () => {
  assert(specificProductMatches(["Tide"], "Riptide Beverage") === false);
});
test("Silk (4) word-boundary matches 'Armani Luminous Silk Foundation' (admin opt-in)", () => {
  assert(specificProductMatches(["silk"], "Armani Luminous Silk Foundation") === true);
});
test("Silk (4) does NOT match 'Silken Tofu' (no word boundary inside 'silken')", () => {
  assert(specificProductMatches(["silk"], "Silken Tofu") === false);
});

// ────────────────────────────────────────────────────────────────
// specificProductMatches — long entries allow bidirectional substring
// ────────────────────────────────────────────────────────────────
test("'Armani Luminous Silk' (long, 19) matches 'Armani Luminous Silk Foundation'", () => {
  assert(specificProductMatches(["Armani Luminous Silk"], "Armani Luminous Silk Foundation") === true);
});
test("long entry reverse-matches a shorter scan name", () => {
  assert(specificProductMatches(["Armani Luminous Silk Natural Glow"], "Armani Luminous Silk") === true);
});
test("normalization: punctuation ignored", () => {
  assert(specificProductMatches(["Burt's Bees Beeswax"], "burts bees beeswax lip balm") === true);
});

// ────────────────────────────────────────────────────────────────
// specificProductMatches — edge cases
// ────────────────────────────────────────────────────────────────
test("empty specific_products → false", () => {
  assert(specificProductMatches([], "anything") === false);
});
test("empty product name → false", () => {
  assert(specificProductMatches(["Carmex"], "") === false);
});
test("non-array input → false", () => {
  assert(specificProductMatches(null, "Carmex") === false);
});

// ────────────────────────────────────────────────────────────────
// ingredientTriggerMatches — word-boundary against ingredient_list
// ────────────────────────────────────────────────────────────────
test("'parabens' (plural) does NOT match 'methylparaben' (no trailing s)", () => {
  assert(ingredientTriggerMatches(["parabens"], ["water", "methylparaben"]) === false);
});
test("'methylparaben' matches 'methylparaben'", () => {
  assert(ingredientTriggerMatches(["methylparaben"], ["water", "methylparaben"]) === true);
});
test("'PEG' matches 'PEG-18/18 DIMETHICONE' (word boundary honored)", () => {
  assert(ingredientTriggerMatches(["PEG"], ["PEG-18/18 Dimethicone"]) === true);
});
test("'PEG' does NOT match 'hydroxyapatite' (no substring bleed)", () => {
  assert(ingredientTriggerMatches(["PEG"], ["hydroxyapatite"]) === false);
});
test("empty triggers → false", () => {
  assert(ingredientTriggerMatches([], ["water"]) === false);
});
test("empty ingredients → false", () => {
  assert(ingredientTriggerMatches(["parabens"], []) === false);
});

// ────────────────────────────────────────────────────────────────
// filterRelevantCards — A/B/C paths
// ────────────────────────────────────────────────────────────────
const card = (o = {}) => ({
  id: "x", headline: "h", body: "b", label: "l", label_color: "#d97706",
  action_text: "a", action_url: "https://e.com",
  product_families: [], specific_products: [], ingredient_triggers: [],
  ...o,
});

test("path A: family match", () => {
  const out = filterRelevantCards([card({ product_families: ["foundation"] })], { productFamily: "foundation", productName: "x", ingredientList: [] });
  assert(out.length === 1);
});
test("path A fails: mismatched family", () => {
  const out = filterRelevantCards([card({ product_families: ["foundation"] })], { productFamily: "nail_polish_remover", productName: "x", ingredientList: [] });
  assert(out.length === 0);
});
test("path B: specific_products matches even without family", () => {
  const out = filterRelevantCards([card({ product_families: ["foundation"], specific_products: ["Tide"] })], { productFamily: null, productName: "Tide Pods", ingredientList: [] });
  assert(out.length === 1);
});
test("path C: user history matches card family even when current scan doesn't", () => {
  const history = new Set(["nail_polish_remover"]);
  const out = filterRelevantCards([card({ product_families: ["nail_polish_remover"] })], { productFamily: "foundation", productName: "x", ingredientList: [], userFamilies: history });
  assert(out.length === 1);
});
test("path C skipped for anon (userFamilies null)", () => {
  const out = filterRelevantCards([card({ product_families: ["nail_polish_remover"] })], { productFamily: "foundation", productName: "x", ingredientList: [], userFamilies: null });
  assert(out.length === 0);
});

// ────────────────────────────────────────────────────────────────
// filterRelevantCards — ingredient trigger gating
// ────────────────────────────────────────────────────────────────
test("ingredient trigger required when set — missing", () => {
  const out = filterRelevantCards([card({ product_families: ["foundation"], ingredient_triggers: ["methylparaben"] })], { productFamily: "foundation", productName: "x", ingredientList: ["water", "glycerin"] });
  assert(out.length === 0);
});
test("ingredient trigger required when set — present", () => {
  const out = filterRelevantCards([card({ product_families: ["foundation"], ingredient_triggers: ["methylparaben"] })], { productFamily: "foundation", productName: "x", ingredientList: ["water", "methylparaben"] });
  assert(out.length === 1);
});

// ────────────────────────────────────────────────────────────────
// filterRelevantCards — broad advisory
// ────────────────────────────────────────────────────────────────
test("broad advisory: no families, no specific, no triggers → fires on anything", () => {
  const out = filterRelevantCards([card()], { productFamily: null, productName: "anything", ingredientList: [] });
  assert(out.length === 1);
});
test("broad advisory with ingredient triggers is still gated by triggers", () => {
  const noMatch = filterRelevantCards([card({ ingredient_triggers: ["parabens"] })], { productFamily: null, productName: "x", ingredientList: ["water"] });
  assert(noMatch.length === 0);
  const match = filterRelevantCards([card({ ingredient_triggers: ["parabens"] })], { productFamily: null, productName: "x", ingredientList: ["water", "parabens"] });
  assert(match.length === 1);
});

// ────────────────────────────────────────────────────────────────
// filterRelevantCards — limit
// ────────────────────────────────────────────────────────────────
test("limit parameter honored", () => {
  const cards = [1, 2, 3, 4, 5].map(i => card({ id: `c${i}`, product_families: ["foundation"] }));
  const out = filterRelevantCards(cards, { productFamily: "foundation", productName: "x", ingredientList: [], limit: 3 });
  assert(out.length === 3);
});

// ────────────────────────────────────────────────────────────────
// Armani regressions — the failures that motivated this rebuild
// ────────────────────────────────────────────────────────────────
test("Armani: nail_polish_remover card does NOT match foundation scan", () => {
  const out = filterRelevantCards(
    [card({ product_families: ["nail_polish_remover"], ingredient_triggers: ["acetone"] })],
    { productFamily: "foundation", productName: "Armani Luminous Silk Foundation", ingredientList: ["AQUA", "DIMETHICONE", "PHENOXYETHANOL"] }
  );
  assert(out.length === 0);
});
test("Armani: wound_care card does NOT match foundation scan", () => {
  const out = filterRelevantCards(
    [card({ product_families: ["wound_care"] })],
    { productFamily: "foundation", productName: "Armani Luminous Silk Foundation", ingredientList: ["AQUA", "DIMETHICONE"] }
  );
  assert(out.length === 0);
});
test("Armani: hypothetical foundation-family card DOES match foundation scan", () => {
  const out = filterRelevantCards(
    [card({ product_families: ["foundation"] })],
    { productFamily: "foundation", productName: "Armani Luminous Silk Foundation", ingredientList: ["AQUA", "DIMETHICONE"] }
  );
  assert(out.length === 1);
});
test("Armani: user-history path — user scanned nail_polish_remover yesterday, now scans foundation", () => {
  const history = new Set(["nail_polish_remover"]);
  const out = filterRelevantCards(
    [card({ product_families: ["nail_polish_remover"] })],
    { productFamily: "foundation", productName: "Armani Luminous Silk Foundation", ingredientList: ["AQUA"], userFamilies: history }
  );
  assert(out.length === 1, "nail polish recall card should surface via user-history path");
});

// ────────────────────────────────────────────────────────────────
// isOverBroadCard — guards against cards with no targeting at all
// ────────────────────────────────────────────────────────────────
test("isOverBroadCard: all three fields empty → true", () => {
  assert(isOverBroadCard({ product_families: [], specific_products: [], ingredient_triggers: [] }) === true);
});
test("isOverBroadCard: product_families populated → false", () => {
  assert(isOverBroadCard({ product_families: ["foundation"], specific_products: [], ingredient_triggers: [] }) === false);
});
test("isOverBroadCard: specific_products populated → false", () => {
  assert(isOverBroadCard({ product_families: [], specific_products: ["Carmex"], ingredient_triggers: [] }) === false);
});
test("isOverBroadCard: ingredient_triggers populated → false", () => {
  assert(isOverBroadCard({ product_families: [], specific_products: [], ingredient_triggers: ["Red 40"] }) === false);
});
test("isOverBroadCard: missing array fields entirely → true", () => {
  assert(isOverBroadCard({ headline: "h" }) === true);
});
test("isOverBroadCard: null → true", () => {
  assert(isOverBroadCard(null) === true);
});

// ── Summary ──
const total = passed + failed;
console.log(`\nintelMatch tests: ${passed}/${total} passed`);
if (failed > 0) { for (const f of failures) console.log(`  ${f}`); process.exit(1); }
else { console.log("  All tests passed.\n"); process.exit(0); }
