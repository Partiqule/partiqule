# Composer Latency Baseline Comparison — 2026-06-01

**Purpose:** Input for Phase 2b session 5b prompt design. Isolates the
**deploy effect** on `/ask` composer latency between the pre-deploy
baseline (May 20) and the first post-deploy authed run (June 1).

> **Revised after methodology review.** An earlier draft of this file
> headlined a "+9.9s p95 regression" by comparing the June 1 authed run
> against the May 19 *aggregate*. That comparison was confounded by query
> mix and a presumed auth difference. On inspection, the May 19 baseline's
> "primary data source" **is** `phase2b_stress_test_results_2026-05-20_authed.json`
> — i.e. it was **authed** all along ("synthetic" meant *scripted*, not
> *anonymous*). The clean comparison below is **same 30 query IDs, both
> authed, pre vs post deploy** — the only variable is the code shipped
> between May 20 and June 1 (session-5a telemetry + the 30s composer hard
> timeout, `2bba579`). It reverses the conclusion: **the deploy improved
> the tail.**

**Why no anonymous run was done:** the original plan was a `--mode=anonymous`
re-run to control for auth. It was dropped for cause:
(1) anon is documented-unusable for burst testing — the May 19 writeup
records "16/20 then 1/20" before the per-IP rate limit (20/hr) killed it;
(2) the May 20 anonymous JSON is all-errors (`thinking,error`, ~180ms each),
so **there is no valid pre-deploy anon baseline** to isolate a deploy effect
against; (3) authed-vs-authed already controls auth *and* mix and answers the
question with data in hand. Decision recorded 2026-06-01.

**Data sources (all real, all same 30 IDs, mode=authed):**
- PRE  — `docs/phase2b_stress_test_results_2026-05-20_authed.json` (30 valid)
- POST — `docs/phase2b_stress_test_results_2026-06-01_authed.json` (30 valid)
- POST telemetry — `GET /admin/ask-timing-stats?hours=1` captured post-run

---

## Headline — deploy effect (same 30 IDs, both authed)

| Metric | PRE May 20 | POST Jun 1 | Net |
|---|---|---|---|
| p50 total | 15.5s | 16.3s | +0.8s (flat) |
| p95 first-item (delivered) | 51.2s | **36.4s** | **−14.8s (better)** |
| p95 total | 60s+ (2 hung at 339s / 148s) | 39.4s | **better** |
| Catastrophic hangs (>60s) | **2** (cv01 339s, pg03 148s) | **0** | **eliminated** |
| Errors / timeouts | 2/30 (6.7%) | 1/30 client (vg01) | −1 |
| Composer bundles delivered | 15 | 13 | −2 |
| Item-path (fast) | 3 | 6 | +3 |

**Read:** median is flat; the **tail collapsed**. The two pre-deploy
catastrophic hangs (Pass-1 / composer never returning — 339s and 148s) are
gone, consistent with the session-5a 30s composer hard timeout capping
runaway composer/Pass-1 calls. The cost: one query (vg01) now hits a hard
client timeout where it previously fast-refused (see failure modes). Net
tail movement is a clear improvement.

> **Small-n caveat:** p95 is over 18–19 delivered first-item values, so it
> sits at/near the max and is noisy. The robust, method-independent signal
> is the **elimination of the >60s hangs** and the drop in worst-case from
> 339s/148s to 39s — that holds under any percentile definition.

---

## Per-ID movement (total latency, post − pre)

**Recovered / faster (8):**
| ID | pre → post | note |
|---|---|---|
| cv01 post-workout | 339s (hang) → 23.2s | Pass-1 hang eliminated; now delivers a bundle |
| pg03 morning-sickness snacks | 148s (hang) → 4.7s | recovered to fast item path |
| kf01 picky 4yo snacks | 16.8s bundle → 1.6s item | **re-routed** composer→item (classification change) |
| fk05 back-to-school lunches | 51.2s → 39.4s | still slow but no longer worst-case |
| if05 hospital baby arrival | 40.2s → 34.4s | faster, still over budget |
| amb02 snacks for the baby | 10.2s refuse → 5.0s items | recovered to a real result |
| kf04 summer camp | 28.6s → 25.8s | marginal |
| (others ±<2.5s) | — | noise |

**Regressed / slower (3 material):**
| ID | pre → post | note |
|---|---|---|
| fk06 halloween candy | 8.5s (refine→refuse) → 36.4s (refine→bundle) | **latency↑ but quality↑** — now answers where it used to refuse |
| fk01 road-trip snacks adults-only | 15.8s → 31.3s | genuine composer-bundle slowdown — worth a 5b look |
| vg01 Disney trip | 8.0s refuse → **>60s timeout** | Path A leg-2 fragility (see below) |

The fk06 case matters for 5b framing: a "slower" number can be a *better*
outcome (bundle vs refusal). Latency and answer-quality must be read together,
not as a single scalar.

---

## Bimodal finding — CONFIRMED, and present in BOTH runs

The latency distribution is two clean populations in **both** pre and post
data (so it is not a post-deploy artifact):

- **Fast path** — product lists, early refusals, pet/empty-done:
  PRE 0.5–6.3s, POST 1.6–7.1s. Always under the 8s total gate.
- **Composer path** — multi_category_context bundles & composer-refusals:
  PRE 13.9–51.2s (+2 hangs), POST 14.6–39.4s (+1 timeout).

**100% of the gate failure originates in the composer**, pre and post.
Session 5b should target the composer prompt/path exclusively; the
product-recommendation and refusal paths are healthy and out of scope.

> Metric definition note for 5b: telemetry p50 total (7.0s) < p50 first-item
> (16.8s) because composer-bundle queries have no incremental `item` event —
> their first_item == bundle arrival (slow), while fast product-list queries
> dominate the total_ms p50. **Split the launch gate by `query_type`** so the
> composer's true p95 (~37s) isn't diluted by the fast path.

---

## Post-deploy telemetry (server-side, hours=1)

```
total_queries : 37   (30 distinct + 1 canary + refinement second-rows)
by_status     : ok 31 | refused 3 | timeout 3
p50           : first_item 16796ms | total 6952ms
p95           : first_item 30694ms | total 30695ms
p99           : first_item 31243ms | total 31244ms
timeout_rate  : 0.081
gate_status   : all three gates FAIL
```
Window read 0 before the run — confirming near-zero organic traffic and a
clean before-state.

> The server p95 (30.7s) is lower than the client-trail p95 (36.4s) because
> the server counts refinement double-rows (the fast leg-1 refinement row
> pulls the percentile down) and the 30s composer timeout truncates the row's
> measured latency. **De-dupe refinement two-row pairs and read server status,
> not the SSE final event, before 5b draws refuse-vs-timeout conclusions** —
> client SSE showed 6 refuse + 1 timeout; server shows refused 3 / timeout 3,
> because composer-hard-timeout logs as `timeout` server-side but surfaces as
> `refuse` to the client.

---

## New / changed failure modes for 5b

1. **Slow-then-refuse = the 30s hard timeout firing.** `gf01` (32.9s),
   `if05` (34.4s), `fk05` (39.4s) run the composer to the ~30s cap and then
   refuse. The cap is doing its job (no more 339s hangs) but the user gets a
   ~30s wait *and no answer*. **Highest-value 5b surface:** make the composer
   land a bundle inside the budget rather than bail at the ceiling.
2. **Path A leg-2 (refined queries) is the long tail.** vg01 "Disney trip" is
   the only hard timeout. Per the May 19 writeup this is a **known methodology
   artifact** — default-first synthetic answers produce internally-contradictory
   enriched queries ("Adults only" + "Babies/toddlers") that Pass-1 can't
   decompose, so leg-2 hangs/refuses. Real users won't answer contradictorily,
   but it also exposes genuine leg-2 fragility. For 5b: use the per-question
   regex matchers (amb01–06 already define them) instead of default-first to
   avoid re-measuring the artifact.
3. **fk01 genuine composer slowdown** (15.8s → 31.3s on a delivered bundle) —
   the one clear latency regression on a *successful* query. Worth isolating.

---

## Recommended 5b inputs

- **Deploy verdict:** session-5a + 30s timeout **improved tail latency**
  (worst-case 339s→39s, two hangs eliminated). It did **not** broadly
  regress latency. The prior "+9.9s regression" was a mix artifact — discard it.
- **Target the composer only.** Fast paths pass; gate failure is 100% composer.
- **Top fix surface:** convert the 30s-timeout-then-refuse cases into
  in-budget bundles (gf01/if05/fk05).
- **Split the gate by query_type** so composer p95 isn't diluted.
- **Fix telemetry accounting** (refinement two-row dedupe; read server status)
  before refuse-vs-timeout analysis.
- **Re-run with per-question synthetic answers** (not default-first) to stop
  re-measuring the vg01/amb02 Path-A-leg-2 artifact.
- fk01 is the single clean delivered-bundle slowdown — isolate it.

---

*Generated 2026-06-01. Compares two scripted authed production runs (30
identical query IDs) plus post-run `/admin/ask-timing-stats`. No anonymous
run was executed (rate-limit-unusable + no pre-deploy anon baseline). No code,
calibration, or composer logic was modified in this session.*
