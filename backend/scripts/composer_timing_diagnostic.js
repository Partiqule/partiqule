#!/usr/bin/env node
// Composer timing diagnostic — Phase 2b session 5a (2026-05-27).
//
// Hits the production /ask endpoint with 50 queries, captures per-event
// timing on the SSE stream, aggregates into a markdown report. Run twice
// to capture cold (after cache-clear) and warm (cache primed) numbers.
//
// USAGE:
//   ADMIN_KEY=... node backend/scripts/composer_timing_diagnostic.js \
//     [--url https://partiqule-production.up.railway.app] \
//     [--cold] [--warm] [--limit 50] [--out docs/composer_baseline_<date>_pre.md]
//
// Flags:
//   --cold  : POST /cache-clear with ADMIN_KEY before running
//   --warm  : skip cache clear (default if neither flag given)
//   --limit : cap the query count (debugging / quick smokes)
//
// Output: a single markdown file at the specified --out path with:
//   - Summary stats (p50, p95, p99 per phase + total + first-item)
//   - Gate pass/fail (p95 first-item < 3s, p95 total < 8s, timeout < 2%)
//   - Top 10 slowest queries with full timing breakdown
//   - Comparison to May 19 session 3 baseline (7% timeout rate at 60s)

"use strict";

const fs = require("fs");
const path = require("path");

// Load backend/.env.local for ADMIN_KEY if present.
try {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
    }
  }
} catch { /* best effort */ }

function parseArgs(argv) {
  const out = {
    url: "https://partiqule-production.up.railway.app",
    cold: false,
    warm: false,
    limit: 50,
    out: null,
    timeoutMs: 60000, // generous — we WANT to measure 60s hangs
    delayMs: 4000,    // anon rate limit defends per-IP; throttle baseline runs
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url") out.url = argv[++i];
    else if (a === "--cold") out.cold = true;
    else if (a === "--warm") out.warm = true;
    else if (a === "--limit") out.limit = Number(argv[++i]) || 50;
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--timeout-ms") out.timeoutMs = Number(argv[++i]) || 60000;
    else if (a === "--delay-ms") out.delayMs = Number(argv[++i]);
  }
  if (!out.cold && !out.warm) out.warm = true; // default
  if (!out.out) {
    const today = new Date().toISOString().slice(0, 10);
    const suffix = out.cold ? "cold" : "warm";
    out.out = path.join(__dirname, "..", "..", "docs", `composer_baseline_${today}_${suffix}.md`);
  }
  return out;
}

// 50-query bank: ~30 from May 19 session 3 conceptual pool +
// 20 new covering knowledge_skip / multi-cat / pet (session 5a additions).
const QUERIES = [
  // ── Type 1 product ──
  { q: "best non-toxic sunscreen for adults", kind: "product" },
  { q: "best laundry detergent", kind: "product" },
  { q: "phthalate-free shampoo for my 6 year old", kind: "product" },
  { q: "best mineral sunscreen for babies", kind: "product" },
  { q: "GOTS certified baby clothing for my 18 month old", kind: "product" },
  // ── Type 2 knowledge (KNOWN entries should render; UNKNOWN should refuse) ──
  { q: "what is pfas", kind: "knowledge" },
  { q: "are phthalates a concern", kind: "knowledge" },
  { q: "what does GOTS certified mean", kind: "knowledge" },
  { q: "does sunscreen cause cancer", kind: "knowledge_skip" }, // unknown subject → skip
  { q: "what about microplastics", kind: "knowledge" },
  { q: "explain triclosan", kind: "knowledge_skip" },           // unknown → skip
  // ── Type 3 templated context (audience clear) ──
  { q: "newborn essentials for my pregnant sister", kind: "context_templated" },
  { q: "back to school lunches for my 6 year old", kind: "context_templated" },
  { q: "beach day with my husband", kind: "context_templated" },
  { q: "pantry restock for our family of 4", kind: "context_templated" },
  { q: "road trip snacks for adults only", kind: "context_templated" },
  // ── Type 3 templated context (ambiguous → fires refinement leg 1) ──
  { q: "newborn essentials", kind: "context_refine" },
  { q: "back to school lunches", kind: "context_refine" },
  { q: "beach day", kind: "context_refine" },
  // ── Type 3 dynamic context (audience clear) ──
  { q: "summer camp essentials for my 9 year old", kind: "context_dynamic" },
  { q: "post workout recovery for my husband", kind: "context_dynamic" },
  { q: "kids birthday party for my 6 year old", kind: "context_dynamic" },
  { q: "housewarming gift for a new parent", kind: "context_dynamic" },
  { q: "halloween candy for my 6 year old", kind: "context_dynamic" },
  { q: "weekend cabin trip for me and my wife", kind: "context_dynamic" },
  // ── Type 3 dynamic context (ambiguous → fires refinement leg 1) ──
  { q: "I'm packing for Disney, help!", kind: "context_refine" },
  { q: "what should I bring to the pool with my kids", kind: "context_refine" },
  { q: "halloween candy for the family", kind: "context_refine" },
  // ── Multi-category (post-hotfix should not misfire) ──
  { q: "MELT N' MOO Sea Salt Chocolate Chip Beef Protein Cookie", kind: "product" },
  { q: "Quest Protein Cookie Chocolate Chip", kind: "product" },
  // ── Pet (routes via override to other) ──
  { q: "blue buffalo dog food", kind: "pet" },
  { q: "best cat food brands", kind: "pet" },
  // ── New session 5a additions: 20 ──
  { q: "best cleaner sunscreen", kind: "context_refine" },
  { q: "first apartment essentials for me moving in alone", kind: "context_dynamic" },
  { q: "ground beef", kind: "product" },
  { q: "wild salmon", kind: "product" },
  { q: "lululemon align pants", kind: "product" },
  { q: "stanley tumbler 40oz", kind: "product" },
  { q: "tide laundry detergent", kind: "product" },
  { q: "is red 40 bad for kids", kind: "knowledge" },
  { q: "what is parabens", kind: "knowledge" },
  { q: "kitchen utensils set", kind: "product" },
  { q: "best cleaner laundry detergent for sensitive skin", kind: "product" },
  { q: "organic baby food", kind: "product" },
  { q: "best deodorant aluminum-free", kind: "product" },
  { q: "ski trip", kind: "context_templated" },
  { q: "baby first foods", kind: "context_templated" },
  { q: "toddler birthday", kind: "context_templated" },
  { q: "bug spray for camping", kind: "context_refine" },
  { q: "best electrolyte drinks", kind: "product" },
  { q: "what's a good prenatal", kind: "product" },
  { q: "shampoo bar zero waste", kind: "product" },
];

async function clearCache(baseUrl, adminKey) {
  console.log(`[diagnostic] clearing cache at ${baseUrl}/cache-clear ...`);
  try {
    const res = await fetch(`${baseUrl}/cache-clear`, {
      method: "GET",
      headers: { "x-admin-key": adminKey },
    });
    console.log(`[diagnostic] cache-clear status=${res.status}`);
  } catch (e) {
    console.warn(`[diagnostic] cache-clear failed: ${e.message}`);
  }
}

// Hits POST /ask with a query. Captures SSE event timestamps. Returns
// a per-query timing record. Times out after maxMs (default 60s).
async function timeQuery(baseUrl, query, maxMs) {
  const t0 = Date.now();
  const events = [];
  let firstItemMs = null;
  let status = "ok";
  let errMsg = null;
  let refuseReason = null;
  let totalMs = null;

  let controller = null;
  let timer = null;
  try {
    controller = new AbortController();
    timer = setTimeout(() => controller.abort(), maxMs);
    const res = await fetch(`${baseUrl}/ask`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) {
      clearTimeout(timer);
      return { query, status: "error", err: `HTTP ${res.status}`, total_ms: Date.now() - t0, events };
    }
    // Stream the SSE body. Events are separated by blank lines (\n\n).
    // Each event has lines like "event: NAME" + "data: JSON".
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      // Process complete events.
      const chunks = buf.split("\n\n");
      buf = chunks.pop() || "";
      for (const chunk of chunks) {
        const ms = Date.now() - t0;
        let evtName = null;
        let errPayload = null;
        for (const line of chunk.split("\n")) {
          if (line.startsWith("event: ")) evtName = line.slice(7).trim();
          if (line.startsWith("data: ")) {
            try {
              const payload = JSON.parse(line.slice(6));
              if (evtName === "refuse" && payload?.reason) refuseReason = payload.reason;
              if (evtName === "error") errPayload = payload;
            } catch {}
          }
        }
        if (!evtName) continue;
        events.push({ name: evtName, ms });
        if ((evtName === "bundle" || evtName === "item" || evtName === "knowledge") && firstItemMs == null) {
          firstItemMs = ms;
        }
        if (evtName === "refuse") status = "refused";
        if (evtName === "error") {
          // Distinguish rate_limit from genuine composer/system errors so
          // baseline reports don't conflate them.
          if (errPayload?.error === "rate_limit") status = "rate_limit";
          else status = "error";
          refuseReason = errPayload?.error || refuseReason;
        }
      }
    }
    clearTimeout(timer);
    totalMs = Date.now() - t0;
  } catch (e) {
    if (timer) clearTimeout(timer);
    if (e.name === "AbortError") {
      status = "timeout";
      totalMs = maxMs;
      errMsg = `client timeout at ${maxMs}ms`;
    } else {
      status = "error";
      totalMs = Date.now() - t0;
      errMsg = e.message;
    }
  }
  return {
    query, status, err: errMsg, refuse_reason: refuseReason,
    first_item_ms: firstItemMs, total_ms: totalMs, events,
  };
}

function percentile(arr, p) {
  if (!arr.length) return null;
  const sorted = arr.slice().sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function fmtMs(v) { return v == null ? "—" : `${v}ms`; }

function buildReport({ url, cold, warm, results, startedAt, finishedAt, delayMs }) {
  const total = results.length;
  const byStatus = { ok: 0, refused: 0, timeout: 0, error: 0, rate_limit: 0 };
  for (const r of results) byStatus[r.status] = (byStatus[r.status] || 0) + 1;

  // Only successful + refused responses have meaningful first_item / total
  // numbers. Timeouts and errors are flagged separately.
  const meaningful = results.filter(r => r.status === "ok" || r.status === "refused");
  const firstItems = meaningful.map(r => r.first_item_ms).filter(v => v != null);
  const totals = meaningful.map(r => r.total_ms).filter(v => v != null);

  const stats = {
    first_item: { p50: percentile(firstItems, 50), p95: percentile(firstItems, 95), p99: percentile(firstItems, 99) },
    total: { p50: percentile(totals, 50), p95: percentile(totals, 95), p99: percentile(totals, 99) },
  };
  const timeoutRate = total > 0 ? byStatus.timeout / total : 0;
  const gate = {
    p95_first_item_lt_3s: stats.first_item.p95 != null && stats.first_item.p95 < 3000,
    p95_total_lt_8s: stats.total.p95 != null && stats.total.p95 < 8000,
    timeout_rate_lt_2pct: timeoutRate < 0.02,
  };
  gate.all_pass = gate.p95_first_item_lt_3s && gate.p95_total_lt_8s && gate.timeout_rate_lt_2pct;

  // Top 10 slowest by total_ms (use Infinity for timeouts so they sort to top).
  const slowest = results.slice().sort((a, b) => {
    const av = a.status === "timeout" ? Infinity : (a.total_ms || 0);
    const bv = b.status === "timeout" ? Infinity : (b.total_ms || 0);
    return bv - av;
  }).slice(0, 10);

  const cacheState = cold ? "cold" : "warm";
  const lines = [];
  lines.push(`# Composer baseline — ${startedAt.slice(0, 10)} (${cacheState} cache)`);
  lines.push("");
  lines.push(`- Target: \`${url}\``);
  lines.push(`- Cache state: **${cacheState}** ${cold ? "(cleared before run)" : "(prior run primed cache)"}`);
  lines.push(`- Started: ${startedAt}`);
  lines.push(`- Finished: ${finishedAt}`);
  lines.push(`- Queries run: ${total}`);
  lines.push("");
  lines.push("## Status breakdown");
  lines.push("");
  lines.push("| Status | Count | % |");
  lines.push("| --- | ---: | ---: |");
  for (const s of ["ok", "refused", "timeout", "rate_limit", "error"]) {
    const pct = total > 0 ? ((byStatus[s] || 0) / total * 100).toFixed(1) : "0.0";
    lines.push(`| ${s} | ${byStatus[s] || 0} | ${pct}% |`);
  }
  if (byStatus.rate_limit > 0) {
    lines.push("");
    lines.push(`> Note: ${byStatus.rate_limit} rate_limit responses. The /ask endpoint applies an anon-IP`);
    lines.push(`> throttle. Excluded from latency stats; re-run with a larger \`--delay-ms\` (currently ${delayMs}ms).`);
  }
  lines.push("");
  lines.push("## Latency percentiles (ok + refused only)");
  lines.push("");
  lines.push("| Metric | p50 | p95 | p99 |");
  lines.push("| --- | ---: | ---: | ---: |");
  lines.push(`| first_item_ms | ${fmtMs(stats.first_item.p50)} | ${fmtMs(stats.first_item.p95)} | ${fmtMs(stats.first_item.p99)} |`);
  lines.push(`| total_ms | ${fmtMs(stats.total.p50)} | ${fmtMs(stats.total.p95)} | ${fmtMs(stats.total.p99)} |`);
  lines.push("");
  lines.push("## Launch gate");
  lines.push("");
  lines.push("| Metric | Threshold | Actual | Pass |");
  lines.push("| --- | --- | --- | --- |");
  lines.push(`| p95 first_item | < 3000ms | ${fmtMs(stats.first_item.p95)} | ${gate.p95_first_item_lt_3s ? "✅" : "❌"} |`);
  lines.push(`| p95 total | < 8000ms | ${fmtMs(stats.total.p95)} | ${gate.p95_total_lt_8s ? "✅" : "❌"} |`);
  lines.push(`| timeout rate | < 2% | ${(timeoutRate * 100).toFixed(1)}% | ${gate.timeout_rate_lt_2pct ? "✅" : "❌"} |`);
  lines.push(`| **all_pass** | | | ${gate.all_pass ? "**✅**" : "**❌**"} |`);
  lines.push("");
  lines.push("## Top 10 slowest");
  lines.push("");
  lines.push("| Rank | Status | first_item | total | Query |");
  lines.push("| ---: | --- | ---: | ---: | --- |");
  slowest.forEach((r, i) => {
    const total = r.status === "timeout" ? "TIMEOUT" : fmtMs(r.total_ms);
    const fi = r.first_item_ms == null ? "—" : `${r.first_item_ms}ms`;
    const q = r.query.replace(/\|/g, "\\|");
    lines.push(`| ${i + 1} | ${r.status}${r.refuse_reason ? `:${r.refuse_reason}` : ""} | ${fi} | ${total} | ${q} |`);
  });
  lines.push("");
  lines.push("## Comparison to May 19 session 3 baseline");
  lines.push("");
  lines.push("- May 19 reported rate: **7% of queries hanging past 60s**");
  lines.push(`- This run: **${(timeoutRate * 100).toFixed(1)}%** at the configured client timeout`);
  lines.push("");
  lines.push("Note: session 4 (Path A leg 2 + Knowledge SKIP) + category classifier hotfix");
  lines.push("shipped since May 19. Any improvement reflects both architectural changes and");
  lines.push("any Anthropic latency drift since the original measurement.");
  lines.push("");
  lines.push("## Per-query detail");
  lines.push("");
  lines.push("| Status | Refuse | first_item | total | Query |");
  lines.push("| --- | --- | ---: | ---: | --- |");
  for (const r of results) {
    const total = r.status === "timeout" ? "TIMEOUT" : fmtMs(r.total_ms);
    const fi = r.first_item_ms == null ? "—" : `${r.first_item_ms}ms`;
    const q = r.query.replace(/\|/g, "\\|");
    lines.push(`| ${r.status} | ${r.refuse_reason || "—"} | ${fi} | ${total} | ${q} |`);
  }
  lines.push("");
  return lines.join("\n");
}

(async () => {
  const args = parseArgs(process.argv);
  const adminKey = process.env.ADMIN_KEY;
  if (args.cold && !adminKey) {
    console.error("--cold requires ADMIN_KEY in env");
    process.exit(1);
  }
  if (args.cold) await clearCache(args.url, adminKey);

  const queries = QUERIES.slice(0, args.limit);
  console.log(`[diagnostic] running ${queries.length} queries against ${args.url}`);
  console.log(`[diagnostic] client timeout: ${args.timeoutMs}ms per query`);

  const startedAt = new Date().toISOString();
  const results = [];
  for (let i = 0; i < queries.length; i++) {
    const { q } = queries[i];
    if (i > 0 && args.delayMs > 0) await new Promise(r => setTimeout(r, args.delayMs));
    process.stdout.write(`  [${i + 1}/${queries.length}] "${q.slice(0, 50)}"… `);
    const r = await timeQuery(args.url, q, args.timeoutMs);
    results.push(r);
    const status = r.status === "ok" ? `OK ${r.total_ms}ms (first ${r.first_item_ms}ms)` :
                   r.status === "refused" ? `REFUSED:${r.refuse_reason || "?"} ${r.total_ms}ms` :
                   r.status === "timeout" ? `TIMEOUT @ ${args.timeoutMs}ms` :
                   r.status === "rate_limit" ? `RATE_LIMIT` :
                   `ERROR ${r.err}`;
    console.log(status);
  }
  const finishedAt = new Date().toISOString();

  const report = buildReport({ url: args.url, cold: args.cold, warm: args.warm, results, startedAt, finishedAt, delayMs: args.delayMs });
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, report, "utf8");
  console.log(`\n[diagnostic] wrote ${args.out}`);
})().catch(e => { console.error(e?.stack || e); process.exit(1); });
