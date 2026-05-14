// R2 text-input lift — URL paste preprocessor.
//
// When the /analyze handler receives a `query` that starts with http(s)://,
// it routes through extractProductFromUrl below. We fetch the URL, pull a
// handful of metadata fields, hand them to a single Haiku call, and return
// `${brand} ${product_name}` so the existing scoring cascade can run on a
// canonical name rather than a URL string.
//
// All failure modes return a structured { ok: false, code, error } shape so
// the caller can surface a clean 422 to the frontend. We never throw out of
// this module and never let a URL fetch turn into a 500.

const FETCH_TIMEOUT_MS = 5000;
const URL_CACHE_TTL_SEC = 60 * 60 * 24 * 7; // 7 days

// Tracking params stripped before hashing the URL for cache lookup. A user
// who shares the same product link with utm_source=email and the same link
// with utm_source=twitter should resolve to one cache entry.
const TRACKING_PARAM_PREFIXES = ["utm_"];
const TRACKING_PARAMS_EXACT = new Set([
  "fbclid", "gclid", "gbraid", "wbraid", "msclkid",
  "mc_eid", "mc_cid", "_hsenc", "_hsmi", "_ga",
  "ref", "ref_", "ref_src", "ref_url",
  "igshid", "igsh", "si",
  "share", "shareid", "share_id",
]);

function normalizeUrl(raw) {
  try {
    const u = new URL(String(raw).trim());
    u.hash = "";
    const params = new URLSearchParams(u.search);
    for (const key of [...params.keys()]) {
      const lower = key.toLowerCase();
      if (TRACKING_PARAMS_EXACT.has(lower)) { params.delete(key); continue; }
      if (TRACKING_PARAM_PREFIXES.some(p => lower.startsWith(p))) { params.delete(key); }
    }
    u.search = params.toString();
    // Drop trailing slash on path so /p/ABC/ and /p/ABC hit the same cache.
    let out = u.toString();
    if (out.endsWith("/") && u.pathname !== "/") out = out.slice(0, -1);
    return out;
  } catch { return String(raw); }
}

function urlCacheKey(normalized) {
  return `url:v1:${normalized}`;
}

// Captcha / block-page detection. We scan the first ~5kb of the response so
// long retail pages aren't traversed end-to-end. Strings cover the patterns
// we've observed in practice (Amazon's "Robot Check", Cloudflare turnstile,
// Datadome). False positives cost the user one error message; false
// negatives let a captcha string flow into the Haiku prompt where the model
// will likely return low confidence anyway, so we err on the side of strict.
function looksLikeCaptcha(html) {
  const sample = html.slice(0, 5000).toLowerCase();
  if (sample.includes("robot check")) return true;
  if (sample.includes("captcha-delivery.com")) return true;
  if (sample.includes("challenges.cloudflare.com")) return true;
  if (sample.includes("cf-challenge")) return true;
  if (sample.includes("attention required") && sample.includes("cloudflare")) return true;
  if (sample.includes("access denied") && sample.includes("cloudflare")) return true;
  if (sample.includes("press and hold") && sample.includes("human")) return true;
  if (sample.includes("enable javascript and cookies to continue")) return true;
  return false;
}

function decodeEntities(s) {
  return String(s || "")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Pull title + og:* + meta description + 500-char body sample from the HTML.
// Each meta regex covers both attribute orderings (property-before-content
// and content-before-property) since pages emit both in the wild.
function extractMeta(html) {
  const matchAttr = (attr, key) => {
    const a = new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]+content=["']([^"']*)["']`, "i").exec(html);
    if (a) return a[1];
    const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${key}["']`, "i").exec(html);
    if (b) return b[1];
    return "";
  };
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title    = decodeEntities(titleMatch ? titleMatch[1] : "");
  const ogTitle  = decodeEntities(matchAttr("property", "og:title"));
  const ogSite   = decodeEntities(matchAttr("property", "og:site_name"));
  const ogDesc   = decodeEntities(matchAttr("property", "og:description"));
  const metaDesc = decodeEntities(matchAttr("name", "description"));
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
  return { title, ogTitle, ogSite, ogDesc, metaDesc, body };
}

// Social URL hint — Instagram posts/reels and TikTok user pages typically
// have generic page titles ("Login • Instagram") but the product mention
// shows up in the og:description or in the cached caption that we pull as
// the body sample. The hint tells Haiku where to look.
function isSocialUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.toLowerCase();
    if ((host === "instagram.com" || host.endsWith(".instagram.com")) &&
        (path.startsWith("/p/") || path.startsWith("/reel/"))) return true;
    if ((host === "tiktok.com" || host.endsWith(".tiktok.com")) &&
        path.startsWith("/@")) return true;
    return false;
  } catch { return false; }
}

const SYSTEM_PROMPT = `You extract canonical product names from retailer or social media pages. Return only JSON: {brand, product_name, confidence: "high"|"medium"|"low"}. Confidence is low if you cannot clearly identify a specific product (e.g., the page is a category listing, a homepage, a social media feed, or a blocked page).`;

const ERR_LOW_CONFIDENCE = "Couldn't identify a specific product from that link. Try typing the product name instead.";
const ERR_TIMEOUT        = "Link took too long to load. Try the product name.";
const ERR_UNREADABLE     = "Couldn't read that link. Try the product name.";

async function resolveProductFromUrl(rawUrl, deps = {}) {
  const { callClaude, redisGet, redisSetEx } = deps;
  const normalized = normalizeUrl(rawUrl);
  const key = urlCacheKey(normalized);

  if (typeof redisGet === "function") {
    try {
      const cached = await redisGet(key);
      if (cached && typeof cached === "object" && cached.ok && cached.query) {
        return { ...cached, fromCache: true };
      }
    } catch { /* cache miss is non-fatal */ }
  }

  let html = "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(normalized, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (!res.ok) {
      console.error("[urlExtractor] non-2xx", normalized, res.status);
      return { ok: false, code: "fetch_failed", error: ERR_UNREADABLE };
    }
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      console.error("[urlExtractor] non-HTML content-type", normalized, contentType);
      return { ok: false, code: "non_html", error: ERR_UNREADABLE };
    }
    html = await res.text();
  } catch (err) {
    if (err && err.name === "AbortError") {
      console.error("[urlExtractor] timeout", normalized);
      return { ok: false, code: "timeout", error: ERR_TIMEOUT };
    }
    console.error("[urlExtractor] network error", normalized, err && err.message);
    return { ok: false, code: "fetch_failed", error: ERR_UNREADABLE };
  } finally {
    clearTimeout(timer);
  }

  if (looksLikeCaptcha(html)) {
    console.error("[urlExtractor] captcha detected", normalized);
    return { ok: false, code: "captcha", error: ERR_UNREADABLE };
  }

  const meta = extractMeta(html);
  let userPrompt = `Page title: ${meta.title}. OG title: ${meta.ogTitle}. OG site: ${meta.ogSite}. OG description: ${meta.ogDesc || meta.metaDesc}. Body sample: ${meta.body}.`;
  if (isSocialUrl(normalized)) {
    userPrompt += " This is a social media post. The product mention will be in the caption or description, not the page title.";
  }

  let parsed;
  try {
    parsed = await callClaude(SYSTEM_PROMPT, userPrompt, 200, 1);
  } catch (err) {
    console.error("[urlExtractor] haiku call failed", normalized, err && err.message);
    return { ok: false, code: "fetch_failed", error: ERR_UNREADABLE };
  }

  const brand = (parsed && typeof parsed.brand === "string") ? parsed.brand.trim() : "";
  const productName = (parsed && typeof parsed.product_name === "string") ? parsed.product_name.trim() : "";
  const confidence = (parsed && typeof parsed.confidence === "string") ? parsed.confidence.toLowerCase().trim() : "";

  if (!productName || confidence === "low") {
    return { ok: false, code: "low_confidence", error: ERR_LOW_CONFIDENCE };
  }

  // Brand prefix only when it isn't already at the head of product_name.
  // Avoids "Lululemon Lululemon Align Pant" when Haiku double-tagged.
  let query = productName;
  if (brand && !productName.toLowerCase().startsWith(brand.toLowerCase())) {
    query = `${brand} ${productName}`;
  }
  query = query.replace(/\s+/g, " ").trim();

  const result = { ok: true, query, brand, productName, confidence };

  if (typeof redisSetEx === "function") {
    try { await redisSetEx(key, result, URL_CACHE_TTL_SEC); } catch { /* non-fatal */ }
  }
  return result;
}

module.exports = {
  resolveProductFromUrl,
  normalizeUrl,
  isSocialUrl,
  URL_CACHE_TTL_SEC,
};
