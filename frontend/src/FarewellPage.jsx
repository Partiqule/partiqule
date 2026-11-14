import { useEffect } from "react";
import { CONTACT_EMAIL, FAREWELL_HEADLINE, FAREWELL_PARAGRAPHS } from "./sunset.js";

// Shown in place of the app while SUNSET_MODE is on. No links to pricing,
// sign up, login, or the paywall. A new iOS build loads this same bundle.
export default function FarewellPage() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Partiqule";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <main style={styles.page}>
      <style>{`
        html, body, #root {
          margin: 0;
          min-height: 100%;
          background: var(--cream);
        }
        @keyframes farewell-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .farewell-letter { animation: none !important; }
        }
        .farewell-link:focus-visible {
          outline: 2px solid var(--moss);
          outline-offset: 3px;
        }
      `}</style>
      <div aria-hidden="true" style={styles.light} />
      <div aria-hidden="true" style={styles.grain} />
      <article className="farewell-letter" style={styles.letter}>
        <img
          src="/partiqule-wordmark.svg"
          alt="Partiqule"
          style={styles.mark}
        />
        <h1 style={styles.headline}>{FAREWELL_HEADLINE}</h1>
        {FAREWELL_PARAGRAPHS.map((paragraph) => (
          <p key={paragraph} style={styles.body}>{paragraph}</p>
        ))}
        <p style={styles.body}>
          If you have a question, write to{" "}
          <a className="farewell-link" href={`mailto:${CONTACT_EMAIL}`} style={styles.link}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </article>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100dvh",
    background: "var(--cream)",
    color: "var(--ink)",
    position: "relative",
    overflow: "hidden",
  },
  light: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 280,
    pointerEvents: "none",
    background: "linear-gradient(to bottom, rgba(255, 230, 180, 0.35) 0%, rgba(255, 220, 170, 0.18) 35%, rgba(245, 220, 180, 0.08) 70%, transparent 100%)",
  },
  grain: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    opacity: 0.45,
    mixBlendMode: "multiply",
    backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.95' numOctaves='5' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.08, 0 0 0 0 0.1, 0 0 0 0 0.06, 0 0 0 0.07 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
  },
  letter: {
    position: "relative",
    zIndex: 1,
    maxWidth: 560,
    margin: "0 auto",
    paddingTop: "calc(env(safe-area-inset-top, 0px) + clamp(72px, 14vh, 140px))",
    paddingRight: 24,
    paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 64px)",
    paddingLeft: 24,
    animation: "farewell-in 0.55s cubic-bezier(0.2, 0, 0, 1) both",
  },
  mark: {
    display: "block",
    width: "min(220px, 68vw)",
    height: "auto",
    marginBottom: 40,
  },
  headline: {
    fontFamily: "var(--serif)",
    fontWeight: 500,
    fontSize: "clamp(32px, 5vw, 40px)",
    lineHeight: 1.2,
    letterSpacing: "-0.02em",
    margin: "0 0 28px",
    color: "var(--ink)",
  },
  body: {
    fontFamily: "var(--sans)",
    fontWeight: 400,
    fontSize: 17,
    lineHeight: 1.65,
    color: "var(--ink-soft)",
    margin: "0 0 16px",
    maxWidth: "36em",
  },
  link: {
    color: "var(--moss)",
    fontWeight: 500,
    textDecorationThickness: "1px",
    textUnderlineOffset: "3px",
  },
};
