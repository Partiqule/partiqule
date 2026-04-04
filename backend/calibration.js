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
  ["ezekiel bread",                { floor:1, ceiling:3, substances:[], reason:"Sprouted grain, NOVA 1, minimal ingredients, no additives", confidence:"high", category:"food_beverage" }],
  ["wonder bread",                 { floor:4, ceiling:6, substances:["HFCS","DATEM","SSL"], reason:"HFCS + synthetic dough conditioners + enriched flour + NOVA 4", confidence:"high", category:"food_beverage" }],

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
  ["ritz crackers",                { floor:3, ceiling:5, substances:["palm oil"], reason:"Enriched flour + palm oil + partially hydrogenated oil in some", confidence:"high", category:"food_beverage" }],
  ["goldfish crackers",            { floor:3, ceiling:5, substances:["enriched flour","annatto"], reason:"Enriched flour + cheddar + annatto + NOVA 3-4", confidence:"high", category:"food_beverage" }],
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
  ["ocean spray cranberry cocktail",{ floor:4, ceiling:6, substances:["HFCS"], reason:"28% juice + HFCS + water — NOT same as 100% cranberry juice", confidence:"high", category:"beverage" }],
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
  ["eggo waffles",                 { floor:4, ceiling:6, substances:["HFCS","calcium propionate"], reason:"HFCS + artificial flavors + calcium propionate + enriched flour + NOVA 4", confidence:"high", category:"food_beverage" }],
  ["log cabin syrup",              { floor:4, ceiling:6, substances:["HFCS","caramel color"], reason:"HFCS + caramel color + artificial maple flavor — not real maple", confidence:"high", category:"food_beverage" }],
  ["aunt jemima",                  { floor:4, ceiling:6, substances:["HFCS","caramel color"], reason:"HFCS + artificial maple flavor — now Pearl Milling Company", confidence:"high", category:"food_beverage" }],
  ["pearl milling",                { floor:4, ceiling:6, substances:["HFCS"], reason:"HFCS + artificial maple flavor", confidence:"high", category:"food_beverage" }],
  ["yoplait original",             { floor:4, ceiling:6, substances:["HFCS"], reason:"US formula uses HFCS — not same as Stonyfield or Chobani plain", confidence:"medium", category:"food_beverage" }],

  // ══════════════════════════════════════════════════════════════
  // PERSONAL CARE — SUNSCREEN
  // ══════════════════════════════════════════════════════════════
  ["neutrogena ultra sheer",       { floor:6, ceiling:8, substances:["oxybenzone","octinoxate"], reason:"Oxybenzone detected in bloodstream after single application (Matta JAMA 2019)", confidence:"high", category:"personal_care" }],
  ["banana boat",                  { floor:5, ceiling:7, substances:["avobenzone","octocrylene"], reason:"Chemical UV filters with FDA systemic absorption concerns", confidence:"high", category:"personal_care" }],
  ["badger sunscreen",             { floor:1, ceiling:3, substances:[], reason:"Non-nano zinc oxide only — mineral sunscreen, organic base", confidence:"high", category:"personal_care" }],
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
  ["native deodorant",             { floor:1, ceiling:3, substances:[], reason:"Aluminum-free, coconut oil, shea butter, baking soda, no synthetic fragrance", confidence:"high", category:"personal_care" }],
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
  ["dawn original dish",           { floor:3, ceiling:5, substances:["synthetic fragrance"], reason:"Petroleum-derived surfactants + synthetic fragrance + colorants", confidence:"high", category:"home" }],
  ["dawn platinum",                { floor:4, ceiling:6, substances:["synthetic fragrance"], reason:"Stronger surfactant concentration + synthetic fragrance", confidence:"high", category:"home" }],
  ["dawn free gentle dish",        { floor:2, ceiling:4, substances:[], reason:"No dye, no fragrance — genuinely cleaner Dawn variant", confidence:"high", category:"home" }],

  // ══════════════════════════════════════════════════════════════
  // HOME — COOKWARE AND KITCHEN
  // ══════════════════════════════════════════════════════════════
  ["all-clad stainless",           { floor:1, ceiling:2, substances:[], reason:"18/10 stainless steel — inert, no coating, benchmark clean cookware", confidence:"high", category:"kitchen" }],
  ["lodge cast iron",              { floor:1, ceiling:2, substances:[], reason:"Bare cast iron + seasoning only — no coating, inert", confidence:"high", category:"kitchen" }],
  ["le creuset",                   { floor:1, ceiling:2, substances:[], reason:"Enamel ceramic coating — no PTFE, no PFAS", confidence:"high", category:"kitchen" }],
  ["caraway cookware",             { floor:1, ceiling:3, substances:[], reason:"Ceramic coating — no PTFE, no PFAS confirmed", confidence:"high", category:"kitchen" }],
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

];

// ─── BUILD LOOKUP MAP ─────────────────────────────────────────
const CALIBRATION = new Map(ENTRIES.map(([k, v]) => [normalise(k), v]));

// ─── APPLY CALIBRATION ────────────────────────────────────────
/**
 * Applies floor/ceiling from the calibration registry to a scan result.
 * Runs in <1ms. Adds calibration_override field if correction was made.
 */
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

  if (!corrected) {
    // Log confirmed-correct scores too — useful for tracking model accuracy
    if (entry.confidence === "high") {
      console.log(`[CAL] Confirmed: "${rawName}" scored ${currentScore} — within range [${entry.floor}-${entry.ceiling}]`);
    }
    return result;
  }

  return {
    ...result,
    overall_score:        newScore,
    score:                newScore,
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
