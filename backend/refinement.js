// R5b.3 Phase 2a — Pass 1.5 refinement question generation.
//
// Runs ONLY when Pass 1 (backend/ask.js classifyIntent) signals
// needs_refinement=true. Fetches user scan history when authed,
// generates 2-3 clarifying questions with moat-aware framing, runs
// voice gates over question text + option text, returns the validated
// set for the SSE handler to ship to the frontend.
//
// Dual-mode from day one (per the May 18, 2026 launch-gate constraint):
//   MODE A — Templated context refinement. User chose a known template
//            (newborn essentials, back to school lunches) but a key
//            constraint is unspecified (audience age, timing, etc.).
//   MODE B — Open-ended natural-language refinement. User typed a
//            dynamic query (Disney packing, pool with kids) that
//            doesn't map cleanly to a templated context. Questions
//            decompose the implicit category set.
//
// Moat layer (per the 8-element end-state spec): authed users with
// relevant scan history get questions that cite their scans
// (moat_aligned: true). Anonymous or thin-history users get
// category-general questions (moat_aligned: false). The composer's
// camping-style fallback voice applies for the anonymous case; the
// authed voice MUST cite household state.
//
// Architecture per the Phase 2a memory:
//   - Lives in its own file from day one, NOT a subroutine in ask.js.
//   - max_tokens 800 (composer's prompt is ~10kB; refinement's is
//     ~3kB + scan history payload, output is 2-3 questions × ~150 chars).
//   - Pass 1 stays at 400 tokens; the split is cleaner economically
//     since refinement only fires for the minority of queries.
//   - Composer's voice gates + dash sanitizer + kid-context filter
//     are imported, not duplicated.

"use strict";

const {
  voiceGateScan,
  sanitizeDashes,
  isContextKidCoded,
  isProductAdultCoded,
} = require("./composer");

// ── Constants ───────────────────────────────────────────────────
// Mirror composer's RAW_SCAN_CAP. Pass 1.5 caps at the same 50 so
// the moat-aware question generation stays fast and the Haiku
// prompt stays small.
const RAW_SCAN_CAP = 50;

// Option button readability ceiling. Anything longer renders as
// awkward chip text on mobile. 6 words is enough for "Next week" /
// "Just kids and me" / "Kids and adults together" — tighter than the
// composer's 60-char action-label cap because options are buttons.
const MAX_OPTION_WORDS = 6;

// Question text minimum. Below this the question is too vague to
// be actionable. Set to 3 so natural conversational shapes like
// "Who is going?" pass while still blocking single- or two-word
// stubs ("When?" / "How many?"). The vague-phrase blocklist below
// catches longer-but-still-boilerplate cases ("What do you need?").
const MIN_QUESTION_WORDS = 3;

// Vague-phrase block list for question_specificity gate. Each match
// indicates the AI generated boilerplate rather than a specific
// clarifying question. Add as production data surfaces more cases.
const VAGUE_QUESTION_PATTERNS = [
  /^what\s+do\s+you\s+need\??$/i,
  /^any\s+preferences\??$/i,
  /^tell\s+(?:us|me)\s+about/i,
  /^(?:what|how)\s+can\s+(?:we|i)\s+help/i,
  /^anything\s+else\??$/i,
];

// ── Scan history fetch ──────────────────────────────────────────
// Fetches the most recent 50 scans for an authed user, applies the
// context-fit filter (same predicates composer uses to drop
// adult-coded scans from kid-coded contexts), and returns clean
// summaries for the refinement prompt. Separate from generate so the
// smoke can fabricate scan history and test Pass 1.5 in isolation.
async function fetchScanHistoryForRefinement({ supabaseAdmin, userId, contextId = null }) {
  if (!supabaseAdmin || !userId) return [];
  try {
    const cutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("scans")
      .select("id, product_name, category, result_json, scanned_at")
      .eq("user_id", userId)
      .gte("scanned_at", cutoff)
      .order("scanned_at", { ascending: false })
      .limit(RAW_SCAN_CAP);
    if (error) throw error;
    const rows = (data || []).map(row => {
      const r = row.result_json || {};
      const score = typeof r.overall_score === "number" ? r.overall_score
        : (typeof r.score === "number" ? r.score : null);
      return {
        id: row.id,
        product_name: row.product_name || r.product_name || "",
        category: String(row.category || r.category || "").toLowerCase(),
        score,
        scanned_at: row.scanned_at,
      };
    });
    // Apply the kid-context filter when the context is kid-coded.
    if (isContextKidCoded(contextId)) {
      return rows.filter(s => !isProductAdultCoded(s.product_name, s.category));
    }
    return rows;
  } catch (e) {
    console.warn("[refinement] scan history fetch failed:", e?.message);
    return [];
  }
}

// ── System prompt ────────────────────────────────────────────────
const REFINEMENT_SYSTEM = `You generate clarifying refinement questions for Partiqule's Ask feature. Pass 1 has classified the user's query and flagged that ambiguity exists; your job is to ask 2-3 short questions that decompose the ambiguity into answerable choices.

You are a knowing friend who reads labels for a living. You ask the questions a friend would ask before walking the user through specific products — calm, practical, family-first register. Not a wellness influencer. Not a survey form.

DUAL-MODE BEHAVIOR (you handle both):

MODE A — Templated context refinement. Pass 1 identified a known life-moment context but a key constraint is unspecified.
  Example input: { type: "context", occasion: "newborn", ambiguity_reason: "audience could be expectant parent or current parent of newborn" }
  Example questions:
    - "When is baby arriving?" with options ["In 2 weeks", "In 2 months", "In 6 months", "Already arrived"]
    - "Any specific allergies in the family?" with options ["No known allergies", "Dairy or soy", "Nuts", "Multiple"]

MODE B — Open-ended natural language refinement. Pass 1 saw a dynamic query that doesn't map cleanly to a templated context.
  Example input: { type: "context", restatement: "Disney trip packing", ambiguity_reason: "dates unknown, audience composition unknown, park visits per day unknown" }
  Example questions:
    - "When is the trip?" with options ["Next week", "This summer", "Later this year"]
    - "Who is going?" with options ["Kids only", "Kids and adults", "Adults only"]
    - "How many park days?" with options ["1 to 2 days", "3 to 4 days", "5 or more days"]
  Note the option phrasings: "Kids only" not "Just kids and me" (first-person violates voice gates); "1 to 2 days" not "1-2 days" (hyphens violate voice gates).

MOAT LAYER RULE (applies to BOTH modes):
When SCAN HISTORY is non-empty (authed user with relevant scans), AT LEAST ONE question MUST reference the user's actual scans. Mark that question with moat_aligned: true. Example: "You've scanned 3 sunscreens already. Should we cross-check those for Disney sun exposure?" with options ["Yes, cross-check", "No, fresh suggestions", "Mix of both"].

When SCAN HISTORY is empty (anonymous OR authed-no-relevant-history), ALL questions are category-general with moat_aligned: false. Never fabricate scan references the user didn't make.

QUESTION SHAPE (per question):
- id: short snake_case identifier ("trip_dates", "audience_scope", "kid_age_range")
- text: one short sentence under 20 words. Specific, actionable, non-vague.
- suggested_options: array of 2-4 short tappable button labels, each under 6 words.
- allow_text: always true. Users can type free-text as a fallback.
- moat_aligned: boolean. True only when the question text references the user's actual scan history.

OUTPUT SHAPE (strict JSON, no markdown, no backticks):
{
  "questions": [
    {
      "id": "string",
      "text": "string",
      "suggested_options": ["string", "string"],
      "allow_text": true,
      "moat_aligned": false
    }
  ]
}

HARD RULES:
- Return EXACTLY 2 or 3 questions. Not 1, not 4+.
- Each question independent — answering one does NOT require answering another. Order by importance (highest-impact first).
- Each option under 6 words for button readability.
- Questions specific and actionable. NEVER generate vague boilerplate like "What do you need?" or "Any preferences?" or "Tell us more."
- When SCAN HISTORY is non-empty, exactly one question carries moat_aligned: true (cites the user's actual scans). The other questions can be category-general (moat_aligned: false).
- When SCAN HISTORY is empty, all questions are moat_aligned: false. Don't invent scan references.

OPTION FORMAT: RAW VALUES ONLY, NO HEDGE PHRASES

Refinement options must be raw values without framing clauses. The following pattern is the most common failure mode and must be avoided:

Bad option (hedge phrase prepended, 8 words):
"Next 2 weeks, 2 to 3 days"

Good option (raw value only, 4 words):
"2 to 3 days"

Bad option (hedge phrase, 7 words):
"Next 2 weeks, 4 plus days"

Good option (3 words):
"4 plus days"

Bad option (framing clause, 6 words):
"Going to be there for 3 days"

Good option (2 words):
"3 days"

Bad option (qualifier prepended):
"Probably just kids in our family"

Good option:
"Just kids"

ENFORCEMENT: Options MUST be 5 words or fewer. Do NOT prepend framing clauses such as "Next 2 weeks", "Going to be", "Probably", "When we", "We'll be", "In the future", or any other lead-in. Write the raw value only.

TIMING-ANSWER GUIDANCE — never start any option with the word "Next" (e.g., "Next 2 weeks", "Next month", "Next year"). The word "Next" reads as a hedge. For timing/duration options, use absolute references instead:

Bad: "Next 2 weeks"        →  Good: "Within 2 weeks"
Bad: "Next month"          →  Good: "This month"
Bad: "Next year"           →  Good: "This year" or "Later this year"
Bad: "Next few weeks"      →  Good: "A few weeks out"
Bad: "Next summer"         →  Good: "This summer" or "Next summer trip" reframed to "Summer"

The hedge ban applies to STANDALONE options too, not only prepended phrases. An option starting with "Next " will be rejected even if the option is short.

VOICE RULES (output is rejected and retried if these break):
- No first-person pronouns: never use I, me, my, we, our, us.
- No banned wellness language: never use safe, eco friendly, non toxic, pure, wholesome, chemical free, mom approved.
- No "clean" as adjective (use "real ingredients" / "minimal" / "no added X" instead). Comparative "cleaner" is allowed.
- No unsourced medical claims: never use linked to, causes, studies show, scientifically proven, doctor recommended.
- No moralizing: never use you should, you must, the right choice.
- No panic framing: never use dangerous, scary, alarming, toxic as adjective.
- No em-dashes, en-dashes, or word-internal hyphens. Two words instead of compound-adjective with hyphen.
- No marketing comparatives: never use "cleanest mainstream", "actually works", "the only", "best in class", "industry leading", "most trusted".
- Three-beat rhythm where it fits naturally. Specific over vague.

Return strict JSON only.`;

// ── Validation ──────────────────────────────────────────────────
// Per-question shape check. Returns the cleaned question or null
// if structurally invalid. Length/voice gates fire separately after
// the structural pass.
function validateQuestionShape(q) {
  if (!q || typeof q !== "object") return null;
  const id = typeof q.id === "string" ? q.id.trim() : "";
  const text = typeof q.text === "string" ? q.text.trim() : "";
  if (!id || !text) return null;
  const options = Array.isArray(q.suggested_options)
    ? q.suggested_options.filter(o => typeof o === "string" && o.trim()).map(o => o.trim())
    : [];
  if (options.length < 2 || options.length > 4) return null;
  return {
    id: id.slice(0, 60),
    text: text.slice(0, 200),
    suggested_options: options.map(o => o.slice(0, 60)),
    allow_text: q.allow_text !== false, // default true
    moat_aligned: q.moat_aligned === true,
  };
}

// ── Voice gates specific to refinement ──────────────────────────
// option_text_length: each option under MAX_OPTION_WORDS words
// question_specificity: question text >= MIN_QUESTION_WORDS words
//                        AND doesn't match a vague-phrase pattern
function wordCount(s) {
  return String(s || "").trim().split(/\s+/).filter(Boolean).length;
}

function refinementGateFailures(questions) {
  const failures = [];
  const seen = new Set();
  const note = (label) => { if (!seen.has(label)) { failures.push(label); seen.add(label); } };
  for (const q of questions) {
    if (wordCount(q.text) < MIN_QUESTION_WORDS) note("question_specificity");
    for (const p of VAGUE_QUESTION_PATTERNS) {
      if (p.test(q.text.trim())) { note("question_specificity"); break; }
    }
    for (const opt of q.suggested_options) {
      if (wordCount(opt) > MAX_OPTION_WORDS) note("option_text_length");
    }
  }
  return failures;
}

// ── Sanitize dashes across question + option strings ───────────
// Mirror composer's sanitizeBundleDashes pattern but for refinement
// shape. Pre-gate scrub so Sonnet/Haiku drift on compound adjectives
// gets fixed silently instead of forcing retries.
function sanitizeRefinementDashes(questions) {
  let total = 0;
  const fix = (s) => {
    const { text, subs } = sanitizeDashes(s);
    total += subs;
    return text;
  };
  for (const q of questions) {
    q.text = fix(q.text);
    q.suggested_options = q.suggested_options.map(fix);
  }
  return total;
}

// ── User prompt builder ─────────────────────────────────────────
function buildRefinementPrompt({ intent, scanHistory, contextId }) {
  const slimIntent = {
    type: intent?.type || null,
    restatement: intent?.restatement || null,
    category: intent?.category || null,
    audience: intent?.audience || null,
    occasion: intent?.occasion || null,
    constraints: Array.isArray(intent?.constraints) ? intent.constraints : [],
    ambiguity_reason: intent?.ambiguity_reason || null,
    context_id: contextId || null,
  };
  const slimScans = (scanHistory || []).slice(0, RAW_SCAN_CAP).map(s => ({
    product_name: s.product_name,
    category: s.category,
    score: s.score,
  }));
  return `INTENT (from Pass 1):
${JSON.stringify(slimIntent, null, 2)}

SCAN HISTORY (last 50 most-recent, context-filtered):
${slimScans.length ? JSON.stringify(slimScans, null, 2) : "(empty — anonymous user or no relevant scans)"}

Generate the refinement questions now. Strict JSON only.`;
}

// ── Main entry point ────────────────────────────────────────────
async function generateRefinementQuestions({
  intent,
  scanHistory,
  contextId = null,
  callClaude,
  requestId = "noid",
}) {
  if (!intent || typeof intent !== "object") {
    throw new Error("generateRefinementQuestions: intent is required");
  }
  if (typeof callClaude !== "function") {
    throw new Error("generateRefinementQuestions: callClaude dep is required");
  }
  const history = Array.isArray(scanHistory) ? scanHistory : [];

  console.log(`[pass1_5] ${requestId} entry ambiguity_reason=${JSON.stringify(intent.ambiguity_reason || null)} restatement=${JSON.stringify(intent.restatement || "")} context_id=${JSON.stringify(contextId)} scan_history_count=${history.length}`);

  const userPrompt = buildRefinementPrompt({ intent, scanHistory: history, contextId });

  let attempts = 0;
  let allFailures = [];
  let amendment = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    attempts++;
    const sys = amendment
      ? `${REFINEMENT_SYSTEM}\n\nADDITIONAL CONSTRAINT FROM PREVIOUS FAILED ATTEMPT:\n${amendment}`
      : REFINEMENT_SYSTEM;
    let parsed;
    try {
      parsed = await callClaude(sys, userPrompt, 800, 1);
    } catch (err) {
      console.log(`[pass1_5] ${requestId} attempt=${attempt + 1} ERROR: ${err?.message || "unknown"}`);
      if (attempt === 0) {
        amendment = "Previous attempt failed to return parseable JSON. Return strict JSON only, no backticks, no markdown.";
        console.log(`[pass1_5] ${requestId} retry amendment=${JSON.stringify(amendment)}`);
        continue;
      }
      console.log(`[pass1_5] ${requestId} THROW: Pass 1.5 failed: ${err?.message || "unknown"}`);
      throw new Error(`Pass 1.5 failed: ${err?.message || "unknown"}`);
    }
    console.log(`[pass1_5] ${requestId} attempt=${attempt + 1} raw=${JSON.stringify(parsed)}`);
    if (!parsed || typeof parsed !== "object") {
      console.log(`[pass1_5] ${requestId} attempt=${attempt + 1} non-object response`);
      if (attempt === 0) {
        amendment = "Previous attempt returned non-object. Return strict JSON object with a `questions` array.";
        console.log(`[pass1_5] ${requestId} retry amendment=${JSON.stringify(amendment)}`);
        continue;
      }
      console.log(`[pass1_5] ${requestId} THROW: non-object both attempts`);
      throw new Error("Pass 1.5 returned non-object both attempts");
    }

    // Structural validation per question.
    const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];
    const validated = rawQuestions
      .map(validateQuestionShape)
      .filter(Boolean);

    if (validated.length !== rawQuestions.length) {
      console.log(`[pass1_5] ${requestId} attempt=${attempt + 1} structural drop: raw=${rawQuestions.length} validated=${validated.length}`);
    }

    // Sanitize dashes BEFORE voice gates so silent drift doesn't trigger retries.
    sanitizeRefinementDashes(validated);

    // Voice + refinement-specific gates.
    const stringsToScan = validated.flatMap(q => [q.text, ...q.suggested_options]);
    const voiceFailures = voiceGateScan(stringsToScan);
    const refineFailures = refinementGateFailures(validated);
    const allLocalFailures = [...voiceFailures, ...refineFailures];
    allFailures = allFailures.concat(allLocalFailures);

    if (voiceFailures.length) {
      console.log(`[pass1_5] ${requestId} attempt=${attempt + 1} voice_gate_failures=${JSON.stringify(voiceFailures)} scanned_strings=${JSON.stringify(stringsToScan)}`);
    }
    if (refineFailures.length) {
      console.log(`[pass1_5] ${requestId} attempt=${attempt + 1} refinement_gate_failures=${JSON.stringify(refineFailures)} questions=${JSON.stringify(validated.map(q => ({ text: q.text, options: q.suggested_options })))}`);
    }

    // Count check: must be 2-3 questions.
    const countOK = validated.length >= 2 && validated.length <= 3;

    if (allLocalFailures.length === 0 && countOK) {
      // Moat-alignment count for audit metadata.
      const moatCount = validated.filter(q => q.moat_aligned === true).length;
      // Enforce the "scan history non-empty → at least one moat_aligned" rule.
      if (history.length > 0 && moatCount === 0 && attempt === 0) {
        amendment = "Previous attempt had non-empty scan history but no question carried moat_aligned: true. When scan history exists, exactly one question MUST reference the user's actual scans with moat_aligned: true.";
        console.log(`[pass1_5] ${requestId} retry amendment (moat): ${JSON.stringify(amendment)}`);
        continue;
      }
      console.log(`[pass1_5] ${requestId} SUCCESS attempt=${attempt + 1} questions_count=${validated.length} moat_count=${moatCount} voice_failures_seen=${allFailures.length}`);
      return {
        questions: validated,
        scan_history_used: history.length > 0,
        moat_alignment_count: moatCount,
        ai_attempts: attempts,
        voice_gate_failures: allFailures,
      };
    }

    // Build retry amendment with specific feedback.
    if (attempt === 0) {
      const parts = [];
      if (!countOK) {
        parts.push(`Previous attempt returned ${validated.length} questions. Return EXACTLY 2 or 3.`);
      }
      if (voiceFailures.length) {
        parts.push(`Voice gates failed: ${voiceFailures.join(", ")}. Reread the voice rules and rewrite.`);
      }
      if (refineFailures.includes("question_specificity")) {
        parts.push("At least one question was too vague (under 4 words or matched a boilerplate pattern like 'What do you need?'). Make each question specific and actionable.");
      }
      if (refineFailures.includes("option_text_length")) {
        parts.push(`At least one option exceeded ${MAX_OPTION_WORDS} words by prepending a framing clause (e.g., "Next 2 weeks", "Going to be", "Probably") before the actual value. Regenerate with the raw value only. Example: instead of "Next 2 weeks, 2 to 3 days", write "2 to 3 days". Instead of "Probably just kids", write "Just kids".`);
      }
      amendment = parts.join(" ");
      console.log(`[pass1_5] ${requestId} retry amendment=${JSON.stringify(amendment)}`);
    }
  }

  // Both attempts failed validation. Throw — no templated fallback for
  // refinement (unlike composer, where templated fallback ships a
  // weak bundle rather than refuse). For refinement, the caller (ask.js
  // handleContextQuery in session 3) decides what to do: route to bundle
  // composition without refinement, OR surface a generic refuse to the
  // user. Defer that decision to the caller; never ship malformed
  // refinement questions.
  console.log(`[pass1_5] ${requestId} THROW: validation failed both attempts. all_failures=${JSON.stringify(allFailures)}`);
  throw new Error(`Pass 1.5 failed validation both attempts. Failures: ${allFailures.join(", ") || "unknown"}`);
}

module.exports = {
  generateRefinementQuestions,
  fetchScanHistoryForRefinement,
  // Exported for unit-style testing and audit log analysis. Not
  // intended to be called by handlers directly.
  REFINEMENT_SYSTEM,
  RAW_SCAN_CAP,
  MAX_OPTION_WORDS,
  MIN_QUESTION_WORDS,
  VAGUE_QUESTION_PATTERNS,
};
