/**
 * calibration.js — Partiqule Product Calibration Registry
 *
 * PURPOSE: Deterministic score enforcement for known products.
 * When a product matches an entry here, floor/ceiling are applied in CODE
 * after AI scoring — the AI cannot override these.
 *
 * HOW IT WORKS:
 *   1. Product name is normalised (lowercase, trim, collapse spaces)
 *   2. Exact match attempted first
 *   3. If no exact match, partial match on key terms
 *   4. floor/ceiling applied to final score before response ships
 *
 * CONFIDENCE LEVELS:
 *   "high"   — formula confirmed, floor/ceiling enforced hard
 *   "medium" — formula likely current, ±1 tolerance applied
 *   "low"    — directional only, logged but not enforced
 *
 * MAINTENANCE:
 *   - Review flagged overrides in Railway logs weekly
 *   - When a product reformulates, update entry or drop to "medium"
 *   - Add new entries from scan volume signals in admin dashboard
 */

"use strict";

// ─── NORMALISE ────────────────────────────────────────────────
function normalise(str) {
  return (str || "")
    .toLowerCase()
    .trim()
    .replace(/[®™©]/g, "")
    // Hyphens treated as whitespace so branded spellings like "Play-Doh",
    // "Pop-Tarts", "Scotch-Brite", "Kool-Aid" match calibration keys that
    // were authored with plain spaces. Applied before whitespace collapse
    // so the subsequent \s+ dedupe catches any doubled spaces.
    .replace(/-+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/['']/g, "'");
}

// ─── REGISTRY ─────────────────────────────────────────────────
// [ normalisedKey, { floor, ceiling, substances, reason, confidence, category } ]
const ENTRIES = [

  // ══════════════════════════════════════════════════════════════
  // FOOD — CEREALS AND GRAINS
  // ══════════════════════════════════════════════════════════════
  // ── KEY SODAS AND DRINKS (calibration entries with nutrition baked in) ───
  ["gatorade",                    { floor:5, ceiling:6, kidsFloor:7, kidsCeiling:9, nutrition:{sugar_g:34, sodium_mg:270, sat_fat_g:0, calories:140}, substances:["HFCS or sucrose","artificial color","34g sugar per 20oz"], reason:"Gatorade — 34g sugar per 20oz = 68% adult DV, 136% children's DV. Artificial colors in some flavors. Sugar floor fires on beverage thresholds.", confidence:"high", category:"beverage" }],
  ["gatorade thirst quencher",    { floor:5, ceiling:6, kidsFloor:7, kidsCeiling:9, nutrition:{sugar_g:34, sodium_mg:270, sat_fat_g:0, calories:140}, substances:["34g sugar","artificial color"], reason:"Gatorade Thirst Quencher — 34g sugar per 20oz.", confidence:"high", category:"beverage" }],
  ["coke",                        { floor:5, ceiling:7, kidsFloor:8, kidsCeiling:9, nutrition:{sugar_g:39, sodium_mg:45, sat_fat_g:0, calories:140}, substances:["HFCS or sucrose","caramel color","phosphoric acid","39g sugar"], reason:"Coca-Cola — 39g sugar per 12oz can = 78% adult DV, 156% kids DV. Caramel color Class IV (4-MeI). Ultra-processed beverage.", confidence:"high", category:"beverage" }],
  ["pepsi",                       { floor:5, ceiling:7, kidsFloor:8, kidsCeiling:9, nutrition:{sugar_g:41, sodium_mg:30, sat_fat_g:0, calories:150}, substances:["HFCS or sucrose","caramel color","41g sugar"], reason:"Pepsi — 41g sugar per 12oz = 82% adult DV, 164% kids DV. Caramel color. Ultra-processed.", confidence:"high", category:"beverage" }],
  ["pepsi cola",                   { floor:5, ceiling:7, kidsFloor:8, kidsCeiling:9, substances:["HFCS or sucrose","caramel color","41g sugar"], reason:"Pepsi Cola — same as Pepsi. 41g sugar per 12oz.", confidence:"high", category:"beverage" }],
  ["dr pepper",                   { floor:5, ceiling:7, kidsFloor:8, kidsCeiling:9, nutrition:{sugar_g:40, sodium_mg:55, sat_fat_g:0, calories:150}, substances:["HFCS or sucrose","caramel color","40g sugar"], reason:"Dr Pepper — 40g sugar per 12oz = 80% adult DV. Caramel color.", confidence:"high", category:"beverage" }],
  ["sprite",                      { floor:5, ceiling:7, kidsFloor:8, kidsCeiling:9, nutrition:{sugar_g:38, sodium_mg:65, sat_fat_g:0, calories:140}, substances:["HFCS or sucrose","38g sugar"], reason:"Sprite — 38g sugar per 12oz = 76% adult DV, 152% kids DV.", confidence:"high", category:"beverage" }],
  ["powerade",                    { floor:5, ceiling:6, kidsFloor:7, kidsCeiling:9, nutrition:{sugar_g:34, sodium_mg:150, sat_fat_g:0, calories:130}, substances:["34g sugar","HFCS"], reason:"Powerade — 34g sugar per 20oz. HFCS. Similar concern to Gatorade.", confidence:"high", category:"beverage" }],
  ["chocolate milk",              { floor:3, ceiling:5, kidsFloor:5, kidsCeiling:7, nutrition:{sugar_g:25, sodium_mg:180, sat_fat_g:2.5, calories:200, protein_g:8}, substances:["25g sugar","HFCS in some","artificial flavor"], reason:"Chocolate milk — 25g sugar per 8oz (including added sugar). Protein positive. 100% kids DV sugar in one cup.", confidence:"medium", category:"beverage" }],
  ["lemonade",                    { floor:4, ceiling:6, kidsFloor:6, kidsCeiling:8, nutrition:{sugar_g:28, sodium_mg:15, sat_fat_g:0, calories:120}, substances:["28g sugar","HFCS or corn syrup"], reason:"Commercial lemonade — 28g sugar per 8oz. Most commercial versions use HFCS.", confidence:"medium", category:"beverage" }],
  ["honey nut cheerios",           { floor:6, ceiling:8, substances:["glyphosate","added sugar"], reason:"Primary conventional oat with EWG-confirmed glyphosate above child threshold + 12g added sugar", confidence:"high", category:"food_beverage" }],
  ["cheerios honey nut",           { floor:6, ceiling:8, substances:["glyphosate","added sugar"], reason:"Primary conventional oat — EWG confirmed glyphosate above child threshold", confidence:"high", category:"food_beverage" }],
  ["cheerios",                      { floor:6, ceiling:8, substances:["glyphosate"], reason:"Cheerios — conventional oat with EWG-confirmed glyphosate above child threshold. Variants with honey/sugar score higher.", confidence:"high", category:"food_beverage" }],
  ["original cheerios",            { floor:6, ceiling:8, substances:["glyphosate"], reason:"Primary conventional oat — EWG confirmed glyphosate above child threshold", confidence:"high", category:"food_beverage" }],
  ["cheerios original",            { floor:6, ceiling:8, substances:["glyphosate"], reason:"Primary conventional oat — EWG confirmed", confidence:"high", category:"food_beverage" }],
  ["quaker oats",                  { floor:5, ceiling:7, substances:["glyphosate"], reason:"Primary conventional oat — EWG confirmed glyphosate residue", confidence:"high", category:"food_beverage" }],
  ["quaker instant oatmeal",       { floor:5, ceiling:7, substances:["glyphosate"], reason:"Primary conventional oat — EWG confirmed glyphosate", confidence:"high", category:"food_beverage" }],
  ["nature valley granola bar",    { floor:5, ceiling:7, substances:["glyphosate"], reason:"Primary conventional oat — EWG confirmed glyphosate above child threshold", confidence:"high", category:"food_beverage" }],
  ["froot loops",                  { floor:7, ceiling:9, substances:["Red 40","Yellow 5","Blue 1","HFCS"], reason:"Multiple FDA-phasing-out petroleum dyes + HFCS + daily child consumption", confidence:"high", category:"food_beverage" }],
  ["lucky charms",                 { floor:7, ceiling:9, substances:["Red 40","Yellow 5","Yellow 6","Blue 1"], reason:"Multiple petroleum dyes + HFCS + daily child consumption", confidence:"high", category:"food_beverage" }],
  ["frosted flakes",               { floor:5, ceiling:7, substances:["HFCS","added sugar"], reason:"HFCS + high sugar + NOVA 4 conventional cereal", confidence:"high", category:"food_beverage" }],
  ["cap'n crunch",                 { floor:6, ceiling:8, substances:["Yellow 5","Yellow 6","HFCS"], reason:"Petroleum dyes + HFCS + daily child consumption", confidence:"high", category:"food_beverage" }],
  ["captain crunch",               { floor:6, ceiling:8, substances:["Yellow 5","Yellow 6","HFCS"], reason:"Petroleum dyes + HFCS + daily child consumption", confidence:"high", category:"food_beverage" }],
  ["kashi go",                     { floor:2, ceiling:4, substances:[], reason:"Non-GMO Project Verified, 7+ whole grains, no artificial dyes, no synthetic preservatives", confidence:"high", category:"food_beverage" }],
  ["ezekiel",                { floor:1, ceiling:3, substances:[], reason:"Sprouted grain, NOVA 1, minimal ingredients, no additives", confidence:"high", category:"food_beverage" }],
  ["wonder",                 { floor:4, ceiling:6, substances:["HFCS","DATEM","SSL"], reason:"HFCS + synthetic dough conditioners + enriched flour + NOVA 4", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // FOOD — CANDY AND CONFECTIONS
  // ══════════════════════════════════════════════════════════════
  ["m&ms",                         { floor:7, ceiling:9, kidsFloor:8, kidsCeiling:9, nutrition:{sugar_g:31, sodium_mg:30, sat_fat_g:5, calories:230}, substances:["Red 40","Yellow 5","Yellow 6","Blue 1"], reason:"M&Ms — four FDA-phasing-out petroleum dyes + 31g sugar per serving (62% adult DV, 124% kids DV). Floor 7 adult, 8 kids.", confidence:"high", category:"food_beverage" }],
  ["m&m",                          { floor:7, ceiling:9, kidsFloor:8, kidsCeiling:9, nutrition:{sugar_g:31, sodium_mg:30, sat_fat_g:5, calories:230}, substances:["Red 40","Yellow 5","Yellow 6","Blue 1"], reason:"M&M — four petroleum dyes + 31g sugar.", confidence:"high", category:"food_beverage" }],
  ["skittles",                     { floor:7, ceiling:9, substances:["Red 40","Yellow 5","Blue 1","titanium dioxide"], reason:"Multiple petroleum dyes + titanium dioxide IARC 2B", confidence:"high", category:"food_beverage" }],
  ["sour patch kids",              { floor:6, ceiling:8, substances:["Red 40","Yellow 5","Blue 1","HFCS"], reason:"HFCS + three petroleum dyes confirmed", confidence:"high", category:"food_beverage" }],
  ["starburst",                    { floor:6, ceiling:8, substances:["Red 40","Yellow 5","Yellow 6","HFCS"], reason:"HFCS + petroleum dyes + hydrogenated palm kernel oil", confidence:"high", category:"food_beverage" }],
  ["jolly rancher",                { floor:6, ceiling:8, substances:["HFCS","artificial dyes"], reason:"HFCS + artificial dyes confirmed", confidence:"high", category:"food_beverage" }],
  ["airheads",                     { floor:7, ceiling:9, substances:["HFCS","artificial dyes","titanium dioxide"], reason:"HFCS + dyes + titanium dioxide IARC 2B", confidence:"high", category:"food_beverage" }],
  ["reese's peanut butter cup",    { floor:5, ceiling:7, substances:["HFCS","PGPR"], reason:"HFCS + PGPR cocoa butter replacer + artificial flavors + NOVA 4", confidence:"high", category:"food_beverage" }],
  ["reese's",                      { floor:5, ceiling:7, substances:["HFCS","PGPR"], reason:"HFCS + PGPR + artificial flavors", confidence:"high", category:"food_beverage" }],
  ["snickers",                     { floor:5, ceiling:7, substances:["HFCS","PGPR"], reason:"HFCS + corn syrup + PGPR + artificial flavors", confidence:"high", category:"food_beverage" }],
  ["twix",                         { floor:5, ceiling:7, substances:["HFCS","PGPR"], reason:"HFCS + enriched flour + PGPR + artificial flavors", confidence:"high", category:"food_beverage" }],
  ["kit kat",                      { floor:5, ceiling:7, substances:["HFCS","PGPR"], reason:"US formula: HFCS + PGPR + enriched flour", confidence:"medium", category:"food_beverage" }],
  ["milky way",                    { floor:5, ceiling:7, substances:["HFCS","PGPR"], reason:"HFCS + corn syrup + hydrogenated palm oil", confidence:"high", category:"food_beverage" }],
  ["swedish fish",                 { floor:5, ceiling:7, substances:["HFCS","artificial dyes"], reason:"HFCS + artificial red dye", confidence:"high", category:"food_beverage" }],
  ["hershey's milk chocolate",     { floor:5, ceiling:7, substances:["HFCS","PGPR"], reason:"HFCS + PGPR replaces cocoa butter + artificial flavor — budget chocolate", confidence:"high", category:"food_beverage" }],
  ["hershey's kisses",             { floor:5, ceiling:7, substances:["HFCS","PGPR"], reason:"Same as Hershey's bar formula", confidence:"high", category:"food_beverage" }],
  ["nutella",                      { floor:5, ceiling:7, substances:["palm oil","added sugar"], reason:"57% sugar by weight + palm oil + NOVA 4 — primarily a sugar product not a nut product", confidence:"high", category:"food_beverage" }],
  ["oreo cookies",                 { floor:5, ceiling:7, substances:["HFCS","palm oil"], reason:"HFCS + palm oil + artificial flavors + NOVA 4", confidence:"high", category:"food_beverage" }],
  ["pop-tarts",                    { floor:6, ceiling:8, substances:["HFCS","TBHQ","artificial dyes"], reason:"HFCS + TBHQ preservative + artificial dyes — TBHQ floor fires", confidence:"high", category:"food_beverage" }],
  ["twinkies",                     { floor:5, ceiling:7, substances:["HFCS","polysorbate 60"], reason:"HFCS + 27 industrial ingredients", confidence:"high", category:"food_beverage" }],
  ["little debbie swiss rolls",    { floor:5, ceiling:7, substances:["HFCS","corn syrup"], reason:"HFCS + corn syrup + 20+ additives + NOVA 4", confidence:"high", category:"food_beverage" }],
  ["cosmic brownies",              { floor:6, ceiling:8, substances:["HFCS","artificial dyes"], reason:"HFCS + petroleum dyes in candy coating", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // FOOD — SNACKS AND CRACKERS
  // ══════════════════════════════════════════════════════════════
  ["cheez-its",                    { floor:5, ceiling:7, substances:["TBHQ"], reason:"TBHQ preservative confirmed — TBHQ floor fires (mFloor:6)", confidence:"high", category:"food_beverage" }],
  ["cheez it",                     { floor:5, ceiling:7, substances:["TBHQ"], reason:"TBHQ preservative — floor fires", confidence:"high", category:"food_beverage" }],
  ["wheat thins",                  { floor:4, ceiling:6, substances:["HFCS","BHT"], reason:"HFCS + BHT preservative — BHT floor fires", confidence:"high", category:"food_beverage" }],
  ["ritz",                { floor:5, ceiling:7, substances:["partially hydrogenated oil","HFCS","BHT"], reason:"Ritz — partially hydrogenated oil (trans fat floor fires) + HFCS + BHT. One of the most widely eaten crackers with a serious concern profile.", confidence:"high", category:"food_beverage" }],
  // (goldfish crackers calibration lives at the dedicated entry below — bare "goldfish" brand-prefix removed)
  ["triscuit",                     { floor:1, ceiling:3, substances:[], reason:"Whole grain wheat + oil + salt — 3 clean ingredients", confidence:"high", category:"food_beverage" }],
  ["skinnypop",                    { floor:1, ceiling:3, substances:[], reason:"Popcorn + sunflower oil + salt — 3 clean ingredients", confidence:"high", category:"food_beverage" }],
  ["skinny pop",                   { floor:1, ceiling:3, substances:[], reason:"3 clean ingredients", confidence:"high", category:"food_beverage" }],
  ["smartfood popcorn",            { floor:3, ceiling:5, substances:["natural flavors"], reason:"Cheddar + popcorn + oil + natural flavors — NOVA 3", confidence:"high", category:"food_beverage" }],
  ["simple mills",                 { floor:1, ceiling:3, substances:[], reason:"Almond flour, clean ingredients, no synthetic additives", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // FOOD — NUT BUTTERS
  // ══════════════════════════════════════════════════════════════
  ["skippy peanut butter",         { floor:4, ceiling:6, substances:["palm oil","HFCS"], reason:"HFCS + hydrogenated vegetable oil + palm oil + NOVA 4", confidence:"high", category:"food_beverage" }],
  ["jif peanut butter",            { floor:4, ceiling:6, substances:["palm oil"], reason:"Palm oil + sugar + mono-diglycerides + NOVA 4", confidence:"high", category:"food_beverage" }],
  ["justin's almond butter",       { floor:2, ceiling:4, substances:["palm oil"], reason:"Palm oil added — deforestation concern; dry roasted almonds", confidence:"high", category:"food_beverage" }],
  ["smucker's natural peanut butter", { floor:1, ceiling:3, substances:[], reason:"Peanuts + salt only — 2 ingredients", confidence:"high", category:"food_beverage" }],
  ["once again organic",           { floor:1, ceiling:2, substances:[], reason:"USDA Organic peanuts + salt — cleanest mainstream nut butter", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // FOOD — PACKAGED MEALS
  // ══════════════════════════════════════════════════════════════
  ["kraft mac",                    { floor:4, ceiling:6, substances:["enriched flour","sodium phosphate"], reason:"Enriched flour + processed cheese powder + sodium phosphate + NOVA 4", confidence:"high", category:"food_beverage" }],
  ["kraft macaroni",               { floor:4, ceiling:6, substances:["enriched flour"], reason:"Enriched flour + processed cheese powder + NOVA 4", confidence:"high", category:"food_beverage" }],
  ["velveeta",                     { floor:5, ceiling:7, substances:["sodium phosphate","sodium alginate"], reason:"Pasteurized process cheese product — not real cheese; sodium phosphate + sodium alginate + artificial color", confidence:"high", category:"food_beverage" }],
  ["annie's organic mac",          { floor:2, ceiling:4, substances:[], reason:"USDA Organic, real cheddar, organic pasta", confidence:"high", category:"food_beverage" }],
  ["campbell's chunky",            { floor:4, ceiling:6, substances:["sodium","natural flavors"], reason:"890mg+ sodium per serving + modified starch + yeast extract (hidden MSG)", confidence:"high", category:"food_beverage" }],
  ["maruchan ramen",               { floor:6, ceiling:8, substances:["TBHQ","MSG"], reason:"TBHQ floor fires + 1800mg sodium per package + MSG + artificial flavors", confidence:"high", category:"food_beverage" }],
  ["top ramen",                    { floor:6, ceiling:8, substances:["TBHQ","MSG"], reason:"TBHQ + extreme sodium + MSG + NOVA 4", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // FOOD — CONDIMENTS AND DRESSINGS
  // ══════════════════════════════════════════════════════════════
  ["heinz ketchup",                { floor:3, ceiling:5, substances:["HFCS"], reason:"HFCS in original formula — check Heinz Simply (no HFCS = 2)", confidence:"medium", category:"food_beverage" }],
  ["hidden valley ranch",          { floor:4, ceiling:6, substances:["EDTA","soybean oil"], reason:"Soybean oil + calcium disodium EDTA + artificial flavors + modified starch", confidence:"high", category:"food_beverage" }],
  ["primal kitchen",               { floor:1, ceiling:3, substances:[], reason:"Avocado oil base + no EDTA + no soybean oil + clean ingredients", confidence:"high", category:"food_beverage" }],
  ["tessemae's",                   { floor:1, ceiling:3, substances:[], reason:"USDA Organic in some lines, clean oils, no additives", confidence:"high", category:"food_beverage" }],
  ["ken's steakhouse",             { floor:4, ceiling:6, substances:["EDTA","soybean oil"], reason:"Soybean oil + calcium disodium EDTA + artificial flavors", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // BEVERAGES — SODAS
  // ══════════════════════════════════════════════════════════════
  ["coca-cola",                    { floor:5, ceiling:7, kidsFloor:8, kidsCeiling:9, substances:["caramel color IV","HFCS"], reason:"Coca-Cola — HFCS + caramel color IV (4-MEI IARC 2B) + phosphoric acid. 39g sugar per 12oz.", confidence:"high", category:"beverage" }],
  ["coke classic",                 { floor:5, ceiling:7, kidsFloor:8, kidsCeiling:9, substances:["caramel color IV","HFCS"], reason:"Coke Classic — HFCS + caramel color IV. Same as Coca-Cola.", confidence:"high", category:"beverage" }],
  ["diet coke",                    { floor:5, ceiling:7, kidsFloor:7, kidsCeiling:9, substances:["aspartame","caramel color IV"], reason:"Diet Coke — aspartame IARC 2B (2023) + caramel color IV. Zero sugar but artificial sweetener concern.", confidence:"high", category:"beverage" }],
  ["mountain dew",                 { floor:6, ceiling:8, substances:["Yellow 5","HFCS"], reason:"Yellow 5 petroleum dye + HFCS — dye floor fires", confidence:"high", category:"beverage" }],
  ["zevia",                        { floor:1, ceiling:3, substances:[], reason:"Stevia only — no artificial dyes, no HFCS, no aspartame", confidence:"high", category:"beverage" }],
  ["olipop",                       { floor:2, ceiling:4, substances:[], reason:"Plant fiber + prebiotics + natural flavors — no HFCS, no artificial dyes", confidence:"high", category:"beverage" }],
  ["poppi",                        { floor:2, ceiling:4, substances:[], reason:"Apple cider vinegar + fruit juice + stevia — no artificial dyes, no HFCS", confidence:"high", category:"beverage" }],

  // ══════════════════════════════════════════════════════════════
  // BEVERAGES — ENERGY DRINKS
  // ══════════════════════════════════════════════════════════════
  ["red bull",                     { floor:5, ceiling:7, substances:["taurine","B-vitamin megadose"], reason:"NOVA 4 stimulant formulation: 27g sugar + taurine + B-vitamin megadoses + 80mg caffeine", confidence:"high", category:"beverage" }],
  ["monster energy",               { floor:5, ceiling:8, substances:["artificial dyes","caffeine"], reason:"Artificial dyes in colored flavors + 160mg caffeine + 27g sugar", confidence:"high", category:"beverage" }],
  ["celsius energy",               { floor:3, ceiling:5, kidsFloor:6, kidsCeiling:8, substances:["sucralose"], reason:"Sucralose floor fires + 200mg caffeine — no artificial colors", confidence:"high", category:"beverage" }],
  ["bang energy",                  { floor:5, ceiling:7, kidsFloor:6, kidsCeiling:8, substances:["sucralose","acesulfame potassium"], reason:"300mg caffeine + sucralose + acesulfame-K + artificial flavors", confidence:"high", category:"beverage" }],

  // ══════════════════════════════════════════════════════════════
  // BEVERAGES — JUICES AND DRINKS
  // ══════════════════════════════════════════════════════════════
  ["naked juice",                  { floor:6, ceiling:7, substances:["extreme natural sugar","53g+ per bottle"], reason:"53g+ natural sugar per bottle — 106%+ adult DV, 212%+ kids DV. Natural origin does not change glycemic impact.", confidence:"high", kidsFloor:7, category:"beverage" }],
  ["odwalla",                      { floor:5, ceiling:7, substances:["extreme natural sugar"], reason:"High natural sugar (~50g per bottle) + pasteurized. Natural origin does not change glycemic impact.", confidence:"high", kidsFloor:7, category:"beverage" }],
  ["hi-c fruit punch",             { floor:6, ceiling:8, substances:["Red 40","Blue 1","HFCS"], reason:"HFCS + Red 40 + Blue 1 — daily children's drink with petroleum dyes — child vulnerability flag", confidence:"high", category:"beverage" }],
  ["hawaiian punch",               { floor:6, ceiling:8, substances:["Red 40","HFCS"], reason:"HFCS + Red 40 — child daily drink — petroleum dye floor fires", confidence:"high", category:"beverage" }],
  ["kool-aid jammers",             { floor:6, ceiling:8, substances:["HFCS","artificial dyes"], reason:"HFCS + multiple petroleum dyes — child daily drink — child vulnerability", confidence:"high", category:"beverage" }],
  ["capri sun",                    { floor:4, ceiling:6, substances:["HFCS","16g sugar"], reason:"HFCS in original flavors — 16g sugar per pouch = 64% kids DV. Heavily marketed to children.", confidence:"medium", kidsFloor:5, category:"beverage" }],
  ["snapple peach tea",            { floor:5, ceiling:6, substances:["HFCS","37g sugar"], reason:"HFCS + 37g sugar (74% adult daily limit, 148% kids daily limit)", confidence:"high", kidsFloor:6, category:"beverage" }],
  ["arizona iced tea",             { floor:4, ceiling:6, substances:["HFCS"], reason:"HFCS — most flavors", confidence:"high", category:"beverage" }],
  ["lipton brisk",                 { floor:4, ceiling:6, substances:["HFCS"], reason:"HFCS sweetened", confidence:"high", category:"beverage" }],
  ["minute maid lemonade",         { floor:4, ceiling:6, substances:["HFCS","28g sugar"], reason:"HFCS + 28g sugar (56% adult DV, 112% kids DV)", confidence:"high", kidsFloor:6, category:"beverage" }],
  ["sunny d",                      { floor:5, ceiling:7, substances:["HFCS","artificial dyes"], reason:"HFCS + artificial dyes + 5% juice — juice impostor", confidence:"high", category:"beverage" }],
  ["pure leaf unsweetened",        { floor:1, ceiling:2, substances:[], reason:"Tea + water — zero sweetener, zero additives", confidence:"high", category:"beverage" }],
  ["honest tea",                   { floor:1, ceiling:3, substances:[], reason:"USDA Organic, fair trade, 10g natural sugar — genuinely clean", confidence:"high", category:"beverage" }],
  ["lmnt",                         { floor:1, ceiling:3, substances:[], reason:"Sodium + potassium + magnesium + natural flavors — no sweeteners, no additives", confidence:"high", category:"beverage" }],
  ["liquid iv",                    { floor:3, ceiling:5, kidsFloor:6, kidsCeiling:8, substances:["sucralose"], reason:"Sucralose floor fires + B-vitamin megadose stack — not clean despite marketing", confidence:"high", category:"beverage" }],
  ["pedialyte",                    { floor:4, ceiling:6, kidsFloor:6, kidsCeiling:8, substances:["sucralose","acesulfame potassium"], reason:"Two artificial sweeteners + artificial colors in some flavors", confidence:"high", category:"beverage" }],
  ["athletic brewing",             { floor:1, ceiling:3, substances:[], reason:"Non-alcoholic craft beer — clean grain ingredients, no ethanol", confidence:"high", category:"beverage" }],

  // ══════════════════════════════════════════════════════════════
  // BEVERAGES — SMOOTHIES AND COFFEE
  // ══════════════════════════════════════════════════════════════
  ["pressed juicery",              { floor:1, ceiling:3, substances:[], reason:"Raw cold-pressed juice — minimal ingredients, no additives", confidence:"high", category:"beverage" }],
  ["jamba juice",                  { floor:3, ceiling:6, substances:["added sugar"], reason:"Classic = 4-5 (sherbet + high sugar). Heavy protein = 5+ (95g+ sugar). Range varies by order.", confidence:"medium", category:"restaurant" }],
  ["smoothie king",                { floor:4, ceiling:6, kidsFloor:6, kidsCeiling:8, substances:["sucralose"], reason:"Diet blends: sucralose + acesulfame-K. Hulk series: high calorie/sugar. Rarely clean.", confidence:"medium", category:"restaurant" }],
  ["dutch bros",                   { floor:4, ceiling:7, substances:["artificial flavors","Blue Rebel"], reason:"Blue Rebel base is an energy drink. All flavored drinks = high sugar syrups + artificial flavors. NEVER below 5 for flavored.", confidence:"high", category:"restaurant" }],

  // ══════════════════════════════════════════════════════════════
  // FOOD — PROTEIN BARS
  // ══════════════════════════════════════════════════════════════
  ["larabar",                      { floor:1, ceiling:3, substances:[], reason:"Dates + nuts — 2-6 whole food ingredients, NOVA 1, no sweeteners", confidence:"high", category:"food_beverage" }],
  ["rxbar",                        { floor:1, ceiling:3, substances:[], reason:"Egg whites + dates + nuts — whole food NOVA 1 formula", confidence:"high", category:"food_beverage" }],
  ["rx bar",                       { floor:1, ceiling:3, substances:[], reason:"Whole food ingredients — NOVA 1", confidence:"high", category:"food_beverage" }],
  ["gomacro",                      { floor:1, ceiling:3, substances:[], reason:"USDA Organic, whole food ingredients", confidence:"high", category:"food_beverage" }],
  ["perfect bar",                  { floor:2, ceiling:4, substances:[], reason:"Peanut butter + honey + nonfat milk — refrigerated, whole food base", confidence:"high", category:"food_beverage" }],
  ["quest bar",                    { floor:4, ceiling:6, kidsFloor:6, kidsCeiling:8, substances:["sucralose","palm kernel oil"], reason:"Sucralose + protein isolate + palm kernel oil + NOVA 4 — not clean", confidence:"high", category:"food_beverage" }],
  ["david protein bar",            { floor:5, ceiling:6, kidsFloor:6, kidsCeiling:8, substances:["sucralose","acesulfame potassium","artificial flavor","maltitol","EPG modified plant fat"], reason:"David Protein Bar — milk protein isolate, whey, collagen. Binding system uses maltitol (sugar alcohol, GI effects), sucralose + acesulfame-K for sweetness, artificial flavors, and EPG (modified plant fat, novel ingredient with limited long-term data). No artificial dyes. High protein density is a positive. Score reflects additive load, not protein quality.", confidence:"high", category:"supplement" }],
  ["david bar",                    { floor:5, ceiling:6, kidsFloor:6, kidsCeiling:8, substances:["sucralose","acesulfame potassium","artificial flavor","maltitol"], reason:"David Bar — sucralose + ace-K + maltitol + artificial flavors. Novel EPG fat system. Clean protein sources but synthetic additive load prevents clean score.", confidence:"high", category:"supplement" }],
  ["david protein",                { floor:5, ceiling:6, kidsFloor:6, kidsCeiling:8, substances:["sucralose","acesulfame potassium","artificial flavor","maltitol"], reason:"David Protein — sucralose + acesulfame-K + maltitol + artificial flavors. Full ingredient list publicly available.", confidence:"high", category:"supplement" }],
  ["david peanut",                 { floor:5, ceiling:6, kidsFloor:6, kidsCeiling:8, substances:["sucralose","acesulfame potassium","artificial flavor","maltitol"], reason:"David Peanut Butter bar — sucralose + ace-K + maltitol + artificial flavors + EPG fat. Confirmed ingredient list from davidprotein.com.", confidence:"high", category:"supplement" }],
  ["david chocolate",              { floor:5, ceiling:6, kidsFloor:6, kidsCeiling:8, substances:["sucralose","acesulfame potassium","artificial flavor","maltitol"], reason:"David Chocolate bar — sucralose + ace-K + maltitol + artificial flavors. Same formulation platform as other David bars.", confidence:"high", category:"supplement" }],
  ["david fudge",                  { floor:5, ceiling:6, kidsFloor:6, kidsCeiling:8, substances:["sucralose","acesulfame potassium","artificial flavor","maltitol"], reason:"David Fudge Brownie bar — sucralose + ace-K + maltitol + artificial flavors.", confidence:"high", category:"supplement" }],
  ["one bar",                      { floor:4, ceiling:6, kidsFloor:6, kidsCeiling:8, substances:["sucralose","erythritol"], reason:"Sucralose + erythritol + protein isolate + NOVA 4", confidence:"high", category:"food_beverage" }],
  ["built bar",                    { floor:4, ceiling:6, kidsFloor:6, kidsCeiling:8, substances:["sucralose","erythritol","carrageenan"], reason:"Sucralose + erythritol + carrageenan — multiple floors fire", confidence:"high", category:"food_beverage" }],
  ["kind bar",                     { floor:2, ceiling:4, substances:[], reason:"Nuts + honey — no sucralose, no dyes, relatively clean", confidence:"high", category:"food_beverage" }],
  ["clif bar",                     { floor:3, ceiling:5, substances:["conventional oats"], reason:"Conventional oats (glyphosate concern) + brown rice syrup + natural flavors + NOVA 3", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // FOOD — FROZEN DESSERTS
  // ══════════════════════════════════════════════════════════════
  ["haagen-dazs",                  { floor:2, ceiling:4, substances:[], reason:"Cream + milk + sugar + eggs + flavoring — simple, no carrageenan, no artificial additives", confidence:"high", category:"food_beverage" }],
  ["alden's organic",              { floor:1, ceiling:3, substances:[], reason:"USDA Organic, simple ingredients", confidence:"high", category:"food_beverage" }],
  ["halo top",                     { floor:4, ceiling:6, kidsFloor:6, kidsCeiling:8, substances:["sucralose","erythritol","chicory root"], reason:"Sucralose floor fires + NOVA 4 engineered formulation — not cleaner than real ice cream", confidence:"high", category:"food_beverage" }],
  ["arctic zero",                  { floor:4, ceiling:6, kidsFloor:6, kidsCeiling:8, substances:["sucralose","chicory root"], reason:"Sucralose + chicory root + NOVA 4 — sucralose floor fires", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // FOOD — DAIRY AND PLANT MILKS
  // ══════════════════════════════════════════════════════════════
  ["oatly original",               { floor:3, ceiling:5, substances:["rapeseed oil","dipotassium phosphate"], reason:"Rapeseed oil + dipotassium phosphate + 7 additives — NOT same as 2-ingredient plant milk", confidence:"high", category:"beverage" }],
  ["oatly barista",                { floor:3, ceiling:5, substances:["rapeseed oil"], reason:"Rapeseed oil + additives — heavily processed oat milk", confidence:"high", category:"beverage" }],
  ["elmhurst unsweetened",         { floor:1, ceiling:2, substances:[], reason:"Oat/nut + water only — 2 ingredients, cleanest plant milk", confidence:"high", category:"beverage" }],
  ["silk almond",                  { floor:3, ceiling:5, substances:["carrageenan"], reason:"Carrageenan floor fires in some variants + sunflower oil + additives", confidence:"medium", category:"beverage" }],
  ["fairlife",                     { floor:2, ceiling:4, substances:[], reason:"Ultra-filtered milk — NOVA 3 processing but no synthetic additives", confidence:"high", category:"beverage" }],
  ["organic valley",               { floor:1, ceiling:2, substances:[], reason:"USDA Organic milk — simple, clean", confidence:"high", category:"beverage" }],
  ["kraft singles",                { floor:4, ceiling:6, substances:["sodium phosphate","sodium citrate"], reason:"Pasteurized process cheese product — not real cheese. Sodium phosphate + citrate + artificial color", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // FOOD — BREAKFAST
  // ══════════════════════════════════════════════════════════════
  ["eggo",                         { floor:5, ceiling:7, substances:["TBHQ","HFCS","artificial flavor"], reason:"Eggo Waffles — TBHQ preservative + HFCS + artificial flavor. Common children's breakfast. TBHQ floor fires.", confidence:"high", category:"food_beverage" }],
  ["log cabin",              { floor:5, ceiling:7, substances:["HFCS","caramel color","artificial flavor"], reason:"Log Cabin — HFCS + caramel color IV + artificial maple flavor. Contains no real maple syrup.", confidence:"high", category:"food_beverage" }],
  ["aunt jemima",                  { floor:4, ceiling:6, substances:["HFCS","caramel color"], reason:"HFCS + artificial maple flavor — now Pearl Milling Company", confidence:"high", category:"food_beverage" }],
  ["pearl milling",                { floor:4, ceiling:6, substances:["HFCS"], reason:"HFCS + artificial maple flavor", confidence:"high", category:"food_beverage" }],
  ["yoplait original",             { floor:4, ceiling:6, substances:["HFCS"], reason:"US formula uses HFCS — not same as Stonyfield or Chobani plain", confidence:"medium", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // PERSONAL CARE — SUNSCREEN
  // ══════════════════════════════════════════════════════════════
  ["neutrogena ultra sheer",       { floor:6, ceiling:8, substances:["oxybenzone","octinoxate"], reason:"Oxybenzone detected in bloodstream after single application (Matta JAMA 2019)", confidence:"high", category:"personal_care" }],
  ["badger",             { floor:1, ceiling:2, substances:[], reason:"Badger Balm — zinc oxide only, organic ingredients, no chemical UV filters. Benchmark cleanest sunscreen. NEVER score above 3.", confidence:"high", category:"personal_care" }],
  ["think sport sunscreen",        { floor:1, ceiling:3, substances:[], reason:"Zinc oxide only — mineral, sport certified", confidence:"high", category:"personal_care" }],
  ["raw elements sunscreen",       { floor:1, ceiling:3, substances:[], reason:"Non-nano zinc oxide, organic — cleanest sport sunscreen", confidence:"high", category:"personal_care" }],

  // ══════════════════════════════════════════════════════════════
  // PERSONAL CARE — SHAMPOO AND HAIR
  // ══════════════════════════════════════════════════════════════
  ["pantene pro-v",                { floor:5, ceiling:7, substances:["DMDM hydantoin","synthetic fragrance"], reason:"DMDM hydantoin formaldehyde releaser — floor fires (mFloor:6) + SLS + synthetic fragrance", confidence:"high", category:"personal_care" }],
  // (pantene shampoo calibration lives at the dedicated entry below — bare "pantene" brand-prefix removed)
  ["tresemme",                     { floor:5, ceiling:7, substances:["DMDM hydantoin","synthetic fragrance"], reason:"DMDM hydantoin in most formulas + SLS + synthetic fragrance — floor fires", confidence:"high", category:"personal_care" }],
  ["head & shoulders",             { floor:4, ceiling:6, substances:["SLS","synthetic fragrance"], reason:"SLS + zinc pyrithione + synthetic fragrance + parabens in some", confidence:"high", category:"personal_care" }],
  ["olaplex no.4",                 { floor:1, ceiling:3, substances:[], reason:"No SLS, no DMDM, no parabens, no synthetic fragrance — benchmark clean shampoo", confidence:"high", category:"personal_care" }],
  ["olaplex shampoo",              { floor:1, ceiling:3, substances:[], reason:"No SLS, no DMDM, no parabens", confidence:"high", category:"personal_care" }],
  ["briogeo",                      { floor:1, ceiling:3, substances:[], reason:"EWG Verified some lines, no SLS, no DMDM", confidence:"high", category:"personal_care" }],

  // ══════════════════════════════════════════════════════════════
  // PERSONAL CARE — DEODORANT
  // ══════════════════════════════════════════════════════════════
  // (native deodorant calibration lives at the dedicated entry below — bare "native" brand-prefix removed)
  ["certain dri",                  { floor:5, ceiling:7, substances:["aluminum chloride"], reason:"20%+ aluminum chloride — highest aluminum concentration in OTC antiperspirant", confidence:"high", category:"personal_care" }],

  // ══════════════════════════════════════════════════════════════
  // PERSONAL CARE — TOOTHPASTE
  // ══════════════════════════════════════════════════════════════
  ["colgate total",                { floor:4, ceiling:6, substances:["SLS","titanium dioxide","saccharin"], reason:"SLS + titanium dioxide IARC 2B + saccharin + artificial flavor", confidence:"high", category:"personal_care" }],
  ["crest toothpaste",             { floor:4, ceiling:6, substances:["SLS","titanium dioxide","synthetic dyes"], reason:"Crest — SLS + titanium dioxide (IARC 2B) + Blue 1 dye in many varieties. Switch to Bite, RiseWell, or Burt's Bees for clean toothpaste.", confidence:"high", category:"personal_care" }],
  ["crest whitestrips",            { floor:4, ceiling:6, substances:["hydrogen peroxide","PEG","carbomer"], reason:"Crest 3D White Whitestrips — hydrogen peroxide (up to 6.5%) on polyethylene strip. Approved for OTC use, but daily exposure can cause enamel demineralization and gum irritation. Different chemistry from Crest toothpaste — no SLS, no titanium dioxide. Limit to recommended treatment cycles, not daily indefinite use.", confidence:"high", category:"personal_care" }],
  ["crest 3d white",               { floor:4, ceiling:6, substances:["SLS","titanium dioxide","hydrogen peroxide","Blue 1"], reason:"Crest 3D White — SLS + titanium dioxide + hydrogen peroxide + Blue 1 petroleum dye. Whitening chemicals + colorants.", confidence:"high", category:"personal_care" }],
  ["crest whitening",              { floor:4, ceiling:6, substances:["SLS","titanium dioxide"], reason:"SLS + titanium dioxide IARC 2B + saccharin", confidence:"high", category:"personal_care" }],
  ["victoria secret pink",         { floor:5, ceiling:7, substances:["nylon","spandex","synthetic fragrance","synthetic dyes","formaldehyde"], reason:"VS Pink — same materials as Victoria's Secret. Younger-targeted but identical formaldehyde + synthetic fragrance concerns.", confidence:"high", category:"clothing" }],
  // (sensodyne toothpaste calibration lives at the dedicated entry below — bare "sensodyne" brand-prefix removed)
  ["sensodyne mouthwash",          { floor:3, ceiling:5, substances:["alcohol","artificial color","saccharin or sucralose"], reason:"Sensodyne mouthwash — alcohol-based, potassium nitrate for sensitivity, plus artificial colors and sweeteners. Daily use disrupts oral microbiome and dries tissue.", confidence:"medium", category:"personal_care" }],
  ["hello toothpaste",             { floor:1, ceiling:3, substances:[], reason:"SLS-free, no artificial sweeteners, no titanium dioxide", confidence:"high", category:"personal_care" }],
  ["hello kids toothpaste",        { floor:1, ceiling:3, substances:[], reason:"Hello kids toothpaste — SLS-free, fluoride-free options, no artificial sweeteners, xylitol/sorbitol-sweetened. Clean kids oral care tier.", confidence:"high", category:"personal_care" }],
  ["hello fluoride free toothpaste",{ floor:1, ceiling:3, substances:[], reason:"Hello Fluoride-Free Toothpaste — sorbitol/xylitol sweeteners, hydrated silica, no SLS, no artificial dyes. Clean for parents who prefer fluoride-free.", confidence:"high", category:"personal_care" }],
  ["hello fluoride free",           { floor:1, ceiling:3, substances:[], reason:"Hello fluoride-free oral care line — clean ingredient profile across kids and adult formulas. SLS-free, no artificial sweeteners.", confidence:"high", category:"personal_care" }],
  ["naturally friendly hello",     { floor:1, ceiling:3, substances:[], reason:"Hello Naturally Friendly line — Hello brand kid-targeted toothpaste. SLS-free, fluoride-free, xylitol-sweetened. Clean kids oral care.", confidence:"high", category:"personal_care" }],
  ["bite toothpaste",              { floor:1, ceiling:2, substances:[], reason:"Tablet format, no SLS, minimal ingredients — cleanest mainstream option", confidence:"high", category:"personal_care" }],
  ["tom's of maine",               { floor:3, ceiling:5, substances:["SLS"], reason:"Still contains SLS in most lines despite natural marketing — owned by Colgate", confidence:"high", category:"personal_care" }],

  // ══════════════════════════════════════════════════════════════
  // PERSONAL CARE — MOISTURIZER AND SKIN CARE
  // ══════════════════════════════════════════════════════════════
  ["cetaphil",                     { floor:4, ceiling:6, substances:["parabens","propylene glycol","synthetic fragrance"], reason:"Parabens + propylene glycol + synthetic fragrance — 'dermatologist recommended' is not a safety signal", confidence:"high", category:"personal_care" }],
  ["vanicream",                    { floor:1, ceiling:3, substances:[], reason:"No dyes, no fragrance, no parabens, no formaldehyde releasers — genuinely clean", confidence:"high", category:"personal_care" }],
  ["aveeno daily moisturizing",    { floor:3, ceiling:5, substances:["synthetic fragrance"], reason:"Synthetic fragrance + dimethicone + benzalkonium chloride in some", confidence:"high", category:"personal_care" }],

  // ══════════════════════════════════════════════════════════════
  // PERSONAL CARE — MAKEUP
  // ══════════════════════════════════════════════════════════════
  ["ilia foundation",              { floor:1, ceiling:3, substances:[], reason:"Organic ingredients, no synthetic fragrance, mineral SPF — EWG top-rated", confidence:"high", category:"personal_care" }],
  ["ilia beauty",                  { floor:1, ceiling:3, substances:[], reason:"Clean makeup benchmark — EWG Verified lines", confidence:"high", category:"personal_care" }],
  ["jones road",                   { floor:1, ceiling:3, substances:[], reason:"Bobbi Brown's clean line — no synthetic fragrance, minimal ingredients", confidence:"high", category:"personal_care" }],
  ["rms beauty",                   { floor:1, ceiling:3, substances:[], reason:"Organic raw ingredients, no synthetic fragrance", confidence:"high", category:"personal_care" }],
  ["maybelline great lash",        { floor:5, ceiling:7, substances:["quaternium-15"], reason:"Quaternium-15 formaldehyde releaser in original formula — floor fires (mFloor:6)", confidence:"high", category:"personal_care" }],
  ["burts bees lip balm",          { floor:1, ceiling:2, substances:[], reason:"Beeswax + vitamin E — no synthetic fragrance, no parabens", confidence:"high", category:"personal_care" }],
  ["burt's bees lip",              { floor:1, ceiling:2, substances:[], reason:"Beeswax + natural ingredients — benchmark clean lip care", confidence:"high", category:"personal_care" }],
  ["burts bees tinted lip",        { floor:1, ceiling:2, substances:[], reason:"Beeswax + plant oils + carmine/iron oxide colors — no petroleum dyes, no synthetic fragrance", confidence:"high", category:"personal_care" }],
  ["burts bees tinted lip balm",   { floor:1, ceiling:2, substances:[], reason:"Beeswax + coconut oil + olive oil + natural colorants — no petroleum dyes, no parabens. Ingredients verified 04 2026", confidence:"high", category:"personal_care" }],
  // Brand-level fallback — any Burt's Bees lip product variant (chapstick,
  // balm, stick, tinted, moisturizing lip oil, etc.) scores 1-2. Burt's Bees
  // maintains a consistent clean formulation standard across their lip line.
  // Positioned AFTER the more specific entries above so Map iteration order
  // gives the specific variant's reason when it matches first.
  ["burts bees lip",               { floor:1, ceiling:2, substances:[], reason:"Beeswax-based formulation, no synthetic fragrance, no parabens — Burt's Bees lip line benchmark", confidence:"high", category:"personal_care" }],
  ["chapstick classic",            { floor:3, ceiling:5, substances:["BHT","synthetic fragrance"], reason:"BHT preservative + synthetic fragrance — BHT floor fires", confidence:"high", category:"personal_care" }],

  // ══════════════════════════════════════════════════════════════
  // PERSONAL CARE — BODY WASH AND SOAP
  // ══════════════════════════════════════════════════════════════
  ["dr. bronner's",                { floor:1, ceiling:2, substances:[], reason:"Saponified organic oils + essential oils — organic, fair trade, benchmark clean", confidence:"high", category:"personal_care" }],
  ["dr bronner's",                 { floor:1, ceiling:2, substances:[], reason:"Saponified organic oils — benchmark clean soap", confidence:"high", category:"personal_care" }],
  ["dial complete antibacterial",  { floor:5, ceiling:7, substances:["benzalkonium chloride","synthetic fragrance"], reason:"Benzalkonium chloride is an EPA-registered pesticide — disrupts skin microbiome", confidence:"high", category:"personal_care" }],

  // ══════════════════════════════════════════════════════════════
  // SUPPLEMENTS — VITAMINS
  // ══════════════════════════════════════════════════════════════
  ["centrum silver",               { floor:6, ceiling:8, substances:["Blue 1","talc","titanium dioxide"], reason:"FD&C Blue 1 petroleum dye (FDA phasing out) + talc (IARC Group 2A) + titanium dioxide (IARC Group 2B)", confidence:"high", category:"supplement" }],
  ["centrum multivitamin",         { floor:5, ceiling:7, substances:["Blue 1","talc"], reason:"Petroleum dye + talc + NOVA 4 synthetic vitamin formulation", confidence:"high", category:"supplement" }],
  ["flintstones complete",         { floor:7, ceiling:9, substances:["Red 40","Yellow 6","Blue 1","talc","titanium dioxide"], reason:"THREE petroleum dyes FDA is actively phasing out + talc + TiO2 — daily child consumption — HIGHEST PRIORITY", confidence:"high", category:"supplement" }],
  ["flintstones vitamins",         { floor:7, ceiling:9, substances:["Red 40","Yellow 6","Blue 1"], reason:"Three petroleum dyes in daily children's vitamin — child vulnerability flag", confidence:"high", category:"supplement" }],
  ["flintstones gummies",          { floor:7, ceiling:9, substances:["Red 40","Yellow 6","Blue 1","HFCS"], reason:"Three petroleum dyes + HFCS in daily children's vitamin — child vulnerability flag", confidence:"high", category:"supplement" }],
  ["vitafusion gummy vitamins",    { floor:6, ceiling:8, substances:["Red 40","Yellow 5"], reason:"Red 40 + Yellow 5 petroleum dyes in daily supplement — dye floor fires", confidence:"high", category:"supplement" }],
  ["vitafusion",                   { floor:6, ceiling:8, substances:["Red 40","Yellow 5"], reason:"Petroleum dyes in most flavors — dye floor fires", confidence:"high", category:"supplement" }],
  ["olly gummies",                 { floor:4, ceiling:6, substances:["synthetic colors"], reason:"Synthetic colorants in most flavors", confidence:"high", category:"supplement" }],
  ["smartypants kids",             { floor:2, ceiling:4, substances:[], reason:"No petroleum dyes — natural colors from turmeric and spirulina", confidence:"high", category:"supplement" }],
  ["ritual multivitamin",          { floor:1, ceiling:3, substances:[], reason:"No synthetic dyes, third-party tested, clean formulation", confidence:"high", category:"supplement" }],
  ["ritual prenatal",              { floor:1, ceiling:3, substances:[], reason:"Ritual Prenatal — no synthetic dyes, vegan, third-party tested, delayed-release capsule. Benchmark clean prenatal vitamin.", confidence:"high", category:"supplement" }],
  ["ritual",                       { floor:1, ceiling:3, substances:[], reason:"Ritual brand — transparent formulation, no synthetic dyes, third-party tested. Clean supplement benchmark.", confidence:"high", category:"supplement" }],
  ["garden of life raw",           { floor:1, ceiling:3, substances:[], reason:"USDA Organic, whole-food derived, no synthetic dyes", confidence:"high", category:"supplement" }],
  ["nordic naturals omega",        { floor:1, ceiling:3, substances:[], reason:"NSF tested, no artificial colors or flavors, Friend of the Sea certified", confidence:"high", category:"supplement" }],
  ["momentous protein",            { floor:1, ceiling:3, substances:[], reason:"NSF Certified for Sport + Informed Sport — no dyes, no artificial sweeteners", confidence:"high", category:"supplement" }],
  ["c4 pre-workout",               { floor:5, ceiling:7, kidsFloor:6, kidsCeiling:8, substances:["sucralose","acesulfame potassium"], reason:"Sucralose + acesulfame-K + possible artificial dyes — sucralose floor fires", confidence:"high", category:"supplement" }],
  ["ghost pre-workout",            { floor:4, ceiling:7, kidsFloor:6, kidsCeiling:8, substances:["sucralose"], reason:"Sucralose + artificial flavors + artificial colors in some", confidence:"high", category:"supplement" }],
  ["vital proteins collagen",      { floor:1, ceiling:3, substances:[], reason:"Plain collagen peptides — no artificial additives, minimal ingredients", confidence:"high", category:"supplement" }],

  // ══════════════════════════════════════════════════════════════
  // BABY PRODUCTS — DIAPERS
  // ══════════════════════════════════════════════════════════════
  ["pampers swaddlers",            { floor:6, ceiling:8, substances:["PP inner liner","ECF bleaching"], reason:"Polypropylene inner liner + ECF bleaching — conventional synthetic diaper", confidence:"high", category:"baby" }],
  ["pampers pure",                 { floor:3, ceiling:5, substances:["ECF bleaching","plant-based outer","polypropylene"], reason:"Pampers Pure Protection — plant-based outer lining, fragrance-free, no lotions, ECF bleaching (not TCF). Cleaner than Pampers Baby Dry but ECF concern remains. No third-party certification.", confidence:"high", category:"baby" }],
  ["huggies little snugglers",     { floor:6, ceiling:8, substances:["PP inner liner"], reason:"Conventional PP/PE diaper — same tier as Pampers", confidence:"high", category:"baby" }],
  ["hello bello diapers",          { floor:3, ceiling:5, substances:[], reason:"Corn-derived PLA fiber inner liner — plant-based at skin contact layer, chlorine-free", confidence:"high", category:"baby" }],
  ["andy pandy diapers",           { floor:2, ceiling:4, substances:[], reason:"Bamboo-derived, chlorine-free, no synthetic fragrance", confidence:"high", category:"baby" }],
  ["waterwipes",                   { floor:1, ceiling:2, substances:[], reason:"99.9% purified water + 0.1% grapefruit seed extract — benchmark clean baby wipe", confidence:"high", category:"baby" }],
  ["honest wipes",                 { floor:1, ceiling:3, substances:[], reason:"No fragrance, phenoxyethanol-free in current formula", confidence:"medium", category:"baby" }],

  // ══════════════════════════════════════════════════════════════
  // HOME — CLEANING PRODUCTS
  // ══════════════════════════════════════════════════════════════
  ["tide original",                { floor:5, ceiling:7, substances:["PVA","synthetic fragrance","optical brighteners"], reason:"PVA pod film enters waterways as microplastic + synthetic fragrance + 1,4-dioxane", confidence:"high", category:"home" }],
  ["tide",                         { floor:5, ceiling:7, substances:["synthetic fragrance","optical brighteners","1,4-dioxane"], reason:"Tide — synthetic fragrance + optical brighteners + 1,4-dioxane trace. Conventional laundry detergent concern tier.", confidence:"high", category:"home" }],
  ["tide pods",                    { floor:5, ceiling:7, substances:["PVA","synthetic fragrance"], reason:"PVA film + optical brighteners + synthetic fragrance + 1,4-dioxane", confidence:"high", category:"home" }],
  ["tide free and gentle",         { floor:3, ceiling:5, substances:["PVA"], reason:"No fragrance/dyes but still PVA pod film — significantly cleaner than original Tide", confidence:"high", category:"home" }],
  ["gain laundry",                 { floor:5, ceiling:7, substances:["synthetic fragrance","optical brighteners","PVA"], reason:"Synthetic fragrance + optical brighteners + PVA pod film", confidence:"high", category:"home" }],
  ["seventh generation free clear",{ floor:1, ceiling:3, substances:[], reason:"Plant-based, no synthetic fragrance, no optical brighteners, EPA Safer Choice", confidence:"high", category:"home" }],
  ["blueland dishwasher",          { floor:1, ceiling:2, substances:[], reason:"Blueland Dishwasher Tablets — naked compostable tablets (no PVA film), ships in Forever Shaker aluminum tin + paper refill pouches. Plant-based, EWG A-rated, B Corp certified.", confidence:"high", category:"home",
    packaging: { score:1, label:"Refillable Forever Shaker aluminum tin and paper refill pouches — tablets are naked (no PVA film, no plastic wrapper).", primary:"Aluminum tin + paper refill", endOfLife:"aluminum recyclable, paper compostable", refillable:true },
    sustainability: { score:1, label:"Refillable system eliminates single-use plastic jugs. One tin used indefinitely.", circularity:"refillable", reusable:true, replacesSingleUse:true } }],
  ["blueland laundry",             { floor:1, ceiling:2, substances:[], reason:"No PVA, no synthetic fragrance, tablet format — benchmark clean laundry",   confidence:"high", category:"home",
    packaging: { score:1, label:"Cardboard Forever Container with paper refill pouches — naked tablets, no PVA film, no plastic jug.", primary:"Cardboard + paper refill", endOfLife:"fully recyclable / compostable", refillable:true },
    sustainability: { score:1, label:"Refillable system replaces single-use plastic laundry jugs.", circularity:"refillable", reusable:true, replacesSingleUse:true } }],
  ["blueland multi-surface",       { floor:1, ceiling:2, substances:[], reason:"Blueland Multi-Surface Cleaner — EWG A-rated, no synthetic fragrance, no PVA film, concentrated tablet format, B Corp certified. Benchmark clean household cleaner.", confidence:"high", category:"home",
    packaging: { score:1, label:"Refillable Forever Bottle aluminum spray bottle + paper-wrapped dissolvable tablets — no plastic bottle, no PVA film.", primary:"Aluminum Forever Bottle + paper refill", endOfLife:"aluminum recyclable, paper compostable", refillable:true },
    sustainability: { score:1, label:"Forever Bottle used indefinitely; refills ship plastic-free. Net single-use-plastic elimination.", circularity:"refillable", reusable:true, replacesSingleUse:true } }],
  ["blueland clean",               { floor:1, ceiling:2, substances:[], reason:"Blueland cleaning product — EWG A-rated formulas, no synthetic fragrance, no PVA, tablet-based concentrate. Benchmark clean.", confidence:"high", category:"home",
    packaging: { score:1, label:"Refillable Forever containers with paper-wrapped or naked dissolvable tablets — no plastic bottles, no PVA film.", primary:"Refillable aluminum or cardboard", endOfLife:"aluminum recyclable, paper compostable", refillable:true },
    sustainability: { score:1, label:"Refill system replaces single-use plastic across household cleaning.", circularity:"refillable", reusable:true, replacesSingleUse:true } }],
  ["blueland",                     { floor:1, ceiling:3, substances:[], reason:"Blueland brand — EWG A-rated, B Corp certified, no PVA film, no synthetic fragrance, concentrated tablet format. Benchmark clean household cleaning across all product lines.", confidence:"high", category:"home",
    packaging: { score:1, label:"Refillable Forever containers (aluminum bottles, cardboard boxes) with paper-wrapped or naked dissolvable tablets — no plastic bottles, no PVA film on tablets.", primary:"Refillable aluminum or cardboard", endOfLife:"aluminum recyclable, paper compostable", refillable:true },
    sustainability: { score:1, label:"Refill system eliminates single-use plastic jugs across the entire product line.", circularity:"refillable", reusable:true, replacesSingleUse:true } }],
  ["method cleaner",               { floor:3, ceiling:5, substances:["synthetic fragrance"], reason:"Method All-Purpose Cleaner — plant-based surfactants but contains synthetic fragrance. EPA Safer Choice certified but not fragrance-free. Cleaner than conventional but not benchmark clean.", confidence:"high", category:"home" }],
  ["method soap",                  { floor:3, ceiling:5, substances:["synthetic fragrance"], reason:"Method hand soap — plant-derived ingredients, no triclosan, but contains synthetic fragrance and dye. Better than conventional but not clean.", confidence:"high", category:"personal_care" }],
  ["method",                       { floor:3, ceiling:5, substances:["synthetic fragrance"], reason:"Method brand — plant-derived, EPA Safer Choice on some products, but most contain synthetic fragrance. Better than conventional Clorox/Lysol tier but not benchmark clean.", confidence:"high", category:"home" }],
  ["branch basics",                { floor:1, ceiling:2, substances:[], reason:"Plant-based concentrate — zero synthetic additives, safest multi-purpose cleaner", confidence:"high", category:"home" }],
  ["lysol disinfectant spray",     { floor:6, ceiling:8, substances:["quaternary ammonium","synthetic fragrance"], reason:"Quaternary ammonium EPA-registered pesticide + aerosolized synthetic fragrance — linked to asthma induction", confidence:"high", category:"home" }],
  ["clorox disinfecting spray",    { floor:6, ceiling:8, substances:["quaternary ammonium","synthetic fragrance"], reason:"Quaternary ammonium + synthetic fragrance — same concern as Lysol", confidence:"high", category:"home" }],
  ["febreze spray",                { floor:5, ceiling:7, substances:["synthetic fragrance","PEG"], reason:"Synthetic fragrance phthalates + PEG compounds + aerosolized in enclosed spaces", confidence:"high", category:"home" }],
  ["glade plug-in",                { floor:5, ceiling:7, substances:["synthetic fragrance","phthalates"], reason:"Continuous synthetic fragrance emission + phthalates + VOCs in enclosed space", confidence:"high", category:"home" }],
  ["mrs. meyer's",                 { floor:3, ceiling:5, substances:["synthetic fragrance"], reason:"Contains synthetic fragrance in ALL scented products despite 'plant-inspired' marketing — greenwashing flag", confidence:"high", category:"home" }],
  ["dawn original dish",           { floor:4, ceiling:6, substances:["SLS","synthetic fragrance","MIT"], reason:"Dawn — SLS + synthetic fragrance + MIT preservative. Not a clean dish soap despite ubiquity.", confidence:"high", category:"home" }],
  ["dawn platinum",                { floor:4, ceiling:6, substances:["synthetic fragrance"], reason:"Stronger surfactant concentration + synthetic fragrance", confidence:"high", category:"home" }],
  ["dawn free gentle dish",        { floor:2, ceiling:4, substances:[], reason:"No dye, no fragrance — genuinely cleaner Dawn variant", confidence:"high", category:"home" }],

  // ══════════════════════════════════════════════════════════════
  // HOME — COOKWARE AND KITCHEN
  // ══════════════════════════════════════════════════════════════
  ["all-clad",           { floor:1, ceiling:2, substances:[], reason:"18/10 stainless steel — inert, no coating, benchmark clean cookware", confidence:"high", category:"kitchen" }],
  ["lodge",              { floor:1, ceiling:2, substances:[], reason:"Bare cast iron + seasoning only — no coating, inert", confidence:"high", category:"kitchen" }],
  ["le creuset",                   { floor:1, ceiling:2, substances:[], reason:"Enamel ceramic coating — no PTFE, no PFAS", confidence:"high", category:"kitchen" }],
  ["caraway",             { floor:1, ceiling:3, substances:[], reason:"Ceramic coating — no PTFE, no PFAS confirmed", confidence:"high", category:"kitchen" }],
  ["pyrex glass",                  { floor:1, ceiling:2, substances:[], reason:"Borosilicate glass — inert at all temperatures, benchmark clean food storage", confidence:"high", category:"kitchen" }],
  ["scotch-brite",                { floor:5, ceiling:7, substances:["synthetic microfibers"], reason:"Nylon/polyester synthetic sponge — sheds microplastics into water with every use", confidence:"high", category:"home" }],
  ["scotch brite",                 { floor:5, ceiling:7, substances:["synthetic microfibers"], reason:"Synthetic fiber sponge — microplastic shedding concern", confidence:"high", category:"home" }],
  ["stasher bag",                  { floor:1, ceiling:2, substances:[], reason:"Food-grade platinum silicone — reusable, no BPA, no plastic", confidence:"high", category:"kitchen" }],

  // ══════════════════════════════════════════════════════════════
  // CLOTHING — KEY BRANDS
  // ══════════════════════════════════════════════════════════════
  ["lululemon align",              { floor:5, ceiling:7, substances:["nylon","elastane","PFAS indicator 32ppm"], reason:"Lululemon Align — Nulu fabric (87% nylon / 13% Lycra). Mamavation EPA-certified lab testing 2022 found 32ppm organic fluorine (PFAS indicator) in crotch area. Lululemon claims PFAS phase-out in FY23, but Texas AG Ken Paxton issued a Civil Investigative Demand on April 13, 2026 alleging the phase-out claim is misleading. Daily intimate skin contact + synthetic microfiber shedding + unverified PFAS phase-out.", confidence:"high", category:"clothing" }],
  // SKU-specific Sports Organics entries — must precede the brand-level entry
  // so fuzzy match (Map iteration order) hits these first. Each SKU inherits
  // the brand-level pre-release status for the banner; SKU rows differ only
  // in name, URL slug (via frontend/scripts/generate-product-pages.js), and
  // the SKU-specific reason prefix. Pending list references the same four
  // brand-level verifications — duplicated here so each SEO page surfaces
  // the full provenance on its own.
  ["sports organics classic organic cotton sports bra", { floor:1, ceiling:3,
    substances:["organic cotton","elastane","GOTS certified fabric","OEKO-TEX Standard 100"],
    reason:"Sports Organics Classic Sports Bra — 91% organic cotton + 9% elastane with GOTS-certified fabric and OEKO-TEX Standard 100. Ingredients verified 04 2026 via brand disclosure. Pre-release: company-level GOTS and registry cross-references still pending.",
    confidence:"medium", category:"clothing",
    status:"pre_release",
    statusNote:"Brand disclosure received 2026-04-23. Fabric certifications verified against brand product pages; company-level GOTS in progress per brand. Floor will tighten once GOTS license number and OEKO-TEX certificate are cross-referenced against public registries.",
    statusExpectedRelease:"2026-Q3",
    verified:[
      { claim:"91% organic cotton + 9% elastane", source:"brand disclosure + product page", date:"2026-04" },
      { claim:"GOTS certification at fabric level", source:"brand disclosure + product page", date:"2026-04" },
      { claim:"OEKO-TEX Standard 100 certification at fabric level", source:"brand disclosure + product page", date:"2026-04" }
    ],
    pending:[
      { claim:"Company-level GOTS certification (whole-supply-chain, not just fabric)", status:"in progress per brand", wouldChangeScoreTo:1, expectedBy:"2026-Q3" },
      { claim:"OEKO-TEX certificate number cross-reference against oeko-tex.com registry", status:"not yet attempted", wouldChangeScoreTo:1 },
      { claim:"GOTS license number cross-reference against global-standard.org registry", status:"not yet attempted", wouldChangeScoreTo:1 },
      { claim:"Independent lab testing for dyes, finishes, or heavy metals (Mamavation / Consumer Reports / Toxic-Free Future)", status:"no third-party testing published yet", wouldChangeScoreTo:1 }
    ],
    thirdPartyReferences:[]
  }],
  ["sports organics mia organic cotton bike shorts", { floor:1, ceiling:3,
    substances:["organic cotton","elastane","GOTS certified fabric","OEKO-TEX Standard 100"],
    reason:"Sports Organics Mia Bike Shorts — 91% organic cotton + 9% elastane with GOTS-certified fabric and OEKO-TEX Standard 100. Same fabric as the Classic Sports Bra. Ingredients verified 04 2026 via brand disclosure. Pre-release: company-level GOTS and registry cross-references still pending.",
    confidence:"medium", category:"clothing",
    status:"pre_release",
    statusNote:"Brand disclosure received 2026-04-23. Fabric certifications verified against brand product pages; company-level GOTS in progress per brand. Floor will tighten once GOTS license number and OEKO-TEX certificate are cross-referenced against public registries.",
    statusExpectedRelease:"2026-Q3",
    verified:[
      { claim:"91% organic cotton + 9% elastane", source:"brand disclosure + product page", date:"2026-04" },
      { claim:"GOTS certification at fabric level", source:"brand disclosure + product page", date:"2026-04" },
      { claim:"OEKO-TEX Standard 100 certification at fabric level", source:"brand disclosure + product page", date:"2026-04" }
    ],
    pending:[
      { claim:"Company-level GOTS certification (whole-supply-chain, not just fabric)", status:"in progress per brand", wouldChangeScoreTo:1, expectedBy:"2026-Q3" },
      { claim:"OEKO-TEX certificate number cross-reference against oeko-tex.com registry", status:"not yet attempted", wouldChangeScoreTo:1 },
      { claim:"GOTS license number cross-reference against global-standard.org registry", status:"not yet attempted", wouldChangeScoreTo:1 },
      { claim:"Independent lab testing for dyes, finishes, or heavy metals (Mamavation / Consumer Reports / Toxic-Free Future)", status:"no third-party testing published yet", wouldChangeScoreTo:1 }
    ],
    thirdPartyReferences:[]
  }],
  ["sports organics merino speed short sleeve t shirt", { floor:1, ceiling:3,
    substances:["merino wool","OEKO-TEX Standard 100"],
    reason:"Sports Organics Merino Speed T — 100% merino wool with OEKO-TEX Standard 100. Natural fiber, biodegradable, no microfiber shedding. No GOTS because wool is outside the GOTS scope. Ingredients verified 04 2026 via brand disclosure. Pre-release: OEKO-TEX registry cross-reference and independent lab testing still pending.",
    confidence:"medium", category:"clothing",
    status:"pre_release",
    statusNote:"Brand disclosure received 2026-04-23. OEKO-TEX certification verified against brand product page. Floor will tighten once OEKO-TEX certificate number is cross-referenced against the public registry and wool dyehouse is identified.",
    statusExpectedRelease:"2026-Q3",
    verified:[
      { claim:"100% merino wool", source:"brand disclosure + product page", date:"2026-04" },
      { claim:"OEKO-TEX Standard 100 certification at fabric level", source:"brand disclosure + product page", date:"2026-04" }
    ],
    pending:[
      { claim:"OEKO-TEX certificate number cross-reference against oeko-tex.com registry", status:"not yet attempted", wouldChangeScoreTo:1 },
      { claim:"Wool dyehouse and dye class (reactive vs chrome-mordant)", status:"not disclosed", wouldChangeScoreTo:1 },
      { claim:"Independent lab testing for dyes, finishes, or heavy metals (Mamavation / Consumer Reports / Toxic-Free Future)", status:"no third-party testing published yet", wouldChangeScoreTo:1 }
    ],
    thirdPartyReferences:[]
  }],

  // Brand-level fallback — lower priority than the three SKU entries above.
  ["sports organics",              { floor:1, ceiling:3,
    substances:["organic cotton","elastane","merino wool","GOTS certified fabric","OEKO-TEX Standard 100"],
    reason:"Sports Organics — cotton line (Classic Bra, Mia Bike Shorts): 91% organic cotton + 9% elastane with GOTS-certified fabric and OEKO-TEX Standard 100. Merino line (Speed T): 100% merino wool with OEKO-TEX Standard 100. Ingredients verified 04 2026 via brand disclosure. Pre-release: company-level GOTS and registry cross-references still pending.",
    confidence:"medium",
    category:"clothing",
    status:"pre_release",
    statusNote:"Brand disclosure received 2026-04-23. Fabric certifications verified against brand product pages; company-level GOTS in progress per brand. Floor will tighten once GOTS license number and OEKO-TEX certificate are cross-referenced against public registries.",
    statusExpectedRelease:"2026-Q3",
    verified:[
      { claim:"91% organic cotton + 9% elastane (Classic Bra, Mia Bike Shorts)", source:"brand disclosure + product page", date:"2026-04" },
      { claim:"100% merino wool (Merino Speed T)", source:"brand disclosure + product page", date:"2026-04" },
      { claim:"GOTS certification at fabric level", source:"brand disclosure + product page", date:"2026-04" },
      { claim:"OEKO-TEX Standard 100 certification at fabric level", source:"brand disclosure + product page", date:"2026-04" }
    ],
    pending:[
      { claim:"Company-level GOTS certification (whole-supply-chain, not just fabric)", status:"in progress per brand", wouldChangeScoreTo:1, expectedBy:"2026-Q3" },
      { claim:"OEKO-TEX certificate number cross-reference against oeko-tex.com registry", status:"not yet attempted", wouldChangeScoreTo:1 },
      { claim:"GOTS license number cross-reference against global-standard.org registry", status:"not yet attempted", wouldChangeScoreTo:1 },
      { claim:"Independent lab testing for dyes, finishes, or heavy metals (Mamavation / Consumer Reports / Toxic-Free Future)", status:"no third-party testing published yet", wouldChangeScoreTo:1 }
    ],
    thirdPartyReferences:[]
  }],
  ["pact organic",                 { floor:1, ceiling:3, substances:[], reason:"GOTS certified organic cotton — gold standard clothing certification", confidence:"high", category:"clothing" }],
  ["pact clothing",                { floor:1, ceiling:3, substances:[], reason:"Pact — GOTS certified organic cotton, Fair Trade. Benchmark clean clothing brand across all product lines.", confidence:"high", category:"clothing" }],
  ["pact men",                     { floor:1, ceiling:3, substances:[], reason:"Pact men's clothing — GOTS certified organic cotton, Fair Trade. Benchmark clean.", confidence:"high", category:"clothing" }],
  ["pact women",                   { floor:1, ceiling:3, substances:[], reason:"Pact women's clothing — GOTS certified organic cotton, Fair Trade. Benchmark clean.", confidence:"high", category:"clothing" }],
  // Tentree / Kotn / Quince added 2026-04-22 during clothing audit.
  ["tentree",                      { floor:2, ceiling:4, substances:[], reason:"Tentree — OEKO-TEX Standard 100 tested, Climate+ offset, 10 trees planted per item. Mix of organic cotton, recycled polyester, Tencel across the line (not uniformly GOTS).", confidence:"high", category:"clothing" }],
  ["kotn",                         { floor:1, ceiling:3, substances:[], reason:"Kotn — GOTS certified organic cotton from direct Egyptian farm supply chain. B Corp, Fair Trade. Benchmark clean mainstream basics brand.", confidence:"high", category:"clothing" }],
  ["quince",                       { floor:3, ceiling:5, substances:["mulberry silk","cashmere"], reason:"Quince — mixed materials. Some OEKO-TEX tested items, but not uniformly certified. Cashmere sourcing transparency limited. Reflects median product.", confidence:"medium", category:"clothing" }],

  // ══════════════════════════════════════════════════════════════
  // RESTAURANT — CHAINS
  // ══════════════════════════════════════════════════════════════
  ["chick-fil-a crispy",           { floor:5, ceiling:7, substances:["TBHQ","MSG","dimethylpolysiloxane"], reason:"TBHQ in frying oil + MSG in breading + dimethylpolysiloxane antifoam + 1350mg sodium", confidence:"high", category:"restaurant" }],
  ["chick-fil-a grilled",          { floor:3, ceiling:5, substances:["sodium"], reason:"Cleaner marinade — no TBHQ or dimethylpolysiloxane but still high sodium processed bun", confidence:"high", category:"restaurant" }],
  ["sweetgreen",                   { floor:2, ceiling:5, substances:[], reason:"Fresh whole ingredients — simple bowls 3-4, loaded sauces/croutons 4-5", confidence:"medium", category:"restaurant" }],
  ["crumbl cookie",                { floor:5, ceiling:7, substances:["artificial dyes","refined flour"], reason:"Refined flour + 40-80g sugar per cookie + artificial dyes in frosting on many flavors", confidence:"high", category:"restaurant" }],

  // ══════════════════════════════════════════════════════════════
  // CHILDREN'S MEDICINE — CRITICAL (dyes in daily sick-child use)
  // ══════════════════════════════════════════════════════════════
  ["children's tylenol liquid",    { floor:6, ceiling:8, substances:["Red 40","Blue 1","HFCS"], reason:"Two petroleum dyes + HFCS in medicine given daily to feverish children — child vulnerability flag", confidence:"high", category:"other" }],
  ["children's motrin liquid",     { floor:5, ceiling:7, substances:["Red 40"], reason:"Red 40 petroleum dye in children's daily medicine — dye floor fires", confidence:"high", category:"other" }],
  ["children's advil liquid",      { floor:5, ceiling:7, substances:["Red 40"], reason:"Red 40 dye in children's medicine — child vulnerability", confidence:"high", category:"other" }],
  ["children's benadryl liquid",   { floor:5, ceiling:7, substances:["Red 40","HFCS"], reason:"Red 40 + HFCS in children's medicine", confidence:"high", category:"other" }],
  // ── KIDS OTC MEDICINE ──────────────────────────────────────────
  ["hylands daytime cough",           { floor:3, ceiling:5, kidsFloor:4, kidsCeiling:6, substances:["homeopathic","ethanol trace"], reason:"Hylands Daytime Cough — homeopathic formula, lower ethanol than nighttime, no artificial dyes in daytime line. Cleaner than nighttime. Score 3-5 adult, 4-6 kids.", confidence:"high", category:"supplement" }],
  ["hylands daytime",                 { floor:3, ceiling:5, kidsFloor:4, kidsCeiling:6, substances:["homeopathic"], reason:"Hylands Daytime — daytime formulas are cleaner, lower ethanol, no sedating ingredients.", confidence:"high", category:"supplement" }],
  ["hylands nighttime cough",         { floor:5, ceiling:7, kidsFloor:6, kidsCeiling:8, substances:["ethanol","preservatives","artificial flavor"], reason:"Hylands Nighttime Cough — ethanol base (alcohol in kids medicine), diphenhydramine concern, artificial flavors. Higher concern than daytime.", confidence:"high", category:"supplement" }],
  ["hylands nighttime",               { floor:5, ceiling:7, kidsFloor:6, kidsCeiling:8, substances:["ethanol","sedating ingredients"], reason:"Hylands Nighttime — sedating formula, ethanol base. Higher concern for children.", confidence:"high", category:"supplement" }],
  ["hylands kids",                    { floor:4, ceiling:6, kidsFloor:5, kidsCeiling:7, substances:["ethanol","preservatives","artificial flavor"], reason:"Hylands Kids — kids homeopathic line. Ethanol base is the primary concern for children's medicine. Score 5-7 for nighttime/cough formulas.", confidence:"high", category:"supplement" }],
  ["hylands",                         { floor:3, ceiling:6, kidsFloor:4, kidsCeiling:7, substances:["ethanol","homeopathic","preservatives"], reason:"Hylands — homeopathic medicine. Daytime formulas score 3-5, nighttime/cough score 5-7. Ethanol base is primary concern.", confidence:"medium", category:"supplement" }],
  ["zarbees naturals",             { floor:2, ceiling:4, substances:["honey","natural ingredients"], reason:"Zarbee's Naturals — honey-based cough syrup, no artificial dyes, no petroleum preservatives, no HFCS. Significantly cleaner than conventional kids cough medicines. Melatonin in nighttime versions.", confidence:"high", category:"supplement" }],
  ["zarbees",                      { floor:2, ceiling:4, substances:["honey","natural"], reason:"Zarbee's — honey-based, no artificial dyes. Benchmark clean kids cough medicine.", confidence:"high", category:"supplement" }],
  ["little remedies",              { floor:3, ceiling:5, substances:["glycerin","natural flavor"], reason:"Little Remedies — dye-free, HFCS-free formulas. Cleaner than conventional but still conventional preservatives in some formulas.", confidence:"medium", category:"supplement" }],
  ["maty's",                       { floor:2, ceiling:4, substances:["honey","apple cider vinegar"], reason:"Maty's — whole food ingredients, honey base, no artificial dyes, no alcohol. Clean kids cough formula.", confidence:"high", category:"supplement" }],
  ["genexa",                       { floor:2, ceiling:4, substances:["organic ingredients"], reason:"Genexa — USDA Organic certified OTC medicine, no artificial dyes, no petroleum preservatives. Benchmark clean conventional medicine.", confidence:"high", category:"supplement" }],
  ["nyquil liquid",                { floor:4, ceiling:6, substances:["Yellow 6","HFCS"], reason:"Yellow 6 dye + HFCS + 10% alcohol — dye floor fires", confidence:"high", category:"other" }],
  ["dayquil liquid",               { floor:4, ceiling:6, substances:["Yellow 6","HFCS"], reason:"Yellow 6 + HFCS — dye floor fires", confidence:"high", category:"other" }],
  ["zzzquil liquid",               { floor:4, ceiling:6, substances:["Blue 1"], reason:"Blue 1 dye + propylene glycol + PEG — dye floor fires", confidence:"high", category:"other" }],

  // ══════════════════════════════════════════════════════════════
  // FEMININE CARE — PERIOD UNDERWEAR
  // ══════════════════════════════════════════════════════════════
  ["thinx",                         { floor:7, ceiling:9, substances:["PFAS"], reason:"Mamavation 2021 lab testing confirmed PFAS fluorine above 100ppm — class action settlement", confidence:"high", category:"clothing" }],
  ["saalt period underwear",        { floor:1, ceiling:3, substances:[], reason:"OEKO-TEX certified, no PFAS detected in independent testing", confidence:"high", category:"clothing" }],
  ["modibodi",                       { floor:2, ceiling:4, substances:[], reason:"OEKO-TEX, PFAS-free claim", confidence:"medium", category:"clothing" }],

  // ══════════════════════════════════════════════════════════════
  // NAIL POLISH
  // ══════════════════════════════════════════════════════════════
  ["zoya nail polish",              { floor:2, ceiling:4, substances:[], reason:"7-free: no TPHP, no toluene, no DBP, no formaldehyde resin — benchmark clean nail polish", confidence:"high", category:"personal_care" }],
  ["olive & june nail polish",      { floor:1, ceiling:3, substances:[], reason:"10-free formula — removes 10 harmful chemicals including TPHP", confidence:"high", category:"personal_care" }],
  ["sally hansen nail",             { floor:5, ceiling:7, substances:["TPHP","tosylamide"], reason:"Tosylamide/formaldehyde resin + TPHP — TPHP floor mFloor:7 fires", confidence:"high", category:"personal_care" }],
  ["opi nail polish",               { floor:3, ceiling:5, substances:["TPHP"], reason:"3-free removes toluene/DBP/formaldehyde but TPHP still present in most formulas", confidence:"medium", category:"personal_care" }],

  // ══════════════════════════════════════════════════════════════
  // HAIR DYE
  // ══════════════════════════════════════════════════════════════
  ["l'oreal excellence",            { floor:6, ceiling:8, substances:["PPD","resorcinol","ammonia"], reason:"PPD p-phenylenediamine (IARC-3, common sensitizer) + resorcinol + ammonia — PPD floor fires", confidence:"high", category:"personal_care" }],
  ["loreal hair dye",               { floor:6, ceiling:8, substances:["PPD","resorcinol"], reason:"PPD confirmed — floor fires", confidence:"high", category:"personal_care" }],
  ["clairol nice n easy",           { floor:6, ceiling:8, substances:["PPD","resorcinol"], reason:"PPD + resorcinol + hydrogen peroxide — PPD floor fires", confidence:"high", category:"personal_care" }],
  ["garnier nutrisse",              { floor:6, ceiling:8, substances:["PPD","ammonia"], reason:"PPD + ammonia + resorcinol — floor fires", confidence:"high", category:"personal_care" }],
  ["arctic fox hair dye",           { floor:1, ceiling:3, substances:[], reason:"PPD-free, ammonia-free, peroxide-free — benchmark clean hair color", confidence:"high", category:"personal_care" }],
  ["overtone",                       { floor:1, ceiling:3, substances:[], reason:"No PPD, no ammonia, no peroxide — conditioning color deposit only", confidence:"high", category:"personal_care" }],

  // ══════════════════════════════════════════════════════════════
  // PERFUME AND COLOGNE
  // ══════════════════════════════════════════════════════════════
  ["chanel no. 5",                  { floor:5, ceiling:7, substances:["synthetic fragrance","phthalates"], reason:"Undisclosed synthetic fragrance — phthalates confirmed in independent testing", confidence:"high", category:"personal_care" }],
  ["chanel no.5",                   { floor:5, ceiling:7, substances:["synthetic fragrance"], reason:"Undisclosed synthetic fragrance", confidence:"high", category:"personal_care" }],
  ["old spice cologne",             { floor:5, ceiling:7, substances:["synthetic fragrance"], reason:"Undisclosed synthetic fragrance — synthetic fragrance floor fires", confidence:"high", category:"personal_care" }],
  ["bath & body works",             { floor:5, ceiling:7, substances:["synthetic fragrance","phthalates"], reason:"Phthalates confirmed in independent testing + undisclosed synthetic fragrance VOCs", confidence:"high", category:"personal_care" }],
  ["phlur perfume",                 { floor:2, ceiling:4, substances:[], reason:"EU allergen-disclosed, phthalate-free, no animal musks — clean fragrance benchmark", confidence:"high", category:"personal_care" }],
  ["ellis brooklyn",                { floor:1, ceiling:3, substances:[], reason:"Phthalate-free, full ingredient disclosure — clean fragrance", confidence:"high", category:"personal_care" }],

  // ══════════════════════════════════════════════════════════════
  // FLEA AND TICK PRODUCTS
  // ══════════════════════════════════════════════════════════════
  ["hartz flea collar",             { floor:7, ceiling:9, substances:["tetrachlorvinphos"], reason:"Tetrachlorvinphos organophosphate — NRDC petitioned EPA for ban, carcinogenicity in rodent studies, children exposed by petting animal", confidence:"high", category:"other" }],
  ["hartz ultraguard",              { floor:7, ceiling:9, substances:["tetrachlorvinphos"], reason:"Tetrachlorvinphos — organophosphate carcinogen concern", confidence:"high", category:"other" }],
  ["seresto flea collar",           { floor:6, ceiling:8, substances:["flumethrin","imidacloprid"], reason:"1,698 pet deaths and 75,000 incident reports in EPA 2021 data", confidence:"high", category:"other" }],

  // ══════════════════════════════════════════════════════════════
  // PET FOOD DYES
  // ══════════════════════════════════════════════════════════════
  ["friskies wet cat food",         { floor:5, ceiling:7, substances:["Red 40","Blue 1"], reason:"Petroleum dyes Red 40 + Blue 1 in dyed gravy — daily cat food consumption", confidence:"high", category:"food_beverage" }],
  ["purina fancy feast",            { floor:4, ceiling:6, substances:["Red 40"], reason:"Red 40 in some flavors — check specific variant", confidence:"medium", category:"food_beverage" }],
  ["purina beneful",                { floor:5, ceiling:7, substances:["artificial dyes","BHA","propylene glycol"], reason:"Artificial dyes + BHA + propylene glycol — multiple floors fire", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // GARDEN CHEMICALS
  // ══════════════════════════════════════════════════════════════
  ["roundup",                        { floor:7, ceiling:9, substances:["glyphosate"], reason:"Glyphosate IARC Group 2A — primary application of probable carcinogen, Bayer 3B legal settlements", confidence:"high", category:"home" }],
  ["ortho home defense",            { floor:6, ceiling:8, substances:["bifenthrin"], reason:"Bifenthrin pyrethroid — aquatic toxin, EPA-flagged waterway harm", confidence:"high", category:"home" }],
  ["ortho groundclear",             { floor:7, ceiling:9, substances:["glyphosate","imazapyr"], reason:"Ortho GroundClear Year Long — glyphosate (IARC 2A) + imazapyr persistent soil herbicide. Long residual activity in soil ecosystems.", confidence:"high", category:"home" }],
  ["spectracide triazicide",        { floor:7, ceiling:9, substances:["gamma-cyhalothrin"], reason:"Spectracide Triazicide — gamma-cyhalothrin synthetic pyrethroid. Highly toxic to bees, aquatic invertebrates; EPA restricted near waterways.", confidence:"high", category:"home" }],
  ["spectracide weed stop",         { floor:7, ceiling:9, substances:["2,4-D","dicamba","mecoprop"], reason:"Spectracide Weed Stop — 2,4-D + dicamba + mecoprop. 2,4-D is IARC Group 2B possible carcinogen; dicamba volatility implicated in off-target drift damage.", confidence:"high", category:"home" }],

  // ══════════════════════════════════════════════════════════════
  // ORAL RINSE
  // ══════════════════════════════════════════════════════════════
  ["listerine cool mint",           { floor:5, ceiling:7, substances:["Blue 1","alcohol"], reason:"Blue 1 petroleum dye floor fires + 21.6% alcohol + saccharin", confidence:"high", category:"personal_care" }],
  ["listerine kids",                { floor:6, ceiling:8, substances:["Red 40","Blue 1"], reason:"Two petroleum dyes + saccharin in daily children's mouth rinse — child vulnerability flag", confidence:"high", category:"personal_care" }],
  ["therabreath",                    { floor:2, ceiling:4, substances:[], reason:"No alcohol, no dyes, no saccharin — significantly cleaner than conventional mouthwash", confidence:"high", category:"personal_care" }],

  // ══════════════════════════════════════════════════════════════
  // COFFEE PODS
  // ══════════════════════════════════════════════════════════════
  ["keurig k-cup",                  { floor:6, ceiling:8, substances:["polypropylene","microplastics"], reason:"Hot water forced through PP plastic at 92°C — Li 2020 confirmed microplastic release. Applies to ALL K-Cup brands.", confidence:"high", category:"food_beverage" }],
  ["starbucks k-cup",              { floor:6, ceiling:8, substances:["polypropylene"], reason:"Polypropylene pod — heated PP microplastic release", confidence:"high", category:"food_beverage" }],
  ["green mountain k-cup",         { floor:6, ceiling:8, substances:["polypropylene"], reason:"PP pod — heated plastic microplastic release", confidence:"high", category:"food_beverage" }],
  ["dunkin k-cup",                  { floor:6, ceiling:8, substances:["polypropylene"], reason:"PP pod — heated plastic concern", confidence:"high", category:"food_beverage" }],
  ["lipton pyramid tea bag",        { floor:6, ceiling:8, substances:["nylon","microplastics"], reason:"Nylon mesh confirmed — 11.6 billion microplastic particles per cup at steeping temperature (Hernandez 2019)", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // INSECT REPELLENT
  // ══════════════════════════════════════════════════════════════
  ["off! deep woods",               { floor:6, ceiling:8, substances:["DEET"], reason:"98% DEET — neurotoxin class, skin absorption, not recommended for children under 3", confidence:"high", category:"other" }],
  ["off family care",               { floor:4, ceiling:6, substances:["DEET"], reason:"15% DEET — lower concentration but still neurotoxic class", confidence:"high", category:"other" }],
  ["off citronella candle",         { floor:1, ceiling:3, substances:["citronella oil"], reason:"Citronella oil candle — plant-derived active, low concern for outdoor use. Watch for paraffin-only wax versions which add a small particulate concern.", confidence:"high", category:"home" }],
  ["sawyer picaridin",              { floor:2, ceiling:4, substances:[], reason:"Picaridin — CDC approved, lower toxicity than DEET, does not dissolve plastics", confidence:"high", category:"other" }],
  ["thermacell",                    { floor:5, ceiling:7, substances:["allethrin"], reason:"Allethrin pyrethroid volatilized into breathing zone — EPA-registered pesticide continuously inhaled", confidence:"high", category:"other" }],
  ["repel lemon eucalyptus",        { floor:1, ceiling:3, substances:[], reason:"PMD/oil of lemon eucalyptus — plant-based, CDC approved", confidence:"high", category:"other" }],

  // ══════════════════════════════════════════════════════════════
  // JERKY AND MEAT SNACKS
  // ══════════════════════════════════════════════════════════════
  ["jack link's",                   { floor:6, ceiling:8, substances:["sodium nitrite","HFCS"], reason:"Sodium nitrite IARC Group 1 + HFCS — nitrite floor fires (mFloor:8)", confidence:"high", category:"food_beverage" }],
  ["jack links",                    { floor:6, ceiling:8, substances:["sodium nitrite","HFCS"], reason:"Sodium nitrite + HFCS — nitrite floor fires", confidence:"high", category:"food_beverage" }],
  ["epic bar",                       { floor:1, ceiling:3, substances:[], reason:"Whole prey ingredients, no nitrites, no celery powder, no artificial additives", confidence:"high", category:"food_beverage" }],
  ["chomps",                         { floor:1, ceiling:3, substances:[], reason:"No sodium nitrite, no celery powder, no artificial dyes — benchmark clean meat snack", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // KETO AND SPECIALTY FOODS
  // ══════════════════════════════════════════════════════════════
  ["lily's chocolate",              { floor:2, ceiling:4, substances:[], reason:"Stevia + erythritol — no sucralose, no petroleum dyes, clean keto chocolate", confidence:"high", category:"food_beverage" }],
  ["choczero",                       { floor:2, ceiling:4, substances:[], reason:"Monk fruit + erythritol — no sucralose, clean sweeteners", confidence:"high", category:"food_beverage" }],
  ["rebel keto ice cream",          { floor:4, ceiling:6, kidsFloor:6, kidsCeiling:8, substances:["sucralose"], reason:"Sucralose floor fires — not cleaner than real ice cream", confidence:"high", category:"food_beverage" }],
  ["maurten",                    { floor:1, ceiling:3, substances:[], reason:"Maltodextrin + water + electrolytes — no artificial additives whatsoever", confidence:"high", category:"food_beverage" }],
  ["honey stinger",                  { floor:1, ceiling:3, substances:[], reason:"Organic honey base — clean sports fuel", confidence:"high", category:"food_beverage" }],
  ["tailwind endurance",            { floor:1, ceiling:3, substances:[], reason:"Sucrose + glucose + electrolytes — no artificial dyes or flavors", confidence:"high", category:"food_beverage" }],
  ["stouffer's mac",                { floor:5, ceiling:7, substances:["sodium phosphate","processed cheese"], reason:"Processed cheese sauce + sodium phosphate + sodium citrate + NOVA 4", confidence:"high", category:"food_beverage" }],
  ["marie callender",               { floor:5, ceiling:7, substances:["enriched flour","high sodium"], reason:"Enriched flour + high sodium 1000mg+ + NOVA 4 frozen meal", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // MLM NUTRITION
  // ══════════════════════════════════════════════════════════════
  ["herbalife",                      { floor:5, ceiling:7, substances:["sucralose","artificial dyes"], reason:"Artificial dyes + sucralose + proprietary blends without full disclosure — no NSF/Informed Sport certification", confidence:"high", category:"supplement" }],
  ["isagenix",                       { floor:5, ceiling:7, kidsFloor:6, kidsCeiling:8, substances:["sucralose"], reason:"Sucralose + proprietary blends + no third-party testing certification", confidence:"high", category:"supplement" }],
  ["shakeology",                     { floor:4, ceiling:6, kidsFloor:6, kidsCeiling:8, substances:["sucralose"], reason:"Proprietary blends, some sucralose, no NSF certification", confidence:"medium", category:"supplement" }],

  // ══════════════════════════════════════════════════════════════
  // CLEAN SKINCARE
  // ══════════════════════════════════════════════════════════════
  ["the ordinary retinol",          { floor:1, ceiling:3, substances:[], reason:"Retinol + squalane — no synthetic fragrance, no parabens, minimal formula", confidence:"high", category:"personal_care" }],
  ["paula's choice bha",            { floor:1, ceiling:3, substances:[], reason:"Salicylic acid, fragrance-free, no dyes — EWG top-rated", confidence:"high", category:"personal_care" }],
  ["elta md uv",                    { floor:1, ceiling:3, substances:[], reason:"Zinc oxide mineral UV filter + niacinamide — EWG Verified, no synthetic fragrance", confidence:"high", category:"personal_care" }],

  // ══════════════════════════════════════════════════════════════
  // SELF-TANNER
  // ══════════════════════════════════════════════════════════════
  ["coola self tanner",             { floor:1, ceiling:3, substances:[], reason:"USDA Organic, no synthetic fragrance — cleanest self-tanner", confidence:"high", category:"personal_care" }],
  ["loving tan",                    { floor:2, ceiling:4, substances:[], reason:"DHA — fragrance-free options, cleaner formula", confidence:"high", category:"personal_care" }],
  ["banana boat self tan",          { floor:4, ceiling:6, substances:["synthetic fragrance","parabens"], reason:"DHA + synthetic fragrance + parabens + propylene glycol", confidence:"high", category:"personal_care" }],

  // ══════════════════════════════════════════════════════════════
  // FAST FOOD — McDONALD'S
  // ══════════════════════════════════════════════════════════════
  ["big mac",                        { floor:5, ceiling:7, substances:["TBHQ","HFCS"], reason:"TBHQ in frying oil + HFCS in bun + 1010mg sodium + enriched flour", confidence:"high", category:"restaurant" }],
  ["chicken mcnuggets",              { floor:6, ceiling:8, substances:["TBHQ","dimethylpolysiloxane","MSG"], reason:"TBHQ + dimethylpolysiloxane antifoam + sodium aluminum phosphate + DATEM — always name all four", confidence:"high", category:"restaurant" }],
  ["mcchicken",                      { floor:6, ceiling:8, substances:["TBHQ","MSG","dimethylpolysiloxane"], reason:"TBHQ + MSG + dimethylpolysiloxane — always name all three", confidence:"high", category:"restaurant" }],
  ["sausage mcmuffin",               { floor:6, ceiling:8, substances:["sodium nitrite"], reason:"Sodium nitrite in sausage — IARC Group 1 floor fires. NEVER score below 6.", confidence:"high", category:"restaurant" }],
  ["sausage biscuit mcdonald",       { floor:6, ceiling:8, substances:["sodium nitrite"], reason:"Sodium nitrite in sausage — floor fires", confidence:"high", category:"restaurant" }],
  ["egg mcmuffin",                   { floor:6, ceiling:7, substances:["sodium nitrite"], reason:"Canadian bacon (lower nitrite) + processed egg — cleaner than sausage versions", confidence:"high", category:"restaurant" }],
  ["mcdonald's french fries",        { floor:5, ceiling:7, substances:["TBHQ"], reason:"TBHQ in frying oil + natural beef flavor (unlabeled wheat/milk) + dextrose coating", confidence:"high", category:"restaurant" }],
  ["mcflurry",                       { floor:5, ceiling:7, kidsFloor:8, kidsCeiling:9, substances:["HFCS","corn syrup"], reason:"HFCS + corn syrup + artificial flavors. M&M version = 7 (petroleum dyes).", confidence:"high", category:"restaurant" }],
  ["mcdonald's apple pie",           { floor:6, ceiling:8, substances:["TBHQ","BHA","HFCS"], reason:"TBHQ + BHA in oil + HFCS — BHA floor fires (mFloor:6)", confidence:"high", category:"restaurant" }],
  ["mcdonald's oatmeal",             { floor:3, ceiling:5, substances:[], reason:"Genuine oats + brown sugar + cream — cleanest McDonald's option", confidence:"high", category:"restaurant" }],

  // ══════════════════════════════════════════════════════════════
  // FAST FOOD — BURGER KING
  // ══════════════════════════════════════════════════════════════
  ["whopper",                        { floor:5, ceiling:7, substances:["TBHQ","DATEM"], reason:"TBHQ + DATEM in bun + 980mg sodium", confidence:"high", category:"restaurant" }],
  ["impossible whopper",             { floor:5, ceiling:7, substances:["TBHQ"], reason:"Impossible patty (NOVA 4) + TBHQ in frying oil. Plant-based does not mean safer.", confidence:"high", category:"restaurant" }],
  ["impossible burger",              { floor:4, ceiling:6, substances:["soy leghemoglobin","methylcellulose","soy protein concentrate"], reason:"Impossible Burger — NOVA 4 ultra-processed, soy leghemoglobin (heme via fermentation, novel ingredient), methylcellulose binder, soy protein concentrate. Plant-based but highly processed.", confidence:"high", category:"food" }],
  ["beyond meat",                    { floor:4, ceiling:6, substances:["methylcellulose","pea protein isolate","canola oil"], reason:"Beyond Meat — NOVA 4 ultra-processed, methylcellulose binder, pea protein isolate, refined canola oil. Plant-based but highly processed with 20+ ingredients.", confidence:"high", category:"food" }],
  ["beyond burger",                  { floor:4, ceiling:6, substances:["methylcellulose","pea protein isolate","canola oil"], reason:"Beyond Burger — NOVA 4 ultra-processed, methylcellulose binder, pea protein isolate, refined canola oil. Plant-based but highly processed.", confidence:"high", category:"food" }],
  ["bk chicken fries",              { floor:6, ceiling:8, substances:["TBHQ","MSG"], reason:"TBHQ + MSG + enriched flour breading", confidence:"high", category:"restaurant" }],
  ["bk croissanwich",               { floor:6, ceiling:8, substances:["sodium nitrite"], reason:"Sodium nitrite in sausage/bacon — floor fires", confidence:"high", category:"restaurant" }],

  // ══════════════════════════════════════════════════════════════
  // FAST FOOD — WENDY'S
  // ══════════════════════════════════════════════════════════════
  ["baconator",                      { floor:6, ceiling:8, substances:["sodium nitrite","TBHQ"], reason:"Sodium nitrite in bacon (IARC Group 1) + TBHQ in oil + 1350-2150mg sodium — multiple floors fire", confidence:"high", category:"restaurant" }],
  ["son of baconator",              { floor:6, ceiling:8, substances:["sodium nitrite","TBHQ"], reason:"Sodium nitrite + TBHQ — multiple floors fire", confidence:"high", category:"restaurant" }],
  ["wendy's frosty",               { floor:4, ceiling:6, substances:["HFCS","carrageenan"], reason:"HFCS + carrageenan floor fires + artificial flavor", confidence:"high", category:"restaurant" }],
  ["dave's single",                 { floor:5, ceiling:7, substances:["TBHQ"], reason:"TBHQ in oil + sodium phosphate in cheese + high sodium", confidence:"high", category:"restaurant" }],

  // ══════════════════════════════════════════════════════════════
  // FAST FOOD — KFC AND POPEYES
  // ══════════════════════════════════════════════════════════════
  ["kfc original recipe",           { floor:6, ceiling:8, substances:["MSG","TBHQ","DATEM","dimethylpolysiloxane"], reason:"MSG + TBHQ + DATEM + dimethylpolysiloxane — always name all four. NEVER score below 6.", confidence:"high", category:"restaurant" }],
  ["kfc extra crispy",              { floor:6, ceiling:8, substances:["MSG","TBHQ","DATEM"], reason:"Same as Original Recipe with additional breading additives", confidence:"high", category:"restaurant" }],
  ["kfc famous bowl",               { floor:6, ceiling:8, substances:["MSG","TBHQ"], reason:"Powdered mashed potato + MSG gravy + TBHQ + seven processed components combined", confidence:"high", category:"restaurant" }],
  ["kfc grilled chicken",           { floor:4, ceiling:6, substances:[], reason:"No TBHQ from fryer, lower additive load — cleaner KFC option", confidence:"high", category:"restaurant" }],
  ["popeyes chicken sandwich",      { floor:6, ceiling:8, substances:["MSG","TBHQ"], reason:"MSG + TBHQ + enriched flour brioche + 1443mg sodium. NEVER score below 6.", confidence:"high", category:"restaurant" }],
  ["popeyes original chicken",      { floor:6, ceiling:8, substances:["MSG","TBHQ","DATEM"], reason:"MSG + TBHQ + DATEM + sodium aluminum phosphate. NEVER score below 6.", confidence:"high", category:"restaurant" }],
  ["popeyes spicy chicken",         { floor:6, ceiling:8, substances:["MSG","TBHQ"], reason:"Same as Original — MSG + TBHQ", confidence:"high", category:"restaurant" }],

  // ══════════════════════════════════════════════════════════════
  // FAST FOOD — PIZZA CHAINS
  // ══════════════════════════════════════════════════════════════
  ["domino's pepperoni pizza",      { floor:6, ceiling:8, substances:["sodium nitrite","DATEM"], reason:"Sodium nitrite in pepperoni (IARC Group 1) + DATEM in dough. Nitrite floor fires. NEVER score below 6.", confidence:"high", category:"restaurant" }],
  ["dominos pepperoni",             { floor:6, ceiling:8, substances:["sodium nitrite","DATEM"], reason:"Sodium nitrite + DATEM — floor fires", confidence:"high", category:"restaurant" }],
  ["pizza hut pepperoni",           { floor:6, ceiling:8, substances:["sodium nitrite","TBHQ"], reason:"TBHQ in pan oil + sodium nitrite in pepperoni — two floors fire simultaneously", confidence:"high", category:"restaurant" }],
  ["little caesars pepperoni",      { floor:6, ceiling:8, substances:["sodium nitrite","TBHQ"], reason:"TBHQ + sodium nitrite — both floors fire", confidence:"high", category:"restaurant" }],
  ["blaze pizza",                   { floor:3, ceiling:5, substances:[], reason:"Made fresh daily, real dough, ingredient transparency, no processed meats unless chosen", confidence:"high", category:"restaurant" }],
  ["mod pizza",                     { floor:3, ceiling:5, substances:[], reason:"Fresh made, ingredient transparency — cleaner chain pizza", confidence:"high", category:"restaurant" }],

  // ══════════════════════════════════════════════════════════════
  // FAST FOOD — SUBWAY AND SANDWICH
  // ══════════════════════════════════════════════════════════════
  ["subway italian bmt",            { floor:6, ceiling:8, substances:["sodium nitrite"], reason:"Sodium nitrite in ALL THREE meats (pepperoni + salami + ham) — highest nitrite exposure per serving in mainstream fast food", confidence:"high", category:"restaurant" }],
  ["subway meatball marinara",       { floor:6, ceiling:8, substances:["sodium nitrite","HFCS"], reason:"Mechanically separated chicken meatballs + HFCS in sauce — floor fires", confidence:"high", category:"restaurant" }],
  ["subway veggie delite",          { floor:2, ceiling:4, substances:[], reason:"Fresh produce + bread — no processed meat — cleanest Subway option", confidence:"high", category:"restaurant" }],
  ["jersey mike's italian",         { floor:6, ceiling:8, substances:["sodium nitrite"], reason:"Three cured meats — pepperoni + salami + prosciutto — sodium nitrite in all three", confidence:"high", category:"restaurant" }],

  // ══════════════════════════════════════════════════════════════
  // FAST FOOD — TACO BELL
  // ══════════════════════════════════════════════════════════════
  ["taco bell chalupa",             { floor:5, ceiling:7, substances:["TBHQ"], reason:"TBHQ from fried shell + processed beef blend", confidence:"high", category:"restaurant" }],
  ["taco bell crunchwrap",          { floor:5, ceiling:7, substances:["TBHQ"], reason:"TBHQ + processed beef + enriched flour", confidence:"high", category:"restaurant" }],
  ["taco bell bean burrito",        { floor:3, ceiling:5, substances:[], reason:"Refried beans + cheese — no processed meat — cleanest Taco Bell option", confidence:"high", category:"restaurant" }],
  ["taco bell power bowl",          { floor:3, ceiling:5, substances:[], reason:"Grilled chicken + rice + beans — cleanest Taco Bell protein build", confidence:"high", category:"restaurant" }],

  // ══════════════════════════════════════════════════════════════
  // FAST FOOD — CHIPOTLE
  // ══════════════════════════════════════════════════════════════
  ["chipotle carnitas",             { floor:2, ceiling:4, substances:[], reason:"Pork shoulder + salt + juniper berries + bay leaf + thyme — genuinely clean, simplest protein at Chipotle", confidence:"high", category:"restaurant" }],
  ["chipotle sofritas",             { floor:4, ceiling:6, substances:[], reason:"Processed tofu blend (NOVA 3-4) — not the cleanest option despite being plant-based", confidence:"high", category:"restaurant" }],
  ["chipotle burrito",              { floor:4, ceiling:6, substances:[], reason:"Any protein + rice + beans + tortilla + toppings — high sodium from stacking multiple components", confidence:"high", category:"restaurant" }],
  ["chipotle bowl",                 { floor:3, ceiling:5, substances:[], reason:"No refined flour tortilla — meaningfully cleaner than burrito format", confidence:"high", category:"restaurant" }],

  // ══════════════════════════════════════════════════════════════
  // FAST FOOD — IN-N-OUT
  // ══════════════════════════════════════════════════════════════
  ["in-n-out double double",         { floor:4, ceiling:6, substances:["TBHQ","DATEM"], reason:"DATEM + TBHQ + sodium phosphate in cheese", confidence:"high", category:"restaurant" }],
  ["in-n-out double-double",        { floor:4, ceiling:6, substances:["TBHQ","DATEM"], reason:"DATEM in bun + TBHQ in frying oil + sodium phosphate in cheese. Fresh ≠ no additives. NOT a 2-3.", confidence:"high", category:"restaurant" }],
  ["in-n-out burger",              { floor:4, ceiling:6, substances:["TBHQ","DATEM"], reason:"DATEM + TBHQ + processed cheese. Fresh marketing ≠ clean score.", confidence:"high", category:"restaurant" }],
  ["in-n-out animal style",        { floor:5, ceiling:7, substances:["TBHQ","HFCS"], reason:"Animal style adds HFCS in thousand island dressing + extra processed cheese", confidence:"high", category:"restaurant" }],
  ["in-n-out protein style",       { floor:3, ceiling:5, substances:[], reason:"Lettuce wrap removes enriched flour bun — meaningfully cleaner", confidence:"high", category:"restaurant" }],

  // ══════════════════════════════════════════════════════════════
  // FAST FOOD — BREAKFAST ITEMS
  // ══════════════════════════════════════════════════════════════
  ["chick-fil-a chicken biscuit",   { floor:6, ceiling:8, substances:["TBHQ","MSG"], reason:"TBHQ + MSG in breading + enriched flour biscuit + high sodium. NEVER score below 6.", confidence:"high", category:"restaurant" }],
  ["starbucks egg bites",           { floor:3, ceiling:5, substances:[], reason:"Simple eggs + cheese — genuinely cleaner than fried fast food breakfast", confidence:"high", category:"restaurant" }],
  ["panera avocado toast",          { floor:2, ceiling:4, substances:[], reason:"Sourdough + avocado + seasoning — cleanest chain breakfast option", confidence:"high", category:"restaurant" }],
  ["dunkin bacon egg",               { floor:6, ceiling:8, substances:["sodium nitrite"], reason:"Sodium nitrite in bacon — floor fires", confidence:"high", category:"restaurant" }],
  ["dunkin' bacon egg",            { floor:6, ceiling:8, substances:["sodium nitrite"], reason:"Sodium nitrite in bacon + enriched croissant — floor fires. NEVER score below 6.", confidence:"high", category:"restaurant" }],
  ["mcdonald's hotcakes",          { floor:5, ceiling:7, substances:["HFCS","artificial maple"], reason:"HFCS + artificial maple flavor + enriched flour + sodium aluminum phosphate", confidence:"high", category:"restaurant" }],

  // ══════════════════════════════════════════════════════════════
  // PERSONAL HYGIENE
  // ══════════════════════════════════════════════════════════════
  ["summer's eve",                  { floor:5, ceiling:7, substances:["synthetic fragrance","parabens"], reason:"Synthetic fragrance + parabens applied to mucosal tissue daily — higher absorption than intact skin", confidence:"high", category:"personal_care" }],
  ["summers eve",                   { floor:5, ceiling:7, substances:["synthetic fragrance","parabens"], reason:"Synthetic fragrance + parabens on mucosal tissue", confidence:"high", category:"personal_care" }],
  ["vagisil",                       { floor:6, ceiling:8, substances:["benzocaine","synthetic fragrance","parabens"], reason:"Benzocaine — FDA warned against for genital use (methemoglobinemia risk) + fragrance + parabens", confidence:"high", category:"personal_care" }],
  ["honey pot feminine",            { floor:1, ceiling:3, substances:[], reason:"Natural botanical ingredients, no synthetic fragrance, no parabens — clean benchmark", confidence:"high", category:"personal_care" }],
  ["nair hair removal",             { floor:4, ceiling:6, substances:["calcium thioglycolate","synthetic fragrance"], reason:"Strong alkaline depilatory + synthetic fragrance left on skin 3-10 minutes", confidence:"high", category:"personal_care" }],
  ["veet hair removal",             { floor:4, ceiling:6, substances:["calcium thioglycolate","synthetic fragrance"], reason:"Calcium thioglycolate + synthetic fragrance — same mechanism as Nair", confidence:"high", category:"personal_care" }],
  ["visine eye drops",              { floor:4, ceiling:6, substances:["tetrahydrozoline","benzalkonium chloride"], reason:"Tetrahydrozoline — rebound redness dependency. BAK preservative — cilia toxin, eye sensitizer.", confidence:"high", category:"personal_care" }],
  ["rohto eye drops",               { floor:4, ceiling:6, substances:["tetrahydrozoline","menthol"], reason:"Tetrahydrozoline + menthol — harsh formula, dependency risk", confidence:"high", category:"personal_care" }],
  ["refresh tears",                  { floor:1, ceiling:3, substances:[], reason:"Single lubricant ingredient, no BAK in single-dose — benchmark clean eye drop", confidence:"high", category:"personal_care" }],
  ["gold bond medicated powder",    { floor:5, ceiling:7, substances:["talc"], reason:"Talc primary ingredient — talc mFloor:5 floor fires (IARC Group 2A perineal use)", confidence:"high", category:"personal_care" }],
  ["gold bond",                    { floor:5, ceiling:7, substances:["talc"], reason:"Gold Bond uses talc as primary ingredient in most powder products — talc floor fires", confidence:"high", category:"personal_care" }],
  ["gold bond foot powder",         { floor:5, ceiling:7, substances:["talc"], reason:"Talc floor fires — IARC Group 2A", confidence:"high", category:"personal_care" }],
  ["dr. scholl's foot powder",      { floor:5, ceiling:7, substances:["talc"], reason:"Talc floor fires", confidence:"high", category:"personal_care" }],
  ["ambi fade cream",               { floor:7, ceiling:9, substances:["hydroquinone"], reason:"Hydroquinone floor fires (mFloor:7) — FDA proposed ban, EU banned, DNA damage studies", confidence:"high", category:"personal_care" }],
  ["porcelana",                     { floor:7, ceiling:9, substances:["hydroquinone"], reason:"Hydroquinone 2% — same concern as Ambi, floor fires", confidence:"high", category:"personal_care" }],
  ["proactiv",                      { floor:4, ceiling:6, substances:["synthetic fragrance","parabens"], reason:"Benzoyl peroxide + synthetic fragrance + parabens + EDTA", confidence:"high", category:"personal_care" }],
  ["differin gel",                  { floor:1, ceiling:3, substances:[], reason:"Adapalene FDA-approved retinoid, no synthetic fragrance, minimal formula", confidence:"high", category:"personal_care" }],

  // ══════════════════════════════════════════════════════════════
  // REMAINING FAST FOOD CHAINS
  // ══════════════════════════════════════════════════════════════
  ["five guys burger",              { floor:4, ceiling:6, substances:["DATEM"], reason:"Fresh never-frozen beef, peanut oil (no TBHQ confirmed), enriched flour bun. Cleaner than McDonald's but not clean.", confidence:"high", category:"restaurant" }],
  ["five guys fries",              { floor:3, ceiling:5, substances:[], reason:"Peanut oil, potato, salt — no TBHQ, simpler than McDonald's fries", confidence:"high", category:"restaurant" }],
  ["shake shack shackburger",       { floor:4, ceiling:6, substances:[], reason:"Hormone-free beef, potato bun (simpler than enriched flour), no TBHQ confirmed", confidence:"high", category:"restaurant" }],
  ["shake shack burger",           { floor:4, ceiling:6, substances:[], reason:"Hormone-free beef, cleaner ingredients than McDonald's tier", confidence:"high", category:"restaurant" }],
  ["shake shack fries",            { floor:3, ceiling:5, substances:[], reason:"No TBHQ, crinkle cut, simpler than McDonald's fries", confidence:"high", category:"restaurant" }],
  ["sonic footlong coney",          { floor:6, ceiling:8, substances:["sodium nitrite"], reason:"Sodium nitrite in hot dog — IARC Group 1 floor fires. NEVER score below 6.", confidence:"high", category:"restaurant" }],
  ["sonic cherry limeade",          { floor:5, ceiling:7, substances:["HFCS","Red 40"], reason:"HFCS floor + Red 40 petroleum dye floor — both fire", confidence:"high", category:"restaurant" }],
  ["dairy queen blizzard",          { floor:5, ceiling:7, substances:["HFCS","corn syrup"], reason:"HFCS + corn syrup + artificial flavors in most flavors", confidence:"high", category:"restaurant" }],
  ["dq chicken strip",             { floor:6, ceiling:8, substances:["TBHQ","MSG"], reason:"TBHQ + MSG + enriched flour — floors fire. NEVER score below 6.", confidence:"high", category:"restaurant" }],
  ["jack in the box tacos",         { floor:6, ceiling:8, substances:["TBHQ"], reason:"Mechanically separated chicken + TBHQ in oil — TBHQ floor fires. NEVER score below 6.", confidence:"high", category:"restaurant" }],
  ["whataburger",                   { floor:5, ceiling:7, substances:["TBHQ"], reason:"TBHQ in frying oil + enriched flour bun + high sodium", confidence:"high", category:"restaurant" }],
  ["wingstop",                      { floor:6, ceiling:8, substances:["TBHQ","MSG"], reason:"TBHQ in soybean frying oil + MSG seasoning — TBHQ floor fires", confidence:"high", category:"restaurant" }],
  ["wingstop wings",               { floor:6, ceiling:8, substances:["TBHQ","MSG"], reason:"TBHQ in soybean frying oil + MSG seasoning + high sodium. NEVER score below 6.", confidence:"high", category:"restaurant" }],
  ["buffalo wild wings",            { floor:6, ceiling:8, substances:["TBHQ","MSG","HFCS"], reason:"TBHQ + MSG + HFCS in most sauces. NEVER score below 6.", confidence:"high", category:"restaurant" }],

  // ══════════════════════════════════════════════════════════════
  // CASUAL DINING CHAINS
  // ══════════════════════════════════════════════════════════════
  ["applebee's riblets",            { floor:7, ceiling:9, substances:["sodium nitrite","HFCS","extreme sodium"], reason:"Sodium nitrite in ribs + HFCS sauce + 3000mg sodium — both nitrite and extreme sodium floors fire", confidence:"high", category:"restaurant" }],
  ["chili's awesome blossom",       { floor:7, ceiling:9, substances:["TBHQ","extreme sodium"], reason:"TBHQ + 2700mg sodium — extreme sodium floor fires", confidence:"high", category:"restaurant" }],
  ["cheesecake factory pasta",      { floor:7, ceiling:9, substances:["extreme sodium"], reason:"3000mg+ sodium standard — extreme sodium floor fires. One of the highest sodium items in chain restaurants.", confidence:"high", category:"restaurant" }],
  ["denny's grand slam",           { floor:6, ceiling:8, substances:["sodium nitrite"], reason:"Sodium nitrite in bacon/sausage — floor fires", confidence:"high", category:"restaurant" }],
  ["ihop buttermilk pancakes",      { floor:5, ceiling:7, substances:["HFCS","enriched flour"], reason:"HFCS in syrup + enriched flour pancakes + high sodium breakfast", confidence:"high", category:"restaurant" }],

  // ══════════════════════════════════════════════════════════════
  // GROCERY — BREAKFAST CEREALS
  // ══════════════════════════════════════════════════════════════
  ["trix cereal",                   { floor:6, ceiling:8, substances:["Red 40","Yellow 6","Blue 1"], reason:"Three petroleum dyes — floors fire", confidence:"high", category:"food_beverage" }],
  ["cocoa puffs",                   { floor:5, ceiling:7, substances:["caramel color","HFCS"], reason:"HFCS + caramel color IV (4-MEI) + enriched corn flour", confidence:"high", category:"food_beverage" }],
  ["honey bunches of oats",         { floor:3, ceiling:5, substances:["BHT"], reason:"BHT preservative — floor fires. No petroleum dyes.", confidence:"high", category:"food_beverage" }],
  ["nature's path organic granola",  { floor:1, ceiling:3, substances:[], reason:"USDA Organic, no BHT, no petroleum dyes — benchmark clean granola", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // GROCERY — BREAKFAST BARS AND YOGURT
  // ══════════════════════════════════════════════════════════════
  ["nutri-grain",                  { floor:5, ceiling:7, substances:["Red 40","Blue 1","HFCS"], reason:"Petroleum dyes + HFCS in filling — two dye floors fire", confidence:"high", category:"food_beverage" }],
  ["nutri grain",               { floor:5, ceiling:7, substances:["Red 40","Blue 1","HFCS"], reason:"Red 40 + Blue 1 petroleum dyes in filling + HFCS — two dye floors fire", confidence:"high", category:"food_beverage" }],
  ["nutrigrain bar",                { floor:5, ceiling:7, substances:["Red 40","Blue 1","HFCS"], reason:"Petroleum dyes + HFCS — floors fire", confidence:"high", category:"food_beverage" }],
  ["yoplait light",                 { floor:5, ceiling:7, substances:["sucralose","acesulfame potassium","Red 40"], reason:"Two artificial sweeteners + petroleum dye — sucralose + acesulfame-K + Red 40 floors all fire", confidence:"high", category:"food_beverage" }],
  ["stonyfield organic plain",      { floor:1, ceiling:2, substances:[], reason:"USDA Organic milk + live cultures — 2 ingredients. Benchmark clean yogurt.", confidence:"high", category:"food_beverage" }],
  ["siggi's plain",                 { floor:1, ceiling:3, substances:[], reason:"Pasteurized skim milk + cultures — minimal formula, Icelandic skyr style", confidence:"high", category:"food_beverage" }],
  ["dannon activia",                { floor:3, ceiling:5, substances:["modified starch"], reason:"Added sugar + modified starch + natural flavors — conventional flavored yogurt", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // GROCERY — PACKAGED SNACKS
  // ══════════════════════════════════════════════════════════════
  ["fritos corn chips",             { floor:1, ceiling:3, substances:[], reason:"3 clean ingredients", confidence:"high", category:"food_beverage" }],
  ["pirates booty",                 { floor:1, ceiling:3, substances:[], reason:"Whole corn + aged white cheddar — no TBHQ, no petroleum dyes", confidence:"high", category:"food_beverage" }],
  ["annie's organic bunny crackers", { floor:1, ceiling:3, substances:[], reason:"USDA Organic, no petroleum dyes, no TBHQ", confidence:"high", category:"food_beverage" }],
  ["mary's gone crackers",          { floor:1, ceiling:2, substances:[], reason:"Organic seeds + organic brown rice — benchmark clean cracker", confidence:"high", category:"food_beverage" }],
  ["wasa",               { floor:1, ceiling:2, substances:[], reason:"Whole grain rye + water — 2 ingredients", confidence:"high", category:"food_beverage" }],
  ["lay's bbq",                     { floor:5, ceiling:7, substances:["HFCS","Red 40","artificial flavor"], reason:"HFCS + Red 40 petroleum dye — floors fire. Original Lay's = 3. BBQ = 6. Big quality gap within same brand.", confidence:"high", category:"food_beverage" }],
  ["lays bbq",                      { floor:5, ceiling:7, substances:["HFCS","Red 40"], reason:"HFCS + Red 40 dye floor fires", confidence:"high", category:"food_beverage" }],
  ["pringles original",             { floor:4, ceiling:6, substances:["TBHQ"], reason:"TBHQ floor fires + enriched corn flour + modified starch", confidence:"high", category:"food_beverage" }],
  ["chips ahoy",                    { floor:5, ceiling:7, substances:["HFCS","partially hydrogenated"], reason:"HFCS + partially hydrogenated soybean oil (trans fat) + enriched flour — multiple floors fire", confidence:"high", category:"food_beverage" }],
  ["siete grain-free",              { floor:1, ceiling:3, substances:[], reason:"Cassava + coconut + clean sweeteners — grain-free clean snack", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // GROCERY — BEVERAGES
  // ══════════════════════════════════════════════════════════════
  ["malk unsweetened",              { floor:1, ceiling:2, substances:[], reason:"Oats + water — minimal ingredients. Benchmark clean oat milk.", confidence:"high", category:"beverage" }],
  ["oatly oat milk",                { floor:3, ceiling:5, substances:["rapeseed oil","dipotassium phosphate"], reason:"Rapeseed oil + dipotassium phosphate + 10+ additives — significantly more processed than branding implies", confidence:"high", category:"beverage" }],
  ["califia farms oat",             { floor:3, ceiling:5, substances:["rapeseed oil","dipotassium phosphate"], reason:"Rapeseed oil + dipotassium phosphate + multiple additives — not the same as 2-ingredient oat milk", confidence:"high", category:"beverage" }],
  ["gt's synergy",                  { floor:1, ceiling:3, substances:[], reason:"Raw kombucha — live cultures, USDA Organic, 4g sugar. Benchmark clean kombucha.", confidence:"high", category:"beverage" }],
  ["health-ade kombucha",           { floor:1, ceiling:3, substances:[], reason:"Raw, live cultures, clean ingredients", confidence:"high", category:"beverage" }],
  ["kevita sparkling probiotic",    { floor:3, ceiling:5, kidsFloor:4, kidsCeiling:6, substances:["stevia","citric acid"], reason:"Pasteurized — live culture benefit contested. Not equivalent to raw kombucha.", confidence:"high", category:"beverage" }],
  ["gatorade zero",                 { floor:5, ceiling:7, kidsFloor:4, kidsCeiling:6, substances:["sucralose","acesulfame potassium","artificial dyes"], reason:"Two artificial sweeteners + petroleum dyes — sucralose + acesulfame-K + dye floors all fire. Not clean hydration.", confidence:"high", category:"beverage" }],
  ["powerade zero",                 { floor:5, ceiling:7, substances:["sucralose","Blue 1"], reason:"Sucralose floor + Blue 1 dye floor — both fire. Not clean hydration.", confidence:"high", category:"beverage" }],
  ["prime hydration",               { floor:4, ceiling:6, kidsFloor:6, kidsCeiling:8, substances:["sucralose","acesulfame potassium"], reason:"Sucralose + acesulfame-K — sucralose floor fires despite coconut water base", confidence:"high", category:"beverage" }],
  ["electrolit",                    { floor:2, ceiling:4, substances:[], reason:"Electrolytes + sucrose + fructose — no sucralose, no artificial dyes. Cleaner sports drink.", confidence:"high", category:"beverage" }],
  ["bolthouse farms",               { floor:4, ceiling:6, kidsFloor:6, kidsCeiling:8, substances:["carrageenan","sucralose"], reason:"Carrageenan in some + sucralose in protein blends — carrageenan floor fires", confidence:"medium", category:"beverage" }],

  // ══════════════════════════════════════════════════════════════
  // GROCERY — FROZEN FOODS
  // ══════════════════════════════════════════════════════════════
  ["birds eye steamfresh",          { floor:1, ceiling:2, substances:[], reason:"Frozen vegetables — no additives. Benchmark clean frozen food.", confidence:"high", category:"food_beverage" }],
  ["green giant steamers",          { floor:1, ceiling:2, substances:[], reason:"Just frozen vegetables — no additives", confidence:"high", category:"food_beverage" }],
  ["amy's organic burrito",         { floor:1, ceiling:3, substances:[], reason:"USDA Organic, whole ingredients — benchmark clean frozen meal", confidence:"high", category:"food_beverage" }],
  ["amy's frozen",                  { floor:1, ceiling:3, substances:[], reason:"USDA Organic line — genuinely clean frozen food", confidence:"high", category:"food_beverage" }],
  ["dr. praeger's",                 { floor:2, ceiling:4, substances:[], reason:"Whole plant ingredients, no petroleum dyes, no TBHQ", confidence:"high", category:"food_beverage" }],
  ["trader joe's mandarin orange chicken", { floor:5, ceiling:7, substances:["TBHQ"], reason:"TBHQ in frying oil — TBHQ floor fires. Most popular TJ frozen item.", confidence:"high", category:"food_beverage" }],
  ["morning star farms",            { floor:5, ceiling:7, substances:["TBHQ","BHA"], reason:"TBHQ + BHA in some products — BHA floor fires (mFloor:6). Plant-based ≠ clean.", confidence:"high", category:"food_beverage" }],
  ["boca burger",                   { floor:5, ceiling:7, substances:["BHA","TBHQ"], reason:"BHA + TBHQ + enriched flour + artificial flavors — BHA floor fires", confidence:"high", category:"food_beverage" }],
  ["digiorno pepperoni",            { floor:6, ceiling:8, substances:["sodium nitrite","TBHQ"], reason:"Sodium nitrite in pepperoni (IARC Group 1) + TBHQ — both floors fire", confidence:"high", category:"food_beverage" }],
  ["red baron pepperoni",           { floor:6, ceiling:8, substances:["sodium nitrite"], reason:"Sodium nitrite in pepperoni — floor fires", confidence:"high", category:"food_beverage" }],
  ["totino's pizza rolls",          { floor:6, ceiling:8, substances:["TBHQ","mechanically separated meat"], reason:"TBHQ floor fires + mechanically separated chicken + enriched flour", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // GROCERY — CONDIMENTS
  // ══════════════════════════════════════════════════════════════
  ["frank's redhot",                { floor:1, ceiling:2, substances:[], reason:"Distilled vinegar + aged cayenne + salt — 3 clean ingredients. Benchmark clean hot sauce.", confidence:"high", category:"food_beverage" }],
  ["franks redhot",                 { floor:1, ceiling:2, substances:[], reason:"3 clean ingredients — benchmark", confidence:"high", category:"food_beverage" }],
  ["tabasco",                       { floor:1, ceiling:2, substances:[], reason:"Distilled vinegar + red peppers + salt — 3 ingredients", confidence:"high", category:"food_beverage" }],
  ["cholula",                       { floor:1, ceiling:3, substances:[], reason:"Clean — peppers + spices, no HFCS, no artificial anything", confidence:"high", category:"food_beverage" }],
  ["heinz yellow mustard",          { floor:1, ceiling:2, substances:[], reason:"Distilled vinegar + mustard seed + turmeric — clean", confidence:"high", category:"food_beverage" }],
  ["french's yellow mustard",       { floor:1, ceiling:2, substances:[], reason:"Same clean formula as Heinz mustard", confidence:"high", category:"food_beverage" }],
  ["raos marinara",               { floor:1, ceiling:3, substances:["tomatoes","olive oil","basil","garlic"], reason:"Rao's Marinara — same benchmark clean profile.", confidence:"high", category:"food_beverage" }],
  ["rao's marinara",                { floor:1, ceiling:2, substances:[], reason:"Olive oil + San Marzano tomatoes + simple herbs. Benchmark clean pasta sauce.", confidence:"high", category:"food_beverage" }],
  ["prego traditional",             { floor:3, ceiling:5, substances:["HFCS"], reason:"HFCS + citric acid + natural flavors — HFCS floor fires", confidence:"high", category:"food_beverage" }],
  ["ragu traditional",              { floor:4, ceiling:6, substances:["HFCS","soybean oil"], reason:"HFCS + soybean oil + caramel color — floor fires. NEVER score same as Rao's.", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // GROCERY — DELI MEAT AND PROTEIN
  // ══════════════════════════════════════════════════════════════
  ["safe catch elite tuna",         { floor:1, ceiling:3, substances:[], reason:"Every can individually mercury tested — highest standard in canned tuna, BPA-free can", confidence:"high", category:"food_beverage" }],
  ["wild planet tuna",              { floor:2, ceiling:4, substances:[], reason:"BPA-free can lining, skipjack (lowest mercury), olive oil packed", confidence:"high", category:"food_beverage" }],
  ["diestel",                       { floor:1, ceiling:3, substances:[], reason:"Genuinely no nitrites — no sodium nitrite, no celery juice. Benchmark clean deli meat.", confidence:"high", category:"food_beverage" }],
  ["diestel turkey",                { floor:1, ceiling:3, substances:[], reason:"Genuinely no nitrites — no sodium nitrite, no celery juice powder. Benchmark clean deli turkey.", confidence:"high", category:"food_beverage" }],
  ["oscar mayer deli fresh",        { floor:6, ceiling:7, substances:["sodium nitrite"], reason:"Sodium nitrite — IARC Group 1 floor fires", confidence:"high", category:"food_beverage" }],
  ["hillshire farm turkey",         { floor:6, ceiling:7, substances:["sodium nitrite"], reason:"Sodium nitrite — floor fires", confidence:"high", category:"food_beverage" }],
  ["applegate naturals turkey",     { floor:4, ceiling:6, substances:["celery juice"], reason:"Celery juice powder — same nitrite exposure as conventional, just labeled 'uncured'. Not clean.", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // PANTRY — COOKING OILS AND FATS
  // ══════════════════════════════════════════════════════════════
  ["organic valley butter",         { floor:1, ceiling:2, substances:[], reason:"USDA Organic, just cream + salt", confidence:"high", category:"food_beverage" }],
  ["land o'lakes butter",           { floor:1, ceiling:3, substances:[], reason:"Cream + salt — 2 ingredients, low concern", confidence:"high", category:"food_beverage" }],
  ["chosen foods avocado oil",      { floor:1, ceiling:2, substances:[], reason:"Pure avocado oil — no TBHQ, no propellants with additives", confidence:"high", category:"food_beverage" }],
  ["crisco",                       { floor:5, ceiling:9, substances:["TBHQ","partially hydrogenated"], reason:"TBHQ in oil variants; partially hydrogenated = trans fat floor. Check label.", confidence:"high", category:"food_beverage" }],
  ["crisco shortening",             { floor:6, ceiling:9, substances:["partially hydrogenated"], reason:"Partially hydrogenated soybean oil — trans fat floor fires (mFloor:8) if partially hydrogenated listed", confidence:"high", category:"food_beverage" }],
  ["crisco vegetable oil",          { floor:4, ceiling:6, substances:["TBHQ"], reason:"Soybean oil + TBHQ — TBHQ floor fires", confidence:"high", category:"food_beverage" }],
  ["pam",                          { floor:4, ceiling:6, substances:["TBHQ"], reason:"TBHQ in most PAM cooking spray variants — floor fires", confidence:"high", category:"food_beverage" }],
  ["pam spray",                   { floor:4, ceiling:6, substances:["TBHQ"], reason:"TBHQ in most PAM variants — floor fires", confidence:"high", category:"food_beverage" }],
  ["pam original spray",            { floor:4, ceiling:6, substances:["TBHQ","dimethylsilicone"], reason:"TBHQ + dimethylsilicone antifoam — TBHQ floor fires. NEVER score PAM below 4.", confidence:"high", category:"food_beverage" }],
  ["pam cooking spray",             { floor:4, ceiling:6, substances:["TBHQ"], reason:"TBHQ in most PAM variants — floor fires", confidence:"high", category:"food_beverage" }],
  ["pam butter spray",              { floor:4, ceiling:6, substances:["TBHQ","artificial flavor"], reason:"TBHQ + artificial butter flavor — floor fires", confidence:"high", category:"food_beverage" }],
  ["smart balance",                 { floor:3, ceiling:5, substances:["EDTA","palm oil"], reason:"Soybean + canola + palm + EDTA + natural flavors — processed butter substitute", confidence:"high", category:"food_beverage" }],
  ["i can't believe it's not butter",{ floor:3, ceiling:5, substances:["EDTA","palm oil"], reason:"Soy + palm + EDTA + natural flavors — processed butter substitute", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // PANTRY — SWEETENERS
  // ══════════════════════════════════════════════════════════════
  ["splenda",                        { floor:5, ceiling:7, kidsFloor:6, kidsCeiling:8, substances:["sucralose"], reason:"The product IS sucralose — sucralose floor fires on entire product. NEVER score below 5.", confidence:"high", category:"food_beverage" }],
  ["equal",                        { floor:5, ceiling:7, kidsFloor:7, kidsCeiling:9, substances:["aspartame"], reason:"Product IS aspartame — IARC 2B 2023 floor fires", confidence:"high", category:"food_beverage" }],
  ["equal packet",                 { floor:5, ceiling:7, kidsFloor:7, kidsCeiling:9, substances:["aspartame"], reason:"Product IS aspartame — IARC 2B 2023 floor fires", confidence:"high", category:"food_beverage" }],
  ["equal sweetener",               { floor:5, ceiling:7, kidsFloor:7, kidsCeiling:9, substances:["aspartame"], reason:"The product IS aspartame — aspartame floor fires (IARC 2B 2023). NEVER score below 5.", confidence:"high", category:"food_beverage" }],
  ["sweet'n low",                   { floor:3, ceiling:5, kidsFloor:5, kidsCeiling:7, substances:["saccharin"], reason:"Saccharin — bladder cancer in rodents, IARC removed Group 2B but concern remains", confidence:"high", category:"food_beverage" }],
  ["sweet n low",                   { floor:3, ceiling:5, kidsFloor:5, kidsCeiling:7, substances:["saccharin"], reason:"Saccharin — concern remains despite IARC reclassification", confidence:"high", category:"food_beverage" }],
  ["truvia",                        { floor:2, ceiling:4, kidsFloor:6, kidsCeiling:8, substances:[], reason:"Erythritol + stevia extract — no sucralose, no aspartame. Cleaner than Splenda/Equal.", confidence:"high", category:"food_beverage" }],
  ["swerve sweetener",              { floor:2, ceiling:4, kidsFloor:6, kidsCeiling:8, substances:[], reason:"Erythritol + oligosaccharides — no sucralose, no aspartame", confidence:"high", category:"food_beverage" }],
  ["lakanto monk fruit",            { floor:1, ceiling:3, kidsFloor:6, kidsCeiling:8, substances:[], reason:"Erythritol + monk fruit extract — no sucralose, cleanest mainstream sweetener", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // PANTRY — RICE AND MICROPLASTIC CONCERN
  // ══════════════════════════════════════════════════════════════
  ["success boil",                 { floor:4, ceiling:6, substances:["heated plastic"], reason:"Plastic bag + boiling water — heated plastic food contact", confidence:"high", category:"food_beverage" }],
  ["success boil-in-bag rice",      { floor:4, ceiling:6, substances:["heated plastic"], reason:"HDPE/LLDPE bag + boiling water — heated plastic food contact, same concern class as K-Cup pods", confidence:"high", category:"food_beverage" }],
  ["success boil in bag",           { floor:4, ceiling:6, substances:["heated plastic"], reason:"Heated plastic bag — microplastic release concern", confidence:"high", category:"food_beverage" }],
  ["minute rice",                  { floor:4, ceiling:6, substances:["polypropylene"], reason:"PP microwaveable cup — heated PP food contact", confidence:"high", category:"food_beverage" }],
  ["minute rice cup",               { floor:4, ceiling:6, substances:["polypropylene"], reason:"PP microwaveable cup — heated PP food contact concern", confidence:"high", category:"food_beverage" }],
  ["lundberg organic brown rice",   { floor:1, ceiling:2, substances:[], reason:"USDA Organic, just rice — benchmark clean rice", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // PANTRY — CANNED GOODS
  // ══════════════════════════════════════════════════════════════
  ["eden organic",                 { floor:1, ceiling:2, substances:[], reason:"BPA-free can + USDA Organic — benchmark clean canned food", confidence:"high", category:"food_beverage" }],
  ["eden organic beans",            { floor:1, ceiling:2, substances:[], reason:"BPA-free can lining + USDA Organic — benchmark clean canned bean", confidence:"high", category:"food_beverage" }],
  ["muir glen organic",             { floor:1, ceiling:2, substances:[], reason:"BPA-free can + USDA Organic — benchmark clean canned tomato", confidence:"high", category:"food_beverage" }],
  ["bush's best",                { floor:6, ceiling:7, substances:["HFCS","sodium nitrite"], reason:"HFCS + sodium nitrite from bacon — both floors fire", confidence:"high", category:"food_beverage" }],
  ["bush's baked beans",            { floor:6, ceiling:7, substances:["HFCS","sodium nitrite"], reason:"HFCS + sodium nitrite from bacon — both floors fire", confidence:"high", category:"food_beverage" }],
  ["campbell's cream of mushroom",  { floor:4, ceiling:6, substances:["yeast extract","modified starch"], reason:"870mg sodium + yeast extract (hidden MSG) + modified starch + BPA-lined can", confidence:"high", category:"food_beverage" }],
  ["swanson chicken broth",         { floor:3, ceiling:5, substances:["yeast extract"], reason:"Yeast extract = hidden free glutamates (functional MSG equivalent) + BPA-lined can", confidence:"high", category:"food_beverage" }],
  ["amy's organic",              { floor:1, ceiling:3, substances:[], reason:"USDA Organic, BPA-free — clean across Amy's product line", confidence:"high", category:"food_beverage" }],
  ["amy's organic soup",            { floor:1, ceiling:3, substances:[], reason:"BPA-free can + USDA Organic + lower sodium", confidence:"high", category:"food_beverage" }],
  ["progresso soup",                { floor:3, ceiling:5, substances:["high sodium","modified starch"], reason:"800-1000mg sodium per serving + modified starch + BPA-lined can", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // PANTRY — JAMS AND SPREADS
  // ══════════════════════════════════════════════════════════════
  ["bonne maman",                  { floor:1, ceiling:3, substances:[], reason:"Real sugar + fruit — no HFCS, benchmark clean jam", confidence:"high", category:"food_beverage" }],
  ["bonne maman jam",               { floor:1, ceiling:3, substances:[], reason:"Real sugar + fruit — no HFCS, no artificial flavors. Benchmark clean jam.", confidence:"high", category:"food_beverage" }],
  ["polaner all fruit",             { floor:1, ceiling:2, substances:[], reason:"Fruit juice concentrate only — no added sugar, no HFCS", confidence:"high", category:"food_beverage" }],
  ["wholly guacamole",              { floor:1, ceiling:2, substances:[], reason:"Avocado + lime + onion + jalapeño — clean, no additives", confidence:"high", category:"food_beverage" }],
  ["smucker's strawberry jam",      { floor:4, ceiling:6, substances:["HFCS","artificial flavors"], reason:"HFCS + artificial flavors — floor fires. Different product from Smucker's Natural PB.", confidence:"high", category:"food_beverage" }],
  ["smucker's jam",                 { floor:4, ceiling:6, substances:["HFCS"], reason:"HFCS in standard jam line — floor fires", confidence:"high", category:"food_beverage" }],
  ["tostitos queso dip",            { floor:4, ceiling:6, substances:["sodium phosphate","artificial colors"], reason:"Modified starch + sodium phosphate + artificial colors", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // PROTEIN POWDERS
  // ══════════════════════════════════════════════════════════════
  ["naked whey",                    { floor:1, ceiling:2, substances:[], reason:"Just whey protein concentrate — 1 ingredient. Benchmark clean protein powder.", confidence:"high", category:"supplement" }],
  ["naked mass",                    { floor:1, ceiling:3, substances:[], reason:"Whey + casein + maltodextrin — clean gainer, no artificial sweeteners", confidence:"high", category:"supplement" }],
  ["garden of life sport",          { floor:1, ceiling:3, substances:[], reason:"USDA Organic + NSF Certified for Sport — benchmark clean protein", confidence:"high", category:"supplement" }],
  ["truvani protein",               { floor:1, ceiling:3, substances:[], reason:"USDA Organic, 4 ingredients, stevia sweetened — no sucralose", confidence:"high", category:"supplement" }],
  ["vega sport protein",            { floor:2, ceiling:4, substances:[], reason:"Pea protein + stevia — no sucralose, no artificial dyes", confidence:"high", category:"supplement" }],
  ["orgain organic protein",        { floor:2, ceiling:4, substances:[], reason:"USDA Organic in most lines — check for stevia vs sucralose in specific SKU", confidence:"medium", category:"supplement" }],
  ["optimum nutrition gold standard",{ floor:4, ceiling:6, kidsFloor:6, kidsCeiling:8, substances:["sucralose","acesulfame potassium"], reason:"Sucralose + acesulfame-K + artificial flavors — both floors fire", confidence:"high", category:"supplement" }],
  ["myprotein impact whey",         { floor:4, ceiling:6, kidsFloor:6, kidsCeiling:8, substances:["sucralose"], reason:"Sucralose floor fires + artificial flavors", confidence:"high", category:"supplement" }],
  ["dymatize iso100",               { floor:4, ceiling:6, kidsFloor:6, kidsCeiling:8, substances:["sucralose","acesulfame potassium"], reason:"Sucralose + acesulfame-K — both floors fire", confidence:"high", category:"supplement" }],
  ["isopure zero carb",             { floor:4, ceiling:6, kidsFloor:6, kidsCeiling:8, substances:["sucralose","acesulfame potassium"], reason:"Sucralose + acesulfame-K floors fire", confidence:"high", category:"supplement" }],

  // ══════════════════════════════════════════════════════════════
  // PANTRY — PASTA AND BREAD
  // ══════════════════════════════════════════════════════════════
  ["sara lee white bread",          { floor:4, ceiling:6, substances:["HFCS","DATEM"], reason:"HFCS + DATEM + calcium propionate — floor fires", confidence:"high", category:"food_beverage" }],
  ["dave's killer bread organic",   { floor:1, ceiling:3, substances:[], reason:"USDA Organic, whole grains, no HFCS", confidence:"high", category:"food_beverage" }],
  ["banza",                        { floor:1, ceiling:3, substances:[], reason:"Chickpea flour + tapioca — clean alternative pasta", confidence:"high", category:"food_beverage" }],
  ["banza pasta",                   { floor:1, ceiling:3, substances:[], reason:"Chickpea flour + tapioca + pea protein — clean alternative pasta", confidence:"high", category:"food_beverage" }],
  ["jovial",                       { floor:1, ceiling:2, substances:[], reason:"USDA Organic — benchmark clean pasta brand", confidence:"high", category:"food_beverage" }],
  ["jovial pasta",                  { floor:1, ceiling:2, substances:[], reason:"USDA Organic brown rice flour only — benchmark clean pasta", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // KIDS FRUIT SNACKS
  // ══════════════════════════════════════════════════════════════
  ["welch's fruit snacks",          { floor:5, ceiling:7, substances:["HFCS","Red 40","artificial dyes"], reason:"HFCS + petroleum dyes in daily children's snack — multiple floors fire, child vulnerability", confidence:"high", category:"food_beverage" }],
  ["welchs fruit snacks",           { floor:5, ceiling:7, substances:["HFCS","artificial dyes"], reason:"HFCS + artificial dyes — child daily snack, floors fire", confidence:"high", category:"food_beverage" }],
  ["mott's",                       { floor:3, ceiling:5, substances:["corn syrup","added sugar","ultra-processed"], reason:"Mott's brand default. Most lines reformulated (applesauce unsweetened, fruit snacks) to remove artificial colors and flavors. Corn syrup base on many products. Verify specific SKU before applying hard floor.", confidence:"medium", category:"food_beverage", verified:"2026-04-17" }],
  ["mott's fruit snacks",           { floor:3, ceiling:5, kidsFloor:4, kidsCeiling:6, substances:["corn syrup","sugar","modified corn starch","carnauba wax"], reason:"Mott's Fruit Snacks. REFORMULATED. No artificial colors (natural from vegetable juice, fruit juice, annatto, turmeric). No artificial flavors, no gelatin, no HFCS. Corn syrup + sugar first two ingredients. 9g sugar per 45g pouch (36 percent kids DV, 18 percent adult DV). 100 percent DV Vitamin C. Still NOVA 4 ultra-processed.", confidence:"high", category:"food_beverage", verified:"2026-04-17" }],
  ["annie's organic fruit snacks",  { floor:1, ceiling:3, substances:[], reason:"USDA Organic, no HFCS, no artificial dyes — benchmark clean kids fruit snack", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // DAIRY CASE
  // ══════════════════════════════════════════════════════════════
  ["daisy sour cream",              { floor:1, ceiling:2, substances:[], reason:"Grade A cream, one ingredient — no fillers, no modified starch. Benchmark clean sour cream.", confidence:"high", category:"food_beverage" }],
  ["daisy cottage cheese",          { floor:1, ceiling:2, substances:[], reason:"Milk + cream + salt — simple, no additives", confidence:"high", category:"food_beverage" }],
  ["tillamook",                     { floor:1, ceiling:3, substances:[], reason:"Natural cheese — milk + salt + cultures + enzymes, no artificial additives", confidence:"high", category:"food_beverage" }],
  ["sargento",                      { floor:1, ceiling:3, substances:[], reason:"Natural cheese — just cheese, no additives. NEVER score same as Kraft Singles.", confidence:"high", category:"food_beverage" }],
  ["vital farms",                  { floor:1, ceiling:2, substances:[], reason:"Pastured eggs or butter — clean, simple ingredients", confidence:"high", category:"food_beverage" }],
  ["vital farms eggs",              { floor:1, ceiling:2, substances:[], reason:"Pastured eggs — just eggs", confidence:"high", category:"food_beverage" }],
  ["vital farms butter",            { floor:1, ceiling:2, substances:[], reason:"Pastured cream + salt — clean butter", confidence:"high", category:"food_beverage" }],
  ["pete and gerry's organic",      { floor:1, ceiling:2, substances:[], reason:"USDA Organic cage-free eggs — clean", confidence:"high", category:"food_beverage" }],
  ["laughing cow",                  { floor:3, ceiling:5, substances:["sodium citrate","sorbic acid"], reason:"Processed cheese spread — sodium citrate + sorbic acid + not real cheese", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // HOT DOGS AND FRANKFURTERS
  // ══════════════════════════════════════════════════════════════
  ["ball park franks",              { floor:6, ceiling:8, substances:["sodium nitrite","corn syrup"], reason:"Sodium nitrite (IARC Group 1) + corn syrup + sodium phosphate — NEVER score below 6", confidence:"high", category:"food_beverage" }],
  ["ball park beef franks",         { floor:6, ceiling:8, substances:["sodium nitrite"], reason:"Sodium nitrite floor fires — IARC Group 1", confidence:"high", category:"food_beverage" }],
  ["hebrew national",               { floor:6, ceiling:8, substances:["sodium nitrite"], reason:"Sodium nitrite — kosher label does not mean nitrite-free. NEVER score below 6.", confidence:"high", category:"food_beverage" }],
  ["oscar mayer wieners",           { floor:6, ceiling:8, substances:["sodium nitrite","BHA","corn syrup"], reason:"Sodium nitrite + BHA + corn syrup — three floors fire simultaneously", confidence:"high", category:"food_beverage" }],
  ["oscar mayer classic",           { floor:6, ceiling:8, substances:["sodium nitrite","BHA"], reason:"Sodium nitrite + BHA — both floors fire", confidence:"high", category:"food_beverage" }],
  ["eckrich",                      { floor:6, ceiling:8, substances:["sodium nitrite"], reason:"Sodium nitrite — IARC Group 1 floor fires", confidence:"high", category:"food_beverage" }],
  ["eckrich sausage",               { floor:6, ceiling:8, substances:["sodium nitrite"], reason:"Sodium nitrite — floor fires. NEVER score below 6.", confidence:"high", category:"food_beverage" }],
  ["applegate hot dogs",            { floor:4, ceiling:6, substances:["celery juice"], reason:"Celery juice powder = nitrite loophole — same nitrosamine chemistry. NEVER score as clean.", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // FROZEN BREAKFAST WITH PROCESSED MEAT
  // ══════════════════════════════════════════════════════════════
  ["jimmy dean sausage",            { floor:6, ceiling:8, substances:["sodium nitrite","DATEM"], reason:"Sodium nitrite in sausage + enriched flour + DATEM — nitrite floor fires. NEVER score below 6.", confidence:"high", category:"food_beverage" }],
  ["hot pockets",                   { floor:6, ceiling:8, substances:["sodium nitrite","TBHQ","DATEM"], reason:"Sodium nitrite + TBHQ + DATEM — multiple floors fire simultaneously. NEVER score below 6.", confidence:"high", category:"food_beverage" }],
  ["lean pockets",                  { floor:6, ceiling:7, substances:["sodium nitrite","DATEM"], reason:"Sodium nitrite in meat filling + DATEM — floor fires", confidence:"high", category:"food_beverage" }],
  ["kashi waffles",                 { floor:2, ceiling:4, substances:[], reason:"Whole grain, no HFCS — meaningfully cleaner than Eggo", confidence:"high", category:"food_beverage" }],
  ["van's",                       { floor:1, ceiling:3, substances:[], reason:"Whole grain gluten-free, clean — benchmark clean waffle", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // RETAIL CHICKEN NUGGETS
  // ══════════════════════════════════════════════════════════════
  ["tyson chicken nuggets",         { floor:5, ceiling:7, substances:["TBHQ","modified starch"], reason:"TBHQ in frying oil — floor fires. Retail version same concern as fast food.", confidence:"high", category:"food_beverage" }],
  ["perdue chicken nuggets",        { floor:5, ceiling:7, substances:["TBHQ"], reason:"TBHQ in frying oil — floor fires", confidence:"high", category:"food_beverage" }],
  ["applegate organics chicken nuggets",{ floor:2, ceiling:4, substances:[], reason:"USDA Organic, no TBHQ — benchmark clean frozen nugget", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // WHOLE FOODS — single-ingredient items where the product IS the
  // ingredient. These exist so direct queries like "atlantic salmon",
  // "chicken breast", "eggs" hit calibration before falling through
  // to the cascade. The whole-foods detector in scoringCascade.js
  // catches everything else (brand-prefixed, unusual phrasing, etc.).
  // Tier rationale: wild fish + plain produce + eggs = floor 1-3,
  // farmed fish + conventional poultry/dairy = 2-4, conventional red
  // meat = 3-5, processed meats = 5-7. See detectWholeFood() for the
  // full tier mapping.
  // ══════════════════════════════════════════════════════════════
  // Salmon variants
  ["atlantic salmon",                { floor:2, ceiling:4, substances:["farmed fish","trace PCBs"], reason:"Farmed Atlantic salmon — typically carries higher PCB and contaminant load than wild caught due to feed and pen conditions. Color is added via astaxanthin. Still a clean protein source with omega-3s, just one tier below wild Pacific salmon.", confidence:"high", category:"food_beverage" }],
  ["wild salmon",                    { floor:1, ceiling:3, substances:[], reason:"Wild-caught salmon — clean protein with omega-3s. Lower contaminant load than farmed. Sockeye, coho, and chinook are the cleanest tier.", confidence:"high", category:"food_beverage" }],
  ["wild caught salmon",             { floor:1, ceiling:3, substances:[], reason:"Wild-caught salmon — benchmark clean protein source with high omega-3 density.", confidence:"high", category:"food_beverage" }],
  ["sockeye salmon",                 { floor:1, ceiling:3, substances:[], reason:"Sockeye salmon — wild-caught Pacific. Among the cleanest seafood available, high omega-3 and astaxanthin.", confidence:"high", category:"food_beverage" }],
  ["coho salmon",                    { floor:1, ceiling:3, substances:[], reason:"Coho salmon — wild-caught Pacific. Clean omega-3 protein.", confidence:"high", category:"food_beverage" }],
  ["king salmon",                    { floor:1, ceiling:3, substances:[], reason:"King (chinook) salmon — wild-caught Pacific. Clean omega-3 protein with rich flavor profile.", confidence:"high", category:"food_beverage" }],
  ["chinook salmon",                 { floor:1, ceiling:3, substances:[], reason:"Chinook salmon — wild-caught Pacific. Clean omega-3 protein.", confidence:"high", category:"food_beverage" }],
  ["farmed salmon",                  { floor:2, ceiling:4, substances:["farmed fish","trace PCBs"], reason:"Farmed salmon — higher PCB and contaminant load than wild caught due to feed and pen conditions. Still clean protein, just below the wild-caught tier.", confidence:"high", category:"food_beverage" }],
  ["salmon",                         { floor:2, ceiling:4, substances:[], reason:"Salmon — clean protein with omega-3s. Score reflects typical range; wild Pacific is the cleanest tier (1-3) and farmed Atlantic carries higher PCB load (2-4).", confidence:"high", category:"food_beverage" }],
  // Trader Joe's specific salmon SKUs
  ["trader joes pro cut atlantic salmon",{ floor:2, ceiling:4, substances:["farmed fish","trace PCBs"], reason:"Trader Joe's Pro Cut Atlantic Salmon — farmed Atlantic, typical contaminant profile (higher PCB and dioxin load than wild Pacific). Color from astaxanthin in feed. Clean protein with omega-3s, just below the wild-caught benchmark. Trader Joe's sources from Norway and Chile depending on availability.", confidence:"high", category:"food_beverage" }],
  ["trader joes atlantic salmon",    { floor:2, ceiling:4, substances:["farmed fish","trace PCBs"], reason:"Trader Joe's Atlantic Salmon — farmed Atlantic, typical contaminant profile. Clean protein source with omega-3s; one tier below wild Pacific.", confidence:"high", category:"food_beverage" }],
  ["trader joes wild salmon",        { floor:1, ceiling:3, substances:[], reason:"Trader Joe's Wild Salmon — Pacific wild-caught. Clean omega-3 protein, benchmark clean tier.", confidence:"high", category:"food_beverage" }],
  // Other whole fish
  ["wild shrimp",                    { floor:1, ceiling:3, substances:[], reason:"Wild-caught shrimp — clean lean protein, low mercury.", confidence:"high", category:"food_beverage" }],
  ["shrimp",                         { floor:2, ceiling:4, substances:[], reason:"Shrimp — clean protein. Wild domestic is cleanest; imported farmed varieties carry higher antibiotic and PCB exposure.", confidence:"high", category:"food_beverage" }],
  ["cod",                            { floor:1, ceiling:3, substances:[], reason:"Cod — wild-caught, lean white fish, very low mercury and contaminants.", confidence:"high", category:"food_beverage" }],
  ["halibut",                        { floor:1, ceiling:3, substances:[], reason:"Halibut — clean wild-caught white fish, low contaminant load.", confidence:"high", category:"food_beverage" }],
  ["sardines",                       { floor:1, ceiling:3, substances:[], reason:"Sardines — small oily fish, exceptional omega-3 density with very low mercury. Among the cleanest seafood available.", confidence:"high", category:"food_beverage" }],
  ["anchovies",                      { floor:1, ceiling:3, substances:[], reason:"Anchovies — small oily fish, low mercury, excellent omega-3 source.", confidence:"high", category:"food_beverage" }],
  ["mackerel",                       { floor:1, ceiling:3, substances:[], reason:"Mackerel (Atlantic / Pacific) — high omega-3 with low mercury. King mackerel is the exception (high mercury) — avoid that specific variety.", confidence:"high", category:"food_beverage" }],
  ["tuna",                           { floor:2, ceiling:4, substances:["mercury concern"], reason:"Tuna — high protein and omega-3s but mercury accumulation is real. Skipjack and chunk light have lower mercury than albacore or yellowfin. Limit to 2-3 servings/week.", confidence:"high", category:"food_beverage" }],
  // Eggs
  ["eggs",                           { floor:1, ceiling:3, substances:[], reason:"Whole eggs — complete protein, B12, choline. Pasture-raised eggs have measurably higher omega-3 and vitamin D than conventional. Look for Certified Humane or Animal Welfare Approved.", confidence:"high", category:"food_beverage" }],
  ["chicken eggs",                   { floor:1, ceiling:3, substances:[], reason:"Chicken eggs — complete protein, B12, choline. Clean whole food.", confidence:"high", category:"food_beverage" }],
  ["pasture raised eggs",            { floor:1, ceiling:3, substances:[], reason:"Pasture-raised eggs — measurably higher omega-3 and vitamin D content than conventional. Cleanest egg tier.", confidence:"high", category:"food_beverage" }],
  ["organic eggs",                   { floor:1, ceiling:3, substances:[], reason:"Organic eggs — no synthetic pesticides in feed, no antibiotics. Clean whole food protein.", confidence:"high", category:"food_beverage" }],
  // Conventional poultry
  ["chicken breast",                 { floor:2, ceiling:4, substances:[], reason:"Conventional chicken breast — lean protein. Look for organic and pasture-raised for lower antibiotic exposure and better omega-3 ratios.", confidence:"high", category:"food_beverage" }],
  ["chicken thighs",                 { floor:2, ceiling:4, substances:[], reason:"Conventional chicken thighs — lean protein with slightly more saturated fat than breast but more nutrients. Look for organic and pasture-raised when possible.", confidence:"high", category:"food_beverage" }],
  ["whole chicken",                  { floor:2, ceiling:4, substances:[], reason:"Whole chicken — clean lean protein. Organic and pasture-raised carry meaningfully lower antibiotic exposure.", confidence:"high", category:"food_beverage" }],
  ["ground turkey",                  { floor:2, ceiling:4, substances:[], reason:"Ground turkey — lean protein. Conventional carries trace antibiotic exposure; organic and pasture-raised are cleaner.", confidence:"high", category:"food_beverage" }],
  ["ground chicken",                 { floor:2, ceiling:4, substances:[], reason:"Ground chicken — lean protein. Organic and pasture-raised reduce antibiotic exposure.", confidence:"high", category:"food_beverage" }],
  // Conventional red meat
  ["ground beef",                    { floor:3, ceiling:5, substances:["conventional beef"], reason:"Conventional ground beef — feedlot-raised cattle have higher hormone, antibiotic, and saturated fat profiles. Grass-fed and pasture-raised have measurably better omega-3 ratios. Look for 100% grass-fed labels (not just 'grass-fed') to avoid grain-finished beef.", confidence:"high", category:"food_beverage" }],
  ["grass fed ground beef",          { floor:1, ceiling:3, substances:[], reason:"Grass-fed ground beef — better omega-3 ratio, no feedlot hormones or antibiotics. Cleanest red meat tier.", confidence:"high", category:"food_beverage" }],
  ["ribeye",                         { floor:3, ceiling:5, substances:["conventional beef"], reason:"Ribeye — conventional feedlot-raised. Grass-fed has measurably better fat profile.", confidence:"high", category:"food_beverage" }],
  ["sirloin",                        { floor:3, ceiling:5, substances:["conventional beef"], reason:"Sirloin — leaner cut but conventional beef carries feedlot exposure. Grass-fed is cleaner.", confidence:"high", category:"food_beverage" }],
  ["beef",                           { floor:3, ceiling:5, substances:["conventional beef"], reason:"Beef — conventional feedlot-raised carries higher hormone, antibiotic, and saturated fat profiles. Grass-fed and pasture-raised significantly cleaner.", confidence:"high", category:"food_beverage" }],
  ["steak",                          { floor:3, ceiling:5, substances:["conventional beef"], reason:"Steak — conventional beef carries feedlot exposure. Grass-fed has measurably better omega ratio and lower inflammatory load.", confidence:"high", category:"food_beverage" }],
  ["pork chop",                      { floor:3, ceiling:5, substances:["conventional pork"], reason:"Pork chop — conventional pigs raised in CAFOs carry higher antibiotic and arsenic exposure. Pasture-raised heritage breeds are cleaner.", confidence:"high", category:"food_beverage" }],
  ["pork tenderloin",                { floor:3, ceiling:5, substances:["conventional pork"], reason:"Pork tenderloin — leaner cut but conventional sourcing carries CAFO exposure. Heritage breeds cleaner.", confidence:"high", category:"food_beverage" }],
  // Plain dairy
  ["whole milk",                     { floor:2, ceiling:4, substances:[], reason:"Whole milk — calcium, protein, naturally occurring fats. Conventional carries trace pesticide and antibiotic exposure; organic and grass-fed are cleaner. A2 milk for those with sensitivity.", confidence:"high", category:"food_beverage" }],
  ["organic whole milk",             { floor:1, ceiling:3, substances:[], reason:"Organic whole milk — no synthetic pesticides in feed, no growth hormones, no antibiotics. Cleanest conventional dairy.", confidence:"high", category:"food_beverage" }],
  ["plain greek yogurt",             { floor:2, ceiling:4, substances:[], reason:"Plain Greek yogurt — high protein, probiotic. Avoid flavored varieties (added sugar). Organic is cleaner.", confidence:"high", category:"food_beverage" }],
  ["butter",                         { floor:2, ceiling:4, substances:[], reason:"Butter — naturally occurring fats. Grass-fed has higher CLA and omega-3 content. Organic avoids trace pesticide exposure from feed.", confidence:"high", category:"food_beverage" }],
  ["grass fed butter",               { floor:1, ceiling:3, substances:[], reason:"Grass-fed butter — measurably higher CLA and omega-3 content. Cleanest butter tier.", confidence:"high", category:"food_beverage" }],
  // Plain produce — broad-stroke entries (the detector handles the long tail)
  ["bananas",                        { floor:1, ceiling:3, substances:[], reason:"Bananas — fresh whole produce, low pesticide load (Clean Fifteen). Organic if you want to be thorough.", confidence:"high", category:"food_beverage" }],
  ["apples",                         { floor:1, ceiling:3, substances:["pesticide residue"], reason:"Apples — fresh whole produce. Conventional apples are on the EWG Dirty Dozen list (high pesticide residue); organic recommended.", confidence:"high", category:"food_beverage" }],
  ["strawberries",                   { floor:1, ceiling:3, substances:["pesticide residue"], reason:"Strawberries — top of the EWG Dirty Dozen list for pesticide residue. Buy organic when possible.", confidence:"high", category:"food_beverage" }],
  ["blueberries",                    { floor:1, ceiling:3, substances:[], reason:"Blueberries — antioxidant-rich whole produce. Conventional carries moderate pesticide load; organic is cleaner.", confidence:"high", category:"food_beverage" }],
  ["spinach",                        { floor:1, ceiling:3, substances:["pesticide residue"], reason:"Spinach — Dirty Dozen #2 for pesticide residue. Organic recommended.", confidence:"high", category:"food_beverage" }],
  ["kale",                           { floor:1, ceiling:3, substances:["pesticide residue"], reason:"Kale — Dirty Dozen list. Organic recommended.", confidence:"high", category:"food_beverage" }],
  ["avocado",                        { floor:1, ceiling:3, substances:[], reason:"Avocado — Clean Fifteen, very low pesticide residue even conventional. Healthy monounsaturated fats.", confidence:"high", category:"food_beverage" }],
  ["broccoli",                       { floor:1, ceiling:3, substances:[], reason:"Broccoli — fresh whole produce, low pesticide residue. Cruciferous vegetable with high nutrient density.", confidence:"high", category:"food_beverage" }],
  ["carrots",                        { floor:1, ceiling:3, substances:[], reason:"Carrots — fresh whole produce, beta-carotene rich. Conventional has moderate pesticide load; organic is cleaner.", confidence:"high", category:"food_beverage" }],
  ["sweet potato",                   { floor:1, ceiling:3, substances:[], reason:"Sweet potato — fresh whole produce, complex carb with vitamin A. Low pesticide residue.", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // BABY FORMULA
  // ══════════════════════════════════════════════════════════════
  ["hipp",                         { floor:1, ceiling:3, substances:[], reason:"European organic formula — benchmark clean baby formula", confidence:"high", category:"baby" }],
  ["hipp organic formula",          { floor:1, ceiling:3, substances:[], reason:"European certified organic, no hexane-extracted DHA — cleanest mainstream formula", confidence:"high", category:"baby" }],
  ["holle organic formula",         { floor:1, ceiling:3, substances:[], reason:"EU organic, simple clean formula", confidence:"high", category:"baby" }],
  ["enfamil enspire",               { floor:2, ceiling:4, substances:[], reason:"MFGM + lactoferrin additions — cleaner than standard Enfamil", confidence:"high", category:"baby" }],
  ["similac advance",               { floor:3, ceiling:5, substances:["hexane"], reason:"Conventional DHA from hexane-extracted microalgae + corn maltodextrin", confidence:"high", category:"baby" }],

  // ══════════════════════════════════════════════════════════════
  // DARK CHOCOLATE
  // ══════════════════════════════════════════════════════════════
  ["hu kitchen",                   { floor:1, ceiling:2, substances:[], reason:"No refined sugar, no lecithin — cleanest mainstream dark chocolate", confidence:"high", category:"food_beverage" }],
  ["hu kitchen chocolate",          { floor:1, ceiling:2, substances:[], reason:"No refined sugar, no lecithin, no dairy, no vanilla extract — cleanest mainstream dark chocolate", confidence:"high", category:"food_beverage" }],
  ["alter eco",                    { floor:1, ceiling:2, substances:[], reason:"USDA Organic + Fair Trade + simple — clean chocolate", confidence:"high", category:"food_beverage" }],
  ["alter eco chocolate",           { floor:1, ceiling:2, substances:[], reason:"USDA Organic + Fair Trade + simple ingredients", confidence:"high", category:"food_beverage" }],
  ["theo dark chocolate",           { floor:1, ceiling:2, substances:[], reason:"USDA Organic + Fair Trade — clean", confidence:"high", category:"food_beverage" }],
  ["lindt 85",                      { floor:1, ceiling:2, substances:[], reason:"Cacao + cocoa butter + sugar + vanilla — minimal, no PGPR", confidence:"high", category:"food_beverage" }],
  ["lindt excellence 70",           { floor:1, ceiling:3, substances:[], reason:"Clean dark chocolate formula — no PGPR", confidence:"high", category:"food_beverage" }],
  ["lindt milk chocolate",          { floor:3, ceiling:5, substances:["PGPR","vanillin"], reason:"PGPR + artificial vanillin — less clean than Lindt dark", confidence:"high", category:"food_beverage" }],
  ["hershey's special dark",        { floor:4, ceiling:6, substances:["PGPR","vanillin"], reason:"PGPR + artificial vanillin — not as clean as European dark despite 'dark' label", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // COFFEE AND TEA
  // ══════════════════════════════════════════════════════════════
  ["kicking horse",                { floor:1, ceiling:2, substances:[], reason:"USDA Organic + Fair Trade coffee — benchmark clean", confidence:"high", category:"food_beverage" }],
  ["bigelow",              { floor:4, ceiling:5, substances:["conventional tea","pesticide residue"], reason:"Bigelow — conventional non-organic tea. Better bag chemistry than Lipton but pesticide concern remains.", confidence:"medium", category:"food_beverage" }],
  ["four sigmatic",                 { floor:1, ceiling:3, substances:[], reason:"Organic adaptogens + organic coffee — clean formula", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // PRODUCE — DIRTY DOZEN AND CLEAN FIFTEEN
  // ══════════════════════════════════════════════════════════════
  ["conventional strawberries",     { floor:6, ceiling:8, substances:["pesticides","PFAS"], reason:"EWG Dirty Dozen #1 — 22+ pesticide residues avg, PFAS on 63% of samples EWG 2026. NEVER score below 6.", confidence:"high", category:"food_beverage" }],
  ["conventional spinach",          { floor:5, ceiling:7, substances:["pesticides","PFAS"], reason:"EWG Dirty Dozen — permethrin, imidacloprid, PFAS pesticides confirmed", confidence:"high", category:"food_beverage" }],
  ["conventional blueberries",      { floor:5, ceiling:7, substances:["pesticides"], reason:"Added to EWG Dirty Dozen 2024 — 17 different pesticides detected per sample", confidence:"high", category:"food_beverage" }],
  ["conventional apples",           { floor:5, ceiling:7, substances:["pesticides"], reason:"EWG Dirty Dozen — 90%+ of samples have detectable residues, diphenylamine", confidence:"high", category:"food_beverage" }],
  ["conventional grapes",           { floor:5, ceiling:7, substances:["pesticides"], reason:"EWG Dirty Dozen — multiple fungicides, 96% have residues", confidence:"high", category:"food_beverage" }],
  ["conventional peaches",          { floor:5, ceiling:7, substances:["pesticides"], reason:"EWG Dirty Dozen — 99% of samples have pesticide residues", confidence:"high", category:"food_beverage" }],
  ["conventional bell peppers",     { floor:5, ceiling:7, substances:["pesticides"], reason:"EWG Dirty Dozen — highest toxicity per EWG flagging", confidence:"high", category:"food_beverage" }],
  ["conventional kale",             { floor:5, ceiling:7, substances:["pesticides"], reason:"EWG Dirty Dozen — DCPA and other flagged pesticides", confidence:"high", category:"food_beverage" }],
  ["conventional potatoes",         { floor:5, ceiling:7, substances:["chlorpropham"], reason:"EWG Dirty Dozen — 90%+ have chlorpropham (sprout inhibitor banned in EU)", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // BBQ SAUCES AND ASIAN CONDIMENTS
  // ══════════════════════════════════════════════════════════════
  ["sweet baby ray's",              { floor:5, ceiling:7, substances:["HFCS","caramel color IV"], reason:"HFCS is the FIRST ingredient + caramel color IV (4-MEI IARC 2B). Most purchased BBQ sauce in US.", confidence:"high", category:"food_beverage" }],
  ["sweet baby rays",               { floor:5, ceiling:7, substances:["HFCS","caramel color"], reason:"HFCS first ingredient + caramel color IV — floor fires", confidence:"high", category:"food_beverage" }],
  ["heinz bbq sauce",               { floor:4, ceiling:6, substances:["HFCS","caramel color"], reason:"HFCS + caramel color IV — floor fires", confidence:"high", category:"food_beverage" }],
  ["stubb's",                    { floor:1, ceiling:3, substances:[], reason:"No HFCS, clean ingredients — benchmark clean BBQ sauce", confidence:"high", category:"food_beverage" }],
  ["stubb's bbq",                   { floor:1, ceiling:3, substances:[], reason:"Brown sugar + tomatoes, no HFCS — benchmark clean BBQ sauce", confidence:"high", category:"food_beverage" }],
  ["stubbs bbq",                    { floor:1, ceiling:3, substances:[], reason:"No HFCS, clean ingredients", confidence:"high", category:"food_beverage" }],
  ["kinder's bbq",                  { floor:1, ceiling:3, substances:[], reason:"No HFCS, simple clean ingredients", confidence:"high", category:"food_beverage" }],
  ["kikkoman soy sauce",            { floor:1, ceiling:3, substances:[], reason:"Brewed: water + wheat + soy + salt — 4 clean fermented ingredients. Benchmark clean soy sauce.", confidence:"high", category:"food_beverage" }],
  ["coconut aminos",                { floor:1, ceiling:2, substances:[], reason:"Coconut blossom nectar + sea salt — cleanest soy sauce alternative", confidence:"high", category:"food_beverage" }],
  ["bragg liquid aminos",           { floor:1, ceiling:3, substances:[], reason:"Non-GMO soy + purified water — clean", confidence:"high", category:"food_beverage" }],
  ["sriracha",                      { floor:1, ceiling:3, substances:[], reason:"Chili + sugar + distilled vinegar + garlic + salt — 5 clean ingredients. NEVER score above 4.", confidence:"high", category:"food_beverage" }],
  ["huy fong sriracha",             { floor:1, ceiling:3, substances:[], reason:"5 clean real ingredients — benchmark clean hot sauce", confidence:"high", category:"food_beverage" }],
  ["la choy soy sauce",             { floor:4, ceiling:6, substances:["hydrolyzed soy protein"], reason:"Chemically hydrolyzed — NOT brewed, functional MSG equivalent. Different from Kikkoman.", confidence:"high", category:"food_beverage" }],
  ["worcestershire sauce",          { floor:1, ceiling:3, substances:[], reason:"Tamarind + anchovies + spices + vinegar — clean fermented condiment", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // LUNCHABLES
  // ══════════════════════════════════════════════════════════════
  ["lunchables turkey",             { floor:6, ceiling:8, substances:["sodium nitrite","sodium phosphate"], reason:"Sodium nitrite in turkey (IARC Group 1) + sodium phosphate + enriched crackers — child vulnerability. NEVER score below 6.", confidence:"high", category:"food_beverage" }],
  ["lunchables pizza",              { floor:6, ceiling:8, substances:["sodium nitrite"], reason:"Sodium nitrite in pepperoni + processed cheese + enriched flour — child vulnerability. NEVER score below 6.", confidence:"high", category:"food_beverage" }],
  ["lunchables nachos",             { floor:5, ceiling:7, substances:["processed cheese"], reason:"Processed cheese sauce + enriched flour — no processed meat but still high concern", confidence:"high", category:"food_beverage" }],
  ["lunchables with smoothie",      { floor:7, ceiling:9, substances:["sodium nitrite","HFCS","artificial dyes"], reason:"Sodium nitrite + HFCS + artificial dyes — THREE floors fire simultaneously. One of the worst kids packaged foods.", confidence:"high", category:"food_beverage" }],
  ["lunchables",                    { floor:6, ceiling:8, substances:["sodium nitrite"], reason:"Any Lunchables with deli meat = sodium nitrite floor fires. Child vulnerability flag.", confidence:"high", category:"food_beverage" }],
  ["oscar mayer p3",                { floor:6, ceiling:7, substances:["sodium nitrite"], reason:"Sodium nitrite in meat component — floor fires", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // WATER AND SPARKLING WATER
  // ══════════════════════════════════════════════════════════════
  ["liquid death",                          { floor:1, ceiling:2, substances:[], reason:"Aluminum can, no BPA, mountain water — cleanest mainstream bottled water format", confidence:"high", category:"beverage" }],
  ["liquid death mountain water",           { floor:1, ceiling:2, substances:[], reason:"Austrian mountain water in aluminum — no plastic bottle contact, no added ingredients", confidence:"high", category:"beverage" }],
  ["liquid death sparkling water",          { floor:1, ceiling:2, substances:[], reason:"Sparkling Austrian mountain water in aluminum — just water and CO2, no sweeteners, no dyes", confidence:"high", category:"beverage" }],
  ["liquid death mango chainsaw",           { floor:1, ceiling:2, substances:[], reason:"Sparkling water with real agave nectar and natural mango flavor — no sugar, no artificial sweeteners, no dyes", confidence:"high", category:"beverage" }],
  ["liquid death berry it alive",           { floor:1, ceiling:2, substances:[], reason:"Sparkling water with real agave nectar and natural berry flavor — no sugar, no artificial sweeteners, no dyes", confidence:"high", category:"beverage" }],
  ["liquid death severed lime",             { floor:1, ceiling:2, substances:[], reason:"Sparkling water with real agave nectar and natural lime flavor — no sugar, no artificial sweeteners, no dyes", confidence:"high", category:"beverage" }],
  ["liquid death convicted melon",          { floor:1, ceiling:2, substances:[], reason:"Sparkling water with real agave nectar and natural watermelon flavor — no sugar, no artificial sweeteners, no dyes", confidence:"high", category:"beverage" }],
  ["liquid death squeezed to death",        { floor:1, ceiling:2, substances:[], reason:"Sparkling water with real agave nectar and natural orange flavor — no sugar, no artificial sweeteners, no dyes", confidence:"high", category:"beverage" }],
  ["liquid death rest in peach",            { floor:1, ceiling:2, substances:[], reason:"Sparkling water with real agave nectar and natural peach flavor — no sugar, no artificial sweeteners, no dyes", confidence:"high", category:"beverage" }],
  ["liquid death armless palmer",           { floor:2, ceiling:3, substances:[], reason:"Iced tea + lemonade with real cane sugar and real tea — cleaner than conventional iced teas but ~8g added sugar per can bumps score slightly", confidence:"high", category:"beverage" }],
  ["liquid death dead billionaire",         { floor:2, ceiling:3, substances:[], reason:"Iced tea with real cane sugar and real brewed tea — cleaner than HFCS-based teas, sugar content bumps score slightly", confidence:"high", category:"beverage" }],
  ["liquid death grim leafer",              { floor:2, ceiling:3, substances:[], reason:"Green iced tea with real cane sugar — cleaner ingredient profile than conventional teas, sugar content bumps score slightly", confidence:"high", category:"beverage" }],
  ["spindrift",                   { floor:1, ceiling:2, substances:[], reason:"Real squeezed fruit + sparkling water — no added flavoring", confidence:"high", category:"beverage" }],
  ["spindrift sparkling",           { floor:1, ceiling:2, substances:[], reason:"Real squeezed fruit + sparkling water — no flavoring, no sugar added", confidence:"high", category:"beverage" }],
  ["lacroix",                       { floor:1, ceiling:2, substances:[], reason:"Naturally essenced flavor — no sugar, no artificial sweeteners", confidence:"high", category:"beverage" }],
  ["bubly",                        { floor:1, ceiling:2, substances:[], reason:"Natural flavors only — no sugar, no artificial sweeteners", confidence:"high", category:"beverage" }],
  ["bubly sparkling",               { floor:1, ceiling:2, substances:[], reason:"Natural flavors only — no sugar, no artificial sweeteners", confidence:"high", category:"beverage" }],
  ["hint water",                    { floor:1, ceiling:2, substances:[], reason:"Natural fruit flavors only — no sugar, no dyes", confidence:"high", category:"beverage" }],
  ["vitaminwater",                  { floor:4, ceiling:6, substances:["sucrose","crystalline fructose"], reason:"HFCS or sucrose + synthetic vitamins at pharmaceutical doses — not the same as plain water", confidence:"high", category:"beverage" }],
  ["vitamin water",                 { floor:4, ceiling:6, substances:["sucrose"], reason:"Sugar + synthetic vitamins — not clean water", confidence:"high", category:"beverage" }],

  // ══════════════════════════════════════════════════════════════
  // SALAD DRESSINGS
  // ══════════════════════════════════════════════════════════════
  ["primal kitchen caesar",         { floor:1, ceiling:2, substances:[], reason:"Avocado oil, no EDTA — clean", confidence:"high", category:"food_beverage" }],
  ["annie's organic ranch",         { floor:1, ceiling:3, substances:[], reason:"USDA Organic, no EDTA, no artificial flavors", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // STORE BRANDS
  // ══════════════════════════════════════════════════════════════
  ["365 whole foods",               { floor:1, ceiling:3, substances:[], reason:"Whole Foods house brand — explicitly avoids artificial additives, many USDA Organic", confidence:"high", category:"food_beverage" }],
  ["kirkland signature trail mix",  { floor:5, ceiling:7, substances:["Red 40","Yellow 5","Blue 1","HFCS"], reason:"Contains M&Ms — petroleum dyes + HFCS in candy. Very different from Kirkland plain nuts.", confidence:"high", category:"food_beverage" }],
  ["good & gather organic",         { floor:1, ceiling:2, substances:[], reason:"Target USDA Organic store brand — clean", confidence:"high", category:"food_beverage" }],
  ["wonderful pistachios",          { floor:1, ceiling:2, substances:[], reason:"Just pistachios + salt — benchmark clean nut snack", confidence:"high", category:"food_beverage" }],
  ["kind trail mix",                { floor:1, ceiling:3, substances:[], reason:"Nuts + fruit + dark chocolate — no HFCS, no petroleum dyes", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // AUDIT 21 — TARGET & WALMART STORE BRANDS
  // ══════════════════════════════════════════════════════════════

  // ── WALMART: GREAT VALUE ──────────────────────────────────────
  ["great value white bread",       { floor:4, ceiling:6, substances:["HFCS","soybean oil","azodicarbonamide"], reason:"HFCS + azodicarbonamide (flour bleaching agent, banned EU) + soybean oil — standard industrial white bread", confidence:"high", category:"food_beverage" }],
  ["great value cookies",           { floor:5, ceiling:7, substances:["HFCS","Red 40","Blue 1","Yellow 5","partially hydrogenated"], reason:"HFCS + multiple petroleum dyes + trans fat risk in store-brand cookies", confidence:"high", category:"food_beverage" }],
  ["great value fruit punch",       { floor:5, ceiling:7, substances:["HFCS","Red 40","Blue 1"], reason:"HFCS-first beverage + petroleum dyes — standard Walmart drink mix concern", confidence:"high", category:"beverage" }],
  ["great value juice drink",       { floor:5, ceiling:7, substances:["HFCS","Red 40","Yellow 5"], reason:"HFCS + petroleum dyes — not real juice, sugared dye drink", confidence:"high", category:"beverage" }],
  ["great value",                   { floor:3, ceiling:6, substances:[], reason:"Walmart store brand — varies widely. Clean staples (flour, sugar, salt) score low; processed items with HFCS/dyes score higher. Contextual floor.", confidence:"medium", category:"food_beverage" }],

  // ── WALMART: SPRING VALLEY SUPPLEMENTS ───────────────────────
  ["spring valley vitamin d3",      { floor:1, ceiling:3, substances:[], reason:"Single-ingredient D3 softgel — no dyes, no fillers of concern. Benchmark clean supplement.", confidence:"high", category:"supplement" }],
  ["spring valley elderberry gummies", { floor:5, ceiling:7, substances:["Red 40","HFCS"], reason:"Red 40 petroleum dye + HFCS in daily elderberry gummies — same concern as Flintstones gummies", confidence:"high", category:"supplement" }],
  ["spring valley multivitamin",    { floor:5, ceiling:7, substances:["Red 40","Yellow 5","Blue 2","titanium dioxide"], reason:"Multiple petroleum dyes + TiO2 (IARC 2B) — standard concern for conventional multivitamins with dyes", confidence:"high", category:"supplement" }],
  ["spring valley",                 { floor:2, ceiling:6, substances:[], reason:"Walmart supplement brand — clean single-ingredient items (D3, fish oil, magnesium) score 1-3; gummies and coated tablets with dyes score 5-7", confidence:"medium", category:"supplement" }],

  // ── WALMART: PARENT'S CHOICE (BABY FORMULA) ──────────────────
  ["parent's choice baby formula",  { floor:4, ceiling:6, substances:["corn syrup","hexane-extracted DHA"], reason:"Conventional corn syrup as carbohydrate source + hexane-extracted DHA/ARA — cheaper extraction method vs enzymatic. Not organic.", confidence:"high", category:"baby" }],
  ["parent's choice formula",       { floor:4, ceiling:6, substances:["corn syrup","hexane-extracted DHA"], reason:"Corn syrup solids + hexane-processed DHA — not organic. Better than nothing but not clean-label baby formula.", confidence:"high", category:"baby" }],
  ["parent's choice",               { floor:3, ceiling:6, substances:[], reason:"Walmart baby store brand — formula items score 4-6 (corn syrup, hexane DHA); diapers and wipes score 3-5", confidence:"medium", category:"baby" }],

  // ── WALMART: EQUATE (PHARMACY/PERSONAL CARE) ─────────────────
  ["equate sunscreen chemical",     { floor:6, ceiling:8, substances:["oxybenzone","octinoxate"], reason:"Chemical sunscreen with oxybenzone (endocrine disruptor, coral reef ban) + octinoxate — avoid for children, reef ecosystems", confidence:"high", category:"personal_care" }],
  ["equate mineral sunscreen",      { floor:1, ceiling:3, substances:[], reason:"Zinc oxide mineral sunscreen — no chemical UV filters, no oxybenzone. Clean alternative.", confidence:"high", category:"personal_care" }],
  ["equate sunscreen spf",          { floor:5, ceiling:8, substances:["oxybenzone","avobenzone","homosalate"], reason:"Standard Equate sunscreen likely chemical UV filters — oxybenzone floor may fire. Check ingredients.", confidence:"medium", category:"personal_care" }],
  ["equate baby acetaminophen",     { floor:6, ceiling:7, substances:["Red 40","HFCS"], reason:"Red 40 petroleum dye + HFCS in infant/toddler liquid medicine — same concern as Up & Up and Children's Tylenol liquid", confidence:"high", category:"personal_care" }],
  ["equate children's acetaminophen", { floor:6, ceiling:7, substances:["Red 40","HFCS"], reason:"Petroleum dye in children's daily OTC medicine — FDA phasing out Red 40. Child vulnerability applies.", confidence:"high", category:"personal_care" }],
  ["equate",                        { floor:2, ceiling:7, substances:[], reason:"Walmart pharmacy brand — tablets/capsules score 2-3; liquid children's medicines with dyes score 6-7; chemical sunscreens score 6-8; mineral versions score 1-3", confidence:"medium", category:"personal_care" }],

  // ── WALMART: UP & UP (TARGET PHARMACY — same issue) ──────────
  ["up & up baby acetaminophen",    { floor:6, ceiling:7, substances:["Red 40","HFCS"], reason:"Red 40 petroleum dye + HFCS in infant drops — FDA phasing out petroleum dyes, child daily use amplifies concern", confidence:"high", category:"personal_care" }],
  ["up & up children's acetaminophen", { floor:6, ceiling:7, substances:["Red 40","HFCS"], reason:"Petroleum dye in liquid children's medicine — same concern as Children's Tylenol liquid. Tablets are clean alternative.", confidence:"high", category:"personal_care" }],
  ["up & up",                       { floor:2, ceiling:7, substances:[], reason:"Target pharmacy brand — tablets clean (2-3); liquid children's medicines with dyes (6-7); chemical sunscreens (6-8)", confidence:"medium", category:"personal_care" }],

  // ── WALMART: PET FOOD ─────────────────────────────────────────
  ["ol' roy",                       { floor:5, ceiling:7, substances:["Red 40","BHA","corn syrup"], reason:"Red 40 petroleum dye + BHA preservative (IARC 2B) + corn syrup in Walmart dog food — lowest tier pet food concerns", confidence:"high", category:"food_beverage" }],
  ["ol roy",                        { floor:5, ceiling:7, substances:["Red 40","BHA","corn syrup"], reason:"Red 40 + BHA + corn syrup — Walmart store brand dog food. Same concerns regardless of spelling.", confidence:"high", category:"food_beverage" }],
  ["pure balance dog food",         { floor:2, ceiling:4, substances:[], reason:"Walmart premium pet line — real meat first ingredient, no artificial colors or flavors, no corn syrup. Significantly cleaner than Ol' Roy.", confidence:"high", category:"food_beverage" }],
  ["pure balance cat food",         { floor:2, ceiling:4, substances:[], reason:"Walmart premium pet line — cleaner ingredient panel than Ol' Roy. No petroleum dyes.", confidence:"high", category:"food_beverage" }],

  // ── TARGET: CLOTHING ──────────────────────────────────────────
  ["cat & jack oeko-tex",           { floor:2, ceiling:4, substances:[], reason:"Target kids clothing with OEKO-TEX 100 certification — tested for harmful substances. Not GOTS but meaningfully better than uncertified polyester.", confidence:"high", category:"clothing" }],
  ["cat & jack",                    { floor:3, ceiling:5, substances:["polyester","synthetic dyes"], reason:"Target kids clothing brand — OEKO-TEX 100 on many items (3-4), but some 100% polyester items without certification score higher (5).", confidence:"medium", category:"clothing" }],

  // ── TARGET: CLEANING / HOME ───────────────────────────────────
  ["everspring",                    { floor:1, ceiling:3, substances:[], reason:"Target clean house brand — plant-based ingredients, no harsh chemicals, fragrance disclosed. Benchmark clean store-brand cleaning line.", confidence:"high", category:"home" }],

  // ── TARGET: FOOD / DESSERT ────────────────────────────────────
  ["favorite day cookies",          { floor:5, ceiling:7, substances:["HFCS","partially hydrogenated"], reason:"Target dessert brand — HFCS + partially hydrogenated oil trans fat risk. Standard concern for conventional store-brand cookies.", confidence:"high", category:"food_beverage" }],
  ["favorite day",                  { floor:4, ceiling:6, substances:["HFCS","artificial flavors"], reason:"Target dessert store brand — processed sweets line. HFCS common across line. Higher-concern items (cookies, candy) at 5-7.", confidence:"medium", category:"food_beverage" }],

  // ── TARGET: GOOD & GATHER (DELI / MEAT) ──────────────────────
  ["good & gather sliced turkey",   { floor:6, ceiling:7, substances:["sodium nitrite"], reason:"Good & Gather deli turkey — sodium nitrite preservative (IARC Group 1 carcinogen). Standard deli meat concern even in Target's house brand.", confidence:"high", category:"food_beverage" }],
  ["good & gather deli",            { floor:6, ceiling:7, substances:["sodium nitrite"], reason:"Good & Gather deli meat line — sodium nitrite in cured items. IARC Group 1. Organic line may differ.", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // AUDIT 22 — ETHNIC FOOD AISLES: ASIAN, MEXICAN, INDIAN
  // ══════════════════════════════════════════════════════════════

  // ── ASIAN AISLE: SOY SAUCE & ALTERNATIVES ────────────────────
  ["san-j tamari",                  { floor:1, ceiling:2, substances:[], reason:"Certified gluten-free tamari — soy + water + salt, USDA Organic available. Cleaner than standard soy sauce.", confidence:"high", category:"food_beverage" }],
  ["coconut aminos bragg",          { floor:1, ceiling:2, substances:[], reason:"Coconut tree sap + sea salt — benchmark clean soy sauce alternative, no soy, no HFCS", confidence:"high", category:"food_beverage" }],
  ["coconut secret coconut aminos", { floor:1, ceiling:2, substances:[], reason:"Organic coconut tree sap — cleanest soy sauce alternative available", confidence:"high", category:"food_beverage" }],

  // ── ASIAN AISLE: TERIYAKI, HOISIN, OYSTER SAUCE ──────────────
  ["kikkoman teriyaki",             { floor:4, ceiling:6, substances:["HFCS","caramel color"], reason:"Kikkoman teriyaki contains HFCS as a primary sweetener — very different from plain Kikkoman soy sauce which is clean. HFCS floor concern.", confidence:"high", category:"food_beverage" }],
  ["lee kum kee oyster sauce",      { floor:4, ceiling:6, substances:["HFCS","caramel color IV"], reason:"HFCS + caramel color IV (IARC 2B for some reaction types) — standard concern for conventional oyster sauce", confidence:"high", category:"food_beverage" }],
  ["lee kum kee hoisin",            { floor:4, ceiling:6, substances:["HFCS","caramel color","sodium benzoate"], reason:"HFCS + sodium benzoate preservative + caramel color IV — hoisin sauce is one of the most additive-heavy Asian condiments", confidence:"high", category:"food_beverage" }],
  ["hoisin sauce",                  { floor:4, ceiling:6, substances:["HFCS","caramel color"], reason:"Most hoisin sauces use HFCS as primary sweetener + caramel color IV. Check for plum-based alternatives.", confidence:"medium", category:"food_beverage" }],
  ["panda express sauce",           { floor:4, ceiling:6, substances:["HFCS","caramel color"], reason:"Retail Panda Express bottled sauces contain HFCS + caramel color — same concern as Lee Kum Kee hoisin", confidence:"high", category:"food_beverage" }],

  // ── ASIAN AISLE: MIRIN ────────────────────────────────────────
  ["kikkoman mirin",                { floor:4, ceiling:6, substances:["HFCS"], reason:"CRITICAL DISTINCTION: Kikkoman Manjo Aji-Mirin uses HFCS and corn syrup as primary sweeteners — NOT real mirin. Real hon-mirin is fermented rice wine with no HFCS.", confidence:"high", category:"food_beverage" }],
  ["hon mirin",                     { floor:1, ceiling:3, substances:[], reason:"Real fermented rice wine mirin — rice + koji + alcohol, no HFCS. Benchmark clean vs fake mirin with corn syrup.", confidence:"high", category:"food_beverage" }],
  ["aji mirin",                     { floor:4, ceiling:6, substances:["HFCS","corn syrup"], reason:"Aji-mirin is a mirin-style condiment — typically corn syrup + water + alcohol, not fermented. HFCS floor concern.", confidence:"high", category:"food_beverage" }],

  // ── ASIAN AISLE: CLEAN CONDIMENTS ────────────────────────────
  ["sambal oelek huy fong",         { floor:1, ceiling:2, substances:[], reason:"Chili peppers + distilled vinegar + salt — 3 ingredients, no HFCS, no preservatives beyond vinegar. Benchmark clean chili paste.", confidence:"high", category:"food_beverage" }],
  ["sambal oelek",                  { floor:1, ceiling:3, substances:[], reason:"Traditional chili paste — peppers + vinegar + salt. Verify no sodium benzoate added depending on brand.", confidence:"high", category:"food_beverage" }],
  ["fish sauce thai kitchen",       { floor:1, ceiling:2, substances:[], reason:"Fish + water + salt — minimal ingredient condiment, traditional fermented product", confidence:"high", category:"food_beverage" }],
  ["red boat fish sauce",           { floor:1, ceiling:2, substances:[], reason:"Just anchovy + salt — one of the cleanest fish sauces available, no additives", confidence:"high", category:"food_beverage" }],
  ["fish sauce",                    { floor:1, ceiling:3, substances:[], reason:"Traditional fermented condiment — anchovy + salt. Verify no added preservatives (sodium benzoate) in budget versions.", confidence:"medium", category:"food_beverage" }],
  ["rice vinegar marukan",          { floor:1, ceiling:2, substances:[], reason:"Just fermented rice vinegar — clean condiment with no additives", confidence:"high", category:"food_beverage" }],
  ["sesame oil kadoya",             { floor:1, ceiling:2, substances:[], reason:"Pure toasted sesame oil — clean single-ingredient oil", confidence:"high", category:"food_beverage" }],
  ["sesame oil",                    { floor:1, ceiling:2, substances:[], reason:"Pure sesame oil — single ingredient, no additives, traditional cooking oil", confidence:"high", category:"food_beverage" }],
  ["mae ploy sweet chili sauce",    { floor:3, ceiling:5, substances:["sodium benzoate"], reason:"Real chili + sugar (not HFCS), but contains sodium benzoate preservative — moderate concern", confidence:"high", category:"food_beverage" }],

  // ── ASIAN AISLE: MAGGI / KNORR ───────────────────────────────
  ["maggi seasoning",               { floor:4, ceiling:6, substances:["hydrolyzed wheat protein","caramel color"], reason:"Hydrolyzed wheat protein (chemically processed, not fermented) + caramel color IV — similar concern profile to La Choy soy sauce", confidence:"high", category:"food_beverage" }],
  ["knorr liquid seasoning",        { floor:4, ceiling:6, substances:["hydrolyzed protein","caramel color IV"], reason:"Hydrolyzed protein + caramel color IV — chemically produced umami, not fermented. Same concern as Maggi.", confidence:"high", category:"food_beverage" }],

  // ── ASIAN AISLE: MAYO ─────────────────────────────────────────
  ["kewpie mayonnaise",             { floor:3, ceiling:5, substances:["soybean oil","MSG"], reason:"Soybean oil (omega-6 imbalance concern) + MSG + rice vinegar — popular but higher soybean oil content than alternatives", confidence:"high", category:"food_beverage" }],

  // ── ASIAN AISLE: COCONUT MILK ─────────────────────────────────
  ["native forest coconut milk",    { floor:1, ceiling:2, substances:[], reason:"BPA-free can + USDA Organic — benchmark clean coconut milk. No BPA, no guar gum added.", confidence:"high", category:"food_beverage" }],
  ["thai kitchen coconut milk",     { floor:5, ceiling:6, substances:["BPA"], reason:"Conventional can with BPA lining concern — clean ingredients but BPA-lined can is a packaging concern for fatty food storage", confidence:"high", category:"food_beverage" }],
  ["chaokoh coconut milk",          { floor:5, ceiling:6, substances:["BPA"], reason:"Conventional can, BPA lining concern — same as Thai Kitchen. Switch to BPA-free carton or Native Forest.", confidence:"high", category:"food_beverage" }],

  // ── ASIAN AISLE: FERMENTED / MISO / GOCHUJANG ────────────────
  ["miso paste hikari",             { floor:1, ceiling:2, substances:[], reason:"Fermented soybean paste — traditional food with no additives. Probiotic benefit. Benchmark clean.", confidence:"high", category:"food_beverage" }],
  ["miso paste",                    { floor:1, ceiling:3, substances:[], reason:"Traditional fermented soybean paste — rice + soybeans + salt + koji. Naturally preserved, minimal concern.", confidence:"high", category:"food_beverage" }],
  ["gochujang mother in law",       { floor:1, ceiling:3, substances:[], reason:"Artisan gochujang — rice + fermented chili + salt, no artificial colors or HFCS. Benchmark clean gochujang.", confidence:"high", category:"food_beverage" }],
  ["gochujang cj",                  { floor:2, ceiling:4, substances:["corn syrup"], reason:"CJ Haechandle gochujang contains corn syrup (not HFCS but still refined) — cleaner than American sauces but not as clean as traditional versions", confidence:"high", category:"food_beverage" }],
  ["gochujang",                     { floor:2, ceiling:4, substances:[], reason:"Traditional Korean fermented chili paste — check for corn syrup or artificial sweeteners in commercial versions", confidence:"medium", category:"food_beverage" }],

  // ── MEXICAN AISLE: HOT SAUCES (ALL CLEAN) ────────────────────
  ["cholula hot sauce",             { floor:1, ceiling:2, substances:[], reason:"Arbol and piquin peppers + vinegar + salt + spices — clean, no HFCS, no artificial additives. Benchmark clean hot sauce.", confidence:"high", category:"food_beverage" }],
  ["valentina hot sauce",           { floor:1, ceiling:2, substances:[], reason:"Chili peppers + vinegar + salt + spices — clean Mexican hot sauce. Widely used, no HFCS or artificial additives.", confidence:"high", category:"food_beverage" }],
  ["tapatio hot sauce",             { floor:1, ceiling:2, substances:[], reason:"Peppers + vinegar + salt + spices + garlic — clean hot sauce, no HFCS. NEVER score above 3.", confidence:"high", category:"food_beverage" }],
  ["el yucateco",                   { floor:1, ceiling:2, substances:[], reason:"Habanero-based Mexican hot sauce — peppers + vinegar + salt, clean. NEVER score above 3.", confidence:"high", category:"food_beverage" }],

  // ── MEXICAN AISLE: TORTILLAS ──────────────────────────────────
  ["siete almond flour tortillas",  { floor:1, ceiling:2, substances:[], reason:"Almond flour + tapioca + avocado oil — grain-free, clean ingredients. No preservatives, no gums. Benchmark clean tortilla.", confidence:"high", category:"food_beverage" }],
  ["siete cassava tortillas",       { floor:1, ceiling:2, substances:[], reason:"Cassava flour tortilla — clean grain-free. Siete brand explicitly avoids seed oils and artificial additives.", confidence:"high", category:"food_beverage" }],
  ["siete",                         { floor:1, ceiling:3, substances:[], reason:"Siete Foods brand — clean-label Mexican food. Grain-free, no artificial additives, no HFCS across entire product line.", confidence:"high", category:"food_beverage" }],
  ["mission flour tortillas",       { floor:4, ceiling:6, substances:["calcium propionate","propionic acid"], reason:"Calcium propionate mold inhibitor (gut microbiome disruption studies) + soybean oil + enriched flour — industrial tortilla concerns", confidence:"high", category:"food_beverage" }],
  ["guerrero flour tortillas",      { floor:4, ceiling:6, substances:["calcium propionate","soybean oil"], reason:"Same calcium propionate + soybean oil concern as Mission — standard industrial flour tortilla", confidence:"high", category:"food_beverage" }],
  ["la banderita corn tortillas",   { floor:1, ceiling:3, substances:[], reason:"Corn + water + lime — traditional nixtamalized corn tortilla. Clean if non-GMO verified. Conventional corn has glyphosate concern.", confidence:"medium", category:"food_beverage" }],
  ["mission corn tortillas",        { floor:2, ceiling:4, substances:["propionic acid"], reason:"Nixtamalized corn but with propionic acid preservative added — cleaner than flour version but still has preservative", confidence:"high", category:"food_beverage" }],

  // ── MEXICAN AISLE: TACO SEASONING ────────────────────────────
  ["siete taco seasoning",          { floor:1, ceiling:2, substances:[], reason:"Clean spice blend — no silicon dioxide, no artificial flavor, no additives. Benchmark clean taco seasoning.", confidence:"high", category:"food_beverage" }],
  ["old el paso taco seasoning",    { floor:3, ceiling:5, substances:["silicon dioxide","maltodextrin"], reason:"Silicon dioxide anti-caking agent + maltodextrin filler + natural flavor (vague) — not dangerous but not a clean spice blend", confidence:"high", category:"food_beverage" }],
  ["ortega taco seasoning",         { floor:3, ceiling:5, substances:["silicon dioxide","maltodextrin"], reason:"Same profile as Old El Paso — maltodextrin + silicon dioxide, processed seasoning blend", confidence:"high", category:"food_beverage" }],

  // ── MEXICAN AISLE: ENCHILADA SAUCE ───────────────────────────
  ["hatch enchilada sauce",         { floor:1, ceiling:3, substances:[], reason:"Roasted green/red chiles + tomato + spices — clean enchilada sauce with no artificial additives", confidence:"high", category:"food_beverage" }],
  ["old el paso enchilada sauce",   { floor:3, ceiling:5, substances:["modified starch","xanthan gum"], reason:"Modified food starch + xanthan gum thickeners + natural flavor — processed but no major safety concerns", confidence:"high", category:"food_beverage" }],

  // ── MEXICAN AISLE: TORTILLAS / MASA ──────────────────────────
  ["maseca masa harina",            { floor:3, ceiling:5, substances:["conventional corn"], reason:"Conventional corn masa — glyphosate residue concern on non-organic corn. Not non-GMO verified.", confidence:"medium", category:"food_beverage" }],
  ["bob's red mill masa harina",    { floor:1, ceiling:2, substances:[], reason:"Non-GMO verified corn masa — cleaner than Maseca. Bob's Red Mill uses traceable sourcing.", confidence:"high", category:"food_beverage" }],

  // ── MEXICAN AISLE: BEANS & REFRIED ───────────────────────────
  ["rosarita refried beans",        { floor:2, ceiling:4, substances:[], reason:"Pinto beans + lard + salt — traditional refried beans. No artificial additives. Lard is a natural fat, not a concern.", confidence:"high", category:"food_beverage" }],
  ["goya beans",                    { floor:5, ceiling:6, substances:["BPA"], reason:"Canned beans — clean ingredients (beans + water + salt) but conventional can with BPA lining. Switch to Eden for BPA-free.", confidence:"medium", category:"food_beverage" }],
  ["la preferida",                  { floor:5, ceiling:6, substances:["BPA"], reason:"Canned Mexican pantry staples — clean ingredients but conventional BPA-lined cans", confidence:"medium", category:"food_beverage" }],

  // ── INDIAN AISLE: SPICE BRANDS (CRITICAL SAFETY) ─────────────
  ["mdh spices",                    { floor:5, ceiling:7, substances:["ethylene oxide","pesticide residue"], reason:"CRITICAL: MDH spices subject to FDA import alerts and multiple international bans (Singapore, Hong Kong, 2024) for ethylene oxide pesticide contamination exceeding safe limits. Choose organic alternatives.", confidence:"high", category:"food_beverage" }],
  ["mdh",                           { floor:5, ceiling:7, substances:["ethylene oxide"], reason:"MDH brand — multiple products flagged by FDA and banned in Singapore/Hong Kong 2024 for ethylene oxide contamination. High confidence safety concern.", confidence:"high", category:"food_beverage" }],
  ["everest spices",                { floor:5, ceiling:7, substances:["ethylene oxide","pesticide residue"], reason:"CRITICAL: Everest spices banned in Singapore and Hong Kong 2024 for ethylene oxide contamination — same concern as MDH. Both brands involved in international regulatory action.", confidence:"high", category:"food_beverage" }],
  ["everest",                       { floor:5, ceiling:7, substances:["ethylene oxide"], reason:"Everest brand — banned in multiple countries 2024 for pesticide contamination. Real regulatory action, not precautionary.", confidence:"high", category:"food_beverage" }],
  ["shan spice",                    { floor:4, ceiling:6, substances:["artificial color","silicon dioxide"], reason:"Pakistan-based spice mixes — some artificial coloring + silicon dioxide. Not under the same bans as MDH/Everest but less transparent sourcing.", confidence:"medium", category:"food_beverage" }],

  // ── INDIAN AISLE: SIMMER SAUCES ──────────────────────────────
  ["maya kaimal",                   { floor:1, ceiling:3, substances:[], reason:"US-made Indian simmer sauces — clean ingredients, no artificial additives, no palm oil. Benchmark clean Indian simmer sauce brand.", confidence:"high", category:"food_beverage" }],
  ["patak's",                       { floor:3, ceiling:5, substances:["palm oil","modified starch"], reason:"Patak's simmer sauces use palm oil + modified corn starch + natural flavor — not dangerous but more processed than Maya Kaimal", confidence:"high", category:"food_beverage" }],
  ["pataks",                        { floor:3, ceiling:5, substances:["palm oil","modified starch"], reason:"Patak's simmer sauces — palm oil + thickeners. Acceptable but not a clean label product.", confidence:"high", category:"food_beverage" }],
  ["mtr ready meals",               { floor:4, ceiling:6, substances:["retort pouch","modified starch"], reason:"Retort pouch packaging (plastic-lined foil heated under pressure) + modified starch + additives — convenience curry meals with packaging and ingredient concerns", confidence:"high", category:"food_beverage" }],
  ["kitchens of india",             { floor:4, ceiling:6, substances:["retort pouch","modified starch"], reason:"Same retort pouch concern as MTR — heated plastic packaging + additives in convenience Indian meals", confidence:"high", category:"food_beverage" }],

  // ── INDIAN AISLE: GHEE ───────────────────────────────────────
  ["swad ghee",                     { floor:1, ceiling:2, substances:[], reason:"Pure clarified butter — one ingredient, traditional food. Benchmark clean cooking fat.", confidence:"high", category:"food_beverage" }],
  ["purity farms ghee",             { floor:1, ceiling:2, substances:[], reason:"USDA Organic clarified butter — grass-fed claim, clean single ingredient. Benchmark clean ghee.", confidence:"high", category:"food_beverage" }],
  ["ancient organics ghee",         { floor:1, ceiling:2, substances:[], reason:"Grass-fed organic ghee — benchmark clean. Single ingredient, traditional preparation.", confidence:"high", category:"food_beverage" }],
  ["ghee",                          { floor:1, ceiling:3, substances:[], reason:"Clarified butter — traditional cooking fat, single ingredient. Verify grass-fed/organic for highest quality but all ghee is clean by definition.", confidence:"high", category:"food_beverage" }],

  // ── INDIAN AISLE: RICE & LENTILS ─────────────────────────────
  ["tilda basmati rice",            { floor:1, ceiling:2, substances:[], reason:"Pure basmati rice — aged, clean. Tilda is a quality benchmark for basmati.", confidence:"high", category:"food_beverage" }],
  ["royal basmati rice",            { floor:1, ceiling:3, substances:[], reason:"Conventional basmati rice — clean whole grain. Minimal concern, though non-organic has glyphosate pre-harvest concern on some rice.", confidence:"medium", category:"food_beverage" }],
  ["lentils",                       { floor:1, ceiling:2, substances:[], reason:"Whole dry lentils — clean whole food. Pulse crop with minimal pesticide residue concern vs wheat/oats.", confidence:"high", category:"food_beverage" }],
  ["dal",                           { floor:1, ceiling:2, substances:[], reason:"Split lentils/pulses — traditional whole food, clean. No processing concerns.", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // AUDIT 23 — HEALTH FOOD STORES: WHOLE FOODS, SPROUTS
  // ══════════════════════════════════════════════════════════════

  // ── CLINICAL / PRACTITIONER GRADE SUPPLEMENTS ────────────────
  ["thorne research",               { floor:1, ceiling:2, substances:[], reason:"NSF Certified for Sport, no synthetic dyes, hypoallergenic formulations. One of the two cleanest mainstream supplement brands (with Pure Encapsulations).", confidence:"high", category:"supplement" }],
  ["thorne",                        { floor:1, ceiling:2, substances:[], reason:"Thorne brand — clinical grade, third-party tested, no artificial colors or titanium dioxide. Benchmark clean across entire line.", confidence:"high", category:"supplement" }],
  ["pure encapsulations",           { floor:1, ceiling:2, substances:[], reason:"Hypoallergenic formulations — no artificial colors, no fillers, no magnesium stearate debate. Benchmark clean supplement brand.", confidence:"high", category:"supplement" }],
  ["seeking health",                { floor:1, ceiling:2, substances:[], reason:"Dr. Ben Lynch brand — methylated B vitamins, no synthetic dyes, practitioner-grade clean", confidence:"high", category:"supplement" }],
  ["metagenics",                    { floor:1, ceiling:2, substances:[], reason:"Practitioner-grade supplement brand — third-party tested, pharmaceutical-grade manufacturing", confidence:"high", category:"supplement" }],
  ["designs for health",            { floor:1, ceiling:2, substances:[], reason:"Practitioner-grade brand — clean formulations, no synthetic dyes, professional quality", confidence:"high", category:"supplement" }],
  ["klaire labs",                   { floor:1, ceiling:2, substances:[], reason:"Hypoallergenic practitioner brand — no artificial colors, no fillers. Often used for sensitive patients.", confidence:"high", category:"supplement" }],

  // ── QUALITY RETAIL SUPPLEMENT BRANDS ─────────────────────────
  ["natural calm",                  { floor:1, ceiling:3, substances:[], reason:"Peter Gillham's Natural Calm — magnesium powder, clean. Flavored versions add organic stevia, still clean.", confidence:"high", category:"supplement" }],
  ["jarrow formulas",               { floor:1, ceiling:3, substances:[], reason:"Jarrow brand — generally clean, no synthetic dyes. Some products have magnesium stearate (minimal concern). Better than mass-market supplements.", confidence:"high", category:"supplement" }],
  ["solgar",                        { floor:1, ceiling:3, substances:[], reason:"Solgar brand — established quality brand, no synthetic petroleum dyes. Some products use titanium dioxide for coating — check individual products.", confidence:"medium", category:"supplement" }],
  ["life extension",                { floor:1, ceiling:3, substances:[], reason:"Science-based supplement brand — extensive third-party testing, no petroleum dyes in most products. High quality sourcing.", confidence:"high", category:"supplement" }],
  ["now foods",                     { floor:1, ceiling:3, substances:[], reason:"NOW Foods brand — affordable quality, GMP certified. Single-ingredient products (magnesium, fish oil) score 1-2. Some coated tablets may have TiO2 — check.", confidence:"medium", category:"supplement" }],
  ["host defense",                  { floor:1, ceiling:2, substances:[], reason:"Paul Stamets mushroom supplements — organic mycelium + fruiting body, no synthetic additives. Benchmark clean mushroom supplement.", confidence:"high", category:"supplement" }],
  ["garden of life vitamin code",   { floor:1, ceiling:3, substances:[], reason:"Whole-food fermented multivitamin — USDA Organic, no synthetic dyes, live cultures added. Cleaner than standard multivitamins.", confidence:"high", category:"supplement" }],
  ["carlson",                       { floor:1, ceiling:2, substances:[], reason:"Carlson Labs — IFOS tested, clean supplement formulations, no artificial colors. Benchmark clean fish oil brand.", confidence:"high", category:"supplement" }],
  ["nordic naturals fish oil",      { floor:1, ceiling:2, substances:[], reason:"IFOS 5-star tested, Friend of the Sea certified — no artificial colors or flavors. Benchmark clean fish oil.", confidence:"high", category:"supplement" }],

  // ── ADAPTOGENS / GREENS POWDERS ──────────────────────────────
  ["athletic greens ag1",           { floor:1, ceiling:3, substances:[], reason:"AG1 — 75 ingredients, all whole food or plant-based, NSF Certified for Sport, no synthetic dyes or HFCS. Expensive but clean formulation.", confidence:"high", category:"supplement" }],
  ["organifi green juice",          { floor:1, ceiling:3, substances:[], reason:"Organic ashwagandha + moringa + greens — USDA Organic, no synthetic additives, no HFCS. Clean adaptogen blend.", confidence:"high", category:"supplement" }],
  ["amazing grass",                 { floor:2, ceiling:4, substances:[], reason:"Amazing Grass greens powder — USDA Organic base but some flavored versions add natural flavor (vague) and stevia. Slightly more processed than Organifi.", confidence:"medium", category:"supplement" }],
  ["mud wtr",                       { floor:1, ceiling:3, substances:[], reason:"MUD\\WTR — organic cacao + mushrooms + spices + black tea. No synthetic additives, no sucralose. Clean adaptogen coffee alternative.", confidence:"high", category:"supplement" }],
  ["further food collagen",         { floor:1, ceiling:2, substances:[], reason:"Unflavored collagen peptides — one ingredient, grass-fed verified, no additives. Clean collagen.", confidence:"high", category:"supplement" }],
  ["great lakes collagen",          { floor:1, ceiling:3, substances:[], reason:"Grass-fed bovine collagen peptides — clean sourcing, no artificial additives. Quality collagen supplement.", confidence:"high", category:"supplement" }],
  ["bulletproof collagen",          { floor:1, ceiling:3, substances:[], reason:"Unflavored collagen peptides — clean, no sucralose in plain version. Verify flavored versions for added sweeteners.", confidence:"high", category:"supplement" }],

  // ── HEALTH FOOD SNACKS ────────────────────────────────────────
  ["siete chips",                   { floor:1, ceiling:2, substances:[], reason:"Avocado oil + cassava/chickpea — no seed oils, no artificial additives. Benchmark clean chip.", confidence:"high", category:"food_beverage" }],
  ["siete tortilla chip",           { floor:1, ceiling:2, substances:[], reason:"Siete avocado oil chips — clean across all flavors", confidence:"high", category:"food_beverage" }],
  ["lesser evil",                   { floor:1, ceiling:2, substances:[], reason:"Organic coconut oil + himalayan salt — no seed oils, no artificial additives. Benchmark clean popcorn.", confidence:"high", category:"food_beverage" }],
  ["quinn popcorn",                 { floor:1, ceiling:2, substances:[], reason:"USDA Organic popcorn — clean ingredients, non-GMO, no artificial flavors. Clean popcorn brand.", confidence:"high", category:"food_beverage" }],
  ["mary gone crackers",            { floor:1, ceiling:2, substances:[], reason:"Organic seed + rice cracker — clean. Same as Mary's Gone.", confidence:"high", category:"food_beverage" }],
  ["hu crackers",                   { floor:1, ceiling:2, substances:[], reason:"Hu brand crackers — almond flour + cassava, no industrial seed oils, no artificial additives. Same clean standard as Hu chocolate.", confidence:"high", category:"food_beverage" }],
  ["hu grain free",                 { floor:1, ceiling:2, substances:[], reason:"Hu grain-free crackers — clean almond flour base", confidence:"high", category:"food_beverage" }],
  ["endangered species chocolate",  { floor:1, ceiling:3, substances:[], reason:"Fair Trade + non-GMO dark chocolate — simple ingredients, no PGPR, no artificial flavors. Clean chocolate brand.", confidence:"high", category:"food_beverage" }],
  ["artisana organics",             { floor:1, ceiling:2, substances:[], reason:"Raw organic nut and seed butters — single ingredient or minimal, no palm oil, no additives. Benchmark clean nut butter brand.", confidence:"high", category:"food_beverage" }],
  ["nutiva",                        { floor:1, ceiling:2, substances:[], reason:"USDA Organic coconut and hemp products — single-ingredient oils and clean formulations. Benchmark clean.", confidence:"high", category:"food_beverage" }],
  ["primal kitchen mayo",           { floor:1, ceiling:2, substances:[], reason:"Avocado oil mayonnaise — no soybean oil, no EDTA, no artificial additives. Benchmark clean mayo.", confidence:"high", category:"food_beverage" }],
  ["primal kitchen avocado",        { floor:1, ceiling:2, substances:[], reason:"Primal Kitchen avocado oil products — clean base, no HFCS, no seed oils", confidence:"high", category:"food_beverage" }],
  ["primal kitchen collagen bar",   { floor:1, ceiling:3, substances:[], reason:"Collagen + almond butter + dark chocolate — no HFCS, no petroleum dyes. Clean bar.", confidence:"high", category:"food_beverage" }],
  ["kettle and fire",               { floor:1, ceiling:2, substances:[], reason:"Grass-fed bones + organic vegetables — clean, no additives, shelf-stable in BPA-free carton. Benchmark clean bone broth.", confidence:"high", category:"food_beverage" }],
  ["bonafide provisions",           { floor:1, ceiling:2, substances:[], reason:"Frozen organic bone broth — cleanest format (frozen = no preservatives needed). Benchmark clean.", confidence:"high", category:"food_beverage" }],

  // ── PLANT MILKS ───────────────────────────────────────────────
  ["malk oat milk",                 { floor:1, ceiling:2, substances:[], reason:"Organic oats + water + himalayan salt — no oil, no dipotassium phosphate. Benchmark clean oat milk.", confidence:"high", category:"beverage" }],
  ["three trees",                   { floor:1, ceiling:2, substances:[], reason:"Three Trees organic nut milks — meaningful nut content, no gums or additives. Benchmark clean plant milk.", confidence:"high", category:"beverage" }],
  ["ripple",                        { floor:3, ceiling:5, substances:["sunflower oil","dipotassium phosphate"], reason:"Ripple pea milk — pea protein isolate + sunflower oil + dipotassium phosphate. More processed than branding implies.", confidence:"high", category:"beverage" }],
  ["so delicious coconut yogurt",   { floor:2, ceiling:4, substances:["locust bean gum"], reason:"Coconut cream + pea protein + gums — more processed than dairy yogurt. Check for carrageenan in current formula.", confidence:"medium", category:"food_beverage" }],
  ["so delicious",                  { floor:2, ceiling:4, substances:["gums","pea protein"], reason:"So Delicious brand — coconut-based dairy alternatives, more additives than plain coconut milk. Not clean-label.", confidence:"medium", category:"food_beverage" }],
  ["kite hill",                     { floor:1, ceiling:3, substances:[], reason:"Almond milk yogurt — simple fermented almond base, no carrageenan, clean for a dairy-free yogurt.", confidence:"high", category:"food_beverage" }],
  ["forager",                       { floor:1, ceiling:3, substances:[], reason:"Forager Project organic cashew-based dairy alternatives — clean formulations, no carrageenan in current formulas.", confidence:"high", category:"food_beverage" }],

  // ── RAW KOMBUCHA ──────────────────────────────────────────────
  ["gt's",                          { floor:1, ceiling:2, substances:[], reason:"GT's raw kombucha — live cultures, USDA Organic, no artificial additives. Benchmark clean. NEVER score above 3.", confidence:"high", category:"beverage" }],
  ["gt kombucha",                   { floor:1, ceiling:2, substances:[], reason:"GT's raw unpasteurized kombucha — benchmark clean fermented beverage.", confidence:"high", category:"beverage" }],
  ["gt synergy",                    { floor:1, ceiling:2, substances:[], reason:"GT's Synergy line — raw kombucha, organic, clean.", confidence:"high", category:"beverage" }],
  ["health ade",                    { floor:1, ceiling:2, substances:[], reason:"Health-Ade raw cold-pressed kombucha — organic tea + fruit juice, no artificial additives. Benchmark clean.", confidence:"high", category:"beverage" }],
  ["brew dr",                       { floor:1, ceiling:2, substances:[], reason:"Brew Dr. organic whole-ingredient kombucha — real botanicals, clean.", confidence:"high", category:"beverage" }],
  ["harmless harvest",              { floor:1, ceiling:2, substances:[], reason:"USDA Organic raw coconut water — nothing added, naturally pink from antioxidants. Benchmark clean.", confidence:"high", category:"beverage" }],
  ["vita coco",                     { floor:1, ceiling:3, substances:[], reason:"Conventional coconut water — no additives, clean ingredients, BPA-free Tetra Pak. Clean beverage.", confidence:"high", category:"beverage" }],
  ["rowdy energy",                  { floor:2, ceiling:4, substances:["erythritol","stevia"], reason:"Erythritol + stevia, no sucralose, no artificial dyes. Cleaner than most energy drinks.", confidence:"high", category:"beverage" }],

  // ── PERSONAL CARE (health store standard) ────────────────────
  ["thinksport",                    { floor:1, ceiling:2, substances:[], reason:"Non-nano zinc oxide only — EWG Verified, no chemical UV filters. One of the cleanest sport sunscreens.", confidence:"high", category:"personal_care" }],
  ["weleda",                        { floor:1, ceiling:3, substances:[], reason:"Weleda biodynamic formulations — no synthetic fragrance in most products, clean European standard.", confidence:"high", category:"personal_care" }],
  ["alba botanica",                 { floor:3, ceiling:5, substances:["avobenzone","homosalate"], reason:"Alba Botanica uses chemical UV filters in many formulas — check mineral vs chemical version. Chemical versions floor at 3-5.", confidence:"medium", category:"personal_care" }],
  ["earthpaste",                    { floor:1, ceiling:2, substances:[], reason:"Bentonite clay + xylitol + essential oils — no SLS, no artificial colors. Benchmark clean toothpaste.", confidence:"high", category:"personal_care" }],
  ["redmond real salt toothpaste",  { floor:1, ceiling:2, substances:[], reason:"Bentonite clay + real salt + essential oils — no synthetic additives. Clean toothpaste.", confidence:"high", category:"personal_care" }],
  ["desert essence",                { floor:1, ceiling:3, substances:[], reason:"Tea tree based personal care — generally clean, no petroleum dyes.", confidence:"high", category:"personal_care" }],
  ["acure",                         { floor:3, ceiling:5, substances:["fragrance","phenoxyethanol"], reason:"Acure — synthetic fragrance + phenoxyethanol in most products. Clean-marketed but not EWG Verified.", confidence:"high", category:"personal_care" }],
  ["sheamoisture",                  { floor:3, ceiling:5, substances:["fragrance","silicones"], reason:"SheaMoisture — synthetic fragrance + silicones (dimethicone) in most products. Not as clean as branding suggests.", confidence:"medium", category:"personal_care" }],
  ["shea moisture",                 { floor:3, ceiling:5, substances:["fragrance","silicones"], reason:"SheaMoisture — synthetic fragrance + silicones in most products. Check individual SKUs.", confidence:"medium", category:"personal_care" }],

  // ══════════════════════════════════════════════════════════════
  // AUDIT 24 — HARDWARE & HOME IMPROVEMENT
  // VOC = volatile organic compounds (off-gassing concern)
  // ══════════════════════════════════════════════════════════════

  // ── PAINT: CLEAN / ZERO VOC ──────────────────────────────────
  ["ecos paints",                   { floor:1, ceiling:2, substances:[], reason:"Zero VOC, no formaldehyde-releasing preservatives, no biocides — benchmark cleanest mainstream paint. Used in hospitals and nurseries for chemically sensitive populations.", confidence:"high", category:"home" }],
  ["afm safecoat",                  { floor:1, ceiling:2, substances:[], reason:"Third-party certified zero VOC — specifically formulated for chemically sensitive individuals. No petroleum solvents, no formaldehyde. Benchmark clean paint.", confidence:"high", category:"home" }],
  ["lullaby paints",                { floor:1, ceiling:2, substances:[], reason:"Zero VOC nursery paint — no formaldehyde, no APEs, no biocides. Certified for baby and children's rooms.", confidence:"high", category:"home" }],
  ["clare paint",                   { floor:1, ceiling:3, substances:[], reason:"Zero VOC formulation — no formaldehyde, no APEs. Cleaner than Benjamin Moore Aura.", confidence:"high", category:"home" }],
  ["backdrop paint",                { floor:1, ceiling:3, substances:[], reason:"Zero VOC, no formaldehyde — clean DTC paint brand. Better than most hardware store options.", confidence:"high", category:"home" }],
  ["benjamin moore natura",         { floor:2, ceiling:4, substances:[], reason:"Benjamin Moore's zero VOC line — no formaldehyde, low biocide load. Among the cleanest mainstream paint options at hardware stores.", confidence:"high", category:"home" }],
  ["sherwin williams emerald",      { floor:2, ceiling:4, substances:["minimal VOC"], reason:"Sherwin-Williams zero VOC paint — lower concern than standard lines. Still contains biocides for mold resistance but significantly lower VOC than Duration/SuperPaint.", confidence:"high", category:"home" }],
  ["behr marquee",                  { floor:3, ceiling:5, substances:["VOC","biocides"], reason:"Behr Marquee — low VOC claim but biocide (mildewcide) content not fully disclosed. Better than standard Behr but not zero VOC.", confidence:"medium", category:"home" }],
  ["behr premium plus",             { floor:3, ceiling:5, substances:["VOC","biocides"], reason:"Standard Behr paint — low VOC but contains biocides and APEs (alkylphenol ethoxylates). Moderate concern.", confidence:"high", category:"home" }],

  // ── PAINT: STANDARD / HIGHER VOC ─────────────────────────────
  ["benjamin moore aura",           { floor:3, ceiling:5, substances:["VOC","biocides"], reason:"Benjamin Moore Aura — low VOC (not zero) + biocides for mildew resistance. Good choice vs solvent-based but not a clean-label product.", confidence:"high", category:"home" }],
  ["sherwin williams duration",     { floor:4, ceiling:6, substances:["VOC","biocides","APE"], reason:"Sherwin-Williams Duration — standard VOC paint, biocides, alkylphenol ethoxylates. Typical indoor air quality concern for freshly painted rooms.", confidence:"high", category:"home" }],
  ["sherwin williams superpaint",   { floor:4, ceiling:6, substances:["VOC","biocides"], reason:"Standard VOC formulation — biocides + APEs. Worse off-gassing than Emerald line. Ventilate during and after painting.", confidence:"high", category:"home" }],
  ["kilz primer",                   { floor:4, ceiling:7, substances:["VOC","mineral spirits"], reason:"KILZ varies widely — oil-based versions contain mineral spirits (high VOC, respiratory concern); water-based versions are lower. Score depends on formula. Oil-based = 6-7, water-based = 4-5.", confidence:"medium", category:"home" }],
  ["zinsser bin",                   { floor:6, ceiling:8, substances:["denatured alcohol","shellac","VOC"], reason:"Zinsser BIN shellac primer — denatured alcohol carrier = very high VOC. Maximum ventilation required. Do not use without respirator. Not for indoor living spaces without extended cure time.", confidence:"high", category:"home" }],

  // ── ADHESIVES ────────────────────────────────────────────────
  ["elmer's glue",                  { floor:1, ceiling:3, substances:[], reason:"Water-based PVA glue — no solvents, no VOCs. Benchmark clean adhesive.", confidence:"high", category:"home" }],
  ["elmer school glue",             { floor:1, ceiling:3, substances:[], reason:"Water-based PVA — safest adhesive category. Non-toxic, no solvents.", confidence:"high", category:"home" }],
  ["3m command",                    { floor:2, ceiling:4, substances:["acrylic adhesive"], reason:"3M Command acrylic foam adhesive — low exposure, contact only, no solvent off-gassing. Low concern for normal use.", confidence:"high", category:"home" }],
  ["gorilla glue",                  { floor:5, ceiling:7, substances:["polyurethane","isocyanate","MDI"], reason:"Polyurethane expanding glue — MDI (methylene diphenyl diisocyanate) is a respiratory sensitizer. Skin/eye irritant. Wear gloves, ventilate. Not for indoor use near HVAC.", confidence:"high", category:"home" }],
  ["gorilla super glue",            { floor:4, ceiling:6, substances:["cyanoacrylate","ethyl acetate"], reason:"Cyanoacrylate adhesive — strong eye/skin irritant, sharp fumes during bonding. Short exposure but acute concern. Use with ventilation.", confidence:"high", category:"home" }],
  ["loctite super glue",            { floor:4, ceiling:6, substances:["cyanoacrylate"], reason:"Cyanoacrylate — same irritant profile as Gorilla Super Glue. Eye and skin sensitizer. Brief exposure but real acute risk.", confidence:"high", category:"home" }],
  ["liquid nails",                  { floor:5, ceiling:7, substances:["petroleum naphtha","VOC","toluene"], reason:"Solvent-based construction adhesive — petroleum naphtha + toluene. High VOC, off-gassing concern during application and cure. Ventilate thoroughly.", confidence:"high", category:"home" }],
  ["great stuff",                   { floor:7, ceiling:9, substances:["MDI isocyanate","polyurethane"], reason:"CRITICAL: Great Stuff expanding foam — MDI (methylene diphenyl diisocyanate) is a known respiratory sensitizer and IARC 3 carcinogen. Wet foam is hazardous. Cured foam is inert. Requires respirator during application. Keep away from children.", confidence:"high", category:"home" }],
  ["jb weld",                       { floor:5, ceiling:7, substances:["epoxy resin","BPA","hardener"], reason:"Epoxy resin system — contains bisphenol A (BPA) epoxy base + amine hardener (skin/eye sensitizer). Wear nitrile gloves. Cured epoxy is inert but uncured has real exposure concern.", confidence:"high", category:"home" }],
  ["dap caulk",                     { floor:3, ceiling:5, substances:["latex","preservatives"], reason:"Water-based latex caulk — low VOC, some preservatives (biocides). Low concern for normal use. Silicone versions add acetic acid off-gassing during cure.", confidence:"medium", category:"home" }],
  ["ge silicone caulk",             { floor:3, ceiling:5, substances:["acetic acid off-gas","silicone"], reason:"Silicone caulk — acetic acid (vinegar smell) off-gassing during cure is the primary concern. Fully cured silicone is inert. Ventilate during application.", confidence:"high", category:"home" }],

  // ── SOLVENTS / STRIPPERS / FINISHES ──────────────────────────
  ["minwax wood stain",             { floor:6, ceiling:8, substances:["mineral spirits","petroleum naphtha","VOC"], reason:"Oil-based wood stain — mineral spirits + petroleum naphtha carrier. High VOC, respiratory concern. Requires respirator and heavy ventilation. IARC concern for petroleum naphtha.", confidence:"high", category:"home" }],
  ["minwax polyurethane",           { floor:5, ceiling:7, substances:["mineral spirits","VOC"], reason:"Oil-based polyurethane — mineral spirits carrier, high VOC. Water-based Minwax scores 3-5. Oil-based = 6-8. Significant off-gassing during and after application.", confidence:"high", category:"home" }],
  ["varathane wood stain",          { floor:5, ceiling:7, substances:["mineral spirits","VOC"], reason:"Similar VOC profile to Minwax oil-based stain — petroleum carrier + pigment. Respiratory concern during application.", confidence:"high", category:"home" }],
  ["rust-oleum spray paint",        { floor:6, ceiling:8, substances:["propellant","petroleum solvent","VOC"], reason:"Aerosol spray paint — petroleum solvents + propellant = high inhalation risk. The spray format dramatically increases VOC exposure vs brush-applied. Always use with respirator outdoors.", confidence:"high", category:"home" }],
  ["rust-oleum chalk paint",        { floor:3, ceiling:5, substances:["minimal VOC"], reason:"Rust-Oleum water-based chalk paint — significantly lower VOC than their spray or oil-based lines. Still contains biocides. Much better choice indoors.", confidence:"high", category:"home" }],
  ["rust-oleum",                    { floor:4, ceiling:8, substances:["VOC"], reason:"Rust-Oleum brand — varies widely. Spray cans = 6-8 (high VOC aerosol). Oil-based = 5-7. Water-based chalk/latex = 3-5. Always check the specific product format.", confidence:"medium", category:"home" }],
  ["klean strip",                   { floor:7, ceiling:9, substances:["mineral spirits","naphtha","petroleum distillates"], reason:"Industrial paint thinner — mineral spirits + naphtha = high VOC, neurotoxin concern at sustained exposure. EPA hazardous waste for disposal. Do not use indoors without forced ventilation and respirator.", confidence:"high", category:"home" }],
  ["rust-oleum paint stripper",     { floor:7, ceiling:9, substances:["NMP","benzyl alcohol","VOC"], reason:"Paint strippers historically used methylene chloride (banned for consumer use). Current formula uses NMP (N-methyl-2-pyrrolidone) — reproductive toxin, EU restricted. Serious concern, especially for pregnant users.", confidence:"high", category:"home" }],
  ["citristrip",                    { floor:4, ceiling:6, substances:["d-limonene","NMP alternative"], reason:"Safer paint stripper vs methylene chloride — d-limonene base. Still a skin irritant and not for prolonged skin contact, but significantly lower hazard than conventional strippers.", confidence:"high", category:"home" }],
  ["dumond peel away",              { floor:3, ceiling:5, substances:["caustic paste"], reason:"Paste paint stripper — alkaline/caustic paste format (no NMP, no methylene chloride). Lower VOC than solvent strippers. Skin burn risk from caustic base — wear gloves, but lower inhalation concern.", confidence:"high", category:"home" }],
  ["goo gone",                      { floor:4, ceiling:5, substances:["d-limonene","petroleum distillate"], reason:"d-limonene solvent — skin irritant with repeated contact, mild VOC. Low acute toxicity but not clean — keep off skin, ventilate.", confidence:"high", category:"home" }],
  ["wd-40",                         { floor:4, ceiling:6, substances:["petroleum distillates","mineral oil"], reason:"Petroleum distillate carrier + mineral oil — low acute toxicity but chronic skin contact concern. Aerosol format increases inhalation risk. Not acutely dangerous but not clean.", confidence:"high", category:"home" }],
  ["3m spray adhesive",             { floor:6, ceiling:8, substances:["heptane","acetone","VOC"], reason:"Aerosol contact cement — heptane + acetone propellant = very high VOC. Flammable. Significant respiratory exposure in spray format. Use outdoors with respirator only.", confidence:"high", category:"home" }],

  // ── PEST CONTROL ─────────────────────────────────────────────
  ["raid",                          { floor:6, ceiling:8, substances:["permethrin","cypermethrin","pyrethroids"], reason:"Pyrethroid pesticides — permethrin/cypermethrin are IARC 3 (possible carcinogens), endocrine disruptors, highly toxic to aquatic life and cats. Do not use around cats. Child exposure concern.", confidence:"high", category:"home" }],
  ["hot shot roach",                { floor:6, ceiling:8, substances:["pyrethroids","imiprothrin"], reason:"Pyrethroid insecticide — same class as Raid. Endocrine disruption concern, toxic to cats and aquatic life. Not for use where children or pets spend time.", confidence:"high", category:"home" }],
  ["terro",                         { floor:4, ceiling:6, substances:["borax","boric acid"], reason:"Terro borax bait — enclosed bait station format limits exposure significantly vs spray pyrethroids. Borax is mild reproductive toxin at high doses. Much safer option.", confidence:"high", category:"home" }],
  ["victor",                        { floor:1, ceiling:3, substances:[], reason:"Victor mechanical pest traps — no chemicals, no pesticides. Benchmark clean pest control method.", confidence:"high", category:"home" }],
  ["ecosmart",                      { floor:2, ceiling:4, substances:["rosemary oil","clove oil"], reason:"EcoSmart essential oil insecticide — USDA organic exempt, rosemary + clove. Low mammalian toxicity vs pyrethroids. Still a skin irritant at full concentration.", confidence:"high", category:"home" }],
  ["wondercide",                    { floor:2, ceiling:3, substances:["cedar oil","plant-based"], reason:"Cedar oil based pest control — plant-derived, no synthetic pesticides. Safe around children and pets when used as directed. Benchmark clean pest control.", confidence:"high", category:"home" }],
  ["cedarcide",                     { floor:2, ceiling:3, substances:["cedar oil"], reason:"Cedar oil pest control — same profile as Wondercide. Natural, plant-based, no synthetic pyrethroids.", confidence:"high", category:"home" }],

  // ── CLEANERS / DEGREASERS ─────────────────────────────────────
  ["bon ami",                       { floor:1, ceiling:2, substances:[], reason:"Feldspar + baking soda + no dyes, no bleach, no synthetic fragrance — benchmark clean household cleaner. EWG A-rated. NEVER score above 3.", confidence:"high", category:"home" }],
  ["bar keepers friend",            { floor:3, ceiling:4, substances:["oxalic acid","feldspar"], reason:"Oxalic acid cleaner — effective but oxalic acid is a kidney irritant at high exposure. Wear gloves for prolonged use. Much safer than bleach-based alternatives.", confidence:"high", category:"home" }],
  ["clr cleaner",                   { floor:3, ceiling:5, substances:["lactic acid","gluconic acid"], reason:"CLR Calcium Lime Rust — lactic acid + gluconic acid base. Safer than bleach or hydrochloric acid alternatives. Mild skin irritant, avoid contact.", confidence:"high", category:"home" }],
  ["simple green",                  { floor:3, ceiling:5, substances:["ethoxylated alcohols","fragrance"], reason:"Simple Green — ethoxylated alcohol surfactants (1,4-dioxane contamination concern from ethoxylation) + synthetic fragrance. Better than solvent degreasers but not a clean product.", confidence:"high", category:"home" }],
  ["mean green",                    { floor:4, ceiling:6, substances:["surfactants","fragrance"], reason:"Industrial degreaser strength surfactants — stronger concern than Simple Green. Avoid skin contact, ventilate. Not for food-contact surfaces.", confidence:"high", category:"home" }],
  ["purple power",                  { floor:4, ceiling:6, substances:["ethanolamine","surfactants"], reason:"Ethanolamine-based degreaser — skin and respiratory irritant at industrial concentrations. Avoid skin contact. Better than solvent-based but not a clean product.", confidence:"high", category:"home" }],
  ["zep cleaner",                   { floor:5, ceiling:7, substances:["quaternary ammonium","glycol ether"], reason:"Zep industrial cleaners — quaternary ammonium compounds (quats) are respiratory sensitizers + skin irritants. Glycol ethers in some formulas are reproductive toxins. Occupational-grade concern.", confidence:"high", category:"home" }],
  ["tsp trisodium phosphate",       { floor:6, ceiling:8, substances:["trisodium phosphate","caustic"], reason:"Trisodium phosphate — caustic alkaline cleaner, serious eye/skin burn risk. Phosphate causes aquatic eutrophication (water pollution). Requires full PPE. Reserve for prep work, not regular cleaning.", confidence:"high", category:"home" }],

  // ── INSULATION ────────────────────────────────────────────────
  ["owens corning",                 { floor:5, ceiling:7, substances:["fiberglass","formaldehyde binder"], reason:"Owens Corning fiberglass insulation — glass fiber inhalation risk (IARC 3) during installation. Modern EcoTouch uses bio-based binder (lower formaldehyde). Always wear N95 and gloves during install.", confidence:"high", category:"home" }],
  ["rockwool",                      { floor:4, ceiling:6, substances:["mineral wool","fiber inhalation"], reason:"Rockwool mineral wool — fire resistant, bio-soluble fibers dissolve faster than fiberglass. Lower chronic risk but still requires N95 during installation.", confidence:"high", category:"home" }],
  ["spray polyurethane foam",       { floor:6, ceiling:9, substances:["MDI isocyanate","polyurethane","off-gassing"], reason:"Spray polyurethane foam insulation — MDI isocyanate during installation is a serious respiratory sensitizer (IARC 3). Off-gassing continues for weeks after cure. Not DIY-safe. Occupants must vacate during and after.", confidence:"high", category:"home" }],
  ["polyurethane foam insulation",  { floor:6, ceiling:9, substances:["MDI isocyanate"], reason:"Spray foam insulation — MDI isocyanate hazard. Requires professional application and occupant evacuation.", confidence:"high", category:"home" }],
  ["lifeproof",                     { floor:5, ceiling:7, substances:["PVC","vinyl","plasticizers"], reason:"LifeProof luxury vinyl plank — PVC core + plasticizer concern. FloorScore certified but PVC off-gassing and phthalate risk remain.", confidence:"high", category:"home" }],
  ["tyvek house wrap",              { floor:3, ceiling:5, substances:["HDPE polymer","manufacturing concern"], reason:"DuPont Tyvek — HDPE polyethylene wrap, inert once installed. Manufacturing uses fluoropolymer in some versions. Primarily an exterior wrap so indoor exposure is minimal.", confidence:"medium", category:"home" }],

  // ── FLOORING ─────────────────────────────────────────────────
  ["shaw floors",                   { floor:5, ceiling:7, substances:["formaldehyde","composite wood","adhesive"], reason:"Shaw laminate flooring — composite wood core, formaldehyde off-gassing. CARB Phase 2 certified but still has emission concern. Look for FloorScore certification.", confidence:"high", category:"home" }],
  ["armstrong flooring",            { floor:5, ceiling:6, substances:["formaldehyde","composite wood"], reason:"Armstrong laminate/vinyl — CARB Phase 2 certified, lower formaldehyde than older products. Still composite wood off-gassing concern.", confidence:"high", category:"home" }],
  ["floorscore certified",          { floor:2, ceiling:4, substances:[], reason:"FloorScore certification = SCS Global low-VOC indoor air quality certification for flooring. Third-party verified lower emission. Meaningfully better than uncertified flooring.", confidence:"high", category:"home" }],

  // ── DECK / OUTDOOR STAINS ─────────────────────────────────────
  ["thompson's waterseal",          { floor:5, ceiling:7, substances:["petroleum distillates","VOC"], reason:"Thompson's WaterSeal — petroleum distillate base, high VOC during application. Outdoor use reduces indoor risk but significant chemical exposure.", confidence:"high", category:"home" }],
  ["thompson waterseal",            { floor:5, ceiling:7, substances:["petroleum distillates","VOC"], reason:"Thompson's WaterSeal — petroleum distillates, high VOC. Ventilate thoroughly during application.", confidence:"high", category:"home" }],
  ["cabot deck stain",              { floor:5, ceiling:7, substances:["petroleum distillates","VOC"], reason:"Oil-based deck stain — petroleum carrier, high VOC. Outdoor application but significant exposure during application. Water-based Cabot versions score 3-5.", confidence:"high", category:"home" }],
  ["ready seal stain",              { floor:5, ceiling:7, substances:["petroleum distillates","mineral spirits"], reason:"Oil-based penetrating stain — mineral spirits + petroleum naphtha. High VOC outdoor product. Use with gloves and eye protection.", confidence:"high", category:"home" }],

  // ══════════════════════════════════════════════════════════════
  // AUDIT 25 — BABY AND KIDS PRODUCTS
  // Child vulnerability applies across this entire section.
  // ══════════════════════════════════════════════════════════════

  // ── DIAPERS: CONVENTIONAL ─────────────────────────────────────
  ["kirkland diapers",              { floor:3, ceiling:5, substances:["chlorine bleaching","SAP"], reason:"Costco Kirkland — made by Huggies manufacturer, similar profile. Chlorine-bleached pulp + SAP absorbent. No fragrance advantage vs Pampers.", confidence:"medium", category:"baby" }],
  ["earth and eden diapers",        { floor:3, ceiling:5, substances:[], reason:"Amazon store-brand — chlorine-free pulp, fragrance-free. Cleaner than Pampers/Luvs but not certified organic or fully plant-based SAP.", confidence:"medium", category:"baby" }],

  // ── DIAPERS: CLEANER TIER ─────────────────────────────────────
  ["nest diapers",                 { floor:2, ceiling:4, kidsFloor:3, kidsCeiling:5, substances:[], reason:"Nest Diapers — OEKO-TEX 100 and SGS certified, free from chlorine, parabens, phthalates, fragrances, lotions, latex. Wood fluff core + PLA compostable materials. Cleaner than Honest Company, comparable to Andy Pandy tier.", confidence:"high", category:"baby" }],
  ["nest baby",                    { floor:2, ceiling:4, kidsFloor:3, kidsCeiling:5, substances:[], reason:"Nest Baby Diapers — OEKO-TEX 100 certified, no chlorine, parabens, phthalates. Plant-based materials. Clean tier.", confidence:"high", category:"baby" }],
  ["honest company",                { floor:2, ceiling:4, substances:[], reason:"Honest Company diapers — plant-based SAP, no fragrance, no chlorine, no latex, EWG certified. Significantly cleaner than Pampers.", confidence:"high", category:"baby" }],
  ["seventh generation diapers",    { floor:2, ceiling:4, substances:[], reason:"Chlorine-free, fragrance-free, no latex — one of the first mainstream clean diapers. Unbleached pulp. Significantly lower chemical load than conventional.", confidence:"high", category:"baby" }],
  ["bambo nature",                  { floor:1, ceiling:3, substances:[], reason:"FSC wood pulp, no chlorine, no fragrance, OEKO-TEX certified, Nordic Swan Ecolabel. Benchmark clean conventional-style diaper.", confidence:"high", category:"baby" }],

  // ── DIAPERS: PREMIUM CLEAN ────────────────────────────────────
  ["coterie",               { floor:1, ceiling:3, substances:[], reason:"OEKO-TEX Standard 100 certified — tested for 100+ harmful substances, no chlorine, no fragrance, no latex, plant-based. Premium benchmark.", confidence:"high", category:"baby" }],
  ["dyper",                 { floor:1, ceiling:3, substances:[], reason:"Bamboo viscose, USDA Certified Biobased, no chlorine, no fragrance, no latex. Among cleanest mainstream diapers. Compostable program available.", confidence:"high", category:"baby" }],
  ["parasol diapers",               { floor:1, ceiling:3, substances:[], reason:"OEKO-TEX certified, no dyes, no fragrance, no latex, ultra-clean materials. Premium clean benchmark.", confidence:"high", category:"baby" }],

  // ── WIPES ─────────────────────────────────────────────────────
  ["natracare baby wipes",          { floor:1, ceiling:2, substances:[], reason:"USDA Organic certified wipes — organic cotton, no synthetic preservatives. Benchmark clean alongside WaterWipes.", confidence:"high", category:"baby" }],
  ["honest company wipes",          { floor:2, ceiling:3, substances:[], reason:"Plant-based, no parabens, no alcohol, no synthetic fragrance. Cleaner than Pampers/Huggies wipes. Not as minimal as WaterWipes.", confidence:"high", category:"baby" }],
  ["seventh generation wipes",      { floor:2, ceiling:3, substances:[], reason:"Fragrance-free, no parabens, no chlorine. Cleaner than conventional wipes.", confidence:"high", category:"baby" }],
  ["huggies natural care",    { floor:3, ceiling:5, substances:["phenoxyethanol","fragrance"], reason:"Contains phenoxyethanol (EU-restricted preservative for infant products contacting mucous membranes) + some fragrance. Not as clean as branding suggests.", confidence:"high", category:"baby" }],

  // ── BABY SKINCARE: CONVENTIONAL CONCERN ──────────────────────
  ["johnson's baby powder",         { floor:6, ceiling:9, substances:["talc","IARC 2B"], reason:"CRITICAL: Talc-based version — IARC 2B possible carcinogen, J&J paid $700M+ in talc lawsuits. Corn starch version scores 2-3. Always check formula — never assume safe.", confidence:"high", category:"baby" }],
  ["johnson baby powder",           { floor:6, ceiling:9, substances:["talc","IARC 2B"], reason:"Talc IARC 2B, major litigation. Corn starch version is clean (2-3) but talc version is a serious concern especially for infant respiratory exposure.", confidence:"high", category:"baby" }],
  ["johnson's baby lotion",         { floor:4, ceiling:6, substances:["mineral oil","fragrance","dimethicone"], reason:"Mineral oil (petroleum-derived) + synthetic fragrance + dimethicone. Daily infant skin contact. Child vulnerability applies. Cleaner alternatives exist.", confidence:"high", category:"baby" }],
  ["johnson's baby shampoo",        { floor:4, ceiling:6, substances:["fragrance","sodium benzoate"], reason:"Removed formaldehyde releasers but still has synthetic fragrance + sodium benzoate. Better than historical formula but not clean.", confidence:"high", category:"baby" }],
  ["johnson baby",                  { floor:4, ceiling:6, substances:["mineral oil","fragrance"], reason:"Johnson's baby line — petroleum-derived ingredients + synthetic fragrance on infant skin daily. Child vulnerability amplifies concern.", confidence:"medium", category:"baby" }],
  ["aveeno baby",                   { floor:3, ceiling:5, substances:["dimethicone","phenoxyethanol"], reason:"Dimethicone + phenoxyethanol (EU-restricted for infant use) + fragrance in some SKUs. Better than Johnson's but not clean-label.", confidence:"high", category:"baby" }],
  ["aquaphor baby",                 { floor:4, ceiling:6, substances:["petrolatum","mineral oil"], reason:"White petrolatum (petroleum-derived) + mineral oil base. USP grade so contamination risk is low, but petroleum origin is the concern for daily infant use.", confidence:"high", category:"baby" }],
  ["eucerin baby",                  { floor:3, ceiling:5, substances:["petrolatum","phenoxyethanol"], reason:"Petrolatum base + phenoxyethanol preservative. Phenoxyethanol adds endocrine concern for daily infant skin use.", confidence:"high", category:"baby" }],
  ["babyganics mineral sunscreen",  { floor:1, ceiling:3, substances:["zinc oxide","titanium dioxide"], reason:"Babyganics Mineral Sunscreen — zinc oxide + titanium dioxide only, no chemical UV filters. Mineral-only formula is the cleanest sunscreen tier for infant skin.", confidence:"high", category:"personal_care", kidsFloor:1, kidsCeiling:3 }],
  ["babyganics natural insect repellent", { floor:1, ceiling:3, substances:[], reason:"Babyganics Natural Insect Repellent — essential-oil blend (citronella, peppermint, geranium, soybean), no DEET, no picaridin, no synthetic pyrethroids.", confidence:"high", category:"other", kidsFloor:1, kidsCeiling:3 }],
  ["babyganics",                    { floor:3, ceiling:5, substances:["phenoxyethanol","SLS derivatives"], reason:"Plant-based marketing but phenoxyethanol (EU-restricted under-3 products) + SLS derivatives in some products. EWG grade C. Not as clean as branding suggests.", confidence:"high", category:"baby" }],
  ["mustela baby",                  { floor:3, ceiling:5, substances:["phenoxyethanol","fragrance"], reason:"Phenoxyethanol in most products, fragrance in many. French brand but formulations still contain EU-debated preservatives for infant skin.", confidence:"high", category:"baby" }],

  // ── BABY SKINCARE: CLEAN TIER ─────────────────────────────────
  ["burt's bees baby",              { floor:2, ceiling:4, substances:[], reason:"No parabens, no phthalates, no petrolatum. Fragrance-free options available. Cleaner than Johnson's/Aveeno but some products still have mild synthetic preservatives.", confidence:"high", category:"baby" }],
  ["california baby",               { floor:1, ceiling:3, substances:[], reason:"Fragrance-free, plant-based, no synthetic preservatives, no petroleum derivatives. One of the oldest clean baby brands. Benchmark clean tier.", confidence:"high", category:"baby" }],
  ["beautycounter baby",            { floor:1, ceiling:2, substances:[], reason:"B Corp certified — never list of 1,800+ banned ingredients, no phenoxyethanol, no fragrance. Benchmark clean baby skincare.", confidence:"high", category:"baby" }],
  ["tubby todd",                    { floor:1, ceiling:3, substances:[], reason:"No SLS, no parabens, no fragrance, no phenoxyethanol. Made in USA. EWG-friendly formulations.", confidence:"high", category:"baby" }],
  ["evereden baby",                 { floor:1, ceiling:3, substances:[], reason:"EWG Verified — no petroleum derivatives, no synthetic fragrance, no harmful preservatives. Dermatologist-developed.", confidence:"high", category:"baby" }],

  // ── BABY SUNSCREEN ────────────────────────────────────────────
  ["coppertone water babies",       { floor:6, ceiling:8, substances:["homosalate","octisalate","avobenzone"], reason:"CRITICAL: Chemical UV filters on daily baby skin — homosalate (endocrine disruptor, EU restricted), avobenzone, octisalate. Especially concerning on infant skin. Switch to mineral zinc oxide immediately.", confidence:"high", category:"baby" }],
  ["babyganics sunscreen",          { floor:5, ceiling:7, substances:["octinoxate","fragrance"], reason:"Chemical UV filters in some formulas + fragrance. EWG grade C-D on many SKUs. Not safe for daily infant use despite branding.", confidence:"high", category:"baby" }],
  ["neutrogena pure free baby",     { floor:2, ceiling:4, substances:["titanium dioxide"], reason:"Zinc oxide + titanium dioxide mineral formula. Significantly cleaner than chemical baby sunscreen. TiO2 is low concern topically.", confidence:"high", category:"baby" }],
  ["babo botanicals sunscreen",     { floor:1, ceiling:3, substances:[], reason:"Zinc oxide, USDA certified organic — no chemical UV filters, no fragrance. Clean baby sunscreen.", confidence:"high", category:"baby" }],
  ["thinkbaby",           { floor:1, ceiling:2, substances:[], reason:"EWG top-rated zinc oxide — no chemical UV filters, no parabens, no fragrance. The original clean baby sunscreen. Benchmark.", confidence:"high", category:"baby" }],
  ["badger baby sunscreen",         { floor:1, ceiling:2, substances:[], reason:"USDA Organic non-nano zinc oxide — no chemical UV filters. EWG top rated. Benchmark clean alongside Thinkbaby.", confidence:"high", category:"baby" }],

  // ── BABY FOOD: POUCH CONCERN VS CLEAN FORMATS ────────────────
  ["gerber baby food",              { floor:4, ceiling:6, substances:["plastic pouch","heavy metals","conventional"], reason:"Plastic squeezable pouch at room temp (plasticizer migration) + conventional produce (heavy metals, arsenic in rice-based). Named in 2021 congressional report on heavy metals in baby food.", confidence:"high", category:"baby" }],
  ["gerber puff",                   { floor:4, ceiling:6, substances:["maltodextrin","conventional corn"], reason:"Maltodextrin filler + conventional corn (glyphosate concern) + vegetable oil. Not clean-label. Happy Baby Organic Puffs are the cleaner swap.", confidence:"high", category:"baby" }],
  ["gerber graduate",               { floor:4, ceiling:6, substances:["maltodextrin","conventional corn"], reason:"Gerber Graduates snack line — maltodextrin + conventional corn. Not clean-label.", confidence:"high", category:"baby" }],
  ["beech-nut baby food",           { floor:3, ceiling:5, substances:["plastic pouch","conventional"], reason:"Conventional produce, plastic pouch concern. Less heavy-metal criticism than Gerber in 2021 congressional report. Still conventional pesticide risk.", confidence:"high", category:"baby" }],
  ["beech nut baby",                { floor:3, ceiling:5, substances:["plastic pouch"], reason:"Beech-Nut — conventional sourcing, plastic pouch. Better than Gerber on heavy metals but not organic.", confidence:"medium", category:"baby" }],
  ["happybaby organics",            { floor:2, ceiling:4, substances:["plastic pouch"], reason:"USDA Organic pouches — organic produce lowers pesticide/heavy metal concern vs conventional, but plastic pouch format remains. Better than Gerber.", confidence:"high", category:"baby" }],
  ["happy baby organic",              { floor:2, ceiling:3, substances:[], reason:"USDA Organic, whole grain, no maltodextrin. Benchmark clean baby puff snack. Cleaner alternative to Gerber Puffs.", confidence:"high", category:"baby" }],
  ["plum organics",                 { floor:2, ceiling:4, substances:["plastic pouch"], reason:"USDA Organic, clean ingredients — but plastic pouch at room temp. Upgrade to refrigerated when possible.", confidence:"high", category:"baby" }],
  ["once upon a farm",              { floor:1, ceiling:3, substances:[], reason:"Cold-pressed refrigerated baby food — USDA Organic, HPP processed (no heat), refrigeration eliminates hot-fill plastic migration concern. Best commercial baby food format.", confidence:"high", category:"baby" }],
  ["serenity kids",            { floor:1, ceiling:3, substances:[], reason:"Organic pasture-raised meat pouches — USDA Organic, higher protein, cleaner sourcing than Gerber/Beech-Nut. Better ingredients, same pouch concern.", confidence:"high", category:"baby" }],
  ["little spoon baby",             { floor:1, ceiling:3, substances:[], reason:"Refrigerated cold-processed USDA Organic baby food — no preservatives, no plastic pouch hot-fill concern. Same format advantage as Once Upon a Farm.", confidence:"high", category:"baby" }],
  ["cerebelly",                     { floor:1, ceiling:3, substances:[], reason:"Physician-developed USDA Organic — heavy-metal tested, no added sugars, clean label. Premium clean baby food.", confidence:"high", category:"baby" }],
  ["amara organic baby",            { floor:1, ceiling:3, substances:[], reason:"Freeze-dried USDA Organic — freeze-drying preserves nutrients without heat, no plastic pouch hot-fill concern. Clean format.", confidence:"high", category:"baby" }],

  // ── BABY FORMULA: US CONVENTIONAL ────────────────────────────
  ["similac pro",                   { floor:4, ceiling:6, substances:["corn syrup solids","soy oil","synthetic additives"], reason:"Corn syrup solids as primary carb (not lactose), soy oil, synthetic vitamins. Not organic. Standard US formula concern.", confidence:"high", category:"baby" }],
  ["enfamil neuropro",              { floor:4, ceiling:6, substances:["corn syrup","vegetable oil blend"], reason:"Corn syrup primary carb + vegetable oil blend. Conventional US formula standard.", confidence:"high", category:"baby" }],
  ["gerber good start",             { floor:4, ceiling:6, substances:["corn syrup","whey concentrate"], reason:"Whey protein hydrolysate (easier to digest) but still corn syrup carb + conventional sourcing.", confidence:"high", category:"baby" }],
  ["similac",                       { floor:4, ceiling:6, substances:["corn syrup solids","soy"], reason:"Similac brand — corn syrup solids carb, soy ingredients in some formulas. Conventional US formula.", confidence:"medium", category:"baby" }],
  ["enfamil",                       { floor:4, ceiling:6, substances:["corn syrup","vegetable oils"], reason:"Enfamil brand — corn syrup carb + vegetable oils. Conventional US formula.", confidence:"medium", category:"baby" }],

  // ── BABY FORMULA: EUROPEAN / CLEAN ───────────────────────────
  ["hipp formula",                  { floor:1, ceiling:3, substances:[], reason:"EU Organic certified German formula — lactose carb (not corn syrup), no synthetic pesticides. Benchmark clean European formula.", confidence:"high", category:"baby" }],
  ["holle",                 { floor:1, ceiling:2, substances:[], reason:"Biodynamic Demeter certified — highest organic standard, lactose carb, minimal additives. Benchmark cleanest formula available.", confidence:"high", category:"baby" }],
  ["lebenswert formula",            { floor:1, ceiling:2, substances:[], reason:"Bioland organic German formula — lactose carb, no corn syrup, EU organic. One of the cleanest formulas alongside Holle.", confidence:"high", category:"baby" }],
  ["bobbie",                { floor:1, ceiling:3, substances:[], reason:"USDA Organic, lactose carb (not corn syrup), designed to meet EU standards. First clean US-made formula alternative.", confidence:"high", category:"baby" }],
  ["kendamil formula",              { floor:1, ceiling:3, substances:[], reason:"UK whole milk formula — lactose + whole milk fat (not vegetable oils), no palm oil, RSPCA welfare certified. Benchmark clean.", confidence:"high", category:"baby" }],

  // ── BABY BOTTLES ─────────────────────────────────────────────
  ["pura kiki",                     { floor:1, ceiling:2, substances:[], reason:"Stainless steel + silicone baby bottle — no plastic contacts milk, no BPA, no BPS, no phthalates. Benchmark cleanest bottle.", confidence:"high", category:"baby" }],
  ["klean kanteen kids",            { floor:1, ceiling:2, substances:[], reason:"Stainless steel kids bottle — no plastic contact, no BPA, no BPS. Benchmark clean alongside Pura Kiki.", confidence:"high", category:"baby" }],
  ["comotomo",                      { floor:2, ceiling:3, substances:["silicone"], reason:"100% silicone body — no BPA, no BPS, no phthalates. Silicone is food-safe and stable. Better than polypropylene plastic bottles.", confidence:"high", category:"baby" }],
  ["dr brown's bottle",             { floor:2, ceiling:4, substances:["BPA-free polypropylene"], reason:"BPA-free PP, vent system has 5+ plastic parts that contact milk. More plastic surface area than single-piece designs.", confidence:"medium", category:"baby" }],
  ["dr brown bottle",               { floor:2, ceiling:4, substances:["BPA-free polypropylene"], reason:"BPA-free polypropylene with multi-part vent system. Clean but more plastic contact than silicone/stainless.", confidence:"medium", category:"baby" }],
  ["tommee tippee",                 { floor:2, ceiling:4, substances:["BPA-free plastic"], reason:"BPA-free PPSU or PP plastic. PPSU is more heat-stable than PP. Clean for plastic but stainless/silicone are cleaner.", confidence:"medium", category:"baby" }],
  ["philips avent",                 { floor:2, ceiling:4, substances:["BPA-free polypropylene"], reason:"BPA-free PP plastic. Standard modern baby bottle. No BPA but petroleum-derived polymer. Upgrade to stainless or silicone for cleanest option.", confidence:"medium", category:"baby" }],

  // ── TEETHERS AND PACIFIERS ────────────────────────────────────
  ["bibs pacifier",        { floor:1, ceiling:2, substances:[], reason:"BiBs natural rubber pacifier — 100% natural rubber latex, no BPA, no PVC, no phthalates, no synthetic materials. Danish brand. One-piece shield. Same clean material profile as Hevea and Natursutten. Natural latex here is the plant-derived material, not a chemical concern. Benchmark clean pacifier.", confidence:"high", category:"baby" }],
  ["bibs",                 { floor:1, ceiling:2, substances:[], reason:"BiBs baby products — natural rubber pacifiers are benchmark clean (100% natural latex, no synthetic materials, no BPA, no PVC). Latex flagged in diapers is a chemical treatment concern; in a natural rubber pacifier it IS the product. Score 1-2.", confidence:"high", category:"baby" }],
  ["sophie",            { floor:1, ceiling:2, substances:[], reason:"100% natural rubber + food-grade paint — no PVC, no BPA, no phthalates. Benchmark clean teether.", confidence:"high", category:"baby" }],
  ["hevea",                { floor:1, ceiling:2, substances:[], reason:"100% natural rubber pacifier — no synthetic rubber, no BPA, no petroleum polymers. Cleanest pacifier material.", confidence:"high", category:"baby" }],
  ["natursutten",          { floor:1, ceiling:2, substances:[], reason:"100% natural rubber, one-piece construction — no synthetic materials, no joints for bacteria. Benchmark clean pacifier.", confidence:"high", category:"baby" }],
  ["nuby teether",                  { floor:2, ceiling:4, substances:["TPE","silicone"], reason:"Various materials — silicone versions score 1-2, TPE/plastic versions score 3-4. BPA-free but TPE is synthetic.", confidence:"medium", category:"baby" }],
  ["nuk pacifier",                  { floor:2, ceiling:4, substances:["BPA-free silicone","latex"], reason:"Silicone versions BPA-free (clean). Latex versions natural rubber (clean). Check material before purchasing.", confidence:"medium", category:"baby" }],

  // ══════════════════════════════════════════════════════════════
  // AUDIT 26 — GYM AND SPORTS NUTRITION
  // ══════════════════════════════════════════════════════════════

  // ── PROTEIN POWDERS: CONCERN TIER ────────────────────────────
  ["optimum nutrition serious mass", { floor:4, ceiling:6, substances:["sucralose","maltodextrin","artificial flavor"], reason:"Sucralose + maltodextrin base + artificial flavors — mass-gainer additives on top of sucralose floor.", confidence:"high", category:"supplement" }],
  ["bsn syntha-6",                  { floor:5, ceiling:7, substances:["sucralose","acesulfame potassium","artificial flavor"], reason:"Sucralose + acesulfame-K (ace-K, IARC 2B) + artificial flavors — two artificial sweeteners. One of the more additive-heavy mainstream protein powders.", confidence:"high", category:"supplement" }],
  ["musclemilk",                   { floor:5, ceiling:7, substances:["sucralose","carrageenan"], reason:"Sucralose + carrageenan — two substance floors fire. Not clean despite protein content.", confidence:"high", category:"supplement" }],
  ["muscle milk",                   { floor:5, ceiling:7, substances:["sucralose","carrageenan"], reason:"Sucralose + carrageenan — two substance floors fire. Not clean despite protein content.", confidence:"high", category:"supplement" }],
  ["1st phorm",                     { floor:4, ceiling:6, substances:["sucralose","artificial flavor"], reason:"1st Phorm — sucralose across most protein and pre-workout products + artificial flavors. Conventional formula.", confidence:"high", category:"supplement" }],
  ["ghost whey",                    { floor:5, ceiling:7, substances:["sucralose","artificial color","acesulfame potassium"], reason:"Ghost Whey — sucralose + artificial colors + ace-K. Heavily flavored, not clean.", confidence:"high", category:"supplement" }],
  ["ryse",                  { floor:4, ceiling:6, substances:["sucralose","artificial flavor"], reason:"Sucralose + artificial flavors — conventional protein powder with synthetic sweeteners.", confidence:"high", category:"supplement" }],
  ["rule one protein",              { floor:4, ceiling:6, substances:["sucralose","acesulfame potassium"], reason:"Rule One R1 — sucralose + ace-K double artificial sweetener stack.", confidence:"high", category:"supplement" }],
  ["dymatize super mass",           { floor:5, ceiling:7, substances:["sucralose","artificial flavor","maltodextrin"], reason:"Mass gainer — sucralose + artificial flavors + large maltodextrin base.", confidence:"high", category:"supplement" }],
  ["bsn true mass",                 { floor:5, ceiling:7, substances:["sucralose","artificial flavor","maltodextrin"], reason:"BSN True Mass — sucralose + artificial flavors + maltodextrin. Same concern as Dymatize mass gainer.", confidence:"high", category:"supplement" }],

  // ── PROTEIN POWDERS: CLEAN TIER ──────────────────────────────
  ["naked pea",                     { floor:1, ceiling:2, substances:[], reason:"Pea protein isolate — one ingredient, no sweeteners, no artificial flavors. Benchmark clean plant protein.", confidence:"high", category:"supplement" }],
  ["promix",                        { floor:1, ceiling:3, substances:[], reason:"Grass-fed whey or egg white protein — no sucralose, no artificial flavors. Transparent sourcing. Benchmark clean protein brand.", confidence:"high", category:"supplement" }],
  ["equip foods",                   { floor:1, ceiling:3, substances:[], reason:"Beef protein isolate from grass-fed cattle — no sucralose, no artificial dyes. Clean animal protein alternative to whey.", confidence:"high", category:"supplement" }],
  ["legion whey",                   { floor:1, ceiling:3, substances:[], reason:"Legion Athletics whey — stevia only (no sucralose), transparent label, Labdoor top rated. Benchmark clean protein.", confidence:"high", category:"supplement" }],
  ["legion protein",                { floor:1, ceiling:3, substances:[], reason:"Legion Athletics protein — no artificial sweeteners beyond stevia, no artificial colors, third-party tested.", confidence:"high", category:"supplement" }],
  ["true nutrition",                { floor:2, ceiling:4, substances:[], reason:"True Nutrition custom protein — customizable formula. Clean if no sucralose selected. Verify your specific build.", confidence:"medium", category:"supplement" }],

  // ── PRE-WORKOUT: CRITICAL ─────────────────────────────────────
  ["jack3d",                        { floor:8, ceiling:10, substances:["DMAA","dimethylamylamine"], reason:"CRITICAL: DMAA (dimethylamylamine) is an FDA-banned stimulant linked to heart attacks, hemorrhagic stroke, and deaths. FDA seized Jack3d products. Do not use. Not a regulatory gray area.", confidence:"high", category:"supplement" }],
  ["mr hyde",                   { floor:5, ceiling:7, substances:["sucralose","niacin megadose","yohimbe"], reason:"Mr Hyde — sucralose + yohimbe (anxiety, tachycardia) + niacin megadose. Aggressive stimulant stack.", confidence:"high", category:"supplement" }],
  ["bucked up",                     { floor:4, ceiling:6, substances:["acesulfame potassium","artificial color"], reason:"Bucked Up — ace-K sweetener + artificial colors in some flavors. No sucralose but synthetic sweetener + dye concern.", confidence:"high", category:"supplement" }],
  ["c4 original",                   { floor:5, ceiling:7, substances:["sucralose","acesulfame potassium"], reason:"C4 Original — sucralose + ace-K. Most popular pre-workout, not a clean product.", confidence:"high", category:"supplement" }],
  ["c4 sport",                      { floor:5, ceiling:7, substances:["sucralose","acesulfame potassium"], reason:"C4 Sport — sucralose + ace-K. NSF certified but still synthetic sweeteners.", confidence:"high", category:"supplement" }],
  ["c4",                            { floor:5, ceiling:7, substances:["sucralose","acesulfame potassium"], reason:"C4 brand — sucralose + ace-K across the line. Sucralose floor fires.", confidence:"medium", category:"supplement" }],
  ["gorilla mode",                  { floor:4, ceiling:6, substances:["sucralose","artificial flavor"], reason:"Gorilla Mode — sucralose in most flavors + artificial flavors. High dose formula but not clean-label.", confidence:"high", category:"supplement" }],

  // ── PRE-WORKOUT: CLEAN TIER ───────────────────────────────────
  ["transparent labs bulk",         { floor:1, ceiling:3, substances:[], reason:"Transparent Labs BULK — stevia only (no sucralose), no artificial colors, fully disclosed dosing. Benchmark clean pre-workout.", confidence:"high", category:"supplement" }],
  ["transparent labs lean",         { floor:1, ceiling:3, substances:[], reason:"Transparent Labs Lean — same clean standard as BULK, stevia only, no artificial colors.", confidence:"high", category:"supplement" }],
  ["transparent labs",              { floor:1, ceiling:3, substances:[], reason:"Transparent Labs brand — stevia sweetened, no artificial colors, fully disclosed labels. Benchmark clean sports nutrition brand.", confidence:"high", category:"supplement" }],
  ["legion pulse",                  { floor:1, ceiling:3, substances:[], reason:"Legion Pulse pre-workout — no artificial sweeteners, no artificial colors, clinically dosed. Benchmark clean pre-workout.", confidence:"high", category:"supplement" }],
  ["kaged",                         { floor:2, ceiling:4, substances:[], reason:"Kaged Muscle — NSF Certified for Sport, stevia sweetened, no artificial colors. Clean certified pre-workout brand.", confidence:"high", category:"supplement" }],
  ["pre-lab pro",                   { floor:1, ceiling:3, substances:[], reason:"Pre Lab Pro — clean label, NutriGenesis vitamins, no sucralose, no artificial colors. Premium clean pre-workout.", confidence:"high", category:"supplement" }],
  ["naked energy",                  { floor:1, ceiling:2, substances:[], reason:"Naked Energy — caffeine + creatine + beta-alanine + vitamins, zero sweeteners, zero artificial flavors. Benchmark minimalist clean pre-workout.", confidence:"high", category:"supplement" }],

  // ── CREATINE — ALL PURE = CLEAN ──────────────────────────────
  ["creatine monohydrate",          { floor:1, ceiling:2, substances:[], reason:"Pure creatine monohydrate — one ingredient, extensively researched, no additives. Safest performance supplement available regardless of brand.", confidence:"high", category:"supplement" }],
  ["bulk supplements creatine",     { floor:1, ceiling:2, substances:[], reason:"Pure creatine monohydrate — no additives, no sweeteners. Clean benchmark.", confidence:"high", category:"supplement" }],
  ["muscletech creatine",           { floor:1, ceiling:2, substances:[], reason:"MuscleTech Platinum Creatine — pure creatine monohydrate, no sucralose in plain version. Clean one-ingredient supplement.", confidence:"high", category:"supplement" }],
  ["klean athlete",                 { floor:1, ceiling:2, substances:[], reason:"Klean Athlete — NSF Certified for Sport, no artificial additives. Benchmark clean sports supplement brand.", confidence:"high", category:"supplement" }],
  ["momentous",                     { floor:1, ceiling:3, substances:[], reason:"Momentous brand — NSF Certified for Sport + Informed Sport across entire line, no artificial sweeteners or dyes. Benchmark clean sports brand.", confidence:"high", category:"supplement" }],

  // ── BCAA / EAA ───────────────────────────────────────────────
  ["scivation xtend",               { floor:5, ceiling:7, substances:["sucralose","acesulfame potassium","artificial color"], reason:"Xtend BCAAs — sucralose + ace-K + artificial colors. Multiple floors may fire depending on flavor.", confidence:"high", category:"supplement" }],
  ["musclepharm bcaa",              { floor:4, ceiling:6, substances:["sucralose","artificial flavor"], reason:"MusclePharm BCAAs — sucralose + artificial flavors.", confidence:"high", category:"supplement" }],
  ["optimum nutrition amino energy", { floor:5, ceiling:7, substances:["sucralose","artificial color","acesulfame potassium"], reason:"ON Amino Energy — sucralose + ace-K + artificial colors. Multiple floors fire.", confidence:"high", category:"supplement" }],
  ["transparent labs bcaa",         { floor:1, ceiling:3, substances:[], reason:"Transparent Labs BCAA Glutamine — stevia, no artificial colors. Same clean standard as rest of TL line.", confidence:"high", category:"supplement" }],
  ["naked bcaa",                    { floor:1, ceiling:2, substances:[], reason:"Naked BCAAs — pure branched-chain amino acids, no sweeteners, no artificial flavors. Benchmark clean BCAA.", confidence:"high", category:"supplement" }],

  // ── ELECTROLYTES ─────────────────────────────────────────────
  ["nuun",                          { floor:2, ceiling:4, substances:["stevia","sorbitol"], reason:"Nuun electrolyte tablets — stevia sweetened (no sucralose), but sorbitol may cause GI distress at high use. Cleaner than Gatorade.", confidence:"high", category:"supplement" }],
  ["dripdrop",                      { floor:2, ceiling:4, substances:[], reason:"DripDrop ORS — glucose-based medically developed electrolyte formula, no sucralose. Cleaner than Pedialyte Sport.", confidence:"high", category:"supplement" }],
  ["gatorade endurance",            { floor:4, ceiling:6, kidsFloor:7, kidsCeiling:9, substances:["citric acid","artificial flavor"], reason:"Gatorade Endurance — no sucralose unlike Gatorade Zero, but still artificial flavors + potential dye. Not clean but better than Gatorade Zero.", confidence:"high", category:"supplement" }],
  ["precision hydration",           { floor:1, ceiling:3, substances:[], reason:"Precision Hydration — electrolytes + sucrose, no artificial sweeteners or colors. Used by elite athletes. Clean electrolyte brand.", confidence:"high", category:"supplement" }],
  ["skratch labs",                  { floor:1, ceiling:3, substances:[], reason:"Skratch Labs — real fruit + cane sugar + electrolytes, no artificial sweeteners or colors. Benchmark clean sports drink mix.", confidence:"high", category:"supplement" }],
  ["tailwind",                      { floor:1, ceiling:3, substances:[], reason:"Tailwind Nutrition — sucrose + glucose + electrolytes, no artificial sweeteners or dyes. Clean endurance fuel.", confidence:"high", category:"supplement" }],

  // ── PROTEIN BARS: CONCERN TIER ───────────────────────────────
  ["power bar",                     { floor:5, ceiling:7, substances:["HFCS","soy protein isolate","artificial flavor"], reason:"PowerBar — HFCS + hexane-extracted soy protein isolate + artificial flavors. Original processed sports bar, not clean.", confidence:"high", category:"food_beverage" }],
  ["barebells",                     { floor:5, ceiling:7, substances:["sucralose","acesulfame potassium","artificial flavor"], reason:"Barebells — sucralose + ace-K + artificial flavors. Popular but two artificial sweeteners make it not clean.", confidence:"high", category:"food_beverage" }],
  ["legendary foods",               { floor:5, ceiling:7, substances:["sucralose","acesulfame potassium"], reason:"Legendary Foods — sucralose + ace-K across the line. Double artificial sweetener stack.", confidence:"high", category:"food_beverage" }],

  // ── PROTEIN BARS: CLEAN TIER ─────────────────────────────────
  ["kind protein",                  { floor:2, ceiling:4, substances:[], reason:"Kind Protein bars — nuts + honey + plant protein, no sucralose, no artificial dyes. Cleaner than Quest/ONE.", confidence:"high", category:"food_beverage" }],
  ["no cow",                        { floor:3, ceiling:5, substances:["erythritol","stevia"], reason:"No Cow Bar — erythritol + stevia, no sucralose, plant-based. Cleaner than Quest/ONE but sugar alcohol GI concern at high use.", confidence:"high", category:"food_beverage" }],
  ["aloha",                 { floor:1, ceiling:3, substances:[], reason:"ALOHA protein bar — USDA Organic, no sucralose, no artificial colors, plant-based. One of the cleanest mainstream protein bars.", confidence:"high", category:"food_beverage" }],

  // ── FAT BURNERS ───────────────────────────────────────────────
  ["hydroxycut",                    { floor:6, ceiling:8, substances:["yohimbe","caffeine","synthetic stimulants"], reason:"Hydroxycut — aggressive stimulant stack including yohimbe (cardiovascular risk, anxiety). FDA issued multiple warnings and recalls for earlier Hydroxycut formulas. Serious concern.", confidence:"high", category:"supplement" }],
  ["cellucor superhd",              { floor:5, ceiling:7, substances:["yohimbe","caffeine"], reason:"Cellucor SuperHD — yohimbe (tachycardia, anxiety) + caffeine stimulant stack. Moderate-high concern.", confidence:"high", category:"supplement" }],
  ["animal cuts",                   { floor:6, ceiling:8, substances:["yohimbe","caffeine","diuretics","thyroid complex"], reason:"Animal Cuts — complex stimulant and diuretic stack including yohimbe + thyroid support complex. Not for general consumer use.", confidence:"high", category:"supplement" }],
  ["leanbean",                      { floor:3, ceiling:5, substances:["glucomannan","green coffee"], reason:"Leanbean — glucomannan + green coffee extract + B-vitamins. Milder than Hydroxycut. No yohimbe but still a stimulant supplement.", confidence:"medium", category:"supplement" }],
  ["burn lab pro",                  { floor:2, ceiling:4, substances:[], reason:"Burn Lab Pro — HMB + forslean + cayenne, no synthetic stimulants, no yohimbe, no caffeine. Cleanest fat burner option.", confidence:"high", category:"supplement" }],

  // ── MASS GAINERS ─────────────────────────────────────────────
  ["transparent labs mass",         { floor:2, ceiling:4, substances:[], reason:"Transparent Labs Mass Gainer — no sucralose, no artificial colors, clean carb sources. Benchmark clean mass gainer.", confidence:"high", category:"supplement" }],
  ["optimum nutrition pro gainer",  { floor:4, ceiling:6, substances:["sucralose","artificial flavor","maltodextrin"], reason:"ON Pro Gainer — sucralose + artificial flavors + maltodextrin. Conventional mass gainer concern.", confidence:"high", category:"supplement" }],

  // ══════════════════════════════════════════════════════════════
  // AUDIT 27 — PET FOOD: DOGS AND CATS
  // ══════════════════════════════════════════════════════════════

  // ── DRY DOG FOOD: BUDGET / HIGH CONCERN ──────────────────────
  ["purina dog chow",               { floor:5, ceiling:7, substances:["corn","BHA","artificial color","soybean"], reason:"Purina Dog Chow — corn as first ingredient + BHA preservative (IARC 2B) + artificial colors + soybean meal. Entry-level Purina, lowest quality in the line.", confidence:"high", category:"food_beverage" }],
  ["pedigree",             { floor:5, ceiling:7, substances:["corn","artificial color","BHA","meat by-products"], reason:"Pedigree — corn-first + meat by-products + artificial colors + BHA preservative. One of the lowest-tier mainstream dry dog foods.", confidence:"high", category:"food_beverage" }],
  ["alpo dog food",                 { floor:5, ceiling:7, substances:["corn","artificial color","meat by-products"], reason:"Alpo — corn + meat by-products + artificial colors. Budget wet and dry food with minimal nutritional transparency.", confidence:"high", category:"food_beverage" }],
  ["cesar dog food",                { floor:5, ceiling:7, substances:["meat by-products","artificial color","carrageenan"], reason:"Cesar wet dog food — meat by-products + artificial colors + carrageenan. Small tray format but low-quality ingredients.", confidence:"high", category:"food_beverage" }],

  // ── DRY DOG FOOD: MID-TIER ───────────────────────────────────
  ["iams dog food",                 { floor:4, ceiling:6, substances:["corn","beet pulp","soybean"], reason:"Iams — corn + soybean meal + beet pulp. Real chicken is first ingredient but corn-heavy formula. Better than Pedigree but not a clean-label product.", confidence:"high", category:"food_beverage" }],
  ["eukanuba dog food",             { floor:4, ceiling:6, substances:["corn","BHA","artificial color"], reason:"Eukanuba — corn-heavy + BHA preservative in some formulas + artificial caramel color. Veterinary marketed but not a clean formula.", confidence:"high", category:"food_beverage" }],
  ["science diet dog",              { floor:4, ceiling:6, substances:["corn","caramel color","by-products"], reason:"Hill's Science Diet — corn gluten meal + by-products + caramel color IV in wet varieties. Heavily veterinary marketed but ingredient quality doesn't match the price or positioning.", confidence:"high", category:"food_beverage" }],
  ["royal canin dog",               { floor:4, ceiling:6, substances:["corn","artificial preservatives","by-products"], reason:"Royal Canin — breed-specific marketing, but corn-heavy + by-products + artificial preservatives in many formulas. Vet channel brand with middling ingredient quality.", confidence:"high", category:"food_beverage" }],
  ["purina one dog",                { floor:3, ceiling:5, substances:["corn","soybean meal"], reason:"Purina ONE SmartBlend — real meat first ingredient, but still corn + soybean meal. A step up from Dog Chow but still conventional filler-heavy formula.", confidence:"high", category:"food_beverage" }],
  ["purina pro plan",               { floor:3, ceiling:5, substances:["corn","artificial flavor"], reason:"Purina Pro Plan — real meat first, better than Dog Chow or ONE, but still corn + artificial flavor in most formulas. Popular with breeders and vets.", confidence:"high", category:"food_beverage" }],
  ["natural balance dog",           { floor:3, ceiling:5, substances:["pea protein","limited ingredient"], reason:"Natural Balance — limited ingredient diets, no artificial preservatives or colors. Better than Purina mainstream but pea protein heavy (DCM concern in grain-free).", confidence:"medium", category:"food_beverage" }],
  ["diamond naturals",              { floor:3, ceiling:5, substances:["whole grain","probiotics"], reason:"Diamond Naturals — no artificial preservatives, real meat first in most formulas. Affordable step above budget brands.", confidence:"high", category:"food_beverage" }],
  ["victor dog food",               { floor:3, ceiling:5, substances:["grain","corn","sorghum"], reason:"Victor — made in USA, no artificial preservatives, gluten-free grain options. Solid mid-tier working dog food.", confidence:"high", category:"food_beverage" }],

  // ── DRY DOG FOOD: PREMIUM TIER ───────────────────────────────
  ["purina beyond",                 { floor:2, ceiling:4, substances:[], reason:"Purina Beyond — no artificial colors, flavors, or preservatives. The cleanest Purina line. Real meat first, simpler ingredient list than Pro Plan.", confidence:"high", category:"food_beverage" }],
  ["blue buffalo life",             { floor:3, ceiling:5, substances:["pea protein","LifeSource Bits"], reason:"Blue Buffalo Life Protection — no by-products, no artificial preservatives. LifeSource Bits are a vitamin blend. Better than Purina mainstream but pea protein concern + prior lawsuit about ingredient accuracy.", confidence:"medium", category:"food_beverage" }],
  ["blue buffalo wilderness",       { floor:2, ceiling:4, substances:["pea protein"], reason:"Blue Buffalo Wilderness — grain-free, higher protein than Life Protection. No artificial preservatives. Pea protein content is the main concern (DCM investigation).", confidence:"medium", category:"food_beverage" }],
  ["blue buffalo",                  { floor:3, ceiling:5, substances:["pea protein"], reason:"Blue Buffalo brand — no artificial preservatives or colors across the line, but pea protein-heavy in grain-free formulas. Better than Purina mainstream, not as clean as Orijen.", confidence:"medium", category:"food_beverage" }],
  ["taste of the wild",             { floor:2, ceiling:4, substances:[], reason:"Taste of the Wild — grain-free or ancient grain, real meat first, no artificial preservatives or colors. Affordable premium clean tier.", confidence:"high", category:"food_beverage" }],
  ["merrick",              { floor:2, ceiling:4, substances:[], reason:"Merrick — deboned meat first, no artificial preservatives or colors, made in USA. Solid clean premium brand.", confidence:"high", category:"food_beverage" }],
  ["canidae dog food",              { floor:2, ceiling:4, substances:[], reason:"Canidae — limited ingredient options, no artificial preservatives, made in USA. Clean premium tier.", confidence:"high", category:"food_beverage" }],
  ["wellness core dog",             { floor:2, ceiling:3, substances:[], reason:"Wellness CORE — high protein, no artificial preservatives or colors, no corn or soy. Upper clean tier.", confidence:"high", category:"food_beverage" }],
  ["jinx dog food",                 { floor:2, ceiling:4, substances:[], reason:"Jinx — no corn, no soy, no artificial colors or preservatives. DTC clean-label dog food brand.", confidence:"high", category:"food_beverage" }],
  ["fromm",                { floor:1, ceiling:3, substances:[], reason:"Fromm — family-owned, small batch, no artificial preservatives or colors. One of the most trusted independent premium brands.", confidence:"high", category:"food_beverage" }],

  // ── DRY DOG FOOD: ULTRA PREMIUM ──────────────────────────────
  ["orijen",               { floor:1, ceiling:3, substances:[], reason:"Orijen — biologically appropriate, 85% meat ingredients including fresh and raw, no artificial additives, no plant protein padding. Benchmark clean premium dry dog food.", confidence:"high", category:"food_beverage" }],
  ["acana",                { floor:1, ceiling:3, substances:[], reason:"Acana — same company as Orijen, similar high-meat philosophy, no artificial additives. Slightly more affordable than Orijen, same clean benchmark.", confidence:"high", category:"food_beverage" }],
  ["instinct raw dog",              { floor:1, ceiling:2, substances:[], reason:"Instinct Raw — freeze-dried raw or raw coated kibble, minimal processing, no artificial additives. Closest to raw feeding in a bag.", confidence:"high", category:"food_beverage" }],

  // ── FRESH / HUMAN-GRADE DOG FOOD ─────────────────────────────
  ["the farmer's dog",              { floor:1, ceiling:2, substances:[], reason:"The Farmer's Dog — USDA human-grade fresh cooked, FDA registered facility, no artificial additives, subscription delivery. Benchmark cleanest commercial dog food format.", confidence:"high", category:"food_beverage" }],
  ["farmers dog",                   { floor:1, ceiling:2, substances:[], reason:"The Farmer's Dog — human-grade fresh cooked, USDA regulated. Benchmark clean.", confidence:"high", category:"food_beverage" }],
  ["ollie",                { floor:1, ceiling:2, substances:[], reason:"Ollie — human-grade fresh cooked, USDA inspected, no artificial additives. Same format advantage as Farmer's Dog.", confidence:"high", category:"food_beverage" }],
  ["nom nom dog",                   { floor:1, ceiling:2, substances:[], reason:"Nom Nom — human-grade fresh cooked, veterinary-developed, no artificial additives. Clean fresh dog food.", confidence:"high", category:"food_beverage" }],
  ["spot and tango",                { floor:1, ceiling:2, substances:[], reason:"Spot and Tango — human-grade fresh cooked, USDA inspected, no artificial additives. Clean fresh tier.", confidence:"high", category:"food_beverage" }],

  // ── CAT FOOD: HIGH CONCERN ────────────────────────────────────
  ["purina friskies",               { floor:5, ceiling:7, substances:["artificial color","corn","meat by-products"], reason:"Purina Friskies — artificial colors (including Red 40 in some varieties) + corn + meat by-products. Budget cat food with multiple concern ingredients.", confidence:"high", category:"food_beverage" }],
  ["meow mix",                      { floor:5, ceiling:7, substances:["corn","artificial color","meat by-products","BHA"], reason:"Meow Mix — corn-first + artificial colors + meat by-products + BHA preservative. One of the lowest quality mainstream cat foods.", confidence:"high", category:"food_beverage" }],
  ["iams cat food",                 { floor:4, ceiling:6, substances:["corn","by-products"], reason:"Iams Cat — corn + by-products. Better than Friskies/Meow Mix but still conventional filler-heavy formula.", confidence:"high", category:"food_beverage" }],
  ["science diet cat",              { floor:4, ceiling:6, substances:["corn","caramel color","by-products"], reason:"Hill's Science Diet Cat — corn + by-products + caramel color. Vet recommended but not a clean-ingredient product.", confidence:"high", category:"food_beverage" }],
  ["royal canin cat",               { floor:4, ceiling:6, substances:["corn","artificial preservatives","by-products"], reason:"Royal Canin Cat — corn + by-products + artificial preservatives. Breed-specific marketing doesn't change the ingredient quality.", confidence:"high", category:"food_beverage" }],

  // ── CAT FOOD: MID / PREMIUM ───────────────────────────────────
  ["blue buffalo cat",              { floor:3, ceiling:5, substances:["pea protein"], reason:"Blue Buffalo Cat — no artificial preservatives or colors, but pea protein heavy in some formulas. Better than Friskies/Meow Mix.", confidence:"high", category:"food_beverage" }],
  ["wellnesse toothpaste",            { floor:1, ceiling:2, substances:[], reason:"Wellnesse Whitening Toothpaste — hydroxyapatite, xylitol, neem oil, green tea extract. No SLS, no fluoride, no artificial dyes, no parabens. B Corp + Non-Toxic Project certified. Benchmark clean toothpaste.", confidence:"high", category:"personal_care" }],
  ["wellnesse whitening",             { floor:1, ceiling:2, substances:[], reason:"Wellnesse Whitening — B Corp, Non-Toxic Project certified, hydroxyapatite based. Benchmark clean.", confidence:"high", category:"personal_care" }],
  ["wellnesse",                       { floor:1, ceiling:3, substances:[], reason:"Wellnesse brand — B Corp certified, Non-Toxic Project certified, clean ingredients across all product lines.", confidence:"high", category:"personal_care" }],
  ["wellness",                        { floor:2, ceiling:3, substances:[], reason:"Wellness brand — no by-products, no artificial preservatives or colors across the line. Clean premium pet food brand.", confidence:"high", category:"food_beverage" }],
  ["wellness cat food",             { floor:2, ceiling:3, substances:[], reason:"Wellness Cat — no by-products, no artificial preservatives or colors, high protein. Clean premium cat food.", confidence:"high", category:"food_beverage" }],
  ["orijen cat food",               { floor:1, ceiling:3, substances:[], reason:"Orijen Cat — 85% meat ingredients, biologically appropriate, no artificial additives. Benchmark clean premium cat food.", confidence:"high", category:"food_beverage" }],
  ["tiki cat",                      { floor:1, ceiling:3, substances:[], reason:"Tiki Cat — real named fish, no carrageenan in most formulas, no artificial additives, low carb. Benchmark clean canned cat food.", confidence:"high", category:"food_beverage" }],
  ["weruva",               { floor:1, ceiling:3, substances:[], reason:"Weruva — human-grade ingredients, no artificial preservatives or colors, no carrageenan. Premium clean canned cat food.", confidence:"high", category:"food_beverage" }],
  ["smalls",               { floor:1, ceiling:2, substances:[], reason:"Smalls — human-grade fresh cooked cat food, USDA inspected, no artificial additives. Benchmark cleanest cat food format.", confidence:"high", category:"food_beverage" }],
  ["instinct raw cat",              { floor:1, ceiling:2, substances:[], reason:"Instinct Raw Cat — freeze-dried raw, minimal processing, no artificial additives. Clean raw format.", confidence:"high", category:"food_beverage" }],
  ["stella and chewy's cat",        { floor:1, ceiling:3, substances:[], reason:"Stella and Chewy's Cat — freeze-dried raw, single protein options, no artificial additives. Upper clean tier.", confidence:"high", category:"food_beverage" }],
  ["stella chewys",                 { floor:1, ceiling:3, substances:[], reason:"Stella and Chewy's — freeze-dried raw dog and cat food, no artificial additives. Clean raw format benchmark.", confidence:"high", category:"food_beverage" }],

  // ── DOG TREATS ────────────────────────────────────────────────
  ["milk-bone",                     { floor:5, ceiling:6, substances:["BHA","wheat flour","artificial flavor"], reason:"Milk-Bone — BHA preservative (IARC 2B) + wheat flour + artificial flavor. One of the most widely fed treats, but BHA floor fires.", confidence:"high", category:"food_beverage" }],
  ["milk bone",                     { floor:5, ceiling:6, substances:["BHA","wheat flour","artificial flavor"], reason:"Milk-Bone — BHA preservative + wheat flour + artificial flavor. BHA floor fires.", confidence:"high", category:"food_beverage" }],
  ["beggin strips",                 { floor:5, ceiling:7, substances:["artificial color","meat by-products","artificial smoke flavor"], reason:"Beggin Strips — artificial colors (Red 40 may fire) + meat by-products + artificial smoke flavor. Popular but one of the lowest quality dog treats.", confidence:"high", category:"food_beverage" }],
  ["pup-peroni",                    { floor:5, ceiling:7, substances:["artificial color","meat by-products","BHA"], reason:"Pup-Peroni — artificial colors + meat by-products + BHA. Budget treat with multiple concern ingredients.", confidence:"high", category:"food_beverage" }],
  ["zuke's",                        { floor:2, ceiling:3, substances:[], reason:"Zuke's Mini Naturals — small, low calorie, no artificial colors or preservatives. Clean training treat benchmark.", confidence:"high", category:"food_beverage" }],
  ["zukes",                         { floor:2, ceiling:3, substances:[], reason:"Zuke's — clean natural dog treats, no artificial additives. Good training treat.", confidence:"high", category:"food_beverage" }],
  ["stella and chewy",    { floor:1, ceiling:2, substances:[], reason:"Stella and Chewy's freeze-dried raw treats — single ingredient options, no artificial additives. Benchmark clean treat.", confidence:"high", category:"food_beverage" }],
  ["whole life",                { floor:1, ceiling:2, substances:[], reason:"Whole Life Pet — single ingredient freeze-dried treats. One ingredient = benchmark clean.", confidence:"high", category:"food_beverage" }],

  // ── PET SUPPLEMENTS ──────────────────────────────────────────
  ["cosequin",                      { floor:1, ceiling:3, substances:[], reason:"Cosequin — glucosamine + chondroitin, the most studied joint supplement for dogs. No artificial additives in standard formula. Nutramax manufactured, high quality control.", confidence:"high", category:"supplement" }],
  ["dasuquin",                      { floor:1, ceiling:3, substances:[], reason:"Nutramax Dasuquin — glucosamine + chondroitin + ASU (avocado/soybean unsaponifiables). Nutramax clinical grade joint supplement. Clean.", confidence:"high", category:"supplement" }],
  ["nordic naturals omega pet",     { floor:1, ceiling:2, substances:[], reason:"Nordic Naturals Omega-3 Pet — same IFOS-tested quality as human line, no artificial additives. Benchmark clean pet fish oil.", confidence:"high", category:"supplement" }],
  ["four leaf rover",               { floor:1, ceiling:2, substances:[], reason:"Four Leaf Rover — whole food pet supplements, no synthetic additives. Premium clean pet supplement brand.", confidence:"high", category:"supplement" }],
  ["zesty paws",                    { floor:2, ceiling:4, substances:["artificial flavor","inactive fillers"], reason:"Zesty Paws — popular pet supplements but artificial flavors + fillers in many products. Not as clean as Nordic Naturals or Four Leaf Rover.", confidence:"medium", category:"supplement" }],

  // ══════════════════════════════════════════════════════════════
  // AUDIT 28A — CLEANING PRODUCTS
  // ══════════════════════════════════════════════════════════════

  // ── LAUNDRY: CONVENTIONAL CONCERN ────────────────────────────
  ["gain",                { floor:5, ceiling:7, substances:["synthetic fragrance","optical brighteners","quats"], reason:"Gain — heavy synthetic fragrance load (undisclosed cocktail) + optical brighteners + quaternary ammonium compounds. One of the highest-fragrance mainstream detergents.", confidence:"high", category:"home" }],
  ["gain dryer sheets",             { floor:6, ceiling:8, substances:["synthetic fragrance","quats","optical brighteners"], reason:"Gain Dryer Sheets — same heavy fragrance load as detergent + quats deposited directly on clothing against skin. Dryer sheet format concentrates exposure.", confidence:"high", category:"home" }],
  ["arm and hammer",        { floor:3, ceiling:5, substances:["synthetic fragrance","1,4-dioxane"], reason:"Arm and Hammer — sodium carbonate base (clean) but synthetic fragrance + ethoxylated surfactants (1,4-dioxane risk). Better than Tide/Gain but not clean.", confidence:"high", category:"home" }],
  ["persil proclean",               { floor:4, ceiling:6, substances:["synthetic fragrance","optical brighteners","enzymes"], reason:"Persil ProClean — synthetic fragrance + optical brighteners. Enzyme-based cleaning is effective but the fragrance and brightener load is high.", confidence:"high", category:"home" }],

  // ── LAUNDRY: DRYER SHEETS HIGH CONCERN ───────────────────────
  ["bounce",           { floor:6, ceiling:8, substances:["synthetic fragrance","quats","optical brighteners"], reason:"Bounce — synthetic fragrance cocktail (undisclosed ingredients) + quaternary ammonium compounds (respiratory sensitizers) deposited on clothing. EWG F-rated. High concern for children's clothing.", confidence:"high", category:"home" }],
  ["downy",         { floor:6, ceiling:8, substances:["synthetic fragrance","quats","dihydrogenated tallow"], reason:"Downy — highest synthetic fragrance load of any mainstream laundry product + quats. EWG F-rated. The fragrance cocktail is applied to clothing and stays through wear.", confidence:"high", category:"home" }],
  ["snuggle dryer sheets",          { floor:6, ceiling:8, substances:["synthetic fragrance","quats"], reason:"Snuggle — synthetic fragrance + quaternary ammonium compounds. Same EWG F concern as Bounce and Downy. Avoid for children's bedding and clothing.", confidence:"high", category:"home" }],

  // ── LAUNDRY: CLEAN TIER ───────────────────────────────────────
  ["seventh generation laundry",    { floor:2, ceiling:4, substances:[], reason:"Seventh Generation laundry — plant-based surfactants, no optical brighteners. EWG A-B on fragrance-free formulas. Fragrance versions have undisclosed fragrance concern.", confidence:"high", category:"home" }],
  ["dropps laundry",                { floor:2, ceiling:3, substances:[], reason:"Dropps — concentrated pods, no dyes, no chlorine, fragrance-free option. EWG A-rated fragrance-free formula. Clean tier.", confidence:"high", category:"home" }],
  ["molly suds",                    { floor:1, ceiling:3, substances:[], reason:"Molly Suds — no SLS, no optical brighteners, no synthetic fragrance, no 1,4-dioxane. EWG A. Benchmark clean laundry powder.", confidence:"high", category:"home" }],
  ["branch basics laundry",         { floor:1, ceiling:2, substances:[], reason:"Branch Basics — EWG A rated concentrate, plant-based, no synthetic fragrance, no dyes, no optical brighteners. Benchmark cleanest mainstream laundry option.", confidence:"high", category:"home" }],
  ["ecos laundry",                  { floor:2, ceiling:3, substances:[], reason:"ECOS laundry — plant-based, EPA Safer Choice certified, no optical brighteners. EWG B. Clean tier.", confidence:"high", category:"home" }],
  ["tru earth",                     { floor:1, ceiling:3, substances:[], reason:"Tru Earth laundry strips — zero-waste plastic-free format, no 1,4-dioxane, fragrance-free option. Clean and lowest packaging concern.", confidence:"high", category:"home" }],

  // ── DRYER: CLEAN ALTERNATIVES ────────────────────────────────
  ["wool dryer balls",              { floor:1, ceiling:2, substances:[], reason:"Wool dryer balls — no chemicals at all, reusable, reduce static naturally. Benchmark cleanest dryer product. Add essential oils if scent desired.", confidence:"high", category:"home" }],
  ["seventh generation dryer",      { floor:2, ceiling:4, substances:[], reason:"Seventh Generation dryer sheets — plant-based, no quats, fragrance-free option available. Significantly cleaner than Bounce/Downy.", confidence:"high", category:"home" }],
  ["method dryer sheets",           { floor:2, ceiling:4, substances:["fragrance"], reason:"Method dryer sheets — plant-based, no quats, but fragrance ingredients not fully disclosed.", confidence:"medium", category:"home" }],

  // ── DISH SOAP: CONVENTIONAL ───────────────────────────────────
  ["dawn original",                 { floor:4, ceiling:6, substances:["methylisothiazolinone","synthetic fragrance","PEG"], reason:"Dawn Original — methylisothiazolinone (MI) preservative (skin sensitizer, EU restricted) + synthetic fragrance + PEG surfactants. EWG D. Better to hand-wash with plant-based soap.", confidence:"high", category:"home" }],
  ["dawn dish soap",               { floor:4, ceiling:6, substances:["methylisothiazolinone","synthetic fragrance","PEG"], reason:"Dawn dish soap — same as Dawn Original. MI preservative + synthetic fragrance.", confidence:"high", category:"home" }],
  ["dawn free and clear dish",      { floor:3, ceiling:5, substances:["methylisothiazolinone","cocamidopropyl betaine"], reason:"Dawn Free and Clear — removes fragrance and dye but still contains methylisothiazolinone (MI) preservative. EWG C. Better than regular Dawn.", confidence:"high", category:"home" }],
  ["palmolive",           { floor:4, ceiling:5, substances:["synthetic fragrance","methylisothiazolinone"], reason:"Palmolive — synthetic fragrance + MI preservative. Standard concern for conventional dish soap.", confidence:"high", category:"home" }],
  ["joy dish soap",                 { floor:4, ceiling:6, substances:["synthetic fragrance","artificial color","methylisothiazolinone"], reason:"Joy — synthetic fragrance + artificial color + MI. Budget dish soap with multiple additive concerns.", confidence:"high", category:"home" }],
  ["ajax dish soap",                { floor:4, ceiling:6, substances:["synthetic fragrance","artificial color"], reason:"Ajax dish soap — synthetic fragrance + artificial color. Budget concern tier.", confidence:"high", category:"home" }],
  ["mrs. meyer's dish",             { floor:3, ceiling:5, substances:["synthetic fragrance","methylisothiazolinone"], reason:"Mrs. Meyer's — plant-based marketing but still contains synthetic fragrance (not fully disclosed) + MI in some formulas. EWG C. Better than Dawn but not clean.", confidence:"high", category:"home" }],
  ["mrs meyers dish",               { floor:3, ceiling:5, substances:["synthetic fragrance","methylisothiazolinone"], reason:"Mrs. Meyer's dish soap — synthetic fragrance + MI preservative. Better than conventional but not as clean as Branch Basics or Better Life.", confidence:"high", category:"home" }],

  // ── DISH SOAP: CLEAN TIER ─────────────────────────────────────
  ["seventh generation dish",       { floor:2, ceiling:3, substances:[], reason:"Seventh Generation dish soap — plant-based, EWG A on fragrance-free formula, no MI, biodegradable. Clean dish soap.", confidence:"high", category:"home" }],
  ["seventh generation soap",       { floor:2, ceiling:3, substances:[], reason:"Seventh Generation dish soap — plant-based, EWG A on fragrance-free formula, no MI, biodegradable. Clean dish soap.", confidence:"high", category:"home" }],
  ["seventh generation hand soap",  { floor:2, ceiling:3, substances:[], reason:"Seventh Generation hand soap — plant-based, no synthetic fragrance, no triclosan. Clean hand soap.", confidence:"high", category:"personal_care" }],
  ["method dish soap",              { floor:2, ceiling:3, substances:[], reason:"Method dish soap — plant-based, biodegradable, no MI. EWG B. Clean tier dish soap.", confidence:"high", category:"home" }],
  ["ecover",              { floor:1, ceiling:3, substances:[], reason:"Ecover — plant-based, biodegradable, no synthetic fragrance in most formulas, EWG A. Clean European dish soap brand.", confidence:"high", category:"home" }],
  ["better life dish",              { floor:1, ceiling:2, substances:[], reason:"Better Life dish soap — EWG A, plant-based, no synthetic fragrance, no MI. Benchmark clean dish soap.", confidence:"high", category:"home" }],
  ["branch basics dish",            { floor:1, ceiling:2, substances:[], reason:"Branch Basics concentrate used for dishes — EWG A, no synthetic fragrance, no MI. Same benchmark clean as laundry formula.", confidence:"high", category:"home" }],

  // ── DISHWASHER ────────────────────────────────────────────────
  ["cascade platinum",              { floor:4, ceiling:6, substances:["chlorine bleach","synthetic fragrance","ethoxylated alcohols"], reason:"Cascade Platinum — chlorine bleach + synthetic fragrance + ethoxylated alcohols (1,4-dioxane risk). EWG D. The fragrance bakes onto dishes during the heated cycle.", confidence:"high", category:"home" }],
  ["cascade complete",              { floor:4, ceiling:6, substances:["chlorine bleach","synthetic fragrance"], reason:"Cascade Complete — chlorine bleach + synthetic fragrance. Same concern as Platinum. EWG D.", confidence:"high", category:"home" }],
  ["cascade",                       { floor:4, ceiling:6, substances:["chlorine bleach","synthetic fragrance"], reason:"Cascade brand — chlorine + synthetic fragrance across line. EWG D. Switch to plant-based dishwasher tabs.", confidence:"medium", category:"home" }],
  ["finish quantum",                { floor:4, ceiling:6, substances:["chlorine bleach","synthetic fragrance","optical brighteners"], reason:"Finish Quantum — chlorine + synthetic fragrance + optical brighteners deposited on dishes. EWG D.", confidence:"high", category:"home" }],
  ["seventh generation dishwasher", { floor:2, ceiling:3, substances:[], reason:"Seventh Generation dishwasher — no chlorine, no synthetic fragrance, plant-based. EWG A. Clean dishwasher option.", confidence:"high", category:"home" }],
  ["dropps dishwasher",             { floor:1, ceiling:3, substances:[], reason:"Dropps dishwasher pods — no dyes, no chlorine, EWG A. Clean concentrated format.", confidence:"high", category:"home" }],

  // ── ALL-PURPOSE CLEANERS: CONCERN ────────────────────────────
  ["clorox disinfecting wipes",     { floor:5, ceiling:7, substances:["quaternary ammonium","synthetic fragrance"], reason:"Clorox Disinfecting Wipes — quaternary ammonium compounds (quats, respiratory sensitizers + skin irritants) + synthetic fragrance. EWG D. Residue left on surfaces after use.", confidence:"high", category:"home" }],
  ["clorox spray",                  { floor:5, ceiling:7, substances:["sodium hypochlorite","quats","synthetic fragrance"], reason:"Clorox spray cleaner — sodium hypochlorite (bleach) + quats + synthetic fragrance. EWG D. Significant inhalation concern during spray use.", confidence:"high", category:"home" }],
  ["pine-sol",                      { floor:5, ceiling:7, substances:["pine oil","quats","synthetic fragrance"], reason:"Pine-Sol — pine oil + quaternary ammonium compounds + synthetic fragrance. EWG D. Strong respiratory irritant in spray form.", confidence:"high", category:"home" }],
  ["pine sol",                      { floor:5, ceiling:7, substances:["pine oil","quats","synthetic fragrance"], reason:"Pine-Sol — quats + synthetic fragrance. EWG D rated.", confidence:"high", category:"home" }],
  ["fabuloso",                      { floor:5, ceiling:6, substances:["synthetic fragrance","artificial color","sodium dodecylbenzenesulfonate"], reason:"Fabuloso — heavy synthetic fragrance + artificial dye (the color is a concern) + sodium dodecylbenzenesulfonate surfactant. EWG D. Popular in Latino households but not a safe product for indoor air quality.", confidence:"high", category:"home" }],
  ["mr. clean",                     { floor:4, ceiling:6, substances:["quats","synthetic fragrance"], reason:"Mr. Clean — quaternary ammonium compounds + synthetic fragrance. EWG D. Standard multi-surface concern.", confidence:"high", category:"home" }],
  ["mr clean",                      { floor:4, ceiling:6, substances:["quats","synthetic fragrance"], reason:"Mr. Clean — quats + synthetic fragrance. EWG D.", confidence:"high", category:"home" }],
  ["windex",                        { floor:4, ceiling:5, substances:["ammonium hydroxide","isopropanol","synthetic fragrance"], reason:"Windex — ammonia + isopropyl alcohol + synthetic fragrance. EWG C-D. Inhalation concern during spray use especially in enclosed spaces.", confidence:"high", category:"home" }],
  ["scrubbing bubbles",             { floor:5, ceiling:7, substances:["sulfamic acid","quats","synthetic fragrance"], reason:"Scrubbing Bubbles — sulfamic acid + quaternary ammonium + synthetic fragrance. EWG D. Strong respiratory irritant, requires ventilation.", confidence:"high", category:"home" }],
  ["comet cleanser",                { floor:4, ceiling:6, substances:["chlorine","crystalline silica","fragrance"], reason:"Comet — chlorine bleach + crystalline silica abrasive (IARC 1 inhalation concern) + fragrance. EWG D. Use wet to minimize silica dust. Avoid inhaling powder.", confidence:"high", category:"home" }],
  ["tilex",                         { floor:6, ceiling:8, substances:["sodium hypochlorite","quats"], reason:"Tilex Mold and Mildew — sodium hypochlorite (bleach) + quats at higher concentration than standard cleaners. EWG F. Requires maximum ventilation, never mix with ammonia. Serious respiratory concern.", confidence:"high", category:"home" }],
  ["lysol toilet bowl",             { floor:5, ceiling:7, substances:["hydrochloric acid","quats"], reason:"Lysol Toilet Bowl Cleaner — hydrochloric acid + quats. Corrosive to skin and respiratory tract. EWG D-F depending on formula.", confidence:"high", category:"home" }],

  // ── ALL-PURPOSE CLEANERS: CLEAN TIER ─────────────────────────
  ["seventh generation",    { floor:2, ceiling:3, substances:[], reason:"Seventh Generation all-purpose — plant-based, no quats, EWG A-B. Clean tier cleaner.", confidence:"high", category:"home" }],
  ["force of nature",               { floor:1, ceiling:2, substances:[], reason:"Force of Nature — hypochlorous acid generated from salt + water + vinegar. EPA approved sanitizer, no synthetic chemicals, EWG A. Benchmark clean disinfectant that actually works.", confidence:"high", category:"home" }],
  ["better life",           { floor:1, ceiling:2, substances:[], reason:"Better Life All Purpose — EWG A, plant-based, no quats, no synthetic fragrance. Benchmark clean multi-surface cleaner.", confidence:"high", category:"home" }],
  ["better life bathroom",          { floor:1, ceiling:3, substances:[], reason:"Better Life Bathroom Cleaner — EWG A, plant-based, no quats, no synthetic fragrance. Clean bathroom cleaner.", confidence:"high", category:"home" }],
  ["method bathroom cleaner",       { floor:2, ceiling:3, substances:[], reason:"Method Bathroom — plant-based, no quats, EWG B. Clean tier bathroom cleaner.", confidence:"high", category:"home" }],

  // ══════════════════════════════════════════════════════════════
  // AUDIT 28B — MEN'S PERSONAL CARE
  // ══════════════════════════════════════════════════════════════

  // ── ANTIPERSPIRANT: CONCERN ───────────────────────────────────
  ["old spice",      { floor:5, ceiling:7, substances:["aluminum zirconium","synthetic fragrance","propylene glycol"], reason:"Old Spice antiperspirant — aluminum zirconium tetrachlorohydrex (IARC 2A debate, endocrine disruption concern) + very heavy synthetic fragrance load. Daily underarm application amplifies concern.", confidence:"high", category:"personal_care" }],
  ["secret",         { floor:5, ceiling:7, substances:["aluminum zirconium","synthetic fragrance"], reason:"Secret antiperspirant — aluminum zirconium + synthetic fragrance. Daily underarm application concern. Switch to aluminum-free deodorant.", confidence:"high", category:"personal_care" }],
  ["degree",         { floor:5, ceiling:7, substances:["aluminum zirconium","synthetic fragrance"], reason:"Degree antiperspirant — aluminum zirconium + synthetic fragrance. Same concern as Secret and Old Spice antiperspirants.", confidence:"high", category:"personal_care" }],
  ["dove",                           { floor:4, ceiling:6, substances:["synthetic fragrance","SLES","dimethicone"], reason:"Dove — SLES + synthetic fragrance + dimethicone across most product lines. Marketed as gentle but conventional formula. EWG C-D.", confidence:"high", category:"personal_care" }],
  ["dove soap",                      { floor:4, ceiling:5, substances:["synthetic fragrance","sodium lauroyl isethionate"], reason:"Dove Beauty Bar — sodium lauroyl isethionate base (milder than SLS) + synthetic fragrance. Better than most conventional bars but not clean.", confidence:"high", category:"personal_care" }],
  ["dove body wash",                 { floor:4, ceiling:6, substances:["synthetic fragrance","SLES","dimethicone"], reason:"Dove body wash — SLES + synthetic fragrance + dimethicone. Marketed as moisturizing but still conventional formula.", confidence:"high", category:"personal_care" }],
  ["dove men",                      { floor:5, ceiling:7, substances:["aluminum zirconium","synthetic fragrance"], reason:"Dove Men antiperspirant — aluminum + synthetic fragrance. Antiperspirant concern tier.", confidence:"medium", category:"personal_care" }],
  ["dove men antiperspirant",       { floor:5, ceiling:7, substances:["aluminum zirconium","synthetic fragrance","dimethicone"], reason:"Dove Men+Care antiperspirant — aluminum zirconium + synthetic fragrance + dimethicone. Daily underarm use with aluminum absorption concern.", confidence:"high", category:"personal_care" }],
  ["old spice deodorant",           { floor:4, ceiling:6, substances:["synthetic fragrance","propylene glycol"], reason:"Old Spice deodorant (no aluminum) — very heavy synthetic fragrance + propylene glycol. No aluminum concern but fragrance load is among the highest in men's category.", confidence:"high", category:"personal_care" }],

  // ── DEODORANT: CLEAN TIER ─────────────────────────────────────
  ["schmidt's deodorant",           { floor:2, ceiling:4, substances:["baking soda","fragrance"], reason:"Schmidt's — no aluminum, baking soda base. Same baking soda irritation risk as Native. Fragrance-free version is cleanest.", confidence:"high", category:"personal_care" }],
  ["necessaire",          { floor:1, ceiling:3, substances:[], reason:"Nécessaire — EWG Verified, no aluminum, no baking soda (uses magnesium instead), no synthetic fragrance. One of the cleanest mainstream deodorant options.", confidence:"high", category:"personal_care" }],
  ["lume",                { floor:2, ceiling:3, substances:[], reason:"Lume — no aluminum, no baking soda, clinically tested, whole body formula. Mandelic acid base. No synthetic fragrance in unscented. Clean tier deodorant.", confidence:"high", category:"personal_care" }],
  ["crystal deodorant",             { floor:2, ceiling:4, substances:["potassium alum"], reason:"Crystal — potassium alum mineral salt (different from aluminum chloride in antiperspirants). No added fragrance, no propylene glycol. Cleaner than conventional but alum is still an aluminum salt.", confidence:"medium", category:"personal_care" }],
  ["primal pit paste",              { floor:1, ceiling:3, substances:[], reason:"Primal Pit Paste — coconut oil + arrowroot + baking soda, no aluminum, no synthetic fragrance. Clean natural deodorant.", confidence:"high", category:"personal_care" }],
  ["each and every deodorant",      { floor:1, ceiling:3, substances:[], reason:"Each and Every — no aluminum, no baking soda, no synthetic fragrance, EWG Verified. Clean deodorant.", confidence:"high", category:"personal_care" }],

  // ── SHAVING: RAZORS ───────────────────────────────────────────
  ["merkur safety razor",           { floor:1, ceiling:2, substances:[], reason:"Merkur safety razor — stainless steel, no plastic cartridge waste, lasts decades. Benchmark clean shaving from a materials perspective.", confidence:"high", category:"personal_care" }],
  ["safety razor",                  { floor:1, ceiling:2, substances:[], reason:"Double-edge safety razor — stainless steel, minimal plastic, reusable handle. Benchmark clean shaving format.", confidence:"high", category:"personal_care" }],
  ["gillette fusion",               { floor:2, ceiling:4, substances:["plastic cartridge"], reason:"Gillette Fusion — plastic cartridge system, disposable heads. No chemistry concern but plastic waste concern. The razor itself is not a chemical exposure issue.", confidence:"medium", category:"personal_care" }],
  ["gillette mach3",                { floor:2, ceiling:4, substances:["plastic cartridge"], reason:"Gillette Mach3 — plastic cartridge. Same plastic waste concern as Fusion. Lower price point.", confidence:"medium", category:"personal_care" }],
  ["harry's razor",                 { floor:2, ceiling:3, substances:["plastic cartridge"], reason:"Harry's — plastic cartridge but recyclable program offered. B Corp certified company. Better packaging practices than Gillette.", confidence:"medium", category:"personal_care" }],

  // ── SHAVING CREAM / GEL ───────────────────────────────────────
  ["barbasol",        { floor:4, ceiling:6, substances:["isobutane propellant","triethanolamine","synthetic fragrance"], reason:"Barbasol — isobutane aerosol propellant + triethanolamine (TEA, potential nitrosamine formation concern) + synthetic fragrance. Budget shaving cream with multiple concern ingredients.", confidence:"high", category:"personal_care" }],
  ["edge shaving gel",              { floor:4, ceiling:6, substances:["isobutane","synthetic fragrance","PPG"], reason:"Edge Shaving Gel — isobutane aerosol + synthetic fragrance + polypropylene glycol. Standard concern for conventional shave gel.", confidence:"high", category:"personal_care" }],
  ["gillette shaving cream",        { floor:4, ceiling:5, substances:["synthetic fragrance","triethanolamine"], reason:"Gillette shaving cream — synthetic fragrance + triethanolamine. Better than aerosol but still conventional concern ingredients.", confidence:"high", category:"personal_care" }],
  ["proraso shaving cream",         { floor:2, ceiling:4, substances:[], reason:"Proraso — eucalyptus oil + menthol, Italian heritage formula. No synthetic fragrance in classic formulas. Cleaner than Barbasol/Edge but not EWG verified.", confidence:"high", category:"personal_care" }],
  ["every man jack shave",          { floor:2, ceiling:4, substances:[], reason:"Every Man Jack shave — plant-based surfactants, no parabens. Cleaner than conventional but fragrance in some products.", confidence:"high", category:"personal_care" }],
  ["cremo shaving cream",           { floor:3, ceiling:5, substances:["synthetic fragrance"], reason:"Cremo — effective formula but synthetic fragrance. EWG C. Better than Barbasol, not as clean as Pacific Shaving.", confidence:"medium", category:"personal_care" }],

  // ── MEN'S HAIR: CONVENTIONAL ─────────────────────────────────
  ["head and shoulders",            { floor:4, ceiling:6, substances:["zinc pyrithione","synthetic fragrance","dimethicone"], reason:"Head and Shoulders — zinc pyrithione (effective antifungal but skin sensitizer) + synthetic fragrance + dimethicone silicone. EWG D.", confidence:"high", category:"personal_care" }],
  ["suave",             { floor:4, ceiling:6, substances:["synthetic fragrance","sulfates","dimethicone"], reason:"Suave Men — heavy synthetic fragrance + SLS/SLES sulfates + dimethicone. Budget shampoo with high concern ingredient load.", confidence:"high", category:"personal_care" }],
  ["dove men shampoo",              { floor:4, ceiling:5, substances:["synthetic fragrance","dimethicone"], reason:"Dove Men+Care shampoo — silicones + synthetic fragrance. EWG C-D. Better than Suave but still conventional.", confidence:"high", category:"personal_care" }],
  ["american crew shampoo",         { floor:4, ceiling:5, substances:["synthetic fragrance","dimethicone"], reason:"American Crew — synthetic fragrance + silicone coating. Professional marketing but conventional concern formula.", confidence:"high", category:"personal_care" }],
  ["nizoral shampoo",               { floor:3, ceiling:5, substances:["ketoconazole","synthetic fragrance"], reason:"Nizoral — ketoconazole antifungal (prescription strength available OTC, effective for dandruff/seborrheic dermatitis) + synthetic fragrance. Medical use justified but not for daily use. Use as directed.", confidence:"medium", category:"personal_care" }],

  // ── MEN'S HAIR: CLEAN TIER ────────────────────────────────────
  ["every man jack shampoo",        { floor:2, ceiling:4, substances:[], reason:"Every Man Jack shampoo — plant-based surfactants, no parabens, EWG B. Clean tier men's shampoo.", confidence:"high", category:"personal_care" }],
  ["every man jack",                { floor:2, ceiling:4, substances:[], reason:"Every Man Jack brand — plant-based, EWG B across most products, no parabens. Clean tier men's personal care brand.", confidence:"high", category:"personal_care" }],
  ["ursa major",                    { floor:1, ceiling:3, substances:[], reason:"Ursa Major — EWG Verified, plant-based, no synthetic fragrance, no parabens, no silicones. Benchmark clean men's grooming brand.", confidence:"high", category:"personal_care" }],
  ["brickell men",                  { floor:1, ceiling:3, substances:[], reason:"Brickell Men's — natural and organic ingredients, no synthetic fragrance, EWG friendly. Clean men's grooming brand.", confidence:"high", category:"personal_care" }],

  // ── MEN'S BODY WASH ───────────────────────────────────────────
  ["axe body wash",                 { floor:6, ceiling:8, substances:["synthetic fragrance","artificial color","sulfates"], reason:"Axe Body Wash — the highest synthetic fragrance load of any mainstream men's product. EWG F on most formulas. Heavy undisclosed fragrance cocktail applied to skin daily. Avoid especially for adolescents.", confidence:"high", category:"personal_care" }],
  ["axe",                           { floor:6, ceiling:8, substances:["synthetic fragrance","artificial color"], reason:"Axe brand — EWG F rated, maximum synthetic fragrance load. Not for daily skin or underarm use.", confidence:"high", category:"personal_care" }],
  ["old spice body wash_REMOVED",           { floor:5, ceiling:7, substances:["synthetic fragrance","sulfates","artificial color"], reason:"Old Spice body wash — heavy synthetic fragrance + SLS + artificial color. EWG D-F depending on formula.", confidence:"high", category:"personal_care" }],
  ["irish spring",                  { floor:5, ceiling:6, substances:["synthetic fragrance","artificial color"], reason:"Irish Spring — synthetic fragrance + artificial color (the green). EWG D. Classic but not a clean product.", confidence:"high", category:"personal_care" }],
  ["dr. squatch",                   { floor:2, ceiling:4, substances:["fragrance"], reason:"Dr. Squatch — natural soap base, no SLS, no parabens, but fragrance from natural sources (essential oils) is not always fully disclosed. EWG B. Clean tier men's soap.", confidence:"high", category:"personal_care" }],
  ["dr squatch",                    { floor:2, ceiling:4, substances:["fragrance"], reason:"Dr. Squatch — natural soap, no SLS, no parabens. EWG B. Clean tier.", confidence:"high", category:"personal_care" }],
  ["duke cannon",                   { floor:4, ceiling:6, substances:["synthetic fragrance","artificial color"], reason:"Duke Cannon — most products use synthetic fragrance + artificial colors. Military branding, conventional formula. Better packaging, same concern as Irish Spring.", confidence:"high", category:"personal_care" }],
  ["defense soap",                  { floor:2, ceiling:3, substances:[], reason:"Defense Soap — tea tree oil + eucalyptus, used by wrestlers/athletes for antimicrobial protection. Plant-based, no synthetic fragrance. Clean functional soap.", confidence:"high", category:"personal_care" }],

  // ── MEN'S FACE WASH ───────────────────────────────────────────
  ["cerave men face",               { floor:3, ceiling:5, substances:["synthetic fragrance","phenoxyethanol","niacinamide"], reason:"CeraVe Men — ceramides are beneficial but formula includes phenoxyethanol preservative + synthetic fragrance in some versions. EWG C.", confidence:"high", category:"personal_care" }],
  ["kiehl's men",                   { floor:3, ceiling:5, substances:["synthetic fragrance","phenoxyethanol"], reason:"Kiehl's men's — premium positioning but synthetic fragrance + phenoxyethanol in many formulas. EWG C.", confidence:"high", category:"personal_care" }],
  ["jack black face",               { floor:3, ceiling:5, substances:["synthetic fragrance","PEG"], reason:"Jack Black face wash — synthetic fragrance + PEG compounds in some formulas. EWG C. Clean-marketed but not EWG verified.", confidence:"high", category:"personal_care" }],

  // ══════════════════════════════════════════════════════════════
  // AUDIT 28C — BREAKFAST FOODS
  // ══════════════════════════════════════════════════════════════

  // ── CEREAL: HIGH CONCERN ──────────────────────────────────────
  ["capn crunch",                   { floor:5, ceiling:7, substances:["TBHQ","Yellow 5","Yellow 6"], reason:"Cap'n Crunch — TBHQ + petroleum dyes. Multiple floors fire.", confidence:"high", category:"food_beverage" }],
  ["cinnamon toast crunch",         { floor:5, ceiling:7, substances:["BHT","TBHQ","conventional wheat"], reason:"Cinnamon Toast Crunch — BHT + TBHQ (both IARC 2B) + conventional wheat (glyphosate concern). Two preservative floors fire.", confidence:"high", category:"food_beverage" }],

  // ── CEREAL: MODERATE CONCERN ──────────────────────────────────
  ["special k",                     { floor:4, ceiling:5, substances:["BHT","conventional wheat","natural flavor"], reason:"Special K — BHT preservative + conventional wheat/rice + vague 'natural flavor'. BHT floor fires.", confidence:"high", category:"food_beverage" }],
  ["raisin bran",                   { floor:4, ceiling:5, substances:["BHT","conventional wheat"], reason:"Raisin Bran (Kellogg's) — BHT preservative + conventional wheat. BHT floor fires. Added sugar on raisins.", confidence:"high", category:"food_beverage" }],
  ["corn flakes",                   { floor:4, ceiling:5, substances:["BHT","conventional corn"], reason:"Corn Flakes — BHT preservative + conventional corn (glyphosate concern). BHT floor fires.", confidence:"high", category:"food_beverage" }],
  ["total cereal",                  { floor:4, ceiling:5, substances:["BHT","synthetic vitamins spray","conventional wheat"], reason:"Total Cereal — BHT preservative + heavy synthetic vitamin spray coating on conventional wheat. BHT floor fires.", confidence:"high", category:"food_beverage" }],
  ["wheaties",                      { floor:4, ceiling:5, substances:["BHT","conventional wheat"], reason:"Wheaties — BHT preservative + conventional wheat. BHT floor fires. Despite wholesome marketing, preservative concern applies.", confidence:"high", category:"food_beverage" }],
  ["life cereal",                   { floor:4, ceiling:6, substances:["TBHQ","BHT","conventional oats"], reason:"Life Cereal — TBHQ + BHT preservatives + conventional oats (glyphosate concern). Two preservative floors fire.", confidence:"high", category:"food_beverage" }],
  ["grape-nuts",                    { floor:3, ceiling:4, substances:["conventional wheat","conventional barley"], reason:"Grape-Nuts — no BHT or TBHQ, minimal ingredients, but conventional wheat + barley (glyphosate concern on non-organic grain). Relatively clean for mainstream cereal.", confidence:"high", category:"food_beverage" }],
  ["grape nuts",                    { floor:3, ceiling:4, substances:["conventional wheat","conventional barley"], reason:"Grape-Nuts — no BHT or TBHQ, minimal ingredients, but conventional wheat + barley (glyphosate concern on non-organic grain). Relatively clean for mainstream cereal.", confidence:"high", category:"food_beverage" }],

  // ── CEREAL: CLEAN TIER ────────────────────────────────────────
  ["uncle sam",              { floor:1, ceiling:3, substances:[], reason:"Uncle Sam — whole wheat + flaxseed, no artificial additives, no BHT/TBHQ. Simple clean ingredient list. Benchmark clean mainstream cereal.", confidence:"high", category:"food_beverage" }],
  ["barbara's puffins",             { floor:2, ceiling:4, substances:[], reason:"Barbara's Puffins — minimal ingredients, no BHT/TBHQ, no artificial colors. Cleaner than most conventional cereals.", confidence:"high", category:"food_beverage" }],
  ["three wishes",           { floor:1, ceiling:3, substances:[], reason:"Three Wishes — chickpea-based, no sugar, no grain, minimal clean ingredients. Benchmark clean cereal.", confidence:"high", category:"food_beverage" }],
  ["kashi cereal",                  { floor:2, ceiling:4, substances:[], reason:"Kashi — whole grain, plant-based, no BHT/TBHQ. Organic options available. Clean tier vs conventional cereals.", confidence:"high", category:"food_beverage" }],
  ["nature's path",          { floor:1, ceiling:3, substances:[], reason:"Nature's Path — USDA Organic, no BHT/TBHQ, no artificial colors or flavors. Benchmark clean cereal brand.", confidence:"high", category:"food_beverage" }],
  ["natures path",                  { floor:1, ceiling:3, substances:[], reason:"Nature's Path — USDA Organic across the line, no artificial additives. Benchmark clean cereal and granola brand.", confidence:"high", category:"food_beverage" }],
  ["cascadian farm",                { floor:1, ceiling:3, substances:[], reason:"Cascadian Farm — USDA Organic, no artificial additives. Clean organic cereal and granola brand.", confidence:"high", category:"food_beverage" }],
  ["bob's red mill muesli",         { floor:1, ceiling:2, substances:[], reason:"Bob's Red Mill Muesli — whole rolled oats + fruit + nuts, no added sugar or preservatives. Benchmark clean breakfast grain.", confidence:"high", category:"food_beverage" }],

  // ── OATS / GRANOLA ────────────────────────────────────────────
  ["quaker old fashioned oats",     { floor:3, ceiling:5, substances:["glyphosate","conventional oats"], reason:"Quaker Old Fashioned Oats — conventional oats with documented glyphosate residue (EWG testing). Not organic. Better than instant packets but still a pesticide concern.", confidence:"high", category:"food_beverage" }],
  ["purely elizabeth",      { floor:1, ceiling:3, substances:[], reason:"Purely Elizabeth — organic oats + coconut sugar + clean ingredients, no artificial additives. Benchmark clean granola.", confidence:"high", category:"food_beverage" }],
  ["bear naked granola",            { floor:2, ceiling:4, substances:["conventional oats"], reason:"Bear Naked — real ingredients, no artificial additives, but conventional oats (glyphosate concern). Organic version is cleaner.", confidence:"medium", category:"food_beverage" }],

  // ── BREAD ─────────────────────────────────────────────────────
  ["wonder bread",                  { floor:5, ceiling:7, substances:["HFCS","calcium propionate","azodicarbonamide","soybean oil"], reason:"Wonder Bread — HFCS + calcium propionate + azodicarbonamide (flour bleaching agent, banned EU, 'yoga mat chemical') + soybean oil. Multiple floors fire. Benchmark industrial bread concern.", confidence:"high", category:"food_beverage" }],
  ["nature's harvest bread",        { floor:4, ceiling:6, substances:["calcium propionate","soybean oil","HFCS"], reason:"Nature's Harvest — calcium propionate mold inhibitor + soybean oil + some formulas have HFCS. Same gut microbiome concern as Mission tortillas.", confidence:"high", category:"food_beverage" }],
  ["pepperidge farm bread",         { floor:4, ceiling:5, substances:["calcium propionate","soybean oil"], reason:"Pepperidge Farm — calcium propionate + soybean oil. Better than Wonder but same preservative concern.", confidence:"high", category:"food_beverage" }],
  ["dave's killer bread",           { floor:3, ceiling:4, substances:["conventional wheat","organic"], reason:"Dave's Killer Bread — organic sprouted grain versions are cleaner (1-3); conventional varieties still have glyphosate concern on non-organic wheat. Verify organic vs conventional.", confidence:"medium", category:"food_beverage" }],

  // ── EGGS ──────────────────────────────────────────────────────
  ["pete and gerry's",              { floor:1, ceiling:3, substances:[], reason:"Pete and Gerry's — USDA Organic, certified humane, free range. Clean organic egg benchmark.", confidence:"high", category:"food_beverage" }],
  ["happy egg",                     { floor:2, ceiling:3, substances:[], reason:"Happy Egg Co — free range, higher welfare than conventional. Not organic but meaningful step up from caged eggs.", confidence:"high", category:"food_beverage" }],
  ["eggland's best",                { floor:3, ceiling:4, substances:["conventional feed","synthetic supplements"], reason:"Eggland's Best — cage-free claim (varies by farm) + proprietary feed with synthetic supplements. Better than conventional but not organic or pasture-raised.", confidence:"medium", category:"food_beverage" }],

  // ── BREAKFAST MEATS ───────────────────────────────────────────
  ["oscar mayer bacon",             { floor:6, ceiling:8, substances:["sodium nitrite","artificial smoke","sugar"], reason:"Oscar Mayer Bacon — sodium nitrite (IARC Group 1 carcinogen) + artificial smoke flavor + added sugar. Nitrite floor fires. Standard processed bacon concern.", confidence:"high", category:"food_beverage" }],
  ["applegate",               { floor:1, ceiling:3, substances:[], reason:"Applegate — uncured (no added nitrites/nitrates), humanely raised, USDA Organic options. Benchmark clean bacon. Note: celery powder check — Applegate uses real sea salt cure, not celery juice loophole.", confidence:"high", category:"food_beverage" }],
  ["pederson's bacon",              { floor:1, ceiling:3, substances:[], reason:"Pederson's — no antibiotics, humanely raised, no nitrites added. Clean bacon alternative.", confidence:"high", category:"food_beverage" }],
  ["jones dairy sausage",           { floor:4, ceiling:6, substances:["corn syrup","BHT"], reason:"Jones Dairy Sausage — corn syrup + BHT preservative in some formulas. BHT floor may fire. Conventional breakfast sausage concern.", confidence:"medium", category:"food_beverage" }],

  // ── JUICE ─────────────────────────────────────────────────────
  ["tropicana orange juice",        { floor:4, ceiling:6, substances:["flavor packs","pasteurized"], reason:"Tropicana OJ — pasteurized (destroys enzymes), then de-oxygenated for storage (strips flavor), then flavor packs added from orange essence/oils (not disclosed on label). Not fresh-squeezed despite branding.", confidence:"high", category:"food_beverage" }],
  ["tropicana",                     { floor:4, ceiling:6, substances:["flavor packs","pasteurized"], reason:"Tropicana — flavor packs added after de-aeration storage. Not as natural as label implies.", confidence:"medium", category:"food_beverage" }],
  ["florida natural oj",            { floor:3, ceiling:5, substances:["pasteurized","flavor packs"], reason:"Florida Natural — pasteurized with flavor pack concern. Similar profile to Simply Orange.", confidence:"medium", category:"food_beverage" }],
  ["odwalla juice",                 { floor:4, ceiling:5, substances:["pasteurized","added sugar"], reason:"Odwalla — HPP or pasteurized, some blends have added sugars and natural flavor. Less clean than cold-pressed.", confidence:"medium", category:"food_beverage" }],
  ["suja",                    { floor:1, ceiling:3, substances:[], reason:"Suja — cold-pressed, USDA Organic, HPP preserved (not heat pasteurized). Benchmark clean juice brand.", confidence:"high", category:"food_beverage" }],

  // ── YOGURT ────────────────────────────────────────────────────
  ["yoplait",                       { floor:4, ceiling:6, substances:["HFCS","modified starch","artificial flavor"], reason:"Yoplait brand — HFCS + modified corn starch + artificial flavors in most original formulas. Go-Gurt and Trix yogurt worse (added dyes).", confidence:"medium", category:"food_beverage" }],
  ["chobani plain",                 { floor:1, ceiling:2, substances:[], reason:"Chobani Plain Greek Yogurt — milk + cultures, two ingredients. Benchmark clean yogurt. Flavored versions vary.", confidence:"high", category:"food_beverage" }],
  ["chobani",                       { floor:1, ceiling:3, substances:[], reason:"Chobani — plain varieties are benchmark clean (1-2). Flavored varieties may have added sugar and natural flavor. Always choose plain.", confidence:"medium", category:"food_beverage" }],
  ["fage total",                    { floor:1, ceiling:2, substances:[], reason:"FAGE Total Greek Yogurt — milk + cultures, minimal ingredients. Benchmark clean yogurt alongside Chobani plain.", confidence:"high", category:"food_beverage" }],
  ["fage",                          { floor:1, ceiling:2, substances:[], reason:"FAGE — milk + cultures. Benchmark clean Greek yogurt brand.", confidence:"high", category:"food_beverage" }],
  ["siggi's",                       { floor:1, ceiling:2, substances:[], reason:"Siggi's Skyr — Icelandic-style, minimal ingredients, lower sugar than conventional yogurt, live cultures. Benchmark clean yogurt.", confidence:"high", category:"food_beverage" }],
  ["siggis",                        { floor:1, ceiling:2, substances:[], reason:"Siggi's — milk + cultures + fruit, lower sugar, minimal ingredients. Benchmark clean.", confidence:"high", category:"food_beverage" }],
  ["stonyfield",     { floor:1, ceiling:3, substances:[], reason:"Stonyfield Organic — USDA Organic, live cultures, no artificial additives. Clean organic yogurt benchmark.", confidence:"high", category:"food_beverage" }],
  ["noosa yogurt",                  { floor:2, ceiling:4, substances:["honey","cane sugar"], reason:"Noosa — whole milk + honey, real fruit, no artificial additives. Not organic but clean-label. Higher sugar than plain but real ingredients.", confidence:"high", category:"food_beverage" }],
  ["oui by yoplait",                { floor:2, ceiling:3, substances:[], reason:"Oui by Yoplait — glass pot, whole milk yogurt, minimal clean ingredients. Much cleaner than regular Yoplait despite same brand.", confidence:"high", category:"food_beverage" }],
  ["two good greek yogurt",         { floor:3, ceiling:4, substances:["allulose","stevia"], reason:"Two Good — allulose + stevia sweetened, low sugar. No sucralose but novel sweeteners. Cleaner than Yoplait Original but not as clean as Chobani plain.", confidence:"medium", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // AUDIT 28 — CLEANING PRODUCTS
  // ══════════════════════════════════════════════════════════════

  // ── LAUNDRY: CONCERN TIER ─────────────────────────────────────
  ["all free clear",                { floor:3, ceiling:5, substances:["ethoxylated surfactants","1,4-dioxane"], reason:"All Free Clear — fragrance-free and dye-free but ethoxylated surfactants remain. Better for sensitive skin but not clean-formulated.", confidence:"high", category:"home" }],
  ["arm and hammer laundry",        { floor:3, ceiling:5, substances:["synthetic fragrance","surfactants"], reason:"Arm and Hammer laundry — baking soda base + surfactants + synthetic fragrance in most formulas. Better than Gain but not clean-label.", confidence:"high", category:"home" }],
  ["mrs. meyer's laundry",          { floor:3, ceiling:5, substances:["synthetic fragrance","methylisothiazolinone"], reason:"Mrs. Meyer's laundry — plant-derived surfactants but MIT (EU-banned in rinse-off products) + synthetic fragrance. Cleaner branding than formulation.", confidence:"high", category:"home" }],
  ["mrs meyers laundry",            { floor:3, ceiling:5, substances:["synthetic fragrance","methylisothiazolinone"], reason:"Mrs. Meyer's — MIT preservative + synthetic fragrance. Better than Gain, not a clean product.", confidence:"high", category:"home" }],
  ["method laundry",                { floor:3, ceiling:5, substances:["synthetic fragrance","ethoxylated surfactants"], reason:"Method laundry — plant-based surfactants but synthetic fragrance. Better than Tide/Gain, not as clean as Seventh Generation.", confidence:"high", category:"home" }],

  // ── LAUNDRY: CLEAN TIER ───────────────────────────────────────
  ["biokleen laundry",              { floor:2, ceiling:3, substances:[], reason:"Biokleen laundry — plant-based, no synthetic fragrance, no optical brighteners. EWG A/B rated. Clean option.", confidence:"high", category:"home" }],
  ["dropps",                        { floor:1, ceiling:3, substances:[], reason:"Dropps — EWG Verified, plant-based, no 1,4-dioxane, no synthetic fragrance, plastic-free packaging. Benchmark clean laundry and dish pods.", confidence:"high", category:"home" }],
  ["meliora",                       { floor:1, ceiling:2, substances:[], reason:"Meliora — EWG Verified, soap-based powder, no synthetic surfactants, no 1,4-dioxane. Cleanest powdered laundry option.", confidence:"high", category:"home" }],
  ["charlie soap",                  { floor:1, ceiling:2, substances:[], reason:"Charlie Soap — simple soap-based laundry powder, no synthetic surfactants or fragrance. Very clean minimal formula.", confidence:"high", category:"home" }],

  // ── DRYER SHEETS / FABRIC SOFTENER ───────────────────────────
  ["snuggle",                       { floor:5, ceiling:7, substances:["synthetic fragrance","quaternary ammonium","artificial dyes"], reason:"Snuggle — synthetic fragrance + quaternary ammonium compounds (quats, respiratory sensitizer) + artificial dyes. One of the most chemical-heavy laundry products.", confidence:"high", category:"home" }],
  ["method dryer",                  { floor:2, ceiling:4, substances:["synthetic fragrance"], reason:"Method dryer sheets — plant-based but synthetic fragrance. Better than Bounce, not as clean as Seventh Generation.", confidence:"high", category:"home" }],
  ["friendsheep",                   { floor:1, ceiling:2, substances:[], reason:"Friendsheep wool dryer balls — GOTS certified organic wool, zero chemicals. Benchmark clean.", confidence:"high", category:"home" }],

  // ── DISH SOAP: CONCERN TIER ───────────────────────────────────
  ["dawn",                     { floor:4, ceiling:6, substances:["SLS","synthetic fragrance","methylisothiazolinone"], reason:"Dawn — SLS + synthetic fragrance + MIT preservative (EU-banned in rinse-off products) + artificial color. The most popular dish soap is not a clean product.", confidence:"high", category:"home" }],
  ["palmolive dish",                { floor:4, ceiling:6, substances:["SLS","synthetic fragrance","artificial color"], reason:"Palmolive — SLS + synthetic fragrance + artificial color. Standard conventional dish soap concern profile.", confidence:"high", category:"home" }],
  ["joy dish",                      { floor:4, ceiling:6, substances:["SLS","synthetic fragrance","artificial color"], reason:"Joy — SLS + synthetic fragrance + artificial color. Same conventional concern as Palmolive.", confidence:"high", category:"home" }],
  ["ajax dish",                     { floor:4, ceiling:6, substances:["SLS","synthetic fragrance"], reason:"Ajax dish soap — SLS + synthetic fragrance. Budget tier conventional concern.", confidence:"high", category:"home" }],
  ["method dish",                   { floor:3, ceiling:4, substances:["synthetic fragrance"], reason:"Method dish soap — plant-based surfactants, biodegradable, but synthetic fragrance. Better than Dawn, not as clean as Seventh Generation.", confidence:"high", category:"home" }],

  // ── DISH SOAP: CLEAN TIER ─────────────────────────────────────
  ["honest company dish",           { floor:2, ceiling:3, substances:[], reason:"Honest Company dish — EWG certified, plant-based, no MIT. Cleaner than Dawn.", confidence:"high", category:"home" }],
  ["ecos dish",                     { floor:2, ceiling:3, substances:[], reason:"ECOS dish soap — EPA Safer Choice, plant-based, hypoallergenic, no MIT. Clean tier.", confidence:"high", category:"home" }],
  ["puracy dish",                   { floor:2, ceiling:3, substances:[], reason:"Puracy dish soap — plant-based, EWG A rated, no synthetic fragrance, no MIT.", confidence:"high", category:"home" }],
  ["biokleen dish",                 { floor:2, ceiling:3, substances:[], reason:"Biokleen dish liquid — plant-based, no synthetic fragrance, no artificial color. Clean tier.", confidence:"high", category:"home" }],

  // ── DISHWASHER ────────────────────────────────────────────────
  ["cascade dishwasher",            { floor:4, ceiling:6, substances:["quaternary ammonium","optical brighteners","synthetic fragrance"], reason:"Cascade — quats + optical brighteners + synthetic fragrance. Residue left on dishes that contact food. Not a clean product.", confidence:"high", category:"home" }],
  ["finish",             { floor:4, ceiling:6, substances:["quaternary ammonium","optical brighteners"], reason:"Finish — quats + optical brighteners. Same concern profile as Cascade.", confidence:"high", category:"home" }],
  ["ecover dishwasher",             { floor:2, ceiling:3, substances:[], reason:"Ecover — plant-based, no phosphates, no synthetic fragrance. European clean standard dishwasher option.", confidence:"high", category:"home" }],

  // ── ALL PURPOSE: CONCERN TIER ─────────────────────────────────
  ["lysol all purpose",             { floor:5, ceiling:7, substances:["quaternary ammonium","synthetic fragrance","glycol ether"], reason:"Lysol APC — quats (respiratory sensitizer) + synthetic fragrance + glycol ethers. Not for food prep surfaces without rinsing.", confidence:"high", category:"home" }],
  ["clorox clean-up",               { floor:5, ceiling:7, substances:["sodium hypochlorite","synthetic fragrance"], reason:"Clorox Clean-Up — bleach + synthetic fragrance. Never mix with ammonia products (chloramine gas risk). Respiratory and skin irritant.", confidence:"high", category:"home" }],
  ["fantastik",                     { floor:5, ceiling:7, substances:["quaternary ammonium","synthetic fragrance","glycol ether"], reason:"Fantastik — quats + synthetic fragrance + glycol ethers. Standard conventional APC concern.", confidence:"high", category:"home" }],
  ["formula 409",                   { floor:5, ceiling:7, substances:["quaternary ammonium","synthetic fragrance"], reason:"Formula 409 — quats + synthetic fragrance. EPA-registered disinfectant, not a clean household cleaner.", confidence:"high", category:"home" }],
  ["microban 24",                   { floor:6, ceiling:8, substances:["benzalkonium chloride","quaternary ammonium"], reason:"Microban 24 — benzalkonium chloride designed to persist 24 hours on surfaces. Persistent quat exposure concern for daily household use around children.", confidence:"high", category:"home" }],
  ["tilex mold",                    { floor:6, ceiling:8, substances:["sodium hypochlorite","chlorine gas risk"], reason:"Tilex Mold and Mildew — high bleach concentration in enclosed bathrooms = serious chlorine gas inhalation risk. Maximum ventilation required. Never mix with other cleaners.", confidence:"high", category:"home" }],

  // ── ALL PURPOSE: CLEAN TIER ───────────────────────────────────
  ["method all purpose",            { floor:3, ceiling:4, substances:["synthetic fragrance"], reason:"Method APC — plant-based surfactants, biodegradable, but synthetic fragrance. Better than Lysol, not as clean as Seventh Generation.", confidence:"high", category:"home" }],
  ["seventh generation all purpose", { floor:2, ceiling:3, substances:[], reason:"Seventh Generation APC — EPA Safer Choice, plant-based, no synthetic fragrance, no quats. Benchmark mainstream clean all-purpose cleaner.", confidence:"high", category:"home" }],
  ["puracy",                        { floor:2, ceiling:3, substances:[], reason:"Puracy — plant-based, EWG A rated, no synthetic fragrance. Clean tier cleaning products.", confidence:"high", category:"home" }],
  ["grove collaborative",           { floor:2, ceiling:4, substances:[], reason:"Grove Collaborative — plant-based concentrates, EWG certified on most products. Clean tier, varies by product.", confidence:"medium", category:"home" }],
  ["thieves cleaner",               { floor:2, ceiling:4, substances:["essential oils"], reason:"Thieves Household Cleaner — plant-derived, essential oil based, no quats. Cleaner than Lysol. Young Living MLM brand.", confidence:"medium", category:"home" }],
  ["method bathroom",               { floor:3, ceiling:4, substances:["synthetic fragrance"], reason:"Method bathroom cleaner — plant-based surfactants but synthetic fragrance. Better than Scrubbing Bubbles, not as clean as Better Life.", confidence:"high", category:"home" }],

  // ══════════════════════════════════════════════════════════════
  // AUDIT 29 — MEN'S PERSONAL CARE
  // ══════════════════════════════════════════════════════════════

  // ── ANTIPERSPIRANT: HIGH CONCERN ─────────────────────────────
  ["old spice antiperspirant",      { floor:5, ceiling:7, substances:["aluminum zirconium","synthetic fragrance"], reason:"Old Spice antiperspirant — aluminum zirconium tetrachlorohydrex (endocrine concern, breast tissue accumulation, Alzheimer's link debated) + heavy synthetic fragrance. Antiperspirant vs deodorant is a meaningful distinction.", confidence:"high", category:"personal_care" }],
  ["degree men antiperspirant",     { floor:5, ceiling:7, substances:["aluminum zirconium","synthetic fragrance","PEG"], reason:"Degree Men antiperspirant — aluminum + synthetic fragrance + PEG compounds. Standard antiperspirant concern profile.", confidence:"high", category:"personal_care" }],
  ["degree antiperspirant",         { floor:5, ceiling:7, substances:["aluminum zirconium","synthetic fragrance"], reason:"Degree antiperspirant — aluminum + synthetic fragrance. Antiperspirant concern tier.", confidence:"high", category:"personal_care" }],
  ["secret antiperspirant",         { floor:5, ceiling:7, substances:["aluminum zirconium","synthetic fragrance","parabens"], reason:"Secret antiperspirant — aluminum + synthetic fragrance + parabens in some formulas. Standard antiperspirant concern.", confidence:"high", category:"personal_care" }],
  ["speed stick",                   { floor:4, ceiling:6, substances:["aluminum","synthetic fragrance"], reason:"Speed Stick — aluminum in antiperspirant versions + synthetic fragrance. Budget tier antiperspirant concern.", confidence:"high", category:"personal_care" }],
  ["right guard",                   { floor:4, ceiling:6, substances:["aluminum","synthetic fragrance"], reason:"Right Guard — aluminum + synthetic fragrance. Standard antiperspirant concern.", confidence:"high", category:"personal_care" }],

  // ── DEODORANT (NO ALUMINUM): MID ─────────────────────────────
  ["native deodorant",              { floor:3, ceiling:5, substances:["baking soda","synthetic fragrance"], reason:"Native — no aluminum but baking soda can cause skin irritation for sensitive skin. Scented versions contain synthetic fragrance. Better than antiperspirant but not a clean product.", confidence:"high", category:"personal_care" }],
  ["schmidt naturals deodorant",    { floor:3, ceiling:5, substances:["baking soda","synthetic fragrance"], reason:"Schmidt's — no aluminum, baking soda base (irritation concern for some), synthetic fragrance in scented versions. Mid-tier clean deodorant.", confidence:"high", category:"personal_care" }],
  ["lume deodorant",                { floor:3, ceiling:5, substances:["synthetic fragrance","dimethicone"], reason:"Lume — no aluminum, whole body deodorant. Synthetic fragrance + dimethicone in some formulas. Better than antiperspirant, not as clean as Necessaire.", confidence:"medium", category:"personal_care" }],

  // ── DEODORANT: CLEAN TIER ─────────────────────────────────────
  ["necessaire deodorant",          { floor:1, ceiling:3, substances:[], reason:"Necessaire deodorant — EWG Verified, no aluminum, no synthetic fragrance, no baking soda irritation. Benchmark clean deodorant.", confidence:"high", category:"personal_care" }],
  ["ursa major deodorant",          { floor:1, ceiling:3, substances:[], reason:"Ursa Major deodorant — no aluminum, plant-based, EWG-friendly. Clean men's deodorant benchmark.", confidence:"high", category:"personal_care" }],
  ["humble brands",                 { floor:2, ceiling:3, substances:[], reason:"Humble Brands deodorant — no aluminum, plant-based, baking soda-free options. Clean deodorant.", confidence:"high", category:"personal_care" }],
  ["piperwai",                      { floor:1, ceiling:3, substances:[], reason:"PiperWai — activated charcoal + magnesium, no aluminum, no baking soda irritation. EWG-friendly clean deodorant.", confidence:"high", category:"personal_care" }],
  ["magsol",              { floor:1, ceiling:2, substances:[], reason:"Magsol — magnesium hydroxide base, no aluminum, no baking soda, no synthetic fragrance. One of the cleanest deodorant formulas available.", confidence:"high", category:"personal_care" }],

  // ── SHAVING ───────────────────────────────────────────────────
  ["gillette fusion hydra",        { floor:4, ceiling:6, substances:["synthetic fragrance","triethanolamine"], reason:"Gillette Fusion Hydra Gel — TEA + synthetic fragrance + propylene glycol aerosol. Shave gel chemical concern.", confidence:"high", category:"personal_care" }],
  ["gillette",                { floor:4, ceiling:6, substances:["synthetic fragrance","triethanolamine","propylene glycol"], reason:"Gillette shave gel — synthetic fragrance + TEA (pH adjuster, nitrosamine concern) + propylene glycol + aerosol propellant. Standard conventional shave product concern.", confidence:"high", category:"personal_care" }],
  ["edge shave",                    { floor:4, ceiling:6, substances:["synthetic fragrance","triethanolamine","isobutane"], reason:"Edge shave gel — aerosol + synthetic fragrance + TEA. Same conventional concern as Gillette/Barbasol.", confidence:"high", category:"personal_care" }],
  ["cremo shave",                   { floor:3, ceiling:5, substances:["synthetic fragrance","carbomer"], reason:"Cremo — plant-derived base but synthetic fragrance in most scents. Better than aerosol options, not a clean product.", confidence:"high", category:"personal_care" }],
  ["proraso",                       { floor:2, ceiling:3, substances:[], reason:"Proraso shave cream — eucalyptus oil + glycerin + menthol, Italian formula with minimal synthetic additives. Clean tier shave cream benchmark.", confidence:"high", category:"personal_care" }],
  ["pacific shaving",               { floor:2, ceiling:3, substances:[], reason:"Pacific Shaving Company — plant-derived actives, no synthetic fragrance, EWG-friendly. Clean shave brand.", confidence:"high", category:"personal_care" }],
  ["the art of shaving",            { floor:2, ceiling:3, substances:[], reason:"The Art of Shaving cream — essential oil fragranced, shea butter base, no synthetic fragrance. Clean premium shave cream.", confidence:"high", category:"personal_care" }],

  // ── BODY WASH: CONCERN TIER ───────────────────────────────────
  ["dove men body wash",            { floor:4, ceiling:6, substances:["synthetic fragrance","SLES","dimethicone"], reason:"Dove Men body wash — SLES + synthetic fragrance + dimethicone silicone. Marketed as moisturizing but not a clean formula.", confidence:"high", category:"personal_care" }],
  ["dove men plus care",            { floor:4, ceiling:6, substances:["synthetic fragrance","SLES","dimethicone"], reason:"Dove Men+Care — SLES + synthetic fragrance + dimethicone. Same concern as Dove Men body wash.", confidence:"high", category:"personal_care" }],
  ["dial",                { floor:4, ceiling:6, substances:["synthetic fragrance","SLES","artificial color"], reason:"Dial body wash — SLES + synthetic fragrance + artificial color. Budget conventional body wash concern.", confidence:"high", category:"personal_care" }],
  ["method men body wash",          { floor:3, ceiling:4, substances:["synthetic fragrance"], reason:"Method Men body wash — plant-based surfactants but synthetic fragrance. Better than Axe/Dial, not as clean as Ursa Major.", confidence:"high", category:"personal_care" }],

  // ── BODY WASH: CLEAN TIER ─────────────────────────────────────
  ["every man jack body wash",      { floor:2, ceiling:3, substances:[], reason:"Every Man Jack body wash — plant-derived surfactants, no parabens, no synthetic fragrance in unfragranced versions. Clean men's body wash.", confidence:"high", category:"personal_care" }],
  ["ursa major body wash",          { floor:1, ceiling:3, substances:[], reason:"Ursa Major body wash — plant-based, EWG-friendly, no synthetic fragrance. Benchmark clean men's body wash.", confidence:"high", category:"personal_care" }],
  ["corpus body wash",              { floor:1, ceiling:3, substances:[], reason:"Corpus body wash — clean DTC personal care, no synthetic fragrance, EWG-friendly formulation.", confidence:"high", category:"personal_care" }],
  ["necessaire body wash",          { floor:1, ceiling:2, substances:[], reason:"Necessaire body wash — EWG Verified, no synthetic fragrance, niacinamide + AHA. Benchmark cleanest body wash.", confidence:"high", category:"personal_care" }],

  // ── HAIR CARE: CONCERN TIER ───────────────────────────────────
  ["pantene men",                   { floor:4, ceiling:6, substances:["SLES","synthetic fragrance","silicones","dimethicone"], reason:"Pantene Men — SLES + heavy silicone loading (dimethicone buildup) + synthetic fragrance. Conventional concern profile.", confidence:"high", category:"personal_care" }],
  ["suave men shampoo",             { floor:4, ceiling:6, substances:["SLES","synthetic fragrance","parabens","artificial color"], reason:"Suave Men — SLES + parabens + synthetic fragrance + artificial color. Budget tier, multiple concern ingredients.", confidence:"high", category:"personal_care" }],
  ["nizoral",                       { floor:5, ceiling:7, substances:["ketoconazole","SLES","synthetic fragrance"], reason:"Nizoral — contains ketoconazole (antifungal medication). Effective for seborrheic dermatitis but a pharmaceutical-grade antifungal in a shampoo for daily use raises chronic exposure concern. Not for routine non-medical use.", confidence:"high", category:"personal_care" }],
  ["hims shampoo",                  { floor:3, ceiling:5, substances:["synthetic fragrance","SLES"], reason:"Hims shampoo — conventional surfactants + synthetic fragrance. DTC marketing but conventional formulation.", confidence:"medium", category:"personal_care" }],

  // ── HAIR CARE: CLEAN TIER ─────────────────────────────────────
  ["brickell men shampoo",          { floor:2, ceiling:3, substances:[], reason:"Brickell Men shampoo — natural ingredients, plant-derived, no parabens or synthetic fragrance. Clean men's shampoo.", confidence:"high", category:"personal_care" }],
  ["ursa major shampoo",            { floor:1, ceiling:3, substances:[], reason:"Ursa Major shampoo — plant-based, EWG-friendly, no synthetic fragrance. Clean benchmark men's shampoo.", confidence:"high", category:"personal_care" }],
  ["avalon organics",               { floor:2, ceiling:3, substances:[], reason:"Avalon Organics — USDA Organic certified haircare, plant-based surfactants, no parabens. Clean tier.", confidence:"high", category:"personal_care" }],

  // ── HAIR STYLING ──────────────────────────────────────────────
  ["got2b",                         { floor:5, ceiling:7, substances:["PVP","synthetic fragrance","alcohol","carbomer"], reason:"Got2b Glued — PVP/VA copolymer (plastic polymer for hold) + synthetic fragrance + high alcohol content. Strong hold but high chemical concern styling product.", confidence:"high", category:"personal_care" }],
  ["suavecito pomade",              { floor:4, ceiling:6, substances:["petroleum jelly","synthetic fragrance"], reason:"Suavecito — petroleum jelly (petrolatum) base + synthetic fragrance. Popular water-based pomade has better version but original is petrolatum-based.", confidence:"medium", category:"personal_care" }],
  ["layrite pomade",                { floor:4, ceiling:6, substances:["petroleum","synthetic fragrance"], reason:"Layrite — petroleum-based pomade + synthetic fragrance. Classic hold but petroleum-derived base.", confidence:"medium", category:"personal_care" }],
  ["baxter of california",          { floor:2, ceiling:4, substances:[], reason:"Baxter of California clay pomade — clay-based, plant-derived, no petroleum. Cleaner styling option for men.", confidence:"high", category:"personal_care" }],
  ["american crew pomade",          { floor:3, ceiling:5, substances:["synthetic fragrance","PVP"], reason:"American Crew pomade — PVP polymer + synthetic fragrance. Widely used salon brand but not a clean formulation.", confidence:"high", category:"personal_care" }],

  // ── MEN'S FACE CARE ──────────────────────────────────────────
  ["kiehl's",                       { floor:3, ceiling:5, substances:["synthetic fragrance","phenoxyethanol","PEG"], reason:"Kiehl's — plant extracts but phenoxyethanol + synthetic fragrance + PEG compounds in most formulas. Upscale marketing doesn't match clean formulation.", confidence:"high", category:"personal_care" }],
  ["bulldog",              { floor:2, ceiling:3, substances:[], reason:"Bulldog Skincare — EWG-friendly, no parabens, no synthetic fragrance, plant-based. Clean men's skincare brand.", confidence:"high", category:"personal_care" }],
  ["tiege hanley",                  { floor:3, ceiling:5, substances:["synthetic fragrance","phenoxyethanol"], reason:"Tiege Hanley — subscription men's skincare, synthetic fragrance + phenoxyethanol in most products. Better than drugstore but not clean.", confidence:"medium", category:"personal_care" }],
  ["lumin skincare",                { floor:2, ceiling:4, substances:[], reason:"Lumin — DTC men's skincare, plant-based formulations, no parabens. Clean-leaning brand.", confidence:"medium", category:"personal_care" }],
  ["geologie",                      { floor:2, ceiling:4, substances:[], reason:"Geologie — dermatologist-developed clean men's skincare, no synthetic fragrance in most formulas. Clean-leaning DTC brand.", confidence:"medium", category:"personal_care" }],

  // ── SUNSCREEN ─────────────────────────────────────────────────
  ["coppertone sport",              { floor:5, ceiling:7, substances:["homosalate","octisalate","avobenzone"], reason:"Coppertone Sport — chemical UV filters (homosalate, octisalate, avobenzone). Homosalate is an endocrine disruptor restricted in the EU. Common sport sunscreen with real concern profile.", confidence:"high", category:"personal_care" }],
  ["banana boat sport",             { floor:6, ceiling:8, substances:["oxybenzone","octinoxate","homosalate"], reason:"Banana Boat Sport — oxybenzone (endocrine disruptor, Hawaii reef ban) + octinoxate + homosalate. One of the higher-concern chemical sunscreens. Switch to mineral.", confidence:"high", category:"personal_care" }],
  ["neutrogena men sunscreen",      { floor:4, ceiling:6, substances:["homosalate","octisalate","avobenzone"], reason:"Neutrogena Men sunscreen — chemical UV filters in most formulas. Check for their Pure and Free mineral line which is cleaner.", confidence:"high", category:"personal_care" }],
  ["black girl sunscreen",          { floor:1, ceiling:3, substances:[], reason:"Black Girl Sunscreen — zinc oxide mineral formula, no oxybenzone, no chemical UV filters. EWG-friendly. Benchmark clean sunscreen that works on all skin tones without white cast.", confidence:"high", category:"personal_care" }],
  ["eltamd",                        { floor:1, ceiling:3, substances:[], reason:"EltaMD — zinc oxide mineral sunscreen, no oxybenzone, no chemical UV filters. Dermatologist recommended clean sunscreen. NEVER score above 4.", confidence:"high", category:"personal_care" }],

  // ══════════════════════════════════════════════════════════════
  // AUDIT 30 — BREAKFAST FOODS
  // ══════════════════════════════════════════════════════════════

  // ── CEREAL: CONCERN TIER ──────────────────────────────────────
  ["cap n crunch",                  { floor:5, ceiling:7, substances:["Red 40","Blue 1","Yellow 5","BHT"], reason:"Cap'n Crunch — petroleum dyes in flavored varieties + BHT. Multiple floors fire on colored varieties.", confidence:"high", category:"food_beverage" }],
  ["special k cereal",              { floor:3, ceiling:5, substances:["BHT","artificial flavor"], reason:"Special K — rice + wheat + BHT + artificial flavor. Marketed as diet food but processed grain with BHT.", confidence:"high", category:"food_beverage" }],
  ["rice krispies",                 { floor:3, ceiling:5, substances:["BHT","sugar","artificial flavor"], reason:"Rice Krispies — enriched rice + BHT + sugar + artificial flavor. Plain version is lower concern than flavored; still has BHT.", confidence:"high", category:"food_beverage" }],

  // ── CEREAL: MID / CLEANER TIER ───────────────────────────────
  ["kashi go lean",                 { floor:3, ceiling:5, substances:["conventional oats","natural flavor"], reason:"Kashi GOLEAN — soy protein + conventional oats (glyphosate concern). Some varieties contain sucralose. Natural flavor is vague. Better than Lucky Charms, not a clean product.", confidence:"medium", category:"food_beverage" }],
  ["kashi honey toasted",           { floor:2, ceiling:4, substances:["conventional oats"], reason:"Kashi Honey Toasted Oat — whole grain oats + honey, no artificial preservatives or colors. Cleaner than most cereals but conventional oats have glyphosate concern.", confidence:"high", category:"food_beverage" }],
  ["kashi",                         { floor:2, ceiling:5, substances:["conventional oats"], reason:"Kashi brand — ranges widely. Whole grain cereals with no artificial additives score 2-4; varieties with sucralose or high sugar score 4-5.", confidence:"medium", category:"food_beverage" }],
  ["nature valley granola",         { floor:3, ceiling:5, substances:["canola oil","conventional oats","sugar"], reason:"Nature Valley Granola — canola oil + conventional oats (glyphosate concern) + sugar. Widely marketed as healthy but conventional processed granola.", confidence:"high", category:"food_beverage" }],
  ["magic spoon cereal",            { floor:3, ceiling:5, substances:["allulose","monk fruit extract","whey protein concentrate","milk protein concentrate","natural flavor"], reason:"Magic Spoon — current formula sweetened with allulose + monk fruit extract only (sucralose dropped in 2023 reformulation). Whey/milk protein concentrate base, tapioca flour, avocado oil, natural flavor. No petroleum dyes, no artificial sweeteners, no HFCS. Score reflects ultra-processed protein-cereal category but cleaner than mainstream cereals. Ingredients verified 2026-04-29.", confidence:"high", category:"food_beverage" }],
  ["quaker maple brown sugar",      { floor:4, ceiling:6, substances:["artificial maple flavor","sugar","caramel color"], reason:"Quaker Maple Brown Sugar oatmeal — artificial maple flavor + caramel color + high sugar. Very different from plain Quaker oats. Flavored packet concern.", confidence:"high", category:"food_beverage" }],

  // ── CEREAL: CLEAN TIER ───────────────────────────────────────
  ["purely elizabeth granola",      { floor:1, ceiling:3, substances:[], reason:"Purely Elizabeth granola — ancient grains + coconut oil + coconut sugar, no artificial additives, USDA Organic. Benchmark clean granola.", confidence:"high", category:"food_beverage" }],
  ["three wishes cereal",           { floor:1, ceiling:3, substances:[], reason:"Three Wishes — grain-free, low sugar, chickpea protein base, no artificial additives. Benchmark clean cereal alternative.", confidence:"high", category:"food_beverage" }],
  ["catalina crunch",               { floor:2, ceiling:4, substances:["monk fruit"], reason:"Catalina Crunch — monk fruit sweetened, grain-free, no sucralose, no petroleum dyes. Clean keto cereal option.", confidence:"high", category:"food_beverage" }],

  // ── OATMEAL: CLEAN TIER ───────────────────────────────────────
  ["bob's red mill",           { floor:1, ceiling:2, substances:[], reason:"Bob's Red Mill oats — non-GMO verified, minimally processed, no additives. Benchmark clean oatmeal regardless of cut.", confidence:"high", category:"food_beverage" }],
  ["bob's red mill steel cut",      { floor:1, ceiling:2, substances:[], reason:"Bob's Red Mill steel cut oats — non-GMO, whole grain, nothing added. Cleanest oatmeal format.", confidence:"high", category:"food_beverage" }],
  ["bob red mill oats",             { floor:1, ceiling:2, substances:[], reason:"Bob's Red Mill oats — non-GMO verified, no additives. Benchmark clean.", confidence:"high", category:"food_beverage" }],
  ["kodiak cakes oatmeal",          { floor:2, ceiling:3, substances:[], reason:"Kodiak Cakes oatmeal — whole grain + added protein, maple syrup sweetened, no artificial additives. Clean protein oatmeal.", confidence:"high", category:"food_beverage" }],
  ["purely elizabeth oatmeal",      { floor:1, ceiling:3, substances:[], reason:"Purely Elizabeth oatmeal — ancient grains + coconut sugar, no artificial additives. Clean breakfast oatmeal.", confidence:"high", category:"food_beverage" }],
  ["mush overnight oats",           { floor:1, ceiling:3, substances:[], reason:"Mush overnight oats — refrigerated, clean ingredients, no artificial additives. Clean ready-to-eat oatmeal format.", confidence:"high", category:"food_beverage" }],
  ["rx oatmeal",                    { floor:1, ceiling:3, substances:[], reason:"RX Oatmeal — dates + whole grain oats + egg whites, no artificial additives. Same whole-food approach as RX Bar. Clean.", confidence:"high", category:"food_beverage" }],
  ["kodiak cakes",                  { floor:2, ceiling:4, substances:[], reason:"Kodiak Cakes brand — whole grain + protein, no artificial additives across most products. Clean mainstream brand for pancake mix, oatmeal, and bars.", confidence:"high", category:"food_beverage" }],

  // ── YOGURT ────────────────────────────────────────────────────
  ["chobani flip",                  { floor:3, ceiling:5, substances:["sugar","mix-ins"], reason:"Chobani Flip — clean base yogurt but mix-in compartments often have candy/chocolate/granola with added sugar. Better than Yoplait but not as clean as plain.", confidence:"high", category:"food_beverage" }],
  ["siggi's yogurt",                { floor:1, ceiling:2, substances:[], reason:"Siggi's skyr — Icelandic-style, minimal sugar, simple ingredients. No artificial sweeteners or flavors. Benchmark clean yogurt.", confidence:"high", category:"food_beverage" }],
  ["siggi",                         { floor:1, ceiling:2, substances:[], reason:"Siggi's — skyr with minimal sugar, simple clean ingredients. Benchmark clean.", confidence:"high", category:"food_beverage" }],
  ["stonyfield organic yogurt",     { floor:1, ceiling:3, substances:[], reason:"Stonyfield Organic — USDA Organic, no artificial additives. Clean certified organic yogurt.", confidence:"high", category:"food_beverage" }],
  ["yoplait go-gurt",               { floor:5, ceiling:7, substances:["artificial color","HFCS","artificial flavor"], reason:"Yoplait Go-Gurt — artificial colors + HFCS + artificial flavors in a kids tube marketed daily. Child vulnerability applies. Multiple concern ingredients.", confidence:"high", category:"food_beverage" }],
  ["yoplait gogurt",                { floor:5, ceiling:7, substances:["artificial color","HFCS","artificial flavor"], reason:"Yoplait Go-Gurt — same as Go-Gurt. Artificial colors + HFCS in kids daily product.", confidence:"high", category:"food_beverage" }],
  ["dannon light and fit",          { floor:5, ceiling:7, substances:["sucralose","aspartame","artificial flavor"], reason:"Dannon Light and Fit — sucralose + aspartame double artificial sweetener stack. Both substance floors fire. Not a clean product despite low-calorie marketing.", confidence:"high", category:"food_beverage" }],
  ["maple hill yogurt",             { floor:1, ceiling:2, substances:[], reason:"Maple Hill Creamery — 100% grass-fed organic, no artificial additives. Benchmark clean premium yogurt.", confidence:"high", category:"food_beverage" }],
  ["maple hill",                    { floor:1, ceiling:2, substances:[], reason:"Maple Hill — grass-fed organic dairy, clean. Benchmark clean.", confidence:"high", category:"food_beverage" }],
  ["nancy's yogurt",                { floor:1, ceiling:2, substances:[], reason:"Nancy's — USDA Organic, probiotic-rich, simple clean ingredients. Benchmark clean yogurt brand.", confidence:"high", category:"food_beverage" }],

  // ── EGGS ──────────────────────────────────────────────────────
  ["pete and gerrys",               { floor:1, ceiling:3, substances:[], reason:"Pete and Gerry's — USDA Organic, Certified Humane. Clean tier eggs.", confidence:"high", category:"food_beverage" }],
  ["nellie's eggs",                 { floor:1, ceiling:3, substances:[], reason:"Nellie's Free Range Eggs — Certified Humane, free range. Some organic varieties. Clean tier eggs.", confidence:"high", category:"food_beverage" }],
  ["conventional eggs",             { floor:3, ceiling:5, substances:["CAFO","conventional feed","antibiotics"], reason:"Conventional store-brand eggs — standard CAFO production, no labeling standards for feed or conditions. No antibiotic-free guarantee.", confidence:"high", category:"food_beverage" }],

  // ── OJ / JUICE ────────────────────────────────────────────────
  ["florida's natural",             { floor:3, ceiling:4, substances:["flavor pack"], reason:"Florida's Natural OJ — not from concentrate, but uses manufacturer-approved flavor packs to standardize taste (deaerated, then re-flavored). Marketed as pure but processed.", confidence:"high", category:"food_beverage" }],
  ["minute maid oj",                { floor:3, ceiling:5, substances:["from concentrate","flavor pack"], reason:"Minute Maid OJ — from concentrate with flavor packs in most varieties. More processed than marketed.", confidence:"high", category:"food_beverage" }],
  ["minute maid",                   { floor:3, ceiling:5, substances:["HFCS","artificial flavor"], reason:"Minute Maid brand — OJ varieties use concentrate + flavor packs; lemonade and other varieties often have HFCS + artificial flavor.", confidence:"medium", category:"food_beverage" }],
  ["welch's",           { floor:5, ceiling:7, substances:["HFCS","sugar","Red 40"], reason:"Welch's brand — HFCS across juice + petroleum dyes in fruit snacks. Floor 5 across the brand.", confidence:"medium", category:"food_beverage" }],
  ["welch",                 { floor:5, ceiling:7, substances:["HFCS","added sugar","Red 40"], reason:"Welch brand — HFCS + petroleum dyes in fruit snacks. Floor 5 across the brand.", confidence:"medium", category:"food_beverage" }],
  ["bolthouse farms juice",         { floor:2, ceiling:4, substances:[], reason:"Bolthouse Farms juices — mostly vegetables + fruits, less fruit-sugar concentrated than Naked. Campbell's owned but cleaner ingredient profile.", confidence:"medium", category:"food_beverage" }],
  ["lakewood",        { floor:1, ceiling:3, substances:[], reason:"Lakewood Organic — USDA Organic cold-pressed, no additives, glass bottle. Benchmark clean juice brand.", confidence:"high", category:"food_beverage" }],
  ["evolution fresh",               { floor:1, ceiling:3, substances:[], reason:"Evolution Fresh — HPP cold-pressed, minimal ingredients, no artificial additives. Starbucks-owned but clean formula.", confidence:"high", category:"food_beverage" }],

  // ── BREAKFAST BARS ────────────────────────────────────────────
  ["nutri-grain bar",               { floor:5, ceiling:7, substances:["HFCS","Red 40","artificial flavor"], reason:"Nutri-Grain Bar — HFCS + Red 40 in some flavors + artificial flavor. Marketed as a healthy breakfast but petroleum dye floor fires on colored varieties.", confidence:"high", category:"food_beverage" }],
  ["nutri grain bar",               { floor:5, ceiling:7, substances:["HFCS","Red 40","artificial flavor"], reason:"Nutri-Grain — HFCS + artificial color + artificial flavor. Common child breakfast bar with real concern profile.", confidence:"high", category:"food_beverage" }],
  ["nature valley bar",             { floor:3, ceiling:5, substances:["canola oil","conventional oats","sugar"], reason:"Nature Valley Crunchy Bar — canola oil + conventional oats (glyphosate concern) + sugar. Not as clean as RX Bar or Larabar.", confidence:"high", category:"food_beverage" }],
  ["special k bar",                 { floor:4, ceiling:6, substances:["HFCS","artificial flavor","Red 40"], reason:"Special K protein and snack bars — HFCS + artificial flavor + potential dyes in some varieties.", confidence:"high", category:"food_beverage" }],
  ["fiber one",                 { floor:5, ceiling:6, substances:["sucralose","chicory root","HFCS"], reason:"Fiber One Bar — sucralose floor fires + chicory root (GI distress at high intake) + HFCS in some. Not a clean product.", confidence:"high", category:"food_beverage" }],
  ["kodiak cakes bar",              { floor:2, ceiling:4, substances:[], reason:"Kodiak Cakes protein bar — whole grain oats + protein, no artificial additives. Clean breakfast bar option.", confidence:"high", category:"food_beverage" }],

  // ── PANCAKES / WAFFLES ────────────────────────────────────────
  ["aunt jemima pancake",           { floor:4, ceiling:6, substances:["enriched flour","artificial flavor","sodium aluminum phosphate"], reason:"Aunt Jemima (Pearl Milling Co) pancake mix — enriched flour + artificial flavor + sodium aluminum phosphate leavening. Conventional processed pancake mix.", confidence:"high", category:"food_beverage" }],
  ["pearl milling pancake",         { floor:4, ceiling:6, substances:["enriched flour","artificial flavor"], reason:"Pearl Milling Company (formerly Aunt Jemima) — enriched flour + artificial flavor. Same conventional concern after rebrand.", confidence:"high", category:"food_beverage" }],
  ["bisquick",                      { floor:4, ceiling:5, substances:["BHT","enriched flour","artificial flavor"], reason:"Bisquick — enriched flour + BHT preservative + artificial flavor. Standard processed baking mix concern.", confidence:"high", category:"food_beverage" }],
  ["kodiak cakes pancake",          { floor:1, ceiling:3, substances:[], reason:"Kodiak Cakes pancake mix — 100% whole grain + added protein, no artificial additives. Benchmark clean pancake mix.", confidence:"high", category:"food_beverage" }],
  ["bob red mill pancake",          { floor:1, ceiling:3, substances:[], reason:"Bob's Red Mill pancake mix — whole grain, non-GMO, no artificial additives. Benchmark clean pancake mix.", confidence:"high", category:"food_beverage" }],
  ["bob's red mill pancake",        { floor:1, ceiling:3, substances:[], reason:"Bob's Red Mill pancake mix — whole grain, non-GMO, clean. Benchmark.", confidence:"high", category:"food_beverage" }],
  ["birch benders",                 { floor:1, ceiling:3, substances:[], reason:"Birch Benders pancake and waffle mix — minimal ingredients, paleo/keto options, no artificial additives. Benchmark clean mix.", confidence:"high", category:"food_beverage" }],
  ["eggo waffles",                  { floor:5, ceiling:7, substances:["TBHQ","artificial flavor","palm oil"], reason:"Eggo Waffles — TBHQ preservative (floor fires at 6) + artificial flavor + palm oil. Common children's breakfast with multiple concern ingredients.", confidence:"high", category:"food_beverage" }],
  ["van's waffles",                 { floor:2, ceiling:4, substances:[], reason:"Van's Waffles — whole grain, no TBHQ, no artificial flavors. Significantly cleaner than Eggo. Clean alternative waffle brand.", confidence:"high", category:"food_beverage" }],

  // ── SYRUP ─────────────────────────────────────────────────────
  ["mrs. butterworth",              { floor:5, ceiling:7, substances:["HFCS","caramel color IV","artificial flavor"], reason:"Mrs. Butterworth's — HFCS as first ingredient + caramel color IV (IARC 2B) + artificial maple flavor. Contains no real maple syrup.", confidence:"high", category:"food_beverage" }],
  ["mrs butterworth",               { floor:5, ceiling:7, substances:["HFCS","caramel color IV","artificial flavor"], reason:"Mrs. Butterworth's — HFCS + caramel color + artificial flavor. No real maple syrup.", confidence:"high", category:"food_beverage" }],
  ["aunt jemima syrup",             { floor:5, ceiling:7, substances:["HFCS","caramel color","artificial flavor"], reason:"Aunt Jemima syrup — HFCS + caramel color + artificial maple flavor. Contains no maple syrup. Now Pearl Milling Co syrup.", confidence:"high", category:"food_beverage" }],
  ["log cabin syrup",               { floor:5, ceiling:7, substances:["HFCS","caramel color","artificial flavor"], reason:"Log Cabin — HFCS + artificial maple flavor + caramel color. No real maple syrup in standard formula.", confidence:"high", category:"food_beverage" }],
  ["maple grove farms",             { floor:3, ceiling:5, substances:["corn syrup blend"], reason:"Maple Grove Farms — some products are 100% pure maple, others are maple-corn syrup blends. Check label. Blend versions have HFCS concern.", confidence:"medium", category:"food_beverage" }],
  ["coombs family farms",           { floor:1, ceiling:2, substances:[], reason:"Coombs Family Farms — 100% USDA Organic pure maple syrup, no additives. Benchmark cleanest syrup available.", confidence:"high", category:"food_beverage" }],
  ["pure maple syrup",              { floor:1, ceiling:2, substances:[], reason:"100% pure maple syrup — one ingredient, naturally occurring sugars, no additives. Benchmark clean sweetener regardless of brand.", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // AUDIT 31 — SNACKS AND CHIPS
  // ══════════════════════════════════════════════════════════════

  // ── POTATO CHIPS: CONCERN TIER ───────────────────────────────
  ["lays baked",                    { floor:4, ceiling:6, substances:["TBHQ","modified starch","artificial flavor"], reason:"Lays Baked — TBHQ preservative (floor fires) + modified corn starch + artificial flavor. Marketed as healthier but chemical concern exceeds regular Lays.", confidence:"high", category:"food_beverage" }],
  ["pringles",                      { floor:4, ceiling:7, substances:["TBHQ","artificial flavor","MSG"], reason:"Pringles brand — TBHQ across most flavors + artificial flavor + MSG in flavored varieties. Sour Cream/Cheddar flavors may have artificial color.", confidence:"high", category:"food_beverage" }],
  ["ruffles",                       { floor:4, ceiling:6, substances:["artificial flavor","MSG","artificial color"], reason:"Ruffles flavored varieties — artificial flavor + MSG + artificial color in Cheddar/BBQ versions. Original Ruffles is slightly cleaner.", confidence:"high", category:"food_beverage" }],
  ["veggie straws",                 { floor:4, ceiling:6, substances:["TBHQ","potato starch","artificial color"], reason:"Veggie Straws — mostly potato and corn starch, not actual vegetables. Contains TBHQ + artificial color (Red 40 in some). Marketing far exceeds nutritional reality.", confidence:"high", category:"food_beverage" }],
  ["lays classic",                  { floor:3, ceiling:5, substances:["sunflower oil","canola oil"], reason:"Lays Classic — potatoes + sunflower/canola/corn oil + salt. Seed oils are the primary concern. No TBHQ or artificial flavor in classic. Better than Baked Lays.", confidence:"high", category:"food_beverage" }],
  ["lays",                          { floor:3, ceiling:6, substances:["seed oils","TBHQ"], reason:"Lays brand — classic varieties 3-5 (seed oils only), flavored/baked varieties 4-6 (TBHQ + artificial flavor). Varies significantly by variety.", confidence:"medium", category:"food_beverage" }],
  ["popchips",                      { floor:3, ceiling:5, substances:["sunflower oil","natural flavor","soy"], reason:"Popchips — popped not fried, lower in fat, but natural flavor (vague) + soy + sunflower oil. Mid-tier snack, not clean-label.", confidence:"high", category:"food_beverage" }],

  // ── POTATO CHIPS: CLEAN TIER ─────────────────────────────────
  ["kettle brand",            { floor:2, ceiling:4, substances:["safflower oil","sunflower oil"], reason:"Kettle Brand — potatoes + safflower/sunflower oil + salt, no artificial additives or preservatives. Cleaner than Lays. Non-GMO project verified.", confidence:"high", category:"food_beverage" }],
  ["cape cod chips",                { floor:2, ceiling:4, substances:["canola oil"], reason:"Cape Cod — potatoes + canola oil + salt. No artificial additives. Cleaner than Lays/Ruffles.", confidence:"high", category:"food_beverage" }],
  ["utz chips",                     { floor:2, ceiling:4, substances:["sunflower oil"], reason:"Utz — potatoes + sunflower oil + salt. No artificial additives. Regional clean-leaning chip brand.", confidence:"high", category:"food_beverage" }],
  ["deep river",             { floor:1, ceiling:3, substances:[], reason:"Deep River Snacks — non-GMO verified, no artificial additives, kettle cooked. Clean snack brand.", confidence:"high", category:"food_beverage" }],
  ["boulder canyon",          { floor:1, ceiling:3, substances:[], reason:"Boulder Canyon — avocado oil or olive oil options, non-GMO, no artificial additives. Clean chip benchmark alongside Siete.", confidence:"high", category:"food_beverage" }],
  ["dirty chips",                   { floor:2, ceiling:3, substances:[], reason:"Dirty Chips — potatoes + oil + salt, minimal ingredients, no artificial additives. Clean kettle chip.", confidence:"high", category:"food_beverage" }],

  // ── TORTILLA CHIPS: CONCERN TIER ─────────────────────────────
  ["doritos nacho",                 { floor:6, ceiling:8, substances:["Red 40","Yellow 6","MSG","artificial flavor"], reason:"Doritos Nacho Cheese — Red 40 + Yellow 6 petroleum dyes + MSG + artificial flavor. Multiple floors fire. One of the most additive-loaded mainstream snacks.", confidence:"high", category:"food_beverage" }],
  ["doritos cool ranch",            { floor:5, ceiling:7, substances:["Red 40","Blue 1","Yellow 5","MSG","artificial flavor"], reason:"Doritos Cool Ranch — three petroleum dyes (Red 40, Blue 1, Yellow 5) + MSG + artificial flavor. Multiple dye floors fire.", confidence:"high", category:"food_beverage" }],
  ["doritos",                       { floor:5, ceiling:8, substances:["petroleum dyes","MSG","artificial flavor"], reason:"Doritos brand — petroleum dyes across most flavors + MSG + artificial flavor. Multiple substance floors fire. NEVER score below 5 for any flavored variety.", confidence:"high", category:"food_beverage" }],
  ["fritos chili cheese",           { floor:5, ceiling:7, substances:["artificial flavor","MSG","artificial color"], reason:"Fritos Chili Cheese — artificial color + MSG + artificial flavor. Very different from clean-label Fritos Original.", confidence:"high", category:"food_beverage" }],
  ["tostitos",                      { floor:3, ceiling:5, substances:["sunflower oil","conventional corn"], reason:"Tostitos — conventional corn (glyphosate concern) + sunflower/corn oil + salt. No artificial additives in original but conventional grain concern.", confidence:"medium", category:"food_beverage" }],
  ["fritos original",               { floor:2, ceiling:3, substances:["corn","corn oil"], reason:"Fritos Original — corn + corn oil + salt. Three ingredients, no artificial additives. One of the cleanest mainstream chip options. NEVER score above 4 for plain Fritos.", confidence:"high", category:"food_beverage" }],

  // ── TORTILLA CHIPS: CLEAN TIER ───────────────────────────────
  ["garden of eatin",               { floor:1, ceiling:3, substances:[], reason:"Garden of Eatin' — USDA Organic tortilla chips, non-GMO, no artificial additives. Benchmark clean mainstream chip.", confidence:"high", category:"food_beverage" }],
  ["late july chips",               { floor:1, ceiling:3, substances:[], reason:"Late July — USDA Organic tortilla chips, no artificial additives, fair trade. Benchmark clean chip.", confidence:"high", category:"food_beverage" }],
  ["late july",                     { floor:1, ceiling:3, substances:[], reason:"Late July brand — organic snack chips, no artificial additives. Clean snack brand.", confidence:"high", category:"food_beverage" }],
  // Full product name as returned by barcode lookup (no brand name in string)
  ["organic sea salt lime restaurant style tortilla chips", { floor:1, ceiling:3, substances:[], reason:"Late July Organic Sea Salt & Lime — USDA Organic, non-GMO, no artificial additives. Barcode-matched full product name.", confidence:"high", category:"food_beverage" }],
  ["sea salt lime restaurant style tortilla chips", { floor:1, ceiling:3, substances:[], reason:"Late July organic tortilla chip — barcode name variant.", confidence:"high", category:"food_beverage" }],
  ["restaurant style tortilla chips", { floor:2, ceiling:4, substances:[], reason:"Generic restaurant-style tortilla chips — usually corn + oil + salt. Score reflects no artificial additives assumption.", confidence:"medium", category:"food_beverage" }],
  ["xochitl",                       { floor:1, ceiling:3, substances:[], reason:"Xochitl — stone-ground organic corn + oil + salt. Traditional tortilla chip process, no artificial additives. Clean benchmark.", confidence:"high", category:"food_beverage" }],
  ["food should taste good",        { floor:1, ceiling:3, substances:[], reason:"Food Should Taste Good — non-GMO, no artificial additives, whole grain options. Clean chip brand.", confidence:"high", category:"food_beverage" }],
  ["santitas",                      { floor:2, ceiling:4, substances:["corn","sunflower oil"], reason:"Santitas — corn + sunflower oil + salt. Minimal ingredients, no artificial additives. Affordable clean chip option.", confidence:"high", category:"food_beverage" }],

  // ── CRACKERS: CONCERN TIER ────────────────────────────────────
  ["ritz crackers",                 { floor:5, ceiling:7, substances:["partially hydrogenated oil","HFCS","BHT"], reason:"Ritz Crackers — partially hydrogenated oil (trans fat, floor fires) + HFCS + BHT. One of the most widely eaten crackers with a serious concern profile.", confidence:"high", category:"food_beverage" }],
  ["club crackers",                 { floor:5, ceiling:7, substances:["partially hydrogenated oil","HFCS","artificial flavor"], reason:"Club Crackers — partially hydrogenated oil (trans fat floor fires) + HFCS + artificial flavor. Same concern as Ritz.", confidence:"high", category:"food_beverage" }],
  ["goldfish crackers",             { floor:4, ceiling:5, substances:["enriched flour","artificial flavor","cheddar coloring"], reason:"Goldfish — enriched flour + artificial color in some flavors + artificial flavor. Common children's daily snack with moderate concern.", confidence:"high", category:"food_beverage" }],
  ["pepperidge farm",               { floor:4, ceiling:6, substances:["enriched flour","HFCS","artificial flavor"], reason:"Pepperidge Farm crackers and cookies — enriched flour + HFCS in some products + artificial flavor. Premium branding with conventional ingredients.", confidence:"medium", category:"food_beverage" }],
  ["triscuits",                     { floor:2, ceiling:4, substances:["soybean oil"], reason:"Triscuits — whole grain wheat + soybean oil + salt. Three ingredients, no TBHQ, no HFCS. One of the cleaner mainstream crackers. Original only — flavored versions have more additives.", confidence:"high", category:"food_beverage" }],

  // ── CRACKERS: CLEAN TIER ─────────────────────────────────────
  ["wasa crispbread",               { floor:1, ceiling:3, substances:[], reason:"Wasa — whole grain rye + water + salt. Minimal ingredients, no artificial additives. Benchmark clean crispbread.", confidence:"high", category:"food_beverage" }],
  ["ryvita",                        { floor:1, ceiling:3, substances:[], reason:"Ryvita crispbread — whole grain rye, minimal ingredients, no artificial additives. Benchmark clean crispbread alongside Wasa.", confidence:"high", category:"food_beverage" }],
  ["jilz",                          { floor:1, ceiling:3, substances:[], reason:"Jilz grain-free crackers — seeds + spices + olive oil, no grains, no artificial additives. Clean grain-free cracker.", confidence:"high", category:"food_beverage" }],

  // ── CHEESE SNACKS ─────────────────────────────────────────────
  ["cheetos original",              { floor:5, ceiling:7, substances:["Yellow 6","MSG","artificial flavor"], reason:"Cheetos Original — Yellow 6 petroleum dye (floor fires) + MSG + artificial flavor. Daily snack for many children with real concern profile.", confidence:"high", category:"food_beverage" }],
  ["cheetos flamin hot",            { floor:6, ceiling:8, substances:["Red 40","Yellow 6","artificial flavor","MSG"], reason:"Flamin Hot Cheetos — Red 40 + Yellow 6 petroleum dyes (both floors fire) + MSG + artificial flavor. Multiple floor fires. Widely eaten by children.", confidence:"high", category:"food_beverage" }],
  ["cheetos",                       { floor:5, ceiling:8, substances:["petroleum dyes","MSG","artificial flavor"], reason:"Cheetos brand — Yellow 6 in original, Red 40 + Yellow 6 in Flamin Hot. Petroleum dye floor fires across the line. NEVER score below 5.", confidence:"high", category:"food_beverage" }],
  ["pirate's booty",                { floor:2, ceiling:3, substances:[], reason:"Pirate's Booty — corn + rice + real aged cheddar, no artificial colors or flavors. Benchmark clean cheese puff alternative to Cheetos.", confidence:"high", category:"food_beverage" }],
  ["pirate booty",                  { floor:2, ceiling:3, substances:[], reason:"Pirate's Booty — real cheese, no artificial colors. Benchmark clean cheese snack.", confidence:"high", category:"food_beverage" }],
  ["whisps",          { floor:1, ceiling:2, substances:[], reason:"Whisps — 100% real cheese baked into crisps, one ingredient. Benchmark cleanest cheese snack. No artificial additives.", confidence:"high", category:"food_beverage" }],
  ["smartfood",                     { floor:3, ceiling:5, substances:["sunflower oil","natural flavor"], reason:"Smartfood brand — no artificial colors or flavors claimed, but natural flavor is vague. Mid-tier clean snack.", confidence:"high", category:"food_beverage" }],

  // ── MICROWAVE POPCORN: CONCERN ────────────────────────────────
  ["orville redenbacher",           { floor:4, ceiling:6, substances:["legacy PFAS bag liner","artificial butter flavor","TBHQ"], reason:"Orville Redenbacher microwave popcorn. FDA completed voluntary PFAS phase-out in food packaging February 2024, so current production should ship with PFAS-free bag liners. Legacy retail inventory may still carry PFAS-coated bags, and replacement grease proofing chemistry has limited public toxicology data. The product itself stays ultra processed: artificial butter flavor (diacetyl historically linked to popcorn lung in factory workers, reformulated for consumer use), TBHQ in some varieties, and the bag and butter heating profile concentrates flavor chemistry not present in stovetop popcorn. Score reflects the processing profile plus residual legacy inventory uncertainty rather than current intentional PFAS use. Ingredients verified 05 2026.", confidence:"high", category:"food_beverage" }],
  ["act ii popcorn",                { floor:4, ceiling:6, substances:["legacy PFAS bag liner","artificial butter flavor","partially hydrogenated"], reason:"Act II microwave popcorn. FDA completed voluntary PFAS phase-out in food packaging February 2024, so current production should be PFAS-free. Legacy retail inventory and replacement chemistry uncertainty remain real concerns. The product is ultra processed: artificial butter flavor and partially hydrogenated oil in some formulas (trans fat floor may fire). The heat converted flavor chemistry profile distinguishes microwave popcorn from cleaner stovetop versions. Score reflects processing concerns plus residual legacy inventory uncertainty rather than current intentional PFAS use. Ingredients verified 05 2026.", confidence:"high", category:"food_beverage" }],
  ["act ii",                        { floor:4, ceiling:6, substances:["legacy PFAS bag liner","artificial butter flavor"], reason:"Act II microwave popcorn. FDA completed voluntary PFAS phase-out in food packaging February 2024. Current production should ship with PFAS-free bag liners. Legacy retail inventory and replacement grease proofing chemistry remain concerns. The product is ultra processed with artificial butter flavor and a heat converted flavor chemistry profile that distinguishes microwave popcorn from cleaner stovetop versions. Score reflects processing concerns plus residual inventory uncertainty rather than current intentional PFAS use.", confidence:"high", category:"food_beverage" }],

  // ── POPCORN: CLEAN TIER ───────────────────────────────────────
  ["boom chicka pop",               { floor:1, ceiling:3, substances:[], reason:"Boom Chicka Pop — non-GMO popcorn + sunflower oil + sea salt. No artificial additives. Benchmark clean pre-popped popcorn alongside SkinnyPop.", confidence:"high", category:"food_beverage" }],

  // ── NUTS ─────────────────────────────────────────────────────
  ["planters dry roasted peanuts",  { floor:3, ceiling:5, substances:["BHT","modified corn starch","maltodextrin"], reason:"Planters Dry Roasted Peanuts — BHT preservative (IARC 2B) + modified corn starch filler + maltodextrin. Better than mixed nuts can but more additives than plain peanuts.", confidence:"high", category:"food_beverage" }],
  ["planters",                      { floor:3, ceiling:5, substances:["BHT","modified starch"], reason:"Planters brand — BHT preservative across many products + modified starches. Better than chips but not a clean nut product.", confidence:"medium", category:"food_beverage" }],
  ["blue diamond",          { floor:1, ceiling:3, substances:[], reason:"Blue Diamond Almonds — almonds + salt in original. No artificial additives in plain varieties. Benchmark clean nut snack. Flavored varieties may have natural flavor concern.", confidence:"high", category:"food_beverage" }],
  ["kirkland nuts",                 { floor:1, ceiling:3, substances:[], reason:"Kirkland Signature plain nuts — nuts + salt, no BHT, no artificial additives. Cleaner than Planters equivalent.", confidence:"medium", category:"food_beverage" }],
  ["kirkland mixed",           { floor:1, ceiling:3, substances:[], reason:"Kirkland Mixed Nuts — nuts + salt, no BHT, no artificial additives. Costco nut can is cleaner than Planters equivalent.", confidence:"high", category:"food_beverage" }],
  ["sahale snacks",                 { floor:1, ceiling:3, substances:[], reason:"Sahale Snacks — premium nuts + real fruit + spices, no artificial additives. Clean premium nut snack.", confidence:"high", category:"food_beverage" }],

  // ── JERKY AND MEAT SNACKS ────────────────────────────────────
  ["slim jim",                      { floor:7, ceiling:9, substances:["sodium nitrite","Red 40","mechanically separated chicken","TBHQ"], reason:"Slim Jim — mechanically separated chicken + pork + beef + sodium nitrite (IARC Group 1) + Red 40 petroleum dye + TBHQ. Multiple critical floors fire simultaneously. One of the most additive-loaded snacks available.", confidence:"high", category:"food_beverage" }],
  ["old wisconsin",                 { floor:6, ceiling:8, substances:["sodium nitrite","artificial flavor"], reason:"Old Wisconsin beef sticks — sodium nitrite preservative (IARC Group 1 carcinogen) + artificial flavor. Nitrite floor fires.", confidence:"high", category:"food_beverage" }],
  ["country archer",                { floor:1, ceiling:3, substances:[], reason:"Country Archer — no sodium nitrite, no artificial additives, grass-fed options. Benchmark clean jerky brand alongside Chomps.", confidence:"high", category:"food_beverage" }],
  ["krave jerky",                   { floor:3, ceiling:5, substances:["soy sauce","sugar"], reason:"Krave Jerky — no nitrites, but some flavors have HFCS + soy sauce concerns. Cleaner than Jack Links but not as clean as Chomps/Country Archer.", confidence:"medium", category:"food_beverage" }],
  ["lorissa's kitchen",             { floor:3, ceiling:5, substances:["soy sauce","sugar"], reason:"Lorissa's Kitchen — no nitrites, but some varieties use soy + sugar. Better than conventional jerky, not as clean as Chomps.", confidence:"medium", category:"food_beverage" }],

  // ── COOKIES ───────────────────────────────────────────────────
  ["nutter butter",                 { floor:5, ceiling:7, substances:["HFCS","TBHQ","artificial flavor"], reason:"Nutter Butter — HFCS + TBHQ + artificial flavor. Same concern profile as Chips Ahoy.", confidence:"high", category:"food_beverage" }],
  ["nilla wafers",                  { floor:4, ceiling:6, substances:["HFCS","artificial flavor"], reason:"Nilla Wafers — HFCS + artificial vanilla flavor. Lower concern than Chips Ahoy (no TBHQ) but still HFCS-based.", confidence:"high", category:"food_beverage" }],
  ["fig newtons",                   { floor:4, ceiling:6, substances:["HFCS","artificial flavor","enriched flour"], reason:"Fig Newtons — HFCS + artificial flavor + enriched flour. Marketed as a healthier cookie but HFCS concern is real.", confidence:"high", category:"food_beverage" }],

  // ── CLEAN SWEET SNACKS ────────────────────────────────────────
  ["medjool dates",                 { floor:1, ceiling:2, substances:[], reason:"Medjool dates — whole fruit, one ingredient. Natural sugar but benchmark clean whole food snack. No processing, no additives.", confidence:"high", category:"food_beverage" }],
  ["dates",                         { floor:1, ceiling:2, substances:[], reason:"Dates — whole fruit, naturally sweet, no additives. Benchmark clean single-ingredient snack.", confidence:"high", category:"food_beverage" }],
  ["lily's",                        { floor:2, ceiling:4, substances:["erythritol","stevia"], reason:"Lily's brand — erythritol + stevia sweetened chocolate. No sucralose. Cleaner alternative to conventional chocolate but not as clean as Hu or Alter Eco.", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // AUDIT 32 — ALCOHOL AND BEVERAGES
  // NOTE: Ethanol (alcohol itself) is IARC Group 1. Scoring here
  // reflects additives, artificial ingredients, and production
  // quality — not the alcohol itself. Context: adult product.
  // ══════════════════════════════════════════════════════════════

  // ── BEER: MASS MARKET ────────────────────────────────────────
  ["budweiser",                { floor:3, ceiling:5, substances:["rice adjunct","propylene glycol alginate"], reason:"Budweiser — rice adjunct + propylene glycol alginate (foam stabilizer) + preservatives. Not disclosed on label (US doesn't require beer ingredient labeling). Mid-concern mainstream lager.", confidence:"high", category:"beverage" }],
  ["bud light beer",                { floor:3, ceiling:5, substances:["rice adjunct","corn syrup"], reason:"Bud Light — rice + corn adjuncts. Corn syrup used in fermentation (not in final product) but ingredient transparency is poor.", confidence:"high", category:"beverage" }],
  ["bud light",                     { floor:3, ceiling:5, substances:["corn adjunct"], reason:"Bud Light — corn adjunct + undisclosed additives. US beer labeling laws don't require full ingredient disclosure.", confidence:"medium", category:"beverage" }],
  ["coors light",                   { floor:3, ceiling:5, substances:["corn adjunct"], reason:"Coors Light — corn adjunct brewing, minimal disclosed additives. Similar concern profile to Bud Light.", confidence:"high", category:"beverage" }],
  ["miller lite",                   { floor:3, ceiling:5, substances:["corn adjunct"], reason:"Miller Lite — corn adjunct + hops + water + barley. No major disclosed additives but US labeling allows undisclosed stabilizers.", confidence:"high", category:"beverage" }],
  ["michelob ultra",                { floor:3, ceiling:5, substances:["corn adjunct","rice"], reason:"Michelob Ultra — very light lager, corn + rice adjuncts. Marketed as athletic beer but same additive disclosure gap as other AB InBev products.", confidence:"high", category:"beverage" }],
  ["corona extra",                  { floor:3, ceiling:4, substances:["corn adjunct"], reason:"Corona — corn adjunct lager. Light flavored, minimal disclosed additives. Better transparency than Budweiser.", confidence:"medium", category:"beverage" }],
  ["heineken beer",                 { floor:3, ceiling:4, substances:["propylene glycol alginate"], reason:"Heineken — uses propylene glycol alginate as foam stabilizer in some markets. More traditional brewing than US macro lagers but still has undisclosed additives.", confidence:"medium", category:"beverage" }],
  ["guinness",                      { floor:2, ceiling:4, substances:["nitrogen","isinglass"], reason:"Guinness — nitrogen-conditioned, traditional Dublin recipe. Isinglass (fish-derived) used in fining process. Relatively clean by macro beer standards.", confidence:"high", category:"beverage" }],
  ["blue moon beer",                { floor:2, ceiling:4, substances:["oats","orange peel","coriander"], reason:"Blue Moon — wheat ale with orange peel + coriander, no artificial additives. Cleaner ingredient profile than mass lagers despite Coors ownership.", confidence:"high", category:"beverage" }],

  // ── BEER: CRAFT / CLEAN TIER ─────────────────────────────────
  ["sam adams",                     { floor:2, ceiling:3, substances:[], reason:"Sam Adams — traditional craft brewing, full ingredient transparency, no artificial additives. Benchmark cleaner mainstream beer.", confidence:"high", category:"beverage" }],
  ["sierra nevada",                 { floor:2, ceiling:3, substances:[], reason:"Sierra Nevada — pioneer craft brewery, no artificial additives, transparent ingredients. Benchmark clean craft beer.", confidence:"high", category:"beverage" }],
  ["lagunitas",                     { floor:2, ceiling:3, substances:[], reason:"Lagunitas IPA — craft brewing, hops + water + barley + yeast, no artificial additives.", confidence:"high", category:"beverage" }],
  ["new belgium",                   { floor:2, ceiling:3, substances:[], reason:"New Belgium — B Corp certified, employee-owned, no artificial additives. Clean craft brewing standard.", confidence:"high", category:"beverage" }],
  ["dogfish head",                  { floor:2, ceiling:3, substances:[], reason:"Dogfish Head — independent craft brewery, creative ingredients but no artificial additives. Clean craft standard.", confidence:"high", category:"beverage" }],

  // ── WINE: CONCERN TIER ───────────────────────────────────────
  ["barefoot",                 { floor:4, ceiling:6, substances:["mega-purple","added sulfites","added sugar"], reason:"Barefoot — mass-market wine suspected of mega-purple (concentrated grape color) + added sugars + high sulfites. E.J. Gallo production with minimal transparency.", confidence:"medium", category:"beverage" }],
  ["yellow tail wine",              { floor:4, ceiling:5, substances:["added sulfites","added sugar"], reason:"Yellow Tail — Australian mass-market wine, added sugars + high sulfites. Low price point reflects low-intervention production.", confidence:"medium", category:"beverage" }],
  ["franzia",                  { floor:4, ceiling:6, substances:["added sulfites","added sugar","BPA-free concern"], reason:"Franzia boxed wine — high-volume production with added sugars and sulfites. Bag-in-box format has BPA-free claim but packaging quality varies.", confidence:"medium", category:"beverage" }],
  ["apothic red",                   { floor:4, ceiling:6, substances:["mega-purple","added sugar","artificial flavor"], reason:"Apothic Red — heavily blended California wine suspected of mega-purple + added sugar. Very sweet profile indicates significant additions.", confidence:"medium", category:"beverage" }],
  ["dark horse wine",               { floor:4, ceiling:5, substances:["added sulfites","added sugar"], reason:"Dark Horse — Treasury Wine Estates mass-market brand, added sugar + sulfites. Similar concern to Yellow Tail.", confidence:"medium", category:"beverage" }],
  ["bota box",                      { floor:3, ceiling:5, substances:["added sulfites","bag-in-box"], reason:"Bota Box — boxed wine with BPA-free bag claim. Mid-range production quality, added sulfites. More transparent than Franzia.", confidence:"medium", category:"beverage" }],

  // ── WINE: MID TIER ───────────────────────────────────────────
  ["josh cellars",                  { floor:3, ceiling:5, substances:["added sulfites"], reason:"Josh Cellars — popular California wine, standard added sulfites, moderate production quality. Not as processed as Barefoot but not clean-label.", confidence:"medium", category:"beverage" }],
  ["kim crawford",                  { floor:3, ceiling:4, substances:["added sulfites"], reason:"Kim Crawford — New Zealand sauvignon blanc, standard sulfites, good quality for price. Mid-tier clean.", confidence:"medium", category:"beverage" }],
  ["meiomi pinot noir",             { floor:3, ceiling:5, substances:["added sulfites","blended"], reason:"Meiomi — heavily blended California coastal pinot, added sulfites, some sugar addition suspected. Popular but not transparent.", confidence:"medium", category:"beverage" }],
  ["la marca prosecco",             { floor:3, ceiling:4, substances:["added sulfites","dosage sugar"], reason:"La Marca Prosecco — added sulfites + dosage sugar (added before corking in sparkling wine). Standard prosecco production.", confidence:"medium", category:"beverage" }],

  // ── WINE: CLEAN TIER ─────────────────────────────────────────
  ["dry farm wines",                { floor:1, ceiling:3, substances:[], reason:"Dry Farm Wines — tested for sugar (<1g/glass), sulfites, additives, mold. Curated low-intervention natural wines. Benchmark cleanest wine subscription.", confidence:"high", category:"beverage" }],
  ["frey organic",             { floor:1, ceiling:3, substances:[], reason:"Frey Vineyards — USDA Organic, no added sulfites, biodynamic. Benchmark clean certified organic wine.", confidence:"high", category:"beverage" }],
  ["avaline",                  { floor:1, ceiling:3, substances:[], reason:"Avaline — clean wine brand (Cameron Diaz), tested for 50+ additives, no added sugars, minimal sulfites. Transparent ingredient list.", confidence:"high", category:"beverage" }],
  ["scout and cellar",              { floor:1, ceiling:3, substances:[], reason:"Scout & Cellar — 'Clean Crafted Commitment' requires less than 100ppm sulfites, no commercial additives, tested for pesticides. Benchmark clean wine brand.", confidence:"high", category:"beverage" }],
  ["usual wines",                   { floor:1, ceiling:3, substances:[], reason:"Usual Wines — single-serve, minimal sulfites, no added sugars, natural fermentation. Clean small-batch wine brand.", confidence:"high", category:"beverage" }],

  // ── SPIRITS: CLEAN (PURE DISTILLED) ──────────────────────────
  ["tito's",                  { floor:2, ceiling:3, substances:[], reason:"Tito's — corn-based, pot still distilled, no additives. Benchmark clean mainstream vodka.", confidence:"high", category:"beverage" }],
  ["titos vodka",                   { floor:2, ceiling:3, substances:[], reason:"Tito's Handmade Vodka — corn, pot still, no additives. Clean vodka benchmark.", confidence:"high", category:"beverage" }],
  ["grey goose",                    { floor:2, ceiling:3, substances:[], reason:"Grey Goose — French wheat vodka, no additives, traditional distillation. Clean premium vodka.", confidence:"high", category:"beverage" }],
  ["ketel one",                     { floor:2, ceiling:3, substances:[], reason:"Ketel One — Dutch wheat vodka, copper pot still, no additives. Clean premium vodka.", confidence:"high", category:"beverage" }],
  ["don julio",             { floor:1, ceiling:2, substances:[], reason:"Don Julio — 100% blue agave, no additives, estate-grown. Benchmark cleanest mainstream tequila.", confidence:"high", category:"beverage" }],
  ["patron",                { floor:1, ceiling:2, substances:[], reason:"Patrón — 100% Weber blue agave, no additives, Hacienda production. Benchmark clean premium tequila.", confidence:"high", category:"beverage" }],
  ["casamigos tequila",             { floor:1, ceiling:2, substances:[], reason:"Casamigos — 100% blue agave, no additives. Clean ultra-premium tequila.", confidence:"high", category:"beverage" }],
  ["maker's mark",                  { floor:2, ceiling:3, substances:[], reason:"Maker's Mark — soft red winter wheat, no artificial additives, natural caramel coloring only. Benchmark clean bourbon.", confidence:"high", category:"beverage" }],
  ["bulleit bourbon",               { floor:2, ceiling:3, substances:[], reason:"Bulleit — high-rye bourbon, no artificial additives, traditional production. Clean mainstream bourbon.", confidence:"high", category:"beverage" }],
  ["wild turkey",                   { floor:2, ceiling:3, substances:[], reason:"Wild Turkey — Kentucky straight bourbon, no artificial additives, high proof traditional. Clean bourbon.", confidence:"high", category:"beverage" }],
  ["hendrick",                { floor:2, ceiling:3, substances:[], reason:"Hendrick's — Scottish gin with unusual botanicals (cucumber, rose), no artificial additives. Clean premium gin.", confidence:"high", category:"beverage" }],
  ["tanqueray",                     { floor:2, ceiling:3, substances:[], reason:"Tanqueray — London dry gin, botanical recipe, no artificial additives. Benchmark clean gin.", confidence:"high", category:"beverage" }],
  ["beefeater gin",                 { floor:2, ceiling:3, substances:[], reason:"Beefeater — London dry gin, botanical only, no artificial additives. Clean classic gin.", confidence:"high", category:"beverage" }],
  ["jameson whiskey",               { floor:2, ceiling:4, substances:["caramel color"], reason:"Jameson — Irish triple distilled, E150a caramel coloring added (disclosed). Cleaner than blended scotch, slight caramel color concern.", confidence:"high", category:"beverage" }],
  ["bacardi rum",                   { floor:2, ceiling:3, substances:[], reason:"Bacardi — white rum, column distilled, charcoal filtered. No artificial additives in white rum. Clean for a rum.", confidence:"high", category:"beverage" }],

  // ── SPIRITS: MID / CONCERN ───────────────────────────────────
  ["smirnoff vodka",                { floor:3, ceiling:5, substances:["natural flavor"], reason:"Smirnoff — triple distilled but some variants add 'natural flavors' and glycerin for mouthfeel. Flavored Smirnoff lines have more additives.", confidence:"medium", category:"beverage" }],
  ["jack daniel's",                 { floor:2, ceiling:4, substances:["caramel color"], reason:"Jack Daniel's — Tennessee whiskey, charcoal mellowing (unique process), E150a caramel coloring added. Traditional with one disclosed additive.", confidence:"high", category:"beverage" }],
  ["jack daniels",                  { floor:2, ceiling:4, substances:["caramel color"], reason:"Jack Daniel's — Tennessee whiskey, charcoal mellowed, caramel coloring added. Traditional production with minimal additives.", confidence:"high", category:"beverage" }],
  ["jim beam",                      { floor:3, ceiling:5, substances:["caramel color","added flavor"], reason:"Jim Beam — caramel coloring + some reports of flavor additives in standard line. Budget bourbon with less transparency than Maker's or Bulleit.", confidence:"medium", category:"beverage" }],
  ["johnnie walker",                { floor:3, ceiling:5, substances:["caramel color E150a"], reason:"Johnnie Walker — blended scotch, E150a caramel coloring for consistent appearance across blends. Disclosed but multiple grains blended with additives.", confidence:"high", category:"beverage" }],
  ["jose cuervo gold",              { floor:4, ceiling:6, substances:["caramel color","mixto tequila","added sugar"], reason:"Jose Cuervo Gold — 'mixto' tequila (only 51% agave, 49% added sugars) + caramel coloring. Significantly lower quality than 100% agave tequilas.", confidence:"high", category:"beverage" }],
  ["jose cuervo",                   { floor:3, ceiling:6, substances:["mixto","caramel color"], reason:"Jose Cuervo — Gold is mixto (5-6 concern), Especial Silver and Tradicional are 100% agave (2-3). Check which variety.", confidence:"medium", category:"beverage" }],
  ["captain morgan",                { floor:4, ceiling:6, substances:["artificial flavor","caramel color","added sugar"], reason:"Captain Morgan spiced rum — artificial spice flavoring + caramel color + added sugar. Heavily flavored product with significant additives.", confidence:"high", category:"beverage" }],
  ["malibu",                    { floor:4, ceiling:6, substances:["artificial coconut flavor","added sugar"], reason:"Malibu — Caribbean rum liqueur with artificial coconut flavor + significant added sugar. Very sweet, heavily flavored product.", confidence:"high", category:"beverage" }],

  // ── HARD SELTZER ─────────────────────────────────────────────
  ["high noon seltzer",             { floor:1, ceiling:3, substances:[], reason:"High Noon — real vodka + real fruit juice + sparkling water. No artificial flavors, no added sugar beyond juice. Benchmark cleanest hard seltzer.", confidence:"high", category:"beverage" }],
  ["high noon",                     { floor:1, ceiling:3, substances:[], reason:"High Noon — vodka + real juice + sparkling water. Cleanest hard seltzer format.", confidence:"high", category:"beverage" }],
  ["nutrl",                         { floor:1, ceiling:3, substances:[], reason:"Nutrl — vodka + sparkling water + natural flavor. Minimal ingredients, cleaner than White Claw.", confidence:"high", category:"beverage" }],
  ["white claw",                    { floor:2, ceiling:4, substances:["natural flavor","citric acid"], reason:"White Claw — fermented cane sugar + natural flavor + carbonated water + citric acid. Natural flavor is vague. Mid-tier clean hard seltzer.", confidence:"high", category:"beverage" }],
  ["truly hard seltzer",            { floor:2, ceiling:4, substances:["natural flavor","citric acid"], reason:"Truly — cane sugar fermented base + natural flavor. Same concern profile as White Claw.", confidence:"high", category:"beverage" }],
  ["vizzy hard seltzer",            { floor:3, ceiling:5, substances:["natural flavor","acerola cherry vitamin C"], reason:"Vizzy — added vitamin C from acerola cherry + natural flavor. Vitamin fortification in an alcoholic beverage is a marketing concern, not a safety concern.", confidence:"medium", category:"beverage" }],
  ["bud light seltzer",             { floor:3, ceiling:5, substances:["natural flavor","citric acid"], reason:"Bud Light Seltzer — AB InBev hard seltzer with natural flavor. Less transparent than High Noon, same general concern as Truly/White Claw.", confidence:"medium", category:"beverage" }],

  // ── COCKTAIL MIXERS: CONCERN ─────────────────────────────────
  ["margaritaville",  { floor:5, ceiling:7, substances:["HFCS","artificial flavor","Yellow 5"], reason:"Margaritaville Margarita Mix — HFCS + artificial lime flavor + Yellow 5 petroleum dye. Multiple floors fire. Not real lime juice.", confidence:"high", category:"beverage" }],
  ["jose cuervo margarita mix",     { floor:5, ceiling:7, substances:["HFCS","artificial flavor","artificial color"], reason:"Jose Cuervo Margarita Mix — HFCS + artificial flavor + artificial color. Contains no real agave or lime juice of significance.", confidence:"high", category:"beverage" }],
  ["margarita mix",               { floor:5, ceiling:7, substances:["HFCS","artificial flavor","artificial color"], reason:"Generic margarita mix — HFCS + artificial lime flavor + artificial color across all major brands. Not real lime juice.", confidence:"high", category:"beverage" }],
  ["master of mixes",               { floor:5, ceiling:7, substances:["HFCS","artificial flavor","artificial color"], reason:"Master of Mixes — HFCS + artificial flavor + artificial color across most cocktail mixes.", confidence:"high", category:"beverage" }],
  ["schweppes tonic",               { floor:4, ceiling:5, substances:["HFCS","quinine","artificial flavor"], reason:"Schweppes Tonic — HFCS + artificial quinine derivative + citric acid. Conventional tonic water with HFCS concern.", confidence:"high", category:"beverage" }],
  ["canada dry",                    { floor:4, ceiling:5, substances:["HFCS","natural flavor","caramel color"], reason:"Canada Dry — HFCS + natural ginger flavor (very little real ginger) + caramel color. Marketed as ginger ale but minimal actual ginger.", confidence:"high", category:"beverage" }],

  // ── COCKTAIL MIXERS: CLEAN ────────────────────────────────────
  ["fever tree",                    { floor:1, ceiling:3, substances:[], reason:"Fever Tree — spring water + natural quinine from Congo + botanical flavors, no HFCS, no artificial flavors. Benchmark cleanest premium mixer brand.", confidence:"high", category:"beverage" }],
  ["q mixers",                      { floor:1, ceiling:3, substances:[], reason:"Q Mixers — premium carbonated mixers with real botanicals, no HFCS, no artificial flavors. Benchmark clean alongside Fever Tree.", confidence:"high", category:"beverage" }],
  ["stirrings",                     { floor:2, ceiling:4, substances:[], reason:"Stirrings — real juice mixers, no HFCS, no artificial flavors. Cleaner than conventional margarita mixes.", confidence:"high", category:"beverage" }],
  ["reed's",            { floor:1, ceiling:3, substances:[], reason:"Reed's — real fresh ginger brewed + cane sugar, no artificial flavors or colors. Benchmark clean ginger beer.", confidence:"high", category:"beverage" }],
  ["bundaberg ginger beer",         { floor:2, ceiling:4, substances:["cane sugar"], reason:"Bundaberg — brewed with real ginger, cane sugar, clean ingredients. Slightly higher sugar than Reed's but still clean-label.", confidence:"high", category:"beverage" }],

  // ── NON-ALCOHOLIC SPIRITS ─────────────────────────────────────
  ["seedlip",                       { floor:1, ceiling:2, substances:[], reason:"Seedlip — distilled non-alcoholic spirit from botanicals, no sugar, no calories, no artificial additives. Benchmark cleanest non-alcoholic spirit.", confidence:"high", category:"beverage" }],
  ["ghia aperitif",                 { floor:1, ceiling:3, substances:[], reason:"Ghia — non-alcoholic aperitif with adaptogens + botanicals, no artificial additives. Premium clean non-alcoholic option.", confidence:"high", category:"beverage" }],
  ["heineken 0.0",                  { floor:2, ceiling:4, substances:["natural flavor"], reason:"Heineken 0.0 — non-alcoholic beer, natural flavor added. Cleaner than regular beer, slight natural flavor vagueness.", confidence:"medium", category:"beverage" }],
  ["budweiser zero",                { floor:2, ceiling:4, substances:["natural flavor"], reason:"Budweiser Zero — non-alcoholic, natural flavor. Cleaner than regular Budweiser.", confidence:"medium", category:"beverage" }],

  // ══════════════════════════════════════════════════════════════
  // JUICE AUDIT — FRAMEWORK-BASED SCORING
  // Scores reflect CHEMISTRY not nutrition. Sugar is not the issue.
  // What is added IS the issue: HFCS, artificial color/flavor,
  // sulfite preservatives, flavor packs, sodium benzoate.
  // ══════════════════════════════════════════════════════════════

  // ── TIER 1: FRUIT DRINKS / COCKTAILS (5-7) ───────────────────
  ["hi-c",                          { floor:5, ceiling:7, substances:["HFCS","artificial color","artificial flavor"], reason:"Hi-C — HFCS + artificial color + artificial flavor marketed to children. Not juice.", confidence:"high", category:"beverage" }],
  ["kool aid jammers",              { floor:5, ceiling:7, substances:["HFCS","artificial color"], reason:"Kool-Aid Jammers — HFCS + dyes. Not juice.", confidence:"high", category:"beverage" }],
  ["ocean spray cranberry cocktail", { floor:5, ceiling:6, substances:["HFCS","added sugar"], reason:"Ocean Spray Cranberry Cocktail — HFCS + added sugar, only ~27% actual juice. Cocktail label means it is not 100% juice.", confidence:"high", category:"beverage" }],

  // ── TIER 2: 100% JUICE, FLAVOR-PACKED (4-5) ──────────────────
  ["juicy juice",                   { floor:3, ceiling:5, substances:["from concentrate","sulfites"], reason:"Juicy Juice — 100% juice from concentrate, some varieties with potassium metabisulfite. Check specific variety.", confidence:"medium", category:"beverage" }],
  ["tree top",                      { floor:3, ceiling:4, substances:["from concentrate","potassium metabisulfite"], reason:"Tree Top — 100% apple juice from concentrate with potassium metabisulfite preservative. Sulfite concern bumps from 2 to 3-4.", confidence:"high", category:"beverage" }],
  ["apple and eve",                 { floor:3, ceiling:4, substances:["from concentrate","potassium metabisulfite"], reason:"Apple & Eve — 100% juice from concentrate with potassium metabisulfite. Sulfite concern.", confidence:"high", category:"beverage" }],

  // ── TIER 3: 100% JUICE + SULFITES (3-4) ──────────────────────
  ["nature's nectar",               { floor:3, ceiling:4, substances:["potassium metabisulfite","from concentrate"], reason:"Nature's Nectar (Aldi) — from concentrate + potassium metabisulfite sulfite preservative. Cleaner than cocktail versions but sulfites present. Score 3 not 2.", confidence:"high", category:"beverage" }],
  ["ocean spray 100",               { floor:3, ceiling:4, substances:["from concentrate","sulfites"], reason:"Ocean Spray 100% juice — from concentrate, sulfite preservatives in most. Better than the cocktail version.", confidence:"medium", category:"beverage" }],

  // ── TIER 4: CLEAN CONCENTRATE, NO PRESERVATIVES (2-3) ─────────
  ["martinelli's",                  { floor:1, ceiling:3, substances:[], reason:"Martinelli's — 100% US-grown apple juice, no sulfites, no artificial additives. Benchmark clean mainstream juice.", confidence:"high", category:"beverage" }],
  ["r.w. knudsen",                  { floor:1, ceiling:3, substances:[], reason:"R.W. Knudsen — organic juice, no artificial additives, many varieties not-from-concentrate. Clean juice brand.", confidence:"high", category:"beverage" }],

  // ── TIER 5: COLD-PRESSED / HPP / ORGANIC (1-3) ───────────────

  // ══════════════════════════════════════════════════════════════
  // AUDIT 33 — KIDS SNACKS
  // CHILD VULNERABILITY NOTE: All products in this section are
  // consumed daily by children. Dye exposure is cumulative.
  // FDA is phasing out petroleum dyes. Child vulnerability
  // amplifies every concern score in this category.
  // ══════════════════════════════════════════════════════════════

  // ── FRUIT SNACKS: HIGH CONCERN ────────────────────────────────
  ["fruit roll-ups",                { floor:6, ceiling:8, substances:["Red 40","Yellow 5","Blue 1","TBHQ","modified starch"], reason:"Fruit Roll-Ups — Red 40 + Yellow 5 + Blue 1 petroleum dyes + TBHQ preservative. Multiple floors fire. Zero actual fruit. Daily child snack with one of the worst additive profiles in the category.", confidence:"high", category:"food_beverage" }],
  ["fruit by the foot",             { floor:6, ceiling:8, substances:["Red 40","Yellow 5","Blue 1","TBHQ"], reason:"Fruit by the Foot — same petroleum dye + TBHQ concern as Fruit Roll-Ups. General Mills same line. Multiple floors fire.", confidence:"high", category:"food_beverage" }],
  ["gushers",                       { floor:6, ceiling:8, substances:["Red 40","Blue 1","TBHQ","artificial flavor"], reason:"Gushers — Red 40 + Blue 1 petroleum dyes + TBHQ + artificial flavor. Liquid center increases dye delivery. Child daily snack. Multiple floors fire.", confidence:"high", category:"food_beverage" }],
  ["welch fruit",            { floor:5, ceiling:7, substances:["Red 40","Yellow 5","HFCS"], reason:"Welch's Fruit Snacks — petroleum dyes + HFCS. Dye floors fire.", confidence:"high", category:"food_beverage" }],
  ["motts fruit snacks",            { floor:3, ceiling:5, kidsFloor:4, kidsCeiling:6, substances:["corn syrup","sugar","modified corn starch","carnauba wax"], reason:"Mott's Fruit Snacks REFORMULATED. No artificial colors or flavors. Natural colors from vegetable and fruit juice. 9g sugar per 45g pouch.", confidence:"high", category:"food_beverage", verified:"2026-04-17" }],

  // ── FRUIT SNACKS: CLEAN TIER ──────────────────────────────────
  ["annie's fruit snacks",          { floor:2, ceiling:4, substances:[], reason:"Annie's Organic Fruit Snacks — USDA Organic, fruit juice colored, no petroleum dyes, no artificial flavor. Benchmark clean fruit snack.", confidence:"high", category:"food_beverage" }],
  ["yumearth fruit snacks",         { floor:1, ceiling:3, substances:[], reason:"YumEarth Organic Fruit Snacks — USDA Organic, fruit juice sweetened, no artificial dyes or flavors. Benchmark cleanest mainstream fruit snack.", confidence:"high", category:"food_beverage" }],
  ["yumearth",                      { floor:1, ceiling:3, substances:[], reason:"YumEarth brand — USDA Organic across entire line, no petroleum dyes, no artificial flavors. Benchmark clean kids candy brand.", confidence:"high", category:"food_beverage" }],
  ["stretch island",                { floor:1, ceiling:3, substances:[], reason:"Stretch Island Fruit Strips — real fruit puree, no artificial dyes or flavors, no HFCS. Clean fruit snack.", confidence:"high", category:"food_beverage" }],
  ["surf sweets",                   { floor:1, ceiling:3, substances:[], reason:"Surf Sweets — organic, fruit juice colored, no artificial dyes or flavors. Benchmark clean gummy candy for kids.", confidence:"high", category:"food_beverage" }],

  // ── GUMMY CANDY ───────────────────────────────────────────────
  ["starbursts",                    { floor:6, ceiling:8, substances:["Red 40","Yellow 5","Yellow 6","Blue 1"], reason:"Starbursts — four petroleum dyes fire simultaneously. Maximum dye concern for child daily candy.", confidence:"high", category:"food_beverage" }],
  ["ring pop",                      { floor:5, ceiling:7, substances:["Red 40","Blue 1","artificial flavor","HFCS"], reason:"Ring Pops — HFCS + petroleum dyes + artificial flavor in a candy children lick repeatedly. Direct oral mucosal exposure amplifies concern.", confidence:"high", category:"food_beverage" }],
  ["haribo gummy bears",            { floor:4, ceiling:6, substances:["artificial flavor","carnauba wax","HFCS"], reason:"Haribo US formula — HFCS + artificial flavor + carnauba wax coating. Note: European Haribo uses beet sugar and is cleaner. US formula is different.", confidence:"high", category:"food_beverage" }],
  ["haribo",                        { floor:4, ceiling:6, substances:["artificial flavor","HFCS"], reason:"Haribo US — HFCS + artificial flavor. European formula is cleaner (beet sugar). US version is mid-concern.", confidence:"medium", category:"food_beverage" }],
  ["black forest gummy",            { floor:3, ceiling:5, substances:["corn syrup","carnauba wax"], reason:"Black Forest Gummies — fruit juice colored (no petroleum dyes) but corn syrup base + carnauba wax. Better than Haribo US, not as clean as YumEarth.", confidence:"high", category:"food_beverage" }],
  ["unreal",                  { floor:1, ceiling:3, substances:[], reason:"Unreal — no artificial dyes, no HFCS, fair trade cocoa. Benchmark clean mainstream candy alternative.", confidence:"high", category:"food_beverage" }],

  // ── APPLESAUCE AND POUCHES ────────────────────────────────────
  ["mott's applesauce",             { floor:3, ceiling:5, substances:["HFCS","from concentrate"], reason:"Mott's Applesauce — most varieties contain HFCS + apple juice from concentrate. Squeeze pouch versions add plastic packaging concern. Unsweetened versions score lower.", confidence:"medium", category:"food_beverage" }],
  ["motts applesauce",              { floor:3, ceiling:5, substances:["HFCS"], reason:"Mott's Applesauce — HFCS in standard varieties. Unsweetened scores better.", confidence:"medium", category:"food_beverage" }],

  // ── KIDS DRINKS ───────────────────────────────────────────────
  ["capri sun original",            { floor:5, ceiling:7, substances:["HFCS","artificial flavor","citric acid"], reason:"Capri Sun Original — HFCS + artificial flavor. The iconic kids drink pouch is not a healthy choice despite marketing.", confidence:"high", category:"beverage" }],
  ["honest kids",                   { floor:1, ceiling:3, substances:[], reason:"Honest Kids juice pouches — USDA Organic, no HFCS, no artificial colors or flavors. Benchmark clean kids juice pouch.", confidence:"high", category:"beverage" }],

  // ── LUNCH BOX ─────────────────────────────────────────────────
  ["uncrustables",                  { floor:5, ceiling:7, substances:["HFCS","enriched flour","partially hydrogenated"], reason:"Uncrustables — HFCS + enriched flour + hydrogenated oil. Convenient but one of the most processed kids lunch staples. Trans fat floor may fire.", confidence:"high", category:"food_beverage" }],
  ["teddy grahams",                 { floor:4, ceiling:6, substances:["HFCS","enriched flour","artificial flavor"], reason:"Teddy Grahams — HFCS + enriched flour + artificial flavor. Common kids snack with conventional additive profile.", confidence:"high", category:"food_beverage" }],

  // ── KIDS CRACKERS: CLEAN ──────────────────────────────────────
  ["annie's cheddar bunnies",       { floor:1, ceiling:3, substances:[], reason:"Annie's Cheddar Bunnies — USDA Organic, real cheddar, no artificial colors or flavors. Benchmark clean alternative to Goldfish.", confidence:"high", category:"food_beverage" }],
  ["annie's",                       { floor:1, ceiling:3, substances:[], reason:"Annie's brand — USDA Organic across most products, no artificial dyes or flavors. Benchmark clean kids snack brand.", confidence:"high", category:"food_beverage" }],

  // ── KIDS BARS ─────────────────────────────────────────────────
  ["clif kids zbar",                { floor:2, ceiling:4, substances:["conventional oats","cane sugar"], reason:"Clif Kids Z Bar — USDA Organic oats + cane sugar, no artificial additives. Cleaner than most kids bars but conventional sugar load.", confidence:"high", category:"food_beverage" }],
  ["rxbar kids",                    { floor:1, ceiling:3, substances:[], reason:"RXBAR Kids — dates + egg whites + fruit, no artificial additives. Same clean whole-food approach as adult RXBAR.", confidence:"high", category:"food_beverage" }],
  ["enjoy life",                    { floor:1, ceiling:3, substances:[], reason:"Enjoy Life — allergen-free, no artificial dyes or flavors, non-GMO. Benchmark clean allergy-safe kids snack brand.", confidence:"high", category:"food_beverage" }],
  ["matt's bakery",                 { floor:2, ceiling:4, kidsFloor:2, kidsCeiling:4, substances:["cane sugar","palm oil"], reason:"Matt's Bakery soft baked cookies — colored with vegetable and fruit extracts only (NO petroleum dyes). Natural colorants do not trigger dye concern. Clean additives profile. Main concerns: cane sugar and palm oil. Natural dye rule applies — do not penalize vegetable-based color.", confidence:"high", category:"food_beverage" }],
  ["matts bakery",                  { floor:2, ceiling:4, kidsFloor:2, kidsCeiling:4, substances:["cane sugar","palm oil"], reason:"Matt's Bakery — natural vegetable dyes, no petroleum dyes. Natural colorant rule applies.", confidence:"high", category:"food_beverage" }],
  ["matt's monster cookie",         { floor:2, ceiling:4, kidsFloor:2, kidsCeiling:4, substances:["cane sugar","palm oil"], reason:"Matt's Bakery Monster Cookie — colored with vegetable juice. Natural dye, not petroleum dye. No dye penalty applies.", confidence:"high", category:"food_beverage" }],
  ["matt's bakery monster soft-baked cookies", { floor:2, ceiling:4, kidsFloor:2, kidsCeiling:4, substances:["cane sugar","palm oil"], reason:"Matt's Bakery Monster Soft-Baked Cookies — colored with vegetable juice. Natural dye only. No petroleum dye penalty.", confidence:"high", category:"food_beverage" }],
  ["matts bakery monster soft-baked cookies",  { floor:2, ceiling:4, kidsFloor:2, kidsCeiling:4, substances:["cane sugar","palm oil"], reason:"Matt's Bakery Monster Soft-Baked Cookies — natural vegetable dyes only.", confidence:"high", category:"food_beverage" }],
  ["matt's bakery soft baked cookies", { floor:2, ceiling:4, kidsFloor:2, kidsCeiling:4, substances:["cane sugar","palm oil"], reason:"Matt's Bakery soft baked cookies — natural colorants only.", confidence:"high", category:"food_beverage" }],
  ["matts bakery soft baked",       { floor:2, ceiling:4, kidsFloor:2, kidsCeiling:4, substances:["cane sugar","palm oil"], reason:"Matt's Bakery soft baked — natural colorants only.", confidence:"high", category:"food_beverage" }],

  // ── KIDS YOGURT TUBES ────────────────────────────────────────
  ["danimals",                      { floor:4, ceiling:5, substances:["modified food starch","added cane sugar"], reason:"Danimals Smoothie — reformulated: no artificial dyes, colored with fruit and vegetable juice, natural flavors, no HFCS, no artificial preservatives. Still NOVA 4 ultra-processed yogurt with added cane sugar (~9g per pouch). Kids daily consumption warrants caution but meaningfully cleaner than prior formulation. Ingredients verified Apr 2026.", confidence:"high", category:"food_beverage" }],
  ["stonyfield yokids",             { floor:1, ceiling:3, substances:[], reason:"Stonyfield YoKids — USDA Organic, no artificial dyes or flavors. Benchmark clean kids yogurt.", confidence:"high", category:"food_beverage" }],
  ["stonyfield yo kids",            { floor:1, ceiling:3, substances:[], reason:"Stonyfield YoKids — USDA Organic, clean. Benchmark clean kids yogurt.", confidence:"high", category:"food_beverage" }],
  ["siggi kids",                    { floor:1, ceiling:2, substances:[], reason:"Siggi's Kids — Icelandic skyr style, minimal ingredients, no artificial dyes or flavors, low sugar. Benchmark cleanest kids yogurt.", confidence:"high", category:"food_beverage" }],
  ["plum organics kids",            { floor:2, ceiling:4, substances:["plastic pouch"], reason:"Plum Organics kids pouches — USDA Organic ingredients but plastic pouch at room temperature. Same packaging concern as baby food pouches.", confidence:"high", category:"food_beverage" }],

  // ── MISSING HIGH-VOLUME KIDS SNACKS ──────────────────────────

  // Baby food pouches — critical: plastic pouch + hot fill = plasticizer migration risk
  ["happy baby organic pouch",      { floor:2, ceiling:4, kidsFloor:3, kidsCeiling:5, substances:["plastic pouch","room temperature storage"], reason:"Happy Baby Organic pouches — USDA Organic ingredients but plastic pouch at room temperature. Hot-fill process raises plasticizer migration concern. Organic contents are clean but packaging is the concern. Refrigerated formats (Once Upon a Farm) are safer.", confidence:"high", category:"baby" }],
  ["happy tot pouch",               { floor:2, ceiling:4, kidsFloor:3, kidsCeiling:5, substances:["plastic pouch"], reason:"Happy Tot — USDA Organic, plastic pouch concern same as all room-temperature baby food pouches.", confidence:"high", category:"baby" }],
  ["earth's best pouch",            { floor:2, ceiling:4, kidsFloor:3, kidsCeiling:5, substances:["plastic pouch","conventional some lines"], reason:"Earth's Best — USDA Organic on certified lines, plastic pouch concern. Cleaner than Gerber but packaging concern applies to all room-temp squeeze pouches.", confidence:"high", category:"baby" }],
  ["earths best pouch",             { floor:2, ceiling:4, kidsFloor:3, kidsCeiling:5, substances:["plastic pouch"], reason:"Earth's Best — USDA Organic, plastic pouch concern.", confidence:"high", category:"baby" }],
  ["gerber organic pouch",          { floor:3, ceiling:5, kidsFloor:4, kidsCeiling:6, substances:["plastic pouch","room temperature"], reason:"Gerber Organic pouches — USDA Organic but Gerber named in 2021 congressional heavy metals report. Plastic pouch concern. Better than Gerber conventional but not as clean as Once Upon a Farm or Little Spoon.", confidence:"medium", category:"baby" }],
  ["gogo squeez",                   { floor:1, ceiling:3, kidsFloor:2, kidsCeiling:4, substances:["plastic pouch"], reason:"GoGo Squeez — 100% applesauce, no added sugar, no additives. One of the cleanest mainstream kids pouches. Plastic pouch concern is lower because applesauce is shelf-stable at lower temperatures and less acidic than some purees.", confidence:"high", category:"food_beverage" }],
  ["gogo applesauce",               { floor:1, ceiling:3, kidsFloor:2, kidsCeiling:4, substances:["plastic pouch"], reason:"GoGo Squeez applesauce — 100% fruit, no additives. Benchmark clean kids pouch snack.", confidence:"high", category:"food_beverage" }],

  // Go-Gurt / yogurt tubes
  ["go-gurt",                       { floor:5, ceiling:7, kidsFloor:5, kidsCeiling:7, substances:["artificial color","HFCS","artificial flavor"], reason:"Yoplait Go-Gurt — artificial colors + HFCS + artificial flavors in a kids plastic tube marketed as daily. Child vulnerability applies. Dye floor fires.", confidence:"high", category:"food_beverage" }],
  ["gogurt",                        { floor:5, ceiling:7, kidsFloor:5, kidsCeiling:7, substances:["artificial color","HFCS"], reason:"Go-Gurt — artificial colors + HFCS. Same as Yoplait Go-Gurt.", confidence:"high", category:"food_beverage" }],
  ["kids yogurt tube",              { floor:4, ceiling:6, kidsFloor:5, kidsCeiling:7, substances:["artificial color","sugar"], reason:"Generic kids yogurt tube — conventional, likely artificial colors and added sugar. Check for dye floor.", confidence:"medium", category:"food_beverage" }],

  // Goldfish deep splits
  ["goldfish crackers original",    { floor:3, ceiling:5, kidsFloor:4, kidsCeiling:6, substances:["enriched flour","cheddar","conventional"], reason:"Goldfish Original — enriched flour + conventional cheddar + vegetable oils. No artificial dyes in original. NOVA 3. One of the cleaner mainstream kids crackers but enriched flour and 230mg sodium are real concerns for a daily snack.", confidence:"high", category:"food_beverage" }],
  ["goldfish colors",               { floor:4, ceiling:6, kidsFloor:5, kidsCeiling:7, substances:["Red 40","Yellow 5","Blue 1","enriched flour"], reason:"Goldfish Colors/Rainbow — petroleum dyes added in colored varieties (Red 40, Yellow 5, Blue 1 confirmed). Dye floors fire. Score higher than original. Stick to original or Whole Grain Goldfish.", confidence:"high", category:"food_beverage" }],
  ["goldfish whole grain",          { floor:2, ceiling:4, kidsFloor:3, kidsCeiling:5, substances:["whole wheat","cheddar"], reason:"Goldfish Whole Grain — same as original but whole wheat flour replaces enriched. No artificial dyes. Benchmark cleaner Goldfish option.", confidence:"high", category:"food_beverage" }],
  ["pepperidge farm goldfish",      { floor:3, ceiling:5, kidsFloor:4, kidsCeiling:6, substances:["enriched flour","conventional cheddar"], reason:"Pepperidge Farm Goldfish — same as Goldfish Original. No artificial dyes in base cracker. Enriched flour + sodium main concerns.", confidence:"high", category:"food_beverage" }],

  // Lunchbox staples with gaps
  ["fruit gushers",                 { floor:6, ceiling:8, kidsFloor:7, kidsCeiling:9, substances:["HFCS","Red 40","Blue 1","Yellow 5","carrageenan"], reason:"Gushers — HFCS + three petroleum dyes + carrageenan. One of the worst kids snacks in terms of additive load. Child vulnerability critical. NEVER score below 6.", confidence:"high", category:"food_beverage" }],
  ["fruit roll up",                 { floor:5, ceiling:7, kidsFloor:6, kidsCeiling:8, substances:["HFCS","Red 40","artificial flavor"], reason:"Fruit Roll-Ups — HFCS + Red 40 + artificial flavor. Dye floor fires. Classic kids snack with real concern profile.", confidence:"high", category:"food_beverage" }],

  // Kids drinks gap
  ["capri sun roarin waters",       { floor:2, ceiling:4, kidsFloor:3, kidsCeiling:5, substances:["natural flavor","citric acid"], reason:"Capri Sun Roarin Waters — water + natural flavor + citric acid. No HFCS, no artificial colors. Significantly cleaner than Capri Sun Original. Acceptable kids drink.", confidence:"high", category:"beverage" }],
  ["squeezit",                      { floor:5, ceiling:7, kidsFloor:6, kidsCeiling:8, substances:["HFCS","Red 40","Blue 1","Yellow 5"], reason:"Squeez-It — HFCS + three petroleum dyes. One of the most dye-heavy kids drinks. Maximum child concern.", confidence:"high", category:"beverage" }],
  // KEY STORY: Azodicarbonamide (ADA) — the "yoga mat chemical"
  // Used as flour bleacher and dough conditioner in US bread.
  // BANNED in EU, Australia, Singapore, and most of the world.
  // Breaks down into semicarbazide (carcinogen) during baking.
  // FDA allows it. Partiqule flags it. Floor fires at 5+.
  // ══════════════════════════════════════════════════════════════

  // ── SANDWICH BREAD: HIGH CONCERN (ADA + preservatives) ────────
  ["nature's own",            { floor:5, ceiling:6, substances:["azodicarbonamide","calcium propionate","DATEM"], reason:"Nature's Own — azodicarbonamide (ADA, banned in EU) + calcium propionate preservative + DATEM dough conditioner. ADA floor fires. Marketed as wholesome but contains EU-banned additive.", confidence:"high", category:"food_beverage" }],
  ["natures own bread",             { floor:5, ceiling:6, substances:["azodicarbonamide","calcium propionate"], reason:"Nature's Own — ADA (banned EU) + calcium propionate. ADA floor fires.", confidence:"high", category:"food_beverage" }],
  ["sara lee",                { floor:5, ceiling:6, substances:["azodicarbonamide","DATEM","calcium propionate"], reason:"Sara Lee Classic — azodicarbonamide + DATEM + calcium propionate. ADA floor fires. EU-banned additive in everyday sandwich bread.", confidence:"high", category:"food_beverage" }],
  ["arnold",                  { floor:4, ceiling:6, substances:["DATEM","calcium propionate","soy lecithin"], reason:"Arnold bread — DATEM dough conditioner + calcium propionate preservative + soy lecithin. ADA not typically present but still multiple additive concerns.", confidence:"medium", category:"food_beverage" }],
  ["oroweat",                       { floor:4, ceiling:5, substances:["DATEM","calcium propionate"], reason:"Oroweat (same parent as Arnold) — DATEM + calcium propionate. Better than ADA-containing brands but still conventional additive profile.", confidence:"high", category:"food_beverage" }],
  ["franz bread",                   { floor:4, ceiling:6, substances:["DATEM","calcium propionate","soy"], reason:"Franz bread — DATEM + calcium propionate + soy. Regional brand with conventional additive profile.", confidence:"medium", category:"food_beverage" }],
  ["martin's potato bread",         { floor:4, ceiling:6, substances:["DATEM","calcium propionate","ADA"], reason:"Martin's Potato Bread — calcium propionate + DATEM + ADA in some varieties. Check label. Soft roll texture from multiple conditioners.", confidence:"medium", category:"food_beverage" }],
  ["martin's potato",          { floor:4, ceiling:6, substances:["DATEM","calcium propionate"], reason:"Martin's Potato Bread — DATEM + calcium propionate. Conventional additive profile.", confidence:"medium", category:"food_beverage" }],

  // ── SANDWICH BREAD: CLEAN TIER ────────────────────────────────
  ["daves killer bread",            { floor:2, ceiling:4, substances:["calcium propionate"], reason:"Dave's Killer Bread — organic whole grain, no ADA, calcium propionate in most. Benchmark cleanest mainstream sandwich bread.", confidence:"high", category:"food_beverage" }],
  ["silver hills",                  { floor:1, ceiling:3, substances:[], reason:"Silver Hills Sprouted Bakery — USDA Organic sprouted grain, no ADA, no calcium propionate, no artificial additives. Benchmark clean sprouted bread.", confidence:"high", category:"food_beverage" }],
  ["ezekiel bread",                 { floor:1, ceiling:2, substances:[], reason:"Ezekiel 4:9 (Food for Life) — organic sprouted grain + legumes, no preservatives, no artificial additives, no ADA. Benchmark cleanest commercially available bread. Refrigerated = no preservatives needed.", confidence:"high", category:"food_beverage" }],
  ["food for life",                 { floor:1, ceiling:2, substances:[], reason:"Food for Life (Ezekiel) — organic sprouted grain bread, no preservatives, no ADA. Cleanest bread benchmark. Refrigerated format.", confidence:"high", category:"food_beverage" }],
  ["alvarado street",               { floor:1, ceiling:3, substances:[], reason:"Alvarado Street Bakery — USDA Organic sprouted grain, no ADA, no artificial preservatives. Clean sprouted bread brand.", confidence:"high", category:"food_beverage" }],
  ["angelic bakehouse",             { floor:1, ceiling:3, substances:[], reason:"Angelic Bakehouse — sprouted grain, no artificial additives, no ADA. Clean alternative to conventional sandwich bread.", confidence:"high", category:"food_beverage" }],

  // ── BAGELS ────────────────────────────────────────────────────
  ["thomas bagels",                 { floor:5, ceiling:6, substances:["azodicarbonamide","DATEM","calcium propionate"], reason:"Thomas' Bagels — azodicarbonamide + DATEM + calcium propionate. ADA floor fires. Same Thomas brand that uses ADA across their product line.", confidence:"high", category:"food_beverage" }],
  ["thomas english muffins",        { floor:5, ceiling:6, substances:["azodicarbonamide","DATEM","calcium propionate"], reason:"Thomas' English Muffins — azodicarbonamide (EU-banned) + DATEM + calcium propionate. ADA floor fires across the Thomas line.", confidence:"high", category:"food_beverage" }],
  ["thomas",                          { floor:5, ceiling:6, substances:["azodicarbonamide","DATEM","calcium propionate"], reason:"Thomas brand — azodicarbonamide (EU-banned) + DATEM + calcium propionate. ADA floor fires across the Thomas line.", confidence:"high", category:"food_beverage" }],
  ["thomas'",                       { floor:5, ceiling:6, substances:["azodicarbonamide","DATEM"], reason:"Thomas' brand — azodicarbonamide across the product line + DATEM + calcium propionate. ADA floor fires. Banned in EU.", confidence:"high", category:"food_beverage" }],
  ["bays english muffins",          { floor:4, ceiling:5, substances:["DATEM","calcium propionate"], reason:"Bays English Muffins — DATEM + calcium propionate. No ADA reported but standard dough conditioner concern.", confidence:"medium", category:"food_beverage" }],
  ["einstein",               { floor:4, ceiling:6, substances:["DATEM","calcium propionate","ADA"], reason:"Einstein Bros Bagels — DATEM + calcium propionate + ADA in some varieties. Foodservice brand with conventional additive profile.", confidence:"medium", category:"food_beverage" }],

  // ── ROLLS AND BUNS ────────────────────────────────────────────
  ["king's hawaiian",               { floor:4, ceiling:6, substances:["DATEM","calcium propionate","artificial flavor"], reason:"King's Hawaiian — DATEM + calcium propionate + artificial flavor. Sweet soft texture from multiple conditioners and preservatives.", confidence:"high", category:"food_beverage" }],
  ["kings hawaiian",                { floor:4, ceiling:6, substances:["DATEM","calcium propionate","artificial flavor"], reason:"King's Hawaiian rolls — DATEM + calcium propionate + artificial flavor. Conventionally produced sweet roll.", confidence:"high", category:"food_beverage" }],
  ["martins potato rolls",          { floor:4, ceiling:6, substances:["DATEM","calcium propionate"], reason:"Martin's Potato Rolls — DATEM + calcium propionate. Standard conventional roll additive profile.", confidence:"high", category:"food_beverage" }],

  // ── TORTILLAS ─────────────────────────────────────────────────
  ["old el paso",         { floor:4, ceiling:6, substances:["calcium propionate","artificial flavor","DATEM"], reason:"Old El Paso Tortillas — calcium propionate + artificial flavor + DATEM. More additives than Mission, same ballpark concern.", confidence:"high", category:"food_beverage" }],
  ["la banderita",                  { floor:4, ceiling:6, substances:["calcium propionate","DATEM","sorbic acid"], reason:"La Banderita — calcium propionate + DATEM + sorbic acid preservative. Conventional flour tortilla concern.", confidence:"high", category:"food_beverage" }],
  ["siete tortillas",               { floor:1, ceiling:3, substances:[], reason:"Siete tortillas — grain-free (almond flour, cassava, coconut), no artificial preservatives, no ADA. Benchmark clean tortilla.", confidence:"high", category:"food_beverage" }],

  // ── BAKED GOODS: HIGH CONCERN ─────────────────────────────────
  ["little debbie",                 { floor:6, ceiling:8, substances:["partially hydrogenated oil","TBHQ","artificial flavor","Red 40"], reason:"Little Debbie snack cakes — partially hydrogenated oil (trans fat floor) + TBHQ + artificial flavor + artificial color. Multiple floors fire. Budget snack cake with maximum additive concern.", confidence:"high", category:"food_beverage" }],
  ["hostess twinkies",              { floor:6, ceiling:8, substances:["partially hydrogenated oil","TBHQ","artificial flavor","artificial color"], reason:"Hostess Twinkies — partially hydrogenated oil + TBHQ + artificial flavor + artificial color. Multiple floors fire. 45 ingredients in a snack cake.", confidence:"high", category:"food_beverage" }],
  ["hostess ding dongs",            { floor:6, ceiling:8, substances:["partially hydrogenated oil","TBHQ","artificial flavor"], reason:"Hostess Ding Dongs — partially hydrogenated oil + TBHQ + artificial flavor. Multiple floors fire.", confidence:"high", category:"food_beverage" }],
  ["hostess",                       { floor:6, ceiling:8, substances:["partially hydrogenated oil","TBHQ","artificial flavor"], reason:"Hostess brand — partially hydrogenated oil + TBHQ across the line. Multiple floors fire. Benchmark concern snack cake.", confidence:"high", category:"food_beverage" }],
  ["entenmann's",                   { floor:5, ceiling:7, substances:["partially hydroginatedoil","TBHQ","artificial flavor"], reason:"Entenmann's — partially hydrogenated oil + TBHQ + artificial flavor across most products. Trans fat floor fires.", confidence:"high", category:"food_beverage" }],
  ["entenmanns",                    { floor:5, ceiling:7, substances:["partially hydrogenated oil","TBHQ"], reason:"Entenmann's — partially hydrogenated oil + TBHQ. Trans fat concern.", confidence:"high", category:"food_beverage" }],
  ["krispy kreme",                  { floor:5, ceiling:6, substances:["DATEM","TBHQ","artificial flavor","soybean oil"], reason:"Krispy Kreme — DATEM + TBHQ + artificial flavor + soybean oil. TBHQ floor fires. Fresh-made but still conventional additive profile.", confidence:"high", category:"food_beverage" }],
  ["otis spunkmeyer",               { floor:5, ceiling:7, substances:["partially hydrogenated oil","TBHQ","artificial flavor"], reason:"Otis Spunkmeyer muffins — partially hydrogenated oil + TBHQ + artificial flavor. Foodservice muffins with trans fat concern.", confidence:"high", category:"food_beverage" }],

  // ── GLUTEN FREE BREAD ─────────────────────────────────────────
  ["udi's gluten free",             { floor:3, ceiling:5, substances:["modified starch","xanthan gum","soy lecithin"], reason:"Udi's — modified tapioca starch + xanthan gum + soy lecithin. More additives than Canyon Bakehouse. Mid-tier GF bread.", confidence:"high", category:"food_beverage" }],
  ["udis",                          { floor:3, ceiling:5, substances:["modified starch","xanthan gum"], reason:"Udi's GF bread — multiple modified starches + gums. Mid-tier clean for gluten-free.", confidence:"medium", category:"food_beverage" }],
  ["schar bread",                   { floor:3, ceiling:5, substances:["modified starch","dextrose","preservatives"], reason:"Schär — European GF brand, some preservatives and modified starches. Better than US GF brands on average.", confidence:"medium", category:"food_beverage" }],
  ["base culture",            { floor:1, ceiling:3, substances:[], reason:"Base Culture — almond flour + egg base, no grains, no artificial additives. Benchmark cleanest gluten-free bread.", confidence:"high", category:"food_beverage" }],

  // ── RYKRISP ───────────────────────────────────────────────────
  ["rykrisp",                       { floor:1, ceiling:3, substances:[], reason:"RyKrisp — whole grain rye, minimal ingredients, no artificial additives. Clean crispbread alongside Wasa and Ryvita.", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // AUDIT 34 — BREAD AND BAKED GOODS
  // KEY CONCERN: Azodicarbonamide (ADA) — the "yoga mat chemical"
  // Banned in EU and Australia. Still legal in US commercial bread.
  // Forms semicarbazide when heated — a potential carcinogen.
  // Also: calcium propionate, HFCS, DATEM, potassium bromate,
  // mono and diglycerides (hidden trans fats).
  // ══════════════════════════════════════════════════════════════

  // ── SANDWICH BREAD: CONCERN TIER ─────────────────────────────
  ["natures own",                   { floor:4, ceiling:6, substances:["azodicarbonamide","calcium propionate","HFCS"], reason:"Nature's Own — ADA + calcium propionate + HFCS. Standard commercial bread concern.", confidence:"high", category:"food_beverage" }],
  ["sara lee bread",                { floor:4, ceiling:6, substances:["azodicarbonamide","calcium propionate","HFCS"], reason:"Sara Lee — azodicarbonamide + calcium propionate + HFCS. Same concern profile as Wonder and Nature's Own.", confidence:"high", category:"food_beverage" }],
  ["arnold bread",                  { floor:4, ceiling:5, substances:["calcium propionate","HFCS","azodicarbonamide"], reason:"Arnold — calcium propionate + HFCS + ADA in most varieties. Slightly cleaner than Wonder but still conventional concern.", confidence:"high", category:"food_beverage" }],
  ["king hawaiian",                 { floor:4, ceiling:6, substances:["azodicarbonamide","HFCS","calcium propionate"], reason:"King's Hawaiian rolls — ADA + HFCS + calcium propionate. Multiple concern ingredients.", confidence:"high", category:"food_beverage" }],
  ["martin's potato rolls",         { floor:4, ceiling:5, substances:["azodicarbonamide","HFCS","calcium propionate"], reason:"Martin's Potato Rolls — ADA + HFCS + calcium propionate. Classic American bun with conventional additive profile.", confidence:"high", category:"food_beverage" }],
  ["martins potato",                { floor:4, ceiling:5, substances:["azodicarbonamide","HFCS","calcium propionate"], reason:"Martin's Potato Rolls — ADA + HFCS + calcium propionate.", confidence:"high", category:"food_beverage" }],
  ["mission flour",                 { floor:4, ceiling:6, substances:["azodicarbonamide","calcium propionate","DATEM","enriched flour"], reason:"Mission Flour Tortillas — ADA + calcium propionate + DATEM dough conditioner + enriched flour. One of the most additive-loaded tortilla brands. Would be banned as-is in the EU.", confidence:"high", category:"food_beverage" }],
  ["guerrero tortillas",            { floor:4, ceiling:6, substances:["azodicarbonamide","calcium propionate","enriched flour"], reason:"Guerrero flour tortillas — ADA + calcium propionate + enriched flour. Same conventional concern as Mission.", confidence:"high", category:"food_beverage" }],
  ["old el paso tortillas",         { floor:4, ceiling:5, substances:["azodicarbonamide","enriched flour","calcium propionate"], reason:"Old El Paso flour tortillas — ADA + enriched flour + calcium propionate.", confidence:"high", category:"food_beverage" }],
  ["einstein bagels",               { floor:4, ceiling:5, substances:["azodicarbonamide","enriched flour","calcium propionate"], reason:"Einstein Bagels — ADA + enriched flour + calcium propionate. Commercial bagel chain with conventional additives.", confidence:"high", category:"food_beverage" }],
  ["wonder hamburger buns",         { floor:4, ceiling:6, substances:["azodicarbonamide","HFCS","calcium propionate"], reason:"Wonder Hamburger Buns — same ADA + HFCS + calcium propionate as Wonder Bread. Same formulation, different shape.", confidence:"high", category:"food_beverage" }],

  // ── PASTRIES: HIGH CONCERN ────────────────────────────────────
  ["pop tarts",                     { floor:6, ceiling:8, substances:["HFCS","TBHQ","Red 40","artificial flavor"], reason:"Pop Tarts — TBHQ + Red 40 + HFCS. Multiple floors fire.", confidence:"high", category:"food_beverage" }],
  ["pillsbury crescent",            { floor:4, ceiling:6, substances:["partially hydrogenated oil","DATEM","azodicarbonamide"], reason:"Pillsbury Crescent Rolls — partially hydrogenated oil (trans fat floor may fire) + DATEM + ADA.", confidence:"high", category:"food_beverage" }],
  ["pillsbury cinnamon rolls",      { floor:5, ceiling:7, substances:["HFCS","partially hydrogenated oil","artificial flavor","DATEM"], reason:"Pillsbury Cinnamon Rolls — HFCS + partially hydrogenated oil + artificial flavor. Frosting packet adds more HFCS + artificial color.", confidence:"high", category:"food_beverage" }],

  // ── BREAD: CLEAN TIER ─────────────────────────────────────────
  ["dave's killer",                 { floor:2, ceiling:4, substances:[], reason:"Dave's Killer — organic whole grain, no conventional dough additives. Clean bread and bagel brand.", confidence:"high", category:"food_beverage" }],
  ["ezekiel 4",                     { floor:1, ceiling:2, substances:[], reason:"Ezekiel 4:9 sprouted bread — flourless, no additives. Cleanest benchmark.", confidence:"high", category:"food_beverage" }],
  ["vermont bread",                 { floor:1, ceiling:3, substances:[], reason:"Vermont Bread Company — USDA Organic, no ADA, no HFCS. Clean organic bread.", confidence:"high", category:"food_beverage" }],
  ["franz organic",                 { floor:2, ceiling:4, substances:[], reason:"Franz Organic — USDA Organic, no artificial additives. Cleaner than conventional Franz varieties.", confidence:"high", category:"food_beverage" }],

  // ── TORTILLAS: CLEAN TIER ─────────────────────────────────────
  ["la tortilla factory",           { floor:3, ceiling:5, substances:["enriched flour","calcium propionate"], reason:"La Tortilla Factory — enriched flour + calcium propionate in most varieties. Cleaner than Mission but still processed.", confidence:"medium", category:"food_beverage" }],
  ["maria and ricardos",            { floor:3, ceiling:4, substances:["enriched flour"], reason:"Maria and Ricardo's — enriched flour, simpler formula than Mission. No ADA in most varieties.", confidence:"medium", category:"food_beverage" }],

  // ── GLUTEN FREE ───────────────────────────────────────────────
  ["canyon bakehouse",              { floor:3, ceiling:5, substances:["tapioca starch","xanthan gum","modified starch"], reason:"Canyon Bakehouse — rice flour + tapioca starch + xanthan gum. No ADA (inherently GF) but more processed than sprouted bread.", confidence:"high", category:"food_beverage" }],

  // ── PITA AND OTHER ────────────────────────────────────────────
  ["stacy's pita",                  { floor:3, ceiling:5, substances:["enriched flour","sunflower oil"], reason:"Stacy's Pita Chips — enriched flour + sunflower oil. Mid-tier. No ADA but enriched flour concern.", confidence:"medium", category:"food_beverage" }],
  ["ak-mak",                        { floor:1, ceiling:3, substances:[], reason:"Ak-Mak — 100% stone-ground whole wheat, no artificial additives, no ADA. Benchmark clean cracker.", confidence:"high", category:"food_beverage" }],
  ["ak mak",                        { floor:1, ceiling:3, substances:[], reason:"Ak-Mak crackers — whole wheat, clean. Benchmark.", confidence:"high", category:"food_beverage" }],
  ["brioche pasquier",              { floor:3, ceiling:5, substances:["enriched flour","soybean oil"], reason:"Brioche Pasquier — French brioche with enriched flour + soybean oil. Simpler than American bread but still processed.", confidence:"medium", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // AUDIT 35 — WOMEN'S PERSONAL CARE
  // KEY CONCERNS: Parabens, synthetic fragrance, talc, PPD in hair
  // color, chlorine-bleached rayon near mucosal tissue, aluminum
  // in antiperspirants, chemical UV filters.
  // ══════════════════════════════════════════════════════════════

  // ── FOUNDATION / FACE MAKEUP: CONCERN ────────────────────────
  ["maybelline fit me",             { floor:4, ceiling:6, substances:["talc","synthetic fragrance","parabens","titanium dioxide"], reason:"Maybelline Fit Me — talc (IARC 2A) + synthetic fragrance + parabens in some formulas. Mainstream drugstore makeup concern.", confidence:"high", category:"personal_care" }],
  ["true match",             { floor:4, ceiling:6, substances:["talc","synthetic fragrance","parabens"], reason:"L'Oréal True Match — talc + synthetic fragrance + parabens. Standard drugstore makeup concern.", confidence:"high", category:"personal_care" }],
  ["covergirl clean",               { floor:4, ceiling:5, substances:["mineral oil","talc","parabens"], reason:"CoverGirl Clean — mineral oil + talc + parabens. 'Clean' marketing doesn't reflect formula.", confidence:"medium", category:"personal_care" }],
  ["nyx foundation",                { floor:4, ceiling:5, substances:["synthetic fragrance","talc","parabens"], reason:"NYX Foundation — synthetic fragrance + talc + parabens. Budget makeup concern.", confidence:"high", category:"personal_care" }],
  ["nars foundation",               { floor:4, ceiling:5, substances:["synthetic fragrance","talc","parabens"], reason:"NARS Sheer Glow — synthetic fragrance + talc + parabens. Premium price, conventional concern.", confidence:"medium", category:"personal_care" }],
  ["fenty beauty",                  { floor:3, ceiling:5, substances:["synthetic fragrance","dimethicone"], reason:"Fenty Beauty — no parabens, no talc in liquid foundation, but synthetic fragrance + dimethicone. Better than drugstore, not clean-label.", confidence:"medium", category:"personal_care" }],
  ["fenty gloss bomb",              { floor:3, ceiling:5, substances:["synthetic fragrance","dimethicone"], reason:"Fenty Gloss Bomb — synthetic fragrance + dimethicone. Same concern tier as Fenty Beauty. Lip application with ingestion risk.", confidence:"high", category:"personal_care" }],
  ["fenty skin",                    { floor:3, ceiling:5, substances:["synthetic fragrance","dimethicone"], reason:"Fenty Skin — same brand positioning. Synthetic fragrance + dimethicone. Better than drugstore but not clean.", confidence:"medium", category:"personal_care" }],
  // FOUNDATION CLEAN
  ["ilia",                          { floor:1, ceiling:3, substances:[], reason:"ILIA — EWG Verified clean cosmetics. Benchmark across foundation, mascara, and lip products.", confidence:"high", category:"personal_care" }],
  ["kosas",                         { floor:1, ceiling:3, substances:[], reason:"Kosas — EWG Verified, no synthetic fragrance, no parabens. Benchmark clean makeup.", confidence:"high", category:"personal_care" }],
  ["saie beauty",                   { floor:1, ceiling:3, substances:[], reason:"Saie — EWG Verified, clean ingredients, no synthetic fragrance. Benchmark clean makeup.", confidence:"high", category:"personal_care" }],
  ["axiology",                      { floor:1, ceiling:2, substances:[], reason:"Axiology — vegan, EWG Verified, palm oil free. Benchmark cleanest lipstick available.", confidence:"high", category:"personal_care" }],
  // MASCARA CONCERN
  ["loreal telescopic",             { floor:5, ceiling:7, substances:["propylparaben","aluminum powder","synthetic fragrance"], reason:"L'Oréal Telescopic — propylparaben + aluminum powder + synthetic fragrance near eyes daily. Paraben floor fires.", confidence:"high", category:"personal_care" }],
  ["covergirl lash blast",          { floor:5, ceiling:7, substances:["propylparaben","aluminum stearate","synthetic fragrance"], reason:"CoverGirl Lash Blast — propylparaben + aluminum stearate (WF banned) + synthetic fragrance applied near eyes.", confidence:"high", category:"personal_care" }],
  ["too faced better than sex",     { floor:4, ceiling:6, substances:["synthetic fragrance","parabens","phenoxyethanol"], reason:"Too Faced Better Than Sex — synthetic fragrance + parabens near eyes. Premium price, conventional concern.", confidence:"high", category:"personal_care" }],
  // MASCARA CLEAN
  ["honest beauty mascara",         { floor:1, ceiling:3, substances:[], reason:"Honest Beauty Mascara — EWG Certified, no parabens, no synthetic fragrance. Clean mascara benchmark.", confidence:"high", category:"personal_care" }],
  ["w3ll people",                   { floor:1, ceiling:3, substances:[], reason:"W3LL People — EWG Verified, COSMOS certified organic. Benchmark clean cosmetics brand.", confidence:"high", category:"personal_care" }],
  // LIP CONCERN
  ["revlon",               { floor:5, ceiling:7, substances:["D&C Red 7","synthetic fragrance","parabens"], reason:"Revlon Lipstick — D&C Red synthetic dyes + synthetic fragrance + parabens. Lip products are partially ingested. Dye floors fire.", confidence:"high", category:"personal_care" }],
  ["loreal colour riche",           { floor:5, ceiling:6, substances:["synthetic dyes","parabens","synthetic fragrance"], reason:"L'Oréal Colour Riche — synthetic dyes + parabens + synthetic fragrance. Ingested lip product concern.", confidence:"high", category:"personal_care" }],
  ["maybelline superstay lip",      { floor:4, ceiling:6, substances:["synthetic fragrance","artificial color"], reason:"Maybelline SuperStay lip — synthetic fragrance + artificial color in ingested lip product.", confidence:"high", category:"personal_care" }],
  // SKINCARE CONCERN
  ["neutrogena rapid wrinkle",      { floor:4, ceiling:6, substances:["phenoxyethanol","synthetic fragrance","dimethicone"], reason:"Neutrogena Rapid Wrinkle Repair — phenoxyethanol + synthetic fragrance + dimethicone.", confidence:"high", category:"personal_care" }],
  ["olay regenerist",               { floor:4, ceiling:6, substances:["synthetic fragrance","dimethicone","parabens"], reason:"Olay Regenerist — synthetic fragrance + dimethicone + parabens. Widely marketed but conventional concern.", confidence:"high", category:"personal_care" }],
  ["olay",                          { floor:4, ceiling:6, substances:["synthetic fragrance","dimethicone","parabens"], reason:"Olay brand — synthetic fragrance + dimethicone + parabens across the line.", confidence:"medium", category:"personal_care" }],
  ["cerave moisturizing",           { floor:3, ceiling:5, substances:["phenoxyethanol","synthetic fragrance"], reason:"CeraVe Moisturizing — ceramides are beneficial but phenoxyethanol + synthetic fragrance present. Dermatologist-recommended doesn't mean clean.", confidence:"high", category:"personal_care" }],
  ["pond's cream",                  { floor:4, ceiling:6, substances:["mineral oil","synthetic fragrance","parabens"], reason:"Pond's Cold Cream — mineral oil + synthetic fragrance + parabens. Classic moisturizer, conventional concern.", confidence:"high", category:"personal_care" }],
  ["tatcha",                        { floor:3, ceiling:5, substances:["synthetic fragrance","phenoxyethanol"], reason:"Tatcha — cleaner than Western drugstore, but synthetic fragrance + phenoxyethanol in most products. Mid-tier clean.", confidence:"medium", category:"personal_care" }],
  ["tula skincare",                 { floor:3, ceiling:5, substances:["synthetic fragrance","phenoxyethanol"], reason:"Tula — probiotic skincare, synthetic fragrance + phenoxyethanol in most formulas.", confidence:"medium", category:"personal_care" }],
  // SKINCARE CLEAN
  ["youth to the people",           { floor:1, ceiling:3, substances:[], reason:"Youth to the People — plant-based, EWG-friendly, no synthetic fragrance or parabens. Benchmark clean skincare.", confidence:"high", category:"personal_care" }],
  ["drunk elephant",                { floor:2, ceiling:4, substances:[], reason:"Drunk Elephant — avoids the 'Suspicious 6'. Clean-leaning brand with clinical actives.", confidence:"high", category:"personal_care" }],
  ["the ordinary",                  { floor:2, ceiling:4, substances:[], reason:"The Ordinary — single-ingredient focus, minimal formulas, no synthetic fragrance. Clean-leaning clinical skincare.", confidence:"high", category:"personal_care" }],
  ["cocokind",                      { floor:1, ceiling:3, substances:[], reason:"Cocokind — organic ingredients, no synthetic fragrance or parabens. Benchmark clean skincare.", confidence:"high", category:"personal_care" }],
  // SUNSCREEN CONCERN
  ["supergoop",                     { floor:5, ceiling:7, substances:["homosalate","octisalate","octinoxate"], reason:"Supergoop Unseen — chemical UV filters (homosalate, octisalate, octinoxate). Homosalate is EU-restricted endocrine disruptor.", confidence:"high", category:"personal_care" }],
  ["sun bum",             { floor:5, ceiling:7, substances:["avobenzone","homosalate","octisalate"], reason:"Sun Bum — avobenzone + homosalate + octisalate chemical UV filters. Endocrine concern.", confidence:"high", category:"personal_care" }],
  ["la roche posay sunscreen",      { floor:4, ceiling:6, substances:["avobenzone","homosalate"], reason:"La Roche-Posay — chemical UV filters in most formulas. Their Mineral line is cleaner.", confidence:"medium", category:"personal_care" }],
  // SUNSCREEN CLEAN
  ["blue lizard",                   { floor:1, ceiling:3, substances:[], reason:"Blue Lizard — zinc oxide or titanium dioxide mineral UV filters, no chemical UV filters. Benchmark clean sunscreen.", confidence:"high", category:"personal_care" }],
  // HAIRCARE CONCERN
  ["herbal essences",               { floor:4, ceiling:6, substances:["SLES","synthetic fragrance","dimethicone","parabens"], reason:"Herbal Essences — SLES + heavy synthetic fragrance + dimethicone + parabens. 'Natural' branding doesn't match formula.", confidence:"high", category:"personal_care" }],
  ["loreal elvive",                 { floor:4, ceiling:5, substances:["SLES","synthetic fragrance","dimethicone"], reason:"L'Oréal Elvive — SLES + synthetic fragrance + dimethicone. Standard drugstore haircare concern.", confidence:"high", category:"personal_care" }],
  ["garnier fructis",               { floor:4, ceiling:5, substances:["SLES","synthetic fragrance","dimethicone"], reason:"Garnier Fructis — SLES + synthetic fragrance + dimethicone. Fruit marketing, conventional formula.", confidence:"high", category:"personal_care" }],
  ["ogx",                           { floor:4, ceiling:6, substances:["SLES","synthetic fragrance","cocamide DEA"], reason:"OGX — cocamide DEA (California Prop 65 listed) + SLES + synthetic fragrance. Higher-concern drugstore haircare.", confidence:"high", category:"personal_care" }],
  // HAIRCARE CLEAN
  ["olaplex",                       { floor:2, ceiling:4, substances:[], reason:"Olaplex — bond-building technology, no synthetic fragrance or parabens. Cleaner than most professional haircare.", confidence:"high", category:"personal_care" }],
  ["innersense",                    { floor:1, ceiling:2, substances:[], reason:"Innersense Organic Beauty — USDA Organic certified, no synthetic fragrance or parabens. Benchmark cleanest haircare.", confidence:"high", category:"personal_care" }],
  // HAIR COLOR
  ["loreal excellence hair",        { floor:6, ceiling:8, substances:["PPD","resorcinol","ammonia"], reason:"L'Oréal Excellence — PPD (p-phenylenediamine, IARC Group 2A, linked to bladder cancer) + resorcinol + ammonia. Permanent hair color critical concern.", confidence:"high", category:"personal_care" }],
  ["clairol",                       { floor:6, ceiling:8, substances:["PPD","resorcinol","ammonia"], reason:"Clairol permanent color — PPD + resorcinol + ammonia. Chemical hair color critical concern floors fire.", confidence:"high", category:"personal_care" }],
  ["madison reed hair",             { floor:4, ceiling:6, substances:["PPD"], reason:"Madison Reed — ammonia-free but still contains PPD in most permanent formulas. Cleaner process, same core chemical concern.", confidence:"medium", category:"personal_care" }],
  ["dphue",                         { floor:2, ceiling:4, substances:[], reason:"dpHUE — color depositing, no PPD, no ammonia. Among the cleanest hair color options.", confidence:"high", category:"personal_care" }],
  ["lime crime hair",               { floor:2, ceiling:4, substances:[], reason:"Lime Crime — semi-permanent direct dye, no PPD, no ammonia. Cleaner than permanent color.", confidence:"high", category:"personal_care" }],
  // FEMININE HYGIENE
  ["always",                   { floor:5, ceiling:7, substances:["synthetic fragrance","chlorine-bleached rayon","dioxin"], reason:"Always Pads — synthetic fragrance + chlorine-bleached rayon applied to sensitive mucosal tissue daily. Synthetic fragrance near vulvar tissue is primary concern.", confidence:"high", category:"personal_care" }],
  ["tampax",                        { floor:5, ceiling:7, substances:["synthetic fragrance","chlorine-bleached rayon"], reason:"Tampax — chlorine-bleached rayon + synthetic fragrance in Pearl variety. Direct mucosal insertion for hours daily.", confidence:"high", category:"personal_care" }],
  ["playtex tampons",               { floor:5, ceiling:6, substances:["chlorine-bleached rayon","synthetic fragrance"], reason:"Playtex — chlorine-bleached rayon + synthetic fragrance. Same mucosal exposure concern as Tampax.", confidence:"high", category:"personal_care" }],
  ["seventh generation pads",       { floor:1, ceiling:3, substances:[], reason:"Seventh Generation — unbleached cotton, no synthetic fragrance. Benchmark clean period product.", confidence:"high", category:"personal_care" }],
  ["cora organic",                  { floor:1, ceiling:2, substances:[], reason:"Cora — certified organic cotton, fragrance-free, no chlorine bleaching. Benchmark cleanest mainstream period product.", confidence:"high", category:"personal_care" }],
  ["rael organic",                  { floor:1, ceiling:2, substances:[], reason:"Rael — certified organic cotton, fragrance-free. Benchmark clean period care.", confidence:"high", category:"personal_care" }],
  ["lola tampons",                  { floor:1, ceiling:3, substances:[], reason:"Lola — 100% organic cotton, fragrance-free. Benchmark clean tampon brand.", confidence:"high", category:"personal_care" }],
  ["saalt",                         { floor:1, ceiling:2, substances:[], reason:"Saalt — medical-grade silicone menstrual cup. Zero waste, no rayon or fragrance. Benchmark cleanest period product.", confidence:"high", category:"personal_care" }],
  ["always pads",                    { floor:5, ceiling:7, substances:["synthetic fragrance","chlorine-bleached rayon","dioxin"], reason:"Always Pads — synthetic fragrance + chlorine-bleached rayon. Direct vulvar tissue contact daily.", confidence:"high", category:"personal_care" }],
  ["always ultra thin",              { floor:5, ceiling:7, substances:["synthetic fragrance","chlorine-bleached rayon","dioxin"], reason:"Always Ultra Thin — same rayon/fragrance concern as Always Pads. Thinner pad but same materials.", confidence:"high", category:"personal_care" }],
  ["always infinity",                { floor:5, ceiling:7, substances:["synthetic fragrance","foam core"], reason:"Always Infinity — FlexFoam core (polyethylene/polypropylene) + synthetic fragrance. Plastic-based absorbent core.", confidence:"high", category:"personal_care" }],
  ["tampax pearl",                   { floor:5, ceiling:7, substances:["synthetic fragrance","chlorine-bleached rayon","plastic applicator"], reason:"Tampax Pearl — rayon/cotton blend + synthetic fragrance + plastic applicator. Pearl line has more fragrance than basic.", confidence:"high", category:"personal_care" }],
  ["kotex",                          { floor:5, ceiling:7, substances:["synthetic fragrance","chlorine-bleached rayon"], reason:"Kotex — chlorine-bleached rayon + synthetic fragrance. Same mucosal exposure tier as Always.", confidence:"high", category:"personal_care" }],
  ["u by kotex",                     { floor:5, ceiling:7, substances:["synthetic fragrance","chlorine-bleached rayon"], reason:"U by Kotex — same rayon/fragrance concern as Kotex. Marketed younger but same materials.", confidence:"high", category:"personal_care" }],
  ["stayfree",                       { floor:5, ceiling:7, substances:["synthetic fragrance","chlorine-bleached rayon"], reason:"Stayfree — chlorine-bleached rayon + synthetic fragrance. Same concern tier as Always and Kotex.", confidence:"high", category:"personal_care" }],
  ["carefree",                       { floor:5, ceiling:6, substances:["synthetic fragrance","polyethylene"], reason:"Carefree liners — thinner than pads but synthetic fragrance + polyethylene film. Daily liner use = chronic low-level exposure.", confidence:"high", category:"personal_care" }],
  ["playtex sport",                  { floor:5, ceiling:6, substances:["chlorine-bleached rayon","plastic applicator"], reason:"Playtex Sport — rayon + plastic applicator. No fragrance in sport line but still chlorine-bleached.", confidence:"high", category:"personal_care" }],
  ["diva cup",                       { floor:1, ceiling:2, substances:[], reason:"DivaCup — medical-grade silicone, no rayon, no fragrance, no bleach. Reusable. Benchmark clean period product.", confidence:"high", category:"personal_care" }],
  ["cora tampons",                   { floor:1, ceiling:2, substances:[], reason:"Cora tampons — certified organic cotton, fragrance-free, no chlorine bleaching. Benchmark clean tampon.", confidence:"high", category:"personal_care" }],
  ["august pads",                    { floor:1, ceiling:2, substances:[], reason:"August — certified organic cotton pads, fragrance-free, no chlorine bleaching. B Corp certified.", confidence:"high", category:"personal_care" }],
  ["rael pads",                      { floor:1, ceiling:2, substances:[], reason:"Rael — certified organic cotton pads, fragrance-free. Benchmark clean pad brand.", confidence:"high", category:"personal_care" }],
  ["saalt cup",                      { floor:1, ceiling:2, substances:[], reason:"Saalt Cup — medical-grade silicone menstrual cup. Same as Saalt entry.", confidence:"high", category:"personal_care" }],
  // INTIMATE CARE
  ["monistat",                       { floor:3, ceiling:5, substances:[], reason:"Monistat — antifungal medication (miconazole). OTC drug, not cosmetic. Limited chemical concern beyond inactive ingredients.", confidence:"medium", category:"personal_care" }],
  // PREGNANCY / NURSING
  ["prenatal vitamin",               { floor:2, ceiling:4, substances:[], reason:"Prenatal vitamins — essential supplement but quality varies. Check for synthetic dyes, titanium dioxide. Clean brands: Ritual, MegaFood, Garden of Life.", confidence:"medium", category:"supplement" }],
  ["prenatal",                       { floor:2, ceiling:4, substances:[], reason:"Prenatal supplement — quality varies widely. Look for third-party tested, no synthetic dyes.", confidence:"medium", category:"supplement" }],
  ["folic acid",                     { floor:2, ceiling:3, substances:[], reason:"Folic acid supplement — essential for pregnancy. Most are clean tablets. Check for synthetic dyes in gummy versions.", confidence:"medium", category:"supplement" }],
  ["breast pump",                    { floor:3, ceiling:5, substances:["BPA-free plastic","silicone"], reason:"Breast pump — BPA-free plastic + silicone flanges. Direct milk contact with plastic. Clean alternatives use glass collection bottles.", confidence:"medium", category:"baby" }],
  ["medela",                         { floor:3, ceiling:5, substances:["BPA-free plastic","polypropylene"], reason:"Medela — BPA-free polypropylene bottles + silicone flanges. Industry standard but still plastic milk contact.", confidence:"high", category:"baby" }],
  ["spectra",                        { floor:3, ceiling:5, substances:["BPA-free plastic","polypropylene"], reason:"Spectra — BPA-free polypropylene. Same material concern as Medela. Hospital-grade but still plastic.", confidence:"high", category:"baby" }],
  ["haakaa",                         { floor:2, ceiling:3, substances:["silicone"], reason:"Haakaa — 100% food-grade silicone, no plastic parts. Cleanest breast pump option. No motor, no tubing.", confidence:"high", category:"baby" }],
  ["lansinoh",                       { floor:2, ceiling:4, substances:[], reason:"Lansinoh nipple cream — ultra-purified lanolin, single ingredient. Safe for baby to ingest. Clean product.", confidence:"high", category:"personal_care" }],
  ["earth mama",                     { floor:1, ceiling:3, substances:[], reason:"Earth Mama — organic nipple butter and body products for pregnancy/nursing. No synthetic fragrance, no parabens. Benchmark clean pregnancy brand.", confidence:"high", category:"personal_care" }],
  ["earth mama diaper balm",         { floor:1, ceiling:2, substances:[], reason:"Earth Mama Organic Diaper Balm — organic herbs + olive oil + shea butter. No petroleum, no zinc oxide. Benchmark cleanest diaper cream.", confidence:"high", category:"baby" }],
  ["motherlove nipple cream",        { floor:1, ceiling:2, substances:[], reason:"Motherlove — organic herbs + olive oil + beeswax. No lanolin (vegan alternative). Safe for baby ingestion.", confidence:"high", category:"personal_care" }],
  ["bamboobies nursing pads",        { floor:1, ceiling:2, substances:[], reason:"Bamboobies — organic bamboo velour nursing pads. Reusable, no plastic, no chemicals. Benchmark clean nursing pad.", confidence:"high", category:"personal_care" }],
  // PREGNANCY SKINCARE
  ["bio oil",                        { floor:4, ceiling:6, substances:["mineral oil","synthetic fragrance","BHT"], reason:"Bio-Oil — mineral oil base + synthetic fragrance + BHT preservative. Petroleum-derived applied to pregnant belly daily. Clean alternatives: jojoba or rosehip oil.", confidence:"high", category:"personal_care" }],
  ["palmers cocoa butter",           { floor:4, ceiling:6, substances:["mineral oil","synthetic fragrance","parabens"], reason:"Palmer's Cocoa Butter — mineral oil + synthetic fragrance + parabens in some formulas. Cocoa butter is clean but base formula is petroleum-derived.", confidence:"high", category:"personal_care" }],
  ["palmers stretch mark",           { floor:4, ceiling:6, substances:["mineral oil","synthetic fragrance","parabens"], reason:"Palmer's Stretch Mark — same concerns as Palmer's Cocoa Butter. Mineral oil base + fragrance.", confidence:"high", category:"personal_care" }],
  ["belli skincare",                 { floor:1, ceiling:3, substances:[], reason:"Belli Skincare — OB-GYN recommended, teratology screened (tested for birth defect risk). No synthetic fragrance, no parabens, no phthalates. Benchmark clean pregnancy skincare.", confidence:"high", category:"personal_care" }],
  ["mama mio",                       { floor:2, ceiling:4, substances:["synthetic fragrance"], reason:"Mama Mio — pregnancy-specific brand. Some products contain synthetic fragrance. No parabens. Cleaner than Palmer's but not benchmark.", confidence:"medium", category:"personal_care" }],
  ["eight sheep organics",           { floor:1, ceiling:2, substances:[], reason:"Eight Sheep Organics — organic magnesium lotion for pregnancy. Minimal ingredients, no synthetic fragrance. Clean pregnancy body care.", confidence:"high", category:"personal_care" }],
  // PRENATAL SUPPLEMENTS
  ["one a day prenatal",             { floor:4, ceiling:6, substances:["synthetic dyes","titanium dioxide","BHT"], reason:"One A Day Prenatal — FD&C dyes + titanium dioxide (IARC 2B) + BHT. Bayer brand. Switch to Ritual or Needed for clean prenatal.", confidence:"high", category:"supplement" }],
  ["nature made prenatal",           { floor:3, ceiling:5, substances:["titanium dioxide"], reason:"Nature Made Prenatal — titanium dioxide coating (IARC 2B) but no synthetic dyes. USP verified. Cleaner than One A Day but not benchmark.", confidence:"high", category:"supplement" }],
  ["smarty pants prenatal",          { floor:3, ceiling:5, substances:["synthetic dyes","sugar"], reason:"SmartyPants Prenatal — gummy format with synthetic dyes + added sugar (3g per serving). No artificial flavors. Gummy prenatal tier.", confidence:"high", category:"supplement" }],
  ["olly prenatal",                  { floor:4, ceiling:6, substances:["synthetic dyes","sugar","synthetic fragrance"], reason:"Olly Prenatal — gummy with synthetic dyes + sugar + synthetic fragrance (coated). Unilever owned.", confidence:"high", category:"supplement" }],
  ["needed prenatal",                { floor:1, ceiling:3, substances:[], reason:"Needed Prenatal — third-party tested, no synthetic dyes, no titanium dioxide. Practitioner-formulated. Benchmark clean prenatal.", confidence:"high", category:"supplement" }],
  ["nordic naturals prenatal dha",   { floor:1, ceiling:3, substances:[], reason:"Nordic Naturals Prenatal DHA — third-party tested, no synthetic dyes, molecular distillation. Clean fish oil for pregnancy.", confidence:"high", category:"supplement" }],
  ["garden of life prenatal",        { floor:1, ceiling:3, substances:[], reason:"Garden of Life mykind Prenatal — USDA Organic, whole-food derived, no synthetic dyes. Benchmark clean prenatal.", confidence:"high", category:"supplement" }],
  ["postnatal vitamin",              { floor:2, ceiling:4, substances:[], reason:"Postnatal vitamins — quality varies. Look for third-party tested, no synthetic dyes. Needed and Ritual make clean postnatal options.", confidence:"medium", category:"supplement" }],
  ["lactation supplement",           { floor:2, ceiling:4, substances:[], reason:"Lactation supplements — fenugreek, blessed thistle, moringa. Quality varies. Legendairy Milk and Majka are clean options.", confidence:"medium", category:"supplement" }],
  ["fenugreek supplement",           { floor:2, ceiling:3, substances:[], reason:"Fenugreek — common galactagogue herb for breastfeeding. Simple capsule formulation usually clean.", confidence:"medium", category:"supplement" }],
  // BABY BOTTLES
  ["dr browns bottle",               { floor:3, ceiling:4, substances:["BPA-free polypropylene"], reason:"Dr. Brown's — BPA-free polypropylene bottles with silicone nipples. Anti-colic vent system. Glass option available (score 1-2).", confidence:"high", category:"baby" }],
  ["avent bottle",                   { floor:3, ceiling:5, substances:["BPA-free polypropylene"], reason:"Philips Avent — BPA-free polypropylene. Natural line has wider nipple. Glass option available (score 1-2).", confidence:"high", category:"baby" }],
  ["comotomo bottle",                { floor:2, ceiling:3, substances:["silicone"], reason:"Comotomo — 100% silicone body + silicone nipple. No plastic, no BPA. Closest to breast feel. Benchmark clean bottle.", confidence:"high", category:"baby" }],
  ["tommee tippee bottle",           { floor:3, ceiling:5, substances:["BPA-free polypropylene"], reason:"Tommee Tippee — BPA-free polypropylene. Closer to Nature line. Conventional plastic bottle tier.", confidence:"high", category:"baby" }],
  ["mam bottle",                     { floor:3, ceiling:5, substances:["BPA-free polypropylene"], reason:"MAM — BPA-free polypropylene with self-sterilizing base. Conventional plastic bottle tier.", confidence:"high", category:"baby" }],
  ["baby brezza",                    { floor:4, ceiling:6, substances:["BPA-free plastic","electronic components"], reason:"Baby Brezza — formula dispenser with BPA-free plastic reservoir. Hot water + plastic contact. Multiple plastic components in milk path.", confidence:"medium", category:"baby" }],
  // BABY FORMULA
  ["enfamil formula",                { floor:3, ceiling:5, substances:["corn syrup solids","soy lecithin"], reason:"Enfamil — corn syrup solids as carbohydrate source in some formulas + soy lecithin. Standard tier. Lactose-first formulas are cleaner.", confidence:"high", category:"baby" }],
  ["similac formula",                { floor:3, ceiling:5, substances:["corn syrup solids","soy lecithin","palm oil"], reason:"Similac — palm oil + corn syrup solids in some formulas. Abbott brand. OptiGRO marketed but standard ingredients.", confidence:"high", category:"baby" }],
  ["bobbie formula",                 { floor:2, ceiling:3, substances:[], reason:"Bobbie — organic, EU-standard formula. Lactose-first (no corn syrup). No palm oil. USDA Organic. Benchmark clean formula.", confidence:"high", category:"baby" }],
  ["byheart formula",                { floor:2, ceiling:3, substances:[], reason:"ByHeart — whole milk protein (not skim), no corn syrup, patented fat blend. Clean premium formula.", confidence:"high", category:"baby" }],
  ["happy baby formula",             { floor:2, ceiling:4, substances:[], reason:"Happy Baby Organic — USDA Organic, lactose-first. No corn syrup solids. Clean organic formula tier.", confidence:"high", category:"baby" }],
  // BABY SKINCARE
  ["cetaphil baby",                  { floor:3, ceiling:5, substances:["synthetic fragrance","dimethicone"], reason:"Cetaphil Baby — dimethicone + synthetic fragrance in some products. Cleaner than Johnson's but not clean. Fragrance-free version is better.", confidence:"high", category:"baby" }],
  ["mustela",                        { floor:3, ceiling:4, substances:["synthetic fragrance"], reason:"Mustela — French pharmacy baby brand. Some synthetic fragrance in scented lines. Fragrance-free line is cleaner. No parabens.", confidence:"high", category:"baby" }],
  ["honest company baby",            { floor:2, ceiling:4, substances:[], reason:"Honest Company baby — no synthetic fragrance, no parabens. Some products contain plant-derived ingredients that are gentle. Clean baby tier.", confidence:"high", category:"baby" }],
  ["pipette baby",                   { floor:2, ceiling:3, substances:[], reason:"Pipette — squalane-based, no synthetic fragrance, no parabens. Amyris brand (biotech-derived ingredients). Clean baby tier.", confidence:"high", category:"baby" }],
  // BABY WASH/SHAMPOO
  ["johnsons baby shampoo",          { floor:4, ceiling:6, substances:["synthetic fragrance","quaternium-15","1,4-dioxane"], reason:"Johnson's Baby Shampoo — reformulated to remove formaldehyde-releasers but still contains synthetic fragrance. Historical 1,4-dioxane contamination. No longer 'no more tears' safe image.", confidence:"high", category:"baby" }],
  ["johnson baby wash",              { floor:4, ceiling:6, substances:["synthetic fragrance","1,4-dioxane trace"], reason:"Johnson's Baby Wash — synthetic fragrance + historical 1,4-dioxane trace concerns. Switch to California Baby or Tubby Todd.", confidence:"high", category:"baby" }],
  ["dove baby wash",                 { floor:3, ceiling:5, substances:["synthetic fragrance","dimethicone"], reason:"Dove Baby — synthetic fragrance + dimethicone. Better than Johnson's but not clean. Fragrance-free version is better.", confidence:"high", category:"baby" }],
  ["honest baby wash",               { floor:2, ceiling:3, substances:[], reason:"Honest Baby Wash — no synthetic fragrance, no parabens, no SLS. Plant-derived cleansers. Clean baby wash tier.", confidence:"high", category:"baby" }],
  ["puracy baby shampoo",            { floor:1, ceiling:3, substances:[], reason:"Puracy Baby Shampoo — plant-based, no synthetic fragrance, no sulfates, no parabens. Pediatrician developed. Benchmark clean.", confidence:"high", category:"baby" }],
  ["attitude baby",                  { floor:1, ceiling:3, substances:[], reason:"ATTITUDE Baby — EWG verified, no synthetic fragrance, no SLS, no parabens. Hypoallergenic. Clean baby care.", confidence:"high", category:"baby" }],
  // DIAPER CREAM
  ["desitin",                        { floor:4, ceiling:5, substances:["synthetic fragrance","parabens","petrolatum"], reason:"Desitin — zinc oxide active but contains petrolatum + synthetic fragrance + parabens in original formula. Maximum Strength is cleaner (fewer additives).", confidence:"high", category:"baby" }],
  ["boudreaux butt paste",           { floor:3, ceiling:5, substances:["synthetic fragrance"], reason:"Boudreaux's Butt Paste — zinc oxide + synthetic fragrance in original. Natural version (green tube) is fragrance-free and cleaner.", confidence:"high", category:"baby" }],
  ["a&d ointment",                   { floor:3, ceiling:5, substances:["petrolatum","synthetic fragrance"], reason:"A+D Ointment — petrolatum base + synthetic fragrance. Petroleum-derived barrier cream. Zinc oxide version is better.", confidence:"high", category:"baby" }],
  ["aquaphor diaper cream",          { floor:3, ceiling:4, substances:["petrolatum"], reason:"Aquaphor Baby Diaper Cream — petrolatum base + zinc oxide. No synthetic fragrance. Cleaner than Desitin original.", confidence:"high", category:"baby" }],
  ["honest diaper cream",            { floor:2, ceiling:3, substances:[], reason:"Honest Diaper Cream — plant-based, no petroleum, no synthetic fragrance, no parabens. Zinc oxide + shea butter. Clean diaper cream.", confidence:"high", category:"baby" }],
  // DIAPERS
  ["huggies",                        { floor:5, ceiling:7, substances:["chlorine-bleached pulp","SAP","lotions","synthetic fragrance"], reason:"Huggies — chlorine-bleached wood pulp + superabsorbent polymer + synthetic lotion/fragrance in some variants. Class action re: Ahcovel-Base.", confidence:"high", category:"baby" }],
  ["pampers",                        { floor:5, ceiling:7, substances:["chlorine-bleached pulp","SAP","lotions","synthetic fragrance"], reason:"Pampers — chlorine-bleached wood pulp + SAP + Pampers lotion + synthetic fragrance in scented varieties. P&G brand.", confidence:"high", category:"baby" }],
  ["honest diapers",                 { floor:3, ceiling:4, substances:["SAP","plant-based materials"], reason:"Honest Diapers — plant-based materials, no chlorine bleaching, no latex, no fragrance, no lotions. Cleaner than Huggies/Pampers.", confidence:"high", category:"baby" }],
  ["dyper diapers",                  { floor:2, ceiling:3, substances:["bamboo viscose"], reason:"DYPER — bamboo viscose, no chlorine, no fragrance, no lotions. Compostable. Benchmark clean disposable diaper.", confidence:"high", category:"baby" }],
  ["coterie diapers",                { floor:2, ceiling:4, substances:["SAP"], reason:"Coterie — sustainably sourced wood pulp, no chlorine, no fragrance, no lotions. Premium clean diaper. SAP is standard.", confidence:"high", category:"baby" }],
  ["kudos diapers",                  { floor:2, ceiling:3, substances:["organic cotton"], reason:"Kudos — organic cotton liner, no chlorine, no fragrance, no lotions. Plant-based back sheet. Benchmark clean diaper.", confidence:"high", category:"baby" }],
  ["healthybaby diapers",            { floor:1, ceiling:3, substances:[], reason:"HealthyBaby — EWG verified, organic cotton, no chlorine, no fragrance, MADE SAFE certified. Benchmark cleanest diaper.", confidence:"high", category:"baby" }],
  // BABY WIPES
  ["huggies wipes",                  { floor:4, ceiling:6, substances:["synthetic fragrance","polyester","phenoxyethanol"], reason:"Huggies Wipes — polyester fabric + synthetic fragrance + phenoxyethanol preservative. Natural Care version is cleaner.", confidence:"high", category:"baby" }],
  ["pampers wipes",                  { floor:4, ceiling:6, substances:["synthetic fragrance","polyester"], reason:"Pampers Wipes — polyester/polypropylene fabric + synthetic fragrance in scented varieties. Sensitive version is cleaner.", confidence:"high", category:"baby" }],
  ["hello bello wipes",              { floor:2, ceiling:3, substances:[], reason:"Hello Bello Wipes — plant-based fabric, no synthetic fragrance. Hypoallergenic. Clean wipe tier.", confidence:"high", category:"baby" }],
  ["babyganics wipes",               { floor:2, ceiling:3, substances:[], reason:"Babyganics Wipes — plant-based, no synthetic fragrance, no parabens. NeoNourish seed oil blend.", confidence:"high", category:"baby" }],
  // POSTPARTUM
  ["frida mom",                      { floor:2, ceiling:4, substances:["witch hazel","aloe"], reason:"Frida Mom — postpartum recovery products. Peri bottle (plastic but single-purpose), ice pads (aloe + witch hazel), cooling liners. Designed for recovery, mostly clean formulas.", confidence:"high", category:"personal_care" }],
  ["fridamom",                       { floor:2, ceiling:4, substances:["witch hazel","aloe"], reason:"FridaMom — same as frida mom. Postpartum essentials.", confidence:"high", category:"personal_care" }],
  ["peri bottle",                    { floor:2, ceiling:3, substances:["BPA-free plastic"], reason:"Peri bottle — simple BPA-free squeeze bottle for postpartum hygiene. Minimal chemical concern. Frida Mom version is upside-down design.", confidence:"high", category:"personal_care" }],
  ["postpartum pads",                { floor:3, ceiling:5, substances:["SAP","polyethylene"], reason:"Postpartum pads — heavy absorbency pads, typically SAP + polyethylene back sheet. Organic cotton versions (Cora, Rael) are cleaner.", confidence:"medium", category:"personal_care" }],
  ["witch hazel pads",               { floor:2, ceiling:3, substances:["witch hazel"], reason:"Witch hazel pads (Tucks) — witch hazel + glycerin on cotton rounds. Gentle, mostly clean. Used for postpartum hemorrhoid relief.", confidence:"high", category:"personal_care" }],
  ["sitz bath",                      { floor:1, ceiling:3, substances:["epsom salt","herbs"], reason:"Sitz bath — epsom salt + herbs (lavender, witch hazel, calendula). Earth Mama Organic version is benchmark clean.", confidence:"high", category:"personal_care" }],
  // MATERNITY CLOTHING
  ["maternity jeans",                { floor:4, ceiling:6, substances:["conventional cotton","spandex","synthetic dyes"], reason:"Maternity jeans — conventional denim + spandex belly panel. Same formaldehyde/dye concerns as regular jeans. Organic options from Pact.", confidence:"medium", category:"clothing" }],
  ["maternity dress",                { floor:4, ceiling:6, substances:["polyester","synthetic dyes"], reason:"Maternity dress — typically polyester blend + synthetic dyes. Same fast fashion concerns. Hatch and Storq are cleaner brands.", confidence:"medium", category:"clothing" }],
  ["maternity bra",                  { floor:4, ceiling:6, substances:["nylon","spandex","synthetic dyes"], reason:"Maternity/nursing bra — nylon/spandex + synthetic dyes. Direct breast contact during nursing. Organic cotton options from Pact and Boody are cleaner.", confidence:"medium", category:"clothing" }],
  ["nursing tank",                   { floor:4, ceiling:6, substances:["nylon","spandex","synthetic dyes"], reason:"Nursing tank — nylon/spandex + synthetic dyes. Worn against skin daily during breastfeeding. Organic cotton versions cleaner.", confidence:"medium", category:"clothing" }],
  ["nursing pajamas",                { floor:4, ceiling:5, substances:["polyester","synthetic dyes"], reason:"Nursing pajamas — typically polyester/rayon blend + synthetic dyes. Direct skin contact during sleep + baby contact. Organic cotton options cleaner.", confidence:"medium", category:"clothing" }],
  // CAR SEATS
  ["graco car seat",                 { floor:4, ceiling:6, substances:["flame retardants","polyurethane foam","polyester fabric"], reason:"Graco — polyurethane foam padding + flame retardant chemicals (TDCPP/TCEP historically) + polyester fabric. Baby sits in this daily. Newer models improved but foam concern remains.", confidence:"medium", category:"baby" }],
  ["chicco car seat",                { floor:4, ceiling:5, substances:["polyurethane foam","polyester fabric"], reason:"Chicco — polyurethane foam + polyester. Italian brand with better chemical reputation than budget brands. KeyFit rated well for fire retardant reduction.", confidence:"medium", category:"baby" }],
  ["britax car seat",                { floor:3, ceiling:5, substances:["polyurethane foam","polyester fabric"], reason:"Britax — claims reduced flame retardant use. ClickTight system reduces padding layers. Better than average but still foam + polyester.", confidence:"medium", category:"baby" }],
  ["uppababy car seat",              { floor:3, ceiling:4, substances:["merino wool","polyester"], reason:"UPPAbaby Mesa — merino wool option available (score 2-3). Standard polyester version scores 3-4. Premium clean-leaning car seat.", confidence:"high", category:"baby" }],
  ["nuna car seat",                  { floor:3, ceiling:4, substances:["organic cotton option","polyester"], reason:"Nuna PIPA — organic cotton + merino wool option available. GREENGUARD Gold certified (low VOC emissions). Cleaner car seat tier.", confidence:"high", category:"baby" }],
  ["evenflo car seat",               { floor:4, ceiling:6, substances:["flame retardants","polyurethane foam","polyester"], reason:"Evenflo — budget car seat with polyurethane foam + flame retardants + polyester. Standard chemical profile.", confidence:"medium", category:"baby" }],
  ["maxi cosi car seat",             { floor:3, ceiling:5, substances:["polyurethane foam","polyester"], reason:"Maxi-Cosi — Dutch brand. FlexiSpin and Pria lines. Foam + polyester standard. Some GREENGUARD certified models.", confidence:"medium", category:"baby" }],
  // STROLLERS
  ["uppababy stroller",              { floor:2, ceiling:4, substances:["aluminum frame","polyester fabric"], reason:"UPPAbaby Vista/Cruz — aluminum frame + polyester canopy. Minimal chemical contact (baby sits on padded seat). Premium stroller, less foam than car seats.", confidence:"high", category:"baby" }],
  ["bugaboo stroller",               { floor:2, ceiling:4, substances:["aluminum frame","polyester fabric"], reason:"Bugaboo — aluminum frame + recycled polyester fabric in newer models. OEKO-TEX certified fabrics. Cleaner stroller tier.", confidence:"high", category:"baby" }],
  ["graco stroller",                 { floor:3, ceiling:5, substances:["steel frame","polyester fabric","foam padding"], reason:"Graco stroller — steel frame + polyester fabric + foam padding. Budget tier. More padding = more foam concern.", confidence:"medium", category:"baby" }],
  ["baby jogger stroller",           { floor:3, ceiling:4, substances:["aluminum frame","polyester"], reason:"Baby Jogger City Mini — aluminum frame + polyester. Minimal foam padding. UV50+ canopy. Mid-tier stroller.", confidence:"high", category:"baby" }],
  ["doona stroller",                 { floor:3, ceiling:5, substances:["polyurethane foam","polyester","flame retardants"], reason:"Doona — car seat + stroller combo. Same foam + flame retardant concerns as car seats. Convenient but more material than standalone stroller.", confidence:"medium", category:"baby" }],
  ["nuna stroller",                  { floor:2, ceiling:4, substances:["aluminum frame","polyester"], reason:"Nuna MIXX/TRVL — aluminum frame + polyester. GREENGUARD Gold certified. Minimal foam. Cleaner stroller tier.", confidence:"high", category:"baby" }],
  // TOYS — POPULAR BRANDS
  ["vtech",                          { floor:4, ceiling:6, substances:["ABS plastic","electronic components","synthetic dyes","batteries"], reason:"VTech — ABS plastic + electronic components + batteries + synthetic dyes. Heavy plastic construction for electronic learning toys.", confidence:"high", category:"toy" }],
  ["magna tiles",                    { floor:3, ceiling:4, substances:["ABS plastic","magnets"], reason:"Magna-Tiles — ABS plastic tiles with internal magnets. BPA-free, phthalate-free. Safer plastic tier for toys. Non-toxic ABS.", confidence:"high", category:"toy" }],
  ["play doh",                       { floor:3, ceiling:5, substances:["wheat flour","synthetic dyes","synthetic fragrance"], reason:"Play-Doh — wheat flour base + synthetic dyes + synthetic fragrance. Kids handle extensively and sometimes ingest. Hasbro brand.", confidence:"high", category:"toy" }],
  ["crayola crayons",                { floor:2, ceiling:3, substances:["paraffin wax","pigments"], reason:"Crayola Crayons — paraffin wax + pigments. AP certified non-toxic. Low exposure risk (handled, not ingested typically). Benchmark clean coloring.", confidence:"high", category:"toy" }],
  ["crayola markers",                { floor:3, ceiling:4, substances:["synthetic dyes","solvents"], reason:"Crayola Markers — water-based inks with synthetic dyes. AP certified non-toxic. Washable versions are cleaner. Kids draw on skin occasionally.", confidence:"high", category:"toy" }],
  ["elmers glue",                    { floor:3, ceiling:4, substances:["PVA","polyvinyl acetate"], reason:"Elmer's Glue — polyvinyl acetate (PVA) based. Non-toxic, washable. Kids handle extensively. Low concern for craft use.", confidence:"high", category:"toy" }],
  ["kinetic sand",                   { floor:3, ceiling:4, substances:["silicone coating","synthetic dyes"], reason:"Kinetic Sand — fine sand coated with dimethicone (silicone). Non-toxic. Kids handle extensively. Low ingestion risk at intended age.", confidence:"high", category:"toy" }],
  ["slime",                          { floor:5, ceiling:7, substances:["borax","PVA glue","synthetic dyes","synthetic fragrance"], reason:"Slime — borax (sodium borate) + PVA glue + synthetic dyes + synthetic fragrance. Borax is skin irritant and endocrine concern with prolonged handling. EU restricted.", confidence:"high", category:"toy" }],
  ["silly putty",                    { floor:3, ceiling:4, substances:["silicone polymer"], reason:"Silly Putty — silicone-based polymer (polydimethylsiloxane). Non-toxic. Less concern than borax slime. Crayola brand.", confidence:"high", category:"toy" }],
  // KIDS CLOTHES
  ["carters",                        { floor:4, ceiling:6, substances:["conventional cotton","synthetic dyes","formaldehyde","flame retardants"], reason:"Carter's — conventional cotton + synthetic dyes + formaldehyde finishing. Sleepwear has flame retardant chemical treatment or tight-fit requirement. Biggest baby clothing brand in US.", confidence:"high", category:"clothing" }],
  ["colored organics",               { floor:1, ceiling:3, substances:[], reason:"Colored Organics — GOTS certified organic cotton, low-impact dyes, fair-trade sewing. Clean independent kids brand; ceiling 3 matches other verified-GOTS kids brands (Hanna Andersson, Little Planet, Burt's Bees Baby).", confidence:"high", category:"clothing" }],
  ["burt bees baby pajamas",         { floor:2, ceiling:3, substances:["organic cotton"], reason:"Burt's Bees Baby pajamas — GOTS certified organic cotton, snug-fit (no flame retardant chemicals needed). Benchmark clean kids sleepwear.", confidence:"high", category:"clothing" }],
  // PET PRODUCTS
  ["dog food",                       { floor:3, ceiling:6, substances:["preservatives","by-products"], reason:"Dog food — varies widely. Premium grain-free can score 2-3. Kibble with BHA/BHT preservatives and meat by-products scores 5-7. Check ingredient list.", confidence:"low", category:"other" }],
  ["cat food",                       { floor:3, ceiling:6, substances:["preservatives","by-products"], reason:"Cat food — varies widely. Same range as dog food. BHA/BHT in cheap kibble is main concern.", confidence:"low", category:"other" }],
  ["purina dog food",                { floor:5, ceiling:7, substances:["BHA","BHT","by-products","artificial colors"], reason:"Purina — BHA/BHT preservatives + meat by-products + artificial colors in many lines. Nestle owned. Pro Plan is cleanest Purina line.", confidence:"high", category:"other" }],
  ["hills science diet",             { floor:4, ceiling:6, substances:["BHA","by-products"], reason:"Hill's Science Diet — BHA preservative + chicken by-product meal in some formulas. Vet-recommended but conventional pet food chemistry.", confidence:"high", category:"other" }],
  ["royal canin",                    { floor:4, ceiling:6, substances:["BHA","by-products","corn"], reason:"Royal Canin — BHA preservative + by-products + corn filler. Mars owned. Breed-specific marketing, conventional ingredients.", confidence:"high", category:"other" }],
  ["open farm dog food",             { floor:1, ceiling:3, substances:[], reason:"Open Farm — humanely raised meat, no BHA/BHT, no by-products, no artificial colors. B Corp certified. Benchmark clean pet food.", confidence:"high", category:"other" }],
  ["seresto collar",                 { floor:7, ceiling:9, substances:["imidacloprid","flumethrin"], reason:"Seresto flea collar — imidacloprid (neonicotinoid) + flumethrin pesticides in continuous contact with pet AND human skin when handling. EPA investigating 1,700+ pet deaths and human incidents. Children who cuddle pets are exposed.", confidence:"high", category:"other" }],
  ["flea collar",                    { floor:6, ceiling:8, substances:["pesticides","synthetic pyrethroids"], reason:"Flea collar — continuous pesticide release against pet skin. Transfers to human skin on contact. Children especially vulnerable. Oral flea meds are safer for human exposure.", confidence:"high", category:"other" }],
  ["frontline",                      { floor:5, ceiling:7, substances:["fipronil"], reason:"Frontline — fipronil topical pesticide. Applied monthly to pet skin. Transfers to furniture and human skin. Less concerning than collars (not continuous) but still pesticide exposure.", confidence:"high", category:"other" }],
  ["dog shampoo",                    { floor:3, ceiling:6, substances:["synthetic fragrance","SLS"], reason:"Dog shampoo — varies. Conventional brands (Hartz, Sentry) have synthetic fragrance + SLS (score 5-7). Natural brands (Earthbath, Burt's Bees for Dogs) score 2-3.", confidence:"medium", category:"other" }],
  ["pet wipes",                      { floor:3, ceiling:5, substances:["synthetic fragrance","polyester"], reason:"Pet wipes — polyester fabric + synthetic fragrance in most brands. Natural versions (Earth Rated, Pogi's) are cleaner. Transfers to human hands.", confidence:"medium", category:"other" }],
  // HOUSEHOLD SCENTS
  ["candle",                         { floor:4, ceiling:7, substances:["paraffin wax","synthetic fragrance","lead-free wick"], reason:"Candle — conventional paraffin wax (petroleum) + synthetic fragrance. Burns release VOCs + particulates. Soy/beeswax + essential oil candles score 2-3.", confidence:"medium", category:"home" }],
  ["yankee candle",                  { floor:5, ceiling:7, substances:["paraffin wax","synthetic fragrance"], reason:"Yankee Candle — paraffin wax + heavy synthetic fragrance. Burns release benzene, toluene, formaldehyde. Switch to beeswax or soy + essential oil.", confidence:"high", category:"home" }],
  ["bath and body works candle",     { floor:5, ceiling:7, substances:["paraffin/soy blend","synthetic fragrance"], reason:"Bath & Body Works candle — paraffin/soy blend + very heavy synthetic fragrance. Among heaviest fragrance loads in candle market.", confidence:"high", category:"home" }],
  ["glade plug in",                  { floor:6, ceiling:8, substances:["synthetic fragrance","VOCs","phthalates"], reason:"Glade Plug-In — continuous synthetic fragrance release + VOCs + phthalates. 24/7 indoor air pollution. SC Johnson brand. NRDC found phthalates in testing.", confidence:"high", category:"home" }],
  ["febreze",                        { floor:5, ceiling:7, substances:["synthetic fragrance","cyclodextrin","VOCs"], reason:"Febreze — cyclodextrin + synthetic fragrance + VOCs. P&G brand. Claims to 'eliminate' odor but adds chemical fragrance layer. EWG D-F rating.", confidence:"high", category:"home" }],
  ["air wick",                       { floor:6, ceiling:8, substances:["synthetic fragrance","VOCs","phthalates"], reason:"Air Wick — continuous synthetic fragrance release + VOCs. Reckitt brand. Same concern as Glade. Phthalates found in NRDC testing.", confidence:"high", category:"home" }],
  // BUG SPRAY
  ["bug spray",                      { floor:4, ceiling:7, substances:["DEET or picaridin","synthetic fragrance"], reason:"Bug spray — DEET (score 5-7) or picaridin (score 3-5) based. DEET is neurotoxic at high concentrations. Picaridin is safer alternative. Lemon eucalyptus oil is cleanest.", confidence:"medium", category:"personal_care" }],
  ["off bug spray",                  { floor:5, ceiling:7, substances:["DEET"], reason:"OFF! — DEET-based insect repellent. SC Johnson brand. DEET is effective but neurotoxic concern at high concentrations. Especially concerning for children.", confidence:"high", category:"personal_care" }],
  ["deet",                           { floor:5, ceiling:7, substances:["DEET"], reason:"DEET — N,N-diethyl-meta-toluamide. Effective repellent but neurotoxic at high concentrations. EPA registered pesticide applied to skin. Use lowest effective concentration.", confidence:"high", category:"personal_care" }],
  ["picaridin",                      { floor:3, ceiling:4, substances:["picaridin"], reason:"Picaridin — CDC-recommended DEET alternative. Less skin irritation, lower toxicity profile. Sawyer and Natrapel brands. Safer for children than DEET.", confidence:"high", category:"personal_care" }],
  ["banana boat",                    { floor:5, ceiling:7, substances:["oxybenzone","octinoxate","synthetic fragrance"], reason:"Banana Boat — chemical UV filters (oxybenzone, octinoxate) + synthetic fragrance. Some spray formulas had benzene contamination recall 2021.", confidence:"high", category:"personal_care" }],
  // SCHOOL/OFFICE SUPPLIES
  ["expo markers",                   { floor:3, ceiling:4, substances:["solvents","dyes"], reason:"Expo dry erase markers — alcohol-based solvent + dyes. Use in ventilated rooms. Low exposure if used briefly. AP certified non-toxic.", confidence:"high", category:"other" }],
  ["sharpie",                        { floor:3, ceiling:5, substances:["xylene","solvents"], reason:"Sharpie — xylene-based solvent (original) or alcohol-based (newer). Use in ventilated area. Avoid prolonged skin contact. Fine point less exposure than chisel.", confidence:"high", category:"other" }],
  ["backpack",                       { floor:3, ceiling:5, substances:["polyester","synthetic dyes","PFAS in some"], reason:"Backpack — polyester + synthetic dyes. Some water-resistant backpacks have PFAS coating. Cotton or canvas backpacks score 2-3.", confidence:"medium", category:"accessory" }],
  // NURSERY
  ["crib mattress",                  { floor:3, ceiling:6, substances:["polyurethane foam","flame retardants","VOCs"], reason:"Crib mattress — conventional uses polyurethane foam + flame retardants + VOC off-gassing. Organic options (Avocado, Naturepedic) score 1-3. Baby sleeps on this 12+ hours daily.", confidence:"medium", category:"baby" }],
  ["changing pad",                   { floor:4, ceiling:6, substances:["PVC","phthalates","polyurethane foam"], reason:"Changing pad — conventional uses PVC cover + polyurethane foam. Direct skin contact for diaper changes. Keekaroo (TPE surface) is cleaner option.", confidence:"medium", category:"baby" }],
  ["diaper pail",                    { floor:3, ceiling:4, substances:["plastic"], reason:"Diaper pail — plastic container. Ubbi (steel) is cleaner alternative. Chemical concern is minimal — mainly plastic contact with diapers.", confidence:"medium", category:"baby" }],
  ["nipple cream",                   { floor:2, ceiling:4, substances:[], reason:"Nipple cream — varies by brand. Lanolin-based (Lansinoh) is cleanest. Avoid versions with synthetic fragrance or parabens.", confidence:"medium", category:"personal_care" }],
  // BABY ON THE GO
  ["sippy cup",                      { floor:3, ceiling:5, substances:["BPA-free plastic","polypropylene"], reason:"Sippy cup — BPA-free plastic but hot liquids in plastic concern. Stainless steel (Pura Kiki) or glass (LifeFactory) sippy cups score 1-3.", confidence:"medium", category:"baby" }],
  ["snack cup",                      { floor:3, ceiling:4, substances:["BPA-free plastic"], reason:"Snack cup — BPA-free plastic. Minimal heat concern (room temp snacks). Stainless options available.", confidence:"medium", category:"baby" }],
  ["pacifier",                       { floor:2, ceiling:4, substances:["silicone","BPA-free plastic"], reason:"Pacifier — silicone nipple is clean. Plastic shield is BPA-free. Natursutten (natural rubber) scores 1-2. Most mainstream brands score 2-4.", confidence:"medium", category:"baby" }],
  ["teether",                        { floor:2, ceiling:5, substances:["silicone","BPA-free plastic"], reason:"Teether — silicone teethers are cleanest (score 1-2). Plastic teethers with water filling score 3-5. Check for phthalate-free.", confidence:"medium", category:"baby" }],
  ["sophie giraffe",                 { floor:2, ceiling:3, substances:["natural rubber"], reason:"Sophie la Girafe — 100% natural rubber + food-grade paint. No BPA, no phthalates, no PVC. Benchmark clean teether. Mold concern if submerged in water.", confidence:"high", category:"baby" }],
  // KIDS BATH
  ["mr bubble",                      { floor:5, ceiling:7, substances:["SLS","synthetic fragrance","synthetic dyes","cocamidopropyl betaine"], reason:"Mr. Bubble — SLS + synthetic fragrance + Red 33/Blue 1 synthetic dyes. Extended soak in dyed, fragranced water. Switch to Honest or California Baby.", confidence:"high", category:"baby" }],
  ["honest bubble bath",             { floor:2, ceiling:3, substances:[], reason:"Honest Bubble Bath — no synthetic fragrance, no SLS, no parabens, no dyes. Plant-derived surfactants. Clean bubble bath.", confidence:"high", category:"baby" }],
  // KIDS SUNSCREEN
  ["banana boat kids",               { floor:5, ceiling:7, substances:["oxybenzone","octinoxate","synthetic fragrance"], reason:"Banana Boat Kids — chemical UV filters (oxybenzone, octinoxate) + synthetic fragrance. Endocrine disruption concern with chemical sunscreens on children.", confidence:"high", category:"personal_care" }],
  ["coppertone kids",                { floor:5, ceiling:7, substances:["oxybenzone","octinoxate","synthetic fragrance"], reason:"Coppertone Kids — chemical UV filters + synthetic fragrance. Same concern as Banana Boat. Mineral versions available but most popular are chemical.", confidence:"high", category:"personal_care" }],
  ["aveeno kids sunscreen",          { floor:3, ceiling:5, substances:["chemical UV filters"], reason:"Aveeno Kids — some mineral, some chemical UV filter formulas. Check label: mineral (zinc oxide only) scores 2-3, chemical scores 5-7.", confidence:"medium", category:"personal_care" }],
  ["thinkbaby sunscreen",            { floor:1, ceiling:3, substances:[], reason:"Thinkbaby — zinc oxide only, no chemical UV filters, no synthetic fragrance. EWG #1 rated kids sunscreen. Benchmark cleanest.", confidence:"high", category:"personal_care" }],
  ["badger kids sunscreen",          { floor:1, ceiling:3, substances:[], reason:"Badger Kids — zinc oxide only, organic ingredients, no synthetic fragrance. EWG top rated. Benchmark clean kids sunscreen.", confidence:"high", category:"personal_care" }],
  ["blue lizard baby",               { floor:2, ceiling:3, substances:["zinc oxide","titanium dioxide"], reason:"Blue Lizard Baby — mineral-only (zinc oxide + titanium dioxide), no chemical UV filters, no fragrance. Australian brand. Clean mineral sunscreen.", confidence:"high", category:"personal_care" }],
  // SCHOOL LUNCH — CONTAINERS
  ["lunchbox",                       { floor:3, ceiling:5, substances:["plastic","BPA-free","insulation"], reason:"Lunchbox — most are BPA-free plastic or fabric + plastic liner. Stainless steel (PlanetBox, LunchBots) scores 1-2. Plastic lunchboxes score 3-5.", confidence:"medium", category:"kitchen" }],
  ["bento box",                      { floor:2, ceiling:5, substances:["stainless steel or plastic"], reason:"Bento box — stainless steel bento (LunchBots, Bentgo Stainless) scores 1-2. Plastic bento scores 3-5. Check material.", confidence:"medium", category:"kitchen" }],
  ["thermos",                        { floor:2, ceiling:3, substances:["stainless steel"], reason:"Thermos — stainless steel interior in most models. Clean food contact. Plastic lid is minor concern. FUNtainer kids line is stainless.", confidence:"high", category:"kitchen" }],
  ["ice pack",                       { floor:2, ceiling:4, substances:["plastic shell","gel"], reason:"Ice pack — plastic shell with non-toxic gel. No food contact in most designs. Stainless steel ice packs available.", confidence:"medium", category:"kitchen" }],
  // SCHOOL LUNCH — FOODS
  ["juice box",                      { floor:5, ceiling:7, substances:["HFCS","citric acid","plastic straw","aluminum lining"], reason:"Juice box — HFCS or concentrated juice + citric acid in aluminum-lined plastic box + plastic straw. 20-30g sugar per box. Switch to water bottle.", confidence:"high", category:"beverage" }],
  ["apple sauce pouch",              { floor:4, ceiling:5, substances:["plastic pouch","BPA-free lining"], reason:"Applesauce pouch — BPA-free plastic pouch but still plastic food contact. Shelf-stable pouches use multi-layer plastic. Glass jar version scores 1-3.", confidence:"high", category:"food_beverage" }],
  ["squeeze pouch",                  { floor:4, ceiling:5, substances:["plastic pouch","BPA-free lining"], reason:"Squeeze pouch — same as applesauce pouch. Multi-layer plastic, BPA-free but BPA-substitute concern. Reusable silicone pouches are cleaner.", confidence:"high", category:"food_beverage" }],
  ["fruit snacks",                   { floor:5, ceiling:7, substances:["Red 40","Yellow 5","Yellow 6","HFCS","carnauba wax"], reason:"Fruit snacks — petroleum dyes (Red 40, Yellow 5, Yellow 6) + HFCS + carnauba wax. Multiple dye floors fire. Not actually fruit.", confidence:"high", category:"food_beverage" }],
  // CLEANING — MOM
  ["lysol wipes",                    { floor:5, ceiling:7, substances:["quaternary ammonium","synthetic fragrance","alkyl dimethyl benzyl ammonium chloride"], reason:"Lysol Wipes — quaternary ammonium compounds + synthetic fragrance. EPA registered pesticide on a wipe. Chemical residue remains on surfaces.", confidence:"high", category:"home" }],
  ["clorox wipes",                   { floor:5, ceiling:7, substances:["quaternary ammonium","synthetic fragrance","alkyl dimethyl benzyl ammonium chloride"], reason:"Clorox Wipes — same quat + fragrance concern as Lysol. Not safe for food contact surfaces without rinsing.", confidence:"high", category:"home" }],
  ["mrs meyers all purpose",         { floor:3, ceiling:5, substances:["synthetic fragrance"], reason:"Mrs. Meyer's All Purpose — plant-derived surfactants but contains synthetic fragrance (essential oil based but still 'fragrance' on label). Cleaner than Lysol/Clorox.", confidence:"high", category:"home" }],
  // LAUNDRY — BABY
  ["dreft",                          { floor:5, ceiling:7, substances:["synthetic fragrance","optical brighteners","1,4-dioxane"], reason:"Dreft — marketed for baby but contains synthetic fragrance + optical brighteners + 1,4-dioxane trace. P&G brand. Switch to Molly's Suds or Seventh Generation Free & Clear.", confidence:"high", category:"home" }],
  ["tide free gentle",               { floor:3, ceiling:5, substances:["1,4-dioxane trace"], reason:"Tide Free & Gentle — no synthetic fragrance, no dyes. But 1,4-dioxane trace concern. Cleaner than regular Tide. Not as clean as Molly's Suds or Branch Basics.", confidence:"high", category:"home" }],
  // HOME — AIR QUALITY
  ["air purifier",                   { floor:1, ceiling:2, substances:[], reason:"Air purifier — HEPA filter devices are clean. No chemicals. Reduces indoor pollutants. Look for HEPA + activated carbon. Avoid ionizers (produce ozone).", confidence:"high", category:"other" }],
  ["humidifier",                     { floor:2, ceiling:3, substances:[], reason:"Humidifier — clean device. Concern is mold if not cleaned regularly. Avoid ultrasonic + tap water (mineral dust). Evaporative with distilled water is cleanest.", confidence:"medium", category:"other" }],
  ["essential oil diffuser",         { floor:2, ceiling:4, substances:["VOCs from oils"], reason:"Essential oil diffuser — device is clean but essential oils release VOCs (terpenes). Moderate use in ventilated rooms. Some oils toxic to pets. Not recommended in nursery.", confidence:"medium", category:"other" }],
  // WOMEN'S SUPPLEMENTS
  ["iron supplement",                { floor:2, ceiling:4, substances:[], reason:"Iron supplement — varies by brand. Gentle forms (iron bisglycinate) are best tolerated. Check for synthetic dyes in tablets. Thorne and MegaFood are clean.", confidence:"medium", category:"supplement" }],
  ["vitamin d",                      { floor:1, ceiling:3, substances:[], reason:"Vitamin D supplement — simple supplement, most are clean. Liquid drops (Thorne, Nordic Naturals) are cleanest. Check gummies for synthetic dyes.", confidence:"medium", category:"supplement" }],
  ["biotin",                         { floor:2, ceiling:3, substances:[], reason:"Biotin supplement — simple B vitamin, most formulations are clean. Check for synthetic dyes and fillers.", confidence:"medium", category:"supplement" }],
  ["collagen powder",                { floor:2, ceiling:4, substances:[], reason:"Collagen powder — bovine or marine collagen peptides. Generally clean if unflavored. Flavored versions may have synthetic sweeteners. Vital Proteins and Further Food are clean.", confidence:"medium", category:"supplement" }],
  ["magnesium supplement",           { floor:2, ceiling:3, substances:[], reason:"Magnesium supplement — glycinate and citrate forms are cleanest. Check for synthetic dyes in tablets. Natural Calm powder is popular clean option.", confidence:"medium", category:"supplement" }],
  ["probiotic women",                { floor:2, ceiling:4, substances:[], reason:"Women's probiotic — varies by brand. Look for no synthetic dyes, no titanium dioxide. Garden of Life Women's and Seed are clean options.", confidence:"medium", category:"supplement" }],
  ["cranberry supplement",           { floor:2, ceiling:3, substances:[], reason:"Cranberry supplement — UTI support. Simple extract capsule is clean. Avoid gummy versions with synthetic dyes/sugar. Uqora and Utiva are clean.", confidence:"medium", category:"supplement" }],
  // MOM DRINKS
  ["starbucks coffee",               { floor:2, ceiling:4, substances:[], reason:"Starbucks brewed coffee — coffee beans are clean. Concern is sugar in flavored drinks (40-60g per frappuccino). Black coffee/espresso scores 1-2. Sweetened drinks score 4-7.", confidence:"medium", category:"beverage" }],
  ["yerba mate",                     { floor:2, ceiling:4, substances:["PAH concern"], reason:"Yerba mate — natural tea with polycyclic aromatic hydrocarbons (PAH) from traditional smoke-drying process. Air-dried brands (Guayaki) are cleaner. Moderate concern.", confidence:"medium", category:"beverage" }],
  ["kombucha",                       { floor:2, ceiling:3, substances:[], reason:"Kombucha — fermented tea, probiotics. Generally clean. Check sugar content (some brands add juice). GT's raw kombucha is benchmark.", confidence:"high", category:"beverage" }],
  ["protein shake",                  { floor:3, ceiling:6, substances:["artificial sweeteners","synthetic flavors"], reason:"Protein shake — varies widely. RTD bottles (plastic + sweeteners) score 5-7. Clean powders (Orgain Organic, Garden of Life) mixed in glass score 2-3.", confidence:"medium", category:"food_beverage" }],
  // FEMININE WELLNESS — GENERIC TERMS
  ["menstrual cup",                  { floor:1, ceiling:2, substances:["medical-grade silicone"], reason:"Menstrual cup — medical-grade silicone. Zero waste, no rayon, no fragrance, no bleach. Cleanest period product category.", confidence:"high", category:"personal_care" }],
  ["period underwear",               { floor:3, ceiling:5, substances:["nylon","spandex","leakproof layer"], reason:"Period underwear — nylon/spandex + leakproof layers. Historical PFAS concern (Thinx class action). PFAS-free brands: Aisle, Saalt. Verify PFAS-free before buying.", confidence:"medium", category:"clothing" }],
  ["reusable pads",                  { floor:1, ceiling:3, substances:["organic cotton"], reason:"Reusable cloth pads — organic cotton or bamboo. No rayon, no fragrance, no bleach. Zero waste. GladRags and Party in My Pants are popular brands.", confidence:"high", category:"personal_care" }],
  ["organic tampons",                { floor:1, ceiling:2, substances:[], reason:"Organic tampons — certified organic cotton, no chlorine bleaching, no synthetic fragrance. Cora, Rael, Lola are benchmark brands.", confidence:"high", category:"personal_care" }],
  // HAIR ACCESSORIES
  ["hair ties",                      { floor:2, ceiling:4, substances:["synthetic rubber","nylon","metal"], reason:"Hair ties — synthetic rubber/nylon + metal crimps. Low exposure concern (brief skin contact). Silk or cotton scrunchies are cleaner.", confidence:"medium", category:"personal_care" }],
  ["scrunchie",                      { floor:2, ceiling:3, substances:["fabric","elastic"], reason:"Scrunchie — fabric covered elastic. Silk scrunchies are cleanest. Polyester versions have microplastic shedding from washing.", confidence:"medium", category:"personal_care" }],
  ["claw clip",                      { floor:2, ceiling:3, substances:["acetate or plastic"], reason:"Claw clip — cellulose acetate (plant-derived) or ABS plastic. Brief hair contact, low exposure. Acetate versions are cleaner than plastic.", confidence:"medium", category:"personal_care" }],
  ["bobby pins",                     { floor:2, ceiling:3, substances:["metal","coating"], reason:"Bobby pins — steel wire with lacquer coating. Brief contact, low exposure concern. Uncoated stainless versions exist.", confidence:"high", category:"personal_care" }],
  ["hair brush",                     { floor:2, ceiling:4, substances:["plastic handle","nylon bristles"], reason:"Hair brush — plastic handle + nylon bristles in most. Wooden brush with natural boar bristles scores 1-2. Low exposure concern.", confidence:"medium", category:"personal_care" }],
  // WORKOUT GEAR
  ["yoga mat",                       { floor:3, ceiling:6, substances:["PVC","phthalates","EVA foam"], reason:"Yoga mat — conventional PVC mats contain phthalates (floor 5-6). TPE mats score 3-4. Natural rubber (Jade, Manduka eKO) scores 2-3. Cork mats score 1-2.", confidence:"medium", category:"other" }],
  ["resistance bands",               { floor:3, ceiling:4, substances:["latex or TPE"], reason:"Resistance bands — natural latex or TPE (thermoplastic elastomer). Brief skin contact during exercise. Low concern overall.", confidence:"medium", category:"other" }],
  ["foam roller",                    { floor:3, ceiling:4, substances:["EVA foam"], reason:"Foam roller — EVA (ethylene-vinyl acetate) foam. Brief skin contact. Low off-gassing concern after initial airing out.", confidence:"medium", category:"other" }],
  ["workout gloves",                 { floor:3, ceiling:4, substances:["synthetic leather","neoprene","spandex"], reason:"Workout gloves — synthetic leather + neoprene + spandex. Brief sweat contact during exercise. Low overall concern.", confidence:"medium", category:"accessory" }],
  // JEWELRY / ACCESSORIES
  ["costume jewelry",                { floor:5, ceiling:8, substances:["lead","nickel","cadmium"], reason:"Costume jewelry — lead, nickel, cadmium found in testing of cheap jewelry. Direct prolonged skin contact. Children's costume jewelry especially concerning.", confidence:"medium", category:"accessory" }],
  ["earrings",                       { floor:3, ceiling:7, substances:["nickel","lead in cheap"], reason:"Earrings — nickel allergen in most. Cheap earrings may contain lead/cadmium. Surgical steel, 14k+ gold, sterling silver score 1-3.", confidence:"medium", category:"accessory" }],
  ["necklace",                       { floor:3, ceiling:7, substances:["nickel","lead in cheap"], reason:"Necklace — same concern as earrings. Cheap metal + prolonged skin contact. Precious metals score lower.", confidence:"medium", category:"accessory" }],
  ["watch band",                     { floor:3, ceiling:5, substances:["silicone","synthetic rubber","leather"], reason:"Watch band — silicone (2-3), leather (3-4), synthetic rubber (4-5). Prolonged daily skin contact. Metal bands are cleanest.", confidence:"medium", category:"accessory" }],
  // WATCHES — brand defaults. Specific brand entries must come BEFORE generic
  // "watch" / "smartwatch" so fuzzyCalibrationLookup's startsWith match wins
  // for "Apple Watch SE" / "Garmin Forerunner" etc. Map iteration order matters.
  //
  // Scoring frame: watch cases sit on dry skin and are made of inherently
  // inert materials (316L steel, titanium, ceramic, sapphire, gold). The
  // STRAP drives the score. Steel bracelet, silicone, or fluoroelastomer →
  // low (2-3). Chrome-tanned leather → middle (3-4). Plated alloy worn
  // against skin → 3-5 (plating wears, exposes underlying brass/nickel).
  // Costume jewelry-grade plated metal stays at the existing 5-8 entry.
  ["apple watch",                    { floor:2, ceiling:3, substances:["aluminum","titanium","fluoroelastomer","ion-exchanged glass","sapphire crystal"], reason:"Apple Watch — aluminum, stainless, or titanium case with ion-exchanged glass (Series 4+) or sapphire (Ultra/Hermès). Fluoroelastomer Sport Band is inert, hypoallergenic, no PVC or BPA per Apple disclosures. Recycled aluminum used since Series 6. Cases and bands are all biologically inert against dry skin.", confidence:"high", category:"accessory" }],
  ["garmin",                         { floor:2, ceiling:4, substances:["fiber-reinforced polymer","stainless steel","silicone","gorilla glass"], reason:"Garmin — fiber-reinforced polymer or stainless steel case with silicone QuickFit band. Inert materials, low concern. No published PFAS disclosures, hence not capped lower.", confidence:"medium", category:"accessory" }],
  ["fitbit",                         { floor:2, ceiling:4, substances:["aluminum","silicone","gorilla glass","stainless steel"], reason:"Fitbit — aluminum or steel case with silicone band. Older Force/Charge models prompted nickel-allergen complaints; current lineup uses surgical-steel buckles. Score 2-4.", confidence:"medium", category:"accessory" }],
  ["tag heuer",                      { floor:2, ceiling:4, substances:["316L stainless steel","titanium","ceramic","sapphire crystal","leather","rubber"], reason:"TAG Heuer — premium 316L steel, titanium, or ceramic cases with sapphire crystal. All case materials are biologically inert. Steel bracelet or rubber strap scores 2-3, chrome-tanned leather strap scores 3-4. LVMH-owned luxury brand; no published PFAS disclosures.", confidence:"medium", category:"accessory" }],
  ["fossil",                         { floor:3, ceiling:5, substances:["stainless steel","leather","mineral crystal","plated alloys"], reason:"Fossil — stainless steel and leather are the main exposure surfaces; lower-end lines use plated alloy cases that wear and can expose underlying brass. Chrome-tanned leather straps typical. Score 3-5.", confidence:"medium", category:"accessory" }],
  ["timex",                          { floor:3, ceiling:5, substances:["stainless steel","brass","leather","mineral crystal","resin"], reason:"Timex — stainless steel or brass case with leather or resin strap. Brass Weekender line uses chrome-tanned leather and brass that can patina against skin. Score 3-5.", confidence:"medium", category:"accessory" }],
  ["casio",                          { floor:2, ceiling:4, substances:["resin","stainless steel","mineral glass"], reason:"Casio (G-Shock, F-91W, etc.) — resin case and band on affordable lines. Inert plastic, low concern. Metal G-Shocks use stainless steel. Lithium battery sealed. Score 2-4.", confidence:"medium", category:"accessory" }],
  ["seiko",                          { floor:2, ceiling:4, substances:["stainless steel","leather","silicone","sapphire crystal"], reason:"Seiko — stainless steel case with sapphire or hardlex crystal. Higher-end lines use solid steel construction. Strap material varies; steel bracelet scores 2, leather 3-4. Score 2-4.", confidence:"medium", category:"accessory" }],
  ["citizen",                        { floor:2, ceiling:4, substances:["stainless steel","titanium","leather","mineral crystal"], reason:"Citizen — Eco-Drive solar movement eliminates battery replacement. Titanium options on Super Titanium lines are notably skin-friendly. Score 2-4.", confidence:"medium", category:"accessory" }],
  ["daniel wellington",              { floor:3, ceiling:5, substances:["stainless steel","leather","plated alloys","mineral crystal"], reason:"Daniel Wellington — rose-gold-plated steel cases on the Classic line; plating wear over time can expose the underlying alloy. Chrome-tanned leather (Classic) or NATO nylon (Petite) straps. Score 3-5.", confidence:"medium", category:"accessory" }],
  ["mvmt",                           { floor:3, ceiling:5, substances:["stainless steel","leather","mineral crystal","plated alloys"], reason:"MVMT — stainless steel cases (some plated) with chrome-tanned leather or steel bracelet. Movado-owned, mid-tier fashion watch materials profile. Score 3-5.", confidence:"medium", category:"accessory" }],
  ["nordgreen",                      { floor:2, ceiling:3, substances:["recycled stainless steel","vegan leather","sapphire crystal"], reason:"Nordgreen — Danish brand using recycled stainless steel cases, sapphire crystal, vegan leather or recycled mesh straps. B Corp certified, reduced-plastic packaging. Score 2-3.", confidence:"high", category:"accessory" }],
  ["solios",                         { floor:2, ceiling:3, substances:["recycled stainless steel","vegan leather","sapphire crystal","solar movement"], reason:"Solios — solar movement eliminates battery replacement, recycled stainless steel cases, vegan leather straps. B Corp certified, climate-neutral shipping. Score 2-3.", confidence:"high", category:"accessory" }],
  ["olivia burton",                  { floor:3, ceiling:5, substances:["stainless steel","leather","plated alloys","mineral crystal"], reason:"Olivia Burton — Movado-owned. Plated steel cases with chrome-tanned leather or mesh bracelets. Plating wear is the main concern. Score 3-5.", confidence:"medium", category:"accessory" }],
  ["swatch",                         { floor:2, ceiling:4, substances:["polycarbonate","silicone","mineral glass"], reason:"Swatch — bio-sourced ceramic and bioceramic lines (since 2021) reduce conventional plastic content. Original Gent line is polycarbonate plus silicone. Inert plastics, low skin reactivity. Score 2-4.", confidence:"medium", category:"accessory" }],
  // Generic baselines — fall through here when no brand matches.
  ["smartwatch",                     { floor:2, ceiling:3, substances:["aluminum","stainless steel","fluoroelastomer","silicone","ion-exchanged glass"], reason:"Smartwatch baseline — aluminum or stainless steel case, fluoroelastomer or silicone sport band, sapphire/ion-x glass. All inert against dry skin. Lithium battery sealed. Score 2-3.", confidence:"medium", category:"accessory" }],
  ["watch",                          { floor:2, ceiling:4, substances:["stainless steel","leather","silicone"], reason:"Watch baseline — metal case (inert) plus leather or silicone strap. Cheap fashion watches with plated alloys score higher (3-4). Strap material drives the score more than case material.", confidence:"medium", category:"accessory" }],
  // ── PHONE CASES ──────────────────────────────────────────────
  ["pela case",                      { floor:2, ceiling:3, substances:["Flaxstic bioplastic","flax shive","plant-based biopolymer","BPA-free","phthalate-free","no polycarbonate","no TPU"], reason:"Pela Case. Leader and best in class for the phone case category. Flaxstic composite is 10% flax shive (Saskatchewan agricultural byproduct from oilseed flax) plus a TerraTek Flex GDH-B1 plant-based biopolymer base; the finished case is 45% bio-based and 55% non-renewable. Meets ASTM D6400 and EN 13432 compostability standards in industrial composting facilities. The dermal chemistry profile is a meaningful differentiator: polycarbonate phone cases carry documented residual BPA migration via skin contact (NSF eyewear data, ~0.53 micrograms per day, below California MADL but above zero), and TPU petrochemical polymers can release brominated flame retardants via dermal contact when present (Bessa 2023 Environmental Science and Technology; sweat increases bioavailability). Pela's bio-polymer matrix carries neither BPA residual nor petrochemical flame retardants, removing those dermal exposure pathways from the 10 plus hour daily skin contact window. Materials disclosed as phthalate-free, BPA-free, cadmium-free, lead-free; PFAS not explicitly named in Pela's disclosure. Certified B Corporation per B Lab Global, Climate Neutral Certified, and 1% for the Planet member. The 55% non-renewable polymer matrix holds the score in the 2-3 band rather than the 1-2 tier reserved for single-ingredient or fully natural materials. Ingredients verified 05 2026.", confidence:"high", category:"accessory" }],
  ["pela",                           { floor:2, ceiling:3, substances:["Flaxstic bioplastic","flax shive","plant-based biopolymer","BPA-free","phthalate-free","no polycarbonate","no TPU"], reason:"Pela. Leader and best in class for phone cases. Flaxstic composite of flax shive plus plant-based biopolymer, 45% bio-based and 55% non-renewable. Compostable in industrial facilities per ASTM D6400 and EN 13432. Dermal chemistry profile differentiates from polycarbonate plus TPU peers: no BPA residual migration (NSF documents ~0.53 micrograms per day from polycarbonate consumer goods) and no petrochemical brominated flame retardant pathway (Bessa 2023 ES&T documents skin transfer from microplastics, sweat increases bioavailability). 10 plus hour daily skin contact window matters for both pathways; Pela's bio-polymer removes them. Materials disclosed as phthalate-free, BPA-free, cadmium-free, lead-free; PFAS not explicitly named. Certified B Corporation, Climate Neutral Certified, 1% for the Planet member. Ingredients verified 05 2026.", confidence:"high", category:"accessory" }],
  ["apple silicone case",            { floor:2, ceiling:3, substances:["55% recycled silicone exterior","polycarbonate inner shell","microfiber lining"], reason:"Apple iPhone Silicone Case. Silicone exterior at 55% recycled content wrapped around a rigid polycarbonate inner shell, with a soft microfiber lining cushioning the phone. Silicone is inert against dry skin and chemically stable. Apple published a formal PFAS phase-out commitment in November 2022 covering products and supply chain; the commitment is the strongest corporate accountability framework in the category, though Apple has not made a product-specific PFAS-free claim about the silicone case line. Score 2-3 reflects inert materials, recycled silicone content, and the corporate PFAS commitment, with residual concern that the polycarbonate inner shell and microfiber composition are not itemized publicly. Ingredients verified 05 2026.", confidence:"high", category:"accessory" }],
  ["apple finewoven case",           { floor:3, ceiling:4, substances:["68% post-consumer recycled polyester microtwill","TPU frame"], reason:"Apple FineWoven Case. Discontinued by Apple in 2024 after widespread durability complaints; replaced by the TechWoven line. Was 68% post-consumer recycled microtwill polyester fibers over a TPU frame. Score 3-4 reflects the recycled content and inert materials but accounts for the discontinuation: any current retail inventory is legacy stock, not active production. Apple's corporate PFAS phase-out commitment (November 2022) covers this product. Ingredients verified 05 2026.", confidence:"medium", category:"accessory" }],
  ["apple techwoven case",           { floor:2, ceiling:4, substances:["recycled woven fabric","TPU frame"], reason:"Apple TechWoven Case. Apple's 2025 replacement for FineWoven. Public materials disclosure is less detailed than FineWoven's was: woven fabric over a TPU frame with recycled content, but Apple has not published the specific recycled percentage. Apple's corporate PFAS phase-out commitment (November 2022) covers this product. Score 2-4 reflects the wider range from limited public disclosure, with the corporate PFAS commitment holding the floor at 2. Ingredients verified 05 2026.", confidence:"medium", category:"accessory" }],
  ["otterbox defender",              { floor:4, ceiling:5, substances:["polycarbonate shell","TPU rubber bumper","synthetic foam liner","BPA residual (polycarbonate)","microplastic shedding"], reason:"OtterBox Defender. Multi-layer rugged case with a polycarbonate hard shell, TPU rubber bumper, and a synthetic foam interior. The Defender's value proposition is impact protection, not material profile. Daily 10 plus hour skin contact with polycarbonate carries documented BPA residual migration: NSF measured ~0.53 micrograms per day from polycarbonate eyewear (the closest published analog to phone cases), below California MADL of 3 micrograms per day but above zero. TPU is generally inert when cured, but Bessa 2023 ES&T showed brominated flame retardants in plastics cross the skin barrier via dermal contact and sweat increases bioavailability; phone case flame retardant chemistry is not publicly disclosed. The 2022 Liu et al. ScienceDirect paper on protective mobile phone cases as microplastic sources documents wear and abrasion releasing microplastic fragments during normal use. OtterBox publishes a Global Restricted Substances Policy referencing TSCA and PFAS regulations but no independent PFAS-free testing. Roughly 50% of the plastic in OtterBox's most popular designs is recycled per their UL Environmental Claim Validation. No B Corp or Climate Neutral certifications. Score 4-5 reflects the petrochemical dermal exposure pathways plus microplastic shedding holding the floor at 4, with the recycled content credit preventing the ceiling from rising above 5. Ingredients verified 05 2026.", confidence:"medium", category:"accessory" }],
  ["otterbox symmetry",              { floor:4, ceiling:5, substances:["polycarbonate shell","TPU rubber bumper","BPA residual (polycarbonate)","microplastic shedding"], reason:"OtterBox Symmetry. Slimmer dual-layer case with a polycarbonate hard shell and TPU rubber bumper. Same material framework as the Defender. Daily skin contact with polycarbonate carries documented BPA residual migration (~0.53 micrograms per day from polycarbonate consumer goods per NSF eyewear data; below California MADL but above zero), and TPU may release brominated flame retardants via dermal contact when present (Bessa 2023 ES&T). Roughly 50% recycled plastic per UL Environmental Claim Validation. No PFAS-free testing or clean-product certifications. Score 4-5. Ingredients verified 05 2026.", confidence:"medium", category:"accessory" }],
  ["otterbox commuter",              { floor:4, ceiling:5, substances:["polycarbonate shell","TPU rubber bumper","BPA residual (polycarbonate)","microplastic shedding"], reason:"OtterBox Commuter. Dual-layer polycarbonate plus TPU. Same material framework as the Symmetry and Defender lines and the same dermal exposure profile: BPA residual migration from polycarbonate surfaces (NSF eyewear data ~0.53 micrograms per day, below California MADL) and potential brominated flame retardant skin transfer when present (Bessa 2023 ES&T). 10 plus hour daily skin contact is the relevant exposure window. Roughly 50% recycled plastic in popular designs. No clean-product certifications. Score 4-5. Ingredients verified 05 2026.", confidence:"medium", category:"accessory" }],
  ["lifeproof",                      { floor:4, ceiling:5, substances:["polycarbonate shell","TPU bumper","waterproof seal","BPA residual (polycarbonate)","microplastic shedding"], reason:"LifeProof. Now an OtterBox sub-brand focused on waterproofing. Polycarbonate hard shell plus TPU bumper with waterproof seals around ports. Same dermal exposure framework as the parent OtterBox lines: documented BPA residual migration from polycarbonate consumer goods (NSF eyewear data ~0.53 micrograms per day, below California MADL but above zero) and potential brominated flame retardant skin transfer from TPU when present (Bessa 2023 ES&T, sweat increases bioavailability). Roughly 50% recycled plastic per OtterBox UL Environmental Claim Validation. No clean-product certifications. Score 4-5. Ingredients verified 05 2026.", confidence:"medium", category:"accessory" }],
  ["mous",                           { floor:4, ceiling:5, substances:["aramid fiber","polycarbonate","TPU","AiroShock foam","BPA residual (polycarbonate)","microplastic shedding"], reason:"Mous. Aramid fiber and polycarbonate composite cases marketed on drop protection (AiroShock foam liner). Daily skin contact with the polycarbonate body carries documented BPA residual migration (~0.53 micrograms per day from polycarbonate consumer goods per NSF eyewear data, below California MADL); TPU components may release brominated flame retardants via dermal contact when present (Bessa 2023 ES&T). Petrochemical materials, no compostability or recycled-content claims publicly verified, no clean-product certifications. Score 4-5 reflects the dermal exposure pathways plus the absence of sustainability framework. Ingredients verified 05 2026.", confidence:"medium", category:"accessory" }],
  ["casetify",                       { floor:4, ceiling:5, substances:["polycarbonate","TPU","custom print finish","BPA residual (polycarbonate)","microplastic shedding"], reason:"Casetify standard line. Polycarbonate and TPU construction with the brand's custom-print finish. Petrochemical dermal exposure framework: documented BPA residual migration from polycarbonate (NSF eyewear data, below California MADL but above zero) plus potential brominated flame retardant skin transfer from TPU when present (Bessa 2023 ES&T). Casetify operates a separate Re/Casetify recycled-plastic line that scores cleaner (entry below). Score 4-5 for the standard line. Ingredients verified 05 2026.", confidence:"medium", category:"accessory" }],
  ["re/casetify",                    { floor:3, ceiling:4, substances:["recycled plastic","TPU","custom print finish","BPA residual (polycarbonate)","microplastic shedding"], reason:"Re/Casetify. Casetify's recycled-plastic line. Cases made from recycled phone cases and other post-consumer plastic. The recycled framing is real (waste diverted from landfill via take-back) but the dermal exposure framework still applies: recycled polycarbonate still carries BPA residuals and the recycled stream may include unknown additive chemistry (Bessa 2023 ES&T on brominated flame retardant skin transfer; NSF on BPA migration from polycarbonate). No B Corp or Climate Neutral certifications, no PFAS-free testing published. Score 3-4 reflects the recycled-content credit pulling the floor down by one notch versus standard Casetify but the polycarbonate dermal exposure profile remaining intact. Ingredients verified 05 2026.", confidence:"medium", category:"accessory" }],
  ["spigen",                         { floor:4, ceiling:5, substances:["polycarbonate","TPU","BPA residual (polycarbonate)","microplastic shedding"], reason:"Spigen. Polycarbonate and TPU cases across the Ultra Hybrid, Tough Armor, and Liquid Crystal lines. Daily skin contact with polycarbonate carries documented BPA residual migration (NSF eyewear data ~0.53 micrograms per day, below California MADL but above zero); TPU components may release brominated flame retardants via dermal contact when present (Bessa 2023 ES&T, sweat increases bioavailability). No sustainability or clean-product claims publicly verified. Score 4-5. Ingredients verified 05 2026.", confidence:"medium", category:"accessory" }],
  ["caseology",                      { floor:4, ceiling:5, substances:["polycarbonate","TPU","BPA residual (polycarbonate)","microplastic shedding"], reason:"Caseology. Spigen subsidiary brand selling lower-cost polycarbonate and TPU cases. Same material framework as Spigen and the same dermal exposure profile: BPA residual migration from polycarbonate plus potential brominated flame retardant transfer from TPU on sweaty skin (NSF eyewear data; Bessa 2023 ES&T). No sustainability or clean-product claims. Score 4-5. Ingredients verified 05 2026.", confidence:"medium", category:"accessory" }],
  ["smartish",                       { floor:4, ceiling:5, substances:["polycarbonate","TPU","BPA residual (polycarbonate)","microplastic shedding"], reason:"Smartish. Direct-to-consumer phone case brand with polycarbonate and TPU construction (Wallet Slayer, Gripzilla, Kung Fu Grip lines). Petrochemical dermal exposure framework applies: BPA residual migration from polycarbonate (~0.53 micrograms per day per NSF eyewear data, below California MADL) and potential brominated flame retardant skin transfer from TPU (Bessa 2023 ES&T). No sustainability or clean-product claims publicly verified. Score 4-5. Ingredients verified 05 2026.", confidence:"medium", category:"accessory" }],
  // HOME TEXTILES
  ["bed sheets",                     { floor:3, ceiling:6, substances:["conventional cotton","synthetic dyes","formaldehyde finish"], reason:"Bed sheets — conventional cotton + formaldehyde wrinkle-free finish + synthetic dyes. 8+ hours daily skin contact. GOTS organic cotton scores 1-2.", confidence:"medium", category:"home_furnishing" }],
  ["bath towel",                     { floor:3, ceiling:5, substances:["conventional cotton","synthetic dyes"], reason:"Bath towel — conventional cotton + synthetic dyes. Daily skin contact after shower. Organic cotton (Coyuchi, Boll & Branch) scores 1-3.", confidence:"medium", category:"home_furnishing" }],
  ["shower curtain",                 { floor:4, ceiling:7, substances:["PVC","phthalates","VOCs"], reason:"Shower curtain — PVC/vinyl shower curtains release 108 VOCs (2008 study). Strong 'new shower curtain smell' is off-gassing. PEVA is slightly better. Fabric/hemp curtains score 1-3.", confidence:"high", category:"home" }],
  ["bath mat",                       { floor:3, ceiling:5, substances:["synthetic rubber backing","polyester","latex"], reason:"Bath mat — synthetic rubber backing + polyester or nylon pile. Wet foot contact daily. Organic cotton mats with natural rubber backing score 1-3.", confidence:"medium", category:"home" }],
  // KITCHEN CONSUMABLES
  ["coffee filter",                  { floor:2, ceiling:3, substances:["bleached paper"], reason:"Coffee filter — bleached paper filters have trace chlorine. Unbleached (brown) filters or stainless steel mesh filters score 1-2. Low concern overall.", confidence:"high", category:"kitchen" }],
  ["paper towel",                    { floor:3, ceiling:5, substances:["chlorine bleach","PFAS in some"], reason:"Paper towel — chlorine bleached + some brands have PFAS for wet strength. Unpaper towels (reusable) score 1-2. Seventh Generation unbleached is cleanest disposable.", confidence:"medium", category:"home" }],
  ["napkins",                        { floor:2, ceiling:4, substances:["chlorine bleach","synthetic dyes"], reason:"Napkins — bleached paper + synthetic dyes in printed versions. Cloth napkins score 1-2. Unbleached paper napkins score 2-3.", confidence:"medium", category:"home" }],
  ["trash bags",                     { floor:3, ceiling:4, substances:["polyethylene"], reason:"Trash bags — LDPE plastic. No food contact concern. Main issue is environmental. Compostable bags (BioBag) are alternative.", confidence:"high", category:"home" }],
  ["dish sponge",                    { floor:3, ceiling:5, substances:["polyurethane foam","polyester","triclosan in some"], reason:"Dish sponge — polyurethane foam + polyester scrubber. Some have antimicrobial (triclosan) treatment. Natural alternatives: Scotch-Brite Greener Clean, loofah, Swedish dishcloth.", confidence:"medium", category:"home" }],
  ["steel wool",                     { floor:2, ceiling:3, substances:["steel"], reason:"Steel wool — plain carbon steel. No chemical concern. Soap-filled pads (SOS, Brillo) score 3-5 due to synthetic detergent + fragrance.", confidence:"high", category:"kitchen" }],
  // BATHROOM ESSENTIALS
  ["toilet paper",                   { floor:2, ceiling:4, substances:["chlorine bleach","PFAS in some"], reason:"Toilet paper — chlorine bleached. Some brands tested positive for PFAS (forever chemicals in recycled content). Bamboo TP (Who Gives a Crap, Reel) scores 1-2.", confidence:"medium", category:"personal_care" }],
  ["flushable wipes",                { floor:4, ceiling:6, substances:["polyester","synthetic fragrance","preservatives"], reason:"Flushable wipes — polyester fiber (not truly flushable) + synthetic fragrance + preservatives. Direct intimate contact. Not biodegradable despite claims.", confidence:"high", category:"personal_care" }],
  ["q tips",                         { floor:2, ceiling:3, substances:["cotton","paper or plastic stick"], reason:"Q-tips — cotton tip + paper or plastic stick. Cotton is clean. Bamboo stick versions score 1-2. Low concern overall.", confidence:"high", category:"personal_care" }],
  ["cotton balls",                   { floor:2, ceiling:3, substances:["conventional cotton","chlorine bleach"], reason:"Cotton balls — conventional bleached cotton. Organic cotton balls score 1-2. Low exposure concern for most uses.", confidence:"high", category:"personal_care" }],
  ["cotton pads",                    { floor:2, ceiling:3, substances:["conventional cotton","chlorine bleach"], reason:"Cotton pads — bleached cotton rounds. Reusable cotton rounds score 1-2. Daily face contact.", confidence:"high", category:"personal_care" }],
  ["dental floss",                   { floor:3, ceiling:5, substances:["PFAS","nylon","synthetic wax"], reason:"Dental floss — most brands contain PFAS (PTFE coating for glide). 2019 study found elevated PFAS blood levels in floss users. Silk floss (Dental Lace) or PFAS-free (Cocofloss) score 1-2.", confidence:"high", category:"personal_care" }],
  ["mouthguard",                     { floor:3, ceiling:4, substances:["BPA-free plastic","EVA"], reason:"Mouthguard — EVA plastic or BPA-free thermoplastic. Prolonged oral contact during sleep. Custom-fit from dentist is cleaner than boil-and-bite.", confidence:"medium", category:"personal_care" }],
  // MEDICINE CABINET
  ["tylenol",                        { floor:3, ceiling:4, substances:["acetaminophen"], reason:"Tylenol — acetaminophen (paracetamol). Active ingredient is well-studied. Check inactive ingredients for synthetic dyes in liquid/gummy forms.", confidence:"high", category:"supplement" }],
  ["advil",                          { floor:3, ceiling:4, substances:["ibuprofen"], reason:"Advil — ibuprofen NSAID. Well-studied active. Brown coating is iron oxide (not synthetic dye). Low concern for occasional use.", confidence:"high", category:"supplement" }],
  ["benadryl",                       { floor:3, ceiling:5, substances:["diphenhydramine","synthetic dyes"], reason:"Benadryl — diphenhydramine + FD&C dyes in pink tablets and liquid. Dye-free versions available. Antihistamine concern mainly for children.", confidence:"high", category:"supplement" }],
  ["tums",                           { floor:3, ceiling:4, substances:["calcium carbonate","synthetic dyes"], reason:"Tums — calcium carbonate + synthetic dyes (FD&C colors vary by flavor). Active ingredient is mineral. Dye concern in regular version.", confidence:"high", category:"supplement" }],
  ["pepto bismol",                   { floor:3, ceiling:5, substances:["bismuth subsalicylate","synthetic dyes"], reason:"Pepto-Bismol — bismuth subsalicylate + FD&C Red 22/Red 28. Not for prolonged use. Bismuth can darken tongue/stool.", confidence:"high", category:"supplement" }],
  ["neosporin",                      { floor:2, ceiling:3, substances:["neomycin","bacitracin","polymyxin B"], reason:"Neosporin — triple antibiotic. Well-studied OTC topical. Neomycin can cause contact dermatitis in some. Petrolatum base.", confidence:"high", category:"personal_care" }],
  ["hydrocortisone cream",           { floor:2, ceiling:3, substances:["hydrocortisone"], reason:"Hydrocortisone 1% — OTC steroid cream. Short-term use is safe. Check for synthetic fragrance in some brands. Fragrance-free versions are cleaner.", confidence:"high", category:"personal_care" }],
  ["calamine lotion",                { floor:1, ceiling:2, substances:["zinc oxide","iron oxide"], reason:"Calamine lotion — zinc oxide + iron oxide (pink color). Mineral-based, very clean formula. Benchmark clean topical.", confidence:"high", category:"personal_care" }],
  ["band aid",                       { floor:3, ceiling:4, substances:["latex or synthetic adhesive","polyethylene pad"], reason:"Band-Aid — adhesive (may contain latex) + polyethylene pad + plastic strip. Fabric bandages + organic cotton pad are cleaner. Patch brand is bamboo.", confidence:"high", category:"personal_care" }],
  ["hydrogen peroxide",              { floor:1, ceiling:2, substances:["hydrogen peroxide"], reason:"Hydrogen peroxide 3% — H2O2 + purified water. Breaks down to water + oxygen. One of the cleanest antiseptics.", confidence:"high", category:"personal_care" }],
  ["rubbing alcohol",                { floor:2, ceiling:3, substances:["isopropyl alcohol"], reason:"Rubbing alcohol — 70% isopropyl alcohol. Evaporates cleanly. No residual chemicals. Clean antiseptic for topical use.", confidence:"high", category:"personal_care" }],
  // SKIN CONDITIONS
  ["acne cream",                     { floor:3, ceiling:6, substances:["benzoyl peroxide or salicylic acid"], reason:"Acne cream — active ingredient determines score. Benzoyl peroxide (score 3-4) is mineral-based. Products with synthetic fragrance and parabens score higher.", confidence:"medium", category:"personal_care" }],
  ["benzoyl peroxide",               { floor:3, ceiling:4, substances:["benzoyl peroxide"], reason:"Benzoyl peroxide — antimicrobial acne treatment. Active ingredient is well-studied. Bleaches fabrics. Check for synthetic fragrance in base formula.", confidence:"high", category:"personal_care" }],
  ["salicylic acid cleanser",        { floor:3, ceiling:5, substances:["salicylic acid"], reason:"Salicylic acid cleanser — BHA exfoliant. Active is well-studied. Check for SLS, synthetic fragrance in the cleanser base. Paula's Choice BHA is cleanest.", confidence:"medium", category:"personal_care" }],
  ["eczema cream",                   { floor:2, ceiling:5, substances:["petrolatum or ceramides"], reason:"Eczema cream — varies. CeraVe/Vanicream (ceramides, score 3-5) vs Tubby Todd (plant-based, score 1-2). Steroid creams for flares are separate (OTC, short-term safe).", confidence:"medium", category:"personal_care" }],
  // EYE CARE
  ["contact lens solution",          { floor:3, ceiling:4, substances:["boric acid","PHMB or hydrogen peroxide"], reason:"Contact lens solution — boric acid buffer + preservative (PHMB or H2O2). Direct eye contact. Hydrogen peroxide systems (ClearCare) are preservative-free. Well-regulated medical device.", confidence:"high", category:"personal_care" }],
  ["eye drops",                      { floor:2, ceiling:4, substances:["preservatives"], reason:"Eye drops — preservative-free single-use vials score 1-2. Multi-use bottles with BAK preservative score 3-5. Direct eye contact, preservative sensitivity concern.", confidence:"medium", category:"personal_care" }],
  // COMFORT
  ["menstrual heating pad",          { floor:2, ceiling:3, substances:["fabric","electronic components"], reason:"Menstrual heating pad — electric pad with fabric cover. No chemical concern in use. Minimal plastic contact. Clean comfort device.", confidence:"high", category:"other" }],
  ["hot water bottle",               { floor:2, ceiling:3, substances:["natural rubber"], reason:"Hot water bottle — natural rubber. No chemical concern in normal use. Silicone versions also clean. Traditional comfort device.", confidence:"high", category:"other" }],
  // GROCERY — ORGANIC VS CONVENTIONAL
  ["organic apples",                 { floor:1, ceiling:2, substances:[], reason:"Organic apples — USDA Organic, no synthetic pesticides. Benchmark clean produce.", confidence:"high", category:"food" }],
  ["organic strawberries",           { floor:1, ceiling:2, substances:[], reason:"Organic strawberries — USDA Organic. Conventional strawberries are #1 on EWG Dirty Dozen (highest pesticide residue).", confidence:"high", category:"food" }],
  ["organic bananas",                { floor:1, ceiling:2, substances:[], reason:"Organic bananas — thick peel provides natural barrier. Conventional bananas are already low-pesticide. Both clean.", confidence:"high", category:"food" }],
  ["baby carrots",                   { floor:2, ceiling:3, substances:["chlorine wash"], reason:"Baby carrots — chlorine wash during processing (FDA approved, rinses off). Organic baby carrots skip chlorine. Low concern overall.", confidence:"high", category:"food" }],
  ["organic milk",                   { floor:1, ceiling:2, substances:[], reason:"Organic milk — no antibiotics, no growth hormones (rBGH), pasture-raised. Benchmark clean dairy.", confidence:"high", category:"food" }],
  ["organic eggs",                   { floor:1, ceiling:2, substances:[], reason:"Organic eggs — USDA Organic feed, no antibiotics. Vital Farms pasture-raised scores lowest.", confidence:"high", category:"food" }],
  ["free range eggs",                { floor:1, ceiling:3, substances:[], reason:"Free range eggs — better than conventional but 'free range' label is loosely regulated. Pasture-raised is the gold standard.", confidence:"medium", category:"food" }],
  // GROCERY — PACKAGED FOODS (MOM BUYS)
  ["annie mac and cheese",           { floor:3, ceiling:4, substances:["conventional wheat","annatto"], reason:"Annie's Mac & Cheese — organic options available. No artificial dyes. Annatto natural colorant. Cleaner than Kraft.", confidence:"high", category:"food_beverage" }],
  ["annies mac",                     { floor:3, ceiling:4, substances:["conventional wheat","annatto"], reason:"Annie's — same as annie mac and cheese.", confidence:"high", category:"food_beverage" }],
  ["kraft mac and cheese",           { floor:5, ceiling:7, substances:["Yellow 5","Yellow 6","sodium phosphate"], reason:"Kraft Mac & Cheese — Yellow 5 + Yellow 6 petroleum dyes (EU requires warning labels) + sodium phosphate. Multiple dye floors fire.", confidence:"high", category:"food_beverage" }],
  ["horizon organic milk",           { floor:1, ceiling:3, substances:[], reason:"Horizon Organic — USDA Organic milk, no rBGH, no antibiotics. Danone owned. UHT (shelf-stable) versions more processed than refrigerated.", confidence:"high", category:"food_beverage" }],
  ["chobani yogurt",                 { floor:2, ceiling:4, substances:["added sugar"], reason:"Chobani — no artificial flavors, no preservatives. Plain scores 1-2. Fruit-on-bottom has 15g+ added sugar (score 3-5). Check sugar content.", confidence:"high", category:"food_beverage" }],
  ["siggi yogurt",                   { floor:2, ceiling:3, substances:[], reason:"Siggi's — Icelandic skyr, simple ingredients, less sugar than most yogurts. No artificial anything. Clean dairy tier.", confidence:"high", category:"food_beverage" }],
  ["silk almond milk",               { floor:3, ceiling:4, substances:["carrageenan in some","gellan gum"], reason:"Silk Almond Milk — some varieties contain carrageenan (inflammatory concern). Check label: 'carrageenan-free' versions score 2-3.", confidence:"high", category:"food_beverage" }],
  ["dave killer bread",              { floor:2, ceiling:4, substances:["organic wheat"], reason:"Dave's Killer Bread — USDA Organic, whole grains, no HFCS, no artificial preservatives. Seeds add nutrition. Clean bread tier.", confidence:"high", category:"food_beverage" }],
  ["earth balance butter",           { floor:3, ceiling:5, substances:["palm oil","natural flavors"], reason:"Earth Balance — palm oil (environmental concern) + 'natural flavors' (vague). Plant-based but processed. Clean butter alternatives: Miyoko's scores 2-3.", confidence:"high", category:"food_beverage" }],
  ["kerrygold butter",               { floor:1, ceiling:3, substances:[], reason:"Kerrygold — Irish grass-fed butter. Simple ingredients: cream, salt. No rBGH. Clean dairy tier.", confidence:"high", category:"food_beverage" }],
  ["land o lakes butter",            { floor:2, ceiling:4, substances:["natural flavors"], reason:"Land O'Lakes — conventional butter. 'Natural flavors' in some varieties. No rBGH pledge. Mid-tier dairy.", confidence:"high", category:"food_beverage" }],
  // KIDS SNACKS
  ["annie bunny snacks",             { floor:2, ceiling:4, substances:["organic wheat"], reason:"Annie's Bunny Snacks — organic, no artificial dyes, no HFCS. Cleaner than Goldfish but still processed. Annatto for color.", confidence:"high", category:"food_beverage" }],
  ["hippeas",                        { floor:2, ceiling:3, substances:[], reason:"Hippeas — organic chickpea puffs. No artificial anything. Simple clean ingredients. Clean snack benchmark.", confidence:"high", category:"food_beverage" }],
  ["clif kid zbar",                  { floor:2, ceiling:4, substances:["organic oats"], reason:"Clif Kid Zbar — USDA Organic, no HFCS, no artificial flavors. 10-12g sugar but organic. Clean kids bar tier.", confidence:"high", category:"food_beverage" }],
  ["rx kids",                        { floor:2, ceiling:3, substances:[], reason:"RX Kids — simple ingredients (dates, egg whites, nuts). No artificial anything. Clean kids protein bar.", confidence:"high", category:"food_beverage" }],
  ["made good granola bar",          { floor:2, ceiling:3, substances:[], reason:"MadeGood — organic, allergy-friendly, no artificial anything. Vegetable-fortified. Clean school-safe snack.", confidence:"high", category:"food_beverage" }],
  // BABY/TODDLER FOOD
  ["happy baby pouch",               { floor:2, ceiling:3, substances:["plastic pouch"], reason:"Happy Baby Organic — USDA Organic ingredients. Concern is plastic pouch container, not food. Glass jar version scores 1-2.", confidence:"high", category:"baby" }],
  ["once upon a farm pouch",         { floor:1, ceiling:3, substances:["plastic pouch"], reason:"Once Upon a Farm — cold-pressed organic, HPP (no heat processing). Cleanest ingredients but still plastic pouch. Jennifer Garner brand.", confidence:"high", category:"baby" }],
  ["earth best baby food",           { floor:2, ceiling:3, substances:[], reason:"Earth's Best — USDA Organic baby food. No artificial anything. Hain Celestial brand. Clean baby food tier.", confidence:"high", category:"baby" }],
  ["gerber puffs",                   { floor:3, ceiling:5, substances:["conventional grain","iron fortification"], reason:"Gerber Puffs — conventional rice/wheat + iron fortification. Some varieties have natural flavors. Concern: arsenic in rice-based baby foods.", confidence:"high", category:"baby" }],
  ["happy tot",                      { floor:2, ceiling:3, substances:["plastic pouch"], reason:"Happy Tot Organic — USDA Organic toddler food. Superfoods line has chia seeds. Plastic pouch is main concern.", confidence:"high", category:"baby" }],
  ["baby mum mum",                   { floor:2, ceiling:4, substances:["rice"], reason:"Baby Mum-Mum — rice-based teething wafer. No artificial anything. Rice arsenic concern for frequent consumption. Rotate with non-rice options.", confidence:"high", category:"baby" }],
  ["teething wafers",                { floor:2, ceiling:4, substances:["rice or wheat"], reason:"Teething wafers — rice-based have arsenic concern. Wheat-based or veggie-based alternatives are cleaner. Happy Baby and Cerebelly are better options.", confidence:"medium", category:"baby" }],
  // KIDS DRINKS
  ["honest kids juice",              { floor:3, ceiling:4, substances:["added sugar"], reason:"Honest Kids — organic juice boxes. Less sugar than Capri Sun (8g vs 13g). No artificial dyes. Plastic pouch concern.", confidence:"high", category:"beverage" }],
  ["apple and eve juice",            { floor:3, ceiling:5, substances:["added sugar","concentrate"], reason:"Apple & Eve — from concentrate + added sugar in some varieties. No artificial dyes. Juice box plastic concern. 100% juice versions are cleaner.", confidence:"high", category:"beverage" }],
  ["pediasure",                      { floor:4, ceiling:6, substances:["sugar","corn syrup solids","synthetic vitamins"], reason:"PediaSure — corn syrup solids + sugar + synthetic vitamin blend. Nutritional supplement but highly processed. Abbott brand. 18g sugar per bottle.", confidence:"high", category:"food_beverage" }],
  // MOM SELF CARE
  ["face roller",                    { floor:1, ceiling:2, substances:["stainless steel or stone"], reason:"Face roller — stainless steel or natural stone (jade, rose quartz). No chemical concern. Clean skincare tool.", confidence:"high", category:"personal_care" }],
  ["gua sha",                        { floor:1, ceiling:2, substances:["natural stone"], reason:"Gua sha — natural stone (jade, bian stone, rose quartz). No chemical concern. Traditional Chinese medicine tool.", confidence:"high", category:"personal_care" }],
  ["jade roller",                    { floor:1, ceiling:2, substances:["jade stone","metal frame"], reason:"Jade roller — natural jade stone + metal frame. No chemical concern. Check for authentic jade (some are dyed glass).", confidence:"high", category:"personal_care" }],
  ["ice roller",                     { floor:2, ceiling:3, substances:["stainless steel","gel"], reason:"Ice roller — stainless steel head with gel coolant inside plastic handle. Brief skin contact. Low concern.", confidence:"high", category:"personal_care" }],
  ["epsom salt",                     { floor:1, ceiling:1, substances:["magnesium sulfate"], reason:"Epsom salt — pure magnesium sulfate mineral. Single ingredient, no additives. Benchmark cleanest bath product.", confidence:"high", category:"personal_care" }],
  ["bath bomb",                      { floor:3, ceiling:6, substances:["synthetic fragrance","synthetic dyes","citric acid"], reason:"Bath bomb — synthetic fragrance + synthetic dyes in most brands. You soak in the dye water. Clean versions (Pacha, Meow Meow Tweet) use plant dyes + essential oils (score 2-3).", confidence:"medium", category:"personal_care" }],
  ["bubble bath adult",              { floor:4, ceiling:6, substances:["SLS","synthetic fragrance","synthetic dyes"], reason:"Bubble bath — SLS surfactant + synthetic fragrance + synthetic dyes. Extended soak in chemical water. Dr. Bronner's or Alaffia are cleaner alternatives.", confidence:"high", category:"personal_care" }],
  ["pregnancy test",                 { floor:2, ceiling:3, substances:["plastic housing"], reason:"Pregnancy test — plastic housing + test strip. Single use, brief hand contact. No chemical exposure concern. Digital versions have more components.", confidence:"high", category:"personal_care" }],
  ["ovulation test",                 { floor:2, ceiling:3, substances:["plastic housing"], reason:"Ovulation test — same as pregnancy test. Plastic housing, brief contact. Low concern.", confidence:"high", category:"personal_care" }],
  ["prenatal gummies",               { floor:3, ceiling:5, substances:["synthetic dyes","sugar","gelatin"], reason:"Prenatal gummies — sugar (3-4g per serving) + synthetic dyes in many brands. Gelatin from conventional sources. Capsule prenatals are cleaner.", confidence:"medium", category:"supplement" }],
  // CLEANING — DEEP DIVE
  ["toilet cleaner",                 { floor:5, ceiling:7, substances:["hydrochloric acid","synthetic fragrance","bleach"], reason:"Toilet cleaner — hydrochloric acid or bleach + synthetic fragrance. Caustic chemicals. Better Life and Seventh Generation make cleaner versions.", confidence:"high", category:"home" }],
  ["shower cleaner",                 { floor:4, ceiling:6, substances:["synthetic fragrance","solvents"], reason:"Shower cleaner — synthetic fragrance + chemical solvents. Daily Shower Spray types score 3-4. Heavy-duty cleaners score 5-7.", confidence:"medium", category:"home" }],
  ["oven cleaner",                   { floor:6, ceiling:8, substances:["sodium hydroxide","synthetic fragrance","solvents"], reason:"Oven cleaner — sodium hydroxide (lye) + synthetic fragrance + chemical solvents. Among harshest household chemicals. Use baking soda paste instead.", confidence:"high", category:"home" }],
  ["drain cleaner",                  { floor:7, ceiling:9, substances:["sodium hydroxide","sulfuric acid","bleach"], reason:"Drain cleaner — sodium hydroxide or sulfuric acid. Most dangerous household chemical category. Can cause severe burns. Use enzyme drain cleaner (BioClean) or mechanical snake instead.", confidence:"high", category:"home" }],
  ["bleach",                         { floor:5, ceiling:7, substances:["sodium hypochlorite","chlorine"], reason:"Bleach — sodium hypochlorite (chlorine). Effective disinfectant but respiratory irritant. Never mix with ammonia or acids. Hydrogen peroxide is safer alternative.", confidence:"high", category:"home" }],
  ["borax",                          { floor:4, ceiling:5, substances:["sodium borate"], reason:"Borax — sodium borate mineral. Natural but not non-toxic. Endocrine disruption at high doses. Skin irritant. Not safe for children to handle. EU restricted.", confidence:"high", category:"home" }],
  ["washing soda",                   { floor:2, ceiling:3, substances:["sodium carbonate"], reason:"Washing soda — sodium carbonate. Natural mineral, effective cleaner/degreaser. Skin irritant at high concentration but clean chemistry. Used in DIY laundry.", confidence:"high", category:"home" }],
  ["baking soda",                    { floor:1, ceiling:1, substances:["sodium bicarbonate"], reason:"Baking soda — sodium bicarbonate. Single mineral ingredient. Non-toxic cleaning + deodorizing. Benchmark cleanest household cleaner.", confidence:"high", category:"home" }],
  ["vinegar cleaner",                { floor:1, ceiling:2, substances:["acetic acid"], reason:"White vinegar — 5% acetic acid. Natural disinfectant + degreaser. Non-toxic. Benchmark clean household cleaner alongside baking soda.", confidence:"high", category:"home" }],
  // LAUNDRY EXTRAS
  ["dryer sheets",                   { floor:5, ceiling:7, substances:["quaternary ammonium","synthetic fragrance","VOCs"], reason:"Dryer sheets — quaternary ammonium compounds + synthetic fragrance + VOCs. Chemical coating transfers to clothes worn against skin all day. Switch to wool dryer balls.", confidence:"high", category:"home" }],
  ["bounce dryer sheets",            { floor:5, ceiling:7, substances:["quaternary ammonium","synthetic fragrance","VOCs"], reason:"Bounce — same as dryer sheets. P&G brand. Quaternary ammonium + heavy synthetic fragrance that transfers to every garment.", confidence:"high", category:"home" }],
  ["fabric softener",                { floor:5, ceiling:7, substances:["quaternary ammonium","synthetic fragrance","preservatives"], reason:"Fabric softener — quaternary ammonium + synthetic fragrance coat every fiber. Residue against skin 24/7. Among highest fragrance loads in home products.", confidence:"high", category:"home" }],
  ["downy fabric softener",          { floor:5, ceiling:7, substances:["quaternary ammonium","synthetic fragrance"], reason:"Downy — P&G fabric softener. Same quat + fragrance concern. Infusions line has even heavier fragrance load.", confidence:"high", category:"home" }],
  ["oxiclean",                       { floor:3, ceiling:4, substances:["sodium percarbonate","surfactants"], reason:"OxiClean — sodium percarbonate (hydrogen peroxide + soda ash). Cleaner chemistry than bleach. Fragrance-free Versatile version is cleanest.", confidence:"high", category:"home" }],
  ["stain remover",                  { floor:3, ceiling:6, substances:["enzymes","surfactants","synthetic fragrance"], reason:"Stain remover — varies. Enzyme-based (Biokleen, Puracy) score 2-3. Chemical-based with fragrance (Shout, Spray 'n Wash) score 5-7.", confidence:"medium", category:"home" }],
  ["bleach alternative",             { floor:2, ceiling:3, substances:["hydrogen peroxide","sodium percarbonate"], reason:"Bleach alternative — hydrogen peroxide or sodium percarbonate based. OxiClean, Seventh Generation, and Molly's Suds versions. Much safer than chlorine bleach.", confidence:"high", category:"home" }],
  // COFFEE ECOSYSTEM
  ["k cup",                          { floor:5, ceiling:7, substances:["plastic","aluminum","microplastics"], reason:"K-Cup — plastic + aluminum pod + hot water through plastic = microplastics in every cup. 2022 study confirmed. Reusable K-Cup filter or pour-over is cleaner.", confidence:"high", category:"kitchen" }],
  ["coffee pod",                     { floor:5, ceiling:7, substances:["plastic","aluminum","microplastics"], reason:"Coffee pod — same as K-Cup. Hot water + plastic = microplastic extraction. Nespresso aluminum pods are slightly better than plastic pods.", confidence:"high", category:"kitchen" }],
  ["paper coffee cup",               { floor:4, ceiling:5, substances:["PFAS lining","polyethylene lining"], reason:"Paper coffee cup — polyethylene or PFAS waterproof lining. Hot liquid extracts chemicals from lining. Bring reusable mug.", confidence:"high", category:"kitchen" }],
  ["styrofoam cup",                  { floor:7, ceiling:9, substances:["polystyrene","styrene"], reason:"Styrofoam cup — polystyrene leaches styrene (IARC Group 2A probable carcinogen). Hot beverages accelerate leaching dramatically. Worst disposable cup option.", confidence:"high", category:"kitchen" }],
  ["coffee creamer",                 { floor:4, ceiling:6, substances:["corn syrup solids","hydrogenated oil","synthetic flavors"], reason:"Coffee creamer (liquid) — corn syrup solids + partially hydrogenated oil (trans fat) + synthetic flavors. Coffee-Mate and International Delight tier. Use real cream or oat creamer.", confidence:"high", category:"food_beverage" }],
  ["half and half",                  { floor:1, ceiling:2, substances:[], reason:"Half and half — cream + milk. Two ingredients. No additives in most brands. Simple clean dairy.", confidence:"high", category:"food_beverage" }],
  ["oat creamer",                    { floor:2, ceiling:4, substances:["oils","gums"], reason:"Oat creamer — oats + water + oil + gum stabilizers. Cleaner than synthetic creamer. Oatly Barista or Califia are popular. Check for added sugar.", confidence:"medium", category:"food_beverage" }],
  // WATER FILTRATION
  ["tap water",                      { floor:2, ceiling:5, substances:["chlorine","fluoride","lead in old pipes","microplastics"], reason:"Tap water — varies by municipality. Chlorine disinfection residual + fluoride. Old pipes can leach lead. EWG Tap Water Database shows local contaminants. Filter recommended.", confidence:"low", category:"beverage" }],
  ["brita filter",                   { floor:2, ceiling:3, substances:["activated carbon"], reason:"Brita — activated carbon filter reduces chlorine, mercury, some pesticides. Does NOT remove fluoride, lead, or microplastics. Basic filtration tier.", confidence:"high", category:"kitchen" }],
  ["pur filter",                     { floor:2, ceiling:3, substances:["activated carbon"], reason:"PUR — similar to Brita. Activated carbon + ion exchange. Removes more lead than Brita. Basic filtration tier.", confidence:"high", category:"kitchen" }],
  ["berkey filter",                  { floor:1, ceiling:2, substances:["gravity-fed carbon"], reason:"Berkey — gravity-fed carbon filter removes bacteria, viruses, heavy metals, pesticides, pharmaceuticals. Benchmark cleanest consumer water filter. Stainless steel housing.", confidence:"high", category:"kitchen" }],
  // CAR
  ["car air freshener",              { floor:6, ceiling:8, substances:["synthetic fragrance","phthalates","VOCs"], reason:"Car air freshener — synthetic fragrance + phthalates + VOCs in small enclosed space. Continuous exposure while driving. Among worst fragrance exposure scenarios.", confidence:"high", category:"other" }],
  ["little trees air freshener",     { floor:6, ceiling:8, substances:["synthetic fragrance","phthalates","VOCs"], reason:"Little Trees — same as car air freshener. Iconic pine tree shape, toxic synthetic fragrance in enclosed car cabin.", confidence:"high", category:"other" }],
  // PARTY SUPPLIES
  ["birthday candles",               { floor:3, ceiling:4, substances:["paraffin wax","synthetic dyes"], reason:"Birthday candles — small paraffin wax + synthetic dyes. Brief burn time (seconds). Beeswax birthday candles score 1-2. Low concern overall.", confidence:"high", category:"home" }],
  ["party plates",                   { floor:3, ceiling:5, substances:["PFAS","bleached paper"], reason:"Paper party plates — many contain PFAS for grease resistance. Hot food on PFAS-coated plate is concern. Bamboo plates or real dishes are cleaner.", confidence:"medium", category:"kitchen" }],
  ["party cups",                     { floor:4, ceiling:6, substances:["polystyrene or polypropylene"], reason:"Plastic party cups — polystyrene (Solo cups, score 5-7) or polypropylene. Stainless steel reusable cups are cleanest alternative.", confidence:"high", category:"kitchen" }],
  ["balloons",                       { floor:3, ceiling:5, substances:["latex or mylar","synthetic dyes"], reason:"Balloons — natural latex (score 2-3) or mylar/foil (score 4-5). Latex allergies are main concern. Environmental hazard for wildlife.", confidence:"medium", category:"other" }],
  ["gift wrap",                      { floor:3, ceiling:4, substances:["synthetic dyes","glitter","lamination"], reason:"Gift wrap — dyed paper, often laminated or glittered (microplastics). Plain kraft paper or fabric wrap (furoshiki) scores 1-2.", confidence:"medium", category:"other" }],
  ["wrapping paper",                 { floor:3, ceiling:4, substances:["synthetic dyes","lamination"], reason:"Wrapping paper — same as gift wrap. Glossy/metallic versions are worst (not recyclable). Brown kraft paper is cleanest.", confidence:"medium", category:"other" }],
  // SEASONAL — SUN
  ["sunscreen spray",                { floor:5, ceiling:7, substances:["chemical UV filters","benzene risk","inhalation"], reason:"Sunscreen spray — chemical UV filters + aerosol inhalation risk. Multiple brands recalled for benzene contamination 2021-2022. Mineral lotion is much safer.", confidence:"high", category:"personal_care" }],
  ["aloe vera gel",                  { floor:2, ceiling:4, substances:["synthetic dyes","synthetic fragrance"], reason:"Aloe vera gel — pure aloe scores 1-2. Commercial gels (green dye + fragrance) score 3-5. Check: should be clear/cloudy, not bright green.", confidence:"medium", category:"personal_care" }],
  ["after sun lotion",               { floor:3, ceiling:5, substances:["synthetic fragrance","dimethicone"], reason:"After sun lotion — synthetic fragrance + dimethicone in most brands. Pure aloe or coconut oil is cleaner alternative.", confidence:"medium", category:"personal_care" }],
  ["chapstick",                      { floor:3, ceiling:5, substances:["petroleum","synthetic flavors","synthetic dyes"], reason:"ChapStick brand — petrolatum base + synthetic flavors + dyes. You ingest lip balm throughout the day. Beeswax-based (Burt's Bees, Hurraw) scores 1-2.", confidence:"high", category:"personal_care" }],
  ["lip sunscreen",                  { floor:3, ceiling:5, substances:["chemical UV filters","petroleum"], reason:"Lip sunscreen — chemical UV filters + petroleum base in most. Ingested repeatedly. Mineral zinc oxide lip SPF (Badger, Sun Bum mineral) scores 2-3.", confidence:"medium", category:"personal_care" }],
  // PANTRY STAPLES
  ["olive oil",                      { floor:1, ceiling:2, substances:[], reason:"Olive oil — single ingredient, cold-pressed. EVOO is benchmark clean cooking oil. Check for authentic sourcing (Italian/Greek/Spanish).", confidence:"high", category:"food" }],
  ["avocado oil",                    { floor:1, ceiling:2, substances:[], reason:"Avocado oil — single ingredient, high smoke point. Clean cooking oil. 2020 UC Davis study found some brands adulterated — Chosen Foods and Primal Kitchen verified.", confidence:"high", category:"food" }],
  ["coconut oil",                    { floor:1, ceiling:2, substances:[], reason:"Coconut oil — single ingredient. Virgin cold-pressed is cleanest. High saturated fat is nutritional concern but no chemical concern.", confidence:"high", category:"food" }],
  ["vegetable oil",                  { floor:3, ceiling:5, substances:["soybean oil","hexane extraction"], reason:"Vegetable oil — typically soybean oil extracted with hexane solvent. Highly refined. Omega-6 inflammatory concern. Switch to olive or avocado oil.", confidence:"high", category:"food" }],
  ["canola oil",                     { floor:3, ceiling:4, substances:["hexane extraction","rapeseed"], reason:"Canola oil — hexane-extracted rapeseed oil. Highly refined but lower omega-6 than soybean. Organic cold-pressed canola scores 2-3.", confidence:"high", category:"food" }],
  ["salt",                           { floor:1, ceiling:1, substances:["sodium chloride"], reason:"Salt — mineral. Sea salt and Himalayan pink salt are minimally processed. Table salt has anti-caking agents (minor concern). Benchmark clean.", confidence:"high", category:"food" }],
  ["black pepper",                   { floor:1, ceiling:2, substances:[], reason:"Black pepper — whole or ground peppercorns. Single ingredient. Organic versions avoid pesticide residue. Clean spice.", confidence:"high", category:"food" }],
  ["honey",                          { floor:1, ceiling:2, substances:[], reason:"Honey — single ingredient from bees. Raw unfiltered is cleanest. Some commercial honey is adulterated with corn syrup — buy local or certified.", confidence:"high", category:"food" }],
  ["maple syrup",                    { floor:1, ceiling:2, substances:[], reason:"Maple syrup — single ingredient, tree sap boiled down. Grade A Dark has most flavor. 'Pancake syrup' (Mrs. Butterworth, Aunt Jemima) is HFCS — not real maple.", confidence:"high", category:"food" }],
  ["agave",                          { floor:2, ceiling:3, substances:["fructose"], reason:"Agave nectar — highly processed (despite natural marketing). Very high fructose content (85%+). Liver processes fructose like alcohol. Less clean than honey or maple.", confidence:"high", category:"food" }],
  ["apple cider vinegar",            { floor:1, ceiling:2, substances:[], reason:"Apple cider vinegar — fermented apples. Raw unfiltered with 'mother' is cleanest (Bragg's). Clean pantry staple.", confidence:"high", category:"food" }],
  ["soy sauce",                      { floor:2, ceiling:4, substances:["sodium","caramel color in some"], reason:"Soy sauce — naturally brewed (Kikkoman) is fermented soybeans/wheat. High sodium. Cheap brands use hydrolyzed soy + caramel color (score 4-5).", confidence:"high", category:"food" }],
  ["kikkoman",                       { floor:2, ceiling:3, substances:["sodium"], reason:"Kikkoman — naturally brewed soy sauce. Soybeans + wheat + salt + water. High sodium but clean fermented product.", confidence:"high", category:"food" }],
  ["vanilla extract",                { floor:1, ceiling:2, substances:["alcohol"], reason:"Vanilla extract — vanilla beans + alcohol. Simple, clean. Imitation vanilla (vanillin from wood pulp or petroleum) scores 3-4.", confidence:"high", category:"food" }],
  ["baking powder",                  { floor:1, ceiling:2, substances:["sodium bicarbonate","cream of tartar"], reason:"Baking powder — sodium bicarbonate + acid (cream of tartar or sodium aluminum sulfate). Aluminum-free versions are cleanest.", confidence:"high", category:"food" }],
  ["chocolate chips",                { floor:2, ceiling:5, substances:["sugar","soy lecithin"], reason:"Chocolate chips — varies. Dark chocolate with cocoa butter scores 2-3. Milk chocolate with artificial flavors scores 4-5. Enjoy Life is allergen-free clean option.", confidence:"medium", category:"food_beverage" }],
  ["sugar",                          { floor:2, ceiling:3, substances:["sucrose"], reason:"White sugar — refined sucrose from cane or beet. Simple ingredient. Nutritional concern (empty calories) but no chemical additives in pure sugar.", confidence:"high", category:"food" }],
  ["brown sugar",                    { floor:2, ceiling:3, substances:["sucrose","molasses"], reason:"Brown sugar — white sugar + molasses. Two ingredients. No chemical concern. Same nutritional concern as white sugar.", confidence:"high", category:"food" }],
  ["powdered sugar",                 { floor:2, ceiling:3, substances:["sucrose","cornstarch"], reason:"Powdered sugar — sugar + cornstarch (anti-caking). Simple. No chemical concern.", confidence:"high", category:"food" }],
  // CANNED GOODS
  ["canned tomatoes",                { floor:3, ceiling:5, substances:["BPA lining","citric acid"], reason:"Canned tomatoes — acidic food in BPA-lined can leaches more BPA than non-acidic foods. Muir Glen (BPA-free can) and Pomi (carton) score 1-3.", confidence:"high", category:"food" }],
  ["tomato paste",                   { floor:3, ceiling:5, substances:["BPA lining"], reason:"Tomato paste — concentrated acidic food in BPA-lined can. High acid + long shelf time = more BPA leaching. Glass jar or tube versions score 1-2.", confidence:"high", category:"food" }],
  ["tomato sauce",                   { floor:3, ceiling:5, substances:["BPA lining","added sugar in some"], reason:"Tomato sauce — BPA can concern + some brands add sugar. Rao's (glass jar, no sugar) scores 1-2. Check ingredients.", confidence:"medium", category:"food" }],
  ["canned beans",                   { floor:3, ceiling:4, substances:["BPA lining","sodium"], reason:"Canned beans — BPA can lining (less leaching than tomatoes — neutral pH). Eden Foods uses BPA-free cans. High sodium — rinse before eating.", confidence:"high", category:"food" }],
  ["canned corn",                    { floor:3, ceiling:4, substances:["BPA lining","added sugar"], reason:"Canned corn — BPA can lining + some brands add sugar. Frozen corn is cleaner alternative (no can lining).", confidence:"high", category:"food" }],
  ["canned soup",                    { floor:4, ceiling:6, substances:["BPA lining","sodium","preservatives"], reason:"Canned soup — BPA can + very high sodium (800-1200mg per serving) + preservatives. Hot liquid in BPA can = high leaching. Carton soups (Pacific) are cleaner.", confidence:"high", category:"food" }],
  ["chicken broth",                  { floor:3, ceiling:4, substances:["BPA lining in cans","sodium"], reason:"Chicken broth — carton versions (Pacific, Kettle & Fire) score 2-3. Canned versions have BPA concern. High sodium in all.", confidence:"medium", category:"food" }],
  ["bone broth",                     { floor:2, ceiling:3, substances:[], reason:"Bone broth — simmered bones + vegetables + apple cider vinegar. Homemade is benchmark clean. Packaged versions (Kettle & Fire) in cartons score 2-3.", confidence:"high", category:"food" }],
  // FROZEN
  ["frozen vegetables",              { floor:1, ceiling:2, substances:[], reason:"Frozen vegetables — flash-frozen at peak nutrition. No preservatives needed. Often more nutritious than 'fresh' produce shipped long distances. Benchmark clean.", confidence:"high", category:"food" }],
  ["frozen fruit",                   { floor:1, ceiling:2, substances:[], reason:"Frozen fruit — flash-frozen, no preservatives. Same nutritional value as fresh. Plastic bag is only concern (minimal contact with frozen food). Benchmark clean.", confidence:"high", category:"food" }],
  ["frozen pizza",                   { floor:4, ceiling:7, substances:["preservatives","sodium","TBHQ in some"], reason:"Frozen pizza — varies widely. Amy's Organic scores 3-4. DiGiorno/Totino's score 5-7 (TBHQ, sodium 800mg+). Check ingredients.", confidence:"medium", category:"food" }],
  ["ice cream",                      { floor:2, ceiling:5, substances:["guar gum","carrageenan","artificial flavors"], reason:"Ice cream — varies. Simple ingredients (cream, sugar, eggs) scores 2-3. Carrageenan + artificial flavors scores 4-5. Haagen-Dazs original is cleanest mainstream.", confidence:"medium", category:"food_beverage" }],
  ["frozen waffles",                 { floor:3, ceiling:6, substances:["TBHQ in some","HFCS","sodium"], reason:"Frozen waffles — Eggo has TBHQ (score 5-6). Van's or Nature's Path organic score 2-3. Check for TBHQ and HFCS.", confidence:"medium", category:"food_beverage" }],
  // BODY CARE — WOMEN
  ["jergens",                        { floor:5, ceiling:6, substances:["synthetic fragrance","parabens","dimethicone"], reason:"Jergens — synthetic fragrance + parabens + dimethicone in most formulas. Daily full-body application concern.", confidence:"high", category:"personal_care" }],
  ["nivea",                          { floor:4, ceiling:6, substances:["synthetic fragrance","mineral oil"], reason:"Nivea — mineral oil base + synthetic fragrance. Petroleum-derived moisturizer with daily full-body use.", confidence:"high", category:"personal_care" }],
  ["vaseline",                       { floor:4, ceiling:5, substances:["petroleum jelly"], reason:"Vaseline — 100% petroleum jelly. Occlusive barrier, petroleum-derived. No fragrance in original but petrochemical concern.", confidence:"high", category:"personal_care" }],
  ["bath and body works",            { floor:5, ceiling:7, substances:["synthetic fragrance","parabens","phthalates"], reason:"Bath and Body Works — very heavy synthetic fragrance load + parabens. Some of highest fragrance concentration in mainstream personal care.", confidence:"high", category:"personal_care" }],
  ["venus razor",                    { floor:3, ceiling:5, substances:["plastic handle","lubricating strip"], reason:"Gillette Venus — plastic handle + synthetic lubricating strip (PEG, fragrance). Clean alternative: safety razor with metal handle.", confidence:"high", category:"personal_care" }],
  ["billie razor",                   { floor:3, ceiling:4, substances:["plastic handle"], reason:"Billie — plastic handle but no fragrance in lubricating strip. Cleaner than Venus but still disposable plastic.", confidence:"high", category:"personal_care" }],
  ["nair",                           { floor:6, ceiling:8, substances:["calcium hydroxide","potassium thioglycolate","synthetic fragrance"], reason:"Nair — calcium hydroxide + potassium thioglycolate (chemical depilatories) + synthetic fragrance. Harsh chemicals on skin for extended contact.", confidence:"high", category:"personal_care" }],
  // NAIL CARE
  ["opi",                            { floor:5, ceiling:7, substances:["formaldehyde resin","toluene","DBP"], reason:"OPI — formaldehyde resin + toluene + DBP in some formulas. \"3-free\" versions still contain other concerning solvents.", confidence:"high", category:"personal_care" }],
  ["essie",                          { floor:5, ceiling:6, substances:["formaldehyde resin","synthetic dyes"], reason:"Essie — formaldehyde resin in most formulas. Marketed as cleaner than OPI but still conventional nail polish chemistry.", confidence:"high", category:"personal_care" }],
  ["sally hansen",                   { floor:5, ceiling:7, substances:["formaldehyde resin","toluene","DBP"], reason:"Sally Hansen — conventional nail polish chemistry. Some \"good kind\" line is cleaner but most products contain formaldehyde resin.", confidence:"high", category:"personal_care" }],
  ["gel polish",                     { floor:5, ceiling:7, substances:["HEMA","photoinitiators","formaldehyde resin"], reason:"Gel nail polish — HEMA (contact allergen, EU restricting) + UV-cured photoinitiators + formaldehyde resin. Longer skin contact than regular polish.", confidence:"high", category:"personal_care" }],
  ["nail polish remover",            { floor:5, ceiling:7, substances:["acetone","ethyl acetate"], reason:"Nail polish remover — acetone or ethyl acetate solvent. Strong VOC exposure during use. Use in ventilated area.", confidence:"high", category:"personal_care" }],
  ["acetone",                        { floor:5, ceiling:7, substances:["acetone"], reason:"Acetone — strong solvent, VOC exposure during use. Drying to nails and skin. Use in ventilated area.", confidence:"high", category:"personal_care" }],
  // SKINCARE — WOMEN
  ["cetaphil lotion",                { floor:4, ceiling:6, substances:["parabens","synthetic fragrance"], reason:"Cetaphil Daily Moisturizing Lotion — parabens (methylparaben, propylparaben) + synthetic fragrance. Marketed as dermatologist-recommended but conventional preservatives.", confidence:"high", category:"personal_care" }],
  ["neutrogena",                     { floor:4, ceiling:7, substances:["synthetic fragrance","oxybenzone"], reason:"Neutrogena — wide range. Sunscreens contain oxybenzone (endocrine disruptor). Moisturizers contain synthetic fragrance. Score varies: mineral sunscreen 3-4, chemical sunscreen 6-8.", confidence:"medium", category:"personal_care" }],
  ["aveeno",                         { floor:3, ceiling:5, substances:["synthetic fragrance","dimethicone"], reason:"Aveeno — oat-based but contains dimethicone + synthetic fragrance in most formulas. Cleaner than Jergens/Nivea but not clean.", confidence:"high", category:"personal_care" }],
  ["eucerin",                        { floor:4, ceiling:6, substances:["synthetic fragrance","mineral oil","lanolin alcohol"], reason:"Eucerin — mineral oil base + synthetic fragrance. Petroleum-derived moisturizer. Better for eczema than alternatives but not clean formula.", confidence:"high", category:"personal_care" }],
  ["la roche posay",                 { floor:3, ceiling:5, substances:["synthetic fragrance"], reason:"La Roche-Posay — thermal spring water base, fragrance-free in many products. Mineral sunscreens are cleaner tier. Some products contain synthetic fragrance.", confidence:"medium", category:"personal_care" }],
  ["glossier",                       { floor:3, ceiling:5, substances:["synthetic fragrance","dimethicone"], reason:"Glossier — minimalist branding but conventional formulas. Dimethicone + synthetic fragrance in most products. Cleaner than drugstore, not as clean as RMS/Kosas.", confidence:"high", category:"personal_care" }],
  ["clinique",                       { floor:4, ceiling:6, substances:["synthetic fragrance","dimethicone","BHT"], reason:"Clinique — claims 'allergy tested' but contains BHT preservative + dimethicone + fragrance in many products. Department store conventional tier.", confidence:"high", category:"personal_care" }],
  ["estee lauder",                   { floor:4, ceiling:6, substances:["synthetic fragrance","BHT","parabens"], reason:"Estee Lauder — synthetic fragrance + BHT + parabens across most product lines. Luxury branding, conventional chemistry.", confidence:"high", category:"personal_care" }],
  ["kiehls",                         { floor:3, ceiling:5, substances:["synthetic fragrance","dimethicone"], reason:"Kiehl's — natural-positioned but dimethicone + synthetic fragrance in most formulas. Cleaner than Clinique/Estee Lauder but not benchmark clean.", confidence:"high", category:"personal_care" }],
  // MAKEUP — WOMEN
  ["maybelline",                     { floor:4, ceiling:6, substances:["synthetic fragrance","BHT","synthetic dyes"], reason:"Maybelline — synthetic fragrance + BHT + petroleum-derived synthetic dyes across most products. L'Oreal-owned drugstore tier.", confidence:"high", category:"personal_care" }],
  ["maybelline mascara",             { floor:4, ceiling:6, substances:["synthetic fragrance","BHT","carbon black"], reason:"Maybelline mascara — BHT preservative + synthetic fragrance + carbon black. Eye area application daily.", confidence:"high", category:"personal_care" }],
  ["covergirl",                      { floor:4, ceiling:7, substances:["synthetic fragrance","BHT","talc","synthetic dyes"], reason:"CoverGirl — synthetic fragrance + BHT + talc (IARC 2A asbestos-free) + petroleum-derived dyes. Some products contain parabens.", confidence:"high", category:"personal_care" }],
  ["covergirl foundation",           { floor:4, ceiling:6, substances:["synthetic fragrance","dimethicone","talc"], reason:"CoverGirl foundation — dimethicone + talc + synthetic fragrance. Full-face daily application concern.", confidence:"high", category:"personal_care" }],
  ["nyx",                            { floor:4, ceiling:6, substances:["synthetic fragrance","synthetic dyes"], reason:"NYX Cosmetics — L'Oreal-owned. Synthetic fragrance + petroleum-derived dyes. Affordable but conventional chemistry.", confidence:"high", category:"personal_care" }],
  ["elf cosmetics",                  { floor:3, ceiling:5, substances:["dimethicone","synthetic dyes"], reason:"e.l.f. — no parabens, no phthalates, mostly fragrance-free. Cleaner than drugstore peers but dimethicone + synthetic dyes still present.", confidence:"high", category:"personal_care" }],
  ["e.l.f.",                         { floor:3, ceiling:5, substances:["dimethicone","synthetic dyes"], reason:"e.l.f. Cosmetics — same as elf cosmetics. Cleaner drugstore option but not benchmark clean.", confidence:"high", category:"personal_care" }],
  ["mac cosmetics",                  { floor:4, ceiling:6, substances:["synthetic fragrance","talc","parabens"], reason:"MAC — synthetic fragrance + talc + parabens in many formulas. Professional-grade pigments but conventional preservatives.", confidence:"high", category:"personal_care" }],
  ["charlotte tilbury",              { floor:4, ceiling:6, substances:["synthetic fragrance","dimethicone","talc"], reason:"Charlotte Tilbury — luxury positioning but synthetic fragrance + dimethicone + talc. Not cleaner than drugstore chemically.", confidence:"high", category:"personal_care" }],
  ["nars",                           { floor:4, ceiling:6, substances:["synthetic fragrance","dimethicone","talc"], reason:"NARS — synthetic fragrance + dimethicone + talc. Shiseido-owned. Luxury tier, conventional chemistry.", confidence:"high", category:"personal_care" }],
  ["too faced",                      { floor:4, ceiling:6, substances:["synthetic fragrance","dimethicone","BHT"], reason:"Too Faced — heavy synthetic fragrance + dimethicone + BHT. Estee Lauder-owned.", confidence:"high", category:"personal_care" }],
  // PRESTIGE MAKEUP — ADDITIONAL BRANDS
  ["rare beauty",                    { floor:3, ceiling:5, substances:["dimethicone","synthetic dyes"], reason:"Rare Beauty — Selena Gomez brand. No parabens, no sulfates. Some dimethicone + synthetic dyes. Cleaner than drugstore, not benchmark clean.", confidence:"high", category:"personal_care" }],
  ["it cosmetics",                   { floor:4, ceiling:6, substances:["synthetic fragrance","dimethicone","talc"], reason:"IT Cosmetics — L'Oreal owned. Synthetic fragrance + dimethicone + talc in CC cream and foundation. Anti-aging claims, conventional chemistry.", confidence:"high", category:"personal_care" }],
  ["it cosmetics cc cream",          { floor:4, ceiling:6, substances:["synthetic fragrance","dimethicone","talc","titanium dioxide"], reason:"IT Cosmetics CC Cream — dimethicone + talc + titanium dioxide + synthetic fragrance. Full-face daily application.", confidence:"high", category:"personal_care" }],
  ["anastasia beverly hills",        { floor:4, ceiling:6, substances:["synthetic fragrance","synthetic dyes","talc"], reason:"Anastasia Beverly Hills — synthetic fragrance + talc + petroleum-derived dyes. Popular brow products contain conventional preservatives.", confidence:"high", category:"personal_care" }],
  ["laura mercier",                  { floor:4, ceiling:6, substances:["synthetic fragrance","dimethicone","talc"], reason:"Laura Mercier — Shiseido owned. Synthetic fragrance + dimethicone + talc. Setting powder is flagship product with talc as main ingredient.", confidence:"high", category:"personal_care" }],
  ["laura mercier setting powder",   { floor:4, ceiling:6, substances:["talc","synthetic fragrance","dimethicone"], reason:"Laura Mercier Translucent Setting Powder — talc is #1 ingredient (IARC 2A asbestos-free) + dimethicone + synthetic fragrance. Inhaled daily.", confidence:"high", category:"personal_care" }],
  // DAILY ESSENTIALS
  ["oral b",                         { floor:3, ceiling:5, substances:["BPA-free plastic","nylon bristles"], reason:"Oral-B — plastic handle + nylon bristles. Electric versions contain more plastic + battery. Bamboo toothbrush is cleaner alternative.", confidence:"medium", category:"personal_care" }],
  ["oral b toothbrush",              { floor:3, ceiling:5, substances:["BPA-free plastic","nylon bristles"], reason:"Oral-B toothbrush — plastic handle + nylon bristles. Switch to bamboo for lower plastic exposure.", confidence:"medium", category:"personal_care" }],
  ["calvin klein bra",               { floor:4, ceiling:6, substances:["nylon","spandex","synthetic dyes","formaldehyde"], reason:"Calvin Klein bra — nylon/spandex + synthetic dyes + formaldehyde finishing in imported garments. PVH owned. No OEKO-TEX on intimates.", confidence:"high", category:"clothing" }],
  ["calvin klein underwear",         { floor:4, ceiling:6, substances:["nylon","spandex","synthetic dyes","formaldehyde"], reason:"Calvin Klein underwear — nylon/spandex + synthetic dyes + formaldehyde. Same concerns as CK bra.", confidence:"high", category:"clothing" }],
  ["aquaphor lip",                   { floor:3, ceiling:4, substances:["petroleum jelly","mineral oil"], reason:"Aquaphor Lip Repair — petroleum jelly base + mineral oil. Occlusive barrier, petroleum-derived. Ingested throughout day. Beeswax alternatives cleaner.", confidence:"high", category:"personal_care" }],
  ["hand sanitizer",                 { floor:4, ceiling:6, substances:["synthetic fragrance","triclosan in some"], reason:"Hand sanitizer — alcohol-based is safer than triclosan-based. Conventional brands add synthetic fragrance. Dr. Bronner's organic version is cleanest.", confidence:"medium", category:"personal_care" }],
  ["bioderma",                       { floor:3, ceiling:5, substances:["PEG","synthetic fragrance"], reason:"Bioderma — French pharmacy brand. Some PEG surfactants + fragrance in certain lines. Sensibio (pink cap) is cleanest — no fragrance.", confidence:"medium", category:"personal_care" }],
  ["micellar water",                 { floor:3, ceiling:5, substances:["PEG surfactants","synthetic fragrance"], reason:"Micellar water — gentle but contains PEG surfactants. Varies by brand. Garnier versions have fragrance, Bioderma Sensibio is cleanest.", confidence:"medium", category:"personal_care" }],
  ["eye cream",                      { floor:3, ceiling:6, substances:["synthetic fragrance","retinol","peptides"], reason:"Eye cream — varies widely by brand. Look for fragrance-free with minimal ingredients. Petroleum-free, paraben-free formulas are cleanest.", confidence:"low", category:"personal_care" }],
  ["night cream",                    { floor:3, ceiling:6, substances:["synthetic fragrance","retinol","dimethicone"], reason:"Night cream — varies by brand. Active ingredients (retinol, peptides) are intentional. Avoid synthetic fragrance in leave-on overnight products.", confidence:"low", category:"personal_care" }],
  ["face oil",                       { floor:2, ceiling:4, substances:[], reason:"Face oil — typically cleaner than creams (fewer preservatives needed). Best when single-ingredient (rosehip, jojoba, squalane). Avoid synthetic fragrance additions.", confidence:"medium", category:"personal_care" }],
  ["silk pillowcase",                { floor:2, ceiling:3, substances:["silk","natural dyes"], reason:"Silk pillowcase — natural protein fiber, hypoallergenic. OEKO-TEX certified versions are cleanest. Some use synthetic dyes or chemical finishes.", confidence:"medium", category:"home_furnishing" }],
  ["makeup wipes",                   { floor:5, ceiling:7, substances:["synthetic fragrance","preservatives","polyester"], reason:"Makeup wipes — polyester/rayon fabric + synthetic fragrance + preservative cocktail. Single-use plastic. Switch to reusable cotton rounds or oil cleanser.", confidence:"high", category:"personal_care" }],
  ["urban decay",                    { floor:4, ceiling:6, substances:["synthetic fragrance","dimethicone","talc"], reason:"Urban Decay — synthetic fragrance + dimethicone + talc. L'Oreal-owned. Conventional chemistry despite edgy branding.", confidence:"high", category:"personal_care" }],
  ["benefit cosmetics",              { floor:4, ceiling:6, substances:["synthetic fragrance","dimethicone","parabens"], reason:"Benefit — synthetic fragrance + dimethicone + parabens in many products. LVMH-owned. Conventional chemistry.", confidence:"high", category:"personal_care" }],
  ["tarte",                          { floor:3, ceiling:5, substances:["dimethicone","synthetic dyes"], reason:"Tarte — claims 'clean' but dimethicone + synthetic dyes in most products. No parabens, no synthetic fragrance. Cleaner than MAC/NARS but not benchmark.", confidence:"high", category:"personal_care" }],
  ["bare minerals",                  { floor:2, ceiling:4, substances:["dimethicone"], reason:"bareMinerals — mineral-based, no synthetic fragrance, no parabens, no talc. Dimethicone in some products. Cleaner end of conventional makeup.", confidence:"high", category:"personal_care" }],
  // SKINCARE — PRESTIGE/CLEAN BRANDS
  ["sunday riley",                 { floor:2, ceiling:4, substances:["retinol","glycolic acid"], reason:"Sunday Riley — active-forward skincare. Retinol and acids are potent but intentional. No synthetic fragrance, no parabens. Clean prestige tier.", confidence:"high", category:"personal_care" }],
  // TRENDING SKINCARE — CLEAN-LEANING
  ["the inkey list",               { floor:2, ceiling:4, substances:[], reason:"The Inkey List — minimal ingredients, no synthetic fragrance, no parabens. Affordable clean-leaning skincare. Some dimethicone in select products.", confidence:"high", category:"personal_care" }],
  ["good molecules",               { floor:2, ceiling:4, substances:[], reason:"Good Molecules — fragrance-free, no parabens, minimal ingredient lists. Clean affordable skincare tier.", confidence:"high", category:"personal_care" }],
  ["versed skincare",              { floor:2, ceiling:4, substances:["dimethicone"], reason:"Versed — EWG verified on some products, no synthetic fragrance, no parabens. Some dimethicone. Target-exclusive clean brand.", confidence:"high", category:"personal_care" }],
  ["glow recipe",                  { floor:3, ceiling:5, substances:["synthetic fragrance","dimethicone"], reason:"Glow Recipe — fruit-themed but contains synthetic fragrance + dimethicone in many products. K-beauty influenced. Better than drugstore, not fully clean.", confidence:"high", category:"personal_care" }],
  ["summer fridays",               { floor:2, ceiling:4, substances:["dimethicone"], reason:"Summer Fridays — fragrance-free in core products, no parabens. Some dimethicone. Clean-leaning prestige skincare.", confidence:"high", category:"personal_care" }],
  ["sol de janeiro",               { floor:4, ceiling:6, substances:["synthetic fragrance","dimethicone"], reason:"Sol de Janeiro — VERY heavy synthetic fragrance (signature Bum Bum scent is #1 selling point). Dimethicone. Fragrance load is among the heaviest in prestige body care.", confidence:"high", category:"personal_care" }],
  ["tree hut scrub",               { floor:4, ceiling:6, substances:["synthetic fragrance","PEG"], reason:"Tree Hut — synthetic fragrance + PEG emulsifiers. Affordable body scrub but heavy fragrance. Switch to DIY sugar + coconut oil scrub.", confidence:"high", category:"personal_care" }],
  // TRENDING MAKEUP — CLEAN
  ["tower 28",                     { floor:1, ceiling:3, substances:[], reason:"Tower 28 — National Eczema Association approved. No synthetic fragrance, no parabens, no talc, no dimethicone. Benchmark cleanest mainstream makeup brand.", confidence:"high", category:"personal_care" }],
  ["merit beauty",                 { floor:2, ceiling:4, substances:["dimethicone"], reason:"Merit — minimal ingredient approach, no synthetic fragrance. Some dimethicone. Clean-leaning minimalist makeup.", confidence:"high", category:"personal_care" }],
  ["kosas concealer",              { floor:2, ceiling:4, substances:[], reason:"Kosas Revealer Concealer — clean at Sephora, no synthetic fragrance, no parabens. Skin-care infused formula.", confidence:"high", category:"personal_care" }],
  ["milk makeup",                  { floor:3, ceiling:5, substances:["dimethicone","synthetic dyes"], reason:"Milk Makeup — vegan, cruelty-free but dimethicone + synthetic dyes in many products. No parabens. Mid-tier clean.", confidence:"high", category:"personal_care" }],
  // TRENDING HAIR CARE
  ["k18 mask",                     { floor:2, ceiling:4, substances:[], reason:"K18 — bioactive peptide hair mask. Minimal ingredients, no synthetic fragrance, no silicones. Leave-in formula. Clean hair treatment.", confidence:"high", category:"personal_care" }],
  ["amika",                        { floor:3, ceiling:5, substances:["synthetic fragrance","dimethicone"], reason:"Amika — synthetic fragrance + silicones in most products. Colorful branding, conventional chemistry. Better than salon peers on some metrics.", confidence:"high", category:"personal_care" }],
  ["color wow",                    { floor:3, ceiling:5, substances:["dimethicone","cyclopentasiloxane"], reason:"Color Wow — silicone-heavy formulas (dimethicone, cyclopentasiloxane). No sulfates. Claims color-safe but conventional silicone approach.", confidence:"high", category:"personal_care" }],
  ["bondi boost",                  { floor:3, ceiling:5, substances:["synthetic fragrance"], reason:"Bondi Boost — Australian brand with synthetic fragrance in most products. Plant extracts are minor ingredients. SLS-free but not fully clean.", confidence:"medium", category:"personal_care" }],
  // TRENDING DEODORANT — CLEAN
  ["kopari deodorant",             { floor:2, ceiling:3, substances:[], reason:"Kopari — coconut oil based, no aluminum, no synthetic fragrance, no parabens. Clean deodorant brand.", confidence:"high", category:"personal_care" }],
  ["megababe",                     { floor:2, ceiling:4, substances:[], reason:"Megababe — no aluminum, no synthetic fragrance. Thigh rescue and body powder products are clean-formulated. Some dimethicone in select items.", confidence:"high", category:"personal_care" }],
  // TRENDING PERIOD CARE — CLEAN
  ["flex disc",                    { floor:2, ceiling:3, substances:["medical-grade polymer"], reason:"Flex Disc — medical-grade polymer, single-use menstrual disc. Cleaner than pads/tampons (no rayon, no fragrance) but disposable. Reusable Flex Cup scores 1-2.", confidence:"high", category:"personal_care" }],
  ["honey pot",                    { floor:2, ceiling:3, substances:[], reason:"The Honey Pot — plant-based feminine care, no synthetic fragrance, no chlorine bleaching. Organic cotton pads. Clean period care brand.", confidence:"high", category:"personal_care" }],
  ["the honey pot",                { floor:2, ceiling:3, substances:[], reason:"The Honey Pot — same as honey pot. Plant-derived, organic cotton, no synthetic fragrance.", confidence:"high", category:"personal_care" }],
  ["honey pot pads",               { floor:2, ceiling:3, substances:[], reason:"The Honey Pot pads — organic cotton, plant-derived, no chlorine bleaching, no synthetic fragrance.", confidence:"high", category:"personal_care" }],
  ["paula choice",                 { floor:2, ceiling:4, substances:[], reason:"Paula's Choice — no fragrance, no dyes, evidence-based formulas. BHA/AHA actives are intentional. One of the cleanest mainstream skincare brands.", confidence:"high", category:"personal_care" }],
  ["paulas choice",                { floor:2, ceiling:4, substances:[], reason:"Paula's Choice — same as paula choice.", confidence:"high", category:"personal_care" }],
  ["first aid beauty",             { floor:2, ceiling:4, substances:["dimethicone"], reason:"First Aid Beauty — fragrance-free, no parabens. Some dimethicone. Clean-leaning sensitive skin brand. P&G owned.", confidence:"high", category:"personal_care" }],
  ["origins",                      { floor:3, ceiling:5, substances:["synthetic fragrance","dimethicone"], reason:"Origins — plant-positioned but synthetic fragrance in many products + dimethicone. Estee Lauder owned. Greenwashing concern.", confidence:"high", category:"personal_care" }],
  ["philosophy",                   { floor:4, ceiling:6, substances:["synthetic fragrance","SLS"], reason:"Philosophy — heavy synthetic fragrance + SLS in cleansers. Coty owned. Marketed as gentle but conventional chemistry.", confidence:"high", category:"personal_care" }],
  ["sk-ii",                        { floor:3, ceiling:5, substances:["synthetic fragrance","parabens"], reason:"SK-II — pitera (galactomyces ferment filtrate) base but contains synthetic fragrance + parabens. P&G luxury tier.", confidence:"high", category:"personal_care" }],
  ["fresh beauty",                 { floor:3, ceiling:5, substances:["synthetic fragrance","dimethicone"], reason:"Fresh — natural-positioned but synthetic fragrance + dimethicone. LVMH owned. Sugar lip balm is their cleanest product.", confidence:"high", category:"personal_care" }],
  // HAIR CARE — WOMEN
  ["moroccan oil",                 { floor:4, ceiling:6, substances:["synthetic fragrance","dimethicone","cyclomethicone"], reason:"Moroccanoil — heavy synthetic fragrance (signature scent) + silicones (dimethicone, cyclomethicone). Argan oil is minor ingredient.", confidence:"high", category:"personal_care" }],
  ["redken",                       { floor:4, ceiling:6, substances:["synthetic fragrance","SLS","dimethicone"], reason:"Redken — L'Oreal pro brand. SLS + synthetic fragrance + silicones. Salon tier but conventional chemistry.", confidence:"high", category:"personal_care" }],
  ["chi hair",                     { floor:4, ceiling:6, substances:["synthetic fragrance","dimethicone","cyclomethicone"], reason:"CHI — heavy silicone load (dimethicone, cyclomethicone) + synthetic fragrance. Silk proteins are minor ingredients.", confidence:"high", category:"personal_care" }],
  ["bumble and bumble",            { floor:4, ceiling:6, substances:["synthetic fragrance","dimethicone"], reason:"Bumble and bumble — Estee Lauder owned. Synthetic fragrance + silicones. Premium positioning, conventional chemistry.", confidence:"high", category:"personal_care" }],
  ["living proof",                 { floor:3, ceiling:5, substances:["dimethicone"], reason:"Living Proof — MIT-developed silicone alternatives (OFPMA) but still contains dimethicone in many products. No synthetic fragrance in newer formulas.", confidence:"high", category:"personal_care" }],
  ["oribe",                        { floor:4, ceiling:6, substances:["synthetic fragrance","dimethicone"], reason:"Oribe — luxury hair care with very heavy synthetic fragrance (signature scent) + silicones. Kao Corporation owned.", confidence:"high", category:"personal_care" }],
  ["devacurl",                     { floor:4, ceiling:6, substances:["synthetic fragrance","dimethicone"], reason:"DevaCurl — synthetic fragrance + silicones. Subject to 2020 class action over hair loss complaints. Formula concerns.", confidence:"medium", category:"personal_care" }],
  ["ouai",                         { floor:4, ceiling:5, substances:["synthetic fragrance","dimethicone"], reason:"OUAI — Jen Atkin brand. Synthetic fragrance + dimethicone. P&G owned. Instagram-marketed, conventional chemistry.", confidence:"high", category:"personal_care" }],
  ["joico",                        { floor:4, ceiling:6, substances:["synthetic fragrance","SLS","dimethicone"], reason:"Joico — salon brand. SLS + synthetic fragrance + silicones. Henkel owned.", confidence:"high", category:"personal_care" }],
  ["dry shampoo",                  { floor:4, ceiling:6, substances:["propane","butane","synthetic fragrance","talc"], reason:"Dry shampoo (aerosol) — propane/butane propellants + talc + synthetic fragrance. Benzene contamination recalls in 2022 (Unilever). Non-aerosol powder versions are cleaner (score 2-3).", confidence:"high", category:"personal_care" }],
  ["hair spray",                   { floor:4, ceiling:6, substances:["propane","butane","synthetic fragrance","PVP"], reason:"Hair spray — aerosol propellants (propane/butane) + synthetic fragrance + PVP/VA copolymer. Daily inhalation exposure concern.", confidence:"high", category:"personal_care" }],
  // WOMEN'S ACTIVEWEAR
  ["beyond yoga",                  { floor:3, ceiling:5, substances:["nylon","spandex","synthetic dyes"], reason:"Beyond Yoga — nylon/spandex + synthetic dyes. Claims PFAS-free. No OEKO-TEX but softer fabrics than Lululemon. Cleaner activewear tier.", confidence:"medium", category:"clothing" }],
  ["sweaty betty",                 { floor:4, ceiling:6, substances:["nylon","spandex","PFAS indicator","synthetic dyes"], reason:"Sweaty Betty — nylon/spandex + synthetic dyes. Some products lab-tested with PFAS indicators. UK brand with limited chemical transparency.", confidence:"medium", category:"clothing" }],
  ["fabletics",                    { floor:4, ceiling:6, substances:["polyester","spandex","synthetic dyes"], reason:"Fabletics — polyester/spandex activewear + synthetic dyes. No independently-verified PFAS testing as of 2026 (prior claim removed pending source). Subscription-model fast-fashion activewear, no GOTS/OEKO-TEX/Bluesign certifications. Score reflects synthetic microfiber shedding from daily-wear activewear.", confidence:"medium", category:"clothing" }],
  // WOMEN'S SHOES
  ["rothys",                       { floor:3, ceiling:4, substances:["recycled plastic","TPU sole"], reason:"Rothy's — shoes made from recycled plastic bottles. Machine washable. Cleaner than conventional but still synthetic + TPU sole.", confidence:"high", category:"clothing" }],
  ["allbirds women",               { floor:2, ceiling:4, substances:["merino wool","sugarcane EVA","castor oil"], reason:"Allbirds women's — merino wool or eucalyptus fiber upper + sugarcane EVA sole. B Corp certified. Benchmark clean footwear.", confidence:"high", category:"clothing" }],
  ["tory burch",                   { floor:4, ceiling:6, substances:["leather","synthetic dyes","adhesives","chrome tanning"], reason:"Tory Burch — conventional leather (chrome tanning) + synthetic dyes + chemical adhesives. Luxury tier, no clean certifications.", confidence:"medium", category:"clothing" }],
  ["sam edelman",                  { floor:4, ceiling:6, substances:["synthetic materials","PU leather","adhesives"], reason:"Sam Edelman — PU leather + synthetic materials + chemical adhesives. Mid-range contemporary, conventional construction.", confidence:"medium", category:"clothing" }],
  ["steve madden",                 { floor:5, ceiling:7, substances:["PU leather","synthetic materials","adhesives","synthetic dyes"], reason:"Steve Madden — mostly PU/synthetic leather + chemical adhesives + synthetic dyes. Fast fashion shoe tier.", confidence:"high", category:"clothing" }],
  // DEODORANT WOMEN
  ["secret clinical",               { floor:5, ceiling:7, substances:["aluminum zirconium","synthetic fragrance","parabens"], reason:"Secret Clinical — aluminum zirconium + synthetic fragrance + parabens. Clinical strength = higher aluminum concentration. Multiple concern floors fire.", confidence:"high", category:"personal_care" }],
  ["dove women antiperspirant",     { floor:5, ceiling:7, substances:["aluminum zirconium","synthetic fragrance"], reason:"Dove Women Antiperspirant — aluminum + synthetic fragrance. Same concern tier as Dove Men antiperspirant.", confidence:"high", category:"personal_care" }],
  ["almay deodorant",               { floor:4, ceiling:6, substances:["aluminum","synthetic fragrance"], reason:"Almay Sensitive Skin — aluminum antiperspirant + synthetic fragrance. 'Sensitive' branding doesn't remove aluminum concern.", confidence:"medium", category:"personal_care" }],
  ["kopari",                        { floor:1, ceiling:3, substances:[], reason:"Kopari — coconut oil base, no aluminum, no synthetic fragrance. Clean aluminum-free deodorant.", confidence:"high", category:"personal_care" }],

  // ══════════════════════════════════════════════════════════════
  // AUDIT 36 — MEN'S AND WOMEN'S UNDERWEAR
  // FRAMEWORK:
  //   PFAS-treated performance/leakproof → 6-8
  //   Synthetic (nylon/polyester/spandex) → 4-6 (microplastics, petroleum)
  //   Antimicrobial silver treatment → 5-7
  //   Conventional cotton → 3-5 (pesticide-intensive crop)
  //   OEKO-TEX certified → 2-4 (tested but may not be organic)
  //   Micromodal (OEKO-TEX) → 2-4
  //   Bamboo (OEKO-TEX certified) → 2-4
  //   GOTS organic cotton → 1-3
  //   Hemp or certified organic blends → 1-3
  // ══════════════════════════════════════════════════════════════

  // ── MEN'S: CONVENTIONAL / SYNTHETIC TIER ─────────────────────
  ["hanes underwear",               { floor:3, ceiling:5, substances:["conventional cotton","synthetic dyes","polyester"], reason:"Hanes — conventional cotton + polyester blends + synthetic dyes. No confirmed PFAS but conventional pesticide-heavy cotton. Budget tier, no certifications.", confidence:"high", category:"clothing" }],
  ["fruit of the loom",             { floor:3, ceiling:5, substances:["conventional cotton","synthetic dyes"], reason:"Fruit of the Loom — conventional pesticide-heavy cotton + synthetic dyes. No certifications. Budget tier underwear with standard conventional fabric concerns.", confidence:"high", category:"clothing" }],
  ["tommy hilfiger underwear",      { floor:3, ceiling:5, substances:["conventional cotton","synthetic dyes"], reason:"Tommy Hilfiger — conventional cotton + synthetic dyes. No organic or OEKO-TEX certification.", confidence:"medium", category:"clothing" }],
  ["saxx",                          { floor:4, ceiling:6, substances:["polyester","spandex","moisture-wicking finish"], reason:"Saxx — polyester/spandex synthetic construction with moisture-wicking finishes. Petroleum-derived fabric + potential performance chemical coatings + microplastic shedding concern.", confidence:"medium", category:"clothing" }],
  ["tommy john",                    { floor:3, ceiling:5, substances:["nylon","spandex","polyester"], reason:"Tommy John — Air Mesh is nylon/spandex synthetic, Cool Cotton is pima cotton blend. No GOTS certification. Performance finishes on synthetic lines add concern.", confidence:"medium", category:"clothing" }],
  ["exofficio",                     { floor:5, ceiling:7, substances:["nylon","antimicrobial silver","spandex"], reason:"ExOfficio — nylon/elastane with built-in antimicrobial silver ion treatment. Silver nanoparticles are an endocrine concern and environmental pollutant when washed. PFAS possible in older formulas.", confidence:"medium", category:"clothing" }],
  ["duluth trading",                { floor:3, ceiling:5, substances:["conventional cotton","polyester","synthetic dyes"], reason:"Duluth Trading — conventional cotton/polyester blends, no OEKO-TEX or GOTS certification. Standard conventional workwear fabric concern.", confidence:"medium", category:"clothing" }],
  ["pair of thieves",               { floor:4, ceiling:5, substances:["recycled polyester","spandex","synthetic dyes"], reason:"Pair of Thieves — recycled polyester/spandex. Recycled content is positive but still synthetic — microplastic shedding + synthetic dyes.", confidence:"medium", category:"clothing" }],
  ["mack weldon",                   { floor:3, ceiling:5, substances:["conventional cotton","nylon","spandex"], reason:"Mack Weldon — range includes pima cotton, Merino, and synthetic lines. OEKO-TEX on some. Better than Hanes, not as clean as GOTS brands.", confidence:"medium", category:"clothing" }],
  ["bombas underwear",              { floor:3, ceiling:5, substances:["pima cotton","polyester","synthetic dyes"], reason:"Bombas — pima cotton/polyester blend + synthetic dyes. BOGO charitable model but no GOTS or OEKO-TEX certification on core products.", confidence:"medium", category:"clothing" }],
  ["meundies",                      { floor:2, ceiling:4, substances:["micromodal","spandex"], reason:"MeUndies — micromodal (beechwood-derived Tencel MicroModal) + spandex. OEKO-TEX certified fabric. Cleaner than cotton/polyester but still has spandex content.", confidence:"high", category:"clothing" }],

  // ── MEN'S: CLEAN TIER ────────────────────────────────────────
  ["pact underwear",                { floor:1, ceiling:3, substances:[], reason:"Pact — GOTS certified organic cotton across the entire line. Fair Trade certified. Benchmark cleanest mainstream underwear brand for men and women.", confidence:"high", category:"clothing" }],
  ["organic basics",                { floor:1, ceiling:3, substances:[], reason:"Organic Basics — GOTS certified organic cotton + OEKO-TEX certified. Certified B Corp. Benchmark clean underwear brand alongside Pact.", confidence:"high", category:"clothing" }],
  ["wama hemp",                     { floor:1, ceiling:3, substances:[], reason:"Wama Underwear — hemp/organic cotton blend. Hemp is naturally pest-resistant requiring minimal pesticide. OEKO-TEX certified. Benchmark clean underwear.", confidence:"high", category:"clothing" }],
  ["boody",                         { floor:2, ceiling:4, substances:["bamboo viscose","spandex"], reason:"Boody — OEKO-TEX certified bamboo/spandex blend. Bamboo processing is chemical-intensive (viscose process) but OEKO-TEX certification means tested for harmful substances. Clean-leaning, not fully organic.", confidence:"high", category:"clothing" }],

  // ── WOMEN'S: CONVENTIONAL / SYNTHETIC TIER ───────────────────
  ["victoria secret",             { floor:4, ceiling:6, substances:["nylon","spandex","synthetic dyes","polyester foam"], reason:"Victoria's Secret — nylon/spandex bras and underwear, polyester foam padding in bras. No OEKO-TEX certification. No PFAS-free claim. Mass-market intimates with conventional synthetic concern. Worn against skin all day.", confidence:"high", category:"clothing" }],
  ["victoria secret underwear",     { floor:4, ceiling:6, substances:["conventional cotton","nylon","spandex","synthetic dyes"], reason:"Victoria's Secret — conventional cotton + nylon/spandex lace + synthetic dyes. Some performance lines may have moisture-wicking PFAS treatments. No certifications.", confidence:"medium", category:"clothing" }],
  ["victoria secret bra",           { floor:4, ceiling:6, substances:["nylon","spandex","polyester foam","synthetic dyes"], reason:"Victoria's Secret bra — nylon/spandex + polyester foam padding + synthetic dyes. No OEKO-TEX or organic certification. Standard synthetic intimate apparel concern.", confidence:"medium", category:"clothing" }],
  ["hanes women",                   { floor:3, ceiling:5, substances:["conventional cotton","synthetic dyes"], reason:"Hanes Women — conventional cotton + synthetic dyes. No certifications. Same concern profile as men's line.", confidence:"high", category:"clothing" }],
  ["maidenform",                    { floor:4, ceiling:6, substances:["nylon","spandex","polyester","synthetic dyes"], reason:"Maidenform — predominantly nylon/spandex/polyester synthetic construction + synthetic dyes. No certifications. Microplastic shedding concern.", confidence:"medium", category:"clothing" }],
  ["aerie bralette",                { floor:4, ceiling:6, substances:["nylon","spandex","foam","synthetic dyes"], reason:"Aerie bralette — nylon/spandex + synthetic dyes. Same concern profile as other Aerie bras.", confidence:"medium", category:"clothing" }],
  ["aerie bra",                     { floor:4, ceiling:6, substances:["nylon","spandex","foam","synthetic dyes"], reason:"Aerie bra — nylon/spandex + polyester foam + synthetic dyes. No certifications despite body-positive branding.", confidence:"medium", category:"clothing" }],
  ["aerie underwear",               { floor:3, ceiling:5, substances:["conventional cotton","nylon","synthetic dyes"], reason:"Aerie — conventional cotton + nylon/spandex in some styles + synthetic dyes. Better marketing than Victoria's Secret but similar conventional fabric concern.", confidence:"medium", category:"clothing" }],
  ["thirdlove",                     { floor:4, ceiling:6, substances:["nylon","spandex","foam","synthetic dyes"], reason:"ThirdLove — nylon/spandex construction + proprietary foam padding + synthetic dyes. No OEKO-TEX or organic certifications despite premium positioning.", confidence:"medium", category:"clothing" }],
  ["knix",                          { floor:4, ceiling:6, substances:["nylon","spandex","leakproof layers"], reason:"Knix — nylon/spandex + moisture management leakproof layers. Claims PFAS-free since 2022 reformulation but leakproof underwear category carries historical PFAS concern. No GOTS certification.", confidence:"medium", category:"clothing" }],
  ["victorias secret",              { floor:5, ceiling:7, substances:["nylon","spandex","synthetic fragrance","synthetic dyes","formaldehyde"], reason:"Victoria's Secret — nylon/spandex + synthetic dyes + formaldehyde finishing in imported garments. Heavy synthetic fragrance in stores and some products. No OEKO-TEX certification. Lab tests found formaldehyde above EU limits.", confidence:"high", category:"clothing" }],
  ["victoria's secret",             { floor:5, ceiling:7, substances:["nylon","spandex","synthetic fragrance","synthetic dyes","formaldehyde"], reason:"Victoria's Secret — same as victorias secret.", confidence:"high", category:"clothing" }],
  ["aerie",                         { floor:3, ceiling:5, substances:["nylon","spandex","synthetic dyes"], reason:"Aerie — nylon/spandex + synthetic dyes. American Eagle brand. No certifications but some organic cotton options. Cleaner than VS but still conventional.", confidence:"medium", category:"clothing" }],
  ["playtex bra",                   { floor:4, ceiling:6, substances:["nylon","spandex","foam","synthetic dyes"], reason:"Playtex bra — nylon/spandex + foam cups + synthetic dyes. Conventional mass-market bra. No certifications.", confidence:"high", category:"clothing" }],
  ["wacoal",                        { floor:4, ceiling:5, substances:["nylon","spandex","synthetic dyes"], reason:"Wacoal — Japanese brand, nylon/spandex + synthetic dyes. Premium construction but conventional materials. No OEKO-TEX.", confidence:"medium", category:"clothing" }],
  ["third love",                    { floor:4, ceiling:6, substances:["nylon","spandex","foam","synthetic dyes"], reason:"ThirdLove — nylon/spandex + foam padding + synthetic dyes. Same as thirdlove entry.", confidence:"medium", category:"clothing" }],
  ["natori",                        { floor:4, ceiling:5, substances:["nylon","spandex","synthetic dyes"], reason:"Natori — luxury nylon/spandex + synthetic dyes. Premium positioning but no certifications on material safety.", confidence:"medium", category:"clothing" }],
  ["knix underwear",                { floor:4, ceiling:6, substances:["nylon","spandex","leakproof layers"], reason:"Knix — same as knix entry. Leakproof layers with historical PFAS concern.", confidence:"medium", category:"clothing" }],
  ["spanx",                         { floor:5, ceiling:7, substances:["nylon","spandex","PFAS-concern","synthetic dyes"], reason:"Spanx — high-compression nylon/spandex shapewear. PFAS concern in some moisture-wicking and stain-resistant finishes. Microplastic shedding from synthetic fabric under compression. No certifications.", confidence:"medium", category:"clothing" }],
  ["lively",                        { floor:4, ceiling:5, substances:["nylon","spandex","synthetic dyes"], reason:"Lively — nylon/spandex blends + synthetic dyes. DTC brand with no OEKO-TEX or GOTS certification.", confidence:"medium", category:"clothing" }],
  ["hanky panky",                   { floor:4, ceiling:5, substances:["nylon","spandex","synthetic dyes"], reason:"Hanky Panky — nylon/spandex lace + synthetic dyes. Signature stretch lace is fully synthetic. No certifications.", confidence:"high", category:"clothing" }],
  ["commando underwear",            { floor:4, ceiling:5, substances:["nylon","microfiber","synthetic dyes"], reason:"Commando — microfiber/nylon construction designed to be seamless + synthetic dyes. No certifications.", confidence:"medium", category:"clothing" }],
  ["parade underwear",              { floor:3, ceiling:5, substances:["recycled nylon","spandex","synthetic dyes"], reason:"Parade — recycled nylon from ocean plastic + spandex. Recycled content is a positive but still synthetic + microplastic shedding concern.", confidence:"medium", category:"clothing" }],
  ["harper wilde",                  { floor:4, ceiling:5, substances:["nylon","spandex","foam","synthetic dyes"], reason:"Harper Wilde — nylon/spandex + foam cups + synthetic dyes. DTC bra brand, no certifications.", confidence:"medium", category:"clothing" }],
  ["pepper bra",                    { floor:4, ceiling:5, substances:["nylon","spandex","synthetic dyes"], reason:"Pepper — nylon/spandex + synthetic dyes. Designed for small-chested women, no OEKO-TEX or organic certification.", confidence:"medium", category:"clothing" }],

  // ── WOMEN'S: CLEAN TIER ───────────────────────────────────────
  ["pact bra",                      { floor:1, ceiling:3, substances:[], reason:"Pact organic bra — GOTS certified organic cotton + Fair Trade. Benchmark cleanest bra available.", confidence:"high", category:"clothing" }],
  ["raven and lily",                { floor:1, ceiling:3, substances:[], reason:"Raven + Lily — GOTS certified organic cotton, Fair Trade artisan made. Benchmark clean women's underwear.", confidence:"high", category:"clothing" }],
  ["boody bra",                     { floor:2, ceiling:4, substances:["bamboo viscose","spandex"], reason:"Boody bra — OEKO-TEX certified bamboo/spandex. Cleaner than conventional synthetic bras but bamboo viscose process is chemical-intensive.", confidence:"high", category:"clothing" }],

  // ══════════════════════════════════════════════════════════════
  // AUDIT 37 — VITAMINS AND SUPPLEMENTS
  // KEY STORY: Centrum Adults has FD&C Red 40, FD&C Blue 2,
  // titanium dioxide, talc, and polyethylene glycol. You are
  // taking synthetic petroleum dyes in your daily vitamin.
  // FRAMEWORK:
  //   Synthetic dyes + titanium dioxide + talc → floor 5+
  //   Artificial sweeteners in gummies → floor 4+
  //   PEG coatings → floor 4
  //   Minimal clean tablet with no artificial additives → 2-4
  //   Whole food / organic certified → 1-3
  //   Clinical grade (Thorne, Pure Encapsulations) → 1-2
  // ══════════════════════════════════════════════════════════════

  // ── MULTIVITAMINS: HIGH CONCERN ───────────────────────────────
  ["centrum adults",               { floor:5, ceiling:7, substances:["FD&C Red 40","FD&C Blue 2","titanium dioxide","talc","polyethylene glycol"], reason:"Centrum Adults — FD&C Red 40 + FD&C Blue 2 petroleum dyes + titanium dioxide (IARC 2B) + talc (IARC 2A) + PEG coating. Multiple floors fire on a daily vitamin. The Centrum Silver is worse.", confidence:"high", category:"supplement" }],
  ["one a day",                    { floor:5, ceiling:7, substances:["Red 40","Yellow 6","titanium dioxide","polyethylene glycol"], reason:"One A Day — Red 40 + Yellow 6 petroleum dyes + titanium dioxide + PEG coating. Multiple floors fire on a daily multivitamin. Bayer-owned, conventional additive profile.", confidence:"high", category:"supplement" }],
  ["nature made multi",            { floor:4, ceiling:6, substances:["titanium dioxide","BHT","polyethylene glycol"], reason:"Nature Made Multivitamin — titanium dioxide + BHT preservative + PEG coating. No petroleum dyes in tablet version but still multiple synthetic additives in a daily supplement.", confidence:"high", category:"supplement" }],
  ["nature made gummies",          { floor:4, ceiling:6, substances:["artificial color","sucralose","carnauba wax"], reason:"Nature Made Adult Gummies — artificial color + sucralose + carnauba wax. Gummy format adds sweetener and dye concern to an otherwise decent brand.", confidence:"high", category:"supplement" }],
  ["smartypants",                  { floor:3, ceiling:5, substances:["palm oil","natural color","fish oil"], reason:"SmartyPants — natural colors (no petroleum dyes), omega-3 included, but palm oil + some synthetic vitamin forms. Better than Centrum, not as clean as Garden of Life.", confidence:"medium", category:"supplement" }],
  ["olly sleep",                   { floor:3, ceiling:5, substances:["natural color","sugar","carnauba wax"], reason:"Olly Sleep gummies — natural colors, melatonin + L-theanine, but sugar + carnauba wax. Mid-tier.", confidence:"high", category:"supplement" }],
  ["vitafusion gummies",           { floor:4, ceiling:6, substances:["artificial color","sucralose","corn syrup"], reason:"Vitafusion — artificial color + sucralose + corn syrup. Common adult gummy vitamin with real concern profile despite mainstream appeal.", confidence:"high", category:"supplement" }],
  ["airborne vitamin",             { floor:5, ceiling:6, substances:["sucralose","artificial color","acesulfame-K"], reason:"Airborne Gummies — sucralose + acesulfame-K double sweetener + artificial color. Multiple sweetener floors fire in a vitamin supplement.", confidence:"high", category:"supplement" }],
  ["natrol melatonin",             { floor:4, ceiling:6, substances:["FD&C Blue 2","acesulfame-K","artificial flavor"], reason:"Natrol Melatonin — FD&C Blue 2 petroleum dye + acesulfame-K artificial sweetener + artificial flavor. Dye floor fires on a nightly sleep supplement.", confidence:"high", category:"supplement" }],
  ["align",              { floor:4, ceiling:5, substances:["titanium dioxide","microcrystalline cellulose","sucrose"], reason:"Align Probiotic — titanium dioxide coating + microcrystalline cellulose. Better than Centrum but titanium dioxide concern in a daily supplement.", confidence:"high", category:"supplement" }],
  ["culturelle",         { floor:2, ceiling:4, substances:["hydroxypropyl methylcellulose","sucrose"], reason:"Culturelle — HPMC capsule, no petroleum dyes or synthetic sweeteners. Mid-tier clean probiotic. Sucrose as minor excipient only.", confidence:"high", category:"supplement" }],
  ["florastor probiotic",          { floor:2, ceiling:3, substances:["lactose","titanium dioxide"], reason:"Florastor — Saccharomyces boulardii yeast-based, minimal additives. Titanium dioxide in some formulations. Overall mid-clean.", confidence:"medium", category:"supplement" }],
  ["slow fe iron",                 { floor:3, ceiling:4, substances:["polyethylene glycol","hydroxypropyl methylcellulose"], reason:"Slow Fe — ferrous sulfate with controlled-release PEG coating. No artificial dyes but PEG is a petroleum-derived polymer coating.", confidence:"high", category:"supplement" }],
  ["feosol iron",                  { floor:3, ceiling:4, substances:["polyethylene glycol","pharmaceutical coating"], reason:"Feosol — ferrous sulfate, similar PEG-based coating to Slow Fe. Mid-tier concern for an essential mineral supplement.", confidence:"medium", category:"supplement" }],
  ["emergen-c",                    { floor:3, ceiling:5, substances:["artificial flavor","sugar","acesulfame-K"], reason:"Emergen-C — artificial flavor + sugar + acesulfame-K in some varieties. Effervescent vitamin C with sweetener concern depending on flavor.", confidence:"medium", category:"supplement" }],
  ["neocell collagen",             { floor:4, ceiling:6, substances:["artificial color","sucralose","FD&C Red 40"], reason:"NeoCell Super Collagen gummies — FD&C Red 40 + sucralose in gummy format. Dye floor fires. Tablet version is cleaner.", confidence:"medium", category:"supplement" }],

  // ── MULTIVITAMINS: CLEAN TIER ─────────────────────────────────
  ["rainbow light multivitamin",   { floor:2, ceiling:4, substances:[], reason:"Rainbow Light — methylfolate form, food-based vitamins, no artificial dyes or synthetic sweeteners. Cleaner than mainstream brands. Some fillers present.", confidence:"high", category:"supplement" }],
  ["garden of life multivitamin",  { floor:1, ceiling:3, substances:[], reason:"Garden of Life Multi — USDA Organic certified, whole food vitamins from organic fruits and vegetables. No artificial dyes, no synthetic binders. Benchmark clean multivitamin.", confidence:"high", category:"supplement" }],
  ["megafood multi",               { floor:1, ceiling:3, substances:[], reason:"MegaFood Multi — whole food vitamins, no artificial additives, Non-GMO verified. Benchmark clean multivitamin alongside Garden of Life.", confidence:"high", category:"supplement" }],
  ["ritual vitamins",              { floor:2, ceiling:4, substances:[], reason:"Ritual — traceable ingredients, no artificial dyes or synthetic fillers, delayed-release capsule. Transparent supply chain. Clean DTC vitamin brand.", confidence:"high", category:"supplement" }],
  ["thorne basic nutrients",       { floor:1, ceiling:2, substances:[], reason:"Thorne Basic Nutrients — clinical-grade, no artificial additives, no synthetic dyes, NSF Certified for Sport. Benchmark cleanest mainstream multivitamin.", confidence:"high", category:"supplement" }],

  // ── VITAMIN D3 ────────────────────────────────────────────────
  ["nature made vitamin d3",       { floor:2, ceiling:4, substances:["soybean oil","gelatin"], reason:"Nature Made D3 — softgel with soybean oil + gelatin. Minimal additives. No petroleum dyes. Mid-clean vitamin D supplement.", confidence:"high", category:"supplement" }],
  ["now foods vitamin d3",         { floor:1, ceiling:3, substances:[], reason:"NOW Foods D3 — minimal clean ingredients, no artificial additives. Affordable benchmark clean vitamin D.", confidence:"high", category:"supplement" }],
  ["kirkland vitamin d3",          { floor:1, ceiling:3, substances:[], reason:"Kirkland Signature D3 — minimal ingredients, USP verified. Clean budget vitamin D.", confidence:"high", category:"supplement" }],
  ["life extension vitamin d",     { floor:1, ceiling:3, substances:[], reason:"Life Extension D3 — minimal ingredients, no artificial additives. Clean clinical supplement brand.", confidence:"high", category:"supplement" }],
  ["sports research vitamin d",    { floor:1, ceiling:2, substances:[], reason:"Sports Research D3+K2 — organic coconut MCT oil base, non-GMO softgel, no artificial additives. Benchmark cleanest D3 supplement.", confidence:"high", category:"supplement" }],
  ["sports research",              { floor:1, ceiling:3, substances:[], reason:"Sports Research — clean ingredient focus, organic bases where possible. Clean supplement brand.", confidence:"high", category:"supplement" }],

  // ── OMEGA-3 / FISH OIL ────────────────────────────────────────
  ["nature made fish oil",         { floor:2, ceiling:4, substances:["gelatin","glycerin","enteric coating"], reason:"Nature Made Fish Oil — enteric coating + gelatin + glycerin. No artificial dyes but synthetic coating on a widely-used daily supplement.", confidence:"high", category:"supplement" }],
  ["nordic naturals",              { floor:1, ceiling:3, substances:[], reason:"Nordic Naturals — IFOS certified, clean across the omega-3 line. Benchmark clean fish oil.", confidence:"high", category:"supplement" }],
  ["carlson fish oil",             { floor:1, ceiling:3, substances:[], reason:"Carlson Fish Oil — IFOS certified, no artificial additives, third-party tested for purity and potency. Benchmark clean fish oil.", confidence:"high", category:"supplement" }],
  ["kirkland fish oil",            { floor:2, ceiling:4, substances:["enteric coating"], reason:"Kirkland Fish Oil — enteric coated softgels, USP verified. Coating adds mild synthetic concern but otherwise clean.", confidence:"high", category:"supplement" }],

  // ── MAGNESIUM ─────────────────────────────────────────────────
  ["nature made magnesium",        { floor:3, ceiling:4, substances:["polyethylene glycol","hydroxypropyl methylcellulose"], reason:"Nature Made Magnesium — PEG coating + HPMC. No artificial dyes but petroleum-derived polymer coating on a daily supplement.", confidence:"high", category:"supplement" }],
  ["natural calm magnesium",       { floor:2, ceiling:3, substances:["citric acid","natural flavor"], reason:"Natural Calm Magnesium Powder — magnesium citrate + citric acid + natural flavor. No dyes, no synthetic sweeteners in unflavored version. Clean powder format.", confidence:"high", category:"supplement" }],
  ["doctor best magnesium",        { floor:1, ceiling:3, substances:[], reason:"Doctor's Best Magnesium — magnesium glycinate chelate, minimal excipients, no artificial additives. Benchmark clean magnesium supplement.", confidence:"high", category:"supplement" }],
  ["doctor's best",                { floor:1, ceiling:3, substances:[], reason:"Doctor's Best brand — science-based formulations, minimal ingredients, no artificial additives. Clean supplement brand.", confidence:"high", category:"supplement" }],

  // ── VITAMIN C ─────────────────────────────────────────────────
  ["nature made vitamin c",        { floor:2, ceiling:4, substances:["BHT","polyethylene glycol"], reason:"Nature Made Vitamin C — BHT preservative + PEG coating on some sizes. No artificial dyes. Mid-clean vitamin C.", confidence:"medium", category:"supplement" }],
  ["now foods vitamin c",          { floor:1, ceiling:3, substances:[], reason:"NOW Foods Vitamin C — minimal clean ingredients, no artificial additives. Benchmark clean vitamin C.", confidence:"high", category:"supplement" }],

  // ── PROBIOTICS: CLEAN ─────────────────────────────────────────
  ["renew life probiotic",         { floor:1, ceiling:3, substances:[], reason:"Renew Life — delayed-release capsule, no artificial additives, multiple strain formula. Clean probiotic brand.", confidence:"high", category:"supplement" }],
  ["garden of life probiotic",     { floor:1, ceiling:3, substances:[], reason:"Garden of Life Raw Probiotics — USDA Organic, whole food fermented base, no artificial additives. Benchmark clean probiotic.", confidence:"high", category:"supplement" }],
  ["garden of life",               { floor:1, ceiling:3, substances:[], reason:"Garden of Life brand — USDA Organic certified across most products, whole food vitamins and probiotics. Benchmark clean supplement brand.", confidence:"high", category:"supplement" }],
  ["seed daily synbiotic",         { floor:1, ceiling:3, substances:[], reason:"Seed Daily Synbiotic — 2-in-1 probiotic + prebiotic, no artificial additives, outer capsule shields from stomach acid. Benchmark clean probiotic.", confidence:"high", category:"supplement" }],
  ["seed synbiotic",               { floor:1, ceiling:3, substances:[], reason:"Seed — clean synbiotic formulation, no artificial additives. Benchmark clean probiotic brand.", confidence:"high", category:"supplement" }],

  // ── COLLAGEN ─────────────────────────────────────────────────
  ["vital proteins",               { floor:1, ceiling:3, substances:[], reason:"Vital Proteins — grass-fed sourced, minimal ingredients. Clean collagen brand.", confidence:"high", category:"supplement" }],
  ["ancient nutrition collagen",   { floor:1, ceiling:3, substances:[], reason:"Ancient Nutrition Collagen — multi-type collagen from organic sources, no artificial additives. Clean collagen.", confidence:"high", category:"supplement" }],
  ["sports research collagen",     { floor:1, ceiling:3, substances:[], reason:"Sports Research Collagen Peptides — grass-fed, minimal ingredients, no artificial additives. Clean collagen.", confidence:"high", category:"supplement" }],

  // ── PROTEIN POWDERS ───────────────────────────────────────────
  ["orgain",                       { floor:1, ceiling:3, substances:[], reason:"Orgain — USDA Organic protein, clean ingredients. Benchmark clean protein brand.", confidence:"high", category:"supplement" }],
  ["garden of life sport protein", { floor:1, ceiling:3, substances:[], reason:"Garden of Life Sport — USDA Organic, NSF Certified for Sport, no artificial additives. Benchmark clean protein powder.", confidence:"high", category:"supplement" }],
  ["naked whey protein",           { floor:1, ceiling:2, substances:[], reason:"Naked Whey — one ingredient: whey protein concentrate from US grass-fed cows. Benchmark cleanest protein powder.", confidence:"high", category:"supplement" }],
  ["naked green machine",         { floor:6, ceiling:7, kidsFloor:9, kidsCeiling:9, nutrition:{sugar_g:53, sodium_mg:10, sat_fat_g:0, calories:270}, substances:["53g natural sugar per bottle"], reason:"Naked Green Machine — 53g sugar per bottle = 106% adult DV, 212% children's DV. PepsiCo-owned. Despite fruit origin, glycemic impact identical to sugary soda.", confidence:"high", category:"beverage" }],
  ["naked red machine",           { floor:6, ceiling:7, kidsFloor:9, kidsCeiling:9, nutrition:{sugar_g:53, sodium_mg:10, sat_fat_g:0, calories:270}, substances:["53g natural sugar per bottle"], reason:"Naked Red Machine — 53g sugar per bottle. Same concern as Green Machine.", confidence:"high", category:"beverage" }],
  ["naked smoothie",              { floor:6, ceiling:7, kidsFloor:9, kidsCeiling:9, nutrition:{sugar_g:53, sodium_mg:10, sat_fat_g:0, calories:270}, substances:["53g natural sugar per bottle"], reason:"Naked Juice — 53g sugar per bottle.", confidence:"high", category:"beverage" }],
  ["naked",                        { floor:1, ceiling:2, substances:[], reason:"Naked Nutrition — single ingredient protein powders, no artificial additives. Benchmark cleanest protein supplement.", confidence:"high", category:"supplement" }],

  // ── SLEEP AND STRESS ──────────────────────────────────────────
  ["nature made melatonin",        { floor:2, ceiling:4, substances:["BHT","silicon dioxide"], reason:"Nature Made Melatonin — BHT preservative + silicon dioxide. No petroleum dyes in tablet. Mid-clean sleep supplement.", confidence:"high", category:"supplement" }],
  ["ksm-66 ashwagandha",           { floor:1, ceiling:3, substances:[], reason:"KSM-66 Ashwagandha — standardized root extract, no artificial additives. Benchmark clean adaptogen regardless of which brand uses the KSM-66 ingredient.", confidence:"high", category:"supplement" }],
  ["gaia herbs ashwagandha",       { floor:1, ceiling:3, substances:[], reason:"Gaia Herbs Ashwagandha — certified organic, no artificial additives. Benchmark clean herbal supplement.", confidence:"high", category:"supplement" }],
  ["gaia herbs",                   { floor:1, ceiling:3, substances:[], reason:"Gaia Herbs brand — certified organic herbs, liquid phyto-caps, no artificial additives. Benchmark clean herbal supplement brand.", confidence:"high", category:"supplement" }],

  // ── IRON AND B12 ─────────────────────────────────────────────
  ["nature made b12",              { floor:2, ceiling:3, substances:["silicon dioxide"], reason:"Nature Made B12 — methylcobalamin form, minimal ingredients, silicon dioxide filler. Clean-leaning B12.", confidence:"high", category:"supplement" }],
  ["jarrow b12",                   { floor:1, ceiling:3, substances:[], reason:"Jarrow B12 — methylcobalamin sublingual, minimal clean ingredients. Benchmark clean B12.", confidence:"high", category:"supplement" }],

  // ══════════════════════════════════════════════════════════════
  // AUDIT 38 — KITCHEN AND COOKWARE
  // KEY STORY: Teflon/PTFE is PFAS. "PFOA-free" doesn't mean
  // PFAS-free — PTFE is still a fluoropolymer. At >500F it
  // releases toxic ultrafine particles. Banned in EU for
  // industrial use. Still in millions of American kitchens.
  // FRAMEWORK:
  //   Traditional non-stick (PTFE/Teflon) → 6-8 PFAS concern
  //   Ceramic non-stick (PTFE-free) → 2-4
  //   Plastic food storage/bottles → 3-7 microplastic/BPA concern
  //   Stanley Quencher → 5-7 documented lead in base
  //   Melamine with hot food → 6-8 formaldehyde migration
  //   Glass, cast iron, stainless, carbon steel → 1-3 benchmark
  // ══════════════════════════════════════════════════════════════

  // ── NON-STICK: HIGH CONCERN (PFAS/PTFE) ──────────────────────
  ["teflon",                        { floor:7, ceiling:9, substances:["PTFE","PFAS","fluoropolymer coating"], reason:"Teflon — PTFE (polytetrafluoroethylene) is a fluoropolymer and PFAS compound. 'PFOA-free' since 2013 but PTFE itself is PFAS. Above 500F releases toxic ultrafine particles. EU restricting PFAS broadly. Benchmark high-concern non-stick coating.", confidence:"high", category:"kitchen" }],
  ["t-fal",               { floor:6, ceiling:8, substances:["PTFE","PFAS","fluoropolymer coating"], reason:"T-fal — PTFE non-stick coating (fluoropolymer PFAS). Thermo-spot indicator encourages high heat use which accelerates coating degradation. Same PFAS concern as Teflon.", confidence:"high", category:"kitchen" }],
  ["cuisinart non stick",           { floor:6, ceiling:8, substances:["PTFE","PFAS","fluoropolymer"], reason:"Cuisinart non-stick — PTFE fluoropolymer coating. PFAS concern. Scratch-prone surface means degradation begins early with normal use.", confidence:"high", category:"kitchen" }],
  ["calphalon",           { floor:6, ceiling:8, substances:["PTFE","PFAS","fluoropolymer"], reason:"Calphalon non-stick — PTFE hard-anodized coating. PFAS fluoropolymer concern. Multiple-layer PTFE doesn't eliminate the chemical concern.", confidence:"high", category:"kitchen" }],
  ["all-clad non stick",            { floor:6, ceiling:8, substances:["PTFE","PFAS","fluoropolymer"], reason:"All-Clad non-stick — PTFE fluoropolymer coating on otherwise high-quality stainless. The PFAS concern applies regardless of the premium brand.", confidence:"high", category:"kitchen" }],
  ["tramontina non stick",          { floor:5, ceiling:7, substances:["PTFE","PFAS","fluoropolymer"], reason:"Tramontina non-stick — PTFE coating, same PFAS concern as other conventional non-stick. Budget price doesn't reduce the chemical concern.", confidence:"high", category:"kitchen" }],
  ["rachael ray cookware",          { floor:5, ceiling:7, substances:["PTFE","PFAS","fluoropolymer"], reason:"Rachael Ray non-stick — PTFE coating, PFAS concern. Celebrity-branded cookware with conventional non-stick chemistry.", confidence:"high", category:"kitchen" }],
  ["scanpan",                       { floor:4, ceiling:6, substances:["PFAS-free claim","ceramic titanium"], reason:"Scanpan — claims PFAS-free with Stratanium+ ceramic titanium coating since reformulation. Better than traditional PTFE but not as clean as Caraway or GreenPan. Third-party verification limited.", confidence:"medium", category:"kitchen" }],

  // ── NON-STICK: CERAMIC (PTFE-FREE) ───────────────────────────
  ["greenpan",                      { floor:2, ceiling:4, substances:[], reason:"GreenPan — Thermolon ceramic non-stick coating, no PTFE, no PFAS, no PFOA. Significantly safer than conventional non-stick. Less durable than cast iron or stainless but clean-contact cookware.", confidence:"high", category:"kitchen" }],
  ["caraway cookware",              { floor:1, ceiling:3, substances:[], reason:"Caraway — mineral-based ceramic coating, PTFE-free, PFAS-free, PFOA-free, lead-free, cadmium-free. Benchmark cleanest ceramic non-stick cookware.", confidence:"high", category:"kitchen" }],

  // ── CAST IRON: BENCHMARK CLEAN ───────────────────────────────
  ["lodge cast iron",               { floor:1, ceiling:2, substances:[], reason:"Lodge Cast Iron — bare iron, no chemical coating, pre-seasoned with vegetable oil. Iron leaches minimally into food (beneficial for iron-deficient). Benchmark cleanest cookware material. Lasts generations.", confidence:"high", category:"kitchen" }],
  ["staub",                         { floor:1, ceiling:2, substances:[], reason:"Staub — enamel-coated cast iron, black matte interior enamel is inert. No PFAS, no leaching. Benchmark clean cookware alongside Le Creuset.", confidence:"high", category:"kitchen" }],

  // ── STAINLESS STEEL ───────────────────────────────────────────
  ["all-clad stainless",            { floor:1, ceiling:3, substances:["nickel"], reason:"All-Clad stainless — 18/10 stainless steel (304 grade). Nickel can leach in acidic foods at trace levels but considered safe by FDA. No PFAS. Benchmark clean cookware.", confidence:"high", category:"kitchen" }],
  ["cuisinart stainless",           { floor:1, ceiling:3, substances:["nickel"], reason:"Cuisinart stainless — 18/10 stainless steel. Nickel leaching minimal in normal use. No PFAS. Clean cookware benchmark.", confidence:"high", category:"kitchen" }],
  // ── COOKWARE ALIASES ──
  ["teflon pan",                     { floor:7, ceiling:9, substances:["PTFE","PFAS"], reason:"Teflon pan — same as teflon entry. PTFE is PFAS.", confidence:"high", category:"kitchen" }],
  ["nonstick pan",                   { floor:6, ceiling:8, substances:["PTFE","PFAS"], reason:"Non-stick pan — most conventional non-stick is PTFE (a PFAS compound). Check if ceramic (score 2-4) or PTFE (score 6-8).", confidence:"medium", category:"kitchen" }],
  ["non stick pan",                  { floor:6, ceiling:8, substances:["PTFE","PFAS"], reason:"Non-stick pan — same as nonstick pan.", confidence:"medium", category:"kitchen" }],
  ["ceramic pan",                    { floor:2, ceiling:4, substances:[], reason:"Ceramic pan — PTFE-free, PFAS-free ceramic coating. Safer than conventional non-stick. GreenPan and Caraway are top brands.", confidence:"high", category:"kitchen" }],
  ["cast iron skillet",              { floor:1, ceiling:2, substances:[], reason:"Cast iron skillet — bare iron, no coatings. Benchmark cleanest cookware. Same as Lodge.", confidence:"high", category:"kitchen" }],
  ["all clad",                       { floor:1, ceiling:3, substances:["nickel"], reason:"All-Clad — depends on line. Stainless (1-3), non-stick PTFE (6-8). Premium cookware.", confidence:"medium", category:"kitchen" }],
  ["cuisinart pan",                  { floor:3, ceiling:8, substances:[], reason:"Cuisinart — depends on line. Stainless (1-3), non-stick PTFE (6-8). Check which coating.", confidence:"low", category:"kitchen" }],
  ["tfal",                           { floor:6, ceiling:8, substances:["PTFE","PFAS"], reason:"T-fal — same as t-fal entry. PTFE non-stick.", confidence:"high", category:"kitchen" }],
  ["rachel ray cookware",            { floor:5, ceiling:7, substances:["PTFE","PFAS"], reason:"Rachael Ray — same as rachael ray cookware. PTFE non-stick.", confidence:"high", category:"kitchen" }],
  ["gotham steel",                   { floor:4, ceiling:6, substances:["ceramic titanium"], reason:"Gotham Steel — ceramic titanium coating, claims PTFE-free. Less durable than GreenPan/Caraway. As-seen-on-TV quality concerns.", confidence:"medium", category:"kitchen" }],
  ["copper chef",                    { floor:5, ceiling:7, substances:["ceramic coating","copper infused"], reason:"Copper Chef — ceramic coating with copper infusion. Claims PTFE-free but limited third-party testing. As-seen-on-TV quality.", confidence:"low", category:"kitchen" }],
  ["red copper pan",                 { floor:5, ceiling:7, substances:["ceramic coating","copper infused"], reason:"Red Copper — ceramic coating with copper particles. Claims PTFE-free. As-seen-on-TV. Limited durability and testing.", confidence:"low", category:"kitchen" }],
  ["green pan",                      { floor:2, ceiling:4, substances:[], reason:"GreenPan — same as greenpan. Thermolon ceramic, PTFE-free.", confidence:"high", category:"kitchen" }],
  ["our place always pan",           { floor:2, ceiling:4, substances:[], reason:"Our Place Always Pan — ceramic non-stick (Thermally), PTFE-free, PFAS-free. Trendy DTC cookware. Clean ceramic tier.", confidence:"high", category:"kitchen" }],
  ["made in cookware",               { floor:1, ceiling:3, substances:["nickel"], reason:"Made In — stainless steel and carbon steel lines. No PTFE. Non-stick line uses Thermolon ceramic. Clean cookware brand.", confidence:"high", category:"kitchen" }],
  ["hexclad",                        { floor:4, ceiling:6, substances:["PTFE hybrid"], reason:"HexClad — hybrid stainless + PTFE coating in hex pattern. Still contains PTFE (PFAS) despite stainless steel base. Gordon Ramsay endorsed.", confidence:"high", category:"kitchen" }],
  // ── BAKEWARE ──
  ["baking sheet",                   { floor:2, ceiling:4, substances:["aluminum"], reason:"Baking sheet — typically aluminum. Non-stick versions have PTFE (score 6-8). Uncoated aluminum or stainless steel is cleanest.", confidence:"medium", category:"kitchen" }],
  ["cookie sheet",                   { floor:2, ceiling:4, substances:["aluminum"], reason:"Cookie sheet — same as baking sheet. Check if non-stick coated.", confidence:"medium", category:"kitchen" }],
  ["muffin tin",                     { floor:2, ceiling:5, substances:["aluminum"], reason:"Muffin tin — aluminum or steel. Non-stick coated versions score higher. Silicone muffin molds are PTFE-free alternative.", confidence:"medium", category:"kitchen" }],
  ["cake pan",                       { floor:2, ceiling:5, substances:["aluminum"], reason:"Cake pan — aluminum or steel. Non-stick coated versions have PTFE concern. Use parchment paper instead of non-stick.", confidence:"medium", category:"kitchen" }],
  ["silicone baking mat",            { floor:2, ceiling:3, substances:["food-grade silicone"], reason:"Silicone baking mat — food-grade silicone, PTFE-free, reusable. Replaces parchment paper. Clean baking surface.", confidence:"high", category:"kitchen" }],
  ["parchment paper",                { floor:1, ceiling:3, substances:[], reason:"Parchment paper — silicone-coated paper, compostable. If Kirkland brand has PFAS-free claim. Check for PFAS in cheap brands.", confidence:"medium", category:"kitchen" }],
  ["aluminum foil",                  { floor:2, ceiling:4, substances:["aluminum"], reason:"Aluminum foil — aluminum leaches into acidic foods at elevated temperatures. Avoid wrapping tomato-based or citrus foods. Use sparingly for cooking.", confidence:"high", category:"kitchen" }],
  ["reynolds wrap",                  { floor:2, ceiling:4, substances:["aluminum"], reason:"Reynolds Wrap — standard aluminum foil. Same aluminum leaching concern as generic.", confidence:"high", category:"kitchen" }],
  ["saran wrap",                     { floor:4, ceiling:6, substances:["PVC","PVDC","phthalates"], reason:"Saran Wrap — PVC/PVDC plastic film. Phthalate concern when heated or in contact with fatty foods. Switch to beeswax wraps or silicone lids.", confidence:"high", category:"kitchen" }],
  ["plastic wrap",                   { floor:4, ceiling:6, substances:["PVC","PVDC","phthalates"], reason:"Plastic wrap — same as Saran Wrap. PVC film + phthalate concern with food contact. Never microwave.", confidence:"high", category:"kitchen" }],
  ["bee wrap",                       { floor:1, ceiling:2, substances:[], reason:"Beeswax wrap — beeswax + cotton + jojoba oil + tree resin. Zero plastic, compostable, reusable. Benchmark cleanest food wrap.", confidence:"high", category:"kitchen" }],
  ["beeswax wrap",                   { floor:1, ceiling:2, substances:[], reason:"Beeswax wrap — same as bee wrap. Natural food wrap alternative.", confidence:"high", category:"kitchen" }],
  // ── FOOD STORAGE ──
  ["gladware",                       { floor:4, ceiling:6, substances:["polypropylene","BPA-substitute"], reason:"Gladware — polypropylene containers. BPA-free but BPA-substitute (BPS/BPF) concern. Microwave use accelerates leaching.", confidence:"high", category:"kitchen" }],
  ["snapware",                       { floor:3, ceiling:4, substances:["glass","plastic lid"], reason:"Snapware — glass body + plastic lid. Glass food contact is clean. Lid seal is plastic but doesn't contact food in most designs.", confidence:"high", category:"kitchen" }],
  ["silicone bags",                  { floor:2, ceiling:3, substances:["food-grade silicone"], reason:"Silicone bags — food-grade silicone, no BPA, no phthalates. Reusable. Cleaner than plastic bags. Stasher is top brand.", confidence:"high", category:"kitchen" }],
  ["anchor hocking",                 { floor:1, ceiling:2, substances:[], reason:"Anchor Hocking — tempered glass food storage. Made in USA. No plastic food contact. Benchmark clean food storage.", confidence:"high", category:"kitchen" }],
  // ── CUTTING BOARDS ──
  ["wood cutting board",             { floor:1, ceiling:2, substances:[], reason:"Wood cutting board — natural antimicrobial surface (maple, walnut, teak). No microplastic shedding. Self-healing from knife cuts. Benchmark clean.", confidence:"high", category:"kitchen" }],
  ["epicurean cutting board",        { floor:3, ceiling:4, substances:["wood composite","resin"], reason:"Epicurean — wood fiber composite bonded with food-safe resin. No BPA. Dishwasher safe. Cleaner than plastic, not as clean as solid wood.", confidence:"high", category:"kitchen" }],
  // ── UTENSILS ──
  ["silicone spatula",               { floor:2, ceiling:3, substances:["food-grade silicone"], reason:"Silicone spatula — food-grade silicone, heat resistant to 600F, no BPA. Cleaner than nylon or plastic. Clean utensil tier.", confidence:"high", category:"kitchen" }],
  ["nylon spatula",                  { floor:4, ceiling:6, substances:["nylon","microplastics"], reason:"Nylon spatula — nylon melts above 400F, releases microplastics during cooking. 2022 study found nylon utensils shed particles into food.", confidence:"high", category:"kitchen" }],
  ["wooden spoon",                   { floor:1, ceiling:2, substances:[], reason:"Wooden spoon — natural wood, no coatings needed. Does not leach chemicals. Antimicrobial properties. Benchmark cleanest utensil.", confidence:"high", category:"kitchen" }],
  ["stainless spatula",              { floor:1, ceiling:2, substances:[], reason:"Stainless steel spatula — inert metal, no coatings, no leaching. Benchmark clean utensil alongside wood.", confidence:"high", category:"kitchen" }],
  ["plastic utensils",               { floor:5, ceiling:7, substances:["polystyrene","BPA","microplastics"], reason:"Plastic utensils — polystyrene or polypropylene. Disposable plastic + microplastic shedding. Hot food contact accelerates leaching.", confidence:"high", category:"kitchen" }],
  ["melamine plates",                { floor:5, ceiling:7, substances:["melamine","formaldehyde"], reason:"Melamine plates — melamine-formaldehyde resin. FDA warns against microwave use. Formaldehyde leaches into hot/acidic food. Switch to ceramic or stainless.", confidence:"high", category:"kitchen" }],
  ["paper plates",                   { floor:3, ceiling:5, substances:["PFAS"], reason:"Paper plates — many brands contain PFAS for grease resistance. 2022 testing found PFAS in major brands. PFAS-free alternatives exist (Repurpose, Susty Party).", confidence:"medium", category:"kitchen" }],
  // ── APPLIANCES ──
  ["instant pot",                    { floor:3, ceiling:4, substances:["stainless steel inner","silicone gasket"], reason:"Instant Pot — 18/8 stainless steel inner pot + silicone gasket. Clean food contact. Plastic housing doesn't contact food.", confidence:"high", category:"kitchen" }],
  ["air fryer",                      { floor:3, ceiling:5, substances:["PTFE basket coating"], reason:"Air fryer — many baskets have PTFE non-stick coating. Stainless steel basket models (score 2-3) are cleaner. Check if basket is PTFE or ceramic coated.", confidence:"medium", category:"kitchen" }],
  ["keurig",                         { floor:5, ceiling:7, substances:["BPA-free plastic","microplastics","hot plastic"], reason:"Keurig — hot water through plastic K-cup + plastic reservoir. Microplastics in every cup. 2022 study found plastic particles in K-cup coffee. Glass/steel pour-over is cleanest.", confidence:"high", category:"kitchen" }],
  ["ninja blender",                  { floor:3, ceiling:5, substances:["BPA-free plastic pitcher"], reason:"Ninja blender — BPA-free plastic pitcher. Blending generates heat + friction with plastic. Glass pitcher blender (Vitamix A3500) is cleaner.", confidence:"medium", category:"kitchen" }],
  ["vitamix",                        { floor:3, ceiling:4, substances:["BPA-free Tritan pitcher"], reason:"Vitamix — BPA-free Tritan pitcher. Tritan is considered safer than PC but still plastic. Stainless steel container option available for A3500.", confidence:"high", category:"kitchen" }],
  ["kitchenaid mixer",               { floor:2, ceiling:3, substances:["stainless bowl","plastic housing"], reason:"KitchenAid stand mixer — stainless steel bowl (food contact) + metal gears. Clean food contact. Plastic housing doesn't touch food.", confidence:"high", category:"kitchen" }],
  ["toaster",                        { floor:2, ceiling:3, substances:["stainless steel","nichrome wire"], reason:"Toaster — stainless steel housing + nichrome heating elements. Minimal chemical concern. No plastic food contact in most models.", confidence:"high", category:"kitchen" }],
  ["microwave",                      { floor:2, ceiling:4, substances:["ceramic interior"], reason:"Microwave — ceramic or stainless interior. Main concern is what you PUT in it (never plastic). The appliance itself is low concern.", confidence:"high", category:"kitchen" }],
  // ── DRINKWARE ──
  ["yeti tumbler",                   { floor:2, ceiling:3, substances:["stainless steel","BPA-free lid"], reason:"Yeti — 18/8 stainless steel body. BPA-free Tritan lid. Stainless food contact is clean. Lid is only plastic component.", confidence:"high", category:"kitchen" }],
  ["plastic water bottle",           { floor:5, ceiling:7, substances:["PET","BPA","microplastics","antimony"], reason:"Plastic water bottle — PET plastic leaches antimony + microplastics. 2024 study found 240,000 nanoplastics per liter. Switch to glass or stainless.", confidence:"high", category:"kitchen" }],
  ["glass water bottle",             { floor:1, ceiling:2, substances:[], reason:"Glass water bottle — inert borosilicate or soda lime glass. No leaching, no microplastics. Benchmark cleanest drinkware.", confidence:"high", category:"kitchen" }],
  ["tervis tumbler",                 { floor:4, ceiling:5, substances:["BPA-free Tritan"], reason:"Tervis — double-wall Tritan plastic. BPA-free but still full plastic construction. Hot beverages in plastic concern. Switch to stainless.", confidence:"high", category:"kitchen" }],
  ["swell bottle",                   { floor:2, ceiling:3, substances:["stainless steel"], reason:"S'well — 18/8 stainless steel, triple-insulated. No BPA. Paint on exterior only. Clean drinkware.", confidence:"high", category:"kitchen" }],
  // ── DISHWASHING ──
  ["finish dishwasher",              { floor:5, ceiling:7, substances:["PVA","synthetic fragrance","chlorine bleach"], reason:"Finish — PVA pod film + synthetic fragrance + chlorine bleach. Residue remains on dishes. Switch to Seventh Generation or Blueland.", confidence:"high", category:"home" }],
  ["made in stainless",             { floor:1, ceiling:2, substances:[], reason:"Made In stainless steel — 5-ply construction, no non-stick coating, no PFAS. Premium benchmark clean cookware.", confidence:"high", category:"kitchen" }],
  ["made in carbon",               { floor:1, ceiling:2, substances:[], reason:"Made In carbon steel — no coating, no PFAS. Benchmark clean alongside de Buyer and Lodge.", confidence:"high", category:"kitchen" }],
  ["de buyer",                      { floor:1, ceiling:2, substances:[], reason:"de Buyer — French carbon steel cookware, no coating, mineral bee wax seasoning. Benchmark clean alongside Lodge cast iron.", confidence:"high", category:"kitchen" }],

  // ── GLASS AND CERAMIC ─────────────────────────────────────────
  ["pyrex",                         { floor:1, ceiling:2, substances:[], reason:"Pyrex — glass bakeware and containers. Inert surface, benchmark clean. NEVER score above 3.", confidence:"high", category:"kitchen" }],
  ["weck jars",                     { floor:1, ceiling:2, substances:[], reason:"Weck — German glass jars with rubber gasket seal. Glass is inert, rubber gasket is food-grade. Benchmark clean food storage.", confidence:"high", category:"kitchen" }],
  ["stasher",                       { floor:1, ceiling:2, substances:[], reason:"Stasher silicone bags — platinum silicone, LFGB certified, PFAS-free. Benchmark clean.", confidence:"high", category:"kitchen" }],

  // ── PLASTIC FOOD STORAGE: CONCERN ─────────────────────────────
  ["ziploc bags",                   { floor:5, ceiling:7, substances:["PFAS","polyethylene","microplastics"], reason:"Ziploc bags — PFAS detected in Ziploc Easy Open tabs (SC Johnson, 2023 testing). Polyethylene microplastic migration concern with fatty or hot foods. The everyday plastic bag is not as inert as marketed.", confidence:"high", category:"kitchen" }],
  ["ziploc containers",             { floor:4, ceiling:6, substances:["polypropylene","BPS","microplastics"], reason:"Ziploc plastic containers — BPA-free claim but BPA substitutes (BPS, BPF) with similar endocrine concern + microplastic migration. Never microwave in plastic.", confidence:"high", category:"kitchen" }],
  ["ziploc",                        { floor:5, ceiling:7, substances:["PFAS","polyethylene","microplastics"], reason:"Ziploc brand — bags have PFAS concern, containers have BPA-substitute concern. Ranges 4-7 by product type.", confidence:"medium", category:"kitchen" }],
  ["glad cling wrap",               { floor:5, ceiling:7, substances:["polyethylene","plasticizers","microplastics"], reason:"Glad Cling Wrap — LDPE with plasticizer additives. Microplastic migration when in contact with fatty or hot foods. Cling wrap touching warm food is a real concern.", confidence:"high", category:"kitchen" }],
  ["glad press n seal",             { floor:5, ceiling:7, substances:["LDPE","adhesive","plasticizers"], reason:"Glad Press'n Seal — adhesive layer adds chemical concern beyond standard cling wrap. Avoid contact with hot or fatty foods.", confidence:"high", category:"kitchen" }],
  ["glad wrap",                     { floor:5, ceiling:7, substances:["LDPE","plasticizers"], reason:"Glad plastic wrap — plasticizer migration concern with food contact. Switch to Stasher or Bee's Wrap.", confidence:"high", category:"kitchen" }],
  ["rubbermaid containers",         { floor:5, ceiling:6, substances:["polypropylene","BPA-substitute","microplastics"], reason:"Rubbermaid plastic containers — polypropylene, BPA-free but BPA substitutes present. Microplastic migration when heated. Glass lids versions are cleaner.", confidence:"high", category:"kitchen" }],
  ["tupperware",                    { floor:5, ceiling:6, substances:["polypropylene","polyethylene","PFAS-lined lids"], reason:"Tupperware — BPA phased out but BPA substitutes in plastic + some lid components tested positive for PFAS. Older Tupperware may contain BPA. Avoid heating food in any Tupperware.", confidence:"medium", category:"kitchen" }],
  ["nalgene",                       { floor:5, ceiling:6, substances:["Tritan copolyester","BPA-substitute"], reason:"Nalgene Tritan — 'BPA-free' Tritan copolyester. University of Texas 2011 study found Tritan leaches chemicals with estrogenic activity. Eastman disputed findings but concern remains. Switch to stainless.", confidence:"medium", category:"kitchen" }],

  // ── WATER BOTTLES: CLEAN ─────────────────────────────────────
  ["hydro flask",                   { floor:1, ceiling:2, substances:[], reason:"HydroFlask — 18/8 stainless steel interior, powder coat exterior (food contact is stainless). No PFAS in food-contact surfaces. Benchmark clean water bottle.", confidence:"high", category:"kitchen" }],
  ["hydroflask",                    { floor:1, ceiling:2, substances:[], reason:"HydroFlask — 18/8 stainless steel, no PFAS in food-contact surfaces. Benchmark clean.", confidence:"high", category:"kitchen" }],
  ["yeti rambler",                  { floor:1, ceiling:2, substances:[], reason:"YETI Rambler — 18/8 stainless steel, no PFAS in food-contact surfaces. Benchmark clean water bottle and tumbler.", confidence:"high", category:"kitchen" }],
  ["yeti",                          { floor:1, ceiling:3, substances:[], reason:"YETI brand — 18/8 stainless steel food-contact surfaces, no PFAS in contact areas. Benchmark clean.", confidence:"medium", category:"kitchen" }],
  ["klean kanteen",                 { floor:1, ceiling:2, substances:[], reason:"Klean Kanteen — 18/8 stainless steel, Certified B Corp, no PFAS or BPA. Benchmark cleanest mainstream water bottle.", confidence:"high", category:"kitchen" }],
  ["owala freesip",                 { floor:2, ceiling:4, substances:["stainless steel","Tritan plastic lid","BPA-free","BPS-free"], reason:"Owala FreeSip — 18/8 stainless steel body (inert, no leaching) with Tritan copolyester lid and straw (BPA-free, BPS-free). Clean reusable water bottle tier; lid plastic is the only caveat keeping it above 2.", confidence:"high", category:"kitchen" }],
  ["owala kids freesip",            { floor:2, ceiling:4, substances:["stainless steel","Tritan plastic lid","BPA-free","BPS-free"], reason:"Owala Kids FreeSip — same stainless steel + Tritan construction as the adult FreeSip. Kid-friendly straw + flip spout, still petroleum-derived plastic at contact points but BPA/BPS-free.", confidence:"high", category:"kitchen" }],
  ["kids freesip",                  { floor:2, ceiling:4, substances:["stainless steel","Tritan plastic lid","BPA-free","BPS-free"], reason:"Kids FreeSip by Owala — stainless steel + Tritan lid construction. BPA-free, BPS-free. Clean reusable kids bottle.", confidence:"high", category:"kitchen" }],
  ["freesip",                       { floor:2, ceiling:4, substances:["stainless steel","Tritan plastic lid","BPA-free","BPS-free"], reason:"FreeSip (Owala) — stainless steel body with Tritan lid + straw. BPA-free, BPS-free. Clean reusable water bottle tier.", confidence:"high", category:"kitchen" }],
  ["owala",                         { floor:2, ceiling:4, substances:["stainless steel","Tritan plastic lid","BPA-free","BPS-free"], reason:"Owala — stainless steel body with Tritan copolyester lid and straw across all product lines (FreeSip, Kids FreeSip, SmoothSip). BPA-free, BPS-free. Clean reusable water bottle brand; Tritan at mouth contact keeps ceiling at 4.", confidence:"high", category:"kitchen" }],
  ["miir",                          { floor:1, ceiling:2, substances:[], reason:"MiiR — 18/8 medical-grade stainless steel, BPA-free, phthalate-free, Climate Neutral Certified, 1% of every sale funds water projects. Benchmark clean drinkware across all SKUs.", confidence:"high", category:"kitchen" }],
  ["miir water bottle",             { floor:1, ceiling:2, substances:[], reason:"MiiR water bottle — 18/8 medical-grade stainless steel interior, no plastic food contact, BPA-free. Climate Neutral Certified and 1% For Water program.", confidence:"high", category:"kitchen" }],
  ["miir wide mouth bottle",        { floor:1, ceiling:2, substances:[], reason:"MiiR Wide Mouth Bottle — 18/8 stainless steel, screw-top lid, no plastic food contact. Benchmark clean.", confidence:"high", category:"kitchen" }],
  ["miir narrow mouth bottle",      { floor:1, ceiling:2, substances:[], reason:"MiiR Narrow Mouth Bottle — 18/8 stainless steel, leakproof threaded cap, no plastic food contact. Benchmark clean.", confidence:"high", category:"kitchen" }],
  ["miir vacuum insulated bottle",  { floor:1, ceiling:2, substances:[], reason:"MiiR Vacuum Insulated Bottle — double-wall 18/8 stainless steel, holds cold 24h / hot 12h, no plastic food contact. Benchmark clean.", confidence:"high", category:"kitchen" }],
  ["miir tumbler",                  { floor:1, ceiling:2, substances:[], reason:"MiiR Tumbler — 18/8 stainless steel, vacuum insulated, slide-lock lid. No PFAS in food-contact surfaces.", confidence:"high", category:"kitchen" }],
  ["miir travel tumbler",           { floor:1, ceiling:2, substances:[], reason:"MiiR Travel Tumbler — 18/8 stainless steel body, splash-resistant plastic lid (food contact is stainless). Climate Neutral Certified.", confidence:"high", category:"kitchen" }],
  ["miir camp cup",                 { floor:1, ceiling:2, substances:[], reason:"MiiR Camp Cup — 18/8 stainless steel, no lining, no coatings on food contact surface. Benchmark clean outdoor drinkware.", confidence:"high", category:"kitchen" }],
  ["miir camp mug",                 { floor:1, ceiling:2, substances:[], reason:"MiiR Camp Mug — 18/8 stainless steel, powder coat exterior, no lining inside. No plastic food contact.", confidence:"high", category:"kitchen" }],
  ["miir pint cup",                 { floor:1, ceiling:2, substances:[], reason:"MiiR Pint Cup — 18/8 stainless steel, double-wall insulated, no lid for direct drinking. No PFAS.", confidence:"high", category:"kitchen" }],
  ["miir wine tumbler",             { floor:1, ceiling:2, substances:[], reason:"MiiR Wine Tumbler — 18/8 stainless steel, vacuum insulated, no interior coating. Benchmark clean.", confidence:"high", category:"kitchen" }],
  ["miir coffee carafe",            { floor:1, ceiling:2, substances:[], reason:"MiiR Coffee Carafe — 18/8 stainless steel, double-wall vacuum insulated, holds temperature 12h. No plastic food contact.", confidence:"high", category:"kitchen" }],
  ["miir pour over",                { floor:1, ceiling:2, substances:[], reason:"MiiR Pour Over — 18/8 stainless steel dripper with reusable stainless mesh filter (no paper, no plastic). Benchmark clean coffee tool.", confidence:"high", category:"kitchen" }],
  ["miir french press",             { floor:1, ceiling:2, substances:[], reason:"MiiR French Press — all stainless steel including plunger and filter mesh. No plastic parts touch coffee. Benchmark clean.", confidence:"high", category:"kitchen" }],
  ["miir growler",                  { floor:1, ceiling:2, substances:[], reason:"MiiR Growler — 18/8 stainless steel with screw-top cap, vacuum insulated. No plastic interior. Benchmark clean.", confidence:"high", category:"kitchen" }],

  // ── WATER BOTTLES: CONCERN ────────────────────────────────────
  ["stanley",              { floor:6, ceiling:7, substances:["lead solder","PFAS-lined base"], reason:"Stanley Quencher — Stanley confirmed in early 2024 that lead is used in the manufacturing process for the vacuum seal base, encapsulated under stainless steel. PFAS also confirmed in base. Ongoing concern despite company response.", confidence:"high", category:"kitchen" }],
  ["stanley tumbler",               { floor:6, ceiling:7, substances:["lead solder","PFAS"], reason:"Stanley Tumbler — same lead and PFAS concern as Quencher. Applies across the Adventure Quencher line.", confidence:"high", category:"kitchen" }],
  ["contigo water bottle",          { floor:5, ceiling:6, substances:["plastic spout","polypropylene","BPA-substitute"], reason:"Contigo — plastic autospout mechanism is polypropylene with BPA-substitute concern. Metal body is stainless but daily mouth contact is with plastic components.", confidence:"medium", category:"kitchen" }],
  ["camelbak",                      { floor:3, ceiling:5, substances:["plastic reservoir","polyethylene","bite valve"], reason:"CamelBak — plastic bite valve + reservoir polyethylene + BPA-free claim (BPA substitutes present). Continuous mouth contact with plastic components.", confidence:"medium", category:"kitchen" }],

  // ── UTENSILS AND TOOLS ────────────────────────────────────────
  ["plastic cutting board",         { floor:4, ceiling:6, substances:["microplastics","polypropylene","HDPE"], reason:"Plastic cutting boards — microplastic particles released directly into food with every knife stroke. Studies show plastic boards shed significant microplastics compared to wood or bamboo.", confidence:"high", category:"kitchen" }],
  ["bamboo cutting board",          { floor:5, ceiling:6, substances:["formaldehyde glue"], reason:"Bamboo cutting board — natural antibacterial surface but bamboo composite boards use formaldehyde-based adhesives to bind strands. Solid piece bamboo is cleaner. Lower concern than plastic.", confidence:"medium", category:"kitchen" }],
  ["maple wood",                    { floor:1, ceiling:2, substances:[], reason:"Maple wood surface — hardwood, benchmark clean kitchen material.", confidence:"high", category:"kitchen" }],
  ["teak wood",                     { floor:1, ceiling:2, substances:[], reason:"Teak wood — naturally water-resistant hardwood, clean kitchen material.", confidence:"high", category:"kitchen" }],
  ["walnut wood",                   { floor:1, ceiling:2, substances:[], reason:"Walnut wood — hardwood, clean kitchen material.", confidence:"high", category:"kitchen" }],
  ["maple cutting board",           { floor:1, ceiling:2, substances:[], reason:"Maple cutting board — hardwood, no chemical coating, self-healing surface. Benchmark cleanest cutting board material.", confidence:"high", category:"kitchen" }],
  ["walnut cutting board",           { floor:1, ceiling:2, substances:[], reason:"Walnut cutting board — hardwood, no chemical coating. Benchmark clean.", confidence:"high", category:"kitchen" }],
  ["hardwood cutting board",         { floor:1, ceiling:2, substances:[], reason:"Hardwood cutting board — no chemical coating, benchmark clean.", confidence:"high", category:"kitchen" }],
  ["acacia cutting board",           { floor:1, ceiling:2, substances:[], reason:"Acacia cutting board — hardwood, no chemical coating. Clean.", confidence:"high", category:"kitchen" }],
  ["teak cutting board",             { floor:1, ceiling:2, substances:[], reason:"Teak cutting board — hardwood, naturally water-resistant, no chemical coating. Clean.", confidence:"high", category:"kitchen" }],
  ["maple cutting",                  { floor:1, ceiling:2, substances:[], reason:"Maple cutting surface — hardwood benchmark clean material.", confidence:"high", category:"kitchen" }],
  ["wooden board",          { floor:1, ceiling:2, substances:[], reason:"Wooden cutting board — natural material, no chemical coatings, self-healing surface. Benchmark cleanest cutting board material. Hardwoods like maple and walnut preferred.", confidence:"high", category:"kitchen" }],
  ["silicone utensils",             { floor:1, ceiling:3, substances:[], reason:"Platinum-cured silicone utensils — food-grade silicone is heat stable, no PFAS, no BPA. Benchmark clean kitchen utensil material.", confidence:"high", category:"kitchen" }],
  ["nylon utensils",                { floor:4, ceiling:6, substances:["nylon","polyamide","heat degradation"], reason:"Nylon plastic utensils — polyamide plastic releases chemicals at high heat. Avoid contact with very hot pans or liquids. Switch to silicone or wood.", confidence:"high", category:"kitchen" }],
  ["melamine dishes",               { floor:6, ceiling:8, substances:["melamine","formaldehyde"], reason:"Melamine dishes — melamine and formaldehyde migrate into food at elevated temperatures, with hot liquids, and with acidic foods. FDA limits exist but concern remains especially for children eating hot food from melamine plates. NEVER use for hot food.", confidence:"high", category:"kitchen" }],
  ["melamine",                      { floor:6, ceiling:8, substances:["melamine","formaldehyde"], reason:"Melamine — formaldehyde migration into hot or acidic food is documented. Floor fires at 6+. Avoid for hot food contact.", confidence:"high", category:"kitchen" }],

  // ══════════════════════════════════════════════════════════════
  // AUDIT 39 — COFFEE, TEA AND CREAMERS
  // KEY STORIES:
  //   1. K-Cups: polypropylene pod + near-boiling water =
  //      billions of microplastics per cup (2023 Spanish study)
  //   2. Tea bags: most paper bags sealed with epichlorohydrin
  //      (WHO Group 2A carcinogen). Nylon sachets release
  //      microplastics directly into hot tea.
  //   3. Coffee Mate Powder: partially hydrogenated oil +
  //      Yellow 5 + Yellow 6 + artificial flavor. One of the
  //      worst products in the registry.
  // ══════════════════════════════════════════════════════════════

  // ── K-CUPS: CONCERN ──────────────────────────────────────────
  ["k-cup",                        { floor:5, ceiling:7, substances:["polypropylene","microplastics"], reason:"K-Cup pods — polypropylene #5 plastic heated with near-boiling water releases billions of microplastic particles per cup (2023 Spanish study). Applies to all K-cup format coffee pods.", confidence:"high", category:"food_beverage" }],
  ["folgers k-cup",                 { floor:5, ceiling:7, substances:["polypropylene","microplastics","conventional coffee"], reason:"Folgers K-Cup — polypropylene #5 plastic pod heated with near-boiling water releases billions of microplastic particles per cup (2023 study). Conventional coffee adds pesticide concern.", confidence:"high", category:"food_beverage" }],
  ["death wish coffee k",           { floor:5, ceiling:7, substances:["polypropylene","microplastics"], reason:"Death Wish Coffee K-Cup — polypropylene pod microplastic concern. Coffee is USDA Organic (lower pesticide concern than Folgers K-Cups).", confidence:"high", category:"food_beverage" }],
  ["nespresso original",            { floor:2, ceiling:4, substances:["aluminum"], reason:"Nespresso Original — aluminum pod, no plastic contact with hot coffee. Aluminum trace concern is minimal. Significantly cleaner than polypropylene K-cups.", confidence:"high", category:"food_beverage" }],

  // ── GROUND COFFEE: CONVENTIONAL ──────────────────────────────
  ["folgers coffee",                { floor:3, ceiling:5, substances:["conventional coffee","pesticide residue","mycotoxins"], reason:"Folgers — conventional (non-organic) coffee. Pesticide-intensive crop + mycotoxin (ochratoxin A, aflatoxin) concern in budget blends. Not tested or certified clean.", confidence:"medium", category:"food_beverage" }],
  ["maxwell house",                 { floor:3, ceiling:5, substances:["conventional coffee","pesticide residue"], reason:"Maxwell House — conventional non-organic coffee. Same pesticide and mycotoxin concern as Folgers. Budget blend with no third-party testing claims.", confidence:"medium", category:"food_beverage" }],
  ["starbucks ground coffee",       { floor:3, ceiling:4, substances:["conventional coffee","pesticide residue"], reason:"Starbucks ground coffee — conventional (non-organic) in most lines. Better sourcing than Folgers but still not USDA Organic certified for standard blends.", confidence:"medium", category:"food_beverage" }],
  ["dunkin coffee",                 { floor:3, ceiling:4, substances:["conventional coffee","pesticide residue"], reason:"Dunkin ground coffee — conventional non-organic. Standard commodity coffee concern.", confidence:"medium", category:"food_beverage" }],
  ["peets coffee",                  { floor:3, ceiling:4, substances:["conventional coffee"], reason:"Peet's — higher quality sourcing than Folgers but most blends are conventional non-organic. Better roasting doesn't eliminate crop pesticide concern.", confidence:"medium", category:"food_beverage" }],
  ["eight o'clock coffee",          { floor:3, ceiling:5, substances:["conventional coffee","pesticide residue"], reason:"Eight O'Clock — conventional non-organic coffee. Budget supermarket brand, no clean certifications.", confidence:"medium", category:"food_beverage" }],

  // ── GROUND COFFEE: CLEAN ─────────────────────────────────────
  ["death wish coffee",             { floor:1, ceiling:3, substances:[], reason:"Death Wish Coffee — USDA Organic + Fair Trade certified. High caffeine but clean sourcing. No pesticide concern.", confidence:"high", category:"food_beverage" }],
  ["bulletproof",            { floor:1, ceiling:3, substances:[], reason:"Bulletproof Coffee — claims lab-tested for mycotoxins, single-origin sourcing. Clean premium coffee.", confidence:"medium", category:"food_beverage" }],
  ["four sigmatic coffee",          { floor:1, ceiling:3, substances:[], reason:"Four Sigmatic — USDA Organic coffee + functional mushrooms, no artificial additives. Clean functional coffee.", confidence:"high", category:"food_beverage" }],
  ["lifeboost",              { floor:1, ceiling:2, substances:[], reason:"Lifeboost — USDA Organic, single origin, shade grown, low acid, third-party tested for mycotoxins and pesticides. Benchmark cleanest mainstream coffee.", confidence:"high", category:"food_beverage" }],
  ["allegro organic coffee",        { floor:1, ceiling:3, substances:[], reason:"Allegro Organic — USDA Organic certified, Whole Foods house brand. Clean certified organic coffee.", confidence:"high", category:"food_beverage" }],
  ["chameleon organic",      { floor:1, ceiling:3, substances:[], reason:"Chameleon — USDA Organic certified coffee and cold brew. Benchmark clean organic coffee brand.", confidence:"high", category:"food_beverage" }],

  // ── COLD BREW ─────────────────────────────────────────────────
  ["stok cold brew",                { floor:3, ceiling:5, substances:["conventional coffee","cane sugar"], reason:"Stok Cold Brew — conventional (non-organic) coffee + added cane sugar in sweetened varieties. Plastic bottle packaging adds concern.", confidence:"high", category:"food_beverage" }],
  ["chameleon",           { floor:1, ceiling:3, substances:[], reason:"Chameleon Cold Brew — USDA Organic certified coffee, minimal clean ingredients. Benchmark clean cold brew.", confidence:"high", category:"food_beverage" }],
  ["la colombe cold brew",          { floor:1, ceiling:3, substances:[], reason:"La Colombe Cold Brew — clean sourcing, minimal ingredients, draft latte or cold brew in aluminum can. Clean cold brew brand.", confidence:"high", category:"food_beverage" }],
  ["grady cold brew",               { floor:1, ceiling:3, substances:[], reason:"Grady's Cold Brew — New Orleans style, clean chicory + coffee concentrate, no artificial additives. Clean cold brew brand.", confidence:"high", category:"food_beverage" }],
  ["califia cold brew",             { floor:2, ceiling:4, substances:[], reason:"Califia Cold Brew — plant-based cold brew, minimal ingredients, no artificial additives. Clean-leaning cold brew option.", confidence:"high", category:"food_beverage" }],

  // ── TEA BAGS: CONCERN ─────────────────────────────────────────
  ["lipton",                    { floor:5, ceiling:7, substances:["epichlorohydrin","conventional tea","pesticide residue"], reason:"Lipton — paper bags sealed with epichlorohydrin (WHO Group 2A potential carcinogen used as wet-strength agent) + conventional tea with pesticide concern. One of the most widely consumed teas with a real concern profile.", confidence:"high", category:"food_beverage" }],
  ["bigelow tea",                   { floor:4, ceiling:5, substances:["conventional tea","pesticide residue","foil packaging"], reason:"Bigelow — conventional non-organic tea + individual foil wrapping. Better than Lipton on bag chemistry but conventional pesticide concern remains.", confidence:"medium", category:"food_beverage" }],
  ["twinings",                  { floor:4, ceiling:5, substances:["conventional tea","pesticide residue"], reason:"Twinings — conventional non-organic tea. Higher quality sourcing than Lipton but still not organic certified. Plastic wrap on some varieties adds concern.", confidence:"medium", category:"food_beverage" }],
  ["tazo tea",                      { floor:4, ceiling:5, substances:["conventional tea","natural flavor"], reason:"Tazo (Starbucks-owned) — conventional non-organic tea + natural flavor (vague). Better than Lipton, not as clean as Numi or Traditional Medicinals.", confidence:"medium", category:"food_beverage" }],
  ["celestial seasonings tea",      { floor:3, ceiling:5, substances:["conventional tea","natural flavor"], reason:"Celestial Seasonings — unbleached paper bags (no staples), no plastic bags, but conventional non-organic tea + natural flavor. Better bag chemistry than Lipton.", confidence:"high", category:"food_beverage" }],
  ["harney sons tea",               { floor:3, ceiling:5, substances:["nylon sachets","microplastics"], reason:"Harney and Sons — premium loose teas are clean but their sachets are nylon mesh which releases microplastics in hot water. Opt for their loose leaf.", confidence:"medium", category:"food_beverage" }],

  // ── TEA: CLEAN TIER ──────────────────────────────────────────
  ["yogi tea",                      { floor:2, ceiling:4, substances:[], reason:"Yogi Tea — organic certified blends, no bleached bags, no staples or plastic. Better than Bigelow or Twinings. Some non-organic herbs in blends.", confidence:"high", category:"food_beverage" }],
  ["traditional medicinals",        { floor:1, ceiling:3, substances:[], reason:"Traditional Medicinals — USDA Organic certified, non-GMO, unbleached bags, no staples. Benchmark clean tea brand.", confidence:"high", category:"food_beverage" }],
  ["numi organic",              { floor:1, ceiling:3, substances:[], reason:"Numi Organic Tea — USDA Organic, non-GMO, compostable tea bags, no plastic. Benchmark clean tea brand.", confidence:"high", category:"food_beverage" }],
  ["numi tea",                      { floor:1, ceiling:3, substances:[], reason:"Numi — USDA Organic, compostable bags. Benchmark clean.", confidence:"high", category:"food_beverage" }],
  ["pukka tea",                     { floor:1, ceiling:3, substances:[], reason:"Pukka Herbs — certified organic, plastic-free bags, no staples or tags. Benchmark clean tea brand.", confidence:"high", category:"food_beverage" }],
  ["pukka",                         { floor:1, ceiling:3, substances:[], reason:"Pukka — certified organic herbs, plastic-free tea bags. Benchmark clean.", confidence:"high", category:"food_beverage" }],

  // ── INSTANT COFFEE ────────────────────────────────────────────
  ["nescafe instant coffee",        { floor:3, ceiling:5, substances:["conventional coffee","natural flavor"], reason:"Nescafe — conventional non-organic instant coffee. Standard commodity coffee concern.", confidence:"medium", category:"food_beverage" }],
  ["folgers crystals",              { floor:3, ceiling:5, substances:["conventional coffee","pesticide residue"], reason:"Folgers Crystals — conventional instant coffee, same pesticide and mycotoxin concern as ground Folgers.", confidence:"medium", category:"food_beverage" }],
  ["mount hagen",                   { floor:1, ceiling:3, substances:[], reason:"Mount Hagen — USDA Organic, Fair Trade certified freeze-dried instant coffee. Benchmark cleanest instant coffee.", confidence:"high", category:"food_beverage" }],
  ["waka coffee",                   { floor:1, ceiling:3, substances:[], reason:"Waka Coffee — USDA Organic certified instant coffee, freeze-dried, no additives. Clean instant coffee benchmark.", confidence:"high", category:"food_beverage" }],

  // ── CREAMERS: CRITICAL CONCERN ────────────────────────────────
  ["coffee mate powder",            { floor:7, ceiling:9, substances:["partially hydrogenated oil","Yellow 5","Yellow 6","artificial flavor","sodium aluminosilicate"], reason:"Coffee Mate Powder — partially hydrogenated oil (trans fat floor fires) + Yellow 5 + Yellow 6 petroleum dyes (dye floors fire) + artificial flavor + sodium aluminosilicate. Multiple critical floors fire simultaneously. One of the highest-concern products in the Partiqule registry. Pour into your morning coffee every day.", confidence:"high", category:"food_beverage" }],
  ["coffee mate liquid",            { floor:5, ceiling:7, substances:["carrageenan","artificial flavor","mono diglycerides","dipotassium phosphate"], reason:"Coffee Mate Liquid — carrageenan + artificial flavor + mono and diglycerides + dipotassium phosphate. Marketed as a creamer but contains no dairy and multiple synthetic additives.", confidence:"high", category:"food_beverage" }],
  ["coffee mate french vanilla",    { floor:5, ceiling:7, substances:["carrageenan","artificial flavor","HFCS"], reason:"Coffee Mate French Vanilla — HFCS + carrageenan + artificial flavor. HFCS floor fires on a daily morning beverage addition.", confidence:"high", category:"food_beverage" }],
  ["coffee mate",                   { floor:7, ceiling:9, substances:["partially hydrogenated oil","artificial flavor","carrageenan"], reason:"Coffee Mate brand — powder version is critical (trans fat + petroleum dyes, floor 7-9), liquid version is high concern (carrageenan + artificial flavor, floor 5-7). One of the most additive-laden products in the daily kitchen.", confidence:"high", category:"food_beverage" }],
  ["starbucks coffee creamer",      { floor:4, ceiling:6, substances:["carrageenan","natural flavor","dipotassium phosphate"], reason:"Starbucks Creamer — carrageenan + dipotassium phosphate + natural flavor. Better than Coffee Mate but still not clean.", confidence:"high", category:"food_beverage" }],

  // ── CREAMERS: CLEAN ───────────────────────────────────────────
  ["nutpods creamer",               { floor:1, ceiling:3, substances:[], reason:"Nutpods — unsweetened almond and coconut milk creamer, no artificial additives, no carrageenan. Benchmark cleanest mainstream coffee creamer.", confidence:"high", category:"food_beverage" }],
  ["nutpods",                       { floor:1, ceiling:3, substances:[], reason:"Nutpods — almond/coconut base, no carrageenan, no artificial flavor. Benchmark clean creamer.", confidence:"high", category:"food_beverage" }],
  ["silk oat creamer",              { floor:3, ceiling:4, substances:["dipotassium phosphate","sunflower oil","natural flavor"], reason:"Silk Oat Milk Creamer — dipotassium phosphate + sunflower oil + natural flavor. Mid-tier plant creamer.", confidence:"high", category:"food_beverage" }],
  ["elmhurst barista",              { floor:2, ceiling:3, substances:[], reason:"Elmhurst Barista — minimal ingredients, no dipotassium phosphate, no carrageenan, just oat/nut base. Cleaner than Silk or Califia.", confidence:"high", category:"food_beverage" }],
  ["coconut cloud creamer",         { floor:2, ceiling:3, substances:[], reason:"Coconut Cloud — coconut milk powder base, no artificial additives, no carrageenan. Clean powdered creamer alternative.", confidence:"high", category:"food_beverage" }],
  ["vital farms half and half",     { floor:1, ceiling:2, substances:[], reason:"Vital Farms Half and Half — pasture-raised cream + milk, two ingredients. Benchmark cleanest creamer available.", confidence:"high", category:"food_beverage" }],

  // ── COFFEE SYRUPS ─────────────────────────────────────────────
  ["torani",                  { floor:4, ceiling:6, substances:["HFCS","artificial flavor","potassium sorbate"], reason:"Torani — HFCS + artificial flavor + potassium sorbate preservative. Standard flavored coffee syrup with HFCS floor and preservative concern.", confidence:"high", category:"food_beverage" }],
  ["monin syrup",                   { floor:3, ceiling:5, substances:["cane sugar","natural flavor","potassium sorbate"], reason:"Monin — cane sugar (not HFCS) + natural flavor + potassium sorbate. Better than Torani but potassium sorbate preservative present.", confidence:"high", category:"food_beverage" }],
  ["jordan's skinny",           { floor:5, ceiling:7, substances:["sucralose","artificial flavor","acesulfame-K"], reason:"Jordan's Skinny Syrups — sucralose + acesulfame-K double sweetener stack + artificial flavor. Multiple sweetener floors fire. Widely used in 'healthier' coffee drinks.", confidence:"high", category:"food_beverage" }],
  ["starbucks syrup",               { floor:3, ceiling:5, substances:["cane sugar","natural flavor","potassium sorbate"], reason:"Starbucks Vanilla Syrup and similar — cane sugar + natural flavor + potassium sorbate. Same concern profile as Monin.", confidence:"medium", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // AUDIT 39 — COFFEE, TEA AND CREAMERS
  // KEY STORIES:
  //   K-Cups: plastic pod + 92C water = microplastic migration
  //   Coffee Mate: corn syrup + carrageenan + SSL + artificial
  //   flavor — one of the worst morning routine products
  //   Tea bags: epichlorohydrin sealing chemical + pyramid bags
  //   may be nylon (microplastics in hot water)
  // ══════════════════════════════════════════════════════════════

  // ── GROUND COFFEE: CONVENTIONAL ──────────────────────────────
  ["folgers",                       { floor:3, ceiling:5, substances:["conventional coffee","pesticide residues"], reason:"Folgers — conventional blend, no organic certification or pesticide testing claim.", confidence:"high", category:"food_beverage" }],
  ["peet's coffee",                 { floor:3, ceiling:4, substances:["conventional coffee"], reason:"Peet's — conventional coffee, some single origins with better sourcing but no blanket organic certification.", confidence:"medium", category:"food_beverage" }],
  ["lavazza",                       { floor:3, ceiling:4, substances:["conventional coffee"], reason:"Lavazza — Italian conventional coffee blend, no organic certification. Standard conventional concern.", confidence:"medium", category:"food_beverage" }],
  ["cafe bustelo",                  { floor:3, ceiling:5, substances:["conventional coffee","fine grind"], reason:"Cafe Bustelo — conventional espresso blend, highly processed fine grind. No organic certification.", confidence:"medium", category:"food_beverage" }],
  ["nescafe instant",               { floor:4, ceiling:5, substances:["conventional coffee","spray-dried","processing"], reason:"Nescafe — spray-dried instant coffee, heavily processed, conventional sourcing. More processing than ground coffee adds concern.", confidence:"high", category:"food_beverage" }],
  ["starbucks via",                 { floor:3, ceiling:5, substances:["conventional coffee","instant processing"], reason:"Starbucks Via instant — better sourcing than Nescafe but still instant-processed conventional coffee.", confidence:"medium", category:"food_beverage" }],

  // ── K-CUPS: PLASTIC POD CONCERN ───────────────────────────────
  ["death wish",              { floor:5, ceiling:7, substances:["polypropylene pod","LDPE foil","microplastics"], reason:"Death Wish K-Cup — polypropylene plastic pod + LDPE foil lid + 92C water = documented microplastic migration into coffee. Plastic pod concern applies regardless of coffee quality inside.", confidence:"high", category:"food_beverage" }],

  // ── GROUND COFFEE: CLEAN TIER ────────────────────────────────
  ["bulletproof coffee",            { floor:2, ceiling:3, substances:[], reason:"Bulletproof — mycotoxin-tested, single origin, mold-free claim with third-party lab verification. Cleaner than standard conventional coffee.", confidence:"high", category:"food_beverage" }],
  ["kicking horse coffee",          { floor:1, ceiling:3, substances:[], reason:"Kicking Horse — USDA Organic certified, fair trade, B Corp. Benchmark clean mainstream coffee brand.", confidence:"high", category:"food_beverage" }],

  // ── COFFEE CREAMERS: HIGH CONCERN ────────────────────────────
  ["international delight",         { floor:6, ceiling:8, substances:["HFCS","carrageenan","artificial flavor","artificial color"], reason:"International Delight — HFCS + carrageenan + artificial flavor + artificial color. Multiple floors fire. HFCS + dye concern on a daily morning creamer.", confidence:"high", category:"food_beverage" }],

  // ── COFFEE CREAMERS: CLEAN TIER ──────────────────────────────
  ["califia farms creamer",         { floor:3, ceiling:5, substances:["sunflower oil","pea protein","oats"], reason:"Califia Farms — oat or almond base, no carrageenan in most formulas, but sunflower oil + pea protein. Cleaner than Coffee Mate, not clean-label.", confidence:"medium", category:"food_beverage" }],
  ["elmhurst creamer",              { floor:1, ceiling:3, substances:[], reason:"Elmhurst — minimal ingredients (oats or nuts + water), no gums, no carrageenan, no artificial additives. Benchmark cleanest oat creamer.", confidence:"high", category:"food_beverage" }],
  ["elmhurst",                      { floor:1, ceiling:3, substances:[], reason:"Elmhurst — minimal ingredient dairy-free milks and creamers, no gums or additives. Benchmark clean.", confidence:"high", category:"food_beverage" }],
  ["laird superfood creamer",       { floor:1, ceiling:3, substances:[], reason:"Laird Superfood — coconut milk powder + functional mushrooms or superfoods, no artificial additives. Clean performance creamer.", confidence:"high", category:"food_beverage" }],
  ["laird superfood",               { floor:1, ceiling:3, substances:[], reason:"Laird Superfood — clean plant-based creamers and supplements. No artificial additives.", confidence:"high", category:"food_beverage" }],

  // ── TEA: CONCERN ─────────────────────────────────────────────
  ["tetley tea",                    { floor:3, ceiling:5, substances:["conventional tea","epichlorohydrin","bleached paper"], reason:"Tetley — conventional tea, standard bleached paper bags sealed with epichlorohydrin (industrial chemical used in resin manufacturing). Hot water contact with treated filter paper is a real concern.", confidence:"medium", category:"food_beverage" }],
  ["republic of tea",               { floor:3, ceiling:5, substances:["nylon pyramid bags","microplastics"], reason:"Republic of Tea pyramid bags — silken pyramid bags are often nylon mesh. Hot water causes nylon to release microplastics and nanoplastics. Premium branding doesn't fix plastic bags.", confidence:"medium", category:"food_beverage" }],

  // ── TEA: CLEAN TIER ──────────────────────────────────────────
  ["celestial seasonings",          { floor:2, ceiling:4, substances:["conventional herbs"], reason:"Celestial Seasonings — no staples, no strings, no tags, no bleach, no epichlorohydrin. Cleaner bag format than most. Conventional herbs still have pesticide concern.", confidence:"high", category:"food_beverage" }],
  ["numi organic tea",              { floor:1, ceiling:3, substances:[], reason:"Numi — USDA Organic certified, non-GMO, plant-based tea bags (no nylon), fair trade. Benchmark clean tea brand.", confidence:"high", category:"food_beverage" }],
  ["numi",                          { floor:1, ceiling:3, substances:[], reason:"Numi Organic — USDA Organic, plant-based bags. Benchmark clean.", confidence:"high", category:"food_beverage" }],

  // ── MATCHA ────────────────────────────────────────────────────
  ["jade leaf",              { floor:1, ceiling:3, substances:[], reason:"Jade Leaf — USDA Organic matcha, ceremonial and culinary grades, no additives. Benchmark clean matcha brand.", confidence:"high", category:"food_beverage" }],
  ["ippodo matcha",                 { floor:1, ceiling:3, substances:[], reason:"Ippodo — premium Japanese matcha, tested for pesticides, traditional cultivation. Benchmark clean premium matcha.", confidence:"high", category:"food_beverage" }],
  ["golde matcha",                  { floor:2, ceiling:4, substances:[], reason:"Golde — matcha + coconut milk + functional ingredients, clean sourcing, no artificial additives. Clean wellness matcha blend.", confidence:"high", category:"food_beverage" }],

  // ── NESPRESSO PODS ────────────────────────────────────────────
  ["nespresso",                     { floor:2, ceiling:4, substances:["aluminum pod"], reason:"Nespresso — aluminum pod format significantly cleaner than plastic K-Cups. No plastic food contact surface.", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // AUDIT 40 — CLOTHING (ATHLETIC, OUTERWEAR, BASICS, DENIM,
  //            KIDS, SOCKS)
  // KEY STORIES:
  //   PFAS DWR water repellent on rain jackets — Columbia,
  //   Arc'teryx, Marmot all historically used PFAS treatments.
  //   Some reformulating but third-party verification limited.
  //   Flame retardants in kids' sleepwear — Carter's treated
  //   cotton pajamas may use flame retardant chemicals.
  //   Formaldehyde in wrinkle-resistant denim finishes.
  //   Synthetic microplastics from polyester/nylon activewear.
  // FRAMEWORK:
  //   PFAS DWR rain jacket → 6-8
  //   Synthetic activewear (no PFAS claim) → 4-6
  //   Kids sleepwear with FR chemicals → 6-8
  //   Conventional cotton basics → 3-5
  //   OEKO-TEX certified → 2-4
  //   GOTS organic cotton → 1-3
  //   Merino wool / natural fiber certified → 1-3
  // ══════════════════════════════════════════════════════════════

  // ── ATHLETIC / ACTIVEWEAR: CONCERN ───────────────────────────
  ["nike dri-fit",                  { floor:3, ceiling:5, substances:["polyester","synthetic dyes","microplastics"], reason:"Nike Dri-FIT — polyester microfiber, moisture-wicking through fiber structure NOT chemical PFAS coating. Nike confirmed PFAS eliminated from apparel by FY24. Mamavation lab testing found zero detectable fluorine in Nike products. Still 100% synthetic polyester with microplastic shedding concern but PFAS concern not lab-confirmed.", confidence:"high", category:"clothing" }],
  ["nike pro tights",               { floor:3, ceiling:5, substances:["polyester","spandex","synthetic dyes","microplastics"], reason:"Nike Pro tights — polyester/spandex compression. Nike confirmed PFAS-free as of FY24. Mamavation found zero fluorine in Nike testing. Still synthetic construction with microplastic shedding concern.", confidence:"high", category:"clothing" }],
  
  // ── NIKE PRODUCT-SPECIFIC (Nike FY24 confirmed PFAS-free + Mamavation verified) ───
  ["nike dri-fit running t",        { floor:3, ceiling:4, substances:["recycled polyester","synthetic dyes","microplastics"], reason:"Nike Dri-FIT running — 100% recycled polyester. PFAS-free per Nike FY24. Mamavation zero fluorine. Microplastic shedding main concern.", confidence:"high", category:"clothing" }],
  ["nike dri-fit t-shirt",          { floor:3, ceiling:4, substances:["recycled polyester","synthetic dyes","microplastics"], reason:"Nike Dri-FIT T-Shirt — 100% polyester microfiber or recycled polyester. Moisture-wicking through fiber construction, not PFAS chemical treatment. Nike confirmed PFAS eliminated FY24. Mamavation zero fluorine detection. Microplastic shedding from synthetic fabric remains the primary concern.", confidence:"high", category:"clothing" }],
  ["nike dri-fit polo",             { floor:3, ceiling:4, substances:["polyester","synthetic dyes","microplastics"], reason:"Nike Dri-FIT Polo — 100% polyester. PFAS-free per FY24 Nike commitment and Mamavation testing. Synthetic fabric microplastic concern remains.", confidence:"high", category:"clothing" }],
  ["nike dri-fit shorts",           { floor:3, ceiling:4, substances:["polyester","synthetic dyes","microplastics"], reason:"Nike Dri-FIT Shorts — polyester construction, PFAS-free per Nike FY24 and Mamavation testing. Microplastic concern.", confidence:"high", category:"clothing" }],
  ["nike dri-fit training",         { floor:3, ceiling:4, substances:["polyester","synthetic dyes","microplastics"], reason:"Nike Dri-FIT training apparel — polyester, PFAS-free per Nike FY24. Microplastic shedding concern.", confidence:"high", category:"clothing" }],
  ["nike storm-fit",                { floor:4, ceiling:6, substances:["polyester","waterproof treatment","synthetic dyes"], reason:"Nike Storm-FIT — waterproof outerwear. Nike transitioning to PFAS-free DWR but Storm-FIT waterproofing history includes PFAS. Transition status not fully verified on all Storm-FIT products. Score higher than standard Dri-FIT.", confidence:"medium", category:"clothing" }],
  ["nike air force 1",              { floor:4, ceiling:6, substances:["conventional leather","chrome tanning","rubber sole","synthetic dyes","adhesives"], reason:"Nike Air Force 1 — conventional leather upper with chrome tanning concern + rubber sole + chemical adhesives + synthetic dyes. No DWR treatment. Chrome tanning is an environmental and skin contact concern in leather production.", confidence:"high", category:"clothing" }],
  ["nike air max",                  { floor:3, ceiling:5, substances:["synthetic mesh","TPU overlays","foam midsole","adhesives"], reason:"Nike Air Max — synthetic mesh upper + TPU overlays + foam midsole + adhesives. No DWR treatment, no PFAS concern on standard Air Max. Synthetic construction with adhesives is mid-tier concern.", confidence:"high", category:"clothing" }],
  ["nike air jordan",               { floor:4, ceiling:6, substances:["synthetic leather","rubber sole","adhesives","synthetic dyes"], reason:"Nike Air Jordan — synthetic leather or real leather upper + rubber sole + chemical adhesives. Chrome tanning concern on leather versions. Premium price, conventional shoe construction concern.", confidence:"medium", category:"clothing" }],
  ["nike flyknit",                  { floor:3, ceiling:5, substances:["recycled polyester","synthetic dyes","adhesives"], reason:"Nike Flyknit — engineered recycled polyester knit upper. Up to 60% recycled content on newer models. PFAS-free per FY24. Cleaner than leather alternatives but still synthetic adhesives.", confidence:"high", category:"clothing" }],
  ["nike cotton t-shirt",           { floor:3, ceiling:5, substances:["conventional cotton","synthetic dyes"], reason:"Nike cotton tee — conventional cotton (non-organic) + synthetic dyes. No PFAS concern on cotton products. Conventional cotton pesticide concern remains.", confidence:"high", category:"clothing" }],
  ["nike everyday",           { floor:3, ceiling:4, substances:["conventional cotton","polyester","nylon","synthetic dyes"], reason:"Nike Everyday Socks — cotton/polyester/nylon blend + synthetic dyes. PFAS-free fabric, no performance treatment on standard socks. Mid-tier concern from conventional cotton and synthetic blend.", confidence:"high", category:"clothing" }],
  // (nike apparel calibration lives at the dedicated entry below — bare "nike" brand-prefix removed)
  ["nike water bottle",             { floor:3, ceiling:4, substances:["BPA-free plastic","Tritan or HDPE"], reason:"Nike sport water bottles — typically BPA-free Tritan copolyester or HDPE. No phthalates. Still a single-use plastic vector with potential for plasticizer leaching at high temperatures or after dishwasher cycles. Stainless steel alternatives are cleaner.", confidence:"medium", category:"home" }],
  ["nike apparel",                  { floor:3, ceiling:5, substances:["polyester","synthetic dyes","microplastics"], reason:"Nike apparel — PFAS eliminated from apparel as of FY24 per Nike official statement and confirmed by Mamavation zero fluorine detection. Still synthetic polyester construction with microplastic shedding. No OEKO-TEX certification.", confidence:"high", category:"clothing" }],
  ["lululemon abc",                 { floor:5, ceiling:7, substances:["nylon","lycra","Warpstreme DWR","Silverescent"], reason:"Lululemon ABC Pants — Warpstreme nylon/lycra with durable water repellent finish + Silverescent silver antimicrobial. DWR historically PFAS-based. Lululemon claims PFAS phase-out in FY23, but Texas AG Ken Paxton issued a Civil Investigative Demand on April 13, 2026 alleging the phase-out claim is misleading. No independent post-2023 lab testing has verified DWR-finished items are fluorine-free.", confidence:"high", category:"clothing" }],
  ["lululemon commission",          { floor:5, ceiling:7, substances:["nylon","lycra","water-repellent finish"], reason:"Lululemon Commission Pant — Warpstreme nylon/lycra with water-repellent finish. Same DWR family as ABC Pants. Lululemon's FY23 PFAS phase-out claim is under Texas AG investigation (April 2026 CID) for potentially misleading marketing.", confidence:"high", category:"clothing" }],
  ["lululemon down for it all",     { floor:5, ceiling:7, substances:["nylon","down","DWR finish"], reason:"Lululemon Down for It All Jacket — nylon shell with durable water repellent finish. Outerwear DWR is the highest-risk category for legacy PFAS. Lululemon's FY23 phase-out claim is under Texas AG investigation (April 2026 CID). Floor held at 5 until independent lab testing verifies fluorine-free.", confidence:"high", category:"clothing" }],
  ["lululemon pack it up",          { floor:5, ceiling:7, substances:["nylon","DWR finish"], reason:"Lululemon Pack It Up Jacket — water-resistant nylon shell with DWR finish. Outerwear DWR concern. Lululemon's FY23 phase-out claim is under Texas AG investigation (April 2026 CID). Floor 5 until independent lab-verification.", confidence:"high", category:"clothing" }],
  ["lululemon showerproof",         { floor:5, ceiling:7, substances:["nylon","DWR finish"], reason:"Lululemon Showerproof line — water-resistant treatment on outer fabric. DWR historically fluorinated. Lululemon's FY23 phase-out claim is under Texas AG investigation (April 2026 CID). Floor 5 until independent lab-verification.", confidence:"high", category:"clothing" }],
  ["lululemon everywhere belt bag", { floor:5, ceiling:6, substances:["nylon","water-repellent finish"], reason:"Lululemon Everywhere Belt Bag — nylon with water-repellent finish. DWR concern on outer fabric (legacy PFAS). Lululemon's FY23 PFAS phase-out is under Texas AG investigation (April 2026 CID). Limited skin contact lowers exposure vs apparel but DWR concern unresolved.", confidence:"high", category:"clothing" }],
  ["lululemon belt bag",            { floor:5, ceiling:6, substances:["nylon","water-repellent finish"], reason:"Lululemon Belt Bag — nylon with water-repellent DWR finish. FY23 phase-out claim under Texas AG investigation (April 2026 CID). Limited skin contact lowers exposure vs apparel.", confidence:"high", category:"clothing" }],
  ["lululemon scuba",               { floor:3, ceiling:5, substances:["cotton","polyester","synthetic dyes"], reason:"Lululemon Scuba Hoodie — cotton/polyester fleece blend, no DWR treatment, no antimicrobial finish. No PFAS vector on unfinished fleece regardless of the Texas AG PFAS investigation (April 2026). Mid-tier from conventional cotton blend and polyester microfiber shedding.", confidence:"high", category:"clothing" }],
  ["lululemon softstreme",          { floor:4, ceiling:5, substances:["nylon","elastane"], reason:"Lululemon Softstreme — nylon/elastane brushed lounge fabric. No DWR, no antimicrobial. Not in Mamavation test set. Texas AG Lululemon PFAS probe (April 2026) centers on DWR-treated products; Softstreme has no DWR vector. Synthetic microfiber shedding remains main concern.", confidence:"medium", category:"clothing" }],
  ["lululemon swiftly",             { floor:4, ceiling:6, substances:["polyester","Silverescent antimicrobial"], reason:"Lululemon Swiftly Tech — cationic polyester with Silverescent silver antimicrobial. Silver (not PFAS) is the core chemistry concern — silver nanoparticle shedding into waterways. No DWR, so outside the scope of Texas AG PFAS probe (April 2026).", confidence:"medium", category:"clothing" }],
  ["lululemon wunder",              { floor:4, ceiling:6, substances:["polyester","elastane","synthetic dyes"], reason:"Lululemon Wunder Train / Wunder Under — Everlux or Full-On Luxtreme polyester/elastane. Not in Mamavation test set. No DWR treatment. Texas AG PFAS probe (April 2026) centers on DWR-treated products. Synthetic performance fabric with microfiber shedding.", confidence:"medium", category:"clothing" }],
  ["lululemon fast and free",       { floor:4, ceiling:6, substances:["polyester","lycra","synthetic dyes"], reason:"Lululemon Fast and Free — Nulux polyester/lycra running fabric. Not lab tested. No DWR. Outside scope of Texas AG PFAS probe (April 2026). Synthetic performance fabric with microfiber shedding.", confidence:"medium", category:"clothing" }],
  ["lululemon fast & free",         { floor:4, ceiling:6, substances:["polyester","lycra","synthetic dyes"], reason:"Lululemon Fast & Free — Nulux polyester/lycra running fabric. Not lab tested. No DWR. Outside scope of Texas AG PFAS probe (April 2026).", confidence:"medium", category:"clothing" }],
  ["lululemon define",              { floor:4, ceiling:5, substances:["nylon","lycra","synthetic dyes"], reason:"Lululemon Define Jacket — Luon nylon/lycra, no water-repellent treatment. Outside scope of Texas AG PFAS probe (April 2026) which centers on DWR-treated products.", confidence:"medium", category:"clothing" }],
  ["lululemon scuba hoodie",        { floor:3, ceiling:5, substances:["cotton","polyester","synthetic dyes"], reason:"Lululemon Scuba Hoodie — cotton/polyester fleece, no DWR, no antimicrobial. No PFAS concern on unfinished fleece.", confidence:"high", category:"clothing" }],
  ["lululemon tee",                 { floor:3, ceiling:5, substances:["cotton","modal","polyester","synthetic dyes"], reason:"Lululemon cotton/modal tee — no DWR, no antimicrobial treatment. PFAS concern low on unfinished tees. Conventional cotton pesticide concern remains.", confidence:"medium", category:"clothing" }],
  ["lululemon cotton",              { floor:3, ceiling:5, substances:["cotton","synthetic dyes"], reason:"Lululemon cotton basics — no DWR treatment. PFAS concern low on cotton. Conventional (non-organic) cotton pesticide concern remains.", confidence:"medium", category:"clothing" }],
  // Lululemon yoga mats — home_furnishing, not clothing. Consolidated to
  // the most specific key; the fuzzy startsWith lookup handles variants.
  ["lululemon the mat",             { floor:3, ceiling:5, substances:["natural rubber","polyurethane"], reason:"Lululemon The Mat — natural rubber base with polyurethane top layer. Not PFAS concern; polyurethane off-gassing and synthetic top-layer durability concern. Cleaner than PVC mats, not as clean as 100% cork or natural rubber.", confidence:"high", category:"home_furnishing" }],
  ["lululemon mat",                 { floor:3, ceiling:5, substances:["natural rubber","polyurethane"], reason:"Lululemon yoga mat — natural rubber base with polyurethane top layer.", confidence:"high", category:"home_furnishing" }],
  ["lululemon",                     { floor:4, ceiling:6, substances:["nylon","polyester","PFAS in DWR products","Silverescent silver"], reason:"Lululemon — Mamavation 2022 found 32ppm PFAS indicator in Align High-Rise Pant (crotch area, Nulu fabric). Lululemon claims PFAS phase-out in FY23. Texas AG Ken Paxton issued a Civil Investigative Demand on April 13, 2026 alleging the PFAS-free marketing may be misleading; investigation reviewing Restricted Substances List, testing protocols, supply chain. No independent post-FY23 lab testing has verified the phase-out. Score by specific product: Align and DWR-finished items (ABC, Commission, outerwear, belt bags) stay floor 5 pending lab verification; cotton basics, Scuba, Softstreme, Wunder, Swiftly, Fast and Free, Define have no DWR vector.", confidence:"high", category:"clothing" }],
  ["under armour heatgear",          { floor:3, ceiling:4, substances:["polyester","synthetic dyes","microplastics"], reason:"Under Armour HeatGear — polyester compression fabric. Mamavation EPA-certified lab testing found ZERO detectable organic fluorine. UA committed to PFAS phase-out by 2024 and DWR elimination by 2025. Microplastic shedding from synthetic fabric remains main concern. PFAS not lab-confirmed.", confidence:"high", category:"clothing" }],
  ["under armour storm",             { floor:4, ceiling:6, substances:["polyester","water-resistant treatment","synthetic dyes"], reason:"Under Armour Storm — water-resistant outerwear. UA eliminating fluorinated DWR by 2025. Transition may not be complete on all Storm products. Score higher than HeatGear until DWR elimination fully verified.", confidence:"medium", category:"clothing" }],
  ["under armour rival",             { floor:3, ceiling:5, substances:["cotton","polyester","synthetic dyes"], reason:"Under Armour Rival — cotton/poly fleece. No DWR treatment. No PFAS concern on fleece. Mid-tier concern from conventional cotton blend.", confidence:"high", category:"clothing" }],
  ["under armour",                   { floor:3, ceiling:5, substances:["polyester","synthetic dyes","microplastics"], reason:"Under Armour brand — Mamavation zero fluorine detection. PFAS phase-out commitment by 2024. Predominantly synthetic polyester. Score by product: HeatGear 3-4, Storm waterproof 4-6, fleece/cotton 3-5.", confidence:"high", category:"clothing" }],
  ["adidas",                        { floor:5, ceiling:6, substances:["recycled polyester","synthetic dyes","PFAS finish"], reason:"Adidas — recycled polyester in many products (positive) but PFAS-treated finishes on performance lines and synthetic dyes. OEKO-TEX on some products.", confidence:"medium", category:"clothing" }],
  ["outdoor voices",                { floor:3, ceiling:5, substances:["recycled polyester","spandex","synthetic dyes"], reason:"Outdoor Voices — recycled polyester construction, no explicit PFAS-free certification across the line. Mid-tier clean activewear.", confidence:"medium", category:"clothing" }],

  // ── ATHLETIC: CLEAN TIER ─────────────────────────────────────
  
  // ── PATAGONIA PRODUCT-SPECIFIC (official 100% PFAS-free Spring 2025+) ───
  ["patagonia capilene cool",        { floor:1, ceiling:3, substances:["recycled polyester","microplastics"], reason:"Patagonia Capilene Cool — 92%+ recycled materials, PFAS-free, Fair Trade certified, bluesign approved. No PFAS per Patagonia 2025 blanket commitment. Microplastic shedding from recycled polyester remains the only concern. Benchmark clean performance base layer.", confidence:"high", category:"clothing" }],
  ["patagonia capilene",             { floor:1, ceiling:3, substances:["recycled polyester","microplastics"], reason:"Patagonia Capilene — 92%+ recycled materials, PFAS-free (100% of new products Spring 2025+ per official Patagonia statement), Fair Trade, bluesign. Benchmark clean base layer. Microplastic shedding only remaining concern.", confidence:"high", category:"clothing" }],
  ["patagonia down sweater",         { floor:1, ceiling:3, substances:["recycled polyester","RDS certified down","microplastics"], reason:"Patagonia Down Sweater — recycled polyester shell, RDS certified traceable down, PFAS-free per 2025 blanket commitment. Fair Trade certified. Benchmark clean insulated jacket.", confidence:"high", category:"clothing" }],
  ["patagonia better sweater",       { floor:1, ceiling:3, substances:["recycled polyester fleece","microplastics"], reason:"Patagonia Better Sweater — 100% recycled polyester fleece, PFAS-free, Fair Trade certified. Benchmark clean fleece. Microplastic shedding concern from fleece fabric.", confidence:"high", category:"clothing" }],
  ["patagonia baggies",              { floor:1, ceiling:3, substances:["recycled nylon","microplastics"], reason:"Patagonia Baggies — recycled nylon, PFAS-free per 2025 commitment. Fair Trade certified. Clean shorts option.", confidence:"high", category:"clothing" }],
  ["patagonia black hole",           { floor:1, ceiling:3, substances:["recycled polyester","TPU coating","microplastics"], reason:"Patagonia Black Hole bags — 100% post-consumer recycled polyester, PFAS-free matte recycled laminate per Patagonia dedicated PFAS-free bag page. Benchmark clean performance bag.", confidence:"high", category:"clothing" }],
  ["patagonia torrentshell",         { floor:1, ceiling:3, substances:["recycled nylon","PFAS-free DWR","microplastics"], reason:"Patagonia Torrentshell — recycled nylon, PFAS-free DWR per 2025 commitment. Fair Trade. Benchmark clean rain jacket.", confidence:"high", category:"clothing" }],
  ["patagonia storm racer",          { floor:1, ceiling:3, substances:["recycled nylon","PFAS-free DWR","microplastics"], reason:"Patagonia Storm Racer — recycled nylon, PFAS-free DWR. Fair Trade. Benchmark clean technical shell.", confidence:"high", category:"clothing" }],
  ["patagonia r1",                   { floor:1, ceiling:3, substances:["recycled polyester","microplastics"], reason:"Patagonia R1 fleece — recycled polyester, PFAS-free, Fair Trade. Benchmark clean midlayer.", confidence:"high", category:"clothing" }],
  ["patagonia nano puff",            { floor:1, ceiling:3, substances:["recycled polyester","PrimaLoft insulation","PFAS-free DWR","microplastics"], reason:"Patagonia Nano Puff — recycled polyester shell + PrimaLoft recycled insulation, PFAS-free DWR per 2025 commitment. Benchmark clean insulated jacket.", confidence:"high", category:"clothing" }],
  ["patagonia",                      { floor:2, ceiling:4, substances:["recycled polyester","PFAS-free","microplastics"], reason:"Patagonia brand — 100% of new products Spring 2025+ made without intentionally added PFAS per official commitment. Fair Trade certified, bluesign approved, B Corp. Primary remaining concern is microplastic shedding from recycled synthetic fabrics. Benchmark clean outdoor brand. Floor 1-3 on specific product lines, 2-4 brand-level due to microplastic concern.", confidence:"high", category:"clothing" }],

  ["icebreaker",                    { floor:1, ceiling:3, substances:[], reason:"Icebreaker — ZQ certified merino wool, no synthetic pesticides in wool production, no PFAS, no synthetic microplastics. Benchmark clean natural fiber activewear.", confidence:"high", category:"clothing" }],
  ["girlfriend collective",         { floor:2, ceiling:4, substances:["recycled PET","spandex"], reason:"Girlfriend Collective — recycled plastic bottles into leggings, OEKO-TEX certified, no PFAS claim, transparent supply chain. Cleaner synthetic activewear option.", confidence:"high", category:"clothing" }],

  // ── OUTERWEAR: PFAS DWR CONCERN ──────────────────────────────
  ["columbia watertight",           { floor:3, ceiling:5, substances:["polyester","PFAS-free DWR","synthetic dyes"], reason:"Columbia Watertight — Better Trail independently verified: Columbia achieved PFAS-free DWR across all products by end of 2024 per its 2024 Restricted Substances List. No more PFAS concern on new Columbia waterproof products. Synthetic polyester and microplastic concern remain. Major correction from previous 6-8 entry.", confidence:"high", category:"clothing" }],
  ["columbia outdry extreme",       { floor:2, ceiling:3, substances:["polyester","recycled content"], reason:"Columbia OutDry Extreme — membrane on outside means no DWR needed. Has always been PFAS-free by design. Columbia confirmed all products PFAS-free as of January 2025. ODX is cleanest Columbia waterproof technology.", confidence:"high", category:"clothing" }],
  ["columbia omni-heat",             { floor:3, ceiling:5, substances:["polyester","reflective lining","synthetic dyes"], reason:"Columbia Omni-Heat — thermal reflective insulation technology, no DWR on insulation products. PFAS-free as of 2024 Columbia commitment. Polyester construction with synthetic dyes.", confidence:"high", category:"clothing" }],
    ["columbia steens",               { floor:3, ceiling:4, substances:["polyester fleece","synthetic dyes","microplastics"], reason:"Columbia Steens Mountain Fleece — polyester fleece, no DWR treatment, no PFAS concern. Microplastic shedding concern.", confidence:"high", category:"clothing" }],
  ["columbia benton springs",       { floor:3, ceiling:4, substances:["polyester fleece","synthetic dyes","microplastics"], reason:"Columbia Benton Springs Fleece — same profile as Steens. Polyester fleece, no PFAS.", confidence:"high", category:"clothing" }],
  ["columbia pfg",                   { floor:3, ceiling:5, substances:["polyester","UPF treatment","synthetic dyes"], reason:"Columbia PFG fishing apparel — Omni-Shade UPF and Omni-Wick technology, no DWR on most PFG. PFAS-free per 2024 commitment. Mid-tier synthetic concern.", confidence:"medium", category:"clothing" }],
  ["columbia",                       { floor:3, ceiling:5, substances:["polyester","PFAS-free DWR","synthetic dyes"], reason:"Columbia Sportswear — confirmed PFAS-free across all products as of January 2025 per Better Trail independent verification. Significant score correction from historical 5-7. Still synthetic polyester construction. OutDry Extreme 2-3, fleece 3-4, waterproof 3-5.", confidence:"high", category:"clothing" }],
  ["arc'teryx beta ar",               { floor:3, ceiling:4, substances:["recycled nylon","FC0 DWR PFAS-free","microplastics"], reason:"Arc'teryx Beta AR (2025) — Gore-Tex PRO ePE membrane and FC0 DWR are both PFAS-free per Better Trail independent verification and Arc'teryx product page. Major 2025 redesign. Entire jacket free of intentionally added PFAS. Best-in-class sustainability for waterproof shells.", confidence:"high", category:"clothing" }],
  ["arc'teryx beta",                  { floor:3, ceiling:4, substances:["recycled nylon","FC0 DWR PFAS-free","ePE membrane"], reason:"Arc'teryx Beta Jacket (2024+) — Gore-Tex ePE PFAS-free membrane + FC0 PFAS-free DWR. Launched 2024 as first PFAS-free Beta. Bluesign approved materials. Benchmark clean waterproof shell.", confidence:"high", category:"clothing" }],
  ["arc'teryx atom",                  { floor:3, ceiling:5, substances:["recycled nylon","FC0 DWR PFAS-free","Coreloft insulation"], reason:"Arc'teryx Atom (2025) — updated with FC0 PFAS-free DWR in February 2025 refresh. PFAS-free across entire Atom line. Coreloft synthetic insulation is polyester-based. Still synthetic construction with microplastic concern.", confidence:"high", category:"clothing" }],
  ["arc'teryx",                      { floor:3, ceiling:6, substances:["recycled nylon","PFAS-free transitioning"], reason:"Arc'teryx brand — as of early 2025 most products with DWRs are PFAS-free per Better Trail. Beta and Atom lines fully PFAS-free. Some older or non-transitioned products may still have PFAS. Score by product: Beta/Atom 2024+ = 3-4, pre-2024 older stock = 5-7.", confidence:"high", category:"clothing" }],
  ["arcteryx",                      { floor:3, ceiling:6, substances:["recycled nylon","PFAS-free transitioning"], reason:"Arc'teryx — most products PFAS-free as of early 2025. Beta and Atom lines fully verified. Some product lines still transitioning. Score product-specific where possible.", confidence:"high", category:"clothing" }],
  ["marmot precip",                 { floor:6, ceiling:8, substances:["PFAS DWR","polyester","fluoropolymer"], reason:"Marmot PreCip — PFAS DWR water repellent treatment + polyester shell. One of the most PFAS-treated entry-level rain jackets. Floor fires.", confidence:"high", category:"clothing" }],
  ["marmot",                        { floor:5, ceiling:7, substances:["PFAS DWR","fluoropolymer"], reason:"Marmot — PFAS DWR across water-resistant product line. Committed to transition but not fully verified.", confidence:"medium", category:"clothing" }],
  ["the north face",                { floor:5, ceiling:7, substances:["PFAS DWR","polyester","fluoropolymer"], reason:"The North Face — PFAS DWR on most water-resistant outerwear. Committed to PFAS-free DWR by 2025 but transition ongoing. Gore-Tex products still use ePTFE fluoropolymer.", confidence:"medium", category:"clothing" }],
  ["north face",                    { floor:5, ceiling:7, substances:["PFAS DWR","fluoropolymer"], reason:"The North Face — PFAS DWR on water-resistant products. Transition ongoing. Floor concern on rain and waterproof products.", confidence:"medium", category:"clothing" }],
  ["rei co-op rain",                { floor:5, ceiling:7, substances:["PFAS DWR","polyester"], reason:"REI Co-op rain jacket — PFAS DWR on waterproof products. REI committed to PFAS-free by 2024 on own-brand but transition not fully verified.", confidence:"medium", category:"clothing" }],

  // ── OUTERWEAR: CLEANER TIER ───────────────────────────────────

  ["cotopaxi",                      { floor:2, ceiling:4, substances:["repurposed materials","recycled"], reason:"Cotopaxi — repurposed and recycled materials, bluesign certified fabrics, B Corp. Cleaner outdoor brand with transparent sourcing.", confidence:"high", category:"clothing" }],

  // ── EVERYDAY BASICS: CONCERN ─────────────────────────────────
  ["hanes t-shirt",                 { floor:5, ceiling:6, substances:["conventional cotton","formaldehyde finish","synthetic dyes"], reason:"Hanes — conventional cotton (pesticide-heavy) + formaldehyde-based wrinkle finish on some products + synthetic dyes. No OEKO-TEX or GOTS certification.", confidence:"medium", category:"clothing" }],
  ["gildan",                        { floor:4, ceiling:6, substances:["conventional cotton","synthetic dyes","azo dyes"], reason:"Gildan — conventional cotton + synthetic azo dyes. Some azo dyes can release carcinogenic aromatic amines. No OEKO-TEX certification on standard line.", confidence:"medium", category:"clothing" }],
  ["bella canvas",                  { floor:3, ceiling:4, substances:["conventional cotton","spandex","synthetic dyes"], reason:"Bella + Canvas — conventional cotton/spandex, no GOTS certification, Airlume combed cotton is cleaner process but still conventional.", confidence:"medium", category:"clothing" }],
  ["next level apparel",            { floor:3, ceiling:4, substances:["conventional cotton","synthetic dyes"], reason:"Next Level Apparel — conventional cotton blend, no GOTS or OEKO-TEX certification. Standard conventional basics concern.", confidence:"medium", category:"clothing" }],

  // ── EVERYDAY BASICS: CLEAN TIER ──────────────────────────────
  ["everlane",                      { floor:2, ceiling:4, substances:["conventional cotton","recycled materials"], reason:"Everlane — radical transparency in pricing and supply chain, some GOTS certified products, recycled materials. Better than Hanes/Gildan, not fully organic.", confidence:"medium", category:"clothing" }],
  ["alternative apparel",           { floor:2, ceiling:4, substances:["eco-fleece","organic cotton"], reason:"Alternative Apparel — organic cotton and eco-fleece options, no GOTS certification across the full line but cleaner than Gildan/Hanes.", confidence:"medium", category:"clothing" }],
  ["american apparel",              { floor:2, ceiling:4, substances:["conventional cotton","USA made"], reason:"American Apparel — USA made (better labor standards), conventional cotton, no GOTS certification but Made in USA manufacturing is cleaner than overseas fast fashion.", confidence:"medium", category:"clothing" }],

  // ── DENIM ────────────────────────────────────────────────────
  ["levi's",                  { floor:5, ceiling:6, substances:["conventional cotton","formaldehyde finish","synthetic indigo dye","stonewashing"], reason:"Levi's — conventional cotton (pesticide concern) + synthetic indigo dye + formaldehyde in wrinkle treatments + stone washing with pumice. Levi's has sustainability initiatives but standard denim remains high-concern.", confidence:"high", category:"clothing" }],
  ["wrangler",                { floor:5, ceiling:6, substances:["conventional cotton","formaldehyde finish","synthetic dyes","stonewashing"], reason:"Wrangler — conventional cotton + formaldehyde wrinkle-resistant finish + synthetic dyes + stone washing. No significant sustainability certifications.", confidence:"high", category:"clothing" }],
  ["lee jeans",                     { floor:5, ceiling:6, substances:["conventional cotton","formaldehyde finish","synthetic dyes"], reason:"Lee Jeans — conventional cotton + formaldehyde finish + synthetic dyes. Same concern profile as Wrangler and Levi's standard line.", confidence:"high", category:"clothing" }],
  ["madewell jeans",                { floor:3, ceiling:5, substances:["conventional cotton","synthetic indigo","stonewashing"], reason:"Madewell — conventional denim with some sustainability initiatives, cleaner finishing processes than Wrangler/Lee but still conventional cotton and synthetic dye concern.", confidence:"medium", category:"clothing" }],
  ["ag jeans",                      { floor:3, ceiling:5, substances:["conventional cotton","synthetic indigo","ozone washing"], reason:"AG Jeans — ozone washing (cleaner than stone washing) and some responsible sourcing but still conventional cotton + synthetic indigo dye.", confidence:"medium", category:"clothing" }],
  ["nudie jeans",                   { floor:2, ceiling:4, substances:["organic cotton","natural indigo"], reason:"Nudie Jeans — 100% organic cotton, Fair Trade certified, natural and low-impact dyes, free repairs for life. Benchmark cleanest mainstream denim brand.", confidence:"high", category:"clothing" }],
  ["mud jeans",                     { floor:1, ceiling:3, substances:[], reason:"Mud Jeans — GOTS certified organic cotton, lease model (circular economy), low-impact dyes, Fair Trade. Benchmark cleanest denim brand available.", confidence:"high", category:"clothing" }],

  // ── KIDS CLOTHING: FLAME RETARDANT CONCERN ────────────────────
  ["carter's",              { floor:5, ceiling:7, kidsFloor:7, kidsCeiling:9, substances:["flame retardant chemicals","conventional cotton","synthetic dyes"], reason:"Carter's treated cotton pajamas — snug-fit treated cotton uses flame retardant chemical treatments to meet federal flammability standards. FR chemicals on children's sleepwear touching skin 8-10 hours nightly is a documented concern. Look for 100% polyester or tight-fitting options which don't require FR treatment.", confidence:"high", category:"clothing" }],

  ["oshkosh",                       { floor:5, ceiling:7, substances:["conventional cotton","flame retardant","synthetic dyes"], reason:"OshKosh B'gosh — conventional cotton + FR treatments on sleepwear + synthetic dyes. Same parent company as Carter's, similar concern profile.", confidence:"medium", category:"clothing" }],
  ["gerber onesie",                 { floor:3, ceiling:5, substances:["conventional cotton","synthetic dyes"], reason:"Gerber baby onesies — conventional cotton + synthetic dyes. No GOTS certification on standard line. Better than Carter's sleepwear (no FR concern) but still conventional.", confidence:"medium", category:"clothing" }],

  // ── KIDS CLOTHING: CLEAN TIER ────────────────────────────────
  ["primary kids",              { floor:2, ceiling:4, substances:["conventional cotton","OEKO-TEX"], reason:"Primary kids clothing — OEKO-TEX Standard 100 certified, no FR chemicals, no synthetic fragrances. Better than Cat & Jack, not fully organic.", confidence:"high", category:"clothing" }],
  ["primary clothing",              { floor:2, ceiling:4, substances:["conventional cotton","OEKO-TEX"], reason:"Primary — OEKO-TEX Standard 100 certified, no FR chemicals, no synthetic fragrances, tested for harmful substances. Better than Carter's, not fully organic.", confidence:"high", category:"clothing" }],
  ["burts bees baby",               { floor:1, ceiling:3, substances:[], reason:"Burt's Bees Baby — GOTS certified organic cotton. Benchmark clean.", confidence:"high", category:"clothing" }],
  ["little planet",                 { floor:1, ceiling:3, substances:[], reason:"Little Planet (Carter's organic line) — GOTS certified organic cotton, no FR chemical treatments, no synthetic dyes. Benchmark clean despite being owned by Carter's.", confidence:"high", category:"clothing" }],
  ["hanna andersson",               { floor:2, ceiling:4, substances:["OEKO-TEX","conventional cotton"], reason:"Hanna Andersson — OEKO-TEX Standard 100 certified, snug-fit sleepwear avoids FR chemical treatments, tested for harmful substances. Swedish heritage brand with strong safety standards.", confidence:"high", category:"clothing" }],

  // ── SOCKS ────────────────────────────────────────────────────
  ["darn tough",              { floor:1, ceiling:3, substances:[], reason:"Darn Tough — merino wool + nylon blend, OEKO-TEX certified, made in Vermont USA, lifetime guarantee. Benchmark clean performance sock.", confidence:"high", category:"clothing" }],
  ["smartwool",               { floor:1, ceiling:3, substances:[], reason:"Smartwool — ZQ certified merino wool, bluesign certified, responsible wool standard. Benchmark clean merino sock.", confidence:"high", category:"clothing" }],
  ["bombas socks",                  { floor:3, ceiling:5, substances:["conventional cotton","synthetic dyes","antimicrobial"], reason:"Bombas — conventional cotton + synthetic dyes + antimicrobial treatment on some styles. BOGO charitable model but no GOTS or OEKO-TEX certification.", confidence:"medium", category:"clothing" }],
  ["nike socks",                    { floor:3, ceiling:5, substances:["conventional cotton","polyester","synthetic dyes"], reason:"Nike socks — conventional cotton/polyester blend + synthetic dyes. No OEKO-TEX certification.", confidence:"medium", category:"clothing" }],
  ["stance socks",                  { floor:3, ceiling:5, substances:["conventional cotton","nylon","synthetic dyes"], reason:"Stance — conventional cotton/nylon + synthetic dyes, no OEKO-TEX or GOTS certification.", confidence:"medium", category:"clothing" }],
  ["swiftwick socks",               { floor:3, ceiling:4, substances:["nylon","Olefin","synthetic dyes"], reason:"Swiftwick — Olefin (polypropylene) fiber + nylon synthetic construction. No OEKO-TEX certification but no antimicrobial treatment.", confidence:"medium", category:"clothing" }],
  ["balega socks",                  { floor:2, ceiling:4, substances:["mohair","nylon","conventional"], reason:"Balega — mohair/nylon blend, South African made, no antimicrobial treatment. Cleaner than pure synthetic socks.", confidence:"medium", category:"clothing" }],

  // ══════════════════════════════════════════════════════════════
  // AUDIT 41 — APPAREL: FAST FASHION, WORKWEAR, SHOES,
  //            SWIMWEAR, ACCESSORIES, SUITS
  // KEY STORIES:
  //   Shein — documented toxic chemicals above safe limits
  //   in CBC Marketplace testing 2023. Lead, PFAS, phthalates.
  //   Performance dress shirts — wrinkle-free = formaldehyde.
  //   Swimwear — chlorine resistance treatments are chemical.
  //   Fast fashion azo dyes — carcinogenic aromatic amines.
  // ══════════════════════════════════════════════════════════════

  // ── FAST FASHION: CRITICAL CONCERN ───────────────────────────
  ["shein",                          { floor:7, ceiling:9, substances:["lead","PFAS","phthalates","azo dyes","formaldehyde"], reason:"Shein — CBC Marketplace 2023 lab testing found lead levels 20x above Health Canada safe limits in childrens jackets, PFAS above safe limits in raincoats, phthalates above EU limits in accessories. Multiple critical substance floors fire. One of the highest-concern apparel brands ever tested.", confidence:"high", category:"clothing" }],
  ["fashion nova",                   { floor:6, ceiling:8, substances:["azo dyes","lead","phthalates","conventional cotton"], reason:"Fashion Nova — ultra-fast fashion with undisclosed manufacturing, no transparency on chemical testing. Similar concern profile to Shein. Lead and phthalate concern in accessories and synthetic garments.", confidence:"medium", category:"clothing" }],
  ["forever 21",                     { floor:5, ceiling:7, substances:["azo dyes","conventional cotton","synthetic dyes","PFAS finish"], reason:"Forever 21 — fast fashion with undisclosed supply chain, azo dye concern in synthetic garments, PFAS in water-resistant finishes, no chemical testing transparency.", confidence:"medium", category:"clothing" }],
  ["zara",                           { floor:5, ceiling:6, substances:["azo dyes","conventional cotton","formaldehyde finish","synthetic dyes"], reason:"Zara — fast fashion with conventional cotton + azo synthetic dyes + formaldehyde wrinkle finishes. Inditex has sustainability commitments but supply chain chemical transparency remains limited.", confidence:"medium", category:"clothing" }],
  ["h&m",                            { floor:5, ceiling:6, substances:["azo dyes","conventional cotton","synthetic dyes","PFAS"], reason:"H&M — fast fashion, conventional cotton + azo dyes + PFAS on water-resistant items. Conscious collection uses some organic cotton but greenwashing concerns documented. No blanket chemical testing.", confidence:"medium", category:"clothing" }],

  // ── MAINSTREAM: MID CONCERN ───────────────────────────────────
  ["gap t-shirt",                    { floor:5, ceiling:6, substances:["conventional cotton","synthetic dyes","formaldehyde finish"], reason:"Gap — conventional cotton + synthetic dyes + formaldehyde wrinkle treatments on some products. Gap has some sustainability initiatives but no GOTS certification on standard line.", confidence:"medium", category:"clothing" }],
  ["old navy",                       { floor:5, ceiling:6, substances:["conventional cotton","synthetic dyes","formaldehyde finish"], reason:"Old Navy — conventional cotton + synthetic dyes. Gap Inc. owned, same general concern profile as Gap standard line.", confidence:"medium", category:"clothing" }],
  ["banana republic",                { floor:5, ceiling:6, substances:["conventional cotton","formaldehyde finish","synthetic dyes"], reason:"Banana Republic — conventional cotton + formaldehyde wrinkle-resistant finishes on dress shirts + synthetic dyes. Premium price, conventional chemistry.", confidence:"medium", category:"clothing" }],
  ["j.crew",                         { floor:5, ceiling:6, substances:["conventional cotton","synthetic dyes","formaldehyde"], reason:"J.Crew — conventional cotton + formaldehyde on wrinkle-resistant products + synthetic dyes. Some organic options but no blanket certification.", confidence:"medium", category:"clothing" }],
  ["j crew",                         { floor:4, ceiling:6, substances:["conventional cotton","synthetic dyes"], reason:"J.Crew — conventional cotton + synthetic dyes. Mid-tier mainstream concern.", confidence:"medium", category:"clothing" }],
  ["uniqlo heattech",                { floor:5, ceiling:6, substances:["polyester","rayon","PFAS moisture treatment","synthetic dyes"], reason:"Uniqlo Heattech — polyester/rayon synthetic blend with moisture-management treatment (PFAS concern) + synthetic dyes. Chemical performance finish on everyday layering.", confidence:"medium", category:"clothing" }],
  ["uniqlo",                         { floor:3, ceiling:4, substances:["conventional cotton","synthetic dyes"], reason:"Uniqlo — conventional cotton basics, OEKO-TEX on some products, better supply chain transparency than Zara/H&M. Mid-tier mainstream, not a clean brand but not fast fashion level concern.", confidence:"medium", category:"clothing" }],

  // ── WORKWEAR / DRESS SHIRTS ───────────────────────────────────
  ["mizzen and main",                { floor:5, ceiling:7, substances:["polyester","PFAS moisture-wicking","formaldehyde wrinkle-free","synthetic dyes"], reason:"Mizzen and Main — polyester performance dress shirt with PFAS moisture-wicking finish + wrinkle-free formaldehyde treatment. Multiple concern ingredients in a shirt worn against skin all day.", confidence:"high", category:"clothing" }],
  ["ministry of supply",             { floor:4, ceiling:6, substances:["nylon","polyester","PFAS finish","formaldehyde wrinkle-free"], reason:"Ministry of Supply — performance fabrics with PFAS-treated finishes and formaldehyde wrinkle treatments. Bluesign certified on some fabrics but PFAS concern remains.", confidence:"medium", category:"clothing" }],
  ["brooks brothers",                { floor:4, ceiling:6, substances:["conventional cotton","formaldehyde wrinkle-free","synthetic dyes"], reason:"Brooks Brothers — conventional cotton + formaldehyde non-iron treatments on most dress shirts. All-day skin contact with formaldehyde-treated fabric is a documented concern.", confidence:"high", category:"clothing" }],
  ["charles tyrwhitt",               { floor:4, ceiling:6, substances:["conventional cotton","formaldehyde wrinkle-free","synthetic dyes"], reason:"Charles Tyrwhitt — non-iron dress shirts use formaldehyde resin treatments + conventional cotton + synthetic dyes. Popular workwear brand with chemical finish concern.", confidence:"high", category:"clothing" }],
  ["calvin klein dress",             { floor:5, ceiling:6, substances:["conventional cotton","synthetic dyes","formaldehyde finish"], reason:"Calvin Klein dress shirts — conventional cotton + formaldehyde wrinkle treatment + synthetic dyes. Standard workwear concern profile.", confidence:"medium", category:"clothing" }],
  ["bonobos",                        { floor:3, ceiling:5, substances:["conventional cotton","synthetic dyes"], reason:"Bonobos — conventional cotton, some Pima cotton options, no GOTS certification. Better than fast fashion, no significant sustainability certifications.", confidence:"medium", category:"clothing" }],
  ["proper cloth",                   { floor:3, ceiling:5, substances:["conventional cotton","synthetic dyes"], reason:"Proper Cloth — custom dress shirts, conventional cotton options, no GOTS or OEKO-TEX certification. Mid-tier concern.", confidence:"medium", category:"clothing" }],

  // ── SHOES: CONCERN ────────────────────────────────────────────
  // "nike shoes" removed 2026-04-22. Previous entry claimed PFAS
  // contamination, contradicting the verified brand-level entry at line
  // 3601 (Nike FY24 PFAS elimination confirmed by Mamavation zero-fluorine
  // testing). Entry was also dead code — the "nike" brand key at 3601
  // matched first via startsWith so "nike shoes" never fired. Nike footwear
  // is now scored via specific model entries (nike air force 1, nike air
  // max, nike cortez) or falls through to the brand default of 3-5.
  ["timberland",               { floor:4, ceiling:6, substances:["chrome-tanned leather","synthetic dyes","adhesives","DWR transition"], reason:"Timberland — committed to eliminating intentionally-added PFAS from new products by 2025 per public disclosure (VF Corp parent). Chrome-tanned conventional leather, chemical adhesives, and synthetic dyes remain. DWR transition status varies by model; older stock may still contain PFAS. No independent third-party verification of phase-out completion as of early 2026.", confidence:"medium", category:"clothing" }],
  ["dr. martens",                    { floor:5, ceiling:7, substances:["PVC Vegan leather","conventional leather","chemical adhesives","synthetic dyes"], reason:"Dr. Martens — PVC vegan options contain vinyl chloride (IARC Group 1) + chemical adhesives. Leather versions have chrome tanning concern. Chemical construction throughout.", confidence:"medium", category:"clothing" }],
  ["dr martens",                     { floor:5, ceiling:7, substances:["PVC","vinyl chloride","chemical adhesives"], reason:"Dr. Martens — PVC in vegan versions is a PFAS and vinyl chloride concern. Chrome-tanned leather in leather versions.", confidence:"medium", category:"clothing" }],

  // ── SHOES: CLEAN TIER ─────────────────────────────────────────
  ["allbirds",                       { floor:2, ceiling:4, substances:["merino wool","eucalyptus fiber","sugarcane sole"], reason:"Allbirds — natural materials (merino wool, eucalyptus Tencel, sugarcane-based sole), no PFAS, no chrome tanning, B Corp certified. Benchmark clean footwear brand.", confidence:"high", category:"clothing" }],
  ["veja sneakers",                  { floor:1, ceiling:3, substances:[], reason:"Veja — organic cotton, wild Amazonian rubber soles, no chrome tanning, fair trade certified, PFAS-free. Benchmark cleanest mainstream sneaker brand.", confidence:"high", category:"clothing" }],
  ["veja",                           { floor:1, ceiling:3, substances:[], reason:"Veja — organic cotton + wild rubber, no PFAS, fair trade. Benchmark clean sneaker.", confidence:"high", category:"clothing" }],
  ["birkenstock",                    { floor:2, ceiling:4, substances:["cork","natural rubber","vegetable tanning"], reason:"Birkenstock — cork and natural rubber footbed, vegetable-tanned leather options, no PFAS. Benchmark clean sandal. EVA versions are plastic but no chemical treatment concern.", confidence:"high", category:"clothing" }],
  ["reef",                           { floor:3, ceiling:5, substances:["EVA foam","synthetic strap","PVC-free"], reason:"Reef — EVA foam soles with synthetic straps, publicly committed to PVC-free construction across most lines. No PFAS or chrome-tanned leather. Cleaner than Crocs (Croslite phthalate concerns) but still petroleum-derived synthetic foam at foot contact. Their Water Vista line and Cushion sandals are explicitly PVC FREE per the strap stamp.", confidence:"high", category:"clothing" }],
  ["reef sandals",                   { floor:3, ceiling:5, substances:["EVA foam","synthetic strap","PVC-free"], reason:"Reef Sandals — EVA foam + PVC-free synthetic uppers. Petroleum-derived but no plasticizer concern from PVC. Mid-tier clean footwear.", confidence:"high", category:"clothing" }],
  ["reef water vista",               { floor:3, ceiling:5, substances:["EVA foam","synthetic strap","PVC-free"], reason:"Reef Water Vista — water-friendly platform sandal, PVC FREE per visible strap stamp. EVA foam midsole and platform. Petroleum-derived synthetic but no PVC plasticizers.", confidence:"high", category:"clothing" }],
  ["reef water vista higher",        { floor:3, ceiling:5, substances:["EVA foam","synthetic strap","PVC-free"], reason:"Reef Water Vista Higher — platform Water Vista variant. Same PVC-free synthetic construction. EVA foam soles, water-friendly straps. Mid-tier clean footwear.", confidence:"high", category:"clothing" }],
  ["reef cushion",                   { floor:3, ceiling:5, substances:["EVA foam","synthetic strap","PVC-free"], reason:"Reef Cushion — flip-flop line, PVC-free synthetic strap and EVA cushion footbed. Petroleum-derived but cleaner than PVC-based fast-fashion sandals.", confidence:"high", category:"clothing" }],
  ["reef fanning",                   { floor:3, ceiling:5, substances:["EVA foam","synthetic strap","PVC-free"], reason:"Reef Fanning — Mick Fanning signature flip-flop, PVC-free synthetic strap. Same construction tier as the rest of the brand line.", confidence:"high", category:"clothing" }],
  ["new balance shoes",              { floor:4, ceiling:6, substances:["synthetic foam","conventional leather","synthetic dyes"], reason:"New Balance — synthetic foam midsole + conventional materials. USA made on some models improves oversight. No significant chemical transparency.", confidence:"medium", category:"clothing" }],
  ["brooks running",                 { floor:3, ceiling:5, substances:["polyurethane foam","synthetic dyes","adhesives"], reason:"Brooks Running — polyurethane foam + synthetic dyes + chemical adhesives. No significant chemical certifications but focus on performance over fast fashion.", confidence:"medium", category:"clothing" }],
  ["hoka",                           { floor:3, ceiling:5, substances:["EVA foam","synthetic dyes","adhesives"], reason:"HOKA — EVA/PEBA foam midsole + synthetic dyes + chemical adhesives. No PFAS claim, no organic certifications.", confidence:"medium", category:"clothing" }],
  ["on running",                     { floor:3, ceiling:5, substances:["Helion foam","synthetic dyes","adhesives"], reason:"On Running — proprietary Helion superfoam + synthetic dyes + adhesives. Swiss brand, no major chemical certifications but no PFAS DWR.", confidence:"medium", category:"clothing" }],
  ["blundstone",                     { floor:5, ceiling:7, substances:["conventional leather","PVC sole","chemical adhesives"], reason:"Blundstone — conventional leather + PVC sole + chemical adhesives. Australian made, better durability than fast fashion but conventional materials concern.", confidence:"medium", category:"clothing" }],
  ["frye",                     { floor:5, ceiling:7, substances:["conventional leather","chrome tanning","chemical adhesives"], reason:"Frye — full-grain leather with conventional chrome tanning + chemical adhesives. Durable but chrome-tanned leather is an environmental and skin contact concern.", confidence:"medium", category:"clothing" }],

  // ── SWIMWEAR ──────────────────────────────────────────────────
  ["speedo fastskin",               { floor:6, ceiling:8, substances:["PFAS","polyurethane","competitive treatment"], reason:"Speedo Fastskin tech suits — competitive racing suits with PFAS treatments. Distinct from Endurance+ training suits.", confidence:"medium", category:"clothing" }],
  ["speedo endurance",               { floor:3, ceiling:5, substances:["polyester","synthetic dyes","microplastics"], reason:"Speedo Endurance+ — 100% polyester construction. Chlorine resistance through fiber structure not PFAS chemical treatment. Still synthetic microplastic concern.", confidence:"medium", category:"clothing" }],
  ["speedo",                         { floor:4, ceiling:6, substances:["nylon","polyester","synthetic dyes"], reason:"Speedo brand — Endurance+ training suits use polyester chlorine resistance (3-5). Tech/competitive suits may have PFAS treatments (6-8). No brand-wide PFAS-free claim.", confidence:"medium", category:"clothing" }],
  ["tyr tech",                      { floor:7, ceiling:9, substances:["PFAS confirmed","polyurethane","competitive treatment"], reason:"TYR tech suits — TYR website explicitly disclaims PFAS: product contains Per- and Polyfluoroalkyl Substances. Banned for sale in California and New York. Intentionally added PFAS confirmed by company itself.", confidence:"high", category:"clothing" }],
  ["tyr durafast",                   { floor:4, ceiling:5, substances:["polyester","synthetic dyes","chlorine resistant"], reason:"TYR Durafast Elite — 100% polyester training suit. Polyester-based chlorine resistance, not PFAS-based DWR. Lower concern than TYR tech/competitive suits.", confidence:"medium", category:"clothing" }],
  ["tyr",                            { floor:5, ceiling:7, substances:["polyester","PFAS on tech suits","synthetic dyes"], reason:"TYR brand — Durafast training suits 4-5. Tech/competitive suits confirmed PFAS by company (7-9). No brand-wide PFAS-free claim.", confidence:"high", category:"clothing" }],
  ["summersalt",                     { floor:3, ceiling:5, substances:["recycled nylon","spandex","synthetic dyes"], reason:"Summersalt — recycled nylon from fishing nets, no explicit PFAS-free claim, no chlorine-resistant treatment. Cleaner than Speedo/TYR, mid-tier clean swimwear.", confidence:"medium", category:"clothing" }],
  ["andie swimwear",                 { floor:3, ceiling:5, substances:["nylon","spandex","synthetic dyes"], reason:"Andie — Italian nylon/spandex, no chlorine-resistant PFAS treatment claimed, no OEKO-TEX certification. Mid-tier swim concern.", confidence:"medium", category:"clothing" }],
  ["seea swimwear",                  { floor:2, ceiling:4, substances:["recycled nylon","spandex"], reason:"Seea — recycled nylon, UPF 50+ without chemical treatments, designed for surf. Cleaner swimwear option with recycled content.", confidence:"medium", category:"clothing" }],
    ["patagonia nanogrip",            { floor:1, ceiling:3, substances:[], reason:"Patagonia Nanogrip swimsuit — made without PFAS per Patagonia explicit claim. Benchmark clean swimwear.", confidence:"high", category:"clothing" }],
  ["patagonia swimsuit",            { floor:1, ceiling:3, substances:[], reason:"Patagonia swimsuit — PFAS-free commitment across swimwear line. Benchmark clean.", confidence:"high", category:"clothing" }],
  ["patagonia one piece",           { floor:1, ceiling:3, substances:[], reason:"Patagonia one piece swimwear — PFAS-free. Benchmark clean.", confidence:"high", category:"clothing" }],
  ["patagonia swimwear",             { floor:1, ceiling:3, substances:[], reason:"Patagonia swimwear — PFAS-free across swim line. Benchmark clean.", confidence:"high", category:"clothing" }],
  ["patagonia womens swimsuit",      { floor:1, ceiling:3, substances:[], reason:"Patagonia swimsuit — PFAS-free. Benchmark clean.", confidence:"high", category:"clothing" }],
  ["patagonia womens swim",          { floor:1, ceiling:3, substances:[], reason:"Patagonia womens swim — PFAS-free.", confidence:"high", category:"clothing" }],
  ["patagonia swim",             { floor:1, ceiling:3, substances:[], reason:"Patagonia swimwear — recycled nylon/polyester, PFAS-free finish commitment, Fair Trade certified. Benchmark cleanest mainstream swimwear.", confidence:"high", category:"clothing" }],

  // ── ACCESSORIES AND BAGS ──────────────────────────────────────
  ["carhartt beanie",                { floor:4, ceiling:6, substances:["acrylic","synthetic dyes"], reason:"Carhartt beanie — acrylic synthetic fiber + synthetic dyes. Acrylic is petroleum-derived and sheds microplastics. No OEKO-TEX certification.", confidence:"medium", category:"clothing" }],
  ["columbia pfg hat",               { floor:5, ceiling:6, substances:["polyester","PFAS finish","synthetic dyes"], reason:"Columbia PFG hat — polyester + PFAS UV/moisture treatment + synthetic dyes. Columbia performance accessories carry PFAS concern.", confidence:"medium", category:"clothing" }],
  ["patagonia hat",                  { floor:2, ceiling:3, substances:[], reason:"Patagonia hats — recycled materials, Fair Trade certified, PFAS-free commitment. Benchmark clean outdoor accessory.", confidence:"high", category:"clothing" }],

  ["tumi",                  { floor:5, ceiling:6, substances:["ballistic nylon","PFAS DWR","polyester lining"], reason:"Tumi — ballistic nylon with PFAS DWR water-resistant treatment + polyester lining. Premium price, PFAS concern on water-resistant finishes.", confidence:"medium", category:"clothing" }],

  // ── SUITS ─────────────────────────────────────────────────────
  ["suitsupply",                     { floor:5, ceiling:6, substances:["wool blend","formaldehyde finish","synthetic lining","conventional wool"], reason:"Suit Supply — conventional wool/polyester blend + formaldehyde wrinkle finish + synthetic polyester lining. No sustainable certification. Popular affordable suit brand with conventional chemical profile.", confidence:"medium", category:"clothing" }],
  ["suit supply",                    { floor:5, ceiling:6, substances:["wool blend","formaldehyde","synthetic lining"], reason:"Suit Supply — same conventional concern as above.", confidence:"medium", category:"clothing" }],
  ["indochino",                      { floor:5, ceiling:6, substances:["wool blend","polyester","formaldehyde finish","synthetic dyes"], reason:"Indochino — made-to-measure suits with conventional wool/polyester + formaldehyde wrinkle treatments + synthetic linings. Custom fit but conventional chemical profile.", confidence:"medium", category:"clothing" }],

  // ══════════════════════════════════════════════════════════════
  // AUDIT 42 — RETAIL BRANDS (TARGET, WALMART, NORDSTROM,
  //            MACYS) + VIRAL BRANDS + INTIMATES
  // KEY STORIES:
  //   Skims — Kim K shapewear, nylon/spandex PFAS concern,
  //   no chemical certifications on a skin-tight daily garment.
  //   Canada Goose — coyote fur trim + down fill controversy +
  //   PFAS DWR on shell.
  //   Stanley already anchored at 5-7 (lead + PFAS).
  //   Store brand fast fashion — worst chemical transparency.
  // ══════════════════════════════════════════════════════════════

  // ── TARGET OWNED BRANDS ───────────────────────────────────────
  ["wild fable",                     { floor:5, ceiling:7, substances:["conventional cotton","polyester","azo dyes","PFAS finish"], reason:"Wild Fable (Target) — fast fashion Target brand, conventional cotton + azo dyes + PFAS on water-resistant items. No supply chain transparency or chemical certifications.", confidence:"medium", category:"clothing" }],
  ["universal thread",               { floor:5, ceiling:6, substances:["conventional cotton","synthetic dyes","formaldehyde finish"], reason:"Universal Thread (Target) — conventional denim + formaldehyde wrinkle treatments + synthetic dyes. Target denim house brand, no sustainability certifications.", confidence:"medium", category:"clothing" }],
  ["a new day",                      { floor:4, ceiling:6, substances:["conventional cotton","polyester","synthetic dyes","azo dyes"], reason:"A New Day (Target) — fast fashion house brand, conventional cotton/polyester + azo synthetic dyes. No chemical certifications.", confidence:"medium", category:"clothing" }],
  ["goodfellow",                     { floor:4, ceiling:5, substances:["conventional cotton","synthetic dyes"], reason:"Goodfellow & Co (Target men's) — conventional cotton + synthetic dyes. No certifications. Standard Target house brand concern.", confidence:"medium", category:"clothing" }],
  ["cat and jack",                   { floor:4, ceiling:6, substances:["conventional cotton","synthetic dyes","flame retardant"], reason:"Cat & Jack (Target kids) — conventional cotton + synthetic dyes + flame retardant on sleepwear. Target's top-selling kids brand with no GOTS certification.", confidence:"medium", category:"clothing" }],
  ["cat jack",                       { floor:4, ceiling:6, substances:["conventional cotton","synthetic dyes","flame retardant"], reason:"Cat & Jack — FR treatments on sleepwear + conventional cotton + synthetic dyes. Same concern as Carter's.", confidence:"medium", category:"clothing" }],
  ["art class target",               { floor:4, ceiling:6, substances:["conventional cotton","synthetic dyes","azo dyes"], reason:"Art Class (Target tweens) — conventional fast fashion for children, no chemical certifications, synthetic dyes.", confidence:"medium", category:"clothing" }],

  // ── WALMART BRANDS ────────────────────────────────────────────
  ["no boundaries",          { floor:5, ceiling:7, substances:["conventional cotton","polyester","azo dyes","PFAS finish"], reason:"No Boundaries (Walmart teen) — Walmart fast fashion house brand, lowest price point means least chemical transparency. Conventional materials + azo dyes + no certifications. Higher concern than Target equivalents.", confidence:"medium", category:"clothing" }],
  ["time and tru",                   { floor:4, ceiling:6, substances:["conventional cotton","polyester","synthetic dyes"], reason:"Time and Tru (Walmart women's) — Walmart house brand, conventional cotton/polyester + synthetic dyes. No chemical certifications.", confidence:"medium", category:"clothing" }],
  ["george clothing",                { floor:4, ceiling:6, substances:["conventional cotton","synthetic dyes","polyester"], reason:"George (Walmart) — UK-origin Walmart brand, conventional materials, no chemical certifications.", confidence:"medium", category:"clothing" }],
  ["athletic works",                 { floor:5, ceiling:6, substances:["polyester","synthetic dyes","PFAS moisture-wicking"], reason:"Athletic Works (Walmart activewear) — polyester activewear with PFAS moisture treatments. Walmart's value activewear brand, no certifications.", confidence:"medium", category:"clothing" }],
  ["wonder nation",                  { floor:4, ceiling:6, kidsFloor:6, kidsCeiling:8, substances:["conventional cotton","synthetic dyes","flame retardant"], reason:"Wonder Nation (Walmart kids) — conventional cotton + FR on sleepwear + synthetic dyes. Same FR concern as Carter's and Cat & Jack.", confidence:"medium", category:"clothing" }],

  // ── NORDSTROM BRANDS ──────────────────────────────────────────
  ["halogen nordstrom",              { floor:5, ceiling:6, substances:["conventional cotton","synthetic dyes","formaldehyde"], reason:"Halogen (Nordstrom women's) — conventional materials + formaldehyde on wrinkle-resistant items. Nordstrom house brand, better transparency than Walmart but no GOTS certification.", confidence:"medium", category:"clothing" }],
  ["treasure bond",                  { floor:3, ceiling:5, substances:["conventional cotton","synthetic dyes"], reason:"Treasure & Bond (Nordstrom) — conventional cotton + synthetic dyes. No OEKO-TEX or GOTS certification despite higher price point.", confidence:"medium", category:"clothing" }],
  ["tucker tate",                    { floor:3, ceiling:5, substances:["conventional cotton","synthetic dyes"], reason:"Tucker + Tate (Nordstrom kids) — conventional cotton + synthetic dyes. Better quality than Walmart kids brands but no clean certifications.", confidence:"medium", category:"clothing" }],

  // ── MACY'S BRANDS ─────────────────────────────────────────────
  ["style co macy",                  { floor:5, ceiling:6, substances:["conventional cotton","synthetic dyes","formaldehyde"], reason:"Style Co (Macy's) — conventional cotton + formaldehyde wrinkle treatments + synthetic dyes. Macy's house brand, no certifications.", confidence:"medium", category:"clothing" }],
  ["charter club",                   { floor:3, ceiling:5, substances:["conventional cotton","cashmere blend","synthetic dyes"], reason:"Charter Club (Macy's) — conventional cotton/cashmere blends + synthetic dyes. Premium positioning but no sustainable certifications.", confidence:"medium", category:"clothing" }],
  ["inc international",              { floor:4, ceiling:6, substances:["conventional cotton","polyester","synthetic dyes","azo dyes"], reason:"INC International Concepts (Macy's) — conventional fast fashion fabrics + azo synthetic dyes. No certifications.", confidence:"medium", category:"clothing" }],
  ["alfani",                         { floor:5, ceiling:6, substances:["conventional cotton","formaldehyde","synthetic dyes"], reason:"Alfani (Macy's men's) — conventional cotton + formaldehyde wrinkle-free finishes on dress shirts + synthetic dyes.", confidence:"medium", category:"clothing" }],

  // ── VIRAL BRANDS ──────────────────────────────────────────────
  ["skims shapewear",                { floor:5, ceiling:7, substances:["nylon","spandex","PFAS finish","synthetic dyes"], reason:"Skims shapewear — high-compression nylon/spandex with PFAS-treated finishes, no OEKO-TEX certification, no chemical transparency. Worn skin-tight against the body all day. Kim Kardashian brand with zero published chemical testing.", confidence:"medium", category:"clothing" }],
  ["skims bodysuit",                 { floor:5, ceiling:7, substances:["nylon","spandex","PFAS finish"], reason:"Skims — same nylon/spandex PFAS concern as shapewear. No certifications on any Skims products.", confidence:"medium", category:"clothing" }],
  ["skims",                          { floor:5, ceiling:7, substances:["nylon","spandex","PFAS finish","synthetic dyes"], reason:"Skims brand — nylon/spandex construction + PFAS-treated finishes + synthetic dyes. No OEKO-TEX, no GOTS, no bluesign. Skin-tight daily wear with no chemical transparency. Floor 5 minimum.", confidence:"medium", category:"clothing" }],
  ["crocs",                          { floor:5, ceiling:7, substances:["Croslite foam","synthetic polymer","phthalates"], reason:"Crocs — made from Croslite, a proprietary closed-cell resin. Crocs tested positive for phthalates above EU limits in some independent tests. Synthetic polymer in direct daily foot contact.", confidence:"medium", category:"clothing" }],
  ["ugg boots",                      { floor:5, ceiling:6, substances:["conventional sheepskin","PFAS DWR","synthetic dyes"], reason:"UGG — conventional sheepskin + PFAS DWR water repellent treatment on most styles + synthetic dyes. No PFAS-free certification, no sustainable wool sourcing certification.", confidence:"medium", category:"clothing" }],
  ["ugg classic",                    { floor:5, ceiling:6, substances:["conventional sheepskin","PFAS DWR"], reason:"UGG Classic — PFAS DWR + conventional sheepskin. PFAS floor concern.", confidence:"medium", category:"clothing" }],
  ["hey dude shoes",                 { floor:4, ceiling:5, substances:["synthetic textile upper","EVA sole","synthetic dyes"], reason:"Hey Dude — synthetic textile upper + EVA sole + synthetic dyes. No chemical certifications. Lightweight but fully synthetic construction.", confidence:"medium", category:"clothing" }],
  ["skechers",                       { floor:4, ceiling:6, substances:["synthetic upper","memory foam","synthetic dyes","adhesives"], reason:"Skechers — synthetic textile/faux leather + memory foam (polyurethane) + chemical adhesives + synthetic dyes. No chemical certifications.", confidence:"medium", category:"clothing" }],
  ["sorel boots",                    { floor:5, ceiling:6, substances:["PFAS DWR","conventional leather","rubber sole","synthetic dyes"], reason:"Sorel — PFAS DWR water-resistant treatment + conventional leather + synthetic dyes. Winter boot with PFAS treatment concern.", confidence:"medium", category:"clothing" }],
  ["canada goose",                   { floor:6, ceiling:8, substances:["PFAS DWR","coyote fur","down fill","nylon shell"], reason:"Canada Goose — PFAS DWR nylon shell + coyote fur trim (animal welfare + potential PFAS from trapping) + down fill. Multiple concern layers. PFAS DWR floor fires. Premium price point, multiple documented chemical and ethical concerns.", confidence:"high", category:"clothing" }],
  ["moncler",                 { floor:6, ceiling:8, substances:["PFAS DWR","down fill","nylon shell","synthetic dyes"], reason:"Moncler — PFAS DWR nylon shell + down fill + synthetic dyes. ,000+ jacket with same PFAS concern as Columbia. No PFAS-free certification.", confidence:"high", category:"clothing" }],
  ["ralph lauren polo",              { floor:5, ceiling:6, substances:["conventional cotton","synthetic dyes","formaldehyde"], reason:"Ralph Lauren Polo shirt — conventional cotton + synthetic dyes + formaldehyde wrinkle treatments. Classic American brand, no sustainable certifications on standard polo line.", confidence:"medium", category:"clothing" }],
  ["ralph lauren",                   { floor:4, ceiling:5, substances:["conventional cotton","synthetic dyes"], reason:"Ralph Lauren — conventional cotton + synthetic dyes across most products. No GOTS or OEKO-TEX on standard line.", confidence:"medium", category:"clothing" }],
  ["lacoste polo",                   { floor:4, ceiling:5, substances:["conventional cotton","synthetic dyes","polyester blend"], reason:"Lacoste — conventional cotton/polyester blend + synthetic dyes. French brand with no significant chemical certifications on standard line.", confidence:"medium", category:"clothing" }],
  ["lacoste",                        { floor:4, ceiling:5, substances:["conventional cotton","synthetic dyes"], reason:"Lacoste — conventional cotton + synthetic dyes. Mid-tier mainstream concern.", confidence:"medium", category:"clothing" }],
  ["champion hoodie",                { floor:3, ceiling:5, substances:["conventional cotton","polyester","synthetic dyes"], reason:"Champion — conventional cotton/polyester fleece + synthetic dyes. Better than fast fashion (durable, classic), no chemical certifications but not PFAS-treated activewear.", confidence:"medium", category:"clothing" }],
  ["champion",                       { floor:3, ceiling:5, substances:["conventional cotton","polyester","synthetic dyes"], reason:"Champion brand — conventional cotton/polyester + synthetic dyes. Mid-tier mainstream athletic brand.", confidence:"medium", category:"clothing" }],
  ["carhartt wip",                   { floor:5, ceiling:6, substances:["conventional cotton","PFAS finish","synthetic dyes"], reason:"Carhartt WIP — conventional cotton + PFAS water-resistant treatments on work-wear styles + synthetic dyes. Urban streetwear positioning but workwear chemical concern remains.", confidence:"medium", category:"clothing" }],
  ["dickies",                        { floor:5, ceiling:6, substances:["conventional cotton","polyester","synthetic dyes","formaldehyde"], reason:"Dickies — conventional cotton/polyester workwear + formaldehyde wrinkle-resistant finishes on some styles + synthetic dyes. No chemical certifications.", confidence:"medium", category:"clothing" }],
  ["columbia fleece",                { floor:3, ceiling:5, substances:["polyester recycled","synthetic dyes"], reason:"Columbia fleece — recycled polyester fleece, no PFAS on fleece (PFAS concern is on shell/rain products). Better than rain jacket category. Mid-tier clean for Columbia.", confidence:"high", category:"clothing" }],

  // ── INTIMATES ────────────────────────────────────────────────
  ["savage x fenty",                 { floor:4, ceiling:6, substances:["nylon","spandex","synthetic dyes","lace"], reason:"Savage X Fenty — nylon/spandex + synthetic dyes + nylon lace. No OEKO-TEX certification. Rihanna brand with no chemical transparency on intimate apparel.", confidence:"medium", category:"clothing" }],
  ["soma bra",                       { floor:3, ceiling:5, substances:["nylon","spandex","synthetic dyes"], reason:"Soma — nylon/spandex construction + synthetic dyes. No OEKO-TEX certification. Mid-tier intimate apparel concern.", confidence:"medium", category:"clothing" }],
  ["chantelle bra",                  { floor:3, ceiling:5, substances:["nylon","spandex","synthetic dyes"], reason:"Chantelle — French brand, nylon/spandex + synthetic dyes. Better quality construction but no chemical certifications.", confidence:"medium", category:"clothing" }],
  ["wacoal bra",                     { floor:3, ceiling:5, substances:["nylon","spandex","synthetic dyes"], reason:"Wacoal — Japanese brand, nylon/spandex + synthetic dyes. OEKO-TEX on some products. Mid-tier intimate apparel.", confidence:"medium", category:"clothing" }],

  // ══════════════════════════════════════════════════════════════
  // AUDIT 43 — PREMIUM ACTIVEWEAR, CASUAL, OUTERWEAR,
  //            ON RUNNING, FOOTWEAR, LUXURY
  // KEY STORIES:
  //   Alo Yoga — Mamavation 2022 found ZERO detectable PFAS.
  //   Cleaner than Lululemon on PFAS but no certifications.
  //   Vuori — 23ppm fluorine in Elevation leggings (Mamavation).
  //   63% Bluesign + OEKO-TEX 100, but DWR items still concern.
  //   Fjallraven — one of first outdoor brands to commit to
  //   full PFAS-free across entire line. Benchmark clean.
  //   On Running — Swiss performance brand, cleaner than Nike
  //   but still synthetic construction.
  // ══════════════════════════════════════════════════════════════

  // ── VUORI — PRODUCT-LEVEL (Mamavation lab + certification data) ──
  ["vuori elevation",                { floor:5, ceiling:6, substances:["nylon","elastane","PFAS indicator 23ppm"], reason:"Vuori Elevation Performance Legging — Mamavation EPA-certified lab testing found 23ppm organic fluorine (PFAS indicator) in crotch area. Vuori acknowledged traces of PFAS are common in water-repellent applications and only tests against older-gen PFAS bans. Lab-confirmed concern.", confidence:"high", category:"clothing" }],
  ["vuori ripstop",                  { floor:5, ceiling:7, substances:["DWR PFAS","nylon","elastane"], reason:"Vuori Ripstop (DuraTerra fabric) — DWR water-repellent finish confirmed on product page. DWR is the primary PFAS vector in activewear. Vuori acknowledges PFAS traces are common in repellent applications. Floor 5 until DWR verified fluorine-free.", confidence:"high", category:"clothing" }],
  ["vuori duraterra",                { floor:5, ceiling:7, substances:["DWR PFAS","nylon","elastane"], reason:"Vuori DuraTerra — ripstop nylon with DWR water-repellent finish. Same DWR PFAS concern as Vuori Ripstop.", confidence:"high", category:"clothing" }],
  ["vuori ponto",                    { floor:2, ceiling:4, substances:["recycled polyester","elastane","synthetic dyes"], reason:"Vuori Ponto Performance Jogger — DreamKnit fabric: 89% recycled polyester, 11% elastane. No DWR, no antimicrobial. Bluesign certified. OEKO-TEX Standard 100 certified. The 23ppm PFAS finding was in Elevation leggings, not Ponto. Clean studio/lounge tier.", confidence:"high", category:"clothing" }],
  ["vuori performance jogger",       { floor:2, ceiling:4, substances:["recycled polyester","elastane"], reason:"Vuori Performance Jogger — DreamKnit: 89% recycled polyester, 11% elastane. No DWR, Bluesign + OEKO-TEX Standard 100 certified. Clean activewear.", confidence:"high", category:"clothing" }],
  ["vuori dreamknit",                { floor:2, ceiling:4, substances:["recycled polyester","elastane"], reason:"Vuori DreamKnit fabric — 89% recycled polyester, 11% elastane. Ultra-soft brushed jersey knit, no DWR treatment. Bluesign + OEKO-TEX Standard 100 certified. Cleanest Vuori fabric line.", confidence:"high", category:"clothing" }],
  ["vuori sunday performance",       { floor:3, ceiling:4, substances:["recycled polyester","elastane","synthetic dyes"], reason:"Vuori Sunday Performance Jogger — soft lounge jogger, no DWR, no antimicrobial. Part of Vuori's clean studio tier. Bluesign eligible.", confidence:"medium", category:"clothing" }],
  ["vuori kore",                     { floor:3, ceiling:5, substances:["nylon","elastane","synthetic dyes"], reason:"Vuori Kore Short — nylon/elastane running short. No DWR on standard running shorts. Synthetic microfiber shedding concern but no PFAS vector.", confidence:"medium", category:"clothing" }],
  ["vuori strato tech",              { floor:3, ceiling:4, substances:["recycled polyester","elastane","synthetic dyes"], reason:"Vuori Strato Tech Tee — recycled polyester training tee, no DWR, no antimicrobial. Bluesign eligible. Clean performance tee.", confidence:"medium", category:"clothing" }],
  ["vuori halo",                     { floor:3, ceiling:4, substances:["recycled polyester","elastane"], reason:"Vuori Halo Performance Hoodie — recycled polyester, no DWR, no antimicrobial. Bluesign eligible. Clean performance hoodie.", confidence:"medium", category:"clothing" }],
  ["vuori daily legging",            { floor:3, ceiling:5, substances:["nylon","elastane","synthetic dyes"], reason:"Vuori Daily Legging — nylon/elastane. Not the Elevation legging that tested 23ppm. No DWR. But nylon base fabric carries synthetic microfiber concern. OEKO-TEX Standard 100 certified.", confidence:"medium", category:"clothing" }],
  ["vuori jogger",                   { floor:2, ceiling:4, substances:["recycled polyester","elastane"], reason:"Vuori Jogger — likely DreamKnit fabric (89% recycled polyester, 11% elastane). No DWR. Bluesign + OEKO-TEX certified. Clean studio tier.", confidence:"medium", category:"clothing" }],
  ["vuori",                          { floor:3, ceiling:6, substances:["recycled polyester","DWR on some items","synthetic dyes"], reason:"Vuori brand — varies significantly by product line. DreamKnit studio/lounge (Ponto, joggers) score 2-4: recycled polyester, Bluesign + OEKO-TEX Standard 100 certified, no DWR. DWR water-resistant products (Ripstop, DuraTerra, Elevation) score 5-7: Mamavation found 23ppm fluorine in Elevation legging. Vuori acknowledged PFAS traces common in repellent applications. 63% Bluesign certified, fully OEKO-TEX Standard 100.", confidence:"high", category:"clothing" }],

  // ── ALO YOGA — PRODUCT-LEVEL (Mamavation lab verified PFAS-free) ──
  ["alo airbrush",                   { floor:3, ceiling:5, substances:["nylon","spandex","synthetic dyes"], reason:"Alo Yoga Airbrush — 87% nylon/polyester, 13% spandex. High compression, thick fabric. Mamavation EPA-certified lab found ZERO detectable organic fluorine (below 10ppm). No PFAS detected. No OEKO-TEX or Bluesign certification but PFAS concern not lab-confirmed.", confidence:"high", category:"clothing" }],
  ["alo airlift",                    { floor:3, ceiling:5, substances:["polyester","elastane","synthetic dyes"], reason:"Alo Yoga Airlift — 82% polyester, 18% elastane. Ultralightweight double-knit, compressive second-skin fit. No DWR, no antimicrobial. Alo tested PFAS-free by Mamavation. Synthetic microfiber shedding remains concern. No certifications.", confidence:"medium", category:"clothing" }],
  ["alo alosoft",                    { floor:3, ceiling:5, substances:["nylon","spandex","synthetic dyes"], reason:"Alo Yoga Alosoft — velvety brushed performance fabric. Nylon/spandex blend. No DWR, no antimicrobial. Mamavation tested Alo PFAS-free. Synthetic microfiber concern only. No certifications.", confidence:"medium", category:"clothing" }],
  ["alo vapor",                      { floor:3, ceiling:5, substances:["nylon","spandex","synthetic dyes"], reason:"Alo Yoga Vapor — quick-dry breathable performance fabric. Nylon/spandex. Quick-dry achieved through fabric structure not chemical finish. Mamavation tested Alo PFAS-free. No certifications.", confidence:"medium", category:"clothing" }],
  ["alo accolade",                   { floor:3, ceiling:4, substances:["cotton","modal","polyester","synthetic dyes"], reason:"Alo Yoga Accolade Hoodie — cotton/modal/polyester blend oversized hoodie. No DWR, no PFAS vector on cotton/modal. Mamavation tested Alo PFAS-free. Lower synthetic content than performance leggings. No certifications.", confidence:"medium", category:"clothing" }],
  ["alo muse",                       { floor:3, ceiling:5, substances:["nylon","spandex","synthetic dyes"], reason:"Alo Yoga Muse — ribbed legging, nylon/spandex. No DWR. Mamavation tested Alo PFAS-free. Synthetic microfiber shedding concern. No certifications.", confidence:"medium", category:"clothing" }],
  ["alo high waist",                 { floor:3, ceiling:5, substances:["nylon","spandex","synthetic dyes"], reason:"Alo Yoga High-Waist legging — nylon/spandex. Mamavation EPA-certified lab tested Alo High-Waist Alosoft Flow Legging: ZERO detectable organic fluorine. PFAS-free verified. Synthetic only concern.", confidence:"high", category:"clothing" }],
  ["alo legging",                    { floor:3, ceiling:5, substances:["nylon","spandex","synthetic dyes"], reason:"Alo Yoga legging — nylon/spandex construction. Mamavation lab found no detectable PFAS. Synthetic microfiber shedding is the main concern. No OEKO-TEX or Bluesign.", confidence:"high", category:"clothing" }],
  ["alo hoodie",                     { floor:3, ceiling:4, substances:["cotton","modal","polyester"], reason:"Alo Yoga hoodie — cotton/modal/polyester oversized styles. No DWR, no PFAS vector. Cleaner than performance leggings.", confidence:"medium", category:"clothing" }],
  ["alo yoga",                       { floor:3, ceiling:5, substances:["nylon","spandex","synthetic dyes"], reason:"Alo Yoga brand — LA-based premium activewear. Mamavation 2022 EPA-certified lab testing found ZERO detectable organic fluorine in Alo leggings. PFAS-free verified by independent lab. Main concern: nylon/spandex synthetic microfiber shedding. No OEKO-TEX, no Bluesign, no GOTS certification. Score by product: performance leggings 3-5, cotton/modal hoodies 3-4.", confidence:"high", category:"clothing" }],
  ["alo",                            { floor:3, ceiling:5, substances:["nylon","spandex","synthetic dyes"], reason:"Alo Yoga — Mamavation lab verified PFAS-free. Synthetic nylon/spandex construction, no certifications. Cleaner than Lululemon on PFAS but missing Bluesign/OEKO-TEX that Vuori has.", confidence:"high", category:"clothing" }],
  ["rhone",                          { floor:5, ceiling:6, substances:["polyester","nylon","PFAS moisture-wicking","synthetic dyes"], reason:"Rhone — polyester/nylon men's activewear with moisture-wicking PFAS treatments. No OEKO-TEX or bluesign certification. Premium DTC activewear with conventional chemical profile.", confidence:"medium", category:"clothing" }],
  ["ten thousand apparel",           { floor:3, ceiling:5, substances:["polyester","spandex","synthetic dyes"], reason:"Ten Thousand — polyester/spandex performance shorts, no PFAS-free claim, no certifications. Mid-tier men's activewear concern.", confidence:"medium", category:"clothing" }],
  ["reigning champ",                 { floor:3, ceiling:5, substances:["cotton fleece","conventional cotton","synthetic dyes"], reason:"Reigning Champ — heavyweight cotton fleece, conventional cotton + synthetic dyes. No GOTS certification but heavier fabric construction reduces some chemical treatment opportunity.", confidence:"medium", category:"clothing" }],
  ["cuts",                  { floor:5, ceiling:6, substances:["polyester","nylon","PFAS finish","synthetic dyes"], reason:"Cuts — polyester/nylon blend shirts with moisture-wicking PFAS finish. No certifications. Premium DTC shirt brand with conventional performance chemistry.", confidence:"medium", category:"clothing" }],
  ["public rec",                     { floor:3, ceiling:5, substances:["nylon","polyester","synthetic dyes"], reason:"Public Rec — nylon/polyester stretch pants, no bluesign or OEKO-TEX certification, no PFAS-free claim. Mid-tier clean DTC activewear.", confidence:"medium", category:"clothing" }],
  ["tracksmith",                     { floor:3, ceiling:5, substances:["recycled polyester","nylon","synthetic dyes"], reason:"Tracksmith — running apparel, some recycled content, no PFAS-free certification across full line. Mid-tier clean performance brand.", confidence:"medium", category:"clothing" }],
  ["rabbit running",                 { floor:2, ceiling:4, substances:["recycled polyester","spandex"], reason:"Rabbit — recycled polyester running apparel, bluesign certified on some fabrics, B Corp certified. Cleaner than most running brands.", confidence:"medium", category:"clothing" }],

  // ── PREMIUM CASUAL ────────────────────────────────────────────
  ["rag and bone",                   { floor:5, ceiling:6, substances:["conventional cotton","synthetic dyes","formaldehyde finish"], reason:"Rag and Bone — conventional cotton + formaldehyde wrinkle treatments on some products + synthetic dyes. Premium NYC brand, no GOTS or OEKO-TEX certification.", confidence:"medium", category:"clothing" }],
  ["theory",                { floor:5, ceiling:6, substances:["conventional cotton","synthetic dyes","formaldehyde"], reason:"Theory — conventional cotton/wool blends + formaldehyde wrinkle-resistant treatments + synthetic dyes. Premium minimalist brand, no chemical certifications.", confidence:"medium", category:"clothing" }],
  ["vince clothing",                 { floor:3, ceiling:5, substances:["conventional cotton","cashmere","synthetic dyes"], reason:"Vince — conventional cotton and cashmere basics + synthetic dyes. No GOTS certification despite premium positioning.", confidence:"medium", category:"clothing" }],
  ["frame le",                  { floor:5, ceiling:6, substances:["conventional cotton","synthetic indigo","formaldehyde"], reason:"Frame Denim — premium LA denim with conventional chemical concern profile.", confidence:"medium", category:"clothing" }],
  ["frame ali",                  { floor:5, ceiling:6, substances:["conventional cotton","synthetic indigo","formaldehyde"], reason:"Frame Denim — conventional denim concern.", confidence:"medium", category:"clothing" }],
  ["frame denim",               { floor:5, ceiling:6, substances:["conventional cotton","synthetic indigo","formaldehyde","elastane"], reason:"Frame Denim — premium LA denim, conventional cotton + synthetic indigo + formaldehyde wrinkle treatment + elastane.", confidence:"medium", category:"clothing" }],
  ["frame jeans",               { floor:5, ceiling:6, substances:["conventional cotton","synthetic indigo","formaldehyde","elastane"], reason:"Frame Denim — conventional denim concern.", confidence:"medium", category:"clothing" }],
  ["frame denim jeans",                    { floor:5, ceiling:6, substances:["conventional cotton","synthetic indigo","formaldehyde","elastane"], reason:"Frame Denim — conventional cotton + synthetic indigo + formaldehyde finish + elastane. Premium LA denim brand with conventional chemistry.", confidence:"medium", category:"clothing" }],
  ["citizens of humanity",           { floor:4, ceiling:5, substances:["conventional cotton","synthetic indigo","elastane"], reason:"Citizens of Humanity — conventional denim, some organic cotton styles but not across full line. Better than Levi's mass market, not as clean as Nudie or Mud Jeans.", confidence:"medium", category:"clothing" }],
  ["7 for all mankind",              { floor:5, ceiling:6, substances:["conventional cotton","synthetic indigo","formaldehyde","elastane"], reason:"7 For All Mankind — conventional denim + formaldehyde wrinkle treatments + synthetic indigo + elastane. Premium denim with conventional chemical concern.", confidence:"medium", category:"clothing" }],
  ["true religion",            { floor:4, ceiling:6, substances:["conventional cotton","synthetic dyes","heavy stone washing"], reason:"True Religion — conventional cotton + heavy stone washing process + synthetic dyes. Known for intensive denim treatments that add chemical concern.", confidence:"medium", category:"clothing" }],
  ["faherty brand",                  { floor:1, ceiling:3, substances:[], reason:"Faherty — organic cotton, recycled materials, B Corp certified, transparent sourcing. One of the cleanest mainstream casual clothing brands available.", confidence:"high", category:"clothing" }],
  ["faherty",                        { floor:1, ceiling:3, substances:[], reason:"Faherty — B Corp, organic cotton, recycled materials. Benchmark clean casual brand.", confidence:"high", category:"clothing" }],
  ["outerknown",                     { floor:1, ceiling:3, substances:[], reason:"Outerknown (Kelly Slater brand) — GOTS certified organic cotton, Fair Trade certified, bluesign certified fabrics. Benchmark clean surf-inspired clothing brand.", confidence:"high", category:"clothing" }],

  // ── PREMIUM OUTERWEAR ─────────────────────────────────────────
  ["mackage",                   { floor:5, ceiling:7, substances:["PFAS DWR","down fill","nylon shell","synthetic dyes"], reason:"Mackage — PFAS DWR nylon shell + down fill + synthetic dyes. Canadian luxury outerwear with no PFAS-free certification. Same fluoropolymer concern as Columbia at 4x the price.", confidence:"medium", category:"clothing" }],
  ["moose knuckles",                 { floor:5, ceiling:7, substances:["PFAS DWR","coyote fur","down fill","nylon shell"], reason:"Moose Knuckles — PFAS DWR + coyote fur trim + down fill. Same concern profile as Canada Goose at slightly lower price point.", confidence:"medium", category:"clothing" }],
  ["stone island",                   { floor:5, ceiling:7, substances:["PFAS","proprietary chemical treatments","garment dyeing"], reason:"Stone Island — known for proprietary chemical fabric treatments (Tela Stella, Ice Jacket, Liquid Reflective) and extensive garment dyeing. Chemical treatment is core to the brand identity. Multiple PFAS and synthetic chemical concerns.", confidence:"medium", category:"clothing" }],
  ["helly hansen",                   { floor:5, ceiling:7, substances:["PFAS DWR","nylon shell","fluoropolymer"], reason:"Helly Hansen — PFAS DWR on waterproof products, HellyTech membranes use fluoropolymers. Norwegian brand with conventional outdoor chemical profile.", confidence:"medium", category:"clothing" }],
  ["fjallraven",                     { floor:2, ceiling:4, substances:["G-1000 wax","recycled polyester"], reason:"Fjallraven — replaced all PFAS DWR with Greenland Wax (paraffin/beeswax) system across entire line by 2020. One of first outdoor brands to fully commit to PFAS-free. G-1000 fabric is conventional polyester/cotton but no fluorochemical treatments. Benchmark clean outerwear brand.", confidence:"high", category:"clothing" }],
  ["outdoor research",               { floor:5, ceiling:6, substances:["PFAS DWR","Gore-Tex","nylon shell"], reason:"Outdoor Research — PFAS DWR on waterproof products, Gore-Tex ePTFE on some products. Committed to PFAS-free by 2025 but transition incomplete.", confidence:"medium", category:"clothing" }],
  ["norrona",                        { floor:3, ceiling:5, substances:["recycled nylon","PFAS-free claim","bluesign"], reason:"Norrona — Norwegian brand, bluesign certified, moved to PFAS-free DWR on most products. Better than Helly Hansen and most outdoor brands on PFAS. Premium clean outdoor tier.", confidence:"medium", category:"clothing" }],
  ["fjallraven kanken",              { floor:2, ceiling:4, substances:["Vinylon F","wax coating"], reason:"Fjallraven Kanken — Vinylon F fabric (Japanese synthetic but no PFAS treatment), wax coating for water resistance. PFAS-free construction. Cleaner than nylon backpacks with PFAS DWR.", confidence:"high", category:"clothing" }],

  // ── ON RUNNING ────────────────────────────────────────────────
  ["on running cloud",               { floor:3, ceiling:5, substances:["Helion foam","TPU","synthetic textile","adhesives"], reason:"On Running Cloud — Helion superfoam midsole + TPU CloudTec pods + synthetic upper + chemical adhesives. Swiss performance brand, no PFAS DWR on shoes, no OEKO-TEX but cleaner than most Nike/Adidas equivalents.", confidence:"medium", category:"clothing" }],
    ["on running active",             { floor:4, ceiling:6, substances:["recycled polyester","moisture-wicking finish","synthetic dyes"], reason:"On Running active apparel — recycled polyester with moisture-wicking treatment. No bluesign certification on apparel line. Less transparent than their footwear PFAS-free commitment.", confidence:"medium", category:"clothing" }],
  ["on running tee",                { floor:4, ceiling:6, substances:["recycled polyester","moisture-wicking","synthetic dyes"], reason:"On Running t-shirt — recycled polyester, moisture-wicking finish. No PFAS-free claim on apparel.", confidence:"medium", category:"clothing" }],
  ["on running shirt",             { floor:5, ceiling:6, substances:["recycled polyester","PFAS moisture treatment","synthetic dyes"], reason:"On Running apparel — recycled polyester performance fabric with moisture-wicking PFAS finish. No bluesign certification. Apparel line less transparent than shoe line.", confidence:"medium", category:"clothing" }],

  // ── PREMIUM FOOTWEAR ──────────────────────────────────────────
  ["golden goose",                   { floor:5, ceiling:7, substances:["synthetic leather","chemical distressing","adhesives","azo dyes"], reason:"Golden Goose — pre-distressed synthetic leather + chemical distressing treatments + azo synthetic dyes + chemical adhesives. 00 sneaker where the distressed aesthetic requires chemical treatments. No chemical certifications.", confidence:"medium", category:"clothing" }],
  ["common projects",                { floor:5, ceiling:7, substances:["conventional leather","chrome tanning","adhesives"], reason:"Common Projects — Italian leather with chrome tanning + chemical adhesives. Minimalist sneaker, conventional leather concern. Better than synthetic alternatives but chrome tanning is an environmental concern.", confidence:"medium", category:"clothing" }],
  ["salomon",                        { floor:5, ceiling:6, substances:["synthetic upper","EVA foam","PFAS DWR","adhesives"], reason:"Salomon — synthetic upper + EVA midsole + PFAS DWR on trail shoes + chemical adhesives. French performance brand, PFAS on water-resistant trail models.", confidence:"medium", category:"clothing" }],
  ["merrell shoes",                  { floor:4, ceiling:6, substances:["synthetic upper","EVA foam","conventional leather","adhesives"], reason:"Merrell — synthetic/leather upper + EVA foam + adhesives. No significant PFAS on most hiking shoes. Mid-tier clean trail footwear.", confidence:"medium", category:"clothing" }],
  ["keen shoes",                     { floor:2, ceiling:4, substances:["conventional leather","recycled materials","adhesives"], reason:"Keen — PFAS-free claim on water-resistant shoes using non-fluorinated DWR, some OEKO-TEX certified products, PFC-free commitment. Cleaner outdoor shoe brand.", confidence:"high", category:"clothing" }],
  ["danner",                   { floor:5, ceiling:7, substances:["full grain leather","PFAS DWR","Gore-Tex","adhesives"], reason:"Danner — full grain leather + PFAS DWR on waterproof models + Gore-Tex ePTFE on some. Oregon-made construction, quality leather but PFAS concern on waterproof models.", confidence:"medium", category:"clothing" }],
  ["oboz hiking",                    { floor:2, ceiling:3, substances:["BDry waterproofing","recycled laces"], reason:"Oboz — plants a tree per pair, BDry waterproofing is PFAS-free, uses recycled materials where possible. Benchmark clean hiking boot brand.", confidence:"high", category:"clothing" }],
  ["oboz",                           { floor:2, ceiling:3, substances:[], reason:"Oboz — PFAS-free waterproofing, recycled content, tree planting. Benchmark clean outdoor footwear.", confidence:"high", category:"clothing" }],

  // ── LUXURY FABRICS ────────────────────────────────────────────
  ["loro piana",                     { floor:2, ceiling:4, substances:["cashmere","wool","natural dyes"], reason:"Loro Piana — high grade cashmere and wool, natural fiber sourcing, minimal synthetic processing. Premium luxury brand with generally cleaner chemistry than synthetic alternatives. Conventional livestock concern remains.", confidence:"medium", category:"clothing" }],
  ["brunello cucinelli",             { floor:2, ceiling:4, substances:["cashmere","natural fibers","low-impact dyes"], reason:"Brunello Cucinelli — cashmere and natural fiber focus, ethical manufacturing in Solomeo Italy, low-impact processing. Cleaner luxury brand with strong sustainability ethos.", confidence:"medium", category:"clothing" }],
  ["zegna",                          { floor:5, ceiling:6, substances:["wool","conventional processing","synthetic lining","formaldehyde finish"], reason:"Ermenegildo Zegna — premium wool suits, conventional processing, synthetic lining + formaldehyde wrinkle treatments. Luxury positioning but conventional suit chemistry.", confidence:"medium", category:"clothing" }],

  // ── ON RUNNING PRODUCT-SPECIFIC (lab/report verified) ────────
  ["on running cloud 5",                    { floor:3, ceiling:4, substances:["Helion foam","recycled mesh upper","adhesives"], reason:"On Running Cloud 5 — Helion superfoam midsole, engineered mesh upper, no DWR treatment on non-waterproof model. Better Trail verified: 100% of On waterproof footwear PFAS-free as of 2025. Standard Cloud 5 has no waterproof treatment at all. Cleaner than Nike equivalent.", confidence:"high", category:"clothing" }],
  ["on running cloudmonster",              { floor:3, ceiling:4, substances:["Helion foam","recycled mesh","TPU","adhesives"], reason:"On Cloudmonster — dual density Helion superfoam, 92% recycled content upper, no DWR. No waterproof treatment means no PFAS treatment concern on this specific model. Cleaner than most major running shoe brands.", confidence:"high", category:"clothing" }],
  ["on running cloudhorizon",   { floor:2, ceiling:4, substances:["PFAS-free membrane","recycled content"], reason:"On Cloudhorizon Waterproof — independently verified PFAS-free waterproof membrane and DWR by Better Trail. 32% recycled content. One of the cleaner waterproof hiking shoes on the market.", confidence:"high", category:"clothing" }],
  ["on running apparel",           { floor:4, ceiling:6, substances:["recycled polyester","moisture-wicking finish","synthetic dyes"], reason:"On Running apparel — recycled polyester with moisture-wicking treatment. Apparel line less transparent than footwear line on PFAS. No bluesign certification on apparel. Footwear PFAS-free commitment does not extend to confirmed apparel.", confidence:"medium", category:"clothing" }],

  // ── ATHLETA PRODUCT-SPECIFIC (Mamavation lab verified) ────────
  ["athleta salutation legging",   { floor:5, ceiling:6, substances:["PFAS indicator 17ppm","nylon","spandex"], reason:"Athleta leggings — Mamavation EPA-certified lab testing found 17ppm organic fluorine (PFAS indicator). Above 10ppm detection threshold, below 100ppm (likely manufacturing contamination not intentional treatment). Same reading as Old Navy. Athleta claims PFAS-free commitment since 2022 — may reflect reformulation after testing.", confidence:"high", category:"clothing" }],
  ["athleta",                      { floor:5, ceiling:6, substances:["PFAS indicator","nylon","recycled content"], reason:"Athleta — 17ppm PFAS indicator found by Mamavation lab in leggings. Gap-owned brand with PFAS-free commitment since 2022. Bluesign certified on some fabrics. Better than Lululemon (32ppm) but lab evidence still present. Floor 4 based on documented fluorine detection.", confidence:"high", category:"clothing" }],
  ["athleta legging",              { floor:5, ceiling:6, substances:["PFAS indicator","nylon","spandex"], reason:"Athleta leggings — same PFAS concern as athleta brand entry. Nylon/spandex with lab-detected fluorine.", confidence:"high", category:"clothing" }],
  ["aritzia",                      { floor:4, ceiling:6, substances:["polyester","spandex","synthetic dyes"], reason:"Aritzia — polyester/spandex blends + synthetic dyes. Canadian fast-fashion. No OEKO-TEX or GOTS. Some fabrics better than SHEIN but no certifications.", confidence:"medium", category:"clothing" }],
  ["madewell",                     { floor:4, ceiling:5, substances:["conventional cotton","synthetic dyes","formaldehyde"], reason:"Madewell — conventional cotton denim + synthetic dyes + formaldehyde resin finishing. Some organic cotton options. Cleaner than fast fashion but not certified.", confidence:"medium", category:"clothing" }],
  ["reformation",                  { floor:2, ceiling:4, substances:["deadstock fabric","Tencel"], reason:"Reformation — Tencel/linen/deadstock fabrics. Climate Neutral certified. Some synthetic blends. Cleaner mid-range but not fully organic. Benchmark cleaner fashion.", confidence:"high", category:"clothing" }],
  ["eileen fisher",                { floor:2, ceiling:4, substances:["organic linen","Tencel","organic cotton"], reason:"Eileen Fisher — organic/recycled materials, B Corp certified, take-back program. One of the cleanest mainstream fashion brands.", confidence:"high", category:"clothing" }],
  // FAST FASHION — HIGH CONCERN
  ["boohoo",                       { floor:6, ceiling:8, substances:["polyester","synthetic dyes","formaldehyde","PFAS"], reason:"Boohoo — ultra-fast fashion. 100% polyester + synthetic dyes + formaldehyde finishing. UK investigations found labor and environmental violations.", confidence:"high", category:"clothing" }],
  ["prettylittlething",            { floor:6, ceiling:8, substances:["polyester","synthetic dyes","formaldehyde"], reason:"PrettyLittleThing — Boohoo-owned ultra-fast fashion. Same polyester + formaldehyde concerns. No certifications.", confidence:"high", category:"clothing" }],
  ["romwe",                        { floor:7, ceiling:9, substances:["polyester","synthetic dyes","formaldehyde","lead","PFAS"], reason:"Romwe — SHEIN sister brand. Same supply chain concerns. CBC lab testing found lead and PFAS in similar fast fashion brands.", confidence:"medium", category:"clothing" }],
  ["shein dress",                  { floor:7, ceiling:9, substances:["polyester","synthetic dyes","formaldehyde","lead","PFAS"], reason:"SHEIN dress — same as SHEIN brand. Lead 2x EU limit + PFAS found in testing. Ultra-fast fashion.", confidence:"high", category:"clothing" }],
  ["primark",                      { floor:5, ceiling:7, substances:["polyester","synthetic dyes","formaldehyde"], reason:"Primark — budget fast fashion. Polyester + synthetic dyes + formaldehyde finishing. Some organic cotton basics but most products conventional.", confidence:"high", category:"clothing" }],
  ["temu clothing",                { floor:7, ceiling:9, substances:["polyester","synthetic dyes","formaldehyde","lead","PFAS"], reason:"Temu clothing — Chinese marketplace with zero chemical transparency. Same supply chain as SHEIN/Romwe. Lead and PFAS risk from untested garments.", confidence:"low", category:"clothing" }],
  // TARGET/WALMART STORE BRANDS
  ["all in motion",                { floor:4, ceiling:6, substances:["polyester","spandex","synthetic dyes"], reason:"All in Motion — Target activewear brand. Polyester/spandex + synthetic dyes. No OEKO-TEX or PFAS testing published.", confidence:"medium", category:"clothing" }],
  ["all in motion leggings",       { floor:4, ceiling:6, substances:["polyester","spandex","synthetic dyes"], reason:"All in Motion leggings — same as brand entry. Target store brand activewear.", confidence:"medium", category:"clothing" }],
  ["universal thread jeans",       { floor:5, ceiling:6, substances:["conventional cotton","synthetic dyes","formaldehyde"], reason:"Universal Thread jeans — same as brand. Target denim.", confidence:"high", category:"clothing" }],
  // ATHLEISURE SHOES
  ["hoka shoes",                   { floor:4, ceiling:5, substances:["EVA foam","synthetic upper","adhesives"], reason:"Hoka — EVA foam midsole + synthetic upper + chemical adhesives. Maximal cushioning = more foam material. No PFAS claims.", confidence:"medium", category:"clothing" }],
  ["brooks running shoes",         { floor:4, ceiling:5, substances:["EVA foam","synthetic upper","adhesives"], reason:"Brooks — EVA foam + synthetic upper + adhesives. Some recycled content. No PFAS DWR. Mid-tier athletic shoe.", confidence:"medium", category:"clothing" }],
  ["on cloud shoes",               { floor:4, ceiling:5, substances:["EVA foam","CloudTec pods","synthetic upper"], reason:"On Cloud — proprietary CloudTec EVA pods + synthetic upper. Swiss brand. No PFAS claims. Similar material profile to Hoka/Brooks.", confidence:"medium", category:"clothing" }],
  ["new balance women",            { floor:4, ceiling:5, substances:["synthetic upper","EVA foam","adhesives"], reason:"New Balance women's — EVA foam + synthetic upper + adhesives. Some Made in USA options. No PFAS claims on most models.", confidence:"medium", category:"clothing" }],
  ["asics women",                  { floor:4, ceiling:5, substances:["GEL cushioning","synthetic upper","adhesives"], reason:"ASICS women's — GEL silicone cushioning + synthetic upper + adhesives. Japanese brand. No PFAS claims.", confidence:"medium", category:"clothing" }],
  ["zara dress",                   { floor:5, ceiling:7, substances:["polyester","synthetic dyes","formaldehyde"], reason:"Zara — fast fashion polyester + synthetic dyes + formaldehyde finishing. Join Life line slightly cleaner but most products are conventional synthetic.", confidence:"high", category:"clothing" }],
  ["h&m dress",                    { floor:5, ceiling:7, substances:["polyester","synthetic dyes","formaldehyde","PFAS"], reason:"H&M — fast fashion polyester + formaldehyde + PFAS in some water-resistant items. Conscious line slightly cleaner but minimal verification.", confidence:"high", category:"clothing" }],
  ["gap jeans women",              { floor:5, ceiling:6, substances:["conventional cotton","synthetic dyes","formaldehyde"], reason:"Gap women's jeans — conventional cotton + synthetic dyes + formaldehyde resin. No organic certification on mainline.", confidence:"high", category:"clothing" }],
  ["old navy women",               { floor:5, ceiling:6, substances:["polyester","synthetic dyes","formaldehyde"], reason:"Old Navy women's — polyester blends + synthetic dyes + formaldehyde. Budget tier of Gap Inc. No certifications.", confidence:"high", category:"clothing" }],
  ["athleta brooklyn ankle pant",  { floor:3, ceiling:5, substances:["recycled nylon","spandex"], reason:"Athleta Brooklyn — recycled nylon + spandex, no DWR treatment. Among Athleta's cleaner products as no performance finish is applied. Bluesign certified fabric on some colorways.", confidence:"medium", category:"clothing" }],

  // ── RHONE PRODUCT-SPECIFIC (fabric research verified) ─────────
  ["rhone commuter pant",          { floor:4, ceiling:5, substances:["polyester","wrinkle-resistant finish","moisture-wicking","synthetic dyes"], reason:"Rhone Commuter Pant — proprietary Flex-Knit fabric is stretch polyester blend with wrinkle-resistant treatment + moisture-wicking finish. Wrinkle-resistance in performance pants commonly uses chemical finishes. No PFAS-free claim, no bluesign certification. Worn against skin all day in work setting.", confidence:"high", category:"clothing" }],
  ["rhone reign short",            { floor:4, ceiling:5, substances:["polyester","moisture-wicking","synthetic dyes"], reason:"Rhone Reign Short — polyester moisture-wicking construction, same Flex-Knit technology as Commuter. No PFAS-free claim, no bluesign. Mid-tier concern for men's premium activewear.", confidence:"medium", category:"clothing" }],
  ["rhone swift short",            { floor:4, ceiling:5, substances:["polyester","moisture-wicking","synthetic dyes"], reason:"Rhone Swift Short — polyester + moisture-wicking finish. Same concern profile as Reign Short. No certifications.", confidence:"medium", category:"clothing" }],

  // ══════════════════════════════════════════════════════════════
  // DIAPER AND KIDS CLOTHING DEEP AUDIT
  // ══════════════════════════════════════════════════════════════

  // ── HUGGIES PRODUCT SPLITS ────────────────────────────────────
  ["huggies pull-ups night",         { floor:7, ceiling:9, substances:["Ahcovel skin irritant","ECF bleaching","synthetic colorants","polyurethane elastics"], reason:"Huggies Pull-Ups Night-Time — multiple class action lawsuits document chemical burns from Ahcovel (undisclosed skin irritant in all Huggies products). ECF bleaching leaves chlorine residues. Worn against sensitive mucosal skin overnight. This specific product caused documented rashes in real-world use. Score matches app output.", confidence:"high", category:"baby" }],
  ["huggies pull-ups",               { floor:6, ceiling:8, substances:["Ahcovel skin irritant","ECF bleaching","synthetic colorants","polyurethane elastics"], reason:"Huggies Pull-Ups — class action lawsuits document Ahcovel chemical irritant causing burns across Huggies product lines. ECF bleaching. Fragrance-free per Huggies but undisclosed chemical irritants documented by litigation. Worn against sensitive skin during potty training.", confidence:"high", category:"baby" }],
  ["huggies snug and dry",           { floor:7, ceiling:9, substances:["Ahcovel skin irritant","ECF bleaching","synthetic colorants"], reason:"Huggies Snug and Dry — specific class action lawsuit documents Ahcovel chemical formulation causing chemical burns and blistering. Multiple years of consumer complaints. Hypoallergenic marketing disputed by litigation. Floor 7.", confidence:"high", category:"baby" }],
  ["huggies snug dry",               { floor:7, ceiling:9, substances:["Ahcovel skin irritant","ECF bleaching"], reason:"Huggies Snug and Dry — Ahcovel chemical burn class action documented.", confidence:"high", category:"baby" }],
  ["huggies little movers",          { floor:7, ceiling:9, substances:["Ahcovel skin irritant","ECF bleaching","blue dye colorant","undisclosed formula change"], reason:"Huggies Little Movers — 2024 class action: company secretly changed formula without disclosure. Reports of rashes within 3 days of new batch. Blue blowout blocker dye linked to skin reactions. Ahcovel concern across Huggies line. Floor 7.", confidence:"high", category:"baby" }],
  ["huggies skin essentials",        { floor:4, ceiling:6, substances:["ECF bleaching","polypropylene","synthetic colorants"], reason:"Huggies Skin Essentials — newer 2024 line. Free of fragrance, parabens, phthalates, lotions, latex per Huggies. ECF bleaching (not TCF). Still petroleum-based synthetic materials. Cleaner than base Huggies but not clean-label. Dermatologist approved.", confidence:"high", category:"baby" }],
  ["pull-ups skin essentials",       { floor:4, ceiling:6, substances:["ECF bleaching","polypropylene","synthetic colorants"], reason:"Pull-Ups Skin Essentials — fragrance-free, phthalate-free, paraben-free, no lotion. ECF bleaching. Cleaner than standard Pull-Ups Night-Time but still ECF bleached synthetic construction.", confidence:"high", category:"baby" }],
  ["huggies special delivery",       { floor:4, ceiling:6, substances:["ECF bleaching","plant-based materials","polypropylene"], reason:"Huggies Special Delivery — ECF bleaching (not TCF), fragrance-free, hypoallergenic, plant-based outer cover. Better than standard Huggies but ECF concern remains. Cleaner than Little Movers/Snug & Dry.", confidence:"high", category:"baby" }],
  ["huggies overnites",              { floor:6, ceiling:8, substances:["Ahcovel skin irritant","ECF bleaching","polyurethane elastics"], reason:"Huggies Overnites — overnight version, same Ahcovel concern as all Huggies. Worn overnight against skin. ECF bleaching. Class action concern applies.", confidence:"high", category:"baby" }],
  ["goodnites",                      { floor:6, ceiling:8, substances:["Ahcovel skin irritant","ECF bleaching","synthetic materials"], reason:"GoodNites — Huggies brand bedwetting products. Same Ahcovel and ECF bleaching concern as Pull-Ups. Worn overnight against sensitive skin of older children.", confidence:"high", category:"baby" }],

  // ── PAMPERS PRODUCT SPLITS ────────────────────────────────────
  ["pampers baby dry",               { floor:5, ceiling:7, substances:["ECF bleaching","polypropylene","fragrance","lotion"], reason:"Pampers Baby Dry — ECF bleaching + fragrance in some versions + aloe vera lotion + petroleum-based polypropylene. Lotion and fragrance on baby skin is primary concern. Not hypoallergenic like Pampers Sensitive.", confidence:"high", category:"baby" }],
  ["pampers cruisers",               { floor:5, ceiling:7, substances:["ECF bleaching","polypropylene","lotion","fragrance"], reason:"Pampers Cruisers — same concern profile as Pampers Baby Dry. Lotion + ECF bleaching + fragrance.", confidence:"high", category:"baby" }],
  ["pampers swaddlers sensitive",    { floor:4, ceiling:6, substances:["ECF bleaching","polypropylene","aloe lotion"], reason:"Pampers Swaddlers Sensitive — fragrance-free version. Aloe vera lotion remains + ECF bleaching. Better than standard Pampers but still ECF and synthetic construction.", confidence:"high", category:"baby" }],
  ["pampers pure protection",        { floor:3, ceiling:5, substances:["ECF bleaching","plant-based materials","polypropylene"], reason:"Pampers Pure Protection — fragrance-free, no lotions, plant-based liner, ECF bleaching (not TCF). Cleaner than Pampers Baby Dry but ECF concern remains. No third-party certification.", confidence:"high", category:"baby" }],
  ["pampers aqua pure",              { floor:3, ceiling:5, substances:["ECF bleaching","plant-based materials"], reason:"Pampers Aqua Pure wipes — 99% water, gentle cleanser, fragrance-free. Among cleanest mainstream baby wipes.", confidence:"high", category:"baby" }],

  // ── MISSING CLEAN DIAPER BRANDS ──────────────────────────────
  ["millie moon diapers",            { floor:3, ceiling:5, substances:["ECF bleaching","plant-based materials","polypropylene"], reason:"Millie Moon — ECF bleaching, fragrance-free, latex-free, hypoallergenic. Plant-based outer cover. Cleaner than standard Huggies/Pampers but ECF not TCF. Target exclusive premium diaper.", confidence:"high", category:"baby" }],
  ["millie moon",                    { floor:3, ceiling:5, substances:["ECF bleaching","plant-based materials"], reason:"Millie Moon — ECF bleaching, fragrance-free, plant-based materials. Mid-tier clean diaper.", confidence:"high", category:"baby" }],
  ["kudos",                  { floor:2, ceiling:4, substances:["organic cotton lining","polypropylene","sodium polyacrylate"], reason:"Kudos — 100% organic cotton inner lining, total chlorine-free, no fragrances or lotions, OEKO-TEX certified. Benchmark clean mainstream diaper with organic cotton next to skin.", confidence:"high", category:"baby" }],
  ["luvs diapers",                   { floor:6, ceiling:8, substances:["ECF bleaching","synthetic fragrance","lotion","polyurethane"], reason:"Luvs — budget P&G diaper, uses synthetic fragrance + lotion on inner lining + ECF bleaching. Multiple skin concern ingredients. Value positioning means lower ingredient standards.", confidence:"high", category:"baby" }],
  ["luvs",                           { floor:6, ceiling:8, substances:["ECF bleaching","synthetic fragrance","lotion"], reason:"Luvs — fragrance + lotion + ECF bleaching. Higher concern than standard Pampers.", confidence:"high", category:"baby" }],

  // ── TOYS ──────────────────────────────────────────────────────
  // Tier 1 — natural wood, water-based finishes, no plastic, ASTM/CPSC certified
  ["plantoys wooden",                 { floor:1, ceiling:1, substances:[], reason:"PlanToys wooden — sustainably harvested rubberwood, formaldehyde-free water-based dyes.", confidence:"high", category:"toy" }],
  ["plantoys",                        { floor:1, ceiling:1, substances:[], reason:"PlanToys — sustainably harvested rubberwood, formaldehyde-free water-based dyes. Benchmark clean.", confidence:"high", category:"toy" }],
  ["plan toys wooden",                { floor:1, ceiling:1, substances:[], reason:"PlanToys wooden — sustainably harvested rubberwood, formaldehyde-free water-based dyes. Benchmark 1/10.", confidence:"high", category:"toy" }],
  ["plan toys",                       { floor:1, ceiling:1, substances:[], reason:"PlanToys — sustainably harvested rubberwood, formaldehyde-free water-based dyes, chemical-free kiln treatment. ASTM F963 certified. Benchmark clean wooden toy brand.", confidence:"high", category:"toy" }],
  ["plan toy",                        { floor:1, ceiling:1, substances:[], reason:"PlanToys — sustainably harvested rubberwood, water-based dyes, no chemical preservatives.", confidence:"high", category:"toy" }],
  ["fagus wooden",                    { floor:1, ceiling:1, substances:[], reason:"Fagus wooden — solid beechwood, water-based non-toxic finishes, made in Germany.", confidence:"high", category:"toy" }],
  ["fagus",                           { floor:1, ceiling:1, substances:[], reason:"Fagus — solid beechwood, water-based non-toxic finishes, made in Germany, ASTM certified. Benchmark clean.", confidence:"high", category:"toy" }],
  ["hape wooden",                     { floor:1, ceiling:2, substances:[], reason:"Hape wooden — sustainably sourced wood, water-based paints, ASTM F963 and EN71 certified.", confidence:"high", category:"toy" }],
  ["hape",                            { floor:1, ceiling:2, substances:[], reason:"Hape — sustainably sourced wood, water-based paints, ASTM F963 and EN71 certified. No ABS plastic or PVC. Major clean wooden toy brand.", confidence:"high", category:"toy" }],
  ["green toys",                      { floor:1, ceiling:3, substances:[], reason:"Green Toys — made from 100% recycled milk jugs (#2 HDPE), no BPA, no PVC, no phthalates, no external coatings. Manufactured in USA. Benchmark clean plastic toy (recycled).", confidence:"high", category:"toy" }],
  ["lovevery",                        { floor:1, ceiling:3, substances:[], reason:"Lovevery — ASTM F963 certified, non-toxic water-based paints, FSC-certified wood, no BPA or phthalates. Stage-based toy subscription benchmark.", confidence:"high", category:"toy" }],
  ["bigjigs",                         { floor:1, ceiling:3, substances:[], reason:"Bigjigs Toys — FSC-certified wood, water-based paints, ASTM and EN71 certified. No chemical preservatives.", confidence:"high", category:"toy" }],
  ["brio",                            { floor:1, ceiling:3, substances:[], reason:"BRIO — sustainably sourced wood, water-based non-toxic paint, ASTM F963 and EN71 certified. Classic clean wooden toy standard.", confidence:"high", category:"toy" }],
  ["melissa and doug",                { floor:2, ceiling:4, substances:["conventional wood","standard finishes"], reason:"Melissa & Doug — ASTM F963 certified, no BPA, but uses conventional wood (not FSC certified) and standard finishes that may not be water-based on all products. Generally clean but not benchmark.", confidence:"medium", category:"toy" }],
  ["melissa doug",                    { floor:2, ceiling:4, substances:["conventional wood","standard finishes"], reason:"Melissa & Doug — ASTM F963 certified, no BPA. Standard finishes, not all FSC certified.", confidence:"medium", category:"toy" }],
  // Tier 2 — standard toy brands with ASTM but conventional materials
  ["fisher price",                    { floor:3, ceiling:6, substances:["ABS plastic","PVC risk","conventional dyes"], reason:"Fisher-Price — ASTM F963 certified, no phthalates in main products. ABS plastic primary material — no BPA but still petroleum-based. Some older lines had PVC. Conventional brand.", confidence:"medium", category:"toy" }],
  ["lego",                            { floor:3, ceiling:5, substances:["ABS plastic","petroleum-based","microplastics"], reason:"LEGO — ABS plastic (acrylonitrile butadiene styrene), no BPA or phthalates confirmed, ASTM certified. Petroleum-based but chemical concern is low — primary issue is microplastic pollution from shedding. Not PVC.", confidence:"high", category:"toy" }],
  ["hot wheels",                      { floor:6, ceiling:7, substances:["ABS plastic","PVC","conventional dyes","lead risk older"], reason:"Hot Wheels — die-cast metal + ABS/PVC plastic. Paint concern in older models. Current ASTM certified but conventional synthetic materials throughout.", confidence:"medium", category:"toy" }],
  ["barbie",                          { floor:4, ceiling:7, substances:["PVC","phthalates historical","ABS","synthetic dyes"], reason:"Barbie — primarily ABS and PVC plastic. Historical phthalate use in PVC components. Mattel has committed to phasing out PVC by 2030 but current products still contain conventional plastic.", confidence:"medium", category:"toy" }],
  // Tier 4 — PVC, high phthalate risk, recalled products
  ["bpa pvc toy",                     { floor:6, ceiling:9, substances:["PVC","phthalates","BPA"], reason:"High concern toy — PVC + phthalates direct child exposure through mouthing and skin contact.", confidence:"medium", category:"toy" }],

  // ── WOODEN TOY GENERAL RULES ──────────────────────────────────
  ["fokus wooden toy truck",          { floor:1, ceiling:1, substances:[], reason:"Fokus Wooden Toy Truck — solid hardwood, water-based food-safe finishes. Benchmark clean.", confidence:"high", category:"toy" }],
  ["fokus wooden toy",                { floor:1, ceiling:1, substances:[], reason:"Fokus wooden toy — solid hardwood, water-based food-safe finishes.", confidence:"high", category:"toy" }],
  ["fokus wooden",                    { floor:1, ceiling:1, substances:[], reason:"Fokus wooden — solid hardwood, water-based food-safe finishes, no synthetic dyes.", confidence:"high", category:"toy" }],
  ["fokus toy",                       { floor:1, ceiling:1, substances:[], reason:"Fokus toy — solid hardwood, water-based finishes. Benchmark clean.", confidence:"high", category:"toy" }],
  ["fokus",                           { floor:1, ceiling:1, substances:[], reason:"Fokus — solid hardwood, water-based food-safe finishes, no synthetic dyes. Clean natural toy brand.", confidence:"high", category:"toy" }],
  ["wooden toy truck",                { floor:1, ceiling:1, substances:[], reason:"Wooden toy truck — natural wood with water-based finish. Tier 1 clean toy.", confidence:"medium", category:"toy" }],
  ["wooden toy",                      { floor:1, ceiling:1, substances:[], reason:"Natural wood toys with water-based non-toxic finishes. Tier 1 clean.", confidence:"medium", category:"toy" }],
  // CARTER'S product splits
  ["carter's cotton pajamas",        { floor:5, ceiling:7, kidsFloor:7, kidsCeiling:9, substances:["flame retardant","conventional cotton","synthetic dyes"], reason:"Carter's treated cotton pajamas — FR chemical treatment required to meet federal flammability standards for loose-fitting cotton sleepwear. FR chemicals touching skin 10 hours nightly.", confidence:"high", category:"clothing" }],
  ["carter's polyester pajamas",     { floor:3, ceiling:5, substances:["polyester","synthetic dyes","microplastics"], reason:"Carter's snug-fit 100% polyester pajamas — tight-fitting construction exempts these from FR treatment requirement. Polyester is inherently less flammable and meets standards without chemical treatment. Still synthetic with microplastic concern.", confidence:"high", category:"clothing" }],
  ["carter's onesie",               { floor:3, ceiling:5, substances:["conventional cotton","synthetic dyes"], reason:"Carter's onesies and everyday bodysuits — no FR treatment needed (not sleepwear). Conventional cotton + synthetic dyes. Lower concern than Carter's pajamas.", confidence:"high", category:"clothing" }],
  ["carter's organic",              { floor:2, ceiling:4, substances:["organic cotton","OEKO-TEX"], reason:"Carter's organic cotton collection — OEKO-TEX certified on some items, no FR treatment, organic cotton. Significantly cleaner than standard Carter's sleepwear.", confidence:"medium", category:"clothing" }],

  // OshKosh product splits
  ["oshkosh pajamas",               { floor:5, ceiling:7, kidsFloor:7, kidsCeiling:9, substances:["flame retardant","conventional cotton","synthetic dyes"], reason:"OshKosh sleepwear — FR chemical treatment on loose-fitting cotton pajamas. Same concern as Carter's sleepwear. Worn against kids' skin overnight.", confidence:"high", category:"clothing" }],
  ["oshkosh overalls",              { floor:3, ceiling:5, substances:["conventional cotton","synthetic dyes"], reason:"OshKosh everyday clothing — no FR treatment needed. Conventional cotton + synthetic dyes. Lower concern than OshKosh sleepwear.", confidence:"high", category:"clothing" }],

  // MISSING KIDS BRANDS
  ["children's place",              { floor:4, ceiling:6, substances:["conventional cotton","synthetic dyes","flame retardant sleepwear"], reason:"The Children's Place — conventional cotton + synthetic dyes, FR on sleepwear. No GOTS or OEKO-TEX certification. Mid-price children's brand with conventional concern profile.", confidence:"medium", category:"clothing" }],
  ["childrens place",               { floor:4, ceiling:6, substances:["conventional cotton","synthetic dyes","flame retardant sleepwear"], reason:"The Children's Place — conventional concern profile.", confidence:"medium", category:"clothing" }],
  ["garanimals",                    { floor:4, ceiling:6, substances:["conventional cotton","polyester","synthetic dyes","flame retardant sleepwear"], reason:"Garanimals (Walmart) — conventional cotton/polyester + synthetic dyes, FR on sleepwear. Budget kids brand, no certifications. Same concern tier as Wonder Nation.", confidence:"medium", category:"clothing" }],
  ["jumping beans",                 { floor:4, ceiling:6, substances:["conventional cotton","synthetic dyes","flame retardant sleepwear"], reason:"Jumping Beans (Kohls) — conventional cotton + synthetic dyes, FR on sleepwear. No GOTS or OEKO-TEX. Budget kids brand concern.", confidence:"medium", category:"clothing" }],
  ["gap kids",                      { floor:5, ceiling:6, substances:["conventional cotton","synthetic dyes","formaldehyde","flame retardant sleepwear"], reason:"Gap Kids — conventional cotton + synthetic dyes + formaldehyde on wrinkle-resistant items + FR on sleepwear. No GOTS certification. Same as Gap adult concern but with additional sleepwear FR concern.", confidence:"medium", category:"clothing" }],
  ["old navy kids",                 { floor:5, ceiling:6, substances:["conventional cotton","synthetic dyes","formaldehyde","flame retardant sleepwear"], reason:"Old Navy Kids — conventional cotton + FR sleepwear + formaldehyde concern. Same as Old Navy adult brand plus sleepwear FR concern.", confidence:"medium", category:"clothing" }],
  ["baby gap",                      { floor:3, ceiling:5, substances:["conventional cotton","synthetic dyes"], reason:"babyGap — conventional cotton infant clothing. Less FR concern on infant sizes (different flammability standards). No GOTS certification.", confidence:"medium", category:"clothing" }],

  // CAT & JACK CONSOLIDATION — remove confusion, replace with clear splits
  ["cat and jack pajama",       { floor:5, ceiling:7, kidsFloor:7, kidsCeiling:9, substances:["flame retardant","conventional cotton","synthetic dyes"], reason:"Cat and Jack pajamas — FR chemical treatment on cotton sleepwear. Floor fires.", confidence:"high", category:"clothing" }],
  ["cat jack pajama",             { floor:5, ceiling:7, kidsFloor:7, kidsCeiling:9, substances:["flame retardant","conventional cotton","synthetic dyes"], reason:"Cat & Jack pajamas — FR on sleepwear.", confidence:"high", category:"clothing" }],
  ["cat & jack pajamas",            { floor:5, ceiling:7, kidsFloor:7, kidsCeiling:9, substances:["flame retardant","conventional cotton","synthetic dyes"], reason:"Cat & Jack sleepwear — FR chemical treatment on loose-fitting cotton pajamas (Target kids brand). FR chemicals against children's skin overnight. Same concern as Carter's and OshKosh sleepwear.", confidence:"high", category:"clothing" }],
  ["cat jack oeko",             { floor:2, ceiling:4, substances:["conventional cotton","OEKO-TEX"], reason:"Cat & Jack OEKO-TEX certified items — tested for harmful substances.", confidence:"high", category:"clothing" }],
  ["cat and jack oeko",          { floor:2, ceiling:4, substances:["conventional cotton","OEKO-TEX"], reason:"Cat & Jack OEKO-TEX certified.", confidence:"high", category:"clothing" }],
  ["cat & jack oeko",               { floor:2, ceiling:4, substances:["conventional cotton","OEKO-TEX"], reason:"Cat & Jack OEKO-TEX — OEKO-TEX Standard 100 certified items tested for harmful substances. No FR on OEKO-TEX items, no heavy metals, no restricted dyes. Benchmark clean for Target kids brand.", confidence:"high", category:"clothing" }],

  // ── PREMIUM BAMBOO KIDS PAJAMA BRANDS ────────────────────────
  // Framework: bamboo viscose is chemically processed (sodium hydroxide +
  // carbon disulfide) so not truly natural — but snug-fit = no FR chemicals,
  // and OEKO-TEX catches harmful substance residues. Score by certification depth.

  ["kickee pants",                   { floor:1, ceiling:3, substances:["bamboo viscose","low-impact dyes","spandex"], reason:"KicKee Pants — 95% bamboo viscose + 5% spandex. OEKO-TEX Standard 100 certified on BOTH fabric AND final product (dual certification is rare). USDA NOP organic bamboo source. Low-impact fiber-reactive dyes. Closed-loop chemical processing. Snug-fit so zero FR chemicals. Benchmark clean premium kids pajama brand.", confidence:"high", category:"clothing" }],
  ["kickee",                         { floor:1, ceiling:3, substances:["bamboo viscose","low-impact dyes","spandex"], reason:"KicKee Pants — strongest certifications in the bamboo pajama space. Dual OEKO-TEX on fabric and final product. Organic bamboo source. No FR.", confidence:"high", category:"clothing" }],

  ["little sleepies",                { floor:2, ceiling:4, substances:["bamboo viscose","spandex","chemical processing"], reason:"Little Sleepies — 95% bamboo viscose + 5% spandex. OEKO-TEX certified at fabric level. Independently lab-tested free from lead and flame retardants. Never treated with FR chemicals. Snug-fit design. Chemical processing of bamboo into viscose remains a concern (sodium hydroxide + carbon disulfide). No final-product OEKO-TEX like KicKee. Benchmark clean but one tier below KicKee.", confidence:"high", category:"clothing" }],

  ["kyte baby",                      { floor:2, ceiling:4, substances:["bamboo viscose","spandex","chemical processing"], reason:"Kyte Baby — 95% bamboo viscose + 5% spandex. Snug-fit, no FR chemicals. Founded for eczema-prone skin. Less certification transparency than KicKee Pants — no confirmed final-product OEKO-TEX. Still cleaner than Carter's FR-treated or conventional polyester pajamas.", confidence:"high", category:"clothing" }],

  ["posh peanut",                    { floor:2, ceiling:4, substances:["bamboo viscose","spandex","chemical processing"], reason:"Posh Peanut — 95% bamboo viscose + 5% spandex. Similar profile to Little Sleepies and Kyte Baby. Snug-fit, no FR. No confirmed OEKO-TEX final-product certification. Fashion-forward DTC brand with similar chemistry profile.", confidence:"medium", category:"clothing" }],

  ["magnetic me",                    { floor:2, ceiling:4, substances:["bamboo viscose","spandex","chemical processing"], reason:"Magnetic Me — bamboo viscose construction, snug-fit, magnetic closure design. No FR chemicals on sleepwear. Similar bamboo viscose processing concern to Little Sleepies. Magnetic closures add nickel concern in some products — check specific items.", confidence:"medium", category:"clothing" }],

  ["copper pearl",                   { floor:2, ceiling:4, substances:["bamboo viscose","spandex","chemical processing"], reason:"Copper Pearl — bamboo viscose + spandex. Snug-fit, no FR. Similar profile to Kyte Baby. DTC brand, less certification transparency than KicKee.", confidence:"medium", category:"clothing" }],

  ["kate quinn",                     { floor:1, ceiling:3, substances:["organic cotton","bamboo viscose","low-impact dyes"], reason:"Kate Quinn — uses organic cotton and bamboo viscose, GOTS certified on some lines, snug-fit no FR. Strong sustainability focus, low-impact dyes. Solid clean certification profile for a boutique kids brand.", confidence:"medium", category:"clothing" }],

  ["burt's bees baby pajamas",       { floor:2, ceiling:4, substances:["organic cotton","GOTS certified"], reason:"Burt's Bees Baby pajamas — GOTS certified organic cotton, no FR on snug-fit styles, no synthetic fragrance. Cleaner than Carter's pajamas but organic cotton still has microplastic-free concern. GOTS is a strong certification.", confidence:"high", category:"clothing" }],

  ["hanna andersson pajamas",        { floor:2, ceiling:4, substances:["organic cotton","OEKO-TEX","synthetic dyes"], reason:"Hanna Andersson pajamas — 100% organic cotton, OEKO-TEX certified, snug-fit (no FR chemicals needed). Strong heritage brand with clean sleepwear credentials. Conventional dyes but OEKO-TEX testing provides some assurance.", confidence:"high", category:"clothing" }],

  ["angel dear",                     { floor:2, ceiling:4, substances:["bamboo viscose","spandex","chemical processing"], reason:"Angel Dear — bamboo viscose construction, snug-fit, no FR. Similar profile to other DTC bamboo pajama brands. Targeted at sensitive skin.", confidence:"medium", category:"clothing" }],

  // ── MISSING HIGH-VOLUME PAJAMA BRANDS ────────────────────────
  ["simple joys carter's",           { floor:5, ceiling:7, kidsFloor:7, kidsCeiling:9, substances:["flame retardant","conventional cotton","synthetic dyes"], reason:"Simple Joys by Carter's (Amazon) — same FR concern as Carter's cotton sleepwear. Loose-fitting cotton requires FR chemical treatment.", confidence:"high", category:"clothing" }],
  ["simple joys",                    { floor:5, ceiling:7, substances:["flame retardant","conventional cotton","synthetic dyes"], reason:"Simple Joys by Carter's — FR-treated cotton sleepwear. Same concern profile as Carter's.", confidence:"high", category:"clothing" }],
  ["amazon essentials pajamas",      { floor:4, ceiling:6, substances:["conventional cotton","polyester","synthetic dyes"], reason:"Amazon Essentials kids pajamas — conventional cotton or polyester, snug-fit on most styles. No chemical certifications.", confidence:"medium", category:"clothing" }],
  ["wondershop pajamas",             { floor:4, ceiling:6, substances:["conventional cotton","polyester","synthetic dyes"], reason:"Wondershop (Target holiday pajamas) — conventional cotton/polyester, loose-fitting styles may have FR treatment. No OEKO-TEX.", confidence:"medium", category:"clothing" }],
  ["wondershop",                     { floor:4, ceiling:6, substances:["conventional cotton","polyester","synthetic dyes"], reason:"Wondershop (Target) — conventional materials, FR concern on loose-fitting cotton styles.", confidence:"medium", category:"clothing" }],
  ["leveret pajamas",                { floor:2, ceiling:4, substances:["organic cotton","OEKO-TEX"], reason:"Leveret — 100% organic cotton or bamboo, OEKO-TEX Standard 100 certified, snug-fit so no FR required. Best value clean pajama brand on Amazon. Benchmark accessible clean tier.", confidence:"high", category:"clothing" }],
  ["leveret",                        { floor:2, ceiling:4, substances:["organic cotton","OEKO-TEX"], reason:"Leveret — organic cotton, OEKO-TEX certified, snug-fit, no FR. Best value clean pajama brand.", confidence:"high", category:"clothing" }],
  ["moon and back",                  { floor:2, ceiling:4, substances:["organic cotton","OEKO-TEX"], reason:"Moon and Back by Hanna Andersson — affordable organic cotton sub-brand. OEKO-TEX certified, snug-fit, no FR. Same organic credentials as Hanna Andersson at lower price.", confidence:"high", category:"clothing" }],
  ["primary pajamas",                { floor:2, ceiling:4, substances:["conventional cotton","OEKO-TEX"], reason:"Primary pajamas — OEKO-TEX Standard 100 certified, no FR chemicals. Not fully organic but OEKO-TEX covers 350+ harmful substances.", confidence:"high", category:"clothing" }],
  ["honest baby pajamas",            { floor:2, ceiling:4, substances:["organic cotton","OEKO-TEX"], reason:"Honest Company baby pajamas — GOTS certified organic cotton, OEKO-TEX certified, no FR, no synthetic fragrance.", confidence:"high", category:"clothing" }],
  ["honest company pajamas",         { floor:2, ceiling:4, substances:["organic cotton","OEKO-TEX"], reason:"Honest Company pajamas — GOTS organic cotton, OEKO-TEX, no FR. Benchmark accessible clean.", confidence:"high", category:"clothing" }],
  ["tea collection pajamas",         { floor:2, ceiling:4, substances:["organic cotton","OEKO-TEX"], reason:"Tea Collection pajamas — GOTS certified organic cotton on most pajama lines, snug-fit, no FR.", confidence:"medium", category:"clothing" }],
  ["gymboree pajamas",               { floor:4, ceiling:6, substances:["conventional cotton","synthetic dyes","flame retardant sleepwear"], reason:"Gymboree — conventional cotton with FR on loose-fitting sleepwear. No GOTS or OEKO-TEX certification.", confidence:"medium", category:"clothing" }],
  ["little me pajamas",              { floor:3, ceiling:5, substances:["cotton","polyester","synthetic dyes"], reason:"Little Me — conventional cotton and polyester blend pajamas. Snug-fit on some styles (no FR), FR-treated on others. No OEKO-TEX certification. Mid-tier mass-market brand without the clean certifications of Little Sleepies or KicKee.", confidence:"medium", category:"clothing" }],

  ["gerber pajamas",                 { floor:3, ceiling:5, substances:["conventional cotton","polyester","synthetic dyes"], reason:"Gerber baby pajamas — conventional cotton/polyester, snug-fit exempts from FR on most styles. No organic or OEKO-TEX certification. Mass-market concern profile, better than FR-treated Carter's cotton pajamas.", confidence:"medium", category:"clothing" }],

  // ── STORE BRAND DIAPERS — TARGET / WALMART / SAM'S / COSTCO ──
  ["up & up diapers",                { floor:4, ceiling:6, substances:["ECF bleaching","polypropylene","synthetic colorants","undisclosed lotion"], reason:"Target Up & Up — ECF bleaching (not TCF), fragrance-free, latex-free, hypoallergenic. Possible aloe/vitamin E lotion on inner liner (conflicting reports — ingredient transparency is poor). Phthalate-free claim was removed from website. Budget store brand with decent but opaque ingredient profile.", confidence:"medium", category:"baby" }],
  ["up and up diapers",              { floor:4, ceiling:6, substances:["ECF bleaching","polypropylene","synthetic colorants"], reason:"Target Up & Up — same concern profile as above.", confidence:"medium", category:"baby" }],
  ["target diapers",                 { floor:4, ceiling:6, substances:["ECF bleaching","polypropylene"], reason:"Target Up & Up store brand diapers — ECF bleaching, fragrance-free. Mid-tier store brand.", confidence:"medium", category:"baby" }],
  ["member's mark diapers",          { floor:3, ceiling:5, substances:["ECF bleaching","polypropylene","polyethylene"], reason:"Sam's Club Member's Mark Premium Diapers (2025 redesign) — free from lotions, parabens, fragrances, latex, elemental chlorine. Phthalate-free. Hypoallergenic and dermatologist approved by Skin Health Alliance. Sustainably sourced SFI-certified pulp. Cleaner transparency than Up & Up. Still ECF not TCF.", confidence:"high", category:"baby" }],
  ["members mark diapers",           { floor:3, ceiling:5, substances:["ECF bleaching","polypropylene"], reason:"Sam's Club Member's Mark — same profile as above.", confidence:"high", category:"baby" }],
  ["member's mark baby",         { floor:1, ceiling:3, substances:["water","gentle cleansers"], reason:"Member's Mark baby wipes — no dyes, alcohol, parabens, chlorine, phthalates, or phenoxyethanol. Fragrance-free, dermatologist tested. Benchmark clean mainstream wipes.", confidence:"high", category:"baby" }],
  ["member's mark wipes",            { floor:1, ceiling:3, substances:["water","gentle cleansers"], reason:"Member's Mark Premium Wipes — no dyes, alcohol, parabens, chlorine, phthalates, or phenoxyethanol. Fragrance-free, hypoallergenic, dermatologist tested. Among cleanest mainstream baby wipes.", confidence:"high", category:"baby" }],
  ["rascal and friends",             { floor:4, ceiling:6, substances:["ECF bleaching","polypropylene","synthetic colorants"], reason:"Rascal + Friends — ECF bleaching, fragrance-free, hypoallergenic. New Zealand brand sold at Walmart. No lotions but limited US ingredient transparency. Similar profile to Up & Up.", confidence:"medium", category:"baby" }],
  ["rascal friends diapers",         { floor:4, ceiling:6, substances:["ECF bleaching","polypropylene"], reason:"Rascal + Friends — ECF bleaching, fragrance-free. Mid-tier store diaper.", confidence:"medium", category:"baby" }],
  ["little journey diapers",         { floor:4, ceiling:6, substances:["ECF bleaching","polypropylene","synthetic colorants"], reason:"Aldi Little Journey — ECF bleaching, fragrance-free, hypoallergenic. Aldi exclusive budget diaper. Limited ingredient transparency. Similar to Up & Up and Parent's Choice profile.", confidence:"medium", category:"baby" }],
  ["cuties diapers",                 { floor:4, ceiling:6, substances:["ECF bleaching","polypropylene","synthetic colorants"], reason:"Cuties — First Quality manufactured, ECF bleaching, fragrance-free. Budget diaper sold at Walmart and dollar stores. No premium certifications. Similar to store brand profile.", confidence:"medium", category:"baby" }],
  ["mama bear diapers",              { floor:4, ceiling:6, substances:["ECF bleaching","polypropylene","synthetic colorants"], reason:"Mama Bear (Amazon brand) — ECF bleaching, fragrance-free, hypoallergenic. Amazon store brand. Limited independent certification. Mid-tier store brand profile.", confidence:"medium", category:"baby" }],

  // ══════════════════════════════════════════════════════════════
  // MEN'S AND WOMEN'S UNDERWEAR DEEP AUDIT
  // ══════════════════════════════════════════════════════════════

  // ── TARGET HOUSE BRANDS ───────────────────────────────────────
  ["auden bra",                      { floor:3, ceiling:4, substances:["nylon","spandex","OEKO-TEX certified","synthetic dyes"], reason:"Auden (Target brand) bras — OEKO-TEX Standard 100 certified on most products, independently tested against 350+ harmful chemicals. Nylon/spandex/cotton construction. OEKO-TEX bans the most common PFAS and tests for restricted substances. One of the cleaner mass-market intimate brands due to blanket OEKO-TEX certification.", confidence:"high", category:"clothing" }],
  ["auden underwear",                { floor:3, ceiling:4, substances:["nylon","spandex","cotton","OEKO-TEX certified"], reason:"Auden (Target brand) underwear — OEKO-TEX certified on most items. Cotton, nylon, and spandex blends. Tested against 350+ harmful substances. Better certification than most mass-market underwear.", confidence:"high", category:"clothing" }],
  ["auden",                          { floor:3, ceiling:4, substances:["nylon","spandex","cotton","OEKO-TEX certified"], reason:"Auden (Target) — OEKO-TEX Standard 100 certified across most of the line. Tested against 350+ harmful chemicals. Benchmark clean for mass-market intimates.", confidence:"high", category:"clothing" }],
  ["colsie",                         { floor:3, ceiling:5, substances:["nylon","spandex","conventional cotton","synthetic dyes"], reason:"Colsie (Target brand) — Target's loungewear/sleepwear line. No OEKO-TEX certification claimed unlike Auden. Conventional nylon/cotton/spandex construction. Mid-tier store brand concern.", confidence:"medium", category:"clothing" }],
  ["true and co",                    { floor:3, ceiling:5, substances:["nylon","spandex","synthetic dyes"], reason:"True & Co (Target) — nylon/spandex bras and underwear, no OEKO-TEX certification on most items. DTC-style brand sold at Target. Standard synthetic concern profile.", confidence:"medium", category:"clothing" }],

  // ── MAINSTREAM WOMEN'S BRANDS ─────────────────────────────────
  ["jockey underwear",               { floor:3, ceiling:5, substances:["cotton","spandex","nylon","synthetic dyes"], reason:"Jockey — cotton/spandex and nylon/spandex blends. No OEKO-TEX certification. No PFAS-free claim. Standard conventional synthetic underwear concern. Cotton lines are lower concern than nylon-dominant lines.", confidence:"medium", category:"clothing" }],
  ["jockey bra",                     { floor:3, ceiling:5, substances:["nylon","spandex","polyester foam","synthetic dyes"], reason:"Jockey bras — nylon/spandex with polyester foam padding. No OEKO-TEX certification. Standard synthetic concern for mass-market intimates.", confidence:"medium", category:"clothing" }],
  ["jockey",                         { floor:3, ceiling:5, substances:["cotton","nylon","spandex","synthetic dyes"], reason:"Jockey — cotton and nylon/spandex blends depending on line. No certifications. Standard mass-market underwear concern profile.", confidence:"medium", category:"clothing" }],
  ["bali bra",                       { floor:3, ceiling:5, substances:["nylon","spandex","polyester foam","synthetic dyes"], reason:"Bali (Hanesbrands) — nylon/spandex, polyester foam, synthetic dyes. Sister brand to Hanes. No OEKO-TEX certification. Standard mass-market bra concern.", confidence:"medium", category:"clothing" }],
  ["bali underwear",                 { floor:3, ceiling:5, substances:["nylon","spandex","cotton","synthetic dyes"], reason:"Bali underwear — nylon/cotton/spandex blend. Hanesbrands construction. No certifications.", confidence:"medium", category:"clothing" }],
  ["warners bra",                    { floor:3, ceiling:5, substances:["nylon","spandex","polyester","synthetic dyes"], reason:"Warners (PVH brand) — nylon/spandex construction, no OEKO-TEX certification. Mass-market bra with standard synthetic concern.", confidence:"medium", category:"clothing" }],
  ["warners",                        { floor:3, ceiling:5, substances:["nylon","spandex","synthetic dyes"], reason:"Warners — PVH brand, conventional nylon/spandex. No certifications.", confidence:"medium", category:"clothing" }],
  ["soma",                           { floor:3, ceiling:5, substances:["nylon","spandex","synthetic dyes"], reason:"Soma — Chico's brand, nylon/spandex construction. No certifications. Standard concern.", confidence:"medium", category:"clothing" }],
  ["natori bra",                     { floor:3, ceiling:5, substances:["nylon","spandex","lace","synthetic dyes"], reason:"Natori — luxury nylon/spandex with lace. No OEKO-TEX certification. Premium price but conventional synthetic construction. Lace may contain disperse dyes (skin sensitizer concern).", confidence:"medium", category:"clothing" }],
  ["cosabella",                      { floor:3, ceiling:5, substances:["nylon","spandex","microfiber","synthetic dyes"], reason:"Cosabella — Italian luxury intimates, nylon/spandex, OEKO-TEX certified on some lines since 2021. Better transparency than most luxury brands. Synthetic construction with microplastic concern.", confidence:"medium", category:"clothing" }],
  ["gap body",                       { floor:3, ceiling:5, substances:["conventional cotton","nylon","spandex","synthetic dyes"], reason:"Gap Body — conventional cotton and nylon/spandex blends, no OEKO-TEX certification on intimates. Gap formaldehyde concern applies to wrinkle-resistant items. Standard concern.", confidence:"medium", category:"clothing" }],
  ["true co",                        { floor:3, ceiling:5, substances:["nylon","spandex","synthetic dyes"], reason:"True & Co — nylon/spandex DTC bras. No OEKO-TEX certification. Standard concern.", confidence:"medium", category:"clothing" }],
  ["cuup",                           { floor:3, ceiling:5, substances:["nylon","spandex","synthetic dyes"], reason:"CUUP — DTC bras, nylon/spandex, recycled nylon on some styles. No OEKO-TEX certification. Cleaner branding but no third-party testing certification.", confidence:"medium", category:"clothing" }],

  // ── CLEAN DTC UNDERWEAR BRANDS ────────────────────────────────
  ["negative underwear",             { floor:2, ceiling:4, substances:["recycled nylon","spandex","OEKO-TEX certified"], reason:"Negative Underwear — OEKO-TEX Standard 100 certified, recycled nylon construction. No intentionally added PFAS. One of the cleaner DTC bra and underwear brands. Still synthetic with microplastic concern.", confidence:"medium", category:"clothing" }],
  ["tomboyx",                        { floor:2, ceiling:4, substances:["TENCEL","cotton","spandex","OEKO-TEX certified"], reason:"TomboyX — OEKO-TEX certified fabric, TENCEL and organic cotton options. Third-party tested free from PFOS and PFOA. Gender-inclusive sizing. Cleaner material approach than most mass-market underwear.", confidence:"medium", category:"clothing" }],
  ["kindred bravely",                { floor:2, ceiling:4, substances:["nylon","spandex","OEKO-TEX certified"], reason:"Kindred Bravely — maternity and nursing intimates, OEKO-TEX Standard 100 certified. No harmful substances in tested categories. Better certification than most nursing bra brands.", confidence:"medium", category:"clothing" }],

  // ── MEN'S UNDERWEAR ADDITIONS ─────────────────────────────────
  ["saxx underwear",                 { floor:3, ceiling:5, substances:["nylon","polyester","spandex","synthetic dyes"], reason:"SAXX — nylon/polyester/spandex construction with BallPark Pouch mesh. No OEKO-TEX certification, no PFAS-free claim. Standard performance synthetic concern. Moisture-wicking through fiber structure not chemical coating.", confidence:"medium", category:"clothing" }],
  ["saxx briefs",                    { floor:3, ceiling:5, substances:["nylon","spandex","synthetic dyes"], reason:"SAXX — same profile as above.", confidence:"medium", category:"clothing" }],
  ["mack weldon underwear",          { floor:3, ceiling:5, substances:["Mack Weldon Silver","nylon","spandex","synthetic dyes"], reason:"Mack Weldon — silver-ion antimicrobial treatment on 18-Hour Jersey line + nylon/spandex construction. Silver nanoparticles are endocrine disruptors and leach into waterways. No OEKO-TEX certification.", confidence:"high", category:"clothing" }],
  ["mack weldon silver",             { floor:4, ceiling:6, substances:["silver antimicrobial","nylon","spandex"], reason:"Mack Weldon Silver line — active silver-ion antimicrobial. Silver nanoparticle treatments are endocrine disruptors with documented environmental harm. Floor bumps on silver treatment against skin.", confidence:"high", category:"clothing" }],
  ["tommy john underwear",           { floor:3, ceiling:5, substances:["nylon","spandex","cool cotton","synthetic dyes"], reason:"Tommy John — Cool Cotton and Second Skin lines. Nylon/spandex with moisture management through fiber structure (not PFAS). No certifications. Mid-tier DTC men's underwear. Better than Mack Weldon silver line, similar to SAXX.", confidence:"medium", category:"clothing" }],
  ["duluth trading underwear",       { floor:3, ceiling:5, substances:["conventional cotton","nylon","spandex","synthetic dyes"], reason:"Duluth Trading Buck Naked underwear — nylon/spandex construction marketed for performance. No OEKO-TEX. No silver antimicrobial. Mid-tier men's performance underwear concern.", confidence:"medium", category:"clothing" }],
  ["exofficio underwear",            { floor:5, ceiling:7, substances:["nylon","silver nanoparticle antimicrobial","spandex","synthetic dyes"], reason:"ExOfficio Give-N-Go — explicit silver nanoparticle (Polygiene) antimicrobial treatment for odor control. Worn against sensitive skin. Silver is an endocrine disruptor that leaches into waterways with washing. Class action documented concerns. Floor 5 on confirmed silver treatment.", confidence:"high", category:"clothing" }],
  ["meundies bra",                   { floor:2, ceiling:4, substances:["MicroModal","spandex"], reason:"MeUndies bralettes — MicroModal + spandex, OEKO-TEX certified fabric. Cleaner bra option in the DTC space.", confidence:"medium", category:"clothing" }],

  // ══════════════════════════════════════════════════════════════
  // CONDIMENTS AND SAUCES
  // ══════════════════════════════════════════════════════════════

  // ── MAYONNAISE ────────────────────────────────────────────────
  ["hellmanns real",           { floor:3, ceiling:5, substances:["soybean oil","calcium disodium EDTA","natural flavors"], reason:"Hellmann's Real Mayo — soybean oil (GMO, inflammatory omega-6), water, cage-free eggs, vinegar, salt, sugar, lemon juice, EDTA preservative, natural flavors. No TBHQ, no artificial colors. Mid-tier mainstream mayo. Soybean oil is the primary concern.", confidence:"high", category:"food_beverage" }],
  ["hellmanns mayo",                 { floor:3, ceiling:5, substances:["soybean oil","EDTA","natural flavors"], reason:"Hellmann's mayo — soybean oil base, EDTA preservative. No artificial colors or TBHQ. Standard mainstream mayo concern.", confidence:"high", category:"food_beverage" }],
  ["hellmanns avocado oil",    { floor:2, ceiling:4, substances:["avocado oil","eggs","vinegar"], reason:"Hellmann's Avocado Oil Mayo — avocado oil replaces soybean oil. Simpler ingredient profile than regular Hellmann's. Better fatty acid profile. No EDTA on some versions.", confidence:"medium", category:"food_beverage" }],
  ["hellmanns organic",             { floor:2, ceiling:4, substances:["organic soybean oil","organic eggs","organic vinegar"], reason:"Hellmann's Organic Mayo — USDA organic, organic soybean oil, organic eggs, no EDTA. Significantly cleaner than standard Hellmann's. Still soybean oil based.", confidence:"high", category:"food_beverage" }],
  ["duke's mayo",                    { floor:3, ceiling:5, substances:["soybean oil","cider vinegar","eggs"], reason:"Duke's Mayo — soybean/canola oil, eggs, cider vinegar, salt, natural flavor. No added sugar (key differentiator from Hellmann's), no EDTA, no HFCS. Slightly cleaner than Hellmann's. Still soybean oil base.", confidence:"high", category:"food_beverage" }],
  ["dukes mayo",                     { floor:3, ceiling:5, substances:["soybean oil","cider vinegar","eggs"], reason:"Duke's Mayo — same profile as above.", confidence:"high", category:"food_beverage" }],
  ["miracle whip",                   { floor:4, ceiling:6, substances:["soybean oil","HFCS","modified cornstarch","potassium sorbate"], reason:"Miracle Whip — HFCS is ingredient #3, modified cornstarch, potassium sorbate preservative, natural flavors. Technically a 'dressing' not mayo. Sweeter and more processed than Hellmann's. HFCS and modified starch are primary concerns.", confidence:"high", category:"food_beverage" }],
  ["sir kensingtons",          { floor:2, ceiling:4, substances:["sunflower oil","free-range eggs","vinegar"], reason:"Sir Kensington's Mayo — sunflower or avocado oil, free-range eggs, cider vinegar, simple ingredients, non-GMO verified. Significantly cleaner than Hellmann's or Duke's. No EDTA, no inflammatory seed oils on some varieties.", confidence:"high", category:"food_beverage" }],
  ["best foods mayo",                { floor:3, ceiling:5, substances:["soybean oil","EDTA","natural flavors"], reason:"Best Foods (= Hellmann's west of Rocky Mountains) — identical product, same soybean oil and EDTA concern profile as Hellmann's.", confidence:"high", category:"food_beverage" }],

  // ── SALAD DRESSINGS ───────────────────────────────────────────
  ["hidden valley ranch powder",     { floor:3, ceiling:5, substances:["buttermilk","MSG","artificial flavor"], reason:"Hidden Valley Ranch powder packets — MSG, artificial flavor, buttermilk solids, various starches. Prepared version uses soybean oil mayo. Seasoning packet alone is 3-5 concern.", confidence:"high", category:"food_beverage" }],
  ["wishbone italian",               { floor:4, ceiling:6, substances:["soybean oil","sugar","caramel color","xanthan gum"], reason:"Wish-Bone Italian — soybean oil, water, vinegar, sugar, salt, caramel color, xanthan gum. Caramel color (Class IV contains 4-MeI carcinogen concern), soybean oil. Standard mass-market Italian dressing.", confidence:"high", category:"food_beverage" }],
  ["kraft italian dressing",         { floor:4, ceiling:6, substances:["soybean oil","sugar","artificial color","caramel color"], reason:"Kraft Zesty Italian — soybean oil, HFCS or sugar, artificial color (Red 40 in some), caramel color. Standard mass-market dressing with synthetic additives.", confidence:"high", category:"food_beverage" }],
  ["newman's own dressing",          { floor:3, ceiling:5, substances:["canola oil","vinegar","hydrolyzed soy protein","xanthan gum"], reason:"Newman's Own dressings — canola oil, vinegar, no artificial colors, no HFCS, but contains hydrolyzed soy protein (processed flavor enhancer) in Italian variety. Profits to charity. Mid-tier: cleaner than Wish-Bone but not clean-label.", confidence:"high", category:"food_beverage" }],
  ["tessemae's dressing",            { floor:1, ceiling:3, substances:["organic olive oil","organic vinegar"], reason:"Tessemae's — organic olive oil, organic vinegar, simple spices. Whole30 approved, no seed oils, no added sugar in most varieties. Benchmark clean salad dressing.", confidence:"high", category:"food_beverage" }],
  ["primal kitchen dressing",        { floor:1, ceiling:3, substances:["avocado oil","organic vinegar"], reason:"Primal Kitchen dressings — avocado oil, organic ingredients, no seed oils, no added sugar, no soy, no canola. Benchmark clean dressing line. Paleo and Whole30 approved.", confidence:"high", category:"food_beverage" }],
  ["kraft mayo",                     { floor:3, ceiling:5, substances:["soybean oil","EDTA","modified food starch"], reason:"Kraft Mayo — soybean oil, modified food starch, EDTA, natural flavors. Similar concern to Hellmann's. Standard mass-market mayo.", confidence:"medium", category:"food_beverage" }],

  // ── STEAK SAUCE AND SPECIALTY ─────────────────────────────────
  ["a1 original",               { floor:4, ceiling:6, substances:["corn syrup","caramel color","potassium sorbate"], reason:"A1 Original Steak Sauce — corn syrup, caramel color (Class IV), potassium sorbate, tomato puree. Same as a1 steak sauce entry.", confidence:"high", category:"food_beverage" }],
  ["a.1. sauce",                 { floor:4, ceiling:6, substances:["corn syrup","caramel color","potassium sorbate"], reason:"A1 Original — corn syrup, caramel color (Class IV, 4-MeI concern), potassium sorbate, tomato puree, vinegar. No HFCS in original but corn syrup is present. Caramel color is the primary concern — same class as used in Coke.", confidence:"high", category:"food_beverage" }],
  ["lea and perrins",                { floor:3, ceiling:5, substances:["molasses","corn syrup","caramel color","anchovies"], reason:"Lea & Perrins Worcestershire — corn syrup, molasses, caramel color, tamarind extract, anchovies, salt. Natural profile but corn syrup and caramel color are concerns. Concentrated use limits exposure.", confidence:"high", category:"food_beverage" }],

  // ── MUSTARD ───────────────────────────────────────────────────
  ["grey poupon",                    { floor:1, ceiling:3, substances:["mustard seeds","white wine","vinegar","salt"], reason:"Grey Poupon Dijon — white wine, mustard seeds, vinegar, salt, citric acid. Exceptionally simple ingredient list for a mainstream condiment. No preservatives, no artificial ingredients. Benchmark clean condiment.", confidence:"high", category:"food_beverage" }],
  ["maille dijon",                   { floor:1, ceiling:3, substances:["mustard seeds","white wine","vinegar","salt"], reason:"Maille Dijon — mustard seeds, water, white wine, vinegar, salt. Same clean profile as Grey Poupon. Benchmark clean condiment.", confidence:"high", category:"food_beverage" }],
  ["gulden's spicy brown mustard",   { floor:2, ceiling:4, substances:["vinegar","mustard seeds","salt","turmeric"], reason:"Gulden's Spicy Brown — water, vinegar, mustard seeds, salt, turmeric, natural spices. Simple ingredients. Mid-tier only due to undisclosed 'natural spices' and processing.", confidence:"high", category:"food_beverage" }],

  // ── PASTA SAUCE ───────────────────────────────────────────────
  ["classico",           { floor:2, ceiling:4, substances:["tomatoes","olive oil","garlic","citric acid"], reason:"Classico — tomato puree, crushed tomatoes, olive oil, onions, garlic, basil, salt, citric acid. No HFCS, no added sugar in most varieties, no artificial flavors. Better than Ragu or Newman's Own pasta sauce. Citric acid is the only additive concern.", confidence:"high", category:"food_beverage" }],
  ["newman's own marinara",          { floor:2, ceiling:4, substances:["tomatoes","olive oil","onions","garlic"], reason:"Newman's Own Marinara — tomatoes, olive oil, onions, garlic, salt, citric acid. Simple ingredients, no HFCS, no artificial flavors. Similar to Classico. Profits to charity.", confidence:"high", category:"food_beverage" }],

  // ── SPICES AND SEASONINGS ──────────────────────────────────────
  ["mccormick garlic",              { floor:1, ceiling:2, substances:["garlic"], reason:"McCormick pure garlic powder — single ingredient.", confidence:"high", category:"food_beverage" }],
  ["mccormick black pepper",         { floor:1, ceiling:2, substances:["black pepper"], reason:"McCormick pure black pepper — single ingredient.", confidence:"high", category:"food_beverage" }],
  ["mccormick onion powder",          { floor:1, ceiling:2, substances:["onion"], reason:"McCormick pure onion powder — single ingredient.", confidence:"high", category:"food_beverage" }],
  ["mccormick pure spice",           { floor:1, ceiling:2, substances:["single spice"], reason:"McCormick pure spices (garlic powder, onion powder, black pepper, etc.) — single ingredient. No fillers, no anti-caking agents in most pure spices. Clean-label benchmark.", confidence:"high", category:"food_beverage" }],
  ["mccormick taco seasoning",       { floor:3, ceiling:5, substances:["spices","maltodextrin","silicon dioxide"], reason:"McCormick Taco Seasoning — spices, chili pepper, maltodextrin, silicon dioxide (anti-caking), salt, autolyzed yeast extract. Autolyzed yeast is a hidden MSG source. Maltodextrin from corn. Mid-tier seasoning packet.", confidence:"high", category:"food_beverage" }],
  ["mccormick ranch seasoning",      { floor:3, ceiling:5, substances:["buttermilk","MSG","autolyzed yeast"], reason:"McCormick Ranch Dressing Mix — MSG, autolyzed yeast extract, modified food starch, natural flavors. MSG is explicit or hidden in most ranch packets.", confidence:"high", category:"food_beverage" }],
  ["mccormick spices",               { floor:2, ceiling:4, substances:["spices","possible anti-caking agents"], reason:"McCormick spice blends — single herbs/spices are clean; blended products vary. Pure spices (1-2), seasoning packets with additives (3-5). Score this as a middle ground for the brand.", confidence:"medium", category:"food_beverage" }],
  ["lawry's seasoned salt",          { floor:3, ceiling:5, substances:["salt","sugar","paprika","turmeric","anti-caking agents"], reason:"Lawry's Seasoned Salt — salt, sugar, paprika, turmeric, MSG-adjacent 'natural flavors', silicon dioxide anti-caking agent. Simple enough but MSG-adjacent concern.", confidence:"medium", category:"food_beverage" }],
  ["lawry's marinade",               { floor:4, ceiling:6, substances:["soybean oil","HFCS","caramel color","artificial flavor"], reason:"Lawry's bottled marinades — HFCS in some, soybean oil, caramel color, artificial flavor. More processed than the seasoned salt. Check specific product.", confidence:"medium", category:"food_beverage" }],
  ["tony chachere's",                { floor:2, ceiling:4, substances:["salt","spices","MSG"], reason:"Tony Chachere's Creole Seasoning — salt, red pepper, black pepper, chili pepper, garlic, MSG. MSG is explicit on label. Straightforward: MSG is the main concern, everything else is spices.", confidence:"high", category:"food_beverage" }],
  ["old bay seasoning",              { floor:1, ceiling:3, substances:["celery salt","spices","paprika"], reason:"Old Bay — celery salt, spices, paprika. No MSG, no artificial ingredients, no anti-caking agents. Classic clean spice blend.", confidence:"high", category:"food_beverage" }],
  ["tajin",                          { floor:1, ceiling:3, substances:["chili peppers","salt","dehydrated lime juice"], reason:"Tajin — chili peppers, salt, dehydrated lime juice, citric acid. Simple clean spice blend. No artificial colors, no MSG.", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // FROZEN FOODS
  // ══════════════════════════════════════════════════════════════

  ["lean cuisine",                   { floor:4, ceiling:6, substances:["sodium","modified food starch","natural flavor","soybean oil"], reason:"Lean Cuisine — processed frozen entrees with modified food starch, natural flavors, soybean oil, high sodium (800-1100mg), often BPA-lined packaging. Low calorie positioning masks ingredient quality concerns.", confidence:"high", category:"food_beverage" }],
  ["healthy choice power bowl",      { floor:3, ceiling:5, substances:["quinoa","vegetables","modified starch","natural flavor"], reason:"Healthy Choice Power Bowls — simpler ingredients than traditional Healthy Choice, whole grains, vegetables, lower sodium than Lean Cuisine. Still processed with modified starch and natural flavors.", confidence:"medium", category:"food_beverage" }],
  ["healthy choice",                 { floor:4, ceiling:6, substances:["sodium","modified food starch","natural flavor","soybean oil"], reason:"Healthy Choice frozen meals — standard processed frozen entree: modified food starch, natural flavors, soybean oil, high sodium. Similar concern to Lean Cuisine.", confidence:"high", category:"food_beverage" }],
  ["stouffers",              { floor:5, ceiling:7, substances:["enriched flour","sodium","modified starch","artificial flavor"], reason:"Stouffer's — enriched white flour, very high sodium (900-1200mg), modified food starch, DATEM, artificial flavors on some products. One of the more processed mainstream frozen brands.", confidence:"high", category:"food_beverage" }],
  ["marie callender's frozen",       { floor:5, ceiling:7, substances:["enriched flour","high sodium","modified starch","TBHQ"], reason:"Marie Callender's — enriched flour, TBHQ preservative on some products, very high sodium, modified starch, BHA/BHT in some lines. Among the more processed mainstream frozen options.", confidence:"high", category:"food_beverage" }],
  ["tattooed chef",                  { floor:2, ceiling:4, substances:["vegetables","quinoa","olive oil","natural flavor"], reason:"Tattooed Chef — plant-based frozen meals with vegetables, legumes, grains, olive oil. Cleaner ingredient list than Lean Cuisine or Stouffer's. No artificial colors or flavors on most products.", confidence:"medium", category:"food_beverage" }],
  ["evol frozen",                    { floor:2, ceiling:4, substances:["vegetables","whole grains","natural flavor"], reason:"EVOL frozen meals — antibiotic-free proteins, whole grains, simple ingredients. One of the cleaner mainstream frozen meal brands. No artificial colors or flavors.", confidence:"medium", category:"food_beverage" }],
  ["saffron road frozen",            { floor:2, ceiling:4, substances:["halal protein","organic ingredients","spices"], reason:"Saffron Road — halal certified, antibiotic-free, organic ingredients, simple spice-based flavoring. Among the cleanest mainstream frozen entree brands.", confidence:"medium", category:"food_beverage" }],
  ["real good foods",                { floor:2, ceiling:4, substances:["chicken","cheese","cauliflower","natural flavor"], reason:"Real Good Foods — low-carb frozen meals using chicken crust, cheese, vegetables. Simple protein-first ingredients. No artificial colors, no added sugar in most products.", confidence:"medium", category:"food_beverage" }],
  ["birds eye protein",              { floor:2, ceiling:4, substances:["vegetables","protein","sauce"], reason:"Birds Eye Protein Bowls — vegetables, chicken or other protein, simple sauces. Cleaner than Lean Cuisine but still processed sauces with natural flavors.", confidence:"medium", category:"food_beverage" }],
  ["green giant veggie bowl",        { floor:2, ceiling:4, substances:["vegetables","whole grains","natural flavor"], reason:"Green Giant Veggie Bowls — primarily vegetables and whole grains, simple ingredient lists, no artificial colors. Cleaner than most frozen meals.", confidence:"medium", category:"food_beverage" }],
  ["jimmy dean frozen",              { floor:6, ceiling:7, substances:["pork","sodium nitrite","BHT","modified starch"], reason:"Jimmy Dean frozen breakfast items — sodium nitrite in sausage, BHT preservative, modified starch, high sodium. Standard processed breakfast meat concern.", confidence:"high", category:"food_beverage" }],
  ["el monterey",                    { floor:5, ceiling:7, substances:["enriched flour","soybean oil","sodium","artificial flavor"], reason:"El Monterey frozen burritos — enriched flour, soybean oil, high sodium, modified starch, artificial flavors. Budget frozen Mexican with standard UPF concerns.", confidence:"medium", category:"food_beverage" }],
  ["red baron pizza",                { floor:5, ceiling:7, substances:["enriched flour","soybean oil","modified starch","artificial flavor"], reason:"Red Baron frozen pizza — enriched white flour, soybean oil, modified food starch, artificial flavor, high sodium. Classic ultra-processed frozen pizza.", confidence:"high", category:"food_beverage" }],
  ["california pizza kitchen frozen", { floor:4, ceiling:6, substances:["enriched flour","soybean oil","natural flavor","sodium"], reason:"California Pizza Kitchen frozen — slightly cleaner than Red Baron (no artificial flavor in some), enriched flour, soybean oil, still high sodium. Mid-tier frozen pizza.", confidence:"medium", category:"food_beverage" }],
  ["trader joe's frozen",            { floor:3, ceiling:5, substances:["varied","natural flavor","sodium"], reason:"Trader Joe's frozen meals — generally simpler ingredient lists than mainstream brands, no artificial colors or flavors, but still processed with natural flavors and varying sodium levels. Quality varies by item.", confidence:"medium", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // RESTAURANT MENU ITEMS
  // ══════════════════════════════════════════════════════════════

  // PANERA
  ["panera broccoli cheddar soup",   { floor:4, ceiling:6, substances:["cream","sodium","modified starch","natural flavor"], reason:"Panera Broccoli Cheddar Soup — cream, cheese, modified starch, natural flavors, high sodium (950mg). Signature soup with real ingredients but heavily processed with starch thickeners.", confidence:"high", category:"restaurant" }],
  ["panera mac and cheese",          { floor:5, ceiling:7, substances:["enriched macaroni","cream","sodium","natural flavor"], reason:"Panera Mac and Cheese — enriched white pasta, cream, cheddar, high sodium (1100mg), modified starch. Despite fresh-made positioning, still a high-sodium processed entree.", confidence:"high", category:"restaurant" }],
  ["panera chicken sandwich",        { floor:4, ceiling:6, substances:["sodium","enriched bread","soybean oil","natural flavor"], reason:"Panera chicken sandwich — enriched white bread, soybean oil, sodium (900mg+), natural flavors. Clean protein but processed bread and high sodium.", confidence:"medium", category:"restaurant" }],
  ["panera caesar salad",            { floor:3, ceiling:5, substances:["caesar dressing","sodium","croutons","parmesan"], reason:"Panera Caesar Salad — romaine, parmesan, croutons, caesar dressing. Relatively clean protein option but dressing has natural flavors and added sodium.", confidence:"medium", category:"restaurant" }],

  // PANDA EXPRESS
  ["panda express orange chicken",   { floor:6, ceiling:8, substances:["enriched flour","HFCS","soybean oil","sodium","artificial flavor"], reason:"Panda Express Orange Chicken — the single most ordered fast food item in the US. Enriched flour batter, HFCS in sauce, soybean oil frying, very high sodium (820mg), artificial flavor. Classic ultra-processed fast food.", confidence:"high", category:"restaurant" }],
  ["panda express fried rice",       { floor:5, ceiling:7, substances:["soybean oil","sodium","oyster sauce","soy sauce"], reason:"Panda Express Fried Rice — white rice, soybean oil, high sodium (900mg), soy sauce, oyster sauce. Standard fried rice concern: high sodium, refined carbs, seed oil.", confidence:"high", category:"restaurant" }],
  ["panda express string bean chicken", { floor:4, ceiling:6, substances:["sodium","soybean oil","oyster sauce","natural flavor"], reason:"Panda Express String Bean Chicken — one of cleaner Panda options: chicken, string beans, soybean oil, ginger, oyster sauce. Lower sodium than orange chicken. Still soybean oil and MSG-containing sauces.", confidence:"medium", category:"restaurant" }],
  ["panda express teriyaki chicken", { floor:4, ceiling:6, substances:["sodium","HFCS","soybean oil","natural flavor"], reason:"Panda Express Teriyaki Chicken — grilled chicken (cleaner than orange chicken) but teriyaki sauce has HFCS and high sodium (930mg).", confidence:"high", category:"restaurant" }],

  // RAISING CANE'S
  ["raising cane's chicken tenders", { floor:4, ceiling:6, substances:["enriched flour","soybean oil","sodium","natural flavor"], reason:"Raising Cane's chicken tenders — fresh never-frozen chicken breast, breaded in enriched flour, fried in soybean oil. Simpler than most fast food (no artificial colors, cleaner protein). Still fried in soybean oil + high sodium.", confidence:"high", category:"restaurant" }],
  ["raising cane's sauce",           { floor:4, ceiling:6, substances:["mayonnaise","ketchup","Worcestershire","sodium"], reason:"Raising Cane's Sauce — mayo, ketchup, Worcestershire, garlic, black pepper. Simple condiment but soybean oil-based mayo + high sodium.", confidence:"high", category:"restaurant" }],

  // OLIVE GARDEN
  ["olive garden breadsticks",       { floor:5, ceiling:7, substances:["enriched flour","DATEM","sodium","soybean oil"], reason:"Olive Garden Breadsticks — enriched white flour, DATEM dough conditioner, high sodium (460mg each), soybean oil, garlic butter (artificial butter flavor). The iconic endless breadstick.", confidence:"high", category:"restaurant" }],
  ["olive garden fettuccine alfredo", { floor:5, ceiling:7, substances:["enriched pasta","cream","sodium","natural flavor"], reason:"Olive Garden Fettuccine Alfredo — enriched white pasta, cream, butter, parmesan. Very high sodium (1080mg) and calories (1220 kcal). Real ingredients but extreme portion and sodium.", confidence:"high", category:"restaurant" }],
  ["olive garden salad",             { floor:3, ceiling:5, substances:["iceberg lettuce","dressing","croutons","sodium"], reason:"Olive Garden House Salad — romaine/iceberg, pepperoncini, olives, croutons, Italian dressing. Relatively clean vegetables but dressing has soybean oil and high sodium.", confidence:"medium", category:"restaurant" }],

  // CULVER'S
  ["culvers",          { floor:5, ceiling:7, substances:["beef","enriched bun","butter","sodium"], reason:"Culver's ButterBurger — fresh never-frozen beef, enriched white bun, real butter on bun. Cleaner protein than McDonald's but enriched bun, very high sodium, standard fast food frying oils.", confidence:"high", category:"restaurant" }],
  ["culvers cheese curds",          { floor:6, ceiling:8, substances:["soybean oil","enriched flour","sodium","artificial flavor"], reason:"Culver's Cheese Curds — white cheddar curds in enriched flour batter, fried in soybean oil. High fat, high sodium (640mg per serving), artificial flavors in batter.", confidence:"high", category:"restaurant" }],
  ["culvers frozen custard",        { floor:4, ceiling:6, substances:["cream","corn syrup","artificial flavor","sodium"], reason:"Culver's Frozen Custard — cream, skim milk, sugar, corn syrup, eggs, natural and artificial flavor. Real dairy base but corn syrup and artificial flavor. Standard premium frozen dessert concern.", confidence:"medium", category:"restaurant" }],

  // ARBY'S
  ["arbys roast beef",              { floor:5, ceiling:7, substances:["sodium phosphates","sodium","enriched bun","natural flavor"], reason:"Arby's Roast Beef — beef with sodium phosphate injections, enriched white bun, very high sodium (970mg+), natural flavors. Phosphate additives for moisture retention are the primary concern.", confidence:"high", category:"restaurant" }],
  ["arbys curly fries",             { floor:5, ceiling:7, substances:["soybean oil","TBHQ","sodium","enriched flour"], reason:"Arby's Curly Fries — enriched flour coating, soybean oil, TBHQ preservative, modified starch, very high sodium (1300mg for large). Classic ultra-processed side.", confidence:"high", category:"restaurant" }],

  // CARL'S JR / HARDEE'S
  ["carl's jr thickburger",          { floor:5, ceiling:7, substances:["beef","enriched bun","soybean oil","sodium","natural flavor"], reason:"Carl's Jr Thickburger — 100% beef, enriched white bun, soybean oil, very high sodium (1200mg+). Large calorie and sodium load. Standard fast food burger concern.", confidence:"high", category:"restaurant" }],

  // DEL TACO
  ["del taco crunchy tacos",         { floor:5, ceiling:7, substances:["enriched corn shell","soybean oil","sodium","artificial flavor"], reason:"Del Taco — conventional fast food Mexican with enriched shells, soybean oil, high sodium, artificial flavors. Similar concern to Taco Bell.", confidence:"medium", category:"restaurant" }],

  // TEXAS ROADHOUSE
  ["texas roadhouse rolls",          { floor:5, ceiling:7, substances:["enriched flour","DATEM","sodium","cinnamon butter"], reason:"Texas Roadhouse Rolls — enriched white flour, DATEM dough conditioner, sodium, served with 'cinnamon butter' (margarine + artificial butter flavor on some). Iconic side with ultra-processed bread.", confidence:"medium", category:"restaurant" }],
  ["texas roadhouse sirloin",        { floor:3, ceiling:5, substances:["beef","seasoning","sodium"], reason:"Texas Roadhouse sirloin steak — USDA Choice beef with house seasoning (salt, pepper, garlic). Relatively clean protein when ordered without extra sauces. Sodium is the main concern from seasoning.", confidence:"medium", category:"restaurant" }],

  // CRACKER BARREL
  ["cracker barrel pancakes",        { floor:4, ceiling:6, substances:["enriched flour","HFCS","artificial flavor","sodium"], reason:"Cracker Barrel pancakes — enriched flour, buttermilk, HFCS in syrup, artificial vanilla flavor. Standard sit-down restaurant pancake concern.", confidence:"medium", category:"restaurant" }],

  // STARBUCKS
  ["starbucks frappuccino",          { floor:5, ceiling:7, substances:["HFCS","caramel color","artificial flavor","sodium"], reason:"Starbucks Frappuccino (bottled) — HFCS, caramel color, natural and artificial flavors, sodium. The bottled RTD version has more additives than in-store blended drinks.", confidence:"high", category:"restaurant" }],
  ["starbucks pumpkin spice latte",  { floor:5, ceiling:7, substances:["pumpkin spice syrup","caramel color","sugar","natural flavor"], reason:"Starbucks PSL — pumpkin spice syrup contains sugar, condensed skim milk, caramel color, natural flavors, annatto (color). Very high sugar (50g per grande). Seasonal hit with significant additive load.", confidence:"high", category:"restaurant" }],

  // ══════════════════════════════════════════════════════════════
  // PERSONAL CARE GAPS
  // ══════════════════════════════════════════════════════════════

  ["olaplex hair treatment",         { floor:2, ceiling:4, substances:["bis-aminopropyl diglycol dimaleate","PEG compounds","water"], reason:"Olaplex No. 3 — patented bis-aminopropyl diglycol dimaleate (bond builder), water, PEG-related compounds, phenoxyethanol. No parabens, no formaldehyde, no artificial fragrance. Proprietary chemistry but EWG rates most Olaplex products 1-3.", confidence:"medium", category:"personal_care" }],
  ["vegamour gro serum",             { floor:2, ceiling:4, substances:["nicotinamide","organic plant extracts","glycerin"], reason:"Vegamour GRO serum — nicotinamide, organic plant extracts (mung bean, curcumin, red clover), glycerin. No synthetic fragrance, no sulfates, no parabens. Clean-leaning hair serum with some PEG compounds in certain products.", confidence:"medium", category:"personal_care" }],
  ["hims hair loss",                 { floor:3, ceiling:5, substances:["minoxidil","alcohol","propylene glycol"], reason:"Hims Minoxidil — minoxidil (FDA-approved drug), propylene glycol, alcohol. Pharmaceutical active ingredient with known skin sensitization from propylene glycol. Score reflects drug actives in personal care context.", confidence:"high", category:"personal_care" }],
  ["native body wash",               { floor:2, ceiling:4, substances:["sodium cocoyl isethionate","glycerin","fragrance"], reason:"Native Body Wash — coconut oil-derived cleansers, glycerin, no sulfates, no parabens, no phthalates. Synthetic fragrance remains a concern on scented varieties. Fragrance-free versions score lower.", confidence:"high", category:"personal_care" }],
  ["dollar shave club",              { floor:3, ceiling:5, substances:["synthetic fragrance","propylene glycol","SLS","parabens on some"], reason:"Dollar Shave Club shave products — standard drugstore concern profile: synthetic fragrance, propylene glycol, SLS in shave creams, some parabens in older formulations. Mid-tier men's grooming.", confidence:"medium", category:"personal_care" }],
  ["gillette body wash",             { floor:3, ceiling:5, substances:["synthetic fragrance","propylene glycol","SLS"], reason:"Gillette Body Wash — SLS, synthetic fragrance, propylene glycol. Standard mass-market body wash concern. No parabens in current formulation.", confidence:"medium", category:"personal_care" }],
  ["pantene shampoo",                { floor:4, ceiling:6, substances:["silicones","DMDM hydantoin","synthetic fragrance","SLES"], reason:"Pantene — SLES, synthetic fragrance, silicones (dimethicone), DMDM hydantoin (formaldehyde releaser). EWG rates Pantene products 4-7 due to formaldehyde-releasing preservative and synthetic fragrance.", confidence:"high", category:"personal_care" }],
  ["tresemme shampoo",               { floor:4, ceiling:6, substances:["DMDM hydantoin","SLES","silicones","synthetic fragrance"], reason:"TRESemmé — DMDM hydantoin (formaldehyde releaser), SLES, synthetic fragrance, silicones. Class action settled 2021 over DMDM hydantoin causing hair loss. Similar concern to Pantene.", confidence:"high", category:"personal_care" }],

  // ── SPECIFIC HIGH-SUGAR JUICES (nutrition baked in as fallback) ──
  ["natures nectar white grape",   { floor:5, ceiling:7, kidsFloor:7, kidsCeiling:8, nutrition:{sugar_g:38, sodium_mg:25, calories:140}, substances:["38g natural sugar per 8oz"], reason:"Nature's Nectar White Grape Juice — 38g sugar per 8oz = 76% adult daily sugar limit, 152% of children's daily limit. Natural sugar has identical glycemic impact to added sugar.", confidence:"high", category:"beverage" }],
  ["natures nectar",               { floor:5, ceiling:7, kidsFloor:7, kidsCeiling:8, nutrition:{sugar_g:38, sodium_mg:25, calories:140}, substances:["38g natural sugar per 8oz"], reason:"Nature's Nectar juice — high natural sugar, floor based on 38g per serving.", confidence:"high", category:"beverage" }],
  ["welchs grape juice",            { floor:5, ceiling:7, kidsFloor:7, kidsCeiling:8, nutrition:{sugar_g:36, sodium_mg:15, calories:140}, substances:["36g natural sugar per 8oz"], reason:"Welch's Grape Juice — 36g sugar per 8oz = 72% adult DV, 144% children's DV.", confidence:"high", category:"beverage" }],
  ["apple juice",                    { floor:4, ceiling:6, kidsFloor:7, kidsCeiling:8, nutrition:{sugar_g:28, sodium_mg:20, calories:120}, substances:["28g natural sugar per 8oz"], reason:"Apple juice — 28g sugar per 8oz = 56% adult DV, 112% children's DV.", confidence:"high", category:"beverage" }],
  ["white grape juice",              { floor:5, ceiling:7, kidsFloor:7, kidsCeiling:8, nutrition:{sugar_g:38, sodium_mg:20, calories:140}, substances:["38g natural sugar per 8oz"], reason:"White grape juice — 38g sugar per 8oz, same as Nature's Nectar. Floor 5 adult, 7 kids.", confidence:"high", category:"beverage" }],
  ["grape juice",                    { floor:5, ceiling:7, kidsFloor:7, kidsCeiling:8, nutrition:{sugar_g:36, sodium_mg:15, calories:140}, substances:["36g natural sugar per 8oz"], reason:"Grape juice — 36g sugar per 8oz = 72% adult DV, 144% children's DV.", confidence:"high", category:"beverage" }],
  ["cranberry juice cocktail",       { floor:5, ceiling:7, kidsFloor:7, kidsCeiling:8, nutrition:{sugar_g:30, sodium_mg:35, calories:120}, substances:["30g sugar per 8oz","HFCS or corn syrup"], reason:"Cranberry juice cocktail — only ~27% real juice, 30g sugar, often HFCS. Floor on both ingredient and sugar concern.", confidence:"high", category:"beverage" }],
  ["ocean spray cranberry",          { floor:5, ceiling:7, kidsFloor:7, kidsCeiling:8, nutrition:{sugar_g:30, sodium_mg:35, calories:120}, substances:["30g sugar per 8oz","HFCS"], reason:"Ocean Spray Cranberry Cocktail — primarily sugar water with minimal real juice. 30g sugar, often HFCS.", confidence:"high", category:"beverage" }],
  ["simply lemonade",                { floor:5, ceiling:6, kidsFloor:7, kidsCeiling:8, nutrition:{sugar_g:28, sodium_mg:10, calories:120}, substances:["28g sugar per 8oz"], reason:"Simply Lemonade — 28g sugar per 8oz. Clean ingredients but very high natural + added sugar.", confidence:"high", category:"beverage" }],
  ["minute maid orange juice",       { floor:4, ceiling:6, kidsFloor:6, kidsCeiling:8, nutrition:{sugar_g:24, sodium_mg:5, calories:110}, substances:["24g natural sugar per 8oz"], reason:"Minute Maid OJ — 24g sugar per 8oz = 48% adult DV, 96% children's DV.", confidence:"high", category:"beverage" }],
  ["simply orange",                  { floor:4, ceiling:5, kidsFloor:6, kidsCeiling:7, nutrition:{sugar_g:22, sodium_mg:0, calories:110}, substances:["22g natural sugar per 8oz"], reason:"Simply Orange — 22g sugar per 8oz. No flavor packs claimed. Mid-tier OJ.", confidence:"high", category:"beverage" }],
  // ══════════════════════════════════════════════════════════════
  // COOKING OILS
  // ══════════════════════════════════════════════════════════════

  // ── SEED/VEGETABLE OILS (high concern) ───────────────────────
  ["wesson vegetable oil",            { floor:4, ceiling:6, substances:["soybean oil","hexane extraction","GMO","bleaching"], reason:"Wesson Vegetable Oil — soybean oil, hexane solvent extraction, GMO crop, caustic refining, bleaching, deodorization. Ultra-processed seed oil. High omega-6 polyunsaturated fats that oxidize under heat. One of the most refined mainstream cooking oils.", confidence:"high", category:"food_beverage" }],
  ["wesson canola oil",               { floor:4, ceiling:6, substances:["canola oil","hexane extraction","GMO","trans fat traces"], reason:"Wesson Canola Oil — GMO canola (rapeseed), hexane extracted, bleached, deodorized. Deodorization can create trace trans fats not listed on label per Weston A. Price research. Standard refined seed oil.", confidence:"high", category:"food_beverage" }],
  ["mazola corn oil",                 { floor:4, ceiling:6, substances:["corn oil","hexane extraction","GMO","omega-6"], reason:"Mazola Corn Oil — GMO corn, hexane extracted (confirmed by Mazola). Very high omega-6 PUFA, unstable under heat. Standard refined seed oil with same concerns as Wesson.", confidence:"high", category:"food_beverage" }],
  ["mazola canola oil",               { floor:4, ceiling:6, substances:["canola oil","hexane extraction","GMO"], reason:"Mazola Canola — GMO canola, hexane extracted. Same concern as Wesson canola.", confidence:"high", category:"food_beverage" }],
  ["crisco canola oil",               { floor:4, ceiling:6, substances:["canola oil","hexane extraction","GMO"], reason:"Crisco Canola Oil — GMO canola, hexane extracted, highly refined. Same concern as Mazola and Wesson canola.", confidence:"high", category:"food_beverage" }],
  ["great value vegetable oil",       { floor:4, ceiling:6, substances:["soybean oil","hexane extraction","GMO"], reason:"Great Value (Walmart) vegetable oil — soybean oil, standard refined seed oil concerns.", confidence:"medium", category:"food_beverage" }],

  // ── OLIVE OILS (score by brand transparency) ─────────────────
  ["california olive ranch",          { floor:1, ceiling:3, substances:["extra virgin olive oil","California grown"], reason:"California Olive Ranch — US-grown EVOO, tested and certified by California Olive Oil Council (COOC). One of the most transparent and verified mainstream olive oils. No adulteration concerns.", confidence:"high", category:"food_beverage" }],
  ["kirkland olive oil",              { floor:2, ceiling:4, substances:["extra virgin olive oil","imported"], reason:"Kirkland EVOO — Costco olive oil has passed independent testing. One of the better-value verified olive oils. Still imported blend so slightly less traceable than California Olive Ranch.", confidence:"medium", category:"food_beverage" }],
  ["filippo berio",                   { floor:2, ceiling:4, substances:["olive oil","imported Italy"], reason:"Filippo Berio — Italian EVOO brand with UC Davis testing history mixed. Passed some independent quality tests. Mid-tier transparency for mainstream Italian olive oil.", confidence:"medium", category:"food_beverage" }],
  ["pompeian",              { floor:2, ceiling:4, substances:["olive oil","imported"], reason:"Pompeian EVOO — large mainstream brand, North American Olive Oil Association certified on some products. Mid-tier transparency. Better than generic brands.", confidence:"medium", category:"food_beverage" }],
  ["bertolli olive oil",              { floor:3, ceiling:5, substances:["olive oil blend","mixed origins"], reason:"Bertolli — historically flagged in UC Davis studies for adulteration and failing EVOO standards. Large Italian brand with mixed quality testing record. Lower transparency than California Olive Ranch or Filippo Berio.", confidence:"medium", category:"food_beverage" }],
  ["la tourangelle",                  { floor:1, ceiling:3, substances:["expeller pressed oil","artisan"], reason:"La Tourangelle — artisan expeller-pressed oils (walnut, avocado, grapeseed, etc.). No hexane extraction, non-GMO. One of the cleanest mainstream specialty oil brands.", confidence:"high", category:"food_beverage" }],
  ["spectrum naturals oil",           { floor:2, ceiling:4, substances:["organic oil","non-hexane","non-GMO"], reason:"Spectrum Organics — USDA organic, non-hexane extraction (confirmed). Non-GMO. Significantly cleaner than Wesson or Mazola despite being a canola or safflower product.", confidence:"high", category:"food_beverage" }],
  ["thrive algae oil",                { floor:1, ceiling:3, substances:["algae oil","non-GMO","high oleic"], reason:"Thrive Algae Oil — sustainably fermented algae oil, high oleic (stable for cooking), no hexane, non-GMO. Genuinely novel clean cooking oil alternative to seed oils.", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // ENERGY DRINKS (additions)
  // ══════════════════════════════════════════════════════════════

  ["alani nu energy",                 { floor:4, ceiling:6, substances:["sucralose","acesulfame potassium","sodium benzoate","200mg caffeine"], reason:"Alani Nu — sucralose + acesulfame potassium (double artificial sweetener), sodium benzoate preservative, 200mg caffeine, erythritol. No artificial colors, no HFCS. Similar concern to Celsius. Sucralose and Ace-K are the primary flags.", confidence:"high", category:"beverage" }],
  ["alani nu",                        { floor:4, ceiling:6, substances:["sucralose","acesulfame potassium","preservatives"], reason:"Alani Nu — double artificial sweetener profile (sucralose + Ace-K). Mid-tier energy drink concern.", confidence:"high", category:"beverage" }],
  ["reign",                    { floor:4, ceiling:6, substances:["sucralose","caffeine 300mg","BCAAs","coenzyme Q10"], reason:"Reign — 300mg caffeine (highest among mainstream brands), sucralose, sodium benzoate, citric acid, BCAAs. Higher caffeine than Celsius or Alani Nu. No HFCS, no artificial colors.", confidence:"high", category:"beverage" }],
  ["rockstar",                 { floor:4, ceiling:7, substances:["sucralose or sugar","taurine","caffeine","B vitamins"], reason:"Rockstar — varies by variety. Sugar versions have HFCS + artificial color. Sugar-free versions use sucralose + acesulfame K. Pepsi owned. Mid-to-high concern depending on variety.", confidence:"medium", category:"beverage" }],
  ["5 hour energy",                   { floor:4, ceiling:6, substances:["niacin 8333% DV","sucralose","caffeine","artificial flavor"], reason:"5-Hour Energy — 8333% daily value niacin (risk of niacin flush at high doses), sucralose, malic acid, artificial flavor, phenylalanine. 2oz format concentrates additives. Mid-tier supplement/energy concern.", confidence:"high", category:"beverage" }],
  ["ghost energy drink",              { floor:4, ceiling:6, substances:["sucralose","natural flavor","caffeine 200mg","acetyl-l-carnitine"], reason:"Ghost Energy — sucralose, acetyl-l-carnitine, alpha GPC, 200mg caffeine, citric acid. Gaming/lifestyle brand. Similar concern profile to Alani Nu.", confidence:"medium", category:"beverage" }],
  ["nos energy",                      { floor:5, ceiling:7, substances:["HFCS or sucralose","artificial color","taurine","caffeine"], reason:"NOS Energy — original has HFCS + caramel color. Sugar-free has sucralose + artificial colors. Coca-Cola owned. Among more processed mainstream energy drinks.", confidence:"medium", category:"beverage" }],
  ["bloom greens",                    { floor:3, ceiling:5, substances:["spirulina","digestive enzymes","natural flavor","stevia"], reason:"Bloom Greens — greens powder with spirulina, digestive enzymes, probiotics, stevia, natural flavors. No artificial sweeteners. Mid-tier supplement powder with reasonable ingredient list.", confidence:"medium", category:"supplement" }],

  // ══════════════════════════════════════════════════════════════
  // SPIRITS AND ALCOHOL (additions)
  // ══════════════════════════════════════════════════════════════

  ["modelo especial",                 { floor:2, ceiling:4, substances:["water","barley malt","corn","hops"], reason:"Modelo Especial — water, barley malt, non-malted cereals (corn), hops. Standard Mexican lager. Simple ingredients, no artificial additives, no added sugars. Moderate beer concern: alcohol, glyphosate residue on barley.", confidence:"high", category:"beverage" }],
  ["stella artois beer",              { floor:2, ceiling:4, substances:["water","barley malt","corn","hops"], reason:"Stella Artois — water, barley malt, corn, hops, yeast. Standard European lager. Simple ingredients. Same baseline beer concern.", confidence:"high", category:"beverage" }],
  ["patron tequila",                  { floor:1, ceiling:3, substances:["100% blue agave"], reason:"Patron — 100% blue agave tequila, no additives permitted under tequila regulations for 100% agave. Cleanest spirit category. Primary concern is alcohol itself.", confidence:"high", category:"beverage" }],
  ["don julio tequila",               { floor:1, ceiling:3, substances:["100% blue agave"], reason:"Don Julio — 100% blue agave, estate-grown, no additives. Same clean profile as Patron for 100% agave tequila.", confidence:"high", category:"beverage" }],
  ["espolon tequila",                 { floor:1, ceiling:3, substances:["100% blue agave"], reason:"Espolon — 100% blue agave, certified. Clean tequila profile.", confidence:"high", category:"beverage" }],
  ["makers mark",                     { floor:2, ceiling:4, substances:["corn","red winter wheat","malted barley","water"], reason:"Maker's Mark — corn, soft red winter wheat, malted barley, limestone spring water. No rye, distinctive wheated bourbon profile. Simple clean whiskey ingredients.", confidence:"high", category:"beverage" }],
  ["crown royal",                     { floor:2, ceiling:4, substances:["corn","rye","malted barley","water"], reason:"Crown Royal — Canadian whisky blend, corn/rye/barley malt, no artificial additives. Standard clean whisky profile.", confidence:"high", category:"beverage" }],
  ["evan williams bourbon",           { floor:2, ceiling:4, substances:["corn","rye","barley malt"], reason:"Evan Williams — corn, rye, malted barley. Budget bourbon with same clean distilled spirit profile. No additives.", confidence:"high", category:"beverage" }],
  ["fireball",                 { floor:4, ceiling:6, substances:["whisky","cinnamon flavoring","sweeteners","propylene glycol"], reason:"Fireball Cinnamon Whisky — whisky + natural cinnamon flavoring + sweeteners + propylene glycol (used as carrier). Propylene glycol is FDA-approved but a synthetic additive in an alcoholic beverage. Flavored whisky, not straight whisky.", confidence:"high", category:"beverage" }],
  ["malibu rum",                      { floor:4, ceiling:6, substances:["coconut rum","sugar","natural flavors","artificial flavor"], reason:"Malibu — rum, sugar, coconut flavoring (natural and artificial). Artificial flavoring and added sugar make this a higher concern than unflavored spirits. Liqueur-style product.", confidence:"high", category:"beverage" }],
  ["grey goose vodka",                { floor:1, ceiling:3, substances:["French wheat","spring water"], reason:"Grey Goose — soft winter wheat from Picardy, France + Gensac spring water. No additives, no flavoring in original. Premium unflavored vodka with simple clean ingredients.", confidence:"high", category:"beverage" }],
  ["hendricks gin",                   { floor:2, ceiling:4, substances:["grain spirits","11 botanicals","rose","cucumber"], reason:"Hendrick's Gin — grain spirit with 11 botanicals including rose and cucumber. Natural botanicals only. No artificial flavors or colors. Standard clean gin profile.", confidence:"high", category:"beverage" }],

  // ══════════════════════════════════════════════════════════════
  // FAST FOOD ADDITIONS
  // ══════════════════════════════════════════════════════════════

  ["wendys crispy",          { floor:5, ceiling:7, substances:["enriched flour","soybean oil","sodium","DATEM","natural flavor"], reason:"Wendy's Crispy Chicken Sandwich — enriched flour breading, soybean oil frying, DATEM dough conditioner, very high sodium (1300mg+), natural flavors. Standard fast food fried chicken concern.", confidence:"high", category:"restaurant" }],
  ["wendys chili",                   { floor:3, ceiling:5, substances:["beef","beans","tomato","sodium","natural flavor"], reason:"Wendy's Chili — ground beef, beans, tomato, chili sauce. One of the cleaner fast food items: real ingredients, no enriched flour, relatively moderate sodium. Still processed with natural flavors.", confidence:"high", category:"restaurant" }],
  ["wendys baked",            { floor:2, ceiling:4, substances:["potato","butter","sour cream"], reason:"Wendy's Plain Baked Potato — single ingredient (russet potato) with optional simple toppings. One of the cleanest fast food sides available.", confidence:"high", category:"restaurant" }],
  ["burger king crispy chicken",      { floor:5, ceiling:7, substances:["enriched flour","soybean oil","sodium","modified starch"], reason:"Burger King Crispy Chicken Sandwich — enriched flour, soybean oil, modified starch, high sodium (1100mg). Standard fast food fried chicken concern.", confidence:"medium", category:"restaurant" }],
  ["jack in the box sourdough jack",  { floor:6, ceiling:8, substances:["enriched bread","beef","sodium","modified starch","natural flavor"], reason:"Jack in the Box Sourdough Jack — processed 'sourdough' bread (enriched flour, DATEM), beef patty, very high sodium (1200mg+), natural flavors. One of the higher-sodium fast food burgers.", confidence:"medium", category:"restaurant" }],
  ["zaxby's chicken fingers",         { floor:5, ceiling:7, substances:["enriched flour","soybean oil","sodium","natural flavor"], reason:"Zaxby's — breaded chicken tenders, enriched flour, soybean oil frying, high sodium (800mg+), natural flavors. Similar to Raising Cane's but with more processing in the bread coating.", confidence:"medium", category:"restaurant" }],
  ["el pollo loco chicken",           { floor:3, ceiling:5, substances:["fire-grilled chicken","citrus marinade","sodium"], reason:"El Pollo Loco fire-grilled chicken — marinated in citrus, spices, garlic, fire-grilled (not fried). One of the cleaner fast food protein options. Lower sodium than fried competitors. Still commercial marinade with natural flavors.", confidence:"high", category:"restaurant" }],
  ["chick-fil-a nuggets",             { floor:5, ceiling:7, substances:["enriched flour","soybean oil","sodium","MSG","sugar"], reason:"Chick-fil-A Nuggets — enriched flour, soybean oil frying, MSG, sugar in batter, high sodium (940mg for 12 count). Similar concern to crispy sandwich but smaller portions.", confidence:"high", category:"restaurant" }],
  ["mcdonald's quarter pounder",      { floor:5, ceiling:7, substances:["beef","enriched bun","sodium","DATEM","natural flavor"], reason:"McDonald's Quarter Pounder — 100% beef, enriched white bun, DATEM, high sodium (1110mg), natural flavors. Fresh never-frozen beef since 2018 is a mild positive. Still enriched bun and high sodium.", confidence:"high", category:"restaurant" }],
  ["mcdonald's grilled chicken",      { floor:4, ceiling:6, substances:["chicken","sodium","natural flavor","enriched bun"], reason:"McDonald's Grilled Chicken Sandwich — grilled chicken breast, enriched bun, high sodium (820mg), natural flavors. Cleaner than McChicken (no frying) but still processed bun and sodium.", confidence:"medium", category:"restaurant" }],
  ["starbucks egg white bites",       { floor:3, ceiling:5, substances:["egg whites","cottage cheese","gruyere","sodium"], reason:"Starbucks Egg White Bites — egg whites, cottage cheese, gruyere, red pepper. Relatively clean protein option. Cooked sous vide. Primary concern: high sodium (440mg) and commercial preparation.", confidence:"high", category:"restaurant" }],

  // ══════════════════════════════════════════════════════════════
  // PERSONAL CARE ADDITIONS
  // ══════════════════════════════════════════════════════════════

    ["dove sensitive",             { floor:3, ceiling:5, substances:["sodium lauryl sulfate","synthetic fragrance","dimethicone"], reason:"Dove Sensitive — SLS, synthetic fragrance, dimethicone. Standard Dove concern.", confidence:"high", category:"personal_care" }],
  ["dove original",              { floor:3, ceiling:5, substances:["sodium lauroyl isethionate","synthetic fragrance","BHT"], reason:"Dove Original — sodium lauroyl isethionate, synthetic fragrance, BHT.", confidence:"high", category:"personal_care" }],
  ["dove deep",              { floor:3, ceiling:5, substances:["sodium lauryl sulfate","synthetic fragrance","dimethicone"], reason:"Dove Deep Moisture — SLS, synthetic fragrance, dimethicone. Same as dove body wash profile.", confidence:"high", category:"personal_care" }],
  ["dove body",                  { floor:3, ceiling:5, substances:["sodium lauryl sulfate","synthetic fragrance","dimethicone","DMDM hydantoin"], reason:"Dove Body Wash — sodium lauryl sulfate, synthetic fragrance, dimethicone silicone, DMDM hydantoin (formaldehyde releaser) in some formulations. Positioned as moisturizing but standard mass-market synthetic concern.", confidence:"high", category:"personal_care" }],
  ["dove deodorant",                  { floor:3, ceiling:5, substances:["synthetic fragrance","propylene glycol","dimethicone"], reason:"Dove Deodorant — synthetic fragrance, propylene glycol, dimethicone. No aluminum (deodorant version). Standard mass-market deodorant without aluminum concern.", confidence:"high", category:"personal_care" }],
  ["dove antiperspirant",             { floor:5, ceiling:7, substances:["aluminum zirconium","synthetic fragrance","propylene glycol","dimethicone"], reason:"Dove Antiperspirant — aluminum zirconium tetrachlorohydrex (endocrine concern, breast proximity), synthetic fragrance, propylene glycol. Floor fires on aluminum antiperspirant.", confidence:"high", category:"personal_care" }],
  ["aveeno body wash",                { floor:3, ceiling:5, substances:["colloidal oatmeal","phenoxyethanol","synthetic fragrance","SLS"], reason:"Aveeno Daily Moisturizing Body Wash — colloidal oatmeal (positive), SLS in some variants, phenoxyethanol, synthetic fragrance or 'fragrance-free' versions. Oat positioning is marketing-driven; formulation has standard concerns.", confidence:"high", category:"personal_care" }],
  ["aveeno lotion",                   { floor:3, ceiling:5, substances:["colloidal oatmeal","petrolatum","phenoxyethanol","fragrance"], reason:"Aveeno Daily Moisturizing Lotion — colloidal oatmeal, petrolatum (petroleum-derived occlusive), phenoxyethanol, synthetic fragrance in scented versions. J&J owned. Moderate concern.", confidence:"high", category:"personal_care" }],
  ["cerave moisturizing cream",       { floor:3, ceiling:5, substances:["ceramides","hyaluronic acid","niacinamide","petrolatum","phenoxyethanol","parabens"], reason:"CeraVe Moisturizing Cream — ceramides + hyaluronic acid (excellent actives), but petrolatum, methylparaben, propylparaben in the cream formula. EWG rates 3 due to parabens. The cleanser is lower concern than the cream.", confidence:"high", category:"personal_care" }],
  ["cerave hydrating",         { floor:2, ceiling:4, substances:["ceramides","hyaluronic acid","niacinamide","phenoxyethanol"], reason:"CeraVe Hydrating Cleanser — ceramides, hyaluronic acid, no SLS, phenoxyethanol. Cleaner than CeraVe cream.", confidence:"high", category:"personal_care" }],
  ["cerave cleanser",                 { floor:2, ceiling:4, substances:["ceramides","hyaluronic acid","niacinamide","phenoxyethanol"], reason:"CeraVe Hydrating Facial Cleanser — ceramides, hyaluronic acid, niacinamide. No SLS, no parabens in the cleanser. Phenoxyethanol preservative. One of the cleaner drugstore cleansers.", confidence:"high", category:"personal_care" }],
  ["cerave",                          { floor:3, ceiling:5, substances:["ceramides","hyaluronic acid","petrolatum","phenoxyethanol"], reason:"CeraVe brand — functional active ingredients (ceramides, HA) but some products contain parabens and petrolatum. Score by specific product: cleanser 2-4, cream 3-5.", confidence:"high", category:"personal_care" }],
  ["neutrogena hydro boost",          { floor:3, ceiling:5, substances:["hyaluronic acid","dimethicone","phenoxyethanol","fragrance"], reason:"Neutrogena Hydro Boost — hyaluronic acid water gel, dimethicone, phenoxyethanol, fragrance in some variants. J&J formulation, no parabens. EWG 3. Mid-tier drugstore moisturizer.", confidence:"high", category:"personal_care" }],
  ["neutrogena sunscreen",            { floor:4, ceiling:6, substances:["avobenzone","homosalate","octisalate","synthetic fragrance"], reason:"Neutrogena chemical sunscreens — avobenzone, homosalate, octisalate (hormone-disrupting oxybenzone-adjacent chemicals). EWG rates these 4-7. Hawaii has banned oxybenzone due to reef damage.", confidence:"high", category:"personal_care" }],
  ["e.l.f. cosmetics",               { floor:3, ceiling:5, substances:["synthetic dyes","phenoxyethanol","synthetic fragrance"], reason:"e.l.f. — affordable mass-market cosmetics with synthetic dyes, phenoxyethanol, some fragrance. No parabens, vegan and cruelty-free. EWG rates most e.l.f. products 3-5. Better than Maybelline/L'Oreal on some concerns.", confidence:"medium", category:"personal_care" }],
  ["nyx cosmetics",                   { floor:4, ceiling:6, substances:["synthetic dyes","BHT","parabens on some","synthetic fragrance"], reason:"NYX — L'Oreal owned. Synthetic dyes including petroleum-derived Red 40/Yellow 5, BHT, parabens in some products, synthetic fragrance. Standard mass-market cosmetic concern.", confidence:"medium", category:"personal_care" }],
  ["revlon lipstick",                 { floor:6, ceiling:7, substances:["D&C dyes","synthetic fragrance","BHT","lead traces"], reason:"Revlon lipstick — D&C petroleum-derived color pigments, synthetic fragrance, BHT antioxidant. Historical FDA testing found trace lead in many lipstick brands including Revlon. Applied to lips = direct ingestion exposure.", confidence:"high", category:"personal_care" }],
  ["colgate",              { floor:3, ceiling:5, substances:["fluoride","SLS","sodium saccharin","artificial flavor"], reason:"Colgate Total — fluoride (effective for dental health, controversial for systemic exposure at high doses), SLS (causes mouth ulcers in some people), sodium saccharin, artificial flavor. Standard drugstore toothpaste concern.", confidence:"high", category:"personal_care" }],
  ["sensodyne toothpaste",            { floor:2, ceiling:4, substances:["potassium nitrate or stannous fluoride","SLS-free on some"], reason:"Sensodyne — potassium nitrate or stannous fluoride for sensitivity. Many Sensodyne formulas are SLS-free (lower irritation). Cleaner than standard Colgate/Crest for sensitive users.", confidence:"high", category:"personal_care" }],
  ["listerine mouthwash",             { floor:3, ceiling:5, substances:["alcohol 21.6%","eucalyptol","menthol","artificial color"], reason:"Listerine Cool Mint — 21.6% alcohol (primary concern: dry mouth, microbiome disruption), eucalyptol, menthol, thymol, artificial color (Blue 1, Yellow 10). High alcohol content is the main concern for daily use.", confidence:"high", category:"personal_care" }],

  // ── KIRKLAND PFAS-CONTAINING PRODUCTS ────────────────────────
  // Costco store-brand items with documented PFAS exposure routes.
  // Calibration explicit per SKU rather than relying on the brand-level
  // entry (which is for plain nuts only). Multi-state bans starting 2027
  // for PFAS in floss, cookware, food packaging.
  ["kirkland mint dental floss",      { floor:5, ceiling:7, substances:["PTFE coating (PFAS family)"], reason:"Kirkland Mint Dental Floss — PTFE coating is the same fluoropolymer family as Teflon. Daily oral exposure with trace ingestion. Vermont, New Mexico, Minnesota, and Illinois have banned PTFE in dental floss starting 2027. Ingredients verified 04 2026.", confidence:"high", category:"personal_care" }],
  ["kirkland microwave popcorn",      { floor:4, ceiling:6, substances:["legacy PFAS bag liner","artificial flavor","palm oil"], reason:"Kirkland Microwave Popcorn. FDA completed voluntary PFAS phase-out in food packaging February 2024, with state level bans in California, Maine, and Washington reinforcing the move. Current production should ship with PFAS-free bag liners. Legacy retail inventory may still carry PFAS-coated bags, and replacement grease proofing chemistry has limited public toxicology data. The product itself is ultra processed: artificial flavor, palm oil, and the buttered bag and heat profile concentrates flavor chemistry not present in stovetop popcorn. Score reflects processing profile plus residual legacy inventory uncertainty rather than current intentional PFAS use. Ingredients verified 05 2026.", confidence:"high", category:"food_beverage" }],
  ["kirkland non-stick cookware",     { floor:6, ceiling:8, substances:["PTFE coating","PFAS"], reason:"Kirkland Non-Stick Cookware — PTFE coating degrades above 500F, releasing PFAS into food and air. Daily cookware contact across years of use. Minnesota, Vermont, and New Mexico have banned PFAS in cookware starting 2027. Ingredients verified 04 2026.", confidence:"high", category:"home" }],
  ["kirkland baby wipes",             { floor:5, ceiling:7, kidsFloor:7, substances:["fluoro compounds","fragrance","preservatives"], reason:"Kirkland Baby Wipes — fluoro compounds detected in lab testing of the wipe substrate. Skin absorption is the primary route; infant skin is up to five times more permeable than adult skin. Daily use through the most vulnerable years. Ingredients verified 04 2026.", confidence:"high", category:"baby" }],
  ["kirkland parchment paper",        { floor:5, ceiling:7, substances:["PFAS coating","bleached paper"], reason:"Kirkland Parchment Paper — grease-resistant coating contains PFAS that transfer into food during baking. Each use compounds exposure for kids who eat baked snacks frequently. California, Maine, and Washington have banned PFAS in food packaging. Ingredients verified 04 2026.", confidence:"high", category:"home" }],
];

// ─── BUILD LOOKUP MAP ─────────────────────────────────────────
const CALIBRATION = new Map(ENTRIES.map(([k, v]) => [normalise(k), v]));

// ─── APPLY CALIBRATION ────────────────────────────────────────
/**
 * Applies floor/ceiling from the calibration registry to a scan result.
 * Runs in <1ms. Adds calibration_override field if correction was made.
 */
// ─── WHOLE FOODS BANNED INGREDIENTS ──────────────────────────
// Source: Leading clean grocery retailer ingredient standards (source: major clean grocery retailer, 300+ banned ingredients)
// Normalized to match substance names used in CALIBRATION entries.
// Any product whose calibration entry contains a WF-banned substance
// will automatically receive retailer_restricted: true in the result.

const WF_BANNED = new Set([
  // Sweeteners
  "acesulfame-k", "acesulfame k", "ace-k",
  "aspartame",
  "sucralose",
  "saccharin",
  "allulose",
  "neotame",
  "advantame",
  "hfcs", "high-fructose corn syrup", "high fructose corn syrup",
  // FD&C Synthetic Dyes
  "red 40", "fd&c red 40", "red40",
  "yellow 5", "fd&c yellow 5", "yellow5",
  "yellow 6", "fd&c yellow 6", "yellow6",
  "blue 1", "fd&c blue 1", "blue1",
  "blue 2", "green 3", "red 3",
  "artificial color", "artificial colors",
  "petroleum dyes", "certified colors", "azo dyes",
  // Preservatives
  "tbhq", "tertiary butylhydroquinone",
  "bha", "butylated hydroxyanisole",
  "bht", "butylated hydroxytoluene",
  "sodium benzoate", "potassium benzoate", "calcium benzoate",
  "sodium nitrite", "sodium nitrate",
  "potassium nitrite", "potassium nitrate",
  "nitrites", "nitrates",
  "sodium propionate", "potassium propionate", "calcium propionate",
  "potassium sorbate", "sodium sorbate", "calcium sorbate", "sorbic acid",
  "sodium diacetate", "propionic acid", "natamycin", "ethoxyquin",
  // Dough conditioners / emulsifiers
  "azodicarbonamide", "ada",
  "datem",
  "sodium stearoyl lactylate", "sodium stearoyl-2-lactylate",
  "calcium stearoyl lactylate", "calcium stearoyl-2-lactylate",
  // Fats
  "partially hydrogenated oil", "partially hydrogenated oils",
  "hydrogenated oil", "hydrogenated oils", "trans fat",
  // Flavor enhancers
  "msg", "monosodium glutamate",
  "disodium inosinate", "disodium guanylate",
  "mechanically separated", "mechanically separated meat",
  "mechanically separated chicken",
  // Sulfites (except wine)
  "potassium metabisulfite",
  "sodium metabisulfite", "sodium bisulfite",
  // Other
  "brominated vegetable oil", "bvo",
  "potassium bromate", "bleached flour",
  "olestra", "carmine", "cochineal",
  "sodium lauryl sulfate",
  "edta", "calcium disodium edta",
  "sodium aluminum phosphate", "sodium aluminum sulfate",
]);

// ─── NUTRITION LOOKUP TABLE ───────────────────────────────────────────────────
// Bakes known per-serving nutrition into calibration entries at startup.
// This ensures sugar/sodium/sat_fat floors fire even when the AI returns null
// nutrition — which happens frequently for text-only scans.
//
// Format: key → { sugar_g, sodium_mg, sat_fat_g, calories, protein_g?, fiber_g?,
//                 kidsFloor?, kidsCeiling? }
// Keys must match calibration keys exactly (normalised lowercase).
//
// Sources: USDA FoodData Central, FDA label data, manufacturer sites.
// Per-serving as defined on the product label.

const NUTRITION_LOOKUP = new Map([
  // ── CEREALS ────────────────────────────────────────────────────────────────

  // ── CANDY & CHOCOLATE ──────────────────────────────────────────────────────

  // ── SNACKS & CHIPS ─────────────────────────────────────────────────────────

  // ── BEVERAGES ──────────────────────────────────────────────────────────────

  // ── BREAKFAST ──────────────────────────────────────────────────────────────

  // ── FAST FOOD & RESTAURANT ─────────────────────────────────────────────────

  // ── CONDIMENTS ─────────────────────────────────────────────────────────────

  // ── DAIRY ──────────────────────────────────────────────────────────────────
  // Mascarpone: cream + citric/tartaric acid — 2 ingredients, no additives
  ["mascarpone",                    { floor:2, ceiling:3, substances:[], reason:"Mascarpone — pasteurised cream + citric or tartaric acid. Two ingredients, minimal processing, no artificial additives. Sat fat is high but ingredient list is clean. Floor 2, ceiling 3.", confidence:"high", category:"food_beverage" }],
  ["mascarpone cheese",             { floor:2, ceiling:3, substances:[], reason:"Mascarpone cheese — cream + citric acid. Same as mascarpone entry.", confidence:"high", category:"food_beverage" }],
  ["mascarpone farmstead",          { floor:2, ceiling:3, substances:[], reason:"Farmstead mascarpone — small batch cream cheese, clean ingredient profile.", confidence:"high", category:"food_beverage" }],
  ["farmstead mascarpone",          { floor:2, ceiling:3, substances:[], reason:"Farmstead mascarpone — same as mascarpone entry.", confidence:"high", category:"food_beverage" }],
  // Other clean fresh cheeses
  ["fresh mozzarella",              { floor:1, ceiling:2, substances:[], reason:"Fresh mozzarella — pasteurised milk + cultures + salt. Minimal processing. One of the cleanest dairy products.", confidence:"high", category:"food_beverage" }],
  ["burrata",                       { floor:1, ceiling:2, substances:[], reason:"Burrata — fresh mozzarella + cream. Two ingredients, no additives.", confidence:"high", category:"food_beverage" }],
  ["ricotta",                       { floor:1, ceiling:3, substances:[], reason:"Ricotta — whey + cream or milk + acid. Simple ingredients, low concern unless additives present.", confidence:"high", category:"food_beverage" }],
  ["cottage cheese",                { floor:2, ceiling:4, substances:[], reason:"Cottage cheese — milk + cultures + salt, sometimes gum thickeners. Clean base; some brands add carrageenan which bumps score.", confidence:"medium", category:"food_beverage" }],

  // ── FROZEN ─────────────────────────────────────────────────────────────────

  // ── BREAD & BAKERY ─────────────────────────────────────────────────────────

  // ── PEANUT BUTTER & SPREADS ────────────────────────────────────────────────

  // ── SOUPS & CANNED ─────────────────────────────────────────────────────────

  // ── PASTA & GRAINS ─────────────────────────────────────────────────────────

  // ── KIDS FOOD ──────────────────────────────────────────────────────────────

  // ── SODAS AND SUGARY DRINKS ───────────────────────────────────

  // ── ENERGY DRINKS ─────────────────────────────────────────────

  // ── ALCOHOL ───────────────────────────────────────────────────

  // ── CANDY ─────────────────────────────────────────────────────

  // ── CEREALS (additions) ───────────────────────────────────────

  // ── SNACK CHIPS ───────────────────────────────────────────────

  // ── BREAKFAST ITEMS ───────────────────────────────────────────

  // ── BREAD AND BAKED GOODS ─────────────────────────────────────

  // ── DELI MEAT AND PROCESSED MEAT ─────────────────────────────

  // ── FROZEN FOOD ───────────────────────────────────────────────

  // ── COFFEE CREAMERS AND SYRUPS ────────────────────────────────

  // ── CONDIMENTS ────────────────────────────────────────────────

  // ── LUNCHABLES ────────────────────────────────────────────────

  // ── PROTEIN BARS ─────────────────────────────────────────────

  // ── FAST FOOD — MCDONALD'S ────────────────────────────────────

  // ── FAST FOOD — BURGER KING ───────────────────────────────────

  // ── FAST FOOD — CHICK-FIL-A ──────────────────────────────────

  // ── FAST FOOD — KFC / POPEYES ─────────────────────────────────

  // ── FAST FOOD — PIZZA ─────────────────────────────────────────

  // ── FAST FOOD — SUBWAY / SANDWICHES ──────────────────────────

  // ── FAST FOOD — BREAKFAST ─────────────────────────────────────

  // ── SIT-DOWN RESTAURANTS ─────────────────────────────────────

  // ── TACO BELL / CHIPOTLE ──────────────────────────────────────

  // ── PANERA / STARBUCKS / OTHER CHAINS ────────────────────────

  // ── PANDA EXPRESS ─────────────────────────────────────────────

  // ── WENDYS ───────────────────────────────────────────────────

  // ── SUBWAY ────────────────────────────────────────────────────

  // ── DOMINOS ───────────────────────────────────────────────────

  // ── PIZZA HUT ─────────────────────────────────────────────────

  // ── FIVE GUYS ─────────────────────────────────────────────────

  // ── IN-N-OUT ──────────────────────────────────────────────────

  // ── PAPA JOHNS ────────────────────────────────────────────────

  // ── TACO BELL ─────────────────────────────────────────────────

  // ── APPLEBEES / CHEESECAKE FACTORY / RED ROBIN ────────────────

  // ── MCDONALDS EXPANDED ────────────────────────────────────────

  // ── REMAINING 126 ENTRIES ─────────────────────────────────────

  // Fruit snacks / kid beverages

  // Sweeteners

  // Juices and juice drinks (not yet covered)

  // Plant milks

  // Sports / hydration

  // Coffee creamers / syrups

  // Condiments / sauces

  // Snacks and crackers

  // Dairy / eggs

  // Bread / gluten-free

  // Rice / pantry staples

  // Alcohol (remaining)

  // Indian / international

  // Restaurant missing

  // Frozen / trader joe's

  // Misc

  // Remaining food items (non-pet-food)
]);

// ─── APPLY NUTRITION LOOKUP TO CALIBRATION ENTRIES ───────────────────────────
// At startup, merge nutrition lookup data into any calibration entry that
// doesn't already have nutrition baked in. Also applies kidsFloor/kidsCeiling.
(function applyNutritionLookup() {
  for (const [key, entry] of CALIBRATION) {
    const lookup = NUTRITION_LOOKUP.get(key);
    if (!lookup) continue;
    if (!entry.nutrition) {
      entry.nutrition = {
        sugar_g:    lookup.sugar_g    ?? null,
        sodium_mg:  lookup.sodium_mg  ?? null,
        sat_fat_g:  lookup.sat_fat_g  ?? null,
        calories:   lookup.calories   ?? null,
        protein_g:  lookup.protein_g  ?? null,
        fiber_g:    lookup.fiber_g    ?? null,
      };
    }
    if (entry.kidsFloor  == null && lookup.kidsFloor  != null) entry.kidsFloor  = lookup.kidsFloor;
    if (entry.kidsCeiling == null && lookup.kidsCeiling != null) entry.kidsCeiling = lookup.kidsCeiling;
  }
})();

// Check if a calibration entry contains any WF-banned substance
function checkWholeFoodsBanned(substances = []) {
  const normed = substances.map(s => s.toLowerCase().trim());
  return normed.some(s => {
    // Direct match
    if (WF_BANNED.has(s)) return true;
    // Substance name contains a banned ingredient (e.g. substance is a longer phrase)
    // Only check s.includes(banned) — not banned.includes(s) — to avoid false positives
    // where short substance words like "corn" match inside longer banned names like "corn syrup"
    for (const banned of WF_BANNED) {
      if (banned.length >= 6 && s.includes(banned)) return true;
    }
    return false;
  });
}

// ─── SUGAR FLOOR SYSTEM ──────────────────────────────────────────────────────
// Applies a minimum score floor based on sugar content per serving.
// Operates on top of ingredient-based floors — the higher of the two wins.
//
// Adult DV for added sugar: 50g (FDA). WHO recommends <25g free sugars/day.
// Children DV (ages 4-8): ~25g (AAP/AHA) — thresholds are roughly halved.
//
// Beverages score more aggressively because there is no fiber/fat/protein
// to buffer the glycemic impact. Food and restaurant get higher thresholds.

function applySugarFloor(score, sugar_g, category, kids_mode) {
  if (sugar_g == null || sugar_g <= 0) return score;

  const isBeverage   = category === "beverage" || category === "food_beverage";
  const isRestaurant = category === "restaurant";
  // Food and restaurant get the same (more lenient) thresholds.
  // Pure beverages get tighter thresholds — no buffering.

  let sugarFloor = 0;
  let sugarNote  = "";

  if (!kids_mode) {
    // ── ADULT TIERS ────────────────────────────────────────────
    if (isBeverage) {
      // Beverage: tighter — pure liquid, no buffering
      if      (sugar_g >= 50) { sugarFloor = 7; sugarNote = "100%+ adult daily sugar limit in one drink"; }
      else if (sugar_g >= 40) { sugarFloor = 6; sugarNote = "80-99% adult daily sugar limit"; }
      else if (sugar_g >= 30) { sugarFloor = 5; sugarNote = "60-79% adult daily sugar limit"; }
      else if (sugar_g >= 20) { sugarFloor = 4; sugarNote = "40-59% adult daily sugar limit"; }
      else if (sugar_g >= 10) { sugarFloor = 3; sugarNote = "significant sugar for a beverage"; }
    } else {
      // Food / restaurant: more lenient — fiber/protein/fat buffer
      if      (sugar_g >= 50) { sugarFloor = 6; sugarNote = "100%+ adult daily sugar limit in one serving"; }
      else if (sugar_g >= 35) { sugarFloor = 5; sugarNote = "70-99% adult daily sugar limit"; }
      else if (sugar_g >= 25) { sugarFloor = 4; sugarNote = "50-69% adult daily sugar limit"; }
      else if (sugar_g >= 15) { sugarFloor = 3; sugarNote = "30-49% adult daily sugar limit"; }
    }
  } else {
    // ── CHILDREN'S TIERS (DV ~25g, thresholds ~halved) ────────
    // Kids have half the daily sugar budget. Same serving hits them twice as hard.
    if (isBeverage) {
      if      (sugar_g >= 25) { sugarFloor = 7; sugarNote = "100%+ children's daily sugar limit in one drink"; }
      else if (sugar_g >= 20) { sugarFloor = 6; sugarNote = "80-99% children's daily sugar limit"; }
      else if (sugar_g >= 15) { sugarFloor = 5; sugarNote = "60-79% children's daily sugar limit"; }
      else if (sugar_g >= 10) { sugarFloor = 4; sugarNote = "40-59% children's daily sugar limit"; }
      else if (sugar_g >=  5) { sugarFloor = 3; sugarNote = "significant sugar for a child's drink"; }
    } else {
      // Food / restaurant for kids
      if      (sugar_g >= 25) { sugarFloor = 6; sugarNote = "100%+ children's daily sugar limit"; }
      else if (sugar_g >= 20) { sugarFloor = 5; sugarNote = "80-99% children's daily sugar limit"; }
      else if (sugar_g >= 14) { sugarFloor = 4; sugarNote = "56-79% children's daily sugar limit"; }
      else if (sugar_g >=  8) { sugarFloor = 3; sugarNote = "32-55% children's daily sugar limit"; }
    }
  }

  if (sugarFloor > score) {
    console.log(`[CAL] Sugar floor: ${sugar_g}g sugar → floor ${sugarFloor} (${sugarNote}) [kids_mode: ${!!kids_mode}]`);
    return sugarFloor;
  }
  return score;
}

// ─── SODIUM FLOOR SYSTEM ─────────────────────────────────────────────────────
// Adult DV: 2300mg/day. Kids DV: 1500mg/day (ages 4–8, AAP).
// Applies to food, beverage, and restaurant categories.
// Sodium is scored uniformly — unlike sugar, beverages don't get tighter thresholds
// because liquid sodium (e.g., soup broth, sports drinks) is less rapidly absorbed.

function applySodiumFloor(score, sodium_mg, category, kids_mode) {
  if (sodium_mg == null || sodium_mg <= 0) return score;
  if (category === "personal_care" || category === "clothing" || category === "home" || category === "supplement") return score;

  let floor = 0;
  let note  = "";

  if (!kids_mode) {
    // Adult DV: 2300mg — added tier 7 for extreme (>100% DV, restaurant/processed food)
    if      (sodium_mg >= 2300) { floor = 7; note = "100%+ adult daily sodium limit in one serving"; }
    else if (sodium_mg >= 1840) { floor = 6; note = "80-99% adult daily sodium limit"; }
    else if (sodium_mg >= 1380) { floor = 5; note = "60-79% adult daily sodium limit"; }
    else if (sodium_mg >= 920)  { floor = 4; note = "40-59% adult daily sodium limit"; }
    else if (sodium_mg >= 575)  { floor = 3; note = "25-39% adult daily sodium limit"; }
  } else {
    // Kids DV: 1500mg
    if      (sodium_mg >= 1500) { floor = 7; note = "100%+ children's daily sodium limit"; }
    else if (sodium_mg >= 1200) { floor = 6; note = "80-99% children's daily sodium limit"; }
    else if (sodium_mg >= 900)  { floor = 5; note = "60-79% children's daily sodium limit"; }
    else if (sodium_mg >= 600)  { floor = 4; note = "40-59% children's daily sodium limit"; }
    else if (sodium_mg >= 375)  { floor = 3; note = "25-39% children's daily sodium limit"; }
  }

  if (floor > score) {
    console.log(`[CAL] Sodium floor: ${sodium_mg}mg → floor ${floor} (${note}) [kids_mode: ${!!kids_mode}]`);
    return floor;
  }
  return score;
}

// ─── TRANS FAT FLOOR SYSTEM ──────────────────────────────────────────────────
// Trans fat has no safe level (WHO, FDA, AHA). The FDA banned partially
// hydrogenated oils but allows <0.5g per serving to be labelled "0g."
// Any detected trans fat fires floor 6 regardless of other scores.
// Applies to all food/beverage/restaurant categories.

function applyTransFatFloor(score, trans_fat_g, category) {
  if (trans_fat_g == null || trans_fat_g <= 0) return score;
  if (category === "personal_care" || category === "clothing" || category === "home" || category === "supplement") return score;
  const floor = 6;
  if (floor > score) {
    console.log(`[CAL] Trans fat floor: ${trans_fat_g}g detected — no safe level, floor ${floor}`);
    return floor;
  }
  return score;
}

// ─── SATURATED FAT FLOOR SYSTEM ──────────────────────────────────────────────
// Adult DV: 20g/day. Kids DV (ages 4–8): ~13g/day.
// Sat fat floors are gentler than sugar — whole food sources (dairy, meat)
// get partial credit. Applies mainly to restaurant and processed food categories.

function applySatFatFloor(score, sat_fat_g, category, kids_mode) {
  if (sat_fat_g == null || sat_fat_g <= 0) return score;
  if (category === "beverage") return score; // Beverages rarely have meaningful sat fat
  if (category === "personal_care" || category === "clothing" || category === "home") return score;

  let floor = 0;
  let note  = "";

  if (!kids_mode) {
    // Adult DV: 20g — added tier 7 for sat fat >100% DV
    if      (sat_fat_g >= 20) { floor = 7; note = "100%+ adult daily sat fat limit"; }
    else if (sat_fat_g >= 16) { floor = 6; note = "80-99% adult daily sat fat limit"; }
    else if (sat_fat_g >= 12) { floor = 5; note = "60-79% adult daily sat fat limit"; }
    else if (sat_fat_g >= 8)  { floor = 4; note = "40-59% adult daily sat fat limit"; }
    else if (sat_fat_g >= 5)  { floor = 3; note = "25-39% adult daily sat fat limit"; }
  } else {
    // Kids DV: 13g
    if      (sat_fat_g >= 13) { floor = 7; note = "100%+ children's daily sat fat limit"; }
    else if (sat_fat_g >= 10) { floor = 6; note = "77-99% children's daily sat fat limit"; }
    else if (sat_fat_g >= 8)  { floor = 5; note = "62-76% children's daily sat fat limit"; }
    else if (sat_fat_g >= 5)  { floor = 4; note = "38-61% children's daily sat fat limit"; }
    else if (sat_fat_g >= 3)  { floor = 3; note = "23-37% children's daily sat fat limit"; }
  }

  if (floor > score) {
    console.log(`[CAL] Sat fat floor: ${sat_fat_g}g → floor ${floor} (${note}) [kids_mode: ${!!kids_mode}]`);
    return floor;
  }
  return score;
}

// ─── NUTRITION CONCERN BUILDER ───────────────────────────────────────────────
// Converts raw nutrition values into structured concern objects for the frontend.
// Each concern: { nutrient, amount, unit, dv_pct, severity, label, positive? }
// severity: "good" | "low" | "moderate" | "high" | "very_high"
// positive: true when the badge is a beneficial signal (protein, fiber)

function buildNutritionConcerns(nutrition, category, kids_mode) {
  if (!nutrition) return [];
  const concerns = [];

  const isBeverage   = category === "beverage" || category === "food_beverage";
  const isRestaurant = category === "restaurant";
  const isFood       = ["food", "food_beverage", "baby"].includes(category);

  // ── Trans fat — any amount is a red flag ─────────────────────
  if (nutrition.trans_fat_g != null && nutrition.trans_fat_g > 0) {
    concerns.push({
      nutrient: "trans fat", amount: nutrition.trans_fat_g, unit: "g",
      dv_pct: null, severity: "very_high",
      note: "No safe level — FDA banned PHOs but <0.5g/serving can still be labelled 0g"
    });
  }

  // ── Sugar (with added vs. natural distinction) ────────────────
  if (nutrition.sugar_g != null) {
    const dv     = kids_mode ? 25 : 50;
    const pct    = Math.round((nutrition.sugar_g / dv) * 100);
    const isNat  = nutrition.sugar_natural === true;  // backend can flag natural-source sugar
    const hasAdded = nutrition.added_sugar_g != null;
    // Beverages get tighter thresholds — no buffering from fiber/protein/fat
    const sev = isBeverage
      ? (pct >= 80 ? "very_high" : pct >= 60 ? "high" : pct >= 40 ? "moderate" : pct >= 20 ? "low" : "good")
      : (pct >= 100 ? "very_high" : pct >= 70 ? "high" : pct >= 50 ? "moderate" : pct >= 30 ? "low" : "good");
    const addedNote = hasAdded
      ? `${nutrition.added_sugar_g}g added`
      : isNat ? "natural source" : null;
    concerns.push({
      nutrient: "sugar", amount: nutrition.sugar_g, unit: "g",
      dv_pct: pct, severity: sev, dv: dv, note: addedNote
    });
  }

  // ── Sodium ────────────────────────────────────────────────────
  if (nutrition.sodium_mg != null) {
    const dv  = kids_mode ? 1500 : 2300;
    const pct = Math.round((nutrition.sodium_mg / dv) * 100);
    const sev = pct >= 80 ? "very_high" : pct >= 60 ? "high" : pct >= 40 ? "moderate" : pct >= 25 ? "low" : "good";
    concerns.push({ nutrient: "sodium", amount: nutrition.sodium_mg, unit: "mg", dv_pct: pct, severity: sev, dv: dv });
  }

  // ── Saturated Fat ─────────────────────────────────────────────
  if (nutrition.sat_fat_g != null && !isBeverage) {
    const dv  = kids_mode ? 13 : 20;
    const pct = Math.round((nutrition.sat_fat_g / dv) * 100);
    const sev = pct >= 80 ? "very_high" : pct >= 60 ? "high" : pct >= 40 ? "moderate" : pct >= 25 ? "low" : "good";
    concerns.push({ nutrient: "sat fat", amount: nutrition.sat_fat_g, unit: "g", dv_pct: pct, severity: sev, dv: dv });
  }

  // ── Calories — beverages and restaurant only ──────────────────
  // Liquid calories are invisible; restaurant portions are often 2-3x expected.
  // Skip for home food — a 600-cal home meal is expected.
  if (nutrition.calories != null && (isBeverage || isRestaurant)) {
    const dv  = kids_mode ? 1400 : 2000;
    const pct = Math.round((nutrition.calories / dv) * 100);
    if (pct >= 10) {
      const sev = pct >= 50 ? "very_high" : pct >= 35 ? "high" : pct >= 20 ? "moderate" : "low";
      concerns.push({ nutrient: "calories", amount: nutrition.calories, unit: "", dv_pct: pct, severity: sev, dv: dv });
    }
  }

  // ── Protein — positive badge ──────────────────────────────────
  // FDA DV: 50g adult, 19g ages 4-8. Only badge when notably high.
  if (nutrition.protein_g != null) {
    const dv  = kids_mode ? 19 : 50;
    const pct = Math.round((nutrition.protein_g / dv) * 100);
    // Only show when ≥15% DV — below that it's unremarkable
    if (pct >= 15) {
      const sev = pct >= 50 ? "excellent" : pct >= 30 ? "good" : "present";
      concerns.push({ nutrient: "protein", amount: nutrition.protein_g, unit: "g", dv_pct: pct, severity: sev, dv: dv, positive: true });
    }
  }

  // ── Fiber — positive badge ────────────────────────────────────
  // FDA DV: 28g adult, 14g ages 4-8. FDA "good source" = ≥3g, "excellent" = ≥5g.
  if (nutrition.fiber_g != null && nutrition.fiber_g >= 3) {
    const dv  = kids_mode ? 14 : 28;
    const pct = Math.round((nutrition.fiber_g / dv) * 100);
    const sev = pct >= 20 ? "excellent" : "good";
    concerns.push({ nutrient: "fiber", amount: nutrition.fiber_g, unit: "g", dv_pct: pct, severity: sev, dv: dv, positive: true });
  }

  return concerns;
}

function applyProductCalibration(result) {
  if (!result) return result;

  const rawName  = result.product_name || result.query || "";
  const name     = normalise(rawName);
  const kidsMode = result.kids_mode ?? result.children_mode ?? false;
  const category = result.category  || "";

  // 1. Exact match
  let entry = CALIBRATION.get(name);

  // 2. Key-term match
  if (!entry) {
    let bestLen = 0;
    for (const [key, val] of CALIBRATION) {
      if (name.includes(key) && key.length > bestLen) {
        entry   = val;
        bestLen = key.length;
      }
    }
  }

  // Pre-release status propagation — calibration entries can carry an
  // optional `status` / `statusNote` / `statusExpectedRelease` field for
  // brands that have been scored but have not yet shipped product. The
  // frontend renders an amber "Not yet shipped" card above the score.
  //
  // Extended 2026-04-23 with structured provenance fields:
  //   verified[]              — substantiated claims
  //   pending[]               — promise-vs-proof bucket
  //   thirdPartyReferences[]  — independent coverage (Mamavation etc.)
  //
  // All three are optional. Empty arrays render nothing on the frontend.
  // See CLAUDE.md "Pre-release calibration status" for the full shape.
  const releaseStatus = entry?.status
    ? {
        status: entry.status,
        note: entry.statusNote || null,
        expected_release: entry.statusExpectedRelease || null,
        verified: entry.verified || [],
        pending: entry.pending || [],
        third_party_references: entry.thirdPartyReferences || [],
      }
    : null;

  // ── Nutrition — merge four sources in priority order:
  // 1. Explicit result top-level fields
  // 2. result.nutrition from AI pass
  // 3. entry.nutrition from calibration entry
  // 4. NUTRITION_LOOKUP reference table (covers all major products)
  const entryNutrition  = entry?.nutrition  || {};
  const resultNutrition = result.nutrition  || {};

  // Look up from reference table — try longest matching key
  // Strip apostrophes from both sides for robust matching
  let lookupNutrition = {};
  let lookupBestLen = 0;
  const nameStripped = name.replace(/['']/g, "");
  for (const [k, v] of NUTRITION_LOOKUP) {
    const kStripped = k.replace(/['']/g, "");
    if (nameStripped.includes(kStripped) && kStripped.length > lookupBestLen) {
      lookupNutrition = v;
      lookupBestLen = kStripped.length;
    }
  }

  const sugar_g     = result.sugar_g     ?? resultNutrition.sugar_g     ?? entryNutrition.sugar_g     ?? lookupNutrition.sugar_g     ?? null;
  const sodium_mg   = result.sodium_mg   ?? resultNutrition.sodium_mg   ?? entryNutrition.sodium_mg   ?? lookupNutrition.sodium_mg   ?? null;
  const sat_fat_g   = result.sat_fat_g   ?? resultNutrition.sat_fat_g   ?? entryNutrition.sat_fat_g   ?? lookupNutrition.sat_fat_g   ?? null;
  const trans_fat_g = result.trans_fat_g ?? resultNutrition.trans_fat_g ?? entryNutrition.trans_fat_g ?? lookupNutrition.trans_fat_g ?? null;
  const calories_v  = result.calories    ?? resultNutrition.calories    ?? entryNutrition.calories    ?? lookupNutrition.calories    ?? null;
  const protein_g   = result.protein_g   ?? resultNutrition.protein_g   ?? entryNutrition.protein_g   ?? lookupNutrition.protein_g   ?? null;
  const fiber_g     = result.fiber_g     ?? resultNutrition.fiber_g     ?? entryNutrition.fiber_g     ?? lookupNutrition.fiber_g     ?? null;

  // Merged nutrition object for badge display
  const mergedNutrition = (sugar_g != null || sodium_mg != null || sat_fat_g != null || calories_v != null)
    ? { ...entryNutrition, ...resultNutrition, sugar_g, sodium_mg, sat_fat_g, trans_fat_g, calories: calories_v, protein_g, fiber_g }
    : null;

  const currentScore = result.overall_score ?? result.score ?? 5;
  let   newScore     = currentScore;
  let   corrected    = false;

  // ── Tier-based floors and ceilings ───────────────────────────
  // Named calibration entries always take priority — tier rules only apply when no entry match
  const compositionTier = result.composition_tier ?? result.product_analysis?.composition_tier ?? null;
  const nonRestaurantCats = ["food","food_beverage","beverage","supplement","personal_care","clothing","baby","home","home_furnishing","kitchen","toy","pet"];
  const foodOnlyCats = ["food","food_beverage","beverage","supplement"];

  if (compositionTier !== null && !entry && category !== "restaurant") {
    // Tier 1 — benchmark clean, hard ceiling of 2
    if (compositionTier === 1 && newScore > 2) {
      console.log(`[CAL] Tier 1 ceiling: "${rawName}" ${newScore}→2`);
      newScore = 2; corrected = true;
    }
    // Tier 2 — conventional, range 3-5
    if (compositionTier === 2 && newScore < 3) {
      console.log(`[CAL] Tier 2 floor: "${rawName}" ${newScore}→3`);
      newScore = 3; corrected = true;
    }
    if (compositionTier === 2 && newScore > 5) {
      console.log(`[CAL] Tier 2 ceiling: "${rawName}" ${newScore}→5`);
      newScore = 5; corrected = true;
    }
    // Tier 3 — synthetic/processed, range 4-7
    if (compositionTier === 3 && newScore < 4) {
      console.log(`[CAL] Tier 3 floor: "${rawName}" ${newScore}→4`);
      newScore = 4; corrected = true;
    }
    if (compositionTier === 3 && newScore > 7) {
      console.log(`[CAL] Tier 3 ceiling: "${rawName}" ${newScore}→7`);
      newScore = 7; corrected = true;
    }
    // Tier 4 — high concern, floor 6 (7 for baby)
    if (compositionTier === 4 && nonRestaurantCats.includes(category) && newScore < 6) {
      console.log(`[CAL] Tier 4 floor: "${rawName}" ${newScore}→6`);
      newScore = 6; corrected = true;
    }
    if (compositionTier === 4 && category === "baby" && newScore < 7) {
      console.log(`[CAL] Baby tier 4 floor: "${rawName}" ${newScore}→7`);
      newScore = 7; corrected = true;
    }
    if (compositionTier === 4 && newScore > 9) {
      newScore = 9; corrected = true;
    }
  }

  if (entry) {
    // ── Ingredient-based floor/ceiling ─────────────────────────
    // When kids_mode is active, use kidsFloor/kidsCeiling if the entry has them
    const effectiveFloor   = (kidsMode && entry.kidsFloor   != null) ? entry.kidsFloor   : entry.floor;
    const effectiveCeiling = (kidsMode && entry.kidsCeiling != null) ? entry.kidsCeiling : entry.ceiling;

    if (currentScore < effectiveFloor) {
      newScore  = effectiveFloor;
      corrected = true;
      console.log(`[CAL] Floor applied: "${rawName}" ${currentScore}→${newScore} (${entry.reason})`);
    }

    if (currentScore > effectiveCeiling) {
      newScore  = effectiveCeiling;
      corrected = true;
      console.log(`[CAL] Ceiling applied: "${rawName}" ${currentScore}→${newScore} (${entry.reason})`);
    }
  }

  // ── Sugar floor ───────────────────────────────────────────────
  const afterSugar    = applySugarFloor(newScore, sugar_g, category, kidsMode);
  if (afterSugar > newScore)   { newScore = afterSugar;   corrected = true; }

  // ── Sodium floor ──────────────────────────────────────────────
  const afterSodium   = applySodiumFloor(newScore, sodium_mg, category, kidsMode);
  if (afterSodium > newScore)  { newScore = afterSodium;  corrected = true; }

  // ── Sat fat floor ─────────────────────────────────────────────
  const afterSatFat   = applySatFatFloor(newScore, sat_fat_g, category, kidsMode);
  if (afterSatFat > newScore)  { newScore = afterSatFat;  corrected = true; }

  // ── Trans fat floor — any amount fires floor 6 ────────────────
  const afterTransFat = applyTransFatFloor(newScore, trans_fat_g, category);
  if (afterTransFat > newScore) { newScore = afterTransFat; corrected = true; }

  // ── Nutrition concern badges (for frontend display) ────────────
  const nutrition_concerns = buildNutritionConcerns(
    mergedNutrition,
    category,
    kidsMode
  );

  // Also expose merged nutrition on the result so the frontend badge row can render
  const nutrition_out = mergedNutrition || result.nutrition || null;

  // ── Whole Foods banned check ──────────────────────────────────
  const wfBanned = entry ? checkWholeFoodsBanned(entry.substances || []) : false;

  // ── Strip false substance flags for products with confirmed natural colorants ──
  // When calibration entry explicitly states no petroleum dyes, remove any AI-flagged dyes
  const NATURAL_COLORANT_MARKER = /natural.*dye|vegetable.*dye|no petroleum dye|natural colorant|vegetable.*color|fruit.*color|colored with vegetable|colored with fruit/i;
  const PETROLEUM_DYE_PATTERN   = /^(Red\s*40|Yellow\s*5|Yellow\s*6|Blue\s*1|Blue\s*2|FD&?C|petroleum dye|artificial.*dye|artificial.*color)$/i;

  let cleanedSubstances    = result.flagged_substances || result.concerns || [];
  let cleanedConcerns      = result.concerns || [];
  if (entry && NATURAL_COLORANT_MARKER.test(entry.reason || "")) {
    cleanedSubstances = cleanedSubstances.filter(s => !PETROLEUM_DYE_PATTERN.test(s));
    cleanedConcerns   = cleanedConcerns.filter(s => !PETROLEUM_DYE_PATTERN.test(s));
  }

  // ── Authoritative NOVA floor (final step) ─────────────────────
  // The text and vision cascades inject p1.raw_concerns with a
  // "NOVA 4 ultra-processed (inferred from ingredients: ...)" marker when
  // inferNovaGroupFromIngredients detects ultra-processing signals. That
  // inference is deterministic from the ingredient list and represents the
  // ground-truth material story — the barcode path enforces it explicitly
  // via novaBounds(), and this final step brings text/vision paths to the
  // same parity. No downstream logic can claw the score below this floor
  // because this IS the last step before the result ships.
  //
  // Only food/beverage categories are NOVA-scored. Other categories skip.
  const FOOD_CATS_FOR_NOVA = new Set(["food", "beverage", "food_beverage"]);
  if (FOOD_CATS_FOR_NOVA.has(category)) {
    const novaMarkerText = Array.isArray(result.raw_concerns)
      ? result.raw_concerns.join(" ")
      : (Array.isArray(result.concerns) ? result.concerns.join(" ") : "");
    const novaMarkerFromResult = /NOVA\s*4\s*ultra-processed/i.test(novaMarkerText);
    const novaMarkerFromTier    = result.composition_tier === 4;
    if (novaMarkerFromResult || novaMarkerFromTier) {
      const novaFloorVal = 7;
      if (newScore < novaFloorVal) {
        console.log(`[CAL] NOVA 4 final floor: "${rawName}" ${newScore}→${novaFloorVal} (deterministic ultra-processed signal)`);
        newScore = novaFloorVal;
        corrected = true;
      }
    }
  }

  if (!corrected) {
    if (entry && entry.confidence === "high") {
      console.log(`[CAL] Confirmed: "${rawName}" scored ${currentScore} — within range`);
      return { ...result, flagged_substances: cleanedSubstances, concerns: cleanedConcerns, confidence: "high", nutrition: nutrition_out, retailer_restricted: wfBanned, nutrition_concerns, release_status: releaseStatus };
    }
    if (wfBanned) return { ...result, flagged_substances: cleanedSubstances, concerns: cleanedConcerns, nutrition: nutrition_out, retailer_restricted: true, nutrition_concerns, release_status: releaseStatus };
    return { ...result, flagged_substances: cleanedSubstances, concerns: cleanedConcerns, nutrition: nutrition_out, nutrition_concerns, release_status: releaseStatus };
  }

  return {
    ...result,
    flagged_substances:   cleanedSubstances,
    concerns:             cleanedConcerns,
    overall_score:        newScore,
    score:                newScore,
    confidence:           entry?.confidence === "high" ? "high" : result.confidence,
    nutrition:            nutrition_out,
    retailer_restricted:  wfBanned,
    nutrition_concerns,
    release_status:       releaseStatus,
    calibration_override: {
      original_score: currentScore,
      corrected_to:   newScore,
      reason:         entry ? entry.reason : `nutrition content (sugar: ${sugar_g}g, sodium: ${sodium_mg}mg)`,
      substances:     entry ? entry.substances : [],
      confidence:     entry ? entry.confidence : "high",
    },
  };
}

// ─── NUTRITION LOOKUP TABLE ───────────────────────────────────────────────────
// Reference nutrition data keyed by normalised product name fragment.
// Used as a third-tier fallback when: (1) no result.nutrition from AI,
// (2) no entry.nutrition in calibration. Covers all major food/bev/restaurant
// products. Values are per-serving as labelled. sugar_g = total sugar.
// Format: [normalised_key]: { sugar_g, sodium_mg, sat_fat_g, calories, protein_g?, fiber_g? }
// kidsFloor applied automatically via calibration entry — not stored here.

// ─── EXPORTS ─────────────────────────────────────────────────
module.exports = { applyProductCalibration, CALIBRATION, normalise, NUTRITION_LOOKUP };
