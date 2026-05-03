// backend/personalCareScorer.js
//
// Deterministic scorer for personal care products.
// Mirrors the architectural pattern of textileScorer.js, adapted for
// INCI-list ingredient data instead of fiber composition percentages.
//
// Consumes PERSONAL_CARE_INGREDIENTS from personalCareIngredients.js.

const {
  PERSONAL_CARE_INGREDIENTS,
  PERSONAL_CARE_ALIASES,
  lookupIngredient,
} = require("./personalCareIngredients");

// ─────────────────────────────────────────────────────────
// PRODUCT CATEGORY EXPOSURE PROFILES
// ─────────────────────────────────────────────────────────
// Use Frequency dimension is driven by how the product is applied,
// not by ingredients. Leave-on products produce sustained skin contact;
// rinse-off products are washed away in seconds.
const EXPOSURE_PROFILES = {
  // Leave-on, full-day exposure
  lotion:           { use_frequency_score: 7, is_leave_on: true,  label: "Body lotion (leave-on)" },
  face_cream:       { use_frequency_score: 7, is_leave_on: true,  label: "Face cream (leave-on)" },
  serum:            { use_frequency_score: 7, is_leave_on: true,  label: "Serum (leave-on)" },
  sunscreen:        { use_frequency_score: 8, is_leave_on: true,  label: "Sunscreen (leave-on, large surface)" },
  deodorant:        { use_frequency_score: 7, is_leave_on: true,  label: "Deodorant (leave-on, sensitive area)" },
  lip_product:      { use_frequency_score: 8, is_leave_on: true,  label: "Lip product (leave-on, ingestion route)" },
  makeup:           { use_frequency_score: 6, is_leave_on: true,  label: "Makeup (leave-on)" },
  // Brief contact, rinsed away
  shampoo:          { use_frequency_score: 4, is_leave_on: false, label: "Shampoo (rinse-off)" },
  conditioner:      { use_frequency_score: 5, is_leave_on: false, label: "Conditioner (rinse-off, longer contact)" },
  body_wash:        { use_frequency_score: 4, is_leave_on: false, label: "Body wash (rinse-off)" },
  face_cleanser:    { use_frequency_score: 4, is_leave_on: false, label: "Face cleanser (rinse-off)" },
  toothpaste:       { use_frequency_score: 5, is_leave_on: false, label: "Toothpaste (rinse-off, oral mucosa)" },
  hand_soap:        { use_frequency_score: 3, is_leave_on: false, label: "Hand soap (rinse-off, brief)" },
  // Default fallback
  unknown:          { use_frequency_score: 5, is_leave_on: true,  label: "Personal care product" },
};

// ─────────────────────────────────────────────────────────
// POSITION WEIGHT CURVE
// ─────────────────────────────────────────────────────────
// INCI lists order ingredients by descending concentration above 1%.
// Below 1% (typically the bottom half of long lists), order is not
// concentration-meaningful. We weight the top positions heavily and
// flatten the tail.
function positionWeight(positionIndex) {
  // 0-indexed position
  if (positionIndex === 0) return 1.0;   // first ingredient
  if (positionIndex === 1) return 0.85;
  if (positionIndex === 2) return 0.70;
  if (positionIndex === 3) return 0.55;
  if (positionIndex === 4) return 0.45;
  if (positionIndex < 8)   return 0.30;  // positions 5-7
  if (positionIndex < 15)  return 0.15;  // positions 8-14
  return 0.05;                            // tail
}

// ─────────────────────────────────────────────────────────
// PARSE INGREDIENT LIST
// ─────────────────────────────────────────────────────────
// Takes either a raw INCI string ("Water, Sodium Laureth Sulfate, ...")
// or a pre-split array. Returns [{position, raw, key, entry}] for each
// ingredient, with key/entry only populated for matched ingredients.
function parseIngredients(input) {
  if (!input) return [];
  let rawList;
  if (Array.isArray(input)) {
    rawList = input;
  } else if (typeof input === "string") {
    // Pre-strip ALL percentages from input before splitting.
    // This prevents periods inside decimal percentages (2.7%, 7.5%, 4.5%)
    // from shattering ingredients when we split on period delimiters
    // separating Active/Inactive sections.
    const stripped = input.replace(/\d+(\.\d+)?\s*%/g, "");
    // Now split on commas, semicolons, AND periods (Active/Inactive
    // sections on US OTC labels are period-separated)
    rawList = stripped.split(/[,;.]+/).map((s) => s.trim()).filter(Boolean);
  } else {
    return [];
  }
  return rawList.map((raw, position) => {
    let cleaned = raw.toLowerCase()
      .replace(/[*†‡()[\]]/g, "")
      .trim();
    // Strip "Active:" / "Inactive:" / "Other ingredients:" headers
    cleaned = cleaned.replace(/^(active|inactive|other\s+ingredients?)\s*(ingredients?)?\s*:\s*/i, "");
    cleaned = cleaned.trim();
    const matched = lookupIngredient(cleaned);
    return {
      position,
      raw,
      key: matched ? matched.key : null,
      entry: matched ? matched.entry : null,
    };
  });
}

// ─────────────────────────────────────────────────────────
// CORE SCORING
// ─────────────────────────────────────────────────────────
function scoreIngredients(parsed, options = {}) {
  const {
    kidMode = false,
    pregnancyMode = false,
    productCategory = "unknown",
  } = options;

  const exposureProfile = EXPOSURE_PROFILES[productCategory] || EXPOSURE_PROFILES.unknown;

  // Filter to matched ingredients only — these drive the score.
  // Unmatched ingredients are presumed low-concern fillers.
  const matched = parsed.filter((p) => p.entry !== null);
  const totalIngredients = parsed.length;
  const matchedCount = matched.length;

  // Confidence calculation
  const topTenMatches = parsed.slice(0, 10).filter((p) => p.entry !== null).length;
  const hasHighConcernMatch = matched.some((p) => p.entry.base_hazard_score >= 7);
  let confidence = "low";
  if (topTenMatches >= 3 || hasHighConcernMatch) confidence = "high";
  else if (topTenMatches >= 1) confidence = "medium";

  // If no matches at all, return null and let cascade handle it
  if (matchedCount === 0) {
    return {
      score: null,
      confidence: "none",
      reason: "no_calibration_matches",
      total_ingredients: totalIngredients,
      matched_count: 0,
    };
  }

  // ─────────────────────────────────────────────────────────
  // INGREDIENT HAZARD DIMENSION
  // ─────────────────────────────────────────────────────────
  // Position-weighted average of base_hazard_score across matched.
  let weightedHazardSum = 0;
  let weightSum = 0;
  for (const m of matched) {
    const w = positionWeight(m.position);
    weightedHazardSum += m.entry.base_hazard_score * w;
    weightSum += w;
  }
  let hazardRaw = weightSum > 0 ? weightedHazardSum / weightSum : 5;

  // Apply mode floors: any matched ingredient with kid_score_floor or
  // pregnancy_score_floor pushes the dimension up to that floor when
  // the relevant mode is active.
  let hazardFloor = 0;
  let floorTriggeredBy = null;
  for (const m of matched) {
    if (kidMode && m.entry.kid_concern && m.entry.kid_score_floor) {
      if (m.entry.kid_score_floor > hazardFloor) {
        hazardFloor = m.entry.kid_score_floor;
        floorTriggeredBy = { ingredient: m.entry.inci_name, mode: "kid", floor: m.entry.kid_score_floor };
      }
    }
    if (pregnancyMode && m.entry.pregnancy_concern && m.entry.pregnancy_score_floor) {
      if (m.entry.pregnancy_score_floor > hazardFloor) {
        hazardFloor = m.entry.pregnancy_score_floor;
        floorTriggeredBy = { ingredient: m.entry.inci_name, mode: "pregnancy", floor: m.entry.pregnancy_score_floor };
      }
    }
  }
  const hazardScore = Math.max(hazardRaw, hazardFloor);

  // ─────────────────────────────────────────────────────────
  // SKIN ABSORPTION DIMENSION
  // ─────────────────────────────────────────────────────────
  // Position-weighted hazard times skin_absorption_modifier per ingredient.
  // High-absorption + high-hazard combinations dominate.
  let absorptionWeightedSum = 0;
  let absorptionWeightSum = 0;
  for (const m of matched) {
    const w = positionWeight(m.position);
    const absorptionAdjusted = m.entry.base_hazard_score * (m.entry.skin_absorption_modifier ?? 0.5);
    absorptionWeightedSum += absorptionAdjusted * w;
    absorptionWeightSum += w;
  }
  let absorptionRaw = absorptionWeightSum > 0 ? absorptionWeightedSum / absorptionWeightSum : 3;
  // Scale up to 1-10 range (since multiplying by <1 modifier compressed it)
  absorptionRaw = absorptionRaw * 1.4;
  const absorptionScore = Math.min(10, Math.max(1, absorptionRaw));

  // ─────────────────────────────────────────────────────────
  // USE FREQUENCY DIMENSION
  // ─────────────────────────────────────────────────────────
  // Product-category-driven; modulated slightly by hazard presence.
  // Leave-on products with high-hazard ingredients amplify; rinse-off
  // products with the same ingredients dampen.
  let useFrequencyScore = exposureProfile.use_frequency_score;
  if (hasHighConcernMatch && exposureProfile.is_leave_on) {
    useFrequencyScore = Math.min(10, useFrequencyScore + 1);
  }

  // ─────────────────────────────────────────────────────────
  // OVERALL SCORE
  // ─────────────────────────────────────────────────────────
  // Weighted combination: hazard dominates, absorption modulates,
  // use frequency contextualizes. Hard floors override.
  const overallRaw = (hazardScore * 0.55) + (absorptionScore * 0.30) + (useFrequencyScore * 0.15);
  let overallScore = Math.max(overallRaw, hazardFloor);
  overallScore = Math.min(10, Math.max(1, overallScore));

  // Round to 1 decimal for precise, integer for display
  const preciseScore = Math.round(overallScore * 10) / 10;
  const score = Math.round(overallScore);

  return {
    score,
    precise_score: preciseScore,
    confidence,
    ingredient_hazard_score: Math.round(Math.min(10, Math.max(1, hazardScore))),
    skin_absorption_score: Math.round(absorptionScore),
    use_frequency_score: Math.round(useFrequencyScore),
    matched_ingredients: matched.map((m) => ({
      position: m.position,
      key: m.key,
      inci_name: m.entry.inci_name,
      hazard_score: m.entry.base_hazard_score,
      hazard_class: m.entry.hazard_class,
    })),
    total_ingredients: totalIngredients,
    matched_count: matchedCount,
    breakdown: {
      hazard_raw: Math.round(hazardRaw * 100) / 100,
      hazard_floor: hazardFloor,
      absorption_raw: Math.round(absorptionRaw * 100) / 100,
      use_frequency_raw: exposureProfile.use_frequency_score,
      product_category: productCategory,
      exposure_profile_label: exposureProfile.label,
      is_leave_on: exposureProfile.is_leave_on,
      top_ten_matches: topTenMatches,
      has_high_concern_match: hasHighConcernMatch,
    },
    floor_triggered_by: floorTriggeredBy,
    kid_mode: kidMode,
    pregnancy_mode: pregnancyMode,
  };
}

// ─────────────────────────────────────────────────────────
// INGREDIENT RECEIPT TABLE
// ─────────────────────────────────────────────────────────
// Returns a one-line receipt for a calibration entry, citing the specific
// regulation or finding that drives the hazard score. Matches Sara's
// "receipts over claims" voice rule.
function getIngredientReceipt(entry) {
  const receipts = {
    oxybenzone: "Hawaii banned it in sunscreens. EU dropped the cap to 2.2%.",
    octinoxate: "Banned in Hawaii alongside oxybenzone. EU under review for endocrine concerns.",
    octocrylene: "Degrades into benzophenone over time. Prop 65 listed.",
    homosalate: "EU restricted to facial 7.34% effective 2025.",
    octisalate: "Plasma levels ten times the FDA threshold per the agency's own study.",
    avobenzone: "Photo-unstable. Usually paired with octocrylene to stabilize.",
    zinc_oxide: "FDA Category I. The mineral filter regulators trust.",
    methylparaben: "EU restricted in kid products under three. Endocrine activity documented.",
    propylparaben: "EU restricted. Stronger endocrine signal than methylparaben.",
    butylparaben: "EU concentration limit. Listed in California Prop 65 review.",
    ethylparaben: "Generally lower concern of the parabens, still EU restricted in kid products.",
    isobutylparaben: "EU restricted concentration. Endocrine disruption documented.",
    diethyl_phthalate: "Linked to endocrine disruption. Hidden under fragrance disclosures.",
    dibutyl_phthalate: "EU prohibits in cosmetics. Reproductive toxicant per CLP.",
    diethylhexyl_phthalate: "Banned in EU cosmetics. Strong endocrine and reproductive concerns.",
    benzyl_butyl_phthalate: "EU prohibits in cosmetics. Prop 65 listed.",
    diisobutyl_phthalate: "EU restricted. Reproductive toxicant.",
    dimethyl_phthalate: "Lower concern of the phthalate family. Still hidden under fragrance.",
    di_n_hexyl_phthalate: "Reproductive toxicant. EU prohibits in cosmetics.",
    dmdm_hydantoin: "Releases formaldehyde. EU now requires warning labels.",
    quaternium_15: "Strongest formaldehyde releaser. EU phase-out 2024-2026.",
    imidazolidinyl_urea: "Formaldehyde donor. Common contact allergen.",
    diazolidinyl_urea: "Releases formaldehyde. Banned in EU children's products.",
    sodium_hydroxymethylglycinate: "Formaldehyde donor marketed as gentler. Same mechanism.",
    sodium_lauryl_sulfate: "Common irritant. Not the carcinogen the internet claims.",
    sodium_laureth_sulfate: "Carries 1,4-dioxane contamination from the manufacturing process.",
    ammonium_lauryl_sulfate: "Same irritation profile as SLS. Same regulatory treatment.",
    cocamide_dea: "IARC possibly carcinogenic. California Prop 65 listed since 2012.",
    cocamide_mea: "Lower concern than cocamide DEA. Still forms nitrosamines with certain preservatives.",
    tea_lauryl_sulfate: "Forms NDELA carcinogen with formaldehyde donors in the same formula.",
    sodium_coco_sulfate: "Mostly SLS in coconut clothing. The natural marketing hides the chemistry.",
    phenoxyethanol: "Generally fine at the EU 1% cap. France advises against on diaper area under three.",
    methylisothiazolinone: "EU banned in leave-on products. Drove a global contact dermatitis epidemic.",
    methylchloroisothiazolinone: "EU restricts to rinse-off only. Major contact allergen.",
    triclosan: "FDA banned from consumer soaps in 2016. Still in some toothpaste.",
    triclocarban: "FDA banned from consumer soaps alongside triclosan. Endocrine disruptor.",
    benzyl_alcohol: "Generally low concern. EU declared fragrance allergen above threshold.",
    petrolatum: "Safe at USP grade. Concerning when contamination controls are weak.",
    mineral_oil: "Same as petrolatum. EU MOAH framework targets the contamination, not the parent.",
    talc: "IARC reclassified to Group 2A in 2024. J&J pulled the baby powder.",
    peg: "Carries the same 1,4-dioxane contamination concern as SLES.",
    propylene_glycol: "Mostly fine. Can sensitize at high concentrations.",
    retinoids: "EU classified reproductive toxicant 1B. Skip during pregnancy.",
    retinol: "EU classified reproductive toxicant 1B. Skip during pregnancy.",
    salicylic_acid: "OK at low concentrations. EU restricted in kid products under three.",
    hydroquinone: "FDA pulled from OTC in 2020. Prescription only.",
    benzoyl_peroxide: "Degrades into benzene. FDA recalled six products in March 2025.",
    azelaic_acid: "ACOG-pregnancy-safe. The rare effective active without major concerns.",
    fragrance: "Hides anywhere from one to a hundred chemicals. EU now declares 80 individual allergens.",
    limonene: "Citrus fragrance allergen. Oxidizes into a stronger allergen after opening.",
    linalool: "Lavender and floral fragrance allergen. Same oxidation story as limonene.",
    cinnamal: "Strongest of the EU declared fragrance allergens. Cinnamon's primary irritant.",
  };

  const aliases = (entry.aliases || []).map(a => a.toLowerCase());
  const inciLower = (entry.inci_name || "").toLowerCase();
  for (const [k, v] of Object.entries(receipts)) {
    const kSpaced = k.replace(/_/g, " ");
    if (aliases.includes(kSpaced) || aliases.includes(k) || inciLower === kSpaced || inciLower === k) {
      return v;
    }
  }
  return `${(entry.hazard_class || "ingredient").replace(/_/g, " ")} concern documented in regulatory record.`;
}

// ─────────────────────────────────────────────────────────
// EXPLANATION BUILDER
// ─────────────────────────────────────────────────────────
function buildExplanation(parsed, scoreResult, options = {}) {
  const { kidMode = false, pregnancyMode = false } = options;
  if (!scoreResult || scoreResult.score === null) {
    return "Not enough recognized ingredients to score this one. The label might be incomplete.";
  }

  const matched = parsed.filter((p) => p.entry !== null);
  const sortedByPosition = [...matched].sort((a, b) => a.position - b.position);
  const dominantConcerns = sortedByPosition
    .filter((m) => m.entry.base_hazard_score >= 6)
    .slice(0, 3);

  const parts = [];

  if (dominantConcerns.length === 0 && matched.length > 0) {
    parts.push(`${matched.length} ingredient${matched.length === 1 ? "" : "s"} flagged. All lower concern. Nothing the label is hiding.`);
  } else if (dominantConcerns.length === 1) {
    const c = dominantConcerns[0];
    parts.push(`One ingredient flagged: ${c.entry.inci_name}. ${getIngredientReceipt(c.entry)}`);
  } else if (dominantConcerns.length === 2) {
    const [a, b] = dominantConcerns;
    parts.push(`Two ingredients worth knowing. ${a.entry.inci_name}. ${getIngredientReceipt(a.entry)} ${b.entry.inci_name}. ${getIngredientReceipt(b.entry)}`);
  } else if (dominantConcerns.length >= 3) {
    const [a, b, c] = dominantConcerns;
    parts.push(`Three ingredients worth knowing. ${a.entry.inci_name}. ${getIngredientReceipt(a.entry)} ${b.entry.inci_name}. ${getIngredientReceipt(b.entry)} ${c.entry.inci_name}. ${getIngredientReceipt(c.entry)}`);
  }

  if (scoreResult.floor_triggered_by) {
    const f = scoreResult.floor_triggered_by;
    const dominantReceipts = dominantConcerns.map(c => getIngredientReceipt(c.entry).toLowerCase()).join(" ");

    if (f.mode === "kid") {
      if (!dominantReceipts.includes("kid product") && !dominantReceipts.includes("under three")) {
        parts.push(`Kid mode floors the score at ${f.floor} on ${f.ingredient}.`);
      }
    } else if (f.mode === "pregnancy") {
      if (!dominantReceipts.includes("skip during pregnancy") && !dominantReceipts.includes("pregnancy contraindication")) {
        parts.push(`Pregnancy contraindication on ${f.ingredient}. Skip during pregnancy and breastfeeding.`);
      }
    }
  }

  if (scoreResult.matched_count < 3 && parsed.length > 10) {
    parts.push(`${scoreResult.matched_count} of ${parsed.length} ingredients in the calibration table. The rest are presumed lower concern.`);
  }

  const swapPointerFires = scoreResult.score >= 6 && scoreResult.breakdown.is_leave_on;
  if (swapPointerFires) {
    parts.push("Cleaner swaps exist. Same shelf, very different score.");
  } else if (scoreResult.breakdown.is_leave_on && scoreResult.breakdown.has_high_concern_match) {
    parts.push("Leave-on product means sustained skin contact.");
  } else if (!scoreResult.breakdown.is_leave_on && scoreResult.breakdown.has_high_concern_match) {
    parts.push("Rinse-off limits contact time, but the formulation still carries these.");
  }

  return parts.join(" ");
}

// ─────────────────────────────────────────────────────────
// SHORT VERDICT
// ─────────────────────────────────────────────────────────
function buildShortVerdict(parsed, scoreResult) {
  if (!scoreResult || scoreResult.score === null) return "Label too incomplete to score";
  const score = scoreResult.score;
  if (score <= 2) return "Clean profile. Worth keeping.";
  if (score <= 4) return "Mostly clean. Worth a look.";
  if (score <= 6) return "Mixed. Cleaner swaps exist.";
  if (score <= 8) return "Multiple concerns. Worth swapping.";
  return "Significant concerns. Skip if you can.";
}

// ─────────────────────────────────────────────────────────
// TEST FIXTURES
// ─────────────────────────────────────────────────────────
function _runTests() {
  const fixtures = [
    {
      name: "Mineral sunscreen (clean profile)",
      ingredients: "Active: Zinc Oxide 22%. Inactive: Water, Caprylic/Capric Triglyceride, Glycerin, Cetyl Alcohol, Tocopherol",
      category: "sunscreen",
      expected_range: [2, 4],
    },
    {
      name: "Chemical sunscreen with oxybenzone",
      ingredients: "Active: Oxybenzone 6%, Octinoxate 7.5%, Avobenzone 3%. Inactive: Water, Octocrylene, Homosalate",
      category: "sunscreen",
      expected_range: [7, 9],
    },
    {
      name: "Conventional shampoo with SLES",
      ingredients: "Water, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Sodium Chloride, Fragrance, Methylisothiazolinone",
      category: "shampoo",
      expected_range: [6, 8],
    },
    {
      name: "Sulfate-free shampoo with phenoxyethanol (low-concern preservative only)",
      ingredients: "Water, Cocamidopropyl Betaine, Glycerin, Aloe Barbadensis Leaf Juice, Phenoxyethanol, Citric Acid",
      category: "shampoo",
      expected_range: [2, 5],
    },
    {
      name: "Body lotion with parabens (kid mode)",
      ingredients: "Water, Glycerin, Mineral Oil, Methylparaben, Propylparaben, Fragrance",
      category: "lotion",
      kidMode: true,
      expected_range: [6, 9],
    },
    {
      name: "Retinol serum (pregnancy mode)",
      ingredients: "Water, Glycerin, Retinol, Tocopherol, Hyaluronic Acid",
      category: "serum",
      pregnancyMode: true,
      expected_range: [8, 10],
    },
    {
      name: "Benzoyl peroxide acne wash",
      ingredients: "Active: Benzoyl Peroxide 5%. Inactive: Water, Glycerin, Cocamidopropyl Betaine",
      category: "face_cleanser",
      expected_range: [5, 7],
    },
  ];

  console.log("=== personalCareScorer.js test fixtures ===\n");
  let passed = 0;
  let failed = 0;
  for (const fix of fixtures) {
    const parsed = parseIngredients(fix.ingredients);
    const result = scoreIngredients(parsed, {
      kidMode: fix.kidMode || false,
      pregnancyMode: fix.pregnancyMode || false,
      productCategory: fix.category,
    });
    const inRange = result.score !== null &&
                    result.score >= fix.expected_range[0] &&
                    result.score <= fix.expected_range[1];
    const status = inRange ? "PASS" : "FAIL";
    if (inRange) passed++; else failed++;
    console.log(`[${status}] ${fix.name}`);
    console.log(`  Score: ${result.score} (precise: ${result.precise_score}), Expected: ${fix.expected_range[0]}-${fix.expected_range[1]}`);
    console.log(`  Confidence: ${result.confidence}, Matched: ${result.matched_count}/${result.total_ingredients}`);
    console.log(`  Hazard: ${result.ingredient_hazard_score}, Absorption: ${result.skin_absorption_score}, Use Freq: ${result.use_frequency_score}`);
    if (result.floor_triggered_by) {
      console.log(`  Floor: ${result.floor_triggered_by.ingredient} (${result.floor_triggered_by.mode}, ${result.floor_triggered_by.floor})`);
    }
    console.log(`  Verdict: ${buildShortVerdict(parsed, result)}`);
    console.log("");
  }
  console.log(`=== ${passed} passed, ${failed} failed ===\n`);
}

if (require.main === module) {
  _runTests();
}

module.exports = {
  parseIngredients,
  scoreIngredients,
  buildExplanation,
  buildShortVerdict,
  EXPOSURE_PROFILES,
};
