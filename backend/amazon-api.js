// ============================================================
// Amazon Product Advertising API 5.0 Integration
// ============================================================
// SETUP (after getting 3 qualifying sales):
//   1. Go to affiliate-program.amazon.com → Tools → Product Advertising API
//   2. Request access (takes 1-2 weeks after 3 sales)
//   3. Once approved, get your credentials from the PA API console
//   4. Add to your .env file:
//      AMAZON_ACCESS_KEY=your_access_key
//      AMAZON_SECRET_KEY=your_secret_key
//      AMAZON_PARTNER_TAG=partiqule-20  (your Associates tag)
//      AMAZON_REGION=us-east-1
// ============================================================

const crypto = require("crypto");

const AMAZON_HOST   = "webservices.amazon.com";
const AMAZON_REGION = process.env.AMAZON_REGION || "us-east-1";
const ACCESS_KEY    = process.env.AMAZON_ACCESS_KEY;
const SECRET_KEY    = process.env.AMAZON_SECRET_KEY;
const PARTNER_TAG   = process.env.AMAZON_PARTNER_TAG;

// ── CHECK IF PA API IS CONFIGURED ────────────────────────────
function isPaApiConfigured() {
  return !!(ACCESS_KEY && SECRET_KEY && PARTNER_TAG);
}

// ── AWS SIGNATURE V4 SIGNING ──────────────────────────────────
function sign(key, msg) {
  return crypto.createHmac("sha256", key).update(msg).digest();
}

function getSignatureKey(key, dateStamp, region, service) {
  const kDate    = sign(Buffer.from("AWS4" + key, "utf8"), dateStamp);
  const kRegion  = sign(kDate, region);
  const kService = sign(kRegion, service);
  const kSigning = sign(kService, "aws4_request");
  return kSigning;
}

function sha256(payload) {
  return crypto.createHash("sha256").update(payload).digest("hex");
}

// ── SEARCH AMAZON PRODUCTS ────────────────────────────────────
async function searchAmazonProducts(keyword, category = null, maxResults = 3) {
  if (!isPaApiConfigured()) return null;

  const now         = new Date();
  const amzDate     = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const dateStamp   = amzDate.slice(0, 8);
  const endpoint    = "/paapi5/searchitems";
  const service     = "ProductAdvertisingAPI";
  const contentType = "application/json; charset=utf-8";
  const target      = "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems";

  // Map our categories to Amazon search indexes
  const searchIndexMap = {
    clothing:      "FashionWomen",
    food_beverage: "GroceryAndGourmetFood",
    personal_care: "BeautyAndGrooming",
    kitchen:       "Kitchen",
    baby:          "Baby",
    other:         "All",
  };
  const searchIndex = searchIndexMap[category] || "All";

  // Build search query — add "plastic-free" or "eco" to bias toward better alternatives
  const searchKeyword = keyword;

  const payload = JSON.stringify({
    Keywords:     searchKeyword,
    SearchIndex:  searchIndex,
    ItemCount:    maxResults,
    PartnerTag:   PARTNER_TAG,
    PartnerType:  "Associates",
    Marketplace:  "www.amazon.com",
    Resources: [
      "Images.Primary.Medium",
      "ItemInfo.Title",
      "ItemInfo.ByLineInfo",
      "Offers.Listings.Price",
      "Offers.Listings.DeliveryInfo.IsPrimeEligible",
      "ItemInfo.Features",
      "BrowseNodeInfo.BrowseNodes",
    ]
  });

  const payloadHash   = sha256(payload);
  const canonicalUri  = endpoint;
  const canonicalQS   = "";
  const canonicalHeaders =
    `content-encoding:amz-1.0\n` +
    `content-type:${contentType}\n` +
    `host:${AMAZON_HOST}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-target:${target}\n`;
  const signedHeaders  = "content-encoding;content-type;host;x-amz-date;x-amz-target";
  const canonicalReq   =
    `POST\n${canonicalUri}\n${canonicalQS}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const credentialScope = `${dateStamp}/${AMAZON_REGION}/${service}/aws4_request`;
  const stringToSign    =
    `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${sha256(canonicalReq)}`;

  const signingKey  = getSignatureKey(SECRET_KEY, dateStamp, AMAZON_REGION, service);
  const signature   = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`https://${AMAZON_HOST}${endpoint}`, {
    method: "POST",
    headers: {
      "content-encoding": "amz-1.0",
      "content-type":     contentType,
      "host":             AMAZON_HOST,
      "x-amz-date":       amzDate,
      "x-amz-target":     target,
      "Authorization":    authorization,
    },
    body: payload,
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("Amazon PA API error:", response.status, err);
    return null;
  }

  const data = await response.json();

  if (!data.SearchResult?.Items) {
    console.log("Amazon PA API: no results for", keyword);
    return null;
  }

  // Parse into our product format
  return data.SearchResult.Items.map(item => {
    const title      = item.ItemInfo?.Title?.DisplayValue || "Unknown product";
    const brand      = item.ItemInfo?.ByLineInfo?.Brand?.DisplayValue || "";
    const price      = item.Offers?.Listings?.[0]?.Price?.DisplayAmount || "See on Amazon";
    const imageUrl   = item.Images?.Primary?.Medium?.URL || null;
    const asin       = item.ASIN;
    const isPrime    = item.Offers?.Listings?.[0]?.DeliveryInfo?.IsPrimeEligible || false;
    const features   = item.ItemInfo?.Features?.DisplayValues || [];
    const affiliateUrl = `https://www.amazon.com/dp/${asin}?tag=${PARTNER_TAG}`;

    // Derive a plastic score estimate from the title/features
    // (Claude already scored the original product — these are alternatives so we want low scores)
    const plasticScore = estimatePlasticScore(title, features);

    return {
      id:          `amz-${asin}`,
      name:        title.length > 60 ? title.slice(0, 57) + "…" : title,
      brand,
      category:    category || "other",
      score:       plasticScore,
      plasticScore,
      material:    features[0] || "See product details",
      description: features[1] || (isPrime ? "Prime eligible" : ""),
      price,
      affiliateUrl,
      imageUrl,
      source:      "amazon",
    };
  });
}

// ── ESTIMATE PLASTIC SCORE FOR AMAZON RESULTS ────────────────
// Since Amazon returns alternatives (not the scanned product),
// we use heuristics to estimate if the alternative is actually better
function estimatePlasticScore(title, features) {
  const text = (title + " " + features.join(" ")).toLowerCase();

  // Strong low-plastic signals
  if (/stainless steel|cast iron|glass|ceramic|bamboo|organic cotton|merino wool|linen|beeswax|silicone food/i.test(text)) return 1;
  if (/plastic.free|bpa.free|pfas.free|compostable|biodegradable|natural rubber/i.test(text)) return 2;
  if (/cotton|wool|hemp|wood|cork|recycled/i.test(text)) return 3;

  // High plastic signals
  if (/plastic|polyester|nylon|synthetic|polypropylene|polycarbonate/i.test(text)) return 7;
  if (/disposable|single.use/i.test(text)) return 8;

  return 3; // Default — assume it's a decent alternative since we searched for eco-friendly terms
}

// ── GET ALTERNATIVES VIA PA API ───────────────────────────────
// Main function called from server.js
// Returns null if PA API not configured (falls back to static DB)
async function getAmazonAlternatives(productName, category, analyzedPlastics = []) {
  if (!isPaApiConfigured()) return null;

  // Build a targeted search query for plastic-free alternatives
  const categoryKeywords = {
    clothing:      "organic cotton natural fiber",
    food_beverage: "stainless steel glass reusable",
    personal_care: "plastic-free natural organic bar",
    kitchen:       "stainless glass cast iron plastic-free",
    baby:          "organic BPA-free natural",
    other:         "eco plastic-free natural",
  };

  // Extract the core product type from the name
  const words = productName.toLowerCase()
    .replace(/plastic|disposable|synthetic/g, "")
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 3)
    .join(" ");

  const ecoModifier = categoryKeywords[category] || "plastic-free eco";
  const searchQuery = `${words} ${ecoModifier}`.trim();

  console.log(`PA API search: "${searchQuery}" in category: ${category}`);

  try {
    const results = await searchAmazonProducts(searchQuery, category, 3);
    return results;
  } catch(e) {
    console.error("PA API search failed:", e.message);
    return null;
  }
}

module.exports = { isPaApiConfigured, getAmazonAlternatives };
