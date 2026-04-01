import React, { useState, useEffect, useRef } from "react";

const API_BASE = "https://partiqule-production.up.railway.app";

// ── GLOBE LOADING ─────────────────────────────────────────────
// 200 points evenly distributed on a sphere (Fibonacci lattice)
const SPHERE_POINTS = (() => {
  const pts = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < 200; i++) {
    const y = 1 - (i / 199) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i;
    pts.push({ x: Math.cos(theta) * r, y, z: Math.sin(theta) * r });
  }
  return pts;
})();

const HEALTH_FACTS = [
  { stat: "100%",   text: "of human blood samples tested contain microplastics",
    url: "https://www.sciencedirect.com/science/article/pii/S0160412022001258" },
  { stat: "58%",    text: "of arterial plaques studied contained polypropylene — NEJM 2024",
    url: "https://www.nejm.org/doi/full/10.1056/NEJMoa2309822" },
  { stat: "11B",    text: "microplastic particles per cup from nylon tea bags",
    url: "https://pubs.acs.org/doi/10.1021/acs.est.9b02540" },
  { stat: "2025",   text: "FDA banned Red 3 and began phasing out petroleum-based dyes",
    url: "https://www.fda.gov/food/food-additives-petitions/color-additive-petitions" },
  { stat: "700K",   text: "microfibers shed per wash from a single synthetic fleece jacket",
    url: "https://www.sciencedirect.com/science/article/pii/S0160412019300503" },
  { stat: "8M",     text: "tonnes of plastic enter the world\'s oceans every year",
    url: "https://www.science.org/doi/10.1126/science.1260352" },
  { stat: "PFAS",   text: "in non-stick cookware linked to thyroid disruption and infertility",
    url: "https://ehp.niehs.nih.gov/doi/10.1289/ehp.0800084" },
  { stat: "1,000+", text: "everyday chemicals are known or suspected endocrine disruptors",
    url: "https://www.endocrine.org/advocacy/position-statements/endocrine-disrupting-chemicals" },
  { stat: "10x",    text: "higher microplastic levels found in infants compared to adults",
    url: "https://pubs.acs.org/doi/10.1021/acs.estlett.0c00193" },
  { stat: "PVA",    text: "pod film dissolves but enters waterways as microplastic pollution",
    url: "https://pubs.acs.org/doi/10.1021/acs.est.1c01498" },
  { stat: "97%",    text: "of Americans tested have PFAS forever chemicals in their blood",
    url: "https://www.cdc.gov/biomonitoring/PFAS_BiomonitoringSummary.html" },
  { stat: "260C",   text: "the temperature at which PTFE non-stick coatings begin to break down",
    url: "https://www.ewg.org/research/canaries-kitchen" },
  { stat: "2024",   text: "Nature Medicine confirmed microplastics accumulating in human brain tissue",
    url: "https://www.nature.com/articles/s41591-024-03453-1" },
  { stat: "3,000",  text: "undisclosed chemicals can hide under the single word fragrance on a label",
    url: "https://link.springer.com/article/10.1007/s11869-016-0442-z" },
  { stat: "1M",     text: "plastic bottles are purchased around the world every single minute",
    url: "https://www.theguardian.com/environment/2017/jun/28/a-million-a-minute-worlds-plastic-bottle-binge-as-dangerous-as-climate-change" },
  { stat: "500yr",  text: "the time it takes a standard plastic bag to break down in landfill",
    url: "https://www.scienceadvances.org/content/3/7/e1700782" },
  { stat: "1B",     text: "plastic toothbrushes are discarded globally every year",
    url: "https://www.ewg.org/research/over-1-billion-plastic-toothbrushes-trashed-annually" },
  { stat: "BPA",    text: "replacements BPS and BPF show similar hormonal disruption to BPA",
    url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4114051/" },
  { stat: "74K",    text: "microplastic particles the average person consumes or inhales every year",
    url: "https://pubs.acs.org/doi/10.1021/acs.est.9b01517" },
  { stat: "2021",   text: "microplastics were confirmed in human placentas for the first time",
    url: "https://www.sciencedirect.com/science/article/pii/S0160412020322297" },
  { stat: "Glass",  text: "containers have zero leaching risk even when heated, frozen, or acidic",
    url: "https://www.sciencedirect.com/science/article/pii/S0048969719355457" },
  { stat: "4.4lb",  text: "of trash generated per person per day in the US — most of it packaging",
    url: "https://www.epa.gov/facts-and-figures-about-materials-waste-and-recycling" },
  { stat: "80%",    text: "of ocean plastic pollution originates from land-based sources",
    url: "https://www.science.org/doi/10.1126/science.1260352" },
  { stat: "Breast", text: "milk was found to contain microplastics in studies across multiple countries",
    url: "https://www.sciencedirect.com/science/article/pii/S0160412022000460" },
  { stat: "40%",    text: "of plastic produced is single-use — designed to be discarded within minutes",
    url: "https://advances.sciencemag.org/content/3/7/e1700782" },
  { stat: "UPF",    text: "ultra-processed foods linked to cardiovascular disease and cognitive decline",
    url: "https://www.thelancet.com/journals/lanhl/article/PIIS2666-7568(24)00007-2/fulltext" },
  { stat: "50",     text: "uses to offset a stainless steel bottle vs single-use plastic",
    url: "https://www.ellenmacarthurfoundation.org/the-new-plastics-economy-rethinking-the-future-of-plastics" },
  { stat: "Nylon",  text: "and polyester shed microfibers during wear — not just during washing",
    url: "https://www.sciencedirect.com/science/article/pii/S0160412018316350" },
  { stat: "6.3B",   text: "tonnes of plastic waste generated since the 1950s — only 9% ever recycled",
    url: "https://advances.sciencemag.org/content/3/7/e1700782" },
  { stat: "Heated", text: "polypropylene baby bottles release millions of microplastic particles per litre",
    url: "https://www.nature.com/articles/s43016-020-00171-y" },
];

const STAGES = [
  "Searching for product data...",
  "Analysing materials and exposure...",
  "Auditing the score...",
  "Finding safer alternatives...",
];

const GlobeLoading = ({isMobile}) => {
  const containerRef = useRef(null);
  const angleRef     = useRef(0);
  const frameRef     = useRef(null);
  const glowRef      = useRef(Array.from({length:200}, () => 0));
  const glowTimer    = useRef(Array.from({length:200}, () => Math.floor(Math.random() * 180)));
  const shuffledFacts = useRef([...HEALTH_FACTS].sort(() => Math.random() - 0.5));
  const [activeFacts, setActiveFacts] = useState([]);
  const [stage, setStage] = useState(0);

  // Layout — computed once
  const mob = isMobile || (typeof window !== 'undefined' && window.innerWidth < 640);
  const W   = mob ? Math.min(typeof window !== 'undefined' ? window.innerWidth - 24 : 340, 360) : 600;
  const R   = mob ? 82  : 115;
  const CX  = W / 2;
  const CY  = mob ? 188 : 250;
  const H   = CY + R + 120;

  // Slots: globe surface point (gx,gy) → line endpoint (lx,ly) → card (cx,cy,cw,ch)
  const SLOTS = mob ? [
    { gx:CX,       gy:CY-R,       lx:CX,       ly:74,       cx:CX-88,    cy:8,        cw:176, ch:66 },
    { gx:CX+R*.72, gy:CY-R*.52,   lx:W-116,    ly:CY-98,    cx:W-118,    cy:CY-116,   cw:118, ch:66 },
    { gx:CX-R*.72, gy:CY-R*.52,   lx:118,      ly:CY-98,    cx:0,        cy:CY-116,   cw:118, ch:66 },
  ] : [
    { gx:CX,        gy:CY-R,       lx:CX,        ly:78,       cx:CX-88,    cy:10,       cw:176, ch:68 },
    { gx:CX+R*.866, gy:CY-R*.5,    lx:CX+R+15,   ly:CY-96,    cx:CX+R+15,  cy:CY-128,   cw:158, ch:68 },
    { gx:CX+R*.866, gy:CY+R*.5,    lx:CX+R+15,   ly:CY+42,    cx:CX+R+15,  cy:CY+8,     cw:158, ch:68 },
    { gx:CX-R*.866, gy:CY+R*.5,    lx:CX-R-15,   ly:CY+42,    cx:0,        cy:CY+8,     cw:158, ch:68 },
    { gx:CX-R*.866, gy:CY-R*.5,    lx:CX-R-15,   ly:CY-96,    cx:0,        cy:CY-128,   cw:158, ch:68 },
  ];

  // rAF: rotation + per-particle glow pulses
  useEffect(() => {
    const animate = () => {
      angleRef.current += 0.006;
      if (containerRef.current) {
        const els = containerRef.current.querySelectorAll("[data-pt]");
        const cos = Math.cos(angleRef.current);
        const sin = Math.sin(angleRef.current);
        els.forEach((el, i) => {
          const p = SPHERE_POINTS[i];
          const rx = p.x * cos - p.z * sin;
          const rz = p.x * sin + p.z * cos;
          const persp = 2.6 / (2.6 + rz);
          const sx = CX + rx * R * persp;
          const sy = CY - p.y * R * persp;
          const sz = Math.max(1.5, 1.5 + persp * 4.5).toFixed(1);
          const baseOp = Math.max(0.05, Math.min(0.88, 0.08 + (rz + 1) * 0.40));

          if (glowTimer.current[i] <= 0) {
            glowTimer.current[i] = 50 + Math.floor(Math.random() * 220);
            if (Math.random() < 0.28) glowRef.current[i] = 1.0;
          } else {
            glowTimer.current[i]--;
          }
          const g = glowRef.current[i];
          if (g > 0) glowRef.current[i] = Math.max(0, g - 0.032);

          el.style.transform = `translate(${(sx-2).toFixed(1)}px,${(sy-2).toFixed(1)}px)`;
          el.style.opacity   = Math.min(1, baseOp + g * 0.82).toFixed(2);
          el.style.width     = sz + "px";
          el.style.height    = sz + "px";
          el.style.background   = g > 0.4 ? "#86efac" : "#4ade80";
          el.style.boxShadow    = g > 0.35 ? `0 0 ${Math.round(g*10)}px rgba(74,222,128,${(g*0.85).toFixed(2)})` : "none";
        });
      }
      frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [CX, CY, R]);

  // Stage progression
  useEffect(() => {
    const t = [
      setTimeout(() => setStage(1), 8000),
      setTimeout(() => setStage(2), 16000),
      setTimeout(() => setStage(3), 22000),
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  // Facts branch out one at a time, all stay for entire scan
  useEffect(() => {
    const maxSlots = SLOTS.length;
    let count = 0;
    const launch = () => {
      if (count >= maxSlots) return;
      const slot = SLOTS[count];
      const fact = shuffledFacts.current[count % shuffledFacts.current.length];
      setActiveFacts(prev => [...prev, { id: Date.now() + count, slot, fact }]);
      count++;
    };
    const t0 = setTimeout(launch, 900);
    const iv = setInterval(() => { if (count < maxSlots) launch(); }, 4000);
    return () => { clearTimeout(t0); clearInterval(iv); };
  }, []);

  return (
    <div style={{display:"flex", flexDirection:"column", alignItems:"center"}}>
      <style>{`
        @keyframes factBranch {
          0%   { opacity:0; transform:scale(0.35); }
          55%  { opacity:1; transform:scale(1.05); }
          100% { opacity:1; transform:scale(1); }
        }
        @keyframes lineGrow {
          from { stroke-dashoffset: var(--ll); }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes nodePop {
          0%   { r:0; opacity:0; }
          70%  { r:6; opacity:1; }
          100% { r:4.5; opacity:1; }
        }
        @keyframes globeRing {
          0%,100% { opacity:0.07; } 50% { opacity:0.18; }
        }
      `}</style>

      <div style={{position:"relative", width:W, height:H}}>

        {/* Particle layer — covers full container so transforms stay in sync */}
        <div ref={containerRef} style={{position:"absolute",top:0,left:0,width:W,height:H,pointerEvents:"none"}}>
          {SPHERE_POINTS.map((_, i) => (
            <div key={i} data-pt={i} style={{
              position:"absolute", top:0, left:0, width:4, height:4,
              borderRadius:"50%", background:"#4ade80",
            }}/>
          ))}
        </div>

        {/* SVG: globe ring + connecting lines + attachment dots */}
        <svg style={{position:"absolute",top:0,left:0,pointerEvents:"none",zIndex:6}} width={W} height={H}>
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="#4ade80" strokeWidth={0.6}
            style={{animation:"globeRing 3.5s ease-in-out infinite"}}/>

          {activeFacts.map(af => {
            const s = af.slot;
            const len = Math.hypot(s.lx - s.gx, s.ly - s.gy).toFixed(1);
            return (
              <g key={af.id}>
                <line
                  x1={s.gx} y1={s.gy} x2={s.lx} y2={s.ly}
                  stroke="rgba(74,222,128,0.45)" strokeWidth={1.5}
                  strokeDasharray={len}
                  style={{"--ll": len, animation:"lineGrow 0.65s ease-out 0.08s forwards", strokeDashoffset: len}}
                />
                <circle cx={s.gx} cy={s.gy} r={0} fill="#4ade80"
                  style={{animation:"nodePop 0.45s ease-out 0.05s forwards"}}/>
              </g>
            );
          })}
        </svg>

        {/* Fact cards — stay in place for entire scan, tap to open source */}
        {activeFacts.map(af => (
          <a key={`c-${af.id}`}
            href={af.fact.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              position:"absolute",
              left: af.slot.cx, top: af.slot.cy,
              width: af.slot.cw,
              animation:"factBranch 0.55s cubic-bezier(0.34,1.4,0.64,1) 0.12s both",
              zIndex:10,
              textDecoration:"none",
              cursor: af.fact.url ? "pointer" : "default",
            }}>
            <div style={{
              background:"rgba(5,46,22,0.96)",
              border:"1.5px solid rgba(74,222,128,0.55)",
              borderRadius:12, padding:"10px 14px",
              boxShadow:"0 4px 24px rgba(74,222,128,0.18)",
              transition:"border-color 0.15s, box-shadow 0.15s",
            }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(74,222,128,0.9)"; e.currentTarget.style.boxShadow="0 4px 32px rgba(74,222,128,0.35)";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(74,222,128,0.55)"; e.currentTarget.style.boxShadow="0 4px 24px rgba(74,222,128,0.18)";}}>
              <div style={{fontFamily:"Outfit,sans-serif",fontWeight:800,
                fontSize:mob?18:20,color:"#4ade80",lineHeight:1,marginBottom:5}}>
                {af.fact.stat}
              </div>
              <div style={{fontSize:mob?10:11,color:"rgba(255,255,255,0.65)",lineHeight:1.4}}>
                {af.fact.text}
              </div>
              {af.fact.url && (
                <div style={{fontSize:9,color:"rgba(74,222,128,0.5)",marginTop:5,letterSpacing:"0.04em"}}>
                  TAP TO READ STUDY ↗
                </div>
              )}
            </div>
          </a>
        ))}

        {/* Stage indicator */}
        <div style={{position:"absolute",bottom:0,left:0,right:0,textAlign:"center"}}>
          <div style={{display:"flex",justifyContent:"center",gap:8,marginBottom:8}}>
            {STAGES.map((_, i) => (
              <div key={i} style={{
                width: i === stage ? 20 : 7, height:7, borderRadius:99,
                background: i <= stage ? "#4ade80" : "rgba(74,222,128,0.15)",
                transition:"all 0.5s ease",
              }}/>
            ))}
          </div>
          <div style={{fontSize:13,color:"rgba(255,255,255,0.5)",letterSpacing:"0.03em"}}>
            {STAGES[stage]}
          </div>
        </div>
      </div>
    </div>
  );
};




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

// ── CUSTOM BRAND ICONS ────────────────────────────────────────
const IcoScore       = ({size=24}) => <svg width={size} height={size} viewBox="0 0 64 64" fill="none"><polyline points="6,32 16,32 22,14 30,50 38,22 44,40 52,32 58,32" stroke="#3EC44A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="30" cy="50" r="4" fill="#3EC44A"/></svg>;
const IcoSafety      = ({size=24}) => <svg width={size} height={size} viewBox="0 0 64 64" fill="none"><path d="M32 6L10 16v16c0 13 10 22 22 26 12-4 22-13 22-26V16L32 6z" fill="#3EC44A" opacity="0.15" stroke="#3EC44A" strokeWidth="2.5" strokeLinejoin="round"/><path d="M22 32l6 6 14-12" stroke="#3EC44A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const IcoVerified    = ({size=24}) => <svg width={size} height={size} viewBox="0 0 64 64" fill="none"><rect x="10" y="10" width="44" height="44" rx="6" fill="#3EC44A" opacity="0.15"/><path d="M20 10h-6a4 4 0 00-4 4v36a4 4 0 004 4h28a4 4 0 004-4V14a4 4 0 00-4-4h-6" stroke="#3EC44A" strokeWidth="2.5" strokeLinecap="round"/><path d="M24 10a4 4 0 014-4h8a4 4 0 014 4v2H24v-2z" stroke="#3EC44A" strokeWidth="2.5"/><path d="M22 32l6 6 14-12" stroke="#3EC44A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const IcoScan        = ({size=24}) => <svg width={size} height={size} viewBox="0 0 64 64" fill="none"><path d="M8 22V12a4 4 0 014-4h10" stroke="#3EC44A" strokeWidth="2.5" strokeLinecap="round"/><path d="M56 22V12a4 4 0 00-4-4H42" stroke="#3EC44A" strokeWidth="2.5" strokeLinecap="round"/><path d="M8 42v10a4 4 0 004 4h10" stroke="#3EC44A" strokeWidth="2.5" strokeLinecap="round"/><path d="M56 42v10a4 4 0 01-4 4H42" stroke="#3EC44A" strokeWidth="2.5" strokeLinecap="round"/><line x1="8" y1="32" x2="56" y2="32" stroke="#3EC44A" strokeWidth="3" strokeLinecap="round"/><rect x="20" y="20" width="24" height="24" rx="4" fill="#3EC44A" opacity="0.18"/></svg>;
const IcoSearch      = ({size=24}) => <svg width={size} height={size} viewBox="0 0 64 64" fill="none"><circle cx="28" cy="28" r="16" fill="#3EC44A" opacity="0.15"/><circle cx="28" cy="28" r="16" stroke="#3EC44A" strokeWidth="2.5"/><line x1="40" y1="40" x2="54" y2="54" stroke="#3EC44A" strokeWidth="2.5" strokeLinecap="round"/></svg>;
const IcoProducts    = ({size=24}) => <svg width={size} height={size} viewBox="0 0 64 64" fill="none"><path d="M8 26L32 8l24 18v28a4 4 0 01-4 4H12a4 4 0 01-4-4V26z" fill="#3EC44A" opacity="0.15" stroke="#3EC44A" strokeWidth="2.5" strokeLinejoin="round"/><path d="M24 56V36h16v20" stroke="#3EC44A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const IcoCategory    = ({size=24}) => <svg width={size} height={size} viewBox="0 0 64 64" fill="none"><path d="M14 24h28l-4 24H18L14 24z" fill="#3EC44A" opacity="0.15" stroke="#3EC44A" strokeWidth="2.5" strokeLinejoin="round"/><path d="M42 28h6a6 6 0 010 12h-6" stroke="#3EC44A" strokeWidth="2.5" strokeLinecap="round"/><line x1="10" y1="56" x2="50" y2="56" stroke="#3EC44A" strokeWidth="2.5" strokeLinecap="round"/><path d="M22 18c0-4 4-4 4-8" stroke="#3EC44A" strokeWidth="2" strokeLinecap="round"/><path d="M30 18c0-4 4-4 4-8" stroke="#3EC44A" strokeWidth="2" strokeLinecap="round"/></svg>;
const IcoIngredients = ({size=24}) => <svg width={size} height={size} viewBox="0 0 64 64" fill="none"><rect x="8" y="12" width="48" height="40" rx="6" fill="#3EC44A" opacity="0.1"/><line x1="22" y1="20" x2="52" y2="20" stroke="#3EC44A" strokeWidth="2.5" strokeLinecap="round"/><line x1="22" y1="32" x2="52" y2="32" stroke="#3EC44A" strokeWidth="2.5" strokeLinecap="round"/><line x1="22" y1="44" x2="52" y2="44" stroke="#3EC44A" strokeWidth="2.5" strokeLinecap="round"/><circle cx="12" cy="20" r="3.5" fill="#3EC44A"/><circle cx="12" cy="32" r="3.5" fill="#3EC44A"/><circle cx="12" cy="44" r="3.5" fill="#3EC44A"/></svg>;
const IcoRating      = ({size=24}) => <svg width={size} height={size} viewBox="0 0 64 64" fill="none"><path d="M32 8l6 12 14 2-10 10 2 14-12-6-12 6 2-14L12 22l14-2z" fill="#3EC44A" opacity="0.85" stroke="#3EC44A" strokeWidth="2.5" strokeLinejoin="round"/></svg>;
const IcoSaved       = ({size=24}) => <svg width={size} height={size} viewBox="0 0 64 64" fill="none"><path d="M32 52S10 40 10 24a12 12 0 0122-6.7A12 12 0 0154 24c0 16-22 28-22 28z" fill="#3EC44A" opacity="0.8" stroke="#3EC44A" strokeWidth="2.5" strokeLinejoin="round"/></svg>;
const IcoInfo        = ({size=24}) => <svg width={size} height={size} viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="24" fill="#3EC44A" opacity="0.15" stroke="#3EC44A" strokeWidth="2.5"/><line x1="32" y1="28" x2="32" y2="44" stroke="#3EC44A" strokeWidth="2.5" strokeLinecap="round"/><circle cx="32" cy="21" r="2.5" fill="#3EC44A"/></svg>;
const IcoProfile     = ({size=24}) => <svg width={size} height={size} viewBox="0 0 64 64" fill="none"><circle cx="32" cy="22" r="12" fill="#3EC44A" opacity="0.15" stroke="#3EC44A" strokeWidth="2.5"/><path d="M10 56a22 22 0 0144 0" stroke="#3EC44A" strokeWidth="2.5" strokeLinecap="round"/></svg>;


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
const SplitView = ({result, isDark, onScan}) => {
  // Priority: same-category static alternative → any static alternative → AI alternative
  const sameCat = result.alternatives?.find(p => p.category === result.category);
  const anyStatic = result.alternatives?.[0];
  const aiAlt = result.ai_alternatives?.[0];

  // Use same-category static if available, else AI alternative, else any static
  // Never show if score is already low
  const best = sameCat || (aiAlt ? null : anyStatic);
  const useAi = !sameCat && aiAlt;

  if ((!best && !useAi) || result.score <= 3) return null;
  const surface = isDark?"#1e2433":"#fff";
  const border  = isDark?"#2a3347":"#eee";
  const text    = isDark?"#f1f5f9":"#111";
  return (
    <div style={{marginTop:24}}>
      <div style={{fontSize:12, color:"#aaa", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:12, textAlign:"center"}}>Side-by-Side Comparison</div>
      <div style={{display:"grid", gridTemplateColumns:"1fr auto 1fr", gap:0, alignItems:"stretch"}}>
        {/* Risky side */}
        <div style={{background:scoreBg(result.overall_score||result.score), borderRadius:"12px 0 0 12px", padding:"20px", border:`1.5px solid ${scoreColor(result.overall_score||result.score)}33`, borderRight:"none"}}>
          <div style={{fontSize:11, color:scoreColor(result.overall_score||result.score), textTransform:"uppercase", fontWeight:700, marginBottom:6}}>Your Product</div>
          <div style={{fontSize:15, fontWeight:700, color:text, fontFamily:"'Outfit',sans-serif", marginBottom:10, lineHeight:1.3}}>{result.product_name?.length>40?result.product_name.slice(0,37)+"…":result.product_name}</div>
          <div style={{display:"flex", alignItems:"center", gap:8}}>
            <div style={{fontSize:28, fontWeight:800, color:scoreColor(result.overall_score||result.score), fontFamily:"'Outfit',sans-serif"}}>{result.overall_score||result.score}</div>
            <div style={{fontSize:12, color:scoreColor(result.overall_score||result.score), fontWeight:600}}>/10 overall</div>
          </div>
          <div style={{fontSize:12, color:scoreColor(result.overall_score||result.score), fontWeight:600, marginTop:6, padding:"4px 10px", background:`${scoreColor(result.overall_score||result.score)}15`, borderRadius:20, display:"inline-block"}}>{scoreLabel(result.overall_score||result.score)} Overall</div>
        </div>
        {/* VS divider */}
        <div style={{display:"flex", alignItems:"center", justifyContent:"center", background:isDark?"#131929":"#f5f5f5", padding:"0 14px", zIndex:1}}>
          <div style={{fontSize:13, fontWeight:800, color:"#999", letterSpacing:"0.05em"}}>VS</div>
        </div>
        {/* Safe side */}
        <div style={{background:"#f0fdf4", borderRadius:"0 12px 12px 0", padding:"20px", border:"1.5px solid #16a34a33", borderLeft:"none"}}>
          <div style={{fontSize:11, color:"#16a34a", textTransform:"uppercase", fontWeight:700, marginBottom:6}}>Better Choice</div>
          {useAi ? (
            <>
              <div style={{fontSize:15, fontWeight:700, color:text, fontFamily:"'Outfit',sans-serif", marginBottom:6, lineHeight:1.3}}>{aiAlt.name}</div>
              <div style={{fontSize:12, color:"#16a34a", marginBottom:8, lineHeight:1.4}}>{aiAlt.material}</div>
              <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:8}}>
                <div style={{fontSize:28, fontWeight:800, color:"#16a34a", fontFamily:"'Outfit',sans-serif"}}>{aiAlt.estimated_score}</div>
                <div style={{fontSize:12, color:"#16a34a", fontWeight:600}}>/10 danger</div>
              </div>
              <button onClick={()=>onScan && onScan(aiAlt.name)}
                style={{fontSize:12, color:"#16a34a", fontWeight:600, marginTop:4, padding:"5px 14px", background:"#f0fdf4", border:"1.5px solid #16a34a", borderRadius:20, display:"inline-flex", alignItems:"center", gap:4, cursor:"pointer"}}>
                Scan this → <IconArrow size={11} color="#16a34a"/>
              </button>
            </>
          ) : (
            <>
              <div style={{fontSize:15, fontWeight:700, color:text, fontFamily:"'Outfit',sans-serif", marginBottom:10, lineHeight:1.3}}>{best.name}</div>
              <div style={{display:"flex", alignItems:"center", gap:8}}>
                <div style={{fontSize:28, fontWeight:800, color:"#16a34a", fontFamily:"'Outfit',sans-serif"}}>{best.score}</div>
                <div style={{fontSize:12, color:"#16a34a", fontWeight:600}}>/10 danger</div>
              </div>
              <a href={best.affiliateUrl} target="_blank" rel="noopener noreferrer" style={{fontSize:12, color:"#fff", fontWeight:600, marginTop:8, padding:"5px 14px", background:"#16a34a", borderRadius:20, display:"inline-flex", alignItems:"center", gap:4, textDecoration:"none"}}>
                Shop now <IconArrow size={11} color="#fff"/>
              </a>
            </>
          )}
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

  const sections = [
    {
      tag: "Your Health",
      tagColor: "#16a34a",
      tagBg: isDark?"#1a2a1a":"#f0fdf4",
      headline: "What your products are doing to your body",
      subhead: "From microplastics in arterial plaques to artificial dyes being phased out by the FDA, the research on everyday product exposure has reached a turning point.",
      stats: [
        {number:"100%", label:"of human blood samples tested in 2022 contained microplastics", color:"#16a34a", bg:"#f0fdf4"},
        {number:"58%",  label:"of carotid artery plaques studied in 2024 contained polypropylene (PP)", color:"#059669", bg:"#ecfdf5"},
        {number:"2025", label:"FDA banned Red 3 and began phasing out all petroleum-based synthetic food dyes", color:"#047857", bg:"#d1fae5"},
        {number:"UPF",  label:"ultra-processed foods now linked to cardiovascular disease, cognitive decline and stroke — The Lancet 2025", color:"#052e16", bg:"#bbf7d0"},
      ],
      faqs: [
        {q:"What are microplastics and why do they matter?", a:"Microplastics are plastic particles under 5mm, many invisible to the naked eye. A 2024 New England Journal of Medicine study found polypropylene (PP) in 58% of carotid artery plaques. Patients with detectable microplastics had significantly higher rates of heart attack, stroke, and death over the following years."},
        {q:"What are PFAS and where are they found?", a:"PFAS (per- and polyfluoroalkyl substances) are synthetic chemicals used in non-stick coatings, water-resistant clothing, food packaging, and some cleaning products. They are known endocrine disruptors linked to thyroid disruption, reduced fertility, elevated cholesterol, and several cancers. The FDA has flagged them as a priority health concern."},
        {q:"Why are artificial dyes a concern?", a:"The FDA banned Red 3 in 2025 and has begun phasing out all petroleum-derived synthetic dyes including Red 40, Yellow 5, Yellow 6, and Blue 1. Multiple studies have linked these dyes to hyperactivity in children and potential carcinogenicity. They appear in candy, cereals, drinks, and many processed foods. Partiqule flags each dye individually with its severity level and the research behind it."},
        {q:"What are ultra-processed foods and why do they score higher?", a:"Ultra-processed foods (NOVA Group 4) are industrial formulations containing ingredients not found in home kitchens — synthetic dyes, preservatives like BHA and BHT, emulsifiers, and artificial flavors. A 2025 Lancet review linked regular ultra-processed food consumption to cardiovascular disease, cognitive decline, and stroke. Partiqule scores these products higher on Materials and Usage because the chemical load is meaningfully higher than minimally processed or whole foods."},
        {q:"How does Partiqule score personal health risk?", a:"The Materials score (40% weight) covers what the product is made of and its chemical risk — including food additives and processing level for food items. The Usage and Exposure score (25% weight) covers how using the product affects your body, accounting for frequency, contact type (ingestion, skin contact, inhalation), and whether the product is used by children. For food products, a dedicated Ingredients and Nutrition breakdown shows each additive individually with its severity and the research behind it."},
      ],
    },
    {
      tag: "Your Family and Home",
      tagColor: "#2563eb",
      tagBg: isDark?"#1e1f3a":"#eff6ff",
      headline: "What is coming into your home",
      subhead: "The packaging your products arrive in, the cleaning products you use around your family, and the exposure patterns of the people you live with all matter.",
      stats: [
        {number:"PVA",  label:"film in dishwasher and laundry pods dissolves but enters waterways as microplastic", color:"#2563eb", bg:"#eff6ff"},
        {number:"1,000+", label:"chemicals in everyday products are known or suspected endocrine disruptors", color:"#1d4ed8", bg:"#dbeafe"},
        {number:"10x",  label:"higher microplastic concentrations found in infants versus adults in some studies", color:"#1e40af", bg:"#bfdbfe"},
        {number:"80%",  label:"of packaged household products contain ultra-processed or synthetic chemical ingredients", color:"#1e3a8a", bg:"#93c5fd"},
      ],
      faqs: [
        {q:"Are cleaning products a health concern?", a:"Conventional cleaning products often contain synthetic fragrances, optical brighteners, and surfactants that leave residue on surfaces, dishes, and clothing. Dishwasher pods from brands like Cascade and Tide contain PVA film, which dissolves but enters waterways as microplastic. Genuinely plastic-free alternatives (Blueland, Branch Basics) avoid these entirely."},
        {q:"Why does packaging matter for my home?", a:"Primary packaging that touches a product can leach chemicals, especially when heated or in contact with acidic foods. Single-use plastic packaging that enters your home regularly adds up over time. Refillable and concentrated formats reduce the volume of plastic and synthetic chemicals circulating through your household."},
        {q:"Are baby and children's products more concerning?", a:"Yes. Children have higher surface-area-to-body-weight ratios, developing immune and hormonal systems, and different exposure patterns (more hand-to-mouth contact). A 2020 Nature Food study found that heating polypropylene baby bottles releases millions of microplastic particles per litre. Partiqule flags child products with a vulnerable population marker."},
        {q:"How does Partiqule score home and packaging risk?", a:"The Packaging score (15% weight) covers what enters your home: primary packaging material, whether the product is refillable, and its end-of-life fate. Incidental packaging that is discarded before use (a film pouch on a cleaning tablet) does not penalise the product itself."},
      ],
    },
    {
      tag: "The Planet",
      tagColor: "#d97706",
      tagBg: isDark?"#1e1200":"#fffbeb",
      headline: "The downstream impact of what we buy",
      subhead: "Every product has a lifecycle. From how it is made to how it is disposed of, everyday purchasing decisions accumulate into something much larger.",
      stats: [
        {number:"8M",   label:"tonnes of plastic enter the world's oceans every year", color:"#d97706", bg:"#fffbeb"},
        {number:"500",  label:"years for a standard plastic bag to break down in landfill", color:"#b45309", bg:"#fef3c7"},
        {number:"700K", label:"microfibers released per wash from a single synthetic fleece jacket", color:"#92400e", bg:"#fde68a"},
        {number:"1/3",  label:"of all plastic ever produced has ended up in nature", color:"#78350f", bg:"#fcd34d"},
      ],
      faqs: [
        {q:"What is sustainability scoring and why does it matter?", a:"Single-use disposables (paper towels, plastic bags, disposable cups, wipes) generate ongoing waste regardless of what they are made of. Partiqule's Sustainability score (15% weight) rewards multi-use, refillable, repairable, and compostable products, and penalises products designed to be thrown away after a single use."},
        {q:"Why does synthetic clothing contribute to ocean plastic?", a:"Polyester, nylon, acrylic, and spandex shed microscopic synthetic fibers every time they are washed. These microfibers pass through wastewater treatment and enter rivers and oceans. A single wash of a fleece jacket can release over 700,000 fibers. Natural fibers (cotton, wool, linen, hemp) do not shed synthetic microplastics."},
        {q:"What is a break-even calculation?", a:"When Partiqule suggests a safer alternative, it estimates how many uses it takes for the alternative to offset the environmental cost of its own production. A stainless steel water bottle, for example, breaks even against single-use plastic bottles at around 50 uses. After that, every use is net positive."},
        {q:"How does Partiqule score planet impact?", a:"Sustainability (15% weight) covers product longevity, replaceability of single-use items, and end-of-life circularity. Manufacturing (5% weight) covers production processes, flagged as estimated when supply chain data is not publicly available. Together they capture the downstream impact of buying a product."},
      ],
    },
  ];

  return (
    <section style={{background:bg, borderTop:`1px solid ${border}`, padding:isMobile?"40px 16px":"64px 40px"}}>
      <div style={{maxWidth:1100, margin:"0 auto"}}>
        {sections.map((sec, si) => (
          <div key={si} style={{marginBottom: si < sections.length - 1 ? (isMobile?48:80) : 0}}>
            {/* Section header */}
            <div style={{textAlign:"center", marginBottom:isMobile?32:48}}>
              <div style={{display:"inline-flex", alignItems:"center", gap:6, background:sec.tagBg, color:sec.tagColor, fontSize:13, fontWeight:600, padding:"5px 14px", borderRadius:20, marginBottom:16, textTransform:"uppercase", letterSpacing:"0.05em"}}>
                {sec.tag}
              </div>
              <h2 style={{fontFamily:"'Outfit',sans-serif", fontSize:isMobile?26:34, fontWeight:700, color:text, margin:"0 0 14px", letterSpacing:"-0.5px"}}>{sec.headline}</h2>
              <p style={{fontSize:16, color:muted, maxWidth:600, margin:"0 auto", lineHeight:1.75}}>{sec.subhead}</p>
            </div>

            {/* Stats grid */}
            <div style={{display:"grid", gridTemplateColumns:isMobile?"repeat(2,1fr)":"repeat(4,1fr)", gap:isMobile?10:20, marginBottom:isMobile?32:48}}>
              {sec.stats.map((s,i) => (
                <div key={i} style={{background:isDark?"#1e2433":s.bg, borderRadius:14, padding:"24px 20px", border:`1.5px solid ${isDark?"#2a3347":"transparent"}`, textAlign:"center"}}>
                  <div style={{fontFamily:"'Outfit',sans-serif", fontSize:28, fontWeight:800, color:isDark?"#4ade80":s.color, marginBottom:8, lineHeight:1.2}}>{s.number}</div>
                  <div style={{fontSize:13, color:isDark?"#64748b":s.color, lineHeight:1.5, opacity:isDark?1:0.85}}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* FAQ grid */}
            <div style={{display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:isMobile?10:20}}>
              {sec.faqs.map((faq,i) => (
                <div key={i} style={{background:surface, borderRadius:14, padding:"24px", border:`1.5px solid ${border}`}}>
                  <div style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:16, color:text, marginBottom:10}}>{faq.q}</div>
                  <div style={{fontSize:14, color:muted, lineHeight:1.7}}>{faq.a}</div>
                </div>
              ))}
            </div>

            {si < sections.length - 1 && (
              <div style={{borderTop:`1.5px solid ${border}`, marginTop:isMobile?40:64}}/>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};

// ── PLASTIC SCORE DROPDOWN ────────────────────────────────────
// ── EXPOSURE CALCULATOR — replaces break-even card ───────────
const FREQ_OPTIONS = [
  { value:"daily",     label:"Every day",        perYear: 365 },
  { value:"twice",     label:"2-3x per week",    perYear: 130 },
  { value:"weekly",    label:"Once a week",       perYear: 52  },
  { value:"monthly",   label:"A few times/month", perYear: 18  },
  { value:"rarely",    label:"Rarely",            perYear: 6   },
];

const CATEGORY_EXPOSURE = {
  food_beverage: {
    unit: "servings",
    chemical: (result) => {
      const fa = result.food_analysis;
      if (!fa) return "synthetic additives";
      const highs = (fa.concerns||[]).filter(c=>c.severity==="high");
      return highs.length > 0 ? highs.map(c=>c.ingredient).slice(0,2).join(" and ") : "synthetic additives";
    },
    analogy: (events) => {
      if (events >= 500) return `${events.toLocaleString()} servings of synthetic chemicals ingested`;
      return `${events} servings containing synthetic food additives`;
    },
  },
  personal_care: {
    unit: "applications",
    chemical: () => "synthetic chemicals",
    analogy: (events) => `${events.toLocaleString()} skin contact events with synthetic ingredients`,
  },
  kitchen: {
    unit: "uses",
    chemical: () => "chemical exposure",
    analogy: (events) => `${events.toLocaleString()} uses with direct chemical contact`,
  },
  clothing: {
    unit: "wears",
    chemical: () => "microfibers shed",
    analogy: (events) => `${events.toLocaleString()} wear events shedding synthetic microfibers onto skin`,
  },
  baby: {
    unit: "uses",
    chemical: () => "chemical exposures",
    analogy: (events) => `${events.toLocaleString()} exposures for your child`,
  },
  other: {
    unit: "uses",
    chemical: () => "exposures",
    analogy: (events) => `${events.toLocaleString()} contact events`,
  },
};

const ExposureCalculator = ({result, isDark, text, muted, isMobile}) => {
  const [tab,       setTab]     = useState("exposure");
  const [freq,      setFreq]    = useState(() => {
    const f = result.dimensions?.usage_exposure?.frequency || result.exposure_frequency;
    if (f === "daily") return "daily";
    if (f === "weekly") return "weekly";
    if (f === "occasional") return "monthly";
    return "daily";
  });
  const [adults,   setAdults]   = useState(2);
  const [kids,     setKids]     = useState(0);
  const [spend,    setSpend]    = useState(10);

  const score    = result.overall_score || result.score;
  const altScore = result.break_even?.uses ? Math.max(1, Math.round(score * 0.3)) : 2;
  const freqData = FREQ_OPTIONS.find(f => f.value === freq) || FREQ_OPTIONS[0];
  const cat      = result.category || "other";
  const catConfig = CATEGORY_EXPOSURE[cat] || CATEGORY_EXPOSURE.other;
  const hasKids  = kids > 0;

  // Mirror SplitView's alt selection exactly:
  // same-category DB alt → AI alt → any DB alt
  // Price only comes from DB alts (AI alts have no price)
  const sameCat   = result.alternatives?.find(a => a.category === result.category);
  const anyStatic = result.alternatives?.[0];
  const aiAlt     = result.ai_alternatives?.[0];
  const splitAlt  = sameCat || (aiAlt ? null : anyStatic); // mirrors SplitView's `best`
  const useAiAlt  = !sameCat && !!aiAlt;                   // mirrors SplitView's `useAi`

  // Name: same product as SplitView shows
  const altName = useAiAlt
    ? (aiAlt?.name || "safer alternative")
    : (splitAlt?.name || result.break_even?.alternative_name || "safer alternative");

  // Price: only available from DB alts (AI alts have no price data)
  const altPriceStr = splitAlt?.price || "";

  // Named exposures
  const exposureItems = (() => {
    const items = [];
    if (cat === "food_beverage") {
      (result.food_analysis?.concerns || [])
        .filter(c => c.severity === "high" || c.severity === "medium")
        .forEach(c => items.push({ name: c.ingredient, severity: c.severity }));
      (result.identified_plastics || []).forEach(p => items.push({ name: p, severity: "medium" }));
    } else {
      (result.identified_plastics || []).forEach(p => items.push({ name: p, severity: "high" }));
      (result.harmful_chemicals || []).forEach(c => items.push({ name: c, severity: "medium" }));
    }
    return items.slice(0, 6);
  })();
  const SEV_COLOR = { high:"#dc2626", medium:"#d97706", low:"#6b7280" };
  const exposureNames = exposureItems.length > 0
    ? exposureItems.slice(0,3).map(e=>e.name).join(", ")
    : catConfig.chemical(result);

  // Calculations
  const perYear      = freqData.perYear;
  const adultTotal   = perYear * adults;
  const kidsTotal    = perYear * kids * 2.5; // children 2.5x more sensitive
  const totalCurrent = adultTotal + kidsTotal;
  const altTotal     = Math.round(totalCurrent * (altScore / score));
  const reduction    = Math.round(totalCurrent - altTotal);
  const reductionPct = Math.round((reduction / totalCurrent) * 100);

  // Health cost estimate (Trasande et al. 2018) — spend input used only for this
  const annualSpend  = spend * 12;
  const healthSaved  = hasKids ? Math.round(494 * kids * (reductionPct / 100)) : 0;

  const surface = isDark ? "#1e2433" : "#fff";
  const border  = isDark ? "#2a3347" : "#e5e7eb";

  // Stepper component
  const Stepper = ({label, value, setValue, min=0, max=10}) => (
    <div>
      <div style={{fontSize:11, color:muted, fontWeight:600, marginBottom:5}}>{label}</div>
      <div style={{display:"flex", alignItems:"center", gap:6}}>
        <button onClick={()=>setValue(v=>Math.max(min,v-1))} style={{width:28,height:28,borderRadius:6,border:`1px solid ${border}`,background:surface,color:text,cursor:"pointer",fontSize:16,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>−</button>
        <span style={{fontWeight:700,fontSize:15,color:text,minWidth:18,textAlign:"center"}}>{value}</span>
        <button onClick={()=>setValue(v=>Math.min(max,v+1))} style={{width:28,height:28,borderRadius:6,border:`1px solid ${border}`,background:surface,color:text,cursor:"pointer",fontSize:16,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>+</button>
      </div>
    </div>
  );

  const tabs = [
    {id:"exposure", label:"My Exposure"},
    {id:"overtime", label:"Over Time"},
    {id:"switch",   label:"Switch & Save"},
  ];

  return (
    <div className="fade-up" style={{background:isDark?"#1a2a1a":"#f0fdf4", borderRadius:16, border:`1.5px solid ${isDark?"#1e3a1e":"#bbf7d0"}`, overflow:"hidden", marginTop:16, textAlign:"left"}}>

      {/* Header + tabs */}
      <div style={{padding:"14px 18px 0", borderBottom:`1px solid ${isDark?"#1e3a1e":"#bbf7d0"}`}}>
        <div style={{fontSize:11, color:"#16a34a", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:10, display:"flex", alignItems:"center", gap:6}}>
          <IcoScore size={14}/> Usage Calculator
        </div>
        <div style={{display:"flex", gap:2}}>
          {tabs.map(t => (
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              flex:1, padding:"7px 6px", fontSize:isMobile?11:12, fontWeight:700,
              border:"none", borderRadius:"8px 8px 0 0", cursor:"pointer",
              background: tab===t.id ? (isDark?"#1e2433":"#fff") : "transparent",
              color: tab===t.id ? "#16a34a" : muted,
              borderBottom: tab===t.id ? "2px solid #16a34a" : "none",
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{padding:"16px 18px"}}>

        {/* Inputs row */}
        <div style={{display:"grid", gridTemplateColumns:hasKids?"1fr 1fr 1fr 1fr":"1fr 1fr 1fr", gap:12, marginBottom:14, alignItems:"end"}}>
          <div style={{gridColumn:"1 / -1"}}>
            <div style={{fontSize:11, color:muted, fontWeight:600, marginBottom:5}}>
              {cat === "food_beverage" ? "How often do you eat this?" : "How often do you use this?"}
            </div>
            <select value={freq} onChange={e=>setFreq(e.target.value)} style={{
              width:"100%", padding:"7px 10px", borderRadius:8, fontSize:13,
              border:`1px solid ${border}`, background:surface, color:text, cursor:"pointer",
            }}>
              {FREQ_OPTIONS.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <Stepper label="Adults" value={adults} setValue={setAdults} min={1} max={8}/>
          <Stepper label="Children" value={kids} setValue={setKids} min={0} max={8}/>
        </div>

        {/* What's in this product — chips */}
        {exposureItems.length > 0 && (
          <div style={{marginBottom:14}}>
            <div style={{fontSize:10, color:muted, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:6}}>
              What you're being exposed to
            </div>
            <div style={{display:"flex", flexWrap:"wrap", gap:5}}>
              {exposureItems.map((item,i) => (
                <span key={i} style={{
                  fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:16,
                  background:isDark?"#1e1a2e":"#fef2f2",
                  color:SEV_COLOR[item.severity]||"#6b7280",
                  border:`1px solid ${SEV_COLOR[item.severity]||"#6b7280"}44`,
                }}>{item.name}</span>
              ))}
            </div>
          </div>
        )}

        {/* ── MY EXPOSURE ── */}
        {tab === "exposure" && (
          <div>
            {/* Big impact statement */}
            <div style={{background:isDark?"#2a1a1a":"#fef2f2", borderRadius:12, padding:"16px 18px", border:`2px solid ${scoreColor(score)}33`, marginBottom:12}}>
              <div style={{fontSize:11, color:scoreColor(score), fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8}}>
                Your household right now
              </div>
              <div style={{display:"flex", alignItems:"baseline", gap:8, flexWrap:"wrap", marginBottom:8}}>
                <span style={{fontFamily:"'Outfit',sans-serif", fontWeight:800, fontSize:42, color:scoreColor(score), lineHeight:1}}>
                  {totalCurrent.toLocaleString()}
                </span>
                <span style={{fontSize:14, color:isDark?"#94a3b8":"#555", fontWeight:500}}>
                  {catConfig.unit} per year containing {exposureNames}
                </span>
              </div>
              {hasKids && (
                <div style={{fontSize:12, color:"#d97706", fontWeight:600, display:"flex", alignItems:"center", gap:5, marginBottom:4}}>
                  <IcoProfile size={13}/>
                  Includes {kids} child{kids>1?"ren":""} — counted at 2.5x adult sensitivity
                </div>
              )}
              <div style={{display:"flex", alignItems:"center", gap:8, marginTop:4}}>
                <div style={{flex:1, height:6, borderRadius:99, background:isDark?"#2a3347":"#e5e7eb", overflow:"hidden"}}>
                  <div style={{height:"100%", width:`${Math.min(100,(score/10)*100)}%`, background:scoreColor(score), borderRadius:99}}/>
                </div>
                <span style={{fontSize:11, color:scoreColor(score), fontWeight:700, whiteSpace:"nowrap"}}>{scoreLabel(score)} risk</span>
              </div>
            </div>

            {/* Arrow + alternative */}
            <div style={{textAlign:"center", fontSize:20, color:"#16a34a", margin:"4px 0"}}>↓</div>

            <div style={{background:isDark?"#1a2a1a":"#f0fdf4", borderRadius:12, padding:"16px 18px", border:"2px solid #16a34a33", marginBottom:12}}>
              <div style={{fontSize:11, color:"#16a34a", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8}}>
                If you switch to {altName}
              </div>
              <div style={{display:"flex", alignItems:"baseline", gap:8, flexWrap:"wrap", marginBottom:8}}>
                <span style={{fontFamily:"'Outfit',sans-serif", fontWeight:800, fontSize:42, color:"#16a34a", lineHeight:1}}>
                  {altTotal.toLocaleString()}
                </span>
                <span style={{fontSize:14, color:isDark?"#94a3b8":"#555", fontWeight:500}}>
                  {catConfig.unit} per year
                </span>
              </div>
              <div style={{display:"flex", alignItems:"center", gap:8}}>
                <div style={{flex:1, height:6, borderRadius:99, background:isDark?"#2a3347":"#e5e7eb", overflow:"hidden"}}>
                  <div style={{height:"100%", width:`${Math.min(100,(altScore/10)*100)}%`, background:"#16a34a", borderRadius:99}}/>
                </div>
                <span style={{fontSize:11, color:"#16a34a", fontWeight:700, whiteSpace:"nowrap"}}>{scoreLabel(altScore)} risk</span>
              </div>
            </div>

            {/* The big why */}
            <div style={{background:isDark?"#1e2433":"#fff", borderRadius:12, padding:"14px 16px", border:`1px solid ${isDark?"#2a3347":"#d1fae5"}`}}>
              <div style={{fontFamily:"'Outfit',sans-serif", fontWeight:800, fontSize:22, color:"#16a34a", marginBottom:4}}>
                {reductionPct}% fewer exposures
              </div>
              <div style={{fontSize:13, color:isDark?"#94a3b8":"#444", lineHeight:1.6}}>
                That's <strong style={{color:text}}>{reduction.toLocaleString()} fewer {catConfig.unit}</strong> containing {exposureNames} for your household every year.
                {hasKids && (
                  <span style={{color:"#d97706"}}> For your {kids} child{kids>1?"ren":""}, whose developing systems are 2-3x more sensitive to these chemicals, this matters most.</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── OVER TIME ── */}
        {tab === "overtime" && (
          <div>
            {/* Single cumulative view — cleaner than 3 separate cards */}
            <div style={{fontSize:12, color:muted, lineHeight:1.6, marginBottom:14}}>
              Cumulative {catConfig.unit} containing <strong style={{color:text}}>{exposureNames}</strong> for your household if you keep using this product vs switching now.
            </div>

            {[
              {years:1,  label:"1 year"},
              {years:5,  label:"5 years"},
              {years:10, label:"10 years"},
            ].map(({years, label}) => {
              const curr   = totalCurrent * years;
              const alt    = altTotal * years;
              const saved  = curr - alt;
              const pct    = Math.round((saved/curr)*100);
              return (
                <div key={years} style={{marginBottom:12}}>
                  <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6}}>
                    <span style={{fontSize:12, fontWeight:700, color:text}}>{label}</span>
                    <span style={{fontSize:11, color:"#16a34a", fontWeight:700, background:isDark?"#1a2a1a":"#f0fdf4", padding:"2px 8px", borderRadius:20}}>
                      {pct}% less by switching
                    </span>
                  </div>

                  {/* Current */}
                  <div style={{marginBottom:5}}>
                    <div style={{display:"flex", justifyContent:"space-between", marginBottom:3}}>
                      <span style={{fontSize:11, color:scoreColor(score), fontWeight:600}}>Current product</span>
                      <span style={{fontSize:12, color:scoreColor(score), fontWeight:800, fontFamily:"'Outfit',sans-serif"}}>{curr.toLocaleString()}</span>
                    </div>
                    <div style={{height:10, borderRadius:99, background:isDark?"#2a3347":"#e5e7eb", overflow:"hidden"}}>
                      <div style={{height:"100%", width:"100%", background:scoreColor(score), borderRadius:99}}/>
                    </div>
                  </div>

                  {/* Kids bar if applicable */}
                  {hasKids && (() => {
                    const kidsOnly = perYear * kids * 2.5 * years;
                    const pctBar   = Math.min(100, Math.round((kidsOnly/curr)*100));
                    return (
                      <div style={{marginBottom:5}}>
                        <div style={{display:"flex", justifyContent:"space-between", marginBottom:3}}>
                          <span style={{fontSize:11, color:"#d97706", fontWeight:600}}>
                            {kids} child{kids>1?"ren":""} (2.5x sensitivity)
                          </span>
                          <span style={{fontSize:12, color:"#d97706", fontWeight:800, fontFamily:"'Outfit',sans-serif"}}>{kidsOnly.toLocaleString()}</span>
                        </div>
                        <div style={{height:10, borderRadius:99, background:isDark?"#2a3347":"#e5e7eb", overflow:"hidden"}}>
                          <div style={{height:"100%", width:`${pctBar}%`, background:"#d97706", borderRadius:99}}/>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Alternative */}
                  <div>
                    <div style={{display:"flex", justifyContent:"space-between", marginBottom:3}}>
                      <span style={{fontSize:11, color:"#16a34a", fontWeight:600}}>{altName}</span>
                      <span style={{fontSize:12, color:"#16a34a", fontWeight:800, fontFamily:"'Outfit',sans-serif"}}>{alt.toLocaleString()}</span>
                    </div>
                    <div style={{height:10, borderRadius:99, background:isDark?"#2a3347":"#e5e7eb", overflow:"hidden"}}>
                      <div style={{height:"100%", width:`${Math.round((alt/curr)*100)}%`, background:"#16a34a", borderRadius:99}}/>
                    </div>
                  </div>

                  {/* Plain-English saved */}
                  <div style={{fontSize:12, color:muted, marginTop:6}}>
                    Switching eliminates <strong style={{color:text}}>{saved.toLocaleString()} {catConfig.unit}</strong> containing {exposureNames} over {label}.
                  </div>
                  {years < 10 && <div style={{borderTop:`1px solid ${border}`, marginTop:12}}/>}
                </div>
              );
            })}

            {hasKids && (
              <div style={{fontSize:11, color:"#d97706", marginTop:6, lineHeight:1.5, padding:"8px 12px", background:isDark?"#2a1a00":"#fffbeb", borderRadius:8, border:"1px solid #fde68a"}}>
                Children's exposure is shown at 2.5x adult sensitivity — developing immune and hormonal systems are significantly more sensitive to {exposureNames} (Grandjean and Landrigan, The Lancet Neurology 2014).
              </div>
            )}
          </div>
        )}

        {/* ── SWITCH & SAVE ── */}
        {tab === "switch" && (
          <div>
            {/* Spend input — used only for Trasande health cost estimate */}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11, color:muted, fontWeight:600, marginBottom:5}}>
                What do you spend on this per month? ($)
              </div>
              <div style={{display:"flex", alignItems:"center", gap:8}}>
                <input type="number" min={1} max={500} value={spend}
                  onChange={e=>setSpend(Math.max(1,parseInt(e.target.value)||1))}
                  style={{width:80, padding:"7px 10px", borderRadius:8, fontSize:14, fontWeight:700,
                    border:`1px solid ${border}`, background:surface, color:text}}/>
                <span style={{fontSize:12, color:muted}}>per month = <strong>${annualSpend}/yr</strong></span>
              </div>
            </div>

            {/* Kids health cost card */}
            {hasKids && healthSaved > 0 && (
              <div style={{background:isDark?"#2a1a00":"#fffbeb", borderRadius:10, padding:"12px 14px", border:"1px solid #fde68a", marginBottom:10}}>
                <div style={{fontSize:11, color:"#d97706", fontWeight:700, marginBottom:4, display:"flex", alignItems:"center", gap:5}}>
                  <IcoProfile size={13}/> Estimated health cost avoided for {kids} child{kids>1?"ren":""}
                </div>
                <div style={{fontFamily:"'Outfit',sans-serif", fontWeight:800, fontSize:24, color:"#d97706", marginBottom:4}}>
                  ~${healthSaved}/year
                </div>
                <div style={{fontSize:11, color:muted, lineHeight:1.5}}>
                  Based on Trasande et al. (2018) — EDC-related health costs estimated at ~$494/child/year. Switching eliminates {reductionPct}% of {exposureNames} exposure for children in your household.
                </div>
              </div>
            )}

            {/* The bottom line */}
            <div style={{background:isDark?"#1e2433":"#fff", borderRadius:10, padding:"14px 16px", border:`1px solid ${isDark?"#2a3347":"#d1fae5"}`}}>
              <div style={{fontFamily:"'Outfit',sans-serif", fontWeight:800, fontSize:20, color:"#16a34a", marginBottom:6}}>
                {reductionPct}% less {exposureNames} exposure
              </div>
              <div style={{fontSize:12, color:muted, lineHeight:1.6}}>
                Switching to <strong style={{color:text}}>{altName}</strong> eliminates <strong style={{color:text}}>{reduction.toLocaleString()} {catConfig.unit}</strong> of {exposureNames} from your household per year.
                {hasKids && <span style={{color:"#d97706"}}> For the {kids} child{kids>1?"ren":""} in your household, whose developing systems are more sensitive to these chemicals, this is one of the most impactful switches you can make.</span>}
              </div>
              {result.break_even?.uses && (
                <div style={{fontSize:11, color:muted, marginTop:8, opacity:0.7}}>
                  Sustainability break-even: ~{result.break_even.uses} uses. {result.break_even.source}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── FOOD ANALYSIS DROPDOWN — food_beverage only ──────────────
const NOVA_LABELS = {
  whole_food:          { label:"Whole Food",           color:"#16a34a", bg:"#f0fdf4", border:"#bbf7d0" },
  minimally_processed: { label:"Minimally Processed",  color:"#0891b2", bg:"#ecfeff", border:"#a5f3fc" },
  processed:           { label:"Processed",             color:"#d97706", bg:"#fffbeb", border:"#fde68a" },
  ultra_processed:     { label:"Ultra-Processed",       color:"#dc2626", bg:"#fef2f2", border:"#fecaca" },
};
const SEVERITY_CONFIG = {
  high:   { color:"#dc2626", bg:"#fef2f2", border:"#fecaca",  icon:"⚠" },
  medium: { color:"#d97706", bg:"#fffbeb", border:"#fde68a",  icon:"◆" },
  low:    { color:"#6b7280", bg:"#f9fafb", border:"#e5e7eb",  icon:"•" },
};
const TYPE_LABELS = {
  artificial_dye:       "Artificial Dye",
  synthetic_preservative:"Preservative",
  sweetener:            "Sweetener",
  additive:             "Additive",
  processing:           "Processing",
};

const FoodAnalysisDropdown = ({food, isDark}) => {
  const [open, setOpen] = useState(false);
  if (!food) return null;

  const nova   = NOVA_LABELS[food.processing_level] || NOVA_LABELS.processed;
  const highs  = (food.concerns || []).filter(c => c.severity === "high");
  const meds   = (food.concerns || []).filter(c => c.severity === "medium");
  const lows   = (food.concerns || []).filter(c => c.severity === "low");
  const hasAny = food.concerns?.length > 0 || food.positives?.length > 0;

  const headerBg     = isDark ? "#1e2433" : "#f9fafb";
  const headerBorder = highs.length > 0 ? "#fecaca" : isDark ? "#2a3347" : "#e5e7eb";
  const headerColor  = highs.length > 0 ? "#dc2626" : isDark ? "#94a3b8" : "#555";

  return (
    <div style={{marginBottom:10, borderRadius:14, overflow:"hidden", border:`1.5px solid ${headerBorder}`, background:isDark?"#1e2433":"#f9fafb", textAlign:"left"}}>
      <button onClick={()=>setOpen(o=>!o)} style={{width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 16px", background:"none", border:"none", cursor:"pointer", gap:8}}>
        <div style={{display:"flex", alignItems:"center", gap:8, flexWrap:"wrap"}}>
          <span style={{display:"flex", alignItems:"center", opacity:0.9}}><IcoIngredients size={20}/></span>
          <span style={{fontSize:12, color:headerColor, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em"}}>Ingredients & Nutrition</span>
          {/* Processing level pill */}
          <span style={{fontSize:11, fontWeight:700, padding:"2px 9px", borderRadius:20, background:nova.bg, color:nova.color, border:`1px solid ${nova.border}`}}>
            {nova.label}
          </span>
          {highs.length > 0 && (
            <span style={{fontSize:11, fontWeight:700, padding:"2px 9px", borderRadius:20, background:"#fef2f2", color:"#dc2626", border:"1px solid #fecaca"}}>
              {highs.length} high concern{highs.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <span style={{fontSize:12, color:headerColor, transition:"transform 0.2s", display:"inline-block", transform:open?"rotate(180deg)":"rotate(0deg)", flexShrink:0}}>▾</span>
      </button>

      {open && (
        <div style={{padding:"0 16px 14px", borderTop:`1px solid ${headerBorder}`}}>

          {/* Processing level detail */}
          <div style={{marginTop:12, marginBottom:14, padding:"10px 14px", borderRadius:10, background:nova.bg, border:`1px solid ${nova.border}`}}>
            <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:4}}>
              <span style={{fontSize:13, fontWeight:700, color:nova.color}}>NOVA {food.nova_score} — {nova.label}</span>
            </div>
            {food.processing_label && (
              <div style={{fontSize:12, color:nova.color, opacity:0.85}}>{food.processing_label}</div>
            )}
          </div>

          {/* Concerns by severity */}
          {[{items:highs, label:"High Concern"}, {items:meds, label:"Medium Concern"}, {items:lows, label:"Low Concern"}].map(({items, label}) =>
            items.length > 0 && (
              <div key={label} style={{marginBottom:12}}>
                <div style={{fontSize:10, fontWeight:700, color:SEVERITY_CONFIG[items[0].severity].color, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6}}>{label}</div>
                <div style={{display:"flex", flexDirection:"column", gap:6}}>
                  {items.map((c, i) => {
                    const cfg = SEVERITY_CONFIG[c.severity];
                    return (
                      <div key={i} style={{padding:"8px 12px", borderRadius:10, background:isDark?"#1a1a2e":cfg.bg, border:`1px solid ${cfg.border}`}}>
                        <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:3, flexWrap:"wrap"}}>
                          <span style={{fontSize:12, fontWeight:700, color:cfg.color}}>{c.ingredient}</span>
                          {c.type && TYPE_LABELS[c.type] && (
                            <span style={{fontSize:10, fontWeight:600, color:cfg.color, opacity:0.75, background:"rgba(0,0,0,0.05)", padding:"1px 6px", borderRadius:8}}>{TYPE_LABELS[c.type]}</span>
                          )}
                        </div>
                        <div style={{fontSize:12, color:isDark?"#94a3b8":"#555", lineHeight:1.5}}>{c.reason}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          )}

          {/* Positives */}
          {food.positives?.length > 0 && (
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10, fontWeight:700, color:"#16a34a", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6}}>Positive Attributes</div>
              <div style={{display:"flex", flexDirection:"column", gap:6}}>
                {food.positives.map((p, i) => (
                  <div key={i} style={{padding:"8px 12px", borderRadius:10, background:isDark?"#1a2a1a":"#f0fdf4", border:"1px solid #bbf7d0", display:"flex", alignItems:"flex-start", gap:8}}>
                    <span style={{color:"#16a34a", fontWeight:700, fontSize:14, flexShrink:0}}>✓</span>
                    <div>
                      <div style={{fontSize:12, fontWeight:700, color:"#16a34a", marginBottom:2}}>{p.attribute}</div>
                      {p.reason && <div style={{fontSize:12, color:isDark?"#94a3b8":"#555", lineHeight:1.5}}>{p.reason}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No concerns */}
          {!hasAny && (
            <div style={{fontSize:13, color:isDark?"#94a3b8":"#555", marginTop:10, fontStyle:"italic"}}>No specific ingredient concerns identified.</div>
          )}

          {/* Confidence note */}
          {food.confidence_note && food.confidence !== "high" && (
            <div style={{fontSize:11, color:isDark?"#64748b":"#999", marginTop:10, display:"flex", alignItems:"center", gap:4}}>
              <IcoInfo size={12}/> {food.confidence_note}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── DIMENSION DROPDOWN — reusable for all 4 main dimensions ──
const DimensionDropdown = ({icon, label, score, concerns, children, isDark}) => {
  const [open, setOpen] = useState(false);
  const isHigh      = score > 6;
  const color       = isHigh ? "#dc2626" : (isDark ? "#94a3b8" : "#555");
  const bg          = isHigh ? (isDark ? "#2a1a1a" : "#fef2f2") : (isDark ? "#1e2433" : "#f9fafb");
  const borderColor = isHigh ? "#fecaca" : (isDark ? "#2a3347" : "#e5e7eb");
  return (
    <div style={{marginBottom:10, borderRadius:14, overflow:"hidden", border:`1.5px solid ${borderColor}`, background:bg, textAlign:"left"}}>
      <button onClick={()=>setOpen(o=>!o)} style={{width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 16px", background:"none", border:"none", cursor:"pointer", gap:8}}>
        <div style={{display:"flex", alignItems:"center", gap:8}}>
          <span style={{display:"flex", alignItems:"center", opacity: isHigh ? 1 : 0.85}}>{icon}</span>
          <span style={{fontSize:12, color, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em"}}>{label}</span>
          <span style={{fontSize:13, fontWeight:800, color, fontFamily:"'Outfit',sans-serif"}}>{score}/10</span>
          {isHigh && <span style={{fontSize:11, color:"#dc2626", fontWeight:600, background:"#fef2f2", padding:"2px 8px", borderRadius:10}}>{scoreLabel(score)}</span>}
        </div>
        <span style={{fontSize:12, color, transition:"transform 0.2s", display:"inline-block", transform:open?"rotate(180deg)":"rotate(0deg)"}}>▾</span>
      </button>
      {open && (
        <div style={{padding:"0 16px 14px", borderTop:`1px solid ${borderColor}`, textAlign:"left"}}>
          {children}
          {concerns?.length > 0 && (
            <div style={{display:"flex", flexDirection:"column", gap:6, marginTop:10}}>
              {concerns.map((c,i)=>(
                <div key={i} style={{display:"flex", alignItems:"flex-start", gap:8}}>
                  <span style={{color, fontSize:14, lineHeight:1.5, flexShrink:0, marginTop:1}}>•</span>
                  <span style={{fontSize:13, color:isDark?"#94a3b8":"#555", lineHeight:1.5, textAlign:"left"}}>{c}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── MANUFACTURING BADGE — smaller, always shows estimated ──
const ManufacturingBadge = ({mfg, isDark, muted}) => {
  const [open, setOpen] = useState(false);
  if (!mfg) return null;
  const score = mfg.score || 5;
  const color = scoreColor(score);
  return (
    <div style={{marginBottom:10}}>
      <button onClick={()=>setOpen(o=>!o)} style={{display:"flex", alignItems:"center", gap:8, background:isDark?"#1e2433":"#f9fafb", border:`1px dashed ${isDark?"#2a3347":"#d1d5db"}`, borderRadius:10, padding:"10px 16px", cursor:"pointer", width:"100%"}}>
        <span style={{display:"flex", alignItems:"center", opacity:0.85}}><IcoVerified size={20}/></span>
        <span style={{fontSize:12, color:muted, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em"}}>Manufacturing</span>
        <span style={{fontSize:13, fontWeight:800, color, fontFamily:"'Outfit',sans-serif"}}>{score}/10</span>
        <span style={{fontSize:10, color:muted, fontStyle:"italic"}}>— estimated</span>
        <span style={{fontSize:12, color:muted, marginLeft:"auto", transition:"transform 0.2s", display:"inline-block", transform:open?"rotate(180deg)":"rotate(0deg)"}}>▾</span>
      </button>
      {open && (
        <div style={{padding:"10px 16px 14px", background:isDark?"#1a2030":"#f9fafb", borderRadius:"0 0 10px 10px", border:`1px dashed ${isDark?"#2a3347":"#d1d5db"}`, borderTop:"none", textAlign:"left"}}>
          <p style={{fontSize:12, color:muted, lineHeight:1.6, margin:"0 0 8px", fontStyle:"italic"}}>{mfg.label}</p>
          {mfg.concerns?.map((c,i)=>(
            <div key={i} style={{fontSize:12, color:muted, lineHeight:1.5, marginBottom:4}}>• {c}</div>
          ))}
          <div style={{fontSize:10, color:muted, marginTop:8, opacity:0.6, display:"flex", alignItems:"center", gap:4}}><IcoInfo size={12}/> Manufacturing data is estimated where public supply chain information is unavailable.</div>
        </div>
      )}
    </div>
  );
};

// ── LEGACY SHIMS — kept so other code that references these doesn't break ──
const PlasticScoreDropdown = ({result, isDark, muted}) => null;
const HealthScoreDropdown  = ({result, isDark, muted}) => null;

// ── SHARE BADGE (with copy-as-image) ─────────────────────────
const ShareBadge = ({result}) => {
  const [sharing,     setSharing]     = useState(false);
  const [done,        setDone]        = useState(false);
  const safeName    = (result.product_name || "").startsWith("http") ? "Scanned product" : result.product_name;
  const displayName = safeName?.length > 40 ? safeName.slice(0, 37) + "…" : safeName;
  const color       = scoreColor(result.overall_score || result.score);
  const label       = scoreLabel(result.overall_score || result.score);

  const buildCanvas = () => {
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      const dpr    = window.devicePixelRatio || 1;
      const W = 600, H = 400;
      canvas.width  = W * dpr;
      canvas.height = H * dpr;
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);

      const os = result.overall_score || result.score;
      const dims = result.dimensions;

      const overallColor = os<=3?"#16a34a":os<=6?"#ca8a04":os<=8?"#ea580c":"#dc2626";
      const bgColor = os<=3?"#f0fdf4":os<=6?"#fefce8":os<=8?"#fff7ed":"#fff5f5";

      const drawContent = (logoImg) => {

    // ── Background ──
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 20);
    ctx.fill();

    // Top bar
    ctx.fillStyle = "#052e16";
    ctx.fillRect(0, 0, W, 6);

    // ── Logo + tagline ──
    if (logoImg) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(46, 40, 16, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(logoImg, 30, 24, 32, 32);
      ctx.restore();
    } else {
      ctx.fillStyle = "#16a34a";
      ctx.beginPath();
      ctx.arc(46, 40, 14, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#052e16";
    ctx.font = "bold 16px system-ui";
    ctx.fillText("Partiqule", 68, 45);
    ctx.fillStyle = "#aaa";
    ctx.font = "12px system-ui";
    ctx.fillText("Scan anything. Know everything.", 32, 68);

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

    // Overall label pill
    const overallLabel = os<=3?"Minimal Risk":os<=6?"Moderate Risk":os<=8?"High Risk":"Very High Risk";
    const oBgColor = os<=3?"#dcfce7":os<=6?"#fef9c3":os<=8?"#ffedd5":"#fee2e2";
    ctx.fillStyle = oBgColor;
    ctx.beginPath();
    ctx.roundRect(32, 234, 210, 30, 15);
    ctx.fill();
    ctx.fillStyle = overallColor;
    ctx.font = "bold 13px system-ui";
    ctx.fillText(overallLabel, 48, 254);

    // Sub-label
    ctx.fillStyle = "#aaa";
    ctx.font = "11px system-ui";
    ctx.fillText("Materials · Exposure · Packaging · Sustainability", 32, 282);

    // ── DIVIDER ──
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W/2 - 10, 108);
    ctx.lineTo(W/2 - 10, 300);
    ctx.stroke();

    // ── RIGHT: 5 dimension mini bars ──
    const RX = W/2 + 10;
    const dimList = dims ? [
      {label:"Materials",    score: dims.materials?.score,        weight:"40%"},
      {label:"Exposure",     score: dims.usage_exposure?.score,   weight:"25%"},
      {label:"Packaging",    score: dims.packaging?.score,        weight:"15%"},
      {label:"Sustainability",score:dims.sustainability?.score,   weight:"15%"},
      {label:"Manufacturing",score: dims.manufacturing?.score,    weight:"5%"},
    ] : [];

    if (dimList.length) {
      dimList.forEach((d, i) => {
        const y = 118 + i * 38;
        const sc = d.score || 0;
        const barColor = sc<=3?"#16a34a":sc<=6?"#ca8a04":sc<=8?"#ea580c":"#dc2626";
        // Label
        ctx.fillStyle = "#666";
        ctx.font = "10px system-ui";
        ctx.fillText(d.label, RX+4, y);
        ctx.fillStyle = "#bbb";
        ctx.fillText(d.weight, W-48, y);
        // Track
        ctx.fillStyle = "#e5e7eb";
        ctx.beginPath();
        ctx.roundRect(RX+4, y+6, W-RX-28, 12, 6);
        ctx.fill();
        // Fill
        ctx.fillStyle = barColor;
        ctx.beginPath();
        ctx.roundRect(RX+4, y+6, Math.max(12, ((W-RX-28) * sc/10)), 12, 6);
        ctx.fill();
        // Score text
        ctx.fillStyle = barColor;
        ctx.font = "bold 10px system-ui";
        ctx.fillText(sc, W-22, y+16);
      });
    } else {
      // Fallback if no dimensions — just show score
      ctx.fillStyle = "#888";
      ctx.font = "13px system-ui";
      ctx.fillText("Overall Health Score", RX+14, 145);
      ctx.fillStyle = overallColor;
      ctx.font = "bold 48px system-ui";
      ctx.fillText(`${os}/10`, RX+14, 210);
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

        resolve(canvas);
      }; // end drawContent

      const logoImg = new Image();
      logoImg.onload = () => drawContent(logoImg);
      logoImg.onerror = () => drawContent(null);
      logoImg.src = "/partiqule-icon.svg";
    });
  };

  const share = async () => {
    setSharing(true);
    try {
      const canvas = await buildCanvas();
      canvas.toBlob(async (blob) => {
        try {
          // Mobile: use native share sheet if available — lets users save to photos or share to any app
          if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([blob], "partiqule.png", { type: "image/png" })] })) {
            const file = new File([blob], `partiqule-${safeName?.slice(0,20)||"result"}.png`, { type: "image/png" });
            await navigator.share({
              title: `${safeName}: Health Score ${result.overall_score||result.score}/10`,
              text: `I scanned ${safeName} on Partiqule. Health score: ${result.overall_score||result.score}/10. Scored across materials, exposure, packaging, sustainability and manufacturing. Scan anything at partiqule.com`,
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
          <div style={{width:34, height:34, borderRadius:8, background:scoreBg(result.overall_score||result.score), display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:16, color}}>{result.overall_score||result.score}</div>
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
  "Non-stick pan coatings can begin releasing PTFE particles at everyday cooking temperatures.",
  "Microplastics have been detected in the air we breathe indoors and outdoors.",
  "A 2024 study in the New England Journal of Medicine found microplastics in arterial plaques — linked to higher risk of heart attack and stroke.",
  "Lipton tea bags release approximately 11 billion microplastic particles per single cup of tea.",
  "Synthetic gum base in mainstream chewing gum is made from polyvinyl acetate — a plastic you literally chew and swallow.",
  "Microplastics were found in 100% of human blood samples tested in a 2022 Environment International study.",
  "The FDA has begun phasing out all petroleum-based synthetic food dyes, including Red 40 and Yellow 5.",
  "PFAS — found in non-stick cookware, food packaging, and stain-resistant clothing — are linked to thyroid disruption, reduced fertility and elevated cholesterol.",
  "A 2024 Nature Medicine study found microplastics accumulating in human brain tissue — at higher concentrations in people with dementia.",
  "Microplastics have been detected in human placentas, meaning unborn babies are exposed before birth.",
  "Ultra-processed foods are linked to chronic disease, cardiovascular risk and cognitive decline according to a 2025 Lancet review.",
  "The plastic in synthetic clothing — polyester, nylon, acrylic — sheds microfibers every time it's worn and washed.",
  "Single-use paper towels are chemically bleached with chlorine and typically wrapped in plastic film — a sustainability double-hit.",
  "Stainless steel, cast iron, glass and ceramic cookware produce zero microplastic particles during cooking.",
  "Switching from a plastic water bottle to stainless steel can eliminate over 50 plastic-to-mouth exposures per week.",
  "Wet wipes contain polyester or polypropylene fibers — each wipe sheds synthetic fibers directly onto your skin.",
  "BPA-free plastics often contain BPS or BPF, which studies show have similar hormone-disrupting effects to BPA.",
  "Food stored in glass containers has zero plastic leaching risk — even when heated, frozen or acidic foods are involved.",
];

const LoadingState = () => {
  const [step,    setStep]    = useState(0);
  const [progress,setProgress]= useState(0);
  const [factIdx, setFactIdx] = useState(()=>Math.floor(Math.random()*LOADING_FACTS.length));

  const steps = [
    "Searching for product data…",
    "Running material analysis…",
    "Auditing the score…",
    "Finding safer alternatives…"
  ];

  useEffect(() => {
    const start = Date.now();
    const duration = 22000; // scans typically take 15-25s
    const tick = () => {
      const elapsed = Date.now() - start;
      const raw = elapsed / duration;
      const p = Math.min(92, Math.round((1 - Math.pow(1 - raw, 2.2)) * 100));
      setProgress(p);
      if (p < 92) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    const stepTimers = [
      setTimeout(()=>setStep(1), 4000),   // web search done
      setTimeout(()=>setStep(2), 12000),  // pass1 done
      setTimeout(()=>setStep(3), 18000),  // pass2 done
    ];
    const factTimer = setInterval(()=>setFactIdx(i=>(i+1)%LOADING_FACTS.length), 5000);
    return () => { stepTimers.forEach(clearTimeout); clearInterval(factTimer); };
  }, []);

  return (
    <div style={{margin:"24px auto 0", maxWidth:540, textAlign:"center"}}>
      <div style={{fontSize:22, fontWeight:700, color:"#fff", marginBottom:8, minHeight:34}}>
        {steps[step]}
      </div>
      <div style={{fontSize:14, color:"rgba(255,255,255,0.4)", marginBottom:24}}>
        This takes 15–25 seconds — we search the web then run two AI passes for accuracy.
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
  const [priceFilter, setPriceFilter] = useState("all");
  const avg = history.length ? Math.round(history.reduce((a,h)=>a+h.score,0)/history.length*10)/10 : 0;
  const highest = history.length ? history.reduce((a,h)=>h.score>a.score?h:a, history[0]) : null;

  // Collect all alternatives from scan history, deduplicate by name
  const allAlts = [];
  const seen = new Set();
  history.forEach(item => {
    (item.alternatives || []).forEach(alt => {
      if (!seen.has(alt.name) && alt.affiliateUrl) {
        seen.add(alt.name);
        allAlts.push({...alt, fromProduct: item.product_name, fromScore: item.score});
      }
    });
  });

  // Price filter logic
  const parsePrice = (priceStr) => {
    if (!priceStr || priceStr === "See on Amazon") return null;
    const match = priceStr.replace(/[$,]/g, "").match(/[\d.]+/);
    return match ? parseFloat(match[0]) : null;
  };

  const filteredAlts = allAlts.filter(alt => {
    if (priceFilter === "all") return true;
    const price = parsePrice(alt.price);
    if (!price) return priceFilter === "all";
    if (priceFilter === "under15") return price < 15;
    if (priceFilter === "under30") return price < 30;
    if (priceFilter === "under50") return price < 50;
    if (priceFilter === "over50") return price >= 50;
    return true;
  });

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
    <div style={{maxWidth:900, margin:"0 auto", padding:isMobile?"20px 16px 60px":"48px 40px 80px"}}>
      <div style={{marginBottom:isMobile?24:40}}>
        <h1 style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:isMobile?24:32, color:text, margin:"0 0 8px", letterSpacing:"-0.5px"}}>My Scans</h1>
        <p style={{fontSize:15, color:muted, margin:0}}>Your scan history and recommended safer alternatives</p>
      </div>

      {history.length === 0 ? (
        <div style={{textAlign:"center", padding:"80px 0", color:muted}}>
          <div style={{display:"flex",justifyContent:"center",marginBottom:16}}><IcoScan size={48}/></div>
          <div style={{fontFamily:"'Outfit',sans-serif", fontWeight:600, fontSize:18, color:text, marginBottom:8}}>No scans yet</div>
          <div style={{fontSize:14, marginBottom:24}}>Search for a product to get started</div>
          <button onClick={()=>onSearch("")} style={{padding:"10px 24px", borderRadius:8, border:"none", background:"#16a34a", color:"#fff", fontWeight:600, fontSize:14, cursor:"pointer"}}>Start Scanning</button>
        </div>
      ) : (
        <>
          {/* Stats cards */}
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:40}}>
            <div style={{background:surface, borderRadius:16, padding:"24px 28px", border:`1.5px solid ${border}`}}>
              <div style={{fontSize:12, color:muted, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:12}}>Average Health Score</div>
              <div style={{display:"flex", alignItems:"flex-end", gap:8, marginBottom:10}}>
                <span style={{fontFamily:"'Outfit',sans-serif", fontWeight:800, fontSize:48, color:avg<=3?"#16a34a":avg<=6?"#d97706":"#dc2626", lineHeight:1}}>{avg}</span>
                <span style={{fontSize:14, color:muted, marginBottom:8}}>/10</span>
              </div>
              <div style={{height:6, borderRadius:99, background:"#e5e7eb", overflow:"hidden"}}>
                <div style={{height:"100%", width:`${(avg/10)*100}%`, background:avg<=3?"#16a34a":avg<=6?"#d97706":"#dc2626", borderRadius:99, transition:"width 1s ease"}}/>
              </div>
              <div style={{fontSize:12, color:muted, marginTop:8}}>Across {history.length} scan{history.length!==1?"s":""}</div>
            </div>
            {highest && (
              <div style={{background:surface, borderRadius:16, padding:"24px 28px", border:`1.5px solid ${border}`}}>
                <div style={{fontSize:12, color:muted, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:12}}>Highest Risk Found</div>
                <div style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:16, color:text, marginBottom:6, lineHeight:1.3}}>{highest.product_name}</div>
                <div style={{display:"inline-flex", alignItems:"center", gap:6, background:"#fee2e2", color:"#dc2626", padding:"4px 12px", borderRadius:20, fontSize:13, fontWeight:700}}>
                  {highest.score}/10 — {highest.score>=8?"Very High":highest.score>=6?"High":"Moderate"} Risk
                </div>
                <div style={{fontSize:12, color:"#16a34a", fontWeight:600, marginTop:10, cursor:"pointer"}} onClick={()=>onSelect(highest)}>
                  View result →
                </div>
              </div>
            )}
          </div>

          {/* Household Exposure Summary */}
          {history.length >= 2 && (() => {
            const [expanded, setExpanded] = React.useState(false);
            const [adults2,  setAdults2]  = React.useState(2);
            const [kids2,    setKids2]    = React.useState(0);

            // Sort by score descending, pick top concerns
            const sorted      = [...history].sort((a,b)=>(b.overall_score||b.score)-(a.overall_score||a.score));
            const highRisk    = sorted.filter(h=>(h.overall_score||h.score)>=6);
            const totalScore  = history.reduce((a,h)=>a+(h.overall_score||h.score),0);
            const avgScore    = Math.round((totalScore/history.length)*10)/10;

            // Estimate total annual exposures across all daily-use products
            const FREQ_MAP = {daily:365, weekly:52, occasional:18, rare:6};
            let totalExposures = 0;
            let totalAltExposures = 0;
            history.forEach(item => {
              const s     = item.overall_score || item.score;
              const freq  = item.dimensions?.usage_exposure?.frequency || item.exposure_frequency || "daily";
              const perYr = FREQ_MAP[freq] || 365;
              const ppl   = adults2 + kids2 * 2.5;
              totalExposures    += perYr * ppl;
              totalAltExposures += Math.round(perYr * ppl * (Math.max(1,Math.round(s*0.3)) / s));
            });
            const totalReduction    = Math.round(totalExposures - totalAltExposures);
            const totalReductionPct = Math.round((totalReduction / totalExposures) * 100);

            const Stepper2 = ({label, value, setValue}) => (
              <div>
                <div style={{fontSize:10, color:muted, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4}}>{label}</div>
                <div style={{display:"flex", alignItems:"center", gap:5}}>
                  <button onClick={()=>setValue(v=>Math.max(0,v-1))} style={{width:24,height:24,borderRadius:5,border:`1px solid ${border}`,background:surface,color:text,cursor:"pointer",fontSize:14,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>−</button>
                  <span style={{fontWeight:700,fontSize:14,color:text,minWidth:16,textAlign:"center"}}>{value}</span>
                  <button onClick={()=>setValue(v=>Math.min(8,v+1))} style={{width:24,height:24,borderRadius:5,border:`1px solid ${border}`,background:surface,color:text,cursor:"pointer",fontSize:14,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>+</button>
                </div>
              </div>
            );

            return (
              <div style={{marginBottom:40, background:isDark?"#1a2a1a":"#f0fdf4", borderRadius:16, border:`1.5px solid ${isDark?"#1e3a1e":"#bbf7d0"}`, overflow:"hidden"}}>
                <button onClick={()=>setExpanded(e=>!e)} style={{width:"100%", padding:"16px 20px", background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between"}}>
                  <div style={{textAlign:"left"}}>
                    <div style={{fontSize:11, color:"#16a34a", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:3}}>
                      Household Exposure Overview
                    </div>
                    <div style={{fontSize:14, color:text, fontWeight:600}}>
                      {history.length} products scanned — average score {avgScore}/10
                      {highRisk.length > 0 && <span style={{color:"#dc2626"}}> · {highRisk.length} high concern{highRisk.length!==1?"s":""}</span>}
                    </div>
                  </div>
                  <span style={{fontSize:13, color:"#16a34a", transition:"transform 0.2s", display:"inline-block", transform:expanded?"rotate(180deg)":"rotate(0deg)", flexShrink:0}}>▾</span>
                </button>

                {expanded && (
                  <div style={{padding:"0 20px 20px", borderTop:`1px solid ${isDark?"#1e3a1e":"#bbf7d0"}`}}>

                    {/* Household inputs */}
                    <div style={{display:"flex", gap:20, marginTop:16, marginBottom:16}}>
                      <Stepper2 label="Adults" value={adults2} setValue={v=>setAdults2(Math.max(1,v))}/>
                      <Stepper2 label="Children" value={kids2} setValue={setKids2}/>
                    </div>

                    {/* Top concerns */}
                    {highRisk.length > 0 && (
                      <div style={{marginBottom:16}}>
                        <div style={{fontSize:11, color:muted, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8}}>Highest concern products</div>
                        <div style={{display:"flex", flexDirection:"column", gap:6}}>
                          {sorted.slice(0,3).map((item,i) => {
                            const s = item.overall_score||item.score;
                            return (
                              <button key={i} onClick={()=>onSelect(item)} style={{display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", background:surface, borderRadius:10, border:`1px solid ${border}`, cursor:"pointer", textAlign:"left"}}>
                                <span style={{fontSize:13, color:text, fontWeight:600, flex:1, marginRight:8}}>{item.product_name}</span>
                                <span style={{fontSize:12, fontWeight:700, padding:"2px 10px", borderRadius:20, background:s>=7?"#fef2f2":s>=5?"#fffbeb":"#f0fdf4", color:s>=7?"#dc2626":s>=5?"#d97706":"#16a34a", whiteSpace:"nowrap"}}>{s}/10 — {scoreLabel(s)}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Total exposure summary */}
                    <div style={{background:isDark?"#1e2433":"#fff", borderRadius:12, padding:"14px 16px", border:`1px solid ${isDark?"#2a3347":"#d1fae5"}`}}>
                      <div style={{fontSize:11, color:muted, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:10}}>
                        If you switched every high-risk product
                      </div>
                      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12}}>
                        <div>
                          <div style={{fontSize:10, color:scoreColor(Math.round(avgScore)), fontWeight:700, textTransform:"uppercase", marginBottom:4}}>Current (all products)</div>
                          <div style={{fontFamily:"'Outfit',sans-serif", fontWeight:800, fontSize:28, color:scoreColor(Math.round(avgScore)), lineHeight:1}}>
                            {Math.round(totalExposures).toLocaleString()}
                          </div>
                          <div style={{fontSize:11, color:muted}}>total annual exposures</div>
                        </div>
                        <div>
                          <div style={{fontSize:10, color:"#16a34a", fontWeight:700, textTransform:"uppercase", marginBottom:4}}>After switching</div>
                          <div style={{fontFamily:"'Outfit',sans-serif", fontWeight:800, fontSize:28, color:"#16a34a", lineHeight:1}}>
                            {Math.round(totalAltExposures).toLocaleString()}
                          </div>
                          <div style={{fontSize:11, color:muted}}>total annual exposures</div>
                        </div>
                      </div>
                      <div style={{fontSize:13, color:"#16a34a", fontWeight:700, marginBottom:4}}>
                        {totalReductionPct}% reduction across your whole household
                      </div>
                      <div style={{fontSize:12, color:muted, lineHeight:1.5}}>
                        Switching your scanned products to safer alternatives eliminates an estimated {totalReduction.toLocaleString()} exposure events per year
                        {kids2 > 0 && <span style={{color:"#d97706"}}> — including {kids2} child{kids2>1?"ren":""} at 2.5x sensitivity</span>}.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Recommended alternatives */}
          {filteredAlts.length > 0 && (
            <div style={{marginBottom:48}}>
              <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12, marginBottom:20}}>
                <div>
                  <h2 style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:isMobile?18:22, color:text, margin:"0 0 4px"}}>
                    Recommended Alternatives
                  </h2>
                  <p style={{fontSize:13, color:muted, margin:0}}>Safer swaps based on what you've scanned · #ad affiliate links</p>
                </div>
                {/* Price filter */}
                <div style={{display:"flex", gap:6, flexWrap:"wrap"}}>
                  {[
                    {key:"all", label:"All prices"},
                    {key:"under15", label:"Under $15"},
                    {key:"under30", label:"Under $30"},
                    {key:"under50", label:"Under $50"},
                    {key:"over50", label:"$50+"},
                  ].map(f => (
                    <button key={f.key} onClick={()=>setPriceFilter(f.key)}
                      style={{padding:"5px 12px", borderRadius:20, border:`1.5px solid ${priceFilter===f.key?"#16a34a":border}`,
                        background:priceFilter===f.key?"#052e16":"none",
                        color:priceFilter===f.key?"#4ade80":muted,
                        fontSize:12, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap"}}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{display:"grid", gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,1fr)", gap:12}}>
                {filteredAlts.slice(0,9).map((alt, i) => (
                  <a key={i} href={alt.affiliateUrl} target="_blank" rel="noopener noreferrer"
                    style={{textDecoration:"none", display:"block", background:surface, borderRadius:14,
                      border:`1.5px solid ${border}`, overflow:"hidden", transition:"all 0.15s"}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor="#16a34a"; e.currentTarget.style.transform="translateY(-2px)";}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor=border; e.currentTarget.style.transform="none";}}>
                    {/* Score badge */}
                    <div style={{padding:"12px 14px 0"}}>
                      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8}}>
                        <div style={{fontSize:10, fontWeight:700, color:"#16a34a", background:"#f0fdf4", padding:"2px 8px", borderRadius:10}}>
                          {alt.score}/10 danger
                        </div>
                        {alt.price && alt.price !== "See on Amazon" && (
                          <div style={{fontSize:12, fontWeight:700, color:text}}>{alt.price}</div>
                        )}
                      </div>
                      <div style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:13, color:text, marginBottom:4, lineHeight:1.3}}>
                        {alt.name?.length > 45 ? alt.name.slice(0,42)+"…" : alt.name}
                      </div>
                      {alt.brand && (
                        <div style={{fontSize:11, color:muted, marginBottom:6}}>{alt.brand}</div>
                      )}
                      <div style={{fontSize:11, color:muted, lineHeight:1.5, marginBottom:10}}>
                        Safer swap for: <span style={{color:text, fontWeight:500}}>{alt.fromProduct?.length>30?alt.fromProduct.slice(0,27)+"…":alt.fromProduct}</span>
                      </div>
                    </div>
                    <div style={{padding:"8px 14px 12px"}}>
                      <div style={{width:"100%", padding:"7px", borderRadius:8, background:"#052e16", color:"#4ade80", fontSize:12, fontWeight:600, textAlign:"center"}}>
                        Shop now →
                      </div>
                    </div>
                  </a>
                ))}
              </div>
              {filteredAlts.length === 0 && priceFilter !== "all" && (
                <div style={{textAlign:"center", padding:"32px", color:muted, fontSize:14}}>
                  No alternatives found in this price range. <button onClick={()=>setPriceFilter("all")} style={{color:"#16a34a", background:"none", border:"none", fontWeight:600, cursor:"pointer"}}>Show all</button>
                </div>
              )}
            </div>
          )}

          {/* Timeline */}
          <div style={{marginBottom:8}}>
            <h2 style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:isMobile?18:22, color:text, margin:"0 0 24px"}}>Scan History</h2>
            {Object.entries(grouped).map(([date, items]) => (
              <div key={date} style={{marginBottom:36}}>
                <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:16}}>
                  <div style={{fontSize:12, fontWeight:600, color:muted, textTransform:"uppercase", letterSpacing:"0.07em", whiteSpace:"nowrap"}}>{date}</div>
                  <div style={{flex:1, height:1, background:border}}/>
                </div>
                <div style={{position:"relative", paddingLeft:28}}>
                  <div style={{position:"absolute", left:9, top:8, bottom:8, width:2, background:border, borderRadius:2}}/>
                  {items.map((item, i) => (
                    <div key={i} style={{position:"relative", marginBottom:12, cursor:"pointer"}} onClick={()=>onSelect(item)}>
                      <div style={{position:"absolute", left:-24, top:16, width:12, height:12, borderRadius:"50%", background:item.score<=3?"#16a34a":item.score<=6?"#d97706":"#dc2626", border:`2px solid ${surface}`, zIndex:1}}/>
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
                            <span style={{fontSize:11, color:"#16a34a", fontWeight:600}}>Tap to view full result →</span>
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


// ── BARCODE SCANNER ───────────────────────────────────────────


const AboutPage = ({isDark, text, muted, surface, border, isMobile, onScan, onNavigate}) => {
  return (
    <div style={{maxWidth:860, margin:"0 auto", padding:isMobile?"24px 16px 60px":"48px 40px 80px"}}>

      {/* Hero header */}
      <div style={{marginBottom:48}}>
        <div style={{fontSize:12, fontWeight:700, color:"#16a34a", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:16}}>About Partiqule</div>
        <h1 style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:isMobile?32:48, color:text, margin:"0 0 24px", letterSpacing:"-1px", lineHeight:1.15}}>
          Know what's in your products.
        </h1>
        <p style={{fontSize:isMobile?16:18, color:muted, lineHeight:1.85, marginBottom:16, maxWidth:680}}>
          The food you eat, the clothes you wear, the cookware you cook with, the cleaning products in your home. All of it has a measurable impact on your health, your family's health, and the health of the planet. Most of that impact is invisible. There's no label, no warning, no easy way to know what to trust.
        </p>
        <p style={{fontSize:isMobile?17:20, color:"#16a34a", fontWeight:700, lineHeight:1.5, marginBottom:16}}>
          Partiqule exists to change that.
        </p>
        <p style={{fontSize:isMobile?15:16, color:muted, lineHeight:1.85, marginBottom:16, maxWidth:680}}>
          We score every product across five dimensions: materials, exposure, packaging, sustainability, and manufacturing. The result is a complete picture of its impact on your personal health, your home, and the planet. Free, instant, and grounded in published science.
        </p>
        <p style={{fontSize:isMobile?15:16, color:muted, lineHeight:1.85, marginBottom:32, maxWidth:680}}>
          Because when you understand what you're buying, you can make better decisions for yourself and the people you love.
        </p>
        <button onClick={()=>onScan()}
          style={{padding:"12px 28px", borderRadius:10, border:"none", background:"#052e16", color:"#4ade80", fontWeight:700, fontSize:15, cursor:"pointer"}}>
          Try a free scan →
        </button>
      </div>

      {/* Mission */}
      <div style={{marginBottom:48, paddingBottom:48, borderBottom:`1px solid ${border}`}}>
        <h2 style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:26, color:text, margin:"0 0 16px"}}>Our mission</h2>
        <p style={{fontSize:16, color:muted, lineHeight:1.85, marginBottom:16}}>
          The things that affect your health most aren't always the things on the front of the label. Microplastics in food-contact packaging. Synthetic dyes linked to carcinogenicity. PFAS in non-stick coatings. PVA film dissolving into waterways. Synthetic textiles shedding microfibers onto your skin every day. The research is there — but it's scattered, technical, and inaccessible to most people.
        </p>
        <p style={{fontSize:16, color:muted, lineHeight:1.85, marginBottom:16}}>
          Partiqule is built to close that gap. We combine peer-reviewed science with AI-powered analysis to give every person access to the kind of information that used to require a toxicologist. Scan anything — a cleaning product, a piece of clothing, a food item, a baby product — and get a complete health picture in seconds.
        </p>
        <p style={{fontSize:16, color:muted, lineHeight:1.85}}>
          Every score we produce is grounded in published research, including the New England Journal of Medicine, Nature Medicine, The Lancet, and the FDA. We flag what matters, explain why it matters, and show you what to do about it.
        </p>
      </div>

      {/* What we stand for */}
      <div style={{marginBottom:48, paddingBottom:48, borderBottom:`1px solid ${border}`}}>
        <h2 style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:26, color:text, margin:"0 0 24px"}}>What we stand for</h2>
        <div style={{display:"flex", flexDirection:"column", gap:20}}>
          {[
            {title:"The full picture", body:"Microplastics are one part of the story. We score five dimensions: materials, usage and exposure, packaging, sustainability, and manufacturing. Your health, your home, and the planet are all affected differently by the same product."},
            {title:"Radical transparency", body:"Our scoring methodology is open. We show you the full breakdown across all five dimensions with the research behind each score. Judge for yourself rather than just trusting a number."},
            {title:"No conflicts of interest", body:"We recommend products because they're genuinely safer, not because we're paid to. Affiliate relationships are always clearly disclosed and never influence our scores."},
            {title:"Always free", body:"Knowledge about what you're putting in your body and home shouldn't cost money. Partiqule is free and requires no account."},
            {title:"Science first", body:"Every score is grounded in published research. We cite our sources, maintain our methodology, and update our scoring when the science evolves."},
          ].map((v,i)=>(
            <div key={i} style={{display:"flex", gap:16, alignItems:"flex-start"}}>
              <div style={{width:8, height:8, borderRadius:"50%", background:"#16a34a", flexShrink:0, marginTop:6}}/>
              <div>
                <div style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:16, color:text, marginBottom:4}}>{v.title}</div>
                <div style={{fontSize:15, color:muted, lineHeight:1.7}}>{v.body}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Founders & human oversight */}
      <div style={{marginBottom:48, paddingBottom:48, borderBottom:`1px solid ${border}`}}>
        <h2 style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:26, color:text, margin:"0 0 16px"}}>Built by humans. Guided by expertise.</h2>
        <p style={{fontSize:16, color:muted, lineHeight:1.85, marginBottom:24}}>
          Partiqule was founded by <strong style={{color:text}}>Paul and Sara Miller</strong>, combining 20+ years of experience across technology and operations. Every scoring framework, weighting decision, and quality standard on this platform is grounded in peer-reviewed research and intentionally designed by its founders. AI powers the scale — but the system itself is human-built and continuously refined.
        </p>

        {/* Founder cards */}
        <div style={{display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:16, marginBottom:24}}>
          {[
            {name:"Paul Miller", role:"Co-Founder, Product Development", detail:"Leads product development and defines the scoring framework behind every result.", photo:"/paul.jpg"},
            {name:"Sara Miller", role:"Co-Founder, Operations & Integrity", detail:"Leads day-to-day operations, ensuring Partiqule delivers consistent, trustworthy results at scale.", photo:"/sara.jpg"},
          ].map((person, i) => (
            <div key={i} style={{background:surface, borderRadius:14, padding:"24px 22px", border:`1.5px solid ${border}`, display:"flex", gap:18, alignItems:"flex-start"}}>
              <div style={{width:110, height:110, borderRadius:"50%", flexShrink:0, overflow:"hidden", border:"2px solid #16a34a"}}>
                <img src={person.photo} alt={person.name} style={{
                  width:"170%", height:"170%",
                  objectFit:"cover",
                  marginLeft:"-35%", marginTop:"-35%",
                }}/>
              </div>
              <div>
                <div style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:16, color:text, marginBottom:4}}>{person.name}</div>
                <div style={{fontSize:12, fontWeight:600, color:"#16a34a", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:10}}>{person.role}</div>
                <div style={{fontSize:14, color:muted, lineHeight:1.7}}>{person.detail}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Founders story */}
        <div style={{background:isDark?"#1a2a1a":"#f0fdf4", borderRadius:16, padding:"28px", border:`1px solid ${isDark?"#1e3a1e":"#bbf7d0"}`, marginBottom:16}}>
          <div style={{fontSize:12, fontWeight:700, color:"#16a34a", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:16}}>Why we started Partiqule</div>
          <p style={{fontSize:15, color:muted, lineHeight:1.85, marginBottom:14}}>
            We started Partiqule after what we now call our awakening to product health.
          </p>
          <p style={{fontSize:15, color:muted, lineHeight:1.85, marginBottom:14}}>
            It began with plastics. One night, after putting our kids to bed, we landed on <em>The Plastic Detox</em>. What we thought would be background noise quickly became a turning point. The documentary follows couples facing infertility challenges who, working with researcher Shanna Swan, explore the impact of microplastics on their fertility, highlighting how everyday exposures from food packaging to clothing to household items can accumulate in ways most of us never consider.
          </p>
          <p style={{fontSize:15, color:muted, lineHeight:1.85, marginBottom:14}}>
            As parents who experienced fertility challenges with our second child, this hit close to home. We were paying attention to things like sugar and ingredients, but we had almost no awareness of how much plastic we were interacting with daily, or what that meant for our family's health.
          </p>
          <p style={{fontSize:15, color:muted, lineHeight:1.85, marginBottom:14}}>
            But the more we dug in, the bigger the picture became. It was not just plastic. It was the PFAS coating on the pan we cooked in every night. It was the artificial dyes in the snacks our kids loved. It was the synthetic chemicals in the cleaning products we used around the house every week. It was the PVA film in the laundry pods dissolving into the water supply. Each discovery led to another, and the thread connecting all of them was the same: the products most of us use without a second thought are doing things to our health, our children's health, and the planet that we were never told about.
          </p>
          <p style={{fontSize:15, color:muted, lineHeight:1.85, marginBottom:14}}>
            So we started asking questions. What products are actually safe? How do you weigh the different kinds of risk? Are there realistic alternatives for everyday life? Where do you even start? There was no simple, trustworthy tool that looked at the full picture.
          </p>
          <p style={{fontSize:15, color:muted, lineHeight:1.85, marginBottom:0}}>
            So we built one. Partiqule was designed to look at every product the way we wished something had looked at them for us: across materials, exposure, packaging, sustainability, and manufacturing. The full picture, not just one piece of it. We are just two parents trying to do better for our family, and hoping to make it easier for yours.
          </p>
        </div>

        <div style={{padding:"14px 18px", background:isDark?"#1e2433":"#f8fafc", borderRadius:12, border:`1px solid ${border}`}}>
          <span style={{fontSize:14, color:muted, lineHeight:1.7}}>
            Learn more:{" "}
            <span onClick={()=>onNavigate("science")} style={{color:"#16a34a", fontWeight:600, cursor:"pointer", textDecoration:"underline"}}>The Science</span>
            {" "}behind our scores, or see a full breakdown of our process on the{" "}
            <span onClick={()=>onNavigate("methodology")} style={{color:"#16a34a", fontWeight:600, cursor:"pointer", textDecoration:"underline"}}>How It Works</span>
            {" "}page.
          </span>
        </div>
      </div>

      {/* The impact */}
      <div style={{marginBottom:48, paddingBottom:48, borderBottom:`1px solid ${border}`}}>
        <h2 style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:26, color:text, margin:"0 0 16px"}}>The impact we're working toward</h2>
        <p style={{fontSize:16, color:muted, lineHeight:1.85, marginBottom:16}}>
          Every scan is a small act of informed decision-making. When enough people start checking before they buy, manufacturers notice. We have already seen this happen. Public pressure and consumer awareness led to bans on microbeads across dozens of countries, forced reformulations of PFAS-coated cookware, and drove major brands to rethink their packaging. That change started with information.
        </p>
        <p style={{fontSize:16, color:muted, lineHeight:1.85, marginBottom:16}}>
          We're not anti-product. We're pro-information. The goal is a world where every product that touches your food, your skin, your children, or your home carries the same transparency as a nutrition label: materials, exposure risk, sustainability impact, and what to choose instead.
        </p>
        <p style={{fontSize:16, color:muted, lineHeight:1.85}}>
          Your health. Your family's health. The planet's health. That's the full picture Partiqule is built to give you.
        </p>
      </div>

      {/* AI Environmental Transparency */}
      <div style={{marginBottom:48, paddingBottom:48, borderBottom:`1px solid ${border}`}}>
        <h2 style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:26, color:text, margin:"0 0 16px"}}>A note on AI energy and water use</h2>
        <p style={{fontSize:16, color:muted, lineHeight:1.85, marginBottom:16}}>
          We know this question is coming. We'd rather address it directly than hope nobody asks.
        </p>
        <p style={{fontSize:16, color:muted, lineHeight:1.85, marginBottom:16}}>
          Each Partiqule scan runs two AI passes to generate your score. Based on current lifecycle research, a single AI query uses roughly 5–10ml of water when you account for data centre cooling and electricity generation. Two passes means a scan uses approximately <strong style={{color:text}}>15–20ml of water</strong> — about the same as brushing your teeth.
        </p>
        <p style={{fontSize:16, color:muted, lineHeight:1.85, marginBottom:16}}>
          We're not pretending AI is free. It isn't. But we think the trade-off is worth being transparent about. If a scan helps you replace a non-stick pan you cook on every day, or switch away from a detergent releasing synthetic chemicals into your home and waterways, the health payback is significant and ongoing. One scan. Years of impact.
        </p>
        <p style={{fontSize:16, color:muted, lineHeight:1.85, marginBottom:16}}>
          We also use Claude Haiku, Anthropic's most efficient model, specifically because it produces accurate results with a smaller compute footprint than larger models. We run the minimum number of passes needed for accuracy and cache results so the same product is never scored twice unnecessarily.
        </p>
        <div style={{background:isDark?"#1a2a1a":"#f0fdf4", borderRadius:14, padding:"20px 24px", border:`1px solid ${isDark?"#1e3a1e":"#bbf7d0"}`}}>
          <div style={{fontSize:13, fontWeight:700, color:"#16a34a", marginBottom:8}}>Our commitment</div>
          <p style={{fontSize:15, color:muted, lineHeight:1.7, margin:0}}>
            As Partiqule grows, we'll publish an annual transparency note on our AI usage, water and energy estimates, and what we're doing to reduce them. We believe the tools that expose environmental harm should hold themselves to the same standard.
          </p>
        </div>
      </div>

      {/* Contact */}
      <div>
        <h2 style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:26, color:text, margin:"0 0 16px"}}>Get in touch</h2>
        <p style={{fontSize:16, color:muted, lineHeight:1.85}}>
          Questions, partnerships, press, or just want to say hi? Reach us at{" "}
          <a href="mailto:paul@partiqule.com" onClick={e=>{e.preventDefault(); window.location.href="mailto:paul@partiqule.com";}} style={{color:"#16a34a", textDecoration:"none", fontWeight:600}}>paul@partiqule.com</a>.
          We read every email.
        </p>
      </div>
    </div>
  );
};

// ── METHODOLOGY PAGE ──────────────────────────────────────────
const MethodologyPage = ({isDark, text, muted, surface, border, isMobile}) => {
  const steps = [
    {
      number: "01",
      title: "Human-defined scoring parameters",
      color: "#16a34a",
      content: [
        {
          heading: "Founded by domain experts",
          body: "Partiqule was built by Paul and Sara Miller, who bring a combined 20 years of experience across technology, compliance, and operations. The scoring framework was designed drawing on published peer-reviewed research in polymer chemistry, toxicology, consumer product safety, and sustainability science. It was not generated by AI."
        },
        {
          heading: "What we measure",
          body: "Every product is evaluated across three spheres of impact — your personal health, the health of your family and home, and the health of the planet. These map to five scored dimensions: Materials, Usage & Exposure, Packaging, Sustainability, and Manufacturing."
        },
        {
          heading: "Parameters we defined",
          body: null,
          list: [
            "A weighted scoring system: Materials 40%, Usage & Exposure 25%, Packaging 15%, Sustainability 15%, Manufacturing 5%",
            "Specific plastic polymers flagged as high-risk (PET, PVC, PP, PS, PTFE, PFAS, nylon, polyester) based on published leaching and exposure studies",
            "Exposure pathway rules — products with direct ingestion, leave-on skin contact, or inhalation risk score higher than single-contact or rinse-off products",
            "A natural materials credit — products confirmed to be wood, glass, stainless steel, ceramic, or organic cotton receive low materials scores regardless of use frequency",
            "Chemical concern categories: artificial petroleum dyes (Red 40, Yellow 5/6, Blue 1, Red 3 — FDA banned 2025), PFAS, synthetic preservatives (BHA, BHT, sodium nitrate), sweeteners (aspartame, HFCS), ultra-processing additives, endocrine disruptors, and known carcinogens",
            "NOVA food processing classification — whole foods score low, ultra-processed foods with synthetic additives score high. Food products get a dedicated Ingredients and Nutrition breakdown showing each additive individually with severity and research",
            "PVA pod film (Cascade, Tide, Finish) scored as microplastic pollution — it dissolves but enters waterways",
            "Sustainability scoring: refillable and circular products score low; single-use disposables score high regardless of concentration or convenience",
            "Manufacturing scored conservatively at 5% weight — only flagged when supply chain practices are publicly documented as harmful",
          ]
        },
        {
          heading: null,
          body: "These parameters are hardcoded into the AI prompts and cannot be overridden by the AI's own judgment. The AI applies them. It does not define them."
        }
      ]
    },
    {
      number: "02",
      title: "The five-dimension model",
      color: "#7c3aed",
      content: [
        {
          heading: "Your health — Materials & Usage",
          body: "The two highest-weighted dimensions (40% + 25% = 65%) focus on direct personal health impact. Materials scores what the product is physically made of and whether it contains harmful plastics, chemicals, or food additives. Usage and Exposure scores how using the product affects your body — accounting for frequency, contact type (ingestion, skin, inhalation), intensity (leave-on vs. rinse-off), and whether the product is used by children. For food and drink, a dedicated Ingredients and Nutrition panel breaks down the processing level (NOVA 1-4) and flags each ingredient of concern individually with its severity and the research behind it."
        },
        {
          heading: "Your family & home — Packaging",
          body: "Packaging (15%) covers what enters your home. Primary packaging that touches the product, whether it is refillable or single-use, and its end-of-life fate (recyclable, compostable, or landfill). Refillable and concentrated formats like tablets or bars are rewarded. Single-use plastic primary packaging is penalised. Incidental packaging that is discarded before use (a film pouch on a tablet) does not penalise the product score — only what stays in your home matters."
        },
        {
          heading: "Health of the planet — Sustainability & Manufacturing",
          body: "Sustainability (15%) measures the product's lifecycle impact. Multi-use and circular products (refillable, repairable, compostable) score low. Single-use disposables score high. Products that release chemicals or microplastics into water systems are penalised even if they are concentrated or convenient. Manufacturing (5%) covers production — scored conservatively and flagged as estimated when supply chain data is unavailable."
        },
        {
          heading: "Final Score (1–10)",
          body: "The five dimension scores are combined using the defined weights. The result is a single number from 1 (minimal concern) to 10 (very high concern). A product can score low on materials but still carry a meaningful overall score if its sustainability or exposure story is poor — and vice versa."
        }
      ]
    },
    {
      number: "03",
      title: "AI analysis: two-pass system",
      color: "#2563eb",
      content: [
        {
          heading: "Why two passes?",
          body: "Each product scan runs two independent AI passes using Anthropic's Claude. The two-pass structure was designed specifically to reduce hallucination and catch cases where the first pass may have over- or under-scored a product."
        },
        {
          heading: "Pass 1: Research and analysis",
          body: "The AI searches the web for real material data on the specific product, then scores it across all five dimensions using the parameters we defined. It identifies plastic polymers, harmful chemicals, natural materials, packaging type, sustainability story, and exposure pathway — and suggests safer alternatives. For food products, Pass 1 also produces a full ingredient analysis: NOVA processing level, each additive flagged by severity (high, medium, or low concern), and any positive attributes like organic certification or clean ingredients."
        },
        {
          heading: "Pass 2: Independent audit",
          body: "A second independent AI instance reviews Pass 1's output as a skeptical auditor. It applies calibration anchors (known products with known correct scores), checks that genuinely safe products are not penalised unfairly, computes the final weighted score, and flags low-confidence results."
        }
      ]
    },
    {
      number: "04",
      title: "Human quality review",
      color: "#d97706",
      content: [
        {
          heading: "What we check before results go live",
          body: null,
          list: [
            "Spot testing: We regularly scan products we own or have researched independently and verify the AI's material identification against manufacturer specs, safety data sheets, or published studies",
            "Calibration checks: We test known products against defined score anchors — Blueland tablets should score 1-2, Cascade pods ~6, non-stick pans ~7-8, M&Ms ~7 (multiple FDA-flagged dyes), organic dark chocolate ~2. Systematic drift triggers a prompt update and cache clear",
            "Category audits: We periodically review all cached results in a product category to check for scoring inconsistencies or outliers",
            "Dimension review: We verify all five dimensions are scoring logically — particularly that sustainability rewards genuinely circular products and penalises single-use, and that packaging-only plastic does not inflate the materials score",
            "Cache invalidation: When we update scoring parameters or identify a systematic error, we clear the result cache so all products are rescored under the new rules",
          ]
        }
      ]
    },
    {
      number: "05",
      title: "Affiliate product standards",
      color: "#7c3aed",
      content: [
        {
          heading: "How alternatives are selected",
          body: "Products recommended as safer alternatives on Partiqule meet the following criteria, verified by us:"
        },
        {
          heading: null,
          body: null,
          list: [
            "The alternative must score materially lower overall than the scanned product — across materials, exposure and sustainability combined",
            "Alternatives are filtered using material-based heuristics we defined — stainless steel, organic cotton, glass, bamboo, and natural rubber all receive low scores",
            "Affiliate links are clearly disclosed with '#ad · affiliate links' labeling on every results page",
            "Affiliate relationships have zero influence on scoring — the danger score is calculated independently before any alternative is suggested",
          ]
        }
      ]
    },
    {
      number: "06",
      title: "Ongoing maintenance",
      color: "#0891b2",
      content: [
        {
          heading: null,
          body: null,
          list: [
            "Scoring parameters are reviewed when new peer-reviewed research is published on microplastics, chemical exposure, endocrine disruption, or sustainability",
            "The AI model version is reviewed periodically to ensure accuracy has not regressed",
            "An annual transparency note is published on the About page disclosing AI usage, estimated energy and water footprint, and any methodology changes",
            "User feedback is monitored — products that generate unusual concern or contradiction are flagged for manual review",
          ]
        }
      ]
    }
  ];

  return (
    <div style={{maxWidth:760, margin:"0 auto", padding:isMobile?"24px 16px 60px":"48px 40px 80px"}}>
      {/* Header */}
      <div style={{marginBottom:40}}>
        <div style={{fontSize:12, fontWeight:700, color:"#16a34a", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:12}}>Transparency & Methodology</div>
        <h1 style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:isMobile?28:38, color:text, margin:"0 0 16px", letterSpacing:"-0.5px"}}>How Partiqule Works</h1>
        <p style={{fontSize:16, color:muted, lineHeight:1.8, margin:"0 0 8px"}}>
          Every score on Partiqule reflects the impact of a product on three things: your personal health, the health of your family and home, and the health of the planet. This page explains exactly how we measure that — combining expert-defined parameters, AI analysis, and human quality review. We believe tools that expose hidden harm should be fully transparent about their own process.
        </p>
        <div style={{fontSize:13, color:muted, opacity:0.6, fontStyle:"italic"}}>Methodology last reviewed: March 2026</div>
      </div>

      {/* Key stats bar */}
      <div style={{display:"grid", gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)", gap:12, marginBottom:40}}>
        {[
          {number:"20+", label:"Years combined expertise"},
          {number:"2",   label:"AI passes per scan"},
          {number:"358+",label:"Products in database"},
          {number:"100%",label:"Affiliate-independent scoring"},
        ].map((s,i) => (
          <div key={i} style={{background:surface, borderRadius:14, padding:"20px 16px", border:`1.5px solid ${border}`, textAlign:"center"}}>
            <div style={{fontFamily:"'Outfit',sans-serif", fontWeight:800, fontSize:28, color:"#16a34a", marginBottom:4}}>{s.number}</div>
            <div style={{fontSize:12, color:muted, lineHeight:1.4}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Founders callout */}
      <div style={{background:isDark?"#1a2a1a":"#f0fdf4", borderRadius:16, padding:"24px", border:`1px solid ${isDark?"#1e3a1e":"#bbf7d0"}`, marginBottom:48}}>
        <div style={{fontSize:12, fontWeight:700, color:"#16a34a", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10}}>About the founders</div>
        <p style={{fontSize:15, color:muted, lineHeight:1.8, margin:0}}>
          Partiqule was built by <strong style={{color:text}}>Paul and Sara Miller</strong>, who bring a combined 20 years of experience across technology, compliance, and audit. The scoring methodology, parameters, and quality review processes described on this page were designed and are maintained by them — not generated by AI. The AI applies the framework; Paul and Sara built it.
        </p>
      </div>

      {/* Steps */}
      {steps.map((step, si) => (
        <div key={si} style={{marginBottom:48, paddingBottom:48, borderBottom:`1px solid ${border}`}}>
          <div style={{display:"flex", alignItems:"flex-start", gap:20, marginBottom:20}}>
            <div style={{width:48, height:48, borderRadius:12, background:`${step.color}15`, border:`1.5px solid ${step.color}44`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0}}>
              <span style={{fontFamily:"'Outfit',sans-serif", fontWeight:800, fontSize:15, color:step.color}}>{step.number}</span>
            </div>
            <h2 style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:isMobile?20:24, color:text, margin:"10px 0 0", letterSpacing:"-0.3px"}}>{step.title}</h2>
          </div>
          {step.content.map((block, bi) => (
            <div key={bi} style={{marginBottom:16, paddingLeft:68}}>
              {block.heading && (
                <div style={{fontSize:14, fontWeight:700, color:text, marginBottom:6}}>{block.heading}</div>
              )}
              {block.body && (
                <p style={{fontSize:15, color:muted, lineHeight:1.8, margin:"0 0 8px"}}>{block.body}</p>
              )}
              {block.list && (
                <div style={{display:"flex", flexDirection:"column", gap:8}}>
                  {block.list.map((item, li) => (
                    <div key={li} style={{display:"flex", alignItems:"flex-start", gap:10}}>
                      <div style={{width:6, height:6, borderRadius:"50%", background:step.color, flexShrink:0, marginTop:6}}/>
                      <span style={{fontSize:15, color:muted, lineHeight:1.7}}>{item}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      {/* Scoring examples */}
      <div style={{marginBottom:48, paddingBottom:48, borderBottom:`1px solid ${border}`}}>
        <div style={{display:"flex", alignItems:"flex-start", gap:20, marginBottom:20}}>
          <div style={{width:48, height:48, borderRadius:12, background:"#052e1615", border:"1.5px solid #052e1644", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0}}>
            <span style={{fontFamily:"'Outfit',sans-serif", fontWeight:800, fontSize:15, color:"#052e16"}}>eg.</span>
          </div>
          <h2 style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:isMobile?20:24, color:text, margin:"10px 0 0", letterSpacing:"-0.3px"}}>Worked examples</h2>
        </div>
        <div style={{paddingLeft:68}}>

          {/* Example 1 */}
          <div style={{marginBottom:32}}>
            <div style={{fontSize:14, fontWeight:700, color:text, marginBottom:12}}>Example 1 — Non-stick frying pan</div>
            <div style={{display:"flex", flexDirection:"column", gap:8}}>
              {[
                {step:"Web search", detail:"AI searches for real material specs and confirms PTFE (Teflon) coating on cooking surface, aluminium body, plastic handle."},
                {step:"Pass 1: Analysis", detail:"Materials: 9 (PTFE/PFAS — FDA-flagged endocrine disruptors). Usage: 9 (daily ingestion pathway, heated surface accelerates breakdown). Packaging: 3. Sustainability: 4 (durable but PTFE unrecyclable). Manufacturing: 6 (PTFE process emissions)."},
                {step:"Pass 2: Audit", detail:"Daily heat + ingestion penalty confirmed. Weighted score: (9×0.40)+(9×0.25)+(3×0.15)+(4×0.15)+(6×0.05) = 3.6+2.25+0.45+0.6+0.3 = 7.2. Final score: 7. Confidence: high."},
                {step:"Human review", detail:"Paul cross-references EWG PFAS database. Score confirmed. Caraway and GreenPan ceramic alternatives shown with break-even at 200 uses."},
              ].map((row, i) => (
                <div key={i} style={{display:"grid", gridTemplateColumns:isMobile?"1fr":"180px 1fr", gap:12, padding:"12px 16px", background:surface, borderRadius:10, border:`1px solid ${border}`}}>
                  <div style={{fontSize:13, fontWeight:700, color:"#16a34a"}}>{row.step}</div>
                  <div style={{fontSize:14, color:muted, lineHeight:1.6}}>{row.detail}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Example 2 */}
          <div>
            <div style={{fontSize:14, fontWeight:700, color:text, marginBottom:12}}>Example 2 — Brawny paper towels</div>
            <p style={{fontSize:14, color:muted, lineHeight:1.7, marginBottom:12}}>
              A product that scores low on materials but high on sustainability — showing why all five dimensions matter, not just what the product is made of.
            </p>
            <div style={{display:"flex", flexDirection:"column", gap:8}}>
              {[
                {step:"Web search", detail:"AI confirms paper product with PE/PP plastic outer packaging, cardboard tube core, bleached virgin wood pulp."},
                {step:"Pass 1: Analysis", detail:"Materials: 2 (paper, no direct plastic exposure — packaging discarded before use). Usage: 2 (not ingested or absorbed). Packaging: 5 (PE film wrap, cardboard tube). Sustainability: 8 (single-use by design, high disposal frequency, virgin wood pulp). Manufacturing: 4 (chlorine bleaching process)."},
                {step:"Pass 2: Audit", detail:"Low materials risk confirmed. Sustainability penalty upheld — single-use disposable by design. Weighted score: (2×0.40)+(2×0.25)+(5×0.15)+(8×0.15)+(4×0.05) = 0.8+0.5+0.75+1.2+0.2 = 3.45. Final score: 3."},
                {step:"Human review", detail:"Sara reviews — sustainability score of 8 appropriate. Swedish dishcloths, bamboo paper towels and microfibre cloths shown as alternatives."},
              ].map((row, i) => (
                <div key={i} style={{display:"grid", gridTemplateColumns:isMobile?"1fr":"180px 1fr", gap:12, padding:"12px 16px", background:surface, borderRadius:10, border:`1px solid ${border}`}}>
                  <div style={{fontSize:13, fontWeight:700, color:"#16a34a"}}>{row.step}</div>
                  <div style={{fontSize:14, color:muted, lineHeight:1.6}}>{row.detail}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* Research sources */}
      <div style={{marginBottom:48, paddingBottom:48, borderBottom:`1px solid ${border}`}}>
        <div style={{display:"flex", alignItems:"flex-start", gap:20, marginBottom:20}}>
          <div style={{width:48, height:48, borderRadius:12, background:"#0891b215", border:"1.5px solid #0891b244", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0}}>
            <span style={{fontFamily:"'Outfit',sans-serif", fontWeight:800, fontSize:13, color:"#0891b2"}}>refs</span>
          </div>
          <h2 style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:isMobile?20:24, color:text, margin:"10px 0 0", letterSpacing:"-0.3px"}}>Research sources</h2>
        </div>
        <div style={{paddingLeft:68}}>
          <p style={{fontSize:15, color:muted, lineHeight:1.8, marginBottom:20}}>
            The scoring parameters on Partiqule are grounded in published peer-reviewed research. Key studies that informed our framework, organised by topic. We update these references as new research is published:
          </p>

          {[
            {
              category: "Microplastics in the human body",
              color: "#dc2626",
              refs: [
                {citation:"Ragusa et al. (2021)", title:"Plasticenta: First evidence of microplastics in human placenta", journal:"Environment International"},
                {citation:"Leslie et al. (2022)", title:"Discovery and quantification of plastic particle pollution in human blood", journal:"Environment International"},
                {citation:"Yan et al. (2024)", title:"Bioaccumulation of microplastics in decedent human brains", journal:"Nature Medicine — higher concentrations found in brains with dementia diagnosis"},
                {citation:"Marfella et al. (2024)", title:"Microplastics and nanoplastics in atheromas and cardiovascular events", journal:"New England Journal of Medicine — linked to increased heart attack and stroke risk"},
                {citation:"Schwabl et al. (2019)", title:"Detection of various microplastics in human stool", journal:"Annals of Internal Medicine"},
                {citation:"Amato-Lourenco et al. (2021)", title:"Presence of airborne microplastics in human lung tissue", journal:"THORAX — microplastics found in all regions of the human lung"},
                {citation:"Landrigan et al. (2025)", title:"Microplastic and nanoplastic pollution and associated potential disease risks", journal:"The Lancet Planetary Health — cardiovascular, metabolic and cancer risk review"},
                {citation:"WWF / University of Newcastle (2019)", title:"No Plastic in Nature: Assessing Plastic Ingestion from Nature to People", journal:"WWF Report — basis for the 5g/week estimate"},
              ]
            },
            {
              category: "Product-specific plastic exposure",
              color: "#ea580c",
              refs: [
                {citation:"Li et al. (2020)", title:"Microplastic release from the degradation of polypropylene feeding bottles during infant formula preparation", journal:"Nature Food — millions of particles per litre when heated"},
                {citation:"Hernandez et al. (2019)", title:"Plastic teabags release billions of microparticles and nanoparticles into tea", journal:"Environmental Science & Technology"},
                {citation:"Kosuth et al. (2018)", title:"Anthropogenic contamination of tap water, beer, and sea salt", journal:"PLOS ONE"},
                {citation:"Thompson et al. (2024)", title:"Twenty years of microplastics pollution research: what have we learned?", journal:"Science"},
                {citation:"Cox et al. (2019)", title:"Human consumption of microplastics", journal:"Environmental Science and Technology — estimates annual ingestion by food, water and air"},
                {citation:"Pivokonsky et al. (2018)", title:"Occurrence of microplastics in raw and treated drinking water", journal:"Science of the Total Environment"},
              ]
            },
            {
              category: "PFAS and non-stick chemicals",
              color: "#7c3aed",
              refs: [
                {citation:"FDA Total Diet Study (2024)", title:"Analytical results of testing food for PFAS from environmental contamination", journal:"U.S. FDA — PFAS detected across seafood, meat and dairy"},
                {citation:"Sunderland et al. (2019)", title:"A review of the pathways of human exposure to poly and perfluoroalkyl substances (PFAS)", journal:"Journal of Exposure Science and Environmental Epidemiology — thyroid, fertility, cholesterol"},
                {citation:"Steenland et al. (2018)", title:"Epidemiologic evidence on the health effects of perfluorooctanoic acid (PFOA)", journal:"Environmental Health Perspectives — kidney cancer, testicular cancer, thyroid disease"},
                {citation:"Rappazzo et al. (2017)", title:"Exposure to perfluorinated alkyl substances and health outcomes in children", journal:"International Journal of Environmental Research and Public Health"},
                {citation:"EWG (2023)", title:"PFAS in drinking water: updated national analysis", journal:"Environmental Working Group — PFAS detected in water supplies serving 200+ million Americans"},
              ]
            },
            {
              category: "Endocrine disruptors and hormonal chemicals",
              color: "#9333ea",
              refs: [
                {citation:"Vandenberg et al. (2012)", title:"Hormones and endocrine-disrupting chemicals: low-dose effects and nonmonotonic dose responses", journal:"Endocrine Reviews — foundational review on EDC mechanisms"},
                {citation:"Braun et al. (2021)", title:"Endocrine-disrupting chemicals: a scientific statement", journal:"Endocrine Society Scientific Statement — comprehensive review of BPA, phthalates, PFAS"},
                {citation:"Swan et al. (2021)", title:"Reproductive consequences of prenatal chemical exposure", journal:"Endocrinology — phthalates, BPA and reduced fertility (basis for The Plastic Detox documentary)"},
                {citation:"Hauser and Calafat (2005)", title:"Phthalates and human health", journal:"Occupational and Environmental Medicine — foundational phthalate exposure review"},
                {citation:"Rochester (2013)", title:"Bisphenol A and human health: a review of the literature", journal:"Reproductive Toxicology — BPA endocrine disruption and reproductive harm"},
                {citation:"Trasande et al. (2018)", title:"Estimating burden and disease costs of exposure to endocrine-disrupting chemicals in the European Union", journal:"Journal of Clinical Endocrinology and Metabolism — USD 163 billion annual health cost attributed to EDCs"},
              ]
            },
            {
              category: "Artificial dyes and food additives",
              color: "#ca8a04",
              refs: [
                {citation:"FDA (2025)", title:"FDA announces phase-out of petroleum-based synthetic food dyes", journal:"FDA press release — Red 3 banned, further petroleum-based dyes under review"},
                {citation:"McCann et al. (2007)", title:"Food additives and hyperactive behaviour in children", journal:"The Lancet — foundational study linking synthetic dyes to hyperactivity"},
                {citation:"Arnold et al. (2012)", title:"Artificial food colors and attention-deficit/hyperactivity disorder", journal:"Neurotherapeutics — meta-analysis confirming dye-behaviour link"},
                {citation:"EFSA (2021)", title:"Re-evaluation of titanium dioxide (E171) as a food additive", journal:"European Food Safety Authority — classified as no longer safe, EU food ban followed"},
                {citation:"Mortensen et al. (2017)", title:"Introduction to food colours", journal:"WHO/FAO JECFA — global review of synthetic food colour safety profiles"},
                {citation:"Poole et al. (2022)", title:"Aspartame and cancer risk: an updated meta-analysis", journal:"IARC — aspartame classified Group 2B possible carcinogen in 2023"},
              ]
            },
            {
              category: "Ultra-processed foods",
              color: "#0891b2",
              refs: [
                {citation:"Monteiro et al. (2025)", title:"Ultra-processed foods and human health: the main thesis and the evidence", journal:"The Lancet — comprehensive evidence review linking UPFs to chronic disease"},
                {citation:"Srour et al. (2024)", title:"Ultra-processed food consumption and risk of all-cause and cause-specific mortality", journal:"BMJ — prospective cohort study, 30% higher mortality risk"},
                {citation:"Lane et al. (2024)", title:"Ultra-processed food exposure and adverse brain outcomes", journal:"Neurology — linked to cognitive decline, stroke and anxiety"},
                {citation:"Chen et al. (2023)", title:"Ultra-processed food consumption and risk of type 2 diabetes", journal:"The Lancet Regional Health Europe"},
                {citation:"Zhong et al. (2021)", title:"Association of ultra-processed food consumption with cardiovascular mortality", journal:"JAMA Internal Medicine"},
                {citation:"Blanco-Rojo et al. (2019)", title:"Consumption of ultra-processed foods and obesity", journal:"Nutrients — dose-response relationship between UPF intake and obesity risk"},
              ]
            },
            {
              category: "Synthetic preservatives",
              color: "#b45309",
              refs: [
                {citation:"NTP (2023)", title:"NTP technical report on BHA carcinogenicity", journal:"National Toxicology Program — BHA classified reasonably anticipated to be a human carcinogen"},
                {citation:"IARC (2010)", title:"IARC monographs on the evaluation of carcinogenic risks to humans — Volume 95", journal:"World Health Organization — BHA listed as Group 2B possible carcinogen"},
                {citation:"Bouvard et al. (2015)", title:"Carcinogenicity of consumption of red and processed meat", journal:"The Lancet Oncology — processed meat (sodium nitrate) classified Group 1 carcinogen"},
                {citation:"Hord et al. (2009)", title:"Food sources of nitrates and nitrites: the physiologic context for potential health benefits", journal:"American Journal of Clinical Nutrition — nitrate/nitrite pathways and cancer risk"},
                {citation:"Wormuth et al. (2006)", title:"What are the sources of exposure to eight frequently used phthalic acid esters in Europeans?", journal:"Risk Analysis — daily phthalate intake from food packaging and cosmetics"},
              ]
            },
            {
              category: "Sunscreen chemicals and skin absorption",
              color: "#dc2626",
              refs: [
                {citation:"Matta et al. (2019)", title:"Effect of sunscreen application under maximal use conditions on plasma concentration of sunscreen active ingredients", journal:"JAMA — oxybenzone, avobenzone detected in bloodstream after single application"},
                {citation:"Matta et al. (2020)", title:"Sunscreen drug products for over-the-counter human use: proposed rule", journal:"FDA — six chemical UV filters (including oxybenzone) flagged for further safety study"},
                {citation:"Downs et al. (2016)", title:"Toxicopathological effects of the sunscreen UV filter oxybenzone on coral reef fish", journal:"Archives of Environmental Contamination and Toxicology — reef toxicity, endocrine disruption"},
                {citation:"Kim and Choi (2021)", title:"Oxybenzone and its metabolites detected in human urine", journal:"Toxics — confirmed systemic absorption and urinary excretion"},
              ]
            },
            {
              category: "Synthetic fragrance and indoor air quality",
              color: "#16a34a",
              refs: [
                {citation:"Steinemann (2017)", title:"Fragranced consumer products: exposures and effects from emissions", journal:"Air Quality, Atmosphere and Health — 156 VOCs identified in 25 scented products"},
                {citation:"Nazaroff and Weschler (2004)", title:"Cleaning products and air fresheners: exposure to primary and secondary air pollutants", journal:"Atmospheric Environment — benzene, formaldehyde from synthetic fragrance products"},
                {citation:"Dodson et al. (2012)", title:"Endocrine disruptors and asthma-associated chemicals in consumer products", journal:"Environmental Health Perspectives — phthalates and synthetic fragrance linked to asthma"},
                {citation:"NRDC (2007)", title:"Synthetic musks and the secret hazards of synthetic fragrance", journal:"NRDC Report — phthalates, synthetic musks found in air fresheners and personal care"},
                {citation:"Klepeis et al. (2001)", title:"The National Human Activity Pattern Survey (NHAPS)", journal:"Journal of Exposure Science — Americans spend 87% of time indoors; indoor air quality a major exposure pathway"},
              ]
            },
            {
              category: "Microfibers and synthetic textiles",
              color: "#1d4ed8",
              refs: [
                {citation:"Browne et al. (2011)", title:"Accumulation of microplastic on shorelines worldwide: sources and sinks", journal:"Environmental Science and Technology — first study linking synthetic textiles to ocean microfibers"},
                {citation:"De Falco et al. (2018)", title:"Microfiber release to water, via laundering, and to air, via everyday use: a comparison", journal:"International Journal of Environmental Research and Public Health — shedding during wear"},
                {citation:"Henry et al. (2019)", title:"Microfibres from apparel and home textiles: prospective directions for research and policy", journal:"Science of the Total Environment — 700K+ fibers per wash estimate"},
                {citation:"Liu et al. (2022)", title:"Microplastic pollution in drinking water and food: a global systematic review", journal:"Science of the Total Environment — textiles as major source of food chain contamination"},
              ]
            },
            {
              category: "Children, pregnancy and vulnerable populations",
              color: "#9d174d",
              refs: [
                {citation:"Lanphear et al. (2005)", title:"Low-level environmental lead exposure and children's intellectual function", journal:"Environmental Health Perspectives — children's elevated sensitivity to environmental chemical exposure"},
                {citation:"Grandjean and Landrigan (2014)", title:"Neurobehavioural effects of developmental toxicity", journal:"The Lancet Neurology — 12 industrial chemicals identified as developmental neurotoxicants"},
                {citation:"Trasande et al. (2016)", title:"Prenatal phthalate exposure and reduced cognitive development", journal:"Environmental Health Perspectives — in utero chemical exposure linked to IQ loss"},
                {citation:"Braun et al. (2023)", title:"Exposure to per- and polyfluoroalkyl substances and children's health", journal:"Pediatrics — PFAS exposure in children linked to immune dysfunction and obesity"},
                {citation:"FDA/EPA (2024)", title:"Advice about eating fish for women who are pregnant or breastfeeding", journal:"FDA/EPA joint advisory — mercury and PFAS in fish during pregnancy"},
              ]
            },
            {
              category: "Flame retardants and household chemicals",
              color: "#374151",
              refs: [
                {citation:"Stapleton et al. (2011)", title:"Novel and high volume use flame retardants in US couches", journal:"Environmental Science and Technology — flame retardants in furniture foam linked to thyroid disruption"},
                {citation:"Harrad et al. (2008)", title:"Brominated flame retardants in domestic dust from UK homes", journal:"Chemosphere — PBDE exposure from household dust, particularly in children"},
                {citation:"Shaw et al. (2010)", title:"Halogenated flame retardants: do the fire safety benefits justify the risks?", journal:"Reviews on Environmental Health — endocrine disruption and developmental neurotoxicity"},
                {citation:"GreenScience Policy Institute (2021)", title:"Flame retardants in children's products: exposure and health risks", journal:"GreenScience Policy Institute — flame retardants in mattresses, car seats, baby products"},
              ]
            },
            {
              category: "Sustainability and single-use waste",
              color: "#059669",
              refs: [
                {citation:"Geyer et al. (2017)", title:"Production, use, and fate of all plastics ever made", journal:"Science Advances — basis for single-use plastic waste estimates"},
                {citation:"Jambeck et al. (2015)", title:"Plastic waste inputs from land into the ocean", journal:"Science — 8 million metric tons of plastic entering oceans annually"},
                {citation:"Ellen MacArthur Foundation (2016)", title:"The New Plastics Economy: Rethinking the future of plastics", journal:"World Economic Forum — lifecycle analysis of plastic packaging"},
                {citation:"Lau et al. (2020)", title:"Evaluating scenarios toward zero plastic pollution", journal:"Science — lifecycle analysis showing only 40% reduction in ocean plastic by 2040 under current policy"},
                {citation:"Zalasiewicz et al. (2016)", title:"The geological cycle of plastics and their use as a stratigraphic indicator", journal:"Anthropocene — plastic as permanent geological record"},
              ]
            },
          ].map((section, si) => (
            <div key={si} style={{marginBottom:28}}>
              <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:10}}>
                <div style={{width:10, height:10, borderRadius:"50%", background:section.color, flexShrink:0}}/>
                <div style={{fontSize:12, fontWeight:700, color:section.color, textTransform:"uppercase", letterSpacing:"0.07em"}}>{section.category}</div>
              </div>
              <div style={{display:"flex", flexDirection:"column", gap:6}}>
                {section.refs.map((ref, i) => (
                  <div key={i} style={{padding:"10px 14px", background:surface, borderRadius:10, border:`1px solid ${border}`}}>
                    <div style={{fontSize:13, fontWeight:700, color:text, marginBottom:2}}>{ref.citation} — {ref.title}</div>
                    <div style={{fontSize:12, color:muted, fontStyle:"italic"}}>{ref.journal}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer note */}
      <div style={{background:isDark?"#1e2433":"#f8fafc", borderRadius:14, padding:"20px 24px", border:`1px solid ${border}`}}>
        <div style={{fontSize:13, fontWeight:700, color:text, marginBottom:8}}>Questions about our methodology?</div>
        <p style={{fontSize:14, color:muted, lineHeight:1.7, margin:0}}>
          We welcome scrutiny. If you believe a score is inaccurate, or have published research that should inform our parameters, email us at{" "}
          <a href="mailto:paul@partiqule.com" onClick={e=>{e.preventDefault(); window.location.href="mailto:paul@partiqule.com";}} style={{color:"#16a34a", textDecoration:"none", fontWeight:600}}>paul@partiqule.com</a>.
          We read every message.
        </p>
      </div>
    </div>
  );
};

// ── PRIVACY PAGE ──────────────────────────────────────────────
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
function App() {
  const [query,       setQuery]      = useState("");
  const [searchMode,  setSearchMode] = useState("name");
  const [result,      setResult]     = useState(null);
  const [loading,     setLoading]    = useState(false);
  const [error,       setError]      = useState(null);
  const [isDark,      setIsDark]     = useState(false);
  const [page,        setPage]       = useState("home");
  const [menuOpen,    setMenuOpen]   = useState(false);
  const [history,     setHistory]    = useState(()=>{try{return JSON.parse(localStorage.getItem("ps_history")||"[]");}catch{return [];}});

  const width   = useWindowWidth();
  const isMobile = width < 768;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

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
    if (path === "/methodology") { setPage("methodology"); return; }

    const known = ["/", "/science", "/history", "/privacy", "/about", "/methodology"];
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

  // Scroll to top on every page change and every result load
  useEffect(() => { window.scrollTo(0, 0); }, [page, result]);

  const saveToHistory = (item) => {
    setHistory(prev=>{
      const filtered = prev.filter(h=>h.product_name!==item.product_name);
      const updated  = [{...item, scannedAt: new Date().toISOString()}, ...filtered];
      try{localStorage.setItem("ps_history",JSON.stringify(updated));}catch{}
      return updated;
    });
  };

  const analyze = async (q=query) => {
    if (!q.trim()) return Promise.resolve();
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
              <span onClick={()=>{setPage("methodology"); setResult(null);}} style={{fontSize:14, color:page==="methodology"?"#16a34a":muted, cursor:"pointer", fontWeight:page==="methodology"?600:400}}>How it Works</span>
              <span onClick={()=>{setPage("history"); setResult(null);}} style={{fontSize:14, color:page==="history"?"#16a34a":muted, cursor:"pointer", fontWeight:page==="history"?600:400}}><IcoSaved size={14}/> My Scans {history.length>0&&<span style={{background:"#052e16",color:"#4ade80",fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:10,marginLeft:4}}>{history.length}</span>}</span>
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
              {label:"How it Works",       pg:"methodology"},
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
        <AboutPage isDark={isDark} text={text} muted={muted} surface={surface} border={border} isMobile={isMobile} onScan={reset} onNavigate={setPage}/>
      ) : page === "methodology" ? (
        <MethodologyPage isDark={isDark} text={text} muted={muted} surface={surface} border={border} isMobile={isMobile}/>
      ) : page === "404" ? (
        <div style={{maxWidth:600, margin:"0 auto", padding:"100px 40px", textAlign:"center"}}>
          <div style={{display:"flex",justifyContent:"center",marginBottom:16}}><IcoScan size={64}/></div>
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
            <p style={{fontSize:15, color:muted, margin:0}}>The research behind product health: your body, your home, and the planet</p>
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
            {/* Particle dots scattered across the hero — 40 particles */}
            {[
              {s:10, x:"8%",  y:"20%", a:0.25, anim:"float1", dur:"6s",   shape:"circle"},
              {s:6,  x:"15%", y:"65%", a:0.18, anim:"float2", dur:"8s",   shape:"circle"},
              {s:14, x:"88%", y:"15%", a:0.2,  anim:"float3", dur:"7s",   shape:"circle"},
              {s:8,  x:"92%", y:"70%", a:0.15, anim:"float1", dur:"9s",   shape:"diamond"},
              {s:5,  x:"75%", y:"30%", a:0.3,  anim:"float4", dur:"5s",   shape:"circle"},
              {s:12, x:"25%", y:"82%", a:0.15, anim:"float5", dur:"10s",  shape:"circle"},
              {s:7,  x:"60%", y:"78%", a:0.2,  anim:"float2", dur:"7.5s", shape:"diamond"},
              {s:9,  x:"45%", y:"12%", a:0.18, anim:"float3", dur:"6.5s", shape:"circle"},
              {s:5,  x:"82%", y:"50%", a:0.25, anim:"float1", dur:"8.5s", shape:"circle"},
              {s:11, x:"5%",  y:"48%", a:0.15, anim:"float4", dur:"9.5s", shape:"diamond"},
              {s:4,  x:"38%", y:"88%", a:0.2,  anim:"float5", dur:"7s",   shape:"circle"},
              {s:8,  x:"70%", y:"8%",  a:0.22, anim:"float2", dur:"6s",   shape:"circle"},
              {s:6,  x:"52%", y:"92%", a:0.15, anim:"float3", dur:"11s",  shape:"diamond"},
              {s:10, x:"20%", y:"35%", a:0.12, anim:"float1", dur:"8s",   shape:"circle"},
              {s:5,  x:"95%", y:"38%", a:0.2,  anim:"float5", dur:"7.5s", shape:"circle"},
              {s:7,  x:"33%", y:"18%", a:0.2,  anim:"float3", dur:"9s",   shape:"diamond"},
              {s:4,  x:"67%", y:"55%", a:0.18, anim:"float4", dur:"6.5s", shape:"circle"},
              {s:9,  x:"12%", y:"85%", a:0.12, anim:"float2", dur:"8s",   shape:"circle"},
              {s:5,  x:"78%", y:"42%", a:0.2,  anim:"float1", dur:"7s",   shape:"diamond"},
              {s:6,  x:"42%", y:"72%", a:0.15, anim:"float5", dur:"9.5s", shape:"circle"},
              {s:8,  x:"55%", y:"25%", a:0.18, anim:"float3", dur:"7.5s", shape:"circle"},
              {s:4,  x:"3%",  y:"72%", a:0.22, anim:"float4", dur:"6s",   shape:"diamond"},
              {s:6,  x:"86%", y:"85%", a:0.15, anim:"float2", dur:"10s",  shape:"circle"},
              {s:10, x:"48%", y:"5%",  a:0.12, anim:"float1", dur:"8.5s", shape:"circle"},
              {s:5,  x:"22%", y:"52%", a:0.2,  anim:"float5", dur:"7s",   shape:"diamond"},
              {s:7,  x:"64%", y:"40%", a:0.16, anim:"float2", dur:"9s",   shape:"circle"},
              {s:4,  x:"30%", y:"95%", a:0.14, anim:"float4", dur:"6.5s", shape:"diamond"},
              {s:9,  x:"50%", y:"60%", a:0.12, anim:"float1", dur:"11s",  shape:"circle"},
              {s:5,  x:"18%", y:"10%", a:0.2,  anim:"float3", dur:"7s",   shape:"circle"},
              {s:8,  x:"97%", y:"22%", a:0.18, anim:"float5", dur:"8s",   shape:"diamond"},
              {s:4,  x:"40%", y:"45%", a:0.14, anim:"float2", dur:"10s",  shape:"circle"},
              {s:6,  x:"73%", y:"95%", a:0.12, anim:"float4", dur:"7.5s", shape:"circle"},
              {s:10, x:"2%",  y:"30%", a:0.15, anim:"float1", dur:"9s",   shape:"diamond"},
              {s:5,  x:"58%", y:"15%", a:0.2,  anim:"float3", dur:"6s",   shape:"circle"},
              {s:7,  x:"35%", y:"60%", a:0.12, anim:"float5", dur:"8.5s", shape:"circle"},
              {s:4,  x:"80%", y:"62%", a:0.18, anim:"float2", dur:"7s",   shape:"diamond"},
              {s:11, x:"10%", y:"95%", a:0.1,  anim:"float4", dur:"12s",  shape:"circle"},
              {s:5,  x:"90%", y:"45%", a:0.2,  anim:"float1", dur:"6.5s", shape:"circle"},
              {s:6,  x:"28%", y:"40%", a:0.14, anim:"float3", dur:"9.5s", shape:"diamond"},
              {s:8,  x:"62%", y:"68%", a:0.12, anim:"float5", dur:"8s",   shape:"circle"},
            ].map((p,i)=>(
              <div key={i} style={{
                position:"absolute", left:p.x, top:p.y,
                width:p.s, height:p.s,
                borderRadius: p.shape==="circle" ? "50%" : "2px",
                transform: p.shape==="diamond" ? "rotate(45deg)" : undefined,
                background:"white", opacity:p.a,
                animation:`${p.anim} ${p.dur} ease-in-out infinite`,
                animationDelay:`${i*0.3}s`,
                pointerEvents:"none"
              }}/>
            ))}
            <div style={{maxWidth:720, margin:"0 auto", textAlign:"center", position:"relative", zIndex:1}}>

              {/* Hero content — always rendered, just fades when loading */}
              <div style={{
                transition:"opacity 0.4s ease",
                opacity: loading ? 0 : 1,
                pointerEvents: loading ? "none" : "auto",
              }}>
              <div style={{display:"inline-flex", alignItems:"center", gap:6, background:"rgba(255,255,255,0.1)", color:"#86efac", fontSize:13, fontWeight:600, padding:"5px 14px", borderRadius:20, marginBottom:24, textTransform:"uppercase", letterSpacing:"0.05em", backdropFilter:"blur(4px)"}}>
                <IconShield size={13} color="#86efac"/> AI-Powered Risk Analysis
              </div>
              <h1 style={{fontFamily:"'Outfit',sans-serif", fontSize:isMobile?34:52, fontWeight:700, color:"#ffffff", margin:"0 0 16px", letterSpacing:isMobile?"-1px":"-1.5px", lineHeight:1.15}}>
                Scan anything.<br/>Know everything.
              </h1>
              <p style={{fontSize:isMobile?15:18, color:"#86efac", margin:"0 0 28px", lineHeight:1.7}}>
                {isMobile ? "Scan any product to understand its risks for you, your home and your planet." : "Scan any product to understand its risks for you, your home and your planet. Instantly."}
              </p>
                <div style={{display:"flex", maxWidth:580, margin:"0 auto 16px", background:"white", borderRadius:14, boxShadow:"0 8px 32px rgba(0,0,0,0.3)", height:52}}>
                  <div style={{display:"flex", alignItems:"center", paddingLeft:12, flexShrink:0, borderRadius:"14px 0 0 14px"}}><IcoSearch size={20}/></div>
                  <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&analyze()}
                    placeholder="Search any product…"
                    style={{flex:1, padding:"0 8px", border:"none", outline:"none", fontSize:16, background:"transparent", color:"#111", minWidth:0, width:0, height:"100%"}}/>

                  {/* Camera button — mobile only */}
                  {isMobile && (
                    <label style={{display:"flex", alignItems:"center", justifyContent:"center", width:44, minWidth:44, height:52, flexShrink:0, cursor:"pointer", borderLeft:"1px solid #eee"}}>
                      <input type="file" accept="image/*" style={{display:"none"}}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          e.target.value = "";
                          setResult(null); setError(null); setPage("home");
                          setLoading(true); setQuery("Reading label…");
                          try {
                            const base64 = await new Promise((res, rej) => {
                              const img = new Image();
                              const url = URL.createObjectURL(file);
                              img.onload = () => {
                                const canvas = document.createElement("canvas");
                                const MAX = 1200;
                                const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
                                canvas.width  = Math.round(img.width  * ratio);
                                canvas.height = Math.round(img.height * ratio);
                                canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
                                URL.revokeObjectURL(url);
                                res(canvas.toDataURL("image/jpeg", 0.85).split(",")[1]);
                              };
                              img.onerror = rej;
                              img.src = url;
                            });
                            const idResp = await fetch(`${API_BASE}/analyze`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ image: base64, mediaType: "image/jpeg" })
                            });
                            if (idResp.status === 429) { setLoading(false); setQuery(""); setError("Too many requests. Please wait a moment and try again."); return; }
                            if (!idResp.ok) throw new Error(`Server error ${idResp.status}`);
                            const data = await idResp.json();
                            if (!data.product_name) throw new Error("Nothing detected");
                            setQuery(data.product_name);
                            setResult(data);
                            saveToHistory(data);
                            setLoading(false);
                          } catch(err) {
                            console.error("Image scan error:", err);
                            setLoading(false); setQuery("");
                            setError("Couldn't identify that product. Try a photo of the front label, nutrition panel, or clothing tag — or just type the product name.");
                          }
                        }}
                      />
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                        <circle cx="12" cy="13" r="4"/>
                      </svg>
                    </label>
                  )}

                  {/* Scan button */}
                  <button onClick={()=>analyze()} disabled={!query.trim()||loading}
                    style={{width:isMobile?64:88, minWidth:isMobile?64:88, height:52, flexShrink:0, border:"none",
                      borderRadius:"0 14px 14px 0",
                      background:query.trim()?"#052e16":"#e0e0e0", color:query.trim()?"#4ade80":"#999",
                      fontWeight:700, fontSize:15, cursor:query.trim()?"pointer":"default",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      transition:"background 0.15s", whiteSpace:"nowrap"}}>
                    Scan
                  </button>
                </div>

                {isMobile && (
                  <div style={{textAlign:"center", marginBottom:12, marginTop:-8}}>
                    <span style={{fontSize:12, color:"rgba(255,255,255,0.4)"}}>Tap to photo a product label, tag, or packaging</span>
                  </div>
                )}

                {/* Social proof */}
                <div style={{display:"flex", justifyContent:"center", alignItems:"center", gap:16, marginBottom:20}}>
                  <div style={{display:"flex", alignItems:"center", gap:6, fontSize:13, color:"rgba(255,255,255,0.5)"}}>
                    <div style={{width:8, height:8, borderRadius:"50%", background:"#4ade80"}}/>
                    Free · No sign-up
                  </div>
                  <div style={{width:1, height:12, background:"rgba(255,255,255,0.2)"}}/>
                  <div style={{fontSize:13, color:"rgba(255,255,255,0.5)"}}>AI-powered · Two-pass verified</div>
                </div>
              </div>{/* end hero content fade wrapper */}

              {error&&<div style={{marginTop:20,padding:"14px 20px",background:"rgba(239,68,68,0.15)",borderRadius:10,color:"#fca5a5",fontSize:14,border:"1px solid rgba(239,68,68,0.3)"}}>{error}</div>}
            </div>
          </section>

          {/* Fixed fullscreen globe overlay — covers entire viewport, centered */}
          {loading && (
            <div style={{
              position:"fixed", top:0, left:0, right:0, bottom:0,
              background:"#052e16",
              zIndex:9999,
              display:"flex", flexDirection:"column",
              alignItems:"center", justifyContent:"center",
              animation:"globeOverlayIn 0.4s ease forwards",
            }}>
              <style>{`@keyframes globeOverlayIn{from{opacity:0}to{opacity:1}}`}</style>
              <GlobeLoading isMobile={isMobile}/>
            </div>
          )}

          <div style={{paddingTop:isMobile?32:56}}>

            {/* Trust strip — moved up, first thing below hero */}
            <div style={{maxWidth:860, margin:"0 auto 60px", padding:`0 ${isMobile?"16px":"40px"}`}}>
              <div style={{display:"grid", gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)", gap:isMobile?16:24}}>
                {[
                  {icon:"score",    title:"Science-backed",      body:"Every score grounded in peer-reviewed research from NEJM, Nature Medicine and The Lancet"},
                  {icon:"safety",   title:"No brand influence",   body:"No brand can pay to change a score. Affiliate links are always clearly disclosed"},
                  {icon:"verified", title:"Two-pass verified",    body:"Every scan runs two independent AI passes to check and audit the score"},
                  {icon:"scan",     title:"Always free",          body:"No account, no paywall, no ads. Just answers about what is in your products"},
                ].map((item,i) => (
                  <div key={i} style={{
                    background:isDark?"#1e2433":"#fff",
                    borderRadius:16, padding:"24px 20px", textAlign:"center",
                    border:`1.5px solid ${isDark?"#2a3347":"#f0fdf4"}`,
                    display:"flex", flexDirection:"column", alignItems:"center", gap:12,
                  }}>
                    <div style={{width:64, height:64, borderRadius:"50%", background:isDark?"#1a2a1a":"#f0fdf4", display:"flex", alignItems:"center", justifyContent:"center"}}>
                      {item.icon==="score"&&<IcoScore size={36}/>}{item.icon==="safety"&&<IcoSafety size={36}/>}{item.icon==="verified"&&<IcoVerified size={36}/>}{item.icon==="scan"&&<IcoScan size={36}/>}
                    </div>
                    <div style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:15, color:isDark?"#f1f5f9":"#111"}}>{item.title}</div>
                    <div style={{fontSize:13, color:isDark?"#64748b":"#888", lineHeight:1.6}}>{item.body}</div>
                  </div>
                ))}
              </div>
            </div>

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
            {/* Impact stats box */}
            <div style={{maxWidth:960, margin:"0 auto 60px", padding:`0 ${isMobile?"16px":"40px"}`}}>
              <div style={{background:isDark?"#1e2433":"#f4f7f4", borderRadius:20, padding:isMobile?"32px 24px":"48px 56px", position:"relative", overflow:"hidden", border:`1.5px solid ${isDark?"#2a3347":"#d1e8d1"}`}}>
                {/* Floating particles */}
                {[
                  {s:8, x:"5%",  y:"20%", a:0.25, shape:"circle"},
                  {s:5, x:"92%", y:"15%", a:0.2,  shape:"diamond"},
                  {s:12,x:"88%", y:"70%", a:0.18, shape:"circle"},
                  {s:6, x:"8%",  y:"75%", a:0.22, shape:"diamond"},
                  {s:9, x:"50%", y:"8%",  a:0.15, shape:"circle"},
                  {s:4, x:"70%", y:"90%", a:0.2,  shape:"circle"},
                  {s:7, x:"25%", y:"85%", a:0.15, shape:"diamond"},
                  {s:5, x:"78%", y:"45%", a:0.2,  shape:"circle"},
                ].map((p,i)=>(
                  <div key={i} style={{position:"absolute", left:p.x, top:p.y, width:p.s, height:p.s, borderRadius:p.shape==="circle"?"50%":"2px", transform:p.shape==="diamond"?"rotate(45deg)":undefined, background:"#16a34a", opacity:p.a, pointerEvents:"none"}}/>
                ))}

                <div style={{position:"relative", zIndex:1}}>
                  <div style={{fontSize:isMobile?13:14, color:"#16a34a", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:8, textAlign:"center"}}>Why it matters</div>
                  <p style={{fontSize:isMobile?14:16, color:isDark?"#94a3b8":"#555", lineHeight:1.7, maxWidth:560, margin:"0 auto 40px", textAlign:"center"}}>
                    The products around you affect more than you realize. Here is what the research says.
                  </p>

                  {/* Three spheres */}
                  {[
                    {
                      label: "Your Health",
                      color: "#16a34a",
                      stats: [
                        {number:"100%", label:"of human blood samples tested contained microplastics", sub:"Leslie et al. 2022"},
                        {number:"58%",  label:"of arterial plaques studied contained polypropylene plastic", sub:"Marfella et al. NEJM 2024"},
                        {number:"2024", label:"FDA banned Red 3 and began phasing out all petroleum-based synthetic dyes", sub:"FDA announcement"},
                      ]
                    },
                    {
                      label: "Your Home",
                      color: "#16a34a",
                      stats: [
                        {number:"PVA",   label:"film in dishwasher and laundry pods enters waterways as microplastic after dissolving", sub:"peer-reviewed lifecycle analysis"},
                        {number:"1,000+",label:"chemicals in everyday home products are known or suspected endocrine disruptors", sub:"Environmental Working Group"},
                        {number:"10x",   label:"higher microplastic concentrations found in infants compared to adults", sub:"multiple peer-reviewed studies"},
                      ]
                    },
                    {
                      label: "The Planet",
                      color: "#16a34a",
                      stats: [
                        {number:"8M",    label:"tonnes of plastic enter the world's oceans every single year", sub:"UNEP estimate"},
                        {number:"700K",  label:"microfibers released per wash from a single synthetic fleece jacket", sub:"Environment International"},
                        {number:"500yr", label:"the time it takes a standard plastic bag to break down in landfill", sub:"environmental science consensus"},
                      ]
                    },
                  ].map((sphere, si) => (
                    <div key={si} style={{marginBottom: si < 2 ? (isMobile?36:40) : 0}}>
                      <div style={{fontSize:12, fontWeight:700, color:sphere.color, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:16, textAlign:isMobile?"center":"left"}}>{sphere.label}</div>
                      <div style={{display:"grid", gridTemplateColumns:isMobile?"1fr":"repeat(3,1fr)", gap:isMobile?16:24}}>
                        {sphere.stats.map((s,i)=>(
                          <div key={i} style={{textAlign:isMobile?"center":"left"}}>
                            <div style={{fontFamily:"'Outfit',sans-serif", fontWeight:800, fontSize:isMobile?26:32, color:sphere.color, lineHeight:1, marginBottom:8}}>{s.number}</div>
                            <div style={{fontSize:12, color:isDark?"#94a3b8":"#444", lineHeight:1.5, marginBottom:4}}>{s.label}</div>
                            <div style={{fontSize:10, color:isDark?"#475569":"#999", fontStyle:"italic"}}>{s.sub}</div>
                          </div>
                        ))}
                      </div>
                      {si < 2 && <div style={{borderTop:`1px solid ${isDark?"#2a3347":"#d1e8d1"}`, marginTop:isMobile?28:32}}/>}
                    </div>
                  ))}

                  <div style={{fontSize:isMobile?14:16, color:isDark?"#94a3b8":"#555", lineHeight:1.7, maxWidth:520, margin:"36px auto 0", textAlign:"center"}}>
                    Most products carry no warning. No label. No guidance on what to do instead.
                    <span style={{color:"#16a34a", fontWeight:700}}> That is why Partiqule exists.</span>
                  </div>
                </div>
              </div>
            </div>

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
                    <><IcoRating size={14}/> Health Score</> <span style={{fontSize:10, opacity:0.6}}>(10 = most dangerous)</span>
                  </div>
                  {result.cached && <div style={{fontSize:10, fontWeight:600, color:"#16a34a", background:"#f0fdf4", padding:"2px 8px", borderRadius:10}}><IcoVerified size={14}/> Verified</div>}
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
                <div style={{marginBottom:16}}>
                  <div style={{display:"inline-block",background:scoreBg(result.overall_score||result.score),color:scoreColor(result.overall_score||result.score),padding:"7px 22px",borderRadius:20,fontSize:15,fontWeight:700,margin:"18px 0 8px"}}>{scoreLabel(result.overall_score||result.score)} Overall</div>
                  <div style={{fontSize:11,color:muted,marginTop:4}}>Materials 40% · Exposure 25% · Packaging 15% · Sustainability 15% · Manufacturing 5%</div>
                </div>

                {/* ── 5 DIMENSION DROPDOWNS ── */}
                {result.dimensions ? (() => {
                  const d = result.dimensions;
                  return (<>
                    {/* Food analysis — food_beverage only, sits above all other dropdowns */}
                    {result.category === "food_beverage" && result.food_analysis && (
                      <FoodAnalysisDropdown food={result.food_analysis} isDark={isDark}/>
                    )}
                    {/* 1. Materials */}
                    <DimensionDropdown icon={<IcoIngredients size={20}/>} label="Materials" score={d.materials?.score||result.score} concerns={d.materials?.concerns} isDark={isDark}>
                      {d.materials?.label && <p style={{fontSize:13,color:isDark?"#94a3b8":"#555",lineHeight:1.6,margin:"10px 0 4px",fontStyle:"italic"}}>{d.materials.label}</p>}
                      {result.identified_plastics?.length > 0 && (
                        <div style={{marginTop:8,marginBottom:4}}>
                          <div style={{fontSize:11,color:"#dc2626",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Plastics identified</div>
                          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                            {result.identified_plastics.map((p,i)=>(
                              <span key={i} style={{fontSize:12,fontWeight:700,padding:"3px 10px",borderRadius:16,background:isDark?"#2a1a1a":"#fef2f2",color:"#dc2626",border:"1px solid #fecaca"}}>{p}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {result.harmful_chemicals?.length > 0 && (
                        <div style={{marginTop:8}}>
                          <div style={{fontSize:11,color:"#d97706",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Harmful chemicals</div>
                          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                            {result.harmful_chemicals.map((c,i)=>(
                              <span key={i} style={{fontSize:12,fontWeight:600,padding:"3px 10px",borderRadius:16,background:isDark?"#2a1a00":"#fffbeb",color:"#d97706",border:"1px solid #fde68a"}}>{c}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {result.natural_materials?.length > 0 && (
                        <div style={{marginTop:8}}>
                          <div style={{fontSize:11,color:"#16a34a",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Natural materials</div>
                          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                            {result.natural_materials.map((m,i)=>(
                              <span key={i} style={{fontSize:12,fontWeight:600,padding:"3px 10px",borderRadius:16,background:isDark?"#1a2a1a":"#f0fdf4",color:"#16a34a",border:"1px solid #bbf7d0"}}>{m}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </DimensionDropdown>

                    {/* 2. Usage & Exposure */}
                    <DimensionDropdown icon={<IcoSafety size={20}/>} label="Usage & Exposure" score={d.usage_exposure?.score||5} concerns={d.usage_exposure?.concerns} isDark={isDark}>
                      {d.usage_exposure?.label && <p style={{fontSize:13,color:isDark?"#94a3b8":"#555",lineHeight:1.6,margin:"10px 0 4px",fontStyle:"italic"}}>{d.usage_exposure.label}</p>}
                      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
                        {d.usage_exposure?.frequency && d.usage_exposure.frequency !== "unknown" && (
                          <span style={{fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:20,background:"#eff6ff",color:"#1d4ed8",display:"flex",alignItems:"center",gap:4}}>
                            <IcoScore size={12}/>{d.usage_exposure.frequency === "daily" ? "Daily use" : d.usage_exposure.frequency === "weekly" ? "Weekly use" : d.usage_exposure.frequency === "occasional" ? "Occasional" : "Rare use"}
                          </span>
                        )}
                        {d.usage_exposure?.type && d.usage_exposure.type !== "unknown" && (
                          <span style={{fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:20,background:"#fdf4ff",color:"#7e22ce",display:"flex",alignItems:"center",gap:4}}>
                            <IcoSafety size={12}/>{d.usage_exposure.type === "ingestion" ? "Ingestion risk" : d.usage_exposure.type === "skin_contact" ? "Skin contact" : d.usage_exposure.type === "inhalation" ? "Inhalation risk" : "Mixed exposure"}
                          </span>
                        )}
                        {d.usage_exposure?.intensity && d.usage_exposure.intensity !== "unknown" && (
                          <span style={{fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:20,background:"#fff7ed",color:"#c2410c",display:"flex",alignItems:"center",gap:4}}>
                            <IcoScore size={12}/>{d.usage_exposure.intensity === "leave-on" ? "Leave-on" : d.usage_exposure.intensity === "rinse-off" ? "Rinse-off" : "Single contact"}
                          </span>
                        )}
                        {d.usage_exposure?.vulnerable && (
                          <span style={{fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:20,background:"#fdf2f8",color:"#9d174d",display:"flex",alignItems:"center",gap:4}}><IcoProfile size={12}/> Child product</span>
                        )}
                      </div>
                    </DimensionDropdown>

                    {/* 3. Packaging */}
                    <DimensionDropdown icon={<IcoCategory size={20}/>} label="Packaging" score={d.packaging?.score||5} concerns={d.packaging?.concerns} isDark={isDark}>
                      {d.packaging?.label && <p style={{fontSize:13,color:isDark?"#94a3b8":"#555",lineHeight:1.6,margin:"10px 0 4px",fontStyle:"italic"}}>{d.packaging.label}</p>}
                      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
                        {d.packaging?.refillable && <span style={{fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:20,background:"#f0fdf4",color:"#16a34a"}}><IcoSaved size={12}/> Refillable</span>}
                        {d.packaging?.primary && d.packaging.primary !== "unknown" && (
                          <span style={{fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:20,background:isDark?"#1e2433":"#f9fafb",color:isDark?"#94a3b8":"#555",border:`1px solid ${isDark?"#2a3347":"#e5e7eb"}`}}>
                            {d.packaging.primary}
                          </span>
                        )}
                        {d.packaging?.end_of_life && d.packaging.end_of_life !== "unknown" && (
                          <span style={{fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:20,background:isDark?"#1e2433":"#f9fafb",color:isDark?"#94a3b8":"#555",border:`1px solid ${isDark?"#2a3347":"#e5e7eb"}`}}>
                            {d.packaging.end_of_life}
                          </span>
                        )}
                      </div>
                    </DimensionDropdown>

                    {/* 4. Sustainability */}
                    <DimensionDropdown icon={<IcoSaved size={20}/>} label="Sustainability" score={d.sustainability?.score||5} concerns={d.sustainability?.concerns} isDark={isDark}>
                      {d.sustainability?.label && <p style={{fontSize:13,color:isDark?"#94a3b8":"#555",lineHeight:1.6,margin:"10px 0 4px",fontStyle:"italic"}}>{d.sustainability.label}</p>}
                      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
                        {d.sustainability?.reusable && <span style={{fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:20,background:"#f0fdf4",color:"#16a34a"}}><IcoSaved size={12}/> Reusable</span>}
                        {d.sustainability?.replaces_single_use && <span style={{fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:20,background:"#f0fdf4",color:"#16a34a"}}><IcoVerified size={12}/> Replaces single-use</span>}
                        {d.sustainability?.circularity && d.sustainability.circularity !== "unknown" && (
                          <span style={{fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:20,background:isDark?"#1e2433":"#f9fafb",color:isDark?"#94a3b8":"#555",border:`1px solid ${isDark?"#2a3347":"#e5e7eb"}`}}>
                            {d.sustainability.circularity}
                          </span>
                        )}
                      </div>
                    </DimensionDropdown>

                    {/* 5. Manufacturing — smaller estimated badge */}
                    <ManufacturingBadge mfg={d.manufacturing} isDark={isDark} muted={muted}/>

                    {/* Mobile only — scroll to alternatives CTA */}
                    {isMobile && (
                      <button
                        onClick={()=>document.getElementById("safer-alternatives")?.scrollIntoView({behavior:"smooth", block:"start"})}
                        style={{
                          width:"100%", marginTop:6, padding:"12px 16px",
                          background:"#052e16", color:"#4ade80",
                          border:"none", borderRadius:12, cursor:"pointer",
                          fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:14,
                          display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                        }}>
                        <IcoProducts size={16}/> See safer alternatives ↓
                      </button>
                    )}
                  </>);
                })() : (
                  <div style={{padding:"12px 16px", background:isDark?"#1e2433":"#f9fafb", borderRadius:12, border:`1px dashed ${isDark?"#2a3347":"#e5e7eb"}`, marginBottom:10, textAlign:"left"}}>
                    <div style={{fontSize:12, color:muted, lineHeight:1.6}}><IcoScan size={14}/> <strong>Rescan for full breakdown</strong> — this result predates our 5-dimension analysis. Scan again to see Materials, Exposure, Packaging, Sustainability and Manufacturing scores.</div>
                  </div>
                )}

                {/* Peer comparison */}
                {result.peer_comparison && (
                  <div style={{fontSize:12, color:muted, marginBottom:16, fontStyle:"italic"}}>{result.peer_comparison}</div>
                )}

                {/* Exposure badges */}
                {(result.exposure_frequency || result.exposure_type) && (
                  <div style={{display:"flex", gap:6, justifyContent:"center", marginBottom:14, flexWrap:"wrap"}}>
                    {result.exposure_frequency && result.exposure_frequency !== "unknown" && (
                      <div style={{fontSize:11, fontWeight:600, padding:"3px 10px", borderRadius:20, background:"#eff6ff", color:"#1d4ed8", display:"flex", alignItems:"center", gap:4}}>
                        <IcoScore size={12}/>
                        {result.exposure_frequency === "daily" ? "Daily use" :
                         result.exposure_frequency === "weekly" ? "Weekly use" :
                         result.exposure_frequency === "occasional" ? "Occasional" : "Rare use"}
                      </div>
                    )}
                    {result.exposure_type && result.exposure_type !== "unknown" && (
                      <div style={{fontSize:11, fontWeight:600, padding:"3px 10px", borderRadius:20, background:"#fdf4ff", color:"#7e22ce", display:"flex", alignItems:"center", gap:4}}>
                        <IcoSafety size={12}/>
                        {result.exposure_type === "ingestion" ? "Ingestion risk" :
                         result.exposure_type === "skin_contact" ? "Skin contact" :
                         result.exposure_type === "inhalation" ? "Inhalation risk" : "Mixed exposure"}
                      </div>
                    )}
                  </div>
                )}

                <p style={{fontSize:15,color:isDark?"#94a3b8":"#555",lineHeight:1.75,margin:0,textAlign:"left"}}>{result.summary}</p>

                {/* Exposure Calculator — replaces break-even card */}
                {(result.break_even || result.alternatives?.length > 0) && (
                  <ExposureCalculator
                    result={result}
                    isDark={isDark}
                    text={text}
                    muted={muted}
                    isMobile={isMobile}
                  />
                )}

                <SplitView result={result} isDark={isDark} onScan={(name)=>{setResult(null); setQuery(name); analyze(name);}}/>
                <ShareBadge result={result}/>
              </div>

              {result.concerns?.length>0&&(
                <div className="fade-up" style={{background:isDark?"#1e2433":"#fffbeb", borderRadius:16, padding:"28px 32px", border:`1.5px solid ${isDark?"#2a3347":"#fde68a"}`, borderLeft:"4px solid #d97706"}}>
                  <h3 style={{fontFamily:"'Outfit',sans-serif",fontWeight:700,fontSize:17,color:text,margin:"0 0 18px",display:"flex",alignItems:"center",gap:8}}><IcoInfo size={20}/> Key Concerns</h3>
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
                  <h3 id="safer-alternatives" style={{fontFamily:"'Outfit',sans-serif",fontWeight:700,fontSize:20,color:text,margin:0,display:"flex",alignItems:"center",gap:8}}><IcoProducts size={22}/> Safer Alternatives</h3>
                  {result.alternatives?.length > 0 && result.category !== "other" && (
                    <div style={{fontSize:11, color:muted, background:isDark?"#1e2433":"#f9fafb", padding:"4px 10px", borderRadius:20, border:`1px solid ${border}`}}>
                      #ad · affiliate links
                    </div>
                  )}
                </div>

                {/* UNIFIED ALTERNATIVES — max 3, DB first, AI fills gaps, no duplicates */}
                {(() => {
                  const cat = result.category;

                  // DB alternatives — backend already handles relevance and category logic
                  const dbAlts = (result.alternatives || []).slice(0, 3);

                  // AI alternatives — deduplicate against DB, fill to 3
                  const dbNames = new Set(dbAlts.map(p => p.name?.toLowerCase().trim()));
                  const aiAlts = (result.ai_alternatives || [])
                    .filter((a, i, arr) => arr.findIndex(b => b.name?.toLowerCase().trim() === a.name?.toLowerCase().trim()) === i)
                    .filter(a => !dbNames.has(a.name?.toLowerCase().trim()))
                    .slice(0, 3 - dbAlts.length);


                  const hasAffiliate = dbAlts.length > 0 && cat !== "other";

                  if (!dbAlts.length && !aiAlts.length) return null;

                  return (
                    <div>
                      {dbAlts.map(p => <ProductCard key={p.id} product={p} isDark={isDark}/>)}
                      {aiAlts.length > 0 && (
                        <div style={{display:"flex", flexDirection:"column", gap:8, marginTop: dbAlts.length > 0 ? 10 : 0}}>
                          {dbAlts.length > 0 && (
                            <div style={{fontSize:12, color:muted, textAlign:"center", marginBottom:4}}>More suggestions from our AI</div>
                          )}
                          {aiAlts.map((alt, i) => (
                            <div key={i} style={{background:isDark?"#1a2a1e":"#f0fdf4", borderRadius:12, padding:"16px 18px", border:`1.5px solid ${isDark?"#1e3a22":"#bbf7d0"}`}}>
                              <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8, marginBottom:6}}>
                                <div style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:15, color:text, lineHeight:1.3}}>{alt.name}</div>
                                <div style={{background:scoreBg(alt.estimated_score), color:scoreColor(alt.estimated_score), fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:20, flexShrink:0}}>{alt.estimated_score}/10</div>
                              </div>
                              <div style={{fontSize:12, color:isDark?"#86efac":"#166534", marginBottom:8, lineHeight:1.5}}>{alt.material}</div>
                              <div style={{fontSize:13, color:muted, lineHeight:1.5, marginBottom:10}}>{alt.reason}</div>
                              <button onClick={()=>{setResult(null); setQuery(alt.name); analyze(alt.name);}}
                                style={{display:"flex", alignItems:"center", gap:5, fontSize:12, color:"#16a34a", fontWeight:600, background:"none", border:"none", cursor:"pointer", padding:0}}>
                                <IcoSearch size={14}/> Scan this product →
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {hasAffiliate && (
                        <p style={{fontSize:12,color:muted,textAlign:"center",marginTop:12,lineHeight:1.5}}>We may earn a commission if you buy through affiliate links — at no extra cost to you. This funds free access to Partiqule.</p>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* BUNDLE */}
              <BundleCard category={result.category} isDark={isDark}/>

              {/* SCAN NEXT */}
              {result.scan_next?.length > 0 && (
                <div style={{background:surface, borderRadius:16, padding:"20px 24px", border:`1.5px solid ${border}`}}>
                  <h3 style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:15, color:text, margin:"0 0 14px"}}><IcoScan size={16}/> Scan these next</h3>
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
            {label:"About",           pg:"about",       path:"/about"},
            {label:"The Science",     pg:"science",     path:"/science"},
            {label:"My Scans",        pg:"history",     path:"/history"},
            {label:"How It Works",    pg:"methodology", path:"/methodology"},
            {label:"Terms of Service",pg:"privacy",     path:"/privacy"},
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
          <div style={{marginBottom:6}}>
            © 2026 Partiqule
          </div>
          <div style={{marginBottom:8, fontSize:12, color:"#555", lineHeight:1.6}}>
            As an Amazon Associate I earn from qualifying purchases. Affiliate links are always clearly labeled and never influence our scores.
          </div>
          <a href="mailto:paul@partiqule.com" onClick={e=>{e.preventDefault(); window.location.href="mailto:paul@partiqule.com";}} style={{color:"#555", textDecoration:"none", fontSize:13, transition:"color 0.15s"}}
            onMouseEnter={e=>e.target.style.color="#4ade80"}
            onMouseLeave={e=>e.target.style.color="#555"}>
            paul@partiqule.com
          </a>
        </div>
      </footer>
    </div>
  );
}

// ── ERROR BOUNDARY ────────────────────────────────────────────
// Catches any runtime crash and shows a recovery screen instead of blank white
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error, info) { console.error("Partiqule crash:", error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{minHeight:"100vh", background:"#052e16", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16, padding:32, textAlign:"center"}}>
          <div style={{display:"flex",justifyContent:"center"}}><IcoScan size={48}/></div>
          <div style={{fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:24, color:"#fff"}}>Something went wrong</div>
          <div style={{fontSize:14, color:"#86efac", maxWidth:320, lineHeight:1.6}}>Partiqule hit an unexpected error. Tap below to reload and try again.</div>
          <button onClick={()=>window.location.reload()} style={{padding:"12px 28px", borderRadius:10, border:"none", background:"#4ade80", color:"#052e16", fontWeight:700, fontSize:15, cursor:"pointer", marginTop:8}}>
            Reload Partiqule
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const AppWithBoundary = () => (
  <ErrorBoundary><App /></ErrorBoundary>
);

export { AppWithBoundary as default };
