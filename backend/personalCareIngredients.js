// backend/personalCareIngredients.js
// Calibration table for personal care ingredient hazard scoring.
// Each entry represents a known ingredient with regulatory grounding,
// hazard classification, and citation-backed reasoning.
//
// Score scale: 1-10 where lower is better, matching the rest of the app.
// base_hazard_score is the contribution this ingredient makes to a
// product's overall score when present at typical concentrations in
// a leave-on product. Rinse-off products get the skin_absorption_modifier
// applied to reduce the contribution.
//
// Lookup: ingredients are matched against canonical INCI names and
// the aliases array. Match is case-insensitive and trims whitespace.
//
// Hazard classes (current set, will grow as table expands):
//   endocrine_disruptor, irritant, sensitizer, carcinogen_suspected,
//   carcinogen_known, neurotoxicant, reproductive_toxicant,
//   photosensitizer, allergen, preservative_concern,
//   penetration_enhancer, microbiome_disruptor

const PERSONAL_CARE_INGREDIENTS = {

  methylparaben: {
    inci_name: "Methylparaben",
    aliases: [
      "methyl paraben",
      "methyl 4-hydroxybenzoate",
      "methyl p-hydroxybenzoate",
      "methylparaben",
      "e218",
    ],
    hazard_class: "endocrine_disruptor",
    base_hazard_score: 6,
    skin_absorption_modifier: 0.7,
    pregnancy_concern: true,
    pregnancy_score_floor: 7,
    kid_concern: true,
    kid_score_floor: 7,
    regulatory_citations: [
      "EU Cosmetics Regulation 1223/2009 Annex V: permitted preservative, max 0.4% as single paraben, 0.8% combined parabens",
      "Denmark national restriction (Order No. 4/2011): banned in personal care products for children under 3 years",
      "CIR Final Amended Report 2008, re-review 2020: maintained safe-as-used conclusion at current limits but acknowledged ongoing endocrine concerns warrant continued monitoring",
      "Routledge et al. 1998 (Toxicology and Applied Pharmacology): foundational demonstration of paraben estrogenic activity in vitro",
      "Karwacka et al. 2019 (International Journal of Environmental Research and Public Health): systematic review of paraben endocrine effects synthesizing 25+ years of evidence including human biomonitoring data",
    ],
    reasoning: "Methylparaben is the most common paraben in personal care, used for its broad-spectrum antimicrobial activity at low concentrations. Endocrine disruption potential is well-documented, with weak estrogenic activity in vitro and in animal studies. The EU permits use with concentration limits (0.4% single, 0.8% combined parabens). Denmark went further, restricting parabens in products for children under 3. CIR maintains the ingredient is safe as used, but the cumulative exposure concern is real: most users encounter parabens across multiple daily products, and the additive effect across products is what drives regulatory caution rather than any single-product risk. Lower-risk preservation alternatives exist (phenoxyethanol with concerns, sodium benzoate, potassium sorbate) so reformulation pressure is significant.",
  },

  ethylparaben: {
    inci_name: "Ethylparaben",
    aliases: [
      "ethyl paraben",
      "ethyl 4-hydroxybenzoate",
      "ethyl p-hydroxybenzoate",
      "ethylparaben",
      "e214",
    ],
    hazard_class: "endocrine_disruptor",
    base_hazard_score: 6,
    skin_absorption_modifier: 0.7,
    pregnancy_concern: true,
    pregnancy_score_floor: 7,
    kid_concern: true,
    kid_score_floor: 7,
    regulatory_citations: [
      "EU Cosmetics Regulation 1223/2009 Annex V: permitted preservative, max 0.4% as single paraben, 0.8% combined parabens",
      "Denmark national restriction (Order No. 4/2011): banned in personal care products for children under 3 years",
      "CIR Final Amended Report 2008, re-review 2020: ethyl grouped with methyl in lower-concern subset, safe-as-used at current limits",
      "Routledge et al. 1998 (Toxicology and Applied Pharmacology): ethylparaben estrogenic activity intermediate between methyl and propyl",
      "Engel et al. 2019 (Environmental Health Perspectives): prenatal paraben exposure including ethylparaben associated with child neurodevelopmental outcomes in multi-cohort longitudinal analysis",
    ],
    reasoning: "Ethylparaben sits between methylparaben and propylparaben in the chain-length progression that determines estrogenic potency. The EU treats ethylparaben in the same regulatory tier as methylparaben (max 0.4% single, 0.8% combined) rather than the stricter tier applied to propyl and butyl. This makes ethylparaben one of the lower-concern parabens, though all parabens carry endocrine disruption potential and the cumulative exposure concern applies to the class. The base_hazard_score matches methylparaben because the regulatory framework groups them, even though ethylparaben has slightly higher in vitro estrogenic activity than methyl.",
  },

  propylparaben: {
    inci_name: "Propylparaben",
    aliases: [
      "propyl paraben",
      "propyl 4-hydroxybenzoate",
      "propyl p-hydroxybenzoate",
      "propylparaben",
      "n-propyl 4-hydroxybenzoate",
      "e216",
    ],
    hazard_class: "endocrine_disruptor",
    base_hazard_score: 7,
    skin_absorption_modifier: 0.7,
    pregnancy_concern: true,
    pregnancy_score_floor: 7,
    kid_concern: true,
    kid_score_floor: 8,
    regulatory_citations: [
      "EU Cosmetics Regulation 1223/2009 Annex V: permitted preservative, max 0.14% as single paraben (reduced from 0.4% in 2014 by Regulation 1004/2014 specifically for propyl and butyl due to endocrine concerns)",
      "EU Regulation 358/2014: prohibited propylparaben in leave-on products for the diaper area in children under 3",
      "Denmark national restriction (Order No. 4/2011): banned in personal care products for children under 3 years",
      "Vo et al. 2010 (Toxicology and Applied Pharmacology): propylparaben showed approximately 10x greater estrogenic potency than methylparaben in rat uterotrophic assay",
      "Nowak et al. 2018 (Environment International): paraben measurements in human breast tissue confirmed propylparaben accumulation patterns predicted by skin absorption studies",
    ],
    reasoning: "Propylparaben is structurally similar to methylparaben but has a longer carbon chain that increases estrogenic potency by roughly an order of magnitude. The EU recognized this asymmetry in 2014 by reducing the maximum concentration to 0.14% (compared to 0.4% for methyl and ethyl) and prohibiting use in leave-on products for the diaper area in young children. The kid_score_floor is set higher than methylparaben because the regulatory framework treats propylparaben as a more serious concern, particularly for early-life exposure. As with methylparaben, the cumulative exposure across multiple personal care products is the realistic concern rather than any single product instance.",
  },

  butylparaben: {
    inci_name: "Butylparaben",
    aliases: [
      "butyl paraben",
      "butyl 4-hydroxybenzoate",
      "butyl p-hydroxybenzoate",
      "butylparaben",
      "n-butyl 4-hydroxybenzoate",
    ],
    hazard_class: "endocrine_disruptor",
    base_hazard_score: 7,
    skin_absorption_modifier: 0.7,
    pregnancy_concern: true,
    pregnancy_score_floor: 8,
    kid_concern: true,
    kid_score_floor: 8,
    regulatory_citations: [
      "EU Cosmetics Regulation 1223/2009 Annex V: permitted preservative, max 0.14% as single paraben (reduced from 0.4% in 2014 by Regulation 1004/2014 with propylparaben)",
      "EU Regulation 358/2014: prohibited butylparaben in leave-on products for the diaper area in children under 3",
      "Denmark national restriction (Order No. 4/2011): banned in personal care products for children under 3 years",
      "Boberg et al. 2010 (Reproductive Toxicology): butylparaben in rat studies reduced sperm production and testosterone in male offspring at perinatal exposure",
      "Jamarani et al. 2021 (Environmental Pollution): cumulative paraben exposure modeling with butylparaben as a high-contribution component to total exposure burden across multi-product use patterns",
    ],
    reasoning: "Butylparaben has the longest carbon chain among commonly used parabens and the strongest estrogenic activity of the class. The EU's 2014 regulation specifically targeted propyl and butyl parabens for stricter limits because of this asymmetric potency. Animal reproductive toxicity studies have shown effects on sperm production and testosterone at perinatal exposure, which drives the elevated pregnancy_score_floor compared to shorter-chain parabens. Some major brands have voluntarily phased out butylparaben in response to consumer pressure, so its presence in a formulation today often signals a brand that prioritizes preservation efficacy over reformulation. Better alternatives exist.",
  },

  isobutylparaben: {
    inci_name: "Isobutylparaben",
    aliases: [
      "isobutyl paraben",
      "isobutyl 4-hydroxybenzoate",
      "iso-butyl 4-hydroxybenzoate",
      "isobutylparaben",
    ],
    hazard_class: "endocrine_disruptor",
    base_hazard_score: 8,
    skin_absorption_modifier: 0.7,
    pregnancy_concern: true,
    pregnancy_score_floor: 8,
    kid_concern: true,
    kid_score_floor: 9,
    regulatory_citations: [
      "EU Cosmetics Regulation 1223/2009 Annex II: prohibited in cosmetic products since 2014 (Regulation 358/2014)",
      "ASEAN Cosmetic Directive harmonized prohibition aligned with EU framework",
      "European Commission SCCS Opinion 2013: insufficient safety data given structural similarity to butylparaben and likely stronger estrogenic activity led to prohibition rather than concentration limits",
      "Hossaini et al. 2000 (Pharmacology & Toxicology): branched-chain parabens including isobutyl showed stronger estrogenic activity in vivo than linear-chain equivalents",
      "Karwacka et al. 2019 (International Journal of Environmental Research and Public Health): systematic review noted isobutyl prohibition as the regulatory inflection point that established precedent for action on insufficiently characterized parabens",
    ],
    reasoning: "Isobutylparaben was prohibited in EU cosmetics in 2014 alongside isopropyl, pentyl, phenyl, and benzyl parabens because the SCCS concluded there was insufficient safety data to justify continued use given structural similarity to butylparaben and likely stronger estrogenic activity. Presence in a current formulation suggests either a product manufactured for non-EU markets or formulated before the prohibition. Either way, the regulatory consensus across major frameworks is that this ingredient should not be in personal care products. The high kid_score_floor reflects the regulatory severity rather than just the chemistry.",
  },

};

// Alias lookup map, built once at module load for fast matching.
// Maps every alias (including the canonical INCI name) to the
// calibration entry key. Match is case-insensitive after both
// alias and query are lowercased and trimmed.
const PERSONAL_CARE_ALIASES = (() => {
  const map = new Map();
  for (const [key, entry] of Object.entries(PERSONAL_CARE_INGREDIENTS)) {
    for (const alias of entry.aliases) {
      map.set(alias.toLowerCase().trim(), key);
    }
    // Also map the entry key itself for direct lookup
    map.set(key.toLowerCase().trim(), key);
  }
  return map;
})();

// Helper: look up an ingredient string and return the canonical entry, or null.
function lookupIngredient(ingredientText) {
  if (!ingredientText) return null;
  const normalized = String(ingredientText).toLowerCase().trim();
  const key = PERSONAL_CARE_ALIASES.get(normalized);
  if (!key) return null;
  return { key, entry: PERSONAL_CARE_INGREDIENTS[key] };
}

module.exports = {
  PERSONAL_CARE_INGREDIENTS,
  PERSONAL_CARE_ALIASES,
  lookupIngredient,
};
