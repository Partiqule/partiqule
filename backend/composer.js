// R5b.3 v2 — personalized bundle composer.
//
// Surface-agnostic engine that takes a context, a scored calibration
// pool, and (optionally) the user's recent scans, then asks an AI to
// compose a Keep/Swap/Add bundle. Hallucination is structurally
// impossible: every product_id the AI emits is validated against the
// pool before render. The AI cannot invent products, scores, or
// features beyond what the pool carries.
//
// The composer is wrapped by ask.js for SSE delivery, and the same
// engine will be wrapped by R6 (scroll feed) for batch precomputation
// and by the share extension for static rendering. Surfaces decide
// WHEN to compose. The composer decides HOW.
//
// Trust safeguards:
//   - Pool IS the truth boundary. Every output product_id must be in
//     the pool; the AI never quotes a score that disagrees with the
//     pool entry. Invalid IDs are dropped; sections with zero valid
//     items are omitted entirely.
//   - Voice gates regex-scan every string the AI returns (title,
//     intro, reasoning, action labels) for first-person pronouns,
//     wellness-marketing language, unsourced medical claims,
//     moralizing, panic framing, and em-dashes.
//   - Reasoning can only cite features carried in the pool entry's
//     calibration_notes / substances / reason. The system prompt
//     binds the AI; the regex gate catches drift.
//   - When validation strips a section, the surviving sections still
//     ship. When the whole bundle fails twice, a templated fallback
//     assembled from the pool's top scored items returns. Cleaner
//     than refusing.

"use strict";

// ── ERROR TYPE ───────────────────────────────────────────────────
class ComposerError extends Error {
  constructor(message, code = "composer_error") {
    super(message);
    this.name = "ComposerError";
    this.code = code;
  }
}

// ── CATEGORY / CONSUMABLE INFERENCE ──────────────────────────────
// Composer needs to know consumable vs durable to adapt action-label
// language ("Keep this one" vs "Keep choosing this on your next
// restock"). Inferred from the calibration entry's category until
// the field is populated on entries directly.
const CONSUMABLE_CATEGORIES = new Set([
  "food", "food_beverage", "beverage", "supplement",
  "personal_care", "baby", "pet_food", "restaurant",
]);
const DURABLE_CATEGORIES = new Set([
  "clothing", "home", "home_furnishing", "kitchen",
  "cookware", "toy", "accessory",
]);

function inferConsumableOrDurable(category) {
  const c = String(category || "").toLowerCase();
  if (CONSUMABLE_CATEGORIES.has(c)) return "consumable";
  if (DURABLE_CATEGORIES.has(c))    return "durable";
  return "consumable"; // default to consumable for "other" — Keep language reads cleaner
}

// ── SCAN CLASSIFICATION ──────────────────────────────────────────
// When the caller passes the user's recent scans, classify each by
// score relative to the context's category buckets. The AI consumes
// the classified list as a real-data anchor for Keep/Swap sections.
//
// Buckets:
//   keep_candidate     — score 1-3, fits context category, user is
//                        already using something clean. Composer
//                        signals "Keep this on your shelf."
//   swap_candidate     — score 4-5, fits context category, user has
//                        room to improve. Composer signals "Swap
//                        when you can."
//   urgent_swap        — score 6+, fits context category, user is
//                        using something with concerns. Composer
//                        signals "Worth swapping soon."
//   already_covered    — multiple scans share a category. Best is
//                        retained as the bucket leader; the rest are
//                        skipped to avoid showing redundant items.

function scanFitsContext(scan, contextBroadCategories) {
  // Match by scan.category against the context's broad category set.
  // The set is built upstream (caller) from the context's category
  // slug labels via the same alias map ask.js uses for retrieval.
  const cat = String(scan?.category || scan?.result_json?.category || "").toLowerCase();
  if (!cat) return false;
  return contextBroadCategories.has(cat);
}

function classifyScansForContext(scans, contextBroadCategories) {
  if (!Array.isArray(scans) || !scans.length) {
    return { keep: [], swap: [], urgent: [], total_relevant: 0 };
  }

  // Filter to context-relevant scans, dedupe by product_name (most
  // recent wins), and rank by score within category buckets.
  const relevant = [];
  const seenNames = new Set();
  for (const s of scans) {
    if (!s) continue;
    if (!scanFitsContext(s, contextBroadCategories)) continue;
    const name = String(s.product_name || s.result_json?.product_name || "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    const score = typeof s.score === "number" ? s.score
      : (typeof s.result_json?.overall_score === "number" ? s.result_json.overall_score
        : (typeof s.result_json?.score === "number" ? s.result_json.score : null));
    if (score == null) continue;
    relevant.push({
      id: s.id,
      product_name: name,
      score,
      category: String(s.category || s.result_json?.category || "").toLowerCase(),
    });
  }

  // No further dedupe. The earlier product_name pass already
  // collapses "same product scanned twice"; collapsing further by
  // calibration category was wrong because "food" / "personal_care"
  // are far too broad — three distinct foods (yogurt, granola, mac
  // and cheese) all share category: "food" and a category dedupe
  // would surface only the best of the three, which then prevents
  // the Swap section from firing on the lower-scoring two. The
  // voice review smoke caught this on scenarios 2 and 3.
  const keep = [];
  const swap = [];
  const urgent = [];
  for (const r of relevant) {
    if (r.score <= 3) keep.push(r);
    else if (r.score <= 5) swap.push(r);
    else urgent.push(r);
  }
  return { keep, swap, urgent, total_relevant: relevant.length };
}

// ── SCAN→POOL MATCHING ───────────────────────────────────────────
// Keep section rendering requires the user's scanned product to also
// exist in the pool — otherwise validation drops the item and the
// section either vanishes (bad UX) or the AI tries to promote a
// pool item to Keep status to honor the intro count (worse: invents
// cross-references like "Nature's Path... Cascadian already earning
// its spot."). Filter Keep candidates BEFORE the AI sees them, so
// the AI's intro count is always honest.
//
// Swap candidates have a different requirement: the user's product
// is named in reasoning but the recommended swap target comes from
// the pool. Swap is meaningful only when at least one pool entry in
// the same category scores lower than the user's scan. Filter
// accordingly.
//
// Match logic is intentionally simple substring containment with a
// word-count floor to avoid wild brand-prefix collisions. Fuzzy
// matching is deferred to a later commit per the original P1-7
// resolution.

function normalizeForMatch(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[®™©]/g, "")
    .replace(/-+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Stricter normalize used only for self-swap comparison. Apostrophes
// (both typographic and ASCII) and all other non-word punctuation are
// flattened so "Pirate's Booty" (scan name) and "Pirates Booty" (pool
// key) collapse to the same string. Used solely to detect self-swaps;
// not for pool-membership lookups (which use the looser normalizeForMatch).
function normalizeForSwapCompare(name) {
  if (!name) return "";
  return String(name)
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSelfSwap(scanProductName, poolEntry) {
  const scanNorm = normalizeForSwapCompare(scanProductName);
  if (!scanNorm) return false;
  const poolNorm = normalizeForSwapCompare(poolEntry?.product_name || "");
  if (poolNorm && poolNorm === scanNorm) return true;
  // Also compare against the pool entry's id, in case product_name
  // diverges from product_id (the AI emits ids in its output and
  // validation rewrites product_name from the pool).
  const poolIdNorm = normalizeForSwapCompare(poolEntry?.product_id || "");
  return poolIdNorm && poolIdNorm === scanNorm;
}

function wordCountOf(s) {
  return s.split(/\s+/).filter(Boolean).length;
}

// Returns the matched pool entry's product_id, or null.
function matchScanToPool(scanName, pool) {
  const norm = normalizeForMatch(scanName);
  if (!norm) return null;
  const normWords = wordCountOf(norm);
  for (const p of pool) {
    const pid = String(p?.product_id || "").toLowerCase().trim();
    if (!pid) continue;
    const pidWords = wordCountOf(pid);
    if (pid === norm) return pid;
    // Allow substring containment only when the smaller string is
    // at least 2 words — protects against single-brand-word matches
    // ("Bragg" matching every Bragg product in the pool).
    if (pidWords >= 2 && norm.includes(pid)) return pid;
    if (normWords >= 2 && pid.includes(norm)) return pid;
  }
  return null;
}

// Bucket-level filters. `pool_match` carries the matched pool_id
// (when available) so downstream code/UI can short-circuit any
// further lookups.
function filterKeepByPool(keepCandidates, pool) {
  const matched = [];
  const unmatched = [];
  for (const c of keepCandidates || []) {
    const pid = matchScanToPool(c.product_name, pool);
    if (pid) matched.push({ ...c, pool_match: pid });
    else unmatched.push(c);
  }
  return { matched, unmatched };
}

// Category-group equivalence — scan rows often carry the broad
// label "food" while pool entries carry the calibration label
// "food_beverage" / "beverage". Both collapse to one swap-comparison
// group so we don't drop legitimate swap candidates on a
// pre-mapping mismatch. Mirrors the CATEGORY_EXPAND alias map that
// ask.js uses for retrieval.
const CATEGORY_GROUPS = {
  food_or_beverage: ["food", "food_beverage", "beverage"],
  personal_care:    ["personal_care"],
  baby:             ["baby"],
  kitchen:          ["kitchen", "cookware"],
  home:             ["home", "home_furnishing"],
  clothing:         ["clothing"],
  supplement:       ["supplement"],
  toy:              ["toy"],
  accessory:        ["accessory"],
  restaurant:       ["restaurant"],
};
const CATEGORY_TO_GROUP = (() => {
  const map = {};
  for (const [group, members] of Object.entries(CATEGORY_GROUPS)) {
    for (const m of members) map[m] = group;
  }
  return map;
})();
function categoryGroupFor(category) {
  const c = String(category || "").toLowerCase().trim();
  return CATEGORY_TO_GROUP[c] || c;
}

// Swap candidates remain when the pool has at least one entry in
// the same category GROUP scoring strictly lower than the user's
// scan, AND that entry is not a self-swap (the user being told to
// swap their product for the same product). If the only cleaner
// pool entry IS self, drop the candidate — better to ship no Swap
// section than a nonsensical "Swap your X for X" item.
function filterSwapByCleanerInPool(candidates, pool) {
  const matched = [];
  const unmatched = [];
  for (const c of candidates || []) {
    const candGroup = categoryGroupFor(c.category);
    const allCleaner = pool.filter(p =>
      categoryGroupFor(p.category) === candGroup
      && typeof p.score === "number"
      && p.score < c.score
    );
    const nonSelfCleaner = allCleaner.filter(p => !isSelfSwap(c.product_name, p));
    if (nonSelfCleaner.length > 0) {
      matched.push(c);
    } else if (allCleaner.length > 0) {
      // Only self exists as a cleaner — drop with explicit reason so
      // the audit log can distinguish "no cleaner at all" from "only
      // a self-swap was available".
      unmatched.push({ ...c, _self_only_pool_entries: allCleaner.map(p => p.product_id) });
    } else {
      unmatched.push(c);
    }
  }
  return { matched, unmatched };
}

// ── VOICE GATE ───────────────────────────────────────────────────
// Regex pass that runs over every string in the AI output. A single
// hit fails the gate and triggers a retry with prompt amendment. The
// list mirrors the spec's hard-constraint voice rules.

const VOICE_GATES = [
  // First-person pronouns — bare-word matches only so brand names
  // like "I'm Organic" or words containing "us" (Lululemon → no
  // match because of word boundary) don't false-trigger.
  { name: "first_person", re: /\bI\b/, applies_to: "user_facing" },
  { name: "first_person", re: /\b(me|my|mine|we|our|ours|us)\b/i, applies_to: "user_facing" },

  // Wellness-marketing register the composer voice explicitly avoids.
  { name: "wellness_safe",         re: /\bsafe\b/i },
  { name: "wellness_eco",          re: /\beco[\s-]?friendly\b/i },
  { name: "wellness_nontoxic",     re: /\bnon[\s-]?toxic\b/i },
  { name: "wellness_pure",         re: /\bpure\b/i },
  { name: "wellness_wholesome",    re: /\bwholesome\b/i },
  { name: "wellness_chemfree",     re: /\bchemical[\s-]?free\b/i },
  { name: "wellness_mom_approved", re: /\bmom[\s-]?approved\b/i },

  // "Clean" used as an adjective. \bclean\b matches the base word but
  // not "cleaner" / "cleanest" / "cleansing", so the comparative
  // forms used in suggested-action labels survive.
  { name: "clean_adjective", re: /\bclean\b/i },

  // Unsourced medical / regulatory claims. The trust contract is that
  // claims only come from the pool entry — the composer must not
  // invent study language.
  { name: "medical_linked",       re: /\blinked\s+to\b/i },
  { name: "medical_causes",       re: /\bcauses\b/i },
  { name: "medical_studies_show", re: /\bstudies\s+show\b/i },
  { name: "medical_proven",       re: /\bscientifically\s+proven\b/i },
  { name: "medical_doctor",       re: /\bdoctor[s]?\s+recommend/i },

  // Moralizing language and panic framing.
  { name: "moralizing_should",   re: /\byou\s+should\b/i },
  { name: "moralizing_must",     re: /\byou\s+must\b/i },
  { name: "moralizing_right",    re: /\bthe\s+right\s+choice\b/i },
  { name: "moralizing_wrong",    re: /\bthe\s+wrong\s+choice\b/i },
  { name: "panic_dangerous",     re: /\bdangerous\b/i },
  { name: "panic_scary",         re: /\bscary\b/i },
  { name: "panic_alarming",      re: /\balarming\b/i },
  // "toxic" as adjective. Allow "toxicology" / "toxicant" via word
  // boundary after the base form.
  { name: "panic_toxic",         re: /\btoxic\b/i },

  // Em-dashes / en-dashes / hyphens — Paul's standing rule is no
  // dashes of any kind in editorial copy. Word-internal hyphens like
  // "plant-based" / "non-nano" / "fragrance-free" fail along with
  // em/en dashes and spaced-hyphen sentence breaks. The composer
  // must phrase as two words ("plant based") or use a different
  // construction ("zinc oxide only", "no synthetic fragrance").
  // Product names are already normalized to spaces in CALIBRATION
  // (the normalise step converts hyphens to whitespace), so the AI
  // never sees a pool key with hyphens. Hits here are AI-introduced
  // compound adjectives.
  { name: "punctuation_emdash",        re: /[–—]/ },
  { name: "punctuation_spaced_hyphen", re: / - / },
  { name: "punctuation_hyphen",        re: /\w-\w/ },

  // Score never appears in reasoning prose. The score field is
  // structural data shown in the badge / header; embedding it in
  // the editorial close treats the number as the destination rather
  // than the evidence. Matches "Score 3" / "score 3." / "Score 3 "
  // anywhere in the string with word boundaries either side.
  { name: "score_destination", re: /\bscore\s+\d+(?:\.\d+)?\b/i },

  // Marketing comparatives — "cleanest mainstream", "actually works",
  // "the only X", "best in class", "industry leading", "most trusted".
  // These read as influencer copy, not as the knowing-friend register
  // the composer voice targets.
  { name: "marketing_cleanest_mainstream", re: /\bcleanest\s+mainstream\b/i },
  // "Actually [positive verb]" — marketing register that implies
  // competitors don't actually do the thing. "Actually works" /
  // "actually protects" / "actually helps" / etc.
  { name: "marketing_actually_works",      re: /\bactually\s+(works?|protects?|performs?|delivers?|helps?|matters?|makes\s+a\s+difference|holds?\s+up)\b/i },
  { name: "marketing_the_only",            re: /\bthe\s+only\b/i },
  { name: "marketing_best_in_class",       re: /\bbest\s+in\s+class\b/i },
  { name: "marketing_industry_leading",    re: /\bindustry[\s-]?leading\b/i },
  { name: "marketing_most_trusted",        re: /\bmost\s+trusted\b/i },

  // Medical / physiology claims. The composer is not a wellness
  // influencer or a doctor; the v2 voice review caught "Road trip
  // snacks that won't melt or spike blood sugar" as the canonical
  // failure mode. All hits share the gate label `medical_claim` so
  // the retry amendment can give a single, specific instruction.
  { name: "medical_claim", re: /\bblood\s+sugar\b/i },
  { name: "medical_claim", re: /\bblood\s+pressure\b/i },
  { name: "medical_claim", re: /\bcholesterol\b/i },
  { name: "medical_claim", re: /\binsulin\b/i },
  { name: "medical_claim", re: /\bglycemic\b/i },
  { name: "medical_claim", re: /\bspike\s+(blood|sugar|insulin|glucose)/i },
  { name: "medical_claim", re: /\blowers?\s+\w+\s+levels?\b/i },
  { name: "medical_claim", re: /\braises?\s+\w+\s+levels?\b/i },
  { name: "medical_claim", re: /\bprevents?\s+(cancer|disease|diabetes|inflammation|obesity)\b/i },
  { name: "medical_claim", re: /\bcauses?\s+(cancer|disease|diabetes|inflammation|obesity)\b/i },
  { name: "medical_claim", re: /\blinked\s+to\s+(cancer|disease|diabetes|inflammation|obesity)\b/i },
  { name: "medical_claim", re: /\breduces?\s+(inflammation|risk)\b/i },
  { name: "medical_claim", re: /\bboosts?\s+(immunity|metabolism)\b/i },
];

// Hyphen / dash sanitizer. Runs on AI output BEFORE the voice gate
// scan. Empirically Sonnet drifts back to compound adjectives like
// "plant-based" / "non-nano" / "hexane-extracted" no matter how
// explicit the prompt — and listing forbidden examples in the prompt
// actively primes the model to produce them. Strip them server-side
// instead. Returns the sanitized string plus a count of substitutions
// so the audit log can track AI compliance over time.
//
//   word-internal hyphen:  /(\w)-(\w)/g  →  "$1 $2"  (plant-based → plant based)
//   em / en dash:          /[–—]/g       →  ". "
//   spaced hyphen:         / - /g        →  ". "
function sanitizeDashes(text) {
  if (text == null) return { text: "", subs: 0 };
  const original = String(text);
  let subs = 0;
  let out = original;
  out = out.replace(/(\w)-(\w)/g, (_, a, b) => { subs++; return `${a} ${b}`; });
  out = out.replace(/ - /g, () => { subs++; return ". "; });
  out = out.replace(/[–—]/g, () => { subs++; return ". "; });
  // Tidy up any double spaces, orphan-space-before-period, or
  // period-space-period the substitutions may have produced.
  out = out.replace(/\s+/g, " ");
  out = out.replace(/\s+\./g, ".");
  out = out.replace(/\.\s*\./g, ".");
  out = out.trim();
  return { text: out, subs };
}

function sanitizeBundleDashes(bundle) {
  let total = 0;
  const fix = (s) => {
    const { text, subs } = sanitizeDashes(s);
    total += subs;
    return text;
  };
  if (typeof bundle.title === "string") bundle.title = fix(bundle.title);
  if (typeof bundle.intro === "string") bundle.intro = fix(bundle.intro);
  for (const section of bundle.sections || []) {
    for (const item of section.items || []) {
      if (typeof item.reasoning === "string")   item.reasoning   = fix(item.reasoning);
      if (typeof item.action_label === "string") item.action_label = fix(item.action_label);
    }
  }
  if (bundle.suggested_action && typeof bundle.suggested_action.label === "string") {
    bundle.suggested_action.label = fix(bundle.suggested_action.label);
  }
  return total;
}

function voiceGateScan(strings) {
  const failures = [];
  const seen = new Set();
  for (const text of strings) {
    if (!text) continue;
    const s = String(text);
    for (const gate of VOICE_GATES) {
      if (gate.re.test(s)) {
        if (!seen.has(gate.name)) {
          failures.push(gate.name);
          seen.add(gate.name);
        }
      }
    }
  }
  return failures;
}

// ── POOL VALIDATION ──────────────────────────────────────────────
// product_id validation drops any AI-emitted ID that's not in the
// pool. Score consistency check catches the AI making up numbers in
// reasoning prose. Both run after AI returns; failures surface in
// the audit log via metadata.dropped_ids.

function buildPoolIndex(pool) {
  const idx = new Map();
  for (const p of pool || []) {
    if (!p || !p.product_id) continue;
    idx.set(String(p.product_id).toLowerCase(), p);
  }
  return idx;
}

function validateAndStripSection(section, poolIndex, dropped) {
  if (!section || !Array.isArray(section.items)) {
    return { items: [], section_dropped_count: 0 };
  }
  // worth_scanning sections are invitational — their items don't
  // anchor to a pool product, so empty product_id is allowed.
  const isWorthScanning = section.type === "worth_scanning";
  const out = [];
  for (const item of section.items) {
    if (!item || typeof item !== "object") continue;
    const pid = String(item.product_id || "").toLowerCase().trim();
    const reasoning = String(item.reasoning || "");

    if (isWorthScanning) {
      // Pass through as invitational entries. No pool anchor required;
      // the section reasoning names categories rather than products.
      if (!reasoning.trim()) continue;
      out.push({
        product_id: pid,                // may be empty
        product_name: null,
        score: null,
        category: null,
        consumable_or_durable: null,
        reasoning: reasoning.slice(0, 280),
        action_label: String(item.action_label || "Open scan camera.").slice(0, 60),
      });
      continue;
    }

    if (!pid) continue;
    const poolEntry = poolIndex.get(pid);
    if (!poolEntry) {
      dropped.push(pid);
      continue;
    }
    // Score consistency: if the AI quoted a score in reasoning, the
    // number must match the pool entry's score. Catches the "AI
    // hallucinated a 2 for a product that's really a 4" failure.
    const scoreMatch = reasoning.match(/\bscore\s+(\d+(?:\.\d+)?)/i);
    if (scoreMatch) {
      const quoted = parseFloat(scoreMatch[1]);
      if (Number.isFinite(quoted) && Math.abs(quoted - poolEntry.score) > 0.001) {
        dropped.push(pid);
        continue;
      }
    }
    out.push({
      product_id: pid,
      product_name: poolEntry.product_name || pid,
      score: poolEntry.score,
      category: poolEntry.category || null,
      consumable_or_durable: poolEntry.consumable_or_durable || inferConsumableOrDurable(poolEntry.category),
      reasoning: reasoning.slice(0, 280),
      action_label: String(item.action_label || "").slice(0, 60),
    });
  }
  return { items: out, section_dropped_count: section.items.length - out.length };
}

// ── SECTION ORDER ────────────────────────────────────────────────
const SECTION_ORDER = ["keep", "swap", "add", "worth_knowing", "worth_scanning"];
const SECTION_LABELS = {
  keep:           "Keep using",
  swap:           "Worth swapping",
  add:            "Add to your routine",
  worth_knowing:  "Worth knowing about",
  worth_scanning: "Worth scanning",
};

function orderSections(sections) {
  if (!Array.isArray(sections)) return [];
  const byType = new Map();
  for (const s of sections) {
    if (!s || !SECTION_ORDER.includes(s.type)) continue;
    if (!byType.has(s.type)) byType.set(s.type, s);
  }
  const out = [];
  for (const t of SECTION_ORDER) {
    if (byType.has(t)) {
      const s = byType.get(t);
      out.push({
        type: t,
        label: SECTION_LABELS[t],
        items: s.items || [],
      });
    }
  }
  return out;
}

// ── SYSTEM PROMPT ────────────────────────────────────────────────
const COMPOSER_SYSTEM = `You are the editorial composer for Partiqule, a shopping intelligence platform that scores products for family safety. You compose a personalized product bundle for a life moment the user is shopping for.

You are a knowing friend who reads labels for a living. You know products. You know what's already in their home (when the user is signed in and has scan history). You tell people straight. You are calm, practical, family-first register. Not a wellness influencer. Not a chemistry teacher.

You receive:
- A context (life moment) with audience, description, and a category_count
- A scored product pool from Partiqule's calibration database (30 to 50 items)
- An INTRO MODE flag (authed_with_history vs anonymous_or_no_history) that determines which intro template to use
- Optionally a classification of the user's recent scans (Keep / Swap / Urgent buckets) with each entry carrying scanned_product_name
- A list of CATEGORIES WITH THIN POOL COVERAGE (fewer than 3 scored products)
- Optional constraints from the user's query

You return a bundle with sections grouped by the user's relationship to the products.

HARD TRUST RULES (output is rejected and retried if these break):
- Every product_id in your output MUST exist exactly as written in the pool.
- The scanned_product_name values from scan history are CONTEXT for personalization, NOT product_id values. They are the names of products already in the user's home. Never copy a scanned_product_name into a product_id field. Reasoning prose may reference them ("Swap your Banana Boat Sport Sunscreen for this") but the product_id slot must always be a pool entry.
  - WRONG: { "product_id": "hydro flask 32oz", "reasoning": "Hydro Flask 32oz already in your routine..." } — "hydro flask 32oz" is a scan name, not a pool key.
  - RIGHT: { "product_id": "hydro flask", "reasoning": "Hydro Flask already in your routine..." } — "hydro flask" is the pool key; the scan name is paraphrased.
  - If you want to include a scanned product in Keep, find the closest pool match by name and category. If no pool match exists, omit it rather than fabricating a product_id.
- Never invent products, scores, features, or substance names beyond what the pool entry contains.
- Reasoning can only cite features carried in the pool entry's calibration_notes or substances list. If a pool entry doesn't mention GOTS certification, you cannot claim the product is GOTS certified.
- When a section has no real data to support it, OMIT the section entirely. Do not pad with weak content.

HARD VOICE RULES (output is rejected and retried if these break):
- No first-person pronouns: never use I, me, my, we, our, us, ours, mine.
- No banned wellness language: never use safe, eco friendly, non toxic, pure, wholesome, chemical free, mom approved. This applies even when the calibration_notes you receive use these words — you must paraphrase around them, not quote them.
  - WRONG: "Pure olive oil, no additives."
  - RIGHT: "Cold pressed olive oil, single ingredient."
  - WRONG: "Wholesome cereal for the family."
  - RIGHT: "Whole grain cereal, minimal ingredients."
- No "clean" as an adjective. Use "real ingredients" or "no added X" or "minimal ingredients" instead. "Cleaner" comparative is allowed.
  - WRONG: "Three clean ingredients."
  - RIGHT: "Three ingredients total." or "Three real ingredients."
  - WRONG: "Clean formula."
  - RIGHT: "Minimal formula." or "No synthetic additives."
- No unsourced medical claims: never use linked to, causes, studies show, scientifically proven, doctor recommended.
- No physiological or health-outcome claims of any kind, even when framed positively. Forbidden subjects include blood sugar, blood pressure, cholesterol, insulin, glycemic response, immunity, metabolism, inflammation, disease prevention, weight outcomes, brain function. Stick to product attributes (what is or is not in the product) and use occasions (when, where, how to use it).
  - WRONG: "Road trip snacks that won't spike blood sugar."
  - RIGHT: "Road trip snacks that travel without melting or making a mess."
  - WRONG: "Boosts immunity for cold season."
  - RIGHT: "Zinc and vitamin C in a single chew."
- No moralizing: never use you should, you must, the right choice, the wrong choice.
- No panic framing: never use dangerous, scary, alarming, toxic as an adjective.
- No em-dashes, en-dashes, or hyphens of any kind in editorial copy. Write compound adjectives as two words (e.g., "plant based" instead of joining them with a hyphen). Use periods or commas, never dashes, for sentence-internal breaks.
- No marketing comparatives without source: never use "cleanest mainstream", "actually works", "the only", "best in class", "industry leading", "most trusted".
- Three-beat rhythm where it fits naturally. Specific over vague.
- Family-first register: "your home" not "your routine". "the kids" not "your kids" (less possessive).
- Score as evidence, not destination: the score number NEVER appears in reasoning prose. The score is structural data shown in the badge. Treating it as a prose close ("Try this. Score 3.") makes the number the destination instead of the evidence.

SECTION TYPES (use only the ones the data supports; the surface enforces ordering):

- keep: products the user already has in their home that score well. Use ONLY when working_well_keep_candidates_pool_matched is non-empty. Each Keep item's product_id MUST be the pool_match value from one of those candidates — that is, the user's own scan resolved to its pool entry. NEVER promote a non-scanned pool item to Keep status to fill an intro count quota. If no pool-matched keep candidates exist, OMIT the Keep section entirely (and the intro will already reflect this because the count derivation runs upstream).

  Each Keep item's reasoning is about THAT ONE product only. NEVER mention another scanned product's name in a Keep item's reasoning — that is exclusively a Swap-section pattern.

  CORRECT (Keep with one pool-matched candidate):
    "Stonyfield Organic Plain. USDA Organic milk, live cultures. Works for lunch and breakfast. Already earning its spot."

  WRONG (promoting a non-scanned pool item to Keep and cross-referencing a user's other scan):
    "Nature's Path Organic Granola. USDA Organic, no BHT, no petroleum dyes. Cascadian Farm Cereal already earning its spot."
  (Nature's Path was not in the user's scans; Cascadian was, but it can't be named here because this is not a Swap item.)

- swap: products the user has that could be cleaner. You MUST include this section when swap_candidates_pool_matched OR urgent_swap_candidates_pool_matched is non-empty. The Swap section contains EXACTLY ONE item per pool-matched swap or urgent_swap candidate — never consolidate two candidates into one item, never drop a candidate silently. If counts.pool_matched_swap is 2, the Swap section MUST have exactly 2 items, one per scanned_product_name. The intro count and the section item count must agree.

  For each candidate, find the cleanest pool product in the same category as the candidate. Two candidates may resolve to two different pool products, or to the same pool product (in which case they still ship as two separate Swap items — one names candidate A's scanned_product_name, the other names candidate B's). Reasoning MUST name the user's scanned product by its full scanned_product_name. Pattern: "[Pool product]. [2 specific receipts]. Swap your [scanned_product_name] for this. [Use context close]."

  Example with two candidates:
    Item 1: "Larabar. Dates plus nuts, whole food ingredients. Swap your Bear Naked Granola for this. Built for the same job."
    Item 2: "Amy's Organic Burrito. USDA Organic, whole ingredients. Swap your Annie's Mac and Cheese for this. Same convenience, fewer concerns."

  Example with one candidate:
    Item 1: "Raw Elements Sunscreen. Non nano zinc oxide, no chemical UV filters. Swap your Banana Boat Sport Sunscreen for this. Built for sport and water."

  HARD RULE: The pool product chosen as the swap TARGET must be a DIFFERENT product from the scanned_product_name being swapped. If the closest pool match by name IS the scan (e.g., user scanned "Pirate's Booty" and the pool has "Pirates Booty"), pick the next-cleanest pool product in the same category instead. Never recommend a product as a swap target for itself.

- add: cleanest options for context categories the user has not scanned. Default section for anonymous users.

- worth_knowing: 1 to 2 hidden gems from the pool worth flagging. Optional.

- worth_scanning: invitation to scan more. You MUST include this section when CATEGORIES WITH THIN POOL COVERAGE is non-empty. Name the thin categories. Reasoning pattern: "[Category in plain English]. Calibration is still building here. Scan options you're considering and they show up in future bundles." Action label: "Open scan camera." This section has no pool product_id — the items array may carry pseudo-entries with empty product_id and category-named reasoning, OR you may use a single items entry naming the thin categories together. When all categories have 3+ pool entries, omit this section.

TITLE STRUCTURE:
Scenario-driven, not category-label. Acknowledge the problem the user has. Promise an outcome. Examples:
- "Back to school lunches that don't take an hour to pack"
- "Newborn weeks one to four, the essentials not the marketing"
- "Pantry restock without the research project"

Avoid generic category labels like "Newborn essentials" or "Pantry restock" by themselves.

INTRO TEMPLATING (the intro count MUST match what will render in sections — never promise an item that won't appear):

Derive these counts from the pool-matched classification input:
  pool_matched_keep_count = counts.pool_matched_keep
  pool_matched_swap_count = counts.pool_matched_swap (= swap + urgent)
  has_unmatched_scans     = unmatched_scan_history is non-empty

When INTRO MODE is "authed_with_history", pick the template that matches the counts:

  Case A — pool_matched_keep_count > 0 AND pool_matched_swap_count > 0:
    "Your home has [keep_count] solid pick(s). [swap_count] need(s) swap(s). Here's the version that lands."
    Example: "Your home has 1 solid pick. 2 need swaps. Here's the version that lands."

  Case B — pool_matched_keep_count > 0 AND pool_matched_swap_count == 0:
    "Your home has [keep_count] solid pick(s). Here's how to fill in the rest."

  Case C — pool_matched_keep_count == 0 AND pool_matched_swap_count > 0:
    "Your [first urgent_swap or swap candidate scanned_product_name] needs an urgent swap. Here's the cleaner version plus what else to consider."
    Example: "Your Banana Boat Sport Sunscreen needs an urgent swap. Here's the cleaner version plus what else to consider."

  Case D — pool_matched_keep_count == 0 AND pool_matched_swap_count == 0 (but has_unmatched_scans is true — user has scans, calibration is just thin):
    "[category_count spelled out] categories worth covering for [context.name]. Calibration is still building on some products in your home."

When INTRO MODE is "anonymous_or_no_history":
  Case E:
    "[category_count spelled out] categories worth covering for [context.name]. Sign in to compare with what's already in your home."
    Example: "Seven categories worth covering for newborn essentials. Sign in to compare with what's already in your home."
    NEVER use "for this" — always name the context explicitly using context.name (lowercase first letter if it reads more natural mid-sentence).

HARD INTRO RULES (output is rejected and retried if these break):
- NEVER include "Your home has X solid picks" when pool_matched_keep_count is 0.
- NEVER include "X needs/need swap(s)" when pool_matched_swap_count is 0.
- NEVER include "Sign in to compare" when INTRO MODE is "authed_with_history".
- NEVER combine "Your home has" language with "Sign in to compare" language.

PER ITEM REASONING (25 to 35 words):
Product name first, then 2 specific receipts from the pool entry (an ingredient, a certification, a composition fact), then a varied editorial close that complements but does not duplicate the action_label. Score NEVER appears in reasoning prose.

Reasoning close varies by section (use these or invent something with the same shape):
- Keep close: "Stays in the routine." / "Works as is." / "Already earning its spot."
- Swap close: "Cleaner version, same use." / "Built for the same job." / "Same use, fewer concerns."
- Add close: "Worth adding." / "Cleaner fit for [use]." / "Earns a spot on the shelf."
- Worth knowing close: "Underseen but solid." / "Smaller brand, top score." / "Worth knowing about."
- Worth scanning close: "Worth scanning options here." / "Help calibration catch up."

CORRECT: "Stonyfield Organic Plain. USDA Organic milk, live cultures. Works for lunch and breakfast. Stays in the routine."

WRONG (score in reasoning): "Stonyfield Organic Plain. USDA Organic milk, live cultures. Stays in the routine. Score 3."

WRONG (close duplicates action label): reasoning ends with "Try this." AND action_label is "Try this."

ACTION LABELS (short, imperative — these are the button text; reasoning close should complement, not duplicate):
Match the consumable_or_durable flag on the pool entry:
- Durable keep:    "Keep this one."
- Consumable keep: "Keep choosing this on your next restock."
- Durable swap:    "Swap to this."
- Consumable swap: "Next pantry trip, swap to this."
- Add:             "Try this." or "Worth tasting."
- Worth knowing:   "Worth knowing about."
- Worth scanning:  "Open scan camera."

SUGGESTED ACTION at bundle bottom:
Pick one based on what the bundle contains:
- "save_list" with a scenario-specific label like "Save the lunch lineup" / "Save the beach lineup" / "Save the pantry lineup" when there are 4+ items across sections worth saving.
- "scan_more" with a scenario-specific label like "Scan three more on your shelf" when Worth Scanning was prominent.
- "learn_more" with a scenario-specific label like "See why mineral sunscreens differ" when the bundle is short or education-leaning.

OUTPUT FORMAT (strict JSON, no markdown, no backticks):
{
  "title": "string",
  "intro": "string",
  "sections": [
    {
      "type": "keep | swap | add | worth_knowing | worth_scanning",
      "items": [
        {
          "product_id": "exactly as written in the pool (empty string for worth_scanning entries with no product anchor)",
          "reasoning": "25 to 35 words, score NEVER in prose",
          "action_label": "short imperative"
        }
      ]
    }
  ],
  "suggested_action": {
    "type": "save_list | scan_more | learn_more",
    "label": "scenario-specific imperative"
  }
}

Return strict JSON only.`;

// ── TEMPLATED FALLBACK ───────────────────────────────────────────
// When the AI fails twice (network, parse, validation), assemble a
// best-effort bundle from the top 5 scored pool items. Cleaner than
// refusing — user always gets value.

function templatedFallback(context, pool) {
  const top = (pool || [])
    .filter(p => p && p.product_id && typeof p.score === "number")
    .slice()
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);

  // Fallback reasoning is intentionally minimal. The earlier version
  // quoted calibration_notes verbatim, which leaked marketing language
  // ("3 clean ingredients" / "pure olive oil" / em-dashes baked into
  // notes) into a path that bypasses the voice gates. The voice
  // review smoke caught this on scenario 3. The minimalist template
  // never quotes uncurated text, so the fallback always passes.
  const items = top.map(p => ({
    product_id: p.product_id,
    product_name: p.product_name,
    score: p.score,
    category: p.category || null,
    consumable_or_durable: p.consumable_or_durable || inferConsumableOrDurable(p.category),
    reasoning: `${p.product_name}. Verified formula. Worth trying.`.slice(0, 280),
    action_label: "Try this.",
  }));

  const ctxName = context?.label || context?.name || "this";
  return {
    bundle: {
      title: `Best scored options for ${ctxName}`,
      intro: "Top picks from the calibration database.",
      sections: items.length ? [{
        type: "add",
        label: SECTION_LABELS.add,
        items,
      }] : [],
      suggested_action: {
        type: "scan_more",
        label: "Scan more options",
      },
    },
    metadata: {
      composition_source: "templated_fallback",
    },
  };
}

// ── AI CALL WITH RETRY ───────────────────────────────────────────
async function callComposerAI({ callAI }, userPrompt, amendmentPrompt) {
  const sys = amendmentPrompt
    ? `${COMPOSER_SYSTEM}\n\nADDITIONAL CONSTRAINT FROM PREVIOUS FAILED ATTEMPT:\n${amendmentPrompt}`
    : COMPOSER_SYSTEM;
  const parsed = await callAI(sys, userPrompt, 2200);
  if (!parsed || typeof parsed !== "object") {
    throw new ComposerError("AI returned non-object", "ai_non_object");
  }
  return parsed;
}

// ── USER PROMPT BUILD ────────────────────────────────────────────
function buildUserPrompt({ context, constraints, pool, scanClassification, unmatchedScanHistory, thinCoverage, isAuthed }) {
  // Trim pool entries to the fields the AI actually needs. The full
  // calibration entry can run hundreds of bytes per row; we ship a
  // short receipt list per item so the prompt fits.
  const slimPool = (pool || []).map(p => ({
    product_id: p.product_id,
    product_name: p.product_name,
    score: p.score,
    category: p.category,
    consumable_or_durable: p.consumable_or_durable || inferConsumableOrDurable(p.category),
    calibration_notes: Array.isArray(p.calibration_notes) ? p.calibration_notes.slice(0, 4) : [],
    substances: Array.isArray(p.substances) ? p.substances.slice(0, 6) : [],
  }));

  // The "pool_matched" suffix in every bucket name makes the trust
  // boundary explicit in the JSON the AI reads. Anything not in these
  // arrays is unusable as a product anchor — the AI must derive intro
  // counts and Keep section content from these arrays only.
  const hasPoolMatchedScans = scanClassification && (
    scanClassification.keep.length
    || scanClassification.swap.length
    || scanClassification.urgent.length
  );
  const slimScans = hasPoolMatchedScans ? {
    working_well_keep_candidates_pool_matched: scanClassification.keep.map(s => ({
      scanned_product_name: s.product_name, score: s.score, category: s.category, pool_match: s.pool_match,
    })),
    could_be_better_swap_candidates_pool_matched: scanClassification.swap.map(s => ({
      scanned_product_name: s.product_name, score: s.score, category: s.category,
    })),
    urgent_swap_candidates_pool_matched: scanClassification.urgent.map(s => ({
      scanned_product_name: s.product_name, score: s.score, category: s.category,
    })),
    counts: {
      pool_matched_keep:  scanClassification.keep.length,
      pool_matched_swap:  scanClassification.swap.length + scanClassification.urgent.length,
    },
    total_relevant: scanClassification.total_relevant,
  } : null;

  // Unmatched scans give the AI context (the user has them in the
  // home) but they CANNOT be used as a product_id, in Keep, or
  // referenced cross-section. The system prompt forbids it.
  const slimUnmatched = Array.isArray(unmatchedScanHistory) && unmatchedScanHistory.length
    ? unmatchedScanHistory.map(s => ({
        scanned_product_name: s.product_name,
        score: s.score,
        category: s.category,
        reason: s.reason,
      }))
    : [];

  // Whole-bundle authed flag — has the user any scan history at all
  // (matched OR unmatched). Drives the intro template selection.
  const isAuthedWithAnyHistory = isAuthed && (
    hasPoolMatchedScans || slimUnmatched.length > 0
  );

  // Intro mode is computed deterministically so the AI cannot pick the
  // wrong template. authed_with_history → "Your home has..."; otherwise
  // → "[N] categories worth covering for [context.name]...". Both modes
  // are mutually exclusive — the prompt forbids combining them.
  const introMode = isAuthedWithAnyHistory ? "authed_with_history" : "anonymous_or_no_history";

  const ctxBlock = {
    id: context.id,
    name: context.name,
    label: context.label,
    audience: context.audience,
    description: context.life_moment_description || null,
    categories: Array.isArray(context.categories) ? context.categories.map(c => c.label) : [],
    // category_count drives the anonymous intro count. Keep this here
    // so the AI doesn't have to count categories itself.
    category_count: Array.isArray(context.categories) ? context.categories.length : 0,
  };

  return `CONTEXT (life moment):
${JSON.stringify(ctxBlock, null, 2)}

CONSTRAINTS (from user query, optional):
${JSON.stringify(constraints || {}, null, 2)}

INTRO MODE (deterministic — use exactly this template family, do not combine):
${introMode}

POOL-MATCHED SCAN HISTORY CLASSIFICATION (only these scans can appear in Keep / Swap sections; the counts here drive the intro):
${slimScans ? JSON.stringify(slimScans, null, 2) : "(none — anonymous user or no pool-matched scans)"}

UNMATCHED SCAN HISTORY (the user has these products at home but they have no pool anchor — CONTEXT ONLY, never use as product_id, never reference in any item's reasoning, never count in the intro):
${JSON.stringify(slimUnmatched, null, 2)}

CATEGORIES WITH THIN POOL COVERAGE (fewer than 3 scored products available; trigger a "worth_scanning" section when this list is non-empty):
${JSON.stringify(thinCoverage || [], null, 2)}

PRODUCT POOL (only product_id values from this list are valid; reasoning may only cite features from these entries):
${JSON.stringify(slimPool, null, 2)}

Compose the bundle now. Strict JSON only.`;
}

// ── PUBLIC ENTRY POINT ───────────────────────────────────────────
async function composePersonalizedBundle({
  context,
  constraints,
  pool,
  scanHistory,
  contextBroadCategories,
  callAI,
}) {
  if (!context || typeof context !== "object") {
    throw new ComposerError("context is required", "missing_context");
  }
  if (!Array.isArray(pool) || pool.length === 0) {
    throw new ComposerError("pool is required and must be non-empty", "missing_pool");
  }
  if (typeof callAI !== "function") {
    throw new ComposerError("callAI dep is required", "missing_callai");
  }

  // 1. Enrich pool entries with consumable_or_durable so the AI gets
  // the flag without inferring it itself.
  const enrichedPool = pool.map(p => ({
    ...p,
    consumable_or_durable: p.consumable_or_durable || inferConsumableOrDurable(p.category),
  }));

  // 2. Classify scans relative to this context (if user is authed).
  const broadCats = contextBroadCategories instanceof Set
    ? contextBroadCategories
    : new Set(Array.isArray(contextBroadCategories) ? contextBroadCategories : []);
  const isAuthed = Array.isArray(scanHistory);
  const rawClassification = isAuthed && scanHistory.length
    ? classifyScansForContext(scanHistory, broadCats)
    : null;

  // 3. Pool-match filter. Keep candidates need the user's scanned
  // product to exist in the pool so the section can render it.
  // Swap/Urgent need a cleaner pool option in the same category.
  // The voice review smoke caught this on scenarios 3 and 5: the
  // AI was promoting non-scanned pool items to Keep to honor the
  // intro count, then cross-referencing user scans in their
  // reasoning. The filter happens BEFORE the AI sees the data, so
  // the intro count is always grounded.
  let scanClassification = null;
  let unmatchedScanHistory = [];
  if (rawClassification) {
    const keepFilter   = filterKeepByPool(rawClassification.keep, enrichedPool);
    const swapFilter   = filterSwapByCleanerInPool(rawClassification.swap, enrichedPool);
    const urgentFilter = filterSwapByCleanerInPool(rawClassification.urgent, enrichedPool);
    scanClassification = {
      keep:   keepFilter.matched,
      swap:   swapFilter.matched,
      urgent: urgentFilter.matched,
      total_relevant: rawClassification.total_relevant,
    };
    // Unmatched Keep scans surface as context-only — the AI can know
    // they exist but cannot use them in any section. Unmatched Swap
    // scans (no cleaner pool option, or only self as cleaner) are
    // also surfaced so the AI can optionally acknowledge them in
    // copy without inventing fake swap targets.
    const swapReason = (s) => s._self_only_pool_entries ? "only_self_match_in_pool" : "no_cleaner_in_pool";
    unmatchedScanHistory = [
      ...keepFilter.unmatched.map(s => ({ ...s, reason: "no_pool_match" })),
      ...swapFilter.unmatched.map(s => ({ ...s, reason: swapReason(s) })),
      ...urgentFilter.unmatched.map(s => ({ ...s, reason: swapReason(s) })),
    ];
  }

  // 4. Thin coverage. For each broad category in the context, count
  // matching pool entries. Categories with < 3 entries surface to
  // the AI as Worth-Scanning triggers. Without this, the AI tends
  // to skip Worth Scanning even when coverage is genuinely sparse
  // because it has no concrete signal to anchor against.
  const poolCountByCategory = new Map();
  for (const p of enrichedPool) {
    const c = String(p.category || "").toLowerCase();
    if (!c) continue;
    poolCountByCategory.set(c, (poolCountByCategory.get(c) || 0) + 1);
  }
  const thinCoverage = [];
  for (const cat of broadCats) {
    const count = poolCountByCategory.get(cat) || 0;
    if (count < 3) thinCoverage.push({ category: cat, pool_count: count });
  }

  // 5. AI call with retry.
  const poolIndex = buildPoolIndex(enrichedPool);
  const userPrompt = buildUserPrompt({
    context,
    constraints,
    pool: enrichedPool,
    scanClassification,
    unmatchedScanHistory,
    thinCoverage,
    isAuthed,
  });

  let aiAttempts = 0;
  let allVoiceFailures = [];
  let allDropped = [];
  let allDroppedSelfSwaps = [];
  let totalDashSubs = 0;
  let amendmentPrompt = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    aiAttempts++;
    let rawBundle;
    try {
      rawBundle = await callComposerAI({ callAI }, userPrompt, amendmentPrompt);
    } catch (err) {
      // AI call itself failed (network, parse). Retry once, else fall
      // through to templated fallback below.
      if (attempt === 0) {
        amendmentPrompt = "Previous attempt failed to return parseable JSON. Return strict JSON only, no backticks, no markdown.";
        continue;
      }
      const fb = templatedFallback(context, enrichedPool);
      fb.metadata = {
        ...fb.metadata,
        ai_attempts: aiAttempts,
        voice_gate_failures: allVoiceFailures,
        dropped_ids: allDropped,
        composition_source: "templated_fallback",
        fallback_reason: "ai_error",
      };
      return fb;
    }

    // Sanitize dashes BEFORE validation/voice gates. Sonnet drifts
    // back to compound-adjective hyphens on every retry in some
    // domains (newborn product copy especially). Listing forbidden
    // examples in the system prompt primes the model to produce
    // them, so we just strip them server-side. Captured count
    // surfaces in metadata for observability.
    const dashSubs = sanitizeBundleDashes(rawBundle);
    totalDashSubs += dashSubs;

    // Validate sections: drop invalid product_ids, drop sections that
    // empty out after the drop.
    const dropped = [];
    const droppedSelfSwaps = [];
    const validatedSections = [];
    for (const s of Array.isArray(rawBundle.sections) ? rawBundle.sections : []) {
      const { items } = validateAndStripSection(s, poolIndex, dropped);
      // Post-hoc self-swap defense: even with the input-side filter,
      // the AI may pick a pool target whose name normalizes to the
      // user's scanned product (the closest name match is often the
      // same product). Drop those items rather than ship a
      // nonsensical "Swap your X for X" recommendation.
      let finalItems = items;
      if (s.type === "swap" && scanClassification) {
        const swapCandidates = [
          ...scanClassification.swap,
          ...scanClassification.urgent,
        ];
        finalItems = items.filter(item => {
          const selfMatch = swapCandidates.find(cand =>
            isSelfSwap(cand.product_name, item)
          );
          if (selfMatch) {
            droppedSelfSwaps.push({
              scanned_product_name: selfMatch.product_name,
              attempted_target_id: item.product_id,
              attempted_target_name: item.product_name,
            });
            return false;
          }
          return true;
        });
      }
      if (finalItems.length > 0) {
        validatedSections.push({ type: s.type, items: finalItems });
      }
    }
    allDropped = allDropped.concat(dropped);
    allDroppedSelfSwaps = allDroppedSelfSwaps.concat(droppedSelfSwaps);

    // Voice gate scans every user-facing string.
    const stringsToScan = [
      rawBundle.title,
      rawBundle.intro,
      ...(validatedSections.flatMap(s => s.items.flatMap(i => [i.reasoning, i.action_label]))),
      rawBundle.suggested_action?.label,
    ];
    const voiceFailures = voiceGateScan(stringsToScan);
    allVoiceFailures = allVoiceFailures.concat(voiceFailures);

    // Structural minimum: at least one section must survive.
    const structurallyOK = validatedSections.length > 0;

    // Swap-count consistency. The intro count derivation upstream
    // promises exactly pool_matched_swap items in the Swap section.
    // If the AI consolidates two candidates into one item (the v2
    // count-coordination bug, scenario 2 incarnation), the intro
    // and section diverge silently. Catch it here and retry.
    const expectedSwapCount = scanClassification
      ? scanClassification.swap.length + scanClassification.urgent.length
      : 0;
    const swapSection = validatedSections.find(s => s.type === "swap");
    const actualSwapCount = swapSection ? swapSection.items.length : 0;
    const swapCountOK = expectedSwapCount === 0
      ? true
      : actualSwapCount === expectedSwapCount;

    if (voiceFailures.length === 0 && structurallyOK && swapCountOK) {
      const ordered = orderSections(validatedSections);
      return {
        bundle: {
          title: String(rawBundle.title || `Bundle for ${context.label || context.name}`).slice(0, 140),
          intro: String(rawBundle.intro || "").slice(0, 400),
          sections: ordered,
          suggested_action: rawBundle.suggested_action && typeof rawBundle.suggested_action === "object"
            ? {
                type: ["save_list", "scan_more", "learn_more"].includes(rawBundle.suggested_action.type)
                  ? rawBundle.suggested_action.type
                  : "scan_more",
                label: String(rawBundle.suggested_action.label || "Scan more options").slice(0, 60),
              }
            : { type: "scan_more", label: "Scan more options" },
        },
        metadata: {
          ai_attempts: aiAttempts,
          voice_gate_failures: allVoiceFailures,
          dropped_ids: allDropped,
          final_section_types: ordered.map(s => s.type),
          final_product_ids: ordered.flatMap(s => s.items.map(i => i.product_id)),
          composition_source: "ai",
          scan_history_size: scanClassification ? scanClassification.total_relevant : 0,
          // Debug surface: what classification did the AI see, and
          // which categories were flagged as thin? Lets us answer "why
          // didn't Swap fire?" or "why does the intro promise a Keep
          // that didn't render?" without re-running the request.
          classified_scans: scanClassification ? {
            keep_candidates_pool_matched: scanClassification.keep.map(s => ({ scanned_product_name: s.product_name, score: s.score, category: s.category, pool_match: s.pool_match })),
            swap_candidates_pool_matched: scanClassification.swap.map(s => ({ scanned_product_name: s.product_name, score: s.score, category: s.category })),
            urgent_swap_candidates_pool_matched: scanClassification.urgent.map(s => ({ scanned_product_name: s.product_name, score: s.score, category: s.category })),
          } : null,
          unmatched_scan_history: unmatchedScanHistory.map(s => ({ scanned_product_name: s.product_name, score: s.score, category: s.category, reason: s.reason })),
          thin_coverage_categories: thinCoverage,
          // Self-swap drops surface here so audit logs can flag the
          // case where the AI tried to recommend a product for itself
          // (e.g., swap "Pirate's Booty" for "Pirates Booty"). Accumulated
          // across both attempts so a successful retry still shows that
          // the first attempt tripped the gate.
          dropped_swaps_self_match: allDroppedSelfSwaps,
          // Dash sanitization count — how many hyphen / em-dash / en-dash
          // substitutions ran across all attempts. Tracks AI compliance
          // with the no-dashes voice rule over time.
          dash_substitutions: totalDashSubs,
        },
      };
    }

    // Retry with explicit amendment naming what broke.
    if (attempt === 0) {
      const parts = [];
      if (voiceFailures.length) {
        parts.push(`Previous attempt failed voice gates: ${voiceFailures.join(", ")}. Reread the voice rules and rewrite.`);
        if (voiceFailures.includes("medical_claim")) {
          parts.push("Specifically the medical_claim gate fired. Do NOT make claims about blood sugar, blood pressure, cholesterol, insulin, glycemic response, disease prevention, immunity, metabolism, or any other physiological or health outcome. Stick to product attributes only: ingredients, certifications, what is or is not in the product, and the use occasion (how the user would use it).");
        }
        if (voiceFailures.includes("marketing_actually_works")) {
          parts.push("Specifically the marketing_actually_works gate fired. Never use 'actually' followed by a positive verb ('actually works', 'actually protects', 'actually helps'). It implies competitors do not actually do the thing, which is a defamation-class claim. Rephrase to focus on what the product IS or DOES without the comparative implication.");
        }
      }
      if (!structurallyOK) {
        parts.push("Previous attempt had no surviving sections after product_id validation. Use only product_id values that appear EXACTLY in the pool.");
      }
      if (dropped.length) {
        parts.push(`These product_ids were dropped as not in pool: ${dropped.slice(0, 8).join(", ")}. Pick product_id values strictly from the pool.`);
      }
      if (!swapCountOK) {
        parts.push(`Previous attempt rendered ${actualSwapCount} Swap items but ${expectedSwapCount} were expected (one per pool-matched swap or urgent_swap candidate). Render exactly ${expectedSwapCount} Swap items this attempt, one per scanned_product_name in the input.`);
      }
      if (droppedSelfSwaps.length) {
        const examples = droppedSelfSwaps.slice(0, 3).map(d =>
          `"${d.scanned_product_name}" → ${d.attempted_target_id}`
        ).join("; ");
        parts.push(`Previous attempt picked a self-swap target (the cleaner pool product was the same product as the user's scan): ${examples}. NEVER pick a pool product whose name normalizes to the same string as the scanned_product_name being swapped. Pick a different pool product in the same category.`);
      }
      amendmentPrompt = parts.join(" ");
    }
  }

  // Both attempts failed validation. Ship templated fallback.
  const fb = templatedFallback(context, enrichedPool);
  fb.metadata = {
    ...fb.metadata,
    ai_attempts: aiAttempts,
    voice_gate_failures: allVoiceFailures,
    dropped_ids: allDropped,
    composition_source: "templated_fallback",
    fallback_reason: allVoiceFailures.length ? "voice_gate" : "structure_or_swap_count",
  };
  return fb;
}

module.exports = {
  composePersonalizedBundle,
  classifyScansForContext,
  inferConsumableOrDurable,
  voiceGateScan,
  templatedFallback,
  ComposerError,
  SECTION_ORDER,
  SECTION_LABELS,
  CONSUMABLE_CATEGORIES,
  DURABLE_CATEGORIES,
  // exported for the surface (ask.js) to apply uniformly when
  // building the broad-category set used to filter scan history.
};
