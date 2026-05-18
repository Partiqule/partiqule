#!/usr/bin/env node
// useAskConversation smoke (Phase 2a session 4 verification).
//
// Exercises the pure helpers from useAskConversation.helpers.js without
// React. Covers:
//   1. Initial state
//   2. submitQuery → composer → bundle (happy path, no refinement)
//   3. submitQuery → refinement_question → submitRefinementAnswers → bundle
//   4. Empty-bundle defense routes to refused
//   5. refuse / error events land in correct phase
//   6. Persistence: awaiting_refinement persists; other phases clear
//   7. Hydration: round-trips a persisted state
//   8. TTL: expired state hydrates as null and clears storage
//   9. Malformed storage clears + returns null
//  10. shouldPersistState guards on conversationId
//
// Run:
//   node frontend/scripts/useAskConversation_smoke.js
//
// Zero API cost. Pure logic.

import {
  STORAGE_KEY,
  TTL_MS,
  INITIAL_STATE,
  applyEvent,
  isStateExpired,
  shouldPersistState,
  persistToStorage,
  hydrateFromStorage,
} from "../src/ask/useAskConversation.helpers.js";

// ── Mock sessionStorage ─────────────────────────────────────────
function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    _dump: () => Object.fromEntries(map),
  };
}

// ── Assertion harness ───────────────────────────────────────────
let passCount = 0;
let failCount = 0;
const failures = [];

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passCount++;
    console.log(`  ✓ ${label}`);
  } else {
    failCount++;
    failures.push({ label, actual, expected });
    console.log(`  ✗ ${label}`);
    console.log(`      expected: ${JSON.stringify(expected)}`);
    console.log(`      actual:   ${JSON.stringify(actual)}`);
  }
}

function checkTrue(label, condition) {
  if (condition) {
    passCount++;
    console.log(`  ✓ ${label}`);
  } else {
    failCount++;
    failures.push({ label, actual: condition, expected: true });
    console.log(`  ✗ ${label}`);
  }
}

// ── Replay helper ───────────────────────────────────────────────
function replay(events, baseState = INITIAL_STATE) {
  let s = baseState;
  for (const [evt, payload] of events) {
    s = applyEvent(s, evt, payload);
  }
  return s;
}

// ── Test scenarios ──────────────────────────────────────────────

console.log("\n[1] Initial state");
check("matches INITIAL_STATE shape", INITIAL_STATE.phase, "idle");
check("no conversationId", INITIAL_STATE.conversationId, null);
check("no bundle", INITIAL_STATE.bundle, null);

console.log("\n[2] Happy path: thinking → composing → bundle (no refinement)");
{
  const start = { ...INITIAL_STATE, phase: "thinking", query: "winter jackets" };
  const final = replay([
    ["thinking", {}],
    ["intent_classified", { type: "context", context_id: "winter_outerwear" }],
    ["composer_thinking", { phase: "composing" }],
    ["bundle", {
      conversation_id: "conv-abc",
      context_id: "winter_outerwear",
      title: "Winter outerwear, sorted",
      sections: [
        { type: "keep", items: [{ key: "patagonia nano puff" }] },
      ],
    }],
    ["done", { response_type: "context" }],
  ], start);
  check("phase = answered", final.phase, "answered");
  check("contextId captured", final.contextId, "winter_outerwear");
  check("bundle captured", final.bundle.title, "Winter outerwear, sorted");
  check("conversationId from bundle", final.conversationId, "conv-abc");
}

console.log("\n[3] Refinement path: thinking → awaiting_refinement → composing → answered");
{
  const start = { ...INITIAL_STATE, phase: "thinking", query: "newborn essentials" };
  const afterQuestion = replay([
    ["thinking", {}],
    ["intent_classified", { type: "context", context_id: null }],
    ["refinement_question", {
      conversation_id: "conv-xyz",
      intent_restatement: "Newborn essentials",
      context_id: null,
      questions: [
        { id: "q1", text: "How old is the baby?", options: ["0-3mo", "3-6mo"] },
      ],
    }],
    ["done", { response_type: "refinement_question" }],
  ], start);
  check("phase = awaiting_refinement", afterQuestion.phase, "awaiting_refinement");
  check("conversationId captured", afterQuestion.conversationId, "conv-xyz");
  check("intent restatement captured", afterQuestion.intentRestatement, "Newborn essentials");
  check("questions length", afterQuestion.refinementQuestions.length, 1);

  // Simulate submitRefinementAnswers setting baseState manually
  const afterAnswerSubmit = {
    ...afterQuestion,
    phase: "composing",
    refinementAnswers: { answers: [{ question_id: "q1", value: "0-3mo" }], skipped: [] },
  };
  const final = replay([
    ["composer_thinking", { phase: "composing" }],
    ["bundle", {
      conversation_id: "conv-xyz",
      title: "Newborn essentials, age-tuned",
      sections: [
        { type: "keep", items: [{ key: "honest co diapers" }] },
      ],
    }],
    ["done", { response_type: "context" }],
  ], afterAnswerSubmit);
  check("phase = answered", final.phase, "answered");
  check("bundle captured after refinement", final.bundle.title, "Newborn essentials, age-tuned");
  check("refinementAnswers preserved", final.refinementAnswers.answers[0].value, "0-3mo");
}

console.log("\n[4] Empty-bundle defense routes to refused");
{
  const start = { ...INITIAL_STATE, phase: "composing", conversationId: "conv-1" };
  const final = applyEvent(start, "bundle", {
    conversation_id: "conv-1",
    title: "Empty",
    sections: [{ type: "keep", items: [] }],
  });
  check("phase = refused on empty bundle", final.phase, "refused");
  check("errorCode = empty_bundle", final.errorCode, "empty_bundle");
  check("bundle cleared", final.bundle, null);
}

console.log("\n[5] Refuse + error transitions");
{
  const refused = applyEvent({ ...INITIAL_STATE, phase: "thinking" }, "refuse", {
    reason: "context_not_recognized",
    message: "That context isn't covered yet.",
  });
  check("refuse → phase = refused", refused.phase, "refused");
  check("refuse → errorCode = reason", refused.errorCode, "context_not_recognized");

  const errored = applyEvent({ ...INITIAL_STATE, phase: "composing" }, "error", {
    error: "composer_failed",
    message: "Composer blew up.",
  });
  check("error → phase = error", errored.phase, "error");
  check("error → errorCode = error", errored.errorCode, "composer_failed");
}

console.log("\n[6] Persistence: awaiting_refinement saves, terminal clears");
{
  const storage = makeStorage();
  const persistState = {
    ...INITIAL_STATE,
    phase: "awaiting_refinement",
    conversationId: "conv-persist",
    refinementQuestions: [{ id: "q1", text: "?" }],
  };
  persistToStorage(persistState, storage, 1_700_000_000_000);
  const written = storage.getItem(STORAGE_KEY);
  checkTrue("awaiting_refinement persisted", typeof written === "string" && written.length > 0);
  const parsed = JSON.parse(written);
  check("savedAt stamped", parsed.savedAt, 1_700_000_000_000);

  // Terminal state clears
  const answeredState = { ...persistState, phase: "answered" };
  persistToStorage(answeredState, storage);
  check("answered clears storage", storage.getItem(STORAGE_KEY), null);

  // Refused clears too
  storage.setItem(STORAGE_KEY, JSON.stringify(persistState));
  persistToStorage({ ...persistState, phase: "refused" }, storage);
  check("refused clears storage", storage.getItem(STORAGE_KEY), null);
}

console.log("\n[7] Hydration round-trip");
{
  const now = 1_700_000_000_000;
  const storage = makeStorage();
  const original = {
    ...INITIAL_STATE,
    phase: "awaiting_refinement",
    conversationId: "conv-hydrate",
    intentRestatement: "Newborn essentials",
    refinementQuestions: [{ id: "q1", text: "Age?" }],
  };
  persistToStorage(original, storage, now);
  const hydrated = hydrateFromStorage(storage, now + 1000);
  checkTrue("hydrated not null", hydrated !== null);
  check("hydrated phase", hydrated.phase, "awaiting_refinement");
  check("hydrated conversationId", hydrated.conversationId, "conv-hydrate");
  check("hydrated questions", hydrated.refinementQuestions.length, 1);
}

console.log("\n[8] TTL: expired hydrate returns null and clears storage");
{
  const now = 1_700_000_000_000;
  const storage = makeStorage();
  const aged = {
    ...INITIAL_STATE,
    phase: "awaiting_refinement",
    conversationId: "conv-old",
    refinementQuestions: [{ id: "q1" }],
  };
  persistToStorage(aged, storage, now);
  // 8 days later
  const hydrated = hydrateFromStorage(storage, now + TTL_MS + 1);
  check("expired hydrate returns null", hydrated, null);
  check("storage cleared after expiry", storage.getItem(STORAGE_KEY), null);
}

console.log("\n[9] Malformed storage clears + returns null");
{
  const storage = makeStorage({ [STORAGE_KEY]: "{not json" });
  const hydrated = hydrateFromStorage(storage);
  check("malformed hydrate returns null", hydrated, null);
  check("malformed cleared", storage.getItem(STORAGE_KEY), null);

  const storage2 = makeStorage({ [STORAGE_KEY]: JSON.stringify({ phase: "answered" }) });
  const hydrated2 = hydrateFromStorage(storage2);
  check("non-awaiting-refinement hydrate returns null", hydrated2, null);
  check("non-awaiting-refinement cleared", storage2.getItem(STORAGE_KEY), null);
}

console.log("\n[10] shouldPersistState guards");
{
  check("idle without conv → false", shouldPersistState({ phase: "idle", conversationId: null }), false);
  check("awaiting w/o conv → false", shouldPersistState({ phase: "awaiting_refinement", conversationId: null }), false);
  check("awaiting w/ conv → true",  shouldPersistState({ phase: "awaiting_refinement", conversationId: "x" }), true);
  check("composing → false",        shouldPersistState({ phase: "composing", conversationId: "x" }), false);
  check("answered → false",         shouldPersistState({ phase: "answered", conversationId: "x" }), false);
}

console.log("\n[11] isStateExpired");
{
  const now = 1_700_000_000_000;
  check("no savedAt → expired", isStateExpired({}, now), true);
  check("just saved → not expired", isStateExpired({ savedAt: now }, now), false);
  check("6 days old → not expired", isStateExpired({ savedAt: now - 6 * 86400_000 }, now), false);
  check("8 days old → expired", isStateExpired({ savedAt: now - 8 * 86400_000 }, now), true);
}

console.log("\n[12] No-op storage (null) safe");
{
  checkTrue("hydrate(null) returns null", hydrateFromStorage(null) === null);
  checkTrue("persist(null) returns false", persistToStorage({ phase: "awaiting_refinement", conversationId: "x" }, null) === false);
}

console.log("\n[13] Type 1 (product list) path: intent + item events stream + done");
{
  const start = { ...INITIAL_STATE, phase: "thinking", query: "sippy cup for my 18 month old" };
  const final = replay([
    ["thinking", {}],
    ["intent", { restatement: "Sippy cup for an 18 month old" }],
    ["item", { id: "k1", product_name: "Munchkin Miracle 360", score: 3 }],
    ["item", { id: "k2", product_name: "Thinkbaby Sippy", score: 2 }],
    ["item", { id: "k3", product_name: "Pura Kiki", score: 1 }],
    ["done", { item_count: 3, no_results: false }],
  ], start);
  check("phase = answered after intent", final.phase, "answered");
  check("intent restatement captured", final.intentRestatement, "Sippy cup for an 18 month old");
  check("items length", final.items.length, 3);
  check("items in arrival order", final.items.map(i => i.id), ["k1", "k2", "k3"]);
  check("no bundle on type 1", final.bundle, null);
  check("no knowledgeCard on type 1", final.knowledgeCard, null);
  check("noResultsMessage stays null", final.noResultsMessage, null);
}

console.log("\n[14] Type 1 no-results path: intent + done(no_results=true)");
{
  const start = { ...INITIAL_STATE, phase: "thinking", query: "specialty thing nothing scores" };
  const final = replay([
    ["thinking", {}],
    ["intent", { restatement: "Specialty thing nothing scores" }],
    ["done", { no_results: true, no_results_message: "Nothing scores well for this yet. Worth scanning options yourself." }],
  ], start);
  check("phase = answered", final.phase, "answered");
  check("items initialized to empty array", final.items, []);
  check("noResultsMessage captured", final.noResultsMessage, "Nothing scores well for this yet. Worth scanning options yourself.");
}

console.log("\n[15] Type 2 (knowledge card) path: knowledge + match events + done");
{
  const start = { ...INITIAL_STATE, phase: "thinking", query: "what is sucralose" };
  const afterKnowledge = replay([
    ["thinking", {}],
    ["intent", { restatement: "What is sucralose?" }],
    ["knowledge", {
      title: "Sucralose",
      body: "Sucralose is a chlorinated sucrose derivative...",
      sources: [{ label: "FDA", url: "https://fda.gov" }],
    }],
  ], start);
  check("phase = answered after knowledge", afterKnowledge.phase, "answered");
  check("knowledgeCard populated", afterKnowledge.knowledgeCard.title, "Sucralose");
  check("matches initialized to empty array", afterKnowledge.knowledgeCard.matches, []);

  const final = replay([
    ["match", { id: "m1", name: "Lakanto Monk Fruit", score: 2 }],
    ["match", { id: "m2", name: "Wholesome Cane Sugar", score: 2 }],
    ["done", { response_type: "knowledge" }],
  ], afterKnowledge);
  check("matches appended", final.knowledgeCard.matches.length, 2);
  check("matches in arrival order", final.knowledgeCard.matches.map(m => m.id), ["m1", "m2"]);
  // `intent` initializes items to [] before we know it's type 2. The page
  // derives responseType as `knowledgeCard ?? items`, so knowledgeCard
  // wins and the empty items array is never rendered. Asserting the
  // actual shape rather than null to lock in the precedence rule.
  check("items stays empty array on type 2 (harmless, knowledgeCard wins)", final.items, []);
}

console.log("\n[16] Match before knowledge is dropped");
{
  const start = { ...INITIAL_STATE, phase: "thinking" };
  const out = applyEvent(start, "match", { id: "orphan" });
  check("orphan match does not create knowledgeCard", out.knowledgeCard, null);
}

console.log("\n[17] Type 3 path unaffected by hook extension");
{
  const start = { ...INITIAL_STATE, phase: "thinking", query: "back to school lunches" };
  const final = replay([
    ["thinking", {}],
    ["intent_classified", { type: "context", context_id: "back_to_school_lunches" }],
    ["composer_thinking", { phase: "composing" }],
    ["bundle", {
      conversation_id: "conv-t3",
      title: "Back to school, dialed",
      sections: [{ type: "keep", items: [{ key: "rxbar minis" }] }],
    }],
    ["done", { response_type: "context" }],
  ], start);
  check("phase = answered", final.phase, "answered");
  check("bundle captured", final.bundle.title, "Back to school, dialed");
  check("items still null (type 3 doesn't emit item)", final.items, null);
  check("knowledgeCard still null (type 3 doesn't emit knowledge)", final.knowledgeCard, null);
}

console.log("\n[18] Refinement path still unaffected (regression guard)");
{
  const start = { ...INITIAL_STATE, phase: "thinking", query: "newborn essentials" };
  const final = replay([
    ["thinking", {}],
    ["intent_classified", { type: "context", context_id: null }],
    ["refinement_question", {
      conversation_id: "conv-rg",
      intent_restatement: "Newborn essentials",
      questions: [{ id: "q1", text: "How old is the baby?", options: ["0-3mo"] }],
    }],
    ["done", { response_type: "refinement_question" }],
  ], start);
  check("phase = awaiting_refinement", final.phase, "awaiting_refinement");
  check("conversationId captured", final.conversationId, "conv-rg");
  check("items null on refinement path", final.items, null);
  check("knowledgeCard null on refinement path", final.knowledgeCard, null);
}

console.log("\n[19] Type 1/2 paths do NOT persist (only awaiting_refinement does)");
{
  const storage = makeStorage();
  const type1State = {
    ...INITIAL_STATE,
    phase: "answered",
    conversationId: null,
    items: [{ id: "x" }],
  };
  persistToStorage(type1State, storage);
  check("type 1 answered does not persist", storage.getItem(STORAGE_KEY), null);

  const type2State = {
    ...INITIAL_STATE,
    phase: "answered",
    conversationId: null,
    knowledgeCard: { title: "X", matches: [] },
  };
  persistToStorage(type2State, storage);
  check("type 2 answered does not persist", storage.getItem(STORAGE_KEY), null);
}

console.log("\n[20] Reset semantics: INITIAL_STATE includes new fields");
{
  // Verifies that INITIAL_STATE has the new fields initialized so the
  // hook's reset() (which calls setState(INITIAL_STATE)) automatically
  // clears them without page-level help.
  check("INITIAL_STATE.items = null", INITIAL_STATE.items, null);
  check("INITIAL_STATE.knowledgeCard = null", INITIAL_STATE.knowledgeCard, null);
  check("INITIAL_STATE.noResultsMessage = null", INITIAL_STATE.noResultsMessage, null);
}

// ── Summary ─────────────────────────────────────────────────────
console.log(`\n${passCount} passed, ${failCount} failed`);
if (failCount > 0) {
  console.log("\nFailures:");
  for (const f of failures) {
    console.log(`  - ${f.label}`);
  }
  process.exit(1);
}
process.exit(0);
