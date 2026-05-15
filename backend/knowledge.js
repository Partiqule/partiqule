// R5b prep — knowledge base scaffold.
//
// Source of truth for Ask mode type 2 queries (e.g. "What is PFAS?",
// "Are phthalates a concern?", "What does Made Safe certified mean?").
// Curated entries here are the substrate the LLM frames from. The text
// must be defensible as written, since the model will paraphrase but
// not fact-check. Curated copy follows the Voice Kit rules — score-
// anchored language, no "safe", no first person, specific receipts.
//
// Status lifecycle:
//   needs_curation  scaffolded, no content. Paul or Sara fills in.
//   draft           content written, awaiting review.
//   live            reviewed, fit for Ask type 2 grounding.
//
// Today every entry is needs_curation. R5b cannot ship type 2 queries
// usefully until at least the highest-frequency ask topics are live —
// see docs/r5b-coverage-audit.md for the recommended curation order.

"use strict";

const ENTRY_SHAPE = {
  // id: string — slug. URL safe, lowercase, underscores.
  // subject: string — display name.
  // category: "ingredient" | "chemical" | "certification" | "material"
  // plain_language_explanation: string — ~100 words. Reads aloud well.
  // health_safety_context: string — ~100 words. Cites the regulatory
  //   posture (FDA / EPA / EU / state action) and the human research
  //   base. Includes years.
  // partiqule_flags: string[] — calibration / scoring flag keys that
  //   relate to this subject. Lets the model say "this is what makes
  //   the score what it is" with a direct link to our flag system.
  // sources: [{ name, url, date }] — primary citations. Avoid press
  //   releases; prefer peer-reviewed, regulatory bodies, EWG/NIH.
  // status: "needs_curation" | "draft" | "live"
};

const ENTRIES = [
  // ── Chemicals and ingredients ────────────────────────────────
  {
    id: "pfas",
    subject: "PFAS",
    category: "chemical",
    plain_language_explanation:
      "PFAS stands for per and polyfluoroalkyl substances. A group of thousands of synthetic chemicals engineered to resist water, oil, stains, and heat. They show up in non stick cookware, waterproof clothing, stain resistant fabrics, food packaging like greaseproof wrappers and microwave popcorn bags, cosmetics, and firefighting foams. Often called forever chemicals because the fluorine to carbon bond is one of the strongest in chemistry. They do not break down in the environment over any realistic timeframe. They accumulate in soil, water, wildlife, and human bodies. Trace levels show up in nearly every American's blood.",
    health_safety_context:
      "The CDC Agency for Toxic Substances and Disease Registry tracks PFAS health effects from epidemiological studies. Associations identified to date include higher cholesterol levels, reduced antibody response to vaccines in children, changes in liver enzymes, kidney and testicular cancer, and pregnancy complications such as hypertension, preeclampsia, and lower birth weight. In April 2024 the EPA finalized the first enforceable federal drinking water limits for six PFAS at 4 parts per trillion. In May 2025 the agency kept limits on PFOA and PFOS, rescinded limits for four others, and extended compliance to 2031.",
    partiqule_flags: ["pfas", "ptfe", "fluoropolymer"],
    sources: [
      { name: "ATSDR Health Effects of PFAS",
        url: "https://www.atsdr.cdc.gov/pfas/about/health-effects.html",
        date: "2025-07-22" },
      { name: "EPA Per and Polyfluoroalkyl Substances",
        url: "https://www.epa.gov/sdwa/and-polyfluoroalkyl-substances-pfas",
        date: "2025-05-14" },
      { name: "NIEHS PFAS",
        url: "https://www.niehs.nih.gov/health/topics/agents/pfc/",
        date: "2024" },
    ],
    status: "live",
  },
  { id: "phthalates", subject: "Phthalates", category: "chemical",
    plain_language_explanation: "", health_safety_context: "",
    partiqule_flags: ["phthalates"], sources: [], status: "needs_curation" },
  { id: "parabens", subject: "Parabens", category: "chemical",
    plain_language_explanation: "", health_safety_context: "",
    partiqule_flags: ["parabens"], sources: [], status: "needs_curation" },
  { id: "bpa_bps", subject: "BPA and BPS", category: "chemical",
    plain_language_explanation: "", health_safety_context: "",
    partiqule_flags: ["bpa", "bps"], sources: [], status: "needs_curation" },
  { id: "microplastics", subject: "Microplastics", category: "chemical",
    plain_language_explanation: "", health_safety_context: "",
    partiqule_flags: ["microplastics"], sources: [], status: "needs_curation" },
  { id: "lead", subject: "Lead", category: "chemical",
    plain_language_explanation: "", health_safety_context: "",
    partiqule_flags: ["lead"], sources: [], status: "needs_curation" },
  { id: "cadmium", subject: "Cadmium", category: "chemical",
    plain_language_explanation: "", health_safety_context: "",
    partiqule_flags: ["cadmium"], sources: [], status: "needs_curation" },
  { id: "mercury", subject: "Mercury", category: "chemical",
    plain_language_explanation: "", health_safety_context: "",
    partiqule_flags: ["mercury"], sources: [], status: "needs_curation" },
  { id: "synthetic_dyes", subject: "Synthetic dyes (Red 40, Yellow 5, Blue 1)", category: "ingredient",
    plain_language_explanation: "", health_safety_context: "",
    partiqule_flags: ["artificial_dye", "red_40", "yellow_5", "blue_1"], sources: [], status: "needs_curation" },
  { id: "sls_sles", subject: "SLS and SLES", category: "ingredient",
    plain_language_explanation: "", health_safety_context: "",
    partiqule_flags: ["sulfates"], sources: [], status: "needs_curation" },
  { id: "formaldehyde_releasers", subject: "Formaldehyde releasers", category: "chemical",
    plain_language_explanation: "", health_safety_context: "",
    partiqule_flags: ["formaldehyde"], sources: [], status: "needs_curation" },
  { id: "triclosan", subject: "Triclosan", category: "chemical",
    plain_language_explanation: "", health_safety_context: "",
    partiqule_flags: ["triclosan"], sources: [], status: "needs_curation" },
  { id: "oxybenzone", subject: "Oxybenzone", category: "chemical",
    plain_language_explanation: "", health_safety_context: "",
    partiqule_flags: ["oxybenzone"], sources: [], status: "needs_curation" },
  { id: "octinoxate", subject: "Octinoxate", category: "chemical",
    plain_language_explanation: "", health_safety_context: "",
    partiqule_flags: ["octinoxate"], sources: [], status: "needs_curation" },
  { id: "glyphosate", subject: "Glyphosate", category: "chemical",
    plain_language_explanation: "", health_safety_context: "",
    partiqule_flags: ["glyphosate"], sources: [], status: "needs_curation" },
  { id: "natural_flavors", subject: "Natural flavors (regulatory term)", category: "ingredient",
    plain_language_explanation: "", health_safety_context: "",
    partiqule_flags: ["natural_flavors"], sources: [], status: "needs_curation" },
  { id: "high_fructose_corn_syrup", subject: "High fructose corn syrup", category: "ingredient",
    plain_language_explanation: "", health_safety_context: "",
    partiqule_flags: ["hfcs", "added_sugar"], sources: [], status: "needs_curation" },
  { id: "artificial_sweeteners", subject: "Aspartame and artificial sweeteners", category: "ingredient",
    plain_language_explanation: "", health_safety_context: "",
    partiqule_flags: ["aspartame", "sucralose", "acesulfame_k", "saccharin"], sources: [], status: "needs_curation" },
  { id: "sodium_nitrite", subject: "Sodium nitrite", category: "chemical",
    plain_language_explanation: "", health_safety_context: "",
    partiqule_flags: ["sodium_nitrite"], sources: [], status: "needs_curation" },
  { id: "carrageenan", subject: "Carrageenan", category: "ingredient",
    plain_language_explanation: "", health_safety_context: "",
    partiqule_flags: ["carrageenan"], sources: [], status: "needs_curation" },

  // ── Materials ────────────────────────────────────────────────
  { id: "polyester", subject: "Polyester", category: "material",
    plain_language_explanation: "", health_safety_context: "",
    partiqule_flags: ["synthetic_fiber", "microfiber_shed"], sources: [], status: "needs_curation" },
  { id: "recycled_polyester", subject: "Recycled polyester", category: "material",
    plain_language_explanation: "", health_safety_context: "",
    partiqule_flags: ["recycled_synthetic"], sources: [], status: "needs_curation" },
  { id: "organic_cotton_vs_conventional", subject: "Organic cotton vs conventional cotton", category: "material",
    plain_language_explanation: "", health_safety_context: "",
    partiqule_flags: ["organic_cotton", "conventional_cotton", "pesticides"], sources: [], status: "needs_curation" },
  { id: "silicone_vs_plastic", subject: "Silicone vs plastic", category: "material",
    plain_language_explanation: "", health_safety_context: "",
    partiqule_flags: ["silicone", "plastic_body"], sources: [], status: "needs_curation" },
  { id: "borosilicate_vs_soda_lime_glass", subject: "Borosilicate glass vs soda lime glass", category: "material",
    plain_language_explanation: "", health_safety_context: "",
    partiqule_flags: ["borosilicate", "soda_lime_glass"], sources: [], status: "needs_curation" },

  // ── Certifications ───────────────────────────────────────────
  { id: "usda_organic", subject: "USDA Organic", category: "certification",
    plain_language_explanation: "", health_safety_context: "",
    partiqule_flags: ["usda_organic"], sources: [], status: "needs_curation" },
  { id: "ewg_verified", subject: "EWG Verified", category: "certification",
    plain_language_explanation: "", health_safety_context: "",
    partiqule_flags: ["ewg_verified"], sources: [], status: "needs_curation" },
  { id: "made_safe", subject: "MADE SAFE", category: "certification",
    plain_language_explanation: "", health_safety_context: "",
    partiqule_flags: ["made_safe"], sources: [], status: "needs_curation" },
  { id: "gots", subject: "GOTS (Global Organic Textile Standard)", category: "certification",
    plain_language_explanation: "", health_safety_context: "",
    partiqule_flags: ["gots"], sources: [], status: "needs_curation" },
  { id: "non_gmo_project_verified", subject: "Non-GMO Project Verified", category: "certification",
    plain_language_explanation: "", health_safety_context: "",
    partiqule_flags: ["non_gmo"], sources: [], status: "needs_curation" },
  { id: "leaping_bunny", subject: "Leaping Bunny", category: "certification",
    plain_language_explanation: "", health_safety_context: "",
    partiqule_flags: ["leaping_bunny", "cruelty_free"], sources: [], status: "needs_curation" },
  { id: "fair_trade_certified", subject: "Fair Trade Certified", category: "certification",
    plain_language_explanation: "", health_safety_context: "",
    partiqule_flags: ["fair_trade"], sources: [], status: "needs_curation" },
  { id: "greenguard_gold", subject: "Greenguard Gold", category: "certification",
    plain_language_explanation: "", health_safety_context: "",
    partiqule_flags: ["greenguard_gold"], sources: [], status: "needs_curation" },
  { id: "oeko_tex", subject: "Oeko-Tex Standard 100", category: "certification",
    plain_language_explanation: "", health_safety_context: "",
    partiqule_flags: ["oeko_tex"], sources: [], status: "needs_curation" },
];

function findEntry(id) {
  const k = String(id || "").toLowerCase();
  return ENTRIES.find(e => e.id === k) || null;
}

function entriesByStatus(status) {
  return ENTRIES.filter(e => e.status === status);
}

module.exports = {
  KNOWLEDGE_ENTRIES: ENTRIES,
  ENTRY_SHAPE,
  findEntry,
  entriesByStatus,
};
