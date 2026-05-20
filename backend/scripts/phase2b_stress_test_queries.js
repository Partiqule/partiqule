// Phase 2b session 3 stress test query bank (Commit A).
//
// 53 queries balanced across five orthogonal axes. Each entry carries
// a tag on every axis so the post-run report can compute pass rate
// per audience / specificity / coverage / type slice independently.
//
// REBALANCED 2026-05-20: trimmed 15 (10 redundancy-driven + 5
// well-validated highly_specific from session 2/5.5 verification),
// added 13 directed queries from Paul (6 ambiguous, 6 out_of_vocab,
// 1 new cross_vocab), retagged 2 existing queries (kf04, kf06) as
// cross_vocab probes. Net: 55 - 15 + 13 = 53.
//
// AXIS DEFINITIONS:
//
// audience_tag — who the bundle is for. One of:
//   kid_focused | infant_focused | family_with_kids |
//   adult_focused | pet_focused | pregnancy_focused | knowledge
//
// occasion_tag — situational frame. One of:
//   travel | daily | gifting | hosting | null
//
// specificity — how much context the query carries up front:
//   highly_specific | medium_specific | ambiguous | very_vague
//
// coverage_expectation — does decomposed_categories map to the 15
// viable slugs from the calibration audit?
//   in_vocab        — all expected slugs are viable
//   out_of_vocab    — at least one expected slug is thin/empty
//   cross_vocab     — Pass 1 might emit a mix of viable + thin slugs;
//                     probe of vocabulary discipline
//
// query_type — Pass 1 type the query should classify as:
//   product_recommendation | knowledge | multi_category_context
//
// PRE-RUN EXPECTATIONS:
//   expected_decomposed_slugs — best-guess of Pass 1 output (null
//                               when expects_refinement is true)
//   expects_refinement        — whether Pass 1 should fire Pass 1.5
//   synthetic_answers         — answers the runner should submit on
//                               leg 2 (refinement_answer endpoint).
//                               Shape: { default: "first" } picks the
//                               first suggested_option per question.
//                               { questions: [{ match: regex, value }]}
//                               for per-question custom answers.
//   regression_anchor         — true for the 3 session 2 verified
//                               queries (summer camp, road trip,
//                               Disney). Failure on these signals
//                               regression rather than coverage gap.

"use strict";

const QUERIES = [
  // ─────────────────────────────────────────────────────────────
  // KID-FOCUSED (8 queries)
  // ─────────────────────────────────────────────────────────────
  {
    id: "kf01",
    query: "snacks for my picky 4 year old",
    audience_tag: "kid_focused", occasion_tag: "daily",
    specificity: "medium_specific", coverage_expectation: "in_vocab",
    query_type: "product_recommendation",
    expected_decomposed_slugs: ["snacks"],
    expects_refinement: false,
    notes: "single-slug product rec with age signal",
  },
  {
    id: "kf02",
    query: "sippy cup for my 18 month old",
    audience_tag: "kid_focused", occasion_tag: "daily",
    specificity: "highly_specific", coverage_expectation: "out_of_vocab",
    query_type: "product_recommendation",
    expected_decomposed_slugs: null,
    expects_refinement: false,
    notes: "no sippy_cup slug — probes Pass 1 behavior when category doesn't map; may route to product type instead of context",
  },
  {
    id: "kf03",
    query: "kids vitamins under 5",
    audience_tag: "kid_focused", occasion_tag: "daily",
    specificity: "medium_specific", coverage_expectation: "in_vocab",
    query_type: "product_recommendation",
    expected_decomposed_slugs: ["supplements", "personal_care_kids"],
    expects_refinement: false,
    notes: "supplements slug + audience filter test",
  },
  {
    id: "kf04",
    query: "summer camp essentials for my 9 year old",
    audience_tag: "kid_focused", occasion_tag: "travel",
    specificity: "highly_specific", coverage_expectation: "cross_vocab",
    query_type: "multi_category_context",
    expected_decomposed_slugs: ["sunscreen", "snacks", "hydration", "personal_care_kids"],
    expects_refinement: false,
    regression_anchor: true,
    notes: "REGRESSION ANCHOR (session 2 e2e). CROSS-VOCAB probe: Pass 1 might also emit bug_spray (thin) for summer camp context. Expected viable: sunscreen, snacks, hydration, personal_care_kids. Potentially thin leak: bug_spray.",
  },
  {
    id: "kf06",
    query: "kids birthday party for my 6 year old",
    audience_tag: "kid_focused", occasion_tag: "hosting",
    specificity: "medium_specific", coverage_expectation: "cross_vocab",
    query_type: "multi_category_context",
    expected_decomposed_slugs: ["party_food", "party_beverages", "snacks"],
    expects_refinement: false,
    notes: "CROSS-VOCAB probe: Pass 1 might also emit party_favors (thin, 2 entries) or gift_bags (thin, 1 entry) for kids birthday context. Expected viable: party_food, party_beverages, snacks. Potentially thin leak: party_favors, gift_bags.",
  },
  {
    id: "kf07",
    query: "lunch ideas for picky toddler",
    audience_tag: "kid_focused", occasion_tag: "daily",
    specificity: "ambiguous", coverage_expectation: "in_vocab",
    query_type: "product_recommendation",
    expected_decomposed_slugs: null,
    expects_refinement: true,
    synthetic_answers: { default: "first" },
    notes: "toddler age ambiguous (1-3 vs 3+); should fire refinement",
  },
  {
    id: "kf09",
    query: "after school snacks",
    audience_tag: "kid_focused", occasion_tag: "daily",
    specificity: "ambiguous", coverage_expectation: "in_vocab",
    query_type: "product_recommendation",
    expected_decomposed_slugs: null,
    expects_refinement: true,
    synthetic_answers: { default: "first" },
    notes: "audience implied (kid) but age unclear; should fire refinement",
  },
  {
    id: "kf10",
    query: "non toxic toys for toddler",
    audience_tag: "kid_focused", occasion_tag: "daily",
    specificity: "medium_specific", coverage_expectation: "out_of_vocab",
    query_type: "product_recommendation",
    expected_decomposed_slugs: null,
    expects_refinement: false,
    notes: "no toy slug in vocabulary; probes Pass 1 behavior when category genuinely missing",
  },

  // ─────────────────────────────────────────────────────────────
  // INFANT-FOCUSED (4 queries)
  // ─────────────────────────────────────────────────────────────
  {
    id: "if02",
    query: "diaper rash cream for sensitive baby",
    audience_tag: "infant_focused", occasion_tag: "daily",
    specificity: "highly_specific", coverage_expectation: "out_of_vocab",
    query_type: "product_recommendation",
    expected_decomposed_slugs: null,
    expects_refinement: false,
    notes: "no diaper_cream slug; specific product type — may route product, not context",
  },
  {
    id: "if03",
    query: "baby first foods at 6 months",
    audience_tag: "infant_focused", occasion_tag: "daily",
    specificity: "medium_specific", coverage_expectation: "in_vocab",
    query_type: "multi_category_context",
    expected_decomposed_slugs: ["snacks", "personal_care_kids"],
    expects_refinement: false,
    notes: "templated context (baby first foods) with age signal",
  },
  {
    id: "if04",
    query: "newborn essentials",
    audience_tag: "infant_focused", occasion_tag: "daily",
    specificity: "ambiguous", coverage_expectation: "in_vocab",
    query_type: "multi_category_context",
    expected_decomposed_slugs: null,
    expects_refinement: true,
    synthetic_answers: { default: "first" },
    notes: "session 5.5 verified: should fire refinement (audience unclear: expectant parent vs current parent vs gift)",
  },
  {
    id: "if05",
    query: "what to bring to the hospital for baby arrival",
    audience_tag: "infant_focused", occasion_tag: "travel",
    specificity: "medium_specific", coverage_expectation: "cross_vocab",
    query_type: "multi_category_context",
    expected_decomposed_slugs: ["baby_gifts", "personal_care_kids", "snacks"],
    expects_refinement: false,
    notes: "hospital bag — mixes baby gear + adult snacks; tests cross-vocab handling",
  },

  // ─────────────────────────────────────────────────────────────
  // FAMILY-WITH-KIDS (5 queries)
  // ─────────────────────────────────────────────────────────────
  {
    id: "fk01",
    query: "road trip snacks for adults only",
    audience_tag: "family_with_kids", occasion_tag: "travel",
    specificity: "highly_specific", coverage_expectation: "in_vocab",
    query_type: "multi_category_context",
    expected_decomposed_slugs: ["snacks", "hydration"],
    expects_refinement: false,
    regression_anchor: true,
    notes: "REGRESSION ANCHOR (session 5.5). Templated context with adults_only qualifier — should NOT decompose, should route templated path.",
  },
  {
    id: "fk02",
    query: "beach day for our family with two toddlers",
    audience_tag: "family_with_kids", occasion_tag: "travel",
    specificity: "highly_specific", coverage_expectation: "in_vocab",
    query_type: "multi_category_context",
    expected_decomposed_slugs: ["sunscreen", "snacks", "hydration"],
    expects_refinement: false,
    notes: "templated context (beach day) with audience signal",
  },
  {
    id: "fk05",
    query: "back to school lunches",
    audience_tag: "family_with_kids", occasion_tag: "daily",
    specificity: "ambiguous", coverage_expectation: "in_vocab",
    query_type: "multi_category_context",
    expected_decomposed_slugs: null,
    expects_refinement: true,
    synthetic_answers: { default: "first" },
    notes: "session 5.5 verified: ambiguous, should refine on age",
  },
  {
    id: "fk06",
    query: "halloween candy for the kids",
    audience_tag: "family_with_kids", occasion_tag: "hosting",
    specificity: "medium_specific", coverage_expectation: "in_vocab",
    query_type: "product_recommendation",
    expected_decomposed_slugs: ["party_food", "snacks"],
    expects_refinement: false,
    notes: "occasion-specific candy; audience implied family",
  },
  {
    id: "fk10",
    query: "summer party drinks for backyard bbq",
    audience_tag: "family_with_kids", occasion_tag: "hosting",
    specificity: "medium_specific", coverage_expectation: "in_vocab",
    query_type: "product_recommendation",
    expected_decomposed_slugs: ["party_beverages", "hydration"],
    expects_refinement: false,
    notes: "party_beverages adequate-coverage slug stress test",
  },

  // ─────────────────────────────────────────────────────────────
  // ADULT-FOCUSED (5 queries)
  // ─────────────────────────────────────────────────────────────
  {
    id: "af01",
    query: "first apartment essentials for me, moving in alone",
    audience_tag: "adult_focused", occasion_tag: "daily",
    specificity: "highly_specific", coverage_expectation: "in_vocab",
    query_type: "multi_category_context",
    expected_decomposed_slugs: ["cleaning_supplies", "bathroom_essentials", "kitchen_basics", "bedding"],
    expects_refinement: false,
    notes: "session 5.5 verified — 4-slug multi-category",
  },
  {
    id: "af03",
    query: "clean coffee setup for my morning routine",
    audience_tag: "adult_focused", occasion_tag: "daily",
    specificity: "medium_specific", coverage_expectation: "cross_vocab",
    query_type: "product_recommendation",
    expected_decomposed_slugs: ["beverages", "kitchen_basics"],
    expects_refinement: false,
    notes: "coffee partially in beverages; setup implies kitchen basics",
  },
  {
    id: "af04",
    query: "clean sunscreen for hiking, adult",
    audience_tag: "adult_focused", occasion_tag: "travel",
    specificity: "highly_specific", coverage_expectation: "in_vocab",
    query_type: "product_recommendation",
    expected_decomposed_slugs: ["sunscreen"],
    expects_refinement: false,
    notes: "single-slug sunscreen + adult audience",
  },
  {
    id: "af07",
    query: "morning routine basics for a single adult",
    audience_tag: "adult_focused", occasion_tag: "daily",
    specificity: "medium_specific", coverage_expectation: "in_vocab",
    query_type: "multi_category_context",
    expected_decomposed_slugs: ["bathroom_essentials", "supplements"],
    expects_refinement: false,
    notes: "routine framing; tests how broad 'basics' resolves",
  },
  {
    id: "af08",
    query: "skincare routine for sensitive adult skin",
    audience_tag: "adult_focused", occasion_tag: "daily",
    specificity: "medium_specific", coverage_expectation: "out_of_vocab",
    query_type: "product_recommendation",
    expected_decomposed_slugs: null,
    expects_refinement: false,
    notes: "no skincare slug; bathroom_essentials adjacent but lossy. Tests Pass 1 vocab fidelity.",
  },

  // ─────────────────────────────────────────────────────────────
  // PET-FOCUSED (4 queries — all probe coverage gaps)
  // ─────────────────────────────────────────────────────────────
  {
    id: "pt01",
    query: "treats for my dog with allergies",
    audience_tag: "pet_focused", occasion_tag: "daily",
    specificity: "highly_specific", coverage_expectation: "out_of_vocab",
    query_type: "product_recommendation",
    expected_decomposed_slugs: null,
    expects_refinement: false,
    notes: "pet_treats thin (3 entries); expects empty_dynamic_pool refuse OR fallback",
  },
  {
    id: "pt02",
    query: "cat food for sensitive stomach",
    audience_tag: "pet_focused", occasion_tag: "daily",
    specificity: "medium_specific", coverage_expectation: "in_vocab",
    query_type: "product_recommendation",
    expected_decomposed_slugs: ["pet_food"],
    expects_refinement: false,
    notes: "pet_food modest coverage (17 entries); should compose",
  },
  {
    id: "pt03",
    query: "non toxic pet shampoo for my dog",
    audience_tag: "pet_focused", occasion_tag: "daily",
    specificity: "medium_specific", coverage_expectation: "out_of_vocab",
    query_type: "product_recommendation",
    expected_decomposed_slugs: null,
    expects_refinement: false,
    notes: "pet_grooming nearly empty (1 entry); expects empty pool",
  },
  {
    id: "pt04",
    query: "starter kit for new puppy",
    audience_tag: "pet_focused", occasion_tag: "daily",
    specificity: "medium_specific", coverage_expectation: "out_of_vocab",
    query_type: "multi_category_context",
    expected_decomposed_slugs: null,
    expects_refinement: false,
    notes: "would need pet_food+pet_treats+pet_grooming+pet_toys — mostly empty; coverage gap probe",
  },

  // ─────────────────────────────────────────────────────────────
  // PREGNANCY-FOCUSED (3 queries)
  // ─────────────────────────────────────────────────────────────
  {
    id: "pg01",
    query: "clean sunscreen for pregnancy",
    audience_tag: "pregnancy_focused", occasion_tag: "daily",
    specificity: "highly_specific", coverage_expectation: "in_vocab",
    query_type: "product_recommendation",
    expected_decomposed_slugs: ["sunscreen"],
    expects_refinement: false,
    notes: "single-slug with pregnancy context",
  },
  {
    id: "pg02",
    query: "stretch mark cream for first trimester",
    audience_tag: "pregnancy_focused", occasion_tag: "daily",
    specificity: "highly_specific", coverage_expectation: "out_of_vocab",
    query_type: "product_recommendation",
    expected_decomposed_slugs: null,
    expects_refinement: false,
    notes: "no stretch_mark slug; tests fallback behavior",
  },
  {
    id: "pg03",
    query: "morning sickness snacks first trimester",
    audience_tag: "pregnancy_focused", occasion_tag: "daily",
    specificity: "medium_specific", coverage_expectation: "in_vocab",
    query_type: "product_recommendation",
    expected_decomposed_slugs: ["snacks"],
    expects_refinement: false,
    notes: "single-slug snacks + specific pregnancy stage",
  },

  // ─────────────────────────────────────────────────────────────
  // GIFTING (4 queries, audience varies)
  // ─────────────────────────────────────────────────────────────
  {
    id: "gf01",
    query: "baby shower gift for first time mom",
    audience_tag: "infant_focused", occasion_tag: "gifting",
    specificity: "medium_specific", coverage_expectation: "in_vocab",
    query_type: "product_recommendation",
    expected_decomposed_slugs: ["baby_gifts"],
    expects_refinement: false,
    notes: "single-slug baby_gifts; audience implied infant via 'baby'",
  },
  {
    id: "gf02",
    query: "housewarming gift for a new parent",
    audience_tag: "infant_focused", occasion_tag: "gifting",
    specificity: "medium_specific", coverage_expectation: "in_vocab",
    query_type: "multi_category_context",
    expected_decomposed_slugs: ["baby_gifts", "household_gifts"],
    expects_refinement: false,
    notes: "session 1 example — cross-slug gift framing",
  },
  {
    id: "gf03",
    query: "gift for my mother in law who likes clean beauty",
    audience_tag: "adult_focused", occasion_tag: "gifting",
    specificity: "medium_specific", coverage_expectation: "out_of_vocab",
    query_type: "product_recommendation",
    expected_decomposed_slugs: null,
    expects_refinement: false,
    notes: "no makeup/beauty slug; bathroom_essentials adjacent. Frontend EXAMPLE_QUERIES uses this exact text.",
  },
  {
    id: "gf05",
    query: "host gift for a holiday dinner party",
    audience_tag: "adult_focused", occasion_tag: "gifting",
    specificity: "medium_specific", coverage_expectation: "in_vocab",
    query_type: "product_recommendation",
    expected_decomposed_slugs: ["household_gifts", "party_food"],
    expects_refinement: false,
    notes: "two-slug gift + party context",
  },

  // ─────────────────────────────────────────────────────────────
  // KNOWLEDGE (3 queries — type=knowledge, not context)
  // ─────────────────────────────────────────────────────────────
  {
    id: "kn01",
    query: "what's wrong with parabens",
    audience_tag: "knowledge", occasion_tag: null,
    specificity: "highly_specific", coverage_expectation: "in_vocab",
    query_type: "knowledge",
    expected_decomposed_slugs: null,
    expects_refinement: false,
    notes: "knowledge route; should NOT touch buildDynamicPool",
  },
  {
    id: "kn02",
    query: "are phthalates dangerous",
    audience_tag: "knowledge", occasion_tag: null,
    specificity: "highly_specific", coverage_expectation: "in_vocab",
    query_type: "knowledge",
    expected_decomposed_slugs: null,
    expects_refinement: false,
    notes: "knowledge route; tests how Pass 1 disambiguates subject",
  },
  {
    id: "kn03",
    query: "is sucralose safe",
    audience_tag: "knowledge", occasion_tag: null,
    specificity: "highly_specific", coverage_expectation: "in_vocab",
    query_type: "knowledge",
    expected_decomposed_slugs: null,
    expects_refinement: false,
    notes: "knowledge route; production verified — knowledge_subject_not_live refuse",
  },

  // ─────────────────────────────────────────────────────────────
  // VAGUE / EDGE-CASE PROBES (4 queries — should mostly refine)
  // ─────────────────────────────────────────────────────────────
  {
    id: "vg01",
    query: "Disney trip",
    audience_tag: "family_with_kids", occasion_tag: "travel",
    specificity: "very_vague", coverage_expectation: "in_vocab",
    query_type: "multi_category_context",
    expected_decomposed_slugs: null,
    expects_refinement: true,
    synthetic_answers: { default: "first" },
    regression_anchor: true,
    notes: "REGRESSION ANCHOR (session 2 e2e Path A) — refined → leg 2 produces bundle via Pass 1 re-run",
  },
  {
    id: "vg02",
    query: "help",
    audience_tag: "knowledge", occasion_tag: null,
    specificity: "very_vague", coverage_expectation: "in_vocab",
    query_type: "knowledge",
    expected_decomposed_slugs: null,
    expects_refinement: true,
    notes: "single-word; should refuse-unclear or fire refinement — edge case",
  },
  {
    id: "vg03",
    query: "what should I buy",
    audience_tag: "knowledge", occasion_tag: null,
    specificity: "very_vague", coverage_expectation: "in_vocab",
    query_type: "knowledge",
    expected_decomposed_slugs: null,
    expects_refinement: true,
    notes: "no signal at all; should refuse or refine with broad clarifier",
  },
  {
    id: "vg05",
    query: "stuff for our weekend",
    audience_tag: "family_with_kids", occasion_tag: "travel",
    specificity: "very_vague", coverage_expectation: "in_vocab",
    query_type: "multi_category_context",
    expected_decomposed_slugs: null,
    expects_refinement: true,
    synthetic_answers: { default: "first" },
    notes: "vague weekend context; should refine on destination/audience",
  },

  // ─────────────────────────────────────────────────────────────
  // DIRECTED ADDITIONS (2026-05-20) — Paul's 13 new queries to
  // hit the spec distribution targets for ambiguous, out_of_vocab,
  // and cross_vocab probes.
  // ─────────────────────────────────────────────────────────────

  // ── 6 AMBIGUOUS (refinement-trigger probes) ──
  {
    id: "amb01",
    query: "sunscreen recommendations",
    audience_tag: "knowledge", occasion_tag: null,
    specificity: "ambiguous", coverage_expectation: "in_vocab",
    query_type: "multi_category_context",
    expected_decomposed_slugs: null,
    expects_refinement: true,
    synthetic_answers: {
      questions: [
        { match: /audience|who|for/i, value: "For kids" },
        { match: /type|mineral|chemical/i, value: "Mineral preferred" },
        { match: /use|frequency|when/i, value: "Daily use" },
      ],
      default: "first",
    },
    notes: "open-ended sunscreen ambiguity — should fire refinement on audience + type + use",
  },
  {
    id: "amb02",
    query: "snacks for the baby",
    audience_tag: "infant_focused", occasion_tag: "daily",
    specificity: "ambiguous", coverage_expectation: "in_vocab",
    query_type: "product_recommendation",
    expected_decomposed_slugs: null,
    expects_refinement: true,
    synthetic_answers: {
      questions: [
        { match: /age|old|months/i, value: "6 to 9 months" },
        { match: /allerg|sensitiv/i, value: "Avoiding common allergens" },
        { match: /texture|consist/i, value: "Soft textures" },
      ],
      default: "first",
    },
    notes: "baby age unspecified — should refine on age + dietary",
  },
  {
    id: "amb03",
    query: "vitamin gummies",
    audience_tag: "knowledge", occasion_tag: "daily",
    specificity: "ambiguous", coverage_expectation: "in_vocab",
    query_type: "product_recommendation",
    expected_decomposed_slugs: null,
    expects_refinement: true,
    synthetic_answers: {
      questions: [
        { match: /audience|who|for/i, value: "For kids 5+" },
        { match: /color|additive|ingredient/i, value: "No artificial colors" },
        { match: /type|purpose|why/i, value: "Daily multivitamin" },
      ],
      default: "first",
    },
    notes: "vitamin gummies — audience and purpose ambiguous; should refine",
  },
  {
    id: "amb04",
    query: "what should we get for the kids",
    audience_tag: "kid_focused", occasion_tag: null,
    specificity: "ambiguous", coverage_expectation: "in_vocab",
    query_type: "multi_category_context",
    expected_decomposed_slugs: null,
    expects_refinement: true,
    synthetic_answers: {
      questions: [
        { match: /age|old/i, value: "Ages 3 and 6" },
        { match: /categor|type|kind/i, value: "Snacks and gear" },
        { match: /occasion|when|use/i, value: "For weekend trips" },
      ],
      default: "first",
    },
    notes: "uses 'we' (parents) — should refine on age + category + occasion",
  },
  {
    id: "amb05",
    query: "diaper bag essentials",
    audience_tag: "infant_focused", occasion_tag: "daily",
    specificity: "ambiguous", coverage_expectation: "in_vocab",
    query_type: "multi_category_context",
    expected_decomposed_slugs: null,
    expects_refinement: true,
    synthetic_answers: {
      questions: [
        { match: /age|old|stage/i, value: "Newborn first month" },
        { match: /duration|hours|trip/i, value: "All day outings" },
        { match: /travel|portab/i, value: "Travel friendly" },
      ],
      default: "first",
    },
    notes: "diaper bag — baby age and use duration ambiguous; should refine",
  },
  {
    id: "amb06",
    query: "clean gift ideas",
    audience_tag: "knowledge", occasion_tag: "gifting",
    specificity: "ambiguous", coverage_expectation: "in_vocab",
    query_type: "multi_category_context",
    expected_decomposed_slugs: null,
    expects_refinement: true,
    synthetic_answers: {
      questions: [
        { match: /recipient|for whom|audience/i, value: "For a new mom" },
        { match: /budget|price|cost/i, value: "Under 50 dollars" },
        { match: /categor|type|kind/i, value: "Personal care focused" },
      ],
      default: "first",
    },
    notes: "vague gift query — should refine on recipient + budget + category",
  },

  // ── 6 OUT_OF_VOCAB (coverage-gap probes) ──
  {
    id: "oov01",
    query: "best bug spray for camping with kids",
    audience_tag: "family_with_kids", occasion_tag: "travel",
    specificity: "medium_specific", coverage_expectation: "out_of_vocab",
    query_type: "product_recommendation",
    expected_decomposed_slugs: null,
    expects_refinement: false,
    notes: "bug_spray thin (6 entries) — P1 backfill priority per audit. Pass 1 may emit bug_spray slug or refuse.",
  },
  {
    id: "oov02",
    query: "lip balm for sensitive skin",
    audience_tag: "adult_focused", occasion_tag: "daily",
    specificity: "medium_specific", coverage_expectation: "out_of_vocab",
    query_type: "product_recommendation",
    expected_decomposed_slugs: null,
    expects_refinement: false,
    notes: "lip_balm thin (5 entries) — P2 backfill per audit. Personal care adjacent.",
  },
  {
    id: "oov03",
    query: "treats for my picky dog",
    audience_tag: "pet_focused", occasion_tag: "daily",
    specificity: "medium_specific", coverage_expectation: "out_of_vocab",
    query_type: "product_recommendation",
    expected_decomposed_slugs: null,
    expects_refinement: false,
    notes: "pet_treats thin (3 entries) — P2 backfill per audit. Duplicates pt01 intent with different phrasing.",
  },
  {
    id: "oov04",
    query: "high protein snacks post workout",
    audience_tag: "adult_focused", occasion_tag: "daily",
    specificity: "medium_specific", coverage_expectation: "out_of_vocab",
    query_type: "product_recommendation",
    expected_decomposed_slugs: ["supplements"],
    expects_refinement: false,
    notes: "protein_snacks thin (5 entries) — P2 backfill. Pass 1 might substitute supplements (viable) for protein_snacks.",
  },
  {
    id: "oov05",
    query: "non toxic dog shampoo for sensitive skin",
    audience_tag: "pet_focused", occasion_tag: "daily",
    specificity: "medium_specific", coverage_expectation: "out_of_vocab",
    query_type: "product_recommendation",
    expected_decomposed_slugs: null,
    expects_refinement: false,
    notes: "pet_grooming nearly empty (1 entry) — P2 backfill. Should refuse empty_dynamic_pool.",
  },
  {
    id: "oov06",
    query: "natural rubber dog toys for puppies",
    audience_tag: "pet_focused", occasion_tag: "daily",
    specificity: "medium_specific", coverage_expectation: "out_of_vocab",
    query_type: "product_recommendation",
    expected_decomposed_slugs: null,
    expects_refinement: false,
    notes: "pet_toys empty (0 entries) — P2 backfill. Should refuse empty_dynamic_pool.",
  },

  // ── 1 CROSS_VOCAB (additional probe — kf04 and kf06 also tagged cross_vocab above) ──
  {
    id: "cv01",
    query: "post workout recovery essentials",
    audience_tag: "adult_focused", occasion_tag: "daily",
    specificity: "ambiguous", coverage_expectation: "cross_vocab",
    query_type: "multi_category_context",
    expected_decomposed_slugs: null,
    expects_refinement: true,
    synthetic_answers: {
      questions: [
        { match: /audience|who|for/i, value: "Adult" },
        { match: /focus|priority/i, value: "Hydration and protein" },
        { match: /workout|exercise|train/i, value: "Strength training" },
      ],
      default: "first",
    },
    notes: "CROSS-VOCAB probe: post-workout could decompose to supplements (viable) + protein_snacks (thin, 5 entries) + hydration (viable). Pass 1's vocabulary discipline test — does it stay viable or leak protein_snacks?",
  },
];

// Index counts for the report header.
function summarize(queries) {
  const byAudience = {};
  const byOccasion = {};
  const bySpecificity = {};
  const byCoverage = {};
  const byType = {};
  let regressionAnchors = 0;
  let expectsRefinement = 0;
  for (const q of queries) {
    byAudience[q.audience_tag] = (byAudience[q.audience_tag] || 0) + 1;
    const occKey = q.occasion_tag || "none";
    byOccasion[occKey] = (byOccasion[occKey] || 0) + 1;
    bySpecificity[q.specificity] = (bySpecificity[q.specificity] || 0) + 1;
    byCoverage[q.coverage_expectation] = (byCoverage[q.coverage_expectation] || 0) + 1;
    byType[q.query_type] = (byType[q.query_type] || 0) + 1;
    if (q.regression_anchor) regressionAnchors++;
    if (q.expects_refinement) expectsRefinement++;
  }
  return {
    total: queries.length,
    byAudience, byOccasion, bySpecificity, byCoverage, byType,
    regressionAnchors, expectsRefinement,
  };
}

module.exports = {
  QUERIES,
  summarize,
};

if (require.main === module) {
  const s = summarize(QUERIES);
  console.log(`Query bank: ${s.total} queries\n`);
  console.log("Audience distribution:");
  for (const [k, v] of Object.entries(s.byAudience)) console.log(`  ${k}: ${v}`);
  console.log("\nOccasion distribution:");
  for (const [k, v] of Object.entries(s.byOccasion)) console.log(`  ${k}: ${v}`);
  console.log("\nSpecificity distribution:");
  for (const [k, v] of Object.entries(s.bySpecificity)) console.log(`  ${k}: ${v}`);
  console.log("\nCoverage expectation distribution:");
  for (const [k, v] of Object.entries(s.byCoverage)) console.log(`  ${k}: ${v}`);
  console.log("\nQuery type distribution:");
  for (const [k, v] of Object.entries(s.byType)) console.log(`  ${k}: ${v}`);
  console.log(`\nRegression anchors: ${s.regressionAnchors}`);
  console.log(`Expects refinement: ${s.expectsRefinement}`);
}
