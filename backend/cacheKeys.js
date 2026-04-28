// Shared cache-key helpers. Single source of truth for runtime
// (server.js) and preload (preload_redis.js). When these two diverge
// the preload writes Redis entries the server can never read, which
// is exactly the bug we found 2026-04-28.
//
// promptVersion is a content hash of the five prompt-driving function
// bodies. When any change the prefix flips and old Redis entries
// become structurally unreachable. Computed lazily once per process.
"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

let __cached = null;

function readFile(p) {
  try { return fs.readFileSync(p, "utf8"); } catch { return ""; }
}

function extractFn(src, name) {
  const re = new RegExp("function " + name + "\\b[\\s\\S]*?^\\}", "m");
  const m = src.match(re);
  return m ? m[0] : "";
}

function promptVersion() {
  if (__cached) return __cached;
  const serverSrc  = readFile(path.join(__dirname, "server.js"));
  const cascadeSrc = readFile(path.join(__dirname, "scoringCascade.js"));
  const sources = [
    extractFn(serverSrc, "pass1"),
    extractFn(serverSrc, "pass2"),
    extractFn(serverSrc, "callClaudeVision"),
    extractFn(cascadeSrc, "tier4WebExtract"),
    extractFn(cascadeSrc, "tier5CategoryPrior"),
  ].join("\n---\n");
  __cached = "v" + crypto.createHash("sha256").update(sources).digest("hex").slice(0, 8);
  return __cached;
}

function cacheKey(q, category) {
  const norm = String(q || "").toLowerCase().trim().replace(/\s+/g, " ");
  const tail = category ? `${category}:${norm}` : norm;
  return `${promptVersion()}:${tail}`;
}

module.exports = { promptVersion, cacheKey };
