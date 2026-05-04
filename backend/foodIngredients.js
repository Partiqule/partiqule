// backend/foodIngredients.js
// Calibration table for food and beverage ingredient hazard scoring.
// Mirrors backend/personalCareIngredients.js with food-specific fields.
//
// Score scale: 1-10 where lower is better, matching the rest of the app.
// base_hazard_score is the contribution this ingredient makes when matched
// in an ingredient list. Position weighting and NOVA band mapping happen
// in foodScorer.js (not in this file). This file is data only.
//
// Lookup: ingredients are matched against canonical names and the aliases
// array. Aliases may be strings (case-insensitive equality on the trimmed
// lowercased input) or RegExp objects (tested against the trimmed lowercased
// input). Regex aliases are how whole-food category entries match common
// produce, grain, protein, and dairy names without enumerating thousands of
// individual foods.
//
// Hazard classes (current set, will grow as table expands):
//   artificial_color, natural_color, preservative, nitrosamine_precursor,
//   synthetic_antioxidant, processing_aid, emulsifier, sweetener_artificial,
//   sweetener_natural, industrial_oil, nova_marker, whole_food_marker
//
// TODO: separate allergen handling. Currently allergens (sulfites, soy,
// dairy, egg, etc.) classify by their primary hazard role. Future schema
// may add a parallel allergen_class field for FDA labeling-required
// allergens.
//
// Food-specific fields (vs personal care schema):
//   nova_typical          : 1-4, drives deterministic NOVA detection in scorer
//   whole_food_indicator  : boolean, anchors NOVA 1 detection for whole foods
//   quantity_threshold    : null for most entries; object with DV thresholds
//                           for ingredients where quantity matters (sodium,
//                           added sugar, saturated fat). Quantity-based
//                           concerns surface as nutrition badges, not score
//                           modifiers; this field is reserved for future use.
//
// Fields dropped from personal care schema:
//   skin_absorption_modifier: irrelevant for digestion
//
// Mode floors (kid_score_floor, pregnancy_score_floor) follow the same
// pattern as personal care: when the ingredient is present, the product's
// score in that mode cannot drop below the floor, even if NOVA banding
// would otherwise place it lower.

const FOOD_INGREDIENTS = {
  // Skeleton showing entry shape. Uncomment and modify when adding entries.
  // example_key: {
  //   inci_name: "Display Name",
  //   aliases: ["alias1", "alias2", /optional regex/i],
  //   hazard_class: "artificial_color",  // see header for full enum
  //   base_hazard_score: 7,              // 1-10, lower is better
  //   nova_typical: 4,                   // 1-4 NOVA tier
  //   whole_food_indicator: false,
  //   quantity_threshold: null,          // null for most, object for sodium/sugar
  //   pregnancy_concern: true,
  //   pregnancy_score_floor: 7,          // null if no pregnancy concern
  //   kid_concern: true,
  //   kid_score_floor: 8,                // null if no kid concern
  //   regulatory_citations: [
  //     "Citation 1 with year and source",
  //     // 3-5 citations expected, all web_search verified
  //   ],
  //   reasoning: "Why this calibration is set this way",
  // },

  // Real entries below, added per Phase 1 plan. See docs/foodscorer-plan.md
  // for the bucket structure (Phase 1, ~50 entries across 7 buckets).

  // ============================================================
  // Bucket 1: Artificial colors
  // ============================================================

  red_40: {
    inci_name: "Red 40",
    aliases: [
      "red 40",
      "fd&c red no. 40",
      "fd&c red #40",
      "allura red ac",
      "allura red",
      "e129",
      "ci 16035",
    ],
    hazard_class: "artificial_color",
    base_hazard_score: 7,
    nova_typical: 4,
    whole_food_indicator: false,
    quantity_threshold: null,
    pregnancy_concern: true,
    pregnancy_score_floor: 7,
    kid_concern: true,
    kid_score_floor: 8,
    regulatory_citations: [
      "FDA 21 CFR 74.340: FD&C Red No. 40 (Allura Red AC, CAS 25956-17-6) is listed for use in food in amounts consistent with good manufacturing practice. Each batch must be FDA-certified under 21 CFR Part 80 before commercial use. Listing remains active as of May 2026.",
      "California AB 2316 (California School Food Safety Act, signed September 2024): bans Red 40, Yellow 5, Yellow 6, Blue 1, Blue 2, and Green 3 from food, drinks, and snacks served in California public schools. Effective December 31, 2027.",
      "EU Regulation 1333/2008 (effective 20 July 2010): Allura Red AC (E129) is one of the Southampton Six colors and any food product containing it must carry the warning label \"May have an adverse effect on activity and attention in children.\" The labeling requirement created strong reformulation pressure across the European market.",
      "McCann et al. 2007 (The Lancet 370(9598):1560-1567): University of Southampton randomized double-blind placebo-controlled trial in 153 three-year-olds and 144 eight-to-nine-year-olds. A mixture of artificial food colors plus sodium benzoate produced statistically significant increases in hyperactivity scores in general-population children, including those without ADHD. Funded by the UK Food Standards Agency.",
      "Kwon et al. 2022 (Nature Communications 13:7617, DOI 10.1038/s41467-022-35309-y, published 20 December 2022): McMaster University study demonstrating that chronic exposure to Allura Red AC at dietary-level doses promotes susceptibility to experimental colitis in mice via gut barrier disruption (myosin light chain kinase impairment), elevated colonic serotonin, and altered microbiota. Early-life exposure was shown to prime heightened colitis susceptibility, an independent biological mechanism distinct from the behavioral concerns covered by the McCann trial.",
    ],
    reasoning: "Red 40 is the most heavily used artificial color in the US food supply, with both established behavioral evidence (McCann 2007 Southampton trial) and a more recent peer-reviewed mechanism for gastrointestinal harm (Kwon et al. 2022, Nature Communications) showing that chronic dietary-level exposure promotes colitis susceptibility via gut barrier disruption and altered serotonin signaling. The base_hazard_score of 7 reflects the convergence of these two independent evidence lines weighed against the FDA's continuing GRAS-equivalent listing under 21 CFR 74.340. The kid_score_floor of 8 is reinforced from two directions: behavioral evidence (EU mandatory child-warning label, California AB 2316, McCann findings in three-year-olds) and developmental biology (Kwon 2022's finding that early-life Allura Red exposure primes heightened colitis susceptibility in mice). The pregnancy_score_floor of 7 reflects general endocrine and developmental caution rather than pregnancy-specific evidence (which is sparse for synthetic colors). CSPI petitioned the FDA to ban Red 40 in 2008 and the agency declined; the April 2025 FDA-HHS announcement of a voluntary industry phase-out by end of 2026 signals that political and scientific pressure has finally caught up to seventeen years of accumulated evidence.",
  },

  yellow_5: {
    inci_name: "Yellow 5",
    aliases: [
      "yellow 5",
      "fd&c yellow no. 5",
      "fd&c yellow #5",
      "tartrazine",
      "e102",
      "ci 19140",
    ],
    hazard_class: "artificial_color",
    base_hazard_score: 7,
    nova_typical: 4,
    whole_food_indicator: false,
    quantity_threshold: null,
    pregnancy_concern: true,
    pregnancy_score_floor: 7,
    kid_concern: true,
    kid_score_floor: 8,
    regulatory_citations: [
      "FDA 21 CFR 74.705: FD&C Yellow No. 5 (tartrazine, CAS 1934-21-0) is listed for use in food, with a unique labeling requirement that no other US synthetic color carries. Foods containing Yellow 5 must declare it specifically as \"FD&C Yellow No. 5\" in the ingredient list (not as \"color added\" or \"artificial color\"). For drug products the label must read \"Contains FD&C Yellow No. 5 (tartrazine) as a color additive.\" Each batch must be FDA-certified under 21 CFR Part 80. The special declaration rule is a regulatory legacy of historical asthma and aspirin cross-reactivity concerns.",
      "California AB 2316 (California School Food Safety Act, signed September 2024): bans Red 40, Yellow 5, Yellow 6, Blue 1, Blue 2, and Green 3 from food, drinks, and snacks served in California public schools. Effective December 31, 2027.",
      "EU Regulation 1333/2008 (effective 20 July 2010): Tartrazine (E102) is one of the Southampton Six colors and any food product containing it must carry the warning label \"May have an adverse effect on activity and attention in children.\"",
      "McCann et al. 2007 (The Lancet 370(9598):1560-1567): University of Southampton randomized double-blind placebo-controlled trial in 153 three-year-olds and 144 eight-to-nine-year-olds. Tartrazine was a component of the active mixture that produced statistically significant increases in hyperactivity scores in general-population children. Funded by the UK Food Standards Agency.",
      "California Office of Environmental Health Hazard Assessment (OEHHA), Cal-EPA, 2021: \"Health Effects Assessment: Potential Neurobehavioral Effects of Synthetic Food Dyes in Children\" (April 16, 2021). State-funded systematic review of 27 controlled clinical trials of synthetic food dyes in children. Found behavioral associations in 64% of trials, with 52% statistically significant. Served as the regulatory-science basis for California AB 2316.",
    ],
    reasoning: "Yellow 5 (tartrazine) is the only US synthetic color with its own special FDA labeling rule under 21 CFR 74.705, requiring explicit declaration in the ingredient list rather than the generic \"color added.\" That rule originates in older theories about cross-reactivity with aspirin in AERD patients and with sulfites in asthmatics, theories that subsequent rigorous oral-challenge studies did not support. The hazard score of 7 instead reflects evidence that has replicated: Yellow 5 was a component in the McCann 2007 Southampton trial mixture, and the California OEHHA 2021 systematic review found behavioral associations in 64% of 27 reviewed clinical trials (52% statistically significant). A 2025 toxicology review (Visternicu et al., Toxics 13(9):771) summarizes oxidative stress and multi-system effects from in vitro and animal data, and Stevenson et al. 2010 additionally found individual susceptibility moderated by histamine-degradation gene polymorphisms. The kid_score_floor of 8 matches Red 40 because the EU child-warning label, California's AB 2316, and the McCann and OEHHA behavioral signals all apply specifically to children; the pregnancy_score_floor of 7 is precaution-based rather than tied to pregnancy-specific evidence. The FDA April 2025 announcement of a voluntary industry phase-out targets Yellow 5 alongside Red 40 in the six-dye transition by end of 2026.",
  },
};

function lookupIngredient(rawName) {
  if (typeof rawName !== "string") return null;
  const normalized = rawName.toLowerCase().trim();
  if (!normalized) return null;
  for (const [key, entry] of Object.entries(FOOD_INGREDIENTS)) {
    for (const alias of entry.aliases) {
      if (alias instanceof RegExp) {
        if (alias.test(normalized)) return { key, entry };
      } else if (alias === normalized) {
        return { key, entry };
      }
    }
  }
  return null;
}

module.exports = {
  FOOD_INGREDIENTS,
  lookupIngredient,
};
