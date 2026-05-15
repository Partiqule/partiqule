#!/usr/bin/env node
// R5b.2.1 backfill — compute structured flag arrays for every existing
// scan record and write them back to result_json.flags. The write path
// (server.js attachFlags) handles new scans going forward; this script
// catches the ~308 rows scored before the change shipped.
//
// Usage from repo root:
//   node backend/scripts/backfill_scan_flags.js
//
// Requires backend/.env with SUPABASE_URL and SUPABASE_SERVICE_KEY.
// Idempotent — safe to re-run; subsequent passes overwrite flags with
// the freshly-computed value.

require("dotenv").config({ path: __dirname + "/../.env" });
const { createClient } = require("@supabase/supabase-js");
const { detectFlags } = require("../flagDetection");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY in backend/.env");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const BATCH_SIZE = 50;

function computeFlags(resultJson) {
  if (!resultJson || typeof resultJson !== "object") return [];
  let haystack = "";
  try { haystack = JSON.stringify(resultJson); } catch { return []; }
  if (!haystack) return [];
  const det = detectFlags(haystack, null);
  const out = [];
  if (det && det.flags) {
    for (const [group, info] of Object.entries(det.flags)) {
      if (!info?.present) continue;
      for (const label of info.matches || []) {
        out.push({ group, label });
      }
    }
  }
  return out;
}

(async () => {
  console.log("Counting scans...");
  const { count, error: countErr } = await supabase
    .from("scans")
    .select("id", { count: "exact", head: true });
  if (countErr) { console.error("Count failed:", countErr.message); process.exit(1); }
  console.log(`Total scans: ${count}`);

  let offset = 0;
  let processed = 0;
  let withAny = 0;
  let withPfas = 0;
  let updateErrors = 0;

  while (true) {
    const { data, error } = await supabase
      .from("scans")
      .select("id, product_name, result_json")
      .order("scanned_at", { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);
    if (error) { console.error("Fetch failed:", error.message); process.exit(1); }
    if (!data || data.length === 0) break;

    for (const row of data) {
      const flags = computeFlags(row.result_json);
      if (flags.length) withAny++;
      if (flags.some(f => f.group === "pfas")) withPfas++;
      const nextResultJson = { ...(row.result_json || {}), flags };
      const { error: upErr } = await supabase
        .from("scans")
        .update({ result_json: nextResultJson })
        .eq("id", row.id);
      if (upErr) {
        updateErrors++;
        console.warn(`  update failed id=${row.id}: ${upErr.message}`);
      }
      processed++;
      if (processed % 25 === 0) {
        console.log(`  ${processed}/${count} processed (with_any=${withAny}, with_pfas=${withPfas})`);
      }
    }

    offset += data.length;
    if (data.length < BATCH_SIZE) break;
  }

  console.log("\nDone.");
  console.log(`  processed:      ${processed}`);
  console.log(`  with_any_flag:  ${withAny}`);
  console.log(`  with_pfas:      ${withPfas}`);
  console.log(`  update_errors:  ${updateErrors}`);
})();
