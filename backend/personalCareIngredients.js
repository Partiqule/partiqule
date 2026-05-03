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
      "EU SCCS Opinion on Methylparaben SCCS/1652/23 (February 2024): most recent regulatory science review by EU Scientific Committee on Consumer Safety, reaffirming concentration limits while continuing to monitor endocrine disruption evidence",
      "Routledge et al. 1998 (Toxicology and Applied Pharmacology 153:12-19): foundational demonstration that alkyl hydroxy benzoate preservatives including methylparaben are weakly estrogenic in vitro and in vivo uterotrophic assays",
      "Karwacka et al. 2019 (Human Fertility Cambridge 22(1):2-25): systematic review of widespread environmental endocrine disrupting chemicals and reproductive potential of women, identifying parabens among the EDCs with consistent epidemiological signals",
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
      "EFSA re-evaluation 2004: ethylparaben (E214) included in group ADI with methylparaben at 0-10 mg/kg bw/day for food applications",
      "Routledge et al. 1998 (Toxicology and Applied Pharmacology 153:12-19): foundational demonstration of estrogenic activity across paraben class with ethylparaben showing potency intermediate between methyl and longer-chain variants",
      "Peinado et al. 2023 (International Journal of Molecular Sciences 24(8):7325): systematic review of human exposure to bisphenols, parabens, and benzophenones documenting inflammatory response associations with paraben biomarkers including ethylparaben",
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
      "EU Cosmetics Regulation 1223/2009 Annex V: permitted preservative, max 0.14% as single paraben (reduced from 0.4% in 2014 by Regulation 1004/2014 specifically for propyl and butyl parabens due to endocrine concerns)",
      "EU Regulation 358/2014: prohibited propylparaben in leave-on products for the diaper area in children under 3",
      "Denmark national restriction (Order No. 4/2011): banned in personal care products for children under 3 years",
      "Vo et al. 2010 (Reproductive Toxicology 29(3):306-316): potential estrogenic effects of parabens at the prepubertal stage of a postnatal female rat model demonstrated propylparaben uterotrophic activity exceeding methylparaben",
      "EU SCCS Opinion on Propylparaben SCCS/1623/20 (2021): most recent dedicated regulatory science review of propylparaben confirming the 0.14% concentration limit based on endocrine activity assessment",
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
      "Boberg et al. 2010 (Reproductive Toxicology 30(2):301-312): comprehensive review concluding parabens including butylparaben have possible endocrine disrupting effects warranting continued investigation",
      "Boberg et al. 2016 (Toxicological Sciences 152(1):244-256): perinatal butylparaben exposure in rats reduced sperm count at doses as low as 10 mg/kg bw/day, with reduced anogenital distance in offspring and altered prostate development, establishing the lowest observed adverse effect level for butylparaben in development",
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
      "Routledge et al. 1998 (Toxicology and Applied Pharmacology 153:12-19): foundational paraben estrogenicity work that established the chain-length-to-potency relationship later cited as basis for the EU 2014 prohibition of branched-chain parabens including isobutylparaben",
      "Dasmahapatra et al. 2024 (Frontiers in Toxicology): systematic review of paraben toxicity in fish models confirmed branched-chain and longer-chain parabens including isobutylparaben demonstrate stronger endocrine disruption signals than methyl and ethyl variants",
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

  dmdm_hydantoin: {
    inci_name: "DMDM Hydantoin",
    aliases: [
      "dmdm hydantoin",
      "dmdmh",
      "1,3-dimethylol-5,5-dimethylhydantoin",
      "1,3-bis(hydroxymethyl)-5,5-dimethyl-2,4-imidazolidinedione",
      "1,3-bis(hydroxymethyl)-5,5-dimethylhydantoin",
      "dantoin dmdmh",
      "glycoserve-dmdmh",
    ],
    hazard_class: "preservative_concern",
    base_hazard_score: 7,
    skin_absorption_modifier: 0.85,
    pregnancy_concern: true,
    pregnancy_score_floor: 8,
    kid_concern: true,
    kid_score_floor: 8,
    regulatory_citations: [
      "EU Cosmetics Regulation 1223/2009 Annex V: permitted preservative; products containing more than 0.05% must be labeled 'contains formaldehyde' due to release threshold",
      "California Toxic-Free Cosmetics Act (effective 2025): bans formaldehyde, paraformaldehyde, methylene glycol, and quaternium-15 from cosmetics; broader formaldehyde-releaser restrictions under regulatory consideration",
      "Washington State Toxic-Free Cosmetics Act (May 2023, effective January 2027): first US state ban on the entire class of formaldehyde-releasing preservatives in cosmetics",
      "IARC Monograph Volume 100F (2012): formaldehyde classified as Group 1 (known human carcinogen) based on nasopharyngeal cancer and leukemia evidence in humans",
      "Wang et al. 2025 (Environmental Science & Technology Letters, Silent Spring Institute): Taking Stock Study found 53% of Black women and Latinas in South Los Angeles used at least one personal care product containing formaldehyde or formaldehyde-releasing preservatives, with DMDM hydantoin among the most common",
    ],
    reasoning: "DMDM hydantoin is the most common formaldehyde-releasing preservative in personal care, particularly in shampoos, conditioners, and body washes. It works by slowly releasing formaldehyde over time, which prevents microbial growth but also creates ongoing low-dose formaldehyde exposure to the user. The FDA recognizes it as a common cosmetic allergen, and the EU requires products containing more than 0.05% to carry a 'contains formaldehyde' warning label, a disclosure requirement that does not exist in the US. Free formaldehyde is classified by IARC as a known human carcinogen. The Wang 2025 Silent Spring Institute study quantified what consumer advocates have argued for years: formaldehyde-releasing preservatives are disproportionately present in products marketed to communities of color. California has begun banning formaldehyde and quaternium-15 specifically; broader FRP restrictions are advancing in Washington State.",
  },

  quaternium_15: {
    inci_name: "Quaternium-15",
    aliases: [
      "quaternium 15",
      "quaternium-15",
      "dowicil 200",
      "1-(3-chloroallyl)-3,5,7-triaza-1-azoniaadamantane chloride",
      "n-(3-chloroallyl)hexaminium chloride",
    ],
    hazard_class: "sensitizer",
    base_hazard_score: 8,
    skin_absorption_modifier: 0.85,
    pregnancy_concern: true,
    pregnancy_score_floor: 9,
    kid_concern: true,
    kid_score_floor: 9,
    regulatory_citations: [
      "EU Cosmetics Regulation 1223/2009 Annex V: prohibited in cosmetic products since 2017 due to allergen and formaldehyde-release concerns",
      "California Toxic-Free Cosmetics Act (effective 2025): explicitly named in the cosmetic ingredient ban alongside formaldehyde, paraformaldehyde, and methylene glycol",
      "Washington State Toxic-Free Cosmetics Act (May 2023, effective January 2027): includes quaternium-15 in the formaldehyde-releasing preservative class ban",
      "Goossens et al. 2022 (Contact Dermatitis 86(6):485-498): clinical review identified quaternium-15 historically as the strongest formaldehyde releaser per molecule and one of the most frequent causes of preservative-related allergic contact dermatitis before EU prohibition",
      "de Groot et al. 2010 (Contact Dermatitis 62(1):2-17, Part 1 of 2): foundational characterization of formaldehyde releasers in cosmetics established quaternium-15 as releasing the highest concentration of free formaldehyde per equivalent preservative dose",
    ],
    reasoning: "Quaternium-15 was historically the most aggressive formaldehyde-releasing preservative on the market and the most common cause of preservative-related allergic contact dermatitis in dermatology clinics worldwide. The EU prohibited it in cosmetics in 2017 specifically because the allergen burden could not be justified given safer alternatives. California named it explicitly in the 2025 Toxic-Free Cosmetics Act ban alongside formaldehyde itself, treating it as functionally equivalent to formaldehyde for regulatory purposes. Use in modern personal care has declined sharply but it can still appear in older formulations or products manufactured for unrestricted markets. The high kid_score_floor reflects the convergence of carcinogen-precursor and severe allergen status.",
  },

  imidazolidinyl_urea: {
    inci_name: "Imidazolidinyl Urea",
    aliases: [
      "imidazolidinyl urea",
      "imidurea",
      "germall 115",
      "1,1'-methylenebis{3-[3-(hydroxymethyl)-2,5-dioxoimidazolidin-4-yl]urea}",
      "n,n''-methylenebis[n'-[3-(hydroxymethyl)-2,5-dioxo-4-imidazolidinyl]urea]",
    ],
    hazard_class: "preservative_concern",
    base_hazard_score: 6,
    skin_absorption_modifier: 0.85,
    pregnancy_concern: true,
    pregnancy_score_floor: 7,
    kid_concern: true,
    kid_score_floor: 7,
    regulatory_citations: [
      "EU Cosmetics Regulation 1223/2009 Annex V: permitted preservative up to 0.6%; products triggering free formaldehyde release above 0.05% must carry 'contains formaldehyde' warning",
      "Washington State Toxic-Free Cosmetics Act (May 2023, effective January 2027): includes imidazolidinyl urea in the formaldehyde-releasing preservative class ban",
      "IARC Monograph Volume 100F (2012): formaldehyde classified as Group 1 (known human carcinogen); imidazolidinyl urea concern derives from formaldehyde release rather than the parent compound",
      "Goossens et al. 2022 (Contact Dermatitis 86(6):485-498): clinical review of formaldehyde releasers identified imidazolidinyl urea among the five primary FRPs causing allergic contact dermatitis, frequently undeclared or hidden in personal care formulations",
      "de Groot et al. 2010 (Contact Dermatitis 62(1):2-17, Part 1 of 2): foundational FRP characterization established imidazolidinyl urea as releasing lower concentrations of free formaldehyde than quaternium-15 or DMDM hydantoin but still sufficient to provoke contact allergy in sensitized individuals",
    ],
    reasoning: "Imidazolidinyl urea is among the most commonly used formaldehyde-releasing preservatives in cosmetics, frequently paired with parabens in conventional formulations. It releases free formaldehyde at lower concentrations than quaternium-15 or DMDM hydantoin, which is why the EU permits it at higher use limits (up to 0.6%) compared to the more aggressive releasers. The base_hazard_score of 6 reflects this lower release rate while still acknowledging the formaldehyde-release mechanism that drives the ongoing regulatory pressure. The Goossens 2022 clinical review specifically flagged imidazolidinyl urea as a frequent contributor to preservative-related dermatitis, and Washington State's 2023 ban includes it in the broader FRP class restriction taking effect in 2027.",
  },

  diazolidinyl_urea: {
    inci_name: "Diazolidinyl Urea",
    aliases: [
      "diazolidinyl urea",
      "germall ii",
      "n-(1,3-bis(hydroxymethyl)-2,5-dioxoimidazolidin-4-yl)-n,n'-bis(hydroxymethyl)urea",
    ],
    hazard_class: "preservative_concern",
    base_hazard_score: 7,
    skin_absorption_modifier: 0.85,
    pregnancy_concern: true,
    pregnancy_score_floor: 7,
    kid_concern: true,
    kid_score_floor: 8,
    regulatory_citations: [
      "EU Cosmetics Regulation 1223/2009 Annex V: permitted preservative up to 0.5%; products triggering free formaldehyde release above 0.05% must carry 'contains formaldehyde' warning",
      "Washington State Toxic-Free Cosmetics Act (May 2023, effective January 2027): includes diazolidinyl urea in the formaldehyde-releasing preservative class ban",
      "European Society of Contact Dermatitis (recent recommendation): diazolidinyl urea added to the European baseline patch test series at 2% petrolatum, indicating clinical significance high enough to warrant systematic screening",
      "Goossens et al. 2022 (Contact Dermatitis 86(6):485-498): clinical review identified diazolidinyl urea as releasing more formaldehyde than imidazolidinyl urea, with sensitization rates exceeding the 0.5% threshold required for European baseline series inclusion",
      "de Groot et al. 2010 (Contact Dermatitis 62(2):18-31, Part 2 of 2): patch test relationship study established quantitative formaldehyde release rates with diazolidinyl urea releasing approximately twice the free formaldehyde of imidazolidinyl urea at equivalent concentrations",
    ],
    reasoning: "Diazolidinyl urea is structurally similar to imidazolidinyl urea but releases approximately twice the free formaldehyde at equivalent concentrations, which is reflected in its higher base_hazard_score of 7 versus imidazolidinyl urea's 6. Its sensitization rate has been high enough in European patch test populations to warrant inclusion in the European baseline series, a regulatory-clinical signal that few preservatives reach. The kid_score_floor is set higher than imidazolidinyl urea because of the higher formaldehyde release rate combined with the established sensitization burden. Use in personal care has declined as brands move away from formaldehyde-releasing preservatives, but presence in current formulations is still documented in the Goossens 2022 clinical review.",
  },

  sodium_hydroxymethylglycinate: {
    inci_name: "Sodium Hydroxymethylglycinate",
    aliases: [
      "sodium hydroxymethylglycinate",
      "suttocide a",
      "n-(hydroxymethyl)glycine sodium salt",
      "sodium n-hydroxymethyl-glycinate",
    ],
    hazard_class: "preservative_concern",
    base_hazard_score: 6,
    skin_absorption_modifier: 0.85,
    pregnancy_concern: true,
    pregnancy_score_floor: 7,
    kid_concern: true,
    kid_score_floor: 7,
    regulatory_citations: [
      "EU Cosmetics Regulation 1223/2009 Annex V: permitted preservative up to 0.5%; products triggering free formaldehyde release above 0.05% must carry 'contains formaldehyde' warning",
      "Washington State Toxic-Free Cosmetics Act (May 2023, effective January 2027): includes sodium hydroxymethylglycinate in the formaldehyde-releasing preservative class ban",
      "California Safe Cosmetics Program reporting requirement: products containing this ingredient must be reported to the state when sold in California, reflecting California's classification of the substance as a chemical of concern",
      "Goossens et al. 2022 (Contact Dermatitis 86(6):485-498): clinical review noted sodium hydroxymethylglycinate among formaldehyde-releasing preservatives that are sometimes marketed as 'natural' or 'plant-derived' despite identical formaldehyde-release mechanism to traditional FRPs",
      "Wang et al. 2025 (Environmental Science & Technology Letters): Silent Spring Institute Taking Stock Study documented sodium hydroxymethylglycinate as one of the formaldehyde-releasing preservatives present in personal care products used by Black women and Latinas, often in products marketed as natural or clean",
    ],
    reasoning: "Sodium hydroxymethylglycinate is sometimes promoted as a natural alternative to traditional formaldehyde-releasing preservatives because it is technically derived from the amino acid glycine, but the formaldehyde-release mechanism is identical to DMDM hydantoin or imidazolidinyl urea. The Goossens 2022 clinical review explicitly flagged this marketing pattern: products labeled natural or plant-derived can still contain formaldehyde-releasing preservatives that produce the same regulatory and allergen profile as conventional FRPs. The base_hazard_score reflects the formaldehyde-release mechanism rather than the natural-derivation framing. Washington State's 2023 ban includes sodium hydroxymethylglycinate in the broader FRP class restriction, treating it the same as conventional formaldehyde releasers despite the marketing distinction.",
  },

  sodium_lauryl_sulfate: {
    inci_name: "Sodium Lauryl Sulfate",
    aliases: [
      "sodium lauryl sulfate",
      "sls",
      "sodium dodecyl sulfate",
      "sds",
      "sodium n-dodecyl sulfate",
      "sulfuric acid monododecyl ester sodium salt",
    ],
    hazard_class: "irritant",
    base_hazard_score: 5,
    skin_absorption_modifier: 0.6,
    pregnancy_concern: false,
    pregnancy_score_floor: null,
    kid_concern: true,
    kid_score_floor: 6,
    regulatory_citations: [
      "CIR Final Report (Cosmetic Ingredient Review): SLS concluded safe in formulations designed for discontinuous, brief use followed by thorough rinsing; not recommended for prolonged contact with skin",
      "EU Cosmetics Regulation 1223/2009: not restricted but acknowledged as an irritant; no maximum concentration limit for rinse-off products",
      "FDA: classified as Generally Recognized as Safe (GRAS) for limited cosmetic applications including toothpaste, recognizing its surfactant function",
      "Patil et al. 2021 (Cosmetics 8(1):6): study of SLS-induced skin barrier disruption documented increased redness, decreased stratum corneum hydration, decreased skin barrier function, and shifts in skin microbiota toward potential pathogens after 24-hour exposure to 0.5% SLS",
      "Agner & Serup 1990, replicated through Borges et al. 2005 (Contact Dermatitis): long-term repetitive SLS exposure at concentrations as low as 0.025% to 0.075% induces irritant contact dermatitis with cumulative effects rather than skin adaptation",
    ],
    reasoning: "SLS is the most common harsh detergent surfactant in personal care, used in shampoos, body washes, and especially toothpaste. It is genuinely an irritant rather than a serious systemic concern: the regulatory framework treats it as safe in rinse-off applications because skin contact is brief. The base_hazard_score of 5 reflects the irritant profile rather than any carcinogen or endocrine concern, and the rinse-off-friendly skin_absorption_modifier of 0.6 captures that brief-contact reality. SLS is widely vilified in clean beauty marketing, but the scientific consensus is that the irritation concern is real and the carcinogen claims circulating online are not supported by evidence. The kid_score_floor reflects sensitivity of pediatric skin rather than a developmental toxicity concern.",
  },

  sodium_laureth_sulfate: {
    inci_name: "Sodium Laureth Sulfate",
    aliases: [
      "sodium laureth sulfate",
      "sles",
      "sodium lauryl ether sulfate",
      "sodium laureth-2 sulfate",
      "sodium laureth sulphate",
    ],
    hazard_class: "carcinogen_suspected",
    base_hazard_score: 7,
    skin_absorption_modifier: 0.6,
    pregnancy_concern: true,
    pregnancy_score_floor: 8,
    kid_concern: true,
    kid_score_floor: 8,
    regulatory_citations: [
      "California Proposition 65: 1,4-dioxane (a SLES manufacturing byproduct) listed as known to the state to cause cancer; products containing 1,4-dioxane above threshold require Prop 65 warning",
      "US EPA: 1,4-dioxane classified as 'likely to be carcinogenic to humans' based on multiple animal carcinogenicity studies",
      "US National Toxicology Program 15th Report on Carcinogens: 1,4-dioxane listed as 'reasonably anticipated to be a human carcinogen' based on sufficient evidence in experimental animals",
      "New York State Environmental Conservation Law (effective 2022): banned the sale of personal care products containing 1,4-dioxane above 1 ppm and household cleansing products above 2 ppm, the first US state with concentration limits",
      "Alsohaimi et al. 2020 (Scientific Reports 10(1):4881): GC-MS validation study confirmed 1,4-dioxane detection in cosmetic products containing ethoxylated surfactants including SLES, with concentrations exceeding cancer-risk thresholds in some formulations",
    ],
    reasoning: "SLES is created by ethoxylating SLS to make it gentler on skin, but the ethoxylation process produces 1,4-dioxane as a contaminating byproduct. 1,4-dioxane is the actual concern: classified as likely carcinogenic by EPA, listed under Prop 65, and subject to concentration limits in New York State. The 1,4-dioxane is not declared on labels because it is a contaminant rather than an intentional ingredient. Stringent manufacturing controls can reduce 1,4-dioxane to safer levels, but consumers cannot tell from labels whether a specific SLES-containing product was manufactured with those controls. The base_hazard_score of 7 (higher than SLS's 5) reflects this contamination concern rather than the parent SLES molecule, which is itself less irritating than SLS. The honest framing: SLS is more irritating, SLES is potentially more carcinogenic.",
  },

  ammonium_lauryl_sulfate: {
    inci_name: "Ammonium Lauryl Sulfate",
    aliases: [
      "ammonium lauryl sulfate",
      "als",
      "ammonium dodecyl sulfate",
      "monododecyl ester sulfuric acid ammonium salt",
    ],
    hazard_class: "irritant",
    base_hazard_score: 5,
    skin_absorption_modifier: 0.6,
    pregnancy_concern: false,
    pregnancy_score_floor: null,
    kid_concern: true,
    kid_score_floor: 6,
    regulatory_citations: [
      "CIR Final Report (Cosmetic Ingredient Review): ALS concluded safe in formulations designed for discontinuous, brief use followed by thorough rinsing; same conclusion and same caveats as SLS",
      "EU Cosmetics Regulation 1223/2009: not restricted; treated equivalently to SLS for regulatory purposes",
      "FDA: permitted in cosmetic applications without specific concentration limits in rinse-off products",
      "Patil et al. 2021 (Cosmetics 8(1):6): comparative surfactant irritancy studies confirm ALS produces similar skin barrier disruption to SLS, slightly less harsh due to ammonium counterion but mechanistically equivalent",
      "CIR comparative analysis: ALS and SLS share toxicological profiles; the regulatory consensus treats them as equivalent for safety assessment purposes despite minor differences in irritation potency",
    ],
    reasoning: "ALS is structurally similar to SLS with an ammonium counterion replacing sodium, used as an alternative anionic surfactant in shampoos and body washes. Toxicological behavior is essentially equivalent to SLS, treated as the same regulatory category. The base_hazard_score matches SLS at 5 reflecting the irritant rather than carcinogen profile. ALS does not undergo ethoxylation so does not carry the 1,4-dioxane contamination concern that elevates SLES. Some consumers prefer ALS over SLS based on marketing claims of gentleness, but the difference in irritation between SLS and ALS is small and clinically insignificant for most users.",
  },

  cocamide_dea: {
    inci_name: "Cocamide DEA",
    aliases: [
      "cocamide dea",
      "cocamide diethanolamine",
      "coconut oil diethanolamine condensate",
      "cocamide-dea",
      "lauric acid diethanolamide",
      "n,n-bis(2-hydroxyethyl) coconut fatty acid amide",
    ],
    hazard_class: "carcinogen_suspected",
    base_hazard_score: 8,
    skin_absorption_modifier: 0.7,
    pregnancy_concern: true,
    pregnancy_score_floor: 9,
    kid_concern: true,
    kid_score_floor: 9,
    regulatory_citations: [
      "IARC Monograph Volume 101 (2013): coconut oil diethanolamine condensate (cocamide DEA) classified as Group 2B (possibly carcinogenic to humans) based on dermal animal bioassay evidence",
      "California Proposition 65 (June 2012): cocamide DEA listed as known to cause cancer; products require warning labels",
      "US National Toxicology Program Technical Report 479 (Toxicology and Carcinogenesis Studies of Coconut Oil Acid Diethanolamine Condensate): documented topical DEA exposure caused tumor formation in laboratory animals across multiple study designs",
      "Center for Environmental Health enforcement actions (2013-present): forced over 120 companies to eliminate cocamide DEA from formulations through Prop 65 lawsuits, with continued discovery of cocamide DEA in dollar-store products as recently as 2024",
      "FDA acknowledgment: residual diethanolamine and DEA-derived ingredients can react with nitrosating agents to form nitrosamines, a separate carcinogenicity concern beyond the parent compound",
    ],
    reasoning: "Cocamide DEA is a foaming agent and thickener derived from coconut oil reacted with diethanolamine. IARC classified it as possibly carcinogenic in 2013 based on dermal animal carcinogenicity studies, and California followed with a Prop 65 listing. Modern personal care has largely phased out cocamide DEA in response to litigation and consumer pressure, but it persists in lower-cost formulations and dollar-store products. The base_hazard_score of 8 reflects the IARC 2B classification combined with the documented animal carcinogenicity. A separate concern is nitrosamine formation: cocamide DEA in the presence of nitrosating preservatives can form N-nitrosodiethanolamine, a more potent carcinogen than DEA itself.",
  },

  cocamide_mea: {
    inci_name: "Cocamide MEA",
    aliases: [
      "cocamide mea",
      "cocamide monoethanolamine",
      "coconut fatty acid monoethanolamide",
      "n-(2-hydroxyethyl) coconut fatty acid amide",
    ],
    hazard_class: "preservative_concern",
    base_hazard_score: 6,
    skin_absorption_modifier: 0.7,
    pregnancy_concern: true,
    pregnancy_score_floor: 7,
    kid_concern: true,
    kid_score_floor: 7,
    regulatory_citations: [
      "CIR Final Report on Ethanolamines: cocamide MEA concluded safe for use in cosmetics with the caveat that formulations should not contain nitrosating agents to prevent nitrosamine formation",
      "EU Cosmetics Regulation 1223/2009: not specifically restricted but ethanolamines as a class are subject to nitrosamine-formation prevention requirements",
      "FDA acknowledgment: monoethanolamine derivatives including cocamide MEA can react with nitrosating agents to form nitrosamines, with residual MEA contamination from manufacturing being the primary concern",
      "IARC: ethanolamines as a class have not received an IARC classification matching DEA's Group 2B; cocamide MEA is treated as substantially less concerning than cocamide DEA in regulatory assessments",
      "California Proposition 65: cocamide MEA is not listed under Prop 65 (in contrast to cocamide DEA), reflecting the regulatory distinction between mono and diethanolamine derivatives",
    ],
    reasoning: "Cocamide MEA is the monoethanolamine-derived analog of cocamide DEA, used for similar foaming and thickening purposes but with substantially lower carcinogenicity concerns. IARC has not classified MEA derivatives in the same Group 2B category as DEA derivatives, and California has not listed cocamide MEA under Prop 65. The primary concern is the nitrosamine-formation pathway shared with all ethanolamines: in the presence of nitrosating preservatives, residual MEA can form nitrosodiethanolamine and related carcinogens. The base_hazard_score of 6 reflects this nitrosamine-formation concern at lower severity than cocamide DEA, plus general ethanolamine sensitization potential. Brands that have moved away from cocamide DEA often substitute cocamide MEA as a similar-functioning ingredient with a meaningfully better safety profile.",
  },

  tea_lauryl_sulfate: {
    inci_name: "TEA-Lauryl Sulfate",
    aliases: [
      "tea-lauryl sulfate",
      "triethanolamine lauryl sulfate",
      "tea lauryl sulfate",
      "lauryl sulfate triethanolamine salt",
    ],
    hazard_class: "carcinogen_suspected",
    base_hazard_score: 7,
    skin_absorption_modifier: 0.6,
    pregnancy_concern: true,
    pregnancy_score_floor: 8,
    kid_concern: true,
    kid_score_floor: 8,
    regulatory_citations: [
      "EU Cosmetics Regulation 1223/2009 Annex III: triethanolamine subject to restriction with maximum concentration limits in cosmetic products and explicit prohibition of use with nitrosating systems",
      "California Proposition 65: nitrosodiethanolamine (NDELA, the nitrosamine formed from triethanolamine in the presence of nitrosating agents) listed as known to cause cancer",
      "IARC Monograph Volume 77 (2000): triethanolamine itself classified as Group 3 (not classifiable) but the nitrosamine formation pathway is well-documented",
      "FDA acknowledgment: TEA-derived surfactants combined with formaldehyde-releasing preservatives or nitrosating agents create the conditions for in-product nitrosamine formation, a primary regulatory concern across the TEA ingredient class",
      "CIR Final Report on Triethanolamine: concluded safe for cosmetic use with strict requirement that formulations avoid nitrosating systems to prevent NDELA formation",
    ],
    reasoning: "TEA-Lauryl Sulfate combines triethanolamine with lauryl sulfate to create a surfactant with milder pH than SLS or ALS. The lauryl sulfate component shares the irritant profile of SLS, while the triethanolamine component introduces the same nitrosamine-formation concern as cocamide DEA. The base_hazard_score of 7 reflects the convergence of irritation potential and nitrosamine pathway, weighted by the EU's specific restrictions on TEA-containing formulations. The honest framing: products with TEA-Lauryl Sulfate plus formaldehyde-releasing preservatives or other nitrosating agents in the same formulation create the conditions for in-product NDELA formation, which is the actual carcinogenicity concern.",
  },

  sodium_coco_sulfate: {
    inci_name: "Sodium Coco Sulfate",
    aliases: [
      "sodium coco sulfate",
      "scs",
      "sodium coconut sulfate",
      "sulfated coconut oil sodium salt",
    ],
    hazard_class: "irritant",
    base_hazard_score: 6,
    skin_absorption_modifier: 0.6,
    pregnancy_concern: false,
    pregnancy_score_floor: null,
    kid_concern: true,
    kid_score_floor: 6,
    regulatory_citations: [
      "EU Cosmetics Regulation 1223/2009: not restricted; treated as equivalent to other anionic sulfate surfactants in regulatory assessment",
      "CIR Cosmetic Ingredient Review: sodium coco sulfate evaluated as a complex mixture predominantly composed of sodium lauryl sulfate (typically 50% or more by weight); concluded equivalent safety profile to SLS for cosmetic use",
      "EWG ingredient assessment: sodium coco sulfate noted as frequently marketed as a natural alternative to SLS despite containing SLS as its primary constituent, with similar irritation profile",
      "Independent analytical studies: sodium coco sulfate confirmed to contain 50-70% sodium lauryl sulfate by composition, with the remainder being sulfated derivatives of myristic, capric, caprylic, and oleic fatty acids",
      "Industry technical literature: marketed as 'derived from coconut oil' but the production process produces sulfated fatty acid esters with the lauryl sulfate fraction being the dominant component by mass and by foaming function",
    ],
    reasoning: "Sodium Coco Sulfate is frequently marketed as a natural alternative to SLS, with brands using language like 'derived from coconut' to suggest a meaningful difference in safety. The chemistry tells a different story: SCS is predominantly composed of SLS (50% or more by weight) plus minor amounts of sulfated fatty acid esters from coconut oil's other fatty acid fractions. The base_hazard_score of 6 (slightly above SLS's 5) reflects a similar irritation profile with the added concern that the natural-marketing framing can mislead consumers into believing they are avoiding SLS when they are functionally getting SLS plus extras. Honest naming would have helped consumers more than the natural framing.",
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
