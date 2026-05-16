// R5b.1 Ask page — live SSE consumer.
//
// /ask-prototype POSTs to /ask and streams Server-Sent Events. The fixtures
// import survives for placeholder copy, list-picker stub names, example
// queries on the no-match state, and the NOVA label map. The findResponse
// helper is no longer used: every render path is fed by streamed events.
//
// Event shape from backend/ask.js:
//   event: thinking | intent | item | done | refuse | error
// Items arrive in score-ascending order from the backend, but we sort
// client-side as well so out-of-order delivery doesn't matter.

import React, { useState, useEffect, useRef } from "react";
import { PLACEHOLDER_EXAMPLES, FAKE_LIST_NAMES, EXAMPLE_QUERIES, NOVA_LABEL } from "./fixtures";
import ContextBundleCard from "./ContextBundleCard";
import KnowledgeCard from "./KnowledgeCard";

// ── Design tokens (token-only, no inline hex) ─────────────────────
const CARD_SHAPE = "14px 10px 15px 12px / 10px 15px 12px 14px";
const CTA_SHAPE  = "22px 18px 24px 20px / 20px 24px 18px 22px";
const TILE_SHAPE = "12px 16px 14px 18px / 16px 12px 18px 14px";

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

// ── Icons ────────────────────────────────────────────────────────
const X = ({ size = 14, color = "var(--ink-faint)" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
    <line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/>
  </svg>
);

const SmallPlus = ({ size = 12, color = "var(--moss)" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

// ── Shared bits ──────────────────────────────────────────────────
const SectionStamp = ({ label, color = "var(--moss)" }) => (
  <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:10}}>
    <span style={{display:"inline-block", width:22, height:1, background:color, opacity:0.7}}/>
    <span style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:10, letterSpacing:"0.22em", textTransform:"uppercase", fontWeight:500, color}}>{label}</span>
  </div>
);

const PrototypePill = () => (
  <span style={{display:"inline-flex", alignItems:"center", padding:"3px 10px", borderRadius:999, background:"rgba(200, 120, 26, 0.10)", border:"1px solid var(--amber)", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:10, letterSpacing:"0.14em", textTransform:"uppercase", fontWeight:600, color:"var(--amber)", marginLeft:10, verticalAlign:"middle"}}>
    Prototype
  </span>
);

const PillButton = ({ onClick, children, kind = "primary", disabled = false, style = {} }) => {
  const bg = kind === "primary" ? "var(--moss)" : "transparent";
  const color = kind === "primary" ? "var(--ivory)" : "var(--ink)";
  const border = kind === "primary" ? "none" : "1px solid var(--rule-strong)";
  return (
    <button onClick={onClick} disabled={disabled} style={{display:"inline-flex", alignItems:"center", justifyContent:"center", gap:8, padding:"12px 20px", borderRadius:CTA_SHAPE, background:bg, color, border, fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:14, fontWeight:500, cursor: disabled ? "not-allowed" : "pointer", letterSpacing:"0.005em", opacity: disabled ? 0.5 : 1, ...style}}>
      {children}
    </button>
  );
};

const ScoreChip = ({ score }) => {
  if (score == null) {
    return (
      <span style={{display:"inline-flex", alignItems:"center", padding:"3px 10px", borderRadius:999, background:"var(--rule-soft)", border:"1px solid var(--rule)", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:11, letterSpacing:"0.08em", textTransform:"uppercase", fontWeight:600, color:"var(--ink-faint)"}}>
        Unscored
      </span>
    );
  }
  return (
    <span style={{display:"inline-flex", alignItems:"center", gap:6, padding:"5px 11px", borderRadius:999, background:scoreBg(score), border:`1px solid ${scoreColor(score)}`, fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13, fontWeight:600, color:scoreColor(score)}}>
      <span style={{width:7, height:7, borderRadius:"50%", background:scoreColor(score)}}/>
      {score}
    </span>
  );
};

const Toast = ({ message }) => {
  if (!message) return null;
  return (
    <div style={{position:"fixed", bottom: 110, left:"50%", transform:"translateX(-50%)", padding:"10px 18px", background:"var(--ink)", color:"var(--ivory)", borderRadius: CARD_SHAPE, fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13, fontWeight:500, zIndex:200, animation:"fadeUp 0.25s ease", boxShadow:"0 8px 24px rgba(0,0,0,0.15)", whiteSpace:"nowrap"}}>
      {message}
    </div>
  );
};

// R5a r2 — quiet action button. Used for every action affordance on the
// item card so the image + product name + score chip + why copy can
// dominate the visual hierarchy. Ghost style, ink-soft text, small.
const QuietButton = ({ onClick, children, style = {}, asAnchor = false, href, ariaLabel, ariaExpanded }) => {
  const baseStyle = {
    display:"inline-flex", alignItems:"center", gap:6,
    padding:"4px 10px",
    background:"transparent",
    border:"1px solid var(--rule)",
    borderRadius:999,
    fontFamily:"'DM Sans', system-ui, sans-serif",
    fontSize:12, fontWeight:500,
    color:"var(--ink-soft)",
    letterSpacing:"0.01em",
    textDecoration:"none",
    cursor:"pointer",
    ...style,
  };
  if (asAnchor) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" aria-label={ariaLabel} style={baseStyle}>
        {children}
      </a>
    );
  }
  return (
    <button onClick={onClick} aria-label={ariaLabel} aria-expanded={ariaExpanded} style={baseStyle}>
      {children}
    </button>
  );
};

// R5a r2 — product image / fallback avatar. Placeholder system for the
// prototype: image_url is null on every fixture today, so the colored
// initial avatar always fires. Real images wire in via R5b.
const ProductImage = ({ url, name, score, size = 46 }) => {
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
      background: bg,
      color: "var(--ivory)",
      display:"flex", alignItems:"center", justifyContent:"center",
      fontFamily:"'Lora', Georgia, serif",
      fontSize: Math.round(size * 0.46),
      fontWeight:500,
      letterSpacing:"-0.02em",
    }}>{initial}</div>
  );
};

// ── Buy links row ────────────────────────────────────────────────
// Mirrors the existing alternatives source toggle voice: bare retailer
// labels with the "→" arrow, no commercial verbs. Buttons individually
// hide when a link is missing; the whole row hides when none are present.
// R5a r2: rendered with the same quiet style as the rest of the item
// actions so they recede behind the content.
const BuyLinks = ({ links }) => {
  const entries = [];
  if (links?.amazon) entries.push({ key: "amazon", label: "Amazon", url: links.amazon });
  if (links?.brand)  entries.push({ key: "brand",  label: "Brand site", url: links.brand });
  if (links?.target) entries.push({ key: "target", label: "Target", url: links.target });
  if (!entries.length) return null;
  return (
    <div style={{display:"flex", flexWrap:"wrap", gap:8, marginBottom:12}}>
      {entries.map(e => (
        <QuietButton key={e.key} asAnchor href={e.url} ariaLabel={`Open on ${e.label}`}>
          {e.label} <span style={{color:"var(--moss)"}}>→</span>
        </QuietButton>
      ))}
    </div>
  );
};

// ── Flag dot ────────────────────────────────────────────────────
const flagDotColor = (kind) => {
  if (kind === "good") return "var(--score-green)";
  if (kind === "concern") return "var(--score-red)";
  return "var(--ink-faint)";
};

// ── Expanded scoring details (R5a r1) ────────────────────────────
const ScoringDetails = ({ item }) => {
  const showKidNote = item.kid_score != null && item.kid_score !== item.score;
  return (
    <div style={{padding:"16px 0 4px", borderTop:"1px dashed var(--rule)"}}>
      {item.tier != null && item.tier_note && (
        <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:15, fontWeight:400, color:"var(--ink)", letterSpacing:"-0.005em", lineHeight:1.5, marginBottom:14}}>
          Tier {item.tier}. {item.tier_note}
        </div>
      )}

      {Array.isArray(item.detailed_flags) && item.detailed_flags.length > 0 && (
        <div style={{display:"flex", flexDirection:"column", gap:8, marginBottom:14}}>
          {item.detailed_flags.map((f, i) => (
            <div key={i} style={{display:"flex", alignItems:"flex-start", gap:10, fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13, lineHeight:1.45}}>
              <span style={{flexShrink:0, width:8, height:8, borderRadius:"50%", background:flagDotColor(f.kind), marginTop:6}}/>
              <span style={{flex:1, color:"var(--ink-soft)"}}>
                <span style={{color:"var(--ink)", fontWeight:600, marginRight:6}}>{f.label}</span>
                {f.detail}
              </span>
            </div>
          ))}
        </div>
      )}

      {showKidNote && (
        <div style={{display:"flex", alignItems:"flex-start", gap:10, padding:"10px 12px", background:"var(--cream-light)", border:"1px solid var(--rule)", borderRadius:CARD_SHAPE, fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:12, color:"var(--ink-soft)", lineHeight:1.5, marginBottom:14}}>
          <span style={{flexShrink:0, fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:10, letterSpacing:"0.14em", textTransform:"uppercase", fontWeight:600, color:"var(--moss)"}}>Kids note</span>
          <span>{item.kid_score_note || `Kids score ${item.kid_score} vs adult ${item.score}.`}</span>
        </div>
      )}

      {item.nova != null && NOVA_LABEL[item.nova] && (
        <div style={{display:"flex", alignItems:"baseline", gap:8, marginBottom:12, fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:12, color:"var(--ink-soft)"}}>
          <span style={{fontSize:10, letterSpacing:"0.14em", textTransform:"uppercase", fontWeight:600, color:"var(--moss)"}}>NOVA {item.nova}</span>
          <span>{NOVA_LABEL[item.nova]}</span>
        </div>
      )}

      {item.calibration_note && (
        <div style={{display:"flex", alignItems:"baseline", gap:8, fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:12, color:"var(--ink-soft)", lineHeight:1.5}}>
          <span style={{fontSize:10, letterSpacing:"0.14em", textTransform:"uppercase", fontWeight:600, color:"var(--moss)"}}>Verified</span>
          <span>{item.calibration_note}</span>
        </div>
      )}
    </div>
  );
};

// ── Result item row ──────────────────────────────────────────────
const ResultItem = ({ item, isExpanded, onToggleExpand, onAddToList }) => (
  <div style={{padding:"18px 0", borderBottom:"1px solid var(--rule-soft)"}}>
    <div style={{display:"flex", alignItems:"flex-start", gap:14}}>
      <ProductImage url={item.image_url} name={item.product_name} score={item.score} size={46}/>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:17, fontWeight:500, color:"var(--ink)", letterSpacing:"-0.005em", lineHeight:1.3, marginBottom:8}}>
          {item.product_name}
        </div>
        <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13, color:"var(--ink-soft)", lineHeight:1.55, marginBottom:12}}>
          {item.why}
        </div>

        <BuyLinks links={item.buy_links}/>

        <div style={{display:"flex", flexWrap:"wrap", gap:8, alignItems:"center"}}>
          <QuietButton onClick={() => onAddToList(item)} ariaLabel="Add to a list">
            <SmallPlus size={10} color="var(--ink-soft)"/> Add to list
          </QuietButton>
          <QuietButton onClick={() => onToggleExpand(item.id)} ariaExpanded={isExpanded} ariaLabel="Why this score" style={{border:"none"}}>
            Why this score
            <span style={{display:"inline-block", fontSize:12, color:"var(--moss)", transition:"transform 0.2s ease", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)"}}>▾</span>
          </QuietButton>
        </div>
      </div>
      <div style={{flexShrink:0}}>
        <ScoreChip score={item.score}/>
      </div>
    </div>

    {isExpanded && <ScoringDetails item={item}/>}
  </div>
);

// ── Add to list picker ──────────────────────────────────────────
const AddToListPicker = ({ item, lists, onCancel, onPick }) => (
  <div onClick={onCancel}
    style={{position:"fixed", inset:0, background:"rgba(26,31,21,0.40)", zIndex:130, display:"flex", alignItems:"center", justifyContent:"center", padding:24}}>
    <div onClick={e => e.stopPropagation()}
      style={{width:"100%", maxWidth:420, background:"var(--cream)", borderRadius:CARD_SHAPE, padding:"22px 24px 18px"}}>
      <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:20, fontWeight:400, letterSpacing:"-0.01em", color:"var(--ink)", marginBottom:6}}>Add to a list</div>
      <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:12, color:"var(--ink-soft)", marginBottom:18}}>{item?.product_name}</div>
      <div style={{display:"flex", flexDirection:"column", gap:8, marginBottom:14}}>
        {lists.map(l => (
          <button key={l.id} onClick={() => onPick(l, item)}
            style={{padding:"12px 14px", textAlign:"left", background:"var(--cream-light)", border:"1px solid var(--rule)", borderRadius:CARD_SHAPE, fontFamily:"'Lora', Georgia, serif", fontSize:15, fontWeight:500, color:"var(--ink)", cursor:"pointer"}}>
            {l.name}
          </button>
        ))}
      </div>
      <div style={{textAlign:"right"}}>
        <PillButton onClick={onCancel} kind="secondary">Cancel</PillButton>
      </div>
    </div>
  </div>
);

// ── Save-all naming sheet ────────────────────────────────────────
const SaveAllSheet = ({ defaultName, onCancel, onSave }) => {
  const [draft, setDraft] = useState(defaultName || "");
  const inputRef = useRef(null);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 0); }, []);
  const save = () => {
    const v = draft.trim();
    if (!v) return;
    onSave(v);
  };
  return (
    <div onClick={onCancel}
      style={{position:"fixed", inset:0, background:"rgba(26,31,21,0.40)", zIndex:140, display:"flex", alignItems:"center", justifyContent:"center", padding:24}}>
      <div onClick={e => e.stopPropagation()}
        style={{width:"100%", maxWidth:440, background:"var(--cream)", borderRadius:CARD_SHAPE, padding:"24px 24px 22px"}}>
        <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:20, fontWeight:400, letterSpacing:"-0.01em", color:"var(--ink)", marginBottom:6}}>Name your list</div>
        <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:12, color:"var(--ink-soft)", marginBottom:14}}>Saves all five items as a single shopping list.</div>
        <input ref={inputRef} value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") onCancel(); }}
          placeholder="e.g. Toddler restock"
          maxLength={100}
          style={{width:"100%", padding:"12px 14px", borderRadius:CARD_SHAPE, background:"var(--cream-light)", border:"1px solid var(--rule-strong)", outline:"none", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:15, color:"var(--ink)", marginBottom:18, boxSizing:"border-box"}}/>
        <div style={{display:"flex", gap:10, justifyContent:"flex-end"}}>
          <PillButton onClick={onCancel} kind="secondary">Cancel</PillButton>
          <PillButton onClick={save}>Save list</PillButton>
        </div>
      </div>
    </div>
  );
};

// ── Thinking state ───────────────────────────────────────────────
const THINKING_COPY = ["Reading labels...", "Scoring the options...", "Thinking..."];
const ThinkingState = () => {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % THINKING_COPY.length), 550);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{padding:"32px 0", textAlign:"center"}}>
      <span style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13, color:"var(--moss)", fontWeight:500, letterSpacing:"0.04em", animation:"partiqulePulse 1.4s ease-in-out infinite", display:"inline-block"}}>
        {THINKING_COPY[idx]}
      </span>
    </div>
  );
};

// ── No-match empty state ─────────────────────────────────────────
const NoMatch = ({ onPickExample }) => (
  <div style={{padding:"32px 0"}}>
    <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:20, fontWeight:400, letterSpacing:"-0.01em", color:"var(--ink)", marginBottom:8}}>
      Not enough to go on yet.
    </div>
    <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:14, color:"var(--ink-soft)", lineHeight:1.55, marginBottom:18}}>
      Try describing the product, the person, or the constraint.
    </div>
    <div style={{display:"flex", flexDirection:"column", gap:8}}>
      {EXAMPLE_QUERIES.map(eq => (
        <button key={eq} onClick={() => onPickExample(eq)}
          style={{textAlign:"left", padding:"11px 14px", background:"var(--cream-light)", border:"1px solid var(--rule)", borderRadius:CARD_SHAPE, fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13, color:"var(--ink)", cursor:"pointer"}}>
          {eq}
        </button>
      ))}
    </div>
  </div>
);

// ── Too-short message ───────────────────────────────────────────
const TooShort = () => (
  <div style={{padding:"24px 0"}}>
    <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:18, color:"var(--ink-soft)", letterSpacing:"-0.005em"}}>
      Tell us what you're shopping for.
    </div>
  </div>
);

// ── Response card ────────────────────────────────────────────────
const ResponseCard = ({ response, expandedItems, onToggleExpand, onAddToList, onSaveAll, isMobile }) => {
  const hasItems = response.items && response.items.length > 0;
  return (
    <div style={{paddingTop:24}}>
      <div style={{fontFamily:"'Lora', Georgia, serif", fontSize: isMobile ? 18 : 20, fontWeight:400, letterSpacing:"-0.005em", lineHeight:1.45, color:"var(--ink)", marginBottom:20, animation:"fadeUp 0.32s ease both"}}>
        {response.intent_restatement}
      </div>

      {hasItems ? (
        <>
          <div style={{borderTop:"1px solid var(--rule)"}}>
            {response.items.map(item => (
              <ResultItem key={item.id} item={item}
                isExpanded={!!expandedItems[item.id]}
                onToggleExpand={onToggleExpand}
                onAddToList={onAddToList}/>
            ))}
          </div>
          <div style={{marginTop:24, display:"flex", justifyContent:"flex-start"}}>
            <QuietButton onClick={onSaveAll} ariaLabel="Save all items as a new list">
              <SmallPlus size={10} color="var(--ink-soft)"/> Save all as a list
            </QuietButton>
          </div>
        </>
      ) : (
        <div style={{padding:"24px 0 8px", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:14, color:"var(--ink-soft)", lineHeight:1.55}}>
          {response.no_match_message || "Nothing scores well for this yet. Worth scanning options yourself."}
        </div>
      )}
    </div>
  );
};

// ── SSE stream parser ───────────────────────────────────────────
// EventSource doesn't support POST, so we use fetch + ReadableStream and
// parse the `event: <name>\ndata: <json>\n\n` framing by hand. Callbacks
// fire for each event; abort signal cancels the in-flight stream when
// the user submits again or unmounts.
async function streamAskResponse({ apiBase, authHeaders, query, signal, onEvent }) {
  const headers = { "Content-Type": "application/json", Accept: "text/event-stream" };
  try {
    const auth = await authHeaders?.();
    if (auth && typeof auth === "object") Object.assign(headers, auth);
  } catch {}

  const res = await fetch(`${apiBase}/ask`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
    signal,
  });
  if (!res.ok || !res.body) {
    onEvent("error", { error: "http", status: res.status, message: "Couldn't reach the Ask service." });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (!raw.trim()) continue;
      let event = "message";
      const dataLines = [];
      for (const line of raw.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      let payload = {};
      if (dataLines.length) {
        try { payload = JSON.parse(dataLines.join("\n")); } catch { payload = {}; }
      }
      onEvent(event, payload);
    }
  }
}

// ── Top-level page ──────────────────────────────────────────────
const AskPrototypePage = ({
  isMobile = false,
  safeTop = 0,
  apiBase,
  authHeaders,
  buyLinksFor,
}) => {
  const [query, setQuery] = useState("");
  // phase: "idle" | "thinking" | "answered" | "tooShort" | "nomatch" | "refused" | "error"
  const [phase, setPhase] = useState("idle");
  // responseType determines which render path renders: "product" → ProductList
  // (existing ResponseCard), "knowledge" → KnowledgeCard. Set from the first
  // post-intent event that carries content. Reset to null on each submit.
  const [responseType, setResponseType] = useState(null);
  const [response, setResponse] = useState(null);
  const [knowledgeResponse, setKnowledgeResponse] = useState(null);
  const [knowledgeMatches, setKnowledgeMatches] = useState([]);
  // R5b.3 v2 — context bundle response from backend/composer.js.
  // One "bundle" SSE event per request, no incremental items.
  const [bundleResponse, setBundleResponse] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  // R5a r2 — placeholder is a single random pick per page load. Lazy
  // useState initializer runs once on mount and never re-randomizes on
  // focus or input changes. Sara called the rotating version distracting.
  const [placeholderText] = useState(() => {
    const list = PLACEHOLDER_EXAMPLES;
    if (!list || !list.length) return "";
    return list[Math.floor(Math.random() * list.length)];
  });
  const [pickerItem, setPickerItem] = useState(null);
  const [savingAll, setSavingAll] = useState(false);
  // R5a r1 — expanded scoring details per item, keyed by item.id.
  // Reset on every new submit so a fresh response starts collapsed.
  const [expandedItems, setExpandedItems] = useState({});
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);
  const abortRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    if (abortRef.current) { try { abortRef.current.abort(); } catch {} }
  }, []);

  const showToast = (message) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(""), 2400);
  };

  // Decorate a streamed item with frontend-computed buy_links. Backend
  // intentionally sends buy_links: null to keep the partner tag in one
  // module; the frontend resolves them via the same helper used on the
  // scan-result CTAs and the list page. Works for type 1 items
  // (product_name field) and type 2 match events (name field) — both
  // route through the same chip set.
  const decorateItem = (raw) => {
    const next = { ...raw };
    if (!next.buy_links) {
      const nameForBuy = next.product_name || next.name || "";
      try { next.buy_links = buyLinksFor ? buyLinksFor(nameForBuy) : null; }
      catch { next.buy_links = null; }
    }
    return next;
  };

  const submit = async (overrideQuery) => {
    // The suggested-action handler calls submit(q) with a synthetic query
    // ("cleaner clothing" / "cleaner cookware"). Reading from the override
    // bypasses React batching on setQuery, so the SSE stream uses the new
    // query immediately even before the controlled textarea re-renders.
    const q = (typeof overrideQuery === "string" ? overrideQuery : query).trim();
    if (!q) return;
    if (q.length < 3) {
      setPhase("tooShort");
      setResponse(null);
      return;
    }
    if (abortRef.current) { try { abortRef.current.abort(); } catch {} }
    const controller = new AbortController();
    abortRef.current = controller;

    setPhase("thinking");
    setResponse(null);
    setResponseType(null);
    setKnowledgeResponse(null);
    setKnowledgeMatches([]);
    setBundleResponse(null);
    setErrorMessage("");
    setExpandedItems({});

    // Streaming state held in refs so the SSE callbacks see latest values
    // without React batching deferring them between events.
    const state = { intent: null, items: [], doneFired: false, responseType: null };
    const flush = (extra = {}) => {
      const sorted = [...state.items].sort((a, b) => {
        const sa = a.score == null ? 99 : a.score;
        const sb = b.score == null ? 99 : b.score;
        return sa - sb;
      });
      setResponse(prev => ({
        intent_restatement: state.intent?.restatement || prev?.intent_restatement || "",
        items: sorted,
        ...extra,
      }));
    };

    try {
      await streamAskResponse({
        apiBase,
        authHeaders,
        query: q,
        signal: controller.signal,
        onEvent: (event, payload) => {
          if (controller.signal.aborted) return;
          if (event === "thinking") return;
          if (event === "intent") {
            state.intent = payload;
            // Surface restatement immediately so the user sees the
            // rephrased question while items are still framing.
            flush();
            setPhase("answered");
            return;
          }
          if (event === "item") {
            // First content event after intent decides the render path.
            if (!state.responseType) {
              state.responseType = "product";
              setResponseType("product");
            }
            state.items.push(decorateItem(payload));
            flush();
            return;
          }
          if (event === "knowledge") {
            state.responseType = "knowledge";
            setResponseType("knowledge");
            setKnowledgeResponse(payload);
            setPhase("answered");
            return;
          }
          if (event === "match") {
            // Knowledge matches arrive after the knowledge event. Decorate
            // with buy_links the same way type 1 items do — the partner
            // tag lives in the frontend helper so the backend stays clean.
            setKnowledgeMatches(prev => [...prev, decorateItem(payload)]);
            return;
          }
          if (event === "intent_classified") {
            // R5b.3 v2 context bundles emit this immediately after intent
            // so the surface can route to ContextBundleCard early without
            // waiting for the composer (4-8s) to finish.
            if (payload?.type === "context") {
              state.responseType = "context";
              setResponseType("context");
              setPhase("answered");
            }
            return;
          }
          if (event === "composer_thinking") {
            // Optional progress signal from the composer wrapper. The
            // standard thinking state covers this; no UI change.
            return;
          }
          if (event === "bundle") {
            // Context bundle payload from backend/composer.js. Single
            // event — no incremental items. Render through ContextBundleCard.
            state.responseType = "context";
            setResponseType("context");
            setBundleResponse(payload);
            setPhase("answered");
            return;
          }
          if (event === "done") {
            state.doneFired = true;
            if (state.responseType === "knowledge" || state.responseType === "context") {
              // Knowledge / bundle already rendered; done is just terminal.
              setPhase("answered");
              return;
            }
            if (payload?.no_results) {
              setResponse({
                intent_restatement: state.intent?.restatement || "",
                items: [],
                no_match_message: payload.no_results_message || null,
              });
              setPhase("answered");
            } else {
              flush();
              setPhase("answered");
            }
            return;
          }
          if (event === "refuse") {
            setErrorMessage(payload?.message || "Try asking for a specific product instead.");
            setPhase("refused");
            return;
          }
          if (event === "error") {
            setErrorMessage(payload?.message || "Something went wrong. Try again.");
            setPhase("error");
            return;
          }
        },
      });
    } catch (e) {
      if (e?.name === "AbortError") return;
      setErrorMessage("Couldn't reach the Ask service.");
      setPhase("error");
    }
  };

  const toggleExpand = (id) => setExpandedItems(s => ({ ...s, [id]: !s[id] }));

  const autoGrow = (e) => {
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 220)}px`;
  };

  const onAddToList = (item) => setPickerItem(item);
  const onPickList = (list, item) => {
    setPickerItem(null);
    showToast(`Added ${item.product_name} to ${list.name}.`);
  };
  const onSaveAll = () => setSavingAll(true);
  const onSaveAllConfirm = (name) => {
    setSavingAll(false);
    showToast(`Saved as "${name}".`);
  };

  return (
    <div style={{
      minHeight:"100vh",
      background:"var(--cream)",
      paddingTop: (isMobile ? 60 : 72) + safeTop + 28,
      paddingBottom: isMobile ? 120 : 60,
    }}>
      <div style={{maxWidth:720, margin:"0 auto", padding:`0 ${isMobile ? "20px" : "40px"}`}}>
        <SectionStamp label="Ask"/>
        <h1 style={{fontFamily:"'Lora', Georgia, serif", fontSize: isMobile ? 32 : 40, fontWeight:400, letterSpacing:"-0.02em", color:"var(--ink)", margin:"0 0 6px"}}>
          Ask <span style={{color:"var(--moss)"}}>Partiqule</span>
          <PrototypePill/>
        </h1>
        <p style={{fontFamily:"'Lora', Georgia, serif", fontSize: isMobile ? 16 : 18, color:"var(--ink-soft)", margin:"0 0 26px", lineHeight:1.45}}>
          Tell us what you need. We'll score the options.
        </p>

        <div style={{display:"flex", flexDirection:"column", gap:12, marginBottom:8}}>
          <textarea
            ref={textareaRef}
            value={query}
            onChange={e => { setQuery(e.target.value); autoGrow(e); }}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            placeholder={placeholderText}
            style={{
              width:"100%",
              minHeight:60,
              maxHeight:220,
              padding:"14px 16px",
              borderRadius:CARD_SHAPE,
              background:"var(--cream-light)",
              border:"1px solid var(--rule-strong)",
              outline:"none",
              fontFamily:"'DM Sans', system-ui, sans-serif",
              fontSize:16,
              lineHeight:1.5,
              color:"var(--ink)",
              resize:"none",
              boxSizing:"border-box",
              transition:"border-color 0.2s ease",
            }}
          />
          <div>
            <PillButton onClick={submit} disabled={query.trim().length === 0 || phase === "thinking"}>
              {phase === "thinking" ? "Asking..." : "Ask"}
            </PillButton>
          </div>
        </div>

        {phase === "thinking" && <ThinkingState/>}
        {phase === "tooShort" && <TooShort/>}
        {phase === "nomatch" && (
          <NoMatch onPickExample={(eq) => {
            setQuery(eq);
            setPhase("idle");
            setResponse(null);
            setTimeout(() => textareaRef.current?.focus(), 0);
          }}/>
        )}
        {(phase === "refused" || phase === "error") && (
          <div style={{padding:"24px 0"}}>
            <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:18, fontWeight:400, letterSpacing:"-0.005em", color:"var(--ink)", marginBottom:14, lineHeight:1.45}}>
              {errorMessage}
            </div>
            <NoMatch onPickExample={(eq) => {
              setQuery(eq);
              setPhase("idle");
              setResponse(null);
              setErrorMessage("");
              setTimeout(() => textareaRef.current?.focus(), 0);
            }}/>
          </div>
        )}
        {phase === "answered" && responseType === "context" && bundleResponse && (
          <ContextBundleCard
            bundle={bundleResponse}
            isMobile={isMobile}
            buyLinksFor={buyLinksFor}
            onSuggestedAction={(action) => {
              if (!action) return;
              // save_list → prompt user to name the bundle and save.
              if (action.type === "save_list") {
                setSavingAll(true);
                return;
              }
              // scan_more → focus the input so the user can ask the
              // next question. The real scan affordance lives outside
              // this prototype.
              if (action.type === "scan_more") {
                setTimeout(() => textareaRef.current?.focus(), 0);
                return;
              }
              // learn_more → no-op for now.
            }}
            onScanCta={() => {
              // Worth-scanning section CTA. Mirror the scan_more
              // behavior until R5c wires real scan routing.
              setTimeout(() => textareaRef.current?.focus(), 0);
            }}
          />
        )}
        {phase === "answered" && responseType === "knowledge" && knowledgeResponse && (
          <KnowledgeCard
            knowledge={knowledgeResponse}
            matches={knowledgeMatches}
            isMobile={isMobile}
            onSuggestedAction={(action) => {
              if (!action) return;
              const kind = action.kind;
              // see_options → submit a new Ask query through the existing
              // flow. For category-specific actions, the friendly display
              // name is already encoded in the label as "See cleaner
              // <friendly>" — pull it back out rather than re-deriving
              // friendly names from the slug on this side.
              if (kind === "see_options") {
                let nextQuery;
                if (action.category) {
                  const m = String(action.label || "").match(/^See cleaner (.+)$/i);
                  const friendly = m ? m[1].trim() : action.category;
                  nextQuery = `cleaner ${friendly}`;
                } else {
                  nextQuery = "cleaner alternatives";
                }
                setQuery(nextQuery);
                submit(nextQuery);
                return;
              }
              // scan_more → focus the Ask input so the user can pick the
              // next question. The proper home-page scan affordance lives
              // outside this prototype surface; routing into it is R5c.
              if (kind === "scan_more") {
                setTimeout(() => textareaRef.current?.focus(), 0);
                return;
              }
              // learn_more → no-op for now. Future: expand sources in
              // place or route to a glossary view.
            }}
          />
        )}
        {phase === "answered" && responseType !== "knowledge" && responseType !== "context" && response && (
          <ResponseCard
            response={response}
            expandedItems={expandedItems}
            onToggleExpand={toggleExpand}
            onAddToList={onAddToList}
            onSaveAll={onSaveAll}
            isMobile={isMobile}
          />
        )}
      </div>

      {pickerItem && (
        <AddToListPicker
          item={pickerItem}
          lists={FAKE_LIST_NAMES}
          onCancel={() => setPickerItem(null)}
          onPick={onPickList}
        />
      )}
      {savingAll && (
        <SaveAllSheet
          defaultName=""
          onCancel={() => setSavingAll(false)}
          onSave={onSaveAllConfirm}
        />
      )}
      <Toast message={toast}/>
    </div>
  );
};

export default AskPrototypePage;
