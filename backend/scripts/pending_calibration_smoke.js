#!/usr/bin/env node
// Pending-calibration hotfix smoke (2026-05-23).
//
// Pure unit test of tier5CategoryPrior. No API calls.
//
// Scope: this hotfix gated ONLY the Tier 5 generic fallback (the
// false-confidence midpoint score). Whole-food Tier 5 stays as-is
// (legitimate scoring). Tier 3/4 + Pass 1 gating (label legibility,
// ingredient mapping rate, low confidence) deferred to follow-up.
// Smoke verifies the gate at the only spot it currently applies.
//
// Run:
//   node backend/scripts/pending_calibration_smoke.js

"use strict";

const { tier5CategoryPrior } = require("../scoringCascade");

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push({ label, detail }); console.log(`  ✗ ${label}${detail ? `: ${detail}` : ""}`); }
}

// Mock CATEGORY_AVERAGES (matches the shape server.js passes in).
const CATEGORY_AVERAGES = {
  food_beverage: { avg: 5.2 },
  personal_care: { avg: 4.8 },
  other: { avg: 5.5 },
};
const CATEGORY_CONTEXT = {
  food_beverage: "Food typically scores 3-7.",
  other: "Most products score 4-6.",
};

console.log("\n[1] Generic unknown product → pending_calibration");
{
  const t5 = tier5CategoryPrior("Mystery Brand Mystery Product", "other", { categoryAverages: CATEGORY_AVERAGES, categoryContext: CATEGORY_CONTEXT });
  const r = t5.syntheticResult;
  check("status is pending_calibration", r.status === "pending_calibration");
  check("score is null (not 6 midpoint)", r.score === null);
  check("overall_score is null", r.overall_score === null);
  check("precise_score is null", r.precise_score === null);
  check("pending_reason is populated", typeof r.pending_reason === "string" && r.pending_reason.length > 0);
  check("source is pending_calibration", r.source === "pending_calibration");
  check("dimensions all have null score", Object.values(r.dimensions).every(d => d.score === null));
  check("child_score is null", r.child_score === null);
  check("pregnancy_score is null", r.pregnancy_score === null);
  check("_skipCache is true", r._skipCache === true);
}

console.log("\n[2] Generic unknown food → pending_calibration (not 5)");
{
  const t5 = tier5CategoryPrior("Some Obscure Snack", "food_beverage", { categoryAverages: CATEGORY_AVERAGES, categoryContext: CATEGORY_CONTEXT });
  const r = t5.syntheticResult;
  check("food category also pending", r.status === "pending_calibration");
  check("food score is null (not 5 midpoint)", r.score === null);
}

console.log("\n[3] Whole food → still scored (regression: NOT gated)");
{
  // "wild salmon" is in the whole-foods detector.
  const t5 = tier5CategoryPrior("wild salmon", "food_beverage", { categoryAverages: CATEGORY_AVERAGES, categoryContext: CATEGORY_CONTEXT });
  const r = t5.syntheticResult;
  if (r.whole_food !== true) {
    console.log(`    NOTE: 'wild salmon' didn't match whole-food detector; trying 'eggs'`);
    const t5b = tier5CategoryPrior("eggs", "food_beverage", { categoryAverages: CATEGORY_AVERAGES, categoryContext: CATEGORY_CONTEXT });
    const r2 = t5b.syntheticResult;
    check("eggs whole-food path still produces score", r2.score != null && typeof r2.score === "number");
    check("eggs whole-food NOT marked pending", r2.status !== "pending_calibration");
  } else {
    check("whole-food path still produces a number score", r.score != null && typeof r.score === "number");
    check("whole-food NOT marked pending", r.status !== "pending_calibration");
    check("whole-food source is whole_food_inference (not pending)", r.source === "whole_food_inference");
  }
}

console.log("\n[4] No-category fallback uses 'other' → still pending");
{
  const t5 = tier5CategoryPrior("Something Weird", null, { categoryAverages: CATEGORY_AVERAGES, categoryContext: CATEGORY_CONTEXT });
  const r = t5.syntheticResult;
  check("null category routes to other and pending", r.status === "pending_calibration");
  check("category resolved to 'other'", r.category === "other");
}

console.log("\n[5] Alternatives + flagged_substances empty on pending");
{
  const t5 = tier5CategoryPrior("Random Product", "personal_care", { categoryAverages: CATEGORY_AVERAGES, categoryContext: CATEGORY_CONTEXT });
  const r = t5.syntheticResult;
  check("alternatives array empty", Array.isArray(r.alternatives) && r.alternatives.length === 0);
  check("flagged_substances empty", Array.isArray(r.flagged_substances) && r.flagged_substances.length === 0);
  check("concerns empty", Array.isArray(r.concerns) && r.concerns.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  for (const f of failures) console.log(`  - ${f.label}${f.detail ? ` (${f.detail})` : ""}`);
  process.exit(1);
}
process.exit(0);
