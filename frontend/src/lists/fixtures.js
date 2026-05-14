// R3a list builder prototype — fake data only.
//
// FAKE_LISTS doubles as the schema spec for R3b. Three anchor shapes:
//   anchor === "scan"        — item linked to a prior scan row by scan_id
//   anchor === "calibration" — item linked to a calibration key directly
//   anchor === "name"        — item is just a typed product name, no score yet
//
// Each item carries enough display state to render without a fetch.
// Real backend rows will follow the same shape so the swap in R3c is mechanical.

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
        owned: true,
      },
      {
        id: "i2",
        anchor: "name",
        product_name_normalized: "kid yogurt squeeze pouch",
        note: "for school lunches",
      },
      {
        id: "i3",
        anchor: "calibration",
        calibration_key: "siggi_4pc_yogurt_pouch_kids",
        product_name: "Siggi's Kids Yogurt Pouch",
        category: "food",
        score: 3,
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
        owned: true,
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
// can demo the flow on a fresh session.
export const FAKE_RECENT_SCANS = [
  { product_name: "Skittles Original",      category: "food",          score: 8, scanned_at: "2026-05-13T16:20:00Z" },
  { product_name: "Liquid Death Mountain",  category: "beverage",      score: 1, scanned_at: "2026-05-13T11:05:00Z" },
  { product_name: "Tide Pods Original",     category: "cleaning",      score: 7, scanned_at: "2026-05-12T20:14:00Z" },
  { product_name: "Native Deodorant",       category: "personal_care", score: 4, scanned_at: "2026-05-12T08:30:00Z" },
  { product_name: "Honey Nut Cheerios",     category: "food",          score: 6, scanned_at: "2026-05-11T07:42:00Z" },
  { product_name: "Lululemon Align Pant",   category: "clothing",      score: 5, scanned_at: "2026-05-10T18:55:00Z" },
  { product_name: "Hipp Organic Apple",     category: "food",          score: 2, scanned_at: "2026-05-09T12:10:00Z" },
  { product_name: "Branch Basics Spray",    category: "cleaning",      score: 2, scanned_at: "2026-05-08T09:24:00Z" },
];
