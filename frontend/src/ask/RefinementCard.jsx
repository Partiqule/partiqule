// R5b.3 Phase 2a session 5 — RefinementCard render path.
//
// Renders the refinement questions emitted by backend/refinement.js
// when Pass 1 flags a query as ambiguous. The user picks an option per
// question, optionally types a free-text answer, or skips. Submit
// aggregates answers + skipped list and calls the parent (which
// forwards to useAskConversation.submitRefinementAnswers).
//
// Question shape from backend/refinement.js:validateQuestionShape:
//   { id, text, suggested_options: [string], allow_text, moat_aligned }
//
// Voice gates apply to all rendered text:
// - No em-dashes, en-dashes, or word-internal hyphens
// - No first-person about Partiqule itself; second-person to the user is fine
// - No marketing comparatives
// - Three-beat copy where it fits naturally

import React, { useState } from "react";

const CARD_SHAPE  = "14px 10px 15px 12px / 10px 15px 12px 14px";
const CTA_SHAPE   = "22px 18px 24px 20px / 20px 24px 18px 22px";
const OPTION_SHAPE = "12px 16px 14px 18px / 16px 12px 18px 14px";

const SectionStamp = ({ label, color = "var(--moss)" }) => (
  <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:12}}>
    <span style={{display:"inline-block", width:22, height:1, background:color, opacity:0.7}}/>
    <span style={{
      fontFamily:"'DM Sans', system-ui, sans-serif",
      fontSize:10, letterSpacing:"0.22em", textTransform:"uppercase",
      fontWeight:500, color,
    }}>{label}</span>
  </div>
);

// Single option chip. Selected state lifts to moss fill + ivory text;
// unselected is cream-light with rule border. Tap-target padding is
// generous so the chips work on a 390px viewport.
const OptionButton = ({ label, selected, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={selected}
    style={{
      display:"inline-flex", alignItems:"center", justifyContent:"center",
      padding:"10px 16px",
      minHeight:42,
      borderRadius: OPTION_SHAPE,
      background: selected ? "var(--moss)" : "var(--cream-light)",
      color:      selected ? "var(--ivory)" : "var(--ink)",
      border: selected ? "1px solid var(--moss)" : "1px solid var(--rule)",
      fontFamily:"'DM Sans', system-ui, sans-serif",
      fontSize: 14, fontWeight: 500, letterSpacing:"0.005em",
      cursor:"pointer",
      transition:"background 0.18s ease, color 0.18s ease, border-color 0.18s ease",
    }}>
    {label}
  </button>
);

const SkipQuestionButton = ({ skipped, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={skipped}
    style={{
      display:"inline-flex", alignItems:"center", gap:6,
      padding:"6px 12px",
      background:"transparent",
      border:"none",
      fontFamily:"'DM Sans', system-ui, sans-serif",
      fontSize: 12, fontWeight: 500,
      color: skipped ? "var(--moss)" : "var(--ink-faint)",
      cursor:"pointer",
      letterSpacing:"0.01em",
    }}>
    {skipped ? "Skipped" : "Skip this one"}
  </button>
);

const SubmitButton = ({ onClick, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    style={{
      display:"inline-flex", alignItems:"center", justifyContent:"center", gap:8,
      padding:"12px 22px",
      borderRadius: CTA_SHAPE,
      background:"var(--moss)", color:"var(--ivory)",
      border:"none",
      fontFamily:"'DM Sans', system-ui, sans-serif",
      fontSize: 14, fontWeight: 500, letterSpacing:"0.005em",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
    }}>
    Show the bundle
  </button>
);

const SkipAllButton = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      display:"inline-flex", alignItems:"center", justifyContent:"center",
      padding:"12px 18px",
      background:"transparent",
      border:"1px solid var(--rule-strong)",
      borderRadius: CTA_SHAPE,
      fontFamily:"'DM Sans', system-ui, sans-serif",
      fontSize: 14, fontWeight: 500, color:"var(--ink)",
      cursor:"pointer", letterSpacing:"0.005em",
    }}>
    Skip all
  </button>
);

// One question block: text + options + optional free-text input + skip
// toggle. Per-question state lives in the parent so submit can aggregate.
const QuestionBlock = ({ question, answer, onChange, isMobile, isLast }) => {
  const selectedOption = answer?.option ?? null;
  const textValue      = answer?.text ?? "";
  const skipped        = answer?.skipped === true;

  const pickOption = (opt) => {
    if (skipped) return;
    onChange({ option: selectedOption === opt ? null : opt, text: textValue, skipped: false });
  };
  const updateText = (e) => {
    if (skipped) return;
    onChange({ option: selectedOption, text: e.target.value, skipped: false });
  };
  const toggleSkip = () => {
    onChange({ option: null, text: "", skipped: !skipped });
  };

  return (
    <div style={{
      paddingBottom: isLast ? 0 : 20,
      marginBottom: isLast ? 0 : 20,
      borderBottom: isLast ? "none" : "1px solid var(--rule-soft)",
      opacity: skipped ? 0.55 : 1,
      transition:"opacity 0.18s ease",
    }}>
      <div style={{
        fontFamily:"'Lora', Georgia, serif",
        fontSize: isMobile ? 17 : 18,
        fontWeight: 500, letterSpacing:"-0.005em",
        color:"var(--ink)", lineHeight: 1.4,
        marginBottom: 12,
      }}>
        {question.text}
      </div>

      <div style={{display:"flex", flexWrap:"wrap", gap:8, marginBottom: question.allow_text ? 12 : 8}}>
        {(question.suggested_options || []).map((opt) => (
          <OptionButton
            key={opt}
            label={opt}
            selected={!skipped && selectedOption === opt}
            onClick={() => pickOption(opt)}
          />
        ))}
      </div>

      {question.allow_text && (
        <input
          type="text"
          value={textValue}
          onChange={updateText}
          disabled={skipped}
          placeholder="Or type something specific"
          maxLength={200}
          style={{
            width:"100%",
            padding:"10px 14px",
            borderRadius: CARD_SHAPE,
            background:"var(--cream-light)",
            border:"1px solid var(--rule)",
            outline:"none",
            fontFamily:"'DM Sans', system-ui, sans-serif",
            fontSize: 14, color:"var(--ink)",
            boxSizing:"border-box",
            marginBottom: 8,
          }}
        />
      )}

      <div style={{marginTop: 2}}>
        <SkipQuestionButton skipped={skipped} onClick={toggleSkip}/>
      </div>
    </div>
  );
};

// Aggregate per-question state into the wire shape expected by the
// /ask/refinement_answer endpoint. Free text wins over a selected
// option when both are present (the user's typed words are higher
// signal than a tappable). Empty + not-skipped questions silently
// drop out — the backend treats them as unanswered.
function buildSubmitPayload(questions, answers) {
  const out = { answers: [], skipped: [] };
  for (const q of questions) {
    const a = answers[q.id] || {};
    if (a.skipped) {
      out.skipped.push(q.id);
      continue;
    }
    const typed = (a.text || "").trim();
    const value = typed || a.option || null;
    if (value) out.answers.push({ question_id: q.id, value });
  }
  return out;
}

const RefinementCard = ({
  questions = [],
  intentRestatement = null,
  onSubmit,
  isMobile = false,
}) => {
  const [answers, setAnswers] = useState({});

  if (!Array.isArray(questions) || questions.length === 0) return null;

  const onChange = (qid) => (next) => {
    setAnswers((prev) => ({ ...prev, [qid]: next }));
  };

  const submit = () => {
    const payload = buildSubmitPayload(questions, answers);
    onSubmit && onSubmit(payload);
  };

  const skipAll = () => {
    onSubmit && onSubmit({ answers: [], skipped: questions.map(q => q.id) });
  };

  return (
    <div style={{paddingTop: 24, animation:"fadeUp 0.32s ease both"}}>
      <SectionStamp label="A couple of quick questions" color="var(--moss)"/>

      {intentRestatement && (
        <h2 style={{
          fontFamily:"'Lora', Georgia, serif",
          fontSize: isMobile ? 22 : 26,
          fontWeight: 400, letterSpacing:"-0.02em",
          color:"var(--ink)", margin:"0 0 18px",
          lineHeight: 1.3,
        }}>{intentRestatement}</h2>
      )}

      <div style={{marginBottom: 24}}>
        {questions.map((q, idx) => (
          <QuestionBlock
            key={q.id}
            question={q}
            answer={answers[q.id]}
            onChange={onChange(q.id)}
            isMobile={isMobile}
            isLast={idx === questions.length - 1}
          />
        ))}
      </div>

      <div style={{display:"flex", flexWrap:"wrap", gap:10, alignItems:"center"}}>
        <SubmitButton onClick={submit} disabled={false}/>
        <SkipAllButton onClick={skipAll}/>
      </div>
    </div>
  );
};

export default RefinementCard;
export { buildSubmitPayload };
