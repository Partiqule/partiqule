# Food Scorer Architecture Plan

**Status:** Approved planning doc. Build starts after this document is committed.
**Created:** 2026-05-04
**Author:** Paul Miller (Partiqule)

---

## Architecture: Direction C (NOVA-banded additive scoring)

The food scorer uses NOVA classification as a score band, with ingredient-additive scoring placing the final score within that band. This differs from personalCareScorer (pure additive position-weighted) because food has whole-food vs ultra-processed context that ingredient chemistry alone cannot capture.

**NOVA band ranges:**

- NOVA 1 (whole foods): 1-3
- NOVA 2 (culinary ingredients): 2-4
- NOVA 3 (processed foods): 3-7
- NOVA 4 (ultra-processed): 5-10

**Why banded over clamped:** Banding preserves ingredient differentiation within each tier. A NOVA 4 candy with three artificial colors should score differently than a NOVA 4 candy with one. Banded mapping accomplishes this; pure clamping flattens the distinction.

---

## NOVA Classification: Approach B (deterministic from calibration)

NOVA tier is computed deterministically from the calibration table. Each ingredient entry has a `nova_typical` field (1-4). The scorer aggregates these signals across the ingredient list using rule-based logic:

```
function determineNOVA(parsedIngredients):
  matched = ingredients with calibration entries
  novaCounts = { 1: 0, 2: 0, 3: 0, 4: 0 }
  for ingredient in matched:
    novaCounts[ingredient.nova_typical] += 1

  // NOVA 4 if any ultra-processed marker present
  if novaCounts[4] >= 1: return 4

  // NOVA 3 if multiple processed ingredients
  if novaCounts[3] >= 2: return 3
  if novaCounts[3] >= 1 AND parsedIngredients.length >= 5: return 3

  // NOVA 2 if culinary ingredients dominate short lists
  if novaCounts[2] >= 1 AND parsedIngredients.length <= 3: return 2

  // NOVA 1 if whole-food markers dominate or sparse list
  if novaCounts[1] >= 1 OR parsedIngredients.length <= 2: return 1

  // Default to NOVA 3 if uncertain
  return 3
```

Why deterministic over AI: predictability for Sara's content, the calibration table as single source of truth, testable fixtures, and avoiding inherited bugs from existing NOVA detection logic.

---

## Schema Design

Mirrors `personalCareIngredients.js` shape with food-specific additions.

```javascript
ingredient_key: {
  inci_name: "Red 40",
  aliases: ["red 40", "allura red ac", "fd&c red no. 40", "e129"],
  hazard_class: "artificial_color",
  base_hazard_score: 7,

  // Food-specific fields
  nova_typical: 4,                    // ultra-processed marker
  whole_food_indicator: false,
  quantity_threshold: null,           // applies to nutrient ingredients (sodium, sugar)

  // Mode floors (same pattern as personal care)
  pregnancy_concern: true,
  pregnancy_score_floor: 7,
  kid_concern: true,
  kid_score_floor: 8,

  regulatory_citations: [...],
  reasoning: "..."
}
```

**Fields dropped from personal care schema:**
- `skin_absorption_modifier` (irrelevant for digestion)

**Fields added for food:**
- `nova_typical`: 1-4, drives NOVA detection
- `whole_food_indicator`: boolean, anchors NOVA 1 detection
- `quantity_threshold`: object with DV thresholds for ingredients where quantity matters (sodium, sugar, sat fat). Most ingredients have null here.

---

## Scoring Math: Pattern B (band-mapped weighted aggregation)

Position-weighted intensity (0-1) maps onto the NOVA band range.

**Position weights (mirrors personalCareScorer):**
- Position 0: 1.0
- Position 1: 0.85
- Position 2: 0.70
- Position 3: 0.55
- Position 4: 0.45
- Positions 5-7: 0.30
- Positions 8-14: 0.15
- Positions 15+: 0.05

**Algorithm:**

```
weightedSum = sum(matched.base_hazard_score × position_weight)
totalWeight = sum(position_weight for matched)
intensity = weightedSum / (totalWeight × 10)

bandFloor, bandCeiling = NOVA band range
score = bandFloor + intensity × (bandCeiling - bandFloor)
finalScore = round(score)
```

**Mode floors apply after band mapping:** Kid mode and pregnancy mode bumps from individual ingredients can exceed the band ceiling. A NOVA 1 product with retinol-equivalent kid concern doesn't get capped at 3 in kid mode — the floor logic overrides the band.

---

## Quantity Handling: Option 1 (separate dimension)

Quantity-based concerns (sodium, sugar, sat fat) surface as nutrition badges in the UI, not as score modifiers. The score reflects ingredient chemistry only. The badges (already shipped per project memory) reflect quantity-based daily value warnings.

This preserves clean separation: chemistry score answers "what's in this product?" and nutrition badges answer "how much of these specific concerns?" Two distinct signals the user reads together.

---

## Three Dimensions for Breakdown UI

The breakdown card displays three dimensions that sum to the final score:

| Dimension | Weight | Source |
|-----------|--------|--------|
| Ingredient Hazard | 50% | Position-weighted hazard from calibration |
| Processing Level | 30% | NOVA tier (NOVA 1=2, NOVA 2=4, NOVA 3=6, NOVA 4=9) |
| Nutrition Density | 20% | Empty calorie vs nutrient-dense distinction |

The three dimensions give the breakdown card meaningful slices. Nutrition Density requires nutrition label data which OCR doesn't always capture cleanly — graceful fallback when data is unavailable.

---

## Calibration Priorities (Phased Approach)

### Phase 1: Week 1, ~50 entries

Focus on highest-leverage ingredients users will encounter in scans. Citation discipline matches personal care (verified via web_search before draft, regulatory or peer-reviewed sources only, no health-blog citations).

**Bucket 1: Artificial colors (~10 entries)**
Red 40, Yellow 5, Yellow 6, Blue 1, Blue 2, Red 3, Green 3, caramel color IV, titanium dioxide, annatto extract (control)

**Bucket 2: Preservatives (~8 entries)**
Sodium benzoate, potassium benzoate, sodium nitrite, BHA, BHT, sulfur dioxide/sulfites, calcium propionate, potassium sorbate (control)

**Bucket 3: Sweeteners (~7 entries)**
HFCS, aspartame, sucralose, acesulfame potassium, saccharin, stevia (comparison), erythritol

**Bucket 4: Emulsifiers and processing aids (~6 entries)**
Soy lecithin, carrageenan, polysorbate 80, mono- and diglycerides, xanthan gum (control), maltodextrin

**Bucket 5: Industrial seed oils (~5 entries)**
Soybean oil, canola oil, cottonseed oil, palm oil, sunflower oil

**Bucket 6: NOVA-tier markers (~10 entries)**
Modified food starch, "natural flavor", "artificial flavor", hydrolyzed protein, soy protein isolate, whey protein concentrate, disodium phosphate, calcium phosphate, cellulose gum, plus carrageenan/maltodextrin overlap

**Bucket 7: Whole-food markers for NOVA 1 detection (~5 entries)**
Water, common whole fruits (regex), common whole grains (regex), common whole proteins (regex), common whole dairy (regex)

### Phase 2: Week 2-3, +30 entries

Driven by production data. The instrumentation shipped 2026-05-04 morning will reveal which food ingredients appear in scans without calibration matches. Calibrate those next, in priority order of frequency.

### Phase 3: Month 2, +20 entries

Deliberately controversial entries with extra citation rigor. Includes:
- Specific seed oil refinement markers (hexane vs expeller-pressed)
- Glyphosate residues
- Specific MSG/glutamate forms
- Specific dairy concerns (rBST/rBGH, A1 vs A2)
- Heavy-metal-prone ingredient categories (rice, baby food)
- Common allergens and derivatives

These take longer per entry because the science is mixed and citation discipline must navigate between regulatory bodies and health-influencer narratives.

### Explicitly deferred (not in any phase yet)

- Pesticide residue scoring (category-level, not ingredient-level)
- Heavy metal contamination (testing data, not label data)
- GMO ingredient scoring (controversial, regulatory landscape unclear)
- Brand-specific additive blends ("McDonald's-style fries seasoning")

---

## Build Sequence (4 days, ~6-7 sessions)

Pacing follows one-feature-per-session discipline. Each session ends in a clean commit.

### Day 1 (Tuesday afternoon — start now)

**Session 1: Schema + first 25 calibration entries**

- Create `backend/foodIngredients.js` with schema
- Build entries: Bucket 1 (artificial colors, ~10) and Bucket 2 (preservatives, ~8) and start Bucket 7 (whole-food markers, ~7)
- Citation discipline: verify each via web_search before draft
- Test: confirm aliases resolve, sample lookups work
- Commit + push (no integration needed yet, foodIngredients is data-only)

### Day 2 (Wednesday)

**Session 2 (morning): Production data review + calibration entries 26-50**

- First step: query Supabase scans table for food category over the past 24 hours of instrumented data
- Review which food ingredients appear in scans without calibration matches
- Validate or adjust the next 25 entries based on real data
- Build: Buckets 3 (sweeteners), 4 (emulsifiers), 5 (seed oils), 6 (NOVA markers)
- Same citation discipline
- Commit + push

**Session 3 (afternoon): Scorer engine**

- Create `backend/foodScorer.js`
- Implement: parseIngredients, determineNOVA, scoreIngredients (Pattern B), buildExplanation, buildShortVerdict (draft only — voice pass comes Day 3)
- Build 8-10 test fixtures covering NOVA 1-4, kid/pregnancy modes, edge cases
- Verify math produces expected band placement
- Commit + push

### Day 3 (Wednesday or Thursday)

**Session 4: Integration into /analyze**

- Mirror personal care integration pattern
- Mode B fast path (label OCR → foodScorer)
- Mode A cascade fast path (Tier 4 web search → foodScorer)
- Triple-compute pattern (adult/kid/pregnancy) per yesterday's lessons
- Skip computeSafetyScores for food category (deterministic scorer handles modes)
- scoring_path bucket "fast_path" or "cascade_path" per instrumentation work
- Verification: math test + browser preview before push

**Session 5: Voice register**

- Rewrite buildExplanation and buildShortVerdict in Sara's "knowing friend" register
- Food-specific receipts: FDA additive history, EU bans, NOVA classification, peer-reviewed research
- Named-ingredient verdicts (mirroring this morning's personalCareScorer pattern)
- Three-beat rhythm, no first person, no em dashes per voice kit
- Test against fixtures, confirm voice lands

### Day 4 (Thursday or Friday)

**Session 6: Verification, fuzzy_cal_hit decision, deploy**

- Live production verification: fresh image scan, text search, cached result, mode toggles, dimensions render
- Browser preview before push
- Fuzzy_cal_hit routing decision: production data tells us if this matters for food. If fuzzy_cal_hit is rare, leave it. If common, route through foodScorer.
- Final commit + deploy
- CLAUDE.md update with food scoring conventions

---

## Critical Decision Dependencies

**Production data dependency (Wednesday morning):** Calibration priorities for entries 26-50 should be validated against real food scan data accumulated since instrumentation shipped. If data shows different priorities than the bucket structure assumes, adjust before building.

**NOVA detector accuracy (Day 2 afternoon):** If the deterministic detector misclassifies more than 10-15% of test fixtures, the scoring math produces wrong bands and downstream is off. Build 15-20 test fixtures Day 2 afternoon to validate before integration.

**Voice register iteration risk:** Personal care voice took two cycles. Food voice may need similar iteration. Budget for a second voice pass if Day 3 afternoon work doesn't land cleanly the first time.

**Fuzzy_cal_hit scope risk:** If production data shows fuzzy_cal_hit serves a significant portion of food scans, routing it through foodScorer becomes important. If so, that's its own session and pushes deploy by a day. Acceptable tradeoff.

---

## Out of Scope for This Build

- Home category scorer (separate week)
- Textile category scorer refinement (separate session)
- Architecture consolidation across category scorers (deferred — see Future Planning)
- Calibration entries beyond Phase 1 (data-driven priority, not speculative)
- Pregnancy mode UI surfacing (separate frontend session)
- Frontend changes in general — this is backend-only build

---

## Future Planning (post-foodScorer)

After foodScorer ships, the calibration-driven deterministic scorer pattern will exist in three categories: personal care (live), food (next), and textile (partial). Future planning sessions should address:

**Architecture consolidation:** When does the per-category scorer pattern become abstracted into a generic scorer with category-specific calibration tables? Decision deferred until 3+ categories are implemented and the right abstractions are clear from working code rather than speculation.

**Category priority order:** After food ships, which category gets the deterministic scorer treatment next? Driven by production scan data showing which categories users scan most, calibration data already partially built, and voice/citation expertise required per category.

**Shared infrastructure:** Things all category scorers will need — position-weighted aggregation logic, kid/pregnancy mode computation, citation schema, voice register helpers. These should eventually live in a shared module rather than being copied per scorer.

**Cross-category scoring questions:** Some products span categories (a "natural" deodorant involves personal_care chemistry plus fragrance allergen scoring shared with home). The category boundary is a system simplification, not a real-world boundary.

Plan a meta-architecture session in week 2 (after foodScorer in production) with three implementations to compare against.

---

## Decisions Log

| Question | Decision | Rationale |
|----------|----------|-----------|
| Q1: Schema shape | Mirror personal care + food-specific fields | Architectural consistency, proven pattern |
| Q2: NOVA detection | Deterministic from calibration data (Approach B) | Predictability, single source of truth, testable |
| Q3: Scoring math | Band-mapped weighted aggregation (Pattern B) | Preserves ingredient differentiation within NOVA tiers |
| Q3a: Quantity dimension | Separate via nutrition badges (Option 1) | Reinforces existing UI pattern, clean signal separation |
| Q3b: Dimensions | Ingredient Hazard 50% / Processing Level 30% / Nutrition Density 20% | Captures food-specific concerns parents care about |
| Q4: Calibration scope | Phased — 50 in week 1, 30 in weeks 2-3, 20 in month 2 | Citation discipline scales linearly; data-driven priority for later phases |
| Q5: Build sequence | 4 days, 6 sessions, one feature per session | Sustainable pacing with respect for discipline rules |
