# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Partiqule — AI-powered microplastics risk scanner for consumer products. Users search or scan a product and receive a 1-10 risk score with specific plastic/chemical concerns and curated alternatives.

## Development Commands

```bash
# Backend (port 3001)
cd backend && npm install && node server.js

# Frontend (port 3000, proxies API to backend)
cd frontend && npm install && npm run dev

# Production build (frontend)
cd frontend && npm run build

# End-to-end tests
node test-suite.js [--url https://your-api-url]

# Deploy (copies, commits, pushes, clears cache)
./deploy.sh "commit message"
```

Backend requires `backend/.env` with at minimum `ANTHROPIC_API_KEY`. See `backend/.env.example` for all variables.

## Architecture

**Frontend:** React 18 + Vite. The entire UI lives in a single monolithic component (`frontend/src/App.jsx`, ~6400 lines) with inline styles throughout — no CSS files or framework. State is managed with `useState` hooks only. Capacitor wraps the app for iOS (StoreKit IAP for subscriptions).

**Backend:** Express API (`backend/server.js`, ~5000 lines). Single-file server with all endpoints, scoring logic, and caching.

**Scoring pipeline (two-pass):**
1. Pass 1: Claude Haiku analyzes product → returns dimension scores (materials, packaging, usage, sustainability)
2. Pass 2: Independent Claude call verifies Pass 1, then code-level enforcement applies
3. Final score = `materials * 0.55 + packaging * 0.15 + usage * 0.15 + sustainability * 0.15`
4. Substance floors (113 hardcoded chemicals) override AI scores — e.g., if Red 40 detected, materials floor = 7
5. Calibration registry (`backend/calibration.js`, 2000+ known products) overrides AI entirely for known products

**Key principle:** Substance floors and calibration scores are code-enforced, not AI-optional. The AI cannot lower a score below a substance floor.

**Caching (multi-layer):** In-memory Map → Upstash Redis (90-day TTL) → disk fallback (`/tmp/partiqule_cache.json`).

## Key Files

- `frontend/src/App.jsx` — Entire React UI (components defined as const functions within the file)
- `backend/server.js` — All API endpoints, scoring logic, substance registry, caching
- `backend/calibration.js` — 2000+ known product scores (source of truth for known products)
- `backend/products.js` — 205 affiliate alternative products across 6 categories
- `backend/amazon-api.js` — Amazon PA API integration

## API

Primary endpoint: `POST /analyze` accepts `{query, category, childMode, pregnancyMode, materialContext}`.
Returns scored result with concerns, dimensions, alternatives, and optional food analysis.

Admin endpoints (require ADMIN_KEY): `/cache-status`, `/cache-clear`, `/cache-clear-product`, `/cache-warm`, `/recent-scans`.

## Conventions

- All frontend styling is inline JavaScript objects (camelCase properties, no CSS files)
- Color system: green (safe) → yellow (caution) → orange (warn) → red (danger)
- Mobile breakpoint: `isMobile = window.innerWidth < 768`
- Dark mode via `isDark` boolean state
- Admin access restricted to hardcoded `ADMIN_EMAILS` list
- Amazon Associates tag: `partiqule-20`
- Auth: Supabase (email/password), billing: Stripe (web) + StoreKit (iOS)
- Rate limit: 30 scans/hour per IP on `/analyze`
- Free tier: 10 scans/month, Paid: 20 scans/month

## Deployment

- **Backend:** Railway (auto-detects `backend/package.json`, runs `npm start`)
- **Frontend:** Vercel (root: `frontend`, framework: Vite)
- `API_BASE` in `App.jsx` line 3 must point to the Railway backend URL in production
