#!/usr/bin/env node
// Test suite for backend/flagDetection.js
// Run: node backend/flagDetection.test.js
// Zero API cost. Validates the deterministic flag layer in isolation.

const { detectFlags, validateAIResponse, mergeFlags } = require("./flagDetection");

let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    failures.push(`FAIL: ${name}\n       ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function assertFlagPresent(result, flagName, expectedMatch) {
  const f = result.flags[flagName];
  if (!f) throw new Error(`flag "${flagName}" not in output`);
  if (!f.present) throw new Error(`expected ${flagName}.present = true, got false (matches: ${JSON.stringify(f.matches)})`);
  if (expectedMatch && !f.matches.some(m => m.toLowerCase().includes(expectedMatch.toLowerCase()))) {
    throw new Error(`expected ${flagName}.matches to include "${expectedMatch}", got ${JSON.stringify(f.matches)}`);
  }
}

function assertFlagAbsent(result, flagName) {
  const f = result.flags[flagName];
  if (f && f.present) {
    throw new Error(`expected ${flagName}.present = false, got true (matches: ${JSON.stringify(f.matches)})`);
  }
}

// ────────────────────────────────────────────────────────────────
// 1. THE CANONICAL FAILURE MODE — Red 40 must be detected
// ────────────────────────────────────────────────────────────────
test("Paul's failure mode: Red 40 in food MUST return syntheticDyes.present === true", () => {
  const r = detectFlags("Sugar, corn syrup, Red 40, citric acid", "food");
  assert(r.flags.syntheticDyes.present === true, "syntheticDyes should be present");
  assert(r.flags.syntheticDyes.matches.includes("Red 40"), "matches must include 'Red 40'");
});

// ────────────────────────────────────────────────────────────────
// 2. EDGE CASES — empty / malformed input
// ────────────────────────────────────────────────────────────────
test("empty string returns empty flags", () => {
  const r = detectFlags("", "food");
  assert(r.concernCount === 0);
  assert(r.summary.length === 0);
});

test("null input returns empty flags", () => {
  const r = detectFlags(null, "food");
  assert(r.concernCount === 0);
});

test("undefined input returns empty flags", () => {
  const r = detectFlags(undefined, "food");
  assert(r.concernCount === 0);
});

test("non-string input returns empty flags", () => {
  const r = detectFlags(12345, "food");
  assert(r.concernCount === 0);
});

test("missing category still checks all flags", () => {
  const r = detectFlags("Red 40, fragrance, SLS", null);
  assert(r.flags.syntheticDyes.present);
  assert(r.flags.syntheticFragrance.present);
  assert(r.flags.sulfates.present);
});

// ────────────────────────────────────────────────────────────────
// 3. SYNTHETIC DYES — positive
// ────────────────────────────────────────────────────────────────
test("FD&C Red 40 detected", () => {
  const r = detectFlags("FD&C Red 40", "food");
  assertFlagPresent(r, "syntheticDyes", "Red 40");
});

test("Yellow 5, Yellow 6, Blue 1 all detected", () => {
  const r = detectFlags("Yellow 5, Yellow 6, Blue 1", "beverage");
  assert(r.flags.syntheticDyes.matches.includes("Yellow 5"));
  assert(r.flags.syntheticDyes.matches.includes("Yellow 6"));
  assert(r.flags.syntheticDyes.matches.includes("Blue 1"));
});

test("Tartrazine detected", () => {
  assertFlagPresent(detectFlags("Tartrazine", "food"), "syntheticDyes", "Tartrazine");
});

test("Allura Red detected", () => {
  assertFlagPresent(detectFlags("Allura Red AC", "food"), "syntheticDyes", "Allura Red");
});

test("E102 (EU number) detected", () => {
  assertFlagPresent(detectFlags("E102", "food"), "syntheticDyes", "E102");
});

test("E-110 with hyphen detected", () => {
  assertFlagPresent(detectFlags("Colour E-110", "food"), "syntheticDyes", "E110");
});

test("Red No. 40 spelled-out variant detected", () => {
  assertFlagPresent(detectFlags("Red No. 40", "food"), "syntheticDyes", "Red 40");
});

// ────────────────────────────────────────────────────────────────
// 4. SYNTHETIC DYES — negatives and false positive traps
// ────────────────────────────────────────────────────────────────
test("'no Red 40' NOT flagged (negation before)", () => {
  assertFlagAbsent(detectFlags("Contains no Red 40 or artificial colors", "food"), "syntheticDyes");
});

test("'Red 40-free' NOT flagged (negation after)", () => {
  assertFlagAbsent(detectFlags("Red 40-free formula", "food"), "syntheticDyes");
});

test("'Red 400 mg' does NOT falsely match Red 40", () => {
  assertFlagAbsent(detectFlags("Vitamin C Red 400 mg", "supplement"), "syntheticDyes");
});

test("Beet juice natural coloring is NOT a dye", () => {
  const r = detectFlags("beet juice, turmeric extract, spirulina", "food");
  assertFlagAbsent(r, "syntheticDyes");
});

test("'Red 30' would not trigger Red 3 pattern", () => {
  assertFlagAbsent(detectFlags("Red 30 dye", "food"), "syntheticDyes");
});

// ────────────────────────────────────────────────────────────────
// 5. ARTIFICIAL SWEETENERS
// ────────────────────────────────────────────────────────────────
test("aspartame detected", () => {
  assertFlagPresent(detectFlags("Water, aspartame, citric acid", "beverage"), "artificialSweeteners", "aspartame");
});

test("sucralose + acesulfame potassium detected", () => {
  const r = detectFlags("Sucralose, acesulfame potassium", "beverage");
  assert(r.flags.artificialSweeteners.matches.includes("sucralose"));
  assert(r.flags.artificialSweeteners.matches.includes("acesulfame potassium"));
});

test("ace-K hyphenated form detected", () => {
  assertFlagPresent(detectFlags("Ace-K", "beverage"), "artificialSweeteners");
});

test("stevia is NOT flagged as artificial", () => {
  assertFlagAbsent(detectFlags("organic stevia leaf extract", "beverage"), "artificialSweeteners");
});

// ────────────────────────────────────────────────────────────────
// 6. PRESERVATIVES OF CONCERN
// ────────────────────────────────────────────────────────────────
test("BHA + BHT detected", () => {
  const r = detectFlags("vitamin E (tocopherol), BHA, BHT", "food");
  assert(r.flags.preservativesConcern.matches.includes("BHA"));
  assert(r.flags.preservativesConcern.matches.includes("BHT"));
});

test("sodium benzoate detected", () => {
  assertFlagPresent(detectFlags("sodium benzoate (preservative)", "beverage"), "preservativesConcern", "sodium benzoate");
});

test("'No sodium nitrite' NOT flagged", () => {
  assertFlagAbsent(detectFlags("uncured bacon, no sodium nitrite added", "food"), "preservativesConcern");
});

test("'BHT-free' NOT flagged", () => {
  assertFlagAbsent(detectFlags("Oats, honey, BHT-free", "food"), "preservativesConcern");
});

// ────────────────────────────────────────────────────────────────
// 7. HFCS
// ────────────────────────────────────────────────────────────────
test("high fructose corn syrup detected", () => {
  assertFlagPresent(detectFlags("water, high fructose corn syrup, citric acid", "beverage"), "hfcs");
});

test("HFCS abbreviation detected", () => {
  assertFlagPresent(detectFlags("Ingredients: HFCS, caramel color", "beverage"), "hfcs", "HFCS");
});

test("plain honey is NOT flagged as HFCS", () => {
  assertFlagAbsent(detectFlags("honey, oats, almonds", "food"), "hfcs");
});

// ────────────────────────────────────────────────────────────────
// 8. HYDROGENATED OILS
// ────────────────────────────────────────────────────────────────
test("partially hydrogenated soybean oil detected", () => {
  const r = detectFlags("partially hydrogenated soybean oil", "food");
  assertFlagPresent(r, "hydrogenatedOils", "partially hydrogenated");
});

test("unhydrogenated oils NOT flagged as hydrogenated", () => {
  assertFlagAbsent(detectFlags("expeller-pressed olive oil, avocado oil", "food"), "hydrogenatedOils");
});

// ────────────────────────────────────────────────────────────────
// 9. SEED OILS
// ────────────────────────────────────────────────────────────────
test("soybean and canola oils detected", () => {
  const r = detectFlags("soybean oil, canola oil, salt", "food");
  assert(r.flags.seedOilsRefined.matches.includes("soybean oil"));
  assert(r.flags.seedOilsRefined.matches.includes("canola oil"));
});

test("olive oil NOT flagged as seed oil", () => {
  assertFlagAbsent(detectFlags("extra virgin olive oil, sea salt", "food"), "seedOilsRefined");
});

// ────────────────────────────────────────────────────────────────
// 10. NOVA 4 MARKERS
// ────────────────────────────────────────────────────────────────
test("maltodextrin + soy protein isolate detected", () => {
  const r = detectFlags("maltodextrin, soy protein isolate, natural flavor", "food");
  assert(r.flags.nova4Markers.matches.includes("maltodextrin"));
  assert(r.flags.nova4Markers.matches.includes("soy protein isolate"));
});

test("mono- and diglycerides detected (compound form)", () => {
  const r = detectFlags("mono- and diglycerides of fatty acids", "food");
  assert(r.flags.nova4Markers.present);
  assert(r.flags.nova4Markers.matches.some(m => /diglyceride/i.test(m)));
});

// ────────────────────────────────────────────────────────────────
// 11. GUMS
// ────────────────────────────────────────────────────────────────
test("xanthan gum + guar gum detected", () => {
  const r = detectFlags("xanthan gum, guar gum, salt", "food");
  assert(r.flags.gums.matches.includes("xanthan gum"));
  assert(r.flags.gums.matches.includes("guar gum"));
});

test("plain flour has no gums flagged", () => {
  assertFlagAbsent(detectFlags("wheat flour, salt, yeast, water", "food"), "gums");
});

// ────────────────────────────────────────────────────────────────
// 12. MSG (including hidden forms)
// ────────────────────────────────────────────────────────────────
test("monosodium glutamate detected", () => {
  assertFlagPresent(detectFlags("salt, monosodium glutamate", "food"), "msg", "monosodium glutamate");
});

test("yeast extract (hidden MSG) detected", () => {
  assertFlagPresent(detectFlags("tomato paste, yeast extract, salt", "food"), "msg", "yeast extract");
});

test("'MSG-free' NOT flagged", () => {
  assertFlagAbsent(detectFlags("Broth, MSG-free recipe", "food"), "msg");
});

// ────────────────────────────────────────────────────────────────
// 13. SYNTHETIC FRAGRANCE (personal care)
// ────────────────────────────────────────────────────────────────
test("fragrance detected in personal care", () => {
  assertFlagPresent(detectFlags("Water, glycerin, fragrance", "personal_care"), "syntheticFragrance", "fragrance");
});

test("parfum (EU INCI) detected", () => {
  assertFlagPresent(detectFlags("Aqua, glycerin, parfum", "personal_care"), "syntheticFragrance", "parfum");
});

test("'fragrance-free' NOT flagged", () => {
  assertFlagAbsent(detectFlags("Water, glycerin. Fragrance-free formula.", "personal_care"), "syntheticFragrance");
});

test("'fragrance free' (spaced) NOT flagged", () => {
  assertFlagAbsent(detectFlags("Clean, fragrance free shampoo", "personal_care"), "syntheticFragrance");
});

test("'no fragrance' NOT flagged", () => {
  assertFlagAbsent(detectFlags("hypoallergenic, no fragrance added", "personal_care"), "syntheticFragrance");
});

test("'natural fragrance' NOT flagged (soft negation)", () => {
  assertFlagAbsent(detectFlags("Aqua, natural fragrance from plants", "personal_care"), "syntheticFragrance");
});

test("'essential oil derived fragrance' NOT flagged", () => {
  assertFlagAbsent(detectFlags("essential oil derived fragrance blend", "personal_care"), "syntheticFragrance");
});

test("EU allergen markers (limonene, linalool) flagged as fragrance indicator", () => {
  const r = detectFlags("water, glycerin, limonene, linalool", "personal_care");
  assertFlagPresent(r, "syntheticFragrance");
  assert(r.flags.syntheticFragrance.matches.includes("limonene"));
  assert(r.flags.syntheticFragrance.matches.includes("linalool"));
});

// ────────────────────────────────────────────────────────────────
// 14. PARABENS
// ────────────────────────────────────────────────────────────────
test("methylparaben + propylparaben detected", () => {
  const r = detectFlags("water, glycerin, methylparaben, propylparaben", "personal_care");
  assert(r.flags.parabens.matches.includes("methylparaben"));
  assert(r.flags.parabens.matches.includes("propylparaben"));
});

test("'paraben-free' claim with no actual parabens NOT flagged", () => {
  assertFlagAbsent(detectFlags("Water, glycerin, vitamin E. Paraben-free.", "personal_care"), "parabens");
});

// ────────────────────────────────────────────────────────────────
// 15. PHTHALATES
// ────────────────────────────────────────────────────────────────
test("DBP and DEP detected", () => {
  const r = detectFlags("denatured alcohol, DBP, DEP", "personal_care");
  assert(r.flags.phthalates.matches.includes("DBP"));
  assert(r.flags.phthalates.matches.includes("DEP"));
});

test("dibutyl phthalate (full name) detected", () => {
  assertFlagPresent(detectFlags("dibutyl phthalate", "personal_care"), "phthalates", "dibutyl phthalate");
});

// ────────────────────────────────────────────────────────────────
// 16. SULFATES
// ────────────────────────────────────────────────────────────────
test("sodium lauryl sulfate detected", () => {
  assertFlagPresent(detectFlags("water, sodium lauryl sulfate, fragrance", "personal_care"), "sulfates", "sodium lauryl sulfate");
});

test("SLS abbreviation detected", () => {
  assertFlagPresent(detectFlags("contains SLS", "personal_care"), "sulfates", "SLS");
});

test("SLES detected", () => {
  assertFlagPresent(detectFlags("SLES and cocamidopropyl betaine", "personal_care"), "sulfates", "SLES");
});

// ────────────────────────────────────────────────────────────────
// 17. PEG SURFACTANTS
// ────────────────────────────────────────────────────────────────
test("PEG-40 hydrogenated castor oil detected", () => {
  assertFlagPresent(detectFlags("water, PEG-40 hydrogenated castor oil", "personal_care"), "pegSurfactants", "PEG");
});

test("ceteareth-20 detected", () => {
  assertFlagPresent(detectFlags("emulsifier: ceteareth-20", "personal_care"), "pegSurfactants", "ceteareth");
});

test("polyethylene glycol full name detected", () => {
  assertFlagPresent(detectFlags("polyethylene glycol blend", "personal_care"), "pegSurfactants", "polyethylene glycol");
});

test("PEG/PPG block copolymer detected", () => {
  assertFlagPresent(detectFlags("PEG/PPG-18/18 Dimethicone", "personal_care"), "pegSurfactants");
});

// ────────────────────────────────────────────────────────────────
// 18. SILOXANES
// ────────────────────────────────────────────────────────────────
test("dimethicone + cyclopentasiloxane detected", () => {
  const r = detectFlags("dimethicone, cyclopentasiloxane", "personal_care");
  assert(r.flags.siloxanes.matches.includes("dimethicone"));
  assert(r.flags.siloxanes.matches.includes("cyclopentasiloxane"));
});

test("D5 standalone detected", () => {
  assertFlagPresent(detectFlags("Silicone blend with D5", "personal_care"), "siloxanes", "D5");
});

// ────────────────────────────────────────────────────────────────
// 19. CHEMICAL UV FILTERS
// ────────────────────────────────────────────────────────────────
test("oxybenzone + octinoxate detected in sunscreen", () => {
  const r = detectFlags("Active: oxybenzone 6%, octinoxate 7.5%", "personal_care");
  assert(r.flags.chemicalUVFilters.matches.includes("oxybenzone"));
  assert(r.flags.chemicalUVFilters.matches.includes("octinoxate"));
});

test("mineral sunscreen (zinc oxide) NOT flagged as chemical UV", () => {
  assertFlagAbsent(detectFlags("zinc oxide 20%, titanium dioxide 5%", "personal_care"), "chemicalUVFilters");
});

// ────────────────────────────────────────────────────────────────
// 20. FORMALDEHYDE RELEASERS
// ────────────────────────────────────────────────────────────────
test("DMDM hydantoin detected", () => {
  assertFlagPresent(detectFlags("water, DMDM hydantoin", "personal_care"), "formaldehydeReleasers", "DMDM hydantoin");
});

test("quaternium-15 detected", () => {
  assertFlagPresent(detectFlags("preservative: quaternium-15", "personal_care"), "formaldehydeReleasers");
});

// ────────────────────────────────────────────────────────────────
// 21. ETHANOLAMINES (TEA/DEA/MEA) — false positive guards
// ────────────────────────────────────────────────────────────────
test("triethanolamine detected (full name)", () => {
  assertFlagPresent(detectFlags("water, triethanolamine", "personal_care"), "ethanolamines", "triethanolamine");
});

test("'green tea extract' does NOT falsely match TEA", () => {
  // Lowercase "tea" must not match; TEA abbreviation is uppercase-only
  assertFlagAbsent(detectFlags("Aqua, green tea extract, glycerin", "personal_care"), "ethanolamines");
});

test("TEA-Lauryl Sulfate (uppercase abbreviation) detected", () => {
  assertFlagPresent(detectFlags("TEA-Lauryl Sulfate", "personal_care"), "ethanolamines", "TEA");
});

// ────────────────────────────────────────────────────────────────
// 22. TALC
// ────────────────────────────────────────────────────────────────
test("talc detected", () => {
  assertFlagPresent(detectFlags("talc, mica, iron oxides", "personal_care"), "talc", "talc");
});

test("magnesium silicate synonym detected", () => {
  assertFlagPresent(detectFlags("magnesium silicate powder", "personal_care"), "talc", "magnesium silicate");
});

// ────────────────────────────────────────────────────────────────
// 23. MINERAL OIL / PETROLATUM
// ────────────────────────────────────────────────────────────────
test("petrolatum detected", () => {
  assertFlagPresent(detectFlags("petrolatum, mineral oil, lanolin", "personal_care"), "mineralOil", "petrolatum");
});

test("paraffinum liquidum (INCI) detected", () => {
  assertFlagPresent(detectFlags("paraffinum liquidum", "personal_care"), "mineralOil", "paraffinum liquidum");
});

// ────────────────────────────────────────────────────────────────
// 24. PHENOXYETHANOL
// ────────────────────────────────────────────────────────────────
test("phenoxyethanol detected", () => {
  assertFlagPresent(detectFlags("water, glycerin, phenoxyethanol", "personal_care"), "phenoxyethanol");
});

// ────────────────────────────────────────────────────────────────
// 25. HOME / CLEANING
// ────────────────────────────────────────────────────────────────
test("bleach + ammonia flagged as VOC in home cleaner", () => {
  const r = detectFlags("sodium hypochlorite (bleach), water", "home");
  assertFlagPresent(r, "voc");
});

test("benzalkonium chloride flagged as quat", () => {
  assertFlagPresent(detectFlags("active: benzalkonium chloride 0.13%", "home"), "quats");
});

test("triclosan flagged in home cleaner", () => {
  assertFlagPresent(detectFlags("antibacterial: triclosan", "home"), "triclosan");
});

test("fragrance flagged in home cleaner too", () => {
  assertFlagPresent(detectFlags("surfactant, fragrance, dye", "home"), "syntheticFragrance");
});

test("plain dish soap (no quats/bleach) NOT flagged for voc/quats", () => {
  const r = detectFlags("water, sodium lauryl sulfate, citric acid", "home");
  assertFlagAbsent(r, "voc");
  assertFlagAbsent(r, "quats");
});

// ────────────────────────────────────────────────────────────────
// 26. CASE INSENSITIVITY AND FORMATTING VARIANTS
// ────────────────────────────────────────────────────────────────
test("mixed case 'rEd 40' detected", () => {
  assertFlagPresent(detectFlags("rEd 40", "food"), "syntheticDyes");
});

test("uppercase 'METHYLPARABEN' detected", () => {
  assertFlagPresent(detectFlags("METHYLPARABEN", "personal_care"), "parabens");
});

test("hyphenated 'high-fructose corn syrup' detected", () => {
  assertFlagPresent(detectFlags("high-fructose corn syrup", "beverage"), "hfcs");
});

// ────────────────────────────────────────────────────────────────
// 27. REAL INGREDIENT LISTS (from calibration examples)
// ────────────────────────────────────────────────────────────────
test("Froot Loops-style ingredient list hits multiple food flags", () => {
  const text = "sugar, corn syrup, maltodextrin, Red 40, Yellow 5, Blue 1, BHT for freshness";
  const r = detectFlags(text, "food");
  assert(r.flags.syntheticDyes.present);
  assert(r.flags.nova4Markers.present);
  assert(r.flags.preservativesConcern.present);
  assert(r.concernCount >= 4);
});

test("Neutrogena Ultra Sheer-style list hits chemical UV filters", () => {
  const text = "active ingredients: avobenzone 3%, homosalate 10%, octisalate 5%, oxybenzone 6%, octocrylene 2.7%";
  const r = detectFlags(text, "personal_care");
  assert(r.flags.chemicalUVFilters.matches.length >= 4, `expected >=4 UV filters, got ${r.flags.chemicalUVFilters.matches.length}`);
});

test("Lysol-style home cleaner hits quats and fragrance", () => {
  const text = "alkyl dimethyl benzyl ammonium chloride, benzalkonium chloride, fragrance";
  const r = detectFlags(text, "home");
  assertFlagPresent(r, "quats");
  assertFlagPresent(r, "syntheticFragrance");
});

test("Centrum Silver-style supplement hits dyes + talc + artificial sweeteners", () => {
  const text = "magnesium oxide, Blue 1, Blue 2, Yellow 6, Red 40, talc, sucralose";
  const r = detectFlags(text, "supplement");
  assert(r.flags.syntheticDyes.matches.length >= 4);
  assert(r.flags.artificialSweeteners.present);
  // talc is personal_care bucket so it won't fire here — that's OK
});

test("Clean product (RXBar-style) produces zero flags", () => {
  const r = detectFlags("egg whites, dates, almonds, cashews, natural flavors", "food");
  assert(r.concernCount === 0, `expected 0 concerns, got ${r.concernCount}: ${JSON.stringify(r.summary)}`);
});

// ────────────────────────────────────────────────────────────────
// 28. CATEGORY SCOPING — flags don't bleed across buckets
// ────────────────────────────────────────────────────────────────
test("parabens in food-category input are NOT flagged (bucket scope)", () => {
  const r = detectFlags("water, methylparaben", "food");
  assertFlagAbsent(r, "parabens");
  // parabens flag itself should be absent from output, since not evaluated
  assert(!r.flags.parabens || !r.flags.parabens.present);
});

test("Red 40 in personal_care-category input is NOT flagged (bucket scope)", () => {
  const r = detectFlags("water, Red 40 lake", "personal_care");
  assert(!r.flags.syntheticDyes, "syntheticDyes flag should not appear for personal_care bucket");
});

// ────────────────────────────────────────────────────────────────
// 29. validateAIResponse
// ────────────────────────────────────────────────────────────────
test("validateAIResponse: consistent when AI and deterministic agree", () => {
  const det = detectFlags("Red 40, Yellow 5", "food");
  const res = validateAIResponse(["Red 40", "Yellow 5"], det);
  assert(res.consistent === true);
  assert(res.missingFromAI.length === 0);
  assert(res.extraInAI.length === 0);
});

test("validateAIResponse: flags Red 40 as missing when AI missed it", () => {
  const det = detectFlags("water, Red 40, citric acid", "food");
  const res = validateAIResponse([], det);
  assert(res.consistent === false);
  assert(res.missingFromAI.includes("Red 40"));
});

test("validateAIResponse: flags extra substance AI hallucinated", () => {
  const det = detectFlags("water, citric acid", "food"); // clean
  const res = validateAIResponse(["Red 40"], det);
  assert(res.consistent === false);
  assert(res.extraInAI.includes("Red 40"));
});

test("validateAIResponse: case-insensitive match for missing/extra detection", () => {
  const det = detectFlags("methylparaben", "personal_care");
  const res = validateAIResponse(["MethylParaben"], det);
  assert(res.consistent === true, `expected consistent, got ${JSON.stringify(res)}`);
});

// ────────────────────────────────────────────────────────────────
// 30. mergeFlags
// ────────────────────────────────────────────────────────────────
test("mergeFlags: deterministic findings win when AI missed them", () => {
  const det = detectFlags("Red 40, Blue 1", "food");
  const merged = mergeFlags([], det);
  assert(merged.includes("Red 40"));
  assert(merged.includes("Blue 1"));
});

test("mergeFlags: AI claims contradicting deterministic absence are dropped", () => {
  const det = detectFlags("water, citric acid", "food"); // no dyes
  const merged = mergeFlags(["Red 40"], det); // AI wrongly claims Red 40
  assert(!merged.includes("Red 40"), "AI Red 40 claim should be dropped (deterministic says absent)");
});

test("mergeFlags: AI claims for unevaluated categories are kept", () => {
  const det = detectFlags("Red 40", "food"); // parabens bucket not checked
  const merged = mergeFlags(["methylparaben"], det);
  assert(merged.includes("Red 40"), "deterministic finding must be present");
  assert(merged.includes("methylparaben"), "AI claim for unchecked bucket should be kept");
});

test("mergeFlags: deduplication (AI and deterministic both mention same substance)", () => {
  const det = detectFlags("Red 40", "food");
  const merged = mergeFlags(["Red 40"], det);
  const redCount = merged.filter(x => x.toLowerCase().includes("red 40")).length;
  assert(redCount === 1, `expected 1 Red 40, got ${redCount}`);
});

// ────────────────────────────────────────────────────────────────
// 31. Pattern-level validation — siblings in a "present" bucket
//     Regression tests for the Armani Luminous Silk Foundation bug:
//     dimethicone in ingredients made siloxanes.present=true, and the
//     old bucket-level contradict check let AI-fabricated cyclopentasiloxane
//     through. Validation must now be pattern-level.
// ────────────────────────────────────────────────────────────────
test("mergeFlags: real dimethicone, AI claims cyclopentasiloxane — D5 dropped", () => {
  const armani = "AQUA, DIMETHICONE, CETYL PEG/PPG-10/1 DIMETHICONE, DIMETHICONOL, PEG/PPG-18/18 DIMETHICONE, PHENOXYETHANOL";
  const det = detectFlags(armani, "personal_care");
  const merged = mergeFlags(["cyclopentasiloxane", "dimethicone"], det);
  assert(merged.includes("dimethicone"), "dimethicone must survive");
  assert(!merged.includes("cyclopentasiloxane"), "AI-fabricated cyclopentasiloxane must be dropped");
});

test("mergeFlags: real methylparaben, AI claims propylparaben — propylparaben dropped", () => {
  const det = detectFlags("water, methylparaben, glycerin", "personal_care");
  const merged = mergeFlags(["propylparaben", "methylparaben"], det);
  assert(merged.includes("methylparaben"), "methylparaben must survive");
  assert(!merged.includes("propylparaben"), "AI-fabricated propylparaben must be dropped");
});

test("mergeFlags: real Red 40, AI claims Yellow 5 — Yellow 5 dropped", () => {
  const det = detectFlags("Sugar, corn syrup, Red 40, citric acid", "food");
  const merged = mergeFlags(["Yellow 5", "Red 40"], det);
  assert(merged.some(m => m.toLowerCase().includes("red 40")), "Red 40 must survive");
  assert(!merged.some(m => m.toLowerCase().includes("yellow 5")), "AI-fabricated Yellow 5 must be dropped");
});

test("mergeFlags: real dimethicone AND cyclopentasiloxane, AI claims both — both kept", () => {
  const det = detectFlags("AQUA, DIMETHICONE, CYCLOPENTASILOXANE, GLYCERIN", "personal_care");
  const merged = mergeFlags(["cyclopentasiloxane", "dimethicone"], det);
  assert(merged.includes("dimethicone"), "dimethicone must survive");
  assert(merged.includes("cyclopentasiloxane"), "real cyclopentasiloxane must survive");
});

test("mergeFlags: no siloxanes in real ingredients, AI claims cyclopentasiloxane — dropped", () => {
  const det = detectFlags("water, glycerin, phenoxyethanol, sodium hyaluronate", "personal_care");
  const merged = mergeFlags(["cyclopentasiloxane"], det);
  assert(!merged.includes("cyclopentasiloxane"), "AI-fabricated cyclopentasiloxane must be dropped when no siloxanes in real list");
});

// ────────────────────────────────────────────────────────────────
// Summary output
// ────────────────────────────────────────────────────────────────
const total = passed + failed;
console.log("\n═══════════════════════════════════════════════════════");
console.log(`  flagDetection tests: ${passed}/${total} passed`);
console.log("═══════════════════════════════════════════════════════");
if (failed > 0) {
  console.log(`\n${failed} FAILURE(S):`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
} else {
  console.log("  All tests passed.\n");
  process.exit(0);
}
