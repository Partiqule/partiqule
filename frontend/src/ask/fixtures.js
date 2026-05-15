// R5a Ask prototype — fake responses for the canonical example queries
// plus one "intent clear, nothing scores well" case so Sara can review
// that copy state too.
//
// The shape mirrors what R5b's real backend will return:
//   { query, intent_restatement, items: [{
//       id, product_name, score, kid_score, why, flags,
//       tier, tier_note, detailed_flags, nova, calibration_note,
//       kid_score_note, buy_links, image_url,
//     }, ...] }
//
// R5a r2 voice rule: the word "safe" is off-limits in user-facing copy.
// Endorsement language carries real liability. Score-anchored phrasing
// ("scored cleanest", "scores well", "low score", "cleaner") plus
// specific receipts is the substitute.
//
// R5a r2 density rule: default why copy targets ~80 characters. Full
// detail lives under the expanded scoring panel.

const FIXTURES = [
  {
    id: "sippy_cup",
    examples: ["sippy cup for my 18 month old"],
    matches: (q) => /\bsippy\b/.test(q) || /\btoddler\s+(cup|water)/.test(q) || /\b18\s+(month|mo)\b/.test(q),
    intent_restatement: "Sippy cups for an 18 month old. Here's what scored cleanest.",
    items: [
      {
        id: "sippy_1",
        product_name: "ezpz Tiny Cup",
        score: 2, kid_score: 2,
        why: "Pure platinum silicone. No plastic, no dyes, no spout to harbor mold.",
        flags: ["clean_materials"],
        tier: 1,
        tier_note: "Pure single-material build.",
        detailed_flags: [
          { label: "Material", kind: "good", detail: "Platinum silicone, food-grade." },
          { label: "Dyes", kind: "good", detail: "No synthetic colors." },
          { label: "Cleaning", kind: "good", detail: "One molded piece. Nothing to scrub around." },
        ],
        calibration_note: "EWG verified, family-tested platinum cure spec.",
        image_url: null,
        buy_links: {
          amazon: "https://www.amazon.com/dp/B07TINY1",
          brand: "https://ezpzfun.com/products/tiny-cup",
          target: "https://www.target.com/p/ezpz-tiny-cup/-/A-78912345",
        },
      },
      {
        id: "sippy_2",
        product_name: "Pura Kiki Stainless Steel Toddler Bottle",
        score: 2, kid_score: 2,
        why: "Medical-grade stainless steel with a silicone sleeve and silicone spout.",
        flags: ["clean_materials"],
        tier: 1,
        tier_note: "Stainless body with silicone parts.",
        detailed_flags: [
          { label: "Body", kind: "good", detail: "304 stainless steel, weld-free interior." },
          { label: "Spout", kind: "neutral", detail: "Silicone, replaceable as it wears." },
          { label: "Sleeve", kind: "good", detail: "Silicone, no PVC." },
        ],
        image_url: null,
        buy_links: {
          amazon: "https://www.amazon.com/dp/B0PURA01",
          brand: "https://purakiki.com/products/toddler-bottle",
        },
      },
      {
        id: "sippy_3",
        product_name: "Munchkin Miracle 360 Trainer Cup",
        score: 5, kid_score: 6,
        why: "BPA-free polypropylene with a silicone valve. Plastic ages faster than steel.",
        flags: ["plastic_body"],
        tier: 3,
        tier_note: "BPA-free plastic, mainstream build.",
        detailed_flags: [
          { label: "Material", kind: "neutral", detail: "Polypropylene, BPA-free." },
          { label: "Valve", kind: "concern", detail: "Tight 360 valve traps moisture, harder to fully dry." },
          { label: "Heat", kind: "concern", detail: "Plastic ages faster with warm liquids and frequent dishwashing." },
        ],
        kid_score_note: "Kids score one higher because soft plastic on warm liquids ages faster.",
        calibration_note: "Variant scored: Miracle 360 only, not the spoutless cups.",
        image_url: null,
        buy_links: {
          amazon: "https://www.amazon.com/dp/B0MUNCH1",
          target: "https://www.target.com/p/munchkin-miracle-360-trainer-cup/-/A-14523",
        },
      },
      {
        id: "sippy_4",
        product_name: "Nuby Cup-eez Trainer Cup",
        score: 6, kid_score: 7,
        why: "Mixed plastic with synthetic dyes on colored variants. Tight valve crevices.",
        flags: ["plastic_body", "synthetic_dye"],
        tier: 3,
        tier_note: "Plastic body with colored variants.",
        detailed_flags: [
          { label: "Material", kind: "neutral", detail: "Polypropylene body." },
          { label: "Dyes", kind: "concern", detail: "Some variants use synthetic colorants." },
          { label: "Cleaning", kind: "concern", detail: "Hard spout with many edges, mold risk at the seams." },
        ],
        kid_score_note: "Kids score one higher because of the synthetic dye exposure on top of the plastic.",
        image_url: null,
        buy_links: {
          amazon: "https://www.amazon.com/dp/B0NUBYCP",
        },
      },
    ],
  },

  {
    id: "mil_clean_beauty",
    examples: ["gift for my mother in law who likes clean beauty"],
    matches: (q) => (/\bclean beauty\b/.test(q) || /\bclean skincare\b/.test(q)) && (/\bgift\b/.test(q) || /\bmother\b/.test(q) || /\bmil\b/.test(q)),
    intent_restatement: "A clean beauty gift for someone already discerning. These scored top tier and read as gift-worthy.",
    items: [
      {
        id: "mil_1",
        product_name: "Tata Harper Hydrating Floral Essence",
        score: 2, kid_score: 2,
        why: "Vermont-farmed botanicals in glass. No synthetic fragrance, no parabens.",
        flags: ["clean_materials"],
        tier: 1,
        tier_note: "Single-source botanical formulation.",
        detailed_flags: [
          { label: "Ingredients", kind: "good", detail: "Vermont farm-grown botanicals, named on the label." },
          { label: "Fragrance", kind: "good", detail: "No synthetic fragrance. Essential oil notes only." },
          { label: "Packaging", kind: "good", detail: "Glass bottle, recyclable carton." },
        ],
        calibration_note: "Brand-level certified, sustainability report verified.",
        image_url: null,
        buy_links: {
          amazon: "https://www.amazon.com/dp/B0TATA01",
          brand: "https://www.tataharperskincare.com/products/hydrating-floral-essence",
        },
      },
      {
        id: "mil_2",
        product_name: "Pai Skincare Rosehip BioRegenerate Oil",
        score: 2, kid_score: 2,
        why: "Cold-pressed rosehip oil in amber glass. Single ingredient, EWG verified.",
        flags: ["clean_materials"],
        tier: 1,
        tier_note: "Single-ingredient oil.",
        detailed_flags: [
          { label: "Ingredients", kind: "good", detail: "Cold-pressed Rosa canina seed oil. Nothing else." },
          { label: "Packaging", kind: "good", detail: "Amber glass with pipette." },
        ],
        calibration_note: "EWG verified, COSMOS organic.",
        image_url: null,
        buy_links: {
          brand: "https://www.paiskincare.com/products/rosehip-bioregenerate-oil",
          target: "https://www.target.com/p/pai-rosehip-oil/-/A-99001",
        },
      },
      {
        id: "mil_3",
        product_name: "Beautycounter Countertime Tetrapeptide Supreme Cream",
        score: 3, kid_score: 3,
        why: "Plant-derived retinol alternative with the Never List ingredient screen.",
        flags: ["clean_materials"],
        tier: 2,
        tier_note: "Clean formula, plastic vessel.",
        detailed_flags: [
          { label: "Ingredients", kind: "good", detail: "Bakuchiol plus tetrapeptide, screened against the Never List." },
          { label: "Packaging", kind: "concern", detail: "PCR plastic jar, not glass. Solid but less recyclable." },
          { label: "Fragrance", kind: "neutral", detail: "Citrus essential oils. Light." },
        ],
        image_url: null,
        buy_links: {
          amazon: "https://www.amazon.com/dp/B0BCTRY1",
          brand: "https://www.beautycounter.com/product/countertime-tetrapeptide-supreme-cream",
        },
      },
    ],
  },

  {
    id: "dairy_free_pouches",
    examples: ["dairy free snack pouches for my toddler"],
    matches: (q) => /\bdairy.?free\b/.test(q) && (/\bpouch\b/.test(q) || /\btoddler\b/.test(q) || /\bsnack\b/.test(q)),
    intent_restatement: "Dairy free snack pouches that scored well for toddlers. All three options below have zero dairy and clean macros.",
    items: [
      {
        id: "df_1",
        product_name: "Serenity Kids Veggie Puree Pouches",
        score: 3, kid_score: 3,
        why: "Vegetable forward. Avocado oil in the dairy-free SKUs. No added sugar.",
        flags: ["dairy_free", "no_added_sugar"],
        tier: 2,
        tier_note: "Real food, minimal processing.",
        detailed_flags: [
          { label: "Sugar", kind: "good", detail: "No added sugar. Total sugar from real produce only." },
          { label: "Oils", kind: "good", detail: "Avocado oil in the dairy-free SKUs, no seed oils." },
          { label: "Dairy", kind: "good", detail: "Specific SKUs are dairy free — check the label." },
        ],
        nova: 3,
        image_url: null,
        buy_links: {
          amazon: "https://www.amazon.com/dp/B0SERN01",
          brand: "https://www.myserenitykids.com/products/veggie-pouches",
          target: "https://www.target.com/p/serenity-kids-veggie-pouch/-/A-83210",
        },
      },
      {
        id: "df_2",
        product_name: "Once Upon a Farm Organic Fruit Pouches",
        score: 3, kid_score: 3,
        why: "Cold-pressed organic fruit and veg. No dairy in any SKU.",
        flags: ["dairy_free", "no_added_sugar"],
        tier: 2,
        tier_note: "Cold-pressed, refrigerated.",
        detailed_flags: [
          { label: "Sugar", kind: "good", detail: "No added sugar. Real fruit only." },
          { label: "Processing", kind: "good", detail: "Cold-pressed, not heat-treated for shelf life." },
          { label: "Dairy", kind: "good", detail: "All SKUs dairy free." },
        ],
        nova: 3,
        calibration_note: "Refrigerated section only.",
        image_url: null,
        buy_links: {
          brand: "https://www.onceuponafarmorganics.com/collections/pouches",
          target: "https://www.target.com/p/once-upon-a-farm-pouch/-/A-77105",
        },
      },
      {
        id: "df_3",
        product_name: "Plum Organics Mighty 4 Pouches",
        score: 4, kid_score: 5,
        why: "Four food groups, but the grain blend pushes total sugar past 10g per pouch.",
        flags: ["dairy_free", "added_sugar"],
        tier: 2,
        tier_note: "Convenient, sugar-heavier.",
        detailed_flags: [
          { label: "Sugar", kind: "concern", detail: "Grain and fruit blend pushes total sugar past 10g per pouch." },
          { label: "Dairy", kind: "good", detail: "All Mighty 4 SKUs are dairy free." },
          { label: "Grain", kind: "neutral", detail: "Whole grains, but processed into a smooth puree." },
        ],
        nova: 4,
        kid_score_note: "Kids score one higher because the sugar load matters more relative to a smaller body.",
        image_url: null,
        buy_links: {
          amazon: "https://www.amazon.com/dp/B0PLUM01",
          target: "https://www.target.com/p/plum-organics-mighty-4/-/A-12055",
        },
      },
    ],
  },

  {
    id: "pregnancy_sunscreen",
    examples: ["cleaner sunscreen for pregnancy"],
    matches: (q) => /\bsunscreen\b/.test(q) && (/\bpregnan/.test(q) || /\bexpect\b/.test(q) || /\btrimester\b/.test(q)),
    intent_restatement: "Sunscreens that scored cleanest for pregnancy. Mineral filters only, nothing that crosses the placenta.",
    items: [
      {
        id: "preg_1",
        product_name: "Badger Active Mineral Sunscreen SPF 30",
        score: 2, kid_score: 2,
        why: "Non-nano zinc oxide only. Five total ingredients. Recyclable metal tube.",
        flags: ["mineral_only"],
        tier: 1,
        tier_note: "Minimal ingredient mineral.",
        detailed_flags: [
          { label: "Active", kind: "good", detail: "Non-nano zinc oxide only, no chemical UV filters." },
          { label: "Ingredients", kind: "good", detail: "Five total ingredients, all named." },
          { label: "Packaging", kind: "good", detail: "Recyclable aluminum tube." },
        ],
        calibration_note: "EWG verified. Third-party non-toxic certifications.",
        image_url: null,
        buy_links: {
          amazon: "https://www.amazon.com/dp/B0BDGR01",
          brand: "https://www.badgerbalm.com/products/active-mineral-sunscreen",
          target: "https://www.target.com/p/badger-mineral-sunscreen/-/A-50341",
        },
      },
      {
        id: "preg_2",
        product_name: "Babo Botanicals Daily Sheer Tinted Mineral SPF 50",
        score: 2, kid_score: 2,
        why: "Zinc oxide with iron oxides for tint. Adds visible blue light coverage.",
        flags: ["mineral_only"],
        tier: 1,
        tier_note: "Tinted mineral with iron oxides.",
        detailed_flags: [
          { label: "Active", kind: "good", detail: "Zinc oxide with iron oxides for blue-light coverage." },
          { label: "Fragrance", kind: "good", detail: "Fragrance free." },
          { label: "Skin tone", kind: "neutral", detail: "Single tinted shade — may not match every complexion." },
        ],
        image_url: null,
        buy_links: {
          amazon: "https://www.amazon.com/dp/B0BABO01",
          brand: "https://www.babobotanicals.com/products/daily-sheer-tinted-mineral-sunscreen",
        },
      },
      {
        id: "preg_3",
        product_name: "Stream2Sea Mineral Sunblock for Body",
        score: 2, kid_score: 2,
        why: "Non-nano zinc only. Carrier oil is organic green tea. 80-minute water resistant.",
        flags: ["mineral_only"],
        tier: 1,
        tier_note: "Mineral with Protect Land + Sea certification.",
        detailed_flags: [
          { label: "Active", kind: "good", detail: "Non-nano zinc oxide only." },
          { label: "Carrier", kind: "good", detail: "Organic green tea extract, no chemical emollients." },
          { label: "Reef impact", kind: "good", detail: "Protect Land + Sea certified." },
        ],
        image_url: null,
        buy_links: {
          brand: "https://www.stream2sea.com/products/mineral-sunblock-body",
        },
      },
      {
        id: "preg_4",
        product_name: "Pipette Mineral Sunscreen Lotion SPF 50",
        score: 3, kid_score: 3,
        why: "Non-nano zinc with sugarcane squalane. Lighter feel from more emulsifiers.",
        flags: ["mineral_only"],
        tier: 2,
        tier_note: "Light-feel mineral with more carriers.",
        detailed_flags: [
          { label: "Active", kind: "good", detail: "Non-nano zinc oxide." },
          { label: "Emulsifiers", kind: "neutral", detail: "Several plant-derived emulsifiers for the light feel." },
          { label: "Packaging", kind: "neutral", detail: "PCR plastic, recyclable but not glass." },
        ],
        image_url: null,
        buy_links: {
          amazon: "https://www.amazon.com/dp/B0PIPE01",
          target: "https://www.target.com/p/pipette-mineral-sunscreen/-/A-78900",
        },
      },
    ],
  },

  {
    id: "laundry_detergent",
    examples: ["non toxic laundry detergent"],
    matches: (q) => /\blaundry\b/.test(q) && (/\bdetergent\b/.test(q) || /\bsoap\b/.test(q) || /\bnon.?toxic\b/.test(q) || /\bclean\b/.test(q)),
    intent_restatement: "Laundry detergents without fragrance, optical brighteners, or 1,4-dioxane. These four scored cleanest in the database.",
    items: [
      {
        id: "laundry_1",
        product_name: "Branch Basics Laundry Concentrate",
        score: 1, kid_score: 1,
        why: "One bottle, six named ingredients. No fragrance, enzymes, or brighteners.",
        flags: ["fragrance_free", "transparent_ingredients"],
        tier: 1,
        tier_note: "Transparent single-formula concentrate.",
        detailed_flags: [
          { label: "Ingredients", kind: "good", detail: "Six total, all named on the label." },
          { label: "Fragrance", kind: "good", detail: "Fragrance free, no masking agents." },
          { label: "Brighteners", kind: "good", detail: "No optical brighteners." },
          { label: "Packaging", kind: "good", detail: "Refillable concentrate cuts plastic per load." },
        ],
        calibration_note: "Brand-published full ingredient disclosure. Third-party clean certifications.",
        image_url: null,
        buy_links: {
          amazon: "https://www.amazon.com/dp/B0BRBS01",
          brand: "https://www.branchbasics.com/products/laundry-concentrate",
        },
      },
      {
        id: "laundry_2",
        product_name: "Molly's Suds Laundry Powder",
        score: 2, kid_score: 2,
        why: "Five ingredients, all named on the label. No PVA film, cardboard packaging.",
        flags: ["fragrance_free", "transparent_ingredients"],
        tier: 1,
        tier_note: "Minimal-ingredient powder.",
        detailed_flags: [
          { label: "Ingredients", kind: "good", detail: "Sodium carbonate, magnesium sulfate, sodium chloride, sodium bicarbonate, peppermint oil." },
          { label: "Format", kind: "good", detail: "Powder in cardboard, no plastic." },
          { label: "Scent", kind: "neutral", detail: "Light peppermint from essential oil, not synthetic fragrance." },
        ],
        image_url: null,
        buy_links: {
          amazon: "https://www.amazon.com/dp/B0MOLY01",
          brand: "https://mollyssuds.com/products/laundry-powder",
          target: "https://www.target.com/p/mollys-suds-laundry-powder/-/A-22001",
        },
      },
      {
        id: "laundry_3",
        product_name: "Dropps Stain and Odor Laundry Pods",
        score: 3, kid_score: 3,
        why: "Pods with clean formula. PVA film dissolves but full degradation is debated.",
        flags: ["pva_film"],
        tier: 2,
        tier_note: "Clean formula, plastic-film question.",
        detailed_flags: [
          { label: "Formula", kind: "good", detail: "No synthetic fragrance, no brighteners, no dyes." },
          { label: "PVA film", kind: "concern", detail: "Dissolves but recent peer-reviewed work questions full degradation." },
          { label: "Packaging", kind: "good", detail: "Cardboard box, no plastic outer." },
        ],
        image_url: null,
        buy_links: {
          amazon: "https://www.amazon.com/dp/B0DRPS01",
          brand: "https://www.dropps.com/products/stain-odor-pods",
        },
      },
      {
        id: "laundry_4",
        product_name: "Tru Earth Laundry Strips",
        score: 3, kid_score: 3,
        why: "Plastic-free strips, no water shipping. Strip itself is PVA film.",
        flags: ["pva_film"],
        tier: 2,
        tier_note: "Strip format, PVA film body.",
        detailed_flags: [
          { label: "Formula", kind: "good", detail: "Fragrance free option available, no brighteners." },
          { label: "PVA strip", kind: "concern", detail: "The strip itself is PVA film. Same degradation question as pods." },
          { label: "Shipping", kind: "good", detail: "Light, plastic-free, no water to ship." },
        ],
        image_url: null,
        buy_links: {
          amazon: "https://www.amazon.com/dp/B0TRUE01",
          brand: "https://www.tru.earth/products/laundry-eco-strips",
          target: "https://www.target.com/p/tru-earth-laundry-strips/-/A-66100",
        },
      },
    ],
  },

  // Empty-results case: intent is clear, nothing scores well.
  {
    id: "teen_deodorant",
    examples: ["natural deodorant for teenagers"],
    matches: (q) => /\bdeodorant\b/.test(q) && (/\bteen\b/.test(q) || /\bteenager\b/.test(q)),
    intent_restatement: "Teen-targeted natural deodorant is a thin slice of the category. Most options either drift into adult clean beauty pricing or include fragrance blends that get flagged at high doses.",
    items: [],
    no_match_message: "Nothing in our database scores well for this yet. Worth scanning options yourself at the store and adding the strongest contender to a list.",
  },
];

export function findResponse(query) {
  const q = String(query || "").toLowerCase().trim();
  if (!q) return null;
  for (const fixture of FIXTURES) {
    try { if (fixture.matches(q)) return fixture; } catch {}
  }
  return null;
}

// Rotating placeholder copy for the textarea. Pulls from each fixture's
// first example so the in-product examples stay in sync with what the
// matcher can actually answer.
export const PLACEHOLDER_EXAMPLES = FIXTURES
  .filter(f => Array.isArray(f.examples) && f.examples.length)
  .map(f => f.examples[0]);

// Lists shown in the "Add to list" picker. Plausible names from R3a's
// world; fake at the prototype level since R5a doesn't mutate real list
// state.
export const FAKE_LIST_NAMES = [
  { id: "fake_l1", name: "Target run" },
  { id: "fake_l2", name: "Bathroom restock" },
  { id: "fake_l3", name: "Newborn essentials" },
];

// Sample queries shown on the no-match empty state so the user gets a
// concrete sense of what to type next.
export const EXAMPLE_QUERIES = [
  "sippy cup for my 18 month old",
  "gift for my mother in law who likes clean beauty",
  "dairy free snack pouches for my toddler",
  "cleaner sunscreen for pregnancy",
  "non toxic laundry detergent",
];

// NOVA tier labels for the expanded scoring detail on food items.
export const NOVA_LABEL = {
  1: "Unprocessed or minimally processed.",
  2: "Processed culinary ingredient.",
  3: "Processed food.",
  4: "Ultra-processed.",
};

export default FIXTURES;
