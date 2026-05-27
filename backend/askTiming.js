// backend/askTiming.js
//
// Phase 2b session 5a — permanent per-query timing telemetry for the
// /ask composer pipeline. One row per request to ask_timing_telemetry
// (migration 022), one log line per request to Railway logs. Backs the
// launch gate (p95 first-item < 3s, p95 total < 8s, timeout rate < 2%).
//
// Lifecycle:
//   const timing = createTimingContext({ requestId, requestStartMs });
//   ...
//   const t0 = Date.now(); await classifyIntent(...); timing.pass1_ms = Date.now() - t0;
//   ...
//   recordFirstItem(timing);   // first user-visible payload emitted
//   ...
//   finalize(timing, "ok");    // or "refused" / "error" / "timeout"
//   flushTiming(deps, timing); // writes Railway log + persists to Supabase
//
// Telemetry capture is best-effort. If supabase persist fails, the user
// request is unaffected — we just lose one telemetry row.
//
// status values: "ok" | "refused" | "error" | "timeout"
// query_type values: "product" | "context" | "knowledge" | "unclear" | "refinement_answer"

"use strict";

function createTimingContext({ requestId, requestStartMs, queryType, userId }) {
  return {
    request_id: requestId || "noid",
    request_start_ms: requestStartMs || Date.now(),
    query_type: queryType || "unclear",
    user_id: userId || null,
    pass1_ms: null,
    pass1_5_ms: null,
    enriched_pass1_ms: null,
    composer_ms: null,
    retries: null,
    cache_hits: 0,
    cache_misses: 0,
    first_item_ms: null,
    total_ms: null,
    status: null,
    // Internal — not persisted. Used for the partial-state log on timeout.
    _active_phase: null,
  };
}

// Idempotent — only the first call wins. Called when the first user-visible
// payload event (bundle / item / knowledge) is emitted on the SSE stream.
function recordFirstItem(timing) {
  if (!timing) return;
  if (timing.first_item_ms != null) return;
  timing.first_item_ms = Date.now() - timing.request_start_ms;
}

function setQueryType(timing, queryType) {
  if (!timing) return;
  if (queryType) timing.query_type = queryType;
}

function setActivePhase(timing, phase) {
  if (!timing) return;
  timing._active_phase = phase;
}

function finalize(timing, status) {
  if (!timing) return;
  if (timing.total_ms == null) {
    timing.total_ms = Date.now() - timing.request_start_ms;
  }
  if (!timing.status) timing.status = status || "ok";
}

// Writes the Railway log line + persists to Supabase. Safe to call
// multiple times — only the first non-null status persists.
function flushTiming(deps, timing) {
  if (!timing) return;
  if (timing._flushed) return;
  timing._flushed = true;

  // Railway log line — greppable with `[ask:timing]`.
  const parts = [
    `[ask:timing]`,
    `requestId=${timing.request_id}`,
    `query_type=${timing.query_type}`,
    `pass1=${fmt(timing.pass1_ms)}`,
    `pass1_5=${fmt(timing.pass1_5_ms)}`,
    `enriched_pass1=${fmt(timing.enriched_pass1_ms)}`,
    `composer=${fmt(timing.composer_ms)}`,
    `retries=${fmt(timing.retries)}`,
    `cache_hits=${timing.cache_hits || 0}`,
    `cache_misses=${timing.cache_misses || 0}`,
    `first_item_ms=${fmt(timing.first_item_ms)}`,
    `total_ms=${fmt(timing.total_ms)}`,
    `status=${timing.status || "unknown"}`,
  ];
  console.log(parts.join(" "));

  // Supabase persist — async, fire-and-forget.
  persistRow(deps, timing).catch(err => {
    console.warn(`[ask:timing] persist failed requestId=${timing.request_id} err=${err.message}`);
  });
}

function fmt(v) { return v == null ? "-" : v; }

async function persistRow(deps, timing) {
  const supabase = deps && deps.supabaseAdmin;
  if (!supabase) return; // no-op when supabase isn't configured (smokes/tests)
  const row = {
    request_id: timing.request_id,
    query_type: timing.query_type,
    user_id: timing.user_id,
    pass1_ms: timing.pass1_ms,
    pass1_5_ms: timing.pass1_5_ms,
    enriched_pass1_ms: timing.enriched_pass1_ms,
    composer_ms: timing.composer_ms,
    retries: timing.retries,
    cache_hits: timing.cache_hits || 0,
    cache_misses: timing.cache_misses || 0,
    first_item_ms: timing.first_item_ms,
    total_ms: timing.total_ms == null ? 0 : timing.total_ms,
    status: timing.status || "unknown",
  };
  const { error } = await supabase.from("ask_timing_telemetry").insert(row);
  if (error) throw new Error(error.message);
}

// Wraps an SSE writer so the first user-visible payload event (bundle,
// item, knowledge) records first_item_ms on the timing context. Pass-through
// for every other event. Use at handler entry:
//
//   const sse = wrapSseForTiming(rawSse, timing);
//
// Events that count as "first item": bundle, item, knowledge.
// Events that do NOT count: thinking, intent, intent_classified,
//   composer_thinking, refinement_question, refuse, error, done.
const FIRST_ITEM_EVENTS = new Set(["bundle", "item", "knowledge"]);
function wrapSseForTiming(sse, timing) {
  if (!sse || !timing) return sse;
  const originalEmit = sse.emit.bind(sse);
  return {
    ...sse,
    emit(name, payload) {
      if (FIRST_ITEM_EVENTS.has(name)) recordFirstItem(timing);
      return originalEmit(name, payload);
    },
    end: sse.end.bind(sse),
  };
}

// Runs `fn` (a promise-returning function) with a hard timeout. If the
// timeout fires first, the returned promise rejects with a TimeoutError
// carrying the active phase + retries. The underlying promise continues
// to run (we can't cancel arbitrary work) but its result is discarded.
//
// Returns the resolved value of fn() on success.
class TimeoutError extends Error {
  constructor(message, partial) {
    super(message);
    this.name = "TimeoutError";
    this.code = "composer_timeout";
    this.partial = partial || {};
  }
}

function withHardTimeout(fn, timeoutMs, partialFn) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const partial = typeof partialFn === "function" ? partialFn() : {};
      reject(new TimeoutError(`Composer exceeded ${timeoutMs}ms`, partial));
    }, timeoutMs);
    Promise.resolve()
      .then(() => fn())
      .then(v => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(v);
      })
      .catch(err => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
  });
}

module.exports = {
  createTimingContext,
  recordFirstItem,
  setQueryType,
  setActivePhase,
  finalize,
  flushTiming,
  wrapSseForTiming,
  withHardTimeout,
  TimeoutError,
};
