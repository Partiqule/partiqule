#!/usr/bin/env node
// Phase 2b session 3 stress test runner (Commit A).
//
// Drives the 53-query bank against the production Ask endpoint,
// captures per-query diagnostic trail, and writes structured output
// that the Part 4 analysis script (deferred to Commit B) consumes.
//
// Tonight's deliverable: runner CODE only. Do not actually run
// against production until Paul confirms. The --dry-run flag lets
// you verify wiring without firing real requests.
//
// USAGE:
//   # Dry-run a single query — verifies wiring without burning spend
//   node backend/scripts/phase2b_stress_test_runner.js --dry-run --query-id=kf04
//
//   # Dry-run the entire bank (lists what would fire, no requests)
//   node backend/scripts/phase2b_stress_test_runner.js --dry-run
//
//   # Real run, anonymous mode, single query
//   node backend/scripts/phase2b_stress_test_runner.js --mode=anonymous --query-id=kf04
//
//   # Full run, anonymous mode (20 queries — synthetic clean session)
//   node backend/scripts/phase2b_stress_test_runner.js --mode=anonymous
//
//   # Full run, authed mode (30 queries — Paul's account with scans)
//   PARTIQULE_USER_JWT=ey... node backend/scripts/phase2b_stress_test_runner.js --mode=authed
//
// ENVIRONMENT:
//   PARTIQULE_USER_JWT          — Supabase session JWT for authed mode
//   SUPABASE_SERVICE_ROLE_KEY   — for reading audit log rows
//   SUPABASE_URL                — optional, defaults to production
//   API_BASE                    — optional, defaults to Railway prod
//
// OUTPUT:
//   docs/phase2b_stress_test_results_YYYY-MM-DD.json — per-query
//     full trail (timing, SSE events, audit log row). Part 4
//     analysis script reads this file to produce the markdown report.
//
// PACING & GUARDS:
//   - 1 request per 3 seconds (~3min for 53 queries; ~7min if half
//     fire refinement which doubles the request count).
//   - Per-query timeout 60 seconds (refinement + composer worst case).
//   - Total Anthropic spend estimate: ~$5 across the full bank.
//   - Aborts if any single query exceeds 90 seconds or runs >120s
//     elapsed since prior request (probable hang).

"use strict";

const fs = require("fs");
const path = require("path");

const { QUERIES, summarize } = require("./phase2b_stress_test_queries");

// ── Configuration ───────────────────────────────────────────────
const DEFAULT_API_BASE = "https://partiqule-production.up.railway.app";
const DEFAULT_SUPABASE_URL = "https://hciyibnoipqvspmrflzh.supabase.co";
const PACING_DELAY_MS = 3000;
const QUERY_TIMEOUT_MS = 60000;
const HANG_THRESHOLD_MS = 120000;

// ── CLI args ────────────────────────────────────────────────────
function parseArgs() {
  const out = { dryRun: false, mode: "anonymous", queryId: null };
  for (const a of process.argv.slice(2)) {
    if (a === "--dry-run") out.dryRun = true;
    else if (a.startsWith("--mode=")) out.mode = a.slice("--mode=".length);
    else if (a.startsWith("--query-id=")) out.queryId = a.slice("--query-id=".length);
    else if (a === "--help" || a === "-h") {
      console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(0, 35).join("\n"));
      process.exit(0);
    }
  }
  if (!["anonymous", "authed"].includes(out.mode)) {
    console.error(`Invalid --mode=${out.mode}; expected 'anonymous' or 'authed'`);
    process.exit(1);
  }
  return out;
}

// ── Query selection ─────────────────────────────────────────────
// Anonymous mode: run 20 queries — synthetic clean session.
// Authed mode: run 30 queries — leverages scan history for moat.
// Targeted (--query-id=X): single query.
function selectQueries(args) {
  if (args.queryId) {
    const q = QUERIES.find(q => q.id === args.queryId);
    if (!q) { console.error(`No query with id=${args.queryId}`); process.exit(1); }
    return [q];
  }
  // Mode-based selection. Anonymous gets a diverse but smaller slice;
  // authed gets a larger slice that includes queries where moat-layer
  // is meaningful (refinement triggers, multi-category, gifting).
  if (args.mode === "anonymous") {
    // 20 queries — coverage of all audiences + refinement + edge cases.
    const ids = [
      "kf01", "kf02", "kf04", "kf07", "kf10",       // 5 kid (incl. anchor)
      "if02", "if04", "if05",                        // 3 infant
      "fk01", "fk05", "fk10",                        // 3 family (incl. anchor)
      "af01", "af04", "af08",                        // 3 adult
      "pt02", "pt04",                                // 2 pet
      "pg01",                                        // 1 pregnancy
      "vg01",                                        // 1 vague (anchor)
      "amb01", "oov01",                              // 2 directed probes
    ];
    return ids.map(id => QUERIES.find(q => q.id === id)).filter(Boolean);
  }
  // Authed mode: 30 queries — broader coverage, more refinement
  // for moat exercise, more out_of_vocab to test backfill priority.
  const ids = [
    "kf01", "kf03", "kf04", "kf06", "kf07", "kf09",     // 6 kid
    "if03", "if04", "if05",                              // 3 infant
    "fk01", "fk02", "fk05", "fk06",                      // 4 family
    "af01", "af03", "af04", "af07",                      // 4 adult
    "pt01", "pt02", "pt03",                              // 3 pet
    "pg01", "pg03",                                      // 2 pregnancy
    "gf01", "gf02", "gf03",                              // 3 gifting
    "kn01", "vg01",                                      // 2 knowledge/vague
    "amb02", "amb04", "cv01",                            // 3 directed
  ];
  return ids.map(id => QUERIES.find(q => q.id === id)).filter(Boolean);
}

// ── SSE stream parser (mirrors backend ask.js shape) ─────────────
async function streamAsk({ apiBase, path, headers, body, signal, onEvent }) {
  const res = await fetch(`${apiBase}${path}`, {
    method: "POST", signal, headers,
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    onEvent("error", { error: "http", status: res.status });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (!raw.trim()) continue;
      let event = "message";
      const dataLines = [];
      for (const line of raw.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      let payload = {};
      if (dataLines.length) {
        try { payload = JSON.parse(dataLines.join("\n")); } catch {}
      }
      onEvent(event, payload);
    }
  }
}

// ── Synthetic refinement answer picker ──────────────────────────
// Maps the bank's synthetic_answers spec onto the actual questions
// Pass 1.5 emits at runtime. Two modes:
//   - { default: "first" }: pick first suggested_option per question
//   - { questions: [{ match: regex, value }] }: per-question matchers
function pickSyntheticAnswers(syntheticSpec, questions) {
  const answers = [];
  for (const q of questions) {
    let value = null;
    if (syntheticSpec?.questions?.length) {
      const matcher = syntheticSpec.questions.find(m =>
        m.match.test(q.id) || m.match.test(q.text || "")
      );
      if (matcher) value = matcher.value;
    }
    if (!value && syntheticSpec?.default === "first") {
      value = (q.suggested_options || [])[0] || null;
    }
    if (value) answers.push({ question_id: q.id, value });
  }
  return answers;
}

// ── Audit log fetch (Supabase REST) ─────────────────────────────
// Reads the most recent ask_responses row matching the query text,
// constrained to the current run window. Without service role key,
// returns null — runner continues without audit data.
async function fetchAuditRow({ supabaseUrl, serviceKey, query, sinceMs }) {
  if (!serviceKey) return null;
  try {
    const since = new Date(sinceMs).toISOString();
    const url = `${supabaseUrl}/rest/v1/ask_responses?query=eq.${encodeURIComponent(query)}&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=1`;
    const res = await fetch(url, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });
    if (!res.ok) return { fetch_error: `http ${res.status}` };
    const rows = await res.json();
    return rows[0] || { fetch_error: "no row matched" };
  } catch (e) {
    return { fetch_error: e.message };
  }
}

// ── Per-query runner ────────────────────────────────────────────
async function runOne(queryEntry, ctx) {
  const { apiBase, authHeader, supabaseUrl, serviceKey, dryRun } = ctx;
  const queryStart = Date.now();
  const result = {
    id: queryEntry.id,
    query: queryEntry.query,
    bank_tags: {
      audience: queryEntry.audience_tag,
      occasion: queryEntry.occasion_tag,
      specificity: queryEntry.specificity,
      coverage: queryEntry.coverage_expectation,
      type: queryEntry.query_type,
      expects_refinement: !!queryEntry.expects_refinement,
      regression_anchor: !!queryEntry.regression_anchor,
    },
    leg1: null,
    leg2: null,
    total_latency_ms: null,
    audit_row: null,
    error: null,
  };

  if (dryRun) {
    console.log(`[dry-run] would POST /ask query="${queryEntry.query}"${authHeader ? " (authed)" : ""}`);
    if (queryEntry.expects_refinement) {
      console.log(`[dry-run]   then would POST /ask/refinement_answer with synthetic=${JSON.stringify(queryEntry.synthetic_answers || { default: "first" })}`);
    }
    result.total_latency_ms = 0;
    result.dry_run = true;
    return result;
  }

  const baseHeaders = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    "X-Stress-Test": "phase2b-session3",
  };
  if (authHeader) baseHeaders.Authorization = authHeader;

  // ── Leg 1: POST /ask ──
  const leg1Events = [];
  const leg1Start = Date.now();
  const leg1Controller = new AbortController();
  const leg1Timer = setTimeout(() => leg1Controller.abort(), QUERY_TIMEOUT_MS);
  try {
    await streamAsk({
      apiBase, path: "/ask", headers: baseHeaders,
      body: { query: queryEntry.query },
      signal: leg1Controller.signal,
      onEvent: (event, payload) => leg1Events.push({ event, payload, at_ms: Date.now() - leg1Start }),
    });
  } catch (e) {
    if (e.name !== "AbortError") result.error = `leg1: ${e.message}`;
    else result.error = `leg1: timeout after ${QUERY_TIMEOUT_MS}ms`;
  } finally {
    clearTimeout(leg1Timer);
  }
  result.leg1 = {
    events: leg1Events,
    latency_ms: Date.now() - leg1Start,
    event_summary: leg1Events.map(e => e.event).join(","),
  };

  // ── Leg 2: POST /ask/refinement_answer (if refinement fired) ──
  const refinementEvt = leg1Events.find(e => e.event === "refinement_question");
  if (refinementEvt && refinementEvt.payload?.conversation_id) {
    const conversationId = refinementEvt.payload.conversation_id;
    const questions = refinementEvt.payload.questions || [];
    const answers = pickSyntheticAnswers(
      queryEntry.synthetic_answers || { default: "first" },
      questions,
    );
    const leg2Events = [];
    const leg2Start = Date.now();
    const leg2Controller = new AbortController();
    const leg2Timer = setTimeout(() => leg2Controller.abort(), QUERY_TIMEOUT_MS);
    try {
      await streamAsk({
        apiBase, path: "/ask/refinement_answer", headers: baseHeaders,
        body: { conversation_id: conversationId, answers, skipped: [] },
        signal: leg2Controller.signal,
        onEvent: (event, payload) => leg2Events.push({ event, payload, at_ms: Date.now() - leg2Start }),
      });
    } catch (e) {
      if (e.name !== "AbortError") result.error = `${result.error ? result.error + "; " : ""}leg2: ${e.message}`;
      else result.error = `${result.error ? result.error + "; " : ""}leg2: timeout`;
    } finally {
      clearTimeout(leg2Timer);
    }
    result.leg2 = {
      conversation_id: conversationId,
      answers_submitted: answers,
      events: leg2Events,
      latency_ms: Date.now() - leg2Start,
      event_summary: leg2Events.map(e => e.event).join(","),
    };
  }

  result.total_latency_ms = Date.now() - queryStart;

  // ── Audit log fetch (uses the leg that wrote the final row) ──
  // Both /ask (no refinement) and /ask/refinement_answer (refinement
  // flow) write audit rows. The most recent matching row wins.
  result.audit_row = await fetchAuditRow({
    supabaseUrl, serviceKey,
    query: queryEntry.query,
    sinceMs: queryStart - 1000,
  });

  return result;
}

// ── Main ────────────────────────────────────────────────────────
(async () => {
  const args = parseArgs();
  const apiBase = process.env.API_BASE || DEFAULT_API_BASE;
  const supabaseUrl = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || null;
  const userJwt = process.env.PARTIQULE_USER_JWT || null;

  if (args.mode === "authed" && !args.dryRun && !userJwt) {
    console.error("authed mode requires PARTIQULE_USER_JWT env var");
    process.exit(1);
  }
  if (!args.dryRun && !serviceKey) {
    console.warn("warning: SUPABASE_SERVICE_ROLE_KEY not set — audit log rows will be skipped");
  }

  const queries = selectQueries(args);
  console.log(`[stress test] mode=${args.mode} queries=${queries.length} apiBase=${apiBase}${args.dryRun ? " DRY-RUN" : ""}`);
  console.log(`[stress test] bank summary: ${JSON.stringify(summarize(queries))}`);
  console.log("");

  const authHeader = args.mode === "authed" && userJwt ? `Bearer ${userJwt}` : null;
  const ctx = { apiBase, authHeader, supabaseUrl, serviceKey, dryRun: args.dryRun };

  const results = [];
  const runStart = Date.now();
  let lastQueryEnd = Date.now();

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    const sinceLast = Date.now() - lastQueryEnd;
    if (sinceLast > HANG_THRESHOLD_MS && i > 0) {
      console.error(`[stress test] aborting: ${sinceLast}ms since last query end exceeds hang threshold ${HANG_THRESHOLD_MS}ms`);
      break;
    }
    if (i > 0 && !args.dryRun) {
      const waitMs = Math.max(0, PACING_DELAY_MS - (Date.now() - lastQueryEnd));
      if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));
    }
    console.log(`[${(i + 1).toString().padStart(2)}/${queries.length}] ${q.id}: ${q.query}`);
    const out = await runOne(q, ctx);
    const tags = `audience=${q.audience_tag} spec=${q.specificity} cov=${q.coverage_expectation}`;
    const outcome = out.error
      ? `ERROR(${out.error})`
      : (out.leg2
          ? `leg1+leg2 ${out.total_latency_ms}ms events=${out.leg1.event_summary}|${out.leg2.event_summary}`
          : `leg1 ${out.total_latency_ms}ms events=${out.leg1?.event_summary || "n/a"}`);
    console.log(`         ${tags}\n         ${outcome}`);
    results.push(out);
    lastQueryEnd = Date.now();
  }

  // ── Write output ──
  if (!args.dryRun) {
    const outDir = path.resolve(__dirname, "../../docs");
    fs.mkdirSync(outDir, { recursive: true });
    const today = new Date().toISOString().slice(0, 10);
    const outFile = path.join(outDir, `phase2b_stress_test_results_${today}_${args.mode}.json`);
    fs.writeFileSync(outFile, JSON.stringify({
      run_meta: {
        mode: args.mode, started_at: new Date(runStart).toISOString(),
        finished_at: new Date().toISOString(),
        elapsed_ms: Date.now() - runStart,
        query_count: queries.length, apiBase,
        bank_summary: summarize(queries),
      },
      results,
    }, null, 2));
    console.log(`\nResults written: ${outFile}`);
  }

  const elapsed = ((Date.now() - runStart) / 1000).toFixed(1);
  const errors = results.filter(r => r.error).length;
  console.log(`\n[stress test] done in ${elapsed}s — ${results.length} queries, ${errors} errors`);
  process.exit(errors > 0 && !args.dryRun ? 1 : 0);
})().catch(e => {
  console.error("[stress test] fatal:", e?.stack || e?.message || e);
  process.exit(1);
});
