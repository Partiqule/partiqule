#!/usr/bin/env node
// Stamps a content-hash query param onto every og:image and twitter:image URL
// in the built dist/index.html so link-preview scrapers (Instagram, Facebook,
// iMessage, Twitter, Slack, LinkedIn) rescrape automatically whenever the
// underlying image content changes.
//
// Runs as the `postbuild` step in frontend/package.json — after Vite has
// written dist/index.html, this edits the og:image and twitter:image meta
// tags in place to append `?v=<8-char-sha>`. The same fingerprinting logic
// in generate-product-pages.js handles per-SKU SEO pages.
//
// Why URL fingerprinting:
//   Facebook/Instagram/iMessage/Twitter all cache OG previews keyed on URL
//   for 7-30 days. A design refresh to og-image.png doesn't refresh those
//   cached previews — the URL didn't change. Appending ?v=<hash> makes the
//   URL change when content changes, so scrapers rescrape on next view
//   without any manual debugger intervention.
//
// No file renames, no 404s: the underlying PNG still lives at the clean
// path; the query param is ignored by the server but fingerprints the URL
// for scraper cache keys.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const PUBLIC = path.join(ROOT, "public");

function imageVersion(publicPath) {
  const abs = path.join(PUBLIC, publicPath.replace(/^\//, ""));
  if (!fs.existsSync(abs)) return null;
  const bytes = fs.readFileSync(abs);
  return crypto.createHash("sha1").update(bytes).digest("hex").slice(0, 8);
}

function fingerprintFile(htmlPath) {
  if (!fs.existsSync(htmlPath)) return false;
  let html = fs.readFileSync(htmlPath, "utf8");
  let changed = false;

  // Match og:image / twitter:image meta tags pointing at partiqule.com URLs.
  // Only rewrite URLs we can hash locally (i.e. files under frontend/public/).
  const metaPattern = /(<meta[^>]+(?:property="og:image(?::secure_url)?"|name="twitter:image")[^>]+content=")([^"?]+)(?:\?v=[^"]*)?("[^>]*>)/g;
  html = html.replace(metaPattern, (match, pre, urlStr, post) => {
    // Only fingerprint our own domain images
    try {
      const parsed = new URL(urlStr);
      if (parsed.hostname !== "partiqule.com") return match;
      const ver = imageVersion(parsed.pathname);
      if (!ver) return match;
      changed = true;
      return `${pre}${parsed.origin}${parsed.pathname}?v=${ver}${post}`;
    } catch {
      return match;
    }
  });

  if (changed) {
    fs.writeFileSync(htmlPath, html, "utf8");
  }
  return changed;
}

function main() {
  const targets = [path.join(DIST, "index.html")];
  let touched = 0;
  for (const t of targets) {
    if (fingerprintFile(t)) {
      touched++;
      console.log(`[og-fingerprint] stamped ${path.relative(ROOT, t)}`);
    }
  }
  if (!touched) {
    console.log("[og-fingerprint] no files needed updating");
  }
}

main();
