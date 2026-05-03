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
// EXPLANATION BUILDER
// ─────────────────────────────────────────────────────────
function buildExplanation(parsed, scoreResult, options = {}) {
  const { kidMode = false, pregnancyMode = false } = options;
  if (!scoreResult || scoreResult.score === null) {
    return "Not enough recognized ingredients to score this product confidently.";
  }
  const matched = parsed.filter((p) => p.entry !== null);
  const sortedByPosition = [...matched].sort((a, b) => a.position - b.position);
  const dominantConcerns = sortedByPosition
    .filter((m) => m.entry.base_hazard_score >= 6)
    .slice(0, 3);

  const parts = [];

  if (dominantConcerns.length > 0) {
    const namesAndReasons = dominantConcerns.map((m) => {
      const entry = m.entry;
      return `${entry.inci_name} (${entry.hazard_class.replace(/_/g, " ")}, hazard ${entry.base_hazard_score})`;
    });
    parts.push(`This product contains ${namesAndReasons.join(", ")} from the calibration database.`);
  } else if (matched.length > 0) {
    parts.push(`This product contains ${matched.length} ingredient${matched.length === 1 ? "" : "s"} from the calibration database, all at lower hazard levels.`);
  }

  if (scoreResult.floor_triggered_by) {
    const f = scoreResult.floor_triggered_by;
    parts.push(`The ${f.mode} mode score floor of ${f.floor} is set by ${f.ingredient}.`);
  }

  if (scoreResult.breakdown.is_leave_on) {
    parts.push("As a leave-on product, ingredients have sustained skin contact, amplifying exposure.");
  } else {
    parts.push("As a rinse-off product, contact duration is brief.");
  }

  if (scoreResult.matched_count < 3 && parsed.length > 10) {
    parts.push(`Only ${scoreResult.matched_count} of ${parsed.length} ingredients matched the calibration database; remaining ingredients are presumed lower-concern fillers.`);
  }

  return parts.join(" ");
}

// ─────────────────────────────────────────────────────────
// SHORT VERDICT
// ─────────────────────────────────────────────────────────
function buildShortVerdict(parsed, scoreResult) {
  if (!scoreResult || scoreResult.score === null) return "Insufficient ingredient data";
  const score = scoreResult.score;
  if (score <= 3) return "Clean ingredient profile";
  if (score <= 5) return "Mostly clean with minor concerns";
  if (score <= 7) return "Multiple concerning ingredients";
  return "Significant ingredient concerns";
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
