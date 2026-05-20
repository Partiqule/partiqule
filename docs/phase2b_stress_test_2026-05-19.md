# Phase 2b stress test — production run analysis

**Date:** 2026-05-20 (scoped 2026-05-19, ran 2026-05-20)
**Author:** Claude Code (Commit B of session 3)
**Pre-commit review:** pending Paul's sign-off

---

## 1. Methodology

### Query set

53-query bank designed in Commit A (`backend/scripts/phase2b_stress_test_queries.js`), balanced across five orthogonal axes:

- **Audience:** kid_focused (9), infant_focused (8), family_with_kids (8), adult_focused (10), pet_focused (7), pregnancy_focused (3), knowledge (8)
- **Specificity:** highly_specific (13), medium_specific (25), ambiguous (11), very_vague (4)
- **Coverage expectation:** in_vocab (33), out_of_vocab (15), cross_vocab (5)
- **Query type:** product_recommendation (29), multi_category_context (19), knowledge (5)

Three queries are **regression anchors** validated in session 2 e2e and session 5.5 smoke: `kf04` (summer camp 9yo), `fk01` (road trip snacks adults only), `vg01` (Disney trip).

### Conditions

Two modes planned per spec. Authed mode ran the full 30-query slice; anonymous mode failed (see Caveats below).

**Anonymous mode (FAILED):** Production's per-IP anonymous rate limit is too tight for burst testing. First attempt: 16/20 queries succeeded before rate-limit kicked in (4 failures at end of burst). Re-attempted after 65-second wait: 1/20 success (rate limit window not yet reset). Anonymous data is essentially unusable. The runner JSON for anonymous mode contains 19 rate-limit refusals + 1 successful query.

**Authed mode (SUCCESS):** 30 queries against Paul's account (`paul@partiqule.com`, scan history ~50 scans). Ran cleanly with per-user rate limit headroom. Total wall-clock: 17 min. Spend: ~$3-4 Haiku + Sonnet (no exact tracking from this run; under $5 ceiling).

### Output files

- `docs/phase2b_stress_test_results_2026-05-20_anonymous.json` (rate-limit corrupted, 1 valid query)
- `docs/phase2b_stress_test_results_2026-05-20_authed.json` (30 valid queries — primary data source for this report)

### Tag definitions

Each query assigned one of:

- **✓ PASS** — bundle or items produced; outcome matched bank expectation
- **◐ REFINE_OK** — Pass 1.5 fired cleanly, refined path (leg 2) completed with bundle
- **◐ EDGE_CASE** — outcome differed from bank expectation but was reasonable
- **✗ COVERAGE_GAP** — refused or empty due to thin/missing calibration vocabulary
- **✗ PROMPT_DRIFT_PASS1** — Pass 1 misclassified or made surprising routing choice
- **✗ PROMPT_DRIFT_PASS1_5** — Pass 1.5 generated bad questions, OR Path A leg 2 enriched re-run failed
- **✗ COMPOSER_FAIL** — pool built but composer hung or refused
- **✗ KNOWLEDGE_QUERY** — knowledge route refused (expected behavior; tag for sorting only)

---

## 2. Summary

### Outcome counts (authed mode, 30 queries)

| Tag | Count | % |
|---|---:|---:|
| ✓ PASS (bundle/items produced) | 14 | 47% |
| ◐ REFINE_OK (refinement → bundle) | 3 | 10% |
| ◐ EDGE_CASE (deviation, reasonable) | 1 | 3% |
| ✗ COVERAGE_GAP (calibration empty/thin) | 6 | 20% |
| ✗ PROMPT_DRIFT_PASS1_5 (Path A leg 2 refuse) | 3 | 10% |
| ✗ COMPOSER_FAIL / TIMEOUT | 2 | 7% |
| ✗ KNOWLEDGE_QUERY (warranted refuse) | 1 | 3% |
| **Total** | **30** | **100%** |

**Headline pass rate: 18/30 = 60% produced a bundle.**
**Responsive rate (bundle OR warranted refuse): 19/30 = 63%.**
**Unwarranted failures (would frustrate a user): 11/30 = 37%.**

### Pass rate by axis

| Slice | Bundle/Items | Total | Rate |
|---|---:|---:|---:|
| **By audience** | | | |
| kid_focused | 6 | 7 | 86% |
| infant_focused | 3 | 6 | 50% |
| family_with_kids | 3 | 5 | 60% |
| adult_focused | 4 | 6 | 67% |
| pet_focused | 0 | 3 | 0% |
| pregnancy_focused | 1 | 2 | 50% |
| knowledge | 0 | 1 | 0% (expected) |
| **By specificity** | | | |
| highly_specific | 7 | 8 | 88% |
| medium_specific | 7 | 14 | 50% |
| ambiguous | 3 | 7 | 43% |
| very_vague | 0 | 1 | 0% (vg01 Disney) |
| **By coverage** | | | |
| in_vocab | 14 | 22 | 64% |
| cross_vocab | 3 | 5 | 60% |
| out_of_vocab | 0 | 3 | 0% |

**Pattern:** pass rate drops sharply on (1) pet queries (no calibration coverage), (2) ambiguous/vague queries (Path A leg 2 fragility), (3) out-of-vocab queries (refused or empty).

### Regression anchor status

| ID | Query | Outcome | Notes |
|---|---|---|---|
| kf04 | summer camp essentials for my 9 year old | ✓ PASS bundle 28.6s | cross_vocab probe held discipline (no bug_spray leak) |
| fk01 | road trip snacks for adults only | ✓ PASS bundle 15.8s | templated path |
| vg01 | Disney trip | ✗ PROMPT_DRIFT_PASS1_5 (refused leg 2) | Path A enriched re-run failed; see issue #1 below |

**One regression on vg01.** Session 2 e2e verified this flow worked end-to-end. Production refused with `context_not_recognized` on leg 2. See issue #1 below.

---

## 3. Per-query detail

### ✓ PASS (14 queries — bundle/items produced as expected)

| ID | Query | Latency | Path |
|---|---|---:|---|
| kf01 | snacks for my picky 4 year old | 16.8s | dynamic pool → bundle |
| kf03 | kids vitamins under 5 | 6.3s | product route, 3 items |
| kf04 | summer camp essentials for my 9 year old | 28.6s | dynamic pool → bundle (cross_vocab) |
| kf06 | kids birthday party for my 6 year old | 20.6s | dynamic pool → bundle (cross_vocab) |
| if05 | what to bring to the hospital for baby arrival | 40.2s | dynamic pool → bundle (cross_vocab); SLOW |
| fk01 | road trip snacks for adults only | 15.8s | templated context → bundle |
| fk02 | beach day for our family with two toddlers | 15.5s | templated context → bundle |
| af01 | first apartment essentials for me, moving in alone | 19.4s | dynamic pool → 4-slug bundle |
| af03 | clean coffee setup for my morning routine | 18.0s | dynamic pool → bundle (cross_vocab) |
| af04 | clean sunscreen for hiking, adult | 2.9s | product route, 3 items |
| af07 | morning routine basics for a single adult | 19.3s | dynamic pool → bundle |
| pg01 | clean sunscreen for pregnancy | 4.4s | product route, 3 items |
| gf01 | baby shower gift for first time mom | 31.8s | dynamic pool → bundle |
| gf02 | housewarming gift for a new parent | 29.5s | dynamic pool → bundle (2-slug) |

### ◐ REFINE_OK (3 queries — refinement → bundle round-trip)

| ID | Query | Total | Notes |
|---|---|---:|---|
| kf09 | after school snacks | 23.1s | Path A leg 2 produced bundle |
| if04 | newborn essentials | 29.2s | session 5.5 verified pattern; Path A produced bundle |
| fk05 | back to school lunches | 51.2s | SLOW but produced bundle |

### ◐ EDGE_CASE (1 query)

| ID | Query | Notes |
|---|---|---|
| kf07 | lunch ideas for picky toddler | Bank expected refinement on toddler age ambiguity. Pass 1 was confident, emitted decomposed and composed a bundle in 13.9s. Pass 1 may be right — "picky toddler" implies young age unambiguously enough. Worth a Pass 1 prompt review to confirm intent, but no user-facing problem. |

### ✗ COVERAGE_GAP (6 queries — empty/thin calibration vocabulary)

| ID | Query | Outcome | Slug at issue |
|---|---|---|---|
| if03 | baby first foods at 6 months | `pool_empty` refuse (2.6s) | templated `tpl_first_foods` has no pool — calibration thin |
| pt01 | treats for my dog with allergies | `thinking,intent,done` (no items, 2.7s) | type=product route, retrieveProducts empty |
| pt02 | cat food for sensitive stomach | same (0.5s) | type=product route, retrieveProducts empty |
| pt03 | non toxic pet shampoo for my dog | same (2.0s) | type=product route, retrieveProducts empty |
| gf03 | gift for my mother in law who likes clean beauty | same (2.4s) | type=product route, no makeup/skincare slug; bathroom_essentials not retrieved |
| amb04 | what should we get for the kids | `refused_unclear` (2.4s) | Pass 1 unable to disambiguate; refused without firing refinement |

### ✗ PROMPT_DRIFT_PASS1_5 (3 queries — Path A leg 2 refusal)

| ID | Query | leg 1 → leg 2 | Issue |
|---|---|---|---|
| vg01 | Disney trip | refinement_question → `context_not_recognized` refuse | Path A enriched Pass 1 didn't emit decomposed_categories for the contradictory synthetic answers ("Adults only" + "Babies or toddlers"). Methodology artifact of default-first answering, but also exposes that Path A is fragile when leg 2 intent is internally contradictory. |
| amb02 | snacks for the baby | refinement_question → refuse | similar — synthetic answers concatenated produced non-decomposable enriched query |
| fk06 | halloween candy for the kids | refinement_question → refuse | Pass 1 FIRED REFINEMENT on this query (bank tagged `expects_refinement: false`); Pass 1 deviation. Then leg 2 refused. Two-layer failure. |

**Note:** vg01 was a session 2 regression anchor that failed in production due to the same Path A leg 2 issue affecting amb02 and fk06. It appears here under PROMPT_DRIFT_PASS1_5 rather than as a separate regression category — same root cause.

### ✗ COMPOSER_FAIL / TIMEOUT (2 queries)

| ID | Query | Latency | leg events at timeout |
|---|---|---:|---|
| pg03 | morning sickness snacks first trimester | 148s | `thinking,intent,intent_classified,composer_thinking` — composer hung |
| cv01 | post workout recovery essentials | 339s | `thinking` only — Pass 1 didn't return within 60s timeout; retried by SSE then timed out |

Both timeouts exceeded the 60s per-query budget. Production composer + Pass 1 occasionally hang under load; not the runner's fault.

### ✗ KNOWLEDGE_QUERY (1 query — warranted refuse)

| ID | Query | Outcome |
|---|---|---|
| kn01 | what's wrong with parabens | `knowledge_subject_not_live` refuse (2.2s) — expected; no curated knowledge entry |

---

## 4. Recommendations (prioritized)

### Sara's calibration backfill list (ranked by gap frequency)

Based on which slugs caused user-facing refusals or empty bundles:

1. **`pet_food`, `pet_treats`, `pet_grooming`, `pet_toys`** (3 query failures — pt01, pt02, pt03). Pet vertical has zero meaningful coverage. The audit flagged these as P2; production data confirms pet queries route to product type (not context), hit empty retrievers, and produce no UI response. **P0 if pet support is in scope for launch.**
2. **`baby_first_foods` templated context pool** (1 failure — if03). The `tpl_first_foods` template exists but the calibration pool returned empty. Either the template's category mapping is wrong, or actual baby-food calibration entries don't carry the expected category tag. **P1.**
3. **Makeup / skincare / beauty slug** (1 failure — gf03 "MIL clean beauty"). No slug in the 15-vocabulary covers beauty. The frontend's `EXAMPLE_QUERIES` literally includes this query, so the gap is user-visible. **P1 — add `beauty` or `makeup` slug to vocabulary AND backfill 20+ entries.**

Lower priority (probed but not stressed in this run):
4. `bug_spray` — only oov01 probed, and that hit rate limit in anon mode. Still thin (6 entries).
5. `lip_balm`, `protein_snacks` — out-of-vocab probes oov02 + oov04 hit rate limit in anon mode; authed didn't include these.

### Pass 1 prompt iteration list

1. **fk06 misfire** (halloween candy for the kids): Pass 1 fired refinement on a query the bank expected to handle directly. May indicate over-firing on `kids` audience signal when occasion is clear. **Investigate Pass 1's audience-vs-occasion weighting.**
2. **amb04 refused-unclear** (what should we get for the kids): Pass 1 returned type=unclear or confidence<0.4, refused without firing refinement. This shape of query — vague + group audience — should ideally fire refinement, not refuse outright. **Consider expanding refinement triggers for the "what should we get for X" pattern.**
3. **pt01-03 routing to product type** (pet queries): Pass 1 classified pet queries as type=product instead of type=context. The product route hits retrieveProducts which has no pet matches → empty response. Either Pass 1 should route pet queries to type=context (so dynamic pool can fail more visibly), OR retrieveProducts should be extended. **Investigate Pass 1 routing for pet queries.**

### Pass 1.5 prompt iteration list

1. **Path A leg 2 fragility** (vg01, amb02): the enriched query concatenation produces queries Pass 1 can't decompose when synthetic answers are contradictory or vague. Real users may produce similar contradictory answers (e.g., picking "Adults only" then accidentally answering the kid-age question). **Two paths:**
   - Tighten Pass 1.5 question generation: skip dependent questions when prior answers eliminate them (e.g., don't ask kid-age if audience=adults-only).
   - Make Path A more resilient: when enriched Pass 1 returns no decomposed_categories AND no templated context, fall back to a templated-context lookup using just the original query.
2. **Voice-gate failures in production** (none observed in this run, but pg03 timeout may have been a voice-gate retry hang). Worth checking Railway logs for `[pass1_5] ... voice_gate_failures` entries.

### Composer iteration list

1. **Latency variance** is wide: bundles produced in 2.9s (cached) to 51.2s (uncached + slow composer). Two timeouts at 60s suggest the production composer has tail-latency issues. **Consider raising the per-request timeout from 60s to 120s, or adding composer-step caching beyond v8 bundle cache.**
2. **No observed wellness-gate or first-person failures** in the data — session 1.5.1 prompt work is holding.

### Knowledge query handling decision

- **`knowledge_subject_not_live` is the correct refuse** for queries that don't have curated entries. kn01 (parabens) hit this expectedly.
- **Recommendation:** decide whether to add curated entries for the top knowledge queries (parabens, phthalates, sucralose) before launch, OR accept the "Knowledge on that subject ships soon" copy as the launch posture. **P1 decision for Paul.**

---

## 5. Notable individual queries

**Worst case:** `cv01` (post workout recovery essentials) — 339 seconds before timeout. Pass 1 didn't even return an intent event within the timeout window. The runner aborted after 6 minutes. Suggests production Pass 1 occasionally hangs entirely — likely an Anthropic API timeout on the backend side that propagates.

**Best case:** `af04` (clean sunscreen for hiking, adult) — 2.9s end-to-end, type=product route, 3 items returned. Cached production response. Demonstrates the "fast happy path" UX when calibration and Pass 1 cache align.

**Most interesting:** `kf04` (summer camp 9yo) — the cross_vocab probe that the bank explicitly worried about (would Pass 1 leak `bug_spray` thin slug?). Result: Pass 1 disciplined to viable vocabulary, no leak, bundle produced. Session 1's vocabulary constraint is holding under stress.

**Most surprising:** `kf07` (lunch ideas for picky toddler) — bank expected Pass 1 to fire refinement on toddler age ambiguity, but Pass 1 was confident enough to compose directly. This is a *positive surprise* — Pass 1 is being decisive where the prompt allows it, not over-refining. Worth noting in the audience-is-the-gate principle: "toddler" alone may now be considered a sufficient audience signal.

**Slowest refined flow:** `fk05` (back to school lunches) — 51.2s for leg1 + leg2 round-trip. User would see ~30s of waiting between the refinement card submit and the bundle. **UX investigation worthwhile.**

---

## 6. Launch gate assessment

**Paul's bar:** "type almost anything to build a list"

**Observed pass rate: 18/30 = 60%** produced a bundle/items.
**Responsive rate: 19/30 = 63%** produced bundle OR warranted refuse.
**Unwarranted failure rate: 11/30 = 37%** would frustrate the user (empty, refuse, hang).

**Assessment: NOT YET AT LAUNCH QUALITY.**

The 37% unwarranted failure rate is too high for the "type almost anything" bar. The dominant failure modes:

1. **Pet vertical (3 queries, 10% of total)** — zero coverage. Either add calibration OR explicitly exclude pet from the surface (frontend nudges users away from pet queries).
2. **Path A leg 2 fragility (3 queries, 10%)** — when refinement fires, leg 2 sometimes refuses with `context_not_recognized` because the enriched Pass 1 can't decompose contradictory inputs.
3. **Composer timeouts (2 queries, 7%)** — production tail latency exceeds 60s in some cases.

**To hit launch, recommend (in priority order):**

1. Address Path A leg 2 fragility — the most user-visible regression. Either fix the enriched-query handling OR add a fallback compose path. Target: refined queries shouldn't refuse leg 2 unless input is genuinely incoherent.
2. Decide pet posture (P0): backfill OR exclude. Current behavior — pet queries silently return empty — is the worst possible UX.
3. Investigate composer timeouts to understand whether it's an Anthropic-side issue or composer-prompt issue.

**After those three:** likely 75-85% pass rate (up from 60%), which is closer to launch quality. May need a second stress test post-fixes.

---

## Caveats and methodology notes

1. **Anonymous mode data is unusable** — production's per-IP anon rate limit prevented capture. The 1 successful anonymous query is in the JSON but not analyzed here. Anonymous-user-experience signal is missing from this report.
2. **Synthetic refinement answers use `default: "first"` for most queries.** This produces internally-contradictory enriched queries in some cases (e.g., vg01 Disney). Real users wouldn't pick "Adults only" then "Babies or toddlers" sequentially. Future runs should use the per-question regex matchers (amb01-06 set those up but most weren't sampled in authed mode).
3. **Type-1 product path framings show empty stages** in the audit log because handleProductQuery wasn't migrated to the framings ledger in session 2. Only handleContextQuery / handleRefinementAnswer / composeBundleAndStream write the new stage ledger. This is a known limitation; type-1 audit data uses the legacy shape.
4. **Audit-row matching may have under-counted leg 2 framings** — the runner queries Supabase by `query` text, but leg 2's audit row has the enriched query as its `query` value, not the original. So `pass_1_enriched` + `composer` stages from leg 2 may not appear in the per-query audit fetch. The framings shown above are leg 1's audit row. Worth a runner fix in a future iteration: fetch by `conversation_id` instead.

---

_Report generated 2026-05-20 by Claude Code._
_Source data: `docs/phase2b_stress_test_results_2026-05-20_authed.json` (primary), `docs/phase2b_stress_test_results_2026-05-20_anonymous.json` (unusable; rate-limited)._
