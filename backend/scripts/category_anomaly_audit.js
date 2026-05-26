#!/usr/bin/env node
// Production scan audit for the 2026-05-26 whole-foods misclassification hotfix.
//
// Pulls the last N days of production scans from Supabase and surfaces rows
// where ALL of:
//   1. result_json.source === "whole_food_inference"  (the buggy code path)
//   2. result_json.summary matches one of the four pattern-family signatures
//      (red meat / wild game / processed meat / salmon)
//   3. Product name contains a CATEGORY_WORDS_IN_NAME term — meaning the
//      whole-food typing was almost certainly wrong because the name says
//      "cookie / bar / chips / crackers / etc."
//
// Output: docs/category_anomaly_audit_2026-05-24.md (date per hotfix spec).
//
// USAGE — requires production Supabase credentials in env (not in
// backend/.env.local by default):
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
//   node backend/scripts/category_anomaly_audit.js [--days N]
//
// Intelligence gathering only. Does NOT re-score. Re-scoring historical
// scans is a separate operational decision.

"use strict";

const fs = require("fs");
const path = require("path");

// Load .env.local for non-Supabase keys if present.
try {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
    }
  }
} catch { /* best effort */ }

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("ERROR: SUPABASE_URL + SUPABASE_SERVICE_KEY (or _SERVICE_ROLE_KEY) required.");
  console.error("       The audit reads scans from production. Run with prod creds in env.");
  process.exit(1);
}

const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Source-of-truth duplicates of the constants from scoringCascade.js. Kept
// here to avoid pulling in the heavier module just for category-word matching.
const CATEGORY_WORDS_IN_NAME = [
  "cookie","cookies","bar","bars","brownie","brownies","cake","cakes",
  "muffin","muffins","pie","pies","tart","tarts","donut","donuts",
  "doughnut","doughnuts","scone","scones","biscuit","biscuits","wafer",
  "wafers","croissant","danish","pastry","pastries","bread","loaf",
  "bun","buns","roll","rolls","bagel","bagels","tortilla","tortillas",
  "pita","naan","flatbread",
  "chip","chips","crisp","crisps","cracker","crackers","pretzel",
  "pretzels","popcorn","puffs","rings","snack","snacks",
  "cereal","granola","oatmeal","porridge",
  "candy","candies","gummy","gummies","lollipop","chocolate","fudge",
  "truffle","truffles","caramel","marshmallow","marshmallows",
  "sauce","ketchup","mustard","mayo","salsa","dip","dips","spread",
  "spreads","dressing","dressings","syrup","syrups","jam","jelly",
  "marinade","glaze","rub",
  "smoothie","smoothies","shake","shakes","drink","drinks","juice",
  "tea","coffee","latte","lemonade","soda","kombucha",
  "pizza","taco","burrito","wrap","sandwich","burger","nugget",
  "nuggets","ravioli","lasagna","casserole",
  "soup","broth","stew","chili","curry","ramen",
  "powder","mix","kit","blend",
];
const CATEGORY_WORDS_RE = new RegExp(
  "\\b(" + CATEGORY_WORDS_IN_NAME.join("|") + ")\\b", "i"
);

// Pattern-family detectors — keyed off the templated summary strings emitted
// by detectWholeFood. We don't need to re-run the regex; we just check which
// summary phrase came back.
const PATTERN_FAMILY = (summary) => {
  if (!summary) return null;
  const s = summary.toLowerCase();
  if (s.includes("conventional red meat")) return "red_meat";
  if (s.includes("wild game")) return "wild_game";
  if (s.includes("processed meat")) return "processed_meat";
  if (s.includes("salmon")) return "salmon";
  return null;
};

function parseArgs(argv) {
  const out = { days: 30 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--days") out.days = Number(argv[++i]) || 30;
  }
  return out;
}

async function fetchPage(supabase, since, from, to) {
  const { data, error } = await supabase
    .from("scans")
    .select("id, product_name, category, score, result_json, scanned_at")
    .gte("scanned_at", since)
    .order("scanned_at", { ascending: false })
    .range(from, to);
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data || [];
}

(async () => {
  const args = parseArgs(process.argv);
  const since = new Date(Date.now() - args.days * 24 * 60 * 60 * 1000).toISOString();
  console.log(`[audit] querying scans since ${since} (last ${args.days} days)`);

  const PAGE = 1000;
  const all = [];
  let from = 0;
  for (;;) {
    const page = await fetchPage(supabase, since, from, from + PAGE - 1);
    if (!page.length) break;
    all.push(...page);
    console.log(`[audit] fetched page ${from / PAGE + 1} (${page.length} rows, ${all.length} total)`);
    if (page.length < PAGE) break;
    from += PAGE;
  }
  console.log(`[audit] total rows: ${all.length}`);

  const anomalies = [];
  for (const r of all) {
    const name = String(r.product_name || "").trim();
    if (!name) continue;
    const rj = r.result_json || {};
    if (rj.source !== "whole_food_inference") continue;
    const family = PATTERN_FAMILY(rj.summary || "");
    if (!family) continue;
    if (!CATEGORY_WORDS_RE.test(name)) continue;
    const catWordMatch = name.match(CATEGORY_WORDS_RE);
    anomalies.push({
      id: r.id,
      product_name: name,
      brand: rj.brand || rj.identification?.brand || null,
      family,
      score: r.score,
      summary_excerpt: String(rj.summary || "").slice(0, 140),
      category_word: catWordMatch ? catWordMatch[0] : null,
      scanned_at: r.scanned_at,
    });
  }
  console.log(`[audit] anomalies found: ${anomalies.length}`);

  // Bucket by family for the report.
  const byFamily = { red_meat: [], wild_game: [], processed_meat: [], salmon: [] };
  for (const a of anomalies) byFamily[a.family].push(a);

  // Sort each bucket by scanned_at desc.
  for (const k of Object.keys(byFamily)) {
    byFamily[k].sort((a, b) => String(b.scanned_at).localeCompare(String(a.scanned_at)));
  }

  // Build the markdown report.
  const today = new Date().toISOString().slice(0, 10);
  const lines = [];
  lines.push("# Category-anomaly audit — whole-foods misclassification");
  lines.push("");
  lines.push(`Generated ${today}. Window: last ${args.days} days. Total scans surveyed: ${all.length}.`);
  lines.push("");
  lines.push("## Methodology");
  lines.push("");
  lines.push("Each row below was scored via `detectWholeFood()` in scoringCascade.js BEFORE the");
  lines.push("2026-05-26 hotfix. The pre-hotfix unanchored meat-family patterns matched on the");
  lines.push("substring of an ingredient mentioned in the product name (e.g. `beef` inside `Beef");
  lines.push("Protein Cookie`), then returned the templated whole-food reasoning for that family.");
  lines.push("");
  lines.push("Inclusion criteria (ALL must hold):");
  lines.push("");
  lines.push("- `result_json.source === \"whole_food_inference\"`");
  lines.push("- `result_json.summary` matches a meat-family pattern signature (red meat / wild");
  lines.push("  game / processed meat / salmon)");
  lines.push("- Product name contains a `CATEGORY_WORDS_IN_NAME` term (cookie, bar, chips,");
  lines.push("  crackers, bread, granola, snack, etc.)");
  lines.push("");
  lines.push(`Total anomalies: **${anomalies.length}**`);
  lines.push("");
  lines.push("| Family | Anomaly count |");
  lines.push("| --- | ---: |");
  for (const k of ["red_meat", "wild_game", "processed_meat", "salmon"]) {
    lines.push(`| ${k} | ${byFamily[k].length} |`);
  }
  lines.push("");
  lines.push("## Anomalies by pattern family");
  lines.push("");
  for (const k of ["red_meat", "wild_game", "processed_meat", "salmon"]) {
    lines.push(`### ${k} (${byFamily[k].length})`);
    lines.push("");
    if (byFamily[k].length === 0) {
      lines.push("_None in window._");
      lines.push("");
      continue;
    }
    lines.push("| Scanned | Product | Brand | Cat word | Current score | Templated summary (excerpt) |");
    lines.push("| --- | --- | --- | --- | ---: | --- |");
    for (const a of byFamily[k]) {
      const scanned = String(a.scanned_at || "").slice(0, 10);
      const name = a.product_name.replace(/\|/g, "\\|");
      const brand = a.brand ? String(a.brand).replace(/\|/g, "\\|") : "—";
      const summary = a.summary_excerpt.replace(/\|/g, "\\|").replace(/\n/g, " ");
      lines.push(`| ${scanned} | ${name} | ${brand} | ${a.category_word} | ${a.score} | ${summary} |`);
    }
    lines.push("");
  }
  lines.push("## Disposition");
  lines.push("");
  lines.push("These rows were not re-scored as part of the hotfix audit (per the user");
  lines.push("instruction: \"intelligence gathering, not bulk re-scoring\"). The decision");
  lines.push("about whether to re-score historical scans, leave them as-is, or invalidate");
  lines.push("the cache for affected products is a separate operational call.");
  lines.push("");
  lines.push("Fix-forward verification: any new scan of an affected product after the hotfix");
  lines.push("deploy will route through the updated `detectWholeFood()` and either:");
  lines.push("");
  lines.push("- early-exit on the `CATEGORY_WORDS_IN_NAME` check and fall through to other");
  lines.push("  cascade tiers (calibration, OFF, web search, Tier 5 generic), or");
  lines.push("- still match a now-anchored whole-food pattern only when the name IS the");
  lines.push("  whole food (e.g. `ground beef`, `wild salmon`).");
  lines.push("");

  const outDir = path.join(__dirname, "..", "..", "docs");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "category_anomaly_audit_2026-05-24.md");
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`[audit] wrote ${outPath}`);
  process.exit(0);
})().catch(e => { console.error(e?.stack || e); process.exit(1); });
