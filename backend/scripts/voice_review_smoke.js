#!/usr/bin/env node
// R5b.3 v2 voice review smoke.
//
// Runs the composer through 5 real bundles with live Sonnet calls and
// writes a markdown review file Paul + Sara can read aloud against the
// voice kit. Bypasses /ask entirely so this isolates the composition
// layer from the SSE / pool-retrieval / cache plumbing.
//
// Usage:
//   ANTHROPIC_API_KEY=... node backend/scripts/voice_review_smoke.js
//
// (CLAUDE_API_KEY also accepted for parity with the spec brief; the
// production code path uses ANTHROPIC_API_KEY.)
//
// Cost: ~$0.20–$0.40 across 5 contexts with potential retries.
// Runtime: 30–60s typical (composer 4–8s per bundle, +retries).
//
// Output: docs/voice_review_<ISO>.md — open it, read each bundle out
// loud, apply the checklist at the bottom. If any bundle fails, the
// fix is in the composer system prompt in backend/composer.js, not
// here.

"use strict";

const fs   = require("fs");
const path = require("path");

const {
  composePersonalizedBundle,
  inferConsumableOrDurable,
} = require("../composer");
const { CONTEXTS, findContext } = require("../contexts");
const { CALIBRATION } = require("../calibration");

const API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
if (!API_KEY) {
  console.error("ERROR: set ANTHROPIC_API_KEY (or CLAUDE_API_KEY) before running.");
  process.exit(1);
}

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const SONNET_MODEL  = "claude-sonnet-4-20250514";

// ── Live Sonnet call ──────────────────────────────────────────────
// Mirror the callClaudeSonnet helper from server.js so this script
// stays self-contained — no Express imports, no route side effects.
// Same model, same JSON extraction, same retry behavior.
async function callSonnet(system, userPrompt, maxTokens = 2200) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  const requestBody = {
    model: SONNET_MODEL,
    max_tokens: maxTokens,
    temperature: 0.4,
    system: [{ type: "text", text: system }],
    messages: [{ role: "user", content: userPrompt }],
  };

  try {
    const res = await fetch(ANTHROPIC_API, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": API_KEY,
      },
      body: JSON.stringify(requestBody),
    });
    clearTimeout(timeout);
    if (!res.ok) {
      // Capture the response body verbatim so the composer-side
      // catch can include it in its diagnostic log. Anthropic 4xx
      // responses carry the actual reason (auth, model not found,
      // overloaded) in the JSON body.
      const bodyText = await res.text().catch(() => "");
      const err = new Error(`Anthropic ${res.status}: ${bodyText}`);
      err.status = res.status;
      err.response_body = bodyText;
      throw err;
    }
    const data = await res.json();
    const text = data.content.map(b => b.text || "").join("").trim();
    // Tolerant JSON extraction: find the first { and the last } that bracket
    // valid JSON. Sonnet sometimes wraps with ```json fences despite the
    // strict-JSON-only directive.
    const first = text.indexOf("{");
    const last  = text.lastIndexOf("}");
    if (first === -1 || last === -1 || last <= first) {
      const err = new Error("No JSON object in Sonnet response");
      err.response_body = text.slice(0, 500);
      throw err;
    }
    return JSON.parse(text.slice(first, last + 1));
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

// ── Pool builder (replicated from ask.js) ─────────────────────────
// Mirrors backend/ask.js buildPool. The smoke script is review-only,
// so we accept the duplication instead of widening ask.js's exports.
// If ask.js diverges, sync this block to match — both pull from the
// same CALIBRATION map and CATEGORY_KEYWORDS / CATEGORY_EXPAND logic.

const CATEGORY_KEYWORDS = {
  sippy_cup:           [/\bsippy\b/, /\btoddler\s+(cup|bottle)/, /\btrainer\s+cup/],
  water_bottle:        [/\bwater\s+bottle/, /\bhydro\s*flask/, /\byeti/, /\bowala/, /\bkanteen/, /\bstanley/, /\bnalgene/],
  sunscreen:           [/\bsunscreen/, /\bspf\b/, /\bsunblock/, /\bmineral\s+sun/],
  laundry_detergent:   [/\blaundry/, /\btide\b/, /\bpersil/, /\bgain\b/],
  dish_soap:           [/\bdish\s+(soap|liquid)/, /\bdishwashing\s+liquid/],
  shampoo:             [/\bshampoo/],
  conditioner:         [/\bconditioner\b/],
  deodorant:           [/\bdeodorant/, /\bantiperspirant/],
  toothpaste:          [/\btoothpaste/],
  cleanser:            [/\bcleanser/, /\bface\s+wash/],
  moisturizer:         [/\bmoisturiz/, /\bface\s+cream\b/, /\bday\s+cream/],
  diaper:              [/\bdiaper/],
  diapers:             [/\bdiaper/],
  baby_wipes:          [/\bbaby\s+wipe/, /\bsensitive\s+wipe/],
  wet_wipes:           [/\bwipe/, /\bbaby\s+wipe/],
  baby_wash:           [/\bbaby\s+(wash|shampoo|soap)/, /\bbaby\s+bath/],
  baby_lotion:         [/\bbaby\s+(lotion|cream|oil)/],
  baby_food:           [/\bbaby\s+food/, /\bpouch/, /\bcereal/],
  pacifier:            [/\bpacifier/, /\bbinky/],
  pacifiers:           [/\bpacifier/],
  formula:             [/\bformula\b/],
  swaddles:            [/\bswaddle/, /\bblanket/],
  nursing_pads:        [/\bnursing/],
  prenatal_vitamin:    [/\bprenatal/],
  cereal:              [/\bcereal/, /\bcheerios|\bchex|\bgranola/],
  yogurt_pouch:        [/\byogurt/, /\bsiggi/, /\bstonyfield/],
  yogurt_pouches:      [/\byogurt/, /\bsiggi/, /\bstonyfield/],
  fruit_pouch:         [/\bfruit\s+pouch/, /\bpouch.*organic/],
  fruit_pouches:       [/\bfruit\s+pouch/, /\bpouch.*organic/],
  granola_bars:        [/\bgranola\s+bar/, /\bcliff/, /\bkind\s+bar/],
  juice_boxes:         [/\bjuice/, /\bcapri\s+sun/, /\bhonest\s+kids/],
  sandwich_bread:      [/\bbread/, /\bsandwich/],
  deli_turkey:         [/\bturkey/, /\bdeli/, /\bham\b/],
  snack:               [/\bsnack/, /\bcracker/, /\bchip/, /\bpretzel/, /\bgoldfish/, /\bcheez.?it/],
  travel_snacks:       [/\bsnack/, /\bcracker/, /\bchip/, /\bpretzel/, /\bbar\b/, /\btrail\s+mix/],
  bug_spray:           [/\bbug\s+spray/, /\bdeet/, /\binsect\s+repellent/, /\bpicaridin/],
  hand_sanitizer:      [/\bhand\s+sanitizer/, /\bpurell/, /\bsanitizer/],
  kid_tylenol:         [/\btylenol/, /\bacetaminophen/, /\bibuprofen/],
  first_aid_spray:     [/\bantisept/, /\bneosporin/, /\bband.?aid/],
  pajama:              [/\bpajama|\bpj\b|\bsleepwear/],
  legging:             [/\blegging/],
  cookware:            [/\bpan\b|\bskillet|\bcookware|\bdutch\s+oven|\bcast\s+iron|\bnonstick/],
  olive_oil:           [/\bolive\s+oil/],
  pasta:               [/\bpasta/, /\bspaghetti/, /\bpenne/, /\bmacaroni/],
  canned_tomatoes:     [/\btomato/, /\bsauce\b/],
  rice:                [/\brice/],
  peanut_butter:       [/\bpeanut\s+butter/, /\balmond\s+butter/, /\bnut\s+butter/],
  beverage:            [/\bjuice/, /\bsoda/, /\bdrink\b/, /\bwater\b/, /\bkombucha/],
};

const CATEGORY_EXPAND = {
  food:           ["food", "food_beverage", "beverage"],
  food_beverage:  ["food_beverage", "food", "beverage"],
  beverage:       ["beverage", "food_beverage"],
  cookware:       ["kitchen", "cookware"],
  kitchen:        ["kitchen", "cookware"],
  home:           ["home", "home_furnishing"],
  toys:           ["toy"],
  toy:            ["toy"],
  accessories:    ["accessory"],
  accessory:      ["accessory"],
  supplements:    ["supplement"],
  restaurants:    ["restaurant"],
  sunscreen:      ["personal_care"],
  shampoo:        ["personal_care"],
  conditioner:    ["personal_care"],
  deodorant:      ["personal_care"],
  toothpaste:     ["personal_care"],
  prenatal_vitamin: ["supplement"],
  diaper:         ["baby"],
  diapers:        ["baby"],
  baby_wash:      ["baby", "personal_care"],
  baby_wipes:     ["baby"],
  baby_lotion:    ["baby", "personal_care"],
  baby_food:      ["baby", "food_beverage", "food"],
  formula:        ["baby"],
  swaddles:       ["baby", "clothing"],
  pacifiers:      ["baby"],
  pacifier:       ["baby"],
  nursing_pads:   ["baby"],
  cereal:         ["food_beverage", "food"],
  yogurt_pouch:   ["food_beverage", "food"],
  yogurt_pouches: ["food_beverage", "food"],
  fruit_pouch:    ["food_beverage", "food"],
  fruit_pouches:  ["food_beverage", "food"],
  granola_bars:   ["food_beverage", "food"],
  juice_boxes:    ["beverage", "food_beverage"],
  sandwich_bread: ["food_beverage", "food"],
  deli_turkey:    ["food_beverage", "food"],
  snack:          ["food_beverage", "food"],
  travel_snacks:  ["food_beverage", "food"],
  olive_oil:      ["food_beverage", "food"],
  pasta:          ["food_beverage", "food"],
  canned_tomatoes:["food_beverage", "food"],
  rice:           ["food_beverage", "food"],
  peanut_butter:  ["food_beverage", "food"],
  water_bottle:   ["kitchen", "cookware"],
  bug_spray:      ["personal_care"],
  hand_sanitizer: ["personal_care"],
  kid_tylenol:    ["supplement"],
  first_aid_spray:["personal_care"],
};

function categoryPatterns(slug) {
  if (!slug) return [];
  const direct = CATEGORY_KEYWORDS[slug];
  if (direct) return direct;
  const words = String(slug).toLowerCase().split(/[_\s]+/).filter(Boolean);
  if (!words.length) return [];
  return [new RegExp(`\\b${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+")}\\b`)];
}

function expandCategorySlug(slug) {
  if (!slug) return [];
  return CATEGORY_EXPAND[slug] || [slug];
}

function effectiveScore(entry, intent) {
  if (intent.audience === "child" || intent.audience === "baby" || intent.audience === "newborn") {
    if (typeof entry.kidsFloor === "number") return entry.kidsFloor;
  }
  return typeof entry.floor === "number" ? entry.floor : 5;
}

function toTitleCaseForDisplay(key) {
  return String(key)
    .split(" ")
    .map(w => w.length <= 2 ? w : w.charAt(0).toUpperCase() + w.slice(1))
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

function buildPool(context, intent, cap = 50) {
  if (!context || !Array.isArray(context.categories)) return [];
  const seen = new Set();
  const candidates = [];
  for (const cat of context.categories) {
    const slug = String(cat.slug || "").toLowerCase().trim();
    if (!slug) continue;
    const patterns = categoryPatterns(slug);
    const acceptableCategories = expandCategorySlug(slug);
    for (const [key, entry] of CALIBRATION.entries()) {
      if (!entry) continue;
      if (seen.has(key)) continue;
      const familyHit = entry.product_family && entry.product_family === slug;
      const keyHit = !familyHit && patterns.length && patterns.some(p => p.test(key));
      const entryCat = entry.category && String(entry.category).toLowerCase();
      const categoryHit = !familyHit && !keyHit
        && entryCat && acceptableCategories.includes(entryCat);
      if (!familyHit && !keyHit && !categoryHit) continue;
      seen.add(key);
      candidates.push({
        product_id: key,
        product_name: toTitleCaseForDisplay(key),
        score: effectiveScore(entry, intent),
        category: entryCat || null,
        substances: Array.isArray(entry.substances) ? entry.substances.slice(0, 6) : [],
        calibration_notes: buildCalibrationNotes(entry),
        consumable_or_durable: inferConsumableOrDurable(entryCat),
        reason: typeof entry.reason === "string" ? entry.reason : "",
        confidence: entry.confidence || null,
      });
    }
  }
  candidates.sort((a, b) => a.score - b.score);
  return candidates.slice(0, cap);
}

function buildContextBroadCategories(context) {
  const out = new Set();
  if (!context || !Array.isArray(context.categories)) return out;
  for (const cat of context.categories) {
    const slug = String(cat.slug || "").toLowerCase().trim();
    if (!slug) continue;
    for (const c of expandCategorySlug(slug)) out.add(c);
  }
  const aud = Array.isArray(context.audience) ? context.audience.map(s => String(s).toLowerCase())
    : (typeof context.audience === "string" ? [context.audience.toLowerCase()] : []);
  if (aud.includes("newborn") || aud.includes("infant") || aud.includes("baby")) {
    out.add("baby"); out.add("personal_care"); out.add("food_beverage"); out.add("food");
  }
  if (aud.includes("pregnant")) {
    out.add("personal_care"); out.add("supplement"); out.add("baby");
  }
  return out;
}

// ── Scenarios ──────────────────────────────────────────────────────
// Two scenarios resolve real contexts from contexts.js. The other
// three either resolve a context or construct synthetic ones with
// realistic category slug arrays so the pool builder can do its work.

function fabricateScan(name, category, score, daysAgo) {
  return {
    id: `fake-${name.replace(/\s+/g, "-").toLowerCase()}`,
    product_name: name,
    category,
    score,
    scanned_at: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    result_json: { overall_score: score, category },
  };
}

const SCENARIOS = [
  {
    n: 1,
    label: "Newborn weeks one to four (anonymous)",
    contextResolver: () => findContext("tpl_newborn"),
    audience: "newborn",
    constraints: [],
    poolCap: 40,
    scanHistory: null,
  },
  {
    n: 2,
    label: "Back to school lunches (authed, mixed kid food scans)",
    contextResolver: () => findContext("tpl_lunches"),
    audience: "child",
    constraints: [],
    poolCap: 50,
    scanHistory: [
      fabricateScan("Stonyfield Organic Plain Yogurt", "food", 3, 14),
      fabricateScan("Bear Naked Granola", "food", 7, 7),
      fabricateScan("Annie's Mac and Cheese", "food", 4, 21),
      // Adult-coded scans intentionally mixed in to exercise the
      // context-fit rule. None of these should appear as Swap section
      // sources in a back-to-school lunches bundle. Composer should
      // either fold the pattern into anti_pattern at bundle level or
      // drop them silently from Swap.
      fabricateScan("Folgers Classic Roast Coffee", "food_beverage", 5, 10),
      fabricateScan("Diet Coke",                    "food_beverage", 7, 28),
      fabricateScan("Starbucks Via Italian Roast",  "food_beverage", 5, 35),
    ],
  },
  {
    n: 3,
    label: "Pantry restock (authed, varied pantry scans)",
    contextResolver: () => findContext("tpl_pantry"),
    audience: "adult",
    constraints: [],
    poolCap: 50,
    scanHistory: [
      fabricateScan("Cascadian Farm Cereal", "food", 3, 30),
      fabricateScan("Pirate's Booty", "food", 6, 14),
      fabricateScan("Bragg Apple Cider Vinegar", "food", 2, 45),
    ],
  },
  {
    n: 4,
    label: "Road trip (anonymous, sparse calibration)",
    contextResolver: () => ({
      id: "ctx_road_trip",
      name: "Road trip",
      label: "Road trip",
      audience: ["family"],
      life_moment_description: "Day or weekend road trip with kids",
      categories: [
        { slug: "snack",          label: "Snacks" },
        { slug: "travel_snacks",  label: "Travel snacks" },
        { slug: "beverage",       label: "Beverages" },
        { slug: "sunscreen",      label: "Sunscreen" },
        { slug: "wet_wipes",      label: "Wet wipes" },
        { slug: "hand_sanitizer", label: "Hand sanitizer" },
      ],
    }),
    audience: "adult",
    constraints: [],
    poolCap: 30,
    scanHistory: null,
  },
  {
    n: 5,
    label: "Beach day (authed, sunscreen and gear scan history)",
    contextResolver: () => ({
      id: "ctx_beach_day",
      name: "Beach day",
      label: "Beach day",
      audience: ["family", "child"],
      life_moment_description: "Family beach day with kids in summer",
      categories: [
        { slug: "sunscreen",     label: "Sunscreen" },
        { slug: "water_bottle",  label: "Water bottle" },
        { slug: "snack",         label: "Snacks" },
        { slug: "beverage",      label: "Beverages" },
      ],
    }),
    audience: "child",
    constraints: [],
    poolCap: 40,
    scanHistory: [
      fabricateScan("Banana Boat Sport Sunscreen", "personal_care", 7, 30),
      fabricateScan("Hydro Flask 32oz", "kitchen", 2, 60),
    ],
  },
];

// ── Run one scenario ──────────────────────────────────────────────
async function runScenario(s) {
  const context = s.contextResolver();
  if (!context) {
    return { scenario: s, error: `Context not found for scenario ${s.n}` };
  }
  const intent = { audience: s.audience, constraints: s.constraints };
  const pool = buildPool(context, intent, s.poolCap);
  const broadCats = buildContextBroadCategories(context);
  const scanHistory = s.scanHistory;

  if (pool.length === 0) {
    return {
      scenario: s, context,
      error: "Pool came back empty — broaden category slugs in the scenario or in CATEGORY_KEYWORDS.",
    };
  }

  const start = Date.now();
  let result, error = null;
  try {
    result = await composePersonalizedBundle({
      context,
      constraints: { audience: intent.audience, constraints: intent.constraints },
      pool,
      scanHistory,
      contextBroadCategories: broadCats,
      callAI: (sys, prompt, max) => callSonnet(sys, prompt, max),
    });
  } catch (e) {
    error = e.message;
  }
  const latencyMs = Date.now() - start;

  return {
    scenario: s,
    context,
    pool,
    scanHistory,
    result,
    error,
    latencyMs,
  };
}

// ── Markdown writer ───────────────────────────────────────────────
function renderScenarioMarkdown({ scenario, context, pool, scanHistory, result, error, latencyMs }) {
  const lines = [];
  lines.push(`## Scenario ${scenario.n}: ${scenario.label}`);
  lines.push("");
  const authState = scanHistory ? "authed" : "anonymous";
  const histCount = scanHistory ? `${scanHistory.length} items` : "none";
  lines.push(`**Inputs:** ${authState}, pool size ${pool ? pool.length : 0}, scan history ${histCount}`);
  if (context) {
    lines.push(`**Context resolved:** \`${context.id}\` — ${context.name}`);
  }
  lines.push("");

  if (error) {
    lines.push(`> **ERROR:** ${error}`);
    lines.push("");
    lines.push("---");
    lines.push("");
    return lines.join("\n");
  }

  const b = result.bundle;
  lines.push(`**Title:** ${b.title}`);
  lines.push("");
  lines.push(`**Intro:** ${b.intro}`);
  lines.push("");

  // Narrative-wrapper bundle-level anti_pattern callout. Renders
  // between intro and the first section so it frames the bundle.
  if (b.anti_pattern && b.anti_pattern.headline) {
    lines.push(`> **Anti-pattern:** ${b.anti_pattern.headline}`);
    lines.push(`> ${b.anti_pattern.reasoning || ""}`);
    lines.push("");
  }

  for (const section of b.sections || []) {
    const count = Array.isArray(section.items) ? section.items.length : 0;
    lines.push(`### Section: ${section.type} (${count})`);
    lines.push("");
    // Narrative-wrapper section thesis. Renders under the section
    // header, above the items, italicized to mirror the frontend.
    if (section.thesis) {
      lines.push(`_Thesis:_ _${section.thesis}_`);
      lines.push("");
    }
    for (const item of section.items || []) {
      // worth_scanning items have no product anchor — render the
      // invitational copy directly instead of showing "**null** —
      // score null" which makes the markdown look broken.
      if (section.type === "worth_scanning") {
        lines.push(`_${item.reasoning}_`);
        lines.push(`Action: "${item.action_label}"`);
      } else {
        lines.push(`**${item.product_name}** — score ${item.score}`);
        lines.push(`"${item.reasoning}"`);
        lines.push(`Action: "${item.action_label}"`);
      }
      lines.push("");
    }
  }

  // Narrative-wrapper start_here close. Renders above the suggested
  // action so the operator sees the editorial first move separately
  // from the global CTA.
  if (b.start_here && b.start_here.label) {
    lines.push(`**Start here:** ${b.start_here.label}`);
    lines.push(`_${b.start_here.reasoning || ""}_`);
    lines.push("");
  }

  if (b.suggested_action) {
    lines.push(`**Suggested action:** ${b.suggested_action.type} — "${b.suggested_action.label}"`);
    lines.push("");
  }

  const m = result.metadata || {};
  lines.push("**Metadata:**");
  lines.push(`- AI attempts: ${m.ai_attempts ?? "n/a"}`);
  lines.push(`- Voice gate failures: ${m.voice_gate_failures?.length ? m.voice_gate_failures.join(", ") : "none"}`);
  lines.push(`- Dropped IDs: ${m.dropped_ids?.length ? m.dropped_ids.join(", ") : "none"}`);
  lines.push(`- Composition source: ${m.composition_source || "ai"}`);
  lines.push(`- Latency: ${latencyMs}ms`);
  if (m.fallback_reason) lines.push(`- Fallback reason: ${m.fallback_reason}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  return lines.join("\n");
}

const CHECKLIST = `## Voice review checklist

For each bundle, mark pass or fail:

- [ ] Title is scenario driven, not category label
- [ ] Intro is personalized when home data exists, graceful when not
- [ ] Every reasoning line includes 2 specific receipts (named ingredients or features, not generic phrasing)
- [ ] Score appears as evidence, never as destination
- [ ] Consumable vs durable language adapts correctly per item
- [ ] No first person pronouns slipped through (I, me, my, we, our, us)
- [ ] No banned wellness language (safe, eco friendly, non toxic, pure, wholesome, clean as adjective)
- [ ] No moralizing (you should, you must, the right choice)
- [ ] No panic framing (dangerous, scary, alarming)
- [ ] Suggested action is scenario specific, not generic CTA
- [ ] Would Sara say this out loud to a mom friend at the playground?

Iterate composer system prompt and re-run if any bundle fails. Don't commit v2 until all 5 pass.
`;

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  const startedAt = new Date();
  const isoForFile = startedAt.toISOString().replace(/[:.]/g, "-");
  const outPath = path.resolve(__dirname, "..", "..", "docs", `voice_review_${isoForFile}.md`);

  console.log(`[voice-review] running ${SCENARIOS.length} scenarios against ${SONNET_MODEL}…`);
  console.log(`[voice-review] output will land at ${outPath}`);

  const sections = [];
  sections.push(`# R5b.3 v2 composer voice review`);
  sections.push("");
  sections.push(`Generated ${startedAt.toISOString()} with live ${SONNET_MODEL} calls.`);
  sections.push("Read each bundle out loud and apply the checklist below.");
  sections.push("");
  sections.push("---");
  sections.push("");

  const totals = { ok: 0, errors: 0, fallbacks: 0, latency: 0, gateFires: 0, drops: 0 };

  for (const s of SCENARIOS) {
    process.stdout.write(`  scenario ${s.n} (${s.label})… `);
    const t0 = Date.now();
    const res = await runScenario(s);
    const dur = Date.now() - t0;
    if (res.error) {
      totals.errors++;
      console.log(`ERROR (${dur}ms): ${res.error}`);
    } else {
      totals.ok++;
      totals.latency += res.latencyMs || 0;
      const meta = res.result?.metadata || {};
      if (meta.composition_source === "templated_fallback") totals.fallbacks++;
      totals.gateFires += (meta.voice_gate_failures?.length || 0);
      totals.drops    += (meta.dropped_ids?.length || 0);
      console.log(`ok (${dur}ms, source=${meta.composition_source || "ai"}, attempts=${meta.ai_attempts}, gates=${meta.voice_gate_failures?.length || 0}, drops=${meta.dropped_ids?.length || 0})`);
    }
    sections.push(renderScenarioMarkdown(res));
  }

  sections.push(CHECKLIST);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, sections.join("\n"), "utf8");

  console.log("");
  console.log(`[voice-review] done.`);
  console.log(`  scenarios ok:       ${totals.ok} / ${SCENARIOS.length}`);
  console.log(`  scenarios errored:  ${totals.errors}`);
  console.log(`  templated fallbacks:${totals.fallbacks}`);
  console.log(`  voice gate fires:   ${totals.gateFires}`);
  console.log(`  product IDs dropped:${totals.drops}`);
  console.log(`  avg composer latency: ${Math.round(totals.latency / Math.max(totals.ok, 1))}ms`);
  console.log("");
  console.log(`open ${outPath}`);
  console.log("read each bundle out loud, apply the checklist, iterate composer system prompt if any bundle fails.");
}

main().catch(e => {
  console.error("[voice-review] fatal:", e?.stack || e?.message || e);
  process.exit(1);
});
