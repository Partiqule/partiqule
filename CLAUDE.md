# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

Partiqule — AI-powered product health scoring app. Users search, scan a barcode, or photograph a product and receive a 1–10 risk score with specific chemical concerns, child/pregnancy safety scores, and curated cleaner alternatives. Lower score = safer product.

Paul is CEO/developer. Sara is co-founder handling content and Instagram.

---

## Development Commands

```bash
# Backend (port 3001)
cd backend && npm install && node server.js

# Frontend (port 3000, proxies API to backend)
cd frontend && npm install && npm run dev

# Production build (frontend) — also generates 2,300+ SEO pages via prebuild
cd frontend && npm run build

# Regression tests (zero API cost — runs against calibration data only)
cd backend && npm test

# iOS build
cd frontend && npm run build && npx cap sync ios && npx cap open ios

# Deploy script
./deploy.sh "commit message"
```

Backend requires `backend/.env` with at minimum `ANTHROPIC_API_KEY`. See `backend/.env.example` for all variables.

After ANY backend/server.js or backend/calibration.js change, clear the cache:
```bash
curl https://partiqule-production.up.railway.app/cache-clear?key=RowenaRavenclaw2024!
```

Commit messages: plain English only, no special characters, no em dashes (they break terminal quote parsing).

---

## Architecture

**Frontend:** React 18 + Vite. The entire UI lives in a single monolithic component (`frontend/src/App.jsx`, ~8400 lines) with inline styles throughout — no CSS files or framework. State is managed with `useState` hooks only. Capacitor wraps the app for iOS (StoreKit IAP via `@capgo/native-purchases` loaded dynamically).

**Backend:** Express API (`backend/server.js`, ~6100 lines). Single-file server with all endpoints, scoring logic, and caching.

**Scoring pipeline (two-pass):**
1. Pass 1: Claude Haiku analyzes product → returns dimension scores (materials, packaging, usage, sustainability)
2. Pass 2: Independent Claude call verifies Pass 1, then code-level enforcement applies
3. Final score = `materials * 0.55 + packaging * 0.15 + usage * 0.15 + sustainability * 0.15` (weights vary by category)
4. Substance floors (113 hardcoded chemicals) override AI scores — e.g., if Red 40 detected, materials floor = 7
5. Calibration registry (`backend/calibration.js`, 2400+ known products) overrides AI entirely for known products
6. Child scores computed via `computeChildScore()` with category-specific bumps
7. Pregnancy scores computed via `computePregnancyScore()` with substance-specific bumps

**Key principle:** Substance floors and calibration scores are code-enforced, not AI-optional. The AI cannot lower a score below a substance floor.

**Caching (multi-layer):** In-memory Map → Upstash Redis (90-day TTL) → disk fallback (`/tmp/partiqule_cache.json`).

**Unified helpers (must use these for consistency across all paths):**
- `serializeAlternatives(rawAlts, category)` — guarantees every alternative has score, child_score, pregnancy_score
- `computeSafetyScores(finalScore, category, productName, p1, triggers, extraText)` — single source of truth for child + pregnancy scoring

---

## Ten Design Laws — Apply to Every Change

Before writing any code, name which law(s) the change serves. If a design choice conflicts with a law, the law wins.

```
01 Value in 30 seconds    — no paywall, tutorial, or input required before first result
02 Score never destination — every score shown has a next action visible without scrolling
03 Surfaces are earned    — features appear only when user behavior triggers them
04 One decision per moment — one primary action per screen or card, others visually subordinate
05 Completion is ceremony  — audits/sessions get grade + share card + clear next step
06 Constraint = personal.  — budget/mode inputs framed as telling the app about you, never a limit
07 Flow protects itself    — task modes hide nav bar, preserve session state indefinitely
08 Honest over comfortable — scores never softened, flags always name specific compounds
09 Context makes score     — every score shown with category average or trend context
10 Share is native         — every completion moment has a purpose-built share card
```

Score color thresholds (consistent everywhere, never change):
- ≤ 3.0 → #16a34a (green)   background: #f0fdf4
- ≤ 5.0 → #d97706 (amber)   background: #fffbeb
- > 5.0 → #dc2626 (red)     background: #fef2f2

**ScoreBadge component** — a shared component renders score numbers identically across all surfaces. A 6.8 in My Routine must look identical to a 6.8 on a scan result. Never render score numbers with ad-hoc inline color logic; always use ScoreBadge.

---

## Key Files

- `frontend/src/App.jsx` — Entire React UI (components defined as const functions within the file)
- `frontend/vite.config.js` — Build target is `safari15` for iOS WKWebView compatibility
- `frontend/scripts/generate-product-pages.js` — Generates 2,300+ static SEO pages at build time
- `backend/server.js` — All API endpoints, scoring logic, substance registry, caching
- `backend/calibration.js` — 2400+ known product scores (source of truth for known products)
- `backend/products.js` — 220+ affiliate alternative products across 6 categories
- `backend/scoring-regression-test.js` — 19 assertion tests against calibration data
- `backend/amazon-api.js` — Amazon PA API integration (tag: partiqule-20)

---

## API Endpoints

**Public:**
- `POST /analyze` — Main scoring endpoint. Accepts `{query, category, childMode, pregnancyMode, materialContext, image, mediaType}`
- `POST /barcode` — Barcode scan via Open Food Facts / Beauty Facts / Products Facts lookup + full AI pipeline
- `GET /health` — Status check

**User:**
- `POST /subscribe` — Email newsletter signup
- `POST /delete-account` — Full account + subscription deletion
- `POST /create-checkout` — Stripe checkout session
- `GET /scan-count` / `GET /subscription-status` — User state
- `POST /score-feedback` — User score reports ("this score seems wrong")
- `POST /suggest` — Product suggestion submissions
- `POST /verify-apple-receipt` / `POST /apple-iap-confirm` — iOS IAP

**Admin (require ADMIN_KEY):**
- `GET /admin/api-budget` — View/reset API spend counters
- `GET /admin/reload-redis` — Batched Redis reload with checkpoint resume
- `GET/POST/DELETE /admin/calibration` — No-code score overrides via Supabase
- `GET /cache-status` / `GET /cache-clear` / `GET /cache-clear-product`
- `GET /recent-scans` — Admin scan browser
- `GET /score-feedback` / `POST /score-feedback/resolve` — Review user reports
- `GET /suggestions` / `POST /suggestions/resolve` — Review product suggestions

---

## Critical Conventions

### iOS / Capacitor
- `@capgo/native-purchases` must be loaded via dynamic `import()`, NOT `require()`. The `require()` approach silently fails in Vite's browser bundle and leaves `NativePurchases = null`, causing a crash on iOS when `IS_NATIVE` is true. Use `loadNativePurchases()` helper.
- Build target must be `safari15` in vite.config.js for WKWebView compatibility
- After any frontend change: `npm run build && npx cap sync ios` before testing in Xcode

### ⚠️ The duplicate import bug
When copying App.jsx from external sources (claude.ai artifacts, etc.), line 4 often re-introduces `import { NativePurchases, PURCHASE_TYPE } from "@capgo/native-purchases"` which conflicts with the `let` declaration on line 2. This causes Vite build failure. Always check the first 5 lines after copying.

### API spend guardrails
- Hard daily cap (default 500) and monthly cap (default 5000) on Claude API calls
- Override via env vars `API_DAILY_CAP` and `API_MONTHLY_CAP`
- Webhook alerts at 50%/80%/95% via `ALERT_WEBHOOK_URL` env var
- NEVER run bulk operations (Redis reload, cache warm) without confirming the rate limit and budget are adequate

### Scoring pipeline consistency
- There are 6 code paths that produce a scored result (text, vision, text-fuzzy, vision-fuzzy, barcode, admin-reload). All must use `serializeAlternatives()` and `computeSafetyScores()` to avoid drift.
- Child scores and pregnancy scores must be computed and included in EVERY response path
- The fuzzy calibration path must include alternatives + nutrition from the calibration entry

### Frontend styling
100% inline JavaScript styles (camelCase). No CSS files. Dark mode via `isDark` boolean. Color system: green (safe) → yellow (caution) → orange (warn) → red (danger). Mobile breakpoint: `isMobile = window.innerWidth < 768`.

### Session rules
- One feature per Claude Code session. Multi-feature sessions cause tangled diffs and hard-to-trace bugs.
- If a session produces unexpected changes or touches files outside its named scope: Ctrl+C, review with `git diff`, revert with `git checkout .` if needed, restart with a tighter prompt.
- Always read CLAUDE.md, server.js, and App.jsx before writing any code in a session.
- Test on 390px viewport after any UI change.

---

## localStorage Keys

```
ps_history               — array of scan objects {product_name, score, category, scannedAt, room?}
ps_lists                 — array of list objects {id, name, type, items[], createdAt, lastOpenedAt}
ps_scan_count            — integer, scans used (free tier enforcement)
ps_email_captured        — "1" if email capture dismissed
partiqule_child_mode     — "1" if kids scoring mode active (persists across sessions)
partiqule_pregnancy_mode — "1" if pregnancy scoring mode active (persists across sessions)
```

Shopping list item shape: `{ text, checked, score, category, addedAt, room? }`

---

## Feature Architecture: Lists (replaces My Routine nav)

The desktop nav "My Routine" item (`setPage("routine")`) has been replaced with "Lists" (`setPage("lists")`). The "routine" page route still exists for backwards compatibility.

**ListsPage** has three tabs:
- **Shopping Lists** — freeform, quick-add, stored in `ps_lists` localStorage
- **Grocery Lists** — scored, budget-aware (coming soon state, surfaces in Phase 3)
- **My Routine** — existing RoutinePage component rendered unchanged inside this tab

Lists state in App.jsx:
```javascript
const [lists, setLists] = useState(() => {
  try { return JSON.parse(localStorage.getItem("ps_lists") || "[]"); } catch { return []; }
});
const saveLists = (updated) => {
  setLists(updated);
  try { localStorage.setItem("ps_lists", JSON.stringify(updated)); } catch {}
};
```

Nav badge shows count of unchecked items across all shopping lists.

---

## Feature Architecture: Home Audit Surface

The hero page shows a home coverage card for users with 3+ scans. It uses:

```javascript
const getHomeCoverage = (history) => {
  const ROOM_MAP = {
    cleaning: { room: "Kitchen", icon: "🧹" },
    home: { room: "Home", icon: "🏠" },
    personal_care: { room: "Bathroom", icon: "🚿" },
    skincare: { room: "Bathroom", icon: "🚿" },
    food: { room: "Pantry", icon: "🥫" },
    food_beverage: { room: "Pantry", icon: "🥫" },
    beverage: { room: "Pantry", icon: "🥫" },
    snack: { room: "Pantry", icon: "🥫" },
    clothing: { room: "Closet", icon: "👗" },
    baby: { room: "Nursery", icon: "🍼" },
    toy: { room: "Nursery", icon: "🍼" },
  };
  // returns array of {room, icon, count} sorted by count desc
};
```

Rooms with 3+ scans are "ready to audit" (highlighted blue). Room tags are stored as `item.room` on history items — an optional field added via the "Which room?" prompt after scanning home-relevant categories.

History page has a "By date / By room" toggle. "By room" view groups scans by room with average score and "Audit →" button per room when count ≥ 3.

---

## Hero Page States

The hero page has three distinct states — design all three before shipping any one:

**Day One** (history.length === 0): scan entry only. Today's Comparison demo visible. No For You cards. Trust signals NOT shown (they live on About/Methodology pages only).

**Building** (history.length 1–29): For You cards begin appearing based on behavior. Today's Comparison hidden. Home coverage card visible when 3+ scans. Lists For You re-engagement cards visible.

**Established** (30+ days, completed audits): Full For You section. Lifestyle Score card when 10+ products scored. All surfaces earned by behavior.

Today's Comparison is gated: `{history.length === 0 && (<TodaysComparison />)}`
Trust signals grid is NOT on the hero — it belongs on the About page only.

---

## Current Feature State

**LIVE (do not break):**
- Scan (text + barcode + image), calibration scoring, alternatives panel (Amazon/Brand/Target)
- Kids Mode (`childMode`) and Pregnancy Mode (`pregnancyMode`) — both now persist via localStorage
- Share card, My Routine (RoutinePage), scan history (HistoryPage)
- Subscription: Stripe (web) + Apple IAP stubs
- Guides platform (`/guides`), Loops email capture, admin panel
- Lists page with Shopping Lists tab and My Routine tab
- ScoreBadge shared component
- Score context line (`category_score_context` field on scan response)
- Home coverage card on hero page
- Room tagging on scan result ("Which room?" prompt)
- History "By room" grouped view
- Comparison share card (ShareCompareCard)
- Mode toggle copy: "Scoring for a child" / "Scoring for pregnancy"
- CTA hierarchy on scan result: primary = See Alternatives or Scan Another

**IN PROGRESS (10 immediate wins):**
- Win 1: Score context line ✓ if done, else pending
- Win 2: Flag language audit (specific compounds, no hedge text)
- Win 3: ScoreBadge shared component ✓ if done, else pending
- Win 4: Scan result CTA hierarchy
- Win 5: Mode toggle copy + persistence
- Win 6: Comparison share card
- Win 7: Behavioral audit suggestion card on home page
- Win 8: Hero page lightening + home audit coverage card
- Win 9: Lists page replacing My Routine nav + shopping list seed
- Win 10: Room tag on scan + history category grouping

**NOT YET BUILT (Phase 2+):**
- For You section (full backend endpoint `/api/for-you/:userId`)
- Batch scan session (dedicated scan mode, accumulates into audit)
- Pantry Audit / Beauty Audit / Home Audit flows
- Lifestyle Score + timeline
- Grocery List (budget-aware, recipe-driven, Phase 3)
- Recipe Library (Sara-curated, Phase 3)

---

## Deployment

- **Backend:** Railway (auto-detects `backend/package.json`, runs `npm start`)
- **Frontend:** Vercel (root: `frontend`, framework: Vite, prebuild generates SEO pages)
- **iOS:** Xcode Archive → App Store Connect → TestFlight / App Store
- `API_BASE` in `App.jsx` line 6 must point to the Railway backend URL
- SEO pages at `/products/<slug>` are served by Vercel rewrite in `vercel.json`
- After clearing Railway cache, products rescore on next user scan (no manual intervention needed)

---

## Supabase Tables

**Existing:**
- `profiles` — user_id, email, scan_count, stripe_customer_id, is_subscribed
- `scans` — user_id, product_name, category, score, result_json, scanned_at
- `score_feedback` — product reports from users (pending/resolved/dismissed)
- `suggestions` — product suggestions from users (pending/added/dismissed)
- `calibration_overrides` — admin score overrides (merged into CALIBRATION Map at runtime)

**To be added (Phase 2):**
- `audits` — id, user_id, type, status, average_score, item_count, completed_at
- `audit_items` — id, audit_id, user_id, product_name, score, category, swapped, swap_product_name, swap_score
- `user_scores` — id, user_id, score, snapshot_date, audit_count, swap_count (monthly lifestyle score snapshots)
- `lists` — id, user_id, name, type, store, budget, average_score (server-side grocery lists)
- `list_items` — id, list_id, product_name, score, category, checked, recipe_id
- `recipes` — id, title, overall_score, ingredients (jsonb), meal_type, season, kids_safe, is_premium

---

## Brand Partnerships

- **Amazon Associates:** tag `partiqule-20` for all Amazon affiliate links
- **MiiR:** Awin affiliate `https://www.awin1.com/cread.php?awinmid=120517&awinaffid=2836392`
- **Liquid Death:** 12 calibrated SKUs (score 1–3)
- **MiiR:** 15 calibrated SKUs + 8 products.js entries (all score 1–2)
