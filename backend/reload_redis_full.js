#!/usr/bin/env node
/**
 * Partiqule — Full Redis reload script
 * Re-scans every stale Redis entry with a full AI pass so all products
 * get real ingredients, flagged substances, and dimension scores.
 *
 * Run from the backend directory:
 *   node reload_redis_full.js
 *
 * Takes ~2-3 hours for 2,400 products at the safe throttle rate.
 * Safe to interrupt and re-run — already-good entries are skipped.
 */

const API_BASE  = "https://partiqule-production.up.railway.app";
const ADMIN_KEY = process.env.ADMIN_KEY || "RowenaRavenclaw2024!";

async function main() {
  console.log("\nPartiqule — Full Redis Reload");
  console.log("==============================");
  console.log(`Target: ${API_BASE}`);
  console.log("This will re-scan every stale Redis entry with full AI.");
  console.log("Already-complete entries are skipped automatically.\n");

  const url = `${API_BASE}/admin/reload-redis?key=${encodeURIComponent(ADMIN_KEY)}`;

  console.log("Connecting...\n");

  const res = await fetch(url, { method: "GET" });

  if (!res.ok) {
    console.error(`Failed to connect: HTTP ${res.status}`);
    const text = await res.text();
    console.error(text);
    process.exit(1);
  }

  // Stream newline-delimited JSON
  const decoder = new TextDecoder();
  let buffer    = "";
  let lastPct   = -1;

  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep incomplete last line

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);

        if (msg.phase === "scan") {
          console.log(`Found ${msg.total} Redis entries to process\n`);
          continue;
        }

        if (msg.complete) {
          const s = msg.summary || {};
          console.log("\n\nDone!");
          console.log(`  Reloaded: ${s.reloaded} products with fresh AI data`);
          console.log(`  Skipped:  ${s.skipped} (already complete)`);
          console.log(`  Failed:   ${s.failed}`);
          console.log(`  Total:    ${s.total}`);
          if (msg.error) console.error(`  Error: ${msg.error}`);
          return;
        }

        // Progress line
        const pct = Math.round((msg.done / msg.total) * 100);
        const bar = "█".repeat(Math.floor(pct / 5)) + "░".repeat(20 - Math.floor(pct / 5));

        if (msg.status === "reloaded") {
          // Clear line and show reloaded product
          process.stdout.write(`\r[${bar}] ${pct}% — ✓ ${msg.product} (${msg.score}/10, ${msg.ingredients} ingredients, ${msg.flags} flags)\n`);
        } else if (msg.status === "error") {
          process.stdout.write(`\r[${bar}] ${pct}% — ✗ ${msg.product}: ${msg.error}\n`);
        } else if (pct !== lastPct) {
          // Just update the progress bar for skipped items
          process.stdout.write(`\r[${bar}] ${pct}% (${msg.done}/${msg.total})`);
          lastPct = pct;
        }

      } catch (e) {
        // Ignore parse errors on partial lines
      }
    }
  }
}

main().catch(e => {
  console.error("\nFatal error:", e.message);
  process.exit(1);
});
