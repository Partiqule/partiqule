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
- Intelligence cards surfaced on relevant scan results
- Feed page (/feed) -- dedicated scrollable inbox of all intelligence cards with filters
- Audit session flow (AuditSessionView) with pause/resume and completion ceremony (AuditCompleteScreen)
- Audit type selector (5 types: pantry, beauty, home, closet, nursery)
- Lists page with three tabs: Grocery Lists, Shopping Lists, My Routine
- Grocery list builder with recipe ingredient expansion, swap suggestions, budget tracker, quantity controls, post-shop summary and share card
- Shopping lists with add/check/delete items
- Subscription: Stripe (web) + Apple IAP with Restore Purchases
- Guides platform, admin panel with Intel Cards tab
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

- **Text path** (`/analyze` with `query`): DISABLED as of 2026-04-18. Returns `cannot_score_from_text_only` error. Cache and fuzzy-calibration hits still return (pre-verified scores), but the AI fallback (`pass1(productName, null, category)`) is gated behind `ALLOW_TEXT_PATH_SCORING` because it fabricated ingredient lists from training priors. See "Text Path Scoring Disabled" section below.
- **Vision path** (`/analyze` with `image`): `callClaudeVision` reads the label from pixels. LABEL TRUTH RULE in the vision system prompt tries to prevent AI priors from overriding visible text, but the risk is not eliminated.
- **Barcode path** (`/barcode`): Open Food Facts `ingredients_text_en` is injected into pass1 as ground truth via `offContext`. Safest path; only works for products OFF indexes.

Calibration entries and flagDetection both treat AI-returned `ingredient_list` as input. If the text path fabricates, flagDetection will dutifully "confirm" fabricated substances. Integrity of the ingredient list is a prerequisite, not something the scoring layer can repair.

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

## Text Path Scoring Disabled

Text-only queries (product name without image or barcode) are currently disabled to prevent AI ingredient fabrication. The `/analyze` endpoint returns `cannot_score_from_text_only` error when called without image data or barcode.

Feature flag: `ALLOW_TEXT_PATH_SCORING` (Railway env var)
- Default: false (disabled)
- Only re-enable after Pass 0 ingredient resolution layer is built and provides reliable ingredient ground truth.

This was disabled on 2026-04-18 after discovering the text path was producing fabricated ingredients for products like Danimals Strawberry Smoothie. The AI was inventing ingredient lists from training priors rather than reading real data.

Barcode path (`/barcode`) and image path (`/analyze` with image) continue to work normally. Only the text-only query path is affected. Cache hits and fuzzy-calibration hits on text queries still return (those are pre-verified scores, not AI-fabricated).

Client-side handling: frontend should treat HTTP 422 with `error: "cannot_score_from_text_only"` as a prompt to show the camera / barcode scanner. The `userAction: "show_camera_prompt"` field is the contract.

Frontend UX pattern (implemented in `App.jsx` `analyze()` and home view):
- On 422 with `error: "cannot_score_from_text_only"`, `analyze()` sets the `textOnlyBlocked` flag, forces `page="home"`, and exits without setting `error`. This suppresses the generic red error banner.
- The home view renders a forest-green scan prompt card (`#052e16`, Outfit font) titled "Let's see the label" with subtitle "To give you an accurate score, we need to read the actual ingredients on the package."
- Primary button "Scan barcode" opens the full-screen `BarcodeScannerView` (native ML Kit on Capacitor, `BarcodeDetector`/ZXing on web).
- Secondary button "Take a photo" is a hidden `<input type="file" capture="environment">` wrapped in a label, routing into the same `handleImageScan` flow used by the scan sheet.
- `textOnlyBlocked` is cleared by `reset()`, at the start of `analyze()`, at the start of `handleImageScan()`, and in the barcode `onBarcode` handler — any fresh scan intent dismisses the prompt.

Scan bottom sheet (the FAB-triggered sheet at `scanSheetOpen`) also exposes "Scan barcode" as its primary option, so users who open the sheet without first hitting a `textOnlyBlocked` state can still reach `BarcodeScannerView` directly. Order in the sheet: Scan barcode (primary, green), Take a photo (secondary), Choose from library (secondary), then the type-name input. Barcode scanning itself is unchanged — the sheet just wires a new entry point to the existing `setShowBarcodeScanner(true)` trigger, which branches internally between ML Kit (Capacitor) and `BarcodeDetector` / `@zxing/browser` (web).

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

Integration: `/barcode` calls Pass 0 as its first step (replaces the previous inline OFF/OBF/OPF fetch). `/analyze` text path remains gated behind `ALLOW_TEXT_PATH_SCORING` — re-enabling is a separate decision that should only be made after Pass 0 hit rates on text queries are proven non-trivial. `/analyze` image path is unchanged for now.

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
- `supabase_scans` → "From a previous Partiqule scan"
- `vision_ocr` → "Read from your photo"
- `none` → "Ingredients unverified"

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

## Brand Partnerships

- **Amazon Associates:** tag `partiqule-20` for all Amazon affiliate links
- **MiiR:** Awin affiliate `https://www.awin1.com/cread.php?awinmid=120517&awinaffid=2836392`
- **Liquid Death:** 12 calibrated SKUs (score 1-3)
- **MiiR:** 15 calibrated SKUs + 8 products.js entries (all score 1-2)
