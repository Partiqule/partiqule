# Partiqule

> Know what's in your products. AI-powered microplastics risk scanner.

**partiqule.com · @partiquleapp**

---

## What It Does

Partiqule lets users search or scan any consumer product and instantly receive a 1–10 microplastics risk score. Every result shows which specific plastics are present (BPA, PFAS, nylon, PET etc.), exposure type, and curated plastic-free alternatives with affiliate links.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, inline styles |
| Backend | Node.js, Express |
| AI Scoring | Anthropic Claude Haiku (two-pass) |
| Analytics | Plausible (privacy-friendly) |
| Hosting | Railway (backend) + Vercel (frontend) |
| Affiliates | Amazon Associates (`partiqule-20`) |

---

## Project Structure

```
partiqule/
├── backend/
│   ├── server.js          — Express API, two-pass Claude scoring, caching
│   ├── products.js        — 205-product affiliate database + direct swap map
│   ├── amazon-api.js      — Amazon PA API integration (activates after 3 sales)
│   ├── .env.example       — Environment variable template
│   └── package.json
├── frontend/
│   ├── index.html         — SEO meta tags, OG tags, Plausible analytics
│   ├── vite.config.js
│   ├── package.json
│   └── src/
│       ├── main.jsx
│       └── App.jsx        — Full React app
└── README.md
```

---

## Local Development

### Prerequisites
- Node.js 18+
- Anthropic API key (console.anthropic.com)

### Setup

**1. Clone and install:**
```bash
git clone https://github.com/YOURNAME/partiqule.git
cd partiqule

cd backend && npm install
cd ../frontend && npm install
```

**2. Create backend/.env:**
```
ANTHROPIC_API_KEY=your_key_here
AMAZON_PARTNER_TAG=partiqule-20
```

**3. Run backend (Terminal 1):**
```bash
cd backend
node server.js
# Running on port 3001
```

**4. Run frontend (Terminal 2):**
```bash
cd frontend
npm run dev
# Running on http://localhost:3000
```

---

## Deployment

### Backend → Railway
1. Connect GitHub repo to Railway
2. Set root directory: `backend`
3. Add environment variables (see below)
4. Deploy — Railway auto-runs `npm start`

### Frontend → Vercel
1. Connect GitHub repo to Vercel
2. Set root directory: `frontend`
3. Framework: Vite
4. Add `VITE_API_URL` environment variable
5. Update `API_BASE` in `App.jsx` line 3 to Railway URL
6. Deploy

---

## Environment Variables

### Railway (Backend)
```
ANTHROPIC_API_KEY=        # Required — from console.anthropic.com
AMAZON_PARTNER_TAG=       # partiqule-20
PORT=                     # 3001

# Add after PA API approval (3 Amazon sales):
AMAZON_ACCESS_KEY=
AMAZON_SECRET_KEY=
AMAZON_REGION=            # us-east-1
```

### Vercel (Frontend)
```
VITE_API_URL=             # Your Railway URL
```

---

## Scoring System

Two-pass AI scoring using Claude Haiku:

**Pass 1 — Deep Analysis**
- Identifies specific plastic polymers (PET, PFAS, nylon, BPA etc.)
- Scores product materials and packaging separately
- Determines exposure type (ingestion/skin/inhalation) and frequency
- Rates confidence level

**Pass 2 — Verification & Weighting**
- Applies exposure frequency penalty (daily use +1-2)
- Combined score formula: 70% product, 30% packaging
- Exposure type adjustment (ingestion +1, skin +0.5, inhalation +1)
- Confidence regression for uncertain results
- Refines concerns to mention specific plastic names

Results are cached in-memory — same product always returns same score.

---

## Product Database

**205 products** across 6 categories with direct swap mapping:
- Kitchen (41) — cast iron, ceramic, glass containers, natural cleaning
- Other (52) — electronics, pet, office, sports, home textiles, garden, travel
- Food & Beverage (38) — glass bottles, stainless, loose leaf tea, compostable
- Personal Care (36) — shampoo bars, bamboo toothbrushes, solid lotions
- Clothing (23) — merino wool, organic linen, hemp, natural rubber
- Baby (15) — wooden toys, glass bottles, organic cotton, natural rubber

**Amazon PA API** integration ready — activates automatically when `AMAZON_ACCESS_KEY` and `AMAZON_SECRET_KEY` are added to environment variables. Requires 3 qualifying Amazon sales to unlock.

---

## Key Features

- 🔬 Two-pass AI scoring with material identification
- 📊 4-component breakdown (materials, packaging, usage, manufacturing)
- 🔗 URL paste — analyze products from Amazon, Target, Walmart links
- 📱 Barcode scanner (mobile, uses native BarcodeDetector API)
- 🔄 Score caching — consistent scores for same products
- 📤 Share as image — branded PNG card for social sharing
- 🗺️ Shareable URLs — `partiqule.com/scan/product-name`
- 📈 Plausible analytics — scan events, affiliate clicks, score returns
- 🌙 Dark mode
- 📱 Fully mobile responsive

---

## Affiliate Program

- **Amazon Associates tag:** `partiqule-20`
- Commission rates: 1–10% depending on category
- PA API: Apply after 3 qualifying sales at affiliate-program.amazon.com → Tools → Product Advertising API
- Other programs: Ethique (15%), Bite (15%), Pela (15%) via Impact.com

---

## Contact

paul@partiqule.com · partiqule.com · @partiquleapp

