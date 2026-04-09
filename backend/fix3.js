#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const serverPath = path.join(__dirname, "server.js");
let src = fs.readFileSync(serverPath, "utf8");

const lines = src.split("\n");
const occurrences = [];
lines.forEach((line, i) => {
  if (line.includes("const fuzzyHit = fuzzyCalibrationLookup(productName)")) {
    occurrences.push(i);
  }
});

console.log(`fuzzyHit declarations at lines: ${occurrences.map(i=>i+1).join(", ")}`);

if (occurrences.length < 2) {
  console.log("Less than 2 found — checking for other patterns...");
  // Maybe it's let instead of const
  lines.forEach((line, i) => {
    if (line.includes("fuzzyCalibrationLookup(productName)")) {
      console.log(`Line ${i+1}: ${line.trim()}`);
    }
  });
  process.exit(0);
}

// Rename second occurrence's variable to fuzzyHit2 throughout its block
// Find start and end of second block
let blockStart = occurrences[1];
while (blockStart > 0 && !lines[blockStart].trim().startsWith("//")) {
  blockStart--;
}
let blockEnd = occurrences[1];
while (blockEnd < lines.length - 1 && !lines[blockEnd].includes("[CACHE MISS]") && !lines[blockEnd].includes("console.log(`[CACHE MISS]")) {
  blockEnd++;
}

console.log(`Second block: lines ${blockStart+1} to ${blockEnd+1}`);

// Replace in just that block
for (let i = blockStart; i < blockEnd; i++) {
  lines[i] = lines[i]
    .replace(/const fuzzyHit\b/, "const fuzzyHit2")
    .replace(/\bfuzzyHit\b/g, "fuzzyHit2");
}

fs.writeFileSync(serverPath, lines.join("\n"), "utf8");
console.log("Done — renamed second block to fuzzyHit2. Push to Railway.");
