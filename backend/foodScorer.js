// backend/foodScorer.js
// Deterministic food scoring engine that consumes the calibration table in
// backend/foodIngredients.js. Built in Phase 1 as parallel-mode shadow scorer
// alongside the existing scoring cascade — engine output is logged for
// comparison but not user-facing until Phase 2 promotion.
//
// NOVA classification deferred to Phase 2.
// The nova_typical field is present in calibration entries but not consumed
// by the current engine. Pure additive scoring from base_hazard_score with
// position weighting only. Future enhancement will layer NOVA tier into
// score adjustment.
//
// Architecture (Phase 1):
//   parseIngredientList(text) → [{name, position}]
//   matchCalibration(parsed)  → [{name, position, weight, entry}]  (Chunk 2)
//   computeHybridScore(matched) → {score, breakdown}                (Chunk 3)
//   buildExplanation(matched, breakdown) → structured array         (Chunk 4)
//   scoreFood({productName, category, ingredients}) → top-level     (Chunk 4)

// ── Position-weight curve (per docs/foodscorer-plan.md, mirrors personalCareScorer) ──
// Position 0  → 1.00
// Position 1  → 0.85
// Position 2  → 0.70
// Position 3  → 0.55
// Position 4  → 0.45
// Positions 5-7  → 0.30
// Positions 8-14 → 0.15
// Position 15+   → 0.05
function positionWeight(position) {
  if (position <= 0) return 1.00;
  if (position === 1) return 0.85;
  if (position === 2) return 0.70;
  if (position === 3) return 0.55;
  if (position === 4) return 0.45;
  if (position <= 7) return 0.30;
  if (position <= 14) return 0.15;
  return 0.05;
}

// ── Chunk 1: parseIngredientList ──────────────────────────────────
// Parse a raw ingredient-list string from a label into an ordered array of
// {name, position} pairs. Position is the segment index in the comma-split
// list; parenthetical contents inherit the outer segment's position so they
// do not get double-penalized for being nested.
//
// Handles:
//   • leading "ingredients:" / "contains:" prefix
//   • per-segment "less than X% of:" / "contains:" / leading "and " prefixes
//   • one-level parentheticals: "colors (red 40, yellow 5)" → outer "colors"
//     plus each inner name, all at the same position
//   • trailing percentages and periods stripped
//   • case-insensitive normalization (lowercased + trimmed)
//
// Does NOT handle (intentional Phase-1 scope):
//   • UK-style "milk and soy" (without comma) — splitting on bare "and" inside
//     a segment would break common compound names like "and natural flavors"
//   • nested parens (rare on food labels; if they appear, the outer level wins)
//   • semicolon-separated lists (rare; commas are the standard)
function parseIngredientList(text) {
  if (typeof text !== "string") return [];
  let s = text.trim();
  if (!s) return [];

  // Strip leading "ingredients:" / "contains:" prefix from whole string.
  s = s.replace(/^\s*(?:ingredients?|contains)\s*:\s*/i, "");

  // Walk character by character splitting at top-level commas (depth-aware
  // so commas inside parens stay inside their segment).
  const segments = [];
  let depth = 0;
  let buf = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      if (buf.trim()) segments.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) segments.push(buf);

  const cleanName = (n) =>
    n.replace(/\s+\d+(?:\.\d+)?%\s*$/, "")  // drop trailing percentage like "30%"
     .replace(/\.+$/, "")                     // drop trailing period(s)
     .trim()
     .toLowerCase();

  const result = [];
  segments.forEach((rawSegment, segIdx) => {
    let segText = rawSegment.trim();
    if (!segText) return;

    // Per-segment prefixes:
    //   "less than X% of:" — sub-list intro for ingredients under quantity disclosure
    //   "contains:"       — alternate intro that occasionally repeats mid-list
    //   "and "            — Oxford-comma trailing conjunction ("...salt, and pepper")
    segText = segText.replace(/^less than\s+[\d.]+\s*%\s*of\s*:?\s*/i, "");
    segText = segText.replace(/^contains?\s*:\s*/i, "");
    segText = segText.replace(/^and\s+/i, "");

    // Extract one level of parens. The outer name and each inner name share
    // the same position (Paul's design decision: parens-contents inherit the
    // outer position to avoid double-penalty for nesting).
    const parenMatch = segText.match(/^([^(]+?)\s*\(([^()]*)\)\s*$/);
    let outerName;
    let innerNames = [];
    if (parenMatch) {
      outerName = parenMatch[1];
      innerNames = parenMatch[2].split(",").map(s => s.trim()).filter(Boolean);
    } else {
      outerName = segText;
    }

    const cleanedOuter = cleanName(outerName);
    if (cleanedOuter) result.push({ name: cleanedOuter, position: segIdx });

    for (const inner of innerNames) {
      const cleanedInner = cleanName(inner);
      if (cleanedInner) result.push({ name: cleanedInner, position: segIdx });
    }
  });

  return result;
}

// ── Chunk 2: matchCalibration ─────────────────────────────────────
// Take parsed [{name, position}] from parseIngredientList and look each name
// up against the calibration table. Returns:
//
//   { matched:   [{name, position, weight, entry_key, entry}, ...],
//     unmatched: [name1, name2, ...] }
//
// Dedupe rule (per Paul's Refinement 1, 2026-05-05):
//   When multiple aliases of the same calibration entry appear in the parsed
//   array (e.g., "sodium benzoate" at pos 4 AND "potassium benzoate" at pos
//   11 — both alias the `benzoates` entry), the FIRST OCCURRENCE wins. The
//   first occurrence has the highest position weight (lowest position index)
//   because the parser walks the label in order. The second and later
//   occurrences are dropped silently — neither matched nor unmatched, since
//   the entry was already accounted for. This avoids double-counting a single
//   chemistry concern that happens to appear under multiple aliases.
//
// Normalization is delegated to lookupIngredient (case-insensitive equality
// on lowercased+trimmed input). parseIngredientList already lowercases via
// its cleanName helper, so input here is normalized; we still call
// lookupIngredient for direct callers that may pass un-normalized strings.
const { lookupIngredient } = require("./foodIngredients");

function matchCalibration(parsed) {
  const matched = [];
  const unmatched = [];
  const seenEntries = new Set();

  for (const item of parsed) {
    const result = lookupIngredient(item.name);
    if (!result) {
      unmatched.push(item.name);
      continue;
    }

    if (seenEntries.has(result.key)) {
      // Already matched this entry at an earlier (higher-weight) position.
      // Drop silently per dedupe rule — the first occurrence covers it.
      continue;
    }

    matched.push({
      name: item.name,
      position: item.position,
      weight: positionWeight(item.position),
      entry_key: result.key,
      entry: result.entry,
    });
    seenEntries.add(result.key);
  }

  return { matched, unmatched };
}

// ── Chunk 3: computeHybridScore ───────────────────────────────────
// Aggregate matched calibration entries into a single product score using the
// hybrid formula approved 2026-05-05:
//
//   weighted_average = sum(score × weight) / sum(weight)
//   max_individual   = max(score across all matched)
//   final            = max(weighted_average, max_individual - 1)
//   final            = clamp(final, 1, 9)
//   final            = Math.round(final)
//
// The hybrid floor (max - 1) prevents pure weighted averaging from being too
// lenient when a single high-concern ingredient sits at a low-weight position.
// Example: Red 3 (score 8) at position 12 (weight 0.15) plus sodium benzoate
// (score 5) at position 3 (weight 0.55) would weighted-average to 5.64 —
// dropping the Red 3 signal entirely. Max - 1 floor brings it back to 7,
// preserving the conservative signal that a known concerning substance is
// present even if at low concentration.
//
// Returns a breakdown object that Chunk 4 (buildExplanation) consumes to
// generate the human-readable explanation text. The calculation_notes field
// names which path won so the explanation can reference it.
function computeHybridScore(matched) {
  // Defensive: empty matched array returns null final. Top-level scoreFood
  // handles the insufficient_coverage case before this is called, but a
  // direct caller passing [] should get null rather than NaN.
  if (!Array.isArray(matched) || matched.length === 0) {
    return {
      final: null,
      weighted_average: null,
      max_individual: null,
      max_minus_one: null,
      calculation_notes: "no matches",
    };
  }

  let weightedSum = 0;
  let weightSum = 0;
  let maxIndividual = -Infinity;

  for (const m of matched) {
    const score = m.entry.base_hazard_score;
    weightedSum += score * m.weight;
    weightSum += m.weight;
    if (score > maxIndividual) maxIndividual = score;
  }

  const weightedAverage = weightSum > 0 ? weightedSum / weightSum : 0;
  const maxMinusOne = maxIndividual - 1;
  const rawFinal = Math.max(weightedAverage, maxMinusOne);
  const clamped = Math.max(1, Math.min(9, rawFinal));
  const final = Math.round(clamped);

  let calculationNotes;
  if (matched.length === 1) {
    calculationNotes = "single ingredient";
  } else if (weightedAverage >= maxMinusOne) {
    calculationNotes = "weighted average dominates";
  } else {
    calculationNotes = "max - 1 floor applied";
  }

  return {
    final,
    weighted_average: weightedAverage,
    max_individual: maxIndividual,
    max_minus_one: maxMinusOne,
    calculation_notes: calculationNotes,
  };
}

// ── Chunk 4: buildExplanation + scoreFood ─────────────────────────
// buildExplanation produces a structured array (one entry per matched
// ingredient) for the frontend to render. Decision 4: engine returns
// structure, frontend decides presentation. Each explanation entry includes
// the calibration entry's reasoning text and a contribution label that
// explains WHY this ingredient appears in the explanation.
//
// Contribution labels are derived from breakdown.calculation_notes:
//   "single ingredient"           → "sole calibrated ingredient"
//   "max - 1 floor applied"       → "drove score via max-1 floor" (for the
//                                   max-individual entry) or "secondary
//                                   contribution" (for others)
//   "weighted average dominates"  → "highest weighted contribution" (for the
//                                   entry with highest score × weight) or
//                                   "weighted contribution" (for others)
//
// Ties on the primary-contributor selection resolve to first occurrence,
// consistent with the dedupe rule's "first occurrence wins" pattern.

function buildExplanation(matched, breakdown) {
  if (!Array.isArray(matched) || matched.length === 0) return [];

  const notes = breakdown?.calculation_notes;
  let primaryEntryKey = null;

  if (notes === "single ingredient") {
    primaryEntryKey = matched[0].entry_key;
  } else if (notes === "max - 1 floor applied") {
    // Find the matched entry whose score is the max_individual. Ties
    // resolved by first occurrence (consistent with dedupe semantics).
    let maxScore = -Infinity;
    let maxIdx = -1;
    for (let i = 0; i < matched.length; i++) {
      const s = matched[i].entry.base_hazard_score;
      if (s > maxScore) {
        maxScore = s;
        maxIdx = i;
      }
    }
    primaryEntryKey = matched[maxIdx]?.entry_key;
  } else if (notes === "weighted average dominates") {
    // Find the matched entry with the highest score × weight contribution.
    // Ties resolved by first occurrence.
    let maxContribution = -Infinity;
    let maxIdx = -1;
    for (let i = 0; i < matched.length; i++) {
      const c = matched[i].entry.base_hazard_score * matched[i].weight;
      if (c > maxContribution) {
        maxContribution = c;
        maxIdx = i;
      }
    }
    primaryEntryKey = matched[maxIdx]?.entry_key;
  }

  return matched.map(m => {
    let contribution;
    if (notes === "single ingredient") {
      contribution = "sole calibrated ingredient";
    } else if (notes === "max - 1 floor applied") {
      contribution = m.entry_key === primaryEntryKey
        ? "drove score via max-1 floor"
        : "secondary contribution";
    } else if (notes === "weighted average dominates") {
      contribution = m.entry_key === primaryEntryKey
        ? "highest weighted contribution"
        : "weighted contribution";
    } else {
      contribution = "matched";
    }

    return {
      entry_key: m.entry_key,
      name: m.name,
      inci_name: m.entry.inci_name,
      position: m.position,
      weight: m.weight,
      score: m.entry.base_hazard_score,
      hazard_class: m.entry.hazard_class,
      contribution,
      reasoning: m.entry.reasoning,
    };
  });
}

// ── Top-level entry point ─────────────────────────────────────────
// Strips matched objects to a minimal shape for shadow logging — we don't
// want full entry data (reasoning paragraphs, citation arrays) in every log
// line.
function toMinimal(m) {
  return {
    name: m.name,
    position: m.position,
    weight: m.weight,
    entry_key: m.entry_key,
    score: m.entry?.base_hazard_score ?? null,
    hazard_class: m.entry?.hazard_class ?? null,
  };
}

// Decision 7: narrow scope to food/beverage categories. Other categories
// (personal_care, clothing, etc.) fall back to the existing scoring cascade
// because the calibration table targets food chemistry.
const FOOD_SCORER_CATEGORIES = new Set([
  "food", "beverage", "food_beverage",
  "snack", "cracker", "baked_good",
]);

// Coverage gate (Decision 5, revised 2026-05-05): engine runs if the sum of
// position weights across matched calibrated ingredients meets the W_MIN
// threshold. The original strict "top-3 positions" gate excluded dye-heavy
// candy/snack products (Skittles, M&M's) where the calibrated chemistry
// always sits at the end of the ingredient list. The position-weighted
// threshold captures "enough signal to score" without rewarding a single
// trace ingredient at low weight.
//
// W_MIN = 0.30 is equivalent to one ingredient at position 5-7 (single-color
// product) or two ingredients at higher positions. Skittles' 6 calibrated
// ingredients at position 7 (weight 0.30 each) sum to 1.80, well above
// threshold. A product with one calibrated ingredient at position 14
// (weight 0.15) doesn't pass.
const W_MIN = 0.30;

function scoreFood({ productName, category, ingredients } = {}) {
  const startTime = Date.now();

  if (!FOOD_SCORER_CATEGORIES.has(category)) {
    return {
      status: "out_of_scope",
      score: null,
      reason: `Category '${category}' not in engine scope`,
      engine_latency_ms: Date.now() - startTime,
    };
  }

  if (!ingredients || typeof ingredients !== "string") {
    return {
      status: "no_ingredients",
      score: null,
      engine_latency_ms: Date.now() - startTime,
    };
  }

  const parsed = parseIngredientList(ingredients);
  const { matched, unmatched } = matchCalibration(parsed);

  const totalWeight = matched.reduce((sum, m) => sum + m.weight, 0);
  if (matched.length === 0 || totalWeight < W_MIN) {
    return {
      status: "insufficient_coverage",
      score: null,
      matched_ingredients: matched.map(toMinimal),
      unmatched_ingredients: unmatched,
      reason: matched.length === 0
        ? "no calibrated ingredients"
        : `insufficient signal (total weight ${totalWeight.toFixed(2)} below threshold ${W_MIN})`,
      total_weight: totalWeight,
      engine_latency_ms: Date.now() - startTime,
    };
  }

  const breakdown = computeHybridScore(matched);
  const explanation = buildExplanation(matched, breakdown);

  return {
    status: "scored",
    score: breakdown.final,
    matched_ingredients: matched.map(toMinimal),
    unmatched_ingredients: unmatched,
    breakdown,
    explanation,
    // Shadow-log fields per Refinement 3 (2026-05-05). top_match_name is the
    // first-occurrence (= highest-position-weight) matched ingredient.
    top_match_name: matched[0]?.name ?? null,
    top_match_score: matched[0]?.entry?.base_hazard_score ?? null,
    matched_keys: matched.map(m => m.entry_key),
    engine_latency_ms: Date.now() - startTime,
  };
}

module.exports = {
  parseIngredientList,
  matchCalibration,
  computeHybridScore,
  buildExplanation,
  scoreFood,
  positionWeight,
};
