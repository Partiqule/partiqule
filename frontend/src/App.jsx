import { useState, useEffect, useRef } from "react";

const API_BASE = "https://partiqule-production.up.railway.app";

const scoreLabel   = (s) => s<=2?"Minimal":s<=4?"Low":s<=6?"Moderate":s<=8?"High":"Very High";
const scoreColor   = (s) => s<=2?"#16a34a":s<=4?"#65a30d":s<=6?"#ca8a04":s<=8?"#ea580c":"#dc2626";
const scoreBg      = (s) => s<=2?"#f0fdf4":s<=4?"#f7fee7":s<=6?"#fefce8":s<=8?"#fff7ed":"#fef2f2";
const scoreCardBg  = (s) => s<=2?"#f0fdf4":s<=4?"#f7fee7":s<=6?"#fefce8":s<=8?"#fff7ed":"#fff0f0";

const categoryMeta = {
  clothing:      {label:"Clothing",      color:"#6366f1",bg:"#eef2ff"},
  food_beverage: {label:"Food & Drink",  color:"#0891b2",bg:"#ecfeff"},
  personal_care: {label:"Personal Care", color:"#db2777",bg:"#fdf2f8"},
  kitchen:       {label:"Kitchen",       color:"#d97706",bg:"#fffbeb"},
  baby:          {label:"Baby & Kids",   color:"#7c3aed",bg:"#f5f3ff"},
  other:         {label:"General",       color:"#6b7280",bg:"#f9fafb"},
};

// ── URL SLUG HELPERS ──────────────────────────────────────────
function toSlug(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
}
function getShareUrl(productName) {
  return `${window.location.origin}/scan/${toSlug(productName)}`;
}

const EXAMPLES = [
  {label:"Lipton tea bags",        hint:"plastic mesh!"},
  {label:"Styrofoam coffee cup",   hint:"high danger!"},
  {label:"Glad Press'n Seal wrap", hint:"pure plastic"},
];

const MOST_SEARCHED = [
  {label:"Lipton tea bags",        score:7, category:"food_beverage"},
  {label:"Non-stick frying pan",   score:8, category:"kitchen"},
  {label:"Plastic water bottle",   score:8, category:"food_beverage"},
  {label:"Synthetic fleece jacket",score:7, category:"clothing"},
  {label:"Baby formula bottle",    score:6, category:"baby"},
  {label:"Liquid foundation",      score:6, category:"personal_care"},
  {label:"Glass water bottle",     score:1, category:"food_beverage"},
  {label:"Organic cotton t-shirt", score:2, category:"clothing"},
];

// Source citations by category
const SOURCES = {
  clothing:      [{title:"Microfiber Pollution & the Apparel Industry", url:"https://www.patagonia.com/stories/an-update-on-microfiber-pollution/story-18783.html",journal:"Patagonia Research"},{title:"Synthetic Textile Microfiber Release Study",url:"https://www.nature.com/articles/s41598-019-43023-x",journal:"Nature Scientific Reports"},{title:"Microplastics in Freshwater Systems",url:"https://www.sciencedirect.com/science/article/pii/S0043135416307533",journal:"Water Research"}],
  food_beverage: [{title:"Microplastics in Bottled Water",url:"https://www.who.int/news/item/22-08-2019-who-calls-for-further-research-into-microplastics",journal:"WHO Report 2019"},{title:"Plastic Tea Bag Microparticle Release",url:"https://pubs.acs.org/doi/10.1021/acs.est.9b02540",journal:"Environmental Science & Technology"},{title:"Microplastics in Tap & Bottled Water",url:"https://orbmedia.org/stories/plus-plastic",journal:"Orb Media Study"}],
  personal_care: [{title:"Microbeads in Personal Care Products",url:"https://www.beatthemicrobead.org/science/",journal:"Beat the Microbead"},{title:"Plastic Packaging Leaching Study",url:"https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5920378/",journal:"NIH Environmental Health"},{title:"Cosmetic Microplastic Regulations",url:"https://ec.europa.eu/environment/chemicals/reach/microplastics_en.htm",journal:"European Commission"}],
  kitchen:       [{title:"PTFE Non-stick Coating Health Research",url:"https://www.ewg.org/research/pfas-forever-chemicals-widespread-present-blood-97-percent-americans",journal:"Environmental Working Group"},{title:"Plastic Food Container Leaching",url:"https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3222987/",journal:"NIH: Endocrine Disruption"},{title:"Microplastics in Household Dust",url:"https://pubs.acs.org/doi/10.1021/acs.est.9b03037",journal:"Environmental Science & Technology"}],
  baby:          [{title:"Infant Microplastic Exposure Study",url:"https://www.nature.com/articles/s43016-020-00171-y",journal:"Nature Food"},{title:"Microplastics in Baby Products",url:"https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7068600/",journal:"NIH Environmental Research"},{title:"BPA & Phthalates in Baby Bottles",url:"https://www.healthystuff.org/",journal:"Healthy Stuff Study"}],
  other:         [{title:"Global Microplastics Overview",url:"https://www.unep.org/resources/report/plastics-planet-how-plastics-are-polluting-our-world",journal:"UNEP Report"},{title:"Microplastics in Human Body",url:"https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7068600/",journal:"NIH Review Study"},{title:"Plastic Health Effects Research",url:"https://www.plastichealthcoalition.org/",journal:"Plastic Health Coalition"}],
};

// Bundle suggestions by category
const BUNDLES = {
  clothing: {title:"Plastic-Free Wardrobe Starter",desc:"Replace your 3 highest-shedding items",saving:"Save ~$0 in plastic exposure",items:["Pact Organic Cotton Underwear","Thought Clothing Bamboo Socks","prAna Hemp Blend T-Shirt","Guppyfriend Washing Bag"]},
  food_beverage: {title:"Plastic-Free Kitchen Bundle",desc:"Eliminate single-use plastics from your kitchen",saving:"Replaces hundreds of single-use items",items:["Klean Kanteen Stainless Water Bottle","Stasher Silicone Food Bags","Bee's Wrap Beeswax Food Wrap","Swedish Dishcloths"]},
  personal_care: {title:"Plastic-Free Bathroom Bundle",desc:"Replace your top plastic-heavy personal care items",saving:"Cuts bathroom plastic by ~80%",items:["Ethique Shampoo Bar","Bite Toothpaste Bits","Meow Meow Tweet Deodorant","LastObject Reusable Cotton Rounds"]},
  kitchen: {title:"Plastic-Free Cooking Bundle",desc:"Upgrade your cookware and cleaning essentials",saving:"Eliminates daily plastic exposure at mealtime",items:["Xtrema Pure Ceramic Cookware","Full Circle Loofah Dish Brush","Swedish Dishcloths","Ecover Laundry Detergent Sheets"]},
  baby: {title:"Plastic-Free Baby Essentials",desc:"The safest start for your little one",saving:"Reduces infant microplastic exposure",items:["Pehr Organic Cotton Onesie","Green Sprouts Glass Baby Bottles","Hanna Andersson Organic PJs","Bumkins Silicone Bib"]},
  other: {title:"Plastic-Free Starter Kit",desc:"The best low-plastic swaps across categories",saving:"Great starting point for any household",items:["Klean Kanteen Water Bottle","Ethique Shampoo Bar","Bee's Wrap Food Wrap","Swedish Dishcloths"]},
};

// ── SVG ICONS ─────────────────────────────────────────────────
const IconMicroscope = ({size=22,color="#fff"})  => <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M9.5 2a1 1 0 0 1 1 1v1h1a1 1 0 0 1 0 2h-1v1.5l2.24 2.24A7 7 0 1 1 5.06 16H3a1 1 0 0 1 0-2h2.06A7.01 7.01 0 0 1 9 8.07V6h-.5a1 1 0 0 1 0-2H9V3a1 1 0 0 1 .5-1zM12 11a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/></svg>;
const IconSearch     = ({size=18,color="currentColor"}) => <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M10 2a8 8 0 1 0 4.906 14.32l4.387 4.387a1 1 0 0 0 1.414-1.414l-4.387-4.387A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12A6 6 0 0 1 10 4z"/></svg>;
const IconChart      = ({size=26,color="#16a34a"}) => <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M3 3a1 1 0 0 1 1 1v14h16a1 1 0 0 1 0 2H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm14 2a1 1 0 0 1 1 1v8a1 1 0 0 1-2 0V6a1 1 0 0 1 1-1zm-4 3a1 1 0 0 1 1 1v5a1 1 0 0 1-2 0V9a1 1 0 0 1 1-1zm-4 3a1 1 0 0 1 1 1v2a1 1 0 0 1-2 0v-2a1 1 0 0 1 1-1z"/></svg>;
const IconShield     = ({size=26,color="#16a34a"}) => <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-1 14l-3-3 1.41-1.41L11 12.17l4.59-4.58L17 9l-6 6z"/></svg>;
const IconWarning    = ({size=20,color="#dc2626"}) => <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M12 2L1 21h22L12 2zm0 3.5L20.5 19h-17L12 5.5zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z"/></svg>;
const IconCheck      = ({size=20,color="#16a34a"}) => <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>;
const IconArrow      = ({size=14,color="#16a34a"}) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>;
const IconTag        = ({size=22,color="#16a34a"}) => <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M21.41 11.58l-9-9A2 2 0 0 0 11 2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 .59 1.42l9 9A2 2 0 0 0 13 22a2 2 0 0 0 1.41-.59l7-7A2 2 0 0 0 22 13a2 2 0 0 0-.59-1.42zM6.5 8C5.67 8 5 7.33 5 6.5S5.67 5 6.5 5 8 5.67 8 6.5 7.33 8 6.5 8z"/></svg>;
const IconHistory    = ({size=18,color="#6b7280"}) => <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M13 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7v3l4-4-4-4v3zm1 10h-2V8h2v4.41l2.29 2.3-1.41 1.41L14 13.83V13z"/></svg>;
const IconInstagram  = ({size=18,color="#fff"}) => <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>;
const IconShare      = ({size=16,color="#6b7280"}) => <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M18 16c-.8 0-1.5.3-2 .8l-7.1-4.1c.1-.2.1-.5.1-.7s0-.5-.1-.7L16 7.2c.5.5 1.2.8 2 .8 1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3c0 .2 0 .5.1.7L8 9.8C7.5 9.3 6.8 9 6 9c-1.7 0-3 1.3-3 3s1.3 3 3 3c.8 0 1.5-.3 2-.8l7.1 4.1c-.1.2-.1.4-.1.7 0 1.6 1.3 2.9 2.9 2.9s2.9-1.3 2.9-2.9S19.6 16 18 16z"/></svg>;
const IconTrash      = ({size=15,color="#9ca3af"}) => <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M9 3v1H4v2h1v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6h1V4h-5V3H9zm0 5h2v9H9V8zm4 0h2v9h-2V8z"/></svg>;
const IconMoon       = ({size=18,color="currentColor"}) => <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/></svg>;
const IconSun        = ({size=18,color="currentColor"}) => <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 0 0 0-1.41l-1.06-1.06zm1.06-12.37-1.06 1.06a.996.996 0 0 0 0 1.41c.39.39 1.03.39 1.41 0l1.06-1.06a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0zM7.05 18.36l-1.06 1.06a.996.996 0 0 0 0 1.41c.39.39 1.03.39 1.41 0l1.06-1.06a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0z"/></svg>;
const IconFire       = ({size=14,color="#ef4444"}) => <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M13.5 0.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/></svg>;
const IconBook       = ({size=20,color="#6366f1"}) => <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/></svg>;
const IconLink       = ({size=14,color="#6366f1"}) => <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>;
const IconBundle     = ({size=20,color="#7c3aed"}) => <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M20 6h-2.18c.07-.44.18-.88.18-1.36C18 2.05 15.96 0 13.36 0c-1.31 0-2.4.5-3.27 1.33L9 2.5 7.91 1.33C7.04.5 5.95 0 4.64 0 2.04 0 0 2.05 0 4.64c0 .48.11.92.18 1.36H0v13c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6.64-4c.9 0 1.64.74 1.64 1.64 0 .97-.79 1.72-1.64 2.36C12.15 5.36 11.35 4.61 11.35 3.64 11.35 2.74 12.1 2 13.36 2zM4.64 2c1.26 0 2.01.74 2.01 1.64 0 .97-.8 1.72-2.01 2.36C3.43 5.36 2.64 4.61 2.64 3.64 2.64 2.74 3.38 2 4.64 2zM20 19H2v-2h18v2zm0-5H2V8h18v6z"/></svg>;

// ── ANIMATED SCORE ────────────────────────────────────────────
const AnimatedScore = ({target, color}) => {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let current = 0;
    const step = () => { current += 0.35; if (current >= target) { setDisplay(target); return; } setDisplay(Math.floor(current)); requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }, [target]);
  return <tspan fill={color}>{display}</tspan>;
};

// ── SCORE ARC ────────────────────────────────────────────────
const ScoreArc = ({score}) => {
  const [animated, setAnimated] = useState(false);
  useEffect(() => { const t = setTimeout(()=>setAnimated(true), 100); return ()=>clearTimeout(t); }, [score]);
  const angle = (score/10)*180, r=96, cx=120, cy=120;
  const toRad = (d) => (d*Math.PI)/180;
  const arcX  = (d) => cx + r*Math.cos(toRad(180-d));
  const arcY  = (d) => cy - r*Math.sin(toRad(180-d));
  const color = scoreColor(score);
  const currentAngle = animated ? angle : 0;
  return (
    <svg width="240" height="136" viewBox="0 0 240 136">
      <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`} fill="none" stroke="#e0e0e0" strokeWidth="18" strokeLinecap="round"/>
      <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${arcX(currentAngle)} ${arcY(currentAngle)}`} fill="none" stroke={color} strokeWidth="18" strokeLinecap="round" style={{transition:"all 1.2s cubic-bezier(.4,0,.2,1)"}}/>
      <text x={cx} y={cy-10} textAnchor="middle" fontSize="52" fontWeight="800" fontFamily="Georgia,serif"><AnimatedScore target={score} color={color}/></text>
    </svg>
  );
};

// ── RISK BAR ─────────────────────────────────────────────────
const RiskBar = ({score}) => {
  const pct = (score/10)*100;
  const pctHigher = Math.round(pct);
  return (
    <div style={{marginTop:20}}>
      <div style={{display:"flex", justifyContent:"space-between", fontSize:11, color:"#aaa", marginBottom:7}}>
        <span>Safer ←</span>
        <span style={{fontWeight:600, color:scoreColor(score), fontSize:12}}>{pctHigher>50?`More dangerous than ${pctHigher}% of products`:`Safer than ${100-pctHigher}% of products`}</span>
        <span>→ Riskier</span>
      </div>
      <div style={{position:"relative", height:12, borderRadius:99, background:"linear-gradient(to right,#16a34a,#65a30d,#d97706,#dc2626,#991b1b)", overflow:"visible"}}>
        <div style={{position:"absolute", top:"50%", left:`${pct}%`, transform:"translate(-50%,-50%)", width:22, height:22, borderRadius:"50%", background:"#fff", border:`3px solid ${scoreColor(score)}`, boxShadow:"0 2px 10px rgba(0,0,0,0.25)", transition:"left 1.2s cubic-bezier(.4,0,.2,1)"}}/>
      </div>
    </div>
  );
};

// ── SCAN VS SAFE SPLIT VIEW ───────────────────────────────────
const SplitView = ({result, isDark}) => {
  // Only show if we have an alternative that's actually relevant — same category or AI suggested
  const best = result.alternatives?.find(p => p.category === result.category || p.source === "ai")
    || result.alternatives?.[0];
  // Don't show if score is already very low (nothing to compare against)
  if (!best || result.score <= 3) return null;
  const surface = isDark?"#1e2433":"#fff";
  const border  = isDark?"#2a3347":"#eee";
  const text    = isDark?"#f1f5f9":"#111";
  return (
    <div style={{marginTop:24}}>
      <div style={{fontSize:12, color:"#aaa", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:12, textAlign:"center"}}>Side-by-Side Comparison</div>
      <div style={{display:"grid", gridTemplateColumns:"1fr auto 1fr", gap:0, alignItems:"stretch"}}>
        {/* Risky side */}
        <div style={{background:scoreBg(result.score), borderRadius:"12px 0 0 12px", padding:"20px", border:`1.5px solid ${scoreColor(result.score)}33`, borderRight:"none"}}>
          <div style={{fontSize:11, color:scoreColor(result.score), textTransform:"uppercase", fontWeight:700, marginBottom:6}}>Your Product</div>
          <div style={{fontSize:15, fontWeight:700, color:text, fontFamily:"'Outfit',sans-serif", marginBottom:10, lineHeight:1.3}}>{result.product_name?.length>40?result.product_name.slice(0,37)+"…":result.product_name}</div>
          <div style={{display:"flex", alignItems:"center", gap:8}}>
            <div style={{fontSize:28, fontWeight:800, color:scoreColor(result.score), fontFamily:"'Outfit',sans-serif"}}>{result.score}</div>
            <div style={{fontSize:12, color:scoreColor(result.score), fontWeight:600}}>/10 danger</div>
          </div>
          <div style={{fontSize:12, color:scoreColor(result.score), fontWeight:600, marginTop:6, padding:"4px 10px", background:`${scoreColor(result.score)}15`, borderRadius:20, display:"inline-block"}}>{scoreLabel(result.score)} Danger</div>
        </div>
        {/* VS divider */}
        <div style={{display:"flex", alignItems:"center", justifyContent:"center", background:isDark?"#131929":"#f5f5f5", padding:"0 14px", zIndex:1}}>
          <div style={{fontSize:13, fontWeight:800, color:"#999", letterSpacing:"0.05em"}}>VS</div>
        </div>
        {/* Safe side */}
        <div style={{background:"#f0fdf4", borderRadius:"0 12px 12px 0", padding:"20px", border:"1.5px solid #16a34a33", borderLeft:"none"}}>
          <div style={{fontSize:11, color:"#16a34a", textTransform:"uppercase", fontWeight:700, marginBottom:6}}>Better Choice</div>
          <div style={{fontSize:15, fontWeight:700, color:text, fontFamily:"'Outfit',sans-serif", marginBottom:10, lineHeight:1.3}}>{best.name}</div>
          <div style={{display:"flex", alignItems:"center", gap:8}}>
            <div style={{fontSize:28, fontWeight:800, color:"#16a34a", fontFamily:"'Outfit',sans-serif"}}>{best.score}</div>
            <div style={{fontSize:12, color:"#16a34a", fontWeight:600}}>/10 danger</div>
          </div>
          <a href={best.affiliateUrl} target="_blank" rel="noopener noreferrer" style={{fontSize:12, color:"#fff", fontWeight:600, marginTop:8, padding:"5px 14px", background:"#16a34a", borderRadius:20, display:"inline-flex", alignItems:"center", gap:4, textDecoration:"none"}}>
            Shop now <IconArrow size={11} color="#fff"/>
          </a>
        </div>
      </div>
    </div>
  );
};

// ── BUNDLE RECOMMENDATION (replaced with simple CTA) ─────────
const BundleCard = ({category, isDark}) => {
  const bundle = BUNDLES[category] || BUNDLES.other;
  const surface = isDark?"#1e2433":"#fff";
  const border  = isDark?"#2a3347":"#eee";
  const text    = isDark?"#f1f5f9":"#111";
  const muted   = isDark?"#64748b":"#888";
  const searches = {
    clothing:      "plastic-free organic cotton clothing",
    food_beverage: "plastic-free reusable food storage",
    personal_care: "plastic-free natural personal care",
    kitchen:       "plastic-free stainless steel cookware",
    baby:          "plastic-free organic baby products",
    other:         "plastic-free eco friendly products",
  };
  const searchQuery = searches[category] || searches.other;
  const amazonUrl = `https://www.amazon.com/s?k=${encodeURIComponent(searchQuery)}&tag=partiqule-20`;
  return (
    <div style={{background:isDark?"#1a1f2e":"#f5f3ff", borderRadius:16, padding:"24px", border:`1.5px solid ${isDark?"#2a3347":"#ddd6fe"}`}}>
      <div style={{display:"flex", alignItems:"flex-start", gap:12, marginBottom:16}}>
        <div style={{width:40, height:40, borderRadius:10, background:"#7c3aed", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0}}>
          <IconBundle size={20} color="#fff"/>
        </div>
        <div>
          <div style={{fontSize:11, color:"#7c3aed", textTransform:"uppercase", fontWeight:700, letterSpacing:"0.05em", marginBottom:3}}>Bundle Recommendation</div>
          <div style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:17, color:text, lineHeight:1.3}}>{bundle.title}</div>
          <div style={{fontSize:13, color:muted, marginTop:3}}>{bundle.desc}</div>
        </div>
      </div>
      <div style={{display:"flex", flexDirection:"column", gap:6, marginBottom:16}}>
        {bundle.items.map((item,i) => (
          <div key={i} style={{display:"flex", alignItems:"center", gap:8, fontSize:13, color:isDark?"#94a3b8":"#444"}}>
            <div style={{width:18, height:18, borderRadius:"50%", background:"#f0fdf4", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0}}>
              <IconCheck size={11} color="#16a34a"/>
            </div>
            {item}
          </div>
        ))}
      </div>
      <a href={amazonUrl} target="_blank" rel="noopener noreferrer"
        style={{display:"flex", alignItems:"center", justifyContent:"center", gap:6, width:"100%", padding:"12px", borderRadius:10, background:"#7c3aed", color:"#fff", fontSize:14, fontWeight:600, textDecoration:"none", boxSizing:"border-box"}}>
        Shop this bundle on Amazon <IconArrow size={14} color="#fff"/>
      </a>
    </div>
  );
};

// ── SOURCE CITATIONS ──────────────────────────────────────────
const SourceCitations = ({category, isDark}) => {
  const [open, setOpen] = useState(false);
  const sources = SOURCES[category] || SOURCES.other;
  const surface = isDark?"#1e2433":"#fff";
  const border  = isDark?"#2a3347":"#eee";
  const text    = isDark?"#f1f5f9":"#111";
  const muted   = isDark?"#64748b":"#888";
  return (
    <div style={{background:surface, borderRadius:16, border:`1.5px solid ${border}`, overflow:"hidden"}}>
      <button onClick={()=>setOpen(o=>!o)} style={{width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"18px 24px", background:"none", border:"none", cursor:"pointer", textAlign:"left"}}>
        <div style={{display:"flex", alignItems:"center", gap:10}}>
          <div style={{width:34, height:34, borderRadius:9, background:isDark?"#1e1f3a":"#eef2ff", display:"flex", alignItems:"center", justifyContent:"center"}}>
            <IconBook size={18} color="#6366f1"/>
          </div>
          <div>
            <div style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:15, color:text}}>Research & Sources</div>
            <div style={{fontSize:12, color:muted}}>Scores based on peer-reviewed studies</div>
          </div>
        </div>
        <div style={{fontSize:18, color:muted, transform:open?"rotate(180deg)":"none", transition:"transform 0.2s"}}>›</div>
      </button>
      {open && (
        <div style={{padding:"0 24px 20px", borderTop:`1px solid ${border}`}}>
          <div style={{fontSize:12, color:muted, marginBottom:12, paddingTop:14}}>The risk scores for this category are informed by the following research:</div>
          {sources.map((s,i) => (
            <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
              style={{display:"flex", alignItems:"flex-start", gap:10, padding:"10px 0", borderBottom:i<sources.length-1?`1px solid ${border}`:"none", textDecoration:"none"}}>
              <div style={{width:28, height:28, borderRadius:7, background:isDark?"#1e1f3a":"#eef2ff", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1}}>
                <IconLink size={13} color="#6366f1"/>
              </div>
              <div>
                <div style={{fontSize:13, fontWeight:600, color:isDark?"#a5b4fc":"#4f46e5", lineHeight:1.4}}>{s.title}</div>
                <div style={{fontSize:11, color:muted, marginTop:2}}>{s.journal}</div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

// ── EDUCATION SECTION ─────────────────────────────────────────
const EducationSection = ({isDark, isMobile=false}) => {
  const surface = isDark?"#1e2433":"#fff";
  const border  = isDark?"#2a3347":"#eee";
  const text    = isDark?"#f1f5f9":"#111";
  const muted   = isDark?"#64748b":"#666";
  const bg      = isDark?"#131929":"#fafafa";
  const px      = isMobile?"16px":"40px";
  const stats = [
    {number:"74,000", label:"microplastic particles the average person consumes per year",  color:"#16a34a", bg:"#f0fdf4"},
    {number:"5mm",    label:"maximum size of a microplastic — many are invisible to the naked eye", color:"#059669", bg:"#ecfdf5"},
    {number:"1950s",  label:"when large-scale plastic production began polluting our food chain",    color:"#047857", bg:"#d1fae5"},
    {number:"100%",   label:"of human blood samples tested in 2022 contained microplastics",        color:"#052e16", bg:"#bbf7d0"},
  ];
  const faqs = [
    {q:"What are microplastics?", a:"Microplastics are tiny plastic particles less than 5mm in size. They come from the breakdown of larger plastic products, synthetic textiles, and plastic packaging. They've been found in human blood, lungs, placentas, and breast milk."},
    {q:"How do I ingest microplastics?", a:"Through drinking water, eating seafood, breathing indoor air, using plastic food containers (especially when heated), wearing synthetic clothing, and using personal care products with plastic packaging."},
    {q:"Are microplastics dangerous?", a:"Research is ongoing, but studies have linked microplastic exposure to inflammation, hormonal disruption, and potential carcinogenic effects. The WHO has called for more research, particularly around nanoplastics that can cross cell membranes."},
    {q:"How does Partiqule score products?", a:"Our AI analyzes each product based on its materials, manufacturing process, packaging, and usage patterns — then cross-references known research on microplastic release to generate a 1–10 risk score."},
  ];
  return (
    <section style={{background:bg, borderTop:`1px solid ${border}`, padding:isMobile?"40px 16px":"64px 40px"}}>
      <div style={{maxWidth:1100, margin:"0 auto"}}>
        <div style={{textAlign:"center", marginBottom:isMobile?32:48}}>
          <div style={{display:"inline-flex", alignItems:"center", gap:6, background:isDark?"#1e1f3a":"#eef2ff", color:"#6366f1", fontSize:13, fontWeight:600, padding:"5px 14px", borderRadius:20, marginBottom:16, textTransform:"uppercase", letterSpacing:"0.05em"}}>
            <IconBook size={13} color="#6366f1"/> The Science
          </div>
          <h2 style={{fontFamily:"'Outfit',sans-serif", fontSize:36, fontWeight:700, color:text, margin:"0 0 16px", letterSpacing:"-1px"}}>What are microplastics?</h2>
          <p style={{fontSize:17, color:muted, maxWidth:600, margin:"0 auto", lineHeight:1.7}}>
            Tiny plastic particles that have infiltrated our food, water, air — and bodies. Here's what the science says.
          </p>
        </div>

        {/* Stats grid */}
        <div style={{display:"grid", gridTemplateColumns:isMobile?"repeat(2,1fr)":"repeat(4,1fr)", gap:isMobile?10:20, marginBottom:isMobile?32:56}}>
          {stats.map((s,i) => (
            <div key={i} style={{background:isDark?"#1e2433":s.bg, borderRadius:14, padding:"24px 20px", border:`1.5px solid ${isDark?"#2a3347":"transparent"}`, textAlign:"center"}}>              <div style={{fontFamily:"'Outfit',sans-serif", fontSize:32, fontWeight:800, color:isDark?"#4ade80":s.color, marginBottom:8}}>{s.number}</div>
              <div style={{fontSize:13, color:isDark?"#64748b":s.color, lineHeight:1.5, opacity:isDark?1:0.85}}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div style={{display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:isMobile?10:20}}>
          {faqs.map((faq,i) => (
            <div key={i} style={{background:surface, borderRadius:14, padding:"24px", border:`1.5px solid ${border}`}}>
              <div style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:16, color:text, marginBottom:10}}>{faq.q}</div>
              <div style={{fontSize:14, color:muted, lineHeight:1.7}}>{faq.a}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

// ── PLASTIC SCORE DROPDOWN ────────────────────────────────────
const PlasticScoreDropdown = ({result, isDark, muted}) => {
  const [open, setOpen] = useState(false);
  const ps = result.score;
  const color  = scoreColor(ps);
  const bg     = isDark?"#1e2433":scoreBg(ps);
  const borderColor = ps<=3?"#bbf7d0":ps<=6?"#fde68a":ps<=8?"#fed7aa":"#fecaca";
  const plabel = scoreLabel(ps);

  return (
    <div style={{marginBottom:10, borderRadius:14, overflow:"hidden", border:`1.5px solid ${borderColor}`, background:bg}}>
      <button onClick={()=>setOpen(o=>!o)} style={{
        width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"10px 16px", background:"none", border:"none", cursor:"pointer", gap:8
      }}>
        <div style={{display:"flex", alignItems:"center", gap:8}}>
          <span style={{fontSize:14}}>🔬</span>
          <span style={{fontSize:12, color, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em"}}>
            Plastic Danger
          </span>
          <span style={{fontSize:13, fontWeight:800, color, fontFamily:"'Outfit',sans-serif"}}>{ps}/10</span>
          <span style={{fontSize:11, color, fontWeight:600, background:`${color}18`, padding:"2px 8px", borderRadius:10}}>
            {plabel}
          </span>
        </div>
        <span style={{fontSize:12, color, transition:"transform 0.2s", display:"inline-block",
          transform:open?"rotate(180deg)":"rotate(0deg)"}}>▾</span>
      </button>

      {open && (
        <div style={{padding:"0 16px 14px", borderTop:`1px solid ${borderColor}`}}>
          {result.score_reasoning && (
            <p style={{fontSize:13, color:isDark?"#94a3b8":"#555", lineHeight:1.6, margin:"12px 0 10px", fontStyle:"italic"}}>
              {result.score_reasoning}
            </p>
          )}
          {result.identified_plastics?.length > 0 && (
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11, color:muted, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:6}}>Plastics identified</div>
              <div style={{display:"flex", flexWrap:"wrap", gap:6}}>
                {result.identified_plastics.map((p,i)=>(
                  <span key={i} style={{fontSize:12, fontWeight:700, padding:"3px 10px", borderRadius:16,
                    background:isDark?"#2a1a1a":"#fef2f2", color:"#dc2626", border:"1px solid #fecaca"}}>
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}
          {result.concerns?.length > 0 && (
            <div style={{display:"flex", flexDirection:"column", gap:6}}>
              {result.concerns.map((c,i)=>(
                <div key={i} style={{display:"flex", alignItems:"flex-start", gap:8}}>
                  <span style={{color, fontSize:12, marginTop:2, flexShrink:0}}>•</span>
                  <span style={{fontSize:13, color:isDark?"#94a3b8":"#555", lineHeight:1.5}}>{c}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── HEALTH SCORE DROPDOWN ─────────────────────────────────────
const HealthScoreDropdown = ({result, isDark, muted}) => {
  const [open, setOpen] = useState(false);
  const hs = result.health_score;
  const hc = result.health_concerns || [];
  const hn = result.health_note;
  const isHigh = hs >= 7;
  const isMed  = hs >= 4 && hs < 7;
  const color  = hs<=3?"#16a34a":hs<=6?"#ca8a04":hs<=8?"#ea580c":"#dc2626";
  const bg     = hs<=3?(isDark?"#1a2a1a":"#f0fdf4"):hs<=6?(isDark?"#1e1a00":"#fefce8"):hs<=8?(isDark?"#1e1200":"#fff7ed"):(isDark?"#2a1a1a":"#fef2f2");
  const borderColor = hs<=3?"#bbf7d0":hs<=6?"#fde68a":hs<=8?"#fed7aa":"#fecaca";
  const hlabel = hs<=3?"Low":hs<=6?"Moderate":hs<=8?"High":"Very High";

  return (
    <div style={{marginBottom:10, borderRadius:14, overflow:"hidden", border:`1.5px solid ${borderColor}`, background:bg}}>
      {/* Header row — always visible */}
      <button onClick={()=>setOpen(o=>!o)} style={{
        width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"10px 16px", background:"none", border:"none", cursor:"pointer", gap:8
      }}>
        <div style={{display:"flex", alignItems:"center", gap:8}}>
          <span style={{fontSize:14}}>❤️</span>
          <span style={{fontSize:12, color, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em"}}>
            Health Concern
          </span>
          <span style={{fontSize:13, fontWeight:800, color, fontFamily:"'Outfit',sans-serif"}}>{hs}/10</span>
          <span style={{fontSize:11, color, fontWeight:600,
            background:`${color}18`, padding:"2px 8px", borderRadius:10}}>
            {hlabel}
          </span>
        </div>
        <span style={{fontSize:12, color, transition:"transform 0.2s", display:"inline-block",
          transform:open?"rotate(180deg)":"rotate(0deg)"}}>▾</span>
      </button>

      {/* Expanded content */}
      {open && (
        <div style={{padding:"0 16px 14px", borderTop:`1px solid ${borderColor}`}}>
          {/* Health note */}
          {hn && (
            <p style={{fontSize:13, color:isDark?"#94a3b8":"#555", lineHeight:1.6, margin:"12px 0 10px", fontStyle:"italic"}}>
              {hn}
            </p>
          )}

          {/* Health concerns list */}
          {hc.length > 0 && (
            <div style={{display:"flex", flexDirection:"column", gap:6, marginBottom:12}}>
              {hc.map((concern, i) => (
                <div key={i} style={{display:"flex", alignItems:"flex-start", gap:8}}>
                  <span style={{color, fontSize:12, marginTop:2, flexShrink:0}}>•</span>
                  <span style={{fontSize:13, color:isDark?"#94a3b8":"#555", lineHeight:1.5}}>{concern}</span>
                </div>
              ))}
            </div>
          )}

          {/* High risk CTA */}
          {isHigh && (
            <div style={{
              background:isDark?"#2a1515":"#fff5f5",
              border:"1.5px solid #fca5a5",
              borderRadius:10, padding:"12px 14px", marginTop:8
            }}>
              <div style={{fontSize:12, fontWeight:700, color:"#dc2626", marginBottom:4}}>
                ⚠️ High health concern detected
              </div>
              <div style={{fontSize:12, color:isDark?"#fca5a5":"#7f1d1d", lineHeight:1.6, marginBottom:10}}>
                This product has significant health concerns beyond microplastics. Consider switching to a safer alternative.
              </div>
              {result.ai_alternatives?.[0] && (
                <button
                  onClick={()=>{
                    const el = document.getElementById("safer-alternatives");
                    if (el) el.scrollIntoView({behavior:"smooth"});
                  }}
                  style={{fontSize:12, fontWeight:700, color:"#fff", background:"#dc2626",
                    border:"none", borderRadius:8, padding:"7px 14px", cursor:"pointer"}}>
                  See safer alternatives ↓
                </button>
              )}
            </div>
          )}

          {/* Moderate risk nudge */}
          {isMed && (
            <div style={{
              background:isDark?"#1e1a2e":"#faf5ff",
              border:"1px solid #ddd6fe",
              borderRadius:10, padding:"10px 14px", marginTop:8
            }}>
              <div style={{fontSize:12, color:isDark?"#c4b5fd":"#6d28d9", lineHeight:1.5}}>
                💜 Moderate health concerns. Safer alternatives exist — scroll down to explore.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── SHARE BADGE (with copy-as-image) ─────────────────────────
const ShareBadge = ({result}) => {
  const [sharing,     setSharing]     = useState(false);
  const [done,        setDone]        = useState(false);
  const safeName    = (result.product_name || "").startsWith("http") ? "Scanned product" : result.product_name;
  const displayName = safeName?.length > 40 ? safeName.slice(0, 37) + "…" : safeName;
  const color       = scoreColor(result.score);
  const label       = scoreLabel(result.score);

  const buildCanvas = () => {
    const canvas = document.createElement("canvas");
    const dpr    = window.devicePixelRatio || 1;
    const W = 600, H = 400;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const os = result.overall_score || result.score;
    const ps = result.score;
    const hs = result.health_score;
    const hasAll = os && ps && hs;

    const overallColor = os<=3?"#16a34a":os<=6?"#ca8a04":os<=8?"#ea580c":"#dc2626";
    const plasticColor = ps<=3?"#16a34a":ps<=6?"#ca8a04":ps<=8?"#ea580c":"#dc2626";
    const healthColor  = hs ? (hs<=3?"#16a34a":hs<=6?"#ca8a04":hs<=8?"#ea580c":"#dc2626") : "#aaa";

    const bgColor = os<=3?"#f0fdf4":os<=6?"#fefce8":os<=8?"#fff7ed":"#fff5f5";

    // ── Background ──
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 20);
    ctx.fill();

    // Top bar
    ctx.fillStyle = "#052e16";
    ctx.fillRect(0, 0, W, 6);

    // ── Logo + tagline top left ──
    ctx.fillStyle = "#052e16";
    ctx.font = "bold 16px system-ui";
    ctx.fillText("🔬 Partiqule", 32, 40);
    ctx.fillStyle = "#aaa";
    ctx.font = "12px system-ui";
    ctx.fillText("Scan anything. Know everything.", 32, 58);

    // ── Product name ──
    ctx.fillStyle = "#111";
    ctx.font = "bold 22px system-ui";
    const name = safeName?.length > 36 ? safeName.slice(0,33)+"…" : safeName;
    ctx.fillText(name, 32, 96);

    // ── LEFT: Big overall score ──
    ctx.fillStyle = overallColor;
    ctx.font = "bold 100px system-ui";
    ctx.fillText(os, 32, 220);
    ctx.fillStyle = "#bbb";
    ctx.font = "bold 26px system-ui";
    ctx.fillText("/ 10", 32 + (os >= 10 ? 128 : 80), 220);

    // Overall label
    const overallLabel = os<=3?"Minimal":os<=6?"Moderate":os<=8?"High":"Very High";
    const oBgColor = os<=3?"#dcfce7":os<=6?"#fef9c3":os<=8?"#ffedd5":"#fee2e2";
    ctx.fillStyle = oBgColor;
    ctx.beginPath();
    ctx.roundRect(32, 234, 200, 30, 15);
    ctx.fill();
    ctx.fillStyle = overallColor;
    ctx.font = "bold 13px system-ui";
    ctx.fillText(`⚖️ ${overallLabel} Overall`, 48, 254);

    // Overall sub-label
    ctx.fillStyle = "#aaa";
    ctx.font = "11px system-ui";
    ctx.fillText("70% plastic · 30% health", 32, 282);

    // ── DIVIDER ──
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W/2 - 10, 108);
    ctx.lineTo(W/2 - 10, 300);
    ctx.stroke();

    // ── RIGHT: Plastic score box ──
    const RX = W/2 + 10;
    const plasticBg = ps<=3?"#f0fdf4":ps<=6?"#fefce8":ps<=8?"#fff7ed":"#fef2f2";
    ctx.fillStyle = plasticBg;
    ctx.beginPath();
    ctx.roundRect(RX, 108, W-RX-20, 82, 12);
    ctx.fill();
    ctx.strokeStyle = plasticColor + "55";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = "#888";
    ctx.font = "11px system-ui";
    ctx.fillText("🔬  Plastic Danger", RX+14, 126);

    ctx.fillStyle = plasticColor;
    ctx.font = "bold 32px system-ui";
    ctx.fillText(`${ps}/10`, RX+14, 162);

    const plasticLabel = ps<=3?"Minimal":ps<=6?"Moderate":ps<=8?"High":"Very High";
    ctx.fillStyle = plasticColor;
    ctx.font = "12px system-ui";
    ctx.fillText(plasticLabel, RX+14, 180);

    // ── RIGHT: Health score box ──
    if (hs) {
      const healthBg = hs<=3?"#f0fdf4":hs<=6?"#fefce8":hs<=8?"#fff7ed":"#fef2f2";
      ctx.fillStyle = healthBg;
      ctx.beginPath();
      ctx.roundRect(RX, 202, W-RX-20, 82, 12);
      ctx.fill();
      ctx.strokeStyle = healthColor + "55";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = "#888";
      ctx.font = "11px system-ui";
      ctx.fillText("❤️  Health Concern", RX+14, 220);

      ctx.fillStyle = healthColor;
      ctx.font = "bold 32px system-ui";
      ctx.fillText(`${hs}/10`, RX+14, 256);

      const healthLabel = hs<=3?"Low":hs<=6?"Moderate":hs<=8?"High":"Very High";
      ctx.fillStyle = healthColor;
      ctx.font = "12px system-ui";
      ctx.fillText(healthLabel, RX+14, 274);
    }

    // ── Summary ──
    ctx.fillStyle = "#555";
    ctx.font = "13px system-ui";
    const words = (result.summary || "").split(" ");
    let line = "", y = 316, lineH = 19;
    for (const word of words) {
      const test = line + (line ? " " : "") + word;
      if (ctx.measureText(test).width > W-64 && line) {
        ctx.fillText(line, 32, y); line = word; y += lineH;
        if (y > 356) { ctx.fillText(line+"…", 32, y); break; }
      } else { line = test; }
    }
    if (y <= 356) ctx.fillText(line, 32, y);

    // ── Footer ──
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(32, 368); ctx.lineTo(W-32, 368);
    ctx.stroke();
    ctx.fillStyle = "#bbb";
    ctx.font = "12px system-ui";
    ctx.fillText("partiqule.com · Scan anything. Know everything.", 32, 388);

    return canvas;
  };

  const share = async () => {
    setSharing(true);
    try {
      const canvas = buildCanvas();
      canvas.toBlob(async (blob) => {
        try {
          // Mobile: use native share sheet if available — lets users save to photos or share to any app
          if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([blob], "partiqule.png", { type: "image/png" })] })) {
            const file = new File([blob], `partiqule-${safeName?.slice(0,20)||"result"}.png`, { type: "image/png" });
            await navigator.share({
              title: `${safeName} — Overall Score ${result.overall_score||result.score}/10`,
              text: `I scanned ${safeName} on Partiqule — Overall score ${result.overall_score||result.score}/10. 🔬 Plastic danger: ${result.score}/10${result.health_score ? ` · ❤️ Health concern: ${result.health_score}/10` : ""}. Scan anything at partiqule.com`,
              files: [file],
            });
          } else if (navigator.clipboard?.write) {
            // Desktop: copy image to clipboard
            await navigator.clipboard.write([new ClipboardItem({"image/png": blob})]);
            setDone(true);
            setTimeout(() => setDone(false), 2500);
          } else {
            // Fallback: download the image
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `partiqule-${safeName?.slice(0,20)||"result"}.png`;
            a.click();
            URL.revokeObjectURL(url);
            setDone(true);
            setTimeout(() => setDone(false), 2500);
          }
        } catch(e) {
          // If share was cancelled by user, silently fail
          if (e.name !== "AbortError") {
            // Last resort: download
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `partiqule-${safeName?.slice(0,20)||"result"}.png`;
            a.click();
            URL.revokeObjectURL(url);
          }
        }
        setSharing(false);
      }, "image/png");
    } catch(e) {
      console.error(e);
      setSharing(false);
    }
  };

  return (
    <div style={{marginTop:20, padding:"14px 18px", background:"rgba(0,0,0,0.03)", borderRadius:12, border:"1px dashed #ddd"}}>
      <div style={{fontSize:11, color:"#aaa", marginBottom:8, textTransform:"uppercase", letterSpacing:"0.06em"}}>Share result</div>
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", background:"#fff", borderRadius:9, padding:"10px 14px", border:"1px solid #eee"}}>
        <div style={{display:"flex", alignItems:"center", gap:10}}>
          <div style={{width:34, height:34, borderRadius:8, background:scoreBg(result.score), display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:16, color}}>{result.score}</div>
          <div>
            <div style={{fontSize:12, fontWeight:600, color:"#111"}}>{displayName}</div>
            <div style={{fontSize:11, color}}>{label} Danger</div>
          </div>
        </div>
        <button onClick={share} disabled={sharing} style={{display:"flex", alignItems:"center", gap:6, padding:"8px 16px", borderRadius:8, border:"none", background:"#052e16", fontSize:13, fontWeight:600, color:"#4ade80", cursor:"pointer"}}>
          {sharing ? "…" : done ? "✓ Copied!" : <><IconShare size={13} color="#4ade80"/> Share</>}
        </button>
      </div>
    </div>
  );
};

// ── PRODUCT CARD ─────────────────────────────────────────────
const ProductCard = ({product, isDark}) => {
  const cat = categoryMeta[product.category] || categoryMeta.other;
  return (
    <a href={product.affiliateUrl} target="_blank" rel="noopener noreferrer"
      onClick={()=>track("Affiliate Click", {product: product.name, brand: product.brand, category: product.category})}
      style={{textDecoration:"none", display:"block", background:isDark?"#1e2433":"#fff", borderRadius:12, padding:"18px 22px", border:`1.5px solid ${isDark?"#2a3347":"#e8e8e8"}`, transition:"all 0.2s"}}
      onMouseEnter={e=>{e.currentTarget.style.borderColor="#16a34a"; e.currentTarget.style.boxShadow="0 4px 24px rgba(22,163,74,0.12)"; e.currentTarget.style.transform="translateY(-1px)";}}
      onMouseLeave={e=>{e.currentTarget.style.borderColor=isDark?"#2a3347":"#e8e8e8"; e.currentTarget.style.boxShadow="none"; e.currentTarget.style.transform="none";}}>
      <div style={{display:"flex", gap:14, alignItems:"flex-start"}}>
        {/* Product image — real from Amazon or icon fallback */}
        <div style={{width:56, height:56, borderRadius:10, background:"#f0fdf4", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, overflow:"hidden"}}>
          {product.imageUrl
            ? <img src={product.imageUrl} alt={product.name} style={{width:"100%", height:"100%", objectFit:"cover"}}/>
            : <IconTag size={24} color="#16a34a"/>
          }
        </div>
        <div style={{flex:1, minWidth:0}}>
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, marginBottom:3}}>
            <div>
              <div style={{fontSize:11, color:"#888", textTransform:"uppercase", letterSpacing:"0.05em"}}>{product.brand}</div>
              <div style={{fontSize:15, fontWeight:700, color:isDark?"#f1f5f9":"#111", fontFamily:"'Outfit',sans-serif", lineHeight:1.3}}>{product.name}</div>
            </div>
            <div style={{display:"flex", flexDirection:"column", alignItems:"flex-end", gap:3, flexShrink:0}}>
              <div style={{background:scoreBg(product.score), color:scoreColor(product.score), fontSize:11, fontWeight:700, padding:"3px 9px", borderRadius:20}}>{product.score}/10</div>
              <div style={{background:cat.bg, color:cat.color, fontSize:10, fontWeight:600, padding:"2px 8px", borderRadius:20}}>{cat.label}</div>
            </div>
          </div>
          <div style={{fontSize:13, color:isDark?"#94a3b8":"#666", lineHeight:1.5}}>{product.material}{product.description ? ` — ${product.description}` : ""}</div>
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:10}}>
            <div style={{display:"flex", alignItems:"center", gap:6}}>
              <span style={{fontSize:15, fontWeight:700, color:"#16a34a", fontFamily:"'Outfit',sans-serif"}}>{product.price}</span>
              {product.source === "amazon" && <span style={{fontSize:10, color:"#f59e0b", fontWeight:600, background:"#fffbeb", padding:"2px 6px", borderRadius:10}}>Amazon</span>}
            </div>
            <span style={{display:"flex", alignItems:"center", gap:4, fontSize:13, color:"#16a34a", fontWeight:600}}>Shop now <IconArrow size={13} color="#16a34a"/></span>
          </div>
        </div>
      </div>
    </a>
  );
};

// ── MOST SEARCHED ─────────────────────────────────────────────
// ── ANALYTICS TRACK ──────────────────────────────────────────
function track(event, props = {}) {
  if (typeof window !== "undefined" && window.plausible) {
    window.plausible(event, { props });
  }
}

// ── LOADING STATE ─────────────────────────────────────────────
const LOADING_FACTS = [
  "The average person consumes about 5 grams of microplastics per week — the weight of a credit card.",
  "Microplastics have been found in human blood, lungs, breast milk and placentas.",
  "A single fleece jacket can release up to 700,000 microfibers in one wash cycle.",
  "93% of bottled water tested globally contains microplastic particles.",
  "Heating food in plastic containers can release millions of particles per litre.",
  "Babies ingest up to 10x more microplastics than adults relative to body weight.",
  "Non-stick pan coatings can begin flaking PTFE particles at everyday cooking temperatures.",
  "Microplastics have been detected in the air we breathe indoors and outdoors.",
];

const LoadingState = () => {
  const [step,    setStep]    = useState(0);
  const [progress,setProgress]= useState(0);
  const [factIdx, setFactIdx] = useState(()=>Math.floor(Math.random()*LOADING_FACTS.length));

  const steps = ["Identifying product…","Analyzing materials…","Checking plastic types…","Verifying score…"];

  useEffect(() => {
    const start = Date.now();
    const duration = 10000;
    const tick = () => {
      const elapsed = Date.now() - start;
      const raw = elapsed / duration;
      const p = Math.min(95, Math.round((1 - Math.pow(1 - raw, 2)) * 100));
      setProgress(p);
      if (p < 95) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    const stepTimers = [
      setTimeout(()=>setStep(1), 1800),
      setTimeout(()=>setStep(2), 4000),
      setTimeout(()=>setStep(3), 7000),
    ];
    const factTimer = setInterval(()=>setFactIdx(i=>(i+1)%LOADING_FACTS.length), 4000);
    return () => { stepTimers.forEach(clearTimeout); clearInterval(factTimer); };
  }, []);

  return (
    <div style={{margin:"24px auto 0", maxWidth:540, textAlign:"center"}}>
      <div style={{fontSize:22, fontWeight:700, color:"#fff", marginBottom:8, minHeight:34}}>
        {steps[step]}
      </div>
      <div style={{fontSize:14, color:"rgba(255,255,255,0.4)", marginBottom:24}}>
        This takes 10–15 seconds — we run two AI passes for accuracy
      </div>
      <div style={{display:"flex", justifyContent:"center", gap:10, marginBottom:20, flexWrap:"wrap"}}>
        {steps.map((s,i)=>(
          <div key={i} style={{display:"flex", alignItems:"center", gap:5, fontSize:13,
            color: i < step ? "#4ade80" : i === step ? "#fff" : "rgba(255,255,255,0.25)",
            fontWeight: i === step ? 600 : 400, transition:"all 0.3s"}}>
            {i < step
              ? <span style={{color:"#4ade80", fontSize:14}}>✓</span>
              : i === step
                ? <div style={{width:8,height:8,borderRadius:"50%",background:"#4ade80",animation:"pulse 1s ease-in-out infinite"}}/>
                : <div style={{width:8,height:8,borderRadius:"50%",background:"rgba(255,255,255,0.2)"}}/>
            }
            {s}
          </div>
        ))}
      </div>
      <div style={{height:6, background:"rgba(255,255,255,0.1)", borderRadius:99, marginBottom:24, overflow:"hidden"}}>
        <div style={{height:"100%", width:`${progress}%`, background:"linear-gradient(to right, #16a34a, #4ade80)", borderRadius:99, transition:"width 0.3s ease"}}/>
      </div>
      <div style={{background:"rgba(255,255,255,0.07)", borderRadius:14, padding:"20px 24px", border:"1px solid rgba(255,255,255,0.12)", textAlign:"left"}}>
        <div style={{fontSize:11, color:"#4ade80", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.12em", marginBottom:8}}>Did you know?</div>
        <div style={{fontSize:15, color:"rgba(255,255,255,0.85)", lineHeight:1.7}}>{LOADING_FACTS[factIdx]}</div>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(0.8)}}`}</style>
    </div>
  );
};

const MostSearched = ({onSelect, isDark, isMobile}) => {
  const surface = isDark?"#1e2433":"#fff";
  const border  = isDark?"#2a3347":"#eee";
  const text    = isDark?"#f1f5f9":"#111";
  const muted   = isDark?"#64748b":"#888";
  const px      = isMobile?"16px":"40px";
  return (
    <section style={{maxWidth:1100, margin:"0 auto 48px", padding:`0 ${px}`}}>
      <h2 style={{fontFamily:"'Outfit',sans-serif", fontSize:isMobile?20:24, fontWeight:700, color:text, textAlign:"center", marginBottom:8, letterSpacing:"-0.5px"}}>Most Searched Products</h2>
      <p style={{textAlign:"center", fontSize:14, color:muted, marginBottom:24}}>See how common products score — some results may surprise you</p>
      <div style={{display:"grid", gridTemplateColumns:isMobile?"repeat(2,1fr)":"repeat(4,1fr)", gap:isMobile?10:12}}>
        {MOST_SEARCHED.map(item=>{
          const cat = categoryMeta[item.category]||categoryMeta.other;
          return (
            <button key={item.label} onClick={()=>onSelect(item.label)}
              style={{background:surface, border:`1.5px solid ${border}`, borderRadius:12, padding:"16px", cursor:"pointer", textAlign:"left", transition:"all 0.15s"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="#16a34a"; e.currentTarget.style.transform="translateY(-2px)"; e.currentTarget.style.boxShadow="0 4px 16px rgba(22,163,74,0.1)";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=isDark?"#2a3347":"#eee"; e.currentTarget.style.transform="none"; e.currentTarget.style.boxShadow="none";}}>
              {item.score>=7&&<div style={{display:"flex", alignItems:"center", gap:2, fontSize:11, color:"#ef4444", fontWeight:600, marginBottom:6}}><IconFire size={12} color="#ef4444"/>Trending</div>}
              <div style={{fontSize:14, fontWeight:600, color:text, lineHeight:1.3, marginBottom:6}}>{item.label}</div>
              <div style={{background:cat.bg, color:cat.color, fontSize:10, fontWeight:600, padding:"2px 8px", borderRadius:20, display:"inline-block"}}>{cat.label}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
};

// ── HISTORY PAGE ─────────────────────────────────────────────
const HistoryPage = ({history, isDark, surface, border, text, muted, onSelect, onClear, onSearch, isMobile}) => {
  const avg = history.length ? Math.round(history.reduce((a,h)=>a+h.score,0)/history.length*10)/10 : 0;
  const highest = history.length ? history.reduce((a,h)=>h.score>a.score?h:a, history[0]) : null;

  const formatDate = (iso) => {
    if (!iso) return "Recently";
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs/60000);
    const diffHours = Math.floor(diffMs/3600000);
    const diffDays = Math.floor(diffMs/86400000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-US", {month:"short", day:"numeric"});
  };

  const grouped = history.reduce((acc, item) => {
    const key = item.scannedAt ? new Date(item.scannedAt).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"}) : "Recent";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  return (
    <div style={{maxWidth:800, margin:"0 auto", padding:isMobile?"20px 16px 60px":"48px 40px 80px"}}>
      <div style={{marginBottom:isMobile?24:40}}>
        <h1 style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:isMobile?24:32, color:text, margin:"0 0 8px", letterSpacing:"-0.5px"}}>My Scan History</h1>
        <p style={{fontSize:15, color:muted, margin:0}}>Every product you've scanned with Partiqule</p>
      </div>

      {history.length === 0 ? (
        <div style={{textAlign:"center", padding:"80px 0", color:muted}}>
          <div style={{fontSize:48, marginBottom:16}}>🔬</div>
          <div style={{fontFamily:"'Outfit',sans-serif", fontWeight:600, fontSize:18, color:text, marginBottom:8}}>No scans yet</div>
          <div style={{fontSize:14, marginBottom:24}}>Search for a product to get started</div>
          <button onClick={()=>onSearch("")} style={{padding:"10px 24px", borderRadius:8, border:"none", background:"#16a34a", color:"#fff", fontWeight:600, fontSize:14, cursor:"pointer"}}>Start Scanning</button>
        </div>
      ) : (
        <>
          {/* Stats cards */}
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:40}}>
            {/* Average score */}
            <div style={{background:surface, borderRadius:16, padding:"24px 28px", border:`1.5px solid ${border}`}}>
              <div style={{fontSize:12, color:muted, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:12}}>Average Danger Score</div>
              <div style={{display:"flex", alignItems:"flex-end", gap:8, marginBottom:10}}>
                <span style={{fontFamily:"'Outfit',sans-serif", fontWeight:800, fontSize:48, color:avg<=3?"#16a34a":avg<=6?"#d97706":"#dc2626", lineHeight:1}}>{avg}</span>
                <span style={{fontSize:14, color:muted, marginBottom:8}}>/10</span>
              </div>
              {/* Mini bar */}
              <div style={{height:6, borderRadius:99, background:"#e5e7eb", overflow:"hidden"}}>
                <div style={{height:"100%", width:`${(avg/10)*100}%`, background:avg<=3?"#16a34a":avg<=6?"#d97706":"#dc2626", borderRadius:99, transition:"width 1s ease"}}/>
              </div>
              <div style={{fontSize:12, color:muted, marginTop:8}}>Across {history.length} scan{history.length!==1?"s":""}</div>
            </div>

            {/* Highest risk */}
            {highest && (
              <div style={{background:surface, borderRadius:16, padding:"24px 28px", border:`1.5px solid ${border}`}}>
                <div style={{fontSize:12, color:muted, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:12}}>Highest Risk Found</div>
                <div style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:16, color:text, marginBottom:6, lineHeight:1.3}}>{highest.product_name}</div>
                <div style={{display:"inline-flex", alignItems:"center", gap:6, background:"#fee2e2", color:"#dc2626", padding:"4px 12px", borderRadius:20, fontSize:13, fontWeight:700}}>
                  {highest.score}/10 — {highest.score>=8?"Very High":highest.score>=6?"High":"Moderate"} Risk
                </div>
                <div style={{fontSize:12, color:muted, marginTop:10, cursor:"pointer", color:"#16a34a", fontWeight:600}} onClick={()=>onSelect(highest)}>
                  View result →
                </div>
              </div>
            )}
          </div>

          {/* Timeline */}
          <div>
            {Object.entries(grouped).map(([date, items]) => (
              <div key={date} style={{marginBottom:36}}>
                {/* Date label */}
                <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:16}}>
                  <div style={{fontSize:12, fontWeight:600, color:muted, textTransform:"uppercase", letterSpacing:"0.07em", whiteSpace:"nowrap"}}>{date}</div>
                  <div style={{flex:1, height:1, background:border}}/>
                </div>

                {/* Items */}
                <div style={{position:"relative", paddingLeft:28}}>
                  {/* Vertical line */}
                  <div style={{position:"absolute", left:9, top:8, bottom:8, width:2, background:border, borderRadius:2}}/>

                  {items.map((item, i) => (
                    <div key={i} style={{position:"relative", marginBottom:12, cursor:"pointer"}}
                      onClick={()=>onSelect(item)}>
                      {/* Timeline dot */}
                      <div style={{position:"absolute", left:-24, top:16, width:12, height:12, borderRadius:"50%", background:item.score<=3?"#16a34a":item.score<=6?"#d97706":"#dc2626", border:`2px solid ${surface}`, zIndex:1}}/>

                      {/* Card */}
                      <div style={{background:surface, borderRadius:12, padding:"16px 20px", border:`1.5px solid ${border}`, transition:"all 0.15s"}}
                        onMouseEnter={e=>{e.currentTarget.style.borderColor="#16a34a"; e.currentTarget.style.transform="translateX(3px)";}}
                        onMouseLeave={e=>{e.currentTarget.style.borderColor=border; e.currentTarget.style.transform="none";}}>
                        <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12}}>
                          <div style={{flex:1, minWidth:0}}>
                            <div style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:15, color:text, marginBottom:4, lineHeight:1.3}}>{item.product_name}</div>
                            <div style={{fontSize:12, color:muted}}>{item.summary?.slice(0,90)}{item.summary?.length>90?"…":""}</div>
                          </div>
                          <div style={{display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4, flexShrink:0}}>
                            <div style={{background:item.score<=3?"#f0fdf4":item.score<=6?"#fffbeb":"#fef2f2", color:item.score<=3?"#16a34a":item.score<=6?"#d97706":"#dc2626", fontWeight:800, fontSize:16, padding:"4px 12px", borderRadius:20, fontFamily:"'Outfit',sans-serif"}}>{item.score}/10</div>
                            <div style={{fontSize:11, color:muted}}>{formatDate(item.scannedAt)}</div>
                          </div>
                        </div>
                        {item.category && (
                          <div style={{marginTop:10, display:"flex", alignItems:"center", gap:6}}>
                            {(() => { const cat = {clothing:{label:"Clothing",color:"#6366f1",bg:"#eef2ff"},food_beverage:{label:"Food & Drink",color:"#0891b2",bg:"#ecfeff"},personal_care:{label:"Personal Care",color:"#db2777",bg:"#fdf2f8"},kitchen:{label:"Kitchen",color:"#d97706",bg:"#fffbeb"},baby:{label:"Baby & Kids",color:"#7c3aed",bg:"#f5f3ff"},other:{label:"General",color:"#6b7280",bg:"#f9fafb"}}[item.category]||{label:"General",color:"#6b7280",bg:"#f9fafb"}; return <span style={{background:cat.bg,color:cat.color,fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:20}}>{cat.label}</span>; })()}
                            <span style={{fontSize:11, color:"#16a34a", fontWeight:600}}>Tap to view alternatives →</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Clear button */}
          <div style={{textAlign:"center", marginTop:32}}>
            <button onClick={onClear} style={{padding:"10px 20px", borderRadius:8, border:`1px solid ${border}`, background:"none", color:muted, fontSize:13, cursor:"pointer"}}>
              Clear all history
            </button>
          </div>
        </>
      )}
    </div>
  );
};

const IconCamera = ({size=20,color="currentColor"}) => <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.65 0-3 1.35-3 3s1.35 3 3 3 3-1.35 3-3-1.35-3-3-3z"/></svg>;

// ── BARCODE SCANNER ───────────────────────────────────────────
const BarcodeScanner = ({onDetect, onClose}) => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [status, setStatus] = useState("starting"); // starting | scanning | error
  const [errorMsg, setErrorMsg] = useState("");
  const lastDetected = useRef("");
  const detectionCount = useRef(0);

  useEffect(() => {
    let animFrame;
    let canvas, ctx;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: {ideal:1280}, height: {ideal:720} }
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setStatus("scanning");
          scanLoop();
        }
      } catch(e) {
        setStatus("error");
        setErrorMsg(e.name === "NotAllowedError"
          ? "Camera access denied. Please allow camera in your browser settings."
          : "Could not access camera. Try pasting a URL or typing the product name.");
      }
    };

    const scanLoop = () => {
      if (!videoRef.current || videoRef.current.readyState < 2) {
        animFrame = requestAnimationFrame(scanLoop);
        return;
      }
      if (!canvas) {
        canvas = document.createElement("canvas");
        ctx = canvas.getContext("2d");
      }
      canvas.width  = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      ctx.drawImage(videoRef.current, 0, 0);

      // Use BarcodeDetector API if available (Chrome/Edge on Android)
      if ("BarcodeDetector" in window) {
        const detector = new window.BarcodeDetector({formats:["ean_13","ean_8","upc_a","upc_e","code_128","code_39","qr_code"]});
        detector.detect(canvas).then(codes => {
          if (codes.length > 0) {
            const val = codes[0].rawValue;
            if (val === lastDetected.current) {
              detectionCount.current++;
            } else {
              lastDetected.current = val;
              detectionCount.current = 1;
            }
            // Require 2 consistent reads to avoid false positives
            if (detectionCount.current >= 2) {
              onDetect(val);
              return;
            }
          }
          animFrame = requestAnimationFrame(scanLoop);
        }).catch(()=>{ animFrame = requestAnimationFrame(scanLoop); });
      } else {
        // Safari doesn't support BarcodeDetector — show friendly message
        setStatus("error");
        setErrorMsg("Barcode scanning isn't supported in Safari. Try Chrome on your phone, or just type the product name in the search bar instead.");
      }
    };

    startCamera();

    return () => {
      cancelAnimationFrame(animFrame);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  return (
    <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.92)", zIndex:1000, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center"}}>
      <div style={{width:"100%", maxWidth:480, padding:"0 16px"}}>

        {/* Header */}
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20}}>
          <div>
            <div style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:20, color:"#fff"}}>Scan Barcode</div>
            <div style={{fontSize:13, color:"#86efac", marginTop:2}}>Point camera at any product barcode</div>
          </div>
          <button onClick={onClose} style={{width:36, height:36, borderRadius:"50%", background:"rgba(255,255,255,0.1)", border:"none", color:"#fff", fontSize:20, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center"}}>×</button>
        </div>

        {/* Camera viewport */}
        <div style={{position:"relative", borderRadius:16, overflow:"hidden", background:"#000", aspectRatio:"4/3"}}>
          <video ref={videoRef} style={{width:"100%", height:"100%", objectFit:"cover"}} playsInline muted/>

          {/* Scanning overlay */}
          {status === "scanning" && (
            <>
              {/* Corner brackets */}
              {[{t:12,l:12,r:"auto",b:"auto"},{t:12,l:"auto",r:12,b:"auto"},{t:"auto",l:12,r:"auto",b:12},{t:"auto",l:"auto",r:12,b:12}].map((pos,i)=>(
                <div key={i} style={{position:"absolute", ...pos, width:28, height:28,
                  borderTop: (i<2)?"3px solid #4ade80":"none",
                  borderBottom:(i>=2)?"3px solid #4ade80":"none",
                  borderLeft: (i===0||i===2)?"3px solid #4ade80":"none",
                  borderRight:(i===1||i===3)?"3px solid #4ade80":"none",
                }}/>
              ))}
              {/* Scan line animation */}
              <div style={{position:"absolute", left:16, right:16, height:2, background:"linear-gradient(to right, transparent, #4ade80, transparent)", animation:"scanline 2s ease-in-out infinite"}}/>
              <style>{`@keyframes scanline { 0%,100%{top:20%} 50%{top:75%} }`}</style>
            </>
          )}

          {/* Status messages */}
          {status === "starting" && (
            <div style={{position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12}}>
              <div style={{width:32, height:32, border:"3px solid rgba(255,255,255,0.2)", borderTop:"3px solid #4ade80", borderRadius:"50%", animation:"spin 0.8s linear infinite"}}/>
              <div style={{color:"#86efac", fontSize:14}}>Starting camera…</div>
            </div>
          )}

          {status === "error" && (
            <div style={{position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", padding:24}}>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:32, marginBottom:12}}>📷</div>
                <div style={{color:"#fca5a5", fontSize:14, lineHeight:1.6}}>{errorMsg}</div>
              </div>
            </div>
          )}
        </div>

        {status === "scanning" && (
          <div style={{marginTop:16, textAlign:"center", fontSize:13, color:"rgba(255,255,255,0.5)"}}>
            Hold steady — auto-detects when barcode is in frame
          </div>
        )}

        {/* Manual entry fallback */}
        <div style={{marginTop:20, padding:"16px", background:"rgba(255,255,255,0.06)", borderRadius:12, border:"1px solid rgba(255,255,255,0.1)"}}>
          <div style={{fontSize:12, color:"rgba(255,255,255,0.5)", marginBottom:8}}>Or type barcode manually</div>
          <div style={{display:"flex", gap:8}}>
            <input
              placeholder="e.g. 012345678901"
              style={{flex:1, padding:"10px 14px", borderRadius:8, border:"1px solid rgba(255,255,255,0.2)", background:"rgba(255,255,255,0.08)", color:"#fff", fontSize:15, outline:"none", fontFamily:"monospace"}}
              onKeyDown={e=>{ if(e.key==="Enter" && e.target.value.trim()) { onDetect(e.target.value.trim()); }}}
            />
            <button
              onClick={e=>{ const inp = e.target.closest("div").querySelector("input"); if(inp.value.trim()) onDetect(inp.value.trim()); }}
              style={{padding:"10px 16px", borderRadius:8, border:"none", background:"#16a34a", color:"#fff", fontWeight:600, fontSize:14, cursor:"pointer"}}>
              Go
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const AboutPage = ({isDark, text, muted, surface, border, isMobile, onScan}) => {
  const stats = [
    {number:"205+", label:"Plastic-free alternatives in our database"},
    {number:"10",   label:"Plastic types we identify per product"},
    {number:"2",    label:"AI passes for every single score"},
    {number:"Free", label:"Always. No sign-up. No ads."},
  ];
  return (
    <div style={{maxWidth:860, margin:"0 auto", padding:isMobile?"24px 16px 60px":"48px 40px 80px"}}>

      {/* Hero */}
      <div style={{marginBottom:56}}>
        <div style={{fontSize:12, fontWeight:700, color:"#16a34a", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:14}}>About Partiqule</div>
        <h1 style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:isMobile?32:48, color:text, margin:"0 0 20px", letterSpacing:"-1px", lineHeight:1.15}}>
          Make plastic visible.
        </h1>
        <p style={{fontSize:isMobile?17:20, color:muted, lineHeight:1.8, maxWidth:640, margin:"0 0 28px"}}>
          Most people have no idea what's in the products they use every day. We built Partiqule to change that — one scan at a time.
        </p>
        <button onClick={()=>onScan()}
          style={{padding:"12px 28px", borderRadius:10, border:"none", background:"#052e16", color:"#4ade80", fontWeight:700, fontSize:15, cursor:"pointer"}}>
          Try a free scan →
        </button>
      </div>

      {/* Stats */}
      <div style={{display:"grid", gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)", gap:16, marginBottom:56}}>
        {stats.map((s,i)=>(
          <div key={i} style={{background:surface, borderRadius:14, padding:"24px 20px", border:`1.5px solid ${border}`, textAlign:"center"}}>
            <div style={{fontFamily:"'Outfit',sans-serif", fontWeight:800, fontSize:32, color:"#16a34a", marginBottom:6}}>{s.number}</div>
            <div style={{fontSize:13, color:muted, lineHeight:1.5}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Mission */}
      <div style={{marginBottom:48, paddingBottom:48, borderBottom:`1px solid ${border}`}}>
        <h2 style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:26, color:text, margin:"0 0 16px"}}>Our mission</h2>
        <p style={{fontSize:16, color:muted, lineHeight:1.85, marginBottom:16}}>
          The average person consumes around 5 grams of microplastics every week — the weight of a credit card. These particles have been found in human blood, lungs, breast milk, and placentas. Yet most consumer products carry no warning, no label, and no guidance on safer alternatives.
        </p>
        <p style={{fontSize:16, color:muted, lineHeight:1.85}}>
          Partiqule exists to give people the information they deserve. We believe that if you knew your tea bags were releasing 11 billion plastic particles per cup, you'd make a different choice. Our job is to make sure you know.
        </p>
      </div>

      {/* How it works */}
      <div style={{marginBottom:48, paddingBottom:48, borderBottom:`1px solid ${border}`}}>
        <h2 style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:26, color:text, margin:"0 0 16px"}}>How we score products</h2>
        <p style={{fontSize:16, color:muted, lineHeight:1.85, marginBottom:16}}>
          Every scan runs a two-pass AI analysis powered by Anthropic's Claude — a senior research scientist pass that identifies specific plastic polymers, followed by an auditor pass that verifies and weights the final score based on exposure frequency, route, and confidence.
        </p>
        <p style={{fontSize:16, color:muted, lineHeight:1.85, marginBottom:16}}>
          Scores are weighted by what matters most: how often you use it, whether it contacts your food or skin, and whether heat or friction release particles during normal use.
        </p>
        <div style={{background:isDark?"#1e2433":"#f8fafc", borderRadius:14, padding:"20px 24px", border:`1px solid ${border}`}}>
          <div style={{fontSize:13, fontWeight:700, color:text, marginBottom:14, textTransform:"uppercase", letterSpacing:"0.05em"}}>Three scores, one picture</div>
          {[
            {label:"🔬 Plastic Danger Score", desc:"The primary score. 1–10 based on plastic polymer content, leaching risk, heat exposure, and how plastic contacts your body. This is the hero number.", color:"#dc2626"},
            {label:"❤️ Health Concern Score", desc:"Secondary score for broader chemical concerns beyond plastics — artificial additives, endocrine disruptors, ultra-processing, pesticide residues, heavy metals.", color:"#7c3aed"},
            {label:"⚖️ Overall Score", desc:"Weighted combination: 70% Plastic Danger + 30% Health Concern. Gives you one number that reflects the full picture while keeping plastic front and centre.", color:"#16a34a"},
          ].map((s,i)=>(
            <div key={i} style={{display:"flex", gap:12, marginBottom: i<2?14:0}}>
              <div style={{width:3, borderRadius:99, background:s.color, flexShrink:0}}/>
              <div>
                <div style={{fontSize:14, fontWeight:700, color:text, marginBottom:3}}>{s.label}</div>
                <div style={{fontSize:13, color:muted, lineHeight:1.6}}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Values */}
      <div style={{marginBottom:48, paddingBottom:48, borderBottom:`1px solid ${border}`}}>
        <h2 style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:26, color:text, margin:"0 0 24px"}}>What we stand for</h2>
        <div style={{display:"flex", flexDirection:"column", gap:20}}>
          {[
            {title:"Radical transparency", body:"Our scoring methodology is open. We show you the breakdown — materials, packaging, usage, manufacturing — so you can judge for yourself, not just trust a number."},
            {title:"No conflicts of interest", body:"We recommend products because they're genuinely safer, not because we're paid to. Affiliate relationships are always clearly disclosed and never influence our scores."},
            {title:"Always free", body:"Knowledge about what you're putting in your body shouldn't cost money. Partiqule is free and requires no account."},
            {title:"Science first", body:"Every score is grounded in published research. We link our sources, cite our methodology, and update scores when the science changes."},
          ].map((v,i)=>(
            <div key={i} style={{display:"flex", gap:16, alignItems:"flex-start"}}>
              <div style={{width:8, height:8, borderRadius:"50%", background:"#16a34a", flexShrink:0, marginTop:8}}/>
              <div>
                <div style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:16, color:text, marginBottom:4}}>{v.title}</div>
                <div style={{fontSize:15, color:muted, lineHeight:1.7}}>{v.body}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* The impact */}
      <div style={{marginBottom:48, paddingBottom:48, borderBottom:`1px solid ${border}`}}>
        <h2 style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:26, color:text, margin:"0 0 16px"}}>The impact we're working toward</h2>
        <p style={{fontSize:16, color:muted, lineHeight:1.85, marginBottom:16}}>
          Every scan is a vote for a world where products are made to be safer. When enough people start checking before they buy, manufacturers notice. We've already seen this with microbeads — public pressure and consumer awareness led to bans across dozens of countries.
        </p>
        <p style={{fontSize:16, color:muted, lineHeight:1.85}}>
          We're not anti-plastic. We're pro-information. The goal is a world where every product that touches your food, your skin, or your family carries the same transparency as a nutrition label.
        </p>
      </div>

      {/* Contact */}
      <div>
        <h2 style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:26, color:text, margin:"0 0 16px"}}>Get in touch</h2>
        <p style={{fontSize:16, color:muted, lineHeight:1.85}}>
          Questions, partnerships, press, or just want to say hi — reach us at{" "}
          <a href="mailto:paul@partiqule.com" style={{color:"#16a34a", textDecoration:"none", fontWeight:600}}>paul@partiqule.com</a>.
          We read every email.
        </p>
      </div>
    </div>
  );
};

// ── TERMS OF SERVICE PAGE ─────────────────────────────────────
const PrivacyPage = ({isDark, text, muted, surface, border, isMobile}) => {
  const sections = [
    { title:"1. Overview", body:"Partiqule provides product information and microplastics exposure scores to help you make more informed decisions. By using Partiqule, you agree to these Terms." },
    { title:"2. Informational Use Only (Not Medical Advice)", body:"Partiqule's scores, analyses, and recommendations are provided for informational and educational purposes only. They are based on available research and modeling, and are not medical, health, or safety advice.\n\nYou should not rely on Partiqule as a substitute for professional medical or scientific guidance. Use of the platform is at your own risk." },
    { title:"3. How Our Scoring Works", body:"Our product scores are generated using a combination of AI analysis and research-based weighting factors, including material composition, usage patterns, and exposure pathways.\n\nWhile we aim for accuracy and transparency, we do not guarantee that any score, analysis, or recommendation is complete, accurate, or up to date." },
    { title:"4. No Warranties", body:"Partiqule is provided \"as is\" and \"as available.\" We make no warranties, express or implied, including but not limited to:\n\n• Accuracy or completeness of information\n• Fitness for a particular purpose\n• Reliability or availability of the service" },
    { title:"5. Limitation of Liability", body:"To the fullest extent permitted by law, Partiqule and its creators shall not be liable for any indirect, incidental, or consequential damages resulting from:\n\n• Your use of (or inability to use) the service\n• Decisions made based on Partiqule content\n• Third-party products or services" },
    { title:"6. Third-Party Services and Links", body:"Partiqule may link to third-party websites (including retailers). We are not responsible for their content, products, or privacy practices.\n\nOur scoring system is powered in part by AI services provided by Anthropic. By using Partiqule, you acknowledge that queries may be processed by third-party providers." },
    { title:"7. Affiliate Disclosure", body:"Some links on Partiqule are affiliate links. This means we may earn a commission if you make a purchase through them, at no additional cost to you.\n\nAffiliate relationships do not influence our scoring or recommendations." },
    { title:"8. Acceptable Use", body:"You agree not to:\n\n• Misuse or attempt to disrupt the service\n• Attempt to reverse engineer or manipulate scoring systems\n• Use the platform for unlawful purposes" },
    { title:"9. Intellectual Property", body:"All content, branding, and scoring methodology on Partiqule are owned by Partiqule and may not be copied, reproduced, or distributed without permission." },
    { title:"10. Changes to the Service", body:"We may update, modify, or discontinue parts of the service at any time without notice." },
    { title:"11. Changes to These Terms", body:"We may update these Terms from time to time. Continued use of Partiqule after changes means you accept the updated Terms." },
    { title:"12. Contact", body:"Questions about these Terms? Email paul@partiqule.com." },
  ];
  return (
    <div style={{maxWidth:720, margin:"0 auto", padding:isMobile?"24px 16px 60px":"48px 40px 80px"}}>
      <h1 style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:isMobile?24:32, color:text, margin:"0 0 8px"}}>Terms of Service</h1>
      <p style={{fontSize:14, color:muted, marginBottom:40}}>Last updated: March 2026</p>
      {sections.map((s, i) => (
        <div key={i} style={{marginBottom:32, paddingBottom:32, borderBottom: i < sections.length-1 ? `1px solid ${border}` : "none"}}>
          <h2 style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:18, color:text, margin:"0 0 12px"}}>{s.title}</h2>
          {s.body.split("\n\n").map((para, j) => (
            <p key={j} style={{fontSize:15, color:muted, lineHeight:1.8, margin:"0 0 12px", whiteSpace:"pre-line"}}>{para}</p>
          ))}
        </div>
      ))}
    </div>
  );
};

// ── RESPONSIVE HOOK ───────────────────────────────────────────
function useWindowWidth() {
  const [width, setWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const handle = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, []);
  return width;
}

// ── MAIN APP ──────────────────────────────────────────────────
export default function App() {
  const [query,       setQuery]      = useState("");
  const [searchMode,  setSearchMode] = useState("name");
  const [scanning,    setScanning]   = useState(false);
  const [result,      setResult]     = useState(null);
  const [loading,     setLoading]    = useState(false);
  const [error,       setError]      = useState(null);
  const [isDark,      setIsDark]     = useState(false);
  const [page,        setPage]       = useState("home");
  const [menuOpen,    setMenuOpen]   = useState(false);
  const [history,     setHistory]    = useState(()=>{try{return JSON.parse(localStorage.getItem("ps_history")||"[]");}catch{return [];}});

  const width   = useWindowWidth();
  const isMobile = width < 768;

  // Read slug from URL on first load
  useEffect(() => {
    const path   = window.location.pathname;
    const params = new URLSearchParams(window.location.search);

    // Admin page — secret key check
    if (path === "/admin") {
      if (params.get("key") === "RowenaRavenclaw2024!") {
        setPage("admin");
      } else {
        setPage("404");
      }
      return;
    }

    const scanMatch = path.match(/^\/scan\/(.+)$/);
    if (scanMatch) {
      const name = scanMatch[1].replace(/-/g," ").replace(/\b\w/g,c=>c.toUpperCase());
      setTimeout(()=>analyze(name), 100);
      return;
    }
    if (path === "/privacy") { setPage("privacy"); return; }
    if (path === "/about") { setPage("about"); return; }

    const known = ["/", "/science", "/history", "/privacy", "/about"];
    const isScanPath = path.startsWith("/scan/");
    if (!known.includes(path) && !isScanPath) setPage("404");
  }, []);

  // Update browser URL when result changes
  useEffect(() => {
    if (result?.product_name) {
      const slug = toSlug(result.product_name);
      window.history.pushState({}, "", `/scan/${slug}`);
      document.title = `${result.product_name} Microplastics Score — Partiqule`;
    } else if (!result) {
      window.history.pushState({}, "", "/");
      document.title = "Partiqule — Know What's In Your Products";
    }
  }, [result]);

  const saveToHistory = (item) => {
    setHistory(prev=>{
      const filtered = prev.filter(h=>h.product_name!==item.product_name);
      const updated  = [{...item, scannedAt: new Date().toISOString()}, ...filtered];
      try{localStorage.setItem("ps_history",JSON.stringify(updated));}catch{}
      return updated;
    });
  };

  const analyze = async (q=query) => {
    if (!q.trim()) return;
    setLoading(true); setError(null); setResult(null);
    track("Scan", { product: q.trim() });
    try {
      const res = await fetch(`${API_BASE}/analyze`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query:q.trim()})});
      if (!res.ok){const e=await res.json(); throw new Error(e.error||`Error ${res.status}`);}
      const data = await res.json();
      setResult(data); saveToHistory(data);
      track("Score Returned", { product: data.product_name, score: data.score, category: data.category });
    } catch(e){setError(e.message); track("Scan Error", { error: e.message });}
    setLoading(false);
  };

  const reset = () => {setResult(null); setError(null); setQuery(""); setPage("home"); setMenuOpen(false);};

  const bg      = isDark?"#131929":"#fafafa";
  const surface = isDark?"#1e2433":"#fff";
  const border  = isDark?"#2a3347":"#eee";
  const text    = isDark?"#f1f5f9":"#111";
  const muted   = isDark?"#64748b":"#888";
  const px      = isMobile ? "16px" : "40px";

  return (
    <div style={{minHeight:"100vh", background:bg, fontFamily:"system-ui,-apple-system,sans-serif", transition:"background 0.3s"}}>
      <style>{`*{box-sizing:border-box;}body{margin:0;}@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800&display=swap');@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}.fade-up{animation:fadeUp 0.4s ease forwards}@keyframes slideInUp{from{opacity:0;transform:translateY(40px) scale(0.96)}to{opacity:1;transform:translateY(0) scale(1)}}.score-reveal{animation:slideInUp 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards}@keyframes arcDraw{from{stroke-dashoffset:1000}to{stroke-dashoffset:0}}.arc-animate{animation:arcDraw 1.4s cubic-bezier(0.4,0,0.2,1) forwards}@keyframes popIn{from{opacity:0;transform:scale(0.7)}to{opacity:1;transform:scale(1)}}.pop-in{animation:popIn 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards}`}</style>

      {/* BARCODE SCANNER MODAL */}
      {scanning && (
        <BarcodeScanner
          onDetect={(barcode) => {
            setScanning(false);
            const q = `product with barcode ${barcode}`;
            setQuery(q);
            analyze(q);
          }}
          onClose={() => setScanning(false)}
        />
      )}

      {/* HEADER */}
      <header style={{background:surface, borderBottom:`1px solid ${border}`, position:"sticky", top:0, zIndex:100, transition:"background 0.3s"}}>
        <div style={{maxWidth:1100, margin:"0 auto", padding:`0 ${px}`, height:56, display:"flex", alignItems:"center", justifyContent:"space-between"}}>
          <div style={{display:"flex", alignItems:"center", gap:8, cursor:"pointer"}} onClick={reset}>
            <svg width="32" height="32" viewBox="0 0 44 44">
              <rect x="0" y="0" width="44" height="44" rx="11" fill="#052e16"/>
              <rect x="20" y="29" width="4" height="11" rx="1.5" fill="#4ade80"/>
              <ellipse cx="22" cy="21" rx="11" ry="10" fill="#4ade80"/>
              <ellipse cx="22" cy="14" rx="8" ry="7" fill="#86efac"/>
              <circle cx="37" cy="8"  r="2.5" fill="#4ade80" opacity="0.8"/>
              <circle cx="39" cy="24" r="1.8" fill="#4ade80" opacity="0.5"/>
              <circle cx="5"  cy="14" r="2"   fill="#86efac" opacity="0.6"/>
              <circle cx="4"  cy="28" r="1.5" fill="#4ade80" opacity="0.45"/>
              <circle cx="28" cy="4"  r="1.8" fill="#86efac" opacity="0.55"/>
              <circle cx="12" cy="4"  r="1.5" fill="#4ade80" opacity="0.4"/>
            </svg>
            <span style={{fontFamily:"'Outfit', sans-serif", fontWeight:700, fontSize:isMobile?18:22, color:text, letterSpacing:"-0.3px"}}>Partiqule</span>
          </div>

          {isMobile ? (
            /* Mobile — icon row */
            <div style={{display:"flex", alignItems:"center", gap:8}}>
              <span onClick={()=>{setPage("history"); setResult(null); setMenuOpen(false);}} style={{position:"relative", cursor:"pointer", padding:8}}>
                <IconHistory size={20} color={page==="history"?"#16a34a":muted}/>
                {history.length>0&&<span style={{position:"absolute", top:4, right:4, width:8, height:8, borderRadius:"50%", background:"#16a34a"}}/>}
              </span>
              <button onClick={()=>setIsDark(d=>!d)} style={{width:36, height:36, borderRadius:8, border:`1px solid ${border}`, background:"none", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer"}}>
                {isDark?<IconSun size={16} color="#f59e0b"/>:<IconMoon size={16} color="#6b7280"/>}
              </button>
              <button onClick={()=>setMenuOpen(o=>!o)} style={{width:36, height:36, borderRadius:8, border:`1px solid ${border}`, background:"none", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:4, cursor:"pointer"}}>
                <div style={{width:16, height:2, background:text, borderRadius:2}}/>
                <div style={{width:16, height:2, background:text, borderRadius:2}}/>
                <div style={{width:16, height:2, background:text, borderRadius:2}}/>
              </button>
            </div>
          ) : (
            /* Desktop nav */
            <nav style={{display:"flex", gap:24, alignItems:"center"}}>

              <span onClick={()=>{setPage("about"); setResult(null);}} style={{fontSize:14, color:page==="about"?"#16a34a":muted, cursor:"pointer", fontWeight:page==="about"?600:400}}>About</span>
              <span onClick={()=>{setPage("science"); setResult(null);}} style={{fontSize:14, color:page==="science"?"#16a34a":muted, cursor:"pointer", fontWeight:page==="science"?600:400}}>The Science</span>
              <span onClick={()=>{setPage("history"); setResult(null);}} style={{fontSize:14, color:page==="history"?"#16a34a":muted, cursor:"pointer", fontWeight:page==="history"?600:400}}>My Scans {history.length>0&&<span style={{background:"#052e16",color:"#4ade80",fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:10,marginLeft:4}}>{history.length}</span>}</span>
              <button onClick={()=>setIsDark(d=>!d)} style={{width:36, height:36, borderRadius:8, border:`1px solid ${border}`, background:"none", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer"}}>
                {isDark?<IconSun size={17} color="#f59e0b"/>:<IconMoon size={17} color="#6b7280"/>}
              </button>
              <button onClick={reset} style={{padding:"8px 18px", borderRadius:8, border:"none", background:"#16a34a", color:"#fff", fontWeight:600, fontSize:14, cursor:"pointer"}}>New Search</button>
            </nav>
          )}
        </div>

        {/* Mobile dropdown menu */}
        {isMobile && menuOpen && (
          <div style={{background:surface, borderTop:`1px solid ${border}`, padding:"12px 16px", display:"flex", flexDirection:"column", gap:4}}>
            {[
              {label:"About",              pg:"about"},
              {label:"The Science",        pg:"science"},
              {label:"My Scans",           pg:"history"},
            ].map(item=>(
              <button key={item.pg} onClick={()=>{setPage(item.pg); setResult(null); setMenuOpen(false);}}
                style={{padding:"12px 16px", borderRadius:8, border:"none", background:page===item.pg?"#f0fdf4":"none", color:page===item.pg?"#16a34a":text, fontSize:15, fontWeight:page===item.pg?600:400, cursor:"pointer", textAlign:"left"}}>
                {item.label}
              </button>
            ))}
            <button onClick={()=>{reset(); setMenuOpen(false);}} style={{padding:"12px 16px", borderRadius:8, border:"none", background:"#16a34a", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer", marginTop:4}}>
              New Search
            </button>
          </div>
        )}
      </header>

      {page === "admin" ? (
        <AdminPage isDark={isDark} surface={surface} border={border} text={text} muted={muted}/>
      ) : page === "privacy" ? (
        <PrivacyPage isDark={isDark} text={text} muted={muted} surface={surface} border={border} isMobile={isMobile}/>
      ) : page === "about" ? (
        <AboutPage isDark={isDark} text={text} muted={muted} surface={surface} border={border} isMobile={isMobile} onScan={reset}/>
      ) : page === "404" ? (
        <div style={{maxWidth:600, margin:"0 auto", padding:"100px 40px", textAlign:"center"}}>
          <div style={{fontSize:64, marginBottom:16}}>🔬</div>
          <h1 style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:32, color:text, margin:"0 0 12px"}}>Page not found</h1>
          <p style={{fontSize:16, color:muted, margin:"0 0 32px", lineHeight:1.6}}>That page doesn't exist — but we can scan any product for microplastics risk.</p>
          <button onClick={reset} style={{padding:"12px 28px", borderRadius:10, border:"none", background:"#052e16", color:"#4ade80", fontWeight:700, fontSize:15, cursor:"pointer"}}>
            Go to Partiqule →
          </button>
        </div>
      ) : page === "history" ? (
        <HistoryPage history={history} isDark={isDark} surface={surface} border={border} text={text} muted={muted}
          isMobile={isMobile}
          onSelect={(item)=>{setResult(item); setPage("home");}}
          onClear={()=>{setHistory([]); try{localStorage.removeItem("ps_history")}catch{}}}
          onSearch={(q)=>{setPage("home"); setQuery(q); analyze(q);}}
        />
      ) : page === "science" ? (
        <div style={{maxWidth:1100, margin:"0 auto", padding:isMobile?"24px 16px 60px":"48px 40px 80px"}}>
          <div style={{marginBottom:32}}>
            <h1 style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:isMobile?24:32, color:text, margin:"0 0 8px", letterSpacing:"-0.5px"}}>The Science</h1>
            <p style={{fontSize:15, color:muted, margin:0}}>What microplastics are, where they come from, and why they matter</p>
          </div>
          <EducationSection isDark={isDark} isMobile={isMobile}/>
        </div>
      ) : !result ? (
        <>
          {/* HERO */}
          <section style={{background:"#052e16", borderBottom:"1px solid #14532d", padding:isMobile?"60px 20px 52px":"110px 40px 100px", position:"relative", overflow:"hidden"}}>
            {/* Floating particles */}
            <style>{`
              @keyframes float1 { 0%,100%{transform:translateY(0) translateX(0)} 50%{transform:translateY(-18px) translateX(8px)} }
              @keyframes float2 { 0%,100%{transform:translateY(0) translateX(0)} 50%{transform:translateY(-12px) translateX(-10px)} }
              @keyframes float3 { 0%,100%{transform:translateY(0) translateX(0)} 50%{transform:translateY(-20px) translateX(6px)} }
              @keyframes float4 { 0%,100%{transform:translateY(0) translateX(0)} 50%{transform:translateY(-8px) translateX(-14px)} }
              @keyframes float5 { 0%,100%{transform:translateY(0) translateX(0)} 50%{transform:translateY(-15px) translateX(12px)} }
            `}</style>
            {/* Particle dots scattered across the hero */}
            {[
              {s:10, x:"8%",  y:"20%", a:0.25, anim:"float1", dur:"6s"},
              {s:6,  x:"15%", y:"65%", a:0.18, anim:"float2", dur:"8s"},
              {s:14, x:"88%", y:"15%", a:0.2,  anim:"float3", dur:"7s"},
              {s:8,  x:"92%", y:"70%", a:0.15, anim:"float1", dur:"9s"},
              {s:5,  x:"75%", y:"30%", a:0.3,  anim:"float4", dur:"5s"},
              {s:12, x:"25%", y:"82%", a:0.15, anim:"float5", dur:"10s"},
              {s:7,  x:"60%", y:"78%", a:0.2,  anim:"float2", dur:"7.5s"},
              {s:9,  x:"45%", y:"12%", a:0.18, anim:"float3", dur:"6.5s"},
              {s:5,  x:"82%", y:"50%", a:0.25, anim:"float1", dur:"8.5s"},
              {s:11, x:"5%",  y:"48%", a:0.15, anim:"float4", dur:"9.5s"},
              {s:4,  x:"38%", y:"88%", a:0.2,  anim:"float5", dur:"7s"},
              {s:8,  x:"70%", y:"8%",  a:0.22, anim:"float2", dur:"6s"},
              {s:6,  x:"52%", y:"92%", a:0.15, anim:"float3", dur:"11s"},
              {s:10, x:"20%", y:"35%", a:0.12, anim:"float1", dur:"8s"},
              {s:5,  x:"95%", y:"38%", a:0.2,  anim:"float5", dur:"7.5s"},
            ].map((p,i)=>(
              <div key={i} style={{
                position:"absolute", left:p.x, top:p.y,
                width:p.s, height:p.s, borderRadius:"50%",
                background:"white", opacity:p.a,
                animation:`${p.anim} ${p.dur} ease-in-out infinite`,
                animationDelay:`${i*0.4}s`,
                pointerEvents:"none"
              }}/>
            ))}
            <div style={{maxWidth:720, margin:"0 auto", textAlign:"center", position:"relative", zIndex:1}}>
              <div style={{display:"inline-flex", alignItems:"center", gap:6, background:"rgba(255,255,255,0.1)", color:"#86efac", fontSize:13, fontWeight:600, padding:"5px 14px", borderRadius:20, marginBottom:24, textTransform:"uppercase", letterSpacing:"0.05em", backdropFilter:"blur(4px)"}}>
                <IconShield size={13} color="#86efac"/> AI-Powered Risk Analysis
              </div>
              <h1 style={{fontFamily:"'Outfit',sans-serif", fontSize:isMobile?34:52, fontWeight:700, color:"#ffffff", margin:"0 0 16px", letterSpacing:isMobile?"-1px":"-1.5px", lineHeight:1.15}}>
                Scan anything.<br/>Know everything.
              </h1>
              <p style={{fontSize:isMobile?15:18, color:"#86efac", margin:"0 0 28px", lineHeight:1.7}}>
                {isMobile ? "Get the full health picture on any product, free." : "Scan any product to get its danger score, health impact, and plastic-free alternatives — instantly."}
              </p>

              {/* Mobile barcode button — hide on Safari which doesn't support BarcodeDetector */}
              {isMobile && "BarcodeDetector" in window && (
                <div style={{display:"flex", justifyContent:"center", marginBottom:16}}>
                  <button onClick={()=>setScanning(true)}
                    style={{padding:"6px 16px", borderRadius:20, border:"1px solid rgba(255,255,255,0.2)", background:"rgba(255,255,255,0.08)", color:"rgba(255,255,255,0.6)", fontSize:13, cursor:"pointer", transition:"all 0.15s", display:"flex", alignItems:"center", gap:6}}
                    onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.15)"; e.currentTarget.style.borderColor="rgba(255,255,255,0.5)";}}
                    onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.08)"; e.currentTarget.style.borderColor="rgba(255,255,255,0.2)";}}>
                    <IconCamera size={13} color="rgba(255,255,255,0.7)"/> Scan Barcode
                  </button>
                </div>
              )}

              <div style={{display:"flex", maxWidth:580, margin:"0 auto 16px", background:"white", borderRadius:14, border:"none", overflow:"hidden", boxShadow:"0 8px 32px rgba(0,0,0,0.3)"}}>
                <div style={{display:"flex", alignItems:"center", paddingLeft:16, flexShrink:0}}><IconSearch size={18} color="#bbb"/></div>
                <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&analyze()}
                  placeholder="Search any product…"
                  style={{flex:1, padding:"14px 12px", border:"none", outline:"none", fontSize:16, background:"transparent", color:"#111"}}/>
                <button onClick={()=>analyze()} disabled={!query.trim()||loading}
                  style={{padding:"14px 28px", border:"none", background:query.trim()?"#052e16":"#e0e0e0", color:query.trim()?"#4ade80":"#999", fontWeight:700, fontSize:15, cursor:query.trim()?"pointer":"default", whiteSpace:"nowrap", transition:"background 0.15s", flexShrink:0}}>
                  {loading?"…":"Scan"}
                </button>
              </div>

              {/* Social proof — honest */}
              <div style={{display:"flex", justifyContent:"center", alignItems:"center", gap:16, marginBottom:20}}>
                <div style={{display:"flex", alignItems:"center", gap:6, fontSize:13, color:"rgba(255,255,255,0.5)"}}>
                  <div style={{width:8, height:8, borderRadius:"50%", background:"#4ade80"}}/>
                  Free · No sign-up
                </div>
                <div style={{width:1, height:12, background:"rgba(255,255,255,0.2)"}}/>
                <div style={{fontSize:13, color:"rgba(255,255,255,0.5)"}}>AI-powered · Two-pass verified</div>
              </div>

              {!loading && <>
                <div style={{marginBottom:8, fontSize:12, color:"#4ade80", opacity:0.8}}>Try these — the scores might shock you:</div>
                <div style={{display:"flex", flexWrap:"wrap", gap:8, justifyContent:"center"}}>
                  {EXAMPLES.map(ex=>(
                    <button key={ex.label} onClick={()=>{setQuery(ex.label); analyze(ex.label);}}
                      style={{padding:"7px 14px", borderRadius:20, border:"1px solid rgba(255,255,255,0.2)", background:"rgba(255,255,255,0.08)", color:"#d1fae5", fontSize:13, cursor:"pointer", transition:"all 0.15s", display:"flex", alignItems:"center", gap:6}}
                      onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.15)"; e.currentTarget.style.borderColor="rgba(255,255,255,0.4)";}}
                      onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.08)"; e.currentTarget.style.borderColor="rgba(255,255,255,0.2)";}}>
                      <IconFire size={12} color="#fca5a5"/>{ex.label}
                      <span style={{fontSize:11, color:"#fca5a5", fontWeight:700}}>{ex.hint}</span>
                    </button>
                  ))}
                </div>
              </>}
              {loading && <div style={{marginTop:8}}><LoadingState/></div>}
              {error&&<div style={{marginTop:20,padding:"14px 20px",background:"rgba(239,68,68,0.15)",borderRadius:10,color:"#fca5a5",fontSize:14,border:"1px solid rgba(239,68,68,0.3)"}}>{error}</div>}
            </div>
          </section>

          <div style={{paddingTop:isMobile?32:56}}>
            {/* RECENTLY VIEWED CAROUSEL */}
            {history.length > 0 && (
              <div style={{maxWidth:1100, margin:"0 auto 40px", padding:`0 ${isMobile?"16px":"40px"}`}}>
                <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14}}>
                  <h2 style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:isMobile?16:18, color:text, margin:0}}>Recently viewed</h2>
                  <span onClick={()=>{setPage("history"); setResult(null);}} style={{fontSize:13, color:"#16a34a", fontWeight:600, cursor:"pointer"}}>See all →</span>
                </div>
                <div style={{display:"flex", gap:12, overflowX:"auto", paddingBottom:8, scrollbarWidth:"none", msOverflowStyle:"none"}}>
                  <style>{`.carousel::-webkit-scrollbar{display:none}`}</style>
                  <div className="carousel" style={{display:"flex", gap:12, overflowX:"auto", paddingBottom:8, width:"100%"}}>
                    {history.slice(0,8).map((item,i)=>(
                      <button key={i} onClick={()=>setResult(item)}
                        style={{flexShrink:0, width:isMobile?140:160, background:surface, borderRadius:12, padding:"14px", border:`1.5px solid ${border}`, cursor:"pointer", textAlign:"left", transition:"all 0.15s"}}
                        onMouseEnter={e=>{e.currentTarget.style.borderColor="#16a34a"; e.currentTarget.style.transform="translateY(-2px)";}}
                        onMouseLeave={e=>{e.currentTarget.style.borderColor=border; e.currentTarget.style.transform="none";}}>
                        {/* Score circle */}
                        <div style={{width:40, height:40, borderRadius:"50%", background:scoreBg(item.score), display:"flex", alignItems:"center", justifyContent:"center", marginBottom:10}}>
                          <span style={{fontFamily:"'Outfit',sans-serif", fontWeight:800, fontSize:16, color:scoreColor(item.score)}}>{item.score}</span>
                        </div>
                        <div style={{fontSize:13, fontWeight:600, color:text, lineHeight:1.3, marginBottom:4, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical"}}>
                          {item.product_name}
                        </div>
                        <div style={{fontSize:11, color:scoreColor(item.score), fontWeight:600}}>{scoreLabel(item.score)}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <MostSearched onSelect={(label)=>{setQuery(label); analyze(label);}} isDark={isDark} isMobile={isMobile}/>
          </div>
        </>
      ) : (
        /* RESULTS */
        <div style={{maxWidth:1100, margin:"0 auto", padding:isMobile?"16px 16px 60px":`40px 40px 80px`}}>
          <button onClick={reset} style={{background:"none",border:"none",color:muted,cursor:"pointer",fontSize:14,marginBottom:24,padding:0,display:"flex",alignItems:"center",gap:6}}>← Search again</button>
          <div style={{display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:isMobile?16:28, alignItems:"start"}}>

            {/* LEFT */}
            <div style={{display:"flex", flexDirection:"column", gap:20}}>
              <div className="score-reveal" style={{background:isDark?"#1e2433":scoreCardBg(result.overall_score||result.score), borderRadius:20, padding:isMobile?"24px 20px":"40px 36px", border:`1.5px solid ${isDark?"#2a3347":scoreBg(result.overall_score||result.score)}`, textAlign:"center"}}>
                {/* Header row */}
                <div style={{display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginBottom:10, flexWrap:"wrap"}}>
                  <div style={{fontSize:11,color:"#aaa",textTransform:"uppercase",letterSpacing:"0.1em"}}>
                    {result.overall_score ? "Overall Score" : "Danger Score"} <span style={{fontSize:10, opacity:0.6}}>(10 = most dangerous)</span>
                  </div>
                  {result.cached && <div style={{fontSize:10, fontWeight:600, color:"#16a34a", background:"#f0fdf4", padding:"2px 8px", borderRadius:10}}>✓ Verified</div>}
                  {result.confidence && (
                    <div style={{fontSize:10, fontWeight:600, padding:"2px 8px", borderRadius:10,
                      background:result.confidence==="high"?"#f0fdf4":result.confidence==="medium"?"#fffbeb":"#fef2f2",
                      color:result.confidence==="high"?"#16a34a":result.confidence==="medium"?"#d97706":"#dc2626"}}>
                      {result.confidence==="high"?"High confidence":result.confidence==="medium"?"Medium confidence":"Low confidence"}
                    </div>
                  )}
                </div>

                <h2 style={{fontFamily:"'Outfit',sans-serif",fontSize:isMobile?22:28,fontWeight:700,color:text,margin:"0 0 24px",letterSpacing:"-0.5px",wordBreak:"break-word"}}>{result.product_name?.length > 60 ? result.product_name.slice(0,57)+"…" : result.product_name}</h2>

                {/* Hero score — overall if available, else plastic */}
                <div style={{display:"flex",justifyContent:"center",marginBottom:4}}>
                  <ScoreArc score={result.overall_score||result.score}/>
                </div>
                <RiskBar score={result.overall_score||result.score}/>

                {/* Hero label */}
                {result.overall_score ? (
                  <div style={{marginBottom:16}}>
                    <div style={{display:"inline-block",background:scoreBg(result.overall_score),color:scoreColor(result.overall_score),padding:"7px 22px",borderRadius:20,fontSize:15,fontWeight:700,margin:"18px 0 4px"}}>
                      {scoreLabel(result.overall_score)} Overall
                    </div>
                    <div style={{fontSize:11,color:muted,marginTop:4}}>70% plastic danger · 30% health concern</div>
                  </div>
                ) : (
                  <div style={{display:"inline-block",background:scoreBg(result.score),color:scoreColor(result.score),padding:"7px 22px",borderRadius:20,fontSize:15,fontWeight:700,margin:"18px 0 16px"}}>{scoreLabel(result.score)} Danger</div>
                )}

                {/* Plastic score dropdown */}
                <PlasticScoreDropdown result={result} isDark={isDark} muted={muted}/>

                {/* Health score dropdown */}
                {result.health_score && (
                  <HealthScoreDropdown result={result} isDark={isDark} muted={muted}/>
                )}

                {/* Peer comparison */}
                {result.peer_comparison && (
                  <div style={{fontSize:12, color:muted, marginBottom:16, fontStyle:"italic"}}>{result.peer_comparison}</div>
                )}

                {/* Identified plastics */}
                {result.identified_plastics?.length > 0 && (
                  <div style={{marginBottom:16}}>
                    <div style={{fontSize:11, color:muted, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8}}>Plastics detected</div>
                    <div style={{display:"flex", flexWrap:"wrap", gap:6, justifyContent:"center"}}>
                      {result.identified_plastics.map((p,i)=>(
                        <span key={i} className="pop-in" style={{animationDelay:`${0.6 + i*0.1}s`, opacity:0, fontSize:12, fontWeight:700, padding:"4px 12px", borderRadius:20,
                          background:isDark?"#2a1a1a":"#fef2f2", color:"#dc2626", border:"1.5px solid #fecaca"}}>
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Exposure badges */}
                {(result.exposure_frequency || result.exposure_type) && (
                  <div style={{display:"flex", gap:6, justifyContent:"center", marginBottom:14, flexWrap:"wrap"}}>
                    {result.exposure_frequency && result.exposure_frequency !== "unknown" && (
                      <div style={{fontSize:11, fontWeight:600, padding:"3px 10px", borderRadius:20, background:"#eff6ff", color:"#1d4ed8"}}>
                        {result.exposure_frequency === "daily" ? "📅 Daily use" :
                         result.exposure_frequency === "weekly" ? "📅 Weekly use" :
                         result.exposure_frequency === "occasional" ? "📅 Occasional" : "📅 Rare use"}
                      </div>
                    )}
                    {result.exposure_type && result.exposure_type !== "unknown" && (
                      <div style={{fontSize:11, fontWeight:600, padding:"3px 10px", borderRadius:20, background:"#fdf4ff", color:"#7e22ce"}}>
                        {result.exposure_type === "ingestion" ? "⚠️ Ingestion risk" :
                         result.exposure_type === "skin_contact" ? "🖐 Skin contact" :
                         result.exposure_type === "inhalation" ? "💨 Inhalation risk" : "⚠️ Mixed exposure"}
                      </div>
                    )}
                  </div>
                )}

                <p style={{fontSize:15,color:isDark?"#94a3b8":"#555",lineHeight:1.75,margin:0,textAlign:"left"}}>{result.summary}</p>

                {/* Break-even stat */}
                {result.break_even && (
                  <div style={{marginTop:16, background:isDark?"#1a2a1a":"#f0fdf4", borderRadius:12, padding:"14px 18px", border:`1px solid ${isDark?"#1e3a1e":"#bbf7d0"}`, textAlign:"left"}}>
                    <div style={{fontSize:11, color:"#16a34a", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4}}>♻️ Sustainability Break-Even</div>
                    <div style={{fontSize:14, color:isDark?"#86efac":"#15803d", fontWeight:600, marginBottom:4}}>
                      ~{result.break_even.uses} uses to offset with {result.break_even.alternative_name}
                    </div>
                    <div style={{fontSize:12, color:isDark?"#4ade80":"#166534", opacity:0.8, lineHeight:1.5}}>{result.break_even.note}</div>
                    <div style={{fontSize:10, color:isDark?"#166534":"#86efac", marginTop:6, opacity:0.6}}>{result.break_even.source}</div>
                  </div>
                )}

                <SplitView result={result} isDark={isDark}/>
                <ShareBadge result={result}/>
              </div>

              {/* SCORE BREAKDOWN — score_reasoning lives here now */}
              {result.breakdown && (
                <div className="fade-up" style={{background:surface, borderRadius:16, padding:"24px 28px", border:`1.5px solid ${border}`}}>
                  <h3 style={{fontFamily:"'Outfit',sans-serif",fontWeight:700,fontSize:16,color:text,margin:"0 0 4px"}}>Why this score?</h3>
                  {result.score_reasoning && <p style={{fontSize:12,color:muted,margin:"0 0 16px",lineHeight:1.5,fontStyle:"italic"}}>{result.score_reasoning}</p>}
                  {Object.entries(result.breakdown).map(([key, val])=>{
                    const labels = {materials:"Materials",packaging:"Packaging",usage:"Usage & Exposure",manufacturing:"Manufacturing"};
                    const icons  = {materials:"🧵",packaging:"📦",usage:"🤲",manufacturing:"🏭"};
                    return (
                      <div key={key} style={{marginBottom:16}}>
                        <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6}}>
                          <div style={{display:"flex", alignItems:"center", gap:7, fontSize:13, fontWeight:600, color:text}}>
                            <span style={{fontSize:15}}>{icons[key]}</span>{labels[key]}
                          </div>
                          <div style={{display:"flex", alignItems:"center", gap:8}}>
                            <div style={{width:80, height:6, borderRadius:99, background:isDark?"#2a3347":"#e5e7eb", overflow:"hidden"}}>
                              <div style={{height:"100%", width:`${(val.score/10)*100}%`, background:scoreColor(val.score), borderRadius:99, transition:"width 1s ease"}}/>
                            </div>
                            <span style={{fontSize:13, fontWeight:700, color:scoreColor(val.score), minWidth:20}}>{val.score}</span>
                          </div>
                        </div>
                        <div style={{fontSize:12, color:muted, lineHeight:1.5, paddingLeft:22}}>{val.label}</div>
                      </div>
                    );
                  })}
                  {/* Confidence note lives here too */}
                  {result.confidence_note && result.confidence !== "high" && (
                    <div style={{fontSize:11, color:muted, background:isDark?"#1a2030":"#f8fafc", padding:"8px 12px", borderRadius:8, marginTop:8}}>
                      💡 {result.confidence_note}
                    </div>
                  )}
                </div>
              )}

              {result.concerns?.length>0&&(
                <div className="fade-up" style={{background:isDark?"#1e2433":"#fffbeb", borderRadius:16, padding:"28px 32px", border:`1.5px solid ${isDark?"#2a3347":"#fde68a"}`, borderLeft:"4px solid #d97706"}}>
                  <h3 style={{fontFamily:"'Outfit',sans-serif",fontWeight:700,fontSize:17,color:text,margin:"0 0 18px",display:"flex",alignItems:"center",gap:8}}><IconWarning size={18} color="#d97706"/> Key Concerns</h3>
                  {result.concerns.map((c,i)=>(
                    <div key={i} style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:14,fontSize:14,color:isDark?"#94a3b8":"#444",lineHeight:1.6}}>
                      <div style={{width:22,height:22,borderRadius:"50%",background:"#fef2f2",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}><IconWarning size={12} color="#dc2626"/></div>
                      {c}
                    </div>
                  ))}
                </div>
              )}

              {/* SOURCE CITATIONS */}
              <SourceCitations category={result.category} isDark={isDark}/>

              {/* SCIENCE LINK */}
              <div style={{background:isDark?"#1e1f3a":"#eef2ff", borderRadius:12, padding:"16px 20px", display:"flex", alignItems:"center", justifyContent:"space-between"}}>
                <div>
                  <div style={{fontSize:13, fontWeight:600, color:isDark?"#a5b4fc":"#4f46e5", marginBottom:2}}>Want to understand why this matters?</div>
                  <div style={{fontSize:12, color:muted}}>Read the science behind microplastics and human health</div>
                </div>
                <button onClick={()=>{setPage("science"); setResult(null);}} style={{padding:"8px 16px", borderRadius:8, border:"none", background:isDark?"#3730a3":"#4f46e5", color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap", flexShrink:0}}>
                  The Science →
                </button>
              </div>
            </div>

            {/* RIGHT */}
            <div style={{display:"flex", flexDirection:"column", gap:20}}>
              <div className="fade-up">
                <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:8}}>
                  <h3 id="safer-alternatives" style={{fontFamily:"'Outfit',sans-serif",fontWeight:700,fontSize:20,color:text,margin:0,display:"flex",alignItems:"center",gap:8}}><IconCheck size={20} color="#16a34a"/> Safer Alternatives</h3>
                  {result.alternatives?.length > 0 && (
                    <div style={{fontSize:11, color:muted, background:isDark?"#1e2433":"#f9fafb", padding:"4px 10px", borderRadius:20, border:`1px solid ${border}`}}>
                      #ad · affiliate links
                    </div>
                  )}
                </div>

                {/* Affiliate alternatives from static DB */}
                {result.alternatives?.length > 0 && (
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {result.alternatives.map(p=><ProductCard key={p.id} product={p} isDark={isDark}/>)}
                  </div>
                )}

                {/* AI-generated alternatives — no affiliate link */}
                {result.ai_alternatives?.length > 0 && (
                  <div style={{marginTop: result.alternatives?.length > 0 ? 16 : 0}}>
                    {result.alternatives?.length > 0 && (
                      <div style={{fontSize:12, color:muted, textAlign:"center", marginBottom:12}}>More suggestions from our AI</div>
                    )}
                    <div style={{display:"flex", flexDirection:"column", gap:8}}>
                      {result.ai_alternatives.map((alt, i) => (
                        <div key={i} style={{background:isDark?"#1a2a1e":"#f0fdf4", borderRadius:12, padding:"16px 18px", border:`1.5px solid ${isDark?"#1e3a22":"#bbf7d0"}`}}>
                          <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8, marginBottom:6}}>
                            <div style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:15, color:text, lineHeight:1.3}}>{alt.name}</div>
                            <div style={{background:scoreBg(alt.estimated_score), color:scoreColor(alt.estimated_score), fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:20, flexShrink:0}}>{alt.estimated_score}/10</div>
                          </div>
                          <div style={{fontSize:12, color:isDark?"#86efac":"#166534", marginBottom:8, lineHeight:1.5}}>{alt.material}</div>
                          <div style={{fontSize:13, color:muted, lineHeight:1.5, marginBottom:10}}>{alt.reason}</div>
                          <button onClick={()=>{setResult(null); setQuery(alt.name); analyze(alt.name);}}
                            style={{display:"flex", alignItems:"center", gap:5, fontSize:12, color:"#16a34a", fontWeight:600, background:"none", border:"none", cursor:"pointer", padding:0}}>
                            <IconSearch size={12} color="#16a34a"/> Scan this product →
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {result.alternatives?.length > 0 && (
                  <p style={{fontSize:12,color:muted,textAlign:"center",marginTop:12,lineHeight:1.5}}>We may earn a commission if you buy through affiliate links — at no extra cost to you. This funds free access to Partiqule.</p>
                )}
              </div>

              {/* BUNDLE */}
              <BundleCard category={result.category} isDark={isDark}/>

              {/* SCAN NEXT */}
              {result.scan_next?.length > 0 && (
                <div style={{background:surface, borderRadius:16, padding:"20px 24px", border:`1.5px solid ${border}`}}>
                  <h3 style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:15, color:text, margin:"0 0 14px"}}>🔍 Scan these next</h3>
                  <div style={{display:"flex", flexDirection:"column", gap:8}}>
                    {result.scan_next.map((item,i)=>(
                      <button key={i} onClick={()=>{setResult(null); setQuery(item); analyze(item);}}
                        style={{display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderRadius:10, border:`1px solid ${border}`, background:isDark?"#252d40":"#f9fafb", cursor:"pointer", textAlign:"left", transition:"all 0.15s"}}
                        onMouseEnter={e=>{e.currentTarget.style.borderColor="#16a34a"; e.currentTarget.style.background=isDark?"#1e2a3a":"#f0fdf4";}}
                        onMouseLeave={e=>{e.currentTarget.style.borderColor=border; e.currentTarget.style.background=isDark?"#252d40":"#f9fafb";}}>
                        <span style={{fontSize:13, fontWeight:500, color:text}}>{item}</span>
                        <span style={{fontSize:12, color:"#16a34a", fontWeight:600}}>Scan →</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer style={{background:isDark?"#0d1117":"#111", color:"#888", padding:isMobile?"32px 16px":"48px 40px", textAlign:"center", fontSize:13, borderTop:"4px solid #052e16"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:16}}>
          <svg width="32" height="32" viewBox="0 0 44 44">
            <rect x="0" y="0" width="44" height="44" rx="11" fill="#052e16"/>
            <rect x="20" y="29" width="4" height="11" rx="1.5" fill="#4ade80"/>
            <ellipse cx="22" cy="21" rx="11" ry="10" fill="#4ade80"/>
            <ellipse cx="22" cy="14" rx="8" ry="7" fill="#86efac"/>
            <circle cx="37" cy="8"  r="2.5" fill="#4ade80" opacity="0.8"/>
            <circle cx="39" cy="24" r="1.8" fill="#4ade80" opacity="0.5"/>
            <circle cx="5"  cy="14" r="2"   fill="#86efac" opacity="0.6"/>
            <circle cx="4"  cy="28" r="1.5" fill="#4ade80" opacity="0.45"/>
            <circle cx="28" cy="4"  r="1.8" fill="#86efac" opacity="0.55"/>
          </svg>
          <span style={{fontFamily:"'Outfit',sans-serif",fontSize:20,color:"#fff",fontWeight:700}}>Partiqule</span>
        </div>
        <div style={{marginBottom:20, color:"#666", maxWidth:400, margin:"0 auto 20px", lineHeight:1.6}}>Know what's in your products.<br/>Make choices that matter.</div>
        <div style={{display:"flex", justifyContent:"center", gap:24, marginBottom:20, flexWrap:"wrap"}}>
          {[
            {label:"About",           pg:"about",   path:"/about"},
            {label:"The Science",     pg:"science",  path:"/science"},
            {label:"My Scans",        pg:"history",  path:"/history"},
            {label:"Terms of Service", pg:"privacy",  path:"/privacy"},
          ].map(item=>(
            <span key={item.pg} onClick={()=>{setPage(item.pg); setResult(null); window.history.pushState({},"",item.path); window.scrollTo(0,0);}}
              style={{color:"#555", cursor:"pointer", fontSize:13, transition:"color 0.15s"}}
              onMouseEnter={e=>e.target.style.color="#16a34a"}
              onMouseLeave={e=>e.target.style.color="#555"}>
              {item.label}
            </span>
          ))}
          <a href="https://instagram.com/partiquleapp" target="_blank" rel="noopener noreferrer"
            style={{color:"#555", fontSize:13, textDecoration:"none", display:"flex", alignItems:"center", gap:5, transition:"color 0.15s"}}
            onMouseEnter={e=>e.currentTarget.style.color="#e1306c"}
            onMouseLeave={e=>e.currentTarget.style.color="#555"}>
            <IconInstagram size={14} color="currentColor"/> @partiquleapp
          </a>
        </div>
        <div style={{color:"#444", borderTop:"1px solid #222", paddingTop:16, marginTop:8}}>
          <div style={{marginBottom:8}}>
            © 2026 Partiqule · <span style={{color:"#555"}}>Affiliate disclosure: we may earn commissions on recommended products.</span>
          </div>
          <a href="mailto:paul@partiqule.com" style={{color:"#555", textDecoration:"none", fontSize:13, transition:"color 0.15s"}}
            onMouseEnter={e=>e.target.style.color="#4ade80"}
            onMouseLeave={e=>e.target.style.color="#555"}>
            paul@partiqule.com
          </a>
        </div>
      </footer>
    </div>
  );
}
