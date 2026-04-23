// backend/barcodeLookup.js
// Optional third-party barcode lookup client. Gated on env var — no key set
// means no call, no cost, graceful degradation to the existing Pass 0 chain.
//
// Provider: UPCItemDB (https://www.upcitemdb.com/). Free tier: 100 lookups/day
// without a key, unreliable; trial key: 1000/day; paid: ~$30/mo for 10k/day.
// Go-UPC and Barcodelookup.com are alternative providers with similar shapes.
//
// Env vars:
//   BARCODE_LOOKUP_PROVIDER   "upcitemdb" | "go-upc" | unset (disables)
//   BARCODE_LOOKUP_KEY        API key for the chosen provider
//
// When a barcode resolves here, the returned object shape matches what Pass 0
// expects from the Open Facts databases (product_name populated, ingredients
// possibly empty). Callers handle the empty-ingredients case by falling
// through to calibration/cascade lookups.

const LOOKUP_TIMEOUT_MS = 4000;

async function lookupUpcItemDb(barcode, apiKey) {
  const base = apiKey
    ? "https://api.upcitemdb.com/prod/v1/lookup"
    : "https://api.upcitemdb.com/prod/trial/lookup";
  const url = `${base}?upc=${encodeURIComponent(barcode)}`;
  const headers = { "User-Agent": "Partiqule/1.0" };
  if (apiKey) headers["user_key"] = apiKey;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
  if (!res.ok) return null;
  const json = await res.json();
  const item = (json.items || [])[0];
  if (!item) return null;
  return {
    product_name: item.title || item.model || null,
    brand: item.brand || null,
    category: item.category || null,
    ingredients_text: "", // upcitemdb does not provide ingredients
    _source: "upcitemdb",
    _raw: item,
  };
}

async function lookupGoUpc(barcode, apiKey) {
  if (!apiKey) return null; // Go-UPC requires a key
  const url = `https://go-upc.com/api/v1/code/${encodeURIComponent(barcode)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, "User-Agent": "Partiqule/1.0" },
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const json = await res.json();
  const product = json.product;
  if (!product || !product.name) return null;
  return {
    product_name: product.name,
    brand: product.brand || null,
    category: product.category || null,
    ingredients_text: "",
    _source: "go-upc",
    _raw: product,
  };
}

async function externalBarcodeLookup(barcode) {
  const provider = process.env.BARCODE_LOOKUP_PROVIDER;
  const apiKey = process.env.BARCODE_LOOKUP_KEY;
  if (!provider) return null;
  try {
    if (provider === "upcitemdb") return await lookupUpcItemDb(barcode, apiKey);
    if (provider === "go-upc") return await lookupGoUpc(barcode, apiKey);
    console.warn(`[barcodeLookup] Unknown provider: ${provider}`);
    return null;
  } catch (e) {
    console.warn(`[barcodeLookup] ${provider} failed for ${barcode}: ${e.message}`);
    return null;
  }
}

module.exports = { externalBarcodeLookup };
