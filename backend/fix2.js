#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const serverPath = path.join(__dirname, "server.js");
let src = fs.readFileSync(serverPath, "utf8");

// Find all occurrences of fuzzyHit declaration
const lines = src.split("\n");
const occurrences = [];
lines.forEach((line, i) => {
  if (line.includes("const fuzzyHit = fuzzyCalibrationLookup(productName)")) {
    occurrences.push(i + 1); // 1-indexed line numbers
  }
});

console.log(`Found fuzzyHit declarations at lines: ${occurrences.join(", ")}`);

if (occurrences.length < 2) {
  console.log("Only one occurrence found — nothing to fix");
  process.exit(0);
}

// Keep the first, remove the second and its surrounding block
// Find the second occurrence and remove from "// Fuzzy calibration" comment
// back to the closing brace + newline
const secondLine = occurrences[1] - 1; // 0-indexed

// Walk backwards to find the comment line starting the block
let blockStart = secondLine;
while (blockStart > 0 && !lines[blockStart].includes("// Fuzzy calibration")) {
  blockStart--;
}

// Walk forwards to find "console.log(`[CACHE MISS]" which follows the block
let blockEnd = secondLine;
while (blockEnd < lines.length && !lines[blockEnd].includes("[CACHE MISS]")) {
  blockEnd++;
}

console.log(`Removing lines ${blockStart + 1} to ${blockEnd} (second fuzzyHit block)`);

// Remove the duplicate block
const newLines = [
  ...lines.slice(0, blockStart),
  ...lines.slice(blockEnd)
];

fs.writeFileSync(serverPath, newLines.join("\n"), "utf8");
console.log("Fixed! Now push to Railway.");
