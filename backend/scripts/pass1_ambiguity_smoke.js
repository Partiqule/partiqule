#!/usr/bin/env node
// Pass 1 ambiguity-detection smoke (Phase 2a sessions 1 + 5.5).
//
// Calls the Pass 1 classifyIntent function on 13 test queries and
// verifies that needs_refinement matches the expectation per query.
// Updated in session 5.5 to invert the templated-context defaults:
// generic templated queries ("newborn essentials" alone) now SHOULD
// trigger refinement, while specific templated queries with audience
// or household signals ("newborn essentials for my pregnant sister")
// stay needs_refinement=false.
//
// Layout:
//   - cases 1-5:   specific templated queries with sufficient context (false)
//   - cases 6-10:  generic templated queries lacking context (true + hint)
//   - cases 11-13: open-ended dynamic queries (true + hint), unchanged
//
// Phase 2a's Pass 1 is dual-mode: detects ambiguity for both templated
// context queries (newborn essentials with no baby age) and open-ended
// natural language (Disney trip, help!). Training Pass 1 on dual mode
// from day one means Phase 2b's dynamic context expansion ships without
// retraining the classifier.
//
// Usage:
//   ANTHROPIC_API_KEY=... node backend/scripts/pass1_ambiguity_smoke.js
//
// Cost: ~$0.02–$0.04 across 13 Haiku calls.
// Runtime: 10–25s total.

"use strict";

const { classifyIntent } = require("../ask");

const API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
if (!API_KEY) {
  console.error("ERROR: set ANTHROPIC_API_KEY (or CLAUDE_API_KEY) before running.");
  process.exit(1);
}

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const HAIKU_MODEL   = "claude-haiku-4-5-20251001";

// Inline callClaude wrapper that the classifyIntent function can use.
// Mirrors backend/server.js callClaude shape: JSON extraction + retry
// loop on rate-limit / overloaded responses, returns parsed JSON.
async function callClaude(system, userPrompt, maxTokens = 400, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
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
      if (!res.ok) {
        throw new Error(`Anthropic ${res.status}: ${await res.text().catch(() => "")}`);
      }
      const data = await res.json();
      const text = data.content.map(b => b.text || "").join("").trim();
      // Tolerant JSON extraction — accepts text with ```json fences.
      const first = text.indexOf("{");
      const last  = text.lastIndexOf("}");
      if (first === -1 || last === -1 || last <= first) {
        throw new Error("No JSON in Haiku response");
      }
      return JSON.parse(text.slice(first, last + 1));
    } catch (e) {
      clearTimeout(timeout);
      if (attempt === retries) throw e;
    }
  }
}

// ── Test cases ────────────────────────────────────────────────────
// Expected needs_refinement per query. Session 5.5 restructures into
// three groups: specific templated (false), generic templated (true),
// open-ended dynamic (true). Each templated context has a paired
// clear/ambiguous case so a regression in either direction surfaces.
const CASES = [
  // ── 1-5: Specific templated with sufficient context → FALSE ──
  {
    n: 1,
    query: "newborn essentials for my pregnant sister",
    expect_refinement: false,
    why: "Audience signal provided (pregnant sister)",
  },
  {
    n: 2,
    query: "back to school lunches for my 6 year old",
    expect_refinement: false,
    why: "Age signal provided (6 year old)",
  },
  {
    n: 3,
    query: "beach day with my husband",
    expect_refinement: false,
    why: "Audience signal provided (husband, adults only)",
  },
  {
    n: 4,
    query: "pantry restock for our family of 4",
    expect_refinement: false,
    why: "Household composition provided (family of 4)",
  },
  {
    n: 5,
    query: "road trip snacks for adults only",
    expect_refinement: false,
    why: "Audience signal provided (adults only)",
  },

  // ── 6-10: Generic templated lacking context → TRUE ──
  {
    n: 6,
    query: "newborn essentials",
    expect_refinement: true,
    why: "Audience unclear (expecting parent, current parent, or gift)",
    expect_reason_hints: ["audience", "parent", "gift", "expecting"],
  },
  {
    n: 7,
    query: "back to school lunches",
    expect_refinement: true,
    why: "Age range unclear (elementary, middle, high school)",
    expect_reason_hints: ["age", "grade", "school", "dietary"],
  },
  {
    n: 8,
    query: "beach day",
    expect_refinement: true,
    why: "Audience unclear (adults, kids, infants)",
    expect_reason_hints: ["audience", "kid", "adult", "infant", "family", "compos"],
  },
  {
    n: 9,
    query: "pantry restock",
    expect_refinement: true,
    why: "Household composition unclear (kids, adults, dietary restrictions)",
    expect_reason_hints: ["household", "compos", "kid", "adult", "dietary", "family"],
  },
  {
    n: 10,
    query: "road trip snacks",
    expect_refinement: true,
    why: "Audience and trip duration unclear",
    expect_reason_hints: ["audience", "duration", "trip", "kid", "adult"],
  },

  // ── 11-13: Open-ended dynamic queries → TRUE (unchanged from session 1) ──
  {
    n: 11,
    query: "I'm going to the pool with my kids today, what should I bring?",
    expect_refinement: true,
    why: "Kid ages unspecified, duration unclear (afternoon vs all day)",
    expect_reason_hints: ["age", "duration", "kid"],
  },
  {
    n: 12,
    query: "I'm packing for Disney, help!",
    expect_refinement: true,
    why: "Multiple plausible category sets, audience composition unclear, trip dates unclear",
    expect_reason_hints: ["date", "audience", "compos", "trip", "duration", "destination"],
  },
  {
    n: 13,
    query: "What's a good cleaner sunscreen?",
    expect_refinement: true,
    why: "Audience scope unclear — sunscreen recommendations differ materially by audience",
    expect_reason_hints: ["audience", "scope", "kid", "adult", "baby"],
  },
];

// ── Run ───────────────────────────────────────────────────────────
async function main() {
  console.log(`[pass1_ambiguity_smoke] running ${CASES.length} cases against ${HAIKU_MODEL}…`);
  console.log("");

  let pass = 0;
  let fail = 0;
  const results = [];

  for (const c of CASES) {
    process.stdout.write(`  case ${c.n}: ${JSON.stringify(c.query).slice(0, 80)}… `);
    const t0 = Date.now();
    let intent;
    let err;
    try {
      intent = await classifyIntent({ callClaude }, c.query);
    } catch (e) {
      err = e;
    }
    const dur = Date.now() - t0;

    if (err) {
      console.log(`ERROR (${dur}ms): ${err.message}`);
      fail++;
      results.push({ ...c, ok: false, err: err.message, dur });
      continue;
    }

    const gotRefinement = intent.needs_refinement === true;
    const refinementOK  = gotRefinement === c.expect_refinement;

    // For ambiguous queries also check that ambiguity_reason is set
    // and (when hints provided) contains at least one expected token.
    let reasonOK = true;
    let reasonNote = "";
    if (c.expect_refinement) {
      if (typeof intent.ambiguity_reason !== "string" || !intent.ambiguity_reason.trim()) {
        reasonOK = false;
        reasonNote = "ambiguity_reason missing";
      } else if (Array.isArray(c.expect_reason_hints) && c.expect_reason_hints.length > 0) {
        const r = intent.ambiguity_reason.toLowerCase();
        const hit = c.expect_reason_hints.some(h => r.includes(h.toLowerCase()));
        if (!hit) {
          reasonOK = false;
          reasonNote = `ambiguity_reason didn't reference any expected hint (${c.expect_reason_hints.join(" / ")})`;
        }
      }
    } else {
      // For non-ambiguous queries, reason should be null.
      if (intent.ambiguity_reason !== null) {
        reasonOK = false;
        reasonNote = `expected null ambiguity_reason but got: ${JSON.stringify(intent.ambiguity_reason)}`;
      }
    }

    // Phase 2b placeholders must always be null in Pass 1.
    let placeholdersOK = true;
    let placeholderNote = "";
    if (intent.decomposed_categories !== null) {
      placeholdersOK = false;
      placeholderNote = `decomposed_categories should be null, got ${JSON.stringify(intent.decomposed_categories)}`;
    } else if (intent.dynamic_pool_spec !== null) {
      placeholdersOK = false;
      placeholderNote = `dynamic_pool_spec should be null, got ${JSON.stringify(intent.dynamic_pool_spec)}`;
    }

    const ok = refinementOK && reasonOK && placeholdersOK;
    if (ok) {
      console.log(`PASS (${dur}ms, refinement=${gotRefinement})`);
      pass++;
    } else {
      const issues = [];
      if (!refinementOK) issues.push(`refinement expected=${c.expect_refinement} got=${gotRefinement}`);
      if (!reasonOK) issues.push(reasonNote);
      if (!placeholdersOK) issues.push(placeholderNote);
      console.log(`FAIL (${dur}ms): ${issues.join(" | ")}`);
      fail++;
    }

    results.push({
      ...c,
      ok,
      dur,
      gotRefinement,
      ambiguity_reason: intent.ambiguity_reason,
      type: intent.type,
      confidence: intent.confidence,
    });
  }

  console.log("");
  console.log(`[pass1_ambiguity_smoke] done: ${pass} pass, ${fail} fail`);
  if (fail > 0) {
    console.log("");
    console.log("Per-case detail (failures):");
    for (const r of results) {
      if (r.ok) continue;
      console.log(`  case ${r.n}: ${JSON.stringify(r.query)}`);
      console.log(`    expect refinement: ${r.expect_refinement}, got: ${r.gotRefinement}`);
      console.log(`    type: ${r.type}, confidence: ${r.confidence}`);
      console.log(`    ambiguity_reason: ${JSON.stringify(r.ambiguity_reason)}`);
      console.log(`    why test exists: ${r.why}`);
    }
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => {
  console.error("[pass1_ambiguity_smoke] fatal:", e?.stack || e?.message || e);
  process.exit(1);
});
