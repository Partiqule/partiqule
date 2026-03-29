// ============================================================
// Amazon Creators API Integration (replaces PA API 5.0)
// ============================================================
// SETUP (after hitting 10 qualifying sales in 30 days):
//
//   1. Go to affiliate-program.amazon.com/creatorsapi
//   2. Click "Create App" → give it a name like "Partiqule"
//   3. Click "Add New Credential" → copy the Client ID and Client Secret
//   4. Add to Railway environment variables:
//        AMAZON_CLIENT_ID=amzn1.application-oa2-client.xxxxx
//        AMAZON_CLIENT_SECRET=your-client-secret
//        AMAZON_PARTNER_TAG=partiqule-20
//
//   Note: PA API keys (ACCESS_KEY / SECRET_KEY) do NOT work here.
//   Creators API uses OAuth 2.0 (Login with Amazon) instead of AWS signing.
//
//   The site falls back to the static product database automatically
//   if these credentials are not set — no code changes needed.
// ============================================================

const PARTNER_TAG   = process.env.AMAZON_PARTNER_TAG || "partiqule-20";
const CLIENT_ID     = process.env.AMAZON_CLIENT_ID;
const CLIENT_SECRET = process.env.AMAZON_CLIENT_SECRET;

// Token cache — access tokens expire after 1 hour
let cachedToken    = null;
let tokenExpiresAt = 0;

// ── CHECK IF CONFIGURED ──────────────────────────────────────
function isPaApiConfigured() {
  return !!(CLIENT_ID && CLIENT_SECRET && PARTNER_TAG);
}

// ── GET OAUTH ACCESS TOKEN ───────────────────────────────────
async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  const body = new URLSearchParams({
    grant_type:    "client_credentials",
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope:         "advertising::audiences",
  });

  const res = await fetch("https://api.amazon.com/auth/o2/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LWA token error ${res.status}: ${err}`);
  }

  const data = await res.json();
  cachedToken    = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in * 1000);
  console.log("Amazon Creators API: access token obtained");
  return cachedToken;
}

// ── SEARCH AMAZON PRODUCTS ───────────────────────────────────
async function searchAmazonProducts(keyword, category = null, maxResults = 3) {
  if (!isPaApiConfigured()) return null;

  let token;
  try {
    token = await getAccessToken();
  } catch(e) {
    console.error("Failed to get Amazon access token:", e.message);
    return null;
  }

  const searchIndexMap = {
    clothing:      "FashionWomen",
    food_beverage: "GroceryAndGourmetFood",
    personal_care: "BeautyAndGrooming",
    kitchen:       "Kitchen",
    baby:          "Baby",
    other:         "All",
  };
  const searchIndex = searchIndexMap[category] || "All";

  // Creators API uses camelCase (PA API used PascalCase)
  const payload = JSON.stringify({
    keywords:    keyword,
    searchIndex: searchIndex,
    itemCount:   maxResults,
    partnerTag:  PARTNER_TAG,
    partnerType: "Associates",
    marketplace: "www.amazon.com",
    resources: [
      "images.primary.medium",
      "itemInfo.title",
      "itemInfo.byLineInfo",
      "offersV2.listings.price",
      "offersV2.listings.deliveryInfo.isPrimeEligible",
      "itemInfo.features",
    ]
  });

  const res = await fetch("https://affiliate-program.amazon.com/creatorsapi/paapi/searchItems", {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: payload,
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Creators API error:", res.status, err);
    return null;
  }

  const data = await res.json();
  if (!data.searchResult?.items) {
    console.log("Creators API: no results for", keyword);
    return null;
  }

  return data.searchResult.items.map(item => {
    const title      = item.itemInfo?.title?.displayValue || "Unknown product";
    const brand      = item.itemInfo?.byLineInfo?.brand?.displayValue || "";
    const price      = item.offersV2?.listings?.[0]?.price?.displayAmount || "See on Amazon";
    const imageUrl   = item.images?.primary?.medium?.url || null;
    const asin       = item.asin;
    const isPrime    = item.offersV2?.listings?.[0]?.deliveryInfo?.isPrimeEligible || false;
    const features   = item.itemInfo?.features?.displayValues || [];
    const affiliateUrl = `https://www.amazon.com/dp/${asin}?tag=${PARTNER_TAG}`;
    const plasticScore = estimatePlasticScore(title, features);

    return {
      id:          `amz-${asin}`,
      name:        title.length > 60 ? title.slice(0, 57) + "…" : title,
      brand,
      category:    category || "other",
      score:       plasticScore,
      plasticScore,
      material:    features[0] || "See product details",
      description: features[1] || (isPrime ? "✓ Prime eligible" : ""),
      price,
      affiliateUrl,
      imageUrl,
      source:      "amazon",
    };
  });
}

// ── ESTIMATE PLASTIC SCORE FROM TITLE/FEATURES ───────────────
function estimatePlasticScore(title, features) {
  const text = (title + " " + features.join(" ")).toLowerCase();
  if (/stainless steel|cast iron|glass|ceramic|bamboo|organic cotton|merino wool|linen|beeswax/i.test(text)) return 1;
  if (/plastic.free|bpa.free|pfas.free|compostable|biodegradable|natural rubber/i.test(text)) return 2;
  if (/cotton|wool|hemp|wood|cork|recycled/i.test(text)) return 3;
  if (/plastic|polyester|nylon|synthetic|polypropylene/i.test(text)) return 7;
  if (/disposable|single.use/i.test(text)) return 8;
  return 3;
}

// ── MAIN FUNCTION CALLED FROM server.js ──────────────────────
async function getAmazonAlternatives(productName, category, analyzedPlastics = []) {
  if (!isPaApiConfigured()) return null;

  const categoryKeywords = {
    clothing:      "organic cotton natural fiber",
    food_beverage: "stainless steel glass reusable",
    personal_care: "plastic-free natural organic bar",
    kitchen:       "stainless glass cast iron plastic-free",
    baby:          "organic BPA-free natural",
    other:         "eco plastic-free natural",
  };

  const words = productName.toLowerCase()
    .replace(/plastic|disposable|synthetic/g, "")
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 3)
    .join(" ");

  const ecoModifier = categoryKeywords[category] || "plastic-free eco";
  const searchQuery = `${words} ${ecoModifier}`.trim();

  console.log(`Creators API search: "${searchQuery}" (${category})`);

  try {
    return await searchAmazonProducts(searchQuery, category, 3);
  } catch(e) {
    console.error("Creators API search failed:", e.message);
    return null;
  }
}

module.exports = { isPaApiConfigured, getAmazonAlternatives };
