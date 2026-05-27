#!/usr/bin/env node
// Composer hard-timeout + timing telemetry unit smoke (session 5a).
//
// Pure unit test of the timing helpers + withHardTimeout. No API calls.
// Run:
//   node backend/scripts/composer_timeout_unit_smoke.js

"use strict";

const {
  createTimingContext, recordFirstItem, setQueryType, setActivePhase,
  finalize, flushTiming, wrapSseForTiming, withHardTimeout, TimeoutError,
} = require("../askTiming");

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push({ label, detail }); console.log(`  ✗ ${label}${detail ? `: ${detail}` : ""}`); }
}

console.log("\n[1] createTimingContext shape");
{
  const t = createTimingContext({ requestId: "abc123", requestStartMs: 1000, queryType: "context", userId: "u1" });
  check("request_id", t.request_id === "abc123");
  check("query_type", t.query_type === "context");
  check("user_id", t.user_id === "u1");
  check("cache_hits starts at 0", t.cache_hits === 0);
  check("cache_misses starts at 0", t.cache_misses === 0);
  check("first_item_ms starts null", t.first_item_ms === null);
  check("status starts null", t.status === null);
}

console.log("\n[2] recordFirstItem is idempotent");
{
  const t = createTimingContext({ requestId: "x", requestStartMs: Date.now() - 100 });
  recordFirstItem(t);
  const first = t.first_item_ms;
  check("first_item_ms set", typeof first === "number" && first >= 100);
  // Sleep briefly then call again.
  const start = Date.now();
  while (Date.now() - start < 10) { /* spin */ }
  recordFirstItem(t);
  check("second call did NOT overwrite", t.first_item_ms === first);
}

console.log("\n[3] wrapSseForTiming records first_item on bundle/item/knowledge only");
{
  // Test bundle.
  let t = createTimingContext({ requestId: "x", requestStartMs: Date.now() - 50 });
  let emitted = [];
  const raw = { emit: (n, p) => emitted.push({ n, p }), end: () => {} };
  let wrapped = wrapSseForTiming(raw, t);
  wrapped.emit("thinking", {});
  wrapped.emit("intent_classified", {});
  wrapped.emit("composer_thinking", {});
  check("first_item_ms still null after non-payload events", t.first_item_ms === null);
  wrapped.emit("bundle", { sections: [] });
  check("first_item_ms set on bundle", typeof t.first_item_ms === "number" && t.first_item_ms >= 50);

  // Test item.
  t = createTimingContext({ requestId: "y", requestStartMs: Date.now() - 50 });
  emitted = [];
  wrapped = wrapSseForTiming(raw, t);
  wrapped.emit("item", {});
  check("first_item_ms set on item", typeof t.first_item_ms === "number");

  // Test knowledge.
  t = createTimingContext({ requestId: "z", requestStartMs: Date.now() - 50 });
  wrapped = wrapSseForTiming(raw, t);
  wrapped.emit("knowledge", {});
  check("first_item_ms set on knowledge", typeof t.first_item_ms === "number");

  // refuse / error / done don't count.
  t = createTimingContext({ requestId: "w", requestStartMs: Date.now() - 50 });
  wrapped = wrapSseForTiming(raw, t);
  wrapped.emit("refuse", { reason: "x" });
  wrapped.emit("error", { error: "x" });
  wrapped.emit("done", {});
  check("first_item_ms stays null on refuse/error/done", t.first_item_ms === null);
}

console.log("\n[4] withHardTimeout resolves before timeout when fast");
{
  return (async () => {
    const t0 = Date.now();
    const result = await withHardTimeout(async () => {
      await new Promise(r => setTimeout(r, 50));
      return "fast";
    }, 1000);
    const dur = Date.now() - t0;
    check("returned correct value", result === "fast");
    check("returned quickly (under 200ms)", dur < 200);
  })().then(() => runStep5());
}

async function runStep5() {
  console.log("\n[5] withHardTimeout rejects with TimeoutError when slow");
  {
    const t0 = Date.now();
    let err = null;
    try {
      await withHardTimeout(async () => {
        await new Promise(r => setTimeout(r, 1000));
        return "too slow";
      }, 100, () => ({ phase: "composer", elapsed_ms: Date.now() - t0 }));
    } catch (e) {
      err = e;
    }
    check("threw an error", err != null);
    check("is TimeoutError", err instanceof TimeoutError);
    check("error code is composer_timeout", err && err.code === "composer_timeout");
    check("partial state preserved", err && err.partial && err.partial.phase === "composer");
    const dur = Date.now() - t0;
    check("rejected around the timeout (90-300ms)", dur >= 90 && dur < 300, `actual ${dur}ms`);
  }

  console.log("\n[6] withHardTimeout rejects with original error when fn throws");
  {
    let err = null;
    try {
      await withHardTimeout(async () => {
        throw new Error("original failure");
      }, 1000);
    } catch (e) {
      err = e;
    }
    check("threw the original error", err && err.message === "original failure");
    check("is NOT TimeoutError", !(err instanceof TimeoutError));
  }

  console.log("\n[7] finalize sets total_ms + default status");
  {
    const t = createTimingContext({ requestId: "x", requestStartMs: Date.now() - 200 });
    finalize(t, "ok");
    check("total_ms set", typeof t.total_ms === "number" && t.total_ms >= 200);
    check("status = ok", t.status === "ok");

    const t2 = createTimingContext({ requestId: "y", requestStartMs: Date.now() - 100 });
    t2.status = "refused"; // pre-set
    finalize(t2, "ok");    // shouldn't overwrite
    check("explicit status preserved over default", t2.status === "refused");
  }

  console.log("\n[8] flushTiming is idempotent — only first call writes");
  {
    const t = createTimingContext({ requestId: "x", requestStartMs: Date.now() - 100 });
    finalize(t, "ok");
    // No deps → no supabase insert; log line goes to stdout (silent OK).
    flushTiming({}, t);
    check("_flushed flag set", t._flushed === true);
    // Second call no-op.
    flushTiming({}, t);
    check("second call is no-op (still flushed once)", t._flushed === true);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) {
    for (const f of failures) console.log(`  - ${f.label}${f.detail ? ` (${f.detail})` : ""}`);
    process.exit(1);
  }
  process.exit(0);
}
