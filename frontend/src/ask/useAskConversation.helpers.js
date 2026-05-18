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
  // Type 1 (product list) — items stream in via repeated `item` events
  // and are appended in arrival order; the page sorts on render. Null
  // when no type 1 response is active.
  items: null,
  // Type 2 (knowledge card) — single `knowledge` event populates the
  // card; subsequent `match` events append to its `matches` array.
  knowledgeCard: null,
  // Type 1 `done` may carry `no_results: true` with a custom message
  // when nothing scores well for the query. Surfaced separately so the
  // page can swap the items render for a no-match note without losing
  // the intent restatement.
  noResultsMessage: null,
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
      // Type 1/2 paths emit `intent` with restatement and then either
      // stream `item` events (type 1) or fire a `knowledge` event
      // (type 2). The page surfaces the restatement immediately while
      // content arrives, so we transition to `answered` here and let
      // the items/knowledgeCard fields fill in. Type 3 emits
      // `intent_classified` instead and isn't affected by this case.
      return {
        ...state,
        phase: "answered",
        intentRestatement: p.restatement || state.intentRestatement,
        // Initialize items to [] so a type 1 path with zero results
        // (no `item` events before `done`) still renders as type 1
        // rather than ambiguous. Knowledge events will override this
        // by setting knowledgeCard.
        items: state.items == null ? [] : state.items,
      };

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

    case "item": {
      // Type 1 product item arriving incrementally. Append in receive
      // order; the page sorts by score on render. Defensive guard for
      // a payload that arrived before `intent` (shouldn't happen but
      // would otherwise discard the item).
      const next = Array.isArray(state.items) ? [...state.items, p] : [p];
      return { ...state, items: next };
    }

    case "knowledge":
      // Type 2 knowledge card. Single event populates the whole card;
      // subsequent `match` events append to `matches`. Phase transitions
      // here (rather than waiting on `done`) so the user sees the card
      // body immediately while related matches stream in.
      return {
        ...state,
        phase: "answered",
        knowledgeCard: { ...p, matches: [] },
      };

    case "match": {
      // Related-product match for a type 2 knowledge response. Skip if
      // we never saw the parent `knowledge` event — preserves invariant
      // that knowledgeCard is always present when matches exist.
      if (!state.knowledgeCard) return state;
      const existing = Array.isArray(state.knowledgeCard.matches)
        ? state.knowledgeCard.matches
        : [];
      return {
        ...state,
        knowledgeCard: { ...state.knowledgeCard, matches: [...existing, p] },
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
      // Terminal marker. Type 3 (bundle), refuse, and error paths
      // already set phase before `done` arrives. Type 1 with zero
      // results carries `no_results: true` and an optional message —
      // surface the message so the page can swap the items render
      // for a no-match note while keeping the intent restatement.
      if (p.no_results) {
        return {
          ...state,
          phase: "answered",
          noResultsMessage: p.no_results_message || null,
        };
      }
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
