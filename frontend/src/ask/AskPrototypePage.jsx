// R5a Ask prototype.
//
// /ask-prototype is reachable by direct URL only — no nav entry. Sara
// bookmarks it for review. All responses come from fixtures.js; no real
// /analyze call, no scan persistence, no list mutation. The point of
// this round is to lock the response format, choreography, and copy
// before R5b builds the real backend.

import React, { useState, useEffect, useRef } from "react";
import { findResponse, PLACEHOLDER_EXAMPLES, FAKE_LIST_NAMES, EXAMPLE_QUERIES } from "./fixtures";

// ── Design tokens (token-only, no inline hex) ─────────────────────
const CARD_SHAPE = "14px 10px 15px 12px / 10px 15px 12px 14px";
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

// ── Icons ────────────────────────────────────────────────────────
const X = ({ size = 14, color = "var(--ink-faint)" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
    <line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/>
  </svg>
);

const Plus = ({ size = 14, color = "var(--ivory)" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
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

// ── Result item row ──────────────────────────────────────────────
const ResultItem = ({ item, onAddToList }) => (
  <div style={{padding:"18px 0", borderBottom:"1px solid var(--rule-soft)"}}>
    <div style={{display:"flex", alignItems:"flex-start", gap:14}}>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:17, fontWeight:500, color:"var(--ink)", letterSpacing:"-0.005em", lineHeight:1.3, marginBottom:8}}>
          {item.product_name}
        </div>
        <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13, color:"var(--ink-soft)", lineHeight:1.55, marginBottom:12}}>
          {item.why}
        </div>
        <button onClick={() => onAddToList(item)}
          style={{display:"inline-flex", alignItems:"center", gap:6, padding:"6px 12px", background:"var(--cream-light)", border:"1px solid var(--rule-strong)", borderRadius:999, fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:12, fontWeight:600, color:"var(--moss-deep)", letterSpacing:"0.04em", cursor:"pointer"}}>
          <SmallPlus size={11} color="var(--moss-deep)"/> Add to list
        </button>
      </div>
      <div style={{flexShrink:0}}>
        <ScoreChip score={item.score}/>
      </div>
    </div>
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
const ResponseCard = ({ response, onAddToList, onSaveAll, isMobile }) => {
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
              <ResultItem key={item.id} item={item} onAddToList={onAddToList}/>
            ))}
          </div>
          <div style={{marginTop:24, display:"flex", justifyContent:"flex-start"}}>
            <PillButton onClick={onSaveAll}>
              <Plus/> Save all as a list
            </PillButton>
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

// ── Top-level page ──────────────────────────────────────────────
const AskPrototypePage = ({ isMobile = false, safeTop = 0 }) => {
  const [query, setQuery] = useState("");
  // phase: "idle" | "thinking" | "answered" | "tooShort" | "nomatch"
  const [phase, setPhase] = useState("idle");
  const [response, setResponse] = useState(null);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [pickerItem, setPickerItem] = useState(null);
  const [savingAll, setSavingAll] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);
  const submitTimer = useRef(null);
  const textareaRef = useRef(null);

  // Rotate placeholder while the input is empty.
  useEffect(() => {
    if (query.trim().length > 0) return;
    const t = setInterval(() => {
      setPlaceholderIdx(i => (i + 1) % PLACEHOLDER_EXAMPLES.length);
    }, 3200);
    return () => clearInterval(t);
  }, [query]);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    if (submitTimer.current) clearTimeout(submitTimer.current);
  }, []);

  const showToast = (message) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(""), 2400);
  };

  const submit = () => {
    const q = query.trim();
    if (!q) return;
    if (q.length < 3) {
      setPhase("tooShort");
      setResponse(null);
      return;
    }
    setPhase("thinking");
    setResponse(null);
    if (submitTimer.current) clearTimeout(submitTimer.current);
    submitTimer.current = setTimeout(() => {
      const fixture = findResponse(q);
      if (fixture) {
        setResponse(fixture);
        setPhase("answered");
      } else {
        setResponse(null);
        setPhase("nomatch");
      }
    }, 1700);
  };

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
            placeholder={PLACEHOLDER_EXAMPLES[placeholderIdx]}
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
        {phase === "answered" && response && (
          <ResponseCard
            response={response}
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
