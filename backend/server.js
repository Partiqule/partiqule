require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const { findAlternatives } = require("./products");
const { isPaApiConfigured, getAmazonAlternatives } = require("./amazon-api");

const app = express();
app.use(cors());
app.use(express.json());

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const scoreCache    = new Map();

// ── HELPERS ───────────────────────────────────────────────────

function cacheKey(q) {
  return q.toLowerCase().trim().replace(/\s+/g, " ");
}

function cleanProductName(name) {
  if (!name) return "Unknown product";
  if (/^https?:\/\//i.test(name) || name.includes("://") || name.includes("utm_") || name.includes(".com/"))
    return "Scanned product";
  if (name.length > 80) return name.slice(0, 77).trim() + "…";
  const cleaned = name.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function detectCategory(q) {
  const s = q.toLowerCase();
  if (/shirt|pant|jean|jacket|hoodie|sweater|sock|underwear|bra|legging|fleece|fabric|cloth|wear|apparel|activewear|athletic|workout|yoga|polyester|lululemon|sport band|watch band|wristband|strap/.test(s)) return "clothing";
  if (/bottle|wrap|bag|container|tupperware|plastic bag|food storage|water bottle|cup|straw|ziploc|ziplock|sandwich bag|freezer bag|glad|saran|cling|food wrap|k-cup|keurig|tea bag|styrofoam|disposable/.test(s)) return "food_beverage";
  if (/shampoo|conditioner|lotion|soap|deodorant|toothpaste|makeup|lipstick|foundation|sunscreen|moisturizer|cleanser|face wash|body wash|skincare|cotton round|toner|serum|perfume|cologne/.test(s)) return "personal_care";
  if (/pan|pot|cookware|sponge|dish|laundry|detergent|cleaner|towel|broom|mop|teflon|non.?stick|pfas|ceramic|kitchen|cooking|tide pod/.test(s)) return "kitchen";
  if (/baby|infant|toddler|kid|child|diaper|bib|onesie|pajama|formula|newborn|nursery/.test(s)) return "baby";
  return null;
}

function extractProductFromUrl(input) {
  const trimmed = input.trim();
  if (!trimmed.startsWith("http") && !/^\d{8,14}$/.test(trimmed)) return null;
  if (/^\d{8,14}$/.test(trimmed)) return `product with barcode ${trimmed}`;
  let pathname = trimmed;
  try { pathname = new URL(trimmed).pathname; } catch { return null; }
  const amazonSlug = trimmed.match(/amazon\.com\/([^/]+)\/dp\//i);
  if (amazonSlug) { const n = amazonSlug[1].replace(/-/g," ").replace(/[^a-zA-Z0-9 ]/g,"").trim(); return n.length>5?n:"Amazon product"; }
  const amazonDp = trimmed.match(/amazon\.com\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  if (amazonDp) return `Amazon product ${amazonDp[1]}`;
  const targetSlug = pathname.match(/\/p\/([^/]+)\/-\//i)||pathname.match(/\/p\/([^/]+)/i);
  if (trimmed.includes("target.com")&&targetSlug) return targetSlug[1].replace(/-/g," ").replace(/[^a-zA-Z0-9 ]/g,"").trim();
  const walmartSlug = pathname.match(/\/ip\/([^/]+)/i);
  if (trimmed.includes("walmart.com")&&walmartSlug) return walmartSlug[1].replace(/-/g," ").replace(/[^a-zA-Z0-9 ]/g,"").trim();
  const segments = pathname.split("/").filter(s=>s.length>3&&!/^\d+$/.test(s));
  const last = segments[segments.length-1]||segments[0];
  if (last) { const n = last.replace(/-|_/g," ").replace(/[^a-zA-Z0-9 ]/g,"").trim(); if(n.length>3) return n; }
  return "Scanned product";
}

// ── PEER COMPARISON DATA ──────────────────────────────────────
// Average scores by category — used for peer comparison stat
const CATEGORY_AVERAGES = {
  clothing:      { avg: 6.2, label: "clothing items"      },
  food_beverage: { avg: 5.8, label: "food & drink items"  },
  personal_care: { avg: 5.5, label: "personal care items" },
  kitchen:       { avg: 5.0, label: "kitchen items"       },
  baby:          { avg: 4.8, label: "baby products"       },
  other:         { avg: 5.5, label: "consumer products"   },
};

// ── CLAUDE API CALL ───────────────────────────────────────────
async function callClaude(system, userPrompt, maxTokens=800) {
  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userPrompt }]
    })
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.content.map(b => b.text || "").join("").trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in response");
  return JSON.parse(match[0]);
}

// ── PASS 1: DEEP ANALYSIS ─────────────────────────────────────
async function pass1(productName) {
  return callClaude(
    `You are a senior microplastics research scientist with expertise in polymer chemistry, toxicology, and consumer product safety. You analyze products with rigorous scientific accuracy. Always respond with raw JSON only — no markdown, no preamble.`,
    `Analyze "${productName}" for microplastics risk with scientific rigor.

If this is a barcode, identify the most likely consumer product and analyze that.

Consider:
- Specific plastic polymers present (PET, HDPE, PVC, LDPE, PP, PS, nylon, polyester, PTFE, BPA, PFAS, etc.)
- Whether plastic contacts food, skin, or is inhaled
- Heat exposure (does it get hot? heated plastics leach more)
- Mechanical wear (friction, washing, chewing release particles)
- Packaging material vs product material
- Frequency and duration of typical use

Return ONLY this JSON:
{
  "product_name": "clean accurate product name",
  "category": "clothing|food_beverage|personal_care|kitchen|baby|other",
  "identified_plastics": ["specific plastic 1", "specific plastic 2"],
  "product_score": 7,
  "packaging_score": 6,
  "exposure_frequency": "daily|weekly|occasional|rare",
  "exposure_type": "ingestion|skin_contact|inhalation|mixed",
  "product_breakdown": {
    "materials": { "score": 7, "label": "specific material analysis mentioning plastic types" },
    "packaging": { "score": 6, "label": "packaging material and leaching risk" },
    "usage": { "score": 8, "label": "how use pattern affects exposure" },
    "manufacturing": { "score": 5, "label": "manufacturing process plastic risks" }
  },
  "raw_concerns": ["specific concern 1", "specific concern 2", "specific concern 3", "specific concern 4"],
  "confidence": "high|medium|low",
  "confidence_reason": "why confidence is high/medium/low",
  "scan_next": ["related product 1", "related product 2", "related product 3"]
}`,
    900
  );
}

// ── PASS 2: VERIFY & WEIGHT ───────────────────────────────────
async function pass2(productName, pass1Result) {
  return callClaude(
    `You are a microplastics scoring auditor. Respond with valid JSON only — no markdown, no backticks, no trailing commas, no extra text.`,
    `Score "${productName}" using this analysis:
product_score:${pass1Result.product_score} packaging_score:${pass1Result.packaging_score} exposure_frequency:${pass1Result.exposure_frequency} exposure_type:${pass1Result.exposure_type} confidence:${pass1Result.confidence}

Rules: daily+1-2, weekly+0.5, ingestion+1, skin+0.5, inhalation+1, 70% product+30% packaging. Integer 1-10.

Break-even uses (reusable vs single-use): stainless bottle=50, cotton tote=130, beeswax wrap=8, bamboo toothbrush=1, cast iron=200, glass container=25, menstrual cup=90, safety razor=10, reusable coffee cup=40, silicone bag=15.

Return ONLY this JSON:
{"final_score":7,"score_reasoning":"how score was calculated","exposure_multiplier":"daily","refined_concerns":["specific plastic concern 1","concern 2","concern 3"],"summary":"2 sentences for general audience","confidence":"high","confidence_note":"brief note","break_even":{"uses":50,"alternative_name":"stainless steel bottle","note":"brief break-even explanation","source":"Lifecycle analysis estimate"}}`,
    500
  );
}

// ── ANALYZE ENDPOINT ──────────────────────────────────────────
app.post("/analyze", async (req, res) => {
  let { query } = req.body;
  if (!query?.trim()) return res.status(400).json({ error: "Query is required" });

  const extracted    = extractProductFromUrl(query.trim());
  const productName  = extracted || query.trim();
  const key          = cacheKey(productName);

  if (scoreCache.has(key)) {
    console.log(`Cache hit: ${key}`);
    return res.json({ ...scoreCache.get(key), cached: true });
  }

  try {
    const category = detectCategory(productName);

    // ── Run both passes in parallel for speed ──
    console.log(`Analyzing: ${productName}`);
    const [p1, p2] = await Promise.all([
      pass1(productName),
      pass1(productName).then(p1data => pass2(productName, p1data))
        .catch(() => null) // if pass2 fails, fall back to pass1
    ]);

    // Merge pass1 + pass2 results
    const finalCategory = (p1.category !== "other" ? p1.category : category) || "other";
    const catAvg        = CATEGORY_AVERAGES[finalCategory] || CATEGORY_AVERAGES.other;
    const finalScore    = p2?.final_score ?? p1.product_score ?? 5;

    // Peer comparison
    const peerPct = Math.round(((finalScore - 1) / 9) * 100);
    const peerComparison = finalScore > catAvg.avg
      ? `Scores higher than ${peerPct}% of ${catAvg.label}`
      : `Scores lower than ${100 - peerPct}% of ${catAvg.label}`;

    const aiProductName  = p1.product_name || productName;

    // ── Alternatives: try Amazon PA API first, fall back to static DB ──
    let finalAlternatives;
    if (isPaApiConfigured()) {
      console.log("Using Amazon PA API for alternatives");
      const amazonResults = await getAmazonAlternatives(
        aiProductName,
        finalCategory,
        p1.identified_plastics || []
      );
      if (amazonResults && amazonResults.length > 0) {
        finalAlternatives = amazonResults;
        console.log(`PA API returned ${amazonResults.length} alternatives`);
      } else {
        console.log("PA API returned no results — falling back to static DB");
        finalAlternatives = findAlternatives(aiProductName, finalCategory, 3, productName)
          .map(p => ({ ...p, score: p.plasticScore, source: "static" }));
      }
    } else {
      finalAlternatives = findAlternatives(aiProductName, finalCategory, 3, productName)
        .map(p => ({ ...p, score: p.plasticScore, source: "static" }));
    }

    const result = {
      product_name:     cleanProductName(p1.product_name || productName),
      score:            finalScore,
      summary:          p2?.summary || p1.raw_concerns?.slice(0,2).join(". ") || "",
      concerns:         p2?.refined_concerns || p1.raw_concerns || [],
      category:         finalCategory,
      identified_plastics: p1.identified_plastics || [],
      exposure_frequency:  p2?.exposure_multiplier || p1.exposure_frequency || "unknown",
      exposure_type:       p1.exposure_type || "unknown",
      confidence:          p2?.confidence || p1.confidence || "medium",
      confidence_note:     p2?.confidence_note || p1.confidence_reason || "",
      score_reasoning:     p2?.score_reasoning || "",
      peer_comparison:     peerComparison,
      breakdown:           p1.product_breakdown || null,
      scan_next:           p1.scan_next || [],
      break_even:          p2?.break_even || null,
      cached:              false,
      alternatives: finalAlternatives.map(p => ({
        id:           p.id,
        name:         p.name,
        brand:        p.brand || "",
        score:        p.score ?? p.plasticScore ?? 3,
        material:     p.material || "",
        description:  p.description || "",
        price:        p.price || "",
        affiliateUrl: p.affiliateUrl,
        imageUrl:     p.imageUrl || null,
        source:       p.source || "static",
      }))
    };

    scoreCache.set(key, result);
    console.log(`Cached: ${key} (score: ${result.score}, confidence: ${result.confidence})`);
    res.json(result);

  } catch (err) {
    console.error("Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/cache-stats", (req, res) => res.json({ size: scoreCache.size, keys: [...scoreCache.keys()] }));
app.get("/health",      (req, res) => res.json({
  status: "ok",
  paApi: isPaApiConfigured() ? "active" : "not configured — using static database",
  cachedProducts: scoreCache.size,
}));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Partiqule API running on port ${PORT}`));
