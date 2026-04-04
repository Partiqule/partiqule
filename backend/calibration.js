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
    .replace(/\s+/g, " ")
    .replace(/['']/g, "'");
}

// ─── REGISTRY ─────────────────────────────────────────────────
// [ normalisedKey, { floor, ceiling, substances, reason, confidence, category } ]
const ENTRIES = [

  // ══════════════════════════════════════════════════════════════
  // FOOD — CEREALS AND GRAINS
  // ══════════════════════════════════════════════════════════════
  ["honey nut cheerios",           { floor:6, ceiling:8, substances:["glyphosate","added sugar"], reason:"Primary conventional oat with EWG-confirmed glyphosate above child threshold + 12g added sugar", confidence:"high", category:"food_beverage" }],
  ["cheerios honey nut",           { floor:6, ceiling:8, substances:["glyphosate","added sugar"], reason:"Primary conventional oat — EWG confirmed glyphosate above child threshold", confidence:"high", category:"food_beverage" }],
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
  ["m&ms",                         { floor:7, ceiling:9, substances:["Red 40","Yellow 5","Yellow 6","Blue 1"], reason:"Four FDA-phasing-out petroleum dyes — all confirmed in formula", confidence:"high", category:"food_beverage" }],
  ["m&m",                          { floor:7, ceiling:9, substances:["Red 40","Yellow 5","Yellow 6","Blue 1"], reason:"Four petroleum dyes confirmed", confidence:"high", category:"food_beverage" }],
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
  ["oreo",                         { floor:5, ceiling:7, substances:["HFCS","palm oil"], reason:"HFCS + palm oil + artificial flavors + NOVA 4", confidence:"high", category:"food_beverage" }],
  ["pop-tarts",                    { floor:6, ceiling:8, substances:["HFCS","TBHQ","artificial dyes"], reason:"HFCS + TBHQ preservative + artificial dyes — TBHQ floor fires", confidence:"high", category:"food_beverage" }],
  ["hostess twinkies",             { floor:5, ceiling:7, substances:["HFCS","polysorbate 60","sorbic acid"], reason:"HFCS + 27 industrial ingredients + polysorbate 60 + sorbic acid", confidence:"high", category:"food_beverage" }],
  ["twinkies",                     { floor:5, ceiling:7, substances:["HFCS","polysorbate 60"], reason:"HFCS + 27 industrial ingredients", confidence:"high", category:"food_beverage" }],
  ["little debbie swiss rolls",    { floor:5, ceiling:7, substances:["HFCS","corn syrup"], reason:"HFCS + corn syrup + 20+ additives + NOVA 4", confidence:"high", category:"food_beverage" }],
  ["cosmic brownies",              { floor:6, ceiling:8, substances:["HFCS","artificial dyes"], reason:"HFCS + petroleum dyes in candy coating", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // FOOD — SNACKS AND CRACKERS
  // ══════════════════════════════════════════════════════════════
  ["cheez-its",                    { floor:5, ceiling:7, substances:["TBHQ"], reason:"TBHQ preservative confirmed — TBHQ floor fires (mFloor:6)", confidence:"high", category:"food_beverage" }],
  ["cheez it",                     { floor:5, ceiling:7, substances:["TBHQ"], reason:"TBHQ preservative — floor fires", confidence:"high", category:"food_beverage" }],
  ["wheat thins",                  { floor:4, ceiling:6, substances:["HFCS","BHT"], reason:"HFCS + BHT preservative — BHT floor fires", confidence:"high", category:"food_beverage" }],
  ["cheetos",                      { floor:5, ceiling:7, substances:["artificial dyes","MSG"], reason:"Petroleum dyes in most flavors + MSG + enriched flour + palm oil", confidence:"high", category:"food_beverage" }],
  ["doritos",                      { floor:5, ceiling:7, substances:["artificial dyes","MSG"], reason:"Petroleum dyes + MSG + enriched flour", confidence:"high", category:"food_beverage" }],
  ["pringles",                     { floor:4, ceiling:6, substances:["TBHQ"], reason:"TBHQ in frying oil of some flavors + enriched corn flour", confidence:"medium", category:"food_beverage" }],
  ["ritz",                { floor:5, ceiling:7, substances:["partially hydrogenated oil","HFCS","BHT"], reason:"Ritz — partially hydrogenated oil (trans fat floor fires) + HFCS + BHT. One of the most widely eaten crackers with a serious concern profile.", confidence:"high", category:"food_beverage" }],
  ["goldfish",            { floor:4, ceiling:5, substances:["enriched flour","artificial flavor"], reason:"Goldfish — enriched flour + artificial flavor in some varieties. Common child snack with moderate concern.", confidence:"high", category:"food_beverage" }],
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
  ["coca-cola",                    { floor:4, ceiling:6, substances:["caramel color IV","HFCS"], reason:"HFCS + caramel color IV (4-MEI IARC 2B) + phosphoric acid", confidence:"high", category:"beverage" }],
  ["coke classic",                 { floor:4, ceiling:6, substances:["caramel color IV","HFCS"], reason:"HFCS + caramel color IV", confidence:"high", category:"beverage" }],
  ["diet coke",                    { floor:4, ceiling:6, substances:["aspartame","caramel color IV"], reason:"Aspartame IARC 2B 2023 + caramel color IV — aluminum can does NOT lower below 5", confidence:"high", category:"beverage" }],
  ["mountain dew",                 { floor:6, ceiling:8, substances:["Yellow 5","HFCS"], reason:"Yellow 5 petroleum dye + HFCS — dye floor fires", confidence:"high", category:"beverage" }],
  ["dr pepper",                    { floor:4, ceiling:6, substances:["caramel color IV","HFCS"], reason:"HFCS + caramel color IV", confidence:"high", category:"beverage" }],
  ["sprite",                       { floor:3, ceiling:5, substances:[], reason:"No artificial dyes — HFCS + citric acid + natural flavors only", confidence:"high", category:"beverage" }],
  ["zevia",                        { floor:1, ceiling:3, substances:[], reason:"Stevia only — no artificial dyes, no HFCS, no aspartame", confidence:"high", category:"beverage" }],
  ["olipop",                       { floor:2, ceiling:4, substances:[], reason:"Plant fiber + prebiotics + natural flavors — no HFCS, no artificial dyes", confidence:"high", category:"beverage" }],
  ["poppi",                        { floor:2, ceiling:4, substances:[], reason:"Apple cider vinegar + fruit juice + stevia — no artificial dyes, no HFCS", confidence:"high", category:"beverage" }],

  // ══════════════════════════════════════════════════════════════
  // BEVERAGES — ENERGY DRINKS
  // ══════════════════════════════════════════════════════════════
  ["red bull",                     { floor:5, ceiling:7, substances:["taurine","B-vitamin megadose"], reason:"NOVA 4 stimulant formulation: 27g sugar + taurine + B-vitamin megadoses + 80mg caffeine", confidence:"high", category:"beverage" }],
  ["monster energy",               { floor:5, ceiling:8, substances:["artificial dyes","caffeine"], reason:"Artificial dyes in colored flavors + 160mg caffeine + 27g sugar", confidence:"high", category:"beverage" }],
  ["celsius energy",               { floor:3, ceiling:5, substances:["sucralose"], reason:"Sucralose floor fires + 200mg caffeine — no artificial colors", confidence:"high", category:"beverage" }],
  ["bang energy",                  { floor:5, ceiling:7, substances:["sucralose","acesulfame potassium"], reason:"300mg caffeine + sucralose + acesulfame-K + artificial flavors", confidence:"high", category:"beverage" }],

  // ══════════════════════════════════════════════════════════════
  // BEVERAGES — JUICES AND DRINKS
  // ══════════════════════════════════════════════════════════════
  ["naked juice",                  { floor:3, ceiling:5, substances:["extreme natural sugar"], reason:"53g+ natural sugar per bottle — total sugar floor applies even without added sugar", confidence:"high", category:"beverage" }],
  ["odwalla",                      { floor:3, ceiling:5, substances:["extreme natural sugar"], reason:"High natural sugar + pasteurized", confidence:"high", category:"beverage" }],
  ["hi-c fruit punch",             { floor:6, ceiling:8, substances:["Red 40","Blue 1","HFCS"], reason:"HFCS + Red 40 + Blue 1 — daily children's drink with petroleum dyes — child vulnerability flag", confidence:"high", category:"beverage" }],
  ["hawaiian punch",               { floor:6, ceiling:8, substances:["Red 40","HFCS"], reason:"HFCS + Red 40 — child daily drink — petroleum dye floor fires", confidence:"high", category:"beverage" }],
  ["kool-aid jammers",             { floor:6, ceiling:8, substances:["HFCS","artificial dyes"], reason:"HFCS + multiple petroleum dyes — child daily drink — child vulnerability", confidence:"high", category:"beverage" }],
  ["capri sun",                    { floor:4, ceiling:6, substances:["HFCS"], reason:"HFCS in original flavors — newer 25% less sugar variants cleaner", confidence:"medium", category:"beverage" }],
  ["ocean spray cranberry",{ floor:4, ceiling:6, substances:["HFCS"], reason:"28% juice + HFCS + water — NOT same as 100% cranberry juice", confidence:"high", category:"beverage" }],
  ["snapple peach tea",            { floor:4, ceiling:6, substances:["HFCS"], reason:"HFCS + 37g sugar", confidence:"high", category:"beverage" }],
  ["arizona iced tea",             { floor:4, ceiling:6, substances:["HFCS"], reason:"HFCS — most flavors", confidence:"high", category:"beverage" }],
  ["lipton brisk",                 { floor:4, ceiling:6, substances:["HFCS"], reason:"HFCS sweetened", confidence:"high", category:"beverage" }],
  ["minute maid lemonade",         { floor:4, ceiling:6, substances:["HFCS"], reason:"HFCS + 28g sugar", confidence:"high", category:"beverage" }],
  ["sunny d",                      { floor:5, ceiling:7, substances:["HFCS","artificial dyes"], reason:"HFCS + artificial dyes + 5% juice — juice impostor", confidence:"high", category:"beverage" }],
  ["pure leaf unsweetened",        { floor:1, ceiling:2, substances:[], reason:"Tea + water — zero sweetener, zero additives", confidence:"high", category:"beverage" }],
  ["honest tea",                   { floor:1, ceiling:3, substances:[], reason:"USDA Organic, fair trade, 10g natural sugar — genuinely clean", confidence:"high", category:"beverage" }],
  ["lmnt",                         { floor:1, ceiling:3, substances:[], reason:"Sodium + potassium + magnesium + natural flavors — no sweeteners, no additives", confidence:"high", category:"beverage" }],
  ["liquid iv",                    { floor:3, ceiling:5, substances:["sucralose"], reason:"Sucralose floor fires + B-vitamin megadose stack — not clean despite marketing", confidence:"high", category:"beverage" }],
  ["pedialyte",                    { floor:4, ceiling:6, substances:["sucralose","acesulfame potassium"], reason:"Two artificial sweeteners + artificial colors in some flavors", confidence:"high", category:"beverage" }],
  ["athletic brewing",             { floor:1, ceiling:3, substances:[], reason:"Non-alcoholic craft beer — clean grain ingredients, no ethanol", confidence:"high", category:"beverage" }],

  // ══════════════════════════════════════════════════════════════
  // BEVERAGES — SMOOTHIES AND COFFEE
  // ══════════════════════════════════════════════════════════════
  ["pressed juicery",              { floor:1, ceiling:3, substances:[], reason:"Raw cold-pressed juice — minimal ingredients, no additives", confidence:"high", category:"beverage" }],
  ["jamba juice",                  { floor:3, ceiling:6, substances:["added sugar"], reason:"Classic = 4-5 (sherbet + high sugar). Heavy protein = 5+ (95g+ sugar). Range varies by order.", confidence:"medium", category:"restaurant" }],
  ["smoothie king",                { floor:4, ceiling:6, substances:["sucralose"], reason:"Diet blends: sucralose + acesulfame-K. Hulk series: high calorie/sugar. Rarely clean.", confidence:"medium", category:"restaurant" }],
  ["dutch bros",                   { floor:4, ceiling:7, substances:["artificial flavors","Blue Rebel"], reason:"Blue Rebel base is an energy drink. All flavored drinks = high sugar syrups + artificial flavors. NEVER below 5 for flavored.", confidence:"high", category:"restaurant" }],

  // ══════════════════════════════════════════════════════════════
  // FOOD — PROTEIN BARS
  // ══════════════════════════════════════════════════════════════
  ["larabar",                      { floor:1, ceiling:3, substances:[], reason:"Dates + nuts — 2-6 whole food ingredients, NOVA 1, no sweeteners", confidence:"high", category:"food_beverage" }],
  ["rxbar",                        { floor:1, ceiling:3, substances:[], reason:"Egg whites + dates + nuts — whole food NOVA 1 formula", confidence:"high", category:"food_beverage" }],
  ["rx bar",                       { floor:1, ceiling:3, substances:[], reason:"Whole food ingredients — NOVA 1", confidence:"high", category:"food_beverage" }],
  ["gomacro",                      { floor:1, ceiling:3, substances:[], reason:"USDA Organic, whole food ingredients", confidence:"high", category:"food_beverage" }],
  ["perfect bar",                  { floor:2, ceiling:4, substances:[], reason:"Peanut butter + honey + nonfat milk — refrigerated, whole food base", confidence:"high", category:"food_beverage" }],
  ["quest bar",                    { floor:4, ceiling:6, substances:["sucralose","palm kernel oil"], reason:"Sucralose + protein isolate + palm kernel oil + NOVA 4 — not clean", confidence:"high", category:"food_beverage" }],
  ["one bar",                      { floor:4, ceiling:6, substances:["sucralose","erythritol"], reason:"Sucralose + erythritol + protein isolate + NOVA 4", confidence:"high", category:"food_beverage" }],
  ["built bar",                    { floor:4, ceiling:6, substances:["sucralose","erythritol","carrageenan"], reason:"Sucralose + erythritol + carrageenan — multiple floors fire", confidence:"high", category:"food_beverage" }],
  ["kind bar",                     { floor:2, ceiling:4, substances:[], reason:"Nuts + honey — no sucralose, no dyes, relatively clean", confidence:"high", category:"food_beverage" }],
  ["clif bar",                     { floor:3, ceiling:5, substances:["conventional oats"], reason:"Conventional oats (glyphosate concern) + brown rice syrup + natural flavors + NOVA 3", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // FOOD — FROZEN DESSERTS
  // ══════════════════════════════════════════════════════════════
  ["haagen-dazs",                  { floor:2, ceiling:4, substances:[], reason:"Cream + milk + sugar + eggs + flavoring — simple, no carrageenan, no artificial additives", confidence:"high", category:"food_beverage" }],
  ["alden's organic",              { floor:1, ceiling:3, substances:[], reason:"USDA Organic, simple ingredients", confidence:"high", category:"food_beverage" }],
  ["halo top",                     { floor:4, ceiling:6, substances:["sucralose","erythritol","chicory root"], reason:"Sucralose floor fires + NOVA 4 engineered formulation — not cleaner than real ice cream", confidence:"high", category:"food_beverage" }],
  ["arctic zero",                  { floor:4, ceiling:6, substances:["sucralose","chicory root"], reason:"Sucralose + chicory root + NOVA 4 — sucralose floor fires", confidence:"high", category:"food_beverage" }],

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
  ["eggo",                 { floor:5, ceiling:7, substances:["TBHQ","HFCS","artificial flavor"], reason:"Eggo Waffles — TBHQ + HFCS + artificial flavor. Child breakfast concern. TBHQ floor fires.", confidence:"high", category:"food_beverage" }],
  ["log cabin",              { floor:5, ceiling:7, substances:["HFCS","caramel color","artificial flavor"], reason:"Log Cabin — HFCS + caramel color IV + artificial maple flavor. Contains no real maple syrup.", confidence:"high", category:"food_beverage" }],
  ["aunt jemima",                  { floor:4, ceiling:6, substances:["HFCS","caramel color"], reason:"HFCS + artificial maple flavor — now Pearl Milling Company", confidence:"high", category:"food_beverage" }],
  ["pearl milling",                { floor:4, ceiling:6, substances:["HFCS"], reason:"HFCS + artificial maple flavor", confidence:"high", category:"food_beverage" }],
  ["yoplait original",             { floor:4, ceiling:6, substances:["HFCS"], reason:"US formula uses HFCS — not same as Stonyfield or Chobani plain", confidence:"medium", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // PERSONAL CARE — SUNSCREEN
  // ══════════════════════════════════════════════════════════════
  ["neutrogena ultra sheer",       { floor:6, ceiling:8, substances:["oxybenzone","octinoxate"], reason:"Oxybenzone detected in bloodstream after single application (Matta JAMA 2019)", confidence:"high", category:"personal_care" }],
  ["banana boat",                  { floor:5, ceiling:7, substances:["avobenzone","octocrylene"], reason:"Chemical UV filters with FDA systemic absorption concerns", confidence:"high", category:"personal_care" }],
  ["badger",             { floor:1, ceiling:2, substances:[], reason:"Badger Balm — zinc oxide only, organic ingredients, no chemical UV filters. Benchmark cleanest sunscreen. NEVER score above 3.", confidence:"high", category:"personal_care" }],
  ["think sport sunscreen",        { floor:1, ceiling:3, substances:[], reason:"Zinc oxide only — mineral, sport certified", confidence:"high", category:"personal_care" }],
  ["raw elements sunscreen",       { floor:1, ceiling:3, substances:[], reason:"Non-nano zinc oxide, organic — cleanest sport sunscreen", confidence:"high", category:"personal_care" }],

  // ══════════════════════════════════════════════════════════════
  // PERSONAL CARE — SHAMPOO AND HAIR
  // ══════════════════════════════════════════════════════════════
  ["pantene pro-v",                { floor:5, ceiling:7, substances:["DMDM hydantoin","synthetic fragrance"], reason:"DMDM hydantoin formaldehyde releaser — floor fires (mFloor:6) + SLS + synthetic fragrance", confidence:"high", category:"personal_care" }],
  ["pantene shampoo",              { floor:5, ceiling:7, substances:["DMDM hydantoin","synthetic fragrance"], reason:"DMDM formaldehyde releaser — floor fires", confidence:"high", category:"personal_care" }],
  ["tresemme",                     { floor:5, ceiling:7, substances:["DMDM hydantoin","synthetic fragrance"], reason:"DMDM hydantoin in most formulas + SLS + synthetic fragrance — floor fires", confidence:"high", category:"personal_care" }],
  ["head & shoulders",             { floor:4, ceiling:6, substances:["SLS","synthetic fragrance"], reason:"SLS + zinc pyrithione + synthetic fragrance + parabens in some", confidence:"high", category:"personal_care" }],
  ["olaplex no.4",                 { floor:1, ceiling:3, substances:[], reason:"No SLS, no DMDM, no parabens, no synthetic fragrance — benchmark clean shampoo", confidence:"high", category:"personal_care" }],
  ["olaplex shampoo",              { floor:1, ceiling:3, substances:[], reason:"No SLS, no DMDM, no parabens", confidence:"high", category:"personal_care" }],
  ["briogeo",                      { floor:1, ceiling:3, substances:[], reason:"EWG Verified some lines, no SLS, no DMDM", confidence:"high", category:"personal_care" }],

  // ══════════════════════════════════════════════════════════════
  // PERSONAL CARE — DEODORANT
  // ══════════════════════════════════════════════════════════════
  ["native",             { floor:1, ceiling:3, substances:[], reason:"Aluminum-free, coconut oil, shea butter, baking soda, no synthetic fragrance", confidence:"high", category:"personal_care" }],
  ["schmidt's deodorant",          { floor:1, ceiling:3, substances:[], reason:"Plant-based, no aluminum, no synthetic fragrance", confidence:"high", category:"personal_care" }],
  ["certain dri",                  { floor:5, ceiling:7, substances:["aluminum chloride"], reason:"20%+ aluminum chloride — highest aluminum concentration in OTC antiperspirant", confidence:"high", category:"personal_care" }],

  // ══════════════════════════════════════════════════════════════
  // PERSONAL CARE — TOOTHPASTE
  // ══════════════════════════════════════════════════════════════
  ["colgate total",                { floor:4, ceiling:6, substances:["SLS","titanium dioxide","saccharin"], reason:"SLS + titanium dioxide IARC 2B + saccharin + artificial flavor", confidence:"high", category:"personal_care" }],
  ["crest whitening",              { floor:4, ceiling:6, substances:["SLS","titanium dioxide"], reason:"SLS + titanium dioxide IARC 2B + saccharin", confidence:"high", category:"personal_care" }],
  ["sensodyne",                    { floor:2, ceiling:4, substances:[], reason:"SLS-free in most formulas — simpler, cleaner than Colgate", confidence:"high", category:"personal_care" }],
  ["hello toothpaste",             { floor:1, ceiling:3, substances:[], reason:"SLS-free, no artificial sweeteners, no titanium dioxide", confidence:"high", category:"personal_care" }],
  ["bite toothpaste",              { floor:1, ceiling:2, substances:[], reason:"Tablet format, no SLS, minimal ingredients — cleanest mainstream option", confidence:"high", category:"personal_care" }],
  ["tom's of maine",               { floor:3, ceiling:5, substances:["SLS"], reason:"Still contains SLS in most lines despite natural marketing — owned by Colgate", confidence:"high", category:"personal_care" }],

  // ══════════════════════════════════════════════════════════════
  // PERSONAL CARE — MOISTURIZER AND SKIN CARE
  // ══════════════════════════════════════════════════════════════
  ["cetaphil",                     { floor:4, ceiling:6, substances:["parabens","propylene glycol","synthetic fragrance"], reason:"Parabens + propylene glycol + synthetic fragrance — 'dermatologist recommended' is not a safety signal", confidence:"high", category:"personal_care" }],
  ["vanicream",                    { floor:1, ceiling:3, substances:[], reason:"No dyes, no fragrance, no parabens, no formaldehyde releasers — genuinely clean", confidence:"high", category:"personal_care" }],
  ["cerave moisturizing cream",    { floor:2, ceiling:4, substances:[], reason:"Current formula: no parabens, no synthetic fragrance — relatively clean for drugstore", confidence:"medium", category:"personal_care" }],
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
  ["chapstick classic",            { floor:3, ceiling:5, substances:["BHT","synthetic fragrance"], reason:"BHT preservative + synthetic fragrance — BHT floor fires", confidence:"high", category:"personal_care" }],

  // ══════════════════════════════════════════════════════════════
  // PERSONAL CARE — BODY WASH AND SOAP
  // ══════════════════════════════════════════════════════════════
  ["dr. bronner's",                { floor:1, ceiling:2, substances:[], reason:"Saponified organic oils + essential oils — organic, fair trade, benchmark clean", confidence:"high", category:"personal_care" }],
  ["dr bronner's",                 { floor:1, ceiling:2, substances:[], reason:"Saponified organic oils — benchmark clean soap", confidence:"high", category:"personal_care" }],
  ["dial complete antibacterial",  { floor:5, ceiling:7, substances:["benzalkonium chloride","synthetic fragrance"], reason:"Benzalkonium chloride is an EPA-registered pesticide — disrupts skin microbiome", confidence:"high", category:"personal_care" }],
  ["native body wash",             { floor:1, ceiling:3, substances:[], reason:"SLS-free, no parabens, clean fragrance", confidence:"high", category:"personal_care" }],

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
  ["garden of life raw",           { floor:1, ceiling:3, substances:[], reason:"USDA Organic, whole-food derived, no synthetic dyes", confidence:"high", category:"supplement" }],
  ["nordic naturals omega",        { floor:1, ceiling:3, substances:[], reason:"NSF tested, no artificial colors or flavors, Friend of the Sea certified", confidence:"high", category:"supplement" }],
  ["momentous protein",            { floor:1, ceiling:3, substances:[], reason:"NSF Certified for Sport + Informed Sport — no dyes, no artificial sweeteners", confidence:"high", category:"supplement" }],
  ["c4 pre-workout",               { floor:5, ceiling:7, substances:["sucralose","acesulfame potassium"], reason:"Sucralose + acesulfame-K + possible artificial dyes — sucralose floor fires", confidence:"high", category:"supplement" }],
  ["ghost pre-workout",            { floor:4, ceiling:7, substances:["sucralose"], reason:"Sucralose + artificial flavors + artificial colors in some", confidence:"high", category:"supplement" }],
  ["vital proteins collagen",      { floor:1, ceiling:3, substances:[], reason:"Plain collagen peptides — no artificial additives, minimal ingredients", confidence:"high", category:"supplement" }],

  // ══════════════════════════════════════════════════════════════
  // BABY PRODUCTS — DIAPERS
  // ══════════════════════════════════════════════════════════════
  ["pampers swaddlers",            { floor:6, ceiling:8, substances:["PP inner liner","ECF bleaching"], reason:"Polypropylene inner liner + ECF bleaching — conventional synthetic diaper", confidence:"high", category:"baby" }],
  ["pampers pure",                 { floor:4, ceiling:6, substances:[], reason:"Cleaner Pampers line — plant-based outer, fewer additives, no synthetic fragrance", confidence:"high", category:"baby" }],
  ["huggies little snugglers",     { floor:6, ceiling:8, substances:["PP inner liner"], reason:"Conventional PP/PE diaper — same tier as Pampers", confidence:"high", category:"baby" }],
  ["hello bello diapers",          { floor:3, ceiling:5, substances:[], reason:"Corn-derived PLA fiber inner liner — plant-based at skin contact layer, chlorine-free", confidence:"high", category:"baby" }],
  ["andy pandy diapers",           { floor:2, ceiling:4, substances:[], reason:"Bamboo-derived, chlorine-free, no synthetic fragrance", confidence:"high", category:"baby" }],
  ["waterwipes",                   { floor:1, ceiling:2, substances:[], reason:"99.9% purified water + 0.1% grapefruit seed extract — benchmark clean baby wipe", confidence:"high", category:"baby" }],
  ["honest wipes",                 { floor:1, ceiling:3, substances:[], reason:"No fragrance, phenoxyethanol-free in current formula", confidence:"medium", category:"baby" }],

  // ══════════════════════════════════════════════════════════════
  // HOME — CLEANING PRODUCTS
  // ══════════════════════════════════════════════════════════════
  ["tide original",                { floor:5, ceiling:7, substances:["PVA","synthetic fragrance","optical brighteners"], reason:"PVA pod film enters waterways as microplastic + synthetic fragrance + 1,4-dioxane", confidence:"high", category:"home" }],
  ["tide pods",                    { floor:5, ceiling:7, substances:["PVA","synthetic fragrance"], reason:"PVA film + optical brighteners + synthetic fragrance + 1,4-dioxane", confidence:"high", category:"home" }],
  ["tide free and gentle",         { floor:3, ceiling:5, substances:["PVA"], reason:"No fragrance/dyes but still PVA pod film — significantly cleaner than original Tide", confidence:"high", category:"home" }],
  ["gain laundry",                 { floor:5, ceiling:7, substances:["synthetic fragrance","optical brighteners","PVA"], reason:"Synthetic fragrance + optical brighteners + PVA pod film", confidence:"high", category:"home" }],
  ["seventh generation free clear",{ floor:1, ceiling:3, substances:[], reason:"Plant-based, no synthetic fragrance, no optical brighteners, EPA Safer Choice", confidence:"high", category:"home" }],
  ["blueland laundry",             { floor:1, ceiling:2, substances:[], reason:"No PVA, no synthetic fragrance, tablet format — benchmark clean laundry", confidence:"high", category:"home" }],
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
  ["greenpan",                     { floor:1, ceiling:3, substances:[], reason:"Thermolon ceramic — no PTFE, no PFAS", confidence:"high", category:"kitchen" }],
  ["pyrex glass",                  { floor:1, ceiling:2, substances:[], reason:"Borosilicate glass — inert at all temperatures, benchmark clean food storage", confidence:"high", category:"kitchen" }],
  ["scotch-brite",                { floor:5, ceiling:7, substances:["synthetic microfibers"], reason:"Nylon/polyester synthetic sponge — sheds microplastics into water with every use", confidence:"high", category:"home" }],
  ["scotch brite",                 { floor:5, ceiling:7, substances:["synthetic microfibers"], reason:"Synthetic fiber sponge — microplastic shedding concern", confidence:"high", category:"home" }],
  ["stasher bag",                  { floor:1, ceiling:2, substances:[], reason:"Food-grade platinum silicone — reusable, no BPA, no plastic", confidence:"high", category:"kitchen" }],

  // ══════════════════════════════════════════════════════════════
  // CLOTHING — KEY BRANDS
  // ══════════════════════════════════════════════════════════════
  ["lululemon align",              { floor:5, ceiling:7, substances:["nylon","elastane"], reason:"87% nylon / 13% Lycra elastane — daily intimate skin contact with synthetic microfiber shedding", confidence:"high", category:"clothing" }],
  ["shein",                        { floor:6, ceiling:8, substances:["polyester","unknown dyes","PFAS"], reason:"100% polyester common, unknown chemical dyes, PFAS above EU limits found in testing, extreme fast fashion", confidence:"high", category:"clothing" }],
  ["pact organic",                 { floor:1, ceiling:3, substances:[], reason:"GOTS certified organic cotton — gold standard clothing certification", confidence:"high", category:"clothing" }],
  ["allbirds",                     { floor:1, ceiling:3, substances:[], reason:"ZQ Merino wool certified — transparent supply chain, low chemical treatment", confidence:"high", category:"clothing" }],

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
  ["wondercide",                     { floor:1, ceiling:3, substances:[], reason:"Cedar oil + plant-based — OMRI listed, genuinely clean flea control", confidence:"high", category:"other" }],

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
  ["nespresso",                     { floor:1, ceiling:3, substances:[], reason:"Aluminum capsule — no plastic in water path, inert at brewing temperatures", confidence:"high", category:"food_beverage" }],
  ["lipton pyramid tea bag",        { floor:6, ceiling:8, substances:["nylon","microplastics"], reason:"Nylon mesh confirmed — 11.6 billion microplastic particles per cup at steeping temperature (Hernandez 2019)", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // INSECT REPELLENT
  // ══════════════════════════════════════════════════════════════
  ["off! deep woods",               { floor:6, ceiling:8, substances:["DEET"], reason:"98% DEET — neurotoxin class, skin absorption, not recommended for children under 3", confidence:"high", category:"other" }],
  ["off family care",               { floor:4, ceiling:6, substances:["DEET"], reason:"15% DEET — lower concentration but still neurotoxic class", confidence:"high", category:"other" }],
  ["sawyer picaridin",              { floor:2, ceiling:4, substances:[], reason:"Picaridin — CDC approved, lower toxicity than DEET, does not dissolve plastics", confidence:"high", category:"other" }],
  ["thermacell",                    { floor:5, ceiling:7, substances:["allethrin"], reason:"Allethrin pyrethroid volatilized into breathing zone — EPA-registered pesticide continuously inhaled", confidence:"high", category:"other" }],
  ["repel lemon eucalyptus",        { floor:1, ceiling:3, substances:[], reason:"PMD/oil of lemon eucalyptus — plant-based, CDC approved", confidence:"high", category:"other" }],

  // ══════════════════════════════════════════════════════════════
  // JERKY AND MEAT SNACKS
  // ══════════════════════════════════════════════════════════════
  ["jack link's",                   { floor:6, ceiling:8, substances:["sodium nitrite","HFCS"], reason:"Sodium nitrite IARC Group 1 + HFCS — nitrite floor fires (mFloor:8)", confidence:"high", category:"food_beverage" }],
  ["jack links",                    { floor:6, ceiling:8, substances:["sodium nitrite","HFCS"], reason:"Sodium nitrite + HFCS — nitrite floor fires", confidence:"high", category:"food_beverage" }],
  ["slim jim",                       { floor:6, ceiling:8, substances:["sodium nitrite"], reason:"Sodium nitrite + mechanically separated chicken + corn syrup — nitrite floor fires", confidence:"high", category:"food_beverage" }],
  ["epic bar",                       { floor:1, ceiling:3, substances:[], reason:"Whole prey ingredients, no nitrites, no celery powder, no artificial additives", confidence:"high", category:"food_beverage" }],
  ["chomps",                         { floor:1, ceiling:3, substances:[], reason:"No sodium nitrite, no celery powder, no artificial dyes — benchmark clean meat snack", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // KETO AND SPECIALTY FOODS
  // ══════════════════════════════════════════════════════════════
  ["lily's chocolate",              { floor:2, ceiling:4, substances:[], reason:"Stevia + erythritol — no sucralose, no petroleum dyes, clean keto chocolate", confidence:"high", category:"food_beverage" }],
  ["choczero",                       { floor:2, ceiling:4, substances:[], reason:"Monk fruit + erythritol — no sucralose, clean sweeteners", confidence:"high", category:"food_beverage" }],
  ["rebel keto ice cream",          { floor:4, ceiling:6, substances:["sucralose"], reason:"Sucralose floor fires — not cleaner than real ice cream", confidence:"high", category:"food_beverage" }],
  ["maurten",                    { floor:1, ceiling:3, substances:[], reason:"Maltodextrin + water + electrolytes — no artificial additives whatsoever", confidence:"high", category:"food_beverage" }],
  ["honey stinger",                  { floor:1, ceiling:3, substances:[], reason:"Organic honey base — clean sports fuel", confidence:"high", category:"food_beverage" }],
  ["tailwind endurance",            { floor:1, ceiling:3, substances:[], reason:"Sucrose + glucose + electrolytes — no artificial dyes or flavors", confidence:"high", category:"food_beverage" }],
  ["stouffer's mac",                { floor:5, ceiling:7, substances:["sodium phosphate","processed cheese"], reason:"Processed cheese sauce + sodium phosphate + sodium citrate + NOVA 4", confidence:"high", category:"food_beverage" }],
  ["marie callender",               { floor:5, ceiling:7, substances:["enriched flour","high sodium"], reason:"Enriched flour + high sodium 1000mg+ + NOVA 4 frozen meal", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // MLM NUTRITION
  // ══════════════════════════════════════════════════════════════
  ["herbalife",                      { floor:5, ceiling:7, substances:["sucralose","artificial dyes"], reason:"Artificial dyes + sucralose + proprietary blends without full disclosure — no NSF/Informed Sport certification", confidence:"high", category:"supplement" }],
  ["isagenix",                       { floor:5, ceiling:7, substances:["sucralose"], reason:"Sucralose + proprietary blends + no third-party testing certification", confidence:"high", category:"supplement" }],
  ["shakeology",                     { floor:4, ceiling:6, substances:["sucralose"], reason:"Proprietary blends, some sucralose, no NSF certification", confidence:"medium", category:"supplement" }],

  // ══════════════════════════════════════════════════════════════
  // CLEAN SKINCARE
  // ══════════════════════════════════════════════════════════════
  ["the ordinary retinol",          { floor:1, ceiling:3, substances:[], reason:"Retinol + squalane — no synthetic fragrance, no parabens, minimal formula", confidence:"high", category:"personal_care" }],
  ["paula's choice bha",            { floor:1, ceiling:3, substances:[], reason:"Salicylic acid, fragrance-free, no dyes — EWG top-rated", confidence:"high", category:"personal_care" }],
  ["drunk elephant",                { floor:1, ceiling:3, substances:[], reason:"No synthetic fragrance, no essential oils, no silicones, no parabens — clean skincare benchmark", confidence:"high", category:"personal_care" }],
  ["elta md uv",                    { floor:1, ceiling:3, substances:[], reason:"Zinc oxide mineral UV filter + niacinamide — EWG Verified, no synthetic fragrance", confidence:"high", category:"personal_care" }],
  ["tatcha",                         { floor:1, ceiling:3, substances:[], reason:"No synthetic fragrance, Japanese botanical ingredients, no parabens", confidence:"high", category:"personal_care" }],

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
  ["egg mcmuffin",                   { floor:4, ceiling:6, substances:["sodium nitrite"], reason:"Canadian bacon (lower nitrite) + processed egg — cleaner than sausage versions", confidence:"high", category:"restaurant" }],
  ["mcdonald's french fries",        { floor:5, ceiling:7, substances:["TBHQ"], reason:"TBHQ in frying oil + natural beef flavor (unlabeled wheat/milk) + dextrose coating", confidence:"high", category:"restaurant" }],
  ["mcflurry",                       { floor:5, ceiling:7, substances:["HFCS","corn syrup"], reason:"HFCS + corn syrup + artificial flavors. M&M version = 7 (petroleum dyes).", confidence:"high", category:"restaurant" }],
  ["mcdonald's apple pie",           { floor:6, ceiling:8, substances:["TBHQ","BHA","HFCS"], reason:"TBHQ + BHA in oil + HFCS — BHA floor fires (mFloor:6)", confidence:"high", category:"restaurant" }],
  ["mcdonald's oatmeal",             { floor:3, ceiling:5, substances:[], reason:"Genuine oats + brown sugar + cream — cleanest McDonald's option", confidence:"high", category:"restaurant" }],

  // ══════════════════════════════════════════════════════════════
  // FAST FOOD — BURGER KING
  // ══════════════════════════════════════════════════════════════
  ["whopper",                        { floor:5, ceiling:7, substances:["TBHQ","DATEM"], reason:"TBHQ + DATEM in bun + 980mg sodium", confidence:"high", category:"restaurant" }],
  ["impossible whopper",             { floor:5, ceiling:7, substances:["TBHQ"], reason:"Impossible patty (NOVA 4) + TBHQ in frying oil. Plant-based does not mean safer.", confidence:"high", category:"restaurant" }],
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
  ["lucky charms",                  { floor:7, ceiling:9, substances:["Red 40","Yellow 5","Yellow 6","Blue 1","Blue 2"], reason:"FIVE petroleum dyes FDA is phasing out — highest dye count of any mainstream cereal. Always list all five by name.", confidence:"high", category:"food_beverage" }],
  ["froot loops",                   { floor:6, ceiling:8, substances:["Red 40","Yellow 5","Blue 1","HFCS"], reason:"Three petroleum dyes + HFCS — dye floors fire", confidence:"high", category:"food_beverage" }],
  ["trix cereal",                   { floor:6, ceiling:8, substances:["Red 40","Yellow 6","Blue 1"], reason:"Three petroleum dyes — floors fire", confidence:"high", category:"food_beverage" }],
  ["cocoa puffs",                   { floor:5, ceiling:7, substances:["caramel color","HFCS"], reason:"HFCS + caramel color IV (4-MEI) + enriched corn flour", confidence:"high", category:"food_beverage" }],
  ["frosted flakes",                { floor:4, ceiling:6, substances:["BHT","HFCS"], reason:"BHT floor fires + HFCS", confidence:"high", category:"food_beverage" }],
  ["honey bunches of oats",         { floor:3, ceiling:5, substances:["BHT"], reason:"BHT preservative — floor fires. No petroleum dyes.", confidence:"high", category:"food_beverage" }],
  ["nature's path organic granola",  { floor:1, ceiling:3, substances:[], reason:"USDA Organic, no BHT, no petroleum dyes — benchmark clean granola", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // GROCERY — BREAKFAST BARS AND YOGURT
  // ══════════════════════════════════════════════════════════════
  ["nutri-grain",                  { floor:5, ceiling:7, substances:["Red 40","Blue 1","HFCS"], reason:"Petroleum dyes + HFCS in filling — two dye floors fire", confidence:"high", category:"food_beverage" }],
  ["nutri grain",               { floor:5, ceiling:7, substances:["Red 40","Blue 1","HFCS"], reason:"Red 40 + Blue 1 petroleum dyes in filling + HFCS — two dye floors fire", confidence:"high", category:"food_beverage" }],
  ["nutrigrain bar",                { floor:5, ceiling:7, substances:["Red 40","Blue 1","HFCS"], reason:"Petroleum dyes + HFCS — floors fire", confidence:"high", category:"food_beverage" }],
  ["yoplait light",                 { floor:5, ceiling:7, substances:["sucralose","acesulfame potassium","Red 40"], reason:"Two artificial sweeteners + petroleum dye — sucralose + acesulfame-K + Red 40 floors all fire", confidence:"high", category:"food_beverage" }],
  ["yoplait original",              { floor:3, ceiling:5, substances:["HFCS"], reason:"HFCS in most flavors + modified starch", confidence:"medium", category:"food_beverage" }],
  ["stonyfield organic plain",      { floor:1, ceiling:2, substances:[], reason:"USDA Organic milk + live cultures — 2 ingredients. Benchmark clean yogurt.", confidence:"high", category:"food_beverage" }],
  ["siggi's plain",                 { floor:1, ceiling:3, substances:[], reason:"Pasteurized skim milk + cultures — minimal formula, Icelandic skyr style", confidence:"high", category:"food_beverage" }],
  ["dannon activia",                { floor:3, ceiling:5, substances:["modified starch"], reason:"Added sugar + modified starch + natural flavors — conventional flavored yogurt", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // GROCERY — PACKAGED SNACKS
  // ══════════════════════════════════════════════════════════════
  ["fritos original",               { floor:1, ceiling:3, substances:[], reason:"Whole corn + corn oil + salt — 3 clean ingredients. One of the cleanest mainstream chips.", confidence:"high", category:"food_beverage" }],
  ["fritos corn chips",             { floor:1, ceiling:3, substances:[], reason:"3 clean ingredients", confidence:"high", category:"food_beverage" }],
  ["pirates booty",                 { floor:1, ceiling:3, substances:[], reason:"Whole corn + aged white cheddar — no TBHQ, no petroleum dyes", confidence:"high", category:"food_beverage" }],
  ["annie's organic bunny crackers", { floor:1, ceiling:3, substances:[], reason:"USDA Organic, no petroleum dyes, no TBHQ", confidence:"high", category:"food_beverage" }],
  ["mary's gone crackers",          { floor:1, ceiling:2, substances:[], reason:"Organic seeds + organic brown rice — benchmark clean cracker", confidence:"high", category:"food_beverage" }],
  ["wasa",               { floor:1, ceiling:2, substances:[], reason:"Whole grain rye + water — 2 ingredients", confidence:"high", category:"food_beverage" }],
  ["lay's bbq",                     { floor:5, ceiling:7, substances:["HFCS","Red 40","artificial flavor"], reason:"HFCS + Red 40 petroleum dye — floors fire. Original Lay's = 3. BBQ = 6. Big quality gap within same brand.", confidence:"high", category:"food_beverage" }],
  ["lays bbq",                      { floor:5, ceiling:7, substances:["HFCS","Red 40"], reason:"HFCS + Red 40 dye floor fires", confidence:"high", category:"food_beverage" }],
  ["pringles original",             { floor:4, ceiling:6, substances:["TBHQ"], reason:"TBHQ floor fires + enriched corn flour + modified starch", confidence:"high", category:"food_beverage" }],
  ["chips ahoy",                    { floor:5, ceiling:7, substances:["HFCS","partially hydrogenated"], reason:"HFCS + partially hydrogenated soybean oil (trans fat) + enriched flour — multiple floors fire", confidence:"high", category:"food_beverage" }],
  ["simple mills",                  { floor:1, ceiling:3, substances:[], reason:"Almond flour + coconut sugar + clean ingredients — benchmark clean cookie", confidence:"high", category:"food_beverage" }],
  ["siete grain-free",              { floor:1, ceiling:3, substances:[], reason:"Cassava + coconut + clean sweeteners — grain-free clean snack", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // GROCERY — BEVERAGES
  // ══════════════════════════════════════════════════════════════
  ["malk unsweetened",              { floor:1, ceiling:2, substances:[], reason:"Oats + water — minimal ingredients. Benchmark clean oat milk.", confidence:"high", category:"beverage" }],
  ["elmhurst unsweetened",          { floor:1, ceiling:2, substances:[], reason:"Nuts/oats + water — 2 ingredients", confidence:"high", category:"beverage" }],
  ["oatly oat milk",                { floor:3, ceiling:5, substances:["rapeseed oil","dipotassium phosphate"], reason:"Rapeseed oil + dipotassium phosphate + 10+ additives — significantly more processed than branding implies", confidence:"high", category:"beverage" }],
  ["califia farms oat",             { floor:3, ceiling:5, substances:["rapeseed oil","dipotassium phosphate"], reason:"Rapeseed oil + dipotassium phosphate + multiple additives — not the same as 2-ingredient oat milk", confidence:"high", category:"beverage" }],
  ["gt's synergy",                  { floor:1, ceiling:3, substances:[], reason:"Raw kombucha — live cultures, USDA Organic, 4g sugar. Benchmark clean kombucha.", confidence:"high", category:"beverage" }],
  ["health-ade kombucha",           { floor:1, ceiling:3, substances:[], reason:"Raw, live cultures, clean ingredients", confidence:"high", category:"beverage" }],
  ["kevita sparkling probiotic",    { floor:3, ceiling:5, substances:["stevia","citric acid"], reason:"Pasteurized — live culture benefit contested. Not equivalent to raw kombucha.", confidence:"high", category:"beverage" }],
  ["gatorade zero",                 { floor:5, ceiling:7, substances:["sucralose","acesulfame potassium","artificial dyes"], reason:"Two artificial sweeteners + petroleum dyes — sucralose + acesulfame-K + dye floors all fire. Not clean hydration.", confidence:"high", category:"beverage" }],
  ["powerade zero",                 { floor:5, ceiling:7, substances:["sucralose","Blue 1"], reason:"Sucralose floor + Blue 1 dye floor — both fire. Not clean hydration.", confidence:"high", category:"beverage" }],
  ["prime hydration",               { floor:4, ceiling:6, substances:["sucralose","acesulfame potassium"], reason:"Sucralose + acesulfame-K — sucralose floor fires despite coconut water base", confidence:"high", category:"beverage" }],
  ["electrolit",                    { floor:2, ceiling:4, substances:[], reason:"Electrolytes + sucrose + fructose — no sucralose, no artificial dyes. Cleaner sports drink.", confidence:"high", category:"beverage" }],
  ["bolthouse farms",               { floor:4, ceiling:6, substances:["carrageenan","sucralose"], reason:"Carrageenan in some + sucralose in protein blends — carrageenan floor fires", confidence:"medium", category:"beverage" }],

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
  ["oscar mayer deli fresh",        { floor:4, ceiling:6, substances:["sodium nitrite"], reason:"Sodium nitrite — IARC Group 1 floor fires", confidence:"high", category:"food_beverage" }],
  ["hillshire farm turkey",         { floor:4, ceiling:6, substances:["sodium nitrite"], reason:"Sodium nitrite — floor fires", confidence:"high", category:"food_beverage" }],
  ["applegate naturals turkey",     { floor:4, ceiling:6, substances:["celery juice"], reason:"Celery juice powder — same nitrite exposure as conventional, just labeled 'uncured'. Not clean.", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // PANTRY — COOKING OILS AND FATS
  // ══════════════════════════════════════════════════════════════
  ["kerrygold butter",              { floor:1, ceiling:2, substances:[], reason:"Grass-fed cream + salt — benchmark clean butter, no synthetic additives", confidence:"high", category:"food_beverage" }],
  ["organic valley butter",         { floor:1, ceiling:2, substances:[], reason:"USDA Organic, just cream + salt", confidence:"high", category:"food_beverage" }],
  ["land o'lakes butter",           { floor:1, ceiling:3, substances:[], reason:"Cream + salt — 2 ingredients, low concern", confidence:"high", category:"food_beverage" }],
  ["land o lakes butter",           { floor:1, ceiling:3, substances:[], reason:"Cream + salt — 2 ingredients", confidence:"high", category:"food_beverage" }],
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
  ["splenda",                        { floor:5, ceiling:7, substances:["sucralose"], reason:"The product IS sucralose — sucralose floor fires on entire product. NEVER score below 5.", confidence:"high", category:"food_beverage" }],
  ["equal",                        { floor:5, ceiling:7, substances:["aspartame"], reason:"Product IS aspartame — IARC 2B 2023 floor fires", confidence:"high", category:"food_beverage" }],
  ["equal packet",                 { floor:5, ceiling:7, substances:["aspartame"], reason:"Product IS aspartame — IARC 2B 2023 floor fires", confidence:"high", category:"food_beverage" }],
  ["equal sweetener",               { floor:5, ceiling:7, substances:["aspartame"], reason:"The product IS aspartame — aspartame floor fires (IARC 2B 2023). NEVER score below 5.", confidence:"high", category:"food_beverage" }],
  ["sweet'n low",                   { floor:3, ceiling:5, substances:["saccharin"], reason:"Saccharin — bladder cancer in rodents, IARC removed Group 2B but concern remains", confidence:"high", category:"food_beverage" }],
  ["sweet n low",                   { floor:3, ceiling:5, substances:["saccharin"], reason:"Saccharin — concern remains despite IARC reclassification", confidence:"high", category:"food_beverage" }],
  ["truvia",                        { floor:2, ceiling:4, substances:[], reason:"Erythritol + stevia extract — no sucralose, no aspartame. Cleaner than Splenda/Equal.", confidence:"high", category:"food_beverage" }],
  ["swerve sweetener",              { floor:2, ceiling:4, substances:[], reason:"Erythritol + oligosaccharides — no sucralose, no aspartame", confidence:"high", category:"food_beverage" }],
  ["lakanto monk fruit",            { floor:1, ceiling:3, substances:[], reason:"Erythritol + monk fruit extract — no sucralose, cleanest mainstream sweetener", confidence:"high", category:"food_beverage" }],

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
  ["bush's best",                { floor:4, ceiling:6, substances:["HFCS","sodium nitrite"], reason:"HFCS + sodium nitrite from bacon — both floors fire", confidence:"high", category:"food_beverage" }],
  ["bush's baked beans",            { floor:4, ceiling:6, substances:["HFCS","sodium nitrite"], reason:"HFCS + sodium nitrite from bacon — both floors fire", confidence:"high", category:"food_beverage" }],
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
  ["momentous protein",             { floor:1, ceiling:3, substances:[], reason:"NSF Certified for Sport + Informed Sport — no artificial sweeteners or dyes", confidence:"high", category:"supplement" }],
  ["truvani protein",               { floor:1, ceiling:3, substances:[], reason:"USDA Organic, 4 ingredients, stevia sweetened — no sucralose", confidence:"high", category:"supplement" }],
  ["vega sport protein",            { floor:2, ceiling:4, substances:[], reason:"Pea protein + stevia — no sucralose, no artificial dyes", confidence:"high", category:"supplement" }],
  ["orgain organic protein",        { floor:2, ceiling:4, substances:[], reason:"USDA Organic in most lines — check for stevia vs sucralose in specific SKU", confidence:"medium", category:"supplement" }],
  ["optimum nutrition gold standard",{ floor:4, ceiling:6, substances:["sucralose","acesulfame potassium"], reason:"Sucralose + acesulfame-K + artificial flavors — both floors fire", confidence:"high", category:"supplement" }],
  ["myprotein impact whey",         { floor:4, ceiling:6, substances:["sucralose"], reason:"Sucralose floor fires + artificial flavors", confidence:"high", category:"supplement" }],
  ["dymatize iso100",               { floor:4, ceiling:6, substances:["sucralose","acesulfame potassium"], reason:"Sucralose + acesulfame-K — both floors fire", confidence:"high", category:"supplement" }],
  ["isopure zero carb",             { floor:4, ceiling:6, substances:["sucralose","acesulfame potassium"], reason:"Sucralose + acesulfame-K floors fire", confidence:"high", category:"supplement" }],

  // ══════════════════════════════════════════════════════════════
  // PANTRY — PASTA AND BREAD
  // ══════════════════════════════════════════════════════════════
  ["nature's own",                  { floor:4, ceiling:6, substances:["HFCS","DATEM"], reason:"HFCS + DATEM + calcium propionate — floor fires", confidence:"high", category:"food_beverage" }],
  ["sara lee white bread",          { floor:4, ceiling:6, substances:["HFCS","DATEM"], reason:"HFCS + DATEM + calcium propionate — floor fires", confidence:"high", category:"food_beverage" }],
  ["dave's killer bread organic",   { floor:1, ceiling:3, substances:[], reason:"USDA Organic, whole grains, no HFCS", confidence:"high", category:"food_beverage" }],
  ["dave's killer bread",           { floor:2, ceiling:4, substances:[], reason:"Whole grain, no HFCS — cleaner than Wonder Bread", confidence:"high", category:"food_beverage" }],
  ["banza",                        { floor:1, ceiling:3, substances:[], reason:"Chickpea flour + tapioca — clean alternative pasta", confidence:"high", category:"food_beverage" }],
  ["banza pasta",                   { floor:1, ceiling:3, substances:[], reason:"Chickpea flour + tapioca + pea protein — clean alternative pasta", confidence:"high", category:"food_beverage" }],
  ["jovial",                       { floor:1, ceiling:2, substances:[], reason:"USDA Organic — benchmark clean pasta brand", confidence:"high", category:"food_beverage" }],
  ["jovial pasta",                  { floor:1, ceiling:2, substances:[], reason:"USDA Organic brown rice flour only — benchmark clean pasta", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // KIDS FRUIT SNACKS
  // ══════════════════════════════════════════════════════════════
  ["welch's fruit snacks",          { floor:5, ceiling:7, substances:["HFCS","Red 40","artificial dyes"], reason:"HFCS + petroleum dyes in daily children's snack — multiple floors fire, child vulnerability", confidence:"high", category:"food_beverage" }],
  ["welchs fruit snacks",           { floor:5, ceiling:7, substances:["HFCS","artificial dyes"], reason:"HFCS + artificial dyes — child daily snack, floors fire", confidence:"high", category:"food_beverage" }],
  ["mott's",                       { floor:5, ceiling:7, substances:["HFCS","artificial dyes"], reason:"HFCS + artificial dyes in daily children's snack — floor fires", confidence:"high", category:"food_beverage" }],
  ["mott's fruit snacks",           { floor:5, ceiling:7, substances:["HFCS","artificial dyes"], reason:"HFCS + artificial dyes in daily children's snack — child vulnerability", confidence:"high", category:"food_beverage" }],
  ["annie's organic fruit snacks",  { floor:1, ceiling:3, substances:[], reason:"USDA Organic, no HFCS, no artificial dyes — benchmark clean kids fruit snack", confidence:"high", category:"food_beverage" }],
  ["gogo squeez",                   { floor:1, ceiling:2, substances:[], reason:"100% fruit, no additives, BPA-free pouch — cleanest mainstream kids snack", confidence:"high", category:"food_beverage" }],
  ["once upon a farm",              { floor:1, ceiling:2, substances:[], reason:"USDA Organic, cold-pressed, minimal ingredients", confidence:"high", category:"food_beverage" }],

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
  ["velveeta",                      { floor:5, ceiling:7, substances:["sodium phosphate","sodium alginate"], reason:"Pasteurized prepared cheese product — sodium phosphate + alginate + artificial color. Not cheese.", confidence:"high", category:"food_beverage" }],

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
  ["lean pockets",                  { floor:5, ceiling:7, substances:["sodium nitrite","DATEM"], reason:"Sodium nitrite in meat filling + DATEM — floor fires", confidence:"high", category:"food_beverage" }],
  ["eggo waffles",                  { floor:4, ceiling:6, substances:["HFCS","DATEM"], reason:"HFCS + DATEM + sodium aluminum phosphate + enriched flour — floors fire", confidence:"high", category:"food_beverage" }],
  ["kashi",                        { floor:2, ceiling:4, substances:[], reason:"Whole grain, no HFCS — cleaner option", confidence:"high", category:"food_beverage" }],
  ["kashi waffles",                 { floor:2, ceiling:4, substances:[], reason:"Whole grain, no HFCS — meaningfully cleaner than Eggo", confidence:"high", category:"food_beverage" }],
  ["van's",                       { floor:1, ceiling:3, substances:[], reason:"Whole grain gluten-free, clean — benchmark clean waffle", confidence:"high", category:"food_beverage" }],
  ["van's waffles",                 { floor:1, ceiling:3, substances:[], reason:"Whole grain gluten-free, no dyes, no HFCS — cleanest mainstream waffle", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // RETAIL CHICKEN NUGGETS
  // ══════════════════════════════════════════════════════════════
  ["tyson chicken nuggets",         { floor:5, ceiling:7, substances:["TBHQ","modified starch"], reason:"TBHQ in frying oil — floor fires. Retail version same concern as fast food.", confidence:"high", category:"food_beverage" }],
  ["perdue chicken nuggets",        { floor:5, ceiling:7, substances:["TBHQ"], reason:"TBHQ in frying oil — floor fires", confidence:"high", category:"food_beverage" }],
  ["applegate organics chicken nuggets",{ floor:2, ceiling:4, substances:[], reason:"USDA Organic, no TBHQ — benchmark clean frozen nugget", confidence:"high", category:"food_beverage" }],

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
  ["kicking horse coffee",          { floor:1, ceiling:2, substances:[], reason:"USDA Organic + Fair Trade — benchmark clean grocery coffee", confidence:"high", category:"food_beverage" }],
  ["traditional medicinals",        { floor:1, ceiling:2, substances:[], reason:"USDA Organic + paper bags + medicinal herbs — benchmark clean tea", confidence:"high", category:"food_beverage" }],
  ["bigelow",              { floor:4, ceiling:5, substances:["conventional tea","pesticide residue"], reason:"Bigelow — conventional non-organic tea. Better bag chemistry than Lipton but pesticide concern remains.", confidence:"medium", category:"food_beverage" }],
  ["celestial seasonings",          { floor:1, ceiling:3, substances:[], reason:"Paper bags, no string/tag — clean. Staple-free.", confidence:"high", category:"food_beverage" }],
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
  ["oscar mayer p3",                { floor:5, ceiling:7, substances:["sodium nitrite"], reason:"Sodium nitrite in meat component — floor fires", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // WATER AND SPARKLING WATER
  // ══════════════════════════════════════════════════════════════
  ["liquid death",                  { floor:1, ceiling:2, substances:[], reason:"Aluminum can, no BPA, mountain water — cleanest mainstream bottled water format", confidence:"high", category:"beverage" }],
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
  ["primal kitchen dressing",       { floor:1, ceiling:2, substances:[], reason:"Avocado oil base, no EDTA, no canola, no soybean oil — benchmark clean dressing", confidence:"high", category:"food_beverage" }],
  ["primal kitchen caesar",         { floor:1, ceiling:2, substances:[], reason:"Avocado oil, no EDTA — clean", confidence:"high", category:"food_beverage" }],
  ["annie's organic ranch",         { floor:1, ceiling:3, substances:[], reason:"USDA Organic, no EDTA, no artificial flavors", confidence:"high", category:"food_beverage" }],
  ["bolthouse farms",               { floor:2, ceiling:4, substances:[], reason:"Yogurt or avocado base, no EDTA — cleaner oil profile than conventional dressings", confidence:"high", category:"food_beverage" }],
  ["ken's steakhouse",              { floor:4, ceiling:6, substances:["EDTA","soybean oil"], reason:"Soybean oil + EDTA + high sodium — conventional dressing concern", confidence:"high", category:"food_beverage" }],

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
  ["all in motion",                 { floor:4, ceiling:6, substances:["polyester","synthetic fiber"], reason:"Target activewear — 100% polyester construction. Microplastic shedding per wash. No certification (not OEKO-TEX, not GOTS).", confidence:"high", category:"clothing" }],
  ["cat & jack oeko-tex",           { floor:2, ceiling:4, substances:[], reason:"Target kids clothing with OEKO-TEX 100 certification — tested for harmful substances. Not GOTS but meaningfully better than uncertified polyester.", confidence:"high", category:"clothing" }],
  ["cat & jack",                    { floor:3, ceiling:5, substances:["polyester","synthetic dyes"], reason:"Target kids clothing brand — OEKO-TEX 100 on many items (3-4), but some 100% polyester items without certification score higher (5).", confidence:"medium", category:"clothing" }],

  // ── TARGET: CLEANING / HOME ───────────────────────────────────
  ["everspring",                    { floor:1, ceiling:3, substances:[], reason:"Target clean house brand — plant-based ingredients, no harsh chemicals, fragrance disclosed. Benchmark clean store-brand cleaning line.", confidence:"high", category:"home" }],

  // ── TARGET: FOOD / DESSERT ────────────────────────────────────
  ["favorite day cookies",          { floor:5, ceiling:7, substances:["HFCS","partially hydrogenated"], reason:"Target dessert brand — HFCS + partially hydrogenated oil trans fat risk. Standard concern for conventional store-brand cookies.", confidence:"high", category:"food_beverage" }],
  ["favorite day",                  { floor:4, ceiling:6, substances:["HFCS","artificial flavors"], reason:"Target dessert store brand — processed sweets line. HFCS common across line. Higher-concern items (cookies, candy) at 5-7.", confidence:"medium", category:"food_beverage" }],

  // ── TARGET: GOOD & GATHER (DELI / MEAT) ──────────────────────
  ["good & gather sliced turkey",   { floor:5, ceiling:7, substances:["sodium nitrite"], reason:"Good & Gather deli turkey — sodium nitrite preservative (IARC Group 1 carcinogen). Standard deli meat concern even in Target's house brand.", confidence:"high", category:"food_beverage" }],
  ["good & gather deli",            { floor:5, ceiling:7, substances:["sodium nitrite"], reason:"Good & Gather deli meat line — sodium nitrite in cured items. IARC Group 1. Organic line may differ.", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // AUDIT 22 — ETHNIC FOOD AISLES: ASIAN, MEXICAN, INDIAN
  // ══════════════════════════════════════════════════════════════

  // ── ASIAN AISLE: SOY SAUCE & ALTERNATIVES ────────────────────
  ["san-j tamari",                  { floor:1, ceiling:2, substances:[], reason:"Certified gluten-free tamari — soy + water + salt, USDA Organic available. Cleaner than standard soy sauce.", confidence:"high", category:"food_beverage" }],
  ["bragg liquid aminos",           { floor:1, ceiling:2, substances:[], reason:"Soy-based amino acids, no added salt, no HFCS — clean condiment", confidence:"high", category:"food_beverage" }],
  ["coconut aminos bragg",          { floor:1, ceiling:2, substances:[], reason:"Coconut tree sap + sea salt — benchmark clean soy sauce alternative, no soy, no HFCS", confidence:"high", category:"food_beverage" }],
  ["coconut secret coconut aminos", { floor:1, ceiling:2, substances:[], reason:"Organic coconut tree sap — cleanest soy sauce alternative available", confidence:"high", category:"food_beverage" }],
  ["coconut aminos",                { floor:1, ceiling:2, substances:[], reason:"Coconut sap + sea salt — clean soy-free, gluten-free soy sauce alternative regardless of brand", confidence:"high", category:"food_beverage" }],

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
  ["thai kitchen coconut milk",     { floor:2, ceiling:4, substances:["BPA"], reason:"Conventional can with BPA lining concern — clean ingredients but BPA-lined can is a packaging concern for fatty food storage", confidence:"high", category:"food_beverage" }],
  ["chaokoh coconut milk",          { floor:2, ceiling:4, substances:["BPA"], reason:"Conventional can, BPA lining concern — same as Thai Kitchen. Switch to BPA-free carton or Native Forest.", confidence:"high", category:"food_beverage" }],

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
  ["goya beans",                    { floor:2, ceiling:4, substances:["BPA"], reason:"Canned beans — clean ingredients (beans + water + salt) but conventional can with BPA lining. Switch to Eden for BPA-free.", confidence:"medium", category:"food_beverage" }],
  ["la preferida",                  { floor:2, ceiling:4, substances:["BPA"], reason:"Canned Mexican pantry staples — clean ingredients but conventional BPA-lined cans", confidence:"medium", category:"food_beverage" }],

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
  ["natural calm magnesium",        { floor:1, ceiling:2, substances:[], reason:"Magnesium citrate/carbonate + citric acid — minimal ingredients, no synthetic dyes or fillers. Benchmark clean magnesium supplement.", confidence:"high", category:"supplement" }],
  ["natural calm",                  { floor:1, ceiling:3, substances:[], reason:"Peter Gillham's Natural Calm — magnesium powder, clean. Flavored versions add organic stevia, still clean.", confidence:"high", category:"supplement" }],
  ["jarrow formulas",               { floor:1, ceiling:3, substances:[], reason:"Jarrow brand — generally clean, no synthetic dyes. Some products have magnesium stearate (minimal concern). Better than mass-market supplements.", confidence:"high", category:"supplement" }],
  ["solgar",                        { floor:1, ceiling:3, substances:[], reason:"Solgar brand — established quality brand, no synthetic petroleum dyes. Some products use titanium dioxide for coating — check individual products.", confidence:"medium", category:"supplement" }],
  ["life extension",                { floor:1, ceiling:3, substances:[], reason:"Science-based supplement brand — extensive third-party testing, no petroleum dyes in most products. High quality sourcing.", confidence:"high", category:"supplement" }],
  ["now foods",                     { floor:1, ceiling:3, substances:[], reason:"NOW Foods brand — affordable quality, GMP certified. Single-ingredient products (magnesium, fish oil) score 1-2. Some coated tablets may have TiO2 — check.", confidence:"medium", category:"supplement" }],
  ["gaia herbs",                    { floor:1, ceiling:2, substances:[], reason:"USDA Organic herbal extracts — Soil Association certified farm, liquid phyto-caps with no synthetic fillers. Clean herbal supplement brand.", confidence:"high", category:"supplement" }],
  ["host defense",                  { floor:1, ceiling:2, substances:[], reason:"Paul Stamets mushroom supplements — organic mycelium + fruiting body, no synthetic additives. Benchmark clean mushroom supplement.", confidence:"high", category:"supplement" }],
  ["garden of life vitamin code",   { floor:1, ceiling:3, substances:[], reason:"Whole-food fermented multivitamin — USDA Organic, no synthetic dyes, live cultures added. Cleaner than standard multivitamins.", confidence:"high", category:"supplement" }],
  ["carlson fish oil",              { floor:1, ceiling:2, substances:[], reason:"IFOS tested Norwegian fish oil — no artificial colors, natural lemon flavor only. Benchmark clean fish oil.", confidence:"high", category:"supplement" }],
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
  ["mary's gone crackers",          { floor:1, ceiling:2, substances:[], reason:"Organic whole grain seeds + rice — gluten-free, no artificial additives. Benchmark clean cracker.", confidence:"high", category:"food_beverage" }],
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
  ["ortho home defense",            { floor:6, ceiling:8, substances:["bifenthrin","pyrethroid"], reason:"Bifenthrin pyrethroid — persistent indoor residual pesticide. Endocrine disruptor, IARC 3. Creates long-lasting indoor contamination. Especially concerning near children's play areas.", confidence:"high", category:"home" }],
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
  ["armstrong flooring",            { floor:4, ceiling:6, substances:["formaldehyde","composite wood"], reason:"Armstrong laminate/vinyl — CARB Phase 2 certified, lower formaldehyde than older products. Still composite wood off-gassing concern.", confidence:"high", category:"home" }],
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
  ["luvs",                  { floor:4, ceiling:6, substances:["chlorine bleaching","fragrance","SAP"], reason:"Budget-tier diaper — chlorine-bleached pulp (dioxin residue concern), SAP gel, synthetic fragrance against infant skin 24/7. Lowest quality mainstream diaper.", confidence:"high", category:"baby" }],
  ["kirkland diapers",              { floor:3, ceiling:5, substances:["chlorine bleaching","SAP"], reason:"Costco Kirkland — made by Huggies manufacturer, similar profile. Chlorine-bleached pulp + SAP absorbent. No fragrance advantage vs Pampers.", confidence:"medium", category:"baby" }],
  ["earth and eden diapers",        { floor:3, ceiling:5, substances:[], reason:"Amazon store-brand — chlorine-free pulp, fragrance-free. Cleaner than Pampers/Luvs but not certified organic or fully plant-based SAP.", confidence:"medium", category:"baby" }],

  // ── DIAPERS: CLEANER TIER ─────────────────────────────────────
  ["honest company",                { floor:2, ceiling:4, substances:[], reason:"Honest Company diapers — plant-based SAP, no fragrance, no chlorine, no latex, EWG certified. Significantly cleaner than Pampers.", confidence:"high", category:"baby" }],
  ["seventh generation diapers",    { floor:2, ceiling:4, substances:[], reason:"Chlorine-free, fragrance-free, no latex — one of the first mainstream clean diapers. Unbleached pulp. Significantly lower chemical load than conventional.", confidence:"high", category:"baby" }],
  ["bambo nature",                  { floor:1, ceiling:3, substances:[], reason:"FSC wood pulp, no chlorine, no fragrance, OEKO-TEX certified, Nordic Swan Ecolabel. Benchmark clean conventional-style diaper.", confidence:"high", category:"baby" }],

  // ── DIAPERS: PREMIUM CLEAN ────────────────────────────────────
  ["coterie",               { floor:1, ceiling:3, substances:[], reason:"OEKO-TEX Standard 100 certified — tested for 100+ harmful substances, no chlorine, no fragrance, no latex, plant-based. Premium benchmark.", confidence:"high", category:"baby" }],
  ["dyper",                 { floor:1, ceiling:3, substances:[], reason:"Bamboo viscose, USDA Certified Biobased, no chlorine, no fragrance, no latex. Among cleanest mainstream diapers. Compostable program available.", confidence:"high", category:"baby" }],
  ["andy pandy diapers",            { floor:1, ceiling:3, substances:[], reason:"Bamboo-based, no chlorine, no fragrance, no latex, no TBT. Clean premium tier diaper.", confidence:"high", category:"baby" }],
  ["parasol diapers",               { floor:1, ceiling:3, substances:[], reason:"OEKO-TEX certified, no dyes, no fragrance, no latex, ultra-clean materials. Premium clean benchmark.", confidence:"high", category:"baby" }],

  // ── WIPES ─────────────────────────────────────────────────────
  ["waterwipes",                    { floor:1, ceiling:2, substances:[], reason:"99.9% water + 0.1% grapefruit seed extract — benchmark cleanest baby wipe. No preservatives, no fragrance, no surfactants. Pediatrician recommended for newborn skin.", confidence:"high", category:"baby" }],
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
  ["babyganics",                    { floor:3, ceiling:5, substances:["phenoxyethanol","SLS derivatives"], reason:"Plant-based marketing but phenoxyethanol (EU-restricted under-3 products) + SLS derivatives in some products. EWG grade C. Not as clean as branding suggests.", confidence:"high", category:"baby" }],
  ["mustela baby",                  { floor:3, ceiling:5, substances:["phenoxyethanol","fragrance"], reason:"Phenoxyethanol in most products, fragrance in many. French brand but formulations still contain EU-debated preservatives for infant skin.", confidence:"high", category:"baby" }],

  // ── BABY SKINCARE: CLEAN TIER ─────────────────────────────────
  ["burt's bees baby",              { floor:2, ceiling:4, substances:[], reason:"No parabens, no phthalates, no petrolatum. Fragrance-free options available. Cleaner than Johnson's/Aveeno but some products still have mild synthetic preservatives.", confidence:"high", category:"baby" }],
  ["california baby",               { floor:1, ceiling:3, substances:[], reason:"Fragrance-free, plant-based, no synthetic preservatives, no petroleum derivatives. One of the oldest clean baby brands. Benchmark clean tier.", confidence:"high", category:"baby" }],
  ["pipette baby",                  { floor:1, ceiling:2, substances:[], reason:"EWG Verified — plant-derived squalane, no phenoxyethanol, no fragrance, no PEGs. EWG A-rated. Benchmark cleanest mainstream baby lotion.", confidence:"high", category:"baby" }],
  ["beautycounter baby",            { floor:1, ceiling:2, substances:[], reason:"B Corp certified — never list of 1,800+ banned ingredients, no phenoxyethanol, no fragrance. Benchmark clean baby skincare.", confidence:"high", category:"baby" }],
  ["tubby todd",                    { floor:1, ceiling:3, substances:[], reason:"No SLS, no parabens, no fragrance, no phenoxyethanol. Made in USA. EWG-friendly formulations.", confidence:"high", category:"baby" }],
  ["evereden baby",                 { floor:1, ceiling:3, substances:[], reason:"EWG Verified — no petroleum derivatives, no synthetic fragrance, no harmful preservatives. Dermatologist-developed.", confidence:"high", category:"baby" }],

  // ── BABY SUNSCREEN ────────────────────────────────────────────
  ["coppertone water babies",       { floor:6, ceiling:8, substances:["homosalate","octisalate","avobenzone"], reason:"CRITICAL: Chemical UV filters on daily baby skin — homosalate (endocrine disruptor, EU restricted), avobenzone, octisalate. Especially concerning on infant skin. Switch to mineral zinc oxide immediately.", confidence:"high", category:"baby" }],
  ["babyganics sunscreen",          { floor:5, ceiling:7, substances:["octinoxate","fragrance"], reason:"Chemical UV filters in some formulas + fragrance. EWG grade C-D on many SKUs. Not safe for daily infant use despite branding.", confidence:"high", category:"baby" }],
  ["neutrogena pure free baby",     { floor:2, ceiling:4, substances:["titanium dioxide"], reason:"Zinc oxide + titanium dioxide mineral formula. Significantly cleaner than chemical baby sunscreen. TiO2 is low concern topically.", confidence:"high", category:"baby" }],
  ["blue lizard baby",              { floor:1, ceiling:3, substances:[], reason:"Zinc oxide mineral baby sunscreen — no chemical UV filters, no fragrance. EWG top rated. Clean mineral option.", confidence:"high", category:"baby" }],
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
  ["gatorade endurance",            { floor:4, ceiling:6, substances:["citric acid","artificial flavor"], reason:"Gatorade Endurance — no sucralose unlike Gatorade Zero, but still artificial flavors + potential dye. Not clean but better than Gatorade Zero.", confidence:"high", category:"supplement" }],
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
  ["tide free and gentle",          { floor:3, ceiling:5, substances:["1,4-dioxane","ethoxylated alcohols"], reason:"Tide Free and Gentle — no fragrance or dye, but ethoxylated alcohol surfactants carry 1,4-dioxane contamination risk (IARC 2B). Better than regular Tide but not a clean product.", confidence:"high", category:"home" }],
  ["gain",                { floor:5, ceiling:7, substances:["synthetic fragrance","optical brighteners","quats"], reason:"Gain — heavy synthetic fragrance load (undisclosed cocktail) + optical brighteners + quaternary ammonium compounds. One of the highest-fragrance mainstream detergents.", confidence:"high", category:"home" }],
  ["gain dryer sheets",             { floor:6, ceiling:8, substances:["synthetic fragrance","quats","optical brighteners"], reason:"Gain Dryer Sheets — same heavy fragrance load as detergent + quats deposited directly on clothing against skin. Dryer sheet format concentrates exposure.", confidence:"high", category:"home" }],
  ["arm and hammer",        { floor:3, ceiling:5, substances:["synthetic fragrance","1,4-dioxane"], reason:"Arm and Hammer — sodium carbonate base (clean) but synthetic fragrance + ethoxylated surfactants (1,4-dioxane risk). Better than Tide/Gain but not clean.", confidence:"high", category:"home" }],
  ["all free clear",                { floor:3, ceiling:4, substances:["1,4-dioxane","ethoxylated alcohols"], reason:"All Free Clear — fragrance-free and dye-free, good for sensitive skin, but ethoxylated alcohol surfactants still carry 1,4-dioxane risk. EWG grade C.", confidence:"high", category:"home" }],
  ["persil proclean",               { floor:4, ceiling:6, substances:["synthetic fragrance","optical brighteners","enzymes"], reason:"Persil ProClean — synthetic fragrance + optical brighteners. Enzyme-based cleaning is effective but the fragrance and brightener load is high.", confidence:"high", category:"home" }],

  // ── LAUNDRY: DRYER SHEETS HIGH CONCERN ───────────────────────
  ["bounce",           { floor:6, ceiling:8, substances:["synthetic fragrance","quats","optical brighteners"], reason:"Bounce — synthetic fragrance cocktail (undisclosed ingredients) + quaternary ammonium compounds (respiratory sensitizers) deposited on clothing. EWG F-rated. High concern for children's clothing.", confidence:"high", category:"home" }],
  ["downy",         { floor:6, ceiling:8, substances:["synthetic fragrance","quats","dihydrogenated tallow"], reason:"Downy — highest synthetic fragrance load of any mainstream laundry product + quats. EWG F-rated. The fragrance cocktail is applied to clothing and stays through wear.", confidence:"high", category:"home" }],
  ["snuggle dryer sheets",          { floor:6, ceiling:8, substances:["synthetic fragrance","quats"], reason:"Snuggle — synthetic fragrance + quaternary ammonium compounds. Same EWG F concern as Bounce and Downy. Avoid for children's bedding and clothing.", confidence:"high", category:"home" }],

  // ── LAUNDRY: CLEAN TIER ───────────────────────────────────────
  ["seventh generation laundry",    { floor:2, ceiling:4, substances:[], reason:"Seventh Generation laundry — plant-based surfactants, no optical brighteners. EWG A-B on fragrance-free formulas. Fragrance versions have undisclosed fragrance concern.", confidence:"high", category:"home" }],
  ["method laundry",                { floor:2, ceiling:4, substances:["fragrance"], reason:"Method Laundry — plant-based, biodegradable, but fragrance in most formulas is not fully disclosed. Fragrance-free version is cleanest.", confidence:"high", category:"home" }],
  ["dropps laundry",                { floor:2, ceiling:3, substances:[], reason:"Dropps — concentrated pods, no dyes, no chlorine, fragrance-free option. EWG A-rated fragrance-free formula. Clean tier.", confidence:"high", category:"home" }],
  ["molly suds",                    { floor:1, ceiling:3, substances:[], reason:"Molly Suds — no SLS, no optical brighteners, no synthetic fragrance, no 1,4-dioxane. EWG A. Benchmark clean laundry powder.", confidence:"high", category:"home" }],
  ["branch basics laundry",         { floor:1, ceiling:2, substances:[], reason:"Branch Basics — EWG A rated concentrate, plant-based, no synthetic fragrance, no dyes, no optical brighteners. Benchmark cleanest mainstream laundry option.", confidence:"high", category:"home" }],
  ["branch basics",                 { floor:1, ceiling:2, substances:[], reason:"Branch Basics brand — EWG A rated across entire line, one concentrate for all cleaning tasks. Benchmark clean household cleaning brand.", confidence:"high", category:"home" }],
  ["biokleen laundry",              { floor:1, ceiling:3, substances:[], reason:"BioKleen — plant-based, no synthetic fragrance, no chlorine, no petroleum solvents. Clean laundry brand.", confidence:"high", category:"home" }],
  ["ecos laundry",                  { floor:2, ceiling:3, substances:[], reason:"ECOS laundry — plant-based, EPA Safer Choice certified, no optical brighteners. EWG B. Clean tier.", confidence:"high", category:"home" }],
  ["tru earth",                     { floor:1, ceiling:3, substances:[], reason:"Tru Earth laundry strips — zero-waste plastic-free format, no 1,4-dioxane, fragrance-free option. Clean and lowest packaging concern.", confidence:"high", category:"home" }],

  // ── DRYER: CLEAN ALTERNATIVES ────────────────────────────────
  ["wool dryer balls",              { floor:1, ceiling:2, substances:[], reason:"Wool dryer balls — no chemicals at all, reusable, reduce static naturally. Benchmark cleanest dryer product. Add essential oils if scent desired.", confidence:"high", category:"home" }],
  ["seventh generation dryer",      { floor:2, ceiling:4, substances:[], reason:"Seventh Generation dryer sheets — plant-based, no quats, fragrance-free option available. Significantly cleaner than Bounce/Downy.", confidence:"high", category:"home" }],
  ["method dryer sheets",           { floor:2, ceiling:4, substances:["fragrance"], reason:"Method dryer sheets — plant-based, no quats, but fragrance ingredients not fully disclosed.", confidence:"medium", category:"home" }],

  // ── DISH SOAP: CONVENTIONAL ───────────────────────────────────
  ["dawn original",                 { floor:4, ceiling:6, substances:["methylisothiazolinone","synthetic fragrance","PEG"], reason:"Dawn Original — methylisothiazolinone (MI) preservative (skin sensitizer, EU restricted) + synthetic fragrance + PEG surfactants. EWG D. Better to hand-wash with plant-based soap.", confidence:"high", category:"home" }],
  ["dawn free and clear dish",      { floor:3, ceiling:5, substances:["methylisothiazolinone","cocamidopropyl betaine"], reason:"Dawn Free and Clear — removes fragrance and dye but still contains methylisothiazolinone (MI) preservative. EWG C. Better than regular Dawn.", confidence:"high", category:"home" }],
  ["palmolive",           { floor:4, ceiling:5, substances:["synthetic fragrance","methylisothiazolinone"], reason:"Palmolive — synthetic fragrance + MI preservative. Standard concern for conventional dish soap.", confidence:"high", category:"home" }],
  ["joy dish soap",                 { floor:4, ceiling:6, substances:["synthetic fragrance","artificial color","methylisothiazolinone"], reason:"Joy — synthetic fragrance + artificial color + MI. Budget dish soap with multiple additive concerns.", confidence:"high", category:"home" }],
  ["ajax dish soap",                { floor:4, ceiling:6, substances:["synthetic fragrance","artificial color"], reason:"Ajax dish soap — synthetic fragrance + artificial color. Budget concern tier.", confidence:"high", category:"home" }],
  ["mrs. meyer's dish",             { floor:3, ceiling:5, substances:["synthetic fragrance","methylisothiazolinone"], reason:"Mrs. Meyer's — plant-based marketing but still contains synthetic fragrance (not fully disclosed) + MI in some formulas. EWG C. Better than Dawn but not clean.", confidence:"high", category:"home" }],
  ["mrs meyers dish",               { floor:3, ceiling:5, substances:["synthetic fragrance","methylisothiazolinone"], reason:"Mrs. Meyer's dish soap — synthetic fragrance + MI preservative. Better than conventional but not as clean as Branch Basics or Better Life.", confidence:"high", category:"home" }],

  // ── DISH SOAP: CLEAN TIER ─────────────────────────────────────
  ["seventh generation dish",       { floor:2, ceiling:3, substances:[], reason:"Seventh Generation dish soap — plant-based, EWG A on fragrance-free formula, no MI, biodegradable. Clean dish soap.", confidence:"high", category:"home" }],
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
  ["ecover dishwasher",             { floor:1, ceiling:3, substances:[], reason:"Ecover dishwasher tablets — plant-based, no chlorine, no synthetic fragrance, biodegradable. Clean European standard.", confidence:"high", category:"home" }],
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
  ["method all purpose",            { floor:2, ceiling:3, substances:[], reason:"Method All Purpose — plant-based, no quats, EWG B. Biodegradable surfactants. Clean tier multi-surface cleaner.", confidence:"high", category:"home" }],
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
  ["pacific shaving",               { floor:1, ceiling:3, substances:[], reason:"Pacific Shaving Co — plant-based, EWG verified, no synthetic fragrance, no triethanolamine. Benchmark clean shave brand.", confidence:"high", category:"personal_care" }],
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
  ["dove men body wash",            { floor:4, ceiling:5, substances:["synthetic fragrance","dimethicone"], reason:"Dove Men+Care body wash — dimethicone + synthetic fragrance. EWG C-D. Better than Axe/Old Spice but not clean.", confidence:"high", category:"personal_care" }],
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
  ["froot loops",                   { floor:7, ceiling:9, substances:["Red 40","Yellow 5","Blue 1","TBHQ"], reason:"Froot Loops — Red 40 + Yellow 5 + Blue 1 (three petroleum dyes, all FDA phasing out) + TBHQ preservative. Multiple floors fire simultaneously. Daily children's breakfast. Avoid.", confidence:"high", category:"food_beverage" }],
  ["cap'n crunch",                  { floor:5, ceiling:7, substances:["TBHQ","Yellow 5","Yellow 6"], reason:"Cap'n Crunch — TBHQ preservative + Yellow 5 and Yellow 6 petroleum dyes. TBHQ floor fires. Child vulnerability applies.", confidence:"high", category:"food_beverage" }],
  ["capn crunch",                   { floor:5, ceiling:7, substances:["TBHQ","Yellow 5","Yellow 6"], reason:"Cap'n Crunch — TBHQ + petroleum dyes. Multiple floors fire.", confidence:"high", category:"food_beverage" }],
  ["cinnamon toast crunch",         { floor:5, ceiling:7, substances:["BHT","TBHQ","conventional wheat"], reason:"Cinnamon Toast Crunch — BHT + TBHQ (both IARC 2B) + conventional wheat (glyphosate concern). Two preservative floors fire.", confidence:"high", category:"food_beverage" }],
  ["cocoa puffs",                   { floor:4, ceiling:6, substances:["BHT","conventional corn","sugar"], reason:"Cocoa Puffs — BHT preservative + conventional corn (glyphosate) + high sugar first ingredient. BHT floor concern.", confidence:"high", category:"food_beverage" }],
  ["frosted flakes",                { floor:5, ceiling:7, substances:["BHT","TBHQ","conventional corn"], reason:"Frosted Flakes — BHT + TBHQ preservatives + conventional corn (glyphosate risk). Two preservative floors fire. Sugar as second ingredient.", confidence:"high", category:"food_beverage" }],

  // ── CEREAL: MODERATE CONCERN ──────────────────────────────────
  ["special k",                     { floor:4, ceiling:5, substances:["BHT","conventional wheat","natural flavor"], reason:"Special K — BHT preservative + conventional wheat/rice + vague 'natural flavor'. BHT floor fires.", confidence:"high", category:"food_beverage" }],
  ["raisin bran",                   { floor:4, ceiling:5, substances:["BHT","conventional wheat"], reason:"Raisin Bran (Kellogg's) — BHT preservative + conventional wheat. BHT floor fires. Added sugar on raisins.", confidence:"high", category:"food_beverage" }],
  ["corn flakes",                   { floor:4, ceiling:5, substances:["BHT","conventional corn"], reason:"Corn Flakes — BHT preservative + conventional corn (glyphosate concern). BHT floor fires.", confidence:"high", category:"food_beverage" }],
  ["total cereal",                  { floor:4, ceiling:5, substances:["BHT","synthetic vitamins spray","conventional wheat"], reason:"Total Cereal — BHT preservative + heavy synthetic vitamin spray coating on conventional wheat. BHT floor fires.", confidence:"high", category:"food_beverage" }],
  ["wheaties",                      { floor:4, ceiling:5, substances:["BHT","conventional wheat"], reason:"Wheaties — BHT preservative + conventional wheat. BHT floor fires. Despite wholesome marketing, preservative concern applies.", confidence:"high", category:"food_beverage" }],
  ["life cereal",                   { floor:4, ceiling:6, substances:["TBHQ","BHT","conventional oats"], reason:"Life Cereal — TBHQ + BHT preservatives + conventional oats (glyphosate concern). Two preservative floors fire.", confidence:"high", category:"food_beverage" }],
  ["grape-nuts",
  ["grape nuts",          { floor:3, ceiling:4, substances:["conventional wheat","conventional barley"], reason:"Grape-Nuts — no BHT or TBHQ, minimal ingredients, conventional grain. Relatively clean for mainstream cereal.", confidence:"high", category:"food_beverage" }],                    { floor:3, ceiling:4, substances:["conventional wheat","conventional barley"], reason:"Grape-Nuts — no BHT or TBHQ, minimal ingredients, but conventional wheat + barley (glyphosate concern on non-organic grain). Relatively clean for mainstream cereal.", confidence:"high", category:"food_beverage" }],

  // ── CEREAL: CLEAN TIER ────────────────────────────────────────
  ["uncle sam",              { floor:1, ceiling:3, substances:[], reason:"Uncle Sam — whole wheat + flaxseed, no artificial additives, no BHT/TBHQ. Simple clean ingredient list. Benchmark clean mainstream cereal.", confidence:"high", category:"food_beverage" }],
  ["barbara's puffins",             { floor:2, ceiling:4, substances:[], reason:"Barbara's Puffins — minimal ingredients, no BHT/TBHQ, no artificial colors. Cleaner than most conventional cereals.", confidence:"high", category:"food_beverage" }],
  ["three wishes",           { floor:1, ceiling:3, substances:[], reason:"Three Wishes — chickpea-based, no sugar, no grain, minimal clean ingredients. Benchmark clean cereal.", confidence:"high", category:"food_beverage" }],
  ["magic spoon cereal",            { floor:2, ceiling:4, substances:["allulose","monk fruit"], reason:"Magic Spoon — no petroleum dyes, no BHT/TBHQ. Allulose + monk fruit sweeteners (no sucralose). Cleaner than conventional but novel sweeteners have limited long-term data.", confidence:"medium", category:"food_beverage" }],
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
  ["ezekiel",                 { floor:1, ceiling:3, substances:[], reason:"Ezekiel Bread — sprouted certified organic grains + legumes, no flour, no preservatives, no added sugar. Benchmark cleanest commercial bread.", confidence:"high", category:"food_beverage" }],

  // ── EGGS ──────────────────────────────────────────────────────
  ["vital farms eggs",              { floor:1, ceiling:2, substances:[], reason:"Vital Farms — pasture-raised (108 sq ft per bird) + certified humane + Non-GMO. Benchmark clean eggs. The production standard matters for nutritional quality.", confidence:"high", category:"food_beverage" }],
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
  ["simply orange",                 { floor:3, ceiling:5, substances:["flavor packs","pasteurized"], reason:"Simply Orange (Coca-Cola) — same flavor pack process as Tropicana, pasteurized. Slightly more transparent about processing than Tropicana.", confidence:"high", category:"food_beverage" }],
  ["florida natural oj",            { floor:3, ceiling:5, substances:["pasteurized","flavor packs"], reason:"Florida Natural — pasteurized with flavor pack concern. Similar profile to Simply Orange.", confidence:"medium", category:"food_beverage" }],
  ["odwalla juice",                 { floor:4, ceiling:5, substances:["pasteurized","added sugar"], reason:"Odwalla — HPP or pasteurized, some blends have added sugars and natural flavor. Less clean than cold-pressed.", confidence:"medium", category:"food_beverage" }],
  ["suja",                    { floor:1, ceiling:3, substances:[], reason:"Suja — cold-pressed, USDA Organic, HPP preserved (not heat pasteurized). Benchmark clean juice brand.", confidence:"high", category:"food_beverage" }],

  // ── YOGURT ────────────────────────────────────────────────────
  ["yoplait original",              { floor:4, ceiling:6, substances:["HFCS","modified corn starch","artificial flavor"], reason:"Yoplait Original — HFCS + modified corn starch + artificial flavor. The classic yogurt most Americans grew up with is not a clean food.", confidence:"high", category:"food_beverage" }],
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
  ["gain laundry",                  { floor:5, ceiling:7, substances:["synthetic fragrance","1,4-dioxane","optical brighteners"], reason:"Gain — heavy synthetic fragrance + 1,4-dioxane from ethoxylated surfactants (IARC 2B) + optical brighteners. One of the most fragrance-loaded mainstream detergents.", confidence:"high", category:"home" }],
  ["persil proclean",               { floor:4, ceiling:6, substances:["synthetic fragrance","1,4-dioxane"], reason:"Persil — ethoxylated surfactants (1,4-dioxane concern) + synthetic fragrance. Similar profile to Tide.", confidence:"high", category:"home" }],
  ["tide free and gentle",          { floor:3, ceiling:5, substances:["1,4-dioxane","ethoxylated surfactants"], reason:"Tide Free and Gentle — removes fragrance and dyes but ethoxylated surfactants remain with 1,4-dioxane risk. Better than Tide Original, not a clean product.", confidence:"high", category:"home" }],
  ["all free clear",                { floor:3, ceiling:5, substances:["ethoxylated surfactants","1,4-dioxane"], reason:"All Free Clear — fragrance-free and dye-free but ethoxylated surfactants remain. Better for sensitive skin but not clean-formulated.", confidence:"high", category:"home" }],
  ["arm and hammer laundry",        { floor:3, ceiling:5, substances:["synthetic fragrance","surfactants"], reason:"Arm and Hammer laundry — baking soda base + surfactants + synthetic fragrance in most formulas. Better than Gain but not clean-label.", confidence:"high", category:"home" }],
  ["mrs. meyer's laundry",          { floor:3, ceiling:5, substances:["synthetic fragrance","methylisothiazolinone"], reason:"Mrs. Meyer's laundry — plant-derived surfactants but MIT (EU-banned in rinse-off products) + synthetic fragrance. Cleaner branding than formulation.", confidence:"high", category:"home" }],
  ["mrs meyers laundry",            { floor:3, ceiling:5, substances:["synthetic fragrance","methylisothiazolinone"], reason:"Mrs. Meyer's — MIT preservative + synthetic fragrance. Better than Gain, not a clean product.", confidence:"high", category:"home" }],
  ["method laundry",                { floor:3, ceiling:5, substances:["synthetic fragrance","ethoxylated surfactants"], reason:"Method laundry — plant-based surfactants but synthetic fragrance. Better than Tide/Gain, not as clean as Seventh Generation.", confidence:"high", category:"home" }],

  // ── LAUNDRY: CLEAN TIER ───────────────────────────────────────
  ["seventh generation laundry",    { floor:2, ceiling:3, substances:[], reason:"Seventh Generation laundry — EPA Safer Choice, plant-based, no optical brighteners, fragrance-free options. Benchmark mainstream clean laundry detergent.", confidence:"high", category:"home" }],
  ["ecos laundry",                  { floor:2, ceiling:3, substances:[], reason:"ECOS Laundry — EPA Safer Choice, plant-based, hypoallergenic, no 1,4-dioxane or optical brighteners. Clean mainstream option.", confidence:"high", category:"home" }],
  ["biokleen laundry",              { floor:2, ceiling:3, substances:[], reason:"Biokleen laundry — plant-based, no synthetic fragrance, no optical brighteners. EWG A/B rated. Clean option.", confidence:"high", category:"home" }],
  ["molly suds",                    { floor:1, ceiling:3, substances:[], reason:"Molly Suds — no 1,4-dioxane, no synthetic fragrance, EWG A rated, palm-oil free. Benchmark clean laundry brand.", confidence:"high", category:"home" }],
  ["branch basics",                 { floor:1, ceiling:2, substances:[], reason:"Branch Basics — concentrated plant-based, zero synthetic fragrance, EWG A, no 1,4-dioxane. One of the cleanest household cleaning products available. Benchmark clean across laundry, dish, and all-purpose.", confidence:"high", category:"home" }],
  ["dropps",                        { floor:1, ceiling:3, substances:[], reason:"Dropps — EWG Verified, plant-based, no 1,4-dioxane, no synthetic fragrance, plastic-free packaging. Benchmark clean laundry and dish pods.", confidence:"high", category:"home" }],
  ["tru earth",                     { floor:1, ceiling:3, substances:[], reason:"Tru Earth laundry strips — zero plastic packaging, plant-based, no parabens, no 1,4-dioxane. Benchmark clean and lowest-waste laundry format.", confidence:"high", category:"home" }],
  ["meliora",                       { floor:1, ceiling:2, substances:[], reason:"Meliora — EWG Verified, soap-based powder, no synthetic surfactants, no 1,4-dioxane. Cleanest powdered laundry option.", confidence:"high", category:"home" }],
  ["charlie soap",                  { floor:1, ceiling:2, substances:[], reason:"Charlie Soap — simple soap-based laundry powder, no synthetic surfactants or fragrance. Very clean minimal formula.", confidence:"high", category:"home" }],

  // ── DRYER SHEETS / FABRIC SOFTENER ───────────────────────────
  ["snuggle",                       { floor:5, ceiling:7, substances:["synthetic fragrance","quaternary ammonium","artificial dyes"], reason:"Snuggle — synthetic fragrance + quaternary ammonium compounds (quats, respiratory sensitizer) + artificial dyes. One of the most chemical-heavy laundry products.", confidence:"high", category:"home" }],
  ["seventh generation dryer",      { floor:2, ceiling:4, substances:[], reason:"Seventh Generation dryer sheets — plant-based, no synthetic fragrance, no quaternary ammonium. Much cleaner than Bounce/Snuggle.", confidence:"high", category:"home" }],
  ["method dryer",                  { floor:2, ceiling:4, substances:["synthetic fragrance"], reason:"Method dryer sheets — plant-based but synthetic fragrance. Better than Bounce, not as clean as Seventh Generation.", confidence:"high", category:"home" }],
  ["wool dryer balls",              { floor:1, ceiling:2, substances:[], reason:"Wool dryer balls — zero chemicals, 100% wool, reusable. Benchmark cleanest dryer alternative. Eliminates all dryer sheet chemical exposure.", confidence:"high", category:"home" }],
  ["friendsheep",                   { floor:1, ceiling:2, substances:[], reason:"Friendsheep wool dryer balls — GOTS certified organic wool, zero chemicals. Benchmark clean.", confidence:"high", category:"home" }],

  // ── DISH SOAP: CONCERN TIER ───────────────────────────────────
  ["dawn",                     { floor:4, ceiling:6, substances:["SLS","synthetic fragrance","methylisothiazolinone"], reason:"Dawn — SLS + synthetic fragrance + MIT preservative (EU-banned in rinse-off products) + artificial color. The most popular dish soap is not a clean product.", confidence:"high", category:"home" }],
  ["palmolive dish",                { floor:4, ceiling:6, substances:["SLS","synthetic fragrance","artificial color"], reason:"Palmolive — SLS + synthetic fragrance + artificial color. Standard conventional dish soap concern profile.", confidence:"high", category:"home" }],
  ["joy dish",                      { floor:4, ceiling:6, substances:["SLS","synthetic fragrance","artificial color"], reason:"Joy — SLS + synthetic fragrance + artificial color. Same conventional concern as Palmolive.", confidence:"high", category:"home" }],
  ["ajax dish",                     { floor:4, ceiling:6, substances:["SLS","synthetic fragrance"], reason:"Ajax dish soap — SLS + synthetic fragrance. Budget tier conventional concern.", confidence:"high", category:"home" }],
  ["mrs. meyer's dish",             { floor:3, ceiling:5, substances:["synthetic fragrance","MIT"], reason:"Mrs. Meyer's dish — plant-derived surfactants but MIT + synthetic fragrance components. Better than Dawn, not clean.", confidence:"high", category:"home" }],
  ["mrs meyers dish",               { floor:3, ceiling:5, substances:["synthetic fragrance","MIT"], reason:"Mrs. Meyer's dish soap — MIT + synthetic fragrance. Cleaner branding than formulation.", confidence:"high", category:"home" }],
  ["method dish",                   { floor:3, ceiling:4, substances:["synthetic fragrance"], reason:"Method dish soap — plant-based surfactants, biodegradable, but synthetic fragrance. Better than Dawn, not as clean as Seventh Generation.", confidence:"high", category:"home" }],

  // ── DISH SOAP: CLEAN TIER ─────────────────────────────────────
  ["seventh generation dish",       { floor:2, ceiling:3, substances:[], reason:"Seventh Generation dish — EPA Safer Choice, plant-based, no synthetic fragrance, no MIT. Benchmark mainstream clean dish soap.", confidence:"high", category:"home" }],
  ["honest company dish",           { floor:2, ceiling:3, substances:[], reason:"Honest Company dish — EWG certified, plant-based, no MIT. Cleaner than Dawn.", confidence:"high", category:"home" }],
  ["ecos dish",                     { floor:2, ceiling:3, substances:[], reason:"ECOS dish soap — EPA Safer Choice, plant-based, hypoallergenic, no MIT. Clean tier.", confidence:"high", category:"home" }],
  ["puracy dish",                   { floor:2, ceiling:3, substances:[], reason:"Puracy dish soap — plant-based, EWG A rated, no synthetic fragrance, no MIT.", confidence:"high", category:"home" }],
  ["biokleen dish",                 { floor:2, ceiling:3, substances:[], reason:"Biokleen dish liquid — plant-based, no synthetic fragrance, no artificial color. Clean tier.", confidence:"high", category:"home" }],
  ["better life dish",              { floor:1, ceiling:2, substances:[], reason:"Better Life dish soap — EWG A rated, no SLS, no MIT, no synthetic fragrance. Benchmark cleanest dish soap.", confidence:"high", category:"home" }],

  // ── DISHWASHER ────────────────────────────────────────────────
  ["cascade dishwasher",            { floor:4, ceiling:6, substances:["quaternary ammonium","optical brighteners","synthetic fragrance"], reason:"Cascade — quats + optical brighteners + synthetic fragrance. Residue left on dishes that contact food. Not a clean product.", confidence:"high", category:"home" }],
  ["finish",             { floor:4, ceiling:6, substances:["quaternary ammonium","optical brighteners"], reason:"Finish — quats + optical brighteners. Same concern profile as Cascade.", confidence:"high", category:"home" }],
  ["seventh generation dishwasher", { floor:2, ceiling:3, substances:[], reason:"Seventh Generation dishwasher — EPA Safer Choice, plant-based, no optical brighteners or synthetic fragrance. Benchmark clean dishwasher detergent.", confidence:"high", category:"home" }],
  ["dropps dishwasher",             { floor:1, ceiling:3, substances:[], reason:"Dropps dishwasher — EWG Verified, plant-based, no synthetic fragrance, plastic-free. Benchmark clean.", confidence:"high", category:"home" }],
  ["ecover dishwasher",             { floor:2, ceiling:3, substances:[], reason:"Ecover — plant-based, no phosphates, no synthetic fragrance. European clean standard dishwasher option.", confidence:"high", category:"home" }],

  // ── ALL PURPOSE: CONCERN TIER ─────────────────────────────────
  ["lysol all purpose",             { floor:5, ceiling:7, substances:["quaternary ammonium","synthetic fragrance","glycol ether"], reason:"Lysol APC — quats (respiratory sensitizer) + synthetic fragrance + glycol ethers. Not for food prep surfaces without rinsing.", confidence:"high", category:"home" }],
  ["lysol disinfectant spray",      { floor:6, ceiling:8, substances:["quaternary ammonium","ethanol","propellant","synthetic fragrance"], reason:"Lysol Disinfectant Spray — aerosolized quats + ethanol + synthetic fragrance propellant. High inhalation risk. Not for use around children or pets during application.", confidence:"high", category:"home" }],
  ["clorox clean-up",               { floor:5, ceiling:7, substances:["sodium hypochlorite","synthetic fragrance"], reason:"Clorox Clean-Up — bleach + synthetic fragrance. Never mix with ammonia products (chloramine gas risk). Respiratory and skin irritant.", confidence:"high", category:"home" }],
  ["clorox disinfecting wipes",     { floor:5, ceiling:7, substances:["quaternary ammonium","synthetic fragrance"], reason:"Clorox wipes — quats + synthetic fragrance. Residue remains on food-prep surfaces after use.", confidence:"high", category:"home" }],
  ["fantastik",                     { floor:5, ceiling:7, substances:["quaternary ammonium","synthetic fragrance","glycol ether"], reason:"Fantastik — quats + synthetic fragrance + glycol ethers. Standard conventional APC concern.", confidence:"high", category:"home" }],
  ["formula 409",                   { floor:5, ceiling:7, substances:["quaternary ammonium","synthetic fragrance"], reason:"Formula 409 — quats + synthetic fragrance. EPA-registered disinfectant, not a clean household cleaner.", confidence:"high", category:"home" }],
  ["microban 24",                   { floor:6, ceiling:8, substances:["benzalkonium chloride","quaternary ammonium"], reason:"Microban 24 — benzalkonium chloride designed to persist 24 hours on surfaces. Persistent quat exposure concern for daily household use around children.", confidence:"high", category:"home" }],
  ["scrubbing bubbles",             { floor:5, ceiling:7, substances:["quaternary ammonium","synthetic fragrance","sodium hypochlorite"], reason:"Scrubbing Bubbles — quats + synthetic fragrance + bleach in some formulas. Bathroom chemical exposure concern.", confidence:"high", category:"home" }],
  ["tilex mold",                    { floor:6, ceiling:8, substances:["sodium hypochlorite","chlorine gas risk"], reason:"Tilex Mold and Mildew — high bleach concentration in enclosed bathrooms = serious chlorine gas inhalation risk. Maximum ventilation required. Never mix with other cleaners.", confidence:"high", category:"home" }],

  // ── ALL PURPOSE: CLEAN TIER ───────────────────────────────────
  ["method all purpose",            { floor:3, ceiling:4, substances:["synthetic fragrance"], reason:"Method APC — plant-based surfactants, biodegradable, but synthetic fragrance. Better than Lysol, not as clean as Seventh Generation.", confidence:"high", category:"home" }],
  ["seventh generation all purpose", { floor:2, ceiling:3, substances:[], reason:"Seventh Generation APC — EPA Safer Choice, plant-based, no synthetic fragrance, no quats. Benchmark mainstream clean all-purpose cleaner.", confidence:"high", category:"home" }],
  ["better life",                   { floor:1, ceiling:2, substances:[], reason:"Better Life — EWG A rated across entire line, plant-based, no synthetic fragrance, no quats. Benchmark clean cleaning brand.", confidence:"high", category:"home" }],
  ["puracy",                        { floor:2, ceiling:3, substances:[], reason:"Puracy — plant-based, EWG A rated, no synthetic fragrance. Clean tier cleaning products.", confidence:"high", category:"home" }],
  ["grove collaborative",           { floor:2, ceiling:4, substances:[], reason:"Grove Collaborative — plant-based concentrates, EWG certified on most products. Clean tier, varies by product.", confidence:"medium", category:"home" }],
  ["thieves cleaner",               { floor:2, ceiling:4, substances:["essential oils"], reason:"Thieves Household Cleaner — plant-derived, essential oil based, no quats. Cleaner than Lysol. Young Living MLM brand.", confidence:"medium", category:"home" }],
  ["force of nature",               { floor:1, ceiling:2, substances:[], reason:"Force of Nature — electrolyzed salt water producing hypochlorous acid. EPA-registered disinfectant, zero synthetic chemicals. HOCl breaks down to salt water. Benchmark cleanest disinfectant available.", confidence:"high", category:"home" }],
  ["method bathroom",               { floor:3, ceiling:4, substances:["synthetic fragrance"], reason:"Method bathroom cleaner — plant-based surfactants but synthetic fragrance. Better than Scrubbing Bubbles, not as clean as Better Life.", confidence:"high", category:"home" }],
  ["better life bathroom",          { floor:1, ceiling:2, substances:[], reason:"Better Life bathroom cleaner — EWG A rated, no quats, no synthetic fragrance, no bleach. Benchmark clean bathroom cleaner.", confidence:"high", category:"home" }],

  // ══════════════════════════════════════════════════════════════
  // AUDIT 29 — MEN'S PERSONAL CARE
  // ══════════════════════════════════════════════════════════════

  // ── ANTIPERSPIRANT: HIGH CONCERN ─────────────────────────────
  ["old spice antiperspirant",      { floor:5, ceiling:7, substances:["aluminum zirconium","synthetic fragrance"], reason:"Old Spice antiperspirant — aluminum zirconium tetrachlorohydrex (endocrine concern, breast tissue accumulation, Alzheimer's link debated) + heavy synthetic fragrance. Antiperspirant vs deodorant is a meaningful distinction.", confidence:"high", category:"personal_care" }],
  ["degree men antiperspirant",     { floor:5, ceiling:7, substances:["aluminum zirconium","synthetic fragrance","PEG"], reason:"Degree Men antiperspirant — aluminum + synthetic fragrance + PEG compounds. Standard antiperspirant concern profile.", confidence:"high", category:"personal_care" }],
  ["degree antiperspirant",         { floor:5, ceiling:7, substances:["aluminum zirconium","synthetic fragrance"], reason:"Degree antiperspirant — aluminum + synthetic fragrance. Antiperspirant concern tier.", confidence:"high", category:"personal_care" }],
  ["dove men antiperspirant",       { floor:5, ceiling:7, substances:["aluminum zirconium","synthetic fragrance","dimethicone"], reason:"Dove Men antiperspirant — aluminum + synthetic fragrance + dimethicone. Marketed as gentle but still antiperspirant concern tier.", confidence:"high", category:"personal_care" }],
  ["secret antiperspirant",         { floor:5, ceiling:7, substances:["aluminum zirconium","synthetic fragrance","parabens"], reason:"Secret antiperspirant — aluminum + synthetic fragrance + parabens in some formulas. Standard antiperspirant concern.", confidence:"high", category:"personal_care" }],
  ["speed stick",                   { floor:4, ceiling:6, substances:["aluminum","synthetic fragrance"], reason:"Speed Stick — aluminum in antiperspirant versions + synthetic fragrance. Budget tier antiperspirant concern.", confidence:"high", category:"personal_care" }],
  ["right guard",                   { floor:4, ceiling:6, substances:["aluminum","synthetic fragrance"], reason:"Right Guard — aluminum + synthetic fragrance. Standard antiperspirant concern.", confidence:"high", category:"personal_care" }],

  // ── DEODORANT (NO ALUMINUM): MID ─────────────────────────────
  ["old spice deodorant",           { floor:4, ceiling:6, substances:["synthetic fragrance","propylene glycol","BHT"], reason:"Old Spice deodorant — no aluminum but very heavy synthetic fragrance + propylene glycol + BHT preservative. High fragrance load is the primary concern.", confidence:"high", category:"personal_care" }],
  ["native deodorant",              { floor:3, ceiling:5, substances:["baking soda","synthetic fragrance"], reason:"Native — no aluminum but baking soda can cause skin irritation for sensitive skin. Scented versions contain synthetic fragrance. Better than antiperspirant but not a clean product.", confidence:"high", category:"personal_care" }],
  ["schmidt naturals deodorant",    { floor:3, ceiling:5, substances:["baking soda","synthetic fragrance"], reason:"Schmidt's — no aluminum, baking soda base (irritation concern for some), synthetic fragrance in scented versions. Mid-tier clean deodorant.", confidence:"high", category:"personal_care" }],
  ["lume deodorant",                { floor:3, ceiling:5, substances:["synthetic fragrance","dimethicone"], reason:"Lume — no aluminum, whole body deodorant. Synthetic fragrance + dimethicone in some formulas. Better than antiperspirant, not as clean as Necessaire.", confidence:"medium", category:"personal_care" }],

  // ── DEODORANT: CLEAN TIER ─────────────────────────────────────
  ["necessaire deodorant",          { floor:1, ceiling:3, substances:[], reason:"Necessaire deodorant — EWG Verified, no aluminum, no synthetic fragrance, no baking soda irritation. Benchmark clean deodorant.", confidence:"high", category:"personal_care" }],
  ["ursa major deodorant",          { floor:1, ceiling:3, substances:[], reason:"Ursa Major deodorant — no aluminum, plant-based, EWG-friendly. Clean men's deodorant benchmark.", confidence:"high", category:"personal_care" }],
  ["each and every deodorant",      { floor:1, ceiling:3, substances:[], reason:"Each and Every — EWG Verified, no aluminum, coconut oil base, essential oil fragrance only. Clean benchmark.", confidence:"high", category:"personal_care" }],
  ["humble brands",                 { floor:2, ceiling:3, substances:[], reason:"Humble Brands deodorant — no aluminum, plant-based, baking soda-free options. Clean deodorant.", confidence:"high", category:"personal_care" }],
  ["piperwai",                      { floor:1, ceiling:3, substances:[], reason:"PiperWai — activated charcoal + magnesium, no aluminum, no baking soda irritation. EWG-friendly clean deodorant.", confidence:"high", category:"personal_care" }],
  ["magsol",              { floor:1, ceiling:2, substances:[], reason:"Magsol — magnesium hydroxide base, no aluminum, no baking soda, no synthetic fragrance. One of the cleanest deodorant formulas available.", confidence:"high", category:"personal_care" }],

  // ── SHAVING ───────────────────────────────────────────────────
  ["gillette fusion hydra",        { floor:4, ceiling:6, substances:["synthetic fragrance","triethanolamine"], reason:"Gillette Fusion Hydra Gel — TEA + synthetic fragrance + propylene glycol aerosol. Shave gel chemical concern.", confidence:"high", category:"personal_care" }],
  ["gillette",                { floor:4, ceiling:6, substances:["synthetic fragrance","triethanolamine","propylene glycol"], reason:"Gillette shave gel — synthetic fragrance + TEA (pH adjuster, nitrosamine concern) + propylene glycol + aerosol propellant. Standard conventional shave product concern.", confidence:"high", category:"personal_care" }],
  ["barbasol",                      { floor:4, ceiling:6, substances:["synthetic fragrance","triethanolamine","mineral oil"], reason:"Barbasol — mineral oil + synthetic fragrance + TEA. Classic shave cream, not a clean formula.", confidence:"high", category:"personal_care" }],
  ["edge shave",                    { floor:4, ceiling:6, substances:["synthetic fragrance","triethanolamine","isobutane"], reason:"Edge shave gel — aerosol + synthetic fragrance + TEA. Same conventional concern as Gillette/Barbasol.", confidence:"high", category:"personal_care" }],
  ["cremo shave",                   { floor:3, ceiling:5, substances:["synthetic fragrance","carbomer"], reason:"Cremo — plant-derived base but synthetic fragrance in most scents. Better than aerosol options, not a clean product.", confidence:"high", category:"personal_care" }],
  ["proraso",                       { floor:2, ceiling:3, substances:[], reason:"Proraso shave cream — eucalyptus oil + glycerin + menthol, Italian formula with minimal synthetic additives. Clean tier shave cream benchmark.", confidence:"high", category:"personal_care" }],
  ["every man jack shave",          { floor:2, ceiling:3, substances:[], reason:"Every Man Jack shave gel — plant-derived, no parabens, no synthetic fragrance in fragrance-free version. Clean shave option.", confidence:"high", category:"personal_care" }],
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
  ["head and shoulders",            { floor:4, ceiling:6, substances:["zinc pyrithione","SLES","synthetic fragrance","dimethicone"], reason:"Head and Shoulders — zinc pyrithione antifungal (safe) + SLES + heavy synthetic fragrance + dimethicone silicone buildup. Effective for dandruff but not a clean formula.", confidence:"high", category:"personal_care" }],
  ["pantene men",                   { floor:4, ceiling:6, substances:["SLES","synthetic fragrance","silicones","dimethicone"], reason:"Pantene Men — SLES + heavy silicone loading (dimethicone buildup) + synthetic fragrance. Conventional concern profile.", confidence:"high", category:"personal_care" }],
  ["suave men shampoo",             { floor:4, ceiling:6, substances:["SLES","synthetic fragrance","parabens","artificial color"], reason:"Suave Men — SLES + parabens + synthetic fragrance + artificial color. Budget tier, multiple concern ingredients.", confidence:"high", category:"personal_care" }],
  ["dove men shampoo",              { floor:4, ceiling:5, substances:["SLES","synthetic fragrance","dimethicone"], reason:"Dove Men shampoo — SLES + synthetic fragrance + dimethicone. Better than Suave but still conventional.", confidence:"high", category:"personal_care" }],
  ["nizoral",                       { floor:5, ceiling:7, substances:["ketoconazole","SLES","synthetic fragrance"], reason:"Nizoral — contains ketoconazole (antifungal medication). Effective for seborrheic dermatitis but a pharmaceutical-grade antifungal in a shampoo for daily use raises chronic exposure concern. Not for routine non-medical use.", confidence:"high", category:"personal_care" }],
  ["hims shampoo",                  { floor:3, ceiling:5, substances:["synthetic fragrance","SLES"], reason:"Hims shampoo — conventional surfactants + synthetic fragrance. DTC marketing but conventional formulation.", confidence:"medium", category:"personal_care" }],

  // ── HAIR CARE: CLEAN TIER ─────────────────────────────────────
  ["every man jack shampoo",        { floor:2, ceiling:3, substances:[], reason:"Every Man Jack shampoo — plant-derived surfactants, no parabens, no synthetic fragrance in unfragranced versions. Clean tier men's shampoo.", confidence:"high", category:"personal_care" }],
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
  ["jack black face",               { floor:2, ceiling:4, substances:[], reason:"Jack Black face wash — plant-based actives, no parabens, minimal synthetic fragrance. Clean-leaning men's face wash.", confidence:"high", category:"personal_care" }],
  ["bulldog",              { floor:2, ceiling:3, substances:[], reason:"Bulldog Skincare — EWG-friendly, no parabens, no synthetic fragrance, plant-based. Clean men's skincare brand.", confidence:"high", category:"personal_care" }],
  ["brickell men",                  { floor:1, ceiling:3, substances:[], reason:"Brickell Men's Products — natural and organic certified ingredients, no synthetic fragrance or parabens. Benchmark clean men's skincare brand.", confidence:"high", category:"personal_care" }],
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
  ["frosted flakes",                { floor:4, ceiling:6, substances:["BHT","sugar","artificial flavor"], reason:"Frosted Flakes — sugar-coated corn + BHT preservative (IARC 2B) + artificial flavor. No petroleum dyes unlike Froot Loops but still a processed sugary cereal.", confidence:"high", category:"food_beverage" }],
  ["cocoa puffs",                   { floor:4, ceiling:6, substances:["BHT","sugar","artificial flavor"], reason:"Cocoa Puffs — whole grain claim but sugar + BHT + artificial flavor. Not as bad as Froot Loops (no dyes) but still processed concern.", confidence:"high", category:"food_beverage" }],
  ["cap'n crunch",                  { floor:5, ceiling:7, substances:["Red 40","Blue 1","Yellow 5","BHT"], reason:"Cap'n Crunch Oops All Berries — multiple petroleum dyes + BHT. Original Cap'n Crunch has BHT + oat flour (glyphosate concern). Dye-containing varieties floor at 5-7.", confidence:"high", category:"food_beverage" }],
  ["cap n crunch",                  { floor:5, ceiling:7, substances:["Red 40","Blue 1","Yellow 5","BHT"], reason:"Cap'n Crunch — petroleum dyes in flavored varieties + BHT. Multiple floors fire on colored varieties.", confidence:"high", category:"food_beverage" }],
  ["cinnamon toast crunch",         { floor:4, ceiling:6, substances:["BHT","sugar","natural flavor"], reason:"Cinnamon Toast Crunch — BHT preservative + sugar as second ingredient + natural flavor (vague). Widely eaten daily by children, child vulnerability applies.", confidence:"high", category:"food_beverage" }],
  ["raisin bran",                   { floor:4, ceiling:5, substances:["BHT","sugar-coated raisins"], reason:"Raisin Bran — raisins pre-coated with sugar + BHT preservative. High sugar load despite healthy appearance. Conventional wheat glyphosate concern.", confidence:"high", category:"food_beverage" }],
  ["special k cereal",              { floor:3, ceiling:5, substances:["BHT","artificial flavor"], reason:"Special K — rice + wheat + BHT + artificial flavor. Marketed as diet food but processed grain with BHT.", confidence:"high", category:"food_beverage" }],
  ["rice krispies",                 { floor:3, ceiling:5, substances:["BHT","sugar","artificial flavor"], reason:"Rice Krispies — enriched rice + BHT + sugar + artificial flavor. Plain version is lower concern than flavored; still has BHT.", confidence:"high", category:"food_beverage" }],
  ["life cereal",                   { floor:3, ceiling:5, substances:["BHT","oat flour","conventional grain"], reason:"Life Cereal — oat flour + BHT + conventional grain (glyphosate concern). Better than Lucky Charms but still processed with BHT.", confidence:"high", category:"food_beverage" }],

  // ── CEREAL: MID / CLEANER TIER ───────────────────────────────
  ["kashi go lean",                 { floor:3, ceiling:5, substances:["conventional oats","natural flavor"], reason:"Kashi GOLEAN — soy protein + conventional oats (glyphosate concern). Some varieties contain sucralose. Natural flavor is vague. Better than Lucky Charms, not a clean product.", confidence:"medium", category:"food_beverage" }],
  ["kashi honey toasted",           { floor:2, ceiling:4, substances:["conventional oats"], reason:"Kashi Honey Toasted Oat — whole grain oats + honey, no artificial preservatives or colors. Cleaner than most cereals but conventional oats have glyphosate concern.", confidence:"high", category:"food_beverage" }],
  ["kashi",                         { floor:2, ceiling:5, substances:["conventional oats"], reason:"Kashi brand — ranges widely. Whole grain cereals with no artificial additives score 2-4; varieties with sucralose or high sugar score 4-5.", confidence:"medium", category:"food_beverage" }],
  ["nature valley granola",         { floor:3, ceiling:5, substances:["canola oil","conventional oats","sugar"], reason:"Nature Valley Granola — canola oil + conventional oats (glyphosate concern) + sugar. Widely marketed as healthy but conventional processed granola.", confidence:"high", category:"food_beverage" }],
  ["bear naked granola",            { floor:2, ceiling:4, substances:["canola oil","conventional oats"], reason:"Bear Naked Granola — no artificial preservatives or colors, but canola oil + conventional oats. Cleaner than Nature Valley.", confidence:"high", category:"food_beverage" }],
  ["magic spoon cereal",            { floor:3, ceiling:5, substances:["sucralose","monk fruit","casein protein"], reason:"Magic Spoon — monk fruit + sucralose blend in some flavors. Sucralose floor fires. No petroleum dyes, but artificial sweetener concern.", confidence:"high", category:"food_beverage" }],
  ["quaker maple brown sugar",      { floor:4, ceiling:6, substances:["artificial maple flavor","sugar","caramel color"], reason:"Quaker Maple Brown Sugar oatmeal — artificial maple flavor + caramel color + high sugar. Very different from plain Quaker oats. Flavored packet concern.", confidence:"high", category:"food_beverage" }],

  // ── CEREAL: CLEAN TIER ───────────────────────────────────────
  ["purely elizabeth granola",      { floor:1, ceiling:3, substances:[], reason:"Purely Elizabeth granola — ancient grains + coconut oil + coconut sugar, no artificial additives, USDA Organic. Benchmark clean granola.", confidence:"high", category:"food_beverage" }],
  ["purely elizabeth",              { floor:1, ceiling:3, substances:[], reason:"Purely Elizabeth brand — ancient grain + coconut sugar base, no artificial additives. Benchmark clean breakfast food.", confidence:"high", category:"food_beverage" }],
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
  ["chobani plain",                 { floor:1, ceiling:2, substances:[], reason:"Chobani Plain Greek Yogurt — milk + live cultures, nothing else. Benchmark cleanest mainstream yogurt.", confidence:"high", category:"food_beverage" }],
  ["chobani flip",                  { floor:3, ceiling:5, substances:["sugar","mix-ins"], reason:"Chobani Flip — clean base yogurt but mix-in compartments often have candy/chocolate/granola with added sugar. Better than Yoplait but not as clean as plain.", confidence:"high", category:"food_beverage" }],
  ["fage total",                    { floor:1, ceiling:2, substances:[], reason:"FAGE Total Greek Yogurt — milk + live cultures, ultra-filtered. Benchmark clean alongside Chobani plain.", confidence:"high", category:"food_beverage" }],
  ["fage",                          { floor:1, ceiling:2, substances:[], reason:"FAGE yogurt — plain version is just milk + cultures. One of the cleanest mainstream yogurts available.", confidence:"high", category:"food_beverage" }],
  ["siggi's yogurt",                { floor:1, ceiling:2, substances:[], reason:"Siggi's skyr — Icelandic-style, minimal sugar, simple ingredients. No artificial sweeteners or flavors. Benchmark clean yogurt.", confidence:"high", category:"food_beverage" }],
  ["siggi",                         { floor:1, ceiling:2, substances:[], reason:"Siggi's — skyr with minimal sugar, simple clean ingredients. Benchmark clean.", confidence:"high", category:"food_beverage" }],
  ["stonyfield organic yogurt",     { floor:1, ceiling:3, substances:[], reason:"Stonyfield Organic — USDA Organic, no artificial additives. Clean certified organic yogurt.", confidence:"high", category:"food_beverage" }],
  ["stonyfield",                    { floor:1, ceiling:3, substances:[], reason:"Stonyfield brand — USDA Organic across the line, no artificial additives. Clean organic dairy.", confidence:"high", category:"food_beverage" }],
  ["yoplait original",              { floor:4, ceiling:6, substances:["artificial flavor","HFCS","modified starch"], reason:"Yoplait Original — HFCS in older formulas, artificial flavor, modified corn starch. High sugar, not a clean yogurt.", confidence:"high", category:"food_beverage" }],
  ["yoplait go-gurt",               { floor:5, ceiling:7, substances:["artificial color","HFCS","artificial flavor"], reason:"Yoplait Go-Gurt — artificial colors + HFCS + artificial flavors in a kids tube marketed daily. Child vulnerability applies. Multiple concern ingredients.", confidence:"high", category:"food_beverage" }],
  ["yoplait gogurt",                { floor:5, ceiling:7, substances:["artificial color","HFCS","artificial flavor"], reason:"Yoplait Go-Gurt — same as Go-Gurt. Artificial colors + HFCS in kids daily product.", confidence:"high", category:"food_beverage" }],
  ["dannon light and fit",          { floor:5, ceiling:7, substances:["sucralose","aspartame","artificial flavor"], reason:"Dannon Light and Fit — sucralose + aspartame double artificial sweetener stack. Both substance floors fire. Not a clean product despite low-calorie marketing.", confidence:"high", category:"food_beverage" }],
  ["maple hill yogurt",             { floor:1, ceiling:2, substances:[], reason:"Maple Hill Creamery — 100% grass-fed organic, no artificial additives. Benchmark clean premium yogurt.", confidence:"high", category:"food_beverage" }],
  ["maple hill",                    { floor:1, ceiling:2, substances:[], reason:"Maple Hill — grass-fed organic dairy, clean. Benchmark clean.", confidence:"high", category:"food_beverage" }],
  ["nancy's yogurt",                { floor:1, ceiling:2, substances:[], reason:"Nancy's — USDA Organic, probiotic-rich, simple clean ingredients. Benchmark clean yogurt brand.", confidence:"high", category:"food_beverage" }],
  ["oui by yoplait",                { floor:2, ceiling:3, substances:[], reason:"Oui by Yoplait — glass pot, whole milk yogurt, simple ingredients. Much cleaner than regular Yoplait despite same parent brand.", confidence:"high", category:"food_beverage" }],

  // ── EGGS ──────────────────────────────────────────────────────
  ["vital farms eggs",              { floor:1, ceiling:2, substances:[], reason:"Vital Farms — pasture-raised, USDA Organic, hens on 108 sq ft per bird. Benchmark cleanest commercially available eggs.", confidence:"high", category:"food_beverage" }],
  ["vital farms",                   { floor:1, ceiling:2, substances:[], reason:"Vital Farms — pasture-raised organic across all egg products. Benchmark clean.", confidence:"high", category:"food_beverage" }],
  ["pete and gerry's",              { floor:1, ceiling:3, substances:[], reason:"Pete and Gerry's — USDA Organic, Certified Humane, no antibiotics. Clean premium eggs.", confidence:"high", category:"food_beverage" }],
  ["pete and gerrys",               { floor:1, ceiling:3, substances:[], reason:"Pete and Gerry's — USDA Organic, Certified Humane. Clean tier eggs.", confidence:"high", category:"food_beverage" }],
  ["happy egg",                     { floor:2, ceiling:3, substances:[], reason:"The Happy Egg Co — free range, at least 8 sq ft outdoor access. Not organic but free range with space standards.", confidence:"high", category:"food_beverage" }],
  ["nellie's eggs",                 { floor:1, ceiling:3, substances:[], reason:"Nellie's Free Range Eggs — Certified Humane, free range. Some organic varieties. Clean tier eggs.", confidence:"high", category:"food_beverage" }],
  ["eggland's best",                { floor:2, ceiling:4, substances:["conventional feed"], reason:"Eggland's Best — vitamin-enriched feed eggs, not organic, conventional cage-free. Better than standard CAFO eggs but not pasture-raised or organic.", confidence:"medium", category:"food_beverage" }],
  ["conventional eggs",             { floor:3, ceiling:5, substances:["CAFO","conventional feed","antibiotics"], reason:"Conventional store-brand eggs — standard CAFO production, no labeling standards for feed or conditions. No antibiotic-free guarantee.", confidence:"high", category:"food_beverage" }],

  // ── OJ / JUICE ────────────────────────────────────────────────
  ["florida's natural",             { floor:3, ceiling:4, substances:["flavor pack"], reason:"Florida's Natural OJ — not from concentrate, but uses manufacturer-approved flavor packs to standardize taste (deaerated, then re-flavored). Marketed as pure but processed.", confidence:"high", category:"food_beverage" }],
  ["florida natural oj",            { floor:3, ceiling:4, substances:["flavor pack"], reason:"Florida's Natural — flavor packs used in processing despite 'not from concentrate' label. Misleading pure marketing.", confidence:"high", category:"food_beverage" }],
  ["minute maid oj",                { floor:3, ceiling:5, substances:["from concentrate","flavor pack"], reason:"Minute Maid OJ — from concentrate with flavor packs in most varieties. More processed than marketed.", confidence:"high", category:"food_beverage" }],
  ["minute maid",                   { floor:3, ceiling:5, substances:["HFCS","artificial flavor"], reason:"Minute Maid brand — OJ varieties use concentrate + flavor packs; lemonade and other varieties often have HFCS + artificial flavor.", confidence:"medium", category:"food_beverage" }],
  ["welch's",           { floor:5, ceiling:7, substances:["HFCS","sugar","Red 40"], reason:"Welch's brand — HFCS across juice + petroleum dyes in fruit snacks. Floor 5 across the brand.", confidence:"medium", category:"food_beverage" }],
  ["welch",                 { floor:5, ceiling:7, substances:["HFCS","added sugar","Red 40"], reason:"Welch brand — HFCS + petroleum dyes in fruit snacks. Floor 5 across the brand.", confidence:"medium", category:"food_beverage" }],
  ["naked juice",                   { floor:3, ceiling:5, substances:["high sugar","natural flavor"], reason:"Naked Juice — cold-pressed but very high sugar from fruit concentration + natural flavor. PepsiCo-owned. Healthier than soda but not a clean product by Partiqule standards.", confidence:"high", category:"food_beverage" }],
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
  ["pringles original",             { floor:4, ceiling:6, substances:["TBHQ","dehydrated potato","soy protein"], reason:"Pringles — TBHQ preservative + dehydrated processed potato paste (not real potato slices) + soy protein isolate. Significantly more processed than traditional chips.", confidence:"high", category:"food_beverage" }],
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
  ["xochitl",                       { floor:1, ceiling:3, substances:[], reason:"Xochitl — stone-ground organic corn + oil + salt. Traditional tortilla chip process, no artificial additives. Clean benchmark.", confidence:"high", category:"food_beverage" }],
  ["food should taste good",        { floor:1, ceiling:3, substances:[], reason:"Food Should Taste Good — non-GMO, no artificial additives, whole grain options. Clean chip brand.", confidence:"high", category:"food_beverage" }],
  ["santitas",                      { floor:2, ceiling:4, substances:["corn","sunflower oil"], reason:"Santitas — corn + sunflower oil + salt. Minimal ingredients, no artificial additives. Affordable clean chip option.", confidence:"high", category:"food_beverage" }],

  // ── CRACKERS: CONCERN TIER ────────────────────────────────────
  ["ritz crackers",                 { floor:5, ceiling:7, substances:["partially hydrogenated oil","HFCS","BHT"], reason:"Ritz Crackers — partially hydrogenated oil (trans fat, floor fires) + HFCS + BHT. One of the most widely eaten crackers with a serious concern profile.", confidence:"high", category:"food_beverage" }],
  ["club crackers",                 { floor:5, ceiling:7, substances:["partially hydrogenated oil","HFCS","artificial flavor"], reason:"Club Crackers — partially hydrogenated oil (trans fat floor fires) + HFCS + artificial flavor. Same concern as Ritz.", confidence:"high", category:"food_beverage" }],
  ["wheat thins",                   { floor:4, ceiling:6, substances:["TBHQ","BHT","soy"], reason:"Wheat Thins — TBHQ + BHT preservatives (both floors fire) + soy lecithin. Whole grain but multiple preservative concerns.", confidence:"high", category:"food_beverage" }],
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
  ["smartfood popcorn",             { floor:3, ceiling:5, substances:["cheddar","sunflower oil","natural flavor"], reason:"Smartfood Popcorn — popcorn + real cheddar + sunflower oil + natural flavor (vague). Better than Cheetos but natural flavor is undisclosed.", confidence:"high", category:"food_beverage" }],
  ["smartfood",                     { floor:3, ceiling:5, substances:["sunflower oil","natural flavor"], reason:"Smartfood brand — no artificial colors or flavors claimed, but natural flavor is vague. Mid-tier clean snack.", confidence:"high", category:"food_beverage" }],

  // ── MICROWAVE POPCORN: CONCERN ────────────────────────────────
  ["orville redenbacher",           { floor:4, ceiling:7, substances:["PFAS-lined bag","artificial butter flavor","TBHQ"], reason:"Orville Redenbacher microwave popcorn — PFAS-lined microwave bags (per- and polyfluoroalkyl substances) + artificial butter flavor + TBHQ in some varieties. The bag is the concern, not just the popcorn.", confidence:"high", category:"food_beverage" }],
  ["act ii popcorn",                { floor:5, ceiling:7, substances:["PFAS-lined bag","artificial butter flavor","partially hydrogenated"], reason:"Act II microwave popcorn — PFAS-lined bags + artificial butter flavor + partially hydrogenated oil in some formulas. Trans fat floor may fire.", confidence:"high", category:"food_beverage" }],
  ["act ii",                        { floor:5, ceiling:7, substances:["PFAS-lined bag","artificial butter flavor"], reason:"Act II — PFAS microwave bag + artificial butter flavor. One of the higher-concern microwave popcorn brands.", confidence:"high", category:"food_beverage" }],

  // ── POPCORN: CLEAN TIER ───────────────────────────────────────
  ["skinny pop",                    { floor:1, ceiling:3, substances:[], reason:"SkinnyPop — popcorn + sunflower oil + salt. Three ingredients, no PFAS bag, no artificial additives. Benchmark clean pre-popped popcorn.", confidence:"high", category:"food_beverage" }],
  ["boom chicka pop",               { floor:1, ceiling:3, substances:[], reason:"Boom Chicka Pop — non-GMO popcorn + sunflower oil + sea salt. No artificial additives. Benchmark clean pre-popped popcorn alongside SkinnyPop.", confidence:"high", category:"food_beverage" }],

  // ── NUTS ─────────────────────────────────────────────────────
  ["planters dry roasted peanuts",  { floor:3, ceiling:5, substances:["BHT","modified corn starch","maltodextrin"], reason:"Planters Dry Roasted Peanuts — BHT preservative (IARC 2B) + modified corn starch filler + maltodextrin. Better than mixed nuts can but more additives than plain peanuts.", confidence:"high", category:"food_beverage" }],
  ["planters",                      { floor:3, ceiling:5, substances:["BHT","modified starch"], reason:"Planters brand — BHT preservative across many products + modified starches. Better than chips but not a clean nut product.", confidence:"medium", category:"food_beverage" }],
  ["blue diamond",          { floor:1, ceiling:3, substances:[], reason:"Blue Diamond Almonds — almonds + salt in original. No artificial additives in plain varieties. Benchmark clean nut snack. Flavored varieties may have natural flavor concern.", confidence:"high", category:"food_beverage" }],
  ["kirkland",                      { floor:1, ceiling:3, substances:[], reason:"Kirkland Signature plain nuts — nuts + salt, no BHT, no artificial additives. Cleaner than Planters equivalent.", confidence:"medium", category:"food_beverage" }],
  ["kirkland mixed",           { floor:1, ceiling:3, substances:[], reason:"Kirkland Mixed Nuts — nuts + salt, no BHT, no artificial additives. Costco nut can is cleaner than Planters equivalent.", confidence:"high", category:"food_beverage" }],
  ["sahale snacks",                 { floor:1, ceiling:3, substances:[], reason:"Sahale Snacks — premium nuts + real fruit + spices, no artificial additives. Clean premium nut snack.", confidence:"high", category:"food_beverage" }],

  // ── JERKY AND MEAT SNACKS ────────────────────────────────────
  ["slim jim",                      { floor:7, ceiling:9, substances:["sodium nitrite","Red 40","mechanically separated chicken","TBHQ"], reason:"Slim Jim — mechanically separated chicken + pork + beef + sodium nitrite (IARC Group 1) + Red 40 petroleum dye + TBHQ. Multiple critical floors fire simultaneously. One of the most additive-loaded snacks available.", confidence:"high", category:"food_beverage" }],
  ["old wisconsin",                 { floor:6, ceiling:8, substances:["sodium nitrite","artificial flavor"], reason:"Old Wisconsin beef sticks — sodium nitrite preservative (IARC Group 1 carcinogen) + artificial flavor. Nitrite floor fires.", confidence:"high", category:"food_beverage" }],
  ["country archer",                { floor:1, ceiling:3, substances:[], reason:"Country Archer — no sodium nitrite, no artificial additives, grass-fed options. Benchmark clean jerky brand alongside Chomps.", confidence:"high", category:"food_beverage" }],
  ["krave jerky",                   { floor:3, ceiling:5, substances:["soy sauce","sugar"], reason:"Krave Jerky — no nitrites, but some flavors have HFCS + soy sauce concerns. Cleaner than Jack Links but not as clean as Chomps/Country Archer.", confidence:"medium", category:"food_beverage" }],
  ["lorissa's kitchen",             { floor:3, ceiling:5, substances:["soy sauce","sugar"], reason:"Lorissa's Kitchen — no nitrites, but some varieties use soy + sugar. Better than conventional jerky, not as clean as Chomps.", confidence:"medium", category:"food_beverage" }],

  // ── COOKIES ───────────────────────────────────────────────────
  ["oreo",                          { floor:5, ceiling:7, substances:["HFCS","vanillin","palm oil"], reason:"Oreos — HFCS + vanillin (artificial vanilla) + palm oil. High sugar, artificial flavor, deforestation-linked palm oil. Standard cookie concern profile.", confidence:"high", category:"food_beverage" }],
  ["chips ahoy",                    { floor:5, ceiling:7, substances:["HFCS","TBHQ","artificial flavor"], reason:"Chips Ahoy — HFCS + TBHQ preservative (floor fires) + artificial flavor. Common children's snack with multiple concern ingredients.", confidence:"high", category:"food_beverage" }],
  ["nutter butter",                 { floor:5, ceiling:7, substances:["HFCS","TBHQ","artificial flavor"], reason:"Nutter Butter — HFCS + TBHQ + artificial flavor. Same concern profile as Chips Ahoy.", confidence:"high", category:"food_beverage" }],
  ["nilla wafers",                  { floor:4, ceiling:6, substances:["HFCS","artificial flavor"], reason:"Nilla Wafers — HFCS + artificial vanilla flavor. Lower concern than Chips Ahoy (no TBHQ) but still HFCS-based.", confidence:"high", category:"food_beverage" }],
  ["fig newtons",                   { floor:4, ceiling:6, substances:["HFCS","artificial flavor","enriched flour"], reason:"Fig Newtons — HFCS + artificial flavor + enriched flour. Marketed as a healthier cookie but HFCS concern is real.", confidence:"high", category:"food_beverage" }],

  // ── CLEAN SWEET SNACKS ────────────────────────────────────────
  ["medjool dates",                 { floor:1, ceiling:2, substances:[], reason:"Medjool dates — whole fruit, one ingredient. Natural sugar but benchmark clean whole food snack. No processing, no additives.", confidence:"high", category:"food_beverage" }],
  ["dates",                         { floor:1, ceiling:2, substances:[], reason:"Dates — whole fruit, naturally sweet, no additives. Benchmark clean single-ingredient snack.", confidence:"high", category:"food_beverage" }],
  ["lily's chocolate",              { floor:2, ceiling:4, substances:["erythritol","stevia"], reason:"Lily's — erythritol + stevia sweetened, no sucralose, no artificial colors. Cleaner than Hershey's but fermented sugar alcohol GI concern at high intake.", confidence:"high", category:"food_beverage" }],
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
  ["athletic brewing",              { floor:1, ceiling:3, substances:[], reason:"Athletic Brewing — non-alcoholic craft beer, clean brewing process, no artificial additives. Benchmark clean non-alcoholic beer.", confidence:"high", category:"beverage" }],

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
  ["makers mark",                   { floor:2, ceiling:3, substances:[], reason:"Maker's Mark — wheat-forward bourbon, no artificial additives. Clean bourbon benchmark.", confidence:"high", category:"beverage" }],
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
  ["sunny d",                       { floor:5, ceiling:7, substances:["HFCS","artificial color","artificial flavor"], reason:"Sunny D — mostly water + HFCS + artificial flavor + artificial color. Less than 2% actual juice. Not juice.", confidence:"high", category:"beverage" }],
  ["hi-c",                          { floor:5, ceiling:7, substances:["HFCS","artificial color","artificial flavor"], reason:"Hi-C — HFCS + artificial color + artificial flavor marketed to children. Not juice.", confidence:"high", category:"beverage" }],
  ["kool-aid jammers",              { floor:5, ceiling:7, substances:["HFCS","artificial color","artificial flavor"], reason:"Kool-Aid Jammers — HFCS + artificial color + artificial flavor in child-targeted pouch.", confidence:"high", category:"beverage" }],
  ["kool aid jammers",              { floor:5, ceiling:7, substances:["HFCS","artificial color"], reason:"Kool-Aid Jammers — HFCS + dyes. Not juice.", confidence:"high", category:"beverage" }],
  ["hawaiian punch",                { floor:5, ceiling:7, substances:["HFCS","Red 40","artificial flavor"], reason:"Hawaiian Punch — HFCS + Red 40 petroleum dye + artificial flavor. Very little actual juice.", confidence:"high", category:"beverage" }],
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
  ["pressed juicery",               { floor:1, ceiling:2, substances:[], reason:"Pressed Juicery — cold-pressed HPP, no preservatives, no concentrate, refrigerated. Benchmark clean juice.", confidence:"high", category:"beverage" }],
  ["suja",                          { floor:1, ceiling:3, substances:[], reason:"Suja — USDA Organic cold-pressed HPP, no preservatives, no concentrate. Benchmark clean juice.", confidence:"high", category:"beverage" }],

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
  ["welch's fruit snacks",          { floor:5, ceiling:7, substances:["Red 40","Yellow 5","HFCS"], reason:"Welch's Fruit Snacks — Red 40 + Yellow 5 petroleum dyes + HFCS. Marketed as real fruit but petroleum dye floors fire. Child daily snack concern.", confidence:"high", category:"food_beverage" }],
  ["welch fruit",            { floor:5, ceiling:7, substances:["Red 40","Yellow 5","HFCS"], reason:"Welch's Fruit Snacks — petroleum dyes + HFCS. Dye floors fire.", confidence:"high", category:"food_beverage" }],
  ["mott's fruit snacks",           { floor:5, ceiling:7, substances:["Red 40","Yellow 5","HFCS","modified starch"], reason:"Mott's Fruit Snacks — Red 40 + Yellow 5 petroleum dyes + HFCS. Same concern as Welch's. Dye floors fire.", confidence:"high", category:"food_beverage" }],
  ["motts fruit snacks",            { floor:5, ceiling:7, substances:["Red 40","Yellow 5","HFCS"], reason:"Mott's Fruit Snacks — petroleum dyes + HFCS. Dye floors fire on child daily snack.", confidence:"high", category:"food_beverage" }],

  // ── FRUIT SNACKS: CLEAN TIER ──────────────────────────────────
  ["annie's fruit snacks",          { floor:2, ceiling:4, substances:[], reason:"Annie's Organic Fruit Snacks — USDA Organic, fruit juice colored, no petroleum dyes, no artificial flavor. Benchmark clean fruit snack.", confidence:"high", category:"food_beverage" }],
  ["yumearth fruit snacks",         { floor:1, ceiling:3, substances:[], reason:"YumEarth Organic Fruit Snacks — USDA Organic, fruit juice sweetened, no artificial dyes or flavors. Benchmark cleanest mainstream fruit snack.", confidence:"high", category:"food_beverage" }],
  ["yumearth",                      { floor:1, ceiling:3, substances:[], reason:"YumEarth brand — USDA Organic across entire line, no petroleum dyes, no artificial flavors. Benchmark clean kids candy brand.", confidence:"high", category:"food_beverage" }],
  ["stretch island",                { floor:1, ceiling:3, substances:[], reason:"Stretch Island Fruit Strips — real fruit puree, no artificial dyes or flavors, no HFCS. Clean fruit snack.", confidence:"high", category:"food_beverage" }],
  ["surf sweets",                   { floor:1, ceiling:3, substances:[], reason:"Surf Sweets — organic, fruit juice colored, no artificial dyes or flavors. Benchmark clean gummy candy for kids.", confidence:"high", category:"food_beverage" }],

  // ── GUMMY CANDY ───────────────────────────────────────────────
  ["starburst",                     { floor:6, ceiling:8, substances:["Red 40","Yellow 5","Yellow 6","Blue 1","artificial flavor"], reason:"Starbursts — Red 40 + Yellow 5 + Yellow 6 + Blue 1 all in one product. Four petroleum dye floors fire simultaneously. One of the highest dye loads of any kids candy. Child vulnerability critical.", confidence:"high", category:"food_beverage" }],
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

  // ── KIDS YOGURT TUBES ────────────────────────────────────────
  ["danimals",                      { floor:5, ceiling:7, substances:["Red 40","artificial flavor","HFCS"], reason:"Danimals Smoothie — Red 40 petroleum dye + HFCS + artificial flavor in a daily kids yogurt. Child vulnerability applies. Dye floor fires.", confidence:"high", category:"food_beverage" }],
  ["stonyfield yokids",             { floor:1, ceiling:3, substances:[], reason:"Stonyfield YoKids — USDA Organic, no artificial dyes or flavors. Benchmark clean kids yogurt.", confidence:"high", category:"food_beverage" }],
  ["stonyfield yo kids",            { floor:1, ceiling:3, substances:[], reason:"Stonyfield YoKids — USDA Organic, clean. Benchmark clean kids yogurt.", confidence:"high", category:"food_beverage" }],
  ["siggi kids",                    { floor:1, ceiling:2, substances:[], reason:"Siggi's Kids — Icelandic skyr style, minimal ingredients, no artificial dyes or flavors, low sugar. Benchmark cleanest kids yogurt.", confidence:"high", category:"food_beverage" }],
  ["plum organics kids",            { floor:2, ceiling:4, substances:["plastic pouch"], reason:"Plum Organics kids pouches — USDA Organic ingredients but plastic pouch at room temperature. Same packaging concern as baby food pouches.", confidence:"high", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // AUDIT 34 — BREAD AND BAKED GOODS
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
  ["dave's killer bread",           { floor:2, ceiling:4, substances:["calcium propionate"], reason:"Dave's Killer Bread — organic whole grain, no ADA, but calcium propionate preservative present in most varieties. Best mainstream sandwich bread available. No EU-banned additives.", confidence:"high", category:"food_beverage" }],
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
  ["siete",                         { floor:1, ceiling:3, substances:[], reason:"Siete Foods — grain-free, no artificial additives across the line. Benchmark clean tortilla and chip brand.", confidence:"high", category:"food_beverage" }],

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
  ["canyon bakehouse",              { floor:2, ceiling:4, substances:[], reason:"Canyon Bakehouse — rice flour + tapioca starch base, no ADA, no artificial preservatives in most varieties. Benchmark clean gluten-free bread.", confidence:"high", category:"food_beverage" }],
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
  ["nature's own",                  { floor:4, ceiling:6, substances:["azodicarbonamide","calcium propionate","HFCS"], reason:"Nature's Own — azodicarbonamide (EU-banned dough conditioner) + calcium propionate antimold + HFCS. Honey wheat marketing obscures a conventional additive-heavy bread.", confidence:"high", category:"food_beverage" }],
  ["natures own",                   { floor:4, ceiling:6, substances:["azodicarbonamide","calcium propionate","HFCS"], reason:"Nature's Own — ADA + calcium propionate + HFCS. Standard commercial bread concern.", confidence:"high", category:"food_beverage" }],
  ["sara lee bread",                { floor:4, ceiling:6, substances:["azodicarbonamide","calcium propionate","HFCS"], reason:"Sara Lee — azodicarbonamide + calcium propionate + HFCS. Same concern profile as Wonder and Nature's Own.", confidence:"high", category:"food_beverage" }],
  ["arnold bread",                  { floor:4, ceiling:5, substances:["calcium propionate","HFCS","azodicarbonamide"], reason:"Arnold — calcium propionate + HFCS + ADA in most varieties. Slightly cleaner than Wonder but still conventional concern.", confidence:"high", category:"food_beverage" }],
  ["king's hawaiian",               { floor:4, ceiling:6, substances:["azodicarbonamide","HFCS","soybean oil","calcium propionate"], reason:"King's Hawaiian — ADA + HFCS + soybean oil + calcium propionate. The beloved sweet roll is a processed product with multiple concern ingredients.", confidence:"high", category:"food_beverage" }],
  ["king hawaiian",                 { floor:4, ceiling:6, substances:["azodicarbonamide","HFCS","calcium propionate"], reason:"King's Hawaiian rolls — ADA + HFCS + calcium propionate. Multiple concern ingredients.", confidence:"high", category:"food_beverage" }],
  ["martin's potato rolls",         { floor:4, ceiling:5, substances:["azodicarbonamide","HFCS","calcium propionate"], reason:"Martin's Potato Rolls — ADA + HFCS + calcium propionate. Classic American bun with conventional additive profile.", confidence:"high", category:"food_beverage" }],
  ["martins potato",                { floor:4, ceiling:5, substances:["azodicarbonamide","HFCS","calcium propionate"], reason:"Martin's Potato Rolls — ADA + HFCS + calcium propionate.", confidence:"high", category:"food_beverage" }],
  ["mission flour",                 { floor:4, ceiling:6, substances:["azodicarbonamide","calcium propionate","DATEM","enriched flour"], reason:"Mission Flour Tortillas — ADA + calcium propionate + DATEM dough conditioner + enriched flour. One of the most additive-loaded tortilla brands. Would be banned as-is in the EU.", confidence:"high", category:"food_beverage" }],
  ["guerrero tortillas",            { floor:4, ceiling:6, substances:["azodicarbonamide","calcium propionate","enriched flour"], reason:"Guerrero flour tortillas — ADA + calcium propionate + enriched flour. Same conventional concern as Mission.", confidence:"high", category:"food_beverage" }],
  ["old el paso tortillas",         { floor:4, ceiling:5, substances:["azodicarbonamide","enriched flour","calcium propionate"], reason:"Old El Paso flour tortillas — ADA + enriched flour + calcium propionate.", confidence:"high", category:"food_beverage" }],
  ["einstein bagels",               { floor:4, ceiling:5, substances:["azodicarbonamide","enriched flour","calcium propionate"], reason:"Einstein Bagels — ADA + enriched flour + calcium propionate. Commercial bagel chain with conventional additives.", confidence:"high", category:"food_beverage" }],
  ["wonder hamburger buns",         { floor:4, ceiling:6, substances:["azodicarbonamide","HFCS","calcium propionate"], reason:"Wonder Hamburger Buns — same ADA + HFCS + calcium propionate as Wonder Bread. Same formulation, different shape.", confidence:"high", category:"food_beverage" }],

  // ── PASTRIES: HIGH CONCERN ────────────────────────────────────
  ["pop-tarts",                     { floor:6, ceiling:8, substances:["HFCS","TBHQ","Red 40","artificial flavor","enriched flour"], reason:"Pop-Tarts — HFCS + TBHQ (floor fires) + Red 40 petroleum dye + artificial flavor. Common children's breakfast with multiple simultaneous floors firing.", confidence:"high", category:"food_beverage" }],
  ["pop tarts",                     { floor:6, ceiling:8, substances:["HFCS","TBHQ","Red 40","artificial flavor"], reason:"Pop Tarts — TBHQ + Red 40 + HFCS. Multiple floors fire.", confidence:"high", category:"food_beverage" }],
  ["pillsbury crescent",            { floor:4, ceiling:6, substances:["partially hydrogenated oil","DATEM","azodicarbonamide"], reason:"Pillsbury Crescent Rolls — partially hydrogenated oil (trans fat floor may fire) + DATEM + ADA.", confidence:"high", category:"food_beverage" }],
  ["pillsbury cinnamon rolls",      { floor:5, ceiling:7, substances:["HFCS","partially hydrogenated oil","artificial flavor","DATEM"], reason:"Pillsbury Cinnamon Rolls — HFCS + partially hydrogenated oil + artificial flavor. Frosting packet adds more HFCS + artificial color.", confidence:"high", category:"food_beverage" }],
  ["otis spunkmeyer",               { floor:5, ceiling:7, substances:["HFCS","artificial flavor","artificial color","enriched flour"], reason:"Otis Spunkmeyer — HFCS + artificial flavor + artificial color + enriched flour. Commercial bakery muffin with full conventional additive profile.", confidence:"high", category:"food_beverage" }],
  ["entenmann's",                   { floor:5, ceiling:7, substances:["HFCS","partially hydrogenated oil","artificial color","artificial flavor"], reason:"Entenmann's — HFCS + partially hydrogenated oil + artificial color. Classic American bakery with high concern profile.", confidence:"high", category:"food_beverage" }],
  ["entenmanns",                    { floor:5, ceiling:7, substances:["HFCS","partially hydrogenated oil","artificial color"], reason:"Entenmann's — HFCS + partially hydrogenated oil + artificial color.", confidence:"high", category:"food_beverage" }],

  // ── BREAD: CLEAN TIER ─────────────────────────────────────────
  ["dave's killer bread",           { floor:2, ceiling:4, substances:[], reason:"Dave's Killer Bread — USDA Organic, no ADA, no HFCS, no calcium propionate. Benchmark clean mainstream sandwich bread.", confidence:"high", category:"food_beverage" }],
  ["daves killer bread",            { floor:2, ceiling:4, substances:[], reason:"Dave's Killer Bread — organic, no ADA or calcium propionate. Benchmark clean.", confidence:"high", category:"food_beverage" }],
  ["dave's killer",                 { floor:2, ceiling:4, substances:[], reason:"Dave's Killer — organic whole grain, no conventional dough additives. Clean bread and bagel brand.", confidence:"high", category:"food_beverage" }],
  ["ezekiel bread",                 { floor:1, ceiling:2, substances:[], reason:"Ezekiel 4:9 — sprouted whole grain, flourless, no preservatives, no ADA, USDA Organic. Benchmark cleanest commercially available bread.", confidence:"high", category:"food_beverage" }],
  ["ezekiel 4",                     { floor:1, ceiling:2, substances:[], reason:"Ezekiel 4:9 sprouted bread — flourless, no additives. Cleanest benchmark.", confidence:"high", category:"food_beverage" }],
  ["alvarado street",               { floor:1, ceiling:3, substances:[], reason:"Alvarado Street Bakery — sprouted whole grain, no ADA, USDA Organic. Benchmark clean bread.", confidence:"high", category:"food_beverage" }],
  ["silver hills",                  { floor:1, ceiling:3, substances:[], reason:"Silver Hills — sprouted grain, no ADA, no HFCS, no preservatives. Benchmark clean sprouted bread.", confidence:"high", category:"food_beverage" }],
  ["vermont bread",                 { floor:1, ceiling:3, substances:[], reason:"Vermont Bread Company — USDA Organic, no ADA, no HFCS. Clean organic bread.", confidence:"high", category:"food_beverage" }],
  ["franz organic",                 { floor:2, ceiling:4, substances:[], reason:"Franz Organic — USDA Organic, no artificial additives. Cleaner than conventional Franz varieties.", confidence:"high", category:"food_beverage" }],

  // ── TORTILLAS: CLEAN TIER ─────────────────────────────────────
  ["siete",                         { floor:1, ceiling:3, substances:[], reason:"Siete Foods — grain-free (almond, cassava flour), no ADA, no calcium propionate. Benchmark clean tortilla and chip brand.", confidence:"high", category:"food_beverage" }],
  ["la tortilla factory",           { floor:3, ceiling:5, substances:["enriched flour","calcium propionate"], reason:"La Tortilla Factory — enriched flour + calcium propionate in most varieties. Cleaner than Mission but still processed.", confidence:"medium", category:"food_beverage" }],
  ["maria and ricardos",            { floor:3, ceiling:4, substances:["enriched flour"], reason:"Maria and Ricardo's — enriched flour, simpler formula than Mission. No ADA in most varieties.", confidence:"medium", category:"food_beverage" }],

  // ── GLUTEN FREE ───────────────────────────────────────────────
  ["canyon bakehouse",              { floor:3, ceiling:5, substances:["tapioca starch","xanthan gum","modified starch"], reason:"Canyon Bakehouse — rice flour + tapioca starch + xanthan gum. No ADA (inherently GF) but more processed than sprouted bread.", confidence:"high", category:"food_beverage" }],
  ["schar bread",                   { floor:3, ceiling:5, substances:["modified tapioca starch","xanthan gum"], reason:"Schar GF — modified starches + xanthan gum for GF texture. No ADA but highly processed GF formulation.", confidence:"high", category:"food_beverage" }],

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
  // FOUNDATION CLEAN
  ["ilia beauty",                   { floor:1, ceiling:3, substances:[], reason:"ILIA Beauty — EWG Verified, no synthetic fragrance, no parabens, no talc. Benchmark clean makeup brand.", confidence:"high", category:"personal_care" }],
  ["ilia",                          { floor:1, ceiling:3, substances:[], reason:"ILIA — EWG Verified clean cosmetics. Benchmark across foundation, mascara, and lip products.", confidence:"high", category:"personal_care" }],
  ["rms beauty",                    { floor:1, ceiling:3, substances:[], reason:"RMS Beauty — certified organic, no synthetic fragrance, no parabens. Benchmark clean luxury makeup.", confidence:"high", category:"personal_care" }],
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
  ["versed skincare",               { floor:1, ceiling:3, substances:[], reason:"Versed — EWG Verified, no synthetic fragrance or parabens. Benchmark clean accessible skincare.", confidence:"high", category:"personal_care" }],
  ["cocokind",                      { floor:1, ceiling:3, substances:[], reason:"Cocokind — organic ingredients, no synthetic fragrance or parabens. Benchmark clean skincare.", confidence:"high", category:"personal_care" }],
  // SUNSCREEN CONCERN
  ["supergoop",                     { floor:5, ceiling:7, substances:["homosalate","octisalate","octinoxate"], reason:"Supergoop Unseen — chemical UV filters (homosalate, octisalate, octinoxate). Homosalate is EU-restricted endocrine disruptor.", confidence:"high", category:"personal_care" }],
  ["sun bum",             { floor:5, ceiling:7, substances:["avobenzone","homosalate","octisalate"], reason:"Sun Bum — avobenzone + homosalate + octisalate chemical UV filters. Endocrine concern.", confidence:"high", category:"personal_care" }],
  ["la roche posay sunscreen",      { floor:4, ceiling:6, substances:["avobenzone","homosalate"], reason:"La Roche-Posay — chemical UV filters in most formulas. Their Mineral line is cleaner.", confidence:"medium", category:"personal_care" }],
  // SUNSCREEN CLEAN
  ["blue lizard",                   { floor:1, ceiling:3, substances:[], reason:"Blue Lizard — zinc oxide or titanium dioxide mineral UV filters, no chemical UV filters. Benchmark clean sunscreen.", confidence:"high", category:"personal_care" }],
  ["badger",              { floor:1, ceiling:2, substances:[], reason:"Badger Balm — zinc oxide only, organic ingredients, no chemical UV filters. Benchmark cleanest sunscreen.", confidence:"high", category:"personal_care" }],
  // HAIRCARE CONCERN
  ["herbal essences",               { floor:4, ceiling:6, substances:["SLES","synthetic fragrance","dimethicone","parabens"], reason:"Herbal Essences — SLES + heavy synthetic fragrance + dimethicone + parabens. 'Natural' branding doesn't match formula.", confidence:"high", category:"personal_care" }],
  ["loreal elvive",                 { floor:4, ceiling:5, substances:["SLES","synthetic fragrance","dimethicone"], reason:"L'Oréal Elvive — SLES + synthetic fragrance + dimethicone. Standard drugstore haircare concern.", confidence:"high", category:"personal_care" }],
  ["garnier fructis",               { floor:4, ceiling:5, substances:["SLES","synthetic fragrance","dimethicone"], reason:"Garnier Fructis — SLES + synthetic fragrance + dimethicone. Fruit marketing, conventional formula.", confidence:"high", category:"personal_care" }],
  ["ogx",                           { floor:4, ceiling:6, substances:["SLES","synthetic fragrance","cocamide DEA"], reason:"OGX — cocamide DEA (California Prop 65 listed) + SLES + synthetic fragrance. Higher-concern drugstore haircare.", confidence:"high", category:"personal_care" }],
  // HAIRCARE CLEAN
  ["olaplex",                       { floor:2, ceiling:4, substances:[], reason:"Olaplex — bond-building technology, no synthetic fragrance or parabens. Cleaner than most professional haircare.", confidence:"high", category:"personal_care" }],
  ["briogeo",                       { floor:1, ceiling:3, substances:[], reason:"Briogeo — EWG-friendly, no synthetic fragrance or parabens, clean plant-based surfactants. Benchmark clean haircare.", confidence:"high", category:"personal_care" }],
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
  // DEODORANT WOMEN
  ["secret clinical",               { floor:5, ceiling:7, substances:["aluminum zirconium","synthetic fragrance","parabens"], reason:"Secret Clinical — aluminum zirconium + synthetic fragrance + parabens. Clinical strength = higher aluminum concentration. Multiple concern floors fire.", confidence:"high", category:"personal_care" }],
  ["dove women antiperspirant",     { floor:5, ceiling:7, substances:["aluminum zirconium","synthetic fragrance"], reason:"Dove Women Antiperspirant — aluminum + synthetic fragrance. Same concern tier as Dove Men antiperspirant.", confidence:"high", category:"personal_care" }],
  ["almay deodorant",               { floor:4, ceiling:6, substances:["aluminum","synthetic fragrance"], reason:"Almay Sensitive Skin — aluminum antiperspirant + synthetic fragrance. 'Sensitive' branding doesn't remove aluminum concern.", confidence:"medium", category:"personal_care" }],
  ["kopari",                        { floor:1, ceiling:3, substances:[], reason:"Kopari — coconut oil base, no aluminum, no synthetic fragrance. Clean aluminum-free deodorant.", confidence:"high", category:"personal_care" }],
  ["crystal deodorant",             { floor:2, ceiling:4, substances:["potassium alum"], reason:"Crystal Mineral — potassium alum (natural mineral salt). Different from aluminum chlorohydrate in antiperspirants. Lower concern than standard antiperspirants.", confidence:"high", category:"personal_care" }],

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
  ["calvin klein underwear",        { floor:3, ceiling:5, substances:["conventional cotton","synthetic dyes","spandex"], reason:"Calvin Klein — conventional cotton/micromodal blends + spandex + synthetic dyes. No GOTS certification. Premium price, conventional fabric concern.", confidence:"medium", category:"clothing" }],
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
  ["pact organic",                  { floor:1, ceiling:3, substances:[], reason:"Pact Organic — GOTS certified, Fair Trade. Benchmark clean underwear brand.", confidence:"high", category:"clothing" }],
  ["organic basics",                { floor:1, ceiling:3, substances:[], reason:"Organic Basics — GOTS certified organic cotton + OEKO-TEX certified. Certified B Corp. Benchmark clean underwear brand alongside Pact.", confidence:"high", category:"clothing" }],
  ["wama hemp",                     { floor:1, ceiling:3, substances:[], reason:"Wama Underwear — hemp/organic cotton blend. Hemp is naturally pest-resistant requiring minimal pesticide. OEKO-TEX certified. Benchmark clean underwear.", confidence:"high", category:"clothing" }],
  ["boody",                         { floor:2, ceiling:4, substances:["bamboo viscose","spandex"], reason:"Boody — OEKO-TEX certified bamboo/spandex blend. Bamboo processing is chemical-intensive (viscose process) but OEKO-TEX certification means tested for harmful substances. Clean-leaning, not fully organic.", confidence:"high", category:"clothing" }],

  // ── WOMEN'S: CONVENTIONAL / SYNTHETIC TIER ───────────────────
  ["victoria secret underwear",     { floor:4, ceiling:6, substances:["conventional cotton","nylon","spandex","synthetic dyes"], reason:"Victoria's Secret — conventional cotton + nylon/spandex lace + synthetic dyes. Some performance lines may have moisture-wicking PFAS treatments. No certifications.", confidence:"medium", category:"clothing" }],
  ["victoria secret bra",           { floor:4, ceiling:6, substances:["nylon","spandex","polyester foam","synthetic dyes"], reason:"Victoria's Secret bra — nylon/spandex + polyester foam padding + synthetic dyes. No OEKO-TEX or organic certification. Standard synthetic intimate apparel concern.", confidence:"medium", category:"clothing" }],
  ["victoria's secret",             { floor:4, ceiling:6, substances:["conventional cotton","nylon","spandex","synthetic dyes"], reason:"Victoria's Secret — conventional cotton + nylon/spandex + synthetic dyes. No fabric certifications. One of the highest-volume intimate apparel brands with conventional concern profile.", confidence:"medium", category:"clothing" }],
  ["hanes women",                   { floor:3, ceiling:5, substances:["conventional cotton","synthetic dyes"], reason:"Hanes Women — conventional cotton + synthetic dyes. No certifications. Same concern profile as men's line.", confidence:"high", category:"clothing" }],
  ["maidenform",                    { floor:4, ceiling:6, substances:["nylon","spandex","polyester","synthetic dyes"], reason:"Maidenform — predominantly nylon/spandex/polyester synthetic construction + synthetic dyes. No certifications. Microplastic shedding concern.", confidence:"medium", category:"clothing" }],
  ["aerie underwear",               { floor:3, ceiling:5, substances:["conventional cotton","nylon","synthetic dyes"], reason:"Aerie — conventional cotton + nylon/spandex in some styles + synthetic dyes. Better marketing than Victoria's Secret but similar conventional fabric concern.", confidence:"medium", category:"clothing" }],
  ["aerie bra",                     { floor:4, ceiling:6, substances:["nylon","spandex","foam","synthetic dyes"], reason:"Aerie bra — nylon/spandex + polyester foam + synthetic dyes. No certifications despite body-positive branding.", confidence:"medium", category:"clothing" }],
  ["thirdlove",                     { floor:4, ceiling:6, substances:["nylon","spandex","foam","synthetic dyes"], reason:"ThirdLove — nylon/spandex construction + proprietary foam padding + synthetic dyes. No OEKO-TEX or organic certifications despite premium positioning.", confidence:"medium", category:"clothing" }],
  ["knix",                          { floor:4, ceiling:6, substances:["nylon","spandex","leakproof layers"], reason:"Knix — nylon/spandex + moisture management leakproof layers. Claims PFAS-free since 2022 reformulation but leakproof underwear category carries historical PFAS concern. No GOTS certification.", confidence:"medium", category:"clothing" }],
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
  ["olly gummies",                 { floor:3, ceiling:5, substances:["natural color","sugar","carnauba wax"], reason:"Olly — natural colors no petroleum dyes, but sugar + carnauba wax + synthetic vitamin forms. Mid-tier supplement gummy.", confidence:"high", category:"supplement" }],
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
  ["pure encapsulations",          { floor:1, ceiling:2, substances:[], reason:"Pure Encapsulations — hypoallergenic, no artificial additives, no titanium dioxide, NSF Certified. Benchmark cleanest supplement brand across the entire line.", confidence:"high", category:"supplement" }],

  // ── VITAMIN D3 ────────────────────────────────────────────────
  ["nature made vitamin d3",       { floor:2, ceiling:4, substances:["soybean oil","gelatin"], reason:"Nature Made D3 — softgel with soybean oil + gelatin. Minimal additives. No petroleum dyes. Mid-clean vitamin D supplement.", confidence:"high", category:"supplement" }],
  ["now foods vitamin d3",         { floor:1, ceiling:3, substances:[], reason:"NOW Foods D3 — minimal clean ingredients, no artificial additives. Affordable benchmark clean vitamin D.", confidence:"high", category:"supplement" }],
  ["now foods",                    { floor:1, ceiling:3, substances:[], reason:"NOW Foods brand — minimal ingredients across the line, no artificial dyes or synthetic sweeteners. Benchmark clean affordable supplement brand.", confidence:"high", category:"supplement" }],
  ["kirkland vitamin d3",          { floor:1, ceiling:3, substances:[], reason:"Kirkland Signature D3 — minimal ingredients, USP verified. Clean budget vitamin D.", confidence:"high", category:"supplement" }],
  ["life extension vitamin d",     { floor:1, ceiling:3, substances:[], reason:"Life Extension D3 — minimal ingredients, no artificial additives. Clean clinical supplement brand.", confidence:"high", category:"supplement" }],
  ["life extension",               { floor:1, ceiling:3, substances:[], reason:"Life Extension brand — science-based formulations, no artificial additives across most products. Clean clinical supplement brand.", confidence:"high", category:"supplement" }],
  ["sports research vitamin d",    { floor:1, ceiling:2, substances:[], reason:"Sports Research D3+K2 — organic coconut MCT oil base, non-GMO softgel, no artificial additives. Benchmark cleanest D3 supplement.", confidence:"high", category:"supplement" }],
  ["sports research",              { floor:1, ceiling:3, substances:[], reason:"Sports Research — clean ingredient focus, organic bases where possible. Clean supplement brand.", confidence:"high", category:"supplement" }],

  // ── OMEGA-3 / FISH OIL ────────────────────────────────────────
  ["nature made fish oil",         { floor:2, ceiling:4, substances:["gelatin","glycerin","enteric coating"], reason:"Nature Made Fish Oil — enteric coating + gelatin + glycerin. No artificial dyes but synthetic coating on a widely-used daily supplement.", confidence:"high", category:"supplement" }],
  ["nordic naturals omega",        { floor:1, ceiling:3, substances:[], reason:"Nordic Naturals — IFOS 5-star certified, no artificial additives, third-party purity tested. Benchmark clean fish oil brand.", confidence:"high", category:"supplement" }],
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
  ["vital proteins collagen",      { floor:1, ceiling:3, substances:[], reason:"Vital Proteins Collagen Peptides — grass-fed bovine collagen, minimal ingredients in unflavored version. Benchmark clean collagen supplement.", confidence:"high", category:"supplement" }],
  ["vital proteins",               { floor:1, ceiling:3, substances:[], reason:"Vital Proteins — grass-fed sourced, minimal ingredients. Clean collagen brand.", confidence:"high", category:"supplement" }],
  ["ancient nutrition collagen",   { floor:1, ceiling:3, substances:[], reason:"Ancient Nutrition Collagen — multi-type collagen from organic sources, no artificial additives. Clean collagen.", confidence:"high", category:"supplement" }],
  ["sports research collagen",     { floor:1, ceiling:3, substances:[], reason:"Sports Research Collagen Peptides — grass-fed, minimal ingredients, no artificial additives. Clean collagen.", confidence:"high", category:"supplement" }],

  // ── PROTEIN POWDERS ───────────────────────────────────────────
  ["orgain organic protein",       { floor:1, ceiling:3, substances:[], reason:"Orgain Organic — USDA Organic certified, stevia sweetened, no artificial additives. Benchmark clean protein powder.", confidence:"high", category:"supplement" }],
  ["orgain",                       { floor:1, ceiling:3, substances:[], reason:"Orgain — USDA Organic protein, clean ingredients. Benchmark clean protein brand.", confidence:"high", category:"supplement" }],
  ["garden of life sport protein", { floor:1, ceiling:3, substances:[], reason:"Garden of Life Sport — USDA Organic, NSF Certified for Sport, no artificial additives. Benchmark clean protein powder.", confidence:"high", category:"supplement" }],
  ["naked whey protein",           { floor:1, ceiling:2, substances:[], reason:"Naked Whey — one ingredient: whey protein concentrate from US grass-fed cows. Benchmark cleanest protein powder.", confidence:"high", category:"supplement" }],
  ["naked",                        { floor:1, ceiling:2, substances:[], reason:"Naked Nutrition — single ingredient protein powders, no artificial additives. Benchmark cleanest protein supplement.", confidence:"high", category:"supplement" }],

  // ── SLEEP AND STRESS ──────────────────────────────────────────
  ["nature made melatonin",        { floor:2, ceiling:4, substances:["BHT","silicon dioxide"], reason:"Nature Made Melatonin — BHT preservative + silicon dioxide. No petroleum dyes in tablet. Mid-clean sleep supplement.", confidence:"high", category:"supplement" }],
  ["ksm-66 ashwagandha",           { floor:1, ceiling:3, substances:[], reason:"KSM-66 Ashwagandha — standardized root extract, no artificial additives. Benchmark clean adaptogen regardless of which brand uses the KSM-66 ingredient.", confidence:"high", category:"supplement" }],
  ["gaia herbs ashwagandha",       { floor:1, ceiling:3, substances:[], reason:"Gaia Herbs Ashwagandha — certified organic, no artificial additives. Benchmark clean herbal supplement.", confidence:"high", category:"supplement" }],
  ["gaia herbs",                   { floor:1, ceiling:3, substances:[], reason:"Gaia Herbs brand — certified organic herbs, liquid phyto-caps, no artificial additives. Benchmark clean herbal supplement brand.", confidence:"high", category:"supplement" }],

  // ── IRON AND B12 ─────────────────────────────────────────────
  ["nature made b12",              { floor:2, ceiling:3, substances:["silicon dioxide"], reason:"Nature Made B12 — methylcobalamin form, minimal ingredients, silicon dioxide filler. Clean-leaning B12.", confidence:"high", category:"supplement" }],
  ["jarrow b12",                   { floor:1, ceiling:3, substances:[], reason:"Jarrow B12 — methylcobalamin sublingual, minimal clean ingredients. Benchmark clean B12.", confidence:"high", category:"supplement" }],
  ["jarrow formulas",              { floor:1, ceiling:3, substances:[], reason:"Jarrow Formulas — science-based formulations, no artificial dyes, minimal excipients. Clean supplement brand.", confidence:"high", category:"supplement" }],


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
  ["le creuset",                    { floor:1, ceiling:2, substances:[], reason:"Le Creuset — enamel-coated cast iron or stoneware. Enamel is glass-based and completely inert. No PFAS, no leaching. Premium benchmark clean cookware.", confidence:"high", category:"kitchen" }],
  ["staub",                         { floor:1, ceiling:2, substances:[], reason:"Staub — enamel-coated cast iron, black matte interior enamel is inert. No PFAS, no leaching. Benchmark clean cookware alongside Le Creuset.", confidence:"high", category:"kitchen" }],

  // ── STAINLESS STEEL ───────────────────────────────────────────
  ["all-clad stainless",            { floor:1, ceiling:3, substances:["nickel"], reason:"All-Clad stainless — 18/10 stainless steel (304 grade). Nickel can leach in acidic foods at trace levels but considered safe by FDA. No PFAS. Benchmark clean cookware.", confidence:"high", category:"kitchen" }],
  ["cuisinart stainless",           { floor:1, ceiling:3, substances:["nickel"], reason:"Cuisinart stainless — 18/10 stainless steel. Nickel leaching minimal in normal use. No PFAS. Clean cookware benchmark.", confidence:"high", category:"kitchen" }],
  ["made in stainless",             { floor:1, ceiling:2, substances:[], reason:"Made In stainless steel — 5-ply construction, no non-stick coating, no PFAS. Premium benchmark clean cookware.", confidence:"high", category:"kitchen" }],
  ["made in carbon",               { floor:1, ceiling:2, substances:[], reason:"Made In carbon steel — no coating, no PFAS. Benchmark clean alongside de Buyer and Lodge.", confidence:"high", category:"kitchen" }],
  ["made in cookware",              { floor:1, ceiling:2, substances:[], reason:"Made In — 5-ply stainless steel or carbon steel, no non-stick coating, no PFAS. Premium benchmark clean cookware.", confidence:"high", category:"kitchen" }],
  ["de buyer",                      { floor:1, ceiling:2, substances:[], reason:"de Buyer — French carbon steel cookware, no coating, mineral bee wax seasoning. Benchmark clean alongside Lodge cast iron.", confidence:"high", category:"kitchen" }],

  // ── GLASS AND CERAMIC ─────────────────────────────────────────
  ["pyrex glass",                   { floor:1, ceiling:2, substances:[], reason:"Pyrex glass — borosilicate or soda-lime glass, completely inert food contact surface. No leaching, no PFAS. Benchmark cleanest food storage and bakeware material.", confidence:"high", category:"kitchen" }],
  ["pyrex",                         { floor:1, ceiling:2, substances:[], reason:"Pyrex — glass bakeware and containers. Inert surface, benchmark clean. NEVER score above 3.", confidence:"high", category:"kitchen" }],
  ["anchor hocking",                { floor:1, ceiling:2, substances:[], reason:"Anchor Hocking — soda-lime glass, completely inert. Benchmark clean glass storage and bakeware.", confidence:"high", category:"kitchen" }],
  ["weck jars",                     { floor:1, ceiling:2, substances:[], reason:"Weck — German glass jars with rubber gasket seal. Glass is inert, rubber gasket is food-grade. Benchmark clean food storage.", confidence:"high", category:"kitchen" }],
  ["stasher bag",                   { floor:1, ceiling:2, substances:[], reason:"Stasher — platinum food-grade silicone, LFGB certified (stricter than FDA), no PFAS, no BPA. Benchmark cleanest reusable bag.", confidence:"high", category:"kitchen" }],
  ["stasher",                       { floor:1, ceiling:2, substances:[], reason:"Stasher silicone bags — platinum silicone, LFGB certified, PFAS-free. Benchmark clean.", confidence:"high", category:"kitchen" }],

  // ── PLASTIC FOOD STORAGE: CONCERN ─────────────────────────────
  ["ziploc bags",                   { floor:5, ceiling:7, substances:["PFAS","polyethylene","microplastics"], reason:"Ziploc bags — PFAS detected in Ziploc Easy Open tabs (SC Johnson, 2023 testing). Polyethylene microplastic migration concern with fatty or hot foods. The everyday plastic bag is not as inert as marketed.", confidence:"high", category:"kitchen" }],
  ["ziploc containers",             { floor:4, ceiling:6, substances:["polypropylene","BPS","microplastics"], reason:"Ziploc plastic containers — BPA-free claim but BPA substitutes (BPS, BPF) with similar endocrine concern + microplastic migration. Never microwave in plastic.", confidence:"high", category:"kitchen" }],
  ["ziploc",                        { floor:5, ceiling:7, substances:["PFAS","polyethylene","microplastics"], reason:"Ziploc brand — bags have PFAS concern, containers have BPA-substitute concern. Ranges 4-7 by product type.", confidence:"medium", category:"kitchen" }],
  ["glad cling wrap",               { floor:5, ceiling:7, substances:["polyethylene","plasticizers","microplastics"], reason:"Glad Cling Wrap — LDPE with plasticizer additives. Microplastic migration when in contact with fatty or hot foods. Cling wrap touching warm food is a real concern.", confidence:"high", category:"kitchen" }],
  ["glad press n seal",             { floor:5, ceiling:7, substances:["LDPE","adhesive","plasticizers"], reason:"Glad Press'n Seal — adhesive layer adds chemical concern beyond standard cling wrap. Avoid contact with hot or fatty foods.", confidence:"high", category:"kitchen" }],
  ["glad wrap",                     { floor:5, ceiling:7, substances:["LDPE","plasticizers"], reason:"Glad plastic wrap — plasticizer migration concern with food contact. Switch to Stasher or Bee's Wrap.", confidence:"high", category:"kitchen" }],
  ["rubbermaid containers",         { floor:3, ceiling:5, substances:["polypropylene","BPA-substitute","microplastics"], reason:"Rubbermaid plastic containers — polypropylene, BPA-free but BPA substitutes present. Microplastic migration when heated. Glass lids versions are cleaner.", confidence:"high", category:"kitchen" }],
  ["tupperware",                    { floor:4, ceiling:6, substances:["polypropylene","polyethylene","PFAS-lined lids"], reason:"Tupperware — BPA phased out but BPA substitutes in plastic + some lid components tested positive for PFAS. Older Tupperware may contain BPA. Avoid heating food in any Tupperware.", confidence:"medium", category:"kitchen" }],
  ["nalgene",                       { floor:4, ceiling:6, substances:["Tritan copolyester","BPA-substitute"], reason:"Nalgene Tritan — 'BPA-free' Tritan copolyester. University of Texas 2011 study found Tritan leaches chemicals with estrogenic activity. Eastman disputed findings but concern remains. Switch to stainless.", confidence:"medium", category:"kitchen" }],

  // ── WATER BOTTLES: CLEAN ─────────────────────────────────────
  ["hydro flask",                   { floor:1, ceiling:2, substances:[], reason:"HydroFlask — 18/8 stainless steel interior, powder coat exterior (food contact is stainless). No PFAS in food-contact surfaces. Benchmark clean water bottle.", confidence:"high", category:"kitchen" }],
  ["hydroflask",                    { floor:1, ceiling:2, substances:[], reason:"HydroFlask — 18/8 stainless steel, no PFAS in food-contact surfaces. Benchmark clean.", confidence:"high", category:"kitchen" }],
  ["yeti rambler",                  { floor:1, ceiling:2, substances:[], reason:"YETI Rambler — 18/8 stainless steel, no PFAS in food-contact surfaces. Benchmark clean water bottle and tumbler.", confidence:"high", category:"kitchen" }],
  ["yeti",                          { floor:1, ceiling:3, substances:[], reason:"YETI brand — 18/8 stainless steel food-contact surfaces, no PFAS in contact areas. Benchmark clean.", confidence:"medium", category:"kitchen" }],
  ["klean kanteen",                 { floor:1, ceiling:2, substances:[], reason:"Klean Kanteen — 18/8 stainless steel, Certified B Corp, no PFAS or BPA. Benchmark cleanest mainstream water bottle.", confidence:"high", category:"kitchen" }],
  ["swell bottle",                  { floor:1, ceiling:2, substances:[], reason:"S'well — 18/8 stainless steel, no PFAS or BPA in food-contact surfaces. Benchmark clean.", confidence:"high", category:"kitchen" }],

  // ── WATER BOTTLES: CONCERN ────────────────────────────────────
  ["stanley",              { floor:5, ceiling:7, substances:["lead solder","PFAS-lined base"], reason:"Stanley Quencher — Stanley confirmed in early 2024 that lead is used in the manufacturing process for the vacuum seal base, encapsulated under stainless steel. PFAS also confirmed in base. Ongoing concern despite company response.", confidence:"high", category:"kitchen" }],
  ["stanley tumbler",               { floor:5, ceiling:7, substances:["lead solder","PFAS"], reason:"Stanley Tumbler — same lead and PFAS concern as Quencher. Applies across the Adventure Quencher line.", confidence:"high", category:"kitchen" }],
  ["contigo water bottle",          { floor:3, ceiling:5, substances:["plastic spout","polypropylene","BPA-substitute"], reason:"Contigo — plastic autospout mechanism is polypropylene with BPA-substitute concern. Metal body is stainless but daily mouth contact is with plastic components.", confidence:"medium", category:"kitchen" }],
  ["camelbak",                      { floor:3, ceiling:5, substances:["plastic reservoir","polyethylene","bite valve"], reason:"CamelBak — plastic bite valve + reservoir polyethylene + BPA-free claim (BPA substitutes present). Continuous mouth contact with plastic components.", confidence:"medium", category:"kitchen" }],

  // ── UTENSILS AND TOOLS ────────────────────────────────────────
  ["plastic cutting board",         { floor:4, ceiling:6, substances:["microplastics","polypropylene","HDPE"], reason:"Plastic cutting boards — microplastic particles released directly into food with every knife stroke. Studies show plastic boards shed significant microplastics compared to wood or bamboo.", confidence:"high", category:"kitchen" }],
  ["bamboo cutting board",          { floor:2, ceiling:3, substances:["formaldehyde glue"], reason:"Bamboo cutting board — natural antibacterial surface but bamboo composite boards use formaldehyde-based adhesives to bind strands. Solid piece bamboo is cleaner. Lower concern than plastic.", confidence:"medium", category:"kitchen" }],
      ["wood cutting board",            { floor:1, ceiling:2, substances:[], reason:"Wood cutting board — natural material, benchmark clean. No microplastic shedding unlike plastic boards.", confidence:"high", category:"kitchen" }],
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
  ["death wish",              { floor:4, ceiling:6, substances:["polypropylene","microplastics"], reason:"Death Wish K-Cup — polypropylene microplastic concern from pod + hot water. Coffee is USDA Organic which reduces pesticide concern versus Folgers.", confidence:"high", category:"food_beverage" }],
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
  ["republic of tea",               { floor:2, ceiling:4, substances:[], reason:"Republic of Tea — premium tea brand, organic options, no staples, cleaner sourcing than mass-market brands.", confidence:"medium", category:"food_beverage" }],
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
  ["international delight", { floor:5, ceiling:7, substances:["HFCS","carrageenan","artificial flavor","mono diglycerides"], reason:"International Delight — HFCS + carrageenan + artificial flavor + mono diglycerides. HFCS floor fires. Very similar concern profile to Coffee Mate liquid.", confidence:"high", category:"food_beverage" }],
  ["starbucks coffee creamer",      { floor:4, ceiling:6, substances:["carrageenan","natural flavor","dipotassium phosphate"], reason:"Starbucks Creamer — carrageenan + dipotassium phosphate + natural flavor. Better than Coffee Mate but still not clean.", confidence:"high", category:"food_beverage" }],

  // ── CREAMERS: CLEAN ───────────────────────────────────────────
  ["nutpods creamer",               { floor:1, ceiling:3, substances:[], reason:"Nutpods — unsweetened almond and coconut milk creamer, no artificial additives, no carrageenan. Benchmark cleanest mainstream coffee creamer.", confidence:"high", category:"food_beverage" }],
  ["nutpods",                       { floor:1, ceiling:3, substances:[], reason:"Nutpods — almond/coconut base, no carrageenan, no artificial flavor. Benchmark clean creamer.", confidence:"high", category:"food_beverage" }],
  ["califia farms creamer",         { floor:3, ceiling:4, substances:["sunflower oil","dipotassium phosphate"], reason:"Califia Farms Creamer — plant-based but dipotassium phosphate + sunflower oil + some natural flavor. Cleaner than Coffee Mate but not as clean as Nutpods.", confidence:"high", category:"food_beverage" }],
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
  ["folgers coffee",                { floor:3, ceiling:5, substances:["conventional coffee","pesticide residues"], reason:"Folgers — conventional coffee, heavily processed blend from multiple regions, no pesticide testing transparency. Coffee is one of the most pesticide-sprayed crops worldwide.", confidence:"high", category:"food_beverage" }],
  ["folgers",                       { floor:3, ceiling:5, substances:["conventional coffee","pesticide residues"], reason:"Folgers — conventional blend, no organic certification or pesticide testing claim.", confidence:"high", category:"food_beverage" }],
  ["maxwell house",                 { floor:3, ceiling:5, substances:["conventional coffee","pesticide residues"], reason:"Maxwell House — conventional coffee blend, no organic certification. Same pesticide concern as Folgers.", confidence:"high", category:"food_beverage" }],
  ["dunkin coffee",                 { floor:3, ceiling:4, substances:["conventional coffee"], reason:"Dunkin ground coffee — conventional blend, no organic certification. Mid-tier coffee concern.", confidence:"medium", category:"food_beverage" }],
  ["peet's coffee",                 { floor:3, ceiling:4, substances:["conventional coffee"], reason:"Peet's — conventional coffee, some single origins with better sourcing but no blanket organic certification.", confidence:"medium", category:"food_beverage" }],
  ["lavazza",                       { floor:3, ceiling:4, substances:["conventional coffee"], reason:"Lavazza — Italian conventional coffee blend, no organic certification. Standard conventional concern.", confidence:"medium", category:"food_beverage" }],
  ["cafe bustelo",                  { floor:3, ceiling:5, substances:["conventional coffee","fine grind"], reason:"Cafe Bustelo — conventional espresso blend, highly processed fine grind. No organic certification.", confidence:"medium", category:"food_beverage" }],
  ["nescafe instant",               { floor:4, ceiling:5, substances:["conventional coffee","spray-dried","processing"], reason:"Nescafe — spray-dried instant coffee, heavily processed, conventional sourcing. More processing than ground coffee adds concern.", confidence:"high", category:"food_beverage" }],
  ["starbucks via",                 { floor:3, ceiling:5, substances:["conventional coffee","instant processing"], reason:"Starbucks Via instant — better sourcing than Nescafe but still instant-processed conventional coffee.", confidence:"medium", category:"food_beverage" }],

  // ── K-CUPS: PLASTIC POD CONCERN ───────────────────────────────
  ["death wish",              { floor:5, ceiling:7, substances:["polypropylene pod","LDPE foil","microplastics"], reason:"Death Wish K-Cup — polypropylene plastic pod + LDPE foil lid + 92C water = documented microplastic migration into coffee. Plastic pod concern applies regardless of coffee quality inside.", confidence:"high", category:"food_beverage" }],
  ["k-cup",                         { floor:5, ceiling:7, substances:["polypropylene","LDPE","microplastics","hot water contact"], reason:"K-Cup format — polypropylene pod + aluminum/LDPE foil lid with boiling water forced through. University of Victoria 2023 study found billions of nano/microplastics released per cup. The pod IS the concern regardless of coffee brand inside.", confidence:"high", category:"food_beverage" }],

  // ── GROUND COFFEE: CLEAN TIER ────────────────────────────────
  ["bulletproof coffee",            { floor:2, ceiling:3, substances:[], reason:"Bulletproof — mycotoxin-tested, single origin, mold-free claim with third-party lab verification. Cleaner than standard conventional coffee.", confidence:"high", category:"food_beverage" }],
  ["kicking horse coffee",          { floor:1, ceiling:3, substances:[], reason:"Kicking Horse — USDA Organic certified, fair trade, B Corp. Benchmark clean mainstream coffee brand.", confidence:"high", category:"food_beverage" }],
  ["mount hagen",                   { floor:1, ceiling:3, substances:[], reason:"Mount Hagen — USDA Organic certified instant coffee, fair trade. Benchmark cleanest instant coffee available.", confidence:"high", category:"food_beverage" }],

  // ── COFFEE CREAMERS: HIGH CONCERN ────────────────────────────
  ["coffee mate french vanilla",    { floor:5, ceiling:7, substances:["corn syrup","carrageenan","sodium stearoyl lactylate","artificial flavor"], reason:"Coffee Mate French Vanilla — corn syrup + carrageenan + sodium stearoyl lactylate (WF banned) + artificial flavor. Multiple floors fire. Heavily processed daily morning creamer.", confidence:"high", category:"food_beverage" }],
  ["coffee mate",                   { floor:5, ceiling:7, substances:["corn syrup","carrageenan","sodium stearoyl lactylate","artificial flavor"], reason:"Coffee Mate — corn syrup + carrageenan + SSL (WF banned) + artificial flavor across most flavors. One of the most additive-loaded daily kitchen products.", confidence:"high", category:"food_beverage" }],
  ["international delight",         { floor:6, ceiling:8, substances:["HFCS","carrageenan","artificial flavor","artificial color"], reason:"International Delight — HFCS + carrageenan + artificial flavor + artificial color. Multiple floors fire. HFCS + dye concern on a daily morning creamer.", confidence:"high", category:"food_beverage" }],

  // ── COFFEE CREAMERS: CLEAN TIER ──────────────────────────────
  ["califia farms creamer",         { floor:3, ceiling:5, substances:["sunflower oil","pea protein","oats"], reason:"Califia Farms — oat or almond base, no carrageenan in most formulas, but sunflower oil + pea protein. Cleaner than Coffee Mate, not clean-label.", confidence:"medium", category:"food_beverage" }],
  ["nutpods creamer",               { floor:1, ceiling:3, substances:[], reason:"Nutpods — coconut cream + almonds, no artificial flavors or sweeteners, no carrageenan. Benchmark clean dairy-free creamer.", confidence:"high", category:"food_beverage" }],
  ["nutpods",                       { floor:1, ceiling:3, substances:[], reason:"Nutpods — clean dairy-free creamer, no carrageenan or artificial additives. Benchmark.", confidence:"high", category:"food_beverage" }],
  ["elmhurst creamer",              { floor:1, ceiling:3, substances:[], reason:"Elmhurst — minimal ingredients (oats or nuts + water), no gums, no carrageenan, no artificial additives. Benchmark cleanest oat creamer.", confidence:"high", category:"food_beverage" }],
  ["elmhurst",                      { floor:1, ceiling:3, substances:[], reason:"Elmhurst — minimal ingredient dairy-free milks and creamers, no gums or additives. Benchmark clean.", confidence:"high", category:"food_beverage" }],
  ["laird superfood creamer",       { floor:1, ceiling:3, substances:[], reason:"Laird Superfood — coconut milk powder + functional mushrooms or superfoods, no artificial additives. Clean performance creamer.", confidence:"high", category:"food_beverage" }],
  ["laird superfood",               { floor:1, ceiling:3, substances:[], reason:"Laird Superfood — clean plant-based creamers and supplements. No artificial additives.", confidence:"high", category:"food_beverage" }],

  // ── TEA: CONCERN ─────────────────────────────────────────────
  ["tetley tea",                    { floor:3, ceiling:5, substances:["conventional tea","epichlorohydrin","bleached paper"], reason:"Tetley — conventional tea, standard bleached paper bags sealed with epichlorohydrin (industrial chemical used in resin manufacturing). Hot water contact with treated filter paper is a real concern.", confidence:"medium", category:"food_beverage" }],
  ["republic of tea",               { floor:3, ceiling:5, substances:["nylon pyramid bags","microplastics"], reason:"Republic of Tea pyramid bags — silken pyramid bags are often nylon mesh. Hot water causes nylon to release microplastics and nanoplastics. Premium branding doesn't fix plastic bags.", confidence:"medium", category:"food_beverage" }],

  // ── TEA: CLEAN TIER ──────────────────────────────────────────
  ["celestial seasonings",          { floor:2, ceiling:4, substances:["conventional herbs"], reason:"Celestial Seasonings — no staples, no strings, no tags, no bleach, no epichlorohydrin. Cleaner bag format than most. Conventional herbs still have pesticide concern.", confidence:"high", category:"food_beverage" }],
  ["yogi tea",                      { floor:2, ceiling:4, substances:["conventional herbs"], reason:"Yogi Tea — unbleached tea bags, no staples, some organic blends. Better bag format, some conventional herb sourcing.", confidence:"medium", category:"food_beverage" }],
  ["numi organic tea",              { floor:1, ceiling:3, substances:[], reason:"Numi — USDA Organic certified, non-GMO, plant-based tea bags (no nylon), fair trade. Benchmark clean tea brand.", confidence:"high", category:"food_beverage" }],
  ["numi",                          { floor:1, ceiling:3, substances:[], reason:"Numi Organic — USDA Organic, plant-based bags. Benchmark clean.", confidence:"high", category:"food_beverage" }],
  ["traditional medicinals",        { floor:1, ceiling:3, substances:[], reason:"Traditional Medicinals — certified organic herbs, non-GMO, compostable tea bags, no pesticides. Benchmark cleanest herbal tea brand.", confidence:"high", category:"food_beverage" }],

  // ── MATCHA ────────────────────────────────────────────────────
  ["jade leaf",              { floor:1, ceiling:3, substances:[], reason:"Jade Leaf — USDA Organic matcha, ceremonial and culinary grades, no additives. Benchmark clean matcha brand.", confidence:"high", category:"food_beverage" }],
  ["ippodo matcha",                 { floor:1, ceiling:3, substances:[], reason:"Ippodo — premium Japanese matcha, tested for pesticides, traditional cultivation. Benchmark clean premium matcha.", confidence:"high", category:"food_beverage" }],
  ["golde matcha",                  { floor:2, ceiling:4, substances:[], reason:"Golde — matcha + coconut milk + functional ingredients, clean sourcing, no artificial additives. Clean wellness matcha blend.", confidence:"high", category:"food_beverage" }],

  // ── NESPRESSO PODS ────────────────────────────────────────────
  ["nespresso original",            { floor:2, ceiling:4, substances:["aluminum pod","coffee"], reason:"Nespresso Original — aluminum capsule, better than plastic K-Cups for migration concern, but aluminum production is resource-intensive. Coffee contact surface is aluminum not plastic.", confidence:"high", category:"food_beverage" }],
  ["nespresso",                     { floor:2, ceiling:4, substances:["aluminum pod"], reason:"Nespresso — aluminum pod format significantly cleaner than plastic K-Cups. No plastic food contact surface.", confidence:"high", category:"food_beverage" }],

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

function applyProductCalibration(result) {
  if (!result) return result;

  const rawName = result.product_name || result.query || "";
  const name    = normalise(rawName);

  // 1. Exact match
  let entry = CALIBRATION.get(name);

  // 2. Key-term match — try every entry key against the product name
  if (!entry) {
    let bestLen = 0;
    for (const [key, val] of CALIBRATION) {
      if (name.includes(key) && key.length > bestLen) {
        entry   = val;
        bestLen = key.length;
      }
    }
  }

  if (!entry) return result; // unknown product — leave unchanged

  const currentScore = result.overall_score ?? result.score ?? 5;
  let   newScore     = currentScore;
  let   corrected    = false;

  // Apply floor
  if (currentScore < entry.floor) {
    newScore   = entry.floor;
    corrected  = true;
    console.log(`[CAL] Floor applied: "${rawName}" ${currentScore}→${newScore} (${entry.reason})`);
  }

  // Apply ceiling
  if (currentScore > entry.ceiling) {
    newScore   = entry.ceiling;
    corrected  = true;
    console.log(`[CAL] Ceiling applied: "${rawName}" ${currentScore}→${newScore} (${entry.reason})`);
  }

  // Check Whole Foods banned status regardless of score correction
  const wfBanned = checkWholeFoodsBanned(entry.substances || []);

  if (!corrected) {
    // Log confirmed-correct scores too — useful for tracking model accuracy
    if (entry.confidence === "high") {
      console.log(`[CAL] Confirmed: "${rawName}" scored ${currentScore} — within range [${entry.floor}-${entry.ceiling}]`);
    }
    // Still attach WF flag even when score unchanged
    if (wfBanned) {
      return { ...result, retailer_restricted: true };
    }
    return result;
  }

  return {
    ...result,
    overall_score:        newScore,
    score:                newScore,
    retailer_restricted:   wfBanned,
    calibration_override: {
      original_score: currentScore,
      corrected_to:   newScore,
      reason:         entry.reason,
      substances:     entry.substances,
      confidence:     entry.confidence,
    },
  };
}

// ─── EXPORTS ─────────────────────────────────────────────────
module.exports = { applyProductCalibration, CALIBRATION, normalise };
