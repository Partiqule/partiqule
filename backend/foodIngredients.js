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
