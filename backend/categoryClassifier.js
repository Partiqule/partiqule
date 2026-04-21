// backend/categoryClassifier.js
// Five-tier product categorization cascade.
//
// Tier 1: Explicit overrides — minimal list for known AI collision cases
//         (e.g. MAC lipstick vs MacBook). Sync. Runs before any other tier.
// Tier 2: Redis cache lookup (30-day TTL, prompt-version keyed).
// Tier 3: Claude Haiku classification. AI returns {category, confidence,
//         reasoning}. Confidence >= 0.7 wins and is cached.
// Tier 4: Keyword + regex fallback — the legacy detectCategoryFast() logic.
//         Still intact so the sync test harness keeps working and so cache
//         keys stay stable even if Redis/AI are unavailable.
// Tier 5: Default "other".
//
// Two exports:
//
//   detectCategoryFast(q) — SYNC. Legacy regex + brand list. Used for cache
//     key generation on every scan (must stay cheap), and as the Tier 4
//     fallback inside classifyCategory().
//
//   classifyCategory({ productName, ingredients, deps }) — ASYNC. Full
//     cascade. Used at scoring time where the AI's better recall is worth
//     the 300–800ms latency.
//
// DI (deps): { redisGet, redisSet, checkApiBudget, incrementApiCount,
//   promptVersion }. Redis writes use a category-specific 30d TTL, so the
//   module issues its own Upstash fetch for writes rather than reusing
//   server.js's 90d redisSet.

const ANTHROPIC_API  = "https://api.anthropic.com/v1/messages";
const AI_TIMEOUT_MS  = 5000;
const AI_MODEL       = "claude-haiku-4-5-20251001";
const CONFIDENCE_THRESHOLD = 0.7;
const CATEGORY_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL  || "";
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const hasRedis    = !!(REDIS_URL && REDIS_TOKEN);

// Canonical category set. Kept in sync with detectCategoryFast() returns and
// with CATEGORY_AVERAGES / weighted-scoring tables in server.js. "pet" is a
// new AI-only category that normalizes to "other" for downstream scoring (no
// dedicated pet weights exist yet) but is preserved in logs for telemetry.
const CANONICAL_CATEGORIES = new Set([
  "food", "beverage", "personal_care", "clothing", "home",
  "baby", "toy", "supplement", "restaurant", "home_furnishing",
  "kitchen", "accessory", "other",
]);

function normalizeForCache(name) {
  return (name || "").toLowerCase().trim().replace(/\s+/g, " ").slice(0, 200);
}

// ── Tier 1: explicit overrides ───────────────────────────────────
// Minimum viable list for known AI collision cases. Keep under 30 entries.
// Every entry should have a comment explaining the AI failure mode it guards
// against — otherwise it's a candidate for deletion.
const OVERRIDES = [
  // MAC lipstick vs MacBook — Haiku often picks electronics.
  { match: /\bmac\s+(ruby|lipstick|lip|lipglass|matte|frost|velvet|prep|viva|studio|fix|retro|lustre|amplified|cremesheen|cosmetics)\b/i, cat: "personal_care" },
  // Goldfish — "fish" pulls AI to pet-food or seafood.
  { match: /\bgoldfish\b/i, cat: "food" },
  // Liquid Death — "death" is a red flag; brand name obscures beverage.
  { match: /\bliquid\s+death\b/i, cat: "beverage" },
  // Dr. Bronner's — "castile" often misreads as cleaning.
  { match: /\bdr\.?\s*bronner'?s?\b/i, cat: "personal_care" },
  // Salt & Stone — "salt" pulls to food.
  { match: /\bsalt\s*(and|&|\+)\s*stone\b/i, cat: "personal_care" },
  // Pet food — no dedicated pet category downstream. Route to "other" so
  // scoring doesn't try to apply food-category materials weighting.
  { match: /\b(blue\s+buffalo|purina|wellness\s+core|iams|pedigree|friskies|fancy\s+feast|royal\s+canin|hill'?s\s+science\s+diet|greenies|taste\s+of\s+the\s+wild)\b/i, cat: "other" },
  { match: /\b(dog|cat|puppy|kitten|pet)\s+(food|treat|treats|kibble|chow)\b/i, cat: "other" },
];

function matchOverride(productName) {
  const s = (productName || "").toLowerCase();
  for (const o of OVERRIDES) if (o.match.test(s)) return o.cat;
  return null;
}

// ── Tier 4: legacy Fast regex path (detectCategoryFast) ──────────
// Intact copy of the pre-AI detectCategory() body. Sync, pure, returns a
// canonical category string or null. Used directly for cache-key generation
// and as the deterministic Tier 4 fallback.
function detectCategoryFast(q) {
  const s = (q || "").toLowerCase();

  // ── Brand-first lookup ────────────────────────────────────────
  const BRAND_CATEGORY = [
    { match: /\bsalt\s*(and|&|\+)\s*stone\b/,        cat: "personal_care" },
    { match: /\bdr\.?\s*bronner'?s?\b/,              cat: "personal_care" },
    { match: /\bnative\s+(deodorant|body|shampoo|conditioner|lotion|bar|wash)?/, cat: "personal_care" },
    { match: /\btom'?s\s+of\s+maine\b/,              cat: "personal_care" },
    { match: /\bburt'?s\s+bees\b/,                   cat: "personal_care" },
    { match: /\baveeno\b/,                           cat: "personal_care" },
    { match: /\bcetaphil\b/,                         cat: "personal_care" },
    { match: /\bcerave\b/,                           cat: "personal_care" },
    { match: /\bla\s+roche.?posay\b/,                cat: "personal_care" },
    { match: /\bthe\s+ordinary\b/,                   cat: "personal_care" },
    { match: /\bglossier\b/,                         cat: "personal_care" },
    { match: /\bneutrogena\b/,                       cat: "personal_care" },
    { match: /\bolay\b/,                             cat: "personal_care" },
    { match: /\beucerin\b/,                          cat: "personal_care" },
    { match: /\baquaphor\b/,                         cat: "personal_care" },
    { match: /\btatcha\b/,                           cat: "personal_care" },
    { match: /\bherbivore\b/,                        cat: "personal_care" },
    { match: /\bethique\b/,                          cat: "personal_care" },
    { match: /\bwellnesse\b/,                        cat: "personal_care" },
    { match: /\brisewell\b/,                         cat: "personal_care" },
    { match: /\bmethod\s+(body|hand|dish)\b/,        cat: "personal_care" },
    { match: /\bfenty\s+beauty\b/,                   cat: "personal_care" },
    { match: /\brare\s+beauty\b/,                    cat: "personal_care" },
    { match: /\bcharlotte\s+tilbury\b/,              cat: "personal_care" },
    { match: /\bnars\b/,                             cat: "personal_care" },
    { match: /\bmac\s+(cosmetics|ruby|lipstick|lip|lipglass|matte|frost|velvet|prep|viva|studio|fix|retro|lustre|amplified|cremesheen)\b/, cat: "personal_care" },
    { match: /\burban\s+decay\b/,                    cat: "personal_care" },
    { match: /\btoo\s+faced\b/,                      cat: "personal_care" },
    { match: /\bbenefit\s+(cosmetics|brow|mascara|they'?re|gimme|hoola|high)\b/, cat: "personal_care" },
    { match: /\btarte\b/,                            cat: "personal_care" },
    { match: /\be\.?l\.?f\.?\s+(cosmetics|makeup|foundation|lip|eye|brow|mascara|blush)\b/, cat: "personal_care" },
    { match: /\bmaybelline\b/,                       cat: "personal_care" },
    { match: /\bl'?oreal\b/,                         cat: "personal_care" },
    { match: /\brevlon\b/,                           cat: "personal_care" },
    { match: /\bcovergirl\b/,                        cat: "personal_care" },
    { match: /\bclinique\b/,                         cat: "personal_care" },
    { match: /\bestee\s+lauder\b/,                   cat: "personal_care" },
    { match: /\bmilk\s+makeup\b/,                    cat: "personal_care" },
    { match: /\bilia\b/,                             cat: "personal_care" },
    { match: /\bpatrick\s+ta\b/,                     cat: "personal_care" },
    { match: /\bsaie\b/,                             cat: "personal_care" },
    { match: /\bmerit\b/,                            cat: "personal_care" },
    { match: /\bkosas\b/,                            cat: "personal_care" },
    { match: /\bgoldfish\b/,                         cat: "food" },
    { match: /\bpepperidge\s+farm\b/,                cat: "food" },
    { match: /\bcheez.?it(s)?\b/,                    cat: "food" },
    { match: /\btriscuit(s)?\b/,                     cat: "food" },
    { match: /\britz\s+cracker/,                     cat: "food" },
    { match: /\bdoritos\b/,                          cat: "food" },
    { match: /\blay'?s\b/,                           cat: "food" },
    { match: /\bcheetos\b/,                          cat: "food" },
    { match: /\bpringles\b/,                         cat: "food" },
    { match: /\bfritos\b/,                           cat: "food" },
    { match: /\bchex\s+mix\b/,                       cat: "food" },
    { match: /\btostitos\b/,                         cat: "food" },
    { match: /\bruffles\b/,                          cat: "food" },
    { match: /\bsunchips\b/,                         cat: "food" },
    { match: /\bcheerios\b/,                         cat: "food" },
    { match: /\bchex\s+(cereal|honey|corn|wheat|rice)\b/, cat: "food" },
    { match: /\bwheaties\b/,                         cat: "food" },
    { match: /\bfroot\s+loops\b/,                    cat: "food" },
    { match: /\blucky\s+charms\b/,                   cat: "food" },
    { match: /\bcorn\s+flakes\b/,                    cat: "food" },
    { match: /\braisin\s+bran\b/,                    cat: "food" },
    { match: /\bcap'?n\s+crunch\b/,                  cat: "food" },
    { match: /\bfrosted\s+flakes\b/,                 cat: "food" },
    { match: /\bhoney\s+bunches\s+of\s+oats\b/,      cat: "food" },
    { match: /\bmini.?wheats\b/,                     cat: "food" },
    { match: /\bseventh\s+generation\s+(dish|laundry|detergent|cleaner|all.purpose)/, cat: "home" },
    { match: /\bblueland\b/,                         cat: "home" },
    { match: /\bbranch\s+basics\b/,                  cat: "home" },
    { match: /\b(blue\s+buffalo|purina|wellness\s+core|iams|pedigree|friskies|fancy\s+feast|taste\s+of\s+the\s+wild|royal\s+canin|hill'?s\s+science\s+diet|greenies|temptations|nutro|merrick|orijen|acana)\b/, cat: "other" },
    { match: /\b(dog|cat|puppy|kitten|pet)\s+(food|treat|treats|kibble|chow|biscuit|biscuits|dental|chew|chews)\b/, cat: "other" },
  ];
  for (const b of BRAND_CATEGORY) {
    if (b.match.test(s)) return b.cat;
  }

  // ── Compound-phrase lookup ────────────────────────────────────
  const COMPOUND_PHRASE_CATEGORY = [
    { match: /\bbody\s+(lotion|wash|butter|oil|scrub|cream|balm|milk|mist)\b/, cat: "personal_care" },
    { match: /\bface\s+(cream|wash|oil|serum|mask|moisturizer|cleanser|toner|mist|balm)\b/, cat: "personal_care" },
    { match: /\bhand\s+(cream|lotion|wash|sanitizer|soap|balm)\b/, cat: "personal_care" },
    { match: /\bhair\s+(oil|serum|mask|treatment|balm|wax|gel|spray|cream)\b/, cat: "personal_care" },
    { match: /\blip\s+(balm|oil|scrub|tint|gloss|stick|butter|mask|treatment)\b/, cat: "personal_care" },
    { match: /\beye\s+(cream|serum|mask|balm|oil|shadow|liner)\b/, cat: "personal_care" },
    { match: /\beyeshadow\s+(palette|primer|stick|cream|quad)?\b/, cat: "personal_care" },
    { match: /\bfoot\s+(cream|lotion|scrub|balm|mask)\b/, cat: "personal_care" },
    { match: /\bshampoo\s+bar\b/, cat: "personal_care" },
    { match: /\bbeauty\s+bar\b/, cat: "personal_care" },
    { match: /\bdeodorant\s+(stick|bar|spray|roll.?on)\b/, cat: "personal_care" },
    { match: /\b(setting|loose|pressed|finishing|translucent|mineral)\s+powder\b/, cat: "personal_care" },
    { match: /\bblurring\s+(foundation|primer|powder)\b/, cat: "personal_care" },
    { match: /\b(liquid|matte|stick|cream|serum)\s+foundation\b/, cat: "personal_care" },
  ];
  for (const c of COMPOUND_PHRASE_CATEGORY) {
    if (c.match.test(s)) return c.cat;
  }

  if (/macbook|iphone|ipad|imac|apple watch|airpods|apple tv|apple mac|\bapple\s+(pro|air|mini|studio|ultra|m[0-9]|laptop|computer|phone|tablet|watch|earbuds|headphones)\b|samsung galaxy|samsung phone|samsung tablet|samsung tv|pixel phone|google pixel|android phone|windows laptop|dell laptop|hp laptop|lenovo thinkpad|surface pro|microsoft surface|chromebook|gaming laptop|nvidia|amd ryzen|intel core|\blaptop\b|\bsmartphone\b|\btablet\b(?!.*food)|\bdesktop computer\b|television|\b(4k|oled|qled)\s+tv\b|smart tv|monitor|keyboard|mouse\b(?!.*trap)|headphones|earbuds|airpods|bluetooth speaker|smart speaker|alexa|google home|ring doorbell|nest thermostat|robot vacuum|roomba|printer|camera(?!.*food)|drone|gaming console|playstation|xbox|nintendo switch|smart home|wifi router|hard drive|ssd|graphics card|cpu|motherboard|charger(?!.*food)|power bank|battery pack|electric vehicle|tesla|rivian|ev car/.test(s)) return "other";

  if (/chick.?fil.?a|mcdonald|burger king|wendy.?s|taco bell|chipotle|subway|domino|pizza hut|kfc|popeyes|in.?n.?out|shake shack|five guys|panda express|starbucks|dunkin|krispy kreme|sonic|dairy queen|jack in the box|whataburger|culver.?s|fuzzy.?s|raising cane|wingstop|jersey mike|jimmy john|panera|cheesecake factory|olive garden|applebee|chili.?s|outback|ihop|denny.?s|waffle house|del taco|carl.?s jr|hardee.?s|bojangles|zaxby.?s|cookout|checkers|rally.?s|arby.?s|buffalo wild wings|hooters|red robin|sweetgreen|sweet green|cava restaurant|dave.?s hot chicken|dutch bros|jamba juice|smoothie king|pressed juicery|crumbl|nothing bundt|insomnia cookie|levain bakery|boba guys|kung fu tea|gong cha|alley|black bear diner|first watch|mod pizza|blaze pizza|pieology|california pizza kitchen|yard house|bj.?s restaurant|red lobster|longhorn|texas roadhouse|golden corral|ihop|cracker barrel|bob evans|perkins|denny|waffle house|steak.?n shake|cook.?out|habit burger|del taco|el pollo loco|church.?s chicken|captain d.?s|long john silver|a.?w restaurant|tim hortons|jack.?s|hardee.?s|krystal|white castle|steak.?n shake|naked farmer|big mac/.test(s)) return "restaurant";

  if (/\btoy\b|lego|playmobil|barbie|hot wheels|action figure|stuffed animal|plush toy|play.?doh|playdoh|puzzle|board game|building block|wooden toy|bath toy|sensory toy|fidget|slime kit|kinetic sand|nerf|rc car|remote control car|doll house|dollhouse|train set|crayola|crayons|markers|play set|playset/.test(s)) return "toy";

  if (/\bjewelry\b|\bjewellery\b|necklace|bracelet|earring|\bring\b(?!.*doorbell)|brooch|pendant|anklet|cuff|bangle|watch(?!.*apple)|\bhandbag\b|purse|clutch|wallet|tote bag|backpack|satchel|suitcase|luggage|duffel|duffle|crossbody|messenger bag|gym bag|belt|sunglasses|hat(?!.*baby)|scarf(?!.*kids)|beanie(?!.*kids)|gloves(?!.*cleaning)|umbrella/.test(s)) return "accessory";

  if (/\b(baby|infant|toddler|newborn)\s+(shampoo|conditioner|lotion|soap|body wash|sunscreen|moisturizer|oil|cream|powder|deodorant|toothpaste|face wash)/.test(s)) return "personal_care";
  if (/\b(baby|infant|toddler|kids?|children.?s?)\s+(vitamin|supplement|probiotic|multivitamin|gummy vitamin|tylenol|ibuprofen|acetaminophen|medicine|drops)/.test(s)) return "supplement";
  if (/baby|infant|toddler|newborn|nursery|diaper|nappy|bib|onesie|pajama|romper|breast pump|pacifier|dummy|teether|stroller|pram|car seat|crib|bassinet|training pants|pull.?up.*diaper|potty training|enfamil|similac|waterwipes|desitin/.test(s)) return "baby";

  if (/shirt|pant|jean|jacket|hoodie|sweater|sock|underwear|bra|legging|fleece|fabric|cloth|wear|apparel|activewear|athletic|workout|yoga|polyester|lululemon|dress|skirt|shorts|tights|blazer|coat|swimsuit|bikini|shoe|sneaker|boot|sandal|heel|loafer|oxford|slipper|flip flop|birkenstock|crocs|\bnike\b|adidas|new balance|puma/.test(s)) return "clothing";

  if (/supplement|vitamin|multivitamin|probiotic|protein powder|whey|collagen|omega|fish oil|zinc|magnesium|calcium|iron supplement|melatonin|ashwagandha|creatine|pre.?workout|greens powder|superfood powder|capsule|gummy vitamin|tylenol|acetaminophen|advil|ibuprofen|benadryl|diphenhydramine|zyrtec|cetirizine|tums|antacid|allegra|claritin|pepto|robitussin|mucinex|dayquil|nyquil/.test(s)) return "supplement";

  if (/mattress|pillow|duvet|comforter|bedding|bed sheet|blanket|sofa|couch|furniture|memory foam|latex mattress|carpet|rug|curtain|drape|upholster|sectional|armchair|loveseat|ottoman|dresser|nightstand|bookshelf|bookcase|bed frame|headboard/.test(s)) return "home_furnishing";

  if (/\b(pan|pot|cookware|skillet|wok|dutch oven|saucepan|baking sheet|sheet pan|cast iron|ceramic.*pan|non.?stick|teflon|pfas.*pan|cooking.*pot|knife|cutting board|mixing bowl|colander|strainer|spatula|tongs|whisk|ladle|measuring cup|food processor|blender|toaster|air fryer|instant pot|rice cooker|slow cooker|pressure cooker|coffee maker|espresso machine|kettle|microwave|tumbler|stanley tumbler|yeti|hydro.?flask)\b/.test(s)) return "kitchen";

  if (/laundry|detergent|cleaner|sponge|dish soap|broom|mop|scrub|brush|vacuum|bleach|disinfect|all.purpose|spray cleaner|floor cleaner|toilet|bathroom|tide pod|dishwasher|washing machine|dryer|air freshener|candle|wax melt|towel|clorox|lysol|ziploc|swiffer|febreze|glad\b|reynolds wrap|saran wrap|trash bag|garbage bag|aluminum foil|tupperware|paper towel|wax paper|parchment|glade|yankee candle|bath and body works candle/.test(s)) return "home";

  if (/shampoo|conditioner|lotion|(?<!dish )soap|deodorant|toothpaste|makeup|lipstick|foundation|sunscreen|moisturizer|moisturizing cream|face cream|body cream|night cream|day cream|skin cream|cleanser|face wash|body wash|skincare|cotton round|toner|serum|perfume|cologne|mascara|eyeliner|blush|concealer|primer|lip balm|chapstick|nail polish|razor|shave|aftershave|hair dye|hair color|dry shampoo|hair mask|face mask|eye cream|retinol|spf|crest|colgate|oral.?b|sensodyne|cerave|cetaphil|eucerin|aquaphor|aveeno|neutrogena|olay|garnier/.test(s)) return "personal_care";

  if (
    /\b(juice|soda|cola|pepsi|coke|sprite|sparkling water|tea|coffee\s*(beans|grounds|pods|drink|latte|espresso)|smoothie|shake|kombucha|energy drink|red bull|redbull|monster energy|rockstar|bang energy|sports drink|gatorade|powerade|lemonade|beer|wine|cider|whiskey|vodka|rum|gin|tequila|champagne|ale|lager|stout|water|milk|almond milk|oat milk|soy milk|coconut milk|kefir|drinking)\b/.test(s) ||
    /\b(poppi|olipop|liquid death|spindrift|celsius|guayaki|yerba mate|bai|hint water|lacroix|bubly|topo chico|vitaminwater|body armor|prime drink|fairlife|chobani drink)\b/i.test(s)
  ) return "beverage";

  if (
    /\bapple\s*(juice|sauce|cider|fruit|slices|pie|crisp|turnover)?\b(?!\s*(watch|pro|air|mini|mac|iphone|ipad|tv|music|card|store|arcade|one|silicon|chip|m[0-9]))/i.test(s) ||
    /\b(banana|orange|grape|berry|berries|strawberr|blueberr|raspberr|blackberr|cherry|cherries|mango|peach|pear|plum|prune|apricot|melon|watermelon|pineapple|kiwi|avocado|lemon|lime|tomato|potato|carrot|broccoli|spinach|kale|lettuce|onion|garlic|pepper|cucumber|zucchini|mushroom|corn|pea|bean|lentil|chickpea|edamame|beet|sweet potato|butternut|squash)\b/.test(s) ||
    /\b(chicken|beef|pork|turkey|salmon|tuna|fish|shrimp|egg|tofu|tempeh|seitan|steak|bacon|sausage|hot dog|deli|jerky|spam|sardine|anchov|crab|lobster|scallop)\b/.test(s) ||
    /\b(cheese|yogurt|yoghurt|butter|cream|ghee|cottage|ricotta|mozzarella|cheddar|parmesan|brie)\b/.test(s) ||
    /\b(bread|bagel|muffin|croissant|tortilla|pita|cracker|rice|pasta|noodle|spaghetti|cereal|granola|oat|oatmeal|flour|quinoa|couscous|barley|rye|grits|cornmeal)\b/.test(s) ||
    /\b(chips?|crisps?|pretzels?|popcorn|candy|candies|chocolate|gummy|gummies|gummie|cookies?|biscuits?|brownies?|cakes?|donuts?|doughnuts?|snack bar|protein bar|energy bar|granola bar|candy bar|chocolate bar|kind bar|larabar|rxbar|clif bar|luna bar|quest bar|m&m|m&ms|skittles?|reese|oreos?|kit kat|twix|snickers?|starburst|lifesavers?|lollipops?|cheerios?|cereals?|peanut butter|almond butter|nutella|honey|jam|jelly|ketchup|mustard|mayo|sauces?|salsa|dressings?|vinegar|olive oil|syrups?|hot sauce|sriracha|hummus|guacamole|pesto|marinara|salt|sea salt|himalayan salt|kosher salt|table salt|seasonings?|spice blend|bouillon)\b/.test(s) ||
    /\b(soup|broth|stock|stew|chili|curry|ramen|frozen meal|canned food|baby food|infant formula|snack|food|meal|lunch|dinner|breakfast|salad|(?<!saran )wrap|bowl|burrito|sandwich|taco|burger|pizza|fries|wings|nuggets|entree|appetizer|side dish)\b/.test(s)
  ) return "food";

  return null;
}

// ── Tier 3: AI classification ────────────────────────────────────
// Single Haiku call. Returns { category, confidence, reasoning } or null on
// any failure (timeout, non-2xx, JSON parse, non-canonical category, or
// budget exceeded). Caller decides what to do with low-confidence returns.
async function aiClassifyCategory(productName, ingredientsContext, { checkApiBudget, incrementApiCount } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try { if (typeof checkApiBudget === "function") checkApiBudget(); }
  catch { return null; } // budget exceeded — fail soft, cascade falls through

  const ingredientsLine = ingredientsContext
    ? `\nIngredients or context: ${String(ingredientsContext).slice(0, 400)}`
    : "";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    if (typeof incrementApiCount === "function") incrementApiCount();
    const res = await fetch(ANTHROPIC_API, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 200,
        temperature: 0,
        system: `You classify a consumer product into exactly one category.

Valid categories:
- food: packaged snacks, cereals, packaged meals, condiments, produce, meat, dairy, bread
- beverage: drinks, juice, soda, water, tea, coffee, alcohol, milk
- personal_care: skincare, body care, cosmetics, makeup, haircare, oral care, deodorant
- clothing: apparel, footwear, worn accessories like shoes
- home: cleaning supplies, laundry, candles, paper goods, air fresheners
- kitchen: cookware, pans, knives, small appliances, drinkware like tumblers
- home_furnishing: mattresses, bedding, pillows, furniture, rugs
- baby: diapers, formula, baby gear, strollers, car seats (NOT baby shampoo - that's personal_care)
- toy: children's play items, games, plush, LEGO
- supplement: vitamins, minerals, protein powders, OTC medicines
- restaurant: prepared food from named chains or takeout
- accessory: jewelry, bags, sunglasses, hats, belts
- other: electronics, pet food, books, services, unclassifiable

Rules:
- Baby shampoo/lotion/sunscreen -> personal_care (NOT baby)
- Baby/kids vitamins -> supplement (NOT baby)
- Pet food of any kind -> other (no pet category exists)
- Dish soap, laundry detergent -> home (NOT personal_care)
- Stanley tumbler, Yeti, Hydroflask -> kitchen (NOT accessory)

Return ONLY raw JSON (no markdown, no preamble):
{
  "category": "one of the categories above",
  "confidence": 0.0 to 1.0,
  "reasoning": "brief why, under 15 words"
}

Be honest about uncertainty. If you cannot place the product, use "other" with confidence below 0.5.`,
        messages: [{
          role: "user",
          content: `Product: "${productName}"${ingredientsLine}`,
        }],
      }),
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const text = (data.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("")
      .trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    let parsed;
    try { parsed = JSON.parse(text.slice(start, end + 1)); }
    catch { return null; }
    const cat = String(parsed.category || "").toLowerCase().trim();
    const conf = typeof parsed.confidence === "number" ? parsed.confidence : 0;
    if (!CANONICAL_CATEGORIES.has(cat)) return null;
    return {
      category: cat,
      confidence: Math.max(0, Math.min(1, conf)),
      reasoning: String(parsed.reasoning || "").slice(0, 120),
    };
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
}

// ── classifyCategory: full 5-tier cascade ────────────────────────
async function classifyCategory({ productName, ingredients, deps } = {}) {
  const name = String(productName || "").trim();
  if (!name) return { category: "other", source: "default", confidence: null };

  // Tier 1: overrides
  const override = matchOverride(name);
  if (override) {
    return { category: override, source: "override", confidence: 1.0 };
  }

  // Tier 2: Redis cache
  const { redisGet, redisSet, promptVersion, checkApiBudget, incrementApiCount } = deps || {};
  const pv = typeof promptVersion === "function" ? promptVersion() : "v0";
  const cacheKey = `category:${pv}:${normalizeForCache(name)}`;

  if (hasRedis && typeof redisGet === "function") {
    try {
      const cached = await redisGet(cacheKey);
      if (cached && cached.category && CANONICAL_CATEGORIES.has(cached.category)) {
        return { category: cached.category, source: "cache", confidence: cached.confidence ?? null };
      }
    } catch { /* fall through */ }
  }

  // Tier 3: AI
  const ai = await aiClassifyCategory(name, ingredients, { checkApiBudget, incrementApiCount });
  if (ai && ai.confidence >= CONFIDENCE_THRESHOLD) {
    if (hasRedis && typeof redisSet === "function") {
      try {
        await fetch(`${REDIS_URL}/pipeline`, {
          method: "POST",
          headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify([["SET", cacheKey, JSON.stringify({
            category: ai.category, confidence: ai.confidence, reasoning: ai.reasoning,
          }), "EX", CATEGORY_TTL_SECONDS]]),
        });
      } catch { /* cache write is best-effort */ }
    }
    return { category: ai.category, source: "ai", confidence: ai.confidence, reasoning: ai.reasoning };
  }

  // Tier 4: legacy regex fallback
  const fast = detectCategoryFast(name);
  if (fast) {
    return {
      category: fast,
      source: "keyword",
      confidence: null,
      // Keep AI's suggestion visible in logs when it disagreed below threshold.
      ai_suggested: ai ? { category: ai.category, confidence: ai.confidence } : null,
    };
  }

  // Tier 5: default
  return { category: "other", source: "default", confidence: null, ai_suggested: ai ? { category: ai.category, confidence: ai.confidence } : null };
}

module.exports = {
  detectCategoryFast,
  classifyCategory,
  normalizeForCache,
  // exposed for tests / diagnostics
  _internal: { OVERRIDES, CANONICAL_CATEGORIES, aiClassifyCategory, matchOverride },
};
