// R5b.2 Ask mode — KnowledgeCard render path.
//
// Used when a type 2 (knowledge) response streams back from /ask.
// Renders the framed explanation, regulatory/health context lines,
// the user's home connection (when authenticated and matches exist),
// citation chips for sources, and a suggested action button.
//
// Streaming contract: parent receives "knowledge" (one event) plus
// zero-or-more "match" events from backend/ask.js. Parent passes the
// last knowledge payload as `knowledge` and the accumulated matches
// as `matches`.

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

// Shared SectionStamp pattern from AskPrototypePage.
const SectionStamp = ({ label, color = "var(--moss)" }) => (
  <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:10}}>
    <span style={{display:"inline-block", width:22, height:1, background:color, opacity:0.7}}/>
    <span style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:10, letterSpacing:"0.22em", textTransform:"uppercase", fontWeight:500, color}}>{label}</span>
  </div>
);

// Compact product avatar mirroring ProductImage in AskPrototypePage.
// Small inline copy keeps KnowledgeCard self-contained.
const MatchAvatar = ({ url, name, score, size = 38 }) => {
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
      borderRadius:TILE_SHAPE, background:bg, color:"var(--ivory)",
      display:"flex", alignItems:"center", justifyContent:"center",
      fontFamily:"'Lora', Georgia, serif",
      fontSize: Math.round(size * 0.46), fontWeight:500, letterSpacing:"-0.02em",
    }}>{initial}</div>
  );
};

const ScoreDot = ({ score }) => {
  if (score == null) return null;
  return (
    <span style={{display:"inline-flex", alignItems:"center", gap:5, padding:"2px 8px", borderRadius:999, background:scoreBg(score), border:`1px solid ${scoreColor(score)}`, fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:11, fontWeight:600, color:scoreColor(score)}}>
      <span style={{width:5, height:5, borderRadius:"50%", background:scoreColor(score)}}/>
      {score}
    </span>
  );
};

const HomeConnection = ({ message, matches, matchedTotal }) => {
  if (!message && (!matches || matches.length === 0)) return null;
  const shown = matches?.length || 0;
  const total = typeof matchedTotal === "number" && matchedTotal > 0 ? matchedTotal : shown;
  const hasOverflow = total > shown;
  return (
    <div style={{
      marginTop: 22,
      padding: "16px 18px",
      background: "var(--cream-light)",
      border: "1px solid var(--rule)",
      borderRadius: CARD_SHAPE,
    }}>
      <SectionStamp label="In your home"/>
      {message && (
        <div style={{
          fontFamily:"'Lora', Georgia, serif",
          fontSize: 17, fontWeight: 400,
          color: "var(--ink)", letterSpacing:"-0.005em",
          lineHeight: 1.4, marginBottom: matches?.length ? 14 : 0,
        }}>{message}</div>
      )}
      {matches?.length > 0 && (
        <div style={{
          display: "flex", flexDirection: "column", gap: 12,
        }}>
          {matches.map(m => (
            <div key={m.id} style={{
              display: "flex", alignItems: "center", gap: 14,
              padding: "12px 14px",
              background: "var(--cream)",
              border: "1px solid var(--rule)",
              borderRadius: TILE_SHAPE,
            }}>
              <MatchAvatar url={m.product_image_url} name={m.name} score={m.score} size={40}/>
              <div style={{
                flex: 1, minWidth: 0,
                fontFamily:"'DM Sans', system-ui, sans-serif",
                fontSize: 14, fontWeight: 500,
                color: "var(--ink)", lineHeight: 1.35,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>{m.name}</div>
              <div style={{flexShrink: 0}}>
                <ScoreDot score={m.score}/>
              </div>
            </div>
          ))}
        </div>
      )}
      {hasOverflow && (
        <div style={{
          marginTop: 12,
          fontFamily: "'DM Sans', system-ui, sans-serif",
          fontSize: 13,
          color: "var(--ink-soft)",
          lineHeight: 1.45,
        }}>
          Showing {shown} of {total} — more in your scan history.
        </div>
      )}
    </div>
  );
};

const SourceChips = ({ sources }) => {
  if (!sources || !sources.length) return null;
  return (
    <div style={{marginTop: 22}}>
      <SectionStamp label="Sources"/>
      <div style={{display:"flex", flexWrap:"wrap", gap: 8}}>
        {sources.map((s, i) => {
          const label = s.name || (s.url ? new URL(s.url).hostname : "Source");
          const inner = (
            <>
              {label}
              {s.date && (
                <span style={{color:"var(--ink-faint)", marginLeft:6, fontSize:11}}>{s.date}</span>
              )}
              {s.url && <span style={{color:"var(--moss)", marginLeft:6}}>→</span>}
            </>
          );
          if (s.url) {
            return (
              <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" style={{
                display:"inline-flex", alignItems:"center",
                padding:"6px 12px",
                background:"var(--cream-light)",
                border:"1px solid var(--rule)",
                borderRadius: 999,
                fontFamily:"'DM Sans', system-ui, sans-serif",
                fontSize: 12, color:"var(--ink-soft)",
                textDecoration:"none",
              }}>{inner}</a>
            );
          }
          return (
            <span key={i} style={{
              display:"inline-flex", alignItems:"center",
              padding:"6px 12px",
              background:"var(--cream-light)",
              border:"1px solid var(--rule)",
              borderRadius: 999,
              fontFamily:"'DM Sans', system-ui, sans-serif",
              fontSize: 12, color:"var(--ink-soft)",
            }}>{inner}</span>
          );
        })}
      </div>
    </div>
  );
};

const SuggestedActionButton = ({ action, onClick }) => {
  if (!action) return null;
  return (
    <div style={{marginTop: 22}}>
      <button
        onClick={() => onClick?.(action)}
        style={{
          display:"inline-flex", alignItems:"center", justifyContent:"center", gap: 8,
          padding:"12px 22px",
          borderRadius: CTA_SHAPE,
          background:"var(--moss)",
          color:"var(--ivory)",
          border:"none",
          fontFamily:"'DM Sans', system-ui, sans-serif",
          fontSize: 14, fontWeight: 500, letterSpacing:"0.005em",
          cursor:"pointer",
        }}
      >
        {action.label}
      </button>
    </div>
  );
};

const KnowledgeCard = ({ knowledge, matches = [], isMobile = false, onSuggestedAction }) => {
  if (!knowledge) return null;
  const homeMatches = Array.isArray(matches) ? matches.slice(0, 5) : [];
  return (
    <div style={{paddingTop: 24, animation:"fadeUp 0.32s ease both"}}>
      <SectionStamp label={knowledge.category || "Knowledge"}/>
      <h2 style={{
        fontFamily:"'Lora', Georgia, serif",
        fontSize: isMobile ? 26 : 32,
        fontWeight: 400, letterSpacing:"-0.02em",
        color:"var(--ink)", margin:"0 0 14px",
        lineHeight: 1.2,
      }}>{knowledge.subject}</h2>

      <p style={{
        fontFamily:"'Lora', Georgia, serif",
        fontSize: isMobile ? 17 : 18,
        fontWeight: 400, letterSpacing:"-0.005em",
        color:"var(--ink)", lineHeight: 1.55,
        margin: "0 0 20px",
      }}>{knowledge.explanation}</p>

      {Array.isArray(knowledge.context_lines) && knowledge.context_lines.length > 0 && (
        <div style={{
          padding:"16px 18px",
          background:"var(--cream-light)",
          border:"1px solid var(--rule)",
          borderRadius: CARD_SHAPE,
        }}>
          <SectionStamp label="Health and safety"/>
          <div style={{display:"flex", flexDirection:"column", gap: 10}}>
            {knowledge.context_lines.map((line, i) => (
              <div key={i} style={{
                fontFamily:"'DM Sans', system-ui, sans-serif",
                fontSize: 14, lineHeight: 1.55,
                color:"var(--ink-soft)",
              }}>{line}</div>
            ))}
          </div>
        </div>
      )}

      <HomeConnection
        message={knowledge.home_connection}
        matches={homeMatches}
        matchedTotal={knowledge.matched_total}
      />

      <SourceChips sources={knowledge.sources}/>

      <SuggestedActionButton action={knowledge.suggested_action} onClick={onSuggestedAction}/>
    </div>
  );
};

export default KnowledgeCard;
