#!/usr/bin/env node
// Pass 1.5 refinement-question generation smoke (Phase 2a, session 2).
//
// Runs 6 production-shape cases plus 1 planted-bad-output voice-gate
// test against the Pass 1.5 implementation in backend/refinement.js.
//
// Cases:
//   1. Templated context + audience ambiguity (newborn, no timing)
//   2. Templated context + constraint ambiguity (back to school lunches, no age)
//   3. Open-ended dynamic query (Disney packing)
//   4. Authed user + rich scan history (expect moat_aligned questions)
//   5. Anonymous user (expect category-general only)
//   6. Authed user + empty scan history (expect category-general fallback)
//   7. Planted bad output: synthetic AI mock returns vague + dashed +
//      first-person question → gates should fire on the mock
//
// Usage:
//   ANTHROPIC_API_KEY=... node backend/scripts/pass1_5_refinement_smoke.js
//
// Cost: ~$0.03-$0.05 across 6 live Haiku calls. Case 7 uses a mocked
// callClaude and incurs no API spend.
// Runtime: 10-20s typical.

"use strict";

const { generateRefinementQuestions, refinementGateFailures } = (() => {
  const r = require("../refinement");
  // refinementGateFailures isn't exported, but we can probe gate behavior
  // via the live function's voice_gate_failures return field. No internal
  // access needed.
  return r;
})();

const API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
if (!API_KEY) {
  console.error("ERROR: set ANTHROPIC_API_KEY (or CLAUDE_API_KEY) before running.");
  process.exit(1);
}

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const HAIKU_MODEL = "claude-haiku-4-5-20251001";

// Live Haiku wrapper — same shape as backend/server.js callClaude.
async function callClaude(system, userPrompt, maxTokens = 800, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(ANTHROPIC_API, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify({
          model: HAIKU_MODEL,
          max_tokens: maxTokens,
          temperature: 0,
          system: [{ type: "text", text: system }],
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
      clearTimeout(timeout);
      if ((res.status === 429 || res.status === 529) && attempt < retries) {
        await new Promise(r => setTimeout(r, 4000));
        continue;
      }
      if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text().catch(() => "")}`);
      const data = await res.json();
      const text = data.content.map(b => b.text || "").join("").trim();
      const first = text.indexOf("{");
      const last = text.lastIndexOf("}");
      if (first === -1 || last === -1 || last <= first) throw new Error("No JSON in Haiku response");
      return JSON.parse(text.slice(first, last + 1));
    } catch (e) {
      clearTimeout(timeout);
      if (attempt === retries) throw e;
    }
  }
}

// ── Test cases ────────────────────────────────────────────────────
const CASES = [
  {
    n: 1,
    label: "Templated context, audience ambiguity (newborn no timing)",
    intent: {
      type: "context",
      occasion: "newborn",
      restatement: "newborn essentials",
      ambiguity_reason: "audience could be expectant parent or current parent of newborn",
      needs_refinement: true,
    },
    contextId: "tpl_newborn",
    scanHistory: [],
    expect_min_questions: 2,
    expect_max_questions: 3,
    expect_any_moat_aligned: false,
  },
  {
    n: 2,
    label: "Templated context, constraint ambiguity (lunches no age)",
    intent: {
      type: "context",
      occasion: "back to school",
      restatement: "back to school lunches",
      ambiguity_reason: "kid age unspecified, allergies unspecified",
      needs_refinement: true,
    },
    contextId: "tpl_lunches",
    scanHistory: [],
    expect_min_questions: 2,
    expect_max_questions: 3,
    expect_any_moat_aligned: false,
  },
  {
    n: 3,
    label: "Open-ended dynamic query (Disney packing)",
    intent: {
      type: "context",
      restatement: "Disney trip packing help",
      ambiguity_reason: "dates unknown, audience composition unknown, park visits per day unknown",
      needs_refinement: true,
    },
    contextId: null,
    scanHistory: [],
    expect_min_questions: 2,
    expect_max_questions: 3,
    expect_any_moat_aligned: false,
  },
  {
    n: 4,
    label: "Authed user with rich scan history (expect moat_aligned)",
    intent: {
      type: "context",
      occasion: "beach day",
      restatement: "beach day with kids",
      ambiguity_reason: "kid ages unspecified, trip duration unclear",
      needs_refinement: true,
    },
    contextId: "beach_day",
    scanHistory: [
      { id: "s1", product_name: "Banana Boat Sport Sunscreen", category: "personal_care", score: 7 },
      { id: "s2", product_name: "Hydro Flask 32oz", category: "kitchen", score: 2 },
      { id: "s3", product_name: "Stonyfield Organic Plain", category: "food", score: 3 },
    ],
    expect_min_questions: 2,
    expect_max_questions: 3,
    expect_any_moat_aligned: true,
  },
  {
    n: 5,
    label: "Anonymous user (expect all category-general)",
    intent: {
      type: "context",
      restatement: "what should I bring to the pool with my kids",
      ambiguity_reason: "kid ages and pool duration unspecified",
      needs_refinement: true,
    },
    contextId: null,
    scanHistory: [],
    expect_min_questions: 2,
    expect_max_questions: 3,
    expect_any_moat_aligned: false,
  },
  {
    n: 6,
    label: "Authed user with EMPTY scan history (category-general fallback)",
    intent: {
      type: "context",
      occasion: "newborn",
      restatement: "newborn essentials",
      ambiguity_reason: "audience could be expectant parent or current parent",
      needs_refinement: true,
    },
    contextId: "tpl_newborn",
    scanHistory: [], // authed but no scans yet
    expect_min_questions: 2,
    expect_max_questions: 3,
    expect_any_moat_aligned: false,
  },
  // ── Session 1.5 proper — hedge-phrase regression cases ─────────
  // Production logs (May 19) showed Pass 1.5 prepending framing
  // clauses like "Next 2 weeks, ..." onto duration options, blowing
  // past the 6-word gate. The prompt now explicitly bans this pattern.
  // These two cases reproduce the production failure scenarios and
  // assert that no option starts with the known hedge prefixes.
  {
    n: 7,
    label: "Disney trip (production failure case for hedge prefix)",
    intent: {
      type: "context",
      restatement: "Disney trip packing help",
      ambiguity_reason: "dates unknown, audience composition unknown, park visits per day unknown",
      needs_refinement: true,
    },
    contextId: null,
    scanHistory: [],
    expect_min_questions: 2,
    expect_max_questions: 3,
    expect_any_moat_aligned: false,
    assert_no_hedge_prefix: true,
  },
  {
    n: 8,
    label: "Pool with kids (production failure case for hedge prefix)",
    intent: {
      type: "context",
      restatement: "what should I bring to the pool with my kids",
      ambiguity_reason: "kid ages and pool duration unspecified",
      needs_refinement: true,
    },
    contextId: null,
    scanHistory: [],
    expect_min_questions: 2,
    expect_max_questions: 3,
    expect_any_moat_aligned: false,
    assert_no_hedge_prefix: true,
  },
];

// Hedge-phrase prefixes Pass 1.5 must not emit on any option. Drawn
// from the production failure pattern (May 19): Haiku prepended
// framing clauses like "Next 2 weeks, 2 to 3 days" instead of the
// raw value "2 to 3 days". Applies to ALL cases — Pass 1.5 should
// never hedge regardless of which prompt path it took.
const HEDGE_PREFIXES = [
  "next ",
  "going to ",
  "probably ",
  "when we ",
  "we'll ",
  "in the ",
];

function findHedgeViolations(questions) {
  const out = [];
  for (const q of questions) {
    for (const opt of q.suggested_options || []) {
      const lower = String(opt).toLowerCase().trim();
      for (const prefix of HEDGE_PREFIXES) {
        if (lower.startsWith(prefix)) {
          out.push({ option: opt, prefix, question_text: q.text });
          break;
        }
      }
    }
  }
  return out;
}

// Case 7 uses a planted bad-output mock to verify gates fire.
async function runPlantedBadOutputCase() {
  console.log("  case 7: planted bad output (mocked, voice gate must catch)… ");
  // First mock attempt returns vague + dashed + first-person violations.
  // Second mock returns clean output. generateRefinementQuestions should
  // call retry, fix amendment, and ship the clean second attempt.
  let calls = 0;
  const mockCallClaude = async () => {
    calls++;
    if (calls === 1) {
      return {
        questions: [
          {
            id: "vague_one",
            text: "What do you need?",
            suggested_options: ["Things", "Stuff"],
            allow_text: true,
            moat_aligned: false,
          },
          {
            id: "dashed_compound",
            text: "Are you packing for a kid-friendly trip?",
            suggested_options: ["Yes", "No", "Maybe"],
            allow_text: true,
            moat_aligned: false,
          },
        ],
      };
    }
    return {
      questions: [
        {
          id: "audience_scope",
          text: "Who is going on the trip?",
          suggested_options: ["Kids only", "Kids and adults", "Adults only"],
          allow_text: true,
          moat_aligned: false,
        },
        {
          id: "trip_duration",
          text: "How long is the trip?",
          suggested_options: ["A day", "A weekend", "A week"],
          allow_text: true,
          moat_aligned: false,
        },
      ],
    };
  };

  try {
    const result = await generateRefinementQuestions({
      intent: { type: "context", restatement: "test", ambiguity_reason: "test", needs_refinement: true },
      scanHistory: [],
      contextId: null,
      callClaude: mockCallClaude,
    });
    const failed = result.voice_gate_failures || [];
    // First attempt should have fired question_specificity AND punctuation_hyphen.
    // Second attempt should ship clean.
    const sawSpecificity = failed.includes("question_specificity");
    const finalClean = result.questions.length >= 2 && result.ai_attempts === 2;
    const ok = sawSpecificity && finalClean;
    if (ok) {
      console.log(`    PASS (mocked, attempts=${result.ai_attempts}, failures=${JSON.stringify(failed)})`);
      return { ok: true };
    } else {
      console.log(`    FAIL: expected question_specificity gate fire on attempt 1 and clean attempt 2`);
      console.log(`    Got: attempts=${result.ai_attempts}, failures=${JSON.stringify(failed)}, questions=${result.questions.length}`);
      return { ok: false };
    }
  } catch (e) {
    console.log(`    FAIL: threw error: ${e.message}`);
    return { ok: false };
  }
}

// ── Run ──────────────────────────────────────────────────────────
async function main() {
  console.log(`[pass1_5_refinement_smoke] running ${CASES.length} live cases + 1 mocked gate case against ${HAIKU_MODEL}…`);
  console.log("");

  let pass = 0, fail = 0;
  const details = [];

  for (const c of CASES) {
    process.stdout.write(`  case ${c.n}: ${c.label.slice(0, 60)}… `);
    const t0 = Date.now();
    let result, err;
    try {
      result = await generateRefinementQuestions({
        intent: c.intent,
        scanHistory: c.scanHistory,
        contextId: c.contextId,
        callClaude,
      });
    } catch (e) {
      err = e;
    }
    const dur = Date.now() - t0;

    if (err) {
      console.log(`ERROR (${dur}ms): ${err.message}`);
      fail++;
      details.push({ ...c, ok: false, err: err.message });
      continue;
    }

    const qs = result.questions || [];
    const countOK = qs.length >= c.expect_min_questions && qs.length <= c.expect_max_questions;
    const moatCount = qs.filter(q => q.moat_aligned === true).length;
    const moatOK = c.expect_any_moat_aligned
      ? moatCount >= 1
      : moatCount === 0;
    const shapeOK = qs.every(q =>
      typeof q.id === "string" && q.id.length > 0
      && typeof q.text === "string" && q.text.length > 0
      && Array.isArray(q.suggested_options) && q.suggested_options.length >= 2 && q.suggested_options.length <= 4
      && typeof q.allow_text === "boolean"
      && typeof q.moat_aligned === "boolean"
    );
    const gateOK = (result.voice_gate_failures || []).length === 0
      // For live cases, final shipped result should have zero gate fires
      // (even if first attempt had some, the retry produced clean output).
      ;

    // Hedge-prefix scan (session 1.5 proper). Runs on every case so a
    // regression surfaces anywhere it happens, not just on the dedicated
    // regression cases. The assert_no_hedge_prefix flag is informational
    // only — a hedge prefix fails the suite for any case it appears in.
    const hedgeViolations = findHedgeViolations(qs);
    const hedgeOK = hedgeViolations.length === 0;

    const ok = countOK && moatOK && shapeOK && gateOK && hedgeOK;
    if (ok) {
      console.log(`PASS (${dur}ms, ${qs.length} qs, moat=${moatCount})`);
      pass++;
    } else {
      const issues = [];
      if (!countOK) issues.push(`count=${qs.length} expected ${c.expect_min_questions}-${c.expect_max_questions}`);
      if (!moatOK) issues.push(`moat_count=${moatCount} expected ${c.expect_any_moat_aligned ? ">=1" : "0"}`);
      if (!shapeOK) issues.push("at least one question failed shape validation");
      if (!gateOK) issues.push(`voice_gate_failures: ${JSON.stringify(result.voice_gate_failures)}`);
      if (!hedgeOK) {
        const detail = hedgeViolations
          .map(v => `"${v.option}" (prefix "${v.prefix.trim()}" under question "${v.question_text}")`)
          .join("; ");
        issues.push(`hedge_prefix violations: ${detail}`);
      }
      console.log(`FAIL (${dur}ms): ${issues.join(" | ")}`);
      fail++;
    }
    details.push({ ...c, ok, dur, result });
  }

  // Case 7: planted bad output (mocked)
  const c7 = await runPlantedBadOutputCase();
  if (c7.ok) pass++; else fail++;

  console.log("");
  console.log(`[pass1_5_refinement_smoke] done: ${pass} pass, ${fail} fail`);

  // Preview the first 2 question shapes on success so the operator
  // can spot-check voice quality.
  if (fail === 0 && details.length) {
    console.log("");
    console.log("Sample question preview (case 4 — authed with scan history, moat-aligned expected):");
    const c4 = details.find(d => d.n === 4);
    if (c4 && c4.result) {
      for (const q of c4.result.questions) {
        console.log(`  [${q.moat_aligned ? "MOAT" : "general"}] ${q.text}`);
        console.log(`    options: ${q.suggested_options.join(" | ")}`);
      }
    }
  }

  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => {
  console.error("[pass1_5_refinement_smoke] fatal:", e?.stack || e?.message || e);
  process.exit(1);
});
