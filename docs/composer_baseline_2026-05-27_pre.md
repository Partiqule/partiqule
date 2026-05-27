# Composer baseline — 2026-05-27 (pre-deploy, warm cache)

- Target: `https://partiqule-production.up.railway.app`
- Cache state: **warm** (prior run primed cache)
- Effective sample size: **16** of 50 attempted queries
- Constraint: production `/ask` enforces a **20-queries-per-hour anon rate limit**
  (`ASK_RATE_LIMIT_ANON_PER_HOUR=20`). The diagnostic exhausted the quota on
  the first run; the second run with 4-second throttling came back 100% rate
  limited because the hourly window hadn't reset yet.
- Conclusion: the synthetic stress test from a single anon IP is **not the
  right tool for ongoing measurement**. The permanent telemetry shipped in
  this session (migration 022 + `/admin/ask-timing-stats`) is. This baseline
  is a directional snapshot, not the launch-gate evidence.

## Status breakdown (effective sample)

| Status | Count | % of attempted |
| --- | ---: | ---: |
| ok | 11 | 22.0% |
| refused | 5 | 10.0% |
| timeout | 1 | 2.0% |
| rate_limit | 33 | 66.0% |
| error | 0 | 0.0% |

## Latency percentiles (ok + refused only, n=16)

| Metric | p50 | p95 | p99 |
| --- | ---: | ---: | ---: |
| first_item_ms | 3916ms | 20820ms | 20820ms |
| total_ms | 2253ms | 20820ms | 20820ms |

## Launch gate

| Metric | Threshold | Actual | Pass |
| --- | --- | --- | --- |
| p95 first_item | < 3000ms | 20820ms | ❌ |
| p95 total | < 8000ms | 20820ms | ❌ |
| timeout rate | < 2% | 2.0% (1/50, of which 33 didn't run) | ❌ |
| **all_pass** | | | **❌** |

## Top 10 slowest (effective sample)

| Rank | Status | first_item | total | Query |
| ---: | --- | ---: | ---: | --- |
| 1 | timeout | — | TIMEOUT | back to school lunches for my 6 year old |
| 2 | ok | 20820ms | 20820ms | newborn essentials for my pregnant sister |
| 3 | ok | 17857ms | 17857ms | pantry restock for our family of 4 |
| 4 | ok | 14863ms | 14863ms | beach day with my husband |
| 5 | ok | — | 5431ms | newborn essentials |
| 6 | ok | 4057ms | 4523ms | best mineral sunscreen for babies |
| 7 | ok | 3916ms | 3917ms | what is pfas |
| 8 | ok | — | 2291ms | GOTS certified baby clothing for my 18 month old |
| 9 | refused:unclear | — | 2253ms | what about microplastics |
| 10 | refused:knowledge_query_not_supported | — | 2151ms | does sunscreen cause cancer |

## Comparison to May 19 session 3 baseline

- May 19 reported: **7% of queries hanging past 60s**
- This run (effective n=16): **1 of 16 = 6.25%** hanging past 60s (the
  back-to-school-lunches templated query timed out at the diagnostic's 60s
  client cap). Roughly consistent with the May 19 number.
- p95 first-item at ~20.8s is **6.9x** the 3s launch-gate threshold.
- p95 total at ~20.8s is **2.6x** the 8s launch-gate threshold.

The gate clearly fails today. Session 5b is the fix work; this session
ships the infra to measure whether 5b actually moves the numbers.

## Post-deploy measurement methodology (replaces synthetic stress test)

Once migration 022 is applied and this session's code is on Railway:

1. **Don't keep running this synthetic script.** It taxes the anon rate
   limit and only measures from one IP at one moment.
2. Let production traffic populate `ask_timing_telemetry` naturally.
3. After ~24 hours: `GET /admin/ask-timing-stats?hours=24` returns:
   - `latency_p50 / p95 / p99` per phase + total
   - `timeout_rate`
   - `gate_status` block with the three boolean checks + `all_pass`
4. After ~7 days at any post-fix steady state: `?hours=168` for the
   week-long gate the launch decision needs.
5. For ad-hoc cold-cache measurement when you want it, run this script
   with `--limit 18 --delay-ms 200000` (200s spacing → stays strictly
   under 20/hour). Or grab a Bearer token to get 100/hr.

## Methodology note for the diagnostic script

`backend/scripts/composer_timing_diagnostic.js` is kept in the tree as a
small synthetic stress utility — useful for narrow questions (does a
fresh deploy serve a known-cold cache correctly?), not for ongoing
baselining. Its 50-query bank is preserved so it can be re-run after
auth header support is wired (a follow-up nicety).
