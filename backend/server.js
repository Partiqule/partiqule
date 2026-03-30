require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const { findAlternatives } = require("./products");
const { isPaApiConfigured, getAmazonAlternatives } = require("./amazon-api");

const app = express();
app.use(cors({
  origin: [
    "https://partiqule.vercel.app",
    "https://partiqule.com",
    "https://www.partiqule.com",
    /\.vercel\.app$/,
    "http://localhost:3000",
  ],
  methods: ["GET","POST"],
  credentials: true,
}));
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

// ── WEB SEARCH FOR PRODUCT DETAILS ───────────────────────────
// Determines if a product needs a web search for accurate material data
function needsSearch(productName) {
  const name = productName.toLowerCase();
  // Skip search for generic/obvious products — we already know what they're made of
  const obvious = [
    "styrofoam","plastic bag","cling wrap","plastic wrap","disposable cup",
    "plastic bottle","plastic straw","zip lock","ziplock","fleece jacket",
    "polyester","nylon","teflon","non-stick","keurig","lipton tea bag",
    "cotton","linen","wool","glass","stainless steel","cast iron","ceramic",
    "wooden spoon","bamboo","wood"
  ];
  if (obvious.some(o => name.includes(o))) return false;
  // Search for anything branded, specific, or ambiguous
  return true;
}

async function searchProductDetails(productName) {
  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      tools: [{
        type: "web_search_20250305",
        name: "web_search",
      }],
      system: "You are a product research assistant. Search for the exact materials, ingredients, and composition of the product. Return only a plain text summary of what the product is made of — no JSON, no markdown.",
      messages: [{
        role: "user",
        content: `Search for: "${productName}" materials composition ingredients what is it made of. Focus on: main material, any plastic components, coating or finish, packaging material. Return a concise 3-5 sentence factual summary of what this product is physically made of.`
      }]
    })
  });

  if (!res.ok) return null;
  const data = await res.json();
  // Extract text from response (may include tool_use blocks)
  const text = data.content
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("").trim();
  return text.length > 20 ? text : null;
}

// ── CLAUDE API CALL ───────────────────────────────────────────
async function callClaude(system, userPrompt, maxTokens=800, retries=2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
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
    if (res.status === 429 && attempt < retries) {
      // Rate limited — wait and retry
      const wait = (attempt + 1) * 2000;
      console.log(`Rate limited, retrying in ${wait}ms (attempt ${attempt+1})`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const text = data.content.map(b => b.text || "").join("").trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in response");
    return JSON.parse(match[0]);
  }
}

// ── PASS 1: DEEP ANALYSIS ─────────────────────────────────────
async function pass1(productName, materialContext = null) {
  const contextSection = materialContext
    ? `\nREAL PRODUCT DATA FROM WEB SEARCH (use this as ground truth for materials):\n${materialContext}\n`
    : "";

  return callClaude(
    `You are a senior research scientist specializing in polymer chemistry, toxicology, and consumer product safety. Your scores are grounded in peer-reviewed science. Always respond with raw JSON only — no markdown, no preamble.

KEY RESEARCH FINDINGS THAT MUST INFORM YOUR SCORING:

MICROPLASTICS:
- Marfella et al. (2024), NEJM: Polypropylene (PP) found in 58% of carotid artery plaques, PVC in 12%. Patients with detectable microplastics had significantly higher risk of heart attack and stroke. PP and PVC in food-contact products must be scored HIGH (8-9).
- Yan et al. (2024), Nature Medicine: Microplastics accumulate in human brain, kidney and liver. Brain concentrations increased between 2016 and 2024 samples. Higher concentrations found in dementia patients. Daily-use ingestion/inhalation products carry elevated neurological risk.
- Leslie et al. (2022), Environment International: Microplastics detected in 100% of human blood samples tested.
- Ragusa et al. (2021), Environment International: Microplastics found in human placentas — fetal exposure is confirmed.
- Li et al. (2020), Nature Food: Heating polypropylene baby bottles releases millions of microplastic particles per litre.
- Hernandez et al. (2019), Environmental Science & Technology: Nylon and PET tea bags release billions of particles per cup.

PFAS / NON-STICK:
- FDA Total Diet Study (2024): PFAS detected in seafood, meat and dairy from environmental contamination. Non-stick cookware (PTFE/PFAS) is a primary dietary exposure pathway.
- PFAS are known endocrine disruptors linked to thyroid disruption, elevated cholesterol, reduced fertility and cancer. Non-stick pans with PTFE must score 8-9 on both plastic danger and health concern.

ULTRA-PROCESSED FOODS:
- Monteiro et al. (2025), The Lancet: Ultra-processed foods (UPFs) consistently linked to chronic disease, cardiovascular risk, cognitive decline and stroke. UPF health scores should reflect severity: heavily processed snacks/drinks = 6-8, minimally processed whole foods = 1-3.

ARTIFICIAL DYES:
- FDA (2025): Red 3 banned. FDA announced phase-out of all petroleum-based synthetic dyes. Products containing Red 40, Yellow 5, Yellow 6, Blue 1, Blue 2, Green 3 should score 6-8 on health concern.
- Multiple studies link synthetic dyes to hyperactivity in children and potential carcinogenicity.`,

    `Analyze "${productName}" for microplastics and health risk with scientific rigor.
${contextSection}
If this is a barcode, identify the most likely consumer product and analyze that.

IMPORTANT: If real product data is provided above, base your material analysis on that factual data. Do not assume plastic content if the product is confirmed to be wood, glass, stainless steel, ceramic, or other natural materials. Only identify plastics that are actually present.

PLASTIC SCORING — apply the research findings in your system prompt:
- PP and PVC in food-contact products: score 8-9 (NEJM 2024 cardiovascular evidence)
- PTFE/PFAS non-stick coatings: score 8-9 (known endocrine disruptors, FDA PFAS data)
- Nylon/PET tea bags: score 7-8 (billions of particles per cup, Hernandez 2019)
- PP baby bottles heated: score 8-9 (millions of particles per litre, Li 2020)
- Daily ingestion/inhalation products: apply +1 to +2 neurological risk penalty (Yan 2024 brain accumulation)
- Natural materials (wood, glass, stainless, ceramic, organic cotton): score 1-2, no penalties

HEALTH & SUSTAINABILITY SCORING — separate from plastic, apply research:
- Products with synthetic dyes (Red 40, Yellow 5, Yellow 6, Blue 1, etc.): score 6-8
- PFAS/non-stick cookware: score 8-9 health concern
- Ultra-processed foods (chips, instant noodles, packaged snacks, soft drinks): score 6-8
- Heavy processing with emulsifiers, preservatives, flavor enhancers: score 5-7
- Whole, natural, minimally processed products: score 1-3
- No non-plastic health concerns (wooden spoon, glass jar): score 1

The health_score must reflect THREE sub-components combined:
1. Chemical concerns (additives, dyes, PFAS, preservatives) — weighted 40%
2. Sustainability impact (single-use waste, disposability, environmental burden) — weighted 40%
3. Manufacturing concerns (bleaching, chemical treatment, processing) — weighted 20%

SUSTAINABILITY SCORING RULES (for health_score calculation):
- Single-use disposable by design (paper towels, disposable cups, plastic bags, wipes, razors): sustainability score 8-9
- Frequently replaced short-life products (synthetic sponges, plastic wrap, cheap synthetic clothing): sustainability score 6-7
- Chemically treated disposables (bleached paper towels, fragranced wipes, chlorinated paper): add +1
- Plastic packaging on a fundamentally non-plastic product: add +1
- Durable, reusable, long-life products: sustainability score 1-2
- Biodegradable or compostable without chemical treatment: sustainability score 1-3

EXAMPLES:
- Brawny paper towels: chemical=3, sustainability=8, manufacturing=5 → health_score = (3×0.4)+(8×0.4)+(5×0.2) = 1.2+3.2+1.0 = 5 → round to 5
- Reusable glass bottle: chemical=1, sustainability=1, manufacturing=1 → health_score = 1
- Synthetic wet wipes: chemical=6, sustainability=9, manufacturing=5 → health_score = (6×0.4)+(9×0.4)+(5×0.2) = 2.4+3.6+1.0 = 7

Return ONLY this JSON:
{
  "product_name": "clean accurate product name",
  "category": "clothing|food_beverage|personal_care|kitchen|baby|other",
  "identified_plastics": ["specific plastic 1", "specific plastic 2"],
  "product_score": 7,
  "packaging_score": 6,
  "exposure_frequency": "daily|weekly|occasional|rare",
  "exposure_type": "ingestion|skin_contact|inhalation|mixed",
  "health_score": 5,
  "health_concerns": ["specific non-plastic health concern 1", "sustainability concern e.g. single-use waste", "chemical treatment concern"],
  "health_note": "one sentence covering the main chemical AND sustainability concern",
  "health_breakdown": {
    "chemical": { "score": 3, "label": "specific chemical concerns e.g. bleaching agents, dyes, preservatives" },
    "sustainability": { "score": 8, "label": "disposability and waste impact e.g. single-use by design, plastic packaging" },
    "manufacturing": { "score": 5, "label": "processing and treatment concerns e.g. chlorine bleaching, chemical treatment" }
  },
  "product_breakdown": {
    "materials": { "score": 7, "label": "specific material analysis mentioning plastic types" },
    "packaging": { "score": 6, "label": "packaging material and leaching risk" },
    "usage": { "score": 8, "label": "how use pattern affects exposure" },
    "manufacturing": { "score": 5, "label": "manufacturing process plastic risks" }
  },
  "raw_concerns": ["specific concern 1", "specific concern 2", "specific concern 3", "specific concern 4"],
  "confidence": "high|medium|low",
  "confidence_reason": "why confidence is high/medium/low",
  "scan_next": ["related product 1", "related product 2", "related product 3"],
  "ai_alternatives": [
    {"name": "specific product name", "reason": "max 10 words why safer", "material": "max 5 words", "estimated_score": 2},
    {"name": "second alternative", "reason": "max 10 words", "material": "max 5 words", "estimated_score": 1},
    {"name": "third alternative", "reason": "max 10 words", "material": "max 5 words", "estimated_score": 2}
  ]
}`,
    1600
  );
}

// ── PASS 2: VERIFY & WEIGHT ───────────────────────────────────
async function pass2(productName, pass1Result) {
  const plastics = (pass1Result.identified_plastics || []).join(", ") || "none identified";
  return callClaude(
    `You are a scientific auditor reviewing microplastics and health risk scores. Respond with valid JSON only — no markdown, no backticks, no trailing commas, no extra text. Keep all string values under 20 words.`,
    `Audit the score for "${productName}": product_score:${pass1Result.product_score} packaging_score:${pass1Result.packaging_score} frequency:${pass1Result.exposure_frequency} type:${pass1Result.exposure_type} confidence:${pass1Result.confidence} category:${pass1Result.category} identified_plastics:${plastics}

CRITICAL RULE: Exposure penalties ONLY apply if the product itself contains plastic the user is actually exposed to. Natural materials (wood, glass, stainless steel, cotton, ceramic) score low regardless of frequency. A wooden spoon used daily is still low risk.

RESEARCH-BASED SCORING RULES:
- PP or PVC in food-contact products: base score must be 8-9 (Marfella et al. 2024, NEJM — found in arterial plaques, linked to heart attack/stroke)
- PTFE/PFAS non-stick coatings: base score must be 8-9 (FDA 2024 PFAS data, known endocrine disruptors)
- Daily ingestion or inhalation of any plastic: apply +2 neurological penalty (Yan et al. 2024, Nature Medicine — brain accumulation confirmed)
- Weekly use: +0.5, skin contact: +0.5, inhalation: +1
- 70% product_score + 30% packaging_score base calculation
- Final score: integer 1-10

Break-even benchmarks (null if no clear swap): bottle→stainless:50, cup→reusable:40, wrap→beeswax:8, toothbrush→bamboo:1, pan→cast iron:200, container→glass:25, pads→menstrual cup:90, razor→safety:10, zipbag→silicone:15, shopping bag→tote:130, shampoo→bar:6, synthetic clothing→natural:30. Furniture/electronics/appliances/natural materials=null.

Return ONLY valid JSON under 400 tokens:
{"final_score":7,"score_reasoning":"max 15 words citing specific research where relevant","exposure_multiplier":"daily","refined_concerns":["max 12 words","max 12 words","max 12 words"],"summary":"max 30 words total","confidence":"high","confidence_note":"max 10 words","break_even":{"uses":50,"alternative_name":"max 5 words","note":"max 15 words","source":"Lifecycle analysis estimate"}}`,
    800
  );
}

// ── SAFE PASS2 WRAPPER ────────────────────────────────────────
async function safePass2(productName, pass1Result) {
  try {
    return await pass2(productName, pass1Result);
  } catch (err) {
    console.error("Pass2 failed, using pass1 fallback:", err.message);
    return null;
  }
}

// ── ANALYZE ENDPOINT ──────────────────────────────────────────
// ── SCAN IMAGE — reads barcode or product label via Claude vision ──
app.post("/scan-image", async (req, res) => {
  const { image, mediaType } = req.body;
  if (!image) return res.status(400).json({ error: "No image provided" });

  try {
    // Use a separate low-cost call just to extract the product name
    // Small delay to avoid rate limit collisions with the subsequent analyze call
    const response = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 60,
        system: "You identify products from images. Respond with ONLY the product name, 2-5 words, nothing else. No punctuation, no explanation.",
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: image } },
            { type: "text", text: "Product name only:" }
          ]
        }]
      })
    });

    if (response.status === 429) {
      return res.status(429).json({ error: "Rate limit — please try again in a moment" });
    }

    const data = await response.json();
    const query = data.content?.[0]?.text?.trim();
    if (!query) return res.status(400).json({ error: "Could not identify product" });

    // Small pause before the analyze call fires
    await new Promise(r => setTimeout(r, 1500));

    res.json({ query });
  } catch(err) {
    console.error("scan-image error:", err);
    res.status(500).json({ error: "Image scan failed" });
  }
});

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

    // ── Search for real product material data if needed ──
    let materialContext = null;
    if (needsSearch(productName)) {
      console.log(`Searching product details: ${productName}`);
      try {
        materialContext = await searchProductDetails(productName);
        if (materialContext) console.log(`Search found: ${materialContext.slice(0,80)}...`);
      } catch (err) {
        console.warn("Search failed, continuing without:", err.message);
      }
    }

    // ── Run both passes — pass1 gets real material data ──
    console.log(`Analyzing: ${productName}`);
    const [p1, p2] = await Promise.all([
      pass1(productName, materialContext),
      pass1(productName, materialContext).then(p1data => safePass2(productName, p1data))
    ]);

    // Merge pass1 + pass2 results
    const finalCategory = (p1.category !== "other" ? p1.category : category) || "other";
    const catAvg        = CATEGORY_AVERAGES[finalCategory] || CATEGORY_AVERAGES.other;
    const finalScore    = p2?.final_score ?? p1.product_score ?? 5;
    const healthScore   = p1.health_score || null;
    const overallScore  = healthScore
      ? Math.min(10, Math.max(1, Math.round(finalScore * 0.5 + healthScore * 0.5)))
      : null;

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
      health_score:        p1.health_score || null,
      health_concerns:     p1.health_concerns || [],
      health_note:         p1.health_note || null,
      health_breakdown:    p1.health_breakdown || null,
      overall_score:       overallScore,
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
      })),
      ai_alternatives: (p1.ai_alternatives || []).map(a => ({
        name:            a.name || "",
        reason:          a.reason || "",
        material:        a.material || "",
        estimated_score: a.estimated_score || 2,
        source:          "ai",
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
app.get("/cache-clear", (req, res) => { scoreCache.clear(); res.json({ cleared: true, message: "Score cache cleared — all products will be rescored on next scan" }); });
app.get("/health",      (req, res) => res.json({
  status: "ok",
  paApi: isPaApiConfigured() ? "active" : "not configured — using static database",
  cachedProducts: scoreCache.size,
}));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Partiqule API running on port ${PORT}`));
