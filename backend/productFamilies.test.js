#!/usr/bin/env node
// Test suite for backend/productFamilies.js
// Run: node backend/productFamilies.test.js

const { classifyProductFamily, CANONICAL_FAMILIES } = require("./productFamilies");

let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
  try { fn(); passed++; } catch (err) { failed++; failures.push(`FAIL: ${name}\n       ${err.message}`); }
}

function expect(productName, category, expected, ingredients = null) {
  const got = classifyProductFamily(productName, ingredients, category);
  if (got !== expected) {
    throw new Error(`"${productName}" (cat=${category}) → expected ${expected}, got ${got}`);
  }
}

// ── Canonical scenarios ──
test("Armani Luminous Silk Foundation → foundation", () => {
  expect("Armani Luminous Silk Foundation", "personal_care", "foundation");
});
test("Armani Luminous Silk Natural Glow Foundation → foundation", () => {
  expect("Armani Luminous Silk Natural Glow Foundation", "personal_care", "foundation");
});
test("Armani Luminous Silk Natural Glow Blurring Foundation → foundation", () => {
  expect("Armani Luminous Silk Natural Glow Blurring Foundation", "accessory", "foundation");
});

// ── Nail (remover must beat nail_polish) ──
test("Cutex Nail Polish Remover → nail_polish_remover", () => {
  expect("Cutex Nail Polish Remover", "personal_care", "nail_polish_remover");
});
test("OPI Nail Polish → nail_polish", () => {
  expect("OPI Nail Polish Bubble Bath", "personal_care", "nail_polish");
});

// ── Makeup ──
test("Tarte Shape Tape Concealer → concealer", () => {
  expect("Tarte Shape Tape Concealer", "personal_care", "concealer");
});
test("Maybelline Sky High Mascara → mascara", () => {
  expect("Maybelline Sky High Mascara", "personal_care", "mascara");
});
test("Urban Decay Naked Eyeshadow Palette → eyeshadow", () => {
  expect("Urban Decay Naked Eyeshadow Palette", "personal_care", "eyeshadow");
});
test("NARS Orgasm Blush → blush", () => {
  expect("NARS Orgasm Blush", "personal_care", "blush");
});
test("MAC Ruby Woo Lipstick → lipstick", () => {
  expect("MAC Ruby Woo Lipstick", "personal_care", "lipstick");
});
test("Burt's Bees Lip Balm → lip_balm", () => {
  expect("Burt's Bees Beeswax Lip Balm", "personal_care", "lip_balm");
});
test("Carmex → lip_balm (brand keyword)", () => {
  expect("Carmex Classic Lip Balm Jar", "personal_care", "lip_balm");
});
test("ChapStick Classic → lip_balm (brand keyword)", () => {
  expect("ChapStick Classic Original", "personal_care", "lip_balm");
});
test("MAC Matte Lipstick → lipstick (lip_balm must not steal)", () => {
  expect("MAC Matte Lipstick Ruby Woo", "personal_care", "lipstick");
});
test("Aquaphor Lip Repair → lip_balm (lip keyword wins over wound_care)", () => {
  expect("Aquaphor Lip Repair", "personal_care", "lip_balm");
});
test("CC Cream → foundation (tinted category)", () => {
  expect("IT Cosmetics CC Cream SPF 50", "personal_care", "foundation");
});
test("Fenty Beauty Pro Filt'r Soft Matte Foundation → foundation", () => {
  expect("Fenty Beauty Pro Filt'r Soft Matte Foundation", "personal_care", "foundation");
});

// ── Sun ──
test("Neutrogena Ultra Sheer Sunscreen → sunscreen", () => {
  expect("Neutrogena Ultra Sheer Sunscreen SPF 70", "personal_care", "sunscreen");
});
test("SPF 30 Daily Moisturizer → sunscreen (SPF keyword wins)", () => {
  expect("SPF 30 Daily Moisturizer", "personal_care", "sunscreen");
});

// ── Baby (must beat generic hair/skin) ──
test("Johnson's Baby Shampoo → baby_shampoo, not hair_shampoo", () => {
  expect("Johnson's Baby Shampoo", "personal_care", "baby_shampoo");
});
test("Aveeno Baby Daily Moisture Lotion → baby_lotion", () => {
  expect("Aveeno Baby Daily Moisture Lotion", "baby", "baby_lotion");
});
test("Desitin Diaper Rash Cream → baby_diaper_cream", () => {
  expect("Desitin Diaper Rash Cream", "baby", "baby_diaper_cream");
});
test("Huggies Natural Care Baby Wipes → baby_wipe", () => {
  expect("Huggies Natural Care Baby Wipes", "baby", "baby_wipe");
});
test("baby category + Daily Cream → baby_lotion (category tiebreaker)", () => {
  expect("Gentle Daily Cream", "baby", "baby_lotion");
});

// ── Hair ──
test("Head & Shoulders Classic Clean Shampoo → hair_shampoo", () => {
  expect("Head & Shoulders Classic Clean Shampoo", "personal_care", "hair_shampoo");
});
test("Pantene Leave-In Conditioner → hair_conditioner", () => {
  expect("Pantene Leave-In Conditioner", "personal_care", "hair_conditioner");
});
test("Batiste Dry Shampoo → hair_styling (not hair_shampoo)", () => {
  expect("Batiste Dry Shampoo Original", "personal_care", "hair_styling");
});
test("Got2b Glued Freeze Hairspray → hair_styling", () => {
  expect("Got2b Glued Freeze Hairspray", "personal_care", "hair_styling");
});

// ── Body / soap ──
test("Dove Body Wash → body_wash", () => {
  expect("Dove Deep Moisture Body Wash", "personal_care", "body_wash");
});
test("Dove Beauty Bar → bar_soap", () => {
  expect("Dove White Beauty Bar", "personal_care", "bar_soap");
});

// ── Deodorant / fragrance ──
test("Native Coconut & Vanilla Deodorant → deodorant", () => {
  expect("Native Coconut & Vanilla Deodorant", "personal_care", "deodorant");
});
test("Chanel No 5 Eau de Parfum → fragrance", () => {
  expect("Chanel No 5 Eau de Parfum", "personal_care", "fragrance");
});

// ── Oral ──
test("Colgate Total Toothpaste → oral_toothpaste", () => {
  expect("Colgate Total Toothpaste", "personal_care", "oral_toothpaste");
});
test("Listerine Cool Mint Mouthwash → oral_mouthwash", () => {
  expect("Listerine Cool Mint Mouthwash", "personal_care", "oral_mouthwash");
});

// ── Wound care ──
test("Neosporin Original Antibiotic Ointment → wound_care", () => {
  expect("Neosporin Original Antibiotic Ointment", "personal_care", "wound_care");
});
test("Aquaphor Healing Ointment → wound_care", () => {
  expect("Aquaphor Healing Ointment", "personal_care", "wound_care");
});

// ── Shaving ──
test("Gillette Foamy Shaving Cream → shaving_cream", () => {
  expect("Gillette Foamy Shaving Cream", "personal_care", "shaving_cream");
});
test("Gillette Mach3 Razor → razor", () => {
  expect("Gillette Mach3 Razor", "personal_care", "razor");
});

// ── Skincare ──
test("CeraVe Eye Repair Cream → skincare_eye", () => {
  expect("CeraVe Eye Repair Cream", "personal_care", "skincare_eye");
});
test("The Ordinary Retinol Serum → skincare_face", () => {
  expect("The Ordinary Retinol 0.5% Serum", "personal_care", "skincare_face");
});
test("Cetaphil Gentle Skin Cleanser → skincare_face", () => {
  expect("Cetaphil Gentle Skin Cleanser", "personal_care", "skincare_face");
});
test("Aveeno Daily Moisturizing Body Lotion → skincare_body", () => {
  expect("Aveeno Daily Moisturizing Body Lotion", "personal_care", "skincare_body");
});

// ── Category tiebreakers ──
test("personal_care + generic Daily Moisturizer → skincare_body (fallback)", () => {
  expect("Daily Moisturizer", "personal_care", "skincare_body");
});

// ── Null / negative cases ──
test("empty name → null", () => {
  expect("", "personal_care", null);
});
test("null name → null", () => {
  expect(null, "personal_care", null);
});
test("food product → null (not a personal_care family)", () => {
  expect("Goldfish Crackers", "food", null);
});
test("unrecognized personal_care product → null", () => {
  expect("Glitter Body Shimmer", "personal_care", null);
});

// ── CANONICAL_FAMILIES consistency ──
// Every family returned by the classifier must be listed in the canonical
// array. This guards against silent drift between the classifier and the
// intel-card AI prompt, which both rely on CANONICAL_FAMILIES.
test("CANONICAL_FAMILIES covers every classifier return value", () => {
  const canon = new Set(CANONICAL_FAMILIES);
  const probes = [
    ["Armani Luminous Silk Foundation", "personal_care"],
    ["Tarte Shape Tape Concealer", "personal_care"],
    ["MAC Ruby Woo Lipstick", "personal_care"],
    ["Burt's Bees Lip Balm", "personal_care"],
    ["Maybelline Mascara", "personal_care"],
    ["Urban Decay Eyeshadow Palette", "personal_care"],
    ["NARS Orgasm Blush", "personal_care"],
    ["OPI Nail Polish", "personal_care"],
    ["Cutex Nail Polish Remover", "personal_care"],
    ["The Ordinary Retinol Serum", "personal_care"],
    ["CeraVe Eye Repair Cream", "personal_care"],
    ["Aveeno Body Lotion", "personal_care"],
    ["Neutrogena Sunscreen SPF 50", "personal_care"],
    ["Head & Shoulders Shampoo", "personal_care"],
    ["Pantene Conditioner", "personal_care"],
    ["Got2b Hairspray", "personal_care"],
    ["Dove Body Wash", "personal_care"],
    ["Dove Beauty Bar", "personal_care"],
    ["Native Deodorant", "personal_care"],
    ["Chanel No 5 Eau de Parfum", "personal_care"],
    ["Colgate Toothpaste", "personal_care"],
    ["Listerine Mouthwash", "personal_care"],
    ["Huggies Baby Wipes", "baby"],
    ["Aveeno Baby Lotion", "baby"],
    ["Johnson's Baby Shampoo", "personal_care"],
    ["Desitin Diaper Rash Cream", "baby"],
    ["Neosporin Antibiotic Ointment", "personal_care"],
    ["Gillette Shaving Cream", "personal_care"],
    ["Gillette Mach3 Razor", "personal_care"],
  ];
  const seen = new Set();
  for (const [name, cat] of probes) {
    const f = classifyProductFamily(name, null, cat);
    if (f) seen.add(f);
  }
  for (const fam of seen) {
    if (!canon.has(fam)) throw new Error(`classifier returned "${fam}" but it is missing from CANONICAL_FAMILIES`);
  }
  // Sanity: all 29 canonical families should be coverable by probes
  if (seen.size !== CANONICAL_FAMILIES.length) {
    const missing = CANONICAL_FAMILIES.filter(f => !seen.has(f));
    throw new Error(`probes did not hit every canonical family; missing: ${missing.join(", ")}`);
  }
});

// ── Summary ──
const total = passed + failed;
console.log(`\nproductFamilies tests: ${passed}/${total} passed`);
if (failed > 0) { for (const f of failures) console.log(`  ${f}`); process.exit(1); }
else { console.log("  All tests passed.\n"); process.exit(0); }
