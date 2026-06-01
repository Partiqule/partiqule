# Phase 2b session 5c (DRAFT) — composer retry-rate reduction via Haiku-aware substitute vocabulary, plus refinement leg-2 optimization

> Status: DRAFT for review. Not yet kicked off. Refined per Paul's notes
> (2026-06-01): rejected-attempt capture is a temporary env-gated debug log
> (not permanent telemetry); voice-gate philosophy is teach-substitutes, not
> forbid-triggers.

## Context

Session 5b swapped the composer Sonnet→Haiku (live in production, commit
`0d2cd32`; bundle cache bumped to `v9` at `428b429`). Results in
`docs/composer_baseline_2026-06-01_post_haiku.md`:

- Median first-item halved: 16.8s → 7.7s. Timeouts eliminated: 8.1% → 0%.
  Two queries recovered (`vg01` timeout, `gf01` refuse). Zero run errors.
- **Launch gate still fails:** p95 first-item 27.6s, p95 total 31s.
- New per-attempt telemetry pinned the cause: a **35% voice-gate retry rate**.
  Each retry is a full extra ~8s Haiku call, so the p95 tail is two stacked
  calls — not single-call model slowness.
- Quality: 14/17 AI bundles comparable (Haiku even fixed a Sonnet slug-leak),
  but **3/17 fell to templated fallback** (`if05`, `fk06`, `gf01`; `fk06`
  regressed from a good Sonnet bundle), and titles got formulaic.

A single Haiku composer call is fast (~8s, `attempt_ms p50 7807`). The problem is
Haiku trips voice gates on the first attempt more often than Sonnet did, and
each trip costs a second full call.

## Hypothesis

Cutting the voice-gate retry rate toward single digits pulls composer p95 from
~28s toward the ~10–12s implied by the 7.7s median. The retries are caused by
Haiku reaching for wellness-register vocabulary the voice gates (correctly)
reject. The fix is to **teach Haiku the approved substitute vocabulary** in the
composer system prompt, so it says the right thing on the first attempt — not to
loosen the gates and not merely to list more forbidden words.

## Standing instrumentation (already shipped in 5b — use it)

- `ask_timing_telemetry.composer_attempt_timings` = `[{attempt, model, ms,
  status, retry_reason}]` per query. `status ∈ ok | voice_gate_retry |
  voice_gate_fail | error`. `retry_reason` = `voice_gate:<gate_names>` (the gate
  NAMES that fired), `no_sections`, `swap_count`, or `ai_error*`.
- `/admin/ask-timing-stats?include=composer_detail` aggregates per-attempt
  stats (composer p50/p95/p99, attempt status mix, retry_rate, model mix).
- Refinement two-row dedupe is live (rollup in the stats endpoint).
- Rollback lever (unused unless quality craters): Railway
  `ASK_COMPOSER_MODEL=claude-sonnet-4-20250514`.

## Part 0 — Diagnose before tuning (do this first; do not tune blind)

**0a. retry_reason histogram (gate names).** Pull the distribution of
`retry_reason` across the 5b run's `composer_attempt_timings` rows via a
**one-off SQL query in Supabase** (Paul runs this before kickoff — not a stats
endpoint feature). Rank which voice gates actually fire. Tune Part 1 against the
measured top 2–3, not guesses. Candidate suspects from the gate list:
`first_person`, `clean_adjective`, `wellness_safe`, the wellness set,
`moralizing_should`. Note: `sanitizeBundleDashes` strips dashes BEFORE the gate
runs, so punctuation gates are likely NOT the driver — confirm and rule out.

**0b. Rejected-attempt text capture (temporary debug log).** `retry_reason`
gives the gate name but not the offending text. Add an env-gated debug log so we
can see exactly what Haiku wrote:

```
// in composer.js, after voiceGateScan() returns failures:
if (process.env.DEBUG_LOG_REJECTED_BUNDLES === "true" && voiceFailures.length) {
  console.error("[composer:rejected]", JSON.stringify({
    context_id: context?.id,
    attempt: aiAttempts,
    retry_reason: `voice_gate:${voiceFailures.join("|")}`,
    rejected_strings: stringsToScan.filter(Boolean),   // the actual offending text
  }));
}
```

- Default **off**. Enabled in Railway (`DEBUG_LOG_REJECTED_BUNDLES=true`)
  **temporarily** for the Part 0 + Part 3 diagnostic window only, then disabled
  after 5c verification. This is a debug log, NOT a permanent telemetry field —
  rejected bundle text shouldn't persist to the database.
- Greppable as `[composer:rejected]` in Railway logs.

## Part 1 — Haiku-aware composer prompt tuning (teach substitutes, not just bans)

**Philosophy (locked):** the voice gates are doing their job correctly when they
catch `clean` / `safe` / `wholesome` etc. The composer system prompt's job is to
teach Haiku **what to say instead** — give it approved substitute vocabulary
from the voice kit — not just a longer list of forbidden words. A ban with no
substitute leaves Haiku reaching for the next nearest wellness word and tripping
a sibling gate on retry.

In `backend/composer.js` `COMPOSER_SYSTEM`, add a substitute-vocabulary block
targeting the gates Part 0a measured as top firers. Seed examples (extend per
0a/0b findings):

- "safe for kids" → **"scored cleaner for kids"**, **"lower score for kids"**,
  **"cleaner option for kids"**
- bare "clean" (adjective) → **"cleaner formula"**, **"fewer additives"**, or
  **score-anchored language** (cite what's in/out of the product)
- "wholesome" → **specific score reasoning** (name the ingredient profile, not a
  vibe word)
- (add the real top firers from 0a with their substitutes, e.g. first_person →
  rewrite to second/third person; "you should" → state the tradeoff without the
  imperative)

Each entry should be phrased as: trigger phrase → 2–3 approved rewrites, with the
score-anchored option preferred (the score IS the evidence; lean on it instead of
adjectives).

**Title-tic cleanup (not the priority, but do it here):** add BOTH (a) general
title-variety guidance AND (b) a specific forbidden-phrase list that includes
"without the research project" verbatim (it appeared in ~5 Haiku titles).

Keep the retry mechanism and `sanitizeBundleDashes` as the safety net; the goal
is fewer FIRST-attempt failures, not removing the net.

**Final step before Part 4 — bump the bundle cache v9 → v10** (`bundleCacheKey`
in `ask.js`). The new prompt changes composer output, so v9 bundles are stale;
the bump invalidates them and lets the new Haiku output cache fresh. (Same
pattern as the 5b v8→v9 bump.) Confirmed required.

**Target:** retry_rate 35% → <10%, measured in Part 4. Templated-fallback rate
3/17 → 0–1/17.

## Part 2 — Refinement leg-2 optimization (if04 case study)

`if04` (newborn essentials) was the one latency regression (24.9s → 33.6s): a
refinement flow where leg2 = enriched Pass-1 re-classify (~700ms) + Haiku
compose (likely retried). Treat leg1+leg2 as ONE latency budget. Investigate:
can the enriched Pass-1 re-classify be skipped or cached when the refinement
answers don't change the resolved audience? Can leg2 composition stream so
first-item ≠ full-compose? Secondary cases: `fk05`, `cv01` (also leg1+leg2 tail).

## Part 3 — fk06 templated-fallback case analysis

`fk06` ("halloween candy for the kids") regressed from a real Sonnet bundle to a
templated fallback (`voice_gate_fail` on BOTH attempts). With
`DEBUG_LOG_REJECTED_BUNDLES=true` (Part 0b), reproduce against production and
capture the rejected text for both attempts. Identify the exact gate(s) firing
twice (hypothesis: "candy" + "safe", or "clean"/wellness language). Determine
whether the Part 1 substitute vocabulary prevents it. Apply the same lens to
`if05` and `gf01`. Only consider a targeted gate adjustment if 0b shows a gate
demonstrably over-fires on a legitimate phrase — and even then, prefer the
substitute-vocabulary fix.

## Part 4 — Verification

Re-run the 30-query authed stress test (same IDs, 3s pacing, fresh JWT, against
the v10 cache from Part 1's final step). Compare to the 5b Haiku baseline: retry_rate, `attempts_by_status`,
composer p50/p95, templated-fallback count, gate movement, and a 5-query quality
spot-check including `fk06`. Write `docs/composer_baseline_2026-06-XX_post_5c.md`.
After verification, **disable `DEBUG_LOG_REJECTED_BUNDLES` in Railway.**

## Do NOT in 5c

- Touch Pass 1 / Pass 1.5 / enriched Pass-1 **model** selection (stay Haiku).
- Revert the Haiku swap as the fix (the env rollback lever is only for a quality
  crater, which 5b did not show).
- **Loosen the voice gates to dodge retries.** The gates protect the voice/trust
  contract. Fix the prompt with substitute vocabulary; a targeted gate change is
  allowed ONLY with Part 0b evidence that a gate over-fires on a legitimate
  phrase.
- Make `DEBUG_LOG_REJECTED_BUNDLES` a permanent telemetry field — it is a
  temporary debug log, default off, disabled after verification.
- Touch `buildDynamicPool` / pool sizing, calibration, scoring cascade, category
  classifier, pending_calibration, landing/About pages, or the hybrid
  architecture roadmap.

## Resolved decisions (Paul, 2026-06-01)

1. **retry_reason histogram** → one-off SQL query in Supabase (Paul runs it
   before kickoff). Not a stats-endpoint feature. (Part 0a.)
2. **v10 cache bump** → required; it's the final step of Part 1 before the Part 4
   verification run, invalidating v9 bundles so the new prompt's output caches
   fresh.
3. **"without the research project" tic** → both general title-variety guidance
   AND a specific forbidden-phrase list including that exact pattern. Part 1
   cleanup, not the Part 1 priority.

---

*Draft generated 2026-06-01 from the 5b results. Grounded in the live
`VOICE_GATES` (composer.js) and the 5b per-attempt telemetry. Review before
kickoff — not yet started.*
