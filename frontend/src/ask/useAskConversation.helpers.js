// frontend/src/ask/useAskConversation.helpers.js
//
// Pure, React-free helpers for useAskConversation. Split out so the
// Node smoke at frontend/scripts/useAskConversation_smoke.js can
// exercise the state machine + persistence without importing React.
//
// Anything that touches `useState` / `useEffect` / `useRef` stays in
// useAskConversation.js; this file is the single source of truth for
// state transitions and storage shape.

export const STORAGE_KEY = "pq_ask_conversation";
export const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const INITIAL_STATE = {
  phase: "idle",
  conversationId: null,
  query: "",
  intentRestatement: null,
  contextId: null,
  refinementQuestions: null,
  refinementAnswers: null,
  bundle: null,
  errorMessage: null,
  errorCode: null,
  savedAt: null,
};

// applyEvent: pure state transition for one SSE event. Returns the
// next state without mutating the input. Tested via Node smoke.
export function applyEvent(state, eventName, payload) {
  const p = payload || {};
  switch (eventName) {
    case "thinking":
      return state;

    case "intent":
      // Type 1/2 paths emit `intent` with restatement. Type 3 emits
      // `intent_classified` instead. Capture restatement either way.
      return { ...state, intentRestatement: p.restatement || state.intentRestatement };

    case "intent_classified":
      // Stay in "thinking" until we see composer_thinking or
      // refinement_question — intent_classified alone doesn't tell us
      // which branch the backend took.
      return { ...state, contextId: p.context_id || state.contextId };

    case "composer_thinking":
      return { ...state, phase: "composing" };

    case "refinement_question": {
      const questions = Array.isArray(p.questions) ? p.questions : [];
      if (!questions.length) return state;
      return {
        ...state,
        phase: "awaiting_refinement",
        conversationId: p.conversation_id || state.conversationId,
        contextId: p.context_id || state.contextId,
        intentRestatement: p.intent_restatement || state.intentRestatement,
        refinementQuestions: questions,
      };
    }

    case "bundle": {
      const sections = Array.isArray(p.sections) ? p.sections : [];
      const hasContent = sections.some(s => Array.isArray(s?.items) && s.items.length > 0);
      if (!hasContent) {
        // Mirror AskPrototypePage's empty-bundle defense — treat as a
        // refuse with the same recoverable copy.
        return {
          ...state,
          phase: "refused",
          bundle: null,
          errorMessage: "We couldn't put together a strong bundle for that yet. Try a specific product instead.",
          errorCode: "empty_bundle",
        };
      }
      return {
        ...state,
        phase: "answered",
        bundle: p,
        conversationId: p.conversation_id || state.conversationId,
      };
    }

    case "refuse":
      return {
        ...state,
        phase: "refused",
        errorMessage: p.message || "Try a different angle.",
        errorCode: p.reason || "refused",
      };

    case "error":
      return {
        ...state,
        phase: "error",
        errorMessage: p.message || "Something went wrong. Try again.",
        errorCode: p.error || "error",
      };

    case "done":
      // Terminal marker — phase already set by the event before done
      // (bundle / refuse / error). Nothing to do.
      return state;

    default:
      return state;
  }
}

// isStateExpired: persisted-state TTL check. Pure.
export function isStateExpired(state, now = Date.now(), ttlMs = TTL_MS) {
  if (!state || typeof state.savedAt !== "number") return true;
  return now - state.savedAt > ttlMs;
}

// shouldPersistState: only persist mid-conversation states with an
// active conversation_id. Terminal states clear storage instead.
export function shouldPersistState(state) {
  if (!state || !state.conversationId) return false;
  return state.phase === "awaiting_refinement";
}

// persistToStorage: write current state to storage if eligible, else
// clear. Returns true if anything was written or cleared.
export function persistToStorage(state, storage, now = Date.now()) {
  if (!storage) return false;
  try {
    if (shouldPersistState(state)) {
      const toSave = { ...state, savedAt: now };
      storage.setItem(STORAGE_KEY, JSON.stringify(toSave));
      return true;
    }
    storage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

// hydrateFromStorage: read + parse + TTL-check. Returns a hydrated
// state shape or null if missing / expired / malformed.
export function hydrateFromStorage(storage, now = Date.now(), ttlMs = TTL_MS) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      try { storage.removeItem(STORAGE_KEY); } catch {}
      return null;
    }
    if (isStateExpired(parsed, now, ttlMs)) {
      try { storage.removeItem(STORAGE_KEY); } catch {}
      return null;
    }
    // Hydrated state always lands in awaiting_refinement — the only
    // phase we persist. Defensive normalization in case storage was
    // tampered with.
    if (parsed.phase !== "awaiting_refinement" || !parsed.conversationId) {
      try { storage.removeItem(STORAGE_KEY); } catch {}
      return null;
    }
    return parsed;
  } catch {
    try { storage.removeItem(STORAGE_KEY); } catch {}
    return null;
  }
}
