import React, { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// Lazy-load @capgo/native-purchases via dynamic import so it only runs in
// Capacitor iOS (where require() doesn't exist and static import may fail
// at module load time on web). Stays null on non-native platforms.
let NativePurchases = null;
let PURCHASE_TYPE = { SUBS: "subs" };
let nativePurchasesLoading = null;
// Returns { plugin: <Capacitor Proxy or null> } — NOT the Proxy directly.
// Capacitor's plugin Proxy has a wildcard get trap that returns a function
// for any property including `then`, which makes Promise.resolve(proxy) treat
// the Proxy as a pending thenable. The resulting proxy.then(...) call posts
// a bridge message for a nonexistent "then" plugin method that never settles,
// so every `await` of an async function returning the raw Proxy hangs forever.
// Wrapping in an object shields Promise.resolve from seeing a thenable.
const loadNativePurchases = async () => {
  if (NativePurchases) { console.log("[IAP] loadNativePurchases cache hit"); return { plugin: NativePurchases }; }
  if (nativePurchasesLoading) { console.log("[IAP] loadNativePurchases already loading, awaiting"); return nativePurchasesLoading; }
  console.log("[IAP] loadNativePurchases starting dynamic import");
  nativePurchasesLoading = (async () => {
    try {
      const mod = await import("@capgo/native-purchases");
      console.log("[IAP] module import resolved, keys:", Object.keys(mod || {}).join(","));
      NativePurchases = mod.NativePurchases || null;
      console.log("[IAP] NativePurchases bound:", NativePurchases ? "yes" : "NO — module exported falsy");
      if (mod.PURCHASE_TYPE) {
        PURCHASE_TYPE = mod.PURCHASE_TYPE;
        console.log("[IAP] PURCHASE_TYPE:", JSON.stringify(PURCHASE_TYPE));
      } else {
        console.log("[IAP] mod.PURCHASE_TYPE missing — using fallback", JSON.stringify(PURCHASE_TYPE));
      }
      return { plugin: NativePurchases };
    } catch (e) {
      console.error("[IAP] dynamic import FAILED:", e?.name, e?.message, e?.stack);
      return { plugin: null };
    }
  })();
  return nativePurchasesLoading;
};

const API_BASE = "https://partiqule-production.up.railway.app";

// Bump APP_VERSION on every release that ships meaningful changes. The
// minimum-version gate at /min-version compares against this value and
// blocks the app with an Update Required screen if the running version
// is older than the server-controlled MIN_*_VERSION envs. Increase
// patch for bug fixes, minor for features, major for breaking changes.
const APP_VERSION = "1.3";

// App Store + social URLs used by the Update Required screen and the
// review-prompt modal. Replace APP_STORE_ID with the production App
// Store ID once it lands. The itms-apps:// scheme jumps directly into
// the App Store app on iOS; the https fallback works in browsers.
const APP_STORE_ID = "id6761738421";
const APP_STORE_URL_NATIVE = `itms-apps://itunes.apple.com/app/${APP_STORE_ID}`;
const APP_STORE_URL_WEB    = `https://apps.apple.com/app/${APP_STORE_ID}`;
const APP_STORE_REVIEW_URL_NATIVE = `${APP_STORE_URL_NATIVE}?action=write-review`;
const APP_STORE_REVIEW_URL_WEB    = `${APP_STORE_URL_WEB}?action=write-review`;
const INSTAGRAM_URL = "https://instagram.com/partiquleapp";
const TIKTOK_URL    = "https://tiktok.com/@partiqule";

// Naive semver compare: returns -1/0/1 for a < / = / > b. Handles
// "1.10.0" vs "1.2.0" correctly (numeric segments). Non-numeric
// suffixes (-beta etc.) are stripped before compare.
function compareVersions(a, b) {
  const parse = v => String(v || "0").split(/[.+\-]/)[0].split(".").map(n => parseInt(n) || 0);
  const A = parse(a), B = parse(b);
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const ai = A[i] || 0, bi = B[i] || 0;
    if (ai > bi) return 1;
    if (ai < bi) return -1;
  }
  return 0;
}

// Team emails — these accounts get automatic admin nav access
const ADMIN_EMAILS = ["paul@partiqule.com", "sara@partiqule.com"];
const isAdminUser = (user) => user && ADMIN_EMAILS.includes(user.email?.toLowerCase());

// Detect if running inside Capacitor iOS wrapper vs browser
// When StoreKit is implemented, use this to branch between Apple IAP and Stripe
const IS_NATIVE = typeof window !== "undefined" &&
  (window?.Capacitor?.isNativePlatform?.() || window?.Capacitor?.platform === "ios");


// ── Brand direct website lookup ────────────────────────────
const BRAND_URLS = {
  "hu":               "https://hukitchen.com",
  "hu chocolate":     "https://hukitchen.com",
  "blueland":         "https://blueland.com",
  "branch basics":    "https://branchbasics.com",
  "grove collaborative": "https://grove.co",
  "seventh generation": "https://seventhgeneration.com",
  "dr. bronner":      "https://drbronner.com",
  "dr bronner":       "https://drbronner.com",
  "schmidt's":        "https://schmidtsnaturals.com",
  "schmidts":         "https://schmidtsnaturals.com",
  "native":           "https://nativecos.com",
  "wellnesse":        "https://wellnesse.com",
  "larabar":          "https://larabar.com",
  "rxbar":            "https://rxbar.com",
  "rx bar":           "https://rxbar.com",
  "yumearth":         "https://yumearth.com",
  "unreal":           "https://getunreal.com",
  "pact":             "https://wearpact.com",
  "girlfriend collective": "https://girlfriend.com",
  "patagonia":        "https://patagonia.com",
  "allbirds":         "https://allbirds.com",
  "eileen fisher":    "https://eileenfisher.com",
  "prAna":            "https://prana.com",
  "prana":            "https://prana.com",
  "olipop":           "https://drinkolipop.com",
  "poppi":            "https://drinkpoppi.com",
  "spindrift":        "https://spindriftfresh.com",
  "liquid death":     "https://liquiddeath.com",
  "harmless harvest": "https://harmlessharvest.com",
  "guayaki":          "https://guayaki.com",
  "alter eco":        "https://alterecofoods.com",
  "theo":             "https://theochocolate.com",
  "badger":           "https://badgerbalm.com",
  "bite":             "https://bitetoothpastebits.com",
  "risewell":         "https://risewell.com",
  "primally pure":    "https://primallypure.com",
  "ursa major":       "https://ursamajorbeauty.com",
  "ilia":             "https://iliabeauty.com",
  "thinksport":       "https://gothinksport.com",
  "raw elements":     "https://rawelementssunscreen.com",
  "beautycounter":    "https://beautycounter.com",
  "honest company":   "https://honest.com",
  "dyper":            "https://dyper.com",
  "coterie":          "https://coterie.com",
  "andy pandy":       "https://andypandydiapers.com",
  "healthybaby":      "https://healthybaby.com",
  "kudos":            "https://kudosdiapers.com",
  "klean kanteen":    "https://kleankanteen.com",
  "stasher":          "https://stasherbag.com",
  "vuori":            "https://vuoriclothing.com",
};

// Big box search URLs
const BIGBOX_URLS = {
  target: (name) => `https://www.target.com/s?searchTerm=${encodeURIComponent(name)}`,
  walmart: (name) => `https://www.walmart.com/search?q=${encodeURIComponent(name)}`,
};

function getBrandUrl(brandName, productName) {
  const key = (brandName || "").toLowerCase().trim();
  if (BRAND_URLS[key]) return BRAND_URLS[key];
  // Try partial match
  for (const [k, v] of Object.entries(BRAND_URLS)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  // Fallback to Google search for brand website
  return `https://www.google.com/search?q=${encodeURIComponent((brandName || productName) + " official site")}`;
}

// Returns true if we have a known direct brand URL for this product
function hasBrandUrl(brandName, productName) {
  const key = (brandName || "").toLowerCase().trim();
  if (key && BRAND_URLS[key]) return true;
  for (const k of Object.keys(BRAND_URLS)) {
    if (key && (key.includes(k) || k.includes(key))) return true;
  }
  const pkey = (productName || "").toLowerCase().trim();
  if (pkey && BRAND_URLS[pkey]) return true;
  for (const k of Object.keys(BRAND_URLS)) {
    if (pkey && (pkey.includes(k) || k.includes(pkey))) return true;
  }
  return false;
}

// Filter alternatives list based on selected shopping source
// Amazon: everything | Brand: DTC brands only | Target: non-DTC / mass-market
function filterAltsBySource(alts, source) {
  if (!alts?.length) return [];
  if (source === "amazon") return alts;
  if (source === "brand")  return alts.filter(a => hasBrandUrl(a.brand, a.name));
  if (source === "bigbox") return alts.filter(a => !hasBrandUrl(a.brand, a.name));
  return alts;
}

// Detect if running inside Capacitor iOS app
const isCapacitor = typeof window !== "undefined" && !!(window.Capacitor?.isNativePlatform?.());
const isIOS = isCapacitor || /iPad|iPhone|iPod/.test(navigator.userAgent);


// Get safe area inset top — works in Capacitor and Safari
function getSafeAreaTop() {
  if (typeof document === "undefined") return 0;
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;top:env(safe-area-inset-top,0px);left:0;width:0;height:0;pointer-events:none;";
  document.body.appendChild(el);
  const top = el.getBoundingClientRect().top;
  document.body.removeChild(el);
  // Fallback only for the Capacitor native iOS app — mobile Safari and
  // mobile Chrome handle the status bar themselves, so injecting fake padding
  // into web contexts creates a visible gap above the header.
  return top > 0 ? top : (isCapacitor ? 47 : 0);
}

const SAFE_TOP = getSafeAreaTop();

// ── BRAND EXTRACTION ─────────────────────────────────────────────
// Multi-word brand names that the first-capitalized-word regex misses —
// "Salt and Stone" (lowercase "and"), "Ben & Jerry's" (ampersand glyph),
// "Bob's Red Mill" (three tokens), etc. Order matters: longer prefixes first
// so "Dr. Bronner's" wins before any shorter "Dr." brand would.
const KNOWN_MULTIWORD_BRANDS = [
  "Annie's Homegrown",
  "Bob's Red Mill",
  "Ben & Jerry's",
  "Burt's Bees",
  "Dr. Bronner's",
  "Dr. Bronner",
  "General Mills",
  "Johnson & Johnson",
  "Kraft Heinz",
  "Mrs. Meyer's",
  "Procter & Gamble",
  "Salt & Stone",
  "Salt and Stone",
  "Seventh Generation",
  "Tom's of Maine",
  "Trader Joe's",
  "Whole Foods",
  "Amy's Kitchen",
];

// Normalise a string for brand-prefix comparison: lowercase + collapse
// whitespace + treat "&" and "and" as equivalent so user input can use either.
const normaliseForBrand = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/\s*&\s*/g, " and ")
    .replace(/\s+/g, " ")
    .trim();

// Words that look like brand candidates to the regex fallback (capitalized,
// leading) but are actually product descriptors. "Diet Coke" → don't extract
// "Diet" as the brand. "Organic Bananas" → don't extract "Organic". When the
// regex fallback hits one of these, return no brand so the full product name
// renders as the body.
const NON_BRAND_PREFIXES = new Set([
  "diet", "organic", "natural", "classic", "original", "fresh", "raw",
  "pure", "premium", "deluxe", "regular", "lite", "light", "zero",
  "extra", "super", "ultra", "mini", "large", "small",
]);

// Extract brand eyebrow + remaining product body from a product_name string.
// Priority:
//   1. explicit providedBrand arg (e.g. alt.brand or result.brand) — strip
//      matching prefix from the body if it's there, else leave body intact.
//   2. KNOWN_MULTIWORD_BRANDS prefix match on the raw product_name.
//   3. Regex fallback: 1 or 2 leading capitalized words, skipped when the
//      first word is a known non-brand descriptor (Diet, Organic, etc.).
// Returns { brand, body }; brand is "" when nothing matches.
const extractBrand = (productName, providedBrand) => {
  const name = String(productName || "").trim();
  if (!name) return { brand: providedBrand || "", body: "" };
  if (providedBrand) {
    const normName = normaliseForBrand(name);
    const normBrand = normaliseForBrand(providedBrand);
    if (normBrand && (normName === normBrand || normName.startsWith(normBrand + " "))) {
      // Slice off the matched token count from the raw name to preserve original casing on the body.
      const tokens = name.split(/\s+/);
      const brandTokens = normBrand.split(" ").length;
      return { brand: providedBrand, body: tokens.slice(brandTokens).join(" ") };
    }
    return { brand: providedBrand, body: name };
  }
  const normName = normaliseForBrand(name);
  for (const canon of KNOWN_MULTIWORD_BRANDS) {
    const normCanon = normaliseForBrand(canon);
    if (normName === normCanon || normName.startsWith(normCanon + " ")) {
      const tokens = name.split(/\s+/);
      const brandTokens = normCanon.split(" ").length;
      return { brand: canon, body: tokens.slice(brandTokens).join(" ") };
    }
  }
  // Regex fallback: first 1-2 leading capitalized words.
  const m = name.match(/^([A-Z][\w'&.]*(?:\s[A-Z][\w'&.]*)?)\s+(.+)$/);
  if (m) {
    // Skip when the leading word is a known product descriptor, not a brand.
    const firstWord = m[1].split(/\s+/)[0].toLowerCase();
    if (NON_BRAND_PREFIXES.has(firstWord)) return { brand: "", body: name };
    return { brand: m[1], body: m[2] };
  }
  return { brand: "", body: name };
};

// ── SUPABASE ──────────────────────────────────────────────────
const SUPA_URL = "https://hciyibnoipqvspmrflzh.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjaXlpYm5vaXBxdnNwbXJmbHpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNzk5NzcsImV4cCI6MjA5MDY1NTk3N30.ue_WmeiLbiCxMojsaXHzaOtRtSDoaP_0Ajlilx-0gjU";
const supabase = createClient(SUPA_URL, SUPA_KEY);

// Module-scoped auth helpers — same shape as the App-component versions, but
// reachable from top-level admin components (AdminPage, IntelAdminPage) so
// they don't have to embed an admin key in the bundle.
const authHeaders = async () => {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { "Authorization": `Bearer ${token}` } : {};
  } catch { return {}; }
};
const authedFetch = async (url, options = {}) => {
  const buildOpts = async () => ({
    ...options,
    headers: { ...(options.headers || {}), ...(await authHeaders()) },
  });
  let res = await fetch(url, await buildOpts());
  if (res.status !== 401) return res;
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data?.session) return res;
    res = await fetch(url, await buildOpts());
  } catch {}
  return res;
};

// Streaming /analyze consumer. POSTs with Accept: application/x-ndjson,
// reads the response as a ReadableStream, splits on newlines, and
// dispatches each line's parsed object to handlers keyed by event name.
//
// Lines with no event field are treated as a complete event (so backend
// fast paths that still call res.json behave correctly). Side effects
// like scan-counter increment and saveToHistory live in the complete
// handler so a backgrounded mid-stream connection never counts as a
// successful scan.
const streamingAnalyze = async (body, handlers, signal) => {
  const res = await authedFetch(`${API_BASE}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/x-ndjson" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e = new Error(err.error || `Error ${res.status}`);
    e.status = res.status;
    e.body = err;
    throw e;
  }
  if (!res.body || !res.body.getReader) {
    // Older clients without ReadableStream — fall back to one-shot JSON
    const data = await res.json();
    handlers.complete?.(data);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let parsed;
      try { parsed = JSON.parse(line); } catch { continue; }
      const event = parsed.event || "complete";
      const handler = handlers[event];
      if (handler) handler(parsed);
    }
  }
  // Flush any trailing line without newline
  if (buffer.trim()) {
    try {
      const parsed = JSON.parse(buffer.trim());
      const event = parsed.event || "complete";
      handlers[event]?.(parsed);
    } catch {}
  }
};

// ── BARCODE SCANNER ──────────────────────────────────────────
// Full-screen camera viewfinder with live barcode detection.
// Single code path for iOS, Android, and web: getUserMedia + native
// BarcodeDetector (delegates to Apple Vision on iOS WKWebView,
// GmsVision on Android WebView), with a ZXing fallback for browsers
// that don't ship BarcodeDetector. The previous MLKit-native path was
// removed because its dependency (GoogleMLKit/BarcodeScanning) is
// CocoaPods-only and our iOS project uses SPM — the plugin couldn't
// be linked, so it emitted "not implemented on ios" in Xcode logs.
// WebKit BarcodeDetector is hardware-accelerated and fast enough for
// point-and-shoot UPC/EAN scanning.
const BarcodeScannerView = ({ onBarcode, onPhoto, onClose }) => {
  const videoRef    = useRef(null);
  const canvasRef   = useRef(null);
  const [status,     setStatus]     = useState("starting");
  const [flash,      setFlash]      = useState(false);
  const [scanMsg,    setScanMsg]    = useState("Starting camera...");
  const [hint,       setHint]       = useState(false);
  const streamRef   = useRef(null);
  const controlsRef = useRef(null);
  const stopRef     = useRef(false);
  const rafRef      = useRef(null);
  const hintTimer   = useRef(null);

  const cleanup = async () => {
    stopRef.current = true;
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (hintTimer.current) { clearTimeout(hintTimer.current); hintTimer.current = null; }
    try { controlsRef.current?.stop?.(); } catch(e) {}
    try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch(e) {}
  };

  const onFound = (value) => {
    if (stopRef.current) return;
    stopRef.current = true;
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    setFlash(true);
    try { window.navigator?.vibrate?.(50); } catch(e) {}
    setTimeout(() => { cleanup(); onBarcode(value); }, 350);
  };

  useEffect(() => {
    const start = async () => {
      try {
        // Lower resolution = faster barcode decoding
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        setStatus("scanning"); setScanMsg("Point at a barcode");

        // Surface a gentle retry hint if the user hasn't found a barcode after 12s.
        hintTimer.current = setTimeout(() => {
          if (!stopRef.current) setHint(true);
        }, 12000);

        // WebKit BarcodeDetector — hardware-accelerated on iOS 17+ (Apple Vision)
        // and Android Chrome (GmsVision). Works inside Capacitor WKWebView with no
        // native plugin required. ZXing fallback stays for any WebView that lacks
        // the API (older iOS, some desktop browsers).
        if ("BarcodeDetector" in window) {
          const detector = new window.BarcodeDetector({
            formats: ["ean_13","ean_8","upc_a","upc_e","code_128","code_39","code_93","qr_code","data_matrix","itf","codabar"]
          });
          const scan = async () => {
            if (stopRef.current || !videoRef.current) return;
            try {
              const barcodes = await detector.detect(videoRef.current);
              if (barcodes.length > 0) { onFound(barcodes[0].rawValue); return; }
            } catch(e) {}
            if (!stopRef.current) rafRef.current = requestAnimationFrame(scan);
          };
          rafRef.current = requestAnimationFrame(scan);
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          const reader = new BrowserMultiFormatReader();
          const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current,
            (result) => { if (result && !stopRef.current) onFound(result.getText()); }
          );
          controlsRef.current = controls;
        }
      } catch(e) {
        console.warn("[BARCODE] camera/detector error:", e?.message || e);
        setStatus("error");
        setScanMsg(
          e?.name === "NotAllowedError"
            ? "Camera permission denied. Enable in Settings."
            : "Camera unavailable — try a photo instead."
        );
      }
    };
    start();
    return () => { cleanup(); };
  }, []);

  const takePhoto = async () => {
    // Always use the native camera for photos — much higher resolution and quality
    // than capturing a frame from the barcode scanner's 1280x720 video stream.
    // The live video feed is for barcode detection only, not photo quality.
    //
    // CRITICAL: unmount the scanner via onClose() BEFORE opening the file picker.
    // Without this, the BarcodeScannerView stays mounted in the DOM with a dead
    // camera (cleanup ran, but the parent's showBarcodeScanner is still true)
    // while iOS opens the file picker on top. After Use Photo the file fires
    // onPhoto and the parent unmounts us — fine. But if iOS fires onchange with
    // no file (cancel / quirk), onPhoto never fires, the scanner stays in the
    // DOM with a dead camera, and the user is stranded staring at a frozen
    // "Starting camera..." view with only the close button as recovery. Closing
    // the scanner first means cancel just lands the user back on home.
    await cleanup();
    onClose();
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*"; input.capture = "environment";
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (file) onPhoto(file);
    };
    input.click();
  };

  // Corner bracket helper
  const Bracket = ({ top, left, right, bottom }) => (
    <div style={{
      position:"absolute",
      ...(top    != null ? { top }    : {}),
      ...(left   != null ? { left }   : {}),
      ...(right  != null ? { right }  : {}),
      ...(bottom != null ? { bottom } : {}),
      width:28, height:28,
      borderTop:    top    != null ? "3px solid #4ade80" : "none",
      borderBottom: bottom != null ? "3px solid #4ade80" : "none",
      borderLeft:   left   != null ? "3px solid #4ade80" : "none",
      borderRight:  right  != null ? "3px solid #4ade80" : "none",
      borderRadius: top != null && left != null ? "4px 0 0 0"
                  : top != null && right != null ? "0 4px 0 0"
                  : bottom != null && left != null ? "0 0 0 4px" : "0 0 4px 0",
    }}/>
  );

  return (
    <div style={{
      position:"fixed",inset:0,zIndex:9999,display:"flex",flexDirection:"column",
      // On iOS native, the ML Kit camera renders in a native layer behind the
      // webview — the webview must be transparent for the camera to show through.
      // On web, solid black is the correct base for the <video> feed.
      background: IS_NATIVE ? "transparent" : "#000",
    }}>
      <style>{`
        @keyframes scanLine {
          0%   { top:8px;  opacity:0 }
          8%   { opacity:1 }
          92%  { opacity:1 }
          100% { top:calc(100% - 10px); opacity:0 }
        }
        @keyframes barcodeFlash { 0%,100%{opacity:0} 50%{opacity:1} }
      `}</style>

      {/* Live camera feed — rendered on every platform since we no longer use
          a native camera layer. The video element sits under the dark overlay
          + scanning frame. */}
      <video ref={videoRef} playsInline muted autoPlay
        style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>
      <canvas ref={canvasRef} style={{display:"none"}}/>

      {/* Green flash on barcode detect */}
      {flash && (
        <div style={{position:"absolute",inset:0,zIndex:10,background:"rgba(74,222,128,0.3)",
          animation:"barcodeFlash 0.35s ease",pointerEvents:"none"}}/>
      )}

      {/* Dark overlay + scanning frame */}
      <div style={{position:"absolute",inset:0,zIndex:5,
        display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>

        {/* Frame — box-shadow creates the dark surround / cutout effect */}
        <div style={{position:"relative",width:270,height:270,
          boxShadow:"0 0 0 9999px rgba(0,0,0,0.68)",borderRadius:20}}>
          <Bracket top={-3}   left={-3}  />
          <Bracket top={-3}   right={-3} />
          <Bracket bottom={-3} left={-3} />
          <Bracket bottom={-3} right={-3}/>

          {/* Animated scan line */}
          {status === "scanning" && (
            <div style={{position:"absolute",left:10,right:10,height:2,
              background:"linear-gradient(90deg,transparent,#4ade80,transparent)",
              borderRadius:2,animation:"scanLine 2.2s ease-in-out infinite"}}/>
          )}
        </div>

        {/* Status message */}
        <div style={{marginTop:32,textAlign:"center",padding:"0 40px"}}>
          <div style={{color:"#fff",fontSize:15,fontWeight:600,letterSpacing:"-0.2px",marginBottom:6}}>
            {status === "starting" ? "Starting camera…"
           : status === "error"   ? scanMsg
           : "Point at a barcode to scan instantly"}
          </div>
          {status === "scanning" && (
            <div style={{color:"rgba(255,255,255,0.45)",fontSize:13}}>
              or tap below to photograph the label
            </div>
          )}
        </div>
      </div>

      {/* Top bar — logo + close */}
      <div style={{position:"absolute",top:0,left:0,right:0,zIndex:20,
        padding:`${SAFE_TOP+16}px 20px 16px`,
        display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center"}}>
          <img src="/partiqule-wordmark-light.svg" alt="Partiqule" style={{height:26, width:"auto", objectFit:"contain", display:"block"}}/>
        </div>
        <button onClick={() => { cleanup(); onClose(); }}
          style={{width:38,height:38,borderRadius:"50%",
            background:"rgba(255,255,255,0.15)",
            border:"1.5px solid rgba(255,255,255,0.2)",
            backdropFilter:"blur(8px)",cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center"}}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Bottom bar — two clear options from the start */}
      <div style={{position:"absolute",bottom:0,left:0,right:0,zIndex:20,
        padding:"20px 32px 48px",
        display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
        {status === "scanning" && (
          <div style={{display:"flex",gap:14,width:"100%",maxWidth:320}}>
            <div style={{flex:1,background:"rgba(34,197,94,0.2)",border:"2px solid rgba(34,197,94,0.6)",borderRadius:18,padding:"16px 12px",display:"flex",flexDirection:"column",alignItems:"center",gap:8,cursor:"default"}}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2">
                <rect x="2" y="4" width="3" height="16"/><rect x="7" y="4" width="1.5" height="16"/>
                <rect x="10.5" y="4" width="3" height="16"/><rect x="16" y="4" width="1.5" height="16"/>
                <rect x="19" y="4" width="3" height="16"/>
              </svg>
              <span style={{fontFamily:"'DM Sans', system-ui, sans-serif",fontSize:13,fontWeight:800,color:"#4ade80",letterSpacing:"0.04em"}}>Barcode</span>
              <span style={{fontSize:10,color:"rgba(74,222,128,0.6)",textAlign:"center",lineHeight:1.3}}>Auto-scanning</span>
            </div>
            <button onClick={takePhoto}
              style={{flex:1,background:"rgba(255,255,255,0.1)",border:"2px solid rgba(255,255,255,0.25)",borderRadius:18,padding:"16px 12px",display:"flex",flexDirection:"column",alignItems:"center",gap:8,cursor:"pointer",transition:"all 0.15s"}}
              onMouseDown={e=>{e.currentTarget.style.background="rgba(255,255,255,0.2)";}}
              onMouseUp={e=>{e.currentTarget.style.background="rgba(255,255,255,0.1)";}}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              <span style={{fontFamily:"'DM Sans', system-ui, sans-serif",fontSize:13,fontWeight:800,color:"white",letterSpacing:"0.04em"}}>Photo</span>
              <span style={{fontSize:10,color:"rgba(255,255,255,0.5)",textAlign:"center",lineHeight:1.3}}>Scan the label</span>
            </button>
          </div>
        )}
        {hint && (
          <div style={{color:"rgba(255,255,255,0.5)",fontSize:12,textAlign:"center"}}>
            Barcode not scanning? Tap Photo to capture the label
          </div>
        )}
        {status !== "scanning" && (
          <div style={{color:"rgba(255,255,255,0.35)",fontSize:11,textAlign:"center",letterSpacing:"0.02em"}}>
            {status === "starting" ? "OPENING CAMERA…" : "CAMERA UNAVAILABLE"}
          </div>
        )}
      </div>
    </div>
  );
};

// Branded loading screen shown between barcode detection and result display.
// Minimum 2000ms display time. Timeout at 60000ms surfaces the error phase.
// Revised design: typewriter messages + moss rule + N progress dots (one per TYPEWRITER_STEPS entry), no circular animations.
// Product prop (optional): { brand, name } — shown when barcode lookup has returned partial
// identity before scoring completes. Left null today; Pass 0 streaming can wire it later.
const TYPEWRITER_STEPS = [
  "Reading the label...",
  "Checking what's inside...",
  "Looking up what we know...",
  "Searching the web...",
  "Scoring against the rest...",
];
const CHAR_MS = 40;
const HOLD_MS = 800;
const CLEAR_MS = 220;

const BarcodeLoadingView = ({ phase, onRetry, onPhoto, product }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [filled, setFilled] = useState(Array(TYPEWRITER_STEPS.length).fill(false));
  const [ruleFrac, setRuleFrac] = useState(0);

  useEffect(() => {
    if (phase !== "loading") {
      setStepIndex(0); setTyped(""); setFilled(Array(TYPEWRITER_STEPS.length).fill(false)); setRuleFrac(0);
      return;
    }
    let cancelled = false;
    let timers = [];
    const schedule = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };

    const typeStep = (idx) => {
      if (cancelled) return;
      const msg = TYPEWRITER_STEPS[idx];
      setTyped("");
      setRuleFrac(0);
      let i = 0;
      const tick = () => {
        if (cancelled) return;
        i += 1;
        setTyped(msg.slice(0, i));
        setRuleFrac(i / msg.length);
        if (i < msg.length) schedule(tick, CHAR_MS);
        else {
          // Step complete — fill dot, hold, then clear and advance
          setFilled(prev => {
            const next = [...prev];
            next[idx] = true;
            // When the last dot fills we keep it shown for one full hold then
            // reset on the next cycle (see nextIdx === 0 branch below).
            return next;
          });
          schedule(() => {
            if (cancelled) return;
            setTyped("");
            schedule(() => {
              if (cancelled) return;
              const nextIdx = (idx + 1) % TYPEWRITER_STEPS.length;
              // If we just completed the last step, reset dots for the new cycle.
              if (nextIdx === 0) setFilled(Array(TYPEWRITER_STEPS.length).fill(false));
              setStepIndex(nextIdx);
              typeStep(nextIdx);
            }, CLEAR_MS);
          }, HOLD_MS);
        }
      };
      schedule(tick, CHAR_MS);
    };
    typeStep(0);
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [phase]);

  const brand = product?.brand ? String(product.brand).toUpperCase() : null;
  const productName = product?.name || null;

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:9998,
      background:"var(--cream)",
      display:"flex", flexDirection:"column",
      padding:"0",
      animation:"barcodeLoadingFade 0.25s ease forwards",
      fontFamily:"'DM Sans', system-ui, sans-serif",
    }}>
      <style>{`
        @keyframes barcodeLoadingFade { from{opacity:0} to{opacity:1} }
        @keyframes typewriterCaret { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>

      {/* Top bar — wordmark left, profile/shelf right */}
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding: `${(SAFE_TOP || 0) + 18}px 24px 12px`,
        borderBottom: "1px solid var(--rule)",
        margin: "0 0",
      }}>
        <img src="/partiqule-wordmark.svg" alt="Partiqule" style={{height:40, width:"auto", display:"block"}}/>
        <div style={{
          fontFamily:"'DM Sans', system-ui, sans-serif",
          fontSize:11, letterSpacing:"0.02em", color:"var(--ink-soft)", fontWeight:500,
        }}>
          JUST SCANNED
        </div>
      </div>

      {/* Product identity or placeholder */}
      <div style={{padding:"32px 24px 10px"}}>
        <div style={{
          fontFamily:"'DM Sans', system-ui, sans-serif",
          fontSize:10, letterSpacing:"0.22em", color:"var(--ink-faint)",
          textTransform:"uppercase", marginBottom:10, fontWeight:500,
        }}>
          {phase === "loading" ? "Just scanned · moment ago" : "Tried · moment ago"}
        </div>
        {brand && (
          <div style={{
            fontFamily:"'DM Sans', system-ui, sans-serif",
            fontSize:11, letterSpacing:"0.22em", color:"var(--ink)",
            textTransform:"uppercase", fontWeight:500, marginBottom:4,
          }}>{brand}</div>
        )}
        <div style={{
          fontFamily:"'Lora', Georgia, serif",
          fontSize:30, lineHeight:1.06, color:"var(--ink)",
          letterSpacing:"-0.01em", fontWeight:400,
          opacity: productName ? 1 : 0.5,
        }}>
          {productName || "Reading the label..."}
        </div>
      </div>

      {/* Center content: typewriter + rule + dots */}
      <div style={{
        flex:1, display:"flex", flexDirection:"column",
        alignItems:"center", justifyContent:"center",
        padding:"24px", gap:24,
      }}>
        {phase === "loading" ? (
          <>
            <div style={{
              fontFamily:"'Lora', Georgia, serif",
              fontSize:20, lineHeight:1.3, color:"var(--moss)",
              fontWeight:400, textAlign:"center",
              minHeight:28, letterSpacing:"-0.005em",
            }}>
              {typed}
              <span style={{animation:"typewriterCaret 1s step-end infinite", opacity: typed ? 1 : 0.4}}>|</span>
            </div>
            {/* Moss rule that fills left-to-right as each step types */}
            <div style={{width:200, height:1, background:"var(--rule)", position:"relative"}}>
              <div style={{
                position:"absolute", left:0, top:0, bottom:0,
                width: `${Math.round(ruleFrac * 100)}%`,
                background:"var(--moss)",
                transition:"width 40ms linear",
              }}/>
            </div>
            {/* Four moss dots */}
            <div style={{display:"flex", gap:16, alignItems:"center"}}>
              {filled.map((on, i) => (
                <div key={i} style={{
                  width:6, height:6, borderRadius:"50%",
                  background: on ? "var(--moss)" : "var(--ink-faint)",
                  opacity: on ? 1 : 0.35,
                  transition:"background 0.25s, opacity 0.25s",
                }}/>
              ))}
            </div>
          </>
        ) : (
          <div style={{maxWidth:320, textAlign:"center"}}>
            <div style={{
              fontFamily:"'Lora', Georgia, serif",
              fontSize:24, lineHeight:1.15, color:"var(--ink)",
              fontWeight:400, marginBottom:10,
              letterSpacing:"-0.01em",
            }}>
              I don't know this barcode yet.
            </div>
            <div style={{
              fontFamily:"'DM Sans', system-ui, sans-serif",
              fontSize:13, color:"var(--ink-soft)",
              lineHeight:1.55, marginBottom:24,
            }}>
              Snap a photo of the label and I'll read it for you.
            </div>
            <button onClick={onRetry} style={{
              width:"100%", padding:"13px 16px",
              background:"var(--moss)", color:"var(--ivory)",
              border:"none",
              borderRadius:"22px 18px 24px 20px / 20px 24px 18px 22px",
              fontFamily:"'DM Sans', system-ui, sans-serif",
              fontWeight:500, fontSize:14, cursor:"pointer", marginBottom:10,
              letterSpacing:"0.005em",
            }}>
              Try scanning again
            </button>
            <label style={{display:"block", width:"100%", cursor:"pointer"}}>
              <input type="file" accept="image/*" capture="environment" style={{display:"none"}}
                onChange={e=>{const f=e.target.files?.[0]; if(!f) return; e.target.value=""; onPhoto(f);}}/>
              <div style={{
                width:"100%", padding:"12px 16px", background:"transparent",
                color:"var(--ink)", border:"1px solid var(--rule-strong)",
                borderRadius:"22px 18px 24px 20px / 20px 24px 18px 22px",
                fontFamily:"'DM Sans', system-ui, sans-serif",
                fontWeight:500, fontSize:14, textAlign:"center", boxSizing:"border-box",
                letterSpacing:"0.005em",
              }}>
                Take a photo instead
              </div>
            </label>
          </div>
        )}
      </div>

      {/* Bottom friend-voice line */}
      {phase === "loading" && (
        <div style={{
          padding:"20px 24px 36px",
          textAlign:"center",
          fontFamily:"'Lora', Georgia, serif",
          fontSize:15, lineHeight:1.4, color:"var(--ink-soft)",
          fontWeight:400,
        }}>
          hang on, this takes a second
        </div>
      )}
    </div>
  );
};

const ShareCompareCard = ({result, alternative, onClose}) => {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState("idle");
  const productScore = result.overall_score || result.score;
  const altScore = alternative.score || alternative.estimated_score || 3;
  const delta = (productScore - altScore).toFixed(1);
  const productName = result.product_name || "Scanned product";
  const altName = alternative.name || "Alternative";

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = 1080, H = 1080;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = "100%"; canvas.style.height = "auto";
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const sc = (s) => s <= 3 ? "#16a34a" : s <= 5 ? "#d97706" : "#dc2626";

    const renderTopBar = (logo) => {
      ctx.fillStyle = "#052e16"; ctx.fillRect(0, 0, W, 100);
      if (logo && logo.complete && logo.naturalWidth) {
        const targetH = 56;
        const aspect = logo.naturalWidth / logo.naturalHeight;
        ctx.drawImage(logo, 48, (100 - targetH) / 2, targetH * aspect, targetH);
      } else {
        ctx.fillStyle = "#4ade80"; ctx.font = "800 30px 'DM Sans', system-ui, sans-serif";
        ctx.textAlign = "left"; ctx.textBaseline = "middle";
        ctx.fillText("PARTIQULE", 48, 50);
      }
      ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.font = "500 22px 'DM Sans',system-ui,sans-serif";
      ctx.textAlign = "right"; ctx.textBaseline = "middle";
      ctx.fillText("Product Safety Comparison", W - 48, 50);
    };

    // Background
    ctx.fillStyle = "#f0fdf4"; ctx.fillRect(0, 0, W, H);

    // Top bar — text fallback drawn immediately; upgraded to wordmark image on load.
    // Using the cached browser image on repeat opens means the upgrade is synchronous.
    renderTopBar(null);
    const logoImg = new Image();
    logoImg.onload = () => renderTopBar(logoImg);
    logoImg.onerror = () => { /* keep text fallback */ };
    // Dark moss top bar — use the cream-letter variant for contrast.
    logoImg.src = "/partiqule-wordmark-light-1080.png";

    // Two card areas
    const cardY = 160, cardH = 540, gap = 40, cardW = (W - 48 * 2 - gap) / 2;
    const leftX = 48, rightX = 48 + cardW + gap;

    // Helper: draw card
    const drawCard = (x, name, score, isAlt) => {
      const borderColor = isAlt ? "#16a34a" : "#d1d5db";
      ctx.beginPath(); ctx.roundRect(x, cardY, cardW, cardH, 24);
      ctx.fillStyle = "#ffffff"; ctx.fill();
      ctx.strokeStyle = borderColor; ctx.lineWidth = isAlt ? 4 : 2; ctx.stroke();

      // "Better" label for alt
      if (isAlt) {
        const labelW = 130, labelH = 38, labelX = x + cardW / 2 - labelW / 2, labelY = cardY - 19;
        ctx.beginPath(); ctx.roundRect(labelX, labelY, labelW, labelH, 19);
        ctx.fillStyle = "#16a34a"; ctx.fill();
        ctx.fillStyle = "#fff"; ctx.font = "700 20px 'DM Sans', system-ui, sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("Better", labelX + labelW / 2, labelY + labelH / 2);
      }

      // Product name (2 lines max)
      ctx.fillStyle = "#111"; ctx.font = "700 32px 'DM Sans', system-ui, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      const words = name.split(" "); let line = "", lines = [];
      for (const w of words) {
        const test = line ? line + " " + w : w;
        if (ctx.measureText(test).width > cardW - 60 && line) { lines.push(line); line = w; }
        else line = test;
      }
      if (line) lines.push(line);
      lines = lines.slice(0, 2);
      if (lines.length < name.split(" ").length && lines.length === 2) {
        lines[1] = lines[1].slice(0, -1) + "\u2026";
      }
      const nameY = cardY + 80;
      lines.forEach((l, i) => ctx.fillText(l, x + cardW / 2, nameY + i * 42));

      // Score circle
      const circR = 80, circX = x + cardW / 2, circY = cardY + cardH / 2 + 40;
      ctx.beginPath(); ctx.arc(circX, circY, circR, 0, Math.PI * 2);
      ctx.fillStyle = sc(score) + "18"; ctx.fill();
      ctx.strokeStyle = sc(score); ctx.lineWidth = 5; ctx.stroke();
      ctx.fillStyle = sc(score); ctx.font = "900 72px 'DM Sans', system-ui, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(parseFloat(score).toFixed(1), circX, circY);

      // /10 label
      ctx.fillStyle = "#94a3b8"; ctx.font = "600 24px 'DM Sans', system-ui, sans-serif";
      ctx.fillText("/10 score", circX, circY + circR + 40);
    };

    drawCard(leftX, productName, productScore, false);
    drawCard(rightX, altName, altScore, true);

    // Delta line
    const deltaY = cardY + cardH + 70;
    ctx.fillStyle = "#16a34a"; ctx.font = "800 36px 'DM Sans', system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("\u2193 " + delta + " points safer in the same category", W / 2, deltaY);

    // Footer
    ctx.fillStyle = "#94a3b8"; ctx.font = "500 22px 'DM Sans',system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("partiqule.com \u2014 Know what\u2019s in your products", W / 2, H - 48);
  }, [result, alternative]);

  const share = async () => {
    const canvas = canvasRef.current; if (!canvas) return;
    setStatus("copying");
    try {
      const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
      if (navigator.share && navigator.canShare?.({files: [new File([blob], "partiqule-compare.png", {type: "image/png"})]})) {
        await navigator.share({title: `${productName} vs ${altName}`, text: `I swapped ${productName} (${productScore}/10) for ${altName} (${altScore}/10) — ${delta} points safer. partiqule.com`, files: [new File([blob], "partiqule-compare.png", {type: "image/png"})]});
      } else {
        await navigator.clipboard.write([new ClipboardItem({"image/png": blob})]);
      }
      setStatus("copied");
    } catch {
      const url = URL.createObjectURL(await new Promise(r => canvas.toBlob(r, "image/png")));
      const a = document.createElement("a"); a.href = url;
      a.download = "partiqule-compare.png"; a.click(); URL.revokeObjectURL(url);
      setStatus("copied");
    }
    setTimeout(() => setStatus("idle"), 3000);
  };

  return (
    <div style={{position:"fixed", inset:0, zIndex:9999, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", padding:16}} onClick={onClose}>
      <div style={{background:"#fff", borderRadius:20, padding:20, maxWidth:480, width:"100%", maxHeight:"90vh", overflow:"auto"}} onClick={e => e.stopPropagation()}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12}}>
          <span style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:16, fontWeight:700, color:"#111"}}>Compare & Share</span>
          <button onClick={onClose} style={{background:"none", border:"none", fontSize:22, cursor:"pointer", color:"#999", padding:0, lineHeight:1}}>x</button>
        </div>
        <div style={{borderRadius:12, overflow:"hidden", border:"1px solid #e2e8f0"}}>
          <canvas ref={canvasRef} style={{display:"block", width:"100%"}}/>
        </div>
        <div style={{display:"flex", gap:8, marginTop:12}}>
          <button onClick={share} disabled={status === "copying"} style={{
            flex:1, padding:"13px 16px", borderRadius:12,
            background: status === "copied" ? "#16a34a" : "linear-gradient(135deg,#22c55e,#16a34a)",
            border:"none", color:"#fff",
            fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:14, fontWeight:800,
            cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8,
          }}>
            <IconShare size={16} color="#fff"/>
            {status === "copying" ? "Preparing..." : status === "copied" ? "Shared!" : "Share comparison"}
          </button>
        </div>
      </div>
    </div>
  );
};





// ── GLOBE LOADING — cream typewriter for text/image scan flows ─────
// Mirrors BarcodeLoadingView's typewriter: cycles through TYPEWRITER_STEPS
// with a filling moss rule + one progress dot per step. No globes, no particles.
// Renders inside a caller-provided full-screen cream container.
const GlobeLoading = ({ isMobile }) => {
  const [typed, setTyped] = useState("");
  const [filled, setFilled] = useState(Array(TYPEWRITER_STEPS.length).fill(false));
  const [ruleFrac, setRuleFrac] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timers = [];
    const schedule = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
    const typeStep = (idx) => {
      if (cancelled) return;
      const msg = TYPEWRITER_STEPS[idx];
      setTyped("");
      setRuleFrac(0);
      let i = 0;
      const tick = () => {
        if (cancelled) return;
        i += 1;
        setTyped(msg.slice(0, i));
        setRuleFrac(i / msg.length);
        if (i < msg.length) schedule(tick, CHAR_MS);
        else {
          setFilled(prev => {
            const next = [...prev];
            next[idx] = true;
            return next;
          });
          schedule(() => {
            if (cancelled) return;
            setTyped("");
            schedule(() => {
              if (cancelled) return;
              const nextIdx = (idx + 1) % TYPEWRITER_STEPS.length;
              if (nextIdx === 0) setFilled(Array(TYPEWRITER_STEPS.length).fill(false));
              typeStep(nextIdx);
            }, CLEAR_MS);
          }, HOLD_MS);
        }
      };
      schedule(tick, CHAR_MS);
    };
    typeStep(0);
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, []);

  return (
    <div style={{display:"flex", flexDirection:"column", alignItems:"center", gap:24, padding:"24px"}}>
      <style>{`@keyframes globeLoadingCaret { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>

      <img src="/partiqule-wordmark.svg" alt="Partiqule" style={{height:44, width:"auto", display:"block", opacity:0.9, marginBottom:8}}/>

      <div style={{
        fontFamily:"'Lora', Georgia, serif",
        fontSize: isMobile ? 18 : 20,
        lineHeight:1.3, color:"var(--moss)", fontWeight:400,
        textAlign:"center", minHeight:28, letterSpacing:"-0.005em",
      }}>
        {typed}
        <span style={{animation:"globeLoadingCaret 1s step-end infinite", opacity: typed ? 1 : 0.4}}>|</span>
      </div>

      <div style={{width:200, height:1, background:"var(--rule)", position:"relative"}}>
        <div style={{
          position:"absolute", left:0, top:0, bottom:0,
          width: `${Math.round(ruleFrac * 100)}%`,
          background:"var(--moss)",
          transition:"width 40ms linear",
        }}/>
      </div>

      <div style={{display:"flex", gap:16, alignItems:"center"}}>
        {filled.map((on, i) => (
          <div key={i} style={{
            width:6, height:6, borderRadius:"50%",
            background: on ? "var(--moss)" : "var(--ink-faint)",
            opacity: on ? 1 : 0.35,
            transition:"background 0.25s, opacity 0.25s",
          }}/>
        ))}
      </div>

      <div style={{
        marginTop:8,
        fontFamily:"'Lora', Georgia, serif",
        fontSize:15, lineHeight:1.4, color:"var(--ink-soft)",
        fontWeight:400, textAlign:"center",
      }}>
        hang on, this takes a second
      </div>
    </div>
  );
};


const scoreLabel   = (s) => s<=2?"Safe":s<=4?"Good":s<=6?"Caution":s<=8?"Switch":"Avoid";
const getHomeCoverage = (history) => {
  const ROOM_MAP = {
    cleaning: "Kitchen", home: "Home", personal_care: "Bathroom",
    skincare: "Bathroom", food: "Pantry", food_beverage: "Pantry",
    beverage: "Pantry", snack: "Pantry", clothing: "Closet",
    baby: "Nursery", toy: "Nursery",
  };
  const counts = {};
  history.forEach(h => {
    const room = ROOM_MAP[h.category];
    if (!room) return;
    counts[room] = (counts[room] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([room, count]) => ({ room, count }))
    .sort((a, b) => b.count - a.count);
};


// Score colors use the three natural-earth tokens. No intermediate shades —
// the threshold is either green, amber, or red by range.
const scoreColor   = (s) => s<=3?"var(--score-green)":s<=5?"var(--score-amber)":"var(--score-red)";
const scoreBg      = (s) => s<=3?"var(--score-green-soft)":s<=5?"var(--score-amber-soft)":"var(--score-red-soft)";
const scoreCardBg  = scoreBg;

const ScoreBadge = ({ score, size = "md", showLabel = false }) => {
  if (score == null || isNaN(parseFloat(score))) return null;
  const num = parseFloat(score);
  const color = num <= 3 ? "var(--score-green)" : num <= 5 ? "var(--score-amber)" : "var(--score-red)";
  const bg    = num <= 3 ? "var(--score-green-soft)" : num <= 5 ? "var(--score-amber-soft)" : "var(--score-red-soft)";
  const sizes = {
    xs: { font: 13, pad: "1px 7px",  radius: 8,  weight: 500 },
    sm: { font: 15, pad: "2px 10px", radius: 10, weight: 500 },
    md: { font: 24, pad: "4px 14px", radius: 12, weight: 400 },
    lg: { font: 36, pad: "6px 20px", radius: 14, weight: 400 },
  };
  const s = sizes[size] || sizes.md;
  return (
    <span style={{
      fontFamily: "'Lora', Georgia, serif",
      fontSize: s.font,
      fontWeight: s.weight,
      color,
      background: bg,
      padding: s.pad,
      borderRadius: s.radius,
      display: "inline-block",
      lineHeight: 1.2,
      letterSpacing: "-0.01em",
    }}>
      {num.toFixed(1)}{showLabel && <span style={{fontSize: s.font * 0.5, opacity: 0.55, marginLeft: 2, fontFamily: "'DM Sans', system-ui, sans-serif", letterSpacing: "0.02em"}}>/10</span>}
    </span>
  );
};

const categoryMeta = {
  clothing:      {label:"Clothing",      color:"#2d5a27",bg:"#eef2ff"},
  food_beverage: {label:"Food & Drink",  color:"#0891b2",bg:"#ecfeff"},
  personal_care: {label:"Personal Care", color:"#c8781a",bg:"#fdf2f8"},
  kitchen:       {label:"Kitchen",       color:"#d97706",bg:"#fffbeb"},
  baby:          {label:"Baby & Kids",   color:"#c8781a",bg:"#fdf4e7"},
  other:         {label:"General",       color:"#6b7280",bg:"#f9fafb"},
};

// ── URL SLUG HELPERS ──────────────────────────────────────────
function toSlug(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
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
const IconChart      = ({size=26,color="var(--moss)"}) => <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M3 3a1 1 0 0 1 1 1v14h16a1 1 0 0 1 0 2H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm14 2a1 1 0 0 1 1 1v8a1 1 0 0 1-2 0V6a1 1 0 0 1 1-1zm-4 3a1 1 0 0 1 1 1v5a1 1 0 0 1-2 0V9a1 1 0 0 1 1-1zm-4 3a1 1 0 0 1 1 1v2a1 1 0 0 1-2 0v-2a1 1 0 0 1 1-1z"/></svg>;
const IconShield     = ({size=26,color="var(--moss)"}) => <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-1 14l-3-3 1.41-1.41L11 12.17l4.59-4.58L17 9l-6 6z"/></svg>;
const IconWarning    = ({size=20,color="#dc2626"}) => <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M12 2L1 21h22L12 2zm0 3.5L20.5 19h-17L12 5.5zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z"/></svg>;
const IconCheck      = ({size=20,color="var(--moss)"}) => <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>;
const IconArrow      = ({size=14,color="var(--moss)"}) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>;
const IconTag        = ({size=22,color="var(--moss)"}) => <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M21.41 11.58l-9-9A2 2 0 0 0 11 2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 .59 1.42l9 9A2 2 0 0 0 13 22a2 2 0 0 0 1.41-.59l7-7A2 2 0 0 0 22 13a2 2 0 0 0-.59-1.42zM6.5 8C5.67 8 5 7.33 5 6.5S5.67 5 6.5 5 8 5.67 8 6.5 7.33 8 6.5 8z"/></svg>;
const IconHistory    = ({size=18,color="#6b7280"}) => <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M13 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7v3l4-4-4-4v3zm1 10h-2V8h2v4.41l2.29 2.3-1.41 1.41L14 13.83V13z"/></svg>;
const IconInstagram  = ({size=18,color="#fff"}) => <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>;
const IconShare      = ({size=16,color="#6b7280"}) => <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M18 16c-.8 0-1.5.3-2 .8l-7.1-4.1c.1-.2.1-.5.1-.7s0-.5-.1-.7L16 7.2c.5.5 1.2.8 2 .8 1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3c0 .2 0 .5.1.7L8 9.8C7.5 9.3 6.8 9 6 9c-1.7 0-3 1.3-3 3s1.3 3 3 3c.8 0 1.5-.3 2-.8l7.1 4.1c-.1.2-.1.4-.1.7 0 1.6 1.3 2.9 2.9 2.9s2.9-1.3 2.9-2.9S19.6 16 18 16z"/></svg>;

// ── CUSTOM BRAND ICONS ────────────────────────────────────────
// All Ico* icons inherit their stroke/fill color via CSS currentColor.
// Default is var(--moss); any caller can pass color="var(--amber)" etc. to override.
const IcoScore       = ({size=24,color="var(--moss)"}) => <svg width={size} height={size} viewBox="0 0 64 64" fill="none" style={{color}}><polyline points="6,32 16,32 22,14 30,50 38,22 44,40 52,32 58,32" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="30" cy="50" r="4" fill="currentColor"/></svg>;
const IcoSafety      = ({size=24,color="var(--moss)"}) => <svg width={size} height={size} viewBox="0 0 64 64" fill="none" style={{color}}><path d="M32 6L10 16v16c0 13 10 22 22 26 12-4 22-13 22-26V16L32 6z" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/><path d="M22 32l6 6 14-12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const IcoVerified    = ({size=24,color="var(--moss)"}) => <svg width={size} height={size} viewBox="0 0 64 64" fill="none" style={{color}}><rect x="10" y="10" width="44" height="44" rx="6" fill="currentColor" opacity="0.15"/><path d="M20 10h-6a4 4 0 00-4 4v36a4 4 0 004 4h28a4 4 0 004-4V14a4 4 0 00-4-4h-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><path d="M24 10a4 4 0 014-4h8a4 4 0 014 4v2H24v-2z" stroke="currentColor" strokeWidth="2.5"/><path d="M22 32l6 6 14-12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const IcoScan        = ({size=24,color="var(--moss)"}) => <svg width={size} height={size} viewBox="0 0 64 64" fill="none" style={{color}}><path d="M8 22V12a4 4 0 014-4h10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><path d="M56 22V12a4 4 0 00-4-4H42" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><path d="M8 42v10a4 4 0 004 4h10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><path d="M56 42v10a4 4 0 01-4 4H42" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><line x1="8" y1="32" x2="56" y2="32" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><rect x="20" y="20" width="24" height="24" rx="4" fill="currentColor" opacity="0.18"/></svg>;
const IcoSearch      = ({size=24,color="var(--moss)"}) => <svg width={size} height={size} viewBox="0 0 64 64" fill="none" style={{color}}><circle cx="28" cy="28" r="16" fill="currentColor" opacity="0.15"/><circle cx="28" cy="28" r="16" stroke="currentColor" strokeWidth="2.5"/><line x1="40" y1="40" x2="54" y2="54" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>;
const IcoProducts    = ({size=24,color="var(--moss)"}) => <svg width={size} height={size} viewBox="0 0 64 64" fill="none" style={{color}}><path d="M8 26L32 8l24 18v28a4 4 0 01-4 4H12a4 4 0 01-4-4V26z" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/><path d="M24 56V36h16v20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const IcoCategory    = ({size=24,color="var(--moss)"}) => <svg width={size} height={size} viewBox="0 0 64 64" fill="none" style={{color}}><path d="M14 24h28l-4 24H18L14 24z" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/><path d="M42 28h6a6 6 0 010 12h-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><line x1="10" y1="56" x2="50" y2="56" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><path d="M22 18c0-4 4-4 4-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M30 18c0-4 4-4 4-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
const IcoIngredients = ({size=24,color="var(--moss)"}) => <svg width={size} height={size} viewBox="0 0 64 64" fill="none" style={{color}}><rect x="8" y="12" width="48" height="40" rx="6" fill="currentColor" opacity="0.1"/><line x1="22" y1="20" x2="52" y2="20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><line x1="22" y1="32" x2="52" y2="32" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><line x1="22" y1="44" x2="52" y2="44" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><circle cx="12" cy="20" r="3.5" fill="currentColor"/><circle cx="12" cy="32" r="3.5" fill="currentColor"/><circle cx="12" cy="44" r="3.5" fill="currentColor"/></svg>;
const IcoRating      = ({size=24,color="var(--moss)"}) => <svg width={size} height={size} viewBox="0 0 64 64" fill="none" style={{color}}><path d="M32 8l6 12 14 2-10 10 2 14-12-6-12 6 2-14L12 22l14-2z" fill="currentColor" opacity="0.85" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/></svg>;
const IcoSaved       = ({size=24,color="var(--moss)"}) => <svg width={size} height={size} viewBox="0 0 64 64" fill="none" style={{color}}><path d="M32 52S10 40 10 24a12 12 0 0122-6.7A12 12 0 0154 24c0 16-22 28-22 28z" fill="currentColor" opacity="0.8" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/></svg>;
const IcoInfo        = ({size=24,color="var(--moss)"}) => <svg width={size} height={size} viewBox="0 0 64 64" fill="none" style={{color}}><circle cx="32" cy="32" r="24" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="2.5"/><line x1="32" y1="28" x2="32" y2="44" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><circle cx="32" cy="21" r="2.5" fill="currentColor"/></svg>;
const IcoProfile     = ({size=24,color="var(--moss)"}) => <svg width={size} height={size} viewBox="0 0 64 64" fill="none" style={{color}}><circle cx="32" cy="22" r="12" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="2.5"/><path d="M10 56a22 22 0 0144 0" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>;


const IconTrash      = ({size=15,color="#9ca3af"}) => <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M9 3v1H4v2h1v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6h1V4h-5V3H9zm0 5h2v9H9V8zm4 0h2v9h-2V8z"/></svg>;
const IconFire       = ({size=14,color="#ef4444"}) => <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M13.5 0.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/></svg>;
const IconBook       = ({size=20,color="#2d5a27"}) => <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/></svg>;
const IconLink       = ({size=14,color="#2d5a27"}) => <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>;
const IconBundle     = ({size=20,color="#c8781a"}) => <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M20 6h-2.18c.07-.44.18-.88.18-1.36C18 2.05 15.96 0 13.36 0c-1.31 0-2.4.5-3.27 1.33L9 2.5 7.91 1.33C7.04.5 5.95 0 4.64 0 2.04 0 0 2.05 0 4.64c0 .48.11.92.18 1.36H0v13c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6.64-4c.9 0 1.64.74 1.64 1.64 0 .97-.79 1.72-1.64 2.36C12.15 5.36 11.35 4.61 11.35 3.64 11.35 2.74 12.1 2 13.36 2zM4.64 2c1.26 0 2.01.74 2.01 1.64 0 .97-.8 1.72-2.01 2.36C3.43 5.36 2.64 4.61 2.64 3.64 2.64 2.74 3.38 2 4.64 2zM20 19H2v-2h18v2zm0-5H2V8h18v6z"/></svg>;

// ── ANIMATED SCORE ────────────────────────────────────────────
const AnimatedScore = ({target, color}) => {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const t = Number(target);
    if (!t || t <= 0 || isNaN(t)) { setDisplay(0); return; }
    let current = 0;
    let rafId;
    let done = false;
    const step = () => {
      if (done) return;
      current += 0.35;
      if (current >= t) { setDisplay(t); done = true; return; }
      setDisplay(Math.floor(current));
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => { done = true; cancelAnimationFrame(rafId); };
  }, [target]);
  return <tspan fill={color}>{display}</tspan>;
};

// ── SCORE ARC ────────────────────────────────────────────────
const ScoreArc = ({score}) => {
  const [animated, setAnimated] = useState(false);
  useEffect(() => { const t = setTimeout(()=>setAnimated(true), 120); return ()=>clearTimeout(t); }, [score]);
  const color  = scoreColor(score);
  const r      = 70;
  const circ   = 2 * Math.PI * r; // 439.8
  const filled = animated ? circ * (score / 10) : 0;
  const offset = circ - filled;
  const glow   = score <= 2 ? "rgba(34,197,94,0.35)"
               : score <= 4 ? "rgba(101,163,13,0.35)"
               : score <= 6 ? "rgba(202,138,4,0.35)"
               : score <= 8 ? "rgba(234,88,12,0.35)"
               : "rgba(220,38,38,0.35)";
  return (
    <div style={{position:"relative", width:176, height:176, margin:"0 auto"}}>
      <svg width="176" height="176" viewBox="0 0 176 176" style={{transform:"rotate(-90deg)"}}>
        {/* Glow filter */}
        <defs>
          <filter id="score-glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        {/* Track */}
        <circle cx="88" cy="88" r={r} fill="none" stroke="rgba(34,197,94,0.1)" strokeWidth="10"/>
        {/* Fill */}
        <circle cx="88" cy="88" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          filter="url(#score-glow)"
          style={{transition:"stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1), stroke 0.3s"}}/>
      </svg>
      {/* Centered score */}
      <div style={{position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:0}}>
        <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:64, fontWeight:900, lineHeight:1, letterSpacing:"-0.04em", color, textShadow:`0 0 32px ${glow}`}}>
          <AnimatedScore target={score} color={color}/>
        </div>
        <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13, fontWeight:600, color:"#6ee7b7", opacity:0.5, marginTop:2}}>out of 10</div>
      </div>
    </div>
  );
};

// Empty placeholder shown while streaming /analyze hasn't yet emitted a
// scored event. Matches ScoreArc's 176×176 frame so the layout doesn't
// shift when the real score animates in. Caption rotates with stage.
const ScorePlaceholder = ({ stage }) => {
  const caption =
    stage === "identified"   ? "Checking for concerns…" :
    stage === "scored"       ? "Finding alternatives…" :
    stage === "alternatives" ? "Finishing up…" :
                               "Scoring…";
  return (
    <div style={{position:"relative", width:176, height:176, margin:"0 auto"}}>
      <svg width="176" height="176" viewBox="0 0 176 176" style={{transform:"rotate(-90deg)"}}>
        <circle cx="88" cy="88" r="70" fill="none" stroke="var(--rule)" strokeWidth="10"/>
      </svg>
      <div style={{position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:6, padding:"0 16px"}}>
        <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:14, color:"var(--ink-soft)", textAlign:"center", lineHeight:1.3}}>{caption}</div>
        <div style={{display:"flex", gap:6}}>
          {[0,1,2].map(i => (
            <div key={i} style={{width:5, height:5, borderRadius:"50%", background:"var(--moss)", opacity:0.35, animation:`scorePlaceholderDot 1.4s ${i*0.18}s infinite ease-in-out`}}/>
          ))}
        </div>
      </div>
      <style>{`@keyframes scorePlaceholderDot{0%,100%{opacity:0.25}50%{opacity:0.85}}`}</style>
    </div>
  );
};

// ── SCAN VS SAFE SPLIT VIEW ───────────────────────────────────
// ── BUNDLE RECOMMENDATION (replaced with simple CTA) ─────────
const BundleCard = ({category}) => {
  const bundle = BUNDLES[category] || BUNDLES.other;
  const surface = "var(--cream-light)";
  const border  = "var(--rule)";
  const text    = "var(--ink)";
  const muted   = "var(--ink-soft)";
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
    <div style={{background:"#fdf4e7", borderRadius:16, padding:"24px", border:`1.5px solid ${"#ddd6fe"}`}}>
      <div style={{display:"flex", alignItems:"flex-start", gap:12, marginBottom:16}}>
        <div style={{width:40, height:40, borderRadius:10, background:"#c8781a", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0}}>
          <IconBundle size={20} color="#fff"/>
        </div>
        <div>
          <div style={{fontSize:11, color:"#c8781a", textTransform:"uppercase", fontWeight:700, letterSpacing:"0.05em", marginBottom:3}}>Bundle Recommendation</div>
          <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:700, fontSize:17, color:text, lineHeight:1.3}}>{bundle.title}</div>
          <div style={{fontSize:13, color:muted, marginTop:3}}>{bundle.desc}</div>
        </div>
      </div>
      <div style={{display:"flex", flexDirection:"column", gap:6, marginBottom:16}}>
        {bundle.items.map((item,i) => (
          <div key={i} style={{display:"flex", alignItems:"center", gap:8, fontSize:13, color:"#444"}}>
            <div style={{width:18, height:18, borderRadius:"50%", background:"rgba(34,197,94,0.08)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0}}>
              <IconCheck size={11} color="#16a34a"/>
            </div>
            {item}
          </div>
        ))}
      </div>
      <a href={amazonUrl} target="_blank" rel="noopener noreferrer"
        style={{display:"flex", alignItems:"center", justifyContent:"center", gap:6, width:"100%", padding:"12px", borderRadius:10, background:"#c8781a", color:"#fff", fontSize:14, fontWeight:600, textDecoration:"none", boxSizing:"border-box"}}>
        Shop this bundle on Amazon <IconArrow size={14} color="#fff"/>
      </a>
    </div>
  );
};

// ── SOURCE CITATIONS ──────────────────────────────────────────
const SourceCitations = ({category}) => {
  const [open, setOpen] = useState(false);
  const sources = SOURCES[category] || SOURCES.other;
  const surface = "var(--cream-light)";
  const border  = "var(--rule)";
  const text    = "var(--ink)";
  const muted   = "var(--ink-soft)";
  return (
    <div style={{background:surface, borderRadius:16, border:`1.5px solid ${border}`, overflow:"hidden"}}>
      <button onClick={()=>setOpen(o=>!o)} style={{width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"18px 24px", background:"none", border:"none", cursor:"pointer", textAlign:"left"}}>
        <div style={{display:"flex", alignItems:"center", gap:10}}>
          <div style={{width:34, height:34, borderRadius:9, background:"#eef2ff", display:"flex", alignItems:"center", justifyContent:"center"}}>
            <IconBook size={18} color="#2d5a27"/>
          </div>
          <div>
            <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:700, fontSize:15, color:text}}>Research & Sources</div>
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
              <div style={{width:28, height:28, borderRadius:7, background:"#eef2ff", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1}}>
                <IconLink size={13} color="#2d5a27"/>
              </div>
              <div>
                <div style={{fontSize:13, fontWeight:600, color:"#4f46e5", lineHeight:1.4}}>{s.title}</div>
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
const EducationSection = ({isMobile=false}) => {
  const surface = "var(--cream-light)";
  const border  = "var(--rule)";
  const text    = "var(--ink)";
  const muted   = "var(--ink-soft)";
  const bg      = "var(--cream)";

  const sections = [
    {
      tag: "Your Health",
      tagColor: "#16a34a",
      tagBg: "#f0fdf4",
      headline: "What your products are doing to your body",
      subhead: "From microplastics in arterial plaques to artificial dyes being phased out by the FDA, the research on everyday product exposure has reached a turning point.",
      stats: [
        {number:"100%", label:"of human blood samples tested in 2022 contained microplastics", color:"#16a34a", bg:"#f0fdf4"},
        {number:"58%",  label:"of carotid artery plaques studied in 2024 contained polypropylene (PP)", color:"#059669", bg:"#ecfdf5"},
        {number:"2025", label:"FDA banned Red 3 and began phasing out all petroleum-based synthetic food dyes", color:"#047857", bg:"#d1fae5"},
        {number:"UPF",  label:"ultra-processed foods now linked to cardiovascular disease, cognitive decline and stroke — The Lancet 2025", color:"var(--amber)", bg:"var(--cream-light)"},
      ],
      faqs: [
        {q:"What are microplastics and why do they matter?", a:"Microplastics are plastic particles under 5mm, many invisible to the naked eye. A 2024 New England Journal of Medicine study found polypropylene (PP) in 58% of carotid artery plaques. Patients with detectable microplastics had significantly higher rates of heart attack, stroke, and death over the following years."},
        {q:"What are PFAS and where are they found?", a:"PFAS (per- and polyfluoroalkyl substances) are synthetic chemicals used in non-stick coatings, water-resistant clothing, food packaging, and some cleaning products. They are known endocrine disruptors linked to thyroid disruption, reduced fertility, elevated cholesterol, and several cancers. The FDA has flagged them as a priority health concern."},
        {q:"Why are artificial dyes a concern?", a:"The FDA banned Red 3 in 2025 and has begun phasing out all petroleum-derived synthetic dyes including Red 40, Yellow 5, Yellow 6, and Blue 1. Multiple studies have linked these dyes to hyperactivity in children and potential carcinogenicity. They appear in candy, cereals, drinks, and many processed foods. Partiqule flags each dye individually with its severity level and the research behind it."},
        {q:"What are ultra-processed foods and why do they score higher?", a:"Ultra-processed foods (NOVA Group 4) are industrial formulations containing ingredients not found in home kitchens — synthetic dyes, preservatives like BHA and BHT, emulsifiers, and artificial flavors. A 2025 Lancet review linked regular ultra-processed food consumption to cardiovascular disease, cognitive decline, and stroke. Partiqule scores these products higher on Materials and Usage because the chemical load is meaningfully higher than minimally processed or whole foods."},
        {q:"What are pesticide residues and should I be concerned?", a:"The EWG's 2026 Dirty Dozen report — analysing 54,344 USDA produce samples — found pesticide residues on 96% of the 12 most contaminated fruits and vegetables, including PFAS forever chemicals on 63% of samples. Spinach ranked highest for pesticide residues by weight. Partiqule flags conventional Dirty Dozen produce with a pesticide concern and credits organic produce as a positive. Importantly, all produce is healthy — the goal is to reduce exposure where practical, not avoid fruits and vegetables."},
        {q:"How does Partiqule calculate the product health score?", a:"The score combines two independent layers into one number. The first is chemical safety — synthetic pesticides, petroleum dyes, IARC carcinogens, BHA/BHT, PFAS, and similar substances. The second, for food and beverages, is nutritional impact — sugar, sodium, saturated fat, and trans fat are each scored against their daily recommended values, and the higher of the two floors wins. A juice with clean ingredients but 38g of sugar scores 5 because the glycemic impact is real regardless of what is in the ingredient list. Organic butter scores 2 — no pesticides, no synthetic additives. Protein and fiber appear as positive green badges when notably high."},
      ],
    },
    {
      tag: "Your Family and Home",
      tagColor: "#2563eb",
      tagBg: "#eff6ff",
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
      tagBg: "#fffbeb",
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
        {q:"How does Partiqule score planet impact?", a:"Sustainability (15% weight) covers product longevity, replaceability of single-use items, and end-of-life circularity. Together they capture the downstream impact of buying a product."},
      ],
    },
    {
      tag: "How Scores Get More Accurate Over Time",
      tagColor: "#c8781a",
      tagBg: "#fdf4e7",
      headline: "From AI estimate to verified fact",
      subhead: "Every scan makes the system smarter. Here is the honest explanation of how Partiqule works today, and where it is going.",
      stats: [
        {number:"113",  label:"confirmed harmful substances in our registry — each with a hard minimum score it enforces in code", color:"#c8781a", bg:"#fdf4e7"},
        {number:"2-pass", label:"every scan runs through an AI scorer and an independent AI auditor before a result is returned", color:"#6d28d9", bg:"#ede9fe"},
        {number:"Code", label:"substance floors are enforced in code, not just in AI prompts — the AI cannot override them", color:"#5b21b6", bg:"#ddd6fe"},
        {number:"Verified", label:"over time, known products get hard-coded scores the AI cannot deviate from — moving from estimate to fact", color:"#4c1d95", bg:"#c4b5fd"},
      ],
      faqs: [
        {q:"How does Partiqule score a product it has never seen before?", a:"Two AI passes analyse the product name, brand, and any visible ingredient or material information. The first pass produces a score across four dimensions. The second pass acts as an independent auditor, checking the first result for consistency. After both passes, a code-level system applies 113 substance floors — if a confirmed harmful substance is detected, the score cannot go below a minimum threshold regardless of what the AI said."},
        {q:"What is a substance floor and why does it matter?", a:"A substance floor is a hard minimum score enforced in code, not in a prompt. If a product contains Red 40, for example, the materials score cannot go below 7 — period. The AI cannot override it, no matter how it reasons. This is how we prevent the system from being fooled by good marketing or gaps in AI knowledge. We have 113 of these floors covering petroleum dyes, PFAS, aspartame, sucralose, formaldehyde releasers, heavy metals, and more."},
        {q:"Can the AI get a score wrong?", a:"Yes. The AI is an expert estimator, not a database. For products it has never seen before, it reasons from ingredient patterns, brand reputation, and category norms. It will occasionally be wrong. This is why the substance floor system exists — the most dangerous mistakes are caught in code before they reach you. For well-known products, we are building a verified calibration registry that enforces correct scores regardless of what the AI produces."},
        {q:"What is the calibration registry?", a:"The calibration registry is a growing database of verified scores for known products. When a product is in the registry, its score is enforced in code — the AI's estimate becomes irrelevant. Centrum Silver, for example, contains FD&C Blue 1 (a petroleum dye the FDA is phasing out), talc (IARC Group 2A), and titanium dioxide (IARC Group 2B). The registry locks this product to a minimum score of 6 regardless of how the AI interprets it. Over time, the most commonly scanned products all become deterministic. The AI handles new and unknown products. The registry handles everything it has already verified."},
        {q:"How does the registry grow?", a:"Every scan generates data. When the AI scores a known product differently from the registry, that is logged as an override. Patterns in these overrides reveal where the AI is most uncertain — those products become priority candidates for the next wave of verification. Users who flag a result as wrong also feed directly into the review queue. The registry grows through a combination of manual expert review and scan-volume signals."},
        {q:"Will Partiqule ever be fully deterministic?", a:"For commonly scanned products, yes — over time. For the long tail of new products, regional variants, and reformulations, the AI will always play a role. The goal is not to eliminate AI but to confine it to the edge cases where it is genuinely needed. A verified score for Cheerios should never be uncertain. A score for a small-batch artisan granola brand from a local market should be an expert estimate. That is the right division of labour."},
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
              <h2 style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:isMobile?26:34, fontWeight:700, color:text, margin:"0 0 14px", letterSpacing:"-0.5px"}}>{sec.headline}</h2>
              <p style={{fontSize:16, color:muted, maxWidth:600, margin:"0 auto", lineHeight:1.75}}>{sec.subhead}</p>
            </div>

            {/* Stats grid */}
            <div style={{display:"grid", gridTemplateColumns:isMobile?"repeat(2,1fr)":"repeat(4,1fr)", gap:isMobile?10:20, marginBottom:isMobile?32:48}}>
              {sec.stats.map((s,i) => (
                <div key={i} style={{background:s.bg, borderRadius:14, padding:"24px 20px", border:`1.5px solid ${"transparent"}`, textAlign:"center"}}>
                  <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:28, fontWeight:800, color:s.color, marginBottom:8, lineHeight:1.2}}>{s.number}</div>
                  <div style={{fontSize:13, color:s.color, lineHeight:1.5, opacity:0.85}}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* FAQ grid */}
            <div style={{display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:isMobile?10:20}}>
              {sec.faqs.map((faq,i) => (
                <div key={i} style={{background:surface, borderRadius:14, padding:"24px", border:`1.5px solid ${border}`}}>
                  <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:700, fontSize:16, color:text, marginBottom:10}}>{faq.q}</div>
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


// ── PRODUCT INSIGHTS DROPDOWN — all categories ───────────────
const TIER_CONFIG = {
  // Food
  whole_food:          { label:"Whole Food",            color:"#16a34a", bg:"#f0fdf4", border:"#bbf7d0", tier:1, headline:"Unprocessed or minimally processed" },
  minimally_processed: { label:"Minimally Processed",   color:"#0891b2", bg:"#ecfeff", border:"#a5f3fc", tier:2, headline:"Single-ingredient processing" },
  processed:           { label:"Processed",              color:"#d97706", bg:"#fffbeb", border:"#fde68a", tier:3, headline:"Added salt, sugar, oil or preservatives" },
  ultra_processed:     { label:"Ultra-Processed",        color:"#dc2626", bg:"#fef2f2", border:"#fecaca", tier:4, headline:"Industrial formula with synthetic additives" },
  // Personal care
  clean_formula:       { label:"Clean Formula",          color:"#16a34a", bg:"#f0fdf4", border:"#bbf7d0", tier:1, headline:"Plant-based, no flagged synthetics" },
  conventional:        { label:"Conventional",           color:"#0891b2", bg:"#ecfeff", border:"#a5f3fc", tier:2, headline:"Standard commercial formula" },
  synthetic_heavy:     { label:"Synthetic-Heavy",        color:"#d97706", bg:"#fffbeb", border:"#fde68a", tier:3, headline:"Multiple petroleum-based chemicals" },
  high_concern:        { label:"High Concern",           color:"#dc2626", bg:"#fef2f2", border:"#fecaca", tier:4, headline:"Contains banned or flagged substances" },
  // Clothing
  natural_fiber:       { label:"Natural Fiber",          color:"#16a34a", bg:"#f0fdf4", border:"#bbf7d0", tier:1, headline:"Certified organic or pure natural fiber" },
  synthetic:           { label:"Synthetic",              color:"#d97706", bg:"#fffbeb", border:"#fde68a", tier:3, headline:"Petroleum-derived, microfiber shedding" },
  chemical_treated:    { label:"Chemical-Treated",       color:"#dc2626", bg:"#fef2f2", border:"#fecaca", tier:4, headline:"PFAS coating, formaldehyde finish or flame retardants" },
  // Kitchen
  plant_based:         { label:"Plant-Based",            color:"#16a34a", bg:"#f0fdf4", border:"#bbf7d0", tier:1, headline:"Genuinely clean, no synthetic chemicals" },
  industrial_chemical: { label:"Industrial Chemical",    color:"#dc2626", bg:"#fef2f2", border:"#fecaca", tier:4, headline:"Contains PTFE, quats or EPA-flagged ingredients" },
  // Baby
  clean_safe:          { label:"Clean and Safe",         color:"#16a34a", bg:"#f0fdf4", border:"#bbf7d0", tier:1, headline:"Formulated specifically for infant safety" },
  concern_flagged:     { label:"Concern Flagged",        color:"#d97706", bg:"#fffbeb", border:"#fde68a", tier:3, headline:"Ingredients requiring caution for infants" },
  high_risk_infants:   { label:"High Risk for Infants",  color:"#dc2626", bg:"#fef2f2", border:"#fecaca", tier:4, headline:"Contains substances harmful to developing systems" },
  // Supplement
  whole_food_derived:  { label:"Whole Food Derived",     color:"#16a34a", bg:"#f0fdf4", border:"#bbf7d0", tier:1, headline:"Food-sourced, third-party tested, no synthetics" },
  synthetic_formula:   { label:"Synthetic Formula",      color:"#d97706", bg:"#fffbeb", border:"#fde68a", tier:3, headline:"Petroleum-derived vitamins, synthetic fillers" },
  // Home furnishing
  natural_materials:   { label:"Natural Materials",      color:"#16a34a", bg:"#f0fdf4", border:"#bbf7d0", tier:1, headline:"Organic cotton, wool, or natural latex — no synthetics" },
  synthetic_foam:      { label:"Synthetic Foam",         color:"#d97706", bg:"#fffbeb", border:"#fde68a", tier:3, headline:"Polyurethane foam with VOC off-gassing" },
};
const TIER_FALLBACK = { label:"Conventional", color:"#0891b2", bg:"#ecfeff", border:"#a5f3fc", tier:2, headline:"Standard commercial product" };

const SEVERITY_CONFIG = {
  high:   { color:"#dc2626", bg:"#fef2f2", border:"#fecaca" },
  medium: { color:"#d97706", bg:"#fffbeb", border:"#fde68a" },
  low:    { color:"#6b7280", bg:"#f9fafb", border:"#e5e7eb" },
};

const TYPE_LABELS = {
  dye:"Artificial Dye", preservative:"Preservative", sweetener:"Sweetener", additive:"Additive",
  uv_filter:"UV Filter", fragrance:"Fragrance", surfactant:"Surfactant",
  coating:"Coating", fiber:"Fiber", chemical:"Chemical", plasticizer:"Plasticizer",
  flame_retardant:"Flame Retardant", processing:"Processing", pesticide:"Pesticide",
  // legacy food types
  artificial_dye:"Artificial Dye", synthetic_preservative:"Preservative",
};

const CATEGORY_DROPDOWN_LABEL = {
  food_beverage:   "Ingredients and Nutrition",
  personal_care:   "Formula Breakdown",
  clothing:        "Fiber and Chemical Analysis",
  kitchen:         "Formula and Materials Analysis",
  baby:            "Safety Breakdown",
  supplement:      "Supplement Analysis",
  home_furnishing: "Materials and Off-Gas Analysis",
  restaurant:      "Ingredients and Nutrition",
  other:           "Substance Analysis",
};

const ProductInsightsDropdown = ({analysis, category}) => {
  const [open, setOpen] = useState(false);
  if (!analysis) return null;

  // Support both old food_analysis shape and new product_analysis shape
  const tierKey  = analysis.tier_label || analysis.processing_level || "conventional";
  const tierCfg  = TIER_CONFIG[tierKey] || TIER_FALLBACK;
  const tierNum  = analysis.composition_tier || analysis.nova_score || tierCfg.tier;

  // Normalize concern field name (ingredient vs substance) — filter out any with no name
  const concerns = (analysis.concerns || [])
    .map(c => ({ ...c, name: c.substance || c.ingredient || "" }))
    .filter(c => c.name && c.name.trim().length > 0);

  const highs  = concerns.filter(c => c.severity === "high");
  const meds   = concerns.filter(c => c.severity === "medium");
  const lows   = concerns.filter(c => c.severity === "low");
  const hasAny = concerns.length > 0 || analysis.positives?.length > 0;

  const headerBorder = highs.length > 0 ? "#fecaca" : "#e5e7eb";
  const headerColor  = highs.length > 0 ? "#dc2626" : "#555";
  const dropdownLabel = CATEGORY_DROPDOWN_LABEL[category] || CATEGORY_DROPDOWN_LABEL.other;

  return (
    <div style={{marginBottom:10, borderRadius:14, overflow:"hidden", border:`1.5px solid ${headerBorder}`, background:"#f9fafb", textAlign:"left"}}>
      <button onClick={()=>setOpen(o=>!o)} style={{width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 16px", background:"none", border:"none", cursor:"pointer", gap:8}}>
        <div style={{display:"flex", alignItems:"center", gap:8, flexWrap:"wrap"}}>
          <span style={{display:"flex", alignItems:"center", opacity:0.9}}><IcoIngredients size={20}/></span>
          <span style={{fontSize:12, color:headerColor, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em"}}>{dropdownLabel}</span>
          <span style={{fontSize:11, fontWeight:700, padding:"2px 9px", borderRadius:20, background:tierCfg.bg, color:tierCfg.color, border:`1px solid ${tierCfg.border}`}}>
            Tier {tierNum} — {tierCfg.label}
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

          {/* Tier detail card */}
          <div style={{marginTop:12, marginBottom:14, padding:"10px 14px", borderRadius:10, background:tierCfg.bg, border:`1px solid ${tierCfg.border}`}}>
            <div style={{fontSize:13, fontWeight:700, color:tierCfg.color, marginBottom:3}}>
              Tier {tierNum} — {tierCfg.label}
            </div>
            <div style={{fontSize:12, color:tierCfg.color, opacity:0.85}}>
              {analysis.tier_description || tierCfg.headline}
            </div>
          </div>

          {/* Nutrition — food only, compact single row */}
          {analysis.nutrition && (() => {
            const n = analysis.nutrition;
            const verified = analysis.nutrition_verified !== false;
            const nutColor  = "#111";
            const nutMuted  = "#888";
            const items = [
              n.calories   != null && { label:"cal",     val:n.calories,  unit:"" },
              n.protein_g  != null && { label:"protein", val:n.protein_g, unit:"g" },
              n.carbs_g    != null && { label:"carbs",   val:n.carbs_g,   unit:"g" },
              n.sugar_g    != null && { label:"sugar",   val:n.sugar_g,   unit:"g" },
              n.fat_g      != null && { label:"fat",     val:n.fat_g,     unit:"g" },
              n.fiber_g    != null && n.fiber_g > 0 && { label:"fiber",  val:n.fiber_g, unit:"g" },
              n.sodium_mg  != null && { label:"sodium",  val:n.sodium_mg, unit:"mg" },
            ].filter(Boolean);
            if (!items.length) return null;
            return (
              <div style={{marginBottom:14, padding:"8px 12px", borderRadius:8, background:"#f9fafb", border:`1px solid ${"#e5e7eb"}`}}>
                <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6}}>
                  <div style={{fontSize:10, color:nutMuted, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em"}}>
                    Per serving{n.serving_size ? ` (${n.serving_size})` : ""}
                  </div>
                  {!verified && (
                    <div style={{fontSize:10, color:"#f59e0b", fontWeight:600, display:"flex", alignItems:"center", gap:3}}>
                      ⚠ Estimated
                    </div>
                  )}
                </div>
                <div style={{display:"flex", flexWrap:"wrap", gap:"4px 16px"}}>
                  {items.map((item,i) => (
                    <span key={i} style={{fontSize:12, color:nutColor}}>
                      <strong style={{fontFamily:"'DM Sans', system-ui, sans-serif"}}>{item.val}{item.unit}</strong>
                      <span style={{color:nutMuted, marginLeft:2}}>{item.label}</span>
                    </span>
                  ))}
                </div>
                {!verified && (
                  <div style={{fontSize:10, color:nutMuted, marginTop:6, fontStyle:"italic"}}>Values may be approximate — verify on the label or restaurant website</div>
                )}
              </div>
            );
          })()}

          {/* Concerns by severity */}
          {[{items:highs, label:"High Concern"}, {items:meds, label:"Medium Concern"}, {items:lows, label:"Low Concern"}].map(({items, label}) =>
            items.length > 0 && (
              <div key={label} style={{marginBottom:12}}>
                <div style={{fontSize:10, fontWeight:700, color:SEVERITY_CONFIG[items[0].severity].color, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6}}>{label}</div>
                <div style={{display:"flex", flexDirection:"column", gap:6}}>
                  {items.map((c, i) => {
                    const cfg = SEVERITY_CONFIG[c.severity];
                    return (
                      <div key={i} style={{padding:"8px 12px", borderRadius:10, background:cfg.bg, border:`1px solid ${cfg.border}`}}>
                        <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:3, flexWrap:"wrap"}}>
                          <span style={{fontSize:12, fontWeight:700, color:cfg.color}}>{c.name}</span>
                          {c.type && TYPE_LABELS[c.type] && (
                            <span style={{fontSize:10, fontWeight:600, color:cfg.color, opacity:0.75, background:"rgba(0,0,0,0.05)", padding:"1px 6px", borderRadius:8}}>{TYPE_LABELS[c.type]}</span>
                          )}
                        </div>
                        <div style={{fontSize:12, color:"#555", lineHeight:1.5}}>{c.reason}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          )}

          {/* Positives */}
          {analysis.positives?.length > 0 && (
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10, fontWeight:700, color:"#16a34a", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6}}>Positive Attributes</div>
              <div style={{display:"flex", flexDirection:"column", gap:6}}>
                {analysis.positives.map((p, i) => (
                  <div key={i} style={{padding:"8px 12px", borderRadius:10, background:"#f0fdf4", border:"1px solid #bbf7d0", display:"flex", alignItems:"flex-start", gap:8}}>
                    <span style={{color:"#16a34a", fontWeight:700, fontSize:14, flexShrink:0}}>✓</span>
                    <div>
                      <div style={{fontSize:12, fontWeight:700, color:"#16a34a", marginBottom:2}}>{p.attribute}</div>
                      {p.reason && <div style={{fontSize:12, color:"#555", lineHeight:1.5}}>{p.reason}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!hasAny && (
            <div style={{fontSize:13, color:"#555", marginTop:10, fontStyle:"italic"}}>No specific substance concerns identified.</div>
          )}

          {analysis.confidence_note && analysis.confidence !== "high" && (
            <div style={{fontSize:11, color:"#999", marginTop:10, display:"flex", alignItems:"center", gap:4}}>
              <IcoInfo size={12}/> {analysis.confidence_note}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Backward-compat alias
const FoodAnalysisDropdown = ({food}) => (
  <ProductInsightsDropdown analysis={food} category="food_beverage"/>
);

// ── DIMENSION DROPDOWN — reusable for all 4 main dimensions ──
const DimensionDropdown = ({icon, label, score, concerns, children}) => {
  const [open, setOpen] = useState(false);
  const isHigh      = score > 6;
  const color       = isHigh ? "var(--score-red)" : "var(--ink-soft)";
  const bg          = isHigh ? "var(--score-red-soft)" : "var(--cream-light)";
  const borderColor = isHigh ? "var(--score-red)" : "var(--rule)";
  return (
    <div style={{marginBottom:10, borderRadius:14, overflow:"hidden", border:`1.5px solid ${borderColor}`, background:bg, textAlign:"left"}}>
      <button onClick={()=>setOpen(o=>!o)} style={{width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 16px", background:"none", border:"none", cursor:"pointer", gap:8}}>
        <div style={{display:"flex", alignItems:"center", gap:8}}>
          <span style={{display:"flex", alignItems:"center", opacity: isHigh ? 1 : 0.85}}>{icon}</span>
          <span style={{fontSize:12, color, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em"}}>{label}</span>
          <ScoreBadge score={score} size="xs" showLabel />
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
                  <span style={{fontSize:13, color:"#555", lineHeight:1.5, textAlign:"left"}}>{c}</span>
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
// ── LEGACY SHIMS — kept so other code that references these doesn't break ──
const PlasticScoreDropdown = ({result, muted}) => null;
const HealthScoreDropdown  = ({result, muted}) => null;


// ── SCORE EXPLAINER ───────────────────────────────────────────
// Collapsible "How we got this score" panel that shows the triggered
// substance floors, dimension breakdown, and child/pregnancy bumps.
// Builds user trust by making the sophisticated scoring logic visible.
const ScoreExplainer = ({result, text, muted, surface, border, childMode, pregnancyMode}) => {
  const [open, setOpen] = useState(false);
  const score = result.overall_score || result.score;

  // Collect all the triggered reasons from the result
  const substanceFlags = result.flagged_substances || [];
  const childBumps = result.child_bumps || [];
  const pregnancyBumps = result.pregnancy_bumps || [];
  const dims = result.dimensions || {};

  // Nothing to show if we have no explanations
  const hasExplanations =
    substanceFlags.length > 0 ||
    (childMode && childBumps.length > 0) ||
    (pregnancyMode && pregnancyBumps.length > 0) ||
    Object.keys(dims).length > 0;

  if (!hasExplanations) return null;

  return (
    <div style={{background:surface, borderRadius:12, border:`1px solid ${border}`, overflow:"hidden", marginTop:16}}>
      <button onClick={()=>setOpen(o=>!o)} style={{
        width:"100%", padding:"14px 18px", background:"none", border:"none",
        display:"flex", alignItems:"center", justifyContent:"space-between",
        cursor:"pointer", color:text, textAlign:"left",
      }}>
        <div>
          <div style={{fontSize:11, fontWeight:700, color:"#16a34a", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:2}}>Transparency</div>
          <div style={{fontSize:15, fontWeight:700}}>Why is this a {score}/10?</div>
        </div>
        <div style={{fontSize:20, color:muted, transition:"transform 0.2s", transform: open ? "rotate(180deg)" : "none"}}>⌄</div>
      </button>

      {open && (
        <div style={{padding:"4px 18px 18px", borderTop:`1px solid ${border}`}}>

          {/* Dimension breakdown */}
          {Object.keys(dims).length > 0 && (
            <div style={{marginTop:16}}>
              <div style={{fontSize:11, fontWeight:700, color:muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10}}>Dimension breakdown</div>
              <div style={{display:"flex", flexDirection:"column", gap:6}}>
                {[
                  {key:"materials",      label:"Materials",      dim:dims.materials},
                  {key:"usage_exposure", label:"Usage & Exposure", dim:dims.usage_exposure},
                  {key:"packaging",      label:"Packaging",      dim:dims.packaging},
                  {key:"sustainability", label:"Sustainability", dim:dims.sustainability},
                ].filter(x=>x.dim).map(({key,label,dim}) => {
                  const s = dim.score ?? 5;
                  const c = s <= 3 ? "#16a34a" : s <= 5 ? "#d97706" : s <= 7 ? "#ea580c" : "#dc2626";
                  return (
                    <div key={key} style={{display:"flex", alignItems:"center", gap:12, fontSize:13}}>
                      <div style={{flex:"0 0 130px", color:text, fontWeight:500}}>{label}</div>
                      <div style={{flex:1, height:6, background:"#f1f5f9", borderRadius:3, overflow:"hidden"}}>
                        <div style={{width:`${s*10}%`, height:"100%", background:c, borderRadius:3}}/>
                      </div>
                      <div style={{flex:"0 0 44px", textAlign:"right"}}><ScoreBadge score={s} size="xs" showLabel /></div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Substance floors triggered */}
          {substanceFlags.length > 0 && (
            <div style={{marginTop:18}}>
              <div style={{fontSize:11, fontWeight:700, color:muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10}}>Flags that raised this score</div>
              <div style={{display:"flex", flexDirection:"column", gap:6}}>
                {substanceFlags.slice(0,8).map((flag, i) => (
                  <div key={i} style={{padding:"8px 12px", background:"#fff1f2", borderRadius:8, borderLeft:"3px solid #dc2626", fontSize:12, color:"#7f1d1d", lineHeight:1.5}}>
                    {typeof flag === "string" ? flag : (flag.reason || flag.concern || JSON.stringify(flag))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Child score bumps — show when child mode is on */}
          {childMode && childBumps.length > 0 && (
            <div style={{marginTop:18}}>
              <div style={{fontSize:11, fontWeight:700, color:"#9d174d", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10}}>
                Why child score is higher ({result.child_score}/10)
              </div>
              <div style={{display:"flex", flexDirection:"column", gap:6}}>
                {childBumps.slice(0, 6).map((bump, i) => (
                  <div key={i} style={{padding:"8px 12px", background:"#fdf2f8", borderRadius:8, borderLeft:"3px solid #9d174d", fontSize:12, color:"#831843", lineHeight:1.5}}>
                    {bump}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pregnancy score bumps — show when pregnancy mode is on */}
          {pregnancyMode && pregnancyBumps.length > 0 && (
            <div style={{marginTop:18}}>
              <div style={{fontSize:11, fontWeight:700, color:"#c8781a", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10}}>
                Why pregnancy score is higher ({result.pregnancy_score}/10)
              </div>
              <div style={{display:"flex", flexDirection:"column", gap:6}}>
                {pregnancyBumps.slice(0, 6).map((bump, i) => (
                  <div key={i} style={{padding:"8px 12px", background:"#fdf4e7", borderRadius:8, borderLeft:"3px solid #c8781a", fontSize:12, color:"#5b21b6", lineHeight:1.5}}>
                    {bump}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{marginTop:16, paddingTop:12, borderTop:`1px solid ${border}`, fontSize:11, color:muted, textAlign:"center"}}>
            Our scores are code-enforced from 113 substance floors + two independent AI passes.{" "}
            <a href="/methodology" style={{color:"#16a34a", textDecoration:"none"}}>Read our methodology →</a>
          </div>
        </div>
      )}
    </div>
  );
};

// ── FEEDBACK BUTTON ───────────────────────────────────────────
// "Report this score" button on the result page. Collapses into a form
// when clicked, submits to /score-feedback, shows success confirmation.
const FeedbackButton = ({result, text, muted, border, surface, user}) => {
  const [open, setOpen]         = useState(false);
  const [tier, setTier]         = useState("");
  const [note, setNote]         = useState("");
  const [status, setStatus]     = useState(null); // null | "sending" | "sent" | "error"

  const submit = async () => {
    if (!tier) return;
    setStatus("sending");
    try {
      const r = await fetch(`${API_BASE}/score-feedback`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          product_name:   result.product_name,
          category:       result.category,
          returned_score: result.overall_score || result.score,
          suggested_tier: tier,
          note,
          user_email:     user?.email || null,
        }),
      });
      if (!r.ok) throw new Error();
      setStatus("sent");
      try { track("Score Feedback", {product: result.product_name, score: result.overall_score, tier}); } catch {}
      setTimeout(() => { setOpen(false); setStatus(null); setTier(""); setNote(""); }, 2200);
    } catch {
      setStatus("error");
    }
  };

  if (status === "sent") {
    return (
      <div style={{padding:"12px 16px", borderRadius:12, background:"#f0fdf4", border:`1px solid ${"#bbf7d0"}`, textAlign:"center"}}>
        <div style={{fontSize:13, fontWeight:700, color:"#16a34a"}}>Thanks — feedback received</div>
        <div style={{fontSize:12, color:muted, marginTop:2}}>We review every report to improve scores.</div>
      </div>
    );
  }

  if (!open) {
    return (
      <button onClick={()=>setOpen(true)} style={{
        width:"100%", padding:"10px 14px", borderRadius:10,
        border:`1px dashed ${border}`, background:"none", color:muted,
        fontSize:12, fontWeight:600, cursor:"pointer",
        display:"flex", alignItems:"center", justifyContent:"center", gap:6,
      }}>
        <span style={{fontSize:14}}>⚑</span> Think this score is wrong? Let us know
      </button>
    );
  }

  const TIER_OPTIONS = [
    {key:"too_high",        label:"Score is too high"},
    {key:"too_low",         label:"Score is too low"},
    {key:"wrong_category",  label:"Wrong category"},
    {key:"missing_concern", label:"Missing a concern"},
    {key:"other",           label:"Other issue"},
  ];

  return (
    <div style={{background:surface, borderRadius:12, border:`1px solid ${border}`, padding:"16px 18px"}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12}}>
        <div style={{fontSize:13, fontWeight:700, color:text}}>Report this score</div>
        <button onClick={()=>setOpen(false)} style={{background:"none", border:"none", color:muted, fontSize:18, cursor:"pointer", padding:0, lineHeight:1}}>×</button>
      </div>
      <div style={{display:"flex", flexDirection:"column", gap:6, marginBottom:12}}>
        {TIER_OPTIONS.map(opt => (
          <button key={opt.key} onClick={()=>setTier(opt.key)} style={{
            textAlign:"left", padding:"10px 12px", borderRadius:8,
            border:`1.5px solid ${tier === opt.key ? "#16a34a" : border}`,
            background: tier === opt.key ? ("#f0fdf4") : "none",
            color: tier === opt.key ? "#16a34a" : text,
            fontSize:13, fontWeight: tier === opt.key ? 700 : 500, cursor:"pointer",
          }}>{opt.label}</button>
        ))}
      </div>
      <textarea
        value={note} onChange={e=>setNote(e.target.value)}
        placeholder="Optional — what's the issue? (500 chars max)"
        maxLength={500}
        style={{
          width:"100%", minHeight:60, padding:"10px 12px", borderRadius:8,
          border:`1px solid ${border}`, background:"#fff",
          color:text, fontSize:13, fontFamily:"inherit", resize:"vertical",
          boxSizing:"border-box", marginBottom:10, outline:"none",
        }}
      />
      <button onClick={submit} disabled={!tier || status === "sending"} style={{
        width:"100%", padding:"11px", borderRadius:10, border:"none",
        background: tier ? "#16a34a" : ("#e2e8f0"),
        color: tier ? "#fff" : muted,
        fontSize:14, fontWeight:700, cursor: tier ? "pointer" : "default",
        opacity: status === "sending" ? 0.6 : 1,
      }}>
        {status === "sending" ? "Submitting..." : "Submit feedback"}
      </button>
      {status === "error" && <div style={{fontSize:12, color:"#dc2626", marginTop:8, textAlign:"center"}}>Something went wrong. Please try again.</div>}
    </div>
  );
};

// ── PRODUCT CARD ─────────────────────────────────────────────

// ── PRODUCT CARD ─────────────────────────────────────────────
const ProductCard = ({product, altSource="amazon", childMode=false}) => {
  const cat = categoryMeta[product.category] || categoryMeta.other;
  const amazonFallback = `https://www.amazon.com/s?k=${encodeURIComponent((product.brand ? product.brand + " " : "") + product.name)}&tag=partiqule-20`;
  const linkUrl = altSource === "brand" ? getBrandUrl(product.brand, product.name)
    : altSource === "bigbox" ? `https://www.target.com/s?searchTerm=${encodeURIComponent(product.name)}`
    : (product.affiliateUrl || amazonFallback);
  const shopLabel = altSource === "brand" ? "Brand site" : altSource === "bigbox" ? "Target" : "Shop now";
  const hasLink = true;

  const cardStyle = {
    textDecoration:"none", display:"block",
    background:"#fff",
    borderRadius:12, padding:"18px 22px",
    border:`1.5px solid ${"#e8e8e8"}`,
    transition:"border-color 0.2s, box-shadow 0.2s",
    cursor: hasLink ? "pointer" : "default",
    WebkitTapHighlightColor:"transparent",
  };

  const inner = (
    <div style={{display:"flex", gap:14, alignItems:"flex-start"}}>
      {/* Product image */}
      <div style={{width:56, height:56, borderRadius:10, background:"rgba(34,197,94,0.08)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, overflow:"hidden"}}>
        {product.imageUrl
          ? <img src={product.imageUrl} alt={product.name} style={{width:"100%", height:"100%", objectFit:"cover"}}/>
          : <IconTag size={24} color="#16a34a"/>
        }
      </div>
      <div style={{flex:1, minWidth:0}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, marginBottom:3}}>
          <div>
            <div style={{fontSize:11, color:"#888", textTransform:"uppercase", letterSpacing:"0.05em"}}>{product.brand}</div>
            <div style={{fontSize:15, fontWeight:700, color:"#111", fontFamily:"'DM Sans', system-ui, sans-serif", lineHeight:1.3}}>{product.name}</div>
          </div>
          <div style={{display:"flex", flexDirection:"column", alignItems:"flex-end", gap:3, flexShrink:0}}>
            <ScoreBadge score={childMode && product.child_score != null ? product.child_score : product.score} size="xs" showLabel />
            <div style={{background:cat.bg, color:cat.color, fontSize:10, fontWeight:600, padding:"2px 8px", borderRadius:20}}>{cat.label}</div>
          </div>
        </div>
        <div style={{fontSize:13, color:"#666", lineHeight:1.5}}>{product.material}{product.description ? ` — ${product.description}` : ""}</div>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:10}}>
          <div style={{display:"flex", alignItems:"center", gap:6}}>
            <span style={{fontSize:15, fontWeight:700, color:"#16a34a", fontFamily:"'DM Sans', system-ui, sans-serif"}}>{product.price}</span>
            {product.source === "amazon" && <span style={{fontSize:10, color:"#f59e0b", fontWeight:600, background:"#fffbeb", padding:"2px 6px", borderRadius:10}}>Amazon</span>}
          </div>
          {hasLink && <span style={{display:"flex", alignItems:"center", gap:4, fontSize:13, color:"#16a34a", fontWeight:600}}>{shopLabel} <IconArrow size={13} color="#16a34a"/></span>}
        </div>
      </div>
    </div>
  );

  if (!hasLink) {
    return <div style={cardStyle}>{inner}</div>;
  }

  return (
    <a href={linkUrl}
      rel="noopener noreferrer"
      onClick={()=>track("Affiliate Click", {product: product.name, brand: product.brand, category: product.category})}
      style={cardStyle}
      onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--moss)"; e.currentTarget.style.transform="translateY(-1px)";}}
      onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--rule)"; e.currentTarget.style.transform="translateY(0)";}}>
      {inner}
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
  "Plastic pyramid tea bags (like Lipton Silken) release ~11 billion microplastic particles per cup. Paper tea bags are safer — choose loose-leaf or paper bags over plastic mesh.",
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

// ── GUIDES SYSTEM ─────────────────────────────────────────────
const GUIDE_CATEGORIES = ["general","food","beauty","home","baby","pregnancy"];
const CATEGORY_COLORS  = {general:"#2d5a27",food:"#16a34a",beauty:"#c8781a",home:"#0891b2",baby:"#f59e0b",pregnancy:"#2d5a27"};

// Simple markdown-like renderer for guide body HTML
const GuideBody = ({html}) => (
  <div dangerouslySetInnerHTML={{__html: html}}
    style={{lineHeight:1.85, fontSize:17, color:"inherit"}}
    className="guide-body"
  />
);

// Guides index page
const GuidesPage = ({text, muted, surface, border, isMobile, onNavigate}) => {
  const [guides, setGuides]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState("all");

  useEffect(()=>{
    supabase.from("guides").select("id,slug,title,excerpt,category,author,read_time_minutes,created_at,cover_image_url")
      .eq("published",true).order("created_at",{ascending:false})
      .then(({data})=>{ setGuides(data||[]); setLoading(false); });
  },[]);

  const filtered = filter==="all" ? guides : guides.filter(g=>g.category===filter);

  return (
    <div style={{maxWidth:860, margin:"0 auto", padding:isMobile?"24px 16px 80px":"48px 40px 80px"}}>
      <style>{`
        .guide-card:hover{transform:translateY(-2px);box-shadow:0 8px 32px rgba(0,0,0,0.08);}
        .guide-card{transition:transform 0.2s,box-shadow 0.2s;}
        .guide-body h2{font-size:24px;font-weight:700;margin:36px 0 12px;font-family:'Lora',Georgia,serif;}
        .guide-body h3{font-size:20px;font-weight:700;margin:28px 0 10px;font-family:'Lora',Georgia,serif;}
        .guide-body p{margin:0 0 20px;}
        .guide-body ul,.guide-body ol{margin:0 0 20px;padding-left:24px;}
        .guide-body li{margin-bottom:8px;}
        .guide-body strong{font-weight:700;}
        .guide-body em{font-style:italic;}
        .guide-body blockquote{border-left:4px solid #4ade80;margin:24px 0;padding:12px 20px;background:rgba(74,222,128,0.06);border-radius:0 8px 8px 0;}
        .guide-body a{color:#16a34a;text-decoration:underline;}
      `}</style>

      {/* Header */}
      <div style={{marginBottom:40}}>
        <div style={{fontSize:12,fontWeight:700,color:"#16a34a",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>From the team</div>
        <h1 style={{fontFamily:"'Lora', Georgia, serif",fontSize:isMobile?34:46,fontWeight:400,color:text,margin:"0 0 12px",letterSpacing:"-0.015em",lineHeight:1.05}}>Product Safety <span style={{color:"var(--moss)"}}>guides</span></h1>
        <p style={{fontSize:17,color:muted,margin:"0 0 28px",lineHeight:1.6}}>Real research. Real opinions. No brand influence.</p>

        {/* Category filter */}
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {["all",...GUIDE_CATEGORIES].map(cat=>(
            <button key={cat} onClick={()=>setFilter(cat)} style={{
              padding:"6px 16px",borderRadius:20,border:"none",cursor:"pointer",fontSize:13,fontWeight:600,
              background:filter===cat?(CATEGORY_COLORS[cat]||"#052e16"):("#f1f5f9"),
              color:filter===cat?"#fff":("#64748b"),
              transition:"all 0.15s",
            }}>{cat.charAt(0).toUpperCase()+cat.slice(1)}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{textAlign:"center",padding:"60px 0",color:muted}}>Loading guides…</div>
      ) : filtered.length===0 ? (
        <div style={{textAlign:"center",padding:"60px 0",color:muted}}>
          <div style={{fontSize:18,fontWeight:600,marginBottom:8}}>No guides yet</div>
          <div style={{fontSize:14}}>Check back soon — we are working on it.</div>
        </div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:24}}>
          {filtered.map(g=>(
            <div key={g.id} className="guide-card" onClick={()=>onNavigate("guide",g.slug)}
              style={{background:surface,borderRadius:16,border:`1px solid ${border}`,overflow:"hidden",cursor:"pointer",display:"flex",flexDirection:isMobile?"column":"row"}}>
              {/* Cover image or color block */}
              <div style={{
                width:isMobile?"100%":220, height:isMobile?160:160, flexShrink:0,
                background:g.cover_image_url?"none":(CATEGORY_COLORS[g.category]||"#052e16"),
                backgroundImage:g.cover_image_url?`url(${g.cover_image_url})`:"none",
                backgroundSize:"cover",backgroundPosition:"center",
                display:"flex",alignItems:"center",justifyContent:"center",
              }}>
                {!g.cover_image_url && (
                  <span style={{fontSize:48,opacity:0.4}}>
                    {g.category==="food"?"Food":g.category==="beauty"?"Beauty":g.category==="home"?"Home":g.category==="baby"?"Baby":g.category==="pregnancy"?"Pregnancy":"Guide"}
                  </span>
                )}
              </div>
              <div style={{padding:"20px 24px",flex:1,display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                    <span style={{fontSize:11,fontWeight:700,color:CATEGORY_COLORS[g.category]||"#2d5a27",textTransform:"uppercase",letterSpacing:"0.08em"}}>{g.category}</span>
                    <span style={{fontSize:11,color:muted}}>{g.read_time_minutes} min read</span>
                  </div>
                  <div style={{fontFamily:"'DM Sans', system-ui, sans-serif",fontSize:20,fontWeight:700,color:text,marginBottom:8,lineHeight:1.3}}>{g.title}</div>
                  <div style={{fontSize:14,color:muted,lineHeight:1.6}}>{g.excerpt}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:16}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:26,height:26,borderRadius:"50%",overflow:"hidden",flexShrink:0}}>
                      {g.author==="Sara Miller"
                        ? <img src="/sara.jpg" alt="Sara" style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"center top",transform:"scale(1.7)"}}/>
                        : <img src="/paul.jpg" alt="Paul" style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"center top",transform:"scale(1.7)"}}/>
                      }
                    </div>
                    <span style={{fontSize:13,color:muted}}>{g.author}</span>
                  </div>
                  <span style={{fontSize:13,fontWeight:600,color:"#16a34a"}}>Read →</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Individual guide page
const GuideViewPage = ({text, muted, surface, border, isMobile, slug, onNavigate, onScan}) => {
  const [guide, setGuide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(()=>{
    if(!slug) return;
    supabase.from("guides").select("*").eq("slug",slug).eq("published",true).single()
      .then(({data,error})=>{
        if(error||!data){ setNotFound(true); } else { setGuide(data); }
        setLoading(false);
      });
  },[slug]);

  if(loading) return <div style={{textAlign:"center",padding:"80px 0",color:muted}}>Loading…</div>;
  if(notFound) return (
    <div style={{textAlign:"center",padding:"80px 20px"}}>
      <div style={{fontSize:20,fontWeight:700,color:text,marginBottom:8}}>Guide not found</div>
      <button onClick={()=>onNavigate("guides")} style={{color:"#16a34a",background:"none",border:"none",cursor:"pointer",fontSize:15,fontWeight:600}}>← Back to guides</button>
    </div>
  );

  return (
    <div style={{maxWidth:720, margin:"0 auto", padding:isMobile?"24px 16px 80px":"48px 40px 80px"}}>
      {/* Back + Share row */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:32}}>
        <button onClick={()=>onNavigate("guides")} style={{display:"flex",alignItems:"center",gap:6,color:muted,background:"none",border:"none",cursor:"pointer",fontSize:14,fontWeight:600,padding:0}}>
          ← All guides
        </button>
        <button onClick={async()=>{
          const url = `${window.location.origin}/guides/${guide.slug}`;
          const shareData = { title: guide.title, text: guide.excerpt || guide.title, url };

          // Try to fetch cover image and share as file
          if(guide.cover_image_url && navigator.share){
            try{
              const resp = await fetch(guide.cover_image_url);
              const blob = await resp.blob();
              const file = new File([blob], "partiqule-guide.png", {type: blob.type||"image/png"});
              if(navigator.canShare?.({files:[file]})){
                await navigator.share({ title: guide.title, text: guide.excerpt||guide.title, url, files:[file] });
                return;
              }
            } catch{}
          }
          // Fallback — share link only
          if(navigator.share){
            try{ await navigator.share(shareData); return; } catch{}
          }
          // Last resort — copy link
          await navigator.clipboard.writeText(url);
          alert("Link copied!");
        }} style={{display:"flex",alignItems:"center",gap:7,padding:"8px 18px",borderRadius:20,border:`1.5px solid ${border}`,background:"none",color:text,fontSize:13,fontWeight:600,cursor:"pointer"}}>
          <IconShare size={14} color={muted}/> Share
        </button>
      </div>

      {/* Category + meta */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
        <span style={{fontSize:12,fontWeight:700,color:CATEGORY_COLORS[guide.category]||"#2d5a27",textTransform:"uppercase",letterSpacing:"0.08em",background:"#f1f5f9",padding:"4px 12px",borderRadius:20}}>{guide.category}</span>
        <span style={{fontSize:13,color:muted}}>{guide.read_time_minutes} min read</span>
      </div>

      {/* Title */}
      <h1 style={{fontFamily:"'Lora', Georgia, serif",fontSize:isMobile?30:42,fontWeight:400,color:text,margin:"0 0 16px",letterSpacing:"-0.015em",lineHeight:1.05}}>{guide.title}</h1>

      {/* Excerpt */}
      <p style={{fontSize:18,color:muted,margin:"0 0 24px",lineHeight:1.6,fontStyle:"italic"}}>{guide.excerpt}</p>

      {/* Author + date */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:36,paddingBottom:32,borderBottom:`1px solid ${border}`}}>
        <div style={{width:48,height:48,borderRadius:"50%",overflow:"hidden",flexShrink:0,border:`2px solid ${border}`}}>
          {guide.author==="Sara Miller"
            ? <img src="/sara.jpg" alt="Sara Miller" style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"center top",transform:"scale(1.7)"}}/>
            : <img src="/paul.jpg" alt="Paul Miller" style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"center top",transform:"scale(1.7)"}}/>
          }
        </div>
        <div>
          <div style={{fontSize:14,fontWeight:600,color:text}}>{guide.author}</div>
          <div style={{fontSize:12,color:muted}}>Co-founder, Partiqule · {new Date(guide.created_at).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</div>
        </div>
      </div>

      {/* Cover image */}
      {guide.cover_image_url && (
        <img src={guide.cover_image_url} alt={guide.title}
          style={{width:"100%",borderRadius:16,marginBottom:36,maxHeight:420,objectFit:"cover"}}/>
      )}

      {/* Body */}
      <div style={{color:text}}>
        <GuideBody html={guide.body||""}/>
      </div>

      {/* CTA — refreshed to cream system (2026-04-21) */}
      <div style={{
        marginTop:48, padding:"28px 24px",
        background:"var(--cream-light)",
        border:"1px solid var(--rule)",
        borderRadius:"var(--card-shape-1)",
        textAlign:"center",
      }}>
        <div style={{
          fontFamily:"'Lora', Georgia, serif",
          fontSize:22, fontWeight:400, color:"var(--ink)",
          marginBottom:8, letterSpacing:"-0.01em", lineHeight:1.15,
        }}>Scan the products mentioned in this guide</div>
        <div style={{
          fontFamily:"'DM Sans', system-ui, sans-serif",
          fontSize:14, color:"var(--ink-soft)", marginBottom:20,
        }}>Free scans, no account required</div>
        <button onClick={()=>onNavigate("home")} style={{
          background:"var(--moss)", color:"var(--ivory)", border:"none",
          borderRadius:"var(--cta-shape)",
          padding:"13px 32px",
          fontFamily:"'DM Sans', system-ui, sans-serif",
          fontSize:15, fontWeight:500, cursor:"pointer",
          letterSpacing:"0.005em",
        }}>
          Start scanning →
        </button>
      </div>
    </div>
  );
};

// Guide admin — write and publish guides
const GuideAdminPage = ({text, muted, surface, border, isMobile}) => {
  const [guides, setGuides]         = useState([]);
  const [editing, setEditing]       = useState(null); // null = list, {} = new/edit
  const [saving, setSaving]         = useState(false);
  const [msg, setMsg]               = useState("");

  // Form state
  const [title, setTitle]           = useState("");
  const [slug, setSlug]             = useState("");
  const [excerpt, setExcerpt]       = useState("");
  const [body, setBody]             = useState("");
  const [category, setCategory]     = useState("general");
  const [author, setAuthor]         = useState("Paul Miller");
  const [readTime, setReadTime]     = useState(5);
  const [coverUrl, setCoverUrl]     = useState("");
  const [published, setPublished]   = useState(false);

  const load = () => {
    supabase.from("guides").select("*").order("created_at",{ascending:false})
      .then(({data})=>setGuides(data||[]));
  };

  useEffect(()=>{ load(); },[]);

  const autoSlug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");

  const startNew = () => {
    setTitle(""); setSlug(""); setExcerpt(""); setBody(""); setCategory("general");
    setAuthor("Paul Miller"); setReadTime(5); setCoverUrl(""); setPublished(false);
    setEditing({isNew:true});
  };

  const startEdit = (g) => {
    setTitle(g.title||""); setSlug(g.slug||""); setExcerpt(g.excerpt||"");
    setBody(g.body||""); setCategory(g.category||"general"); setAuthor(g.author||"Paul Miller");
    setReadTime(g.read_time_minutes||5); setCoverUrl(g.cover_image_url||""); setPublished(g.published||false);
    setEditing(g);
  };

  const save = async () => {
    if(!title.trim()||!slug.trim()) return setMsg("Title and slug are required.");
    setSaving(true); setMsg("");
    const payload = {
      title:title.trim(), slug:slug.trim(), excerpt:excerpt.trim(),
      body, category, author:author.trim(), read_time_minutes:parseInt(readTime)||5,
      cover_image_url:coverUrl.trim()||null, published, updated_at:new Date().toISOString(),
    };
    let err;
    if(editing?.isNew){
      ({error:err} = await supabase.from("guides").insert([payload]));
    } else {
      ({error:err} = await supabase.from("guides").update(payload).eq("id",editing.id));
    }
    setSaving(false);
    if(err){ setMsg("Error: "+err.message); }
    else { setMsg(published?"Published!":"Saved as draft."); load(); setTimeout(()=>setEditing(null),800); }
  };

  const deleteGuide = async (id) => {
    if(!window.confirm("Delete this guide?")) return;
    await supabase.from("guides").delete().eq("id",id);
    load();
  };

  const inp = (val,set,ph,type="text",rows) => rows ? (
    <textarea value={val} onChange={e=>set(e.target.value)} placeholder={ph} rows={rows}
      style={{width:"100%",padding:"10px 14px",borderRadius:8,border:`1px solid ${border}`,background:"#fff",color:text,fontSize:14,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box"}}/>
  ) : (
    <input type={type} value={val} onChange={e=>set(e.target.value)} placeholder={ph}
      style={{width:"100%",padding:"10px 14px",borderRadius:8,border:`1px solid ${border}`,background:"#fff",color:text,fontSize:14,boxSizing:"border-box"}}/>
  );

  const label = (l) => <div style={{fontSize:12,fontWeight:700,color:muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:6,marginTop:16}}>{l}</div>;

  // Rich text toolbar actions
  const insertTag = (open,close) => {
    const ta = document.getElementById("guide-body-editor");
    if(!ta) return;
    const s=ta.selectionStart, e=ta.selectionEnd, val=ta.value;
    const selected=val.slice(s,e);
    const newVal=val.slice(0,s)+open+selected+close+val.slice(e);
    setBody(newVal);
    setTimeout(()=>{ ta.focus(); ta.setSelectionRange(s+open.length,e+open.length); },0);
  };

  const ToolbarBtn = ({label:l, onClick}) => (
    <button type="button" onClick={onClick}
      style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${border}`,background:"#f1f5f9",color:text,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
      {l}
    </button>
  );

  if(editing){
    return (
      <div style={{maxWidth:760,margin:"0 auto",padding:isMobile?"16px 16px 80px":"32px 40px 80px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:28}}>
          <button onClick={()=>setEditing(null)} style={{color:muted,background:"none",border:"none",cursor:"pointer",fontSize:14,fontWeight:600,padding:0}}>← Back</button>
          <h2 style={{fontFamily:"'DM Sans', system-ui, sans-serif",fontSize:22,fontWeight:700,color:text,margin:0}}>{editing.isNew?"New Guide":"Edit Guide"}</h2>
        </div>

        {label("Title")}
        {inp(title,(v)=>{ setTitle(v); if(editing.isNew) setSlug(autoSlug(v)); },"e.g. The safest cookware we tested")}

        {label("Slug (URL)")}
        {inp(slug,setSlug,"e.g. safest-cookware-tested")}

        {label("Author")}
        <div style={{display:"flex",gap:8}}>
          {["Paul Miller","Sara Miller"].map(a=>(
            <button key={a} type="button" onClick={()=>setAuthor(a)}
              style={{padding:"8px 16px",borderRadius:8,border:`1.5px solid ${author===a?"#16a34a":border}`,background:author===a?"#f0fdf4":"none",color:author===a?"#16a34a":muted,fontSize:14,fontWeight:600,cursor:"pointer"}}>
              {a}
            </button>
          ))}
        </div>

        {label("Category")}
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {GUIDE_CATEGORIES.map(c=>(
            <button key={c} type="button" onClick={()=>setCategory(c)}
              style={{padding:"6px 14px",borderRadius:20,border:"none",cursor:"pointer",fontSize:13,fontWeight:600,
                background:category===c?(CATEGORY_COLORS[c]||"#052e16"):("#f1f5f9"),
                color:category===c?"#fff":("#64748b")}}>
              {c.charAt(0).toUpperCase()+c.slice(1)}
            </button>
          ))}
        </div>

        {label("Excerpt (shown in guide list)")}
        {inp(excerpt,setExcerpt,"A one or two sentence summary…","text",2)}

        {label("Body (HTML)")}
        {/* Toolbar */}
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
          <ToolbarBtn label="B" onClick={()=>insertTag("<strong>","</strong>")}/>
          <ToolbarBtn label="I" onClick={()=>insertTag("<em>","</em>")}/>
          <ToolbarBtn label="H2" onClick={()=>insertTag("<h2>","</h2>")}/>
          <ToolbarBtn label="H3" onClick={()=>insertTag("<h3>","</h3>")}/>
          <ToolbarBtn label="Link" onClick={()=>insertTag('<a href="">',"</a>")}/>
          <ToolbarBtn label="Quote" onClick={()=>insertTag("<blockquote>","</blockquote>")}/>
          <ToolbarBtn label="UL" onClick={()=>insertTag("<ul>\n  <li>","</li>\n</ul>")}/>
          <ToolbarBtn label="P" onClick={()=>insertTag("<p>","</p>")}/>
        </div>
        <textarea id="guide-body-editor" value={body} onChange={e=>setBody(e.target.value)}
          placeholder="Write your guide here using HTML tags, or use the toolbar buttons above..."
          rows={18}
          style={{width:"100%",padding:"12px 14px",borderRadius:8,border:`1px solid ${border}`,background:"#fff",color:text,fontSize:14,fontFamily:"'DM Sans', system-ui, sans-serif",resize:"vertical",boxSizing:"border-box",lineHeight:1.7}}/>

        {/* Preview */}
        {body && (
          <div style={{marginTop:12,padding:"20px 24px",background:surface,borderRadius:12,border:`1px solid ${border}`,color:text}}>
            <div style={{fontSize:11,fontWeight:700,color:muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12}}>Preview</div>
            <GuideBody html={body}/>
          </div>
        )}

        {label("Cover image URL (optional)")}
        {inp(coverUrl,setCoverUrl,"https://...")}

        {label("Read time (minutes)")}
        <input type="number" value={readTime} onChange={e=>setReadTime(e.target.value)} min={1} max={60}
          style={{width:100,padding:"10px 14px",borderRadius:8,border:`1px solid ${border}`,background:"#fff",color:text,fontSize:14}}/>

        <div style={{display:"flex",alignItems:"center",gap:12,marginTop:24}}>
          <button onClick={()=>setPublished(p=>!p)} style={{
            width:52,height:30,borderRadius:15,border:"none",cursor:"pointer",
            background:published?"#16a34a":"#d1d5db",position:"relative",transition:"background 0.2s",flexShrink:0,
          }}>
            <div style={{position:"absolute",top:3,left:published?24:3,width:24,height:24,borderRadius:"50%",background:"white",transition:"left 0.2s"}}/>
          </button>
          <span style={{fontSize:14,color:text,fontWeight:600}}>{published?"Published — visible on guides page":"Draft — not visible publicly"}</span>
        </div>

        {msg && <div style={{marginTop:12,fontSize:14,color:msg.startsWith("Error")?"#dc2626":"#16a34a",fontWeight:600}}>{msg}</div>}

        <div style={{display:"flex",gap:10,marginTop:20}}>
          <button onClick={save} disabled={saving} style={{flex:1,padding:"13px",borderRadius:10,background:"#052e16",border:"none",color:"#4ade80",fontSize:15,fontWeight:700,cursor:"pointer",opacity:saving?0.7:1}}>
            {saving?"Saving…":published?"Publish guide":"Save draft"}
          </button>
          <button onClick={()=>setEditing(null)} style={{padding:"13px 20px",borderRadius:10,border:`1.5px solid ${border}`,background:"none",color:muted,fontSize:15,cursor:"pointer"}}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Guide list view
  return (
    <div style={{maxWidth:760,margin:"0 auto",padding:isMobile?"16px 16px 80px":"32px 40px 80px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:28}}>
        <h2 style={{fontFamily:"'DM Sans', system-ui, sans-serif",fontSize:22,fontWeight:700,color:text,margin:0}}>Guides</h2>
        <button onClick={startNew} style={{padding:"10px 20px",borderRadius:10,background:"#052e16",border:"none",color:"#4ade80",fontSize:14,fontWeight:700,cursor:"pointer"}}>
          + New guide
        </button>
      </div>
      {guides.length===0 ? (
        <div style={{textAlign:"center",padding:"40px 0",color:muted}}>No guides yet. Write your first one.</div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {guides.map(g=>(
            <div key={g.id} style={{background:surface,borderRadius:12,border:`1px solid ${border}`,padding:"16px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <span style={{fontSize:11,fontWeight:700,color:CATEGORY_COLORS[g.category]||"#2d5a27",textTransform:"uppercase"}}>{g.category}</span>
                  <span style={{fontSize:11,padding:"2px 8px",borderRadius:10,background:g.published?"#f0fdf4":"#f1f5f9",color:g.published?"#16a34a":"#9ca3af",fontWeight:600}}>{g.published?"Live":"Draft"}</span>
                </div>
                <div style={{fontSize:15,fontWeight:600,color:text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{g.title}</div>
                <div style={{fontSize:12,color:muted,marginTop:2}}>By {g.author} · {g.read_time_minutes}min</div>
              </div>
              <div style={{display:"flex",gap:8,flexShrink:0}}>
                <button onClick={()=>startEdit(g)} style={{padding:"7px 14px",borderRadius:8,border:`1px solid ${border}`,background:"none",color:text,fontSize:13,cursor:"pointer"}}>Edit</button>
                <button onClick={()=>deleteGuide(g.id)} style={{padding:"7px 14px",borderRadius:8,border:"1px solid #fee2e2",background:"none",color:"#dc2626",fontSize:13,cursor:"pointer"}}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── ADMIN PAGE ────────────────────────────────────────────────
// KEEP IN SYNC with backend/productFamilies.js CANONICAL_FAMILIES
// (updated 2026-04-19 when list changes)
const CANONICAL_FAMILIES = [
  "foundation","concealer","lipstick","lip_balm","mascara","eyeshadow","blush",
  "nail_polish","nail_polish_remover",
  "skincare_face","skincare_eye","skincare_body","sunscreen",
  "hair_shampoo","hair_conditioner","hair_styling",
  "body_wash","bar_soap","deodorant","fragrance",
  "oral_toothpaste","oral_mouthwash",
  "baby_wipe","baby_lotion","baby_shampoo","baby_diaper_cream",
  "wound_care","shaving_cream","razor",
];
const isOverBroadCard = (c) =>
  !(Array.isArray(c.product_families) && c.product_families.length) &&
  !(Array.isArray(c.specific_products) && c.specific_products.length) &&
  !(Array.isArray(c.ingredient_triggers) && c.ingredient_triggers.length);

const IntelAdminPage = ({text, muted, surface, border}) => {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({headline:"",body:"",label:"EWG Alert",label_color:"#d97706",action_text:"Learn more",action_url:"",action_page:"",ingredient_triggers:"",category_triggers:[],source_name:"",source_url:"",priority:5,active:true});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [feedRunning, setFeedRunning] = useState(false);
  const [feedResult, setFeedResult] = useState(null);
  const [retagId, setRetagId] = useState(null);
  const [retagForm, setRetagForm] = useState({product_families:[], specific_products:"", ingredient_triggers:""});
  const [retagSaving, setRetagSaving] = useState(false);
  const [retagMsg, setRetagMsg] = useState(null);

  const fetchCards = async()=>{setLoading(true);try{const r=await authedFetch(`${API_BASE}/api/intelligence/all`);const d=await r.json();setCards(d.cards||[]);}catch{}setLoading(false);};
  useEffect(()=>{fetchCards();},[]);

  const runFeedNow = async()=>{setFeedRunning(true);setFeedResult(null);try{const r=await authedFetch(`${API_BASE}/api/intelligence/run`,{method:"POST",headers:{"Content-Type":"application/json"}});setFeedResult(await r.json());}catch(e){setFeedResult({error:e.message});}setFeedRunning(false);fetchCards();};

  const draftCards = cards.filter(c=>!c.active);
  const liveCards = cards.filter(c=>c.active);

  const save = async()=>{
    if(!form.headline.trim()||!form.body.trim()){setMsg("Headline and body are required");return;}
    setSaving(true);setMsg(null);
    const payload={...form,ingredient_triggers:form.ingredient_triggers?form.ingredient_triggers.split(",").map(s=>s.trim()).filter(Boolean):[],category_triggers:form.category_triggers.length?form.category_triggers:null};
    try{
      const r=await authedFetch(`${API_BASE}/api/intelligence-cards`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      if(!r.ok)throw new Error("Save failed");
      setMsg("Card created");setForm({headline:"",body:"",label:"",label_color:"#d97706",action_text:"Learn more",action_url:"",action_page:"",ingredient_triggers:"",category_triggers:[],source_name:"",source_url:"",priority:5,active:true});
      fetchCards();
    }catch(e){setMsg(e.message);}
    setSaving(false);
  };

  const approveCard = async(id)=>{
    try{const r=await authedFetch(`${API_BASE}/api/intelligence/approve/${id}`,{method:"POST"});if(r.ok)setCards(prev=>prev.map(c=>c.id===id?{...c,active:true}:c));}catch(e){console.error("Approve failed:",e.message);}
  };

  const deactivateCard = async(id)=>{
    try{await authedFetch(`${API_BASE}/api/intelligence-cards/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({active:false})});setCards(prev=>prev.map(c=>c.id===id?{...c,active:false}:c));}catch{}
  };

  const deleteCard = async(id)=>{
    try{const r=await authedFetch(`${API_BASE}/api/intelligence/dismiss/${id}`,{method:"DELETE"});if(r.ok)setCards(prev=>prev.filter(c=>c.id!==id));}catch(e){console.error("Delete failed:",e.message);}
  };

  const openRetag = (c) => {
    setRetagId(c.id);
    setRetagMsg(null);
    setRetagForm({
      product_families: Array.isArray(c.product_families) ? [...c.product_families] : [],
      specific_products: Array.isArray(c.specific_products) ? c.specific_products.join(", ") : "",
      ingredient_triggers: Array.isArray(c.ingredient_triggers) ? c.ingredient_triggers.join(", ") : "",
    });
  };
  const cancelRetag = () => { setRetagId(null); setRetagMsg(null); };
  const toRetagArr = (s) => s.split(",").map(t=>t.trim()).filter(Boolean);
  const saveRetag = async() => {
    if (!retagId) return;
    setRetagSaving(true); setRetagMsg(null);
    const payload = {
      product_families: retagForm.product_families,
      specific_products: toRetagArr(retagForm.specific_products),
      ingredient_triggers: toRetagArr(retagForm.ingredient_triggers),
    };
    try {
      const r = await authedFetch(`${API_BASE}/api/intelligence-cards/${retagId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`Save failed (${r.status})`);
      setCards(prev => prev.map(c => c.id === retagId ? { ...c, ...payload } : c));
      setRetagMsg("Saved");
      setTimeout(() => { setRetagId(null); setRetagMsg(null); }, 600);
    } catch (e) {
      setRetagMsg(e.message);
    }
    setRetagSaving(false);
  };

  const colorPresets = [["#d97706","Amber"],["#dc2626","Red"],["#2563eb","Blue"],["#16a34a","Green"]];
  const catOptions = ["food","food_beverage","beverage","snack","personal_care","skincare","cleaning","home","baby","clothing","supplement"];

  const renderRetagPanel = (c) => {
    if (retagId !== c.id) return null;
    const inputStyle = {width:"100%",padding:"8px 12px",borderRadius:8,border:`1px solid ${border}`,background:"#fff",color:text,fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box"};
    return (
      <div style={{marginTop:10,padding:"14px 16px",borderRadius:10,background:"#f9fafb",border:`1px solid ${border}`}}>
        <div style={{fontSize:12,fontWeight:700,color:text,marginBottom:10}}>Retag targeting fields</div>
        <div style={{marginBottom:10}}>
          <div style={{fontSize:11,color:muted,marginBottom:6}}>product_families ({retagForm.product_families.length} selected)</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {CANONICAL_FAMILIES.map(fam=>{
              const on = retagForm.product_families.includes(fam);
              return <button key={fam} onClick={()=>setRetagForm(f=>({...f,product_families: on ? f.product_families.filter(x=>x!==fam) : [...f.product_families,fam]}))} style={{fontSize:11,padding:"4px 10px",borderRadius:20,border:`1px solid ${on?"#16a34a":border}`,background:on?("#f0fdf4"):"none",color:on?"#16a34a":muted,cursor:"pointer",fontFamily:"inherit"}}>{fam}</button>;
            })}
          </div>
        </div>
        <div style={{marginBottom:10}}>
          <div style={{fontSize:11,color:muted,marginBottom:6}}>specific_products (comma-separated, SKU names only)</div>
          <input value={retagForm.specific_products} onChange={e=>setRetagForm(f=>({...f,specific_products:e.target.value}))} placeholder="e.g. Blaine Labs Wound Care Gel, Tide Pods" style={inputStyle}/>
        </div>
        <div style={{marginBottom:10}}>
          <div style={{fontSize:11,color:muted,marginBottom:6}}>ingredient_triggers (comma-separated compound names)</div>
          <input value={retagForm.ingredient_triggers} onChange={e=>setRetagForm(f=>({...f,ingredient_triggers:e.target.value}))} placeholder="e.g. Red 40, BHT, methylparaben" style={inputStyle}/>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button onClick={saveRetag} disabled={retagSaving} style={{fontSize:12,padding:"6px 14px",borderRadius:8,border:"none",background:"#16a34a",color:"#fff",cursor:retagSaving?"not-allowed":"pointer",fontWeight:700,opacity:retagSaving?0.7:1}}>{retagSaving?"Saving...":"Save"}</button>
          <button onClick={cancelRetag} style={{fontSize:12,padding:"6px 14px",borderRadius:8,border:`1px solid ${border}`,background:"none",color:muted,cursor:"pointer",fontWeight:600}}>Cancel</button>
          {retagMsg && <span style={{fontSize:11,color:retagMsg==="Saved"?"#16a34a":"#dc2626",fontWeight:600}}>{retagMsg}</span>}
        </div>
      </div>
    );
  };

  return (
    <div>
      <h3 style={{fontFamily:"'DM Sans', system-ui, sans-serif",fontSize:18,fontWeight:700,color:text,margin:"0 0 16px"}}>Intelligence Cards</h3>

      {/* Feed runner */}
      <div style={{marginBottom:20}}>
        <button onClick={runFeedNow} disabled={feedRunning} style={{padding:"10px 20px",borderRadius:10,background:feedRunning?muted:"#16a34a",color:"#fff",border:"none",fontWeight:700,fontSize:14,cursor:feedRunning?"not-allowed":"pointer"}}>{feedRunning?"Running...":"Run feed now"}</button>
        {feedResult&&(
          <div style={{marginTop:12,padding:"12px 16px",borderRadius:10,fontSize:12,background:"#f8faff",border:`1px solid ${border}`,color:text}}>
            <div style={{fontWeight:700,marginBottom:6}}>Feed run complete</div>
            <div style={{color:muted}}>Feeds checked: {feedResult.feeds_checked}</div>
            <div style={{color:muted}}>Articles found: {feedResult.articles_found}</div>
            <div style={{color:"#16a34a",fontWeight:600}}>Draft cards saved: {feedResult.cards_saved}</div>
            {feedResult.errors?.length>0&&<div style={{color:"#dc2626",marginTop:4}}>{feedResult.errors.length} feed error{feedResult.errors.length!==1?"s":""}</div>}
          </div>
        )}
      </div>

      {/* Draft cards — awaiting approval */}
      {draftCards.length>0&&(
        <div style={{marginBottom:24}}>
          <div style={{fontSize:12,fontWeight:700,color:"#d97706",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Drafts — awaiting approval ({draftCards.length})</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {draftCards.map(c=>{
              const overBroad = isOverBroadCard(c);
              return (
              <div key={c.id} style={{padding:"12px 16px",borderRadius:12,background:"#fffbeb",border:"1px solid #fde68a"}}>
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                      <span style={{fontSize:10,fontWeight:700,color:c.label_color||"#d97706",textTransform:"uppercase",letterSpacing:"0.08em",background:`${c.label_color||"#d97706"}18`,borderRadius:20,padding:"2px 8px"}}>{c.label}</span>
                      {c.source_name&&<span style={{fontSize:10,color:muted}}>{c.source_name}</span>}
                    </div>
                    <div style={{fontSize:14,fontWeight:700,color:text,marginBottom:2}}>{c.headline}</div>
                    <div style={{fontSize:12,color:muted,marginBottom:4}}>{c.body}</div>
                    {c.product_families?.length>0&&<div style={{fontSize:11,color:muted}}>Families: {c.product_families.join(", ")}</div>}
                    {c.specific_products?.length>0&&<div style={{fontSize:11,color:muted}}>Specific: {c.specific_products.join(", ")}</div>}
                    {c.ingredient_triggers?.length>0&&<div style={{fontSize:11,color:muted}}>Triggers: {c.ingredient_triggers.join(", ")}</div>}
                    {overBroad&&<div style={{fontSize:11,color:"#dc2626",marginTop:4,fontWeight:600}}>No targeting fields. Retag to add product_families, specific_products, or ingredient_triggers before approving.</div>}
                  </div>
                  <div style={{display:"flex",gap:6,flexShrink:0}}>
                    <button onClick={()=>approveCard(c.id)} disabled={overBroad} title={overBroad?"Add targeting fields before approving":""} style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:"none",background:"#16a34a",color:"#fff",cursor:overBroad?"not-allowed":"pointer",fontWeight:600,opacity:overBroad?0.45:1}}>Approve</button>
                    <button onClick={()=>retagId===c.id?cancelRetag():openRetag(c)} style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:`1px solid ${border}`,background:"none",color:text,cursor:"pointer",fontWeight:600}}>{retagId===c.id?"Close":"Retag"}</button>
                    <button onClick={()=>deleteCard(c.id)} style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:"1px solid #fee2e2",background:"none",color:"#dc2626",cursor:"pointer",fontWeight:600}}>Dismiss</button>
                  </div>
                </div>
                {renderRetagPanel(c)}
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Live cards */}
      {loading ? <div style={{color:muted,fontSize:14}}>Loading...</div> : liveCards.length===0 ? <div style={{color:muted,fontSize:14,marginBottom:20}}>No live cards</div> : (
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:24}}>
          {liveCards.map(c=>(
            <div key={c.id} style={{padding:"12px 16px",borderRadius:12,background:surface,border:`1px solid ${border}`}}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <span style={{fontSize:10,fontWeight:700,color:c.label_color||"#d97706",textTransform:"uppercase",letterSpacing:"0.08em",background:`${c.label_color||"#d97706"}18`,borderRadius:20,padding:"2px 8px"}}>{c.label}</span>
                  </div>
                  <div style={{fontSize:14,fontWeight:700,color:text,marginBottom:2}}>{c.headline}</div>
                  <div style={{fontSize:12,color:muted,marginBottom:4}}>{c.body?.slice(0,100)}</div>
                  {c.product_families?.length>0&&<div style={{fontSize:11,color:muted}}>Families: {c.product_families.join(", ")}</div>}
                  {c.specific_products?.length>0&&<div style={{fontSize:11,color:muted}}>Specific: {c.specific_products.join(", ")}</div>}
                  {c.ingredient_triggers?.length>0&&<div style={{fontSize:11,color:muted}}>Triggers: {c.ingredient_triggers.join(", ")}</div>}
                  {c.regulatory_flags?.length>0&&<div style={{fontSize:11,color:"#16a34a",marginTop:2}}>{c.regulatory_flags.length} scoring flag{c.regulatory_flags.length!==1?"s":""}: {c.regulatory_flags.map(f=>f.compound_name).join(", ")}</div>}
                </div>
                <div style={{display:"flex",gap:6,flexShrink:0}}>
                  <button onClick={()=>c.active?deactivateCard(c.id):approveCard(c.id)} style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:`1px solid ${border}`,background:"none",color:c.active?"#16a34a":"#d97706",cursor:"pointer",fontWeight:600}}>{c.active?"Deactivate":"Activate"}</button>
                  <button onClick={()=>retagId===c.id?cancelRetag():openRetag(c)} style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:`1px solid ${border}`,background:"none",color:text,cursor:"pointer",fontWeight:600}}>{retagId===c.id?"Close":"Retag"}</button>
                  <button onClick={()=>deleteCard(c.id)} style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:"1px solid #fee2e2",background:"none",color:"#dc2626",cursor:"pointer",fontWeight:600}}>Delete</button>
                </div>
              </div>
              {renderRetagPanel(c)}
            </div>
          ))}
        </div>
      )}

      {/* Create form */}
      <div style={{background:surface,borderRadius:14,border:`1.5px solid ${border}`,padding:"20px"}}>
        <div style={{fontSize:14,fontWeight:700,color:text,marginBottom:16}}>Create new card</div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <input value={form.headline} onChange={e=>setForm(f=>({...f,headline:e.target.value}))} placeholder="Headline" style={{padding:"10px 14px",borderRadius:10,border:`1px solid ${border}`,background:"#f9fafb",color:text,fontSize:14,outline:"none"}}/>
          <textarea value={form.body} onChange={e=>setForm(f=>({...f,body:e.target.value}))} placeholder="Body text" rows={3} style={{padding:"10px 14px",borderRadius:10,border:`1px solid ${border}`,background:"#f9fafb",color:text,fontSize:14,outline:"none",resize:"vertical"}}/>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <input value={form.label} onChange={e=>setForm(f=>({...f,label:e.target.value}))} placeholder="Label (e.g. EWG Alert)" style={{flex:1,minWidth:150,padding:"10px 14px",borderRadius:10,border:`1px solid ${border}`,background:"#f9fafb",color:text,fontSize:14,outline:"none"}}/>
            <div style={{display:"flex",gap:4,alignItems:"center"}}>
              {colorPresets.map(([c,n])=><button key={c} onClick={()=>setForm(f=>({...f,label_color:c}))} title={n} style={{width:24,height:24,borderRadius:6,background:c,border:form.label_color===c?"2px solid #fff":"2px solid transparent",cursor:"pointer"}}/>)}
            </div>
          </div>
          <input value={form.ingredient_triggers} onChange={e=>setForm(f=>({...f,ingredient_triggers:e.target.value}))} placeholder="Ingredient triggers (comma-separated, e.g. Red 40, BHT)" style={{padding:"10px 14px",borderRadius:10,border:`1px solid ${border}`,background:"#f9fafb",color:text,fontSize:14,outline:"none"}}/>
          <div>
            <div style={{fontSize:12,color:muted,marginBottom:6}}>Category triggers</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {catOptions.map(cat=><button key={cat} onClick={()=>setForm(f=>({...f,category_triggers:f.category_triggers.includes(cat)?f.category_triggers.filter(c=>c!==cat):[...f.category_triggers,cat]}))} style={{fontSize:11,padding:"4px 10px",borderRadius:20,border:`1px solid ${form.category_triggers.includes(cat)?"#16a34a":border}`,background:form.category_triggers.includes(cat)?("#f0fdf4"):"none",color:form.category_triggers.includes(cat)?"#16a34a":muted,cursor:"pointer"}}>{cat}</button>)}
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <input value={form.action_text} onChange={e=>setForm(f=>({...f,action_text:e.target.value}))} placeholder="Action text" style={{flex:1,padding:"10px 14px",borderRadius:10,border:`1px solid ${border}`,background:"#f9fafb",color:text,fontSize:14,outline:"none"}}/>
            <input value={form.action_url} onChange={e=>setForm(f=>({...f,action_url:e.target.value}))} placeholder="Action URL (optional)" style={{flex:1,padding:"10px 14px",borderRadius:10,border:`1px solid ${border}`,background:"#f9fafb",color:text,fontSize:14,outline:"none"}}/>
          </div>
          <div style={{display:"flex",gap:8}}>
            <input value={form.source_name} onChange={e=>setForm(f=>({...f,source_name:e.target.value}))} placeholder="Source name" style={{flex:1,padding:"10px 14px",borderRadius:10,border:`1px solid ${border}`,background:"#f9fafb",color:text,fontSize:14,outline:"none"}}/>
            <input value={form.source_url} onChange={e=>setForm(f=>({...f,source_url:e.target.value}))} placeholder="Source URL" style={{flex:1,padding:"10px 14px",borderRadius:10,border:`1px solid ${border}`,background:"#f9fafb",color:text,fontSize:14,outline:"none"}}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:12,color:muted}}>Priority: {form.priority}</span>
            <input type="range" min={1} max={10} value={form.priority} onChange={e=>setForm(f=>({...f,priority:parseInt(e.target.value)}))} style={{flex:1}}/>
          </div>
          {msg&&<div style={{fontSize:12,color:msg==="Card created"?"#16a34a":"#dc2626",fontWeight:600}}>{msg}</div>}
          <button onClick={save} disabled={saving} style={{padding:"12px",borderRadius:10,background:"#16a34a",color:"#fff",border:"none",fontWeight:700,fontSize:14,cursor:"pointer",opacity:saving?0.7:1}}>{saving?"Saving...":"Create Card"}</button>
        </div>
      </div>
    </div>
  );
};

const AdminPage = ({surface, border, text, muted, history: historyProp = []}) => {
  const [adminTab, setAdminTab] = useState("dashboard"); // dashboard | guides
  const [accessState, setAccessState] = useState("checking"); // checking | allowed | denied
  const [cacheStatus, setCacheStatus]   = useState(null);
  const [clearing, setClearing]         = useState(false);
  const [testQuery, setTestQuery]       = useState("");
  const [testResult, setTestResult]     = useState(null);
  const [testLoading, setTestLoading]   = useState(false);
  const [history, setHistory]           = useState(historyProp);
  const [recentScans, setRecentScans]   = useState([]);
  const [scansLoading, setScansLoading] = useState(false);
  const [scansSearch,  setScansSearch]  = useState("");
  const [scansCat,     setScansCat]     = useState("");
  const [scansOffset,  setScansOffset]  = useState(0);
  const [scansTotal,   setScansTotal]   = useState(0);
  const [feedback, setFeedback]         = useState([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await authedFetch(`${API_BASE}/admin/me`);
      if (!r.ok) { setAccessState("denied"); return; }
      setAccessState("allowed");
      if (!historyProp.length) {
        try {
          const h = JSON.parse(localStorage.getItem("ps_history") || "[]");
          setHistory(h);
        } catch {}
      }
      fetchCacheStatus();
      fetchRecentScans();
      fetchFeedback();
    })();
  }, []);

  const fetchFeedback = async () => {
    setFeedbackLoading(true);
    try {
      const r = await authedFetch(`${API_BASE}/score-feedback`);
      if (r.ok) setFeedback(await r.json());
    } catch {}
    setFeedbackLoading(false);
  };

  const resolveFeedback = async (id, status) => {
    try {
      await authedFetch(`${API_BASE}/score-feedback/resolve`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ id, status }),
      });
      setFeedback(f => f.filter(x => x.id !== id));
    } catch {}
  };

  const fetchCacheStatus = async () => {
    try {
      const r = await authedFetch(`${API_BASE}/cache-status`);
      if (r.ok) setCacheStatus(await r.json());
    } catch { setCacheStatus({error:"unreachable"}) }
  };

  const fetchRecentScans = async (opts = {}) => {
    setScansLoading(true);
    try {
      const cat    = opts.cat    ?? scansCat;
      const search = opts.search ?? scansSearch;
      const offset = opts.offset ?? scansOffset;
      const params = new URLSearchParams({ limit: 50, offset });
      if (cat)    params.set("category", cat);
      if (search) params.set("search", search);
      const r = await authedFetch(`${API_BASE}/recent-scans?${params}`);
      if (r.ok) {
        const data = await r.json();
        setRecentScans(offset > 0 ? prev => [...prev, ...data] : data);
        setScansTotal(data.length);
      }
    } catch {}
    setScansLoading(false);
  };

  const clearCache = async () => {
    setClearing(true);
    try {
      await authedFetch(`${API_BASE}/cache-clear`);
      await fetchCacheStatus();
    } finally { setClearing(false); }
  };

  const runTestScan = async () => {
    if (!testQuery.trim()) return;
    setTestLoading(true); setTestResult(null);
    try {
      const r = await fetch(`${API_BASE}/analyze`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({query: testQuery})
      });
      setTestResult(await r.json());
    } catch (e) { setTestResult({error: e.message}); }
    finally { setTestLoading(false); }
  };

  // Score distribution from local history
  const buckets = [
    {label:"1-2", min:1, max:2, color:"#16a34a"},
    {label:"3-4", min:3, max:4, color:"#65a30d"},
    {label:"5-6", min:5, max:6, color:"#d97706"},
    {label:"7-8", min:7, max:8, color:"#dc2626"},
    {label:"9-10",min:9, max:10, color:"#7f1d1d"},
  ].map(b => ({
    ...b,
    count: history.filter(h => {
      const s = h.score || h.overall_score || 0;
      return s >= b.min && s <= b.max;
    }).length,
    pct: history.length ? Math.round(history.filter(h => {
      const s = h.score || h.overall_score || 0;
      return s >= b.min && s <= b.max;
    }).length / history.length * 100) : 0,
  }));

  const avgScore = history.length
    ? (history.reduce((a,h) => a + (h.score || h.overall_score || 0), 0) / history.length).toFixed(1)
    : "—";

  const catCounts = {};
  history.forEach(h => {
    const c = h.category || "other";
    catCounts[c] = (catCounts[c] || 0) + 1;
  });
  const topCats = Object.entries(catCounts).sort((a,b) => b[1]-a[1]).slice(0,6);

  const card = {background:surface, borderRadius:14, border:`1px solid ${border}`, padding:"20px 24px", marginBottom:16};
  const sectionHead = {fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", color:muted, marginBottom:14};

  if (accessState === "checking") {
    return (
      <div style={{maxWidth:1000, margin:"0 auto", padding:"80px 24px", textAlign:"center", color:muted, fontSize:14}}>
        Checking access…
      </div>
    );
  }
  if (accessState === "denied") {
    return (
      <div style={{maxWidth:600, margin:"0 auto", padding:"80px 24px", textAlign:"center"}}>
        <h1 style={{fontFamily:"Lora, serif", fontWeight:500, fontSize:32, color:text, margin:"0 0 12px"}}>Not found</h1>
        <p style={{color:muted, fontSize:14, margin:0}}>This page doesn't exist or you don't have access.</p>
      </div>
    );
  }

  return (
    <div style={{maxWidth:1000, margin:"0 auto", padding:"32px 24px 80px"}}>
      <div style={{marginBottom:28}}>
        <div style={{fontSize:11, fontWeight:700, color:"#16a34a", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:6}}>Internal</div>
        <h1 style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:700, fontSize:26, color:text, margin:"0 0 16px"}}>Admin</h1>
        {/* Tab bar */}
        <div style={{display:"flex", gap:8, borderBottom:`2px solid ${border}`, paddingBottom:0}}>
          {[["dashboard","Dashboard"],["scores","Score Review"],["guides","Guides"],["intel","Intel Cards"]].map(([t,l])=>(
            <button key={t} onClick={()=>setAdminTab(t)} style={{
              padding:"8px 20px", border:"none", background:"none", cursor:"pointer",
              fontSize:14, fontWeight:600,
              color:adminTab===t?"#16a34a":muted,
              borderBottom:adminTab===t?"2px solid #16a34a":"2px solid transparent",
              marginBottom:-2,
            }}>{l}</button>
          ))}
        </div>
      </div>

      {adminTab==="intel" ? (
        <IntelAdminPage text={text} muted={muted} surface={surface} border={border}/>
      ) : adminTab==="guides" ? (
        <GuideAdminPage text={text} muted={muted} surface={surface} border={border} isMobile={false}/>
      ) : adminTab==="scores" ? (
        <div>
          {/* Search + filter bar */}
          <div style={{display:"flex", gap:10, marginBottom:20, flexWrap:"wrap"}}>
            <input
              value={scansSearch}
              onChange={e=>setScansSearch(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter"){ setScansOffset(0); fetchRecentScans({search:e.target.value, offset:0}); }}}
              placeholder="Search products…"
              style={{flex:1, minWidth:180, padding:"9px 14px", borderRadius:10, border:`1px solid ${border}`, background:surface, color:text, fontSize:14}}
            />
            <select value={scansCat} onChange={e=>{ setScansCat(e.target.value); setScansOffset(0); fetchRecentScans({cat:e.target.value, offset:0}); }}
              style={{padding:"9px 14px", borderRadius:10, border:`1px solid ${border}`, background:surface, color:text, fontSize:14, cursor:"pointer"}}>
              <option value="">All categories</option>
              {["food_beverage","beverage","personal_care","clothing","baby","home","supplement","toy","other"].map(c=>(
                <option key={c} value={c}>{c.replace(/_/g," ")}</option>
              ))}
            </select>
            <button onClick={()=>{ setScansOffset(0); fetchRecentScans({offset:0}); }} style={{padding:"9px 18px", borderRadius:10, background:"#052e16", color:"#4ade80", border:"none", fontWeight:700, fontSize:14, cursor:"pointer"}}>
              {scansLoading ? "Loading…" : "Search"}
            </button>
          </div>

          {/* Score list */}
          {recentScans.length === 0 && !scansLoading && (
            <div style={{textAlign:"center", color:muted, padding:"60px 0", fontSize:14}}>No scans found</div>
          )}
          <div style={{display:"flex", flexDirection:"column", gap:10}}>
            {recentScans.map((s, i) => {
              const sc = s.score || 0;
              const col = sc<=2?"#16a34a":sc<=4?"#65a30d":sc<=6?"#d97706":sc<=8?"#dc2626":"#7f1d1d";
              const bg  = sc<=2?"#f0fdf4":sc<=4?"#f7fee7":sc<=6?"#fefce8":sc<=8?"#fff7ed":"#fff1f2";
              const flags = (s.flagged_substances||[]).slice(0,4);
              return (
                <div key={i} style={{background:surface, border:`1px solid ${border}`, borderRadius:12, padding:"14px 18px", display:"flex", alignItems:"flex-start", gap:14}}>
                  {/* Score badge */}
                  <div style={{minWidth:48, height:48, borderRadius:10, background:bg, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", border:`1px solid ${col}22`}}>
                    <div style={{fontSize:20, fontWeight:800, color:col, lineHeight:1}}>{sc}</div>
                    <div style={{fontSize:9, color:col, fontWeight:600, opacity:0.7}}>/10</div>
                  </div>
                  {/* Info */}
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontWeight:700, fontSize:15, color:text, marginBottom:3, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{s.product_name}</div>
                    <div style={{display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", marginBottom:flags.length?6:0}}>
                      <span style={{fontSize:11, fontWeight:600, color:muted, background:"#f1f5f9", padding:"2px 8px", borderRadius:6}}>{(s.category||"other").replace(/_/g," ")}</span>
                      {s.confidence && <span style={{fontSize:11, color:muted}}>{s.confidence} confidence</span>}
                      {s.child_score && s.child_score !== sc && (
                        <span style={{fontSize:11, fontWeight:600, color:"#60a5fa", display:"flex", alignItems:"center", gap:3}}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a4 4 0 018 0v2"/></svg>Kids: {s.child_score}/10</span>
                      )}
                      {s.scanned_at && (
                        <span style={{fontSize:11, color:muted}}>{new Date(s.scanned_at).toLocaleDateString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</span>
                      )}
                    </div>
                    {flags.length > 0 && (
                      <div style={{display:"flex", gap:5, flexWrap:"wrap"}}>
                        {flags.map((f,j)=>(
                          <span key={j} style={{fontSize:11, fontWeight:600, color:col, background:`${col}15`, padding:"2px 8px", borderRadius:20, border:`1px solid ${col}30`}}>{f}</span>
                        ))}
                      </div>
                    )}
                    {s.summary && (
                      <div style={{fontSize:12, color:muted, marginTop:5, lineHeight:1.5, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical"}}>{s.summary}</div>
                    )}
                  </div>
                  {/* Quick action */}
                  <button
                    onClick={()=>{ window.open(`https://partiqule.com?q=${encodeURIComponent(s.product_name)}`, "_blank"); }}
                    title="Re-scan this product"
                    style={{padding:"6px 10px", borderRadius:8, border:`1px solid ${border}`, background:"none", color:muted, fontSize:12, cursor:"pointer", whiteSpace:"nowrap"}}>
                    Re-scan
                  </button>
                </div>
              );
            })}
          </div>

          {/* Load more */}
          {recentScans.length >= 50 && (
            <button onClick={()=>{ const next = scansOffset+50; setScansOffset(next); fetchRecentScans({offset:next}); }}
              style={{width:"100%", marginTop:16, padding:"12px", borderRadius:10, background:"none", border:`1px solid ${border}`, color:muted, fontSize:14, cursor:"pointer"}}>
              {scansLoading ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      ) : (<>

      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:20}}>
        {[
          {label:"Local scans", value: history.length, color:"#16a34a"},
          {label:"Avg score", value: avgScore, color: parseFloat(avgScore) > 5 ? "#dc2626" : "#16a34a"},
          {label:"Cache entries", value: cacheStatus?.size ?? "—", color:"#d97706"},
        ].map((s,i) => (
          <div key={i} style={{background:surface, borderRadius:12, border:`1px solid ${border}`, padding:"16px 20px"}}>
            <div style={{fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:muted, marginBottom:6}}>{s.label}</div>
            <div style={{fontSize:28, fontWeight:800, color:s.color, fontFamily:"'DM Sans', system-ui, sans-serif"}}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Score distribution */}
      <div style={card}>
        <div style={sectionHead}>Score Distribution — local scan history</div>
        {history.length === 0 ? (
          <div style={{fontSize:13, color:muted}}>No local scan history yet. Run some scans to see distribution.</div>
        ) : (
          <div style={{display:"flex", flexDirection:"column", gap:10}}>
            {buckets.map((b,i) => (
              <div key={i} style={{display:"flex", alignItems:"center", gap:12}}>
                <div style={{fontSize:13, fontWeight:700, color:b.color, width:36, flexShrink:0}}>{b.label}</div>
                <div style={{flex:1, height:28, background:"#f1f5f9", borderRadius:6, overflow:"hidden"}}>
                  <div style={{
                    width: b.pct + "%", height:"100%", background:b.color,
                    borderRadius:6, minWidth: b.count > 0 ? 4 : 0,
                    transition:"width 0.6s ease", opacity:0.85,
                    display:"flex", alignItems:"center", paddingLeft:8,
                  }}>
                    {b.pct > 8 && <span style={{fontSize:11, fontWeight:700, color:"#fff"}}>{b.pct}%</span>}
                  </div>
                </div>
                <div style={{fontSize:12, color:muted, width:60, textAlign:"right", flexShrink:0}}>
                  {b.count} scan{b.count !== 1 ? "s" : ""}
                </div>
              </div>
            ))}
          </div>
        )}

        {history.length > 0 && (
          <div style={{marginTop:16, paddingTop:16, borderTop:`1px solid ${border}`, fontSize:12, color:muted}}>
            <strong style={{color:text}}>Calibration health:</strong>{" "}
            {buckets[0].pct + buckets[1].pct >= 40
              ? "✓ Good spread — clean products scoring in safe tiers"
              : buckets[3].pct + buckets[4].pct >= 40
              ? "⚠ High scores dominating — check for ceiling miscalibration"
              : "Distribution looks reasonable"
            }
          </div>
        )}
      </div>

      {/* Category breakdown */}
      {topCats.length > 0 && (
        <div style={card}>
          <div style={sectionHead}>Top scanned categories</div>
          <div style={{display:"flex", flexWrap:"wrap", gap:8}}>
            {topCats.map(([cat, count]) => (
              <div key={cat} style={{background:"#f1f5f9", borderRadius:8, padding:"6px 14px", fontSize:13}}>
                <span style={{color:text, fontWeight:600}}>{cat}</span>
                <span style={{color:muted, marginLeft:6}}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cache controls */}
      <div style={card}>
        <div style={sectionHead}>Cache</div>
        <div style={{display:"flex", alignItems:"center", gap:16, flexWrap:"wrap"}}>
          <div style={{flex:1}}>
            {cacheStatus?.error ? (
              <div style={{fontSize:13, color:"#dc2626"}}>Backend unreachable — {cacheStatus.error}</div>
            ) : cacheStatus ? (
              <div style={{fontSize:13, color:muted}}>
                {cacheStatus.size ?? 0} cached queries · backend up ·{" "}
                <span style={{color:"#16a34a"}}>Railway connected</span>
              </div>
            ) : (
              <div style={{fontSize:13, color:muted}}>Fetching cache status…</div>
            )}
          </div>
          <div style={{display:"flex", gap:8}}>
            <button onClick={fetchCacheStatus} style={{padding:"8px 16px", borderRadius:8, border:`1px solid ${border}`, background:"none", color:muted, fontSize:13, cursor:"pointer"}}>
              Refresh
            </button>
            <button onClick={clearCache} disabled={clearing} style={{padding:"8px 16px", borderRadius:8, border:"none", background:"#dc2626", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", opacity: clearing ? 0.6 : 1}}>
              {clearing ? "Clearing…" : "Clear cache"}
            </button>
          </div>
        </div>
      </div>

      {/* Test scan */}
      <div style={card}>
        <div style={sectionHead}>Test scan — live scoring</div>
        <div style={{display:"flex", gap:8, marginBottom:testResult ? 16 : 0}}>
          <input
            value={testQuery} onChange={e => setTestQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && runTestScan()}
            placeholder="e.g. Honey Nut Cheerios, Pampers Swaddlers, Tide pods..."
            style={{flex:1, padding:"10px 16px", borderRadius:10, border:`1.5px solid ${border}`, background:"#fff", color:text, fontSize:14, outline:"none"}}
          />
          <button onClick={runTestScan} disabled={testLoading} style={{padding:"10px 24px", borderRadius:10, border:"none", background:"#16a34a", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", opacity: testLoading ? 0.6 : 1}}>
            {testLoading ? "Scanning…" : "Scan"}
          </button>
        </div>

        {testResult && (
          <div style={{background:"#f8fafb", borderRadius:12, padding:"16px 20px", border:`1px solid ${border}`}}>
            {testResult.error ? (
              <div style={{color:"#dc2626", fontSize:13}}>{testResult.error}</div>
            ) : (
              <>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12, flexWrap:"wrap", gap:8}}>
                  <div>
                    <div style={{fontSize:15, fontWeight:700, color:text}}>{testResult.product_name}</div>
                    <div style={{fontSize:12, color:muted, marginTop:2}}>category: {testResult.category} · confidence: {testResult.confidence}</div>
                  </div>
                  <ScoreBadge score={testResult.overall_score || testResult.score} size="md" showLabel />
                </div>
                {testResult.summary && <div style={{fontSize:12, color:muted, lineHeight:1.6, marginBottom:10}}>{testResult.summary}</div>}
                {testResult.concerns?.slice(0,3).map((c,i) => (
                  <div key={i} style={{fontSize:12, color: c.level === "high" ? "#dc2626" : c.level === "medium" ? "#d97706" : "#16a34a", marginBottom:3}}>
                    {c.level === "high" ? "▲" : c.level === "medium" ? "◆" : "●"} {c.concern}
                  </div>
                ))}
                {testResult.dimension_scores && (
                  <div style={{marginTop:12, display:"flex", gap:8, flexWrap:"wrap"}}>
                    {Object.entries(testResult.dimension_scores).map(([k,v]) => (
                      <div key={k} style={{background:"#fff", borderRadius:8, padding:"4px 10px", fontSize:11, border:`1px solid ${border}`}}>
                        <span style={{color:muted}}>{k}: </span><span style={{fontWeight:700, color:text}}>{v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Recent local scans */}
      {history.length > 0 && (
        <div style={card}>
          <div style={sectionHead}>Recent scans (local history — {history.length} total)</div>
          <div style={{display:"flex", flexDirection:"column", gap:6}}>
            {history.slice(0,12).map((h,i) => {
              const score = h.score || h.overall_score || 0;
              return (
                <div key={i} style={{display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 12px", background:"#f8fafb", borderRadius:8, border:`1px solid ${border}`}}>
                  <div style={{flex:1}}>
                    <span style={{fontSize:13, fontWeight:600, color:text}}>{h.product_name}</span>
                    <span style={{fontSize:11, color:muted, marginLeft:8}}>{h.category}</span>
                  </div>
                  <div style={{marginLeft:12, flexShrink:0}}><ScoreBadge score={score} size="sm" showLabel /></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Score feedback from users */}
      <div style={card}>
        <div style={sectionHead}>User score feedback {feedback.length > 0 && <span style={{color:"#dc2626", marginLeft:8}}>({feedback.length} pending)</span>}</div>
        {feedbackLoading ? (
          <div style={{fontSize:13, color:muted}}>Loading...</div>
        ) : feedback.length === 0 ? (
          <div style={{fontSize:13, color:muted}}>No pending feedback. Users haven't flagged any scores yet.</div>
        ) : (
          <div style={{display:"flex", flexDirection:"column", gap:10}}>
            {feedback.map(f => {
              const tierColor = {
                too_high:        "#dc2626",
                too_low:         "#d97706",
                wrong_category:  "#c8781a",
                missing_concern: "#dc2626",
                other:           "#6b7280",
              }[f.suggested_tier] || "#6b7280";
              const tierLabel = {
                too_high:        "Too high",
                too_low:         "Too low",
                wrong_category:  "Wrong category",
                missing_concern: "Missing concern",
                other:           "Other",
              }[f.suggested_tier] || f.suggested_tier;
              return (
                <div key={f.id} style={{padding:"12px 14px", background:"#f8fafb", borderRadius:10, border:`1px solid ${border}`}}>
                  <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, marginBottom:8}}>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{fontSize:14, fontWeight:700, color:text}}>{f.product_name}</div>
                      <div style={{fontSize:11, color:muted, marginTop:2}}>
                        {f.category || "uncategorized"} · was scored {f.returned_score ?? "?"}/10 · {new Date(f.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{background:tierColor, color:"#fff", fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:20, textTransform:"uppercase", letterSpacing:"0.05em", flexShrink:0}}>{tierLabel}</div>
                  </div>
                  {f.note && <div style={{fontSize:12, color:muted, marginBottom:8, padding:"8px 10px", background:"#fff", borderRadius:6, borderLeft:`3px solid ${tierColor}`}}>{f.note}</div>}
                  {f.user_email && <div style={{fontSize:11, color:muted, marginBottom:8}}>from {f.user_email}</div>}
                  <div style={{display:"flex", gap:8}}>
                    <button onClick={() => { setTestQuery(f.product_name); runTestScan(); }} style={{padding:"6px 12px", borderRadius:6, border:`1px solid ${border}`, background:"none", color:muted, fontSize:11, fontWeight:600, cursor:"pointer"}}>Rescan</button>
                    <button onClick={() => resolveFeedback(f.id, "resolved")} style={{padding:"6px 12px", borderRadius:6, border:"none", background:"#16a34a", color:"#fff", fontSize:11, fontWeight:700, cursor:"pointer"}}>Mark resolved</button>
                    <button onClick={() => resolveFeedback(f.id, "dismissed")} style={{padding:"6px 12px", borderRadius:6, border:`1px solid ${border}`, background:"none", color:muted, fontSize:11, fontWeight:600, cursor:"pointer"}}>Dismiss</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{textAlign:"center", fontSize:11, color:muted, marginTop:8}}>
        Partiqule internal · Not indexed
      </div>
    </>)}
    </div>
  );
};

// ── ROUTINE PAGE ──────────────────────────────────────────────
const CATEGORY_PRICE_ESTIMATES = {food:5,food_beverage:5.5,beverage:4.5,snack:4,supplement:22,restaurant:12,cleaning:7,home:12,personal_care:11,skincare:16,baby:14,clothing:32,home_furnishing:45,toy:18,dairy:4.5,meat:9,produce:3.5,bakery:4,frozen:5.5,condiment:4,spice:3.5,grain:4,legume:3,nut:7,oil:6,other:8};






// ── HISTORY PAGE ─────────────────────────────────────────────
const HistoryPage = ({history, surface, border, text, muted, onSelect, onClear, onSearch, isMobile}) => {
  const [priceFilter, setPriceFilter] = useState("all");
  const [viewMode, setViewMode] = useState("date");
  const avg = history.length ? Math.round(history.reduce((a,h)=>a+h.score,0)/history.length*10)/10 : 0;
  const highest = history.length ? history.reduce((a,h)=>h.score>a.score?h:a, history[0]) : null;

  // Month-over-month comparison — shows if user is getting cleaner over time
  const now = Date.now();
  const ONE_MONTH = 30 * 24 * 60 * 60 * 1000;
  const thisMonthScans = history.filter(h => h.scanned_at && (now - new Date(h.scanned_at).getTime()) < ONE_MONTH);
  const lastMonthScans = history.filter(h => {
    if (!h.scanned_at) return false;
    const age = now - new Date(h.scanned_at).getTime();
    return age >= ONE_MONTH && age < 2 * ONE_MONTH;
  });
  const thisMonthAvg = thisMonthScans.length ? Math.round(thisMonthScans.reduce((a,h)=>a+(h.overall_score||h.score||0),0)/thisMonthScans.length*10)/10 : null;
  const lastMonthAvg = lastMonthScans.length ? Math.round(lastMonthScans.reduce((a,h)=>a+(h.overall_score||h.score||0),0)/lastMonthScans.length*10)/10 : null;
  const monthDelta = (thisMonthAvg !== null && lastMonthAvg !== null) ? Math.round((thisMonthAvg - lastMonthAvg) * 10) / 10 : null;
  // Category breakdown
  const catCounts = {};
  history.forEach(h => { const c = h.category || "other"; catCounts[c] = (catCounts[c] || 0) + 1; });
  const topCategory = Object.entries(catCounts).sort((a,b)=>b[1]-a[1])[0]?.[0];

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

  const CATEGORY_TO_ROOM = {cleaning:"Kitchen / Cleaning",home:"Home",personal_care:"Bathroom",skincare:"Bathroom",food:"Pantry",food_beverage:"Pantry",beverage:"Pantry",snack:"Pantry",clothing:"Closet",baby:"Nursery",toy:"Nursery",supplement:"Supplement",restaurant:"Restaurant"};
  const groupedByRoom = history.reduce((acc, item) => {
    const room = item.room || CATEGORY_TO_ROOM[item.category] || "Other";
    if (!acc[room]) acc[room] = [];
    acc[room].push(item);
    return acc;
  }, {});

  const renderHistoryItem = (item, i) => (
    <div key={i} style={{position:"relative", marginBottom:12, cursor:"pointer"}} onClick={()=>onSelect(item)}>
      <div style={{position:"absolute", left:-24, top:16, width:12, height:12, borderRadius:"50%", background:item.score<=3?"#16a34a":item.score<=6?"#d97706":"#dc2626", border:`2px solid ${surface}`, zIndex:1}}/>
      <div style={{background:surface, borderRadius:12, padding:"16px 20px", border:`1.5px solid ${border}`, transition:"all 0.15s"}}
        onMouseEnter={e=>{e.currentTarget.style.borderColor="#16a34a"; e.currentTarget.style.transform="translateX(3px)";}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor=border; e.currentTarget.style.transform="none";}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12}}>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:700, fontSize:15, color:text, marginBottom:4, lineHeight:1.3}}>{item.product_name}</div>
            <div style={{fontSize:12, color:muted}}>{item.summary?.slice(0,90)}{item.summary?.length>90?"...":""}</div>
          </div>
          <div style={{display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4, flexShrink:0}}>
            <ScoreBadge score={item.score} size="sm" showLabel />
            <div style={{fontSize:11, color:muted}}>{formatDate(item.scannedAt)}</div>
          </div>
        </div>
        {item.category && (
          <div style={{marginTop:10, display:"flex", alignItems:"center", gap:6}}>
            {(() => { const cat = {clothing:{label:"Clothing",color:"#2d5a27",bg:"#eef2ff"},food_beverage:{label:"Food & Drink",color:"#0891b2",bg:"#ecfeff"},personal_care:{label:"Personal Care",color:"#c8781a",bg:"#fdf2f8"},kitchen:{label:"Kitchen",color:"#d97706",bg:"#fffbeb"},baby:{label:"Baby & Kids",color:"#c8781a",bg:"#fdf4e7"},other:{label:"General",color:"#6b7280",bg:"#f9fafb"}}[item.category]||{label:"General",color:"#6b7280",bg:"#f9fafb"}; return <span style={{background:cat.bg,color:cat.color,fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:20}}>{cat.label}</span>; })()}
            <span style={{fontSize:11, color:"#16a34a", fontWeight:600}}>Tap to view full result</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={{maxWidth:900, margin:"0 auto", padding:isMobile?"20px 16px 60px":"48px 40px 80px"}}>
      <div style={{marginBottom:isMobile?24:40}}>
        <h1 style={{fontFamily:"'Lora', Georgia, serif", fontWeight:400, fontSize:isMobile?30:38, color:text, margin:"0 0 8px", letterSpacing:"-0.015em", lineHeight:1.05}}>Your <span style={{color:"var(--moss)"}}>shelf</span></h1>
        <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, marginTop:8}}>
          <p style={{fontSize:15, color:muted, margin:0}}>Your scan history and recommended safer alternatives</p>
          <div style={{display:"flex", gap:4, background:"#f1f5f9", borderRadius:10, padding:3, flexShrink:0}}>
            {[["date","By date"],["room","By room"]].map(([mode,label])=>(
              <button key={mode} onClick={()=>setViewMode(mode)} style={{padding:"5px 12px", borderRadius:8, border:"none", background:viewMode===mode?("#fff"):"none", color:viewMode===mode?text:muted, fontSize:12, fontWeight:viewMode===mode?600:400, cursor:"pointer"}}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      {history.length === 0 ? (
        <div style={{textAlign:"center", padding:"80px 0", color:muted}}>
          <div style={{display:"flex",justifyContent:"center",marginBottom:16}}><IcoScan size={48}/></div>
          <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:600, fontSize:18, color:text, marginBottom:8}}>No scans yet</div>
          <div style={{fontSize:14, marginBottom:24}}>Search for a product to get started</div>
          <button onClick={()=>onSearch("")} style={{padding:"10px 24px", borderRadius:8, border:"none", background:"#16a34a", color:"#fff", fontWeight:600, fontSize:14, cursor:"pointer"}}>Start Scanning</button>
        </div>
      ) : (
        <>
          {/* Stats cards */}
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:40}}>
            <div style={{background:surface, borderRadius:16, padding:"24px 28px", border:`1.5px solid ${border}`}}>
              <div style={{fontSize:12, color:muted, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:12}}>Avg Safety Score</div>
              <div style={{display:"flex", alignItems:"flex-end", gap:8, marginBottom:10}}>
                <ScoreBadge score={avg} size="lg" showLabel />
              </div>
              <div style={{height:6, borderRadius:99, background:"#e5e7eb", overflow:"hidden"}}>
                <div style={{height:"100%", width:`${(avg/10)*100}%`, background:avg<=3?"#16a34a":avg<=6?"#d97706":"#dc2626", borderRadius:99, transition:"width 1s ease"}}/>
              </div>
              <div style={{fontSize:12, color:muted, marginTop:8}}>Across {history.length} scan{history.length!==1?"s":""}</div>
            </div>
            {highest && (
              <div style={{background:surface, borderRadius:16, padding:"24px 28px", border:`1.5px solid ${border}`}}>
                <div style={{fontSize:12, color:muted, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:12}}>Highest Risk Found</div>
                <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:700, fontSize:16, color:text, marginBottom:6, lineHeight:1.3}}>{highest.product_name}</div>
                <div style={{display:"inline-flex", alignItems:"center", gap:6}}>
                  <ScoreBadge score={highest.score} size="sm" showLabel />
                  <span style={{fontSize:13, fontWeight:700, color:highest.score<=3?"#16a34a":highest.score<=5?"#d97706":"#dc2626"}}>{highest.score>=8?"Very High":highest.score>=6?"High":"Moderate"} Risk</span>
                </div>
                <div style={{fontSize:12, color:"#16a34a", fontWeight:600, marginTop:10, cursor:"pointer"}} onClick={()=>onSelect(highest)}>
                  View result →
                </div>
              </div>
            )}
          </div>

          {/* Month-over-month comparison */}
          {thisMonthScans.length >= 3 && (
            <div style={{background:"#f0fdf4", borderRadius:16, padding:"20px 24px", border:`1.5px solid ${"#bbf7d0"}`, marginBottom:24}}>
              <div style={{display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:16, flexWrap:"wrap"}}>
                <div style={{flex:1, minWidth:200}}>
                  <div style={{fontSize:11, color:"#16a34a", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6}}>This month</div>
                  <div style={{display:"flex", alignItems:"baseline", gap:12, marginBottom:6}}>
                    <span style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:800, fontSize:32, color:text}}>{thisMonthScans.length}</span>
                    <span style={{fontSize:13, color:muted}}>scan{thisMonthScans.length!==1?"s":""}</span>
                  </div>
                  {thisMonthAvg !== null && (
                    <div style={{fontSize:13, color:muted}}>
                      Average score: <ScoreBadge score={thisMonthAvg} size="xs" showLabel />
                      {monthDelta !== null && (
                        <span style={{marginLeft:10, fontSize:12, color: monthDelta < 0 ? "#16a34a" : monthDelta > 0 ? "#dc2626" : muted, fontWeight:600}}>
                          {monthDelta < 0 ? "↓" : monthDelta > 0 ? "↑" : "="} {Math.abs(monthDelta)} vs last month
                        </span>
                      )}
                    </div>
                  )}
                  {topCategory && (
                    <div style={{fontSize:13, color:muted, marginTop:4}}>
                      Most scanned: <strong style={{color:text}}>{topCategory.replace(/_/g," ")}</strong>
                    </div>
                  )}
                </div>
                {monthDelta !== null && monthDelta < 0 && (
                  <div style={{fontSize:12, color:"#16a34a", fontWeight:600, maxWidth:220, textAlign:"right"}}>
                    🎉 Your average is trending cleaner. Keep it up!
                  </div>
                )}
              </div>
            </div>
          )}

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
              <div style={{marginBottom:40, background:"#f0fdf4", borderRadius:16, border:`1.5px solid ${"#bbf7d0"}`, overflow:"hidden"}}>
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
                  <div style={{padding:"0 20px 20px", borderTop:`1px solid ${"#bbf7d0"}`}}>

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
                                <span style={{whiteSpace:"nowrap", display:"inline-flex", alignItems:"center", gap:4}}><ScoreBadge score={s} size="xs" showLabel /></span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Total exposure summary */}
                    <div style={{background:"#fff", borderRadius:12, padding:"14px 16px", border:`1px solid ${"#d1fae5"}`}}>
                      <div style={{fontSize:11, color:muted, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:10}}>
                        If you switched every high-risk product
                      </div>
                      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12}}>
                        <div>
                          <div style={{fontSize:10, color:scoreColor(Math.round(avgScore)), fontWeight:700, textTransform:"uppercase", marginBottom:4}}>Current (all products)</div>
                          <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:800, fontSize:28, color:scoreColor(Math.round(avgScore)), lineHeight:1}}>
                            {Math.round(totalExposures).toLocaleString()}
                          </div>
                          <div style={{fontSize:11, color:muted}}>total annual exposures</div>
                        </div>
                        <div>
                          <div style={{fontSize:10, color:"#16a34a", fontWeight:700, textTransform:"uppercase", marginBottom:4}}>After switching</div>
                          <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:800, fontSize:28, color:"#16a34a", lineHeight:1}}>
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
                  <h2 style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:700, fontSize:isMobile?18:22, color:text, margin:"0 0 4px"}}>
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
                      style={{
                        padding:"6px 14px", borderRadius:9999,
                        border: priceFilter===f.key ? "none" : "1px solid var(--rule)",
                        background: priceFilter===f.key ? "var(--moss)" : "var(--cream-light)",
                        color: priceFilter===f.key ? "var(--ivory)" : "var(--ink-soft)",
                        fontFamily:"'DM Sans', system-ui, sans-serif",
                        fontSize:12, fontWeight:500, cursor:"pointer",
                        letterSpacing:"0.02em", whiteSpace:"nowrap", transition:"all 0.15s",
                      }}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{display:"grid", gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,1fr)", gap:12}}>
                {filteredAlts.slice(0,9).map((alt, i) => (
                  <a key={i} href={alt.affiliateUrl} rel="noopener noreferrer"
                    style={{textDecoration:"none", display:"block", background:surface, borderRadius:14,
                      border:`1.5px solid ${border}`, overflow:"hidden", transition:"all 0.15s"}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor="#16a34a";}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor=border;}}>
                    {/* Score badge */}
                    <div style={{padding:"12px 14px 0"}}>
                      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8}}>
                        <div style={{fontSize:10, fontWeight:700, color:"#16a34a", background:"rgba(34,197,94,0.08)", padding:"2px 8px", borderRadius:10}}>
                          {alt.score}/10 danger
                        </div>
                        {alt.price && alt.price !== "See on Amazon" && (
                          <div style={{fontSize:12, fontWeight:700, color:text}}>{alt.price}</div>
                        )}
                      </div>
                      <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:700, fontSize:13, color:text, marginBottom:4, lineHeight:1.3}}>
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
            <h2 style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:700, fontSize:isMobile?18:22, color:text, margin:"0 0 24px"}}>Scan History</h2>

            {viewMode === "date" && Object.entries(grouped).map(([date, items]) => (
              <div key={date} style={{marginBottom:36}}>
                <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:16}}>
                  <div style={{fontSize:12, fontWeight:600, color:muted, textTransform:"uppercase", letterSpacing:"0.07em", whiteSpace:"nowrap"}}>{date}</div>
                  <div style={{flex:1, height:1, background:border}}/>
                </div>
                <div style={{position:"relative", paddingLeft:28}}>
                  <div style={{position:"absolute", left:9, top:8, bottom:8, width:2, background:border, borderRadius:2}}/>
                  {items.map((item, i) => renderHistoryItem(item, i))}
                </div>
              </div>
            ))}

            {viewMode === "room" && Object.entries(groupedByRoom)
              .sort((a, b) => b[1].length - a[1].length)
              .map(([room, items]) => {
                const avg = Math.round(items.reduce((s, i) => s + (i.score || i.overall_score || 0), 0) / items.length * 10) / 10;
                return (
                  <div key={room} style={{marginBottom:28}}>
                    <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10}}>
                      <div>
                        <span style={{fontSize:14, fontWeight:700, color:text}}>{room}</span>
                        <span style={{fontSize:12, color:muted, marginLeft:8}}>{items.length} scan{items.length !== 1 ? "s" : ""} · avg {avg}/10</span>
                      </div>
                      {items.length >= 3 && (
                        <button onClick={()=>onSearch("")} style={{padding:"6px 12px", borderRadius:8, background:"#2563eb", color:"#fff", border:"none", fontSize:12, fontWeight:700, cursor:"pointer"}}>View</button>
                      )}
                    </div>
                    <div style={{position:"relative", paddingLeft:28}}>
                      <div style={{position:"absolute", left:9, top:8, bottom:8, width:2, background:border, borderRadius:2}}/>
                      {items.map((item, i) => renderHistoryItem(item, i))}
                    </div>
                  </div>
                );
              })
            }
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


const AboutPage = ({text, muted, surface, border, isMobile, onScan, onNavigate}) => {
  return (
    <div style={{maxWidth:860, margin:"0 auto", padding:isMobile?"24px 16px 60px":"48px 40px 80px"}}>

      {/* Hero header */}
      <div style={{marginBottom:48}}>
        <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:10, fontWeight:500, color:"var(--moss)", textTransform:"uppercase", letterSpacing:"0.22em", marginBottom:16, display:"flex", alignItems:"center", gap:10}}>
          <span style={{display:"inline-block", width:22, height:1, background:"var(--moss)", opacity:0.7}}/>
          About Partiqule
        </div>
        <h1 style={{fontFamily:"'Lora', Georgia, serif", fontWeight:400, fontSize:isMobile?36:54, color:text, margin:"0 0 24px", letterSpacing:"-0.015em", lineHeight:1.04}}>
          Know what's <span style={{color:"var(--moss)"}}>in your products.</span>
        </h1>
        <p style={{fontSize:isMobile?16:18, color:muted, lineHeight:1.85, marginBottom:16, maxWidth:680}}>
          The food you eat, the clothes you wear, the cookware you cook with, the cleaning products in your home. All of it has a measurable impact on your health, your family's health, and the health of the planet. Most of that impact is invisible. There's no label, no warning, no easy way to know what to trust.
        </p>
        <p style={{fontSize:isMobile?17:20, color:"#16a34a", fontWeight:700, lineHeight:1.5, marginBottom:16}}>
          Partiqule exists to change that.
        </p>
        <p style={{fontSize:isMobile?15:16, color:muted, lineHeight:1.85, marginBottom:16, maxWidth:680}}>
          We score every product across four dimensions: materials, exposure, packaging and sustainability. The result is a complete picture of its chemical and environmental impact on you, your home, and the planet. Free, instant, and grounded in published science.
        </p>
        <p style={{fontSize:isMobile?15:16, color:muted, lineHeight:1.85, marginBottom:32, maxWidth:680}}>
          Because when you understand what you're buying, you can make better decisions for yourself and the people you love.
        </p>
        <button onClick={()=>onScan()}
          style={{padding:"12px 28px", borderRadius:10, border:"none", background:"#052e16", color:"#4ade80", fontWeight:700, fontSize:15, cursor:"pointer"}}>
          Try your first scan →
        </button>
      </div>

      {/* Mission */}
      <div style={{marginBottom:48, paddingBottom:48, borderBottom:`1px solid ${border}`}}>
        <h2 style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:700, fontSize:26, color:text, margin:"0 0 16px"}}>Our mission</h2>
        <p style={{fontSize:16, color:muted, lineHeight:1.85, marginBottom:16}}>
          The things that affect your health most aren't always the things on the front of the label. Microplastics in food-contact packaging. Synthetic dyes linked to carcinogenicity. PFAS in non-stick coatings. PVA film dissolving into waterways. Synthetic textiles shedding microfibers onto your skin every day. The research is there — but it's scattered, technical, and inaccessible to most people.
        </p>
        <p style={{fontSize:16, color:muted, lineHeight:1.85, marginBottom:16}}>
          Partiqule is built to close that gap. We combine peer-reviewed science with two independent research passes to give every person access to the kind of information that used to require a toxicologist. Scan anything — a cleaning product, a piece of clothing, a food item, a baby product — and get a complete health picture in seconds.
        </p>
        <p style={{fontSize:16, color:muted, lineHeight:1.85}}>
          Every score we produce is grounded in published research, including the New England Journal of Medicine, Nature Medicine, The Lancet, and the FDA. We flag what matters, explain why it matters, and show you what to do about it.
        </p>
      </div>

      {/* What we stand for */}
      <div style={{marginBottom:48, paddingBottom:48, borderBottom:`1px solid ${border}`}}>
        <h2 style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:700, fontSize:26, color:text, margin:"0 0 24px"}}>What we stand for</h2>
        <div style={{display:"flex", flexDirection:"column", gap:20}}>
          {[
            {title:"The full picture", body:"Microplastics are one part of the story. We score four dimensions: materials, exposure, packaging and sustainability. Your health, your home, and the planet are all affected differently by the same product."},
            {title:"Radical transparency", body:"Our scoring methodology is open. We show you the full breakdown across all four dimensions with the research behind each score. Judge for yourself rather than just trusting a number."},
            {title:"No conflicts of interest", body:"We recommend products because they're genuinely safer, not because we're paid to. Affiliate relationships are always clearly disclosed and never influence our scores."},
            {title:"Free to start", body:"Your first scans are on us. No account needed to get started — create a free account to save your history."},
            {title:"Science first", body:"Every score is grounded in published research. We cite our sources, maintain our methodology, and update our scoring when the science evolves."},
          ].map((v,i)=>(
            <div key={i} style={{display:"flex", gap:16, alignItems:"flex-start"}}>
              <div style={{width:8, height:8, borderRadius:"50%", background:"#16a34a", flexShrink:0, marginTop:6}}/>
              <div>
                <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:700, fontSize:16, color:text, marginBottom:4}}>{v.title}</div>
                <div style={{fontSize:15, color:muted, lineHeight:1.7}}>{v.body}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Founders & human oversight */}
      <div style={{marginBottom:48, paddingBottom:48, borderBottom:`1px solid ${border}`}}>
        <h2 style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:700, fontSize:26, color:text, margin:"0 0 16px"}}>Built by humans. Guided by expertise.</h2>
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
                <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:700, fontSize:16, color:text, marginBottom:4}}>{person.name}</div>
                <div style={{fontSize:12, fontWeight:600, color:"#16a34a", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:10}}>{person.role}</div>
                <div style={{fontSize:14, color:muted, lineHeight:1.7}}>{person.detail}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Founders story */}
        <div style={{background:"#f0fdf4", borderRadius:16, padding:"28px", border:`1px solid ${"#bbf7d0"}`, marginBottom:16}}>
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
            So we built one. Partiqule was designed to look at every product the way we wished something had looked at them for us: across materials, exposure, packaging and sustainability. The full picture, not just one piece of it. We are just two parents trying to do better for our family, and hoping to make it easier for yours.
          </p>
        </div>

        <div style={{padding:"14px 18px", background:"#f8fafc", borderRadius:12, border:`1px solid ${border}`}}>
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
        <h2 style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:700, fontSize:26, color:text, margin:"0 0 16px"}}>The impact we're working toward</h2>
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
        <h2 style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:700, fontSize:26, color:text, margin:"0 0 16px"}}>A note on AI energy and water use</h2>
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
        <div style={{background:"#f0fdf4", borderRadius:14, padding:"20px 24px", border:`1px solid ${"#bbf7d0"}`}}>
          <div style={{fontSize:13, fontWeight:700, color:"#16a34a", marginBottom:8}}>Our commitment</div>
          <p style={{fontSize:15, color:muted, lineHeight:1.7, margin:0}}>
            As Partiqule grows, we'll publish an annual transparency note on our AI usage, water and energy estimates, and what we're doing to reduce them. We believe the tools that expose environmental harm should hold themselves to the same standard.
          </p>
        </div>
      </div>

      {/* Contact */}
      <div>
        <h2 style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:700, fontSize:26, color:text, margin:"0 0 16px"}}>Get in touch</h2>
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
const MethodologyPage = ({text, muted, surface, border, isMobile}) => {
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
          body: "Every product is evaluated across three spheres of impact — your personal health, the health of your family and home, and the health of the planet. These map to four scored dimensions: Materials, Exposure, Packaging and Sustainability."
        },
        {
          heading: "Dual scoring formula — food vs non-food",
          body: "Food and non-food products use different dimension weights because the risks are fundamentally different. What goes in your body matters more than what touches your skin.",
          list: [
            "Food, Beverage and Restaurant: Ingredients 90% · Packaging 10% — ingredients are the story. Organic spinach in a plastic bag still scores 2. The packaging concern is flagged separately, not used to tank a clean food.",
            "Beverage: Ingredients 75% · Packaging 25% — the container leaches directly into every sip. A plastic water bottle consumed daily is different from a plastic cereal box.",
            "Beauty and Personal Care: Materials 45% · Exposure 45% · Packaging 5% · Sustainability 5% — leave-on daily skin contact makes exposure equally important as what's in the product.",
            "Clothing and Shoes: Materials 35% · Exposure 30% · Sustainability 35% — microfiber shedding into waterways gives sustainability real weight.",
            "Home (cleaning, candles, furniture): Materials 30% · Exposure 45% · Packaging 10% · Sustainability 15% — inhalation and residue contact is the primary story.",
            "Baby Products: Materials 55% · Exposure 40% · Packaging 5% — developing systems and higher skin absorption demand the most protective formula.",
          ]
        },
        {
          heading: "NOVA processing level modifier — food only",
          body: "Before substance scoring, food products are assessed on the NOVA processing scale. Ultra-processed formulations (NOVA 4) start with a structural materials penalty regardless of individual ingredient claims — because industrial formulations with 20+ additives present cumulative chemical load beyond any single ingredient:",
          list: [
            "NOVA 1 — Unprocessed or minimally processed (fresh fruit, vegetables, plain oats, eggs): no penalty",
            "NOVA 2 — Processed culinary ingredients (oils, vinegar, flour, salt): no penalty on their own",
            "NOVA 3 — Processed foods (canned beans, cheese, fermented foods, bread with simple ingredients): materials baseline 2-4",
            "NOVA 4 — Ultra-processed formulations with industrial additives (most breakfast cereals, packaged snacks, plant-based meat, most fast food): materials baseline 5+",
          ]
        },
        {
          heading: "Added sugar penalty — food only",
          body: "WHO recommends less than 25g added sugar per day. Most cereal, snack bars, and flavored beverages are consumed daily, so cumulative sugar exposure is scored independently of substance concerns:",
          list: [
            "0–5g added sugar per serving: no penalty",
            "6–10g added sugar per serving: materials +1",
            ">10g added sugar per serving: materials +2",
            ">20g added sugar per serving: materials +3 — exceeds half the WHO daily limit in one serving",
          ]
        },
        {
          heading: "What the score means",
          body: "This is an ingredient safety score — it measures chemical risk, not nutritional quality. Organic butter scores 1-2. That means no pesticides, no synthetic additives. It does not mean unlimited consumption is recommended.",
          list: [
            "1-2 Safe — No significant chemical or ingredient concerns. Cleanest in its category from a safety standpoint.",
            "3-4 Good — Mostly clean. Minor concerns, nothing alarming. Fine for regular use.",
            "5-6 Caution — Real concerns worth knowing. Consider reducing use or finding a cleaner alternative.",
            "7-8 Switch — Significant concerns. We will show you a better option.",
            "9-10 Avoid — Known harmful substances. Significant and documented safety risk.",
          ]
        },
        {
          heading: "Positive signals that actively lower a score",
          body: "The following certifications are enforced as server-side score ceilings — they cannot be overridden by the AI:",
          list: [
            "USDA Organic certified food + no confirmed dangerous substances: final score cannot exceed 3",
            "Non-GMO Project Verified + no synthetic dyes + no synthetic preservatives: final score cannot exceed 4",
            "Fair Trade certified — workers paid living wage, safe conditions",
            "B-Corp certified — legal accountability to people and planet",
            "GOTS certified textiles — organic fiber verified through the full supply chain",
            "EWG Verified, NSF certified, or Rainforest Alliance",
          ]
        },
        {
          heading: null,
          body: "These parameters are hardcoded into the AI prompts and server-side formula. The AI applies them. It does not define them."
        }
      ]
    },
    {
      number: "02",
      title: "113-substance registry",
      color: "#dc2626",
      content: [
        {
          heading: "Ingredient-triggered score floors",
          body: "When the AI identifies a specific harmful substance in its analysis, a minimum materials score is enforced in code — not by the AI. This means the AI cannot underestimate the risk of a confirmed harmful ingredient regardless of how it weights other factors. Floors only activate when the substance is actually confirmed. A clean product like Poppi soda will never trigger a floor because it contains none of these substances."
        },
        {
          heading: "Sources",
          body: "The registry was built from seven authoritative sources:",
          list: [
            "EU REACH Candidate List — 253 Substances of Very High Concern as of February 2026",
            "IARC Monographs Volumes 1-141 — carcinogens classified Group 1 (known), 2A (probable), and 2B (possible)",
            "EWG Skin Deep database — cosmetic ingredient hazard ratings",
            "FDA banned and restricted substances lists",
            "EPA Safer Choice and Toxic Substances lists",
            "NTP 15th Report on Carcinogens",
            "WHO chemical safety guidelines",
          ]
        },
        {
          heading: "20 substance categories — 113 total substances",
          body: null,
          list: [
            "PFAS and forever chemicals (7) — PFOA, PFOS floor at M≥9 (IARC Group 1)",
            "Petroleum dyes (6) — Red 40, Yellow 5/6, titanium dioxide (EU food ban, IARC 2B)",
            "Preservatives (7) — TBHQ, BHA, BHT, potassium bromate, sodium nitrite",
            "Formaldehyde and releasers (6) — DMDM hydantoin, quaternium-15, bronopol",
            "Parabens (4) — long-chain isobutyl/isopropyl EU banned, floor M≥6",
            "Phthalates (5) — DEHP, DBP, BBP all EU SVHC, floor M≥7",
            "Bisphenols (5) — BPA, BPS, BPF, BPAF (EU SVHC February 2026)",
            "Chemical UV filters (6) — oxybenzone floor M≥7 (detected in bloodstream after single use)",
            "Heavy metals (7) — mercury, lead, arsenic, cadmium floor M≥8-9",
            "Plastic food contact chemicals (6) — PVC, polystyrene, PVA film, 1,4-dioxane",
            "Flame retardants (7) — PBDE banned, TCEP/TDCPP IARC 2B, TPhP EU SVHC 2024",
            "Synthetic fragrance and VOCs (6) — toluene, benzene, undisclosed phthalates",
            "Textile chemicals (7) — azo dyes, nonylphenol, PFAS DWR coatings",
            "Sweeteners and additives (8) — aspartame IARC 2B, BVO FDA proposed ban",
            "Antimicrobials (3) — triclosan and triclocarban FDA banned in soaps 2017",
            "Pesticides (5) — glyphosate IARC 2A, chlorpyrifos EPA banned 2021, PFAS pesticides",
            "Solvents (6) — n-hexane EU SVHC 2026, methylene chloride IARC Group 1",
            "Hair dye chemicals (4) — PPD, aminophenol, lead acetate, resorcinol",
            "Microplastics (2) — microbeads, microfiber shedding",
            "Polychlorinated compounds (3) — PCBs and dioxins floor M≥9 (IARC Group 1)",
          ]
        }
      ]
    },
    {
      number: "03",
      title: "AI analysis — two-pass system",
      color: "#2563eb",
      content: [
        {
          heading: "Why two passes?",
          body: "Each product scan runs two independent AI passes using Anthropic's Claude. The two-pass structure was designed to reduce hallucination and catch cases where the first pass may have over- or under-scored a product."
        },
        {
          heading: "Pass 1 — Research and analysis",
          body: "The AI searches the web for real material data on the specific product, then scores it across all four dimensions using the parameters we defined. It identifies harmful chemicals, natural materials, packaging type, sustainability story, and exposure pathway. For every scan it produces a Tier 1-4 composition classification and a named substance breakdown tailored to the category."
        },
        {
          heading: "Pass 2 — Independent audit",
          body: "A second independent AI instance reviews Pass 1 output as a skeptical auditor. It applies calibration anchors, checks that genuinely safe products are not penalised unfairly, and flags low-confidence results. The substance registry floors are then applied in server-side code after both passes complete — the AI cannot override them."
        },
        {
          heading: "Confidence levels",
          body: null,
          list: [
            "High — full ingredient list verified, known brand formulation, or label read directly from photo",
            "Medium — brand known but full ingredient list not public. Score based on known brand practices",
            "Low — unknown brand or no public data. Score is a conservative directional estimate",
          ]
        }
      ]
    },
    {
      number: "04",
      title: "Human quality review and test suite",
      color: "#d97706",
      content: [
        {
          heading: "Automated test suite",
          body: "We run an automated test suite against the live API after every significant change to scoring parameters. The suite scans 20+ known products and verifies scores fall within expected ranges, correct substances are flagged, and self-recommendation bugs are absent."
        },
        {
          heading: "Food model calibration anchors",
          body: null,
          list: [
            "Organic spinach / fresh produce: must score 1-2",
            "Larabar / RX Bar (whole food, minimal ingredients): must score 1-3",
            "Kashi Organic cereal (USDA certified): must score 1-3 — organic ceiling enforced server-side",
            "Kashi conventional GO cereal (Non-GMO, no dyes): must score 3-4 — Non-GMO clean ceiling enforced server-side",
            "365 WFM protein bites (dates, nuts, no dyes): must score 2-4",
            "Oats Overnight organic (certified organic): must score 2-4",
            "Cliff Bar (conventional oats, whole food base): must score 3-5",
            "Quaker oats conventional: must score 5-6 — primary oat with confirmed glyphosate",
            "Honey Nut Cheerios: must score 6-8 — primary oat with confirmed glyphosate above EWG child threshold + 12g sugar",
            "M&Ms / Skittles: must score 6-9 and flag petroleum dyes",
            "Hot dogs / processed meat: must score 6-9 and flag nitrites",
            "All alcoholic beverages: must score 6-9 and flag IARC Group 1 ethanol",
          ]
        },
        {
          heading: "Non-food calibration anchors",
          body: null,
          list: [
            "Blueland tablets must score 1-3. Neutrogena sunscreen must score 6-9 and flag oxybenzone.",
            "Teflon non-stick pan must score 6-9 and flag PTFE. Patagonia organic cotton tee must score 1-3.",
            "Poppi Prebiotic Soda must score 1-4 and must never recommend itself as an alternative.",
            "Pampers diapers must score 6-8. Hello Bello must score 3-5. Andy Pandy bamboo must score 2-4.",
          ]
        },
        {
          heading: "Cache invalidation",
          body: "When scoring parameters are updated or a systematic error is identified, the result cache is cleared so all products are rescored under the current methodology. Every score reflects the current rules."
        }
      ]
    },
    {
      number: "05",
      title: "Affiliate product standards",
      color: "#c8781a",
      content: [
        {
          heading: "How alternatives are selected",
          body: "Products recommended as safer alternatives on Partiqule meet the following criteria:",
          list: [
            "The alternative must score materially lower than the scanned product across materials, exposure, and sustainability combined",
            "A product is never recommended as an alternative to itself or its own brand family",
            "Affiliate links are clearly disclosed with #ad labeling on every results page",
            "Affiliate relationships have zero influence on scoring — the score is calculated before any alternative is suggested. No brand can pay to change a score.",
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
            "Scoring parameters are reviewed when new peer-reviewed research is published on chemical exposure, endocrine disruption, or sustainability",
            "The substance registry is updated when EU REACH, IARC, EWG, FDA, or EPA publish new flagged substances — currently tracks the 253-entry REACH SVHC list updated February 2026",
            "The AI model version is reviewed periodically to ensure accuracy has not regressed",
            "An annual transparency note is published disclosing AI usage and any methodology changes",
            "User feedback is monitored — products that generate unusual concern or contradiction are flagged for manual review",
          ]
        }
      ]
    },
  ];

  return (
    <div style={{maxWidth:760, margin:"0 auto", padding:isMobile?"24px 16px 60px":"48px 40px 80px"}}>
      {/* Header */}
      <div style={{marginBottom:40}}>
        <div style={{fontSize:12, fontWeight:700, color:"#16a34a", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:12}}>Transparency & Methodology</div>
        <h1 style={{fontFamily:"'Lora', Georgia, serif", fontWeight:400, fontSize:isMobile?34:48, color:text, margin:"0 0 16px", letterSpacing:"-0.015em", lineHeight:1.05}}>How <span style={{color:"var(--moss)"}}>Partiqule</span> works</h1>
        <p style={{fontSize:16, color:muted, lineHeight:1.8, margin:"0 0 8px"}}>
          Every score on Partiqule reflects the chemical and environmental impact of a product — what it's made of, how it exposes you, what happens to it after use. This page explains exactly how we measure that — combining expert-defined parameters, a 113-substance registry sourced from EU REACH, IARC, EWG, FDA and EPA, a dual scoring formula calibrated by category, and human quality review. We believe tools that expose hidden harm should be fully transparent about their own process.
        </p>
        <div style={{fontSize:13, color:muted, opacity:0.6, fontStyle:"italic"}}>Methodology last reviewed: April 2026</div>
      </div>

      {/* Key stats bar */}
      <div style={{display:"grid", gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)", gap:12, marginBottom:40}}>
        {[
          {number:"20+", label:"Years combined expertise"},
          {number:"113", label:"Flagged substances in registry"},
          {number:"2",   label:"AI passes per scan"},
          {number:"100%",label:"Affiliate-independent scoring"},
        ].map((s,i) => (
          <div key={i} style={{background:surface, borderRadius:14, padding:"20px 16px", border:`1.5px solid ${border}`, textAlign:"center"}}>
            <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:800, fontSize:28, color:"#16a34a", marginBottom:4}}>{s.number}</div>
            <div style={{fontSize:12, color:muted, lineHeight:1.4}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Founders callout */}
      <div style={{background:"#f0fdf4", borderRadius:16, padding:"24px", border:`1px solid ${"#bbf7d0"}`, marginBottom:48}}>
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
              <span style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:800, fontSize:15, color:step.color}}>{step.number}</span>
            </div>
            <h2 style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:700, fontSize:isMobile?20:24, color:text, margin:"10px 0 0", letterSpacing:"-0.3px"}}>{step.title}</h2>
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
            <span style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:800, fontSize:15, color:"#052e16"}}>eg.</span>
          </div>
          <h2 style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:700, fontSize:isMobile?20:24, color:text, margin:"10px 0 0", letterSpacing:"-0.3px"}}>Worked examples</h2>
        </div>
        <div style={{paddingLeft:68}}>

          {/* Example 1 */}
          <div style={{marginBottom:32}}>
            <div style={{fontSize:14, fontWeight:700, color:text, marginBottom:12}}>Example 1 — Non-stick frying pan</div>
            <div style={{display:"flex", flexDirection:"column", gap:8}}>
              {[
                {step:"Web search", detail:"AI searches for real material specs and confirms PTFE (Teflon) coating on cooking surface, aluminium body, plastic handle."},
                {step:"Pass 1: Analysis", detail:"Materials: 9 (PTFE/PFAS — FDA-flagged endocrine disruptors). Usage: 9 (daily ingestion pathway, heated surface accelerates breakdown). Packaging: 3. Sustainability: 4 (durable but PTFE unrecyclable). "},
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
              A product that scores low on materials but high on sustainability — showing why all four dimensions matter, not just what the product is made of.
            </p>
            <div style={{display:"flex", flexDirection:"column", gap:8}}>
              {[
                {step:"Web search", detail:"AI confirms paper product with PE/PP plastic outer packaging, cardboard tube core, bleached virgin wood pulp."},
                {step:"Pass 1: Analysis", detail:"Materials: 2 (paper, no direct plastic exposure — packaging discarded before use). Usage: 2 (not ingested or absorbed). Packaging: 5 (PE film wrap, cardboard tube). Sustainability: 8 (single-use by design, high disposal frequency, virgin wood pulp). "},
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
            <span style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:800, fontSize:13, color:"#0891b2"}}>refs</span>
          </div>
          <h2 style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:700, fontSize:isMobile?20:24, color:text, margin:"10px 0 0", letterSpacing:"-0.3px"}}>Research sources</h2>
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
              color: "#c8781a",
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
              color: "#2d5a27",
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
              category: "Pesticides in produce — EWG 2026",
              color: "#16a34a",
              refs: [
                {citation:"EWG Shopper's Guide to Pesticides in Produce (2026)", title:"2026 Dirty Dozen and Clean Fifteen — PFAS pesticides found on 63% of Dirty Dozen samples", journal:"Environmental Working Group — analysis of 54,344 USDA samples across 47 fruits and vegetables"},
                {citation:"USDA Pesticide Data Program (2025)", title:"Pesticide residue testing of domestic and imported produce", journal:"USDA — basis for EWG annual rankings; produce washed and peeled before testing"},
                {citation:"Subramaniam et al. (2025)", title:"Updated methodology for EWG Shopper's Guide pesticide rankings including toxicity weighting", journal:"EWG — peer-reviewed methodology published 2025, applied to 2026 report"},
                {citation:"American Academy of Pediatrics (2012)", title:"Pesticide exposure in children", journal:"Pediatrics — children especially susceptible to pesticide exposure, even in utero"},
                {citation:"Mnif et al. (2011)", title:"Effect of endocrine disruptor pesticides: a review", journal:"International Journal of Environmental Research and Public Health — pesticides linked to endocrine disruption, reproductive harm"},
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

      {/* ── SCORING SYSTEM ─────────────────────────────────────── */}
      <div style={{marginBottom:40}}>
        <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:8}}>
          <span style={{fontSize:11, fontWeight:700, color:"#16a34a", textTransform:"uppercase", letterSpacing:"0.1em", background:"rgba(34,197,94,0.08)", padding:"3px 10px", borderRadius:20}}>How We Score</span>
        </div>
        <h2 style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:isMobile?20:26, fontWeight:700, color:text, margin:"0 0 8px", letterSpacing:"-0.3px"}}>The scoring system, in full</h2>
        <p style={{fontSize:15, color:muted, lineHeight:1.7, margin:"0 0 28px"}}>Every score is the output of a deterministic formula applied server-side. The AI provides dimension scores — we apply the weights. Here is the complete logic.</p>

        {/* Category formula table */}
        <div style={{background:surface, borderRadius:14, border:`1px solid ${border}`, overflow:"hidden", marginBottom:24}}>
          <div style={{padding:"16px 20px", borderBottom:`1px solid ${border}`, background:"#f8fafc"}}>
            <div style={{fontSize:13, fontWeight:700, color:text}}>Category Formulas — applied server-side, AI cannot override</div>
            <div style={{fontSize:12, color:muted, marginTop:2}}>Manufacturing removed — too inconsistent to measure fairly. All weights sum to 100%.</div>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%", borderCollapse:"collapse", fontSize:isMobile?11:13}}>
              <thead>
                <tr style={{background:"#f1f5f9"}}>
                  {["Category","Ingredients / Materials","Exposure","Packaging","Sustainability","Why"].map((h,i)=>(
                    <th key={i} style={{padding:"10px 14px", textAlign:"left", fontWeight:700, color:text, fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em", whiteSpace:"nowrap", borderBottom:`1px solid ${border}`}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  {cat:"Food",         m:"90%", u:"0%",  pk:"10%", s:"0%",  why:"Ingredients are the entire story. Organic food in plastic still scores 2 — packaging is flagged separately."},
                  {cat:"Beverage",     m:"75%", u:"0%",  pk:"25%", s:"0%",  why:"The container leaches into every sip. Plastic bottle is part of the consumption story."},
                  {cat:"Restaurant",   m:"85%", u:"0%",  pk:"10%", s:"5%",  why:"Same logic as food, small sustainability weight for restaurant practices."},
                  {cat:"Supplement",   m:"65%", u:"25%", pk:"10%", s:"0%",  why:"Concentrated daily ingestion — what's in it matters most, plus how it interacts with your body."},
                  {cat:"Beauty",       m:"45%", u:"45%", pk:"5%",  s:"5%",  why:"Leave-on daily skin contact. Materials and exposure are equally important."},
                  {cat:"Toys",         m:"50%", u:"40%", pk:"5%",  s:"5%",  why:"Children put toys in their mouths. Ingestion risk is real."},
                  {cat:"Clothing",     m:"35%", u:"30%", pk:"0%",  s:"35%", why:"Microfiber shedding into waterways gives sustainability real weight. Packaging irrelevant."},
                  {cat:"Accessories",  m:"40%", u:"25%", pk:"0%",  s:"35%", why:"Jewelry touches skin all day. Environmental footprint of fast fashion accessories matters."},
                  {cat:"Home",         m:"30%", u:"45%", pk:"10%", s:"15%", why:"Inhalation and residue contact from cleaners, candles, and rugs is the primary story."},
                  {cat:"Baby",         m:"55%", u:"40%", pk:"5%",  s:"0%",  why:"Developing systems and higher skin absorption. Sustainability is secondary to safety."},
                ].map((row, i) => (
                  <tr key={i} style={{borderBottom:`1px solid ${border}`, background: i%2===0 ? "transparent" : "#fafafa"}}>
                    <td style={{padding:"10px 14px", fontWeight:700, color:text, whiteSpace:"nowrap"}}>{row.cat}</td>
                    <td style={{padding:"10px 14px", color:"#16a34a", fontWeight:700}}>{row.m}</td>
                    <td style={{padding:"10px 14px", color:muted}}>{row.u}</td>
                    <td style={{padding:"10px 14px", color:muted}}>{row.pk}</td>
                    <td style={{padding:"10px 14px", color:muted}}>{row.s}</td>
                    <td style={{padding:"10px 14px", color:muted, fontSize:11, lineHeight:1.5, maxWidth:220}}>{row.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* NOVA processing modifier */}
        <div style={{background:surface, borderRadius:14, border:`1px solid ${border}`, overflow:"hidden", marginBottom:24}}>
          <div style={{padding:"16px 20px", borderBottom:`1px solid ${border}`, background:"#f8fafc"}}>
            <div style={{fontSize:13, fontWeight:700, color:text}}>NOVA Processing Level — applied before substance scoring</div>
            <div style={{fontSize:12, color:muted, marginTop:2}}>The biggest predictor of food risk after specific substances. Ultra-processed formulations (NOVA 4) start with a structural materials penalty regardless of individual ingredient claims.</div>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%", borderCollapse:"collapse", fontSize:isMobile?11:13}}>
              <thead>
                <tr style={{background:"#f1f5f9"}}>
                  {["Level","Description","Examples","Materials baseline"].map((h,i)=>(
                    <th key={i} style={{padding:"10px 14px", textAlign:"left", fontWeight:700, color:text, fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em", borderBottom:`1px solid ${border}`}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  {level:"NOVA 1", desc:"Unprocessed or minimally processed", ex:"Fresh fruit, vegetables, plain oats, eggs, plain yogurt, meat", base:"1-2 — no penalty"},
                  {level:"NOVA 2", desc:"Processed culinary ingredients", ex:"Oils, vinegars, flours, salt, sugar on their own", base:"1-2 — no penalty"},
                  {level:"NOVA 3", desc:"Processed foods", ex:"Canned beans, cheese, cured meats, bread with simple ingredients, fermented foods", base:"2-4 — moderate"},
                  {level:"NOVA 4", desc:"Ultra-processed formulations — industrial ingredients not found in home kitchens", ex:"Breakfast cereals with synthetic dyes, packaged cookies, plant-based meat, most fast food, flavored chips", base:"5+ — structural penalty"},
                ].map((row,i)=>(
                  <tr key={i} style={{borderBottom:`1px solid ${border}`, background:i%2===0?"transparent":"#fafafa"}}>
                    <td style={{padding:"10px 14px", fontWeight:700, color:i===3?"#dc2626":text}}>{row.level}</td>
                    <td style={{padding:"10px 14px", color:muted, fontSize:12}}>{row.desc}</td>
                    <td style={{padding:"10px 14px", color:muted, fontSize:11}}>{row.ex}</td>
                    <td style={{padding:"10px 14px", fontWeight:700, color:i===3?"#dc2626":"#16a34a", fontSize:12}}>{row.base}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sugar penalty */}
        <div style={{background:surface, borderRadius:14, border:`1px solid ${border}`, overflow:"hidden", marginBottom:24}}>
          <div style={{padding:"16px 20px", borderBottom:`1px solid ${border}`, background:"#f8fafc"}}>
            <div style={{fontSize:13, fontWeight:700, color:text}}>Added Sugar Penalty — scored independently of other concerns</div>
            <div style={{fontSize:12, color:muted, marginTop:2}}>WHO recommends less than 25g added sugar per day. Most cereal, snack bars, and beverages are consumed daily — cumulative exposure matters.</div>
          </div>
          <div style={{padding:"16px 20px", display:"flex", flexDirection:"column", gap:8}}>
            {[
              {range:"0–5g added sugar per serving", penalty:"No penalty", color:"#16a34a"},
              {range:"6–10g added sugar per serving", penalty:"Materials +1", color:"#d97706"},
              {range:">10g added sugar per serving", penalty:"Materials +2", color:"#ea580c"},
              {range:">20g added sugar per serving", penalty:"Materials +3 — exceeds half the WHO daily limit in one serving", color:"#dc2626"},
            ].map((row,i)=>(
              <div key={i} style={{display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderRadius:10, background:"#f8fafc", border:`1px solid ${border}`}}>
                <div style={{fontSize:13, color:text}}>{row.range}</div>
                <div style={{fontSize:12, fontWeight:700, color:row.color, flexShrink:0, marginLeft:12}}>{row.penalty}</div>
              </div>
            ))}
          </div>
        </div>

        {/* IARC substance floors - updated */}
        <div style={{background:surface, borderRadius:14, border:`1px solid ${border}`, overflow:"hidden", marginBottom:24}}>
          <div style={{padding:"16px 20px", borderBottom:`1px solid ${border}`, background:"#f8fafc"}}>
            <div style={{fontSize:13, fontWeight:700, color:text}}>IARC Substance Floors — context-sensitive, not a blanket rule</div>
            <div style={{fontSize:12, color:muted, marginTop:2}}>IARC classifies the strength of evidence, not the dose. A trace of glyphosate in a multi-grain product is not the same as glyphosate as the primary ingredient in a children's cereal.</div>
          </div>
          <div style={{padding:"16px 20px", display:"flex", flexDirection:"column", gap:12}}>
            {[
              {
                tier:"IARC Group 1 — Known carcinogen as primary ingredient",
                floor:"Materials 7-8 minimum",
                color:"#dc2626", bg:"#fef2f2", border_:"#fecaca",
                examples:"Nitrites in hot dogs/bacon/deli meat. Ethanol in all alcoholic beverages.",
                note:"The science says: causes cancer in humans. No safe level per WHO."
              },
              {
                tier:"IARC Group 2A — Probable carcinogen as PRIMARY ingredient with confirmed residues",
                floor:"Materials 6-7",
                color:"#d97706", bg:"#fffbeb", border_:"#fde68a",
                examples:"Glyphosate in Cheerios/Quaker oats (EWG confirmed above child threshold — oats are the primary ingredient).",
                note:"Context: oats as primary ingredient in a children's daily cereal is different from oats as one of 7 grains."
              },
              {
                tier:"IARC Group 2A — Probable carcinogen as MINOR ingredient in otherwise clean product",
                floor:"Materials +1 only, flagged as MEDIUM",
                color:"#ca8a04", bg:"#fefce8", border_:"#fef08a",
                examples:"Glyphosate in Kashi (oats are 1 of 7+ whole grains, Non-GMO verified, high fiber, no dyes).",
                note:"Dose and dilution matter. The IARC classification applies to the substance, not the product."
              },
              {
                tier:"IARC Group 2B — Possible carcinogen confirmed in product",
                floor:"Materials +1-2, flagged as concern",
                color:"#059669", bg:"#f0fdf4", border_:"#bbf7d0",
                examples:"BHA, TBHQ, titanium dioxide (EU food ban), caramel color IV, potassium bromate, aspartame.",
                note:"Possible evidence — worth flagging but not the same severity as confirmed carcinogens."
              },
              {
                tier:"Speculative — hedged language only",
                floor:"No floor applied",
                color:"#6b7280", bg:"#f8fafc", border_:border,
                examples:"\"May contain,\" \"possible trace,\" \"could include\" — stripped before floors are checked.",
                note:"Speculation does not warrant a penalty regardless of how dangerous the theoretical substance is."
              },
            ].map((item, i) => (
              <div key={i} style={{background:item.bg, border:`1.5px solid ${item.border_}`, borderRadius:12, padding:"14px 16px"}}>
                <div style={{display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, flexWrap:"wrap", marginBottom:6}}>
                  <div style={{fontSize:13, fontWeight:700, color:item.color, flex:1}}>{item.tier}</div>
                  <div style={{fontSize:12, fontWeight:700, color:item.color, background:"white", padding:"2px 10px", borderRadius:10, border:`1px solid ${item.border_}`, whiteSpace:"nowrap", flexShrink:0}}>{item.floor}</div>
                </div>
                <div style={{fontSize:12, color:"#374151", lineHeight:1.6, marginBottom:4}}><strong>Examples:</strong> {item.examples}</div>
                <div style={{fontSize:11, color:item.color, fontStyle:"italic"}}>{item.note}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Positive ceilings */}
        <div style={{background:surface, borderRadius:14, border:`1px solid ${border}`, overflow:"hidden", marginBottom:24}}>
          <div style={{padding:"16px 20px", borderBottom:`1px solid ${border}`, background:"#f8fafc"}}>
            <div style={{fontSize:13, fontWeight:700, color:text}}>Positive Ceilings — clean products are protected from over-scoring</div>
            <div style={{fontSize:12, color:muted, marginTop:2}}>We have 113 substance floors that push risky products up. These ceilings prevent genuinely clean products from being over-penalised by a paranoid AI. Applied server-side — the AI cannot override them.</div>
          </div>
          <div style={{padding:"16px 20px", display:"flex", flexDirection:"column", gap:10}}>
            {[
              {label:"USDA Organic certified + no confirmed dangerous substances", cap:"Final score cannot exceed 3", color:"#16a34a", note:"Organic certification prohibits synthetic pesticides, GMOs, and most synthetic additives. If no dangerous substance floors fired, the product is genuinely clean."},
              {label:"Non-GMO Project Verified + no synthetic dyes + no synthetic preservatives", cap:"Final score cannot exceed 4", color:"#059669", note:"Conventionally farmed but free of the worst additives. Kashi GO, clean conventional snacks, and similar products land here."},
            ].map((item,i)=>(
              <div key={i} style={{padding:"12px 16px", background:"#f0fdf4", borderRadius:12, border:`1px solid ${"#bbf7d0"}`}}>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, marginBottom:6, flexWrap:"wrap"}}>
                  <div style={{fontSize:13, fontWeight:700, color:item.color, flex:1}}>{item.label}</div>
                  <div style={{fontSize:12, fontWeight:700, color:"#fff", background:item.color, padding:"3px 12px", borderRadius:10, flexShrink:0}}>{item.cap}</div>
                </div>
                <div style={{fontSize:12, color:muted, lineHeight:1.5}}>{item.note}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Child vulnerability system */}
        <div style={{background:surface, borderRadius:14, border:`1px solid ${border}`, overflow:"hidden", marginBottom:24}}>
          <div style={{padding:"16px 20px", borderBottom:`1px solid ${border}`, background:"#f8fafc"}}>
            <div style={{fontSize:13, fontWeight:700, color:text}}>Child Vulnerability System</div>
            <div style={{fontSize:12, color:muted, marginTop:2}}>Children have thinner skin, developing organ systems, and lower body weight — meaning a higher effective dose per kilogram. Every score can be viewed through a child safety lens.</div>
          </div>
          <div style={{padding:"16px 20px"}}>
            <div style={{display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:12, marginBottom:16}}>
              {[
                {sub:"Petroleum dyes (Red 40, Yellow 5/6, Blue 1)", bump:"+2", why:"Linked to ADHD and hyperactivity in children — McCann et al., The Lancet 2007"},
                {sub:"PFAS / forever chemicals", bump:"+2", why:"Disrupts immune and hormonal development — CDC child health priority"},
                {sub:"Phthalates (DEHP, DBP)", bump:"+2", why:"Disrupts reproductive development — most critical in early childhood (Swan 2021)"},
                {sub:"Flame retardants (PBDE, TCEP)", bump:"+2", why:"Neurotoxicity disproportionately affects developing brains (Stapleton 2011)"},
                {sub:"Glyphosate residue", bump:"+1", why:"EWG child threshold is lower than adult — body weight dose adjustment"},
                {sub:"Synthetic fragrance", bump:"+1", why:"Developing endocrine systems more sensitive to fragrance phthalates"},
                {sub:"Parabens", bump:"+1", why:"Hormone mimicry — developing endocrine systems more vulnerable"},
                {sub:"BPA / BPS / BPF", bump:"+2", why:"Endocrine disruption most harmful during developmental windows"},
              ].map((item, i) => (
                <div key={i} style={{background:"#f8fafc", borderRadius:10, padding:"10px 14px", border:`1px solid ${border}`}}>
                  <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4}}>
                    <div style={{fontSize:12, fontWeight:700, color:text}}>{item.sub}</div>
                    <div style={{fontSize:12, fontWeight:800, color:"#dc2626", background:"#fef2f2", padding:"1px 8px", borderRadius:8, flexShrink:0, marginLeft:8}}>{item.bump}</div>
                  </div>
                  <div style={{fontSize:11, color:muted, lineHeight:1.5}}>{item.why}</div>
                </div>
              ))}
            </div>
            <div style={{fontSize:12, color:muted, background:"#f0fdf4", borderRadius:10, padding:"10px 14px", border:`1px solid ${"#bbf7d0"}`}}>
              <strong style={{color:"#16a34a"}}>How to use it:</strong> Tap the child safety toggle on any result to see the child-adjusted score. Child products (Honey Nut Cheerios, Pampers, baby lotions) are auto-detected and show a prompt automatically.
            </div>
          </div>
        </div>

        {/* Consistency checks */}
        <div style={{background:surface, borderRadius:14, border:`1px solid ${border}`, overflow:"hidden", marginBottom:24}}>
          <div style={{padding:"16px 20px", borderBottom:`1px solid ${border}`, background:"#f8fafc"}}>
            <div style={{fontSize:13, fontWeight:700, color:text}}>Hallucination Guards — 4 rules that run after every score</div>
            <div style={{fontSize:12, color:muted, marginTop:2}}>The AI scores dimensions. These rules catch cases where those scores contradict the AI's own reasoning.</div>
          </div>
          <div style={{padding:"16px 20px", display:"flex", flexDirection:"column", gap:10}}>
            {[
              {rule:"Label contradiction ceiling", detail:"If the AI's own label says \"inert,\" \"zero leaching,\" or \"minimal exposure\" but scored that dimension 6+, the score is capped at 4. The AI cannot contradict itself."},
              {rule:"Dimension spread sanity check", detail:"If Materials scores 1-2 but the formula would produce a final score of 7+, the output is flagged and recomputed. A clean-ingredient product cannot score dangerous."},
              {rule:"Confidence-linked ceiling", detail:"Low confidence means the AI doesn't know enough to flag confirmed harmful substances. A low-confidence result cannot score above 6 — directional estimates only."},
              {rule:"Inert material ceiling", detail:"Glass, borosilicate, ceramic, and stainless steel cannot score above 3 on Materials. Hot water through glass has zero leaching risk. This is non-negotiable."},
            ].map((item, i) => (
              <div key={i} style={{display:"flex", gap:14, padding:"12px 14px", background:"#f8fafc", borderRadius:10, border:`1px solid ${border}`}}>
                <div style={{width:24, height:24, borderRadius:"50%", background:"#052e16", color:"#4ade80", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:800, flexShrink:0}}>{i+1}</div>
                <div>
                  <div style={{fontSize:13, fontWeight:700, color:text, marginBottom:3}}>{item.rule}</div>
                  <div style={{fontSize:12, color:muted, lineHeight:1.6}}>{item.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer note */}
      <div style={{background:"#f8fafc", borderRadius:14, padding:"20px 24px", border:`1px solid ${border}`}}>
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
// ── AUTH MODAL ────────────────────────────────────────────────
const AuthModal = ({onClose, onAuth, onSetName}) => {
  const [mode,     setMode]     = useState("signin"); // signin | signup | reset
  const [email,    setEmail]    = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [success,  setSuccess]  = useState(null);

  const surface = "var(--cream)";
  const fieldBg = "var(--cream-light)";
  const bd      = "var(--rule-strong)";
  const tx      = "var(--ink)";
  const mt      = "var(--ink-soft)";

  const validateNickname = (n) => {
    const t = n.trim();
    if (t.length < 2 || t.length > 30) return "Nickname must be 2-30 characters.";
    if (t.includes("@")) return "Use a nickname, not your email.";
    return null;
  };

  const submit = async () => {
    if (!email.includes("@") || (mode !== "reset" && password.length < 6)) {
      setError(mode === "reset" ? "Enter a valid email." : "Enter a valid email and a password of at least 6 characters.");
      return;
    }
    if (mode === "signup") {
      const nickErr = validateNickname(nickname);
      if (nickErr) { setError(nickErr); return; }
    }
    setLoading(true); setError(null); setSuccess(null);
    try {
      if (mode === "signup") {
        const { data, error: e } = await supabase.auth.signUp({ email, password });
        if (e) throw e;
        const nick = nickname.trim();
        if (onSetName) onSetName(nick);
        if (data?.user) onAuth(data.user);
        onClose();
      } else if (mode === "signin") {
        const { data, error: e } = await supabase.auth.signInWithPassword({ email, password });
        if (e) throw e;
        onAuth(data.user);
        onClose();
      } else if (mode === "reset") {
        const { error: e } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: "https://partiqule.com/reset-password",
        });
        if (e) throw e;
        setSuccess("Password reset email sent. Check your inbox.");
      }
    } catch(e) {
      setError(e.message || "Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div style={{position:"fixed", inset:0, zIndex:9998, background:"rgba(26,31,21,0.55)", display:"flex", alignItems:"center", justifyContent:"center", padding:16}}
      onClick={onClose}>
      <div style={{
        background: surface,
        borderRadius: "22px 18px 24px 20px / 20px 24px 18px 22px",
        padding:"32px 28px", width:"100%", maxWidth:400,
        border: `1px solid ${"var(--rule)"}`,
        position:"relative",
        boxShadow: "0 20px 40px rgba(26,31,21,0.18)",
      }} onClick={e=>e.stopPropagation()}>

        <button onClick={onClose} style={{position:"absolute", top:16, right:16, background:"none", border:"none", cursor:"pointer", fontSize:22, color:mt, lineHeight:1}}>×</button>

        <div style={{
          fontFamily:"'DM Sans', system-ui, sans-serif",
          fontSize:10, letterSpacing:"0.22em", color:"var(--moss)",
          textTransform:"uppercase", fontWeight:500, marginBottom:14,
          display:"flex", alignItems:"center", gap:10,
        }}>
          <span style={{display:"inline-block", width:22, height:1, background:"var(--moss)", opacity:0.7}}/>
          Partiqule
        </div>

        <h2 style={{fontFamily:"'Lora', Georgia, serif", fontWeight:400, fontSize:28, color:tx, margin:"0 0 10px", letterSpacing:"-0.015em", lineHeight:1.08}}>
          {mode === "signup" ? "Make it yours." : mode === "reset" ? "Reset your password." : "Welcome back."}
        </h2>
        <p style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:14, color:mt, margin:"0 0 22px", lineHeight:1.55}}>
          {mode === "signup" ? "Save your shelf and never lose it." : mode === "reset" ? "We'll send you a reset link." : "Pick up where you left off."}
        </p>

        {error   && <div style={{background:"var(--score-red-soft)", border:"1px solid var(--score-red)", borderRadius:"12px 16px 14px 18px / 16px 12px 18px 14px", padding:"10px 14px", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13, color:"var(--score-red)", marginBottom:14}}>{error}</div>}
        {success && <div style={{background:"var(--score-green-soft)", border:"1px solid var(--score-green)", borderRadius:"12px 16px 14px 18px / 16px 12px 18px 14px", padding:"10px 14px", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13, color:"var(--moss)", marginBottom:14}}>{success}</div>}

        <div style={{display:"flex", flexDirection:"column", gap:12}}>
          <input type="email" placeholder="Email address" value={email} onChange={e=>setEmail(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&submit()}
            style={{padding:"11px 14px", borderRadius:"14px 10px 15px 12px / 10px 15px 12px 14px", border:`1px solid ${bd}`, background:fieldBg, color:tx, fontSize:14, fontFamily:"'DM Sans', system-ui, sans-serif", outline:"none"}}/>
          {mode === "signup" && (
            <input type="text" placeholder="Nickname (how I'll greet you)" value={nickname} onChange={e=>setNickname(e.target.value)} maxLength={30}
              onKeyDown={e=>e.key==="Enter"&&submit()}
              style={{padding:"11px 14px", borderRadius:"14px 10px 15px 12px / 10px 15px 12px 14px", border:`1px solid ${bd}`, background:fieldBg, color:tx, fontSize:14, fontFamily:"'DM Sans', system-ui, sans-serif", outline:"none"}}/>
          )}
          {mode !== "reset" && (
            <input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&submit()}
              style={{padding:"11px 14px", borderRadius:"14px 10px 15px 12px / 10px 15px 12px 14px", border:`1px solid ${bd}`, background:fieldBg, color:tx, fontSize:14, fontFamily:"'DM Sans', system-ui, sans-serif", outline:"none"}}/>
          )}
          <button onClick={submit} disabled={loading}
            style={{padding:"13px 16px", borderRadius:"22px 18px 24px 20px / 20px 24px 18px 22px", background:"var(--moss)", color:"var(--ivory)", border:"none", fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:500, fontSize:14, cursor:loading?"default":"pointer", opacity:loading?0.7:1, letterSpacing:"0.005em"}}>
            {loading ? "Please wait..." : mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}
          </button>
        </div>

        <div style={{marginTop:22, textAlign:"center", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13, color:mt}}>
          {mode === "signin" && <>
            <span style={{cursor:"pointer", color:"var(--moss)", fontWeight:500}} onClick={()=>{setMode("signup"); setError(null); setSuccess(null);}}>Create an account</span>
            <span style={{margin:"0 10px", opacity:0.4}}>·</span>
            <span style={{cursor:"pointer", color:mt}} onClick={()=>{setMode("reset"); setError(null); setSuccess(null);}}>Forgot password?</span>
          </>}
          {mode === "signup" && <>
            Already have an account?{" "}
            <span style={{cursor:"pointer", color:"var(--moss)", fontWeight:500}} onClick={()=>{setMode("signin"); setError(null); setSuccess(null);}}>Sign in</span>
          </>}
          {mode === "reset" && <>
            <span style={{cursor:"pointer", color:"var(--moss)", fontWeight:500}} onClick={()=>{setMode("signin"); setError(null); setSuccess(null);}}>Back to sign in</span>
          </>}
        </div>
      </div>
    </div>
  );
};

// NICKNAME PROMPT — shown to existing users on sign-in when displayName is missing.
// No dismiss, no skip. Save is required before proceeding.
const NicknamePromptModal = ({onSave}) => {
  const [value, setValue] = useState("");
  const [err, setErr] = useState(null);
  const save = () => {
    const t = value.trim();
    if (t.length < 2 || t.length > 30) { setErr("Nickname must be 2-30 characters."); return; }
    if (t.includes("@")) { setErr("Use a nickname, not your email."); return; }
    onSave(t);
  };
  return (
    <div style={{position:"fixed", inset:0, zIndex:9998, background:"rgba(26,31,21,0.55)", display:"flex", alignItems:"center", justifyContent:"center", padding:16}}>
      <div style={{
        background:"var(--cream)",
        borderRadius:"22px 18px 24px 20px / 20px 24px 18px 22px",
        padding:"32px 28px", width:"100%", maxWidth:400,
        border:"1px solid var(--rule)",
        boxShadow:"0 20px 40px rgba(26,31,21,0.18)",
      }}>
        <div style={{
          fontFamily:"'DM Sans', system-ui, sans-serif",
          fontSize:10, letterSpacing:"0.22em", color:"var(--moss)",
          textTransform:"uppercase", fontWeight:500, marginBottom:14,
          display:"flex", alignItems:"center", gap:10,
        }}>
          <span style={{display:"inline-block", width:22, height:1, background:"var(--moss)", opacity:0.7}}/>
          One quick thing
        </div>
        <h2 style={{fontFamily:"'Lora', Georgia, serif", fontWeight:400, fontSize:28, color:"var(--ink)", margin:"0 0 10px", letterSpacing:"-0.015em", lineHeight:1.1}}>What should I call you?</h2>
        <p style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:14, color:"var(--ink-soft)", margin:"0 0 22px", lineHeight:1.55}}>Pick something short. I'll use it when I greet you.</p>
        {err && <div style={{background:"var(--score-red-soft)", border:"1px solid var(--score-red)", borderRadius:"12px 16px 14px 18px / 16px 12px 18px 14px", padding:"10px 14px", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13, color:"var(--score-red)", marginBottom:14}}>{err}</div>}
        <input type="text" autoFocus value={value} onChange={e=>{setValue(e.target.value); if(err) setErr(null);}} onKeyDown={e=>e.key==="Enter"&&save()} placeholder="e.g. Sarah, Mom, Coach..." maxLength={30}
          style={{width:"100%", padding:"12px 14px", borderRadius:"14px 10px 15px 12px / 10px 15px 12px 14px", fontSize:15, fontFamily:"'DM Sans', system-ui, sans-serif", border:"1px solid var(--rule-strong)", background:"var(--cream-light)", color:"var(--ink)", outline:"none", marginBottom:14, boxSizing:"border-box"}}/>
        <button onClick={save} style={{width:"100%", padding:"13px 16px", borderRadius:"22px 18px 24px 20px / 20px 24px 18px 22px", background:"var(--moss)", color:"var(--ivory)", border:"none", fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:500, fontSize:14, cursor:"pointer", letterSpacing:"0.005em"}}>
          Save
        </button>
      </div>
    </div>
  );
};

const PrivacyPage = ({text, muted, surface, border, isMobile}) => {
  const sections = [
    { title:"1. Who we are", body:"Partiqule is a product health scanner operated by Partiqule Inc. We help people understand what is in the products they use every day. You can reach us at paul@partiqule.com." },
    { title:"2. What information we collect", body:"Partiqule collects the minimum information needed to provide the service.\n\nScan data: When you scan a product, we send the product name or image to our AI analysis service (Anthropic). We do not store a record of scans associated with you unless you create an account.\n\nEmail address: If you choose to save your scan history, we collect your email address. We use this only to associate your scan history with your account and to notify you of important product recalls or reformulations. We do not send marketing emails without your explicit consent.\n\nUsage data: We collect anonymous analytics (page views, scan counts, affiliate clicks) using Plausible Analytics, which is privacy-preserving and does not use cookies or track individuals.\n\nDevice data: We do not collect device identifiers, location data, or any data beyond what is described above." },
    { title:"3. How we use your information", body:"We use your information only to:\n\n• Provide and improve the Partiqule service\n• Associate your scan history with your account (if you create one)\n• Notify you of product recalls or significant reformulations for products you have scanned\n• Understand aggregate usage patterns to improve the product\n\nWe do not sell your data. We do not share your data with advertisers. We do not use your data for profiling or targeted advertising." },
    { title:"4. Affiliate links", body:"Partiqule earns a commission when you purchase products through affiliate links. These are clearly marked with an #ad disclosure. Affiliate relationships have no influence on our scoring or recommendations — scores are generated independently by our AI analysis system." },
    { title:"5. Third-party services", body:"Partiqule uses the following third-party services to operate:\n\n• Anthropic — AI analysis of product queries. Queries are processed per Anthropic's privacy policy.\n• Railway — Server hosting. Your requests pass through Railway infrastructure.\n• Vercel — Frontend hosting.\n• Plausible Analytics — Anonymous, cookieless usage analytics.\n• Amazon Associates — Affiliate product links.\n\nWe do not use Google Analytics, Facebook Pixel, or any advertising trackers." },
    { title:"6. Data retention", body:"Scan history stored in your browser (localStorage) persists until you clear it or use the Clear History function in the app.\n\nIf you create an account, your scan history is stored on our servers and retained until you delete your account.\n\nEmail addresses are retained until you request deletion." },
    { title:"7. Your rights", body:"You have the right to:\n\n• Access the data we hold about you\n• Request deletion of your account and associated data\n• Opt out of any email communications\n\nTo exercise any of these rights, email paul@partiqule.com. We will respond within 30 days." },
    { title:"8. Children", body:"Partiqule is not directed at children under 13. We do not knowingly collect personal information from children under 13." },
    { title:"9. Changes to this policy", body:"We may update this Privacy Policy from time to time. We will notify registered users of material changes by email. Continued use of Partiqule after changes constitutes acceptance of the updated policy." },
    { title:"10. Contact", body:"Questions about privacy? Email paul@partiqule.com." },
  ];
  return (
    <div style={{maxWidth:720, margin:"0 auto", padding:isMobile?"24px 16px 60px":"48px 40px 80px"}}>
      <h1 style={{fontFamily:"'Lora', Georgia, serif", fontWeight:400, fontSize:isMobile?30:40, color:text, margin:"0 0 8px", letterSpacing:"-0.015em"}}>Privacy Policy</h1>
      <p style={{fontSize:14, color:muted, marginBottom:40}}>Last updated: April 2026</p>
      {sections.map((s, i) => (
        <div key={i} style={{marginBottom:32, paddingBottom:32, borderBottom: i < sections.length-1 ? `1px solid ${border}` : "none"}}>
          <h2 style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:700, fontSize:18, color:text, margin:"0 0 12px"}}>{s.title}</h2>
          {s.body.split("\n\n").map((para, j) => (
            <p key={j} style={{fontSize:15, color:muted, lineHeight:1.8, margin:"0 0 12px", whiteSpace:"pre-line"}}>{para}</p>
          ))}
        </div>
      ))}
    </div>
  );
};

const TermsPage = ({text, muted, surface, border, isMobile}) => {
  const sections = [
    { title:"1. Overview", body:"Partiqule provides product health information and exposure scores to help you make more informed decisions. By using Partiqule, you agree to these Terms of Service." },
    { title:"2. Not medical advice", body:"Partiqule's scores, analyses, and recommendations are provided for informational and educational purposes only. They are based on available peer-reviewed research and AI analysis, and are not medical, health, or safety advice.\n\nYou should not rely on Partiqule as a substitute for professional medical, scientific, or nutritional guidance. Use of the platform is at your own risk." },
    { title:"3. How our scoring works", body:"Our product scores are generated using a two-pass AI analysis system and research-based weighting factors covering material composition, usage exposure, packaging and sustainability.\n\nWhile we aim for accuracy and transparency, we do not guarantee that any score, analysis, or recommendation is complete, accurate, or up to date. Product formulations change. New research emerges. Treat scores as a starting point for your own research." },
    { title:"4. Affiliate disclosure", body:"Some links on Partiqule are affiliate links. We may earn a commission if you make a purchase through them, at no additional cost to you.\n\nAffiliate relationships do not influence our scoring or recommendations. No brand can pay to change a score." },
    { title:"5. No warranties", body:"Partiqule is provided as-is and as-available. We make no warranties, express or implied, including but not limited to accuracy or completeness of information, fitness for a particular purpose, or reliability of the service." },
    { title:"6. Limitation of liability", body:"To the fullest extent permitted by law, Partiqule and its creators shall not be liable for any indirect, incidental, or consequential damages resulting from your use of the service, decisions made based on Partiqule content, or third-party products or services." },
    { title:"7. Third-party services", body:"Partiqule links to third-party websites including retailers and research sources. We are not responsible for their content, products, or privacy practices.\n\nOur analysis is powered in part by Anthropic's AI. By using Partiqule, you acknowledge that product queries are processed by Anthropic per their usage policies." },
    { title:"8. Acceptable use", body:"You agree not to misuse or attempt to disrupt the service, attempt to reverse engineer or manipulate scoring systems, scrape or mass-query the API, or use the platform for unlawful purposes." },
    { title:"9. Intellectual property", body:"All content, branding, scoring methodology, and product database on Partiqule are owned by Partiqule and may not be copied, reproduced, or distributed without permission." },
    { title:"10. Changes to these terms", body:"We may update these Terms from time to time. Continued use of Partiqule after changes means you accept the updated Terms. Material changes will be communicated to registered users by email." },
    { title:"11. Governing law", body:"These Terms are governed by the laws of the State of California, United States, without regard to conflict of law principles." },
    { title:"12. Contact", body:"Questions about these Terms? Email paul@partiqule.com." },
  ];
  return (
    <div style={{maxWidth:720, margin:"0 auto", padding:isMobile?"24px 16px 60px":"48px 40px 80px"}}>
      <h1 style={{fontFamily:"'Lora', Georgia, serif", fontWeight:400, fontSize:isMobile?30:40, color:text, margin:"0 0 8px", letterSpacing:"-0.015em"}}>Terms of Service</h1>
      <p style={{fontSize:14, color:muted, marginBottom:40}}>Last updated: April 2026</p>
      {sections.map((s, i) => (
        <div key={i} style={{marginBottom:32, paddingBottom:32, borderBottom: i < sections.length-1 ? `1px solid ${border}` : "none"}}>
          <h2 style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:700, fontSize:18, color:text, margin:"0 0 12px"}}>{s.title}</h2>
          {s.body.split("\n\n").map((para, j) => (
            <p key={j} style={{fontSize:15, color:muted, lineHeight:1.8, margin:"0 0 12px", whiteSpace:"pre-line"}}>{para}</p>
          ))}
        </div>
      ))}
    </div>
  );
};

// ── AUTO-SCROLL HOOK ──────────────────────────────────────────
const useAutoScroll = (ref, intervalMs, itemWidth, itemCount) => {
  const [paused, setPaused] = useState(false);
  const timerRef = useRef(null);
  const indexRef = useRef(0);
  useEffect(()=>{
    if(paused||itemCount<=1)return;
    timerRef.current=setInterval(()=>{
      indexRef.current=(indexRef.current+1)%itemCount;
      if(ref.current)ref.current.scrollTo({left:indexRef.current*itemWidth,behavior:"smooth"});
    },intervalMs);
    return()=>clearInterval(timerRef.current);
  },[paused,itemCount,intervalMs,itemWidth]);
  return {pause:()=>setPaused(true),resume:()=>setPaused(false)};
};

// ── FOR YOU INTELLIGENCE CARDS ────────────────────────────────
// ── AUDIT GRADE + COMPLETION ──────────────────────────────────


// ── AUDIT SESSION ─────────────────────────────────────────────


// ── LIFESTYLE SCORE ───────────────────────────────────────────
const computeLifestyleScore = (history) => {
  if(!history||history.length<3)return null;
  const seen=new Set();const unique=[];
  [...history].sort((a,b)=>new Date(b.scannedAt)-new Date(a.scannedAt)).forEach(h=>{if(!seen.has(h.product_name)){seen.add(h.product_name);unique.push(h);}});
  const sample=unique.slice(0,50);
  const avg=sample.reduce((s,h)=>s+(h.overall_score||h.score||0),0)/sample.length;
  const previous=unique.length>8?(()=>{const older=unique.slice(5,50);return older.reduce((s,h)=>s+(h.overall_score||h.score||0),0)/older.length;})():null;
  const current=parseFloat(avg.toFixed(1));const prev=previous?parseFloat(previous.toFixed(1)):null;
  const trend=prev?current<prev?"improving":current>prev?"declining":"stable":"stable";
  const delta=prev?parseFloat(Math.abs(current-prev).toFixed(1)):null;
  const catScores={};const catCounts={};
  sample.forEach(h=>{const c=h.category||"other";if(!catScores[c]){catScores[c]=0;catCounts[c]=0;}catScores[c]+=(h.overall_score||h.score||0);catCounts[c]++;});
  const catAvgs=Object.entries(catScores).map(([cat,total])=>({cat,avg:parseFloat((total/catCounts[cat]).toFixed(1)),count:catCounts[cat]})).filter(c=>c.count>=2).sort((a,b)=>b.avg-a.avg);
  const worst=catAvgs[0]||null;
  const CL={food:"Pantry",food_beverage:"Pantry",beverage:"Pantry",snack:"Pantry",personal_care:"Bathroom",skincare:"Bathroom",cleaning:"Cleaning",home:"Home",clothing:"Closet",baby:"Nursery",toy:"Nursery",supplement:"Supplements",restaurant:"Dining"};
  return {current,previous:prev,trend,delta,productCount:sample.length,worstCategory:worst?{label:CL[worst.cat]||worst.cat,avg:worst.avg}:null};
};

const FeedPage = ({liveIntelCards, staticCards, history, surface, border, text, muted, isMobile, setPage, setResult, setQuery, analyze}) => {
  const [filter, setFilter] = useState("all");
  const allCards = [
    ...(liveIntelCards||[]).map(card=>{
      const uc=history?.length?history.flatMap(h=>[...(h.harmful_chemicals||[]),...(h.concerns||[]).map(c=>typeof c==="string"?c:c.concern||""),h.summary||""]).join(" ").toLowerCase():"";
      const cats=new Set((history||[]).map(h=>h.category));
      const im=(card.ingredient_triggers||[]).some(t=>uc.includes(t.toLowerCase().trim()));
      const cm=(card.category_triggers||[]).some(c=>cats.has(c));
      const ap=history?.filter(h=>{const t=[...(h.harmful_chemicals||[]),...(h.concerns||[]).map(c=>typeof c==="string"?c:c.concern||""),h.summary||""].join(" ").toLowerCase();return(card.ingredient_triggers||[]).some(tr=>t.includes(tr.toLowerCase()));}).map(h=>h.product_name).filter((v,i,a)=>a.indexOf(v)===i).slice(0,3)||[];
      return {...card,cardType:"live",isPersonal:im||cm,affectedProducts:ap};
    }),
    ...(staticCards||[]).filter(c=>["eu_banned","pattern","iarc","high_concern","swap_pending"].includes(c.type)).map(card=>({...card,cardType:"insight",isPersonal:true,affectedProducts:[],source_name:"Your scan history"})),
  ].sort((a,b)=>{if(a.isPersonal&&!b.isPersonal)return -1;if(!a.isPersonal&&b.isPersonal)return 1;return(b.priority||5)-(a.priority||5);});
  const FILTERS=[{id:"all",label:"All"},{id:"yours",label:"Affects you"},{id:"food",label:"Food"},{id:"personal_care",label:"Beauty"},{id:"clothing",label:"Clothing"},{id:"home",label:"Home"},{id:"recall",label:"Recalls"}];
  const filtered=allCards.filter(card=>{if(filter==="all")return true;if(filter==="yours")return card.isPersonal;if(filter==="recall")return card.label?.toLowerCase().includes("recall");return(card.category_triggers||[]).includes(filter)||(card.type||"").includes(filter);});
  const handleCardTap=(card)=>{if(card.cardType==="live"&&card.action_url)window.open(card.action_url,"_blank");else if(card.actionPage==="history")setPage("history");else if(card.actionPage==="result"&&card.productName){const hi=history?.find(h=>h.product_name===card.productName);if(hi){setResult(hi);setPage("home");}else{setQuery(card.productName);analyze(card.productName);}}};
  const sc=(s)=>!s?muted:s<=3?"#16a34a":s<=5?"#d97706":"#dc2626";
  return (
    <div style={{maxWidth:700,margin:"0 auto",padding:isMobile?"24px 0 80px":"48px 0 80px"}}>
      <div style={{padding:`0 ${isMobile?"16px":"40px"}`,marginBottom:20}}>
        <div style={{fontSize:11,fontWeight:700,color:"#16a34a",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6}}>Health intelligence</div>
        <h1 style={{fontFamily:"'Lora', Georgia, serif",fontWeight:400,fontSize:isMobile?30:38,color:text,margin:"0 0 4px",letterSpacing:"-0.015em"}}>Your <span style={{color:"var(--moss)"}}>feed</span></h1>
        <p style={{fontSize:14,color:muted,margin:0}}>Safety findings, regulatory alerts, and insights from your scan history</p>
      </div>
      <div style={{display:"flex",gap:8,overflowX:"auto",scrollbarWidth:"none",padding:`0 ${isMobile?"16px":"40px"}`,marginBottom:20,paddingBottom:4}}>
        {FILTERS.map(f=>(
          <button key={f.id} onClick={()=>setFilter(f.id)} style={{flexShrink:0,padding:"6px 14px",borderRadius:20,border:`1px solid ${filter===f.id?"#16a34a":("#e5e7eb")}`,background:filter===f.id?("#f0fdf4"):"none",color:filter===f.id?"#16a34a":muted,fontWeight:filter===f.id?700:400,fontSize:13,cursor:"pointer",whiteSpace:"nowrap"}}>
            {f.label}{f.id==="yours"&&<span style={{marginLeft:4,fontSize:11,background:filter==="yours"?"#16a34a":("#e5e7eb"),color:filter==="yours"?"#fff":muted,borderRadius:10,padding:"1px 6px"}}>{allCards.filter(c=>c.isPersonal).length}</span>}
          </button>
        ))}
      </div>
      {filtered.length===0?(
        <div style={{textAlign:"center",padding:"60px 20px",color:muted}}><div style={{fontSize:16,fontWeight:600,color:text,marginBottom:8}}>{filter==="yours"?"No findings match your scanned products yet":"No cards in this category yet"}</div><div style={{fontSize:13,lineHeight:1.6}}>{filter==="yours"?"Scan more products and findings will appear here when they match something you own.":"Check back soon — the feed updates automatically."}</div></div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:0}}>
          {filtered.map((card,i)=>(
            <div key={card.id||i} onClick={()=>handleCardTap(card)} style={{padding:`16px ${isMobile?"16px":"40px"}`,borderBottom:`1px solid ${"#f1f5f9"}`,cursor:card.action_url||card.actionPage||card.productName?"pointer":"default",background:card.isPersonal?("#fafff9"):"transparent"}}>
              {card.isPersonal&&<div style={{fontSize:10,fontWeight:700,color:"#16a34a",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6,display:"flex",alignItems:"center",gap:6}}><div style={{width:6,height:6,borderRadius:"50%",background:"#16a34a",flexShrink:0}}/>Affects your products{card.affectedProducts?.length>0&&<span style={{color:muted,fontWeight:400,textTransform:"none",letterSpacing:0}}> — {card.affectedProducts.slice(0,2).join(", ")}{card.affectedProducts.length>2?` +${card.affectedProducts.length-2} more`:""}</span>}</div>}
              <div style={{display:"inline-block",fontSize:10,fontWeight:700,color:card.label_color||card.labelColor||"#d97706",background:`${card.label_color||card.labelColor||"#d97706"}18`,borderRadius:20,padding:"2px 8px",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.06em"}}>{card.label}</div>
              <div style={{fontSize:15,fontWeight:700,color:text,marginBottom:4,lineHeight:1.4}}>{card.headline}</div>
              <div style={{fontSize:13,color:muted,lineHeight:1.5,marginBottom:8}}>{card.body}</div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                <div style={{fontSize:11,color:muted,display:"flex",alignItems:"center",gap:6}}>{card.source_name&&<span>{card.source_name}</span>}{card.created_at&&<><span style={{opacity:0.4}}>·</span><span>{(()=>{const d=new Date(card.created_at);const dd=Math.floor((Date.now()-d)/(1000*60*60*24));return dd===0?"Today":dd===1?"Yesterday":`${dd} days ago`;})()}</span></>}</div>
                {(card.action_url||card.action_text||card.action||card.actionPage)&&<span style={{fontSize:12,fontWeight:700,color:card.label_color||card.labelColor||"#16a34a",whiteSpace:"nowrap",flexShrink:0}}>{card.action_text||card.action||"Learn more"} →</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      {filtered.length>0&&<div style={{textAlign:"center",padding:"32px 20px 0",fontSize:12,color:muted}}>Feed updates automatically from trusted health and regulatory sources worldwide.</div>}
    </div>
  );
};

// ── SHELF STRIP ────────────────────────────────────────────────
// Placeholder hand-drawn illustrations by category.
// Paul will swap these for proper illustrations later.
const SHELF_TILE_SHAPES = [
  "12px 14px 10px 15px / 14px 10px 15px 12px",
  "14px 10px 15px 12px / 10px 15px 12px 14px",
  "10px 15px 12px 14px / 15px 12px 14px 10px",
  "15px 12px 14px 10px / 12px 14px 10px 15px",
  "11px 13px 15px 12px / 13px 15px 12px 11px",
  "13px 15px 11px 14px / 15px 11px 14px 13px",
];

const ShelfIllustration = ({ category }) => {
  // Map category → one of six illustration types from the hero mockup.
  const kind = (() => {
    const c = (category || "").toLowerCase();
    if (c === "clothing" || c === "accessory") return "brief";
    if (c === "beverage" || c === "restaurant") return "can";
    if (c === "personal_care" || c === "baby" || c === "supplement") return "bottle";
    if (c === "home" || c === "home_furnishing" || c === "kitchen") return "pump";
    if (c === "toy") return "shoe";
    return "chocolate";
  })();

  const stroke = "var(--moss)";
  const shared = {
    stroke, strokeWidth: 1.5, fill: "none",
    strokeLinecap: "round", strokeLinejoin: "round",
    opacity: 0.82,
  };

  switch (kind) {
    case "brief":
      return (
        <svg width="48" height="48" viewBox="0 0 48 48" style={shared}>
          <path d="M 14 18 L 14 36 Q 14 38 16 38 L 32 38 Q 34 38 34 36 L 34 18"/>
          <path d="M 14 18 Q 17 14 20 14 L 28 14 Q 31 14 34 18"/>
          <path d="M 20 14 Q 20 11 24 11 Q 28 11 28 14"/>
          <path d="M 14 24 L 34 24" opacity="0.5"/>
        </svg>
      );
    case "chocolate":
      return (
        <svg width="48" height="48" viewBox="0 0 48 48" style={shared}>
          <rect x="13" y="13" width="22" height="22" rx="1.5"/>
          <line x1="19" y1="13" x2="19" y2="35" opacity="0.55"/>
          <line x1="24" y1="13" x2="24" y2="35" opacity="0.55"/>
          <line x1="29" y1="13" x2="29" y2="35" opacity="0.55"/>
          <line x1="13" y1="20" x2="35" y2="20" opacity="0.55"/>
          <line x1="13" y1="28" x2="35" y2="28" opacity="0.55"/>
        </svg>
      );
    case "bottle":
      return (
        <svg width="48" height="48" viewBox="0 0 48 48" style={shared}>
          <path d="M 19 12 L 19 16 L 17 18 L 17 38 Q 17 39 18 39 L 30 39 Q 31 39 31 38 L 31 18 L 29 16 L 29 12 Z"/>
          <line x1="19" y1="12" x2="29" y2="12" strokeWidth="1.8"/>
          <rect x="19" y="22" width="10" height="10" opacity="0.55"/>
          <line x1="21" y1="26" x2="27" y2="26" opacity="0.55"/>
          <line x1="21" y1="28.5" x2="27" y2="28.5" opacity="0.55"/>
        </svg>
      );
    case "shoe":
      return (
        <svg width="48" height="48" viewBox="0 0 48 48" style={shared}>
          <path d="M 10 30 Q 10 24 14 22 L 20 20 Q 22 17 26 16 Q 31 15 33 19 Q 35 22 37 24 Q 40 26 40 30 Q 40 33 37 33 L 13 33 Q 10 33 10 30 Z"/>
          <path d="M 20 20 Q 21 23 22 25" opacity="0.55"/>
          <path d="M 26 16 Q 27 19 27 22" opacity="0.55"/>
          <line x1="12" y1="33" x2="38" y2="33" opacity="0.8"/>
        </svg>
      );
    case "can":
      return (
        <svg width="48" height="48" viewBox="0 0 48 48" style={shared}>
          <rect x="17" y="11" width="14" height="26" rx="1.5"/>
          <ellipse cx="24" cy="11" rx="7" ry="1.2" opacity="0.6"/>
          <path d="M 21 11 Q 21 13 24 13 Q 27 13 27 11" opacity="0.6"/>
          <line x1="17" y1="18" x2="31" y2="18" opacity="0.55"/>
          <line x1="17" y1="30" x2="31" y2="30" opacity="0.55"/>
          <path d="M 20 22 Q 22 24 24 22 Q 26 20 28 22" opacity="0.55"/>
        </svg>
      );
    case "pump":
    default:
      return (
        <svg width="48" height="48" viewBox="0 0 48 48" style={shared}>
          <path d="M 14 16 L 14 36 Q 14 38 16 38 L 32 38 Q 34 38 34 36 L 34 16"/>
          <rect x="12" y="12" width="24" height="5" rx="1"/>
          <ellipse cx="24" cy="14.5" rx="3" ry="0.8" opacity="0.55"/>
          <line x1="19" y1="24" x2="29" y2="24" opacity="0.55"/>
          <line x1="19" y1="28" x2="29" y2="28" opacity="0.55"/>
          <line x1="19" y1="32" x2="29" y2="32" opacity="0.55"/>
        </svg>
      );
  }
};

// Filter out malformed history entries before rendering the shelf strip.
// Pre-cascade scans sometimes saved placeholder or error text in
// product_name (e.g. "(website/service ..." from a failed extract). Entries
// stay in localStorage for data integrity — they just don't render here.
const isValidShelfItem = (item) => {
  const name = typeof item?.product_name === "string" ? item.product_name.trim() : "";
  if (!name || name.length < 2) return false;
  if (name.startsWith("(")) return false;
  if (/website\/service/i.test(name)) return false;
  return true;
};

const ShelfStrip = ({ items, onSelect }) => {
  const clean = (items || []).filter(isValidShelfItem);
  if (clean.length === 0) return null;
  const sc = (s) => s == null ? "var(--ink-faint)" : s <= 3 ? "var(--score-green)" : s <= 5 ? "var(--score-amber)" : "var(--score-red)";
  return (
    <>
      <div style={{
        display:"flex", gap:12,
        overflowX:"auto", scrollbarWidth:"none", msOverflowStyle:"none",
        padding:"4px 0 12px",
        margin:"0 -4px",
      }}>
        <style>{`.shelf-strip-scroll::-webkit-scrollbar{display:none}`}</style>
        {clean.map((item, i) => {
          const score = item.overall_score || item.score;
          const { brand, body: shelfBody } = extractBrand(item.product_name, item.brand);
          const shortName = (() => {
            const rest = shelfBody || item.product_name || "";
            return rest.length > 18 ? rest.slice(0, 17) + "…" : rest;
          })();
          return (
            <div key={i} onClick={() => onSelect && onSelect(item)} style={{flexShrink:0, width:92, cursor:"pointer"}}>
              <div style={{
                width:92, height:92,
                background:"var(--cream-light)",
                border:"1px solid var(--rule)",
                borderRadius: SHELF_TILE_SHAPES[i % SHELF_TILE_SHAPES.length],
                display:"flex", alignItems:"center", justifyContent:"center",
                marginBottom:8, position:"relative",
                transition:"transform 0.15s",
              }}>
                {score != null && (
                  <div style={{
                    position:"absolute", top:7, right:7,
                    width:22, height:22,
                    borderRadius:"49% 51% 50% 50% / 52% 48% 52% 48%",
                    background: sc(score),
                    color:"var(--ivory)",
                    fontFamily:"'Lora', Georgia, serif",
                    fontSize:13,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    lineHeight:1, fontWeight:400,
                  }}>{Math.round(score)}</div>
                )}
                <ShelfIllustration category={item.category}/>
              </div>
              <div style={{
                fontFamily:"'DM Sans', system-ui, sans-serif",
                fontSize:11, color:"var(--ink)", lineHeight:1.25,
                fontWeight:500, padding:"0 2px",
              }}>{shortName || (item.product_name || "").slice(0, 18)}</div>
              {brand && (
                <div style={{
                  fontFamily:"'DM Sans', system-ui, sans-serif",
                  fontSize:9, color:"var(--ink-faint)",
                  marginTop:2, letterSpacing:"0.1em",
                  padding:"0 2px", textTransform:"uppercase",
                }}>{brand}</div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{height:1, background:"var(--rule-strong)", margin:"6px 0 0"}}/>
    </>
  );
};

const LifestyleScoreCard = ({score, text, muted, border, isMobile, setPage}) => {
  if(!score)return null;
  const sc = score.current<=3 ? "var(--score-green)" : score.current<=5 ? "var(--score-amber)" : "var(--score-red)";
  const scSoft = score.current<=3 ? "var(--score-green-soft)" : score.current<=5 ? "var(--score-amber-soft)" : "var(--score-red-soft)";
  const tc = score.trend==="improving" ? "var(--moss)" : score.trend==="declining" ? "var(--score-red)" : "var(--ink-soft)";
  const ta = score.trend==="improving" ? "↓" : score.trend==="declining" ? "↑" : "→";
  const tl = score.trend==="improving" ? `${score.delta} better than before` : score.trend==="declining" ? `${score.delta} higher than before` : "holding steady";
  return (
    <div style={{marginBottom:20}}>
      <div onClick={()=>setPage("history")} style={{
        background: "var(--cream-light)",
        borderRadius: "16px 20px 14px 18px / 18px 14px 20px 16px",
        padding:"18px 22px",
        border: "1px solid var(--rule)",
        cursor:"pointer",
        display:"flex", alignItems:"center", justifyContent:"space-between", gap:16,
      }}>
        <div style={{display:"flex", alignItems:"center", gap:16}}>
          <div style={{
            display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
            width:64, height:64,
            borderRadius:"49% 51% 50% 50% / 52% 48% 52% 48%",
            background: scSoft,
            border: `2px solid ${sc}`,
            flexShrink:0,
          }}>
            <span style={{fontSize:26, fontWeight:400, fontFamily:"'Lora', Georgia, serif", color:sc, lineHeight:1, letterSpacing:"-0.02em"}}>{score.current}</span>
            <span style={{fontSize:9, color:sc, opacity:0.7, marginTop:2, fontFamily:"'DM Sans', system-ui, sans-serif", letterSpacing:"0.1em"}}>/10</span>
          </div>
          <div>
            <div style={{fontSize:10, fontWeight:500, color:"var(--moss)", marginBottom:4, textTransform:"uppercase", letterSpacing:"0.22em", fontFamily:"'DM Sans', system-ui, sans-serif"}}>Routine score</div>
            <div style={{fontSize:13, color:"var(--ink-soft)", marginBottom:2, fontFamily:"'DM Sans', system-ui, sans-serif"}}>{score.productCount} product{score.productCount!==1?"s":""} scored</div>
            {score.previous && <div style={{fontSize:12, color:tc, fontWeight:500, display:"flex", alignItems:"center", gap:4, fontFamily:"'DM Sans', system-ui, sans-serif"}}><span>{ta}</span><span>{tl}</span></div>}
          </div>
        </div>
        <div style={{textAlign:"right", flexShrink:0}}>
          {score.worstCategory && (<>
            <div style={{fontSize:10, color:"var(--ink-faint)", marginBottom:2, letterSpacing:"0.14em", textTransform:"uppercase", fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:500}}>Biggest pull</div>
            <div style={{fontSize:14, fontWeight:400, color:"var(--ink)", fontFamily:"'Lora', Georgia, serif", letterSpacing:"-0.005em"}}>{score.worstCategory.label}</div>
            <div style={{fontSize:11, color:"var(--ink-faint)", fontFamily:"'DM Sans', system-ui, sans-serif"}}>avg {score.worstCategory.avg}/10</div>
          </>)}
        </div>
      </div>
    </div>
  );
};

const generateForYouCards = (history, childMode) => {
  if(!history||history.length===0)return [];
  const cards=[];
  // Lifestyle score card
  const lifestyleScore = computeLifestyleScore(history);
  if(lifestyleScore&&lifestyleScore.productCount>=10){const at=lifestyleScore.trend==="improving"?`Down ${lifestyleScore.delta} — keep going`:lifestyleScore.worstCategory?`${lifestyleScore.worstCategory.label} pulling score up`:"See what is moving your score";cards.push({type:"lifestyle_score",priority:7,headline:`Your shelf scores ${lifestyleScore.current}`,body:at,label:lifestyleScore.trend==="improving"?"Improving":"Your shelf",labelColor:lifestyleScore.trend==="improving"?"#16a34a":"#d97706",action:"See breakdown",actionPage:"history"});}
  const EU_BANNED=[{compound:"titanium dioxide",reason:"banned as a food additive in the EU since 2022",label:"EU banned food additive"},{compound:"Red 40",reason:"under restriction in the EU — requires warning label",label:"EU warning label required"},{compound:"Yellow 5",reason:"requires warning label in EU for hyperactivity link",label:"EU warning label required"},{compound:"Yellow 6",reason:"requires warning label in EU for hyperactivity link",label:"EU warning label required"},{compound:"BHT",reason:"banned in several EU countries as a food preservative",label:"EU restricted preservative"},{compound:"BHA",reason:"classified as possible carcinogen, restricted in EU",label:"EU restricted preservative"},{compound:"propyl paraben",reason:"banned in EU cosmetics as endocrine disruptor",label:"EU banned in cosmetics"},{compound:"triclosan",reason:"banned in EU personal care products",label:"EU banned compound"},{compound:"oxybenzone",reason:"banned in EU reef-protection zones, under review",label:"EU under restriction"},{compound:"PFAS",reason:"comprehensive EU restriction effective 2025",label:"EU restricted PFAS"},{compound:"PFOA",reason:"banned globally under Stockholm Convention",label:"Globally banned"}];
  const euFindings=[];
  history.forEach(item=>{const ac=[...(item.concerns||[]).map(c=>typeof c==="string"?c:c.concern||""),...(item.harmful_chemicals||[]),item.summary||""].join(" ").toLowerCase();EU_BANNED.forEach(b=>{if(ac.includes(b.compound.toLowerCase()))euFindings.push({product:item.product_name,compound:b.compound,reason:b.reason,label:b.label,score:item.overall_score||item.score});});});
  if(euFindings.length>0){const f=euFindings[0];cards.push({type:"eu_banned",priority:9,headline:`${f.compound} in your ${f.product}`,body:`This ingredient is ${f.reason}. It remains legal in the US.`,label:f.label,labelColor:"#d97706",score:f.score,action:"See alternatives",actionPage:"result",productName:f.product});}
  const compoundMap={};
  history.forEach(item=>{[...(item.harmful_chemicals||[]),...(item.concerns||[]).map(c=>typeof c==="string"?c:c.concern||"").filter(c=>c.length>0)].forEach(chem=>{const k=chem.toLowerCase().slice(0,30);if(!compoundMap[k])compoundMap[k]={name:chem,products:[],count:0};if(!compoundMap[k].products.includes(item.product_name)){compoundMap[k].products.push(item.product_name);compoundMap[k].count++;}});});
  const patterns=Object.values(compoundMap).filter(c=>c.count>=2).sort((a,b)=>b.count-a.count);
  if(patterns.length>0){const t=patterns[0];cards.push({type:"pattern",priority:8,headline:`${t.name} appears in ${t.count} of your products`,body:`Found in ${t.products.slice(0,3).join(", ")}${t.products.length>3?` and ${t.products.length-3} more`:""}. Cumulative exposure compounds over time.`,label:"Exposure pattern",labelColor:"#dc2626",action:"View my shelf",actionPage:"history"});}
  const highConcern=[...history].filter(h=>(h.overall_score||h.score||0)>=7).sort((a,b)=>(b.overall_score||b.score||0)-(a.overall_score||a.score||0))[0];
  if(highConcern){const tc=highConcern.concerns?.[0];const ct=tc?(typeof tc==="string"?tc:tc.concern||""):highConcern.summary||"";cards.push({type:"high_concern",priority:6,headline:`${highConcern.product_name} scores ${highConcern.overall_score||highConcern.score}`,body:ct?ct.slice(0,100)+(ct.length>100?"...":""):"One of the highest-concern products in your routine.",label:"High concern",labelColor:"#dc2626",score:highConcern.overall_score||highConcern.score,action:"Find safer alternatives",actionPage:"result",productName:highConcern.product_name});}
  const cleanWin=[...history].filter(h=>(h.overall_score||h.score||0)<=2).sort((a,b)=>new Date(b.scannedAt)-new Date(a.scannedAt))[0];
  if(cleanWin)cards.push({type:"clean_win",priority:4,headline:`${cleanWin.product_name} scores ${cleanWin.overall_score||cleanWin.score}`,body:"One of the cleanest products in your routine. Worth keeping.",label:"Clean choice",labelColor:"#16a34a",score:cleanWin.overall_score||cleanWin.score,action:"View result",actionPage:"result",productName:cleanWin.product_name});
  const swapPending=[...history].filter(h=>{const s=h.overall_score||h.score||0;const ha=(h.alternatives||[]).length>0||(h.ai_alternatives||[]).length>0;const da=h.scannedAt?(Date.now()-new Date(h.scannedAt).getTime())/(1000*60*60*24):999;return s>=6&&ha&&da<=30;}).sort((a,b)=>(b.overall_score||b.score||0)-(a.overall_score||a.score||0))[0];
  if(swapPending){const alt=swapPending.alternatives?.[0]||swapPending.ai_alternatives?.[0];cards.push({type:"swap_pending",priority:5,headline:`Have you swapped ${swapPending.product_name} yet?`,body:alt?`${alt.name} scores ${alt.score||alt.estimated_score||"lower"} — a meaningful improvement.`:"A cleaner alternative is available in the same category.",label:"Swap available",labelColor:"#d97706",score:swapPending.overall_score||swapPending.score,action:"See swap",actionPage:"result",productName:swapPending.product_name});}
  const now=new Date(),hour=now.getHours(),day=now.getDay(),month=now.getMonth();
  if(hour>=6&&hour<=9){const pc=history.filter(h=>["personal_care","skincare"].includes(h.category)&&(h.overall_score||h.score||0)>=5);if(pc.length>=2)cards.push({type:"contextual_morning",priority:5,headline:"Your morning routine has room to improve",body:`${pc.length} personal care products score 5 or above. Small swaps add up.`,label:"Morning insight",labelColor:"#d97706",action:"View personal care",actionPage:"history"});}
  if(childMode){const kh=history.filter(h=>(h.child_score||h.overall_score||h.score||0)>=6).length;if(kh>=1)cards.push({type:"contextual_kids",priority:8,headline:`${kh} product${kh!==1?"s":""} score higher for children`,body:"Children are more sensitive to certain compounds. These items warrant attention.",label:"Kids mode insight",labelColor:"#2563eb",action:"View flagged items",actionPage:"history"});}
  return cards.sort((a,b)=>b.priority-a.priority).slice(0,6);
};

const ForYouCarousel = ({cards, text, muted, isMobile, setPage, setResult, setQuery, analyze, history}) => {
  const scrollRef = useRef(null);
  const CW = isMobile ? 280 : 320;
  const {pause, resume} = useAutoScroll(scrollRef, 3500, CW+12, cards.length);
  if(!cards||cards.length===0)return null;
  const handleAction=(card)=>{
    if(card.type==="live_intel"){if(card.actionUrl)window.open(card.actionUrl,"_blank");else if(card.actionPage)setPage(card.actionPage);return;}
    if(card.actionPage==="history")setPage("history");
    else if(card.actionPage==="result"&&card.productName){const hi=history.find(h=>h.product_name===card.productName);if(hi){setResult(hi);setPage("home");}else{setQuery(card.productName);analyze(card.productName);}}
    else setPage("home");
  };
  const sc=(s)=> s==null ? "var(--ink-soft)" : s<=3 ? "var(--score-green)" : s<=5 ? "var(--score-amber)" : "var(--score-red)";
  const cardShapes = [
    "16px 20px 14px 18px / 18px 14px 20px 16px",
    "20px 14px 18px 16px / 14px 18px 16px 20px",
    "14px 18px 16px 20px / 20px 16px 14px 18px",
    "15px 16px 14px 18px / 16px 14px 18px 15px",
  ];
  return (
    <div style={{marginBottom:28}}>
      <div style={{display:"flex", alignItems:"baseline", justifyContent:"space-between", padding:`0 ${isMobile?"16px":"40px"}`, marginBottom:14, maxWidth:1100, margin:"0 auto 14px"}}>
        <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:22, color:"var(--ink)", letterSpacing:"-0.005em", fontWeight:400}}>
          Thought you'd <span style={{color:"var(--moss)"}}>want to know</span>
        </div>
        <div style={{display:"flex", gap:4}}>{cards.map((_,i)=><div key={i} style={{width:5, height:5, borderRadius:"50%", background:"var(--rule-strong)"}}/>)}</div>
      </div>
      <div ref={scrollRef} onMouseEnter={pause} onMouseLeave={resume} onTouchStart={pause} onTouchEnd={()=>setTimeout(resume,3000)} style={{display:"flex", gap:12, overflowX:"auto", scrollbarWidth:"none", msOverflowStyle:"none", padding:`4px ${isMobile?"16px":"40px"} 8px`, scrollBehavior:"smooth", WebkitOverflowScrolling:"touch"}}>
        <style>{`.foryou-scroll::-webkit-scrollbar{display:none}`}</style>
        {cards.map((card,i)=>{
          const shape = cardShapes[i % cardShapes.length];
          return (
            <div key={i} onClick={()=>handleAction(card)} style={{
              flexShrink:0, width:CW,
              borderRadius: shape,
              padding:"18px 20px 20px",
              cursor:"pointer",
              background: "var(--cream-light)",
              border: "1px solid var(--rule)",
              display:"flex", flexDirection:"column", gap:10,
              minHeight:140,
              transition:"transform 0.15s, background 0.2s",
            }}>
              <div style={{
                fontFamily:"'DM Sans', system-ui, sans-serif",
                fontSize:10, fontWeight:500, color:"var(--moss)",
                textTransform:"uppercase", letterSpacing:"0.22em",
                display:"flex", alignItems:"center", gap:10,
              }}>
                <span style={{display:"inline-block", width:16, height:1, background:"var(--moss)", opacity:0.6}}/>
                {card.label}
              </div>
              <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:20, fontWeight:400, color:"var(--ink)", lineHeight:1.15, letterSpacing:"-0.005em", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden"}}>{card.headline}</div>
              <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13, color:"var(--ink-soft)", lineHeight:1.5, flex:1, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden"}}>{card.body}</div>
              <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:4, gap:8}}>
                <span style={{
                  fontFamily:"'Lora', Georgia, serif", fontSize:14, color:"var(--moss)",
                  paddingBottom:1, borderBottom:"1px dotted var(--moss)",
                }}>{card.action}</span>
                {card.score!=null && (
                  <span style={{fontFamily:"'Lora', Georgia, serif", fontSize:17, fontWeight:400, color:sc(card.score), letterSpacing:"-0.01em"}}>
                    {card.score}<span style={{fontSize:11, opacity:0.55, marginLeft:1, fontFamily:"'DM Sans', system-ui, sans-serif", letterSpacing:"0.1em"}}>/10</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── RESPONSIVE HOOK ───────────────────────────────────────────
const filterLiveCards = (liveCards, history) => {
  if(!liveCards?.length||!history?.length)return [];
  return liveCards.filter(card=>{
    const hasIng=card.ingredient_triggers?.length>0;
    const hasCat=card.category_triggers?.length>0;
    if(!hasIng&&!hasCat)return true;
    if(hasIng){const uc=history.flatMap(h=>[...(h.harmful_chemicals||[]),...(h.concerns||[]).map(c=>typeof c==="string"?c:c.concern||""),h.summary||""]).join(" ").toLowerCase();if(card.ingredient_triggers.some(t=>uc.includes(t.toLowerCase().trim())))return true;}
    if(hasCat){const cats=new Set(history.map(h=>h.category));if(card.category_triggers.some(c=>cats.has(c)))return true;}
    return false;
  });
};

function useWindowWidth() {
  const [width, setWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const handle = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, []);
  return width;
}

// ── Sourcing flags ────────────────────────────────────────────
// Mines product names for sourcing markers (wild-caught, farm-raised,
// grass-fed, organic, etc.) and surfaces them as chips on the result.
// Same logic the backend uses in scoringCascade.js detectSourcingFlags;
// duplicated here so the frontend can fall back when result.sourcing_flags
// isn't populated (older cached scans, non-whole-food paths). Backend
// flags win when present.
function deriveSourcingFlags(productName) {
  const norm = String(productName || "").toLowerCase();
  const flags = [];
  const add = (type, label, tone) => { if (!flags.find(f => f.type === type)) flags.push({ type, label, tone }); };

  if (/\bwild[-\s]?caught\b|\bwild salmon|\bwild shrimp|\bwild sockeye|\bwild coho|\bwild chinook|\bwild halibut|\bwild cod|\bwild tuna|\balaskan salmon\b/.test(norm)) add("wild_caught", "Wild caught", "positive");
  if (/\bsockeye|\bcoho|\bchinook|\bking salmon|\bpink salmon|\bchum salmon\b/.test(norm) && !/farm/.test(norm)) add("wild_pacific", "Wild Pacific", "positive");
  if (/grass[-\s]?fed/.test(norm))                 add("grass_fed", "Grass-fed", "positive");
  if (/pasture[-\s]?raised/.test(norm))            add("pasture_raised", "Pasture-raised", "positive");
  if (/cage[-\s]?free/.test(norm))                 add("cage_free", "Cage-free", "positive");
  if (/free[-\s]?range/.test(norm))                add("free_range", "Free-range", "positive");
  if (/usda organic/.test(norm))                   add("usda_organic", "USDA Organic", "positive");
  else if (/\borganic\b/.test(norm))               add("organic", "Organic", "positive");
  if (/heritage breed|heritage (pig|cattle|chicken|turkey)/.test(norm)) add("heritage", "Heritage breed", "positive");
  if (/non[-\s]?gmo/.test(norm))                   add("non_gmo", "Non-GMO", "positive");
  if (/\bmsc certified|marine stewardship/.test(norm)) add("msc_certified", "MSC Certified", "positive");
  if (/\basc certified|aquaculture stewardship/.test(norm)) add("asc_certified", "ASC Certified", "positive");
  if (/certified humane|animal welfare approved/.test(norm)) add("humane", "Certified Humane", "positive");
  if (/antibiotic[-\s]?free|no antibiotics/.test(norm)) add("antibiotic_free", "Antibiotic-free", "positive");
  if (/hormone[-\s]?free|no (added )?hormones/.test(norm)) add("hormone_free", "Hormone-free", "positive");

  const hasWild = flags.find(f => f.type === "wild_caught" || f.type === "wild_pacific");
  if (!hasWild) {
    if (/farm[-\s]?raised|farmed\b/.test(norm))    add("farm_raised", "Farm-raised", "caution");
    else if (/atlantic salmon/.test(norm))         add("farm_raised", "Farm-raised", "caution");
  }
  if (/conventional|feedlot/.test(norm))           add("conventional", "Conventional", "caution");
  if (/(processed|cured|smoked|nitrate)/.test(norm) && /(meat|sausage|bacon|ham|hot dog|deli)/.test(norm)) add("processed", "Processed", "caution");

  return flags;
}

// SourcingFlags renders a row of small chips. Positive flags get a
// moss checkmark; caution flags get an amber dot. No alarm colors.
const SourcingFlags = ({ flags }) => {
  if (!Array.isArray(flags) || flags.length === 0) return null;
  return (
    <div style={{display:"flex", flexWrap:"wrap", gap:6, marginTop:10, marginBottom:6}}>
      {flags.map((f, i) => {
        const isPositive = f.tone === "positive";
        const color = isPositive ? "var(--moss)" : "var(--amber)";
        const bg    = isPositive ? "var(--moss-soft)" : "rgba(200, 120, 26, 0.08)";
        return (
          <span key={f.type || i} style={{
            display:"inline-flex", alignItems:"center", gap:5,
            padding:"4px 10px", borderRadius:"var(--tile-shape-2)",
            background: bg,
            border:"1px solid var(--rule-soft)",
            fontFamily:"'DM Sans', system-ui, sans-serif",
            fontSize:11, fontWeight:500, color,
            letterSpacing:"0.02em",
          }}>
            <span style={{
              fontSize:8, lineHeight:1, color,
            }}>{isPositive ? "✓" : "·"}</span>
            {f.label}
          </span>
        );
      })}
    </div>
  );
};

// ── UpdateRequiredView ────────────────────────────────────────
// Full-screen blocking gate when the running APP_VERSION is older than
// the server-controlled MIN_*_VERSION. Renders before the rest of the
// app on every boot. Apple doesn't allow forcing auto-updates, but most
// users have App Store auto-updates enabled — this catches the few who
// don't and walks them to the update with one tap.
const UpdateRequiredView = ({ minVersion }) => {
  const isNative = IS_NATIVE;
  const onUpdate = () => {
    const url = isNative ? APP_STORE_URL_NATIVE : APP_STORE_URL_WEB;
    try { window.location.href = url; } catch {}
  };
  return (
    <div style={{minHeight:"100vh", background:"var(--cream)", padding:"60px 20px"}}>
      <div style={{maxWidth:420, margin:"0 auto"}}>
        <div style={{textAlign:"center", marginBottom:24}}>
          <img src="/partiqule-wordmark-light.svg" alt="Partiqule" style={{height:28}}/>
        </div>
        <div style={{
          background:"var(--cream-light)",
          borderRadius:"var(--card-shape-2)",
          border:"1px solid var(--rule)",
          padding:"32px 28px",
        }}>
          <div style={{fontSize:10, letterSpacing:"0.22em", color:"var(--moss)", textTransform:"uppercase", fontWeight:500, marginBottom:12, display:"flex", alignItems:"center", gap:10}}>
            <span style={{display:"inline-block", width:22, height:1, background:"var(--moss)", opacity:0.7}}/>
            Time to update
          </div>
          <h1 style={{fontFamily:"'Lora', Georgia, serif", fontWeight:400, fontSize:26, color:"var(--ink)", margin:"0 0 10px", letterSpacing:"-0.01em"}}>
            There's a newer version of Partiqule.
          </h1>
          <p style={{fontSize:14, color:"var(--ink-soft)", lineHeight:1.6, marginBottom:20}}>
            We've shipped fixes that need a fresh install to work. {isNative ? "Open the App Store to grab the latest version — takes a few seconds." : "Refresh this page or reinstall to get the latest."} You're on {APP_VERSION}; the new minimum is {minVersion}.
          </p>
          <button onClick={onUpdate} style={{width:"100%", padding:"13px 16px", background:"var(--moss)", color:"var(--ivory)", border:"none", borderRadius:"var(--cta-shape)", fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:500, fontSize:14, cursor:"pointer"}}>
            {isNative ? "Open the App Store" : "Refresh and reload"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── ReviewSocialsPrompt ───────────────────────────────────────
// One-time soft modal triggered after the user crosses a scan-count
// threshold (default 20). Shows a primary "Leave a review" CTA, a
// secondary "Follow us on Instagram" outlined button, and a tertiary
// "Maybe later" dismissal. Sets ps_review_prompted so it never fires
// twice per device.
const ReviewSocialsPrompt = ({ onClose }) => {
  const isNative = IS_NATIVE;
  const reviewUrl = isNative ? APP_STORE_REVIEW_URL_NATIVE : APP_STORE_REVIEW_URL_WEB;
  const dismiss = () => {
    try { localStorage.setItem("ps_review_prompted", new Date().toISOString()); } catch {}
    onClose();
  };
  const openReview = () => { try { window.open(reviewUrl, "_blank"); } catch {} dismiss(); };
  const openInstagram = () => { try { window.open(INSTAGRAM_URL, "_blank"); } catch {} dismiss(); };
  const openTikTok    = () => { try { window.open(TIKTOK_URL, "_blank"); } catch {} dismiss(); };
  return (
    <div style={{position:"fixed", inset:0, zIndex:9990, background:"rgba(26,31,21,0.55)", display:"flex", alignItems:"center", justifyContent:"center", padding:16}}
      onClick={dismiss}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:"var(--cream-light)",
        borderRadius:"var(--card-shape-2)",
        border:"1px solid var(--rule)",
        padding:"28px 24px",
        width:"100%", maxWidth:380,
        fontFamily:"'DM Sans', system-ui, sans-serif",
      }}>
        <div style={{fontSize:10, letterSpacing:"0.22em", color:"var(--moss)", textTransform:"uppercase", fontWeight:500, marginBottom:12, display:"flex", alignItems:"center", gap:10}}>
          <span style={{display:"inline-block", width:22, height:1, background:"var(--moss)", opacity:0.7}}/>
          Quick favor
        </div>
        <h2 style={{fontFamily:"'Lora', Georgia, serif", fontWeight:400, fontSize:24, color:"var(--ink)", margin:"0 0 10px", letterSpacing:"-0.01em"}}>
          Enjoying Partiqule?
        </h2>
        <p style={{fontSize:14, color:"var(--ink-soft)", lineHeight:1.55, marginBottom:20}}>
          A quick App Store review helps other people find us — and following along on Instagram is the best way to see what Sara's testing next.
        </p>
        <button onClick={openReview} style={{width:"100%", padding:"13px 16px", background:"var(--moss)", color:"var(--ivory)", border:"none", borderRadius:"var(--cta-shape)", fontWeight:500, fontSize:14, cursor:"pointer", marginBottom:8}}>
          Leave a review
        </button>
        <div style={{display:"flex", gap:8, marginBottom:8}}>
          <button onClick={openInstagram} style={{flex:1, padding:"12px 14px", background:"transparent", color:"var(--ink)", border:"1px solid var(--rule-strong)", borderRadius:"var(--cta-shape)", fontWeight:500, fontSize:13, cursor:"pointer"}}>
            Instagram
          </button>
          <button onClick={openTikTok} style={{flex:1, padding:"12px 14px", background:"transparent", color:"var(--ink)", border:"1px solid var(--rule-strong)", borderRadius:"var(--cta-shape)", fontWeight:500, fontSize:13, cursor:"pointer"}}>
            TikTok
          </button>
        </div>
        <button onClick={dismiss} style={{width:"100%", padding:"10px 16px", background:"none", color:"var(--ink-faint)", border:"none", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13, cursor:"pointer"}}>
          Maybe later
        </button>
      </div>
    </div>
  );
};

// ── ResetPasswordPage ─────────────────────────────────────────
// Lands the user after they click the Supabase password-reset email.
// The Supabase SDK auto-picks up the recovery token from the URL hash
// fragment (detectSessionInUrl defaults to true on createClient), sets a
// recovery-mode session, and fires PASSWORD_RECOVERY. From there the
// user can call supabase.auth.updateUser({ password }) to set a new
// password and be signed in.
const ResetPasswordPage = ({ onDone }) => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [status, setStatus]     = useState("loading"); // loading | ready | submitting | success | expired
  const [error, setError]       = useState("");

  useEffect(() => {
    let cancelled = false;

    // Supabase fires PASSWORD_RECOVERY when it consumes the recovery
    // token from the URL fragment on page load.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY") setStatus("ready");
    });

    // If the SDK already processed the fragment before this effect ran,
    // getSession() returns a live session — treat that as recovery mode.
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) setStatus((s) => s === "loading" ? "ready" : s);
    });

    // Fallback: the URL may have no token at all (user bookmarked the
    // page, link expired, or the reset email's link was tampered with).
    // Wait 3s for SDK to settle, then if still no session, show expired.
    const t = setTimeout(() => {
      if (cancelled) return;
      supabase.auth.getSession().then(({ data }) => {
        if (cancelled) return;
        if (!data.session) setStatus("expired");
      });
    }, 3000);

    return () => { cancelled = true; subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Use at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setStatus("submitting");
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setStatus("ready");
      setError(err.message || "Something went wrong. Try again.");
      return;
    }
    setStatus("success");
    setTimeout(() => {
      window.history.replaceState({}, "", "/");
      onDone && onDone();
    }, 1800);
  };

  const input = {
    width: "100%", padding: "12px 14px", marginBottom: 10,
    border: "1px solid var(--rule)", borderRadius: "var(--tile-shape-2)",
    background: "var(--cream)", fontFamily: "'DM Sans', system-ui, sans-serif",
    fontSize: 14, color: "var(--ink)", boxSizing: "border-box",
  };

  return (
    <div style={{minHeight: "100vh", background: "var(--cream)", padding: "60px 20px"}}>
      <div style={{maxWidth: 420, margin: "0 auto"}}>
        <div style={{textAlign: "center", marginBottom: 24}}>
          <img src="/partiqule-wordmark-light.svg" alt="Partiqule" style={{height: 28}}/>
        </div>
        <div style={{
          background: "var(--cream-light)",
          borderRadius: "var(--card-shape-2)",
          border: "1px solid var(--rule)",
          padding: "32px 28px",
        }}>
          {status === "expired" ? (
            <>
              <h1 style={{fontFamily:"'Lora', Georgia, serif", fontWeight:400, fontSize:26, color:"var(--ink)", margin:"0 0 12px", letterSpacing:"-0.01em"}}>
                This link has expired.
              </h1>
              <p style={{fontSize:14, color:"var(--ink-soft)", lineHeight:1.6, marginBottom:20}}>
                Reset links are good for an hour. Head back and request a new one — we'll send a fresh email.
              </p>
              <button onClick={() => { window.location.href = "/"; }} style={{width:"100%", padding:"13px 16px", background:"var(--moss)", color:"var(--ivory)", border:"none", borderRadius:"var(--cta-shape)", fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:500, fontSize:14, cursor:"pointer"}}>
                Back to Partiqule
              </button>
            </>
          ) : status === "success" ? (
            <>
              <div style={{fontSize:10, letterSpacing:"0.22em", color:"var(--moss)", textTransform:"uppercase", fontWeight:500, marginBottom:12, display:"flex", alignItems:"center", gap:10}}>
                <span style={{display:"inline-block", width:22, height:1, background:"var(--moss)", opacity:0.7}}/>
                Done
              </div>
              <h1 style={{fontFamily:"'Lora', Georgia, serif", fontWeight:400, fontSize:26, color:"var(--ink)", margin:"0 0 10px", letterSpacing:"-0.01em"}}>
                Password updated.
              </h1>
              <p style={{fontSize:14, color:"var(--ink-soft)", lineHeight:1.6}}>
                Heading you home — you're signed in.
              </p>
            </>
          ) : (
            <form onSubmit={submit}>
              <div style={{fontSize:10, letterSpacing:"0.22em", color:"var(--moss)", textTransform:"uppercase", fontWeight:500, marginBottom:12, display:"flex", alignItems:"center", gap:10}}>
                <span style={{display:"inline-block", width:22, height:1, background:"var(--moss)", opacity:0.7}}/>
                Reset password
              </div>
              <h1 style={{fontFamily:"'Lora', Georgia, serif", fontWeight:400, fontSize:26, color:"var(--ink)", margin:"0 0 8px", letterSpacing:"-0.01em"}}>
                Set a new password.
              </h1>
              <p style={{fontSize:14, color:"var(--ink-soft)", lineHeight:1.55, marginBottom:20}}>
                Choose something at least 8 characters. We'll sign you in right after.
              </p>
              <input type="password" placeholder="New password" value={password} onChange={e=>setPassword(e.target.value)} style={input} autoComplete="new-password" autoFocus/>
              <input type="password" placeholder="Confirm password" value={confirm}  onChange={e=>setConfirm(e.target.value)}  style={{...input, marginBottom:16}} autoComplete="new-password"/>
              {error && (
                <div style={{fontSize:13, color:"var(--amber)", marginBottom:14, lineHeight:1.5}}>{error}</div>
              )}
              <button
                type="submit"
                disabled={status === "submitting" || status === "loading"}
                style={{width:"100%", padding:"13px 16px", background:"var(--moss)", color:"var(--ivory)", border:"none", borderRadius:"var(--cta-shape)", fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:500, fontSize:14, cursor:(status === "submitting" || status === "loading") ? "not-allowed" : "pointer", opacity:(status === "submitting" || status === "loading") ? 0.6 : 1}}
              >
                {status === "submitting" ? "Updating…" : status === "loading" ? "Verifying link…" : "Update password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

// ── PHASE 1 SPIKE: streaming test harness ────────────────────
// Verifies whether chunked JSON from the backend arrives incrementally
// through Capacitor's iOS WebView, or buffers until completion. Renders
// each chunk + the wall-clock client_received_ms gap from the previous
// chunk. If chunks arrive at ~1s, ~2s, ~4s gaps we have streaming. If
// all four arrive together at ~4s we don't.
// DELETE both this component and the /spike/stream backend endpoint
// once Phase 1 is decided.
const StreamSpike = ({ isMobile, text, muted }) => {
  const [running, setRunning] = useState(false);
  const [chunks, setChunks] = useState([]);
  const run = async () => {
    setChunks([]);
    setRunning(true);
    const startedAt = Date.now();
    let lastReceived = startedAt;
    try {
      const res = await fetch(`${API_BASE}/spike/stream`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (!line.trim()) continue;
          const now = Date.now();
          let parsed;
          try { parsed = JSON.parse(line); } catch { parsed = { raw: line }; }
          const gap_ms = now - lastReceived;
          const total_ms = now - startedAt;
          lastReceived = now;
          setChunks(prev => [...prev, { ...parsed, client_gap_ms: gap_ms, client_total_ms: total_ms }]);
        }
      }
    } catch (e) {
      setChunks(prev => [...prev, { error: e.message }]);
    }
    setRunning(false);
  };
  return (
    <div style={{background:"var(--cream-light)", border:`1px solid var(--rule)`, borderRadius:"var(--card-shape-1)", padding:isMobile?"16px":"20px", marginBottom:24}}>
      <div style={{fontSize:11, fontWeight:700, color:"var(--moss)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8}}>Streaming Spike (admin only)</div>
      <p style={{fontSize:13, color:muted, margin:"0 0 12px", lineHeight:1.5}}>Tests whether chunked JSON arrives incrementally through the WebView. If client_gap_ms is ~1000/1000/2000 we have streaming. If all chunks land in the last burst we do not.</p>
      <button onClick={run} disabled={running} style={{padding:"10px 18px", borderRadius:8, border:"none", background:"var(--moss)", color:"var(--ivory)", fontSize:14, fontWeight:600, cursor:running?"default":"pointer", opacity:running?0.6:1}}>
        {running ? "Streaming..." : "Run stream test"}
      </button>
      {chunks.length > 0 && (
        <div style={{marginTop:14, padding:"10px 12px", background:"#fff", borderRadius:6, border:"1px solid var(--rule)", fontSize:13, color:text}}>
          {chunks.map((c, i) => (
            <div key={i} style={{padding:"6px 0", borderBottom: i < chunks.length - 1 ? "1px solid var(--rule-soft)" : "none"}}>
              <div style={{fontWeight:700, marginBottom:2}}>{c.stage || c.error || "?"}</div>
              <div style={{color:muted, fontSize:12}}>
                gap: <strong style={{color:text}}>{c.client_gap_ms}ms</strong> · total: {c.client_total_ms}ms · server: {c.elapsed_ms}ms
              </div>
            </div>
          ))}
          <div style={{marginTop:10, padding:"8px 10px", background:"var(--cream-light)", borderRadius:4, fontSize:12, color:muted, lineHeight:1.5}}>
            Streaming works if gaps after the first are ~1000, ~1000, ~2000.<br/>
            Buffered if gaps are ~0, ~0, ~0 (everything lands together at the end).
          </div>
        </div>
      )}
    </div>
  );
};

function TextileConfirmationCard({ visionConfirmation, onConfirm, onEdit, onDismiss }) {
  const [editValue, setEditValue] = useState(visionConfirmation.editableName || "");
  const handleEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed.length === 0) return;
    onEdit(trimmed);
  };
  return (
    <div
      onClick={onDismiss}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "20px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--cream)",
          borderRadius: "var(--card-shape-2)",
          padding: "32px 24px",
          maxWidth: "480px",
          width: "100%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
      >
        <div
          style={{
            fontFamily: "var(--sans)",
            fontSize: "12px",
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--moss)",
            marginBottom: "12px",
          }}
        >
          Confirm the name
        </div>
        <div
          style={{
            fontFamily: "var(--serif)",
            fontSize: "24px",
            lineHeight: 1.3,
            color: "var(--ink)",
            marginBottom: "12px",
          }}
        >
          I see this looks like:
        </div>
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          style={{
            width: "100%",
            padding: "14px 16px",
            fontFamily: "var(--serif)",
            fontSize: "20px",
            color: "var(--ink)",
            background: "var(--cream-light)",
            border: "1px solid var(--rule)",
            borderRadius: "12px",
            marginBottom: "16px",
            boxSizing: "border-box",
          }}
        />
        <div
          style={{
            fontFamily: "var(--sans)",
            fontSize: "14px",
            color: "var(--ink-soft)",
            marginBottom: "24px",
            lineHeight: 1.5,
          }}
        >
          Does that match what's on the tag? Edit if needed, then we'll look it up again.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button
            onClick={onConfirm}
            style={{
              padding: "14px",
              fontFamily: "var(--sans)",
              fontSize: "16px",
              fontWeight: 600,
              color: "var(--cream)",
              background: "var(--moss)",
              border: "none",
              borderRadius: "999px",
              cursor: "pointer",
            }}
          >
            Yes, that's right
          </button>
          <button
            onClick={handleEdit}
            style={{
              padding: "14px",
              fontFamily: "var(--sans)",
              fontSize: "16px",
              fontWeight: 600,
              color: "var(--moss)",
              background: "var(--cream)",
              border: "1.5px solid var(--moss)",
              borderRadius: "999px",
              cursor: "pointer",
            }}
          >
            Edit and try again
          </button>
        </div>
      </div>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────
function App() {
  const [query,       setQuery]      = useState("");
  const [searchMode,  setSearchMode] = useState("name");
  const [result,      setResult]     = useState(null);
  const [loading,     setLoading]    = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const overlayTimerRef = useRef(null);
  const loadingStartRef = useRef(null);
  const MIN_OVERLAY_MS  = 2000; // minimum time to show globe

  useEffect(()=>{
    if(loading){
      setShowOverlay(true);
      loadingStartRef.current = Date.now();
      clearTimeout(overlayTimerRef.current);
    } else {
      // Loading done — calculate how long we've already shown the globe
      const elapsed  = Date.now() - (loadingStartRef.current || Date.now());
      const remaining = Math.max(0, MIN_OVERLAY_MS - elapsed);
      overlayTimerRef.current = setTimeout(()=>setShowOverlay(false), remaining);
    }
    return()=>clearTimeout(overlayTimerRef.current);
  },[loading]);
  const [error,       setError]      = useState(null);
  const [page,        setPage]       = useState("home");
  const [guideSlug,   setGuideSlug]  = useState("");

  const navigateTo = (pg, slug="") => {
    setPage(pg);
    if(pg==="guides"){ setGuideSlug(""); window.history.pushState({},"","/guides"); }
    else if(pg==="guide"&&slug){ setGuideSlug(slug); window.history.pushState({},"",`/guides/${slug}`); }
    else if(pg==="home"){ setResult(null); window.history.pushState({},"","/"); }
  };
  const [menuOpen,    setMenuOpen]   = useState(false);
  const [history,     setHistory]    = useState(()=>{try{return JSON.parse(localStorage.getItem("ps_history")||"[]");}catch{return [];}});
  const [displayName, setDisplayName] = useState(()=>{try{return localStorage.getItem("partiqule_display_name")||"";}catch{return "";}});
  const [liveIntelCards, setLiveIntelCards] = useState([]);
  const [emailDismissed, setEmailDismissed] = useState(()=>{try{return !!localStorage.getItem("ps_email_captured");}catch{return false;}});
  const [captureEmail,   setCaptureEmail]   = useState("");
  const [captureSubmitting, setCaptureSubmitting] = useState(false);
  const [captureMsg,     setCaptureMsg]     = useState("");

  const submitCaptureEmail = async () => {
    if (!captureEmail.includes("@")) return;
    setCaptureSubmitting(true);
    try {
      await fetch(`${API_BASE}/subscribe`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ email: captureEmail.trim(), source: "scan_result" }),
      });
      setCaptureMsg("You are in! Check your inbox for a welcome email.");
      try { localStorage.setItem("ps_email_captured","1"); } catch {}
      setTimeout(()=>setEmailDismissed(true), 3000);
    } catch {
      setCaptureMsg("Something went wrong. Please try again.");
    }
    setCaptureSubmitting(false);
  };
  const [emailInput,  setEmailInput] = useState("");
  const [emailDone,   setEmailDone]  = useState(false);
  const [user,        setUser]       = useState(null);
  const [showAuth,    setShowAuth]   = useState(false);
  const [showNicknamePrompt, setShowNicknamePrompt] = useState(false);
  const [childMode,     setChildMode]  = useState(()=>localStorage.getItem("partiqule_child_mode")==="1");
  const [pregnancyMode, setPregnancyMode] = useState(()=>localStorage.getItem("partiqule_pregnancy_mode")==="1");
  const [revealDone,    setRevealDone]  = useState(false);
  // streamStage: null | "identified" | "scored" | "alternatives" — drives
  // the rotating caption + score-arc placeholder while the streaming /analyze
  // endpoint progresses through its seam points. Cleared on complete or error.
  const [streamStage,   setStreamStage] = useState(null);
  // Streaming: once the first identified event arrives, hide the full-screen
  // loading overlay so the result page can render progressively. The result
  // itself carries _streaming + _stage which drive the in-page placeholder
  // and rotating caption. Must come AFTER the useState above — the
  // dependency-array literal [streamStage] is evaluated immediately and
  // would TDZ-throw if this useEffect ran before the const initializer.
  useEffect(()=>{
    if (streamStage) setShowOverlay(false);
  }, [streamStage]);
  const [showAlts,    setShowAlts]   = useState(false);
  const [showDetail,  setShowDetail] = useState(false);
  const [compareAlt,  setCompareAlt] = useState(null);
  const [fabOpen,     setFabOpen]    = useState(false);
  const [altSource,   setAltSource]  = useState("amazon"); // "amazon" | "brand" | "bigbox"
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanSheetOpen, setScanSheetOpen] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  // Branded loading phase between barcode detection and result. null | "loading" | "error".
  const [barcodeLoadingPhase, setBarcodeLoadingPhase] = useState(null);
  // Vision Contract v2 response states. null when not active.
  // visionConfirmation: { identificationId, productName, brand, message } — low-confidence identification needs user confirmation
  // visionRefusal: { productName, message } — cascade found nothing and label not legible, ask user to retake
  const [visionConfirmation, setVisionConfirmation] = useState(null);
  const [visionRefusal, setVisionRefusal] = useState(null);
  const [explanationEnriching, setExplanationEnriching] = useState(false);
  // Shown after a successful Apple IAP purchase or restore. Gives the user
  // (and Apple's reviewer) an explicit visual signal that the subscription
  // benefit was granted — the previous silent flow is the specific behavior
  // Apple flagged in the 2026-04-22 rejection.
  const [purchaseSuccess, setPurchaseSuccess] = useState(null); // null | { kind: "purchase" | "restore" }
  const [modalQuery,  setModalQuery] = useState("");
  // ── Text search match picker (verified-source only) ─────────────
  // Debounced /search call surfaces calibration + prior-scan matches so users
  // can get a scored result from typing when we have verified data. Raw text
  // queries without a productId pick are still blocked by the backend gate.
  const [searchMatches, setSearchMatches] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchedQuery, setSearchedQuery] = useState(""); // last query that returned from /search, for empty-state gating
  const searchDebounceRef = useRef(null);
  const searchAbortRef    = useRef(null);
  // ── Scan counter + subscription ───────────────────────────────
  const [scanCount,    setScanCount]    = useState(()=>{try{return parseInt(localStorage.getItem("ps_scan_count")||"0");}catch{return 0;}});
  const [updateRequired, setUpdateRequired] = useState(null); // {minVersion} when running version is below MIN_*_VERSION
  const [showReviewPrompt, setShowReviewPrompt] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(null); // "account" | "paywall" | null
  const [iapPrice,     setIapPrice]     = useState("$4.99/month"); // loaded from StoreKit
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAccountDeleted, setShowAccountDeleted] = useState(false);

  const deleteAccount = async () => {
    if (!user) { setError("Not signed in."); setTimeout(()=>setError(null),3000); return; }
    try {
      const r = await authedFetch(`${API_BASE}/delete-account`, {
        method:"POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({}),
      });
      const d = await r.json();
      if (!r.ok) { setShowDeleteConfirm(false); setError("Delete failed. Please try again."); setTimeout(()=>setError(null),4000); return; }
      await supabase.auth.signOut().catch(()=>{});
      setUser(null);
      setShowDeleteConfirm(false);
      setHistory([]);
      try { localStorage.removeItem("ps_history"); } catch {}
      setPage("home");
      setResult(null);
      setShowAccountDeleted(true);
      setTimeout(() => setShowAccountDeleted(false), 4000);
    } catch(e) { setShowDeleteConfirm(false); setError("Something went wrong. Please try again."); setTimeout(()=>setError(null),4000); }
  };
  const [checkingOut,  setCheckingOut]  = useState(false);
  const [iapTimedOut,  setIapTimedOut]  = useState(false);
  const FREE_LIMIT = 10;
  const PAID_LIMIT = 20;
  // ── Accessibility: font scale ────────────────────────────────
  const [fontScale,   setFontScale]  = useState(()=>{try{return parseFloat(localStorage.getItem("ps_font_scale")||"1");}catch{return 1;}});
  const cycleFontScale = () => {
    const next = fontScale >= 1.4 ? 1 : parseFloat((fontScale + 0.2).toFixed(1));
    setFontScale(next);
    try { localStorage.setItem("ps_font_scale", next); } catch {}
  };
  // Apply font scale to root
  useEffect(() => {
    document.documentElement.style.fontSize = fontScale === 1 ? "" : `${fontScale * 100}%`;
  }, [fontScale]);

  const width   = useWindowWidth();
  const isMobile = width < 768;
  const isTablet = width >= 768 && width <= 1024;

  // ── Auth helper ──────────────────────────────────────────────
  // Returns { "Authorization": "Bearer <jwt>" } for the current session, or
  // ── Auth listener ────────────────────────────────────────────
  const checkSubscription = async (userId) => {
    try {
      const r = await fetch(`${API_BASE}/subscription-status?userId=${userId}`);
      const d = await r.json();
      setIsSubscribed(!!d.is_subscribed);
      return !!d.is_subscribed;
    } catch { setIsSubscribed(false); return false; }
  };

  const syncScanCount = async (userId) => {
    try {
      const r = await fetch(`${API_BASE}/scan-count?userId=${userId}`);
      const d = await r.json();
      const serverCount = d.scan_count || 0;
      const localCount = parseInt(localStorage.getItem("ps_scan_count") || "0");
      // Use whichever is higher — server wins across devices
      const finalCount = Math.max(serverCount, localCount);
      setScanCount(finalCount);
      try { localStorage.setItem("ps_scan_count", String(finalCount)); } catch {}
    } catch {}
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        loadCloudHistory(session.user.id);
        // Check subscription FIRST before syncing scan count — prevents race condition
        // where high server scan count fires paywall before subscription status arrives
        checkSubscription(session.user.id).then(() => {
          syncScanCount(session.user.id);
        });
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user || null;
      setUser(u);
      if (u) {
        loadCloudHistory(u.id);
        checkSubscription(u.id).then(() => syncScanCount(u.id));
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Stripe checkout ───────────────────────────────────────────
  const IAP_PRODUCT_ID = "com.partiqule.app.premium.monthly";

  // Load product price from StoreKit on iOS so we show the real App Store price
  useEffect(() => {
    console.log("[IAP] price-fetch effect fired, IS_NATIVE:", IS_NATIVE);
    if (!IS_NATIVE) return;
    (async () => {
      try {
        console.log("[IAP] price-fetch: loading native purchases");
        const { plugin: np } = await loadNativePurchases();
        if (!np) { console.log("[IAP] price-fetch: np is null, aborting"); return; }
        console.log("[IAP] price-fetch: calling getProducts with", IAP_PRODUCT_ID);
        const result = await np.getProducts({
          productIdentifiers: [IAP_PRODUCT_ID],
          productType: PURCHASE_TYPE.SUBS,
        });
        console.log("[IAP] price-fetch: getProducts returned", JSON.stringify(result).slice(0, 500));
        const products = result?.products;
        if (products?.[0]?.priceString) setIapPrice(products[0].priceString + "/month");
        else console.log("[IAP] price-fetch: no priceString in result — product not found in StoreKit?");
      } catch (e) {
        console.error("[IAP] price-fetch FAILED:", e?.name, e?.message, e?.stack);
      }
    })();
  }, []);

  // Shared Apple IAP restore flow — verifies the entitlement on-device via
  // getPurchases, POSTs the restored transaction to /apple-iap-confirm so
  // profiles.is_subscribed updates, then round-trips via checkSubscription.
  // Without the POST step the restore would revert on next app launch; without
  // the getPurchases check any user could tap Restore on a fresh install and
  // appear subscribed until reload.
  const restoreSubscription = async () => {
    if (!user) { setShowAuth(true); return; }
    try {
      const { plugin: np } = await loadNativePurchases();
      if (!np) {
        setError("Couldn't connect to the App Store. Try again later.");
        setTimeout(() => setError(null), 4000);
        return;
      }
      await np.restorePurchases();
      let purchases = [];
      try {
        const r = await np.getPurchases({ onlyCurrentEntitlements: true });
        purchases = Array.isArray(r?.purchases) ? r.purchases : [];
      } catch (e) {
        console.warn("[IAP] getPurchases failed:", e?.message);
      }
      // Plugin's getPurchases returns the same flat shape as purchaseProduct
      // (TransactionHelpers.buildTransactionResponse). productIdentifier and
      // transactionId are top-level keys — not nested and not ...Identifier.
      const active = purchases.find(p =>
        p?.productIdentifier === IAP_PRODUCT_ID && p?.isActive !== false,
      );
      if (!active) {
        setError("No active Partiqule subscription found on this Apple ID.");
        setTimeout(() => setError(null), 4000);
        return;
      }
      const txnId = active.transactionId || "restored";
      const confirmRes = await authedFetch(`${API_BASE}/apple-iap-confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: txnId,
          receipt: active.receipt || active.jwsRepresentation || null,
        }),
      });
      if (!confirmRes.ok) {
        setError("We couldn't restore your subscription on our side. Contact support.");
        setTimeout(() => setError(null), 5000);
        return;
      }
      let verified = false;
      try { verified = await checkSubscription(user.id); } catch {}
      setIsSubscribed(true);
      setScanCount(0);
      try { localStorage.setItem("ps_scan_count", "0"); } catch {}
      setShowLimitModal(null);
      setPurchaseSuccess({ kind: "restore" });
    } catch (e) {
      const msg = e?.message || "";
      if (!msg.includes("cancelled") && !msg.includes("cancel")) {
        setError("Couldn't restore your purchase. Try again.");
        setTimeout(() => setError(null), 4000);
      }
    }
  };

  const startCheckout = async () => {
    if (!user) { setShowAuth(true); return; }

    if (IS_NATIVE) {
      console.log("[IAP] startCheckout: IS_NATIVE path, user:", user?.id);
      // iOS — purchase via StoreKit through @capgo/native-purchases
      setCheckingOut(true);
      setIapTimedOut(false);
      const purchaseStart = Date.now();
      const iapTimeout = setTimeout(() => {
        console.error("[IAP] TIMEOUT at 12000ms — purchaseProduct never resolved. Elapsed:", Date.now() - purchaseStart, "ms");
        setCheckingOut(false);
        setIapTimedOut(true);
      }, 12000);
      try {
        console.log("[IAP] startCheckout: loading native purchases");
        const { plugin: np } = await loadNativePurchases();
        console.log("[IAP] startCheckout: np =", np ? "OK" : "NULL");
        if (!np) {
          clearTimeout(iapTimeout);
          setCheckingOut(false);
          setIapTimedOut(true);
          setError("Unable to connect to the App Store. Try again or subscribe on our website.");
          setTimeout(() => setError(null), 5000);
          return;
        }
        console.log("[IAP] startCheckout: calling purchaseProduct", IAP_PRODUCT_ID, "type:", PURCHASE_TYPE.SUBS);
        const purchaseResult = await np.purchaseProduct({
          productIdentifier: IAP_PRODUCT_ID,
          productType: PURCHASE_TYPE.SUBS,
        });
        console.log("[IAP] purchaseProduct RESOLVED after", Date.now() - purchaseStart, "ms. Result:", JSON.stringify(purchaseResult).slice(0, 500));
        // The @capgo/native-purchases plugin returns a FLAT response dict
        // (see TransactionHelpers.swift buildTransactionResponse). Keys:
        // { transactionId, productIdentifier, receipt?, jwsRepresentation,
        //   productType, purchaseDate, isUpgraded, ownershipType,
        //   originalPurchaseDate, expirationDate, isActive, ... }
        // Don't gate on purchaseResult.isActive at purchase time: it reflects
        // expirationDate > now, which in sandbox queue-replay is always false
        // (StoreKit dequeues old expired renewals on each purchaseProduct call).
        // A just-completed purchase via payment sheet is always active in prod.
        // For the richer "current entitlement" check we do a separate
        // getPurchases call below — if that returns an active match we use it
        // as the source of truth, otherwise we fall back to purchaseResult.
        clearTimeout(iapTimeout);
        const matches = purchaseResult?.productIdentifier === IAP_PRODUCT_ID;
        let entitlement = null;
        try {
          const rp = await np.getPurchases({ onlyCurrentEntitlements: true });
          entitlement = (rp?.purchases || []).find(
            p => p?.productIdentifier === IAP_PRODUCT_ID && p?.isActive !== false,
          ) || null;
        } catch (e) { console.warn("[IAP] getPurchases-after-purchase failed:", e?.message); }
        const txn = entitlement || (matches ? purchaseResult : null);
        const txnId = txn?.transactionId;
        if (txnId) {
          console.log("[IAP] activating from", entitlement ? "current entitlement" : "purchase result",
            "txnId:", txnId, "isActive:", txn?.isActive);
          // Persist to backend FIRST. The server flips profiles.is_subscribed
          // (what /subscription-status reads) — without this the in-memory
          // isSubscribed=true reverts to false on the next app launch and the
          // user loses premium benefits silently. That exact flow is what
          // Apple flagged in 2026-04-22.
          let backendOk = false;
          try {
            const confirmRes = await authedFetch(`${API_BASE}/apple-iap-confirm`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                transactionId: txnId,
                receipt: txn?.receipt || txn?.jwsRepresentation || null,
              }),
            });
            backendOk = confirmRes.ok;
            if (!confirmRes.ok) {
              const body = await confirmRes.text().catch(() => "");
              console.warn("[IAP] apple-iap-confirm non-2xx:", confirmRes.status, body.slice(0, 200));
            }
          } catch (confirmErr) {
            console.warn("[IAP] apple-iap-confirm POST failed:", confirmErr?.message);
          }

          if (!backendOk) {
            // StoreKit accepted the purchase but our server didn't persist.
            // User is charged. Surface this loudly instead of silently flipping
            // in-memory state that won't survive reload.
            setError("Purchase went through at Apple but we couldn't activate premium on our side. Try Restore Purchases in Settings, or contact support.");
            setTimeout(() => setError(null), 8000);
          } else {
            // Backend confirmed. Round-trip verify via /subscription-status so
            // local state matches server state — guards against edge cases
            // (e.g. user record missing, race on profile update).
            let verified = false;
            try { verified = await checkSubscription(user.id); } catch {}
            if (verified) {
              setScanCount(0);
              try { localStorage.setItem("ps_scan_count", "0"); } catch {}
              setShowLimitModal(null);
              setIapTimedOut(false);
              setPurchaseSuccess({ kind: "purchase" });
            } else {
              // Extremely rare — backend returned 200 but status endpoint still
              // says not subscribed. Surface it, don't fake success.
              console.warn("[IAP] backend confirmed but /subscription-status still reports not subscribed");
              setIsSubscribed(true); // fall back to local state rather than lock user out
              setShowLimitModal(null);
              setPurchaseSuccess({ kind: "purchase" });
            }
          }
        } else {
          console.log("[IAP] no activatable transaction — matches:", matches,
            "entitlement found:", !!entitlement,
            "purchaseResult.productIdentifier:", purchaseResult?.productIdentifier);
          setIapTimedOut(true);
        }
      } catch (e) {
        clearTimeout(iapTimeout);
        console.error("[IAP] purchaseProduct THREW after", Date.now() - purchaseStart, "ms. name:", e?.name, "message:", e?.message, "code:", e?.code, "stack:", e?.stack);
        const msg = e?.message || "";
        if (!msg.includes("cancelled") && !msg.includes("cancel")) {
          setIapTimedOut(true);
          setError("Purchase could not be completed. Try again or subscribe on our website.");
          setTimeout(() => setError(null), 5000);
        }
      }
      setCheckingOut(false);
      return;
    }

    // Web — Stripe checkout
    setCheckingOut(true);
    try {
      const r = await fetch(`${API_BASE}/create-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, email: user.email }),
      });
      const d = await r.json();
      if (d.url) { window.location.href = d.url; }
    } catch { setError("Something went wrong. Please try again."); setTimeout(()=>setError(null),4000); }
    setCheckingOut(false);
  };

  const loadCloudHistory = async (userId) => {
    const { data, error } = await supabase
      .from("scans")
      .select("result_json, scanned_at")
      .eq("user_id", userId)
      .order("scanned_at", { ascending: false })
      .limit(50);
    if (!error && data?.length) {
      const items = data.map(r => ({...r.result_json, scannedAt: r.scanned_at}));
      setHistory(items);
      try { localStorage.setItem("ps_history", JSON.stringify(items)); } catch {}
    }
  };

  // Platform signal for analytics — "ios" for Capacitor native wrapper,
  // "pwa" for standalone installed PWA, "web" for everything else. Written
  // on every cloud scan so we can break down scan volume by surface.
  // Added 2026-04-24. Supabase migration must add the `platform` column to
  // `scans` before this field will persist (see the ALTER TABLE in Ops).
  const detectPlatform = () => {
    if (IS_NATIVE) return "ios";
    try {
      if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return "pwa";
      if (window.navigator.standalone === true) return "pwa"; // iOS Safari "Add to Home Screen"
    } catch {}
    return "web";
  };

  const saveToCloud = async (item, userId) => {
    try {
      const { error } = await supabase.from("scans").upsert({
        user_id:      userId,
        product_name: item.product_name,
        category:     item.category || "other",
        score:        item.score || 0,
        platform:     detectPlatform(),
        // Store lightweight version — skip large AI arrays to keep row size manageable
        result_json:  {
          product_name:     item.product_name,
          category:         item.category,
          score:            item.score,
          overall_score:    item.overall_score,
          child_score:      item.child_score      ?? null,
          is_child_product: item.is_child_product ?? null,
          child_bumps:      item.child_bumps       ?? null,
          pregnancy_score:  item.pregnancy_score   ?? null,
          pregnancy_bumps:  item.pregnancy_bumps   ?? null,
          summary:          item.summary,
          confidence:       item.confidence,
          concerns:         item.concerns,
          dimensions:       item.dimensions,
          food_analysis:    item.food_analysis,
          cached:           item.cached,
          input_mode:            item.input_mode            ?? null,
          scoring_path:          item.scoring_path          ?? null,
          original_scoring_path: item.original_scoring_path ?? null,
          latency_ms:            item.latency_ms            ?? null,
        },
        scanned_at:   new Date().toISOString(),
      }, { onConflict: "user_id,product_name" });
      if (error) console.warn("Cloud sync failed:", error.message);
    } catch(e) {
      console.warn("Cloud sync error:", e.message);
      // Non-critical — local history still saved
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  // Read slug from URL on first load
  useEffect(() => {
    const path   = window.location.pathname;
    const params = new URLSearchParams(window.location.search);

    // Stripe redirect — subscription confirmed
    if (params.get("subscribed") === "true") {
      setIsSubscribed(true);
      setScanCount(0);
      try { localStorage.setItem("ps_scan_count", "0"); } catch {}
      window.history.replaceState({}, "", path); // clean URL
    }

    // Admin page — gated server-side via JWT + allowlisted email.
    // Render the page; the AdminPage component verifies access on mount
    // and shows a 404-style fallback if the signed-in user isn't on the list.
    if (path === "/admin") {
      setPage("admin");
      return;
    }

    const scanMatch = path.match(/^\/scan\/(.+)$/);
    if (scanMatch) {
      const slug = scanMatch[1];
      const name = slug.replace(/-/g," ").replace(/\b\w/g,c=>c.toUpperCase());
      // Check if cached history has an exact slug match to avoid collision
      // e.g. "honey-nut-cheerios" should not load "Honey Nut Cheerios Value Pack"
      try {
        const hist = JSON.parse(localStorage.getItem("ps_history") || "[]");
        const match = hist.find(h => toSlug(h.product_name) === slug);
        if (match) { setResult(match); setQuery(match.product_name); return; }
      } catch {}
      // No cache match — run a fresh scan
      setTimeout(()=>analyze(name), 100);
      return;
    }
    if (path === "/privacy") { setPage("privacy"); return; }
    if (path === "/about") { setPage("about"); return; }
    if (path === "/methodology") { setPage("methodology"); return; }
    if (path === "/terms") { setPage("terms"); return; }
    if (path === "/guides") { setPage("guides"); return; }
    if (path.startsWith("/guides/")) { setPage("guide"); setGuideSlug(path.replace("/guides/","")); return; }
    if (path === "/feed") { setPage("feed"); return; }
    if (path === "/account") { setPage("settings"); return; }
    if (path === "/reset-password") { setPage("reset-password"); return; }

    const known = ["/", "/science", "/history", "/privacy", "/terms", "/about", "/methodology", "/guides", "/account", "/feed", "/reset-password"];
    const isScanPath = path.startsWith("/scan/");
    const isGuidePath = path.startsWith("/guides/");
    if (!known.includes(path) && !isScanPath && !isGuidePath) setPage("404");
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

  // Fetch live intelligence cards on mount
  useEffect(()=>{fetch(`${API_BASE}/api/intelligence-cards`).then(r=>r.json()).then(d=>setLiveIntelCards(d.cards||[])).catch(()=>{});},[]);

  // Minimum-version check on mount. If the running APP_VERSION is below
  // the server-controlled MIN_*_VERSION, render the UpdateRequiredView
  // gate instead of the app. Permissive default — the gate only fires
  // when env vars are explicitly set to a higher version in Railway.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/min-version`);
        if (!r.ok) return;
        const d = await r.json();
        if (cancelled) return;
        const minForPlatform = IS_NATIVE ? (d.ios_min || "0.0.0") : (d.web_min || "0.0.0");
        if (compareVersions(APP_VERSION, minForPlatform) < 0) {
          setUpdateRequired({ minVersion: minForPlatform });
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Review-prompt trigger: fires once per device when scanCount crosses
  // 20. localStorage flag prevents re-firing. Anonymous users with no
  // cloud-synced count can still hit this via local scan tracking.
  useEffect(() => {
    if (showReviewPrompt) return;
    if (scanCount < 20) return;
    let alreadyPrompted = false;
    try { alreadyPrompted = !!localStorage.getItem("ps_review_prompted"); } catch {}
    if (alreadyPrompted) return;
    // Small delay so the prompt doesn't slam onto a fresh scan result
    const t = setTimeout(() => setShowReviewPrompt(true), 1800);
    return () => clearTimeout(t);
  }, [scanCount, showReviewPrompt]);

  // Scroll to top on every page change and every result load
  useEffect(() => {
    window.scrollTo(0, 0);
    // Track page views for all non-home pages
    if (page !== "home") track("Page View", { page });
  }, [page, result]);

  const saveToHistory = (item) => {
    setHistory(prev=>{
      const filtered = prev.filter(h=>h.product_name!==item.product_name);
      const updated  = [{...item, scannedAt: new Date().toISOString()}, ...filtered].slice(0, 100); // cap at 100 — prevents localStorage quota overflow
      try {
        localStorage.setItem("ps_history", JSON.stringify(updated));
      } catch(e) {
        // localStorage quota exceeded — trim further and retry
        try {
          const trimmed = updated.slice(0, 50);
          localStorage.setItem("ps_history", JSON.stringify(trimmed));
          return trimmed;
        } catch { /* silent — cloud sync still works if signed in */ }
      }
      return updated;
    });
    if (user) saveToCloud(item, user.id);
  };

  const analyze = async (q=query) => {
    if (!q.trim()) return Promise.resolve();
    try { document.activeElement?.blur?.(); } catch {}
    setShowScanModal(false); // always close the modal when a scan kicks off
    // ── Scan limit gate ──
    if (!isSubscribed) {
      if (scanCount >= FREE_LIMIT) {
        if (!user) setShowLimitModal("account");
        else setShowLimitModal("paywall");
        return;
      }
    }
    setLoading(true); setError(null); setResult(null); setRevealDone(false);
    setStreamStage(null);
    track("Scan", { product: q.trim() });
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 75000);
      let partial = {};
      await streamingAnalyze({ query: q.trim() }, {
        identified: (e) => {
          partial = { ...partial, ...e, _streaming: true, _stage: "identified" };
          setResult({ ...partial });
          setStreamStage("identified");
        },
        scored: (e) => {
          partial = { ...partial, ...e, _streaming: true, _stage: "scored" };
          setResult({ ...partial });
          setStreamStage("scored");
        },
        alternatives: (e) => {
          partial = { ...partial, ...e, _streaming: true, _stage: "alternatives" };
          setResult({ ...partial });
          setStreamStage("alternatives");
        },
        complete: (data) => {
          setResult(data);
          saveToHistory(data);
          setStreamStage(null);
          if (["cleaning","home","personal_care","skincare","clothing","baby","toy","food","food_beverage","beverage","snack"].includes(data.category)) setPendingRoomTag(data.product_name); else setPendingRoomTag(null);
          track("Score Returned", { product: data.product_name, score: data.score, category: data.category });
          if (!isSubscribed) {
            const newCount = scanCount + 1;
            setScanCount(newCount);
            try { localStorage.setItem("ps_scan_count", String(newCount)); } catch {}
            if (newCount >= FREE_LIMIT) {
              if (!user) setShowLimitModal("account");
              else setShowLimitModal("paywall");
            }
          }
        },
        error: (e) => { throw new Error(e.error || e.message || "Scan failed"); },
      }, controller.signal);
      clearTimeout(timeout);
    } catch(e){
      const msg = e.name === "AbortError"
        ? "Scan timed out — please try again in a moment."
        : e.message;
      setError(msg);
      setStreamStage(null);
      track("Scan Error", { error: msg });
    }
    setLoading(false);
  };

  // ── Match picker: tapping a search match runs /analyze with productId ──
  const selectSearchMatch = async (match) => {
    if (!match?.id) return;
    try { document.activeElement?.blur?.(); } catch {}
    if (!isSubscribed && scanCount >= FREE_LIMIT) {
      if (!user) setShowLimitModal("account");
      else setShowLimitModal("paywall");
      return;
    }
    setLoading(true); setError(null); setResult(null); setRevealDone(false);
    setStreamStage(null);
    setSearchMatches([]); // collapse picker so result can render cleanly
    track("Search Match Select", { matchId: match.id, source: match.source, name: match.display_name });
    try {
      let partial = {};
      await streamingAnalyze({ productId: match.id }, {
        identified: (e) => { partial = { ...partial, ...e, _streaming: true, _stage: "identified" }; setResult({ ...partial }); setStreamStage("identified"); },
        scored: (e) => { partial = { ...partial, ...e, _streaming: true, _stage: "scored" }; setResult({ ...partial }); setStreamStage("scored"); },
        alternatives: (e) => { partial = { ...partial, ...e, _streaming: true, _stage: "alternatives" }; setResult({ ...partial }); setStreamStage("alternatives"); },
        complete: (data) => {
          setResult(data); saveToHistory(data); setQuery(data.product_name || match.display_name);
          setStreamStage(null);
          if (["cleaning","home","personal_care","skincare","clothing","baby","toy","food","food_beverage","beverage","snack"].includes(data.category)) setPendingRoomTag(data.product_name); else setPendingRoomTag(null);
          track("Score Returned", { product: data.product_name, score: data.score, category: data.category, via: "search_match" });
          if (!isSubscribed) {
            const newCount = scanCount + 1;
            setScanCount(newCount);
            try { localStorage.setItem("ps_scan_count", String(newCount)); } catch {}
            if (newCount >= FREE_LIMIT) {
              if (!user) setShowLimitModal("account");
              else setShowLimitModal("paywall");
            }
          }
        },
        error: (e) => { throw new Error(e.error || e.message || "Couldn't load that product."); },
      });
    } catch (e) {
      setError(e.message || "Couldn't load that product.");
      setStreamStage(null);
      track("Search Match Error", { error: e.message });
    }
    setLoading(false);
  };

  // ── Debounced /search as the user types in the home search bar ──
  useEffect(() => {
    // Hide the picker once a result is on screen.
    if (result) { setSearchMatches([]); setSearchLoading(false); return; }
    const trimmed = (query || "").trim();
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (searchAbortRef.current) { try { searchAbortRef.current.abort(); } catch {} searchAbortRef.current = null; }
    if (trimmed.length < 3) {
      setSearchMatches([]);
      setSearchLoading(false);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      const ctrl = new AbortController();
      searchAbortRef.current = ctrl;
      setSearchLoading(true);
      try {
        const url = `${API_BASE}/search?q=${encodeURIComponent(trimmed)}${user?.id ? `&userId=${encodeURIComponent(user.id)}` : ""}`;
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) { setSearchMatches([]); return; }
        const data = await res.json();
        setSearchMatches(Array.isArray(data.matches) ? data.matches : []);
        setSearchedQuery(trimmed);
      } catch (e) {
        if (e.name !== "AbortError") { setSearchMatches([]); setSearchedQuery(trimmed); }
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [query, result, user?.id]);

  const runDemo = () => {
    const demo = {
      product_name: "M&Ms Milk Chocolate Candies",
      category: "food",
      score: 7,
      overall_score: 7,
      child_score: 9,
      child_bumps: ["Children's developing organ systems require more protective thresholds", "Petroleum dyes disrupt neurodevelopment — hyperactivity link confirmed in children (McCann, Lancet 2007)", "Child vulnerability — M&Ms commonly consumed by children daily"],
      is_child_product: true,
      summary: "Ultra-processed candy with four FDA-flagged petroleum dyes, daily ingestion pathway, and single-use plastic packaging.",
      confidence: "high",
      confidence_note: "Ingredient list confirmed — well-documented formula",
      cached: true,
      isDemo: true,
      composition_tier: 4,
      nutrition: { serving_size:"1.69 oz (48g)", calories:240, protein_g:2, carbs_g:33, sugar_g:31, fat_g:10, sat_fat_g:5, fiber_g:0, sodium_mg:30 },
      ingredient_list: ["milk chocolate (sugar, chocolate, skim milk, cocoa butter, lactose, milkfat, soy lecithin, salt, artificial flavors)", "sugar", "cornstarch", "corn syrup", "gum acacia", "coloring (Red 40, Yellow 5, Yellow 6, Blue 1)", "carnauba wax", "dextrin"],
      identified_plastics: ["Polyethylene (bag packaging)"],
      harmful_chemicals: ["Red 40", "Yellow 5", "Yellow 6", "Blue 1", "Titanium dioxide"],
      natural_materials: [],
      concerns: ["Four FDA-flagged petroleum dyes linked to hyperactivity and carcinogenicity", "Titanium dioxide banned in EU food — IARC Group 2B", "Ultra-processed formula with daily ingestion pathway"],
      exposure_frequency: "daily",
      exposure_type: "ingestion",
      scan_next: ["Skittles", "Reese's Pieces", "Sour Patch Kids", "Organic dark chocolate"],
      break_even: { uses: null, alternative_name: "Hu Chocolate Bar", note: "Switch to dye-free organic chocolate", source: "Food dye harm reduction" },
      food_analysis: {
        composition_tier: 4,
        tier_label: "ultra_processed",
        tier_description: "Industrial candy with multiple synthetic additives",
        nutrition: { serving_size:"1.69 oz (48g)", calories:240, protein_g:2, carbs_g:33, sugar_g:31, fat_g:10, sat_fat_g:5, fiber_g:0, sodium_mg:30 },
        nutrition_verified: true,
        concerns: [
          { substance: "Red 40 (Allura Red)", type: "dye", severity: "high", reason: "FDA phasing out — hyperactivity and carcinogenicity in studies" },
          { substance: "Yellow 5 (Tartrazine)", type: "dye", severity: "high", reason: "Linked to hyperactivity and ADHD in children (McCann, Lancet 2007)" },
          { substance: "Yellow 6 (Sunset Yellow)", type: "dye", severity: "high", reason: "Hyperactivity link, possible carcinogen under review" },
          { substance: "Blue 1 (Brilliant Blue)", type: "dye", severity: "high", reason: "FDA phasing out all petroleum-based food dyes (2025)" },
          { substance: "Titanium dioxide", type: "additive", severity: "high", reason: "IARC Group 2B — banned in EU food since 2022" },
          { substance: "Artificial flavors", type: "additive", severity: "low", reason: "Undisclosed petroleum-derived compounds" },
          { substance: "Sugar", type: "additive", severity: "low", reason: "31g per serving — 62% adult DV, 124% children's DV" },
        ],
        positives: [],
        confidence: "high",
        confidence_note: "Ingredient list verified from product label",
      },
      dimensions: {
        materials:    { score:8, label:"Four FDA-flagged petroleum dyes + titanium dioxide — all high concern", concerns:["Red 40, Yellow 5, Yellow 6, Blue 1 — FDA phasing out entire class","Titanium dioxide banned in EU food (IARC Group 2B)"] },
        usage_exposure:{ score:7, label:"Daily candy ingestion — direct chemical consumption", frequency:"daily", type:"ingestion", intensity:"single-contact", vulnerable:true, concerns:["Daily direct ingestion of multiple synthetic chemicals","Children particularly sensitive — developing immune and hormonal systems"] },
        packaging:    { score:5, label:"Single-use plastic bag — not recyclable", primary:"plastic", refillable:false, end_of_life:"landfill", concerns:["Multi-layer plastic film bag — not accepted by curbside recycling"] },
        sustainability:{ score:6, label:"Single-use by design — packaging discarded at every purchase", reusable:false, replaces_single_use:false, replaces_count:null, circularity:"landfill", concerns:["Single-use plastic packaging","Mars Inc. sustainability commitments unverified at product level"] },
        manufacturing: { score:5, label:"Large-scale industrial confectionery manufacturing", tier:"neutral", confidence:"low", concerns:["Supply chain data not independently verified"] },
      },
      alternatives: [
        { id:"hu-bar", name:"Hu Chocolate Bar", brand:"Hu", score:2, material:"Organic cacao, no refined sugar, no soy lecithin", description:"No refined sugar, no dairy, no emulsifiers, no artificial flavors. USDA Organic.", price:"$3-4", affiliateUrl:"https://www.amazon.com/s?k=hu+chocolate+bar&tag=partiqule-20", category:"food" },
        { id:"unreal-choc", name:"Unreal Dark Chocolate Gems", brand:"Unreal", score:2, material:"No artificial dyes — colored with plant-based ingredients", description:"M&M-style chocolate candies with no artificial colors, flavors or preservatives.", price:"$5-7", affiliateUrl:"https://www.amazon.com/s?k=unreal+dark+chocolate+gems&tag=partiqule-20", category:"food" },
        { id:"yum-earth", name:"YumEarth Organic Gummy Bears", brand:"YumEarth", score:2, material:"Organic fruit juice colors, no petroleum dyes", description:"USDA Organic, no artificial dyes, allergen-free. Colored with organic fruit and vegetable juice.", price:"$6-8", affiliateUrl:"https://www.amazon.com/s?k=yumearth+organic+candy&tag=partiqule-20", category:"food" },
      ],
      ai_alternatives: [],
      peer_comparison: "M&Ms scores higher than 85% of scanned food and beverage products.",
      scannedAt: new Date().toISOString(),
    };
    setResult(demo);
    setQuery("M&Ms Milk Chocolate Candies");
    window.scrollTo(0,0);
  };

  const [pendingRoomTag, setPendingRoomTag] = useState(null);
  const reset = () => {setResult(null); setError(null); setQuery(""); setPage("home"); setMenuOpen(false); setShowAlts(false); setShowDetail(false); setFabOpen(false); setShowScanModal(false); setScanSheetOpen(false); setShowBarcodeScanner(false); setBarcodeLoadingPhase(null); setModalQuery(""); setPendingRoomTag(null); setSearchMatches([]); setSearchedQuery("");};

  // Shared image scan handler — used by hero and scan modal
  const handleImageScan = async (file, onDone) => {
    if (!file) return;
    // ── Scan limit gate — same as text scan ──
    if (!isSubscribed && scanCount >= FREE_LIMIT) {
      if (!user) setShowLimitModal("account");
      else setShowLimitModal("paywall");
      return;
    }
    setShowScanModal(false); setScanSheetOpen(false);
    setResult(null); setError(null); setPage("home");
    setLoading(true); setQuery("Reading label..."); setRevealDone(false); setResult(null);
    try {
      // Step 1: Try barcode detection from image (instant, no server)
      let barcodeValue = null;
      if ("BarcodeDetector" in window) {
        try {
          const detector = new BarcodeDetector({formats:["ean_13","ean_8","upc_a","upc_e","code_128","code_39","qr_code"]});
          const bitmap = await createImageBitmap(file);
          const barcodes = await detector.detect(bitmap);
          if (barcodes.length > 0) { barcodeValue = barcodes[0].rawValue; }
        } catch { /* barcode detection unavailable */ }
      }

      // Step 2a: Barcode found — use /barcode endpoint (fast path)
      if (barcodeValue) {
        setQuery("Barcode found — looking up product...");
        try {
          const barcodeRes = await fetch(`${API_BASE}/barcode`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({barcode:barcodeValue,userId:user?.id||null})});
          if (barcodeRes.ok) {
            const barcodeData = await barcodeRes.json();
            if (barcodeData && !barcodeData.error) {
              setResult(barcodeData); saveToHistory(barcodeData); setLoading(false); setQuery(barcodeData.product_name||"");
              if (["cleaning","home","personal_care","skincare","clothing","baby","toy","food","food_beverage","beverage","snack"].includes(barcodeData.category)) setPendingRoomTag(barcodeData.product_name); else setPendingRoomTag(null);
              track("Barcode Scan from Image",{barcode:barcodeValue,product:barcodeData.product_name});
              if (onDone) onDone();
              return;
            }
          }
        } catch { /* barcode endpoint error, fall back to vision */ }
      }

      // Step 2b: No barcode or lookup failed — use vision
      setQuery("Analyzing label...");
      const base64 = await new Promise((res, rej) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX = 512;
          const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
          canvas.width  = Math.round(img.width  * ratio);
          canvas.height = Math.round(img.height * ratio);
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          res(canvas.toDataURL("image/jpeg", 0.80).split(",")[1]);
        };
        img.onerror = rej;
        img.src = url;
      });
      const imgController = new AbortController();
      const imgTimeout = setTimeout(() => imgController.abort(), 45000);
      let partial = {};
      let refused = false;
      try {
        await streamingAnalyze({ image: base64, mediaType: "image/jpeg" }, {
          identified: (e) => { partial = { ...partial, ...e, _streaming: true, _stage: "identified" }; setResult({ ...partial }); setStreamStage("identified"); setQuery(e.product_name || "Analyzing label..."); },
          scored: (e) => { partial = { ...partial, ...e, _streaming: true, _stage: "scored" }; setResult({ ...partial }); setStreamStage("scored"); },
          alternatives: (e) => { partial = { ...partial, ...e, _streaming: true, _stage: "alternatives" }; setResult({ ...partial }); setStreamStage("alternatives"); },
          complete: (data) => {
            // Vision v2 refusal/confirmation paths come through complete with a status field.
            if (data.status === "needs_confirmation") {
              refused = true;
              setLoading(false); setQuery(""); setResult(null); setStreamStage(null);
              setVisionConfirmation({
                identificationId: data.identificationId,
                productName: data.identified?.product_name || "this product",
                brand: data.identified?.brand || "",
                message: data.message || "",
                confirmationKind: data.confirmation_kind || "default",
                editableName: data.identified?.editable_name ||
                  (data.identified?.brand && data.identified?.product_name
                    ? `${data.identified.brand} ${data.identified.product_name}`.trim()
                    : data.identified?.product_name || ""),
              });
              return;
            }
            if (data.status === "need_better_photo") {
              refused = true;
              setLoading(false); setQuery(""); setResult(null); setStreamStage(null);
              setVisionRefusal({
                productName: data.identified?.product_name || "this product",
                message: data.message || "",
              });
              return;
            }
            if (!data.product_name) throw new Error("Nothing detected");
            setQuery(data.product_name);
            setResult(data);
            saveToHistory(data);
            setStreamStage(null);
            if (["cleaning","home","personal_care","skincare","clothing","baby","toy","food","food_beverage","beverage","snack"].includes(data.category)) setPendingRoomTag(data.product_name); else setPendingRoomTag(null);
            if (!isSubscribed) {
              const newCount = scanCount + 1;
              setScanCount(newCount);
              try { localStorage.setItem("ps_scan_count", String(newCount)); } catch {}
              if (newCount >= FREE_LIMIT) {
                if (!user) setShowLimitModal("account");
                else setShowLimitModal("paywall");
              }
            }
          },
          error: (e) => { throw new Error(e.error || e.message || "Image scan failed"); },
        }, imgController.signal);
      } catch (streamErr) {
        if (streamErr.status === 429) { setLoading(false); setQuery(""); setError("Too many requests. Please wait a moment and try again."); if (onDone) onDone(); return; }
        throw streamErr;
      }
      clearTimeout(imgTimeout);
      setLoading(false);
      if (onDone) onDone();
    } catch(err) {
      // Log every property we can — iOS webview sometimes serializes Error as {}
      console.error("[PHOTO] Image scan error:",
        "name:", err?.name,
        "message:", err?.message,
        "code:", err?.code,
        "status:", err?.status,
        "stack:", err?.stack,
        "toString:", String(err),
        "keys:", err ? Object.keys(err).join(",") : "null-err",
      );
      setLoading(false); setQuery("");
      setError(err?.name === "AbortError"
        ? "Scan timed out — please try again in a moment."
        : "Couldn't identify that product. Try a photo of the front label, nutrition panel, or clothing tag — or just type the product name.");
    }
  };

  // Vision Contract v2 — user confirmed the identification. Backend resumes
  // from cascade using the stored identificationId, skipping the vision call.
  // Same three response shapes can come back; we treat them the same way.
  const resumeFromConfirmation = async (editedName = null) => {
    if (!visionConfirmation?.identificationId) return;
    const { identificationId, productName: confirmedName } = visionConfirmation;
    setVisionConfirmation(null);
    setLoading(true); setQuery("Scoring..."); setResult(null); setError(null);
    setStreamStage("identified"); // user already confirmed name; jump straight to "scoring" caption
    const showFailModal = (message) => {
      setLoading(false); setQuery(""); setResult(null); setStreamStage(null);
      setVisionRefusal({ productName: confirmedName || "this product", message });
    };
    try {
      let partial = { product_name: confirmedName, _streaming: true, _stage: "identified" };
      setResult({ ...partial });
      const resumeBody = { identificationId };
      if (editedName && editedName.trim().length > 0) {
        resumeBody.edited_name = editedName.trim();
      }
      await streamingAnalyze(resumeBody, {
        identified: (e) => { partial = { ...partial, ...e, _stage: "identified" }; setResult({ ...partial }); setStreamStage("identified"); },
        scored: (e) => { partial = { ...partial, ...e, _stage: "scored" }; setResult({ ...partial }); setStreamStage("scored"); },
        alternatives: (e) => { partial = { ...partial, ...e, _stage: "alternatives" }; setResult({ ...partial }); setStreamStage("alternatives"); },
        complete: (data) => {
          if (data.status === "need_better_photo") {
            showFailModal(data.message || "Try another angle with better lighting.");
            return;
          }
          if (data.status === "needs_confirmation") {
            showFailModal("We couldn't find this product in any database. Try scanning the barcode or label.");
            return;
          }
          if (!data.product_name) {
            showFailModal("We couldn't score that product. Try scanning the barcode or label.");
            return;
          }
          setQuery(data.product_name);
          setResult(data);
          saveToHistory(data);
          setStreamStage(null);
          setLoading(false);
          if (!isSubscribed) {
            const newCount = scanCount + 1;
            setScanCount(newCount);
            try { localStorage.setItem("ps_scan_count", String(newCount)); } catch {}
            if (newCount >= FREE_LIMIT) {
              if (!user) setShowLimitModal("account");
              else setShowLimitModal("paywall");
            }
          }
        },
        error: (e) => { showFailModal(e.error || e.message || "Couldn't score that product."); },
      });
    } catch (err) {
      console.error("[resumeFromConfirmation] error:", err);
      if (err.status === 410) { showFailModal("That identification expired. Try scanning again."); return; }
      if (err.status === 429) { showFailModal("Too many scans right now. Try again in a few minutes."); return; }
      showFailModal("Something went wrong scoring that product. Try again.");
    }
  };

  // Fire textile enrichment when the detail view becomes
  // visible for a textile scan. Skips if already enriched
  // (summary_long > 600 chars indicates enriched copy) or if
  // the scan isn't textile. Triggering on detail-open instead
  // of scan-complete avoids a scroll jump when the enriched
  // text lands and saves the API call when users don't open
  // the deeper Why.
  useEffect(() => {
    if (!showDetail || !result) return;
    const TEXTILE_CATEGORIES = new Set(["clothing", "baby", "shoes", "home_furnishing", "accessory"]);
    const isTextileTier = result.tier === "textile_scorer" || result.tier === "textile_cascade";
    if (!TEXTILE_CATEGORIES.has(result.category) || !isTextileTier) return;
    if (result.summary_long && result.summary_long.length > 600) return;
    enrichTextileExplanation(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDetail, result?.product_name, result?.tier]);

  // Fire enrichment for textile scans. Called after the
  // deterministic scan completes. Updates summary_long when
  // the enriched explanation returns. On error or 12s timeout,
  // silently keeps the deterministic Why text.
  const enrichTextileExplanation = async (resultData) => {
    if (!resultData) return;

    const TEXTILE_CATEGORIES = new Set(["clothing", "baby", "shoes", "home_furnishing", "accessory"]);
    const isTextileTier = resultData.tier === "textile_scorer" || resultData.tier === "textile_cascade";
    if (!TEXTILE_CATEGORIES.has(resultData.category) || !isTextileTier) {
      return;
    }
    if (!resultData.textile_fibers || !Array.isArray(resultData.textile_fibers) || resultData.textile_fibers.length === 0) {
      return;
    }

    setExplanationEnriching(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const fibers = resultData.textile_fibers.map(f => ({ pct: f.pct, label: f.label }));
      const isKid = !!resultData.is_child_product;
      const productNameLower = (resultData.product_name || "").toLowerCase();
      const isSleepwear = /\b(pajama|pyjama|sleepwear|nightgown|onesie|sleeper)\b/.test(productNameLower);
      const contactLevel = /\b(underwear|base layer|legging|tight)\b/.test(productNameLower) ? "high"
        : /\b(jacket|coat|outerwear|sweater)\b/.test(productNameLower) ? "low"
        : "medium";

      const response = await fetch(`${API_BASE}/enrich-explanation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: resultData.product_name,
          brand: resultData.brand || "",
          category: resultData.category,
          score: resultData.score,
          fibers,
          kidMode: isKid,
          isSleepwear,
          contactLevel,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn("[textile_enrich] non-ok response:", response.status);
        setExplanationEnriching(false);
        return;
      }

      const data = await response.json();
      if (data.summary_long && typeof data.summary_long === "string" && data.summary_long.length > 50) {
        setResult(prev => prev ? { ...prev, summary_long: data.summary_long } : prev);
      }
    } catch (err) {
      if (err.name === "AbortError") {
        console.warn("[textile_enrich] timed out at 12s");
      } else {
        console.warn("[textile_enrich] failed:", err.message);
      }
    } finally {
      clearTimeout(timeoutId);
      setExplanationEnriching(false);
    }
  };

  const bg      = "var(--cream)";
  const surface = "var(--cream-light)";
  const border  = "var(--rule)";
  const text    = "var(--ink)";
  const muted   = "var(--ink-soft)";
  const px      = isMobile ? "16px" : "40px";

  // Hard gate: when /min-version says we're below the floor, block the
  // entire app and show the update screen. Returns early so no other
  // surfaces render — the user can only update or close.
  if (updateRequired) {
    return <UpdateRequiredView minVersion={updateRequired.minVersion}/>;
  }

  return (
    <div style={{
      minHeight:"100vh", background:bg, fontFamily:"'DM Sans',system-ui,sans-serif",
      // Reserve space at the bottom so the fixed bottom nav (72px + safe-area)
      // and the Scan Another pill (anchored at bottom:88) don't overlap body
      // content on mobile web. Without this, scrolling past the Scan Another
      // pill leaves the body visible UNDER the fixed elements — classic
      // sticky-footer overlap bug reported 2026-04-23. Larger padding when a
      // result is rendered because the pill is visible then. Desktop has no
      // bottom nav so no padding needed.
      paddingBottom: (isMobile || isTablet)
        ? (result ? "calc(160px + env(safe-area-inset-bottom, 0px))" : "calc(88px + env(safe-area-inset-bottom, 0px))")
        : 0,
    }}>
      <style>{`
        *{box-sizing:border-box;}
        body{margin:0;background:#080f0a;}
        :root{
          --green-deep:#052e16;--green-mid:#14532d;--green-bright:#22c55e;
          --lime:#a3e635;--amber:#f59e0b;--orange:#f97316;--red:#ef4444;
          --surface:#0f2a18;--card:#0f2a18;--border:rgba(34,197,94,0.15);
          --text:#f0fdf4;--muted:#6ee7b7;
        }
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}.fade-up{animation:fadeUp 0.4s ease forwards}
        @keyframes slideInUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}.score-reveal{animation:slideInUp 0.5s ease forwards}
        @keyframes arcDraw{from{stroke-dashoffset:1000}to{stroke-dashoffset:0}}.arc-animate{animation:arcDraw 1.4s cubic-bezier(0.4,0,0.2,1) forwards}
        @keyframes popIn{from{opacity:0;transform:scale(0.7)}to{opacity:1;transform:scale(1)}}.pop-in{animation:popIn 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards}
        @keyframes pulseScan{0%,100%{box-shadow:var(--shadow-card)}50%{box-shadow:0 4px 16px rgba(26,31,21,0.10)}}
        @keyframes ringDraw{from{stroke-dashoffset:var(--dash-total,440)}to{stroke-dashoffset:var(--dash-offset,220)}}.ring-animate{animation:ringDraw 1.2s cubic-bezier(0.4,0,0.2,1) forwards}
        @keyframes partiqulePulse{0%,100%{opacity:0.3;transform:scale(0.9)}50%{opacity:0.9;transform:scale(1.1)}}
        @keyframes whyFadeIn{from{opacity:0}to{opacity:1}}
        input,button,select,textarea{font-family:'DM Sans',system-ui,sans-serif;}
        h1,h2,h3{font-family:'Lora',Georgia,serif;}
      `}</style>

      {/* HEADER */}
      <header style={{background:"var(--cream)", borderBottom:"1px solid var(--rule)", position:"sticky", top:0, zIndex:100, paddingTop: SAFE_TOP ? `${SAFE_TOP}px` : 0, overflowX:"hidden"}}>
        <div style={{maxWidth:1100, margin:"0 auto", padding:`0 ${px}`, minHeight: isMobile ? 60 : 72, display:"flex", alignItems:"center", justifyContent:"space-between", gap:8}}>
          <div style={{display:"flex", alignItems:"center", cursor:"pointer", minWidth:0, flexShrink:1}} onClick={reset}>
            <img src="/partiqule-wordmark.svg" alt="Partiqule" style={{height: isMobile ? 32 : 50, width:"auto", objectFit:"contain", display:"block"}}/>
          </div>

          {(isMobile || isTablet) ? (
            /* Mobile/tablet — icon row + hamburger */
            <div style={{display:"flex", alignItems:"center", gap:6, flexShrink:0}}>
              {user && <button onClick={()=>{setPage("settings");setResult(null);setMenuOpen(false);}} style={{display:"flex",alignItems:"center",gap:6,padding: isMobile ? "4px 6px" : "6px 12px",borderRadius:8,border:`1px solid ${border}`,background:"none",cursor:"pointer"}} aria-label="Account"><div style={{width:26,height:26,borderRadius:"49% 51% 50% 50% / 52% 48% 52% 48%",background:"var(--moss)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{color:"var(--ivory)",fontWeight:500,fontSize:12}}>{displayName?displayName[0].toUpperCase():user.email?.[0]?.toUpperCase()}</span></div>{!isMobile && <span style={{fontSize:13,color:text,fontWeight:600}}>Account</span>}</button>}
              <span onClick={()=>{setPage("history"); setResult(null); setMenuOpen(false);}} style={{position:"relative", cursor:"pointer", padding:8}}>
                <IconHistory size={20} color={page==="history"?"var(--moss)":muted}/>
                {history.length>0&&<span style={{position:"absolute", top:4, right:4, width:8, height:8, borderRadius:"50%", background:"var(--moss)"}}/>}
              </span>
              <button onClick={()=>setMenuOpen(o=>!o)} style={{width:44, height:44, borderRadius:8, border:`1px solid ${border}`, background:"none", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:4, cursor:"pointer", WebkitTapHighlightColor:"transparent", touchAction:"manipulation"}}>
                <div style={{width:18, height:2, background:text, borderRadius:2}}/>
                <div style={{width:18, height:2, background:text, borderRadius:2}}/>
                <div style={{width:18, height:2, background:text, borderRadius:2}}/>
              </button>
            </div>
          ) : (
            /* Desktop nav */
            <nav style={{display:"flex", gap:4, alignItems:"center"}}>
              {[
                {label:"About",      action:()=>{setPage("about"); setResult(null);},     active:page==="about"},
                {label:"Feed",       action:()=>{setPage("feed");setResult(null);try{localStorage.setItem("ps_feed_last_visit",new Date().toISOString());}catch{}}, active:page==="feed"},
                {label:"The Science",action:()=>{setPage("science"); setResult(null);},    active:page==="science"},
                {label:"Shelf",      action:()=>{setPage("history"); setResult(null);},    active:page==="history"},
              ].map((item,i)=>(
                <span key={i} onClick={item.action} style={{
                  fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13, fontWeight:item.active?500:400,
                  color:item.active?"var(--moss)":"var(--ink-soft)",
                  cursor:"pointer", padding:"6px 12px", borderRadius:8,
                  background:item.active?"var(--moss-soft)":"transparent",
                  transition:"all 0.15s",
                }}>{item.label}{item.label==="Shelf"&&history.length>0&&<span style={{background:"var(--moss)",color:"var(--ivory)",fontSize:10,fontWeight:500,padding:"2px 6px",borderRadius:10,marginLeft:6}}>{history.length}</span>}</span>
              ))}
              {isAdminUser(user) && (
                <span onClick={()=>{setPage("admin"); setResult(null);}} style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13, color:"var(--amber)", cursor:"pointer", fontWeight:500, padding:"6px 12px"}}>Admin</span>
              )}
              {user ? (
                <div style={{display:"flex", alignItems:"center", gap:8, marginLeft:8}}>
                  <div style={{width:32, height:32, borderRadius:"49% 51% 50% 50% / 52% 48% 52% 48%", background:"var(--moss-soft)", border:"1px solid var(--rule-strong)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer"}} title={user.email}>
                    <span style={{fontFamily:"'Lora', Georgia, serif", color:"var(--moss)", fontWeight:400, fontSize:14}}>{user.email[0].toUpperCase()}</span>
                  </div>
                  <button onClick={signOut} style={{padding:"6px 14px", borderRadius:8, border:"1px solid var(--rule-strong)", background:"none", color:"var(--ink-soft)", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13, fontWeight:500, cursor:"pointer"}}>Sign out</button>
                </div>
              ) : (
                <button onClick={()=>setShowAuth(true)} style={{marginLeft:8, padding:"8px 18px", borderRadius:10, background:"transparent", color:"var(--moss)", fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:500, fontSize:13, cursor:"pointer", border:"1px solid var(--rule-strong)"}}>Sign in</button>
              )}
              <button onClick={reset} style={{padding:"8px 20px", borderRadius:"22px 18px 24px 20px / 20px 24px 18px 22px", border:"none", background:"var(--moss)", color:"var(--ivory)", fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:500, fontSize:13, cursor:"pointer", letterSpacing:"0.005em"}}>New Scan</button>
            </nav>
          )}
        </div>

        {/* Mobile/tablet dropdown menu */}
        {(isMobile || isTablet) && menuOpen && (
          <div style={{background:"var(--cream)", borderTop:"1px solid var(--rule)", padding:"8px 16px 16px", display:"flex", flexDirection:"column", gap:2, position:"relative", zIndex:200}}>
            {[
              {label:"About",        pg:"about"},
              {label:"The Science",  pg:"science"},
              {label:"How it Works", pg:"methodology"},
              {label:"Guides",       pg:"guides"},
              {label:"Shelf",        pg:"history"},
              {label:"Settings",     pg:"settings"},
              ...(isAdminUser(user) ? [{label:"Admin", pg:"admin"}] : []),
            ].map(item=>(
              <button key={item.pg} onClick={()=>{
                if(item.pg==="guides") navigateTo("guides");
                else { setPage(item.pg); setResult(null); }
                setMenuOpen(false);
              }}
                style={{padding:"12px 16px", borderRadius:10, border:"none",
                  background:page===item.pg?"var(--moss-soft)":"transparent",
                  color:page===item.pg?"var(--moss)":"var(--ink-soft)",
                  fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:15,
                  fontWeight:page===item.pg?500:400, cursor:"pointer", textAlign:"left",
                }}>
                {item.label}
              </button>
            ))}
            {user ? (
              <div style={{padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:4, borderTop:"1px solid var(--rule-soft)"}}>
                <span style={{fontSize:13, color:"var(--ink-faint)"}}>{user.email}</span>
                <button onClick={()=>{signOut(); setMenuOpen(false);}} style={{padding:"6px 14px", borderRadius:8, border:"1px solid var(--rule-strong)", background:"none", color:"var(--ink-soft)", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13, fontWeight:500, cursor:"pointer"}}>Sign out</button>
              </div>
            ) : (
              <button onClick={()=>{setShowAuth(true); setMenuOpen(false);}} style={{padding:"12px 16px", borderRadius:10, border:"1px solid var(--moss)", background:"none", color:"var(--moss)", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:15, fontWeight:500, cursor:"pointer", textAlign:"left", marginTop:8}}>
                Sign in / Create account
              </button>
            )}
            <button onClick={()=>{reset(); setMenuOpen(false);}} style={{padding:"13px 16px", borderRadius:"var(--cta-shape)", border:"none", background:"var(--moss)", color:"var(--ivory)", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:15, fontWeight:500, cursor:"pointer", marginTop:8}}>
              New Scan
            </button>
          </div>
        )}
      </header>

      {showAuth && <AuthModal onClose={()=>setShowAuth(false)} onAuth={u=>{
        setUser(u);
        // Missing nickname → prompt existing user before any other UI.
        let storedName = "";
        try { storedName = (localStorage.getItem("partiqule_display_name") || "").trim(); } catch {}
        if (!storedName) setShowNicknamePrompt(true);
        if (isAdminUser(u)) { setPage("admin"); setShowAuth(false); return; }
        checkSubscription(u.id).then(subscribed => { if (!subscribed) setShowLimitModal("paywall"); });
      }} onSetName={name=>{setDisplayName(name);try{localStorage.setItem("partiqule_display_name",name);}catch{}}}/>}

      {showNicknamePrompt && <NicknamePromptModal onSave={name=>{
        setDisplayName(name);
        try { localStorage.setItem("partiqule_display_name", name); } catch {}
        setShowNicknamePrompt(false);
      }}/>}

      {/* ── Delete account confirmation modal ── */}
      {/* Account deleted toast */}
      {showAccountDeleted && (
        <div style={{position:"fixed",bottom:32,left:"50%",transform:"translateX(-50%)",zIndex:9999,
          background:"var(--moss)",color:"var(--ivory)",padding:"14px 28px",borderRadius:"var(--cta-shape)",
          fontFamily:"'DM Sans', system-ui, sans-serif",
          fontSize:15,fontWeight:500,boxShadow:"var(--shadow-card)",
          display:"flex",alignItems:"center",gap:10,whiteSpace:"nowrap"}}>
          <span style={{fontSize:18}}>✓</span> Account deleted
        </div>
      )}

      {showDeleteConfirm && (
        <div onClick={()=>setShowDeleteConfirm(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:"28px 24px",maxWidth:380,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
            <div style={{fontSize:20,fontWeight:700,color:"#dc2626",marginBottom:8}}>Delete account?</div>
            <div style={{fontSize:14,color:"#64748b",marginBottom:24,lineHeight:1.6}}>This will permanently delete your account, scan history, and cancel any active subscription. This cannot be undone.</div>
            <button onClick={deleteAccount} style={{width:"100%",padding:"13px",borderRadius:10,background:"#dc2626",border:"none",color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",marginBottom:10}}>Yes, delete my account</button>
            <button onClick={()=>setShowDeleteConfirm(false)} style={{width:"100%",padding:"11px",borderRadius:10,background:"none",border:`1px solid ${"#e2e8f0"}`,color:"#64748b",fontSize:14,cursor:"pointer"}}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Scan limit modals (Phase 4 cream refresh) ── */}
      {showLimitModal && (
        <div onClick={()=>setShowLimitModal(null)} style={{position:"fixed", inset:0, background:"rgba(26,31,21,0.55)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:"20px"}}>
          <div onClick={e=>e.stopPropagation()} style={{
            background:"var(--cream)",
            borderRadius: "22px 18px 24px 20px / 20px 24px 18px 22px",
            padding:"30px 26px 24px",
            maxWidth:400, width:"100%",
            boxShadow:"0 20px 40px rgba(26,31,21,0.18), 0 0 0 1px rgba(26,31,21,0.08)",
          }}>

            {showLimitModal === "account" && (<>
              <div style={{
                fontFamily:"'DM Sans', system-ui, sans-serif",
                fontSize:10, letterSpacing:"0.22em", color:"var(--moss)",
                textTransform:"uppercase", fontWeight:500, marginBottom:12,
                display:"flex", alignItems:"center", gap:10,
              }}>
                <span style={{display:"inline-block", width:22, height:1, background:"var(--moss)", opacity:0.7}}/>
                Free scans used
              </div>
              <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:28, fontWeight:400, color:"var(--ink)", marginBottom:12, letterSpacing:"-0.015em", lineHeight:1.08}}>You've been busy.</div>
              <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:14, color:"var(--ink-soft)", marginBottom:22, lineHeight:1.55}}>That's your {FREE_LIMIT} free scans. Make a quick account to keep going — unlimited scans, child and pregnancy scoring, clean alternatives. $4.99 a month.</div>
              <button onClick={()=>{setShowLimitModal(null); setShowAuth(true);}} style={{width:"100%", padding:"13px 16px", borderRadius:"22px 18px 24px 20px / 20px 24px 18px 22px", background:"var(--moss)", border:"none", color:"var(--ivory)", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:14, fontWeight:500, cursor:"pointer", marginBottom:10, letterSpacing:"0.005em"}}>Create account</button>
              <button onClick={()=>setShowLimitModal(null)} style={{width:"100%", padding:"12px 16px", borderRadius:"22px 18px 24px 20px / 20px 24px 18px 22px", background:"transparent", border:"1px solid var(--rule-strong)", color:"var(--ink)", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:14, fontWeight:500, cursor:"pointer"}}>Maybe later</button>
            </>)}

            {showLimitModal === "paywall" && (<>
              <div style={{
                fontFamily:"'DM Sans', system-ui, sans-serif",
                fontSize:10, letterSpacing:"0.22em", color:"var(--moss)",
                textTransform:"uppercase", fontWeight:500, marginBottom:12,
                display:"flex", alignItems:"center", gap:10,
              }}>
                <span style={{display:"inline-block", width:22, height:1, background:"var(--moss)", opacity:0.7}}/>
                Partiqule Premium
              </div>
              <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:28, fontWeight:400, color:"var(--ink)", marginBottom:12, letterSpacing:"-0.015em", lineHeight:1.08}}>You've found a lot to think about.</div>
              <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:14, color:"var(--ink-soft)", marginBottom:22, lineHeight:1.55}}>
                Unlimited scans, child and pregnancy scoring, clean alternatives.
                <span style={{display:"block", marginTop:8, fontFamily:"'Lora', Georgia, serif", fontSize:20, color:"var(--ink)", letterSpacing:"-0.01em"}}>{iapPrice} <span style={{fontSize:14, color:"var(--ink-soft)"}}>a month. Cancel anytime.</span></span>
              </div>
              <button onClick={startCheckout} disabled={checkingOut} style={{width:"100%", padding:"13px 16px", borderRadius:"22px 18px 24px 20px / 20px 24px 18px 22px", background:"var(--moss)", border:"none", color:"var(--ivory)", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:14, fontWeight:500, cursor:"pointer", marginBottom:12, letterSpacing:"0.005em", opacity:checkingOut?0.7:1}}>
                {checkingOut ? "Loading..." : `Subscribe — ${iapPrice}`}
              </button>
              {IS_NATIVE && (
                <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:10.5, color:"var(--ink-soft)", textAlign:"center", marginTop:8, lineHeight:1.55}}>
                  Partiqule Premium is a monthly subscription at {iapPrice}. Payment will be charged to your Apple ID at confirmation of purchase. Subscription automatically renews unless cancelled at least 24 hours before the end of the current period. Manage or cancel anytime in Settings &gt; Apple ID &gt; Subscriptions.
                </div>
              )}
              <button onClick={()=>{setShowLimitModal(null);setIapTimedOut(false);}} style={{width:"100%", padding:"12px 16px", borderRadius:"22px 18px 24px 20px / 20px 24px 18px 22px", background:"transparent", border:"1px solid var(--rule-strong)", color:"var(--ink)", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:14, fontWeight:500, cursor:"pointer"}}>Maybe later</button>
              {IS_NATIVE && <button onClick={restoreSubscription} style={{width:"100%", padding:"10px", borderRadius:10, background:"transparent", border:"none", color:"var(--ink-soft)", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:12, cursor:"pointer", marginTop:4, textDecoration:"underline", textUnderlineOffset:2}}>Restore previous purchase</button>}
              <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:11, color:"var(--ink-faint)", textAlign:"center", marginTop:12}}>
                <a href="https://partiqule.com/privacy" target="_blank" rel="noopener noreferrer" style={{color:"var(--ink-soft)", textDecoration:"underline", textUnderlineOffset:2, cursor:"pointer"}} onClick={(e)=>{if(!IS_NATIVE){e.preventDefault();setShowLimitModal(null);setPage("privacy");}}}>Privacy Policy</a>
                <span style={{margin:"0 6px", opacity:0.4}}>·</span>
                <a href="https://partiqule.com/terms" target="_blank" rel="noopener noreferrer" style={{color:"var(--ink-soft)", textDecoration:"underline", textUnderlineOffset:2, cursor:"pointer"}} onClick={(e)=>{if(!IS_NATIVE){e.preventDefault();setShowLimitModal(null);setPage("terms");}}}>Terms of Service</a>
                <span style={{margin:"0 6px", opacity:0.4}}>·</span>
                <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" target="_blank" rel="noopener noreferrer" style={{color:"var(--ink-soft)", textDecoration:"underline", textUnderlineOffset:2, cursor:"pointer"}}>Apple EULA</a>
              </div>
              {iapTimedOut && (
                <div style={{padding:"20px 0 0", textAlign:"center", borderTop:"1px solid var(--rule)", marginTop:16}}>
                  <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:14, color:"var(--ink-soft)", marginBottom:16, lineHeight:1.6}}>Purchase is taking longer than expected. You can also subscribe on our website.</div>
                  <button onClick={()=>{const url="https://partiqule.com?subscribe=1";if(window.Capacitor?.isNativePlatform?.())window.open(url,"_system");else window.open(url,"_blank");}} style={{width:"100%", padding:"13px 16px", borderRadius:"22px 18px 24px 20px / 20px 24px 18px 22px", background:"var(--moss)", color:"var(--ivory)", border:"none", fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:500, fontSize:14, cursor:"pointer", marginBottom:10}}>Subscribe on partiqule.com</button>
                  <button onClick={()=>{setIapTimedOut(false);setCheckingOut(false);}} style={{width:"100%", padding:"12px 16px", borderRadius:"22px 18px 24px 20px / 20px 24px 18px 22px", background:"transparent", color:"var(--ink)", border:"1px solid var(--rule-strong)", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:14, fontWeight:500, cursor:"pointer"}}>Try again</button>
                </div>
              )}
            </>)}

          </div>
        </div>
      )}

      {page === "admin" ? (
        <AdminPage surface={surface} border={border} text={text} muted={muted} history={history}/>
      ) : page === "guides" ? (
        <GuidesPage text={text} muted={muted} surface={surface} border={border} isMobile={isMobile} onNavigate={navigateTo}/>
      ) : page === "guide" ? (
        <GuideViewPage text={text} muted={muted} surface={surface} border={border} isMobile={isMobile} slug={guideSlug} onNavigate={navigateTo} onScan={reset}/>
      ) : page === "privacy" ? (
        <PrivacyPage text={text} muted={muted} surface={surface} border={border} isMobile={isMobile}/>
      ) : page === "terms" ? (
        <TermsPage text={text} muted={muted} surface={surface} border={border} isMobile={isMobile}/>
      ) : page === "about" ? (
        <AboutPage text={text} muted={muted} surface={surface} border={border} isMobile={isMobile} onScan={reset} onNavigate={setPage}/>
      ) : page === "methodology" ? (
        <MethodologyPage text={text} muted={muted} surface={surface} border={border} isMobile={isMobile}/>
      ) : page === "reset-password" ? (
        <ResetPasswordPage onDone={() => { setPage("home"); }}/>
      ) : page === "404" ? (
        <div style={{maxWidth:600, margin:"0 auto", padding:"100px 40px", textAlign:"center"}}>
          <div style={{display:"flex",justifyContent:"center",marginBottom:16}}><IcoScan size={64}/></div>
          <h1 style={{fontFamily:"'Lora', Georgia, serif", fontWeight:400, fontSize:36, color:text, margin:"0 0 12px", letterSpacing:"-0.015em"}}>Page not found.</h1>
          <p style={{fontSize:16, color:muted, margin:"0 0 32px", lineHeight:1.6}}>That page doesn't exist — but we can scan any product for microplastics risk.</p>
          <button onClick={reset} style={{padding:"12px 28px", borderRadius:"var(--cta-shape)", border:"none", background:"var(--moss)", color:"var(--ivory)", fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:500, fontSize:15, cursor:"pointer"}}>
            Go to Partiqule →
          </button>
        </div>
      ) : page === "feed" ? (
        <FeedPage liveIntelCards={liveIntelCards} staticCards={generateForYouCards(history, childMode)} history={history} surface={surface} border={border} text={text} muted={muted} isMobile={isMobile} setPage={setPage} setResult={setResult} setQuery={setQuery} analyze={analyze}/>
      ) : page === "history" ? (
        <HistoryPage history={history} surface={surface} border={border} text={text} muted={muted}
          isMobile={isMobile}
          onSelect={(item)=>{setResult(item); setPage("home");}}
          onClear={()=>{setHistory([]); try{localStorage.removeItem("ps_history")}catch{}}}
          onSearch={(q)=>{setPage("home"); setQuery(q); analyze(q);}}
        />
      ) : page === "science" ? (
        <div style={{maxWidth:1100, margin:"0 auto", padding:isMobile?"24px 16px 60px":"48px 40px 80px"}}>
          <div style={{marginBottom:32}}>
            <h1 style={{fontFamily:"'Lora', Georgia, serif", fontWeight:400, fontSize:isMobile?30:40, color:text, margin:"0 0 8px", letterSpacing:"-0.015em"}}>The <span style={{color:"var(--moss)"}}>science</span></h1>
            <p style={{fontSize:15, color:muted, margin:0}}>The research behind product health: your body, your home, and the planet</p>
          </div>
          <EducationSection isMobile={isMobile}/>
        </div>
      ) : page === "settings" ? (
        <div style={{maxWidth:600, margin:"0 auto", padding:isMobile?"24px 16px 80px":"48px 40px 80px"}}>
          <div style={{marginBottom:32}}>
            <h1 style={{fontFamily:"'Lora', Georgia, serif", fontWeight:400, fontSize:isMobile?28:34, color:text, margin:"0 0 8px", letterSpacing:"-0.015em"}}>Settings</h1>
            <p style={{fontSize:15, color:muted, margin:0}}>Personalise your Partiqule experience</p>
          </div>
          <StreamSpike isMobile={isMobile} text={text} muted={muted}/>

          <div style={{display:"flex", flexDirection:"column", gap:16}}>

            {/* ── PARTIQULE PREMIUM — always visible, discoverable purchase path ── */}
            <div style={{background:"var(--cream-light)", borderRadius:"var(--card-shape-1)", border:`1px solid ${isSubscribed?"var(--moss)":"var(--rule)"}`, overflow:"hidden", boxShadow: isSubscribed ? "none" : "var(--shadow-card)"}}>
              <div style={{padding:"14px 20px", borderBottom:"1px solid var(--rule-soft)", background:"var(--moss-soft)"}}>
                <div style={{fontSize:12, fontWeight:700, color:"#16a34a", textTransform:"uppercase", letterSpacing:"0.08em", display:"flex", alignItems:"center", gap:6}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  Partiqule Premium
                </div>
              </div>
              <div style={{padding:"18px 20px"}}>
                {isSubscribed ? (
                  <>
                    <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:8}}>
                      <div style={{width:10, height:10, borderRadius:"50%", background:"#16a34a"}}/>
                      <div style={{fontSize:15, fontWeight:700, color:text}}>You're subscribed</div>
                    </div>
                    <div style={{fontSize:13, color:muted, lineHeight:1.55, marginBottom:14}}>
                      Thanks for supporting Partiqule. You have unlimited scans, child and pregnancy scoring, and full access to all alternatives.
                    </div>
                    {IS_NATIVE && (
                      <div style={{display:"flex", flexDirection:"column", gap:8}}>
                        <button onClick={()=>{ try { window.open("https://apps.apple.com/account/subscriptions", "_blank"); } catch {} }} style={{width:"100%", padding:"11px", borderRadius:10, background:"none", border:`1px solid ${border}`, color:muted, fontSize:13, fontWeight:600, cursor:"pointer"}}>
                          Manage subscription
                        </button>
                        <button onClick={restoreSubscription} style={{width:"100%", padding:"11px", borderRadius:10, background:"none", border:`1px solid ${border}`, color:muted, fontSize:13, fontWeight:600, cursor:"pointer"}}>
                          Restore purchases
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div style={{fontSize:17, fontWeight:800, color:text, marginBottom:6, fontFamily:"'DM Sans', system-ui, sans-serif", letterSpacing:"-0.3px"}}>
                      Unlock unlimited scans
                    </div>
                    <div style={{fontSize:13, color:muted, lineHeight:1.55, marginBottom:14}}>
                      Unlimited scans, child and pregnancy scoring, and full access to clean alternatives.
                    </div>
                    <div style={{display:"flex", flexDirection:"column", gap:8, marginBottom:16}}>
                      {[
                        "Unlimited product scans",
                        "Scoring for a child — stricter thresholds",
                        "Scoring for pregnancy — flags key concerns",
                        "Full clean-product database + alternatives",
                      ].map((feature,i)=>(
                        <div key={i} style={{display:"flex", alignItems:"center", gap:8, fontSize:13, color:text}}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><polyline points="20 6 9 17 4 12"/></svg>
                          {feature}
                        </div>
                      ))}
                    </div>
                    <button onClick={()=>{
                      if (!user) { setShowAuth(true); return; }
                      setShowLimitModal("paywall");
                    }} style={{
                      width:"100%", padding:"14px", borderRadius:"var(--cta-shape)", border:"none",
                      background:"var(--moss)", color:"var(--ivory)",
                      fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:500, fontSize:15, cursor:"pointer",
                      display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                    }}>
                      Subscribe — {iapPrice}
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ivory)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    </button>
                    {IS_NATIVE && (
                      <div style={{fontSize:10, color:muted, textAlign:"center", marginTop:10, lineHeight:1.5}}>
                        Payment will be charged to your Apple ID. Subscription auto-renews unless cancelled at least 24 hours before the end of the current period. Manage in Settings.
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Account */}
            <div style={{background:surface, borderRadius:16, border:`1px solid ${border}`, overflow:"hidden"}}>
              <div style={{padding:"14px 20px", borderBottom:`1px solid ${border}`, background:"#f8fafc"}}>
                <div style={{fontSize:12, fontWeight:700, color:muted, textTransform:"uppercase", letterSpacing:"0.08em"}}>Account</div>
              </div>
              {user ? (
                <div style={{padding:"16px 20px"}}>
                  <div style={{display:"flex", alignItems:"center", gap:14, marginBottom:16}}>
                    <div style={{width:44, height:44, borderRadius:"var(--circle-shape)", background:"var(--moss)", display:"flex", alignItems:"center", justifyContent:"center"}}>
                      <span style={{color:"var(--ivory)", fontWeight:500, fontSize:18, fontFamily:"'DM Sans', system-ui, sans-serif"}}>{user.email[0].toUpperCase()}</span>
                    </div>
                    <div>
                      <div style={{fontSize:15, fontWeight:600, color:text}}>{user.email}</div>
                      <div style={{fontSize:13, color:"var(--moss)", fontWeight:500}}>Signed in</div>
                    </div>
                  </div>
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:12, color:muted, fontWeight:600, marginBottom:6}}>Display name</div>
                    <input value={displayName} onChange={e=>setDisplayName(e.target.value)} onBlur={e=>{try{localStorage.setItem("partiqule_display_name",e.target.value.trim());}catch{}}} placeholder="Add a name or nickname" style={{width:"100%", padding:"10px 14px", borderRadius:10, border:`1px solid ${border}`, background:"#f9fafb", color:text, fontSize:14, outline:"none", boxSizing:"border-box"}}/>
                  </div>
                  <button onClick={signOut} style={{width:"100%", padding:"12px", borderRadius:10, border:`1.5px solid ${border}`, background:"none", color:muted, fontSize:14, fontWeight:600, cursor:"pointer"}}>
                    Sign out
                  </button>
                  <div style={{marginTop:16, padding:"16px 20px", borderTop:`1px solid ${border}`}}>
                    <div style={{fontSize:12, fontWeight:700, color:"#dc2626", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8}}>Danger zone</div>
                    <div style={{fontSize:13, color:muted, marginBottom:12, lineHeight:1.5}}>Permanently deletes your account, scan history, and cancels any active subscription. This cannot be undone.</div>
                    <button onClick={()=>setShowDeleteConfirm(true)} style={{width:"100%", padding:"14px", borderRadius:10, border:"2px solid #dc2626", background:"#fef2f2", color:"#dc2626", fontSize:15, fontWeight:700, cursor:"pointer"}}>
                      Delete My Account
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{padding:"16px 20px"}}>
                  <p style={{fontSize:14, color:muted, margin:"0 0 14px", lineHeight:1.6}}>Sign in to save your scan history across devices and unlock cloud sync.</p>
                  <button onClick={()=>setShowAuth(true)} style={{width:"100%", padding:"12px", borderRadius:"var(--cta-shape)", border:"none", background:"var(--moss)", color:"var(--ivory)", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:14, fontWeight:500, cursor:"pointer"}}>
                    Sign in / Create account
                  </button>
                </div>
              )}
            </div>

            {/* Child safety default */}
            <div style={{background:surface, borderRadius:16, border:`1px solid ${border}`, overflow:"hidden"}}>
              <div style={{padding:"14px 20px", borderBottom:`1px solid ${border}`, background:"#f8fafc"}}>
                <div style={{fontSize:12, fontWeight:700, color:muted, textTransform:"uppercase", letterSpacing:"0.08em"}}>Scoring</div>
              </div>
              <div style={{padding:"16px 20px", display:"flex", alignItems:"center", justifyContent:"space-between"}}>
                <div>
                  <div style={{fontSize:15, fontWeight:600, color:text, marginBottom:2}}>Scoring for a child</div>
                  <div style={{fontSize:13, color:muted}}>Applies stricter thresholds and kids-specific daily values</div>
                </div>
                <button onClick={()=>{
                  const next = !childMode;
                  setChildMode(next);
                  try { if(next) localStorage.setItem("partiqule_child_mode","1"); else localStorage.removeItem("partiqule_child_mode"); } catch {}
                }} style={{
                  width:52, height:30, borderRadius:9999, border: childMode ? "none" : "1px solid var(--rule)", cursor:"pointer",
                  background: childMode ? "var(--moss)" : "var(--cream-light)",
                  position:"relative", transition:"background 0.2s", flexShrink:0,
                }}>
                  <div style={{
                    position:"absolute", top:3, left: childMode ? 24 : 3,
                    width:24, height:24, borderRadius:"50%",
                    background: childMode ? "var(--ivory)" : "var(--ink-faint)",
                    transition:"left 0.2s",
                  }}/>
                </button>
              </div>
              <div style={{height:1, background:border, margin:"0 20px"}}/>
              <div style={{padding:"16px 20px", display:"flex", alignItems:"center", justifyContent:"space-between"}}>
                <div>
                  <div style={{fontSize:15, fontWeight:600, color:text, marginBottom:2}}>Scoring for pregnancy</div>
                  <div style={{fontSize:13, color:muted}}>Flags ingredients of concern during pregnancy and TTC</div>
                </div>
                <button onClick={()=>{
                  const next = !pregnancyMode;
                  setPregnancyMode(next);
                  try { if(next) localStorage.setItem("partiqule_pregnancy_mode","1"); else localStorage.removeItem("partiqule_pregnancy_mode"); } catch {}
                }} style={{
                  width:52, height:30, borderRadius:15, border:"none", cursor:"pointer",
                  background: pregnancyMode ? "#2d5a27" : "#d1d5db",
                  position:"relative", transition:"background 0.2s", flexShrink:0,
                }}>
                  <div style={{
                    position:"absolute", top:3, left: pregnancyMode ? 24 : 3,
                    width:24, height:24, borderRadius:"50%", background:"white",
                    transition:"left 0.2s", boxShadow:"0 1px 4px rgba(0,0,0,0.2)",
                  }}/>
                </button>
              </div>
            </div>

            {/* About */}
            <div style={{background:surface, borderRadius:16, border:`1px solid ${border}`, overflow:"hidden"}}>
              <div style={{padding:"14px 20px", borderBottom:`1px solid ${border}`, background:"#f8fafc"}}>
                <div style={{fontSize:12, fontWeight:700, color:muted, textTransform:"uppercase", letterSpacing:"0.08em"}}>About</div>
              </div>
              {[
                {label:"The Science",   action:()=>{setPage("science"); }},
                {label:"How it Works",  action:()=>{setPage("methodology"); }},
                {label:"About us",      action:()=>{setPage("about"); }},
                {label:"Privacy Policy",action:()=>{setPage("privacy"); }},
              ].map((item, i, arr) => (
                <button key={item.label} onClick={item.action} style={{
                  width:"100%", padding:"14px 20px", border:"none",
                  borderBottom: i < arr.length-1 ? `1px solid ${border}` : "none",
                  background:"none", color:text, fontSize:15, cursor:"pointer",
                  textAlign:"left", display:"flex", alignItems:"center", justifyContent:"space-between",
                }}>
                  {item.label}
                  <span style={{color:muted, fontSize:18}}>›</span>
                </button>
              ))}
            </div>

            <div style={{textAlign:"center", fontSize:12, color:muted, paddingTop:4}}>
              Partiqule · Version 1.0 · <a href="mailto:paul@partiqule.com" style={{color:"#16a34a", textDecoration:"none"}}>Contact us</a>
            </div>
          </div>
        </div>
      ) : !result ? (
        <>
          {/* Globe overlay — cream typewriter for text/image scans */}
          {showOverlay && (
            <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"var(--cream)",zIndex:9999,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",animation:"globeOverlayIn 0.4s ease forwards"}}>
              <style>{`@keyframes globeOverlayIn{from{opacity:0}to{opacity:1}}`}</style>
              <GlobeLoading isMobile={isMobile}/>
            </div>
          )}

          {/* ── RETURNING USER: compact scan bar + discovery feed ── */}
          {history.length > 0 ? (() => {
            // Greeting uses displayName only — never fall back to email username
            const nameForGreet = (displayName && displayName.trim()) ? displayName.trim() : (user ? "there" : null);
            const greet = nameForGreet ? `Good ${new Date().getHours()<12?"morning":new Date().getHours()<17?"afternoon":"evening"}, ${nameForGreet.charAt(0).toUpperCase()+nameForGreet.slice(1)}` : "Welcome back";

            // ── Streak counter (Serial Position Effect: anchors the greeting) ──
            const streak = (() => {
              try {
                const today = new Date().toDateString();
                const visits = JSON.parse(localStorage.getItem("pq_visits")||"[]");
                if (!visits.length || visits[0] !== today) {
                  visits.unshift(today);
                  localStorage.setItem("pq_visits", JSON.stringify(visits.slice(0,60)));
                }
                let s = 0;
                for (let i = 0; i < visits.length; i++) {
                  const exp = new Date(); exp.setDate(exp.getDate()-i);
                  if (visits[i] === exp.toDateString()) s++; else break;
                }
                return s;
              } catch { return 1; }
            })();

            // ── New badge: tracks which For You products were seen before today ──
            const isNewCard = (() => {
              try {
                const today = new Date().toDateString();
                const stored = JSON.parse(localStorage.getItem("pq_foryou")||"{}");
                return (name) => stored.date !== today || !(stored.seen||[]).includes(name);
              } catch { return () => false; }
            })();
            const markSeen = (names) => {
              try {
                const today = new Date().toDateString();
                const existing = JSON.parse(localStorage.getItem("pq_foryou")||"{}");
                const seen = existing.date === today ? [...new Set([...(existing.seen||[]),...names])] : names;
                localStorage.setItem("pq_foryou", JSON.stringify({date:today, seen}));
              } catch {}
            };

            // ── Date labels for comparison card ──
            const todayLabel = new Date().toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});

            const comparisons = [
              {a:{name:"Heinz Ketchup",score:6,flags:"HFCS · Caramel color"},    b:{name:"Annie's Ketchup",score:2,flags:"Organic · 5 ingredients"}},
              {a:{name:"Tide Pods",score:7,flags:"PVA film · Optical brighteners"},b:{name:"Blueland Laundry",score:2,flags:"Plastic-free · Clean formula"}},
              {a:{name:"Neutrogena SPF 50",score:6,flags:"Oxybenzone · Parabens"}, b:{name:"Badger Mineral SPF",score:2,flags:"Zinc oxide only"}},
              {a:{name:"Febreze Air",score:7,flags:"Synthetic fragrance · VOCs"},  b:{name:"Branch Basics Spray",score:2,flags:"No synthetic fragrance"}},
              {a:{name:"Gatorade",score:6,flags:"Artificial dyes · HFCS"},         b:{name:"Liquid IV",score:3,flags:"Cleaner formula"}},
              {a:{name:"Dawn Dish Soap",score:5,flags:"Synthetic fragrance · SLS"}, b:{name:"Branch Basics Dish",score:2,flags:"Fragrance-free · Clean"}},
              {a:{name:"Lay's Chips",score:5,flags:"Seed oils · Natural flavors"},  b:{name:"Siete Chips",score:2,flags:"Avocado oil · Clean"}},
            ];
            const todayComp = comparisons[new Date().getDay()];
            const scoreCol = s => s<=2?"#22c55e":s<=4?"#a3e635":s<=6?"#f59e0b":s<=8?"#f97316":"#ef4444";
            return (
              <div style={{paddingBottom: isMobile ? 160 : 60}}>

                {/* ── FIXED SCAN BAR — always visible, never scrolls away (cream refresh) ── */}
                <div style={{
                  position:"fixed", top: (isMobile ? 60 : 72) + SAFE_TOP, left:0, right:0, zIndex:40,
                  background:"var(--cream)",
                  borderBottom:"1px solid var(--rule)",
                  padding: isMobile ? "10px 16px" : "12px 40px",
                }}>
                  <div style={{maxWidth:860, margin:"0 auto", display:"flex", alignItems:"center", gap:10}}>
                    <div style={{flex:1, display:"flex", alignItems:"center", gap:10, background:"var(--cream-light)", border:"1px solid var(--rule-strong)", borderRadius:"14px 10px 15px 12px / 10px 15px 12px 14px", padding:"10px 16px", cursor:"text"}}
                      onClick={()=>document.getElementById("home-search-input")?.focus()}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--moss)" strokeWidth="2" opacity="0.55"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                      <input
                        id="home-search-input"
                        value={query}
                        onChange={e=>setQuery(e.target.value)}
                        onKeyDown={e=>{
                          if (e.key !== "Enter" || !query.trim()) return;
                          // If the picker has verified matches, prefer picking the top match over
                          // firing a raw text scan (which would hit the text-only gate and 422).
                          if (searchMatches && searchMatches.length > 0) { selectSearchMatch(searchMatches[0]); return; }
                          analyze();
                        }}
                        placeholder="Search any product…"
                        style={{flex:1, border:"none", outline:"none", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:15, background:"transparent", color:"var(--ink)", minWidth:0}}
                      />
                      {query.trim() && (
                        <button onClick={()=>{
                          if (searchMatches && searchMatches.length > 0) { selectSearchMatch(searchMatches[0]); return; }
                          analyze();
                        }} style={{padding:"6px 14px", borderRadius:10, background:"var(--moss)", color:"var(--ivory)", border:"none", fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:500, fontSize:13, cursor:"pointer", flexShrink:0}}>Scan</button>
                      )}
                    </div>
                    {/* Camera button — desktop only; mobile uses the bottom nav FAB */}
                    {!isMobile && (<>
                      <div onClick={()=>document.getElementById("home-file-input").click()}
                        style={{width:44, height:44, borderRadius:"12px 16px 14px 18px / 16px 12px 18px 14px", background:"var(--cream-light)", border:"1px solid var(--rule-strong)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0}}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--moss)" strokeWidth="1.8"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
                      </div>
                      <input id="home-file-input" type="file" accept="image/*" style={{display:"none"}} onChange={async(e)=>{const f=e.target.files?.[0];if(!f)return;e.target.value="";await handleImageScan(f);}}/>
                    </>)}
                  </div>

                  {/* ── MATCH PICKER — renders when /search returns verified matches ── */}
                  {(() => {
                    const trimmed = query.trim();
                    if (trimmed.length < 3 || result) return null;
                    const hasSearched = searchedQuery === trimmed;
                    const showLoading = searchLoading && searchMatches.length === 0;
                    const showEmpty   = hasSearched && !searchLoading && searchMatches.length === 0;
                    if (!showLoading && !showEmpty && searchMatches.length === 0) return null;
                    const scoreCol = s => s==null ? "var(--ink-faint)" : s<=3 ? "var(--score-green)" : s<=5 ? "var(--score-amber)" : "var(--score-red)";
                    const scoreBg  = s => s==null ? "rgba(107,114,128,0.10)" : s<=3 ? "var(--score-green-soft)" : s<=5 ? "var(--score-amber-soft)" : "var(--score-red-soft)";
                    const sourceColor = src => src === "calibration" ? "var(--moss)" : src === "own_scan" ? "var(--moss)" : "var(--ink-soft)";
                    if (showLoading) {
                      return (
                        <div style={{maxWidth:860, margin:"10px auto 0", padding:"10px 14px", background:"var(--cream-light)", border:"1px solid var(--rule)", borderRadius:"14px 10px 15px 12px / 10px 15px 12px 14px", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13, color:"var(--ink-soft)"}}>
                          Searching…
                        </div>
                      );
                    }
                    if (showEmpty) {
                      return (
                        <div style={{maxWidth:860, margin:"10px auto 0", padding:"16px 18px", background:"var(--cream-light)", border:"1px solid var(--rule)", borderRadius:"14px 10px 15px 12px / 10px 15px 12px 14px"}}>
                          <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:17, fontWeight:400, color:"var(--ink)", marginBottom:6, letterSpacing:"-0.005em"}}>No verified matches yet.</div>
                          <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:12, color:"var(--ink-soft)", marginBottom:14, lineHeight:1.5}}>Snap a photo of the label — formulas change, and reading the actual ingredient list is the most accurate path.</div>
                          <label style={{display:"block", width:"100%", cursor:"pointer", marginBottom:8}}>
                            <input type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={async(e)=>{const f=e.target.files?.[0];if(!f)return;e.target.value="";setSearchMatches([]); await handleImageScan(f);}}/>
                            <div style={{width:"100%", padding:"11px 14px", background:"var(--moss)", color:"var(--ivory)", border:"none", borderRadius:"22px 18px 24px 20px / 20px 24px 18px 22px", fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:500, fontSize:13, textAlign:"center", boxSizing:"border-box"}}>Take a photo</div>
                          </label>
                          <button onClick={()=>{setSearchMatches([]); setShowBarcodeScanner(true);}} style={{width:"100%", padding:"10px 14px", background:"transparent", color:"var(--ink-soft)", border:"1px solid var(--rule)", borderRadius:"22px 18px 24px 20px / 20px 24px 18px 22px", fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:500, fontSize:12, cursor:"pointer"}}>Or scan the barcode</button>
                        </div>
                      );
                    }
                    return (
                      <div style={{maxWidth:860, margin:"10px auto 0", background:"var(--cream-light)", border:"1px solid var(--rule)", borderRadius:"14px 10px 15px 12px / 10px 15px 12px 14px", overflow:"hidden", maxHeight:360, overflowY:"auto"}}>
                        {searchMatches.map((m, i) => (
                          <div key={m.id+"-"+i}
                            onClick={()=>selectSearchMatch(m)}
                            style={{display:"flex", alignItems:"center", gap:12, padding:"12px 16px", borderBottom: i<searchMatches.length-1 ? "1px solid var(--rule-soft)" : "none", cursor:"pointer"}}>
                            <div style={{flex:1, minWidth:0}}>
                              <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:16, fontWeight:400, color:"var(--ink)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", letterSpacing:"-0.005em"}}>{m.display_name}</div>
                              <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:10, letterSpacing:"0.14em", color:sourceColor(m.source), marginTop:3, textTransform:"uppercase", fontWeight:500}}>
                                {m.source_label}{m.match_type === "trigram" ? " · CLOSE MATCH" : ""}
                              </div>
                            </div>
                            {m.score_preview != null && (
                              <div style={{width:36, height:36, borderRadius:"49% 51% 50% 50% / 52% 48% 52% 48%", background:scoreBg(m.score_preview), color:scoreCol(m.score_preview), display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Lora', Georgia, serif", fontWeight:400, fontSize:16, flexShrink:0, letterSpacing:"-0.01em"}}>
                                {m.score_preview}
                              </div>
                            )}
                          </div>
                        ))}
                        <label style={{display:"block", padding:"11px 16px", borderTop:"1px solid var(--rule)", background:"var(--cream)", fontFamily:"'Lora', Georgia, serif", fontSize:14, color:"var(--moss)", textAlign:"center", cursor:"pointer"}}>
                          <input type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={async(e)=>{const f=e.target.files?.[0];if(!f)return;e.target.value="";setSearchMatches([]); await handleImageScan(f);}}/>
                          Can't find your product? Snap a photo of the label →
                        </label>
                      </div>
                    );
                  })()}
                </div>

                {/* ── HOME CONTENT (cream refresh — partiqule-hero-v5 mockup) ── */}
                <div style={{maxWidth:860, margin:"0 auto", padding: isMobile ? `${60 + SAFE_TOP + 40}px 24px 24px` : "80px 40px 32px", background:"var(--cream)"}}>

                  {/* Greeting block — Lora + DM Sans caps stamp */}
                  <div style={{marginBottom:32}}>
                    <div style={{
                      fontFamily:"'Lora', Georgia, serif",
                      fontSize: isMobile ? 34 : 38,
                      color:"var(--ink)",
                      letterSpacing:"-0.015em",
                      lineHeight:1.02,
                      fontWeight:400,
                      marginBottom:12,
                    }}>{greet}.</div>
                    <div style={{
                      fontFamily:"'DM Sans', system-ui, sans-serif",
                      fontSize:10.5, letterSpacing:"0.2em",
                      color:"var(--ink-faint)",
                      textTransform:"uppercase",
                      fontWeight:500,
                    }}>
                      {todayLabel} <span style={{color:"var(--ink-soft)"}}>·</span> {history.length} on your shelf
                      {streak >= 2 && <> <span style={{color:"var(--ink-soft)"}}>·</span> {streak} day streak</>}
                    </div>
                  </div>

                  {/* Scan CTA card — moss-bordered cream, asymmetric */}
                  <div
                    onClick={()=>{ if(isMobile) setScanSheetOpen(true); else document.getElementById("home-search-input")?.focus(); }}
                    style={{
                      background:"var(--cream-light)",
                      border:"1.5px solid var(--moss)",
                      padding:"26px 24px 28px",
                      borderRadius:"22px 18px 24px 20px / 20px 24px 18px 22px",
                      cursor:"pointer",
                      marginBottom:36,
                      transition:"transform 0.2s, border-color 0.2s, background 0.2s",
                    }}
                  >
                    <div style={{
                      fontFamily:"'DM Sans', system-ui, sans-serif",
                      fontSize:10, letterSpacing:"0.28em",
                      color:"var(--moss)",
                      textTransform:"uppercase",
                      fontWeight:500,
                      marginBottom:18,
                    }}>Scan</div>
                    <div style={{
                      fontFamily:"'Lora', Georgia, serif",
                      fontSize: isMobile ? 30 : 34,
                      lineHeight:1.04,
                      color:"var(--ink)",
                      letterSpacing:"-0.015em",
                      fontWeight:400,
                      marginBottom:12,
                      maxWidth:"92%",
                    }}>What are you looking at?</div>
                    <div style={{
                      fontFamily:"'DM Sans', system-ui, sans-serif",
                      fontSize:13, lineHeight:1.5, color:"var(--ink-soft)",
                    }}>Tap anywhere, point me at a label.</div>
                  </div>

                  {/* Your shelf — strip of placeholder illustrations from mockup */}
                  {history.length > 0 && (
                    <div style={{marginBottom:28}}>
                      <div style={{display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:14}}>
                        <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:22, color:"var(--ink)", letterSpacing:"-0.005em", fontWeight:400}}>
                          Your <span style={{color:"var(--moss)"}}>shelf</span>
                          <span style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:10, letterSpacing:"0.2em", color:"var(--ink-faint)", textTransform:"uppercase", fontWeight:500, marginLeft:10}}>{history.length} items</span>
                        </div>
                        <span onClick={()=>{setPage("history"); setResult(null);}} style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:10, color:"var(--moss)", fontWeight:500, letterSpacing:"0.2em", textTransform:"uppercase", cursor:"pointer"}}>See all</span>
                      </div>
                      <ShelfStrip items={history.slice(0,6)} onSelect={setResult}/>
                    </div>
                  )}

                  {/* Lifestyle score */}
                  {(() => {const ls=computeLifestyleScore(history);if(!ls)return null;return <LifestyleScoreCard score={ls} text={text} muted={muted} border={border} isMobile={isMobile} setPage={setPage}/>;})()}

                  {/* Feed link */}
                  {liveIntelCards?.length>0 && (
                    <div style={{display:"flex", justifyContent:"flex-end", marginBottom:12}}>
                      <span onClick={()=>{setPage("feed"); try{localStorage.setItem("ps_feed_last_visit", new Date().toISOString());}catch{}}}
                        style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:11, color:"var(--moss)", fontWeight:500, letterSpacing:"0.15em", textTransform:"uppercase", cursor:"pointer"}}>
                        {liveIntelCards.length} finding{liveIntelCards.length!==1?"s":""} in your feed →
                      </span>
                    </div>
                  )}

                  {/* For You intelligence carousel — static + live cards merged */}
                  {(() => {
                    const staticCards = generateForYouCards(history, childMode);
                    const relevantLive = filterLiveCards(liveIntelCards, history).map(c=>({type:"live_intel",priority:c.priority||8,headline:c.headline,body:c.body,label:c.label||"News",labelColor:c.label_color||"#d97706",action:c.action_text||"Learn more",actionUrl:c.action_url||null,actionPage:c.action_page||null,sourceName:c.source_name,sourceUrl:c.source_url}));
                    const allCards = [...relevantLive,...staticCards].sort((a,b)=>b.priority-a.priority).slice(0,8);
                    if (!allCards.length) return null;
                    return <ForYouCarousel cards={allCards} text={text} muted={muted} isMobile={isMobile} setPage={setPage} setResult={setResult} setQuery={setQuery} analyze={analyze} history={history}/>;
                  })()}

                  {/* This Week recap — mockup pattern */}
                  {history.length >= 3 && (() => {
                    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
                    const recentScans = history.filter(h => {
                      const t = h.scannedAt ? new Date(h.scannedAt).getTime() : 0;
                      return t >= weekAgo;
                    });
                    const cleanWins = history.filter(h => (h.overall_score || h.score || 10) <= 3).length;
                    const addedThisWeek = recentScans.length;
                    const scannedThisWeek = recentScans.length;
                    if (scannedThisWeek === 0 && cleanWins === 0) return null;
                    const lines = [
                      { n: scannedThisWeek, label: "products scanned", sub: scannedThisWeek >= 10 ? "a full week of scans" : scannedThisWeek >= 3 ? "a quiet week, honestly" : "just getting started" },
                      { n: addedThisWeek, label: "added to your shelf", sub: history.length > 0 ? `${history.slice(0, 2).map(h => h.product_name?.split(" ")[0] || "item").join(", ")}${history.length > 2 ? ", and more" : ""}` : null },
                      { n: cleanWins, label: "clean choices on your shelf", sub: cleanWins > 0 ? "nice work keeping these" : null },
                    ].filter(l => l.n != null && l.n > 0);
                    if (!lines.length) return null;
                    return (
                      <div style={{marginBottom:24}}>
                        <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:22, color:"var(--ink)", letterSpacing:"-0.005em", fontWeight:400, marginBottom:14}}>
                          This <span style={{color:"var(--moss)"}}>week</span>
                        </div>
                        <div>
                          {lines.map((l, i) => (
                            <div key={i} style={{
                              display:"flex", alignItems:"baseline", gap:16,
                              padding:"14px 0",
                              borderBottom: i < lines.length - 1 ? "1px solid var(--rule)" : "none",
                            }}>
                              <div style={{
                                fontFamily:"'Lora', Georgia, serif",
                                fontSize:30, color:"var(--moss)",
                                letterSpacing:"-0.02em", lineHeight:1,
                                minWidth:44, flexShrink:0, fontWeight:400,
                              }}>{l.n}</div>
                              <div style={{flex:1, fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:14, color:"var(--ink)", lineHeight:1.35}}>
                                {l.label}
                                {l.sub && (
                                  <div style={{
                                    fontFamily:"'Lora', Georgia, serif",
                                    color:"var(--ink-soft)", fontSize:13,
                                    marginTop:3, fontWeight:400,
                                  }}>{l.sub}</div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                </div>
              </div>
            );
          })() : (
          <>
          {/* ── NEW USER: full hero (cream refresh) ── */}

          {/* Fixed scan bar — always visible, never scrolls away */}
          <div style={{
            position:"fixed", top: (isMobile ? 60 : 72) + SAFE_TOP, left:0, right:0, zIndex:40,
            background:"var(--cream)",
            borderBottom:"1px solid var(--rule)",
            padding: isMobile ? "10px 16px" : "12px 40px",
          }}>
            <div style={{maxWidth:860, margin:"0 auto", display:"flex", alignItems:"center", gap:10}}>
              <div style={{flex:1, display:"flex", alignItems:"center", gap:10, background:"var(--cream-light)", border:"1px solid var(--rule-strong)", borderRadius:"14px 10px 15px 12px / 10px 15px 12px 14px", padding:"10px 16px", cursor:"text"}}
                onClick={()=>document.getElementById("hero-search-input")?.focus()}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--moss)" strokeWidth="2" opacity="0.55"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <input
                  id="hero-search-input"
                  value={query}
                  onChange={e=>setQuery(e.target.value)}
                  onKeyDown={e=>{
                    if (e.key !== "Enter" || !query.trim()) return;
                    if (searchMatches && searchMatches.length > 0) { selectSearchMatch(searchMatches[0]); return; }
                    analyze();
                  }}
                  placeholder="Search any product…"
                  style={{flex:1, border:"none", outline:"none", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:15, background:"transparent", color:"var(--ink)", minWidth:0}}
                />
                {query.trim() && (
                  <button onClick={()=>{
                    if (searchMatches && searchMatches.length > 0) { selectSearchMatch(searchMatches[0]); return; }
                    analyze();
                  }} style={{padding:"6px 14px", borderRadius:10, background:"var(--moss)", color:"var(--ivory)", border:"none", fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:500, fontSize:13, cursor:"pointer", flexShrink:0}}>Scan</button>
                )}
              </div>
              {/* Camera button — desktop only; mobile uses the bottom nav FAB */}
              {!isMobile && (<>
                <div onClick={()=>document.getElementById("hero-file-input").click()}
                  style={{width:44, height:44, borderRadius:"12px 16px 14px 18px / 16px 12px 18px 14px", background:"var(--cream-light)", border:"1px solid var(--rule-strong)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0}}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--moss)" strokeWidth="1.8"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
                </div>
                <input id="hero-file-input" type="file" accept="image/*" style={{display:"none"}} onChange={async(e)=>{const f=e.target.files?.[0];if(!f)return;e.target.value="";await handleImageScan(f);}}/>
              </>)}
            </div>
          </div>

          <style>{`
            @keyframes heroReveal { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
            @keyframes autoScroll { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
            .showcase-track:hover{animation-play-state:paused!important}
          `}</style>

          {/* Hero — cream with Lora headline */}
          <section style={{background:"var(--cream)", padding: isMobile ? `${60 + SAFE_TOP + 64}px 24px 40px` : "128px 40px 56px", transition:"opacity 0.4s ease", opacity: loading ? 0 : 1, pointerEvents: loading ? "none" : "auto"}}>
            <div style={{maxWidth:720, margin:"0 auto"}}>
              <div style={{
                fontFamily:"'DM Sans', system-ui, sans-serif",
                fontSize:10, letterSpacing:"0.22em", color:"var(--moss)",
                textTransform:"uppercase", fontWeight:500,
                display:"flex", alignItems:"center", gap:10,
                marginBottom:18,
                animation:"heroReveal 0.6s ease 0.1s both",
              }}>
                <span style={{display:"inline-block", width:22, height:1, background:"var(--moss)", opacity:0.7}}/>
                2,847 scanned today
              </div>

              <h1 style={{
                fontFamily:"'Lora', Georgia, serif",
                fontSize: isMobile ? 42 : 60,
                fontWeight:400, color:"var(--ink)",
                margin:"0 0 18px",
                letterSpacing:"-0.02em",
                lineHeight:1.02,
                animation:"heroReveal 0.6s ease 0.2s both",
              }}>
                Scan anything.<br/><span style={{color:"var(--moss)"}}>Know what's in it.</span>
              </h1>
              <p style={{
                fontFamily:"'Lora', Georgia, serif",
                fontSize: isMobile ? 17 : 20,
                color:"var(--ink-soft)",
                margin:0, lineHeight:1.5, fontWeight:400,
                letterSpacing:"-0.005em",
                animation:"heroReveal 0.6s ease 0.35s both",
              }}>
                {isMobile ? "Understand what's in your products before it affects your health." : "Understand the chemical reality of every product in your home, before it affects your health."}
              </p>
            </div>
          </section>

          {/* Product showcase — auto-scrolling cream cards */}
          <div style={{background:"var(--cream)", paddingBottom:0}}>
            <div style={{padding: isMobile ? "12px 0 20px" : "20px 0 28px"}}>
              <div style={{maxWidth:720, margin:"0 auto", padding:"0 24px", marginBottom:14}}>
                <div style={{
                  fontFamily:"'DM Sans', system-ui, sans-serif",
                  fontSize:10, letterSpacing:"0.22em", color:"var(--moss)",
                  textTransform:"uppercase", fontWeight:500,
                  display:"flex", alignItems:"center", gap:10,
                }}>
                  <span style={{display:"inline-block", width:22, height:1, background:"var(--moss)", opacity:0.7}}/>
                  Tap any to scan
                </div>
              </div>
              <div style={{overflow:"hidden", position:"relative"}}>
                <div style={{position:"absolute", left:0, top:0, bottom:0, width:60, background:"linear-gradient(90deg,var(--cream),transparent)", zIndex:2, pointerEvents:"none"}}/>
                <div style={{position:"absolute", right:0, top:0, bottom:0, width:60, background:"linear-gradient(270deg,var(--cream),transparent)", zIndex:2, pointerEvents:"none"}}/>
                <div className="showcase-track" style={{display:"flex", gap:12, paddingBottom:4, animation:"autoScroll 32s linear infinite", width:"max-content"}}>
                  {[
                    {name:"M&Ms",cat:"Candy",score:8,flag:"Red 40 · Yellow 5"},
                    {name:"Tide Pods",cat:"Laundry",score:7,flag:"PVA film · Brighteners"},
                    {name:"Honey Nut Cheerios",cat:"Cereal",score:6,flag:"BHT · Pesticides"},
                    {name:"Liquid Death",cat:"Water",score:1,flag:"Clean — no concerns"},
                    {name:"Neutrogena SPF",cat:"Sunscreen",score:6,flag:"Oxybenzone"},
                    {name:"RXBAR",cat:"Snack",score:2,flag:"Dates · Eggs · Nuts"},
                    {name:"Huggies Diapers",cat:"Baby",score:8,flag:"PFAS · Ahcovel"},
                    {name:"Skittles",cat:"Candy",score:8,flag:"Red 40 · Titanium dioxide"},
                    {name:"Lodge Cast Iron",cat:"Cookware",score:1,flag:"No coating — pure iron"},
                    {name:"Teflon Pan",cat:"Cookware",score:9,flag:"PTFE · Heat volatiles"},
                    {name:"Oat Yeah Oat Milk",cat:"Beverage",score:2,flag:"Oats · Water · Clean"},
                    {name:"Dawn Dish Soap",cat:"Cleaning",score:5,flag:"Synthetic fragrance"},
                    {name:"M&Ms",cat:"Candy",score:8,flag:"Red 40 · Yellow 5"},
                    {name:"Tide Pods",cat:"Laundry",score:7,flag:"PVA film · Brighteners"},
                    {name:"Honey Nut Cheerios",cat:"Cereal",score:6,flag:"BHT · Pesticides"},
                    {name:"Liquid Death",cat:"Water",score:1,flag:"Clean — no concerns"},
                    {name:"Neutrogena SPF",cat:"Sunscreen",score:6,flag:"Oxybenzone"},
                    {name:"RXBAR",cat:"Snack",score:2,flag:"Dates · Eggs · Nuts"},
                    {name:"Huggies Diapers",cat:"Baby",score:8,flag:"PFAS · Ahcovel"},
                    {name:"Skittles",cat:"Candy",score:8,flag:"Red 40 · Titanium dioxide"},
                    {name:"Lodge Cast Iron",cat:"Cookware",score:1,flag:"No coating — pure iron"},
                    {name:"Teflon Pan",cat:"Cookware",score:9,flag:"PTFE · Heat volatiles"},
                    {name:"Oat Yeah Oat Milk",cat:"Beverage",score:2,flag:"Oats · Water · Clean"},
                    {name:"Dawn Dish Soap",cat:"Cleaning",score:5,flag:"Synthetic fragrance"},
                  ].map((item,i)=>{
                    const sc = item.score <= 3 ? "var(--score-green)" : item.score <= 5 ? "var(--score-amber)" : "var(--score-red)";
                    const shapes = [
                      "12px 14px 10px 15px / 14px 10px 15px 12px",
                      "14px 10px 15px 12px / 10px 15px 12px 14px",
                      "10px 15px 12px 14px / 15px 12px 14px 10px",
                      "15px 12px 14px 10px / 12px 14px 10px 15px",
                    ];
                    return (
                      <div key={i} onClick={()=>{setQuery(item.name);analyze(item.name);}}
                        style={{
                          flexShrink:0, width:152,
                          background:"var(--cream-light)",
                          border:"1px solid var(--rule)",
                          borderRadius: shapes[i % shapes.length],
                          padding:"14px 14px 14px",
                          cursor:"pointer", position:"relative",
                          marginLeft: i === 0 ? (isMobile ? 24 : 40) : 0,
                        }}>
                        <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:9.5, letterSpacing:"0.22em", color:"var(--ink-faint)", marginBottom:8, fontWeight:500, textTransform:"uppercase"}}>{item.cat}</div>
                        <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:16, fontWeight:400, color:"var(--ink)", marginBottom:10, lineHeight:1.15, letterSpacing:"-0.005em"}}>{item.name}</div>
                        <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:30, fontWeight:400, color:sc, lineHeight:1, letterSpacing:"-0.02em"}}>{item.score}</div>
                        <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:10, color:"var(--ink-soft)", marginTop:6, lineHeight:1.4}}>{item.flag}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Goal gradient hook — "scan 3 to unlock" */}
            <div style={{maxWidth:600, margin:"0 auto 32px", padding:"0 24px"}}>
              <div style={{
                background:"var(--cream-light)",
                border:"1px dashed var(--moss)",
                borderRadius:"16px 20px 14px 18px / 18px 14px 20px 16px",
                padding:"18px 20px",
                display:"flex", alignItems:"center", gap:14,
              }}>
                <div style={{display:"flex", gap:8, flexShrink:0}}>
                  {[1,2,3].map(n => (
                    <div key={n} style={{
                      width:28, height:28,
                      borderRadius:"49% 51% 50% 50% / 52% 48% 52% 48%",
                      border:"1.5px dashed var(--moss)",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontFamily:"'Lora', Georgia, serif",
                      fontSize:14, fontWeight:400, color:"var(--moss)", opacity:0.55,
                    }}>{n}</div>
                  ))}
                </div>
                <div>
                  <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:17, fontWeight:400, color:"var(--ink)", marginBottom:2, letterSpacing:"-0.005em"}}>Scan three to unlock your shelf score.</div>
                  <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:12, color:"var(--ink-soft)", lineHeight:1.4}}>See your overall exposure across everything you use daily.</div>
                </div>
              </div>
            </div>

            {/* Today's Comparison — cream card */}
            {(() => {
              const comps = [
                {a:{name:"Heinz Ketchup",score:6,flags:"HFCS · Caramel color"},    b:{name:"Annie's Ketchup",score:2,flags:"Organic · 5 ingredients"}},
                {a:{name:"Tide Pods",score:7,flags:"PVA film · Brighteners"},       b:{name:"Blueland Laundry",score:2,flags:"Plastic-free · Clean"}},
                {a:{name:"Neutrogena SPF",score:6,flags:"Oxybenzone · Parabens"},   b:{name:"Badger Mineral SPF",score:2,flags:"Zinc oxide only"}},
                {a:{name:"Febreze Air",score:7,flags:"Synthetic fragrance · VOCs"}, b:{name:"Branch Basics",score:2,flags:"No synthetic fragrance"}},
                {a:{name:"Gatorade",score:6,flags:"Artificial dyes · HFCS"},        b:{name:"Liquid IV",score:3,flags:"Cleaner formula"}},
                {a:{name:"Dawn Dish Soap",score:5,flags:"Fragrance · SLS"},         b:{name:"Branch Basics Dish",score:2,flags:"Fragrance-free"}},
                {a:{name:"Lay's Chips",score:5,flags:"Seed oils · Natural flavors"},b:{name:"Siete Chips",score:2,flags:"Avocado oil · Clean"}},
              ];
              const tc = comps[new Date().getDay()];
              const sc = s => s <= 3 ? "var(--score-green)" : s <= 5 ? "var(--score-amber)" : "var(--score-red)";
              const scSoft = s => s <= 3 ? "var(--score-green-soft)" : s <= 5 ? "var(--score-amber-soft)" : "var(--score-red-soft)";
              return (
                <div style={{maxWidth:600, margin:"0 auto 40px", padding:"0 24px"}}>
                  <div style={{
                    fontFamily:"'DM Sans', system-ui, sans-serif",
                    fontSize:10, letterSpacing:"0.22em", color:"var(--moss)",
                    textTransform:"uppercase", fontWeight:500,
                    display:"flex", alignItems:"center", gap:10,
                    marginBottom:12,
                  }}>
                    <span style={{display:"inline-block", width:22, height:1, background:"var(--moss)", opacity:0.7}}/>
                    Today's comparison
                  </div>
                  <div style={{
                    background:"var(--cream-light)",
                    border:"1px solid var(--rule)",
                    borderRadius:"20px 14px 18px 16px / 14px 18px 16px 20px",
                    padding:"20px", display:"flex", gap:12, alignItems:"center",
                  }}>
                    {[tc.a, tc.b].map((prod, pi) => (
                      <React.Fragment key={pi}>
                        {pi === 1 && (
                          <div style={{
                            fontFamily:"'DM Sans', system-ui, sans-serif",
                            fontSize:10, letterSpacing:"0.22em",
                            fontWeight:500, color:"var(--ink-faint)",
                            textTransform:"uppercase", flexShrink:0,
                          }}>vs</div>
                        )}
                        <div onClick={()=>{setQuery(prod.name); analyze(prod.name);}}
                          style={{
                            flex:1, background:"var(--cream)",
                            border:"1px solid var(--rule)",
                            borderRadius:"12px 16px 14px 18px / 16px 12px 18px 14px",
                            padding:"14px 12px", textAlign:"center", cursor:"pointer",
                          }}>
                          <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:16, fontWeight:400, color:"var(--ink)", marginBottom:10, lineHeight:1.15, letterSpacing:"-0.005em"}}>{prod.name}</div>
                          <div style={{
                            width:48, height:48,
                            borderRadius:"49% 51% 50% 50% / 52% 48% 52% 48%",
                            background: scSoft(prod.score),
                            border:`2px solid ${sc(prod.score)}`,
                            display:"flex", alignItems:"center", justifyContent:"center",
                            margin:"0 auto 8px",
                          }}>
                            <span style={{fontFamily:"'Lora', Georgia, serif", fontSize:22, fontWeight:400, color:sc(prod.score), letterSpacing:"-0.01em"}}>{prod.score}</span>
                          </div>
                          <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:10.5, color:"var(--ink-soft)", lineHeight:1.4}}>{prod.flags}</div>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                  <div style={{textAlign:"center", marginTop:12}}>
                    <span style={{fontFamily:"'Lora', Georgia, serif", fontSize:13, color:"var(--ink-faint)", fontWeight:400}}>Tap either product to see the full breakdown.</span>
                  </div>
                </div>
              );
            })()}
          </div>

          {error && (
            <div style={{maxWidth:600, margin:"0 auto 20px", padding:"0 24px"}}>
              <div style={{
                padding:"14px 20px",
                background:"var(--score-red-soft)",
                borderRadius:"14px 10px 15px 12px / 10px 15px 12px 14px",
                border:"1px solid var(--score-red)",
                fontFamily:"'DM Sans', system-ui, sans-serif",
                color:"var(--score-red)", fontSize:14,
              }}>{error}</div>
            </div>
          )}

          {/* Email capture — cream card */}
          {!emailDismissed && !user && (
            <div style={{maxWidth:520, margin:"0 auto", padding:"0 24px 40px"}}>
              <div style={{
                background:"var(--cream-light)",
                border:"1px solid var(--rule)",
                borderRadius:"16px 20px 14px 18px / 18px 14px 20px 16px",
                padding:"22px",
              }}>
                <div style={{
                  fontFamily:"'DM Sans', system-ui, sans-serif",
                  fontSize:10, letterSpacing:"0.22em", color:"var(--moss)",
                  textTransform:"uppercase", fontWeight:500,
                  display:"flex", alignItems:"center", gap:10,
                  marginBottom:10,
                }}>
                  <span style={{display:"inline-block", width:22, height:1, background:"var(--moss)", opacity:0.7}}/>
                  Weekly alerts
                </div>
                <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:19, fontWeight:400, color:"var(--ink)", marginBottom:6, lineHeight:1.15, letterSpacing:"-0.005em"}}>Recalls, ingredient flags, safer swaps.</div>
                <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:13, color:"var(--ink-soft)", marginBottom:16, lineHeight:1.5}}>Straight to your inbox. No spam.</div>
                <div style={{display:"flex", gap:8}}>
                  <input type="email" placeholder="your@email.com" value={captureEmail} onChange={e=>setCaptureEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submitCaptureEmail()}
                    style={{flex:1, padding:"10px 14px", borderRadius:"14px 10px 15px 12px / 10px 15px 12px 14px", border:"1px solid var(--rule-strong)", background:"var(--cream)", color:"var(--ink)", fontSize:13, outline:"none", fontFamily:"'DM Sans', system-ui, sans-serif"}}/>
                  <button onClick={submitCaptureEmail} disabled={captureSubmitting}
                    style={{padding:"10px 18px", background:"var(--moss)", color:"var(--ivory)", border:"none", borderRadius:"22px 18px 24px 20px / 20px 24px 18px 22px", fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:500, fontSize:13, cursor:"pointer", whiteSpace:"nowrap", opacity:captureSubmitting?0.7:1, letterSpacing:"0.005em"}}>
                    {captureSubmitting ? "..." : captureMsg ? "Done" : "Stay informed"}
                  </button>
                </div>
              </div>
            </div>
          )}

          </>
          )}

          {history.length === 0 && (
          <div style={{paddingTop: isMobile?32:56}}>

            {/* RECENTLY VIEWED CAROUSEL */}
            {history.length > 0 && (
              <div style={{maxWidth:1100, margin:"0 auto 40px", padding:`0 ${isMobile?"16px":"40px"}`}}>
                <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14}}>
                  <h2 style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:700, fontSize:isMobile?16:18, color:text, margin:0}}>Recently viewed</h2>
                  <span onClick={()=>{setPage("history"); setResult(null);}} style={{fontSize:13, color:"#16a34a", fontWeight:600, cursor:"pointer"}}>See all →</span>
                </div>
                <div style={{display:"flex", gap:12, overflowX:"auto", paddingBottom:8, scrollbarWidth:"none", msOverflowStyle:"none"}}>
                  <style>{`.carousel::-webkit-scrollbar{display:none}`}</style>
                  <div className="carousel" style={{display:"flex", gap:12, overflowX:"auto", paddingBottom:8, width:"100%"}}>
                    {history.slice(0,6).map((item,i)=>(
                      <button key={i} onClick={()=>setResult(item)}
                        style={{flexShrink:0, width:isMobile?120:130, background:surface, borderRadius:12, padding:"12px", border:`1.5px solid ${border}`, cursor:"pointer", textAlign:"left", transition:"all 0.15s"}}
                        onMouseEnter={e=>{e.currentTarget.style.borderColor="#16a34a";}}
                        onMouseLeave={e=>{e.currentTarget.style.borderColor=border;}}>
                        {/* Score circle */}
                        <div style={{width:32, height:32, borderRadius:"50%", background:scoreBg(item.score), display:"flex", alignItems:"center", justifyContent:"center", marginBottom:8}}>
                          <span style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:800, fontSize:13, color:scoreColor(item.score)}}>{item.score}</span>
                        </div>
                        <div style={{fontSize:12, fontWeight:600, color:text, lineHeight:1.3, marginBottom:4, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical"}}>
                          {item.product_name}
                        </div>
                        <div style={{fontSize:11, color:scoreColor(item.score), fontWeight:600}}>{scoreLabel(item.score)}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          )}
        </>
      ) : (
        /* RESULTS */
        <>
        <div style={{maxWidth:1100, margin:"0 auto", padding:isMobile?"24px 0 60px":`40px 40px 80px`}}>
          <div style={{padding: isMobile ? "0 12px" : 0}}>
          </div>

          {/* Demo banner */}
          {result.isDemo && (
            <div style={{marginBottom:20, padding:"12px 20px", background:"#eff6ff", borderRadius:12, border:"1.5px solid #93c5fd", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap"}}>
              <div style={{display:"flex", alignItems:"center", gap:10}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
                <div>
                  <div style={{fontSize:13, fontWeight:700, color:"#2563eb"}}>This is a demo scan</div>
                  <div style={{fontSize:12, color:"#555"}}>M&Ms is a real example. Scan any product to get your own result.</div>
                </div>
              </div>
              <button onClick={reset} style={{padding:"7px 16px", borderRadius:8, background:"#2563eb", color:"#fff", border:"none", fontWeight:600, fontSize:13, cursor:"pointer", whiteSpace:"nowrap"}}>
                Scan a product →
              </button>
            </div>
          )}
          <div style={{display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:isMobile?12:28, alignItems:"start", padding:isMobile?"0 8px":0}}>

            {/* LEFT */}
            {(() => {
            const displayScore = pregnancyMode && result.pregnancy_score ? result.pregnancy_score : (childMode && result.child_score) ? result.child_score : (result.overall_score || result.score);
            return (
            <div style={{display:"flex", flexDirection:"column", gap:isMobile?12:20}}>

              {/* Product header — LIFTED OUTSIDE the score card (Phase 4 Part A restructure).
                  Mockup puts stamp + brand + product name + composition ABOVE a thin rule,
                  then a separate verdict block below. Stamp uses the existing cached/verified
                  signals from the score card header but repositioned left. */}
              {(() => {
                const fullName = result.product_name || "";
                const { brand, body: productBodyRaw } = extractBrand(fullName, result.brand);
                const productBody = productBodyRaw || fullName;
                const displayName = productBody.length > 60 ? productBody.slice(0, 57) + "…" : productBody;
                const cat = result.category || "";
                const compositionLine = (() => {
                  if (cat === "clothing" && result.composition) {
                    return String(result.composition).toUpperCase().replace(/\s*[,·]\s*/g, " · ");
                  }
                  if (Array.isArray(result.ingredient_list) && result.ingredient_list.length > 0) {
                    return result.ingredient_list.slice(0, 3).map(x => String(x).trim().toUpperCase()).join(" · ");
                  }
                  return null;
                })();
                return (
                  <div style={{padding: isMobile ? "4px 4px 0" : "0", textAlign:"left"}}>
                    {/* Stamp row — logged time + confidence signals, DM Sans caps */}
                    <div style={{
                      display:"flex", alignItems:"center", gap:10, flexWrap:"wrap",
                      fontFamily:"'DM Sans', system-ui, sans-serif",
                      fontSize:10, letterSpacing:"0.22em",
                      color:"var(--ink-faint)",
                      textTransform:"uppercase", fontWeight:500,
                      marginBottom:14,
                    }}>
                      <span style={{display:"inline-block", width:22, height:1, background:"var(--moss)", opacity:0.6}}/>
                      <span>Logged · just now</span>
                      {result.cached && (
                        <span style={{color:"var(--moss)"}}>· Verified</span>
                      )}
                      {/* Stamp annotation:
                          - cascade-sourced (medium/low confidence): show source_label
                            ("Sourced from Open Food Facts", "Best guess from product name", etc)
                          - calibration / barcode / prior scan (source_confidence null): show
                            nothing in the stamp — the score itself carries the trust.
                          - Older results without source fields: fall back to AI confidence text. */}
                      {result.source_label && (result.source_confidence === "medium" || result.source_confidence === "low") ? (
                        <span style={{color: result.source_confidence === "low" ? "var(--amber)" : "var(--ink-soft)"}}>
                          · {result.source_label}
                        </span>
                      ) : !result.source && result.confidence ? (
                        <span style={{color: result.confidence==="high" ? ("var(--moss)") : result.confidence==="medium" ? ("var(--ink-soft)") : ("var(--amber)")}}>
                          · {result.confidence} confidence
                        </span>
                      ) : null}
                    </div>
                    {brand && (
                      <div style={{
                        fontFamily:"'DM Sans', system-ui, sans-serif",
                        fontSize:11, letterSpacing:"0.22em",
                        color:"var(--ink)",
                        textTransform:"uppercase", fontWeight:500,
                        marginBottom:4,
                      }}>{brand.toUpperCase()}</div>
                    )}
                    <h2 style={{
                      fontFamily:"'Lora', Georgia, serif",
                      fontSize: isMobile ? 30 : 38,
                      fontWeight:400,
                      color:text,
                      margin:"0 0 12px",
                      letterSpacing:"-0.015em",
                      // 1.02 was clipping Lora ascenders on iOS Safari for product names
                      // that started near the top of the result section. 1.1 keeps the tight
                      // editorial feel while leaving room for cap-height + descenders.
                      lineHeight:1.1,
                      wordBreak:"break-word",
                    }}>{displayName}</h2>
                    {compositionLine && (
                      <div style={{
                        fontFamily:"'DM Sans', system-ui, sans-serif",
                        fontSize:10.5, letterSpacing:"0.14em",
                        color:"var(--ink-soft)",
                        textTransform:"uppercase",
                        paddingBottom:14,
                        borderBottom:`1px solid ${"var(--rule)"}`,
                        marginBottom:4,
                      }}>{compositionLine}</div>
                    )}
                    {/* Source label is now rendered in the stamp row above (· Sourced from …),
                        so we don't duplicate it here. */}
                  </div>
                );
              })()}

              <div className="score-reveal" style={{
                // Background stays neutral cream regardless of score. Per design system:
                // "result card background must remain neutral cream" — score color is
                // carried by the ring stroke + score number + verdict accent only.
                background:"var(--cream-light)",
                borderRadius: "16px 20px 14px 18px / 18px 14px 20px 16px",
                padding:isMobile?"22px 16px":"32px 32px",
                border:"1px solid var(--rule)",
                textAlign:"center",
              }}>
                {/* Header row — "scanned by others" badge (other badges moved to stamp above) */}
                {result.cached && (
                  <div style={{display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginBottom:14, flexWrap:"wrap"}}>
                    <div style={{
                      fontFamily:"'DM Sans', system-ui, sans-serif",
                      fontSize:10, letterSpacing:"0.22em",
                      color:"var(--moss)",
                      textTransform:"uppercase", fontWeight:500,
                      display:"flex", alignItems:"center", gap:10,
                    }}>
                      <span style={{display:"inline-block", width:22, height:1, background:"var(--moss)", opacity:0.7}}/>
                      Scanned by others
                    </div>
                  </div>
                )}

                {/* Hero score — swaps to child score when childMode active */}
                {(() => {
                  // Kids mode treatment (Phase 4 Part G): when childMode active AND displayed
                  // score is 6+, surface a terracotta "FOR A KID" eyebrow above the ring.
                  // Color stays natural terracotta — words carry the weight, not saturation.
                  const showKidLabel = childMode && displayScore != null && displayScore >= 6;
                  return (<>
                    {showKidLabel && (
                      <div style={{
                        display:"flex", justifyContent:"center",
                        marginBottom: 8,
                        fontFamily:"'DM Sans', system-ui, sans-serif",
                        fontSize: 10,
                        letterSpacing: "0.22em",
                        color: "var(--score-red)",
                        textTransform: "uppercase",
                        fontWeight: 500,
                      }}>
                        <span style={{display:"inline-flex", alignItems:"center", gap:10}}>
                          <span style={{display:"inline-block", width:22, height:1, background:"var(--score-red)", opacity:0.7}}/>
                          For a kid · Score {Math.round(displayScore)} of 10
                          <span style={{display:"inline-block", width:22, height:1, background:"var(--score-red)", opacity:0.7}}/>
                        </span>
                      </div>
                    )}
                    <div style={{display:"flex",justifyContent:"center",marginBottom:4}}>
                      {(displayScore == null || isNaN(displayScore) || result._streaming && result._stage === "identified")
                        ? <ScorePlaceholder stage={streamStage || result._stage}/>
                        : <ScoreArc score={displayScore}/>}
                    </div>

                    {/* Pre-release / status banner — renders above the score context
                        when a calibration entry carries a status field (e.g. pre_release
                        for brands that haven't shipped product yet). Score still renders
                        so users get the expected-range preview, but the card makes it
                        explicit this is anticipated scoring, not a verified current product. */}
                    {result.release_status && (
                      <div style={{
                        marginTop: 12, marginBottom: 4,
                        background: "var(--cream-light)",
                        border: "1px solid var(--amber)",
                        borderRadius: "var(--card-shape-2)",
                        padding: "12px 16px",
                        textAlign: "left",
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                      }}>
                        <div style={{
                          display: "flex", alignItems: "center", gap: 8, marginBottom: 6,
                        }}>
                          <div style={{ width: 18, height: 1, background: "var(--amber)", opacity: 0.8 }}/>
                          <span style={{
                            fontSize: 10.5, letterSpacing: "0.22em", textTransform: "uppercase",
                            color: "var(--amber)", fontWeight: 500,
                          }}>
                            {result.release_status.status === "pre_release" ? "Not yet shipped" : result.release_status.status.replace(/_/g, " ")}
                          </span>
                        </div>
                        <div style={{
                          fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.5,
                        }}>
                          {result.release_status.note || "This product isn't available for purchase yet. Score reflects the brand's stated claims — we'll update once independent verification lands."}
                          {result.release_status.expected_release && (
                            <span style={{ color: "var(--ink-faint)" }}>
                              {" "}Expected: {result.release_status.expected_release}.
                            </span>
                          )}
                        </div>

                        {/* Verified claims — substantiated disclosures */}
                        {Array.isArray(result.release_status.verified) && result.release_status.verified.length > 0 && (
                          <div style={{marginTop: 14}}>
                            <div style={{
                              fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase",
                              color: "var(--moss)", fontWeight: 500,
                              marginBottom: 8, display: "flex", alignItems: "center", gap: 10,
                            }}>
                              <span style={{display:"inline-block", width:22, height:1, background:"var(--moss)", opacity:0.7}}/>
                              Verified
                            </div>
                            {result.release_status.verified.map((v, i) => (
                              <div key={i} style={{display:"flex", gap:8, fontSize:13, color:"var(--ink-soft)", lineHeight:1.5, marginBottom:6, alignItems:"flex-start"}}>
                                <span style={{flexShrink:0, marginTop:2}}><IconCheck size={14} color="var(--moss)"/></span>
                                <div style={{flex:1}}>
                                  {v.url ? (
                                    <a href={v.url} target="_blank" rel="noopener noreferrer" style={{color:"var(--moss)", textDecoration:"none", borderBottom:"1px solid var(--moss-soft)"}}>{v.claim}</a>
                                  ) : v.claim}
                                  {(v.source || v.date) && (
                                    <span style={{color:"var(--ink-faint)", fontSize:12}}>
                                      {" · "}{[v.source, v.date].filter(Boolean).join(", ")}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Pending claims — promise vs proof */}
                        {Array.isArray(result.release_status.pending) && result.release_status.pending.length > 0 && (
                          <div style={{marginTop: 14}}>
                            <div style={{
                              fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase",
                              color: "var(--amber)", fontWeight: 500,
                              marginBottom: 8, display: "flex", alignItems: "center", gap: 10,
                            }}>
                              <span style={{display:"inline-block", width:22, height:1, background:"var(--amber)", opacity:0.7}}/>
                              Pending
                            </div>
                            {result.release_status.pending.map((p, i) => (
                              <div key={i} style={{fontSize:13, color:"var(--ink-soft)", lineHeight:1.5, marginBottom:6}}>
                                <span style={{color:"var(--ink-faint)"}}>·</span> {p.claim}
                                {(p.status || p.expectedBy) && (
                                  <span style={{color:"var(--ink-faint)", fontSize:12}}>
                                    {" · "}{p.status}
                                    {p.expectedBy && ` · expected ${p.expectedBy}`}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Third-party references — independent coverage */}
                        {Array.isArray(result.release_status.third_party_references) && result.release_status.third_party_references.length > 0 && (
                          <div style={{marginTop: 14}}>
                            <div style={{
                              fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase",
                              color: "var(--moss)", fontWeight: 500,
                              marginBottom: 8, display: "flex", alignItems: "center", gap: 10,
                            }}>
                              <span style={{display:"inline-block", width:22, height:1, background:"var(--moss)", opacity:0.7}}/>
                              Independent coverage
                            </div>
                            {result.release_status.third_party_references.map((t, i) => (
                              <div key={i} style={{fontSize:13, color:"var(--ink-soft)", lineHeight:1.5, marginBottom:8}}>
                                <a href={t.url} target="_blank" rel="noopener noreferrer" style={{color:"var(--moss)", fontWeight:500, textDecoration:"none"}}>{t.source}</a>
                                {t.date && <span style={{color:"var(--ink-faint)", fontSize:12, marginLeft:6}}>{t.date}</span>}
                                {t.summary && <div style={{marginTop:2, color:"var(--ink-soft)", fontSize:12}}>{t.summary}</div>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {result.category_score_context && (
                      <div style={{
                        fontSize: 12,
                        color: "#94a3b8",
                        marginTop: 4,
                        letterSpacing: "0.02em"
                      }}>
                        {result.category_score_context}
                      </div>
                    )}

                    {/* Dashboard-voice subtitle ("Chemical safety + nutritional impact …")
                        removed 2026-04-21 — the score itself plus category context line
                        below carries the framing. */}

                    {/* Single verdict sentence — swaps to kid verdict when childMode active.
                        Falls back to adult verdict, then friendly score-bucket sentence for cached
                        pre-deploy scans. Friendly fallback uses the design system voice (knowing
                        friend, not dashboard) so cached scans never show "Caution — real concerns". */}
                    {(() => {
                      // Verdict ALWAYS derived from displayScore so it can't
                      // contradict the score number on screen. Past bug: AI-
                      // generated verdict_adult / verdict_kid fields stored
                      // with the cached scan would render text from a pre-
                      // bump or pre-floor score, leaving users with messages
                      // like "Safe for a kid" next to a 10/10 ring (toothpaste
                      // Apr 25) or "Not ideal" next to a green 3 (drink mix
                      // barcode same day). Bucket-by-score is honest and
                      // never disagrees with the visible number.
                      // Verdict bucket copy refreshed 2026-04-28. Humanized
                      // wording — fewer first-person prescriptions, more
                      // honest description of where the product sits.
                      //   1-3  Looks good.
                      //   4-5  Could be cleaner.
                      //   6    Swap when you can.
                      //   7    Better options exist.
                      //   8-9  Hard pass.
                      //   10   Avoid.
                      // Score color thresholds (≤3 green / ≤5 amber / >5
                      // red) are unchanged — color and verdict can have
                      // different sensitivities.
                      const friendly = displayScore <= 3 ? "Looks good."
                        : displayScore <= 5 ? "Could be cleaner."
                        : displayScore <= 6 ? "Swap when you can."
                        : displayScore <= 7 ? "Better options exist."
                        : displayScore <= 9 ? "Hard pass."
                        : "Avoid.";
                      // Tier 5 / low-confidence best-guess scores — same
                      // bucket boundaries, hedged tone.
                      const isGuess = result.source_confidence === "low" || result.confidence === "low";
                      const guessVerdict = displayScore <= 3 ? "Probably fine."
                        : displayScore <= 5 ? "Hard to say without the label."
                        : displayScore <= 6 ? "Worth a closer look at the label."
                        : displayScore <= 7 ? "Likely worth a swap once you see the label."
                        : displayScore <= 9 ? "Skip until you can verify."
                        : "Avoid.";
                      const sentence = isGuess
                        ? (childMode ? `For a kid: ${guessVerdict}` : guessVerdict)
                        : (childMode ? `For a kid: ${friendly}` : friendly);
                      return (
                        <div style={{
                          marginTop:14, marginBottom:2, textAlign:"center", padding:"0 12px",
                          fontFamily:"'Lora', Georgia, serif",
                          fontSize:18, lineHeight:1.35,
                          color:"var(--ink)", fontWeight:400, letterSpacing:"-0.005em",
                        }}>
                          {sentence}
                        </div>
                      );
                    })()}

                    {/* Pregnancy mode indicator — shown when pregnancy mode active in settings */}
                    {pregnancyMode && result.pregnancy_score && (
                      <div style={{marginTop:14, marginBottom:4}}>
                        <div style={{
                          display:"flex", alignItems:"center", gap:8, margin:"0 auto", width:"fit-content",
                          padding:"7px 16px", borderRadius:20,
                          background:"#4a1942", border:"none",
                        }}>
                          <span style={{fontSize:13, fontWeight:700, color:"#f9a8d4"}}>PREG</span>
                          <span style={{fontSize:12, fontWeight:700, color:"#f9a8d4", letterSpacing:"0.03em"}}>
                            Scoring for pregnancy
                          </span>
                        </div>
                        {result.pregnancy_score !== (result.overall_score || result.score) && (
                          <div style={{
                            marginTop:12, background:"#fdf4ff",
                            border:"1.5px solid #2d5a2744", borderRadius:12,
                            padding:"12px 16px", textAlign:"left",
                          }}>
                            <div style={{fontSize:12, fontWeight:700, color:"#7e22ce", marginBottom:6}}>
                              Pregnancy safety score: {result.pregnancy_score}/10 vs {result.overall_score || result.score}/10 standard
                            </div>
                            {(result.pregnancy_bumps || []).slice(0,2).map((b,i) => (
                              <div key={i} style={{fontSize:11, color:"#6b21a8", lineHeight:1.5, marginBottom:i < (result.pregnancy_bumps||[]).length-1 ? 4 : 0}}>
                                · {b}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Child mode toggle — only shown when pregnancy mode is off */}
                    {!pregnancyMode && (
                    <div style={{marginTop:14, marginBottom:4}}>
                      <button
                        onClick={() => { const next = !childMode; setChildMode(next); try{if(next)localStorage.setItem("partiqule_child_mode","1");else localStorage.removeItem("partiqule_child_mode");}catch{} track("Child Mode Toggle", {enabled: next, product: result?.product_name}); }}
                        style={{
                          display:"flex", alignItems:"center", gap:10, margin:"0 auto",
                          padding:"7px 16px", borderRadius:9999,
                          background: childMode ? "var(--moss)" : "var(--cream-light)",
                          border: childMode ? "none" : "1px solid var(--rule)",
                          cursor:"pointer", transition:"all 0.2s",
                          fontFamily:"'DM Sans', system-ui, sans-serif",
                        }}>
                        <span style={{
                          fontFamily:"'DM Sans', system-ui, sans-serif",
                          fontSize:12, fontWeight:500,
                          color: childMode ? "var(--ivory)" : "var(--ink-soft)",
                          letterSpacing:"0.02em",
                        }}>
                          {childMode ? "Scoring for a child" : "Score for a child?"}
                        </span>
                        {/* Toggle pill — track color matches container so the knob reads */}
                        <div style={{
                          width:30, height:16, borderRadius:8,
                          background: childMode ? "rgba(249,245,234,0.25)" : "var(--rule)",
                          position:"relative", transition:"background 0.2s", flexShrink:0,
                        }}>
                          <div style={{
                            position:"absolute", top:3, left: childMode ? 15 : 3,
                            width:10, height:10, borderRadius:"50%",
                            background: childMode ? "var(--ivory)" : "var(--ink-faint)",
                            transition:"left 0.2s",
                          }}/>
                        </div>
                      </button>

                      {/* Child score explanation card */}
                      {childMode && result.child_score && result.child_score !== (result.overall_score || result.score) && (
                        <div style={{
                          marginTop:12, background:"var(--moss-soft)",
                          border:"1px solid var(--rule)", borderRadius:"var(--card-shape-2)",
                          padding:"12px 16px", textAlign:"left",
                        }}>
                          <div style={{fontSize:12, fontWeight:600, color:"var(--moss-deep)", marginBottom:6}}>
                            Child safety score: {result.child_score}/10 vs {result.overall_score || result.score}/10 for adults
                          </div>
                          {(result.child_bumps || []).slice(0,2).map((b,i) => (
                            <div key={i} style={{fontSize:11, color:"#166534", lineHeight:1.5, marginBottom:i < (result.child_bumps||[]).length-1 ? 4 : 0}}>
                              · {b}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Good kid score — green tier, child score matches adult score (no bumps needed) */}
                      {childMode && result.child_score && result.child_score <= 3 && result.child_score === (result.overall_score || result.score) && (
                        <div style={{
                          marginTop:12, background:"var(--moss-soft)",
                          border:"1px solid var(--rule)", borderRadius:"var(--card-shape-2)",
                          padding:"12px 16px", textAlign:"left",
                        }}>
                          <div style={{fontSize:13, fontWeight:500, color:"var(--moss-deep)", fontFamily:"'DM Sans', system-ui, sans-serif"}}>
                            Kid-friendly score. Nice find.
                          </div>
                        </div>
                      )}

                      {/* Auto-detected child product notice */}
                      {result.is_child_product && !childMode && (
                        <div style={{marginTop:10}}>
                          <button
                            onClick={() => { setChildMode(true); try{localStorage.setItem("partiqule_child_mode","1");}catch{} }}
                            style={{
                              width:"100%", padding:"8px 14px", borderRadius:10,
                              background:"#f0fdf4",
                              border:"1px dashed #16a34a88",
                              cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                            }}>
                            <span style={{fontSize:12, color:"#16a34a", fontWeight:600}}>
                              This looks like a child's product — see child safety score
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                    )}
                  </>);
                })()}

                {/* "Which room?" selector lives on Surface 2 (detail overlay) — moved off
                    Surface 1 on 2026-04-20 per the Surface 1 reduction. See the room tag
                    block below the BREAKING IT DOWN section. */}

                {/* Intelligence cards — regulatory findings relevant to this product */}
                {result.intelligence_cards?.length > 0 && (
                  <div style={{marginBottom:16}}>
                    {result.intelligence_cards.map((card,i)=>(
                      <div key={card.id||i} onClick={()=>{if(card.action_url)window.open(card.action_url,"_blank");}} style={{marginBottom:8,padding:"12px 16px",borderRadius:12,background:"#fffbeb",border:`1.5px solid ${"#fde68a"}`,cursor:card.action_url?"pointer":"default"}}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                          <div style={{fontSize:10,fontWeight:700,color:card.label_color||"#d97706",textTransform:"uppercase",letterSpacing:"0.08em",background:`${card.label_color||"#d97706"}20`,borderRadius:20,padding:"2px 8px",display:"inline-block"}}>{card.label}</div>
                          {card.source_name&&<div style={{fontSize:10,color:muted}}>{card.source_name}</div>}
                        </div>
                        <div style={{fontSize:13,fontWeight:700,color:text,marginBottom:4,lineHeight:1.4}}>{card.headline}</div>
                        <div style={{fontSize:12,color:muted,lineHeight:1.5}}>{card.body}</div>
                        {card.action_url&&<div style={{fontSize:11,fontWeight:700,color:card.label_color||"#d97706",marginTop:6}}>{card.action_text||"Learn more"} →</div>}
                      </div>
                    ))}
                  </div>
                )}

                {/* FLAGGED SUBSTANCES and NUTRITION BADGES moved to Surface 2 (detail overlay). */}

                {/* SOURCING FLAGS — wild caught, farm-raised, grass-fed,
                    organic, etc. derived from the product name. Backend
                    sets result.sourcing_flags for whole-food paths;
                    frontend falls back to deriveSourcingFlags() so every
                    scan can surface relevant chips. */}
                <SourcingFlags flags={
                  Array.isArray(result.sourcing_flags) && result.sourcing_flags.length > 0
                    ? result.sourcing_flags
                    : deriveSourcingFlags(result.product_name)
                }/>

                {/* Alt teaser — renders for every scanned product where a
                    genuinely cleaner alternative exists. The altS >= currentScore
                    guard below handles the "no meaningful improvement" case
                    honestly: a score-1 product never shows the teaser (nothing
                    can score lower), and any product with no cleaner alt in the
                    DB falls through the same way. Sara's content arc is about
                    the continuous clean-up journey, so we surface the best
                    available alternative even on clean-tier scans. */}
                {(() => {
                  const topAlt = result.alternatives?.[0] || result.ai_alternatives?.[0];
                  const currentScore = pregnancyMode && result.pregnancy_score ? result.pregnancy_score : (childMode && result.child_score) ? result.child_score : (result.overall_score || result.score);
                  if (!topAlt) return null;
                  const altS = topAlt.score ?? topAlt.estimated_score ?? 2;
                  if (altS >= currentScore) return null;
                  return (
                    <button
                      onClick={()=> isMobile ? setShowAlts(true) : document.getElementById("desktop-alternatives")?.scrollIntoView({behavior:"smooth", block:"start"})}
                      style={{
                        width:"100%", marginBottom:14, padding:"10px 16px",
                        borderRadius:"var(--tile-shape-2)",
                        background:"var(--cream-light)",
                        border:"1px solid var(--rule)",
                        cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, textAlign:"left",
                        fontFamily:"'DM Sans', system-ui, sans-serif",
                      }}>
                      <div style={{display:"flex", alignItems:"center", gap:10, flexWrap:"wrap"}}>
                        <span style={{fontSize:10.5, color:"var(--moss)", fontWeight:500, textTransform:"uppercase", letterSpacing:"0.18em"}}>Better option</span>
                        <span style={{fontSize:13, color:"var(--ink)", fontWeight:500}}>{topAlt.name}</span>
                        <span style={{
                          fontSize:11, fontWeight:500, padding:"2px 8px", borderRadius:10,
                          background:"var(--moss-soft)", color:"var(--moss)",
                          border:"1px solid var(--rule-soft)",
                        }}>{altS}/10</span>
                      </div>
                      <span style={{fontSize:12, color:"var(--moss)", fontWeight:500, flexShrink:0}}>
                        {isMobile ? "See alternatives →" : "See right →"}
                      </span>
                    </button>
                  );
                })()}

                {/* Confidence disclaimer — medium/low only. Design-system
                    compliant: cream card, amber accent, no emoji, no alarm
                    colors. Friend voice in the body copy. */}
                {result.confidence && result.confidence !== "high" && (
                  <div style={{
                    background:"var(--cream-light)",
                    border:"1px solid var(--rule)",
                    borderRadius:"var(--tile-shape-2)",
                    padding:"14px 16px",
                    marginBottom:16,
                  }}>
                    <div style={{
                      fontFamily:"'DM Sans', system-ui, sans-serif",
                      fontSize:10, letterSpacing:"0.22em",
                      color:"var(--amber)",
                      textTransform:"uppercase", fontWeight:500,
                      marginBottom:8, display:"flex", alignItems:"center", gap:10,
                    }}>
                      <span style={{display:"inline-block", width:22, height:1, background:"var(--amber)", opacity:0.7}}/>
                      {result.confidence==="medium" ? "Partial data" : "Guessing from the name"}
                    </div>
                    <div style={{
                      fontFamily:"'DM Sans', system-ui, sans-serif",
                      fontSize:13, color:"var(--ink-soft)", lineHeight:1.55,
                    }}>
                      {result.confidence_reason || (result.confidence==="medium"
                        ? "I have some of the ingredient list but not all. Score is my best read."
                        : "The full ingredient list isn't public. This score is my best guess from the product type — scan the barcode or label for a verified score.")}
                    </div>
                  </div>
                )}

                {/* ── SURFACE 1 — simple result view ──
                    The dense sections (full ingredient list, INGREDIENT SOURCE,
                    BREAKING IT DOWN, WORTH KNOWING) moved to the detail overlay.
                    Surface 1 shows the short WHY, primary actions, and a link
                    that opens the full breakdown. */}

                {/* THE WHY — short, friend voice (uses summary_short; falls back to summary for pre-split cached scans) */}
                {(result.summary_short || result.summary) && (
                  <div style={{padding:"4px 0 4px", textAlign:"left"}}>
                    <div style={{
                      fontFamily:"'DM Sans', system-ui, sans-serif",
                      fontSize:10, letterSpacing:"0.22em",
                      color:"var(--moss)",
                      textTransform:"uppercase", fontWeight:500,
                      marginBottom:12, display:"flex", alignItems:"center", gap:10,
                    }}>
                      <span style={{display:"inline-block", width:22, height:1, background:"var(--moss)", opacity:0.7}}/>
                      The why
                    </div>
                    <div style={{
                      fontFamily:"'Lora', Georgia, serif",
                      fontSize:17, lineHeight:1.5,
                      color:"var(--ink)",
                      fontWeight:400, letterSpacing:"-0.005em",
                    }}>
                      {String(result.summary_short || result.summary).split(/\n\n+/).map((para, i) => (
                        <p key={i} style={{margin:"0 0 12px"}}>{para}</p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Primary action row — moss primary "Show me cleaner" + outlined secondary.
                    "Show me cleaner" only renders when alternatives exist. */}
                {(() => {
                  const hasAlts = (result.alternatives?.length > 0) || (result.ai_alternatives?.length > 0);
                  return (
                    <div style={{display:"flex", gap:10, marginTop:18, flexWrap:"wrap"}}>
                      {hasAlts && (
                        <button
                          onClick={()=>setShowAlts(true)}
                          style={{
                            flex:"1.35 1 160px",
                            padding:"15px 18px",
                            background:"var(--moss)", color:"var(--ivory)",
                            border:"none",
                            borderRadius:"22px 18px 24px 20px / 20px 24px 18px 22px",
                            cursor:"pointer",
                            fontFamily:"'DM Sans', system-ui, sans-serif",
                            fontWeight:500, fontSize:14, letterSpacing:"0.005em",
                          }}>
                          Show me cleaner
                        </button>
                      )}
                      <button
                        onClick={()=>{
                          // "Shelf anyway" — add to history (becomes shelf) and head home
                          const alreadyInRoutine = history.some(h => h.product_name === result.product_name);
                          if (!alreadyInRoutine) {
                            const entry = {...result, scannedAt: new Date().toISOString()};
                            const next = [entry, ...history.filter(h => h.product_name !== result.product_name)].slice(0, 200);
                            setHistory(next);
                            try { localStorage.setItem("ps_history", JSON.stringify(next)); } catch {}
                          }
                          reset();
                        }}
                        style={{
                          flex: hasAlts ? "1 1 140px" : "1 1 100%",
                          padding:"15px 18px",
                          background: hasAlts ? "transparent" : "var(--moss)",
                          color: hasAlts ? "var(--ink)" : "var(--ivory)",
                          border: hasAlts ? "1px solid var(--rule-strong)" : "none",
                          borderRadius:"22px 18px 24px 20px / 20px 24px 18px 22px",
                          cursor:"pointer",
                          fontFamily:"'DM Sans', system-ui, sans-serif",
                          fontWeight:500, fontSize:14, letterSpacing:"0.005em",
                        }}>
                        Shelf anyway
                      </button>
                    </div>
                  );
                })()}

                {/* Tell me more — opens the detail overlay */}
                <div style={{marginTop:18, textAlign:"center"}}>
                  <button onClick={()=>setShowDetail(true)} style={{
                    background:"none", border:"none", padding:"4px 0", cursor:"pointer",
                    fontFamily:"'Lora', Georgia, serif",
                    fontSize:15, color:"var(--moss)", fontWeight:400,
                    borderBottom:"1px dotted var(--moss)",
                    letterSpacing:"-0.005em",
                  }}>
                    → See the full breakdown
                  </button>
                </div>

              </div>

              {/* ACCOUNT / EMAIL CAPTURE — after 1st scan */}
              {result && !user && !emailDismissed && (
                <div style={{background:"#f0fdf4", borderRadius:16, padding:"20px 24px", border:`1.5px solid ${"#bbf7d0"}`}}>
                  <button onClick={()=>{setEmailDismissed(true); try{localStorage.setItem("ps_email_captured","1")}catch{}}}
                    style={{float:"right", background:"none", border:"none", color:muted, cursor:"pointer", fontSize:18, lineHeight:1, padding:0}}>×</button>
                  <div style={{fontSize:14, fontWeight:700, color:"#16a34a", marginBottom:4}}>Get your results by email</div>
                  <div style={{fontSize:13, color:muted, lineHeight:1.5, marginBottom:14}}>
                    We will send you a weekly roundup of products to avoid, plus tips on safer swaps. No spam, unsubscribe any time.
                  </div>
                  <div style={{display:"flex", gap:8, marginBottom:8}}>
                    <input
                      type="email"
                      placeholder="your@email.com"
                      value={captureEmail}
                      onChange={e=>setCaptureEmail(e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&submitCaptureEmail()}
                      style={{flex:1, padding:"10px 14px", borderRadius:8, border:`1px solid ${"#d1fae5"}`, background:"#fff", color:text, fontSize:14}}
                    />
                    <button onClick={submitCaptureEmail} disabled={captureSubmitting}
                      style={{padding:"10px 18px", borderRadius:8, background:"#052e16", color:"#4ade80", border:"none", fontWeight:700, fontSize:13, cursor:"pointer", opacity:captureSubmitting?0.7:1}}>
                      {captureSubmitting ? "..." : "Subscribe"}
                    </button>
                  </div>
                  {captureMsg && <div style={{fontSize:12, color:"#16a34a", fontWeight:600}}>{captureMsg}</div>}
                  <div style={{display:"flex", gap:8, marginTop:10}}>
                    <button onClick={()=>setShowAuth(true)}
                      style={{fontSize:12, color:"#16a34a", background:"none", border:"none", cursor:"pointer", fontWeight:600, padding:0}}>
                      Or create a free account →
                    </button>
                  </div>
                </div>
              )}

              {/* Signed in — sync confirmation */}
              {user && history.length > 0 && (
                <div style={{background:"#f0fdf4", borderRadius:12, padding:"12px 16px", border:`1px solid ${"#bbf7d0"}`, display:"flex", alignItems:"center", gap:10}}>
                  <IcoVerified size={16}/>
                  <span style={{fontSize:13, color:"#16a34a", fontWeight:600}}>Scans synced to your account</span>
                </div>
              )}

            </div>
            );})()}

            {/* RIGHT — desktop alternatives sticky panel — only show if score > 3 */}
            {!isMobile && ((childMode && result.child_score) ? result.child_score : (result.overall_score || result.score)) > 3 && (
              <div id="desktop-alternatives" style={{position:"sticky", top:20, display:"flex", flexDirection:"column", gap:16}}>
                <div style={{background:"var(--cream-light)", borderRadius:"var(--card-shape-1)", border:"1px solid var(--rule)", overflow:"hidden"}}>
                  <div style={{background:"var(--moss-soft)", padding:"20px 24px", borderBottom:"1px solid var(--rule)"}}>
                    <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:6}}>
                      <span style={{display:"inline-block", width:22, height:1, background:"var(--moss)", opacity:0.7}}/>
                      <span style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:10, fontWeight:500, color:"var(--moss)", textTransform:"uppercase", letterSpacing:"0.22em"}}>Safer alternatives</span>
                    </div>
                    <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:22, fontWeight:400, color:"var(--ink)", letterSpacing:"-0.005em", lineHeight:1.25}}>
                      {(result.alternatives?.length||0) + (result.ai_alternatives?.length||0) > 0
                        ? `${(result.alternatives?.length||0) + (result.ai_alternatives?.length||0)} better option${((result.alternatives?.length||0) + (result.ai_alternatives?.length||0)) !== 1 ? "s" : ""} found`
                        : "Exploring alternatives"}
                    </div>
                    {/* Source toggle */}
                    <div style={{display:"inline-flex", gap:4, marginTop:12, flexWrap:"wrap", padding:4, background:"var(--cream-light)", border:"1px solid var(--rule)", borderRadius:"var(--cta-shape)"}}>
                      {[["amazon","Amazon"],["brand","Brand site"],["bigbox","Target"]].map(([src,label]) => (
                        <button key={src} onClick={()=>setAltSource(src)} style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:11, fontWeight:500, padding:"5px 12px", borderRadius:"var(--cta-shape)", border:"none", cursor:"pointer", background: altSource===src ? "var(--moss)" : "transparent", color: altSource===src ? "var(--ivory)" : "var(--ink-soft)", transition:"all 0.15s"}}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{padding:"16px", display:"flex", flexDirection:"column", gap:10, maxHeight:600, overflowY:"auto"}}>
                    {(filterAltsBySource(result.alternatives, altSource) || []).map((alt, i) => {
                      const shopUrl = altSource === "brand" ? getBrandUrl(alt.brand, alt.name)
                        : altSource === "bigbox" ? BIGBOX_URLS.target(alt.name)
                        : alt.affiliateUrl;
                      return (
                      <div key={i} style={{background:"var(--cream)", borderRadius:"var(--card-shape-2)", padding:"14px 16px", border:"1px solid var(--rule)"}}>
                        <div style={{display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8, marginBottom:6}}>
                          <div style={{fontSize:14, fontWeight:700, color:text, lineHeight:1.3}}>{alt.name}</div>
                          <div style={{flexShrink:0}}><ScoreBadge score={alt.score} size="xs" showLabel /></div>
                        </div>
                        {alt.material && <div style={{fontSize:12, color:muted, marginBottom:6, lineHeight:1.4}}>{alt.material}</div>}
                        {alt.price && <div style={{fontSize:11, color:"var(--moss)", fontWeight:500, marginBottom:8}}>{alt.price}</div>}
                        {shopUrl && (
                          <a href={shopUrl} target="_blank" rel="noopener noreferrer"
                            onClick={()=>track("Affiliate Click", {product:alt.name, placement:"desktop_panel", source:altSource, category:result.category})}
                            style={{display:"inline-block", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:12, fontWeight:500, color:"var(--ivory)", background:"var(--moss)", padding:"6px 14px", borderRadius:"var(--cta-shape)", textDecoration:"none"}}>
                            {altSource === "brand" ? "Brand site →" : altSource === "bigbox" ? "Target →" : "Amazon →"}
                          </a>
                        )}
                      </div>
                      );
                    })}
                    {(filterAltsBySource(result.ai_alternatives, altSource) || []).filter(a => a.estimated_score && a.estimated_score < (result.overall_score||result.score)).map((alt, i) => {
                      const shopUrl = altSource === "brand" ? getBrandUrl(alt.name, alt.name)
                        : altSource === "bigbox" ? BIGBOX_URLS.target(alt.name)
                        : `https://www.amazon.com/s?k=${encodeURIComponent(alt.name)}&tag=partiqule-20`;
                      return (
                      <div key={`ai-${i}`} style={{background:"#f8fafb", borderRadius:12, padding:"14px 16px", border:`1px solid ${"#e8f5e9"}`}}>
                        <div style={{display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8, marginBottom:6}}>
                          <div style={{fontSize:14, fontWeight:700, color:text, lineHeight:1.3}}>{alt.name}</div>
                          <div style={{flexShrink:0}}><ScoreBadge score={alt.estimated_score} size="xs" showLabel /></div>
                        </div>
                        {alt.reason && <div style={{fontSize:12, color:muted, lineHeight:1.4, marginBottom:6}}>{alt.reason}</div>}
                        <a href={shopUrl} target="_blank" rel="noopener noreferrer"
                          onClick={()=>track("Affiliate Click", {product:alt.name, placement:"desktop_panel_ai", source:altSource, category:result.category})}
                          style={{display:"inline-block", fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:12, fontWeight:500, color:"var(--ivory)", background:"var(--moss)", padding:"6px 14px", borderRadius:"var(--cta-shape)", textDecoration:"none"}}>
                          {altSource === "brand" ? "Brand site →" : altSource === "bigbox" ? "Target →" : "Amazon →"}
                        </a>
                      </div>
                      );
                    })}
                    {(!filterAltsBySource(result.alternatives, altSource)?.length && !filterAltsBySource(result.ai_alternatives, altSource)?.filter(a=>a.estimated_score < (result.overall_score||result.score)).length) && (() => {
                      const score = result.overall_score || result.score;
                      // Score-aware empty-state copy — don't say "scores well" on a 6+.
                      const headline = altSource === "brand" ? "No direct brand alternatives"
                        : altSource === "bigbox" ? "No big-box alternatives"
                        : score <= 3 ? "No swap needed"
                        : score <= 5 ? "Nothing cleaner landed"
                        : "No specific alternatives found";
                      const body = altSource === "brand" ? "Try Amazon for more options →"
                        : altSource === "bigbox" ? "Try Amazon or brand sites instead →"
                        : score <= 3 ? "This one scores well — no swap to suggest."
                        : score <= 5 ? "I didn't find a cleaner option that matches this use case."
                        : "I couldn't pull specific alternatives for this one. Scan a related product to compare.";
                      return (
                        <div style={{textAlign:"center", padding:"32px 16px", color:muted}}>
                          <div style={{fontSize:13, fontWeight:600, marginBottom:4}}>{headline}</div>
                          <div style={{fontSize:12}}>{body}</div>
                        </div>
                      );
                    })()}
                    {/* Compare & Share — desktop panel */}
                    {(() => {
                      const allAlts = [...(result.alternatives || []), ...(result.ai_alternatives || [])];
                      const scored = allAlts.filter(a => (a.score ?? a.estimated_score) != null);
                      if (!scored.length) return null;
                      const best = scored.reduce((a, b) => ((a.score ?? a.estimated_score) <= (b.score ?? b.estimated_score) ? a : b));
                      const bestScore = best.score ?? best.estimated_score;
                      const productScore = result.overall_score || result.score;
                      if ((productScore - bestScore) < 2) return null;
                      return (
                        <button onClick={() => setCompareAlt(best)} style={{
                          width:"100%", padding:"12px", borderRadius:"var(--cta-shape)",
                          background:"none", border:"1px solid var(--moss)",
                          fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:500, fontSize:13,
                          color:"var(--moss)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                          marginTop:4,
                        }}>
                          <IconShare size={14} color="var(--moss)"/> Compare & Share
                        </button>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* ── DETAIL VIEW (Surface 2 — full breakdown overlay) ─────────
            Slides up over the simple result (Surface 1). Contains THE WHY long
            (summary_long with fallback to summary), BREAKING IT DOWN rows from
            result.dimensions, the full ingredient list with source credibility,
            WORTH KNOWING editorial flags, and the same primary actions as Surface 1.
            Pre-split cached scans (no summary_long) fall back to summary and show
            a "Rescan for the full briefing" hint. */}
        {showDetail && result && (() => {
          const detailShelfCount = (history || []).length;
          const detailScore = pregnancyMode && result.pregnancy_score ? result.pregnancy_score : (childMode && result.child_score) ? result.child_score : (result.overall_score || result.score);
          const detailScoreColor = detailScore == null ? "var(--ink-soft)" : detailScore <= 3 ? "var(--score-green)" : detailScore <= 5 ? "var(--score-amber)" : "var(--score-red)";
          const detailScoreSoft  = detailScore == null ? "rgba(107,114,128,0.10)" : detailScore <= 3 ? "var(--score-green-soft)" : detailScore <= 5 ? "var(--score-amber-soft)" : "var(--score-red-soft)";
          const fullName = result.product_name || "";
          const { brand, body: productBodyRaw } = extractBrand(fullName, result.brand);
          const productBody = productBodyRaw || fullName;
          const displayName = productBody.length > 60 ? productBody.slice(0, 57) + "…" : productBody;
          const cat = result.category || "";
          const compositionLine = (() => {
            if (cat === "clothing" && result.composition) return String(result.composition).toUpperCase().replace(/\s*[,·]\s*/g, " · ");
            if (Array.isArray(result.ingredient_list) && result.ingredient_list.length > 0) {
              return result.ingredient_list.slice(0, 3).map(x => String(x).trim().toUpperCase()).join(" · ");
            }
            return null;
          })();
          const longCopy = result.summary_long || result.summary_short || result.summary || "";
          // The rescan banner is meant to flag scans that genuinely predate
          // the detailed summary structure — short, stub-y reasons. But
          // every calibration entry sets a substantial `summary` field
          // without a separate `summary_long`, so the previous check
          // (`!!result.summary_long`) fired the rescan banner on every
          // calibration scan. Treat any summary >= 80 chars as detailed
          // enough to suppress the banner.
          const hasLong = !!(result.summary_long || (longCopy && longCopy.length >= 80));
          return (
            <div style={{
              position:"fixed", inset:0, zIndex:9991,
              background:"var(--cream)", overflowY:"auto",
              fontFamily:"'DM Sans', system-ui, sans-serif",
              animation:"detailSlideUp 0.35s cubic-bezier(0.2,0,0,1) forwards",
            }}>
              <style>{`@keyframes detailSlideUp { from{opacity:0; transform:translateY(24px)} to{opacity:1; transform:translateY(0)} }`}</style>

              {/* Top bar — back arrow + shelf badge */}
              <div style={{
                display:"flex", alignItems:"center", justifyContent:"space-between",
                padding: `${(SAFE_TOP || 0) + 18}px 24px 12px`,
                borderBottom:"1px solid var(--rule)",
                background:"var(--cream)",
                position:"sticky", top:0, zIndex:10,
              }}>
                <button onClick={()=>setShowDetail(false)} style={{
                  display:"flex", alignItems:"center", gap:8,
                  background:"transparent", border:"none", cursor:"pointer", padding:0,
                  fontFamily:"'DM Sans', system-ui, sans-serif",
                  fontSize:10.5, letterSpacing:"0.22em",
                  color:"var(--ink-soft)", textTransform:"uppercase", fontWeight:500,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                  Back
                </button>
                <div style={{
                  fontFamily:"'DM Sans', system-ui, sans-serif",
                  fontSize:11, color:"var(--ink-soft)", fontWeight:500,
                }}>
                  Shelf <strong style={{color:"var(--moss)", fontWeight:500, marginLeft:4}}>{detailShelfCount}</strong>
                </div>
              </div>

              <div style={{maxWidth:640, margin:"0 auto", padding:"22px 24px 80px"}}>
                {/* Stamp */}
                <div style={{
                  display:"flex", alignItems:"center", gap:10, flexWrap:"wrap",
                  fontFamily:"'DM Sans', system-ui, sans-serif",
                  fontSize:10, letterSpacing:"0.22em",
                  color:"var(--ink-faint)", textTransform:"uppercase", fontWeight:500,
                  marginBottom:14,
                }}>
                  <span style={{display:"inline-block", width:22, height:1, background:"var(--moss)", opacity:0.6}}/>
                  <span>Logged · just now</span>
                  {result.confidence && <span style={{color: result.confidence==="high" ? "var(--moss)" : result.confidence==="medium" ? "var(--ink-soft)" : "var(--amber)"}}>· {result.confidence} confidence</span>}
                </div>

                {/* Brand / name / composition */}
                {brand && (
                  <div style={{
                    fontFamily:"'DM Sans', system-ui, sans-serif",
                    fontSize:11, letterSpacing:"0.22em",
                    color:"var(--ink)", textTransform:"uppercase", fontWeight:500,
                    marginBottom:4,
                  }}>{brand.toUpperCase()}</div>
                )}
                <h2 style={{
                  fontFamily:"'Lora', Georgia, serif",
                  fontSize: isMobile ? 30 : 36,
                  fontWeight:400, color:"var(--ink)",
                  margin:"0 0 12px",
                  letterSpacing:"-0.015em", lineHeight:1.04,
                }}>{displayName}</h2>
                {compositionLine && (
                  <div style={{
                    fontFamily:"'DM Sans', system-ui, sans-serif",
                    fontSize:10.5, letterSpacing:"0.14em",
                    color:"var(--ink-soft)", textTransform:"uppercase",
                    paddingBottom:14,
                    borderBottom:"1px solid var(--rule)",
                    marginBottom:18,
                  }}>{compositionLine}</div>
                )}

                {/* Verdict — smaller score ring + headline */}
                <div style={{display:"flex", alignItems:"center", gap:18, marginBottom:22}}>
                  <div style={{
                    width:64, height:64, flexShrink:0,
                    borderRadius:"49% 51% 50% 50% / 52% 48% 52% 48%",
                    background: detailScoreSoft,
                    border: `2px solid ${detailScoreColor}`,
                    display:"flex", alignItems:"center", justifyContent:"center",
                  }}>
                    <span style={{
                      fontFamily:"'Lora', Georgia, serif",
                      fontSize:34, color: detailScoreColor, lineHeight:1,
                      fontWeight:400, letterSpacing:"-0.02em",
                    }}>{typeof detailScore === "number" ? Math.round(detailScore * 10) / 10 : "?"}</span>
                  </div>
                  <div style={{flex:1, minWidth:0}}>
                    {(result.summary_short || result.summary) && (
                      <div style={{
                        fontFamily:"'Lora', Georgia, serif",
                        fontSize:18, lineHeight:1.25, color:"var(--ink)",
                        fontWeight:400, letterSpacing:"-0.005em",
                      }}>
                        {String(result.summary_short || result.summary).split(/\n\n+/)[0]}
                      </div>
                    )}
                  </div>
                </div>

                {/* THE WHY — long version */}
                {longCopy && (
                  <div style={{padding:"4px 0 4px", textAlign:"left", marginBottom:12}}>
                    <div style={{
                      fontFamily:"'DM Sans', system-ui, sans-serif",
                      fontSize:10, letterSpacing:"0.22em",
                      color:"var(--moss)", textTransform:"uppercase",
                      fontWeight:500, marginBottom:12, display:"flex", alignItems:"center", gap:10,
                    }}>
                      <span style={{display:"inline-block", width:22, height:1, background:"var(--moss)", opacity:0.7}}/>
                      The why
                      {explanationEnriching && (
                        <span
                          aria-label="enriching explanation"
                          style={{
                            display:"inline-block",
                            width:6, height:6,
                            borderRadius:"50%",
                            background:"var(--moss)",
                            opacity:0.6,
                            animation:"partiqulePulse 1.4s ease-in-out infinite",
                          }}
                        />
                      )}
                    </div>
                    <div
                      key={`why-${result.summary_long && result.summary_long.length > 600 ? "enriched" : "deterministic"}`}
                      style={{
                        fontFamily:"'Lora', Georgia, serif",
                        fontSize:16, lineHeight:1.55, color:"var(--ink)",
                        fontWeight:400, letterSpacing:"-0.005em",
                        animation:"whyFadeIn 0.4s ease-in-out forwards",
                      }}
                    >
                      {String(longCopy).split(/\n\n+/).map((para, i) => (
                        <p key={i} style={{margin:"0 0 12px"}}>{para}</p>
                      ))}
                    </div>
                    {!hasLong && (
                      <div style={{
                        marginTop:6, padding:"10px 14px",
                        background:"var(--cream-light)",
                        border:"1px dashed var(--rule)",
                        borderRadius:"14px 10px 15px 12px / 10px 15px 12px 14px",
                        fontFamily:"'DM Sans', system-ui, sans-serif",
                        fontSize:12, color:"var(--ink-soft)", lineHeight:1.55,
                      }}>
                        Rescan to see the full briefing — this result predates the detailed write-up.
                      </div>
                    )}
                  </div>
                )}

                {/* BREAKING IT DOWN */}
                {result.dimensions ? (() => {
                  const d = result.dimensions;
                  const childDimBump = pregnancyMode && result.pregnancy_score && result.overall_score
                    ? Math.max(0, result.pregnancy_score - (result.overall_score || result.score))
                    : (childMode && result.child_score && result.overall_score)
                    ? Math.max(0, result.child_score - (result.overall_score || result.score))
                    : 0;
                  const sc = (s) => s == null ? "var(--ink-soft)" : s <= 3 ? "var(--score-green)" : s <= 5 ? "var(--score-amber)" : "var(--score-red)";
                  // Layout-driven rendering: textile scans ship a dimension_layout
                  // describing their three vectors (skin/shed/mfg). Other categories
                  // fall back to the legacy four-dimension layout (materials,
                  // usage_exposure, packaging, sustainability). The childDimBump
                  // boosts the legacy materials + usage_exposure rows only;
                  // textile per-vector scores already account for kid mode.
                  const fallbackLayout = [
                    { key:"materials",      label:"Materials" },
                    { key:"usage_exposure", label:"Usage & exposure" },
                    { key:"packaging",      label:"Packaging" },
                    { key:"sustainability", label:"Sustainability" },
                  ];
                  const dimensionLayout = result.dimension_layout || fallbackLayout;
                  const weightLine = result.dimension_layout
                    ? result.dimension_layout.map(l => `${l.label} ${l.weight}%`).join(" · ")
                    : result.category === "food" || result.category === "food_beverage" ? "Ingredients 90% · Packaging 10%"
                    : result.category === "beverage"      ? "Ingredient safety · Nutrition impact"
                    : result.category === "restaurant"    ? "Ingredients 85% · Packaging 10% · Sustainability 5%"
                    : result.category === "supplement"    ? "Ingredients 65% · Exposure 25% · Packaging 10%"
                    : result.category === "personal_care" ? "Materials 45% · Exposure 45% · Packaging 5% · Sustainability 5%"
                    : result.category === "toy"           ? "Materials 50% · Exposure 40% · Packaging 5% · Sustainability 5%"
                    : result.category === "clothing"      ? "Materials 35% · Exposure 30% · Sustainability 35%"
                    : result.category === "accessory"     ? "Materials 40% · Exposure 25% · Sustainability 35%"
                    : result.category === "home"          ? "Materials 30% · Exposure 45% · Packaging 10% · Sustainability 15%"
                    : result.category === "baby"          ? "Materials 55% · Exposure 40% · Packaging 5%"
                    : "Materials 45% · Exposure 30% · Packaging 10% · Sustainability 15%";
                  const rows = dimensionLayout.map(layout => {
                    const dim = d[layout.key];
                    if (!dim) return null;
                    const bumpEligible = !result.dimension_layout && (layout.key === "materials" || layout.key === "usage_exposure");
                    const baseScore = dim.score != null ? dim.score : (layout.key === "materials" ? result.score : 5);
                    const adjusted = bumpEligible ? Math.min(10, baseScore + childDimBump) : baseScore;
                    return { key: layout.key, label: layout.label, score: adjusted, note: dim.label };
                  }).filter(Boolean);
                  return (
                    <div style={{padding:"18px 0 4px", textAlign:"left"}}>
                      <div style={{
                        fontFamily:"'DM Sans', system-ui, sans-serif",
                        fontSize:10, letterSpacing:"0.22em",
                        color:"var(--moss)", textTransform:"uppercase",
                        fontWeight:500, marginBottom:6, display:"flex", alignItems:"center", gap:10,
                      }}>
                        <span style={{display:"inline-block", width:22, height:1, background:"var(--moss)", opacity:0.7}}/>
                        Breaking it down
                      </div>
                      <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:11, color:"var(--ink-faint)", marginBottom:14, letterSpacing:"0.02em"}}>
                        {weightLine}
                      </div>
                      {rows.map((row, i) => (
                        <div key={row.key} style={{
                          padding:"18px 0",
                          borderBottom: i < rows.length - 1 ? "1px solid var(--rule-soft)" : "none",
                          display:"grid", gridTemplateColumns:"1fr auto",
                          gap:"6px 20px", alignItems:"baseline",
                        }}>
                          <div style={{
                            fontFamily:"'DM Sans', system-ui, sans-serif",
                            fontSize:10.5, letterSpacing:"0.22em",
                            color:"var(--ink)", textTransform:"uppercase", fontWeight:500,
                          }}>{row.label}</div>
                          <div style={{
                            fontFamily:"'Lora', Georgia, serif",
                            fontSize:30, lineHeight:1, letterSpacing:"-0.02em",
                            gridRow:"span 2", alignSelf:"center", textAlign:"right",
                            color: sc(row.score), fontWeight:400,
                          }}>
                            {Math.round(row.score)}
                            <span style={{
                              fontFamily:"'DM Sans', system-ui, sans-serif",
                              fontSize:10, letterSpacing:"0.14em",
                              textTransform:"uppercase",
                              color:"var(--ink-faint)",
                              marginLeft:4, verticalAlign:"middle", fontWeight:500,
                            }}>/ 10</span>
                          </div>
                          {row.note && (
                            <div style={{
                              gridColumn:1,
                              fontFamily:"'DM Sans', system-ui, sans-serif",
                              fontSize:13, color:"var(--ink-soft)",
                              lineHeight:1.45,
                            }}>{row.note}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })() : (
                  <div style={{padding:"12px 16px", background:"var(--cream-light)", borderRadius:"14px 10px 15px 12px / 10px 15px 12px 14px", border:"1px dashed var(--rule)", margin:"16px 0", textAlign:"left"}}>
                    <div style={{fontSize:12, color:"var(--ink-soft)", lineHeight:1.6, fontFamily:"'DM Sans', system-ui, sans-serif"}}><strong style={{fontFamily:"'Lora', Georgia, serif", fontSize:14, fontWeight:400}}>Rescan for full breakdown</strong> — this result predates our 5-dimension analysis.</div>
                  </div>
                )}

                {/* ROOM TAG — surfaced on Surface 2 (moved from Surface 1 on 2026-04-20).
                    Persists onto the history row's `room` field so the by-room grouping
                    in HistoryPage works. When already tagged, shows "Tagged: <Room>"
                    with an Edit button that flips back to the selector. */}
                {(() => {
                  const ROOM_OPTIONS = {
                    food:["Pantry","Kitchen"], food_beverage:["Pantry","Kitchen"], beverage:["Pantry","Kitchen"], snack:["Pantry","Kitchen"],
                    personal_care:["Bathroom","Bedroom"], skincare:["Bathroom","Bedroom"],
                    cleaning:["Kitchen","Bathroom","Laundry","Living Room"], home:["Kitchen","Living Room","Bedroom","Laundry"],
                    clothing:["Closet","Kids Room"], baby:["Nursery","Kids Room","Bathroom"], toy:["Kids Room","Nursery"],
                  };
                  const options = ROOM_OPTIONS[result.category] || [];
                  if (!options.length) return null;
                  const existingRoom = (history.find(h => h.product_name === result.product_name) || {}).room || null;
                  const showSelector = !existingRoom || pendingRoomTag === result.product_name;

                  const tagRoom = (room) => {
                    const updated = history.map((h, i) => i === 0 && h.product_name === result.product_name ? {...h, room} : h);
                    setHistory(updated);
                    try { localStorage.setItem("ps_history", JSON.stringify(updated)); } catch {}
                    setPendingRoomTag(null);
                  };

                  const SectionLabel = ({text}) => (
                    <div style={{
                      fontFamily:"'DM Sans', system-ui, sans-serif",
                      fontSize:10, letterSpacing:"0.22em",
                      color:"var(--moss)", textTransform:"uppercase",
                      fontWeight:500, marginBottom:12, display:"flex", alignItems:"center", gap:10,
                    }}>
                      <span style={{display:"inline-block", width:22, height:1, background:"var(--moss)", opacity:0.7}}/>
                      {text}
                    </div>
                  );

                  if (!showSelector) {
                    return (
                      <div style={{padding:"22px 0 4px", textAlign:"left"}}>
                        <SectionLabel text="Tagged"/>
                        <div style={{display:"flex", alignItems:"center", gap:12}}>
                          <span style={{
                            fontFamily:"'Lora', Georgia, serif",
                            fontSize:18, fontWeight:400, color:"var(--ink)",
                            letterSpacing:"-0.005em",
                          }}>{existingRoom}</span>
                          <button onClick={() => setPendingRoomTag(result.product_name)} style={{
                            background:"transparent", border:"none", cursor:"pointer", padding:"2px 0",
                            fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:12,
                            color:"var(--ink-soft)", letterSpacing:"0.02em",
                            textDecoration:"underline", textUnderlineOffset:3,
                          }}>Edit</button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div style={{padding:"22px 0 4px", textAlign:"left"}}>
                      <SectionLabel text="Which room?"/>
                      <div style={{display:"flex", flexWrap:"wrap", gap:8, alignItems:"center"}}>
                        {options.map(room => {
                          const selected = room === existingRoom;
                          return (
                            <button key={room} onClick={() => tagRoom(room)} style={{
                              padding:"7px 14px", borderRadius:9999,
                              background: selected ? "var(--moss)" : "var(--cream-light)",
                              border: selected ? "none" : "1px solid var(--rule)",
                              color: selected ? "var(--ivory)" : "var(--ink)",
                              fontFamily:"'DM Sans', system-ui, sans-serif",
                              fontSize:12, fontWeight:500, cursor:"pointer",
                              letterSpacing:"0.02em", transition:"all 0.2s",
                            }}>{room}</button>
                          );
                        })}
                        <button onClick={() => setPendingRoomTag(null)} style={{
                          marginLeft:"auto", padding:"7px 10px",
                          background:"transparent", border:"none", cursor:"pointer",
                          fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:12,
                          color:"var(--ink-soft)", letterSpacing:"0.02em",
                        }}>Skip</button>
                      </div>
                    </div>
                  );
                })()}

                {/* WHAT'S IN IT — full ingredient list + source credibility */}
                {result.ingredient_list && result.ingredient_list.length > 0 && (() => {
                  const labelMap = {
                    food:          "What's inside",
                    food_beverage: "What's inside",
                    beverage:      "What's inside",
                    restaurant:    "What's inside",
                    supplement:    "What's inside",
                    personal_care: "Ingredients",
                    baby:          "Ingredients",
                    home:          "What's in it",
                    clothing:      "The fabric",
                  };
                  const label = labelMap[cat] || "Composition";
                  const flowingCats = ["food","food_beverage","beverage","restaurant","supplement","personal_care","baby","home"];
                  const flowing = flowingCats.includes(cat);
                  return (
                    <div style={{padding:"22px 0 4px", textAlign:"left"}}>
                      <div style={{
                        fontFamily:"'DM Sans', system-ui, sans-serif",
                        fontSize:10, letterSpacing:"0.22em",
                        color:"var(--moss)", textTransform:"uppercase",
                        fontWeight:500, marginBottom:12, display:"flex", alignItems:"center", gap:10,
                      }}>
                        <span style={{display:"inline-block", width:22, height:1, background:"var(--moss)", opacity:0.7}}/>
                        {label}
                      </div>
                      {flowing ? (
                        <p style={{
                          fontFamily:"'Lora', Georgia, serif",
                          fontSize:15, lineHeight:1.55,
                          color:"var(--ink)", margin:"0 0 6px", fontWeight:400,
                        }}>{result.ingredient_list.join(", ")}</p>
                      ) : (
                        <div style={{background:"var(--cream-light)", borderRadius:"14px 18px 12px 16px / 16px 12px 18px 14px", padding:"12px 14px", border:"1px solid var(--rule-soft)"}}>
                          <p style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:12, color:"var(--ink-soft)", lineHeight:1.7, margin:0}}>
                            {result.ingredient_list.join(", ")}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* INGREDIENT SOURCE credibility line */}
                {(() => {
                  if (!result.ingredient_source) return null;
                  const SOURCE_LABELS = {
                    open_food_facts:     "Verified via Open Food Facts",
                    open_beauty_facts:   "Verified via Open Beauty Facts",
                    open_products_facts: "Verified via Open Products Facts",
                    supabase_scans:      "From a previous Partiqule scan",
                    previous_scan:       "From a previous Partiqule scan",
                    calibration:         "Verified formula",
                    vision_ocr:          "Read from your photo",
                    none:                "Ingredients unverified",
                  };
                  const srcLabel = SOURCE_LABELS[result.ingredient_source];
                  if (!srcLabel) return null;
                  const conf = result.ingredient_confidence;
                  const color = conf === "high" ? "var(--moss)" : conf === "medium" ? "var(--ink-soft)" : "var(--amber)";
                  let timeAgo = "";
                  if (result.ingredient_verified_at) {
                    const t = new Date(result.ingredient_verified_at).getTime();
                    if (!isNaN(t)) {
                      const diff = Date.now() - t;
                      const day = 24 * 60 * 60 * 1000;
                      if (diff < day) timeAgo = "just now";
                      else if (diff < 7 * day) { const days = Math.floor(diff / day); timeAgo = days === 1 ? "1 day ago" : `${days} days ago`; }
                      else timeAgo = new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                    }
                  }
                  const url = result.ingredient_source_url;
                  return (
                    <div style={{
                      fontFamily:"'Lora', Georgia, serif",
                      fontSize:13, fontWeight:400, color,
                      marginTop:-2, marginBottom:12, lineHeight:1.5, textAlign:"left",
                    }}>
                      {url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer" style={{color, textDecoration:"underline", textUnderlineOffset:2, cursor:"pointer"}}>{srcLabel}</a>
                      ) : srcLabel}
                      {timeAgo ? ` · ${timeAgo}` : ""}
                    </div>
                  );
                })()}

                {/* NUTRITION — food/beverage categories only. DV switches with childMode. */}
                {(() => {
                  const n = result.nutrition;
                  const cat = result.category || "";
                  const isFood = ["food","food_beverage","beverage","restaurant","supplement"].includes(cat);
                  if (!n || !isFood) return null;
                  const sugarDV  = childMode ? 25   : 50;
                  const sodiumDV = childMode ? 1500 : 2300;
                  const satFatDV = childMode ? 13   : 20;
                  const sevTokens = (pct) => pct >= 100
                    ? {bg:"var(--score-red-soft)",   border:"1px solid var(--score-red)"}
                    : pct >= 60
                    ? {bg:"var(--score-red-soft)",   border:"1px solid var(--score-red)"}
                    : pct >= 30
                    ? {bg:"var(--score-amber-soft)", border:"1px solid var(--score-amber)"}
                    : {bg:"var(--score-green-soft)", border:"1px solid var(--score-green)"};
                  const items = [];
                  if (n.sugar_g != null) { const pct = Math.round((n.sugar_g / sugarDV) * 100); items.push({k:"sugar", value:`${n.sugar_g}g`, label:"Sugar", pct, ...sevTokens(pct)}); }
                  if (n.sodium_mg != null) { const pct = Math.round((n.sodium_mg / sodiumDV) * 100); items.push({k:"sodium", value:`${n.sodium_mg}mg`, label:"Sodium", pct, ...sevTokens(pct)}); }
                  if (n.sat_fat_g != null) { const pct = Math.round((n.sat_fat_g / satFatDV) * 100); items.push({k:"satfat", value:`${n.sat_fat_g}g`, label:"Sat fat", pct, ...sevTokens(pct)}); }
                  if (!items.length) return null;
                  return (
                    <div style={{padding:"22px 0 4px", textAlign:"left"}}>
                      <div style={{
                        fontFamily:"'DM Sans', system-ui, sans-serif",
                        fontSize:10, letterSpacing:"0.22em", color:"var(--moss)",
                        textTransform:"uppercase", fontWeight:500, marginBottom:6,
                        display:"flex", alignItems:"center", gap:10,
                      }}>
                        <span style={{display:"inline-block", width:22, height:1, background:"var(--moss)", opacity:0.7}}/>
                        Nutrition
                      </div>
                      <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:11, color:"var(--ink-faint)", marginBottom:14, letterSpacing:"0.02em"}}>
                        {childMode ? "Children's Daily Values" : "Daily Values"}
                      </div>
                      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
                        {items.map(it => (
                          <div key={it.k} style={{
                            flex:"1 1 auto", minWidth:92, textAlign:"center",
                            padding:"12px 10px", borderRadius:"var(--tile-shape-1)",
                            background:it.bg, border:it.border,
                          }}>
                            <div style={{fontFamily:"'Lora', Georgia, serif", fontSize:22, fontWeight:400, color:"var(--ink)", lineHeight:1, letterSpacing:"-0.01em"}}>{it.value}</div>
                            <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:10, color:"var(--ink-soft)", margin:"6px 0 3px", letterSpacing:"0.14em", textTransform:"uppercase", fontWeight:500}}>{it.label}</div>
                            <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:12, fontWeight:500, color:"var(--ink)"}}>{it.pct}% DV</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* FLAGGED SUBSTANCES — badge cluster (cream-system tokens, ink text) */}
                {(() => {
                  const GENERIC_TERMS = new Set([
                    "binding agents","emulsifiers","natural flavoring","natural flavors",
                    "natural flavor","artificial flavor","artificial flavoring","flavorings",
                    "processing aids","processing aid","stabilizers","stabilizer",
                    "thickeners","thickener","food additives","additives","preservatives",
                    "colorings","coloring","colors","colour","colouring","antioxidants",
                    "antioxidant","humectants","humectant","fillers","filler","carriers",
                    "carrier","solvents","solvent","natural ingredients","whole ingredients",
                    "organic ingredients","clean ingredients","certified ingredients",
                    "natural coffee","coffee flavor","coffee taste","almond flavor",
                    "menthol concentration","menthol","peppermint oil","wintergreen oil",
                    "polymeric coating","interior coating","tin coating","metal coating",
                    "food grade coating","lacquer","enamel coating",
                  ]);
                  const isGeneric = (name) => {
                    const n = name.toLowerCase().trim();
                    if (GENERIC_TERMS.has(n)) return true;
                    if (n.length > 40) return true;
                    if (/\b(for|with|in|of|from|using|added|used|based|concentration|coating|level)\b/.test(n)) return true;
                    return false;
                  };
                  const cleanName = (name) => name
                    .replace(/\s*\((presumed|potential|possible|suspected|unconfirmed|estimated|likely|may be present|trace)\)/gi, "")
                    .trim();
                  // Extract a substance name from a reason/concern string. Accepts em-dash,
                  // en-dash, colon, plain hyphen-minus (with surrounding whitespace), " is ",
                  // and "(" as separators between the name and its description. Without the
                  // hyphen-minus case, all backend substance-floor reasons (which use plain
                  // ASCII hyphen, e.g. "Red 40 - synthetic petroleum dye") fall through and
                  // the badge cluster ends up empty. Case-insensitive on the leading letter
                  // so substances like "aspartame" pass too.
                  const extractName = (str) => {
                    if (typeof str !== "string") return null;
                    const trimmed = str.trim();
                    if (!trimmed) return null;
                    const sep = trimmed.match(/^(.{1,40}?)\s*(?:[—:–]|\s-\s|\sis\s|\()/i);
                    if (sep && sep[1]) return sep[1].trim();
                    // Short, looks-like-a-name string with no separator → use as-is
                    if (trimmed.length <= 40 && /^[A-Za-z][A-Za-z0-9\s\-\/&,'.]+$/.test(trimmed)) return trimmed;
                    return null;
                  };
                  const flagged = [];
                  const seen = new Set();
                  const add = (name, severity) => {
                    const key = (name||"").toLowerCase().trim();
                    if (!key || key === "unknown" || key.length < 2 || seen.has(key)) return;
                    if (isGeneric(name)) return;
                    seen.add(key);
                    flagged.push({name, severity});
                  };
                  (result.food_analysis?.concerns || []).forEach(c => {
                    if (c?.substance && c.substance !== "Unknown") add(c.substance, c.severity || "medium");
                  });
                  (result.harmful_chemicals || []).forEach(c => add(c, "high"));
                  // result.flagged_substances is populated by the backend cascade with
                  // textFloor reason strings ("Red 40 - synthetic petroleum dye ..."). Run
                  // each through the name extractor — these are HIGH severity since they
                  // come from deterministic substance-floor matches, not AI guesses.
                  (result.flagged_substances || []).forEach(s => {
                    const name = extractName(s);
                    if (name) add(name, "high");
                  });
                  const allConcerns = [
                    ...(result.dimensions?.materials?.concerns || []),
                    ...(result.concerns || []),
                  ];
                  allConcerns.forEach(c => {
                    if (typeof c === "string") {
                      const name = extractName(c);
                      if (name) add(name, "medium");
                    } else if (c?.substance) {
                      add(c.substance, c.severity || "medium");
                    }
                  });
                  if (flagged.length === 0) return null;
                  const sStyle = (sev) => ({
                    high:   {bg:"var(--score-red-soft)",   color:"var(--ink)", border:"1px solid var(--score-red)"},
                    medium: {bg:"var(--score-amber-soft)", color:"var(--ink)", border:"1px solid var(--score-amber)"},
                    low:    {bg:"var(--score-green-soft)", color:"var(--ink)", border:"1px solid var(--score-green)"},
                  })[sev] || {bg:"var(--score-amber-soft)", color:"var(--ink)", border:"1px solid var(--score-amber)"};
                  return (
                    <div style={{padding:"22px 0 4px", textAlign:"left"}}>
                      <div style={{
                        fontFamily:"'DM Sans', system-ui, sans-serif",
                        fontSize:10, letterSpacing:"0.22em", color:"var(--moss)",
                        textTransform:"uppercase", fontWeight:500, marginBottom:14,
                        display:"flex", alignItems:"center", gap:10,
                      }}>
                        <span style={{display:"inline-block", width:22, height:1, background:"var(--moss)", opacity:0.7}}/>
                        Flagged substances
                      </div>
                      <div style={{display:"flex", flexWrap:"wrap", gap:6}}>
                        {flagged.slice(0, 12).map((f, i) => {
                          const st = sStyle(f.severity);
                          const dn = cleanName(f.name);
                          if (!dn || isGeneric(dn)) return null;
                          return (
                            <span key={i} style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:12, fontWeight:500, padding:"5px 12px", borderRadius:"var(--tile-shape-1)", background:st.bg, color:st.color, border:st.border, whiteSpace:"nowrap", letterSpacing:"0.01em"}}>
                              {dn}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* WORTH KNOWING — editorial flags */}
                {(() => {
                  const flags = [];
                  const conc = Array.isArray(result.concerns) ? result.concerns : [];
                  conc.slice(0, 3).forEach((c) => {
                    if (typeof c === "string") flags.push({ headline: c, body: null, action: null });
                    else if (c && c.concern) flags.push({ headline: c.concern, body: c.explanation || c.why || null, action: c.suggestion || null });
                  });
                  if (flags.length < 3) (result.harmful_chemicals || []).slice(0, 3 - flags.length).forEach((c) => flags.push({ headline: c, body: "Common concern with this ingredient class.", action: null }));
                  if (flags.length < 3) (result.identified_plastics || []).slice(0, 3 - flags.length).forEach((p) => flags.push({ headline: p, body: "Plastic component identified on the label.", action: null }));
                  if (!flags.length) return null;
                  return (
                    <div style={{padding:"22px 0 4px", textAlign:"left"}}>
                      <div style={{
                        fontFamily:"'DM Sans', system-ui, sans-serif",
                        fontSize:10, letterSpacing:"0.22em",
                        color:"var(--moss)", textTransform:"uppercase",
                        fontWeight:500, marginBottom:16, display:"flex", alignItems:"center", gap:10,
                      }}>
                        <span style={{display:"inline-block", width:22, height:1, background:"var(--moss)", opacity:0.7}}/>
                        Worth knowing
                      </div>
                      {flags.map((flag, i) => (
                        <div key={i} style={{
                          marginBottom: i < flags.length - 1 ? 20 : 0,
                          paddingBottom: i < flags.length - 1 ? 20 : 0,
                          borderBottom: i < flags.length - 1 ? "1px solid var(--rule-soft)" : "none",
                        }}>
                          <div style={{
                            fontFamily:"'Lora', Georgia, serif",
                            fontSize:19, lineHeight:1.2, color:"var(--ink)",
                            marginBottom:6, letterSpacing:"-0.005em", fontWeight:400,
                          }}>{flag.headline}</div>
                          {flag.body && (
                            <div style={{
                              fontFamily:"'DM Sans', system-ui, sans-serif",
                              fontSize:13, color:"var(--ink-soft)",
                              lineHeight:1.5, marginBottom: flag.action ? 8 : 0,
                            }}>{flag.body}</div>
                          )}
                          {flag.action && (
                            <span style={{
                              fontFamily:"'Lora', Georgia, serif",
                              fontSize:14, color:"var(--moss)",
                              display:"inline-flex", alignItems:"center", gap:6, fontWeight:400,
                            }}>
                              <span style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:300}}>→</span>
                              {flag.action}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Primary action row — mirrors Surface 1. "Show me cleaner" only when alts exist. */}
                {(() => {
                  const hasAlts = (result.alternatives?.length > 0) || (result.ai_alternatives?.length > 0);
                  return (
                    <div style={{display:"flex", gap:10, marginTop:28, flexWrap:"wrap"}}>
                      {hasAlts && (
                        <button
                          onClick={()=>{ setShowDetail(false); setShowAlts(true); }}
                          style={{
                            flex:"1.35 1 160px",
                            padding:"15px 18px",
                            background:"var(--moss)", color:"var(--ivory)",
                            border:"none",
                            borderRadius:"22px 18px 24px 20px / 20px 24px 18px 22px",
                            cursor:"pointer",
                            fontFamily:"'DM Sans', system-ui, sans-serif",
                            fontWeight:500, fontSize:14, letterSpacing:"0.005em",
                          }}>
                          Show me cleaner
                        </button>
                      )}
                      <button
                        onClick={()=>{
                          const alreadyInRoutine = history.some(h => h.product_name === result.product_name);
                          if (!alreadyInRoutine) {
                            const entry = {...result, scannedAt: new Date().toISOString()};
                            const next = [entry, ...history.filter(h => h.product_name !== result.product_name)].slice(0, 200);
                            setHistory(next);
                            try { localStorage.setItem("ps_history", JSON.stringify(next)); } catch {}
                          }
                          setShowDetail(false);
                          reset();
                        }}
                        style={{
                          flex: hasAlts ? "1 1 140px" : "1 1 100%",
                          padding:"15px 18px",
                          background: hasAlts ? "transparent" : "var(--moss)",
                          color: hasAlts ? "var(--ink)" : "var(--ivory)",
                          border: hasAlts ? "1px solid var(--rule-strong)" : "none",
                          borderRadius:"22px 18px 24px 20px / 20px 24px 18px 22px",
                          cursor:"pointer",
                          fontFamily:"'DM Sans', system-ui, sans-serif",
                          fontWeight:500, fontSize:14, letterSpacing:"0.005em",
                        }}>
                        Shelf anyway
                      </button>
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })()}

        {/* ── ALTERNATIVES VIEW (Session 4.1 — partiqule-details-alts mockup) ── */}
        {showAlts && result && (() => {
          // Identify alts on the user's own shelf so we can tag them.
          const shelfNameSet = new Set((history || []).map(h => (h.product_name || "").toLowerCase().trim()));
          const onShelf = (n) => shelfNameSet.has((n || "").toLowerCase().trim());

          // Pull cleanest products per mockup source toggle.
          const isRestaurant = result.category === "restaurant";
          const dbAlts = filterAltsBySource(result.alternatives, altSource).slice(0, 3);
          const dbNames = new Set(dbAlts.map(p => p.name?.toLowerCase().trim()));
          const aiAlts = filterAltsBySource(result.ai_alternatives, altSource)
            .filter((a, i, arr) => arr.findIndex(b => b.name?.toLowerCase().trim() === a.name?.toLowerCase().trim()) === i)
            .filter(a => !dbNames.has(a.name?.toLowerCase().trim()))
            .slice(0, Math.max(0, 5 - dbAlts.length));
          const merged = isRestaurant ? dbAlts : [...dbAlts, ...aiAlts];
          const shelfCount = (history || []).length;
          const productScore = result.overall_score || result.score;
          const altShapes = [
            "16px 14px 18px 15px / 14px 18px 15px 16px",
            "14px 18px 15px 16px / 18px 15px 16px 14px",
            "18px 15px 16px 14px / 15px 16px 14px 18px",
            "15px 16px 14px 18px / 16px 14px 18px 15px",
          ];
          const amazonUrl = (name) => `https://www.amazon.com/s?k=${encodeURIComponent(name)}&tag=partiqule-20`;
          const sc = (s) => s == null ? "var(--ink-soft)" : s <= 3 ? "var(--score-green)" : s <= 5 ? "var(--score-amber)" : "var(--score-red)";
          const noResults = merged.length === 0;

          // Compare & Share only surfaces if best alt is ≥2 points lower.
          const compareBest = (() => {
            const scored = [...(result.alternatives || []), ...(result.ai_alternatives || [])]
              .filter(a => (a.score ?? a.estimated_score) != null);
            if (!scored.length) return null;
            const b = scored.reduce((a, c) => ((a.score ?? a.estimated_score) <= (c.score ?? c.estimated_score) ? a : c));
            const bs = b.score ?? b.estimated_score;
            return (productScore - bs) >= 2 ? b : null;
          })();

          return (
            <div style={{position:"fixed", inset:0, zIndex:9990, background:"var(--cream)", overflowY:"auto", fontFamily:"'DM Sans', system-ui, sans-serif"}}>
              {/* Top bar — back arrow left, shelf badge right */}
              <div style={{
                display:"flex", alignItems:"center", justifyContent:"space-between",
                padding: `${(SAFE_TOP || 0) + 18}px 24px 12px`,
                borderBottom:"1px solid var(--rule)",
                background:"var(--cream)",
                position:"sticky", top:0, zIndex:10,
              }}>
                <button onClick={()=>setShowAlts(false)} style={{
                  display:"flex", alignItems:"center", gap:8,
                  background:"transparent", border:"none", cursor:"pointer", padding:0,
                  fontFamily:"'DM Sans', system-ui, sans-serif",
                  fontSize:10.5, letterSpacing:"0.22em",
                  color:"var(--ink-soft)", textTransform:"uppercase", fontWeight:500,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                  Back
                </button>
                <div style={{
                  fontFamily:"'DM Sans', system-ui, sans-serif",
                  fontSize:11, color:"var(--ink-soft)", fontWeight:500, cursor:"pointer",
                }} onClick={()=>{setShowAlts(false); setPage("history"); setResult(null);}}>
                  Shelf <strong style={{color:"var(--moss)", fontWeight:500, marginLeft:4}}>{shelfCount}</strong>
                </div>
              </div>

              {/* Header block */}
              <div style={{padding:"26px 24px 22px", maxWidth:640, margin:"0 auto"}}>
                <div style={{
                  fontFamily:"'DM Sans', system-ui, sans-serif",
                  fontSize:10.5, letterSpacing:"0.2em",
                  color:"var(--ink-faint)", textTransform:"uppercase",
                  fontWeight:500, marginBottom:16,
                }}>
                  Instead of {result.product_name?.length > 40 ? result.product_name.slice(0, 37) + "…" : result.product_name} · {Math.round(productScore)}
                </div>
                <h1 style={{
                  fontFamily:"'Lora', Georgia, serif",
                  fontSize: isMobile ? 36 : 44,
                  fontWeight:400,
                  color:"var(--ink)",
                  letterSpacing:"-0.012em",
                  lineHeight:1,
                  margin:"0 0 10px",
                }}>Cleaner options</h1>
                <div style={{
                  fontFamily:"'Lora', Georgia, serif",
                  fontSize:18, color:"var(--ink-soft)",
                  lineHeight:1.35, fontWeight:400, letterSpacing:"-0.005em",
                }}>
                  {merged.length >= 1 ? `${merged.length} I'd reach for instead.` : "Checking for cleaner options…"}
                </div>
              </div>

              {/* Source toggle — mockup pill group */}
              <div style={{
                margin:"0 24px 20px",
                maxWidth:640,
                marginLeft:"auto", marginRight:"auto",
              }}>
                <div style={{
                  padding:4,
                  background:"var(--cream-light)",
                  border:"1px solid var(--rule)",
                  display:"flex", gap:2,
                  borderRadius:"14px 16px 12px 15px / 12px 15px 14px 16px",
                  margin:"0 24px",
                }}>
                  {[["amazon","Amazon"],["brand","Brand site"],["bigbox","Target"]].map(([src, label]) => {
                    const active = altSource === src;
                    return (
                      <div key={src} onClick={()=>setAltSource(src)} style={{
                        flex:1, padding:"10px 12px", textAlign:"center",
                        cursor:"pointer",
                        fontFamily:"'DM Sans', system-ui, sans-serif",
                        fontSize:10.5, letterSpacing:"0.18em",
                        color: active ? "var(--ivory)" : "var(--ink-soft)",
                        textTransform:"uppercase", fontWeight:500,
                        background: active ? "var(--moss)" : "transparent",
                        borderRadius:10,
                        transition:"background 0.2s, color 0.2s",
                      }}>{label}</div>
                    );
                  })}
                </div>
              </div>

              {/* Alternative cards */}
              <div style={{padding:"0 24px", maxWidth:640, margin:"0 auto"}}>
                {noResults ? (
                  <div style={{
                    padding:"40px 24px", textAlign:"center",
                    fontFamily:"'Lora', Georgia, serif",
                    fontSize:18, color:"var(--ink-soft)", lineHeight:1.4, fontWeight:400,
                    letterSpacing:"-0.005em",
                  }}>
                    {/* Source-specific copy first — user can switch tabs for options. */}
                    {altSource === "brand"
                      ? "No direct brand alternatives for this one. Try Amazon."
                      : altSource === "bigbox"
                      ? "Nothing clean at Target for this category yet. Try brand sites."
                      /* Amazon tab: score-aware copy so we don't tell a user with a score-6 product that it "scores well". */
                      : productScore <= 3
                      ? "No swap needed — this one scores well."
                      : productScore <= 5
                      ? "I didn't find a cleaner option that matches this use case."
                      : "I couldn't pull specific alternatives for this one. Scan a related product to compare."}
                  </div>
                ) : merged.map((alt, i) => {
                  const score = alt.estimated_score ?? alt.score ?? 3;
                  const { brand: extractedBrand, body: altBody } = extractBrand(alt.name, alt.brand);
                  const brand = (extractedBrand || "").trim();
                  const shortName = (() => {
                    const rest = altBody || alt.name || "";
                    return rest.length > 52 ? rest.slice(0, 49) + "…" : rest;
                  })();
                  const composition = (alt.material || "").toUpperCase().replace(/\s*[,·]\s*/g, " · ");
                  const tags = [];
                  const reason = alt.reason || alt.description || "";
                  // Extract certification-style tags from reason text
                  const certPatterns = [
                    { rx: /\bGOTS\b/i, text: "GOTS certified" },
                    { rx: /\bBluesign\b/i, text: "Bluesign approved" },
                    { rx: /\bFair Trade\b/i, text: "Fair Trade" },
                    { rx: /\bOEKO-TEX\b/i, text: "OEKO-TEX" },
                    { rx: /\bUSDA Organic\b/i, text: "USDA Organic" },
                    { rx: /\bNon-GMO\b/i, text: "Non-GMO" },
                    { rx: /\bMade in USA\b/i, text: "Made in USA" },
                    { rx: /\brecycled\b/i, text: "Recycled" },
                  ];
                  certPatterns.forEach(c => { if (c.rx.test(reason) || c.rx.test(composition)) tags.push({ text: c.text, kind: "cert" }); });
                  if (onShelf(alt.name)) tags.push({ text: "On your shelf", kind: "shelf" });
                  const buyUrl = altSource === "brand"
                    ? getBrandUrl(alt.brand || alt.name, alt.name)
                    : altSource === "bigbox"
                    ? BIGBOX_URLS.target(alt.name)
                    : (alt.affiliateUrl || amazonUrl(alt.name));
                  return (
                    <div key={i}
                      onClick={(e)=>{
                        // Default tap — open the buy link in new tab.
                        window.open(buyUrl, "_blank", "noopener,noreferrer");
                      }}
                      style={{
                        background:"var(--cream-light)",
                        padding:"16px 18px 18px",
                        border:"1px solid var(--rule-soft)",
                        marginBottom:10,
                        cursor:"pointer",
                        transition:"transform 0.15s, background 0.2s",
                        display:"flex", gap:16, alignItems:"flex-start",
                        borderRadius: altShapes[i % altShapes.length],
                      }}>
                      {/* Score ring */}
                      <div style={{
                        width:52, height:52,
                        borderRadius:"49% 51% 50% 50% / 52% 48% 52% 48%",
                        background:"transparent",
                        border:`2px solid ${sc(score)}`,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        flexShrink:0, marginTop:2,
                      }}>
                        <span style={{
                          fontFamily:"'Lora', Georgia, serif",
                          fontSize:26, color:sc(score), lineHeight:1,
                          fontWeight:400, letterSpacing:"-0.01em",
                        }}>{Math.round(score)}</span>
                      </div>
                      {/* Info */}
                      <div style={{flex:1, minWidth:0}}>
                        {brand && (
                          <div style={{
                            fontFamily:"'DM Sans', system-ui, sans-serif",
                            fontSize:10, letterSpacing:"0.22em",
                            color:"var(--ink-faint)", textTransform:"uppercase",
                            fontWeight:500, marginBottom:2,
                          }}>{brand.toUpperCase()}</div>
                        )}
                        <div style={{
                          fontFamily:"'Lora', Georgia, serif",
                          fontSize:19, color:"var(--ink)",
                          lineHeight:1.15, marginBottom:8,
                          letterSpacing:"-0.005em", fontWeight:400,
                        }}>{shortName || alt.name}</div>
                        {composition && (
                          <div style={{
                            fontFamily:"'DM Sans', system-ui, sans-serif",
                            fontSize:10, letterSpacing:"0.12em",
                            color:"var(--ink-soft)", textTransform:"uppercase",
                            marginBottom:8,
                          }}>{composition}</div>
                        )}
                        {tags.length > 0 && (
                          <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
                            {tags.map((t, j) => (
                              <span key={j} style={{
                                fontFamily:"'DM Sans', system-ui, sans-serif",
                                fontSize:10.5, fontWeight:500,
                                padding:"2px 9px",
                                borderRadius:40,
                                color: t.kind === "shelf" ? "var(--amber)" : "var(--moss)",
                                background: t.kind === "shelf" ? "rgba(200, 120, 26, 0.1)" : "var(--moss-soft)",
                              }}>{t.text}</span>
                            ))}
                          </div>
                        )}
                        <div style={{display:"flex", gap:16, marginTop:10, flexWrap:"wrap"}}>
                          <button onClick={(e)=>{ e.stopPropagation(); setShowAlts(false); setResult(null); setQuery(alt.name); analyze(alt.name); }}
                            style={{
                              background:"transparent", border:"none", padding:0, cursor:"pointer",
                              fontFamily:"'Lora', Georgia, serif",
                              fontSize:14, color:"var(--moss)",
                              paddingBottom:1, borderBottom:"1px dotted var(--moss)",
                            }}>Scan this</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bottom honest line */}
              {!noResults && (
                <div style={{
                  padding:"24px 24px 0",
                  textAlign:"center",
                  fontFamily:"'Lora', Georgia, serif",
                  fontSize:14, color:"var(--ink-faint)",
                  lineHeight:1.4, fontWeight:400,
                  maxWidth:640, margin:"0 auto",
                }}>
                  These {merged.length} are the cleanest I found that match the use case.
                </div>
              )}

              {/* Supplementary actions — preserved below the core list, restyled cream */}
              <div style={{maxWidth:640, margin:"0 auto", padding:"32px 24px 40px", display:"flex", flexDirection:"column", gap:14}}>
                {compareBest && (
                  <button onClick={()=>setCompareAlt(compareBest)} style={{
                    width:"100%", padding:"13px 16px",
                    background:"transparent",
                    border:"1px solid var(--moss)",
                    color:"var(--moss)",
                    borderRadius:"22px 18px 24px 20px / 20px 24px 18px 22px",
                    fontFamily:"'DM Sans', system-ui, sans-serif",
                    fontWeight:500, fontSize:14, cursor:"pointer",
                    display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                    letterSpacing:"0.005em",
                  }}>
                    <IconShare size={16} color="currentColor"/> Compare and share
                  </button>
                )}

                {result.scan_next?.length > 0 && (
                  <div style={{
                    background:"var(--cream-light)",
                    border:"1px solid var(--rule)",
                    borderRadius:"16px 20px 14px 18px / 18px 14px 20px 16px",
                    padding:"20px 22px",
                  }}>
                    <div style={{
                      fontFamily:"'DM Sans', system-ui, sans-serif",
                      fontSize:10, letterSpacing:"0.22em",
                      color:"var(--moss)", textTransform:"uppercase",
                      fontWeight:500, marginBottom:12,
                      display:"flex", alignItems:"center", gap:10,
                    }}>
                      <span style={{display:"inline-block", width:22, height:1, background:"var(--moss)", opacity:0.7}}/>
                      {["food","food_beverage","beverage","restaurant","supplement"].includes(result.category) ? "Compare these next" : "Complete your routine"}
                    </div>
                    <div style={{display:"flex", flexDirection:"column", gap:8}}>
                      {result.scan_next.map((item, i) => (
                        <button key={i} onClick={()=>{ setShowAlts(false); setResult(null); setQuery(item); analyze(item); track("Scan Next Click", {item, from: result.product_name, category: result.category}); }}
                          style={{
                            display:"flex", alignItems:"center", justifyContent:"space-between",
                            padding:"11px 14px",
                            borderRadius:"14px 10px 15px 12px / 10px 15px 12px 14px",
                            border:"1px solid var(--rule)",
                            background:"var(--cream)",
                            cursor:"pointer", textAlign:"left",
                          }}>
                          <span style={{
                            fontFamily:"'Lora', Georgia, serif",
                            fontSize:15, color:"var(--ink)", fontWeight:400,
                            letterSpacing:"-0.005em",
                          }}>{item}</span>
                          <span style={{
                            fontFamily:"'DM Sans', system-ui, sans-serif",
                            fontSize:10, letterSpacing:"0.22em",
                            color:"var(--moss)", textTransform:"uppercase", fontWeight:500,
                          }}>Scan →</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <BundleCard category={result.category}/>

                <FeedbackButton result={result} text={text} muted={muted} border={border} surface={surface} user={user}/>

                <button onClick={()=>{setShowAlts(false); reset();}}
                  style={{
                    width:"100%", padding:"13px 16px",
                    background:"var(--moss)", color:"var(--ivory)",
                    border:"none",
                    borderRadius:"22px 18px 24px 20px / 20px 24px 18px 22px",
                    fontFamily:"'DM Sans', system-ui, sans-serif",
                    fontWeight:500, fontSize:14, cursor:"pointer",
                    letterSpacing:"0.005em",
                  }}>
                  Scan another product
                </button>
              </div>
            </div>
          );
        })()}
        </>
      )}

      {/* Compare share card modal */}
      {compareAlt && result && (
        <ShareCompareCard result={result} alternative={compareAlt} onClose={() => setCompareAlt(null)}/>
      )}

      {/* ── PERSISTENT MOBILE BOTTOM NAV + FLOATING SCAN ── */}
      {isMobile && (
        <>
          {/* Scan bottom sheet — mobile */}
          {scanSheetOpen && (<>
            <div onClick={()=>setScanSheetOpen(false)} style={{position:"fixed", inset:0, zIndex:9000, background:"rgba(0,0,0,0.5)"}}/>
            <div style={{position:"fixed", bottom:0, left:0, right:0, zIndex:9001, background:"#ffffff", borderRadius:"20px 20px 0 0", padding:"24px 20px 40px", boxShadow:"0 -4px 30px rgba(0,0,0,0.2)"}}>
              <div style={{width:40, height:4, borderRadius:2, background:"#e5e7eb", margin:"0 auto 20px"}}/>
              <div style={{fontSize:16, fontWeight:700, color:text, marginBottom:20, textAlign:"center", fontFamily:"'DM Sans', system-ui, sans-serif"}}>Scan a product</div>
              {/* Photo is the primary scan path — reads the actual label, works on any product
                  regardless of database coverage, and gives the most consistent result.
                  Barcode is demoted to a secondary "quick scan" for known packaged products. */}
              <label style={{display:"flex", alignItems:"center", gap:14, padding:"16px 20px", borderRadius:"var(--card-shape-1)", background:"var(--moss-soft)", border:"1px solid var(--rule)", cursor:"pointer", marginBottom:12}}>
                <input type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(!f)return;e.target.value="";setTimeout(()=>{setScanSheetOpen(false);handleImageScan(f);},100);}}/>
                <div style={{width:44, height:44, borderRadius:"var(--tile-shape-1)", background:"var(--moss)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0}}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--ivory)" strokeWidth="2.2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
                </div>
                <div><div style={{fontSize:15, fontWeight:600, color:text, fontFamily:"'DM Sans', system-ui, sans-serif"}}>Take a photo</div><div style={{fontSize:12, color:muted, marginTop:2}}>Read the label — most accurate</div></div>
              </label>
              <div onClick={()=>{setScanSheetOpen(false); setShowBarcodeScanner(true);}}
                style={{display:"flex", alignItems:"center", gap:14, padding:"14px 20px", borderRadius:14, background:"var(--cream-light)", border:`1px solid ${border}`, cursor:"pointer", marginBottom:12}}>
                <div style={{width:44, height:44, borderRadius:12, background:"#e5e7eb", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0}}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2.2" strokeLinecap="round"><path d="M3 5v14M7 5v14M11 5v14M15 5v14M19 5v14M21 5v14"/></svg>
                </div>
                <div><div style={{fontSize:15, fontWeight:600, color:text, fontFamily:"'DM Sans', system-ui, sans-serif"}}>Scan barcode</div><div style={{fontSize:12, color:muted, marginTop:2}}>Faster for packaged products</div></div>
              </div>
              <label style={{display:"flex", alignItems:"center", gap:14, padding:"14px 20px", borderRadius:14, background:"var(--cream-light)", border:`1px solid ${border}`, cursor:"pointer", marginBottom:12}}>
                <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(!f)return;e.target.value="";setTimeout(()=>{setScanSheetOpen(false);handleImageScan(f);},100);}}/>
                <div style={{width:44, height:44, borderRadius:12, background:"#e5e7eb", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0}}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                </div>
                <div><div style={{fontSize:15, fontWeight:600, color:text}}>Choose from library</div><div style={{fontSize:12, color:muted, marginTop:2}}>Upload an existing photo</div></div>
              </label>
              <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:10}}>
                <div style={{flex:1, height:1, background:"#e5e7eb"}}/>
                <span style={{fontSize:11, color:muted}}>or type a product name</span>
                <div style={{flex:1, height:1, background:"#e5e7eb"}}/>
              </div>
              <div style={{display:"flex", gap:8}}>
                <input value={modalQuery} onChange={e=>setModalQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&modalQuery.trim()){setScanSheetOpen(false);setQuery(modalQuery);analyze(modalQuery);setModalQuery("");}}} placeholder="e.g. Honey Nut Cheerios, Tide Pods..." style={{flex:1, padding:"10px 14px", borderRadius:10, border:`1px solid ${border}`, background:"#f9fafb", color:text, fontSize:14, outline:"none"}}/>
                <button onClick={()=>{if(modalQuery.trim()){setScanSheetOpen(false);setQuery(modalQuery);analyze(modalQuery);setModalQuery("");}}} style={{padding:"10px 16px", borderRadius:"var(--cta-shape)", background:"var(--moss)", color:"var(--ivory)", border:"none", fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:500, fontSize:14, cursor:"pointer"}}>Search</button>
              </div>
            </div>
          </>)}

          {/* Floating Scan Another pill — only visible on results page */}
          {result && (
            <div
              onClick={()=>{setScanSheetOpen(true); setModalQuery(""); setFabOpen(false);}}
              style={{
                position:"fixed", bottom:88, left:"50%", transform:"translateX(-50%)",
                zIndex:8997,
                background:"var(--moss)",
                borderRadius:"var(--cta-shape)", padding:"12px 24px",
                display:"flex", alignItems:"center", gap:10,
                boxShadow:"var(--shadow-card)",
                cursor:"pointer", whiteSpace:"nowrap",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ivory)" strokeWidth="2.5"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
              <span style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:14, fontWeight:600, color:"var(--ivory)", letterSpacing:"0.02em"}}>Scan Another</span>
            </div>
          )}

          {/* Bottom Nav — always visible */}
          <div style={{
            position:"fixed", bottom:0, left:0, right:0, paddingBottom:"env(safe-area-inset-bottom, 0px)", minHeight:72,
            background:"var(--cream)",
            borderTop:"1px solid var(--rule)",
            display:"flex", alignItems:"flex-start", paddingTop:10,
            zIndex:9000,
          }}>
            {[
              { label:"Home",    icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>, action:()=>{reset(); setPage("home");},    active: page==="home" && !result },
              { label:"Feed",    icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>, action:()=>{setPage("feed");setResult(null);try{localStorage.setItem("ps_feed_last_visit",new Date().toISOString());}catch{}}, active: page==="feed" },
              { label:"Scan",    icon:null, action:()=>{setScanSheetOpen(o=>!o); setModalQuery("");}, active:false, isScan:true },
              { label:"Shelf",   icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18"/><circle cx="7" cy="6" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="17" cy="18" r="1" fill="currentColor"/></svg>, action:()=>{setPage("history"); setResult(null);}, active: page==="history" },
              { label:"Profile", icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>, action:()=>{ user ? setPage("settings") : setShowAuth(true); }, active: page==="settings" },
            ].map((item,i) => (
              item.isScan ? (
                /* Center: floating scan button */
                <div key={i} style={{flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4}}>
                  <div onClick={()=>{isMobile?setScanSheetOpen(true):document.getElementById("nav-file-input").click();}}
                    style={{width:52, height:52, borderRadius:"49% 51% 50% 50% / 52% 48% 52% 48%", background:"var(--moss)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", marginTop:-14}}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--ivory)" strokeWidth="1.8"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  </div>
                  {!isMobile && <input id="nav-file-input" type="file" accept="image/*" style={{display:"none"}} onChange={async(e)=>{const f=e.target.files?.[0];if(!f)return;e.target.value="";await handleImageScan(f);}}/>}
                  <span style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:9, fontWeight:500, color:"var(--moss)", letterSpacing:"0.15em", textTransform:"uppercase"}}>Scan</span>
                </div>
              ) : (
                <div key={i} onClick={item.action} style={{flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4, cursor:"pointer", color: item.active ? "var(--moss)" : "var(--ink-faint)", transition:"color 0.15s"}}>
                  {item.icon}
                  <span style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:9, fontWeight:500, letterSpacing:"0.15em", textTransform:"uppercase"}}>{item.label}</span>
                </div>
              )
            ))}
          </div>
        </>
      )}

      {/* BARCODE SCANNER — full screen, mobile only */}
      {showBarcodeScanner && (
        <BarcodeScannerView
          onClose={() => setShowBarcodeScanner(false)}
          onBarcode={async (barcode) => {
            setShowBarcodeScanner(false);
            setBarcodeLoadingPhase("loading");
            setQuery("Scanning barcode…");
            setRevealDone(false);
            setResult(null);
            const started = Date.now();
            const MIN_DISPLAY_MS = 2000;
            const TIMEOUT_MS = 60000;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
            try {
              const resp = await fetch(`${API_BASE}/barcode`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ barcode, userId: user?.id || null }),
                signal: controller.signal,
              });
              clearTimeout(timeout);
              if (!resp.ok) throw new Error(`Server error ${resp.status}`);
              const data = await resp.json();
              // Graceful fallback — barcode not in any product database. Stay in the loading overlay and surface the error phase.
              if (data.fallback_required) {
                const elapsed = Date.now() - started;
                if (elapsed < MIN_DISPLAY_MS) await new Promise(r => setTimeout(r, MIN_DISPLAY_MS - elapsed));
                setBarcodeLoadingPhase("error");
                setQuery("");
                try { track("Barcode Fallback", {barcode, origin: data.origin_country || "unknown"}); } catch {}
                return;
              }
              const elapsed = Date.now() - started;
              if (elapsed < MIN_DISPLAY_MS) await new Promise(r => setTimeout(r, MIN_DISPLAY_MS - elapsed));
              setBarcodeLoadingPhase(null);
              setQuery(data.product_name || barcode);
              setResult(data);
              saveToHistory(data);
              if (!isSubscribed) {
                const newCount = scanCount + 1;
                setScanCount(newCount);
                try { localStorage.setItem("ps_scan_count", String(newCount)); } catch {}
                if (newCount >= FREE_LIMIT) {
                  if (!user) setShowLimitModal("account");
                  else       setShowLimitModal("paywall");
                }
              }
            } catch(err) {
              clearTimeout(timeout);
              const elapsed = Date.now() - started;
              if (elapsed < MIN_DISPLAY_MS) await new Promise(r => setTimeout(r, MIN_DISPLAY_MS - elapsed));
              setBarcodeLoadingPhase("error");
            }
          }}
          onPhoto={async (file) => {
            setShowBarcodeScanner(false);
            await handleImageScan(file);
          }}
        />
      )}

      {/* BARCODE LOADING / ERROR overlay — 2s minimum display, 5s timeout */}
      {barcodeLoadingPhase && (
        <BarcodeLoadingView
          phase={barcodeLoadingPhase}
          onRetry={() => { setBarcodeLoadingPhase(null); setShowBarcodeScanner(true); }}
          onPhoto={async (file) => { setBarcodeLoadingPhase(null); await handleImageScan(file); }}
        />
      )}

      {/* REVIEW + SOCIALS PROMPT — fires once per device when scanCount
          crosses 20. Dismissal sets ps_review_prompted in localStorage
          so it never re-fires. */}
      {showReviewPrompt && (
        <ReviewSocialsPrompt onClose={() => setShowReviewPrompt(false)}/>
      )}

      {/* PURCHASE SUCCESS — shown after successful Apple IAP purchase or restore.
          Explicit visual confirmation so users (and Apple reviewers) can see
          the subscription benefits were granted. Same cream-card treatment as
          the vision contract confirmation modal. */}
      {purchaseSuccess && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 9998,
            background: "rgba(5, 46, 22, 0.32)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            style={{
              background: "var(--cream)",
              borderRadius: "var(--card-shape-2)",
              border: "1px solid var(--rule)",
              padding: isMobile ? "32px 24px 24px" : "36px 32px 28px",
              maxWidth: 420, width: "100%",
              boxShadow: "0 12px 40px rgba(5, 46, 22, 0.18)",
              fontFamily: "'DM Sans', system-ui, sans-serif",
              textAlign: "left",
            }}
          >
            <div style={{
              display: "flex", alignItems: "center", gap: 10, marginBottom: 16,
            }}>
              <div style={{ width: 22, height: 1, background: "var(--moss)", opacity: 0.7 }}/>
              <span style={{
                fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase",
                color: "var(--moss)", fontWeight: 500,
              }}>
                {purchaseSuccess.kind === "restore" ? "Subscription restored" : "Purchase complete"}
              </span>
            </div>
            <div style={{
              fontFamily: "'Lora', Georgia, serif",
              fontSize: isMobile ? 30 : 34, lineHeight: 1.2,
              color: "var(--ink)", fontWeight: 400,
              marginBottom: 10,
            }}>
              {purchaseSuccess.kind === "restore" ? "Welcome back." : "You're in."}
            </div>
            <div style={{
              fontSize: 15, color: "var(--ink-soft)", lineHeight: 1.5,
              marginBottom: 24,
            }}>
              Unlimited scans, Kids Mode, Pregnancy Mode, and the full alternatives library are unlocked.
            </div>
            <button
              onClick={() => setPurchaseSuccess(null)}
              style={{
                width: "100%",
                padding: "14px 20px",
                background: "var(--moss)",
                color: "var(--ivory)",
                border: "none",
                borderRadius: "var(--tile-shape-1)",
                fontSize: 15, fontWeight: 500,
                fontFamily: "'DM Sans', system-ui, sans-serif",
                cursor: "pointer",
                letterSpacing: "0.01em",
              }}
            >
              Start scanning
            </button>
          </div>
        </div>
      )}

      {/* VISION CONTRACT V2 — confirmation modal for low-confidence identification.
          Cream card, Lora headline, moss primary / outlined secondary buttons. */}
      {visionConfirmation && visionConfirmation.confirmationKind === "textile_cascade_miss" && (
        <TextileConfirmationCard
          visionConfirmation={visionConfirmation}
          onConfirm={() => resumeFromConfirmation(null)}
          onEdit={(editedName) => resumeFromConfirmation(editedName)}
          onDismiss={() => setVisionConfirmation(null)}
        />
      )}
      {visionConfirmation && visionConfirmation.confirmationKind !== "textile_cascade_miss" && (
        <div
          onClick={() => setVisionConfirmation(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 9998,
            background: "rgba(5, 46, 22, 0.32)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--cream)",
              borderRadius: "var(--card-shape-2)",
              border: "1px solid var(--rule)",
              padding: isMobile ? "28px 22px 22px" : "32px 28px 26px",
              maxWidth: 420, width: "100%",
              boxShadow: "0 12px 40px rgba(5, 46, 22, 0.18)",
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }}
          >
            <div style={{
              display: "flex", alignItems: "center", gap: 10, marginBottom: 14,
            }}>
              <div style={{ width: 22, height: 1, background: "var(--moss)", opacity: 0.7 }}/>
              <span style={{
                fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase",
                color: "var(--moss)", fontWeight: 500,
              }}>Confirm identification</span>
            </div>
            <div style={{
              fontFamily: "'Lora', Georgia, serif",
              fontSize: isMobile ? 24 : 26, lineHeight: 1.25,
              color: "var(--ink)", fontWeight: 400,
              marginBottom: 6,
            }}>
              Looks like {visionConfirmation.productName}.
            </div>
            <div style={{
              fontSize: 15, color: "var(--ink-soft)", lineHeight: 1.45, marginBottom: 24,
            }}>
              {visionConfirmation.brand ? `${visionConfirmation.brand}. ` : ""}Is that right?
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                onClick={() => resumeFromConfirmation()}
                style={{
                  padding: "14px 20px",
                  background: "var(--moss)",
                  color: "var(--ivory)",
                  border: "none",
                  borderRadius: "var(--tile-shape-1)",
                  fontSize: 15, fontWeight: 500,
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  cursor: "pointer",
                  letterSpacing: "0.01em",
                }}
              >
                Yes, score it
              </button>
              <button
                onClick={() => setVisionConfirmation(null)}
                style={{
                  padding: "13px 20px",
                  background: "transparent",
                  color: "var(--ink)",
                  border: "1px solid var(--rule)",
                  borderRadius: "var(--tile-shape-3)",
                  fontSize: 15, fontWeight: 500,
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  cursor: "pointer",
                }}
              >
                No, retake photo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VISION CONTRACT V2 — friendly refusal screen when cascade returns nothing
          and the label is not fully legible. No alarm styling. Redirect, not error. */}
      {visionRefusal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9998,
          background: "var(--cream)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: isMobile ? "32px 22px" : "48px 40px",
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}>
          <div style={{ maxWidth: 440, width: "100%", textAlign: "left" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 10, marginBottom: 16,
            }}>
              <div style={{ width: 22, height: 1, background: "var(--moss)", opacity: 0.7 }}/>
              <span style={{
                fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase",
                color: "var(--moss)", fontWeight: 500,
              }}>Need a clearer photo</span>
            </div>
            <div style={{
              fontFamily: "'Lora', Georgia, serif",
              fontSize: isMobile ? 28 : 34, lineHeight: 1.2,
              color: "var(--ink)", fontWeight: 400,
              marginBottom: 14,
            }}>
              {visionRefusal.productName}
            </div>
            <div style={{
              fontSize: 16, color: "var(--ink-soft)", lineHeight: 1.5,
              marginBottom: 32,
            }}>
              {visionRefusal.message}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <label
                htmlFor="vision-refusal-retake"
                style={{
                  padding: "14px 20px",
                  background: "var(--moss)",
                  color: "var(--ivory)",
                  border: "none",
                  borderRadius: "var(--tile-shape-1)",
                  fontSize: 15, fontWeight: 500,
                  textAlign: "center",
                  cursor: "pointer",
                  display: "block",
                }}
              >
                Retake photo
              </label>
              <input
                id="vision-refusal-retake"
                type="file" accept="image/*" capture="environment"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  e.target.value = "";
                  setVisionRefusal(null);
                  handleImageScan(f);
                }}
              />
              <button
                onClick={() => { setVisionRefusal(null); setShowBarcodeScanner(true); }}
                style={{
                  padding: "13px 20px",
                  background: "transparent",
                  color: "var(--ink)",
                  border: "1px solid var(--rule)",
                  borderRadius: "var(--tile-shape-3)",
                  fontSize: 15, fontWeight: 500,
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  cursor: "pointer",
                }}
              >
                Scan barcode instead
              </button>
              <button
                onClick={() => setVisionRefusal(null)}
                style={{
                  padding: "10px 16px",
                  background: "transparent",
                  color: "var(--ink-soft)",
                  border: "none",
                  fontSize: 14, fontWeight: 400,
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  cursor: "pointer",
                  textAlign: "center",
                  marginTop: 4,
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER — cream warm-paper */}
      <footer style={{
        background:"var(--cream)",
        color:"var(--ink-soft)",
        padding: isMobile ? "40px 24px 48px" : "56px 40px 56px",
        textAlign:"center", fontSize:13,
        borderTop:"1px solid var(--rule)",
        fontFamily:"'DM Sans', system-ui, sans-serif",
      }}>
        <div style={{display:"flex", alignItems:"center", justifyContent:"center", marginBottom:18}}>
          <img src="/partiqule-wordmark.svg" alt="Partiqule" style={{height:28, width:"auto", display:"block"}}/>
        </div>
        <div style={{
          fontFamily:"'Lora', Georgia, serif",
          fontSize:17, lineHeight:1.5,
          color:"var(--ink-soft)", fontWeight:400,
          maxWidth:420, margin:"0 auto 28px",
          letterSpacing:"-0.005em",
        }}>
          Know what's in your products.<br/>Make choices that matter.
        </div>
        <div style={{display:"flex", justifyContent:"center", gap: isMobile ? 18 : 24, marginBottom:26, flexWrap:"wrap", alignItems:"center"}}>
          {[
            {label:"About",           pg:"about",       path:"/about"},
            {label:"The Science",     pg:"science",     path:"/science"},
            {label:"Shelf",           pg:"history",     path:"/history"},
            {label:"How It Works",    pg:"methodology", path:"/methodology"},
            {label:"Privacy Policy",  pg:"privacy",     path:"/privacy"},
            {label:"Terms of Service",pg:"terms",       path:"/terms"},
          ].map(item => (
            <span key={item.pg} onClick={()=>{setPage(item.pg); setResult(null); window.history.pushState({}, "", item.path); window.scrollTo(0, 0);}}
              style={{
                fontFamily:"'DM Sans', system-ui, sans-serif",
                fontSize:13, color:"var(--ink-soft)", fontWeight:400,
                cursor:"pointer", transition:"color 0.15s",
              }}
              onMouseEnter={e=>{e.currentTarget.style.color = "var(--moss)";}}
              onMouseLeave={e=>{e.currentTarget.style.color = "var(--ink-soft)";}}>
              {item.label}
            </span>
          ))}
          <a href="https://instagram.com/partiquleapp" target="_blank" rel="noopener noreferrer"
            style={{
              fontFamily:"'DM Sans', system-ui, sans-serif",
              fontSize:13, color:"var(--ink-soft)", fontWeight:400,
              textDecoration:"none",
              display:"inline-flex", alignItems:"center", gap:6,
              transition:"color 0.15s",
            }}
            onMouseEnter={e=>{e.currentTarget.style.color = "var(--moss)";}}
            onMouseLeave={e=>{e.currentTarget.style.color = "var(--ink-soft)";}}>
            <IconInstagram size={14} color="currentColor"/> @partiquleapp
          </a>
        </div>
        <div style={{
          borderTop:"1px solid var(--rule-soft)",
          paddingTop:20, marginTop:4,
          maxWidth:560, margin:"0 auto",
        }}>
          <div style={{
            fontFamily:"'DM Sans', system-ui, sans-serif",
            fontSize:12, color:"var(--ink-faint)", marginBottom:8,
          }}>
            © 2026 Partiqule Ltd.
          </div>
          <div style={{
            fontFamily:"'DM Sans', system-ui, sans-serif",
            fontSize:12, color:"var(--ink-faint)", lineHeight:1.6, marginBottom:12,
          }}>
            As an Amazon Associate I earn from qualifying purchases. Affiliate links are always clearly labeled and never influence our scores.
          </div>
          <a href="mailto:paul@partiqule.com"
            onClick={e=>{e.preventDefault(); window.location.href = "mailto:paul@partiqule.com";}}
            style={{
              fontFamily:"'DM Sans', system-ui, sans-serif",
              fontSize:13, color:"var(--moss)",
              textDecoration:"none", fontWeight:500,
              transition:"color 0.15s",
            }}
            onMouseEnter={e=>{e.currentTarget.style.color = "var(--moss-deep)";}}
            onMouseLeave={e=>{e.currentTarget.style.color = "var(--moss)";}}>
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
        <div style={{minHeight:"100vh", background:"var(--cream)", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16, padding:32, textAlign:"center"}}>
          <div style={{display:"flex",justifyContent:"center"}}><IcoScan size={48} color="var(--moss)"/></div>
          <div style={{fontFamily:"'Lora', Georgia, serif", fontWeight:400, fontSize:28, color:"var(--ink)", letterSpacing:"-0.01em"}}>Something went wrong</div>
          <div style={{fontFamily:"'DM Sans', system-ui, sans-serif", fontSize:14, color:"var(--ink-soft)", maxWidth:320, lineHeight:1.6}}>Partiqule hit an unexpected error. Tap below to reload and try again.</div>
          <button onClick={()=>window.location.reload()} style={{padding:"12px 28px", borderRadius:"var(--cta-shape)", border:"none", background:"var(--moss)", color:"var(--ivory)", fontFamily:"'DM Sans', system-ui, sans-serif", fontWeight:500, fontSize:15, cursor:"pointer", marginTop:8}}>
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
