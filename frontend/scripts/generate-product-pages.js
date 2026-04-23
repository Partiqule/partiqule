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
import crypto from "node:crypto";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const PUBLIC_DIR = path.resolve(__dirname, "../public");
const OUT_DIR = path.join(PUBLIC_DIR, "products");

// ── OG image cache-busting ──
// Instagram, Facebook, iMessage, Twitter etc. cache OG preview images keyed
// on URL for 7-30 days. A design refresh to og-image.png doesn't refresh
// those cached previews — the URL didn't change, so scrapers don't re-fetch.
//
// Fix: append a content-hash query param (?v=<8-char sha>) to every og:image
// URL. Next time a scraper hits the page, it sees a new URL and refetches
// the (fresh) image. When the image content changes, the hash changes,
// and cached references become stale and trigger a rescrape on next view.
//
// No file renames, no 404s — the underlying PNG still lives at the clean
// path; the query param is ignored by the server but fingerprints the URL
// for scraper cache keys.
const _hashCache = new Map();
function imageVersion(absPath) {
  if (_hashCache.has(absPath)) return _hashCache.get(absPath);
  if (!fs.existsSync(absPath)) {
    _hashCache.set(absPath, null);
    return null;
  }
  const bytes = fs.readFileSync(absPath);
  const hash = crypto.createHash("sha1").update(bytes).digest("hex").slice(0, 8);
  _hashCache.set(absPath, hash);
  return hash;
}
function versionedImageUrl(publicPath) {
  const abs = path.join(PUBLIC_DIR, publicPath.replace(/^\//, ""));
  const v = imageVersion(abs);
  const base = `https://partiqule.com${publicPath.startsWith("/") ? publicPath : "/" + publicPath}`;
  return v ? `${base}?v=${v}` : base;
}

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
// Colors pull from the app's natural-earth palette in frontend/src/tokens.css.
// Score thresholds match App.jsx scoreColor/scoreBg helpers (≤3 green, ≤5 amber, >5 red).
function scoreLabel(score) {
  if (score <= 3) return "Looks good";
  if (score <= 5) return "Judgment call";
  if (score <= 7) return "I'd skip";
  return "Hard pass";
}
function scoreVerdict(score) {
  if (score <= 3) return "Looks good to me.";
  if (score <= 5) return "I'd swap if you can.";
  if (score <= 7) return "I'd skip if you can.";
  return "Hard pass.";
}
function scoreColor(score) {
  if (score <= 3) return "#6b8c3e";   // --score-green, leaf
  if (score <= 5) return "#c49a33";   // --score-amber, wheat
  return "#b0493a";                   // --score-red, terracotta
}
function scoreSoftBg(score) {
  if (score <= 3) return "rgba(107, 140, 62, 0.08)";
  if (score <= 5) return "rgba(196, 154, 51, 0.10)";
  return "rgba(176, 73, 58, 0.08)";
}

// ── Render a single product page as an HTML string ──
function renderProductPage(productName, entry) {
  const slug       = slugify(productName);
  const score      = Math.round((entry.floor + entry.ceiling) / 2);
  const childScore = entry.kidsFloor ? Math.round((entry.kidsFloor + (entry.kidsCeiling || entry.ceiling)) / 2) : null;
  const label      = scoreLabel(score);
  const verdict    = scoreVerdict(score);
  const color      = scoreColor(score);
  const softBg     = scoreSoftBg(score);
  const category   = entry.category || "product";
  const substances = entry.substances || [];
  const reason     = entry.reason || "";
  const releaseStatus = entry.status ? {
    status: entry.status,
    note: entry.statusNote || null,
    expected_release: entry.statusExpectedRelease || null,
    verified: entry.verified || [],
    pending: entry.pending || [],
    third_party_references: entry.thirdPartyReferences || [],
  } : null;

  const title       = `${titleCase(productName)} Score: ${score}/10 — ${label} | Partiqule`;
  const description = reason
    ? `${reason.slice(0, 155)}${reason.length > 155 ? "..." : ""}`
    : `${titleCase(productName)} scored ${score}/10 (${label}) for microplastic and chemical concerns. See what's in it and find cleaner alternatives on Partiqule.`;
  const canonicalUrl = `https://partiqule.com/products/${slug}`;
  // Per-product OG preview if one exists in public/og/<slug>.png, else the
  // shared site-wide card at /og-image.png. Per-product files are generated
  // by frontend/scripts/build-product-og-images.py (manifest-driven — opt in
  // per product so the repo doesn't balloon with 3,000 PNGs).
  //
  // Every URL carries ?v=<8-char-sha> fingerprint — when we ship a refreshed
  // OG image, the hash changes and scrapers rescrape on next view.
  const perProductOg = path.join(PUBLIC_DIR, "og", `${slug}.png`);
  const ogImage = fs.existsSync(perProductOg)
    ? versionedImageUrl(`/og/${slug}.png`)
    : versionedImageUrl(`/og-image.png`);

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
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT,WONK@9..144,300..700,0..100,0..1&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">

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
  /* Design tokens — mirrored from frontend/src/tokens.css. Keep in sync. */
  *{box-sizing:border-box;margin:0;padding:0}
  :root{
    --cream:#f3ede2;
    --cream-light:#f7f1e7;
    --ivory:#f9f5ea;
    --ink:#1a1f15;
    --ink-soft:#4a5342;
    --ink-faint:#8a9080;
    --moss:#2d5a27;
    --moss-deep:#1f3f1b;
    --amber:#c8781a;
    --moss-soft:rgba(45, 90, 39, 0.08);
    --rule:rgba(26, 31, 21, 0.16);
    --rule-soft:rgba(26, 31, 21, 0.08);
    --rule-strong:rgba(26, 31, 21, 0.28);
    --tile-shape-2:14px 10px 15px 12px / 10px 15px 12px 14px;
    --card-shape-2:20px 14px 18px 16px / 14px 18px 16px 20px;
    --cta-shape:22px 18px 24px 20px / 20px 24px 18px 22px;
  }
  html,body{font-family:'DM Sans',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;color:var(--ink);background:var(--cream);line-height:1.55;-webkit-font-smoothing:antialiased}
  a{color:var(--moss);text-decoration:none;transition:color 0.15s}
  a:hover{color:var(--moss-deep)}
  .container{max-width:780px;margin:0 auto;padding:0 24px}

  /* ── NAV — cream with moss wordmark ── */
  .nav{background:var(--cream);border-bottom:1px solid var(--rule);position:sticky;top:0;z-index:10}
  .nav-inner{display:flex;align-items:center;justify-content:space-between;padding:16px 0}
  .brand{display:flex;align-items:center}
  .brand img{height:28px;width:auto;display:block}
  .nav-links{display:flex;align-items:center;gap:24px}
  .nav-links a{font-size:13px;color:var(--ink-soft);font-weight:500}
  .nav-links a:hover{color:var(--ink)}
  .nav-cta{background:var(--moss);color:var(--ivory)!important;padding:9px 16px;border-radius:var(--tile-shape-2);font-size:13px;font-weight:500;letter-spacing:0.01em}
  .nav-cta:hover{background:var(--moss-deep)}

  /* ── HEADER — cream with warm morning-light gradient ── */
  .hero{background:var(--cream);padding:40px 0 8px;position:relative;overflow:hidden}
  .hero::before{content:"";position:absolute;top:0;left:0;right:0;height:240px;background:linear-gradient(to bottom, rgba(255,230,180,0.32) 0%, rgba(245,220,180,0.08) 70%, transparent 100%);pointer-events:none;z-index:0}
  .hero-inner{position:relative;z-index:1}
  .stamp{display:inline-flex;align-items:center;gap:10px;font-size:10px;color:var(--moss);font-weight:500;letter-spacing:0.22em;text-transform:uppercase;margin-bottom:16px}
  .stamp::before{content:"";display:inline-block;width:22px;height:1px;background:var(--moss);opacity:0.7}
  .stamp a{color:var(--moss)}
  .breadcrumb-sep{opacity:0.5;margin:0 6px}
  h1{font-family:'Fraunces',Georgia,serif;font-size:40px;font-weight:400;letter-spacing:-0.015em;line-height:1.08;margin-bottom:18px;color:var(--ink)}

  /* ── SCORE CARD ── */
  .score-wrap{padding:18px 0 32px;background:var(--cream)}
  .score-card{background:var(--cream-light);border:1px solid var(--rule);border-radius:var(--card-shape-2);padding:32px 32px;position:relative}
  .score-top{display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap}
  .score-meta{flex:1;min-width:220px}
  .score-category-row{display:flex;align-items:center;gap:10px;margin-bottom:14px;font-family:'DM Sans',system-ui,sans-serif;font-size:10px;letter-spacing:0.22em;color:var(--moss);text-transform:uppercase;font-weight:500}
  .score-category-row::before{content:"";display:inline-block;width:22px;height:1px;background:var(--moss);opacity:0.7}
  .score-verdict{font-family:'Fraunces',Georgia,serif;font-size:26px;line-height:1.2;color:var(--ink);letter-spacing:-0.01em;font-weight:400;margin-bottom:8px}
  .score-context{font-size:13px;color:var(--ink-faint);line-height:1.55}
  .score-number-box{flex-shrink:0;text-align:right}
  .score-number{font-family:'Fraunces',Georgia,serif;font-weight:400;font-size:84px;line-height:0.95;color:${color};letter-spacing:-0.02em;background:${softBg};padding:4px 20px;border-radius:14px;display:inline-block}
  .score-number-sub{font-size:13px;color:${color};opacity:0.55;margin-top:6px;font-family:'DM Sans',system-ui,sans-serif;font-weight:400;letter-spacing:0.02em}

  /* ── PRE-RELEASE CARD ── */
  .release-card{background:var(--cream-light);border:1px solid var(--amber);border-radius:var(--card-shape-2);padding:16px 20px;margin-top:20px;font-family:'DM Sans',system-ui,sans-serif}
  .release-header{display:flex;align-items:center;gap:10px;margin-bottom:8px;font-size:10px;letter-spacing:0.22em;color:var(--amber);text-transform:uppercase;font-weight:500}
  .release-header::before{content:"";display:inline-block;width:18px;height:1px;background:var(--amber);opacity:0.8}
  .release-note{font-size:13px;color:var(--ink-soft);line-height:1.55}
  .release-expected{color:var(--ink-faint)}
  .release-list-label{font-size:10px;letter-spacing:0.22em;text-transform:uppercase;font-weight:500;margin-top:14px;margin-bottom:8px;display:flex;align-items:center;gap:10px}
  .release-list-label.verified{color:var(--moss)}
  .release-list-label.pending{color:var(--amber)}
  .release-list-label.coverage{color:var(--moss)}
  .release-list-label::before{content:"";display:inline-block;width:22px;height:1px;opacity:0.7}
  .release-list-label.verified::before{background:var(--moss)}
  .release-list-label.pending::before{background:var(--amber)}
  .release-list-label.coverage::before{background:var(--moss)}
  .release-row{font-size:13px;color:var(--ink-soft);line-height:1.55;margin-bottom:6px;display:flex;gap:8px;align-items:flex-start}
  .release-row-check{flex-shrink:0;margin-top:2px;color:var(--moss);font-weight:500}
  .release-row-meta{color:var(--ink-faint);font-size:12px}
  .release-row-link{color:var(--moss);font-weight:500}

  /* ── REASON ── */
  .reason-wrap{padding:32px 0 20px}
  .reason-label{display:flex;align-items:center;gap:10px;font-size:10px;letter-spacing:0.22em;color:var(--moss);text-transform:uppercase;font-weight:500;margin-bottom:14px}
  .reason-label::before{content:"";display:inline-block;width:22px;height:1px;background:var(--moss);opacity:0.7}
  .reason-body{font-family:'Fraunces',Georgia,serif;font-size:18px;line-height:1.55;color:var(--ink);font-weight:400;letter-spacing:-0.005em}

  /* ── WHAT'S IN IT ── */
  .concerns-wrap{padding:8px 0 32px}
  .concerns{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
  .concern-tag{display:inline-flex;align-items:center;padding:8px 14px;background:var(--cream-light);color:var(--ink-soft);font-family:'DM Sans',system-ui,sans-serif;font-size:12px;font-weight:500;letter-spacing:0.02em;border-radius:var(--tile-shape-2);border:1px solid var(--rule)}

  /* ── KIDS NOTE ── */
  .kids-note{background:var(--cream-light);border:1px solid var(--rule);border-radius:var(--tile-shape-2);padding:16px 20px;margin-top:20px}
  .kids-note-label{font-size:10px;letter-spacing:0.22em;color:var(--amber);text-transform:uppercase;font-weight:500;margin-bottom:6px;display:flex;align-items:center;gap:10px}
  .kids-note-label::before{content:"";display:inline-block;width:22px;height:1px;background:var(--amber);opacity:0.7}
  .kids-note-score{font-family:'Fraunces',Georgia,serif;font-size:24px;color:var(--ink);font-weight:400;letter-spacing:-0.01em;margin-bottom:4px}
  .kids-note-body{font-size:13px;color:var(--ink-soft);line-height:1.55}

  /* ── CTA ── */
  .cta-section{background:var(--cream-light);padding:48px 0;margin-top:40px;border-top:1px solid var(--rule)}
  .cta-inner{text-align:center}
  .cta-label{font-size:10px;letter-spacing:0.22em;color:var(--moss);text-transform:uppercase;font-weight:500;margin-bottom:12px;display:inline-flex;align-items:center;gap:10px}
  .cta-label::before{content:"";display:inline-block;width:22px;height:1px;background:var(--moss);opacity:0.7}
  .cta-title{font-family:'Fraunces',Georgia,serif;font-size:28px;font-weight:400;letter-spacing:-0.015em;line-height:1.2;margin-bottom:10px;color:var(--ink);max-width:520px;margin-left:auto;margin-right:auto}
  .cta-body{font-size:14px;color:var(--ink-soft);max-width:460px;margin:0 auto 22px;line-height:1.55}
  .cta-btn{background:var(--moss);color:var(--ivory)!important;padding:14px 28px;border-radius:var(--cta-shape);font-size:14px;font-weight:500;letter-spacing:0.01em;display:inline-block;transition:background 0.2s}
  .cta-btn:hover{background:var(--moss-deep)}

  /* ── FOOTER ── */
  footer{background:var(--cream);color:var(--ink-faint);padding:32px 0 40px;text-align:center;font-size:12px;border-top:1px solid var(--rule-soft)}
  footer .footer-brand{display:inline-block;margin-bottom:12px}
  footer .footer-brand img{height:22px;width:auto;display:block}
  footer .footer-links{margin-bottom:10px}
  footer .footer-links a{color:var(--ink-soft);margin:0 10px}
  footer .footer-links a:hover{color:var(--ink)}
  footer .footer-legal{font-size:11px;color:var(--ink-faint)}

  /* ── MOBILE ── */
  @media(max-width:720px){
    .nav-links a:not(.nav-cta){display:none}
    .hero{padding:32px 0 8px}
    h1{font-size:30px}
    .score-card{padding:24px 20px}
    .score-top{flex-direction:column;align-items:flex-start}
    .score-number-box{text-align:left}
    .score-number{font-size:64px;padding:2px 16px}
    .cta-title{font-size:22px}
  }
</style>
</head>
<body>

<nav class="nav">
  <div class="container nav-inner">
    <a href="https://partiqule.com" class="brand">
      <img src="/partiqule-wordmark-light.svg" alt="Partiqule">
    </a>
    <div class="nav-links">
      <a href="https://partiqule.com/methodology">How it works</a>
      <a href="https://partiqule.com/guides">Guides</a>
      <a href="https://partiqule.com" class="nav-cta">Scan a product</a>
    </div>
  </div>
</nav>

<header class="hero">
  <div class="container hero-inner">
    <div class="stamp">
      <a href="https://partiqule.com">Home</a>
      <span class="breadcrumb-sep">›</span>
      <span>${escapeHtml(titleCase(category.replace(/_/g, " ")))}</span>
    </div>
    <h1>${escapeHtml(titleCase(productName))}</h1>
  </div>
</header>

<section class="score-wrap">
  <div class="container">
    <div class="score-card">
      <div class="score-top">
        <div class="score-meta">
          <div class="score-category-row">${escapeHtml(titleCase(category.replace(/_/g, " ")))}</div>
          <div class="score-verdict">${escapeHtml(verdict)}</div>
          <div class="score-context">${escapeHtml(label)} — ${escapeHtml(scoreDesc(score))}</div>
        </div>
        <div class="score-number-box">
          <div class="score-number">${score}</div>
          <div class="score-number-sub">out of 10</div>
        </div>
      </div>

      ${releaseStatus ? renderReleaseCard(releaseStatus) : ""}

      ${childScore ? `<div class="kids-note">
        <div class="kids-note-label">For kids</div>
        <div class="kids-note-score">${childScore} / 10</div>
        <div class="kids-note-body">Kids are more exposed to these concerns — developing organ systems, higher exposure per body weight, and thinner skin amplify chemical impact.</div>
      </div>` : ""}
    </div>
  </div>
</section>

${reason ? `<section class="reason-wrap">
  <div class="container">
    <div class="reason-label">The why</div>
    <div class="reason-body">${escapeHtml(reason)}</div>
  </div>
</section>` : ""}

${substances.length ? `<section class="concerns-wrap">
  <div class="container">
    <div class="reason-label">What's in it</div>
    <div class="concerns">
      ${substances.map(s => `<span class="concern-tag">${escapeHtml(s)}</span>`).join("\n      ")}
    </div>
  </div>
</section>` : ""}

<section class="cta-section">
  <div class="container cta-inner">
    <div class="cta-label">Scan another</div>
    <h2 class="cta-title">Open Partiqule. Know what's really in it.</h2>
    <p class="cta-body">Score any product for microplastics, synthetic dyes, hormone disruptors, and more. Plus cleaner alternatives, one tap away.</p>
    <a href="https://partiqule.com/?q=${encodeURIComponent(productName)}" class="cta-btn">Open Partiqule</a>
  </div>
</section>

<footer>
  <div class="container">
    <a href="https://partiqule.com" class="footer-brand">
      <img src="/partiqule-wordmark-light.svg" alt="Partiqule">
    </a>
    <div class="footer-links">
      <a href="https://partiqule.com">Home</a>
      <a href="https://partiqule.com/methodology">How scoring works</a>
      <a href="https://partiqule.com/guides">Guides</a>
      <a href="https://partiqule.com/privacy">Privacy</a>
    </div>
    <div class="footer-legal">© ${new Date().getFullYear()} Partiqule · Know what's really in it</div>
  </div>
</footer>

</body>
</html>`;
}

// ── Pre-release card render — matches App.jsx release-card block ──
function renderReleaseCard(rs) {
  const headerLabel = rs.status === "pre_release" ? "Not yet shipped" : rs.status.replace(/_/g, " ");
  const defaultNote = "This product isn't available for purchase yet. Score reflects the brand's stated claims — we'll update once independent verification lands.";
  const noteHtml = escapeHtml(rs.note || defaultNote);
  const expected = rs.expected_release ? ` <span class="release-expected">Expected: ${escapeHtml(rs.expected_release)}.</span>` : "";

  const verifiedBlock = Array.isArray(rs.verified) && rs.verified.length > 0
    ? `<div class="release-list-label verified">Verified</div>` +
      rs.verified.map(v => {
        const meta = [v.source, v.date].filter(Boolean).join(", ");
        const claimNode = v.url
          ? `<a href="${escapeHtml(v.url)}" target="_blank" rel="noopener noreferrer" class="release-row-link">${escapeHtml(v.claim)}</a>`
          : escapeHtml(v.claim);
        return `<div class="release-row"><span class="release-row-check">✓</span><div>${claimNode}${meta ? ` <span class="release-row-meta">· ${escapeHtml(meta)}</span>` : ""}</div></div>`;
      }).join("\n")
    : "";

  const pendingBlock = Array.isArray(rs.pending) && rs.pending.length > 0
    ? `<div class="release-list-label pending">Pending</div>` +
      rs.pending.map(p => {
        const extras = [p.status, p.expectedBy ? `expected ${p.expectedBy}` : null].filter(Boolean).join(" · ");
        return `<div class="release-row"><span class="release-row-meta">·</span><div>${escapeHtml(p.claim)}${extras ? ` <span class="release-row-meta">· ${escapeHtml(extras)}</span>` : ""}</div></div>`;
      }).join("\n")
    : "";

  const coverageBlock = Array.isArray(rs.third_party_references) && rs.third_party_references.length > 0
    ? `<div class="release-list-label coverage">Independent coverage</div>` +
      rs.third_party_references.map(t => {
        const summaryRow = t.summary ? `<div class="release-row-meta" style="margin-top:2px">${escapeHtml(t.summary)}</div>` : "";
        return `<div class="release-row"><div><a href="${escapeHtml(t.url || "#")}" target="_blank" rel="noopener noreferrer" class="release-row-link">${escapeHtml(t.source || "Source")}</a>${t.date ? ` <span class="release-row-meta">${escapeHtml(t.date)}</span>` : ""}${summaryRow}</div></div>`;
      }).join("\n")
    : "";

  return `<div class="release-card">
    <div class="release-header">${escapeHtml(headerLabel)}</div>
    <div class="release-note">${noteHtml}${expected}</div>
    ${verifiedBlock}
    ${pendingBlock}
    ${coverageBlock}
  </div>`;
}

function titleCase(s) {
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

function scoreDesc(score) {
  if (score <= 3) return "no significant chemical or ingredient concerns.";
  if (score <= 5) return "real concerns, but manageable if you can't swap.";
  if (score <= 7) return "real concerns — worth finding a cleaner option.";
  return "known harmful substances present.";
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
