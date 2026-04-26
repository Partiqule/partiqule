#!/usr/bin/env node
// Audit a prescore CSV against expected score ranges for known-concerning
// and known-clean patio products. Surfaces mismatches with paste-ready
// calibration.js diff suggestions so the on-set workflow is:
//   prescore → audit → fix entries → cache-clear → re-prescore.
//
// Usage:
//   node backend/scripts/audit_scores.js <prescore.csv>

const fs = require("fs");
const path = require("path");

const OUTPUT_TXT = path.resolve(__dirname, "output", "patio_audit.txt");

// ── Rule set ───────────────────────────────────────────────────────────────
// Each rule tests a row and (if matched) declares the expected score band.
// First match wins. Rules look at the product name AND the top_concern column
// pulled from the scoring response.
//
// Ranges follow the user's spec:
//   - Oxybenzone/octinoxate sunscreens  → ≥ 6
//   - Mineral-only sunscreens           → ≤ 3
//   - DEET repellents                   → ≥ 5
//   - Picaridin                         → ≤ 4
//   - Plant-based / essential-oil bug   → ≤ 3
//   - Glyphosate/bifenthrin/permethrin/2,4-D pesticides → ≥ 7
//   - Calcium hypochlorite / trichloro-s-triazinetrione pool chems → ≥ 6
//   - Citronella candles                → ≤ 3

const RULES = [
  {
    id: "sunscreen-mineral",
    label: "Mineral-only sunscreen",
    expected: [1, 3],
    category: "personal_care",
    subs: ["zinc oxide", "titanium dioxide"],
    test: (n, c) => /sunscreen|spf/i.test(n) && /mineral/i.test(n)
              && !/oxybenzone|octinoxate|avobenzone|homosalate|octisalate/i.test(c),
  },
  {
    id: "sunscreen-chemical-ox",
    label: "Sunscreen with oxybenzone or octinoxate",
    expected: [6, 9],
    category: "personal_care",
    subs: ["oxybenzone", "octinoxate"],
    test: (_n, c) => /oxybenzone|octinoxate/i.test(c),
  },
  {
    id: "citronella-candle",
    label: "Citronella candle",
    expected: [1, 3],
    category: "home",
    subs: ["citronella oil"],
    test: (n) => /citronella\s+candle/i.test(n),
  },
  {
    id: "plant-bug",
    label: "Plant-based / essential-oil insect repellent",
    expected: [1, 3],
    category: "other",
    subs: [],
    test: (n, c) =>
      /\bnatural\b|essential oil|lemon eucalyptus|plant.?based/i.test(n + " " + c)
      && /repellent|insect|bug/i.test(n),
  },
  {
    id: "picaridin",
    label: "Picaridin insect repellent",
    expected: [1, 4],
    category: "other",
    subs: ["picaridin"],
    test: (n, c) => /picaridin/i.test(n + " " + c),
  },
  {
    id: "deet",
    label: "DEET insect repellent",
    expected: [5, 9],
    category: "other",
    subs: ["DEET"],
    test: (n, c) =>
      /\bdeet\b/i.test(c)
      || /\boff\b.*deep woods|cutter backwoods|repel\s*100|off\s*familycare/i.test(n),
  },
  {
    id: "synthetic-pesticide",
    label: "Synthetic pesticide / herbicide (glyphosate, bifenthrin, permethrin, 2,4-D)",
    expected: [7, 10],
    category: "home",
    subs: ["glyphosate", "bifenthrin", "permethrin", "2,4-D"],
    test: (n, c) => {
      const blob = (n + " " + c).toLowerCase();
      if (/glyphosate|bifenthrin|permethrin|2,4-d|cyfluthrin|triazicide/.test(blob)) return true;
      if (/roundup|spectracide|ortho\s+(home defense|groundclear|lawn|weed)|scotts\s+turf\s+builder/.test(blob)) return true;
      return false;
    },
  },
  {
    id: "pool-chem",
    label: "Pool chemical (calcium hypochlorite / trichloro-s-triazinetrione)",
    expected: [6, 10],
    category: "home",
    subs: ["calcium hypochlorite", "trichloro-s-triazinetrione"],
    test: (n, c) => {
      const blob = (n + " " + c).toLowerCase();
      if (/calcium hypochlorite|trichloro|sodium dichloro|chlorinating granules/.test(blob)) return true;
      if (/pool\s+shock|pool\s+care|hth\s+pool|pool\s+chlorin/.test(blob)) return true;
      return false;
    },
  },
];

// ── CSV parsing (small, dependency-free) ──────────────────────────────────
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (field !== "" || row.length) { row.push(field); rows.push(row); row = []; field = ""; }
        if (ch === "\r" && text[i + 1] === "\n") i++;
      }
      else { field += ch; }
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows.shift();
  return rows.filter(r => r.length === header.length).map(r => {
    const o = {};
    header.forEach((h, idx) => { o[h] = r[idx]; });
    return o;
  });
}

function classify(row) {
  const name = row.name || "";
  const concern = row.top_concern || "";
  for (const rule of RULES) {
    try {
      if (rule.test(name, concern)) return rule;
    } catch { /* rule errored — skip */ }
  }
  return null;
}

function isChildBranded(name) {
  return /\bbaby|kids?\b|infant|toddler|babyganics|burts bees baby|honest baby/i.test(name);
}

function categoryFromRule(rule) { return rule.category; }

function suggestEntry(name, rule, isChild) {
  const key = name.toLowerCase().replace(/\s+/g, " ").trim();
  const [floor, ceiling] = rule.expected;
  const subs = rule.subs.length ? rule.subs : [];
  const reason = `${rule.label} — calibrated for filming ${new Date().toISOString().slice(0, 10)}`;
  const lines = [];
  lines.push(`  ["${key}", { floor:${floor}, ceiling:${ceiling}, substances:${JSON.stringify(subs)}, reason:"${reason}", confidence:"high", category:"${rule.category}"`);
  if (isChild) {
    // Mineral child → keep clean ≤3; chemical child → kids floor 7+ (skin contact, daily use)
    if (rule.id === "sunscreen-mineral") {
      lines[lines.length - 1] += `, kidsFloor:${floor}, kidsCeiling:${ceiling}`;
    } else if (rule.id === "sunscreen-chemical-ox") {
      lines[lines.length - 1] += `, kidsFloor:8, kidsCeiling:9`;
    } else if (rule.id === "deet" || rule.id === "synthetic-pesticide") {
      lines[lines.length - 1] += `, kidsFloor:9, kidsCeiling:10`;
    } else if (rule.id === "plant-bug" || rule.id === "picaridin") {
      lines[lines.length - 1] += `, kidsFloor:${floor}, kidsCeiling:${Math.min(ceiling + 1, 10)}`;
    }
  }
  lines[lines.length - 1] += " }],";
  return lines.join("\n");
}

function evaluate(rows) {
  return rows.map(row => {
    const numScore = Number(row.score);
    const isErr = row.score === "ERROR" || Number.isNaN(numScore);
    const rule = classify(row);

    if (isErr) {
      return {
        ...row,
        actual_score: row.score,
        expected_range: rule ? `${rule.expected[0]}-${rule.expected[1]}` : "—",
        status: "ERROR",
        reason: rule ? rule.label : "Scoring failed (see top_concern)",
        rule,
      };
    }

    if (!rule) {
      return {
        ...row,
        actual_score: numScore,
        expected_range: "—",
        status: "PASS",
        reason: "No expectation rule matched",
        rule: null,
      };
    }

    const [lo, hi] = rule.expected;
    let status, reasonText;
    if (numScore < lo) {
      status = "FLAG_LOW";
      reasonText = `${rule.label}; expected ≥ ${lo}, got ${numScore}`;
    } else if (numScore > hi) {
      status = "FLAG_HIGH";
      reasonText = `${rule.label}; expected ≤ ${hi}, got ${numScore}`;
    } else if (row.tier !== "calibration") {
      status = "MISSING_CALIBRATION";
      reasonText = `${rule.label}; in range but anchored by ${row.tier || "unknown"} tier — add a named entry to lock it`;
    } else {
      status = "PASS";
      reasonText = `${rule.label}; calibrated and in range`;
    }
    return { ...row, actual_score: numScore, expected_range: `${lo}-${hi}`, status, reason: reasonText, rule };
  });
}

function pad(s, n) { s = String(s); return s.length >= n ? s : s + " ".repeat(n - s.length); }

function buildReport(results) {
  const lines = [];
  lines.push("─".repeat(78));
  lines.push("PATIO SHOOT AUDIT");
  lines.push("─".repeat(78));
  lines.push("");
  lines.push(`${pad("STATUS", 22)}${pad("SCORE", 8)}${pad("EXP", 8)}NAME`);
  lines.push("─".repeat(78));
  for (const r of results) {
    lines.push(`${pad(r.status, 22)}${pad(r.actual_score, 8)}${pad(r.expected_range, 8)}${r.name}`);
    if (r.status !== "PASS") {
      lines.push(`  ↳ ${r.reason}`);
    }
  }
  lines.push("");

  // Group counts
  const counts = { PASS: 0, FLAG_LOW: 0, FLAG_HIGH: 0, MISSING_CALIBRATION: 0, ERROR: 0 };
  for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;
  const flagged = counts.FLAG_LOW + counts.FLAG_HIGH + counts.MISSING_CALIBRATION + counts.ERROR;

  lines.push("─".repeat(78));
  lines.push("SUMMARY");
  lines.push("─".repeat(78));
  lines.push(`Total products:        ${results.length}`);
  lines.push(`PASS:                  ${counts.PASS}`);
  lines.push(`FLAG_LOW:              ${counts.FLAG_LOW}`);
  lines.push(`FLAG_HIGH:             ${counts.FLAG_HIGH}`);
  lines.push(`MISSING_CALIBRATION:   ${counts.MISSING_CALIBRATION}`);
  lines.push(`ERROR:                 ${counts.ERROR}`);
  lines.push(`Total flagged:         ${flagged}`);
  lines.push("");

  // Group needing calibration entries
  const groups = {
    FLAG_LOW: results.filter(r => r.status === "FLAG_LOW"),
    FLAG_HIGH: results.filter(r => r.status === "FLAG_HIGH"),
    MISSING_CALIBRATION: results.filter(r => r.status === "MISSING_CALIBRATION"),
  };
  for (const [grp, items] of Object.entries(groups)) {
    if (!items.length) continue;
    lines.push(`Products needing attention — ${grp} (${items.length}):`);
    for (const it of items) lines.push(`  • ${it.name}  (${it.actual_score}, expected ${it.expected_range})`);
    lines.push("");
  }

  // Suggested diffs
  const diffItems = [...groups.FLAG_LOW, ...groups.FLAG_HIGH];
  if (diffItems.length) {
    lines.push("─".repeat(78));
    lines.push("SUGGESTED CALIBRATION DIFFS  (review before pasting into calibration.js)");
    lines.push("─".repeat(78));
    lines.push("");
    for (const it of diffItems) {
      lines.push(`// ${it.name}  →  ${it.status}  (got ${it.actual_score}, want ${it.expected_range})`);
      lines.push("```js");
      lines.push(suggestEntry(it.name, it.rule, isChildBranded(it.name)));
      lines.push("```");
      lines.push("");
    }
  }

  return lines.join("\n");
}

function main() {
  const [, , csvPath] = process.argv;
  if (!csvPath) {
    console.error("Usage: node backend/scripts/audit_scores.js <prescore.csv>");
    process.exit(1);
  }
  const text = fs.readFileSync(csvPath, "utf8");
  const rows = parseCsv(text);
  if (!rows.length) {
    console.error(`No rows in ${csvPath}`);
    process.exit(1);
  }
  const results = evaluate(rows);
  const report = buildReport(results);

  console.log(report);

  const outDir = path.dirname(OUTPUT_TXT);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(OUTPUT_TXT, report);
  console.log(`\nReport written to ${OUTPUT_TXT}`);
}

main();
