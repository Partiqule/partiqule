require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const { findAlternatives } = require("./products");
const { isPaApiConfigured, getAmazonAlternatives } = require("./amazon-api");

const app = express();
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    const allowed = [
      "https://partiqule.com",
      "https://www.partiqule.com",
      "https://partiqule.vercel.app",
      "http://localhost:3000",
      "http://localhost:5173",
    ];
    if (allowed.includes(origin) || origin.endsWith(".vercel.app")) {
      return callback(null, true);
    }
    callback(new Error(`CORS blocked: ${origin}`));
  },
  methods: ["GET","POST","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"],
  credentials: true,
}));
app.options("*", cors()); // handle preflight for all routes
app.use(express.json({ limit: "10mb" }));

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
// Robust JSON fixer — handles apostrophes, smart quotes, trailing commas
function fixJson(raw) {
  let s = raw;
  // 1. Smart quotes → straight quotes
  s = s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
  // 2. Trailing commas before } or ]
  s = s.replace(/,(\s*[}\]])/g, '$1');
  // 3. Walk char by char to fix unescaped problem chars inside JSON string values
  //    Handles: apostrophes, literal newlines, literal tabs, literal carriage returns
  let result = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escaped) { result += c; escaped = false; continue; }
    if (c === '\\') { result += c; escaped = true; continue; }
    if (c === '"') { inString = !inString; result += c; continue; }
    if (inString) {
      if (c === "'")  { result += '\\u0027'; continue; } // apostrophe
      if (c === '\n') { result += '\\n';     continue; } // literal newline
      if (c === '\r') { result += '\\r';     continue; } // carriage return
      if (c === '\t') { result += '\\t';     continue; } // literal tab
    }
    result += c;
  }
  return result;
}

async function callClaude(system, userPrompt, maxTokens=800, retries=2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    const res = await fetch(ANTHROPIC_API, {
      method: "POST",
      signal: controller.signal,
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
    clearTimeout(timeout);
    if (res.status === 429 && attempt < retries) {
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
    try { return JSON.parse(fixJson(match[0])); }
    catch(e) {
      console.error("JSON parse failed at attempt", attempt, "raw snippet:", match[0].slice(0, 300));
      if (attempt < retries) { await new Promise(r => setTimeout(r, 1000)); continue; }
      throw new Error(`JSON parse error: ${e.message}`);
    }
  }
}

// ── PASS 1: DEEP ANALYSIS ─────────────────────────────────────
// Vision pass — identifies product from image AND scores it in one call
async function callClaudeVision(imageBase64, mediaType) {
  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1800,
      system: `You are a senior research scientist specializing in polymer chemistry, toxicology, and consumer product safety. You will be shown a photo of a product label, packaging, clothing tag, or product itself. Read any visible text, brand names, or product names to identify the product, then analyze it for microplastics and health risk. Always respond with raw JSON only — no markdown, no preamble. CRITICAL: Never use apostrophes or single quotes inside JSON string values. Use plain text without contractions. Write dont instead of don't, Press n Seal instead of Press'n Seal.

SCORING RULES:
- PP/PVC in food-contact products: score 8-9 (NEJM 2024)
- PTFE/PFAS non-stick: score 8-9
- Natural materials (wood, glass, stainless, ceramic, organic cotton): score 1-2
- Single-use disposables: sustainability score 8-9
- Chemical treatments (bleaching, dyes, PFAS): chemical score 6-8`,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          { type: "text", text: `Look at this photo of a product label, tag, or packaging. Read the brand name, product name, and any visible text to identify exactly what product this is. Then score it for microplastic and health risk. Return ONLY this JSON:
{
  "product_name": "brand + product name as shown on label e.g. Tide Original Liquid Detergent",
  "category": "clothing|food_beverage|personal_care|kitchen|baby|other",
  "identified_plastics": ["plastic type 1"],
  "product_score": 5,
  "packaging_score": 4,
  "exposure_frequency": "daily|weekly|occasional|rare",
  "exposure_type": "ingestion|skin_contact|inhalation|mixed",
  "health_score": 4,
  "health_concerns": ["concern 1"],
  "health_note": "one sentence summary",
  "health_breakdown": {
    "chemical": { "score": 3, "label": "chemical concerns" },
    "sustainability": { "score": 5, "label": "sustainability impact" },
    "manufacturing": { "score": 4, "label": "manufacturing concerns" }
  },
  "product_breakdown": {
    "materials": { "score": 5, "label": "material analysis" },
    "packaging": { "score": 4, "label": "packaging assessment" },
    "usage": { "score": 6, "label": "usage exposure" },
    "manufacturing": { "score": 4, "label": "manufacturing risks" }
  },
  "raw_concerns": ["concern 1"],
  "confidence": "high|medium|low",
  "confidence_reason": "why",
  "scan_next": ["related product 1", "related product 2"],
  "ai_alternatives": [{"name": "safer alternative", "reason": "why safer", "material": "material", "estimated_score": 2}]
}` }
        ]
      }]
    })
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.content.map(b => b.text || "").join("").trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in vision response");
  try { return JSON.parse(fixJson(match[0])); }
  catch(e) { throw new Error(`Vision JSON parse error: ${e.message}`); }
}

async function pass1(productName, materialContext = null) {
  const contextSection = materialContext
    ? `\nREAL PRODUCT DATA FROM WEB SEARCH (use this as ground truth for materials):\n${materialContext}\n`
    : "";

  return callClaude(
    `You are a senior research scientist specializing in polymer chemistry, toxicology, consumer product safety, and environmental impact. Your scores are grounded in peer-reviewed science. Always respond with raw JSON only — no markdown, no preamble. CRITICAL: Never use apostrophes or single quotes inside JSON string values. Use plain text without contractions.

KEY RESEARCH FINDINGS:
MICROPLASTICS: Marfella et al. (2024) NEJM: PP found in 58% of carotid plaques — PP/PVC in food-contact products score 8-9. Yan et al. (2024) Nature Medicine: microplastics accumulate in human brain — daily ingestion/inhalation +2 penalty. Hernandez (2019): nylon/PET tea bags release billions of particles per cup. Li (2020): heated PP baby bottles release millions of particles per litre.
PFAS: FDA (2024): PTFE/PFAS non-stick = primary dietary exposure — score 8-9, known endocrine disruptors.
FOOD: Monteiro (2025) Lancet: ultra-processed foods linked to cardiovascular risk and cognitive decline — score 6-8. Whole natural foods score 1-3.
DYES: FDA (2025): Red 3 banned, all petroleum dyes being phased out. Red 40, Yellow 5/6, Blue 1/2 = score 6-8.
PACKAGING-ONLY PLASTIC: If a product is genuinely plastic-free but has incidental packaging (film pouch, wrapper, cap) that is discarded during use, the packaging score should be 2-4. Do NOT let discarded packaging dominate the materials score. Example: Blueland tablet in film pouch = materials score 1, packaging score 3.`,

    `Analyze "${productName}" across 5 dimensions: Materials, Usage and Exposure, Packaging, Sustainability, and Manufacturing.
${contextSection}
If this is a barcode, identify the most likely consumer product and analyze that.
If real product data is provided above, use it as ground truth. Do not assume plastic if confirmed natural.

SCORING RULES BY DIMENSION:

MATERIALS (what the product is physically made of):
- PP/PVC in food contact: 8-9. PTFE/PFAS coatings: 8-9. Nylon/PET tea bags: 7-8.
- Natural materials (wood, glass, stainless, ceramic, organic cotton, stone): 1-2.
- Coatings and treatments count even if the base material is safe.
- PACKAGING-ONLY: if plastic is only in discarded packaging, materials score stays 1-3.
- PVA (polyvinyl alcohol) pod film in dishwasher/laundry pods: score 6-7 — PVA dissolves but enters waterways as microplastic pollution. Cascade, Tide, Finish pods all use PVA film.
- Synthetic fragrances in cleaning products: score +1 — endocrine disrupting compounds, poorly regulated.
- Optical brighteners in laundry/dishwasher products: score +1 — persistent in environment, potential skin sensitizer.
- Phosphates and surfactants in cleaning products: add to concerns.
- SYNTHETIC TEXTILES: polyester, nylon, spandex/elastane, acrylic shed microfibers with every wash and wear. Daily skin contact with synthetic fabric = score 5-7. A product described as "spandex" or "elastane" that is majority synthetic = score 6-7.
- Natural fiber clothing with minor synthetic content (e.g. 5% elastane waistband): score 3-4.
- Genuinely plastic-free cleaning products (Blueland, Branch Basics, castile soap): materials score 1-2.

USAGE AND EXPOSURE (how using this product affects health):
- Leave-on skin contact (moisturizer, deodorant): higher penalty than rinse-off.
- Direct ingestion (food containers, tea bags, gum): highest penalty.
- Inhalation (sprays, candles, synthetic textiles): significant penalty.
- DISHWASHER PRODUCTS: not zero exposure — chemical residue remains on dishes and enters food. Score usage 4-6 for conventional pods with synthetic chemicals. Genuinely clean formulas (Blueland, Seventh Generation fragrance-free): score 2-3.
- LAUNDRY PRODUCTS: microfibers released into water supply, fragrance residue on clothing = daily skin contact. Score 4-6 for conventional detergents.
- Frequency multiplier: daily +2, weekly +1, occasional 0.
- Child/baby product: apply +1 vulnerable population flag.
- VEHICLES: score 3-5 — interior plastic is not food contact. No daily-use penalty.
- EVs score 1-2 points lower than gas equivalents (Rivian/Tesla/Lucid: 2-3, older EVs: 3-4).
- CHEWING GUM: polyvinyl acetate and polyethylene = direct plastic ingestion. Score 7-8.

PACKAGING (what contains and ships the product):
- Primary packaging that touches product: glass/steel/cardboard=1-2, plastic=6-8.
- Refillable or concentrated systems (tablets, bars, refill pouches): score 1-3.
- Single-use plastic primary packaging: score 7-9.
- Secondary/shipping packaging: only add if excessive.
- End of life: recyclable=lower, landfill/toxic=higher.
- NOTE: Concentrated/pod format reduces packaging waste but does NOT excuse poor materials (PVA, synthetic chemicals).

SUSTAINABILITY (product lifecycle and planet impact):
- Multi-use durable products replacing single-use: score 1-3.
- Single-use by design (paper towels, disposable cups, plastic wrap): score 7-9.
- Circular design (refillable, repairable, compostable): score 1-3.
- Cleaning products that release synthetic chemicals or PVA into waterways: sustainability score 5-7 regardless of concentrated format.
- Blueland-style products (no PVA, no synthetic fragrance, genuinely clean): sustainability score 1-3.
- Ethical sourcing certifications (organic, fair trade, B-Corp): lower score.

MANUFACTURING (production process — score conservatively, flag as estimated):
- Known bad: fast fashion, PVC/chemical manufacturing, unregulated supply chains: 6-8.
- Known good: certified organic, B-Corp, closed-loop, renewably powered: 1-3.
- Unknown: score 4-5 and flag confidence as low.
- Weight is low — do not let manufacturing dominate the final score.

- ARTIFICIAL DYES in food (Red 40, Yellow 5, Yellow 6, Blue 1, Blue 2): score materials 6-8. FDA banned Red 3 (2025) and is phasing out all petroleum-based dyes due to carcinogenicity and hyperactivity links. M&Ms, Skittles, Gummy Bears, Doritos, Froot Loops all contain multiple banned/flagged dyes — materials score 6-7.
- ULTRA-PROCESSED FOODS with dyes + preservatives + artificial flavors: materials 6-8, usage 5-7 (daily consumption). Candy, chips, sodas, instant noodles = score 5-8 depending on chemical load.
- Whole natural foods (fresh fruit, vegetables, unprocessed meat, plain water): materials 1, usage 1.

CALIBRATION EXAMPLES to ensure differentiation:
- Cascade dishwasher pods: materials=7 (PVA film+synthetic fragrance+optical brighteners), usage=5 (residue on dishes), packaging=3 (recyclable tub), sustainability=6 (PVA in waterways) → final ~6
- Blueland dishwasher tablets: materials=1 (no PVA, no synthetic fragrance), usage=2, packaging=2, sustainability=1 → final ~1-2
- Tide Original pods: materials=7, usage=5 (microfibers+fragrance residue on clothes daily), packaging=3, sustainability=6 → final ~6
- M&Ms: materials=7 (Red 40, Yellow 5, Yellow 6, Blue 1 — petroleum dyes being phased out by FDA, linked to hyperactivity and carcinogenicity), usage=6 (daily candy consumption), packaging=4 → final ~6
- Skittles: materials=7 (same artificial dyes + titanium dioxide), usage=6, packaging=4 → final ~6
- Plain dark chocolate (no artificial dyes): materials=2, usage=2 → final ~2
- Lululemon leggings (nylon/spandex): materials=7 (synthetic microfiber shedding), usage=6 (daily skin contact), packaging=2, sustainability=5 → final ~6
- 100% organic cotton t-shirt: materials=1, usage=1, packaging=2, sustainability=2 → final ~1-2
- Non-stick frying pan (PTFE): materials=9, usage=7, packaging=2, sustainability=3 → final ~7

FINAL SCORE CALCULATION (compute server-side, but provide sub-scores accurately):
materials_score x 0.40 + usage_score x 0.25 + packaging_score x 0.15 + sustainability_score x 0.15 + manufacturing_score x 0.05

Return ONLY this JSON:
{
  "product_name": "clean accurate product name",
  "category": "clothing|food_beverage|personal_care|kitchen|baby|other",
  "identified_plastics": ["specific plastic type 1"],
  "harmful_chemicals": ["phthalates", "BPA", "Red 40"],
  "natural_materials": ["organic cotton", "glass"],
  "materials": {
    "score": 7,
    "label": "specific material analysis e.g. PP food-contact plastic, PTFE coating",
    "concerns": ["PP in direct food contact — cardiovascular risk (NEJM 2024)", "PTFE coating degrades above 260C"]
  },
  "usage_exposure": {
    "score": 8,
    "label": "daily ingestion risk — leave-on skin contact",
    "frequency": "daily|weekly|occasional|rare",
    "type": "ingestion|skin_contact|inhalation|mixed",
    "intensity": "leave-on|rinse-off|single-contact",
    "vulnerable": false,
    "concerns": ["Direct plastic ingestion at every use", "Leave-on increases dermal absorption"]
  },
  "packaging": {
    "score": 3,
    "label": "refillable system — minimal plastic packaging",
    "primary": "cardboard|glass|plastic|mixed",
    "refillable": false,
    "end_of_life": "recyclable|compostable|landfill|unknown",
    "concerns": ["Outer cardboard recyclable, inner film liner is not"]
  },
  "sustainability": {
    "score": 2,
    "label": "strong circular design — replaces 50+ single-use items",
    "reusable": true,
    "replaces_single_use": true,
    "replaces_count": 50,
    "circularity": "refillable|repairable|compostable|recyclable|landfill",
    "concerns": []
  },
  "manufacturing": {
    "score": 5,
    "label": "estimated — limited supply chain data",
    "tier": "good|neutral|bad",
    "confidence": "low",
    "concerns": ["Supply chain data not publicly available"]
  },
  "summary": "max 30 words covering the main risk or safety story",
  "raw_concerns": ["concern 1", "concern 2", "concern 3"],
  "confidence": "high|medium|low",
  "confidence_reason": "why",
  "scan_next": ["related product 1", "related product 2", "related product 3"],
  "ai_alternatives": [
    {"name": "specific product name", "reason": "max 10 words why safer", "material": "max 5 words", "estimated_score": 2},
    {"name": "second alternative", "reason": "max 10 words", "material": "max 5 words", "estimated_score": 1},
    {"name": "third alternative", "reason": "max 10 words", "material": "max 5 words", "estimated_score": 2}
  ]
}`,
    1800
  );
}

// ── PASS 2: VERIFY & WEIGHT ───────────────────────────────────
async function pass2(productName, pass1Result) {
  const p = pass1Result;
  const scores = `materials:${p.materials?.score} usage:${p.usage_exposure?.score} packaging:${p.packaging?.score} sustainability:${p.sustainability?.score} manufacturing:${p.manufacturing?.score}`;
  const plastics = (p.identified_plastics || []).join(", ") || "none";

  return callClaude(
    `You are a scientific auditor reviewing a 5-dimension product risk score. Respond with valid JSON only — no markdown, no backticks, no trailing commas. Keep all string values under 20 words.`,
    `Audit the 5-dimension scores for "${productName}":
${scores}
category:${p.category} plastics:${plastics} frequency:${p.usage_exposure?.frequency} type:${p.usage_exposure?.type}

AUDIT RULES:
MATERIALS: Only score plastic/chemical risk from materials user is exposed to during use. Discarded packaging must not drive materials above 3 for otherwise plastic-free products. BUT: PVA pod film (Cascade, Tide, Finish) = materials 6-7 because PVA enters waterways. Synthetic fragrances and optical brighteners in cleaning products = materials 6-7. Synthetic textiles (polyester, nylon, spandex) with daily skin contact = materials 5-7.
USAGE: Daily plastic ingestion = usage 8-9. Leave-on skin contact daily = 7-8. Rinse-off = lower BUT dishwasher/laundry products are NOT zero — residue remains on dishes and clothing. Conventional dishwasher pods = usage 4-6. Genuinely clean formulas = usage 2-3. Vehicles = 3-5 max. EVs score 1-2 lower than gas.
PACKAGING: Refillable/concentrated = 1-3. Single-use plastic = 7-9. Concentrated pod format does NOT excuse bad materials.
SUSTAINABILITY: Products releasing PVA or synthetic chemicals to waterways = sustainability 5-7 even if concentrated. Genuinely clean (no PVA, no synthetic fragrance) = sustainability 1-3.
MANUFACTURING: Cap at 5%. Unknown = neutral 4-5.
CHEWING GUM: polyvinyl acetate = direct plastic ingestion. Materials 7-8, usage 8-9.

CALIBRATION — use these as anchors:
- Cascade pods: final score ~6 (PVA film + synthetic chemicals + residue on dishes)
- Blueland tablets: final score ~1-2 (genuinely plastic-free, no PVA, no synthetic fragrance)
- Lululemon leggings: final score ~6 (synthetic microfibers daily skin contact)
- Organic cotton tee: final score ~1-2
- PTFE non-stick pan: final score ~7-8

FINAL SCORE — compute exactly:
final_score = round(materials x 0.40 + usage x 0.25 + packaging x 0.15 + sustainability x 0.15 + manufacturing x 0.05)

Break-even (null if no clear swap): bottle→stainless:50, cup→reusable:40, wrap→beeswax:8, toothbrush→bamboo:1, pan→cast iron:200, container→glass:25, pads→menstrual cup:90, razor→safety:10, zipbag→silicone:15, bag→tote:130, shampoo→bar:6, clothing→natural:30. Vehicles/electronics/appliances/natural materials=null.

Return ONLY valid JSON:
{"final_score":6,"materials_score":7,"usage_score":8,"packaging_score":3,"sustainability_score":2,"manufacturing_score":5,"score_reasoning":"max 15 words citing specific research","refined_concerns":["max 12 words","max 12 words","max 12 words"],"summary":"max 30 words","confidence":"high","confidence_note":"max 10 words","break_even":{"uses":50,"alternative_name":"max 5 words","note":"max 15 words","source":"Lifecycle analysis estimate"}}`,
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
app.post("/analyze", async (req, res) => {
  let { query, image, mediaType } = req.body;

  // If image provided, use vision to identify + analyze in one pass
  if (image) {
    try {
      console.log("Image scan — using vision pass1");
      const p1 = await callClaudeVision(image, mediaType || "image/jpeg");
      const productName = p1.product_name || "Scanned product";

      // Pass 2 audit using identified name
      let p2 = null;
      try { p2 = await pass2(productName, p1); } catch(e) { console.warn("Pass2 failed:", e.message); }

      const plasticScore = p1.product_score ?? 5;
      const healthScore  = p1.health_score  ?? 3;
      const overallScore = Math.round((plasticScore * 0.7) + (healthScore * 0.3));
      const finalScore   = p2?.final_score ?? Math.round((plasticScore * 0.7 + (p1.packaging_score ?? 3) * 0.3));

      const category = p1.category || "other";
      let finalAlternatives = findAlternatives(productName, category);
      if (!finalAlternatives.length && p1.ai_alternatives?.length) {
        finalAlternatives = p1.ai_alternatives.map(a => ({
          id: `ai-${Math.random()}`, name: a.name, brand: "", score: a.estimated_score ?? 2,
          material: a.material || "", description: a.reason || "", price: "", affiliateUrl: null, category
        }));
      }

      const result = {
        product_name: productName, category,
        score: finalScore, overall_score: overallScore,
        health_score: p1.health_score || null,
        health_concerns: p1.health_concerns || [],
        health_note: p1.health_note || null,
        health_breakdown: p1.health_breakdown || null,
        identified_plastics: p1.identified_plastics || [],
        concerns: p2?.refined_concerns || p1.raw_concerns || [],
        score_reasoning: p2?.score_reasoning || null,
        summary: p2?.summary || null,
        exposure_frequency: p1.exposure_frequency || "daily",
        exposure_type: p1.exposure_type || "mixed",
        breakdown: p1.product_breakdown || null,
        scan_next: p1.scan_next || [],
        break_even: p2?.break_even || null,
        peer_comparison: null,
        confidence: p2?.confidence || p1.confidence || "medium",
        confidence_note: p2?.confidence_note || null,
        cached: false,
        scannedAt: new Date().toISOString(),
        alternatives: finalAlternatives.map(p => ({
          id: p.id, name: p.name, brand: p.brand || "",
          score: p.score ?? 3, material: p.material || "",
          description: p.description || "", price: p.price || "",
          affiliateUrl: p.affiliateUrl, category: p.category || category
        })),
        ai_alternatives: p1.ai_alternatives || [],
      };

      return res.json(result);
    } catch(err) {
      console.error("Vision analyze error:", err);
      return res.status(500).json({ error: err.message || "Image scan failed" });
    }
  }

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
        // Timeout search after 8 seconds to avoid blocking the whole request
        materialContext = await Promise.race([
          searchProductDetails(productName),
          new Promise((_, rej) => setTimeout(() => rej(new Error("Search timeout")), 8000))
        ]);
        if (materialContext) console.log(`Search found: ${materialContext.slice(0,80)}...`);
      } catch (err) {
        console.warn("Search failed, continuing without:", err.message);
      }
    }

    // ── Pass 1 then Pass 2 sequentially (not parallel — pass2 needs pass1 output) ──
    console.log(`Analyzing: ${productName}`);
    const p1 = await pass1(productName, materialContext);
    const p2 = await safePass2(productName, p1);

    // Merge pass1 + pass2 results
    const finalCategory = (p1.category !== "other" ? p1.category : category) || "other";
    const catAvg        = CATEGORY_AVERAGES[finalCategory] || CATEGORY_AVERAGES.other;
    // ── Compute weighted final score server-side as source of truth ──
    const mScore  = p2?.materials_score     ?? p1.materials?.score     ?? 5;
    const uScore  = p2?.usage_score         ?? p1.usage_exposure?.score ?? 5;
    const pkScore = p2?.packaging_score     ?? p1.packaging?.score     ?? 5;
    const sScore  = p2?.sustainability_score ?? p1.sustainability?.score ?? 5;
    const mfScore = p2?.manufacturing_score ?? p1.manufacturing?.score ?? 5;
    const finalScore = Math.min(10, Math.max(1,
      Math.round(mScore*0.40 + uScore*0.25 + pkScore*0.15 + sScore*0.15 + mfScore*0.05)
    ));

    // Peer comparison
    const peerPct = Math.round(((finalScore - 1) / 9) * 100);
    const peerComparison = finalScore > catAvg.avg
      ? `Scores higher than ${peerPct}% of ${catAvg.label}`
      : `Scores lower than ${100 - peerPct}% of ${catAvg.label}`;

    const aiProductName = p1.product_name || productName;

    // ── Alternatives: try Amazon PA API first, fall back to static DB ──
    let finalAlternatives;
    if (isPaApiConfigured()) {
      console.log("Using Amazon PA API for alternatives");
      const amazonResults = await getAmazonAlternatives(
        aiProductName, finalCategory, p1.identified_plastics || []
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
      summary:          p2?.summary || p1.summary || p1.raw_concerns?.slice(0,2).join(". ") || "",
      concerns:         p2?.refined_concerns || p1.raw_concerns || [],
      category:         finalCategory,
      // ── 5 dimensions ──
      dimensions: {
        materials: {
          score:    mScore,
          label:    p1.materials?.label    || "",
          concerns: p1.materials?.concerns || [],
        },
        usage_exposure: {
          score:     uScore,
          label:     p1.usage_exposure?.label     || "",
          frequency: p1.usage_exposure?.frequency || "unknown",
          type:      p1.usage_exposure?.type      || "unknown",
          intensity: p1.usage_exposure?.intensity || "unknown",
          vulnerable: p1.usage_exposure?.vulnerable || false,
          concerns:  p1.usage_exposure?.concerns  || [],
        },
        packaging: {
          score:       pkScore,
          label:       p1.packaging?.label       || "",
          primary:     p1.packaging?.primary     || "unknown",
          refillable:  p1.packaging?.refillable  || false,
          end_of_life: p1.packaging?.end_of_life || "unknown",
          concerns:    p1.packaging?.concerns    || [],
        },
        sustainability: {
          score:            sScore,
          label:            p1.sustainability?.label            || "",
          reusable:         p1.sustainability?.reusable         || false,
          replaces_single_use: p1.sustainability?.replaces_single_use || false,
          replaces_count:   p1.sustainability?.replaces_count   || null,
          circularity:      p1.sustainability?.circularity      || "unknown",
          concerns:         p1.sustainability?.concerns         || [],
        },
        manufacturing: {
          score:      mfScore,
          label:      p1.manufacturing?.label      || "Estimated — limited supply chain data",
          tier:       p1.manufacturing?.tier       || "neutral",
          confidence: p1.manufacturing?.confidence || "low",
          concerns:   p1.manufacturing?.concerns   || [],
        },
      },
      // ── legacy fields kept for backward compat with other parts of UI ──
      identified_plastics: p1.identified_plastics || [],
      harmful_chemicals:   p1.harmful_chemicals   || [],
      natural_materials:   p1.natural_materials   || [],
      exposure_frequency:  p1.usage_exposure?.frequency || "unknown",
      exposure_type:       p1.usage_exposure?.type      || "unknown",
      confidence:          p2?.confidence    || p1.confidence    || "medium",
      confidence_note:     p2?.confidence_note || p1.confidence_reason || "",
      score_reasoning:     p2?.score_reasoning || "",
      peer_comparison:     peerComparison,
      scan_next:           p1.scan_next  || [],
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
