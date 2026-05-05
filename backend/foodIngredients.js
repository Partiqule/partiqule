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
