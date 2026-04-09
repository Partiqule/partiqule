#!/usr/bin/env node
/**
 * Fixes duplicate fuzzyHit declaration in server.js
 */

const fs = require("fs");
const path = require("path");

const serverPath = path.join(__dirname, "server.js");
let src = fs.readFileSync(serverPath, "utf8");

// Find and remove the duplicate fuzzy lookup block in the text scan route
// The patch added it twice — remove the second occurrence
const fuzzyBlock = `  // Fuzzy calibration — catches name variations before AI
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
  }`;

// Count occurrences
const count = (src.match(/const fuzzyHit = fuzzyCalibrationLookup\(productName\)/g) || []).length;
console.log(`Found ${count} fuzzyHit declarations`);

if (count > 1) {
  // Remove the second occurrence by replacing second fuzzyBlock+newline with empty
  const firstIdx = src.indexOf(fuzzyBlock);
  const secondIdx = src.indexOf(fuzzyBlock, firstIdx + 1);
  if (secondIdx !== -1) {
    src = src.slice(0, secondIdx) + src.slice(secondIdx + fuzzyBlock.length);
    console.log("Removed duplicate fuzzyHit block");
  }
}

fs.writeFileSync(serverPath, src, "utf8");
console.log("Done — push to Railway");
