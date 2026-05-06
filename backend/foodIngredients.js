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

/**
 * CALIBRATION ALIAS DISCIPLINE
 *
 * For each substance entry, the aliases array must include all common label
 * variations the substance might appear under, including:
 *   - Generic name (e.g., "red 40")
 *   - Full FDA name where common (e.g., "FD&C Red No. 40")
 *   - INCI/cosmetic name where different
 *   - EU E-number variants (e.g., "e129", "e 129")
 *   - INS code variants (e.g., "ins 129")
 *   - Lake variants for color additives (e.g., "red 40 lake",
 *     "red 40 aluminum lake", "fd&c red no. 40 lake") — lakes are the dye
 *     precipitated onto aluminum substrate; same hazard profile, different
 *     FDA listing under 21 CFR Part 74 subpart B
 *   - Common label-prefix variants (e.g., "preservative e211", "color e110")
 *
 * This discipline ensures the engine matches real-world ingredient labels
 * without per-engine normalization logic. The engine reads aliases verbatim;
 * if a label variant isn't in aliases, the substance won't match.
 */

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
      "red 40 lake",
      "red 40 aluminum lake",
      "fd&c red no. 40 lake",
      "fd&c red 40 lake",
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
      "yellow 5 lake",
      "yellow 5 aluminum lake",
      "fd&c yellow no. 5 lake",
      "fd&c yellow 5 lake",
      "tartrazine lake",
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

  yellow_6: {
    inci_name: "Yellow 6",
    aliases: [
      "yellow 6",
      "fd&c yellow no. 6",
      "fd&c yellow #6",
      "sunset yellow fcf",
      "sunset yellow",
      "e110",
      "ci 15985",
      "yellow 6 lake",
      "yellow 6 aluminum lake",
      "fd&c yellow no. 6 lake",
      "fd&c yellow 6 lake",
      "sunset yellow lake",
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
      "FDA 21 CFR 74.706: FD&C Yellow No. 6 (Sunset Yellow FCF, CAS 2783-94-0) is listed for use in food in amounts consistent with current good manufacturing practice. Each batch must be FDA-certified under 21 CFR Part 80 before commercial use. Listing remains active as of May 2026. Yellow 6 carries no special labeling requirement (unlike Yellow 5 under 21 CFR 74.705).",
      "California AB 2316 (California School Food Safety Act, signed September 2024): bans Red 40, Yellow 5, Yellow 6, Blue 1, Blue 2, and Green 3 from food, drinks, and snacks served in California public schools. Effective December 31, 2027.",
      "EU Regulation 1333/2008 (effective 20 July 2010): Sunset Yellow FCF (E110) is one of the Southampton Six colors and any food product containing it must carry the warning label \"May have an adverse effect on activity and attention in children.\"",
      "McCann et al. 2007 (The Lancet 370(9598):1560-1567): University of Southampton randomized double-blind placebo-controlled trial in 153 three-year-olds and 144 eight-to-nine-year-olds. Sunset Yellow FCF was a component of the active mixture that produced statistically significant increases in hyperactivity scores in general-population children. Funded by the UK Food Standards Agency.",
      "EFSA Panel on Food Additives and Nutrient Sources, 2014: \"Reconsideration of the temporary ADI and refined exposure assessment for Sunset Yellow FCF (E 110)\" (EFSA Journal 2014;12(7):3765). EFSA restored the ADI for Sunset Yellow FCF to 4 mg/kg bw/day after a 28-day oral toxicity study specifically designed to evaluate testis effects in rats overruled the concern that had temporarily reduced the ADI to 1 mg/kg bw/day in the 2009 reassessment. The EU mandatory child-warning label under Regulation 1333/2008 remained in force despite the ADI restoration.",
    ],
    reasoning: "Yellow 6 (Sunset Yellow FCF) is one of the Southampton Six colors named after the McCann 2007 trial and is covered by the same EU mandatory child-warning label and California school-food ban as Red 40 and Yellow 5. Unlike Yellow 5, Yellow 6 carries no special FDA labeling rule, but it has its own dedicated EFSA paper trail: the 2009 reassessment temporarily reduced the ADI to 1 mg/kg bw/day on testis-effect concerns, and the 2014 reassessment restored it to 4 mg/kg bw/day after a follow-up 28-day study overruled that signal. The hazard score of 7 reflects the convergence of behavioral evidence from the McCann 2007 trial mixture and the California OEHHA 2021 systematic review (which found behavioral associations in 64% of 27 reviewed clinical trials, 52% statistically significant) weighed against the FDA's continuing GRAS-equivalent listing under 21 CFR 74.706. The kid_score_floor of 8 matches Red 40 and Yellow 5 because the EU child-warning label, California's AB 2316, and the McCann and OEHHA behavioral signals all apply specifically to children; the pregnancy_score_floor of 7 is precaution-based rather than tied to pregnancy-specific evidence (the 2009-2014 testis-effect arc was animal data and was ultimately overruled at the EFSA review). The FDA April 2025 announcement of a voluntary industry phase-out targets Yellow 6 alongside the other five remaining synthetic dyes by end of 2026.",
  },

  blue_1: {
    inci_name: "Blue 1",
    aliases: [
      "blue 1",
      "fd&c blue no. 1",
      "fd&c blue #1",
      "brilliant blue fcf",
      "brilliant blue",
      "e133",
      "ci 42090",
      "blue 1 lake",
      "blue 1 aluminum lake",
      "fd&c blue no. 1 lake",
      "fd&c blue 1 lake",
      "brilliant blue fcf lake",
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
      "FDA 21 CFR 74.101: FD&C Blue No. 1 (Brilliant Blue FCF, CAS 3844-45-9) is listed for use in food in amounts consistent with good manufacturing practice. Each batch must be FDA-certified under 21 CFR Part 80 before commercial use. Listing remains active as of May 2026. Blue 1 carries no special labeling requirement.",
      "California AB 2316 (California School Food Safety Act, signed September 2024): bans Red 40, Yellow 5, Yellow 6, Blue 1, Blue 2, and Green 3 from food, drinks, and snacks served in California public schools. Effective December 31, 2027.",
      "EFSA Panel on Food Additives and Nutrient Sources, 2010: \"Scientific Opinion on the re-evaluation of Brilliant Blue FCF (E 133) as a food additive\" (EFSA Journal 2010;8(11):1853). EFSA reduced the ADI for Brilliant Blue FCF from the previous SCF 1984 value of 10 mg/kg bw/day to 6 mg/kg bw/day on the basis of new absorption, metabolism, genotoxicity, and toxicity data. The opinion also flagged that some population groups, particularly children at the 95th percentile of intake, approach or exceed the revised ADI. JECFA confirmed the 6 mg/kg bw/day ADI in 2017.",
      "California Office of Environmental Health Hazard Assessment (OEHHA), Cal-EPA, 2021: \"Health Effects Assessment: Potential Neurobehavioral Effects of Synthetic Food Dyes in Children\" (April 16, 2021). State-funded systematic review of 27 controlled clinical trials of synthetic food dyes in children. Found behavioral associations in 64% of trials, with 52% statistically significant. The review covered Blue 1 alongside the other dyes that California AB 2316 subsequently banned from school food.",
      "Wang, Jackson, and Dahl 2013 (Journal of General Physiology 141(5):649-656, PubMed 23589583): primary research demonstrating that FD&C Blue No. 1 is a selective inhibitor of the Panx1 ATP-release channel with an IC50 of 0.27 µM, with no significant effect on P2X7R at concentrations up to 100 µM. Combined with the dye's documented ability to cross the blood-brain barrier, this establishes a Blue 1-specific pharmacological concern distinct from the behavioral evidence base for the McCann-tested dyes.",
    ],
    reasoning: "Blue 1 (Brilliant Blue FCF) is a triarylmethane synthetic dye commonly used in beverages, candies, baked goods, and dairy products to produce blue and green hues. Unlike Red 40, Yellow 5, and Yellow 6, Blue 1 is NOT one of the Southampton Six (E133 was not in either of the McCann 2007 trial mixtures) and is not subject to the EU mandatory child-warning label under Regulation 1333/2008; California AB 2316 nonetheless grouped Blue 1 with the McCann-tested dyes for school-food removal, on the basis of the broader OEHHA 2021 systematic review. The hazard score of 7 reflects three converging evidence pathways. Behavioral: the California OEHHA 2021 systematic review covered Blue 1 alongside the other AB 2316 dyes and found behavioral associations across 64% of 27 trials, 52% statistically significant. Regulatory: EFSA's 2010 reassessment reduced Blue 1's ADI from 10 to 6 mg/kg bw/day. Pharmacological: Wang et al. 2013 (Journal of General Physiology 141(5):649-656) demonstrated that Brilliant Blue FCF selectively inhibits the Panx1 ATP-release channel at submicromolar concentrations (IC50 0.27 µM) and crosses the blood-brain barrier. The kid_score_floor of 8 is justified by the OEHHA 2021 behavioral signal applied to children, California's AB 2316 school-food ban, and the BBB-crossing Panx1 pharmacology being more salient in developing nervous systems; EFSA's 2010 reassessment also flagged that children at the 95th percentile of intake approach or exceed the revised ADI. The pregnancy_score_floor of 7 is precaution-based rather than tied to pregnancy-specific evidence. The FDA April 2025 announcement of a voluntary industry phase-out targets Blue 1 alongside the other five remaining synthetic dyes by end of 2026.",
  },

  blue_2: {
    inci_name: "Blue 2",
    aliases: [
      "blue 2",
      "fd&c blue no. 2",
      "fd&c blue #2",
      "indigotine",
      "indigo carmine",
      "e132",
      "ci 73015",
      "blue 2 lake",
      "blue 2 aluminum lake",
      "fd&c blue no. 2 lake",
      "fd&c blue 2 lake",
      "indigo carmine lake",
      "indigotine lake",
    ],
    hazard_class: "artificial_color",
    base_hazard_score: 6,
    nova_typical: 4,
    whole_food_indicator: false,
    quantity_threshold: null,
    pregnancy_concern: true,
    pregnancy_score_floor: 6,
    kid_concern: true,
    kid_score_floor: 7,
    regulatory_citations: [
      "FDA 21 CFR 74.102: FD&C Blue No. 2 (Indigotine, Indigo Carmine, CAS 860-22-0, with related sulfonic acid derivatives) is listed for use in food in amounts consistent with current good manufacturing practice. Each batch must be FDA-certified under 21 CFR Part 80 before commercial use. Listing remains active as of May 2026. Blue 2 carries no special labeling requirement.",
      "California AB 2316 (California School Food Safety Act, signed September 2024): bans Red 40, Yellow 5, Yellow 6, Blue 1, Blue 2, and Green 3 from food, drinks, and snacks served in California public schools. Effective December 31, 2027.",
      "EFSA Panel on Food Additives and Flavourings, 2023: \"Follow-up of the re-evaluation of indigo carmine (E 132) as a food additive\" (EFSA Journal 2023;21(7):8103). Confirmed the ADI of 5 mg/kg bw/day for E 132 disodium salts meeting revised specifications (85% minimum colouring matter), following the 2014 reassessment (EFSA Journal 2014;12(7):3768) which had retained the JECFA 1975 ADI of 5 mg/kg bw/day with conditions on purity (>=93%) and manufacturing process. Both reassessments referenced the Borzelleca et al. 1985-1986 carcinogenicity studies as the basis for the ADI and reviewed the Dixit and Goyal 2013 testis-effect signal.",
      "California Office of Environmental Health Hazard Assessment (OEHHA), Cal-EPA, 2021: \"Health Effects Assessment: Potential Neurobehavioral Effects of Synthetic Food Dyes in Children\" (April 16, 2021). State-funded systematic review of 27 controlled clinical trials of synthetic food dyes in children. Found behavioral associations in 64% of trials, with 52% statistically significant. The review covered Blue 2 alongside the other dyes that California AB 2316 subsequently banned from school food.",
      "Ristea and Zarnescu 2023: \"Indigo Carmine: Between Necessity and Concern\" (Journal of Xenobiotics 13(3):509-528, DOI 10.3390/jox13030033, published 20 September 2023). Modern dye-specific review collecting 13 toxicology studies (9 in vivo and 4 in vitro), covering food-additive uses, environmental pollution, and biomedical applications. Surfaces the Borzelleca 1985-1986 finding of statistically significant brain gliomas and malignant mammary gland tumors in male rats fed 2% Blue 2 in diet, which EFSA judged as not translating to dietary-realistic risk at the current ADI.",
    ],
    reasoning: "Blue 2 (Indigotine, Indigo Carmine) is an indigoid synthetic dye used in beverages, candies, baked goods, and pharmaceuticals to produce blue and violet hues. Like Blue 1, Blue 2 is NOT one of the Southampton Six (E132 was not in either of the McCann 2007 trial mixtures) and is not subject to the EU mandatory child-warning label under Regulation 1333/2008; California AB 2316 nonetheless grouped Blue 2 with the McCann-tested dyes for school-food removal. The hazard score of 6 sits one point below Blue 1's 7 because Blue 2's dye-specific evidence base is genuinely thinner. There is no Blue 2 equivalent of the Wang et al. 2013 Panx1/blood-brain-barrier mechanism, the cardiovascular concerns documented in clinical literature trace to IV diagnostic use at concentrations far above dietary intake, and EFSA has affirmed the 5 mg/kg bw/day ADI in two reassessments (2014 reassessment and 2023 follow-up) without lowering it. What evidence DOES apply: California's OEHHA 2021 systematic review covered Blue 2 alongside the other AB 2316 dyes, and Ristea and Zarnescu 2023 (Journal of Xenobiotics 13(3):509-528) reviewed 13 toxicology studies and surfaced the Borzelleca 1985-1986 finding of statistically significant brain gliomas and malignant mammary gland tumors in male rats fed 2% Blue 2 in diet, which EFSA reviewed and judged as not translating to dietary-realistic risk at the current ADI. The kid_score_floor of 7 reflects OEHHA 2021's behavioral signal applied to children and California's AB 2316 school-food ban; the pregnancy_score_floor of 6 is precaution-based rather than tied to pregnancy-specific evidence. The FDA April 2025 announcement of a voluntary industry phase-out targets Blue 2 alongside the other five remaining synthetic dyes by end of 2026.",
  },

  green_3: {
    inci_name: "Green 3",
    aliases: [
      "green 3",
      "fd&c green no. 3",
      "fd&c green #3",
      "fast green fcf",
      "fast green",
      "e143",
      "ci 42053",
      "green 3 lake",
      "green 3 aluminum lake",
      "fd&c green no. 3 lake",
      "fd&c green 3 lake",
      "fast green fcf lake",
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
      "FDA 21 CFR 74.203: FD&C Green No. 3 (Fast Green FCF, CAS 2353-45-9) is listed for use in food in amounts consistent with current good manufacturing practice. Each batch must be FDA-certified under 21 CFR Part 80 before commercial use. Listing remains active as of May 2026. Green 3 carries no special labeling requirement.",
      "California AB 2316 (California School Food Safety Act, signed September 2024): bans Red 40, Yellow 5, Yellow 6, Blue 1, Blue 2, and Green 3 from food, drinks, and snacks served in California public schools. Effective December 31, 2027.",
      "EU Regulation (EC) No 1333/2008 on food additives: Fast Green FCF (E143) does NOT appear on the EU positive list of authorised food colours and is one of four US-approved synthetic colours that the EU has actively chosen not to permit for food use, with the non-authorisation grounded in toxicity concerns. The same dye is also prohibited in the United Kingdom and China. EFSA has not conducted a formal re-evaluation of E143 because the additive is not EU-authorised.",
      "California Office of Environmental Health Hazard Assessment (OEHHA), Cal-EPA, 2021: \"Health Effects Assessment: Potential Neurobehavioral Effects of Synthetic Food Dyes in Children\" (April 16, 2021). State-funded systematic review of 27 controlled clinical trials of synthetic food dyes in children. Found behavioral associations in 64% of trials, with 52% statistically significant. The review covered Green 3 alongside the other dyes that California AB 2316 subsequently banned from school food.",
      "van Hooft 2002 (Neuroscience Letters 318:163-165, PubMed 11803124): primary research demonstrating that Fast Green FCF reduces the frequency (but not amplitude or kinetics) of miniature synaptic events in rat hippocampal interneurons in a dose-dependent manner, with frequency reduced to 21% of control at 1 mg/ml (1.2 mM). The dye acts at a presynaptic locus to inhibit neurotransmitter release. This establishes a Green 3-specific neuropharmacological mechanism analogous in role (though distinct in target) to the Panx1 channel inhibition documented for Blue 1.",
    ],
    reasoning: "Green 3 (Fast Green FCF) is a triarylmethane synthetic dye used in beverages, candies, ice cream, sauces, and cosmetics to produce sea-green and turquoise hues. Like Blue 1 and Blue 2, Green 3 is NOT one of the Southampton Six (E143 was not in either of the McCann 2007 trial mixtures) and is not subject to the EU mandatory child-warning label under Regulation 1333/2008. The differentiating regulatory signal is much stronger though: Green 3 is one of four US-approved colours that the EU has actively NOT authorised for food use, citing toxicity concerns. The same dye is banned in the UK and China. The hazard score of 7 reflects three converging evidence pathways. Behavioral: the California OEHHA 2021 systematic review covered Green 3 alongside the other AB 2316 dyes and found behavioral associations across 64% of 27 trials, 52% statistically significant. Regulatory: the EU's active non-authorisation of E143 under Regulation 1333/2008 citing toxicity concerns, alongside California's AB 2316 school-food ban; this contrasts with JECFA's 84th Report (2017), which confirmed an ADI of 0-25 mg/kg bw with conclusions of low toxicity and no carcinogenicity, reflecting the regulatory split between EU prohibition and US continued approval. Pharmacological: van Hooft 2002 (Neuroscience Letters 318:163-165) demonstrated that Fast Green FCF reduces the frequency of miniature synaptic events in rat hippocampal interneurons in a dose-dependent manner, acting at a presynaptic locus to inhibit neurotransmitter release. The kid_score_floor of 8 is justified by the OEHHA 2021 behavioral signal applied to children, California's AB 2316 school-food ban, and the van Hooft 2002 synaptic-inhibition pharmacology being more salient in developing nervous systems. The pregnancy_score_floor of 7 is precaution-based, with Sudhakaran et al. 2025 (Toxicology Letters 413) reporting follicular maturation arrest in zebrafish under prolonged Green 3 exposure adding a suggestive but animal-model reinforcement. The FDA April 2025 announcement of a voluntary industry phase-out targets Green 3 alongside the other five remaining synthetic dyes by end of 2026.",
  },

  red_3: {
    inci_name: "Red 3",
    aliases: [
      "red 3",
      "fd&c red no. 3",
      "fd&c red #3",
      "erythrosine",
      "erythrosine b",
      "e127",
      "ci 45430",
      "red 3 lake",
      "red 3 aluminum lake",
      "fd&c red no. 3 lake",
      "fd&c red 3 lake",
      "erythrosine lake",
    ],
    hazard_class: "artificial_color",
    base_hazard_score: 8,
    nova_typical: 4,
    whole_food_indicator: false,
    quantity_threshold: null,
    pregnancy_concern: true,
    pregnancy_score_floor: 8,
    kid_concern: true,
    kid_score_floor: 9,
    regulatory_citations: [
      "FDA Final Rule, January 15, 2025: \"Color Additive Petition From Center for Science in the Public Interest, et al.; Request To Revoke Color Additive Listing for Use of FD&C Red No. 3 in Food and Ingested Drugs\" (Federal Register 90 FR 6504, document 2025-00830, published January 16, 2025). FDA revoked authorization for FD&C Red No. 3 in food and ingested drugs under the Delaney Clause of the Federal Food, Drug, and Cosmetic Act, which mandates revocation when an additive is found to induce cancer in animals. Compliance deadlines: food manufacturers must reformulate by January 15, 2027; ingested drug manufacturers by January 18, 2028. This is the only synthetic food color where FDA has taken binding regulatory action; the April 2025 announcement covering the other six dyes is voluntary industry phase-out, not formal revocation.",
      "California AB 418 (California Food Safety Act, signed October 7, 2023 by Governor Newsom): bans Red 3 (along with brominated vegetable oil, potassium bromate, and propylparaben) from food manufactured, distributed, or sold in California. Effective January 1, 2027. Penalties up to $5,000 first offense, $10,000 repeat. California was the first state to ban Red 3 in food; the FDA action followed approximately 15 months later.",
      "FDA, 1990: did not extend the provisional listing of FD&C Red No. 3 for use in cosmetics and externally applied drugs, on the basis of thyroid neoplasia in rat carcinogenicity studies. Same Delaney Clause mechanism that drove the 2025 food revocation. The 35-year gap between the cosmetics non-listing and the food revocation reflects how the Delaney Clause was selectively applied; the underlying carcinogenicity finding was the same in 1990 as it was in 2025.",
      "Borzelleca, Capen, and Hallagan 1987 (Food and Chemical Toxicology 25(10):723-733, DOI 10.1016/0278-6915(87)90226-2, PubMed 2824305): foundational lifetime carcinogenicity study. FD&C Red No. 3 was administered to Charles River CD rats as a dietary admixture across in utero and F1 phases, with high-dose group at 4.0% diet for up to 30 months. Results: statistically significant increases in thyroid follicular cell hypertrophy, hyperplasia, and adenomas in male rats. The companion mouse study (PubMed 2824306) did not show the same thyroid effect, characterizing the mechanism as rat-specific via hormonal mediation rather than direct genotoxicity.",
      "California Office of Environmental Health Hazard Assessment (OEHHA), Cal-EPA, 2021: \"Health Effects Assessment: Potential Neurobehavioral Effects of Synthetic Food Dyes in Children\" (April 16, 2021). State-funded systematic review of 27 controlled clinical trials; the literature review explicitly covered erythrosine alongside tartrazine, sunset yellow, allura red, fast green, indigo carmine, and brilliant blue. Found behavioral associations in 64% of trials, with 52% statistically significant.",
    ],
    reasoning: "Red 3 (Erythrosine) is a xanthene synthetic dye used historically in maraschino cherries, candy, baked goods, and gelatin products to produce vivid pink and red hues. Red 3 is the strongest regulatory case in the artificial-color bucket and the only synthetic food color where the FDA has taken binding action: the January 15, 2025 final rule revoked authorization in food and ingested drugs under the Delaney Clause, which mandates revocation when an additive induces cancer in animals (compliance deadlines January 15, 2027 for food and January 18, 2028 for drugs). The hazard score of 8 reflects three converging evidence pathways. Behavioral: California's OEHHA 2021 systematic review explicitly covered erythrosine alongside the other AB 2316 dyes, finding behavioral associations across 64% of 27 reviewed trials (52% statistically significant). Regulatory: California AB 418 (signed October 2023) was the first state-level Red 3 ban and preceded the FDA action by 15 months; further back, the FDA's 1990 decision not to extend the provisional listing of Red 3 in cosmetics was based on the same thyroid carcinogenicity finding under the same Delaney Clause mechanism, creating a 35-year regulatory gap before the food authorization was finally revoked. Mechanistic: Borzelleca, Capen, and Hallagan 1987 (Food and Chemical Toxicology 25(10):723-733) showed statistically significant thyroid follicular cell hypertrophy, hyperplasia, and adenomas in male Charles River CD rats fed up to 4.0% Red 3 in diet for 30 months; the mechanism is endocrine-mediated rather than direct genotoxic, with Red 3 inhibiting iodine uptake and blocking T4-to-T3 conversion, raising TSH and stimulating thyroid cell proliferation. The kid_score_floor of 9 sits one point above the McCann-tested dyes because thyroid hormone is critical for developing nervous systems: any dietary exposure that disrupts thyroid signaling carries amplified concern for children, and OEHHA 2021's behavioral signal applies here as it does for the other dyes. The pregnancy_score_floor of 8 is genuinely pregnancy-specific rather than precaution-based, since maternal thyroid hormone is essential for fetal brain development and disruption is a documented developmental endpoint. The FDA found the rat-specific mechanism not directly translatable to humans but issued the Delaney revocation regardless because the legal standard does not require human-equivalent mechanism, only animal-induced cancer.",
  },

  caramel_color_iv: {
    inci_name: "Caramel Color IV",
    aliases: [
      "caramel color iv",
      "caramel color (class iv)",
      "caramel color class iv",
      "caramel color 4",
      "ammonia sulfite caramel",
      "sulfite ammonia caramel",
      "e150d",
      "e 150d",
      "e150 d",
      // Generic "caramel color" / "caramel coloring" included on the
      // pragmatic basis that most US labels do not specify class, and
      // when caramel color appears in soda or acid-stable beverage
      // applications it is almost always Class IV. See reasoning for
      // the class-ambiguity disclosure.
      "caramel color",
      "caramel coloring",
      "caramel colour",
      "caramel colouring",
    ],
    hazard_class: "artificial_color",
    base_hazard_score: 6,
    nova_typical: 4,
    whole_food_indicator: false,
    quantity_threshold: null,
    pregnancy_concern: true,
    pregnancy_score_floor: 6,
    kid_concern: true,
    kid_score_floor: 7,
    regulatory_citations: [
      "FDA 21 CFR 73.85: Caramel is listed for use in food in amounts consistent with good manufacturing practice. The regulation covers all four classes (I, II, III, IV) generically as \"Caramel\" without distinguishing the production processes. Heavy-metal specifications: lead not more than 10 ppm, arsenic not more than 3 ppm, mercury not more than 0.1 ppm. Caramel is exempt from FDA batch certification (Part 73) unlike the FD&C synthetic dyes (Part 74). FDA is reviewing whether to set 4-MEI-specific limits for Class III and IV caramel.",
      "National Toxicology Program 2007 (NTP Technical Report Series 535, PubMed 17342198): \"Toxicology and carcinogenesis studies of 4-methylimidazole (CAS No. 822-36-6) in F344/N rats and B6C3F1 mice (feed studies).\" Two-year feed study with 99.5% pure 4-MEI. Found clear evidence of carcinogenic activity in male and female B6C3F1 mice based on increased incidences of alveolar/bronchiolar neoplasms (lung tumors). Equivocal evidence in female F344/N rats (mononuclear cell leukemia) and no evidence in male F344/N rats. Foundational primary research that drove subsequent IARC and Prop 65 actions.",
      "California Proposition 65: 4-Methylimidazole (4-MEI) listed effective January 7, 2011 as known to the State of California to cause cancer. OEHHA established a No Significant Risk Level (NSRL) of 29 micrograms per day (initial proposal was 16 μg/day; final raised to 29), effective February 8, 2012. Products exposing consumers to more than 29 μg/day of 4-MEI must carry Prop 65 warning labels. Triggered industry-wide reformulation pressure including Coca-Cola requesting suppliers reduce 4-MEI levels.",
      "IARC Monograph Volume 101 (2013): 4-Methylimidazole classified as Group 2B (possibly carcinogenic to humans). Classification based on the NTP 2007 mouse lung tumor data; IARC found sufficient evidence in experimental animals and inadequate evidence in humans. Same hazard band as aspartame, lead, and radiofrequency electromagnetic fields.",
      "EFSA Panel on Food Additives and Nutrient Sources, 2011: \"Scientific Opinion on the re-evaluation of caramel colours (E 150 a,b,c,d) as food additives\" (EFSA Journal 2011;9(3):2004). Established a group ADI of 300 mg/kg bw/day for E150a, E150b, and E150d (Class IV), and a separate lower ADI of 100 mg/kg bw/day for E150c (Class III) due to THI immunotoxicity concerns. EFSA's exposure assessment flagged that high consumers of foods containing E150a, E150c, or E150d could exceed the established ADIs at maximum industry-reported use levels.",
    ],
    reasoning: "Caramel Color IV (sulfite-ammonia caramel, E150d) is the most heavily used colorant in cola sodas, dark sauces (soy sauce, Worcestershire, BBQ), gravies, dark beers, and acid-stable beverage applications. Class IV is one of four caramel-color classes that share a name but use different production processes; the ammonia-based Classes III and IV produce 4-methylimidazole (4-MEI) as a byproduct, while the non-ammonia Classes I and II do not. When a label reads simply \"caramel color\" without class specification, the application context typically signals the class: beverages and acid-stable products are almost always Class IV, baked goods and alcoholic products are often Class III (also 4-MEI-bearing), and Classes I and II are minority uses concentrated in whiskeys and some non-acid sauces. The hazard score of 6 reflects three converging evidence pathways. Carcinogenicity: the NTP 2007 two-year feed study found clear evidence of lung tumors in male and female mice; IARC classified 4-MEI as Group 2B (possibly carcinogenic to humans) in 2013. Regulatory: California Proposition 65 listed 4-MEI as a known carcinogen in 2011 with a 29 μg/day NSRL; EFSA's 2011 reassessment flagged high consumers could exceed ADIs at maximum industry-reported levels; the FDA is reviewing whether to set 4-MEI-specific limits. Modern context: industry voluntary reformulation since 2011 has reduced typical 4-MEI exposure roughly in half (FDA 2024 estimate ~0.017 mg/day vs prior 0.043-0.046 mg/day), with Coca-Cola now at 9.5-11.7 μg/L (well below the NSRL even at heavy consumption). However, malta drinks still range 900+ μg/L (Malta Goya 915.8-963.3 μg/L), and Class IV's 4-MEI content remains 112-1276 mg/kg across commercial samples, so legacy-formulation and unreformulated products remain genuine concerns. The kid_score_floor of 7 reflects children's higher per-body-weight beverage consumption combined with developing-tissue sensitivity to possible carcinogens. The pregnancy_score_floor of 6 matches the adult score because there is no pregnancy-specific 4-MEI mechanism comparable to Red 3's thyroid disruption; the general IARC 2B classification applies but does not amplify pregnancy concern. The mouse-specific lung carcinogenicity mechanism is not directly translatable to humans, but the IARC 2B and Prop 65 listings stand on the experimental animal evidence regardless.",
  },

  titanium_dioxide: {
    inci_name: "Titanium Dioxide",
    aliases: [
      "titanium dioxide",
      "titanium oxide",
      "tio2",
      "ti02",
      "e171",
      "ci 77891",
      "color additive titanium dioxide",
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
      "FDA 21 CFR 73.575: Titanium dioxide is listed for use in food coloring subject to a maximum of 1 percent by weight of the food. Color additive mixtures may contain SiO2 and/or Al2O3 as dispersing aids (not more than 2 percent total). Exempt from FDA batch certification (Part 73). FDA reaffirmed the safety conclusion in December 2022 and opened a public comment period in 2023 on a petition to revoke the listing; as of May 2026 the listing remains active.",
      "European Commission Regulation (EU) 2022/63, adopted January 14, 2022, published January 18, 2022: withdrew the authorisation to use titanium dioxide (E171) as a food additive. Entered into force February 7, 2022 with a six-month transition period; full ban applied from August 7, 2022. This was the first time the EU withdrew authorisation for an existing food additive (versus failing to authorise a new additive). Titanium dioxide remains permitted in medicinal products as a separate carve-out to avoid pharmaceutical shortages.",
      "EFSA Panel on Food Additives and Flavourings, May 6, 2021: \"Safety assessment of titanium dioxide (E171) as a food additive\" (EFSA Journal 2021;19(5):6585). Concluded that E171 can no longer be considered safe when used as a food additive because a concern for genotoxicity could not be ruled out and a cut-off particle size for genotoxicity could not be identified. EFSA could not establish a maximum Acceptable Daily Intake. This was the first application of the 2018 EFSA Scientific Committee Guidance on Nanotechnology to a food additive safety assessment, marking a methodological shift from the prior 2016 assessment that had considered E171 safe.",
      "International regulatory landscape on E171/TiO2 as a food additive: France implemented a national ban in 2019 (preceding the EU action). The EU ban followed under Regulation 2022/63. The United Kingdom Food Standards Agency and Food Standards Scotland reviewed the EFSA opinion in March 2022 and chose not to implement a corresponding ban, stating that no safety concerns had been identified. Health Canada and Food Standards Australia New Zealand (FSANZ 2022 reassessment) continue to permit the additive. The split is methodological rather than evidentiary: EU regulators applied the 2018 nanotechnology guidance and reached precautionary conclusions, while UK, Canadian, Australian, and US regulators continue to apply traditional risk assessment frameworks and find the existing evidence inconclusive of harm.",
    ],
    reasoning: "Titanium dioxide (TiO2, E171) is a white pigment used in coated candies (M&M's, Skittles white interior), chewing gum, dairy alternatives, white frostings, and some pharmaceutical coatings. The hazard score of 7 reflects the strongest single regulatory signal in the artificial-color bucket combined with consistent biological mechanism research, weighed against a genuine international regulatory split. Regulatory: the EU's 2022 withdrawal of titanium dioxide authorisation (Regulation 2022/63) was the first time the EU withdrew an existing food additive authorisation rather than failing to authorise a new one; France had already banned the additive nationally in 2019; the EFSA 2021 reassessment that drove the action concluded E171 \"can no longer be considered safe\" and was the first food additive assessment to apply the 2018 EFSA Nanotechnology Guidance, marking a methodological shift in how nanoparticle ingredients are evaluated. Mechanistic: gut-microbiome research published 2022-2025 has consistently shown that TiO2 nanoparticles decrease beneficial bacteria (Bifidobacterium, Lactobacillus), increase colitis severity in experimental mouse models, induce oxidative stress and inflammation, and a 2025 Food and Chemical Toxicology paper found that the smallest particles raise blood sugar and impair glucose processing. Honest regulatory split: the United Kingdom Food Standards Agency, Health Canada, Food Standards Australia New Zealand, and the US FDA have all reviewed the same evidence and chosen to maintain approval, finding the EFSA precautionary methodology not yet warranting binding action under their respective frameworks; the FDA continues to permit TiO2 with the 1% by weight cap and reaffirmed safety in December 2022. The split is methodological rather than evidentiary: regulators using the 2018 nanotechnology guidance reach precautionary conclusions, regulators using traditional frameworks do not. The kid_score_floor of 8 reflects that titanium dioxide is heavily used in white-coated candies and gums marketed to children, and the developing gut microbiome is more sensitive to dysbiosis than the adult microbiome. The pregnancy_score_floor of 7 matches the adult score because there is no pregnancy-specific TiO2 mechanism comparable to Red 3's thyroid pathway; the general EFSA concern applies but is not pregnancy-amplified.",
  },

  annatto_extract: {
    inci_name: "Annatto Extract",
    aliases: [
      "annatto",
      "annatto extract",
      "annatto coloring",
      "annatto color",
      "annatto seed extract",
      "bixa orellana extract",
      "bixin",
      "norbixin",
      "e160b",
      "ci 75120",
    ],
    hazard_class: "natural_color",
    base_hazard_score: 2,
    nova_typical: 1,
    whole_food_indicator: false,
    quantity_threshold: null,
    pregnancy_concern: false,
    pregnancy_score_floor: 2,
    kid_concern: false,
    kid_score_floor: 3,
    regulatory_citations: [
      "FDA 21 CFR 73.30: Annatto extract has been permanently listed as a color additive exempt from certification since 1963 (Part 73, like other natural colors and unlike the FD&C synthetic dyes in Part 74). Sourced from the seeds of Bixa orellana L. via food-grade extractants (alkaline aqueous solution, alkaline propylene glycol, ethyl alcohol, or edible vegetable oils). Bixin is the principal pigment of oil-soluble extracts; norbixin is the principal pigment of alkaline water-soluble extracts. Heavy-metal specifications: arsenic not more than 3 ppm, lead not more than 10 ppm. Used in foods generally in amounts consistent with good manufacturing practice.",
      "European Union: Annatto bixin and norbixin are authorized as food additives under Regulation (EC) No 1333/2008 Annex II, with purity criteria specified in Commission Regulation (EU) No 231/2012. Commission Regulation (EU) 2020/771 (June 11, 2020) split the previous combined E160b authorization into two separate additives: E160b(i) Annatto bixin and E160b(ii) Annatto norbixin, reflecting their different toxicological profiles and ADIs. Annatto is NOT subject to the EU mandatory child-warning label that applies to the Southampton Six synthetic colors.",
      "EFSA Panel on Food Additives, 2016 and 2019: re-evaluation of annatto extracts (E160b) as a food additive, with 2019 follow-up exposure assessment (EFSA Journal 2019;17(3):5626). Established ADI of 6 mg bixin/kg bw per day and a separate ADI of 0.3 mg norbixin/kg bw per day, distinguishing the two pigments because of their different toxicological profiles. The 2017 exposure assessment found bixin exposure below the ADI for all population groups, with norbixin exposure approaching or exceeding the ADI only for toddlers at the 95th percentile under proposed extended uses. JECFA earlier established separate ADIs in 2006 (bixin 12 mg/kg bw, norbixin 0.6 mg/kg bw), revising the 1974 temporary group ADI of 1.25 mg/kg bw.",
      "Allergy and sensitivity literature: norbixin acts as a hapten by binding to food proteins such as bovine kappa-casein and serum albumin, producing IgE-mediated reactions in sensitive individuals. Anaphylaxis case reports are documented (Nish et al. 1991, others), and in one challenge study 26% of patients with chronic urticaria or angioneurotic edema reacted to oral annatto provocation. Annatto is NOT among the FDA's major food allergens (Big Nine including sesame as of 2023) and is not subject to mandatory allergen labeling. Reactions are real but rare in the general population and well-characterized as IgE-mediated rather than systemic toxicity.",
    ],
    reasoning: "Annatto extract is a natural carotenoid colorant from the seeds of Bixa orellana, used for centuries in Latin American cuisine and now standard in cheddar cheese (annatto is what makes cheddar orange, not the cheese itself), butter, margarine, and various snack foods. This entry serves as the natural-color reference anchor in the calibration table: without a low-hazard natural colorant baseline, the food scorer would treat all colorants as equally concerning, conflating annatto with Red 40. The hazard score of 2 reflects six decades of FDA listing without revocation pressure, EFSA and JECFA affirmations with established ADIs, and an evidence base showing bixin actually has antioxidant and anti-genotoxic effects in some animal studies (no liver tumor promotion in the 2003 F344 rat medium-term bioassay). The score is not lower than 2 because IgE-mediated allergic reactions are real and documented, with anaphylaxis case reports on record and a 26% reaction rate in chronic urticaria patients orally provoked; this places annatto in the bounded-concern band rather than the inert band, even though it is far below the synthetic-dye band. The kid_score_floor of 3 reflects EFSA's finding that norbixin exposure can approach or exceed the ADI for toddlers at the 95th percentile under proposed extended uses, plus documented pediatric sensitivity cases. The pregnancy_score_floor of 2 matches the adult score because there is no pregnancy-specific concern in the EFSA or JECFA reviews and centuries of traditional use in Latin American cuisine include consumption during pregnancy without documented signals; the bounded allergy concern is the same in pregnancy as in non-pregnancy.",
  },

  // ============================================================
  // Bucket 2: Preservatives
  // ============================================================
  // Substances added to inhibit microbial growth, oxidation, or
  // spoilage. Distinct from Bucket 1 (artificial colors) in that
  // many preservatives serve legitimate food safety functions
  // (botulism prevention, mold inhibition, oxidation prevention).
  // The honest framing in reasoning paragraphs should acknowledge
  // protective function alongside hazard concerns.
  // ============================================================

  sodium_nitrite: {
    inci_name: "Sodium Nitrite",
    aliases: [
      "sodium nitrite",
      "e250",
      "e 250",
      "ins 250",
      "preservative e250",
    ],
    hazard_class: "preservative",
    base_hazard_score: 7,
    nova_typical: 4,
    whole_food_indicator: false,
    quantity_threshold: null,
    pregnancy_concern: true,
    pregnancy_score_floor: 7,
    kid_concern: true,
    kid_score_floor: 8,
    regulatory_citations: [
      "FDA 21 CFR 172.175: Sodium nitrite is permitted as a preservative and color fixative in cured meats and certain smoked fish, with use-case-specific maximum limits rather than the GMP basis used for most preservatives. Smoked cured tuna: not more than 10 ppm. Smoked cured sablefish, salmon, shad, and home meat curing: not more than 200 ppm sodium nitrite (with sodium nitrate not more than 500 ppm). Commercial smoked chub: a mandatory floor of 100 ppm and ceiling of 200 ppm. The substance-specific ppm caps reflect the carcinogenic mechanism risk that accompanies the additive's anti-botulinum protective function.",
      "IARC Monograph Volume 114 (October 2015): Processed meat classified as Group 1 (carcinogenic to humans) based on sufficient evidence in humans that processed meat consumption causes colorectal cancer. Each 50 gram daily portion increases colorectal cancer risk by 18%. The Working Group identified N-nitroso compounds among the candidate carcinogenic mechanisms; sodium nitrite is the proximate cause of N-nitroso formation in cured meat products. The Group 1 classification is for the food category (processed meat), not for sodium nitrite as an isolated additive.",
      "EFSA Panel on Food Additives and Nutrient Sources, June 2017: \"Re-evaluation of potassium nitrite (E 249) and sodium nitrite (E 250) as food additives\" (EFSA Journal 2017;15(6):4786). ADI confirmed at 0.07 mg/kg bw/day. Theoretical NDMA formation from nitrites at the ADI produces a Margin of Exposure greater than 10,000, which the Panel considered low concern at approved use levels. However, the Panel explicitly flagged that highly exposed children might slightly exceed the ADI from food additives alone, and that all dietary sources may exceed the ADI for infants, toddlers, and children at medium exposure.",
      "European Commission Regulation (EU) 2023/2108: amended Annexes II and III of Regulation (EC) No 1333/2008 to reduce the maximum permitted nitrite levels in meat products. Effective from October 9, 2025: maximum 80 mg/kg in general meat products and 55 mg/kg in sterilized meat products. This was the EU's regulatory response to the EFSA 2017 child exposure exceedance findings, and represents the most significant tightening of permitted nitrite levels in EU food law in over a decade.",
      "Recent research base (2024-2025): comprehensive characterization of N-nitrosamine formation conditions in processed meat products. Deveci 2024 (Journal of the Science of Food and Agriculture, doi: 10.1002/jsfa.13102) reviewed nitrosamine hazards in processed meats. Sheng, Silva, Tarté et al. 2025 (Scientific Reports 15:3269, DOI 10.1038/s41598-025-87563-x, published 25 January 2025, PubMed 39863766) analyzed residual nitrite and nitrate in 1,132 US processed meat products across East Coast, Midwest, and West Coast regions plus 53 plant-based meat analogues, finding mean residual nitrite of 13.7 ppm (range 0-214.5) in processed meats versus 1.7 ppm in plant analogues. Multiple independent studies confirm that NDMA formation increases markedly under combined high-temperature and high-nitrite conditions, while gastric digestion conditions further amplify nitrosamine production from precursor nitrites, even when starting nitrite levels are within regulatory limits.",
    ],
    reasoning: "Sodium nitrite (E250) is the curing agent in bacon, ham, hot dogs, salami, deli meats, smoked sausages, and similar cured/processed meat products, where it serves the dual function of color fixation (the pink color of cured meats is the nitrite-iron-myoglobin complex) and prevention of Clostridium botulinum growth. The hazard score of 7 reflects four converging evidence pathways. Carcinogenicity: IARC classified processed meat (the food category, not the additive) as Group 1 in 2015 based on sufficient human evidence for colorectal cancer, with each 50 gram daily portion increasing risk by 18%. Mechanism: N-nitroso compounds form when nitrites react with secondary amines, especially under high-temperature processing and acidic gastric conditions; multiple 2024-2025 studies confirm that NDMA formation increases markedly under realistic cooking and digestion conditions even when residual nitrite levels are within regulatory limits. Regulatory: the EU's Commission Regulation 2023/2108 reduced maximum permitted nitrite levels in meat products effective October 2025 (80 mg/kg general, 55 mg/kg sterilized), responding to the EFSA 2017 finding that highly exposed children, infants, toddlers, and medium-exposure children may exceed the 0.07 mg/kg/day ADI. The FDA's substance-specific ppm caps under 21 CFR 172.175 reflect the same risk awareness, and are unusual within US food regulation since most preservatives use GMP-basis listings rather than substance-specific maximum limits. The kid_score_floor of 8 sits one point above the adult score because EFSA 2017 explicitly identified children as the population at greatest risk of ADI exceedance, and hot dogs, bacon, and deli meats are kid-staple foods that drive a higher per-body-weight nitrite intake than adult diets. The pregnancy_score_floor of 7 matches the adult score because while WHO recommends limiting processed meat during pregnancy and fetal methemoglobinemia from prenatal nitrite exposure is a documented endpoint, the regulatory guidance frames pregnancy intake as moderation rather than avoidance, distinguishing this from substances like Red 3 with pregnancy-specific mechanisms. The honest tension worth naming: sodium nitrite has a real protective function (preventing botulism in cured meats), and uncured products labeled \"no nitrites added\" typically substitute celery powder, which contains naturally-occurring nitrates that bacteria convert to nitrites in the meat through the same chemistry; the \"nitrite-free\" framing is largely cosmetic, and the actual lever for reducing N-nitroso exposure is reducing total processed meat consumption rather than choosing differently labeled processed meats.",
  },

  sulfites: {
    inci_name: "Sulfites",
    aliases: [
      "sulfur dioxide",
      "sulphur dioxide",
      "sulfites",
      "sulfite",
      "sulphites",
      "sulphite",
      "so2",
      "contains sulfites",
      "sodium sulfite",
      "sodium bisulfite",
      "sodium metabisulfite",
      "potassium metabisulfite",
      "potassium bisulfite",
      "calcium sulfite",
      "calcium bisulfite",
      "e220",
      "e221",
      "e222",
      "e223",
      "e224",
      "e226",
      "e227",
      "e228",
    ],
    hazard_class: "preservative",
    base_hazard_score: 6,
    nova_typical: 4,
    whole_food_indicator: false,
    quantity_threshold: null,
    pregnancy_concern: true,
    pregnancy_score_floor: 6,
    kid_concern: true,
    kid_score_floor: 7,
    regulatory_citations: [
      "FDA 21 CFR 182.3862 + 1986 labeling rule (21 CFR 130.9): Sulfur dioxide and the sulfite class (sodium sulfite, sodium bisulfite, sodium metabisulfite, potassium metabisulfite, calcium sulfite, calcium bisulfite, potassium bisulfite) are GRAS with limitations. Prohibited on meats, in foods recognized as vitamin B1 sources (sulfites destroy thiamine), and on fruits or vegetables intended to be served or sold raw to consumers. Permitted with ppm caps: less than 100 ppm in wines, dried fruits, molasses, lemon/lime juice, sauerkraut juice; 50-100 ppm in grape juice, wine vinegar, dried potatoes, maraschino cherries; 10-50 ppm in corn syrup, fresh shrimp, sauerkraut, pickled foods, frozen potatoes, jams. Foods containing 10 ppm or more total SO2 equivalents must declare sulfites on the label. The 1986 raw-produce ban (\"salad bar ban\") was driven by approximately 500 adverse reactions and 13 deaths reported to FDA from sulfite-treated fresh produce.",
      "EFSA Panel on Food Additives, 2016: \"Scientific Opinion on the re-evaluation of sulfur dioxide (E 220), sodium sulfite (E 221), sodium bisulfite (E 222), sodium metabisulfite (E 223), potassium metabisulfite (E 224), calcium sulfite (E 226), calcium bisulfite (E 227) and potassium bisulfite (E 228) as food additives\" (EFSA Journal 2016;14(4):4438). Established a TEMPORARY group ADI of 0.7 mg SO2 equivalents/kg bw/day, derived using a default uncertainty factor from a NOAEL of 70 mg/kg bw/day in a rat long-term toxicity study. The Panel noted multiple uncertainties in the available toxicology database and recommended re-evaluation within 5 years pending new studies.",
      "EFSA Panel on Food Additives and Flavourings, November 2022: \"Follow-up of the re-evaluation of sulfur dioxide (E 220), sodium sulfite (E 221), sodium bisulfite (E 222), sodium metabisulfite (E 223), potassium metabisulfite (E 224), calcium sulfite (E 226), calcium bisulfite (E 227) and potassium bisulfite (E 228)\" (EFSA Journal 2022;20(11):7594). Industry did not provide the requested new toxicity data within the 5-year window. The Panel WITHDREW the temporary group ADI, concluding that the available toxicology database is inadequate to derive any ADI. The Panel applied a Margin of Exposure approach instead, concluding that MOE should be at least 80, and found that calculated MOEs at the 95th percentile of dietary exposure were below 80 for all population groups except adolescents. This represents EFSA pulling the safety basis for sulfites without replacement, an unusual regulatory action.",
      "Asthmatic sensitivity profile: 1-10% of persons with asthma are sulfite-sensitive (estimated 170,000 to 1.7 million in the United States), per the 1985 FASEB Life Sciences Research Office report that informed the FDA 1986 actions. Bronchoconstriction in sensitive asthmatics is documented at SO2 levels as low as 0.1-0.5 ppm. Reactions range from urticaria, nausea, diarrhea, and dyspnea to anaphylactic-class responses including fatal shock. Recent mechanism research (2022 J Allergy Clin Immunol et al.) implicates SO2 inhibition of bitter-taste receptors and amplification of Th2 inflammatory responses in the airway susceptibility pathway. Sulfites are NOT among the FDA's major food allergens (Big Nine including sesame as of 2023) and are not subject to mandatory allergen labeling under FALCPA, but the 10 ppm declaration rule under 21 CFR 130.9 functions as de facto allergen labeling.",
    ],
    reasoning: "Sulfites (sulfur dioxide and the metabisulfite/bisulfite/sulfite salt class) preserve wines, dried fruits, dehydrated potato products, maraschino cherries, and pickled foods through antioxidant and antimicrobial activity. The hazard score of 6 reflects three converging evidence pathways. Allergen-class hazard: 1-10% of asthmatics are sulfite-sensitive (170,000 to 1.7 million people in the US), with documented reactions ranging from urticaria to anaphylactic-class fatal shock; the FDA's 1986 labeling rule (mandatory disclosure at 10 ppm SO2 equivalents) and concurrent ban on sulfite use in fresh-served raw produce were directly driven by approximately 500 adverse reactions and 13 deaths. Regulatory: EFSA established a temporary group ADI of 0.7 mg SO2 eq/kg bw/day in 2016 pending additional toxicology data, then WITHDREW that ADI in 2022 when industry did not provide the requested studies, concluding instead that calculated MOEs at the 95th percentile dietary exposure are below the safety threshold of 80 for all population groups except adolescents. Mechanistic: SO2 exposure inhibits bitter-taste receptor signaling in airway smooth muscle and amplifies Th2 inflammatory responses, providing a biological mechanism for the asthmatic susceptibility. The kid_score_floor of 7 sits one point above the adult score because asthma prevalence is higher in children, dried fruits and dehydrated potato products are commonly consumed by children, and EFSA's MOE-below-80 finding included child population groups; FDA's prohibition of sulfites on raw-served produce was specifically about uncontrolled-dose exposure scenarios (sulfite-treated salad bars), where children consuming multiple servings of treated produce faced amplified asthma risk. The pregnancy_score_floor of 6 matches the adult score because there is no pregnancy-specific sulfite mechanism documented; the asthmatic sensitivity concern is the same in pregnancy as in non-pregnancy. The honest tension worth naming: sulfites have real preservation function (without them, wine spoils within weeks and dried fruits oxidize within months), and the 1986 FDA action targeted high-exposure uncontrolled scenarios (sulfite-treated salad bars where dose varied unpredictably) rather than banning sulfites generally; non-asthmatic consumers tolerate typical food-additive levels of sulfites well, while asthmatics need to read labels carefully. The actual lever for sulfite-related risk reduction is not eliminating sulfites from the food supply but enabling sensitive individuals to identify and avoid them, which is precisely what the 10 ppm declaration rule accomplishes.",
  },

  bha: {
    inci_name: "BHA",
    aliases: [
      "bha",
      "butylated hydroxyanisole",
      "butylated hydroxy anisole",
      "e320",
      "e 320",
      "preservative e320",
      "ins 320",
    ],
    hazard_class: "preservative",
    base_hazard_score: 6,
    nova_typical: 4,
    whole_food_indicator: false,
    quantity_threshold: null,
    pregnancy_concern: true,
    pregnancy_score_floor: 6,
    kid_concern: true,
    kid_score_floor: 7,
    regulatory_citations: [
      "FDA 21 CFR 172.110 + 21 CFR 182.3169: BHA is permitted as an antioxidant with substance-specific ppm caps in some food categories (2 ppm in beverage/dessert dry mixes; up to 5000 ppm in some applications) and a GRAS basis with the limitation that total antioxidants in the food must not exceed 0.02% of the fat or oil content. Federal Register February 11, 2026 (Docket FDA-2026-N-0302): \"Butylated Hydroxyanisole (BHA); Request for Information\" opened a post-market safety reassessment, with FDA actively requesting current uses, exposure data, and safety information from industry. Public comment deadline April 13, 2026. This represents the first formal FDA reassessment of BHA in decades.",
      "IARC Monograph Volume 40 (1986): BHA classified Group 2B (possibly carcinogenic to humans) based on benign and malignant forestomach tumors in F344 rats and hamsters fed 0.5-2.0% BHA in diet for 2 years. Important honest framing: IARC subsequently determined that the forestomach tumor mechanism is not directly relevant to humans, since human anatomy lacks the rodent forestomach. The Group 2B classification has not been revoked despite the mechanistic finding, but the human-relevance question moderates the carcinogenicity case.",
      "US National Toxicology Program 15th Report on Carcinogens: BHA is listed as \"reasonably anticipated to be a human carcinogen\" based on the same forestomach data and supplementary toxicology evidence. The NTP listing is independent of IARC's classification and reflects the US federal authoritative-bodies view.",
      "EFSA Panel on Food Additives, 2011: \"Scientific Opinion on the re-evaluation of butylated hydroxyanisole - BHA (E 320) as a food additive\" (EFSA Journal 2011;9(10):2392). EFSA raised the ADI from the prior JECFA/SCF 1989 value of 0.5 mg/kg bw/day to 1.0 mg/kg bw/day, based on growth retardation, lethality, and behavioral effects in rat offspring as the critical endpoints. The ADI increase reflects a less-restrictive EU regulatory stance than the prior international consensus.",
    ],
    reasoning: "BHA (E320) is a synthetic phenolic antioxidant added to cereals, snack foods, vegetable oils, fats, dehydrated potato products, chewing gum, and fat-containing prepared foods to prevent oxidative rancidity. The hazard score of 6 reflects three converging evidence pathways alongside a genuine evidence asymmetry. Carcinogenicity: IARC classified BHA as Group 2B in 1986 based on forestomach tumors in rats and hamsters, and the US NTP lists BHA as \"reasonably anticipated to be a human carcinogen\" in the 15th Report on Carcinogens; the honest caveat is that IARC subsequently determined the forestomach mechanism is rat-specific and not directly relevant to human anatomy, though neither classification has been revoked. Regulatory: the FDA opened a formal post-market reassessment in February 2026 (Federal Register Docket FDA-2026-N-0302), the first such reassessment in decades, with comment deadline April 13, 2026; this is genuine regulatory motion, though it is information-gathering rather than restrictive action. Mechanistic: independent research has documented anti-estrogenic activity in immature female rats, enhanced estrogen metabolism via liver microsomal glucuronidation, and thyroid hormone modulation; 2024-2025 network toxicology studies map BHA to liver, kidney, and neural targets via IL-17 and JAK-STAT pathways, and a 2023 Journal of the Science of Food and Agriculture review explicitly recommended safer antioxidant alternatives. The kid_score_floor of 7 sits one point above the adult score because the EFSA 2011 ADI basis (growth retardation, lethality, and behavioral effects in rat offspring) is developmentally relevant, and BHA-containing foods like cereals and snack foods are kid staples that drive higher per-body-weight exposure than adult diets. The pregnancy_score_floor of 6 matches the adult score because the rat-offspring developmental endpoints in the EFSA basis are general-population concerns rather than pregnancy-specific mechanisms; while developmental effects in rat offspring are relevant context, no human pregnancy-specific mechanism is documented. The honest tension worth naming: BHA has a real protective function (preventing oxidative rancidity in fats and oils that would otherwise oxidize within weeks), and the 2011 EFSA reassessment that raised the ADI from 0.5 to 1.0 mg/kg/day is a substantive lessening of regulatory concern at the EU food-additive level. The IARC 2B classification carries a rat-specific mechanism caveat, and the EU SCCS's separate 2026 finding that BHA is safe in cosmetics at typical concentrations both moderate the case against BHA. The active FDA 2026 reassessment plus the convergent endocrine disruption research base sustain the score 6 as the appropriate evidence-of-concern band, rather than the higher score 7 of the McCann-tested dyes.",
  },

  bht: {
    inci_name: "BHT",
    aliases: [
      "bht",
      "butylated hydroxytoluene",
      "butylated hydroxy toluene",
      "e321",
      "e 321",
      "preservative e321",
      "ins 321",
    ],
    hazard_class: "preservative",
    base_hazard_score: 5,
    nova_typical: 4,
    whole_food_indicator: false,
    quantity_threshold: null,
    pregnancy_concern: true,
    pregnancy_score_floor: 5,
    kid_concern: true,
    kid_score_floor: 6,
    regulatory_citations: [
      "FDA 21 CFR 172.115 + 21 CFR 182.3173: BHT is permitted as an antioxidant with use-case-specific ppm caps (10 ppm in potato granules; 50 ppm alone or with BHA in dry breakfast cereals, sweet potato flakes, dehydrated potato; 200 ppm in shortening emulsion stabilizers) and a GRAS basis at 0.02% of fat or oil content. BHT is officially on the FDA's 2026 Human Foods Program priority list for post-market reassessment, with the agency stating it plans to issue additional Requests for Information including BHT following completion of the BHA review (Federal Register Docket FDA-2026-N-0302). The BHT review is forecasted but not yet filed in the Federal Register, distinguishing it from the active BHA reassessment.",
      "IARC Monograph Volume 40 (1986) and Supplement 7 (1987): BHT classified Group 3 (not classifiable as to its carcinogenicity to humans). Animal data showed mixed and inconsistent findings (pulmonary tumors in some mouse studies but not confirmed in replications by the same investigators with larger cohorts). BHT did not induce DNA damage in B. subtilis or mutation in Salmonella typhimurium, did not induce chromosomal aberrations in plants or Drosophila, and is not of concern for genotoxicity. The Group 3 classification distinguishes BHT from its paired antioxidant BHA, which is classified Group 2B.",
      "EFSA Panel on Food Additives, March 2012: \"Scientific Opinion on the re-evaluation of butylated hydroxytoluene BHT (E 321) as a food additive\" (EFSA Journal 2012;10(3):2588). Established an ADI of 0.25 mg/kg bw/day, derived from a NOAEL of 25 mg/kg bw/day in 2-generation studies (litter size and pup body weight as critical endpoints) with an uncertainty factor of 100. The Panel concluded that BHT is not of concern for genotoxicity and that any carcinogenicity would be thresholded. Adult exposure is unlikely to exceed the ADI at the mean or 95th percentile, but child exposure in some European countries (Finland, The Netherlands) may exceed the ADI at the 95th percentile from food-additive use alone.",
      "Recent research and lateral regulatory indicators: De Abrew et al. 2022 (Toxicological Sciences 190(2):227-241, PubMed 36161505) applied a New Approach Methodology framework to assess BHT for endocrine disruption potential. A 2025 Scientific Reports paper documented BHT-induced spinal cord defects and scoliosis in zebrafish via Hedgehog pathway inhibition, providing a developmental-toxicity mechanism. UK Statutory Instrument: The Cosmetic Products (Restriction of Chemical Substances) Regulations 2024 (April 1, 2024) added BHT to UK restricted substances, capping leave-on oral care products at 0.001% (versus EU's 0.8% limit), based on a UK SAG-CS scientific opinion published by the Office for Product Safety and Standards. The UK restriction is narrowly scoped to oral care cosmetic products and does not extend to food use, but represents a lateral regulatory signal of ED-related concern.",
    ],
    reasoning: "BHT (E321) is the paired synthetic antioxidant to BHA, used in cereals, snack foods, vegetable oils, fats, dehydrated potato products, butter, gum, and fat-containing prepared foods to prevent oxidative rancidity, often listed alongside BHA on labels. The hazard score of 5 sits one point below BHA's 6 because BHT's evidence base is genuinely thinner across multiple regulatory and toxicological dimensions. Carcinogenicity asymmetry: IARC classified BHT as Group 3 (cannot classify) in Supplement 7 (1987), distinct from BHA's Group 2B; BHT is not on the US NTP Report on Carcinogens list while BHA is; BHT shows negative genotoxicity across multiple standard assays while BHA does not; the EFSA 2012 reassessment concluded BHT's tumor promotion would be thresholded, a more permissive carcinogenicity framing than BHA's. Regulatory: EFSA established the BHT ADI at 0.25 mg/kg bw/day in 2012 (more cautious than BHA's 1.0 mg/kg/day from 2011), but with the explicit finding that adult exposure stays below the ADI; the kid-relevant finding is that child exposure in some European countries (Finland, The Netherlands) may exceed the ADI at the 95th percentile of intake. Mechanistic: De Abrew et al. 2022 (Toxicological Sciences 190(2):227-241) applied New Approach Methodology to BHT for endocrine disruption potential, and a 2025 Scientific Reports paper documented BHT-induced spinal cord defects and scoliosis in zebrafish via inhibition of the Hedgehog signaling pathway, providing a developmental-toxicity mechanism distinct from BHA's anti-estrogenic activity. Lateral regulatory: the UK's 2024 restriction of BHT in leave-on oral care cosmetic products to 0.001% (versus EU's 0.8%) is a narrow but real regulatory action; the FDA has BHT on its 2026 Human Foods Program priority list with a forecasted Request for Information following the active BHA review. The kid_score_floor of 6 sits one point above the adult score because EFSA explicitly identified children at the 95th percentile of intake in some EU countries as exceeding the ADI, and BHT-containing foods like cereals and snack foods are kid staples that drive higher per-body-weight exposure than adult diets. The pregnancy_score_floor of 5 matches the adult score because the rat-offspring developmental endpoints in the EFSA basis are general-population concerns rather than pregnancy-specific mechanisms; while developmental effects in rat 2-generation studies are relevant context, no human pregnancy-specific mechanism is documented. The honest tension worth naming: BHT has a real protective function (preventing oxidative rancidity in fats and oils, often working in synergy with BHA in the same product), and the regulatory case against BHT is materially weaker than the case against BHA across IARC classification, NTP listing, FDA review status, and genotoxicity findings. The score 5 reflects the genuine evidence asymmetry rather than a copy of BHA's score. The score remains above natural-color or whole-food anchors because the EFSA child-exceedance flag, the 2025 zebrafish developmental-toxicity finding, and the UK 2024 oral care restriction are real signals warranting score above the inert band.",
  },

  benzoates: {
    inci_name: "Benzoates",
    aliases: [
      "sodium benzoate",
      "potassium benzoate",
      "calcium benzoate",
      "benzoic acid",
      "benzoate",
      "benzoates",
      "e210",
      "e 210",
      "e211",
      "e 211",
      "e212",
      "e 212",
      "e213",
      "e 213",
      "preservative e211",
      "preservative e212",
      "ins 211",
      "ins 212",
    ],
    hazard_class: "preservative",
    base_hazard_score: 5,
    nova_typical: 4,
    whole_food_indicator: false,
    quantity_threshold: null,
    pregnancy_concern: true,
    pregnancy_score_floor: 5,
    kid_concern: true,
    kid_score_floor: 6,
    regulatory_citations: [
      "FDA 21 CFR 184.1733 (sodium benzoate) and adjacent listings for potassium benzoate, calcium benzoate, and benzoic acid: GRAS-affirmed antimicrobial preservatives + flavoring adjuvants for acidic foods (salad dressings, carbonated soft drinks, jams, fruit juices, pickles, condiments). Maximum use level 0.1 percent of food on a current GMP basis. The four benzoate compounds (benzoic acid E210, sodium benzoate E211, potassium benzoate E212, calcium benzoate E213) share regulatory framework and toxicological profile; the cation does not materially change the hazard.",
      "EFSA Panel on Food Additives, 2016: \"Scientific Opinion on the re-evaluation of benzoic acid (E 210), sodium benzoate (E 211), potassium benzoate (E 212) and calcium benzoate (E 213) as food additives\" (EFSA Journal 2016). Established a group ADI of 5 mg/kg bw/day expressed as benzoic acid, covering all four compounds. Conclusions: no concern with respect to genotoxicity, no reproductive toxicity, no carcinogenic potential at tested levels. Approximately 99 percent of consumed benzoates are metabolized by the liver and excreted as glycine conjugates (hippuric acid), a well-characterized clearance pathway.",
      "FDA 2005-2007 benzene-in-beverages investigation: benzene (IARC Group 1 carcinogen) can form via decarboxylation of benzoic acid in the presence of ascorbic acid (vitamin C) catalyzed by iron and copper metal ions, accelerated by heat and light exposure. Industry first informed FDA of this pathway in 1990. Between November 2005 and May 2007, FDA analyzed approximately 200 beverage samples and found 10 with benzene above 5 ppb (the drinking water limit). All 10 products were reformulated or discontinued by manufacturers; reformulated products subsequently tested below 1.5 ppb benzene. The headline benzene-formation problem was substantially mitigated by industry reformulation, though products combining benzoates with ascorbic acid without reformulation awareness retain residual risk.",
      "McCann et al. 2007 (The Lancet 370(9598):1560-1567) and EFSA 2008 follow-up: sodium benzoate was a component of BOTH active mixtures (Mix A and Mix B) in the University of Southampton randomized double-blind placebo-controlled trial. Mix A produced significant hyperactivity increases in both 3-year-olds and 8/9-year-olds; Mix B in 8/9-year-olds only. Because the study tested combinations of dyes plus sodium benzoate rather than isolated benzoate, the EFSA AFC Panel 2008 follow-up (EFSA Journal 2008;6(3):660) characterized the evidence as showing \"limited evidence that the mixtures of additives tested had a small effect on the activity and attention of some children, though effects observed were not consistent for the two age groups and for the two mixtures.\" Sodium benzoate's specific contribution to the hyperactivity signal is uncertain.",
      "Recent gut microbiome research 2022-2025: a 2025 MDPI Foods study (PMC12428287) tested sodium benzoate at 3.5 g/L (approximately 10x the ADI) across age groups and found minimal effect on overall gut microbial diversity, with modest changes (Pseudomonadota drop, butyrate increase, propionate decrease). A 2023 PMC10670719 paper found sodium benzoate selectively suppresses beneficial Lactobacillus and Clostridium tyrobutyricum while leaving pro-inflammatory bacteria relatively unaffected. A 2025 FASEB Journal review (Seto et al.) catalogued benzoates among food additives with emerging detrimental roles on gut health. The 2022-2025 evidence base shows modest direct microbiome effects at typical dietary exposure, with selective beneficial-bacteria suppression as the most consistent finding.",
    ],
    reasoning: "Benzoates (benzoic acid E210, sodium benzoate E211, potassium benzoate E212, calcium benzoate E213) are the most common preservative class in acidic foods and beverages, providing antimicrobial activity in salad dressings, carbonated soft drinks, jams, fruit juices, pickles, condiments, and many shelf-stable acidic products. The hazard score of 5 reflects four converging evidence pathways alongside an honestly-bounded carcinogen-formation concern. Carcinogenicity: benzoates themselves are NOT classified as carcinogens (EFSA 2016 found no carcinogenic potential, no genotoxicity, no reproductive toxicity), but the well-documented benzene formation pathway when benzoates combine with ascorbic acid (vitamin C) under heat or light catalysis IS a real concern; benzene is IARC Group 1. Behavioral: sodium benzoate was in both McCann 2007 trial mixtures, but as part of dye-plus-benzoate combinations rather than isolated; the EFSA 2008 follow-up characterized the evidence as \"limited\" and noted inconsistent effects across age groups and mixtures, so attributing hyperactivity to benzoate specifically (versus the dye component) is uncertain. Regulatory: the FDA's 2005-2007 investigation found 10 of approximately 200 sampled beverages exceeded the 5 ppb drinking-water benzene limit; all 10 were reformulated or discontinued, with reformulated products subsequently testing below 1.5 ppb; the EFSA 2016 group ADI of 5 mg/kg bw/day is roughly 20x more permissive than BHT's 0.25 mg/kg, reflecting the lower direct toxicity profile. Microbiome: 2022-2025 research shows benzoates have modest direct gut effects at typical dietary exposure, with selective suppression of beneficial Lactobacillus and butyrate-producing Clostridium species as the most consistent finding; even at 10x the ADI, overall microbial diversity was minimally affected. The kid_score_floor of 6 sits one point above the adult score because children consume more soda and fruit-flavored beverages per body weight, and the benzoate plus ascorbic acid scenario is most common in fruit-flavored fortified drinks and fruit juices that are kid-staple products. The pregnancy_score_floor of 5 matches the adult score because EFSA found no reproductive toxicity, the benzene formation scenarios are not pregnancy-amplified, and 99 percent of consumed benzoates are cleared via the well-characterized hippuric acid pathway. The honest tension worth naming: benzoates have a real preservation function (without them, acidic shelf-stable beverages develop microbial spoilage rapidly), and the EFSA 2016 reassessment found benzoates themselves have low direct toxicity at typical use levels. The benzene formation pathway is real chemistry, but the FDA 2005-2007 industry reformulation substantially addressed it. The practical lever for risk reduction is awareness of label combinations (benzoate plus ascorbic acid in fruit-flavored beverages, especially when stored warm) rather than avoiding benzoates broadly. The score 5 reflects this bounded concern: real but moderate, well-controlled in modern formulations, with the specific actionable risk being the benzoate-plus-ascorbic-acid combination scenario in fruit-flavored beverages.",
  },

  sorbates: {
    inci_name: "Sorbates",
    aliases: [
      "potassium sorbate",
      "sorbic acid",
      "calcium sorbate",
      "sorbate",
      "sorbates",
      "e200",
      "e 200",
      "e202",
      "e 202",
      "e203",
      "e 203",
      "preservative e202",
      "ins 200",
      "ins 202",
    ],
    hazard_class: "preservative",
    base_hazard_score: 4,
    nova_typical: 4,
    whole_food_indicator: false,
    quantity_threshold: null,
    pregnancy_concern: true,
    pregnancy_score_floor: 4,
    kid_concern: true,
    kid_score_floor: 5,
    regulatory_citations: [
      "FDA 21 CFR 182.3640: Potassium sorbate is GRAS-listed under GMP basis only, with no substance-specific ppm caps. Sorbic acid (the parent compound) and calcium sorbate are similarly GRAS-listed under adjacent provisions. The three sorbate compounds (sorbic acid E200, potassium sorbate E202, calcium sorbate E203) share regulatory framework and toxicological profile; the cation does not materially change the hazard. Used as an antimicrobial preservative in cheese, wine, baked goods, dried meats, dips, dressings, fruit products, and many shelf-stable acidic foods.",
      "EFSA Panel on Food Additives, two-stage reassessment: 2015 \"Scientific Opinion on the re-evaluation of sorbic acid (E 200), potassium sorbate (E 202) and calcium sorbate (E 203) as food additives\" (EFSA Journal 2015;13(6):4144) established a temporary group ADI of 3 mg sorbic acid/kg bw/day from a 2-generation reproductive toxicity NOAEL of 300 mg/kg/day with uncertainty factor 100. The 2019 follow-up (EFSA Journal 2019;17(3):5625) reassessed based on new Extended One-Generation Reproductive Toxicity Study (EOGRTS) data and raised the group ADI to 11 mg sorbic acid/kg bw/day. The 2019 ADI is substantially more permissive than the 2015 temporary value and considerably higher than other Bucket 2 preservatives (benzoates 5 mg/kg, BHT 0.25 mg/kg), reflecting the relatively low direct toxicity profile.",
      "Genotoxicity research base (mixed evidence): Kitano-Fukukawa et al. 2002 (PubMed 12176085) demonstrated that potassium sorbate combined with ascorbic acid and iron salts produces decomposition products with mutagenic activity in the Ames test (TA100 strain, without S-9 mix), with mutagenic activity increasing with reaction period. Some in vitro studies report genotoxicity in human lymphocytes including chromosomal aberrations and sister chromatid exchanges. Earlier studies (Munzner et al. 1992, Schiffmann and Schlatter 1992) found no genotoxic potential under different test conditions. The mixed evidence base supports concern at high-iron, high-ascorbic-acid combination scenarios while sustaining EFSA's overall assessment of low direct genotoxicity at typical use levels.",
      "Gut microbiome research 2022-2025 (consistent emerging signal): multiple independent studies have documented potassium sorbate effects on gut microbiota that are stronger than initially anticipated. PMC8617889 (2021/2022) showed potassium sorbate induced the LOWEST gut microbial diversity among common food preservatives tested, with selective suppression of beneficial Lactobacillus paracasei and Clostridium tyrobutyricum. A 2022 npj Science of Food paper documented hyperglycemic effects after 2 weeks of potassium sorbate exposure in mice. A 2024 paper (PubMed 38211766) examined systemic inflammation and gut microbiota effects with continuous intake versus washout. A 2025 ScienceDirect paper documented that continuous potassium sorbate intake disrupts metabolic homeostasis and enhances lipid deposition via gut microbiota alterations. The 2022-2025 evidence base is more concerning than the EFSA 2015 and 2019 reassessments captured, warranting continued regulatory attention.",
    ],
    reasoning: "Sorbates (sorbic acid E200, potassium sorbate E202, calcium sorbate E203) are the most widely used food preservatives globally, providing antimicrobial activity in cheese, wine, baked goods, dips, dressings, dried meats, and a broad range of shelf-stable acidic products. The hazard score of 4 reflects four converging evidence pathways and positions sorbates as the lowest-concern entry within Bucket 2 while remaining above natural-color anchors. Carcinogenicity: sorbates are NOT classified as carcinogens by IARC, NTP, or EFSA, and the EFSA 2019 reassessment raising the group ADI to 11 mg sorbic acid/kg bw/day reflects substantively low direct toxicity at typical use levels (3.6x more permissive than the 2015 temporary value). Regulatory: EFSA's two-stage reassessment arc (2015 temporary ADI 3 mg/kg → 2019 confirmed ADI 11 mg/kg after EOGRTS data) is the most permissive trajectory among Bucket 2 entries; no FDA reassessment is currently underway, distinguishing sorbates from BHA's active 2026 review and BHT's forecasted review. Genotoxicity: the Kitano-Fukukawa 2002 finding that potassium sorbate plus ascorbic acid plus iron salts produces mutagenic decomposition products is real chemistry analogous to (but lower-concern than) the benzoate-plus-vitamin-C benzene formation pathway; mixed evidence across independent studies supports concern at high-iron, high-ascorbic-acid scenarios while sustaining low direct genotoxicity at typical use. Microbiome and metabolic: the 2022-2025 research base is more concerning than initial EFSA assessments captured, with multiple studies showing potassium sorbate induces the lowest gut microbial diversity among common preservatives, selectively suppresses beneficial Lactobacillus and Clostridium tyrobutyricum, produces hyperglycemic effects in 2-week mouse studies, and a 2025 paper documented disrupted metabolic homeostasis and enhanced lipid deposition via microbiota alterations. The kid_score_floor of 5 sits one point above the adult score because the developing gut microbiome is more sensitive to dysbiosis than the adult microbiome, the hyperglycemic mouse findings are developmentally relevant, and potassium sorbate is ubiquitous in kid-staple foods (fruit-flavored yogurts, baked goods, cheese sticks, dried fruit snacks). The pregnancy_score_floor of 4 matches the adult score because the EFSA 2019 EOGRTS data was reassuring on reproductive endpoints, and no pregnancy-specific mechanism is documented; the gut microbiome concerns are general-population rather than pregnancy-amplified. The honest tension worth naming: sorbates have a real preservation function (without them, cheese, wine, baked goods, and acidic shelf-stable products develop microbial spoilage rapidly), and the regulatory case is materially weaker than for any other Bucket 2 entry across IARC classification, FDA reassessment status, and ADI permissiveness. The score 4 reflects sorbates as the lowest-concern synthetic preservative in Bucket 2. The emerging 2022-2025 gut microbiome and metabolic findings prevent the score from dropping toward the natural-color band where annatto sits at 2.",
  },

  propionates: {
    inci_name: "Propionates",
    aliases: [
      "calcium propionate",
      "sodium propionate",
      "potassium propionate",
      "propionic acid",
      "propionate",
      "propionates",
      "e280",
      "e 280",
      "e281",
      "e 281",
      "e282",
      "e 282",
      "e283",
      "e 283",
      "preservative e282",
      "ins 280",
      "ins 281",
      "ins 282",
      "ins 283",
    ],
    hazard_class: "preservative",
    base_hazard_score: 4,
    nova_typical: 4,
    whole_food_indicator: false,
    quantity_threshold: null,
    pregnancy_concern: true,
    pregnancy_score_floor: 4,
    kid_concern: true,
    kid_score_floor: 5,
    regulatory_citations: [
      "FDA 21 CFR 184.1221 (calcium propionate) and adjacent listings for sodium propionate, potassium propionate, and propionic acid: GRAS-affirmed antimicrobial preservatives for baked goods (the dominant use, especially in bread to inhibit Bacillus mesentericus rope spoilage and mold), cheeses, confections, gelatins, puddings, jams, and jellies. No use-level limitations beyond current good manufacturing practice. The four propionate compounds (propionic acid E280, sodium propionate E281, calcium propionate E282, potassium propionate E283) share regulatory framework and toxicological profile; the cation does not materially change the hazard. GRAS regulation became effective April 3, 1984.",
      "EFSA Panel on Food Additives, 2014: \"Scientific Opinion on the re-evaluation of propionic acid (E 280), sodium propionate (E 281), calcium propionate (E 282) and potassium propionate (E 283) as food additives\" (EFSA Journal 2014;12(7):3779). The Panel did NOT allocate an ADI, the most permissive regulatory stance in Bucket 2 (compared to benzoates 5 mg/kg, BHT 0.25 mg/kg, sorbates 11 mg/kg). JECFA earlier characterized propionates as \"ADI not limited.\" The forestomach hyperplasia observed in long-term rodent studies was determined NOT relevant to humans because human anatomy lacks the rodent forestomach (same caveat that applies to BHA). Critically, propionates are naturally occurring substances in the normal diet: propionate is a short-chain fatty acid (SCFA) produced endogenously by gut microbiota from dietary fiber fermentation, distinguishing propionates conceptually from synthetic preservatives like BHA/BHT.",
      "Dengate and Ruben 2002 (Journal of Paediatrics and Child Health, August 2002): \"Controlled trial of cumulative behavioural effects of a common bread preservative.\" Double-blind placebo-controlled crossover trial of 27 children, challenged with calcium propionate or placebo via daily bread. The children were pre-selected from a Royal Prince Alfred Hospital additive-elimination diet program, meaning the cohort was sensitive subpopulation rather than general population. 52% showed behavioral changes for the worse; 19% showed statistically significant improvement on placebo. Honest framing: this is a real but bounded signal — n=27, pre-selected sensitive children, single research group, not independently replicated, smaller specialty journal. Materially weaker evidence than McCann 2007 (n=297, general population, Lancet) but specifically targeted bread preservatives in children, where bread is a kid-staple food.",
      "Recent research 2021-2025: a 2021 pilot study (PMC8314753, n=14) examined acute effects of propionic acid on glucose metabolism in humans, finding that 1 g calcium propionate in a mixed meal produced significant postprandial increases in glucagon, norepinephrine, and insulin resistance compared to control. A 2024 study (PubMed 39262268) documented cellular toxicity of calcium propionate in human lymphocytes in vitro. In contrast, 2025 research on sodium propionate in healthy mice (Frontiers in Microbiology) found NO adverse effects, with the study noting propionate's broader beneficial roles as an endogenous SCFA: enhancing insulin sensitivity in some contexts, activating the APN-AMPK-PPARα pathway with therapeutic effects against fatty liver, and suppressing inflammation. The mixed evidence base reflects propionate's dual character as both an added preservative and a normal endogenous metabolite.",
    ],
    reasoning: "Propionates (propionic acid E280, sodium propionate E281, calcium propionate E282, potassium propionate E283) are the dominant preservatives in commercial bread and other baked goods, where they inhibit mold growth and Bacillus mesentericus rope spoilage; calcium propionate (E282) is by far the most common form on US labels. The hazard score of 4 reflects four converging evidence pathways alongside a unique naturally-occurring SCFA context that distinguishes propionates from other Bucket 2 preservatives. Carcinogenicity: propionates are NOT classified as carcinogens by IARC, NTP, or EFSA, and the EFSA 2014 reassessment explicitly noted that the forestomach hyperplasia observed in long-term rodent studies is not relevant to humans because human anatomy lacks the rodent forestomach (the same human-relevance caveat that applies to BHA). Regulatory: EFSA 2014 did NOT allocate an ADI and JECFA characterized propionates as \"ADI not limited,\" the most permissive regulatory stance in Bucket 2 (more permissive than sorbates' 11 mg/kg, benzoates' 5 mg/kg, or BHT's 0.25 mg/kg). Naturally-occurring SCFA context: propionate is endogenously produced by gut microbiota from dietary fiber fermentation, and as an SCFA it has documented beneficial roles including insulin sensitivity enhancement, APN-AMPK-PPARα activation with therapeutic effects against fatty liver, and inflammation suppression; this conceptually differentiates propionates from synthetic preservatives like BHA/BHT, since adding propionate to food increases an endogenously-produced metabolite rather than introducing a foreign substance. Behavioral signal: Dengate and Ruben 2002 (Journal of Paediatrics and Child Health) found 52% of 27 pre-selected sensitive children showed behavioral worsening on calcium propionate via daily bread challenge, but this was a small cohort already on additive-elimination diet, single-group, not independently replicated, and materially weaker evidence than McCann 2007 in scale and study population; it remains the specific calcium propionate behavioral signal worth noting honestly. Metabolic signal: a 2021 pilot study (n=14) documented acute postprandial increases in glucagon, norepinephrine, and insulin resistance from 1 g calcium propionate in mixed meals; a 2024 in vitro paper showed cellular toxicity in human lymphocytes; these are real signals at higher acute exposures while sustaining EFSA's overall assessment of low direct toxicity. The kid_score_floor of 5 sits one point above the adult score because Dengate 2002 specifically targeted children, bread is a universal kid-staple food driving high per-body-weight exposure, and the behavioral signal in sensitive children is real even if cohort selection limits generalization. The pregnancy_score_floor of 4 matches the adult score because no pregnancy-specific mechanism is documented and the EFSA 2014 reassessment did not flag reproductive endpoints. The honest tension worth naming: propionates have the strongest \"naturally occurring\" framing of any Bucket 2 preservative since the body produces propionate endogenously from fiber fermentation, and the EFSA \"ADI not allocated\" reflects substantively low direct toxicity. The Dengate 2002 behavioral signal is real but bounded; the 2021 acute metabolic findings are real but at gram-scale doses unlikely from typical bread consumption. The score 4 reflects the dual character of propionates as preservatives. Real but moderate concern from the bread-specific behavioral and acute-metabolic signals is set against the most permissive regulatory stance in Bucket 2 and the unique endogenous-SCFA context that no other preservative shares.",
  },

  // ===========================================================
  // Bucket 3 — Sweeteners
  // ===========================================================
  // High-intensity artificial sweeteners (aspartame, sucralose,
  // acesulfame potassium, saccharin) plus naturally-derived
  // sweeteners (stevia) plus polyol sweeteners (erythritol).
  // hazard_class taxonomy: artificial_sweetener / natural_sweetener
  // / polyol_sweetener — distinguishes synthetic from naturally
  // derived from sugar-alcohol categories at the schema level.
  // The honest framing in reasoning paragraphs should acknowledge
  // when the regulatory paper trail is split (e.g., aspartame's
  // IARC 2B vs JECFA reaffirmation) rather than presenting unified
  // consensus where genuine asymmetry exists.
  // ===========================================================

  aspartame: {
    inci_name: "Aspartame",
    aliases: [
      "aspartame",
      "e951",
      "e 951",
      "ins 951",
      "sweetener e951",
      "nutrasweet",
      "equal",
      "amino sweet",
      "aminosweet",
    ],
    hazard_class: "artificial_sweetener",
    base_hazard_score: 6,
    nova_typical: 4,
    whole_food_indicator: false,
    quantity_threshold: null,
    pregnancy_concern: false,
    pregnancy_score_floor: 6,
    kid_concern: true,
    kid_score_floor: 7,
    regulatory_citations: [
      "FDA 21 CFR 172.804: Aspartame was first approved in 1974 (G.D. Searle petition) for table use and dry food applications as a sweetener and flavor enhancer. The acceptable daily intake of 50 mg/kg bw/day was established in 1983 (48 FR 31376, July 8, 1983) following review of FAP 2A3661 for carbonated beverage use. Aspartame received general-purpose sweetener status in 1996 (61 FR 33654, June 28, 1996), which replaced 23 specific listed uses with a single category. The current regulation results from 27 separate food additive petitions reviewed since 1974. Listing remains active as of May 2026.",
      "IARC Monographs Volume 134 (Working Group Meeting 134, Lyon, June 6-13, 2023; advance publication 29 April 2024): classified aspartame Group 2B (possibly carcinogenic to humans) on the basis of limited evidence for cancer in humans (hepatocellular carcinoma signal across three epidemiological studies of artificially sweetened beverages), limited evidence for cancer in experimental animals, and limited mechanistic evidence. Group 2B is a hazard-identification finding indicating possible carcinogenicity; the same category contains aloe vera extract, lead, and gasoline engine exhaust.",
      "JECFA July 14, 2023 (joint release with IARC) and EFSA Scientific Opinion on the re-evaluation of aspartame (E 951) as a food additive (EFSA Journal 2013;11(12):3496, 10 December 2013): JECFA reaffirmed and EFSA established the acceptable daily intake of 0-40 mg/kg bw/day. Per the WHO joint release, IARC and JECFA answer different questions and are not contradictory: IARC = hazard identification (does the agent have any carcinogenic potential?); JECFA = risk assessment (what real-world dose causes harm?). JECFA quantification: a 70 kg adult would need to consume 9-14 cans of diet soft drink per day (containing 200-300 mg aspartame each) to exceed the ADI, assuming no other dietary aspartame. EFSA 2013 specifically cleared pregnancy: at the ADI plus dietary phenylalanine, peak plasma phenylalanine concentrations in normal and PKU-heterozygote pregnant women do not exceed the clinical guideline threshold for adverse fetal effects. EFSA 2013 also concluded that aspartame does not harm the brain, nervous system, or affect behavior or cognitive function in children or adults.",
      "FDA 21 CFR 201.21 and FDA food labeling rules: aspartame hydrolyzes in the intestinal lumen to phenylalanine (50%), aspartic acid (40%), and methanol (10%). Foods containing aspartame must declare phenylalanine in the ingredient list, and over-the-counter and prescription drugs containing aspartame must carry the warning \"Phenylketonurics: Contains Phenylalanine (_)mg Per (Dosage Unit)\" under the Precautions section. The labeling protects consumers with phenylketonuria (PKU), a genetic disorder affecting roughly 1:10,000-15,000 US births in which patients cannot safely metabolize phenylalanine; heterozygote carriers occur in roughly 1:50 of the population. The methanol metabolite, sometimes raised as a separate concern, occurs at quantities below typical fruit juice methanol content; phenylalanine is the actionable regulatory driver.",
      "Recent peer-reviewed research (2024-2025): a 2024 large prospective cohort (Association between Aspartame Consumption and Cancer Risk: Evidence from a Large Prospective Cohort, Journal of Cancer Prevention) found aspartame consumers had higher all-cancer, obesity-related cancer, non-obesity-related cancer, digestive cancer, and female reproductive cancer risk versus nonconsumers, with no clear dose-response relationship; authors urged cautious interpretation pending replication. A 2025 cardiovascular animal study found that aspartame triggers elevated insulin contributing to atherosclerosis and downstream inflammation. The Aspartame and Human Health mini-review (MDPI 2025) and the Frontiers in Medicine review of artificial sweeteners and chronic disease (DOI 10.3389/fmed.2025.1647178, 8 September 2025) both conclude that consensus remains divided on systemic effects (metabolic, hepatic, cardiovascular, gastrointestinal) and that well-controlled longitudinal human studies are warranted. The research base supports moderate concern, not crisis-grade signal.",
    ],
    reasoning: "Aspartame (E951, NutraSweet, Equal) is a high-intensity artificial sweetener that has been FDA-approved since 1974 and reaffirmed safe by JECFA and EFSA at acceptable daily intakes of 50 and 40 mg/kg bw/day respectively. In June 2023, IARC classified aspartame Group 2B (possibly carcinogenic to humans) on the basis of limited evidence for hepatocellular carcinoma across three epidemiological studies of artificially sweetened beverages. The same week, JECFA reaffirmed the ADI unchanged. This is not a scientific disagreement. Per the WHO joint release of 14 July 2023, IARC asks whether a substance has any carcinogenic potential (hazard identification) while JECFA asks what real-world dose actually causes harm (risk assessment); both findings are honestly represented here. Aspartame metabolizes to phenylalanine (50%), aspartic acid (40%), and methanol (10%); the phenylalanine metabolite is the basis for the FDA's mandatory PKU labeling requirement (21 CFR 201.21), since people with phenylketonuria (~1:10,000 US births, ~1:50 heterozygote carriers) cannot safely metabolize phenylalanine. The methanol fraction, sometimes raised as a separate concern, occurs at quantities below typical fruit juice methanol content. Recent 2024-2025 research raises non-resolved questions: a 2024 prospective cohort found higher all-cancer risk in aspartame consumers but with no clear dose-response, and 2025 cardiovascular animal work found aspartame-triggered insulin elevation contributing to atherosclerosis. None of this is panic-grade evidence; it is unresolved. The kid_score_floor of 7 is set one step above adult because children consume aspartame heavily through diet sodas, sugar-free yogurts, and sugar-free gums, with per-body-weight intake higher than adults, and emerging cardiovascular and metabolic signals affect developing systems differently than adult systems. The pregnancy_score_floor of 6 matches the adult score because EFSA's 2013 reassessment explicitly cleared pregnancy at the ADI. The base_hazard_score of 6 sits lower than sodium nitrite (7) because mechanistic carcinogenicity evidence for aspartame is weaker and no NOAEC-class signal exists; higher than sorbates (4) because the IARC 2B classification combined with emerging cardiovascular research warrants non-trivial concern. Honest framing: 50+ years of approval and explicit child and pregnancy clearance from EFSA, but unresolved cancer and cardiovascular questions that justify moderate concern when found in a product, especially products marketed to children.",
  },

  hfcs: {
    inci_name: "High-Fructose Corn Syrup",
    aliases: [
      "high fructose corn syrup",
      "high-fructose corn syrup",
      "hfcs",
      "hfcs-42",
      "hfcs 42",
      "hfcs-55",
      "hfcs 55",
      "hfcs-90",
      "hfcs 90",
      "fructose corn syrup",
      "isolated fructose",
      "isomerized corn syrup",
    ],
    hazard_class: "added_sugar",
    base_hazard_score: 5,
    nova_typical: 4,
    whole_food_indicator: false,
    quantity_threshold: null,
    pregnancy_concern: false,
    pregnancy_score_floor: 5,
    kid_concern: true,
    kid_score_floor: 6,
    regulatory_citations: [
      "FDA 21 CFR 184.1866: high-fructose corn syrup is affirmed Generally Recognized as Safe (GRAS) as a direct human food ingredient effective August 23, 1996 (Federal Register Vol. 61 No. 165, pp. 43423-43447). The regulation describes HFCS as a sweet, nutritive saccharide mixture containing approximately 42% or 55% fructose by dry weight, prepared from high dextrose-equivalent corn starch hydrolysate by partial enzymatic conversion of glucose to fructose using insoluble glucose isomerase enzyme preparations described in 21 CFR 184.1372. Identity per Food Chemicals Codex 4th edition (1996), pp. 191-192. Permitted use: 'with no limitation other than current good manufacturing practice' — no ADI assigned. The two standard formulations are HFCS-42 (42% fructose, 58% glucose, used in baked goods, cereals, fruit-flavored noncarbonated beverages) and HFCS-55 (55% fructose, 45% glucose, used in soft drinks, fruit beverages, frozen desserts); HFCS-90 (90% fructose) is rare and used in specialty applications, sometimes blended with HFCS-42 to produce HFCS-55. Listing remains active as of May 2026.",
      "American Medical Association, Council on Science and Public Health Report 3 (A-08), June 2008: 'High Fructose Corn Syrup.' The Council reviewed HFCS metabolic and population-health evidence and concluded: 'Because the composition of HFCS and sucrose are so similar, particularly on absorption by the body, it appears unlikely that HFCS contributes more to obesity or other conditions than sucrose.' This is the canonical scientific-society position that HFCS is not categorically worse than sucrose at equivalent doses. The report did not exonerate HFCS as safe in absolute terms; it positioned HFCS as metabolically equivalent to sucrose, with total added-sugar consumption remaining the underlying public-health concern.",
      "Le and Sievenpiper et al. 2022 (Frontiers in Nutrition; PMC9551185): 'The effect of high-fructose corn syrup vs. sucrose on anthropometric and metabolic parameters: A systematic review and meta-analysis.' Four randomized controlled trials with 9 arms and 767 participants. HFCS did NOT significantly differ from sucrose on body weight, waist circumference, BMI, fat mass, total cholesterol, HDL, LDL, triglyceride, systolic blood pressure, or diastolic blood pressure. The single significant difference: C-reactive protein (CRP, an inflammation marker) was elevated in the HFCS group versus sucrose across three studies. The 2025 systematic review of fructose-containing sugars (PMC12664302, intervention durations 7 hours to 49 days) found a consistent trend toward elevated LDL-cholesterol with fructose-containing interventions including HFCS, though individual results were not statistically significant.",
      "Recent metabolic syndrome research (2022-2025): the npj Science of Food 2022 paper 'Effects of high fructose corn syrup on intestinal microbiota structure and obesity in mice' demonstrated HFCS-driven gut microbiota alterations with downstream obesity-promoting effects. The In Vivo journal 2024 study 'Effects of Excessive High-fructose Corn Syrup Drink Intake in Middle-aged Mice' found that excessive HFCS drink intake under energy restriction did not induce obesity but did induce impaired glucose tolerance, indicating negative effects on the pancreas. The Frontiers in Nutrition 2025 systematic review 'The impact of high fructose corn syrup on liver injury and glucose metabolism' confirmed mechanistic concerns linking HFCS to non-alcoholic fatty liver disease (NAFLD), insulin resistance, and cardiovascular disease pathways at typical Western consumption levels, while stopping short of attributing those effects to HFCS specifically over total added-sugar load. The Nature Communications 2025 modeling analysis 'Worldwide trends in metabolic syndrome from 2000 to 2023' documented metabolic syndrome prevalence rising from 14.7% to 31.0% among women and from 9.0% to 25.7% among men globally, with an estimated 1.54 billion adults affected in 2023; HFCS is one of several drivers via the broader added-sugar pathway, not the sole contributor.",
      "Institute for Agriculture and Trade Policy (IATP), 'Not So Sweet: Missing Mercury and High Fructose Corn Syrup,' January 2009: tested 55 popular branded foods where HFCS was the first or second labeled ingredient. Approximately one third of products contained trace mercury, with brands including Quaker, Hershey's, Kraft, and Smucker's. Most prevalent in HFCS-containing dairy products, followed by dressings and condiments. Source: HFCS production used caustic soda and hydrochloric acid (for corn starch separation and pH adjustment), and the HFCS industry was a primary user of 'mercury-grade' caustic soda made via the mercury-cell chlor-alkali process. The companion peer-reviewed paper Dufault et al. 2009 (Environmental Health) confirmed mercury contamination of 9 of 20 commercial HFCS samples collected in 2005. Honest framing: this is a HISTORICAL contamination issue. The chlor-alkali industry has substantially transitioned to non-mercury-cell production since 2009, and current HFCS supply chains are not believed to carry the mercury-cell contamination signal. The 2009 findings remain real historical context for HFCS supply chain practices but should not be presented as current ongoing risk.",
    ],
    reasoning: "High-fructose corn syrup (HFCS) is the dominant added-sugar vehicle in the US food supply, present in soft drinks, fruit-flavored beverages, sweetened cereals, baked goods, flavored yogurts, condiments, and a broad range of processed foods. The hazard score of 5 reflects four converging evidence pathways and positions HFCS between sorbates/propionates (4/5/4) and benzoates/BHT (6/7/7) in Bucket scoring. Carcinogenicity and direct toxicity: HFCS is NOT classified as a carcinogen by IARC, NTP, or EFSA; it has no benzene-formation chemistry, no endocrine-disruption signal, and no NOAEC-class direct toxicity finding. The FDA assigned no ADI under 21 CFR 184.1866, the most permissive direct-toxicity stance in the food additive program. HFCS-versus-sucrose evidence: the Le and Sievenpiper et al. 2022 systematic review and meta-analysis (4 RCTs, 9 arms, 767 participants) found no significant differences between HFCS and sucrose on body weight, waist circumference, BMI, fat mass, total cholesterol, HDL, LDL, triglyceride, or blood pressure — the single significant difference being elevated C-reactive protein (inflammation marker) in HFCS groups. The AMA Council on Science and Public Health Report 3 (A-08, June 2008) reached the canonical scientific-society conclusion that 'because the composition of HFCS and sucrose are so similar, particularly on absorption by the body, it appears unlikely that HFCS contributes more to obesity or other conditions than sucrose.' This evidence supports the score being honest about HFCS not being categorically worse than sucrose, while also not exonerating HFCS as safe in absolute terms. Metabolic syndrome and NAFLD pathway: at typical Western consumption levels, HFCS contributes mechanistically to obesity, insulin resistance, non-alcoholic fatty liver disease, cardiovascular disease, and type 2 diabetes via the broader added-sugar pathway. The 2024 In Vivo journal mouse study found impaired glucose tolerance from excessive HFCS drink intake even without obesity induction (indicating pancreatic effects); the 2022 npj Science of Food paper documented gut microbiota disruption; the 2025 Frontiers in Nutrition systematic review on HFCS / liver injury / glucose metabolism confirmed the mechanistic linkages. The 2025 Nature Communications metabolic syndrome modeling found global prevalence rising from ~12% to ~28% across 2000-2023 with 1.54 billion adults affected in 2023; HFCS is one driver of this trend via added-sugar load, not the sole contributor. The kid_score_floor of 6 sits one point above the adult score because per-body-weight HFCS intake is meaningfully higher for children consuming HFCS-heavy fruit drinks, sweetened cereals, and flavored yogurts; the developing pancreas and liver are more sensitive to fructose-driven metabolic stress; and pediatric obesity and pediatric NAFLD are documented downstream consequences of high added-sugar diets. The pregnancy_score_floor of 5 matches the adult score because no pregnancy-specific mechanism is documented; gestational diabetes concerns are general added-sugar concerns rather than HFCS-specific, and EFSA / FDA / IDF have not flagged pregnancy-specific HFCS warnings. Mercury contamination context: the IATP 'Not So Sweet' January 2009 report and the Dufault et al. 2009 Environmental Health paper documented trace mercury in approximately one third of HFCS-containing branded products tested, traceable to mercury-cell chlor-alkali production used in the HFCS supply chain. This is HISTORICAL context — the chlor-alkali industry has substantially transitioned away from mercury-cell production since 2009, and current HFCS is not believed to carry this contamination signal. The honest tension worth naming: HFCS is not categorically worse than sucrose by mass, but the volume of HFCS in the US food supply (driven by 1980s commodity policy rather than nutritional merit) makes it the dominant vehicle for added sugar consumption in this country, and total added sugar at typical American intake levels IS associated with measurable population-level harm via the metabolic syndrome / NAFLD / type 2 diabetes pathway. The score 5 reflects honest moderate concern channeled through the most common added-sugar vehicle, not 'HFCS is poison' overstatement that the systematic review evidence does not support.",
  },

  sucralose: {
    inci_name: "Sucralose",
    aliases: [
      "sucralose",
      "e955",
      "e 955",
      "ins 955",
      "sweetener e955",
      "splenda",
      "splenda brand sweetener",
      "trichlorogalactosucrose",
    ],
    hazard_class: "artificial_sweetener",
    base_hazard_score: 5,
    nova_typical: 4,
    whole_food_indicator: false,
    quantity_threshold: null,
    pregnancy_concern: false,
    pregnancy_score_floor: 5,
    kid_concern: true,
    kid_score_floor: 6,
    regulatory_citations: [
      "FDA 21 CFR 172.831: sucralose was first approved by FDA on April 3, 1998 (63 FR 16417), in response to a petition by McNeil Specialty Products Company, originally permitting use as a sweetener in 15 specific food categories including baked goods, beverages, chewing gum, dairy products, and tabletop sugar substitutes. The approval was extended to general-purpose sweetener status on August 12, 1999 (64 FR 43908), permitting use 'in foods generally, in accordance with current good manufacturing practice in an amount not to exceed that reasonably required to accomplish the intended effect.' No ADI is established within the regulation itself; FDA relies on the JECFA ADI of 15 mg/kg bw/day. Listing remains active as of May 2026.",
      "JECFA evaluation (1991): the Joint FAO/WHO Expert Committee on Food Additives established an acceptable daily intake (ADI) of 15 mg/kg bw/day for sucralose. The ADI was derived from a no-observed-effect level (NOEL) of 1500 mg/kg bw/day in a 2-year chronic toxicity and carcinogenicity study in rats that included a period of in utero exposure, with a 100-fold uncertainty factor applied (10x for interspecies variation, 10x for intraspecies variation). Sucralose has NOT been classified by IARC and has no monograph review, distinct from aspartame's June 2023 IARC Group 2B classification. JECFA's 1991 ADI has not been revised through subsequent reviews.",
      "EFSA Panel on Food Additives and Flavourings, 'Re-evaluation of sucralose (E 955) as a food additive and evaluation of a new application on extension of use of sucralose (E 955) in fine bakery wares' (EFSA Journal 2026;9854): the Panel published a re-evaluation of sucralose confirming the existing ADI of 15 mg/kg bw/day for currently authorized uses, with exposure estimates not exceeding the ADI and no safety concern at reported uses and use levels. However, the Panel explicitly COULD NOT confirm safety of extending the authorization to fine bakery wares due to potential formation of chlorinated compounds during baking, and recommended the European Commission consider potential degradation products during high-temperature domestic uses including frying and baking. This is the most comprehensive sucralose re-evaluation in over 20 years and the regulatory finding that distinguishes sucralose's profile from other high-intensity artificial sweeteners.",
      "Heat-degradation mechanism, peer-reviewed evidence base 2013-2024: Schiffman & Rother 2013 ('Sucralose, a synthetic organochlorine sweetener: overview of biological issues,' Journal of Toxicology and Environmental Health Part B Critical Reviews 16:399-451) characterized sucralose as a synthetic organochlorine compound and raised heat-stability concerns. de Oliveira et al. 2015 (Scientific Reports 5:9598, 'Thermal degradation of sucralose: a combination of analytical methods to determine stability and chlorinated byproducts') used DSC/TGA/IR, hot-stage microscopy, and high-resolution mass spectrometry to demonstrate that thermal decomposition of sucralose produces CO2, hydrogen chloride, and polychlorinated aromatic hydrocarbons (PCAHs) even at mild conditions. Eisenreich et al. 2020 (Food Chemistry, 'Heating of food containing sucralose might result in the generation of potentially toxic chlorinated compounds') extended the analysis to food matrices. A 2024 paper in the Journal of Agricultural and Food Chemistry (DOI 10.1021/acs.jafc.4c08059, 'Formation of Chlorinated Carbohydrate Degradation Products and Amino Acids during Heating of Sucralose in Model Systems and Food') confirmed chlorinated degradation product formation in food-relevant model systems. The mechanism is documented across a decade-plus of peer-reviewed work, not hypothetical, and is the underlying basis for EFSA's 2026 refusal to extend the bakery authorization.",
      "Microbiome and cardiometabolic research base 2022-2025: a 10-week sucralose consumption trial in healthy young adults (Méndez-García et al., 'Ten-Week Sucralose Consumption Induces Gut Dysbiosis and Altered Glucose and Insulin Levels in Healthy Young Adults,' Microorganisms 2022, PMC8880058) documented decreased Lactobacillus acidophilus and increased Blautia coccoides abundance with altered glucose and insulin levels. A 2025 randomized controlled trial in Asian Indian adults ('Effect of Replacing Added Sugars with Sucralose on Gut Microbiome Composition Among Asian Indian Adults') showed sucralose decreased alpha diversity and increased beta diversity in adults with type 2 diabetes, with reduced abundance of primarily sugar-fermenting bacteria. The Frontiers in Nutrition 2024 review (DOI 10.3389/fnut.2024.1387646, 'Unveiling the profound influence of sucralose on metabolism and its role in shaping obesity trends') examined sucralose effects on glucose and lipid metabolism, blood pressure, and cardiovascular health. The 2025 cardiovascular review 'Sugar-Free but Not Risk-Free? Exploring Artificial Sweeteners and Cardiovascular Disease' (PMID 39969176) summarized cardiometabolic concerns including unfavorable total cholesterol to HDL ratio shifts and adverse lipid profile changes specifically associated with sucralose-containing beverage consumption. Findings are heterogeneous, with some studies showing negligible effects at typical doses, but the accumulating signal supports moderate, not crisis-grade, concern.",
    ],
    reasoning: "Sucralose (E955, Splenda, trichlorogalactosucrose) is a high-intensity artificial sweetener approximately 600 times sweeter than sucrose, FDA-approved since April 1998 (initially 15 food categories) and extended to general-purpose sweetener status in August 1999 (21 CFR 172.831). JECFA established the acceptable daily intake of 15 mg/kg bw/day in 1991, derived from a 2-year rat chronic toxicity and carcinogenicity study including in utero exposure (NOEL 1500 mg/kg bw/day, uncertainty factor 100), and EFSA reconfirmed this ADI in 2026 in the most comprehensive sucralose re-evaluation in over 20 years. Sucralose has NOT been reviewed by IARC, distinct from aspartame's June 2023 Group 2B classification, and has no PKU labeling requirement because its metabolic profile differs entirely from aspartame's: sucralose is largely non-metabolized in humans and excreted unchanged, while aspartame hydrolyzes to phenylalanine. The hazard score of 5 sits one tier below aspartame's 6 because the regulatory paper trail is meaningfully lighter (no IARC classification, no PKU labeling), but reflects a distinct concern profile that aspartame does not share to the same degree. Heat-degradation mechanism is the most defensible single distinguishing concern: the same EFSA Panel that reaffirmed currently authorized uses in 2026 explicitly could not confirm safety of extending the authorization to fine bakery wares, citing potential formation of chlorinated compounds during baking, and recommended the European Commission consider degradation products during high-temperature domestic uses including frying and baking. This is not hypothetical chemistry. The mechanism is documented across a 2013-2024 peer-reviewed evidence base: Schiffman & Rother 2013 characterized sucralose as a synthetic organochlorine compound; de Oliveira et al. 2015 in Scientific Reports demonstrated thermal decomposition produces CO2, hydrogen chloride, and polychlorinated aromatic hydrocarbons (PCAHs) even at mild conditions; Eisenreich et al. 2020 in Food Chemistry extended this to food matrices; the 2024 paper in the Journal of Agricultural and Food Chemistry confirmed chlorinated carbohydrate degradation product formation in food-relevant model systems. Microbiome and cardiometabolic signal is the second concern pillar: the 10-week sucralose consumption trial in healthy young adults (Méndez-García et al. 2022) documented gut dysbiosis with reduced Lactobacillus acidophilus and altered glucose and insulin levels; the 2025 Asian Indian RCT showed alpha-diversity reduction in adults with type 2 diabetes; the 2024 Frontiers in Nutrition review documented effects on glucose and lipid metabolism, blood pressure, and cardiovascular health; the 2025 cardiovascular review summarized adverse lipid profile and cholesterol/HDL ratio changes specifically associated with sucralose-containing beverages. Findings are heterogeneous and some studies show negligible effects at typical doses; the signal is moderate and accumulating, not crisis-grade. The kid_score_floor of 6 sits one point above the adult score because children consume sucralose heavily through diet sodas, sugar-free yogurts, sugar-free gums, sugar-free flavored waters, and increasingly through products marketed as 'low sugar' or 'sugar-free' to families; per-body-weight intake is meaningfully higher than adults at the same dietary patterns; the developing gut microbiome and metabolic system are more sensitive to dysbiosis-inducing exposures; and emerging cardiometabolic signals affect developing systems differently than adult systems. The pregnancy_score_floor of 5 matches the adult score because no pregnancy-specific mechanism is documented; the JECFA NOEL was derived from a 2-year rat study including in utero exposure, and the resulting ADI safety margin includes pregnancy; EFSA's 2026 reassessment did not flag pregnancy. Score positioning within Bucket 3: sucralose's 5/6/5 sits one tier below aspartame's 6/7/6 (aspartame carries IARC 2B, PKU labeling, and a 2024 prospective cohort cancer signal that sucralose lacks) and at the same hazard tier as HFCS's 5/6/5 (added_sugar class, different mechanism but comparable moderate-concern population-health weight via the metabolic syndrome pathway). Honest tension worth naming: sucralose is legitimately approved at currently authorized uses by FDA, JECFA, and EFSA across 28 years of continuous regulatory review, and at the typical exposure levels found in marketed products it is not a crisis-grade ingredient. But the EFSA 2026 refusal to extend authorization to baked goods, the documented heat-degradation chlorinated compound mechanism, the microbiome dysbiosis signal, and the accumulating cardiometabolic research base together justify moderate concern when sucralose appears in a product, and one-tier-elevated concern when that product is consumed by children. The kid concern compounds when the product will be heated, since baked goods, hot beverages, and cooked items containing sucralose are precisely the use case EFSA 2026 declined to approve.",
  },

  acesulfame_potassium: {
    inci_name: "Acesulfame Potassium",
    aliases: [
      "acesulfame potassium",
      "acesulfame k",
      "ace-k",
      "ace k",
      "e950",
      "e 950",
      "ins 950",
      "sweetener e950",
      "sunett",
      "sweet one",
      "potassium acesulfame",
    ],
    hazard_class: "artificial_sweetener",
    base_hazard_score: 5,
    nova_typical: 4,
    whole_food_indicator: false,
    quantity_threshold: null,
    pregnancy_concern: false,
    pregnancy_score_floor: 5,
    kid_concern: true,
    kid_score_floor: 6,
    regulatory_citations: [
      "FDA 21 CFR 172.800: acesulfame potassium was first approved by FDA on July 28, 1988 (53 FR 28379) for limited use in tabletop sweeteners and several beverage and dessert categories. The regulation was amended through seven food additive petitions over fifteen years (57 FR 57961 December 1992; 59 FR 61540, 61543, 61545 December 1994; 60 FR 21702 May 1995; 63 FR 36362 July 1998 adding nonalcoholic beverages including beverage bases) and reached general-purpose sweetener status on December 31, 2003 (68 FR 75413), permitting use across 12 food categories at levels determined by current good manufacturing practice. No ADI is established within the regulation itself; FDA relies on the JECFA ADI of 15 mg/kg bw/day. Listing remains active as of May 2026.",
      "JECFA evaluations 1983 and 1991: the Joint FAO/WHO Expert Committee on Food Additives initially set an ADI of 0-9 mg/kg bw/day for acesulfame potassium based on a 2-year dog study, then raised the ADI to 0-15 mg/kg bw/day based on a 2-year rat chronic toxicity and carcinogenicity study at dietary concentrations up to 3% (corresponding to a NOEL of 1500 mg/kg bw/day) that included a period of in utero exposure. A 100-fold uncertainty factor was applied (10x for interspecies variation, 10x for intraspecies variation). The Committee's rationale for the raise was that the rat 2-year study covered a greater proportion of the species lifespan than the dog 2-year study and included in utero exposure. JECFA also reviewed the breakdown products acetoacetamide and acetoacetamide-N-sulfonic acid and found them of low toxicity and not mutagenic. Acesulfame potassium has not been classified by IARC.",
      "EFSA Panel on Food Additives and Flavourings, 'Re-evaluation of acesulfame K (E 950) as food additive' (EFSA Journal 2025;9317, published 30 April 2025; PMID 40309404): the Panel completed the most comprehensive re-evaluation of acesulfame potassium since the 2000 Scientific Committee for Food assessment and RAISED the acceptable daily intake from the previous 9 mg/kg bw/day to 15 mg/kg bw/day, a 66% increase that harmonized the EU position with JECFA. The new ADI was derived from a NOAEL of 1500 mg/kg bw/day in rat studies with a 100-fold uncertainty factor. The Panel concluded explicitly that 'no safety concerns arise for genotoxicity of acesulfame K and its degradation products' and that exposure estimates were below the new ADI in all population groups including children. The only ancillary recommendation concerned EU specifications for lead and mercury in commercial E 950 samples, since some commercial samples exceeded existing maximum limits. This is a purity issue affecting manufacturing supply chains rather than a safety question about the acesulfame potassium molecule itself. EFSA's April 2025 action moves acesulfame K's regulatory paper trail in the OPPOSITE direction from EFSA's 2026 sucralose re-evaluation, which refused to extend authorization to fine bakery wares due to chlorinated compound formation during baking.",
      "NTP toxicology and carcinogenicity studies of acesulfame potassium (CAS 55589-62-3) in genetically modified mice (NTP Genetically Modified Model Report 02, 2005; NCBI NBK576284; PubMed PMID 18784762): a two-arm transgenic mouse design tested acesulfame K in feed at 0.3% to 3% concentrations. In Tg.AC hemizygous mice (carcinogenicity screen), acesulfame K did NOT increase the frequency of micronucleated erythrocytes in peripheral blood of either sex. In B6.129-Trp53tm1Brd N5 haploinsufficient mice (genotoxicity screen), a significant exposure-related increase in micronucleated normochromatic erythrocyte frequency was observed in MALES at 1% and 3% diet doses but not in females. The magnitude of the male signal was small at 1.0 to 1.2 micronuclei per 1,000 cells. EFSA's 2025 re-evaluation reviewed the NTP 2005 findings alongside the broader genotoxicity literature and concluded no safety concerns arise for genotoxicity of acesulfame K or its degradation products. The honest paper trail position: the genotoxicity question was raised in 2005 in a sex-specific transgenic model with small-magnitude signal, examined in subsequent research, and resolved by regulatory consensus in 2025 as not requiring action.",
      "Microbiome and metabolic research base 2023-2025: a 2024 study (Science of the Total Environment, DOI S2212429224015311, 'Acesulfame potassium induces hepatic inflammation and fatty acids accumulation via disturbance of carnitine metabolism and gut microbiota') administered acesulfame K to male C57BL/6 mice for 11 weeks and documented gut microbiota perturbation with down-regulation of beneficial bacteria, increased Collinsella abundance (associated with intestinal inflammation), altered fatty acid metabolism with elevated long-chain fatty acids in liver and serum, reduced expression of carnitine metabolism genes and proteins, reduced hepatic carnitine metabolites, and reduced β-oxidation of long-chain fatty acids leading to hepatic accumulation. A 2024 study in Applied Physiology, Nutrition, and Metabolism (DOI 10.1139/apnm-2022-0471) examined sucralose- and acesulfame-K-containing diet soda consumption in young adults at 1-week and 8-week timepoints and found increases in Proteobacteria specifically Enterobacteriaceae and shifts in the Bacteroides genus; the study could not isolate acesulfame K effects from sucralose effects within the formulation. The 2025 Frontiers in Microbiology review (DOI 10.3389/fmicb.2025.1531131) on synthetic vs non-synthetic sweeteners and gut microbiome found differential effects with heterogeneous signal across studies. The microbiome and metabolic signal is less mature and more heterogeneous than the sucralose evidence base, with some studies showing no effect or even increased microbiome diversity, but the 2024 hepatic inflammation and carnitine pathway findings represent a real recent mechanistic concern.",
    ],
    reasoning: "Acesulfame potassium (E950, Ace-K, Sunett, Sweet One) is a high-intensity artificial sweetener approximately 200 times sweeter than sucrose, FDA-approved since July 1988 (initially for limited tabletop and beverage applications) and extended to general-purpose sweetener status in December 2003 (21 CFR 172.800) after seven food additive petitions over fifteen years. JECFA initially set the ADI at 0-9 mg/kg bw/day in 1983 based on a 2-year dog study, then raised it to 0-15 mg/kg bw/day in 1991 based on a 2-year rat study with in utero exposure (NOEL 1500 mg/kg bw/day, uncertainty factor 100). The most consequential recent regulatory action is EFSA's April 2025 re-evaluation, which RAISED the EU acceptable daily intake from the previous 9 mg/kg bw/day to 15 mg/kg bw/day. This is a 66% increase harmonizing the EU position with JECFA, accompanied by an explicit conclusion that 'no safety concerns arise for genotoxicity of acesulfame K and its degradation products' and confirmation that exposure estimates were below the new ADI in all population groups including children. EFSA's 2025 action moves acesulfame K's regulatory paper trail in the OPPOSITE direction from EFSA's 2026 sucralose action, which refused to extend authorization to fine bakery wares due to chlorinated compound formation during baking. Acesulfame K has not been classified by IARC and has no PKU labeling concern. The hazard score of 5 sits at the same tier as sucralose but reaches that tier through a distinct concern profile that does not include heat-degradation chlorinated chemistry. The genotoxicity question on the paper trail: NTP 2005 transgenic mouse studies (NTP GMM 02) found that acesulfame K did not increase micronucleated erythrocyte frequency in Tg.AC hemizygous mice, but did produce a small-magnitude sex-specific signal in p53 haploinsufficient mice (1.0 to 1.2 micronuclei per 1,000 cells in males at 1% and 3% diet doses, no signal in females). EFSA's 2025 re-evaluation reviewed NTP 2005 alongside the broader genotoxicity literature and concluded no actionable concern. The honest paper trail position is that the genotoxicity question was raised in 2005, examined in subsequent research, and resolved by regulatory consensus in 2025 as not requiring action. The microbiome and metabolic signal is the second concern pillar, less mature and more heterogeneous than sucralose's evidence base. The 2024 Science of the Total Environment paper documented that 11-week acesulfame K exposure in male C57BL/6 mice produced gut microbiota disruption with increased Collinsella abundance, altered fatty acid metabolism with hepatic long-chain fatty acid accumulation, reduced carnitine metabolism gene and protein expression, and reduced β-oxidation of long-chain fatty acids. A 2024 diet soda study found Proteobacteria/Enterobacteriaceae shifts after 1 and 8 weeks but could not isolate acesulfame K effects from sucralose effects in the formulation. Some 2024-2025 studies showed no microbiome effect or even increased microbiome diversity. The signal is real and accumulating but not as mature as sucralose's. The third concern pillar is co-formulation exposure compounding. Acesulfame K is almost always paired with sucralose in zero-calorie carbonated beverages because the two sweeteners mask each other's aftertastes and produce a synergistic sweetness effect; this pairing has displaced aspartame in many diet soda formulations. The practical consequence is that diet sodas typically combine acesulfame K with sucralose, which means dietary exposure to artificial sweeteners is compounded for consumers of these products. This is a real population-level exposure-compounding mechanism worth surfacing in scoring rationale, distinct from but parallel to the per-body-weight argument that drives kid floors. The kid_score_floor of 6 sits one point above the adult score because children consume acesulfame K heavily through diet sodas, sugar-free flavored waters, sugar-free yogurts, and sugar-free gums; per-body-weight intake is meaningfully higher than adults at the same dietary patterns; the developing gut microbiome and metabolic system are more sensitive to dysbiosis-inducing exposures; and the co-formulation pattern compounds total artificial sweetener exposure for kid-marketed sugar-free products. The pregnancy_score_floor of 5 matches the adult score because no pregnancy-specific mechanism is documented; the JECFA NOEL was derived from a 2-year rat study including in utero exposure, the EFSA 2025 re-evaluation did not flag pregnancy, and exposure estimates were below the new ADI in all population groups. Score positioning within Bucket 3: acesulfame K's 5/6/5 matches sucralose's 5/6/5 through different concern profiles. Sucralose's defining concern is heat-degradation chlorinated compound formation (the EFSA 2026 bakery refusal mechanism, documented in 2013-2024 peer-reviewed work). Acesulfame K's defining concerns are the 2024 hepatic inflammation, microbiome, and carnitine signal plus the co-formulation exposure-compounding pattern in diet beverages. Both reach moderate concern via distinct pathways. Both sit one tier below aspartame's 6/7/6 (aspartame carries IARC 2B classification, mandatory PKU labeling, and a 2024 prospective cohort cancer signal that neither sucralose nor acesulfame K share), and both sit at the same hazard tier as HFCS's 5/6/5 in the added_sugar class. Honest tension worth naming: acesulfame K is legitimately approved and in fact more permissively regulated as of EFSA's April 2025 ADI raise than at any prior point in its 38-year regulatory history, with explicit genotoxicity reassurance from the most recent comprehensive review. At typical exposure levels in marketed products it is not a crisis-grade ingredient. But the 2024 hepatic and microbiome research base, the co-formulation reality in diet beverages, and the per-body-weight argument for children together justify moderate concern when acesulfame K appears in a product, and one-tier-elevated concern when that product is consumed by children. The kid concern compounds when the product also contains sucralose, since the standard diet soda formulation is the canonical exposure-compounding case the score is meant to capture.",
  },

  saccharin: {
    inci_name: "Saccharin",
    aliases: [
      "saccharin",
      "sodium saccharin",
      "saccharin sodium",
      "calcium saccharin",
      "ammonium saccharin",
      "e954",
      "e 954",
      "ins 954",
      "sweetener e954",
      "sweet'n low",
      "sweet n low",
      "sweet and low",
      "sugar twin",
      "necta sweet",
    ],
    hazard_class: "artificial_sweetener",
    base_hazard_score: 4,
    nova_typical: 4,
    whole_food_indicator: false,
    quantity_threshold: null,
    pregnancy_concern: false,
    pregnancy_score_floor: 4,
    kid_concern: true,
    kid_score_floor: 5,
    regulatory_citations: [
      "FDA 21 CFR 180.37: saccharin is regulated under Part 180 ('Food Additives Permitted in Food or in Contact with Food on an Interim Basis Pending Additional Study'), an unusual classification distinct from the standard food additive listings (Part 172) or GRAS substances (Part 184). The interim regulation was originally published March 15, 1977 (42 FR 14635) with a 17-month sunset provision that was subsequently removed. The regulation permits saccharin, ammonium saccharin, calcium saccharin, and sodium saccharin to be used as sweetening agents in food under specified conditions including special dietary purposes and authorized technological purposes other than calorie reduction. Critically, Congress has statutorily prevented FDA from amending or revoking 21 CFR 180.37 via the 1977 Saccharin Study and Labeling Act moratorium, which is unique among food additive regulations: FDA may not modify the interim listing without congressional action. Listing remains active as of May 2026.",
      "Saccharin regulatory history 1977-2000: in March 1977, FDA proposed to ban saccharin under the Delaney Clause of the 1958 Food Additive Amendment based on a Canadian rat study showing increased bladder tumors in offspring at high doses. Congress responded with the Saccharin Study and Labeling Act of 1977 (Public Law 95-203), imposing an 18-month moratorium on the FDA ban and requiring all saccharin-containing products to carry the warning 'Use of this product may be hazardous to your health. This product contains saccharin which has been determined to cause cancer in laboratory animals.' Congress repeatedly extended the moratorium throughout the 1980s and 1990s, maintaining the warning label requirement for 23 years. The warning requirement was repealed by the Saccharin Warning Elimination via Environmental Testing Employing Science and Technology Act ('SWEETEST Act,' H.R. 5668), enacted as part of the Consolidated Appropriations Act of 2001 (Public Law 106-554, Section 517), signed by President Clinton on December 21, 2000. The repeal struck the saccharin warning requirement from 21 USC 343(o). Note: this statute is sometimes informally called the 'Saccharin Notice Repeal Act' in coverage; the formal designation is Public Law 106-554 Section 517.",
      "NTP 9th Report on Carcinogens, May 2000 (Federal Register 66 FR 29402, May 30, 2001 availability notice): the National Toxicology Program delisted saccharin from the Report on Carcinogens after the 9th edition review. The decision was made by NTP Director Dr. Kenneth Olden and endorsed by US Secretary of Health and Human Services Donna Shalala. NTP rationale: 'the rodent cancer data are not sufficient to meet the current criteria to list saccharin in the Report as a reasonably anticipated human carcinogen.' Saccharin had previously been listed only as 'reasonably anticipated to be a human carcinogen,' never as 'known' to be carcinogenic. The mechanistic basis for delisting: high doses of sodium saccharin in male rats alter rat urine chemistry (high pH, high calcium phosphate, high protein levels) leading to formation of urinary precipitates that produce bladder tumors. This mechanism does not occur in humans because human urine chemistry differs (lower pH, lower calcium phosphate, lower protein content). Recent human epidemiological studies showed no link between saccharin consumption and bladder cancer at typical exposure levels.",
      "IARC Monograph Volume 73 (1999), 'Some Chemicals that Cause Tumours of the Kidney or Urinary Bladder in Rodents and Some Other Substances': IARC reclassified saccharin and its salts from Group 2B (possibly carcinogenic to humans, the prior 1987 Supplement 7 classification) to Group 3 (not classifiable as to carcinogenicity in humans). Group 3 is the same category as caffeine and reflects the position that available evidence does not support a human carcinogenicity finding. IARC reasoning: 'sodium saccharin produces urothelial bladder tumors in rats by a mechanism not relevant to humans because of critical interspecies differences in urine composition.' Tumors observed in male rats in four two-generation studies and one perinatal-exposure study; not in one-generation studies in male or female rats; not in mice. An early case-control study in Canada showed RR ~1.6 for bladder cancer in men using artificial sweeteners (and saccharin specifically), but subsequent population-based studies in the United States and elsewhere did not confirm an association at typical population exposure levels.",
      "EFSA Panel on Food Additives and Flavourings, 'Re-evaluation of saccharin and its sodium, potassium and calcium salts (E 954) as food additives' (EFSA Journal 2024;9044, published November 2024): the Panel completed the most recent comprehensive re-evaluation of saccharin and RAISED the acceptable daily intake from the previous 5 mg/kg bw/day (set by the Scientific Committee on Food in 1995) to 9 mg/kg bw/day. This is an 80% increase. The previous 5 mg/kg ADI was based on the increased incidence of bladder tumors observed in rat studies. EFSA's 2024 reassessment concluded that those tumors are specific to male rats and not relevant to humans, and that the prior precautionary basis no longer applies. The Panel concluded saccharin is safe at currently authorized uses, with exposure estimates below the new ADI in all population groups. EFSA's November 2024 saccharin action parallels EFSA's April 2025 acesulfame K ADI raise (from 9 to 15 mg/kg bw/day, a 66% increase): both are recent permissive regulatory actions in which EFSA re-evaluated prior precautionary positions and concluded they no longer apply.",
    ],
    reasoning: "Saccharin (E954, Sweet'N Low, Sugar Twin, Necta Sweet, sodium saccharin, calcium saccharin) is the oldest high-intensity artificial sweetener in commercial use, discovered by Constantin Fahlberg in 1879 and in continuous US food use since the early 1900s, predating the 1958 Food Additive Amendment. The total record of human consumption now exceeds 145 years, the longest safety record of any artificial sweetener in Bucket 3. Saccharin's regulatory journey is unique. FDA proposed to ban saccharin in March 1977 under the Delaney Clause based on a Canadian rat study showing bladder tumors at high doses. Congress responded with the Saccharin Study and Labeling Act of 1977, imposing a moratorium on the FDA ban and requiring all saccharin products to carry the warning 'Use of this product may be hazardous to your health. This product contains saccharin which has been determined to cause cancer in laboratory animals.' That warning label was mandatory for 23 years, from 1977 to 2000. During the same period, mechanistic research clarified that the rat bladder tumors arose from species-specific urine chemistry. High doses of sodium saccharin in male rats produce urinary precipitates because rat urine has high pH, high calcium phosphate, and high protein levels. Human urine chemistry differs and does not produce these precipitates. Three regulatory bodies updated their positions in light of this evidence between 1999 and 2000. IARC reclassified saccharin and salts from Group 2B (possibly carcinogenic) to Group 3 (not classifiable as to carcinogenicity in humans) in Monograph 73 (1999), placing saccharin in the same category as caffeine. NTP delisted saccharin from the 9th Report on Carcinogens in May 2000, with the explicit conclusion that rodent cancer data does not meet criteria for a 'reasonably anticipated human carcinogen' listing. Congress repealed the mandatory warning label requirement via the SWEETEST Act / Public Law 106-554 Section 517, signed December 21, 2000. The most recent regulatory action is EFSA's November 2024 re-evaluation (EFSA Journal 2024;9044), which RAISED the EU acceptable daily intake from 5 mg/kg bw/day to 9 mg/kg bw/day, an 80% increase. The previous 5 mg/kg ADI was based on the rat bladder tumor data; EFSA concluded the prior precautionary basis no longer applies because the tumors are specific to male rats and not relevant to humans. EFSA's November 2024 saccharin action parallels EFSA's April 2025 ace-K ADI raise (from 9 to 15 mg/kg, a 66% increase): both are recent permissive moves. Saccharin's regulatory paper trail is meaningfully cleaner than sucralose or acesulfame K. Sucralose has not been reviewed by IARC and EFSA's 2026 sucralose action refused to extend authorization to fine bakery wares due to chlorinated compound formation. Acesulfame K has not been reviewed by IARC and the 2024 Science of the Total Environment hepatic and microbiome mouse study raised real recent mechanistic concern. Saccharin has IARC Group 3, NTP formal delisting, and EFSA's most permissive recent action of any artificial sweetener. The hazard score of 4 sits one tier below sucralose's 5 and acesulfame K's 5 because saccharin's regulatory paper trail is cleaner through evidence-based rehabilitation, not because user health receives less weight. Calibration discipline requires scoring evidence as it actually is. Microbiome research is the residual concern pillar but produces heterogeneous signals. Suez et al. 2014 (Nature) administered saccharin at FDA maximum acceptable daily intake to 7 healthy adults for 6 days and found 4 developed impaired glucose tolerance through individual-variant microbiome-mediated mechanisms while 3 did not. The 2020 Microbiome paper (DOI 10.1186/s40168-020-00976-w) found no microbiota changes or glucose intolerance at high-dose saccharin in a separate study population. The 2025 Frontiers in Microbiology review found heterogeneous signal across studies. The honest microbiome position: saccharin produces individual-variant responses based on baseline gut composition, less consistent than sucralose's more uniform dysbiosis evidence. The kid_score_floor of 5 sits one point above the adult score because per-body-weight saccharin intake is higher in children consuming diet drinks, sugar-free flavored waters, and sugar-free gums; the developing gut microbiome is sensitive to dysbiosis-inducing exposures including the individual-variant signal documented in adult studies; and Sweet'N Low and similar tabletop saccharin products appear in households with children. The pregnancy_score_floor of 4 matches the adult score because no pregnancy-specific mechanism is documented; EFSA's 2024 reassessment did not flag pregnancy; JECFA's ADI safety margin covers pregnancy at currently authorized uses. Score positioning within Bucket 3: saccharin's 4/5/4 sits one tier below sucralose's 5/6/5 and acesulfame K's 5/6/5, and two tiers below aspartame's 6/7/6 (which carries IARC 2B classification, mandatory PKU labeling, and a 2024 prospective cohort cancer signal that saccharin does not share). Honest tension worth naming: saccharin spent 23 years on a mandatory cancer warning label based on the best science available at the time. Subsequent mechanistic research clarified that the rat tumor pathway is species-specific, IARC reclassified to Group 3, NTP formally delisted, and EFSA raised the ADI in November 2024. The honest scoring position respects evidence in both directions: saccharin's hazard score is now lower than the warning-label era would have suggested because the carcinogenicity question has been examined and cleared by international regulatory consensus, but moderate concern remains because the microbiome individual-variant signal is real and per-body-weight exposure for children is meaningfully higher than for adults. The score is calibrated to the evidence as it actually exists, not to a historical concern that has been mechanistically and regulatorily resolved.",
  },

  stevia: {
    inci_name: "Stevia",
    aliases: [
      "stevia",
      "stevia rebaudiana",
      "stevia leaf",
      "steviol glycosides",
      "e960",
      "e 960",
      "e960a",
      "e960b",
      "e960c",
      "e960d",
      "ins 960",
      "sweetener e960",
      "rebaudioside a",
      "reb a",
      "rebaudioside m",
      "reb m",
      "stevioside",
      "truvia",
      "purevia",
      "stevia in the raw",
      "sweetleaf",
    ],
    hazard_class: "natural_sweetener",
    base_hazard_score: 3,
    nova_typical: 4,
    whole_food_indicator: false,
    quantity_threshold: null,
    pregnancy_concern: false,
    pregnancy_score_floor: 3,
    kid_concern: true,
    kid_score_floor: 4,
    regulatory_citations: [
      "FDA regulatory framework for stevia (since 2008): high-purity steviol glycosides obtained from Stevia rebaudiana leaves are recognized as Generally Recognized as Safe (GRAS) for use as general-purpose sweeteners in food. The first stevia GRAS notice was for purified rebaudioside A, accepted by FDA in December 2008. Since 2008, FDA has filed and not objected to over 50 GRAS notices for various purified steviol glycosides including rebaudioside A, rebaudioside M, rebaudioside D, and bioconverted/fermentation-produced variants. The GRAS standard requires minimum 95% purity of named steviol glycosides per JECFA specifications. Critically, whole stevia leaf and crude stevia extracts (less than 95% purity steviol glycosides) are NOT approved as food additives and are NOT GRAS for conventional food use. FDA Import Alert 45-06 (revised March 2025) restricts importation of whole stevia leaves and crude extracts for conventional food use, with refusal of admission unless the stevia ingredient contains at least 95% steviol glycosides. Whole leaf and crude extracts may be used only as dietary supplement ingredients under DSHEA, a separate regulatory pathway from the food additive framework. The FDA rationale for the whole-leaf restriction is 'inadequate toxicological information' for the unpurified material. This regulatory distinction is unusual among sweeteners: FDA explicitly draws a line between purified extract (approved) and whole-plant material (not approved).",
      "JECFA evaluations 2000, 2005, 2006, 2007, 2009: the Joint FAO/WHO Expert Committee on Food Additives evaluated steviol glycosides across multiple sessions and established an acceptable daily intake of 4 mg/kg bw/day, expressed as steviol equivalents. The ADI was derived from a no-observed-adverse-effect level of 967 mg stevioside/kg bw/day (corresponding to approximately 388 mg steviol equivalents/kg bw/day) from a 2-year rat carcinogenicity study at dietary concentrations up to 2.5% stevioside. A 100-fold uncertainty factor was applied (10x for interspecies variation, 10x for intraspecies variation). JECFA toxicological conclusions are explicit and affirmative: steviol glycosides are 'not genotoxic, nor carcinogenic, or linked to any adverse effects on the reproductive human system or for the developing child.' This is a more affirmative regulatory clearance than the not-classifiable verdicts available for other Bucket 3 sweeteners. JECFA specifications require minimum 95% purity of seven named steviol glycosides for food additive use.",
      "Indigenous use history of Stevia rebaudiana: native to the Amambay Mountains region of South America (Paraguay, Brazil, Argentina border), the plant has been used for centuries by the Guaraní people who called it ka'a he'ê (sweet herb). Traditional uses included sweetening yerba mate and as folk medicine for fever, blood sugar regulation, blood pressure, microbial infections, and digestion. Spanish colonial documents preserved in the Paraguayan National Archives note indigenous peoples sweetening herbal teas with stevia leaves 'since ancient times,' and by the 1800s daily stevia consumption was widespread throughout Paraguay, Brazil, and Argentina. The Mato Grosso indigenous peoples used stevia similarly. Modern commercial stevia products use purified steviol glycosides at greater than 95% purity rather than whole leaf, and the indigenous use record applies to whole-leaf consumption rather than the purified-glycoside form FDA approves for food. The indigenous use history is meaningful context for centuries of human consumption of stevia leaves; it is not regulatory clearance for whole-leaf food additive use, and the FDA Import Alert 45-06 distinction continues to apply.",
      "Microbiome and metabolic research base 2022-2025: stevia at typical consumption levels shows predominantly reassuring effects on the human gut microbiome in human clinical trials. Mathur et al. 2024 (Nutrients 16(2):296, PMC10821022, 'Consumption of the Non-Nutritive Sweetener Stevia for 12 Weeks Does Not Alter the Composition of the Human Gut Microbiota') administered stevia to healthy adults for 12 weeks and found no significant changes in gut microbiota composition. The 2024 Journal of Nutrition randomized double-blinded parallel-design trial (DOI 10.1016/j.tjnut.2024.01.014, PMID 38408729, 'Comparison of a Daily Steviol Glycoside Beverage compared with a Sucrose Beverage for Four Weeks on Gut Microbiome in Healthy Adults') enrolled 59 healthy adults consuming 16 oz of beverage containing either 25% of the ADI of stevia or 30 g of sucrose daily for 4 weeks followed by 4-week washout. At week 4, no significant differences in gut microbiome composition at phylum, family, genus, or species level were observed between stevia and sucrose groups, no significant differences in fecal short-chain fatty acids, and no significant differences in fasting cardiometabolic measures. Mechanistically, steviol glycosides pass through the upper gastrointestinal tract intact and are degraded into glucose and steviol by colonic bacteria. Some in vitro studies show concentration-dependent effects on specific bacterial strains (Lactobacillus reuteri growth inhibition by stevioside and rebaudioside A in petri-dish settings), but these have not translated to in vivo microbiota composition changes at typical human consumption doses. Reb M and Reb D specifically show clean microbiome profiles in 2023-2024 research. The honest microbiome position: stevia microbiome research is predominantly reassuring at typical doses, opposite direction from sucralose's uniform dysbiosis signal and distinct from saccharin's individual-variant signal.",
      "EFSA Panel on Food Additives and Flavourings, November 2024 (EFSA Journal 2024;9045): the Panel REJECTED industry proposal to raise the steviol glycosides ADI from 4 to 6 or 16 mg/kg bw/day, HELD the ADI at 4 mg/kg bw/day expressed as steviol equivalents, and specifically flagged that toddler dietary exposure at the 95th percentile would exceed the ADI under the proposed expanded use across additional food categories. EFSA's stance is asymmetric relative to its November 2024 saccharin action (raised ADI from 5 to 9 mg/kg, an 80% increase) and April 2025 acesulfame K action (raised ADI from 9 to 15 mg/kg, a 66% increase): both raised, while stevia was held with explicit toddler concern. Two subsequent narrower opinions exist: EFSA Journal 2025;9396 on rebaudioside M produced via K. phaffii enzyme bioconversion (specifications amendment), and EFSA Journal 2026;9779 on the SBP1/SBP2 manufacturing modifications producing predominantly rebaudioside M or rebaudioside D (manufacturing process modification). Both are specifications opinions about specific E 960c manufacturing processes rather than substantive safety reassessments, and both explicitly reference the November 2024 ADI of 4 mg/kg as still authoritative. The substantive EFSA safety position has not changed since November 2024.",
    ],
    reasoning: "Stevia (E960, Stevia rebaudiana, steviol glycosides, Truvia, PureVia, Stevia in the Raw, SweetLeaf) is a non-caloric sweetener derived from the leaves of the Stevia rebaudiana plant, native to the Amambay Mountains region of South America. The Guaraní people have used the plant for centuries, calling it ka'a he'ê (sweet herb), to sweeten yerba mate and as traditional medicine. Spanish colonial documents preserved in the Paraguayan National Archives note indigenous peoples sweetening herbal teas with stevia leaves 'since ancient times,' with daily consumption widespread throughout Paraguay, Brazil, and Argentina by the 1800s. Centuries of indigenous use is real context for the natural_sweetener class, but commercial stevia products use purified steviol glycosides at greater than 95% purity rather than whole leaf, and the indigenous use record applies to whole-leaf consumption rather than the purified-glycoside form. The indigenous use history is honest context for human consumption of stevia leaves, not regulatory clearance for the commercial purified-glycoside form. FDA's regulatory framework draws an unusual line. High-purity steviol glycosides (≥95%) have been GRAS for general-purpose sweetener use since December 2008, with FDA accepting over 50 GRAS notices for various purified steviol glycosides including Reb A, Reb M, Reb D, and bioconverted or fermentation-produced variants. Whole stevia leaf and crude extracts (<95% purity) are NOT approved as food additives and are NOT GRAS for conventional food use; FDA Import Alert 45-06 (revised March 2025) continues to restrict importation, with whole leaf permitted only as dietary supplement ingredients under DSHEA. The FDA rationale for the whole-leaf restriction is 'inadequate toxicological information' for unpurified material. This is unusual among sweetener regulations and the most distinctive feature of stevia's regulatory framework. JECFA evaluated steviol glycosides across multiple sessions (2000-2009) and established an ADI of 4 mg/kg bw/day expressed as steviol equivalents, derived from a 2-year rat carcinogenicity NOAEL with 100-fold uncertainty factor. JECFA toxicological conclusions are explicit and affirmative: steviol glycosides are 'not genotoxic, not carcinogenic, or linked to any adverse effects on the reproductive human system or for the developing child.' This is a more affirmative regulatory verdict than other artificial sweeteners in Bucket 3 received: sucralose has not been IARC-reviewed and EFSA refused bakery extension in 2026; ace-K has not been IARC-reviewed; saccharin spent 23 years on a cancer warning label that was retracted, with IARC Group 3 not-classifiable being absence of finding rather than affirmative clearance. The most consequential recent regulatory action is EFSA's November 2024 opinion (EFSA Journal 2024;9045), which REJECTED industry proposal to raise the ADI from 4 to 6 or 16 mg/kg bw/day, HELD the ADI at 4 mg/kg, and specifically flagged that toddler dietary exposure at the 95th percentile would exceed the ADI under proposed expanded use. EFSA's November 2024 stevia stance is asymmetric relative to its other 2024-2025 sweetener actions: November 2024 saccharin was raised from 5 to 9 mg/kg, April 2025 acesulfame K was raised from 9 to 15 mg/kg, while stevia was HELD at 4 with explicit toddler concern. Two subsequent narrower EFSA opinions exist (Journal 2025;9396 on Reb M K. phaffii bioconversion specifications and Journal 2026;9779 on SBP1/SBP2 manufacturing modifications), but both are process-specifications opinions that explicitly reference the November 2024 ADI as still authoritative. Microbiome and metabolic research at typical consumption levels is predominantly reassuring. The 2024 Mathur et al. 12-week stevia study in healthy adults found no significant changes in human gut microbiota composition. The 2024 Journal of Nutrition randomized double-blinded 4-week trial in 59 healthy adults (25% ADI stevia vs 30 g sucrose) found no significant differences at phylum, family, genus, or species level, no differences in fecal short-chain fatty acids, and no differences in fasting cardiometabolic measures. The honest microbiome position: stevia microbiome research at typical doses is opposite direction from sucralose's uniform dysbiosis signal and distinct from saccharin's individual-variant signal; stevia produces minimal-to-no microbiota changes in human clinical trials at typical exposure levels. Co-formulation reality is the residual concern pillar. Most retail stevia products combine stevia with bulk sweeteners or flavor-masking ingredients to overcome stevia's bitter aftertaste at higher concentrations. Truvia combines stevia with erythritol; PureVia combines stevia with isomaltulose; Stevia in the Raw combines stevia with dextrose. Pure-stevia products exist but represent a minority of retail volume. The practical consequence is that consumers typically encounter stevia alongside another sweetener within the same product, parallel to the acesulfame K plus sucralose co-formulation pattern in zero-calorie carbonated beverages. This is a real population-level exposure-compounding mechanism worth surfacing in scoring rationale, particularly relevant for the kid floor since family-marketed stevia products like Truvia are heavily co-formulated. The hazard score of 3 sits one tier below saccharin's 4 because stevia's regulatory paper trail is meaningfully cleaner: JECFA's explicit not-genotoxic, not-carcinogenic, no-adverse-developing-child verdict, no carcinogenicity question ever raised by any regulator, microbiome research predominantly reassuring at typical doses, plant origin, and centuries of documented indigenous use predating modern commercial development by generations. Stevia is not equivalent to whole-food ingredients; it is a heavily industrially processed plant extract, which is why it does not score as low as Bucket 1 entries like annatto's 1/2/1. The score of 3 reflects the cleanest regulatory paper trail and microbiome profile in Bucket 3 while acknowledging that commercial stevia is purified extract rather than whole leaf and the EFSA toddler flag remains a real recent regulatory concern. The kid_score_floor of 4 sits one point above the adult score because EFSA's November 2024 opinion specifically flagged that toddler dietary exposure at the 95th percentile would exceed the ADI under proposed expanded use. This is unique among Bucket 3 entries: no other entry has an explicit recent regulator-flagged toddler exposure concern. Per-body-weight stevia intake is meaningfully higher in children consuming stevia-sweetened products including kid-marketed yogurts, sugar-free flavored waters, and sugar-free beverages. Co-formulation with erythritol or isomaltulose in family-targeted products like Truvia compounds total non-caloric sweetener exposure for kid consumers. The pregnancy_score_floor of 3 matches the adult score because no pregnancy-specific mechanism is documented, JECFA explicitly cleared adverse effects on the developing child, and EFSA's 2024 opinion did not flag pregnancy. Score positioning within Bucket 3: stevia's 3/4/3 sits one tier below saccharin's 4/5/4, two tiers below sucralose's 5/6/5 and acesulfame K's 5/6/5, and three tiers below aspartame's 6/7/6. Stevia is the cleanest sweetener entry in Bucket 3, distinguished by plant origin, the most affirmative JECFA verdict, predominantly reassuring microbiome research at typical doses, and centuries of documented indigenous use. Honest tension worth naming: stevia is the most defensibly low-hazard sweetener in Bucket 3, with a regulatory paper trail and human-trial evidence base that materially distinguishes it from synthetic artificial sweeteners. But it is not whole-food clean. Commercial stevia is heavily industrially processed at greater than 95% purity, FDA explicitly does not approve whole leaf or crude extracts for conventional food use, EFSA's November 2024 opinion specifically flagged toddler exposure under proposed expanded use, and most retail stevia products are co-formulated with bulk sweeteners. The score of 3 reflects honest moderate-low concern grounded in evidence rather than the perception that 'natural' equals 'unconcerning.' Calibration discipline requires scoring evidence as it actually is.",
  },

  erythritol: {
    inci_name: "Erythritol",
    aliases: [
      "erythritol",
      "e968",
      "e 968",
      "ins 968",
      "sweetener e968",
      "meso-erythritol",
      "swerve",
      "sukrin",
    ],
    hazard_class: "polyol_sweetener",
    base_hazard_score: 5,
    nova_typical: 4,
    whole_food_indicator: false,
    quantity_threshold: null,
    pregnancy_concern: false,
    pregnancy_score_floor: 5,
    kid_concern: true,
    kid_score_floor: 6,
    regulatory_citations: [
      "FDA GRAS framework for erythritol (since 2001): the Food and Drug Administration filed and did not object to six Generally Recognized as Safe (GRAS) notices for erythritol spanning September 2001 to February 2019, namely GRN 000076, GRN 000208, GRN 000297, GRN 000382, GRN 000401, and GRN 000789. The first GRAS notice (GRN 76) received a no-questions response from FDA on September 11, 2001. Subsequent FDA response letters dated January 25, 2007, November 21, 2011, and March 22, 2012 also stated FDA had no questions regarding the notifiers' GRAS conclusions. During the GRAS notice process, FDA evaluated published and publicly available toxicology studies including acute, short-term (4-week), subchronic, chronic and carcinogenicity, reproductive and developmental, in vitro and in vivo mutagenicity and genotoxicity, and absorption/distribution/metabolism/excretion (ADME) data. Erythritol is permitted as nutritive sweetener, stabilizer and thickener, flavor enhancer, formulation aid, humectant, texturizer, and sequestrant. Listing remains active as of May 2026.",
      "JECFA evaluation 1999 (53rd meeting): the Joint FAO/WHO Expert Committee on Food Additives evaluated erythritol and assigned an ADI of 'not specified,' the most permissive JECFA status. Per JECFA, 'ADI not specified' means that on the basis of the available chemical, biochemical, toxicological, and other data, the total daily intake of the substance arising from its use at levels necessary to achieve the desired effect plus its acceptable background in food does not, in the opinion of the Committee, represent a hazard to health, and no numerical limit is necessary. JECFA reviewed 29 animal studies and 17 human studies. A single dose of 1 g/kg bw was considered to have no laxative effect in humans. Critically, the JECFA 1999 evaluation predates the cardiovascular signal entirely; the Witkowski 2023 Nature Medicine finding emerged 24 years after JECFA's evaluation. JECFA has not formally re-evaluated erythritol since 1999 and the 'not specified' status remains the international position even as EFSA has tightened the EU position based on more recent data.",
      "EFSA Panel on Food Additives and Flavourings, 'Re-evaluation of erythritol (E 968) as a food additive' (EFSA Journal 2023;8430, published December 2023; PMID 38125972): the Panel completed a comprehensive re-evaluation of erythritol and ESTABLISHED a specific ADI of 0.5 g/kg bw/day, replacing JECFA's prior 'not specified' status with a numerical cap. The ADI basis includes both protection from immediate laxative effects (acute exposure) and protection from potential adverse long-term effects secondary to diarrhea, including electrolyte imbalance (chronic exposure). The Panel found explicitly that 'in all groups of people, both acute and chronic exposure to erythritol is above the newly set ADI,' meaning typical consumption already exceeds the new safety threshold across all population groups including children. The laxative warning label requirement 'excessive consumption may produce laxative effects' for foods containing more than 10% added polyols (Regulation EU 1169/2011) remains in force. EFSA's December 2023 erythritol action represents the most cautious recent EFSA stance on any Bucket 3 sweetener, asymmetric relative to other recent EFSA sweetener actions: November 2024 saccharin RAISED ADI from 5 to 9 mg/kg (an 80% increase), April 2025 acesulfame K RAISED ADI from 9 to 15 mg/kg (a 66% increase), November 2024 stevia HELD ADI at 4 mg/kg with explicit toddler flag, and 2026 sucralose action refused bakery wares extension. Erythritol is the only Bucket 3 sweetener for which EFSA tightened the regulatory position in the recent re-evaluation cycle.",
      "Cardiovascular signal, Witkowski 2023 plus 2024-2025 reinforcement: Witkowski M, Nemet I, Alamri H, et al., 'The artificial sweetener erythritol and cardiovascular event risk' (Nature Medicine 29:710-718, 2023; DOI 10.1038/s41591-023-02223-9; PubMed PMID 36849732) examined three independent cohorts. The discovery cohort (n=1,157 patients undergoing cardiac risk assessment) used untargeted metabolomics analysis and identified circulating erythritol associated with 3-year MACE (death plus nonfatal myocardial infarction plus stroke). The US validation cohort (n=2,149 stable patients undergoing elective cardiac evaluation) confirmed adjusted hazard ratio 1.80 (95% CI 1.18-2.77) for fourth versus first quartile of circulating erythritol. The European validation cohort (n=833) confirmed adjusted hazard ratio 2.21 (95% CI 1.20-4.07). Mechanistic studies in the same paper showed that high erythritol levels enhance platelet reactivity and thrombosis formation. Industry pushback at initial publication focused on observational study design and confounding, but the 2024-2025 research base has REINFORCED the cardiovascular signal rather than refuted it. The 2024 Nutrients 16(18):3099 cohort study found elevated serum erythritol associated with increased risk of overall mortality, cardiovascular disease mortality, and cancer mortality. The 2025 JACC: Advances ARIC study (DOI 10.1016/j.jacadv.2025.101605, March 2025) identified erythritol and erythronate as biomarkers of poor cardiometabolic health and cardiovascular outcomes in older adults. The 2025 Cardiovascular Research Oxford Academic review (volume 121, issue 9, page 1319) on erythritol, xylitol, and cardiovascular risk surveyed accumulating evidence. The 2025 American Heart Association ATVB blog commentary characterized erythritol as 'a hidden threat to cardiovascular health.' Cleveland Clinic's 2025 ConsultQD coverage characterized the body of evidence as 'mounting.' A Mendelian randomization study (PMC12547948) supported genetic associations with cardiovascular and cerebrovascular outcomes. A controlled human ingestion study confirmed that erythritol intake enhances platelet reactivity and thrombosis potential in healthy volunteers, translating the observational association to a mechanistic basis in humans. FDA has not acted on the cardiovascular finding (only EFSA's December 2023 action incorporated emerging concerns into ADI tightening), but the peer-reviewed evidence base is reinforcing rather than weakening.",
      "Co-formulation reality and microbiome research: erythritol is heavily co-formulated with other sweeteners in retail products, and this is a defining exposure characteristic of consumer erythritol intake. Truvia combines stevia with erythritol; Lakanto combines monk fruit (mogrosides) with erythritol; Swerve and Sukrin use erythritol with prebiotic oligosaccharides; substantial fractions of sugar-free baked goods, keto-marketed products, and 'natural' sweetener blends combine erythritol with stevia, monk fruit, allulose, or other low-calorie sweeteners. The co-formulation reality means consumers typically encounter erythritol alongside another non-caloric sweetener within the same product, creating an exposure-compounding pattern parallel to but more prevalent than the acesulfame K plus sucralose pairing in zero-calorie carbonated beverages. Microbiome research is mixed and inconclusive, and is not the dominant concern for erythritol. Erythritol is largely absorbed in the small intestine and excreted unchanged in urine; only a fraction reaches the colon for potential microbial fermentation. The 2005 Cambridge paper (PMID 16277764) found that human gut microbiota does not ferment erythritol due to limited colonic exposure. The 2019 Journal of Agricultural and Food Chemistry paper (DOI 10.1021/acs.jafc.9b06181) examined the impact of steviol glycosides and erythritol on human and primate gut microbiomes. The 2024 PMC8197374 mouse study found erythritol DECREASED metabolic disorders (obesity, glucose intolerance, dyslipidemia, hepatic fat accumulation) via short-chain fatty acid modulation. A separate 2024 mouse study found erythritol AGGRAVATES gut inflammation and anxiety-like behavioral disorders in acute dextran sulfate sodium colitis models. The microbiome signal is mixed; the cardiovascular signal is the dominant concern.",
    ],
    reasoning: "Erythritol is a polyol (sugar alcohol) sweetener naturally occurring in some fruits and fermented foods, commercially produced via fermentation of glucose by yeast. It is approximately 60-80% as sweet as sucrose, has zero glycemic index (largely absorbed in the small intestine and excreted unchanged in urine), and is labeled zero calories per FDA labeling rules. Erythritol's regulatory framework reflects 20+ years of safety record. FDA filed and did not object to six GRAS notices spanning September 2001 to February 2019 (GRN 76 through GRN 789), evaluating extensive toxicology data including acute, short-term, subchronic, chronic and carcinogenicity, reproductive and developmental, mutagenicity and genotoxicity, and ADME studies. JECFA's 1999 evaluation assigned the most permissive ADI status, 'not specified,' meaning JECFA found no need for a numerical cap based on the data available at the time. However, the JECFA 1999 evaluation predates the cardiovascular signal entirely; the Witkowski 2023 Nature Medicine finding emerged 24 years after JECFA's evaluation, and JECFA has not formally re-evaluated erythritol since 1999. The most consequential recent regulatory action is EFSA's December 2023 re-evaluation (EFSA Journal 2023;8430), which established a specific ADI of 0.5 g/kg bw/day, replacing JECFA's 'not specified' status with a numerical cap. The ADI basis includes protection from both immediate laxative effects and potential adverse long-term effects secondary to diarrhea-induced electrolyte imbalance. Critically, EFSA found that 'in all groups of people, both acute and chronic exposure to erythritol is above the newly set ADI,' meaning typical consumption already exceeds the new safety threshold across all population groups including children. EFSA's December 2023 erythritol action represents the most cautious recent EFSA stance on any Bucket 3 sweetener, asymmetric relative to all other recent EFSA sweetener actions which either raised ADIs or held them. November 2024 saccharin was raised from 5 to 9 mg/kg, April 2025 acesulfame K was raised from 9 to 15 mg/kg, November 2024 stevia was held at 4 mg/kg with toddler flag, and 2026 sucralose refused bakery extension. Erythritol is the only Bucket 3 sweetener for which EFSA tightened the regulatory position in the recent re-evaluation cycle. The defining concern pillar for erythritol is the cardiovascular signal. Witkowski et al. 2023 (Nature Medicine 29:710-718) examined three independent cohorts: a discovery cohort of 1,157 cardiac risk assessment patients with untargeted metabolomics, a US validation cohort of 2,149 stable patients with adjusted hazard ratio 1.80 (95% CI 1.18-2.77) for fourth versus first quartile circulating erythritol, and a European validation cohort of 833 patients with adjusted hazard ratio 2.21 (95% CI 1.20-4.07). The same paper provided mechanistic confirmation that high erythritol levels enhance platelet reactivity and thrombosis formation. Industry pushback at initial publication in early 2023 focused on observational study design and confounding, but the 2024-2025 research base has REINFORCED the cardiovascular signal rather than refuted it. The 2024 Nutrients 16(18):3099 cohort study found elevated serum erythritol associated with increased mortality risk for overall, cardiovascular, and cancer outcomes. The 2025 JACC: Advances ARIC study identified erythritol and erythronate as biomarkers of poor cardiometabolic health in older adults. The 2025 Cardiovascular Research review surveyed accumulating evidence. The 2025 American Heart Association ATVB blog commentary characterized erythritol as 'a hidden threat to cardiovascular health.' Cleveland Clinic's 2025 ConsultQD coverage characterized the body of evidence as 'mounting.' A Mendelian randomization study supported genetic associations with cardiovascular outcomes. A controlled human ingestion study confirmed that erythritol intake enhances platelet reactivity and thrombosis potential in healthy volunteers, translating the observational association to mechanistic basis in humans. FDA has not acted on the cardiovascular finding, but the peer-reviewed evidence base is reinforcing rather than weakening. Co-formulation reality is the secondary concern pillar. Erythritol is heavily co-formulated with other sweeteners in retail products: Truvia combines stevia with erythritol, Lakanto combines monk fruit with erythritol, Swerve and Sukrin use erythritol with prebiotic oligosaccharides, and substantial fractions of sugar-free baked goods, keto-marketed products, and 'natural' sweetener blends combine erythritol with stevia, monk fruit, or allulose. Consumers typically encounter erythritol alongside another non-caloric sweetener within the same product, creating an exposure-compounding pattern parallel to but more prevalent than the acesulfame K plus sucralose pairing in zero-calorie carbonated beverages. Microbiome research is the secondary concern pillar but the signal is mixed and inconclusive. Erythritol is largely absorbed in the small intestine before reaching the colon, limiting microbial fermentation. The 2005 Cambridge paper found that human gut microbiota does not ferment erythritol. Some 2024 mouse studies show beneficial metabolic effects via short-chain fatty acid modulation; other 2024 mouse studies show erythritol aggravates gut inflammation in dextran sulfate sodium colitis models. The microbiome signal is mixed; the cardiovascular signal is the dominant concern. The hazard score of 5 matches sucralose's 5 and acesulfame K's 5 through a different concern profile. Sucralose's defining concern is heat-degradation chlorinated compound formation (the EFSA 2026 bakery refusal mechanism). Acesulfame K's defining concerns are the 2024 hepatic, microbiome, and carnitine signal plus co-formulation exposure compounding. Erythritol's defining concern is the cardiovascular signal from Witkowski 2023 plus reinforcing 2024-2025 research base plus EFSA's December 2023 ADI lowering with explicit exposure exceedance finding. All three reach moderate concern via distinct pathways. The kid_score_floor of 6 sits one point above the adult score because EFSA's December 2023 finding explicitly noted that typical erythritol consumption exceeds the new ADI in all population groups including children, co-formulation with stevia or monk fruit in family-marketed products like Truvia and Lakanto compounds total non-caloric sweetener exposure for kid consumers, and cardiovascular concerns potentially affect developing systems differently than adult systems. The pregnancy_score_floor of 5 matches the adult score because no pregnancy-specific mechanism is documented; FDA's GRAS evaluation included reproductive and developmental studies; EFSA's 2023 reassessment did not flag pregnancy specifically beyond the all-population-group exposure exceedance finding. Score positioning within Bucket 3: erythritol's 5/6/5 sits at the same hazard tier as sucralose's 5/6/5 and acesulfame K's 5/6/5 (different mechanisms, comparable moderate-concern weight), one tier above saccharin's 4/5/4 (saccharin underwent regulatory rehabilitation while erythritol underwent regulatory caution), two tiers above stevia's 3/4/3 (the cleanest sweetener entry in Bucket 3), and one tier below aspartame's 6/7/6 (which carries IARC 2B classification, mandatory PKU labeling, and a 2024 prospective cohort cancer signal that erythritol does not yet match). Honest tension worth naming: erythritol carries 20+ years of FDA GRAS safety record and JECFA's most permissive ADI status, both of which are real and based on extensive toxicology data. But the historical safety record does not override recent specific findings. Aspartame had 33 years of safe regulatory standing before IARC reclassified it as Group 2B in 2023 based on emerging hepatocellular carcinoma signal. Erythritol's cardiovascular signal from Witkowski 2023 is real and reinforcing, EFSA's December 2023 ADI lowering is the most cautious recent EFSA action on any Bucket 3 sweetener, and the co-formulation reality means typical consumer exposure is above the new safety threshold across all population groups. The score of 5 reflects evidence as it actually exists, not a historical safety reputation that predates the cardiovascular finding by 24 years. Calibration discipline requires scoring evidence as it actually is.",
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
