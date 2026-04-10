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

// ── Main ──────────────────────────────────────────────────────
console.log("Partiqule scoring regression tests");
console.log("==================================\n");

const integrity = checkIntegrity();

console.log(`\nRunning ${TESTS.length} scoring assertions...\n`);
TESTS.forEach(runTest);

if (failures.length) {
  console.log("FAILURES:");
  failures.forEach(f => console.log("  " + f));
}

console.log(`\n${passed}/${TESTS.length} tests passed`);

// Only fail on test assertions or floor > ceiling (which is a real bug).
// Missing floor/ceiling is a warning — some entries are intentionally partial.
const exitCode = (failed > 0 || integrity.floorAboveCeiling > 0) ? 1 : 0;
if (exitCode === 0) {
  console.log("All tests passed ✓");
  if (integrity.missingFloor > 0) {
    console.log(`(Warning: ${integrity.missingFloor} calibration entries missing floor/ceiling — not a failure)`);
  }
} else {
  console.log(`FAILED — ${failed} test failures${integrity.floorAboveCeiling > 0 ? `, ${integrity.floorAboveCeiling} inverted floor/ceiling` : ""}`);
}

process.exit(exitCode);
