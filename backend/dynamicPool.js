// backend/dynamicPool.js
//
// Phase 2b session 2 — buildDynamicPool consumes Pass 1's dynamic
// intent (decomposed_categories + dynamic_pool_spec) and produces a
// pool object the composer can consume without modification.
//
// Why a separate module: this is the Phase 2b answer to "Pass 1
// emitted decomposed_categories=['snacks','hydration'], now what?"
// The static `buildPool` in ask.js walks a templated context object;
// the dynamic path doesn't have a templated context, so it walks the
// calibration registry directly using per-slug substring patterns
// derived from the calibration coverage audit (session 1).
//
// Output shape (literal, matches Phase 2b session 2 spec):
//   {
//     contextId: 'dynamic',
//     audience: <from dynamic_pool_spec.audience>,
//     occasion: <from dynamic_pool_spec.occasion_proxy>,
//     items: [<candidate>, ...],  // flat array, composer-shaped
//     metadata: {
//       categories: <decomposed_categories>,
//       weights: <category_weights or null>,
//       per_slug_counts: { <slug>: <count>, ... },  // for audit/debug
//       empty_slugs: [<slug>, ...],                 // logged but skipped
//     },
//   }
//
// Returns null when the spec is malformed OR every slug returned zero
// items after filtering. Caller refuses with empty_dynamic_pool.

"use strict";

const { inferConsumableOrDurable } = require("./composer");

// ── Per-slug substring patterns ──────────────────────────────────
// Mirrors the calibration coverage audit's heuristic, with stricter
// regex than the audit's loose substring matching. Each slug has:
//   include: array of regexes — at least one must match the key
//   exclude: array of regexes — any match disqualifies the entry
//
// The exclude lists catch the false positives the audit flagged in
// the "Pool Builder Notes for Session 2" section:
//   - kitchen_basics matched pantene/smartypants/panera/pancake
//   - bedding matched dryer sheets
//   - pet_treats leaked from cat-food brand names
//
// Source of truth for the 15-slug vocabulary lives in:
//   - backend/ask.js Pass 1 prompt (DYNAMIC CONTEXT EXPANSION section)
//   - backend/ask.js VIABLE_DECOMPOSED_SLUGS (Pass 1 validator)
//   - docs/calibration_coverage_audit_phase2b.md
// Keep all three in sync.

const SLUG_PATTERNS = {
  baby_gifts: {
    include: [/\b(baby|infant|newborn|diaper|onesie|formula|teether|swaddle)\b/i],
    exclude: [/baby ?carrot/i], // "baby carrots" → produce, not gift
  },
  beverages: {
    include: [/\b(juice|soda|coffee|tea|kombucha|seltzer|sparkling|drink|beverage|cola)\b/i],
    exclude: [],
  },
  kitchen_basics: {
    include: [/\b(pan|skillet|spatula|cookware|knife|cutting ?board|pot|wok|saucepan|colander|whisk|tongs|peeler|grater)\b/i, /\bkitchen\b/i, /\bcooking\b/i, /\butensil/i],
    exclude: [/pantene/i, /smartypants/i, /panera/i, /pancake/i, /\bpandy\b/i, /\bpanda\b/i, /pampers/i, /panties/i],
  },
  snacks: {
    include: [/\b(snack|chip|cracker|cookie|pretzel|popcorn|granola|jerky|trail mix|fruit snack|gummies?)\b/i, /\b(bar|bars)\b/i],
    exclude: [/soap bar/i, /\bbar soap\b/i, /barbecue|barber|barre/i],
  },
  cleaning_supplies: {
    include: [/\b(cleaner|detergent|bleach|disinfectant|wipes?|laundry|all[\s-]?purpose|degreaser|stain remover)\b/i, /\bspray\b/i],
    exclude: [/sunscreen|bug spray|hair spray|cooking spray|body spray/i, /baby wipes?/i],
  },
  bathroom_essentials: {
    include: [/\b(toilet ?paper|toothpaste|deodorant|toothbrush|mouthwash|body ?wash|hand ?soap|tissues?|tampons?|pads?|liners?|razor|shave|antiperspirant|loofah|washcloth)\b/i, /\bshampoo\b/i, /\bconditioner\b/i],
    exclude: [/baby (shampoo|wash|wipe)/i, /diaper|infant/i, /salad dressing/i],
  },
  personal_care_kids: {
    include: [/\b(kid|kids|children'?s|child|toddler)\b/i, /\bbaby (shampoo|lotion|wash|wipe|cream|powder|oil|sunscreen)\b/i, /\binfant (cream|lotion|oil|sunscreen)\b/i],
    exclude: [/sour patch kids/i, /smartypants kids/i, /kids? menu/i, /happy kids/i],
  },
  hydration: {
    include: [/\b(gatorade|powerade|electrolyte|coconut water|smartwater|liquid death|hydrat|nuun|propel|liquid ?iv|pedialyte|ultima|skratch|prime hydration)\b/i, /\b(water bottle|sports drink)\b/i, /\b(spring|sparkling|alkaline|mineral) water\b/i],
    exclude: [/water resistant|water proof|toilet water|dishwasher|microwave|cookware|sunscreen|insect|wipes? water/i, /flower water/i],
  },
  supplements: {
    include: [/\b(vitamin|supplement|multivitamin|creatine|collagen|omega|fish oil|magnesium|melatonin|prenatal|probiotic|electrolyte|amino|bcaa|pre[\s-]?workout|protein powder|protein shake)\b/i],
    exclude: [/vitamin ?water/i],
  },
  party_beverages: {
    include: [/\b(lemonade|punch|kool ?aid|hawaiian punch|juice box|capri sun|juicy juice|hi[\s-]?c|hi c|fruit punch)\b/i],
    exclude: [],
  },
  sunscreen: {
    include: [/\b(sunscreen|sun ?block|sunblock|spf|sun lotion)\b/i],
    exclude: [],
  },
  pet_food: {
    include: [/\b(pet food|dog food|cat food|kibble|wet food|dry food|puppy food|kitten food|pet meal)\b/i],
    exclude: [/baby food/i, /fish food/i],
  },
  party_food: {
    include: [/\b(cake|cupcake|candy|frosting|icing|pop ?tart|chocolate|candies|sprinkles|fondant|marshmallow)\b/i, /\bcookie\b/i],
    exclude: [/baby cookies?/i],
  },
  household_gifts: {
    include: [/\b(candle|diffuser|throw|vase|frame|essential ?oil|incense|wax melt|reed diffuser|room spray)\b/i],
    exclude: [],
  },
  bedding: {
    include: [/\b(mattress|comforter|duvet|blanket|pillow|crib mattress|bed sheets?|fitted sheet|flat sheet|pillowcase|sheet set)\b/i],
    exclude: [/dryer sheets?/i, /fabric sheets?/i, /tissue sheets?/i, /baking sheets?/i],
  },
};

const VIABLE_AUDIENCE_VALUES = new Set([
  "family_with_kids", "family_adults_only", "kid_focused",
  "adult_focused", "infant_focused", "pet_focused",
]);

// ── Audience filter ─────────────────────────────────────────────
// Calibration entries don't carry an explicit audience tag. Inferred
// signal: presence of kidsFloor/kidsCeiling (entry was scored against
// child-developmental thresholds), entry.category === "baby", or
// keyword hits on adult-only consumption signals (alcohol, energy
// drinks, coffee for kid_focused audiences).
//
// Returns true if the entry passes the audience filter for the given
// dynamic_pool_spec.audience value. Permissive when audience is unset.

const ADULT_ONLY_RE = /\b(alcohol|wine|beer|whiskey|vodka|liquor|champagne|cider|spirits|martini|rum|gin|bourbon|tequila)\b/i;
const ADULT_CODED_RE = /\b(coffee|espresso|monster|red bull|rockstar|bang energy|energy drink|nicotine|chewing tobacco|cigarette)\b/i;
const KID_ONLY_RE = /\b(children'?s tylenol|children'?s motrin|flintstones vitamins|baby food|infant formula|baby formula|teether|onesie|swaddle|toddler bib)\b/i;
const PET_RE = /\b(pet|dog|cat|kibble|puppy|kitten)\b/i;

function passesAudienceFilter(key, entry, audience) {
  const k = String(key).toLowerCase();
  switch (audience) {
    case "kid_focused":
    case "infant_focused":
      if (ADULT_ONLY_RE.test(k)) return false;
      if (ADULT_CODED_RE.test(k)) return false;
      return true;
    case "family_with_kids":
      if (ADULT_ONLY_RE.test(k)) return false;
      return true;
    case "adult_focused":
    case "family_adults_only":
      if (KID_ONLY_RE.test(k)) return false;
      return true;
    case "pet_focused":
      return PET_RE.test(k);
    default:
      return true;
  }
}

// ── Inlined helpers (mirror ask.js shape) ───────────────────────
// These are intentionally duplicated from ask.js rather than imported
// to keep dynamicPool.js loadable without pulling the rest of ask.js
// into the module graph. Helpers are small and stable; keep in sync
// if the originals change behavior.

function effectiveScore(entry, intent) {
  if (intent && (intent.audience === "child" || intent.audience === "baby")) {
    if (typeof entry.kidsFloor === "number") return entry.kidsFloor;
  }
  return typeof entry.floor === "number" ? entry.floor : 5;
}

function toTitleCaseForDisplay(key) {
  return String(key)
    .split(" ")
    .map(w => (w.length <= 2 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

function buildCalibrationNotes(entry) {
  const notes = [];
  if (Array.isArray(entry.substances)) {
    for (const s of entry.substances.slice(0, 3)) {
      const t = String(s || "").trim();
      if (t) notes.push(t.slice(0, 120));
    }
  }
  if (typeof entry.reason === "string" && entry.reason.trim()) {
    const firstClause = entry.reason.split(/[.\n]/)[0].trim();
    if (firstClause) notes.push(firstClause.slice(0, 160));
  }
  return notes.slice(0, 4);
}

// ── Main entry ──────────────────────────────────────────────────

const PER_SLUG_CAP = 5;
const POOL_HARD_CAP = 50;

function buildDynamicPool({ intent, scanHistory: _scanHistory, calibration }) {
  // _scanHistory unused — composer reads scan history from its own arg.
  // Spec mentioned surfacing scans inside the pool, but the composer's
  // existing classifyScansForContext already handles user scans via the
  // separate scanHistory parameter; injecting them into the pool would
  // double-classify them.
  if (!intent || typeof intent !== "object") return null;
  const decomposed = intent.decomposed_categories;
  const spec = intent.dynamic_pool_spec;
  if (!Array.isArray(decomposed) || decomposed.length === 0) return null;
  if (!spec || typeof spec !== "object") return null;
  if (!VIABLE_AUDIENCE_VALUES.has(spec.audience)) return null;
  if (typeof spec.occasion_proxy !== "string" || !spec.occasion_proxy.trim()) return null;
  if (!calibration || typeof calibration.entries !== "function") return null;

  const weights = (spec.category_weights && typeof spec.category_weights === "object")
    ? spec.category_weights : {};

  const perSlugCounts = {};
  const emptySlugs = [];
  const collected = []; // flat array, post-dedupe
  const seenKeys = new Set();

  for (const slug of decomposed) {
    const patterns = SLUG_PATTERNS[slug];
    if (!patterns) {
      // Defensive — Pass 1's validator should reject non-vocabulary
      // slugs, but if one sneaks through, log and skip.
      console.warn(`[dynamicPool] unknown slug in decomposed_categories: ${slug}`);
      perSlugCounts[slug] = 0;
      emptySlugs.push(slug);
      continue;
    }

    const slugMatches = [];
    for (const [key, entry] of calibration.entries()) {
      if (!entry) continue;
      if (seenKeys.has(key)) continue;
      const k = String(key).toLowerCase();

      // Strict slug match: at least one include, no exclude.
      const includeHit = patterns.include.some(re => re.test(k));
      if (!includeHit) continue;
      const excludeHit = patterns.exclude.some(re => re.test(k));
      if (excludeHit) continue;

      // Audience filter — drop entries that don't fit the audience.
      if (!passesAudienceFilter(key, entry, spec.audience)) continue;

      slugMatches.push({ key, entry });
    }

    if (slugMatches.length === 0) {
      console.warn(`[dynamicPool] slug=${slug} matched zero entries after filters (audience=${spec.audience})`);
      perSlugCounts[slug] = 0;
      emptySlugs.push(slug);
      continue;
    }

    // Sort by score asc, take top PER_SLUG_CAP.
    slugMatches.sort((a, b) => effectiveScore(a.entry, intent) - effectiveScore(b.entry, intent));
    const top = slugMatches.slice(0, PER_SLUG_CAP);

    for (const { key, entry } of top) {
      seenKeys.add(key);
      const entryCat = entry.category && String(entry.category).toLowerCase();
      collected.push({
        product_id: key,
        product_name: toTitleCaseForDisplay(key),
        score: effectiveScore(entry, intent),
        category: entryCat || null,
        substances: Array.isArray(entry.substances) ? entry.substances.slice(0, 6) : [],
        calibration_notes: buildCalibrationNotes(entry),
        consumable_or_durable: inferConsumableOrDurable(entryCat),
        reason: typeof entry.reason === "string" ? entry.reason : "",
        confidence: entry.confidence || null,
        _slug: slug,
        _weight: typeof weights[slug] === "number" ? weights[slug] : 1.0,
      });
    }
    perSlugCounts[slug] = top.length;
  }

  if (collected.length === 0) {
    return null; // every slug missed; caller refuses with empty_dynamic_pool
  }

  // Final sort: score asc, with weight as tiebreaker (heavier weight
  // wins on equal scores). Cap at POOL_HARD_CAP.
  collected.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return (b._weight || 0) - (a._weight || 0);
  });
  const items = collected.slice(0, POOL_HARD_CAP);

  return {
    contextId: "dynamic",
    audience: spec.audience,
    occasion: spec.occasion_proxy,
    items,
    metadata: {
      categories: decomposed.slice(),
      weights: Object.keys(weights).length ? { ...weights } : null,
      per_slug_counts: perSlugCounts,
      empty_slugs: emptySlugs,
    },
  };
}

module.exports = {
  buildDynamicPool,
  // Exported for unit-style testing of the substring + audience
  // filters in isolation. Not consumed by ask.js.
  SLUG_PATTERNS,
  VIABLE_AUDIENCE_VALUES,
  passesAudienceFilter,
};
