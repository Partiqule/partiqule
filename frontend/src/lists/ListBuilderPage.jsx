// R3a list builder prototype.
//
// Three views switched by component state: lists overview, list detail,
// and the add-item sheet. All state is in-memory and resets on reload.
// No backend calls, no Supabase, no persistence — Sara reviews UX and copy
// here before R3b locks the schema and R3c wires real endpoints.

import React, { useState, useMemo, useRef } from "react";
import { FAKE_LISTS, FAKE_RECENT_SCANS } from "./fixtures";

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

const ListsOverview = ({ lists, onOpen, onCreate, isMobile }) => {
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
      {lists.length === 0 ? (
        <div style={{textAlign:"center", padding:"60px 20px", background:"var(--cream-light)", border:"1px solid var(--rule)", borderRadius:CARD_SHAPE}}>
          <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:20, color:"var(--ink)", marginBottom:10, letterSpacing:"-0.01em"}}>Start your first list.</div>
          <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13, color:"var(--ink-soft)", lineHeight:1.5, marginBottom:18}}>Add what you want to remember. Add what you want to swap.</div>
          <PillButton onClick={onCreate}>Create a list</PillButton>
        </div>
      ) : (
        <div>{lists.map(l => <ListCard key={l.id} list={l} onOpen={onOpen}/>)}</div>
      )}
    </div>
  );
};

// ── List detail ────────────────────────────────────────────────────
const ItemRow = ({ item, onRemove, onToggleOwned }) => {
  const displayName = item.product_name || item.product_name_normalized || "Unnamed item";
  const isReading = item.placeholder === true;
  return (
    <div style={{display:"flex", alignItems:"flex-start", gap:14, padding:"14px 4px", borderBottom:"1px solid var(--rule-soft)"}}>
      <div style={{flexShrink:0, width:32, height:32, display:"flex", alignItems:"center", justifyContent:"center", borderRadius:TILE_SHAPE, background:"var(--cream-light)", border:"1px solid var(--rule-soft)"}}>
        <CategoryIcon category={item.category} size={16} color="var(--moss)"/>
      </div>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:16, fontWeight:400, color:"var(--ink)", letterSpacing:"-0.005em", lineHeight:1.3, marginBottom:6, fontStyle: isReading ? "normal" : "normal", opacity: isReading ? 0.6 : 1}}>
          {isReading ? "Reading the link..." : displayName}
        </div>
        {item.note && !isReading && (
          <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:12, color:"var(--ink-soft)", lineHeight:1.4, marginBottom:6}}>{item.note}</div>
        )}
        <div style={{display:"flex", alignItems:"center", gap:10, marginTop:4, flexWrap:"wrap"}}>
          {item.anchor === "name" ? (
            <>
              <ScoreChip score={null}/>
              <button onClick={(e)=>e.preventDefault()} style={{padding:"3px 12px", borderRadius:999, border:"1px solid var(--rule-strong)", background:"transparent", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:11, fontWeight:600, color:"var(--ink-soft)", letterSpacing:"0.06em", textTransform:"uppercase", cursor:"pointer"}}>
                Score it
              </button>
            </>
          ) : (
            <>
              <ScoreChip score={item.score}/>
              {item.anchor === "scan" && (
                <button onClick={(e)=>{e.stopPropagation(); onToggleOwned(item.id);}}
                  style={{padding:"3px 12px", borderRadius:999, border:"1px solid var(--rule)", background: item.owned ? "var(--moss-soft)" : "transparent", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:11, fontWeight:600, color: item.owned ? "var(--moss-deep)" : "var(--ink-soft)", letterSpacing:"0.06em", textTransform:"uppercase", cursor:"pointer"}}>
                  {item.owned ? "Owned" : "Considering"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <button onClick={()=>onRemove(item.id)} aria-label="Remove item"
        style={{flexShrink:0, width:30, height:30, display:"flex", alignItems:"center", justifyContent:"center", padding:0, background:"transparent", border:"none", borderRadius:6, cursor:"pointer"}}>
        <X size={14}/>
      </button>
    </div>
  );
};

const ListDetail = ({ list, onBack, onRename, onAddItem, onRemoveItem, onToggleOwned, onDeleteList, isMobile }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(list.name);
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
        <button aria-label="Share list" style={{flexShrink:0, width:42, height:42, display:"flex", alignItems:"center", justifyContent:"center", padding:0, background:"var(--cream-light)", border:"1px solid var(--rule-strong)", borderRadius:TILE_SHAPE, cursor:"pointer"}}>
          <Share/>
        </button>
      </div>

      <div style={{display:"flex", alignItems:"center", gap:10, fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:11, letterSpacing:"0.14em", textTransform:"uppercase", fontWeight:600, color:"var(--ink-soft)", marginBottom:24}}>
        <span>{list.items.length} {list.items.length === 1 ? "item" : "items"}</span>
        <span style={{opacity:0.4}}>·</span>
        <span>Updated {relativeTime(updatedAt)}</span>
      </div>

      {list.items.length === 0 ? (
        <div style={{textAlign:"center", padding:"40px 20px", background:"var(--cream-light)", border:"1px solid var(--rule)", borderRadius:CARD_SHAPE, marginBottom:24}}>
          <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:18, color:"var(--ink)", marginBottom:8, letterSpacing:"-0.005em"}}>Nothing here yet.</div>
          <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13, color:"var(--ink-soft)", lineHeight:1.5}}>Add what you want to remember.</div>
        </div>
      ) : (
        <div style={{marginBottom:24}}>
          {list.items.map(item => (
            <ItemRow key={item.id} item={item} onRemove={onRemoveItem} onToggleOwned={onToggleOwned}/>
          ))}
        </div>
      )}

      <div style={{marginBottom:32}}>
        <PillButton onClick={onAddItem}><Plus/> Add item</PillButton>
      </div>

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

const AddItemSheet = ({ recentScans, onClose, onAddFromScan, onAddByName, onAddByUrl, isMobile }) => {
  const [tab, setTab] = useState("recent");
  const [nameInput, setNameInput] = useState("");
  const [urlInput, setUrlInput] = useState("");

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
              <input value={nameInput}
                onChange={e=>setNameInput(e.target.value)}
                onKeyDown={e=>{ if (e.key === "Enter") submitName(); }}
                placeholder="Type a product name"
                style={{width:"100%", padding:"12px 14px", borderRadius:CARD_SHAPE, background:"var(--cream-light)", border:"1px solid var(--rule-strong)", outline:"none", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:15, color:"var(--ink)", marginBottom:14, boxSizing:"border-box"}}/>
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

// ── Top-level page ─────────────────────────────────────────────────
const ListBuilderPage = ({ history = [], isMobile = false, safeTop = 0 }) => {
  const [lists, setLists] = useState(FAKE_LISTS);
  const [view, setView] = useState("overview"); // overview | detail
  const [activeListId, setActiveListId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const placeholderTimers = useRef({});

  const activeList = lists.find(l => l.id === activeListId) || null;

  // Recent scans for the "From recent scans" picker. Prefer real user history
  // if available — Sara should see her actual scans where possible. Falls back
  // to FAKE_RECENT_SCANS on a fresh session with no history.
  const recentScans = useMemo(() => {
    const real = (history || [])
      .filter(h => h && h.product_name)
      .slice(0, 8)
      .map(h => ({
        product_name: h.product_name,
        category:     h.category || "other",
        score:        h.overall_score ?? h.score ?? null,
        scanned_at:   h.scanned_at || h.cached_at || new Date().toISOString(),
      }));
    return real.length >= 3 ? real : FAKE_RECENT_SCANS;
  }, [history]);

  const openList = (id) => { setActiveListId(id); setView("detail"); };
  const backToOverview = () => { setView("overview"); setActiveListId(null); };

  const createList = () => {
    const name = window.prompt("Name this list", "");
    if (!name || !name.trim()) return;
    const id = `list_${Date.now()}`;
    setLists(prev => [{
      id, name: name.trim(), kind: "shopping",
      created_at: new Date().toISOString(),
      items: [],
    }, ...prev]);
    setActiveListId(id);
    setView("detail");
  };

  const renameList = (id, nextName) => {
    setLists(prev => prev.map(l => l.id === id ? { ...l, name: nextName } : l));
  };

  const deleteList = (id) => {
    setLists(prev => prev.filter(l => l.id !== id));
    if (activeListId === id) backToOverview();
    setPendingDelete(null);
  };

  const addItemFromScan = (scan) => {
    if (!activeListId) return;
    const newItem = {
      id: `i_${Date.now()}`,
      anchor: "scan",
      scan_id: `local_${Date.now()}`,
      product_name: scan.product_name,
      category: scan.category,
      score: scan.score,
      owned: true,
      scanned_at: scan.scanned_at,
    };
    setLists(prev => prev.map(l => l.id === activeListId ? { ...l, items: [...l.items, newItem] } : l));
    setAddOpen(false);
  };

  const addItemByName = (name) => {
    if (!activeListId) return;
    const newItem = {
      id: `i_${Date.now()}`,
      anchor: "name",
      product_name_normalized: name.toLowerCase().trim(),
      product_name: name.trim(),
    };
    setLists(prev => prev.map(l => l.id === activeListId ? { ...l, items: [...l.items, newItem] } : l));
    setAddOpen(false);
  };

  const addItemByUrl = (rawUrl) => {
    if (!activeListId) return;
    const itemId = `i_${Date.now()}`;
    const newItem = {
      id: itemId,
      anchor: "name",
      product_name_normalized: "",
      product_name: rawUrl,
      placeholder: true,
    };
    setLists(prev => prev.map(l => l.id === activeListId ? { ...l, items: [...l.items, newItem] } : l));
    setAddOpen(false);

    // Mimic R2's fetch-and-resolve transition. After ~1.4s the placeholder
    // settles into a fake resolved name derived from the URL hostname so
    // Sara can demo the "Reading the link..." then resolved state in one go.
    const settle = () => {
      let resolved = rawUrl;
      try {
        const u = new URL(rawUrl);
        const host = u.hostname.replace(/^www\./, "").split(".")[0];
        const seg = u.pathname.split("/").filter(s => s && s.length > 2).pop() || "product";
        const tidy = seg.replace(/[-_]+/g, " ").replace(/[^a-zA-Z0-9 ]/g, "").trim();
        resolved = (host.charAt(0).toUpperCase() + host.slice(1)) + (tidy && tidy.length > 3 ? ` ${tidy.split(" ").slice(0,3).join(" ")}` : " product");
      } catch {}
      setLists(prev => prev.map(l => l.id === activeListId
        ? { ...l, items: l.items.map(i => i.id === itemId ? { ...i, placeholder: false, product_name: resolved, product_name_normalized: resolved.toLowerCase() } : i) }
        : l));
    };
    placeholderTimers.current[itemId] = setTimeout(settle, 1400);
  };

  const removeItem = (itemId) => {
    if (placeholderTimers.current[itemId]) {
      clearTimeout(placeholderTimers.current[itemId]);
      delete placeholderTimers.current[itemId];
    }
    setLists(prev => prev.map(l => l.id === activeListId
      ? { ...l, items: l.items.filter(i => i.id !== itemId) }
      : l));
  };

  const toggleOwned = (itemId) => {
    setLists(prev => prev.map(l => l.id === activeListId
      ? { ...l, items: l.items.map(i => i.id === itemId ? { ...i, owned: !i.owned } : i) }
      : l));
  };

  return (
    <div style={{
      minHeight:"100vh",
      background:"var(--cream)",
      paddingTop: (isMobile ? 60 : 72) + safeTop + 28,
      paddingBottom: isMobile ? 120 : 60,
    }}>
      {view === "overview" && (
        <ListsOverview lists={lists} onOpen={openList} onCreate={createList} isMobile={isMobile}/>
      )}
      {view === "detail" && activeList && (
        <ListDetail
          list={activeList}
          onBack={backToOverview}
          onRename={renameList}
          onAddItem={()=>setAddOpen(true)}
          onRemoveItem={removeItem}
          onToggleOwned={toggleOwned}
          onDeleteList={(id)=>setPendingDelete(id)}
          isMobile={isMobile}
        />
      )}
      {view === "detail" && !activeList && (
        // Active list was deleted while detail view was open — bounce back.
        <ListsOverview lists={lists} onOpen={openList} onCreate={createList} isMobile={isMobile}/>
      )}
      {addOpen && (
        <AddItemSheet
          recentScans={recentScans}
          onClose={()=>setAddOpen(false)}
          onAddFromScan={addItemFromScan}
          onAddByName={addItemByName}
          onAddByUrl={addItemByUrl}
          isMobile={isMobile}
        />
      )}
      {pendingDelete && (
        <ConfirmModal
          title="Delete this list?"
          body="The list and all its items go away. The scans behind them stay safe in your history."
          confirmLabel="Delete"
          onConfirm={()=>deleteList(pendingDelete)}
          onCancel={()=>setPendingDelete(null)}
        />
      )}
    </div>
  );
};

export default ListBuilderPage;
