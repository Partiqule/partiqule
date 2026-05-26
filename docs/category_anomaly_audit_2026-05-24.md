# Category-anomaly audit — whole-foods misclassification

Status as of 2026-05-26: **audit script ready, run pending production
Supabase credentials**. The hotfix (commit on `main`) closes the bug
fix-forward; this doc captures the methodology so the historical audit
can be run when production credentials are available, and so future
sessions know what was and was not measured.

## What the bug was

`backend/scoringCascade.js` → `detectWholeFood()` returns whole-food
typing for product names whose substring matched one of four
**unanchored** meat-family regex patterns:

- red meat: `(ground beef|beef|ribeye|sirloin|chuck|brisket|tenderloin|...|lamb chop)`
- wild game: `(elk|venison|bison|buffalo|wild boar|rabbit)`
- processed meats: `(bacon|sausage|ham|salami|pepperoni|hot dog|...|jerky|meat stick)`
- salmon (3 patterns): species names, atlantic variants, generic `(salmon)`

Because these patterns were NOT anchored to `^...$` (unlike eggs, nuts,
grains, poultry, dairy, cheese, pork, produce — which all are), a single
substring match anywhere in the product name returned the whole-food
template. Production failure example:

> `Sea Salt Chocolate Chip Beef Protein Cookie - 4 pack`
> → matched `beef` in the red-meat pattern
> → returned `"Conventional red meat — feedlot-raised cattle carry higher
>   hormone, antibiotic, and saturated fat profiles..."`
> → score 4, confidence "high"

The fix (2026-05-26):

1. **Early-exit `CATEGORY_WORDS_IN_NAME` check** — any product name
   containing cookie/bar/chips/crackers/bread/granola/snack/cereal/cake/
   muffin/pie/candy/gummy/chocolate/sauce/spread/smoothie/pizza/taco/
   wrap/sandwich/powder/mix etc. short-circuits `detectWholeFood()` to
   return null.
2. **Anchored four pattern categories** to `^...\s*$`, matching the
   style of the existing non-meat patterns. Adjective tolerance is
   preserved by the existing brand+modifier strip step.

## How to run the audit

```bash
SUPABASE_URL=https://...supabase.co \
SUPABASE_SERVICE_KEY=... \
node backend/scripts/category_anomaly_audit.js --days 30
```

The script queries the last N days of `scans` from production Supabase
and surfaces rows where ALL of:

1. `result_json.source === "whole_food_inference"` (whole-foods code path)
2. `result_json.summary` matches one of the four meat-family signatures
3. Product name contains a `CATEGORY_WORDS_IN_NAME` term

It writes a markdown table to `docs/category_anomaly_audit_2026-05-24.md`
(this file — the script will overwrite it with real data when run).

Output table shape (per family bucket):

| Scanned | Product | Brand | Cat word | Current score | Templated summary excerpt |

## Disposition

**Intelligence gathering only — no re-scoring as part of this hotfix.**
The decision about whether to re-score historical scans, leave them
as-is, or invalidate the cache for affected products is a separate
operational call.

**Fix-forward verification path:** any new scan of an affected product
after the hotfix deploy will route through the updated
`detectWholeFood()` and either:

- early-exit on the `CATEGORY_WORDS_IN_NAME` check and fall through to
  other cascade tiers (calibration, OFF, web search, Tier 5 generic), or
- still match a now-anchored whole-food pattern only when the name IS
  the whole food (e.g. `ground beef`, `wild salmon`).

## Out-of-scope follow-ups

The fish/shellfish patterns (halibut, cod, sardine, tuna, shrimp,
scallop, etc.) and the poultry pattern are also partially unanchored,
sharing the same bug surface. The early-exit `CATEGORY_WORDS_IN_NAME`
check covers the most common failure mode (`shrimp scampi sauce`,
`chicken sausage flavored crackers` both early-exit). Tightening those
patterns is a separate follow-up since the user-scoped fix covered the
four meat-family patterns explicitly named in the spec.

## Smoke test

`backend/scripts/category_classifier_smoke.js` runs 52 unit assertions
across all four pattern families plus regression guards for the
non-meat patterns. Pure unit test, no API calls:

```bash
node backend/scripts/category_classifier_smoke.js
```

Current baseline: 52/52 pass.
