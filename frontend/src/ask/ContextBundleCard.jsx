// R5b.3 Ask mode — ContextBundleCard render path.
//
// Used when a type 3 (context bundle) response streams back from
// /ask. Renders the bundle intro line and per-category sections.
// Each category shows a reasoning line and 1-3 product cards.
//
// Streaming contract: parent receives one "bundle_intro" event
// followed by N "category" events, then a terminal "done" event.
// Parent passes the bundle_intro payload as `bundle` and the
// accumulated category payloads as `categories`. Per-product buy
// links are decorated upstream via decorateItem so each card
// renders Amazon / Brand / Target chips.

import React from "react";

const CARD_SHAPE = "14px 10px 15px 12px / 10px 15px 12px 14px";
const TILE_SHAPE = "12px 16px 14px 18px / 16px 12px 18px 14px";
const CTA_SHAPE  = "22px 18px 24px 20px / 20px 24px 18px 22px";

const scoreColor = (s) => {
  if (s == null) return "var(--ink-faint)";
  if (s <= 3) return "var(--score-green)";
  if (s <= 5) return "var(--score-amber)";
  return "var(--score-red)";
};

const scoreBg = (s) => {
  if (s == null) return "var(--rule-soft)";
  if (s <= 3) return "rgba(107, 140, 62, 0.10)";
  if (s <= 5) return "rgba(196, 154, 51, 0.10)";
  return "rgba(176, 73, 58, 0.10)";
};

const SectionStamp = ({ label, color = "var(--moss)" }) => (
  <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:10}}>
    <span style={{display:"inline-block", width:22, height:1, background:color, opacity:0.7}}/>
    <span style={{
      fontFamily:"'DM Sans', system-ui, sans-serif",
      fontSize:10, letterSpacing:"0.22em", textTransform:"uppercase",
      fontWeight:500, color,
    }}>{label}</span>
  </div>
);

const ScoreDot = ({ score }) => {
  if (score == null) return null;
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:5,
      padding:"2px 8px", borderRadius:999,
      background:scoreBg(score), border:`1px solid ${scoreColor(score)}`,
      fontFamily:"'DM Sans', system-ui, sans-serif",
      fontSize:11, fontWeight:600, color:scoreColor(score),
    }}>
      <span style={{width:5, height:5, borderRadius:"50%", background:scoreColor(score)}}/>
      {score}
    </span>
  );
};

const ProductAvatar = ({ url, name, score, size = 40 }) => {
  if (url) {
    return (
      <div style={{flexShrink:0, width:size, height:size, borderRadius:TILE_SHAPE, overflow:"hidden", background:"var(--cream-light)"}}>
        <img src={url} alt="" style={{width:"100%", height:"100%", objectFit:"cover", display:"block"}}/>
      </div>
    );
  }
  const initial = String(name || "?").trim().charAt(0).toUpperCase() || "?";
  const bg = score == null ? "var(--ink-faint)"
    : score <= 3 ? "var(--score-green)"
    : score <= 5 ? "var(--score-amber)"
    : "var(--score-red)";
  return (
    <div aria-hidden="true" style={{
      flexShrink:0, width:size, height:size,
      borderRadius:TILE_SHAPE,
      background: bg, color: "var(--ivory)",
      display:"flex", alignItems:"center", justifyContent:"center",
      fontFamily:"'Lora', Georgia, serif",
      fontSize: Math.round(size * 0.46), fontWeight:500, letterSpacing:"-0.02em",
    }}>{initial}</div>
  );
};

const BuyChips = ({ links }) => {
  if (!links) return null;
  const entries = [];
  if (links.amazon) entries.push({ key: "amazon", label: "Amazon", url: links.amazon });
  if (links.brand)  entries.push({ key: "brand",  label: "Brand",  url: links.brand });
  if (links.target) entries.push({ key: "target", label: "Target", url: links.target });
  if (!entries.length) return null;
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: 6,
      marginTop: 10,
      paddingLeft: 54,  // align under product name (40px avatar + 14px gap)
    }}>
      {entries.map(e => (
        <a key={e.key} href={e.url} target="_blank" rel="noopener noreferrer"
           aria-label={`Open on ${e.label}`}
           style={{
             display: "inline-flex", alignItems: "center", gap: 4,
             padding: "3px 9px",
             borderRadius: 999,
             border: "1px solid var(--rule)",
             background: "transparent",
             fontFamily: "'DM Sans', system-ui, sans-serif",
             fontSize: 11, fontWeight: 500,
             color: "var(--ink-soft)",
             textDecoration: "none",
             letterSpacing: "0.01em",
           }}>
          {e.label} <span style={{color: "var(--moss)"}}>→</span>
        </a>
      ))}
    </div>
  );
};

const ProductTile = ({ product }) => {
  if (!product) return null;
  return (
    <div style={{
      padding: "12px 14px",
      background: "var(--cream)",
      border: "1px solid var(--rule)",
      borderRadius: TILE_SHAPE,
    }}>
      <div style={{display: "flex", alignItems: "center", gap: 14}}>
        <ProductAvatar url={product.image_url} name={product.product_name} score={product.score} size={40}/>
        <div style={{
          flex: 1, minWidth: 0,
          fontFamily:"'DM Sans', system-ui, sans-serif",
          fontSize: 14, fontWeight: 500,
          color: "var(--ink)", lineHeight: 1.35,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{product.product_name}</div>
        <div style={{flexShrink: 0}}>
          <ScoreDot score={product.score}/>
        </div>
      </div>
      <BuyChips links={product.buy_links}/>
    </div>
  );
};

const CategorySection = ({ category }) => (
  <div style={{marginTop: 24}}>
    <div style={{display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8}}>
      <div style={{
        fontFamily:"'Lora', Georgia, serif",
        fontSize: 19, fontWeight: 400,
        color:"var(--ink)", letterSpacing:"-0.005em", lineHeight: 1.3,
      }}>{category.label}</div>
      {category.sparse && (
        <span style={{
          fontFamily:"'DM Sans', system-ui, sans-serif",
          fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase",
          fontWeight: 600, color: "var(--amber)",
        }}>Limited coverage</span>
      )}
    </div>
    {category.reasoning && (
      <div style={{
        fontFamily:"'DM Sans', system-ui, sans-serif",
        fontSize: 13, color: "var(--ink-soft)",
        lineHeight: 1.55, marginBottom: 14,
      }}>{category.reasoning}</div>
    )}
    {Array.isArray(category.products) && category.products.length > 0 ? (
      <div style={{display: "flex", flexDirection: "column", gap: 12}}>
        {category.products.map(p => (
          <ProductTile key={p.id} product={p}/>
        ))}
      </div>
    ) : (
      <div style={{
        padding: "12px 14px",
        background: "var(--cream-light)",
        border: "1px dashed var(--rule)",
        borderRadius: TILE_SHAPE,
        fontFamily:"'DM Sans', system-ui, sans-serif",
        fontSize: 13, color: "var(--ink-soft)",
        lineHeight: 1.5,
      }}>
        Nothing in our database scores well for this category yet. Worth scanning options yourself.
      </div>
    )}
  </div>
);

const SaveAllPlaceholder = ({ onClick }) => (
  <div style={{marginTop: 28}}>
    <button onClick={onClick}
      style={{
        display:"inline-flex", alignItems:"center", justifyContent:"center", gap:8,
        padding:"12px 20px", borderRadius:CTA_SHAPE,
        background:"var(--moss)", color:"var(--ivory)",
        border:"none",
        fontFamily:"'DM Sans', system-ui, sans-serif",
        fontSize:14, fontWeight:500, cursor:"pointer",
        letterSpacing:"0.005em",
      }}>
      Save all to list
    </button>
  </div>
);

const ContextBundleCard = ({ bundle, categories = [], isMobile = false, onSaveAll }) => {
  if (!bundle) return null;
  return (
    <div style={{paddingTop: 24, animation:"fadeUp 0.32s ease both"}}>
      <SectionStamp label="Bundle"/>
      <h2 style={{
        fontFamily:"'Lora', Georgia, serif",
        fontSize: isMobile ? 26 : 32,
        fontWeight: 400, letterSpacing:"-0.02em",
        color:"var(--ink)", margin:"0 0 14px",
        lineHeight: 1.2,
      }}>{bundle.label || bundle.name || "Bundle"}</h2>

      {bundle.intro && (
        <p style={{
          fontFamily:"'Lora', Georgia, serif",
          fontSize: isMobile ? 17 : 18,
          fontWeight: 400, letterSpacing:"-0.005em",
          color:"var(--ink)", lineHeight: 1.55,
          margin: "0 0 6px",
        }}>{bundle.intro}</p>
      )}

      {categories.map(cat => (
        <CategorySection key={cat.slug} category={cat}/>
      ))}

      <SaveAllPlaceholder onClick={onSaveAll}/>
    </div>
  );
};

export default ContextBundleCard;
