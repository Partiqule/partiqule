// backend/barcodeIndex.js
// Local UPC / EAN → product name map. Used by Pass 0 as a fallback when the
// Open Food / Beauty / Products Facts databases don't have a barcode.
//
// Why this exists: OFF has millions of food products but OBF (58k) and OPF (40k)
// have near-zero coverage for US consumer goods. When a user scans a Blueland,
// Method, Branch Basics, or Huggies barcode, all three 404 and the /barcode
// endpoint returns fallback_required. That's a dead end for products we HAVE
// scored — we just can't reach them via UPC.
//
// This map lets a barcode resolve to a canonical product name that exists in
// backend/calibration.js. The /barcode endpoint then takes the same code path
// as a calibration-hit text scan (no AI call, instant response).
//
// Entry format: ["<digits-only UPC/EAN>", "<name that calibration.js can match>"]
//
// Seeding strategy:
// - Only add UPCs you've physically verified (scan the product, read the label,
//   cross-reference with the brand's online listing). Fabricated UPCs risk
//   misscoring a different product that legitimately owns that UPC.
// - Name must normalize (lowercase, no punctuation) to a calibration.js key OR
//   fuzzy-match one of them (first-word-matches-brand pattern).
// - Canonical brand naming ("Blueland Dishwasher Tabs" not "Blueland dishwasher
//   cleaner") so future audits can spot duplicates.
//
// For scale beyond hand-curation, pair this with barcodeLookup.js (third-party
// API) and harvest successful lookups back into this file for cache.

const BARCODE_INDEX = new Map([
  // ── Household cleaning ─────────────────────────────────────────
  // Blueland — refillable Forever system
  // UPCs pending hand-verification; seed entries here once confirmed.
  // Example format:
  //   ["810001111131", "Blueland Dishwasher Tabs"],
  //   ["815154020085", "Blueland Multi-Surface"],

  // ── Add entries below as you verify them ──────────────────────
]);

function lookupBarcode(barcode) {
  if (!barcode) return null;
  const cleaned = String(barcode).replace(/\D/g, "");
  if (!cleaned) return null;
  // Try exact match first
  if (BARCODE_INDEX.has(cleaned)) return BARCODE_INDEX.get(cleaned);
  // UPC-A (12 digits) is equivalent to EAN-13 with leading zero
  if (cleaned.length === 12 && BARCODE_INDEX.has("0" + cleaned)) return BARCODE_INDEX.get("0" + cleaned);
  if (cleaned.length === 13 && cleaned.startsWith("0") && BARCODE_INDEX.has(cleaned.slice(1))) return BARCODE_INDEX.get(cleaned.slice(1));
  return null;
}

module.exports = { BARCODE_INDEX, lookupBarcode };
