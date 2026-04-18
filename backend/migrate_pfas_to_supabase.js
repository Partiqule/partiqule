#!/usr/bin/env node
/*
 * One-shot data migration: clothing PFAS calibration entries -> product_safety_findings table.
 *
 * Usage:
 *   railway run node backend/migrate_pfas_to_supabase.js            # live migration
 *   node backend/migrate_pfas_to_supabase.js --dry-run               # parse + print, no DB
 *
 * Idempotent: upsert keyed on (brand, product_name, substance, source).
 * Re-running will update existing rows rather than duplicate.
 *
 * DDL note: @supabase/supabase-js has no DDL primitive. The script probes for
 * the table via a SELECT and, if missing, prints the SQL file path and exits
 * with code 2. Apply the SQL via Supabase SQL Editor (or psql) then re-run.
 */

const fs = require("fs");
const path = require("path");
const {CALIBRATION} = require("./calibration.js");
const {createClient} = require("@supabase/supabase-js");

const DRY_RUN = process.argv.includes("--dry-run");
const SQL_FILE = path.join(__dirname, "migrations/001_create_regulatory_flags.sql");

// ── Brand registry (longest first so multi-word matches win) ────────────────
const BRANDS = [
  "period underwear",
  "the north face",
  "victoria secret",
  "victorias secret",
  "mizzen and main",
  "outdoor research",
  "helly hansen",
  "moose knuckles",
  "girlfriend collective",
  "canada goose",
  "stone island",
  "dr martens",
  "ten thousand",
  "public rec",
  "under armour",
  "beyond yoga",
  "sweaty betty",
  "saalt period underwear",
  "skims shapewear",
  "athletic works",
  "wild fable",
  "no boundaries",
  "arc'teryx",
  "arcteryx",
  "on running",
  "tyr durafast",
  "tyr tech",
  "speedo endurance",
  "speedo fastskin",
  "all in motion",
  "lululemon",
  "vuori",
  "alo",
  "athleta",
  "nike",
  "columbia",
  "patagonia",
  "fjallraven",
  "marmot",
  "norrona",
  "mackage",
  "oboz",
  "keen",
  "shein",
  "romwe",
  "boohoo",
  "primark",
  "crocs",
  "knix",
  "thinx",
  "saalt",
  "skims",
  "tumi",
  "tyr",
  "speedo",
  "fabletics",
  "spanx",
  "saxx",
  "jockey",
  "hanes",
  "champion",
  "adidas",
  "asics",
  "brooks",
  "hoka",
  "allbirds",
  "merrell",
  "salomon",
  "sorel",
  "timberland",
  "ugg",
  "birkenstock",
  "veja",
  "danner",
  "rei",
  "rhone",
  "tracksmith",
  "icebreaker",
  "exofficio",
  "carhartt",
  "tommy",
  "uniqlo",
  "h&m",
  "forever",
  "auden",
  "andie",
  "summersalt",
  "cuts",
  "tyr",
  "backpack",
  "period",
];
BRANDS.sort((a, b) => b.length - a.length);

function extractBrand(key) {
  for (const brand of BRANDS) {
    if (key === brand) return {brand, product_name: null};
    if (key.startsWith(brand + " ")) return {brand, product_name: key.slice(brand.length + 1)};
  }
  // Fallback: first word as brand
  const space = key.indexOf(" ");
  if (space === -1) return {brand: key, product_name: null};
  return {brand: key.slice(0, space), product_name: key.slice(space + 1)};
}

// ── Source parsing ──────────────────────────────────────────────────────────
function parseSource(reason) {
  const r = reason.toLowerCase();
  if (/mamavation/.test(r)) return "mamavation";
  if (/better trail/.test(r)) return "better_trail";
  if (/texas ag|paxton|civil investigative demand|\bcid\b/.test(r)) return "texas_ag";
  if (/cbc marketplace/.test(r)) return "cbc_marketplace";
  if (/\bfda\b/.test(r)) return "fda";
  if (/\bewg\b/.test(r)) return "ewg";
  return "other";
}

// ── Measurement extraction (ppm values) ─────────────────────────────────────
function parseMeasurement(reason) {
  // "32ppm", "100ppm", "above 100ppm", "17ppm"
  const m = reason.match(/(above\s+)?(\d+(?:\.\d+)?)\s*ppm/i);
  if (!m) return null;
  return `${m[1] ? "above " : ""}${m[2]}ppm`;
}

function ppmValue(measurement) {
  if (!measurement) return null;
  const m = measurement.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

// ── Concern level ───────────────────────────────────────────────────────────
function parseConcernLevel(reason, measurement, substances) {
  const r = reason.toLowerCase();
  if (/\bbanned\b|\bprohibited\b|banned for sale/.test(r)) return "banned";

  const ppm = ppmValue(measurement);
  if (ppm !== null) {
    if (ppm >= 100) return "exceeds_threshold";
    if (ppm >= 10) return "elevated";
    return "detected";
  }

  if (/above (?:eu |fda )?limits?|exceeds (?:safe )?(?:limits?|threshold)|above child threshold|above safe limits?|20x above/.test(r)) {
    return "exceeds_threshold";
  }
  if (/elevated|high levels|significantly high/.test(r)) return "elevated";
  if (/confirmed|detected|tested positive|intentionally added/.test(r)) return "detected";

  // Substance mentions PFAS without qualifier → detected
  const subs = (substances || []).join(" ").toLowerCase();
  if (subs.includes("pfas")) return "detected";
  return "detected";
}

function scoreImpact(level) {
  if (level === "detected") return 1;
  if (level === "elevated") return 2;
  return 3;
}

// ── Date extraction ─────────────────────────────────────────────────────────
const MONTHS = {
  january: "01", february: "02", march: "03", april: "04", may: "05",
  june: "06", july: "07", august: "08", september: "09", october: "10",
  november: "11", december: "12",
};

function parseTestedDate(reason) {
  // "April 13 2026" or "April 13, 2026"
  const full = reason.match(/([A-Z][a-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (full) {
    const month = MONTHS[full[1].toLowerCase()];
    if (month) return `${full[3]}-${month}-${String(full[2]).padStart(2, "0")}`;
  }
  // Year only — pick the latest 20xx year mentioned
  const years = [...reason.matchAll(/\b(20\d{2})\b/g)].map(m => parseInt(m[1], 10));
  if (years.length) return `${Math.max(...years)}-01-01`;
  return null;
}

function computeExpiry(testedDate) {
  if (!testedDate) return null;
  const d = new Date(testedDate);
  d.setFullYear(d.getFullYear() + 3);
  return d.toISOString().split("T")[0];
}

// ── Is this entry a PFAS detection (vs clean verification)? ─────────────────
function isPFASFreeVerification(reason, substances) {
  const r = reason.toLowerCase();
  const subs = (substances || []).map(s => s.toLowerCase());
  // If substances array explicitly contains PFAS or PFAS indicator or PFAS finish etc. → detection
  if (subs.some(s => /pfas|fluorine|dwr/.test(s))) {
    // But reason might still say "PFAS-free" for counter-calibration; prefer substances signal
    return false;
  }
  // No PFAS in substances — if reason says "no PFAS", "PFAS-free", "zero fluorine" etc.
  return /pfas[- ]free|zero (?:detectable )?(?:organic )?fluorine|no pfas detected|no pfas|pfas[- ]free (?:claim|since|certified|commitment)|100% of .+ pfas[- ]free/.test(r);
}

function isPFASRelated(reason, substances) {
  const subs = (substances || []).map(s => s.toLowerCase()).join(" ");
  if (/pfas|fluorine|dwr|fluorocarbon/.test(subs)) return true;
  if (/\bpfas\b|fluorine|mamavation|better trail|texas ag|paxton|cbc marketplace/i.test(reason)) return true;
  return false;
}

// ── flag_reason assembly (one sentence, user-visible) ───────────────────────
const SOURCE_LABEL = {
  mamavation: "Mamavation",
  better_trail: "Better Trail",
  texas_ag: "Texas Attorney General",
  cbc_marketplace: "CBC Marketplace",
  fda: "FDA",
  ewg: "EWG",
  other: "Independent testing",
};

function buildFlagReason({source, measurement, concern_level, brand, product_name}) {
  const label = SOURCE_LABEL[source];
  const who = product_name ? `${brand} ${product_name}`.trim() : brand;
  if (source === "texas_ag") {
    return `${label} Civil Investigative Demand alleges PFAS phase-out claim is misleading for ${who}.`;
  }
  if (source === "cbc_marketplace") {
    return `${label} lab testing found contamination above regulatory limits in ${who}.`;
  }
  if (source === "mamavation" || source === "better_trail") {
    const lvl = {detected: "detected", elevated: "elevated", exceeds_threshold: "above regulatory threshold", banned: "banned"}[concern_level];
    const m = measurement ? ` at ${measurement}` : "";
    return `${label} lab testing found PFAS ${lvl}${m} in ${who}.`;
  }
  if (source === "fda") return `FDA action documented for ${who} regarding PFAS.`;
  if (source === "ewg") return `EWG testing flagged PFAS concerns for ${who}.`;
  return `Independent testing flagged PFAS in ${who}.`;
}

// ── Transform one calibration entry ─────────────────────────────────────────
function transformEntry(key, meta) {
  if (meta.category !== "clothing") return null;
  const reason = meta.reason || "";
  const substances = meta.substances || [];
  if (!isPFASRelated(reason, substances)) return null;
  if (isPFASFreeVerification(reason, substances)) return null;

  const {brand, product_name} = extractBrand(key);
  const source = parseSource(reason);
  const measurement = parseMeasurement(reason);
  const concern_level = parseConcernLevel(reason, measurement, substances);
  const tested_date = parseTestedDate(reason);
  const incomplete_data = !tested_date || !measurement;

  return {
    brand: brand.toLowerCase(),
    product_name,
    product_sku: null,
    category: "clothing",
    substance: "PFAS",
    concern_level,
    source,
    source_url: null,
    tested_date,
    reported_date: null,
    test_method: null,
    measurement,
    score_impact: scoreImpact(concern_level),
    flag_reason: buildFlagReason({source, measurement, concern_level, brand, product_name}),
    verified: false,
    incomplete_data,
    expires_at: computeExpiry(tested_date),
  };
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const rows = [];
  const incomplete = [];
  for (const [key, meta] of CALIBRATION) {
    const row = transformEntry(key, meta);
    if (!row) continue;
    rows.push(row);
    if (row.incomplete_data) incomplete.push({key, row});
  }

  const bySource = {};
  const byLevel = {};
  for (const r of rows) {
    bySource[r.source] = (bySource[r.source] || 0) + 1;
    byLevel[r.concern_level] = (byLevel[r.concern_level] || 0) + 1;
  }

  console.log(`[migrate] Parsed ${rows.length} PFAS clothing entries from calibration.js`);
  console.log(`[migrate] By source: ${JSON.stringify(bySource)}`);
  console.log(`[migrate] By concern_level: ${JSON.stringify(byLevel)}`);
  console.log(`[migrate] Incomplete data rows: ${incomplete.length}`);

  if (DRY_RUN) {
    console.log(`\n[dry-run] Sample rows (first 3):`);
    console.log(JSON.stringify(rows.slice(0, 3), null, 2));
    if (incomplete.length) {
      console.log(`\n[dry-run] First 5 incomplete_data rows (keys):`);
      incomplete.slice(0, 5).forEach(({key}) => console.log(`  - ${key}`));
    }
    return;
  }

  // ── Live path: connect, probe table, upsert ───────────────────────────────
  const {SUPABASE_URL, SUPABASE_SERVICE_KEY} = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("[migrate] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars. Run via railway run or export them locally.");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Probe for table
  const probe = await supabase.from("product_safety_findings").select("id").limit(1);
  if (probe.error) {
    if (probe.error.code === "42P01" || /does not exist/i.test(probe.error.message || "")) {
      console.error(`[migrate] Table product_safety_findings does not exist.`);
      console.error(`[migrate] @supabase/supabase-js cannot run DDL. Apply the SQL file manually:`);
      console.error(`[migrate]   Supabase dashboard -> SQL Editor -> paste contents of ${SQL_FILE}`);
      console.error(`[migrate]   (then apply migrations/005_rename_pfas_table.sql to rename regulatory_flags -> product_safety_findings)`);
      console.error(`[migrate] Or via psql with DATABASE_URL:`);
      console.error(`[migrate]   psql "$DATABASE_URL" < ${SQL_FILE}`);
      console.error(`[migrate] Then re-run this script.`);
      process.exit(2);
    }
    // Other error — column mismatch from old schema, auth failure, etc.
    console.error(`[migrate] Probe failed: ${probe.error.message}`);
    if (/column .+ does not exist/i.test(probe.error.message || "")) {
      console.error(`[migrate] This looks like a schema mismatch — a product_safety_findings table exists but with different columns.`);
      console.error(`[migrate] Rename the old table or apply this migration against a fresh schema.`);
    }
    process.exit(3);
  }

  console.log(`[migrate] Table product_safety_findings exists — proceeding to upsert (skipped DDL).`);

  // ── Query existing rows to distinguish inserts vs updates ─────────────────
  const keysToCheck = rows.map(r => `${r.brand}::${r.product_name || ""}::${r.substance}::${r.source}`);
  const existingRes = await supabase.from("product_safety_findings").select("brand,product_name,substance,source");
  if (existingRes.error) {
    console.error(`[migrate] Failed to query existing rows: ${existingRes.error.message}`);
    process.exit(4);
  }
  const existingKeys = new Set(
    (existingRes.data || []).map(r => `${r.brand}::${r.product_name || ""}::${r.substance}::${r.source}`)
  );
  const newInserts = keysToCheck.filter(k => !existingKeys.has(k)).length;
  const updates = keysToCheck.length - newInserts;

  // ── Upsert in batches ─────────────────────────────────────────────────────
  const BATCH = 100;
  let totalUpserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const {data, error} = await supabase
      .from("product_safety_findings")
      .upsert(chunk, {onConflict: "brand,product_name,substance,source", ignoreDuplicates: false})
      .select("id");
    if (error) {
      console.error(`[migrate] Upsert batch ${i}-${i + chunk.length} failed: ${error.message}`);
      process.exit(5);
    }
    totalUpserted += (data || []).length;
    console.log(`[migrate] Upserted batch ${i}-${i + chunk.length}: ${(data || []).length} rows returned.`);
  }

  console.log(`\n[migrate] Complete.`);
  console.log(`  Entries processed:     ${rows.length}`);
  console.log(`  Rows upserted:         ${totalUpserted}`);
  console.log(`  Pre-existing (updated): ${updates}`);
  console.log(`  Net new (inserted):    ${newInserts}`);
  console.log(`  Incomplete data flags: ${incomplete.length}`);
  console.log(`  By source:             ${JSON.stringify(bySource)}`);
  console.log(`  By concern_level:      ${JSON.stringify(byLevel)}`);

  // ── Verify: row count, sample 5, null required fields ─────────────────────
  const countRes = await supabase.from("product_safety_findings").select("id", {count: "exact", head: true});
  const sampleRes = await supabase.from("product_safety_findings").select("*").limit(5);
  const nullRes = await supabase.from("product_safety_findings").select("id,brand,category,substance,concern_level,source,score_impact,flag_reason").or("brand.is.null,category.is.null,substance.is.null,concern_level.is.null,source.is.null,score_impact.is.null,flag_reason.is.null");

  console.log(`\n[verify] Total row count: ${countRes.count}`);
  console.log(`[verify] Sample 5 rows:`);
  console.log(JSON.stringify(sampleRes.data, null, 2));
  console.log(`[verify] Rows with null required fields: ${(nullRes.data || []).length}`);
  if ((nullRes.data || []).length) console.log(JSON.stringify(nullRes.data, null, 2));
}

main().catch(err => {
  console.error("[migrate] Fatal error:", err);
  process.exit(99);
});
