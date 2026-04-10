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

<!-- Google Fonts — matches main app -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">

<!-- Favicon -->
<link rel="icon" type="image/png" href="/favicon-512.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">

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
  :root{
    --green-dark:#052e16;
    --green-dark-line:#14532d;
    --green-bright:#4ade80;
    --green:#16a34a;
    --green-pale:#f0fdf4;
    --green-pale-border:#bbf7d0;
    --text:#0a0a0a;
    --muted:#64748b;
    --surface:#ffffff;
    --bg:#fafafa;
    --border:#e8e8e8;
  }
  html,body{font-family:'Outfit',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;color:var(--text);background:var(--bg);line-height:1.6;-webkit-font-smoothing:antialiased;letter-spacing:-0.01em}
  a{color:var(--green);text-decoration:none;transition:color 0.15s}
  a:hover{color:#15803d}
  .container{max-width:860px;margin:0 auto;padding:0 24px}

  /* ── NAV BAR — matches main app ── */
  .nav{background:#fff;border-bottom:1px solid var(--border);position:sticky;top:0;z-index:10;backdrop-filter:blur(10px);background:rgba(255,255,255,0.95)}
  .nav-inner{display:flex;align-items:center;justify-content:space-between;padding:14px 0}
  .brand{display:flex;align-items:center;gap:10px;font-family:'Outfit',sans-serif;font-weight:700;font-size:19px;color:var(--text);letter-spacing:-0.3px}
  .brand-mark{width:32px;height:32px;border-radius:9px;background:#052e16;display:flex;align-items:center;justify-content:center}
  .brand-mark svg{width:18px;height:18px}
  .nav-links{display:flex;align-items:center;gap:28px}
  .nav-links a{font-size:14px;color:var(--muted);font-weight:500}
  .nav-links a:hover{color:var(--text)}
  .nav-cta{background:var(--green);color:#fff!important;padding:9px 18px;border-radius:10px;font-size:14px;font-weight:700}
  .nav-cta:hover{background:#15803d}

  /* ── HERO — dark green with particles, matches main app ── */
  .hero{background:#052e16;color:#f1f5f9;padding:80px 0 72px;position:relative;overflow:hidden;border-bottom:1px solid #14532d}
  .hero::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 20% 30%,rgba(74,222,128,0.08),transparent 50%),radial-gradient(circle at 80% 70%,rgba(74,222,128,0.06),transparent 50%);pointer-events:none}
  .particle{position:absolute;border-radius:50%;background:#4ade80;pointer-events:none}
  .hero-inner{position:relative;z-index:1}
  .breadcrumb{font-size:12px;color:rgba(255,255,255,0.55);font-weight:500;letter-spacing:0.02em;margin-bottom:20px;text-transform:uppercase;letter-spacing:0.1em}
  .breadcrumb a{color:#4ade80}
  .breadcrumb-sep{margin:0 8px;opacity:0.5}
  h1{font-family:'Outfit',sans-serif;font-size:48px;font-weight:800;letter-spacing:-1px;line-height:1.08;margin-bottom:20px;color:#fff}
  .subtitle{font-size:17px;color:rgba(255,255,255,0.7);max-width:560px;line-height:1.55;margin-bottom:0}

  /* ── SCORE CARD — matches main app result card ── */
  .score-wrap{padding:48px 0 32px;background:var(--bg)}
  .score-card{background:var(--surface);border-radius:20px;padding:40px 36px;box-shadow:0 4px 20px rgba(0,0,0,0.04);border:1px solid var(--border);margin-top:-96px;position:relative;z-index:2}
  .score-top{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;margin-bottom:24px;flex-wrap:wrap}
  .score-meta{flex:1;min-width:200px}
  .score-category{display:inline-block;font-size:11px;font-weight:700;color:var(--green);background:var(--green-pale);padding:5px 11px;border-radius:20px;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px}
  .score-label-tag{display:inline-block;font-size:11px;font-weight:800;padding:6px 14px;border-radius:20px;text-transform:uppercase;letter-spacing:0.1em;margin-top:8px;background:${bg};color:${color};border:1px solid ${color}30}
  .score-number-box{text-align:right;flex-shrink:0}
  .score-number{font-family:'Outfit',sans-serif;font-weight:900;font-size:96px;line-height:0.9;color:${color};letter-spacing:-3px}
  .score-number-sub{font-size:18px;font-weight:700;color:${color};opacity:0.6;margin-top:-4px}
  .score-desc{font-size:15px;color:var(--muted);line-height:1.6;margin-top:12px}
  .reason-box{background:${bg};border-left:4px solid ${color};border-radius:10px;padding:18px 22px;font-size:15px;line-height:1.65;color:#1f2937;margin-top:24px}
  .child-notice{background:#fdf2f8;border:1px solid #fbcfe8;border-radius:14px;padding:18px 22px;margin-top:20px;display:flex;gap:16px;align-items:flex-start}
  .child-notice-icon{flex-shrink:0;width:40px;height:40px;border-radius:10px;background:#fce7f3;display:flex;align-items:center;justify-content:center;font-size:20px}
  .child-notice-content{flex:1;min-width:0}
  .child-notice-title{font-size:13px;font-weight:800;color:#9d174d;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px}
  .child-notice-score{font-size:22px;font-weight:900;color:#9d174d;font-family:'Outfit',sans-serif;margin-bottom:6px}
  .child-notice-body{font-size:13px;color:#831843;line-height:1.55}

  /* ── SECTIONS ── */
  .section{padding:40px 0;border-top:1px solid var(--border)}
  .section h2{font-family:'Outfit',sans-serif;font-size:22px;font-weight:800;margin-bottom:18px;color:var(--text);letter-spacing:-0.5px}
  .section-label{font-size:11px;font-weight:700;color:var(--green);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px}
  .concerns{display:flex;flex-wrap:wrap;gap:10px}
  .concern-tag{display:inline-flex;align-items:center;gap:6px;padding:10px 16px;background:#fff1f2;color:#7f1d1d;font-size:13px;font-weight:600;border-radius:24px;border:1px solid #fecdd3}
  .concern-tag::before{content:"●";color:#dc2626;font-size:10px}

  /* ── CTA SECTION ── */
  .cta-section{background:#052e16;color:#fff;padding:72px 0;text-align:center;position:relative;overflow:hidden}
  .cta-section::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,rgba(74,222,128,0.08),transparent 60%);pointer-events:none}
  .cta-inner{position:relative;z-index:1}
  .cta-label{font-size:12px;font-weight:700;color:#4ade80;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:12px}
  .cta-title{font-family:'Outfit',sans-serif;font-size:32px;font-weight:800;letter-spacing:-0.5px;margin-bottom:14px;color:#fff;max-width:540px;margin-left:auto;margin-right:auto;line-height:1.2}
  .cta-body{font-size:16px;color:rgba(255,255,255,0.75);max-width:520px;margin:0 auto 28px;line-height:1.55}
  .cta-btn{background:#4ade80;color:#052e16!important;padding:16px 36px;border-radius:12px;font-size:16px;font-weight:800;display:inline-block;transition:all 0.15s;letter-spacing:-0.2px}
  .cta-btn:hover{background:#86efac;transform:translateY(-1px);box-shadow:0 8px 24px rgba(74,222,128,0.2)}

  /* ── FOOTER ── */
  footer{background:#0a0a0a;color:rgba(255,255,255,0.55);padding:48px 0 60px;text-align:center;font-size:13px}
  footer .footer-brand{color:#4ade80;font-family:'Outfit',sans-serif;font-weight:700;font-size:18px;margin-bottom:16px;display:block}
  footer .footer-links{margin-bottom:20px}
  footer .footer-links a{color:rgba(255,255,255,0.55);margin:0 14px}
  footer .footer-links a:hover{color:#fff}
  footer .footer-legal{font-size:12px;color:rgba(255,255,255,0.35)}

  /* ── MOBILE ── */
  @media(max-width:720px){
    .nav-links a:not(.nav-cta){display:none}
    .hero{padding:56px 0 60px}
    h1{font-size:32px}
    .score-card{padding:28px 22px;margin-top:-60px}
    .score-number{font-size:72px}
    .score-top{flex-direction:column}
    .score-number-box{text-align:left;width:100%}
    .cta-title{font-size:24px}
    .section{padding:32px 0}
  }
</style>
</head>
<body>

<nav class="nav">
  <div class="container nav-inner">
    <a href="https://partiqule.com" class="brand">
      <span class="brand-mark">
        <svg viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <circle cx="12" cy="12" r="5" fill="#4ade80" fill-opacity="0.3"/>
          <circle cx="12" cy="12" r="1.5" fill="#4ade80"/>
        </svg>
      </span>
      Partiqule
    </a>
    <div class="nav-links">
      <a href="https://partiqule.com/methodology">How it works</a>
      <a href="https://partiqule.com/guides">Guides</a>
      <a href="https://partiqule.com" class="nav-cta">Scan a product →</a>
    </div>
  </div>
</nav>

<header class="hero">
  <!-- Floating particles matching main app -->
  <div class="particle" style="width:8px;height:8px;top:20%;left:8%;opacity:0.25"></div>
  <div class="particle" style="width:5px;height:5px;top:65%;left:15%;opacity:0.18"></div>
  <div class="particle" style="width:12px;height:12px;top:18%;right:12%;opacity:0.2"></div>
  <div class="particle" style="width:7px;height:7px;top:70%;right:18%;opacity:0.15"></div>
  <div class="particle" style="width:4px;height:4px;top:40%;left:50%;opacity:0.3"></div>
  <div class="particle" style="width:10px;height:10px;top:80%;left:40%;opacity:0.12"></div>
  <div class="particle" style="width:6px;height:6px;top:30%;right:35%;opacity:0.22"></div>
  <div class="particle" style="width:5px;height:5px;top:55%;left:30%;opacity:0.2"></div>
  <div class="particle" style="width:8px;height:8px;top:15%;left:55%;opacity:0.15"></div>
  <div class="particle" style="width:4px;height:4px;top:45%;right:8%;opacity:0.25"></div>

  <div class="container hero-inner">
    <div class="breadcrumb">
      <a href="https://partiqule.com">Home</a>
      <span class="breadcrumb-sep">›</span>
      Products
      <span class="breadcrumb-sep">›</span>
      ${titleCase(category.replace(/_/g, " "))}
    </div>
    <h1>${escapeHtml(titleCase(productName))}</h1>
    <p class="subtitle">${reason ? escapeHtml(reason.slice(0, 180) + (reason.length > 180 ? "..." : "")) : `Independent scoring for microplastic and chemical concerns across materials, usage, packaging, and sustainability.`}</p>
  </div>
</header>

<section class="score-wrap">
  <div class="container">
    <div class="score-card">
      <div class="score-top">
        <div class="score-meta">
          <div class="score-category">${titleCase(category.replace(/_/g, " "))}</div>
          <div style="font-family:'Outfit',sans-serif;font-weight:800;font-size:26px;color:var(--text);letter-spacing:-0.5px;line-height:1.2">${escapeHtml(titleCase(productName))}</div>
          <div class="score-label-tag">${label}</div>
          <div class="score-desc">${scoreDesc(score)}</div>
        </div>
        <div class="score-number-box">
          <div class="score-number">${score}</div>
          <div class="score-number-sub">out of 10</div>
        </div>
      </div>

      ${reason ? `<div class="reason-box">${escapeHtml(reason)}</div>` : ""}

      ${childScore ? `<div class="child-notice">
        <div class="child-notice-icon">👶</div>
        <div class="child-notice-content">
          <div class="child-notice-title">Child safety score</div>
          <div class="child-notice-score">${childScore} / 10</div>
          <div class="child-notice-body">Children are more vulnerable to these concerns — developing organ systems, higher exposure per body weight, and thinner skin all amplify chemical impact for young users.</div>
        </div>
      </div>` : ""}
    </div>
  </div>
</section>

${substances.length ? `<section class="section">
  <div class="container">
    <div class="section-label">Flagged concerns</div>
    <h2>What's in it</h2>
    <div class="concerns">
      ${substances.map(s => `<span class="concern-tag">${escapeHtml(s)}</span>`).join("\n      ")}
    </div>
  </div>
</section>` : ""}

<section class="cta-section">
  <div class="container cta-inner">
    <div class="cta-label">Ready for a cleaner swap?</div>
    <h2 class="cta-title">Scan any product. See what's really in it.</h2>
    <p class="cta-body">Partiqule instantly scores any product for microplastics, synthetic dyes, hormone disruptors, and more — then shows cleaner alternatives.</p>
    <a href="https://partiqule.com/?q=${encodeURIComponent(productName)}" class="cta-btn">Open Partiqule →</a>
  </div>
</section>

<footer>
  <div class="container">
    <span class="footer-brand">Partiqule</span>
    <div class="footer-links">
      <a href="https://partiqule.com">Home</a>
      <a href="https://partiqule.com/methodology">How scoring works</a>
      <a href="https://partiqule.com/guides">Guides</a>
      <a href="https://partiqule.com/privacy">Privacy</a>
    </div>
    <div class="footer-legal">© ${new Date().getFullYear()} Partiqule · Know what's in your products</div>
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
