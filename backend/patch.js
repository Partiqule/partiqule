#!/usr/bin/env node
/**
 * Partiqule patch script
 * Run from backend directory: node patch.js
 * Applies all today's fixes to server.js in place
 */

const fs = require("fs");
const path = require("path");

const serverPath = path.join(__dirname, "server.js");
let src = fs.readFileSync(serverPath, "utf8");

let patches = 0;

function patch(description, oldStr, newStr) {
  if (src.includes(newStr.slice(0, 50))) {
    console.log(`  [SKIP] Already applied: ${description}`);
    return;
  }
  if (!src.includes(oldStr.slice(0, 50))) {
    console.log(`  [MISS] Could not find target for: ${description}`);
    return;
  }
  src = src.replace(oldStr, newStr);
  patches++;
  console.log(`  [OK] Applied: ${description}`);
}

console.log("\nPartiqule Patch Script");
console.log("======================\n");

// ── PATCH 1: Fix Redis sync key pattern ──────────────────────
patch(
  "Fix Redis sync key pattern (score:* → *)",
  'const keys = await redisKeys("score:*");',
  'const keys = await redisKeys("*");'
);

// ── PATCH 2: Add fuzzy calibration lookup function ────────────
patch(
  "Add fuzzyCalibrationLookup function",
  `function cacheKey(q, category) {
  const norm = q.toLowerCase().trim().replace(/\\s+/g, " ");
  return category ? \`\${category}:\${norm}\` : norm;
}`,
  `function cacheKey(q, category) {
  const norm = q.toLowerCase().trim().replace(/\\s+/g, " ");
  return category ? \`\${category}:\${norm}\` : norm;
}

// Fuzzy calibration lookup — handles name variations
function fuzzyCalibrationLookup(productName) {
  const norm = normalise(productName);
  const exact = CALIBRATION.get(norm);
  if (exact) return { key: norm, entry: exact };
  for (const [k, v] of CALIBRATION.entries()) {
    if (k.length >= 4 && norm.startsWith(k)) return { key: k, entry: v };
  }
  for (const [k, v] of CALIBRATION.entries()) {
    if (norm.length >= 4 && k.startsWith(norm)) return { key: k, entry: v };
  }
  for (const [k, v] of CALIBRATION.entries()) {
    if (k.length >= 6 && norm.includes(k)) return { key: k, entry: v };
  }
  return null;
}`
);

// ── PATCH 3: Add fuzzy lookup in text scan route ──────────────
patch(
  "Add fuzzy lookup before AI in text scan",
  `  console.log(\`[CACHE MISS] \${key} — running AI pass\`);`,
  `  // Fuzzy calibration — catches name variations before AI
  const fuzzyHit = fuzzyCalibrationLookup(productName);
  if (fuzzyHit) {
    const { entry } = fuzzyHit;
    const midScore = Math.round((entry.floor + entry.ceiling) / 2);
    const fuzzyResult = applyProductCalibration({
      product_name: productName, score: midScore, overall_score: midScore,
      category: entry.category || category,
      confidence: entry.confidence || "high",
      dimensions: {
        materials:      { score: 5, concerns: entry.substances || [] },
        usage_exposure: { score: 5, concerns: [] },
        packaging:      { score: 5, concerns: [] },
        sustainability: { score: 5, concerns: [] },
      },
      concerns: entry.substances || [],
      flagged_substances: entry.substances || [],
      summary: entry.reason || "",
      alternatives: [], ai_alternatives: [],
    });
    cacheSet(key, fuzzyResult);
    console.log(\`[FUZZY CAL HIT] "\${productName}" matched calibration — score \${midScore}\`);
    return res.json({ ...fuzzyResult, cached: false });
  }

  console.log(\`[CACHE MISS] \${key} — running AI pass\`);`
);

// ── PATCH 4: Add cache check and fuzzy lookup in vision path ──
patch(
  "Add cache check in vision path after product identified",
  `      const productName = p1.product_name || "Scanned product";

      // Pass 2 audit`,
  `      const productName = p1.product_name || "Scanned product";
      const imgCategory = p1.category || "other";
      const imgKey = cacheKey(productName, imgCategory);

      // Check cache after vision identifies product
      const imgCached = await cacheGet(imgKey);
      if (imgCached) {
        console.log(\`[CACHE HIT] Vision "\${productName}" — returning cached result\`);
        return res.json({ ...imgCached, cached: true });
      }

      // Fuzzy calibration check before running pass2
      const imgFuzzy = fuzzyCalibrationLookup(productName);
      if (imgFuzzy) {
        const { entry } = imgFuzzy;
        const midScore = Math.round((entry.floor + entry.ceiling) / 2);
        const fuzzyResult = applyProductCalibration({
          product_name: productName, score: midScore, overall_score: midScore,
          category: entry.category || imgCategory,
          confidence: entry.confidence || "high",
          dimensions: {
            materials:      { score: 5, concerns: entry.substances || [] },
            usage_exposure: { score: 5, concerns: [] },
            packaging:      { score: 5, concerns: [] },
            sustainability: { score: 5, concerns: [] },
          },
          concerns: entry.substances || [],
          flagged_substances: entry.substances || [],
          summary: entry.reason || "",
          alternatives: [], ai_alternatives: [],
          nutrition: p1.nutrition || null,
          ingredient_list: p1.ingredient_list || [],
        });
        cacheSet(imgKey, fuzzyResult);
        console.log(\`[FUZZY CAL HIT] Vision "\${productName}" matched calibration — score \${midScore}\`);
        return res.json({ ...fuzzyResult, cached: false });
      }

      // Pass 2 audit`
);

// ── PATCH 5: Cache vision result after AI scoring ─────────────
patch(
  "Cache vision result after AI scoring",
  `      return res.json(applyProductCalibration(result));
    } catch(err) {
      console.error("Vision analyze error:",`,
  `      const calibratedResult = applyProductCalibration(result);
      cacheSet(imgKey || cacheKey(productName, result.category || "other"), calibratedResult);
      console.log(\`[CACHED] Vision "\${productName}" score \${calibratedResult.score}\`);
      return res.json(calibratedResult);
    } catch(err) {
      console.error("Vision analyze error:",`
);

// ── PATCH 6: Fix warm list count (74→95) ─────────────────────
patch(
  "Add missing warm list products",
  `  "Caraway cookware",
  "All-Clad stainless pan",
  "Lodge cast iron skillet",
  "Calphalon nonstick pan",
];`,
  `  "Caraway cookware",
  "All-Clad stainless pan",
  "Lodge cast iron skillet",
  "Calphalon nonstick pan",
  // Kids snacks
  "Welch's Fruit Snacks",
  "Mott's Fruit Snacks",
  "Gushers",
  "Fruit Roll-Ups",
  "Annie's Organic Fruit Snacks",
  "Kool-Aid Jammers",
  "Capri Sun Roarin Waters",
  "GoGo Squeez applesauce",
  "Happy Baby organic pouch",
  "Plum Organics baby pouch",
  // Kids pajamas
  "Carter's cotton pajamas",
  "Simple Joys pajamas",
  "Leveret pajamas",
  "KicKee Pants pajamas",
  "Little Sleepies pajamas",
  "Hanna Andersson pajamas",
];`
);

// Write patched file
fs.writeFileSync(serverPath, src, "utf8");

console.log(`\nDone! Applied ${patches} patches.`);
console.log("Now run: cd ~/Downloads/plasticscan && git add . && git commit -m \"Apply patches\" && git push");
