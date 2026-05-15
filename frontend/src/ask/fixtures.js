// R5a Ask prototype — fake responses for the 5 canonical example
// queries plus one "intent clear, nothing scores well" case so Sara
// can review that copy state too.
//
// The shape mirrors what R5b's real backend will return:
//   { query, intent_restatement, items: [{id, product_name, score,
//     kid_score, why, flags}, ...] }
//
// Each fixture carries a `matches(q)` function. The first fixture
// whose matcher fires wins. Order matters — most specific first.

const FIXTURES = [
  {
    id: "sippy_cup",
    examples: ["sippy cup for my 18 month old"],
    matches: (q) => /\bsippy\b/.test(q) || /\btoddler\s+(cup|water)/.test(q) || /\b18\s+(month|mo)\b/.test(q),
    intent_restatement: "Looking for a clean sippy cup for an 18 month old. Here's what scores well.",
    items: [
      {
        id: "sippy_1",
        product_name: "ezpz Tiny Cup",
        score: 2, kid_score: 2,
        why: "Pure platinum silicone. No plastic, no dyes, no spout to harbor mold. Built for little hands to learn open-cup drinking.",
        flags: ["clean_materials"],
      },
      {
        id: "sippy_2",
        product_name: "Pura Kiki Stainless Steel Toddler Bottle",
        score: 2, kid_score: 2,
        why: "Medical-grade stainless steel body with a silicone sleeve. The sippy spout is silicone. Nothing leaches into liquid, hot or cold.",
        flags: ["clean_materials"],
      },
      {
        id: "sippy_3",
        product_name: "Munchkin Miracle 360 Trainer Cup",
        score: 5, kid_score: 6,
        why: "BPA-free polypropylene body and a silicone valve. Plastic-on-liquid is fine for most kids, but warm liquids and dishwasher cycles wear the material faster than steel or silicone.",
        flags: ["plastic_body"],
      },
      {
        id: "sippy_4",
        product_name: "Nuby Cup-eez Trainer Cup",
        score: 6, kid_score: 7,
        why: "Mixed plastic with hard spout. The variant with synthetic dyes scores worse, and the tight crevices around the valve are hard to clean.",
        flags: ["plastic_body", "synthetic_dye"],
      },
    ],
  },

  {
    id: "mil_clean_beauty",
    examples: ["gift for my mother in law who likes clean beauty"],
    matches: (q) => (/\bclean beauty\b/.test(q) || /\bclean skincare\b/.test(q)) && (/\bgift\b/.test(q) || /\bmother\b/.test(q) || /\bmil\b/.test(q)),
    intent_restatement: "A clean beauty gift for someone already discerning. These score top tier and read as gift-worthy.",
    items: [
      {
        id: "mil_1",
        product_name: "Tata Harper Hydrating Floral Essence",
        score: 2, kid_score: 2,
        why: "Vermont-farmed botanicals, glass bottle, full ingredient transparency. No synthetic fragrance, no parabens. The kind of bottle that signals attention.",
        flags: ["clean_materials"],
      },
      {
        id: "mil_2",
        product_name: "Pai Skincare Rosehip BioRegenerate Oil",
        score: 2, kid_score: 2,
        why: "Cold-pressed rosehip oil in dark glass. Single ingredient story, EWG verified, gentle enough for sensitive skin.",
        flags: ["clean_materials"],
      },
      {
        id: "mil_3",
        product_name: "Beautycounter Countertime Tetrapeptide Supreme Cream",
        score: 3, kid_score: 3,
        why: "Plant-derived retinol alternative with a Never List ingredient screen. The peptide formula is the actual selling point; the packaging is plastic, not glass.",
        flags: ["clean_materials"],
      },
    ],
  },

  {
    id: "dairy_free_pouches",
    examples: ["dairy free snack pouches for my toddler"],
    matches: (q) => /\bdairy.?free\b/.test(q) && (/\bpouch\b/.test(q) || /\btoddler\b/.test(q) || /\bsnack\b/.test(q)),
    intent_restatement: "Dairy free snack pouches that score well for toddlers. All three options below have zero dairy and clean macros.",
    items: [
      {
        id: "df_1",
        product_name: "Serenity Kids Veggie Puree Pouches",
        score: 3, kid_score: 3,
        why: "Vegetable forward. Beets, carrots, butternut squash with grass-fed butter as an option, but the dairy-free SKUs use avocado oil instead. No added sugar.",
        flags: ["dairy_free", "no_added_sugar"],
      },
      {
        id: "df_2",
        product_name: "Once Upon a Farm Organic Fruit Pouches",
        score: 3, kid_score: 3,
        why: "Cold-pressed organic fruit and veg. No dairy in any SKU. The sugar is all from real fruit. Refrigerated, which signals it isn't shelf stable for years.",
        flags: ["dairy_free", "no_added_sugar"],
      },
      {
        id: "df_3",
        product_name: "Plum Organics Mighty 4 Pouches",
        score: 4, kid_score: 5,
        why: "Four food groups in one pouch, but the grain blend reads like added carbs that drive the sugar load up. Dairy free, but kid_score lands higher because of the sugar.",
        flags: ["dairy_free", "added_sugar"],
      },
    ],
  },

  {
    id: "pregnancy_sunscreen",
    examples: ["safe sunscreen for pregnancy"],
    matches: (q) => /\bsunscreen\b/.test(q) && (/\bpregnan/.test(q) || /\bexpect\b/.test(q) || /\btrimester\b/.test(q)),
    intent_restatement: "Mineral sunscreens with no oxybenzone, no avobenzone, and nothing else that crosses the placenta. All four below are safe for pregnancy and nursing.",
    items: [
      {
        id: "preg_1",
        product_name: "Badger Active Mineral Sunscreen SPF 30",
        score: 2, kid_score: 2,
        why: "Non-nano zinc oxide only. Five ingredients total. EWG verified, made in Vermont, recyclable metal tube.",
        flags: ["mineral_only"],
      },
      {
        id: "preg_2",
        product_name: "Babo Botanicals Daily Sheer Tinted Mineral SPF 50",
        score: 2, kid_score: 2,
        why: "Zinc oxide with iron oxides for tint. Tinted finish means visible blue light protection on top of UV — relevant if you're pregnant and pigmenting.",
        flags: ["mineral_only"],
      },
      {
        id: "preg_3",
        product_name: "Stream2Sea Mineral Sunblock for Body",
        score: 2, kid_score: 2,
        why: "Reef-safe certified, non-nano zinc, no titanium dioxide. The carrier oil is organic green tea extract. Water resistant for 80 minutes.",
        flags: ["mineral_only"],
      },
      {
        id: "preg_4",
        product_name: "Pipette Mineral Sunscreen Lotion SPF 50",
        score: 3, kid_score: 3,
        why: "Non-nano zinc with squalane from sugarcane. Lighter feel than Badger but the formula has more emulsifiers, which is why it lands at 3 not 2.",
        flags: ["mineral_only"],
      },
    ],
  },

  {
    id: "laundry_detergent",
    examples: ["non toxic laundry detergent"],
    matches: (q) => /\blaundry\b/.test(q) && (/\bdetergent\b/.test(q) || /\bsoap\b/.test(q) || /\bnon.?toxic\b/.test(q) || /\bclean\b/.test(q)),
    intent_restatement: "Laundry detergents without fragrance, optical brighteners, or 1,4-dioxane. These four are the cleanest in the database.",
    items: [
      {
        id: "laundry_1",
        product_name: "Branch Basics Laundry Concentrate",
        score: 1, kid_score: 1,
        why: "One bottle, full ingredient transparency, no fragrance, no enzymes, no brighteners. Dilutes from concentrate, which cuts plastic per load by 90 percent.",
        flags: ["fragrance_free", "transparent_ingredients"],
      },
      {
        id: "laundry_2",
        product_name: "Molly's Suds Laundry Powder",
        score: 2, kid_score: 2,
        why: "Five ingredients, all named on the label. No PVA film, no brighteners. Cardboard packaging means no plastic to the curb each month.",
        flags: ["fragrance_free", "transparent_ingredients"],
      },
      {
        id: "laundry_3",
        product_name: "Dropps Stain and Odor Laundry Pods",
        score: 3, kid_score: 3,
        why: "Single-dose pods are convenient and the formula screens out the worst offenders. The PVA film dissolves but recent research questions whether it fully degrades.",
        flags: ["pva_film"],
      },
      {
        id: "laundry_4",
        product_name: "Tru Earth Laundry Strips",
        score: 3, kid_score: 3,
        why: "Plastic-free format and zero water shipping. Same PVA film concern as Dropps — the strip itself is the film. Otherwise clean formula.",
        flags: ["pva_film"],
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
  "safe sunscreen for pregnancy",
  "non toxic laundry detergent",
];

export default FIXTURES;
