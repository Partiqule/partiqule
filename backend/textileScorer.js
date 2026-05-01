// backend/textileScorer.js
//
// Deterministic scoring for textile products. Takes a parsed
// composition (array of fiber-percentage pairs) and certifications,
// returns a score with explanation.
//
// Built to bypass Pass 1 / Pass 2 / cascade entirely. When vision
// reads a care label, this function produces the score directly.
// Same input always produces same output.
//
// Scoring philosophy: three vectors, weighted skin-exposure first,
// shedding second, manufacturing third. See scoring methodology
// page on partiqule.com for full reasoning.

const FIBER_TABLE = {
  // Cotton family
  cotton_organic_gots:    { base: 2, shed: 0, mfg: 1, skin: 1, synthetic: false, label: "GOTS organic cotton" },
  cotton_organic:         { base: 3, shed: 0, mfg: 2, skin: 2, synthetic: false, label: "Organic cotton" },
  cotton_conventional:    { base: 4, shed: 0, mfg: 5, skin: 3, synthetic: false, label: "Conventional cotton" },
  cotton_recycled:        { base: 3, shed: 0, mfg: 2, skin: 2, synthetic: false, label: "Recycled cotton" },

  // Polyester family
  polyester_virgin:       { base: 7, shed: 8, mfg: 5, skin: 6, synthetic: true,  label: "Polyester" },
  polyester_recycled:     { base: 6, shed: 8, mfg: 3, skin: 6, synthetic: true,  label: "Recycled polyester" },

  // Other synthetics
  acrylic:                { base: 8, shed: 9, mfg: 6, skin: 5, synthetic: true,  label: "Acrylic" },
  nylon_virgin:           { base: 6, shed: 6, mfg: 5, skin: 5, synthetic: true,  label: "Nylon" },
  nylon_recycled:         { base: 5, shed: 6, mfg: 3, skin: 5, synthetic: true,  label: "Recycled nylon" },
  elastane:               { base: 6, shed: 5, mfg: 5, skin: 5, synthetic: true,  label: "Elastane" },

  // Wool family
  wool_untreated:         { base: 2, shed: 0, mfg: 3, skin: 2, synthetic: false, label: "Wool" },
  wool_merino:            { base: 2, shed: 0, mfg: 3, skin: 2, synthetic: false, label: "Merino wool" },
  wool_superwash:         { base: 4, shed: 0, mfg: 4, skin: 4, synthetic: false, label: "Superwash wool" },

  // Bast fibers
  linen:                  { base: 2, shed: 0, mfg: 2, skin: 2, synthetic: false, label: "Linen" },
  hemp:                   { base: 2, shed: 0, mfg: 1, skin: 2, synthetic: false, label: "Hemp" },

  // Specialty animal
  silk:                   { base: 4, shed: 0, mfg: 5, skin: 3, synthetic: false, label: "Silk" },
  cashmere:               { base: 3, shed: 0, mfg: 5, skin: 2, synthetic: false, label: "Cashmere" },
  down:                   { base: 4, shed: 0, mfg: 5, skin: 2, synthetic: false, label: "Down" },

  // Cellulosic
  tencel_lyocell:         { base: 3, shed: 1, mfg: 2, skin: 3, synthetic: false, label: "Tencel/Lyocell" },
  modal:                  { base: 4, shed: 1, mfg: 4, skin: 3, synthetic: false, label: "Modal" },
  viscose_rayon:          { base: 5, shed: 1, mfg: 6, skin: 4, synthetic: false, label: "Viscose/Rayon" },
  bamboo_viscose:         { base: 5, shed: 1, mfg: 6, skin: 4, synthetic: false, label: "Bamboo viscose" },

  // Leather
  leather_chrome:         { base: 6, shed: 0, mfg: 7, skin: 4, synthetic: false, label: "Chrome-tanned leather" },
  leather_vegetable:      { base: 4, shed: 0, mfg: 4, skin: 3, synthetic: false, label: "Veg-tanned leather" },
  leather_synthetic_pu:   { base: 7, shed: 4, mfg: 6, skin: 6, synthetic: true,  label: "PU synthetic leather" },
  leather_synthetic_pvc:  { base: 8, shed: 4, mfg: 8, skin: 7, synthetic: true,  label: "PVC synthetic leather" },
};

// Maps loose fiber strings from labels to canonical keys above.
const FIBER_ALIASES = {
  "polyester":          "polyester_virgin",
  "recycled polyester": "polyester_recycled",
  "rpet":               "polyester_recycled",
  "acrylic":            "acrylic",
  "modacrylic":         "acrylic",
  "nylon":              "nylon_virgin",
  "polyamide":          "nylon_virgin",
  "polyamid":           "nylon_virgin",
  "recycled nylon":     "nylon_recycled",
  "econyl":             "nylon_recycled",
  "elastane":           "elastane",
  "spandex":            "elastane",
  "lycra":              "elastane",
  "elastan":            "elastane",
  "cotton":             "cotton_conventional",
  "organic cotton":     "cotton_organic",
  "recycled cotton":    "cotton_recycled",
  "wool":               "wool_untreated",
  "merino":             "wool_merino",
  "merino wool":        "wool_merino",
  "superwash wool":     "wool_superwash",
  "linen":              "linen",
  "flax":               "linen",
  "hemp":               "hemp",
  "silk":               "silk",
  "cashmere":           "cashmere",
  "down":               "down",
  "feather":            "down",
  "tencel":             "tencel_lyocell",
  "lyocell":            "tencel_lyocell",
  "modal":              "modal",
  "viscose":            "viscose_rayon",
  "rayon":              "viscose_rayon",
  "bamboo":             "bamboo_viscose",
  "leather":            "leather_chrome",
  "genuine leather":    "leather_chrome",
  "vegan leather":      "leather_synthetic_pu",
  "pu leather":         "leather_synthetic_pu",
  "pvc":                "leather_synthetic_pvc",
};

const CERTIFICATIONS = {
  gots:             { cotton_shift: -2, default_shift: -1, label: "GOTS certified" },
  oeko_tex_100:     { default_shift: -1, label: "OEKO-TEX Standard 100" },
  bluesign:         { default_shift: -1, label: "Bluesign certified" },
  cradle_to_cradle: { default_shift: -2, label: "Cradle to Cradle" },
};

// Parse a label_ingredients array into fiber-percentage pairs.
// Handles "Shell: 100% Polyester", "93% POLYESTER", "60% cotton 40% polyester"
// in a single string, etc. Returns [{key, pct, label, raw}].
function parseComposition(labelArray) {
  const out = [];
  const all = (labelArray || []).join(" ").toLowerCase();
  const re = /(\d+(?:\.\d+)?)\s*%\s*([a-z][a-z\s\/]*?)(?=\s*\d+\s*%|\s*[,;.\)]|$)/g;
  let match;
  while ((match = re.exec(all)) !== null) {
    const pct = parseFloat(match[1]);
    const rawFiber = match[2].trim();
    const key = resolveFiberKey(rawFiber);
    if (key) {
      out.push({ key, pct, label: FIBER_TABLE[key].label, raw: rawFiber });
    }
  }
  return out;
}

function resolveFiberKey(rawFiber) {
  const normalized = rawFiber.toLowerCase().trim();
  if (FIBER_ALIASES[normalized]) return FIBER_ALIASES[normalized];
  // Substring match for cases like "100 mesh polyester"
  // Sort aliases by length descending so longer matches win
  // (e.g. "organic cotton" beats "cotton")
  const sortedAliases = Object.keys(FIBER_ALIASES).sort((a, b) => b.length - a.length);
  for (const alias of sortedAliases) {
    if (normalized.includes(alias)) return FIBER_ALIASES[alias];
  }
  return null;
}

// Detect sleepwear from product name keywords. Used to apply the
// elastane floor in kid mode for sleepwear products.
function isSleepwearFromName(productName) {
  const n = String(productName || "").toLowerCase();
  return /\b(pajama|pyjama|pjs|sleeper|nightgown|footed|nightie|sleep set|sleepsuit)\b/.test(n);
}

// Score a parsed composition. Returns a structured result with
// rounded score, precise score, breakdown, and partial-read flag.
function scoreComposition(parsed, options = {}) {
  const {
    certifications = [],
    kidMode = false,
    contactLevel = "medium",
    isSleepwear = false,
  } = options;

  if (parsed.length === 0) {
    return { score: null, error: "no_composition_parsed" };
  }

  // Upgrade cert-shifted fiber variants. When a relevant cert
  // is present, swap the parsed fiber key to its cert-shifted
  // variant so both the score and the explanation use the
  // correct base entry. This avoids contradictory text like
  // "without GOTS certification..." followed by "With GOTS
  // certification..."
  const hasGots = certifications.some(c => c === "gots");
  if (hasGots) {
    for (const f of parsed) {
      if (f.key === "cotton_organic" && FIBER_TABLE.cotton_organic_gots) {
        f.key = "cotton_organic_gots";
        f.label = FIBER_TABLE.cotton_organic_gots.label;
      }
    }
  }

  const totalPct = parsed.reduce((sum, f) => sum + f.pct, 0);
  const partialRead = totalPct < 95;

  let weightedScore = 0;
  let syntheticPct = 0;
  let worstSingleScore = 0;
  for (const fiber of parsed) {
    const entry = FIBER_TABLE[fiber.key];
    weightedScore += (fiber.pct / 100) * entry.base;
    if (entry.synthetic) syntheticPct += fiber.pct;
    if (entry.base > worstSingleScore) worstSingleScore = entry.base;
  }

  // Normalize weighted score if composition is partial. If we read
  // only 80% of the label, we extrapolate the score we have over
  // the full 100% to avoid undershooting on partial reads.
  if (partialRead && totalPct > 0) {
    weightedScore = weightedScore * (100 / totalPct);
  }

  // Blend bump: significant synthetic content adds risk beyond linear
  // Blend bump: additive risk from combining synthetic fibers
  // with other fibers. Only fires on actual blends (more than
  // one fiber). Pure single-fiber compositions are scored by
  // their base score directly.
  let blendBump = 0;
  if (parsed.length > 1 && syntheticPct > 30) {
    blendBump = syntheticPct < 60 ? 1 : 0.5;
  }

  let score = weightedScore + blendBump;
  // Cap: a blend can score 1 point above its worst single fiber
  // (compounding risk from synthetics) but not more, preventing
  // absurd cases like 60/40 cotton-poly scoring above 8.
  const blendCap = worstSingleScore + 1;
  if (score > blendCap) score = blendCap;

  // Certification shifts
  let certShift = 0;
  const appliedCerts = [];
  for (const cert of certifications) {
    const c = CERTIFICATIONS[cert];
    if (!c) continue;
    appliedCerts.push(c.label);
    if (cert === "gots" && parsed.some(f => f.key.startsWith("cotton_"))) {
      certShift += c.cotton_shift;
    } else {
      certShift += c.default_shift;
    }
  }
  score += certShift;

  // Kid mode adjustments
  let kidBump = 0;
  if (kidMode) {
    for (const fiber of parsed) {
      const entry = FIBER_TABLE[fiber.key];
      const fiberWeight = fiber.pct / 100;
      if (entry.synthetic) {
        if (contactLevel === "high") kidBump += 2 * fiberWeight;
        else if (contactLevel === "medium") kidBump += 1 * fiberWeight;
      } else if (fiber.key === "cotton_conventional") {
        kidBump += 1 * fiberWeight;
      } else if (fiber.key === "viscose_rayon" || fiber.key === "bamboo_viscose") {
        kidBump += 1 * fiberWeight;
      } else if (fiber.key === "wool_superwash") {
        kidBump += 1 * fiberWeight;
      }
    }
    score += kidBump;
  }

  // Sleepwear elastane floor
  let sleepwearFloorApplied = false;
  if (kidMode && isSleepwear) {
    const hasStretch = parsed.some(f => f.key === "elastane");
    if (hasStretch && score < 6) {
      score = 6;
      sleepwearFloorApplied = true;
    }
  }

  const preciseScore = score;
  const roundedScore = Math.max(1, Math.min(10, Math.round(score)));

  return {
    score: roundedScore,
    precise_score: Math.round(preciseScore * 100) / 100,
    explanation: buildExplanation(parsed, appliedCerts, partialRead, {
      kidMode,
      isSleepwear,
      contactLevel,
    }),
    fibers: parsed,
    certifications: appliedCerts,
    breakdown: {
      weighted_base: Math.round(weightedScore * 100) / 100,
      blend_bump: blendBump,
      cert_shift: certShift,
      kid_bump: Math.round(kidBump * 100) / 100,
      synthetic_pct: syntheticPct,
      total_pct_read: totalPct,
    },
    partial_read: partialRead,
    blend_bump_applied: blendBump > 0,
    kid_bump_applied: kidBump > 0,
    sleepwear_floor_applied: sleepwearFloorApplied,
  };
}

// Fiber-specific voice grounded in the three vectors (skin
// exposure, microfiber shedding, manufacturing impact). Used
// by buildExplanation. Each entry is the dominant-fiber
// sentence — composed with blend context, kid context, and
// certification context as needed.
const FIBER_EXPLANATIONS = {
  cotton_organic_gots: "GOTS-certified organic cotton is about as clean as fabric gets. No pesticides in the field, no toxic dyes in the mill, no synthetic finishes.",
  cotton_organic: "Organic cotton skips the pesticide load of conventional, but without GOTS certification the dyes and finishes are still unverified.",
  cotton_conventional: "Conventional cotton means pesticide residue and unknown dye chemistry. Not the worst, but not what you'd choose if you had the option.",
  cotton_recycled: "Recycled cotton skips the water and pesticide load of growing new fiber. Solid choice.",
  polyester_virgin: "Polyester sheds microplastic fibers every wash, and moisture-wicking finishes often involve PFAS chemistry that absorbs through skin.",
  polyester_recycled: "Recycled polyester reduces the petroleum footprint, but the microplastic shedding is the same as virgin polyester.",
  acrylic: "Acrylic sheds more microplastic fibers than any other synthetic, and there's no real performance reason to wear it. Wool or cotton would do the same job.",
  nylon_virgin: "Nylon is more durable than polyester and sheds less, but it's still plastic against your skin and the chemical finishes are usually undisclosed.",
  nylon_recycled: "Recycled nylon cuts the petroleum impact. Same shedding profile as virgin nylon, which is to say less than polyester but still real.",
  elastane: "Elastane is what gives stretch fabric its stretch. It's plastic, it sheds, and it's almost always blended with other synthetics.",
  wool_untreated: "Untreated wool is naturally flame-resistant, biodegradable, and one of the cleanest fibers you can wear.",
  wool_merino: "Merino wool is fine enough to feel soft, breathable, and naturally moisture-wicking without any chemical finish.",
  wool_superwash: "Superwash wool is treated with a polymer coating to prevent shrinking. That coating sheds microplastics, which defeats the point of choosing wool.",
  linen: "Linen is one of the lowest-impact fabrics there is. Grows with little water, biodegrades cleanly, lasts decades.",
  hemp: "Hemp grows without pesticides, uses less water than cotton, and the fiber is naturally durable. About as clean as it gets.",
  silk: "Conventional silk processing uses heavy chemicals to extract the fiber, but the fiber itself is biodegradable and skin-safe.",
  cashmere: "Cashmere is naturally soft and biodegradable. The processing is chemical-heavy, but the end fiber sits well against skin.",
  down: "Down insulation is biodegradable and effective. Worth knowing the source — look for RDS-certified to confirm ethical sourcing.",
  tencel_lyocell: "Tencel and Lyocell are made from wood pulp in a closed-loop process that recycles its own solvents. Among the cleanest cellulosic fabrics.",
  modal: "Modal is wood-pulp-derived like Tencel, but the processing uses more chemicals. Better than viscose, not as clean as Lyocell.",
  viscose_rayon: "Viscose and rayon are made from wood pulp using carbon disulfide, which is a known neurotoxin in the manufacturing process. The finished fabric is fine on skin, but the upstream impact is real.",
  bamboo_viscose: "Bamboo viscose is processed exactly like regular viscose. The plant source doesn't change the chemistry — same carbon disulfide processing.",
  leather_chrome: "Chrome-tanned leather is fast and cheap to produce, but the tanning process uses chromium salts that contaminate water and worker exposure is a known issue.",
  leather_vegetable: "Vegetable-tanned leather uses tree bark and plant tannins instead of chromium. Slower, cleaner, and the leather develops a richer patina.",
  leather_synthetic_pu: "PU synthetic leather is plastic. It sheds microplastics and the manufacturing involves solvents.",
  leather_synthetic_pvc: "PVC synthetic leather contains plasticizers, often phthalates, which are endocrine disruptors that absorb through skin.",
};

const CERT_EXPLANATIONS = {
  gots: "With GOTS certification, the dyes, finishes, and processing all meet third-party standards.",
  oeko_tex_100: "OEKO-TEX certification means the finished fabric has been tested for harmful chemicals.",
  bluesign: "Bluesign certification covers the manufacturing process for chemical management.",
  cradle_to_cradle: "Cradle to Cradle certification covers material health, recyclability, and manufacturing impact end-to-end.",
};

function buildExplanation(parsed, certs, partialRead, options = {}) {
  const { kidMode = false, isSleepwear = false, contactLevel = "medium" } = options;

  if (!parsed || parsed.length === 0) {
    return "Composition unreadable. Scan the care tag for a verified score.";
  }

  // Sort by percentage descending, take dominant fiber
  const sorted = [...parsed].sort((a, b) => b.pct - a.pct);
  const dominant = sorted[0];
  const dominantEntry = FIBER_TABLE[dominant.key];

  // Start with the dominant fiber's explanation
  let sentences = [];
  const dominantText = FIBER_EXPLANATIONS[dominant.key];
  if (dominantText) sentences.push(dominantText);

  // Blend context: if a meaningful second fiber exists (>15%) AND
  // it's a different risk profile (natural+synthetic mix), call it out.
  if (sorted.length > 1 && sorted[1].pct >= 15) {
    const second = sorted[1];
    const secondEntry = FIBER_TABLE[second.key];
    if (secondEntry && dominantEntry) {
      // Mixed natural/synthetic blend — call out the synthetic role
      if (!dominantEntry.synthetic && secondEntry.synthetic) {
        sentences.push(`The ${second.pct}% ${secondEntry.label.toLowerCase()} is where the score comes from — those synthetic fibers shed and add chemical exposure that the ${dominantEntry.label.toLowerCase()} doesn't.`);
      } else if (dominantEntry.synthetic && !secondEntry.synthetic) {
        // Dominant is synthetic, secondary is natural — note the natural fiber but main risk is synthetic
        sentences.push(`The ${second.pct}% ${secondEntry.label.toLowerCase()} helps a little, but the synthetic majority is what drives the score.`);
      }
    }
  }

  // Kid mode addendum — synthetic-dominant garments get the
  // cumulative-exposure framing.
  if (kidMode && dominantEntry?.synthetic) {
    if (isSleepwear) {
      sentences.push("For a kid in sleepwear especially — 10 hours of skin contact per night — this matters more.");
    } else if (contactLevel === "high") {
      sentences.push("For a kid with skin-contact wear, more hours against developing skin means more cumulative exposure. The score reflects that.");
    } else {
      sentences.push("For a kid, more skin contact for longer means more cumulative exposure. The score reflects that.");
    }
  }

  // Sleepwear elastane floor — fires whenever a kid sleepwear
  // garment contains elastane, regardless of dominant fiber.
  // Explains the score floor mechanic so the user understands
  // why even a cotton-dominant garment scored at 6.
  if (kidMode && isSleepwear && parsed.some(f => f.key === "elastane")) {
    sentences.push("Stretch fabrics in pajamas usually require chemical flame retardants to meet flammability rules, which floors the score at 6.");
  }

  // Certification addendum (light touch — only mention if cert meaningfully shifts the conversation)
  if (certs && certs.length > 0) {
    // Match cert labels back to keys (CERT_EXPLANATIONS uses keys, certs array contains labels)
    for (const certLabel of certs) {
      for (const [key, info] of Object.entries(CERTIFICATIONS)) {
        if (info.label === certLabel && CERT_EXPLANATIONS[key]) {
          sentences.push(CERT_EXPLANATIONS[key]);
          break;
        }
      }
    }
  }

  // Partial read note
  if (partialRead) {
    sentences.push("Note: only part of the label was readable, so the score is based on what we could see.");
  }

  return sentences.join(" ");
}

// Test cases. Run with: node backend/textileScorer.js
function _runTests() {
  const cases = [
    { name: "Nike Dri-FIT 93/7 poly/elastane",
      input: ["93% Polyester", "7% Elastane"],
      expected: 7 },
    { name: "Acrylic sweater",
      input: ["100% Acrylic"],
      expected: 8 },
    { name: "Patagonia Capilene recycled poly + bluesign",
      input: ["100% Recycled Polyester"],
      certs: ["bluesign"],
      expected: 5 },
    { name: "Organic cotton GOTS pajamas",
      input: ["100% Organic Cotton"],
      certs: ["gots"],
      expected: 1 },
    { name: "60/40 cotton-poly tee",
      input: ["60% Cotton", "40% Polyester"],
      expected: 6 },
    { name: "Lululemon Align nylon-spandex",
      input: ["79% Nylon", "21% Elastane"],
      expected: 7 },
    { name: "Shell + Lining poly (Nike kids 2pc)",
      input: ["Shell: 100% Polyester", "Lining: 100% Mesh Polyester"],
      expected: 7 },
    { name: "Kid pajamas with elastane (sleepwear floor)",
      input: ["95% Cotton", "5% Spandex"],
      kidMode: true, isSleepwear: true,
      expected: 6 },
    { name: "Partial read: only 80% of label seen",
      input: ["80% Cotton"],
      expected: 4 },
    { name: "100% Linen",
      input: ["100% Linen"],
      expected: 2 },
    { name: "Wool merino base layer",
      input: ["100% Merino Wool"],
      expected: 2 },
    { name: "Conventional cotton tee (no cert)",
      input: ["100% Cotton"],
      expected: 4 },
  ];

  let passed = 0;
  let failed = 0;
  for (const c of cases) {
    const parsed = parseComposition(c.input);
    const result = scoreComposition(parsed, {
      certifications: c.certs || [],
      kidMode: c.kidMode || false,
      isSleepwear: c.isSleepwear || false,
      contactLevel: "medium",
    });
    const pass = result.score === c.expected;
    if (pass) passed++; else failed++;
    const mark = pass ? "PASS" : "FAIL";
    console.log(`${mark} ${c.name}`);
    console.log(`     got=${result.score} expected=${c.expected} precise=${result.precise_score}`);
    console.log(`     parsed: ${parsed.map(f => `${f.pct}% ${f.label}`).join(", ") || "(none)"}`);
    if (result.partial_read) console.log(`     partial_read: true (total=${result.breakdown.total_pct_read}%)`);
  }
  console.log(`\n${passed}/${passed + failed} tests passed`);

  console.log("\n--- Sample explanations ---");
  const sampleCases = [
    { name: "100% Polyester adult", input: ["100% Polyester"] },
    { name: "95/5 cotton-spandex kid sleepwear", input: ["95% Cotton", "5% Spandex"], kidMode: true, isSleepwear: true },
    { name: "100% polyester kid sleepwear", input: ["100% Polyester"], kidMode: true, isSleepwear: true },
    { name: "100% GOTS organic cotton", input: ["100% Organic Cotton"], certs: ["gots"] },
    { name: "60/40 cotton-poly", input: ["60% Cotton", "40% Polyester"] },
    { name: "100% Acrylic", input: ["100% Acrylic"] },
  ];
  for (const c of sampleCases) {
    const parsed = parseComposition(c.input);
    const result = scoreComposition(parsed, {
      certifications: c.certs || [],
      kidMode: c.kidMode || false,
      isSleepwear: c.isSleepwear || false,
      contactLevel: "medium",
    });
    console.log(`\n${c.name} (score ${result.score}):`);
    console.log(`  ${result.explanation}`);
  }
}

if (require.main === module) {
  _runTests();
}

module.exports = {
  parseComposition,
  scoreComposition,
  resolveFiberKey,
  isSleepwearFromName,
  FIBER_TABLE,
  FIBER_ALIASES,
  CERTIFICATIONS,
};
