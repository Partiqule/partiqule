// R3a list builder prototype.
//
// Three views switched by component state: lists overview, list detail,
// and the add-item sheet. All state is in-memory and resets on reload.
// No backend calls, no Supabase, no persistence — Sara reviews UX and copy
// here before R3b locks the schema and R3c wires real endpoints.

import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { FAKE_RECENT_SCANS, FLAG_LABELS, FAKE_ALTERNATIVES, TEMPLATES, SMART_SUGGESTIONS } from "./fixtures";
import { makeListsApi } from "./api";

// ── Tokens-only helpers ───────────────────────────────────────────
const CARD_SHAPE     = "14px 10px 15px 12px / 10px 15px 12px 14px";
const CTA_SHAPE      = "22px 18px 24px 20px / 20px 24px 18px 22px";
const TILE_SHAPE     = "12px 16px 14px 18px / 16px 12px 18px 14px";

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

// R3a r3 — category fill palette for the donut chart. Token-only; each
// category maps to a distinct hue so the breakdown is readable at a
// 96px square. Categories that share a family (food / snack) intentionally
// share a hue.
const CATEGORY_FILL = {
  food:          "var(--score-green)",
  food_beverage: "var(--score-green)",
  snack:         "var(--score-green)",
  beverage:      "var(--sage)",
  personal_care: "var(--score-amber)",
  skincare:      "var(--score-amber)",
  cleaning:      "var(--moss)",
  home:          "var(--moss-deep)",
  clothing:      "var(--ink-soft)",
  baby:          "var(--amber)",
  toy:           "var(--amber)",
  supplement:    "var(--score-red)",
  restaurant:    "var(--sage)",
  other:         "var(--ink-faint)",
};

const CATEGORY_LABEL = {
  food: "food", food_beverage: "food", snack: "snack",
  beverage: "beverage",
  personal_care: "personal care", skincare: "skincare",
  cleaning: "cleaning", home: "home",
  clothing: "clothing",
  baby: "baby", toy: "toy",
  supplement: "supplement",
  restaurant: "restaurant",
  other: "other",
};

// SVG donut helpers — produce a single annular-sector path for a slice.
// Angles in radians, 0 = east, clockwise via positive sweep.
const polarToCartesian = (cx, cy, r, angle) => ({
  x: cx + r * Math.cos(angle),
  y: cy + r * Math.sin(angle),
});

const describeAnnularSector = (cx, cy, rOuter, rInner, startAngle, endAngle) => {
  const startOuter = polarToCartesian(cx, cy, rOuter, startAngle);
  const endOuter   = polarToCartesian(cx, cy, rOuter, endAngle);
  const startInner = polarToCartesian(cx, cy, rInner, endAngle);
  const endInner   = polarToCartesian(cx, cy, rInner, startAngle);
  const largeArc = (endAngle - startAngle) > Math.PI ? 1 : 0;
  return [
    "M", startOuter.x, startOuter.y,
    "A", rOuter, rOuter, 0, largeArc, 1, endOuter.x, endOuter.y,
    "L", startInner.x, startInner.y,
    "A", rInner, rInner, 0, largeArc, 0, endInner.x, endInner.y,
    "Z",
  ].join(" ");
};

// R3a r3 — collect smart suggestions across the scored items in the list.
// Skip items scoring 6 or higher (the swap UX handles those) and skip
// suggestions whose names already appear in the list. Caps at three chips
// total so the section stays calm.
const collectSuggestions = (items) => {
  const existingNames = new Set();
  for (const it of items) {
    const n = (it.product_name || it.product_name_normalized || "").toLowerCase().trim();
    if (n) existingNames.add(n);
  }
  const out = [];
  const seen = new Set();
  for (const it of items) {
    const score = it.score;
    if (score == null || score >= 6) continue;
    const suggs = SMART_SUGGESTIONS[it.product_name] || [];
    for (const s of suggs) {
      const key = s.toLowerCase().trim();
      if (seen.has(key) || existingNames.has(key)) continue;
      seen.add(key);
      out.push(s);
      if (out.length >= 3) return out;
    }
  }
  return out;
};

// R3a r3 — split a voice transcript into one or more product names.
// Handles "diapers and wipes" → ["diapers","wipes"], "diapers, wipes,
// formula" → three items, "diapers wipes" (no separator) → one item.
const splitTranscript = (raw) => {
  if (!raw) return [];
  return String(raw)
    .split(/,\s*|\s+and\s+|\s+or\s+|\s+plus\s+/i)
    .map(s => s.trim())
    .filter(s => s.length > 0);
};

// R3a r2 — aggregate substance flags across the list. Sorted by count
// descending so the loudest concerns lead. First entry uses "N items
// with X"; subsequent entries elide "items" to keep the line tight.
const aggregateFlags = (items) => {
  const counts = {};
  for (const it of items || []) {
    for (const f of (it.flags || [])) {
      counts[f] = (counts[f] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, count, label: FLAG_LABELS[key] || key.replace(/_/g, " ") }));
};

const formatFlagsLine = (agg) => {
  if (!agg.length) return null;
  return agg.map((f, i) => i === 0
    ? `${f.count} ${f.count === 1 ? "item" : "items"} with ${f.label}`
    : `${f.count} with ${f.label}`
  ).join(", ");
};

// R3a r2 — quick swap suggestion. Returns the alternative when the active
// mode score on the item is >= 6 AND the alternative scores at least two
// points lower in the same mode. Returns null otherwise so the row stays
// quiet for items that don't need a nudge.
const swapSuggestionFor = (item, kidsOn) => {
  const activeScore = kidsOn ? item.kid_score : item.score;
  if (activeScore == null || activeScore < 6) return null;
  const alt = FAKE_ALTERNATIVES[item.product_name];
  if (!alt) return null;
  const altScore = kidsOn ? alt.kid_score : alt.score;
  if (altScore == null || activeScore - altScore < 2) return null;
  return { alt, altScore };
};

// R3a r2 — text block for share-via-clipboard. Matches the format Sara
// specced verbatim: list name, average line with kids-mode tag, blank
// line, bulleted items with score or unscored tag, blank line, count.
const buildShareText = (list, kidsOn, scoreInfo) => {
  const lines = [list.name];
  if (scoreInfo.count > 0) {
    lines.push(`Average: ${scoreInfo.avg} (kids mode: ${kidsOn ? "on" : "off"})`);
  } else {
    lines.push("No scores yet");
  }
  lines.push("");
  for (const it of list.items) {
    const name = it.product_name || it.product_name_normalized || "Unnamed";
    if (it.anchor === "name") {
      lines.push(`• ${name} — unscored`);
    } else {
      const s = kidsOn ? it.kid_score : it.score;
      const cat = (it.category || "other").replace(/_/g, " ");
      lines.push(`• ${name} — score ${s} (${cat})`);
    }
  }
  lines.push("");
  lines.push(`${list.items.length} items`);
  return lines.join("\n");
};

// R3a r1 — average score across items that carry a numeric score. Items
// with anchor="name" never carry a score; they're skipped. kid_score
// overrides overall score when kidsOn. Rounded to one decimal.
const computeListAverage = (items, kidsOn) => {
  const scored = (items || [])
    .map(i => kidsOn ? i.kid_score : i.score)
    .filter(s => typeof s === "number" && Number.isFinite(s));
  if (scored.length === 0) return { avg: null, count: 0 };
  const sum = scored.reduce((a, b) => a + b, 0);
  return { avg: Math.round((sum / scored.length) * 10) / 10, count: scored.length };
};

const relativeTime = (iso) => {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

// Tiny category icon set. Cream-on-cream surface so each icon needs only
// stroke colour and a clean glyph — no labels, no backgrounds.
const CategoryIcon = ({ category, size = 18, color = "var(--moss)" }) => {
  const stroke = color;
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke, strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  switch ((category || "").toLowerCase()) {
    case "food":
    case "food_beverage":
    case "snack":
      return (<svg {...common}><path d="M4 4v8a4 4 0 0 0 4 4v4"/><path d="M8 4v8"/><path d="M16 4v16"/><path d="M16 12c0-4 1-7 3-7v9h-3"/></svg>);
    case "beverage":
      return (<svg {...common}><path d="M6 3h12l-1.5 16a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2L6 3z"/><path d="M7 9h10"/></svg>);
    case "personal_care":
    case "skincare":
      return (<svg {...common}><path d="M12 3c-2.5 4-4 7-4 10a4 4 0 0 0 8 0c0-3-1.5-6-4-10z"/></svg>);
    case "cleaning":
    case "home":
      return (<svg {...common}><path d="M3 11l9-8 9 8"/><path d="M5 9v12h14V9"/></svg>);
    case "clothing":
      return (<svg {...common}><path d="M5 6l4-3h6l4 3-3 3v12H8V9l-3-3z"/></svg>);
    case "baby":
    case "toy":
      return (<svg {...common}><circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1" fill={stroke}/><circle cx="15" cy="10" r="1" fill={stroke}/><path d="M9 15c1 1 4 1 6 0"/></svg>);
    case "supplement":
      return (<svg {...common}><rect x="4" y="9" width="16" height="6" rx="3"/><path d="M12 9v6"/></svg>);
    default:
      return (<svg {...common}><circle cx="12" cy="12" r="4"/></svg>);
  }
};

const ChevronRight = ({ size = 16, color = "var(--ink-faint)" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><polyline points="9 6 15 12 9 18"/></svg>
);

const ChevronLeft = ({ size = 16, color = "var(--ink)" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><polyline points="15 6 9 12 15 18"/></svg>
);

const Plus = ({ size = 14, color = "var(--ivory)" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
);

const X = ({ size = 14, color = "var(--ink-faint)" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>
);

const Share = ({ size = 16, color = "var(--moss)" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
);

const Clipboard = ({ size = 17, color = "var(--moss)" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
);

const CheckCircle = ({ filled, size = 20 }) => (
  filled ? (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="var(--moss)" stroke="var(--moss)" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10"/>
      <polyline fill="none" stroke="var(--ivory)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" points="7 12.5 11 16.5 17 9.5"/>
    </svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="1.5">
      <circle cx="12" cy="12" r="9.5"/>
    </svg>
  )
);

const Pencil = ({ size = 12, color = "var(--ink-faint)" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
);

const ArrowRight = ({ size = 13, color = "var(--moss)" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/></svg>
);

const Grip = ({ size = 14, color = "var(--ink-faint)" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
    <line x1="4" y1="7" x2="20" y2="7"/>
    <line x1="4" y1="12" x2="20" y2="12"/>
    <line x1="4" y1="17" x2="20" y2="17"/>
  </svg>
);

const Mic = ({ size = 17, color = "var(--moss)" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="2" width="6" height="12" rx="3"/>
    <path d="M5 10v2a7 7 0 0 0 14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
    <line x1="8" y1="22" x2="16" y2="22"/>
  </svg>
);

// R3a r2 — toast for share-to-clipboard confirmation. Mounts when message
// is non-empty, animates in, and unmounts on the parent's setTimeout.
const Toast = ({ message }) => {
  if (!message) return null;
  return (
    <div style={{
      position:"fixed", bottom: 110, left:"50%",
      transform:"translateX(-50%)",
      padding:"10px 18px",
      background:"var(--ink)", color:"var(--ivory)",
      borderRadius: CARD_SHAPE,
      fontFamily:"'DM Sans', system-ui, sans-serif",
      fontSize:13, fontWeight:500, letterSpacing:"0.005em",
      zIndex:200,
      animation:"fadeUp 0.25s ease",
      boxShadow:"0 8px 24px rgba(0,0,0,0.15)",
      whiteSpace:"nowrap",
    }}>{message}</div>
  );
};

// ── Score chip — small, no inline hex ─────────────────────────────
const ScoreChip = ({ score, label }) => {
  if (score == null) {
    return (
      <span style={{display:"inline-flex", alignItems:"center", padding:"3px 10px", borderRadius:999, background:"var(--rule-soft)", border:"1px solid var(--rule)", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:11, letterSpacing:"0.08em", textTransform:"uppercase", fontWeight:600, color:"var(--ink-faint)"}}>
        {label || "Unscored"}
      </span>
    );
  }
  return (
    <span style={{display:"inline-flex", alignItems:"center", gap:6, padding:"4px 10px", borderRadius:999, background:scoreBg(score), border:`1px solid ${scoreColor(score)}`, fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:12, fontWeight:600, color:scoreColor(score)}}>
      <span style={{width:6, height:6, borderRadius:"50%", background:scoreColor(score)}}/>
      {score}
    </span>
  );
};

// ── Pill button used for primary CTAs ─────────────────────────────
const PillButton = ({ onClick, children, kind = "primary", style = {} }) => {
  const bg = kind === "primary" ? "var(--moss)" : "transparent";
  const color = kind === "primary" ? "var(--ivory)" : "var(--ink)";
  const border = kind === "primary" ? "none" : "1px solid var(--rule-strong)";
  return (
    <button onClick={onClick} style={{display:"inline-flex", alignItems:"center", justifyContent:"center", gap:8, padding:"11px 18px", borderRadius:CTA_SHAPE, background:bg, color, border, fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:14, fontWeight:500, cursor:"pointer", letterSpacing:"0.005em", ...style}}>
      {children}
    </button>
  );
};

// Stamp caps used at the top of sections. 22px moss rule + 10px gap + caps.
const SectionStamp = ({ label, color = "var(--moss)" }) => (
  <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:8}}>
    <span style={{display:"inline-block", width:22, height:1, background:color, opacity:0.7}}/>
    <span style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:10, letterSpacing:"0.22em", textTransform:"uppercase", fontWeight:500, color}}>{label}</span>
  </div>
);

const PrototypePill = () => (
  <span style={{display:"inline-flex", alignItems:"center", padding:"3px 10px", borderRadius:999, background:"rgba(200, 120, 26, 0.10)", border:"1px solid var(--amber)", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:10, letterSpacing:"0.14em", textTransform:"uppercase", fontWeight:600, color:"var(--amber)", marginLeft:10, verticalAlign:"middle"}}>
    Prototype
  </span>
);

// ── Lists overview ─────────────────────────────────────────────────
const ListCard = ({ list, onOpen }) => {
  const itemCount = list.items.length;
  const cats = [...new Set(list.items.map(i => i.category).filter(Boolean))].slice(0, 4);
  const updatedAt = list.items.length
    ? list.items.reduce((acc, i) => i.scanned_at && i.scanned_at > acc ? i.scanned_at : acc, list.created_at)
    : list.created_at;
  return (
    <div role="button" onClick={() => onOpen(list.id)}
      style={{display:"flex", alignItems:"center", gap:16, padding:"18px 20px", background:"var(--cream-light)", border:"1px solid var(--rule)", borderRadius:CARD_SHAPE, cursor:"pointer", marginBottom:12}}>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:20, fontWeight:500, letterSpacing:"-0.01em", color:"var(--ink)", marginBottom:6}}>
          {list.name}
        </div>
        <div style={{display:"flex", alignItems:"center", gap:10, fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:11, letterSpacing:"0.14em", textTransform:"uppercase", fontWeight:600, color:"var(--ink-soft)"}}>
          <span>{itemCount} {itemCount === 1 ? "item" : "items"}</span>
          <span style={{opacity:0.4}}>·</span>
          <span>Updated {relativeTime(updatedAt)}</span>
        </div>
        {cats.length > 0 && (
          <div style={{display:"flex", alignItems:"center", gap:6, marginTop:10}}>
            {cats.map(c => <CategoryIcon key={c} category={c} size={16} color="var(--ink-soft)"/>)}
          </div>
        )}
      </div>
      <ChevronRight/>
    </div>
  );
};

const ListCardSkeleton = () => (
  <div style={{display:"flex", alignItems:"center", gap:16, padding:"18px 20px", background:"var(--cream-light)", border:"1px solid var(--rule)", borderRadius:CARD_SHAPE, marginBottom:12}}>
    <div style={{flex:1, minWidth:0}}>
      <div className="pq-skeleton" style={{height:18, width:"60%", borderRadius:4, marginBottom:8}}/>
      <div className="pq-skeleton" style={{height:10, width:"40%", borderRadius:4}}/>
    </div>
  </div>
);

const ListsOverview = ({ lists, loading, error, onOpen, onCreate, onRetry, isMobile }) => {
  return (
    <div style={{maxWidth:720, margin:"0 auto", padding:`0 ${isMobile ? "20px" : "40px"}`}}>
      <SectionStamp label="Lists"/>
      <h1 style={{fontFamily:"'Lora', Georgia, serif", fontSize: isMobile ? 32 : 40, fontWeight:400, letterSpacing:"-0.02em", color:"var(--ink)", margin:"0 0 6px"}}>
        Your <span style={{color:"var(--moss)"}}>lists</span>
        <PrototypePill/>
      </h1>
      <p style={{fontFamily:"'Lora', Georgia, serif", fontSize: isMobile ? 16 : 18, color:"var(--ink-soft)", margin:"0 0 24px", lineHeight:1.45}}>
        Group what you want to grab. Group what you want to skip.
      </p>
      <div style={{marginBottom:28}}>
        <PillButton onClick={onCreate}>
          <Plus/> New list
        </PillButton>
      </div>
      {error ? (
        <div style={{textAlign:"center", padding:"40px 20px", background:"var(--cream-light)", border:"1px solid var(--score-red)", borderRadius:CARD_SHAPE}}>
          <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:18, color:"var(--ink)", marginBottom:8, letterSpacing:"-0.005em"}}>Couldn't load lists.</div>
          <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13, color:"var(--ink-soft)", lineHeight:1.5, marginBottom:16}}>{error}</div>
          <PillButton onClick={onRetry} kind="secondary">Try again</PillButton>
        </div>
      ) : (lists == null && loading) ? (
        <div>
          <ListCardSkeleton/><ListCardSkeleton/><ListCardSkeleton/>
        </div>
      ) : (lists && lists.length === 0) ? (
        <div style={{textAlign:"center", padding:"60px 20px", background:"var(--cream-light)", border:"1px solid var(--rule)", borderRadius:CARD_SHAPE}}>
          <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:20, color:"var(--ink)", marginBottom:10, letterSpacing:"-0.01em"}}>Start your first list.</div>
          <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13, color:"var(--ink-soft)", lineHeight:1.5, marginBottom:18}}>Add what you want to remember. Add what you want to swap.</div>
          <PillButton onClick={onCreate}>Create a list</PillButton>
        </div>
      ) : (
        <div>{(lists || []).map(l => <ListCard key={l.id} list={l} onOpen={onOpen}/>)}</div>
      )}
    </div>
  );
};

// R3c — skeleton placeholder shown while GET /lists/:id is in flight.
// Matches the detail layout closely so the transition is calm: back
// affordance, title block, score chip slot, and a few item rows.
const ListDetailSkeleton = ({ onBack, isMobile }) => (
  <div style={{maxWidth:720, margin:"0 auto", padding:`0 ${isMobile ? "20px" : "40px"}`}}>
    <button onClick={onBack}
      style={{display:"inline-flex", alignItems:"center", gap:6, padding:"6px 4px 6px 0", background:"transparent", border:"none", color:"var(--ink)", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13, cursor:"pointer", marginBottom:18}}>
      <ChevronLeft size={14}/> Lists
    </button>
    <div className="pq-skeleton" style={{height: isMobile ? 32 : 38, width:"60%", borderRadius:4, marginBottom:14}}/>
    <div className="pq-skeleton" style={{height:24, width:80, borderRadius:999, marginBottom:14}}/>
    <div className="pq-skeleton" style={{height:12, width:"40%", borderRadius:4, marginBottom:24}}/>
    {[0,1,2].map(i => (
      <div key={i} style={{display:"flex", alignItems:"center", gap:14, padding:"14px 4px", borderBottom:"1px solid var(--rule-soft)"}}>
        <div className="pq-skeleton" style={{width:32, height:32, borderRadius:TILE_SHAPE}}/>
        <div style={{flex:1}}>
          <div className="pq-skeleton" style={{height:14, width:"50%", borderRadius:4, marginBottom:8}}/>
          <div className="pq-skeleton" style={{height:10, width:"30%", borderRadius:4}}/>
        </div>
      </div>
    ))}
  </div>
);

const ListDetailError = ({ message, onRetry, onBack, isMobile }) => (
  <div style={{maxWidth:720, margin:"0 auto", padding:`0 ${isMobile ? "20px" : "40px"}`}}>
    <button onClick={onBack}
      style={{display:"inline-flex", alignItems:"center", gap:6, padding:"6px 4px 6px 0", background:"transparent", border:"none", color:"var(--ink)", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13, cursor:"pointer", marginBottom:18}}>
      <ChevronLeft size={14}/> Lists
    </button>
    <div style={{textAlign:"center", padding:"40px 20px", background:"var(--cream-light)", border:"1px solid var(--score-red)", borderRadius:CARD_SHAPE}}>
      <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:18, color:"var(--ink)", marginBottom:8, letterSpacing:"-0.005em"}}>Couldn't load this list.</div>
      <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13, color:"var(--ink-soft)", lineHeight:1.5, marginBottom:16}}>{message}</div>
      <PillButton onClick={onRetry} kind="secondary">Try again</PillButton>
    </div>
  </div>
);

// ── Category donut (R3a r3) ───────────────────────────────────────
// Hidden when the list has fewer than two items or only one category is
// represented. A single-slice donut reads as a solid ring with no signal.
const CategoryDonut = ({ items }) => {
  const [activeSlice, setActiveSlice] = useState(null);
  const counts = useMemo(() => {
    const m = new Map();
    for (const it of items || []) {
      const cat = it.category || "other";
      m.set(cat, (m.get(cat) || 0) + 1);
    }
    return m;
  }, [items]);
  if (!items || items.length < 2 || counts.size < 2) return null;

  const total = items.length;
  // Sort biggest slice first so the visual order leads with the
  // dominant category at 12 o'clock.
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const cx = 50, cy = 50, rOuter = 44, rInner = 27;
  let cursor = -Math.PI / 2; // start at top
  const slices = entries.map(([cat, count]) => {
    const sweep = (count / total) * 2 * Math.PI;
    // Single-slice safety not needed (counts.size >= 2 guards), but if a
    // slice were exactly 2π the arc would render as nothing — clamp.
    const adjustedSweep = Math.min(sweep, 2 * Math.PI - 0.0001);
    const start = cursor;
    const end = cursor + adjustedSweep;
    cursor = end;
    return {
      key: cat,
      count,
      color: CATEGORY_FILL[cat] || CATEGORY_FILL.other,
      label: CATEGORY_LABEL[cat] || cat.replace(/_/g, " "),
      path: describeAnnularSector(cx, cy, rOuter, rInner, start, end),
    };
  });

  const active = activeSlice ? slices.find(s => s.key === activeSlice) : null;

  return (
    <div style={{display:"flex", flexDirection:"column", alignItems:"center", marginBottom:20}}>
      <div style={{position:"relative", width:96, height:96}}>
        <svg viewBox="0 0 100 100" width={96} height={96} style={{display:"block"}}>
          {slices.map(s => (
            <path key={s.key}
              d={s.path}
              fill={s.color}
              stroke="var(--cream)"
              strokeWidth="1.5"
              style={{cursor:"pointer", transition:"opacity 0.15s ease"}}
              opacity={activeSlice && activeSlice !== s.key ? 0.4 : 1}
              onMouseEnter={() => setActiveSlice(s.key)}
              onMouseLeave={() => setActiveSlice(null)}
              onClick={() => setActiveSlice(prev => prev === s.key ? null : s.key)}
            />
          ))}
        </svg>
        <div style={{position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", pointerEvents:"none"}}>
          <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:22, fontWeight:500, letterSpacing:"-0.01em", color:"var(--ink)", lineHeight:1}}>{total}</div>
          <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:9, color:"var(--ink-soft)", textTransform:"uppercase", letterSpacing:"0.16em", fontWeight:600, marginTop:2}}>items</div>
        </div>
      </div>
      <div style={{marginTop:10, minHeight:18, fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:12, color:"var(--ink-soft)", letterSpacing:"0.04em", textAlign:"center"}}>
        {active ? (
          <span><span style={{color:"var(--ink)", fontWeight:600}}>{active.count}</span> {active.count === 1 ? "item" : "items"}: {active.label}</span>
        ) : (
          <span style={{color:"var(--ink-faint)"}}>{entries.length} categories</span>
        )}
      </div>
    </div>
  );
};

// ── Smart suggestions (R3a r3) ────────────────────────────────────
const SuggestionsSection = ({ items, onAdd }) => {
  const suggestions = useMemo(() => collectSuggestions(items), [items]);
  if (!suggestions.length) return null;
  return (
    <div style={{marginBottom:28, paddingTop:8, borderTop:"1px solid var(--rule-soft)"}}>
      <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:10, marginTop:18}}>
        <span style={{display:"inline-block", width:22, height:1, background:"var(--moss)", opacity:0.7}}/>
        <span style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:10, letterSpacing:"0.22em", textTransform:"uppercase", fontWeight:500, color:"var(--moss)"}}>Suggestions</span>
      </div>
      <div style={{display:"flex", flexWrap:"wrap", gap:8}}>
        {suggestions.map(s => (
          <button key={s} onClick={() => onAdd(s)}
            style={{display:"inline-flex", alignItems:"center", gap:6, padding:"6px 12px", background:"var(--cream-light)", border:"1px solid var(--rule-strong)", borderRadius:999, fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:12, fontWeight:500, color:"var(--ink)", cursor:"pointer"}}>
            <span style={{color:"var(--moss)", fontWeight:700}}>+</span>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
};

// ── List detail ────────────────────────────────────────────────────
const ItemRow = ({ item, kidsOn, otherLists, isScoring, onRemove, onToggleOwned, onTogglePurchased, onEditNote, onSwapItem, onScoreItem, onOpenList, drag }) => {
  const displayName = item.product_name || item.product_name_normalized || "Unnamed item";
  const isReading = item.placeholder === true;
  const purchased = !!item.purchased;
  const swap = !isReading ? swapSuggestionFor(item, kidsOn) : null;
  const activeScore = kidsOn ? item.kid_score : item.score;
  const isDragging = drag?.draggedId === item.id;

  // Cross-list caption. Cap at two names; further matches collapse into
  // a "+N others" tail so the row stays single-line.
  const others = otherLists || [];
  const renderOthers = () => {
    if (!others.length) return null;
    if (others.length <= 2) {
      return others.map((o, i) => (
        <React.Fragment key={o.id}>
          {i > 0 && <span style={{color:"var(--ink-faint)"}}>, </span>}
          <button onClick={(e) => { e.stopPropagation(); onOpenList(o.id); }}
            style={{padding:0, background:"transparent", border:"none", fontFamily:"inherit", fontSize:"inherit", color:"var(--moss-deep)", textDecoration:"underline", textUnderlineOffset:2, cursor:"pointer"}}>
            {o.name}
          </button>
        </React.Fragment>
      ));
    }
    const first = others[0];
    return (
      <>
        <button onClick={(e) => { e.stopPropagation(); onOpenList(first.id); }}
          style={{padding:0, background:"transparent", border:"none", fontFamily:"inherit", fontSize:"inherit", color:"var(--moss-deep)", textDecoration:"underline", textUnderlineOffset:2, cursor:"pointer"}}>
          {first.name}
        </button>
        <span style={{color:"var(--ink-faint)"}}>, +{others.length - 1} others</span>
      </>
    );
  };

  return (
    <div
      data-item-id={item.id}
      draggable={!isReading}
      onDragStart={drag?.onDragStart ? (e) => drag.onDragStart(item.id, e) : undefined}
      onDragOver={drag?.onDragOver ? (e) => drag.onDragOver(item.id, e) : undefined}
      onDragEnd={drag?.onDragEnd}
      onDrop={drag?.onDrop}
      onTouchStart={drag?.onTouchStart ? (e) => drag.onTouchStart(item.id, e) : undefined}
      onTouchMove={drag?.onTouchMove}
      onTouchEnd={drag?.onTouchEnd}
      style={{
        opacity: isDragging ? 0.4 : (purchased ? 0.5 : 1),
        transform: isDragging ? "scale(1.01)" : "none",
        boxShadow: isDragging ? "0 8px 20px rgba(26, 31, 21, 0.10)" : "none",
        background: isDragging ? "var(--cream-light)" : "transparent",
        borderRadius: isDragging ? CARD_SHAPE : 0,
        transition: "opacity 0.2s ease, transform 0.15s ease, box-shadow 0.15s ease",
      }}
    >
      <div style={{display:"flex", alignItems:"flex-start", gap:10, padding:"14px 4px", borderBottom:"1px solid var(--rule-soft)"}}>
        {/* Grip — drag handle on the left gutter */}
        <div aria-label="Drag to reorder"
          style={{flexShrink:0, width:22, height:30, display:"flex", alignItems:"center", justifyContent:"center", cursor:"grab", touchAction:"none", marginTop:1}}>
          <Grip size={14}/>
        </div>
        {/* Purchased check */}
        <button onClick={() => onTogglePurchased(item.id)} aria-label={purchased ? "Mark as not purchased" : "Mark as purchased"}
          style={{flexShrink:0, width:30, height:30, display:"flex", alignItems:"center", justifyContent:"center", padding:0, marginTop:1, background:"transparent", border:"none", borderRadius:6, cursor:"pointer"}}>
          <CheckCircle filled={purchased} size={20}/>
        </button>
        <div style={{flexShrink:0, width:32, height:32, display:"flex", alignItems:"center", justifyContent:"center", borderRadius:TILE_SHAPE, background:"var(--cream-light)", border:"1px solid var(--rule-soft)"}}>
          <CategoryIcon category={item.category} size={16} color="var(--moss)"/>
        </div>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:16, fontWeight:400, color:"var(--ink)", letterSpacing:"-0.005em", lineHeight:1.3, marginBottom:6, textDecoration: purchased ? "line-through" : "none", textDecorationColor: purchased ? "var(--ink-faint)" : "transparent", opacity: isReading ? 0.6 : 1}}>
            {isReading ? "Reading the link..." : displayName}
          </div>

          {others.length > 0 && !isReading && (
            <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:12, color:"var(--ink-soft)", lineHeight:1.4, marginBottom:6}}>
              <span>Also in: </span>
              {renderOthers()}
            </div>
          )}

          {item.added_at && !isReading && (
            <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:11, color:"var(--ink-faint)", letterSpacing:"0.08em", textTransform:"uppercase", fontWeight:600, marginBottom:6}}>
              Added {relativeTime(item.added_at)}
            </div>
          )}

          {!isReading && (
            item.note ? (
              <div onClick={() => onEditNote(item)}
                style={{display:"flex", alignItems:"center", gap:6, fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:12, color:"var(--ink-soft)", lineHeight:1.4, marginBottom:8, cursor:"pointer"}}>
                <span>{item.note}</span>
                <Pencil size={11}/>
              </div>
            ) : (
              <button onClick={() => onEditNote(item)}
                style={{display:"inline-flex", alignItems:"center", gap:5, marginBottom:8, padding:0, background:"transparent", border:"none", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:11, color:"var(--ink-faint)", fontWeight:500, letterSpacing:"0.04em", cursor:"pointer"}}>
                <Pencil size={10}/> Add a note
              </button>
            )
          )}

          <div style={{display:"flex", alignItems:"center", gap:10, marginTop:2, flexWrap:"wrap"}}>
            {/* R3g — anchor=name items without a score show the Score it
                affordance. Once a score lands on the row (via the Score
                it flow), it falls through to the scored branch even
                though scan_id is still null in the database. */}
            {item.anchor === "name" && item.score == null ? (
              isScoring ? (
                <span style={{display:"inline-flex", alignItems:"center", gap:6, padding:"3px 12px", borderRadius:999, border:"1px solid var(--rule)", background:"var(--cream-light)", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:11, fontWeight:600, color:"var(--moss)", letterSpacing:"0.06em", textTransform:"uppercase", animation:"partiqulePulse 1.4s ease-in-out infinite"}}>
                  Scoring...
                </span>
              ) : (
                <>
                  <ScoreChip score={null}/>
                  <button onClick={(e)=>{e.stopPropagation(); onScoreItem?.(item);}}
                    style={{padding:"3px 12px", borderRadius:999, border:"1px solid var(--rule-strong)", background:"transparent", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:11, fontWeight:600, color:"var(--ink-soft)", letterSpacing:"0.06em", textTransform:"uppercase", cursor:"pointer"}}>
                    Score it
                  </button>
                </>
              )
            ) : (
              <>
                <ScoreChip score={activeScore}/>
                {item.anchor === "scan" && (
                  <button onClick={(e)=>{e.stopPropagation(); onToggleOwned(item.id);}}
                    style={{padding:"3px 12px", borderRadius:999, border:"1px solid var(--rule)", background: item.owned ? "var(--moss-soft)" : "transparent", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:11, fontWeight:600, color: item.owned ? "var(--moss-deep)" : "var(--ink-soft)", letterSpacing:"0.06em", textTransform:"uppercase", cursor:"pointer"}}>
                    {item.owned ? "Owned" : "Considering"}
                  </button>
                )}
              </>
            )}
          </div>

          {swap && (
            <button onClick={() => onSwapItem(item.id, swap.alt)}
              style={{display:"inline-flex", alignItems:"center", gap:8, marginTop:10, padding:"7px 12px", background:"var(--moss-soft)", border:"1px solid var(--moss)", color:"var(--moss-deep)", borderRadius:999, fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:12, fontWeight:600, cursor:"pointer"}}>
              <span>Try {swap.alt.product_name} ({swap.altScore})</span>
              <ArrowRight size={13} color="var(--moss-deep)"/>
            </button>
          )}
        </div>
        <button onClick={()=>onRemove(item.id)} aria-label="Remove item"
          style={{flexShrink:0, width:30, height:30, display:"flex", alignItems:"center", justifyContent:"center", padding:0, marginTop:1, background:"transparent", border:"none", borderRadius:6, cursor:"pointer"}}>
          <X size={14}/>
        </button>
      </div>
    </div>
  );
};

const ListDetail = ({ list, allLists, onBack, onRename, onAddItem, onRemoveItem, onToggleOwned, onTogglePurchased, onEditNote, onSwapItem, onScoreItem, onShare, onReorderItems, onOpenList, onAddByName, onDeleteList, scoring, isMobile }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(list.name);
  // R3a r1 — kids toggle is local to this list view. State resets when the
  // active list changes because the parent passes key={list.id}, which
  // remounts the whole detail tree.
  const [kidsOn, setKidsOn] = useState(false);
  const scoreInfo = useMemo(() => computeListAverage(list.items, kidsOn), [list.items, kidsOn]);
  const flagsAgg = useMemo(() => aggregateFlags(list.items), [list.items]);
  const flagsLine = useMemo(() => formatFlagsLine(flagsAgg), [flagsAgg]);
  // R3a r2 — purchased items sort to the bottom while preserving their
  // relative order within each group. Memoize so we don't re-sort on every
  // render-only change like the kids toggle.
  const sortedItems = useMemo(() => {
    return [...list.items].sort((a, b) => {
      const ap = !!a.purchased, bp = !!b.purchased;
      if (ap === bp) return 0;
      return ap ? 1 : -1;
    });
  }, [list.items]);

  // R3a r3 — cross-list intel. For each item in this list, find the OTHER
  // lists (excluding the current one) that contain the same product_name
  // by case-insensitive exact match. Result: Map<itemId, [{id, name}]>.
  const otherListsByItemId = useMemo(() => {
    const out = new Map();
    if (!allLists || allLists.length <= 1) return out;
    for (const it of list.items) {
      const needle = (it.product_name || "").toLowerCase().trim();
      if (!needle) { out.set(it.id, []); continue; }
      const matches = [];
      for (const l of allLists) {
        if (l.id === list.id) continue;
        const hit = l.items.some(i => (i.product_name || "").toLowerCase().trim() === needle);
        if (hit) matches.push({ id: l.id, name: l.name });
      }
      out.set(it.id, matches);
    }
    return out;
  }, [list, allLists]);

  // R3a r3 — drag-to-reorder state. orderOverride mirrors the live
  // reordering during a drag so the row visually moves under the cursor.
  // Committed to parent state via onReorderItems on drop.
  const [draggedId, setDraggedId] = useState(null);
  const [orderOverride, setOrderOverride] = useState(null);
  const touchState = useRef({ id: null, longPressTimer: null, startY: 0, dragging: false });

  // Items to render: orderOverride when actively reordering, sortedItems
  // otherwise. Both arrays respect the purchased-at-bottom invariant.
  const renderedItems = orderOverride || sortedItems;

  const commitReorder = (nextOrder) => {
    const ids = nextOrder.map(i => i.id);
    onReorderItems(ids);
    setDraggedId(null);
    setOrderOverride(null);
  };

  const cancelDrag = () => {
    setDraggedId(null);
    setOrderOverride(null);
  };

  // Live-reorder shim shared by HTML5 dragover and touch move. Respects
  // the purchased boundary: a dragged unpurchased item cannot land in the
  // purchased segment, and vice versa.
  const reorderForTarget = (targetId) => {
    if (!draggedId || draggedId === targetId) return;
    const current = orderOverride || sortedItems;
    const fromIdx = current.findIndex(i => i.id === draggedId);
    const toIdx   = current.findIndex(i => i.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const dragged = current[fromIdx];
    const target  = current[toIdx];
    if (!!dragged.purchased !== !!target.purchased) return;
    const next = [...current];
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, dragged);
    setOrderOverride(next);
  };

  const drag = {
    draggedId,
    onDragStart: (id, e) => {
      // dataTransfer is required for Firefox to fire dragover events
      try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", id); } catch {}
      setDraggedId(id);
      setOrderOverride(sortedItems);
    },
    onDragOver: (id, e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      reorderForTarget(id);
    },
    onDrop: (e) => {
      e.preventDefault();
      if (orderOverride) commitReorder(orderOverride);
      else cancelDrag();
    },
    onDragEnd: () => {
      if (orderOverride) commitReorder(orderOverride);
      else cancelDrag();
    },
    onTouchStart: (id, e) => {
      touchState.current.id = id;
      touchState.current.startY = e.touches[0].clientY;
      touchState.current.dragging = false;
      touchState.current.longPressTimer = setTimeout(() => {
        touchState.current.dragging = true;
        setDraggedId(id);
        setOrderOverride(sortedItems);
        try { navigator.vibrate?.(15); } catch {}
      }, 450);
    },
    onTouchMove: (e) => {
      if (!touchState.current.dragging) {
        const dy = Math.abs((e.touches[0]?.clientY ?? 0) - touchState.current.startY);
        if (dy > 10 && touchState.current.longPressTimer) {
          clearTimeout(touchState.current.longPressTimer);
          touchState.current.longPressTimer = null;
        }
        return;
      }
      e.preventDefault();
      const touch = e.touches[0];
      if (!touch) return;
      let el = document.elementFromPoint(touch.clientX, touch.clientY);
      while (el && !el.dataset?.itemId) el = el.parentElement;
      if (el?.dataset?.itemId) {
        reorderForTarget(el.dataset.itemId);
      }
    },
    onTouchEnd: () => {
      if (touchState.current.longPressTimer) {
        clearTimeout(touchState.current.longPressTimer);
        touchState.current.longPressTimer = null;
      }
      if (touchState.current.dragging) {
        if (orderOverride) commitReorder(orderOverride);
        else cancelDrag();
      }
      touchState.current.dragging = false;
      touchState.current.id = null;
    },
  };

  const inputRef = useRef(null);
  const commit = () => {
    const next = draft.trim();
    if (next && next !== list.name) onRename(list.id, next);
    setEditing(false);
  };
  const startEdit = () => {
    setDraft(list.name);
    setEditing(true);
    setTimeout(()=>inputRef.current?.focus(), 0);
  };

  const updatedAt = list.items.length
    ? list.items.reduce((acc, i) => i.scanned_at && i.scanned_at > acc ? i.scanned_at : acc, list.created_at)
    : list.created_at;

  return (
    <div style={{maxWidth:720, margin:"0 auto", padding:`0 ${isMobile ? "20px" : "40px"}`}}>
      <button onClick={onBack}
        style={{display:"inline-flex", alignItems:"center", gap:6, padding:"6px 4px 6px 0", background:"transparent", border:"none", color:"var(--ink)", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13, cursor:"pointer", marginBottom:18}}>
        <ChevronLeft size={14}/> Lists
      </button>

      <div style={{display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, marginBottom:6}}>
        {editing ? (
          <input ref={inputRef} value={draft}
            onChange={e=>setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e=>{ if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
            style={{flex:1, fontFamily:"'Lora', Georgia, serif", fontSize: isMobile ? 30 : 36, fontWeight:400, letterSpacing:"-0.02em", color:"var(--ink)", background:"transparent", border:"none", borderBottom:"1px solid var(--moss)", outline:"none", padding:"2px 0"}}/>
        ) : (
          <h1 onClick={startEdit}
            style={{flex:1, fontFamily:"'Lora', Georgia, serif", fontSize: isMobile ? 30 : 36, fontWeight:400, letterSpacing:"-0.02em", color:"var(--ink)", margin:0, cursor:"text"}}>
            {list.name}
          </h1>
        )}
        <button aria-label="Share list"
          onClick={() => onShare(list, kidsOn, scoreInfo)}
          style={{flexShrink:0, width:42, height:42, display:"flex", alignItems:"center", justifyContent:"center", padding:0, background:"var(--cream-light)", border:"1px solid var(--rule-strong)", borderRadius:TILE_SHAPE, cursor:"pointer"}}>
          <Share/>
        </button>
      </div>

      {/* R3a r1 — list-level score chip + kids toggle. Hidden toggle when no
          scored items would create a confusing dead control, but we keep the
          chip slot showing "No scores yet" so the user sees where the score
          will land once items get scored. */}
      <div style={{display:"flex", alignItems:"center", flexWrap:"wrap", gap:10, marginTop:6, marginBottom:6}}>
        {scoreInfo.count > 0 ? (
          <div key={`avg-${scoreInfo.avg}-${kidsOn ? "k" : "a"}`}
            style={{display:"inline-flex", animation:"popIn 0.32s cubic-bezier(0.34,1.56,0.64,1) both"}}>
            <ScoreChip score={scoreInfo.avg}/>
          </div>
        ) : (
          <span style={{display:"inline-flex", alignItems:"center", padding:"4px 10px", borderRadius:999, background:"var(--rule-soft)", border:"1px solid var(--rule)", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:11, letterSpacing:"0.08em", textTransform:"uppercase", fontWeight:600, color:"var(--ink-faint)"}}>
            No scores yet
          </span>
        )}
        {scoreInfo.count > 0 && (
          <button onClick={() => setKidsOn(v => !v)} aria-pressed={kidsOn}
            style={{display:"inline-flex", alignItems:"center", gap:8, padding:"5px 12px", borderRadius:999, background: kidsOn ? "var(--moss-soft)" : "transparent", border: kidsOn ? "1px solid var(--moss)" : "1px solid var(--rule-strong)", color: kidsOn ? "var(--moss-deep)" : "var(--ink-soft)", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:11, fontWeight:600, letterSpacing:"0.08em", textTransform:"uppercase", cursor:"pointer"}}>
            <span style={{width:7, height:7, borderRadius:"50%", background: kidsOn ? "var(--moss)" : "var(--ink-faint)", opacity: kidsOn ? 1 : 0.5}}/>
            Kids
          </button>
        )}
      </div>

      {scoreInfo.count > 0 ? (
        <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13, color:"var(--ink-soft)", lineHeight:1.5, marginBottom:flagsLine ? 6 : 18}}>
          Average across {scoreInfo.count} scored {scoreInfo.count === 1 ? "item" : "items"}.
        </div>
      ) : (
        <button onClick={onAddItem}
          style={{display:"inline-block", marginBottom:flagsLine ? 6 : 18, padding:0, background:"transparent", border:"none", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13, color:"var(--moss)", fontWeight:500, cursor:"pointer", textDecoration:"underline", textUnderlineOffset:3, textAlign:"left"}}>
          Add scored items to see this list's score
        </button>
      )}

      {flagsLine && (
        <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:12, color:"var(--ink-soft)", lineHeight:1.5, marginBottom:18}}>
          <span style={{fontWeight:600, color:"var(--ink)", letterSpacing:"0.04em"}}>Flags: </span>
          {flagsLine}.
        </div>
      )}

      <div style={{display:"flex", alignItems:"center", gap:10, fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:11, letterSpacing:"0.14em", textTransform:"uppercase", fontWeight:600, color:"var(--ink-soft)", marginBottom:24}}>
        <span>{list.items.length} {list.items.length === 1 ? "item" : "items"}</span>
        <span style={{opacity:0.4}}>·</span>
        <span>Updated {relativeTime(updatedAt)}</span>
      </div>

      {/* R3a r3 — category breakdown donut. Self-hides when fewer than two
          items or only one category is present. */}
      <CategoryDonut items={list.items}/>

      {list.items.length === 0 ? (
        <div style={{textAlign:"center", padding:"40px 20px", background:"var(--cream-light)", border:"1px solid var(--rule)", borderRadius:CARD_SHAPE, marginBottom:24}}>
          <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:18, color:"var(--ink)", marginBottom:8, letterSpacing:"-0.005em"}}>Nothing here yet.</div>
          <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13, color:"var(--ink-soft)", lineHeight:1.5}}>Add what you want to remember.</div>
        </div>
      ) : (
        <div style={{marginBottom:24}}>
          {renderedItems.map(item => (
            <ItemRow key={item.id} item={item} kidsOn={kidsOn}
              otherLists={otherListsByItemId.get(item.id) || []}
              isScoring={!!(scoring && scoring[item.id])}
              onRemove={onRemoveItem}
              onToggleOwned={onToggleOwned}
              onTogglePurchased={onTogglePurchased}
              onEditNote={onEditNote}
              onSwapItem={onSwapItem}
              onScoreItem={onScoreItem}
              onOpenList={onOpenList}
              drag={drag}/>
          ))}
        </div>
      )}

      <div style={{marginBottom:24}}>
        <PillButton onClick={onAddItem}><Plus/> Add item</PillButton>
      </div>

      <SuggestionsSection items={list.items} onAdd={(name) => onAddByName(name)}/>

      <div style={{borderTop:"1px solid var(--rule)", paddingTop:20, marginBottom:32}}>
        <button onClick={() => onDeleteList(list.id)}
          style={{display:"inline-flex", alignItems:"center", gap:6, padding:"8px 14px", background:"transparent", border:"1px solid var(--score-red)", color:"var(--score-red)", borderRadius:CTA_SHAPE, fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:12, fontWeight:600, letterSpacing:"0.06em", textTransform:"uppercase", cursor:"pointer"}}>
          Delete list
        </button>
      </div>
    </div>
  );
};

// ── Add item sheet ─────────────────────────────────────────────────
const TabButton = ({ active, onClick, children }) => (
  <button onClick={onClick}
    style={{flex:1, padding:"10px 8px", background: active ? "var(--cream)" : "transparent", border:"none", borderBottom: active ? "2px solid var(--moss)" : "2px solid transparent", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13, fontWeight: active ? 600 : 500, color: active ? "var(--ink)" : "var(--ink-soft)", cursor:"pointer", letterSpacing:"0.005em"}}>
    {children}
  </button>
);

const RecentScanRow = ({ scan, onPick }) => (
  <div role="button" onClick={()=>onPick(scan)}
    style={{display:"flex", alignItems:"center", gap:12, padding:"12px 4px", borderBottom:"1px solid var(--rule-soft)", cursor:"pointer"}}>
    <div style={{flexShrink:0, width:30, height:30, display:"flex", alignItems:"center", justifyContent:"center", borderRadius:TILE_SHAPE, background:"var(--cream-light)", border:"1px solid var(--rule-soft)"}}>
      <CategoryIcon category={scan.category} size={14} color="var(--moss)"/>
    </div>
    <div style={{flex:1, minWidth:0}}>
      <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:15, color:"var(--ink)", letterSpacing:"-0.005em", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{scan.product_name}</div>
      <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:11, color:"var(--ink-faint)", letterSpacing:"0.06em", textTransform:"uppercase", marginTop:2}}>{relativeTime(scan.scanned_at)}</div>
    </div>
    <ScoreChip score={scan.score}/>
  </div>
);

const AddItemSheet = ({ recentScans, onClose, onAddFromScan, onAddByName, onAddByNameMulti, onAddByUrl, isMobile }) => {
  const [tab, setTab] = useState("recent");
  const [nameInput, setNameInput] = useState("");
  const [urlInput, setUrlInput] = useState("");
  // R3a r3 — voice input. recognitionRef holds the SpeechRecognition
  // instance, lazily constructed on first mount. supportsVoice is checked
  // at mount via the window global so the mic button hides entirely on
  // browsers that don't implement the API (Firefox stable, older Safari).
  const recognitionRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const [supportsVoice, setSupportsVoice] = useState(false);

  useEffect(() => {
    const SR = typeof window !== "undefined"
      ? (window.SpeechRecognition || window.webkitSpeechRecognition)
      : null;
    if (!SR) return;
    setSupportsVoice(true);
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    rec.onresult = (e) => {
      try {
        const transcript = e.results[0][0].transcript || "";
        const parts = splitTranscript(transcript);
        if (parts.length > 1) {
          // Multi-product utterance: add each as a separate name item.
          if (typeof onAddByNameMulti === "function") {
            onAddByNameMulti(parts);
          } else {
            parts.forEach(p => onAddByName(p));
          }
          setNameInput("");
        } else if (parts.length === 1) {
          setNameInput(parts[0]);
        } else {
          setNameInput(transcript.trim());
        }
      } finally {
        setRecording(false);
      }
    };
    rec.onerror = () => setRecording(false);
    rec.onend = () => setRecording(false);
    recognitionRef.current = rec;
    return () => {
      try { rec.abort?.(); } catch {}
      recognitionRef.current = null;
    };
  }, [onAddByName, onAddByNameMulti]);

  const startMic = () => {
    if (!recognitionRef.current || recording) return;
    try {
      setRecording(true);
      recognitionRef.current.start();
    } catch {
      // start() throws if a session is already running; ignore.
      setRecording(false);
    }
  };

  const stopMic = () => {
    if (!recognitionRef.current) return;
    try { recognitionRef.current.stop(); } catch {}
    setRecording(false);
  };

  const filteredRecent = useMemo(() => {
    if (!nameInput.trim() || tab !== "name") return recentScans;
    const needle = nameInput.toLowerCase().trim();
    return recentScans.filter(s => (s.product_name || "").toLowerCase().includes(needle));
  }, [nameInput, recentScans, tab]);

  const submitName = () => {
    const v = nameInput.trim();
    if (!v) return;
    onAddByName(v);
    setNameInput("");
  };
  const submitUrl = () => {
    const v = urlInput.trim();
    if (!v) return;
    onAddByUrl(v);
    setUrlInput("");
  };

  return (
    <div onClick={onClose}
      style={{position:"fixed", inset:0, background:"rgba(26,31,21,0.32)", zIndex:120, display:"flex", alignItems:isMobile?"flex-end":"center", justifyContent:"center", padding:isMobile?0:24}}>
      <div onClick={e=>e.stopPropagation()}
        style={{width:"100%", maxWidth:isMobile?"none":520, maxHeight:"86vh", background:"var(--cream)", borderRadius:isMobile?"20px 20px 0 0":CARD_SHAPE, padding:isMobile?"20px 20px 28px":"24px 24px 28px", display:"flex", flexDirection:"column", overflow:"hidden", boxShadow:"0 -8px 32px rgba(0,0,0,0.06)"}}>
        <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18}}>
          <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:22, fontWeight:400, letterSpacing:"-0.01em", color:"var(--ink)"}}>Add item</div>
          <button onClick={onClose} aria-label="Close"
            style={{width:32, height:32, display:"flex", alignItems:"center", justifyContent:"center", padding:0, background:"transparent", border:"none", cursor:"pointer"}}>
            <X size={16} color="var(--ink)"/>
          </button>
        </div>

        <div style={{display:"flex", alignItems:"center", borderBottom:"1px solid var(--rule)", marginBottom:16, gap:0}}>
          <TabButton active={tab==="recent"} onClick={()=>setTab("recent")}>Recent</TabButton>
          <TabButton active={tab==="name"}   onClick={()=>setTab("name")}>By name</TabButton>
          <TabButton active={tab==="url"}    onClick={()=>setTab("url")}>Paste a link</TabButton>
        </div>

        <div style={{flex:1, overflowY:"auto", minHeight:200}}>
          {tab === "recent" && (
            recentScans.length === 0 ? (
              <div style={{padding:"30px 12px", textAlign:"center", color:"var(--ink-soft)", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13}}>No recent scans yet.</div>
            ) : (
              <div>{recentScans.map((s,i) => <RecentScanRow key={(s.product_name||"")+i} scan={s} onPick={onAddFromScan}/>)}</div>
            )
          )}

          {tab === "name" && (
            <div>
              <div style={{display:"flex", alignItems:"center", gap:10, background:"var(--cream-light)", border:"1px solid var(--rule-strong)", borderRadius:CARD_SHAPE, padding:"4px 6px 4px 14px", marginBottom:14}}>
                <input value={nameInput}
                  onChange={e=>setNameInput(e.target.value)}
                  onKeyDown={e=>{ if (e.key === "Enter") submitName(); }}
                  placeholder={recording ? "Listening..." : "Type a product name"}
                  style={{flex:1, padding:"10px 0", border:"none", outline:"none", background:"transparent", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:15, color:"var(--ink)", minWidth:0}}/>
                {supportsVoice && (
                  <button onClick={recording ? stopMic : startMic}
                    aria-label={recording ? "Stop listening" : "Start voice input"}
                    aria-pressed={recording}
                    style={{flexShrink:0, width:36, height:36, display:"flex", alignItems:"center", justifyContent:"center", padding:0, background: recording ? "var(--moss-soft)" : "transparent", border:"none", borderRadius:999, cursor:"pointer", color: recording ? "var(--score-red)" : "var(--moss)", animation: recording ? "partiqulePulse 1.2s ease-in-out infinite" : "none"}}>
                    <Mic size={17} color="currentColor"/>
                  </button>
                )}
              </div>
              {filteredRecent.length > 0 && (
                <div style={{marginBottom:14}}>
                  <SectionStamp label="Match from recents"/>
                  {filteredRecent.slice(0,4).map((s,i) => <RecentScanRow key={(s.product_name||"")+i} scan={s} onPick={onAddFromScan}/>)}
                </div>
              )}
              {nameInput.trim() && (
                <PillButton onClick={submitName} kind="secondary" style={{width:"100%"}}>
                  Add "{nameInput.trim().length > 32 ? nameInput.trim().slice(0,32) + "…" : nameInput.trim()}" as a new item
                </PillButton>
              )}
            </div>
          )}

          {tab === "url" && (
            <div>
              <div style={{display:"flex", alignItems:"center", gap:10, background:"var(--cream-light)", border:"1px solid var(--rule-strong)", borderRadius:CARD_SHAPE, padding:"12px 14px", marginBottom:14}}>
                <Clipboard size={16} color="var(--moss)"/>
                <input value={urlInput}
                  onChange={e=>setUrlInput(e.target.value)}
                  onKeyDown={e=>{ if (e.key === "Enter") submitUrl(); }}
                  placeholder="Paste a product link"
                  style={{flex:1, border:"none", outline:"none", background:"transparent", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:15, color:"var(--ink)", minWidth:0}}/>
              </div>
              <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:12, color:"var(--ink-soft)", lineHeight:1.5, marginBottom:14}}>
                Drop a link from Amazon, Target, Instagram, or anywhere else. Partiqule reads the page and pulls the product name.
              </div>
              {urlInput.trim() && (
                <PillButton onClick={submitUrl} style={{width:"100%"}}>
                  Add this link
                </PillButton>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Confirmation modal for list deletion ───────────────────────────
const ConfirmModal = ({ title, body, confirmLabel, onConfirm, onCancel }) => (
  <div onClick={onCancel}
    style={{position:"fixed", inset:0, background:"rgba(26,31,21,0.40)", zIndex:130, display:"flex", alignItems:"center", justifyContent:"center", padding:24}}>
    <div onClick={e=>e.stopPropagation()}
      style={{width:"100%", maxWidth:420, background:"var(--cream)", borderRadius:CARD_SHAPE, padding:"24px 24px 20px"}}>
      <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:22, fontWeight:400, letterSpacing:"-0.01em", color:"var(--ink)", marginBottom:8}}>{title}</div>
      <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:14, color:"var(--ink-soft)", lineHeight:1.5, marginBottom:22}}>{body}</div>
      <div style={{display:"flex", gap:10, justifyContent:"flex-end"}}>
        <PillButton onClick={onCancel} kind="secondary">Keep</PillButton>
        <button onClick={onConfirm}
          style={{padding:"11px 18px", borderRadius:CTA_SHAPE, background:"var(--score-red)", color:"var(--ivory)", border:"none", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:14, fontWeight:500, cursor:"pointer"}}>{confirmLabel}</button>
      </div>
    </div>
  </div>
);

// ── New-list chooser modal ─────────────────────────────────────────
const NewListChooser = ({ onBlank, onTemplate, onCancel }) => (
  <div onClick={onCancel}
    style={{position:"fixed", inset:0, background:"rgba(26,31,21,0.40)", zIndex:130, display:"flex", alignItems:"center", justifyContent:"center", padding:24}}>
    <div onClick={e=>e.stopPropagation()}
      style={{width:"100%", maxWidth:420, background:"var(--cream)", borderRadius:CARD_SHAPE, padding:"24px 24px 22px"}}>
      <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:22, fontWeight:400, letterSpacing:"-0.01em", color:"var(--ink)", marginBottom:6}}>Start a new list</div>
      <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13, color:"var(--ink-soft)", lineHeight:1.5, marginBottom:22}}>Blank, or start from a template.</div>
      <div style={{display:"flex", flexDirection:"column", gap:10}}>
        <PillButton onClick={onBlank} style={{width:"100%"}}>Start blank</PillButton>
        <PillButton onClick={onTemplate} kind="secondary" style={{width:"100%"}}>Use a template</PillButton>
      </div>
    </div>
  </div>
);

// ── Template picker modal ──────────────────────────────────────────
const TemplatePicker = ({ templates, onPick, onBack, onCancel, isMobile }) => (
  <div onClick={onCancel}
    style={{position:"fixed", inset:0, background:"rgba(26,31,21,0.32)", zIndex:130, display:"flex", alignItems:isMobile?"flex-end":"center", justifyContent:"center", padding:isMobile?0:24}}>
    <div onClick={e=>e.stopPropagation()}
      style={{width:"100%", maxWidth:isMobile?"none":520, maxHeight:"82vh", background:"var(--cream)", borderRadius:isMobile?"20px 20px 0 0":CARD_SHAPE, padding:isMobile?"20px 20px 28px":"24px 24px 28px", display:"flex", flexDirection:"column", boxShadow:"0 -8px 32px rgba(0,0,0,0.06)"}}>
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6}}>
        <button onClick={onBack}
          style={{display:"inline-flex", alignItems:"center", gap:6, padding:"6px 4px 6px 0", background:"transparent", border:"none", color:"var(--ink)", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13, cursor:"pointer"}}>
          <ChevronLeft size={14}/> Back
        </button>
        <button onClick={onCancel} aria-label="Close"
          style={{width:32, height:32, display:"flex", alignItems:"center", justifyContent:"center", padding:0, background:"transparent", border:"none", cursor:"pointer"}}>
          <X size={16} color="var(--ink)"/>
        </button>
      </div>
      <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:22, fontWeight:400, letterSpacing:"-0.01em", color:"var(--ink)", marginBottom:4}}>Pick a template</div>
      <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:12, color:"var(--ink-soft)", marginBottom:18}}>Each template lands as a list of items ready to score.</div>
      <div style={{flex:1, overflowY:"auto"}}>
        {templates.map(t => (
          <div key={t.id} role="button" onClick={() => onPick(t)}
            style={{padding:"14px 16px", marginBottom:10, background:"var(--cream-light)", border:"1px solid var(--rule)", borderRadius:CARD_SHAPE, cursor:"pointer"}}>
            <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:17, fontWeight:500, letterSpacing:"-0.005em", color:"var(--ink)", marginBottom:4}}>{t.name}</div>
            {t.blurb && (
              <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:12, color:"var(--ink-soft)", lineHeight:1.4, marginBottom:6}}>{t.blurb}</div>
            )}
            <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:11, color:"var(--ink-faint)", letterSpacing:"0.08em", textTransform:"uppercase", fontWeight:600}}>{t.items.length} items</div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ── Single-line note edit modal ────────────────────────────────────
const NoteEditModal = ({ initialNote, productName, onSave, onCancel }) => {
  const [draft, setDraft] = useState(initialNote || "");
  const inputRef = useRef(null);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 0); }, []);
  const save = () => { onSave(draft.trim()); };
  return (
    <div onClick={onCancel}
      style={{position:"fixed", inset:0, background:"rgba(26,31,21,0.40)", zIndex:140, display:"flex", alignItems:"center", justifyContent:"center", padding:24}}>
      <div onClick={e=>e.stopPropagation()}
        style={{width:"100%", maxWidth:440, background:"var(--cream)", borderRadius:CARD_SHAPE, padding:"24px 24px 22px"}}>
        <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:20, fontWeight:400, letterSpacing:"-0.01em", color:"var(--ink)", marginBottom:4}}>{initialNote ? "Edit note" : "Add a note"}</div>
        <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:12, color:"var(--ink-soft)", marginBottom:14}}>{productName}</div>
        <input ref={inputRef} value={draft}
          onChange={e=>setDraft(e.target.value)}
          onKeyDown={e=>{ if (e.key === "Enter") save(); if (e.key === "Escape") onCancel(); }}
          placeholder="One line. Allergies, prefs, who it's for."
          maxLength={140}
          style={{width:"100%", padding:"12px 14px", borderRadius:CARD_SHAPE, background:"var(--cream-light)", border:"1px solid var(--rule-strong)", outline:"none", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:15, color:"var(--ink)", marginBottom:18, boxSizing:"border-box"}}/>
        <div style={{display:"flex", gap:10, justifyContent:"flex-end"}}>
          <PillButton onClick={onCancel} kind="secondary">Cancel</PillButton>
          <PillButton onClick={save}>Save</PillButton>
        </div>
      </div>
    </div>
  );
};

// ── Top-level page ─────────────────────────────────────────────────
const ListBuilderPage = ({ history = [], isMobile = false, safeTop = 0, authedFetch, apiBase, analyzeQuiet, onAuthRequired }) => {
  // R3c — API factory. Memoized so handlers don't churn references.
  const api = useMemo(() => makeListsApi({ authedFetch, apiBase }), [authedFetch, apiBase]);

  // Data state. null on lists means unloaded (skeleton). Empty array means
  // loaded and the user has no lists. detail is keyed by listId; entries
  // appear when the user opens a list and we fetch its full payload.
  const [lists, setLists] = useState(null);
  const [detail, setDetail] = useState({});
  const [loadingLists, setLoadingLists] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState({});
  const [errorLists, setErrorLists] = useState(null);
  const [errorDetail, setErrorDetail] = useState({});

  const [view, setView] = useState("overview");
  const [activeListId, setActiveListId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [newListMode, setNewListMode] = useState(null);
  const [editingNote, setEditingNote] = useState(null);
  // R3g — per-item scoring state. Map<itemId, true> while Score it is
  // running. Drives the spinner in ItemRow and prevents double submits.
  const [scoring, setScoring] = useState({});
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);
  const placeholderTimers = useRef({});

  const activeDetail = activeListId ? (detail[activeListId] || null) : null;

  // ── Toast (carry-over from R3a) ─────────────────────────────────
  const showToast = useCallback((message) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(""), 2500);
  }, []);

  // Centralized error router. 401 → re-auth. Anything else → toast.
  const handleError = useCallback((err, fallbackMessage) => {
    if (err?.status === 401) {
      onAuthRequired?.();
      return;
    }
    const detail = err?.body?.details?.[0] || err?.body?.error || err?.message || fallbackMessage;
    showToast(typeof detail === "string" ? detail : (fallbackMessage || "Something went wrong."));
  }, [onAuthRequired, showToast]);

  // Recent scans for the picker. Falls back to FAKE_RECENT_SCANS on fresh
  // sessions with no real history yet (carry-over from R3a).
  const recentScans = useMemo(() => {
    const real = (history || [])
      .filter(h => h && h.product_name)
      .slice(0, 500)
      .map(h => ({
        product_name: h.product_name,
        category:     h.category || "other",
        score:        h.overall_score ?? h.score ?? null,
        kid_score:    h.child_score ?? h.kid_score ?? h.overall_score ?? h.score ?? null,
        scanned_at:   h.scanned_at || h.cached_at || new Date().toISOString(),
        flags:        Array.isArray(h.flags) ? h.flags : [],
      }));
    return real.length >= 3 ? real : FAKE_RECENT_SCANS;
  }, [history]);

  // ── Loading flows ───────────────────────────────────────────────
  const loadLists = useCallback(async () => {
    setLoadingLists(true);
    setErrorLists(null);
    try {
      const res = await api.getLists();
      setLists(Array.isArray(res?.lists) ? res.lists : []);
    } catch (err) {
      if (err.status === 401) onAuthRequired?.();
      else setErrorLists(err?.body?.error || err?.message || "Couldn't reach the server.");
    } finally {
      setLoadingLists(false);
    }
  }, [api, onAuthRequired]);

  useEffect(() => { loadLists(); }, [loadLists]);

  const loadDetail = useCallback(async (id) => {
    if (!id) return;
    setLoadingDetail(ld => ({ ...ld, [id]: true }));
    setErrorDetail(ed => { const { [id]: _, ...rest } = ed; return rest; });
    try {
      const res = await api.getList(id);
      setDetail(d => ({ ...d, [id]: res.list }));
    } catch (err) {
      if (err.status === 401) onAuthRequired?.();
      else setErrorDetail(ed => ({ ...ed, [id]: err?.body?.error || err?.message || "Couldn't load this list." }));
    } finally {
      setLoadingDetail(ld => { const { [id]: _, ...rest } = ld; return rest; });
    }
  }, [api, onAuthRequired]);

  const openList = useCallback((id) => {
    setActiveListId(id);
    setView("detail");
    // Lazy-load detail. Skip if already cached or a request is in flight.
    // Reading detail / loadingDetail from closure is fine — a stale read
    // at worst causes one redundant GET, which the server handles cheaply.
    if (!detail[id] && !loadingDetail[id]) {
      loadDetail(id);
    }
  }, [detail, loadingDetail, loadDetail]);

  const backToOverview = () => { setView("overview"); setActiveListId(null); };

  // ── Summary sync helper ─────────────────────────────────────────
  // After any item-level mutation that affects display preview, refresh
  // the list summary entry so the overview card stays accurate without
  // refetching.
  const refreshSummaryFromItems = useCallback((listId, itemsArr, listMeta = {}) => {
    setLists(prev => prev ? prev.map(l => l.id === listId
      ? {
          ...l,
          ...listMeta,
          item_count: itemsArr.length,
          items_preview: itemsArr.slice(0, 3),
          updated_at: listMeta.updated_at || new Date().toISOString(),
        }
      : l) : prev);
  }, []);

  // ── New-list flow ───────────────────────────────────────────────
  const startNewList = () => setNewListMode("chooser");
  const cancelNewList = () => setNewListMode(null);
  const goToTemplates = () => setNewListMode("templates");
  const backToChooser = () => setNewListMode("chooser");

  const createBlankList = async () => {
    setNewListMode(null);
    const name = window.prompt("Name this list", "");
    if (!name || !name.trim()) return;
    try {
      const res = await api.createList({ name: name.trim() });
      const real = res.list;
      setLists(prev => [real, ...(prev || [])]);
      setDetail(d => ({ ...d, [real.id]: real }));
      setActiveListId(real.id);
      setView("detail");
    } catch (err) {
      handleError(err, "Couldn't create the list.");
    }
  };

  const createListFromTemplate = async (template) => {
    setNewListMode(null);
    try {
      const res = await api.createList({ template: template.id });
      const real = res.list;
      setLists(prev => [real, ...(prev || [])]);
      setDetail(d => ({ ...d, [real.id]: real }));
      setActiveListId(real.id);
      setView("detail");
    } catch (err) {
      handleError(err, "Couldn't create from template.");
    }
  };

  const renameList = async (id, nextName) => {
    const prevLists = lists;
    const prevDetail = detail[id];
    // Optimistic
    setLists(ls => ls ? ls.map(l => l.id === id ? { ...l, name: nextName } : l) : ls);
    setDetail(d => d[id] ? { ...d, [id]: { ...d[id], name: nextName } } : d);
    try {
      const res = await api.updateList(id, { name: nextName });
      // Server response carries updated_at + other top-level fields. Merge
      // into both lists and detail; detail preserves items + also_in_map.
      setLists(ls => ls ? ls.map(l => l.id === id ? { ...l, ...res.list } : l) : ls);
      setDetail(d => d[id] ? { ...d, [id]: { ...d[id], ...res.list } } : d);
    } catch (err) {
      setLists(prevLists);
      if (prevDetail) setDetail(d => ({ ...d, [id]: prevDetail }));
      handleError(err, "Couldn't rename.");
    }
  };

  const deleteList = async (id) => {
    const prevLists = lists;
    const prevDetail = detail;
    setLists(ls => ls ? ls.filter(l => l.id !== id) : ls);
    setDetail(d => { const { [id]: _, ...rest } = d; return rest; });
    if (activeListId === id) backToOverview();
    setPendingDelete(null);
    try {
      await api.deleteList(id);
    } catch (err) {
      setLists(prevLists);
      setDetail(prevDetail);
      handleError(err, "Couldn't delete.");
    }
  };

  // ── Item mutations ──────────────────────────────────────────────
  // Optimistic insert helper for items. Adds row to the detail and the
  // summary preview, returns the temp id used.
  const optimisticAddItem = (listId, item) => {
    setDetail(d => {
      const ex = d[listId];
      if (!ex) return d;
      const nextItems = [...ex.items, item];
      return { ...d, [listId]: { ...ex, items: nextItems, item_count: nextItems.length } };
    });
    setLists(ls => ls ? ls.map(l => l.id === listId
      ? { ...l, item_count: (l.item_count || 0) + 1, items_preview: [...(l.items_preview || []), item].slice(0, 3) }
      : l) : ls);
  };

  // Optimistic rollback for items.
  const rollbackItemInsert = (listId, tempId) => {
    setDetail(d => {
      const ex = d[listId];
      if (!ex) return d;
      const nextItems = ex.items.filter(i => i.id !== tempId);
      return { ...d, [listId]: { ...ex, items: nextItems, item_count: nextItems.length } };
    });
    setLists(ls => ls ? ls.map(l => l.id === listId
      ? { ...l, item_count: Math.max(0, (l.item_count || 1) - 1), items_preview: (l.items_preview || []).filter(i => i.id !== tempId) }
      : l) : ls);
  };

  // Replace optimistic temp with the row the server returned.
  const replaceTempItem = (listId, tempId, serverItem) => {
    setDetail(d => {
      const ex = d[listId];
      if (!ex) return d;
      const nextItems = ex.items.map(i => i.id === tempId ? serverItem : i);
      return { ...d, [listId]: { ...ex, items: nextItems } };
    });
    setLists(ls => ls ? ls.map(l => l.id === listId
      ? { ...l, items_preview: (l.items_preview || []).map(i => i.id === tempId ? serverItem : i) }
      : l) : ls);
  };

  const addItemFromScan = async (scan) => {
    if (!activeListId) return;
    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const optimistic = {
      id: tempId,
      anchor: "name",
      product_name: scan.product_name,
      product_name_normalized: (scan.product_name || "").toLowerCase().trim(),
      category: scan.category,
      score: scan.score,
      kid_score: scan.kid_score ?? scan.score,
      purchased: false,
      added_at: new Date().toISOString(),
      flags: scan.flags || [],
    };
    optimisticAddItem(activeListId, optimistic);
    setAddOpen(false);
    try {
      const res = await api.createItem(activeListId, {
        product_name: scan.product_name,
        product_name_normalized: optimistic.product_name_normalized,
        category: scan.category || null,
        score: typeof scan.score === "number" ? scan.score : null,
        kid_score: typeof scan.kid_score === "number" ? scan.kid_score : (typeof scan.score === "number" ? scan.score : null),
        flags: scan.flags || [],
      });
      replaceTempItem(activeListId, tempId, res.item);
    } catch (err) {
      rollbackItemInsert(activeListId, tempId);
      handleError(err, "Couldn't add item.");
    }
  };

  const addItemByName = async (name) => {
    if (!activeListId) return;
    const trimmed = name.trim();
    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const optimistic = {
      id: tempId,
      anchor: "name",
      product_name: trimmed,
      product_name_normalized: trimmed.toLowerCase(),
      purchased: false,
      added_at: new Date().toISOString(),
      flags: [],
    };
    optimisticAddItem(activeListId, optimistic);
    setAddOpen(false);
    try {
      const res = await api.createItem(activeListId, {
        product_name: trimmed,
        product_name_normalized: trimmed.toLowerCase(),
        flags: [],
      });
      replaceTempItem(activeListId, tempId, res.item);
    } catch (err) {
      rollbackItemInsert(activeListId, tempId);
      handleError(err, "Couldn't add item.");
    }
  };

  const addItemByNameMulti = async (names) => {
    if (!activeListId || !names || !names.length) return;
    setAddOpen(false);
    // Fire all in parallel. Each handles its own optimistic + rollback.
    const results = await Promise.allSettled(names.map(n => addItemByName(n)));
    const failed = results.filter(r => r.status === "rejected").length;
    if (!failed) {
      showToast(names.length === 1 ? `Added ${names[0]}.` : `Added ${names.length} items.`);
    }
  };

  const addItemByUrl = async (rawUrl) => {
    if (!activeListId) return;
    const tempId = `tmp_${Date.now()}`;
    const normalized = (rawUrl || "").toLowerCase().trim();
    const optimistic = {
      id: tempId,
      anchor: "name",
      product_name: rawUrl,
      product_name_normalized: normalized,
      placeholder: true,
      purchased: false,
      added_at: new Date().toISOString(),
      flags: [],
    };
    optimisticAddItem(activeListId, optimistic);
    setAddOpen(false);
    let serverItem = null;
    try {
      const res = await api.createItem(activeListId, {
        product_name: rawUrl,
        product_name_normalized: normalized,
        flags: [],
      });
      serverItem = res.item;
      // Keep placeholder flag locally so the row still renders "Reading the
      // link..." until the resolve timer fires.
      replaceTempItem(activeListId, tempId, { ...serverItem, placeholder: true });
    } catch (err) {
      rollbackItemInsert(activeListId, tempId);
      handleError(err, "Couldn't add link.");
      return;
    }

    // Resolve placeholder name after ~1.4s (mimics R2 fetch + extract).
    const settle = async () => {
      let resolved = rawUrl;
      try {
        const u = new URL(rawUrl);
        const host = u.hostname.replace(/^www\./, "").split(".")[0];
        const seg = u.pathname.split("/").filter(s => s && s.length > 2).pop() || "product";
        const tidy = seg.replace(/[-_]+/g, " ").replace(/[^a-zA-Z0-9 ]/g, "").trim();
        resolved = (host.charAt(0).toUpperCase() + host.slice(1)) + (tidy && tidy.length > 3 ? ` ${tidy.split(" ").slice(0, 3).join(" ")}` : " product");
      } catch {}
      // Optimistic local update + PATCH product_name.
      setDetail(d => {
        const ex = d[activeListId];
        if (!ex) return d;
        return { ...d, [activeListId]: { ...ex, items: ex.items.map(i => i.id === serverItem.id ? { ...i, placeholder: false, product_name: resolved } : i) }};
      });
      try {
        await api.updateItem(activeListId, serverItem.id, { product_name: resolved });
      } catch (err) {
        // Soft-fail: keep the local "resolved" name visible. The next detail
        // refresh from the server will reconcile if needed.
        console.warn("[lists] URL settle PATCH failed", err?.message);
      }
    };
    placeholderTimers.current[serverItem.id] = setTimeout(settle, 1400);
  };

  const removeItem = async (itemId) => {
    if (!activeListId) return;
    if (placeholderTimers.current[itemId]) {
      clearTimeout(placeholderTimers.current[itemId]);
      delete placeholderTimers.current[itemId];
    }
    const prevDetail = detail[activeListId];
    const prevLists = lists;
    setDetail(d => {
      const ex = d[activeListId];
      if (!ex) return d;
      const nextItems = ex.items.filter(i => i.id !== itemId);
      return { ...d, [activeListId]: { ...ex, items: nextItems, item_count: nextItems.length } };
    });
    setLists(ls => ls ? ls.map(l => l.id === activeListId
      ? { ...l, item_count: Math.max(0, (l.item_count || 1) - 1), items_preview: (l.items_preview || []).filter(i => i.id !== itemId) }
      : l) : ls);
    if (String(itemId).startsWith("tmp_")) return; // never made it to the server
    try {
      await api.deleteItem(activeListId, itemId);
    } catch (err) {
      if (prevDetail) setDetail(d => ({ ...d, [activeListId]: prevDetail }));
      setLists(prevLists);
      handleError(err, "Couldn't remove.");
    }
  };

  // The Owned/Considering toggle is purely cosmetic at the row level; the
  // R3b schema doesn't store an "owned" flag yet. Update detail state only
  // so the UI reflects the user's choice within the session.
  const toggleOwned = (itemId) => {
    if (!activeListId) return;
    setDetail(d => {
      const ex = d[activeListId];
      if (!ex) return d;
      return { ...d, [activeListId]: { ...ex, items: ex.items.map(i => i.id === itemId ? { ...i, owned: !i.owned } : i) } };
    });
  };

  const togglePurchased = async (itemId) => {
    if (!activeListId) return;
    const prevDetail = detail[activeListId];
    let nextPurchased = false;
    setDetail(d => {
      const ex = d[activeListId];
      if (!ex) return d;
      return { ...d, [activeListId]: { ...ex, items: ex.items.map(i => {
        if (i.id !== itemId) return i;
        nextPurchased = !i.purchased;
        return { ...i, purchased: nextPurchased };
      }) } };
    });
    if (String(itemId).startsWith("tmp_")) return;
    try {
      await api.updateItem(activeListId, itemId, { purchased: nextPurchased });
    } catch (err) {
      if (prevDetail) setDetail(d => ({ ...d, [activeListId]: prevDetail }));
      handleError(err, "Couldn't update.");
    }
  };

  const saveNote = async (itemId, nextNote) => {
    if (!activeListId) return;
    const prevDetail = detail[activeListId];
    setDetail(d => {
      const ex = d[activeListId];
      if (!ex) return d;
      return { ...d, [activeListId]: { ...ex, items: ex.items.map(i => i.id === itemId
        ? { ...i, note: nextNote && nextNote.trim() ? nextNote.trim() : undefined }
        : i) } };
    });
    setEditingNote(null);
    if (String(itemId).startsWith("tmp_")) return;
    try {
      await api.updateItem(activeListId, itemId, { note: nextNote && nextNote.trim() ? nextNote.trim() : null });
    } catch (err) {
      if (prevDetail) setDetail(d => ({ ...d, [activeListId]: prevDetail }));
      handleError(err, "Couldn't save note.");
    }
  };

  // R3g — drag-to-reorder commit, batched. Previously fired N parallel
  // PATCHes which 504'd in production because each PATCH ran a full
  // ownership check + Redis cache invalidation. The new POST
  // /lists/:id/reorder endpoint takes the full position map and runs
  // one ownership check + N serial UPDATEs + one cache invalidation.
  const reorderItems = async (orderedIds) => {
    if (!activeListId) return;
    const prevDetail = detail[activeListId];
    if (!prevDetail) return;
    const byId = new Map(prevDetail.items.map(i => [i.id, i]));
    const reordered = orderedIds.map((id, idx) => byId.has(id) ? { ...byId.get(id), position: idx } : null).filter(Boolean);
    const seen = new Set(orderedIds);
    for (const i of prevDetail.items) if (!seen.has(i.id)) reordered.push(i);
    setDetail(d => ({ ...d, [activeListId]: { ...prevDetail, items: reordered } }));

    // Skip temp IDs (still in flight from a parallel optimistic insert).
    const positions = reordered
      .map((i, idx) => ({ id: i.id, position: idx }))
      .filter(p => !String(p.id).startsWith("tmp_"));
    if (!positions.length) return;

    try {
      await api.reorderItems(activeListId, positions);
    } catch (err) {
      setDetail(d => ({ ...d, [activeListId]: prevDetail }));
      handleError(err, "Couldn't reorder.");
    }
  };

  // R3g — Score it handler. Runs analyzeQuiet in the background to score
  // the typed-in product name, then PATCHes the list item with the
  // display fields (score, kid_score, flags, category). The PATCH
  // endpoint does not accept scan_id today, so the item stays
  // anchor="name" in the database, but the row now carries score data
  // and renders with the score chip instead of the Score it button.
  const scoreItem = async (item) => {
    if (!item || !activeListId || scoring[item.id]) return;
    if (typeof analyzeQuiet !== "function") {
      showToast("Scoring is unavailable right now.");
      return;
    }
    const query = (item.product_name || item.product_name_normalized || "").trim();
    if (!query) return;
    setScoring(s => ({ ...s, [item.id]: true }));
    try {
      const result = await analyzeQuiet(query);
      const patch = {
        product_name: result.product_name || query,
        category: result.category || null,
        score: typeof result.score === "number" ? result.score
             : (typeof result.overall_score === "number" ? result.overall_score : null),
        kid_score: typeof result.child_score === "number" ? result.child_score
                  : (typeof result.kid_score === "number" ? result.kid_score
                  : (typeof result.score === "number" ? result.score : null)),
        flags: Array.isArray(result.flagged_substances)
          ? result.flagged_substances
              .map(f => typeof f === "string" ? f : (f && f.substance) || "")
              .filter(f => typeof f === "string" && f.length > 0)
              .slice(0, 20)
          : [],
      };

      // Optimistic local patch so the chip and category icon flip in
      // immediately while the network call completes.
      setDetail(d => {
        const ex = d[activeListId];
        if (!ex) return d;
        return { ...d, [activeListId]: { ...ex, items: ex.items.map(i => i.id === item.id ? { ...i, ...patch } : i) } };
      });

      if (String(item.id).startsWith("tmp_")) {
        // The item itself is still in flight — its real ID isn't known
        // yet. The optimistic local patch above is the best we can do;
        // when the create resolves, the server row already lacks score
        // data, so a follow-up scoring pass may be needed.
        return;
      }

      const res = await api.updateItem(activeListId, item.id, patch);
      setDetail(d => {
        const ex = d[activeListId];
        if (!ex) return d;
        return { ...d, [activeListId]: { ...ex, items: ex.items.map(i => i.id === item.id ? res.item : i) } };
      });
    } catch (err) {
      if (err && err.status === 401) onAuthRequired?.();
      else if (err && err.status === 402) showToast("Subscribe to score items in your lists.");
      else showToast("Couldn't score that one. Try again.");
    } finally {
      setScoring(s => { const { [item.id]: _, ...rest } = s; return rest; });
    }
  };

  const swapItem = async (itemId, alt) => {
    if (!activeListId) return;
    const prevDetail = detail[activeListId];
    const patch = {
      product_name: alt.product_name,
      category: alt.category,
      score: alt.score,
      kid_score: alt.kid_score,
      flags: alt.flags || [],
    };
    setDetail(d => {
      const ex = d[activeListId];
      if (!ex) return d;
      return { ...d, [activeListId]: { ...ex, items: ex.items.map(i => i.id === itemId
        ? { ...i, ...patch }
        : i) } };
    });
    if (String(itemId).startsWith("tmp_")) {
      showToast(`Swapped in ${alt.product_name}.`);
      return;
    }
    try {
      await api.updateItem(activeListId, itemId, patch);
      showToast(`Swapped in ${alt.product_name}.`);
    } catch (err) {
      if (prevDetail) setDetail(d => ({ ...d, [activeListId]: prevDetail }));
      handleError(err, "Couldn't swap.");
    }
  };

  const shareList = async (list, kidsOn, scoreInfo) => {
    const text = buildShareText(list, kidsOn, scoreInfo);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        showToast("Copied to clipboard.");
      } else {
        showToast("Clipboard not available.");
      }
    } catch {
      showToast("Couldn't copy. Try again.");
    }
  };

  // allLists for ListDetail cross-list intel. Cross-list info on the row
  // is also already baked into detail.also_in_map by the server, but we
  // continue to pass the summary list so optimistic adds in other lists
  // surface immediately without a refetch.
  const allListsForDetail = useMemo(() => {
    if (!lists) return [];
    return lists.map(l => ({
      id: l.id,
      name: l.name,
      items: (l.items_preview || []).map(i => ({ product_name: i.product_name })),
    }));
  }, [lists]);

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight:"100vh",
      background:"var(--cream)",
      paddingTop: (isMobile ? 60 : 72) + safeTop + 28,
      paddingBottom: isMobile ? 120 : 60,
    }}>
      {view === "overview" && (
        <ListsOverview
          lists={lists}
          loading={loadingLists}
          error={errorLists}
          onOpen={openList}
          onCreate={startNewList}
          onRetry={loadLists}
          isMobile={isMobile}
        />
      )}
      {view === "detail" && activeDetail && (
        <ListDetail
          key={activeListId}
          list={activeDetail}
          allLists={allListsForDetail}
          onBack={backToOverview}
          onRename={renameList}
          onAddItem={() => setAddOpen(true)}
          onRemoveItem={removeItem}
          onToggleOwned={toggleOwned}
          onTogglePurchased={togglePurchased}
          onEditNote={(item) => setEditingNote(item)}
          onSwapItem={swapItem}
          onScoreItem={scoreItem}
          onShare={shareList}
          onReorderItems={reorderItems}
          onOpenList={openList}
          onAddByName={addItemByName}
          onDeleteList={(id) => setPendingDelete(id)}
          scoring={scoring}
          isMobile={isMobile}
        />
      )}
      {view === "detail" && !activeDetail && activeListId && loadingDetail[activeListId] && (
        <ListDetailSkeleton onBack={backToOverview} isMobile={isMobile}/>
      )}
      {view === "detail" && !activeDetail && activeListId && errorDetail[activeListId] && (
        <ListDetailError
          message={errorDetail[activeListId]}
          onRetry={() => loadDetail(activeListId)}
          onBack={backToOverview}
          isMobile={isMobile}
        />
      )}
      {view === "detail" && !activeListId && (
        <ListsOverview
          lists={lists}
          loading={loadingLists}
          error={errorLists}
          onOpen={openList}
          onCreate={startNewList}
          onRetry={loadLists}
          isMobile={isMobile}
        />
      )}
      {addOpen && (
        <AddItemSheet
          recentScans={recentScans}
          onClose={() => setAddOpen(false)}
          onAddFromScan={addItemFromScan}
          onAddByName={addItemByName}
          onAddByNameMulti={addItemByNameMulti}
          onAddByUrl={addItemByUrl}
          isMobile={isMobile}
        />
      )}
      {newListMode === "chooser" && (
        <NewListChooser
          onBlank={createBlankList}
          onTemplate={goToTemplates}
          onCancel={cancelNewList}
        />
      )}
      {newListMode === "templates" && (
        <TemplatePicker
          templates={TEMPLATES}
          onPick={createListFromTemplate}
          onBack={backToChooser}
          onCancel={cancelNewList}
          isMobile={isMobile}
        />
      )}
      {editingNote && (
        <NoteEditModal
          initialNote={editingNote.note || ""}
          productName={editingNote.product_name || editingNote.product_name_normalized || "this item"}
          onSave={(text) => saveNote(editingNote.id, text)}
          onCancel={() => setEditingNote(null)}
        />
      )}
      {pendingDelete && (
        <ConfirmModal
          title="Delete this list?"
          body="The list and all its items go away. The scans behind them stay safe in your history."
          confirmLabel="Delete"
          onConfirm={() => deleteList(pendingDelete)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
      <Toast message={toast}/>
    </div>
  );
};

export default ListBuilderPage;
