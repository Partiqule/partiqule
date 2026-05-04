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
