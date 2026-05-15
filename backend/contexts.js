// R5b prep — context map. Single source of truth for two surfaces:
//
//   1. Lists templates — the "Use a template" picker on /lists. The
//      four live entries below preserve the original tpl_newborn,
//      tpl_vacation, tpl_lunches, tpl_pantry behavior. Each one's
//      categories array carries an "items" field of the original
//      product names so backend/lists.js can keep populating list
//      items unchanged after the consolidation.
//
//   2. Ask mode type 3 context queries — "What should I buy for a
//      ski trip?" / "What goes in a sick kid kit?". The model
//      reads the categories array to know what slots to fill.
//
// Status lifecycle:
//   live           reviewed, in production. Existing Lists templates.
//   needs_review   scaffolded with placeholder categories. Paul or
//                  Sara confirms the right categories per context.
//
// Each category entry has:
//   slug         a stable key (also useful for cross-ref to product
//                coverage in calibration.js — see audit report)
//   label        display name and the literal product_name we seed
//                into list_items when this context is templatized
//   min_items    suggested minimum picks for this category
//   max_items    suggested maximum picks for this category

"use strict";

const CONTEXTS = [
  // ══════════════════════════════════════════════════════════════
  // LIVE — existing Lists templates
  // ══════════════════════════════════════════════════════════════
  {
    id: "tpl_newborn",
    name: "Newborn essentials",
    label: "Newborn essentials",
    audience: ["parent", "newborn"],
    categories: [
      { slug: "diapers",      label: "Diapers",       min_items: 1, max_items: 1 },
      { slug: "baby_wash",    label: "Baby wash",     min_items: 1, max_items: 1 },
      { slug: "nursing_pads", label: "Nursing pads",  min_items: 1, max_items: 1 },
      { slug: "swaddles",     label: "Swaddles",      min_items: 1, max_items: 1 },
      { slug: "pacifiers",    label: "Pacifiers",     min_items: 1, max_items: 1 },
      { slug: "baby_wipes",   label: "Baby wipes",    min_items: 1, max_items: 1 },
      { slug: "formula",      label: "Formula",       min_items: 1, max_items: 1 },
    ],
    status: "live",
  },
  {
    id: "tpl_vacation",
    name: "Family vacation",
    label: "Family vacation",
    audience: ["family"],
    categories: [
      { slug: "sunscreen",       label: "Sunscreen",       min_items: 1, max_items: 1 },
      { slug: "bug_spray",       label: "Bug spray",       min_items: 1, max_items: 1 },
      { slug: "travel_snacks",   label: "Travel snacks",   min_items: 1, max_items: 1 },
      { slug: "hand_sanitizer",  label: "Hand sanitizer",  min_items: 1, max_items: 1 },
      { slug: "kid_tylenol",     label: "Kid Tylenol",     min_items: 1, max_items: 1 },
      { slug: "first_aid_spray", label: "First aid spray", min_items: 1, max_items: 1 },
    ],
    status: "live",
  },
  {
    id: "tpl_lunches",
    name: "Back to school lunches",
    label: "Back to school lunches",
    audience: ["parent", "kid"],
    categories: [
      { slug: "yogurt_pouches", label: "Yogurt pouches", min_items: 1, max_items: 1 },
      { slug: "fruit_pouches",  label: "Fruit pouches",  min_items: 1, max_items: 1 },
      { slug: "granola_bars",   label: "Granola bars",   min_items: 1, max_items: 1 },
      { slug: "juice_boxes",    label: "Juice boxes",    min_items: 1, max_items: 1 },
      { slug: "sandwich_bread", label: "Sandwich bread", min_items: 1, max_items: 1 },
      { slug: "deli_turkey",    label: "Deli turkey",    min_items: 1, max_items: 1 },
    ],
    status: "live",
  },
  {
    id: "tpl_pantry",
    name: "Pantry restock",
    label: "Pantry restock",
    audience: ["household"],
    categories: [
      { slug: "olive_oil",       label: "Olive oil",       min_items: 1, max_items: 1 },
      { slug: "pasta",           label: "Pasta",           min_items: 1, max_items: 1 },
      { slug: "canned_tomatoes", label: "Canned tomatoes", min_items: 1, max_items: 1 },
      { slug: "rice",            label: "Rice",            min_items: 1, max_items: 1 },
      { slug: "peanut_butter",   label: "Peanut butter",   min_items: 1, max_items: 1 },
      { slug: "cereal",          label: "Cereal",          min_items: 1, max_items: 1 },
    ],
    status: "live",
  },

  // ══════════════════════════════════════════════════════════════
  // NEEDS REVIEW — life moments
  // ══════════════════════════════════════════════════════════════
  {
    id: "first_trimester",
    name: "First trimester pregnancy",
    label: "First trimester",
    audience: ["pregnant"],
    categories: [
      { slug: "prenatal_vitamin", label: "Prenatal vitamin", min_items: 1, max_items: 1 },
      { slug: "fragrance_free_lotion", label: "Fragrance free lotion", min_items: 1, max_items: 2 },
      { slug: "ginger_anti_nausea", label: "Ginger or anti-nausea support", min_items: 1, max_items: 2 },
      { slug: "saltines_or_dry_crackers", label: "Saltines or dry crackers", min_items: 1, max_items: 1 },
      { slug: "hydration_drinks", label: "Hydration drinks", min_items: 1, max_items: 2 },
    ],
    status: "needs_review",
  },
  {
    id: "second_trimester",
    name: "Second trimester pregnancy",
    label: "Second trimester",
    audience: ["pregnant"],
    categories: [
      { slug: "prenatal_vitamin", label: "Prenatal vitamin", min_items: 1, max_items: 1 },
      { slug: "stretch_mark_oil", label: "Stretch mark oil", min_items: 1, max_items: 1 },
      { slug: "fragrance_free_moisturizer", label: "Fragrance free moisturizer", min_items: 1, max_items: 1 },
      { slug: "mineral_sunscreen", label: "Mineral sunscreen", min_items: 1, max_items: 1 },
      { slug: "maternity_belly_band", label: "Belly band or support", min_items: 1, max_items: 1 },
    ],
    status: "needs_review",
  },
  {
    id: "third_trimester",
    name: "Third trimester pregnancy",
    label: "Third trimester",
    audience: ["pregnant"],
    categories: [
      { slug: "prenatal_vitamin", label: "Prenatal vitamin", min_items: 1, max_items: 1 },
      { slug: "perineal_spray", label: "Perineal spray", min_items: 1, max_items: 1 },
      { slug: "nursing_bra", label: "Nursing bra", min_items: 1, max_items: 2 },
      { slug: "hospital_bag_lotion", label: "Hospital bag lotion", min_items: 1, max_items: 1 },
      { slug: "postpartum_pads", label: "Postpartum pads", min_items: 1, max_items: 1 },
    ],
    status: "needs_review",
  },
  {
    id: "new_baby_gift",
    name: "New baby gift (shower)",
    label: "Baby shower gift",
    audience: ["gifter"],
    categories: [
      { slug: "swaddle", label: "Swaddle", min_items: 1, max_items: 1 },
      { slug: "baby_wash", label: "Baby wash", min_items: 1, max_items: 1 },
      { slug: "baby_lotion", label: "Baby lotion", min_items: 1, max_items: 1 },
      { slug: "burp_cloths", label: "Burp cloths", min_items: 1, max_items: 1 },
      { slug: "teether", label: "Teether", min_items: 1, max_items: 2 },
    ],
    status: "needs_review",
  },
  {
    id: "first_foods",
    name: "Baby's first foods",
    label: "First foods",
    audience: ["parent", "infant"],
    categories: [
      { slug: "stage_1_pouches", label: "Stage 1 pouches", min_items: 2, max_items: 4 },
      { slug: "baby_oatmeal", label: "Baby oatmeal", min_items: 1, max_items: 1 },
      { slug: "teething_crackers", label: "Teething crackers", min_items: 1, max_items: 2 },
      { slug: "yogurt_for_baby", label: "Whole milk yogurt", min_items: 1, max_items: 1 },
    ],
    status: "needs_review",
  },
  {
    id: "toddler_birthday",
    name: "Toddler birthday party",
    label: "Toddler birthday",
    audience: ["parent", "toddler"],
    categories: [
      { slug: "birthday_cake_mix", label: "Cake mix or premade", min_items: 1, max_items: 1 },
      { slug: "kid_party_snacks", label: "Kid party snacks", min_items: 2, max_items: 4 },
      { slug: "juice_boxes", label: "Juice boxes", min_items: 1, max_items: 1 },
      { slug: "candles", label: "Candles", min_items: 1, max_items: 1 },
      { slug: "party_plates", label: "Party plates", min_items: 1, max_items: 1 },
    ],
    status: "needs_review",
  },
  {
    id: "back_to_school_kids",
    name: "Back to school (kids ages 5-10)",
    label: "Back to school (5-10)",
    audience: ["parent", "kid"],
    categories: [
      { slug: "backpack", label: "Backpack", min_items: 1, max_items: 1 },
      { slug: "lunch_box", label: "Lunch box", min_items: 1, max_items: 1 },
      { slug: "water_bottle", label: "Water bottle", min_items: 1, max_items: 1 },
      { slug: "kid_pajamas", label: "Pajamas", min_items: 1, max_items: 2 },
      { slug: "hand_sanitizer", label: "Hand sanitizer", min_items: 1, max_items: 1 },
    ],
    status: "needs_review",
  },
  {
    id: "back_to_college",
    name: "Back to college (teens 16-19)",
    label: "Back to college",
    audience: ["teen", "young_adult"],
    categories: [
      { slug: "shampoo", label: "Shampoo", min_items: 1, max_items: 1 },
      { slug: "body_wash", label: "Body wash", min_items: 1, max_items: 1 },
      { slug: "deodorant", label: "Deodorant", min_items: 1, max_items: 1 },
      { slug: "laundry_detergent", label: "Laundry detergent", min_items: 1, max_items: 1 },
      { slug: "shower_caddy_items", label: "Shower caddy items", min_items: 2, max_items: 4 },
    ],
    status: "needs_review",
  },

  // ══════════════════════════════════════════════════════════════
  // NEEDS REVIEW — seasonal and travel
  // ══════════════════════════════════════════════════════════════
  {
    id: "beach_day",
    name: "Beach day",
    label: "Beach day",
    audience: ["family"],
    categories: [
      { slug: "mineral_sunscreen", label: "Mineral sunscreen", min_items: 1, max_items: 1 },
      { slug: "after_sun_lotion", label: "After-sun lotion", min_items: 1, max_items: 1 },
      { slug: "kid_swimwear", label: "Kid swimwear", min_items: 1, max_items: 1 },
      { slug: "beach_snacks", label: "Beach snacks", min_items: 2, max_items: 3 },
      { slug: "reusable_water_bottle", label: "Reusable water bottle", min_items: 1, max_items: 1 },
    ],
    status: "needs_review",
  },
  {
    id: "pool_day",
    name: "Pool day",
    label: "Pool day",
    audience: ["family"],
    categories: [
      { slug: "mineral_sunscreen", label: "Mineral sunscreen", min_items: 1, max_items: 1 },
      { slug: "swim_diaper", label: "Swim diaper", min_items: 1, max_items: 1 },
      { slug: "pool_snacks", label: "Pool snacks", min_items: 2, max_items: 3 },
      { slug: "swim_goggles", label: "Swim goggles", min_items: 1, max_items: 1 },
    ],
    status: "needs_review",
  },
  {
    id: "ski_trip",
    name: "Snow or ski trip",
    label: "Ski trip",
    audience: ["family"],
    categories: [
      { slug: "mineral_sunscreen_face", label: "Face sunscreen", min_items: 1, max_items: 1 },
      { slug: "lip_balm_spf", label: "Lip balm with SPF", min_items: 1, max_items: 1 },
      { slug: "wool_base_layer", label: "Wool base layer", min_items: 1, max_items: 2 },
      { slug: "hand_warmers", label: "Hand warmers", min_items: 1, max_items: 1 },
      { slug: "trail_snacks", label: "Trail snacks", min_items: 2, max_items: 3 },
    ],
    status: "needs_review",
  },
  {
    id: "road_trip_kids",
    name: "Road trip with kids",
    label: "Road trip with kids",
    audience: ["parent", "kid"],
    categories: [
      { slug: "car_snacks", label: "Car snacks", min_items: 3, max_items: 5 },
      { slug: "kid_water_bottle", label: "Kid water bottle", min_items: 1, max_items: 1 },
      { slug: "wet_wipes", label: "Wet wipes", min_items: 1, max_items: 1 },
      { slug: "ziplock_bags", label: "Ziplock or stash bags", min_items: 1, max_items: 1 },
      { slug: "motion_sickness", label: "Motion sickness aid", min_items: 1, max_items: 1 },
    ],
    status: "needs_review",
  },
  {
    id: "summer_cookout",
    name: "Summer cookout",
    label: "Summer cookout",
    audience: ["household"],
    categories: [
      { slug: "burger_beef", label: "Ground beef or patties", min_items: 1, max_items: 1 },
      { slug: "buns", label: "Buns", min_items: 1, max_items: 1 },
      { slug: "condiments", label: "Condiments", min_items: 2, max_items: 4 },
      { slug: "cookout_snacks", label: "Cookout snacks", min_items: 2, max_items: 3 },
      { slug: "drinks", label: "Drinks", min_items: 2, max_items: 4 },
    ],
    status: "needs_review",
  },
  {
    id: "holiday_baking",
    name: "Holiday baking",
    label: "Holiday baking",
    audience: ["household"],
    categories: [
      { slug: "flour", label: "Flour", min_items: 1, max_items: 1 },
      { slug: "butter", label: "Butter", min_items: 1, max_items: 1 },
      { slug: "sugar", label: "Sugar", min_items: 1, max_items: 1 },
      { slug: "chocolate_chips", label: "Chocolate chips", min_items: 1, max_items: 1 },
      { slug: "extracts", label: "Vanilla or extracts", min_items: 1, max_items: 1 },
    ],
    status: "needs_review",
  },
  {
    id: "halloween_candy",
    name: "Halloween candy season",
    label: "Halloween candy",
    audience: ["parent", "kid"],
    categories: [
      { slug: "trick_or_treat_candy", label: "Trick-or-treat candy", min_items: 1, max_items: 3 },
      { slug: "dye_free_candy", label: "Dye-free candy option", min_items: 1, max_items: 2 },
      { slug: "treat_alternative", label: "Non-candy treat alternative", min_items: 1, max_items: 2 },
    ],
    status: "needs_review",
  },
  {
    id: "allergy_season",
    name: "Allergy season",
    label: "Allergy season",
    audience: ["family"],
    categories: [
      { slug: "allergy_medicine", label: "Allergy medicine", min_items: 1, max_items: 1 },
      { slug: "saline_spray", label: "Saline spray", min_items: 1, max_items: 1 },
      { slug: "tissues", label: "Tissues", min_items: 1, max_items: 1 },
      { slug: "air_filter", label: "Air filter or purifier filter", min_items: 1, max_items: 1 },
    ],
    status: "needs_review",
  },

  // ══════════════════════════════════════════════════════════════
  // NEEDS REVIEW — household
  // ══════════════════════════════════════════════════════════════
  {
    id: "cleaning_weekend",
    name: "Cleaning weekend",
    label: "Cleaning weekend",
    audience: ["household"],
    categories: [
      { slug: "all_purpose_cleaner", label: "All-purpose cleaner", min_items: 1, max_items: 1 },
      { slug: "dish_soap", label: "Dish soap", min_items: 1, max_items: 1 },
      { slug: "glass_cleaner", label: "Glass cleaner", min_items: 1, max_items: 1 },
      { slug: "scrub_brushes", label: "Scrub brushes", min_items: 1, max_items: 2 },
      { slug: "trash_bags", label: "Trash bags", min_items: 1, max_items: 1 },
    ],
    status: "needs_review",
  },
  {
    id: "detox_bathroom",
    name: "Detox the bathroom",
    label: "Detox the bathroom",
    audience: ["household"],
    categories: [
      { slug: "shampoo", label: "Shampoo", min_items: 1, max_items: 1 },
      { slug: "conditioner", label: "Conditioner", min_items: 1, max_items: 1 },
      { slug: "body_wash", label: "Body wash", min_items: 1, max_items: 1 },
      { slug: "deodorant", label: "Deodorant", min_items: 1, max_items: 1 },
      { slug: "toothpaste", label: "Toothpaste", min_items: 1, max_items: 1 },
    ],
    status: "needs_review",
  },
  {
    id: "detox_laundry_room",
    name: "Detox the laundry room",
    label: "Detox the laundry room",
    audience: ["household"],
    categories: [
      { slug: "laundry_detergent", label: "Laundry detergent", min_items: 1, max_items: 1 },
      { slug: "stain_remover", label: "Stain remover", min_items: 1, max_items: 1 },
      { slug: "dryer_alternative", label: "Dryer balls or alternative", min_items: 1, max_items: 1 },
      { slug: "bleach_alternative", label: "Bleach alternative", min_items: 1, max_items: 1 },
    ],
    status: "needs_review",
  },
  {
    id: "sick_kid_kit",
    name: "Sick kid kit",
    label: "Sick kid kit",
    audience: ["parent", "kid"],
    categories: [
      { slug: "kid_pain_reliever", label: "Kid pain reliever", min_items: 1, max_items: 1 },
      { slug: "saline_drops", label: "Saline drops", min_items: 1, max_items: 1 },
      { slug: "fever_thermometer", label: "Thermometer", min_items: 1, max_items: 1 },
      { slug: "electrolytes", label: "Electrolyte drink", min_items: 1, max_items: 1 },
      { slug: "tissues", label: "Tissues", min_items: 1, max_items: 1 },
    ],
    status: "needs_review",
  },
  {
    id: "first_aid_refresh",
    name: "First aid kit refresh",
    label: "First aid kit refresh",
    audience: ["household"],
    categories: [
      { slug: "bandages", label: "Bandages", min_items: 1, max_items: 1 },
      { slug: "antiseptic", label: "Antiseptic spray or wipe", min_items: 1, max_items: 1 },
      { slug: "burn_cream", label: "Burn cream", min_items: 1, max_items: 1 },
      { slug: "ice_pack", label: "Ice pack", min_items: 1, max_items: 1 },
      { slug: "gauze", label: "Gauze and tape", min_items: 1, max_items: 1 },
    ],
    status: "needs_review",
  },
];

// ── Backward-compat adapter for backend/lists.js ──────────────
// The Lists API expects an object keyed by template id with a flat
// items: [strings] array. Derive that view from the live contexts
// only — needs_review entries are not yet templatized for the user.
const TEMPLATES = (() => {
  const out = {};
  for (const ctx of CONTEXTS) {
    if (ctx.status !== "live") continue;
    out[ctx.id] = {
      name: ctx.name,
      items: ctx.categories.map(c => c.label),
    };
  }
  return out;
})();

function findContext(id) {
  const k = String(id || "").toLowerCase();
  return CONTEXTS.find(c => c.id === k) || null;
}

function contextsByStatus(status) {
  return CONTEXTS.filter(c => c.status === status);
}

module.exports = {
  CONTEXTS,
  TEMPLATES,
  findContext,
  contextsByStatus,
};
