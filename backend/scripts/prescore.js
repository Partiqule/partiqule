#!/usr/bin/env node
// Prescore a shot list of product names through the live /analyze pipeline
// and write a CSV. The endpoint runs the same scoring path a real user scan
// hits — calibration → cascade → substance floors → consistency → NOVA →
// positive ceilings — so this stays faithful without duplicating any of it.
//
// Usage:
//   node backend/scripts/prescore.js <shotlist.txt> <out.csv>
// Env:
//   API_BASE — override scoring endpoint (default: Railway production)

const fs = require("fs");
const path = require("path");

const API_BASE = process.env.API_BASE || "https://partiqule-production.up.railway.app";
const REQUEST_TIMEOUT_MS = 90_000;

// source → tier label (matches the cascade documented in CLAUDE.md)
function tierFromSource(source, cached) {
  if (cached) return "cache";
  switch (source) {
    case "calibration":         return "calibration";
    case "previous_scan":       return "previous_scan";
    case "open_food_facts":     return "open_food_facts";
    case "open_beauty_facts":   return "open_beauty_facts";
    case "open_products_facts": return "open_products_facts";
    case "web_search":          return "web_search";
    case "vision_ocr":          return "vision_ocr";
    case "ai_text_only_estimate": return "category_prior";
    default:                    return source || "unknown";
  }
}

function pickTopConcern(result) {
  if (Array.isArray(result.flagged_substances) && result.flagged_substances.length) {
    return String(result.flagged_substances[0]);
  }
  if (Array.isArray(result.concerns) && result.concerns.length) {
    return String(result.concerns[0]);
  }
  const matCon = result.dimensions?.materials?.concerns;
  if (Array.isArray(matCon) && matCon.length) return String(matCon[0]);
  return "";
}

function pickTopAlternative(result) {
  const all = [
    ...(Array.isArray(result.alternatives) ? result.alternatives : []),
    ...(Array.isArray(result.ai_alternatives) ? result.ai_alternatives : []),
  ];
  if (!all.length) return { name: "", score: "" };
  // Prefer the lowest-scoring alternative (the cleanest swap)
  const sorted = [...all].sort((a, b) => {
    const sa = a.score ?? a.estimated_score ?? 99;
    const sb = b.score ?? b.estimated_score ?? 99;
    return sa - sb;
  });
  const top = sorted[0];
  const name = top.name || top.brand || "";
  const score = top.score ?? top.estimated_score ?? "";
  return { name, score };
}

function csvEscape(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function fetchAnalyze(productName) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(`${API_BASE}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: productName }),
      signal: ctrl.signal,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
    }
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

function readShotlist(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return raw
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith("#"));
}

async function main() {
  const [, , inputPath, outputPath] = process.argv;
  if (!inputPath || !outputPath) {
    console.error("Usage: node backend/scripts/prescore.js <shotlist.txt> <out.csv>");
    process.exit(1);
  }

  const products = readShotlist(inputPath);
  if (!products.length) {
    console.error(`No products found in ${inputPath}`);
    process.exit(1);
  }

  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  console.log(`Prescoring ${products.length} products against ${API_BASE}\n`);
  const startedAt = Date.now();

  const cache = new Map();
  const rows = [];

  for (let i = 0; i < products.length; i++) {
    const name = products[i];
    const key = name.toLowerCase();
    process.stdout.write(`Scoring ${i + 1} of ${products.length}: ${name} ... `);

    let row;
    try {
      let result = cache.get(key);
      if (!result) {
        result = await fetchAnalyze(name);
        cache.set(key, result);
      }

      const score = typeof result.overall_score === "number" ? result.overall_score
                  : typeof result.score === "number" ? result.score
                  : null;

      const isChild = !!result.is_child_product;
      const childScore = isChild && typeof result.child_score === "number" ? result.child_score : "";

      const tier = tierFromSource(result.source, result.cached);
      const topConcern = pickTopConcern(result);

      let topAltName = "";
      let topAltScore = "";
      if (typeof score === "number" && score >= 5) {
        const alt = pickTopAlternative(result);
        topAltName = alt.name;
        topAltScore = alt.score;
      }

      row = {
        name,
        score: score ?? "",
        kids_score: childScore,
        tier,
        top_concern: topConcern,
        top_alternative: topAltName,
        alternative_score: topAltScore,
      };
      console.log(score ?? "?");
    } catch (e) {
      row = {
        name,
        score: "ERROR",
        kids_score: "",
        tier: "",
        top_concern: e.message || String(e),
        top_alternative: "",
        alternative_score: "",
      };
      console.log(`ERROR: ${e.message || e}`);
    }
    rows.push(row);
  }

  // Sort: errors first (visibility), then numeric score desc
  rows.sort((a, b) => {
    const aErr = a.score === "ERROR";
    const bErr = b.score === "ERROR";
    if (aErr && !bErr) return -1;
    if (!aErr && bErr) return 1;
    if (aErr && bErr) return 0;
    return (b.score || 0) - (a.score || 0);
  });

  const header = ["name", "score", "kids_score", "tier", "top_concern", "top_alternative", "alternative_score"];
  const csvLines = [header.join(",")];
  for (const r of rows) {
    csvLines.push(header.map(h => csvEscape(r[h])).join(","));
  }
  fs.writeFileSync(outputPath, csvLines.join("\n") + "\n");

  // Summary
  const numeric = rows.filter(r => typeof r.score === "number");
  const errors  = rows.filter(r => r.score === "ERROR");
  const avg = numeric.length ? (numeric.reduce((s, r) => s + r.score, 0) / numeric.length) : 0;
  const above5 = numeric.filter(r => r.score > 5).length;
  const cleanAtOrBelow3 = numeric.filter(r => r.score <= 3).length;
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log("");
  console.log("─".repeat(60));
  console.log(`Wrote ${outputPath}`);
  console.log(`Total scored:   ${numeric.length}/${rows.length}${errors.length ? ` (errors: ${errors.length})` : ""}`);
  console.log(`Average score:  ${avg.toFixed(2)}`);
  console.log(`Above 5:        ${above5}`);
  console.log(`At or below 3:  ${cleanAtOrBelow3}`);
  console.log(`Elapsed:        ${elapsedSec}s`);
}

main().catch(e => {
  console.error("Fatal:", e);
  process.exit(1);
});
