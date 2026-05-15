# CLAUDE.md

Guidance for Claude Code working in this repo.

---

## Project Overview

Partiqule — AI-powered product health scoring app. Search, scan a barcode, or photograph a product → 1-10 risk score with chemical concerns, child/pregnancy safety scores, and curated alternatives. **Lower score = safer.**

Paul is CEO/developer. Sara is co-founder (content + Instagram).

---

## Development Commands

```bash
# Backend (port 3001)
cd backend && npm install && node server.js

# Frontend (port 3000, proxies API to backend)
cd frontend && npm install && npm run dev

# Production build (also generates 2,400+ SEO pages)
cd frontend && npm run build

# Regression tests (zero API cost)
cd backend && npm test

# iOS build
cd frontend && npm run build && npx cap sync ios && npx cap open ios

# Deploy
./deploy.sh "commit message"
```

Backend requires `backend/.env` with `ANTHROPIC_API_KEY` at minimum. See `backend/.env.example`.

**Cache invalidation** after backend logic changes:
```bash
# Clears in-memory only (Redis + disk survive)
curl "https://partiqule-production.up.railway.app/cache-clear" -H "x-admin-key: $ADMIN_KEY"

# Clears all 3 layers for one product (use for deterministic scoring fixes)
curl "https://partiqule-production.up.railway.app/cache-clear-product?name=abes+mini+muffins" -H "x-admin-key: $ADMIN_KEY"
```

Cache keys are prefixed with `v<8-char-sha>` of the prompts. Prompt edits auto-invalidate via key change. Only deterministic changes (substance floors, calibration, NOVA inference) require per-product clearing.

`ADMIN_KEY` set in Railway. No hardcoded fallback. Header preferred over `?key=`.

**Commit messages:** plain English, no special chars, no em dashes (break terminal quote parsing).

---

## Architecture

**Frontend:** React 18 + Vite. Single monolithic `frontend/src/App.jsx` (~9,800 lines), inline styles only, `useState` only. Capacitor wraps for iOS (StoreKit IAP via `@capgo/native-purchases`, dynamic import).

**Backend:** Express in `backend/server.js` (~6,900 lines). All endpoints, scoring, caching, intelligence pipeline.

### Scoring pipeline

1. **Pass 0** — `backend/pass0.js` resolves verified ingredients (OFF → OBF → OPF → barcode_index → barcode_external → Supabase scans → vision OCR stub). Source + confidence + URL persisted on result.
2. **Pass 1** — Claude Haiku scores 5 dimensions (materials, usage, packaging, sustainability, manufacturing) with verified ingredients as ground truth.
3. **Pass 2** — independent verification. Skipped when Pass 1 returns high confidence with non-flat dim scores and no web context.
4. Web search runs in parallel with Pass 1.
5. **Final score** = weighted formula by category (see weights below).
6. **Substance floors** — 118 hardcoded chemicals override AI scores on all 6 paths.
7. **NOVA bounds** — food/beverage only. NOVA 1 ceiling 3, NOVA 3 floor 4, NOVA 4 floor 7. Barcode reads OFF `nova_group` directly. Text/vision use `inferNovaGroupFromIngredients()` (markers: fortification vitamins, phosphates, syrups, HFCS, maltodextrin, isolates, lecithin, mono/diglycerides, gums, carrageenan, flavors, modified starches, hydrogenated oils, artificial sweeteners, FD&C colors, benzoates, sorbates, yeast extract, DATEM, polysorbates). 2+ markers → NOVA 4. Authoritative final clamp lives in `applyProductCalibration` (calibration.js). Traditional ferments exempt via calibration.
8. **Regulatory flags** from Supabase injected into Pass 1 prompt.
9. **Calibration registry** (`backend/calibration.js`, 3,039 entries) overrides AI entirely.
10. **Child scores** via `computeSafetyScores()` + `shouldComputeChildScore()` (all household categories).
11. **Pregnancy scores** via `computeSafetyScores()` on every path including image.
12. **Consistency checks** — catch hallucinations (label contradictions, inert material ceilings).
13. **Positive ceilings** — cap USDA Organic + Non-GMO at 3; personal_care at 3 with 3-layer agreement; clothing at 3 with GOTS/OEKO-TEX + no disqualifier.
14. **Intel cards** attached via 2-min in-memory cache.
15. **Calibration entry category wins** over detected category for weight selection (prevents pajamas scoring with baby weights).

### Textile scoring (clothing / baby)

Clothing and baby-clothing scans bypass Pass 1 / Pass 2 / web cascade entirely. The deterministic textile scorer (`backend/textileScorer.js`) takes a parsed fiber composition and returns a score with three per-vector dimensions in 3–5 seconds.

- **`textileScorer.js`** — 26-fiber FIBER_TABLE (cotton, polyester, acrylic, nylon, elastane, wool, linen, hemp, silk, cashmere, down, tencel, modal, viscose, bamboo viscose, leather variants), each with `base / shed / mfg / skin / synthetic` properties. `parseComposition` extracts `XX% fiber` pairs from label_ingredients via regex + alias map. `scoreComposition` weights per fiber, applies blend bump (>30% synthetic in multi-fiber blends), cert shifts (GOTS / OEKO-TEX 100 / Bluesign / Cradle to Cradle), kid-mode skin bump, and sleepwear elastane floor (≥6 for stretch pajamas). Returns `score`, `precise_score`, `short_verdict`, `explanation`, `skin_score`, `shed_score`, `mfg_score`, plus a `breakdown` for diagnostics.

- **Mode B — textile_fast_path** (label-driven): Vision V2 image-scan path. When `surface_type` is care_label and `label_ingredients` contains parseable fiber percentages, route directly to `scoreComposition` and return. Bypasses calibration, cache, OFF, Tier 4, Pass 1/2.

- **Mode A — textile_cascade_path** (cascade-driven): When the cascade returned composition for a textile category (Tier 4 hit on a brand site), route through `scoreComposition` instead of Pass 1/2. Same scoring math as Mode B so identical garments score identically regardless of which surface the user photographed. Generic-query honesty: if `cascadeQuery` matches `^(brand) (jacket|shirt|pants|...)\s*$`, set `confidence/source_confidence = "estimated"` and source_label to "Estimated from product type. Scan the care tag for a verified score."

- **Style code routing**: When vision extracts `identification.style_code` matching `/^[A-Z0-9]{4,12}(-[A-Z0-9]{1,6})?$/i`, the cascade query becomes `"${brand} ${style_code}"` instead of `"${brand} ${product_name}"`. Brand-level fuzzy calibration is bypassed when style_code is present (precise SKU > generic brand entry).

- **Textile cascade-miss confirmation gate**: When clothing/baby cascade misses entirely (Tier 3 + Tier 4 both miss), backend returns `{status: "needs_confirmation", confirmation_kind: "textile_cascade_miss", identified.editable_name}`. Frontend renders the editable confirmation card; user can confirm as-is or edit the name and retry. Resume body carries `edited_name`, backend overrides `identification.product_name` and re-runs cascade.

- **Per-vector dimensions for textile**: Result `dimensions` carries `skin_exposure / shedding / manufacturing` (not the food-pipeline `materials / usage_exposure / packaging / sustainability`). Result also carries `dimension_layout: [{key, label, weight}, ...]` so the frontend BREAKING IT DOWN block iterates layout-driven instead of hardcoded keys. Non-textile scans still get the legacy four-vector layout.

- **Streaming register C enrichment**: `POST /enrich-explanation` returns a 4–6 sentence citation-aware long-form explanation (Browne 2011, Henry 2019, Marfella 2024 NEJM, Amato-Lourenco 2021 THORAX, named chemistries — PFAS / azo dyes / formaldehyde / phthalates / chromium VI, EU regulatory bans, GOTS/OEKO-TEX/Bluesign references). Score is fixed; the prompt forbids verdict-softening language. Frontend fires this on detail-view mount (not scan-complete) so users who don't open the deeper Why don't burn the API call. Result swaps in via keyed div with `whyFadeIn` opacity transition. Backend uses `callClaudeText` (plain-text companion to `callClaude`, no JSON parsing).

- **Cross-family fuzzy calibration block**: `CATEGORY_FAMILIES` defines compatible category groups (textile/wearable, topical, ingested, household, toy). `fuzzyCalibrationLookup` accepts a `visionCategoryHint` that gates phase-4 substring matches; cross-family hits are dropped (`fuzzy_calibration_category_blocked`). Prevents textile scans like "PINK STRAWBERRIES/TIYRTZ" from cross-matching to a food calibration entry on the substring "strawberries".

### Category weights

```
Food/beverage:    Materials 90% + Packaging 10%
Restaurant:       Materials 90% + Packaging 10%
Supplement:       Materials 65% + Exposure 25% + Packaging 10%
Personal care:    Materials 45% + Exposure 45% + Packaging 5% + Sustainability 5%
Clothing:         Materials 35% + Exposure 30% + Sustainability 35%
Home/cleaning:    Materials 30% + Exposure 45% + Packaging 10% + Sustainability 15%
Baby:             Materials 55% + Exposure 40% + Packaging 5%
Toys:             Materials 50% + Exposure 40% + Packaging 5% + Sustainability 5%
```

### Caching

In-memory Map → Upstash Redis (90d TTL) → disk fallback (`/tmp/partiqule_cache.json`). Reads cascade through layers; writes populate all three. Prompt-version prefix on cache keys (see `backend/cacheKeys.js`).

**Pre-Pass-0 entries auto-evict** on cache hit. Any cached result lacking `ingredient_source` is dropped from memory + Redis and re-scored fresh. Image-path scans currently don't write `ingredient_source`, so they're effectively uncached until OCR is wired into Pass 0.

### Intelligence feed

1. Daily 7am UTC: 18 RSS feeds (EU/US/intl health sources)
2. Filter by 120+ keywords, skip >14d old
3. Haiku writes card copy, jurisdiction-aware
4. Saved as drafts (active: false) for admin review
5. On approval: regulatory flags extracted + injected into scoring
6. Live cards appear in For You carousel, Feed page, relevant scan results

---

## Ten Design Laws

Apply to every change. If a design choice conflicts with a law, the law wins.

```
01 Value in 30 seconds      no paywall/tutorial/input before first result
02 Score never destination  every score has a next action visible without scrolling
03 Surfaces are earned      features appear when behavior triggers them
04 One decision per moment  one primary action per screen/card
05 Completion is ceremony   audits get grade + share card + clear next step
06 Constraint = personal    budget/mode framed as telling app about you
07 Flow protects itself     task modes hide nav, preserve session indefinitely
08 Honest over comfortable  scores never softened, flags name compounds
09 Context makes score      every score shown with category average or trend
10 Share is native          every completion has a purpose-built share card
```

**Score color thresholds (never change):**
- ≤ 3.0 → `#16a34a` green   (bg `#f0fdf4`)
- ≤ 5.0 → `#d97706` amber   (bg `#fffbeb`)
- > 5.0 → `#dc2626` red     (bg `#fef2f2`)

**ScoreBadge component** renders score numbers identically across surfaces. Never use ad-hoc inline color logic for scores.

---

## Key Files

- `frontend/src/App.jsx` — entire React UI, all components defined as const functions
- `frontend/vite.config.js` — build target `safari15` for WKWebView
- `frontend/public/sw.js` — service worker (currently `partiqule-v10`)
- `frontend/scripts/generate-product-pages.js` — generates 2,400+ SEO pages
- `frontend/scripts/fingerprint-og.js` — postbuild step, content-hashes og:image URLs
- `backend/server.js` — all API endpoints, scoring, caching, intel feed
- `backend/calibration.js` — 3,039 product entries
- `backend/cacheKeys.js` — shared cache-key + prompt-version helpers (used by server + preload_redis)
- `backend/pass0.js` — ingredient resolution
- `backend/scoringCascade.js` — five-tier text cascade + whole-foods detector
- `backend/textileScorer.js` — deterministic textile fiber scorer (26-fiber table, blend math, cert shifts, kid mode, sleepwear floor, per-vector outputs)
- `backend/visionContract.js` — vision identify → cascade-verify → score; emits `surface_type / style_code / barcode / color / price` on hangtag scans
- `backend/products.js` — 420+ affiliate alternatives
- `backend/amazon-api.js` — Amazon Creators API (tag: `partiqule-20`)

---

## Navigation

**Bottom nav (mobile):** Home | Feed | Scan FAB | Lists | Profile
**Desktop nav:** About | Feed | The Science | Lists | Audit | My Scans
**Hamburger (≤1024px):** About, Science, How it Works, Guides, My Routine, My Scans, Audit, Settings, Admin

`isTablet = width >= 768 && width <= 1024`. iPad gets hamburger. All mobile UI uses `(isMobile || isTablet)`.

---

## API Endpoints

**Public:** `POST /analyze`, `POST /barcode`, `POST /enrich-explanation`, `GET /search`, `GET /health`, `GET /api/intelligence-cards`, `POST /api/recipe-ingredients`, `GET /api/price-lookup`, `GET /min-version`

**User (require Supabase JWT):** `POST /subscribe`, `POST /delete-account`, `POST /create-checkout`, `GET /scan-count`, `GET /subscription-status`, `POST /score-feedback`, `POST /suggest`, `POST /verify-apple-receipt`, `POST /apple-iap-confirm`

**Intel (admin):** `GET /api/intelligence/all`, `POST /api/intelligence/approve/:id`, `DELETE /api/intelligence/dismiss/:id`, `POST /api/intelligence/run`, `POST/PATCH/DELETE /api/intelligence-cards*`

**Admin:** `GET /admin/api-budget`, `GET /admin/reload-redis`, `GET/POST/DELETE /admin/calibration`, `GET /cache-status`, `GET /cache-clear`, `GET /cache-clear-product`, `GET /cache-clear-barcode`, `GET /recent-scans`, `GET /score-feedback`, `POST /score-feedback/resolve`, `POST /admin/flag-detection-diff`

---

## localStorage Keys

```
ps_history, ps_lists, ps_scan_count, ps_email_captured, ps_font_scale,
ps_audit_session, ps_last_audit, ps_feed_last_visit
partiqule_child_mode, partiqule_pregnancy_mode, partiqule_display_name
pq_visits, pq_foryou
```

---

## Supabase Tables (verified production state)

**Exist:** `profiles`, `scans`, `guides`, `score_feedback`, `intelligence_cards`, `regulatory_flags`, `product_safety_findings`

**Don't exist (endpoints touching them silently 500):** `subscriptions` (removed from `/apple-iap-confirm`), `suggestions` (`/suggest` 500s), `calibration_overrides` (`/admin/calibration` 500s)

All tables have RLS enabled. Backend uses service role key (bypasses RLS); frontend anon key respects policies.

**Auto-create profile on signup** — trigger `on_auth_user_created` runs `INSERT INTO profiles (id, email)` from `auth.users`. Required to prevent IAP attribution failures.

**SECURITY DEFINER function rule.** All SECURITY DEFINER functions must include `SET search_path = public, pg_catalog` and schema-qualify every table reference. Supabase can change the role that executes auth triggers without notice, and unqualified SECURITY DEFINER functions break silently when this happens. See migration 015 for the canonical fix pattern.

---

## Current Feature State

**LIVE:**
- **Textile scoring (flagship category)** — clothing and baby-clothing scans run through the deterministic 26-fiber `textileScorer` end-to-end: Mode B (label-driven fast path) and Mode A (cascade-driven fast path) both bypass Pass 1/2; per-vector dimensions (Skin Exposure / Microfiber Shedding / Manufacturing Impact) replace the food-pipeline four-vector; user-correction loop via `textile_cascade_miss` confirmation card with editable product name; brand+style_code preference for hangtag scans; cross-family fuzzy calibration block; honest "estimated" labeling on generic-query cascade hits; streaming register C enrichment via `/enrich-explanation` with citation-aware voice, rendered with shimmer dot on detail-view mount.
- Scan (text + barcode + image), calibration, alternatives (Amazon/Brand/Target)
- Kids Mode + Pregnancy Mode (localStorage persist)
- ScoreBadge, score context line, CTA hierarchy on result
- Match picker, source confidence badge, ingredient source line
- Room tagging, My Routine, scan history (date/room toggle)
- Home coverage card, lifestyle score card, For You carousel, Feed page
- Intel cards on relevant scans (product-family + specific-SKU + 30d history)
- Audit flow (5 types: pantry, beauty, home, closet, nursery) + completion ceremony
- Lists page (3 tabs: grocery, shopping, routine), recipe ingredient expansion
- Stripe + Apple IAP with Restore Purchases, account deletion
- Guides platform, admin Intel Cards tab with retag editor
- Bottom sheet scan modal (photo-first, barcode secondary)
- Display name collection, Settings page, Danger Zone
- Whole-foods detector + sourcing flag chips (wild caught, organic, grass-fed, etc.)
- Auth-refresh on 401 via `authedFetch` wrapper
- Min-version enforcement (UpdateRequiredView)
- Per-product OG cards with content-hash fingerprinting

**On the horizon:**
1. **Framing guide + camera UX redesign** — most clothing scans hit `label_legibility="unreadable"` because users photograph hangtags from arm's length without knowing the model needs the care label up close. A camera viewfinder with a guide reticle and surface-aware coaching ("hold the care tag flat, fill the frame") would lift Mode B fire-rate from ~10% to most clothing scans.
2. **Lateral extension of textile patterns to food and personal care** — the deterministic-scorer + register C enrichment + per-vector dimensions + user-correction loop pattern proved out on textiles. Same architecture should extend to food (dimensions: ingredient quality / processing / additives) and personal care (ingredient safety / endocrine load / dermal absorption) replacing the current Pass 1 monolith.
3. **Structured typing with brand autocomplete** — the text-search path today has no awareness of what's calibrated. Brand autocomplete from the calibration table would push users toward queries the system can answer authoritatively, reducing fuzzy-match misfires and Tier 5 best-guess responses.

---

## 2026-05-05 SESSION

Engine deployed in Phase 1 shadow mode. `backend/foodScorer.js` produces deterministic scoring at 0.080-2ms vs `legacy_ai` 9-32 seconds. Engine integrated in `/analyze` for both text cascade and image-V2 paths. Bucket 1 (10 colors) + Bucket 2 (7 preservatives) calibration foundation complete. Phase 1 data accumulation begins now via `food_scorer_shadow` log events. After ~1 week of data, run aggregation queries for Phase 2 promotion decision. Image-legacy path integration deferred to follow-up. Strategic position: "system too slow to push" objection has concrete path to resolution via Phase 2 user-facing engine promotion.

**Phase 1 shadow log shape** (greppable in Railway via `food_scorer_shadow`):
- `event`, `product_name`, `category`, `input_mode` (`text`|`image`), `ingredient_source` (`cascade_resolved`|`label_ocr`)
- `engine_status` (`scored`|`insufficient_coverage`|`out_of_scope`|`no_ingredients`|`engine_error`), `engine_score`, `engine_latency_ms`
- `cascade_score`, `cascade_latency_ms`, `delta`
- `matched_count`, `unmatched_count`, `unmatched_ingredients[]` (calibration roadmap data)
- For `scored`: `top_match_name`, `top_match_score`, `matched_keys[]`, `calculation_notes`
- For `insufficient_coverage`: `total_weight` (signal-strength near-miss diagnostics)

**Engine architecture:**
- Position-weighted hybrid scoring: `weighted_average` aggregated against `max(score) - 1` floor, clamped to `[1, 9]`
- Coverage gate (`W_MIN = 0.30`): engine runs only if total position weight of matched ingredients ≥ threshold; otherwise returns `insufficient_coverage`
- Dedupe by entry key (e.g., `sodium benzoate` + `potassium benzoate` → one match for `benzoates` at first-occurrence position)
- NOVA classification deferred to Phase 2 (calibration entries carry `nova_typical` field but engine doesn't consume yet)
- Engine fires only on cache misses to non-bypass paths; `productId` short-circuit and cache-hit paths don't trigger shadow log (expected — those are calibrated/cached and not the comparison case)

**Today's commits (six total):**
1. `3282683` — Pretzel petroleum dye fabrication hotfix (defamation-class, P0): restricted `flagText` corpus to structured detection, dropping narrative-text negation false positives
2. `3bbfec9` — SW v11 cache bump: closed Bug 3 operational metadata regression by forcing browsers to revalidate against latest App.jsx
3. `064a98f` — Word boundary discipline across 42 substance-matching rules: dropped greedy catchalls and 2-char acronym risks
4. `bdbe7a5` — Bucket 2 preservatives complete (7 entries: sodium nitrite, sulfites, BHA, BHT, benzoates, sorbates, propionates)
5. `2f31b07` — `foodScorer.js` engine + 35 lake-variant aliases + text cascade integration in shadow mode
6. `a110de1` — Image-V2 path engine integration with uniform `input_mode` and `ingredient_source` logging fields

**Production verification:**
- Twizzlers (text): `engine_status: insufficient_coverage`, `total_weight: 0.15`, 18 unmatched ingredients (real Bucket 3-7 calibration roadmap data)
- Baja Blast (text): scored 6, cascade scored 8, delta -2, hybrid floor activated correctly via Yellow 5/Blue 1
- Hearty Bar (image): `insufficient_coverage` (clean-label gap), `input_mode: image`, `ingredient_source` field populating

**Phase 2 promotion criteria** (target: ~1 week from now):
- Aggregate `delta` distribution across `engine_status: scored` events
- Identify systematic disagreements (engine vs cascade) and triage
- Surface most-frequent `unmatched_ingredients` for Bucket 3-7 prioritization
- If agreement rate is high enough and unmatched roadmap is well-prioritized, promote engine to user-facing for `engine_status: scored` results

---

## Known Bugs

- **Vision OCR ceiling on hangtags.** Most hangtag scans return `confidence=0.35`, `brand=null`, generic placeholder names ("BOYS 2PC"), and `label_legibility="unreadable"`. The hangtag prompt extraction works in principle but Haiku misses brand wordmarks and style codes at typical phone-shot distance. Manifests as legacy 0.30-0.45 confirmation gate firing constantly on clothing scans. Fix is upstream (camera UX), not a prompt change.
- **FTC disclosure phrasing not firing Mode B.** Strings like `"Made with at least 30% recycled polyester (exclusive of trimmings, ornamentation, interlinings and linage)"` parse to one fiber via `parseComposition`, but Mode B's gate sometimes skips. Likely interaction between `label_legibility="partial"` and the fiber-percentage detector. Repro: scan a Target pajama hangtag with visible "30% recycled polyester" disclosure.
- **Generic-query regex misses brand-less patterns.** `genericProductRegex` requires `^(brand-or-leading-words)? (jacket|shirt|...)\s*$`. When vision returns a brand-less generic name like just "BOYS 2PC", `isGenericQuery` doesn't fire because the pattern requires a category-level word. Users see `confidence: "high"` on a textile_cascade_path result that should read "estimated."
- **`/barcode` does not route clothing through textile scorer.** Hangtag UPCs (when they resolve at all — UPCitemDB rejects most apparel "in-store use" 19xxx codes as INVALID_UPC) currently fall through to Pass 1 with empty ingredients. Routing should detect clothing category from OFF/external response and either short-circuit to Mode A with the resolved name or seed a calibration entry; today it does neither.
- **Calibration short-circuit precision.** `barcode_index` and `barcode_external` short-circuits use the resolved name + fuzzy calibration. The fuzzy lookup is now category-gated, but exact-match calibration on a generic resolved name (e.g. "Nike Athletic Shorts") still claims any size/colorway of that style with the same score. Acceptable for narrowly-named entries; risky for brand-prefix entries.
- **Whole-food detector accepts bare digit strings.** `/analyze` with `query="199012607584"` (a bare UPC string) routes through `detectWholeFood` and returns "Whole white fish" boilerplate. The detector should reject pure-numeric inputs before consulting the whole-food pattern table.
- **PENDING: Fuzzy calibration path returns `child_score: null` across all categories for products without an explicit `kidsFloor` on their calibration entry.** Confirmed via 10-product test on 2026-05-04: Banana Boat (personal_care), Skittles (food), Tide Evo (home), Maraschino Cherries (food, calibration entry missing entirely) all return adult score correctly but null `child_score`. Lucky Charms (food, has `kidsFloor`) is the only product on the test list with a working kid delta. `pregnancy_score` works correctly across categories.

  Two architectural fix options:
  (a) Populate `kidsFloor` on every fuzzy calibration entry. Data work, no code changes, but requires retroactive entry update.
  (b) Route `fuzzy_cal_hit` results through category-specific deterministic scorers (`personalCareScorer`, plus equivalents for food/home/textile) that compute kid scores from ingredient calibration data. Code work, but architecturally cleaner and self-maintaining as calibration entries are added.

  Diagnose in a separate session. Half-day scope minimum.

  **Bug priority elevated 2026-05-06:** kid_score null bug now strategically critical because the family framing addendum's kid-elevated risk dashboard finding depends on kid_score data being computable. If kid_score returns null for products covered by current calibration, the strongest family-framing dashboard finding doesn't work yet. Fix should be prioritized before dashboard Track 4 (findings engine) implementation begins. Dashboard sequencing per `docs/dashboard-implementation-spec.html` now requires this bug fixed as part of Track 0 calibration prerequisites. Surfaced again 2026-05-06 during Sara's sucralose carousel scan validation: all 5 scanned products (Splenda Sugar Blend, Quest Protein Cookies, Wholesome Cane Sugar, Crown Maple Syrup, Lakanto Monk Fruit) returned `kid_score: null` across both `calibration_short_circuit` and `legacy_ai` paths, blocking kid-delta carousel framing.
- **PENDING: `CHILD_CONCERN_SUBSTANCES` coverage gaps.** Today's UV filter addition (commit 0ecf4d6) fixed one ingredient family. Other ingredient families that fire pregnancy concerns but lack kid concern entries: retinoids, salicylic acid (high concentration), aluminum compounds, formaldehyde-releasing preservatives beyond parabens. Each gap should be diagnosed against real production scan data once instrumentation has accumulated 48-72 hours of traffic. Adding entries without scan data risks miscalibrating bumps for products users don't actually scan.
- **PENDING: Skittles routing fuzzy_cal_hit vs web_search inconsistency.** Live test 2026-05-04 returned score 7 from web_search path despite calibration.js having a skittles entry with midScore 8. Response metadata: `scoring_path: cache_hit`, `original_scoring_path: legacy_ai`, `source: web_search` — the cached value was originally produced by Pass 1 going through Tier 4, not calibration. Either the originating scan predated the skittles calibration entry, or some path skipped the Tier 1 calibration check (`skipFuzzyCalibration` flag, productId bypass). Diagnose in a separate session.
- **PENDING: Primary-source verification needed for synthetic dye prevalence statistics** ("19% of US packaged foods", "14% Red 40", "28% child-marketed categories", "79% sports drinks") before these numbers are used in Sara content. Numbers come from media coverage of Dunford et al. 2025 in Journal of the Academy of Nutrition and Dietetics ("All the Colors of the Rainbow: Synthetic Dyes in US Packaged Foods and Beverages in 2020"). Verify exact figures from the primary paper before downstream content use.
- **PENDING: Toy category kid_score calibration over-bumps.** LEGO at 9 in kid mode reflects category-wide miscalibration of kid bumps for plastic toys. Audit toy scans separately (pull 20-30 toy scans, examine score / child_score deltas) before adjusting. Surfaced 2026-05-04 during LEGO scan investigation; styrene regex bug was the primary cause but residual over-bumping may exist.
- **PENDING: Operational metadata regression.** scoring_path, input_mode, latency_ms, original_scoring_path returning NULL on all recent scans (verified 2026-05-04 across 5-scan sample spanning 8 hours). Either stampFresh/stampCacheHit not firing on terminal response paths in /analyze and /barcode, OR frontend saveToCloud not whitelisting these fields. Blocks Day 2 morning production-data review per docs/foodscorer-plan.md. Investigate in dedicated session. (2026-05-05 partial diagnosis: backend stamping confirmed working live for fresh + cache-hit paths, frontend whitelist confirmed in code at App.jsx:6637-6640; remaining hypothesis is service-worker stale-cache delivering pre-37a65ef App.jsx to browsers. SW bump to partiqule-v11 prepared but not yet shipped pending separate verification.)
- **PENDING: backend/server.js:703 substance-floor rules have the same negation-vulnerability class as the kid bump corpus** (Bug fixed 2026-05-05 via flagText corpus restriction). The substance-floor rules operate on a different code path applying floors rather than bumps, but if they match against narrative text fields they could fabricate substance-specific floor applications. Audit needed: identify what input text the substance-floor rules see, restrict to structured detection arrays only if narrative is in the corpus. Surfaced 2026-05-05 during Pretzel Crisps petroleum dye fabrication investigation.
- **PENDING: Tier 4 web search narrative may include unverified scientific claims** (e.g., "study found X" without source attribution). Surfaced 2026-05-06 during Quest Protein Cookies scan: Tier 4 web_search returned `flagged_substances: ["Sucralose — chlorinated compound; 2023 study found genotoxicity markers; gut microbiome disruption"]` sourced from questnutrition.com narrative, with no citation backing the "2023 genotoxicity markers" claim. Same fabrication risk class as the 2026-05-05 Pretzel Crisps petroleum dye incident — AI generating substance-specific scientific claims from web narrative without verified source backing. Audit needed: identify whether Tier 4 narrative output should be filtered to remove unsourced study references at parse time, or whether the Pass 1 / Tier 4 prompt should be tightened to require source attribution for any "study found X" or "research showed Y" claims. Until fix lands, treat any substance-specific scientific claim in `flagged_substances` from a `legacy_ai` + `web_search` path as unverified — never quote in Sara content without primary-source check.
- **Bug 5 (deferred): visionCat instability across image scans.** Vision LLM may return different `identification.category` on repeat photos of the same product (e.g., "food" vs "snack"). Even with the 2026-05-05 productName-cache-key fix, category drift causes cache misses on repeat scans. Lower frequency than the productName issue but worth tracking. Fix would require canonicalizing category at write time or using deterministic `detectCategoryFast()` output exclusively as cache key category. Defer to dedicated session.
- **Bug 6 (deferred): productName instability across image scans.** Vision may return "Pretzel Crisps" once and "Pretzel Crisps Original" next time. Lowercase-trim normalization in `cacheKey()` doesn't bridge this. Real cache miss path even after the 2026-05-05 fix. Would require fuzzy match at lookup time or explicit canonicalization at write time. Architectural change, defer to dedicated session.

---

## Critical Conventions

### iOS / Capacitor
- `@capgo/native-purchases` via dynamic `import()`, NOT `require()`
- Build target `safari15` in vite.config.js
- After frontend changes: `npm run build && npx cap sync ios`
- `IS_NATIVE` uses `window.Capacitor.isNativePlatform()`, not width
- iPad (820px) gets tablet treatment

### The duplicate import bug
When copying App.jsx from external sources, line 4 often re-introduces `import { NativePurchases, PURCHASE_TYPE } from "@capgo/native-purchases"` which conflicts with line 2's `let`. Check first 5 lines after copying.

### The stale closure bug
Multiple async ops updating same `lists` state capture stale snapshots. Use functional `saveLists(prev => prev.map(...))` for ALL async updates.

### API spend
Hard daily cap (default 500) + monthly cap (default 5000). Override via `API_DAILY_CAP` / `API_MONTHLY_CAP`. Never bulk without confirming.

### 6 scoring paths must stay in sync
text, vision, text-fuzzy, vision-fuzzy, barcode, admin-reload. All must:
- Use `serializeAlternatives()` and `computeSafetyScores()`
- Include `category_score_context`
- Enforce substance floors via `applySubstanceFloors()`
- Set `ingredient_source` on result (image path is the gap)
- Preserve `raw_concerns` separately from `concerns` (NOVA 4 marker lives here)
- Fresh paths call `attachIntelCards()` before `res.json()`

### Operational metadata on scan results

Every scored result carries four operational fields persisted to `scans.result_json` for analytics. Set by backend, whitelisted by frontend `saveToCloud`. Confirmation/refusal responses do NOT persist (frontend skips `saveToCloud` for those) — they live in Railway logs only.

**input_mode** (5 values): `text` | `image` | `productId` | `identificationId` | `barcode`. Set once at handler entry from `req.body` shape.

**scoring_path** (8 values): `fast_path` | `cascade_path` | `cache_hit` | `barcode` | `calibration_short_circuit` | `legacy_ai` | `confirmation_pending` | `refused`. Bucketed value, NOT the granular log label. Granular labels (`textile_fast_path`, `personal_care_cascade_path`, `vision_cascade_tier5`, etc.) continue to be emitted to Railway logs unchanged. Bucket rules:
- `fast_path` — Mode B (label OCR) deterministic scorer
- `cascade_path` — Mode A (web search) deterministic scorer
- `cache_hit` — full prior result returned without re-scoring
- `barcode` — UPC resolved via barcode_index/barcode_external + calibration
- `calibration_short_circuit` — fuzzy_cal_hit, productId match, vision cascade calibration
- `legacy_ai` — Pass 1/Pass 2 ran (any path)
- `confirmation_pending` / `refused` — set on response objects but not persisted to Supabase, since `saveToCloud` skips confirmation/refusal responses by design. The enum values exist for forward compatibility; if confirmation persistence is added later, no enum extension needed.

**original_scoring_path**: only meaningful when `scoring_path = "cache_hit"`. Carries the bucket the cached value was originally produced under, so cache-hit analytics retain causal fidelity. `null` on fresh paths.

**latency_ms**: backend-measured handler latency (`Date.now() - requestStartMs`). Stamped per-request. NEVER cached — `stampFresh` runs after `cacheSet` so cached payloads don't carry a stale latency.

Helpers in server.js: `stampFresh(result, inputMode, scoringPath, requestStartMs)` for fresh paths, `stampCacheHit(cached, inputMode, requestStartMs)` for cache-read paths. If a new terminal `stream.complete` / `res.json` is added in `/analyze` or `/barcode`, it MUST stamp.

### Category detection
`detectCategory()` order matters. Baby personal_care ("baby shampoo") routes to personal_care BEFORE baby. 13 categories. Null falls back to "other". **Calibration category wins over detected category** for weight selection.

### Alternatives matching (`findAlternatives` in products.js)
- Synonym expansion (pad → menstrual/period; blouse → top/shirt/women)
- Brand-keyword injection (Always → menstrual/pads; Lululemon → activewear/leggings)
- Gender penalty (-15 for cross-gender)
- Age exclusion (kids products score=0 for adult queries)
- `STRICT_CATEGORIES` enforces same-category for clothing
- `BLOCK_OTHER` excludes "other" for supplement/personal_care/baby
- **Calibration dedup:** nutrition-only entries must NOT appear AFTER full entries (Map.set overwrites — last wins)

### Security
- `ADMIN_KEY` env var only, no hardcoded fallback
- All admin requests audit-logged
- User input sanitized (`/analyze` 300 char cap, control chars stripped)
- Barcode validated as 4-14 digits
- Recipe ingredients sanitized (200 char cap, servings 1-100)
- Intel card mutations validated against `INTEL_CARD_FIELDS` allowlist
- Internal errors never exposed to client
- `/cache-clear` rate-limited to 1/min
- **`requireUserAuth` middleware:** `/delete-account`, `/apple-iap-confirm`, `/analyze` scan-count increment require Supabase JWT. userId from token's `sub` claim, never request body.
- **Apple receipts cryptographically verified** (JWS payload bundleId+productId match, or legacy verifyReceipt fallback) before flipping `is_subscribed`
- **Atomic scan-count increment** via `increment_scan_count(uid)` RPC. Fallback (non-atomic) still works if RPC missing.
- **RLS on all 7 tables**

### Frontend styling
100% inline JS styles (camelCase). Dark mode is `isDark` boolean (always true). Mobile `< 768`, tablet `768-1024`. **No CSS files except `tokens.css`.**

### Calibration entry integrity
Brands reformulate. Verify ingredients against current package/manufacturer/recent-OFF, not memory. Include `Ingredients verified MM YYYY` in `reason` field. **Listing substances a product no longer contains is a defamation risk.**

### Substance-matching regex discipline
Substance-matching regex patterns in `CHILD_CONCERN_SUBSTANCES`, `PREGNANCY_CONCERN_SUBSTANCES`, and similar scoring rules MUST use word boundaries (`\b...\b`). Substring matching (e.g., `/styrene/` matching inside "acrylonitrile butadiene styrene") causes defamation-class false positives by attributing substances to products that don't contain them. The 2026-05-04 LEGO benzene fabrication bug was caused by missing word boundaries on a polymer-name-matching regex. Audit all substance-matching regex rules periodically for this failure mode. When a regex matches multiple substances (e.g., `/toluene|xylene|benzene/`), the reason text MUST attribute the correct matched substance, not a hardcoded one — split into separate rules per substance instead.

### Substance-matching corpus rule
Substance-matching regex MUST run only against structured detection arrays (`flagged_substances`, `substanceTriggers`), never against narrative text fields (`concerns`, `materials.concerns`, summaries). Narrative text contains negation phrases ("No X detected", "free of Y", "X-free", "below detection limit", "contamination unlikely") that regex cannot distinguish from positive substance presence. The 2026-05-05 Pretzel Crisps petroleum dye fabrication was caused by `/artificial.*dye/` matching inside "No artificial dyes or preservatives detected". The 2026-05-04 LEGO benzene fabrication was a related but distinct bug (substring matching inside polymer names, fixed via word boundaries). Both bugs share the underlying principle: substance-specific concerns must verify the substance is actually in the product's structured detection record before firing.

### foodIngredients.js schema semantics: booleans vs floors
The `*_concern` booleans (`pregnancy_concern`, `kid_concern`) on entries in `backend/foodIngredients.js` are **advisory metadata for explanation generation, NOT gates on scoring math**. The `*_score_floor` fields (`pregnancy_score_floor`, `kid_score_floor`) are **HARD MINIMUMS that always apply** in their respective modes regardless of the boolean value. Annatto extract is the canonical example: `kid_concern: false`, `kid_score_floor: 3` — the floor applies even though no active concern is flagged. Future `foodScorer.js` MUST implement floor logic unconditionally and use the booleans only for human-readable explanation text (e.g., "Annatto has no specific kid concern but a baseline floor of 3 applies" vs "Red 40 raises kid concern because of the McCann 2007 behavioral evidence...").

### PFAS auditing protocol
1. Cross-reference brand claims against Mamavation EPA-cert lab testing (or Consumer Reports, EWG, Toxic-Free Future)
2. For split-use brands, separate product lines: DWR items stay floor:5 until verified; cotton/fleece/lounge can score lower
3. Insert specific entries BEFORE brand defaults (Map iteration order wins via `startsWith`)
4. Cite investigations with dates in `reason`

### Session rules
- Always read CLAUDE.md before writing code
- Test on 390px viewport after UI changes
- **Before pushing any frontend refactor, render the React tree in a real browser.** `vite build` and `node -c` only catch syntax errors. `curl` smoke tests only exercise endpoints that don't render. Temporal-dead-zone bugs (a `useEffect` whose dep array references a `useState` declared later in the same component, an arrow-function `const` referenced before its line executes, a circular reference between module-scope helpers) are invisible to all of those and only surface when React actually calls the component. Workflow:
  ```bash
  cd frontend && npm run build && npx vite preview --port 5173
  # then load http://localhost:5173 in Chrome/Safari with DevTools → Console open
  # confirm: no red errors in console, app renders past first paint
  ```
  Bug class that motivated this rule: streamStage useEffect placed before its useState declaration in App.jsx — TDZ took down production with a "Cannot access 'Mt' before initialization" error that vite build, curl, and the regression test suite all passed. Only a real browser load would have caught it.
- **Backend response shape changes require frontend integration verification, not just backend math verification.** If a backend patch changes how the frontend reads response fields (new fields, removed fields, changed types like string→object), validate at least one full render path before push. The math test confirms the scoring logic; only frontend rendering confirms the wire contract. The triple-compute bug shipped because we verified backend math but not frontend render.
- **One feature per Claude Code session. Surgical patches only — never full-file overwrites mid-session.** If a session sprawls into a second feature, end the session and start a fresh one.
- **Verify before drafting.** For any work involving regulatory citations, scientific claims, or external facts (calibration entries, ingredient hazard data, regulatory references in product reasoning), each citation must be confirmed via web_search before being written to a file. Memory-based citations have produced errors three times and the verification step catches them before commit.
- **Embed JavaScript directly in Claude Code prompts** when adding calibration entries, scorer logic, or other code blocks. Avoid the dual-copy pattern of drafting in chat then pasting separately into a Claude Code prompt — embed the code in the prompt itself so the source of truth lives in one place and the apply step is verifiable.

---

## Five-Tier Cascade (text path)

`/analyze` text queries run cascade in `backend/scoringCascade.js`:

| # | Source | confidence | label |
|---|---|---|---|
| 1 | CALIBRATION map (exact/fuzzy) | `null` | "Verified formula" |
| 2 | Cache hit | inherited | inherited |
| 3 | OFF/OBF/OPF text search (trigram ≥0.7, non-empty ingredients, `complete` flag) | `medium` | "Sourced from Open Food Facts" (etc.) |
| 4 | Anthropic web_search (22s timeout, 2-attempt retry with `canonicalizeQuery`, `isTier4NameAcceptable` gate) | `medium` | "Sourced from <domain>" |
| 5 | Category-prior synthetic + whole-foods detector | `low` | "Best guess from product name" |

**Tier 5 never calls Pass 1.** Returns synthetic result with empty chemistry, `_skipCache: true`. Closes the fabrication path. Whole-foods detector intercepts before generic fallback (50+ patterns: wild fish, eggs, produce, dairy, conventional poultry, red meat, processed meats).

`dedupeInflight(query, category, fn)` collapses concurrent identical queries to one execution. 5-min slot cleanup.

**Tier 4 cost guard:** fires only on Tier 3 miss. Same `apiCallCounts` as `callClaude`.

**Don't loosen Tier 3 strictness** (similarity, complete flag, ingredient text checks) or Tier 4's `isTier4NameAcceptable` OR-gate without written reason — fabrication failure mode returns.

Result schema fields: `source` (machine), `source_label` (UI copy), `source_confidence` (`null`/`medium`/`low`).

---

## Vision Contract v2

Gated on `VISION_CONTRACT_V2=true`. Module: `backend/visionContract.js`. Flow:

1. **Identify** (`callClaudeVisionIdentify`) — slim Haiku call returns `{product_name, brand, variant, category, confidence, label_ingredients, label_legibility, reasoning}`. CONFIDENCE SCALE keyed to product-name visibility, decoupled from photo quality. Retailer-chrome filter (`looksLikeRetailerChrome`) strips Amazon/Target storefront text.
2. **Confidence gate:** no usable name OR `< 0.30` → `need_better_photo`. `0.30-0.45` → `needs_confirmation` modal. `≥ 0.45` → silent proceed.
3. **Cascade** — same 5-tier order, calibration → fuzzy → cache → Tier 3 → Tier 4 → Tier 5.
4. **Reconciliation** (`reconcileIngredients`) — agreement % logged; cascade always wins for scoring.
5. **Score** — calibration/Pass1/Tier5 same shape as text path.

Frontend: `App.jsx` `handleImageScan` branches on `data.status`. `needs_confirmation` opens cream-card modal. `needs_better_photo` takes over screen.

Cost: ~3x Haiku calls in cache-miss vs legacy (identify + Tier 4 + Pass 1). Latency worst case ~24s.

---

## Pre-release Calibration Status

Calibration entries can carry status fields for unshipped brands:

```js
["sports organics", {
  floor: 1, ceiling: 3,
  substances: [...], reason: "...", confidence: "medium",
  category: "clothing",
  status: "pre_release",
  statusNote: "Brand disclosure 2026-04-23...",
  statusExpectedRelease: "2026-Q3",
  verified: [
    { claim: "GOTS at fabric level", source: "brand disclosure", date: "2026-04", url: "..." },
  ],
  pending: [
    { claim: "Company-level GOTS", status: "in progress", wouldChangeScoreTo: 1, expectedBy: "2026-Q3" },
  ],
  thirdPartyReferences: [
    { source: "Bottlecup", url: "...", date: "2025-09", summary: "..." },
  ],
}]
```

`applyProductCalibration` propagates these to `result.release_status`. Frontend renders amber-outlined card above `category_score_context`. Score still renders.

**Workflow when brand reaches out:**
1. Web search agent for grounded research (NOT marketing copy)
2. Pre-launch → ship with `status: "pre_release"`, populate `verified[]` with disclosures, `pending[]` with awaiting items, `thirdPartyReferences[]` with independent coverage
3. When docs land: move rows pending → verified (don't copy), update `reason` with `Ingredients verified MM YYYY`
4. Once enough items verified, drop status fields entirely

---

## flagDetection

Deterministic substance detection in `backend/flagDetection.js`. Pre-AI run (when ingredients available, e.g. barcode OFF) injects findings into Pass 1 prompt as `DETERMINISTIC FLAGS DETECTED`. Post-AI `validateAIResponse` + `mergeFlags` checks claims against deterministic set per-pattern (not per-bucket — prevents AI fabrications surviving via sibling matches).

Disagreements logged as `[flag_detection_override]` only when `missingFromAI` has entries. Feature flag `FLAG_DETECTION_ENABLED` (default true).

Diff endpoint: `POST /admin/flag-detection-diff` `{productName}` returns oldScore/newScore/oldConcerns/newConcerns/deterministicFlags/aiInconsistencies.

---

## Intel Card Relevance

Cards fire when BOTH gates pass (`backend/intelMatch.js`):

1. **Relevance gate** — at least one of:
   - A) `card.product_families` includes scan's `product_family`
   - B) `card.specific_products` fuzzy-matches `product_name` (<10 chars: word-boundary; ≥10: bidirectional substring)
   - C) `card.product_families` ∩ user's 30d distinct family history (auth users only)
   - Both empty → broad-advisory passes auto

2. **Ingredient trigger gate** — when `card.ingredient_triggers` populated, ≥1 word-boundary match in `result.flagged_substances` (NOT narrative `ingredient_list`)

`category_triggers` deprecated. `CANONICAL_FAMILIES` (29 strings) lives in `backend/productFamilies.js` and `App.jsx` (sync via `// KEEP IN SYNC` comment). AI prompt embeds the list; non-canonical values dropped post-parse.

**Over-broad guard:** card with all three targeting fields empty rejected at write + approval. Admin `Approve` button disabled for over-broad drafts.

User history cache: 60s per user. Anonymous users skip path C.

---

## Ingredient Source Display

Below ingredient list, above dimension dropdowns. Reads `result.ingredient_source`:
- `open_food_facts` → "Verified via Open Food Facts"
- `open_beauty_facts` → "Verified via Open Beauty Facts"
- `open_products_facts` → "Verified via Open Products Facts"
- `supabase_scans` / `previous_scan` → "From a previous Partiqule scan"
- `calibration` → "Verified formula"
- `vision_ocr` → "Read from your photo"
- `none` → "Ingredients unverified"
- missing key or unmapped → hidden

Confidence colors (`ingredient_confidence`):
- `high` → forest green
- `medium` → neutral gray
- `low` / `none` / unknown → subtle amber

Timestamp (`ingredient_verified_at`): `< 24h` "just now", `< 7d` "N days ago", else "Apr 15, 2026". Null → omit.

URL (`ingredient_source_url`) makes label a `target="_blank"` anchor.

**Distinct from source confidence badge** (top of result, shows `result.source_label` when `source_confidence` is medium/low). Two different lines, two different fields.

---

## Text Search

`GET /search?q=<3-100>&userId=<uuid?>`. Surfaces calibration + prior-OFF-verified scans as match picker before cascade runs. Substring primary, JS Jaccard-trigram fallback (threshold 0.3). Sort: calibration → own_scan → other_scan, substring before trigram, similarity desc. Cap 5.

Calibration wins dedup over scans on same normalized name. Not rate-limited.

`/analyze` with `{productId, userId}` body bypasses cascade:
- `calibration:<key>` → CALIBRATION lookup
- `scan:<uuid>` → Supabase by id, `ingredient_source` rewritten to `previous_scan`

Raw text queries hit cascade.

`pg_trgm` extension + `scans_trigram_search` RPC required for scan-trigram fallback (works without — substring still functions).

---

## Whole-foods Detection

`detectWholeFood()` in `backend/scoringCascade.js`. ~50 patterns covering wild fish/seafood, eggs, fresh produce, dairy, conventional poultry, red meat, processed meats. Tier 5 intercepts whole foods BEFORE generic synthetic fallback.

`detectSourcingFlags()` extracts chips: wild caught, organic, grass-fed, pasture-raised, MSC certified, free-range, etc. Frontend renders as `SourcingFlags` component below product header.

---

## Barcode Loading + Fallback

`BarcodeLoadingView` in `App.jsx`. State: `barcodeLoadingPhase` = `null` | `"loading"` | `"error"`.

- **Min display 2000ms** (handler enforces, not component)
- **Timeout 60000ms** (full pipeline takes 10-30s on cache-miss)
- Status text cycles: `0-1500ms` "Reading barcode..." → `1500-4000ms` "Finding product..." → `4000-10000ms` "Analyzing ingredients..." → `10000ms+` "Almost there..."
- Error triggered by: AbortError, non-2xx, `fallback_required: true`

Pass 0 barcode chain: OFF/OBF/OPF parallel → `backend/barcodeIndex.js` (hand-curated UPC→name map, normalizes UPC-A↔EAN-13) → `backend/barcodeLookup.js` (UPCItemDB or go-upc, gated on `BARCODE_LOOKUP_PROVIDER` env var).

When local index or external returns name + calibration has entry → short-circuit to calibration-shaped result, no AI call. Otherwise falls through to Pass 1.

**Seeding workflow:** physically verify UPC, add `["<upc>", "<calibration key>"]` to `barcodeIndex.js`, ship.

---

## Service Worker

`frontend/public/sw.js` — currently `partiqule-v10`. Bump on breaking changes. Precaches app shell + favicons + wordmark. Strategies: never-cache APIs/admin, cache-first Google Fonts, network-first navigation with cached-shell fallback, network-first other assets with cache fallback.

---

## OG Preview Freshness

Content-hashed `?v=<8-char-sha>` query params on every `og:image`. Two pipelines:

1. `frontend/scripts/generate-product-pages.js` — SEO generator's `versionedImageUrl()` hashes PNG bytes, appends to og:image refs
2. `frontend/scripts/fingerprint-og.js` — postbuild step, regex-rewrites og:image/twitter:image in `dist/index.html` with hashes

When PNG bytes change, hash changes, scrapers refetch on next view. Page-URL cache holds the og:image URL too — scrapers notice changes only on next page refetch (7-30d TTL).

For urgent refreshes: developers.facebook.com/tools/debug → Scrape Again per URL.

---

## Brand Logo

Wordmark spells "partiqule" with green Q. Variants in `frontend/public/`:

| File | Use |
|---|---|
| `partiqule-wordmark.svg` | Dark letters — light/cream backgrounds |
| `partiqule-wordmark-light.svg` | Cream letters — dark backgrounds |
| `partiqule-stacked.svg` | Vertical Q-above-text — reserved |
| `partiqule-q.svg` | Q-only green `#2d6a32` — favicon source |
| `partiqule-wordmark-{360,720,1080}.png` | Canvas rendering |

Favicons regenerated from `partiqule-q.svg` via `rsvg-convert` (brew install librsvg). Wordmark aspect ~2.87:1.

---

## Brand Partnerships

- **Amazon Associates:** tag `partiqule-20`
- **MiiR:** Awin `https://www.awin1.com/cread.php?awinmid=120517&awinaffid=2836392`
- **Liquid Death:** 12 calibrated SKUs (1-3)
- **MiiR:** 15 calibrated SKUs + 8 products.js (1-2)
- **Sports Organics:** 3 SKUs, pre_release status, 2026-Q3 expected

---

## App Store

**Account deletion:** Account button → Settings → Danger Zone. Direct: partiqule.com/account
**Restore Purchases:** in paywall modal + Settings > Subscription. Both call `loadNativePurchases().restorePurchases()`.

**Subscription terms (Apple-required, adjacent to subscribe button):**
1. Title: "Partiqule Premium"
2. Length: "monthly"
3. Price: dynamic from StoreKit (fallback "$4.99/month")
4. "Payment will be charged to your Apple ID at confirmation of purchase"
5. Auto-renewal disclosure with cancel path (Settings > Apple ID > Subscriptions)
6. Functional links: Privacy (partiqule.com/privacy), Terms (partiqule.com/terms), Apple EULA
7. Apple EULA link also in App Store description

**App ID:** `id6761738421`
**Version:** `APP_VERSION` in App.jsx, Railway env `MIN_IOS_VERSION` / `MIN_WEB_VERSION` enforces minimum (UpdateRequiredView)

---

## Auth Refresh

`authedFetch` wrapper retries once on 401 after `supabase.auth.refreshSession()`. Used on `/analyze`, `/delete-account`, `/apple-iap-confirm`. Critical for IAP attribution — without it, expired tokens silently fail subscription writes.

---

## Deployment

- **Backend:** Railway (auto-detects `backend/package.json`, runs `npm start`)
- **Frontend:** Vercel (root: `frontend`, framework: Vite, prebuild generates SEO pages)
- **iOS:** Xcode Archive → App Store Connect
- `API_BASE` in App.jsx must point to Railway backend
- SEO `/products/<slug>` served via `vercel.json` rewrite
- Bump `sw.js` `CACHE_NAME` for breaking changes

---

## Partiqule Design System

Read this before writing UI. Every rule is deliberate.

### Aesthetic

Paper in natural light, not a SaaS dashboard. A knowing friend in your pocket. Cream on cream with moss and amber accents, asymmetric shapes, serif warmth, DM Sans small caps for raw data.

### Foundation

1. Copy carries more weight than chrome
2. The score is never the whole story
3. Your shelf is the spine
4. One decision per moment
5. Honesty over comfort
6. Completion is ceremony

### Colors (use `var(--token)` from `tokens.css`, never inline hex)

```
--cream:       #f3ede2   (primary background)
--cream-light: #f7f1e7   (elevated surfaces)
--ivory:       #f9f5ea   (button text on moss)
--ink:         #1a1f15   (primary text)
--ink-soft:    #4a5342   (secondary)
--ink-faint:   #8a9080   (tertiary)

--moss:        #2d5a27   (primary brand, CTAs)
--moss-deep:   #1f3f1b   (hover only)
--sage:        #4a7c42   (secondary moss, rare)
--amber:       #c8781a   (warm accent, never CTA)
--moss-soft:   rgba(45, 90, 39, 0.08)

--rule:        rgba(26, 31, 21, 0.16)
--rule-soft:   rgba(26, 31, 21, 0.08)
--rule-strong: rgba(26, 31, 21, 0.28)

--score-green: #6b8c3e   (≤3, leaf)
--score-amber: #c49a33   (4-5, wheat)
--score-red:   #b0493a   (>5, terracotta)
```

### Typography — Lora + DM Sans only

**Lora** (variable weight, no italic axis loaded): greetings, product names, verdict headlines, section titles, score numbers, feed card headlines. 18-40px, most commonly 20-24. Below 14px wonk axis hurts readability.

**DM Sans** (400-600): body, buttons, descriptions, sub copy, brand names (uppercase + 0.22em letter-spacing), nutrition facts, ingredients, all data moments. Replaces what used to be DM Mono — `--mono` token aliases DM Sans.

Data bits render uppercase letter-spacing 0.14-0.22em (small caps treatment).

### Asymmetric border radii

Every tile/card/circle uses a predefined shape. Cycle through shapes so adjacent tiles don't match.

```
Tile shapes (small): --tile-shape-1 through -6
Card shapes (feed): --card-shape-1 through -4
CTA shape: --cta-shape (scan card)
Circle shape: --circle-shape (profile, score dots)
```

### Motion

Slow, ambient. No bouncy micro-interactions.

1. Morning light wash — static warm gradient top 280px
2. Drifting particles — 12 dots, 22-32s cycles, low opacity
3. Breathing scale — hero scales 1.012x on 5s cycle
4. Fade up on load — 8px translate, 80-150ms stagger
5. Subtle hover lifts — 1-2px translate

**Never:** glow halos, pulsing CTAs, spinning loaders, circular loading, hover color shifts, anything game/toy-like.

### Voice

Friend who reads labels for a living. First/second person. Specific over vague. Confident not preachy. Short sentences. Real words.

**Use:** "Here's what I found, Paul." / "I'd swap if you can." / "Not a crisis. Just a cleaner one nearby." / "Already on your shelf."

**Avoid:** "Analysis complete." / "Score: 5/10." / "Consider an alternative product." / "View details." / "Your results."

Test: would a friend say it out loud?

### Verdict phrasing

```
1-3 (green):  "Looks good."
4-5 (amber):  "Could be cleaner."
6 (amber):    "Swap when you can."
7 (red):      "Better options exist."
8-9 (red):    "Hard pass."
10 (red):     "Avoid."
```

Always derive verdict from `displayScore`, never trust AI-generated verdict_kid/verdict_adult fields.

### Layout

- Background always `var(--cream)`
- Screen edge padding 24px
- Section spacing 32px
- 1px borders with `var(--rule)` or `var(--rule-soft)`
- Bottom nav 80px with safe-area padding
- Top bar 1px bottom border
- Caps labels: 22px×1px moss rule + 10px gap + DM Sans caps

### Never

1. Italics anywhere (Lora italic axis not loaded)
2. Outfit, DM Mono, Instrument Serif (Lora + DM Sans only)
3. Purple `#7c3aed` accent
4. White backgrounds (use cream)
5. Cold navy dark surfaces (no dark mode)
6. Icons in colored squares (Linear/Notion pattern)
7. Emoji in any UI string
8. Inline hex codes
9. Symmetric border-radius on tiles/cards
10. Glow halos
11. Third-person dashboard voice
12. Headers like "Overview", "Details", "Analysis"
13. Pulsing/bouncing animations
14. System font substitutes
15. Score bigger than verdict headline
16. Sentence-case ingredient lists (caps + letter-spacing)
17. Screens ending without shelf reference

### Reference files

- `frontend/src/tokens.css` — authoritative tokens
- `docs/brand-kit.html` — visual reference
- `docs/mockups/` — HTML mockups per screen

If a pattern isn't in one of those, pause and ask.

---

## Cache operations log

- 2026-05-11: Production Redis flush plus warm up. Reason: stale entries from before kid_score fix and Bucket 3 sweeteners. Method: Upstash REST flushdb, then preload_redis.js. Result: 3,151 entries loaded.
