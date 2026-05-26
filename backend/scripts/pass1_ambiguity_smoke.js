#!/usr/bin/env node
// Pass 1 ambiguity-detection smoke (Phase 2a sessions 1 + 5.5,
// extended in Phase 2b session 1).
//
// Calls the Pass 1 classifyIntent function on 20 test queries and
// verifies that needs_refinement matches the expectation per query.
// Phase 2b session 1 extends Pass 1 to populate decomposed_categories
// and dynamic_pool_spec for open-ended queries with sufficient audience
// context (cases 14-20). Templated and ambiguous queries still null
// both fields.
//
// Layout:
//   - cases 1-5:   specific templated queries with context (false)
//   - cases 6-10:  generic templated queries lacking context (true + hint)
//   - cases 11-13: open-ended dynamic queries needing refinement (true + hint)
//   - cases 14-20: open-ended dynamic queries with audience context (false +
//                  populated decomposed_categories + dynamic_pool_spec)
//
// Usage:
//   ANTHROPIC_API_KEY=... node backend/scripts/pass1_ambiguity_smoke.js
//
// Cost: ~$0.04–$0.06 across 20 Haiku calls.
// Runtime: 15–35s total.

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

  // ── 11-13: Open-ended dynamic queries needing refinement → TRUE ──
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

  // ── 14-20: Phase 2b dynamic context expansion — open-ended with
  //          sufficient audience context → FALSE + populated fields ──
  // Vocabulary constraint: decomposed_categories must only contain
  // values from VIABLE_SLUGS below (15-slug set from the audit).
  {
    n: 14,
    query: "packing for our family Disney trip in July",
    expect_refinement: false,
    expect_dynamic_populated: true,
    expect_decomposed_includes_any: ["sunscreen", "snacks", "hydration", "personal_care_kids"],
    expect_audience_in: ["family_with_kids"],
    why: "Open-ended; family + warm-weather travel; audience clear",
  },
  {
    n: 15,
    query: "kids birthday party for my 6 year old",
    expect_refinement: false,
    expect_dynamic_populated: true,
    expect_decomposed_includes_any: ["party_food", "party_beverages", "snacks"],
    expect_audience_in: ["kid_focused"],
    why: "Open-ended; kid-focused birthday party; party_favors/gift_bags omitted (thin coverage)",
  },
  {
    n: 16,
    query: "weekend cabin trip for me and my wife",
    expect_refinement: false,
    expect_dynamic_populated: true,
    expect_decomposed_includes_any: ["snacks", "beverages", "sunscreen"],
    expect_audience_in: ["adult_focused", "family_adults_only"],
    why: "Open-ended; adults-only camping; bug_spray omitted (thin coverage)",
  },
  {
    n: 17,
    // Audience signal needed — "first apartment essentials" alone is
    // audience-ambiguous (solo adult vs couple vs roommates vs family),
    // so Pass 1 correctly fires refinement. Adding "for me, single
    // adult" routes to Step 3 with adult_focused.
    query: "first apartment essentials for me, moving in alone",
    expect_refinement: false,
    expect_dynamic_populated: true,
    expect_decomposed_includes_any: ["cleaning_supplies", "bathroom_essentials", "kitchen_basics", "bedding"],
    expect_audience_in: ["adult_focused"],
    why: "Open-ended; adult-focused setup; all slugs viable",
  },
  {
    n: 18,
    query: "housewarming gift for a new parent",
    expect_refinement: false,
    expect_dynamic_populated: true,
    expect_decomposed_includes_any: ["baby_gifts", "household_gifts"],
    expect_audience_in: ["family_with_kids", "infant_focused"],
    why: "Open-ended; gift for new parent (family_with_kids implied); both slugs viable",
  },
  {
    n: 19,
    query: "summer camp essentials for my 9 year old",
    expect_refinement: false,
    expect_dynamic_populated: true,
    expect_decomposed_includes_any: ["sunscreen", "snacks", "hydration", "personal_care_kids"],
    expect_audience_in: ["kid_focused"],
    why: "Open-ended; kid-focused outdoor; bug_spray omitted (thin coverage)",
  },
  {
    n: 20,
    query: "post workout recovery for my husband",
    expect_refinement: false,
    expect_dynamic_populated: true,
    expect_decomposed_includes_any: ["supplements", "hydration"],
    expect_audience_in: ["adult_focused"],
    why: "Open-ended; adult-focused; protein_snacks subsumed into supplements/snacks (thin)",
  },

  // ── 21-25: Knowledge classification + borderline discriminators
  //          (session 4). Verifies Pass 1 routes definitional/risk-
  //          assessment questions to type="knowledge" AND routes
  //          shopping queries that name the same substance to product
  //          or context, not knowledge.
  {
    n: 21,
    query: "what is pfas",
    expect_refinement: false,
    expect_type: "knowledge",
    why: "Definitional knowledge query — bare 'what is X'",
  },
  {
    n: 22,
    query: "are phthalates a concern",
    expect_refinement: false,
    expect_type: "knowledge",
    why: "Risk-assessment knowledge query — 'are X bad/concerning'",
  },
  {
    n: 23,
    query: "does sunscreen cause cancer",
    expect_refinement: false,
    expect_type: "knowledge",
    why: "Risk-assessment knowledge query — 'does X cause Y'",
  },
  {
    n: 24,
    // PRIMARY assertion: type discrimination (phthalates appears in the
    // query but the user is shopping, not asking what phthalates are).
    // refinement gating is orthogonal here — "kids" plural without
    // specific age may still legitimately fire refinement under the
    // existing audience-is-the-gate rule; don't assert on it.
    query: "phthalate-free shampoo for my 6 year old",
    expect_refinement: false,
    expect_type_not: "knowledge",
    why: "Shopping query with phthalates as exclusion criterion + specific age — must NOT route knowledge",
  },
  {
    n: 25,
    query: "GOTS certified baby clothing for my 18 month old",
    expect_refinement: false,
    expect_type_not: "knowledge",
    why: "Shopping query naming GOTS as constraint + specific age — must NOT route knowledge",
  },
];

// Viable slugs vocabulary — Pass 1 must only emit values from this
// list in decomposed_categories. From docs/calibration_coverage_audit_phase2b.md.
const VIABLE_SLUGS = new Set([
  "baby_gifts", "beverages", "kitchen_basics", "snacks", "cleaning_supplies",
  "bathroom_essentials", "personal_care_kids", "hydration", "supplements",
  "party_beverages", "sunscreen", "pet_food", "party_food", "household_gifts",
  "bedding",
]);

const VIABLE_AUDIENCES = new Set([
  "family_with_kids", "family_adults_only", "kid_focused",
  "adult_focused", "infant_focused", "pet_focused",
]);

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

    // Phase 2b fields. For cases 14-20 these MUST be populated and
    // conform to the viable-vocabulary + audience-enum constraints.
    // For all other cases they MUST stay null.
    let dynamicOK = true;
    let dynamicNote = "";
    if (c.expect_dynamic_populated) {
      const dc = intent.decomposed_categories;
      const ps = intent.dynamic_pool_spec;
      if (!Array.isArray(dc) || dc.length === 0) {
        dynamicOK = false;
        dynamicNote = `decomposed_categories should be a non-empty array, got ${JSON.stringify(dc)}`;
      } else {
        const offenders = dc.filter(s => typeof s !== "string" || !VIABLE_SLUGS.has(s));
        if (offenders.length) {
          dynamicOK = false;
          dynamicNote = `decomposed_categories contains values outside viable vocabulary: ${JSON.stringify(offenders)}`;
        } else if (Array.isArray(c.expect_decomposed_includes_any)) {
          const hit = c.expect_decomposed_includes_any.some(s => dc.includes(s));
          if (!hit) {
            dynamicOK = false;
            dynamicNote = `decomposed_categories ${JSON.stringify(dc)} included none of expected ${JSON.stringify(c.expect_decomposed_includes_any)}`;
          }
        }
      }
      if (dynamicOK) {
        if (!ps || typeof ps !== "object") {
          dynamicOK = false;
          dynamicNote = `dynamic_pool_spec should be an object, got ${JSON.stringify(ps)}`;
        } else if (typeof ps.audience !== "string" || !VIABLE_AUDIENCES.has(ps.audience)) {
          dynamicOK = false;
          dynamicNote = `dynamic_pool_spec.audience invalid: ${JSON.stringify(ps.audience)}`;
        } else if (typeof ps.occasion_proxy !== "string" || !ps.occasion_proxy.trim()) {
          dynamicOK = false;
          dynamicNote = `dynamic_pool_spec.occasion_proxy missing or empty`;
        } else if (Array.isArray(c.expect_audience_in) && !c.expect_audience_in.includes(ps.audience)) {
          dynamicOK = false;
          dynamicNote = `dynamic_pool_spec.audience=${ps.audience} not in expected ${JSON.stringify(c.expect_audience_in)}`;
        }
      }
      if (dynamicOK && intent.context_id) {
        dynamicOK = false;
        dynamicNote = `context_id should be null for dynamic-context cases, got ${JSON.stringify(intent.context_id)}`;
      }
    } else {
      // Non-dynamic cases (1-13): both fields must be null.
      if (intent.decomposed_categories !== null) {
        dynamicOK = false;
        dynamicNote = `decomposed_categories should be null, got ${JSON.stringify(intent.decomposed_categories)}`;
      } else if (intent.dynamic_pool_spec !== null) {
        dynamicOK = false;
        dynamicNote = `dynamic_pool_spec should be null, got ${JSON.stringify(intent.dynamic_pool_spec)}`;
      }
    }

    // Session 4 — knowledge classification checks (cases 21-25).
    // Either expect_type (must equal) or expect_type_not (must NOT equal).
    let typeOK = true;
    let typeNote = "";
    if (c.expect_type) {
      if (intent.type !== c.expect_type) {
        typeOK = false;
        typeNote = `type expected=${c.expect_type} got=${intent.type}`;
      }
    }
    if (c.expect_type_not) {
      if (intent.type === c.expect_type_not) {
        typeOK = false;
        typeNote = `type should NOT be ${c.expect_type_not} but got ${intent.type}`;
      }
    }

    const ok = refinementOK && reasonOK && dynamicOK && typeOK;
    if (ok) {
      console.log(`PASS (${dur}ms, refinement=${gotRefinement}, type=${intent.type})`);
      pass++;
    } else {
      const issues = [];
      if (!refinementOK) issues.push(`refinement expected=${c.expect_refinement} got=${gotRefinement}`);
      if (!reasonOK) issues.push(reasonNote);
      if (!dynamicOK) issues.push(dynamicNote);
      if (!typeOK) issues.push(typeNote);
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
