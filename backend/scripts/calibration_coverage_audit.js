#!/usr/bin/env node
// Calibration coverage audit (Phase 2b session 1 prerequisite).
//
// Loads backend/calibration.js + backend/productFamilies.js and produces
// docs/calibration_coverage_audit_phase2b.md describing:
//   - Current calibration category distribution (the 14 broad buckets
//     actually in use)
//   - CANONICAL_FAMILIES coverage (intel-card families, personal care only)
//   - Phase 2b aspirational category slugs and their estimated coverage
//     via substring heuristic over calibration keys
//   - Thin/modest/adequate flags
//
// Zero API cost. Pure data inspection.
//
// Usage:
//   node backend/scripts/calibration_coverage_audit.js
//
// Output:
//   docs/calibration_coverage_audit_phase2b.md

"use strict";

const fs = require("fs");
const path = require("path");

const { CALIBRATION } = require("../calibration.js");
const { CANONICAL_FAMILIES } = require("../productFamilies.js");

const OUTPUT_PATH = path.resolve(__dirname, "../../docs/calibration_coverage_audit_phase2b.md");

// Thresholds per Phase 2b session 1 spec.
const THIN_THRESHOLD = 10;
const MODEST_THRESHOLD = 25;

// ── Phase 2b aspirational category slugs (from session 1 kickoff spec) ──
// Each slug has a list of substring patterns that would match relevant
// calibration entries by KEY (the normalized product name). This is a
// heuristic — calibration doesn't carry fine-grained subcategory tags,
// so substring matching is the best estimator until/unless calibration
// gets a subcategory column.
const ASPIRATIONAL_SLUGS = [
  { slug: "sunscreen",            patterns: ["sunscreen", "spf", "sunblock", "sun block"] },
  { slug: "snacks",               patterns: ["snack", "chip", "cracker", "cookie", "bar ", "pretzel", "popcorn", "granola"] },
  { slug: "hydration",            patterns: ["water", "gatorade", "powerade", "electrolyte", "coconut water", "smartwater", "liquid death"] },
  { slug: "lip_balm",             patterns: ["lip balm", "lipstick", "chapstick", "carmex", "lip salve", "lip treatment"] },
  { slug: "party_food",           patterns: ["cake", "cupcake", "candy", "frosting", "icing", "pop tart"] },
  { slug: "party_beverages",      patterns: ["juice", "soda", "punch", "lemonade", "kool aid"] },
  { slug: "party_favors",         patterns: ["sticker", "favor", "goody", "trinket"] },
  { slug: "gift_bags",            patterns: ["gift bag", "wrapping", "tissue paper"] },
  { slug: "beverages",            patterns: ["soda", "juice", "coffee", "tea", "kombucha", "seltzer", "sparkling"] },
  { slug: "bug_spray",            patterns: ["bug spray", "insect repellent", "mosquito", "deet", "picaridin"] },
  { slug: "cleaning_supplies",    patterns: ["cleaner", "detergent", "soap", "bleach", "disinfectant", "wipes", "spray"] },
  { slug: "bathroom_essentials",  patterns: ["toilet paper", "soap", "shampoo", "conditioner", "toothpaste", "deodorant"] },
  { slug: "kitchen_basics",       patterns: ["pan", "skillet", "spatula", "cookware", "knife", "cutting board"] },
  { slug: "bedding",              patterns: ["sheet", "pillow", "comforter", "mattress", "duvet", "blanket"] },
  { slug: "pet_food",             patterns: ["pet food", "dog food", "cat food", "kibble", "wet food"] },
  { slug: "pet_treats",           patterns: ["dog treat", "cat treat", "pet treat", "chew"] },
  { slug: "pet_grooming",         patterns: ["pet shampoo", "dog shampoo", "cat shampoo", "pet brush"] },
  { slug: "pet_toys",             patterns: ["pet toy", "dog toy", "cat toy", "chew toy"] },
  { slug: "baby_gifts",           patterns: ["baby", "infant", "newborn", "diaper", "onesie"] },
  { slug: "household_gifts",      patterns: ["candle", "diffuser", "throw", "vase", "frame"] },
  { slug: "personal_care_kids",   patterns: ["kid", "child", "toddler", "baby shampoo", "baby lotion", "baby wash"] },
  { slug: "supplements",          patterns: ["vitamin", "supplement", "protein powder", "creatine", "multivitamin"] },
  { slug: "protein_snacks",       patterns: ["protein bar", "protein cookie", "rxbar", "perfect bar", "jerky", "biltong"] },
];

// Audience tags Phase 2b dynamic_pool_spec might use. Calibration doesn't
// have an explicit audience field — kid signal comes from kidsFloor/
// kidsCeiling presence; baby/infant from category=="baby" or "infant"
// keywords; family is implicit. Reports best-effort counts.
function countByAudience(entries) {
  const buckets = { with_kid_signal: 0, baby_category: 0, adult_signal: 0, no_signal: 0 };
  for (const v of entries) {
    if (typeof v.kidsFloor === "number" || typeof v.kidsCeiling === "number") buckets.with_kid_signal++;
    if (v.category === "baby") buckets.baby_category++;
    if ((v.category === "beverage" || v.category === "supplement") && !v.kidsFloor) buckets.adult_signal++;
    if (!v.kidsFloor && !v.kidsCeiling && v.category !== "baby") buckets.no_signal++;
  }
  return buckets;
}

function tagFor(count) {
  if (count < THIN_THRESHOLD) return "THIN COVERAGE";
  if (count < MODEST_THRESHOLD) return "MODEST COVERAGE";
  return "ADEQUATE COVERAGE";
}

// ── Build category distribution ─────────────────────────────────
const categoryCounts = new Map();
const categoryEntries = new Map();
let totalEntries = 0;
let entriesMissingCategory = 0;
for (const [key, v] of CALIBRATION.entries()) {
  totalEntries++;
  const c = typeof v.category === "string" ? v.category : "__missing__";
  if (c === "__missing__") entriesMissingCategory++;
  categoryCounts.set(c, (categoryCounts.get(c) || 0) + 1);
  if (!categoryEntries.has(c)) categoryEntries.set(c, []);
  categoryEntries.get(c).push({ key, value: v });
}

const sortedCategories = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]);

// ── Build CANONICAL_FAMILIES coverage ────────────────────────────
// CANONICAL_FAMILIES is for intel-card matching (personal care only).
// Counts here estimate via substring match on key (best heuristic).
const familyCoverage = CANONICAL_FAMILIES.map(family => {
  // Convert family slug to a pattern (e.g., "hair_shampoo" → "shampoo")
  const term = family.replace(/^baby_/, "").replace(/^hair_/, "").replace(/^oral_/, "").replace(/^skincare_/, "");
  const looseTerm = term.replace(/_/g, " ");
  let count = 0;
  for (const key of CALIBRATION.keys()) {
    if (key.includes(looseTerm)) count++;
  }
  return { family, looseTerm, count };
}).sort((a, b) => b.count - a.count);

// ── Build Phase 2b aspirational slug coverage ────────────────────
const aspirationalCoverage = ASPIRATIONAL_SLUGS.map(({ slug, patterns }) => {
  const matchedKeys = new Set();
  for (const key of CALIBRATION.keys()) {
    for (const p of patterns) {
      if (key.includes(p)) { matchedKeys.add(key); break; }
    }
  }
  return { slug, patterns, count: matchedKeys.size, sample: [...matchedKeys].slice(0, 5) };
}).sort((a, b) => b.count - a.count);

// ── Build the markdown report ────────────────────────────────────
const lines = [];
lines.push("# Calibration coverage audit — Phase 2b prep");
lines.push("");
lines.push("Generated by `backend/scripts/calibration_coverage_audit.js`. Re-run after calibration backfills to update.");
lines.push("");
lines.push("**Purpose:** assess whether the calibration registry has enough coverage for Phase 2b dynamic context expansion. Phase 2b lets Pass 1 populate `decomposed_categories` and `dynamic_pool_spec` for non-templated queries (e.g., \"packing for our family Disney trip\"); the composer then needs a pool of calibrated products to compose against.");
lines.push("");
lines.push("**Headline finding:** calibration entries carry a coarse `category` field (14 distinct values, mostly broad buckets like `food_beverage` and `personal_care`). The Phase 2b spec's category slug list (snacks, hydration, pet_food, party_food, etc.) is finer-grained than what the registry tracks. Phase 2b's pool builder will need to either:");
lines.push("- Decompose broad calibration categories via substring/keyword heuristics at pool-build time, OR");
lines.push("- Add a `subcategory` field to calibration entries and backfill, OR");
lines.push("- Constrain Phase 2b's decomposed_categories vocabulary to slugs that map cleanly onto existing calibration categories.");
lines.push("");
lines.push("This audit estimates coverage for the spec's aspirational slugs via substring matching on the normalized product name — a stand-in for what a heuristic decomposer could find at runtime.");
lines.push("");
lines.push("---");
lines.push("");
lines.push("## 1. Current calibration category distribution");
lines.push("");
lines.push(`Total entries: **${totalEntries}**. Distinct category values: **${categoryCounts.size}**. Entries missing a category field: **${entriesMissingCategory}**.`);
lines.push("");
lines.push("| Category | Count | Coverage tag |");
lines.push("|---|---:|---|");
for (const [cat, n] of sortedCategories) {
  lines.push(`| \`${cat}\` | ${n} | ${tagFor(n)} |`);
}
lines.push("");
lines.push("Calibration's `category` field is currently a coarse bucket, not a fine-grained taxonomy. Eight of fourteen buckets clear the 25-entry adequate threshold. The five with under 25 entries (`other`, `food`, `accessory`, `toy`, `home_furnishing`) are either catch-alls or under-developed verticals.");
lines.push("");
lines.push("---");
lines.push("");
lines.push("## 2. CANONICAL_FAMILIES coverage (intel-card matching, personal care)");
lines.push("");
lines.push("`CANONICAL_FAMILIES` from `backend/productFamilies.js` is the canonical personal-care taxonomy used for intel-card relevance matching. It is NOT the calibration category field. Phase 2b dynamic context expansion may want to reuse this list (or extend it) as the source of truth for `decomposed_categories` slugs in the personal-care domain.");
lines.push("");
lines.push(`Family count: **${CANONICAL_FAMILIES.length}**. Substring-estimated calibration coverage per family:`);
lines.push("");
lines.push("| Family | Estimated calibration entries (substring) | Coverage tag |");
lines.push("|---|---:|---|");
for (const { family, looseTerm, count } of familyCoverage) {
  lines.push(`| \`${family}\` (\`${looseTerm}\`) | ${count} | ${tagFor(count)} |`);
}
lines.push("");
lines.push("CANONICAL_FAMILIES is personal-care only — no food, no household, no pet, no apparel families. Phase 2b decomposed_categories needs to extend this taxonomy or define its own.");
lines.push("");
lines.push("---");
lines.push("");
lines.push("## 3. Phase 2b aspirational slug coverage (substring heuristic)");
lines.push("");
lines.push("These are the category slugs referenced in the Phase 2b session 1 kickoff spec. None exist as a calibration `category` value today; counts below estimate what a heuristic decomposer could find via substring search on the normalized product name.");
lines.push("");
lines.push("| Slug | Estimated entries | Coverage tag | Sample keys |");
lines.push("|---|---:|---|---|");
for (const { slug, count, sample } of aspirationalCoverage) {
  const sampleStr = sample.length ? sample.map(s => `\`${s}\``).join(", ") : "_none_";
  lines.push(`| \`${slug}\` | ${count} | ${tagFor(count)} | ${sampleStr} |`);
}
lines.push("");

// ── Summary findings ─────────────────────────────────────────────
const thin = aspirationalCoverage.filter(x => x.count < THIN_THRESHOLD);
const modest = aspirationalCoverage.filter(x => x.count >= THIN_THRESHOLD && x.count < MODEST_THRESHOLD);
const adequate = aspirationalCoverage.filter(x => x.count >= MODEST_THRESHOLD);

lines.push("---");
lines.push("");
lines.push("## 4. Pre-launch backfill priorities");
lines.push("");
lines.push(`**Thin coverage (under ${THIN_THRESHOLD} entries — Phase 2b composes against an empty or near-empty pool):**`);
if (thin.length === 0) {
  lines.push("- _None._");
} else {
  for (const x of thin) lines.push(`- \`${x.slug}\` — ${x.count} entries`);
}
lines.push("");
lines.push(`**Modest coverage (${THIN_THRESHOLD}–${MODEST_THRESHOLD - 1} entries — Phase 2b can compose but the Keep/Swap/Add sections may be thin):**`);
if (modest.length === 0) {
  lines.push("- _None._");
} else {
  for (const x of modest) lines.push(`- \`${x.slug}\` — ${x.count} entries`);
}
lines.push("");
lines.push(`**Adequate coverage (${MODEST_THRESHOLD}+ entries — likely composes a healthy bundle):**`);
if (adequate.length === 0) {
  lines.push("- _None._");
} else {
  for (const x of adequate) lines.push(`- \`${x.slug}\` — ${x.count} entries`);
}
lines.push("");
lines.push("---");
lines.push("");
lines.push("## 5. Recommended Phase 2b launch sequencing");
lines.push("");
lines.push("1. **Constrain Pass 1's decomposed_categories vocabulary** to slugs with at least MODEST coverage in this audit. The Pass 1 prompt examples in session 1 should use only slugs that map to real calibration entries — otherwise dynamic queries will refuse with `pool_empty` post-refinement.");
lines.push("2. **Define a Phase 2b category taxonomy** alongside CANONICAL_FAMILIES (or as an extension). Pick the slugs that map cleanly to existing calibration coverage; defer the thin/modest slugs to backfill cycles before launch.");
lines.push("3. **Pool builder heuristic in session 2** does substring decomposition over the broad calibration categories until/unless calibration adds a subcategory field. Mirrors how this audit estimates coverage.");
lines.push("4. **Backfill priorities for launch:** the thin slugs above are P0 if Phase 2b prompts the AI to emit them. If they aren't in the prompt examples, defer.");
lines.push("");
lines.push("---");
lines.push("");
lines.push(`_Generated ${new Date().toISOString().slice(0, 10)} from ${totalEntries} calibration entries._`);

// ── Write report ─────────────────────────────────────────────────
fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, lines.join("\n"));

console.log(`Audit complete. Report written to:`);
console.log(`  ${OUTPUT_PATH}`);
console.log("");
console.log(`Summary:`);
console.log(`  Total calibration entries: ${totalEntries}`);
console.log(`  Distinct calibration categories: ${categoryCounts.size}`);
console.log(`  Aspirational slugs — thin: ${thin.length}, modest: ${modest.length}, adequate: ${adequate.length}`);
