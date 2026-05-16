// R5b.3 v2 Ask mode — ContextBundleCard render path.
//
// Renders a bundle produced by backend/composer.js. The bundle ships
// as one SSE "bundle" event with the shape:
//
//   { title, intro, sections: [{type, label, items}], suggested_action }
//
// Section types arrive in composer-enforced order:
//   keep → swap → add → worth_knowing → worth_scanning
//
// Per-item shape:
//   { product_id, product_name, score, category,
//     consumable_or_durable, reasoning, action_label }
//
// Worth-scanning section is rendered quieter (no score badge,
// invitation copy, single CTA). All other sections render product
// tiles with score badge, reasoning, action label, and buy chips.

import React from "react";

const CARD_SHAPE = "14px 10px 15px 12px / 10px 15px 12px 14px";
const TILE_SHAPE = "12px 16px 14px 18px / 16px 12px 18px 14px";
const CTA_SHAPE  = "22px 18px 24px 20px / 20px 24px 18px 22px";

// Score color thresholds match the design law in CLAUDE.md and the
// ScoreBadge contract used elsewhere in the app. Never change.
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

// Section visual styling. Keep / Swap / Add / Worth knowing share a
// register. Worth scanning is intentionally quieter (an invitation,
// not a recommendation), so it gets a dashed border and no score.
const SECTION_STYLES = {
  keep:           { stamp: "Keep using",           color: "var(--score-green)" },
  swap:           { stamp: "Worth swapping",       color: "var(--amber)" },
  add:            { stamp: "Add to your routine",  color: "var(--moss)" },
  worth_knowing:  { stamp: "Worth knowing about",  color: "var(--moss)" },
  worth_scanning: { stamp: "Worth scanning",       color: "var(--ink-faint)" },
};

const SectionStamp = ({ label, color = "var(--moss)", count }) => (
  <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:12}}>
    <span style={{display:"inline-block", width:22, height:1, background:color, opacity:0.7}}/>
    <span style={{
      fontFamily:"'DM Sans', system-ui, sans-serif",
      fontSize:10, letterSpacing:"0.22em", textTransform:"uppercase",
      fontWeight:500, color,
    }}>
      {label}{count != null ? ` (${count})` : ""}
    </span>
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

// Action labels are short editorial copy from the composer ("Keep
// this one." / "Swap to this." / "Worth tasting."). Rendered as a
// small caps caption above the buy chips so the reading order is:
// reasoning → action prompt → way to act.
const ActionLabel = ({ text, color }) => {
  if (!text) return null;
  return (
    <div style={{
      fontFamily:"'DM Sans', system-ui, sans-serif",
      fontSize:10, letterSpacing:"0.18em", textTransform:"uppercase",
      fontWeight:600, color: color || "var(--moss)",
      marginTop:10,
    }}>{text}</div>
  );
};

const ProductTile = ({ item, sectionColor }) => {
  if (!item) return null;
  return (
    <div style={{
      padding: "14px 16px",
      background: "var(--cream)",
      border: "1px solid var(--rule)",
      borderRadius: TILE_SHAPE,
    }}>
      <div style={{display: "flex", alignItems: "flex-start", gap: 14}}>
        <ProductAvatar url={item.image_url} name={item.product_name} score={item.score} size={44}/>
        <div style={{flex: 1, minWidth: 0}}>
          <div style={{
            display:"flex", alignItems:"baseline", justifyContent:"space-between", gap:10,
            marginBottom:8,
          }}>
            <div style={{
              flex:1, minWidth:0,
              fontFamily:"'Lora', Georgia, serif",
              fontSize:17, fontWeight:500, lineHeight:1.3,
              color:"var(--ink)", letterSpacing:"-0.005em",
            }}>{item.product_name}</div>
            <div style={{flexShrink:0}}>
              <ScoreDot score={item.score}/>
            </div>
          </div>
          {item.reasoning && (
            <div style={{
              fontFamily:"'DM Sans', system-ui, sans-serif",
              fontSize:13, color:"var(--ink-soft)",
              lineHeight:1.55,
            }}>{item.reasoning}</div>
          )}
          <ActionLabel text={item.action_label} color={sectionColor}/>
          <BuyChips links={item.buy_links}/>
        </div>
      </div>
    </div>
  );
};

const WorthScanningSection = ({ section, onScanCta }) => {
  const style = SECTION_STYLES.worth_scanning;
  return (
    <div style={{marginTop: 28}}>
      <SectionStamp label={style.stamp} color={style.color}/>
      <div style={{
        padding:"18px 18px 16px",
        background:"var(--cream-light)",
        border:"1px dashed var(--rule)",
        borderRadius: TILE_SHAPE,
      }}>
        {(section.items || []).map((item, idx) => (
          <div key={item.product_id || idx} style={{
            fontFamily:"'DM Sans', system-ui, sans-serif",
            fontSize:13, color:"var(--ink-soft)", lineHeight:1.55,
            marginBottom: idx === section.items.length - 1 ? 14 : 10,
          }}>
            {item.reasoning || item.product_name}
          </div>
        ))}
        {(!section.items || section.items.length === 0) && (
          <div style={{
            fontFamily:"'DM Sans', system-ui, sans-serif",
            fontSize:13, color:"var(--ink-soft)", lineHeight:1.55, marginBottom:14,
          }}>
            Calibration is thin for this. Scan a few options and Partiqule learns.
          </div>
        )}
        <button onClick={onScanCta}
          style={{
            display:"inline-flex", alignItems:"center", gap:8,
            padding:"10px 18px", borderRadius:CTA_SHAPE,
            background:"var(--moss)", color:"var(--ivory)",
            border:"none", cursor:"pointer",
            fontFamily:"'DM Sans', system-ui, sans-serif",
            fontSize:13, fontWeight:500, letterSpacing:"0.005em",
          }}>
          Open scan camera
        </button>
      </div>
    </div>
  );
};

const StandardSection = ({ section }) => {
  const style = SECTION_STYLES[section.type] || SECTION_STYLES.add;
  const count = Array.isArray(section.items) ? section.items.length : 0;
  if (count === 0) return null;
  return (
    <div style={{marginTop: 28}}>
      <SectionStamp label={style.stamp} color={style.color} count={count}/>
      <div style={{display: "flex", flexDirection: "column", gap: 12}}>
        {section.items.map((item, idx) => (
          <ProductTile key={item.product_id || idx} item={item} sectionColor={style.color}/>
        ))}
      </div>
    </div>
  );
};

const SuggestedActionButton = ({ action, onClick }) => {
  if (!action) return null;
  return (
    <div style={{marginTop: 32, display:"flex", justifyContent:"flex-start"}}>
      <button onClick={() => onClick && onClick(action)}
        style={{
          display:"inline-flex", alignItems:"center", justifyContent:"center", gap:8,
          padding:"12px 22px", borderRadius:CTA_SHAPE,
          background:"var(--moss)", color:"var(--ivory)",
          border:"none", cursor:"pointer",
          fontFamily:"'DM Sans', system-ui, sans-serif",
          fontSize:14, fontWeight:500, letterSpacing:"0.005em",
        }}>
        {action.label || "Save list"}
      </button>
    </div>
  );
};

// Decorates a composer item with frontend-computed buy_links via the
// same helper the rest of Ask uses. Backend intentionally ships
// buy_links: null on items; the partner tag lives in the frontend
// helper so the backend stays clean.
const decorateBundleItems = (sections, buyLinksFor) => {
  if (!Array.isArray(sections) || !buyLinksFor) return sections;
  return sections.map(section => ({
    ...section,
    items: (section.items || []).map(item => {
      const next = { ...item };
      if (!next.buy_links) {
        try { next.buy_links = buyLinksFor(next.product_name || ""); }
        catch { next.buy_links = null; }
      }
      return next;
    }),
  }));
};

const ContextBundleCard = ({
  bundle,
  isMobile = false,
  buyLinksFor,
  onSuggestedAction,
  onScanCta,
}) => {
  if (!bundle) return null;

  const sections = decorateBundleItems(bundle.sections || [], buyLinksFor);

  return (
    <div style={{paddingTop: 24, animation:"fadeUp 0.32s ease both"}}>
      <SectionStamp label="Bundle" color="var(--moss)"/>
      <h2 style={{
        fontFamily:"'Lora', Georgia, serif",
        fontSize: isMobile ? 26 : 32,
        fontWeight: 400, letterSpacing:"-0.02em",
        color:"var(--ink)", margin:"0 0 14px",
        lineHeight: 1.2,
      }}>{bundle.title || bundle.label || bundle.name || "Bundle"}</h2>

      {bundle.intro && (
        <p style={{
          fontFamily:"'Lora', Georgia, serif",
          fontSize: isMobile ? 17 : 18,
          fontWeight: 400, letterSpacing:"-0.005em",
          color:"var(--ink)", lineHeight: 1.55,
          margin: "0 0 6px",
        }}>{bundle.intro}</p>
      )}

      {sections.map((section, idx) => {
        if (section.type === "worth_scanning") {
          return (
            <WorthScanningSection key={section.type + idx} section={section} onScanCta={onScanCta}/>
          );
        }
        return (
          <StandardSection key={section.type + idx} section={section}/>
        );
      })}

      <SuggestedActionButton action={bundle.suggested_action} onClick={onSuggestedAction}/>
    </div>
  );
};

export default ContextBundleCard;
