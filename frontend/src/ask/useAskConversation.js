// frontend/src/ask/useAskConversation.js
//
// Phase 2a session 4 — custom React hook that owns Ask conversation
// state across the optional refinement turn. Session 5 wires this into
// AskPrototypePage; this file ships state + persistence only, no UI.
//
// State machine:
//
//   idle ──submitQuery──▶ thinking
//      thinking ──intent_classified+composer_thinking──▶ composing
//      thinking ──refinement_question──▶ awaiting_refinement
//      thinking ──refuse/error──▶ refused/error
//
//   awaiting_refinement ──submitRefinementAnswers──▶ composing
//   composing           ──bundle──▶ answered
//   composing           ──refuse/error──▶ refused/error
//
//   any ──reset──▶ idle
//
// SSE event handling mirrors AskPrototypePage's existing streamAskResponse
// shape so the same backend contract drives both call sites until session
// 5 removes the duplicated parser from AskPrototypePage.
//
// Pure state-machine + persistence helpers live in useAskConversation.helpers.js
// so the Node smoke can exercise them without React.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  INITIAL_STATE,
  applyEvent,
  hydrateFromStorage,
  persistToStorage,
} from "./useAskConversation.helpers.js";

export {
  STORAGE_KEY,
  TTL_MS,
  INITIAL_STATE,
  applyEvent,
  isStateExpired,
  shouldPersistState,
  persistToStorage,
  hydrateFromStorage,
} from "./useAskConversation.helpers.js";

// ── SSE parser (mirrors streamAskResponse in AskPrototypePage) ──
// Duplicated here to keep the hook self-contained for session 4;
// session 5 unwinds the duplication when wiring the hook in.
async function streamSseRequest({ url, headers, body, signal, onEvent }) {
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    onEvent("error", { error: "http", status: res.status, message: "Couldn't reach the Ask service." });
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
        try { payload = JSON.parse(dataLines.join("\n")); } catch { payload = {}; }
      }
      onEvent(event, payload);
    }
  }
}

async function buildAuthHeaders(authHeaders) {
  const headers = { "Content-Type": "application/json", Accept: "text/event-stream" };
  try {
    const auth = await authHeaders?.();
    if (auth && typeof auth === "object") Object.assign(headers, auth);
  } catch {}
  return headers;
}

// ── Hook ────────────────────────────────────────────────────────
export function useAskConversation({ apiBase, authHeaders, storage } = {}) {
  // sessionStorage isn't available in SSR or in test envs that don't
  // shim it. Fall back to null so hydrate/persist no-op safely.
  const effectiveStorage = storage !== undefined
    ? storage
    : (typeof window !== "undefined" && window.sessionStorage ? window.sessionStorage : null);

  const [state, setState] = useState(() => {
    const hydrated = hydrateFromStorage(effectiveStorage);
    return hydrated || INITIAL_STATE;
  });

  const abortRef = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    persistToStorage(state, effectiveStorage);
  }, [state, effectiveStorage]);

  useEffect(() => () => {
    if (abortRef.current) { try { abortRef.current.abort(); } catch {} }
  }, []);

  const runStream = useCallback(async ({ url, body, baseState }) => {
    if (abortRef.current) { try { abortRef.current.abort(); } catch {} }
    const controller = new AbortController();
    abortRef.current = controller;

    setState(baseState);

    let working = baseState;
    const apply = (event, payload) => {
      if (controller.signal.aborted) return;
      working = applyEvent(working, event, payload);
      setState(working);
    };

    try {
      const headers = await buildAuthHeaders(authHeaders);
      await streamSseRequest({
        url,
        headers,
        body,
        signal: controller.signal,
        onEvent: apply,
      });
    } catch (err) {
      if (err?.name === "AbortError") return;
      working = applyEvent(working, "error", {
        error: "network",
        message: "Couldn't reach the Ask service.",
      });
      setState(working);
    }
  }, [authHeaders]);

  const submitQuery = useCallback(async (query) => {
    const trimmed = String(query || "").trim();
    if (!trimmed) return;
    await runStream({
      url: `${apiBase}/ask`,
      body: { query: trimmed },
      baseState: {
        ...INITIAL_STATE,
        phase: "thinking",
        query: trimmed,
      },
    });
  }, [apiBase, runStream]);

  const submitRefinementAnswers = useCallback(async ({ answers, skipped } = {}) => {
    const current = stateRef.current;
    if (!current.conversationId) {
      setState({
        ...current,
        phase: "error",
        errorMessage: "Lost the conversation. Start a fresh query.",
        errorCode: "missing_conversation_id",
      });
      return;
    }
    const safeAnswers = Array.isArray(answers) ? answers : [];
    const safeSkipped = Array.isArray(skipped) ? skipped : [];
    await runStream({
      url: `${apiBase}/ask/refinement_answer`,
      body: {
        conversation_id: current.conversationId,
        answers: safeAnswers,
        skipped: safeSkipped,
      },
      baseState: {
        ...current,
        phase: "composing",
        refinementAnswers: { answers: safeAnswers, skipped: safeSkipped },
        errorMessage: null,
        errorCode: null,
      },
    });
  }, [apiBase, runStream]);

  const reset = useCallback(() => {
    if (abortRef.current) { try { abortRef.current.abort(); } catch {} }
    setState(INITIAL_STATE);
  }, []);

  return { state, submitQuery, submitRefinementAnswers, reset };
}

export default useAskConversation;
