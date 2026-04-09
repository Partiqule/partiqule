// ============================================================
// AFFILIATE PRODUCT DATABASE
// Replace AFFILIATE_TAG with your Amazon Associates tag
// ============================================================

const AMAZON_TAG = "partiqule-20";

// ── DIRECT SWAP MAP (REMOVED) ────────────────────────────────
// Previously a manual keyword→product ID lookup. Now handled automatically
// by relevance scoring: category match (8pts) + tag overlap (5pts each)
// must reach threshold 13. Keep product tags accurate = no maintenance needed.
const DIRECT_SWAPS = {  // empty — not used, safe to ignore
};

const products = [
  // ── CLOTHING & TEXTILES ──────────────────────────────────
  {
    id: "ct-001",
    name: "Pact Organic Cotton Underwear",
    brand: "Pact",
    category: "clothing",
    plasticScore: 1,
    material: "100% GOTS-certified organic cotton",
    description: "Soft, breathable, no synthetic fibers",
    affiliateUrl: `https://www.amazon.com/s?k=Pact+organic+cotton+underwear&tag=partiqule-20`,
    price: "$18–22",
    tags: ["underwear", "men", "women", "organic", "cotton", "briefs", "boxers"]
  },
  {
    id: "ct-002",
    name: "Thought Clothing Bamboo Socks",
    brand: "Thought",
    category: "clothing",
    plasticScore: 2,
    material: "Bamboo & organic cotton blend",
    description: "Naturally antibacterial, plastic-free packaging",
    affiliateUrl: `https://www.amazon.com/s?k=bamboo+organic+cotton+socks&tag=partiqule-20`,
    price: "$14–18",
    tags: ["socks", "bamboo", "cotton", "unisex", "ankle", "crew"]
  },
  {
    id: "ct-003",
    name: "prAna Hemp Blend T-Shirt",
    brand: "prAna",
    category: "clothing",
    plasticScore: 2,
    material: "55% hemp, 45% organic cotton",
    description: "Durable natural fibers, no microplastic shedding",
    affiliateUrl: `https://www.amazon.com/s?k=prAna+hemp+organic+cotton+t-shirt&tag=partiqule-20`,
    price: "$35–45",
    tags: ["tshirt", "t-shirt", "shirt", "hemp", "cotton", "men", "women", "top"]
  },
  {
    id: "ct-004",
    name: "Girlfriend Collective Recycled Leggings",
    brand: "Girlfriend Collective",
    category: "clothing",
    plasticScore: 4,
    material: "Recycled plastic bottles (RPET)",
    description: "Lower impact than virgin synthetic — use a Guppyfriend wash bag",
    affiliateUrl: `https://www.amazon.com/s?k=Girlfriend+Collective+recycled+leggings&tag=partiqule-20`,
    price: "$68–78",
    tags: ["leggings", "activewear", "women", "recycled", "yoga", "workout", "athletic", "lululemon"]
  },
  {
    id: "ct-005",
    name: "Guppyfriend Washing Bag",
    brand: "Guppyfriend",
    category: "clothing",
    plasticScore: 1,
    material: "Specially woven nylon filter",
    description: "Captures microfibers from synthetic clothes in the wash",
    affiliateUrl: `https://www.amazon.com/s?k=Guppyfriend+Guppyfriend+Washing+Bag&tag=partiqule-20`,
    price: "$30",
    tags: ["laundry", "microfiber", "filter", "accessory", "washing", "synthetic", "fleece"]
  },

  // ── FOOD & BEVERAGE PACKAGING ────────────────────────────
  {
    id: "fb-001",
    name: "Klean Kanteen Stainless Water Bottle",
    brand: "Klean Kanteen",
    category: "food_beverage",
    plasticScore: 1,
    material: "18/8 food-grade stainless steel",
    description: "Zero plastic contact with your drink, lifetime warranty",
    affiliateUrl: `https://www.amazon.com/s?k=Klean+Kanteen+stainless+water+bottle&tag=${AMAZON_TAG}`,
    price: "$30–40",
    tags: ["water bottle", "stainless", "reusable", "drink", "bottle", "cup", "mug", "travel"]
  },
  {
    id: "fb-002",
    name: "Stasher Silicone Food Bags",
    brand: "Stasher",
    category: "food_beverage",
    plasticScore: 2,
    material: "Pure platinum silicone",
    description: "Replaces Ziploc & single-use plastic bags, no leaching",
    affiliateUrl: `https://www.amazon.com/s?k=Stasher+Stasher+Silicone+Food+Bags&tag=partiqule-20`,
    price: "$12–20",
    tags: ["food storage", "silicone", "reusable", "bags", "ziploc", "sandwich bag", "freezer bag", "snack bag", "food bag"]
  },
  {
    id: "fb-003",
    name: "Bee's Wrap Beeswax Food Wrap",
    brand: "Bee's Wrap",
    category: "food_beverage",
    plasticScore: 1,
    material: "Organic cotton, beeswax, jojoba oil",
    description: "Replaces plastic wrap & cling film, fully compostable",
    affiliateUrl: `https://www.amazon.com/s?k=Bees+Wrap+Bees+Wrap+Beeswax+Food+Wrap&tag=partiqule-20`,
    price: "$18–22",
    tags: ["food wrap", "beeswax", "plastic-free", "compostable", "cling wrap", "saran wrap", "plastic wrap", "food cover", "ziploc"]
  },
  {
    id: "fb-004",
    name: "Lifefactory Glass Water Bottle",
    brand: "Lifefactory",
    category: "food_beverage",
    plasticScore: 1,
    material: "Borosilicate glass with silicone sleeve",
    description: "Zero plastic, pure taste, durable protective sleeve",
    affiliateUrl: `https://www.amazon.com/s?k=Lifefactory+Lifefactory+Glass+Water+Bottle&tag=partiqule-20`,
    price: "$25–35",
    tags: ["water bottle", "glass", "reusable", "drink", "bottle", "tea", "coffee", "beverage"]
  },

  // ── DRINKS & BEVERAGES ───────────────────────────────────
  {
    id: "dr-001",
    name: "Olipop Vintage Cola",
    brand: "Olipop",
    category: "food_beverage",
    plasticScore: 2,
    material: "Plant fiber, prebiotics, natural flavors",
    description: "Tastes like cola, 2-5g sugar, 9g fiber, no artificial dyes",
    affiliateUrl: `https://www.amazon.com/s?k=Olipop+vintage+cola&tag=${AMAZON_TAG}`,
    price: "$2–3",
    tags: ["cola", "pepsi", "coke", "diet coke", "diet pepsi", "coca cola", "rc cola", "pepsi max", "coke zero", "mountain dew", "sugary soda", "conventional soda"]
  },
  {
    id: "dr-002",
    name: "Olipop Classic Root Beer",
    brand: "Olipop",
    category: "food_beverage",
    plasticScore: 2,
    material: "Plant fiber, prebiotics, natural flavors",
    description: "35 calories, 9g prebiotic fiber, no artificial sweeteners",
    affiliateUrl: `https://www.amazon.com/s?k=Olipop+root+beer&tag=${AMAZON_TAG}`,
    price: "$2–3",
    tags: ["root beer", "a&w", "barqs", "mug root beer", "diet root beer", "sarsaparilla"]
  },
  {
    id: "dr-003",
    name: "Poppi Prebiotic Soda",
    brand: "Poppi",
    category: "food_beverage",
    plasticScore: 3,
    material: "Apple cider vinegar, natural fruit juice, prebiotics",
    description: "5g sugar, gut-friendly, no artificial dyes or sweeteners",
    affiliateUrl: `https://www.amazon.com/s?k=Poppi+prebiotic+soda&tag=${AMAZON_TAG}`,
    price: "$2–3",
    tags: ["soda", "cola", "pepsi", "coke", "coca cola", "diet coke", "mountain dew", "sprite", "dr pepper", "rc cola", "carbonated drink", "soft drink", "fizzy drink", "sugary soda"]
  },
  {
    id: "dr-004",
    name: "Spindrift Sparkling Water",
    brand: "Spindrift",
    category: "food_beverage",
    plasticScore: 1,
    material: "Real squeezed fruit, sparkling water — nothing else",
    description: "Only sparkling water with real fruit juice, no natural flavors",
    affiliateUrl: `https://www.amazon.com/s?k=Spindrift+sparkling+water&tag=${AMAZON_TAG}`,
    price: "$1–2",
    tags: ["sparkling water", "soda water", "fizzy water", "flavored water", "LaCroix", "Bubly", "Perrier", "San Pellegrino", "topo chico", "carbonated water", "seltzer"]
  },
  {
    id: "dr-005",
    name: "Waterloo Sparkling Water",
    brand: "Waterloo",
    category: "food_beverage",
    plasticScore: 1,
    material: "Purified water, natural flavors — no sweeteners, no sodium",
    description: "Non-GMO, no PFAS, BPA-free cans, strong carbonation",
    affiliateUrl: `https://www.amazon.com/s?k=Waterloo+sparkling+water&tag=${AMAZON_TAG}`,
    price: "$1–2",
    tags: ["sparkling water", "LaCroix", "Bubly", "seltzer", "carbonated water", "fizzy water", "flavored water", "soda water"]
  },
  {
    id: "dr-006",
    name: "Celsius Energy Drink",
    brand: "Celsius",
    category: "food_beverage",
    plasticScore: 2,
    material: "Green tea extract, guarana, ginger, vitamin C — no artificial colors",
    description: "No artificial dyes, no aspartame, no high fructose corn syrup",
    affiliateUrl: `https://www.amazon.com/s?k=Celsius+energy+drink&tag=${AMAZON_TAG}`,
    price: "$2–3",
    tags: ["energy drink", "red bull", "monster", "bang", "rockstar", "caffeine", "pre workout", "performance drink", "sports drink"]
  },
  {
    id: "dr-007",
    name: "Guayaki Yerba Mate",
    brand: "Guayaki",
    category: "food_beverage",
    plasticScore: 1,
    material: "Organic yerba mate leaf, organic flavors — no synthetic additives",
    description: "USDA Organic, fair trade, sustained energy without jitters",
    affiliateUrl: `https://www.amazon.com/s?k=Guayaki+yerba+mate&tag=${AMAZON_TAG}`,
    price: "$2–3",
    tags: ["energy drink", "red bull", "monster", "caffeine", "tea", "green tea", "matcha", "coffee alternative", "boost", "energy", "sparkling"]
  },
  {
    id: "dr-008",
    name: "GT's Synergy Kombucha",
    brand: "GT's",
    category: "food_beverage",
    plasticScore: 1,
    material: "Organic raw kombucha, live cultures, fruit juice",
    description: "Raw, unpasteurized, USDA Organic, naturally carbonated",
    affiliateUrl: `https://www.amazon.com/s?k=GTs+synergy+kombucha&tag=${AMAZON_TAG}`,
    price: "$3–4",
    tags: ["kombucha", "soda", "sparkling", "probiotic drink", "fermented", "gut health", "juice", "fizzy"]
  },
  {
    id: "dr-009",
    name: "Harmless Harvest Coconut Water",
    brand: "Harmless Harvest",
    category: "food_beverage",
    plasticScore: 1,
    material: "100% raw organic coconut water — single ingredient",
    description: "No added sugar, no preservatives, fair trade, organic",
    affiliateUrl: `https://www.amazon.com/s?k=Harmless+Harvest+coconut+water&tag=${AMAZON_TAG}`,
    price: "$3–4",
    tags: ["coconut water", "juice", "sports drink", "gatorade", "powerade", "electrolytes", "vitamin water", "hydration"]
  },
  {
    id: "dr-010",
    name: "Liquid Death Mountain Water",
    brand: "Liquid Death",
    category: "food_beverage",
    plasticScore: 1,
    material: "Pure mountain water in infinitely recyclable aluminum",
    description: "Aluminum cans vs plastic bottles — dramatically lower microplastic risk",
    affiliateUrl: `https://www.amazon.com/s?k=Liquid+Death+mountain+water&tag=${AMAZON_TAG}`,
    price: "$1–2",
    tags: ["water", "bottled water", "dasani", "aquafina", "smart water", "evian", "fiji", "plastic bottle", "poland spring"]
  },
  {
    id: "dr-011",
    name: "Honest Tea Organic Green Tea",
    brand: "Honest Tea",
    category: "food_beverage",
    plasticScore: 2,
    material: "Organic brewed tea, organic cane sugar — no artificial flavors",
    description: "USDA Organic, Fair Trade, low sugar, no artificial dyes",
    affiliateUrl: `https://www.amazon.com/s?k=Honest+Tea+organic+green+tea&tag=${AMAZON_TAG}`,
    price: "$2–3",
    tags: ["iced tea", "tea", "green tea", "sweet tea", "arizona tea", "snapple", "lipton", "bottled tea", "juice"]
  },
  {
    id: "dr-012",
    name: "Martinelli's Apple Juice",
    brand: "Martinelli's",
    category: "food_beverage",
    plasticScore: 1,
    material: "100% US grown apple juice, no additives, glass bottle",
    description: "No added sugar, no preservatives, no artificial colors, glass packaging",
    affiliateUrl: `https://www.amazon.com/s?k=Martinellis+apple+juice&tag=${AMAZON_TAG}`,
    price: "$3–5",
    tags: ["juice", "apple juice", "orange juice", "fruit juice", "kids drink", "tropicana", "minute maid", "simply orange", "juicebox"]
  },


  {
    id: "pc-001",
    name: "Ethique Shampoo Bar",
    brand: "Ethique",
    category: "personal_care",
    plasticScore: 1,
    material: "Solid bar, zero plastic packaging",
    description: "Plastic-free, concentrated, lasts 80+ washes",
    affiliateUrl:`https://www.amazon.com/s?k=Ethique+shampoo+bar&tag=${AMAZON_TAG}`,
    price: "$15–18",
    tags: ["shampoo", "conditioner", "bar", "plastic-free", "hair", "body wash", "soap", "cleanser"]
  },
  {
    id: "pc-002",
    name: "Bite Toothpaste Bits",
    brand: "Bite",
    category: "personal_care",
    plasticScore: 1,
    material: "Glass bottle, no plastic tube",
    description: "Chewable tablets, no microbeads, glass packaging",
    affiliateUrl: `https://www.amazon.com/s?k=Bite+Bite+Toothpaste+Bits&tag=partiqule-20`,
    price: "$12/month",
    tags: ["toothpaste", "plastic-free", "oral care", "glass", "teeth", "dental"]
  },
  {
    id: "pc-003",
    name: "Meow Meow Tweet Deodorant",
    brand: "Meow Meow Tweet",
    category: "personal_care",
    plasticScore: 1,
    material: "Cardboard packaging, natural ingredients",
    description: "Zero plastic, aluminum-free, compostable tube",
    affiliateUrl: `https://www.amazon.com/s?k=Meow+Meow+Tweet+Meow+Meow+Tweet+Deodorant&tag=partiqule-20`,
    price: "$14–16",
    tags: ["deodorant", "plastic-free", "natural", "cardboard", "antiperspirant"]
  },
  {
    id: "pc-004",
    name: "LastObject Reusable Cotton Rounds",
    brand: "LastObject",
    category: "personal_care",
    plasticScore: 1,
    material: "Organic cotton, comes in recycled case",
    description: "Replaces 1,750 single-use cotton pads, washable",
    affiliateUrl: `https://www.amazon.com/s?k=LastObject+LastObject+Reusable+Cotton+Rounds&tag=partiqule-20`,
    price: "$18",
    tags: ["cotton rounds", "reusable", "skincare", "zero waste", "makeup remover", "face", "toner", "pads", "wipes", "face wipes", "cleansing wipes", "reusable wipes"]
  },

  // ── KITCHEN & HOUSEHOLD ──────────────────────────────────
  {
    id: "kh-001",
    name: "Full Circle Loofah Dish Brush",
    brand: "Full Circle",
    category: "kitchen",
    plasticScore: 1,
    material: "Natural loofah, bamboo handle",
    description: "No plastic bristles shedding into your food or water",
    affiliateUrl: `https://www.amazon.com/s?k=Full+Circle+Full+Circle+Loofah+Dish+Brush&tag=partiqule-20`,
    price: "$8–12",
    tags: ["dish brush", "bamboo", "loofah", "kitchen", "cleaning", "sponge", "scrubber", "dishes"]
  },
  {
    id: "kh-002",
    name: "Swedish Dishcloths by SUPERSCANDI",
    brand: "SUPERSCANDI",
    category: "kitchen",
    plasticScore: 1,
    material: "Cellulose & cotton",
    description: "Replaces 17 rolls of paper towels, fully compostable",
    affiliateUrl: `https://www.amazon.com/s?k=SUPERSCANDI+Swedish+Dishcloths+by+SUPERSCANDI&tag=partiqule-20`,
    price: "$14–18",
    tags: ["dish cloth", "cellulose", "kitchen", "paper towel", "towel", "cloth", "wipe", "cleaning"]
  },
  {
    id: "kh-003",
    name: "Ecover Laundry Detergent Sheets",
    brand: "Ecover",
    category: "kitchen",
    plasticScore: 1,
    material: "Dissolvable sheets, cardboard box",
    description: "No plastic jug, replaces Tide Pods and liquid detergent",
    affiliateUrl: `https://www.amazon.com/s?k=Ecover+Ecover+Laundry+Detergent+Sheets&tag=partiqule-20`,
    price: "$16–20",
    tags: ["laundry", "detergent", "plastic-free", "sheets", "washing", "tide", "pods", "clothes wash"]
  },
  {
    id: "kh-004",
    name: "Xtrema Pure Ceramic Cookware",
    brand: "Xtrema",
    category: "kitchen",
    plasticScore: 1,
    material: "100% ceramic, no PTFE/PFAS coating",
    description: "No non-stick plastic coating to flake into food",
    affiliateUrl: `https://www.amazon.com/s?k=Xtrema+Xtrema+Pure+Ceramic+Cookware&tag=partiqule-20`,
    price: "$60–120",
    tags: ["cookware", "ceramic", "non-stick", "nonstick", "kitchen", "pfas-free", "pan", "frying pan", "pot", "teflon"]
  },

  // ── WEARABLES & ACCESSORIES ──────────────────────────────────
  {
    id: "ac-001",
    name: "Leather Watch Band by Barton",
    brand: "Barton Watch Bands",
    category: "clothing",
    plasticScore: 2,
    material: "Full-grain genuine leather",
    description: "No synthetic rubber, no microplastic shedding against skin",
    affiliateUrl: `https://www.amazon.com/s?k=Barton+Watch+Bands+Leather+Watch+Band+by+Barton&tag=partiqule-20`,
    price: "$20–35",
    tags: ["watch band", "watch strap", "leather", "sport band", "wristband", "apple watch", "fitbit", "accessory", "wearable"]
  },
  {
    id: "ac-002",
    name: "Woven Fabric Watch Band by Casetify",
    brand: "Casetify",
    category: "clothing",
    plasticScore: 3,
    material: "Recycled woven fabric, stainless clasp",
    description: "Fabric weave sheds far fewer microplastics than rubber or silicone",
    affiliateUrl: `https://www.amazon.com/s?k=woven+fabric+apple+watch+band&tag=partiqule-20`,
    price: "$25–40",
    tags: ["watch band", "sport band", "fabric", "woven", "apple watch", "wristband", "accessory", "wearable", "strap"]
  },
  {
    id: "ac-003",
    name: "Stainless Steel Watch Band",
    brand: "Pantheon",
    category: "clothing",
    plasticScore: 1,
    material: "316L stainless steel",
    description: "Zero plastic, zero microfiber shedding, lifetime durability",
    affiliateUrl: `https://www.amazon.com/s?k=Pantheon+Stainless+Steel+Watch+Band&tag=partiqule-20`,
    price: "$15–30",
    tags: ["watch band", "metal band", "stainless", "apple watch", "watch strap", "accessory", "wearable", "sport band"]
  },


  {
    id: "bk-001",
    name: "Pehr Organic Cotton Onesie",
    brand: "Pehr",
    category: "baby",
    plasticScore: 1,
    material: "100% GOTS-certified organic cotton",
    description: "No synthetic fibers next to baby's sensitive skin",
    affiliateUrl: `https://www.amazon.com/s?k=organic+cotton+baby+onesie+GOTS+certified&tag=partiqule-20`,
    price: "$22–30",
    tags: ["baby", "onesie", "organic", "cotton", "newborn", "infant", "clothes", "bodysuit"]
  },
  {
    id: "bk-002",
    name: "Green Sprouts Glass Baby Bottles",
    brand: "Green Sprouts",
    category: "baby",
    plasticScore: 1,
    material: "Borosilicate glass, silicone nipple",
    description: "Zero plastic leaching into baby formula or milk",
    affiliateUrl: `https://www.amazon.com/s?k=Green+Sprouts+Green+Sprouts+Glass+Baby+Bottles&tag=partiqule-20`,
    price: "$14–18",
    tags: ["baby bottle", "glass", "infant", "feeding", "formula", "milk", "bottle", "newborn"]
  },
  {
    id: "bk-003",
    name: "Hanna Andersson Organic PJs",
    brand: "Hanna Andersson",
    category: "baby",
    plasticScore: 1,
    material: "100% organic cotton",
    description: "GOTS certified, no flame retardant chemicals",
    affiliateUrl: `https://www.amazon.com/s?k=Hanna+Andersson+organic+cotton+pajamas+kids&tag=partiqule-20`,
    price: "$28–36",
    tags: ["pajamas", "pjs", "kids", "organic", "cotton", "toddler", "sleepwear", "nightwear"]
  },
  {
    id: "bk-004",
    name: "Bumkins Silicone Bib",
    brand: "Bumkins",
    category: "baby",
    plasticScore: 2,
    material: "Food-grade silicone",
    description: "No BPA/BPS, much safer than soft plastic bibs",
    affiliateUrl: `https://www.amazon.com/s?k=Bumkins+Bumkins+Silicone+Bib&tag=partiqule-20`,
    price: "$10–14",
    tags: ["bib", "silicone", "baby", "feeding", "toddler", "mealtime", "food"]
  },

  // ── DIAPERS ───────────────────────────────────────────────────
  {
    id: "bk-005",
    name: "Coterie Diapers",
    brand: "Coterie",
    category: "baby",
    score: 3,
    plasticScore: 3,
    material: "Plant-based topsheet, no fragrance, no lotions",
    description: "Free of chlorine bleaching, fragrance, lotions, and parabens. TCF pulp. No Ahcovel or known chemical irritants.",
    affiliateUrl: "https://www.amazon.com/s?k=Coterie+diapers&tag=partiqule-20",
    price: "$28–38",
    tags: ["diaper", "diapers", "baby", "newborn", "infant", "toddler", "nappy", "disposable", "clean"]
  },
  {
    id: "bk-006",
    name: "Dyper Bamboo Diapers",
    brand: "Dyper",
    category: "baby",
    score: 2,
    plasticScore: 2,
    material: "Viscose from bamboo topsheet, TCF pulp, no fragrance",
    description: "No chlorine, no fragrance, no lotions, no parabens, no phthalates. USDA biobased certified. Compostable via Dyper service.",
    affiliateUrl: "https://www.amazon.com/s?k=Dyper+bamboo+diapers&tag=partiqule-20",
    price: "$25–35",
    tags: ["diaper", "diapers", "baby", "newborn", "infant", "toddler", "nappy", "bamboo", "compostable", "clean"]
  },
  {
    id: "bk-007",
    name: "Andy Pandy Bamboo Diapers",
    brand: "Andy Pandy",
    category: "baby",
    score: 2,
    plasticScore: 2,
    material: "Bamboo topsheet, chlorine-free pulp, no fragrances",
    description: "Bamboo-based, fragrance-free, no parabens or phthalates. Dermatologist tested.",
    affiliateUrl: "https://www.amazon.com/s?k=Andy+Pandy+bamboo+diapers&tag=partiqule-20",
    price: "$20–28",
    tags: ["diaper", "diapers", "baby", "newborn", "infant", "toddler", "nappy", "bamboo", "clean"]
  },
  {
    id: "bk-008",
    name: "Healthybaby Diapers",
    brand: "Healthybaby",
    category: "baby",
    score: 2,
    plasticScore: 2,
    material: "USDA organic certified materials, TCF pulp, plant-based topsheet",
    description: "EWG verified. No fragrance, no lotion, no chlorine bleaching, no optical brighteners.",
    affiliateUrl: "https://www.amazon.com/s?k=Healthybaby+diapers&tag=partiqule-20",
    price: "$30–40",
    tags: ["diaper", "diapers", "baby", "newborn", "infant", "toddler", "nappy", "organic", "EWG", "clean"]
  },
  {
    id: "bk-009",
    name: "Kudos Diapers",
    brand: "Kudos",
    category: "baby",
    score: 3,
    plasticScore: 3,
    material: "100% cotton inner layer, TCF pulp, no fragrance",
    description: "Only diaper with a 100% cotton layer touching baby's skin. No fragrance, no lotion, no chlorine bleaching.",
    affiliateUrl: "https://www.amazon.com/s?k=Kudos+cotton+diapers&tag=partiqule-20",
    price: "$26–34",
    tags: ["diaper", "diapers", "baby", "newborn", "infant", "toddler", "nappy", "cotton", "clean"]
  },

  // ── FOOD & BEVERAGE (expanded) ───────────────────────────────
  {
    id: "fb-005",
    name: "W&P Porter Ceramic Mug",
    brand: "W&P",
    category: "food_beverage",
    plasticScore: 1,
    material: "Glazed ceramic with silicone lid",
    description: "Zero plastic contact with your drink, dishwasher safe",
    affiliateUrl: `https://www.amazon.com/s?k=W&P+W&P+Porter+Ceramic+Mug&tag=partiqule-20`,
    price: "$30–38",
    tags: ["mug", "coffee", "tea", "ceramic", "travel mug", "cup", "reusable", "to-go"]
  },
  {
    id: "fb-006",
    name: "Abeego Beeswax Wrap Set",
    brand: "Abeego",
    category: "food_beverage",
    plasticScore: 1,
    material: "Hemp, cotton, beeswax, tree resin, jojoba",
    description: "Breathable alternative to plastic wrap — keeps food fresh naturally",
    affiliateUrl: `https://www.amazon.com/s?k=Abeego+Abeego+Beeswax+Wrap+Set&tag=partiqule-20`,
    price: "$20–28",
    tags: ["food wrap", "beeswax", "plastic-free", "compostable", "cling wrap", "food storage"]
  },
  {
    id: "fb-007",
    name: "Hydro Flask Water Bottle",
    brand: "Hydro Flask",
    category: "food_beverage",
    plasticScore: 1,
    material: "18/8 pro-grade stainless steel",
    description: "Double-wall insulated, zero plastic touching your water",
    affiliateUrl: `https://www.amazon.com/s?k=Hydro+Flask+Hydro+Flask+Water+Bottle&tag=partiqule-20`,
    price: "$30–50",
    tags: ["water bottle", "stainless", "insulated", "reusable", "hydro flask", "bottle"]
  },
  {
    id: "fb-008",
    name: "Bamboo Loose Leaf Tea Infuser",
    brand: "Finum",
    category: "food_beverage",
    plasticScore: 1,
    material: "Stainless steel mesh, no plastic",
    description: "Use loose leaf tea instead of plastic mesh tea bags",
    affiliateUrl: `https://www.amazon.com/s?k=Finum+Bamboo+Loose+Leaf+Tea+Infuser&tag=partiqule-20`,
    price: "$8–14",
    tags: ["tea", "tea bag", "loose leaf", "infuser", "strainer", "lipton alternative", "plastic-free"]
  },
  {
    id: "fb-009",
    name: "Glass Food Storage Containers",
    brand: "Pyrex",
    category: "food_beverage",
    plasticScore: 1,
    material: "Borosilicate glass, BPA-free lids",
    description: "No plastic-food contact, oven and microwave safe",
    affiliateUrl: `https://www.amazon.com/s?k=Pyrex+Glass+Food+Storage+Containers&tag=partiqule-20`,
    price: "$25–45",
    tags: ["food storage", "container", "glass", "tupperware", "leftover", "meal prep", "microwave"]
  },
  {
    id: "fb-010",
    name: "Stainless Steel Lunch Box",
    brand: "PlanetBox",
    category: "food_beverage",
    plasticScore: 1,
    material: "18/8 stainless steel",
    description: "Zero plastic touching food, lasts decades not months",
    affiliateUrl: `https://www.amazon.com/s?k=PlanetBox+Stainless+Steel+Lunch+Box&tag=partiqule-20`,
    price: "$50–70",
    tags: ["lunch box", "bento", "stainless", "food container", "kids", "school lunch", "meal prep"]
  },
  {
    id: "fb-011",
    name: "Reusable Silicone Straw Set",
    brand: "FinalStraw",
    category: "food_beverage",
    plasticScore: 2,
    material: "Food-grade silicone, no BPA",
    description: "Collapses to pocket size, replaces thousands of plastic straws",
    affiliateUrl: `https://www.amazon.com/s?k=FinalStraw+Reusable+Silicone+Straw+Set&tag=partiqule-20`,
    price: "$15–20",
    tags: ["straw", "reusable", "silicone", "plastic-free", "smoothie", "drink"]
  },
  {
    id: "fb-012",
    name: "Compostable Coffee Pods",
    brand: "Tayst",
    category: "food_beverage",
    plasticScore: 2,
    material: "Certified compostable plant fiber",
    description: "100% compostable K-Cup alternative, no plastic pod",
    affiliateUrl: `https://www.amazon.com/s?k=compostable+coffee+pods&tag=partiqule-20`,
    price: "$18–24",
    tags: ["k-cup", "keurig", "coffee pod", "compostable", "coffee", "plastic-free"]
  },

  // ── PERSONAL CARE (expanded) ─────────────────────────────────
  {
    id: "pc-005",
    name: "Lush Shampoo Bar",
    brand: "Lush",
    category: "personal_care",
    plasticScore: 1,
    material: "Solid concentrated bar, minimal packaging",
    description: "Equivalent to 3 bottles of liquid shampoo, zero plastic bottle",
    affiliateUrl: `https://www.amazon.com/s?k=Lush+shampoo+bar&tag=partiqule-20`,
    price: "$12–16",
    tags: ["shampoo", "bar", "plastic-free", "hair", "lush", "solid shampoo"]
  },
  {
    id: "pc-006",
    name: "Bamboo Toothbrush",
    brand: "Brush with Bamboo",
    category: "personal_care",
    plasticScore: 1,
    material: "Bamboo handle, castor bean bristles",
    description: "Fully biodegradable handle, no plastic microfiber shedding",
    affiliateUrl: `https://www.amazon.com/s?k=Brush+with+Bamboo+Bamboo+Toothbrush&tag=partiqule-20`,
    price: "$5–9",
    tags: ["toothbrush", "bamboo", "dental", "oral care", "plastic-free", "biodegradable"]
  },
  {
    id: "pc-007",
    name: "Package Free Conditioner Bar",
    brand: "HiBar",
    category: "personal_care",
    plasticScore: 1,
    material: "Solid bar, paper packaging",
    description: "No plastic bottle, no sulfates, concentrated formula",
    affiliateUrl: `https://www.amazon.com/s?k=HiBar+conditioner+bar+plastic-free&tag=partiqule-20`,
    price: "$14–18",
    tags: ["conditioner", "bar", "plastic-free", "hair", "solid conditioner"]
  },
  {
    id: "pc-008",
    name: "Native Plastic-Free Deodorant",
    brand: "Native",
    category: "personal_care",
    plasticScore: 2,
    material: "Paper tube, natural ingredients",
    description: "Plastic-free packaging, no aluminum, no synthetic fragrance",
    affiliateUrl: `https://www.amazon.com/s?k=Native+plastic-free+deodorant&tag=partiqule-20`,
    price: "$12–15",
    tags: ["deodorant", "plastic-free", "natural", "paper", "aluminum-free", "native"]
  },
  {
    id: "pc-009",
    name: "Mineral Sunscreen by Badger",
    brand: "Badger",
    category: "personal_care",
    plasticScore: 2,
    material: "Aluminum tube, zinc oxide mineral UV filter",
    description: "No chemical UV filters, minimal plastic packaging",
    affiliateUrl: `https://www.amazon.com/s?k=Badger+Mineral+Sunscreen+by+Badger&tag=partiqule-20`,
    price: "$16–22",
    tags: ["sunscreen", "SPF", "mineral", "zinc oxide", "plastic-free", "reef-safe", "face"]
  },
  {
    id: "pc-010",
    name: "Olaplex Hair Serum (Glass)",
    brand: "Olaplex",
    category: "personal_care",
    plasticScore: 2,
    material: "Glass bottle, minimal plastic pump",
    description: "Bond-building treatment in glass — far less plastic than typical serums",
    affiliateUrl: `https://www.amazon.com/s?k=Olaplex+hair+serum+glass+bottle&tag=partiqule-20`,
    price: "$28–35",
    tags: ["hair serum", "hair treatment", "glass bottle", "serum", "hair care", "olaplex"]
  },
  {
    id: "pc-011",
    name: "Elate Cosmetics Foundation",
    brand: "Elate",
    category: "personal_care",
    plasticScore: 1,
    material: "Bamboo compact, refillable",
    description: "Refillable bamboo compact, no microplastic film-formers",
    affiliateUrl: `https://www.amazon.com/s?k=Elate+cosmetics+foundation+refillable&tag=partiqule-20`,
    price: "$32–40",
    tags: ["foundation", "makeup", "plastic-free", "bamboo", "refillable", "cosmetics", "face makeup"]
  },
  {
    id: "pc-012",
    name: "RMS Beauty Lip2Cheek",
    brand: "RMS Beauty",
    category: "personal_care",
    plasticScore: 2,
    material: "Recyclable pot packaging, no synthetic polymers",
    description: "Clean ingredients with no plastic microbeads or synthetic fillers",
    affiliateUrl: `https://www.amazon.com/s?k=RMS+Beauty+lip+cheek+cream&tag=partiqule-20`,
    price: "$36–44",
    tags: ["lipstick", "lip color", "blush", "makeup", "clean beauty", "cosmetics", "lipstick alternative"]
  },
  {
    id: "pc-013",
    name: "Dr. Bronner's Castile Soap Bar",
    brand: "Dr. Bronner's",
    category: "personal_care",
    plasticScore: 1,
    material: "Paper wrapped bar, organic ingredients",
    description: "Multi-use soap, zero plastic packaging, no synthetic fragrance",
    affiliateUrl: `https://www.amazon.com/s?k=Dr.+Bronners+Dr.+Bronners+Castile+Soap+Bar&tag=partiqule-20`,
    price: "$5–8",
    tags: ["soap", "body wash", "bar soap", "plastic-free", "organic", "face wash", "castile"]
  },
  {
    id: "pc-014",
    name: "Wet Brush with Bamboo Handle",
    brand: "Wet Brush",
    category: "personal_care",
    plasticScore: 2,
    material: "Bamboo handle, nylon bristles",
    description: "Significantly less plastic than full synthetic brushes",
    affiliateUrl: `https://www.amazon.com/s?k=bamboo+handle+hair+brush&tag=partiqule-20`,
    price: "$10–15",
    tags: ["hair brush", "brush", "bamboo", "detangle", "hair care", "wet brush"]
  },

  // ── KITCHEN (expanded) ────────────────────────────────────────
  {
    id: "kh-005",
    name: "Cast Iron Skillet by Lodge",
    brand: "Lodge",
    category: "kitchen",
    plasticScore: 1,
    material: "100% cast iron, pre-seasoned",
    description: "Lasts generations, zero plastic coating to shed into food",
    affiliateUrl: `https://www.amazon.com/s?k=Lodge+Cast+Iron+Skillet+by+Lodge&tag=partiqule-20`,
    price: "$25–45",
    tags: ["frying pan", "skillet", "cast iron", "cookware", "non-stick alternative", "pan", "oven safe"]
  },
  {
    id: "kh-006",
    name: "Stainless Steel Cookware Set",
    brand: "All-Clad",
    category: "kitchen",
    plasticScore: 1,
    material: "18/10 stainless steel, no coating",
    description: "No PFAS, no PTFE — safe at any temperature",
    affiliateUrl: `https://www.amazon.com/s?k=All-Clad+Stainless+Steel+Cookware+Set&tag=partiqule-20`,
    price: "$200–400",
    tags: ["cookware", "pot", "pan", "stainless", "non-stick alternative", "pfas-free", "oven safe", "cooking"]
  },
  {
    id: "kh-007",
    name: "Bamboo Cutting Board",
    brand: "Teakhaus",
    category: "kitchen",
    plasticScore: 1,
    material: "Solid bamboo, food-safe oil finish",
    description: "Plastic cutting boards shed microplastics with every cut — bamboo doesn't",
    affiliateUrl: `https://www.amazon.com/s?k=Teakhaus+Bamboo+Cutting+Board&tag=partiqule-20`,
    price: "$20–40",
    tags: ["cutting board", "chopping board", "bamboo", "kitchen", "plastic-free", "wood"]
  },
  {
    id: "kh-008",
    name: "Beeswax Wood Conditioner",
    brand: "Howard",
    category: "kitchen",
    plasticScore: 1,
    material: "Beeswax, carnauba wax, orange oil",
    description: "Conditions bamboo and wood cutting boards naturally",
    affiliateUrl: `https://www.amazon.com/s?k=Howard+Beeswax+Wood+Conditioner&tag=partiqule-20`,
    price: "$8–12",
    tags: ["cutting board", "wood conditioner", "bamboo", "kitchen care", "natural"]
  },
  {
    id: "kh-009",
    name: "Stainless Steel Mixing Bowls",
    brand: "Cuisinart",
    category: "kitchen",
    plasticScore: 1,
    material: "18/8 stainless steel",
    description: "No microplastic shedding vs plastic bowls, especially with acidic foods",
    affiliateUrl: `https://www.amazon.com/s?k=Cuisinart+Stainless+Steel+Mixing+Bowls&tag=partiqule-20`,
    price: "$20–35",
    tags: ["mixing bowl", "bowl", "stainless", "kitchen", "baking", "plastic alternative"]
  },
  {
    id: "kh-010",
    name: "Compostable Trash Bags",
    brand: "BioBag",
    category: "kitchen",
    plasticScore: 2,
    material: "Certified compostable Mater-Bi bioplastic",
    description: "Breaks down in 10–45 days vs 500 years for plastic bags",
    affiliateUrl: `https://www.amazon.com/s?k=BioBag+Compostable+Trash+Bags&tag=partiqule-20`,
    price: "$10–16",
    tags: ["trash bag", "garbage bag", "compostable", "plastic-free", "kitchen", "bin liner"]
  },
  {
    id: "kh-011",
    name: "Silicone Baking Mat",
    brand: "Silpat",
    category: "kitchen",
    plasticScore: 2,
    material: "Food-grade silicone, fiberglass mesh",
    description: "Replaces parchment paper and non-stick sprays indefinitely",
    affiliateUrl: `https://www.amazon.com/s?k=Silpat+Silicone+Baking+Mat&tag=partiqule-20`,
    price: "$20–30",
    tags: ["baking mat", "silicone mat", "baking", "kitchen", "oven", "cookie sheet", "parchment alternative"]
  },
  {
    id: "kh-012",
    name: "Glass Spray Bottle",
    brand: "Infinity Jars",
    category: "kitchen",
    plasticScore: 1,
    material: "Borosilicate glass, stainless spray nozzle",
    description: "Replaces plastic spray bottles for cleaning products",
    affiliateUrl: `https://www.amazon.com/s?k=glass+spray+bottle+refillable&tag=partiqule-20`,
    price: "$12–18",
    tags: ["spray bottle", "glass", "cleaning", "kitchen", "plastic-free", "refillable"]
  },
  {
    id: "kh-013",
    name: "Concentrated Cleaning Tablets",
    brand: "Blueland",
    category: "kitchen",
    plasticScore: 1,
    material: "Dissolvable tablet, paper packaging",
    description: "One tablet + water = full bottle of cleaner. Zero plastic packaging.",
    affiliateUrl:`https://www.amazon.com/s?k=Blueland+cleaning+tablets&tag=${AMAZON_TAG}`,
    price: "$14–22",
    tags: ["cleaner", "cleaning", "kitchen", "bathroom", "plastic-free", "blueland", "refill", "spray"]
  },
  {
    id: "kh-014",
    name: "Wooden Utensil Set",
    brand: "Bamber",
    category: "kitchen",
    plasticScore: 1,
    material: "Solid bamboo wood",
    description: "No plastic melting into hot food, naturally antimicrobial",
    affiliateUrl: `https://www.amazon.com/s?k=wooden+kitchen+utensil+set+bamboo&tag=partiqule-20`,
    price: "$12–20",
    tags: ["spatula", "spoon", "utensil", "cooking", "kitchen", "bamboo", "wooden spoon", "plastic-free"]
  },
  {
    id: "kh-015",
    name: "Glass Meal Prep Containers",
    brand: "Prep Naturals",
    category: "kitchen",
    plasticScore: 1,
    material: "Borosilicate glass, bamboo lids",
    description: "Safe to microwave without plastic leaching, stackable",
    affiliateUrl: `https://www.amazon.com/s?k=glass+meal+prep+containers+set&tag=partiqule-20`,
    price: "$35–50",
    tags: ["meal prep", "food storage", "glass", "container", "lunch", "microwave safe", "meal prep container"]
  },

  // ── CLOTHING (expanded) ───────────────────────────────────────
  {
    id: "ct-006",
    name: "Allbirds Wool Runner",
    brand: "Allbirds",
    category: "clothing",
    plasticScore: 3,
    material: "ZQ Merino wool, sugar cane sole",
    description: "Natural fiber upper, significantly less microplastic shedding than synthetic sneakers",
    affiliateUrl: `https://www.amazon.com/s?k=Allbirds+wool+runners&tag=partiqule-20`,
    price: "$110–130",
    tags: ["shoes", "sneakers", "wool", "natural", "running shoes", "trainers", "footwear"]
  },
  {
    id: "ct-007",
    name: "Hemp Yoga Pants",
    brand: "Rawganique",
    category: "clothing",
    plasticScore: 1,
    material: "100% organic hemp",
    description: "Zero synthetic fibers, no microplastic shedding during washtime",
    affiliateUrl: `https://www.amazon.com/s?k=hemp+organic+yoga+pants+women&tag=partiqule-20`,
    price: "$55–75",
    tags: ["yoga pants", "leggings", "hemp", "organic", "activewear", "workout", "women", "yoga"]
  },
  {
    id: "ct-008",
    name: "Organic Cotton Bra",
    brand: "Pact",
    category: "clothing",
    plasticScore: 2,
    material: "95% organic cotton, 5% spandex",
    description: "Minimal synthetic content vs typical 80%+ polyester/nylon bras",
    affiliateUrl: `https://www.amazon.com/s?k=Pact+organic+cotton+bra+women&tag=partiqule-20`,
    price: "$28–38",
    tags: ["bra", "bralette", "organic", "cotton", "women", "underwear", "lingerie"]
  },
  {
    id: "ct-009",
    name: "Merino Wool T-Shirt",
    brand: "Icebreaker",
    category: "clothing",
    plasticScore: 2,
    material: "100% merino wool",
    description: "Natural protein fiber — biodegradable, minimal microplastic shedding",
    affiliateUrl: `https://www.amazon.com/s?k=Icebreaker+merino+wool+t-shirt&tag=partiqule-20`,
    price: "$55–80",
    tags: ["t-shirt", "merino", "wool", "shirt", "natural fiber", "top", "men", "women"]
  },
  {
    id: "ct-010",
    name: "Organic Linen Shirt",
    brand: "Quince",
    category: "clothing",
    plasticScore: 1,
    material: "100% European linen",
    description: "Plant-based fiber, naturally breathable, zero synthetic microplastics",
    affiliateUrl: `https://www.amazon.com/s?k=organic+linen+shirt&tag=partiqule-20`,
    price: "$40–60",
    tags: ["shirt", "linen", "organic", "natural fiber", "summer", "men", "women", "button shirt"]
  },
  {
    id: "ct-011",
    name: "Cora Ball Microfiber Filter",
    brand: "Cora Ball",
    category: "clothing",
    plasticScore: 1,
    material: "Recycled plastic (ironically catches microplastics)",
    description: "Catches 26% of microfibers released during laundry — throw it in every wash",
    affiliateUrl: `https://www.amazon.com/s?k=Cora+Ball+Cora+Ball+Microfiber+Filter&tag=partiqule-20`,
    price: "$38",
    tags: ["laundry", "microfiber", "filter", "washing machine", "microplastic filter", "synthetic clothes"]
  },
  {
    id: "ct-012",
    name: "Organic Cotton Jeans",
    brand: "Outerknown",
    category: "clothing",
    plasticScore: 2,
    material: "98% organic cotton, 2% elastane",
    description: "Nearly all-natural vs conventional jeans with synthetic stretch",
    affiliateUrl: `https://www.amazon.com/s?k=organic+cotton+jeans&tag=partiqule-20`,
    price: "$138–158",
    tags: ["jeans", "denim", "organic", "cotton", "pants", "men", "women", "sustainable denim"]
  },
  {
    id: "ct-013",
    name: "Bamboo Pajama Set",
    brand: "Cariloha",
    category: "clothing",
    plasticScore: 2,
    material: "Bamboo viscose blend",
    description: "Soft, breathable, dramatically less plastic than polyester PJs",
    affiliateUrl: `https://www.amazon.com/s?k=bamboo+pajama+set&tag=partiqule-20`,
    price: "$60–80",
    tags: ["pajamas", "pjs", "sleepwear", "bamboo", "nightwear", "lounge", "men", "women"]
  },

  // ── BABY (expanded) ───────────────────────────────────────────
  {
    id: "bk-005",
    name: "Organic Cotton Baby Blanket",
    brand: "Burt's Bees Baby",
    category: "baby",
    plasticScore: 1,
    material: "100% GOTS-certified organic cotton",
    description: "No synthetic fibers near baby's skin during sleep",
    affiliateUrl: `https://www.amazon.com/s?k=organic+cotton+baby+blanket+GOTS&tag=partiqule-20`,
    price: "$18–28",
    tags: ["baby blanket", "blanket", "organic", "cotton", "infant", "newborn", "swaddle"]
  },
  {
    id: "bk-006",
    name: "Stainless Steel Sippy Cup",
    brand: "Pura Kiki",
    category: "baby",
    plasticScore: 1,
    material: "18/8 stainless steel, silicone nipple",
    description: "No BPA, no plastic touching liquid, grows with baby via interchangeable tops",
    affiliateUrl: `https://www.amazon.com/s?k=stainless+steel+sippy+cup+kids&tag=partiqule-20`,
    price: "$18–24",
    tags: ["sippy cup", "baby cup", "stainless", "toddler", "drinking cup", "infant cup", "water bottle baby"]
  },
  {
    id: "bk-007",
    name: "Wooden Baby Toys Set",
    brand: "Hape",
    category: "baby",
    plasticScore: 1,
    material: "FSC-certified wood, water-based paint",
    description: "No plastic off-gassing or microplastic shedding for chewing babies",
    affiliateUrl: `https://www.amazon.com/s?k=wooden+baby+toys+set+natural&tag=partiqule-20`,
    price: "$20–40",
    tags: ["baby toys", "toys", "wooden", "toddler toys", "infant toys", "plastic-free toys", "natural toys"]
  },
  {
    id: "bk-008",
    name: "Organic Cotton Baby Wrap",
    brand: "Solly Baby",
    category: "baby",
    plasticScore: 1,
    material: "100% TENCEL lyocell (eucalyptus)",
    description: "Plant-based fabric against baby's skin all day — no synthetic microplastics",
    affiliateUrl: `https://www.amazon.com/s?k=organic+cotton+baby+wrap+carrier&tag=partiqule-20`,
    price: "$70–90",
    tags: ["baby wrap", "baby carrier", "newborn", "infant", "organic", "babywearing", "sling"]
  },
  {
    id: "bk-009",
    name: "Glass Baby Food Jars",
    brand: "Wean Green",
    category: "baby",
    plasticScore: 1,
    material: "Borosilicate glass, stainless lids",
    description: "No plastic leaching into baby food when warming — crucial for infants",
    affiliateUrl: `https://www.amazon.com/s?k=glass+baby+food+storage+jars&tag=partiqule-20`,
    price: "$20–30",
    tags: ["baby food", "food storage", "glass", "infant", "weaning", "solid food", "puree container"]
  },
  {
    id: "bk-010",
    name: "Compostable Diapers",
    brand: "Dyper",
    category: "baby",
    plasticScore: 3,
    material: "Bamboo viscose, plant-based materials",
    description: "Dramatically less plastic than conventional diapers, certified compostable",
    affiliateUrl: `https://www.amazon.com/s?k=compostable+biodegradable+diapers&tag=partiqule-20`,
    price: "$45–60/month",
    tags: ["diapers", "nappies", "baby", "compostable", "eco diapers", "infant", "newborn", "bamboo diapers"]
  },

  // ── HOUSEHOLD & LIFESTYLE ─────────────────────────────────────
  {
    id: "hl-001",
    name: "Beeswax Candles",
    brand: "Big Dipper",
    category: "other",
    plasticScore: 1,
    material: "Pure beeswax, cotton wick",
    description: "Paraffin candles release plastic-like particles — beeswax burns clean",
    affiliateUrl: `https://www.amazon.com/s?k=pure+beeswax+candles+natural&tag=partiqule-20`,
    price: "$12–20",
    tags: ["candle", "beeswax", "natural", "plastic-free", "home", "clean burning"]
  },
  {
    id: "hl-002",
    name: "Wool Dryer Balls",
    brand: "Friendsheep",
    category: "other",
    plasticScore: 1,
    material: "100% New Zealand wool",
    description: "Replaces plastic dryer sheets that leave synthetic coating on fabrics",
    affiliateUrl: `https://www.amazon.com/s?k=Friendsheep+Wool+Dryer+Balls&tag=partiqule-20`,
    price: "$20–30",
    tags: ["dryer balls", "laundry", "dryer sheets alternative", "wool", "fabric softener", "natural"]
  },
  {
    id: "hl-003",
    name: "Stainless Steel Water Filter Pitcher",
    brand: "Clearly Filtered",
    category: "other",
    plasticScore: 2,
    material: "Stainless steel body, plastic-free filter media",
    description: "Removes 99.9% of microplastics from tap water",
    affiliateUrl: `https://www.amazon.com/s?k=stainless+steel+water+filter+pitcher&tag=partiqule-20`,
    price: "$80–120",
    tags: ["water filter", "pitcher", "microplastic filter", "clean water", "tap water", "filtration", "drinking water"]
  },
  {
    id: "hl-004",
    name: "Bamboo Toilet Paper",
    brand: "Who Gives A Crap",
    category: "other",
    plasticScore: 1,
    material: "Bamboo, no plastic wrap packaging",
    description: "Plastic-free packaging, no chlorine bleaching, faster-growing than trees",
    affiliateUrl: `https://www.amazon.com/s?k=bamboo+toilet+paper+plastic-free&tag=partiqule-20`,
    price: "$28–36/48 rolls",
    tags: ["toilet paper", "bamboo", "plastic-free", "eco", "bathroom", "tissue", "sustainable"]
  },
  {
    id: "hl-005",
    name: "Natural Yoga Mat",
    brand: "Manduka",
    category: "other",
    plasticScore: 2,
    material: "Natural tree rubber, no PVC",
    description: "PVC yoga mats shed microplastics during practice — natural rubber doesn't",
    affiliateUrl: `https://www.amazon.com/s?k=Manduka+Natural+Yoga+Mat&tag=partiqule-20`,
    price: "$80–120",
    tags: ["yoga mat", "mat", "natural rubber", "exercise", "fitness", "workout", "pilates", "yoga"]
  },
  {
    id: "hl-006",
    name: "Glass Water Filter Bottle",
    brand: "LifeStraw",
    category: "other",
    plasticScore: 1,
    material: "Borosilicate glass, activated carbon filter",
    description: "Filters microplastics from tap water on the go, zero plastic contact",
    affiliateUrl: `https://www.amazon.com/s?k=glass+water+filter+bottle&tag=partiqule-20`,
    price: "$40–55",
    tags: ["water bottle", "filter bottle", "glass", "microplastic filter", "travel", "filtered water"]
  },

  // ── ELECTRONICS & TECH ACCESSORIES ───────────────────────────
  {
    id: "el-001",
    name: "Braided Nylon USB-C Cable",
    brand: "Anker",
    category: "other",
    plasticScore: 3,
    material: "Braided nylon exterior, no PVC insulation",
    description: "PVC cables shed microplastics with heat — nylon braided is far safer",
    affiliateUrl: `https://www.amazon.com/s?k=braided+nylon+USB-C+cable&tag=partiqule-20`,
    price: "$12–18",
    tags: ["usb cable", "charging cable", "usb-c", "cable", "charger", "phone cable", "braided"]
  },
  {
    id: "el-002",
    name: "Pela Case Compostable Phone Case",
    brand: "Pela",
    category: "other",
    plasticScore: 2,
    material: "Flaxstic — flax shive and biopolymer",
    description: "100% compostable, breaks down in 3-5 years vs 1000 years for plastic",
    affiliateUrl:`https://www.amazon.com/s?k=Pela+case+compostable+phone+case&tag=${AMAZON_TAG}`,
    price: "$40–55",
    tags: ["phone case", "iphone case", "compostable", "plastic-free", "eco phone case", "biodegradable case"]
  },
  {
    id: "el-003",
    name: "Wooden Phone Stand",
    brand: "Oakywood",
    category: "other",
    plasticScore: 1,
    material: "Solid walnut wood, steel base",
    description: "No plastic components, natural material, lasts indefinitely",
    affiliateUrl: `https://www.amazon.com/s?k=wooden+phone+stand+desk&tag=partiqule-20`,
    price: "$35–50",
    tags: ["phone stand", "desk accessory", "wooden", "phone holder", "desk", "natural"]
  },
  {
    id: "el-004",
    name: "Cork Mouse Pad",
    brand: "Sigel",
    category: "other",
    plasticScore: 1,
    material: "Natural cork, no synthetic backing",
    description: "Rubber-backed plastic mouse pads shed microplastics — cork doesn't",
    affiliateUrl: `https://www.amazon.com/s?k=cork+mouse+pad+natural&tag=partiqule-20`,
    price: "$15–25",
    tags: ["mouse pad", "desk", "cork", "natural", "office", "computer accessory"]
  },
  {
    id: "el-005",
    name: "Wooden Keyboard and Mouse Set",
    brand: "Logitech",
    category: "other",
    plasticScore: 2,
    material: "FSC-certified wood panels, recycled plastic base",
    description: "Significantly reduced virgin plastic vs conventional keyboards",
    affiliateUrl: `https://www.amazon.com/s?k=wooden+keyboard+mouse+set&tag=partiqule-20`,
    price: "$80–120",
    tags: ["keyboard", "mouse", "wooden", "office", "computer", "desk", "natural material"]
  },
  {
    id: "el-006",
    name: "Bamboo Laptop Stand",
    brand: "Rain Design",
    category: "other",
    plasticScore: 1,
    material: "Solid bamboo",
    description: "No plastic, naturally heat-resistant, adjustable height",
    affiliateUrl: `https://www.amazon.com/s?k=bamboo+laptop+stand+adjustable&tag=partiqule-20`,
    price: "$30–45",
    tags: ["laptop stand", "bamboo", "desk", "computer", "ergonomic", "natural", "office"]
  },
  {
    id: "el-007",
    name: "Recycled Plastic Earbuds",
    brand: "House of Marley",
    category: "other",
    plasticScore: 3,
    material: "Recycled plastic, bamboo accents",
    description: "Made from recycled materials — still contains plastic but responsible sourcing",
    affiliateUrl: `https://www.amazon.com/s?k=recycled+plastic+earbuds+sustainable&tag=partiqule-20`,
    price: "$30–50",
    tags: ["earbuds", "headphones", "recycled", "music", "audio", "eco headphones"]
  },
  {
    id: "el-008",
    name: "Solar Power Bank",
    brand: "Blavor",
    category: "other",
    plasticScore: 3,
    material: "Recycled ABS plastic, solar panel",
    description: "Solar-powered reduces grid energy; better lifecycle than disposable batteries",
    affiliateUrl: `https://www.amazon.com/s?k=solar+power+bank+portable+charger&tag=partiqule-20`,
    price: "$35–50",
    tags: ["power bank", "solar", "charger", "battery", "portable charger", "solar charger"]
  },

  // ── PET PRODUCTS ──────────────────────────────────────────────
  {
    id: "pt-001",
    name: "Stainless Steel Dog Bowl",
    brand: "AmazonBasics",
    category: "other",
    plasticScore: 1,
    material: "18/8 stainless steel",
    description: "Plastic pet bowls leach BPA and phthalates into food — stainless doesn't",
    affiliateUrl: `https://www.amazon.com/s?k=stainless+steel+dog+bowl+heavy+duty&tag=partiqule-20`,
    price: "$8–15",
    tags: ["dog bowl", "pet bowl", "cat bowl", "stainless", "pet", "dog", "cat", "food bowl"]
  },
  {
    id: "pt-002",
    name: "Ceramic Pet Food Bowl",
    brand: "Ethical Pet",
    category: "other",
    plasticScore: 1,
    material: "Lead-free glazed ceramic",
    description: "No plastic leaching, dishwasher safe, doesn't harbor bacteria like plastic",
    affiliateUrl: `https://www.amazon.com/s?k=ceramic+pet+food+bowl+dog+cat&tag=partiqule-20`,
    price: "$10–18",
    tags: ["pet bowl", "dog bowl", "cat bowl", "ceramic", "pet", "food bowl", "water bowl"]
  },
  {
    id: "pt-003",
    name: "Hemp Dog Leash",
    brand: "Molly Mutt",
    category: "other",
    plasticScore: 1,
    material: "100% natural hemp rope",
    description: "Nylon leashes shed microplastics with wear — hemp is fully biodegradable",
    affiliateUrl: `https://www.amazon.com/s?k=hemp+dog+leash+natural&tag=partiqule-20`,
    price: "$15–22",
    tags: ["dog leash", "leash", "hemp", "natural", "pet", "dog", "biodegradable leash"]
  },
  {
    id: "pt-004",
    name: "Organic Cotton Dog Bed",
    brand: "West Paw",
    category: "other",
    plasticScore: 2,
    material: "Organic cotton cover, recycled fill",
    description: "No polyester cover shedding microplastics — organic cotton is skin-safe",
    affiliateUrl: `https://www.amazon.com/s?k=organic+cotton+dog+bed+washable&tag=partiqule-20`,
    price: "$40–80",
    tags: ["dog bed", "pet bed", "organic", "cotton", "pet", "dog", "cat bed"]
  },
  {
    id: "pt-005",
    name: "Natural Rubber Dog Toy",
    brand: "Kong",
    category: "other",
    plasticScore: 2,
    material: "100% natural rubber",
    description: "Natural rubber toys don't break down into microplastics like cheap vinyl toys",
    affiliateUrl: `https://www.amazon.com/s?k=Kong+Natural+Rubber+Dog+Toy&tag=partiqule-20`,
    price: "$10–18",
    tags: ["dog toy", "pet toy", "rubber", "natural", "chew toy", "kong", "dog", "pet"]
  },
  {
    id: "pt-006",
    name: "Compostable Dog Waste Bags",
    brand: "Earth Rated",
    category: "other",
    plasticScore: 2,
    material: "Certified compostable plant starch",
    description: "Conventional plastic poop bags take 1000 years — compostable breaks down in weeks",
    affiliateUrl: `https://www.amazon.com/s?k=Earth+Rated+Compostable+Dog+Waste+Bags&tag=partiqule-20`,
    price: "$12–18",
    tags: ["dog bags", "poop bags", "compostable", "pet", "dog", "waste bags", "biodegradable bags"]
  },
  {
    id: "pt-007",
    name: "Bamboo Cat Litter",
    brand: "Ökocat",
    category: "other",
    plasticScore: 1,
    material: "Natural wood fiber, no synthetic fragrance",
    description: "Clay litters contain synthetic chemicals — plant-based is safer for cats and humans",
    affiliateUrl: `https://www.amazon.com/s?k=bamboo+cat+litter+natural&tag=partiqule-20`,
    price: "$18–28",
    tags: ["cat litter", "litter", "bamboo", "natural", "cat", "pet", "biodegradable litter"]
  },
  {
    id: "pt-008",
    name: "Stainless Steel Pet Water Fountain",
    brand: "Pioneer Pet",
    category: "other",
    plasticScore: 2,
    material: "Stainless steel basin, minimal plastic pump",
    description: "Plastic fountains leach into water — stainless is much safer for pets",
    affiliateUrl: `https://www.amazon.com/s?k=Pioneer+Pet+Stainless+Steel+Pet+Water+Fountain&tag=partiqule-20`,
    price: "$35–55",
    tags: ["pet fountain", "cat fountain", "dog water", "stainless", "pet", "water fountain"]
  },

  // ── OFFICE & STATIONERY ───────────────────────────────────────
  {
    id: "of-001",
    name: "Recycled Paper Notebooks",
    brand: "Decomposition Book",
    category: "other",
    plasticScore: 1,
    material: "100% post-consumer recycled paper, no plastic cover",
    description: "No plastic cover or binding — pure paper, fully recyclable",
    affiliateUrl: `https://www.amazon.com/s?k=recycled+paper+notebook+eco-friendly&tag=partiqule-20`,
    price: "$9–14",
    tags: ["notebook", "journal", "recycled paper", "office", "stationery", "plastic-free", "writing"]
  },
  {
    id: "of-002",
    name: "Refillable Fountain Pen",
    brand: "Lamy",
    category: "other",
    plasticScore: 2,
    material: "ABS body, steel nib — refillable indefinitely",
    description: "One fountain pen replaces thousands of disposable plastic ballpoints",
    affiliateUrl: `https://www.amazon.com/s?k=Lamy+Refillable+Fountain+Pen&tag=partiqule-20`,
    price: "$25–35",
    tags: ["pen", "fountain pen", "refillable", "office", "writing", "stationery", "plastic-free pen"]
  },
  {
    id: "of-003",
    name: "Beeswax Pencils",
    brand: "Faber-Castell",
    category: "other",
    plasticScore: 1,
    material: "Wood barrel, graphite core — no plastic",
    description: "Wooden pencils are fully plastic-free vs mechanical plastic pencils",
    affiliateUrl: `https://www.amazon.com/s?k=Faber-Castell+Beeswax+Pencils&tag=partiqule-20`,
    price: "$5–10",
    tags: ["pencil", "wooden pencil", "office", "stationery", "writing", "plastic-free", "school"]
  },
  {
    id: "of-004",
    name: "Cork Bulletin Board",
    brand: "Quartet",
    category: "other",
    plasticScore: 1,
    material: "Natural cork, wood frame",
    description: "Plastic foam boards vs natural cork — cork is fully biodegradable",
    affiliateUrl: `https://www.amazon.com/s?k=Quartet+Cork+Bulletin+Board&tag=partiqule-20`,
    price: "$20–40",
    tags: ["bulletin board", "cork board", "office", "cork", "natural", "desk", "pinboard"]
  },
  {
    id: "of-005",
    name: "Glass Whiteboard",
    brand: "Quartet",
    category: "other",
    plasticScore: 1,
    material: "Tempered glass surface, aluminum frame",
    description: "Melamine whiteboards shed microplastics when erased — glass doesn't",
    affiliateUrl: `https://www.amazon.com/s?k=glass+whiteboard+frameless&tag=partiqule-20`,
    price: "$60–120",
    tags: ["whiteboard", "glass board", "office", "writing board", "glass", "dry erase"]
  },
  {
    id: "of-006",
    name: "Bamboo Desk Organizer",
    brand: "SimpleHouseware",
    category: "other",
    plasticScore: 1,
    material: "100% bamboo",
    description: "Replaces plastic desk organizers with natural, biodegradable bamboo",
    affiliateUrl: `https://www.amazon.com/s?k=bamboo+desk+organizer+office&tag=partiqule-20`,
    price: "$18–28",
    tags: ["desk organizer", "office organizer", "bamboo", "desk", "stationery holder", "natural"]
  },
  {
    id: "of-007",
    name: "Recycled Cardboard Binders",
    brand: "Avery",
    category: "other",
    plasticScore: 2,
    material: "Recycled cardboard, no PVC cover",
    description: "PVC binders shed microplastics with handling — recycled cardboard doesn't",
    affiliateUrl: `https://www.amazon.com/s?k=recycled+cardboard+binder&tag=partiqule-20`,
    price: "$8–15",
    tags: ["binder", "folder", "office", "recycled", "cardboard", "stationery", "documents"]
  },
  {
    id: "of-008",
    name: "Natural Rubber Eraser",
    brand: "Staedtler",
    category: "other",
    plasticScore: 1,
    material: "Natural rubber, no PVC",
    description: "PVC erasers leave plastic residue — natural rubber erases cleanly",
    affiliateUrl: `https://www.amazon.com/s?k=natural+rubber+eraser&tag=partiqule-20`,
    price: "$3–6",
    tags: ["eraser", "natural rubber", "office", "stationery", "school", "pvc-free"]
  },

  // ── SPORTS & OUTDOOR ──────────────────────────────────────────
  {
    id: "sp-001",
    name: "Stainless Steel Sports Bottle",
    brand: "Yeti",
    category: "food_beverage",
    plasticScore: 1,
    material: "18/8 stainless steel, no plastic lining",
    description: "Insulated stainless — zero plastic contact with your drink ever",
    affiliateUrl: `https://www.amazon.com/s?k=stainless+steel+sports+water+bottle&tag=partiqule-20`,
    price: "$35–50",
    tags: ["sports bottle", "water bottle", "yeti", "stainless", "gym", "workout", "insulated"]
  },
  {
    id: "sp-002",
    name: "Natural Rubber Resistance Bands",
    brand: "Theraband",
    category: "other",
    plasticScore: 2,
    material: "Natural latex rubber",
    description: "Synthetic rubber bands shed microplastics — natural latex is biodegradable",
    affiliateUrl: `https://www.amazon.com/s?k=natural+rubber+resistance+bands+latex-free&tag=partiqule-20`,
    price: "$15–30",
    tags: ["resistance bands", "exercise bands", "gym", "workout", "fitness", "natural rubber", "latex"]
  },
  {
    id: "sp-003",
    name: "Cork Yoga Block",
    brand: "Gaiam",
    category: "other",
    plasticScore: 1,
    material: "Natural cork",
    description: "Foam yoga blocks shed microplastics — cork is naturally antimicrobial and biodegradable",
    affiliateUrl: `https://www.amazon.com/s?k=cork+yoga+block+natural&tag=partiqule-20`,
    price: "$12–20",
    tags: ["yoga block", "cork", "yoga", "fitness", "natural", "exercise prop"]
  },
  {
    id: "sp-004",
    name: "Organic Cotton Gym Towel",
    brand: "Cariloha",
    category: "clothing",
    plasticScore: 1,
    material: "100% organic cotton",
    description: "Microfiber gym towels shed synthetic particles — cotton towels don't",
    affiliateUrl: `https://www.amazon.com/s?k=organic+cotton+gym+towel&tag=partiqule-20`,
    price: "$18–28",
    tags: ["gym towel", "towel", "organic cotton", "workout", "fitness", "sport towel"]
  },
  {
    id: "sp-005",
    name: "Natural Chalk for Climbing",
    brand: "Black Diamond",
    category: "other",
    plasticScore: 1,
    material: "Magnesium carbonate, cotton chalk bag",
    description: "Pure mineral chalk — no synthetic additives or plastic packaging",
    affiliateUrl: `https://www.amazon.com/s?k=natural+chalk+climbing+gym&tag=partiqule-20`,
    price: "$8–15",
    tags: ["climbing chalk", "chalk", "climbing", "gym", "natural", "magnesium", "sports"]
  },
  {
    id: "sp-006",
    name: "Stainless Steel Protein Shaker",
    brand: "Hydra Cup",
    category: "food_beverage",
    plasticScore: 1,
    material: "18/8 stainless steel, silicone seal",
    description: "Plastic shakers leach BPA and phthalates into your protein shake",
    affiliateUrl: `https://www.amazon.com/s?k=stainless+steel+protein+shaker+bottle&tag=partiqule-20`,
    price: "$22–32",
    tags: ["shaker bottle", "protein shaker", "gym", "stainless", "workout", "fitness", "blender bottle"]
  },
  {
    id: "sp-007",
    name: "Hemp Gym Bag",
    brand: "Rawganique",
    category: "clothing",
    plasticScore: 1,
    material: "100% hemp canvas",
    description: "Nylon and polyester gym bags shed microplastics — hemp canvas doesn't",
    affiliateUrl: `https://www.amazon.com/s?k=hemp+canvas+gym+bag&tag=partiqule-20`,
    price: "$45–65",
    tags: ["gym bag", "sports bag", "hemp", "canvas", "natural", "bag", "duffel bag"]
  },
  {
    id: "sp-008",
    name: "Wool Running Socks",
    brand: "Darn Tough",
    category: "clothing",
    plasticScore: 2,
    material: "Merino wool, nylon reinforcement",
    description: "Mostly natural fiber vs 100% synthetic athletic socks — dramatically less shedding",
    affiliateUrl: `https://www.amazon.com/s?k=merino+wool+running+socks&tag=partiqule-20`,
    price: "$18–24",
    tags: ["running socks", "athletic socks", "wool", "merino", "socks", "sport", "hiking socks"]
  },

  // ── HOME TEXTILES ─────────────────────────────────────────────
  {
    id: "ht-001",
    name: "Organic Cotton Bed Sheets",
    brand: "Parachute",
    category: "clothing",
    plasticScore: 1,
    material: "GOTS-certified 100% organic cotton",
    description: "Polyester sheets shed microplastics while you sleep 8 hours — cotton doesn't",
    affiliateUrl: `https://www.amazon.com/s?k=organic+cotton+bed+sheets+GOTS+certified&tag=partiqule-20`,
    price: "$100–180",
    tags: ["bed sheets", "bedding", "organic cotton", "sheets", "bed", "bedroom", "sleep"]
  },
  {
    id: "ht-002",
    name: "Linen Duvet Cover",
    brand: "Cultiver",
    category: "clothing",
    plasticScore: 1,
    material: "100% French linen",
    description: "Linen is plant-based — polyester duvets shed millions of microfibers in the wash",
    affiliateUrl: `https://www.amazon.com/s?k=linen+duvet+cover+natural&tag=partiqule-20`,
    price: "$120–200",
    tags: ["duvet cover", "bedding", "linen", "natural fiber", "bed", "bedroom", "comforter cover"]
  },
  {
    id: "ht-003",
    name: "Organic Cotton Towels",
    brand: "Brooklinen",
    category: "clothing",
    plasticScore: 1,
    material: "100% organic Turkish cotton",
    description: "Microfiber towels shed synthetic particles — organic cotton is plastic-free",
    affiliateUrl: `https://www.amazon.com/s?k=organic+cotton+bath+towels&tag=partiqule-20`,
    price: "$20–40",
    tags: ["towel", "bath towel", "organic cotton", "bathroom", "towels", "shower"]
  },
  {
    id: "ht-004",
    name: "Wool Blanket",
    brand: "Pendleton",
    category: "clothing",
    plasticScore: 2,
    material: "100% virgin wool",
    description: "Acrylic and fleece blankets shed huge amounts of microplastics — wool is natural",
    affiliateUrl: `https://www.amazon.com/s?k=wool+throw+blanket+natural&tag=partiqule-20`,
    price: "$80–150",
    tags: ["blanket", "throw", "wool", "natural", "bedroom", "living room", "cozy", "fleece alternative"]
  },
  {
    id: "ht-005",
    name: "Organic Cotton Pillow",
    brand: "Avocado Green",
    category: "other",
    plasticScore: 2,
    material: "Organic cotton shell, natural latex fill",
    description: "Synthetic pillows shed polyester microfibers all night — natural latex doesn't",
    affiliateUrl: `https://www.amazon.com/s?k=organic+cotton+pillow+GOTS&tag=partiqule-20`,
    price: "$60–100",
    tags: ["pillow", "organic", "latex", "natural", "sleep", "bedroom", "cotton pillow"]
  },
  {
    id: "ht-006",
    name: "Linen Table Cloth",
    brand: "LinenMe",
    category: "other",
    plasticScore: 1,
    material: "100% European linen",
    description: "Polyester tablecloths shed microplastics near food — linen is plant-based",
    affiliateUrl: `https://www.amazon.com/s?k=linen+tablecloth+natural&tag=partiqule-20`,
    price: "$30–60",
    tags: ["tablecloth", "table cloth", "linen", "dining", "kitchen", "natural", "home"]
  },
  {
    id: "ht-007",
    name: "Organic Cotton Bath Mat",
    brand: "Kassatex",
    category: "other",
    plasticScore: 1,
    material: "100% organic cotton",
    description: "Synthetic bath mats shed microplastics in every wash — cotton stays clean",
    affiliateUrl: `https://www.amazon.com/s?k=organic+cotton+bath+mat&tag=partiqule-20`,
    price: "$25–45",
    tags: ["bath mat", "bathroom", "organic cotton", "mat", "shower mat", "rug"]
  },
  {
    id: "ht-008",
    name: "Jute Area Rug",
    brand: "nuLOOM",
    category: "other",
    plasticScore: 1,
    material: "100% natural jute fiber",
    description: "Synthetic rugs are one of the largest sources of indoor microplastic pollution",
    affiliateUrl: `https://www.amazon.com/s?k=jute+area+rug+natural+fiber&tag=partiqule-20`,
    price: "$50–150",
    tags: ["rug", "area rug", "jute", "natural fiber", "living room", "bedroom", "carpet"]
  },
  {
    id: "ht-009",
    name: "Organic Cotton Shower Curtain",
    brand: "Coyuchi",
    category: "other",
    plasticScore: 1,
    material: "100% organic cotton",
    description: "PVC and PEVA shower curtains off-gas chemicals — cotton is safe and washable",
    affiliateUrl: `https://www.amazon.com/s?k=organic+cotton+shower+curtain+GOTS&tag=partiqule-20`,
    price: "$40–70",
    tags: ["shower curtain", "bathroom", "organic cotton", "curtain", "pvc-free", "plastic-free curtain"]
  },

  // ── FOOD BRANDS & PACKAGING ───────────────────────────────────
  {
    id: "fd-001",
    name: "Glass Jar Peanut Butter",
    brand: "MaraNatha",
    category: "food_beverage",
    plasticScore: 1,
    material: "Glass jar, metal lid",
    description: "Plastic peanut butter jars leach into fatty oils — glass is completely inert",
    affiliateUrl: `https://www.amazon.com/s?k=MaraNatha+Glass+Jar+Peanut+Butter&tag=partiqule-20`,
    price: "$8–12",
    tags: ["peanut butter", "nut butter", "glass jar", "food", "grocery", "plastic-free food"]
  },
  {
    id: "fd-002",
    name: "Loose Leaf Organic Tea",
    brand: "Harney & Sons",
    category: "food_beverage",
    plasticScore: 1,
    material: "Tin canister, no plastic mesh bags",
    description: "Direct replacement for plastic-mesh tea bags — loose leaf has zero plastic",
    affiliateUrl: `https://www.amazon.com/s?k=Harney+&+Sons+Loose+Leaf+Organic+Tea&tag=partiqule-20`,
    price: "$10–16",
    tags: ["tea", "loose leaf tea", "tea bags alternative", "lipton alternative", "organic tea", "tin"]
  },
  {
    id: "fd-003",
    name: "Glass Bottle Olive Oil",
    brand: "California Olive Ranch",
    category: "food_beverage",
    plasticScore: 1,
    material: "Dark glass bottle",
    description: "Plastic olive oil containers leach phthalates into oil — glass is inert",
    affiliateUrl: `https://www.amazon.com/s?k=California+Olive+Ranch+Glass+Bottle+Olive+Oil&tag=partiqule-20`,
    price: "$12–18",
    tags: ["olive oil", "cooking oil", "glass bottle", "food", "grocery", "kitchen"]
  },
  {
    id: "fd-004",
    name: "Cardboard Packaged Oats",
    brand: "Bob's Red Mill",
    category: "food_beverage",
    plasticScore: 1,
    material: "Paper bag, no plastic liner",
    description: "Most cereal bags have plastic liners — paper-packaged oats have none",
    affiliateUrl: `https://www.amazon.com/s?k=Bobs+Red+Mill+Cardboard+Packaged+Oats&tag=partiqule-20`,
    price: "$6–10",
    tags: ["oats", "oatmeal", "cereal", "breakfast", "paper packaging", "grocery", "food"]
  },
  {
    id: "fd-005",
    name: "Canned Wild Salmon",
    brand: "Wild Planet",
    category: "food_beverage",
    plasticScore: 2,
    material: "BPA-free steel can",
    description: "BPA-free canned fish — far better than pouches with plastic lining",
    affiliateUrl: `https://www.amazon.com/s?k=Wild+Planet+Canned+Wild+Salmon&tag=partiqule-20`,
    price: "$8–14",
    tags: ["salmon", "canned fish", "bpa-free", "food", "protein", "grocery", "tuna alternative"]
  },
  {
    id: "fd-006",
    name: "Glass Bottle Kombucha",
    brand: "GT's Living Foods",
    category: "food_beverage",
    plasticScore: 1,
    material: "Glass bottle, metal lid",
    description: "Bottled drinks in glass have zero plastic migration risk vs PET bottles",
    affiliateUrl: `https://www.amazon.com/s?k=kombucha+glass+bottle+organic&tag=partiqule-20`,
    price: "$3–5",
    tags: ["kombucha", "drink", "glass bottle", "probiotic", "beverage", "plastic-free drink"]
  },
  {
    id: "fd-007",
    name: "Paper Packaged Coffee",
    brand: "Death Wish Coffee",
    category: "food_beverage",
    plasticScore: 2,
    material: "Kraft paper bag with valve",
    description: "Paper-lined bags over plastic bags — degrades naturally after use",
    affiliateUrl: `https://www.amazon.com/s?k=Death+Wish+Coffee+Paper+Packaged+Coffee&tag=partiqule-20`,
    price: "$18–24",
    tags: ["coffee", "coffee beans", "ground coffee", "paper bag", "keurig alternative", "plastic-free coffee"]
  },
  {
    id: "fd-008",
    name: "Glass Bottle Maple Syrup",
    brand: "Coombs Family Farms",
    category: "food_beverage",
    plasticScore: 1,
    material: "Glass bottle, metal lid",
    description: "Plastic maple syrup bottles leach into the sweet, acidic liquid over time",
    affiliateUrl: `https://www.amazon.com/s?k=Coombs+Family+Farms+Glass+Bottle+Maple+Syrup&tag=partiqule-20`,
    price: "$12–18",
    tags: ["maple syrup", "syrup", "glass bottle", "food", "breakfast", "grocery", "sweetener"]
  },

  // ── CLEANING PRODUCTS ─────────────────────────────────────────
  {
    id: "cl-001",
    name: "Castile Soap Cleaning Spray",
    brand: "Dr. Bronner's",
    category: "kitchen",
    plasticScore: 2,
    material: "Recycled HDPE bottle, plant-based formula",
    description: "Concentrated plant soap — one bottle makes many spray bottles of cleaner",
    affiliateUrl: `https://www.amazon.com/s?k=Dr.+Bronners+Castile+Soap+Cleaning+Spray&tag=partiqule-20`,
    price: "$10–16",
    tags: ["cleaning spray", "cleaner", "castile", "natural cleaner", "kitchen", "bathroom", "all purpose"]
  },
  {
    id: "cl-002",
    name: "Seventh Generation Dish Soap",
    brand: "Seventh Generation",
    category: "kitchen",
    plasticScore: 2,
    material: "Recycled bottle, plant-based surfactants",
    description: "No synthetic fragrance, recycled packaging vs virgin plastic",
    affiliateUrl: `https://www.amazon.com/s?k=Seventh+Generation+Seventh+Generation+Dish+Soap&tag=partiqule-20`,
    price: "$5–9",
    tags: ["dish soap", "dishwashing", "natural", "kitchen", "seventh generation", "eco dish soap"]
  },
  {
    id: "cl-003",
    name: "Grove Cleaning Concentrate",
    brand: "Grove Collaborative",
    category: "kitchen",
    plasticScore: 1,
    material: "Glass bottle concentrate, no plastic packaging",
    description: "Add water to concentrates — eliminates 90% of plastic from cleaning products",
    affiliateUrl:`https://www.amazon.com/s?k=Grove+Collaborative+concentrate+cleaner&tag=${AMAZON_TAG}`,
    price: "$8–14",
    tags: ["cleaning concentrate", "cleaner", "glass", "plastic-free", "kitchen", "bathroom", "eco cleaner"]
  },
  {
    id: "cl-004",
    name: "Natural Pumice Stone Scrubber",
    brand: "Pumie",
    category: "kitchen",
    plasticScore: 1,
    material: "Natural volcanic pumice",
    description: "Synthetic scrubbers shed plastic particles — pumice stone is a natural mineral",
    affiliateUrl: `https://www.amazon.com/s?k=Pumie+Natural+Pumice+Stone+Scrubber&tag=partiqule-20`,
    price: "$5–10",
    tags: ["scrubber", "sponge alternative", "pumice", "natural", "cleaning", "toilet scrubber", "kitchen"]
  },
  {
    id: "cl-005",
    name: "Laundry Stripping Mineral Kit",
    brand: "RLR",
    category: "kitchen",
    plasticScore: 1,
    material: "Mineral powder, paper packaging",
    description: "Removes built-up synthetic detergent residue from fabrics — packaged in paper",
    affiliateUrl: `https://www.amazon.com/s?k=laundry+stripping+mineral+powder&tag=partiqule-20`,
    price: "$6–10",
    tags: ["laundry", "washing", "mineral", "paper packaging", "clothes", "detergent alternative"]
  },
  {
    id: "cl-006",
    name: "Enzyme Drain Cleaner",
    brand: "Green Gobbler",
    category: "kitchen",
    plasticScore: 2,
    material: "Enzyme-based formula, recycled bottle",
    description: "Chemical drain cleaners in plastic bottles vs enzyme-based in recycled packaging",
    affiliateUrl: `https://www.amazon.com/s?k=enzyme+drain+cleaner+natural&tag=partiqule-20`,
    price: "$12–18",
    tags: ["drain cleaner", "cleaning", "enzyme", "natural", "kitchen", "bathroom", "drain"]
  },

  // ── BATHROOM ACCESSORIES ──────────────────────────────────────
  {
    id: "ba-001",
    name: "Bamboo Toilet Brush",
    brand: "Brush It On",
    category: "other",
    plasticScore: 1,
    material: "Bamboo handle, plant-fiber bristles",
    description: "Plastic toilet brushes shed microplastics — bamboo is fully compostable",
    affiliateUrl: `https://www.amazon.com/s?k=bamboo+toilet+brush+set&tag=partiqule-20`,
    price: "$12–18",
    tags: ["toilet brush", "bathroom", "bamboo", "cleaning", "plastic-free", "natural"]
  },
  {
    id: "ba-002",
    name: "Glass Soap Dispenser",
    brand: "Blomus",
    category: "other",
    plasticScore: 1,
    material: "Borosilicate glass, stainless pump",
    description: "Refillable glass dispenser eliminates endless plastic soap bottles",
    affiliateUrl: `https://www.amazon.com/s?k=glass+soap+dispenser+pump&tag=partiqule-20`,
    price: "$18–28",
    tags: ["soap dispenser", "bathroom", "glass", "refillable", "plastic-free", "kitchen", "hand soap"]
  },
  {
    id: "ba-003",
    name: "Bamboo Toothbrush Holder",
    brand: "Bambu",
    category: "other",
    plasticScore: 1,
    material: "100% bamboo",
    description: "Replaces plastic bathroom accessories with natural bamboo",
    affiliateUrl: `https://www.amazon.com/s?k=bamboo+toothbrush+holder+bathroom&tag=partiqule-20`,
    price: "$10–16",
    tags: ["toothbrush holder", "bathroom", "bamboo", "natural", "bathroom accessory", "plastic-free"]
  },
  {
    id: "ba-004",
    name: "Natural Loofah Sponge",
    brand: "Aquis",
    category: "personal_care",
    plasticScore: 1,
    material: "100% natural loofah gourd",
    description: "Synthetic shower poufs shed enormous amounts of microplastics — loofah is a plant",
    affiliateUrl: `https://www.amazon.com/s?k=Aquis+Natural+Loofah+Sponge&tag=partiqule-20`,
    price: "$4–8",
    tags: ["loofah", "shower sponge", "bath sponge", "natural", "body wash", "shower", "exfoliate"]
  },
  {
    id: "ba-005",
    name: "Silk Dental Floss",
    brand: "Radius",
    category: "personal_care",
    plasticScore: 1,
    material: "Natural silk, candelilla wax, glass dispenser",
    description: "Nylon dental floss = microplastics in your mouth daily — silk is plastic-free",
    affiliateUrl: `https://www.amazon.com/s?k=Radius+Silk+Dental+Floss&tag=partiqule-20`,
    price: "$8–12",
    tags: ["dental floss", "floss", "silk", "oral care", "natural", "plastic-free", "dental"]
  },
  {
    id: "ba-006",
    name: "Glass Mouthwash Bottle",
    brand: "Uncle Harry's",
    category: "personal_care",
    plasticScore: 1,
    material: "Glass bottle, natural formula",
    description: "Plastic mouthwash bottles leach into the liquid — glass is completely inert",
    affiliateUrl: `https://www.amazon.com/s?k=glass+mouthwash+bottle+dispenser&tag=partiqule-20`,
    price: "$10–16",
    tags: ["mouthwash", "oral care", "glass", "natural", "dental", "plastic-free", "mouth rinse"]
  },

  // ── FOOD STORAGE EXTRAS ───────────────────────────────────────
  {
    id: "fs-001",
    name: "Beeswax Bowl Covers",
    brand: "Bee's Wrap",
    category: "food_beverage",
    plasticScore: 1,
    material: "Organic cotton, beeswax, jojoba oil, tree resin",
    description: "Stretchy, reusable covers for bowls — replaces plastic wrap completely",
    affiliateUrl: `https://www.amazon.com/s?k=beeswax+bowl+covers+set&tag=partiqule-20`,
    price: "$14–18",
    tags: ["bowl cover", "food cover", "beeswax", "plastic wrap alternative", "food storage", "reusable cover"]
  },
  {
    id: "fs-002",
    name: "Stainless Steel Tiffin Lunch Box",
    brand: "To-Go Ware",
    category: "food_beverage",
    plasticScore: 1,
    material: "18/8 stainless steel, multiple tiers",
    description: "Traditional tiffin — zero plastic food contact, lasts decades",
    affiliateUrl: `https://www.amazon.com/s?k=To-Go+Ware+Stainless+Steel+Tiffin+Lunch+Box&tag=partiqule-20`,
    price: "$35–55",
    tags: ["lunch box", "tiffin", "stainless", "food container", "lunch", "meal prep", "work lunch"]
  },
  {
    id: "fs-003",
    name: "Glass Spice Jars Set",
    brand: "Kamenstein",
    category: "kitchen",
    plasticScore: 1,
    material: "Glass jars, stainless lids",
    description: "Spices in plastic containers absorb plastic odors and potentially chemicals",
    affiliateUrl: `https://www.amazon.com/s?k=Kamenstein+Glass+Spice+Jars+Set&tag=partiqule-20`,
    price: "$25–40",
    tags: ["spice jars", "spice rack", "glass", "kitchen", "cooking", "storage", "spices"]
  },
  {
    id: "fs-004",
    name: "Silicone Stretch Lids Set",
    brand: "Cuisinart",
    category: "food_beverage",
    plasticScore: 2,
    material: "Food-grade silicone",
    description: "Reusable silicone lids for any size bowl or pot — replaces plastic wrap",
    affiliateUrl: `https://www.amazon.com/s?k=silicone+stretch+lids+set+reusable&tag=partiqule-20`,
    price: "$12–20",
    tags: ["lid", "bowl lid", "silicone lid", "food storage", "plastic wrap alternative", "reusable lid"]
  },
  {
    id: "fs-005",
    name: "Organic Cotton Bread Bag",
    brand: "Goldilocks Goods",
    category: "food_beverage",
    plasticScore: 1,
    material: "100% unbleached cotton",
    description: "Keeps bread fresh 5+ days without plastic — plastic bread bags leach into crust",
    affiliateUrl: `https://www.amazon.com/s?k=organic+cotton+bread+bag+linen&tag=partiqule-20`,
    price: "$10–16",
    tags: ["bread bag", "bread storage", "cotton", "natural", "food storage", "plastic-free", "reusable bag"]
  },
  {
    id: "fs-006",
    name: "Wooden Fruit Bowl",
    brand: "Lipper International",
    category: "kitchen",
    plasticScore: 1,
    material: "Solid acacia wood",
    description: "Plastic fruit bowls leach when acidic fruit sits in them — wood is naturally inert",
    affiliateUrl: `https://www.amazon.com/s?k=Lipper+International+Wooden+Fruit+Bowl&tag=partiqule-20`,
    price: "$20–35",
    tags: ["fruit bowl", "bowl", "wooden", "kitchen", "counter top", "natural", "acacia"]
  },

  // ── GARDEN & OUTDOOR ──────────────────────────────────────────
  {
    id: "gd-001",
    name: "Terracotta Plant Pots",
    brand: "HC Companies",
    category: "other",
    plasticScore: 1,
    material: "Natural fired terracotta clay",
    description: "Plastic plant pots shed microplastics into soil — terracotta is naturally inert",
    affiliateUrl: `https://www.amazon.com/s?k=terracotta+plant+pots+set&tag=partiqule-20`,
    price: "$8–20",
    tags: ["plant pot", "flower pot", "terracotta", "garden", "plants", "natural", "clay pot"]
  },
  {
    id: "gd-002",
    name: "Natural Cotton Garden Gloves",
    brand: "Atlas",
    category: "other",
    plasticScore: 2,
    material: "Cotton knit with nitrile coating fingertips only",
    description: "Mostly natural fiber vs full synthetic gloves — much less microplastic contact",
    affiliateUrl: `https://www.amazon.com/s?k=Atlas+Natural+Cotton+Garden+Gloves&tag=partiqule-20`,
    price: "$8–14",
    tags: ["garden gloves", "gloves", "gardening", "outdoor", "cotton", "natural", "work gloves"]
  },
  {
    id: "gd-003",
    name: "Stainless Steel Garden Tools",
    brand: "DeWit",
    category: "other",
    plasticScore: 1,
    material: "Stainless steel, ash wood handle",
    description: "Plastic-handled tools crack and shed — stainless and wood last generations",
    affiliateUrl: `https://www.amazon.com/s?k=stainless+steel+garden+tools+set&tag=partiqule-20`,
    price: "$30–60",
    tags: ["garden tools", "trowel", "gardening", "stainless", "wood handle", "natural", "outdoor"]
  },
  {
    id: "gd-004",
    name: "Bamboo Plant Stakes",
    brand: "Grow It",
    category: "other",
    plasticScore: 1,
    material: "Natural bamboo cane",
    description: "Plastic garden stakes shed microplastics into soil — bamboo composts naturally",
    affiliateUrl: `https://www.amazon.com/s?k=bamboo+plant+stakes+garden&tag=partiqule-20`,
    price: "$8–14",
    tags: ["plant stakes", "garden stakes", "bamboo", "garden", "plants", "support stakes", "natural"]
  },
  {
    id: "gd-005",
    name: "Jute Plant Hangers",
    brand: "Mkono",
    category: "other",
    plasticScore: 1,
    material: "100% natural jute rope",
    description: "Synthetic macramé hangers shed microplastics — jute is fully biodegradable",
    affiliateUrl: `https://www.amazon.com/s?k=jute+plant+hangers+macrame&tag=partiqule-20`,
    price: "$10–18",
    tags: ["plant hanger", "macrame", "jute", "natural", "indoor plants", "hanging planter", "bohemian"]
  },

  // ── TRAVEL ESSENTIALS ─────────────────────────────────────────
  {
    id: "tr-001",
    name: "Glass Toiletry Bottles",
    brand: "Infinity Jars",
    category: "personal_care",
    plasticScore: 1,
    material: "Borosilicate glass with aluminum caps",
    description: "Travel toiletry bottles in glass — no plastic leaching into shampoo or lotion",
    affiliateUrl: `https://www.amazon.com/s?k=glass+toiletry+bottles+travel+set&tag=partiqule-20`,
    price: "$15–25",
    tags: ["travel bottles", "toiletry bottles", "glass", "travel", "shampoo bottle", "refillable", "tsa"]
  },
  {
    id: "tr-002",
    name: "Stainless Steel Travel Cutlery",
    brand: "To-Go Ware",
    category: "food_beverage",
    plasticScore: 1,
    material: "18/8 stainless steel, bamboo case",
    description: "Eliminate disposable plastic cutlery on every trip or lunch",
    affiliateUrl: `https://www.amazon.com/s?k=To-Go+Ware+Stainless+Steel+Travel+Cutlery&tag=partiqule-20`,
    price: "$12–18",
    tags: ["travel cutlery", "reusable cutlery", "stainless", "fork", "spoon", "knife", "travel", "plastic-free cutlery"]
  },
  {
    id: "tr-003",
    name: "Organic Cotton Tote Bag",
    brand: "Baggu",
    category: "other",
    plasticScore: 1,
    material: "100% organic cotton canvas",
    description: "Replaces thousands of single-use plastic shopping bags over its lifetime",
    affiliateUrl: `https://www.amazon.com/s?k=organic+cotton+tote+bag+reusable&tag=partiqule-20`,
    price: "$12–18",
    tags: ["tote bag", "shopping bag", "canvas", "organic cotton", "reusable bag", "grocery bag", "market bag"]
  },
  {
    id: "tr-004",
    name: "Solid Toiletry Travel Kit",
    brand: "Ethique",
    category: "personal_care",
    plasticScore: 1,
    material: "Solid bars, cardboard packaging",
    description: "Solid shampoo + conditioner + face bar — TSA-friendly, zero plastic",
    affiliateUrl: `https://www.amazon.com/s?k=solid+shampoo+conditioner+travel+kit&tag=partiqule-20`,
    price: "$25–35",
    tags: ["travel kit", "solid shampoo", "travel", "plastic-free", "tsa", "bar shampoo", "travel toiletries"]
  },
  {
    id: "tr-005",
    name: "Beeswax Lip Balm",
    brand: "Hurraw",
    category: "personal_care",
    plasticScore: 1,
    material: "Cardboard tube, natural beeswax",
    description: "Plastic lip balm tubes are rarely recycled — cardboard tubes are compostable",
    affiliateUrl: `https://www.amazon.com/s?k=beeswax+lip+balm+tin&tag=partiqule-20`,
    price: "$4–7",
    tags: ["lip balm", "chapstick", "beeswax", "natural", "plastic-free", "skincare", "lips"]
  },
  {
    id: "tr-006",
    name: "Stainless Steel Coffee Thermos",
    brand: "Thermos",
    category: "food_beverage",
    plasticScore: 1,
    material: "18/8 stainless steel, no plastic lining",
    description: "Insulated stainless thermos — zero plastic touching your hot coffee",
    affiliateUrl: `https://www.amazon.com/s?k=Thermos+Stainless+Steel+Coffee+Thermos&tag=partiqule-20`,
    price: "$25–40",
    tags: ["thermos", "coffee thermos", "travel mug", "stainless", "coffee", "insulated", "flask"]
  },

  // ── PERIOD & FEMININE CARE ────────────────────────────────────
  {
    id: "fc-001",
    name: "Menstrual Cup",
    brand: "DivaCup",
    category: "personal_care",
    plasticScore: 2,
    material: "Medical-grade silicone",
    description: "Conventional pads and tampons contain up to 90% plastic — cup replaces all of them",
    affiliateUrl: `https://www.amazon.com/s?k=DivaCup+Menstrual+Cup&tag=partiqule-20`,
    price: "$28–38",
    tags: ["menstrual cup", "period cup", "silicone", "period", "feminine care", "plastic-free period", "reusable"]
  },
  {
    id: "fc-002",
    name: "Organic Cotton Tampons",
    brand: "Cora",
    category: "personal_care",
    plasticScore: 2,
    material: "100% organic cotton, cardboard applicator",
    description: "Conventional tampons contain synthetic rayon and plastic applicators",
    affiliateUrl: `https://www.amazon.com/s?k=organic+cotton+tampons+plastic-free&tag=partiqule-20`,
    price: "$10–14",
    tags: ["tampons", "organic tampons", "period", "feminine care", "organic cotton", "plastic-free"]
  },
  {
    id: "fc-003",
    name: "Reusable Cloth Pads",
    brand: "GladRags",
    category: "personal_care",
    plasticScore: 1,
    material: "Organic cotton flannel",
    description: "Single-use pads generate enormous plastic waste — cloth pads last years",
    affiliateUrl: `https://www.amazon.com/s?k=reusable+cloth+pads+organic+cotton&tag=partiqule-20`,
    price: "$15–25",
    tags: ["cloth pads", "reusable pads", "period pads", "organic cotton", "period", "feminine care"]
  },

  // ── BABY EXTRA ────────────────────────────────────────────────
  {
    id: "bk-011",
    name: "Beeswax Diaper Cream",
    brand: "Earth Mama",
    category: "baby",
    plasticScore: 1,
    material: "Organic beeswax, aluminum tube",
    description: "Plastic tube diaper creams vs metal tubes — aluminum is infinitely recyclable",
    affiliateUrl: `https://www.amazon.com/s?k=Earth+Mama+Beeswax+Diaper+Cream&tag=partiqule-20`,
    price: "$8–12",
    tags: ["diaper cream", "baby", "beeswax", "natural", "rash cream", "infant", "organic"]
  },
  {
    id: "bk-012",
    name: "Organic Cotton Baby Hat",
    brand: "L'ovedbaby",
    category: "baby",
    plasticScore: 1,
    material: "100% GOTS-certified organic cotton",
    description: "Synthetic fiber baby hats near sensitive newborn skin — organic cotton is safer",
    affiliateUrl: `https://www.amazon.com/s?k=organic+cotton+baby+hat+newborn&tag=partiqule-20`,
    price: "$10–16",
    tags: ["baby hat", "newborn hat", "organic cotton", "infant", "baby", "beanie", "natural"]
  },
  {
    id: "bk-013",
    name: "Wooden Baby Rattle",
    brand: "Haba",
    category: "baby",
    plasticScore: 1,
    material: "Maple wood, water-based paint",
    description: "Plastic rattles babies chew on — wooden rattles are completely plastic-free",
    affiliateUrl: `https://www.amazon.com/s?k=Haba+Wooden+Baby+Rattle&tag=partiqule-20`,
    price: "$12–18",
    tags: ["baby rattle", "rattle", "wooden", "baby toy", "newborn", "infant toy", "natural toy"]
  },
  {
    id: "bk-014",
    name: "Natural Rubber Pacifier",
    brand: "Natursutten",
    category: "baby",
    plasticScore: 2,
    material: "100% natural rubber",
    description: "Silicone pacifiers are better than plastic — natural rubber is the gold standard",
    affiliateUrl: `https://www.amazon.com/s?k=Natursutten+Natural+Rubber+Pacifier&tag=partiqule-20`,
    price: "$10–16",
    tags: ["pacifier", "dummy", "natural rubber", "baby", "infant", "newborn", "soother"]
  },
  {
    id: "bk-015",
    name: "Organic Cotton Baby Washcloths",
    brand: "Burt's Bees Baby",
    category: "baby",
    plasticScore: 1,
    material: "100% organic cotton",
    description: "Microfiber baby washcloths shed synthetic particles on baby's sensitive skin",
    affiliateUrl: `https://www.amazon.com/s?k=Burts+Bees+Baby+Organic+Cotton+Baby+Washcloths&tag=partiqule-20`,
    price: "$14–20",
    tags: ["baby washcloth", "washcloth", "organic cotton", "baby", "infant", "bath", "face cloth", "wipes", "baby wipes", "reusable wipes", "cloth wipes", "wet wipes alternative"]
  },

  // ── KITCHEN EXTRAS ────────────────────────────────────────────
  {
    id: "kx-001",
    name: "Glass French Press",
    brand: "Bodum",
    category: "food_beverage",
    plasticScore: 1,
    material: "Borosilicate glass, stainless steel frame",
    description: "Plastic coffee makers leach into your daily cup — glass French press doesn't",
    affiliateUrl: `https://www.amazon.com/s?k=Bodum+Glass+French+Press&tag=partiqule-20`,
    price: "$30–50",
    tags: ["french press", "coffee maker", "glass", "coffee", "plastic-free coffee", "cafetiere"]
  },
  {
    id: "kx-002",
    name: "Stainless Steel Kettle",
    brand: "Cuisinart",
    category: "kitchen",
    plasticScore: 1,
    material: "Brushed stainless steel interior",
    description: "Plastic electric kettles leach microplastics when water boils — stainless doesn't",
    affiliateUrl: `https://www.amazon.com/s?k=Cuisinart+Stainless+Steel+Kettle&tag=partiqule-20`,
    price: "$40–70",
    tags: ["kettle", "electric kettle", "stainless", "tea kettle", "coffee kettle", "boil water"]
  },
  {
    id: "kx-003",
    name: "Glass Blender",
    brand: "Vitamix",
    category: "kitchen",
    plasticScore: 2,
    material: "Borosilicate glass jar, stainless blade",
    description: "Plastic blender jars scratch and shed microplastics into smoothies",
    affiliateUrl: `https://www.amazon.com/s?k=glass+blender+vitamix&tag=partiqule-20`,
    price: "$350–500",
    tags: ["blender", "glass blender", "vitamix", "smoothie", "kitchen", "juice", "plastic-free blender"]
  },
  {
    id: "kx-004",
    name: "Stainless Steel Colander",
    brand: "OXO",
    category: "kitchen",
    plasticScore: 1,
    material: "18/8 stainless steel",
    description: "Plastic colanders shed microplastics into pasta and vegetables",
    affiliateUrl: `https://www.amazon.com/s?k=OXO+Stainless+Steel+Colander&tag=partiqule-20`,
    price: "$20–35",
    tags: ["colander", "strainer", "stainless", "kitchen", "pasta", "cooking", "drainer"]
  },
  {
    id: "kx-005",
    name: "Ceramic Baking Dish",
    brand: "Emile Henry",
    category: "kitchen",
    plasticScore: 1,
    material: "Burgundy clay ceramic",
    description: "Non-stick plastic-coated baking pans vs pure ceramic — ceramic is inert at all temps",
    affiliateUrl: `https://www.amazon.com/s?k=Emile+Henry+Ceramic+Baking+Dish&tag=partiqule-20`,
    price: "$40–80",
    tags: ["baking dish", "casserole dish", "ceramic", "oven dish", "cooking", "baking", "roasting pan"]
  },
  {
    id: "kx-006",
    name: "Glass Measuring Cups",
    brand: "Pyrex",
    category: "kitchen",
    plasticScore: 1,
    material: "Borosilicate glass",
    description: "Plastic measuring cups degrade and shed with heat — glass is permanent",
    affiliateUrl: `https://www.amazon.com/s?k=Pyrex+Glass+Measuring+Cups&tag=partiqule-20`,
    price: "$12–22",
    tags: ["measuring cup", "kitchen", "glass", "baking", "cooking", "measuring", "pyrex"]
  },
  {
    id: "kx-007",
    name: "Stainless Steel Grater",
    brand: "Microplane",
    category: "kitchen",
    plasticScore: 1,
    material: "Stainless steel blade, wood handle",
    description: "Plastic graters shed into food — stainless graters last forever",
    affiliateUrl: `https://www.amazon.com/s?k=Microplane+Stainless+Steel+Grater&tag=partiqule-20`,
    price: "$15–25",
    tags: ["grater", "cheese grater", "stainless", "kitchen", "cooking", "zester"]
  },
  {
    id: "kx-008",
    name: "Glass Milk Frother",
    brand: "Zulay",
    category: "food_beverage",
    plasticScore: 2,
    material: "Stainless steel wand, minimal plastic body",
    description: "For lattes at home without plastic pod machines",
    affiliateUrl: `https://www.amazon.com/s?k=glass+milk+frother+electric&tag=partiqule-20`,
    price: "$10–15",
    tags: ["milk frother", "frother", "coffee", "latte", "stainless", "kitchen", "espresso"]
  },
  {
    id: "kx-009",
    name: "Natural Beeswax Food Wrap Rolls",
    brand: "Etee",
    category: "food_beverage",
    plasticScore: 1,
    material: "Organic cotton, beeswax, pine resin",
    description: "By the roll for maximum coverage — cuts to any size needed",
    affiliateUrl: `https://www.amazon.com/s?k=beeswax+food+wrap+roll+natural&tag=partiqule-20`,
    price: "$16–22",
    tags: ["beeswax wrap", "food wrap", "cling wrap alternative", "organic", "plastic-free", "reusable wrap"]
  },
  {
    id: "kx-010",
    name: "Bamboo Paper Towel Replacement",
    brand: "Bambooya",
    category: "kitchen",
    plasticScore: 1,
    material: "Bamboo fiber cloth",
    description: "100 reusable washes per cloth vs single-use paper towels with plastic wrappers",
    affiliateUrl: `https://www.amazon.com/s?k=bamboo+paper+towel+replacement+reusable&tag=partiqule-20`,
    price: "$14–20",
    tags: ["paper towel", "bamboo cloth", "reusable", "kitchen towel", "cleaning cloth", "sustainable"]
  },

  // ── PERSONAL CARE EXTRAS ──────────────────────────────────────
  {
    id: "px-001",
    name: "Tallow Balm Face Moisturizer",
    brand: "Vintage Tradition",
    category: "personal_care",
    plasticScore: 1,
    material: "Tallow, essential oils, glass jar",
    description: "Most moisturizers contain silicones and polymers — tallow is entirely natural",
    affiliateUrl: `https://www.amazon.com/s?k=tallow+balm+face+moisturizer+natural&tag=partiqule-20`,
    price: "$20–35",
    tags: ["moisturizer", "face cream", "lotion", "natural", "glass jar", "tallow", "plastic-free skincare"]
  },
  {
    id: "px-002",
    name: "Oil Cleansing Face Wash",
    brand: "Pai Skincare",
    category: "personal_care",
    plasticScore: 2,
    material: "Plant oils, glass bottle",
    description: "Gel cleansers in plastic vs oil cleansers in glass — less packaging waste",
    affiliateUrl: `https://www.amazon.com/s?k=oil+cleansing+face+wash+glass+bottle&tag=partiqule-20`,
    price: "$22–32",
    tags: ["face wash", "cleanser", "oil cleanser", "glass bottle", "skincare", "natural", "face cleanser"]
  },
  {
    id: "px-003",
    name: "Refillable Mascara",
    brand: "Kjaer Weis",
    category: "personal_care",
    plasticScore: 2,
    material: "Metal case, refillable inserts",
    description: "Mascara wands are plastic — refillable metal cases eliminate the wasted tube",
    affiliateUrl: `https://www.amazon.com/s?k=refillable+mascara+sustainable&tag=partiqule-20`,
    price: "$30–40",
    tags: ["mascara", "makeup", "refillable", "metal", "lashes", "eye makeup", "plastic-free makeup"]
  },
  {
    id: "px-004",
    name: "Bamboo Cotton Swabs",
    brand: "The Humble Co",
    category: "personal_care",
    plasticScore: 1,
    material: "Bamboo stick, organic cotton tips",
    description: "Plastic cotton swabs are banned in many countries — bamboo is the natural alternative",
    affiliateUrl: `https://www.amazon.com/s?k=bamboo+cotton+swabs+ear&tag=partiqule-20`,
    price: "$5–8",
    tags: ["cotton swabs", "q-tips", "bamboo", "natural", "plastic-free", "ear cleaning", "cotton buds"]
  },
  {
    id: "px-005",
    name: "Shea Butter Body Lotion Bar",
    brand: "Ethique",
    category: "personal_care",
    plasticScore: 1,
    material: "Solid bar, compostable packaging",
    description: "Lotion in plastic vs solid bars in compostable packaging — zero plastic waste",
    affiliateUrl: `https://www.amazon.com/s?k=shea+butter+body+lotion+bar&tag=partiqule-20`,
    price: "$14–18",
    tags: ["lotion", "body lotion", "lotion bar", "solid", "plastic-free", "moisturizer", "body butter"]
  },
  {
    id: "px-006",
    name: "Rose Water Glass Spray",
    brand: "Heritage Store",
    category: "personal_care",
    plasticScore: 1,
    material: "Glass bottle, rosewater",
    description: "Face mists in glass vs plastic spray bottles — glass preserves the formula better too",
    affiliateUrl: `https://www.amazon.com/s?k=Heritage+Store+Rose+Water+Glass+Spray&tag=partiqule-20`,
    price: "$8–12",
    tags: ["rose water", "face mist", "toner", "glass bottle", "skincare", "spray", "facial mist"]
  },
  {
    id: "px-007",
    name: "Natural Clay Face Mask",
    brand: "Aztec Secret",
    category: "personal_care",
    plasticScore: 1,
    material: "100% natural calcium bentonite clay, glass jar",
    description: "Face masks with synthetic thickeners vs pure mineral clay in glass",
    affiliateUrl: `https://www.amazon.com/s?k=Aztec+Secret+Natural+Clay+Face+Mask&tag=partiqule-20`,
    price: "$12–18",
    tags: ["face mask", "clay mask", "skin care", "glass jar", "natural", "bentonite", "pores"]
  },
  {
    id: "px-008",
    name: "Stainless Nail File",
    brand: "Seki Edge",
    category: "personal_care",
    plasticScore: 1,
    material: "Stainless steel",
    description: "Disposable emery boards have synthetic abrasive particles — stainless lasts forever",
    affiliateUrl: `https://www.amazon.com/s?k=stainless+steel+nail+file&tag=partiqule-20`,
    price: "$8–14",
    tags: ["nail file", "emery board", "nails", "grooming", "stainless", "manicure", "nail care"]
  },

  // ── HEALTH & WELLNESS ─────────────────────────────────────────
  {
    id: "hw-001",
    name: "Glass Supplement Bottles",
    brand: "Standard Process",
    category: "other",
    plasticScore: 1,
    material: "Amber glass, metal lid",
    description: "Supplements stored in plastic leach phthalates — glass amber bottles protect and don't leach",
    affiliateUrl: `https://www.amazon.com/s?k=glass+supplement+bottle+vitamins&tag=partiqule-20`,
    price: "$20–40",
    tags: ["supplements", "vitamins", "glass bottle", "health", "wellness", "plastic-free vitamins"]
  },
  {
    id: "hw-002",
    name: "Stainless Steel Tongue Scraper",
    brand: "Dr. Tung's",
    category: "personal_care",
    plasticScore: 1,
    material: "Surgical-grade stainless steel",
    description: "Plastic tongue scrapers vs stainless — plastic scratches and harbors bacteria",
    affiliateUrl: `https://www.amazon.com/s?k=Dr.+Tungs+Stainless+Steel+Tongue+Scraper&tag=partiqule-20`,
    price: "$8–12",
    tags: ["tongue scraper", "oral care", "stainless", "dental", "plastic-free", "tongue cleaner"]
  },
  {
    id: "hw-003",
    name: "Natural Latex Gloves",
    brand: "Skintx",
    category: "other",
    plasticScore: 2,
    material: "Natural latex rubber",
    description: "Nitrile gloves are synthetic plastic — natural latex is plant-derived",
    affiliateUrl: `https://www.amazon.com/s?k=natural+latex+cleaning+gloves&tag=partiqule-20`,
    price: "$15–25",
    tags: ["gloves", "latex gloves", "cleaning gloves", "natural rubber", "household", "medical gloves"]
  },
  {
    id: "hw-004",
    name: "Glass Dropper Bottle Vitamins",
    brand: "MaryRuth Organics",
    category: "other",
    plasticScore: 1,
    material: "Glass dropper bottle",
    description: "Liquid vitamins in glass dropper bottles — no plastic cap touching the liquid",
    affiliateUrl: `https://www.amazon.com/s?k=glass+dropper+bottle+vitamins+liquid&tag=partiqule-20`,
    price: "$25–40",
    tags: ["vitamin d", "vitamins", "liquid vitamins", "glass bottle", "dropper", "health", "supplements"]
  },
  {
    id: "hw-005",
    name: "Copper Tongue Cleaner",
    brand: "Ayurvedic Oils",
    category: "personal_care",
    plasticScore: 1,
    material: "Pure copper",
    description: "Naturally antimicrobial copper — the Ayurvedic alternative to plastic scrapers",
    affiliateUrl: `https://www.amazon.com/s?k=copper+tongue+scraper+cleaner&tag=partiqule-20`,
    price: "$8–12",
    tags: ["tongue scraper", "tongue cleaner", "copper", "oral care", "ayurvedic", "natural", "dental"]
  },

  // ── FOOD PACKAGING ALTERNATIVES ───────────────────────────────
  {
    id: "fp-001",
    name: "Stainless Steel Spice Containers",
    brand: "Oggi",
    category: "kitchen",
    plasticScore: 1,
    material: "Stainless steel",
    description: "Plastic spice containers vs stainless — no plastic flavor contamination",
    affiliateUrl: `https://www.amazon.com/s?k=stainless+steel+spice+containers+set&tag=partiqule-20`,
    price: "$20–35",
    tags: ["spice container", "spice rack", "stainless", "kitchen", "spices", "seasoning", "cooking"]
  },
  {
    id: "fp-002",
    name: "Wax Paper Sandwich Bags",
    brand: "If You Care",
    category: "food_beverage",
    plasticScore: 1,
    material: "Unbleached wax paper, no plastic",
    description: "For occasions when you need disposable — wax paper is compostable unlike plastic",
    affiliateUrl: `https://www.amazon.com/s?k=wax+paper+sandwich+bags+natural&tag=partiqule-20`,
    price: "$5–9",
    tags: ["sandwich bag", "wax paper", "compostable", "plastic-free", "lunch", "food bag", "disposable alternative"]
  },
  {
    id: "fp-003",
    name: "Glass Oil Dispenser",
    brand: "OXO",
    category: "kitchen",
    plasticScore: 1,
    material: "Borosilicate glass, stainless spout",
    description: "Oil in plastic dispensers absorbs plastic odors — glass keeps oil pure",
    affiliateUrl: `https://www.amazon.com/s?k=OXO+Glass+Oil+Dispenser&tag=partiqule-20`,
    price: "$18–28",
    tags: ["oil dispenser", "olive oil", "glass", "kitchen", "cooking", "pouring bottle", "vinegar dispenser"]
  },
  {
    id: "fp-004",
    name: "Ceramic Salt and Pepper Set",
    brand: "Cole & Mason",
    category: "kitchen",
    plasticScore: 1,
    material: "Ceramic grinder bodies",
    description: "Plastic salt and pepper grinders contaminate every meal — ceramic is inert",
    affiliateUrl: `https://www.amazon.com/s?k=ceramic+salt+pepper+set+grinder&tag=partiqule-20`,
    price: "$25–40",
    tags: ["salt grinder", "pepper grinder", "ceramic", "kitchen", "spice grinder", "seasoning", "mill"]
  },
  {
    id: "fp-005",
    name: "Stainless Steel Can Opener",
    brand: "Kuhn Rikon",
    category: "kitchen",
    plasticScore: 1,
    material: "Stainless steel, rubber grip",
    description: "Plastic can openers break quickly — quality stainless lasts decades",
    affiliateUrl: `https://www.amazon.com/s?k=Kuhn+Rikon+Stainless+Steel+Can+Opener&tag=partiqule-20`,
    price: "$12–20",
    tags: ["can opener", "kitchen", "stainless", "opener", "tool", "cooking", "utensil"]
  },

  // ── ZERO WASTE ESSENTIALS ─────────────────────────────────────
  {
    id: "zw-001",
    name: "Reusable Produce Bags",
    brand: "Purifyou",
    category: "food_beverage",
    plasticScore: 1,
    material: "Organic cotton mesh",
    description: "Thin plastic produce bags at supermarkets — cotton mesh bags are the direct swap",
    affiliateUrl: `https://www.amazon.com/s?k=Purifyou+Reusable+Produce+Bags&tag=partiqule-20`,
    price: "$12–18",
    tags: ["produce bags", "grocery bags", "mesh bag", "reusable", "shopping", "vegetables", "fruit bag"]
  },
  {
    id: "zw-002",
    name: "Compostable Bin Liners",
    brand: "If You Care",
    category: "kitchen",
    plasticScore: 2,
    material: "ASTM D6400 certified compostable",
    description: "For the compost bin — certified compostable breaks down with your food waste",
    affiliateUrl: `https://www.amazon.com/s?k=If+You+Care+Compostable+Bin+Liners&tag=partiqule-20`,
    price: "$8–14",
    tags: ["compost bag", "bin liner", "compostable", "food waste", "kitchen", "composting", "biodegradable"]
  },
  {
    id: "zw-003",
    name: "Package Free Shaving Bar",
    brand: "Ethique",
    category: "personal_care",
    plasticScore: 1,
    material: "Solid bar, compostable packaging",
    description: "Plastic shaving cream cans vs solid bars with zero packaging waste",
    affiliateUrl: `https://www.amazon.com/s?k=shaving+soap+bar+plastic-free&tag=partiqule-20`,
    price: "$12–16",
    tags: ["shaving", "shaving cream", "bar", "plastic-free", "men", "grooming", "solid shaving"]
  },
  {
    id: "zw-004",
    name: "Safety Razor with Bamboo Handle",
    brand: "Bambaw",
    category: "personal_care",
    plasticScore: 1,
    material: "Bamboo handle, stainless blade",
    description: "Disposable plastic razors generate enormous waste — safety razor blades are stainless steel and recyclable",
    affiliateUrl: `https://www.amazon.com/s?k=safety+razor+bamboo+handle+double+edge&tag=partiqule-20`,
    price: "$25–40",
    tags: ["razor", "safety razor", "shaving", "bamboo", "stainless", "men", "women", "plastic-free razor"]
  },
  {
    id: "zw-005",
    name: "Beeswax Wrapping Paper Roll",
    brand: "Bee's Wrap",
    category: "food_beverage",
    plasticScore: 1,
    material: "Cotton muslin, beeswax, jojoba oil",
    description: "Jumbo roll for wrapping irregular shapes — replace cling film entirely",
    affiliateUrl: `https://www.amazon.com/s?k=beeswax+wrapping+paper+roll+gift&tag=partiqule-20`,
    price: "$22–28",
    tags: ["food wrap", "beeswax", "cling wrap", "plastic wrap alternative", "plastic-free", "bulk wrap"]
  },
  {
    id: "zw-006",
    name: "Natural Beeswax Polish",
    brand: "Howard",
    category: "other",
    plasticScore: 1,
    material: "Beeswax, carnauba wax, mineral spirits",
    description: "Spray polishes in plastic bottles vs natural wax in metal tins",
    affiliateUrl: `https://www.amazon.com/s?k=Howard+Natural+Beeswax+Polish&tag=partiqule-20`,
    price: "$10–16",
    tags: ["furniture polish", "wood polish", "beeswax", "natural", "home care", "wood care", "polish"]
  },
  {
    id: "zw-007",
    name: "Compostable Sponges",
    brand: "Full Circle",
    category: "kitchen",
    plasticScore: 1,
    material: "Plant cellulose and loofah",
    description: "Synthetic sponges shed microplastics with every use — plant sponges compost naturally",
    affiliateUrl: `https://www.amazon.com/s?k=compostable+cellulose+sponges+biodegradable&tag=partiqule-20`,
    price: "$6–10",
    tags: ["sponge", "compostable sponge", "cellulose", "kitchen", "cleaning", "dishes", "plastic-free sponge"]
  },
  {
    id: "zw-008",
    name: "Refillable Glass Perfume Bottle",
    brand: "Commodity",
    category: "personal_care",
    plasticScore: 1,
    material: "Glass bottle, aluminum cap",
    description: "Most perfume bottles are recyclable glass — avoid plastic atomizer bottles",
    affiliateUrl: `https://www.amazon.com/s?k=refillable+glass+perfume+bottle+atomizer&tag=partiqule-20`,
    price: "$40–80",
    tags: ["perfume", "fragrance", "glass bottle", "refillable", "cologne", "plastic-free perfume"]
  },

  // ── FOOD & DRINK MISC ─────────────────────────────────────────
  {
    id: "fm-001",
    name: "Cold Brew Coffee Maker Glass",
    brand: "Takeya",
    category: "food_beverage",
    plasticScore: 1,
    material: "Borosilicate glass pitcher, stainless filter",
    description: "Plastic cold brew pitchers leach into coffee over 12-24 hours of steeping",
    affiliateUrl: `https://www.amazon.com/s?k=glass+cold+brew+coffee+maker&tag=partiqule-20`,
    price: "$25–35",
    tags: ["cold brew", "coffee maker", "glass", "cold brew pitcher", "iced coffee", "coffee"]
  },
  {
    id: "fm-002",
    name: "Cast Iron Dutch Oven",
    brand: "Lodge",
    category: "kitchen",
    plasticScore: 1,
    material: "100% cast iron",
    description: "Enameled and non-stick coated pots shed PTFE — cast iron is completely inert",
    affiliateUrl: `https://www.amazon.com/s?k=Lodge+Cast+Iron+Dutch+Oven&tag=partiqule-20`,
    price: "$45–80",
    tags: ["dutch oven", "cast iron", "pot", "cooking", "oven", "baking", "braising"]
  },
  {
    id: "fm-003",
    name: "Porcelain Coffee Cup Set",
    brand: "Sweese",
    category: "food_beverage",
    plasticScore: 1,
    material: "Porcelain",
    description: "Reusable porcelain vs single-use plastic-lined cups — eliminates daily plastic exposure",
    affiliateUrl: `https://www.amazon.com/s?k=porcelain+coffee+cup+set+ceramic&tag=partiqule-20`,
    price: "$22–35",
    tags: ["coffee cup", "mug", "porcelain", "reusable", "espresso cup", "tea cup", "cup set"]
  },
  {
    id: "fm-004",
    name: "Glass Cocktail Shaker",
    brand: "Rabbit",
    category: "food_beverage",
    plasticScore: 1,
    material: "Borosilicate glass, stainless strainer",
    description: "No plastic in your cocktails — glass is completely inert with spirits",
    affiliateUrl: `https://www.amazon.com/s?k=glass+cocktail+shaker+stainless&tag=partiqule-20`,
    price: "$25–40",
    tags: ["cocktail shaker", "bar tool", "glass", "cocktails", "drinks", "bartending", "bar"]
  },
  {
    id: "fm-005",
    name: "Stainless Steel Ice Cube Tray",
    brand: "Onyx Stainless",
    category: "food_beverage",
    plasticScore: 1,
    material: "18/8 stainless steel",
    description: "Plastic ice trays leach into ice — stainless trays produce completely clean ice",
    affiliateUrl: `https://www.amazon.com/s?k=stainless+steel+ice+cube+tray&tag=partiqule-20`,
    price: "$20–30",
    tags: ["ice cube tray", "ice tray", "stainless", "freezer", "ice", "kitchen", "plastic-free ice"]
  },

  // ── CLEANING EXTRAS ───────────────────────────────────────────
  {
    id: "cx-001",
    name: "Natural Sisal Scrub Brush",
    brand: "Redecker",
    category: "kitchen",
    plasticScore: 1,
    material: "Sisal fiber, beechwood handle",
    description: "Natural sisal fiber doesn't shed microplastics like nylon scrub brushes",
    affiliateUrl: `https://www.amazon.com/s?k=natural+sisal+scrub+brush+kitchen&tag=partiqule-20`,
    price: "$8–14",
    tags: ["scrub brush", "dish brush", "sisal", "natural", "kitchen", "cleaning", "wood handle"]
  },
  {
    id: "cx-002",
    name: "Wool Dust Mop",
    brand: "Redecker",
    category: "kitchen",
    plasticScore: 1,
    material: "Lambswool head, beechwood handle",
    description: "Synthetic mop heads shed microplastics onto floors — wool attracts dust naturally",
    affiliateUrl: `https://www.amazon.com/s?k=wool+dust+mop+floor&tag=partiqule-20`,
    price: "$30–50",
    tags: ["mop", "dust mop", "wool", "natural", "floor cleaning", "lambswool", "broom alternative"]
  },
  {
    id: "cx-003",
    name: "Natural Fiber Broom",
    brand: "Redecker",
    category: "kitchen",
    plasticScore: 1,
    material: "Broomcorn fiber, bamboo handle",
    description: "Plastic bristle brooms shed microplastics — natural broomcorn is compostable",
    affiliateUrl: `https://www.amazon.com/s?k=natural+fiber+broom+wooden+handle&tag=partiqule-20`,
    price: "$25–40",
    tags: ["broom", "sweeping broom", "natural", "bamboo", "floor cleaning", "natural fiber broom"]
  },
  {
    id: "cx-004",
    name: "Lemon Essential Oil Cleaner",
    brand: "Branch Basics",
    category: "kitchen",
    plasticScore: 2,
    material: "Concentrate in glass, plant-based formula",
    description: "One glass concentrate bottle replaces 20+ plastic cleaning product bottles",
    affiliateUrl: `https://www.amazon.com/s?k=lemon+essential+oil+all+purpose+cleaner&tag=partiqule-20`,
    price: "$20–30",
    tags: ["cleaner", "cleaning concentrate", "natural cleaner", "glass", "plant-based", "multi-purpose", "kitchen"]
  },
  {
    id: "cx-005",
    name: "Stainless Steel Dustpan",
    brand: "Full Circle",
    category: "other",
    plasticScore: 1,
    material: "Stainless steel, rubber edge",
    description: "Plastic dustpans crack and shed — stainless steel lasts indefinitely",
    affiliateUrl: `https://www.amazon.com/s?k=stainless+steel+dustpan+set&tag=partiqule-20`,
    price: "$18–28",
    tags: ["dustpan", "cleaning", "stainless", "broom", "floor cleaning", "natural", "kitchen"]
  },

  // ── TOYS ─────────────────────────────────────────────────────
  {
    id: "ty-001",
    name: "Wooden Doll Set",
    brand: "Hape",
    category: "other",
    plasticScore: 1,
    material: "FSC-certified beech wood, non-toxic paint",
    description: "Zero plastic — safe for children with skin contact during play",
    affiliateUrl: `https://www.amazon.com/s?k=Hape+wooden+doll+set+kids&tag=partiqule-20`,
    price: "$20–40",
    tags: ["doll", "dolls", "toy", "toys", "kids toys", "wooden toy", "barbie alternative", "children", "natural toy", "plastic-free toy"]
  },
  {
    id: "ty-002",
    name: "Organic Cotton Stuffed Animal",
    brand: "Under the Nile",
    category: "other",
    plasticScore: 1,
    material: "100% organic cotton, natural stuffing",
    description: "No synthetic fibers or plastic pellets — safe for young children",
    affiliateUrl: `https://www.amazon.com/s?k=organic+cotton+stuffed+animal+toy&tag=partiqule-20`,
    price: "$18–35",
    tags: ["stuffed animal", "plush", "toy", "toys", "kids", "organic", "cotton", "soft toy", "teddy", "children"]
  },
  {
    id: "ty-003",
    name: "Natural Rubber Toy Set",
    brand: "Hevea",
    category: "other",
    plasticScore: 1,
    material: "100% natural rubber, food-grade paint",
    description: "Natural rubber doesn't leach plasticizers — ideal for teething and play",
    affiliateUrl: `https://www.amazon.com/s?k=Hevea+natural+rubber+toy+baby&tag=partiqule-20`,
    price: "$15–30",
    tags: ["rubber toy", "natural toy", "toy", "kids", "children", "teething", "baby toy", "plastic-free"]
  },
  {
    id: "ty-004",
    name: "Wooden Building Blocks",
    brand: "Melissa & Doug",
    category: "other",
    plasticScore: 1,
    material: "Solid hardwood, non-toxic finish",
    description: "Classic wood blocks — no plastic microparticles shed during play",
    affiliateUrl: `https://www.amazon.com/s?k=Melissa+Doug+wooden+building+blocks&tag=partiqule-20`,
    price: "$20–35",
    tags: ["blocks", "building blocks", "toy", "wooden toy", "kids", "children", "toddler", "lego alternative", "plastic-free toy"]
  },
  {
    id: "ty-005",
    name: "Waldorf Wooden Play Kitchen Set",
    brand: "PlanToys",
    category: "other",
    plasticScore: 1,
    material: "Rubberwood, non-toxic water-based dyes",
    description: "Plastic play kitchens shed particles — wood is safer for imaginative play",
    affiliateUrl: `https://www.amazon.com/s?k=PlanToys+wooden+play+kitchen+set&tag=partiqule-20`,
    price: "$50–120",
    tags: ["play kitchen", "toy kitchen", "toy", "kids", "wooden toy", "plastic-free", "children", "pretend play"]
  }
,
  // ── SALT & STONE ────────────────────────────────────────────
  {
    id:"ss-001", name:"Salt & Stone Natural Deodorant", brand:"Salt & Stone",
    plasticScore:2, category:"personal_care",
    material:"Ocean-recycled plastic stick, plant-based formula",
    description:"Aluminum-free 48hr protection with seaweed, niacinamide and prebiotics. Plastic-negative brand — ocean plastic container.",
    affiliateUrl:`https://www.amazon.com/s?k=Salt+Stone+natural+deodorant&tag=${AMAZON_TAG}`,
    price:"$16-18",
    tags:["deodorant","natural deodorant","aluminum free deodorant","clean deodorant","salt and stone","personal care","salt stone"]
  },
  {
    id:"ss-002", name:"Salt & Stone Body Wash", brand:"Salt & Stone",
    plasticScore:2, category:"personal_care",
    material:"Recycled plastic bottle, botanical formula",
    description:"Sulfate, paraben and dye-free body wash with seaweed extracts and spirulina. No synthetic chemicals.",
    affiliateUrl:`https://www.amazon.com/s?k=Salt+Stone+body+wash&tag=${AMAZON_TAG}`,
    price:"$26-36",
    tags:["body wash","natural body wash","clean body wash","sulfate free","paraben free","salt and stone","shower gel","personal care"]
  },
  {
    id:"ss-003", name:"Salt & Stone Body Cream", brand:"Salt & Stone",
    plasticScore:3, category:"personal_care",
    material:"Recycled plastic jar, plant-oil formula",
    description:"Rich moisturizer with seaweed, spirulina, squalane and argan oil. No parabens, phthalates or synthetic fragrance.",
    affiliateUrl:`https://www.amazon.com/s?k=Salt+Stone+body+cream&tag=${AMAZON_TAG}`,
    price:"$38-42",
    tags:["body cream","body moisturizer","natural moisturizer","squalane","argan oil","salt and stone","personal care"]
  },
  {
    id:"ss-004", name:"Salt & Stone Body Lotion", brand:"Salt & Stone",
    plasticScore:3, category:"personal_care",
    material:"Recycled plastic bottle, botanical lotion",
    description:"Lightweight daily lotion with niacinamide, jojoba, shea and kelp. No sulfates, parabens or synthetic fragrance.",
    affiliateUrl:`https://www.amazon.com/s?k=Salt+Stone+body+lotion&tag=${AMAZON_TAG}`,
    price:"$28-32",
    tags:["body lotion","natural lotion","niacinamide lotion","clean lotion","salt and stone","moisturizer","personal care"]
  },
  {
    id:"ss-005", name:"Salt & Stone Body Mist", brand:"Salt & Stone",
    plasticScore:2, category:"personal_care",
    material:"Recycled plastic spray bottle, water-based",
    description:"Lightweight botanical fragrance mist — no synthetic fragrance, no alcohol. Natural scent layers with deodorant.",
    affiliateUrl:`https://www.amazon.com/s?k=Salt+Stone+body+mist&tag=${AMAZON_TAG}`,
    price:"$24-28",
    tags:["body mist","natural fragrance mist","body spray","salt and stone","personal care"]
  },
  {
    id:"ss-006", name:"Salt & Stone Body Oil", brand:"Salt & Stone",
    plasticScore:2, category:"personal_care",
    material:"Glass or recycled plastic bottle, plant oils",
    description:"Lightweight botanical body oil with seaweed, jojoba and marula. No synthetic chemicals or mineral oils.",
    affiliateUrl:`https://www.amazon.com/s?k=Salt+Stone+body+oil&tag=${AMAZON_TAG}`,
    price:"$40-44",
    tags:["body oil","natural body oil","jojoba oil","marula oil","dry oil","salt and stone","personal care"]
  },
  {
    id:"ss-007", name:"Salt & Stone Hand Cream", brand:"Salt & Stone",
    plasticScore:3, category:"personal_care",
    material:"Recycled plastic tube, plant-based formula",
    description:"Rich hand cream with shea butter, niacinamide and seaweed extracts. No parabens or synthetic fragrance.",
    affiliateUrl:`https://www.amazon.com/s?k=Salt+Stone+hand+cream&tag=${AMAZON_TAG}`,
    price:"$18-22",
    tags:["hand cream","hand lotion","natural hand cream","shea butter","salt and stone","personal care"]
  },
  {
    id:"ss-008", name:"Salt & Stone Facial Cleanser", brand:"Salt & Stone",
    plasticScore:2, category:"personal_care",
    material:"Recycled plastic bottle, gel formula",
    description:"Gentle sulfate-free daily cleanser with seaweed extracts and botanical actives. No synthetic ingredients.",
    affiliateUrl:`https://www.amazon.com/s?k=Salt+Stone+facial+cleanser&tag=${AMAZON_TAG}`,
    price:"$28-34",
    tags:["face wash","facial cleanser","natural face wash","sulfate free cleanser","clean skincare","salt and stone","personal care"]
  },
  {
    id:"ss-009", name:"Salt & Stone Candle", brand:"Salt & Stone",
    plasticScore:2, category:"home",
    material:"Glass vessel, natural wax blend",
    description:"Clean-burning natural wax candle in glass — no synthetic fragrance, no paraffin, no toxic dyes.",
    affiliateUrl:`https://www.amazon.com/s?k=Salt+Stone+candle&tag=${AMAZON_TAG}`,
    price:"$38-44",
    tags:["candle","natural candle","clean candle","non toxic candle","glass candle","salt and stone"]
  },

  // ── PURE OVER ───────────────────────────────────────────────
  {
    id:"po-001", name:"Pure Over Signature Brew Kit", brand:"Pure Over",
    plasticScore:1, category:"kitchen",
    material:"Borosilicate glass and ceramic — zero plastic",
    description:"All-glass pour-over with built-in glass filter. No paper filters, no plastic, no metal. Free from PFAS, BPA and phthalates. Replaces 750M daily disposable filters.",
    affiliateUrl:`https://www.amazon.com/s?k=Pure+Over+signature+brew+kit&tag=${AMAZON_TAG}`,
    price:"$65-85",
    tags:["pour over","coffee maker","glass coffee maker","plastic free coffee","pour over coffee","reusable coffee filter","coffee brewer","kitchen"]
  },
  {
    id:"po-002", name:"Pure Over French Press", brand:"Pure Over",
    plasticScore:1, category:"kitchen",
    material:"Double-wall borosilicate glass, food-grade stainless steel, ceramic base",
    description:"Plastic-free French press — borosilicate glass and stainless steel only. No plastic at any point in the brew process.",
    affiliateUrl:`https://www.amazon.com/s?k=Pure+Over+french+press&tag=${AMAZON_TAG}`,
    price:"$75-95",
    tags:["french press","glass french press","plastic free french press","stainless french press","coffee press","kitchen"]
  },
  {
    id:"po-003", name:"Pure Over Latte Cups", brand:"Pure Over",
    plasticScore:1, category:"kitchen",
    material:"Borosilicate glass",
    description:"Handmade glass milk drink cups — zero plastic, zero leaching, dishwasher safe. Made in USA by glass artists.",
    affiliateUrl:`https://www.amazon.com/s?k=Pure+Over+latte+cups&tag=${AMAZON_TAG}`,
    price:"$45-55",
    tags:["latte cup","glass cup","milk drink cup","glass mug","coffee cup","kitchen"]
  },
  {
    id:"po-004", name:"Pure Over Espresso Cup Set", brand:"Pure Over",
    plasticScore:1, category:"kitchen",
    material:"Borosilicate glass",
    description:"Handblown glass espresso cups — pure borosilicate, no coatings, no plastic. Made in USA.",
    affiliateUrl:`https://www.amazon.com/s?k=Pure+Over+espresso+cups&tag=${AMAZON_TAG}`,
    price:"$38-48",
    tags:["espresso cup","glass espresso cup","espresso set","coffee cup","glass cup","kitchen"]
  },
  {
    id:"po-005", name:"Pure Over Signature Mug", brand:"Pure Over",
    plasticScore:1, category:"kitchen",
    material:"Borosilicate glass",
    description:"Handmade glass mug — non-toxic, zero plastic, pure borosilicate. No coatings or synthetic materials touching your drink.",
    affiliateUrl:`https://www.amazon.com/s?k=Pure+Over+signature+mug&tag=${AMAZON_TAG}`,
    price:"$32-42",
    tags:["glass mug","coffee mug","plastic free mug","borosilicate mug","reusable mug","kitchen"]
  },
  // ── PERSONAL CARE — BODY & SKIN ──────────────────────────────
  {
    id:"pc-100", name:"Nécessaire Body Wash", brand:"Nécessaire",
    plasticScore:2, category:"personal_care",
    material:"Clean formula — no parabens, sulfates, synthetic fragrance",
    description:"EWG-verified, peptide-infused body wash in recyclable packaging. Fragrance-free option available.",
    affiliateUrl:`https://www.amazon.com/s?k=Necessaire+body+wash&tag=${AMAZON_TAG}`,
    price:"$25-30",
    tags:["body wash","shower gel","clean beauty","fragrance free","personal care","sulfate free","paraben free"]
  },
  {
    id:"pc-101", name:"Nécessaire Body Serum", brand:"Nécessaire",
    plasticScore:2, category:"personal_care",
    material:"Clean formula — no parabens, synthetic fragrance, EWG-verified",
    description:"Lightweight body serum with niacinamide and peptides. Fragrance-free, EWG-verified clean.",
    affiliateUrl:`https://www.amazon.com/s?k=Necessaire+body+serum&tag=${AMAZON_TAG}`,
    price:"$45-55",
    tags:["body serum","skin care","clean beauty","niacinamide","personal care","fragrance free"]
  },
  {
    id:"pc-102", name:"Pipette Baby Lotion", brand:"Pipette",
    plasticScore:2, category:"personal_care",
    material:"EWG-verified, plant-derived squalane, no parabens or synthetic fragrance",
    description:"Pediatrician-tested, EWG-verified baby lotion. Plant-based squalane, no hormone-disrupting chemicals.",
    affiliateUrl:`https://www.amazon.com/s?k=Pipette+baby+lotion&tag=${AMAZON_TAG}`,
    price:"$12-16",
    tags:["baby lotion","baby skin care","lotion","personal care","baby","infant","clean beauty","squalane"]
  },
  {
    id:"pc-103", name:"Pipette Baby Shampoo", brand:"Pipette",
    plasticScore:2, category:"personal_care",
    material:"Sulfate-free, EWG-verified, plant-derived, no synthetic fragrance",
    description:"Tear-free, sulfate-free baby shampoo. EWG-verified, no parabens or phthalates.",
    affiliateUrl:`https://www.amazon.com/s?k=Pipette+baby+shampoo&tag=${AMAZON_TAG}`,
    price:"$10-14",
    tags:["baby shampoo","shampoo","baby","infant","personal care","sulfate free","clean beauty","tear free"]
  },
  {
    id:"pc-104", name:"Dr. Bronners Pure Castile Liquid Soap", brand:"Dr. Bronners",
    plasticScore:2, category:"personal_care",
    material:"Certified organic oils, no synthetic preservatives or foaming agents",
    description:"USDA organic, fair trade castile soap. Multi-use, highly concentrated, plastic bottle is recyclable HDPE.",
    affiliateUrl:`https://www.amazon.com/s?k=Dr+Bronners+castile+liquid+soap&tag=${AMAZON_TAG}`,
    price:"$10-18",
    tags:["castile soap","liquid soap","body wash","hand soap","personal care","organic","multi use","concentrated"]
  },
  {
    id:"pc-105", name:"Ursa Major Face Wipes", brand:"Ursa Major",
    plasticScore:2, category:"personal_care",
    material:"Biodegradable cloth, no synthetic fragrance, no parabens",
    description:"Compostable face wipes with clean botanical ingredients. No alcohol, synthetic fragrance, or parabens.",
    affiliateUrl:`https://www.amazon.com/s?k=Ursa+Major+face+wipes&tag=${AMAZON_TAG}`,
    price:"$14-18",
    tags:["face wipes","facial wipes","cleansing wipes","personal care","clean beauty","biodegradable","compostable"]
  },
  {
    id:"pc-106", name:"Ursa Major Face Moisturizer", brand:"Ursa Major",
    plasticScore:2, category:"personal_care",
    material:"Botanical actives, no synthetic fragrance, parabens, or silicones",
    description:"Daily face moisturizer with aloe, niacinamide and plant actives. Clean, no hormone disruptors.",
    affiliateUrl:`https://www.amazon.com/s?k=Ursa+Major+face+moisturizer&tag=${AMAZON_TAG}`,
    price:"$38-48",
    tags:["face moisturizer","moisturizer","facial cream","skin care","personal care","clean beauty","niacinamide"]
  },
  {
    id:"pc-107", name:"Kosas Tinted Face Oil", brand:"Kosas",
    plasticScore:2, category:"personal_care",
    material:"Plant oils, no parabens, phthalates, synthetic fragrance or talc",
    description:"Clean tinted face oil with SPF. No hormone-disrupting chemicals, buildable coverage.",
    affiliateUrl:`https://www.amazon.com/s?k=Kosas+tinted+face+oil&tag=${AMAZON_TAG}`,
    price:"$42-52",
    tags:["face oil","tinted moisturizer","foundation","makeup","personal care","clean beauty","spf"]
  },
  {
    id:"pc-108", name:"Kosas Deodorant", brand:"Kosas",
    plasticScore:2, category:"personal_care",
    material:"AHA-based, no aluminum, no synthetic fragrance, no baking soda",
    description:"Clean deodorant with lactic and glycolic acid. No aluminum, no synthetic fragrance, clinically effective.",
    affiliateUrl:`https://www.amazon.com/s?k=Kosas+deodorant&tag=${AMAZON_TAG}`,
    price:"$15-18",
    tags:["deodorant","natural deodorant","aluminum free","personal care","clean beauty","underarm"]
  },
  {
    id:"pc-109", name:"Honest Company Hand Soap", brand:"Honest Company",
    plasticScore:2, category:"personal_care",
    material:"Plant-derived, no synthetic fragrance, EWG-verified",
    description:"EWG-verified foaming hand soap. Plant-based, no parabens, SLS, or synthetic fragrance.",
    affiliateUrl:`https://www.amazon.com/s?k=Honest+Company+hand+soap&tag=${AMAZON_TAG}`,
    price:"$6-9",
    tags:["hand soap","foaming hand soap","personal care","clean beauty","plant based","EWG verified"]
  },
  {
    id:"pc-110", name:"Honest Company Body Lotion", brand:"Honest Company",
    plasticScore:2, category:"personal_care",
    material:"Plant-derived, no parabens, synthetic fragrance or phthalates",
    description:"EWG-verified body lotion, safe for babies and adults. Clean, gentle formula with plant actives.",
    affiliateUrl:`https://www.amazon.com/s?k=Honest+Company+body+lotion&tag=${AMAZON_TAG}`,
    price:"$10-14",
    tags:["body lotion","lotion","personal care","baby","clean beauty","plant based","moisturizer"]
  },
  {
    id:"pc-111", name:"Native Deodorant", brand:"Native",
    plasticScore:3, category:"personal_care",
    material:"Baking soda base, no aluminum, no parabens",
    description:"Aluminum-free deodorant available in plastic-free cardboard packaging. Effective natural formula.",
    affiliateUrl:`https://www.amazon.com/s?k=Native+deodorant+plastic+free&tag=${AMAZON_TAG}`,
    price:"$12-15",
    tags:["deodorant","natural deodorant","aluminum free","personal care","plastic free","underarm","baking soda"]
  },
  {
    id:"pc-112", name:"Schmidts Natural Deodorant", brand:"Schmidts",
    plasticScore:3, category:"personal_care",
    material:"Plant and mineral-based, no aluminum, available fragrance-free",
    description:"Natural deodorant with magnesium and plant actives. Aluminum-free, available in fragrance-free option.",
    affiliateUrl:`https://www.amazon.com/s?k=Schmidts+natural+deodorant&tag=${AMAZON_TAG}`,
    price:"$9-13",
    tags:["deodorant","natural deodorant","aluminum free","personal care","magnesium","fragrance free","underarm"]
  },
  // ── HAIR CARE ────────────────────────────────────────────────
  {
    id:"hc-001", name:"Briogeo Scalp Revival Shampoo", brand:"Briogeo",
    plasticScore:2, category:"personal_care",
    material:"No sulfates, silicones, synthetic fragrance, parabens or phthalates",
    description:"1% salicylic acid scalp shampoo. Free of sulfates, silicones, parabens, phthalates, DEA and synthetic fragrance.",
    affiliateUrl:`https://www.amazon.com/s?k=Briogeo+scalp+revival+shampoo&tag=${AMAZON_TAG}`,
    price:"$28-38",
    tags:["shampoo","scalp shampoo","hair care","personal care","sulfate free","silicone free","clean beauty"]
  },
  {
    id:"hc-002", name:"Briogeo Curl Conditioner", brand:"Briogeo",
    plasticScore:2, category:"personal_care",
    material:"No sulfates, silicones, parabens, phthalates or synthetic fragrance",
    description:"Curl-defining conditioner without silicones or synthetic fragrance. Clean formula, safe for color-treated hair.",
    affiliateUrl:`https://www.amazon.com/s?k=Briogeo+curl+conditioner&tag=${AMAZON_TAG}`,
    price:"$28-38",
    tags:["conditioner","curl conditioner","hair care","personal care","silicone free","clean beauty","curly hair"]
  },
  {
    id:"hc-003", name:"Avalon Organics Biotin Shampoo", brand:"Avalon Organics",
    plasticScore:2, category:"personal_care",
    material:"NSF-certified organic, no sulfates, synthetic fragrance or parabens",
    description:"NSF-certified organic shampoo with biotin and saw palmetto. No sulfates, synthetic fragrance, or parabens.",
    affiliateUrl:`https://www.amazon.com/s?k=Avalon+Organics+biotin+shampoo&tag=${AMAZON_TAG}`,
    price:"$10-14",
    tags:["shampoo","organic shampoo","biotin shampoo","hair care","personal care","sulfate free","thickening"]
  },
  {
    id:"hc-004", name:"Ethique Shampoo Bar", brand:"Ethique",
    plasticScore:1, category:"personal_care",
    material:"Solid shampoo bar — zero plastic packaging, plant-derived surfactants",
    description:"Solid shampoo bar eliminates plastic bottle entirely. 80+ washes per bar, compostable packaging.",
    affiliateUrl:`https://www.amazon.com/s?k=Ethique+shampoo+bar&tag=${AMAZON_TAG}`,
    price:"$14-18",
    tags:["shampoo","shampoo bar","solid shampoo","hair care","personal care","plastic free","zero waste","compostable"]
  },
  {
    id:"hc-005", name:"Ethique Conditioner Bar", brand:"Ethique",
    plasticScore:1, category:"personal_care",
    material:"Solid conditioner bar — zero plastic, plant-derived ingredients",
    description:"Solid conditioner bar in compostable packaging. No plastic bottle, no silicones, highly concentrated.",
    affiliateUrl:`https://www.amazon.com/s?k=Ethique+conditioner+bar&tag=${AMAZON_TAG}`,
    price:"$14-18",
    tags:["conditioner","conditioner bar","solid conditioner","hair care","personal care","plastic free","zero waste"]
  },
  // ── SUNSCREEN & SPF ──────────────────────────────────────────
  {
    id:"pc-401", name:"Badger Kids Sunscreen SPF 40", brand:"Badger",
    plasticScore:2, category:"personal_care",
    material:"Zinc oxide mineral base, organic ingredients, no oxybenzone or octinoxate",
    description:"Certified organic mineral sunscreen for kids. Zinc oxide only — no hormone-disrupting chemical UV filters.",
    affiliateUrl:`https://www.amazon.com/s?k=Badger+kids+sunscreen+SPF+40&tag=${AMAZON_TAG}`,
    price:"$16-20",
    tags:["sunscreen","kids sunscreen","mineral sunscreen","SPF","personal care","baby","zinc oxide","reef safe","oxybenzone free"]
  },
  {
    id:"pc-402", name:"Badger Sport Sunscreen SPF 40", brand:"Badger",
    plasticScore:2, category:"personal_care",
    material:"Zinc oxide mineral base, certified organic, no chemical UV filters",
    description:"Water-resistant mineral sport sunscreen. No oxybenzone, octinoxate, or hormone-disrupting UV filters.",
    affiliateUrl:`https://www.amazon.com/s?k=Badger+sport+sunscreen&tag=${AMAZON_TAG}`,
    price:"$16-22",
    tags:["sunscreen","sport sunscreen","mineral sunscreen","SPF","personal care","zinc oxide","reef safe","water resistant"]
  },
  {
    id:"pc-403", name:"Raw Elements Sunscreen SPF 30", brand:"Raw Elements",
    plasticScore:2, category:"personal_care",
    material:"Non-nano zinc oxide, certified natural, no synthetic chemicals",
    description:"100% natural mineral sunscreen in recyclable tin. Non-nano zinc oxide, reef-safe, no synthetic ingredients.",
    affiliateUrl:`https://www.amazon.com/s?k=Raw+Elements+sunscreen+SPF+30&tag=${AMAZON_TAG}`,
    price:"$18-24",
    tags:["sunscreen","mineral sunscreen","SPF","personal care","zinc oxide","reef safe","tin","natural"]
  },
  // ── CLEANING PRODUCTS ────────────────────────────────────────
  {
    id:"cl-100", name:"Branch Basics Concentrate", brand:"Branch Basics",
    plasticScore:2, category:"personal_care",
    material:"Plant and mineral-derived, no synthetic fragrance, dyes, or preservatives",
    description:"One concentrate replaces every cleaner in your home. No synthetic fragrance, dyes, enzymes, or preservatives.",
    affiliateUrl:`https://www.amazon.com/s?k=Branch+Basics+concentrate&tag=${AMAZON_TAG}`,
    price:"$49-69",
    tags:["cleaner","all purpose cleaner","household cleaner","cleaning","concentrate","non toxic","fragrance free","plant based"]
  },
  {
    id:"cl-101", name:"Blueland Multi-Surface Cleaner Tablets", brand:"Blueland",
    plasticScore:1, category:"personal_care",
    material:"Tablet form — no plastic bottle, no synthetic fragrance, EPA Safer Choice",
    description:"Dissolve in water, zero plastic packaging. EPA Safer Choice certified, no synthetic fragrance or harsh chemicals.",
    affiliateUrl:`https://www.amazon.com/s?k=Blueland+multi+surface+cleaner&tag=${AMAZON_TAG}`,
    price:"$12-16",
    tags:["cleaner","multi surface cleaner","all purpose cleaner","cleaning tablet","household cleaner","plastic free","zero waste"]
  },
  {
    id:"cl-102", name:"Blueland Toilet Bowl Cleaner", brand:"Blueland",
    plasticScore:1, category:"personal_care",
    material:"Tablet form — zero plastic, EPA Safer Choice, no synthetic fragrance",
    description:"Drop-in toilet bowl cleaner tablets. No plastic bottle, no synthetic fragrance, EPA Safer Choice certified.",
    affiliateUrl:`https://www.amazon.com/s?k=Blueland+toilet+bowl+cleaner&tag=${AMAZON_TAG}`,
    price:"$10-14",
    tags:["toilet cleaner","toilet bowl cleaner","bathroom cleaner","cleaning tablet","cleaning","plastic free","zero waste"]
  },
  {
    id:"cl-103", name:"Seventh Generation Dish Soap", brand:"Seventh Generation",
    plasticScore:3, category:"personal_care",
    material:"Plant-derived surfactants, no synthetic fragrance, USDA biobased certified",
    description:"Plant-based dish soap, no synthetic fragrance, dyes or triclosan. USDA Certified Biobased.",
    affiliateUrl:`https://www.amazon.com/s?k=Seventh+Generation+dish+soap&tag=${AMAZON_TAG}`,
    price:"$5-8",
    tags:["dish soap","washing up liquid","cleaning","plant based","fragrance free","USDA biobased"]
  },
  {
    id:"cl-104", name:"Meliora Laundry Powder", brand:"Meliora",
    plasticScore:2, category:"personal_care",
    material:"Washing soda, salt, soap — no synthetic fragrance or enzymes",
    description:"Certified B Corp laundry powder in cardboard box. No plastic, no synthetic fragrance, just four clean ingredients.",
    affiliateUrl:`https://www.amazon.com/s?k=Meliora+laundry+powder&tag=${AMAZON_TAG}`,
    price:"$16-22",
    tags:["laundry powder","laundry detergent","washing powder","cleaning","plastic free","fragrance free","B corp","cardboard"]
  },
  {
    id:"cl-105", name:"Force of Nature Cleaner", brand:"Force of Nature",
    plasticScore:1, category:"personal_care",
    material:"Electrolyzed salt water — no synthetic chemicals, fragrance or preservatives",
    description:"EPA-registered disinfectant made from salt, water and vinegar. No synthetic chemicals — safe around kids and pets.",
    affiliateUrl:`https://www.amazon.com/s?k=Force+of+Nature+cleaner&tag=${AMAZON_TAG}`,
    price:"$25-35",
    tags:["cleaner","disinfectant","all purpose cleaner","household cleaner","non toxic","fragrance free","EPA registered"]
  },
  // ── FOOD & BEVERAGE ──────────────────────────────────────────
  {
    id:"fb-100", name:"Numi Organic Tea", brand:"Numi",
    plasticScore:1, category:"food_beverage",
    material:"Plastic-free tea bags — no nylon, no polypropylene sealant",
    description:"Certified organic, plastic-free tea bags sealed without polypropylene. No microplastics from the bag.",
    affiliateUrl:`https://www.amazon.com/s?k=Numi+organic+tea&tag=${AMAZON_TAG}`,
    price:"$8-12",
    tags:["tea","herbal tea","green tea","black tea","organic tea","plastic free tea bag","food beverage"]
  },
  {
    id:"fb-101", name:"Pukka Herbs Organic Tea", brand:"Pukka",
    plasticScore:1, category:"food_beverage",
    material:"Plastic-free envelope and bag — no nylon mesh, no synthetic sealant",
    description:"Certified organic tea with plastic-free bags and envelopes. No synthetic sealants — safe at full temperature.",
    affiliateUrl:`https://www.amazon.com/s?k=Pukka+organic+tea&tag=${AMAZON_TAG}`,
    price:"$7-11",
    tags:["tea","herbal tea","organic tea","plastic free tea bag","food beverage","green tea","chamomile"]
  },
  {
    id:"fb-102", name:"Banza Chickpea Pasta", brand:"Banza",
    plasticScore:2, category:"food_beverage",
    material:"Chickpea flour, no artificial additives or synthetic dyes",
    description:"Chickpea pasta — higher protein, higher fiber, lower glycemic than conventional wheat pasta. No synthetic dyes.",
    affiliateUrl:`https://www.amazon.com/s?k=Banza+chickpea+pasta&tag=${AMAZON_TAG}`,
    price:"$3-5",
    tags:["pasta","chickpea pasta","gluten free pasta","food beverage","protein","whole food","clean ingredients"]
  },
  {
    id:"fb-103", name:"Siete Almond Flour Tortillas", brand:"Siete",
    plasticScore:2, category:"food_beverage",
    material:"Almond flour, cassava, no artificial preservatives or synthetic dyes",
    description:"Grain-free tortillas with clean ingredients. No artificial preservatives, colors or flavors. Minimal processing.",
    affiliateUrl:`https://www.amazon.com/s?k=Siete+almond+flour+tortillas&tag=${AMAZON_TAG}`,
    price:"$6-8",
    tags:["tortillas","grain free","almond flour","food beverage","clean ingredients","gluten free","minimal processing"]
  },
  {
    id:"fb-104", name:"Hu Chocolate Bar", brand:"Hu",
    plasticScore:2, category:"food_beverage",
    material:"Simple ingredients — no refined sugar, soy lecithin, palm oil or synthetic additives",
    description:"Paleo-friendly chocolate with minimal clean ingredients. No refined sugar, emulsifiers, dairy or synthetic additives.",
    affiliateUrl:`https://www.amazon.com/s?k=Hu+chocolate+bar&tag=${AMAZON_TAG}`,
    price:"$4-6",
    tags:["chocolate","dark chocolate","snack","food beverage","clean ingredients","paleo","no additives","soy free"]
  },
  {
    id:"fb-105", name:"Once Upon a Farm Baby Food Pouch", brand:"Once Upon a Farm",
    plasticScore:2, category:"food_beverage",
    material:"Organic whole ingredients, cold-pressed, no added sugar or synthetic additives",
    description:"Cold-pressed organic baby food. No added sugar, synthetic additives or preservatives. USDA organic.",
    affiliateUrl:`https://www.amazon.com/s?k=Once+Upon+a+Farm+baby+food&tag=${AMAZON_TAG}`,
    price:"$2-4",
    tags:["baby food","baby puree","organic baby food","food beverage","baby","infant","no added sugar","organic"]
  },
  {
    id:"fb-106", name:"Simple Mills Almond Flour Crackers", brand:"Simple Mills",
    plasticScore:2, category:"food_beverage",
    material:"Almond flour base, no synthetic dyes, artificial flavors or preservatives",
    description:"Grain-free crackers from almond flour. No artificial flavors, colors or preservatives. Clean, minimal ingredients.",
    affiliateUrl:`https://www.amazon.com/s?k=Simple+Mills+almond+flour+crackers&tag=${AMAZON_TAG}`,
    price:"$5-7",
    tags:["crackers","grain free crackers","almond flour","snack","food beverage","clean ingredients","gluten free"]
  },
  {
    id:"fb-107", name:"RXBAR Protein Bar", brand:"RXBAR",
    plasticScore:2, category:"food_beverage",
    material:"Whole food ingredients — egg whites, nuts, dates. No synthetic additives.",
    description:"Protein bar made from whole food ingredients. No synthetic additives, preservatives or artificial flavors.",
    affiliateUrl:`https://www.amazon.com/s?k=RXBAR+protein+bar&tag=${AMAZON_TAG}`,
    price:"$2-3",
    tags:["protein bar","snack bar","food beverage","whole food","clean ingredients","no additives","egg white","dates"]
  },
  {
    id:"fb-108", name:"Oatly Oat Milk", brand:"Oatly",
    plasticScore:3, category:"food_beverage",
    material:"Oat-based, minimal additives — rapeseed oil, salt. Carton packaging.",
    description:"Widely available oat milk in carton packaging. Minimal additives compared to most plant milks. No dairy hormones.",
    affiliateUrl:`https://www.amazon.com/s?k=Oatly+oat+milk&tag=${AMAZON_TAG}`,
    price:"$5-7",
    tags:["oat milk","plant milk","dairy free","milk alternative","food beverage","vegan","barista"]
  },
  {
    id:"fb-109", name:"One Degree Organic Sprouted Oat O's", brand:"One Degree",
    plasticScore:2, category:"food_beverage",
    material:"USDA Organic sprouted oats — no glyphosate, no artificial dyes, no synthetic preservatives. Gluten-free certified.",
    description:"The cleanest swap for Honey Nut Cheerios. Certified organic so no glyphosate residue. Sprouted oats improve digestibility. No petroleum dyes, no BHA, no added sugar.",
    affiliateUrl:`https://www.amazon.com/s?k=One+Degree+Organic+sprouted+oat+os&tag=${AMAZON_TAG}`,
    price:"$6-9",
    tags:["cereal","breakfast cereal","oat cereal","organic cereal","cheerios alternative","oat o's","glyphosate free","no artificial dyes","kids cereal","organic","USDA organic","sprouted"]
  },
  {
    id:"fb-110", name:"Nature's Path Organic Corn Flakes", brand:"Nature's Path",
    plasticScore:2, category:"food_beverage",
    material:"USDA Organic corn — no synthetic pesticides, no artificial colors, no preservatives.",
    description:"USDA Organic cereal from one of the most trusted organic cereal brands. No glyphosate, no artificial dyes, non-GMO verified.",
    affiliateUrl:`https://www.amazon.com/s?k=Natures+Path+organic+corn+flakes&tag=${AMAZON_TAG}`,
    price:"$5-8",
    tags:["cereal","breakfast cereal","organic cereal","corn flakes","no artificial dyes","glyphosate free","non-gmo","kids cereal","organic"]
  },
  {
    id:"fb-111", name:"Bob's Red Mill Organic Rolled Oats", brand:"Bob's Red Mill",
    plasticScore:2, category:"food_beverage",
    material:"USDA Organic whole grain oats — no glyphosate, no synthetic pesticides, minimal processing.",
    description:"The gold standard for oatmeal. USDA Organic so no glyphosate pre-harvest desiccant. Non-GMO. Whole grain with nothing added.",
    affiliateUrl:`https://www.amazon.com/s?k=Bobs+Red+Mill+organic+rolled+oats&tag=${AMAZON_TAG}`,
    price:"$6-10",
    tags:["oatmeal","oats","rolled oats","organic oats","breakfast","cereal","organic cereal","glyphosate free","whole grain","non-gmo","USDA organic","quaker alternative","cheerios alternative"]
  },
  {
    id:"fb-112", name:"Nature's Path Organic Honey'd Corn Puffs", brand:"Nature's Path",
    plasticScore:2, category:"food_beverage",
    material:"Organic corn, organic honey — no petroleum dyes, no artificial preservatives, non-GMO.",
    description:"Organic puffed corn with real honey — a genuinely clean swap for honey-flavored cereals. No Red 40, no Yellow 5, no synthetic anything.",
    affiliateUrl:`https://www.amazon.com/s?k=Natures+Path+organic+honey+corn+puffs&tag=${AMAZON_TAG}`,
    price:"$5-8",
    tags:["cereal","breakfast cereal","honey cereal","organic cereal","kids cereal","no artificial dyes","puffed corn","corn puffs","organic","honey nut cheerios alternative","honey flavor"]
  },
  {
    id:"fb-113", name:"Purely Elizabeth Ancient Grain Granola", brand:"Purely Elizabeth",
    plasticScore:2, category:"food_beverage",
    material:"Organic oats, coconut oil, coconut sugar — no glyphosate, no refined sugar, no synthetic additives.",
    description:"Clean granola made with organic ancient grains. No glyphosate, no petroleum dyes, no synthetic preservatives. B-Corp certified.",
    affiliateUrl:`https://www.amazon.com/s?k=Purely+Elizabeth+granola&tag=${AMAZON_TAG}`,
    price:"$8-12",
    tags:["granola","granola bar","breakfast","cereal","organic granola","organic cereal","no artificial dyes","nature valley alternative","glyphosate free","B-corp","ancient grain"]
  },
  // ── KITCHEN ──────────────────────────────────────────────────
  {
    id:"kt-100", name:"Vitamix Blender", brand:"Vitamix",
    plasticScore:3, category:"kitchen",
    material:"BPA-free Tritan container — not food-contact PP or PVC",
    description:"High-performance blender with BPA-free Tritan container. Built to last decades — lowest lifecycle impact of any blender.",
    affiliateUrl:`https://www.amazon.com/s?k=Vitamix+blender&tag=${AMAZON_TAG}`,
    price:"$350-500",
    tags:["blender","kitchen appliance","kitchen","smoothie","BPA free","tritan","high performance"]
  },
  {
    id:"kt-101", name:"Beeswax Wraps by Bees Wrap", brand:"Bees Wrap",
    plasticScore:1, category:"kitchen",
    material:"Organic cotton, beeswax, jojoba oil, tree resin — zero plastic",
    description:"Reusable beeswax food wrap — replaces plastic wrap entirely. Compostable, washable, lasts 1 year+.",
    affiliateUrl:`https://www.amazon.com/s?k=Bees+Wrap+beeswax+wrap&tag=${AMAZON_TAG}`,
    price:"$18-22",
    tags:["beeswax wrap","food wrap","plastic wrap alternative","kitchen","reusable","compostable","zero waste","cling wrap"]
  },
  {
    id:"kt-102", name:"Stasher Reusable Silicone Bag", brand:"Stasher",
    plasticScore:2, category:"kitchen",
    material:"100% platinum silicone — no BPA, BPS, latex or fillers",
    description:"Reusable silicone food bag — dishwasher safe, freezer safe, oven safe. Replaces hundreds of zip-lock bags per year.",
    affiliateUrl:`https://www.amazon.com/s?k=Stasher+reusable+silicone+bag&tag=${AMAZON_TAG}`,
    price:"$12-18",
    tags:["silicone bag","reusable bag","food storage bag","ziplock alternative","kitchen","BPA free","freezer bag","sandwich bag"]
  },
  {
    id:"kt-103", name:"Caraway Ceramic Cookware Set", brand:"Caraway",
    plasticScore:2, category:"kitchen",
    material:"Ceramic non-stick — no PTFE, PFAS, PFOA or heavy metals",
    description:"Ceramic-coated cookware with no PTFE, PFAS, PFOA, lead or cadmium. Safe at high temperatures, naturally non-stick.",
    affiliateUrl:`https://www.amazon.com/s?k=Caraway+ceramic+cookware&tag=${AMAZON_TAG}`,
    price:"$395-545",
    tags:["cookware","ceramic cookware","non stick pan","frying pan","pan","PFAS free","PTFE free","PFOA free","toxic free cookware"]
  },
  {
    id:"kt-104", name:"Our Place Always Pan", brand:"Our Place",
    plasticScore:2, category:"kitchen",
    material:"Ceramic non-stick — no PTFE, PFAS, PFOA, lead or cadmium",
    description:"Multi-use ceramic pan — braises, sears, steams, strains. No PTFE or PFAS coatings, free of heavy metals.",
    affiliateUrl:`https://www.amazon.com/s?k=Our+Place+Always+Pan&tag=${AMAZON_TAG}`,
    price:"$150-165",
    tags:["pan","frying pan","ceramic pan","non stick pan","cookware","PFAS free","PTFE free","PFOA free","kitchen"]
  },
  {
    id:"kt-105", name:"GreenPan Ceramic Non-Stick Pan", brand:"GreenPan",
    plasticScore:2, category:"kitchen",
    material:"Thermolon ceramic coating — no PTFE, PFAS, PFOA or lead",
    description:"Thermolon ceramic non-stick — no PTFE, PFAS, PFOA or cadmium. Will not release toxic fumes if overheated.",
    affiliateUrl:`https://www.amazon.com/s?k=GreenPan+ceramic+non+stick+pan&tag=${AMAZON_TAG}`,
    price:"$40-80",
    tags:["pan","frying pan","ceramic pan","non stick pan","cookware","PFAS free","PTFE free","PFOA free","kitchen","saute pan"]
  },
  {
    id:"kt-106", name:"Wusthof Classic Chefs Knife", brand:"Wusthof",
    plasticScore:1, category:"kitchen",
    material:"High-carbon stainless steel blade — no food contact plastic",
    description:"German high-carbon stainless steel chefs knife. Lasts decades — no food contact plastic at all.",
    affiliateUrl:`https://www.amazon.com/s?k=Wusthof+Classic+chef+knife&tag=${AMAZON_TAG}`,
    price:"$150-200",
    tags:["knife","chefs knife","kitchen knife","stainless steel","kitchen","cooking","durable","lifetime"]
  },
  {
    id:"kt-107", name:"Anchor Hocking Glass Food Storage Set", brand:"Anchor Hocking",
    plasticScore:1, category:"kitchen",
    material:"Borosilicate glass with BPA-free lids — zero food contact plastic",
    description:"Glass food storage containers — no leaching even when heated, frozen or used with acidic food. Oven and dishwasher safe.",
    affiliateUrl:`https://www.amazon.com/s?k=Anchor+Hocking+glass+food+storage&tag=${AMAZON_TAG}`,
    price:"$25-45",
    tags:["food storage","glass container","food container","tupperware alternative","kitchen","glass","BPA free","meal prep"]
  },
  {
    id:"kt-108", name:"Pyrex Glass Food Storage Set", brand:"Pyrex",
    plasticScore:1, category:"kitchen",
    material:"Borosilicate glass — zero leaching, BPA-free lids",
    description:"Classic borosilicate glass storage with BPA-free lids. Safe for oven, microwave, freezer — zero plastic food contact.",
    affiliateUrl:`https://www.amazon.com/s?k=Pyrex+glass+food+storage+set&tag=${AMAZON_TAG}`,
    price:"$20-40",
    tags:["food storage","glass container","food container","tupperware alternative","kitchen","glass","BPA free","microwave safe"]
  },
  {
    id:"kt-109", name:"Klean Kanteen Insulated Water Bottle", brand:"Klean Kanteen",
    plasticScore:1, category:"kitchen",
    material:"18/8 food-grade stainless steel — zero plastic interior contact",
    description:"18/8 stainless steel water bottle — no plastic liner, no BPA, keeps drinks cold 24hr or hot 12hr.",
    affiliateUrl:`https://www.amazon.com/s?k=Klean+Kanteen+insulated+water+bottle&tag=${AMAZON_TAG}`,
    price:"$30-45",
    tags:["water bottle","stainless steel bottle","insulated bottle","reusable bottle","BPA free","plastic free","kitchen","hydration"]
  },
  {
    id:"kt-110", name:"Hydro Flask Water Bottle", brand:"Hydro Flask",
    plasticScore:1, category:"kitchen",
    material:"18/8 pro-grade stainless steel — no plastic food contact surface",
    description:"18/8 stainless steel with double-wall insulation. No plastic liner touching your water.",
    affiliateUrl:`https://www.amazon.com/s?k=Hydro+Flask+water+bottle&tag=${AMAZON_TAG}`,
    price:"$35-50",
    tags:["water bottle","stainless steel bottle","insulated bottle","reusable bottle","BPA free","plastic free","kitchen","hydration"]
  },
  {
    id:"kt-111", name:"Fellow Stagg EKG Kettle", brand:"Fellow",
    plasticScore:2, category:"kitchen",
    material:"Stainless steel water path — no plastic in contact with water",
    description:"Precision pour-over kettle with stainless steel water path. No plastic contacts hot water. Variable temp control.",
    affiliateUrl:`https://www.amazon.com/s?k=Fellow+Stagg+EKG+kettle&tag=${AMAZON_TAG}`,
    price:"$165-195",
    tags:["kettle","electric kettle","pour over kettle","coffee kettle","kitchen","stainless steel","precision","BPA free"]
  },
  // ── BABY & KIDS ──────────────────────────────────────────────
  {
    id:"cl-301", name:"Hanna Andersson Organic Cotton Pajamas", brand:"Hanna Andersson",
    plasticScore:2, category:"clothing",
    material:"100% GOTS-certified organic cotton — no synthetic fibers or chemical treatments",
    description:"GOTS-certified organic cotton pajamas for kids. No synthetic fibers, snug-fitting so no flame retardant chemicals needed.",
    affiliateUrl:`https://www.amazon.com/s?k=Hanna+Andersson+organic+cotton+pajamas&tag=${AMAZON_TAG}`,
    price:"$36-46",
    tags:["pajamas","kids pajamas","organic cotton","baby","kids","clothing","organic","GOTS","sleepwear","toddler"]
  },
  {
    id:"cl-302", name:"Burts Bees Baby Organic Cotton Bodysuit", brand:"Burts Bees Baby",
    plasticScore:2, category:"clothing",
    material:"100% GOTS-certified organic cotton — no synthetic dyes or flame retardants",
    description:"GOTS-certified organic cotton onesie with no synthetic dyes or chemical finishes. Safe for newborn skin.",
    affiliateUrl:`https://www.amazon.com/s?k=Burts+Bees+Baby+organic+bodysuit&tag=${AMAZON_TAG}`,
    price:"$12-18",
    tags:["bodysuit","onesie","baby","infant","newborn","organic cotton","clothing","GOTS","organic"]
  },
  {
    id:"cl-303", name:"Pact Kids Organic Cotton T-Shirt", brand:"Pact",
    plasticScore:2, category:"clothing",
    material:"100% GOTS-certified organic cotton — Fair Trade certified",
    description:"GOTS-certified organic cotton kids tee. Fair Trade certified, no synthetic dyes, no pesticide residue.",
    affiliateUrl:`https://www.amazon.com/s?k=Pact+kids+organic+cotton+tshirt&tag=${AMAZON_TAG}`,
    price:"$18-24",
    tags:["tshirt","t-shirt","kids","children","organic cotton","clothing","GOTS","Fair Trade","top","shirt"]
  },
  {
    id:"bk-024", name:"Naturepedic Organic Crib Mattress", brand:"Naturepedic",
    plasticScore:2, category:"baby",
    material:"GOTS-certified organic cotton, no polyurethane foam, no flame retardant chemicals",
    description:"GOTS and MADE SAFE certified crib mattress. No polyurethane foam, no flame retardant chemicals, no synthetic waterproofing.",
    affiliateUrl:`https://www.amazon.com/s?k=Naturepedic+organic+crib+mattress&tag=${AMAZON_TAG}`,
    price:"$299-399",
    tags:["crib mattress","baby mattress","organic mattress","baby","infant","organic cotton","GOTS","flame retardant free","non toxic"]
  },
  {
    id:"bk-025", name:"Pura Stainless Baby Bottle", brand:"Pura",
    plasticScore:1, category:"baby",
    material:"18/8 food-grade stainless steel — no plastic food contact, no BPA or phthalates",
    description:"Stainless steel baby bottle — no plastic contacts milk or formula even when heated. Medical-grade silicone nipple.",
    affiliateUrl:`https://www.amazon.com/s?k=Pura+stainless+steel+baby+bottle&tag=${AMAZON_TAG}`,
    price:"$22-30",
    tags:["baby bottle","stainless steel bottle","bottle","baby","infant","BPA free","plastic free","feeding"]
  },
  {
    id:"bk-026", name:"WeeSprout Glass Baby Food Containers", brand:"WeeSprout",
    plasticScore:1, category:"baby",
    material:"Borosilicate glass — zero leaching, safe for heating and freezing",
    description:"Glass baby food storage — no plastic leaching into purees even when heated. Freezer, oven and dishwasher safe.",
    affiliateUrl:`https://www.amazon.com/s?k=WeeSprout+glass+baby+food+containers&tag=${AMAZON_TAG}`,
    price:"$20-28",
    tags:["baby food container","baby food storage","glass container","baby","glass","BPA free","food storage","weaning"]
  },
  {
    id:"bk-027", name:"Melissa and Doug Wooden Toys", brand:"Melissa and Doug",
    plasticScore:2, category:"baby",
    material:"Solid wood and water-based paint — no ABS plastic",
    description:"Solid wood toys with water-based paint. No ABS plastic, no phthalates. Built to last years.",
    affiliateUrl:`https://www.amazon.com/s?k=Melissa+and+Doug+wooden+toys&tag=${AMAZON_TAG}`,
    price:"$15-40",
    tags:["wooden toys","kids toys","toys","baby","toddler","natural toys","non toxic toys","wood","plastic free toys"]
  },
  {
    id:"cl-304", name:"Patagonia Kids Fleece Jacket", brand:"Patagonia",
    plasticScore:3, category:"clothing",
    material:"100% recycled polyester fleece — bluesign certified, no PFAS DWR treatment",
    description:"Recycled fleece kids jacket with no PFAS waterproofing. Bluesign certified fabric, Fair Trade sewn, built to be handed down.",
    affiliateUrl:`https://www.amazon.com/s?k=Patagonia+kids+fleece+jacket&tag=${AMAZON_TAG}`,
    price:"$69-89",
    tags:["jacket","fleece jacket","kids jacket","kids outerwear","outerwear","children jacket","toddler jacket","recycled fleece","PFAS free","no PFAS","kids coat","coat"]
  },
  {
    id:"cl-305", name:"Patagonia Kids Rain Jacket", brand:"Patagonia",
    plasticScore:3, category:"clothing",
    material:"Recycled nylon shell — PFAS-free DWR treatment, bluesign certified",
    description:"Kids rain jacket with PFAS-free waterproofing. Patagonia transitioned to non-fluorinated DWR — no forever chemicals in the coating.",
    affiliateUrl:`https://www.amazon.com/s?k=Patagonia+kids+rain+jacket&tag=${AMAZON_TAG}`,
    price:"$99-129",
    tags:["rain jacket","waterproof jacket","kids jacket","kids outerwear","outerwear","children jacket","toddler jacket","PFAS free","no PFAS DWR","kids coat","coat","waterproof","shell"]
  },
  {
    id:"cl-306", name:"Hanna Andersson Organic Cotton Hoodie", brand:"Hanna Andersson",
    plasticScore:2, category:"clothing",
    material:"100% GOTS-certified organic cotton — no synthetic fibers, no chemical treatments",
    description:"GOTS organic cotton hoodie for kids. No synthetic microfibers, no PFAS, no azo dyes. Snug and warm without synthetic fleece.",
    affiliateUrl:`https://www.amazon.com/s?k=Hanna+Andersson+organic+hoodie+kids&tag=${AMAZON_TAG}`,
    price:"$38-52",
    tags:["hoodie","sweatshirt","kids jacket","kids outerwear","outerwear","children jacket","toddler jacket","organic cotton","GOTS","coat","kids sweater","sweater","warm layer","layer"]
  },
  {
    id:"cl-307", name:"Frugi Organic Kids Waterproof Jacket", brand:"Frugi",
    plasticScore:3, category:"clothing",
    material:"GOTS-certified organic cotton outer with PFAS-free waterproof membrane",
    description:"GOTS organic cotton kids waterproof with bluesign-certified PFAS-free membrane. Designed to be passed down, not thrown away.",
    affiliateUrl:`https://www.amazon.com/s?k=Frugi+kids+waterproof+jacket+organic&tag=${AMAZON_TAG}`,
    price:"$79-110",
    tags:["rain jacket","waterproof jacket","kids jacket","kids outerwear","outerwear","children jacket","toddler jacket","organic cotton","GOTS","PFAS free","coat","waterproof"]
  },
  {
    id:"cl-308", name:"Pact Kids Organic Cotton Sweatshirt", brand:"Pact",
    plasticScore:2, category:"clothing",
    material:"100% GOTS-certified organic cotton — Fair Trade certified, no synthetic dyes",
    description:"Fair Trade, GOTS organic cotton kids sweatshirt. No synthetic fibers, no petroleum dyes, no formaldehyde finishes.",
    affiliateUrl:`https://www.amazon.com/s?k=Pact+kids+organic+sweatshirt&tag=${AMAZON_TAG}`,
    price:"$28-36",
    tags:["sweatshirt","hoodie","kids jacket","outerwear","children","toddler","organic cotton","GOTS","Fair Trade","warm layer","layer","top","kids sweater"]
  },
  {
    id:"cl-309", name:"Art and Eden Organic Kids Jacket", brand:"Art and Eden",
    plasticScore:2, category:"clothing",
    material:"GOTS-certified organic cotton — OEKO-TEX certified, no synthetic dyes",
    description:"GOTS and OEKO-TEX certified kids outerwear. Verified free of harmful chemicals throughout the supply chain.",
    affiliateUrl:`https://www.amazon.com/s?k=Art+and+Eden+organic+kids+jacket&tag=${AMAZON_TAG}`,
    price:"$42-62",
    tags:["jacket","kids jacket","kids outerwear","outerwear","children jacket","toddler jacket","organic cotton","GOTS","OEKO-TEX","coat","layer"]
  },
  {
    id:"cl-310", name:"Mini Rodini Organic Kids Sweatshirt", brand:"Mini Rodini",
    plasticScore:2, category:"clothing",
    material:"100% GOTS-certified organic cotton — OEKO-TEX 100 certified",
    description:"Swedish kids brand with GOTS and OEKO-TEX certification. No harmful dyes, no synthetic fibers, verified clean throughout production.",
    affiliateUrl:`https://www.amazon.com/s?k=Mini+Rodini+kids+organic+sweatshirt&tag=${AMAZON_TAG}`,
    price:"$55-80",
    tags:["sweatshirt","hoodie","kids outerwear","outerwear","kids jacket","children","toddler","organic cotton","GOTS","OEKO-TEX","layer","kids sweater","warm"]
  },
  {
    id:"cl-311", name:"Turtledove London Organic Kids Hoodie", brand:"Turtledove London",
    plasticScore:2, category:"clothing",
    material:"100% GOTS-certified organic cotton — no azo dyes, no formaldehyde finishes",
    description:"GOTS certified organic cotton kids hoodie. Undyed or low-impact dyes only, verified formaldehyde-free.",
    affiliateUrl:`https://www.amazon.com/s?k=Turtledove+London+organic+kids+hoodie&tag=${AMAZON_TAG}`,
    price:"$45-65",
    tags:["hoodie","kids jacket","kids outerwear","outerwear","children","toddler","organic cotton","GOTS","no azo dyes","layer","warm","kids sweater"]
  },
  {
    id:"bk-016", name:"Andy Pandy Organic Bamboo Diapers", brand:"Andy Pandy",
    plasticScore:2, category:"baby",
    material:"Organic bamboo — no chlorine bleaching, no phthalates, no latex, fragrance-free",
    description:"Organic bamboo diapers with no chlorine bleaching, no fragrance, no phthalates. Hypoallergenic and biodegradable. Safer for direct baby skin contact.",
    affiliateUrl:`https://www.amazon.com/s?k=Andy+Pandy+organic+bamboo+diapers&tag=${AMAZON_TAG}`,
    price:"$18-26",
    tags:["diaper","diapers","baby diaper","organic diaper","bamboo diaper","chlorine free diaper","newborn","infant","toddler","training pants","pull up","pull-up","nappy","eco diaper"]
  },
  {
    id:"bk-017", name:"Dyper Bamboo Diapers", brand:"Dyper",
    plasticScore:2, category:"baby",
    material:"Viscose from bamboo — no chlorine bleaching, no fragrance, no lotion, no latex",
    description:"Bamboo-based diapers with no chlorine bleaching, no synthetic fragrance, no lotions. Compostable via their take-back program. Much lower chemical load than conventional diapers.",
    affiliateUrl:`https://www.amazon.com/s?k=Dyper+bamboo+diapers&tag=${AMAZON_TAG}`,
    price:"$20-30",
    tags:["diaper","diapers","baby diaper","bamboo diaper","chlorine free","organic diaper","newborn","infant","eco diaper","compostable diaper","nappy","training pants"]
  },
  {
    id:"bk-018", name:"Healthynest Organic Cotton Diapers", brand:"Healthynest",
    plasticScore:2, category:"baby",
    material:"Organic cotton top sheet — no chlorine bleaching, no fragrance, no phthalates, MADE SAFE certified",
    description:"MADE SAFE certified diapers with organic cotton touching baby skin. No chlorine bleaching, no synthetic fragrance, no phthalates. Vetted ingredient list.",
    affiliateUrl:`https://www.amazon.com/s?k=Healthynest+organic+cotton+diapers&tag=${AMAZON_TAG}`,
    price:"$22-32",
    tags:["diaper","diapers","baby diaper","organic cotton diaper","chlorine free","made safe","organic diaper","newborn","infant","nappy","training pants","pull up"]
  },
  {
    id:"bk-019", name:"GroVia Hybrid Cloth Diaper", brand:"GroVia",
    plasticScore:1, category:"baby",
    material:"Organic cotton insert — reusable shell, no synthetic chemicals, no bleaching",
    description:"Hybrid cloth diaper system with organic cotton inserts. Reusable shell, washable, no bleaching chemicals, no synthetic fragrances. Best long-term option for baby skin safety.",
    affiliateUrl:`https://www.amazon.com/s?k=GroVia+hybrid+cloth+diaper&tag=${AMAZON_TAG}`,
    price:"$18-28",
    tags:["cloth diaper","reusable diaper","diaper","baby diaper","organic cotton","training pants","pull up","nappy","eco diaper","diaper alternative","natural diaper"]
  },
  {
    id:"bk-020", name:"Esembly Organic Cotton Training Pants", brand:"Esembly",
    plasticScore:1, category:"baby",
    material:"GOTS-certified organic cotton — no synthetic materials touching skin, reusable",
    description:"Organic cotton reusable training pants. No polypropylene, no chlorine bleaching, no superabsorbent polymers. The cleanest option for potty training skin contact.",
    affiliateUrl:`https://www.amazon.com/s?k=Esembly+organic+training+pants&tag=${AMAZON_TAG}`,
    price:"$20-30",
    tags:["training pants","potty training pants","pull up","pull-up","training underwear","toddler underwear","organic cotton","diaper","baby","toddler","reusable training pants","cloth training pants"]
  },
  {
    id:"bk-021", name:"Honest Company Diapers", brand:"Honest Company",
    plasticScore:5, category:"baby",
    material:"Inner liner PE+PP (petroleum, direct skin contact). Outer backsheet PLA+PE (partial plant-based). ECF wood pulp. No synthetic fragrance. Polymer spandex waist/leg.",
    description:"Mid-tier diaper — better than Pampers/Huggies, not as clean as bamboo. The plant-based claim refers to the outer backsheet, not the skin-contact layer which is still PE/PP. No synthetic fragrance is a genuine positive. ECF pulp is cleaner than conventional bleaching.",
    affiliateUrl:`https://www.amazon.com/s?k=Honest+Company+diapers&tag=${AMAZON_TAG}`,
    price:"$18-28",
    tags:["diaper","diapers","baby diaper","honest diaper","plant based diaper","eco diaper","fragrance free diaper","newborn","infant","toddler","nappy","training pants","pull up"]
  },
  {
    id:"bk-022", name:"Hello Bello Diapers", brand:"Hello Bello",
    plasticScore:4, category:"baby",
    material:"Corn-derived PLA fiber inner liner (plant-based at skin-contact layer). Sustainably harvested fluff pulp. 100% chlorine-free. No fragrance, no phthalates, no parabens, no latex. Made in USA.",
    description:"Genuinely better than Honest/Millie Moon because the plant-based PLA liner is on the inside — the layer actually touching baby skin. 100% chlorine-free (TCF). No fragrance. Sold at Walmart. A meaningful step up from conventional diapers.",
    affiliateUrl:`https://www.amazon.com/s?k=Hello+Bello+diapers&tag=${AMAZON_TAG}`,
    price:"$14-22",
    tags:["diaper","diapers","baby diaper","hello bello diaper","plant based diaper","eco diaper","chlorine free diaper","fragrance free","newborn","infant","toddler","nappy","training pants"]
  },
  {
    id:"bk-023", name:"Millie Moon Luxury Diapers", brand:"Millie Moon",
    plasticScore:5, category:"baby",
    material:"Polypropylene non-woven fabrics, polyethylene film, ECF wood pulp, SAP. OEKO-TEX Standard 100 certified. Dermatest approved. No fragrance.",
    description:"Conventional petroleum plastics throughout — same tier as Honest Company. The OEKO-TEX and Dermatest certifications are genuine positives for third-party testing. No fragrance. Available at Target. Not as clean as Hello Bello (no plant-based skin-contact layer).",
    affiliateUrl:`https://www.amazon.com/s?k=Millie+Moon+diapers&tag=${AMAZON_TAG}`,
    price:"$18-28",
    tags:["diaper","diapers","baby diaper","millie moon diaper","luxury diaper","fragrance free","oeko-tex","dermatest","newborn","infant","toddler","nappy","target diaper","training pants"]
  },
  {
    id:"wl-001", name:"Garden of Life Organic Protein Powder", brand:"Garden of Life",
    plasticScore:2, category:"supplement",
    material:"USDA organic, non-GMO, no artificial sweeteners or synthetic additives",
    description:"USDA certified organic plant protein. No artificial sweeteners, synthetic flavors or fillers. Third-party tested.",
    affiliateUrl:`https://www.amazon.com/s?k=Garden+of+Life+organic+protein+powder&tag=${AMAZON_TAG}`,
    price:"$35-45",
    tags:["protein powder","plant protein","organic protein","food beverage","supplement","vegan protein","clean ingredients"]
  },
  {
    id:"wl-002", name:"Ritual Multivitamin", brand:"Ritual",
    plasticScore:2, category:"personal_care",
    material:"Traceable, clean ingredients — no synthetic dyes, shady fillers or undisclosed additives",
    description:"Multivitamin with fully traceable, non-GMO ingredients. No synthetic dyes, unnecessary fillers or undisclosed additives.",
    affiliateUrl:`https://www.amazon.com/s?k=Ritual+multivitamin&tag=${AMAZON_TAG}`,
    price:"$30-40",
    tags:["multivitamin","vitamin","supplement","personal care","clean ingredients","traceable","women","men","prenatal"]
  },
  {
    id:"wl-003", name:"Thorne Basic Nutrients Multivitamin", brand:"Thorne",
    plasticScore:2, category:"personal_care",
    material:"No artificial colors, flavors or preservatives — NSF certified for sport",
    description:"NSF-certified multivitamin with no unnecessary additives, artificial colors or synthetic preservatives. Third-party tested.",
    affiliateUrl:`https://www.amazon.com/s?k=Thorne+Basic+Nutrients+multivitamin&tag=${AMAZON_TAG}`,
    price:"$40-55",
    tags:["multivitamin","vitamin","supplement","personal care","NSF certified","clean ingredients","no additives"]
  },
  // ── HOME FRAGRANCE & AIR CARE ────────────────────────────────
  {
    id:"hf-001", name:"Pura Smart Fragrance Diffuser", brand:"Pura",
    plasticScore:2, category:"other",
    material:"Fragrance oils — no phthalates, no formaldehyde, no carcinogens",
    description:"Smart home diffuser with phthalate-free fragrance oils. No aerosol propellants, no synthetic carcinogens.",
    affiliateUrl:`https://www.amazon.com/s?k=Pura+smart+fragrance+diffuser&tag=${AMAZON_TAG}`,
    price:"$44-54",
    tags:["air freshener","diffuser","home fragrance","smart diffuser","phthalate free","non toxic fragrance","home","room spray"]
  },
  {
    id:"hf-002", name:"Grow Fragrance Room Spray", brand:"Grow Fragrance",
    plasticScore:2, category:"other",
    material:"100% plant-based fragrance, no synthetic chemicals or phthalates",
    description:"100% plant-based room spray with no phthalates, parabens or synthetic fragrance chemicals. Biodegradable formula.",
    affiliateUrl:`https://www.amazon.com/s?k=Grow+Fragrance+room+spray&tag=${AMAZON_TAG}`,
    price:"$14-18",
    tags:["room spray","air freshener","home fragrance","plant based","phthalate free","non toxic fragrance","home","spray"]
  },
  {
    id:"hf-003", name:"Fontana Candle Company Soy Candle", brand:"Fontana Candle",
    plasticScore:1, category:"other",
    material:"100% soy wax, cotton wick, no paraffin or synthetic fragrance",
    description:"Pure soy wax candle with cotton wick and clean fragrance. No paraffin (petroleum byproduct), no synthetic dyes.",
    affiliateUrl:`https://www.amazon.com/s?k=soy+candle+cotton+wick+clean+fragrance&tag=${AMAZON_TAG}`,
    price:"$18-28",
    tags:["candle","soy candle","clean candle","non toxic candle","cotton wick","paraffin free","home fragrance","home"]
  },
  {
    id:"hf-004", name:"Vitruvi Stone Diffuser", brand:"Vitruvi",
    plasticScore:1, category:"other",
    material:"Ceramic diffuser body — no plastic housing touching water or oil",
    description:"Ceramic ultrasonic diffuser for essential oils. No plastic in the water or oil path. Clean air delivery.",
    affiliateUrl:`https://www.amazon.com/s?k=Vitruvi+stone+diffuser&tag=${AMAZON_TAG}`,
    price:"$119-135",
    tags:["diffuser","essential oil diffuser","ceramic diffuser","home fragrance","air freshener","non toxic","home","ultrasonic"]
  },
  {
    id:"hf-005", name:"P.F. Candle Co. Soy Candle", brand:"P.F. Candle Co.",
    plasticScore:1, category:"other",
    material:"100% domestically grown soy wax, cotton-core wick, phthalate-free fragrance",
    description:"Soy wax candle with cotton wick and phthalate-free fragrance. No paraffin, no lead wick, no synthetic dyes.",
    affiliateUrl:`https://www.amazon.com/s?k=PF+Candle+Co+soy+candle&tag=${AMAZON_TAG}`,
    price:"$20-26",
    tags:["candle","soy candle","clean candle","non toxic candle","phthalate free","cotton wick","home fragrance","home"]
  },

  // ── LAUNDRY ───────────────────────────────────────────────────
  {
    id:"la-001", name:"Wool Dryer Balls by Smart Sheep", brand:"Smart Sheep",
    plasticScore:1, category:"personal_care",
    material:"100% New Zealand wool — no synthetic materials",
    description:"Pure wool dryer balls replace dryer sheets entirely. No synthetic fragrance, no fabric softener chemicals, reusable for 1,000+ loads.",
    affiliateUrl:`https://www.amazon.com/s?k=Smart+Sheep+wool+dryer+balls&tag=${AMAZON_TAG}`,
    price:"$16-22",
    tags:["dryer balls","wool dryer balls","dryer sheets alternative","fabric softener alternative","laundry","natural","wool","reusable"]
  },
  {
    id:"la-002", name:"Tru Earth Laundry Strips", brand:"Tru Earth",
    plasticScore:1, category:"personal_care",
    material:"Concentrated strip — no plastic jug, no PVA film, no synthetic fragrance",
    description:"Laundry strips with zero plastic packaging. No PVA film, no 1,4-dioxane, no synthetic fragrance. Cardboard envelope only.",
    affiliateUrl:`https://www.amazon.com/s?k=Tru+Earth+laundry+strips&tag=${AMAZON_TAG}`,
    price:"$14-20",
    tags:["laundry strips","laundry detergent","washing","plastic free","zero waste","fragrance free","cardboard","concentrated"]
  },
  {
    id:"la-003", name:"ECOS Laundry Detergent", brand:"ECOS",
    plasticScore:3, category:"personal_care",
    material:"Plant-derived, EPA Safer Choice, no optical brighteners or synthetic fragrance",
    description:"EPA Safer Choice certified liquid detergent. Plant-derived, no optical brighteners, synthetic fragrance or 1,4-dioxane.",
    affiliateUrl:`https://www.amazon.com/s?k=ECOS+laundry+detergent&tag=${AMAZON_TAG}`,
    price:"$14-18",
    tags:["laundry detergent","liquid detergent","washing","plant based","EPA safer choice","fragrance free","optical brightener free"]
  },
  {
    id:"la-004", name:"Grab Green Natural Fabric Softener", brand:"Grab Green",
    plasticScore:3, category:"personal_care",
    material:"Plant and mineral-derived, no synthetic fragrance, no quaternary compounds",
    description:"Plant-derived fabric softener without synthetic fragrance, parabens or quaternary compounds. Safer Choice certified.",
    affiliateUrl:`https://www.amazon.com/s?k=Grab+Green+natural+fabric+softener&tag=${AMAZON_TAG}`,
    price:"$12-16",
    tags:["fabric softener","laundry","natural fabric softener","plant based","fragrance free","non toxic","dryer sheet alternative"]
  },
  {
    id:"la-005", name:"Guppyfriend Washing Bag", brand:"Guppyfriend",
    plasticScore:2, category:"clothing",
    material:"Microplastic-catching filter bag — captures synthetic fibers before they reach waterways",
    description:"Washing bag that captures microfibers from synthetic clothing before they enter waterways. Reduces microplastic ocean pollution per wash.",
    affiliateUrl:`https://www.amazon.com/s?k=Guppyfriend+washing+bag&tag=${AMAZON_TAG}`,
    price:"$34-40",
    tags:["washing bag","guppyfriend","microfiber","microplastic filter","laundry","synthetic clothing","microfiber bag","ocean plastic"]
  },

  // ── KIDS SNACKS & FOOD ────────────────────────────────────────
  {
    id:"ks-001", name:"Annie's Organic Fruit Snacks", brand:"Annie's",
    plasticScore:2, category:"food_beverage",
    material:"Organic fruit juice, no synthetic dyes or artificial flavors",
    description:"USDA organic fruit snacks with no synthetic dyes, artificial flavors or HFCS. Made with real fruit juice.",
    affiliateUrl:`https://www.amazon.com/s?k=Annies+organic+fruit+snacks&tag=${AMAZON_TAG}`,
    price:"$5-8",
    tags:["fruit snacks","kids snacks","organic snacks","food beverage","no synthetic dyes","kids","snack","organic"]
  },
  {
    id:"ks-002", name:"Plum Organics Baby Pouch", brand:"Plum Organics",
    plasticScore:2, category:"food_beverage",
    material:"Organic whole ingredients, no added sugar or synthetic additives",
    description:"USDA organic baby food pouch. No added sugar, synthetic additives or preservatives. Non-GMO verified.",
    affiliateUrl:`https://www.amazon.com/s?k=Plum+Organics+baby+pouch&tag=${AMAZON_TAG}`,
    price:"$1-3",
    tags:["baby food","baby pouch","organic baby food","food beverage","baby","infant","no added sugar","organic","puree"]
  },
  {
    id:"ks-003", name:"Happy Baby Organic Puffs", brand:"Happy Baby",
    plasticScore:2, category:"food_beverage",
    material:"Organic whole grain, no synthetic dyes, artificial flavors or HFCS",
    description:"USDA organic baby puffs. No synthetic dyes, artificial flavors or high-fructose corn syrup. Non-GMO verified.",
    affiliateUrl:`https://www.amazon.com/s?k=Happy+Baby+organic+puffs&tag=${AMAZON_TAG}`,
    price:"$4-6",
    tags:["baby puffs","baby snacks","organic baby food","food beverage","baby","toddler","organic","finger food","no synthetic dyes"]
  },
  {
    id:"ks-004", name:"Larabars", brand:"Larabar",
    plasticScore:2, category:"food_beverage",
    material:"Whole food ingredients — dates, nuts, fruit. Nothing else.",
    description:"Minimal ingredient bars — most contain only 2 to 5 whole food ingredients. No synthetic additives, preservatives or artificial flavors.",
    affiliateUrl:`https://www.amazon.com/s?k=Larabar+fruit+nut+bar&tag=${AMAZON_TAG}`,
    price:"$1-2",
    tags:["snack bar","fruit bar","nut bar","food beverage","whole food","clean ingredients","no additives","dates","kids","snack"]
  },
  {
    id:"ks-005", name:"Organic Valley Whole Milk", brand:"Organic Valley",
    plasticScore:2, category:"food_beverage",
    material:"Certified organic milk — no synthetic hormones, no synthetic pesticides",
    description:"USDA certified organic whole milk. No synthetic growth hormones (rBST), no synthetic pesticides. Pasture-raised.",
    affiliateUrl:`https://www.amazon.com/s?k=Organic+Valley+whole+milk&tag=${AMAZON_TAG}`,
    price:"$6-8",
    tags:["milk","organic milk","whole milk","dairy milk","cow milk","hormone free","rBST free","organic dairy","kids drink","dairy"]
  },
  {
    id:"ks-006", name:"Stonyfield Organic Whole Milk Yogurt", brand:"Stonyfield",
    plasticScore:2, category:"food_beverage",
    material:"Certified organic milk, live cultures — no synthetic hormones or artificial additives",
    description:"USDA organic whole milk yogurt. No synthetic hormones, artificial flavors, sweeteners or thickeners.",
    affiliateUrl:`https://www.amazon.com/s?k=Stonyfield+organic+whole+milk+yogurt&tag=${AMAZON_TAG}`,
    price:"$5-7",
    tags:["yogurt","organic yogurt","whole milk yogurt","dairy yogurt","hormone free","organic dairy","probiotic","dairy"]
  },

  // ── MEN'S GROOMING ────────────────────────────────────────────
  {
    id:"mg-001", name:"Every Man Jack Face Wash", brand:"Every Man Jack",
    plasticScore:2, category:"personal_care",
    material:"Plant-derived, no parabens, dyes, phthalates or synthetic fragrance",
    description:"EWG-verified mens face wash. Plant-derived, no parabens, synthetic fragrance or phthalates.",
    affiliateUrl:`https://www.amazon.com/s?k=Every+Man+Jack+face+wash&tag=${AMAZON_TAG}`,
    price:"$8-12",
    tags:["face wash","mens face wash","facial cleanser","personal care","mens grooming","clean beauty","EWG verified","plant based"]
  },
  {
    id:"mg-002", name:"Bevel Safety Razor", brand:"Bevel",
    plasticScore:1, category:"personal_care",
    material:"Stainless steel — zero plastic in shaving path, replaceable blades",
    description:"Full stainless steel safety razor — no plastic cartridge, no synthetic coating on razor head. Single replaceable blade.",
    affiliateUrl:`https://www.amazon.com/s?k=Bevel+safety+razor&tag=${AMAZON_TAG}`,
    price:"$32-50",
    tags:["razor","safety razor","mens razor","shaving","stainless steel","plastic free razor","mens grooming","reusable razor"]
  },
  {
    id:"mg-003", name:"Bulldog Natural Face Moisturizer", brand:"Bulldog",
    plasticScore:2, category:"personal_care",
    material:"Plant-derived, no parabens, synthetic fragrance, SLS or artificial colors",
    description:"Mens daily face moisturizer with no parabens, SLS, synthetic fragrance or artificial colors. Cruelty-free.",
    affiliateUrl:`https://www.amazon.com/s?k=Bulldog+natural+face+moisturizer&tag=${AMAZON_TAG}`,
    price:"$9-13",
    tags:["face moisturizer","mens moisturizer","mens skin care","personal care","mens grooming","clean beauty","natural","paraben free"]
  },
  {
    id:"mg-004", name:"SheaMoisture Men Shea Butter Shave Cream", brand:"SheaMoisture",
    plasticScore:2, category:"personal_care",
    material:"Shea butter, essential oils — no parabens, phthalates or synthetic fragrance",
    description:"Shea butter shave cream with no parabens, phthalates or synthetic fragrance. Fair Trade certified shea.",
    affiliateUrl:`https://www.amazon.com/s?k=SheaMoisture+men+shave+cream&tag=${AMAZON_TAG}`,
    price:"$10-14",
    tags:["shave cream","shaving cream","mens grooming","personal care","shea butter","paraben free","phthalate free","natural shave"]
  },
  {
    id:"mg-005", name:"Baxter of California Clay Pomade", brand:"Baxter of California",
    plasticScore:3, category:"personal_care",
    material:"Clay base, no parabens — some synthetic fragrance components",
    description:"Clay hair pomade with no parabens. Natural clay base provides matte hold. Lower synthetic load than most styling products.",
    affiliateUrl:`https://www.amazon.com/s?k=Baxter+of+California+clay+pomade&tag=${AMAZON_TAG}`,
    price:"$18-24",
    tags:["hair pomade","clay pomade","mens hair","hair styling","mens grooming","personal care","clay","matte hold"]
  },

  // ── PET FOOD ──────────────────────────────────────────────────
  {
    id:"pt-101", name:"The Honest Kitchen Dehydrated Dog Food", brand:"The Honest Kitchen",
    plasticScore:2, category:"food_beverage",
    material:"Human-grade whole ingredients — no by-products, fillers or synthetic preservatives",
    description:"Human-grade dehydrated dog food with whole ingredients. No by-products, fillers, preservatives or artificial anything.",
    affiliateUrl:`https://www.amazon.com/s?k=Honest+Kitchen+dehydrated+dog+food&tag=${AMAZON_TAG}`,
    price:"$35-55",
    tags:["dog food","pet food","dehydrated dog food","whole ingredient","natural dog food","no preservatives","human grade","pet"]
  },
  {
    id:"pt-102", name:"Open Farm Dog Food", brand:"Open Farm",
    plasticScore:2, category:"food_beverage",
    material:"Humanely raised meat, no synthetic preservatives, artificial flavors or by-products",
    description:"Traceable, humanely raised dog food with no by-products, synthetic preservatives or artificial flavors. Certified Humane.",
    affiliateUrl:`https://www.amazon.com/s?k=Open+Farm+dog+food&tag=${AMAZON_TAG}`,
    price:"$20-35",
    tags:["dog food","pet food","natural dog food","no preservatives","humanely raised","pet","grain free","no by-products"]
  },
  {
    id:"pt-103", name:"Castor and Pollux Organix Cat Food", brand:"Castor and Pollux",
    plasticScore:2, category:"food_beverage",
    material:"USDA organic, no synthetic preservatives, artificial flavors or fillers",
    description:"USDA certified organic cat food. No synthetic preservatives, artificial flavors, colors or fillers.",
    affiliateUrl:`https://www.amazon.com/s?k=Castor+Pollux+Organix+cat+food&tag=${AMAZON_TAG}`,
    price:"$15-25",
    tags:["cat food","pet food","organic cat food","natural cat food","no preservatives","pet","organic","grain free"]
  },

  // ── FITNESS & PERSONAL CARE ───────────────────────────────────
  {
    id:"ft-001", name:"Manduka PRO Yoga Mat", brand:"Manduka",
    plasticScore:3, category:"other",
    material:"PVC-free polyurethane — no toxic plasticizers, closed-cell surface",
    description:"Made without toxic plasticizers or heavy metals. Closed-cell surface prevents bacteria absorption. Lasts 10+ years.",
    affiliateUrl:`https://www.amazon.com/s?k=Manduka+PRO+yoga+mat&tag=${AMAZON_TAG}`,
    price:"$120-140",
    tags:["yoga mat","exercise mat","fitness","workout","PVC free","non toxic mat","durable","long lasting"]
  },
  {
    id:"ft-002", name:"Liforme Natural Rubber Yoga Mat", brand:"Liforme",
    plasticScore:2, category:"other",
    material:"Natural rubber base, polyurethane top layer — no PVC, no toxic plasticizers",
    description:"Natural rubber yoga mat — no PVC, no toxic plasticizers, biodegradable base. AlignForMe system for posture alignment.",
    affiliateUrl:`https://www.amazon.com/s?k=Liforme+yoga+mat&tag=${AMAZON_TAG}`,
    price:"$150-180",
    tags:["yoga mat","natural rubber mat","fitness","workout","PVC free","natural rubber","non toxic","biodegradable"]
  },
  {
    id:"ft-003", name:"Nalgene Sustain Water Bottle", brand:"Nalgene",
    plasticScore:2, category:"kitchen",
    material:"50% recycled Tritan plastic — BPA and BPS free, no phthalates",
    description:"Made from 50% recycled Tritan — BPA-free, BPS-free, no phthalates. Lighter footprint than virgin plastic.",
    affiliateUrl:`https://www.amazon.com/s?k=Nalgene+Sustain+water+bottle&tag=${AMAZON_TAG}`,
    price:"$14-18",
    tags:["water bottle","reusable bottle","BPA free","tritan","recycled plastic","fitness","hydration","kitchen","hiking","outdoor"]
  },

  // ── OFFICE & SCHOOL ───────────────────────────────────────────
  {
    id:"of-101", name:"Leuchtturm1917 Hardcover Notebook", brand:"Leuchtturm1917",
    plasticScore:1, category:"other",
    material:"Paper and cardboard — no plastic coating, no synthetic binding",
    description:"FSC-certified paper hardcover notebook. No plastic coating, no synthetic binding. Acid-free pages.",
    affiliateUrl:`https://www.amazon.com/s?k=Leuchtturm1917+hardcover+notebook&tag=${AMAZON_TAG}`,
    price:"$22-28",
    tags:["notebook","journal","hardcover notebook","paper","FSC certified","plastic free","office","school","writing","stationery"]
  },
  {
    id:"of-102", name:"Pilot B2P Recycled Plastic Pens", brand:"Pilot",
    plasticScore:3, category:"other",
    material:"89% recycled plastic bottles — lower virgin plastic footprint",
    description:"Ballpoint pen made from 89% recycled plastic bottles. Lower virgin plastic footprint than standard pens.",
    affiliateUrl:`https://www.amazon.com/s?k=Pilot+B2P+recycled+plastic+pen&tag=${AMAZON_TAG}`,
    price:"$8-12",
    tags:["pen","ballpoint pen","recycled pen","office","school","stationery","recycled plastic","writing"]
  },
  {
    id:"of-103", name:"Staedtler Noris Pencils", brand:"Staedtler",
    plasticScore:1, category:"other",
    material:"FSC-certified wood, water-based lacquer — zero plastic",
    description:"FSC-certified wood pencils with water-based lacquer. Zero plastic — fully compostable at end of life.",
    affiliateUrl:`https://www.amazon.com/s?k=Staedtler+Noris+pencils&tag=${AMAZON_TAG}`,
    price:"$6-10",
    tags:["pencil","wood pencil","FSC certified","office","school","stationery","plastic free","kids","writing","sustainable"]
  },
  // ── SUNGLASSES & EYEWEAR ──────────────────────────────────────
  {
    id:"ew-001", name:"Warby Parker Acetate Frames", brand:"Warby Parker",
    plasticScore:3, category:"other",
    material:"Cellulose acetate — plant-derived, biodegradable vs petroleum plastic frames",
    description:"Acetate frames made from cellulose — a plant-derived, biodegradable material vs petroleum-based plastic. Lower chemical burden than standard polycarbonate.",
    affiliateUrl:`https://www.amazon.com/s?k=acetate+sunglasses+plant+based&tag=${AMAZON_TAG}`,
    price:"$95-145",
    tags:["sunglasses","eyewear","glasses","acetate frames","plant based","biodegradable frames","eyeglasses","frames"]
  },
  {
    id:"ew-201", name:"Sunski Polarized Sunglasses", brand:"Sunski",
    plasticScore:3, category:"other",
    material:"Recycled plastic frames — lower virgin plastic footprint, polarized lenses",
    description:"Sunglasses made from recycled plastic with polarized lenses. Lower virgin plastic footprint than conventional frames.",
    affiliateUrl:`https://www.amazon.com/s?k=Sunski+polarized+sunglasses&tag=${AMAZON_TAG}`,
    price:"$58-78",
    tags:["sunglasses","polarized sunglasses","recycled plastic","eyewear","outdoor","UV protection","recycled frames"]
  },
  {
    id:"ew-003", name:"Proof Eyewear Wood Sunglasses", brand:"Proof Eyewear",
    plasticScore:1, category:"accessory",
    material:"Reclaimed wood and recycled aluminum — zero petroleum plastic",
    description:"Frames made from reclaimed wood and recycled aluminum. Zero petroleum plastic — fully natural or recycled materials.",
    affiliateUrl:`https://www.amazon.com/s?k=wood+sunglasses+natural+frames&tag=${AMAZON_TAG}`,
    price:"$89-129",
    tags:["sunglasses","wood sunglasses","wooden frames","eyewear","recycled","natural","plastic free sunglasses","UV protection"]
  },
  {
    id:"ew-004", name:"Pela Case Eco-Friendly Phone Case", brand:"Pela",
    plasticScore:2, category:"other",
    material:"Flaxstic — compostable bioplastic from flax shive, no petroleum plastic",
    description:"Compostable phone case made from flax shive bioplastic. Breaks down in home compost — no petroleum plastic.",
    affiliateUrl:`https://www.amazon.com/s?k=Pela+compostable+phone+case&tag=${AMAZON_TAG}`,
    price:"$49-59",
    tags:["phone case","compostable case","eco phone case","flax","bioplastic","plastic free","sustainable phone case","tech"]
  },
  {
    id:"ew-005", name:"Gunnar Blue Light Glasses", brand:"Gunnar",
    plasticScore:3, category:"other",
    material:"Standard plastic frames — amber-tinted lenses block blue light, no chemical coating concerns",
    description:"Blue light blocking glasses for screen use. Amber lenses reduce digital eye strain. Standard plastic but long-lasting build quality.",
    affiliateUrl:`https://www.amazon.com/s?k=Gunnar+blue+light+glasses&tag=${AMAZON_TAG}`,
    price:"$49-99",
    tags:["blue light glasses","computer glasses","screen glasses","eyewear","eye strain","digital eye strain","office","desk"]
  },

  // ── MEDICATIONS & FIRST AID ───────────────────────────────────
  {
    id:"fa-001", name:"Boiron Arnica Gel", brand:"Boiron",
    plasticScore:2, category:"personal_care",
    material:"Homeopathic arnica — no synthetic chemicals, no parabens or petroleum ingredients",
    description:"Topical arnica gel for bruises and muscle soreness. No synthetic chemicals, petroleum ingredients or parabens.",
    affiliateUrl:`https://www.amazon.com/s?k=Boiron+Arnicare+arnica+gel&tag=${AMAZON_TAG}`,
    price:"$10-14",
    tags:["arnica gel","pain relief","muscle pain","bruise","first aid","natural pain relief","topical","personal care","homeopathic"]
  },
  {
    id:"fa-002", name:"Welly Bravery Bandages", brand:"Welly",
    plasticScore:3, category:"personal_care",
    material:"Flexible fabric bandage — lower synthetic load than standard plastic adhesive strips",
    description:"Fabric bandages with cleaner adhesive than standard petroleum-backed strips. Flexible, breathable, no latex.",
    affiliateUrl:`https://www.amazon.com/s?k=Welly+fabric+bandages&tag=${AMAZON_TAG}`,
    price:"$7-10",
    tags:["bandages","band-aid","first aid","fabric bandage","latex free","personal care","wound care","kids","adhesive bandage"]
  },
  {
    id:"fa-003", name:"Burt's Bees Res-Q Ointment", brand:"Burts Bees",
    plasticScore:2, category:"personal_care",
    material:"Beeswax, plant oils — no petroleum jelly, no synthetic preservatives",
    description:"Multi-purpose skin ointment with beeswax and plant oils. No petroleum jelly, no synthetic preservatives or fragrances.",
    affiliateUrl:`https://www.amazon.com/s?k=Burts+Bees+res-q+ointment&tag=${AMAZON_TAG}`,
    price:"$8-12",
    tags:["ointment","skin ointment","first aid","beeswax","natural","no petroleum","personal care","multipurpose","wound care","chapped skin"]
  },
  {
    id:"fa-004", name:"Zarbees Naturals Cough Syrup", brand:"Zarbees",
    plasticScore:2, category:"other",
    material:"Dark honey base, no dyes, no alcohol, no artificial sweeteners",
    description:"Honey-based cough syrup with no artificial dyes, alcohol or synthetic sweeteners. Safe for kids over 1 year.",
    affiliateUrl:`https://www.amazon.com/s?k=Zarbees+naturals+cough+syrup&tag=${AMAZON_TAG}`,
    price:"$9-13",
    tags:["cough syrup","kids medicine","natural cough remedy","no dyes","no artificial sweeteners","first aid","baby","kids"]
  },
  {
    id:"fa-005", name:"Badger Sleep Balm", brand:"Badger",
    plasticScore:1, category:"personal_care",
    material:"Certified organic beeswax, plant oils and essential oils — no synthetic ingredients",
    description:"USDA certified organic sleep balm with lavender and chamomile. No synthetic fragrance, no petroleum ingredients.",
    affiliateUrl:`https://www.amazon.com/s?k=Badger+sleep+balm&tag=${AMAZON_TAG}`,
    price:"$8-12",
    tags:["sleep balm","sleep aid","lavender","chamomile","organic","natural sleep","personal care","beeswax","no synthetic","relaxation"]
  },
  {
    id:"fa-006", name:"Dr. Bronners Organic Hand Sanitizer", brand:"Dr. Bronners",
    plasticScore:2, category:"personal_care",
    material:"Ethanol from organic sugar cane, organic aloe — no synthetic thickeners or fragrance",
    description:"USDA organic hand sanitizer with no synthetic thickeners, fragrance or drying petroleum ingredients.",
    affiliateUrl:`https://www.amazon.com/s?k=Dr+Bronners+organic+hand+sanitizer&tag=${AMAZON_TAG}`,
    price:"$5-9",
    tags:["hand sanitizer","sanitizer","personal care","organic","no synthetic fragrance","ethanol","aloe","natural","antibacterial"]
  },
  {
    id:"fa-007", name:"Tiger Balm Natural Pain Relief", brand:"Tiger Balm",
    plasticScore:2, category:"personal_care",
    material:"Camphor, menthol, clove oil — plant-derived actives, no synthetic pain relief chemicals",
    description:"Traditional herbal pain relief balm with plant-derived actives. No synthetic analgesics, no petroleum ingredients.",
    affiliateUrl:`https://www.amazon.com/s?k=Tiger+Balm+pain+relief&tag=${AMAZON_TAG}`,
    price:"$8-14",
    tags:["pain relief","muscle pain","herbal balm","topical pain relief","natural","camphor","menthol","first aid","personal care","arthritis"]
  },

  // ── ART & CRAFT SUPPLIES ──────────────────────────────────────
  {
    id:"ar-001", name:"Faber-Castell Polychromos Colored Pencils", brand:"Faber-Castell",
    plasticScore:1, category:"other",
    material:"Cedar wood barrel, oil-based pigment — no ABS plastic casing",
    description:"Cedar wood colored pencils with lightfast oil-based pigment. No plastic barrel — fully wood construction.",
    affiliateUrl:`https://www.amazon.com/s?k=Faber-Castell+Polychromos+colored+pencils&tag=${AMAZON_TAG}`,
    price:"$20-85",
    tags:["colored pencils","pencils","art supplies","drawing","kids","school","wood pencil","plastic free","craft","stationery"]
  },
  {
    id:"ar-002", name:"Stockmar Beeswax Crayons", brand:"Stockmar",
    plasticScore:1, category:"toy",
    material:"Beeswax and plant-based pigments — no paraffin, no petroleum wax, no synthetic dyes",
    description:"Beeswax crayons with plant-based pigments. No paraffin, no petroleum wax, no synthetic dyes. Safe for young children.",
    affiliateUrl:`https://www.amazon.com/s?k=Stockmar+beeswax+crayons&tag=${AMAZON_TAG}`,
    price:"$18-35",
    tags:["crayons","beeswax crayons","kids art","art supplies","non toxic crayons","plant pigment","no paraffin","natural crayons","toddler","craft"]
  },
  {
    id:"ar-003", name:"Melissa and Doug Tempera Paint", brand:"Melissa and Doug",
    plasticScore:2, category:"other",
    material:"Water-based tempera — no solvent-based chemicals, washable formula",
    description:"Water-based washable tempera paint. No solvent-based chemicals or harsh synthetic dyes. Safe for kids.",
    affiliateUrl:`https://www.amazon.com/s?k=Melissa+Doug+tempera+paint+washable&tag=${AMAZON_TAG}`,
    price:"$10-18",
    tags:["paint","kids paint","tempera paint","art supplies","washable paint","water based","non toxic paint","kids","craft","school"]
  },
  {
    id:"ar-004", name:"Elmer's Washable School Glue", brand:"Elmers",
    plasticScore:2, category:"other",
    material:"PVA water-based adhesive — no solvent, no toxic compounds, washable",
    description:"Water-based PVA school glue with no solvents or toxic compounds. Fully washable, safe for all ages.",
    affiliateUrl:`https://www.amazon.com/s?k=Elmers+washable+school+glue&tag=${AMAZON_TAG}`,
    price:"$4-8",
    tags:["glue","school glue","craft glue","art supplies","washable glue","PVA glue","kids","school","non toxic glue","craft"]
  },
  {
    id:"ar-005", name:"Arteza Watercolor Paints", brand:"Arteza",
    plasticScore:2, category:"other",
    material:"Water-based watercolor — no solvent-based chemicals or heavy metal pigments",
    description:"Water-based watercolor set with no heavy metal pigments or solvents. Non-toxic ASTM D-4236 certified.",
    affiliateUrl:`https://www.amazon.com/s?k=Arteza+watercolor+paint+set&tag=${AMAZON_TAG}`,
    price:"$12-22",
    tags:["watercolor","watercolor paint","art supplies","painting","water based","non toxic paint","ASTM certified","kids","school","artist"]
  },
  {
    id:"ar-006", name:"ALEX Toys Finger Paint Set", brand:"ALEX Toys",
    plasticScore:2, category:"other",
    material:"Water-based finger paint — washable, no solvent-based chemicals",
    description:"Washable water-based finger paint. No solvent-based chemicals, no harsh synthetic dyes. Washes off skin and clothing.",
    affiliateUrl:`https://www.amazon.com/s?k=ALEX+Toys+finger+paint+set&tag=${AMAZON_TAG}`,
    price:"$8-14",
    tags:["finger paint","kids paint","art supplies","washable paint","water based","toddler","baby","craft","non toxic","sensory"]
  },

  // ── TECH ACCESSORIES ──────────────────────────────────────────
  {
    id:"tc-001", name:"Anker USB-C Braided Cable", brand:"Anker",
    plasticScore:3, category:"other",
    material:"Nylon braided exterior — more durable than PVC cables, reduces replacement waste",
    description:"Nylon-braided USB-C cable — significantly more durable than PVC-coated cables, reducing how often you replace it.",
    affiliateUrl:`https://www.amazon.com/s?k=Anker+USB-C+braided+cable&tag=${AMAZON_TAG}`,
    price:"$9-14",
    tags:["USB cable","USB-C","phone cable","charging cable","braided cable","nylon","durable cable","tech","charger","long lasting"]
  },
  {
    id:"tc-002", name:"Native Union Belt Cable", brand:"Native Union",
    plasticScore:3, category:"accessory",
    material:"Braided nylon exterior, reinforced stress points — built to last vs disposable PVC cables",
    description:"Ultra-durable braided cable with reinforced stress points. Designed to replace cheap PVC cables that fray and end up in landfill.",
    affiliateUrl:`https://www.amazon.com/s?k=Native+Union+belt+cable&tag=${AMAZON_TAG}`,
    price:"$25-35",
    tags:["USB cable","USB-C","lightning cable","charging cable","braided cable","durable","tech","long lasting","phone cable"]
  },
  {
    id:"tc-003", name:"Mophie MagSafe Charger", brand:"Mophie",
    plasticScore:3, category:"other",
    material:"Standard plastic housing — reduced cable waste through wireless charging",
    description:"Wireless MagSafe charger that eliminates cable wear and replacement waste. Fewer cables in landfill over time.",
    affiliateUrl:`https://www.amazon.com/s?k=Mophie+MagSafe+wireless+charger&tag=${AMAZON_TAG}`,
    price:"$29-39",
    tags:["wireless charger","MagSafe","phone charger","charging","tech","iPhone","cable free","wireless charging"]
  },
  {
    id:"tc-004", name:"Casetify Impact Phone Case", brand:"Casetify",
    plasticScore:3, category:"other",
    material:"EcoShock material — 65% recycled and plant-based materials",
    description:"Phone case made from 65% recycled and plant-based materials. Drops the petroleum plastic footprint vs standard TPU cases.",
    affiliateUrl:`https://www.amazon.com/s?k=Casetify+recycled+phone+case&tag=${AMAZON_TAG}`,
    price:"$55-70",
    tags:["phone case","iPhone case","recycled phone case","sustainable case","tech","plant based","recycled materials","drop protection"]
  },
  {
    id:"tc-005", name:"Nimble Sustainable Power Bank", brand:"Nimble",
    plasticScore:3, category:"other",
    material:"Recycled aluminum and plastic housing — certified B Corp, takeback recycling program",
    description:"Power bank made with recycled materials. Certified B Corp with a free mail-back recycling program for end of life.",
    affiliateUrl:`https://www.amazon.com/s?k=Nimble+sustainable+power+bank&tag=${AMAZON_TAG}`,
    price:"$35-55",
    tags:["power bank","portable charger","battery pack","tech","recycled","B Corp","sustainable charger","USB-C","phone charger"]
  },

  // ── TRAVEL ────────────────────────────────────────────────────
  {
    id:"tr-101", name:"Cadence Capsule Travel Containers", brand:"Cadence",
    plasticScore:2, category:"other",
    material:"Recycled aluminum capsules — no single-use plastic travel bottles",
    description:"Refillable recycled aluminum travel capsules — eliminate single-use plastic travel bottles entirely. Leak-proof, TSA-compliant.",
    affiliateUrl:`https://www.amazon.com/s?k=Cadence+travel+capsule+container&tag=${AMAZON_TAG}`,
    price:"$9-12",
    tags:["travel containers","travel bottles","TSA containers","toiletry bottles","travel","refillable","aluminum","plastic free travel","carry on"]
  },
  {
    id:"tr-102", name:"Matador FlatPak Toiletry Case", brand:"Matador",
    plasticScore:3, category:"other",
    material:"Recycled TPU — lower footprint than virgin plastic, waterproof",
    description:"Ultralight waterproof toiletry case made from recycled TPU. Collapses flat when empty to reduce bulk.",
    affiliateUrl:`https://www.amazon.com/s?k=Matador+FlatPak+toiletry+case&tag=${AMAZON_TAG}`,
    price:"$25-35",
    tags:["toiletry bag","travel bag","dopp kit","waterproof bag","travel","recycled","carry on","TSA","toiletry case"]
  },
  {
    id:"tr-103", name:"Away Carry-On Suitcase", brand:"Away",
    plasticScore:3, category:"other",
    material:"Polycarbonate shell — BPA-free, lightweight, designed for longevity over replacement",
    description:"BPA-free polycarbonate hardshell suitcase built to last 10+ years. Lifetime warranty reduces landfill contribution vs cheap luggage.",
    affiliateUrl:`https://www.amazon.com/s?k=Away+carry+on+suitcase&tag=${AMAZON_TAG}`,
    price:"$275-325",
    tags:["suitcase","carry on","luggage","travel","hardshell","polycarbonate","BPA free","durable luggage","lifetime warranty"]
  },
  {
    id:"tr-104", name:"Patagonia Black Hole Duffel", brand:"Patagonia",
    plasticScore:3, category:"other",
    material:"100% recycled polyester — no virgin synthetic fibers",
    description:"100% recycled polyester duffel bag. Bluesign-approved fabric — no virgin synthetic fibers, Fair Trade certified.",
    affiliateUrl:`https://www.amazon.com/s?k=Patagonia+Black+Hole+duffel+bag&tag=${AMAZON_TAG}`,
    price:"$99-149",
    tags:["duffel bag","travel bag","gym bag","recycled polyester","travel","Patagonia","fair trade","bluesign","weekend bag"]
  },
  {
    id:"tr-105", name:"Sea to Summit Lightweight Dry Bag", brand:"Sea to Summit",
    plasticScore:3, category:"other",
    material:"Ultra-Sil nylon — extremely lightweight, replaces multiple plastic bags",
    description:"Ultralight dry bag that replaces zip-lock bags and single-use plastic bags when traveling. Waterproof, reusable indefinitely.",
    affiliateUrl:`https://www.amazon.com/s?k=Sea+to+Summit+dry+bag&tag=${AMAZON_TAG}`,
    price:"$15-35",
    tags:["dry bag","waterproof bag","travel","outdoor","reusable","nylon","packing","zip lock alternative","beach bag","camping"]
  },

  // ── FEMININE HYGIENE (EXPANDED) ───────────────────────────────
  {
    id:"fh-001", name:"August Organic Cotton Pads", brand:"August",
    plasticScore:2, category:"personal_care",
    material:"100% organic cotton — no synthetic fibers, chlorine bleaching or plastic mesh",
    description:"GOTS-certified organic cotton pads with no plastic mesh top layer, no chlorine bleaching or synthetic fragrance.",
    affiliateUrl:`https://www.amazon.com/s?k=August+organic+cotton+pads&tag=${AMAZON_TAG}`,
    price:"$8-12",
    tags:["pads","period pads","organic pads","organic cotton","feminine care","period","no plastic","chlorine free","natural pads"]
  },
  {
    id:"fh-002", name:"Rael Organic Cotton Tampons", brand:"Rael",
    plasticScore:2, category:"personal_care",
    material:"100% organic cotton — no synthetic fibers, rayon, chlorine bleaching or fragrance",
    description:"GOTS-certified organic cotton tampons. No rayon, no synthetic fragrance, no chlorine bleaching. BPA-free applicator option.",
    affiliateUrl:`https://www.amazon.com/s?k=Rael+organic+cotton+tampons&tag=${AMAZON_TAG}`,
    price:"$9-13",
    tags:["tampons","organic tampons","organic cotton","feminine care","period","no rayon","chlorine free","natural tampons","BPA free applicator"]
  },
  {
    id:"fh-003", name:"Cora Organic Tampons", brand:"Cora",
    plasticScore:2, category:"personal_care",
    material:"100% organic cotton — no synthetic fibers, chlorine bleaching or fragrance",
    description:"100% organic cotton tampons with no synthetic fibers, chlorine bleaching or fragrance. Compact BPA-free applicator.",
    affiliateUrl:`https://www.amazon.com/s?k=Cora+organic+cotton+tampons&tag=${AMAZON_TAG}`,
    price:"$9-13",
    tags:["tampons","organic tampons","organic cotton","feminine care","period","chlorine free","BPA free","natural tampons","compact"]
  },
  {
    id:"fh-004", name:"Saalt Menstrual Disc", brand:"Saalt",
    plasticScore:1, category:"personal_care",
    material:"Medical-grade silicone — no BPA, latex or toxins, reusable for years",
    description:"Medical-grade silicone menstrual disc — holds more than a tampon, reusable for years. No BPA, phthalates or latex.",
    affiliateUrl:`https://www.amazon.com/s?k=Saalt+menstrual+disc&tag=${AMAZON_TAG}`,
    price:"$29-39",
    tags:["menstrual disc","period disc","feminine care","menstrual cup","reusable","silicone","BPA free","plastic free period","zero waste"]
  },
  {
    id:"fh-005", name:"Knix Period Underwear", brand:"Knix",
    plasticScore:3, category:"clothing",
    material:"Recycled nylon and spandex blend — replaces disposable pads entirely",
    description:"Period underwear that replaces single-use pads. Absorbent leak-proof layer eliminates disposable period product waste.",
    affiliateUrl:`https://www.amazon.com/s?k=Knix+period+underwear&tag=${AMAZON_TAG}`,
    price:"$28-38",
    tags:["period underwear","reusable period","feminine care","period","reusable","underwear","leak proof","zero waste period","sustainable period"]
  },
  {
    id:"fh-006", name:"Thinx Period Underwear", brand:"Thinx",
    plasticScore:3, category:"clothing",
    material:"Recycled polyester and nylon — replaces disposable single-use pads",
    description:"Period underwear that absorbs up to 5 tampons worth. Replaces disposable pads — reduces single-use period product waste.",
    affiliateUrl:`https://www.amazon.com/s?k=Thinx+period+underwear&tag=${AMAZON_TAG}`,
    price:"$32-45",
    tags:["period underwear","reusable period","feminine care","period","underwear","leak proof","zero waste period","sustainable period","absorbent"]
  },

  // ── GARDEN & OUTDOOR ──────────────────────────────────────────
  {
    id:"ga-001", name:"Dr. Earth Organic Fertilizer", brand:"Dr. Earth",
    plasticScore:1, category:"other",
    material:"100% organic matter — no synthetic nitrogen, no sewage sludge, no GMOs",
    description:"USDA certified organic fertilizer with no synthetic nitrogen, sewage sludge or GMOs. Safe around kids and pets.",
    affiliateUrl:`https://www.amazon.com/s?k=Dr+Earth+organic+fertilizer&tag=${AMAZON_TAG}`,
    price:"$14-24",
    tags:["fertilizer","organic fertilizer","garden","plant food","soil","organic","non toxic","kids safe","pet safe","gardening"]
  },
  {
    id:"ga-002", name:"Fox Farm Ocean Forest Potting Soil", brand:"Fox Farm",
    plasticScore:1, category:"other",
    material:"Aged forest products, earthworm castings, bat guano — no synthetic fertilizers",
    description:"Organic potting mix with aged forest products and earthworm castings. No synthetic fertilizers or harmful pesticides.",
    affiliateUrl:`https://www.amazon.com/s?k=Fox+Farm+Ocean+Forest+potting+soil&tag=${AMAZON_TAG}`,
    price:"$18-28",
    tags:["potting soil","garden soil","potting mix","gardening","organic soil","indoor plants","outdoor","plant","natural","worm castings"]
  },
  {
    id:"ga-003", name:"Safer Brand Insect Killing Soap", brand:"Safer Brand",
    plasticScore:2, category:"other",
    material:"Potassium salts of fatty acids — no synthetic pesticides, OMRI certified organic",
    description:"OMRI certified organic insect control using potassium salts — no synthetic pesticides, safe for edible plants.",
    affiliateUrl:`https://www.amazon.com/s?k=Safer+Brand+insect+killing+soap&tag=${AMAZON_TAG}`,
    price:"$8-14",
    tags:["insecticide","garden spray","organic pesticide","OMRI","gardening","bug spray","plant care","non toxic","aphids","indoor plants"]
  },
  {
    id:"ga-004", name:"Biodegradable Plant Pots", brand:"Jiffy",
    plasticScore:1, category:"other",
    material:"Peat and wood fiber — fully compostable, no plastic",
    description:"Peat and wood fiber seed starting pots — plant directly in ground, pot composts with the soil. No plastic waste.",
    affiliateUrl:`https://www.amazon.com/s?k=biodegradable+seedling+pots+compostable&tag=${AMAZON_TAG}`,
    price:"$8-14",
    tags:["plant pots","seedling pots","seed starting","compostable pots","biodegradable","gardening","plastic free","peat pots","propagation"]
  },
  {
    id:"ga-005", name:"LifeStraw Personal Water Filter", brand:"LifeStraw",
    plasticScore:3, category:"other",
    material:"ABS plastic housing — filters 4,000 liters, replaces thousands of plastic bottles",
    description:"Filters 4,000 liters per filter — replacing thousands of single-use plastic water bottles over its lifetime.",
    affiliateUrl:`https://www.amazon.com/s?k=LifeStraw+personal+water+filter&tag=${AMAZON_TAG}`,
    price:"$19-25",
    tags:["water filter","portable filter","outdoor","camping","hiking","travel","water bottle alternative","plastic bottle alternative","survival"]
  },
  {
    id:"ga-006", name:"Fiskars Steel Garden Trowel", brand:"Fiskars",
    plasticScore:1, category:"other",
    material:"Stainless steel blade, aluminum handle — no plastic, built to last decades",
    description:"All-metal garden trowel with stainless steel blade and aluminum handle. No plastic — built to last a lifetime.",
    affiliateUrl:`https://www.amazon.com/s?k=Fiskars+stainless+steel+garden+trowel&tag=${AMAZON_TAG}`,
    price:"$14-20",
    tags:["garden trowel","trowel","garden tool","stainless steel","gardening","metal","durable","plastic free garden","outdoor","planting"]
  },
  {
    id:"ga-007", name:"Espoma Organic Plant Tone", brand:"Espoma",
    plasticScore:1, category:"other",
    material:"All-natural ingredients — feather meal, bone meal, composted poultry. No synthetic chemicals.",
    description:"All-natural slow-release plant fertilizer. No synthetic chemicals, safe for edible plants. OMRI listed for organic gardening.",
    affiliateUrl:`https://www.amazon.com/s?k=Espoma+Plant-tone+organic+fertilizer&tag=${AMAZON_TAG}`,
    price:"$14-20",
    tags:["fertilizer","plant food","organic fertilizer","OMRI","garden","gardening","slow release","all natural","edible plants","vegetables"]
  },

  // ── BEDDING (EXPANDED) ────────────────────────────────────────
  {
    id:"bd-001", name:"Avocado Green Pillow", brand:"Avocado Green",
    plasticScore:1, category:"other",
    material:"GOTS-certified organic latex and wool — no polyurethane foam, no synthetic fill",
    description:"GOTS and MADE SAFE certified organic latex and wool pillow. No polyurethane foam, no synthetic fill or chemical treatments.",
    affiliateUrl:`https://www.amazon.com/s?k=Avocado+Green+organic+pillow&tag=${AMAZON_TAG}`,
    price:"$89-119",
    tags:["pillow","organic pillow","latex pillow","wool pillow","GOTS","non toxic pillow","bedroom","sleep","organic","MADE SAFE"]
  },
  {
    id:"bd-002", name:"Saatva Latex Pillow", brand:"Saatva",
    plasticScore:2, category:"other",
    material:"Organic latex core, organic cotton cover — no synthetic foam or polyester fill",
    description:"Organic latex pillow with organic cotton cover. No synthetic foam, no polyester fill, no chemical fire retardants.",
    affiliateUrl:`https://www.amazon.com/s?k=natural+latex+pillow+organic+cotton&tag=${AMAZON_TAG}`,
    price:"$95-135",
    tags:["pillow","latex pillow","organic pillow","organic cotton","bedroom","sleep","non toxic","no synthetic foam","natural latex"]
  },
  {
    id:"bd-003", name:"Buffy Breeze Comforter", brand:"Buffy",
    plasticScore:3, category:"other",
    material:"Eucalyptus lyocell shell, recycled polyester fill — lower impact than virgin synthetic",
    description:"Eucalyptus lyocell shell with recycled bottle fill. Lower impact than virgin polyester comforters. Climate-neutral certified.",
    affiliateUrl:`https://www.amazon.com/s?k=Buffy+breeze+comforter+eucalyptus&tag=${AMAZON_TAG}`,
    price:"$149-199",
    tags:["comforter","duvet","eucalyptus","lyocell","recycled fill","bedroom","sleep","cooling comforter","climate neutral","non toxic"]
  },
  {
    id:"bd-004", name:"Authenticity 50 Organic Cotton Mattress Topper", brand:"Authenticity 50",
    plasticScore:2, category:"other",
    material:"GOTS-certified organic cotton fill and cover — no synthetic foam or polyester",
    description:"GOTS-certified organic cotton mattress topper with no synthetic foam, polyester or flame retardant chemicals.",
    affiliateUrl:`https://www.amazon.com/s?k=organic+cotton+mattress+topper+GOTS&tag=${AMAZON_TAG}`,
    price:"$89-149",
    tags:["mattress topper","organic mattress topper","GOTS","organic cotton","bedroom","sleep","non toxic","no synthetic foam","flame retardant free"]
  },
  {
    id:"bd-005", name:"Weighted Idea Organic Cotton Weighted Blanket", brand:"Weighted Idea",
    plasticScore:2, category:"other",
    material:"Organic cotton shell, glass bead filling — no plastic pellets, no synthetic shell",
    description:"Organic cotton weighted blanket filled with glass beads instead of plastic pellets. No synthetic shell, no chemical finishes.",
    affiliateUrl:`https://www.amazon.com/s?k=organic+cotton+weighted+blanket+glass+beads&tag=${AMAZON_TAG}`,
    price:"$45-75",
    tags:["weighted blanket","organic weighted blanket","glass beads","organic cotton","bedroom","sleep","anxiety","no plastic pellets","non toxic"]
  },

  // ── SUPPLEMENTS ───────────────────────────────────────────────
  {
    id:"su-001", name:"Ritual Essential Multivitamin", brand:"Ritual",
    plasticScore:2, category:"supplement",
    material:"Vegan capsule, chelated minerals, no synthetic dyes, no artificial sweeteners. Delayed-release capsule design.",
    description:"Third-party tested multivitamin with no synthetic dyes, no artificial sweeteners, full ingredient traceability. Non-GMO, vegan. One of the cleanest mainstream multivitamins.",
    affiliateUrl:`https://www.amazon.com/s?k=Ritual+multivitamin&tag=${AMAZON_TAG}`,
    price:"$33-40",
    tags:["multivitamin","vitamin","supplement","women's multivitamin","men's multivitamin","no artificial dyes","vegan","non-gmo","third party tested","clean supplement"]
  },
  {
    id:"su-002", name:"Nordic Naturals Ultimate Omega", brand:"Nordic Naturals",
    plasticScore:2, category:"supplement",
    material:"Fish oil in soft gel. Friend of the Sea certified. No artificial colors or flavors. Third-party tested for heavy metals and PCBs.",
    description:"The gold standard for fish oil. Third-party tested for heavy metals, PCBs, and dioxins. Friend of the Sea certified. No artificial colors. NSF certified.",
    affiliateUrl:`https://www.amazon.com/s?k=Nordic+Naturals+Ultimate+Omega&tag=${AMAZON_TAG}`,
    price:"$35-55",
    tags:["fish oil","omega 3","omega-3","supplement","dha","epa","third party tested","no heavy metals","friend of the sea","nsf certified","clean supplement"]
  },
  {
    id:"su-003", name:"Momentous Whey Protein", brand:"Momentous",
    plasticScore:2, category:"supplement",
    material:"NSF Certified for Sport and Informed Sport certified. No artificial dyes, no proprietary blends. Third-party tested for heavy metals.",
    description:"The benchmark for clean protein powder. NSF Certified for Sport + Informed Sport — two independent certifications. No artificial dyes, no artificial sweeteners, heavy metals tested.",
    affiliateUrl:`https://www.amazon.com/s?k=Momentous+whey+protein&tag=${AMAZON_TAG}`,
    price:"$55-75",
    tags:["protein powder","whey protein","supplement","nsf certified","informed sport","no artificial dyes","no artificial sweeteners","third party tested","clean protein","no heavy metals"]
  },
  {
    id:"su-004", name:"Seed DS-01 Daily Synbiotic", brand:"Seed",
    plasticScore:2, category:"supplement",
    material:"Nested capsule (outer algae-based, inner vegan). No fillers, no binders, no synthetic dyes. 53 clinically studied strains.",
    description:"Science-backed probiotic with no synthetic additives. Algae-based outer capsule protects strains from stomach acid. Third-party tested. Refillable glass jar.",
    affiliateUrl:`https://www.amazon.com/s?k=Seed+DS-01+synbiotic+probiotic&tag=${AMAZON_TAG}`,
    price:"$49-60",
    tags:["probiotic","supplement","synbiotic","no synthetic dyes","vegan","third party tested","gut health","clean supplement","refillable","glass jar"]
  },
  {
    id:"su-005", name:"Garden of Life Dr. Formulated Probiotics", brand:"Garden of Life",
    plasticScore:2, category:"supplement",
    material:"USDA Organic, Non-GMO Project Verified, no synthetic dyes, no binders, no fillers. Vegetable capsule.",
    description:"USDA Organic certified probiotic. No synthetic dyes, no artificial sweeteners, no binders. Non-GMO Verified. Clean shelf-stable formula.",
    affiliateUrl:`https://www.amazon.com/s?k=Garden+of+Life+probiotics&tag=${AMAZON_TAG}`,
    price:"$28-45",
    tags:["probiotic","supplement","organic supplement","usda organic","non-gmo","no artificial dyes","vegetable capsule","gut health","clean supplement"]
  },
  {
    id:"su-006", name:"Thorne Vitamin D/K2 Liquid", brand:"Thorne",
    plasticScore:2, category:"supplement",
    material:"NSF Certified for Sport. No artificial dyes, no synthetic fillers, no preservatives. Manufactured in certified facilities.",
    description:"One of the most trusted supplement brands. NSF Certified for Sport. No artificial colors or flavors, no preservatives. Bioavailable liquid form.",
    affiliateUrl:`https://www.amazon.com/s?k=Thorne+Vitamin+D+K2+liquid&tag=${AMAZON_TAG}`,
    price:"$18-28",
    tags:["vitamin d","vitamin k2","supplement","nsf certified","no artificial dyes","no preservatives","third party tested","clean supplement","thorne","bioavailable"]
  },
  {
    id:"su-007", name:"Flintstones Gummies Kids Vitamins", brand:"Flintstones",
    plasticScore:6, category:"supplement",
    material:"Red 40, Yellow 6, Blue 1 petroleum dyes. Gelatin, sugar. Artificial flavors.",
    description:"Children's gummy vitamins with multiple petroleum-based dyes — Red 40, Yellow 6, and Blue 1, all FDA-flagged or under review. Daily child consumption of synthetic dyes is a real concern.",
    affiliateUrl:`https://www.amazon.com/s?k=Flintstones+gummy+vitamins&tag=${AMAZON_TAG}`,
    price:"$12-18",
    tags:["gummy vitamin","kids vitamin","children's vitamin","multivitamin","supplement","gummy","flintstones"]
  },

  // ── TOYS ─────────────────────────────────────────────────────
  {
    id:"ty-101", name:"PlanToys Wooden Building Blocks", brand:"PlanToys",
    plasticScore:1, category:"toy",
    material:"Rubberwood (formaldehyde-free), water-based non-toxic dyes, organic pigments. No PVC, no BPA, no phthalates. Chemical-free kiln drying.",
    description:"The cleanest wooden toy brand. Uses rubberwood from rubber trees past latex production — no virgin deforestation. Water-based non-toxic dyes. No plastics whatsoever.",
    affiliateUrl:`https://www.amazon.com/s?k=PlanToys+wooden+blocks&tag=${AMAZON_TAG}`,
    price:"$20-45",
    tags:["wooden toy","building blocks","toy","baby toy","toddler toy","no plastic","non toxic toy","sustainable toy","natural toy","wooden blocks","plantoys"]
  },
  {
    id:"ty-102", name:"Melissa & Doug Wooden Puzzle", brand:"Melissa & Doug",
    plasticScore:2, category:"toy",
    material:"Solid wood, non-toxic paint, smooth sanded edges. No BPA, no phthalates. ASTM and EN71 safety certified.",
    description:"The most accessible clean wooden toy brand. Solid wood with non-toxic paint, ASTM certified. Major step up from plastic toys on materials safety.",
    affiliateUrl:`https://www.amazon.com/s?k=Melissa+Doug+wooden+puzzle&tag=${AMAZON_TAG}`,
    price:"$12-30",
    tags:["wooden toy","puzzle","toy","kids toy","toddler toy","non toxic toy","melissa and doug","wooden puzzle","educational toy","no plastic"]
  },
  {
    id:"ty-103", name:"HABA Wooden Stacking Toy", brand:"HABA",
    plasticScore:1, category:"toy",
    material:"European beech wood, water-based non-toxic lacquers. OEKO-TEX certified materials. No formaldehyde, no phthalates, no ABS plastic.",
    description:"German-made wooden toys with OEKO-TEX certified materials. Beech wood with water-based lacquers. The European standard for clean children's toys.",
    affiliateUrl:`https://www.amazon.com/s?k=HABA+wooden+stacking+toy&tag=${AMAZON_TAG}`,
    price:"$18-50",
    tags:["wooden toy","stacking toy","toy","baby toy","toddler toy","oeko-tex","non toxic","german toy","haba","no plastic","beech wood"]
  },
  {
    id:"ty-104", name:"Grimm's Rainbow Wooden Toy", brand:"Grimm's",
    plasticScore:1, category:"toy",
    material:"Linden wood, water-based paints, linseed oil finish. No synthetic coatings. ASTM and EN71 certified. Zero plastic components.",
    description:"Cult favourite open-ended wooden toy. Linden wood with water-based paint. Zero plastic anywhere in the product. Lasts decades and can be composted.",
    affiliateUrl:`https://www.amazon.com/s?k=Grimms+rainbow+wooden+toy&tag=${AMAZON_TAG}`,
    price:"$45-80",
    tags:["wooden toy","rainbow toy","toy","baby toy","toddler toy","open ended toy","grimms","non toxic toy","no plastic","linden wood","waldorf toy"]
  },
  {
    id:"ty-105", name:"Beeswax Modeling Clay", brand:"Stockmar",
    plasticScore:1, category:"toy",
    material:"100% pure beeswax, natural mineral pigments. No synthetic chemicals, no petroleum derivatives, no phthalates. Food-grade safe.",
    description:"Natural alternative to Play-Doh and synthetic modeling clay. Pure beeswax with mineral pigments — completely safe even if mouthed. No synthetic dyes, no preservatives.",
    affiliateUrl:`https://www.amazon.com/s?k=Stockmar+beeswax+modeling+clay&tag=${AMAZON_TAG}`,
    price:"$15-30",
    tags:["modeling clay","play clay","toy","art supply","non toxic","beeswax","natural clay","kids art","no synthetic dyes","safe for kids","play-doh alternative"]
  },

  // ── HOME ─────────────────────────────────────────────────────
  {
    id:"hm-001", name:"Branch Basics Concentrate", brand:"Branch Basics",
    plasticScore:1, category:"home",
    material:"Plant-derived surfactants, no synthetic fragrance, no dyes, no preservatives. Concentrated — dilute for different uses. Refillable system.",
    description:"The cleanest multi-purpose cleaning concentrate. No synthetic fragrance, no optical brighteners, no dyes, no preservatives. One bottle replaces all cleaners.",
    affiliateUrl:`https://www.amazon.com/s?k=Branch+Basics+concentrate+cleaner&tag=${AMAZON_TAG}`,
    price:"$49-69",
    tags:["cleaner","cleaning","multi purpose cleaner","non toxic cleaner","no synthetic fragrance","no dyes","concentrate","refillable","plant based cleaner","laundry","dish soap","all purpose"]
  },
  {
    id:"hm-002", name:"Blueland Multi-Surface Cleaner Tablets", brand:"Blueland",
    plasticScore:1, category:"home",
    material:"Plant-derived ingredients, zero synthetic fragrance, zero PVA, no dyes. Tablet dissolves in water. Refillable glass/aluminum bottles.",
    description:"Tablet-based cleaning that eliminates single-use plastic. No PVA (unlike Tide/Cascade pods which shed microplastics), no synthetic fragrance. Certified B-Corp.",
    affiliateUrl:`https://www.amazon.com/s?k=Blueland+cleaner+tablets&tag=${AMAZON_TAG}`,
    price:"$14-22",
    tags:["cleaner","cleaning tablet","multi surface cleaner","non toxic cleaner","no pva","no synthetic fragrance","b-corp","zero plastic","refillable","eco cleaner","tide alternative","cascade alternative","laundry","dish"]
  },
  {
    id:"hm-003", name:"Seventh Generation Free & Clear Laundry", brand:"Seventh Generation",
    plasticScore:3, category:"home",
    material:"Plant-derived surfactants, no synthetic dyes, no synthetic fragrance, no optical brighteners. Fragrance-free and dye-free.",
    description:"The most accessible clean laundry detergent. No synthetic fragrance, no dyes, no optical brighteners. EPA Safer Choice certified. Widely available.",
    affiliateUrl:`https://www.amazon.com/s?k=Seventh+Generation+free+clear+laundry&tag=${AMAZON_TAG}`,
    price:"$14-20",
    tags:["laundry detergent","laundry","cleaner","no synthetic fragrance","no dyes","no optical brighteners","epa safer choice","free and clear","fragrance free","dye free","tide alternative","gain alternative"]
  },
  {
    id:"hm-004", name:"Beeswax Candle (Handcrafted)", brand:"Big Dipper Wax Works",
    plasticScore:1, category:"home",
    material:"100% pure filtered beeswax, cotton wick. No paraffin (petroleum), no synthetic fragrance, no dye.",
    description:"Pure beeswax burns cleaner than any paraffin or soy candle. Naturally sweet honey scent from the beeswax itself. No synthetic fragrance VOCs, no petroleum.",
    affiliateUrl:`https://www.amazon.com/s?k=100+percent+beeswax+candle&tag=${AMAZON_TAG}`,
    price:"$15-35",
    tags:["candle","beeswax candle","home","non toxic candle","no synthetic fragrance","no paraffin","clean candle","natural candle","cotton wick","yankee alternative","bath body works alternative"]
  },
  {
    id:"hm-005", name:"P.F. Candle Co. Soy Candle", brand:"P.F. Candle Co.",
    plasticScore:2, category:"home",
    material:"100% domestically grown soy wax, phthalate-free fragrance oils, cotton wick. No paraffin, no lead.",
    description:"Clean soy candle with phthalate-free fragrance. Significant step up from Yankee Candle (paraffin + synthetic fragrance). Not as clean as beeswax but much better than conventional.",
    affiliateUrl:`https://www.amazon.com/s?k=PF+Candle+Co+soy+candle&tag=${AMAZON_TAG}`,
    price:"$18-24",
    tags:["candle","soy candle","home","phthalate free","no paraffin","clean candle","cotton wick","yankee alternative","soy wax"]
  },
  {
    id:"hm-006", name:"Molly's Suds Laundry Powder", brand:"Molly's Suds",
    plasticScore:2, category:"home",
    material:"Sodium carbonate, sodium bicarbonate, sea salt, peppermint essential oil. Zero synthetic dyes, zero synthetic fragrance, zero optical brighteners.",
    description:"Five-ingredient laundry powder. Everything you need, nothing you don't. No synthetic fragrance, no dyes, no optical brighteners. Certified safe for HE machines.",
    affiliateUrl:`https://www.amazon.com/s?k=Mollys+Suds+laundry+powder&tag=${AMAZON_TAG}`,
    price:"$18-28",
    tags:["laundry powder","laundry detergent","laundry","no synthetic fragrance","no dyes","5 ingredients","clean laundry","he safe","tide alternative","non toxic laundry"]
  },

  // ── BEVERAGES ────────────────────────────────────────────────
  {
    id:"bv-001", name:"Athletic Brewing Run Wild IPA", brand:"Athletic Brewing",
    plasticScore:2, category:"beverage",
    material:"Non-alcoholic — real craft beer brewing process, zero ethanol. Aluminum can (recyclable). Clean grain-based ingredients.",
    description:"The cleanest beer alternative. Genuine craft brewing with no alcohol. No ethanol (IARC Group 1 avoided entirely). Aluminum can is fully recyclable. B-Corp certified.",
    affiliateUrl:`https://www.amazon.com/s?k=Athletic+Brewing+Run+Wild+IPA&tag=${AMAZON_TAG}`,
    price:"$12-18",
    tags:["non alcoholic beer","na beer","beer alternative","beverage","no alcohol","athletic brewing","craft beer","aluminum can","b-corp","beer","ipa"]
  },
  {
    id:"bv-002", name:"San Pellegrino Sparkling Water", brand:"San Pellegrino",
    plasticScore:2, category:"beverage",
    material:"Natural mineral water in glass bottle. No additives, no synthetic flavors, no sweeteners.",
    description:"Premium sparkling mineral water in glass — zero plastic leaching. Natural mineralization from Italian springs. No additives, no sweeteners.",
    affiliateUrl:`https://www.amazon.com/s?k=San+Pellegrino+sparkling+water+glass&tag=${AMAZON_TAG}`,
    price:"$18-28",
    tags:["sparkling water","mineral water","water","beverage","glass bottle","no plastic","natural water","pellegrino","soda alternative","no sweeteners","no additives"]
  },
  {
    id:"bv-003", name:"Nixie Organic Sparkling Water", brand:"Nixie",
    plasticScore:2, category:"beverage",
    material:"USDA Organic certified, no artificial sweeteners, no synthetic flavors, no dyes. Aluminum can.",
    description:"USDA Organic sparkling water — the cleanest flavored sparkling water option. No synthetic flavors, no artificial sweeteners, no dyes. Aluminum can is fully recyclable.",
    affiliateUrl:`https://www.amazon.com/s?k=Nixie+organic+sparkling+water&tag=${AMAZON_TAG}`,
    price:"$20-30",
    tags:["sparkling water","flavored sparkling water","water","beverage","usda organic","organic sparkling water","no artificial sweeteners","no synthetic flavors","aluminum can","la croix alternative","bubly alternative"]
  },
  {
    id:"bv-004", name:"Harmless Harvest Organic Coconut Water", brand:"Harmless Harvest",
    plasticScore:2, category:"beverage",
    material:"USDA Organic certified, fair trade. No additives, no sweeteners. Pink-tinted naturally from antioxidant reaction with light.",
    description:"Purest coconut water available. USDA Organic, fair trade, no additives. Single ingredient: organic coconut water. The pink color is a natural antioxidant reaction, not a dye.",
    affiliateUrl:`https://www.amazon.com/s?k=Harmless+Harvest+organic+coconut+water&tag=${AMAZON_TAG}`,
    price:"$4-7",
    tags:["coconut water","beverage","usda organic","fair trade","no additives","no sweeteners","natural beverage","harmless harvest","single ingredient","healthy beverage"]
  },

  // ── ACCESSORIES ───────────────────────────────────────────────
  {
    id:"ac-101", name:"Hydro Flask Standard Mouth", brand:"Hydro Flask",
    plasticScore:2, category:"accessory",
    material:"18/8 pro-grade stainless steel, no BPA, no BPS, no phthalates. Double-wall vacuum insulation. Powder coat exterior.",
    description:"The most popular clean water bottle. 18/8 stainless steel throughout — no plastic in the water path. BPA, BPS, and phthalate free. Lifetime warranty.",
    affiliateUrl:`https://www.amazon.com/s?k=Hydro+Flask+stainless+water+bottle&tag=${AMAZON_TAG}`,
    price:"$35-55",
    tags:["water bottle","stainless steel bottle","accessory","no bpa","no plastic","insulated bottle","hydro flask","reusable bottle","stanley alternative","yeti alternative","tumbler"]
  },
  {
    id:"ac-102", name:"Corkcicle Commuter Cup", brand:"Corkcicle",
    plasticScore:2, category:"accessory",
    material:"18/8 stainless steel, no BPA, triple-insulation. Flat bottom for cupholder compatibility.",
    description:"Clean stainless steel travel cup. 18/8 stainless throughout the water path, BPA-free lid. No plastic contact with hot or cold beverage.",
    affiliateUrl:`https://www.amazon.com/s?k=Corkcicle+commuter+cup+stainless&tag=${AMAZON_TAG}`,
    price:"$35-50",
    tags:["water bottle","tumbler","travel cup","stainless steel","accessory","no bpa","insulated","corkcicle","stanley alternative","coffee cup","commuter"]
  },
  {
    id:"ac-103", name:"Bellroy Note Sleeve Wallet", brand:"Bellroy",
    plasticScore:3, category:"accessory",
    material:"Traceable leather or recycled woven material. ZDHC certified dye process. B-Corp certified. Slim design reduces bulk.",
    description:"The benchmark for ethical accessories. Traceable leather supply chain, ZDHC certified dyes, B-Corp certified. Built to last 10+ years — lowest lifecycle impact.",
    affiliateUrl:`https://www.amazon.com/s?k=Bellroy+Note+Sleeve+wallet&tag=${AMAZON_TAG}`,
    price:"$60-90",
    tags:["wallet","slim wallet","accessory","leather wallet","b-corp","traceable leather","ethical fashion","sustainable accessory","bellroy","long lasting"]
  },
  {
    id:"ac-004", name:"S'well Original Stainless Bottle", brand:"S'well",
    plasticScore:2, category:"accessory",
    material:"18/8 stainless steel, no BPA, no BPS, no lead. Triple-layered insulation. No plastic in water contact path.",
    description:"Clean stainless steel bottle with certified non-toxic materials. 18/8 stainless throughout, BPA/BPS/lead-free. NSF certified for material safety.",
    affiliateUrl:`https://www.amazon.com/s?k=Swell+stainless+water+bottle&tag=${AMAZON_TAG}`,
    price:"$30-50",
    tags:["water bottle","stainless bottle","accessory","no bpa","no bps","nsf certified","insulated","swell","reusable bottle","travel bottle","tumbler","stanley alternative"]
  },

  // ══════════════════════════════════════════════════════════════
  // BEVERAGE ALTERNATIVES
  // ══════════════════════════════════════════════════════════════
  { id:"bv-005", name:"Spindrift Sparkling Water", brand:"Spindrift", plasticScore:1, category:"beverage",
    material:"Real squeezed fruit + sparkling water. No concentrate, no sweeteners, no flavoring.",
    description:"Cleanest flavored sparkling water. Real squeezed fruit, 1-2g sugar. No added sugar, no natural flavors.",
    affiliateUrl:"https://www.amazon.com/s?k=Spindrift+sparkling+water&tag=partiqule-20", price:"$18-28",
    tags:["sparkling water","sparkling","real fruit","flavored water","juice alternative","low sugar","soda alternative","lemon","lime","berry"] },

  { id:"bv-006", name:"GT's Synergy Kombucha", brand:"GT's", plasticScore:1, category:"beverage",
    material:"Raw organic kombucha — live cultures, USDA Organic, 4g sugar. Glass bottle.",
    description:"Best-in-class kombucha. USDA Organic, raw, live cultures, only 4g sugar. Glass bottle.",
    affiliateUrl:"https://www.amazon.com/s?k=GTs+Synergy+kombucha&tag=partiqule-20", price:"$4-6",
    tags:["kombucha","probiotic drink","fermented","soda alternative","low sugar","gut health","juice alternative","tea","glass bottle","organic"] },

  { id:"bv-007", name:"Olipop Prebiotic Soda", brand:"Olipop", plasticScore:2, category:"beverage",
    material:"Plant fiber, prebiotics, botanical extracts. No HFCS, no artificial sweeteners. 2-5g sugar.",
    description:"Soda that supports gut health. 9g fiber, 2-5g sugar, no artificial sweeteners.",
    affiliateUrl:"https://www.amazon.com/s?k=Olipop+prebiotic+soda&tag=partiqule-20", price:"$3-5",
    tags:["soda","soda alternative","prebiotic","low sugar","cola alternative","root beer","sparkling","gut health","juice alternative","coke alternative","pepsi alternative"] },

  { id:"bv-008", name:"Waterloo Sparkling Water", brand:"Waterloo", plasticScore:1, category:"beverage",
    material:"Purified water + natural fruit essence. Zero calories, zero sugar, zero sweeteners. Aluminum can.",
    description:"Ultra-clean sparkling water. No sugar, no artificial sweeteners, no natural flavors.",
    affiliateUrl:"https://www.amazon.com/s?k=Waterloo+sparkling+water&tag=partiqule-20", price:"$18-26",
    tags:["sparkling water","sparkling","zero sugar","no sweetener","soda alternative","la croix alternative","beverage","water","grapefruit","watermelon"] },

  { id:"bv-009", name:"Lakewood Organic Pure Juice", brand:"Lakewood", plasticScore:1, category:"beverage",
    material:"USDA Organic, not-from-concentrate, no added sugar, glass bottle.",
    description:"Cleanest bottled juice. USDA Organic, not-from-concentrate, glass bottle, no added sugar.",
    affiliateUrl:"https://www.amazon.com/s?k=Lakewood+Organic+juice&tag=partiqule-20", price:"$6-10",
    tags:["juice","orange juice","grape juice","apple juice","organic juice","not from concentrate","glass bottle","no added sugar","juice alternative","tropicana alternative","welchs alternative"] },

  { id:"bv-010", name:"Nuun Sport Electrolyte Tablets", brand:"Nuun", plasticScore:1, category:"beverage",
    material:"Electrolyte tablet — 1g sugar, no HFCS, no artificial colors. NSF Certified for Sport.",
    description:"Cleanest sports hydration. Only 1g sugar, no artificial colors. NSF Certified for Sport.",
    affiliateUrl:"https://www.amazon.com/s?k=Nuun+Sport+electrolyte+tablets&tag=partiqule-20", price:"$7-10",
    tags:["electrolyte","sports drink","hydration","gatorade alternative","powerade alternative","low sugar","no artificial color","nsf certified","athlete","workout drink"] },

  { id:"bv-011", name:"Honest Tea Organic", brand:"Honest Tea", plasticScore:2, category:"beverage",
    material:"USDA Organic brewed tea, fair trade. 10g natural sugar. No HFCS, no artificial flavors.",
    description:"Cleanest mainstream bottled tea. Organic, fair trade, just 10g sugar.",
    affiliateUrl:"https://www.amazon.com/s?k=Honest+Tea+organic&tag=partiqule-20", price:"$2-4",
    tags:["tea","bottled tea","iced tea","organic tea","green tea","black tea","low sugar","juice alternative","snapple alternative","arizona tea alternative","sweet tea alternative"] },

  { id:"bv-012", name:"R.W. Knudsen Family Organic Juice", brand:"R.W. Knudsen", plasticScore:1, category:"beverage",
    material:"USDA Organic, no preservatives, no added sugar, no artificial flavors.",
    description:"Benchmark organic juice. USDA Organic across the range, no additives.",
    affiliateUrl:"https://www.amazon.com/s?k=RW+Knudsen+organic+juice&tag=partiqule-20", price:"$5-8",
    tags:["juice","cranberry juice","berry juice","apple juice","organic juice","no added sugar","juice alternative","ocean spray alternative","no preservatives"] },

  // ══════════════════════════════════════════════════════════════
  // FROZEN FOOD ALTERNATIVES
  // ══════════════════════════════════════════════════════════════
  { id:"fz-001", name:"Amy's Organic Frozen Bowls", brand:"Amy's", plasticScore:2, category:"food_beverage",
    material:"USDA Organic, whole ingredients, no artificial flavors or preservatives. Non-GMO verified.",
    description:"Cleanest frozen bowl. Organic grains, organic vegetables, organic protein. No artificial anything.",
    affiliateUrl:"https://www.amazon.com/s?k=Amys+organic+frozen+bowl&tag=partiqule-20", price:"$5-7",
    tags:["frozen bowl","frozen meal","frozen entree","frozen food","organic frozen","lean cuisine alternative","healthy choice alternative","stouffers alternative","clean frozen","no preservatives","rice bowl","lasagna","pasta","italian"] },

  { id:"fz-002", name:"Amy's Organic Frozen Burritos", brand:"Amy's", plasticScore:2, category:"food_beverage",
    material:"USDA Organic, no artificial flavors or preservatives. Non-GMO. Whole ingredients.",
    description:"Benchmark clean frozen burrito. Organic beans, organic cheese, organic vegetables.",
    affiliateUrl:"https://www.amazon.com/s?k=Amys+organic+frozen+burrito&tag=partiqule-20", price:"$4-6",
    tags:["frozen burrito","frozen meal","frozen food","organic frozen","frozen entree","el monterey alternative","no preservatives","clean frozen","vegetarian","mexican food"] },

  { id:"fz-003", name:"EVOL Chicken Frozen Bowl", brand:"EVOL", plasticScore:2, category:"food_beverage",
    material:"Antibiotic-free chicken, whole grains, vegetables. No artificial colors or flavors.",
    description:"Cleaner mainstream frozen meal. Antibiotic-free protein, whole grains, no artificial anything.",
    affiliateUrl:"https://www.amazon.com/s?k=EVOL+frozen+bowl&tag=partiqule-20", price:"$4-6",
    tags:["frozen meal","frozen bowl","frozen entree","frozen food","antibiotic free","whole grain","lean cuisine alternative","healthy choice alternative","clean frozen","chicken","no artificial flavor"] },

  { id:"fz-004", name:"Dr. Praeger's Veggie Burgers", brand:"Dr. Praeger's", plasticScore:1, category:"food_beverage",
    material:"Whole vegetables, legumes. No isolated protein, no methylcellulose, no artificial anything.",
    description:"Cleanest veggie burger. Real vegetables and legumes — no artificial binders. Completely different from Beyond or Impossible.",
    affiliateUrl:"https://www.amazon.com/s?k=Dr+Praegers+veggie+burger&tag=partiqule-20", price:"$6-8",
    tags:["veggie burger","frozen burger","plant based burger","frozen food","frozen meal","morning star alternative","beyond meat alternative","impossible alternative","vegetables","non-gmo","clean frozen"] },

  { id:"fz-005", name:"Real Good Foods Chicken Enchiladas", brand:"Real Good Foods", plasticScore:2, category:"food_beverage",
    material:"Chicken breast, cheese, simple sauce. No enriched flour, no artificial additives. Low carb.",
    description:"Low-carb frozen meal with simple ingredients. Chicken, cheese, enchilada sauce — no enriched flour.",
    affiliateUrl:"https://www.amazon.com/s?k=Real+Good+Foods+chicken+enchilada&tag=partiqule-20", price:"$5-7",
    tags:["frozen meal","frozen food","frozen entree","low carb frozen","chicken","enchilada","no enriched flour","clean frozen","lean cuisine alternative","healthy choice alternative","high protein"] },

  // ══════════════════════════════════════════════════════════════
  // HOME / CLEANING ALTERNATIVES
  // ══════════════════════════════════════════════════════════════
  { id:"hm-010", name:"Branch Basics Concentrate", brand:"Branch Basics", plasticScore:1, category:"home",
    material:"Plant-derived surfactants, no synthetic fragrance, no dyes, no preservatives.",
    description:"Strictest clean cleaning brand. No synthetic fragrance, no dyes. EWG A-rated.",
    affiliateUrl:"https://www.amazon.com/s?k=Branch+Basics+concentrate&tag=partiqule-20", price:"$49-69",
    tags:["cleaner","all purpose cleaner","laundry","dish soap","concentrate","non toxic cleaner","no synthetic fragrance","lysol alternative","method alternative","mrs meyers alternative","tide alternative"] },

  { id:"hm-011", name:"Seventh Generation Free Clear Laundry", brand:"Seventh Generation", plasticScore:2, category:"home",
    material:"Plant-derived, no dyes, no synthetic fragrance, no optical brighteners. EPA Safer Choice.",
    description:"Accessible clean laundry swap. No synthetic fragrance, EPA Safer Choice. Best mainstream swap for Tide or Gain.",
    affiliateUrl:"https://www.amazon.com/s?k=Seventh+Generation+Free+Clear+laundry&tag=partiqule-20", price:"$12-18",
    tags:["laundry","laundry detergent","detergent","free and clear","no fragrance","no dyes","tide alternative","gain alternative","plant based","epa safer choice","washing","non toxic laundry","clothes"] },

  { id:"hm-012", name:"Meliora Cleaning Products Laundry Powder", brand:"Meliora", plasticScore:1, category:"home",
    material:"Sodium carbonate, soap, washing soda — 4 ingredients. Zero synthetic fragrance. B-Corp. Paper packaging.",
    description:"Simplest laundry detergent possible. Just 4 ingredients, no fragrance, paper packaging.",
    affiliateUrl:"https://www.amazon.com/s?k=Meliora+laundry+powder&tag=partiqule-20", price:"$14-20",
    tags:["laundry","laundry detergent","detergent","powder detergent","no fragrance","zero waste laundry","tide alternative","b-corp","paper packaging","simple ingredients","non toxic laundry","clothes washing"] },

  { id:"hm-013", name:"Puracy Natural Multi-Surface Cleaner", brand:"Puracy", plasticScore:1, category:"home",
    material:"Plant-derived, no synthetic fragrance, no dyes. EWG Verified, pediatrician recommended.",
    description:"EWG Verified multi-surface cleaner. Plant-derived, no synthetic fragrance, no dyes.",
    affiliateUrl:"https://www.amazon.com/s?k=Puracy+natural+multi-surface+cleaner&tag=partiqule-20", price:"$10-14",
    tags:["cleaner","multi surface cleaner","all purpose cleaner","non toxic cleaner","no synthetic fragrance","ewg verified","plant based cleaner","lysol alternative","windex alternative","method alternative","spray cleaner","household cleaner"] },

  // ══════════════════════════════════════════════════════════════
  // RESTAURANT ALTERNATIVES
  // ══════════════════════════════════════════════════════════════
  { id:"rs-001", name:"Sweetgreen Harvest Bowl", brand:"Sweetgreen", plasticScore:2, category:"restaurant",
    material:"Local and organic ingredients, whole grains, roasted vegetables, clean proteins.",
    description:"Benchmark clean fast-casual meal. Seasonal ingredients, whole grains, no artificial anything.",
    affiliateUrl:"https://www.sweetgreen.com", price:"$14-17",
    tags:["restaurant","fast casual","salad","bowl","grain bowl","clean restaurant","healthy fast food","whole grain","panda express alternative","chipotle alternative","lunch","dinner"] },

  { id:"rs-002", name:"Chipotle Burrito Bowl", brand:"Chipotle", plasticScore:2, category:"restaurant",
    material:"Responsibly raised chicken, whole ingredients, no artificial colors or preservatives.",
    description:"Cleanest major fast-casual chain. Responsibly raised protein, no artificial preservatives.",
    affiliateUrl:"https://www.chipotle.com", price:"$10-13",
    tags:["restaurant","fast casual","burrito bowl","bowl","chicken","mexican food","panda express alternative","taco bell alternative","clean restaurant","lunch","dinner","rice bowl"] },

  { id:"rs-003", name:"Cava Mediterranean Bowl", brand:"Cava", plasticScore:2, category:"restaurant",
    material:"Whole grains, hummus, roasted vegetables, grilled protein.",
    description:"Mediterranean fast-casual. Whole grains, legumes, olive oil, grilled protein. High protein, high fiber.",
    affiliateUrl:"https://www.cava.com", price:"$13-16",
    tags:["restaurant","fast casual","mediterranean","bowl","grain bowl","hummus","clean restaurant","panda express alternative","chipotle alternative","healthy fast food","high protein","lunch","dinner"] },

  { id:"rs-004", name:"El Pollo Loco Fire-Grilled Chicken", brand:"El Pollo Loco", plasticScore:2, category:"restaurant",
    material:"Fire-grilled marinated chicken. Citrus marinade, spices. Not fried.",
    description:"Cleanest major chicken chain. Fire-grilled not fried — no enriched flour batter.",
    affiliateUrl:"https://www.elpolloloco.com", price:"$9-13",
    tags:["restaurant","chicken","fast food","grilled chicken","kfc alternative","popeyes alternative","not fried","lower sodium","clean restaurant","lunch","dinner","panda express alternative"] },

  { id:"rs-005", name:"Panera Half Salad and Cup of Soup", brand:"Panera", plasticScore:2, category:"restaurant",
    material:"Whole ingredients, clean greens, broth-based soups.",
    description:"Best clean option at Panera. Half salad and cup of broth soup — lower sodium than most fast food.",
    affiliateUrl:"https://www.panerabread.com", price:"$11-14",
    tags:["restaurant","fast casual","salad","soup","panera","clean restaurant","lower sodium","lunch","healthy fast food","broth soup"] },

  // ── CANDY AND CHOCOLATE ALTERNATIVES ─────────────────────────
  { id:"ca-001", name:"YumEarth Organic Gummy Bears", brand:"YumEarth", plasticScore:2, category:"food_beverage",
    material:"USDA Organic, no petroleum dyes, no artificial flavors. Plant-based colors from fruit and vegetable juice.",
    description:"The benchmark clean gummy candy. No Red 40, Yellow 5/6, or Blue 1. USDA Organic, no synthetic dyes.",
    affiliateUrl:"https://www.amazon.com/s?k=YumEarth+organic+gummy+bears&tag=partiqule-20", price:"$4-7",
    tags:["gummy bears","gummy candy","candy","gummies","organic candy","no artificial dye","no red 40","haribo alternative","trolli alternative","chewy candy","kids candy","fruit snack"] },

  { id:"ca-002", name:"Hu Chocolate Bar", brand:"Hu", plasticScore:1, category:"food_beverage",
    material:"Organic cacao, organic coconut sugar. No refined sugar, no soy lecithin, no palm oil, no synthetic additives.",
    description:"The cleanest mainstream chocolate bar. No petroleum dyes, no HFCS, no soy lecithin. Direct clean swap for M&Ms or Snickers.",
    affiliateUrl:"https://www.amazon.com/s?k=Hu+chocolate+bar&tag=partiqule-20", price:"$4-6",
    tags:["chocolate","chocolate bar","candy","dark chocolate","clean chocolate","no refined sugar","m&m alternative","snickers alternative","candy alternative","paleo chocolate","vegan chocolate","chocolate candy"] },

  { id:"ca-003", name:"Unreal Dark Chocolate Gems", brand:"Unreal", plasticScore:2, category:"food_beverage",
    material:"No artificial colors — plant-based colors from vegetable juice. No corn syrup, no preservatives. Fair trade certified.",
    description:"The direct M&Ms swap. Same format, no petroleum dyes, no HFCS. Plant-based colors instead of Red 40 and Yellow 5/6.",
    affiliateUrl:"https://www.amazon.com/s?k=Unreal+dark+chocolate+gems&tag=partiqule-20", price:"$4-6",
    tags:["chocolate gems","candy coated chocolate","chocolate candy","candy","m&m alternative","no artificial dye","no red 40","no hfcs","fair trade","clean candy","chocolate pieces","chocolate coated"] },

  { id:"ca-004", name:"SmartSweets Gummy Bears", brand:"SmartSweets", plasticScore:2, category:"food_beverage",
    material:"Plant-based, no artificial sweeteners, no synthetic dyes, 3g sugar per bag.",
    description:"Low-sugar gummy candy with no artificial dyes or sweeteners. 3g sugar vs 47g in Skittles.",
    affiliateUrl:"https://www.amazon.com/s?k=SmartSweets+gummy+bears&tag=partiqule-20", price:"$3-5",
    tags:["gummy bears","gummy candy","candy","low sugar candy","no artificial dye","skittles alternative","starburst alternative","sour patch alternative","clean candy","kids candy","no red 40","chewy candy"] },

  { id:"ca-005", name:"Alter Eco Dark Chocolate Bar", brand:"Alter Eco", plasticScore:1, category:"food_beverage",
    material:"USDA Organic, fair trade, compostable wrapper. Simple ingredient list, no synthetic additives.",
    description:"Organic fair-trade dark chocolate with a compostable wrapper. No petroleum dyes, no HFCS.",
    affiliateUrl:"https://www.amazon.com/s?k=Alter+Eco+dark+chocolate&tag=partiqule-20", price:"$4-6",
    tags:["chocolate","dark chocolate","chocolate bar","candy","fair trade chocolate","organic chocolate","candy alternative","m&m alternative","kit kat alternative","clean candy","chocolate candy"] },

  { id:"ca-006", name:"Justin's Peanut Butter Cups", brand:"Justin's", plasticScore:2, category:"food_beverage",
    material:"USDA Organic, no artificial colors or flavors, fair trade cocoa.",
    description:"The clean Reese's swap. Organic ingredients, no artificial dyes, fair trade cocoa.",
    affiliateUrl:"https://www.amazon.com/s?k=Justins+peanut+butter+cups&tag=partiqule-20", price:"$2-4",
    tags:["peanut butter cups","chocolate","candy","peanut butter candy","reese alternative","reese's alternative","organic candy","no artificial color","clean candy","chocolate candy"] },

  { id:"ca-007", name:"Lily's Dark Chocolate Chips", brand:"Lily's", plasticScore:2, category:"food_beverage",
    material:"Stevia-sweetened, no sugar, fair trade cocoa, non-GMO. No artificial colors or flavors.",
    description:"Zero-sugar chocolate. No petroleum dyes, no HFCS, stevia-sweetened.",
    affiliateUrl:"https://www.amazon.com/s?k=Lilys+dark+chocolate&tag=partiqule-20", price:"$4-7",
    tags:["chocolate","candy","dark chocolate","no sugar","low sugar candy","clean chocolate","m&m alternative","reese alternative","chocolate candy","stevia"] },

  { id:"ca-008", name:"Theo Organic Chocolate Bar", brand:"Theo", plasticScore:1, category:"food_beverage",
    material:"USDA Organic, fair trade, non-GMO. No synthetic additives, no soy lecithin.",
    description:"Bean-to-bar organic chocolate. USDA Organic, fair trade, clean throughout.",
    affiliateUrl:"https://www.amazon.com/s?k=Theo+organic+chocolate+bar&tag=partiqule-20", price:"$4-6",
    tags:["chocolate","chocolate bar","dark chocolate","candy","organic chocolate","fair trade chocolate","candy alternative","snickers alternative","m&m alternative","clean chocolate","chocolate candy"] },



];

// ── FIND ALTERNATIVES ────────────────────────────────────────
// Generic words that appear in too many unrelated products to be useful for matching
const STOPWORDS = new Set([
  "bag", "bags", "cup", "cups", "box", "boxes", "can", "cans",
  "set", "sets", "kit", "kits", "pad", "pads", "pan", "pans",
  "pot", "pots", "bar", "bars", "the", "and", "for", "its",
  "new", "pro", "eco", "use", "one", "all", "free", "with",
  "water", "baby", "kids", "child", "mini", "size", "type",
  // Food descriptor words that appear in product names but are not category signals
  "milk", "dark", "white", "light", "rich", "classic", "original",
  "real", "pure", "fresh", "raw", "wild", "whole", "extra",
  "plus", "ultra", "max", "select", "premium", "natural", "simply",
  "good", "great", "old", "best", "true", "big"
]);

function findAlternatives(query, category, limit = 3, fallbackQuery = "") {
  const queries = [query, fallbackQuery].filter(Boolean).map(q => q.toLowerCase().trim());

  // ── Synonym expansion — broaden search for common product types ──
  const synonymMap = {
    "jacket":    ["jacket","outerwear","coat","shell","layer"],
    "coat":      ["coat","jacket","outerwear","layer"],
    "outerwear": ["outerwear","jacket","coat","layer"],
    "fleece":    ["fleece","jacket","outerwear","layer","sweatshirt"],
    "hoodie":    ["hoodie","sweatshirt","layer","jacket","outerwear"],
    "sweatshirt":["sweatshirt","hoodie","layer","outerwear"],
    "legging":   ["legging","leggings","pants","bottoms","tights"],
    "leggings":  ["leggings","legging","pants","bottoms","tights"],
    "pant":      ["pants","leggings","bottoms","trouser"],
    "pajama":    ["pajamas","pjs","sleepwear","nightwear"],
    "pjs":       ["pajamas","pjs","sleepwear","nightwear"],
    "sunscreen": ["sunscreen","spf","sun protection","mineral sunscreen"],
    "shampoo":   ["shampoo","hair wash","hair care"],
    "moisturizer":["moisturizer","lotion","cream","face cream"],
    "pan":       ["pan","skillet","frying pan","cookware"],
    "pot":       ["pot","cookware","saucepan"],
    "bottle":    ["bottle","water bottle","drink bottle"],
    "diaper":    ["diaper","nappy","diaper alternative"],
    "formula":   ["baby formula","infant formula","formula"],
  };

  const expandedWords = [...new Set(
    queries.flatMap(q => {
      const base = q.split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w));
      const synonyms = base.flatMap(w => synonymMap[w] || [w]);
      return [...base, ...synonyms];
    })
  )];

  const allWords = expandedWords;

  // Hard block: other and restaurant categories get no DB alternatives
  if (category === "other" || category === "restaurant") return [];

  // Extract brand from query to avoid recommending same brand as alternative
  const queryLower = query.toLowerCase();

  // Minimum threshold — food needs higher bar since category is broad
  const minScore = ["food", "food_beverage", "beverage"].includes(category) ? 18 : 13;

  // Word-boundary helper — prevents "lean" matching "cleaner", "meal" matching "meals" etc.
  function wordMatch(haystack, needle) {
    if (!haystack || !needle) return false;
    if (haystack === needle) return true;
    const words = haystack.split(/\s+/);
    return words.includes(needle);
  }

  // Relevance scoring
  const scored = products
    .filter(p => p.plasticScore <= 4)
    .filter(p => {
      // Never recommend same product or same brand as the scanned item
      if (p.name.toLowerCase() === queryLower) return false;
      if (p.brand && queryLower.includes(p.brand.toLowerCase())) return false;
      return true;
    })
    .map(p => {
      let score = 0;
      let meaningfulTagMatches = 0;
      // Category match bonus
      if (category && p.category === category) score += 8;
      // Tag matches
      allWords.forEach(word => {
        // Skip ultra-generic words that match everything in food category
        if (["food","organic","natural","beverage","drink"].includes(word)) return;
        p.tags.forEach(tag => {
          if (wordMatch(tag, word) || wordMatch(word, tag)) {
            score += 5;
            meaningfulTagMatches++;
          }
        });
        if (p.name.toLowerCase().split(/\s+/).includes(word)) score += 4;
        if (p.brand.toLowerCase().split(/\s+/).includes(word)) score += 2;
        if (p.material?.toLowerCase().includes(word)) score += 2;
      });
      // Full phrase matches — use substring for multi-word tag phrases like "skittles alternative"
      queries.forEach(q => {
        p.tags.forEach(tag => { if (q.includes(tag) || tag.includes(q.slice(0,20))) { score += 7; meaningfulTagMatches++; } });
        if (p.name.toLowerCase().includes(q.slice(0, 20))) score += 6;
      });
      // For food category: require at least one meaningful tag match beyond category
      if (["food", "food_beverage", "beverage"].includes(category) && meaningfulTagMatches === 0) {
        score = 0; // exclude — only category matched, no actual product relevance
      }
      return { ...p, relevanceScore: score };
    })
    .filter(p => p.relevanceScore >= minScore)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit);

  return scored;
}

module.exports = { products, findAlternatives };
