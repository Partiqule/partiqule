# R5b coverage audit

Prep for Ask mode (R5b). Three coverage surfaces map to the three Ask query
types from the decision log:

| Ask type | Coverage surface | Status |
|---|---|---|
| 1 — "Score X" | `backend/calibration.js` product entries | 3,167 entries, gaps in 13 priority subcategories |
| 2 — "What is X?" | `backend/knowledge.js` (new) | 34 entries scaffolded, **0 curated** |
| 3 — "What do I need for X?" | `backend/contexts.js` (new) | 4 live (Lists templates), 25 needs_review |

## Methodology

Product coverage counts come from keyword regex against the entry key (first
column of each `[normalisedKey, {...}]` tuple in calibration.js). Counts are
directional, not perfect — brand-named entries like `"tide"` get matched via
broader regex including known brand keywords. Sara or Paul should sanity-check
gaps before doing the curation work, since some brand-only keys may be under-
counted.

Volume threshold by subcategory:

- High-volume (≥10 target): kid snacks, all skincare and personal care
- Niche (≥5 target): everything else

## Product coverage by category

### Top-level distribution

| Category | Entries |
|---|---:|
| food_beverage | 961 |
| personal_care | 468 |
| clothing | 458 |
| home | 224 |
| beverage | 219 |
| supplement | 215 |
| baby | 197 |
| kitchen | 149 |
| restaurant | 116 |
| other | 42 |
| food | 39 |
| accessory | 38 |
| toy | 36 |
| home_furnishing | 5 |
| **Total** | **3,167** |

### Priority subcategory coverage

| Group | Subcategory | Entries | Threshold | Status |
|---|---|---:|---:|---|
| Kid food | Snacks | 12 | 10 | ✅ |
| Kid food | Pouches | 9 | 10 | ⚠️ gap |
| Kid food | Cereal | 39 | 10 | ✅ |
| Kid food | Fruit snacks | 13 | 10 | ✅ |
| Baby gear | Diapers | 27 | 5 | ✅ |
| Baby gear | Formula | 13 | 5 | ✅ |
| Baby gear | Wipes | 16 | 5 | ✅ |
| Baby gear | Baby wash | 6 | 5 | ✅ |
| Baby gear | Baby lotion | 6 | 5 | ✅ |
| Baby gear | Pacifiers | 4 | 5 | ⚠️ gap |
| Kid drinkware | Sippy cups | 1 | 5 | ⚠️ gap |
| Kid drinkware | Water bottles | 20 | 5 | ✅ |
| Kid drinkware | Baby/toddler bottles | 9 | 5 | ✅ |
| Kid drinkware | Reusable straws | 1 | 5 | ⚠️ gap |
| Kid clothing | Pajamas | 20 | 5 | ✅ |
| Kid clothing | Leggings | 5 | 5 | ✅ (just) |
| Kid clothing | Onesies | 3 | 5 | ⚠️ gap |
| Kid clothing | Socks | 5 | 5 | ✅ (mostly adult) |
| Kid clothing | Sleep sacks | 2 | 5 | ⚠️ gap |
| Clean beauty | Cleanser | 9 | 10 | ⚠️ gap |
| Clean beauty | Moisturizer | 5 | 10 | ⚠️ gap |
| Clean beauty | Serum | 1 | 10 | ⚠️ gap |
| Clean beauty | Sunscreen | 18 | 10 | ✅ |
| Clean beauty | Foundation | 4 | 5 | ⚠️ gap |
| Clean beauty | Lipstick / lip balm | 3 | 5 | ⚠️ gap |
| Clean beauty | Deodorant | 19 | 10 | ✅ |
| Hair care | Shampoo | 13 | 10 | ✅ |
| Hair care | Conditioner | 0 | 5 | ⚠️ gap |
| Hair care | Styling | 2 | 5 | ⚠️ gap |
| Household | Dish soap | 4 | 5 | ⚠️ gap |
| Household | Laundry detergent | 26 | 5 | ✅ |
| Household | All-purpose cleaner | 5 | 5 | ✅ |
| Household | Dishwasher detergent | 11 | 5 | ✅ |
| Pregnancy | Prenatal vitamin | 11 | 5 | ✅ |
| Pregnancy | Stretch mark / belly oil | 5 | 5 | ✅ |
| Kitchenware | Cookware | 16 | 5 | ✅ |
| Kitchenware | Cutting boards | 9 | 5 | ✅ |
| Food storage | Containers | 9 | 5 | ✅ |
| Food storage | Wraps | 6 | 5 | ✅ |
| Food storage | Freezer bags | 5 | 5 | ✅ |

### Gap list (13 subcategories)

Sorted by priority. Each gap should be filled before R5b ships Ask responses
that cover that subcategory, because the Ask path falls back to web search
or generic synthesis when calibration is empty.

1. **Hair conditioner** (0 → 5 target). Notable hole. Recommend: Briogeo Don't
   Despair Repair, Innersense Hydrating Cream Hairbath, Sukin Hydrating, Acure
   Curiously Clarifying, Avalon Organics Biotin.
2. **Hair styling** (2 → 5 target). Recommend: Briogeo Curl Charisma Cream,
   Innersense I Create Hold, Aveda Be Curly, Verb Ghost Oil.
3. **Skincare serum** (1 → 10 target). Largest skincare gap by volume of asks.
   Recommend: Pai Rosehip BioRegenerate (already in fixtures!), Indie Lee
   Squalane Facial Oil, Marie Veronique Treatment, True Botanicals Pacific
   Vitamin C, plus 5+ more across price tiers.
4. **Skincare moisturizer** (5 → 10 target). Recommend: Pai Echium & Argan,
   True Botanicals Pure Radiance, Drunk Elephant Lala Retro (lower-tier
   reference), CeraVe Daily Moisturizing (mass-market reference at higher
   score for comparison).
5. **Skincare cleanser** (9 → 10 target). Add one to clear — recommend Indie
   Lee Brightening Cleanser or Marie Veronique Replenishing Oil Cleanser.
6. **Skincare foundation** (4 → 5 target). Recommend: ILIA Super Serum Skin
   Tint, RMS UnCoverup, Kosas Tinted Face Oil.
7. **Lipstick / lip balm** (3 → 5 target). Recommend: ILIA Color Block,
   Kosas Wet Lip Oil Gloss, Henne Lip Tint, RMS Lip Shine.
8. **Kid pouches** (9 → 10 target). One more to clear — recommend Cerebelly
   or White Leaf Provisions.
9. **Onesies** (3 → 5 target). Recommend: Hanna Andersson, Burt's Bees Baby,
   Kate Quinn, MORI.
10. **Sleep sacks** (2 → 5 target). Recommend: Nested Bean, Halo SleepSack,
    Kyte Baby, Woolino.
11. **Pacifiers** (4 → 5 target). One more — recommend Nuk Latex or BIBS.
12. **Sippy cups** (1 → 5 target). Recommend: ezpz Tiny Cup (already in Ask
    fixtures), Thinkbaby, Re-Play, Pura Kiki Toddler.
13. **Reusable straws** (1 → 5 target). Recommend: Klean Kanteen Steel
    Straws, GoSili Silicone, Hummingbird, Final Straw.
14. **Dish soap** (4 → 5 target). One more — recommend Branch Basics or
    Cleancult.

Recommended sequence: skincare gaps first (largest single-category coverage
hole), then hair conditioner (literally 0 entries), then kid drinkware
gaps (3 of 4 subcategories below threshold).

## Brand diversity gaps (R5b.2.3 surfaced)

The original audit measured subcategory coverage. R5b.2.3 retrieval
verification surfaced a different gap: brand variety within categories
that pass subcategory thresholds.

**Severe gap: Clothing** — 1 brand (Sports Organics × multiple) at floor 1.
The "cleaner clothing" query returns three Sports Organics entries because
no other clothing brand is currently scored at floor 1. This breaks the
demo experience — it reads as brand placement rather than impartial
curation, and prevents the user from comparing options across brands.

**Action:** curate 5 to 8 more floor 1 clothing brands before context
bundles ship. Starting candidates: Pact, Patagonia, People Tree,
Boll & Branch, Coyuchi, Tentree, MATE the Label, Outerknown.

**Process note:** any time retrieval verification shows the same brand
returning multiple times in the top 3, log it as a brand diversity gap.
Future audits should include a brand diversity check alongside the
existing subcategory coverage check — passing the subcategory count
threshold does not guarantee a sound demo experience if one brand
dominates the floor.

## Knowledge base scaffolding

`backend/knowledge.js` created. 34 entries scaffolded, all
`status: needs_curation`. Curation is the substrate the LLM frames from for
Ask type 2 queries.

### Coverage

| Category | Count |
|---|---:|
| Chemical / ingredient | 20 |
| Material | 5 |
| Certification | 9 |
| **Total** | **34** |

### Recommended curation order

Highest-frequency ask topics first. Each entry takes ~30 minutes to curate
properly (write plain-language + health/safety context, attach sources,
review against Voice Kit).

1. **PFAS** — top-of-mind across categories, most-asked.
2. **Phthalates** — appears in personal care, plastics, cosmetics.
3. **Parabens** — high recognition, low understanding.
4. **BPA and BPS** — plastic literacy 101.
5. **Lead** — recurring news cycle (heavy metals in baby food, etc).
6. **Synthetic dyes** (Red 40 / Yellow 5 / Blue 1) — kid food asks.
7. **Microplastics** — emerging concern, asked alongside scan results.
8. **High fructose corn syrup** — kid food asks.
9. **Aspartame and artificial sweeteners** — 2023 IARC reclassification
   keeps this asked.
10. **Oxybenzone** — pregnancy and reef-safe asks.
11. **USDA Organic** — most-recognized certification, ground-zero for "what
    does X cert actually guarantee?" asks.
12. **GOTS** — clothing category equivalent.
13. **EWG Verified** — appears across personal care and home.

The remaining 21 entries (formaldehyde releasers, triclosan, cadmium, mercury,
glyphosate, natural flavors, sodium nitrite, carrageenan, octinoxate, SLS,
the five materials, and the six remaining certifications) can be curated in a
second sprint.

## Context map scaffolding

`backend/contexts.js` created. 4 live entries (the consolidated Lists
templates), 25 new entries with `status: needs_review`.

### Coverage

| Group | Live | Needs review | Total |
|---|---:|---:|---:|
| Life moments | 2 (newborn, lunches) | 6 | 8 |
| Seasonal / travel | 1 (vacation) | 8 | 9 |
| Household | 1 (pantry) | 5 | 6 |
| **Total** | **4** | **25** | **29** |

### Recommended priority for category fill-in

Sara persona use cases first.

1. **First / second / third trimester pregnancy** — Sara's core persona.
2. **Newborn essentials** — already live, but could refresh categories.
3. **Back to school lunches** — already live.
4. **Sick kid kit** — recurring, high-pull.
5. **Detox the bathroom** — high-intent.
6. **First aid kit refresh** — easy to ship, broadly useful.
7. **Road trip with kids** — seasonal but recurring.
8. **Beach day** / **Pool day** — pair, summer ramp.

Each context with `status: needs_review` takes ~10 minutes to verify the
categories array (Paul / Sara confirms which slugs and category labels
are right per context, adjusts min/max).

## Total curation work estimate

| Track | Items | Per-item | Subtotal |
|---|---:|---:|---:|
| Knowledge base — top 13 | 13 | 30 min | 6.5 hours |
| Knowledge base — remaining 21 | 21 | 30 min | 10.5 hours |
| Contexts review — top 8 | 8 | 10 min | 1.3 hours |
| Contexts review — remaining 17 | 17 | 10 min | 2.8 hours |
| Product gap fills — top 5 | ~25 entries | 20 min | 8.3 hours |
| Product gap fills — remaining 9 | ~30 entries | 20 min | 10 hours |
| **Minimum to ship R5b usefully** | | | **~16 hours** |
| **Full coverage** | | | **~39 hours** |

### R5b ship blockers

Ask mode cannot ship usefully until:

- **Type 2** queries: at least 10 knowledge entries are `status: live` (the
  top of the curation list above).
- **Type 3** queries: at least 8 contexts are `status: live` (Sara use
  cases above).
- **Type 1** queries: the most-asked product subcategories have coverage at
  threshold. The top 5 gap fills above are the minimum.

Estimated minimum curation effort to clear those gates: **~16 hours of
review and writing work** spread across Sara and Paul.

## Files touched

- `backend/knowledge.js` — new, 34 entries scaffolded
- `backend/contexts.js` — new, 4 live + 25 needs_review
- `backend/lists.js` — `TEMPLATES` now imported from `contexts.js`; legacy
  inline definition removed
- `docs/r5b-coverage-audit.md` — this report

## Verification

- All four existing Lists templates (`tpl_newborn`, `tpl_vacation`,
  `tpl_lunches`, `tpl_pantry`) load through `contexts.js → lists.js` with
  identical item arrays as before. Confirmed via direct round-trip:

  ```
  tpl_newborn: 7 items — Diapers, Baby wash, Nursing pads, Swaddles, Pacifiers, Baby wipes, Formula
  tpl_vacation: 6 items — Sunscreen, Bug spray, Travel snacks, Hand sanitizer, Kid Tylenol, First aid spray
  tpl_lunches: 6 items — Yogurt pouches, Fruit pouches, Granola bars, Juice boxes, Sandwich bread, Deli turkey
  tpl_pantry: 6 items — Olive oil, Pasta, Canned tomatoes, Rice, Peanut butter, Cereal
  ```

- `node -c` passes on all three backend files.
- `npm run build` passes (no frontend changes).
- `backend/knowledge.js` and `backend/contexts.js` are not wired into any
  endpoint. They sit on disk awaiting R5b's Ask mode backend.
