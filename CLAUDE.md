# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

Partiqule -- AI-powered product health scoring app. Users search, scan a barcode, or photograph a product and receive a 1-10 risk score with specific chemical concerns, child/pregnancy safety scores, and curated cleaner alternatives. Lower score = safer product.

Paul is CEO/developer. Sara is co-founder handling content and Instagram.

---

## Development Commands

```bash
# Backend (port 3001)
cd backend && npm install && node server.js

# Frontend (port 3000, proxies API to backend)
cd frontend && npm install && npm run dev

# Production build (frontend) -- also generates 2,400+ SEO pages via prebuild
cd frontend && npm run build

# Regression tests (zero API cost -- runs against calibration data only)
cd backend && npm test

# iOS build
cd frontend && npm run build && npx cap sync ios && npx cap open ios

# Deploy script
./deploy.sh "commit message"
```

Backend requires `backend/.env` with at minimum `ANTHROPIC_API_KEY`. See `backend/.env.example` for all variables.

After ANY backend/server.js or backend/calibration.js change, clear the cache:
```bash
curl "https://partiqule-production.up.railway.app/cache-clear" -H "x-admin-key: $ADMIN_KEY"
```

The `ADMIN_KEY` env var must be set in Railway. There is no hardcoded fallback. Query param `?key=` also works but header is preferred (avoids key leaking in logs).

Commit messages: plain English only, no special characters, no em dashes (they break terminal quote parsing).

---

## Architecture

**Frontend:** React 18 + Vite. The entire UI lives in a single monolithic component (`frontend/src/App.jsx`, ~9,800 lines) with inline styles throughout -- no CSS files or framework. State is managed with `useState` hooks only. Capacitor wraps the app for iOS (StoreKit IAP via `@capgo/native-purchases` loaded dynamically).

**Backend:** Express API (`backend/server.js`, ~6,900 lines). Single-file server with all endpoints, scoring logic, caching, and intelligence feed pipeline.

**Scoring pipeline (two-pass with smart skip):**
1. Pass 1: Claude Haiku analyzes product across 5 dimensions (materials, usage, packaging, sustainability, manufacturing)
2. Pass 2: Independent Claude call verifies Pass 1 -- SKIPPED when pass1 returns high confidence with real dimension scores (not flat 5s) and no web search context, saving ~20s and 1 API call
3. Web search runs IN PARALLEL with pass1 (not blocking). If search returns data, it feeds into pass2
4. Final score = weighted formula by category (e.g. food: materials 90% + packaging 10%)
5. Substance floors (118 hardcoded chemicals) override AI scores -- enforced on ALL 6 code paths
5a. NOVA bounds (`novaBounds()` in server.js) override AI scores for food and beverage. NOVA 1 ceiling 3, NOVA 3 floor 4, NOVA 4 floor 7. Traditional fermented foods (miso, kimchi, kefir, sauerkraut, tempeh) exempt via calibration. Deterministic enforcement runs post-calibration in the barcode path; text and vision paths enforce the same bounds via prompt-level rules. Rationale: NOVA 1 ceiling reinforces whole foods as clean baseline, NOVA 3 floor acknowledges processing carries inherent concern, NOVA 4 floor of 7 signals ultra-processed as real concern matching UPF research (Monteiro 2025 Lancet, Srour 2024 BMJ, Lane 2024 Neurology).
6. Regulatory flags from Supabase injected into AI prompt for approved findings
7. Calibration registry (`backend/calibration.js`, 3,039 known products) overrides AI entirely
8. Child scores via `computeSafetyScores()` helper -- uses `shouldComputeChildScore()` for all household categories
9. Pregnancy scores via `computeSafetyScores()` helper -- computed on ALL paths including image/camera
10. Consistency checks (`applyConsistencyChecks`) catch AI hallucinations (label contradictions, inert material ceilings, confidence-linked caps)
11. Positive ceilings (`applyPositiveCeilings`) prevent over-penalizing USDA Organic and Non-GMO verified products
12. Intelligence cards attached via in-memory cache (2-min TTL, avoids Supabase query per scan)

**Category scoring weights:**
- Food/beverage: Materials 90% + Packaging 10%
- Restaurant: Materials 90% + Packaging 10%
- Supplement: Materials 65% + Exposure 25% + Packaging 10%
- Personal care: Materials 45% + Exposure 45% + Packaging 5% + Sustainability 5%
- Clothing: Materials 35% + Exposure 30% + Sustainability 35%
- Home/cleaning: Materials 30% + Exposure 45% + Packaging 10% + Sustainability 15%
- Baby: Materials 55% + Exposure 40% + Packaging 5%
- Toys: Materials 50% + Exposure 40% + Packaging 5% + Sustainability 5%

**Caching (multi-layer):** In-memory Map -> Upstash Redis (90-day TTL) -> disk fallback (`/tmp/partiqule_cache.json`).

**Cache versioning:** All Pass 1 output cache keys are prefixed with `v<8-char-sha>:` where the hash is computed at startup from the source of `pass1`, `pass2`, `callClaudeVision`, `tier4WebExtract`, and `tier5CategoryPrior`. When any of these prompts is edited the hash changes, every prior cache entry becomes unreachable by name, and the next request rescore naturally with the current prompt. Old entries age out via Redis TTL — no migration needed. Calibration map lookups, Supabase scan lookups, and the productId bypass don't go through cacheGet/cacheSet, so they're never invalidated by prompt edits. Startup logs the active version: `[CACHE] Prompt version: v<hash>`.

**Intelligence feed pipeline:**
1. Daily at 7am UTC: fetches 18 RSS feeds from EU/US/international health sources
2. Filters articles by 120+ compound/topic keywords, skips older than 14 days
3. Claude Haiku writes card copy with jurisdiction-aware prompting
4. Cards saved as drafts (active: false) to Supabase for admin review
5. On approval: regulatory flags extracted via Claude and injected into scoring prompt
6. Live cards appear in For You carousel, Feed page, and on relevant scan results

---

## Ten Design Laws -- Apply to Every Change

Before writing any code, name which law(s) the change serves. If a design choice conflicts with a law, the law wins.

```
01 Value in 30 seconds    -- no paywall, tutorial, or input required before first result
02 Score never destination -- every score shown has a next action visible without scrolling
03 Surfaces are earned    -- features appear only when user behavior triggers them
04 One decision per moment -- one primary action per screen or card, others visually subordinate
05 Completion is ceremony  -- audits/sessions get grade + share card + clear next step
06 Constraint = personal.  -- budget/mode inputs framed as telling the app about you, never a limit
07 Flow protects itself    -- task modes hide nav bar, preserve session state indefinitely
08 Honest over comfortable -- scores never softened, flags always name specific compounds
09 Context makes score     -- every score shown with category average or trend context
10 Share is native         -- every completion moment has a purpose-built share card
```

Score color thresholds (consistent everywhere, never change):
- <= 3.0 -> #16a34a (green)   background: #f0fdf4
- <= 5.0 -> #d97706 (amber)   background: #fffbeb
- > 5.0 -> #dc2626 (red)     background: #fef2f2

**ScoreBadge component** -- a shared component renders score numbers identically across all surfaces. A 6.8 in My Routine must look identical to a 6.8 on a scan result. Never render score numbers with ad-hoc inline color logic; always use ScoreBadge.

---

## Key Files

- `frontend/src/App.jsx` -- Entire React UI (~9,800 lines, all components defined as const functions)
- `frontend/vite.config.js` -- Build target is `safari15` for iOS WKWebView compatibility
- `frontend/public/sw.js` -- Service worker (cache name `partiqule-v2`)
- `frontend/scripts/generate-product-pages.js` -- Generates 2,400+ static SEO pages at build time
- `backend/server.js` -- All API endpoints, scoring logic, substance registry, intelligence feed, caching
- `backend/calibration.js` -- 3,039 known product scores with product-level entries for major activewear brands (Lululemon, Vuori, Alo Yoga)
- `backend/products.js` -- 420+ affiliate alternative products across 6 categories with synonym expansion, brand injection, and gender/age matching
- `backend/amazon-api.js` -- Amazon Creators API integration (tag: partiqule-20)
- `backend/scoring-regression-test.js` -- 95 assertion tests (calibration, substance floors, child detection, category detection)

---

## Navigation Structure

**Bottom nav (mobile):** Home | Feed | Scan (center FAB) | Lists | Profile

**Desktop nav:** About | Feed | The Science | Lists | Audit | My Scans

**Hamburger menu (mobile/tablet, renders when width <= 1024):**
About, The Science, How it Works, Guides, My Routine, My Scans, Start Audit, Settings, Admin (admin only)

**iPad handling:** `isTablet = width >= 768 && width <= 1024`. iPad gets hamburger menu, not desktop nav. All mobile UI conditions use `(isMobile || isTablet)`.

---

## API Endpoints

**Public:**
- `POST /analyze` -- Main scoring endpoint. Accepts `{query, category, childMode, pregnancyMode, image, mediaType}`
- `POST /barcode` -- Barcode scan via Open Food Facts + full AI pipeline
- `GET /health` -- Status check
- `GET /api/intelligence-cards` -- Active live intelligence cards
- `POST /api/recipe-ingredients` -- AI-powered recipe ingredient expansion
- `GET /api/price-lookup` -- Amazon price lookup

**User:**
- `POST /subscribe` -- Email newsletter signup
- `POST /delete-account` -- Full account + subscription deletion
- `POST /create-checkout` -- Stripe checkout session
- `GET /scan-count` / `GET /subscription-status` -- User state
- `POST /score-feedback` -- User score reports
- `POST /suggest` -- Product suggestion submissions
- `POST /verify-apple-receipt` / `POST /apple-iap-confirm` -- iOS IAP

**Intelligence feed (require ADMIN_KEY):**
- `GET /api/intelligence/all` -- All cards including drafts (admin)
- `POST /api/intelligence/approve/:id` -- Approve card + extract regulatory flags
- `DELETE /api/intelligence/dismiss/:id` -- Dismiss draft card
- `POST /api/intelligence/run` -- Run RSS feed pipeline manually
- `POST /api/intelligence-cards` -- Create card manually
- `PATCH /api/intelligence-cards/:id` -- Update card
- `DELETE /api/intelligence-cards/:id` -- Delete card

**Admin (require ADMIN_KEY):**
- `GET /admin/api-budget` -- View API spend counters
- `GET /admin/reload-redis` -- Batched Redis reload
- `GET/POST/DELETE /admin/calibration` -- Score overrides via Supabase
- `GET /cache-status` / `GET /cache-clear` / `GET /cache-clear-product`
- `GET /recent-scans` -- Admin scan browser
- `GET /score-feedback` / `POST /score-feedback/resolve`
- `GET /suggestions` / `POST /suggestions/resolve`

---

## localStorage Keys

```
ps_history                  -- array of scan objects
ps_lists                    -- array of list objects (shopping + grocery)
ps_scan_count               -- integer, scans used (free tier enforcement)
ps_email_captured           -- "1" if email capture dismissed
ps_font_scale               -- number 1-1.6, accessibility font scaling
ps_audit_session            -- JSON of active audit session (survives backgrounding)
ps_last_audit               -- JSON summary of last completed audit (7-day TTL)
ps_feed_last_visit          -- ISO timestamp, last Feed page visit (for badge count)
partiqule_child_mode        -- "1" if kids scoring mode active
partiqule_pregnancy_mode    -- "1" if pregnancy scoring mode active
partiqule_display_name      -- user's chosen display name
pq_visits                   -- feed visit tracking (last 60 entries)
pq_foryou                   -- For You carousel seen state by date
```

---

## Supabase Tables

**Existing:**
- `profiles` -- user_id, email, scan_count, stripe_customer_id, is_subscribed
- `scans` -- user_id, product_name, category, score, result_json, scanned_at
- `score_feedback` -- product reports from users (pending/resolved/dismissed)
- `suggestions` -- product suggestions from users (pending/added/dismissed)
- `calibration_overrides` -- admin score overrides (merged into CALIBRATION Map at runtime)
- `intelligence_cards` -- admin-curated and auto-generated intelligence cards
- `regulatory_flags` -- regulatory findings extracted from approved intelligence cards
- `subscriptions` -- Apple IAP and Stripe subscription records

---

## Current Feature State

**LIVE (do not break):**
- Scan (text + barcode + image), calibration scoring, alternatives panel (Amazon/Brand/Target)
- Kids Mode (`childMode`) and Pregnancy Mode (`pregnancyMode`) -- both persist via localStorage
- ScoreBadge shared component for all score rendering
- Score context line (`category_score_context` on scan response)
- CTA hierarchy on scan result: primary = See Alternatives or Scan Another, secondary contextual
- ShareCompareCard for alternatives comparison sharing (scan-result share card removed April 2026)
- Room tagging on scan result ("Which room?" prompt for home-relevant categories)
- My Routine (RoutinePage), scan history (HistoryPage) with "By date / By room" toggle
- Home coverage card on hero page (getHomeCoverage)
- Lifestyle score card (computeLifestyleScore) -- permanent fixture between greeting and For You
- For You intelligence carousel (generateForYouCards + ForYouCarousel) with auto-scroll
- Live intelligence cards from RSS feed merged into For You carousel
- Intelligence cards surfaced on relevant scan results via product-family matching, specific-SKU fuzzy match, and (for authenticated users) 30-day scan history intersection — see "Intel Card Relevance"
- Feed page (/feed) -- dedicated scrollable inbox of all intelligence cards with filters
- Audit session flow (AuditSessionView) with pause/resume and completion ceremony (AuditCompleteScreen)
- Audit type selector (5 types: pantry, beauty, home, closet, nursery)
- Lists page with three tabs: Grocery Lists, Shopping Lists, My Routine
- Grocery list builder with recipe ingredient expansion, swap suggestions, budget tracker, quantity controls, post-shop summary and share card
- Shopping lists with add/check/delete items
- Subscription: Stripe (web) + Apple IAP with Restore Purchases
- Guides platform, admin panel with Intel Cards tab (per-card Retag editor for product_families, specific_products, ingredient_triggers; over-broad drafts block Approve with inline warning)
- Bottom sheet scan modal (mobile) with camera/library/text options
- Client-side barcode detection (BarcodeDetector API) before vision fallback
- Service worker v2 with proper navigation fallback
- Display name collection after signup, editable in Settings
- Account deletion with prominent "Danger zone" section in Settings

**NOT YET BUILT (Phase 2+):**
- Batch scan session (dedicated scan mode, accumulates into audit)
- Pantry Audit / Beauty Audit / Home Audit completion flows with persistent results
- Lifestyle Score timeline and monthly snapshots
- Recipe Library (Sara-curated)
- Supabase-backed lists (server-side grocery lists with sync)
- User preferences synced to Supabase profiles (currently localStorage only)

---

## Critical Conventions

### iOS / Capacitor
- `@capgo/native-purchases` must be loaded via dynamic `import()`, NOT `require()`
- Build target must be `safari15` in vite.config.js for WKWebView compatibility
- After any frontend change: `npm run build && npx cap sync ios` before testing in Xcode
- `IS_NATIVE` uses `window.Capacitor.isNativePlatform()` -- NOT screen width check
- iPad (820px) gets tablet treatment: hamburger menu, not desktop nav

### The duplicate import bug
When copying App.jsx from external sources, line 4 often re-introduces `import { NativePurchases, PURCHASE_TYPE } from "@capgo/native-purchases"` which conflicts with the `let` declaration on line 2. Always check the first 5 lines after copying.

### The stale closure bug
When multiple async operations update the same `lists` state (e.g. batch recipe ingredient adds), each call captures a stale snapshot. Use functional `saveLists(prev => prev.map(...))` for ALL async state updates. The `saveLists` helper supports both direct values and functional updates.

### API spend guardrails
- Hard daily cap (default 500) and monthly cap (default 5000) on Claude API calls
- Override via env vars `API_DAILY_CAP` and `API_MONTHLY_CAP`
- NEVER run bulk operations without confirming the rate limit and budget are adequate

### Scoring pipeline consistency
- There are 6 code paths that produce a scored result (text, vision, text-fuzzy, vision-fuzzy, barcode, admin-reload). All must use `serializeAlternatives()` and `computeSafetyScores()`.
- All 6 paths must include `category_score_context` field
- All 6 paths must enforce substance floors via `applySubstanceFloors()`
- All 3 fresh-result paths (text, vision, barcode) call `attachIntelCards()` before `res.json()`
- Child scores use `shouldComputeChildScore()` (all household categories), not just `detectChildProduct()` (baby/toy/kid-branded only)
- Pregnancy scores computed on ALL paths (including image/camera -- was previously missing)
- Regulatory flags are loaded into `REGULATORY_FLAGS_CACHE` on startup and injected into pass1 via `buildRegulatoryContext()`
- Fuzzy calibration uses a prefix index (rebuilt on calibration override reload) for fast lookups

### Category detection
- `detectCategory()` routes products before scoring. Order matters -- baby personal care ("baby shampoo") routes to personal_care, baby supplements ("kids vitamins") route to supplement, before the baby catch-all
- 13 categories: other, restaurant, toy, accessory, baby, clothing, supplement, home_furnishing, kitchen, home, personal_care, beverage, food
- Null return (unrecognized) falls back to "other" category weights

### Alternatives matching (`findAlternatives` in products.js)
- Synonym expansion maps product terms to related keywords (e.g. "pad" -> menstrual/period/feminine, "blouse" -> top/shirt/women)
- Brand-keyword injection adds product-type keywords when query contains a known brand (e.g. "Always" injects "menstrual, pads, feminine care")
- Gender matching: men's-tagged products deprioritized (-15 points) for non-masculine queries
- Age matching: kids-tagged products excluded (score=0) for adult clothing/personal_care queries
- Category filter: "other" category blocked from supplement/personal_care/baby queries (prevents garden tools for Garden of Life)
- Calibration dedup: nutrition-only entries must NOT appear after full entries in calibration.js (Map.set overwrites -- last entry wins)
- PFAS brand auditing: when a brand claims PFAS phase-out, verify against independent lab testing and regulatory actions before lowering floors. Split brands by product type -- DWR-finished items stay at floor:5 until independent lab verification; cotton/fleece/lounge items with no chemical finish can score lower. Insert specific product entries BEFORE the brand default in calibration.js (Map iteration order determines which `startsWith` match wins). Cite investigations with dates in reason strings.

### Security conventions
- `ADMIN_KEY` must be set via env var -- no hardcoded fallback
- Admin auth prefers `x-admin-key` header; query param `?key=` also accepted (needed for curl)
- All admin requests are audit-logged with IP, path, method
- User input to `/analyze` is sanitized (length cap 300, control chars stripped)
- Barcode input validated as 4-14 digit string
- Recipe ingredients input sanitized (length cap 200, quote stripping, servings 1-100)
- Intelligence card mutations validated against field allowlist
- Internal error details never exposed to client responses
- Cache-clear rate-limited to once per 60 seconds

### Frontend styling
100% inline JavaScript styles (camelCase). No CSS files. Dark mode via `isDark` boolean (currently always true). Color system: green (safe) -> yellow (caution) -> orange (warn) -> red (danger). Mobile breakpoint: `isMobile = width < 768`. Tablet breakpoint: `isTablet = width >= 768 && width <= 1024`.

### Ingredient data sources per scoring path

Pass 1 does not have a single ingredient source — it varies by entry point:

- **Text path** (`/analyze` with `query`): five-tier cascade — CALIBRATION map → cache → Open Facts text search → web_search extraction → category-prior best guess. Tiers 1-4 feed real ingredients into Pass 1; Tier 5 skips Pass 1 entirely and returns a synthetic category-typical estimate with empty chemistry fields. See "Five-Tier Scoring Cascade" section below.
- **Vision path** (`/analyze` with `image`): `callClaudeVision` reads the label from pixels. LABEL TRUTH RULE in the vision system prompt tries to prevent AI priors from overriding visible text, but the risk is not eliminated.
- **Barcode path** (`/barcode`): Open Food Facts `ingredients_text_en` is injected into pass1 as ground truth via `offContext`. Safest path; only works for products in OFF indexes.

Calibration entries and flagDetection both treat AI-returned `ingredient_list` as input. The cascade's strict gating in Tiers 3 and 4 (≥0.7 trigram similarity, non-empty ingredients, OFF `complete` flag, AI extraction validates returned-name against query) is what keeps fabrications out of Pass 1; Tier 5 contains the remaining risk by skipping Pass 1 altogether.

### Calibration entry integrity

Calibration entries must reflect the CURRENT product formulation. Brands reformulate frequently (Danimals, Mott's, Kraft Mac and Cheese, Kellogg, General Mills have all removed artificial dyes in recent years). Before adding or editing a calibration entry:

- Verify ingredients against the current package label, manufacturer website, or a recent Open Food Facts entry — not from memory or historical reputation.
- Include a `Ingredients verified <MM YYYY>` note in the `reason` field when the substance list was checked against a real product.
- An entry listing substances the product no longer contains is a defamation risk, not a scoring error.

### Session rules
- Always read CLAUDE.md before writing any code in a session.
- Test on 390px viewport after any UI change.

---

## App Store Submission Notes

**Account deletion path:** Account button in header (mobile/tablet) or Settings in hamburger menu -> Settings page -> Danger Zone -> Delete My Account. Direct URL: partiqule.com/account

**Restore Purchases:** Available in paywall modal ("Restore previous purchase") and Settings > Subscription section ("Restore purchases"). Both call `loadNativePurchases().restorePurchases()`.

**Subscription terms (all required by Apple, adjacent to subscribe button):**
1. Subscription title: "Partiqule Premium"
2. Length: "monthly"
3. Price: dynamic from StoreKit (fallback "$4.99/month")
4. "Payment will be charged to your Apple ID at confirmation of purchase"
5. Auto-renewal disclosure with specific cancellation path (Settings > Apple ID > Subscriptions)
6. Functional URL links: Privacy Policy (partiqule.com/privacy), Terms of Service (partiqule.com/terms), Apple EULA (apple.com standard EULA)
7. Standard Apple EULA link also in App Store description

**IAP error handling:** StoreKit failures show immediate toast error + web subscription fallback. No silent failures.

**iPad:** isTablet breakpoint covers 768-1024px. Hamburger menu 44x44px touch target with z-index 200.

---

## Deployment

- **Backend:** Railway (auto-detects `backend/package.json`, runs `npm start`)
- **Frontend:** Vercel (root: `frontend`, framework: Vite, prebuild generates SEO pages)
- **iOS:** Xcode Archive -> App Store Connect -> TestFlight / App Store
- `API_BASE` in `App.jsx` line 27 must point to the Railway backend URL
- SEO pages at `/products/<slug>` are served by Vercel rewrite in `vercel.json`
- Service worker `partiqule-v2` -- bump version when deploying breaking changes

---

## flagDetection Integration

Deterministic substance detection is integrated into Pass 1 scoring. The AI cannot contradict findings from `backend/flagDetection.js`.

- Pre-AI: when ingredient text is available (barcode via OFF), `detectFlags` runs before pass1 and confirmed substances are injected into the prompt as `DETERMINISTIC FLAGS DETECTED`.
- Post-AI: `detectFlags` runs again on the AI-captured `ingredient_list`. `validateAIResponse` compares AI-claimed substances to the deterministic set. `mergeFlags` merges deterministic findings into `p1.harmful_chemicals` and appends any AI-missed findings to `p1.raw_concerns` so `applySubstanceFloors` picks them up.
- Disagreements are logged with structured data under `[flag_detection_override]` for audit. The log fires only when `missingFromAI` has entries (deterministic caught something the AI missed). `extraInAI` alone does not log, since AI narrative concerns often cannot be matched by the deterministic layer.

Pattern-level validation in `mergeFlags` / `aiContradictsDeterministic`: when the AI claims a substance, validation operates per-pattern, not per-bucket. For each AI claim, every `FLAG_DEFS` pattern whose regex matches the claim is checked against the deterministic `matches` array for that bucket. If the specific pattern label is present in `matches` → confirmed, the claim is kept. If not → contradicted, the claim is dropped. This prevents an AI fabrication for one substance (e.g. cyclopentasiloxane) from surviving merge just because a sibling in the same bucket was confirmed (e.g. dimethicone made `siloxanes.present === true`). Out-of-bucket claims (no `detFlags.flags[flagName]` entry because the category bucket was skipped) are still preserved as before.

Feature flag: `FLAG_DETECTION_ENABLED` (Railway env var).
- Default: enabled.
- To disable: set `FLAG_DETECTION_ENABLED=false` in Railway.

Diff endpoint: `POST /admin/flag-detection-diff` with `{ productName }` in body. Returns `oldScore`, `newScore`, `oldConcerns`, `newConcerns`, `deterministicFlags`, `aiInconsistencies`. Use to sanity-check behavior on known products before trusting the pipeline at scale.

---

## Five-Tier Scoring Cascade

Text-only `/analyze` queries (no `image`, no `productId`, no `barcode`) run through a five-tier cascade. First hit wins. Every tier returns a scored result — there is no dead-end path. Honest confidence labels surface to the user when the score depends on a non-baseline source.

The cascade was added on 2026-04-20, replacing the prior `cannot_score_from_text_only` 422 gate (in place since 2026-04-18). The gate's "Let's see the label" prompt UI in the frontend was removed in the same change. `ALLOW_TEXT_PATH_SCORING` is no longer a flag.

### Tiers

| # | Source | Implementation | source_confidence | source_label |
|---|---|---|---|---|
| 1 | `CALIBRATION` map | Exact / fuzzy match against `backend/calibration.js` (3,039+ entries) | `null` | `"Verified formula"` |
| 2 | Cache | In-memory + Redis hit on `cacheKey(productName, category)` | inherited | inherited |
| 3 | Open Facts text search | `tier3OpenFactsTextSearch` queries OFF / OBF / OPF in parallel via `cgi/search.pl?search_terms=...`. Strict acceptance: trigram sim ≥ 0.7, non-empty `ingredients_text`, `complete` flag truthy. Best match across all three sources wins. Pass 1 receives the verified ingredient list as `materialContext`. | `"medium"` | `"Sourced from Open Food Facts"` (or Beauty / Products Facts) |
| 4 | Anthropic web_search | `tier4WebExtract` runs one Haiku call with the `web_search_20250305` tool, asking for strict JSON `{product_name, brand, ingredients[], category, source_domain, found}`. 12s timeout. Validates `found: true`, non-empty `ingredients`, and trigram sim ≥ 0.7 between query and returned `product_name` (rejects substituted "similar product" hits). Pass 1 receives the extracted list as `materialContext`. | `"medium"` | `"Sourced from <domain>"` (e.g. `amazon.com`) |
| 5 | Category-prior best guess | `tier5CategoryPrior` — **does NOT call Pass 1**. Synthetic result built from `CATEGORY_AVERAGES[cat].avg`, all dimensions = midpoint, `flagged_substances: []`, `harmful_chemicals: []`, `ingredient_list: []`, substance floors bypassed. Honest summary names the limitation. `_skipCache: true` so the cascade re-runs on the next visit (OFF or web search may have data later). | `"low"` | `"Best guess from product name"` |

Tiers 1 and 2 live inline in `server.js` `/analyze`. Tiers 3, 4, 5 + the in-flight dedupe wrapper live in `backend/scoringCascade.js`. Server.js orchestrates: cascade is wrapped in `dedupeInflight(productName, category, fn)` so concurrent identical queries share one execution and don't fan out into N web searches.

### Why Tier 5 is "contained"

Calling `pass1(productName, null, category)` with no ingredient list is the failure mode that triggered the 2026-04-18 disable (Danimals Strawberry Smoothie returned a fabricated ingredient list with substances the product hadn't contained for years). The defamation risk is real.

Tier 5 closes that path: no AI call, no fabricated chemistry. The user sees the typical-for-category score with `confidence: "low"`, an honest summary ("Without the ingredient list I'm guessing from the product type. Scan the barcode or label for a verified score."), and the amber `Best guess from product name` label below the product header. `_skipCache: true` prevents the synthetic result from being persisted — every next request re-tries the cascade.

### Result schema additions

Three new top-level fields, populated by every scoring path (cascade + calibration productId + scan productId + image vision + image fuzzy-cal + barcode):

- `source` — machine-readable: `calibration` | `previous_scan` | `open_food_facts` | `open_beauty_facts` | `open_products_facts` | `web_search` | `vision_ocr` | `ai_text_only_estimate`
- `source_label` — human-readable copy shown in the UI
- `source_confidence` — `null` (baseline trust, no UI badge) | `"medium"` | `"low"`

The existing `confidence` field continues to mean **AI scoring confidence** (high/medium/low). Don't conflate. The new field is `source_confidence` and lives separately.

### In-flight deduplication

`dedupeInflight(query, category, fn)` in `scoringCascade.js`. Map keyed on `${normalized}|${category}`. Same Promise is awaited by every concurrent caller. Slot is cleared 5 minutes after the Promise settles, so a follow-up visit gets a fresh cascade run. This protects against cost spikes when many users (or rapid retap) submit the same query simultaneously — without it, Tier 4 would fire N parallel web searches.

### Frontend UX

- Match picker (existing) still surfaces `/search` results as the user types — verified-source-only matches that bypass the cascade entirely via productId.
- Result screen renders the `source_label` as a small DM Sans line below the product header **only when `source_confidence` is `"medium"` or `"low"`**. Color: `var(--ink-soft)` for medium, `var(--amber)` for low. Calibration / barcode / prior-scan paths set `source_confidence: null` and skip the badge entirely.
- The existing "Ingredient Source Display" line below the ingredient list (keyed on `ingredient_source`, not `source`) is unchanged — it shows source provenance for the verified ingredient list, separately from the source confidence badge near the score.
- TYPEWRITER_STEPS (used by both `BarcodeLoadingView` and `GlobeLoading`) gained a `"Searching the web..."` beat for the longer Tier 4 latency. Both components dynamically size their dot indicator from `TYPEWRITER_STEPS.length`.

### Cost guardrails

- Tier 4 increments the same `apiCallCounts` as `callClaude` (passed in via `{checkApiBudget, incrementApiCount}`). Same daily/monthly cap applies.
- Tier 4 fires **only when Tier 3 misses**. Most popular products hit Tier 1 (calibration) or Tier 3 (OFF) and never reach Tier 4.
- Dedupe collapses concurrent identical queries to one execution.
- Tier 5 makes zero API calls.

### Re-introduction risk

If Tier 3's strictness is loosened (similarity threshold drops below 0.7, `complete` flag check is dropped, or `ingredients_text` empty is allowed), the Danimals failure mode comes back via OFF rather than via Pass 1. Same outcome. Don't loosen these without a written reason.

If Tier 5 ever calls Pass 1 (someone "fixes" it to give richer narrative), fabrications return. The synthetic result is the contract.

---

## Pass 0 Ingredient Resolution

Pass 0 (`backend/pass0.js`) resolves a verified ingredient list BEFORE Pass 1 scoring runs. It exists so the AI never has to invent ingredients from training priors — the text-path fabrication bug was the motivating incident.

`resolveIngredients({ productName, barcode, image, category, supabase })` returns:
```
{ ingredients, source, confidence, sourceUrl, verifiedAt, rawProduct }
```

`source` is one of: `open_food_facts`, `open_beauty_facts`, `open_products_facts`, `supabase_scans`, `vision_ocr`, `none`. `rawProduct` is the source-specific opaque object callers can mine for additional fields (barcode paths extract nutrition/NOVA/brand/serving from it).

Resolution order:
1. If `barcode` provided: Open Food Facts v2 → Open Beauty Facts v2 → Open Products Facts v2 (parallel fetch, preference by order). Product found with ingredient text → `confidence: "high"`. Product found without ingredient text → `confidence: "medium"` (we know identity, not materials).
2. If `productName` provided and no barcode hit: Supabase `scans` table, JSONB lookup via `result_json->ingredient_list`, case-insensitive match on `product_name`, within last 12 months, most recent first. `confidence: "medium"`.
3. If `image` provided and nothing else hit: **stub — returns `source: "none"`**. A future session will refactor `callClaudeVision` to populate Pass 0 via an OCR-only pass.
4. Nothing hits → `source: "none", confidence: "none"`.

Integration: `/barcode` calls Pass 0 as its first step (replaces the previous inline OFF/OBF/OPF fetch). `/analyze` text path no longer uses Pass 0 directly — it runs the five-tier cascade in `backend/scoringCascade.js` instead. `/analyze` image path is unchanged.

Pass 1 receives the source metadata as an `INGREDIENT SOURCE:` line in its context block, instructing it to trust the provided ingredient list over its training priors.

Result record fields persisted to `scans.result_json`:
- `ingredient_source` — which database the ingredient list came from
- `ingredient_confidence` — `high` / `medium` / `low` / `none`
- `ingredient_verified_at` — ISO timestamp of the Pass 0 resolution
- `ingredient_source_url` — browsable verification URL (OFF page), null for Supabase cache

Monitoring hit rate:
```bash
# In Railway logs:
grep pass0_resolution | jq -r '.source' | sort | uniq -c
```
Every resolution emits a structured log: `[pass0_resolution] {"productName":..., "barcode":..., "source":..., "confidence":..., "duration_ms":...}`.

### Pre-Pass 0 cache eviction

Cached scan results that predate Pass 0 lack the `ingredient_source` field and may contain AI-fabricated ingredients from the pre-Pass-0 pipeline (motivating incident: an Armani Luminous Silk Foundation scan flagged cyclopentasiloxane, which the current formula does not contain).

On every cache hit in `/analyze` (text and image) and `/barcode` (both barcode-key and name-key lookups), `evictIfPrePass0` checks whether `cached.ingredient_source` is populated. If it is falsy (null, undefined, or empty string), the entry is evicted from both memory and Redis, and the request falls through to the normal scoring pipeline. Entries with any non-empty value (`open_food_facts`, `open_beauty_facts`, `open_products_facts`, `supabase_scans`, `vision_ocr`, `none`, etc.) are served normally.

Each eviction emits `log.info("prepass0_cache_eviction", { cache_key, product_name, created_at_if_available })` so prevalence can be measured in Railway logs:
```bash
grep prepass0_cache_eviction | wc -l
```

Consequence for the image path: fresh image-path scoring does not currently write `ingredient_source`, so image results are effectively uncached until Pass 0 gains an OCR step. This is an intentional trade — fabrication risk outweighs cache benefit. Barcode scans that land in OFF/OBF/OPF cache normally with `ingredient_source` populated.

---

## Ingredient Source Display

Every scan result surfaces a small "credibility" line below the Full ingredient list and above the dimension dropdowns (where flagged substances appear). It tells the user where the ingredient list came from so the score is auditable rather than opaque.

Source → copy mapping (from `result.ingredient_source`):
- `open_food_facts` → "Verified via Open Food Facts"
- `open_beauty_facts` → "Verified via Open Beauty Facts"
- `open_products_facts` → "Verified via Open Products Facts"
- `supabase_scans` / `previous_scan` → "From a previous Partiqule scan"
- `calibration` → "Verified formula"
- `vision_ocr` → "Read from your photo"
- `none` → "Ingredients unverified"

Distinct from this line: the **source confidence badge** (added 2026-04-20) renders below the product header on the result screen and reads `result.source_label` when `result.source_confidence` is `"medium"` or `"low"`. See "Five-Tier Scoring Cascade" → Frontend UX. Two different lines, two different fields, two different placements — don't conflate them.

Confidence styling (from `result.ingredient_confidence`):
- `high` → forest green text (`#052e16` light, `#6ee7b7` dark)
- `medium` → neutral gray (`#6b7280` light, `#9ca3af` dark)
- `low` / `none` / unknown → subtle amber (`#b45309` light, `#fbbf24` dark)

Timestamp formatting (from `result.ingredient_verified_at`, appended after `·`):
- < 24h → "just now"
- < 7d → "1 day ago" / "N days ago"
- otherwise → "Apr 15, 2026" (`Intl` "short, numeric, numeric")
- null/invalid → omit the `· timeAgo` suffix entirely

Tappable source: when `result.ingredient_source_url` is set, the source label becomes a `target="_blank" rel="noopener noreferrer"` anchor opening the verification URL (typically the OFF/OBF/OPF product page). When null (e.g. `supabase_scans`), it renders as plain text.

Edge cases:
- `result.ingredient_source` missing entirely (older cached scans pre-Pass 0): the entire source line is hidden — no fallback, no broken row.
- Source key not in the mapping above: the line is hidden rather than rendering "undefined".
- Empty `ingredient_list` does not suppress the source line — "Ingredients unverified" is still meaningful when nothing was resolved.

Styling: 12px Outfit, no icon, no emoji, `marginTop: -4` to sit close under the ingredient list card. Inline implementation in `App.jsx` immediately after the `INGREDIENT LIST` block.

---

## Text Search (Verified Sources Only)

Raw-text /analyze runs the five-tier cascade (see "Five-Tier Scoring Cascade" above). `/search` is the lighter-weight companion: a `GET` endpoint that surfaces verified-source matches (calibration entries + prior OFF-verified scans) so users can tap a known-good match instead of waiting for the cascade to run. `/analyze` with a `productId` from `/search` short-circuits straight to that pre-verified data — no cascade, no API spend.

**Endpoint** — `GET /search?q=<string>&userId=<uuid?>`
- Validates `q` trimmed length in `[3, 100]`. Under 3 returns `{ matches: [], total_count: 0 }` without hitting any data source.
- Normalizes `q` to lowercase, collapsed whitespace. The CALIBRATION Map keys are already normalized the same way, so substring matching is direct.
- Not wrapped in `rateLimit` middleware on purpose — /search shouldn't consume a user's /analyze budget, and the endpoint does no AI work.

**Sources**
- `calibration` — in-memory `CALIBRATION` Map (3,039+ entries from `calibration.js` + admin overrides). Iterated via `calibrationAllEntries` which is rebuilt whenever calibration overrides reload. Substring primary, JS Jaccard-trigram fallback.
- `own_scan` / `other_scan` — Supabase `scans` table, last 90 days, filtered to rows where `result_json->>ingredient_source` is not null (i.e. post-Pass-0 scans with known provenance). Substring via `ilike`. Trigram fallback via `scans_trigram_search` RPC (requires pg_trgm extension).

**Sort** — calibration first, then own_scan, then other_scan. Within each tier, substring before trigram. Within each match type, higher similarity first. Cap 5 matches.

**Dedupe** — calibration wins over scans on the same normalized product name. A product name that appears in both CALIBRATION and as a prior scan shows once, sourced to calibration.

**Trigram** — simple JS implementation in `server.js` (`buildTrigrams` + `trigramSimilarity`). Jaccard similarity on padded 3-character windows. Threshold 0.3. Supabase-side trigram goes through a `scans_trigram_search` RPC — failing silently (substring still serves typed-correctly queries) until Paul runs the extension + RPC migration.

**`/analyze` productId bypass** — When `/analyze` is called with a body of `{ productId, userId }` (no `query`, no `image`) the text gate is skipped:
- `calibration:<normalized-key>` → lookup `CALIBRATION.get(key)`, build a scored result with the same shape as the fuzzy-calibration fast path. `ingredient_source` is set to `"calibration"`, `ingredient_confidence` to the entry's confidence.
- `scan:<uuid>` → Supabase `scans` lookup by id. `result_json` is returned with `ingredient_source` rewritten to `"previous_scan"` so the credibility line reads "From a previous Partiqule scan" rather than claiming fresh OFF verification.

Raw text queries (no `productId`, no `image`) still hit the `cannot_score_from_text_only` 422 gate.

**Frontend match picker** — Home search input debounces 300ms, triggers `/search` at ≥3 chars, renders a floating panel below the fixed scan bar with one card per match. Each card shows: product name, source label (`Verified formula` / `Your scan from N days ago` / `Recent verified scan`), score preview (mid of `floor` and `ceiling` for calibration; stored overall_score for scans) colored by the score tier (green ≤3, amber ≤5, red >5). Tap → `selectSearchMatch` → `/analyze` with `productId`. Empty-state card shows "Scan barcode" as the primary fallback; a second "Can't find your product?" link sits under any populated list for the same purpose.

The panel hides when `result` is set, so once a scan lands the user isn't looking at stale match suggestions layered behind the result.

**Logging** — every /search call emits `log.info("text_search", { query, userId, match_count, has_calibration_matches, has_own_scan_matches, has_other_scan_matches, zero_matches })`. Railway log filter for gap analysis:
```bash
grep text_search | jq 'select(.zero_matches == true) | .query' | sort | uniq -c | sort -rn
```

**pg_trgm migration** — Supabase SQL Editor, one-time:
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Optional but strongly recommended: a supporting RPC for scan trigram search.
-- Until this exists the endpoint still works — it just skips the scans-trigram
-- fallback and relies on substring + calibration-trigram only.
CREATE OR REPLACE FUNCTION scans_trigram_search(q text, threshold float, user_id_arg uuid, lim int)
RETURNS TABLE(id uuid, product_name text, user_id uuid, result_json jsonb, created_at timestamptz, sim float)
LANGUAGE sql STABLE AS $$
  SELECT s.id, s.product_name, s.user_id, s.result_json, s.created_at,
         similarity(lower(s.product_name), lower(q)) AS sim
  FROM scans s
  WHERE lower(s.product_name) % lower(q)
    AND similarity(lower(s.product_name), lower(q)) > threshold
    AND s.result_json->>'ingredient_source' IS NOT NULL
    AND s.created_at > NOW() - INTERVAL '90 days'
  ORDER BY (s.user_id = user_id_arg) DESC NULLS LAST, sim DESC
  LIMIT lim;
$$;
```

---

## Intel Card Relevance

Intel cards surface on scan results only when they are directly relevant to the scanned product or to something in the user's recent history. The old category-based matching (`category_triggers` only) surfaced irrelevant cards across category siblings — e.g., a nail polish remover recall on a foundation scan. This was replaced 2026-04-19.

**Product family classification** — every scan computes `product_family` via `backend/productFamilies.js` (`classifyProductFamily(productName, ingredients, category)`). The classifier returns one of 29 canonical strings (foundation, lip_balm, nail_polish_remover, sunscreen, hair_shampoo, wound_care, etc.) or `null` if no rule matches. `CANONICAL_FAMILIES` in that file is the single source of truth; the AI intel-card prompt (`writeIntelligenceCard` in `server.js`) reads the same constant. Keep `frontend/src/App.jsx` `CANONICAL_FAMILIES` in sync when the list changes — there's a `// KEEP IN SYNC` comment above it. All 6 scoring paths populate `result_json.product_family` at scan time.

**Matching rule** — a card fires when both of these pass, evaluated by `filterRelevantCards` in `backend/intelMatch.js`:

1. Relevance gate — AT LEAST ONE of:
   - A) `card.product_families` includes the scan's `product_family`
   - B) `card.specific_products` matches the scan's `product_name` (fuzzy; see below)
   - C) `card.product_families` intersects the user's distinct 30-day scan history (authenticated users only)
   - Broad-advisory: when both `product_families` and `specific_products` are empty, the gate passes automatically

2. Ingredient trigger gate — when `card.ingredient_triggers` is populated, at least one trigger must word-boundary match an entry in `result.ingredient_list` (structured array, not narrative text). Empty triggers skip this gate.

`category_triggers` is still stored in the schema for backward compatibility but is no longer consulted by the matcher.

**Fuzzy name matching** — `specificProductMatches` normalizes both sides (lowercase, strip apostrophes, collapse non-alphanumerics to single spaces). Entries < 10 chars require word-boundary token match (`Tide` matches `Tide Pods`, not `Riptide Beverage`). Entries ≥ 10 chars allow bidirectional substring (`Armani Luminous Silk` matches `Armani Luminous Silk Foundation` forward and `Armani Luminous Silk` if an even longer entry is targeted).

**User history cache** — `getUserRecentFamilies(userId)` queries `scans WHERE user_id = ? AND created_at > NOW() - INTERVAL '30 days'`, extracts distinct `result_json.product_family`, and caches per user for 60s. Returns `null` for anonymous users — path C is skipped structurally. Only fires once per user per minute to avoid Supabase roundtrips on rapid successive scans.

**Over-broad guard** — `isOverBroadCard(card)` is true when `product_families`, `specific_products`, and `ingredient_triggers` are all empty. Such a card would fire on every scan globally. Guarded in two places:

- `writeIntelligenceCard` rejects over-broad AI-drafted cards post-parse with `[Intel] Rejecting over-broad card (no targeting fields)` and returns `null` (never saved).
- `/api/intelligence/approve/:id` returns `400` if the admin tries to activate an over-broad card. Admin UI in `IntelAdminPage` mirrors this by disabling the `Approve` button on drafts that are over-broad and showing an inline red warning.

**AI prompt vocabulary** — `writeIntelligenceCard` embeds `CANONICAL_FAMILIES.join(", ")` in the prompt so the AI can only emit known family strings. Post-parse validation filters out any value not in the canonical set (`[Intel] Dropped non-canonical product_families from "<headline>": ...`). The prompt explicitly instructs: food/cleaning/clothing articles must populate either `specific_products` or `ingredient_triggers` to give the card an anchor, or be rejected.

**Admin retag flow** — `IntelAdminPage` has a per-card `Retag` button that opens an inline editor for the three targeting fields only (product_families chips, specific_products and ingredient_triggers as comma-separated inputs). Saves via `PATCH /api/intelligence-cards/:id`. The `INTEL_CARD_FIELDS` allowlist in `server.js` was corrected in the same session — previously it listed fields that didn't exist on the schema and silently dropped every PATCH payload.

**Pre-Pass-0-style stale eviction** — not added to intel cards. The 2-min in-memory cache (`intelCardsCache`) refreshes on its own TTL and picks up schema/field changes on the next fetch.

---

## Barcode Loading Screen

Between barcode detection and result render, the app shows a dedicated branded overlay (`BarcodeLoadingView` in `App.jsx`) instead of the generic GlobeLoading overlay. This replaces the jarring transition from scan view → result with an intentional branded moment.

State: `barcodeLoadingPhase` — `null` (hidden) | `"loading"` | `"error"`.

Timing contract (enforced inside the `onBarcode` handler, not inside the component):
- **Minimum display: 2000ms.** If the `/barcode` API returns sooner, the handler awaits `MIN_DISPLAY_MS - elapsed` before clearing the phase and rendering the result.
- **Timeout: 60000ms.** `AbortController.abort()` fires at 60s; the catch block surfaces the error phase (after the 2s minimum). Full pipeline (Pass 0 OFF fetch + Pass 1 + Pass 2 + floors/consistency) realistically takes 10–30s on cache-miss, so anything under ~45s is expected latency, not failure. 5s was the original value and caused every cache-miss to land in the error phase; do not lower this without confirming real pipeline latency.
- If the API returns after 2s but before 60s, the result renders immediately.

Status text phases (cycle based on elapsed time inside the component):
- `0–1500ms` → "Reading barcode..."
- `1500–4000ms` → "Finding product..."
- `4000–10000ms` → "Analyzing ingredients..."
- `10000ms+` → "Almost there..."

Error phase is triggered by: (1) fetch timeout via AbortError, (2) non-2xx response, (3) `fallback_required: true` in the response body (barcode not in any Pass 0 source). Error shows "We couldn't find this product" with two buttons: "Try scanning again" (reopens `BarcodeScannerView`) and "Take a photo instead" (hidden `<input type="file" capture="environment">` routing into `handleImageScan`). No generic red error banner — the overlay owns the entire error UX.

Visuals: forest green `#052e16` background (matches Score color system), Partiqule leaf logo (same SVG used in scan header / footer) at 96×96 with a 1.6s `barcodeLoadingPulse` scale+drop-shadow animation, Outfit font throughout, no emoji. Z-index 9998 (under `BarcodeScannerView` at 9999 so a retry can layer on top).

Not applied to text-query path or image-scan path — those continue to use `GlobeLoading` via the existing `loading` / `showOverlay` effect (see `App.jsx` ~6842). The barcode path is self-contained and does not touch `setLoading`.

---

## Vision Contract v2 (label-truth enforcement)

Introduced 2026-04-21. Gated on `VISION_CONTRACT_V2=true` (Railway env). Default OFF preserves legacy behavior. The legacy vision path scores directly from pixels in a single Haiku call — high fabrication risk because the AI can project ingredients from product priors rather than reading what's literally on the label. v2 decomposes that into identify → cascade-verify → score, with label reads as a verification signal rather than the source of truth.

Module: `backend/visionContract.js`. Three exports:
- `callClaudeVisionIdentify(image, mediaType, deps)` — slim identify-only Haiku call. Returns `{ product_name, brand, variant, category, confidence, label_ingredients, label_legibility, reasoning }`. `label_legibility` is one of `full | partial | minimal | unreadable`. System prompt forbids inferring ingredients from priors and requires literal label reads.
- `putIdentification` / `getIdentification` — in-memory store for the confirmation round-trip, keyed on UUID `identificationId` with 10-min TTL. Periodic cleanup via unref'd `setInterval`.
- `reconcileIngredients(labelList, cascadeIngredients)` — normalizes both sides and returns `{ agreementPct, overlap, labelOnly, cascadeOnly, agreed }` (threshold 0.5). Used for audit logging only; scoring decisions always prefer cascade data.

Handler: `/analyze` in `server.js` has a flag-gated branch before the legacy `if (image)` block. It handles both fresh vision POSTs and `{ identificationId }` resume POSTs from the confirmation modal.

Flow:
1. **Identify** — fresh path calls `callClaudeVisionIdentify`; resume path pulls from the in-memory store.
2. **Confidence gate** (fresh only). Policy: if vision returned a usable product_name, score it. Refusal is reserved for true non-identifications.
   - No usable name OR `confidence < 0.30` → respond `{ status: "need_better_photo", reason: "low_confidence" }`. "No usable name" means empty, the placeholder "Scanned product", or fewer than 2 chars.
   - `0.30 <= confidence < 0.45` → respond `{ status: "needs_confirmation", identificationId, identified }` with a fresh stored record.
   - `>= 0.45` → proceed silently. (Raised from 0.60 because the cascade + Tier 5 fallback already handles cascade misses honestly; the high threshold was causing confirmed identifications to be refused.)
3. **Cascade** — CALIBRATION exact → `fuzzyCalibrationLookup` (vision-only Tier 1.5, retained to avoid regressions) → name-keyed score cache → `tier3OpenFactsTextSearch` → `tier4WebExtract` → `tier5CategoryPrior`. Identical tier ordering to the text cascade: once the photo identifies the product, scoring follows the same product-name lookup path as if the user had typed the name.
4. **Reconciliation** — when both cascade ingredients and `label_ingredients` are populated, `reconcileIngredients` runs and disagreements are logged as `vision_cascade_disagreement`. Cascade always wins for scoring; `label_legibility` is informational only.
5. **Score**:
   - Cascade hit (calibration) → calibration scoring path, identical shape to text/barcode calibration results.
   - Cascade hit (OFF / web_search) → full Pass 1 with `materialContext` set to the verified ingredients. Substance floors, consistency checks, positive ceilings all run as in the barcode path.
   - No cascade → Tier 5 synthetic category-prior best guess, `source: "ai_text_only_estimate"`, `source_confidence: "low"`, `source_label: "Best guess from product name"`, `_skipCache: true`. Same UX and contract as Tier 5 in the text cascade — identified products always get a score, with an honest "best guess" label when no external source verified the formula.

Label ingredients are never used as the scoring source (replaced the earlier `photo_verified` / `vision_photo_verified_fallback` path). The label was always supposed to be a verification signal, not a gating or scoring mechanism; gating on `label_legibility` caused confirmed identifications (Abes Mini Muffins, Peppermint) to refuse when the cascade missed and the label was partial. Tier 5 closes that gap with the same honest fallback the text path uses.

Response schema additions:
- `status: "needs_confirmation" | "need_better_photo"` — presence indicates a non-scored response.
- `identificationId` — UUID for the resume POST, only on `needs_confirmation`.
- `identified: { product_name, brand?, variant?, confidence? }` — surfaces on non-scored responses so the frontend can echo the identification in its prompts.
- `reason: "low_confidence"` — machine-readable classification. `need_better_photo` only fires on `confidence < 0.5`; there is no longer a `no_external_source` refusal.
- `vision_reconciliation` — agreement fraction, attached to scored results when both label and cascade ingredients existed.

Frontend: `App.jsx` `handleImageScan` branches on `data.status`. `needs_confirmation` opens a cream-card modal (Fraunces headline, moss primary "Yes, score it", outlined secondary "No, retake photo"). "Yes" calls `resumeFromConfirmation` which POSTs `{ identificationId, userId }` to `/analyze` — no second vision call. `need_better_photo` takes over the screen with a full-cream refusal view (moss primary "Retake photo" via hidden camera input, outlined "Scan barcode instead", minimal "Cancel"); now only reached when identification confidence is below 0.5. Both states sit at z-index 9998 alongside the barcode loading overlay. Design system compliance is mandatory: no alarm colors, no italics, no emoji, asymmetric radii via `var(--card-shape-2)` and `var(--tile-shape-*)`.

Log events for audit:
```bash
# Confidence distribution + legibility patterns
grep vision_identification_result | jq '{confidence, label_legibility}'

# Audit cascade vs label divergence — these may indicate AI fabrication or genuine product changes
grep vision_cascade_disagreement | jq '{product_name, agreement_pct, label_only, cascade_only}'

# How often the cascade misses and Tier 5 (best-guess-from-name) fires — should fall as calibration grows
grep vision_cascade_tier5 | jq '{product_name, category, score}'

# Refusal rate — low-confidence identifications only (reason: "low_confidence")
grep vision_refusal | jq '{reason, product_name}'
```

Cost profile: a cache-miss vision scan fires up to three Haiku calls (identify + Tier 4 web search + Pass 1 scoring) vs. one call in the legacy path. Acceptable at current volume; revisit the Tier 4 gate if cost scales unfavorably. Latency worst case ~24s (identify ~4s + Tier 4 ~12s + Pass 1 ~8s); a cache-hit scan still returns ~1s. The existing `GlobeLoading` overlay covers this budget.

Turn-off path: set `VISION_CONTRACT_V2=false` (or unset) in Railway env. Backend reads the flag per-request, so the restart is the only required action — no cache clear, no frontend redeploy. The frontend states are defensive: they only render when backend responses carry the new `status` field.

Re-introduction risk: if Tier 4 is loosened (timeout raised, trigram threshold dropped, `found: false` not respected), the vision path gains the same Danimals-style fabrication failure mode the text cascade closed in 2026-04-20. Don't loosen without a written reason.

---

## Brand Logo

The Partiqule wordmark was introduced 2026-04-19, replacing the older leaf/Q icon + "Partiqule" text lockup. The wordmark spells out "partiqule" in a cream serif with a large decorative green Q as the 6th letter. Two wordmark variants exist because both dark-chrome (app headers) and light-chrome (SEO pages) contexts need legible rendering.

**Asset files** (all in `frontend/public/`):

| File | When to use |
|---|---|
| `partiqule-wordmark.svg` | Primary, cream letters — dark backgrounds (main app nav, barcode scanner overlay, SEO page footer, Barcode loading screen) |
| `partiqule-wordmark-light.svg` | Dark letters on transparent — light backgrounds (SEO page nav at `background:#fff`) |
| `partiqule-stacked.svg` | Vertical Q-above-text lockup — reserved for future use (about page, stories, etc.) |
| `partiqule-q.svg` | Q-only, green `#2d6a32` on transparent — favicon source and anywhere a full wordmark won't fit |
| `partiqule-wordmark-{360,720,1080}.png` | PNG exports of the primary wordmark — for canvas rendering (share cards) and any context where SVG is awkward |

**Favicons** — generated from `partiqule-q.svg` via `rsvg-convert`:

- `favicon.ico` — multi-size ICO (16, 32, 48 px) — primary entry point via `<link rel="icon" href="/favicon.ico">`
- `favicon-16x16.png`, `favicon-32.png`, `favicon-192.png`, `favicon-512.png`
- `apple-touch-icon.png` (180×180) — also symlinked as `apple-touch-icon-180x180.png`

**Regenerating** — when the source SVG changes, regenerate PNGs + favicon.ico:

```bash
# Requires librsvg (brew install librsvg)
cd frontend/public
rsvg-convert -w 360 partiqule-wordmark.svg -o partiqule-wordmark-360.png
rsvg-convert -w 720 partiqule-wordmark.svg -o partiqule-wordmark-720.png
rsvg-convert -w 1080 partiqule-wordmark.svg -o partiqule-wordmark-1080.png
rsvg-convert -w 16 -h 16 partiqule-q.svg -o favicon-16x16.png
rsvg-convert -w 32 -h 32 partiqule-q.svg -o favicon-32.png
rsvg-convert -w 192 -h 192 partiqule-q.svg -o favicon-192.png
rsvg-convert -w 512 -h 512 partiqule-q.svg -o favicon-512.png
rsvg-convert -w 180 -h 180 partiqule-q.svg -o apple-touch-icon.png
# favicon.ico needs Python — see scripts/pack-ico.py (or regenerate inline with the snippet in the 2026-04-19 commit history)
```

**Context inventory** — every surface that renders the logo and which variant it uses:

- Main app header (`App.jsx` main nav) — `partiqule-wordmark.svg`, height 28 mobile / 32 desktop
- Barcode scanner top bar overlay — `partiqule-wordmark.svg`, height 26 (dark camera background)
- Barcode loading screen (`BarcodeLoadingView`) — `partiqule-wordmark.svg`, height 60, pulse-animated
- SEO product pages nav (generated in `scripts/generate-product-pages.js`) — `partiqule-wordmark-light.svg`, height 30 (white nav background)
- SEO product pages footer — `partiqule-wordmark.svg`, height 24 (near-black footer background)
- Share card canvas (`ShareCompareCard`) — `partiqule-wordmark-1080.png` rasterized, drawn via `Image` onload into the top bar. Falls back to canvas text "PARTIQULE" if the image fails to load or if share is triggered before onload fires (cache-miss first use).
- Favicon / browser tab — `favicon.ico` multi-size + PNG links in `index.html`
- PWA manifest — `favicon-192.png` and `favicon-512.png`
- Service worker precache (`sw.js`) — `favicon.ico`, all favicon PNGs, `partiqule-wordmark.svg`. `CACHE_NAME` was bumped `partiqule-v2` → `partiqule-v3` during the wordmark migration so clients refetch.

**Not updated in the wordmark migration:**

- `frontend/public/og-image.png` (1200×630 social preview) — still contains the old leaf icon + "Partiqule" text. Composed image with decorative elements (radar graphic, floating particles) — not cleanly swappable via code. Regenerate in a design tool when convenient.
- iOS app icon — flows through Xcode / Capacitor config, not from this repo. Update in `frontend/ios/App/App/Assets.xcassets/` when next submitting to App Store.
- Loops email templates — live in the Loops dashboard, not in this repo.
- `frontend/public/logo.png` (old leaf logo) — kept in place because removing it could break cached clients. Safe to delete after a week of the wordmark being live.
- `partiqule-icon.svg` and `partiqule-banner.svg` — legacy old-design SVGs, kept for reference. Nothing in current code references them. Safe to delete.

**Color tokens** (for any new logo variant):
- Cream: `#f3ede2`
- Primary green Q: `#2d6a32`
- App chrome dark: `#052e16`

**Sizing** — wordmark aspect ratio is ~2.87:1. At 32px height, width ~92px. When a bigger presence is desired, prefer wider containers or the stacked variant over stretching.

---

## Brand Partnerships

- **Amazon Associates:** tag `partiqule-20` for all Amazon affiliate links
- **MiiR:** Awin affiliate `https://www.awin1.com/cread.php?awinmid=120517&awinaffid=2836392`
- **Liquid Death:** 12 calibrated SKUs (score 1-3)
- **MiiR:** 15 calibrated SKUs + 8 products.js entries (all score 1-2)

---

## Partiqule Design System

This section defines the visual and voice system for every surface in the Partiqule app. Read this before writing any UI code. Every rule below has been arrived at deliberately and should not be changed without a design conversation first.

---

### The aesthetic, in a sentence

Paper in natural light, not a SaaS dashboard. A knowing friend in your pocket, not an analyzer. Cream on cream with moss and amber accents, asymmetric shapes, serif warmth, DM Sans small caps for raw data, and a voice that reads labels for you without talking down.

---

### Foundation principles

1. Copy carries more weight than chrome. Every string of text is a voice moment, every label is an opportunity to sound like a real person.
2. The score is never the whole story. It appears next to a conversational verdict, not alone.
3. Your shelf is the spine. Every scan ends on a reminder of the collection the user is building.
4. One decision per moment. Each screen asks the user to do exactly one thing.
5. Honesty over comfort. If a premium brand is amber, it scores amber. Warmth comes from voice, not from softening facts.
6. Completion is ceremony. Loading, scanning, and shelving each get their own small moment.

---

### Colors

All colors live in `frontend/src/tokens.css` as CSS custom properties. Never type a hex code inline in UI code. Always use `var(--token-name)`.

#### Paper and ink

```
--cream:       #f3ede2   (primary page background)
--cream-light: #f7f1e7   (elevated surfaces and tiles, barely distinct from cream)
--ivory:       #f9f5ea   (button text on moss, occasional elevated accent)
--ink:         #1a1f15   (primary text, nearly black with a warm green undertone)
--ink-soft:    #4a5342   (secondary text, descriptions, sub copy)
--ink-faint:   #8a9080   (tertiary text, stamps, metadata)
```

#### Brand

```
--moss:        #2d5a27   (primary brand color, CTAs, serif accents)
--moss-deep:   #1f3f1b   (hover state only)
--sage:        #4a7c42   (secondary moss, rarely used)
--amber:       #c8781a   (warm accent, never a CTA color)
--moss-soft:   rgba(45, 90, 39, 0.08)   (tinted backgrounds for badges)
```

#### Rules and borders

```
--rule:        rgba(26, 31, 21, 0.16)   (standard hairline)
--rule-soft:   rgba(26, 31, 21, 0.08)   (subtle dividers)
--rule-strong: rgba(26, 31, 21, 0.28)   (emphasized borders)
```

#### Score colors

Natural earth versions that live inside the cream and moss palette. Thresholds unchanged from the original system (≤3 green, ≤5 amber, >5 red).

```
--score-green: #6b8c3e   (scores 3 and below)  — leaf green
--score-amber: #c49a33   (scores 4 to 5)        — golden wheat
--score-red:   #b0493a   (scores above 5)       — terracotta clay
```

#### Outer frame

When rendering in a web context or embedding the app, the outer background is a slightly darker warm beige `--outer-bg: #e0d8c5`. Not used inside the screen itself.

---

### Typography

Two fonts, each with a specific job. Never substitute and never mix up the roles.

#### Fraunces

Used for: greetings, product names, verdict headlines, section titles, score numbers, warm moments ("here's what I found"), feed card headlines.

Fraunces is a variable font with axes for weight, optical size, softness, and wonk. The italic axis is NOT loaded — warmth comes from word choice, moss color, and opacity, never from slanted type. Use the default Regular weight unless a specific moment wants emphasis.

Size range in app: 18px (small warm notes) to 40px (hero greetings). Most commonly 20 to 24px for section titles.

Note: at sizes under 14px, the "wonk" axis can make Fraunces hard to read. Our system uses DM Sans below that threshold.

#### DM Sans

Used for: body text, button labels, descriptions, sub copy, product brand names in small caps, nutrition facts, ingredient lists, any functional text, and all the data moments that used to belong to DM Mono — timestamps, material compositions, section labels in caps, shelf brand names, SKU or review IDs.

Weights 400 to 600 only.

Data bits render uppercase with letter-spacing between 0.14em and 0.22em for a small caps treatment. This preserves the documentary feel without needing a third typeface. The `--mono` token in `tokens.css` is an alias pointing at DM Sans so legacy `var(--mono)` references keep working during migration.

Brand labels follow the same pattern: uppercase, letter-spacing 0.22em.

---

### Asymmetric border radii

A signature element of the system. No tile on any screen should use a symmetric radius. Each card, thumbnail, and circular element uses one of the predefined shapes to feel hand cut rather than stamped.

#### Tile shapes (small tiles, shelf thumbnails)

```
--tile-shape-1: 12px 14px 10px 15px / 14px 10px 15px 12px
--tile-shape-2: 14px 10px 15px 12px / 10px 15px 12px 14px
--tile-shape-3: 10px 15px 12px 14px / 15px 12px 14px 10px
--tile-shape-4: 15px 12px 14px 10px / 12px 14px 10px 15px
--tile-shape-5: 11px 13px 15px 12px / 13px 15px 12px 11px
--tile-shape-6: 13px 15px 11px 14px / 15px 11px 14px 13px
```

#### Card shapes (feed cards, alternatives)

```
--card-shape-1: 16px 20px 14px 18px / 18px 14px 20px 16px
--card-shape-2: 20px 14px 18px 16px / 14px 18px 16px 20px
--card-shape-3: 14px 18px 16px 20px / 20px 16px 14px 18px
--card-shape-4: 15px 16px 14px 18px / 16px 14px 18px 15px
```

#### CTA shape (scan card and similar prominent surfaces)

```
--cta-shape: 22px 18px 24px 20px / 20px 24px 18px 22px
```

#### Circle shape (profile circles, nav scan button, score dots)

```
--circle-shape: 49% 51% 50% 50% / 52% 48% 52% 48%
```

When placing multiple tiles in a row or grid, cycle through the shapes so no two adjacent tiles match. The visual irregularity is the signal.

---

### Motion

All motion is ambient and slow. No bouncy micro-interactions, no pulsing CTAs, no attention grabbing animations.

1. Morning light wash. A static warm gradient at the top 280px of every screen. Mimics sunlight hitting a page on a kitchen table.
2. Drifting particles. 12 small dots (1.5 to 3px) in moss, amber, and soft ink tints. Three drift animations at 22 to 32 second cycles. Low opacity.
3. Breathing scale. Key stages (e.g. the hero scan card) scale by 1.012x on a 5 second cycle. Almost imperceptible.
4. Fade up on load. Content sections fade in with 8px upward translate, staggered 80 to 150ms apart.
5. Subtle hover lifts. Interactive cards translate up 1 to 2px on hover.

#### Never
- Glow halos behind elements
- Pulsing or throbbing CTAs
- Spinning icons or loaders
- Circular loading animations (typewriter + linear rule + dots is the pattern)
- Color shifts on hover
- Anything that feels like a game or a toy

---

### Voice

Write as a friend who reads labels for a living. First and second person. Specific over vague. Confident without being preachy. Short sentences. Real words.

#### Use

"Here's what I found, Paul."
"I'd swap if you can."
"Not a crisis. Just a cleaner one nearby."
"Keep these for the gym."
"Two I'd reach for instead."
"Already on your shelf."
"Nice work on the Clif Bars."
"Mostly the fabric."

#### Avoid

"Analysis complete."
"Score: 5/10."
"Consider an alternative product."
"View details."
"Your results."
"Product information."

The test: would a friend say it out loud? If no, rewrite.

#### Verdict phrasing by score

```
1 to 3 (green):  "Looks good to me."  /  "A keeper."  /  "Solid."
4 to 5 (amber):  "I'd swap if you can."  /  "Fine for X, not Y."  /  "Judgment call."
6 to 10 (red):   "I'd pass on this one."  /  "Skip it."  /  "Not great."
```

---

### Component patterns

#### Result screen

Top to bottom: top bar (wordmark left, shelf badge right), product header (stamp, brand in caps, serif name, DM Sans composition), verdict block (score ring + conversational headline), friend's note (caps label + serif paragraph), primary action row (moss primary + outlined secondary), two swap cards, shelf strip with ledge, footer.

#### Hero screen

Top bar, greeting (38px serif, normal weight), DM Sans caps stamp, quiet scan card (cream with moss frame, not solid moss), shelf strip with ledge, intelligence feed cards horizontal, This Week recap with serif stats in moss, bottom nav.

#### Loading screen

No circular animations. Product identity at top matches the result screen. Center: typewriter animation cycling through four status messages — "Reading the label...", "Checking what's inside...", "Looking up what we know...", "Scoring against the rest..." — Fraunces normal weight, moss color. Below the typewriter: a 200px thin moss rule draws left to right as each step completes. Below the rule: four 6px moss dots, each fills as its step message appears, 16px spacing between dots. Static footer line in small serif.

#### Detail view

Extends the result screen with three new sections: sub-scores (horizontal rows, caps label + big serif score + sans description), composition breakdown (grouped with colored concern dots per item), Worth Knowing flags (editorial paragraphs with arrow action suggestions).

#### Alternatives view

Simple: back arrow, stamp tying it to source product, large serif title, serif subtitle, source toggle (Amazon / Brand site / Target), list of 4 to 6 alternative cards each with score ring + brand + name + DM Sans composition + tags.

---

### Layout conventions

- Screen background is always `var(--cream)`
- Primary padding unit is 24px for screen edges
- Section spacing is 32px
- Cards use 1px borders with `var(--rule)` or `var(--rule-soft)`
- Bottom nav is always 80px tall with safe area padding on iOS
- Top bar always has a 1px bottom border in `var(--rule)`
- Caps labels always use the label pattern: small horizontal rule (22px wide, 1px tall, moss at 0.7 opacity) followed by DM Sans caps text with 10px gap

---

### Never do

1. Use italics anywhere. Warmth comes from word choice, opacity, and moss color, not slanted type. The Fraunces italic axis is not loaded from Google Fonts for this reason.
2. Use Outfit, DM Mono, or Instrument Serif. Fraunces and DM Sans only.
3. Use purple `#7c3aed` as an accent. Signals generic SaaS.
4. Use white backgrounds. Use cream.
5. Use cold navy for dark surfaces. Dark mode is out of scope — the canonical surface is warm paper light.
6. Put icons inside colored squares. This is the Linear and Notion pattern. Use serif typography or DM Sans caps labels instead.
7. Use emoji in any UI string.
8. Write hex codes inline. Always reference `var(--token-name)` from `tokens.css`.
9. Use hard rounded rectangles or symmetric border-radius on tiles and cards. All tiles are asymmetric via shape tokens.
10. Add glow halos to interactive elements.
11. Write UI copy in third person or dashboard voice ("Your data", "Analysis", "Details").
12. Create section headers that sound like a dashboard ("Overview", "Details", "Data", "Analysis").
13. Use pulsing or bouncing animations.
14. Substitute a system font for Fraunces or DM Sans.
15. Make the primary score bigger than the verdict headline. They share the frame.
16. Display the ingredients list or composition in sentence case. It is always DM Sans caps with letter-spacing.
17. Let any screen end without a reference back to the user's shelf.

---

### Design system files

All visual and code references live in one of:

- `frontend/src/tokens.css` — authoritative source for all color, type, radius, spacing values
- `docs/brand-kit.html` — visual reference for humans
- `docs/mockups/` — HTML mockups of each screen (hero, clothing result, loading, details + alternatives, icon POC)

If a pattern isn't in one of those files, pause and ask whether it needs to exist.
