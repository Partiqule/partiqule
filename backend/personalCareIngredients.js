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

  diethyl_phthalate: {
    inci_name: "Diethyl Phthalate",
    aliases: [
      "diethyl phthalate",
      "dep",
      "phthalic acid diethyl ester",
      "diethyl 1,2-benzenedicarboxylate",
      "1,2-benzenedicarboxylic acid diethyl ester",
    ],
    hazard_class: "endocrine_disruptor",
    base_hazard_score: 7,
    skin_absorption_modifier: 0.85,
    pregnancy_concern: true,
    pregnancy_score_floor: 8,
    kid_concern: true,
    kid_score_floor: 8,
    regulatory_citations: [
      "California Proposition 65: listed as causing reproductive toxicity (developmental) since 2005",
      "EU Cosmetics Regulation 1223/2009: not prohibited but multiple SCCS opinions raise concerns; permitted in fragrances under industry self-regulation",
      "US FDA cosmetic survey (Hubinger 2010, Journal of Cosmetic Science): identified DEP as the most commonly detected phthalate in personal care products with no current federal restrictions",
      "Personal care product use patterns and phthalate biomarkers across pregnancy 2024 (Journal of Exposure Science & Environmental Epidemiology): MEP, the main DEP metabolite, was the phthalate biomarker most strongly associated with fragranced personal care product use; women in low-fragranced-product-use groups showed significantly lower MEP concentrations",
      "Moghazy et al. 2025 (International Journal of Molecular Sciences): systematic review of phthalate reproductive toxicology covering January 2020 to June 2024, identified DEP among the low-molecular-weight phthalates with documented hormonal disruption pathways and gonadal function effects",
    ],
    reasoning: "DEP is the most common phthalate in personal care, used primarily as a fragrance fixative and solvent. It is rarely listed explicitly on labels because fragrance disclosure laws permit hiding individual fragrance ingredients under the umbrella term 'fragrance' or 'parfum,' meaning a product labeled 'fragrance-free' is reliably DEP-free but a product with 'fragrance' may or may not contain DEP depending on the formulator. California Prop 65 lists DEP as a developmental toxicant. The 2024 personal care biomarker study is particularly relevant because it directly demonstrated that fragranced product use drives DEP exposure in pregnant women, validating the disclosure-gap concern. The base_hazard_score reflects both the demonstrated endocrine activity and the disclosure problem, since users cannot reliably avoid DEP through label reading alone.",
  },

  dibutyl_phthalate: {
    inci_name: "Dibutyl Phthalate",
    aliases: [
      "dibutyl phthalate",
      "dbp",
      "phthalic acid dibutyl ester",
      "di-n-butyl phthalate",
      "1,2-benzenedicarboxylic acid dibutyl ester",
    ],
    hazard_class: "reproductive_toxicant",
    base_hazard_score: 8,
    skin_absorption_modifier: 0.85,
    pregnancy_concern: true,
    pregnancy_score_floor: 9,
    kid_concern: true,
    kid_score_floor: 9,
    regulatory_citations: [
      "EU Cosmetics Regulation 1223/2009 Annex II: prohibited in cosmetic products (CMR category 1B reproductive toxicant)",
      "California Proposition 65: listed as causing reproductive toxicity (developmental and male) since 2005, female reproductive toxicity added 2007",
      "EU REACH Annex XVII: restricted use in toys and childcare articles since 2005, expanded restrictions 2018",
      "US Consumer Product Safety Improvement Act 2008: permanent prohibition in children's toys and child care articles at concentrations above 0.1%",
      "Trasande et al. 2024 (Lancet Planetary Health): prospective analysis of US births estimated 56,595 phthalate-attributable preterm birth cases in 2018 with $3.84 billion in associated costs; DBP was among the phthalates implicated in shortened gestational age",
    ],
    reasoning: "DBP was historically used as a plasticizer in nail polish and as a fragrance fixative, but the regulatory framework has tightened significantly since 2005 across multiple jurisdictions. The EU prohibits it in cosmetics outright as a CMR category 1B reproductive toxicant. The US restricts it in children's products through the CPSIA. California Prop 65 lists it as a developmental and reproductive toxicant for both sexes. The Trasande 2024 Lancet Planetary Health analysis quantified the population-level cost: tens of thousands of preterm births annually in the US attributable to phthalate exposure, with billions in associated healthcare and developmental costs. Despite restrictions, DBP can still appear in personal care products manufactured for non-EU markets or in older formulations, and contamination from manufacturing equipment is documented.",
  },

  diethylhexyl_phthalate: {
    inci_name: "Di(2-ethylhexyl) Phthalate",
    aliases: [
      "di(2-ethylhexyl) phthalate",
      "dehp",
      "diethylhexyl phthalate",
      "bis(2-ethylhexyl) phthalate",
      "phthalic acid bis(2-ethylhexyl) ester",
      "1,2-benzenedicarboxylic acid bis(2-ethylhexyl) ester",
    ],
    hazard_class: "carcinogen_suspected",
    base_hazard_score: 9,
    skin_absorption_modifier: 0.85,
    pregnancy_concern: true,
    pregnancy_score_floor: 9,
    kid_concern: true,
    kid_score_floor: 9,
    regulatory_citations: [
      "EU Cosmetics Regulation 1223/2009 Annex II: prohibited in cosmetic products (CMR category 1B reproductive toxicant)",
      "IARC Monograph Volume 101 (2013): classified as Group 2B (possibly carcinogenic to humans) based on liver tumor induction in rodents",
      "California Proposition 65: listed as known to cause cancer (1988), developmental toxicity (2003), and male reproductive toxicity (2005)",
      "EU REACH Annex XIV: subject to authorization, severely restricting industrial use since 2015",
      "Ren et al. 2024 (Environment & Health, ACS): systematic review and meta-analysis of 37 studies across 8 countries with 28,911 participants confirmed associations between urinary DEHP metabolites and altered reproductive hormone profiles in both general and susceptible populations",
    ],
    reasoning: "DEHP is the most extensively studied phthalate and the one with the most severe regulatory restrictions globally. It is prohibited in EU cosmetics outright, restricted under REACH for industrial use, classified as a possible human carcinogen by IARC, and listed under Prop 65 for cancer plus developmental and reproductive toxicity. The Ren 2024 meta-analysis with nearly 29,000 participants is the largest synthesis to date confirming reproductive hormone disruption from DEHP exposure measured via urinary metabolites. Its primary historical use in personal care was as a plasticizer in product packaging that could leach into the formula, and as a fragrance solvent. Modern personal care manufacturing has largely eliminated intentional DEHP use, but contamination from packaging or imported ingredients remains a documented concern. The base_hazard_score of 9 reflects the convergence of regulatory severity across multiple frameworks rather than the prevalence in current formulations.",
  },

  butyl_benzyl_phthalate: {
    inci_name: "Butyl Benzyl Phthalate",
    aliases: [
      "butyl benzyl phthalate",
      "bbp",
      "benzyl butyl phthalate",
      "phthalic acid butyl benzyl ester",
      "1,2-benzenedicarboxylic acid butyl phenylmethyl ester",
    ],
    hazard_class: "reproductive_toxicant",
    base_hazard_score: 8,
    skin_absorption_modifier: 0.85,
    pregnancy_concern: true,
    pregnancy_score_floor: 9,
    kid_concern: true,
    kid_score_floor: 9,
    regulatory_citations: [
      "EU Cosmetics Regulation 1223/2009 Annex II: prohibited in cosmetic products (CMR category 1B reproductive toxicant)",
      "California Proposition 65: listed as causing reproductive toxicity (developmental and male) since 2005",
      "EU REACH Annex XVII: restricted use in toys and childcare articles since 2005",
      "US Consumer Product Safety Improvement Act 2008: permanent prohibition in children's toys and child care articles at concentrations above 0.1%",
      "Sastre et al. 2024 (Science of the Total Environment): PRISMA systematic review of prenatal phthalate exposure confirmed BBP among phthalates associated with pregnancy complications including gestational diabetes, pregnancy-induced hypertension, fetal growth restriction, and preterm birth",
    ],
    reasoning: "BBP shares the regulatory profile of DBP and DEHP as a CMR category 1B reproductive toxicant prohibited in EU cosmetics. Historically used in adhesives, vinyl flooring, and some personal care formulations, its use in cosmetics has largely been phased out in major markets. The Sastre 2024 systematic review documented BBP among the phthalates with consistent associations to adverse pregnancy outcomes across multiple cohort studies. Personal care exposure today comes primarily from contamination rather than intentional use, but a calibration entry that flags it correctly is more useful than an absence that lets contaminated products score normally. Same regulatory severity as DBP justifies the equivalent base_hazard_score and pregnancy_score_floor.",
  },

  diisobutyl_phthalate: {
    inci_name: "Diisobutyl Phthalate",
    aliases: [
      "diisobutyl phthalate",
      "dibp",
      "isobutyl phthalate",
      "phthalic acid diisobutyl ester",
      "1,2-benzenedicarboxylic acid bis(2-methylpropyl) ester",
    ],
    hazard_class: "reproductive_toxicant",
    base_hazard_score: 8,
    skin_absorption_modifier: 0.85,
    pregnancy_concern: true,
    pregnancy_score_floor: 9,
    kid_concern: true,
    kid_score_floor: 9,
    regulatory_citations: [
      "EU Cosmetics Regulation 1223/2009 Annex II: prohibited in cosmetic products (CMR category 1B reproductive toxicant)",
      "EU REACH Annex XVII: restricted alongside DBP, BBP, DEHP for use in articles intended for indoor use and skin contact since 2020",
      "California Proposition 65: listed as causing reproductive toxicity (male) since 2007",
      "European Chemicals Agency RAC Opinion 2009: classified as toxic to reproduction category 1B based on testicular toxicity in animal studies, parallel to DBP findings",
      "Mitra et al. 2025 (Frontiers in Endocrinology): systematic review of phthalate exposure and gestational diabetes mellitus identified DiBP among low-molecular-weight phthalates with documented insulin signaling disruption in pregnant women",
    ],
    reasoning: "DiBP is the structural isomer of DBP with branched rather than linear butyl chains. It was developed and used as a substitute for DBP after restrictions tightened on the linear form, but regulatory bodies recognized similar reproductive toxicity and tightened restrictions on DiBP in parallel. The 2020 EU REACH expansion specifically grouped DiBP with DBP, BBP, and DEHP as restricted in articles for indoor use and skin contact, reflecting the regulatory consensus that the four phthalates share enough toxicological profile to be treated as a class. The Mitra 2025 review extended the concern to metabolic outcomes during pregnancy, not just reproductive outcomes. Personal care use has been eliminated in EU markets but may persist in non-EU manufacturing.",
  },

  dimethyl_phthalate: {
    inci_name: "Dimethyl Phthalate",
    aliases: [
      "dimethyl phthalate",
      "dmp",
      "phthalic acid dimethyl ester",
      "1,2-benzenedicarboxylic acid dimethyl ester",
    ],
    hazard_class: "irritant",
    base_hazard_score: 5,
    skin_absorption_modifier: 0.85,
    pregnancy_concern: false,
    pregnancy_score_floor: null,
    kid_concern: true,
    kid_score_floor: 6,
    regulatory_citations: [
      "EU Cosmetics Regulation 1223/2009: not prohibited or restricted; CIR Cosmetic Ingredient Review concluded safe for use as a cosmetic fragrance component at typical concentrations",
      "US EPA Toxic Substances Control Act inventory: not subject to specific restrictions but flagged for monitoring as part of phthalates class",
      "OECD SIDS Initial Assessment 2002: low acute toxicity, no clear reproductive toxicity signal at relevant exposure levels, distinguishing DMP from longer-chain phthalates",
      "California EPA OEHHA: reviewed DMP repeatedly without listing under Prop 65, distinguishing it from longer-chain phthalates that triggered listings",
      "Mitra et al. 2025 (Frontiers in Endocrinology): noted DMP among low-molecular-weight phthalates extensively used in personal care but with weaker endocrine signal compared to DEP, DBP, and DiBP in gestational diabetes outcomes",
    ],
    reasoning: "DMP is the shortest-chain phthalate commonly evaluated in personal care safety assessments. Unlike DEP through DEHP, DMP does not show the same reproductive or endocrine toxicity signals at typical exposure levels. CIR concluded it is safe for cosmetic use, EU has not prohibited or restricted it, and California has reviewed without Prop 65 listing. The Mitra 2025 systematic review specifically distinguished DMP from the higher-concern low-molecular-weight phthalates in metabolic outcomes. Including DMP in this calibration table at a moderate score serves two purposes: it ensures that products containing DMP do not get incorrectly flagged at the same severity as DBP or DEHP, and it provides a calibrated reference point for phthalates more generally. The base_hazard_score of 5 reflects appropriate caution about phthalates as a class without overstating the specific risk of DMP.",
  },

  dihexyl_phthalate: {
    inci_name: "Di-n-hexyl Phthalate",
    aliases: [
      "di-n-hexyl phthalate",
      "dnhp",
      "dihexyl phthalate",
      "phthalic acid di-n-hexyl ester",
      "1,2-benzenedicarboxylic acid dihexyl ester",
    ],
    hazard_class: "reproductive_toxicant",
    base_hazard_score: 8,
    skin_absorption_modifier: 0.85,
    pregnancy_concern: true,
    pregnancy_score_floor: 9,
    kid_concern: true,
    kid_score_floor: 9,
    regulatory_citations: [
      "EU Cosmetics Regulation 1223/2009 Annex II: prohibited in cosmetic products (CMR category 1B reproductive toxicant)",
      "California Proposition 65: listed as causing reproductive toxicity (developmental) since 2008",
      "EU REACH Annex XIV: candidate list of substances of very high concern since 2009 based on reproductive toxicity",
      "US EPA Phthalates Action Plan 2012: included DnHP among priority phthalates for risk management consideration based on toxicity profile parallel to DEHP",
      "Moghazy et al. 2025 (International Journal of Molecular Sciences): systematic review of phthalate reproductive toxicology grouped DnHP with the longer-chain phthalates showing testicular and developmental effects in animal studies at relevant exposure levels",
    ],
    reasoning: "DnHP is uncommon in current personal care formulations but appears in the calibration table because it shares the regulatory severity of DBP, BBP, DEHP, and DiBP as a CMR category 1B reproductive toxicant prohibited in EU cosmetics. Its inclusion here ensures that any product containing DnHP either through formulation or contamination gets flagged at the appropriate severity rather than missing the table entirely. The Moghazy 2025 systematic review confirmed DnHP among the longer-chain phthalates with consistent reproductive toxicity findings across studies. Real-world personal care exposure to DnHP is rare but documented in legacy formulations and some imported products, which is why a calibration entry is worth maintaining despite low prevalence.",
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
