require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const { findAlternatives } = require("./products");
const { isPaApiConfigured, getAmazonAlternatives } = require("./amazon-api");

const app = express();
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    const allowed = [
      "https://partiqule.com",
      "https://www.partiqule.com",
      "https://partiqule.vercel.app",
      "http://localhost:3000",
      "http://localhost:5173",
    ];
    // Only allow specific Vercel preview deployments from the partiqule project
    // (not any arbitrary .vercel.app subdomain)
    const isPartiquleVercel = allowed.includes(origin) ||
      /^https:\/\/partiqule(-[a-z0-9]+)*\.vercel\.app$/.test(origin);
    if (isPartiquleVercel) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  methods: ["GET","POST","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"],
  credentials: true,
}));
app.options("*", cors()); // handle preflight for all routes
app.use(express.json({ limit: "2mb" })); // images resized to max 1200px ≈ 150-400KB — 2MB is ample

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const scoreCache    = new Map();

// ── HELPERS ───────────────────────────────────────────────────

function cacheKey(q, category) {
  const norm = q.toLowerCase().trim().replace(/\s+/g, " ");
  return category ? `${category}:${norm}` : norm;
}

function cleanProductName(name) {
  if (!name) return "Unknown product";
  if (/^https?:\/\//i.test(name) || name.includes("://") || name.includes("utm_") || name.includes(".com/"))
    return "Scanned product";
  if (name.length > 80) return name.slice(0, 77).trim() + "…";
  const cleaned = name.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function detectCategory(q) {
  const s = q.toLowerCase();

  // ── ELECTRONICS — before food to prevent "Apple" matching apple fruit ──
  if (/macbook|iphone|ipad|imac|apple watch|airpods|apple tv|apple mac|\bapple\s+(pro|air|mini|studio|ultra|m[0-9]|laptop|computer|phone|tablet|watch|earbuds|headphones)\b|samsung galaxy|samsung phone|samsung tablet|samsung tv|pixel phone|google pixel|android phone|windows laptop|dell laptop|hp laptop|lenovo thinkpad|surface pro|microsoft surface|chromebook|gaming laptop|nvidia|amd ryzen|intel core|\blaptop\b|\bsmartphone\b|\btablet\b(?!.*food)|\bdesktop computer\b|television|\b(4k|oled|qled)\s+tv\b|smart tv|monitor|keyboard|mouse\b(?!.*trap)|headphones|earbuds|airpods|bluetooth speaker|smart speaker|alexa|google home|ring doorbell|nest thermostat|robot vacuum|roomba|printer|camera(?!.*food)|drone|gaming console|playstation|xbox|nintendo switch|smart home|wifi router|hard drive|ssd|graphics card|cpu|motherboard|charger(?!.*food)|power bank|battery pack|electric vehicle|tesla|rivian|ev car/.test(s)) return "other";

  // ── RESTAURANT ──
  if (/chick.?fil.?a|mcdonald|burger king|wendy.?s|taco bell|chipotle|subway|domino|pizza hut|kfc|popeyes|in.?n.?out|shake shack|five guys|panda express|starbucks|dunkin|krispy kreme|sonic|dairy queen|jack in the box|whataburger|culver.?s|fuzzy.?s|raising cane|wingstop|jersey mike|jimmy john|panera|cheesecake factory|olive garden|applebee|chili.?s|outback|ihop|denny.?s|waffle house|del taco|carl.?s jr|hardee.?s|bojangles|zaxby.?s|cookout|checkers|rally.?s|arby.?s|buffalo wild wings|hooters|red robin|sweetgreen|sweet green|cava restaurant|dave.?s hot chicken|dutch bros|jamba juice|smoothie king|pressed juicery|crumbl|nothing bundt|insomnia cookie|levain bakery|boba guys|kung fu tea|gong cha|alley|black bear diner|first watch|mod pizza|blaze pizza|pieology|california pizza kitchen|yard house|bj.?s restaurant|red lobster|longhorn|texas roadhouse|golden corral|ihop|cracker barrel|bob evans|perkins|denny|waffle house|steak.?n shake|cook.?out|habit burger|del taco|el pollo loco|church.?s chicken|captain d.?s|long john silver|a.?w restaurant|tim hortons|jack.?s|hardee.?s|krystal|white castle|steak.?n shake/.test(s)) return "restaurant";

  // ── TOYS ──
  if (/\btoy\b|lego|playmobil|barbie|hot wheels|action figure|stuffed animal|plush toy|play doh|playdoh|puzzle|board game|building block|wooden toy|bath toy|sensory toy|fidget|slime kit|kinetic sand|nerf|rc car|remote control car|doll house|dollhouse|train set|crayons|markers|play set|playset/.test(s)) return "toy";

  // ── ACCESSORIES — jewelry, bags, watches ──
  if (/\bjewelry\b|\bjewellery\b|necklace|bracelet|earring|ring\b(?!.*doorbell)|brooch|pendant|anklet|cuff|bangle|watch(?!.*apple)|\bhandbag\b|purse|clutch|wallet|tote bag|backpack|satchel|suitcase|luggage|duffel|duffle|crossbody|messenger bag|gym bag|belt|sunglasses|hat(?!.*baby)|scarf(?!.*kids)|beanie(?!.*kids)|gloves(?!.*cleaning)|umbrella/.test(s)) return "accessory";

  // ── BABY — before clothing to catch training pants ──
  if (/baby|infant|toddler|newborn|nursery|diaper|nappy|bib|onesie|pajama|romper|breast pump|pacifier|dummy|teether|stroller|pram|car seat|crib|bassinet|training pants|pull.?up.*diaper|potty training/.test(s)) return "baby";

  // ── CLOTHING ──
  if (/shirt|pant|jean|jacket|hoodie|sweater|sock|underwear|bra|legging|fleece|fabric|cloth|wear|apparel|activewear|athletic|workout|yoga|polyester|lululemon|dress|skirt|shorts|tights|blazer|coat|swimsuit|bikini|shoe|sneaker|boot|sandal|heel|loafer|oxford|slipper|flip flop/.test(s)) return "clothing";

  // ── SUPPLEMENT ──
  if (/supplement|vitamin|multivitamin|probiotic|protein powder|whey|collagen|omega|fish oil|zinc|magnesium|calcium|iron supplement|melatonin|ashwagandha|creatine|pre.?workout|greens powder|superfood powder|capsule|gummy vitamin/.test(s)) return "supplement";

  // ── BEAUTY / PERSONAL CARE ──
  if (/shampoo|conditioner|lotion|soap|deodorant|toothpaste|makeup|lipstick|foundation|sunscreen|moisturizer|cleanser|face wash|body wash|skincare|cotton round|toner|serum|perfume|cologne|mascara|eyeliner|blush|concealer|primer|lip balm|chapstick|nail polish|razor|shave|aftershave|hair dye|hair color|dry shampoo|hair mask|face mask|eye cream|retinol|spf/.test(s)) return "personal_care";

  // ── HOME (cleaning, kitchen, furnishing, candles) ──
  if (/pan|pot|cookware|sponge|dish|laundry|detergent|cleaner|towel|broom|mop|teflon|non.?stick|pfas|ceramic.*pan|cooking|tide pod|dishwasher|washing machine|dryer|bleach|disinfect|all.purpose|spray cleaner|floor cleaner|toilet|bathroom|scrub|brush|vacuum|air freshener|candle|wax melt|mattress|pillow|duvet|comforter|bedding|bed sheet|blanket|sofa|couch|furniture|foam|memory foam|latex mattress|carpet|rug|curtain|drape|upholster/.test(s)) return "home";

  // ── BEVERAGE — drinkable consumption ──
  if (
    /\b(juice|soda|cola|pepsi|coke|sprite|sparkling water|tea|coffee\s*(beans|grounds|pods|drink|latte|espresso)|smoothie|shake|kombucha|energy drink|red bull|redbull|monster energy|rockstar|bang energy|sports drink|gatorade|powerade|lemonade|beer|wine|cider|whiskey|vodka|rum|gin|tequila|champagne|ale|lager|stout|water|milk|almond milk|oat milk|soy milk|coconut milk|kefir|drinking)\b/.test(s) ||
    /\b(poppi|olipop|liquid death|spindrift|celsius|guayaki|yerba mate|bai|hint water|lacroix|bubly|topo chico|vitaminwater|body armor|prime drink|fairlife|chobani drink)\b/i.test(s)
  ) return "beverage";

  // ── FOOD — edible consumption ──
  if (
    /\bapple\s*(juice|sauce|cider|fruit|slices|pie|crisp|turnover)?\b(?!\s*(watch|pro|air|mini|mac|iphone|ipad|tv|music|card|store|arcade|one|silicon|chip|m[0-9]))/i.test(s) ||
    /\b(banana|orange|grape|berry|berries|strawberr|blueberr|raspberr|blackberr|cherry|cherries|mango|peach|pear|plum|prune|apricot|melon|watermelon|pineapple|kiwi|avocado|lemon|lime|tomato|potato|carrot|broccoli|spinach|kale|lettuce|onion|garlic|pepper|cucumber|zucchini|mushroom|corn|pea|bean|lentil|chickpea|edamame|beet|sweet potato|butternut|squash)\b/.test(s) ||
    /\b(chicken|beef|pork|turkey|salmon|tuna|fish|shrimp|egg|tofu|tempeh|seitan|steak|bacon|sausage|hot dog|deli|jerky|spam|sardine|anchov|crab|lobster|scallop)\b/.test(s) ||
    /\b(cheese|yogurt|yoghurt|butter|cream|ghee|cottage|ricotta|mozzarella|cheddar|parmesan|brie)\b/.test(s) ||
    /\b(bread|bagel|muffin|croissant|tortilla|pita|cracker|rice|pasta|noodle|spaghetti|cereal|granola|oat|oatmeal|flour|quinoa|couscous|barley|rye|grits|cornmeal)\b/.test(s) ||
    /\b(chip|crisp|pretzel|popcorn|candy|chocolate|gummy|gummie|cookie|biscuit|brownie|cake|donut|doughnut|snack bar|protein bar|energy bar|granola bar|candy bar|chocolate bar|kind bar|larabar|rxbar|clif bar|luna bar|quest bar|m&m|skittle|reese|oreo|kit kat|twix|snickers|starburst|lifesaver|lollipop|cheerio|cereal|peanut butter|almond butter|nutella|honey|jam|jelly|ketchup|mustard|mayo|sauce|salsa|dressing|vinegar|olive oil|syrup|hot sauce|sriracha|hummus|guacamole|pesto|marinara)\b/.test(s) ||
    /\b(soup|broth|stock|stew|chili|curry|ramen|frozen meal|canned food|baby food|infant formula|snack|food|meal|lunch|dinner|breakfast)\b/.test(s)
  ) return "food";

  return null;
}

function extractProductFromUrl(input) {
  const trimmed = input.trim();
  if (!trimmed.startsWith("http") && !/^\d{8,14}$/.test(trimmed)) return null;
  if (/^\d{8,14}$/.test(trimmed)) return `product with barcode ${trimmed}`;
  let pathname = trimmed;
  try { pathname = new URL(trimmed).pathname; } catch { return null; }
  const amazonSlug = trimmed.match(/amazon\.com\/([^/]+)\/dp\//i);
  if (amazonSlug) { const n = amazonSlug[1].replace(/-/g," ").replace(/[^a-zA-Z0-9 ]/g,"").trim(); return n.length>5?n:"Amazon product"; }
  const amazonDp = trimmed.match(/amazon\.com\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  if (amazonDp) return `Amazon product ${amazonDp[1]}`;
  const targetSlug = pathname.match(/\/p\/([^/]+)\/-\//i)||pathname.match(/\/p\/([^/]+)/i);
  if (trimmed.includes("target.com")&&targetSlug) return targetSlug[1].replace(/-/g," ").replace(/[^a-zA-Z0-9 ]/g,"").trim();
  const walmartSlug = pathname.match(/\/ip\/([^/]+)/i);
  if (trimmed.includes("walmart.com")&&walmartSlug) return walmartSlug[1].replace(/-/g," ").replace(/[^a-zA-Z0-9 ]/g,"").trim();
  const segments = pathname.split("/").filter(s=>s.length>3&&!/^\d+$/.test(s));
  const last = segments[segments.length-1]||segments[0];
  if (last) { const n = last.replace(/-|_/g," ").replace(/[^a-zA-Z0-9 ]/g,"").trim(); if(n.length>3) return n; }
  return "Scanned product";
}

// ── SUBSTANCE REGISTRY ────────────────────────────────────────
// Ingredient-triggered score floors — only activate when AI confirms
// the substance in concerns. Overrides formula output for materials score.
// Sources: EU REACH SVHC (253 entries as of Feb 2026), IARC Monographs,
// EWG Skin Deep, FDA, EPA Safer Choice, NTP, WHO

const SUBSTANCE_FLOORS = [

  // ══════════════════════════════════════════════════════════
  // PFAS / FOREVER CHEMICALS — EU SVHC, EPA Health Advisory
  // ══════════════════════════════════════════════════════════
  { match: /\bPTFE\b|polytetrafluoroethylene|\bteflon\b/i,          mFloor:8, uFloor:7, reason:"PTFE — IARC 2A, PFAS class, banned cookware coating" },
  { match: /\bPFAS\b|perfluoro(?!rm)|perfluoroalkyl|polyfluoroalkyl/i, mFloor:8, uFloor:7, reason:"PFAS forever chemicals — EPA health advisory, carcinogenic" },
  { match: /\bPFOA\b|perfluorooctanoic/i,                            mFloor:9, uFloor:8, reason:"PFOA — IARC Group 1 carcinogen, banned globally" },
  { match: /\bPFOS\b|perfluorooctane.?sulfon/i,                      mFloor:9, uFloor:8, reason:"PFOS — IARC Group 1, persistent, bioaccumulative" },
  { match: /\bGenX\b|hexafluoropropylene oxide/i,                    mFloor:8, uFloor:7, reason:"GenX — PFAS replacement, same toxicity concerns" },
  { match: /\bPFBS\b|perfluorobutane.?sulfon/i,                      mFloor:7, uFloor:6, reason:"PFBS — PFAS class, kidney toxicity" },
  { match: /polytetrafluoro|fluoropolymer/i,                         mFloor:7, uFloor:6, reason:"Fluoropolymer — PFAS class compound" },

  // ══════════════════════════════════════════════════════════
  // PETROLEUM DYES — FDA flagged, IARC classified
  // ══════════════════════════════════════════════════════════
  { match: /Red\s*40|Red\s*3|FD&?C\s*Red|Allura Red|Erythrosine/i,  mFloor:7, uFloor:6, reason:"Red 40/Red 3 — FDA banned Red 3 2025, petroleum dye, carcinogenicity" },
  { match: /Yellow\s*5|Yellow\s*6|FD&?C\s*Yellow|Tartrazine|Sunset Yellow/i, mFloor:7, uFloor:6, reason:"Yellow 5/6 — petroleum dye, hyperactivity (McCann Lancet 2007)" },
  { match: /Blue\s*1|Blue\s*2|FD&?C\s*Blue|Brilliant Blue|Indigo Carmine/i, mFloor:6, uFloor:5, reason:"Blue 1/2 — petroleum dye, FDA review pending" },
  { match: /Green\s*3|FD&?C\s*Green/i,                               mFloor:6, uFloor:5, reason:"Green 3 — petroleum-derived synthetic dye" },
  { match: /titanium dioxide|TiO2|\bE171\b/i,                        mFloor:6, uFloor:5, reason:"Titanium dioxide — IARC Group 2B, EU food ban (E171)" },
  { match: /caramel colou?r.*IV|4-MEI|4-methylimidazole/i,           mFloor:6, uFloor:5, reason:"Caramel Color IV — 4-MEI byproduct, IARC 2B carcinogen" },

  // ══════════════════════════════════════════════════════════
  // PRESERVATIVES — NTP, IARC, EWG flagged
  // IARC Group 1 (nitrites in meat) = mFloor 8
  // IARC Group 2A = mFloor 7
  // IARC Group 2B = mFloor 6
  // ══════════════════════════════════════════════════════════
  { match: /\bTBHQ\b|tert.?butylhydroquinone/i,                      mFloor:6, uFloor:5, reason:"TBHQ — FDA-reviewed immunotoxin, animal carcinogen (NTP)" },
  { match: /\bBHA\b|butylated hydroxyanisole/i,                       mFloor:6, uFloor:5, reason:"BHA — IARC Group 2B, reasonably anticipated carcinogen (NTP)" },
  { match: /\bBHT\b|butylated hydroxytoluene/i,                       mFloor:5, uFloor:4, reason:"BHT — animal carcinogen studies, endocrine disruption" },
  { match: /sodium nitrite|sodium nitrate|nitrite.*preserv/i,         mFloor:8, uFloor:7, reason:"Nitrites — IARC Group 1 carcinogen in processed meat (WHO 2015)" },
  { match: /potassium bromate/i,                                      mFloor:7, uFloor:6, reason:"Potassium bromate — IARC Group 2B, banned EU/UK, used in bread" },
  { match: /propyl gallate/i,                                         mFloor:5, uFloor:4, reason:"Propyl gallate — endocrine disruption, NTP concern" },
  { match: /\bEDTA\b|ethylenediaminetetraacetic/i,                    mFloor:4, uFloor:3, reason:"EDTA — environmental persistence, chelating agent" },
  // Acrylamide — IARC 2A, forms in high-heat starchy foods
  // Acrylamide: IARC Group 2A. Forms in high-heat starchy foods.
  // Floor is 5 for general detection. Restaurant fried items scored higher via calibration.
  // Do NOT apply mFloor:7 to bread, toast, crackers, coffee — dose is orders of magnitude lower.
  { match: /\bacrylamide\b/i,                                         mFloor:5, uFloor:4, reason:"Acrylamide — IARC Group 2A, forms in fried/baked starchy foods at high heat" },

  // ══════════════════════════════════════════════════════════
  // FORMALDEHYDE & RELEASERS — IARC Group 1
  // ══════════════════════════════════════════════════════════
  { match: /\bformaldehyde\b|methylene glycol|formalin/i,             mFloor:7, uFloor:6, reason:"Formaldehyde — IARC Group 1 carcinogen" },
  { match: /DMDM hydantoin|DMDMhydantoin/i,                           mFloor:6, uFloor:5, reason:"DMDM Hydantoin — formaldehyde releaser (EWG flagged)" },
  { match: /quaternium.?15/i,                                         mFloor:6, uFloor:5, reason:"Quaternium-15 — formaldehyde releaser, contact allergen" },
  { match: /imidazolidinyl urea|diazolidinyl urea/i,                  mFloor:6, uFloor:5, reason:"Urea preservative — formaldehyde releaser" },
  { match: /2.?bromo.?2.?nitropropane|bronopol/i,                     mFloor:6, uFloor:5, reason:"Bronopol — formaldehyde releaser, nitrosamine precursor" },
  { match: /methenamine|hexamethylenetetramine/i,                     mFloor:5, uFloor:4, reason:"Methenamine — releases formaldehyde in acidic conditions" },

  // ══════════════════════════════════════════════════════════
  // PARABENS — EU banned long-chain, EWG flagged
  // ══════════════════════════════════════════════════════════
  { match: /isobutylparaben|isopropylparaben/i,                       mFloor:6, uFloor:5, reason:"Long-chain parabens — EU banned, endocrine disruptors" },
  { match: /butylparaben|propylparaben/i,                             mFloor:5, uFloor:4, reason:"Long-chain parabens — endocrine disruptors, hormone mimicry" },
  { match: /methylparaben|ethylparaben/i,                             mFloor:4, uFloor:3, reason:"Short-chain parabens — estrogen mimicry, low-level concern" },
  { match: /\bparaben\b/i,                                            mFloor:4, uFloor:3, reason:"Parabens — endocrine disruption class concern" },

  // ══════════════════════════════════════════════════════════
  // PHTHALATES — IARC 2B, endocrine disruptors
  // ══════════════════════════════════════════════════════════
  { match: /\bDEHP\b|di.?2.?ethylhexyl phthalate|dioctyl phthalate/i, mFloor:7, uFloor:6, reason:"DEHP — IARC 2B, reproductive toxin, EU SVHC" },
  { match: /\bDBP\b|dibutyl phthalate/i,                              mFloor:7, uFloor:6, reason:"DBP — EU banned cosmetics, reproductive toxin" },
  { match: /\bBBP\b|benzyl butyl phthalate/i,                         mFloor:7, uFloor:6, reason:"BBP — EU SVHC, endocrine disruptor" },
  { match: /\bDEP\b|diethyl phthalate/i,                              mFloor:6, uFloor:5, reason:"DEP — common in fragrance, endocrine disruption" },
  { match: /\bDIBP\b|diisobutyl phthalate/i,                          mFloor:7, uFloor:6, reason:"DIBP — EU SVHC, reproductive toxin" },
  { match: /\bphthalate\b|phthalic acid ester/i,                      mFloor:6, uFloor:5, reason:"Phthalate — endocrine disruptor class" },

  // ══════════════════════════════════════════════════════════
  // BISPHENOLS — endocrine disruptors
  // ══════════════════════════════════════════════════════════
  { match: /\bBPA\b|bisphenol.?A\b/i,                                 mFloor:7, uFloor:6, reason:"BPA — endocrine disruptor, EU SVHC, banned baby products" },
  { match: /\bBPS\b|bisphenol.?S\b/i,                                 mFloor:6, uFloor:5, reason:"BPS — BPA replacement, same endocrine disruption" },
  { match: /\bBPF\b|bisphenol.?F\b/i,                                 mFloor:6, uFloor:5, reason:"BPF — BPA replacement, hormone disruption" },
  { match: /\bBPAF\b|bisphenol.?AF\b/i,                               mFloor:7, uFloor:6, reason:"BPAF — EU SVHC Feb 2026, reproductive toxin" },
  { match: /\bbisphenol\b/i,                                           mFloor:6, uFloor:5, reason:"Bisphenol compound — endocrine disruption class" },

  // ══════════════════════════════════════════════════════════
  // CHEMICAL UV FILTERS — FDA systemic absorption
  // ══════════════════════════════════════════════════════════
  { match: /oxybenzone|benzophenone.?3/i,                             mFloor:7, uFloor:7, reason:"Oxybenzone — bloodstream after single use (Matta JAMA 2019)" },
  { match: /octinoxate|octyl methoxycinnamate/i,                      mFloor:6, uFloor:6, reason:"Octinoxate — FDA systemic absorption, coral reef harm" },
  { match: /avobenzone/i,                                              mFloor:5, uFloor:5, reason:"Avobenzone — FDA systemic absorption concerns" },
  { match: /homosalate/i,                                              mFloor:5, uFloor:5, reason:"Homosalate — FDA systemic absorption, endocrine disruption" },
  { match: /octisalate|octyl salicylate/i,                             mFloor:5, uFloor:4, reason:"Octisalate — FDA systemic absorption review" },
  { match: /ensulizole|phenylbenzimidazole/i,                          mFloor:5, uFloor:4, reason:"Ensulizole — FDA systemic absorption concern" },

  // ══════════════════════════════════════════════════════════
  // HEAVY METALS — IARC Group 1, neurotoxins
  // ══════════════════════════════════════════════════════════
  { match: /\bmercury\b|thimerosal|thiomersal/i,                       mFloor:9, uFloor:8, reason:"Mercury — IARC Group 1, neurotoxin, banned most cosmetics" },
  { match: /\blead\b|lead acetate|lead compound/i,                     mFloor:8, uFloor:7, reason:"Lead — IARC Group 1, neurotoxin, no safe exposure level" },
  { match: /\bcadmium\b|cadmium compound/i,                            mFloor:8, uFloor:7, reason:"Cadmium — IARC Group 1 carcinogen, kidney toxin" },
  { match: /\barsenic\b|arsenic compound/i,                            mFloor:9, uFloor:8, reason:"Arsenic — IARC Group 1, carcinogenic, groundwater contamination" },
  { match: /\bchromium.?VI\b|hexavalent chromium/i,                    mFloor:8, uFloor:7, reason:"Hexavalent chromium — IARC Group 1 carcinogen" },
  { match: /\bnickel\b(?!.*free)/i,                                    mFloor:6, uFloor:5, reason:"Nickel — IARC Group 1 (inhalation), skin sensitizer" },
  { match: /\bcobalt\b|cobalt compound/i,                              mFloor:6, uFloor:5, reason:"Cobalt — IARC 2A, lung carcinogen in hard metals" },

  // ══════════════════════════════════════════════════════════
  // PLASTIC CHEMICALS IN FOOD CONTACT
  // ══════════════════════════════════════════════════════════
  { match: /\bPVA\b|polyvinyl alcohol.*pod|pod.*polyvinyl|PVA.*film/i, mFloor:6, uFloor:5, reason:"PVA pod film — dissolves into waterways as microplastic" },
  { match: /\bPVC\b|polyvinyl chloride/i,                              mFloor:7, uFloor:6, reason:"PVC — contains plasticizers and stabilizers, leaches at heat" },
  { match: /polystyrene|styrofoam|\bPS\b.*food/i,                      mFloor:6, uFloor:6, reason:"Polystyrene — styrene leaching (IARC 2B), especially hot food contact" },
  { match: /polycarbonate.*food|polycarbonate.*container/i,            mFloor:6, uFloor:5, reason:"Polycarbonate — BPA source, heat increases leaching" },
  { match: /1,?4.?dioxane/i,                                           mFloor:7, uFloor:6, reason:"1,4-Dioxane — contaminant in cosmetics, IARC 2B carcinogen" },
  { match: /styrene|polystyrene/i,                                     mFloor:6, uFloor:5, reason:"Styrene — IARC 2B, neurotoxin, leaches from polystyrene" },

  // ══════════════════════════════════════════════════════════
  // FLAME RETARDANTS — neurotoxins, persistent
  // ══════════════════════════════════════════════════════════
  { match: /\bPBDE\b|polybrominated diphenyl ether/i,                  mFloor:9, uFloor:8, reason:"PBDE — banned, persistent neurotoxin, thyroid disruption" },
  { match: /\bTCEP\b|tris.?2.?chloroethyl.?phosphate/i,               mFloor:8, uFloor:7, reason:"TCEP — IARC 2B carcinogen, endocrine disruptor" },
  { match: /\bTDCPP\b|tris.?1,3.?dichloro.?2.?propyl/i,               mFloor:8, uFloor:7, reason:"TDCPP — IARC 2A carcinogen, California Prop 65" },
  { match: /\bTCPP\b|tris.?chloropropyl.?phosphate/i,                  mFloor:7, uFloor:6, reason:"TCPP — reproductive toxin, EU SVHC" },
  { match: /triphenyl phosphate|\bTPhP\b/i,                            mFloor:7, uFloor:6, reason:"TPhP — EU SVHC Nov 2024, endocrine disruptor" },
  { match: /organophosphate flame|phosphate.*flame retardant/i,        mFloor:7, uFloor:6, reason:"Organophosphate flame retardant — neurotoxin class" },
  { match: /flame retardant(?!.*free)/i,                               mFloor:6, uFloor:5, reason:"Flame retardant — undisclosed type, likely halogenated" },

  // ══════════════════════════════════════════════════════════
  // SYNTHETIC FRAGRANCE & VOCs
  // ══════════════════════════════════════════════════════════
  { match: /synthetic fragrance|artificial fragrance|fragrance.*petroleum|parfum.*synthetic|undisclosed.*fragrance/i, mFloor:5, uFloor:4, reason:"Synthetic fragrance — undisclosed phthalates/VOCs (Steinemann 2017)" },
  { match: /\btoluene\b/i,                                             mFloor:6, uFloor:5, reason:"Toluene — neurotoxin, reproductive harm, IARC 3" },
  { match: /\bbenzene\b/i,                                             mFloor:8, uFloor:7, reason:"Benzene — IARC Group 1 carcinogen, leukemia" },
  { match: /\bxylene\b/i,                                              mFloor:6, uFloor:5, reason:"Xylene — neurotoxin, VOC, reproductive concern" },
  { match: /dibutyl phthalate.*nail|DBP.*nail/i,                       mFloor:7, uFloor:6, reason:"DBP in nail products — reproductive toxin, EU banned" },
  { match: /\bMEK\b|methyl ethyl ketone/i,                             mFloor:5, uFloor:4, reason:"MEK — neurotoxin, eye/respiratory irritant" },

  // ══════════════════════════════════════════════════════════
  // TEXTILE CHEMICALS — EU REACH restricted
  // ══════════════════════════════════════════════════════════
  { match: /azo dye|azo.?dye|aromatic amine.*dye/i,                   mFloor:6, uFloor:5, reason:"Azo dyes — release carcinogenic aromatic amines (EU REACH)" },
  { match: /PFAS.*DWR|DWR.*PFAS|durable water repellent.*fluoro/i,    mFloor:8, uFloor:6, reason:"PFAS DWR coating — forever chemicals on fabric" },
  { match: /dimethylpolysiloxane|antifoam.*silicone|silicone.*antifoam/i, mFloor:5, uFloor:4, reason:"Dimethylpolysiloxane — silicone antifoaming in frying oils" },
  { match: /nonylphenol|nonylphenol ethoxylate|\bNPE\b/i,              mFloor:7, uFloor:6, reason:"Nonylphenol — EU SVHC, endocrine disruptor, textile processing" },
  { match: /pentachlorophenol|\bPCP\b.*wood|wood.*\bPCP\b/i,           mFloor:8, uFloor:7, reason:"Pentachlorophenol — IARC Group 1, banned textile preservative" },
  { match: /short.?chain chlorinated paraffin|SCCP/i,                  mFloor:7, uFloor:6, reason:"SCCP — EU SVHC, persistent toxic, used in textiles" },
  { match: /dimethyl fumarate|\bDMFu?\b/i,                              mFloor:7, uFloor:6, reason:"Dimethyl fumarate — EU banned in consumer products, severe skin burn" },

  // ══════════════════════════════════════════════════════════
  // SWEETENERS & FOOD ADDITIVES
  // ══════════════════════════════════════════════════════════
  { match: /\baspartame\b/i,                                            mFloor:5, uFloor:4, reason:"Aspartame — IARC Group 2B (2023), WHO ADI concerns" },
  { match: /\bsucralose\b/i,                                            mFloor:4, uFloor:3, reason:"Sucralose — chlorinated compound; 2023 study found genotoxicity markers; gut microbiome disruption" },
  { match: /high.fructose corn syrup|\bHFCS\b/i,                       mFloor:5, uFloor:5, reason:"HFCS — metabolic disease, liver impact, obesity driver" },
  { match: /saccharin/i,                                                mFloor:4, uFloor:3, reason:"Saccharin — historically IARC 2B (downgraded), gut microbiome" },
  { match: /acesulfame.?k|acesulfame potassium/i,                      mFloor:4, uFloor:3, reason:"Acesulfame-K — animal carcinogen studies, gut disruption" },
  { match: /\bcarrageenan\b/i,                                          mFloor:5, uFloor:4, reason:"Carrageenan — intestinal inflammation, WHO concern (food grade)" },
  { match: /propyl gallate/i,                                           mFloor:5, uFloor:4, reason:"Propyl gallate — endocrine disruption, NTP listed" },
  { match: /sodium benzoate.*ascorbic|ascorbic.*sodium benzoate/i,     mFloor:6, uFloor:5, reason:"Sodium benzoate + vitamin C = benzene formation (IARC Group 1)" },
  { match: /\bmonosodium glutamate\b|\bMSG\b/i,                         mFloor:3, uFloor:3, reason:"MSG — excitotoxin concerns, FDA GRAS but contested" },
  { match: /potassium bromate/i,                                        mFloor:7, uFloor:6, reason:"Potassium bromate — IARC 2B, banned EU/Canada, used in flour" },
  { match: /brominated vegetable oil|\bBVO\b/i,                         mFloor:6, uFloor:5, reason:"BVO — FDA proposed ban 2023, iodine displacement, organ buildup" },

  // ══════════════════════════════════════════════════════════
  // ANTIMICROBIALS — endocrine disruption, resistance
  // ══════════════════════════════════════════════════════════
  { match: /\btriclosan\b/i,                                            mFloor:6, uFloor:5, reason:"Triclosan — FDA banned soaps 2017, thyroid disruption, antibiotic resistance" },
  { match: /\btriclocarban\b/i,                                         mFloor:6, uFloor:5, reason:"Triclocarban — FDA banned, endocrine disruptor, aquatic toxin" },
  { match: /benzalkonium chloride|\bBAC\b.*antimicro/i,                 mFloor:5, uFloor:4, reason:"Benzalkonium chloride — antimicrobial resistance, irritant" },
  { match: /quaternary ammonium|alkyl dimethyl benzyl|didecyl dimethyl|dialkyl dimethyl ammonium|\bQUAT\b/i,
                                                                         mFloor:5, uFloor:5, reason:"Quaternary ammonium compounds (QACs) — EPA flagged reproductive harm and asthma induction in cleaning products" },

  // ══════════════════════════════════════════════════════════
  // PESTICIDES — EWG Dirty Dozen, PFAS pesticides
  // IARC 2A = mFloor 7 (probable carcinogen, confirmed at measurable levels)
  // ══════════════════════════════════════════════════════════
  // Glyphosate: IARC Group 2A. Floor is 5 (not 7) because context matters.
  // Cheerios (primary oat, confirmed EWG residue, high sugar) → AI scores materials 7 via calibration.
  // Kashi (oats are 1 of 7+ grains, Non-GMO, high fiber) → AI scores materials 3 via calibration.
  // The floor catches cases where AI misses glyphosate entirely. Calibration sets the right level.
  { match: /\bglyphosate\b/i,                                           mFloor:5, uFloor:4, reason:"Glyphosate — IARC Group 2A probable carcinogen" },
  { match: /\bchlorpyrifos\b/i,                                         mFloor:7, uFloor:6, reason:"Chlorpyrifos — EPA banned 2021, children's neurotoxin" },
  { match: /\batrazine\b/i,                                             mFloor:7, uFloor:6, reason:"Atrazine — endocrine disruptor, banned EU, water contaminant" },
  { match: /\bneonicotinoid\b|imidacloprid|clothianidin|thiamethoxam/i, mFloor:6, uFloor:5, reason:"Neonicotinoid pesticide — bee colony collapse, systemic in crops" },
  { match: /PFAS.*pesticide|pesticide.*PFAS|fluoro.*pesticide/i,       mFloor:7, uFloor:6, reason:"PFAS-based pesticide — EWG 2026, 63% Dirty Dozen residues" },

  // ══════════════════════════════════════════════════════════
  // SOLVENTS & PROCESSING CHEMICALS
  // ══════════════════════════════════════════════════════════
  { match: /\bn-hexane\b/i,                                             mFloor:6, uFloor:5, reason:"n-Hexane — EU SVHC Feb 2026, neurotoxin (peripheral neuropathy)" },
  { match: /methylene chloride|dichloromethane|\bDCM\b/i,              mFloor:8, uFloor:7, reason:"Methylene chloride — IARC Group 1, carcinogen, EPA restricted" },
  { match: /carbon tetrachloride/i,                                     mFloor:7, uFloor:6, reason:"Carbon tetrachloride — IARC Group 2B, liver carcinogen" },
  { match: /\bperchloroethylene\b|tetrachloroethylene|\bPCE\b/i,       mFloor:7, uFloor:6, reason:"Perchloroethylene — IARC Group 1, dry cleaning solvent" },
  { match: /vinyl chloride/i,                                           mFloor:9, uFloor:8, reason:"Vinyl chloride — IARC Group 1, liver cancer (PVC precursor)" },
  { match: /ethylene oxide/i,                                           mFloor:9, uFloor:8, reason:"Ethylene oxide — IARC Group 1, breast cancer, used in sterilization" },

  // ══════════════════════════════════════════════════════════
  // HAIR DYE CHEMICALS
  // ══════════════════════════════════════════════════════════
  { match: /p-phenylenediamine|PPD|paraphenylenediamine/i,              mFloor:6, uFloor:6, reason:"PPD — IARC 3 carcinogen, common hair dye allergen/sensitizer" },
  { match: /resorcinol.*hair|hair.*resorcinol/i,                        mFloor:6, uFloor:5, reason:"Resorcinol in hair dye — thyroid disruption, skin sensitizer" },
  { match: /lead acetate.*hair|hair.*lead acetate/i,                   mFloor:8, uFloor:7, reason:"Lead acetate in hair dye — IARC Group 1 lead compound" },
  { match: /aminophenol|2.?aminophenol|4.?aminophenol/i,               mFloor:6, uFloor:5, reason:"Aminophenol — IARC Group 2B, hair dye chemical" },

  // ══════════════════════════════════════════════════════════
  // MICROPLASTICS
  // ══════════════════════════════════════════════════════════
  { match: /microplastic|microbead|polyethylene.*bead|polypropylene.*bead/i, mFloor:6, uFloor:6, reason:"Microplastics/microbeads — direct ingestion/absorption, bioaccumulation" },
  { match: /microfiber.*shed|shed.*microfiber/i,                       mFloor:6, uFloor:5, reason:"Microfiber shedding — ocean contamination, food chain entry" },

  // ══════════════════════════════════════════════════════════
  // POLYCHLORINATED COMPOUNDS
  // ══════════════════════════════════════════════════════════
  { match: /\bPCB\b|polychlorinated biphenyl/i,                        mFloor:9, uFloor:8, reason:"PCBs — IARC Group 1, banned, persistent organic pollutant" },
  { match: /\bPCDD\b|\bdioxin\b/i,                                     mFloor:9, uFloor:8, reason:"Dioxins — IARC Group 1, most toxic known compounds" },
  { match: /chlorinated paraffin/i,                                    mFloor:7, uFloor:6, reason:"Chlorinated paraffins — EU SVHC, PBT substance" },

];

// Apply substance floors based on what AI actually found in concerns
// Phrases that indicate speculation — floors should NOT fire on these
const HEDGED_PHRASES = [
  "may contain", "might contain", "could contain", "possibly contain",
  "potential", "speculative", "if present", "suspected", "unconfirmed",
  "possible trace", "trace amount", "not confirmed", "unclear whether",
];

// Phrases that NEGATE a substance — "no glyphosate" should not trigger glyphosate floor
const NEGATION_PHRASES = [
  "no glyphosate", "glyphosate free", "glyphosate-free",
  "no synthetic pesticide", "usda organic", "certified organic",
  "no artificial", "free of", "does not contain", "free from",
  "no added", "without ", "not present", "non-gmo", "no pfas",
  "pfas-free", "bpa-free", "no bpa", "no bht", "no bha", "no tbhq",
];

// Food category sets — used by substance floors, positive ceilings, and alternative filters
const FOOD_CATEGORIES_SET = new Set(["food", "beverage", "restaurant", "supplement", "food_beverage"]);
const NON_FOOD_CATEGORIES_SET = new Set(["clothing", "personal_care", "toy", "accessory", "home", "baby", "kitchen", "home_furnishing", "other"]);

function applySubstanceFloors(mScore, uScore, p1, p2) {
  const concernsArr = [
    ...(p1.product_analysis?.concerns || []),
    ...(p1.materials?.concerns || []),
    ...(p2?.refined_concerns || []),
    ...(p1.raw_concerns || []),
  ];
  const summaryText = (p1.summary || p2?.summary || "").toLowerCase();

  // Build confirmed-only text — strip sentences containing hedged language
  const confirmedSentences = [];
  const allSentences = (JSON.stringify(concernsArr) + " " + summaryText)
    .split(/[.!?;]/)
    .map(s => s.toLowerCase().trim())
    .filter(Boolean);

  for (const sentence of allSentences) {
    const isHedged   = HEDGED_PHRASES.some(hedge => sentence.includes(hedge));
    const isNegated  = NEGATION_PHRASES.some(neg => sentence.includes(neg));
    if (!isHedged && !isNegated) confirmedSentences.push(sentence);
  }
  const confirmedText = confirmedSentences.join(" ");

  let triggered = [];
  for (const rule of SUBSTANCE_FLOORS) {
    if (rule.match.test(confirmedText)) {
      if (mScore < rule.mFloor || uScore < rule.uFloor) {
        mScore = Math.max(mScore, rule.mFloor);
        uScore = Math.max(uScore, rule.uFloor);
        triggered.push(rule.reason);
      }
    }
  }
  return { mScore, uScore, triggered };
}

// ── DUAL SCORING FORMULA ─────────────────────────────────────
// Food/beverage: ingestion-first — ingredients dominate, packaging
// penalizes for food contact, nutrition positives lower score.
// Non-food: contact/environment-first — exposure and sustainability
// carry more weight, packaging less critical.

const FOOD_CATEGORIES    = new Set(["food", "beverage", "restaurant", "supplement", "food_beverage"]);
const NONFOOD_CATEGORIES = new Set(["clothing", "personal_care", "toy", "accessory", "home", "baby", "kitchen", "home_furnishing", "other"]);

// ── 10-CATEGORY SCORING FORMULAS ─────────────────────────────
// Manufacturing removed — too hard to measure consistently and creates false precision.
// Each formula reflects the primary risk pathway for that category.
// Weights are applied server-side as source of truth — AI cannot override.
const CATEGORY_FORMULAS = {
  // FOOD: Ingredients are the story — 90% what you eat, 10% what it comes in
  // Organic spinach in a plastic bag should still score 2. Flag packaging separately.
  food:          { m:0.90, u:0.00, pk:0.10, s:0.00 },
  food_beverage: { m:0.90, u:0.00, pk:0.10, s:0.00 }, // legacy alias

  // BEVERAGE: Ingredients and what you drink matters most — packaging is still real but secondary
  // Cans are clean packaging but shouldn't rescue a bad drink to a false safe score
  beverage:      { m:0.85, u:0.00, pk:0.15, s:0.00 },

  // RESTAURANT: Ingredients are the story — ingredients 90%, packaging 10%
  // Sustainability removed: no per-item sustainability data available for restaurant items
  restaurant:    { m:0.90, u:0.00, pk:0.10, s:0.00 },

  // SUPPLEMENT: Concentrated daily ingestion — ingredients + some packaging leaching
  supplement:    { m:0.65, u:0.25, pk:0.10, s:0.00 },

  // BEAUTY: Leave-on daily skin contact — exposure pathway equals materials
  personal_care: { m:0.45, u:0.45, pk:0.05, s:0.05 },

  // TOYS: Children put toys in mouths — materials and ingestion risk dominate
  toy:           { m:0.50, u:0.40, pk:0.05, s:0.05 },

  // CLOTHING/SHOES: Microfiber shedding into waterways — sustainability earns real weight
  clothing:      { m:0.35, u:0.30, pk:0.00, s:0.35 },

  // ACCESSORIES: Jewelry/bags — environmental footprint matches materials concern
  accessory:     { m:0.40, u:0.25, pk:0.00, s:0.35 },

  // HOME: Inhalation and residue from cleaners/candles/rugs is the primary story
  home:          { m:0.30, u:0.45, pk:0.10, s:0.15 },
  kitchen:       { m:0.30, u:0.45, pk:0.10, s:0.15 }, // kitchen maps to home
  home_furnishing:{ m:0.30, u:0.45, pk:0.10, s:0.15 }, // legacy alias

  // BABY: Most protective formula — what touches developing systems is everything
  baby:          { m:0.55, u:0.40, pk:0.05, s:0.00 },

  // FALLBACK
  other:         { m:0.45, u:0.30, pk:0.10, s:0.15 },
};

function computeScore(mScore, uScore, pkScore, sScore, category) {
  const f = CATEGORY_FORMULAS[category] || CATEGORY_FORMULAS.other;
  return Math.min(10, Math.max(1,
    Math.round(mScore*f.m + uScore*f.u + pkScore*f.pk + sScore*f.s)
  ));
}

// Helper: is this a food-type category
function isFoodCategory(category) {
  return FOOD_CATEGORIES.has(category);
}

// ── POST-FORMULA CONSISTENCY CHECKER ─────────────────────────
// Catches hallucinations where AI scores contradict their own labels/reasoning.
// Four rules applied after formula, before caching.
function applyConsistencyChecks(mScore, uScore, pkScore, sScore, finalScore, p1, p2, category, productName) {
  let checked = finalScore;
  const flags = [];

  // 1. LABEL/SCORE CONTRADICTION
  // If AI's own label says "low / minimal / inert / clean" but scored dimension 6+
  const materialsLabel = (p1.materials?.label || "").toLowerCase();
  const usageLabel     = (p1.usage_exposure?.label || "").toLowerCase();
  const summary        = (p1.summary || p2?.summary || "").toLowerCase();
  const lowMaterialsLabel = /natural material|inert|zero.*chemical|no.*harmful|clean.*formula|organic.*only|plant.based only|no.*synthetic/.test(materialsLabel + " " + summary);
  const lowUsageLabel     = /low exposure|minimal exposure|no.*ingestion|no.*contact risk|no.*leach/.test(usageLabel + " " + summary);
  if (lowMaterialsLabel && mScore > 4) {
    console.log(`Consistency: materials label says clean but mScore=${mScore} — capping at 4`);
    mScore = Math.min(mScore, 4);
    flags.push("materials_label_contradiction");
  }
  if (lowUsageLabel && uScore > 4) {
    console.log(`Consistency: usage label says low but uScore=${uScore} — capping at 4`);
    uScore = Math.min(uScore, 4);
    flags.push("usage_label_contradiction");
  }

  // 2. DIMENSION SPREAD SANITY CHECK
  // If materials is genuinely clean (1-2) the final score can't be high
  // unless exposure/packaging has a specific documented reason
  if (mScore <= 2 && checked >= 7) {
    console.log(`Consistency: mScore=${mScore} but final=${checked} — investigating`);
    // Recompute with corrected dimensions
    checked = computeScore(mScore, uScore, pkScore, sScore, category);
    flags.push("dimension_spread_anomaly");
  }

  // 3. CONFIDENCE-LINKED CEILING
  // Low confidence = directional estimate only — never implies confirmed harmful substances
  const confidence = p2?.confidence || p1.confidence || "medium";
  if (confidence === "low" && checked > 6) {
    console.log(`Consistency: low confidence but score=${checked} — capping at 6`);
    checked = Math.min(checked, 6);
    flags.push("low_confidence_ceiling");
  }

  // 4. INERT MATERIAL CEILING (glass, ceramic, stainless)
  const allText = JSON.stringify([p1.natural_materials||[], p1.materials||{}, p2||{}]).toLowerCase();
  const isInert = /borosilicate|inert glass|inert ceramic|stainless steel|cast iron/.test(allText + " " + summary);
  if (isInert && mScore > 3) {
    mScore = Math.min(mScore, 3);
    checked = computeScore(mScore, uScore, pkScore, sScore, category);
    flags.push("inert_material_ceiling");
  }
  const noLeach = /no leach|zero leach|inert.*no.*risk/.test(allText + " " + summary);
  if (isInert && noLeach && uScore > 3) {
    uScore = Math.min(uScore, 3);
    checked = computeScore(mScore, uScore, pkScore, sScore, category);
    flags.push("inert_usage_ceiling");
  }

  return { mScore, uScore, pkScore, sScore, finalScore: checked, consistencyFlags: flags };
}

// ── POSITIVE CEILING SYSTEM ───────────────────────────────────
// Floors push dangerous products UP. Ceilings pull clean products DOWN.
// Prevents the AI over-penalising genuinely clean food products.
// Only applies to food/beverage categories.
function applyPositiveCeilings(finalScore, category, p1, p2, substanceTriggered) {
  if (!FOOD_CATEGORIES_SET.has(category)) return { finalScore, ceilingFlags: [] };

  const flags = [];
  const allText = JSON.stringify([
    p1.product_analysis || {},
    p1.materials || {},
    p2 || {},
    p1.summary || "",
    p1.raw_concerns || [],
  ]).toLowerCase();

  // Has any dangerous substance floor fired?
  const dangerousSubstanceFired = substanceTriggered.some(t =>
    /red 40|yellow 5|yellow 6|blue 1|bha|tbhq|nitrite|nitrate|petroleum dye|pfas|pfoa|pfos|glyphosate|acrylamide/i.test(t)
  );

  // CEILING 1: USDA Organic + no confirmed dangerous substances → cap at 3
  // CRITICAL GUARD: This ceiling only applies to minimally/moderately processed products.
  // Organic Oreos, organic chips, organic candy = still junk food. NOVA 4 organic products
  // should NOT be capped at 3. The ceiling protects genuinely clean organic whole foods.
  // PRECISION: Only fires on confirmed USDA Organic certification — NOT "made with organic"
  // or "contains organic ingredients" which are legally weaker claims.
  const isConfirmedOrganic = /\busda organic\b|certified organic by|organic certified by|100% organic/.test(allText);
  const isUltraProcessed = /ultra.?processed|nova 4|industrial formul|oreo|cookie|chip|candy|pop.tart|fruit snack|gummy|frosted|sugary cereal|sweetened cereal/.test(allText);
  const isAlcohol = /\b(wine|beer|whiskey|vodka|rum|gin|tequila|champagne|ale|lager|stout|cider|spirits|alcoholic|ethanol.*beverage|alcohol.*content)\b/.test(allText);
  if (isConfirmedOrganic && !dangerousSubstanceFired && !isUltraProcessed && !isAlcohol && finalScore > 3) {
    console.log(`Organic ceiling: capping food score from ${finalScore} to 3`);
    finalScore = Math.min(finalScore, 3);
    flags.push("usda_organic_ceiling");
  }

  // CEILING 2: Non-GMO + whole food + no dyes + no synthetic preservatives → cap at 4
  // Same NOVA guard applies — non-GMO junk food is still junk food.
  const isNonGMO = /non.?gmo project verified|non.?gmo certified|non.?gmo verified/.test(allText);
  const hasNoDyes = !/red\s*40|yellow\s*5|yellow\s*6|blue\s*1|blue\s*2|titanium dioxide.*food|petroleum dye|artificial.*color.*dye/.test(allText);
  const hasNoSyntheticPreservatives = !/\bbha\b|\bbht\b|\btbhq\b|sodium benzoate.*vitamin|sodium nitrite|potassium bromate/.test(allText);
  if (isNonGMO && hasNoDyes && hasNoSyntheticPreservatives && !dangerousSubstanceFired && !isUltraProcessed && !isAlcohol && finalScore > 4) {
    console.log(`NonGMO clean ceiling: capping food score from ${finalScore} to 4`);
    finalScore = Math.min(finalScore, 4);
    flags.push("nongmo_clean_ceiling");
  }

  return { finalScore, ceilingFlags: flags };
}


// Children have thinner skin, developing organ systems, lower body weight
// (higher dose per kg), and consume/wear products daily for years.
// Two layers: automatic detection for obvious child products,
// and a client-side toggle for any product.

const CHILD_PRODUCT_PATTERNS = /\b(kids?|children'?s?|child|baby|babies|toddler|infant|newborn|nursery|junior|jr\b|boys?|girls?|youth|pediatric|little ones?)\b/i;

const CHILD_FOOD_BRANDS = /froot loops|fruit loops|lucky charms|cocoa puffs|count chocula|trix cereal|apple jacks|honey smacks|captain crunch|cap'n crunch|cheerios|honey nut cheerios|cinnamon toast crunch.*kids|kix cereal|cocoa krispies|rice krispies treats|gushers|fruit by the foot|lunchables|go-gurt|squeeze applesauce|pediasure|gerber|beech.?nut|happy baby|earth's best/i;

// Substances with specific child developmental concerns — higher weight than adult scoring
const CHILD_CONCERN_SUBSTANCES = [
  { match: /Red\s*40|Yellow\s*5|Yellow\s*6|Blue\s*1|Blue\s*2|titanium dioxide|petroleum dye|artificial.*color|artificial.*dye/i, bump: 2, reason: "Petroleum dyes linked to childhood ADHD and hyperactivity (McCann et al., Lancet 2007) — children are uniquely vulnerable" },
  { match: /glyphosate/i,                          bump: 1, reason: "EWG child-specific glyphosate threshold is lower than adult — body weight adjustment means children receive higher effective dose" },
  { match: /\bPFAS\b|PFOA|PFOS|perfluoro/i,        bump: 2, reason: "PFAS disrupts immune and hormone development in children — CDC flagged as priority child health concern" },
  { match: /phthalate|DEHP|DBP/i,                  bump: 2, reason: "Phthalates disrupt reproductive development — most critical during early childhood (Swan 2021)" },
  { match: /flame retardant|PBDE|TCEP|TDCPP/i,     bump: 2, reason: "Flame retardant neurotoxicity disproportionately affects developing brains (Stapleton 2011)" },
  { match: /synthetic fragrance|artificial fragrance/i, bump: 1, reason: "Children's developing endocrine systems are more sensitive to fragrance chemicals and phthalates" },
  { match: /formaldehyde|DMDM hydantoin/i,          bump: 1, reason: "Formaldehyde exposure more concerning for developing respiratory systems" },
  { match: /parabens?|methylparaben|propylparaben/i, bump: 1, reason: "Parabens disrupt hormones — developing endocrine systems more vulnerable" },
  { match: /bisphenol|BPA|BPS/i,                   bump: 2, reason: "BPA/BPS endocrine disruption most harmful during developmental windows in childhood" },
  { match: /chlorine.*bleach|chlorine.*pulp|dioxin/i, bump: 1, reason: "Chlorine bleaching byproducts (dioxins) have child-specific developmental endpoints" },
  { match: /polypropylene.*liner|polyester.*skin|synthetic.*liner/i, bump: 1, reason: "Synthetic materials in direct contact with sensitive baby skin — higher absorption rate" },
];

function computeChildScore(baseScore, concernsText, category, productName, isChildProduct) {
  if (!isChildProduct) return { childScore: null, childBumps: [] };

  let bump = 0;
  const bumps = [];

  // Always add +1 for child product — developing systems baseline
  bump += 1;
  bumps.push("Children's developing organ systems require more protective thresholds than adult scoring");

  // Check for specific child-concern substances
  for (const concern of CHILD_CONCERN_SUBSTANCES) {
    if (concern.match.test(concernsText)) {
      bump += concern.bump;
      bumps.push(concern.reason);
    }
  }

  // Baby category gets additional bump — most vulnerable population
  if (category === "baby") {
    bump += 1;
    bumps.push("Baby products: highest vulnerability — newborn skin is 5x more permeable than adult skin");
  }

  const childScore = Math.min(10, baseScore + bump);
  return { childScore, childBumps: bumps };
}

function detectChildProduct(productName, category) {
  if (category === "baby") return true;
  const name = (productName || "").toLowerCase();
  if (CHILD_PRODUCT_PATTERNS.test(name)) return true;
  if (CHILD_FOOD_BRANDS.test(name)) return true;
  return false;
}


// Average scores by category — used for peer comparison stat
const CATEGORY_AVERAGES = {
  clothing:       { avg: 5.5, label: "clothing items"         },
  food_beverage:  { avg: 5.8, label: "food and drink items"   },
  personal_care:  { avg: 5.5, label: "personal care items"    },
  kitchen:        { avg: 5.0, label: "kitchen items"          },
  baby:           { avg: 4.8, label: "baby products"          },
  supplement:     { avg: 4.0, label: "supplements"            },
  home_furnishing:{ avg: 5.2, label: "home furnishing items"  },
  other:          { avg: 5.5, label: "consumer products"      },
};

// ── WEB SEARCH FOR PRODUCT DETAILS ───────────────────────────
// Determines if a product needs a web search for accurate material data
function needsSearch(productName) {
  const name = productName.toLowerCase();

  // Skip search for generic/obvious products — we already know what they're made of
  const obvious = [
    "styrofoam","plastic bag","cling wrap","plastic wrap","disposable cup",
    "plastic bottle","plastic straw","zip lock","ziplock","fleece jacket",
    "polyester","nylon","teflon","non-stick","keurig","lipton tea bag",
    "cotton","linen","wool","glass","stainless steel","cast iron","ceramic",
    "wooden spoon","bamboo","wood",
  ];
  if (obvious.some(o => name.includes(o))) return false;

  // Skip for well-known brands where AI already has reliable material knowledge
  // and the product has stable known composition (saves ~500ms + API cost per scan)
  const knownBrands = [
    "pampers","huggies","tide","dawn","cascade","glad","ziploc","bounty",
    "charmin","kleenex","scott","puffs","dove","neutrogena","cetaphil",
    "olay","garnier","loreal","pantene","head and shoulders","old spice",
    "gillette","colgate","crest","oral-b","band-aid","neosporin","tylenol",
    "advil","aleve","nyquil","mucinex","pepto","tums","preparation h",
    "claritin","zyrtec","benadryl","robitussin","listerine","scope",
    "m&m","skittles","oreo","doritos","lay's","lays","pringles","cheetos",
    "fritos","ruffles","tostitos","wheat thins","ritz","triscuit",
    "cheerios","froot loops","lucky charms","captain crunch","frosted flakes",
    "honey bunches","wheaties","total cereal","special k","mini-wheats",
    "quaker oats","nature valley","clif bar","kind bar","rxbar","larabar",
    "red bull","monster energy","gatorade","powerade","sprite","mountain dew",
    "dr pepper","snapple","lipton","arizona tea","vitaminwater","celsius",
    "coca-cola","pepsi","diet coke","diet pepsi","coke zero","pepsi zero",
    "starbucks","dunkin","mcdonald","burger king","wendy","chick-fil-a",
    "taco bell","chipotle","subway","kfc","popeyes","panda express",
    "sweetgreen","panera","olive garden","applebee","chili's","cheesecake factory",
    "dutch bros","jamba juice","smoothie king","pressed juicery",
    "crumbl","nothing bundt","insomnia cookie",
    "starbucks bottled","naked juice","odwalla","tropicana","minute maid",
    "lululemon","nike","adidas","under armour","gap","old navy","zara","h&m",
    "patagonia","north face","columbia","timberland","ugg","crocs","vans",
    "converse","new balance","asics","skechers","birkenstock",
    "ikea","crate and barrel","pottery barn","west elm","target","walmart",
    "amazon basics","kirkland","costco",
  ];
  if (knownBrands.some(b => name.includes(b))) return false;

  // Skip if the query is very short (1-2 words, likely generic)
  const wordCount = name.trim().split(/\s+/).length;
  if (wordCount === 1 && name.length < 8) return false;

  // Search for specific branded products, food items, personal care, and ambiguous queries
  return true;
}

async function searchProductDetails(productName) {
  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      temperature: 0,
      tools: [{
        type: "web_search_20250305",
        name: "web_search",
      }],
      system: "You are a product research assistant. Search for the exact materials, ingredients, and composition of the product. Return only a plain text summary of what the product is made of — no JSON, no markdown.",
      messages: [{
        role: "user",
        content: `Search for: "${productName}" materials composition ingredients what is it made of. Focus on: main material, any plastic components, coating or finish, packaging material. Return a concise 3-5 sentence factual summary of what this product is physically made of.`
      }]
    })
  });

  if (!res.ok) return null;
  const data = await res.json();
  // Extract text from response (may include tool_use blocks)
  const text = data.content
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("").trim();
  return text.length > 20 ? text : null;
}

// ── CLAUDE API CALL ───────────────────────────────────────────
// Robust JSON fixer — handles apostrophes, smart quotes, trailing commas
function fixJson(raw) {
  let s = raw;
  // 1. Smart quotes → straight quotes
  s = s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
  // 2. Trailing commas before } or ]
  s = s.replace(/,(\s*[}\]])/g, '$1');
  // 3. Walk char by char to fix unescaped problem chars inside JSON string values
  let result = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escaped) { result += c; escaped = false; continue; }
    if (c === '\\') { result += c; escaped = true; continue; }
    if (c === '"') { inString = !inString; result += c; continue; }
    if (inString) {
      if (c === "'")  { result += '\\u0027'; continue; }
      if (c === '\n') { result += '\\n';     continue; }
      if (c === '\r') { result += '\\r';     continue; }
      if (c === '\t') { result += '\\t';     continue; }
    }
    result += c;
  }
  return result;
}

// Extract the outermost complete JSON object from a string
// Handles cases where the AI adds text before or after the JSON
function extractJson(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escaped) { escaped = false; continue; }
    if (c === '\\' && inString) { escaped = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (!inString) {
      if (c === '{') depth++;
      if (c === '}') { depth--; if (depth === 0) return text.slice(start, i + 1); }
    }
  }
  return null;
}

async function callClaude(system, userPrompt, maxTokens=800, retries=3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const res = await fetch(ANTHROPIC_API, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: maxTokens,
          temperature: 0,   // deterministic — same product always same score
          system,
          messages: [{ role: "user", content: userPrompt }]
        })
      });
      clearTimeout(timeout);
      // Retry on 429 (rate limit) and 529 (overloaded) with backoff
      if ((res.status === 429 || res.status === 529) && attempt < retries) {
        const wait = (attempt + 1) * 3000;
        console.log(`Anthropic ${res.status}, retrying in ${wait}ms (attempt ${attempt+1}/${retries})`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const text = data.content.map(b => b.text || "").join("").trim();
      const raw  = extractJson(text);
      if (!raw) {
        console.error("No JSON in response at attempt", attempt, "text snippet:", text.slice(0, 200));
        if (attempt < retries) { await new Promise(r => setTimeout(r, 1500)); continue; }
        throw new Error("No JSON in response");
      }
      try { return JSON.parse(fixJson(raw)); }
      catch(e) {
        console.error("JSON parse failed at attempt", attempt, "raw snippet:", raw.slice(0, 300));
        if (attempt < retries) { await new Promise(r => setTimeout(r, 1000)); continue; }
        throw new Error(`JSON parse error: ${e.message}`);
      }
    } catch(err) {
      clearTimeout(timeout);
      if (err.name === "AbortError") {
        if (attempt < retries) { console.log(`Timeout, retrying (attempt ${attempt+1})`); continue; }
        throw new Error("Request timed out after 25s");
      }
      throw err;
    }
  }
}

// ── PASS 1: DEEP ANALYSIS ─────────────────────────────────────
// Vision pass — identifies product from image AND scores it in one call
async function callClaudeVision(imageBase64, mediaType, retries=3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(ANTHROPIC_API, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
        },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2400,
      temperature: 0,
      system: `You are a senior research scientist specializing in polymer chemistry, toxicology, and consumer product safety. You will be shown a photo of a product label, packaging, clothing tag, or product itself. Read any visible text, brand names, or product names to identify the product, then score it across 5 dimensions. Always respond with raw JSON only — no markdown, no preamble. CRITICAL: Never use apostrophes or single quotes inside JSON string values. Use plain text without contractions.

SCORING RULES:
- PP/PVC in food-contact products (cookware, food storage containers, food packaging, baby bottles, food wraps, reusable water bottles used for hot liquids): materials score 8-9 (NEJM 2024). EXPLICIT EXCEPTIONS — the food-contact rule does NOT apply to: diapers, clothing, baby toys, plastic toys, teething toys, personal care products, or any product where plastic is skin/mouth contact but not used to store/heat food. Score those using their own category calibration. A PP baby teether = materials 5-6 (mouthing concern but not food-contact heating). A polypropylene storage container for hot food = materials 8-9.
- PTFE/PFAS non-stick: materials score 8-9
- Natural materials (wood, glass, stainless, ceramic, organic cotton): materials score 1-2
- ORGANIC KIDS CLOTHING BRANDS (Little Rad Things, Pact Kids, Hanna Andersson, Burt\'s Bees Baby): materials 1-2, final score 1-3
- Single-use disposables: sustainability score 8-9
- Synthetic textiles (polyester, nylon, spandex): materials 5-7, usage 5-7
- Ultra-processed food with synthetic dyes (Red 40, Yellow 5/6, Blue 1, titanium dioxide): materials 7-8, usage 6-7, final 6-7
- Chemical sunscreen (oxybenzone, octinoxate): materials 6-7, usage 6-7
- "Reef safe" / "reef friendly" sunscreen claims are UNREGULATED MARKETING — always check actual UV filter ingredients. If oxybenzone or octinoxate is visible, apply the 6-7 floor regardless of reef-safe label.
- Synthetic fragrance in personal care: materials 5-6
- Dyed gummy vitamins or chewable supplements (Red 40, Yellow 5/6): materials minimum 6-7, usage minimum 6. NEVER score a dyed gummy supplement below 5.
- Conventional dryer sheets (Bounce, Downy): materials 6, usage 6 (synthetic fragrance VOCs + quaternary ammonium residue = daily skin contact). NEVER score below 5.

VARIANT HANDLING (image path): When you see a brand name without a clear variant on the label, score the most common/standard version and note in product_name and summary which variant you scored. Never average across variants. If the image shows a specific variant (e.g. "G Zero", "Pampers Pure"), score that exact variant.

ORGANIC LABEL PRECISION (image path): USDA Organic = strong positive, score 1-3. "Made with Organic" = moderate positive, score 2-4. "Contains Organic X" = minor positive, score as conventional. These are legally distinct claims. Never treat partial-organic claims as full USDA Organic certification.

FORMULATION CURRENCY (image path): Score based on ingredients visible in the image or your best current knowledge. If a product is known to have reformulated (e.g. removed BHT, changed preservatives), score the current formulation. If uncertain whether historical ingredient is still present, flag as "unverified in current formulation" at severity "low" — do NOT assert historical ingredients as confirmed current facts.

PRODUCT ANALYSIS RULES — populate product_analysis for ALL categories:
COMPOSITION TIERS: tier1=clean/natural/organic, tier2=conventional/standard, tier3=synthetic-heavy/petroleum-based, tier4=high-concern/banned-or-flagged-substances
FOOD tier labels: whole_food|minimally_processed|processed|ultra_processed
PERSONAL CARE tier labels: clean_formula|conventional|synthetic_heavy|high_concern
CLOTHING tier labels: natural_fiber|conventional|synthetic|chemical_treated
KITCHEN tier labels: plant_based|conventional|synthetic_heavy|industrial_chemical
BABY tier labels: clean_safe|conventional|concern_flagged|high_risk_infants
FOOD HIGH concerns: Red 40, Red 3 (banned 2025), Yellow 5/6, Blue 1/2, Titanium dioxide, BHA/BHT, Sodium nitrate, Trans fats, HFCS
PERSONAL CARE HIGH concerns: Oxybenzone, Parabens, Formaldehyde releasers, Triclosan, Phthalates, PFAS in cosmetics, Coal tar dyes
CLOTHING HIGH concerns: PFAS/DWR coating, Formaldehyde finish, Flame retardants, Carcinogenic azo dyes
KITCHEN HIGH concerns: PTFE/PFAS coating, BPA/BPS, Quaternary ammonium compounds, Chlorine bleach, Synthetic fragrance VOCs, PVC, 1,4-dioxane
BABY HIGH concerns: Any synthetic fragrance, Talc, Phenoxyethanol, Parabens, Phthalates in products
NUTRITION: For food_beverage only — read the nutrition facts label in the photo if visible, or use known product data. Return per-serving values EXACTLY as listed on the label — use the manufacturer's defined serving size, NOT the whole package total. Populate nutrition with serving_size, calories, protein_g, carbs_g, sugar_g, fat_g, fiber_g, sodium_mg. Set any unknown fields to null. Set nutrition to null for non-food products.`,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          { type: "text", text: `Look at this photo. Read the brand name, product name, and visible text to identify the product. Score it across 5 dimensions AND populate product_analysis. Return ONLY this JSON:
{
  "product_name": "brand + product name as shown on label",
  "category": "food|beverage|clothing|personal_care|home|baby|supplement|toy|accessory|restaurant|other",
  "identified_plastics": ["plastic type 1"],
  "harmful_chemicals": [],
  "natural_materials": ["organic cotton"],
  "materials": { "score": 5, "label": "material analysis", "concerns": ["concern"] },
  "usage_exposure": { "score": 5, "label": "usage risk", "frequency": "daily|weekly|occasional|rare", "type": "ingestion|skin_contact|inhalation|mixed", "intensity": "leave-on|rinse-off|single-contact", "vulnerable": false, "concerns": [] },
  "packaging": { "score": 4, "label": "packaging assessment", "primary": "cardboard|glass|plastic|mixed", "refillable": false, "end_of_life": "recyclable|compostable|landfill|unknown", "concerns": [] },
  "sustainability": { "score": 4, "label": "sustainability story", "reusable": false, "replaces_single_use": false, "replaces_count": null, "circularity": "unknown", "concerns": [] },
  "manufacturing": { "score": 5, "label": "manufacturing estimated", "tier": "good|neutral|bad", "confidence": "low", "concerns": [] },
  "product_analysis": {
    "composition_tier": 2,
    "tier_label": "conventional",
    "tier_description": "max 8 words",
    "concerns": [
      {"substance": "substance name", "type": "dye|preservative|sweetener|uv_filter|fragrance|surfactant|coating|fiber|chemical|plasticizer|flame_retardant|additive", "severity": "high|medium|low", "reason": "max 12 words"}
    ],
    "positives": [{"attribute": "positive attribute", "reason": "max 8 words"}],
    "nutrition": null,
    "nutrition_verified": false,
    "confidence": "high|medium|low",
    "confidence_note": "max 10 words"
  },
  "summary": "max 30 words",
  "raw_concerns": ["concern 1"],
  "confidence": "high|medium|low",
  "confidence_reason": "why",
  "scan_next": ["related product 1"],
  "ai_alternatives": [{"name": "safer alternative", "reason": "why safer", "material": "material", "estimated_score": 2}]
}
NOTE: For food_beverage or restaurant, populate nutrition with values you know or can reasonably confirm. For restaurant items from major chains, populate what you know and set nutrition_verified: false. Only set nutrition_verified: true if you are certain of exact values. Set individual fields to null if uncertain — partial data is useful. Only set the entire nutrition object to null if you have no useful data at all.
SUBSTANCE NAMING RULES: Always name the SPECIFIC chemical in concerns, never a generic category. Write "BHT" not "preservatives". Write "Red 40" not "artificial colors". Write "PTFE coating" not "non-stick chemicals". Write "PFOA" not "PFAS" if you know the specific compound. Write "oxybenzone" not "chemical sunscreen". Never flag "binding agents", "emulsifiers", "natural flavors", or "concentration levels" as concerns — these are not harmful substances. If packaging speculation exists, write it with severity "low" and hedged language. If you know a product's specific ingredients (Altoids has BHT, Chick-fil-A uses TBHQ in frying oil), name them explicitly.` }
        ]
      }]
    })
  });
      clearTimeout(timeout);
      if ((res.status === 429 || res.status === 529) && attempt < retries) {
        const wait = (attempt + 1) * 3000;
        console.log(`Vision ${res.status}, retrying in ${wait}ms (attempt ${attempt+1}/${retries})`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const text = data.content.map(b => b.text || "").join("").trim();
      const raw  = extractJson(text);
      if (!raw) throw new Error("No JSON in vision response");
      try { return JSON.parse(fixJson(raw)); }
      catch(e) {
        if (attempt < retries) { await new Promise(r => setTimeout(r, 1000)); continue; }
        throw new Error(`Vision JSON parse error: ${e.message}`);
      }
    } catch(err) {
      clearTimeout(timeout);
      if (err.name === "AbortError") {
        if (attempt < retries) { console.log(`Vision timeout, retrying (attempt ${attempt+1})`); continue; }
        throw new Error("Vision request timed out");
      }
      throw err;
    }
  }
}

async function pass1(productName, materialContext = null, categoryHint = null) {
  const contextSection = materialContext
    ? `\nREAL PRODUCT DATA FROM WEB SEARCH (use this as ground truth for materials):\n${materialContext}\n`
    : "";
  const categorySection = categoryHint
    ? `\nCATEGORY HINT: This product has been pre-classified as "${categoryHint}". Use this as your category. Populate the product_analysis field fully using the category-specific concern types.${categoryHint === "restaurant" ? " This is a restaurant menu item — you MUST populate the product_analysis field including nutrition using the chain's official published nutrition data. Set nutrition_verified: true only if you are confident in the exact values, false if estimating." : ""}\n`
    : "";

  return callClaude(
    `You are a senior research scientist specializing in polymer chemistry, toxicology, consumer product safety, and environmental impact. Your scores are grounded in peer-reviewed science. Always respond with raw JSON only — no markdown, no preamble. CRITICAL: Never use apostrophes or single quotes inside JSON string values. Use plain text without contractions.

KEY RESEARCH FINDINGS:
MICROPLASTICS: Marfella et al. (2024) NEJM: PP found in 58% of carotid plaques — PP/PVC in food-contact products score 8-9 (cookware, food containers, baby bottles). IMPORTANT: this rule applies to FOOD contact only — NOT to diapers, clothing, or personal care products which are skin contact. Diapers score via their own calibration scale. Yan et al. (2024) Nature Medicine: microplastics accumulate in human brain — daily ingestion/inhalation +2 penalty. Landrigan et al. (2025) Lancet Planetary Health: cardiovascular, metabolic and cancer risk confirmed. Amato-Lourenco et al. (2021) THORAX: microplastics found in all regions of human lung tissue. Hernandez (2019): nylon/PET tea bags release billions of particles per cup. Li (2020): heated PP baby bottles release millions of particles per litre.
PFAS: FDA (2024): PTFE/PFAS non-stick = primary dietary exposure — score 8-9, known endocrine disruptors. Sunderland et al. (2019): PFAS linked to thyroid disruption, reduced fertility, elevated cholesterol. Steenland et al. (2018): PFOA linked to kidney and testicular cancer. EWG (2023): PFAS detected in water serving 200M+ Americans.
ENDOCRINE DISRUPTORS: Braun et al. (2021) Endocrine Society: BPA, phthalates, PFAS all confirmed EDCs. Swan et al. (2021): phthalate and BPA exposure linked to reduced fertility. Trasande et al. (2018): EDC exposure costs USD 163 billion annually in health burden. Rochester (2013): BPA endocrine disruption confirmed at low doses.
FOOD: Monteiro et al. (2025) Lancet: ultra-processed foods linked to cardiovascular risk and cognitive decline — score 6-8. Srour et al. (2024) BMJ: 30% higher all-cause mortality with high UPF intake. Lane et al. (2024) Neurology: UPF linked to cognitive decline and stroke. Whole natural foods score 1-3.
DYES: FDA (2025): Red 3 banned, all petroleum dyes being phased out. Red 40, Yellow 5/6, Blue 1/2 = score 6-8. EFSA (2021): titanium dioxide banned in EU food — IARC Group 2B. McCann et al. (2007) Lancet: synthetic dyes linked to hyperactivity in children.
PRESERVATIVES: NTP (2023): BHA reasonably anticipated to be a human carcinogen. IARC: BHA = Group 2B. Bouvard et al. (2015) Lancet Oncology: processed meat (sodium nitrate) = Group 1 carcinogen.
SUNSCREEN: Matta et al. (2019) JAMA: oxybenzone detected in bloodstream after single application. FDA (2020): oxybenzone, avobenzone flagged for further safety study. Score chemical UV filters 7-8.
FRAGRANCE: Steinemann (2017): 156 VOCs identified in 25 scented products. Dodson et al. (2012): synthetic fragrance phthalates linked to asthma and endocrine disruption.
TEXTILES: Browne et al. (2011): synthetic textiles identified as major ocean microfiber source. Henry et al. (2019): 700K+ fibers shed per wash from single fleece.
PACKAGING-ONLY PLASTIC: If a product is genuinely plastic-free but has incidental packaging (film pouch, wrapper, cap) that is discarded during use, the packaging score should be 2-4. Do NOT let discarded packaging dominate the materials score. Example: Blueland tablet in film pouch = materials score 1, packaging score 3.`,

    `Analyze "${productName}" across 5 dimensions: Materials, Usage and Exposure, Packaging, Sustainability, and Manufacturing.
${contextSection}${categorySection}
If this is a barcode, identify the most likely consumer product and analyze that.
If real product data is provided above, use it as ground truth. Do not assume plastic if confirmed natural.

SCORING RULES BY DIMENSION:

MATERIALS (what the product is physically made of):
- PP/PVC in food contact: 8-9 (food storage, cookware, food packaging, baby bottles — NOT diapers or clothing). PTFE/PFAS coatings: 8-9. Nylon/PET tea bags: 7-8.
- Natural materials (wood, glass, stainless, ceramic, organic cotton, stone): 1-2.
- ORGANIC AND NATURAL FIBER CLOTHING: confirmed GOTS-certified organic cotton, organic linen, organic wool, bamboo, hemp = materials 1-2. Do not hedge upward due to brand uncertainty.
- KNOWN ORGANIC KIDS CLOTHING BRANDS — these are documented to use organic cotton and must score 1-2 on materials, 2-3 on sustainability: Little Rad Things, Pact Kids, Hanna Andersson, Burt's Bees Baby, Mini Mioche, Primary, Colored Organics, Art and Eden, Patagonia Kids.
- AMBIGUOUS CLOTHING (brand unknown, material unconfirmed): score 3-5 with low confidence. Do not assume synthetic.
- Coatings and treatments count even if the base material is safe.
- PACKAGING-ONLY: if plastic is only in discarded packaging, materials score stays 1-3.
- PVA (polyvinyl alcohol) pod film in dishwasher/laundry pods: score 6-7 — PVA dissolves but enters waterways as microplastic pollution. Cascade, Tide, Finish pods all use PVA film.
- Synthetic fragrances in cleaning products: score +1 — endocrine disrupting compounds, poorly regulated.
- NATURAL FRAGRANCE vs SYNTHETIC: Salt & Stone, Tatcha, Herbivore, and documented clean beauty brands explicitly avoid synthetic fragrance. When these brands list "Fragrance (Parfum)" alongside individually disclosed natural components (limonene, linalool, eugenol, geraniol, citral) this is transparent natural fragrance disclosure — NOT synthetic. Do NOT apply synthetic fragrance penalty. Salt & Stone body care = materials 1-3, final 2-3.
- Optical brighteners in laundry/dishwasher products: score +1 — persistent in environment, potential skin sensitizer.
- Phosphates and surfactants in cleaning products: add to concerns.
- SYNTHETIC TEXTILES: polyester, nylon, spandex/elastane, acrylic shed microfibers with every wash and wear. Daily skin contact with synthetic fabric = score 5-7. A product described as "spandex" or "elastane" that is majority synthetic = score 6-7.
- Natural fiber clothing with minor synthetic content (e.g. 5% elastane waistband): score 3-4.
- Genuinely plastic-free cleaning products (Blueland, Branch Basics, castile soap): materials score 1-2.

USAGE AND EXPOSURE (how using this product affects health):
- Leave-on skin contact (moisturizer, deodorant): higher penalty than rinse-off.
- Direct ingestion (food containers, tea bags, gum): highest penalty.
- Inhalation (sprays, candles, synthetic textiles): significant penalty.
- DISHWASHER PRODUCTS: not zero exposure — chemical residue remains on dishes and enters food. Score usage 4-6 for conventional pods with synthetic chemicals. Genuinely clean formulas (Blueland, Seventh Generation fragrance-free): score 2-3.
- LAUNDRY PRODUCTS: microfibers released into water supply, fragrance residue on clothing = daily skin contact. Score 4-6 for conventional detergents.
- Frequency multiplier: daily +2, weekly +1, occasional 0.
- Child/baby product: apply +1 vulnerable population flag.
- VEHICLES: score 3-5 — interior plastic is not food contact. No daily-use penalty.
- EVs score 1-2 points lower than gas equivalents (Rivian/Tesla/Lucid: 2-3, older EVs: 3-4).
- CHEWING GUM: polyvinyl acetate and polyethylene = direct plastic ingestion. Score 7-8.

DUAL SCORING FORMULA — the server applies these category-specific weights. Score each dimension accurately — the formula is applied server-side, you cannot game it.
FOOD: Ingredients 90% · Packaging 10% — ingredients are the entire story. Organic food in plastic still scores 2 on materials; flag packaging separately.
BEVERAGE: Ingredients 75% · Packaging 25% — the container leaches into every sip. Plastic bottle scores differently than glass.
RESTAURANT: Ingredients 85% · Packaging 10% · Sustainability 5%
SUPPLEMENT: Ingredients 65% · Exposure 25% · Packaging 10%
BEAUTY/PERSONAL CARE: Materials 45% · Exposure 45% · Packaging 5% · Sustainability 5%
TOYS: Materials 50% · Exposure 40% · Packaging 5% · Sustainability 5%
CLOTHING/SHOES: Materials 35% · Exposure 30% · Sustainability 35% · Packaging 0%
ACCESSORIES: Materials 40% · Exposure 25% · Sustainability 35% · Packaging 0%
HOME: Materials 30% · Exposure 45% · Packaging 10% · Sustainability 15%
BABY: Materials 55% · Exposure 40% · Packaging 5% · Sustainability 0%
MANUFACTURING IS NOT SCORED — removed from all formulas. Do not score or return a manufacturing dimension. Supply chain data is too inconsistent to score fairly across products.

PACKAGING (what contains and ships the product):
FOOD CONTACT PACKAGING — penalize heavily, chemicals leach into food:
- Plastic directly touching food (plastic wrap, plastic bottles, canned food with BPA liner, plastic-lined cups): packaging score 7-9.
- Aluminum cans (BPA-free lined): packaging score 4-5.
- Glass, stainless, cardboard touching food: packaging score 1-2.
- Hot liquid in plastic (plastic coffee cups, plastic takeout containers, plastic water bottles with hot liquid): packaging score 7-8 — heat accelerates leaching. This rule ONLY applies to plastic. Glass, stainless, and ceramic with hot liquids score 1-2 — they are inert at all temperatures.
OUTER PACKAGING — does not touch food, penalize less:
- Recycled cardboard, paper, compostable outer packaging: score 1-2 even for food products.
- Virgin plastic outer packaging (cereal bags, chip bags): score 5-6.
- Single-use plastic outer bag with no food contact: score 4-5.
- Refillable or concentrated formats: score 1-3.
FOOD NUTRITION POSITIVE SIGNAL — for food_beverage and restaurant:
USDA Organic + no confirmed dangerous substances: materials 1-2, final 1-3. This ceiling is enforced server-side.
Non-GMO Project Verified + no synthetic dyes + no synthetic preservatives: materials 2-4, final max 4. Enforced server-side.
High fiber (8g+/serving) from whole food sources: lower materials by 1 point.
High protein (10g+/serving) from whole food sources: lower materials by 0.5 points (round down).
Organic apple in plastic bag: materials=1 (whole food, organic), packaging=6 → final ~2. Always note packaging concern.

NOVA PROCESSING MODIFIER — apply before scoring, not after:
NOVA 1 — Unprocessed or minimally processed: fruits, vegetables, plain meat, eggs, plain oats, plain yogurt. No structural penalty.
NOVA 2 — Processed culinary ingredients: oils, vinegars, flours, sugar alone. No penalty on their own.
NOVA 3 — Processed foods: canned beans, cheese, cured meats without additives, fermented foods, bread with simple ingredients. Materials baseline 2-4.
NOVA 4 — Ultra-processed formulations: industrial ingredients not found in home kitchens (emulsifiers, flavor enhancers, hydrolyzed protein, modified starch, synthetic vitamins added back, HFCS, 5+ additives). Materials baseline 5+ regardless of individual ingredient cleanliness. The formulation itself is the concern.
NOVA 4 examples: breakfast cereals with 10+ ingredients and synthetic dyes, packaged cookies, flavored chips, plant-based meat (Beyond Meat, Impossible Burger), most fast food, flavored protein bars with 20+ ingredients.

SUGAR PENALTY — added sugar matters independently of other concerns:
- 0-5g added sugar per serving: no penalty
- 6-10g added sugar per serving: materials +1 (moderate concern, daily consumption adds up)
- >10g added sugar per serving: materials +2 (high concern — WHO recommends <25g/day total)
- >20g added sugar per serving: materials +3 (exceeds half the daily limit in one serving)
Apply sugar penalty on top of NOVA and substance assessments. A NOVA 3 product with 15g sugar = materials 2-3 base + 2 sugar = materials 4-5.

TOTAL SUGAR RULE FOR BEVERAGES (natural OR added): A beverage with >30g total sugar per serving — even 100% natural fruit sugar — must not score below 3. A beverage with >50g total sugar per serving must not score below 4. Naked Juice, Odwalla, Bolthouse Farms smoothies, and large fruit juices frequently contain 50-70g total sugar — more than a can of Coke. "No added sugar" and "100% juice" are not clean signals when the sugar load is this high. Flag "extreme natural sugar content — [Xg per serving, equivalent to [N] teaspoons of sugar]" as a MEDIUM concern and raise materials floor accordingly.

FOOD TIER SCORE IMPACT — synthesizing NOVA, sugar, and substance concerns:
Score 1-2 (Safe): NOVA 1-2, organic certified, no confirmed IARC substances, <5g added sugar. Organic produce, organic plain oats, plain organic yogurt, wild salmon.
Score 3 (Good): NOVA 2-3, mostly clean, conventional farming but Non-GMO or low pesticide load, <6g added sugar, no synthetic dyes/preservatives. Kashi Organic, Poppi soda, Larabar, plain Greek yogurt (conventional), canned organic beans.
Score 4 (Good): NOVA 3, conventional ingredients, some processing but whole food base, no confirmed IARC 2A as primary ingredient. Kashi conventional (non-organic), Cliff Bar, Kind bar, 365 WFM snacks, conventional eggs, plain whole milk.
Score 5 (Caution): NOVA 3-4 boundary, OR confirmed IARC 2A substance as minor ingredient, OR NOVA 3 with >10g sugar. Quaker oats (conventional primary oats + confirmed glyphosate), Honest Kids juice pouches (high sugar + processing), plain hot dogs (nitrites confirmed).
Score 6 (Caution): NOVA 4 product with significant concerns OR confirmed IARC 2A substance as primary ingredient + other concerns. Honey Nut Cheerios (primary oat with confirmed glyphosate + 12g sugar + NOVA 4), conventional flavored chips (MSG, artificial flavors, NOVA 4).
Score 7 (Change): NOVA 4 + confirmed IARC Group 1 substance OR multiple IARC 2A concerns OR confirmed petroleum dyes. Hot dogs/processed meat with sodium nitrite (IARC Group 1). Candy/cereal with multiple petroleum dyes.
Score 8-9 (Avoid): Multiple IARC Group 1 substances + ultra-processed OR PFAS food contamination confirmed. Chewing tobacco in food, heavily contaminated products.
Score 10: Reserved for confirmed contamination above regulatory safety limits.

IARC CARCINOGEN RULE — REVISED (replaces old "all IARC 2A = materials minimum 7"):
The IARC classification tells you the STRENGTH OF EVIDENCE, not the dose or exposure level. Apply contextually:
- IARC Group 1 as primary ingredient at high concentration (nitrites in hot dogs, alcohol in beverages): materials 7-8 minimum
- IARC Group 2A as PRIMARY ingredient with EWG-confirmed residues above child threshold (conventional oats in Cheerios): materials 6-7
- IARC Group 2A as MINOR ingredient in multi-grain or whole food product (oats as one of 7 grains in Kashi): materials +1 only, flag as MEDIUM concern
- IARC Group 2B confirmed in product (BHA, titanium dioxide, aspartame): materials +1-2, flag as concern
- SPECULATIVE or trace amounts with hedged language: no floor, flag at LOW severity only
DO NOT apply "minimum 7" to any product simply because it contains an IARC 2A substance. Dose and context determine severity.

MISSING CATEGORY CALIBRATION:

PLANT-BASED MEAT (Beyond Meat, Impossible Burger, etc.):
Despite "plant-based" marketing these are NOVA 4 ultra-processed formulations. Ingredients: methylcellulose, pea protein isolate, modified starch, yeast extract, 20+ additives. Very high sodium (>400mg/serving). No confirmed IARC substances but high processing load.
- Beyond Meat / Impossible Burger: materials=5 (NOVA 4, ultra-high sodium, processed plant protein isolates), usage=4 → final ~5. "Plant-based" does not mean clean.
- Whole food plant proteins (edamame, tofu, tempeh, lentils): materials=1-2 → final 1-2.

FERMENTED FOODS:
- Plain organic yogurt / kefir / cottage cheese: materials=1 → final 1-2. Live cultures, minimal processing, NOVA 1.
- Flavored/sweetened yogurt (Dannon Fruit on the Bottom, etc.): materials=3-4 (added sugar, natural flavors, carrageenan in some) → final 3-4.
- Raw kombucha (plain, no added sugar): materials=2 → final 2-3.
- Flavored kombucha with added sugar (GT's flavored): materials=3-4.
- Kimchi / sauerkraut (traditional fermented): materials=1 → final 1-2.

CONDIMENTS AND SAUCES:
- Organic hot sauce (just peppers, vinegar, salt): materials=1 → final 1-2.
- Conventional ketchup (Heinz) with HFCS: materials=4 (HFCS, natural flavors) → final ~4.
- Organic ketchup (no HFCS): materials=2 → final ~2.
- Ranch dressing (conventional — Hidden Valley): materials=5 (soybean oil, modified starch, artificial flavors, calcium disodium EDTA) → final ~5.
- Rao's Marinara (clean ingredients): materials=2 → final ~2.
- Conventional BBQ sauce with HFCS: materials=4-5 → final ~4-5.

FROZEN MEALS:
- Amy's Organic frozen meals (USDA Organic, simple ingredients): materials=2-3 → final 2-3.
- Lean Cuisine / Healthy Choice (ultra-processed): materials=5-6 (NOVA 4, high sodium, modified starch, natural flavors, preservatives) → final 5-6.
- Trader Joe's whole-food frozen meals (simple ingredient list): materials=3-4.

BABY FOOD POUCHES:
- Organic baby food pouch (Happy Baby, Earth's Best Organic): materials=2 (USDA Organic, simple ingredients, some processing for shelf stability) → final 2-3.
- Conventional baby food pouch (Gerber conventional): materials=4 (conventional produce, some additives) → final 3-4.
- Organic baby puffs/snacks: materials=2-3 → final 2-3.

FUNCTIONAL BEVERAGES AND ELECTROLYTES:
- LMNT electrolyte (sodium 1000mg + potassium 200mg + magnesium 60mg + natural flavors — nothing else): materials=2 → final ~2. Cleanest mainstream electrolyte. No sweeteners, no additives.
- Nuun Sport tablet (stevia, sorbitol, caffeine in some, B vitamins): materials=3 → final ~3.
- Liquid IV (sucralose, natural flavors, B-vitamin megadose stack, citric acid): materials=4 (sucralose floor fires) → final ~4. NOT clean. "Clean" marketing does not override sucralose.
- Pedialyte original (sucralose, acesulfame potassium — two artificial sweeteners, artificial colors in some flavors): materials=5 (sucralose + acesulfame-K) → final ~5.
- Gatorade / Powerade conventional (artificial dyes, HFCS or sucrose): materials=5-6 (petroleum dyes) → final ~5-6.
- BodyArmor (coconut water base, natural flavors, stevia): materials=3 → final ~3. Cleaner than Gatorade but still processed.
- Gatorade / Powerade (conventional with dyes): materials=5-6 (artificial dyes, sucrose/HFCS) → final 5-6.
- Athletic Greens / AG1 (complex formulation): materials=3-4 (generally clean but ultra-processed powder).

BEVERAGE CALIBRATION:
SODAS:
- Coca-Cola / Pepsi Classic (can): materials=5 (caramel color IV — 4-MEI IARC 2B, 39g HFCS, phosphoric acid) → final ~5
- Diet Coke / Diet Pepsi (can): materials=5 (aspartame IARC 2B 2023, caramel color IV, artificial flavors) → final ~5. Aluminum can does NOT lower this to 4 — aspartame warrants 5 minimum.
- Mountain Dew / Fanta / Tropical flavors with dyes: materials=7 (Yellow 5, Red 40, petroleum dyes + HFCS) → final ~7. NEVER score below 6.
- Sprite / 7UP (no artificial dyes): materials=4 (HFCS, citric acid, natural flavors — no petroleum dyes) → final ~4
- Zevia (stevia, no artificial dyes or sweeteners beyond stevia): materials=2 → final ~2

ENERGY DRINKS:
- Red Bull regular: materials=7 (27g sugar, taurine, B-vitamin megadoses at pharmaceutical doses, artificial flavors, 80mg caffeine — NOVA 4 stimulant formulation) → final ~6. NEVER score below 5.
- Monster Energy (colored flavors): materials=7 (27g sugar + artificial dyes + 160mg caffeine + artificial flavors) → final ~6-7.
- Celsius (natural caffeine, no HFCS, no artificial colors): materials=4 (sucralose in some, 200mg caffeine) → final ~4.
- Bang Energy / Reign (300mg caffeine + sucralose + artificial flavors): materials=6 → final ~6.

COFFEE DRINKS:
- Plain black coffee / espresso: materials=1 → final ~1
- Starbucks in-store latte (milk + espresso, no syrups): materials=3 → final ~3
- Starbucks Pink Drink / Refreshers: materials=4 (acesulfame potassium, artificial flavors, concentrated juice) → final ~4
- Starbucks bottled Frappuccino: materials=5 (high sugar, carrageenan, natural flavors) → final ~5
- Dutch Bros flavored drinks (Blue Rebel base = energy drink + syrups + artificial flavors): materials=6 → final ~5-6. NEVER score Dutch Bros flavored drinks below 5. Plain Americano = 2-3.

JUICE:
- Pressed Juicery / cold-pressed raw juice (minimal ingredients, no additives): materials=2 → final ~2-3
- Tropicana / Minute Maid / Simply Orange (pasteurized, some additives): materials=3 → final ~3
- Capri Sun / Sunny D (HFCS, some artificial flavors): materials=5 → final ~5
- Sunny D with artificial dyes: materials=6-7 → final ~6

SMOOTHIE CHAINS:
- Pressed Juicery smoothie (raw, no added sugar): materials=2 → final ~2-3. Cleanest smoothie chain.
- Jamba Juice classic fruit smoothie (fruit + sherbet, up to 80g total sugar in large): materials=4 → final ~4-5
- Jamba Juice "Peanut Butter Moo'd" / protein power smoothies (95g+ sugar, whey, ice cream): materials=5 → final ~5. NEVER score 2.
- Smoothie King Lean1 / diet blends (sucralose, acesulfame-K, artificial flavors): materials=5 → final ~5. "Healthy" marketing does not mean clean.
- Smoothie King Hulk series (ice cream, 1000+ calories): materials=6 → final ~6.

RESTAURANT CHAIN CALIBRATION — additional chains:
- Sweetgreen bowl (fresh whole ingredients, proprietary dressings): final score ~3-4. Simple grain bowls = 3. Loaded with creamy dressings + croutons = 4.
- CAVA bowl (Mediterranean base — protein, vegetables, hummus): final score ~3-5. Protein bowls = 3-4. Loaded with processed sauces = 4-5.
- Panera Bread You Pick Two (soup + sandwich): final score ~4-5. High sodium soups (1000-1500mg), processed deli meat. NOT as clean as marketing suggests.
- Panera mac & cheese / baked goods: final score ~5-6 (ultra-processed, refined flour, high sodium).
- Dave's Hot Chicken tenders / sandwich (fried in refined oil, TBHQ): final score ~6. Same tier as Chick-fil-A fried items.
- Dutch Bros flavored drinks: final score ~5-6. Blue Rebel base is an energy drink. Plain cold brew = 2-3.
- Crumbl Cookie: final score ~6. Refined flour, 40-80g sugar per cookie, artificial dyes in frosting on many flavors. NEVER score below 5.
- Nothing Bundt Cakes: final score ~5-6. High sugar cream cheese frosting, refined flour, artificial dyes in some.
- Insomnia Cookies: final score ~5-6. Refined flour, high sugar, artificial colors in some varieties.
- Starbucks Unicorn / seasonal novelty drinks with dyes: final score ~7. Artificial dyes (Blue 1, Red 40 confirmed in several drinks) + high sugar.

SODIUM RULE FOR RESTAURANT ITEMS: When sodium exceeds 2,000mg per serving, flag as HIGH concern and add +1 to materials. Items exceeding 3,000mg sodium (Cheesecake Factory pasta, Applebee's riblets) = materials minimum 7.

DEODORANT CALIBRATION (personal_care category):
- Conventional deodorant/antiperspirant (Secret, Dove, Old Spice): materials=5 — aluminum compounds (antiperspirant), synthetic fragrance (phthalates), parabens in some, propylene glycol. Usage=6 (daily underarm application, lymph node proximity). Final ~5-6.
- Clinical-strength antiperspirant: materials=6 — higher aluminum concentration (20%+ aluminum chloride), synthetic fragrance. Final ~6.
- Natural deodorant without aluminum (Native, Schmidt's, Humble): materials=3 — no aluminum, natural fragrance or fragrance-free, baking soda or mineral-based. Usage=4. Final ~3.
- Native sensitive (no baking soda, minimal ingredients): materials=2 → final ~2-3.

PROTEIN POWDER CALIBRATION:
- Clean third-party tested whey/plant protein (Momentous, Garden of Life, Thorne): materials=2 (NSF Certified for Sport or Informed Sport tested, no artificial dyes, no artificial sweeteners). Final ~2-3.
- Conventional whey protein (Optimum Nutrition Gold Standard, Myprotein): materials=3-4 — sucralose in most flavors, artificial flavors, titanium dioxide in some. Consumer Reports 2018 found lead, arsenic, cadmium above threshold in several brands tested. Flag: third-party heavy metal testing not confirmed. Final ~3-4.
- Mass gainer / proprietary blend with stimulants: materials=5-6 — DMAA risk in some, proprietary blends, high artificial sweetener load. Flag heavy metals concern for any powder without third-party certification.
Rule: ANY protein powder without NSF Certified for Sport, Informed Sport, or USP Verified certification should carry a MEDIUM heavy metals concern regardless of other ingredients.

ALCOHOL:
Ethanol is IARC Group 1 carcinogen — no safe level per WHO. This applies regardless of wine/beer/spirits perception.
- Any alcoholic beverage: materials=7 (IARC Group 1 ethanol — known carcinogen) minimum. Score reflects health risk of the product, not a judgment on responsible adult consumption.
- Wine / beer: materials=7, usage=6 → final ~7.
- Spirits (higher ethanol concentration): materials=8, usage=7 → final ~7-8.
Always flag: "Ethanol — IARC Group 1 known carcinogen (WHO 2018 — no safe level for cancer risk)."

SUSTAINABILITY (product lifecycle, planet impact, and ethical sourcing):
- Multi-use durable products replacing single-use: score 1-3.
- Single-use by design (paper towels, disposable cups, plastic wrap): score 7-9.
- Circular design (refillable, repairable, compostable): score 1-3.
- Cleaning products that release synthetic chemicals or PVA into waterways: sustainability score 5-7 regardless of concentrated format.
- Blueland-style products (no PVA, no synthetic fragrance, genuinely clean): sustainability score 1-3.
- ETHICAL SOURCING — these certifications meaningfully lower sustainability score by 1-2 points:
  Fair Trade certified: workers paid living wage, safe conditions → score 1-2 lower.
  B-Corp certified: legal accountability to people and planet → score 1-2 lower.
  GOTS certified (clothing): organic fiber + ethical labor throughout supply chain → score 1-2 lower.
  Rainforest Alliance, 1% for Planet, Carbon Neutral certified → score 1 lower.
- No certifications + opaque supply chain + fast fashion model: sustainability score 6-8.
- USDA Organic food: sustainability score 1-3 (no synthetic pesticides, soil health).
- Conventional farming (Dirty Dozen): sustainability score 5-6 (pesticide runoff, soil impact).

SCORE DISTRIBUTION RULES — the full 1-10 scale must be used deliberately:
- 1-2: No significant chemical or ingredient concerns. Organic certified, natural materials, no synthetic chemicals. Safest option in its category from an ingredient safety standpoint. NOTE: a score of 1-2 reflects chemical cleanliness, not nutritional quality. Organic butter, raw honey, and coconut oil can score 1-2. That means no pesticides, no synthetic additives — it does not mean unlimited consumption is recommended.
- 3-4: Mostly clean. Some conventional materials, minor processing concerns, or low pesticide load. No confirmed harmful substances.
- 5-6: Moderate ingredient concern. Conventional synthetic materials, some flagged ingredients, meaningful exposure risk. Do NOT use 6 as a default for anything uncertain.
- 7-8: High ingredient concern. Multiple flagged chemicals, confirmed IARC carcinogens, high daily exposure, FDA/EWG flagged ingredients.
- 9-10: Severe. PFAS coatings, banned substances, direct ingestion of multiple confirmed carcinogens.

AVOID SCORE CLUSTERING AT 6. If you find yourself scoring many different products at 6, that is a signal you are not differentiating enough. A conventional cotton t-shirt (3-4) should score very differently from Tide pods (6) which should score very differently from a PTFE pan (7-8). When uncertain, default DOWN not up — err toward lower scores for products with no confirmed harmful ingredients.

- ARTIFICIAL DYES in food (Red 40, Yellow 5, Yellow 6, Blue 1, Blue 2): score materials 7-8. FDA banned Red 3 (2025) and is phasing out all petroleum-based dyes due to carcinogenicity and hyperactivity links. M&Ms, Skittles, Gummy Bears, Doritos, Froot Loops all contain multiple banned/flagged dyes — materials score MUST be 7-8, never lower.
- ULTRA-PROCESSED FOODS with dyes + preservatives + artificial flavors: materials 7-9, usage 6-8 (daily consumption). Candy, chips, sodas, instant noodles = score 6-8. Do NOT score ultra-processed candy below 6 under any circumstances.
- Whole natural foods (fresh fruit, vegetables, unprocessed meat, plain water): materials 1, usage 1.

ANTI-GREENWASHING — CRITICAL RULES. Marketing language does NOT equal safety. Apply these regardless of how a product is branded or sold:

VARIANT HANDLING — products with multiple meaningfully different versions:
When a user scans a brand name without specifying variant, score the most common/standard version and explicitly note the variant issue in your summary. Never average across variants. Examples:
- "Gatorade" → score Original (has artificial dyes: materials=5-6). Note: G Zero, G2, Gatorade Fit have different ingredient profiles and scores.
- "Pampers" → score standard Swaddlers (materials=7). Note: Pampers Pure is meaningfully cleaner (materials=5).
- "Tide" → score Original (materials=7). Note: Tide Free & Gentle is significantly cleaner (materials=3-4).
- "Altoids" → score Original (materials=3). Note: Sugar Free uses artificial sweeteners (materials=4).
When in doubt about which variant, name the variant you're scoring in product_name (e.g. "Gatorade Original" not just "Gatorade") and note in summary that other variants differ.

ORGANIC LABEL PRECISION — three different claims, three different scores:
- "USDA Organic" (certified): Prohibits synthetic pesticides, GMOs, synthetic additives. Strong positive signal. Score 1-3 for clean products.
- "Made with Organic [ingredient]" (partial organic): 70-94% organic ingredients. Remaining ingredients may be conventional. Moderate positive signal. Score 2-4. NOT the same as USDA Organic certified.
- "Contains Organic Ingredients" / "With Organic [X]": less than 70% organic. Minor positive. Score same as conventional product with a slight positive note.
Never treat "Made with Organic" as equivalent to USDA Organic certification. The organic ceiling server rule only fires on confirmed USDA Organic certification — not "made with organic."

INGREDIENT FORMULATION CURRENCY — treat known product facts with caution:
Product formulations change without announcement. If you know a product historically contained a specific ingredient but cannot confirm it from the current query context, do NOT assert it as confirmed. Altoids historically contained BHT but the current formulation does not. Score what the actual current ingredients suggest, not what you recall from training data. When uncertain whether an ingredient is current: flag as "unverified in current formulation" with severity "low" and note it. Never score a substance floor based on recalled historical ingredients that may have been removed.

CLOTHING AND TEXTILES — hidden toxins to always consider:
- Conventional cotton (non-organic): treated with pesticides, often finished with formaldehyde (wrinkle resistance), optical brighteners, or azo dyes. Score materials 4-5 unless certified organic. Do NOT assume plain cotton = safe.
- Azo dyes in fabric: used in virtually all conventionally dyed clothing including brands sold at Target, H&M, Zara, Gap, Old Navy. Azo dyes can release carcinogenic aromatic amines. Flag unless brand explicitly uses non-azo or GOTS-certified dyes. Score +1 on materials.
- PFAS / DWR (Durable Water Repellent) coatings: present on outdoor gear, rain jackets, activewear, swim clothing unless explicitly PFAS-free. Score materials +2 for PFAS-treated items.
- Formaldehyde finishes: wrinkle-resistant, anti-shrink, or easy-care finishes on cotton and linen often use formaldehyde-based resins. Flag for any clothing marketed as wrinkle-free, easy-care, or non-iron unless certified formaldehyde-free.
- Flame retardants in children's sleepwear: required by law unless tight-fitting or labeled "not flame resistant." Older or unbranded kids sleepwear may contain PBDE or organophosphate flame retardants. Score +2 for baby/kids sleepwear without explicit FR-free certification.
- Store brand clothing (Target's All in Motion, Universal Thread, Wild Fable, Old Navy, Gap): no ingredient transparency, conventional supply chains, likely uses azo dyes and formaldehyde finishes. Score materials 4-6 — do NOT assume clean because it is sold at a mainstream retailer.

HOME AND PERSONAL CARE — hidden toxins:
- "Natural" fragrance: unless individually disclosed natural components are listed (limonene, linalool etc.) or brand explicitly uses only essential oils, treat as synthetic fragrance and score +1.
- "Free of" claims (paraben-free, sulfate-free): removing one chemical does NOT mean the formula is clean. It may still contain synthetic fragrance, polyethylene glycol, phenoxyethanol, or other flagged ingredients. Score based on full ingredient picture not absence of one item.
- Candles: paraffin wax = petroleum byproduct, score materials 5-6. Soy candles with synthetic fragrance = score 4-5. Beeswax or coconut wax + essential oils = score 2-3.
- Nonstick cookware marketed as "PFOA-free": may still contain other PFAS compounds (PFBS, GenX). Only score as safe if explicitly PFAS-free and ceramic or stainless. "PFOA-free" is not the same as "PFAS-free."
- BPA-free plastic: may contain BPS or BPF which have similar endocrine-disrupting effects. Score BPA-free plastic at 5-6, not 2-3.
- "Clean" or "non-toxic" candles, lotions, or cleaning products at Target, Walmart, or mass retail: apply skepticism. These terms are unregulated. Score based on ingredients, not claims.

CONFIDENCE DISCIPLINE — apply to ALL products, not just food:
- If you cannot verify the actual ingredient list, material composition, or chemical treatments for a product, set confidence to "medium" or "low" and say so.
- Never assume a product is safe because of its marketing, price point, retailer, or aesthetic. Score what you know; flag what you don't.
- For store brands (Target, Walmart, Costco, Amazon Basics, IKEA): assume conventional materials and supply chains unless explicitly certified. Low supply chain transparency = confidence low, score conservatively.
- For any product where chemical treatments or processing aids could affect safety but aren't disclosed (clothing finishes, food processing chemicals, cosmetic preservatives): flag the uncertainty in the concerns list with severity "low" and note it as unverified.
- The confidence field should reflect ingredient certainty, not just product identification certainty. Knowing what a product is called is different from knowing what's in it.

CALIBRATION EXAMPLES to ensure differentiation:
- Cascade dishwasher pods: materials=7 (PVA film+synthetic fragrance+optical brighteners), usage=5 (residue on dishes), packaging=3 (recyclable tub), sustainability=6 (PVA in waterways) → final ~6
- Blueland dishwasher tablets: materials=1 (no PVA, no synthetic fragrance), usage=2, packaging=2, sustainability=1 → final ~1-2
- Tide Original pods: materials=7, usage=5 (microfibers+fragrance residue on clothes daily), packaging=3, sustainability=6 → final ~6
- M&Ms: materials=8 (Red 40, Yellow 5, Yellow 6, Blue 1 — multiple FDA-flagged petroleum dyes, hyperactivity and carcinogenicity links), usage=7 (daily candy ingestion, multiple synthetic chemicals), packaging=4 → final ~7
- Skittles: materials=8 (same artificial dyes + titanium dioxide — IARC Group 2B, EU food ban), usage=7, packaging=4 → final ~7
- Plain dark chocolate (no artificial dyes): materials=2, usage=2 → final ~2
- Lululemon leggings (nylon/spandex): materials=7 (synthetic microfiber shedding), usage=6 (daily skin contact), packaging=2, sustainability=5 → final ~6
- 100% organic cotton t-shirt: materials=1, usage=1, packaging=2, sustainability=2 → final ~1-2
- Little Rad Things organic kids tee: materials=1 (confirmed organic cotton), usage=2, packaging=3, sustainability=2 → final ~2
- Generic unbranded cotton tee (unconfirmed): materials=3, confidence=low → final ~3
- Conventional whole milk (no hormones listed, standard dairy): materials=3, usage=3 → final ~3
- Cliff Bar (oats, dates, nuts, some natural flavors): materials=4 (conventional oats likely have glyphosate residue, no organic certification), usage=3 → final ~3-4
- Kashi Organic cereal lines (USDA Organic — Cinnamon Harvest, Organic Promise, etc.): materials=1, usage=1 → final ~1-2. USDA Organic prohibits glyphosate. No artificial dyes. Whole grain. Flag organic as strong positive.
- Kashi conventional cereal (GO Original, GO Crunch, Seven Whole Grain — Non-GMO Project Verified, not organic): materials=3 (seven+ whole grains, Non-GMO verified, no artificial dyes, no synthetic preservatives, high fiber — oats are one of many grains, not primary ingredient, glyphosate MEDIUM concern not HIGH), usage=3 → final ~3. NEVER score Kashi conventional above 4. Kashi is NOT the same as Cheerios — oats are a minor grain in a multi-grain blend.
- Honey Nut Cheerios (conventional oats): materials=7 (IARC 2A glyphosate confirmed above EWG child threshold — same carcinogen class as processed meat nitrites; 12g added sugar; daily child consumption), usage=5 → final ~6-7. NEVER score below 6.
- Original Cheerios (conventional oats): materials=7, usage=5 → final ~6-7. Same confirmed glyphosate, IARC 2A.
- Quaker Old Fashioned Oats (conventional, minimal additives): materials=6 (IARC 2A glyphosate confirmed, but simpler product), usage=4 → final ~5-6
- Bob's Red Mill Organic Rolled Oats: materials=1 (USDA organic — no glyphosate), usage=1 → final ~1-2
- Oats Overnight (organic oat blend, protein, natural flavors — USDA Organic certified): materials=2 (organic oats have zero glyphosate residue — do NOT apply glyphosate floor to certified organic products), usage=2 → final ~2. NEVER score above 4. Organic certification is a positive signal, not a neutral one.
- 365 Whole Foods Market protein bites / chewy bites (dates, almonds, cashews, coffee extract, natural flavors, sea salt — no artificial dyes, no synthetic preservatives, no HFCS): materials=2, usage=2 → final ~2-3. Whole Foods 365 house brand explicitly avoids artificial additives. NEVER score above 4. Do NOT apply glyphosate floor — no oats in this product.
- Nature Valley Oats and Honey Granola Bar (conventional oats): materials=7 (IARC 2A glyphosate + added sugar), usage=5 → final ~6-7. NEVER score below 6.
- KIND Oat bar (conventional oats): materials=6 (IARC 2A glyphosate residue likely), usage=4 → final ~5-6

CHEWING GUM CALIBRATION — direct plastic ingestion category:
Conventional gum base is polyvinyl acetate — a synthetic plastic polymer. You literally chew plastic and swallow trace amounts with every piece.
- Conventional gum (Trident, Extra, Orbit, Doublemint, Juicy Fruit): materials=7 (polyvinyl acetate plastic base, artificial sweeteners aspartame/acesulfame-K, artificial flavors, BHT preservative), usage=7 (direct plastic ingestion, daily use) → final ~7. NEVER score below 6.
- Simply Gum / Chicle-based natural gum: materials=2 (chicle natural tree resin, no synthetic plastic base, no artificial sweeteners, organic ingredients) → final ~2-3.
- Spry / Xylitol gum (synthetic base but no aspartame): materials=5 (still polyvinyl acetate base but cleaner additives) → final ~5.

WATER FILTER CALIBRATION:
- Brita pitcher (BPA-free plastic housing, activated carbon filter): materials=3 (BPA-free plastic, carbon filter removes chlorine/some contaminants), usage=4 (daily water contact with plastic housing — concern level moderate), packaging=3 → final ~3. Note: Brita does NOT remove PFAS, heavy metals, or microplastics.
- PUR pitcher (similar to Brita): materials=3, final ~3. Removes more contaminants than Brita but same plastic housing concern.
- ZeroWater (5-stage ion exchange, removes more contaminants): materials=3, usage=3 → final ~3. Better filtration but still plastic housing.
- Berkey gravity filter (stainless steel housing, carbon + ceramic filters): materials=1 (stainless steel, no plastic water contact), usage=1 (removes PFAS, heavy metals, bacteria, microplastics), packaging=2 → final ~1-2. Consistently the cleanest mainstream filter option.
- Countertop RO systems (APEC, iSpring): materials=2 (removes PFAS, metals, microplastics but uses some plastic tubing), final ~2-3.
- No filter / tap water: score 2-4 depending on municipality — flag the lack of filtration as a concern but not worse than bottled water in single-use plastic.
- Bottled water in single-use PET plastic: materials=5-6 (PET leaches antimony and phthalates, microplastics from cap degradation), packaging=9 (single-use plastic bottle) → final ~5-6.

MAKEUP AND COSMETICS CALIBRATION:
Heavy metals in pigments are a systematic concern for color cosmetics — Consumer Reports and FDA have found lead above safety limits in lipsticks, and titanium dioxide is IARC Group 2B.
- Conventional lipstick (Maybelline, CoverGirl, L'Oreal standard): materials=6 (lead found in many shades by Consumer Reports 2012 — FDA max 10ppm, some exceeded; petroleum waxes, synthetic dye FD&C pigments), usage=7 (direct mucous membrane contact, some ingested daily) → final ~6-7.
- Clean lipstick (ILIA, RMS Beauty, Kosas): materials=3 (no lead-containing pigments, plant wax base, no synthetic dyes) → final ~3.
- Foundation (conventional — Maybelline, Revlon, L'Oreal): materials=5 (titanium dioxide IARC 2B in most, talc in some, synthetic fragrance, parabens in older formulas) → final ~5. Daily full-face application = significant usage score.
- Clean foundation (Ilia, Jones Road, RMS): materials=2-3 (mineral pigments, no synthetic fragrance, no parabens) → final ~2-3.
- Mascara (conventional — Great Lash, etc.): materials=4 (carbon black IARC 2B in some, synthetic preservatives) → final ~4.
- Eyeshadow palette (conventional): materials=5 (multiple synthetic dyes, talc, possible heavy metal pigment contamination in reds/oranges) → final ~5.
Rule: For any color cosmetic, flag "potential heavy metal pigment contamination (lead, cadmium) — Consumer Reports 2012 found above FDA thresholds in conventional lipsticks" as a LOW concern unless the brand explicitly uses EWG-verified or COSMOS-certified pigments.

RESTAURANT CONFIDENCE RULE: Restaurant items ALWAYS have confidence "medium" at most — never "high." Chain restaurants do not disclose full ingredient lists and recipes vary by location. The AI is estimating based on typical chain practices, not confirmed ingredient data.
- Bacon / conventional deli meat / hot dogs (sodium nitrite): materials=8 (IARC Group 1 nitrites — known carcinogen), usage=7 → final ~7-8. NEVER score below 7.
- Organic uncured turkey / chicken (no nitrites added): materials=3, usage=3 → final ~3
- M&Ms Milk Chocolate: materials=8 (Red 40 + Yellow 5 + Yellow 6 + Blue 1 — four FDA-flagged petroleum dyes; IARC carcinogenicity; ultra-processed), usage=7 → final ~7-8. NEVER score below 7.
- Skittles: materials=8 (same petroleum dyes + titanium dioxide IARC 2B, EU banned), usage=7 → final ~7-8. NEVER score below 7.
- Froot Loops / dyed breakfast cereal: materials=8 (multiple petroleum dyes + HFCS + daily child ingestion), usage=7 → final ~7-8. Child vulnerability flag. NEVER score below 7.
- 365 Whole Foods Market snack bars / protein bites (dates, nuts, coffee extract, natural flavors, sea salt — no artificial dyes, no synthetic preservatives): materials=3, usage=3 → final ~3. Whole Foods 365 house brand avoids artificial additives. Do NOT score above 4 based on speculative packaging concerns.
- RX Bar (dates, egg whites, nuts, natural flavor): materials=2 (minimal whole ingredients), usage=2 → final ~2-3
- Larabar (dates, nuts, natural flavor): materials=2 (2-4 whole food ingredients, no additives), usage=2 → final ~2
- KIND bar (nuts, honey, some natural flavors): materials=3 (mostly whole food, glucose syrup), usage=3 → final ~3
- Standard protein bar with sucralose/artificial flavors (Quest, Atkins): materials=4-5, usage=4 → final ~4-5
PACKAGING SPECULATION RULE: If the concern about a harmful substance in packaging uses hedging language ("may contain," "might contain," "possible," "could"), do NOT score materials above 5 based on that speculation alone. Only confirmed harmful packaging materials justify a high materials score.
- Regular ibuprofen/Advil tablet (not packaging): materials=3, usage=3 (occasional ingestion) → final ~3
- Standard paper coffee cup with plastic lid: materials=5 (PE lining leaches at heat), usage=5 (hot liquid ingestion) → final ~5
- Conventional shampoo (SLS, synthetic fragrance, parabens): materials=5, usage=4 (rinse-off, daily) → final ~4-5
- Gatorade (artificial dyes, sucrose, citric acid): materials=5 (artificial dyes, high sugar), usage=5 → final ~5
- Regular lip balm with petrolatum (ChapStick): materials=4 (petrolatum, BHT), usage=4 (leave-on lip contact) → final ~4
- Altoids Peppermint Mints (current formulation): materials=3 (essentially pure sugar delivery vehicle — sugar is primary ingredient; NOVA 3 processed confectionery; gelatin from conventional animal sources; no BHT or artificial dyes in current formulation but also zero nutritional value). usage=4 (daily oral ingestion, tooth decay risk, high sugar relative to serving calories) → final ~3-4. DO NOT score below 3. "Simple ingredients" does not mean healthy when the product is essentially 100% sugar.
- Altoids Sugar Free Mints: materials=4 (artificial sweetener sorbitol/isomalt at high concentration, artificial flavors) → final ~4.

CONFECTIONERY MINIMUM RULE — candy, mints, gum, and sugar-based sweets:
Candy and confectionery are sugar-delivery vehicles with no nutritional benefit. Even when made with "simple" or "natural" ingredients, they warrant a minimum score of 3 because:
1. Primary ingredient is refined sugar (WHO flags added sugar as significant health concern)
2. NOVA 3-4 by definition (industrial confectionery processing)
3. Zero nutritional density — empty calories
4. Daily consumption (common with mints, gum) amplifies impact
NEVER score any candy, mint, gum, or sugar-based confectionery below 3, regardless of ingredient simplicity.
Examples: Altoids = 3-4, Tic Tacs = 3, regular gum = 3, Werther's Original = 3-4, hard candy = 3-4, lollipops = 4, gummies = 4-5 (gelatin + high sugar).
Clean dark chocolate (70%+ cacao, no dyes, minimal additives) is the exception — genuine nutritional value from flavanoids: final score 2-3 not 2.
- Industry of All Nations (IOAN) clothing: materials=1 (undyed/unbleached organic cotton, alpaca wool, vegetable-tanned leather, natural rubber — 75-80% undyed styles, no petroleum synthetics), usage=1, sustainability=1 (handmade, traceable to source) → final ~1-2. One of the highest-rated clothing brands available.
- Unbleached Apparel: materials=1 (100% undyed, unbleached, all-natural organic cotton, no dyes, no bleach, no plastics, made in USA), usage=1, sustainability=1 → final ~1. Score should be as low as possible for any clothing brand.
- Brandy Melville clothing: materials=5 (conventional cotton/polyester blend, no organic or recycled content, no sustainability certifications, zero supply chain transparency, fast fashion model), usage=4, sustainability=6 (fast fashion churn, no take-back program, landfill-destined) → final ~5. Good On You rates "We Avoid."
- Vans shoes (standard): materials=4 (mix of conventional cotton, leather, synthetic rubber, some recycled polyester — 50% cotton sustainably sourced as of 2023 but still uses virgin synthetics in most lines), usage=3, sustainability=4 (2030 sustainability commitments underway but not yet achieved) → final ~4
- Vans Eco Theory / sustainable line: materials=2 (recycled rubber, organic cotton, water-based inks), usage=2, sustainability=2 → final ~2
- San Franpsycho clothing: materials=4 (conventional cotton tees with screen printing — standard commercial cotton, ink composition not disclosed, hand screen-printed locally in SF), usage=3, sustainability=4 (local manufacturing positive, but conventional materials, no organic certifications) → final ~3-4. Community-based local brand, score moderate.
- Non-stick frying pan (PTFE): materials=9, usage=7, packaging=2, sustainability=3 → final ~7
- Caraway/GreenPan ceramic pan (no PTFE/PFAS): materials=2, usage=2, packaging=2, sustainability=3 → final ~2
- Louis Vuitton Monogram Canvas bag (PVC-coated cotton canvas, leather trim): materials=6 (PVC coating confirmed — phthalate plasticizers, especially concerning with heat and friction against skin), usage=5 (crossbody/shoulder bag worn against bare skin daily in warm weather — phthalates from PVC can transfer through skin contact), sustainability=5 → final ~5. Call out PVC coating and phthalate risk explicitly in concerns.
- Canvas tote bag (uncoated natural cotton canvas): materials=3 (conventional cotton, possible azo dyes in dyeing), usage=2 (carried by handle, minimal skin contact), sustainability=4 → final ~3
- Organic cotton canvas tote (GOTS certified): materials=1, usage=1, sustainability=2 → final ~2
- Nylon backpack (conventional, worn on back): materials=5 (petroleum-derived), usage=4 (back/shoulder contact through clothing), sustainability=6 → final ~5
- Hemp gym bag (carried by handle): materials=2, usage=2 (handle contact only), sustainability=2 → final ~2
- Leather wallet (conventional chrome-tanned, in pocket touching skin all day): materials=4 (chromium salts in tanning), usage=5 (constant pocket/hand contact, heat from body), sustainability=5 → final ~4-5
- Leather handbag (vegetable-tanned): materials=2, usage=3, sustainability=3 → final ~2-3

BAG AND COATING USAGE RULES — score usage based on ACTUAL contact pattern:
- Crossbody/shoulder bag worn against bare skin daily in summer: usage 5-6 (sustained skin contact, heat accelerates chemical transfer from coatings)
- Backpack worn on back over clothing: usage 3-4 (skin contact mediated by clothing)
- Handbag carried by handle: usage 2-3 (hand contact only, intermittent)
- Wallet in pants pocket all day: usage 5 (constant body heat, prolonged contact)
- Luggage/suitcase handled occasionally: usage 1-2 (minimal contact)
- Gym bag carried by handle to gym: usage 2 (brief handle contact only)

BAG AND COATING MATERIAL RULES:
- PVC-coated canvas (Louis Vuitton Monogram, many designer bags): materials 6-7 — PVC coating confirmed to contain phthalate plasticizers, especially DEHP. Flagged as high concern in EU REACH. Always name "PVC coating" and "phthalate plasticizers (DEHP class)" in concerns.
- Uncoated cotton/canvas: materials 3-4 (conventional dyes) or 1-2 (organic/undyed)
- Full-grain leather (vegetable-tanned): materials 2
- Full-grain leather (chrome-tanned): materials 4 (Cr(III) tanning, flag potential Cr(VI) contamination)
- Nylon/polyester exterior: materials 5 (microfiber shedding, petroleum-derived)
- "PFAS-treated" or "water-resistant" without explicit PFAS-free certification: materials +2 (flag PFAS DWR)
- Glass pour-over coffee maker (borosilicate glass, ceramic, stainless): materials=1 (inert, no leaching at any temperature), usage=2 (daily use but zero chemical exposure — hot water through glass is safe), packaging=2, sustainability=2 → final ~2. Glass and ceramic coffee equipment should ALWAYS score 1-2 on materials. NEVER score glass or ceramic above 3 on materials.
- Stainless steel water bottle or coffee thermos: materials=1 (food-grade 18/8 stainless, inert), usage=1, packaging=2, sustainability=1 → final ~1-2
- French press (borosilicate glass + stainless): materials=1, usage=2, sustainability=2 → final ~1-2
- AeroPress (BPA-free copolyester or polypropylene): materials=4 (plastic in contact with hot water), usage=4 (daily hot liquid contact), packaging=2 → final ~3-4
- Standard drip coffee maker (plastic water reservoir + heating element): materials=5 (plastic parts contact hot water daily), usage=5 (daily ingestion risk from plastic leaching) → final ~5
- Conventional spinach (Dirty Dozen #1): materials=5 (pesticide load including PFAS pesticides, EWG 2026), usage=4 → final ~4 — note: still a healthy food, flag concern but don't over-score
- Poppi Prebiotic Soda: materials=3 (apple cider vinegar, fruit juice, stevia — no artificial dyes, no HFCS), usage=3 (daily ingestion, low sugar, prebiotic benefit), packaging=4 (aluminum can) → final ~3. Do NOT score above 4.
- Olipop: materials=2 (plant fiber, prebiotics, natural flavors — no artificial dyes, no HFCS), usage=2, packaging=4 → final ~2-3. Do NOT score above 4.
- Poppi or Olipop should NEVER score 6 — they are specifically formulated to avoid the worst ingredients in conventional soda.
- Organic spinach (USDA Organic): materials=1, usage=1 → final ~1
- Conventional strawberries (Dirty Dozen): materials=4, usage=3 → final ~3
- Organic strawberries: materials=1, usage=1 → final ~1
- Avocado / pineapple / onion (Clean Fifteen): materials=1, usage=1 → final ~1
- Neutrogena sunscreen (oxybenzone/octinoxate): materials=7 (oxybenzone detected in bloodstream after single use, FDA flagged), usage=7 (daily full-body skin absorption) → final ~7
- Badger zinc oxide mineral sunscreen: materials=2 (non-nano zinc oxide, organic base), usage=2, packaging=3 → final ~2
- Crayola crayons (paraffin wax): materials=4 (petroleum paraffin wax, synthetic dyes), usage=3 (occasional skin contact, not ingested) → final ~3-4
- Stockmar beeswax crayons: materials=1 (beeswax, plant pigments — no paraffin), usage=1 → final ~1-2
- Standard acrylic craft paint: materials=5 (acrylic polymer — plastic-based binder, synthetic pigments), usage=3 (occasional skin contact) → final ~4
- Water-based washable tempera/watercolor (kids): materials=3 (water-based, no solvents), usage=2 → final ~2-3
- Petroleum jelly (Vaseline): materials=5 (petroleum byproduct, possible polycyclic aromatic hydrocarbon contamination), usage=5 (leave-on skin) → final ~5
- Burt's Bees lip balm / beeswax ointment: materials=1 (beeswax, plant oils), usage=2 (leave-on) → final ~1-2
- Conventional laundry dryer sheets (Bounce/Downy): materials=6 (synthetic fragrance chemicals, benzyl acetate, chloroform compounds), usage=5 (residue on clothing daily skin contact) → final ~5-6
- Wool dryer balls: materials=1 (pure wool), usage=1, sustainability=1 (reusable 1,000+ loads) → final ~1
- Tru Earth/Grove laundry strips: materials=2 (no PVA, no synthetic fragrance), usage=2, packaging=1 (cardboard) → final ~1-2
- Febreze air freshener spray: materials=7 (synthetic fragrance — phthalates, VOCs, propellant), usage=6 (aerosolized inhalation in enclosed spaces) → final ~6-7
- Soy wax candle (cotton wick, phthalate-free fragrance): materials=2, usage=3 (some VOCs from burning) → final ~2-3
- Yankee Candle (paraffin, synthetic fragrance): materials=6 (paraffin = petroleum byproduct, synthetic fragrance phthalates), usage=6 (inhalation during burning) → final ~6
- Purina/Royal Canin dry dog food: materials=5 (synthetic preservatives BHA/BHT, artificial dyes, by-products), usage=4 (daily ingestion) → final ~4-5
- Honest Kitchen/Open Farm dog food (whole ingredients): materials=2 (human-grade, no synthetic preservatives), usage=2 → final ~2
- Standard ABS plastic phone case: materials=5 (ABS plastic with possible flame retardants), usage=2 (skin contact but not prolonged) → final ~3-4
- Compostable/plant-based phone case (Pela): materials=2 (bioplastic, compostable), usage=1, sustainability=1 → final ~1-2
- Acetate eyeglass frames (cellulose): materials=2 (plant-derived, biodegradable), usage=2 (daily skin contact) → final ~2-3
- Standard polycarbonate/plastic frames: materials=4 (petroleum plastic, possible flame retardants in hinges), usage=3 → final ~3-4
- Always/Tampax conventional pads/tampons: materials=6 (rayon/synthetic blend, chlorine bleaching, possible dioxin residue, plastic overwrap), usage=6 (direct mucous membrane contact) → final ~6
- Organic cotton tampons/pads (Rael, Cora, August): materials=2 (GOTS organic cotton, no chlorine bleaching), usage=2 → final ~2
- Menstrual cup (medical silicone): materials=1, usage=2, sustainability=1 (replaces thousands of disposables) → final ~1
- Miracle-Gro synthetic fertilizer: materials=6 (synthetic nitrogen, urea, synthetic iron chelates — runoff risk), sustainability=7 (synthetic chemical runoff, no soil biology) → final ~5-6
- Dr. Earth/Espoma organic fertilizer: materials=1 (bone meal, feather meal, natural minerals), sustainability=2 → final ~1-2
- Standard paraffin wax (Roundup/Scotts lawn chemicals): materials=7 (glyphosate — IARC classified probable carcinogen), usage=6 (skin/inhalation exposure), sustainability=8 (soil and waterway damage) → final ~7
- PVC yoga mat: materials=7 (vinyl chloride, phthalate plasticizers, toxic manufacturing), usage=5 (skin contact during exercise) → final ~6
- Natural rubber yoga mat (Liforme/Manduka natural rubber): materials=2, usage=2 → final ~2
- Standard Advil/Tylenol/NyQuil: materials=3 (active pharmaceutical ingredients, inactive excipients including synthetic dyes, PEG, parabens in some), usage=3 (occasional ingestion) → final ~3 — note: score the product itself not just the packaging
- Zarbees/natural honey-based cough syrup: materials=2 (honey, natural flavors, no synthetic dyes or preservatives), usage=2 → final ~2
- Standard bandages (Band-Aid): materials=4 (synthetic polymer adhesive, possible latex, petroleum-backed strip), usage=3 → final ~3
- Fabric/natural adhesive bandages (Welly): materials=3, usage=2 → final ~2

FINAL SCORE CALCULATION (server applies category-specific formula, provide sub-scores accurately):
Provide accurate scores for: materials_score, usage_score, packaging_score, sustainability_score
Do NOT score or return manufacturing_score — it has been removed from the formula.

PRODUCT ANALYSIS — populate product_analysis for ALL categories. Tailor concerns and tier to the category.

COMPOSITION TIERS (apply to all categories):
Tier 1 (clean/natural): organic certified, plant-based, no synthetic chemicals, genuinely clean
Tier 2 (conventional): standard commercial, some synthetics, generally low concern
Tier 3 (synthetic-heavy): multiple petroleum-based chemicals, synthetic microfibers, synthetic fragrance
Tier 4 (high concern): contains banned/flagged substances, known carcinogens, PFAS, endocrine disruptors

NUTRITION — for food_beverage AND restaurant categories only. Rules:
1. PACKAGED FOOD: Populate if you can read values from the label image, OR if you know the published nutrition facts with high confidence. Use per-serving values as defined by the manufacturer.
2. RESTAURANT ITEMS: Populate using the chain's official published values. For major chains (McDonald's, Chick-fil-A, Chipotle, Taco Bell, Fuzzy's, etc.) you likely know the approximate values — populate what you know with reasonable confidence and set nutrition_verified: false. Only set nutrition_verified: true if you are certain of the exact values.
3. Set individual fields to null if uncertain about that specific value — partial nutrition data is useful. Populate calories and sodium at minimum if you know them.
4. Only set the entire nutrition object to null if you have no useful data at all.
5. Never fabricate precise numbers — if you know calories are approximately 280, return 280. If you're guessing between 200-350, return null for that field.
Format: {"serving_size":"1 taco", "calories":280, "protein_g":17, "carbs_g":14, "sugar_g":1, "fat_g":16, "fiber_g":null, "sodium_mg":430}

RESTAURANT ITEMS — when category is "restaurant", score the dish based on its known ingredients, processing level, and additives used by that chain. Use food_beverage concern types. For ai_alternatives provide two types of suggestions:
TYPE 1 — "Order smarter": 1-2 cleaner options from the SAME restaurant (e.g. Chick-fil-A nuggets → Chick-fil-A grilled chicken sandwich, side salad). Use the format "Chick-fil-A Grilled Chicken Sandwich" as the name so users know it's the same place. Reason should explain why it's cleaner (grilled vs fried, no additives, lower sodium).
TYPE 2 — "Better alternative": 1 suggestion from a cleaner chain or homemade version for the same craving (e.g. Chick-fil-A nuggets → homemade buttermilk chicken, or Raising Cane's if they have a cleaner equivalent). Name it clearly so users know it's a different option.
Do NOT suggest grocery products as alternatives for restaurant items.
RESTAURANT SCORE GUIDANCE — these are HARD FLOORS, do not score below them:
- Fast food fried items (nuggets, fried chicken, french fries, onion rings): final score MUST be 6-7. Materials 7 (refined oils, TBHQ, MSG, additives), usage 6.
- Fast food burgers/sandwiches (conventional): final score MUST be 5-6. Materials 6, usage 5.
- Fast casual tacos/burritos (Fuzzy's, Chipotle, Taco Bell): final score MUST be 4-6. Materials 5-6, usage 5. Even "fresh" fast casual uses processed sauces, high sodium, refined flour tortillas.
- Fast food salads: final score MUST be 4-5.
- Grilled items at fast food chains: final score MUST be 4-5 (still processed marinade, high sodium).
- Sit-down chain restaurants (Applebee's, Chili's, Olive Garden): final score MUST be 4-6.
- Dessert chains (Crumbl, Nothing Bundt Cakes, Insomnia Cookies): final score MUST be 5-7. Refined flour + high sugar + artificial dyes in frosting on many items.
A fast food or fast casual item should NEVER score below 4. If your calculation gives a lower score, raise it to the minimum floor.

SODIUM RULE: For any restaurant item where sodium exceeds 2,000mg per serving, flag "extreme sodium content" as a HIGH concern and add +1 to materials score. Items exceeding 3,000mg sodium (Cheesecake Factory pasta, Applebee's riblets, large fast food combos) = materials minimum 7. The FDA daily sodium limit is 2,300mg — a single item exceeding it is a meaningful health concern regardless of other ingredients.

CATEGORY-SPECIFIC TIER LABELS:
food_beverage: tier1=whole_food, tier2=minimally_processed, tier3=processed, tier4=ultra_processed
personal_care: tier1=clean_formula, tier2=conventional, tier3=synthetic_heavy, tier4=high_concern
clothing: tier1=natural_fiber, tier2=conventional, tier3=synthetic, tier4=chemical_treated
kitchen: tier1=plant_based, tier2=conventional, tier3=synthetic_heavy, tier4=industrial_chemical
baby: tier1=clean_safe, tier2=conventional, tier3=concern_flagged, tier4=high_risk_infants
supplement: tier1=whole_food_derived, tier2=conventional, tier3=synthetic_formula, tier4=high_concern
home_furnishing: tier1=natural_materials, tier2=conventional, tier3=synthetic_foam, tier4=chemical_treated

FOOD (food_beverage) CONCERNS:
HIGH: Red 40/Red 3 (FDA banned/phasing out, carcinogenicity), Yellow 5/6 (hyperactivity/ADHD), Blue 1/2 (neurotoxin), Titanium dioxide (IARC 2B, EU banned), BHA/BHT (IARC 2B carcinogen), Sodium nitrate/nitrite (IARC Group 1 processed meat), Trans fats (cardiovascular), HFCS (metabolic disease), Glyphosate residue in conventional oats/grain products (IARC Group 2A — EWG confirmed above safety threshold in Cheerios, Quaker, Nature Valley)
MEDIUM: Aspartame (IARC 2B 2023), Sucralose (gut microbiome), Acesulfame-K (animal carcinogen), Carrageenan (intestinal inflammation), Sodium benzoate (benzene risk), TBHQ (immunotoxin), Caramel color IV (4-MEI carcinogen), Natural flavors (undisclosed chemicals), Carmine E120 (allergic reactions)
LOW: Artificial flavors, Modified starch, Soy lecithin, Maltodextrin
CONVENTIONAL OATS AND GRAIN PRODUCTS — GLYPHOSATE RULE:
Glyphosate is used as a pre-harvest desiccant on conventional oats and grains. EWG testing confirmed glyphosate above child safety threshold in Cheerios, Quaker, and Nature Valley. However, NOT all oat-containing products warrant the same concern level.

TWO TIERS — assess which applies:

TIER 1 — HIGH CONCERN (materials 6-7): Oats are the PRIMARY or dominant ingredient AND the product has few other redeeming qualities.
- Honey Nut Cheerios, Original Cheerios, Quaker oatmeal, Nature Valley bars: oats = primary ingredient, confirmed EWG residues, high sugar, minimal other nutrition → materials 6-7
- ANY product where conventional oats are listed first or second in ingredients with added sugar and no strong positives

TIER 2 — MODERATE CONCERN (materials 3-4): Oats are ONE of many whole grains, and product has strong positive signals (Non-GMO Project Verified, high fiber 8g+, no artificial dyes, no synthetic preservatives, whole grain dominant).
- Kashi cereals (conventional, non-organic lines): 7-8 whole grains, Non-GMO Project Verified, no artificial dyes, no synthetic preservatives, high fiber/protein → materials 3-4. Oats are one of 7-8 grains, glyphosate exposure is diluted across many grain types. Flag glyphosate as MEDIUM concern (not high), note Non-GMO as positive. NEVER score Kashi conventional as 7 — that is wrong.
- Cliff Bar with conventional oats: oats present but whole food base, high fiber, no dyes → materials 4

TIER 1 vs TIER 2 distinguishing factors:
- Is oats the #1 or #2 ingredient? → Tier 1
- Is the product Non-GMO Project Verified? → Tier 2 signal
- Does the product have fiber >8g per serving? → Tier 2 signal  
- Are there no artificial dyes or synthetic preservatives? → Tier 2 signal
- Does the product have high added sugar (>8g)? → Tier 1 signal

KASHI CALIBRATION:
- Kashi Organic lines (Cinnamon Harvest, Organic Promise — USDA Organic): materials=1-2, final ~1-2. No glyphosate. Flag organic certification as strong positive.
- Kashi conventional lines (GO Original, GO Crunch, Seven Whole Grain — Non-GMO but not organic): materials=3 (seven whole grains, Non-GMO verified, no artificial dyes, no synthetic preservatives, high fiber — oats are one of 7-8 grains, not primary), usage=3 → final ~3. NEVER score above 4.
- Kashi GO with fair trade chocolate or added sugar: materials=4, final ~4. The sugar addition raises it slightly.

UNCURED MEAT CELERY POWDER — critical anti-greenwashing rule:
Products labeled "uncured," "no nitrites added," or "no artificial nitrates" that contain celery juice powder, celery powder, or celery extract are NOT nitrite-free. Celery is naturally high in nitrates which convert to nitrites in the body — same IARC Group 1 concern. This is an FDA labeling loophole, not a safety difference.
- Applegate Farms uncured bacon / turkey (celery juice powder): flag "celery-derived nitrites — same mechanism as sodium nitrite" as MEDIUM concern. materials=6 → final ~5-6.
- Oscar Mayer / conventional bacon (sodium nitrite): materials=8 (IARC Group 1) → final ~7-8.
- EPIC bars / truly nitrite-free jerky (no celery powder): materials=2-3 → final ~2-3.
- Boar's Head low-sodium deli turkey (no celery powder, minimal nitrite): materials=3-4 → final ~3-4.
NEVER score "uncured" meats with celery powder the same as truly clean alternatives. NEVER score below 5.

PLANT MILK CALIBRATION — minimal ingredients = cleanest:
Two-ingredient test: base nut/grain + water = 1-2. Each industrial additive (seed oil, phosphate salt, gum, carrageenan, pea protein isolate) adds 0.5-1 to materials.
- Elmhurst Unsweetened Oat/Almond/Cashew (nut/grain + water only, 2 ingredients): materials=1 → final ~1-2.
- Three Trees Unsweetened Almond (almonds + water only): materials=1 → final ~1-2.
- Malk Organics (organic + minimal ingredients): materials=1 → final ~1-2.
- Forager Project Organic Cashewmilk (USDA Organic, cleaner): materials=2 → final ~2-3.
- Oatly Original / Oatly Full Fat (rapeseed/canola oil + dipotassium phosphate + fortified vitamins, 7+ additives): materials=4 → final ~4.
- Oatly Barista (similar to Original, higher fat): materials=4 → final ~4.
- Silk Almond (carrageenan in some versions, sunflower oil, fortified): materials=4 → final ~4.
- Califia Farms Oat (dipotassium phosphate, sunflower oil, additives): materials=4 → final ~4.
- Planet Oat Unsweetened (sunflower oil, pea protein, additives): materials=4 → final ~4.
DO NOT score Oatly the same as Elmhurst. The additive profile is fundamentally different.

PROTEIN BAR CALIBRATION:
WHOLE FOOD BARS (NOVA 1-2, no synthetic sweeteners — score 2-3):
- Larabar (dates + nuts, 2-6 ingredients): materials=2 → final ~2. Cleanest bar benchmark.
- RXBAR (egg whites, dates, nuts, cocoa): materials=2 → final ~2.
- Perfect Bar (peanut butter, honey, nonfat milk, refrigerated): materials=3 → final ~3.
- GoMacro MacroBar (USDA Organic, whole food): materials=2 → final ~2.
PROCESSED BARS (NOVA 4, synthetic sweeteners — score 4-5):
- Quest Bar (sucralose, protein isolate, palm kernel oil, 15+ ingredients): materials=5 (sucralose floor) → final ~5. NOT clean.
- ONE Bar (sucralose, erythritol, protein isolate): materials=5 → final ~5.
- Built Bar (sucralose, erythritol, carrageenan): materials=5 (sucralose + carrageenan floors) → final ~5.
- Kind bar (nuts, honey, no sucralose): materials=3 → final ~3. Cleaner than Quest/ONE.
NEVER score Quest/ONE/Built the same as Larabar. Sucralose + NOVA 4 = minimum 5.

SEAFOOD CALIBRATION:
- Wild-caught Alaskan salmon (fresh/frozen, minimal additives): materials=1 → final ~1-2. Best seafood option.
- Wild Planet sardines in olive oil (glass jar, low mercury, high omega-3): materials=2 → final ~2.
- Wild Planet canned tuna / chunk light tuna (BPA-free can, low mercury): materials=3 → final ~3.
- StarKist conventional canned tuna (possible BPA can lining, chunk light — lower mercury): materials=4 → final ~4.
- Canned albacore / white tuna (3x higher mercury than chunk light, BPA can): materials=5 → final ~5. Flag: "albacore has ~3x higher mercury — FDA advises limiting to 1 serving/week."
- Farmed shrimp (sodium tripolyphosphate treatment, antibiotic concern in some imports): materials=4 → final ~4.
- Swordfish / king mackerel / tilefish / shark (FDA high-mercury warning): materials=6 → final ~5-6. Always flag high mercury.
MERCURY RULE: For any high-mercury fish, flag "high mercury — FDA advises pregnant women and children to avoid, limit to 1 serving/week for others" as HIGH concern.

BREAD AND GRAIN CALIBRATION:
- Ezekiel 4:9 Sprouted Grain (sprouted grains + water + salt + yeast, NOVA 1): materials=1 → final ~1-2. Benchmark clean bread.
- Traditional sourdough (flour, water, salt, starter — 4 ingredients): materials=2 → final ~2.
- Dave's Killer Bread Organic (USDA Organic, whole grains): materials=2 → final ~2.
- Dave's Killer Bread conventional: materials=3 → final ~3.
- Pepperidge Farm whole wheat (added sugars, dough conditioners): materials=4 → final ~4.
- Wonder Bread / standard white sandwich bread (HFCS, DATEM, SSL, calcium propionate, enriched flour, 15+ ingredients): materials=5 → final ~5. NEVER score below 4.
- Thomas English Muffins (HFCS, calcium propionate): materials=4 → final ~4.

DAIRY CALIBRATION:
- Organic Valley / Stonyfield whole milk (USDA Organic): materials=1 → final ~1-2.
- Conventional whole milk (pasteurized, no additives): materials=2 → final ~2.
- A2 Milk (A2 protein, same processing): materials=2 → final ~2.
- Fairlife ultra-filtered milk (ultra-pasteurized, 9 added vitamins, Coca-Cola subsidiary): materials=3 (NOVA 3 — ultra-processed milk) → final ~3.
- American cheese / Kraft Singles (sodium phosphate, sodium citrate, artificial color — processed cheese product not real cheese): materials=5 → final ~5.
- Organic cream cheese (organic, minimal additives): materials=2 → final ~2.
- Philadelphia cream cheese (locust bean gum, carrageenan in some varieties): materials=4 → final ~4.

FROZEN DESSERT CALIBRATION:
CLEAN (score 2-3):
- Alden Organic Ice Cream (USDA Organic, cream/milk/eggs/sugar/flavor — 5 ingredients): materials=2 → final ~2-3.
- Häagen-Dazs (cream, milk, sugar, eggs, flavor — no carrageenan, no artificial additives): materials=2 → final ~2-3.
"BETTER FOR YOU" ENGINEERED (score 4-5):
- Halo Top (sucralose, erythritol, chicory root, milk protein concentrate — NOVA 4): materials=5 (sucralose floor) → final ~5. NOT cleaner than Häagen-Dazs — different concerns.
- Arctic Zero (sucralose, whey protein concentrate, chicory root): materials=5 → final ~5.
- Ben & Jerry's conventional (carrageenan in vanilla varieties, high sugar): materials=4 → final ~4.
- Ben & Jerry's Non-Dairy (sunflower oil, starch, guar gum — NOVA 4): materials=5 → final ~5.
DO NOT score Halo Top as safer than Häagen-Dazs. Sucralose + erythritol + NOVA 4 formulation is a different risk profile, not a better one.

PLANT-BASED CHEESE CALIBRATION:
- Daiya (coconut oil, tapioca starch, pea protein, natural flavor — NOVA 4): materials=5 → final ~5. "Vegan" ≠ clean.
- Violife (coconut oil, starch, B12 — NOVA 4): materials=5 → final ~5.
- Miyoko's Cashew Cheese (organic cashews, water, cultures, salt — fermented): materials=2 → final ~2-3. The clean option.
NEVER score Daiya/Violife below 4.

FERMENTED FOOD CALIBRATION:
LIVE CULTURE (positive signal — probiotics, simple ingredients):
- Plain organic yogurt (USDA Organic, just milk + cultures): materials=1 → final ~1-2.
- Fage / Chobani plain Greek yogurt (just milk + cultures): materials=2 → final ~2.
- Plain organic kefir (live cultures): materials=1 → final ~1-2.
- GT's Synergy raw kombucha plain (live cultures, <3% natural alcohol): materials=2 → final ~2.
- Raw sauerkraut / kimchi (traditional: cabbage + salt + spices only): materials=1 → final ~1-2.
- Store-brand sauerkraut with vinegar (NOT fermented, NOT live cultures): materials=3 → final ~3.
FLAVORED/SWEETENED:
- Chobani Flip / Activia (added sugar, flavors, inclusions): materials=4 → final ~4.
- Flavored fruit yogurt (Dannon, Yoplait): materials=4 → final ~4.

COOKING OIL CALIBRATION:
- Extra virgin olive oil (cold-pressed, glass bottle): materials=1 → final ~1.
- Avocado oil (cold-pressed): materials=1 → final ~1.
- Organic butter (USDA Organic): materials=1 → final ~1. Note: score is ingredient safety not dietary advice.
- Conventional butter (just cream + salt): materials=2 → final ~2.
- Canola oil (highly refined, hexane extraction, high omega-6): materials=3 → final ~3.
- Vegetable oil / soybean oil (hexane-extracted, industrial refining, "100% natural" is misleading): materials=4 → final ~4.
- Seed oil blends (canola + soybean + sunflower): materials=4 → final ~4.
- Crisco shortening / partially hydrogenated (check label — old formulations = trans fat, materials=7): materials=4-7 → final ~4-7 depending on formulation.
RULE: Cold-pressed single-source = 1. Hexane-extracted industrial = 3-4. Partially hydrogenated = 7.

NUT BUTTER CALIBRATION:
- Once Again Organic peanut butter (USDA Organic peanuts + salt, 2 ingredients): materials=1 → final ~1-2.
- Smucker's Natural peanut butter (peanuts + salt only): materials=2 → final ~2.
- Santa Cruz / MaraNatha natural (peanuts or almonds + salt, no palm oil): materials=2 → final ~2.
- Justin's Classic Almond Butter (dry roasted almonds + palm oil): materials=3 (palm oil — deforestation concern, no RSPO certification confirmed) → final ~3.
- Jif peanut butter (peanuts, sugar, palm oil, mono-diglycerides, NOVA 4): materials=5 → final ~5. NEVER score below 4.
- Skippy peanut butter (peanuts, sugar, hydrogenated vegetable oil, palm oil, NOVA 4): materials=5 (hydrogenated oil, palm oil, NOVA 4) → final ~5. NEVER score below 4.
- Nutella (sugar 57% by weight, palm oil, skim milk, cocoa, soy lecithin, artificial vanilla — NOVA 4): materials=6 (57% sugar is the primary ingredient, palm oil, ultra-processed) → final ~5-6. NEVER score below 5. Do NOT treat Nutella as a nut-based product — it is a sugar and palm oil product with 13% hazelnuts.
NUT BUTTER RULE: 2 ingredients (nut + salt) = 1-2. Palm oil addition = +1. Hydrogenated oil + sugar = +2.

PACKAGED SNACK CALIBRATION:
CLEAN SNACKS (score 1-3):
- SkinnyPop plain popcorn (popcorn + sunflower oil + salt, 3 ingredients): materials=2 → final ~2. Benchmark clean snack.
- Triscuit original (whole grain wheat + oil + salt, 3 ingredients): materials=2 → final ~2.
- Simple Mills almond flour crackers (almond flour, arrowroot, sunflower oil, rosemary): materials=2 → final ~2.
- Mary's Gone Crackers (organic whole grain, clean): materials=2 → final ~2.
MODERATE SNACKS (score 3-4):
- Goldfish crackers (enriched flour, cheddar, annatto color, yeast — NOVA 3): materials=4 → final ~4.
- Smartfood cheddar popcorn (popcorn, cheddar, sunflower oil, natural flavors): materials=4 → final ~4.
- Ritz crackers (enriched flour, palm oil, sugar, natural flavor): materials=4 → final ~4.
- Pretzel Crisps / regular pretzels (enriched flour, salt, yeast): materials=3 → final ~3.
HIGHER CONCERN SNACKS (score 5+):
- Cheez-Its original (enriched flour, TBHQ as preservative): materials=5 (TBHQ floor fires — mFloor:6, but TBHQ may not always be flagged from name alone) → final ~5-6. Always flag TBHQ.
- Wheat Thins original (enriched flour, HFCS, BHT): materials=5 (BHT + HFCS) → final ~5.
- Cheese Puffs / Cheetos (enriched flour, artificial dyes in some, MSG): materials=6 → final ~6 if dyes confirmed.
- Pop-Tarts (HFCS, artificial dyes, TBHQ): materials=7 (TBHQ floor + dyes) → final ~6-7. NEVER score below 6.
SNACK RULE: 3 clean ingredients = 2. Enriched flour + palm oil = 4. TBHQ or BHT = floor fires (5-6 minimum). Artificial dyes = 6-7.

BREAKFAST FOOD CALIBRATION:
WAFFLES AND PANCAKES:
- Eggo frozen waffles (enriched flour, HFCS, artificial flavors, calcium propionate): materials=5 → final ~5. NEVER score below 4.
- Van's Organic frozen waffles (USDA Organic, whole grain): materials=2 → final ~2.
- Kodiak Cakes protein pancake mix (whole grain wheat, whey protein, no artificial additives): materials=3 → final ~3.
- Bisquick original (enriched flour, partially hydrogenated shortening in old formula, leavening): materials=4 → final ~4.
- Birch Benders organic pancake mix (USDA Organic, whole grain): materials=2 → final ~2.
SYRUPS:
- Vermont / pure maple syrup (100% maple syrup, single ingredient): materials=3 → final ~3. Natural, but essentially pure sugar — floor at 3.
- Log Cabin syrup (HFCS, caramel color, artificial maple flavor, sodium benzoate): materials=5 (HFCS + artificial flavors + preservative) → final ~5.
- Aunt Jemima / Pearl Milling syrup (HFCS, caramel color, artificial maple flavor): materials=5 → final ~5.
- Mrs. Butterworth's (HFCS, caramel color, natural flavor): materials=5 → final ~5.
SYRUP RULE: 100% pure maple = 3. HFCS + artificial maple flavor = 5. NEVER score fake maple syrup below 4.

PASTA AND RICE CALIBRATION:
- Jovial USDA Organic brown rice pasta (organic brown rice flour only): materials=1 → final ~1-2.
- Tinkyada brown rice pasta (organic): materials=1 → final ~1-2.
- Barilla whole wheat pasta (whole grain semolina, no additives): materials=2 → final ~2.
- Banza chickpea pasta (chickpea flour, tapioca, pea protein): materials=2 → final ~2. Clean alternative.
- Barilla white pasta (enriched semolina, niacin, ferrous sulfate, folic acid — synthetic vitamins added back): materials=3 → final ~3. Enriched = processing signal.
- Lundberg Organic brown rice (USDA Organic, just rice): materials=1 → final ~1.
- Lundberg conventional brown rice (no additives, just rice): materials=2 → final ~2.
- Uncle Ben's / Ben's Original instant white rice (enriched, parboiled, some have added flavors): materials=3 → final ~3.
- Minute Rice white (instant, enriched): materials=3 → final ~3.
PASTA / RICE RULE: Organic + single grain = 1. Whole grain + no additives = 2. Enriched white = 3. Enriched + added flavors/oils = 4.

BABY SNACK CALIBRATION (child vulnerability flag applies to ALL):
- Happy Baby Organics puffs (USDA Organic, whole grain oats, fruit — simple): materials=2 → final ~2. Flag child vulnerability.
- Plum Organics puffs (USDA Organic, clean ingredients): materials=2 → final ~2. Flag child vulnerability.
- Earth's Best Organic puffs (USDA Organic): materials=2 → final ~2.
- Gerber Puffs (enriched flour, rice flour, sugar, ascorbic acid — NOT organic, conventional): materials=5 (enriched flour primary, added sugar, daily child ingestion of conventional grain products) → final ~5. NEVER score below 4 for non-organic baby snacks. Flag child vulnerability.
- Gerber Graduates snacks (conventional, some with artificial colors): materials=5-6 → final ~5-6.
BABY SNACK RULE: Non-organic baby food with enriched flour = minimum 4. USDA Organic baby snack = 2. Any artificial color in baby food = minimum 7 (child daily ingestion).

PACKAGED MAC AND CHEESE CALIBRATION:
- Annie's Organic mac & cheese (USDA Organic, real cheddar, organic pasta): materials=3 → final ~3. Best mainstream option.
- Kraft Original mac & cheese blue box (enriched flour, cheese sauce powder, annatto color, sodium phosphate): materials=5 → final ~5. Enriched flour + processed cheese powder + sodium phosphate = NOVA 4.
- Kraft Deluxe mac (liquid cheese sauce: sodium phosphate, sodium citrate, more additives): materials=5 → final ~5.
- Velveeta Shells & Cheese (pasteurized process cheese product — not real cheese: sodium phosphate, sodium citrate, sodium alginate, artificial color): materials=6 → final ~6. NEVER score below 5.
- Daiya mac & cheese vegan (Daiya "cheese" — coconut oil, starch, NOVA 4): materials=6 → final ~5-6. "Vegan" label does not improve score.

CANNED SOUP CALIBRATION:
- Amy's Organic soups (USDA Organic, real vegetables, simple ingredients): materials=2 → final ~2-3. Benchmark clean canned soup.
- Pacific Foods Organic broth (USDA Organic, simple): materials=2 → final ~2.
- Imagine Organic soups (USDA Organic): materials=2 → final ~2.
- Progresso traditional soups (conventional, MSG in some varieties, high sodium 800-1000mg): materials=4 → final ~4-5.
- Campbell's Chunky (conventional, 890-1000mg sodium, modified food starch, natural flavors, yeast extract = hidden MSG): materials=5 → final ~5.
- Campbell's Condensed (very high sodium when undiluted: 890mg per half-cup, modified starch, natural flavors): materials=5 → final ~5.
- Maruchan / Top Ramen instant noodles (TBHQ, tertiary butylhydroquinone, high sodium 1800mg per package, MSG, artificial flavors): materials=7 (TBHQ floor fires, extreme sodium) → final ~6-7. NEVER score below 6.
SOUP SODIUM NOTE: Flag any soup with >800mg sodium per serving as HIGH concern using sodium rule.

SALAD DRESSING CALIBRATION:
CLEAN (score 1-3):
- Primal Kitchen avocado oil dressings (avocado oil, apple cider vinegar, clean herbs — no soybean oil, no artificial additives): materials=2 → final ~2. Benchmark clean dressing.
- Tessemae's (USDA Organic in some, clean oils, no additives): materials=2 → final ~2.
- Annie's Organic dressings (organic, simple): materials=2 → final ~2.
- Newman's Own (simple, no artificial additives, charitable mission): materials=3 → final ~3.
- Bragg organic apple cider vinegar dressing: materials=2 → final ~2.
CONVENTIONAL (score 4-5):
- Ken's Steakhouse (soybean oil, calcium disodium EDTA, artificial flavors): materials=5 → final ~5.
- Hidden Valley Ranch original (soybean oil, modified starch, artificial flavors, calcium disodium EDTA): materials=5 → final ~5.
- Wish-Bone (soybean oil, EDTA, artificial colors in some): materials=5 → final ~5.
- Kraft dressings (soybean oil, HFCS in some, EDTA): materials=5 → final ~5.
DRESSING RULE: Avocado oil or olive oil base + no EDTA + no soybean oil = 1-3. Soybean oil base + EDTA = 4-5.
- Raw honey (100% honey, no additives): materials=3 — natural but essentially pure fructose/glucose, no fiber, no protein, rapid blood sugar spike. NEVER score below 3. Flag: high natural sugar, no nutritional complexity.
- Maple syrup (pure): materials=3 — similar to honey, marginally better micronutrient profile. Score 3.
- Agave syrup: materials=4 — 90% fructose, higher than honey, worse metabolic profile despite "natural" marketing. Score 4.
- 100% fruit juice (no added sugar): materials=3 — removes fiber from fruit, concentrates natural sugar, glycemic load similar to soda. Score 3-4. "No added sugar" does not make juice a whole food.
- Dried fruit (raisins, dried mango, dates as ingredient): materials=2-3 when a minor ingredient, 3-4 when primary ingredient at high quantity — concentrated sugar, sticky, tooth decay risk.
DO NOT score any pure sugar product (honey, syrup, molasses, agave) below 3.

HIGH-SUGAR JUICE AND SMOOTHIE CALIBRATION:
100% JUICE (no HFCS, but high natural sugar — floor at 3):
- Welch's 100% Grape Juice (36g natural sugar, 100% juice, no HFCS): materials=3 → final ~3. "100% juice" does not mean clean — it means concentrated natural sugar with no fiber.
- Ocean Spray 100% Cranberry (very tart, usually diluted — 30g sugar): materials=3 → final ~3.
- Tropicana 100% OJ (pasteurized, 22g sugar, some varieties have additives): materials=3 → final ~3.

JUICE COCKTAILS / SUGAR WATER (HFCS + minimal juice — floor at 5):
- Ocean Spray Cranberry Cocktail (28% juice + HFCS + water, 25g added sugar): materials=5 (HFCS floor fires) → final ~5. NOT the same as 100% cranberry juice.
- V8 Splash Tropical Blend (HFCS + 5% vegetable juice + natural flavors): materials=5 → final ~5.
- Welch's Grape Drink / cocktail (HFCS, <100% juice): materials=5 → final ~5.

KIDS DRINKS WITH HFCS + DYES (floor at 6-7 — child daily ingestion concern):
- Hi-C Fruit Punch (HFCS + Red 40 + Blue 1 — two petroleum dyes, child daily drink): materials=7 → final ~7. NEVER score below 6. Child vulnerability flag.
- Hawaiian Punch Fruit Juicy Red (HFCS + Red 40): materials=7 → final ~6-7. NEVER score below 6. Child vulnerability flag.
- Kool-Aid Jammers (HFCS + multiple petroleum dyes in most flavors): materials=7 → final ~6-7. NEVER score below 6. Child vulnerability flag.
- Capri Sun Original (HFCS in original flavors, check variant — some newer versions are HFCS-free): materials=5 (HFCS floor) → final ~5. Newer "25% less sugar" versions without HFCS = 3.
- Tampico citrus punch (HFCS + artificial dyes + 2% juice): materials=7 (HFCS + dyes) → final ~6-7.
HIGH-SUGAR SMOOTHIE DRINKS (natural sugar floor):
- Naked Juice (53g+ natural sugar per bottle, pasteurized, no added sugar): materials=4 (total sugar >50g floor applies) → final ~4. NOT scored as clean as whole fruit.
- Odwalla (pasteurized, similar sugar load to Naked): materials=4 → final ~4.
- Bolthouse Farms Green Goodness (>50g sugar, pasteurized): materials=4 → final ~4.

SWEETENED TEA AND LEMONADE CALIBRATION:
CLEAN (unsweetened, score 1-2):
- Pure Leaf Unsweetened Tea (just tea + water, no sweetener): materials=1 → final ~1.
- Honest Tea Unsweetened (organic, just tea): materials=1 → final ~1.
ORGANIC / LIGHT SWEETENED (score 2-3):
- Honest Tea (organic, 10g sugar, USDA Organic, fair trade): materials=2 → final ~2-3.
- GT's plain kombucha (lightly sweet from fermentation): materials=2 → final ~2.
HFCS SWEETENED (floor at 5):
- Snapple Peach Tea / Lemon Tea (HFCS, 37g sugar): materials=5 (HFCS floor) → final ~5. NEVER score below 4.
- Arizona Green Tea / Sweet Tea (HFCS, 23-34g sugar): materials=5 → final ~5.
- Lipton Brisk Iced Tea (HFCS): materials=5 → final ~5.
- Gold Peak Sweet Tea (HFCS): materials=5 → final ~5.
- Minute Maid Lemonade (HFCS, 28g sugar): materials=5 → final ~5.
- SunnyD (HFCS + artificial dyes + 2% juice): materials=6 (HFCS + dyes) → final ~6.
RESTAURANT SWEET TEA (score 4-5):
- McDonald's / Chick-fil-A / Raising Cane's sweet tea (sugar + water + tea, ~40-70g sugar in large): materials=4 → final ~4. Not HFCS but extreme sugar load at chain scale.

CANDY CALIBRATION — HFCS + PGPR CHOCOLATE BARS:
HFCS + NO PETROLEUM DYES (score 5-6):
- Reese's Peanut Butter Cup (HFCS, PGPR emulsifier replacing cocoa butter, artificial flavors, palm kernel oil): materials=5 → final ~5-6. NEVER score below 5.
- Snickers (HFCS, corn syrup, PGPR, artificial flavors): materials=5 → final ~5-6.
- Twix (HFCS, PGPR, enriched flour, artificial flavors): materials=5 → final ~5-6.
- Kit Kat US (HFCS in US formulation, PGPR, enriched flour, artificial flavors): materials=5 → final ~5-6.
- Baby Ruth / Butterfinger (HFCS, PGPR, corn syrup): materials=5 → final ~5-6.
- Milky Way (HFCS, corn syrup, hydrogenated palm oil, artificial flavors): materials=6 → final ~6.
- Swedish Fish (HFCS, artificial red dye, carnauba wax): materials=6 (HFCS + artificial dye) → final ~6.
NOTE ON PGPR: Polyglycerol polyricinoleate (PGPR) is a cheap emulsifier used to replace cocoa butter in budget chocolate. FDA GRAS but signals NOVA 4 ultra-processed formulation and lower cocoa content. Flag as LOW concern.
HFCS + PETROLEUM DYES (score 6-7 — dye floors fire):
- Sour Patch Kids (HFCS + Red 40 + Yellow 5 + Blue 1): materials=7 → final ~7. NEVER score below 6.
- Starburst (HFCS + Red 40 + Yellow 5 + Yellow 6 + hydrogenated palm kernel oil): materials=7 → final ~7. NEVER score below 6.
- Jolly Ranchers (HFCS + artificial dyes): materials=7 → final ~6-7. NEVER score below 6.
- Airheads (HFCS + artificial dyes + titanium dioxide IARC 2B): materials=7 (HFCS + dyes + TiO2) → final ~7.
- Nerds (HFCS + carmine + Red 40 + Blue 1): materials=7 → final ~7. NEVER score below 6.
- Peach Rings / generic gummy candy (HFCS + Red 40 + Yellow 5): materials=7 → final ~6-7.
- Trolli sour worms (HFCS + multiple dyes): materials=7 → final ~6-7.

SNACK CAKE AND PACKAGED PASTRY CALIBRATION:
- Hostess Twinkies (HFCS, sorbic acid, polysorbate 60, 27 ingredients — NOVA 4 industrial formulation): materials=6 → final ~6. NEVER score below 5.
- Hostess Ding Dongs / Ho Hos (HFCS + hydrogenated oil + artificial flavors): materials=6 → final ~6. NEVER score below 5.
- Little Debbie Swiss Rolls (HFCS + corn syrup + modified starch + 20+ additives): materials=6 → final ~6.
- Little Debbie Nutty Bars (HFCS + corn syrup + partially hydrogenated oil in older formulas): materials=6 → final ~6.
- Pop-Tarts (HFCS + TBHQ + artificial dyes — TBHQ floor fires): materials=7 → final ~6-7. NEVER score below 6.
- Cosmic Brownies / Little Debbie brownies with colored candy (HFCS + dyes): materials=7 (dyes) → final ~6-7.

CHOCOLATE BAR HIERARCHY — quality matters:
PREMIUM MILK CHOCOLATE (no HFCS, cocoa butter — score 3-4):
- Lindt Milk Chocolate (cocoa butter, whole milk powder, vanilla — no HFCS, no PGPR): materials=3 → final ~3-4.
- Ghirardelli Milk Chocolate (cocoa butter, no HFCS): materials=3 → final ~3-4.
BUDGET MILK CHOCOLATE (HFCS + PGPR — score 5-6):
- Hershey's Milk Chocolate bar (HFCS, PGPR, artificial flavor — different from premium milk chocolate): materials=5 (HFCS + PGPR + ultra-processed) → final ~5. NEVER score same as Lindt milk.
- Hershey's Kisses (same formulation): materials=5 → final ~5.
CLEAN DARK CHOCOLATE (score 2-3):
- Hu Chocolate / Lindt 70%+ / Green & Black's 70%+ (cocoa butter, no HFCS, no PGPR, no artificial flavors): materials=2 → final ~2-3.
RULE: Cocoa butter = premium signal. PGPR replacing cocoa butter = NOVA 4 flag. HFCS in chocolate = always 5+.

YOPLAIT AND HIGH-HFCS YOGURT:
- Yoplait Original (US formulation uses HFCS in most flavors — check label): materials=5 (HFCS floor) → final ~5. This is NOT the same as Stonyfield or Chobani plain. NEVER score below 4.
- Yoplait Whips (HFCS, modified starch, gelatin, artificial flavor): materials=5 → final ~5.
- Dannon Fruit on the Bottom (added sugar, natural flavors, modified starch — no HFCS in current formula): materials=4 → final ~4.
- Holle / Kendamil Organic / HiPP Organic (European organic formulas): materials=2 — USDA/EU Organic certified, DHA from algae oil (not hexane-extracted), no corn syrup, simple ingredient list. Score 2-3.
- Similac / Enfamil (conventional, standard formula): materials=4 — synthetic DHA/ARA from hexane-extracted microalgae/fungal oil in some versions, corn maltodextrin as primary carb, synthetic vitamins, palm olein oil (reduces calcium absorption). Score 4.
- Similac Organic / Earth's Best Organic formula: materials=3 — organic certified but still highly processed, synthetic vitamins added back. Score 3.
Baby formula is always a BABY category product — apply child vulnerability flag. Parents choosing formula have no alternative — scoring reflects relative risk within the category, not a judgment on formula feeding.

ALCOHOL AND LOW-ALCOHOL EDGE CASES:
- All intentionally alcoholic beverages (wine, beer, spirits, hard cider, hard seltzer): ethanol is IARC Group 1. NEVER score below 6 regardless of organic certification or natural ingredients. Organic wine = materials 7 (still IARC Group 1 ethanol).
- Kombucha with trace fermentation alcohol (<3% ABV): NOT the same as alcoholic beverages. Score based on ingredients only — plain raw kombucha = 2-3. The trace ethanol from natural fermentation does not trigger the IARC Group 1 alcohol floor.
- Non-alcoholic beer/wine (0.0% or <0.5% ABV — Heineken 0.0, Athletic Brewing): score based on actual ingredients, not the word "beer." Athletic Brewing = 2-3 (clean craft ingredients, no alcohol). Heineken 0.0 = 3-4 (conventional ingredients, some additives).
- Vanilla extract (35% alcohol by volume — used as flavor): not an alcoholic beverage, used in trace amounts as flavoring. Do NOT apply alcohol floor to vanilla extract as a product ingredient.

PRODUCT VARIANT HANDLING:
When a product has multiple variants with meaningfully different ingredients, always ask or note which variant matters most. If unclear, score the most common/standard variant and note the concern:
- "Gatorade" → score original (has artificial dyes: 5-6) and note that G Zero (artificial sweeteners, no dyes) scores differently at 4.
- "Pampers" → score standard Swaddlers (7) and note Pampers Pure is cleaner (5).
- "Altoids" → original (3-4), Sugar Free (4), Smalls (3-4).
Never average across variants — score the version most likely to be the one the user has.

PESTICIDE CONCERNS — EWG 2026 Dirty Dozen (flag when product IS or CONTAINS conventional versions of these):
HIGH severity pesticide concern (type="pesticide"): Conventional spinach (most pesticide residues by weight — EWG 2026, PFAS pesticides detected), Conventional strawberries, Conventional kale/collard/mustard greens (cancer-causing pesticides in 50%+ samples), Conventional grapes, Conventional nectarines, Conventional peaches, Conventional cherries, Conventional apples, Conventional blackberries (new 2026 — 4+ pesticides per sample), Conventional blueberries, Conventional pears, Conventional potatoes (90% had chlorpropham — banned in EU), Conventional green beans (highest toxicity flagged by EWG), Conventional bell/hot peppers (highest toxicity flagged by EWG)
Reason to use: "EWG 2026 Dirty Dozen — PFAS pesticides on [X]% of samples, [N] pesticides detected per sample"
MEDIUM severity: Conventional produce outside Dirty Dozen — moderate pesticide load but not flagged high
LOW/POSITIVE — Clean Fifteen (flag as positive "Clean Fifteen produce — low pesticide residue"): Pineapple, sweet corn, avocados, papaya, onions, frozen sweet peas, asparagus, cabbage, cauliflower, watermelon, mangoes, bananas, carrots, mushrooms, kiwi
ORGANIC PRODUCE RULE: If product is confirmed USDA Organic — do NOT flag pesticide concerns. Add "USDA Organic — no synthetic pesticides" as a positive attribute instead.
IMPORTANT: Always note that all produce (organic or conventional) is healthy. These concerns are about reducing exposure, not avoiding fruits and vegetables entirely.

PERSONAL CARE CONCERNS:
HIGH: Oxybenzone/octinoxate (FDA flagged, bloodstream penetration, Matta JAMA 2019), Parabens/methylparaben/propylparaben/butylparaben (endocrine disruption, Darbre 2004), Formaldehyde releasers/DMDM hydantoin/quaternium-15/imidazolidinyl urea (IARC Group 1 carcinogen), Triclosan (endocrine disruptor, FDA banned in some products), Coal tar dyes/p-phenylenediamine (IARC carcinogen), Phthalates/DBP/DEHP (endocrine disruption, reproductive harm), PFAS in cosmetics (CDC flagged, bioaccumulative), Lead acetate (neurotoxin)
MEDIUM: SLS/SLES (skin irritant, possible nitrosamine), Synthetic fragrance/parfum (phthalates hiding behind single word), PEG compounds (1,4-dioxane contamination risk), Methylisothiazolinone/MIT (contact allergen, neurotoxin), Retinyl palmitate (tumor promoter on sun-exposed skin), BHT in cosmetics (possible endocrine disruptor), Benzophenone (possible carcinogen), Phenoxyethanol (CNS depression at high doses)
LOW: Alcohol denat (skin barrier disruption), Silicones/dimethicone (environmental persistence), Synthetic dyes in cosmetics (contact sensitizer), Carbomer
PERSONAL CARE POSITIVES: EWG Verified, COSMOS/ECOCERT Certified Organic, Fragrance-free, Paraben-free certified, Sulfate-free, Leaping Bunny cruelty-free, B-Corp certified, No synthetic preservatives

CLOTHING CONCERNS:
HIGH: PFAS/DWR waterproofing coating (bioaccumulative, endocrine disruption, cancer risk — PFAS found in outdoor gear), Formaldehyde finish/wrinkle-free/easy-care treatment (IARC Group 1 carcinogen, skin sensitizer), Carcinogenic azo dyes (split to release carcinogenic aromatic amines, IARC flagged), Flame retardants/PBDE/TRIS (endocrine disruption, developmental toxicity, Stapleton 2011), Antimicrobial treatment/silver nanoparticles (aquatic toxin, environmental persistence)
MEDIUM: Polyester microfibers (700K+ fibers per wash, Browne 2011, ocean pollution), Nylon (petroleum-derived, sheds during wear AND wash), Acrylic (most carbon-intensive synthetic, highest microplastic shed rate), Spandex/elastane (petroleum-derived, chemical processing), Disperse dyes (skin sensitizer, possible carcinogen), Optical brighteners (endocrine disruption, water pollution)
LOW: Recycled polyester (lower carbon but still sheds microplastics), Blended natural/synthetic fabrics
CLOTHING POSITIVES: GOTS certified organic cotton/wool/linen, OEKO-TEX Standard 100 (no harmful chemicals tested), Bluesign certified manufacturing, Fair Trade certified, 100% natural fiber (cotton/wool/linen/hemp/silk), Recycled content certified (GRS)

KITCHEN/CLEANING CONCERNS:
HIGH: PTFE/PFAS non-stick coating (endocrine disruption, cancer risk above 260C, EWG canaries in kitchen study), BPA/BPS/BPF in plastic containers (estrogen mimicry, endocrine disruption), Quaternary ammonium compounds/quats (EPA flagged reproductive harm, asthma induction), Chlorine bleach/sodium hypochlorite (respiratory irritant, toxic byproducts), Synthetic fragrance in cleaners (VOCs, phthalates, formaldehyde, Steinemann 2017), PVC/vinyl chloride in containers (phthalate plasticizers, toxic manufacturing), 1,4-dioxane in cleaners (IARC Group 2B, ethoxylation byproduct)
MEDIUM: Optical brighteners in laundry (water pollution, endocrine disruption), Synthetic surfactants/petroleum-derived (aquatic toxicity), PVA film in pods (enters waterways as microplastic, Cascade/Tide), Phosphates (eutrophication, algal blooms), Paraffin wax (petroleum byproduct, VOCs when burned), Artificial fragrance in candles (phthalates during burning)
LOW: Synthetic dyes in cleaning products (water pollution), Preservatives/methylisothiazolinone (aquatic toxicity)
KITCHEN POSITIVES: EPA Safer Choice certified, EWG Verified, No synthetic fragrance, Biodegradable certified formula, Concentrated/refillable system, B-Corp certified, PTFE/PFAS-free certified, Food-grade safe materials (glass/stainless/ceramic)

BABY CONCERNS (all thresholds 1 tier higher due to developing systems):
Apply all personal_care concerns with elevated severity. ADDITIONAL baby-specific:
HIGH: Any synthetic fragrance in products used on babies (developing endocrine systems), Talc without asbestos testing (possible asbestos contamination), Phenoxyethanol in products for babies under 3 (CNS depression, FDA warned), Any parabens in baby products, Phthalates in baby toys/products (endocrine disruption, Swan 2021)
MEDIUM: Formaldehyde releasers in baby wash/shampoo, SLS/SLES in baby bath products, Mineral oil in baby products (possible petroleum contamination), Synthetic dyes in any product
BABY POSITIVES: MADE SAFE certified, EWG Verified for baby, Pediatrician tested and approved, Fragrance-free, Hypoallergenic tested, GOTS organic cotton, No parabens/phthalates/sulfates

DIAPER CALIBRATION — score between these anchors, from worst to best:
- Pampers / Huggies / Luvs (conventional): materials=7 — PP inner liner direct skin contact, ECF bleaching (trace dioxin risk), synthetic fragrance in some. NEVER score below 6.
- Kirkland Signature (Costco): materials=6 — polypropylene/polyester topsheet, PP/PE backsheet, ECF wood pulp, SAP. No fragrance, no phthalates. 23% plant-based materials but all conventional petroleum plastics in skin-contact layer. Low-level PFAS (10-26 ppm organic fluorine) detected in independent lab testing (Mamavation 2023). Changed manufacturers in 2024. Score 6 — no fragrance is positive, but conventional PP/PE throughout and PFAS detection prevent lower score.
- Honest Company diapers: materials=5 — inner skin-contact layer is PE+PP (conventional petroleum plastics, same as Pampers). "Plant-based" claim refers only to outer backsheet (PLA+PE blend). ECF wood pulp (not TCF). No fragrance (positive). Polymer spandex waist/leg. Score 5.
- Millie Moon diapers: materials=5 — PP non-woven fabrics, PE film, ECF pulp, SAP. Conventional petroleum plastics throughout. OEKO-TEX Standard 100 and Dermatest certified (good third-party testing). No fragrance. Score 5 — same tier as Honest, slightly better certifications.
- Hello Bello diapers: materials=4 — MEANINGFULLY DIFFERENT from Honest/Millie Moon: inner core liner is corn-derived PLA fiber (plant-based at the skin-contact layer, not just the outer layer). 100% chlorine-free processing (TCF or equivalent — better than ECF). No fragrance, no phthalates, no parabens, no latex. Made in USA. Score 4. NEVER score above 5. DO NOT score same as Pampers or Kirkland. The corn-derived inner liner touching baby skin is a real improvement.
- Andy Pandy / Dyper / Healthynest (organic bamboo): materials=3 — bamboo-derived top sheet, TCF or ECF pulp, no synthetic fragrance. Score 3.
- GroVia / Esembly (organic cotton cloth): materials=1-2 — reusable, organic cotton, no SAP polymers. Score 1-2.
KEY RULE: Always distinguish which layer is plant-based. Outer backsheet = cosmetic improvement. Inner skin-contact liner = meaningful improvement for baby health. Hello Bello's plant-based claim is on the skin-contact side. Honest/Millie Moon's is not.

SUPPLEMENT CONCERNS (vitamins, protein powders, probiotics, sleep aids, pre-workout):
HIGH: Artificial colors/dyes in capsules or gummies (Red 40, Yellow 5 — FDA phasing out), Heavy metal contamination in protein powders (lead, arsenic, cadmium — Consumer Reports 2018 found in many brands), DMAA/stimulants in pre-workout (FDA warnings, cardiovascular risk), Ephedra/ephedrine (FDA banned, cardiovascular events), Synthetic testosterone precursors/prohormones (FDA flagged), Titanium dioxide in coatings (IARC Group 2B), Proprietary blends masking underdosed or contaminated ingredients
MEDIUM: Magnesium stearate in capsules (high doses may impair absorption), Artificial sweeteners in flavored powders (sucralose, acesulfame-K), Silicon dioxide/silica flow agents, Hydrogenated oils in softgels (trans fat residue), Synthetic vitamin forms (dl-alpha tocopherol vs d-alpha, cyanocobalamin vs methylcobalamin)
LOW: Gelatin capsules (animal-derived, not suitable for vegans), Maltodextrin as filler, Natural flavors
SUPPLEMENT SCORE GUIDANCE: Whole-food derived supplements (food-based vitamin C, fermented vitamins) = materials 1-2. Standard synthetic vitamins = materials 2-3. Proprietary blend pre-workouts with stimulants = materials 5-7. Any supplement with FDA warnings = materials 7-8.
GUMMY VITAMIN DYE RULE: Any gummy vitamin or chewable supplement containing petroleum dyes (Red 40, Yellow 5, Yellow 6, Blue 1) scores materials MINIMUM 6 and usage MINIMUM 6. Children's gummy vitamins (Flintstones, L'il Critters) with dyes = materials 7 + child vulnerability flag. "Kid-friendly" coloring does not reduce this concern — it increases it. The supplement formula (65% materials) still produces a final score of ~6+ from materials=7. NEVER score a dyed gummy vitamin below 5.
SUPPLEMENT POSITIVES: NSF Certified for Sport, Informed Sport certified, USP Verified, Third-party tested, NSF International certified, Non-GMO Project Verified, USDA Organic certified ingredients, Certified vegan, No artificial colors or sweeteners, No proprietary blends

HOME LAUNDRY AND CLEANING — SPECIFIC CALIBRATION:
Conventional laundry pods (Tide, Cascade, Gain pods):
- materials=6 (PVA film dissolves into waterways as microplastic, synthetic fragrance = phthalates, 1,4-dioxane contamination risk from ethoxylated surfactants), usage=5, sustainability=7 → final ~6
- Flag: PVA pod film, synthetic fragrance, 1,4-dioxane risk
Conventional dryer sheets (Bounce, Downy dryer sheets):
- materials=6 (benzyl acetate, chloroform compounds, synthetic fragrance with phthalates, quaternary ammonium residue on clothes), usage=6 (residue stays on clothing = daily skin contact during wear + inhalation during drying) → final ~6
- Flag: synthetic fragrance VOCs, quaternary ammonium residue, daily skin contact
Liquid fabric softener (Downy liquid, Snuggle):
- materials=6 (synthetic fragrance, quaternary ammonium compounds EPA flagged for reproductive harm, dihydrogenated tallow dimethyl ammonium chloride) → final ~6
Clean laundry alternatives (Molly's Suds, Branch Basics, Seventh Generation Free & Clear):
- materials=2-3 (no synthetic fragrance, no optical brighteners, plant-derived surfactants) → final ~2-3
Wool dryer balls: materials=1, usage=1, final ~1
NEVER score conventional dryer sheets below 5. The synthetic fragrance + QAC residue on clothing is daily skin exposure.

HOME FURNISHING CONCERNS (mattresses, sofas, bedding, carpets, curtains, foam furniture):
HIGH: Flame retardants/PBDEs/chlorinated Tris/TDCPP in foam (IARC carcinogen, endocrine disruption — Stapleton 2011, California TB117 phased out), PFAS in stain-resistant treatments (Scotchgard, Teflon-coated fabrics — bioaccumulative, EPA flagged), Formaldehyde off-gassing from pressed wood, MDF, particleboard furniture (IARC Group 1 carcinogen — OSHA PEL exceeded in new furniture), Vinyl/PVC coatings or covers (phthalate plasticizers, off-gassing VOCs), Antimicrobial treatments with silver nanoparticles or triclosan (environmental persistence)
MEDIUM: Polyurethane foam off-gassing VOCs (new mattress/sofa smell — toluene, benzene derivatives), Memory foam petroleum-based content (off-gassing isocyanates), Synthetic latex (petroleum-derived, lower durability than natural), Polypropylene or nylon carpet (microfiber shedding, VOC emissions from backing), Stain treatments (oil-based or synthetic polymer), Conventional cotton batting (pesticide residue without organic certification)
LOW: Polyester fiberfill in pillows (microfiber shedding, low direct exposure), Recycled synthetic fill (lower carbon but still synthetic)
HOME FURNISHING SCORE GUIDANCE: Natural latex + organic cotton/wool + no flame retardant treatment = materials 1-2. Standard innerspring mattress, no known FR treatment = materials 3-4. Memory foam, standard poly foam = materials 5-6. Known flame retardants + PFAS stain treatment + VOC off-gassing = materials 7-8. Usage score lower than materials — exposure is inhalation and prolonged skin contact during sleep, daily usage penalty applies.
HOME FURNISHING POSITIVES: GOTS certified organic cotton/wool, GOLS certified organic latex, OEKO-TEX Standard 100, Greenguard Gold certified (low VOC emissions), CertiPUR-US foam (no harmful flame retardants), Made Safe certified, No added flame retardants, PFAS-free certified

Return ONLY this JSON:
{
  "product_name": "clean accurate product name",
  "category": "food|beverage|clothing|personal_care|home|baby|supplement|toy|accessory|restaurant|other",
  "identified_plastics": ["specific plastic type 1"],
  "harmful_chemicals": ["phthalates", "BPA", "Red 40"],
  "natural_materials": ["organic cotton", "glass"],
  "materials": {
    "score": 7,
    "label": "specific material analysis",
    "concerns": ["PP in direct food contact", "PTFE coating degrades above 260C"]
  },
  "usage_exposure": {
    "score": 8,
    "label": "daily ingestion risk",
    "frequency": "daily|weekly|occasional|rare",
    "type": "ingestion|skin_contact|inhalation|mixed",
    "intensity": "leave-on|rinse-off|single-contact",
    "vulnerable": false,
    "concerns": ["Direct plastic ingestion at every use"]
  },
  "packaging": {
    "score": 3,
    "label": "packaging assessment",
    "primary": "cardboard|glass|plastic|mixed",
    "refillable": false,
    "end_of_life": "recyclable|compostable|landfill|unknown",
    "concerns": []
  },
  "sustainability": {
    "score": 2,
    "label": "sustainability story",
    "reusable": true,
    "replaces_single_use": true,
    "replaces_count": 50,
    "circularity": "refillable|repairable|compostable|recyclable|landfill",
    "concerns": []
  },
  "manufacturing": {
    "score": 5,
    "label": "estimated — limited supply chain data",
    "tier": "good|neutral|bad",
    "confidence": "low",
    "concerns": []
  },
  "product_analysis": {
    "composition_tier": 2,
    "tier_label": "conventional|clean_formula|synthetic_heavy|high_concern|natural_fiber|synthetic|chemical_treated|plant_based|industrial_chemical|clean_safe|concern_flagged|high_risk_infants|whole_food|minimally_processed|processed|ultra_processed|whole_food_derived|synthetic_formula|natural_materials|synthetic_foam",
    "tier_description": "max 8 words describing this product composition",
    "nutrition": null,
    "nutrition_verified": false,
    "concerns": [
    ],
    "positives": [
      {"attribute": "EWG Verified", "reason": "max 8 words"}
    ],
    "confidence": "high|medium|low",
    "confidence_note": "max 10 words"
  },
  "summary": "max 30 words covering the main risk or safety story",
  "raw_concerns": ["concern 1", "concern 2", "concern 3"],
  "confidence": "high|medium|low",
  "confidence_reason": "why",
  "scan_next": ["related product 1", "related product 2", "related product 3"],
  "ai_alternatives": [
    {"name": "specific product name", "reason": "max 10 words why safer", "material": "max 5 words", "estimated_score": 2},
    {"name": "second alternative", "reason": "max 10 words", "material": "max 5 words", "estimated_score": 1},
    {"name": "third alternative", "reason": "max 10 words", "material": "max 5 words", "estimated_score": 2}
  ]
}

CRITICAL: Populate product_analysis for ALL categories — food_beverage, personal_care, clothing, kitchen, baby, supplement, home_furnishing, restaurant, and other.
Use the category-specific tier labels and concern lists defined above.
For restaurant category: populate composition_tier based on processing level, populate nutrition using the chain's official published values only (null if uncertain), set nutrition_verified: true only if confident in the values.
If category is "other" or unknown, apply the most relevant concern types based on what the product is.
Set concerns to [] and positives to [] if the product is genuinely clean with no flagged substances.

SUBSTANCE NAMING RULES — critical for accurate scoring:
Always name the SPECIFIC chemical, not a generic category. These rules apply to every concern you generate:
- NEVER write "contains preservatives" → ALWAYS write the specific preservative: "BHT (butylated hydroxytoluene)", "BHA", "TBHQ", "sodium benzoate", "potassium sorbate"
- NEVER write "artificial colors" → ALWAYS write the specific dye: "Red 40 (Allura Red)", "Yellow 5 (Tartrazine)", "Blue 1"
- NEVER write "synthetic fragrance" alone → write "synthetic fragrance (may contain undisclosed phthalates and VOCs)"
- NEVER write "phthalates" alone → write "DEHP", "DBP", or "diethyl phthalate" if you know which type
- NEVER write "heavy metals" → write "lead", "cadmium", or "arsenic" if known
- NEVER write "flame retardants" → write "PBDE", "TCEP", "TDCPP", or "TPhP" if known
- NEVER write "PFAS" alone without specifying → "PFAS (PFOA class)", "PTFE coating", "perfluoroalkyl DWR"
- NEVER write "binding agents", "emulsifiers", "natural flavors", "processing aids" as concerns — these are ingredients, not harmful substances
- NEVER write concerns about "concentration levels" or "coating types" without naming the specific chemical
- If you know a product contains a specific harmful substance (e.g. Altoids contains BHT, Chick-fil-A uses TBHQ), NAME IT explicitly in the concerns
- If you are uncertain whether a substance is present, use hedging in the reason field but still name the specific substance: "BHT — listed as preservative in some formulations; verify on label"
- Packaging speculation: if packaging MAY contain a harmful substance, write it as: "packaging may contain [specific substance] — unconfirmed" with severity "low", NOT as a high/medium concern

AI ALTERNATIVES — same-use, same-function rule — CRITICAL — NEVER VIOLATE:
Alternatives MUST serve the exact same purpose as the scanned product. This is the single most important rule for alternatives. Cross-category suggestions are STRICTLY FORBIDDEN and a serious failure.

CATEGORY MAPPING — only suggest alternatives within these categories:
- Cereal / breakfast food (Cheerios, Froot Loops, granola) → ONLY suggest other cereals or breakfast foods. NEVER suggest cough syrup, supplements, medication, or anything not eaten for breakfast.
- Snack bar / granola bar → ONLY suggest other snack bars or granola bars
- Soda / beverage → ONLY suggest other beverages
- Diapers / training pants → ONLY suggest other diapers or cloth diaper systems
- Sunscreen → ONLY suggest other sunscreens
- Shampoo → ONLY suggest other shampoos
- Cleaning spray → ONLY suggest other cleaning products
- Frying pan / cookware → ONLY suggest other cookware
- Clothing / jacket → ONLY suggest other clothing in the same category

FOOD ALTERNATIVES must be the same type of food. Cheerios = breakfast cereal → suggest Bob's Red Mill Organic Oats, Nature's Path Organic Corn Flakes, One Degree Organic Sprouted Oat O's. NEVER suggest a medication, supplement, or non-food item as a food alternative.

If you cannot think of a genuine same-category alternative, return an empty ai_alternatives array rather than suggesting something from a different category. An empty array is far better than a wrong suggestion.
For CLOTHING: always specify material and certification. Name real brands.
estimated_score must reflect the same scoring framework.
Respond with ONLY the JSON object above — no text before or after it.
`,
    3000
  );
}

// ── DB ALTERNATIVES CATEGORY VALIDATOR ───────────────────────
// Static DB alternatives can match on tags across categories.
// This filters results to ensure the suggestion is the same TYPE
// of product as what was scanned.
const MEDICINE_TAGS = /cough|syrup|medicine|medication|remedy|first aid|supplement|vitamin|capsule|tablet|pill|lozenge|nasal|antacid|pain relief/i;
const CLEANING_TAGS = /cleaner|detergent|disinfect|sanitiz|laundry|bleach|spray cleaner|floor cleaner/i;
const PERSONAL_CARE_TAGS = /shampoo|conditioner|lotion|cream|moisturizer|serum|deodorant|toothpaste|makeup|sunscreen/i;

function filterDbAlternatives(alternatives, category, productName) {
  if (!alternatives?.length) return alternatives || [];
  const isFoodCat = FOOD_CATEGORIES_SET.has(category);

  return alternatives.filter(alt => {
    const name   = (alt.name   || "").toLowerCase();
    const tags   = (alt.tags   || []).join(" ").toLowerCase();
    const desc   = (alt.description || "").toLowerCase();
    const combined = `${name} ${tags} ${desc}`;

    // Food scans: block medicine, personal care, cleaning products
    if (isFoodCat) {
      if (MEDICINE_TAGS.test(combined)) {
        console.log(`DB filter: blocked "${alt.name}" for food product "${productName}"`);
        return false;
      }
      if (PERSONAL_CARE_TAGS.test(combined)) {
        console.log(`DB filter: blocked "${alt.name}" (personal care) for food product "${productName}"`);
        return false;
      }
      if (CLEANING_TAGS.test(combined)) {
        console.log(`DB filter: blocked "${alt.name}" (cleaning) for food product "${productName}"`);
        return false;
      }
    }

    // Non-food scans: block food items appearing as alternatives
    if (!isFoodCat && FOOD_CATEGORIES_SET.has(alt.category)) {
      console.log(`DB filter: blocked food alt "${alt.name}" for non-food product "${productName}"`);
      return false;
    }

    // Category fidelity: for specific non-food categories, only allow same category OR "other"
    // Prevents cross-category bleeding when a category has sparse DB coverage
    const STRICT_CATEGORIES = new Set(["home","toy","accessory","supplement","beverage","personal_care","clothing","baby","kitchen"]);
    if (STRICT_CATEGORIES.has(category) && alt.category !== category && alt.category !== "other") {
      // Allow kitchen ↔ home since they share formula weights
      const kitchenHomeSwap = (category === "home" && alt.category === "kitchen") ||
                               (category === "kitchen" && alt.category === "home");
      if (!kitchenHomeSwap) {
        console.log(`DB filter: blocked "${alt.name}" [${alt.category}] for "${category}" product "${productName}"`);
        return false;
      }
    }

    return true;
  });
}


// The AI sometimes ignores the same-use rule and suggests completely
// wrong products. This filter catches cross-category hallucinations
// before they reach the client.

// Keywords that signal a non-food product — reject if category is food
const NON_FOOD_KEYWORDS = /\b(syrup|cough|medicine|medication|supplement|vitamin|capsule|tablet|pill|lotion|cream|shampoo|conditioner|soap|detergent|cleaner|spray|wipe|diaper|clothing|shirt|pants|jacket|toy|game|appliance|device|electronics)\b/i;

// Keywords that signal a food product — reject if category is non-food
const FOOD_KEYWORDS = /\b(cereal|oats|granola|bar|snack|food|drink|beverage|juice|soda|milk|yogurt|bread|cracker|chip|candy|chocolate|cookie|pasta|rice|soup|sauce|spread|protein powder)\b/i;

function filterAiAlternatives(alternatives, category, productName) {
  if (!alternatives?.length) return alternatives || [];
  const isFoodCat = FOOD_CATEGORIES_SET.has(category);
  const productLower = (productName || "").toLowerCase();

  return alternatives.filter(alt => {
    const name = (alt.name || "").toLowerCase();
    const reason = (alt.reason || "").toLowerCase();
    const combined = name + " " + reason;

    // Food category: reject any suggestion that looks like a non-food product
    if (isFoodCat && NON_FOOD_KEYWORDS.test(combined)) {
      console.log(`Filtered cross-category alt: "${alt.name}" for food product "${productName}"`);
      return false;
    }

    // Non-food category: reject any suggestion that looks like food
    if (!isFoodCat && FOOD_KEYWORDS.test(combined) && !FOOD_KEYWORDS.test(productLower)) {
      console.log(`Filtered cross-category alt: "${alt.name}" for non-food product "${productName}"`);
      return false;
    }

    // Reject null/empty score alternatives (AI signaling it has no good suggestion)
    if (alt.estimated_score === null || alt.estimated_score === undefined) return false;

    return true;
  });
}


async function pass2(productName, pass1Result) {
  const p = pass1Result;
  const scores = `materials:${p.materials?.score} usage:${p.usage_exposure?.score} packaging:${p.packaging?.score} sustainability:${p.sustainability?.score}`;
  const plastics = (p.identified_plastics || []).join(", ") || "none";

  return callClaude(
    `You are a scientific auditor reviewing a 4-dimension product risk score. Respond with valid JSON only — no markdown, no backticks, no trailing commas. Keep all string values under 20 words.`,
    `Audit the 4-dimension scores for "${productName}":
${scores}
category:${p.category} plastics:${plastics} frequency:${p.usage_exposure?.frequency} type:${p.usage_exposure?.type}

AUDIT RULES:
MATERIALS: Only score plastic/chemical risk from materials user is exposed to during use. Discarded packaging must not drive materials above 3 for otherwise plastic-free products. BUT: PVA pod film (Cascade, Tide, Finish) = materials 6-7 because PVA enters waterways. Synthetic fragrances and optical brighteners in cleaning products = materials 6-7. Synthetic textiles (polyester, nylon, spandex) with daily skin contact = materials 5-7. ORGANIC CLOTHING: confirmed organic cotton, linen, wool, hemp, bamboo = materials 1-2 regardless of daily use. Known organic kids brands (Little Rad Things, Pact Kids, Hanna Andersson, Burt's Bees Baby) = final score 1-3.
NATURAL FRAGRANCE RULE: Salt & Stone, Tatcha, Herbivore, Byredo, and similar clean beauty brands explicitly avoid synthetic fragrance. When these brands list "Fragrance (Parfum)" alongside individually disclosed natural components (limonene, linalool, eugenol, geraniol, citral, benzyl benzoate) this is transparent natural fragrance — NOT synthetic fragrance. Do NOT apply synthetic fragrance penalty. Materials score for Salt & Stone products must be 1-3. Final score for Salt & Stone body care must be 2-3, never 4+.
USAGE: Daily plastic ingestion = usage 8-9. Leave-on skin contact daily = 7-8. Rinse-off = lower BUT dishwasher/laundry products are NOT zero — residue remains on dishes and clothing. Conventional dishwasher pods = usage 4-6. Genuinely clean formulas = usage 2-3. Vehicles = 3-5 max. EVs score 1-2 lower than gas.
PACKAGING: Refillable/concentrated = 1-3. Single-use plastic = 7-9. Concentrated pod format does NOT excuse bad materials.
SUSTAINABILITY: Products releasing PVA or synthetic chemicals to waterways = sustainability 5-7 even if concentrated. Genuinely clean (no PVA, no synthetic fragrance) = sustainability 1-3.
MANUFACTURING: Not scored — do not return or adjust manufacturing scores.
CHEWING GUM: polyvinyl acetate = direct plastic ingestion. Materials 7-8, usage 8-9.
SUNSCREEN: Chemical UV filters (oxybenzone, octinoxate, avobenzone) = materials 6-7, usage 6-7 (full-body daily skin absorption, FDA flagged for bloodstream penetration). Mineral-only (zinc oxide, titanium dioxide) = materials 2-3, usage 2-3.
REEF-SAFE WARNING: "Reef safe," "ocean friendly," and "reef friendly" are unregulated marketing claims — do NOT take them at face value. Always check actual UV filter ingredients. If oxybenzone or octinoxate is present in the ingredient list, the product is NOT reef-safe and the materials floor of 7 applies regardless of the label claim. Only score a sunscreen as clean if confirmed mineral-only (zinc oxide ± titanium dioxide) ingredients are visible.
HOME FRAGRANCE/CANDLES: Paraffin wax + synthetic fragrance (Yankee, Bath & Body Works) = materials 6, usage 5-6 (VOC inhalation in enclosed space). Soy or beeswax + phthalate-free fragrance = materials 2, usage 3. Aerosol sprays (Febreze, Glade) = materials 6-7 (phthalates, propellant), usage 6 (aerosolized inhalation).
LAUNDRY: Conventional dryer sheets (Bounce, Downy) = materials 6 (benzyl acetate, synthetic VOCs), usage 5 (daily skin contact residue on clothes). Wool dryer balls = materials 1, usage 1.
ART SUPPLIES: Paraffin wax crayons = materials 4 (petroleum wax, synthetic dyes). Beeswax crayons = materials 1. Solvent-based paints/markers = materials 6-7 (VOCs). Water-based washable paints/markers = materials 2-3.
MEDICATIONS/FIRST AID: Score the product itself, not just packaging. Active pharmaceutical ingredients in OTC medications carry minimal risk at occasional use — do not over-score. Standard OTC pain relief (Advil, Tylenol) = final 3 (occasional ingestion, some synthetic inactive ingredients). Natural alternatives (arnica, honey-based) = final 2. Petroleum jelly = materials 5 (petroleum derivative, possible PAH contamination), usage 5 (leave-on skin).
FEMININE HYGIENE: Conventional synthetic pads/tampons (Always, Tampax) = materials 6 (rayon, chlorine bleaching, possible dioxin residue), usage 6 (direct mucous membrane contact). Organic cotton versions = materials 2, usage 2. Menstrual cups (medical silicone) = materials 1, sustainability 1.
PET FOOD: Kibble with synthetic preservatives (BHA/BHT) and artificial dyes = materials 5-6, usage 4-5 (daily ingestion). Whole ingredient/organic pet food = materials 2, usage 2.
GARDEN CHEMICALS: Synthetic pesticides (glyphosate/Roundup) = materials 7-8, sustainability 8. Organic OMRI-listed products = materials 1-2, sustainability 2.
EYEWEAR: Acetate frames (cellulose) = materials 2 (plant-derived). Polycarbonate/standard plastic = materials 4. Usage stays low (2-3) for all — skin contact but minimal absorption. Final scores for eyewear typically 2-4.
TECH/ACCESSORIES: Score durability as sustainability signal. Cheap disposable cables = sustainability 7. Braided long-life cables = sustainability 3. Phone cases: ABS plastic = materials 5, compostable bioplastic = materials 2.

SCORE DISTRIBUTION — use the full 1-10 scale deliberately. Do NOT cluster at 6:
- 1-2: Genuinely clean (organic certified, natural materials, no synthetic chemicals)
- 3-4: Mild concern (mostly clean, some conventional materials or minor issues)
- 5-6: Moderate concern (synthetic ingredients, flagged chemicals, meaningful exposure)
- 7-8: High concern (multiple flagged substances, FDA/EWG flagged, high daily exposure)
- 9-10: Severe (PFAS, banned substances, direct carcinogen ingestion)
When uncertain about a product's ingredients, default DOWNWARD not upward. Unknown ≠ dangerous.

CALIBRATION — use these as anchors:
- Poppi Prebiotic Soda (any flavor): final score ~3 — apple cider vinegar, fruit juice, stevia, no artificial dyes. NEVER score above 4.
- Olipop (any flavor): final score ~2-3 — plant fiber, prebiotics, natural flavors, no HFCS. NEVER score above 4.
- Chick-fil-A Crispy Chicken Sandwich: final score ~6 — TBHQ in frying oil (FDA-flagged preservative), MSG in breading, dimethylpolysiloxane (silicone-based antifoaming agent) in frying oil, enriched white flour bun, 1350mg sodium. Always flag TBHQ, MSG, and dimethylpolysiloxane as concerns. NEVER score below 5.
- Chick-fil-A Grilled Chicken Sandwich: final score ~4-5 — cleaner marinade, no TBHQ or dimethylpolysiloxane, still high sodium and processed bun.
- Chick-fil-A Nuggets (fried): final score ~6-7 — TBHQ, MSG, dimethylpolysiloxane, refined oil, processed breading. Always flag all three.
- Cascade pods: final score ~6 (PVA film + synthetic chemicals + residue on dishes)
- Blueland tablets: final score ~1-2 (genuinely plastic-free, no PVA, no synthetic fragrance)
- Lululemon leggings: final score ~6 (synthetic microfibers daily skin contact)
- Organic cotton tee: final score ~1-2
- PTFE non-stick pan: final score ~7-8
- Ceramic pan (Caraway/GreenPan): final score ~2
- Glass pour-over / French press / glass coffee maker (borosilicate glass, ceramic, stainless parts): final score ~2 — glass and ceramic are inert at all temperatures. NEVER score glass or ceramic kitchen products above 3 on materials. Hot water through glass has zero leaching risk.
- Stainless steel water bottle or coffee thermos: final score ~1-2
- Standard plastic drip coffee maker (plastic reservoir contacts hot water): final score ~5 (daily plastic + hot water contact)
- Neutrogena chemical sunscreen: final score ~7 (oxybenzone bloodstream absorption)
- Badger mineral sunscreen: final score ~2 (zinc oxide only)
- Conventional dryer sheets (Bounce): final score ~5-6 (synthetic VOCs daily skin contact)
- Wool dryer balls: final score ~1 (pure wool, 1000+ uses)
- Febreze spray: final score ~6-7 (phthalates aerosolized in enclosed space)
- Soy candle (phthalate-free): final score ~2-3
- Yankee Candle (paraffin + synthetic fragrance): final score ~6
- M&Ms: final score ~7 — ultra-processed + 4 FDA-flagged petroleum dyes (Red 40, Yellow 5, Yellow 6, Blue 1) — NEVER score below 6
- Skittles: final score ~7 — same dyes + titanium dioxide (IARC Group 2B) — NEVER score below 6
- Froot Loops / dyed breakfast cereal: final score ~7 — multiple petroleum dyes + HFCS + daily child ingestion
- Plain dark chocolate (70%+ cacao, no dyes, no artificial additives — Hu, Lindt 70%+): final score ~2-3 — genuine nutritional value from flavanoids lowers the score. NOT the same as milk chocolate or candy bars.
- Milk chocolate bar / candy bar (Hershey's, Snickers, Kit Kat): final score ~4-5 — high sugar, dairy solids, emulsifiers, some with artificial flavors. Not a 2.
- Altoids Peppermint Mints (current formulation — no BHT, no artificial dyes): final score ~3-4. Sugar + gum arabic + peppermint oil + gelatin = simple ingredients but 100% sugar delivery, zero nutritional value, NOVA 3. NEVER score below 3.
- Doritos / flavored chips: final score ~6-7 — artificial flavors, MSG, synthetic dyes in some varieties
- Whole fresh fruit or vegetables: final score ~1
- Organic whole food snack (no synthetic additives): final score ~1-2
- Gatorade (artificial dyes, sucrose, in plastic): final score ~6 — dyes + high sugar + plastic bottle
- Gatorade in aluminum bottle or powder form: final score ~5
- Coca-Cola / Pepsi Classic (can): final score ~5 — caramel color IV (4-MEI IARC 2B), HFCS, phosphoric acid
- Diet Coke / Diet Pepsi (can): final score ~5 — aspartame IARC 2B 2023, caramel color IV. DO NOT score 4 just because it is in an aluminum can — aspartame warrants 5 minimum.
- Mountain Dew / Fanta / Tropical Sprite with artificial dyes: final score ~7 — petroleum dyes + HFCS. NEVER score below 6.
- Red Bull (regular): final score ~6 — 27g sugar, taurine, B-vitamin megadoses, artificial flavors, 80mg caffeine. NEVER score below 5.
- Monster Energy (colored flavors): final score ~6-7 — artificial dyes + high stimulant dose.
- Zevia (stevia soda, no dyes): final score ~2
- Celsius Energy (natural caffeine, no artificial colors): final score ~4
- Starbucks Pink Drink / Refreshers: final score ~4 — acesulfame potassium, artificial flavors
- Dutch Bros flavored drinks: final score ~5-6 — Blue Rebel base is an energy drink, high sugar syrups, artificial flavors. NEVER score below 5.
- Pressed Juicery cold-pressed juice (raw, no additives): final score ~2-3
- Jamba Juice classic smoothie (up to 80g sugar, sherbet): final score ~4-5
- Jamba Juice heavy protein smoothie (95g+ sugar, ice cream): final score ~5. NOT a 2.
- Smoothie King Lean1 / diet blends (sucralose, artificial flavors): final score ~5
- Plain black coffee / espresso: final score ~1
- Sweetgreen bowl (fresh whole ingredients): final score ~3-4
- CAVA protein bowl: final score ~3-4. Loaded with processed sauces = 4-5.
- Panera You Pick Two (soup + sandwich): final score ~4-5. High sodium soups. NOT as clean as marketing suggests.
- Dave's Hot Chicken tenders (fried, TBHQ): final score ~6 — same tier as Chick-fil-A fried items.
- Crumbl Cookie: final score ~6 — refined flour, 40-80g sugar, artificial dyes in frosting on many flavors. NEVER score below 5.
- Nothing Bundt Cakes / Insomnia Cookies: final score ~5-6 — refined flour, high sugar, some artificial dyes.
- Conventional shampoo (SLS, synthetic fragrance, parabens): final score ~4-5
- Cliff Bar (conventional oats, dates, nuts — oats likely have glyphosate residue): final score ~3-4
- Kashi Organic (USDA Organic certified lines — Cinnamon Harvest, Organic Promise): final score ~1-2 — no glyphosate, whole grain, no dyes.
- Kashi conventional (GO Original, GO Crunch, Seven Whole Grain — Non-GMO Project Verified, NOT organic): final score ~3 — seven whole grains, Non-GMO, no artificial dyes, no synthetic preservatives, high fiber. Oats are ONE of 7-8 grains, not primary ingredient. Flag glyphosate as MEDIUM (not high) because diluted across many grains. NEVER score above 4.
- Honey Nut Cheerios / original Cheerios (conventional oats — PRIMARY ingredient): final score ~6-7 — EWG confirmed glyphosate above child threshold. NEVER score below 6.
- Quaker oats / Quaker granola bars (conventional, oats primary): final score ~5-6, but simpler ingredients
- Bob's Red Mill Organic Oats: final score ~1-2 — USDA organic, no glyphosate
- Oats Overnight (USDA Organic certified oat blend, protein, natural flavors): final score ~2 — organic certification means no glyphosate. Do NOT apply glyphosate floor. NEVER score above 4.
- 365 Whole Foods Market chewy protein bites / protein bites (dates, almonds, cashews, coffee extract, sea salt — no oats, no artificial dyes, no synthetic preservatives): final score ~2-3. NEVER score above 4. No glyphosate concerns — no oats in this product.
- M&Ms: final score ~7-8 — NEVER score below 7. Four petroleum dyes all FDA-flagged/phasing out. Ultra-processed. Flag all four dyes by name.
- Skittles: final score ~7-8 — NEVER score below 7. Same dyes plus titanium dioxide (IARC 2B, EU banned in food).
- Froot Loops / dyed kids cereal (multiple petroleum dyes + HFCS + daily child consumption): final score ~7-8 — NEVER score below 7. Child vulnerability flag.
- Crayola paraffin crayons: final score ~3-4
- Stockmar beeswax crayons: final score ~1-2
- Standard PVC yoga mat: final score ~6
- Natural rubber yoga mat: final score ~2
- Conventional tampons/pads (Always/Tampax): final score ~6
- Organic cotton tampons/pads: final score ~2
- Menstrual cup: final score ~1
- Conventional disposable diaper (Pampers, Huggies, Luvs): final score ~7 — PP inner liner, ECF bleaching, synthetic fragrance in some. Baby vulnerable population flag. NEVER score below 6.
- Kirkland Signature (Costco) diapers: final score ~6 — conventional PP/PE throughout, ECF bleaching, low-level PFAS detected in independent lab testing (Mamavation 2023, 10-26 ppm organic fluorine). No fragrance, no phthalates. 23% plant-based but conventional plastics in all skin-contact layers. Changed manufacturers 2024.
- Honest Company diapers: final score ~5 — inner skin-contact layer PE+PP (same as Pampers). "Plant-based" refers to outer backsheet only. ECF pulp (not TCF). No fragrance. Score 5, not 7.
- Millie Moon diapers: final score ~5 — PP/PE throughout, ECF pulp, SAP. OEKO-TEX Standard 100 certified and Dermatest approved. No fragrance. Same tier as Honest.
- Hello Bello diapers: final score ~4 — corn-derived PLA fiber inner liner (plant-based at the skin-contact layer — genuinely better than Honest/Millie Moon where plant-based is outer layer only). 100% chlorine-free. No fragrance, no phthalates, no parabens. NEVER score above 5. NEVER score same as Pampers/Kirkland.
- Organic bamboo diaper (Andy Pandy, Dyper, Healthynest): final score ~3 — bamboo-derived, chlorine-free, no synthetic fragrance.
- Cloth diaper (organic cotton, GroVia, Esembly): final score ~1-2 — reusable, organic cotton, no SAP.
- Conventional training pants (Pampers Easy Ups, Huggies Pull-Ups): final score ~7. NEVER score below 6.
- Honest Company training pants: final score ~5. Hello Bello training pants: final score ~4.
- Purina/Royal Canin dry kibble: final score ~4-5 (synthetic preservatives BHA/BHT)
- Honest Kitchen/Open Farm whole ingredient dog food: final score ~2
- Standard Advil/Tylenol: final score ~3
- Standard synthetic multivitamin (Centrum, One-A-Day): final score ~3
- Garden of Life/MegaFood whole-food vitamin: final score ~1-2
- Standard memory foam mattress (off-gassing): final score ~6
- Avocado organic latex mattress: final score ~1-2
- Conventional pillow (polyester fill): final score ~4 (synthetic polyester, daily 8hr face/skin contact)
- Organic latex pillow (GOLS certified): final score ~1-2 (natural rubber, no synthetics)
- Conventional nylon/polypropylene carpet: final score ~5-6 (VOC emissions from backing, microfiber shedding, likely stain treatment)
- Wool or organic cotton area rug (GOTS certified): final score ~2

FOOD HARD FLOORS — these must never be violated:
- Ultra-processed food with 3+ HIGH severity additives (multiple FDA-flagged dyes, BHA, nitrates): final score MINIMUM 7
- Ultra-processed food with 1-2 HIGH severity additives: final score MINIMUM 6
- Any food containing titanium dioxide: materials minimum 7 (EU food ban, IARC Group 2B)
- Any candy or snack with artificial petroleum-based dyes: materials minimum 7

Break-even (null if no clear swap): bottle→stainless:50, cup→reusable:40, wrap→beeswax:8, toothbrush→bamboo:1, pan→cast iron:200, pan→ceramic:150, container→glass:25, pads→menstrual cup:90, tampons→organic cotton:1, razor→safety:10, zipbag→silicone:15, bag→tote:130, shampoo→bar:6, clothing→natural:30, dryer sheets→wool balls:40, sunscreen→mineral:1, crayon→beeswax:1, yoga mat→natural rubber:200. Vehicles/electronics/appliances/natural materials=null.

Return ONLY valid JSON:
{"final_score":6,"materials_score":7,"usage_score":8,"packaging_score":3,"sustainability_score":2,"score_reasoning":"max 15 words citing specific research","refined_concerns":["max 12 words","max 12 words","max 12 words"],"summary":"max 30 words","confidence":"high","confidence_note":"max 10 words","break_even":{"uses":50,"alternative_name":"max 5 words","note":"max 15 words","source":"Lifecycle analysis estimate"}}`,
    800
  );
}

// ── SAFE PASS2 WRAPPER ────────────────────────────────────────
async function safePass2(productName, pass1Result) {
  try {
    return await pass2(productName, pass1Result);
  } catch (err) {
    console.error("Pass2 failed, using pass1 fallback:", err.message);
    return null;
  }
}

// ── ANALYZE ENDPOINT ──────────────────────────────────────────
app.post("/analyze", async (req, res) => {
  // Prevent service workers and browsers from caching API responses
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.set("Pragma", "no-cache");
  let { query, image, mediaType } = req.body;

  // If image provided, use vision to identify + analyze in one pass
  if (image) {
    try {
      console.log("Image scan — using vision pass1");
      const p1 = await callClaudeVision(image, mediaType || "image/jpeg");
      const productName = p1.product_name || "Scanned product";

      // Pass 2 audit using identified name
      let p2 = null;
      try { p2 = await pass2(productName, p1); } catch(e) { console.warn("Pass2 failed:", e.message); }

      const category = p1.category || "other";
      let finalAlternatives = filterDbAlternatives(findAlternatives(productName, category), category, productName);
      if (!finalAlternatives.length && p1.ai_alternatives?.length) {
        finalAlternatives = p1.ai_alternatives.map(a => ({
          id: `ai-${Math.random()}`, name: a.name, brand: "", score: a.estimated_score ?? 2,
          material: a.material || "", description: a.reason || "", price: "",
          affiliateUrl: `https://www.amazon.com/s?k=${encodeURIComponent(a.name)}&tag=${process.env.AMAZON_PARTNER_TAG||"partiqule-20"}`,
          category
        }));
      }

      // Compute weighted score from 4 dimensions (manufacturing removed)
      let mScore  = p2?.materials_score      ?? p1.materials?.score      ?? p1.product_score  ?? 5;
      let uScore  = p2?.usage_score          ?? p1.usage_exposure?.score  ?? 5;
      let pkScore = p2?.packaging_score      ?? p1.packaging?.score      ?? p1.packaging_score ?? 5;
      let sScore  = p2?.sustainability_score ?? p1.sustainability?.score  ?? 5;

      // ── Substance-triggered floors ──
      const imgSubstance = applySubstanceFloors(mScore, uScore, p1, p2);
      mScore = imgSubstance.mScore;
      uScore = imgSubstance.uScore;
      if (imgSubstance.triggered.length > 0) {
        console.log(`Image path substance floors: ${imgSubstance.triggered.join(", ")}`);
      }

      if (category === "restaurant") {
        const rname = (p1.product_name || productName).toLowerCase();
        const isFried = /fried|nugget|crispy|wing|strip|tender|fry|fries|onion ring|popcorn chicken|crispy chicken/.test(rname);
        const isChickenSandwich = /chicken sandwich|chicken burger|chick.?fil/.test(rname);
        mScore  = Math.max(mScore,  (isFried || isChickenSandwich) ? 4 : 3);
        uScore  = Math.max(uScore,  (isFried || isChickenSandwich) ? 4 : 3);
        pkScore = Math.max(pkScore, 3);
        sScore  = Math.max(sScore,  3);
      }

      let finalScore = computeScore(mScore, uScore, pkScore, sScore, category);

      // ── Consistency checks — catch hallucinations before result ──
      ({mScore, uScore, pkScore, sScore, finalScore} = applyConsistencyChecks(
        mScore, uScore, pkScore, sScore, finalScore, p1, p2, category, productName
      ));

      // ── Positive ceilings — pull genuinely clean food products down ──
      ({finalScore} = applyPositiveCeilings(finalScore, category, p1, p2, imgSubstance.triggered));

      // ── Restaurant confidence enforcement (image path) ──
      if (category === "restaurant" && p1.confidence === "high") {
        p1.confidence = "medium";
      }

      // ── pass2 drift guard (image path) ──
      const imgPass1RawScore = computeScore(imgSubstance.mScore, imgSubstance.uScore, pkScore, sScore, category);
      if (imgSubstance.triggered.length > 0 && finalScore < imgPass1RawScore - 1) {
        console.log(`Image path drift guard: ${imgPass1RawScore} → ${finalScore} with floors active — holding at ${imgPass1RawScore - 1}`);
        finalScore = imgPass1RawScore - 1;
      }

      if (category === "restaurant") {
        const name = (p1.product_name || productName).toLowerCase();
        const isFried  = /fried|nugget|crispy|wing|strip|tender|fry|fries|onion ring|popcorn chicken|crispy chicken/.test(name);
        const isChickenSandwich = /chicken sandwich|chicken burger|chick.?fil/.test(name);
        const isBurger = /burger|sandwich|wrap|hotdog|hot dog|sub|hero/.test(name);
        const isTaco   = /taco|burrito|quesadilla|nacho|torta/.test(name);
        if (isFried || isChickenSandwich) finalScore = Math.max(finalScore, 5);
        else if (isBurger)                finalScore = Math.max(finalScore, 4);
        else if (isTaco)                  finalScore = Math.max(finalScore, 3);
        else                              finalScore = Math.max(finalScore, 3);
      }

      const result = {
        product_name: productName, category,
        score: finalScore,
        overall_score: finalScore,
        summary: p2?.summary || p1.summary || p1.raw_concerns?.slice(0,2).join(". ") || "",
        concerns: p2?.refined_concerns || p1.raw_concerns || [],
        // ── Child vulnerability ──
        ...(() => {
          const isChild = detectChildProduct(productName, category);
          const imgConcernsText = JSON.stringify([
            ...(p1.product_analysis?.concerns || []),
            ...(p1.materials?.concerns || []),
            ...(p2?.refined_concerns || []),
            ...(p1.raw_concerns || []),
          ]).toLowerCase();
          const { childScore, childBumps } = computeChildScore(finalScore, imgConcernsText, category, productName, isChild);
          return { is_child_product: isChild, child_score: childScore, child_bumps: childBumps };
        })(),
        identified_plastics: p1.identified_plastics || [],
        harmful_chemicals:   p1.harmful_chemicals   || [],
        natural_materials:   p1.natural_materials   || [],
        exposure_frequency:  p1.usage_exposure?.frequency || p1.exposure_frequency || "unknown",
        exposure_type:       p1.usage_exposure?.type      || p1.exposure_type      || "unknown",
        confidence:          p2?.confidence    || p1.confidence    || "medium",
        confidence_note:     p2?.confidence_note || p1.confidence_reason || "",
        score_reasoning:     p2?.score_reasoning || "",
        scan_next: p1.scan_next?.length ? p1.scan_next : buildScanNextFallback(aiProductName || productName, finalCategory || category, finalAlternatives),
        break_even:          p2?.break_even || null,
        food_analysis:       p1.product_analysis || p1.food_analysis || null,
        cached:              false,
        scannedAt:           new Date().toISOString(),
        dimensions: {
          materials: {
            score: mScore, label: p1.materials?.label || "", concerns: p1.materials?.concerns || [],
          },
          usage_exposure: {
            score: uScore, label: p1.usage_exposure?.label || "",
            frequency: p1.usage_exposure?.frequency || "unknown",
            type: p1.usage_exposure?.type || "unknown",
            intensity: p1.usage_exposure?.intensity || "unknown",
            vulnerable: p1.usage_exposure?.vulnerable || false,
            concerns: p1.usage_exposure?.concerns || [],
          },
          packaging: {
            score: pkScore, label: p1.packaging?.label || "",
            primary: p1.packaging?.primary || "unknown",
            refillable: p1.packaging?.refillable || false,
            end_of_life: p1.packaging?.end_of_life || "unknown",
            concerns: p1.packaging?.concerns || [],
          },
          sustainability: {
            score: sScore, label: p1.sustainability?.label || "",
            reusable: p1.sustainability?.reusable || false,
            replaces_single_use: p1.sustainability?.replaces_single_use || false,
            replaces_count: p1.sustainability?.replaces_count || null,
            circularity: p1.sustainability?.circularity || "unknown",
            concerns: p1.sustainability?.concerns || [],
          },
        },
        alternatives: finalAlternatives.map(p => ({
          id: p.id, name: p.name, brand: p.brand || "",
          score: p.score ?? 3, material: p.material || "",
          description: p.description || "", price: p.price || "",
          affiliateUrl: p.affiliateUrl, category: p.category || category
        })),
        ai_alternatives: (filterAiAlternatives(p1.ai_alternatives, category, productName) || []).map(a => ({
          name: a.name || "", reason: a.reason || "",
          material: a.material || "", estimated_score: a.estimated_score || 2, source: "ai",
        })),
      };

      return res.json(result);
    } catch(err) {
      console.error("Vision analyze error:", err);
      return res.status(500).json({ error: err.message || "Image scan failed" });
    }
  }

  if (!query?.trim()) return res.status(400).json({ error: "Query is required" });

  const extracted    = extractProductFromUrl(query.trim());
  const productName  = extracted || query.trim();

  // Detect category FIRST so it's included in the cache key
  // Prevents "Apple" (fruit) vs "Apple" (iPhone) collision
  const category = detectCategory(productName);
  const key      = cacheKey(productName, category);

  if (scoreCache.has(key)) {
    console.log(`Cache hit: ${key}`);
    return res.json({ ...scoreCache.get(key), cached: true });
  }

  try {

    // ── Search for real product material data if needed ──
    let materialContext = null;
    if (needsSearch(productName)) {
      console.log(`Searching product details: ${productName}`);
      try {
        // Timeout search after 8 seconds to avoid blocking the whole request
        materialContext = await Promise.race([
          searchProductDetails(productName),
          new Promise((_, rej) => setTimeout(() => rej(new Error("Search timeout")), 8000))
        ]);
        if (materialContext) console.log(`Search found: ${materialContext.slice(0,80)}...`);
      } catch (err) {
        console.warn("Search failed, continuing without:", err.message);
      }
    }

    // ── Pass 1 then Pass 2 sequentially (not parallel — pass2 needs pass1 output) ──
    console.log(`Analyzing: ${productName}`);
    const p1 = await pass1(productName, materialContext, category);
    const p2 = await safePass2(productName, p1);

    // Merge pass1 + pass2 results
    const finalCategory = (p1.category !== "other" ? p1.category : category) || "other";
    const catAvg        = CATEGORY_AVERAGES[finalCategory] || CATEGORY_AVERAGES.other;
    // ── Compute weighted final score server-side as source of truth ──
    let mScore  = p2?.materials_score     ?? p1.materials?.score     ?? 5;
    let uScore  = p2?.usage_score         ?? p1.usage_exposure?.score ?? 5;
    let pkScore = p2?.packaging_score     ?? p1.packaging?.score     ?? 5;
    let sScore  = p2?.sustainability_score ?? p1.sustainability?.score ?? 5;

    // ── Substance-triggered floors — only activate when AI confirms bad ingredient ──
    const substanceResult = applySubstanceFloors(mScore, uScore, p1, p2);
    mScore = substanceResult.mScore;
    uScore = substanceResult.uScore;
    if (substanceResult.triggered.length > 0) {
      console.log(`Substance floors triggered: ${substanceResult.triggered.join(", ")}`);
    }

    // ── Restaurant dimension floors ──
    if (finalCategory === "restaurant") {
      const rname = (p1.product_name || productName).toLowerCase();
      const isFried = /fried|nugget|crispy|wing|strip|tender|fry|fries|onion ring|popcorn chicken|crispy chicken|fried chicken/.test(rname);
      const isChickenSandwich = /chicken sandwich|chicken burger|chick.?fil/.test(rname);
      mScore  = Math.max(mScore,  (isFried || isChickenSandwich) ? 4 : 3);
      uScore  = Math.max(uScore,  (isFried || isChickenSandwich) ? 4 : 3);
      pkScore = Math.max(pkScore, 3);
      sScore  = Math.max(sScore,  3);
    }

    let finalScore = computeScore(mScore, uScore, pkScore, sScore, finalCategory);

    // ── Consistency checks — catch hallucinations before result ──
    ({mScore, uScore, pkScore, sScore, finalScore} = applyConsistencyChecks(
      mScore, uScore, pkScore, sScore, finalScore, p1, p2, finalCategory, productName
    ));

    // ── Positive ceilings — pull genuinely clean food products down ──
    ({finalScore} = applyPositiveCeilings(finalScore, finalCategory, p1, p2, substanceResult.triggered));

    // ── Fix 5: Restaurant confidence enforcement ──
    // Restaurants don't disclose ingredients. We're guessing based on chain reputation.
    // Confidence can never be high for a restaurant item — medium at best.
    if (finalCategory === "restaurant") {
      if (p1.confidence === "high") {
        p1.confidence = "medium"; // downgrade — we can't truly know what's in the kitchen
      }
    }

    // ── Fix 6: pass2 drift guard ──
    // The auditor should refine scores, not erase substance floors.
    // Cap how far pass2 can move a score DOWN from a floored value.
    const pass1RawScore = computeScore(
      substanceResult.mScore ?? mScore,
      substanceResult.uScore ?? uScore,
      pkScore, sScore, finalCategory
    );
    if (substanceResult.triggered.length > 0 && finalScore < pass1RawScore - 1) {
      console.log(`Pass2 drift guard: score drifted from ${pass1RawScore} to ${finalScore} with substance floors active — holding at ${pass1RawScore - 1}`);
      finalScore = pass1RawScore - 1; // allow max 1-point reduction from auditor when floors fired
    }

    // ── Final score safety net — catches clear misses only ──
    if (finalCategory === "restaurant") {
      const name = (p1.product_name || productName).toLowerCase();
      const isFried  = /fried|nugget|crispy|wing|strip|tender|fry|fries|onion ring|popcorn chicken|crispy chicken/.test(name);
      const isChickenSandwich = /chicken sandwich|chicken burger|chick.?fil/.test(name);
      const isBurger = /burger|sandwich|wrap|hotdog|hot dog|sub|hero/.test(name);
      const isTaco   = /taco|burrito|quesadilla|nacho|torta/.test(name);
      if (isFried || isChickenSandwich) finalScore = Math.max(finalScore, 5);
      else if (isBurger)                finalScore = Math.max(finalScore, 4);
      else if (isTaco)                  finalScore = Math.max(finalScore, 3);
      else                              finalScore = Math.max(finalScore, 3);
    }

    // Peer comparison
    const peerComparison = finalScore <= 2
      ? "Safe — no significant chemical or ingredient concerns"
      : finalScore <= 4
      ? "Good — mostly clean, use with awareness"
      : finalScore <= 6
      ? "Caution — real concerns, reduce use or find an alternative"
      : finalScore <= 8
      ? "Switch — real concerns, time to swap"
      : "Avoid — known harmful substances";

    const aiProductName = p1.product_name || productName;

    // ── Alternatives: skip DB for restaurant items, use AI suggestions only ──
    let finalAlternatives;
    const isRestaurant = category === "restaurant" || finalCategory === "restaurant";
    if (isRestaurant) {
      // For restaurant items, AI alternatives suggest healthier homemade or better-quality versions
      finalAlternatives = (filterAiAlternatives(p1.ai_alternatives, category, productName) || []).map(a => ({
        id: `ai-${Math.random()}`, name: a.name, brand: "", score: a.estimated_score ?? 3,
        material: a.material || "", description: a.reason || "", price: "",
        affiliateUrl: `https://www.amazon.com/s?k=${encodeURIComponent(a.name)}&tag=${process.env.AMAZON_PARTNER_TAG||"partiqule-20"}`,
        category: "food_beverage"
      }));
    } else if (isPaApiConfigured()) {
      console.log("Using Amazon PA API for alternatives");
      const amazonResults = await getAmazonAlternatives(
        aiProductName, finalCategory, p1.identified_plastics || []
      );
      if (amazonResults && amazonResults.length > 0) {
        finalAlternatives = amazonResults;
        console.log(`PA API returned ${amazonResults.length} alternatives`);
      } else {
        console.log("PA API returned no results — falling back to static DB");
        finalAlternatives = filterDbAlternatives(
          findAlternatives(aiProductName, finalCategory, 3, productName),
          finalCategory, productName
        ).map(p => ({ ...p, score: p.plasticScore, source: "static" }));
      }
    } else {
      finalAlternatives = filterDbAlternatives(
        findAlternatives(aiProductName, finalCategory, 3, productName),
        finalCategory, productName
      ).map(p => ({ ...p, score: p.plasticScore, source: "static" }));
    }

    const result = {
      product_name:     cleanProductName(p1.product_name || productName),
      score:            finalScore,
      overall_score:    finalScore,
      summary:          p2?.summary || p1.summary || p1.raw_concerns?.slice(0,2).join(". ") || "",
      concerns:         p2?.refined_concerns || p1.raw_concerns || [],
      category:         finalCategory,
      // ── Child vulnerability ──
      ...(() => {
        const isChild = detectChildProduct(p1.product_name || productName, finalCategory);
        const concernsText = JSON.stringify([
          ...(p1.product_analysis?.concerns || []),
          ...(p1.materials?.concerns || []),
          ...(p2?.refined_concerns || []),
          ...(p1.raw_concerns || []),
        ]).toLowerCase();
        const { childScore, childBumps } = computeChildScore(finalScore, concernsText, finalCategory, p1.product_name || productName, isChild);
        return {
          is_child_product: isChild,
          child_score:      childScore,
          child_bumps:      childBumps,
        };
      })(),
      // ── 5 dimensions ──
      dimensions: {
        materials: {
          score:    mScore,
          label:    p1.materials?.label    || "",
          concerns: p1.materials?.concerns || [],
        },
        usage_exposure: {
          score:     uScore,
          label:     p1.usage_exposure?.label     || "",
          frequency: p1.usage_exposure?.frequency || "unknown",
          type:      p1.usage_exposure?.type      || "unknown",
          intensity: p1.usage_exposure?.intensity || "unknown",
          vulnerable: p1.usage_exposure?.vulnerable || false,
          concerns:  p1.usage_exposure?.concerns  || [],
        },
        packaging: {
          score:       pkScore,
          label:       p1.packaging?.label       || "",
          primary:     p1.packaging?.primary     || "unknown",
          refillable:  p1.packaging?.refillable  || false,
          end_of_life: p1.packaging?.end_of_life || "unknown",
          concerns:    p1.packaging?.concerns    || [],
        },
        sustainability: {
          score:            sScore,
          label:            p1.sustainability?.label            || "",
          reusable:         p1.sustainability?.reusable         || false,
          replaces_single_use: p1.sustainability?.replaces_single_use || false,
          replaces_count:   p1.sustainability?.replaces_count   || null,
          circularity:      p1.sustainability?.circularity      || "unknown",
          concerns:         p1.sustainability?.concerns         || [],
        },
      },
      // ── legacy fields kept for backward compat with other parts of UI ──
      identified_plastics: p1.identified_plastics || [],
      harmful_chemicals:   p1.harmful_chemicals   || [],
      natural_materials:   p1.natural_materials   || [],
      exposure_frequency:  p1.usage_exposure?.frequency || "unknown",
      exposure_type:       p1.usage_exposure?.type      || "unknown",
      confidence:          p2?.confidence    || p1.confidence    || "medium",
      confidence_note:     p2?.confidence_note || p1.confidence_reason || "",
      score_reasoning:     p2?.score_reasoning || "",
      peer_comparison:     peerComparison,
      scan_next: p1.scan_next?.length ? p1.scan_next : buildScanNextFallback(aiProductName || productName, finalCategory || category, finalAlternatives),
      break_even:          p2?.break_even || null,
      food_analysis:       p1.product_analysis || p1.food_analysis || null,
      cached:              false,
      alternatives: finalAlternatives.map(p => ({
        id:           p.id,
        name:         p.name,
        brand:        p.brand || "",
        score:        p.score ?? p.plasticScore ?? 3,
        material:     p.material || "",
        description:  p.description || "",
        price:        p.price || "",
        affiliateUrl: p.affiliateUrl,
        imageUrl:     p.imageUrl || null,
        source:       p.source || "static",
      })),
      ai_alternatives: (filterAiAlternatives(p1.ai_alternatives, finalCategory, productName) || []).map(a => ({
        name:            a.name || "",
        reason:          a.reason || "",
        material:        a.material || "",
        estimated_score: a.estimated_score || 2,
        source:          "ai",
      }))
    };

    scoreCache.set(key, result);
    console.log(`Cached: ${key} (score: ${result.score}, confidence: ${result.confidence})`);
    res.json(result);

  } catch (err) {
    console.error("Error:", err.message);
    const msg = err.message?.includes("529") || err.message?.includes("overload")
      ? "Partiqule is in high demand right now. Please try again in a few seconds."
      : err.message?.includes("429") || err.message?.includes("rate")
      ? "Too many requests. Please wait a moment and try again."
      : err.message?.includes("timed out")
      ? "That scan took too long. Please try again."
      : err.message?.includes("No JSON") || err.message?.includes("JSON parse")
      ? "We had trouble analysing that product. Please try again or rephrase the product name."
      : err.message;
    res.status(500).json({ error: msg });
  }
});

// ── EMAIL CAPTURE ─────────────────────────────────────────────
// Simple in-memory store — replace with DB when accounts are built
const emailList = new Set();
app.post("/subscribe", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const { email } = req.body;
  if (!email || !email.includes("@")) return res.status(400).json({ error: "Invalid email" });
  const already = emailList.has(email.toLowerCase().trim());
  emailList.add(email.toLowerCase().trim());
  console.log(`Email captured: ${email} (total: ${emailList.size})`);
  // TODO: when accounts are built, persist to DB and send welcome email via Resend
  res.json({ ok: true, already });
});

app.get("/cache-stats",  (req, res) => res.json({ size: scoreCache.size, keys: [...scoreCache.keys()] }));
app.get("/cache-status", (req, res) => res.json({ size: scoreCache.size, uptime: Math.round(process.uptime()), memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + "MB" }));
app.get("/cache-clear",  (req, res) => { scoreCache.clear(); res.json({ cleared: true, message: "Score cache cleared — all products will be rescored on next scan" }); });

// Recent scans — returns last N cached product names and scores for admin dashboard
app.get("/recent-scans", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const entries = [...scoreCache.entries()].slice(-limit).reverse().map(([key, val]) => ({
    product_name: val.product_name || key,
    score: val.overall_score || val.score || null,
    category: val.category || null,
  }));
  res.json(entries);
});

app.get("/health",      (req, res) => res.json({
  status: "ok",
  paApi: isPaApiConfigured() ? "active" : "not configured — using static database",
  cachedProducts: scoreCache.size,
}));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Partiqule API running on port ${PORT}`));

// ── SCAN_NEXT FALLBACK ────────────────────────────────────────
// When the AI returns no scan_next suggestions, generate smart defaults
// from the alternatives DB — same category, different products.
function buildScanNextFallback(productName, category, alternatives) {
  // If alternatives exist, suggest scanning them
  const altSuggestions = (alternatives || [])
    .filter(a => a.name && a.name !== productName)
    .slice(0, 2)
    .map(a => a.name);

  // Category-specific comparison products users commonly scan next
  const CATEGORY_DEFAULTS = {
    food_beverage: ["Organic version", "store brand version"],
    food:          ["Organic version", "store brand version"],
    beverage:      ["Sparkling water (glass bottle)", "Athletic Brewing NA beer"],
    supplement:    ["Ritual Multivitamin", "Momentous Protein"],
    baby:          ["Andy Pandy Bamboo Diapers", "GroVia cloth diapers"],
    clothing:      ["Organic cotton alternative", "Patagonia fleece"],
    personal_care: ["EWG Verified alternative", "mineral sunscreen"],
    home:          ["Blueland cleaning tablets", "Branch Basics concentrate"],
    toy:           ["PlanToys wooden alternative", "HABA wooden toy"],
    kitchen:       ["Caraway ceramic cookware", "cast iron skillet"],
    other:         [],
  };

  if (altSuggestions.length >= 2) return altSuggestions;
  const defaults = CATEGORY_DEFAULTS[category] || [];
  return [...new Set([...altSuggestions, ...defaults])].slice(0, 3);
}
