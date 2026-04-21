#!/usr/bin/env node
// Scoring regression test suite — runs locally against calibration data
// and scoring helpers. Zero API calls, zero cost. Catches prompt/formula
// regressions before they ship.
//
// Run with: node backend/scoring-regression-test.js
// Add to CI or run before every deploy.

const { CALIBRATION, normalise } = require("./calibration");

// ── Test cases ────────────────────────────────────────────────
// Each test asserts a product's calibration score falls in a known-good range.
// If any test fails, something changed the expected score — investigate before deploy.
const TESTS = [
  // High-concern food products — should stay 7+
  { name: "huggies little movers",    expectMin: 7, expectMax: 9, cat: "baby", note: "Class action + Ahcovel" },
  { name: "huggies snug and dry",     expectMin: 7, expectMax: 9, cat: "baby", note: "Ahcovel floor" },
  { name: "pampers swaddlers",        expectMin: 6, expectMax: 8, cat: "baby" },
  { name: "m&ms",                     expectMin: 7, expectMax: 9, cat: "food_beverage", note: "4 petroleum dyes" },
  { name: "skittles",                 expectMin: 7, expectMax: 9, cat: "food_beverage", note: "Petroleum dyes" },
  { name: "reese's",                  expectMin: 6, expectMax: 8, cat: "food_beverage" },
  { name: "oreo",                     expectMin: 5, expectMax: 7, cat: "food_beverage" },
  { name: "pop tarts",                expectMin: 6, expectMax: 8, cat: "food_beverage" },
  { name: "froot loops",              expectMin: 7, expectMax: 9, cat: "food_beverage", note: "Petroleum dyes" },

  // Clean / safe products — should stay 1-3
  { name: "andy pandy diapers",       expectMin: 1, expectMax: 4, cat: "baby" },
  { name: "honest company",           expectMin: 2, expectMax: 5, cat: "baby" },
  { name: "honey nut cheerios",       expectMin: 5, expectMax: 8, cat: "food_beverage", note: "HFCS + BHT" },
  { name: "rxbar",                    expectMin: 1, expectMax: 4, cat: "food_beverage" },
  { name: "larabar",                  expectMin: 1, expectMax: 4, cat: "food_beverage" },

  // Cookware / kitchen
  { name: "teflon",                   expectMin: 7, expectMax: 10, cat: "kitchen", note: "PTFE floor" },
  { name: "lodge cast iron",          expectMin: 1, expectMax: 3,  cat: "kitchen" },

  // Beverages
  { name: "red bull",                 expectMin: 6, expectMax: 9, cat: "beverage" },
  { name: "diet coke",                expectMin: 5, expectMax: 8, cat: "beverage" },
  { name: "liquid death",             expectMin: 1, expectMax: 3, cat: "beverage" },

  // Personal care — high concern
  { name: "neutrogena ultra sheer",   expectMin: 6, expectMax: 8, cat: "personal_care", note: "Oxybenzone + octinoxate" },
  // Personal care — clean
  { name: "badger",                   expectMin: 1, expectMax: 2, cat: "personal_care", note: "Zinc oxide only, organic" },
  { name: "think sport sunscreen",    expectMin: 1, expectMax: 3, cat: "personal_care", note: "Mineral only" },

  // Clothing — high concern
  { name: "shein",                    expectMin: 6, expectMax: 8, cat: "clothing", note: "Polyester + PFAS" },
  { name: "thinx",                    expectMin: 7, expectMax: 9, cat: "clothing", note: "PFAS class action" },
  // Clothing — clean
  { name: "pact organic",             expectMin: 1, expectMax: 3, cat: "clothing", note: "GOTS organic cotton" },

  // Home — high concern
  { name: "lysol disinfectant spray", expectMin: 6, expectMax: 8, cat: "home", note: "Quats + synthetic fragrance" },
  // Home — clean
  { name: "blueland",                 expectMin: 1, expectMax: 3, cat: "home", note: "EWG A-rated, B Corp" },
  { name: "seventh generation free clear", expectMin: 1, expectMax: 3, cat: "home", note: "Plant-based, EPA Safer Choice" },

  // Supplements — high concern
  { name: "centrum silver",           expectMin: 6, expectMax: 8, cat: "supplement", note: "Blue 1 + talc + TiO2" },
  { name: "flintstones complete",     expectMin: 7, expectMax: 9, cat: "supplement", note: "3 petroleum dyes + talc" },
  // Supplements — clean
  { name: "ritual multivitamin",      expectMin: 1, expectMax: 3, cat: "supplement", note: "No synthetic dyes" },
  { name: "garden of life raw",       expectMin: 1, expectMax: 3, cat: "supplement", note: "USDA Organic" },

  // Toys
  { name: "plan toys",                expectMin: 1, expectMax: 1, cat: "toy", note: "Rubberwood, water-based dyes" },
  { name: "hot wheels",               expectMin: 6, expectMax: 8, cat: "toy", note: "Die-cast + ABS/PVC + lead risk" },

  // Cereal — verify grape-nuts fix
  { name: "grape-nuts",               expectMin: 3, expectMax: 4, cat: "food_beverage", note: "Conventional grain, no BHT" },
  { name: "grape nuts",               expectMin: 3, expectMax: 4, cat: "food_beverage", note: "Alternate spelling" },

  // Coverage gap fills — new calibration entries
  { name: "dove soap",                expectMin: 4, expectMax: 5, cat: "personal_care", note: "Conventional bar soap" },
  { name: "method",                   expectMin: 3, expectMax: 5, cat: "home", note: "Plant-derived, synthetic fragrance" },
  { name: "impossible burger",        expectMin: 4, expectMax: 6, cat: "food", note: "NOVA 4 ultra-processed" },
  { name: "beyond meat",              expectMin: 4, expectMax: 6, cat: "food", note: "NOVA 4 ultra-processed" },

  // High-volume products — verify existing calibration
  { name: "head and shoulders",       expectMin: 5, expectMax: 8, cat: "personal_care", note: "Zinc pyrithione + synthetic fragrance" },
  { name: "dawn original dish",       expectMin: 3, expectMax: 5, cat: "home", note: "Surfactants + synthetic fragrance" },
  { name: "fairlife",                  expectMin: 2, expectMax: 4, cat: "beverage", note: "Ultra-filtered, higher protein" },
  { name: "prime hydration",          expectMin: 4, expectMax: 7, cat: "beverage", note: "Sucralose + artificial dyes" },
];

// ── Assertions ────────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];

function runTest(test) {
  const entry = CALIBRATION.get(normalise(test.name)) || CALIBRATION.get(test.name.toLowerCase().trim());

  if (!entry) {
    failed++;
    failures.push(`MISSING: "${test.name}" not in calibration registry`);
    return;
  }

  const score = Math.round((entry.floor + entry.ceiling) / 2);
  const inRange = score >= test.expectMin && score <= test.expectMax;

  if (!inRange) {
    failed++;
    failures.push(`FAIL: "${test.name}" scored ${score} — expected ${test.expectMin}-${test.expectMax}${test.note ? ` (${test.note})` : ""}`);
    return;
  }

  // Validate category matches if specified
  if (test.cat && entry.category && entry.category !== test.cat) {
    failed++;
    failures.push(`CAT: "${test.name}" has category "${entry.category}" — expected "${test.cat}"`);
    return;
  }

  passed++;
}

// ── Structural integrity checks ───────────────────────────────
function checkIntegrity() {
  const issues = [];
  let totalEntries = 0;
  let missingFloor = 0;
  let floorAboveCeiling = 0;
  let noCategory = 0;

  for (const [name, entry] of CALIBRATION.entries()) {
    totalEntries++;
    if (typeof entry.floor !== "number" || typeof entry.ceiling !== "number") {
      missingFloor++;
      if (missingFloor <= 5) issues.push(`  missing floor/ceiling: "${name}"`);
    }
    if (entry.floor > entry.ceiling) {
      floorAboveCeiling++;
      if (floorAboveCeiling <= 5) issues.push(`  floor > ceiling: "${name}" (${entry.floor} > ${entry.ceiling})`);
    }
    if (!entry.category) {
      noCategory++;
    }
  }

  console.log(`\nCalibration integrity:`);
  console.log(`  Total entries: ${totalEntries}`);
  console.log(`  Missing floor/ceiling: ${missingFloor}`);
  console.log(`  Floor > ceiling: ${floorAboveCeiling}`);
  console.log(`  No category: ${noCategory}`);
  if (issues.length) {
    console.log(`\nSample issues:`);
    issues.forEach(i => console.log(i));
  }
  return { missingFloor, floorAboveCeiling };
}

// ── Substance floor tests ─────────────────────────────────────
// Reads the SUBSTANCE_FLOORS array from server.js source to verify
// regex patterns fire correctly without starting the server.
const fs = require("fs");
const serverSrc = fs.readFileSync(__dirname + "/server.js", "utf8");

// Extract SUBSTANCE_FLOORS array via regex — find all match patterns and floors
const FLOOR_TESTS = [
  // Substance name, expected mFloor, note
  { text: "contains Red 40 dye",              expectMinFloor: 6, note: "Petroleum dye" },
  { text: "contains BPA liner",               expectMinFloor: 7, note: "IARC + endocrine" },
  { text: "PFAS coating detected",            expectMinFloor: 8, note: "Forever chemicals" },
  { text: "contains aspartame sweetener",      expectMinFloor: 5, note: "IARC 2B" },
  { text: "formaldehyde releasing",            expectMinFloor: 7, note: "IARC Group 1" },
  { text: "contains TBHQ preservative",        expectMinFloor: 6, note: "Immunotoxin" },
  { text: "contains BHT preservative",         expectMinFloor: 5, note: "Animal carcinogen" },
  { text: "contains MSG flavoring",            expectMinFloor: 4, note: "Excitotoxin" },
  { text: "contains monosodium glutamate",     expectMinFloor: 4, note: "MSG full name" },
  { text: "sodium nitrite preservative",       expectMinFloor: 8, note: "IARC Group 1" },
  { text: "contains sodium benzoate",          expectMinFloor: 4, note: "Benzene risk" },
  { text: "sodium benzoate and ascorbic acid", expectMinFloor: 6, note: "Benzene formation combo" },
  { text: "contains potassium bromate",        expectMinFloor: 7, note: "IARC 2B, banned EU" },
  { text: "mercury compounds detected",        expectMinFloor: 9, note: "Neurotoxin" },
  { text: "contains phthalate plasticizers",     expectMinFloor: 6, note: "Endocrine disruptor class" },
  { text: "contains DEHP phthalate",            expectMinFloor: 7, note: "DEHP specific — IARC 2B" },
  { text: "contains triclosan antibacterial",   expectMinFloor: 6, note: "FDA banned soaps, thyroid" },
];

// Parse SUBSTANCE_FLOORS from source code to build a simplified test runner
// Extract the array between "const SUBSTANCE_FLOORS = [" and the next "];"
const floorsMatch = serverSrc.match(/const SUBSTANCE_FLOORS\s*=\s*\[([\s\S]*?)\];\s*\n/);
let substanceFloorsParsed = [];
if (floorsMatch) {
  // Extract each { match: /pattern/i, mFloor: N } entry
  const entryRegex = /match:\s*(\/.+?\/[gimsuy]*)\s*,\s*mFloor:\s*(\d+)/g;
  let m;
  while ((m = entryRegex.exec(floorsMatch[1])) !== null) {
    try {
      const pattern = eval(m[1]); // Convert regex string to RegExp
      substanceFloorsParsed.push({ pattern, mFloor: parseInt(m[2]) });
    } catch {}
  }
}

let floorTestsPassed = 0, floorTestsFailed = 0;
function runFloorTest(test) {
  // Find highest matching floor for this text
  let maxFloor = 0;
  for (const entry of substanceFloorsParsed) {
    if (entry.pattern.test(test.text)) {
      maxFloor = Math.max(maxFloor, entry.mFloor);
    }
  }
  if (maxFloor >= test.expectMinFloor) {
    floorTestsPassed++;
  } else {
    floorTestsFailed++;
    failures.push(`FLOOR: "${test.text}" triggered floor ${maxFloor}, expected >= ${test.expectMinFloor} (${test.note})`);
  }
}

// ── Child/pregnancy detection tests ──────────────────────────
const CHILD_DETECT_TESTS = [
  // Products that SHOULD be detected as child products
  { name: "huggies little movers", cat: "baby",         expectChild: true,  note: "Baby category" },
  { name: "lego classic set",     cat: "toy",           expectChild: true,  note: "Toy category" },
  { name: "kids shampoo",         cat: "personal_care", expectChild: true,  note: "Kids keyword" },
  { name: "froot loops",          cat: "food_beverage",  expectChild: true,  note: "Child food brand" },
  { name: "lunchables",           cat: "food_beverage",  expectChild: true,  note: "Child food brand" },
  { name: "go-gurt",              cat: "food_beverage",  expectChild: true,  note: "Child food brand" },
  // Products that should NOT be flagged as child products
  { name: "gatorade",             cat: "beverage",       expectChild: false, note: "Adult beverage" },
  { name: "tide pods",            cat: "home",           expectChild: false, note: "Household cleaner" },
  { name: "neutrogena ultra sheer",cat:"personal_care",  expectChild: false, note: "Adult sunscreen" },
  { name: "lodge cast iron",      cat: "kitchen",        expectChild: false, note: "Cookware" },
];

// Parse detectChildProduct patterns from server.js
const childPatternsMatch = serverSrc.match(/const CHILD_PRODUCT_PATTERNS\s*=\s*(\/.+?\/[gimsuy]*)/);
const childBrandsMatch = serverSrc.match(/const CHILD_FOOD_BRANDS\s*=\s*(\/.+?\/[gimsuy]*)/);
let CHILD_PRODUCT_PATTERNS, CHILD_FOOD_BRANDS;
try { CHILD_PRODUCT_PATTERNS = eval(childPatternsMatch[1]); } catch { CHILD_PRODUCT_PATTERNS = /(?!)/; }
try { CHILD_FOOD_BRANDS = eval(childBrandsMatch[1]); } catch { CHILD_FOOD_BRANDS = /(?!)/; }

function testDetectChild(name, category) {
  if (category === "baby" || category === "toy") return true;
  const lower = (name || "").toLowerCase();
  if (CHILD_PRODUCT_PATTERNS.test(lower)) return true;
  if (CHILD_FOOD_BRANDS.test(lower)) return true;
  return false;
}

let childTestsPassed = 0, childTestsFailed = 0;
function runChildTest(test) {
  const result = testDetectChild(test.name, test.cat);
  if (result === test.expectChild) {
    childTestsPassed++;
  } else {
    childTestsFailed++;
    failures.push(`CHILD: "${test.name}" (${test.cat}) detected=${result}, expected=${test.expectChild} (${test.note})`);
  }
}

// ── Category detection tests ──────────────────────────────────
// Tests target detectCategoryFast — the sync Tier 4 fallback in
// backend/categoryClassifier.js. The async AI-first classifier
// (classifyCategory) isn't tested here because we maintain a zero-API-cost
// contract for `npm test`. Fast is still the source of cache keys and the
// safety net when AI is low-confidence or unavailable, so its behavior
// must stay stable.
let detectCategory = () => null;
try {
  const { detectCategoryFast } = require("./categoryClassifier");
  detectCategory = detectCategoryFast;
} catch (e) {
  console.warn("Could not load detectCategoryFast:", e.message);
}

const CATEGORY_TESTS = [
  // Ambiguous products that were previously miscategorized
  { query: "baby shampoo",               expect: "personal_care", note: "Baby product but personal care type" },
  { query: "baby lotion",                expect: "personal_care", note: "Baby product but personal care type" },
  { query: "baby sunscreen",             expect: "personal_care", note: "Baby product but personal care type" },
  { query: "baby vitamins",              expect: "supplement",    note: "Baby product but supplement type" },
  { query: "kids multivitamin",          expect: "supplement",    note: "Kids product but supplement type" },
  { query: "children's tylenol",         expect: "supplement",    note: "Kids medicine" },
  // Products that should still be baby
  { query: "huggies diapers",            expect: "baby",          note: "Core baby product" },
  { query: "enfamil formula",            expect: "baby",          note: "Baby formula brand" },
  { query: "baby stroller",              expect: "baby",          note: "Baby gear" },
  // Clear-cut categories
  { query: "tide pods",                  expect: "home",          note: "Cleaning product" },
  { query: "dish soap",                  expect: "home",          note: "Home, not personal care" },
  { query: "dove soap",                  expect: "personal_care", note: "Personal care soap" },
  { query: "teflon pan",                 expect: "kitchen",       note: "Cookware" },
  { query: "lodge cast iron skillet",    expect: "kitchen",       note: "Cookware" },
  { query: "lego classic",              expect: "toy",            note: "Toy" },
  { query: "shein dress",               expect: "clothing",       note: "Clothing" },
  { query: "protein powder",            expect: "supplement",     note: "Supplement" },
  { query: "red bull energy drink",     expect: "beverage",       note: "Beverage" },
  { query: "cheerios cereal",           expect: "food",           note: "Food" },
  { query: "mcdonalds big mac",         expect: "restaurant",     note: "Restaurant" },
  { query: "lysol spray",              expect: "home",            note: "Cleaning product" },
  { query: "neutrogena sunscreen",      expect: "personal_care",  note: "Sunscreen" },
  { query: "casper mattress",           expect: "home_furnishing", note: "Furniture" },
  { query: "stanley tumbler",           expect: "kitchen",         note: "Drinkware" },
  // Brand-lookup + compound-phrase cases added 2026-04-21 after Salt & Stone body lotion
  // was miscategorized as food during cascade scoring. Brand name starts with the word
  // "salt", which shouldn't pull the product into food classification.
  { query: "salt and stone body lotion", expect: "personal_care",  note: "Personal care brand; body lotion compound phrase" },
  { query: "salt & stone lotion",        expect: "personal_care",  note: "Brand with ampersand variant" },
  { query: "salt and stone",             expect: "personal_care",  note: "Brand-only (no product type) — brand lookup wins" },
  { query: "himalayan salt",             expect: "food",           note: "Salt in cooking context still food" },
  { query: "sea salt",                   expect: "food",           note: "Cooking salt, not personal care" },
  { query: "ocean salt body scrub",      expect: "personal_care",  note: "Body scrub compound phrase beats salt keyword" },
  { query: "dr bronner's castile soap",  expect: "personal_care",  note: "Dr. Bronner's brand" },
  { query: "aveeno daily lotion",        expect: "personal_care",  note: "Aveeno brand" },
  { query: "coca-cola",                  expect: "beverage",       note: "Beverage regression" },
  { query: "lululemon align",            expect: "clothing",       note: "Clothing regression" },
  // Category audit 2026-04-21 — Goldfish/Cheerios returned null, Blurring Foundation returned accessory
  // because "ring" in "blurring" matched the accessory regex (missing leading word boundary)
  { query: "goldfish",                   expect: "food",           note: "Snack brand" },
  { query: "goldfish crackers",          expect: "food",           note: "Snack brand + product type" },
  { query: "goldfish colors",            expect: "food",           note: "Snack brand variant" },
  { query: "cheez-its",                  expect: "food",           note: "Snack brand plural" },
  { query: "pretzels",                   expect: "food",           note: "Plural snack noun" },
  { query: "chex mix",                   expect: "food",           note: "Snack brand phrase" },
  { query: "doritos",                    expect: "food",           note: "Snack brand" },
  { query: "lay's chips",                expect: "food",           note: "Snack brand" },
  { query: "cheerios",                   expect: "food",           note: "Cereal brand" },
  { query: "blurring foundation",        expect: "personal_care",  note: "Word boundary fix — ring in blurring used to match accessory" },
  { query: "fenty beauty foundation",    expect: "personal_care",  note: "Makeup brand" },
  { query: "rare beauty blush",          expect: "personal_care",  note: "Makeup brand" },
  { query: "mac ruby woo",               expect: "personal_care",  note: "MAC Cosmetics lipstick (disambiguated from MacBook)" },
  { query: "charlotte tilbury mascara",  expect: "personal_care",  note: "Makeup brand" },
  { query: "nars lipstick",              expect: "personal_care",  note: "Makeup brand" },
  { query: "setting powder",             expect: "personal_care",  note: "Makeup compound phrase" },
  { query: "eyeshadow palette",          expect: "personal_care",  note: "Makeup compound phrase" },
  { query: "concealer",                  expect: "personal_care",  note: "Makeup keyword" },
  { query: "beauty bar",                 expect: "personal_care",  note: "Beauty bar compound phrase" },
  { query: "blue buffalo dog food",      expect: "other",          note: "Pet food routed to other (no pet category yet)" },
  { query: "purina cat food",            expect: "other",          note: "Pet food" },
  { query: "greenies dental treats",     expect: "other",          note: "Pet treats brand" },
];

let catTestsPassed = 0, catTestsFailed = 0;
function runCategoryTest(test) {
  const result = detectCategory(test.query);
  if (result === test.expect) {
    catTestsPassed++;
  } else {
    catTestsFailed++;
    failures.push(`CAT_DETECT: "${test.query}" -> "${result}", expected "${test.expect}" (${test.note})`);
  }
}

// ── Main ──────────────────────────────────────────────────────
console.log("Partiqule scoring regression tests");
console.log("==================================\n");

const integrity = checkIntegrity();

console.log(`\nRunning ${TESTS.length} scoring assertions...\n`);
TESTS.forEach(runTest);

console.log(`Running ${FLOOR_TESTS.length} substance floor assertions...\n`);
FLOOR_TESTS.forEach(runFloorTest);

console.log(`Running ${CHILD_DETECT_TESTS.length} child detection assertions...\n`);
CHILD_DETECT_TESTS.forEach(runChildTest);

console.log(`Running ${CATEGORY_TESTS.length} category detection assertions...\n`);
CATEGORY_TESTS.forEach(runCategoryTest);

const totalTests = TESTS.length + FLOOR_TESTS.length + CHILD_DETECT_TESTS.length + CATEGORY_TESTS.length;
const totalPassed = passed + floorTestsPassed + childTestsPassed + catTestsPassed;
const totalFailed = failed + floorTestsFailed + childTestsFailed + catTestsFailed;

if (failures.length) {
  console.log("FAILURES:");
  failures.forEach(f => console.log("  " + f));
}

console.log(`\n${totalPassed}/${totalTests} tests passed`);
console.log(`  Calibration: ${passed}/${TESTS.length}`);
console.log(`  Substance floors: ${floorTestsPassed}/${FLOOR_TESTS.length}`);
console.log(`  Child detection: ${childTestsPassed}/${CHILD_DETECT_TESTS.length}`);
console.log(`  Category detection: ${catTestsPassed}/${CATEGORY_TESTS.length}`);
if (substanceFloorsParsed.length > 0) {
  console.log(`  (${substanceFloorsParsed.length} substance floor patterns parsed from server.js)`);
}

const exitCode = (totalFailed > 0 || integrity.floorAboveCeiling > 0) ? 1 : 0;
if (exitCode === 0) {
  console.log("All tests passed ✓");
  if (integrity.missingFloor > 0) {
    console.log(`(Warning: ${integrity.missingFloor} calibration entries missing floor/ceiling — not a failure)`);
  }
} else {
  console.log(`FAILED — ${totalFailed} test failures${integrity.floorAboveCeiling > 0 ? `, ${integrity.floorAboveCeiling} inverted floor/ceiling` : ""}`);
}

process.exit(exitCode);
