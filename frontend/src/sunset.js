// Sunset switch for the public site and the iOS web bundle.
//
// SUNSET_MODE true: visitors see the farewell page. App.jsx stays in the
// repo and is not mounted. Stripe Checkout and Apple purchases are not
// started. Product URLs generated at build time send people to the same page.
//
// To bring Partiqule back:
// 1. Set SUNSET_MODE to false.
// 2. Restore frontend/index.html and frontend/public/manifest.json from
//    git (the commit before this farewell page). Those two files hold the
//    old title, description, price markup, theme color, and the Scan and
//    My Scans shortcuts. Comments at the top of index.html quote the
//    previous title and description.
// 3. Redeploy the frontend. The next build mounts App.jsx again, allows
//    checkout, and writes the real product pages. vercel.json does not
//    need an edit.
//
// A new iOS build picks this up from the Vite bundle (capacitor webDir
// is "dist"). Run npm run build, then npx cap sync ios, and ship a new
// App Store build. Phones already running the store build keep the old
// app until that build is released. This flag does not change Stripe,
// Apple, Supabase, or Railway.

export const SUNSET_MODE = true;

// Public contact already used in the privacy policy, the terms, and the
// in-app Contact us link. There is no separate support inbox in the repo.
export const CONTACT_EMAIL = "paul@partiqule.com";

export const FAREWELL_HEADLINE = "Thanks for the memories!";

export const FAREWELL_PARAGRAPHS = [
  "Partiqule is taking a break.",
  "New sign ups and subscriptions are closed. Existing subscriptions have been cancelled and will not renew.",
];
