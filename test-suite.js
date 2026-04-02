#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// Partiqule Test Suite
// Usage: node test-suite.js [--url https://your-railway-url]
// ─────────────────────────────────────────────────────────────

const API_BASE = process.argv.includes("--url")
  ? process.argv[process.argv.indexOf("--url") + 1]
  : "https://partiqule-production.up.railway.app";

const DELAY_MS   = 3000; // ms between tests (avoid rate limiting)
const MAX_RETRY  = 2;    // retries on 500

// ── TEST CASES ────────────────────────────────────────────────
const TESTS = [
  // ── FOOD — HIGH RISK ──────────────────────────────────────
  {
    product: "M&Ms Milk Chocolate Candies",
    minScore: 6, maxScore: 9,
    category: "food_beverage",
    mustFlag: ["Red 40"],
    note: "Petroleum dyes — must score 6+ and flag Red 40"
  },
  {
    product: "Skittles",
    minScore: 6, maxScore: 9,
    mustFlag: ["titanium dioxide"],
    note: "Multiple petroleum dyes + titanium dioxide (IARC 2B)"
  },
  {
    product: "Altoids Peppermint Mints",
    minScore: 4, maxScore: 7,
    note: "BHT preservative + artificial flavors — should score 4-7, not 3"
  },
  {
    product: "Tide Original Laundry Pods",
    minScore: 5, maxScore: 8,
    note: "PVA film + synthetic fragrance — must score 5+"
  },
  {
    product: "Cascade Dishwasher Pods",
    minScore: 5, maxScore: 8,
    note: "PVA film + optical brighteners"
  },

  // ── FOOD — LOW RISK ───────────────────────────────────────
  {
    product: "Blueland Dishwasher Tablets",
    minScore: 1, maxScore: 3,
    note: "No PVA, no synthetic fragrance — should score 1-3"
  },
  {
    product: "Poppi Prebiotic Soda",
    minScore: 1, maxScore: 4,
    mustNotRec: ["Poppi"],
    note: "Clean soda — must not score 6+, must not recommend itself"
  },
  {
    product: "Olipop Vintage Cola",
    minScore: 1, maxScore: 4,
    mustNotRec: ["Olipop"],
    note: "Clean soda — must not score 6+, must not recommend itself"
  },
  {
    product: "organic spinach",
    minScore: 1, maxScore: 2,
    note: "USDA organic produce — should score 1-2"
  },
  {
    product: "Hu Chocolate Bar",
    minScore: 1, maxScore: 3,
    note: "No refined sugar, no dyes — should score 1-3"
  },

  // ── RESTAURANT ────────────────────────────────────────────
  {
    product: "Chick-fil-A Crispy Chicken Sandwich",
    minScore: 5, maxScore: 8,
    category: "restaurant",
    mustFlag: ["TBHQ"],
    note: "Fast food fried sandwich — must score 5+, flag TBHQ"
  },
  {
    product: "Fuzzy's Taco Shop Shredded Chicken Taco",
    minScore: 3, maxScore: 6,
    category: "restaurant",
    note: "Fast casual taco — should score 3-6"
  },
  {
    product: "Chick-fil-A Grilled Chicken Sandwich",
    minScore: 3, maxScore: 6,
    category: "restaurant",
    note: "Grilled is cleaner — should score lower than crispy version"
  },

  // ── CLOTHING ─────────────────────────────────────────────
  {
    product: "Lululemon Align Leggings",
    minScore: 5, maxScore: 8,
    category: "clothing",
    note: "Nylon/spandex synthetic microfibers — must score 5+"
  },
  {
    product: "Patagonia organic cotton t-shirt",
    minScore: 1, maxScore: 3,
    category: "clothing",
    note: "Certified organic cotton — should score 1-3"
  },
  {
    product: "Brandy Melville crop top",
    minScore: 4, maxScore: 7,
    category: "clothing",
    note: "Fast fashion, conventional materials, zero transparency"
  },

  // ── PERSONAL CARE ─────────────────────────────────────────
  {
    product: "Neutrogena Ultra Sheer Sunscreen SPF 100",
    minScore: 6, maxScore: 9,
    mustFlag: ["oxybenzone"],
    note: "Chemical UV filters — must score 6+ and flag oxybenzone"
  },
  {
    product: "Badger Sport Mineral Sunscreen",
    minScore: 1, maxScore: 3,
    note: "Non-nano zinc oxide — should score 1-3"
  },
  {
    product: "Ethique Shampoo Bar",
    minScore: 1, maxScore: 3,
    note: "Plastic-free, no synthetic fragrance — should score 1-3"
  },

  // ── KITCHEN ──────────────────────────────────────────────
  {
    product: "Teflon non-stick frying pan",
    minScore: 6, maxScore: 9,
    mustFlag: ["PTFE"],
    note: "PTFE/PFAS — must score 6+ and flag PTFE"
  },
  {
    product: "Caraway ceramic cookware",
    minScore: 1, maxScore: 3,
    note: "No PTFE/PFAS — should score 1-3"
  },
];

// ── TEST RUNNER ───────────────────────────────────────────────
const colors = {
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
};

function checkConcerns(result, mustFlag) {
  if (!mustFlag || mustFlag.length === 0) return [];
  const allConcerns = [
    ...(result.food_analysis?.concerns || []),
    ...(result.concerns || []),
    ...(result.dimensions?.materials?.concerns || []),
  ];
  const concernText = JSON.stringify(allConcerns).toLowerCase();
  const summaryText = (result.summary || "").toLowerCase();
  const missing = [];
  for (const flag of mustFlag) {
    if (!concernText.includes(flag.toLowerCase()) && !summaryText.includes(flag.toLowerCase())) {
      missing.push(flag);
    }
  }
  return missing;
}

function checkMustNotRec(result, mustNotRec) {
  if (!mustNotRec || mustNotRec.length === 0) return [];
  const alts = [
    ...(result.alternatives || []),
    ...(result.ai_alternatives || []),
  ].map(a => (a.name || "").toLowerCase());
  const found = [];
  for (const name of mustNotRec) {
    if (alts.some(a => a.includes(name.toLowerCase()))) {
      found.push(name);
    }
  }
  return found;
}

async function callAPI(product, attempt = 1) {
  const res = await fetch(`${API_BASE}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: product }),
  });
  if (res.status === 500 && attempt <= MAX_RETRY) {
    await new Promise(r => setTimeout(r, 4000));
    return callAPI(product, attempt + 1);
  }
  return res;
}

async function runTest(test, index, total) {
  process.stdout.write(`  [${index}/${total}] ${colors.cyan(test.product)} ... `);
  const start = Date.now();

  try {
    const res = await callAPI(test.product);

    if (!res.ok) {
      console.log(colors.red(`FAIL (HTTP ${res.status})`));
      return { pass: false, product: test.product, reason: `HTTP ${res.status}`, note: test.note };
    }

    const data = await res.json();
    const score = data.overall_score || data.score;
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const failures = [];

    if (score < test.minScore || score > test.maxScore) {
      failures.push(`score ${score} outside [${test.minScore}-${test.maxScore}]`);
    }
    if (test.category && data.category !== test.category) {
      failures.push(`category "${data.category}" expected "${test.category}"`);
    }
    const missingFlags = checkConcerns(data, test.mustFlag);
    if (missingFlags.length > 0) {
      failures.push(`missing concerns: ${missingFlags.join(", ")}`);
    }
    const badRecs = checkMustNotRec(data, test.mustNotRec);
    if (badRecs.length > 0) {
      failures.push(`self-recommended: ${badRecs.join(", ")}`);
    }

    if (failures.length === 0) {
      console.log(colors.green(`PASS`) + colors.dim(` score=${score} (${elapsed}s)`));
      return { pass: true, product: test.product, score, elapsed };
    } else {
      console.log(colors.red(`FAIL`) + colors.dim(` score=${score} (${elapsed}s)`));
      for (const f of failures) console.log(`       ${colors.red("✗")} ${f}`);
      return { pass: false, product: test.product, score, reason: failures.join("; "), note: test.note };
    }
  } catch (err) {
    console.log(colors.red(`ERROR: ${err.message}`));
    return { pass: false, product: test.product, reason: err.message, note: test.note };
  }
}

async function main() {
  console.log(colors.bold("\n🧪 Partiqule Test Suite"));
  console.log(colors.dim(`   API: ${API_BASE}`));
  console.log(colors.dim(`   Tests: ${TESTS.length} — ~${Math.ceil(TESTS.length * (DELAY_MS/1000 + 8))}s to complete\n`));

  const results = [];
  for (let i = 0; i < TESTS.length; i++) {
    const result = await runTest(TESTS[i], i + 1, TESTS.length);
    results.push(result);
    if (i < TESTS.length - 1) await new Promise(r => setTimeout(r, DELAY_MS));
  }

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log("\n" + "─".repeat(60));
  console.log(colors.bold(`Results: ${colors.green(passed + " passed")} / ${failed > 0 ? colors.red(failed + " failed") : "0 failed"} / ${TESTS.length} total`));

  if (failed > 0) {
    console.log(colors.bold("\nFailed tests:"));
    results.filter(r => !r.pass).forEach(r => {
      console.log(`  ${colors.red("✗")} ${r.product}`);
      console.log(`    ${colors.dim("Why:")} ${r.note}`);
      console.log(`    ${colors.dim("Fail:")} ${r.reason}`);
    });
  }
  console.log("");
  process.exit(failed > 0 ? 1 : 0);
}

main();


// ── TEST CASES ────────────────────────────────────────────────
// Each test defines:
//   product:    what to scan
//   minScore:   lowest acceptable score
//   maxScore:   highest acceptable score
//   category:   expected category (optional)
//   mustFlag:   substances that MUST appear in concerns (optional)
//   mustNotRec: product names that must NOT appear as alternatives (optional)
//   note:       why this test exists

const TESTS = [
  // ── FOOD — HIGH RISK ──────────────────────────────────────
  {
    product: "M&Ms Milk Chocolate Candies",
    minScore: 6, maxScore: 9,
    category: "food_beverage",
    mustFlag: ["Red 40"],
    note: "Petroleum dyes — must score 6+ and flag Red 40"
  },
  {
    product: "Skittles",
    minScore: 6, maxScore: 9,
    mustFlag: ["titanium dioxide"],
    note: "Multiple petroleum dyes + titanium dioxide (IARC 2B)"
  },
  {
    product: "Tide Original Laundry Pods",
    minScore: 5, maxScore: 8,
    category: "kitchen",
    note: "PVA film + synthetic fragrance — must score 5+"
  },
  {
    product: "Cascade Dishwasher Pods",
    minScore: 5, maxScore: 8,
    note: "PVA film + optical brighteners"
  },

  // ── FOOD — LOW RISK ───────────────────────────────────────
  {
    product: "Blueland Dishwasher Tablets",
    minScore: 1, maxScore: 3,
    note: "No PVA, no synthetic fragrance — should score 1-3"
  },
  {
    product: "Poppi Prebiotic Soda",
    minScore: 1, maxScore: 4,
    mustNotRec: ["Poppi"],
    note: "Clean soda — must not score 6+, must not recommend itself"
  },
  {
    product: "Olipop Vintage Cola",
    minScore: 1, maxScore: 4,
    mustNotRec: ["Olipop"],
    note: "Clean soda — must not score 6+, must not recommend itself"
  },
  {
    product: "organic spinach",
    minScore: 1, maxScore: 2,
    note: "USDA organic produce — should score 1-2"
  },
  {
    product: "Hu Chocolate Bar",
    minScore: 1, maxScore: 3,
    note: "No refined sugar, no dyes — should score 1-3"
  },

  // ── RESTAURANT ────────────────────────────────────────────
  {
    product: "Chick-fil-A Crispy Chicken Sandwich",
    minScore: 5, maxScore: 8,
    category: "restaurant",
    mustFlag: ["TBHQ"],
    note: "Fast food fried sandwich — must score 5+, flag TBHQ"
  },
  {
    product: "Fuzzy's Taco Shop Shredded Chicken Taco",
    minScore: 3, maxScore: 6,
    category: "restaurant",
    note: "Fast casual taco — should score 3-6"
  },
  {
    product: "Chick-fil-A Grilled Chicken Sandwich",
    minScore: 3, maxScore: 6,
    category: "restaurant",
    note: "Grilled is cleaner — should score lower than crispy version"
  },

  // ── CLOTHING ─────────────────────────────────────────────
  {
    product: "Lululemon Align Leggings",
    minScore: 5, maxScore: 8,
    category: "clothing",
    note: "Nylon/spandex synthetic microfibers — must score 5+"
  },
  {
    product: "Patagonia organic cotton t-shirt",
    minScore: 1, maxScore: 3,
    category: "clothing",
    note: "Certified organic cotton — should score 1-3"
  },
  {
    product: "Brandy Melville crop top",
    minScore: 4, maxScore: 7,
    category: "clothing",
    note: "Fast fashion, conventional materials, zero transparency"
  },

  // ── PERSONAL CARE ─────────────────────────────────────────
  {
    product: "Neutrogena Ultra Sheer Sunscreen SPF 100",
    minScore: 6, maxScore: 9,
    mustFlag: ["oxybenzone"],
    note: "Chemical UV filters — must score 6+ and flag oxybenzone"
  },
  {
    product: "Badger Sport Mineral Sunscreen",
    minScore: 1, maxScore: 3,
    note: "Non-nano zinc oxide — should score 1-3"
  },
  {
    product: "Ethique Shampoo Bar",
    minScore: 1, maxScore: 3,
    note: "Plastic-free, no synthetic fragrance — should score 1-3"
  },

  // ── KITCHEN ──────────────────────────────────────────────
  {
    product: "Teflon non-stick frying pan",
    minScore: 6, maxScore: 9,
    mustFlag: ["PTFE"],
    note: "PTFE/PFAS — must score 6+ and flag PTFE"
  },
  {
    product: "Caraway ceramic cookware",
    minScore: 1, maxScore: 3,
    note: "No PTFE/PFAS — should score 1-3"
  },
];

// ── TEST RUNNER ───────────────────────────────────────────────
const colors = {
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
};

function checkConcerns(result, mustFlag) {
  if (!mustFlag || mustFlag.length === 0) return [];
  const allConcerns = [
    ...(result.food_analysis?.concerns || []),
    ...(result.concerns || []),
    ...(result.dimensions?.materials?.concerns || []),
  ];
  const concernText = JSON.stringify(allConcerns).toLowerCase();
  const summaryText = (result.summary || "").toLowerCase();
  const missing = [];
  for (const flag of mustFlag) {
    if (!concernText.includes(flag.toLowerCase()) && !summaryText.includes(flag.toLowerCase())) {
      missing.push(flag);
    }
  }
  return missing;
}

function checkMustNotRec(result, mustNotRec) {
  if (!mustNotRec || mustNotRec.length === 0) return [];
  const alts = [
    ...(result.alternatives || []),
    ...(result.ai_alternatives || []),
  ].map(a => (a.name || "").toLowerCase());
  const found = [];
  for (const name of mustNotRec) {
    if (alts.some(a => a.includes(name.toLowerCase()))) {
      found.push(name);
    }
  }
  return found;
}

async function runTest(test, index, total) {
  process.stdout.write(`  [${index}/${total}] ${colors.cyan(test.product)} ... `);
  const start = Date.now();

  try {
    const res = await fetch(`${API_BASE}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: test.product }),
    });

    if (!res.ok) {
      console.log(colors.red(`FAIL (HTTP ${res.status})`));
      return { pass: false, product: test.product, reason: `HTTP ${res.status}`, note: test.note };
    }

    const data = await res.json();
    const score = data.overall_score || data.score;
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const failures = [];

    // Score range check
    if (score < test.minScore || score > test.maxScore) {
      failures.push(`score ${score} outside [${test.minScore}-${test.maxScore}]`);
    }

    // Category check
    if (test.category && data.category !== test.category) {
      failures.push(`category "${data.category}" expected "${test.category}"`);
    }

    // Must flag check
    const missingFlags = checkConcerns(data, test.mustFlag);
    if (missingFlags.length > 0) {
      failures.push(`missing concerns: ${missingFlags.join(", ")}`);
    }

    // Must not recommend check
    const badRecs = checkMustNotRec(data, test.mustNotRec);
    if (badRecs.length > 0) {
      failures.push(`self-recommended: ${badRecs.join(", ")}`);
    }

    if (failures.length === 0) {
      console.log(colors.green(`PASS`) + colors.dim(` score=${score} (${elapsed}s)`));
      return { pass: true, product: test.product, score, elapsed };
    } else {
      console.log(colors.red(`FAIL`) + colors.dim(` score=${score} (${elapsed}s)`));
      for (const f of failures) {
        console.log(`       ${colors.red("✗")} ${f}`);
      }
      return { pass: false, product: test.product, score, reason: failures.join("; "), note: test.note };
    }
  } catch (err) {
    console.log(colors.red(`ERROR: ${err.message}`));
    return { pass: false, product: test.product, reason: err.message, note: test.note };
  }
}

async function main() {
  console.log(colors.bold("\n🧪 Partiqule Test Suite"));
  console.log(colors.dim(`   API: ${API_BASE}`));
  console.log(colors.dim(`   Tests: ${TESTS.length}\n`));

  const results = [];
  for (let i = 0; i < TESTS.length; i++) {
    const result = await runTest(TESTS[i], i + 1, TESTS.length);
    results.push(result);
    // Small delay between tests to avoid rate limiting
    if (i < TESTS.length - 1) await new Promise(r => setTimeout(r, 1500));
  }

  // ── Summary ───────────────────────────────────────────────
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log("\n" + "─".repeat(60));
  console.log(colors.bold(`Results: ${colors.green(passed + " passed")} / ${failed > 0 ? colors.red(failed + " failed") : "0 failed"} / ${TESTS.length} total`));

  if (failed > 0) {
    console.log(colors.bold("\nFailed tests:"));
    results.filter(r => !r.pass).forEach(r => {
      console.log(`  ${colors.red("✗")} ${r.product}`);
      console.log(`    ${colors.dim("Why:")} ${r.note}`);
      console.log(`    ${colors.dim("Fail:")} ${r.reason}`);
    });
  }

  console.log("");
  process.exit(failed > 0 ? 1 : 0);
}

main();
