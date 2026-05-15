// backend/flagDetection.js
// Deterministic ingredient flag detection. Source of truth for whether a
// product contains specific concerns. Runs before AI scoring and again as a
// validation layer after, so the AI cannot claim a product is free of a
// substance the ingredient list contains.
//
// Exports:
//   detectFlags(ingredientText, category) -> { flags, summary, concernCount }
//   validateAIResponse(aiSubstances, deterministicFlags) -> { consistent, missingFromAI, extraInAI }
//   mergeFlags(aiSubstances, deterministicFlags) -> merged array (deterministic wins)

// ── Category buckets ─────────────────────────────────────────────
// Flags are scoped by product bucket. Pass category=null to check every flag.
const FOOD_CATEGORIES = new Set([
  "food", "beverage", "food_beverage", "restaurant", "supplement",
]);
const PERSONAL_CARE_CATEGORIES = new Set(["personal_care", "baby"]);
const HOME_CATEGORIES = new Set(["home"]);

function bucketForCategory(cat) {
  if (!cat) return null;
  const c = String(cat).toLowerCase();
  if (FOOD_CATEGORIES.has(c)) return "food";
  if (PERSONAL_CARE_CATEGORIES.has(c)) return "personal_care";
  if (HOME_CATEGORIES.has(c)) return "home";
  return null;
}

// ── Flag definitions ─────────────────────────────────────────────
// Each flag has `buckets` (applicable category buckets) and `patterns` (array
// of { label, regex, fragranceCheck? }). The label is the canonical substance
// name reported in matches.
const FLAG_DEFS = {
  // ============ FOOD AND BEVERAGE ============
  syntheticDyes: {
    buckets: ["food"],
    patterns: [
      { label: "Red 40",           regex: /\b(?:FD\s*&?\s*C\s+)?Red\s*(?:No\.?\s*)?40\b/i },
      { label: "Allura Red",       regex: /\ballura\s+red\b/i },
      { label: "Red 3",            regex: /\b(?:FD\s*&?\s*C\s+)?Red\s*(?:No\.?\s*)?3\b(?!\d)/i },
      { label: "Erythrosine",      regex: /\berythrosine\b/i },
      { label: "Yellow 5",         regex: /\b(?:FD\s*&?\s*C\s+)?Yellow\s*(?:No\.?\s*)?5\b/i },
      { label: "Tartrazine",       regex: /\btartrazine\b/i },
      { label: "Yellow 6",         regex: /\b(?:FD\s*&?\s*C\s+)?Yellow\s*(?:No\.?\s*)?6\b/i },
      { label: "Sunset Yellow",    regex: /\bsunset\s+yellow\b/i },
      { label: "Blue 1",           regex: /\b(?:FD\s*&?\s*C\s+)?Blue\s*(?:No\.?\s*)?1\b/i },
      { label: "Brilliant Blue",   regex: /\bbrilliant\s+blue\b/i },
      { label: "Blue 2",           regex: /\b(?:FD\s*&?\s*C\s+)?Blue\s*(?:No\.?\s*)?2\b/i },
      { label: "Indigo Carmine",   regex: /\bindigo\s+carmine\b/i },
      { label: "Green 3",          regex: /\b(?:FD\s*&?\s*C\s+)?Green\s*(?:No\.?\s*)?3\b/i },
      { label: "E102",             regex: /\bE[-\s]?102\b/i },
      { label: "E104",             regex: /\bE[-\s]?104\b/i },
      { label: "E110",             regex: /\bE[-\s]?110\b/i },
      { label: "E122",             regex: /\bE[-\s]?122\b/i },
      { label: "E124",             regex: /\bE[-\s]?124\b/i },
      { label: "E127",             regex: /\bE[-\s]?127\b/i },
      { label: "E129",             regex: /\bE[-\s]?129\b/i },
      { label: "E131",             regex: /\bE[-\s]?131\b/i },
      { label: "E132",             regex: /\bE[-\s]?132\b/i },
      { label: "E133",             regex: /\bE[-\s]?133\b/i },
      { label: "E142",             regex: /\bE[-\s]?142\b/i },
      { label: "E143",             regex: /\bE[-\s]?143\b/i },
      { label: "E151",             regex: /\bE[-\s]?151\b/i },
      { label: "E155",             regex: /\bE[-\s]?155\b/i },
    ],
  },

  artificialSweeteners: {
    buckets: ["food"],
    patterns: [
      { label: "aspartame",             regex: /\baspartame\b/i },
      { label: "sucralose",             regex: /\bsucralose\b/i },
      { label: "acesulfame potassium",  regex: /\bacesulfame[-\s]?potassium\b|\bacesulfame[-\s]?k\b|\bace[-\s]?k\b/i },
      { label: "saccharin",             regex: /\bsaccharin\b/i },
      { label: "neotame",               regex: /\bneotame\b/i },
      { label: "advantame",             regex: /\badvantame\b/i },
    ],
  },

  preservativesConcern: {
    buckets: ["food"],
    patterns: [
      { label: "sodium benzoate",    regex: /\bsodium\s+benzoate\b/i },
      { label: "potassium sorbate",  regex: /\bpotassium\s+sorbate\b/i },
      { label: "BHA",                regex: /\bBHA\b|\bbutylated\s+hydroxyanisole\b/i },
      { label: "BHT",                regex: /\bBHT\b|\bbutylated\s+hydroxytoluene\b/i },
      { label: "TBHQ",               regex: /\bTBHQ\b|\btert[-\s]?butylhydroquinone\b/i },
      { label: "sodium nitrite",     regex: /\bsodium\s+nitrite\b/i },
      { label: "sodium nitrate",     regex: /\bsodium\s+nitrate\b/i },
      { label: "propyl gallate",     regex: /\bpropyl\s+gallate\b/i },
    ],
  },

  hfcs: {
    buckets: ["food"],
    patterns: [
      { label: "high fructose corn syrup", regex: /\bhigh[-\s]?fructose\s+corn\s+syrup\b/i },
      { label: "HFCS",                     regex: /\bHFCS\b/i },
      { label: "fructose syrup",           regex: /\bfructose\s+syrup\b/i },
    ],
  },

  hydrogenatedOils: {
    buckets: ["food"],
    patterns: [
      { label: "partially hydrogenated",   regex: /\bpartially\s+hydrogenated\b/i },
      { label: "fully hydrogenated",       regex: /\bfully\s+hydrogenated\b/i },
      { label: "hydrogenated vegetable oil", regex: /\bhydrogenated\s+(?:\w+\s+)?oil\b/i },
    ],
  },

  seedOilsRefined: {
    buckets: ["food"],
    patterns: [
      { label: "soybean oil",    regex: /\bsoybean\s+oil\b/i },
      { label: "canola oil",     regex: /\bcanola\s+oil\b/i },
      { label: "corn oil",       regex: /\bcorn\s+oil\b/i },
      { label: "cottonseed oil", regex: /\bcottonseed\s+oil\b/i },
      { label: "sunflower oil",  regex: /\bsunflower\s+oil\b/i },
      { label: "safflower oil",  regex: /\bsafflower\s+oil\b/i },
    ],
  },

  nova4Markers: {
    buckets: ["food"],
    patterns: [
      { label: "maltodextrin",           regex: /\bmaltodextrin\b/i },
      { label: "soy protein isolate",    regex: /\bsoy\s+protein\s+isolate\b/i },
      { label: "modified food starch",   regex: /\bmodified\s+(?:food\s+|corn\s+|tapioca\s+|potato\s+|rice\s+)?starch\b/i },
      { label: "hydrolyzed protein",     regex: /\bhydrolyzed\s+(?:\w+\s+)?protein\b/i },
      { label: "monoglycerides",         regex: /\bmonoglycerides?\b/i },
      { label: "diglycerides",           regex: /\bdiglycerides?\b/i },
      { label: "mono and diglycerides",  regex: /\bmono[-\s]*(?:and|&)[-\s]*diglycerides?\b/i },
      { label: "carrageenan",            regex: /\bcarrageenan\b/i },
    ],
  },

  gums: {
    buckets: ["food"],
    patterns: [
      { label: "carrageenan",     regex: /\bcarrageenan\b/i },
      { label: "xanthan gum",     regex: /\bxanthan\s+gum\b/i },
      { label: "guar gum",        regex: /\bguar\s+gum\b/i },
      { label: "locust bean gum", regex: /\blocust\s+bean\s+gum\b/i },
    ],
  },

  msg: {
    buckets: ["food"],
    patterns: [
      { label: "monosodium glutamate",    regex: /\bmonosodium\s+glutamate\b/i },
      { label: "MSG",                     regex: /\bMSG\b/i },
      { label: "autolyzed yeast extract", regex: /\bautolyzed\s+yeast(?:\s+extract)?\b/i },
      { label: "hydrolyzed yeast",        regex: /\bhydrolyzed\s+yeast\b/i },
      { label: "yeast extract",           regex: /\byeast\s+extract\b/i },
    ],
  },

  // ============ PERSONAL CARE ============
  // Fragrance applies to personal care AND home cleaning per spec.
  syntheticFragrance: {
    buckets: ["personal_care", "home"],
    patterns: [
      { label: "fragrance",                   regex: /\bfragrances?\b/i, fragranceCheck: true },
      { label: "parfum",                      regex: /\bparfum\b/i,       fragranceCheck: true },
      { label: "perfume",                     regex: /\bperfume\b/i,      fragranceCheck: true },
      { label: "limonene",                    regex: /\blimonene\b/i },
      { label: "linalool",                    regex: /\blinalool\b/i },
      { label: "citral",                      regex: /\bcitral\b/i },
      { label: "geraniol",                    regex: /\bgeraniol\b/i },
      { label: "citronellol",                 regex: /\bcitronellol\b/i },
      { label: "eugenol",                     regex: /\beugenol\b/i },
      { label: "coumarin",                    regex: /\bcoumarin\b/i },
      { label: "benzyl alcohol",              regex: /\bbenzyl\s+alcohol\b/i },
      { label: "hexyl cinnamal",              regex: /\bhexyl\s+cinnamal\b/i },
      { label: "butylphenyl methylpropional", regex: /\bbutylphenyl\s+methylpropional\b/i },
    ],
  },

  parabens: {
    buckets: ["personal_care"],
    patterns: [
      { label: "methylparaben",   regex: /\bmethylparaben\b/i },
      { label: "ethylparaben",    regex: /\bethylparaben\b/i },
      { label: "propylparaben",   regex: /\bpropylparaben\b/i },
      { label: "butylparaben",    regex: /\bbutylparaben\b/i },
      { label: "isobutylparaben", regex: /\bisobutylparaben\b/i },
      { label: "isopropylparaben", regex: /\bisopropylparaben\b/i },
    ],
  },

  phthalates: {
    buckets: ["personal_care", "home"],
    patterns: [
      { label: "DBP",                regex: /\bDBP\b/i },
      { label: "DEP",                regex: /\bDEP\b/i },
      { label: "DEHP",               regex: /\bDEHP\b/i },
      { label: "BBP",                regex: /\bBBP\b/i },
      { label: "dibutyl phthalate",  regex: /\bdibutyl\s+phthalate\b/i },
      { label: "diethyl phthalate",  regex: /\bdiethyl\s+phthalate\b/i },
    ],
  },

  sulfates: {
    buckets: ["personal_care"],
    patterns: [
      { label: "sodium lauryl sulfate",   regex: /\bsodium\s+lauryl\s+sulfate\b/i },
      { label: "SLS",                     regex: /\bSLS\b/i },
      { label: "sodium laureth sulfate",  regex: /\bsodium\s+laureth\s+sulfate\b/i },
      { label: "SLES",                    regex: /\bSLES\b/i },
      { label: "ammonium lauryl sulfate", regex: /\bammonium\s+lauryl\s+sulfate\b/i },
      { label: "ALS",                     regex: /\bALS\b/i },
    ],
  },

  pegSurfactants: {
    buckets: ["personal_care"],
    patterns: [
      { label: "PEG",                 regex: /\bPEG(?:\/PPG)?[-\s]?\d+\b/i },
      { label: "polyethylene glycol", regex: /\bpolyethylene\s+glycol\b/i },
      { label: "ceteareth",           regex: /\bceteareth[-\s]?\d+\b/i },
      { label: "laureth",             regex: /\blaureth[-\s]?\d+\b/i },
      { label: "oleth",               regex: /\boleth[-\s]?\d+\b/i },
      { label: "steareth",            regex: /\bsteareth[-\s]?\d+\b/i },
    ],
  },

  siloxanes: {
    buckets: ["personal_care"],
    patterns: [
      { label: "dimethicone",        regex: /\bdimethicone\b/i },
      { label: "cyclopentasiloxane", regex: /\bcyclopentasiloxane\b/i },
      { label: "cyclomethicone",     regex: /\bcyclomethicone\b/i },
      { label: "cyclohexasiloxane",  regex: /\bcyclohexasiloxane\b/i },
      { label: "cyclotetrasiloxane", regex: /\bcyclotetrasiloxane\b/i },
      { label: "D4",                 regex: /\bD4\b/ },
      { label: "D5",                 regex: /\bD5\b/ },
      { label: "D6",                 regex: /\bD6\b/ },
    ],
  },

  chemicalUVFilters: {
    buckets: ["personal_care"],
    patterns: [
      { label: "oxybenzone",  regex: /\boxybenzone\b/i },
      { label: "octinoxate",  regex: /\boctinoxate\b/i },
      { label: "octisalate",  regex: /\boctisalate\b/i },
      { label: "homosalate",  regex: /\bhomosalate\b/i },
      { label: "avobenzone",  regex: /\bavobenzone\b/i },
      { label: "octocrylene", regex: /\boctocrylene\b/i },
    ],
  },

  formaldehydeReleasers: {
    buckets: ["personal_care"],
    patterns: [
      { label: "DMDM hydantoin",      regex: /\bDMDM\s+hydantoin\b/i },
      { label: "diazolidinyl urea",   regex: /\bdiazolidinyl\s+urea\b/i },
      { label: "imidazolidinyl urea", regex: /\bimidazolidinyl\s+urea\b/i },
      { label: "quaternium-15",       regex: /\bquaternium[-\s]?15\b/i },
      { label: "bronopol",            regex: /\bbronopol\b/i },
    ],
  },

  ethanolamines: {
    buckets: ["personal_care"],
    patterns: [
      { label: "triethanolamine", regex: /\btriethanolamine\b/i },
      // TEA/DEA/MEA are uppercase-only to avoid "green tea" / name false positives.
      { label: "TEA",             regex: /\bTEA\b/ },
      { label: "diethanolamine",  regex: /\bdiethanolamine\b/i },
      { label: "DEA",             regex: /\bDEA\b/ },
      { label: "monoethanolamine", regex: /\bmonoethanolamine\b/i },
      { label: "MEA",             regex: /\bMEA\b/ },
    ],
  },

  talc: {
    buckets: ["personal_care"],
    patterns: [
      { label: "talc",               regex: /\btalc\b/i },
      { label: "magnesium silicate", regex: /\bmagnesium\s+silicate\b/i },
    ],
  },

  mineralOil: {
    buckets: ["personal_care"],
    patterns: [
      { label: "mineral oil",         regex: /\bmineral\s+oil\b/i },
      { label: "paraffinum liquidum", regex: /\bparaffinum\s+liquidum\b/i },
      { label: "petrolatum",          regex: /\bpetrolatum\b/i },
      { label: "petroleum jelly",     regex: /\bpetroleum\s+jelly\b/i },
    ],
  },

  phenoxyethanol: {
    buckets: ["personal_care"],
    patterns: [
      { label: "phenoxyethanol", regex: /\bphenoxyethanol\b/i },
    ],
  },

  // ============ HOME AND CLEANING ============
  voc: {
    buckets: ["home"],
    patterns: [
      { label: "ammonia",            regex: /\bammonia\b/i },
      { label: "bleach",             regex: /\bbleach\b/i },
      { label: "sodium hypochlorite", regex: /\bsodium\s+hypochlorite\b/i },
      { label: "chlorine",           regex: /\bchlorine\b/i },
    ],
  },

  quats: {
    buckets: ["home"],
    patterns: [
      { label: "benzalkonium chloride",    regex: /\bbenzalkonium\s+chloride\b/i },
      { label: "didecyldimonium chloride", regex: /\bdidecyldimonium\s+chloride\b/i },
    ],
  },

  triclosan: {
    buckets: ["home", "personal_care"],
    patterns: [
      { label: "triclosan",    regex: /\btriclosan\b/i },
      { label: "triclocarban", regex: /\btriclocarban\b/i },
    ],
  },

  // PFAS spans food packaging, personal care (dental floss, fluorinated
  // cosmetics), and home goods (paper products with grease barrier
  // chemistry). Cookware ingredient lists hit this via the unset bucket
  // path in detectFlags since "kitchen" / "cookware" map to null bucket
  // and exercise every group. The "perfluoro" and "polyfluoro" patterns
  // use a leading-only word boundary so variants like perfluorooctanoic
  // acid and polyfluoroalkyl substances both match, while the leading
  // boundary still blocks accidental matches inside unrelated words.
  pfas: {
    buckets: ["food", "personal_care", "home"],
    patterns: [
      { label: "PTFE",                    regex: /\bptfe\b/i },
      { label: "polytetrafluoroethylene", regex: /\bpolytetrafluoroethylene\b/i },
      { label: "Teflon",                  regex: /\bteflon\b/i },
      { label: "PFOA",                    regex: /\bpfoa\b/i },
      { label: "PFOS",                    regex: /\bpfos\b/i },
      { label: "PFHxS",                   regex: /\bpfhxs\b/i },
      { label: "PFNA",                    regex: /\bpfna\b/i },
      { label: "perfluoro compound",      regex: /\bperfluoro/i },
      { label: "polyfluoro compound",     regex: /\bpolyfluoro/i },
      { label: "fluoropolymer",           regex: /\bfluoropolymer\b/i },
    ],
  },
};

// ── Negation handling ───────────────────────────────────────────
// Local window-based negation check. We look ~30 chars before and ~20 after
// the match. If a negation phrase brackets the match, the match is dropped.
//
// Examples handled:
//   "Red 40-free"         -> negated (after: "-free")
//   "no Red 40"           -> negated (before: "no ")
//   "without parabens"    -> negated
//   "free of fragrance"   -> negated
//   "does not contain X"  -> negated
//
// Not handled (by design — out of scope for local negation):
//   "does not contain Red 40 or Yellow 5" negates both (only Red 40 here).
//   For global claims like that, the caller should use a higher-level check.
const NEGATION_BEFORE = /\b(?:no|without|free\s+of|free\s+from|not\s+contain(?:s|ing)?|does\s+not\s+contain|zero|contains\s+no)\s*$/i;
const NEGATION_AFTER  = /^\s*[-–—\s]*free\b/i;
// For fragrance only, "natural" or "essential oil derived" also negates.
const FRAGRANCE_SOFT_NEGATION = /\b(?:natural|essential\s+oil\s+derived)\s*$/i;

function isMatchNegated(text, matchIndex, matchLength, isFragrance) {
  const before = text.substring(Math.max(0, matchIndex - 30), matchIndex);
  const after  = text.substring(matchIndex + matchLength, Math.min(text.length, matchIndex + matchLength + 20));

  if (NEGATION_BEFORE.test(before)) return true;
  if (NEGATION_AFTER.test(after)) return true;
  if (isFragrance && FRAGRANCE_SOFT_NEGATION.test(before)) return true;

  return false;
}

// ── Public: detectFlags ─────────────────────────────────────────
function detectFlags(ingredientText, category) {
  if (!ingredientText || typeof ingredientText !== "string") {
    return { flags: {}, summary: [], concernCount: 0 };
  }

  const bucket = bucketForCategory(category);
  const flags = {};
  const summary = [];
  const seen = new Set();

  for (const [flagName, def] of Object.entries(FLAG_DEFS)) {
    if (bucket && !def.buckets.includes(bucket)) continue;

    const matches = [];
    for (const pat of def.patterns) {
      // Rebuild regex with /g so exec() can iterate.
      const flags = pat.regex.flags.includes("g") ? pat.regex.flags : pat.regex.flags + "g";
      const re = new RegExp(pat.regex.source, flags);
      let m;
      while ((m = re.exec(ingredientText)) !== null) {
        if (isMatchNegated(ingredientText, m.index, m[0].length, !!pat.fragranceCheck)) {
          if (m.index === re.lastIndex) re.lastIndex++;
          continue;
        }
        if (!matches.includes(pat.label)) matches.push(pat.label);
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    }

    flags[flagName] = { present: matches.length > 0, matches };
    for (const label of matches) {
      if (!seen.has(label)) {
        summary.push(label);
        seen.add(label);
      }
    }
  }

  return { flags, summary, concernCount: summary.length };
}

// ── Public: validateAIResponse ──────────────────────────────────
function validateAIResponse(aiSubstances, deterministicFlags) {
  const aiList = Array.isArray(aiSubstances) ? aiSubstances : [];
  const detSummary = deterministicFlags?.summary || [];

  const missingFromAI = [];
  for (const det of detSummary) {
    if (!aiMentionsSubstance(aiList, det)) missingFromAI.push(det);
  }

  const extraInAI = [];
  for (const ai of aiList) {
    if (!deterministicContainsSubstance(deterministicFlags, ai)) {
      extraInAI.push(ai);
    }
  }

  return {
    consistent: missingFromAI.length === 0 && extraInAI.length === 0,
    missingFromAI,
    extraInAI,
  };
}

// ── Public: mergeFlags ──────────────────────────────────────────
// Deterministic findings always win. AI claims that contradict a deterministic
// "absent" finding are dropped. AI claims the deterministic layer did not
// evaluate (unknown flag) are kept.
function mergeFlags(aiSubstances, deterministicFlags) {
  const aiList = Array.isArray(aiSubstances) ? aiSubstances : [];
  const out = [];
  const seen = new Set();

  for (const det of deterministicFlags?.summary || []) {
    const key = normalize(det);
    if (!seen.has(key)) {
      out.push(det);
      seen.add(key);
    }
  }

  for (const ai of aiList) {
    const key = normalize(ai);
    if (seen.has(key)) continue;
    if (deterministicContainsSubstance(deterministicFlags, ai)) continue;
    if (aiContradictsDeterministic(ai, deterministicFlags)) continue;
    out.push(ai);
    seen.add(key);
  }

  return out;
}

// ── Internal helpers ────────────────────────────────────────────
function normalize(s) {
  return String(s || "").toLowerCase().trim().replace(/\s+/g, " ");
}

function aiMentionsSubstance(aiList, substance) {
  const target = normalize(substance);
  if (!target) return false;
  for (const ai of aiList) {
    const a = normalize(ai);
    if (!a) continue;
    if (a === target) return true;
    if (a.includes(target) || target.includes(a)) return true;
  }
  return false;
}

function deterministicContainsSubstance(detFlags, substance) {
  const target = normalize(substance);
  if (!target) return false;
  for (const det of detFlags?.summary || []) {
    const d = normalize(det);
    if (!d) continue;
    if (d === target) return true;
    if (d.includes(target) || target.includes(d)) return true;
  }
  return false;
}

// AI contradicts deterministic when its claim matches a specific pattern in a
// bucket the deterministic layer actively evaluated, but that pattern's label
// is not in the bucket's matches array. Bucket-level presence is not enough —
// a siloxanes bucket marked present because dimethicone matched must still
// drop an AI claim for cyclopentasiloxane if D5 is not in the real ingredient
// list. Flags not evaluated (category bucket mismatch) don't contradict.
function aiContradictsDeterministic(aiSubstance, detFlags) {
  if (!detFlags || !detFlags.flags) return false;
  let contradicted = false;
  for (const [flagName, def] of Object.entries(FLAG_DEFS)) {
    const f = detFlags.flags[flagName];
    if (!f) continue;
    const detMatches = Array.isArray(f.matches) ? f.matches : [];
    for (const pat of def.patterns) {
      if (!pat.regex.test(aiSubstance)) continue;
      if (detMatches.includes(pat.label)) return false;
      contradicted = true;
    }
  }
  return contradicted;
}

module.exports = {
  detectFlags,
  validateAIResponse,
  mergeFlags,
  FLAG_DEFS,
};
