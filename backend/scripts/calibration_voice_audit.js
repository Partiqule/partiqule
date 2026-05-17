#!/usr/bin/env node
// Calibration voice audit.
//
// Scans CALIBRATION (backend/calibration.js) for banned voice patterns
// that leak into composer output and cause repeated voice-gate failures
// + templated fallbacks. Patterns cover marketing comparatives
// ("cleanest mainstream", "actually works"), wellness vocabulary
// ("pure", "wholesome", "non toxic"), medical / physiological claims
// ("blood sugar", "boosts immunity"), and structural issues (trailing
// "Score N", em-dashes, word-internal hyphens).
//
// Composer ingests two source fields from each calibration entry:
//   - `reason`     (sentence-level prose)
//   - `substances` (array of short strings)
// Both feed the AI's calibration_notes context, so both are scanned.
//
// Output: docs/calibration_voice_audit.md
//
// Operator workflow:
//   1. Run this script
//   2. Open the markdown, remove any per-entry blocks you don't want applied
//   3. Run backend/scripts/calibration_voice_apply.js (Phase 2)
//
// The script does NOT modify calibration.js. Phase 2 does that.
//
// Usage:
//   node backend/scripts/calibration_voice_audit.js

"use strict";

const fs   = require("fs");
const path = require("path");

const REPO_ROOT     = path.resolve(__dirname, "..", "..");
const CALIB_PATH    = path.join(REPO_ROOT, "backend", "calibration.js");
const OUT_PATH      = path.join(REPO_ROOT, "docs", "calibration_voice_audit.md");

// ── Patterns ──────────────────────────────────────────────────────
// Each pattern is { id, label, re, replace(text, entry) → text }.
// `replace` returns the FULL text with the substitution applied so
// the apply script can do exact-string replacement on calibration.js.
// Replace functions also normalize whitespace and dangling
// punctuation after dropping a phrase.

function cleanup(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/([,.;:])\s*\1+/g, "$1")
    .replace(/\.\s*\./g, ".")
    .replace(/^\s*[,.;]\s*/, "")
    .trim();
}

// European brand context for the cleanest_mainstream substitution.
function isEuropeanBrand(entry) {
  const blob = `${entry?.reason || ""} ${(entry?.substances || []).join(" ")} ${entry?.product_family || ""}`;
  return /\b(european|hipp|holle|kendamil|lebenswert|bioland|demeter)\b/i.test(blob);
}

// ── Pattern scope ────────────────────────────────────────────────
// Phase A (calibration_voice_emdash_fix.js) handled em-dashes and
// related structural fixes in bulk. Phase B (this audit) intentionally
// scopes to the marketing/wellness/medical patterns that require
// operator judgment per entry.
//
// Excluded from this audit, by operator decision:
//   - structural_emdash    (handled in Phase A)
//   - structural_word_hyphen (project-wide; many brand names use
//     hyphens legitimately, e.g., Coca-Cola, BPA-free; the composer
//     sanitizer already strips them from AI output)
//   - wellness_clean       (945 matches; "clean ingredients" → "minimal
//     ingredients" reads OK but other contexts don't transpose
//     cleanly; needs broader voice rewrite, not pattern replacement)
//   - benchmark_formula    (358 matches; "well calibrated formula"
//     reads limp; needs entry-specific rewriting, not bulk replacement)
const PATTERNS = [
  // ── Marketing comparatives ────────────────────────────────────
  {
    id: "cleanest_mainstream",
    label: "Marketing: 'cleanest mainstream'",
    re: /cleanest\s+mainstream/i,
    replace: (text, entry) => cleanup(text.replace(/cleanest\s+mainstream/gi,
      isEuropeanBrand(entry) ? "leading European" : "leading mainstream")),
  },
  {
    id: "marketing_actually_works",
    label: "Marketing: 'actually [positive verb]'",
    re: /\bactually\s+(works?|protects?|delivers?|helps?|matters?|performs?)\b/i,
    replace: (text) => cleanup(text.replace(/\bactually\s+(works?|protects?|delivers?|helps?|matters?|performs?)\b/gi, "$1")),
  },
  {
    id: "the_only",
    label: "Marketing: 'the only [product type]'",
    re: /\bthe\s+only\s+([a-z][a-z\s]{2,30}?)\b(?=\s|[.,;])/i,
    replace: (text) => cleanup(text.replace(/\bthe\s+only\s+/gi, "one of few ")),
  },
  {
    id: "marketing_best_in_class",
    label: "Marketing: 'best in class'",
    re: /\bbest\s+in\s+class\b/i,
    replace: (text) => cleanup(text.replace(/\bbest\s+in\s+class\b/gi, "")),
  },
  {
    id: "marketing_industry_leading",
    label: "Marketing: 'industry leading'",
    re: /\bindustry[\s-]?leading\b/i,
    replace: (text) => cleanup(text.replace(/\bindustry[\s-]?leading\b/gi, "")),
  },
  {
    id: "marketing_most_trusted",
    label: "Marketing: 'most trusted'",
    re: /\bmost\s+trusted\b/i,
    replace: (text) => cleanup(text.replace(/\bmost\s+trusted\b/gi, "")),
  },

  // ── Wellness vocabulary ───────────────────────────────────────
  {
    id: "wellness_pure",
    label: "Wellness: 'pure' as adjective",
    re: /\bpure\b/i,
    replace: (text) => cleanup(text.replace(/\bpure\b/gi, "minimal")),
  },
  {
    id: "wellness_wholesome",
    label: "Wellness: 'wholesome'",
    re: /\bwholesome\b/i,
    replace: (text) => cleanup(text.replace(/\bwholesome\b/gi, "")),
  },
  {
    id: "wellness_nontoxic",
    label: "Wellness: 'non toxic' / 'nontoxic'",
    re: /\bnon[\s-]?toxic\b/i,
    replace: (text) => cleanup(text.replace(/\bnon[\s-]?toxic\b/gi, "")),
  },
  {
    id: "wellness_chemical_free",
    label: "Wellness: 'chemical free'",
    re: /\bchemical[\s-]?free\b/i,
    replace: (text) => cleanup(text.replace(/\bchemical[\s-]?free\b/gi, "")),
  },
  {
    id: "wellness_toxin_free",
    label: "Wellness: 'toxin free'",
    re: /\btoxin[\s-]?free\b/i,
    replace: (text) => cleanup(text.replace(/\btoxin[\s-]?free\b/gi, "")),
  },
  {
    id: "wellness_eco_friendly",
    label: "Wellness: 'eco friendly'",
    re: /\beco[\s-]?friendly\b/i,
    replace: (text) => cleanup(text.replace(/\beco[\s-]?friendly\b/gi, "")),
  },
  {
    id: "wellness_mom_approved",
    label: "Wellness: 'mom approved'",
    re: /\bmom[\s-]?approved\b/i,
    replace: (text) => cleanup(text.replace(/\bmom[\s-]?approved\b/gi, "")),
  },
  {
    id: "wellness_safe",
    label: "Wellness: 'safe' applied to product",
    re: /\bsafe\b/i,
    replace: (text) => cleanup(text.replace(/\bsafe\b/gi, "well sourced")),
  },

  // ── Medical / physiological claims ────────────────────────────
  // For health-outcome claims we drop the whole sentence containing
  // the claim. Notes should not carry health outcomes.
  {
    id: "medical_blood_sugar",
    label: "Medical: 'blood sugar'",
    re: /\bblood\s+sugar\b/i,
    replace: (text) => cleanup(dropSentencesContaining(text, /\bblood\s+sugar\b/i)),
  },
  {
    id: "medical_blood_pressure",
    label: "Medical: 'blood pressure'",
    re: /\bblood\s+pressure\b/i,
    replace: (text) => cleanup(dropSentencesContaining(text, /\bblood\s+pressure\b/i)),
  },
  {
    id: "medical_cholesterol",
    label: "Medical: 'cholesterol'",
    re: /\bcholesterol\b/i,
    replace: (text) => cleanup(dropSentencesContaining(text, /\bcholesterol\b/i)),
  },
  {
    id: "medical_insulin",
    label: "Medical: 'insulin'",
    re: /\binsulin\b/i,
    replace: (text) => cleanup(dropSentencesContaining(text, /\binsulin\b/i)),
  },
  {
    id: "medical_glycemic",
    label: "Medical: 'glycemic'",
    re: /\bglycemic\b/i,
    replace: (text) => cleanup(dropSentencesContaining(text, /\bglycemic\b/i)),
  },
  {
    id: "medical_spike",
    label: "Medical: 'spike (blood|sugar|insulin|glucose)'",
    re: /\bspike\s+(blood|sugar|insulin|glucose)/i,
    replace: (text) => cleanup(dropSentencesContaining(text, /\bspike\s+(blood|sugar|insulin|glucose)/i)),
  },
  {
    id: "medical_lowers_levels",
    label: "Medical: 'lowers X levels'",
    re: /\blowers?\s+\w+\s+levels?\b/i,
    replace: (text) => cleanup(dropSentencesContaining(text, /\blowers?\s+\w+\s+levels?\b/i)),
  },
  {
    id: "medical_raises_levels",
    label: "Medical: 'raises X levels'",
    re: /\braises?\s+\w+\s+levels?\b/i,
    replace: (text) => cleanup(dropSentencesContaining(text, /\braises?\s+\w+\s+levels?\b/i)),
  },
  {
    id: "medical_boosts",
    label: "Medical: 'boosts immunity/metabolism'",
    re: /\bboosts?\s+(immunity|metabolism)\b/i,
    replace: (text) => cleanup(dropSentencesContaining(text, /\bboosts?\s+(immunity|metabolism)\b/i)),
  },
  {
    id: "medical_prevents_disease",
    label: "Medical: 'prevents (cancer|disease|diabetes|inflammation)'",
    re: /\bprevents?\s+(cancer|disease|diabetes|inflammation|obesity)\b/i,
    replace: (text) => cleanup(dropSentencesContaining(text, /\bprevents?\s+(cancer|disease|diabetes|inflammation|obesity)\b/i)),
  },
  {
    id: "medical_causes_disease",
    label: "Medical: 'causes (cancer|disease|diabetes|inflammation)'",
    re: /\bcauses?\s+(cancer|disease|diabetes|inflammation|obesity)\b/i,
    replace: (text) => cleanup(dropSentencesContaining(text, /\bcauses?\s+(cancer|disease|diabetes|inflammation|obesity)\b/i)),
  },
  {
    id: "medical_linked_to_disease",
    label: "Medical: 'linked to (cancer|disease|diabetes|inflammation)'",
    re: /\blinked\s+to\s+(cancer|disease|diabetes|inflammation|obesity)\b/i,
    replace: (text) => cleanup(dropSentencesContaining(text, /\blinked\s+to\s+(cancer|disease|diabetes|inflammation|obesity)\b/i)),
  },
  {
    id: "medical_reduces",
    label: "Medical: 'reduces inflammation/risk'",
    re: /\breduces?\s+(inflammation|risk)\b/i,
    replace: (text) => cleanup(dropSentencesContaining(text, /\breduces?\s+(inflammation|risk)\b/i)),
  },

  // Structural patterns (structural_emdash, structural_word_hyphen,
  // structural_score_destination) are intentionally NOT in this list.
  // Em-dashes are handled by the bulk fix script; word-internal
  // hyphens are skipped because of brand-name concerns; trailing
  // Score destination is rare and the composer sanitizer handles it.
];

// Drop sentences containing a pattern. Splits on sentence boundaries
// (. ? !), keeps only those that don't match.
function dropSentencesContaining(text, re) {
  const sentences = String(text || "").split(/(?<=[.?!])\s+/);
  const kept = sentences.filter(s => !re.test(s));
  return kept.join(" ");
}

// ── Load source + entries ────────────────────────────────────────
const calibSrc = fs.readFileSync(CALIB_PATH, "utf8");
const calibLines = calibSrc.split("\n");

// Build key → line number map by scanning the source for entry openers.
// calibration.js entries look like: ["normalized key", { ... }],
// We map the leading-key portion to its line number for the report.
const keyLineMap = new Map();
const keyLineRe = /^\s*\[\s*"([^"]+)"/;
calibLines.forEach((line, i) => {
  const m = line.match(keyLineRe);
  if (m && !keyLineMap.has(m[1])) {
    keyLineMap.set(m[1], i + 1);
  }
});

const { CALIBRATION } = require(CALIB_PATH);
if (!CALIBRATION || typeof CALIBRATION.entries !== "function") {
  console.error("ERROR: backend/calibration.js did not export a CALIBRATION Map");
  process.exit(1);
}

// ── Scan ─────────────────────────────────────────────────────────
// Per-entry, per-field scan. Each pattern is tried once per text;
// when it matches, we record the full original text and the full
// suggested replacement (so Phase 2 can do exact-string replace on
// the source file).
const matchesByPattern = new Map();
let totalEntries = 0;
let entriesWithMatches = 0;
let totalMatches = 0;

for (const [key, entry] of CALIBRATION.entries()) {
  totalEntries++;
  if (!entry || typeof entry !== "object") continue;

  let entryHadMatch = false;

  // Scan reason (single string).
  if (typeof entry.reason === "string" && entry.reason.trim()) {
    for (const p of PATTERNS) {
      if (p.re.test(entry.reason)) {
        const suggested = p.replace(entry.reason, entry);
        // Only record when the replacement actually differs from the
        // original — protects against patterns whose suggested output
        // happens to equal the source (rare but possible).
        if (suggested !== entry.reason) {
          if (!matchesByPattern.has(p.id)) matchesByPattern.set(p.id, { label: p.label, matches: [] });
          matchesByPattern.get(p.id).matches.push({
            key,
            line: keyLineMap.get(key) || null,
            field: "reason",
            current: entry.reason,
            suggested,
          });
          totalMatches++;
          entryHadMatch = true;
        }
      }
    }
  }

  // Scan substances (array of strings).
  if (Array.isArray(entry.substances)) {
    entry.substances.forEach((sub, idx) => {
      const text = String(sub || "");
      if (!text.trim()) return;
      for (const p of PATTERNS) {
        if (p.re.test(text)) {
          const suggested = p.replace(text, entry);
          if (suggested !== text) {
            if (!matchesByPattern.has(p.id)) matchesByPattern.set(p.id, { label: p.label, matches: [] });
            matchesByPattern.get(p.id).matches.push({
              key,
              line: keyLineMap.get(key) || null,
              field: `substances[${idx}]`,
              current: text,
              suggested,
            });
            totalMatches++;
            entryHadMatch = true;
          }
        }
      }
    });
  }

  if (entryHadMatch) entriesWithMatches++;
}

// ── Markdown writer ──────────────────────────────────────────────
// The apply script (Phase 2) reads this format:
//   #### Entry: <key>
//   - Line: <n>
//   - Field: <field>
//   - Pattern: <pattern_id>
//
//   **Current:**
//   ```
//   <full original text>
//   ```
//
//   **Suggested:**
//   ```
//   <full suggested replacement>
//   ```
//
// To skip an entry, delete its block from the markdown before running
// the apply script. To skip an entire pattern category, delete the
// whole pattern section.

const lines = [];
lines.push("# Calibration notes voice audit");
lines.push("");
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push("");
lines.push(`- Total entries scanned: ${totalEntries}`);
lines.push(`- Entries with at least one match: ${entriesWithMatches}`);
lines.push(`- Total matches: ${totalMatches}`);
lines.push("");

// Summary table — patterns sorted by count desc.
const patternSummary = Array.from(matchesByPattern.entries())
  .map(([id, group]) => ({ id, label: group.label, count: group.matches.length }))
  .sort((a, b) => b.count - a.count);

lines.push("## Summary by pattern");
lines.push("");
lines.push("| Pattern | Match count |");
lines.push("|---------|-------------|");
for (const p of patternSummary) {
  lines.push(`| ${p.id} | ${p.count} |`);
}
lines.push("");

// Detailed matches by pattern.
lines.push("## Matches by pattern");
lines.push("");
for (const p of patternSummary) {
  const group = matchesByPattern.get(p.id);
  lines.push(`### ${p.id} (${p.count} matches)`);
  lines.push("");
  lines.push(`_${p.label}_`);
  lines.push("");
  for (const m of group.matches) {
    lines.push(`#### Entry: ${m.key}`);
    lines.push(`- Line: ${m.line == null ? "?" : "~" + m.line}`);
    lines.push(`- Field: ${m.field}`);
    lines.push(`- Pattern: ${p.id}`);
    lines.push("");
    lines.push("**Current:**");
    lines.push("```");
    lines.push(m.current);
    lines.push("```");
    lines.push("");
    lines.push("**Suggested:**");
    lines.push("```");
    lines.push(m.suggested);
    lines.push("```");
    lines.push("");
  }
}

lines.push("---");
lines.push("");
lines.push("## Edit instructions for operator");
lines.push("");
lines.push("To skip any individual suggested replacement before running Phase 2, delete the corresponding `#### Entry:` block (including the Current / Suggested code fences) from this file. The apply script reads ONLY the entries that remain.");
lines.push("");
lines.push("To skip an entire pattern category, delete the whole `### pattern_id` section.");
lines.push("");

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, lines.join("\n"), "utf8");

// ── Stdout summary ───────────────────────────────────────────────
console.log("[calibration_voice_audit] complete");
console.log(`  total entries scanned:        ${totalEntries}`);
console.log(`  entries with matches:         ${entriesWithMatches}`);
console.log(`  total matches:                ${totalMatches}`);
console.log("");
console.log("  top patterns by match count:");
for (const p of patternSummary.slice(0, 10)) {
  console.log(`    ${String(p.count).padStart(4)}  ${p.id}`);
}
console.log("");
console.log("  first 5 matches preview:");
let previewed = 0;
outer:
for (const p of patternSummary) {
  for (const m of matchesByPattern.get(p.id).matches) {
    console.log(`    [${p.id}] ${m.key}  (${m.field}, line ${m.line})`);
    console.log(`      current:   ${m.current.slice(0, 120)}${m.current.length > 120 ? "…" : ""}`);
    console.log(`      suggested: ${m.suggested.slice(0, 120)}${m.suggested.length > 120 ? "…" : ""}`);
    previewed++;
    if (previewed >= 5) break outer;
  }
}
console.log("");
console.log(`Report written to: ${OUT_PATH}`);
console.log("");
console.log("OPERATOR ACTION REQUIRED:");
console.log("  1. Review docs/calibration_voice_audit.md");
console.log("  2. Remove any suggestion blocks you don't want applied");
console.log("  3. Confirm before running Phase 2 (backend/scripts/calibration_voice_apply.js)");
