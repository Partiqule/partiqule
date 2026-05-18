# Ask audit log runbook

Operational queries against `ask_responses` for Phase 2a refinement loop
diagnostics. Paste into the Supabase SQL editor; substitute date windows
as needed. Not loaded into Claude context by default — read on demand
when triaging refinement behavior.

## Schema reference

Refinement-related columns on `ask_responses` (added in migration 020):
- `refinement_fired` (boolean) — true when Pass 1 flagged the query as ambiguous
- `refinement_questions_count` (int) — number of questions Pass 1.5 generated; null when refinement didn't fire
- `refinement_answered_count` (int) — answers the user submitted; null on the initial /ask row and 0 when they skipped all
- `refinement_skipped_count` (int) — per-question skips
- `dynamic_query` (text) — reserved for Phase 2b open-ended query payloads; null in Phase 2a

## Two-row pattern

A refinement-triggering query writes TWO rows:
1. `/ask` handler row — `refinement_fired: true`, `refinement_questions_count` set, `refinement_answered_count` null
2. `/ask/refinement_answer` handler row — `refinement_answered_count` + `refinement_skipped_count` set, bundle populated

Correlate the two rows via `user_id` (authed) + `query` + a timestamp window (~5 min — typical user think time + composer latency).

## Refinement fire rate (last 7 days)

```sql
SELECT
  date_trunc('day', created_at) AS day,
  count(*) FILTER (WHERE refinement_fired) AS refinement_rows,
  count(*) FILTER (WHERE refinement_fired AND refinement_answered_count IS NULL) AS first_legs,
  count(*) FILTER (WHERE refinement_answered_count IS NOT NULL) AS second_legs,
  count(*) AS total_rows
FROM ask_responses
WHERE created_at > now() - interval '7 days'
GROUP BY day
ORDER BY day DESC;
```

Healthy shape: `first_legs ≈ second_legs` (some drop-off expected as users abandon mid-refinement). Large gap → users opening the refinement card but never submitting; investigate UX.

## Per-query refinement breakdown

```sql
SELECT
  query,
  count(*) AS times_asked,
  count(*) FILTER (WHERE refinement_fired) AS fired_count,
  avg(refinement_questions_count) FILTER (WHERE refinement_fired) AS avg_questions,
  avg(refinement_answered_count) FILTER (WHERE refinement_answered_count IS NOT NULL) AS avg_answered,
  avg(refinement_skipped_count) FILTER (WHERE refinement_skipped_count IS NOT NULL) AS avg_skipped
FROM ask_responses
WHERE created_at > now() - interval '14 days'
  AND refinement_fired
GROUP BY query
HAVING count(*) FILTER (WHERE refinement_fired) >= 3
ORDER BY fired_count DESC
LIMIT 50;
```

Use to find queries that ALWAYS trigger refinement (candidates for tighter Pass 1 examples) or queries where users uniformly skip (questions aren't useful — Pass 1.5 prompt tightening).

## Two-row correlation for one user

```sql
SELECT
  created_at,
  query,
  refinement_fired,
  refinement_questions_count,
  refinement_answered_count,
  refinement_skipped_count,
  CASE
    WHEN refinement_fired AND refinement_answered_count IS NULL THEN 'leg1_ask'
    WHEN refinement_answered_count IS NOT NULL THEN 'leg2_answer'
    WHEN NOT refinement_fired THEN 'no_refinement'
  END AS leg
FROM ask_responses
WHERE user_id = '<uuid>'
  AND created_at > now() - interval '30 days'
ORDER BY created_at DESC
LIMIT 100;
```

Pair leg1/leg2 by adjacent timestamps + matching query text.

## Drop-off rate (users opening refinement but not answering)

```sql
WITH legs AS (
  SELECT user_id, query, created_at,
    refinement_fired,
    refinement_answered_count IS NOT NULL AS is_answer_leg
  FROM ask_responses
  WHERE created_at > now() - interval '14 days'
    AND user_id IS NOT NULL
),
first_legs AS (
  SELECT user_id, query, created_at AS leg1_at FROM legs
  WHERE refinement_fired AND NOT is_answer_leg
),
matched AS (
  SELECT f.user_id, f.query, f.leg1_at,
    EXISTS (
      SELECT 1 FROM legs l
      WHERE l.user_id = f.user_id
        AND l.query = f.query
        AND l.is_answer_leg
        AND l.created_at BETWEEN f.leg1_at AND f.leg1_at + interval '5 minutes'
    ) AS answered
  FROM first_legs f
)
SELECT
  count(*) AS leg1_count,
  count(*) FILTER (WHERE answered) AS answered_count,
  round(100.0 * count(*) FILTER (WHERE answered) / nullif(count(*), 0), 1) AS answer_rate_pct
FROM matched;
```

Baseline expectation: 50–70% answer rate. <40% → refinement UX or copy issue.

## Refusals from the refinement-answer endpoint

```sql
SELECT
  date_trunc('day', created_at) AS day,
  error,
  count(*) AS n
FROM ask_responses
WHERE created_at > now() - interval '14 days'
  AND error IS NOT NULL
  AND refinement_answered_count IS NOT NULL
GROUP BY day, error
ORDER BY day DESC, n DESC;
```

`context_not_recognized` is the Phase 2a known gap — high count here is expected until Phase 2b ships dynamic context expansion. Other errors warrant investigation.

## Anonymous vs authed split

```sql
SELECT
  user_id IS NOT NULL AS authed,
  count(*) FILTER (WHERE refinement_fired) AS fired,
  count(*) AS total,
  round(100.0 * count(*) FILTER (WHERE refinement_fired) / nullif(count(*), 0), 1) AS fire_rate_pct
FROM ask_responses
WHERE created_at > now() - interval '14 days'
GROUP BY authed;
```

Phase 2a moat-layer rule: authed bundles cite scan history; anonymous bundles fall back to generic framing. Fire rates should be roughly comparable — Pass 1 doesn't know auth state.
