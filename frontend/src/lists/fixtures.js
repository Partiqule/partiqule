// R3a list builder prototype — fake data only.
//
// FAKE_LISTS doubles as the schema spec for R3b. Three anchor shapes:
//   anchor === "scan"        — item linked to a prior scan row by scan_id
//   anchor === "calibration" — item linked to a calibration key directly
//   anchor === "name"        — item is just a typed product name, no score yet
//
// Each item carries enough display state to render without a fetch.
// Real backend rows will follow the same shape so the swap in R3c is mechanical.
//
// Per-item fields beyond the three anchors:
//   score, kid_score    — overall + kids-mode score (scan / calibration only)
//   owned               — scan-anchored items only, toggle on the row
//   purchased           — checked off on a shopping run, sorts to bottom
//   note                — free-form one-liner ("for school lunches")
//   added_at            — when the item was added to the list (relative time
//                         render). Independent of created_at on the parent list
//                         and of scanned_at on the underlying scan.
//   flags               — substance/concern tags, lowercase snake_case. Drive
//                         the list-level aggregate flags row. Items the user
//                         hasn't scored yet (anchor "name") have no flags.

export const FAKE_LISTS = [
  {
    id: "list_1",
    name: "Target run",
    kind: "shopping",
    created_at: "2026-05-10T19:00:00Z",
    items: [
      {
        id: "i1",
        anchor: "scan",
        scan_id: "scn_1",
        product_name: "Hipp Organic Apple Sauce",
        category: "food",
        score: 2,
        kid_score: 2,
        owned: true,
        purchased: false,
        note: "Saturday morning batch",
        added_at: "2026-05-12T10:30:00Z",
        flags: [],
      },
      {
        id: "i2",
        anchor: "name",
        product_name_normalized: "kid yogurt squeeze pouch",
        note: "for school lunches",
        purchased: false,
        added_at: "2026-05-14T09:00:00Z",
        flags: [],
      },
      {
        id: "i3",
        anchor: "calibration",
        calibration_key: "siggi_4pc_yogurt_pouch_kids",
        product_name: "Siggi's Kids Yogurt Pouch",
        category: "food",
        score: 3,
        kid_score: 5,
        purchased: false,
        note: "Mike is allergic to dairy",
        added_at: "2026-05-08T08:15:00Z",
        flags: ["added_sugar"],
      },
    ],
  },
  {
    id: "list_2",
    name: "Bathroom restock",
    kind: "shopping",
    created_at: "2026-05-12T10:00:00Z",
    items: [
      {
        id: "i4",
        anchor: "scan",
        scan_id: "scn_2",
        product_name: "Native Deodorant Coconut and Vanilla",
        category: "personal_care",
        score: 4,
        kid_score: 7,
        owned: true,
        purchased: false,
        added_at: "2026-05-13T17:00:00Z",
        flags: ["fragrance"],
      },
    ],
  },
  {
    id: "list_3",
    name: "Pantry audit",
    kind: "routine",
    created_at: "2026-04-28T08:00:00Z",
    items: [],
  },
];

// Fallback recent scans used when the real history state is empty.
// Renders the "From recent scans" picker with believable rows so Sara
// can demo the flow on a fresh session. Carries flags so items added
// from this list bring their substance tags with them.
export const FAKE_RECENT_SCANS = [
  { product_name: "Skittles Original",      category: "food",          score: 8, kid_score: 9, scanned_at: "2026-05-13T16:20:00Z", flags: ["artificial_dye", "high_sugar"] },
  { product_name: "Liquid Death Mountain",  category: "beverage",      score: 1, kid_score: 1, scanned_at: "2026-05-13T11:05:00Z", flags: [] },
  { product_name: "Tide Pods Original",     category: "cleaning",      score: 7, kid_score: 9, scanned_at: "2026-05-12T20:14:00Z", flags: ["dye", "fragrance"] },
  { product_name: "Native Deodorant",       category: "personal_care", score: 4, kid_score: 7, scanned_at: "2026-05-12T08:30:00Z", flags: ["fragrance"] },
  { product_name: "Honey Nut Cheerios",     category: "food",          score: 6, kid_score: 8, scanned_at: "2026-05-11T07:42:00Z", flags: ["added_sugar"] },
  { product_name: "Lululemon Align Pant",   category: "clothing",      score: 5, kid_score: 5, scanned_at: "2026-05-10T18:55:00Z", flags: ["pfas"] },
  { product_name: "Hipp Organic Apple",     category: "food",          score: 2, kid_score: 2, scanned_at: "2026-05-09T12:10:00Z", flags: [] },
  { product_name: "Branch Basics Spray",    category: "cleaning",      score: 2, kid_score: 3, scanned_at: "2026-05-08T09:24:00Z", flags: [] },
];

// Plain-English labels for the aggregate flags row on the list detail
// view. Anything not in this map falls back to the snake_case key with
// underscores replaced by spaces — that keeps unknown flags readable.
export const FLAG_LABELS = {
  added_sugar:    "added sugar",
  high_sugar:     "high sugar",
  artificial_dye: "artificial dye",
  dye:            "dye",
  fragrance:      "fragrance",
  pfas:           "PFAS",
  parabens:       "parabens",
  phthalates:     "phthalates",
  sulfates:       "sulfates",
  bpa:            "BPA",
  vocs:           "VOCs",
};

// Quick-swap suggestions surfaced inline when an item's active-mode score
// (overall or kid depending on the list-level toggle) is 6 or higher AND
// the alternative is at least 2 points lower in the same mode. Keyed by
// product_name as it appears on the item row.
export const FAKE_ALTERNATIVES = {
  "Native Deodorant Coconut and Vanilla": {
    product_name: "Tom's of Maine Apricot Deodorant",
    category: "personal_care",
    score: 4,
    kid_score: 5,
    flags: [],
  },
  "Skittles Original": {
    product_name: "YumEarth Organic Fruit Snacks",
    category: "food",
    score: 4,
    kid_score: 5,
    flags: [],
  },
};

// Starter templates for the "+ New list" template picker. Each template
// produces a list named after the template, with anchor="name" items for
// every entry. Users can score items individually once the list is live.
export const TEMPLATES = [
  {
    id: "tpl_newborn",
    name: "Newborn essentials",
    blurb: "First six weeks at home.",
    items: ["Diapers", "Baby wash", "Nursing pads", "Swaddles", "Pacifiers", "Baby wipes", "Formula"],
  },
  {
    id: "tpl_vacation",
    name: "Family vacation",
    blurb: "Pack once. Cover the kids.",
    items: ["Sunscreen", "Bug spray", "Travel snacks", "Hand sanitizer", "Kid Tylenol", "First aid spray"],
  },
  {
    id: "tpl_lunches",
    name: "Back to school lunches",
    blurb: "What goes in the box.",
    items: ["Yogurt pouches", "Fruit pouches", "Granola bars", "Juice boxes", "Sandwich bread", "Deli turkey"],
  },
  {
    id: "tpl_pantry",
    name: "Pantry restock",
    blurb: "The staples you reach for.",
    items: ["Olive oil", "Pasta", "Canned tomatoes", "Rice", "Peanut butter", "Cereal"],
  },
];
