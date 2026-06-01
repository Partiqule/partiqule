# Composer Baseline — Post-Haiku Swap (Session 5b)

**Purpose:** Measure the session-5b composer Sonnet→Haiku swap against the
June 1 Sonnet baseline, on identical query IDs, to decide ship vs session 5c.

**Method.** Same 30-query authed slice, same user (paul@partiqule.com), same
3s pacing, both against production.
- **Sonnet baseline:** `docs/phase2b_stress_test_results_2026-06-01_authed_sonnet.json` (the June 1 post-5a run; commit 07b2366).
- **Haiku run:** `docs/phase2b_stress_test_results_2026-06-01_authed_haiku.json` (post-5b deploy 0d2cd32 + bundle-cache bump v9 428b429).
- The **v9 bundle-cache bump** was required so cached Sonnet bundles didn't mask the swap; it forced fresh Haiku composition for every composer query (one exception: `kf04` was cache-warmed by a pre-run canary and shows as a cache hit — excluded from composer reasoning).
- Refinement two-row pairs are **deduped** in the stats endpoint (session 5b), so a refinement query counts once.

---

## Verdict (read first)

**Keep Haiku — it is a clear net improvement — but it does NOT pass the launch
gate, and the bottleneck has moved.** Median latency halved, timeouts went to
zero, and two queries that failed on Sonnet now succeed. But p95 is still ~28s,
now driven by a **35% voice-gate retry rate** (each retry = a full extra ~8s
Haiku call) plus the refinement leg1+leg2 path — not by single-call model
speed. Quality is acceptable-with-caveats: comparable editorial bundles on 14/17
composer queries, but **3/17 fell to templated fallback** and titles got
formulaic. **Session 5c should target the retry rate and the refinement leg.**

Rollback if needed is a config flip, no redeploy: set Railway
`ASK_COMPOSER_MODEL=claude-sonnet-4-20250514`.

---

## Gate metrics — Sonnet vs Haiku (telemetry, deduped)

| Metric | Sonnet (Jun 1) | Haiku (Jun 1, post-5b) | Net | Gate |
|---|---|---|---|---|
| p50 first-item | 16.8s | **7.7s** | −54% | (target <3s) |
| p95 first-item | 30.7s | **27.6s** | −10% | ✗ |
| p50 total | ~7.0s | 6.5s | flat | — |
| p95 total | 30.7s | 31.0s | flat | ✗ (target <8s) |
| timeout rate | 8.1% | **0%** | −8.1pp | ✓ |
| errors (run) | 1 (vg01 timeout) | **0** | — | — |
| run wall-clock | 643s | **341s** | −47% | — |

**all_pass: still false.** Two of three gates fail; timeout-rate now passes.
The median win is large; the p95 tail is sticky.

> Same metric-definition caveat as June 1: p50 first-item (7.7s) > p50 total
> (6.5s) because composer bundles have no incremental `item` event (first-item =
> bundle arrival), while fast product-list queries dominate the total p50. 5c
> should still split the gate by `query_type`.

---

## NEW: per-attempt composer telemetry (the 5b instrumentation)

From `/admin/ask-timing-stats?include=composer_detail` over the run window:

```
composer_queries : 17
composer_ms      : p50 8156  p95 27653  p99 27653
total_attempts   : 23   (over 17 queries → retries present)
attempt_ms       : p50 7807  p95 13707
attempts_by_status: ok 14 | voice_gate_retry 6 | voice_gate_fail 3
attempts_by_model : claude-haiku-4-5-20251001 × 23   (confirms ONLY the composer swapped)
retry_rate       : 0.35
```

**This is the headline diagnostic.** A single Haiku composer call is ~8s
(`attempt_ms p50 7807`, `composer_ms p50 8156`) — fast. But **35% of composer
queries trigger a voice-gate retry**, and a retry is a *second* full ~8s call.
The `composer_ms p95` of 27.6s ≈ two stacked Haiku attempts plus overhead. So
Haiku is fast per call but its weaker first-attempt voice compliance reintroduces
latency on the tail. **`voice_gate_fail: 3`** means three queries failed gates on
*both* attempts and shipped a templated fallback (see Quality).

A clean Sonnet retry-rate comparison isn't available — this per-attempt
granularity didn't exist on June 1 (it's the 5b instrumentation). So 35% is the
new baseline to beat in 5c, not a measured regression vs Sonnet.

---

## Per-ID latency (run JSON, total_ms)

Composer-path total: **Sonnet p50 24.9s / p95 60s+ → Haiku p50 12.9s / p95 33.6s.**

Faster (composer queries, ms): kf06 18.4→10.8 · kf07 16.3→7.7 · kf09 23.5→12.9 ·
fk01 **31.3→7.9** · fk02 14.6→6.6 · fk05 39.4→31.2 · af01 17.3→8.6 · af07 17.7→6.6 ·
gf02 **30.7→6.9** · cv01 23.2→13.0 · gf01 32.9→18.7 · if05 34.4→27.8 ·
**vg01 timeout→15.4 (recovered)**

Regression: **`if04` 24.9→33.6s (+8.7s)** — the one query that got slower. It's a
refinement flow (leg1 question + leg2 compose); the Haiku leg2 likely took a
retry, stacking on the refinement round-trip. This is the same failure family as
the p95 tail.

(`kf04` shows 25.8→1.1s but that's a cache hit from the pre-run canary, not a
fair composer comparison. Fast item-path queries — kf01/kf03/af04/pg01/pg03/amb02
— are all <1.3s in both, unaffected by the swap.)

---

## Quality spot-check (Part 5)

Pulled bundle text for matched IDs. Compared voice-kit compliance, hedging,
readability, and regressions.

**Comparable / acceptable (14/17 AI bundles).** Voice register holds. Examples:
- `kf06` Haiku: *"Kind Trail Mix. Nuts, fruit, dark chocolate in one pouch. Travels well, works for mixed ages, no mess on the cake table."* — on par with Sonnet.
- `gf02` Haiku **fixed a Sonnet bug**: Sonnet leaked the raw slug *"Two categories worth covering for dynamic:housewarming_gift"*; Haiku rendered *"…for a new parent gift."*

**Regression — 3/17 templated fallback** (`voice_gate_fail` ×2 attempts):
- `if05`, `fk06`, `gf01` shipped the generic templated bundle (e.g. *"Best scored options for You want to know what items to pack…"* — echoes the query restatement, one flat section, "Worth trying" filler).
- Severity: `if05` and `gf01` *refused* on Sonnet anyway, so a templated bundle is arguably ≥ a refusal. But **`fk06` was a real editorial Sonnet bundle → templated fallback is a clear regression.**

**Formulaic titles.** Haiku reused *"without the research project"* across ~5
titles (kf06, fk01, af03, af07, cv01). Sonnet varied more ("…don't require a
chemistry degree", "…skip the guesswork"). Mild voice-monotony signal.

**Not a Haiku issue:** `fk01` "road trip snacks for adults only" titled "road
trip with kids" in *both* models — pre-existing audience-handling bug, out of
5b scope.

---

## Recommended session 5c targets

1. **Cut the 35% retry rate** — the single highest-leverage lever. Each retry
   doubles composer latency and owns the p95 tail. Options: tune the composer
   system prompt for Haiku's voice tendencies (the gates that fire most:
   first_person, hedge prefixes, "actually works"); or pre-empt the most common
   Haiku violations in the prompt rather than catching them on retry.
2. **Refinement leg2 latency** — if04/fk05/cv01 (leg1+leg2) are the slow tail;
   the enriched re-classify + a possibly-retried Haiku compose stack. Treat the
   two legs as one budget.
3. **Templated-fallback rate** — 3/17 (18%) is too high for a primary surface;
   fk06 specifically regressed from a good bundle. Driven by (1).
4. **Split the launch gate by `query_type`** so the fast path (passing) isn't
   averaged with the composer (failing).

If 5c can pull the retry rate toward single digits, the median (7.7s) suggests
the composer p95 could land near ~10–12s — still over the 3s/8s gate, implying
the gate itself or the streaming model (stream the bundle so first-item ≠
full-compose) is the real launch lever, not the model choice.

---

*Generated 2026-06-01. Two scripted authed production runs, 30 identical query
IDs, Sonnet (pre-5b) vs Haiku (post-5b) composer. Composer swap is live in
production (commit 0d2cd32, cache bump 428b429); rollback is `ASK_COMPOSER_MODEL`
env flip. No further code changed while producing this report.*
