#!/usr/bin/env node
// dynamicPool smoke (Phase 2b session 2 verification).
//
// Exercises buildDynamicPool against the real calibration registry.
// Zero API cost — pure data + filter logic.
//
// Run:
//   node backend/scripts/dynamicPool_smoke.js

"use strict";

const { CALIBRATION } = require("../calibration");
const { buildDynamicPool, SLUG_PATTERNS } = require("../dynamicPool");

let passCount = 0;
let failCount = 0;
const failures = [];

function check(label, ok, detail = "") {
  if (ok) {
    passCount++;
    console.log(`  ✓ ${label}`);
  } else {
    failCount++;
    failures.push({ label, detail });
    console.log(`  ✗ ${label}${detail ? `: ${detail}` : ""}`);
  }
}

// Helper: short-form a pool for log output.
function describePool(p) {
  if (!p) return "null";
  return `items=${p.items.length} audience=${p.audience} occasion=${p.occasion} per_slug=${JSON.stringify(p.metadata.per_slug_counts)}`;
}

console.log(`\n[1] Disney trip (kid_focused, vacation_warm_weather)`);
{
  const intent = {
    audience: "child",
    decomposed_categories: ["sunscreen", "snacks", "hydration", "personal_care_kids"],
    dynamic_pool_spec: {
      audience: "kid_focused",
      occasion_proxy: "vacation_warm_weather",
    },
  };
  const pool = buildDynamicPool({ intent, scanHistory: [], calibration: CALIBRATION });
  console.log(`    ${describePool(pool)}`);
  check("pool returned", pool !== null);
  check("at least 1 sunscreen item", pool.metadata.per_slug_counts.sunscreen > 0);
  check("at least 1 snacks item", pool.metadata.per_slug_counts.snacks > 0);
  check("at least 1 hydration item", pool.metadata.per_slug_counts.hydration > 0);
  check("at least 1 personal_care_kids item", pool.metadata.per_slug_counts.personal_care_kids > 0);
  check("contextId is 'dynamic'", pool.contextId === "dynamic");
  check("audience preserved on result", pool.audience === "kid_focused");
}

console.log(`\n[2] Summer camp (kid_focused, summer_camp)`);
{
  const intent = {
    audience: "child",
    decomposed_categories: ["sunscreen", "snacks", "hydration", "personal_care_kids"],
    dynamic_pool_spec: { audience: "kid_focused", occasion_proxy: "summer_camp" },
  };
  const pool = buildDynamicPool({ intent, scanHistory: [], calibration: CALIBRATION });
  console.log(`    ${describePool(pool)}`);
  check("pool returned", pool !== null);
  check("sunscreen + personal_care_kids both present",
    pool.metadata.per_slug_counts.sunscreen > 0 && pool.metadata.per_slug_counts.personal_care_kids > 0);
}

console.log(`\n[3] Road trip with kids (family_with_kids)`);
{
  const intent = {
    audience: "child",
    decomposed_categories: ["snacks", "hydration", "sunscreen"],
    dynamic_pool_spec: { audience: "family_with_kids", occasion_proxy: "weekend_camping" },
  };
  const pool = buildDynamicPool({ intent, scanHistory: [], calibration: CALIBRATION });
  console.log(`    ${describePool(pool)}`);
  check("pool returned", pool !== null);
  check("snacks + hydration both present",
    pool.metadata.per_slug_counts.snacks > 0 && pool.metadata.per_slug_counts.hydration > 0);
  // family_with_kids excludes alcohol but allows coffee/energy drinks
  const adultOnly = pool.items.filter(i => /\b(wine|beer|whiskey|vodka|liquor)\b/i.test(i.product_id));
  check("no adult-only items in family_with_kids pool", adultOnly.length === 0);
}

console.log(`\n[4] Adult-focused excludes kid-only items`);
{
  const intent = {
    audience: "adult",
    decomposed_categories: ["snacks", "hydration", "supplements"],
    dynamic_pool_spec: { audience: "adult_focused", occasion_proxy: "post_workout_recovery" },
  };
  const pool = buildDynamicPool({ intent, scanHistory: [], calibration: CALIBRATION });
  console.log(`    ${describePool(pool)}`);
  check("pool returned", pool !== null);
  const kidOnly = pool.items.filter(i => /\b(children'?s|infant formula|baby formula|teether|onesie|swaddle)\b/i.test(i.product_id));
  check("no kid-only items in adult_focused pool", kidOnly.length === 0,
    kidOnly.length ? `found: ${kidOnly.map(k => k.product_id).slice(0,3).join(", ")}` : "");
}

console.log(`\n[5] Slug-level false-positive regressions (from coverage audit)`);
{
  const intent = {
    audience: "adult",
    decomposed_categories: ["kitchen_basics", "bedding"],
    dynamic_pool_spec: { audience: "adult_focused", occasion_proxy: "first_apartment_setup" },
  };
  const pool = buildDynamicPool({ intent, scanHistory: [], calibration: CALIBRATION });
  console.log(`    ${describePool(pool)}`);
  check("pool returned", pool !== null);
  // pantene/smartypants/pancake leaked into kitchen_basics in the audit's
  // loose substring heuristic. Strict patterns must catch them.
  const kitchenItems = pool.items.filter(i => i._slug === "kitchen_basics");
  const leakedKitchen = kitchenItems.filter(i =>
    /pantene|smartypants|panera|pancake|\bpandy\b/i.test(i.product_id));
  check("kitchen_basics excludes pantene/smartypants/panera/pancake/pandy",
    leakedKitchen.length === 0,
    leakedKitchen.length ? `leaked: ${leakedKitchen.map(k => k.product_id).join(", ")}` : "");
  // bedding matched dryer sheets in the audit. Strict pattern must catch.
  const beddingItems = pool.items.filter(i => i._slug === "bedding");
  const leakedBedding = beddingItems.filter(i => /dryer sheets?/i.test(i.product_id));
  check("bedding excludes dryer sheets", leakedBedding.length === 0,
    leakedBedding.length ? `leaked: ${leakedBedding.map(k => k.product_id).join(", ")}` : "");
}

console.log(`\n[6] Empty result when all slugs miss`);
{
  const intent = {
    audience: "pet",
    // pet_food is in the vocab; force a pet-focused audience to filter to pet-only
    decomposed_categories: ["pet_food"],
    dynamic_pool_spec: { audience: "pet_focused", occasion_proxy: "routine_pet_care" },
  };
  const pool = buildDynamicPool({ intent, scanHistory: [], calibration: CALIBRATION });
  console.log(`    ${describePool(pool)}`);
  // pet_food may or may not have entries — we just verify the function
  // either returns a valid pool OR null (gracefully).
  if (pool === null) {
    check("returned null on empty match (graceful)", true);
  } else {
    check("returned non-empty pool when at least one slug matched", pool.items.length > 0);
    check("pet items only (no non-pet leak)",
      pool.items.every(i => /\b(pet|dog|cat|kibble)\b/i.test(i.product_id)));
  }
}

console.log(`\n[7] Malformed spec → null`);
{
  check("null on missing decomposed_categories", buildDynamicPool({
    intent: { dynamic_pool_spec: { audience: "kid_focused", occasion_proxy: "x" } },
    scanHistory: [], calibration: CALIBRATION,
  }) === null);
  check("null on missing dynamic_pool_spec", buildDynamicPool({
    intent: { decomposed_categories: ["snacks"] },
    scanHistory: [], calibration: CALIBRATION,
  }) === null);
  check("null on invalid audience", buildDynamicPool({
    intent: {
      decomposed_categories: ["snacks"],
      dynamic_pool_spec: { audience: "invalid_audience", occasion_proxy: "x" },
    },
    scanHistory: [], calibration: CALIBRATION,
  }) === null);
  check("null on empty decomposed array", buildDynamicPool({
    intent: {
      decomposed_categories: [],
      dynamic_pool_spec: { audience: "kid_focused", occasion_proxy: "x" },
    },
    scanHistory: [], calibration: CALIBRATION,
  }) === null);
}

console.log(`\n[8] All 15 vocabulary slugs have at least one calibration match`);
{
  for (const slug of Object.keys(SLUG_PATTERNS)) {
    const intent = {
      audience: "adult",
      decomposed_categories: [slug],
      dynamic_pool_spec: { audience: "family_with_kids", occasion_proxy: "x" },
    };
    const pool = buildDynamicPool({ intent, scanHistory: [], calibration: CALIBRATION });
    const count = pool ? pool.metadata.per_slug_counts[slug] : 0;
    check(`${slug}: at least 1 match (got ${count})`, count > 0);
  }
}

console.log(`\n${passCount} passed, ${failCount} failed`);
if (failCount > 0) {
  console.log(`\nFailures:`);
  for (const f of failures) console.log(`  - ${f.label}${f.detail ? ` (${f.detail})` : ""}`);
  process.exit(1);
}
process.exit(0);
