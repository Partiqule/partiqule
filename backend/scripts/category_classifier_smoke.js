#!/usr/bin/env node
// Whole-food classifier smoke (hotfix 2026-05-26).
//
// The user-facing bug was reported as a categoryClassifier issue, but
// diagnostic traced it to detectWholeFood() in backend/scoringCascade.js.
// This smoke covers the actual fix surface — anchored meat-family patterns
// + the CATEGORY_WORDS_IN_NAME early-exit.
//
// Pure unit test. No API calls. Run:
//   node backend/scripts/category_classifier_smoke.js
//
// Cases cover:
//   - Multi-category products that previously misfired (red meat,
//     wild game, processed meats, salmon — all four pattern families)
//   - Pure whole foods that must STILL match correctly (regression guard)
//   - Existing non-meat patterns (eggs, nuts, grains, poultry, dairy,
//     cheese, pork, produce) to confirm no collateral damage

"use strict";

const { tier5CategoryPrior } = require("../scoringCascade");
const CATEGORY_AVERAGES = { food: { avg: 5.2 }, food_beverage: { avg: 5.2 }, other: { avg: 5.5 } };
const CATEGORY_CONTEXT = { food: "Food typically scores 3-7." };

function classify(name) {
  const r = tier5CategoryPrior(name, "food", { categoryAverages: CATEGORY_AVERAGES, categoryContext: CATEGORY_CONTEXT });
  return r.syntheticResult;
}

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push({ label, detail }); console.log(`  ✗ ${label}${detail ? `: ${detail}` : ""}`); }
}

// Helpers — the canonical assertions for this smoke are:
//   isPrepared(r): result NOT whole-food (source !== "whole_food_inference")
//   isWholeFoodKind(r, expectedFragment): summary contains expected fragment
function isPrepared(r) {
  return r.source !== "whole_food_inference";
}
function isWholeFoodKind(r, expectedFragment) {
  return r.source === "whole_food_inference"
    && typeof r.summary === "string"
    && r.summary.toLowerCase().includes(expectedFragment.toLowerCase());
}

// ── Family 1: red meat — must NOT misfire on prepared forms ──────
console.log("\n[1] Red-meat pattern — prepared-form products must NOT classify as red meat");
{
  const cases = [
    "Sea Salt Chocolate Chip Beef Protein Cookie - 4 pack", // the smoking gun
    "Beef Protein Bar Chocolate Almond",
    "Beef Flavored Chips Original",
    "Ground Beef Flavored Crackers",
    "Sirloin Beef Jerky Snack Sticks",         // even with jerky in name, "snack" word wins
    "Ribeye Flavored Chips Variety Pack",
    "Lamb Flavored Cracker Bites",
  ];
  for (const name of cases) {
    const r = classify(name);
    check(`prepared form: "${name}" NOT red meat`, isPrepared(r),
      `got source=${r.source} score=${r.score}`);
  }
}

// ── Family 2: wild game — must NOT misfire on prepared forms ─────
console.log("\n[2] Wild-game pattern — prepared-form products must NOT classify as wild game");
{
  const cases = [
    "Bison Protein Bar Chocolate",
    "Venison Snack Stick Variety Pack",
    "Elk Flavored Crackers",
    "Bison Granola with Cranberry",
  ];
  for (const name of cases) {
    const r = classify(name);
    check(`prepared form: "${name}" NOT wild game`, isPrepared(r),
      `got source=${r.source} score=${r.score}`);
  }
}

// ── Family 3: processed meats — must NOT misfire ─────────────────
console.log("\n[3] Processed-meats pattern — prepared-form products must NOT classify as processed meat");
{
  const cases = [
    "Pepperoni Flavored Crackers",
    "Sausage Flavored Snack Mix",
    "Bacon Flavored Cookies",
    "Ham Flavored Chips Limited Edition",
    "Salami Flavored Pizza Crust Mix",
  ];
  for (const name of cases) {
    const r = classify(name);
    check(`prepared form: "${name}" NOT processed meat`, isPrepared(r),
      `got source=${r.source} score=${r.score}`);
  }
}

// ── Family 4: salmon — must NOT misfire ──────────────────────────
console.log("\n[4] Salmon pattern — prepared-form products must NOT classify as salmon");
{
  const cases = [
    "Salmon Flavored Crackers",
    "Salmon Protein Powder Vanilla",
    "Sockeye Salmon Flavored Chips",
    "Atlantic Salmon Sandwich Spread",
    "Salmon Skin Snack Crisps",
  ];
  for (const name of cases) {
    const r = classify(name);
    check(`prepared form: "${name}" NOT salmon`, isPrepared(r),
      `got source=${r.source} score=${r.score}`);
  }
}

// ── Regression: pure whole foods must STILL be classified correctly ─
console.log("\n[5] Pure whole foods — regression guard, must still classify correctly");
{
  // Red meat (floor 3-5, "Conventional red meat")
  check(`"ground beef" → red meat`, isWholeFoodKind(classify("ground beef"), "conventional red meat"));
  check(`"ribeye steak" → red meat`, isWholeFoodKind(classify("ribeye steak"), "conventional red meat"));
  check(`"sirloin steak" → red meat`, isWholeFoodKind(classify("sirloin steak"), "conventional red meat"));
  check(`"grass-fed ground beef" → red meat (adjective tolerance)`, isWholeFoodKind(classify("grass-fed ground beef"), "conventional red meat"));
  check(`"lamb" → red meat`, isWholeFoodKind(classify("lamb"), "conventional red meat"));

  // Wild game (floor 1-3)
  check(`"bison" → wild game`, isWholeFoodKind(classify("bison"), "wild game"));
  check(`"venison" → wild game`, isWholeFoodKind(classify("venison"), "wild game"));
  check(`"elk" → wild game`, isWholeFoodKind(classify("elk"), "wild game"));

  // Processed meat (floor 5-7)
  check(`"bacon" → processed meat`, isWholeFoodKind(classify("bacon"), "processed meat"));
  check(`"prosciutto" → processed meat`, isWholeFoodKind(classify("prosciutto"), "processed meat"));
  check(`"deli meat" → processed meat`, isWholeFoodKind(classify("deli meat"), "processed meat"));

  // Salmon (wild + atlantic + generic)
  check(`"wild salmon" → wild-caught salmon`, isWholeFoodKind(classify("wild salmon"), "wild-caught salmon"));
  check(`"sockeye salmon" → wild-caught salmon`, isWholeFoodKind(classify("sockeye salmon"), "wild-caught salmon"));
  check(`"sockeye" → wild-caught salmon (bare species)`, isWholeFoodKind(classify("sockeye"), "wild-caught salmon"));
  check(`"atlantic salmon" → farmed atlantic salmon`, isWholeFoodKind(classify("atlantic salmon"), "farmed atlantic salmon"));
  check(`"salmon" → generic salmon`, isWholeFoodKind(classify("salmon"), "salmon"));
}

// ── Regression: non-meat families must still pass through correctly ─
console.log("\n[6] Non-meat whole-food patterns — must still match after refactor");
{
  check(`"eggs" → eggs`, isWholeFoodKind(classify("eggs"), "whole eggs"));
  check(`"pasture-raised eggs" → eggs (adjective tolerance)`, isWholeFoodKind(classify("pasture-raised eggs"), "whole eggs"));
  check(`"almonds" → nuts/seeds`, isWholeFoodKind(classify("almonds"), "nuts and seeds"));
  check(`"steel-cut oats" → whole grain`, isWholeFoodKind(classify("steel-cut oats"), "whole grain"));
  check(`"chicken" → poultry`, isWholeFoodKind(classify("chicken"), "conventional poultry"));
  check(`"whole milk" → dairy`, isWholeFoodKind(classify("whole milk"), "plain dairy"));
  check(`"cheddar" → cheese`, isWholeFoodKind(classify("cheddar"), "aged cheese"));
  check(`"pork loin" → pork`, isWholeFoodKind(classify("pork loin"), "pork"));
  check(`"banana" → fresh produce`, isWholeFoodKind(classify("banana"), "fresh whole produce"));
}

// ── Edge cases ───────────────────────────────────────────────────
console.log("\n[7] Edge cases");
{
  // "Cheese flavored crackers" — name has both "cheese" (whole food alternative
  // in the cheese pattern) AND "crackers" (category word). Category word must
  // win because the product is crackers, not cheese.
  check(`"Cheese Flavored Crackers" NOT cheese`, isPrepared(classify("Cheese Flavored Crackers")));
  // "Chicken sausage" — out of scope for this hotfix. The poultry pattern
  // (^chicken|...) is intentionally NOT anchored at the end, so "chicken
  // sausage" matches as poultry. That is the pre-existing behavior. If
  // poultry needs similar tightening, it's a follow-up — the user-scoped
  // fix covered four pattern families (red meat, wild game, processed
  // meats, salmon). The smoke just documents the current state.
  {
    const r = classify("chicken sausage");
    check(`"chicken sausage" matches the (unanchored) poultry pattern — known limitation, out of hotfix scope`,
      r.source === "whole_food_inference" && r.summary.toLowerCase().includes("conventional poultry"));
  }
  // Smoothies, kombucha — beverages with whole-food ingredients in name.
  check(`"Strawberry Banana Smoothie" NOT produce`, isPrepared(classify("Strawberry Banana Smoothie")));
  check(`"Apple Kombucha" NOT produce`, isPrepared(classify("Apple Kombucha")));
  // Energy drinks
  check(`"Salted Caramel Energy Drink" NOT produce`, isPrepared(classify("Salted Caramel Energy Drink")));
  // Empty / garbage
  check(`empty string → no whole-food typing`, isPrepared(classify("")));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f.label}${f.detail ? ` (${f.detail})` : ""}`);
  process.exit(1);
}
process.exit(0);
