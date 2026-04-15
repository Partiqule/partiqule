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

# Production build (frontend) -- also generates 2,300+ SEO pages via prebuild
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
curl "https://partiqule-production.up.railway.app/cache-clear?key=RowenaRavenclaw2024!"
```

Commit messages: plain English only, no special characters, no em dashes (they break terminal quote parsing).

---

## Architecture

**Frontend:** React 18 + Vite. The entire UI lives in a single monolithic component (`frontend/src/App.jsx`, ~10,000 lines) with inline styles throughout -- no CSS files or framework. State is managed with `useState` hooks only. Capacitor wraps the app for iOS (StoreKit IAP via `@capgo/native-purchases` loaded dynamically).

**Backend:** Express API (`backend/server.js`, ~6,500 lines). Single-file server with all endpoints, scoring logic, caching, and intelligence feed pipeline.

**Scoring pipeline (two-pass):**
1. Pass 1: Claude Haiku analyzes product across 5 dimensions (materials, usage, packaging, sustainability, manufacturing)
2. Pass 2: Independent Claude call verifies Pass 1, then code-level enforcement applies
3. Final score = weighted formula by category (e.g. food: materials 90% + packaging 10%)
4. Substance floors (100+ hardcoded chemicals) override AI scores
5. Regulatory flags from Supabase injected into AI prompt for approved findings
6. Calibration registry (`backend/calibration.js`, 2400+ known products) overrides AI entirely
7. Child scores computed via `computeChildScore()` with category-specific bumps
8. Pregnancy scores computed via `computePregnancyScore()` with substance-specific bumps
9. Intelligence cards attached to results when ingredient/category triggers match

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

- `frontend/src/App.jsx` -- Entire React UI (~10,000 lines, all components defined as const functions)
- `frontend/vite.config.js` -- Build target is `safari15` for iOS WKWebView compatibility
- `frontend/public/sw.js` -- Service worker (cache name `partiqule-v2`)
- `frontend/scripts/generate-product-pages.js` -- Generates 2,300+ static SEO pages at build time
- `backend/server.js` -- All API endpoints, scoring logic, substance registry, intelligence feed, caching
- `backend/calibration.js` -- 2400+ known product scores (source of truth for known products)
- `backend/products.js` -- 220+ affiliate alternative products across 6 categories
- `backend/amazon-api.js` -- Amazon Creators API integration (tag: partiqule-20)
- `backend/scoring-regression-test.js` -- 19 assertion tests against calibration data

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
- Share card (ShareCompareCard) for product comparison sharing
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
- All 3 fresh-result paths (text, vision, barcode) call `attachIntelCards()` before `res.json()`
- Regulatory flags are loaded into `REGULATORY_FLAGS_CACHE` on startup and injected into pass1 via `buildRegulatoryContext()`

### Frontend styling
100% inline JavaScript styles (camelCase). No CSS files. Dark mode via `isDark` boolean (currently always true). Color system: green (safe) -> yellow (caution) -> orange (warn) -> red (danger). Mobile breakpoint: `isMobile = width < 768`. Tablet breakpoint: `isTablet = width >= 768 && width <= 1024`.

### Session rules
- One feature per Claude Code session. Multi-feature sessions cause tangled diffs.
- Always read CLAUDE.md before writing any code in a session.
- Test on 390px viewport after any UI change.

---

## App Store Submission Notes

**Account deletion path:** Account button in header (mobile/tablet) or Settings in hamburger menu -> Settings page -> Danger Zone -> Delete My Account. Direct URL: partiqule.com/account

**Restore Purchases:** Available in paywall modal ("Restore previous purchase") and Settings > Subscription section ("Restore purchases"). Both call `loadNativePurchases().restorePurchases()`.

**Subscription terms (all 6 required by Apple adjacent to subscribe button):**
1. Price: $4.99/month
2. "Payment will be charged to your Apple ID"
3. Auto-renewal disclosure
4. Cancellation instructions
5. Privacy Policy link
6. Terms of Service link

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

## Brand Partnerships

- **Amazon Associates:** tag `partiqule-20` for all Amazon affiliate links
- **MiiR:** Awin affiliate `https://www.awin1.com/cread.php?awinmid=120517&awinaffid=2836392`
- **Liquid Death:** 12 calibrated SKUs (score 1-3)
- **MiiR:** 15 calibrated SKUs + 8 products.js entries (all score 1-2)
