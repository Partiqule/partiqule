#!/usr/bin/env node
// Generate static SEO pages — one HTML file per calibrated product.
// Runs at build time via `prebuild` script in package.json.
//
// Output: frontend/public/products/<slug>.html  (served at /products/<slug>)
// Sitemap: frontend/public/sitemap.xml
//
// No runtime cost, no API calls. Pure static generation from calibration data.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const PUBLIC_DIR = path.resolve(__dirname, "../public");
const OUT_DIR = path.join(PUBLIC_DIR, "products");

// ── Load calibration data from the backend ──
// calibration.js exports { CALIBRATION } as a Map, not named exports via ESM.
// We read it as CommonJS through a dynamic require shim.
async function loadCalibration() {
  const require = (await import("node:module")).createRequire(import.meta.url);
  const { CALIBRATION } = require(path.join(ROOT, "backend/calibration.js"));
  return CALIBRATION;
}

// ── Slugify a product name into a URL-safe path segment ──
function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/['']/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// ── Score → label / color / tier ──
function scoreLabel(score) {
  if (score <= 2) return "Excellent";
  if (score <= 4) return "Good";
  if (score <= 6) return "Caution";
  if (score <= 8) return "Concern";
  return "Avoid";
}
function scoreColor(score) {
  if (score <= 2) return "#16a34a";
  if (score <= 4) return "#65a30d";
  if (score <= 6) return "#d97706";
  if (score <= 8) return "#dc2626";
  return "#7f1d1d";
}
function scoreBg(score) {
  if (score <= 2) return "#f0fdf4";
  if (score <= 4) return "#f7fee7";
  if (score <= 6) return "#fefce8";
  if (score <= 8) return "#fff7ed";
  return "#fff1f2";
}

// ── Render a single product page as an HTML string ──
function renderProductPage(productName, entry) {
  const slug       = slugify(productName);
  const score      = Math.round((entry.floor + entry.ceiling) / 2);
  const childScore = entry.kidsFloor ? Math.round((entry.kidsFloor + (entry.kidsCeiling || entry.ceiling)) / 2) : null;
  const label      = scoreLabel(score);
  const color      = scoreColor(score);
  const bg         = scoreBg(score);
  const category   = entry.category || "product";
  const substances = entry.substances || [];
  const reason     = entry.reason || "";

  const title       = `${titleCase(productName)} Score: ${score}/10 — ${label} | Partiqule`;
  const description = reason
    ? `${reason.slice(0, 155)}${reason.length > 155 ? "..." : ""}`
    : `${titleCase(productName)} scored ${score}/10 (${label}) for microplastic and chemical concerns. See what's in it and find cleaner alternatives on Partiqule.`;
  const canonicalUrl = `https://partiqule.com/products/${slug}`;
  const ogImage     = `https://partiqule.com/og-image.png`;

  // Schema.org structured data for rich results
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": titleCase(productName),
    "description": description,
    "category": category,
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": (10 - score).toFixed(1),
      "bestRating": "10",
      "worstRating": "0",
      "ratingCount": "1",
      "reviewCount": "1",
    },
    "review": {
      "@type": "Review",
      "author": { "@type": "Organization", "name": "Partiqule" },
      "datePublished": new Date().toISOString().slice(0, 10),
      "reviewBody": reason,
      "reviewRating": {
        "@type": "Rating",
        "ratingValue": (10 - score).toFixed(1),
        "bestRating": "10",
        "worstRating": "0",
      },
    },
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${canonicalUrl}">

<!-- Open Graph -->
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:type" content="product">
<meta property="og:image" content="${ogImage}">
<meta property="og:site_name" content="Partiqule">

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${ogImage}">

<!-- Schema.org Product rating -->
<script type="application/ld+json">
${JSON.stringify(structuredData, null, 2)}
</script>

<!-- Analytics -->
<script defer data-domain="partiqule.com" src="https://plausible.io/js/script.tagged-events.js"></script>

<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Outfit',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;color:#0a0a0a;background:#fafafa;line-height:1.6;-webkit-font-smoothing:antialiased}
  a{color:#16a34a;text-decoration:none}
  a:hover{text-decoration:underline}
  .container{max-width:720px;margin:0 auto;padding:0 24px}
  header{background:#052e16;color:#f1f5f9;padding:16px 0;border-bottom:1px solid #14532d}
  header .brand{font-size:20px;font-weight:700;color:#4ade80}
  .hero{background:#fff;padding:48px 0 40px;border-bottom:1px solid #e5e7eb}
  .category-tag{display:inline-block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#16a34a;margin-bottom:8px}
  h1{font-size:36px;font-weight:800;letter-spacing:-0.5px;margin-bottom:24px;line-height:1.15}
  .score-box{display:flex;align-items:center;gap:24px;padding:24px;background:${bg};border-radius:16px;border:2px solid ${color};margin-bottom:24px}
  .score-number{font-size:64px;font-weight:900;color:${color};line-height:1;font-family:'Outfit',sans-serif}
  .score-label{font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:${color};margin-bottom:4px}
  .score-desc{font-size:14px;color:#555}
  .reason{font-size:16px;line-height:1.7;color:#333;margin-bottom:32px;padding:20px;background:#fff;border-left:4px solid ${color};border-radius:8px}
  .section{padding:32px 0;border-bottom:1px solid #e5e7eb}
  .section h2{font-size:20px;font-weight:700;margin-bottom:16px;color:#0a0a0a}
  .concerns{display:flex;flex-wrap:wrap;gap:8px}
  .concern-tag{display:inline-block;padding:8px 14px;background:#fff1f2;color:#7f1d1d;font-size:13px;font-weight:600;border-radius:20px;border:1px solid #fecdd3}
  .child-notice{background:#fdf2f8;color:#9d174d;padding:16px 20px;border-radius:12px;margin-top:16px;font-size:14px;border:1px solid #fbcfe8}
  .child-notice strong{display:block;margin-bottom:4px}
  .cta{background:#16a34a;color:#fff;padding:18px 32px;border-radius:12px;font-size:16px;font-weight:700;display:inline-block;margin-top:8px;transition:background .15s}
  .cta:hover{background:#15803d;text-decoration:none}
  .cta-section{text-align:center;padding:48px 0;background:#fff}
  footer{padding:40px 0 80px;text-align:center;font-size:13px;color:#888}
  footer a{color:#888;margin:0 12px}
  .breadcrumb{font-size:13px;color:#888;padding:16px 0 0}
  .breadcrumb a{color:#16a34a}
  @media(max-width:640px){h1{font-size:28px}.score-number{font-size:52px}.score-box{flex-direction:column;text-align:center;gap:12px}}
</style>
</head>
<body>

<header>
  <div class="container">
    <a href="https://partiqule.com" class="brand">Partiqule</a>
  </div>
</header>

<div class="container">
  <div class="breadcrumb">
    <a href="/">Home</a> › <a href="/browse">Products</a> › ${titleCase(category.replace(/_/g, " "))}
  </div>

  <section class="hero">
    <div class="category-tag">${titleCase(category.replace(/_/g, " "))}</div>
    <h1>${escapeHtml(titleCase(productName))}</h1>

    <div class="score-box">
      <div class="score-number">${score}<span style="font-size:24px;opacity:0.5">/10</span></div>
      <div>
        <div class="score-label">${label}</div>
        <div class="score-desc">${scoreDesc(score)}</div>
      </div>
    </div>

    ${reason ? `<div class="reason">${escapeHtml(reason)}</div>` : ""}

    ${childScore ? `<div class="child-notice">
      <strong>👶 Child safety score: ${childScore}/10</strong>
      Children are more vulnerable to these concerns — this product scores higher for young users due to developing organ systems and higher exposure per body weight.
    </div>` : ""}
  </section>

  ${substances.length ? `<section class="section">
    <h2>Concerns identified</h2>
    <div class="concerns">
      ${substances.map(s => `<span class="concern-tag">${escapeHtml(s)}</span>`).join("\n      ")}
    </div>
  </section>` : ""}

  <section class="cta-section">
    <h2 style="margin-bottom:16px">Want a cleaner alternative?</h2>
    <p style="color:#555;margin-bottom:24px;max-width:480px;margin-left:auto;margin-right:auto">Partiqule instantly scans any product for microplastics, synthetic dyes, hormone disruptors, and more — and shows you cleaner swaps.</p>
    <a href="https://partiqule.com/?q=${encodeURIComponent(productName)}" class="cta">Scan this product in the app →</a>
  </section>
</div>

<footer>
  <div class="container">
    <div style="margin-bottom:12px">
      <a href="https://partiqule.com">Home</a>
      <a href="https://partiqule.com/methodology">How scoring works</a>
      <a href="https://partiqule.com/privacy">Privacy</a>
    </div>
    <div>© ${new Date().getFullYear()} Partiqule · Know what's in your products</div>
  </div>
</footer>

</body>
</html>`;
}

function titleCase(s) {
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

function scoreDesc(score) {
  if (score <= 2) return "Safe — no significant chemical or ingredient concerns.";
  if (score <= 4) return "Good — mostly clean, use with awareness.";
  if (score <= 6) return "Caution — real concerns, reduce use or find an alternative.";
  if (score <= 8) return "Concern — consider switching to a cleaner option.";
  return "Avoid — known harmful substances present.";
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Generate sitemap.xml ──
function renderSitemap(entries) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: "https://partiqule.com/", priority: "1.0", changefreq: "weekly" },
    { loc: "https://partiqule.com/methodology", priority: "0.7", changefreq: "monthly" },
    { loc: "https://partiqule.com/guides", priority: "0.7", changefreq: "weekly" },
    ...entries.map(({ slug }) => ({
      loc: `https://partiqule.com/products/${slug}`,
      priority: "0.6",
      changefreq: "monthly",
    })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join("\n")}
</urlset>`;
}

// ── Main ──
async function main() {
  console.log("[SEO] Generating product pages...");
  const calibration = await loadCalibration();

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // Clean out old files first (but keep the directory)
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (f.endsWith(".html")) fs.unlinkSync(path.join(OUT_DIR, f));
  }

  const entries = [];
  const seenSlugs = new Set();
  let written = 0, skipped = 0;

  for (const [productName, entry] of calibration.entries()) {
    // Skip entries with no real data
    if (!entry.floor || !entry.ceiling) { skipped++; continue; }
    // Skip very short names (likely partial matches)
    if (productName.length < 3) { skipped++; continue; }

    const slug = slugify(productName);
    if (!slug || seenSlugs.has(slug)) { skipped++; continue; }
    seenSlugs.add(slug);

    try {
      const html = renderProductPage(productName, entry);
      fs.writeFileSync(path.join(OUT_DIR, `${slug}.html`), html, "utf8");
      entries.push({ slug, name: productName });
      written++;
    } catch(e) {
      console.warn(`[SEO] Failed for "${productName}":`, e.message);
      skipped++;
    }
  }

  // Write sitemap
  const sitemap = renderSitemap(entries);
  fs.writeFileSync(path.join(PUBLIC_DIR, "sitemap.xml"), sitemap, "utf8");

  // Write robots.txt if it doesn't exist
  const robotsPath = path.join(PUBLIC_DIR, "robots.txt");
  if (!fs.existsSync(robotsPath)) {
    fs.writeFileSync(robotsPath,
      "User-agent: *\nAllow: /\n\nSitemap: https://partiqule.com/sitemap.xml\n", "utf8");
  }

  console.log(`[SEO] ✓ Generated ${written} product pages, skipped ${skipped}, sitemap has ${entries.length} URLs`);
}

main().catch(err => {
  console.error("[SEO] Generation failed:", err);
  process.exit(1);
});
