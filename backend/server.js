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
  clothing:      { avg: 5.5, label: "clothing items"      },
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

async function callClaude(system, userPrompt, maxTokens=800, retries=3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
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
      // Retry on 429 (rate limit) and 529 (overloaded) with backoff
      if ((res.status === 429 || res.status === 529) && attempt < retries) {
        const wait = (attempt + 1) * 3000;
        console.log(`Anthropic ${res.status}, retrying in ${wait}ms (attempt ${attempt+1}/${retries})`);
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
    } catch(err) {
      clearTimeout(timeout);
      if (err.name === "AbortError") {
        if (attempt < retries) { console.log(`Timeout, retrying (attempt ${attempt+1})`); continue; }
        throw new Error("Request timed out after 25s");
      }
      throw err;
    }
  }
}

// ── PASS 1: DEEP ANALYSIS ─────────────────────────────────────
// Vision pass — identifies product from image AND scores it in one call
async function callClaudeVision(imageBase64, mediaType, retries=3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
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
      max_tokens: 1800,
      system: `You are a senior research scientist specializing in polymer chemistry, toxicology, and consumer product safety. You will be shown a photo of a product label, packaging, clothing tag, or product itself. Read any visible text, brand names, or product names to identify the product, then score it across 5 dimensions. Always respond with raw JSON only — no markdown, no preamble. CRITICAL: Never use apostrophes or single quotes inside JSON string values. Use plain text without contractions.

SCORING RULES:
- PP/PVC in food-contact products: materials score 8-9 (NEJM 2024)
- PTFE/PFAS non-stick: materials score 8-9
- Natural materials (wood, glass, stainless, ceramic, organic cotton): materials score 1-2
- ORGANIC KIDS CLOTHING BRANDS (Little Rad Things, Pact Kids, Hanna Andersson, Burt\'s Bees Baby): materials 1-2, final score 1-3
- Single-use disposables: sustainability score 8-9
- Synthetic textiles (polyester, nylon, spandex): materials 5-7, usage 5-7`,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          { type: "text", text: `Look at this photo. Read the brand name, product name, and visible text to identify the product. Score it across 5 dimensions. Return ONLY this JSON:
{
  "product_name": "brand + product name as shown on label",
  "category": "clothing|food_beverage|personal_care|kitchen|baby|other",
  "identified_plastics": ["plastic type 1"],
  "harmful_chemicals": [],
  "natural_materials": ["organic cotton"],
  "materials": { "score": 5, "label": "material analysis", "concerns": ["concern"] },
  "usage_exposure": { "score": 5, "label": "usage risk", "frequency": "daily|weekly|occasional|rare", "type": "ingestion|skin_contact|inhalation|mixed", "intensity": "leave-on|rinse-off|single-contact", "vulnerable": false, "concerns": [] },
  "packaging": { "score": 4, "label": "packaging assessment", "primary": "cardboard|glass|plastic|mixed", "refillable": false, "end_of_life": "recyclable|compostable|landfill|unknown", "concerns": [] },
  "sustainability": { "score": 4, "label": "sustainability story", "reusable": false, "replaces_single_use": false, "replaces_count": null, "circularity": "unknown", "concerns": [] },
  "manufacturing": { "score": 5, "label": "manufacturing estimated", "tier": "good|neutral|bad", "confidence": "low", "concerns": [] },
  "summary": "max 30 words",
  "raw_concerns": ["concern 1"],
  "confidence": "high|medium|low",
  "confidence_reason": "why",
  "scan_next": ["related product 1"],
  "ai_alternatives": [{"name": "safer alternative", "reason": "why safer", "material": "material", "estimated_score": 2}]
}` }
        ]
      }]
    })
  });
      clearTimeout(timeout);
      if ((res.status === 429 || res.status === 529) && attempt < retries) {
        const wait = (attempt + 1) * 3000;
        console.log(`Vision ${res.status}, retrying in ${wait}ms (attempt ${attempt+1}/${retries})`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const text = data.content.map(b => b.text || "").join("").trim();
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("No JSON in vision response");
      try { return JSON.parse(fixJson(match[0])); }
      catch(e) {
        if (attempt < retries) { await new Promise(r => setTimeout(r, 1000)); continue; }
        throw new Error(`Vision JSON parse error: ${e.message}`);
      }
    } catch(err) {
      clearTimeout(timeout);
      if (err.name === "AbortError") {
        if (attempt < retries) { console.log(`Vision timeout, retrying (attempt ${attempt+1})`); continue; }
        throw new Error("Vision request timed out");
      }
      throw err;
    }
  }
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
- ORGANIC AND NATURAL FIBER CLOTHING: confirmed GOTS-certified organic cotton, organic linen, organic wool, bamboo, hemp = materials 1-2. Do not hedge upward due to brand uncertainty.
- KNOWN ORGANIC KIDS CLOTHING BRANDS — these are documented to use organic cotton and must score 1-2 on materials, 2-3 on sustainability: Little Rad Things, Pact Kids, Hanna Andersson, Burt's Bees Baby, Mini Mioche, Primary, Colored Organics, Art and Eden, Patagonia Kids.
- AMBIGUOUS CLOTHING (brand unknown, material unconfirmed): score 3-5 with low confidence. Do not assume synthetic.
- Coatings and treatments count even if the base material is safe.
- PACKAGING-ONLY: if plastic is only in discarded packaging, materials score stays 1-3.
- PVA (polyvinyl alcohol) pod film in dishwasher/laundry pods: score 6-7 — PVA dissolves but enters waterways as microplastic pollution. Cascade, Tide, Finish pods all use PVA film.
- Synthetic fragrances in cleaning products: score +1 — endocrine disrupting compounds, poorly regulated.
- NATURAL FRAGRANCE vs SYNTHETIC: Salt & Stone, Tatcha, Herbivore, and documented clean beauty brands explicitly avoid synthetic fragrance. When these brands list "Fragrance (Parfum)" alongside individually disclosed natural components (limonene, linalool, eugenol, geraniol, citral) this is transparent natural fragrance disclosure — NOT synthetic. Do NOT apply synthetic fragrance penalty. Salt & Stone body care = materials 1-3, final 2-3.
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
- Little Rad Things organic kids tee: materials=1 (confirmed organic cotton), usage=2, packaging=3, sustainability=2 → final ~2
- Generic unbranded cotton tee (unconfirmed): materials=3, confidence=low → final ~3
- Non-stick frying pan (PTFE): materials=9, usage=7, packaging=2, sustainability=3 → final ~7
- Caraway/GreenPan ceramic pan (no PTFE/PFAS): materials=2, usage=2, packaging=2, sustainability=3 → final ~2
- Neutrogena sunscreen (oxybenzone/octinoxate): materials=7 (oxybenzone detected in bloodstream after single use, FDA flagged), usage=7 (daily full-body skin absorption) → final ~7
- Badger zinc oxide mineral sunscreen: materials=2 (non-nano zinc oxide, organic base), usage=2, packaging=3 → final ~2
- Crayola crayons (paraffin wax): materials=4 (petroleum paraffin wax, synthetic dyes), usage=3 (occasional skin contact, not ingested) → final ~3-4
- Stockmar beeswax crayons: materials=1 (beeswax, plant pigments — no paraffin), usage=1 → final ~1-2
- Standard acrylic craft paint: materials=5 (acrylic polymer — plastic-based binder, synthetic pigments), usage=3 (occasional skin contact) → final ~4
- Water-based washable tempera/watercolor (kids): materials=3 (water-based, no solvents), usage=2 → final ~2-3
- Petroleum jelly (Vaseline): materials=5 (petroleum byproduct, possible polycyclic aromatic hydrocarbon contamination), usage=5 (leave-on skin) → final ~5
- Burt's Bees lip balm / beeswax ointment: materials=1 (beeswax, plant oils), usage=2 (leave-on) → final ~1-2
- Conventional laundry dryer sheets (Bounce/Downy): materials=6 (synthetic fragrance chemicals, benzyl acetate, chloroform compounds), usage=5 (residue on clothing daily skin contact) → final ~5-6
- Wool dryer balls: materials=1 (pure wool), usage=1, sustainability=1 (reusable 1,000+ loads) → final ~1
- Tru Earth/Grove laundry strips: materials=2 (no PVA, no synthetic fragrance), usage=2, packaging=1 (cardboard) → final ~1-2
- Febreze air freshener spray: materials=7 (synthetic fragrance — phthalates, VOCs, propellant), usage=6 (aerosolized inhalation in enclosed spaces) → final ~6-7
- Soy wax candle (cotton wick, phthalate-free fragrance): materials=2, usage=3 (some VOCs from burning) → final ~2-3
- Yankee Candle (paraffin, synthetic fragrance): materials=6 (paraffin = petroleum byproduct, synthetic fragrance phthalates), usage=6 (inhalation during burning) → final ~6
- Purina/Royal Canin dry dog food: materials=5 (synthetic preservatives BHA/BHT, artificial dyes, by-products), usage=4 (daily ingestion) → final ~4-5
- Honest Kitchen/Open Farm dog food (whole ingredients): materials=2 (human-grade, no synthetic preservatives), usage=2 → final ~2
- Standard ABS plastic phone case: materials=5 (ABS plastic with possible flame retardants), usage=2 (skin contact but not prolonged) → final ~3-4
- Compostable/plant-based phone case (Pela): materials=2 (bioplastic, compostable), usage=1, sustainability=1 → final ~1-2
- Acetate eyeglass frames (cellulose): materials=2 (plant-derived, biodegradable), usage=2 (daily skin contact) → final ~2-3
- Standard polycarbonate/plastic frames: materials=4 (petroleum plastic, possible flame retardants in hinges), usage=3 → final ~3-4
- Always/Tampax conventional pads/tampons: materials=6 (rayon/synthetic blend, chlorine bleaching, possible dioxin residue, plastic overwrap), usage=6 (direct mucous membrane contact) → final ~6
- Organic cotton tampons/pads (Rael, Cora, August): materials=2 (GOTS organic cotton, no chlorine bleaching), usage=2 → final ~2
- Menstrual cup (medical silicone): materials=1, usage=2, sustainability=1 (replaces thousands of disposables) → final ~1
- Miracle-Gro synthetic fertilizer: materials=6 (synthetic nitrogen, urea, synthetic iron chelates — runoff risk), sustainability=7 (synthetic chemical runoff, no soil biology) → final ~5-6
- Dr. Earth/Espoma organic fertilizer: materials=1 (bone meal, feather meal, natural minerals), sustainability=2 → final ~1-2
- Standard paraffin wax (Roundup/Scotts lawn chemicals): materials=7 (glyphosate — IARC classified probable carcinogen), usage=6 (skin/inhalation exposure), sustainability=8 (soil and waterway damage) → final ~7
- PVC yoga mat: materials=7 (vinyl chloride, phthalate plasticizers, toxic manufacturing), usage=5 (skin contact during exercise) → final ~6
- Natural rubber yoga mat (Liforme/Manduka natural rubber): materials=2, usage=2 → final ~2
- Standard Advil/Tylenol/NyQuil: materials=3 (active pharmaceutical ingredients, inactive excipients including synthetic dyes, PEG, parabens in some), usage=3 (occasional ingestion) → final ~3 — note: score the product itself not just the packaging
- Zarbees/natural honey-based cough syrup: materials=2 (honey, natural flavors, no synthetic dyes or preservatives), usage=2 → final ~2
- Standard bandages (Band-Aid): materials=4 (synthetic polymer adhesive, possible latex, petroleum-backed strip), usage=3 → final ~3
- Fabric/natural adhesive bandages (Welly): materials=3, usage=2 → final ~2

FINAL SCORE CALCULATION (compute server-side, but provide sub-scores accurately):
materials_score x 0.40 + usage_score x 0.25 + packaging_score x 0.15 + sustainability_score x 0.15 + manufacturing_score x 0.05

FOOD ANALYSIS — populate food_analysis ONLY when category is food_beverage. Set to null for all other categories.

NOVA PROCESSING LEVELS:
- whole_food (1): unprocessed — fresh fruit, vegetables, plain meat, eggs, plain milk, plain nuts. Materials 1-2.
- minimally_processed (2): plain yogurt, canned tomatoes, frozen veg, rolled oats, natural cheese. Materials 2-3.
- processed (3): added salt/sugar/oil. Canned fish, cured meats, simple bread, beer/wine. Materials 3-5.
- ultra_processed (4): industrial formulations — packaged snacks, soft drinks, instant noodles, dyed cereals, candy, chips, processed meat. Materials 5-8.

INGREDIENTS OF CONCERN — flag when confirmed or likely present:
HIGH severity: Red 40 (FDA phasing out, hyperactivity/carcinogenicity), Red 3 (FDA banned 2025), Yellow 5 (hyperactivity/ADHD), Yellow 6 (hyperactivity), Blue 1 (FDA phasing out), Blue 2 (possible neurotoxin), Titanium dioxide (IARC Group 2B, EU food ban), BHA/BHT (BHA = IARC Group 2B carcinogen), Sodium nitrate/nitrite (IARC Group 1 for processed meat), Trans fats/partially hydrogenated oils (cardiovascular), HFCS (metabolic disease, obesity)
MEDIUM severity: Aspartame (IARC Group 2B 2023), Sucralose (gut microbiome disruption), Acesulfame-K (animal carcinogen studies), Carrageenan (intestinal inflammation), Sodium benzoate (benzene risk with Vitamin C), TBHQ (possible immunotoxin), Caramel color class IV (4-MEI carcinogen), Natural flavors (hundreds of undisclosed chemicals), Carmine E120 (allergic reactions)
LOW severity: Artificial flavors (undisclosed composition), Modified starch (highly processed), Soy lecithin (processed emulsifier), Maltodextrin (high glycemic)

POSITIVE ATTRIBUTES — flag when present: USDA Organic, Non-GMO Verified, No artificial colors, No artificial preservatives, No artificial sweeteners, Whole food ingredients only, Fair Trade certified, Minimal ingredients (5 or fewer)

FOOD SCORE IMPACT: Ultra-processed + multiple HIGH severity additives = materials 7-8, usage 6-7. Ultra-processed + MEDIUM additives = materials 5-7. Processed, no synthetic additives = materials 3-4. Whole/minimally processed = materials 1-2. Daily consumption of ultra-processed adds +1 usage. Child food with synthetic dyes = vulnerable flag + +1 materials.

Return ONLY this JSON:
{
  "product_name": "clean accurate product name",
  "category": "clothing|food_beverage|personal_care|kitchen|baby|other",
  "identified_plastics": ["specific plastic type 1"],
  "harmful_chemicals": ["phthalates", "BPA", "Red 40"],
  "natural_materials": ["organic cotton", "glass"],
  "materials": {
    "score": 7,
    "label": "specific material analysis",
    "concerns": ["PP in direct food contact", "PTFE coating degrades above 260C"]
  },
  "usage_exposure": {
    "score": 8,
    "label": "daily ingestion risk",
    "frequency": "daily|weekly|occasional|rare",
    "type": "ingestion|skin_contact|inhalation|mixed",
    "intensity": "leave-on|rinse-off|single-contact",
    "vulnerable": false,
    "concerns": ["Direct plastic ingestion at every use"]
  },
  "packaging": {
    "score": 3,
    "label": "packaging assessment",
    "primary": "cardboard|glass|plastic|mixed",
    "refillable": false,
    "end_of_life": "recyclable|compostable|landfill|unknown",
    "concerns": []
  },
  "sustainability": {
    "score": 2,
    "label": "sustainability story",
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
    "concerns": []
  },
  "food_analysis": null,
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
}

NOTE: If category is food_beverage, replace "food_analysis": null with a populated object:
  "food_analysis": {
    "processing_level": "whole_food|minimally_processed|processed|ultra_processed",
    "processing_label": "max 8 words describing the processing",
    "nova_score": 4,
    "concerns": [
      {"ingredient": "Red 40", "type": "artificial_dye", "severity": "high", "reason": "FDA phasing out, linked to hyperactivity"},
      {"ingredient": "BHA", "type": "synthetic_preservative", "severity": "high", "reason": "IARC Group 2B possible carcinogen"}
    ],
    "positives": [
      {"attribute": "USDA Organic", "reason": "No synthetic pesticides or additives"}
    ],
    "confidence": "high|medium|low",
    "confidence_note": "max 10 words"
  }
`,
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
MATERIALS: Only score plastic/chemical risk from materials user is exposed to during use. Discarded packaging must not drive materials above 3 for otherwise plastic-free products. BUT: PVA pod film (Cascade, Tide, Finish) = materials 6-7 because PVA enters waterways. Synthetic fragrances and optical brighteners in cleaning products = materials 6-7. Synthetic textiles (polyester, nylon, spandex) with daily skin contact = materials 5-7. ORGANIC CLOTHING: confirmed organic cotton, linen, wool, hemp, bamboo = materials 1-2 regardless of daily use. Known organic kids brands (Little Rad Things, Pact Kids, Hanna Andersson, Burt's Bees Baby) = final score 1-3.
NATURAL FRAGRANCE RULE: Salt & Stone, Tatcha, Herbivore, Byredo, and similar clean beauty brands explicitly avoid synthetic fragrance. When these brands list "Fragrance (Parfum)" alongside individually disclosed natural components (limonene, linalool, eugenol, geraniol, citral, benzyl benzoate) this is transparent natural fragrance — NOT synthetic fragrance. Do NOT apply synthetic fragrance penalty. Materials score for Salt & Stone products must be 1-3. Final score for Salt & Stone body care must be 2-3, never 4+.
USAGE: Daily plastic ingestion = usage 8-9. Leave-on skin contact daily = 7-8. Rinse-off = lower BUT dishwasher/laundry products are NOT zero — residue remains on dishes and clothing. Conventional dishwasher pods = usage 4-6. Genuinely clean formulas = usage 2-3. Vehicles = 3-5 max. EVs score 1-2 lower than gas.
PACKAGING: Refillable/concentrated = 1-3. Single-use plastic = 7-9. Concentrated pod format does NOT excuse bad materials.
SUSTAINABILITY: Products releasing PVA or synthetic chemicals to waterways = sustainability 5-7 even if concentrated. Genuinely clean (no PVA, no synthetic fragrance) = sustainability 1-3.
MANUFACTURING: Cap at 5%. Unknown = neutral 4-5.
CHEWING GUM: polyvinyl acetate = direct plastic ingestion. Materials 7-8, usage 8-9.
SUNSCREEN: Chemical UV filters (oxybenzone, octinoxate, avobenzone) = materials 6-7, usage 6-7 (full-body daily skin absorption, FDA flagged for bloodstream penetration). Mineral-only (zinc oxide, titanium dioxide) = materials 2-3, usage 2-3.
HOME FRAGRANCE/CANDLES: Paraffin wax + synthetic fragrance (Yankee, Bath & Body Works) = materials 6, usage 5-6 (VOC inhalation in enclosed space). Soy or beeswax + phthalate-free fragrance = materials 2, usage 3. Aerosol sprays (Febreze, Glade) = materials 6-7 (phthalates, propellant), usage 6 (aerosolized inhalation).
LAUNDRY: Conventional dryer sheets (Bounce, Downy) = materials 6 (benzyl acetate, synthetic VOCs), usage 5 (daily skin contact residue on clothes). Wool dryer balls = materials 1, usage 1.
ART SUPPLIES: Paraffin wax crayons = materials 4 (petroleum wax, synthetic dyes). Beeswax crayons = materials 1. Solvent-based paints/markers = materials 6-7 (VOCs). Water-based washable paints/markers = materials 2-3.
MEDICATIONS/FIRST AID: Score the product itself, not just packaging. Active pharmaceutical ingredients in OTC medications carry minimal risk at occasional use — do not over-score. Standard OTC pain relief (Advil, Tylenol) = final 3 (occasional ingestion, some synthetic inactive ingredients). Natural alternatives (arnica, honey-based) = final 2. Petroleum jelly = materials 5 (petroleum derivative, possible PAH contamination), usage 5 (leave-on skin).
FEMININE HYGIENE: Conventional synthetic pads/tampons (Always, Tampax) = materials 6 (rayon, chlorine bleaching, possible dioxin residue), usage 6 (direct mucous membrane contact). Organic cotton versions = materials 2, usage 2. Menstrual cups (medical silicone) = materials 1, sustainability 1.
PET FOOD: Kibble with synthetic preservatives (BHA/BHT) and artificial dyes = materials 5-6, usage 4-5 (daily ingestion). Whole ingredient/organic pet food = materials 2, usage 2.
GARDEN CHEMICALS: Synthetic pesticides (glyphosate/Roundup) = materials 7-8, sustainability 8. Organic OMRI-listed products = materials 1-2, sustainability 2.
EYEWEAR: Acetate frames (cellulose) = materials 2 (plant-derived). Polycarbonate/standard plastic = materials 4. Usage stays low (2-3) for all — skin contact but minimal absorption. Final scores for eyewear typically 2-4.
TECH/ACCESSORIES: Score durability as sustainability signal. Cheap disposable cables = sustainability 7. Braided long-life cables = sustainability 3. Phone cases: ABS plastic = materials 5, compostable bioplastic = materials 2.

CALIBRATION — use these as anchors:
- Cascade pods: final score ~6 (PVA film + synthetic chemicals + residue on dishes)
- Blueland tablets: final score ~1-2 (genuinely plastic-free, no PVA, no synthetic fragrance)
- Lululemon leggings: final score ~6 (synthetic microfibers daily skin contact)
- Organic cotton tee: final score ~1-2
- PTFE non-stick pan: final score ~7-8
- Ceramic pan (Caraway/GreenPan): final score ~2
- Neutrogena chemical sunscreen: final score ~7 (oxybenzone bloodstream absorption)
- Badger mineral sunscreen: final score ~2 (zinc oxide only)
- Conventional dryer sheets (Bounce): final score ~5-6 (synthetic VOCs daily skin contact)
- Wool dryer balls: final score ~1 (pure wool, 1000+ uses)
- Febreze spray: final score ~6-7 (phthalates aerosolized in enclosed space)
- Soy candle (phthalate-free): final score ~2-3
- Yankee Candle (paraffin + synthetic fragrance): final score ~6
- Crayola paraffin crayons: final score ~3-4
- Stockmar beeswax crayons: final score ~1-2
- Standard PVC yoga mat: final score ~6
- Natural rubber yoga mat: final score ~2
- Conventional tampons/pads (Always/Tampax): final score ~6 (synthetic blend + chlorine bleaching + direct mucous membrane contact)
- Organic cotton tampons/pads: final score ~2
- Menstrual cup: final score ~1
- Purina/Royal Canin dry kibble: final score ~4-5 (synthetic preservatives BHA/BHT)
- Honest Kitchen/Open Farm whole ingredient dog food: final score ~2
- Synthetic fertilizer (Miracle-Gro): final score ~5-6
- Organic fertilizer (Dr. Earth/Espoma): final score ~1-2
- Standard Advil/Tylenol: final score ~3 (score the product, not just packaging — occasional ingestion, some synthetic excipients)
- Zarbees natural cough syrup: final score ~2

Break-even (null if no clear swap): bottle→stainless:50, cup→reusable:40, wrap→beeswax:8, toothbrush→bamboo:1, pan→cast iron:200, pan→ceramic:150, container→glass:25, pads→menstrual cup:90, tampons→organic cotton:1, razor→safety:10, zipbag→silicone:15, bag→tote:130, shampoo→bar:6, clothing→natural:30, dryer sheets→wool balls:40, sunscreen→mineral:1, crayon→beeswax:1, yoga mat→natural rubber:200. Vehicles/electronics/appliances/natural materials=null.

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
  // Prevent service workers and browsers from caching API responses
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.set("Pragma", "no-cache");
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

      const category = p1.category || "other";
      let finalAlternatives = findAlternatives(productName, category);
      if (!finalAlternatives.length && p1.ai_alternatives?.length) {
        finalAlternatives = p1.ai_alternatives.map(a => ({
          id: `ai-${Math.random()}`, name: a.name, brand: "", score: a.estimated_score ?? 2,
          material: a.material || "", description: a.reason || "", price: "", affiliateUrl: null, category
        }));
      }

      // Compute weighted score from 5 dimensions
      const mScore  = p2?.materials_score      ?? p1.materials?.score      ?? p1.product_score  ?? 5;
      const uScore  = p2?.usage_score          ?? p1.usage_exposure?.score  ?? 5;
      const pkScore = p2?.packaging_score      ?? p1.packaging?.score      ?? p1.packaging_score ?? 5;
      const sScore  = p2?.sustainability_score ?? p1.sustainability?.score  ?? 5;
      const mfScore = p2?.manufacturing_score  ?? p1.manufacturing?.score   ?? 5;
      const finalScore = Math.min(10, Math.max(1,
        Math.round(mScore*0.40 + uScore*0.25 + pkScore*0.15 + sScore*0.15 + mfScore*0.05)
      ));

      const result = {
        product_name: productName, category,
        score: finalScore,
        summary: p2?.summary || p1.summary || p1.raw_concerns?.slice(0,2).join(". ") || "",
        concerns: p2?.refined_concerns || p1.raw_concerns || [],
        identified_plastics: p1.identified_plastics || [],
        harmful_chemicals:   p1.harmful_chemicals   || [],
        natural_materials:   p1.natural_materials   || [],
        exposure_frequency:  p1.usage_exposure?.frequency || p1.exposure_frequency || "unknown",
        exposure_type:       p1.usage_exposure?.type      || p1.exposure_type      || "unknown",
        confidence:          p2?.confidence    || p1.confidence    || "medium",
        confidence_note:     p2?.confidence_note || p1.confidence_reason || "",
        score_reasoning:     p2?.score_reasoning || "",
        scan_next:           p1.scan_next  || [],
        break_even:          p2?.break_even || null,
        food_analysis:       p1.food_analysis   || null,
        peer_comparison:     null,
        cached:              false,
        scannedAt:           new Date().toISOString(),
        dimensions: {
          materials: {
            score: mScore, label: p1.materials?.label || "", concerns: p1.materials?.concerns || [],
          },
          usage_exposure: {
            score: uScore, label: p1.usage_exposure?.label || "",
            frequency: p1.usage_exposure?.frequency || "unknown",
            type: p1.usage_exposure?.type || "unknown",
            intensity: p1.usage_exposure?.intensity || "unknown",
            vulnerable: p1.usage_exposure?.vulnerable || false,
            concerns: p1.usage_exposure?.concerns || [],
          },
          packaging: {
            score: pkScore, label: p1.packaging?.label || "",
            primary: p1.packaging?.primary || "unknown",
            refillable: p1.packaging?.refillable || false,
            end_of_life: p1.packaging?.end_of_life || "unknown",
            concerns: p1.packaging?.concerns || [],
          },
          sustainability: {
            score: sScore, label: p1.sustainability?.label || "",
            reusable: p1.sustainability?.reusable || false,
            replaces_single_use: p1.sustainability?.replaces_single_use || false,
            replaces_count: p1.sustainability?.replaces_count || null,
            circularity: p1.sustainability?.circularity || "unknown",
            concerns: p1.sustainability?.concerns || [],
          },
          manufacturing: {
            score: mfScore,
            label: p1.manufacturing?.label || "Estimated — limited supply chain data",
            tier: p1.manufacturing?.tier || "neutral",
            confidence: "low",
            concerns: p1.manufacturing?.concerns || [],
          },
        },
        alternatives: finalAlternatives.map(p => ({
          id: p.id, name: p.name, brand: p.brand || "",
          score: p.score ?? 3, material: p.material || "",
          description: p.description || "", price: p.price || "",
          affiliateUrl: p.affiliateUrl, category: p.category || category
        })),
        ai_alternatives: (p1.ai_alternatives || []).map(a => ({
          name: a.name || "", reason: a.reason || "",
          material: a.material || "", estimated_score: a.estimated_score || 2, source: "ai",
        })),
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
      food_analysis:       p1.food_analysis   || null,
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
    const msg = err.message?.includes("529") || err.message?.includes("overload")
      ? "Partiqule is in high demand right now. Please try again in a few seconds."
      : err.message?.includes("429") || err.message?.includes("rate")
      ? "Too many requests. Please wait a moment and try again."
      : err.message?.includes("timed out")
      ? "That scan took too long. Please try again."
      : err.message;
    res.status(500).json({ error: msg });
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
