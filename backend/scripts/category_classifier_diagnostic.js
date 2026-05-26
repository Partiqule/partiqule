#!/usr/bin/env node
// Category classifier diagnostic (2026-05-26 hotfix).
//
// Runs a product through every tier of backend/categoryClassifier.js and
// emits the full decision trail. Built to trace the MELT N' MOO Sea Salt
// Chocolate Chip Beef Protein Cookie misclassification reported in
// production: a cookie was scored as a red-meat product.
//
// Usage:
//   ANTHROPIC_API_KEY=... node backend/scripts/category_classifier_diagnostic.js
//     --name "Sea Salt Chocolate Chip Beef Protein Cookie - 4 pack" \
//     --ingredients "EQUIP grass-fed beef isolate, pasture raised eggs, organic coconut flour, organic tapioca flour, grass-fed ghee, organic raw honey, organic chocolate chips, vanilla, baking soda, baking powder, sea salt"
//
// With no args: runs the Melt N' Moo case + a handful of comparison
// queries so the operator can eyeball the contrast.

"use strict";

const fs = require("fs");
const path = require("path");

// Load backend/.env.local if present for the API key.
try {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
    }
  }
} catch { /* best effort */ }

const {
  detectCategoryFast,
  classifyCategory,
  _internal: { OVERRIDES, matchOverride, aiClassifyCategory },
} = require("../categoryClassifier");

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--name") out.name = argv[++i];
    else if (a === "--ingredients") out.ingredients = argv[++i];
  }
  return out;
}

async function traceOne(productName, ingredients) {
  console.log("\n" + "=".repeat(72));
  console.log(`PRODUCT NAME: ${JSON.stringify(productName)}`);
  if (ingredients) console.log(`INGREDIENTS:  ${ingredients.slice(0, 200)}${ingredients.length > 200 ? "…" : ""}`);
  console.log("-".repeat(72));

  // Tier 1: overrides
  const override = matchOverride(productName);
  console.log(`[T1 overrides] ${override ? `MATCH → ${override}` : "no match"}`);

  // Tier 4 (intentionally run BEFORE Tier 3 in the diagnostic so we can
  // see the deterministic regex vote regardless of AI behavior).
  const fast = detectCategoryFast(productName);
  console.log(`[T4 keyword]   ${fast ? `MATCH → ${fast}` : "no match (would fall to default 'other')"}`);

  // Trace which sub-pattern of T4 matched. Walk a stripped-down version of
  // the food block to identify the dominant signal.
  const s = productName.toLowerCase();
  const foodSignals = [
    { label: "meat noun (chicken/beef/pork/etc.)", re: /\b(chicken|beef|pork|turkey|salmon|tuna|fish|shrimp|egg|tofu|tempeh|seitan|steak|bacon|sausage|hot dog|deli|jerky|spam|sardine|anchov|crab|lobster|scallop)\b/ },
    { label: "dairy noun (cheese/yogurt/butter/etc.)", re: /\b(cheese|yogurt|yoghurt|butter|cream|ghee|cottage|ricotta|mozzarella|cheddar|parmesan|brie)\b/ },
    { label: "grain noun (bread/cracker/granola/etc.)", re: /\b(bread|bagel|muffin|croissant|tortilla|pita|cracker|rice|pasta|noodle|spaghetti|cereal|granola|oat|oatmeal|flour|quinoa|couscous|barley|rye|grits|cornmeal)\b/ },
    { label: "snack noun (chips/cookie/bar/etc.)", re: /\b(chips?|crisps?|pretzels?|popcorn|candy|candies|chocolate|gummy|gummies|gummie|cookies?|biscuits?|brownies?|cakes?|donuts?|doughnuts?|snack bar|protein bar|energy bar|granola bar|candy bar|chocolate bar|kind bar|larabar|rxbar|clif bar|luna bar|quest bar|m&m|m&ms|skittles?|reese|oreos?|kit kat|twix|snickers?|starburst|lifesavers?|lollipops?|cheerios?|cereals?|peanut butter|almond butter|nutella|honey|jam|jelly|ketchup|mustard|mayo|sauces?|salsa|dressings?|vinegar|olive oil|syrups?|hot sauce|sriracha|hummus|guacamole|pesto|marinara|salt|sea salt|himalayan salt|kosher salt|table salt|seasonings?|spice blend|bouillon)\b/ },
    { label: "meal noun (soup/wrap/salad/etc.)", re: /\b(soup|broth|stock|stew|chili|curry|ramen|frozen meal|canned food|baby food|infant formula|snack|food|meal|lunch|dinner|breakfast|salad|(?<!saran )wrap|bowl|burrito|sandwich|taco|burger|pizza|fries|wings|nuggets|entree|appetizer|side dish)\b/ },
    { label: "produce noun", re: /\b(banana|orange|grape|berry|berries|strawberr|blueberr|raspberr|blackberr|cherry|cherries|mango|peach|pear|plum|prune|apricot|melon|watermelon|pineapple|kiwi|avocado|lemon|lime|tomato|potato|carrot|broccoli|spinach|kale|lettuce|onion|garlic|pepper|cucumber|zucchini|mushroom|corn|pea|bean|lentil|chickpea|edamame|beet|sweet potato|butternut|squash)\b/ },
  ];
  const t4Hits = [];
  for (const sig of foodSignals) {
    const m = s.match(sig.re);
    if (m) t4Hits.push(`${sig.label}: "${m[0]}"`);
  }
  if (t4Hits.length) {
    console.log(`[T4 food-block hits, in regex-evaluation order]`);
    for (const h of t4Hits) console.log(`   • ${h}`);
    console.log(`   ↳ NOTE: detectCategoryFast returns "food" as top-level on ANY of these hits.`);
    console.log(`     The sub-category (cookie vs meat) is decided DOWNSTREAM in scoring.`);
  }

  // Tier 3: AI (will skip if no API key).
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const ai = await aiClassifyCategory(productName, ingredients);
      console.log(`[T3 AI Haiku]  ${ai ? `${ai.category} (conf=${ai.confidence.toFixed(2)}) — ${ai.reasoning}` : "no AI response"}`);
    } catch (e) {
      console.log(`[T3 AI Haiku]  ERROR: ${e.message}`);
    }
  } else {
    console.log(`[T3 AI Haiku]  SKIPPED — no ANTHROPIC_API_KEY in env`);
  }

  // Full cascade end-to-end (Tier 1→5 with no deps, so it skips Redis +
  // runs AI directly when key is present).
  const final = await classifyCategory({ productName, ingredients });
  console.log(`[FINAL]        category=${final.category} source=${final.source} confidence=${final.confidence}`);
  if (final.ai_suggested) console.log(`               (ai_suggested: ${JSON.stringify(final.ai_suggested)})`);
  if (final.reasoning) console.log(`               reasoning: ${final.reasoning}`);

  return final;
}

async function main() {
  const args = parseArgs(process.argv);

  const cases = args.name
    ? [{ name: args.name, ingredients: args.ingredients || "" }]
    : [
      {
        // The smoking gun.
        name: "Sea Salt Chocolate Chip Beef Protein Cookie - 4 pack",
        ingredients: "EQUIP grass-fed beef isolate protein, pasture raised eggs, organic coconut flour, organic tapioca flour, grass-fed ghee, organic raw honey, organic coconut sugar, organic vanilla, baking soda, baking powder (cassava starch, sodium bicarbonate, monocalcium phosphate), organic chocolate chips (cacao, coconut sugar, cocoa butter), VERA microplastic free salt",
      },
      // Contrast cases.
      { name: "Twinings English Breakfast Tea", ingredients: "black tea" },
      { name: "Wild Caught Sockeye Salmon Fillet", ingredients: "wild caught sockeye salmon" },
      { name: "Chicken Sausage Apple Maple", ingredients: "chicken, apple, maple syrup, salt, spices" },
      { name: "Quest Protein Cookie Chocolate Chip", ingredients: "protein blend (milk protein, whey), erythritol, palm oil, water, soluble corn fiber, sucralose, salt" },
      { name: "Goldfish Cheddar Crackers", ingredients: "enriched wheat flour, cheddar cheese, salt, oil" },
    ];

  for (const c of cases) {
    await traceOne(c.name, c.ingredients);
  }
  console.log("\n" + "=".repeat(72));
  console.log("DIAGNOSTIC INTERPRETATION");
  console.log("-".repeat(72));
  console.log(`The Tier-4 regex returns a TOP-LEVEL category ("food"), not a sub-category.`);
  console.log(`"Red meat" is not in CANONICAL_CATEGORIES — it is a SUBCATEGORY signal applied`);
  console.log(`by downstream scoring (calibration rules, foodScorer, substance floors). If the`);
  console.log(`final scoring narrative said "Conventional red meat", that subcategory call was`);
  console.log(`made by the scoring layer reading the verified ingredients, NOT by categoryClassifier.`);
  console.log(`\nNext step: trace where "red meat" / "feedlot" reasoning is emitted in the scoring`);
  console.log(`pipeline (grep for /red meat|feedlot/ in backend/) before deciding the fix surface.`);
}

main().catch(e => { console.error(e?.stack || e); process.exit(1); });
