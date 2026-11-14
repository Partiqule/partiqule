# Partiqule codebase map

Reviewed 14 November 2026. This is a tour of the repo, a check of whether it still runs, a secret scan, and the iOS sign-in fix. No git history was rewritten.

## What the app does

Partiqule tells a shopper how a product scores on a 1 to 10 safety scale. Lower is safer. The person can type a name, scan a barcode, or take a photo of the package. The result names the ingredients that drove the score, adds a child score and a pregnancy score when those apply, and offers a cleaner product to buy instead.

The same React app is the website (partiqule.com) and the screen inside the iOS app. The iOS app is a native shell (Capacitor) around that website code, plus Apple payments and, after this change, Sign in with Apple.

Paul built it. Sara is the co-founder on content. The last code commit before this review was 1 June 2026. The live API process has been up since about then (Railway reported roughly 166 days of uptime on 14 November 2026).

## Stack

| Layer | Choice |
| --- | --- |
| Website | React 18, Vite 5. Almost all of the UI is `frontend/src/App.jsx` (about 13,000 lines) with inline styles. |
| API | Node.js and Express in `backend/server.js` (about 12,200 lines). |
| Accounts and database | Supabase. Project ref `hciyibnoipqvspmrflzh`. |
| Score cache | Upstash Redis for 90 days, then a file on disk if Redis is missing. |
| Model | Anthropic Claude Haiku, used when a product is not already scored by hand. |
| Payments | Stripe on the web. Apple In-App Purchase in the iOS app (`com.partiqule.app.premium.monthly`). |
| iOS | Capacitor 8.3. Bundle id `com.partiqule.app`. Minimum iOS 15. Xcode team `39AMCG49RK`. App version in the project is 1.6. |
| Hosting | Vercel for the site, Railway for the API (`partiqule-production.up.railway.app`). |
| Analytics | Plausible, on the website only. |

Node 22 was used for this check. The packages install cleanly. Express 4, React 18, and Vite 5 are not the newest majors. They are not broken.

## How the code is organized

```
backend/server.js            the API: scan, accounts, payments, cache, admin
backend/calibration.js       3,156 hand-checked product scores
backend/textileScorer.js     clothing score from the fiber label
backend/foodScorer.js        food score from ingredients
backend/personalCareScorer.js
backend/scoringCascade.js    where unknown products get their ingredients
backend/pass0.js             barcode and ingredient lookup
backend/visionContract.js    photo: identify the product, then score it
backend/ask.js               the "ask" feature (a shopping question, not a barcode)
backend/migrations/          SQL for the Supabase tables
frontend/src/App.jsx         the whole website UI
frontend/src/auth/           sign-in helpers added in this review
frontend/plugins/apple-sign-in/   native Sign in with Apple, Apple only
frontend/ios/                the Xcode project
```

`CLAUDE.md` at the repo root is a long internal notebook for the coding agent. It is useful, and it is easy for a reviewer to get lost in. The README now points here instead.

## Main features, and where they live

| What the person sees | Where it is |
| --- | --- |
| Home, scan, result, lists, settings | `frontend/src/App.jsx` |
| Sign in, create account, reset password | `AuthModal` in `App.jsx`, helpers in `frontend/src/auth/nativeAuth.js` |
| Sign in with Apple (iPhone only) | `frontend/plugins/apple-sign-in/` |
| Barcode camera | `App.jsx`, using ZXing |
| Photo of a label | `backend/visionContract.js`, then the same scorer as a text search |
| Clothing score from the care tag | `backend/textileScorer.js` |
| Child mode and pregnancy mode | stored on the phone in localStorage, scores computed in `server.js` |
| Alternatives and store links | `backend/products.js`, Amazon tag `partiqule-20` |
| Subscription paywall | Stripe checkout in `server.js`, Apple IAP in `App.jsx` |
| "Ask" (describe a need, get a short list) | `backend/ask.js`, `frontend/src/ask/` |
| Saved lists | `backend/lists.js`, `frontend/src/lists/` |
| Admin tools | routes in `server.js` under `/admin` and `/api/intelligence` |
| Static product pages for search engines | `frontend/scripts/generate-product-pages.js` (3,095 pages on this build) |

A scan is refused unless the caller is signed in and the account is in a trial or a paid plan. That check is `enforceScanGate` in `server.js`. Anonymous calls get `auth_required`.

## How a score is produced

1. The app sends the name, barcode, or photo to `POST /analyze` or `POST /barcode` on the Railway API.
2. The API checks the login token with Supabase, then checks that the subscription is active or in trial.
3. It looks for a hand-checked score in `calibration.js`. A hit comes back immediately.
4. If there is no hand-checked score, it tries to find the real ingredient list: Open Food Facts, Open Beauty Facts, Open Products Facts, a small barcode index, then a web search.
5. Clothing with a fiber label skips the model and uses `textileScorer.js`. Food and personal care can use their own scorers the same way.
6. If none of that is enough, Claude Haiku scores the product. A second pass checks the first one when the first pass looks unsure.
7. Hard rules then override the model: known chemicals have a minimum score, ultra-processed food has a floor, and the API will not claim a chemical is present unless it is in a structured ingredient list. That last rule exists because an earlier bug accused a pretzel brand of a dye the label said it did not contain.
8. The result is cached. The same product should not get a new score on every scan.

## Outside services

| Service | Used for | Status on 14 November 2026 |
| --- | --- | --- |
| Railway API | Scoring | Up. `/health` returned ok. About 2,009 cached products. Amazon live search is off, so it uses the built-in product list. |
| partiqule.com and the Vercel app | The website | Both returned the site. |
| Supabase Auth | Sign in | Up. Email sign-in is on. Sign in with Apple is off. New accounts must confirm email. Sign-up is allowed. |
| Supabase database | Profiles, scans, lists | The API cannot read it without `SUPABASE_SERVICE_KEY`, which is not in the repo. |
| Anthropic | Unknown products | Not configured in a local run. Required for anything outside the calibration library. |
| Upstash Redis | Shared score cache | Not configured locally. A token was committed in 2026 and should be rotated. See below. |
| Stripe | Web subscriptions | Not configured locally. No Stripe secret was found in git history. |
| Apple In-App Purchase | iOS subscriptions | The code calls Apple's older `verifyReceipt` endpoint. Apple has deprecated that endpoint. It still answers, and it is not the sign-in bug. A shared secret (`APPLE_SHARED_SECRET`) has to be set on Railway. It was not found in the repo. |
| Open Food Facts and the sibling databases | Ingredient text | Public APIs. No key in the repo. They can rate-limit or change shape. |
| Barcode lookup (UPCitemDB or Go-UPC) | Unknown barcodes | Optional. Off unless `BARCODE_LOOKUP_PROVIDER` and `BARCODE_LOOKUP_KEY` are set. |
| Amazon Creators API | Live product search | Off. The old README described the retired Product Advertising API. The code has already moved on, and the keys are not set. |
| Loops | Email | Optional. Off without `LOOPS_API_KEY`. |
| Plausible | Page analytics | Loaded by the website. No secret. |

## Can it run today?

Yes, with the limits below. Checked on Node v22.23.4.

| Check | Result |
| --- | --- |
| `cd backend && npm install` | 113 packages, succeeded |
| `cd backend && npm test` | 141 of 141 passed. One test name was wrong (`oreo` vs the real key `oreo cookies`). That name was corrected. |
| `node backend/server.js` | Listens on port 3001. It logs that Stripe, Supabase, Redis, and the Anthropic key are missing, and it stays up. |
| `GET /health` locally | 200 |
| `POST /analyze` locally with no login | 401 `auth_required`. That is the paywall, not a crash. |
| `cd frontend && npm install` | Succeeded, including the new sign-in plugins |
| `cd frontend && npm run build` | Succeeded. 3,095 product pages, then a Vite build. |
| `node frontend/src/auth/nativeAuth.test.js` | Passed |
| `npx cap sync ios` | Succeeded. The iOS project now lists the Apple sign-in plugin. |
| Open the built site in Chrome | The home page renders. No JavaScript exceptions. |
| Sign-in modal on a 390px-wide screen | The form fits. Screenshot: `docs/signin-mobile.png`. |
| Sign in with a fake email against the live Supabase project | The button hits `https://hciyibnoipqvspmrflzh.supabase.co/auth/v1/token` and the screen says "That email and password do not match." |
| Compile the iOS app | Not done. This machine has no Xcode. |

What a reviewer can do with only this repo: install, run the site, run the API health check, and run the scoring tests. What they cannot do without your keys and a subscribed account: complete a real scan.

Things that are old, not broken:

- The purchase code still uses Apple's deprecated receipt endpoint.
- `deploy.sh` is a personal script. It copies files out of `~/Downloads` and then calls the cache-clear URL with no admin key, so that call is rejected.
- `AppDelegate.swift` uses the older `@UIApplicationMain` entry point. Xcode may warn. It is not why sign-in failed.
- The committed `CLAUDE.md` still describes some older details (service worker version, product counts). The code is ahead of that file.

## Security review

The scan covered the current files and the full git history (940 commits). History was not rewritten. Values below are masked on purpose.

### 1. Admin password. Rotate it if Railway still uses it.

A 20-character password beginning `Rowe` and ending `4!` was the admin key.

- It is still in git history, in `backend/server.js` (removed from that file in commit `3e9d021`, 29 April 2026), in `frontend/src/App.jsx`, in old built JavaScript under `frontend/dist`, and in `CLAUDE.md`.
- Until this pull request it was also still in the current files `backend/reload_redis_full.js` and `backend/run_reload.sh`, which call the production reload URL with that password.
- This pull request deletes it from those two files. They now refuse to run unless `ADMIN_KEY` is set in the environment.
- **Rotate it.** In Railway, set `ADMIN_KEY` to a new long random value. If the current value is already something else, you only need to confirm that. Anyone who clones the public repo can try the old password against `/admin` and `/cache-clear`.

### 2. Upstash Redis token. Rotate it.

Commit `baebbc0` (8 April 2026, "Add Redis cache layer") added `backend/.env`. It contained:

- `UPSTASH_REDIS_REST_URL` (an Upstash host)
- `UPSTASH_REDIS_REST_TOKEN`, 71 characters, beginning `gQAA` and ending `DE`

Commit `ddf80f0`, 32 seconds later, stopped tracking that file. The file is not in the current tree. It is still in the history of a public repo.

**Rotate the token** in the Upstash console and update `UPSTASH_REDIS_REST_TOKEN` on Railway. The old token can read and write the score cache. After rotation the cache will be empty until it fills again from real scans. That is the right trade.

### 3. Supabase anon key. Do not rotate it just because it is in the app.

`frontend/src/App.jsx` contains the Supabase anon JWT. The payload says role `anon`, project `hciyibnoipqvspmrflzh`, expiry in 2036. An anon key is meant to ship inside the website and the iOS app. It is not a service-role key.

No service-role key, Stripe secret, Anthropic key, AWS key, GitHub token, Apple `.p8` file, or private key showed up in history.

**Leave the anon key in place** unless you have a reason to think it is being abused. Replacing it breaks the App Store build until you ship an update. Do confirm in the Supabase dashboard that Row Level Security is still on for every table. The anon key is only safe while those policies hold.

### 4. Dependencies were committed

About 4,600 files under `frontend/node_modules`, the built `frontend/dist`, and several `.DS_Store` files were tracked. This pull request stops tracking them. They remain in history. Old copies of `frontend/dist` also contain the admin password from item 1, which is another reason to rotate it.

## iOS sign-in

The last known bug was sign-in on the iPhone app. Here is what the code actually does, what was going wrong, what this pull request changes, and what only you can do in the Apple and Supabase dashboards.

### How sign-in works

The iPhone app does not have its own login screen in Swift. It loads the React app. Accounts are Supabase accounts.

Before this change, the only method was email and password. There was no Sign in with Apple button, the entitlements file was empty, and there was no URL scheme to bring an email link back into the app. Password reset always sent the person to `https://partiqule.com/reset-password`, which opens Safari, not the app.

Checked live on the Supabase project:

- Email sign-in is on.
- Sign in with Apple is off.
- New accounts must click a confirmation email before they can sign in (`mailer_autoconfirm` is false).
- The auth service itself is up.

Bundle id `com.partiqule.app` matches the Capacitor app id and the start of the subscription product id. The Xcode team id is `39AMCG49RK`. There is no Services ID, no Apple private key, and no provisioning profile in the repo. Those live in the Apple Developer account.

### Most likely causes, in order

1. **The sign-in call hangs inside the iOS web view.** The Supabase library takes a browser lock (`navigator.locks`) around every login. That lock often never finishes in the iOS web view, so the button stays on "Please wait...". This is a known problem with this library on Capacitor. The web version is less affected because desktop Safari does release the lock.

2. **A new account looked signed in when it was not.** Because confirmation email is required, sign-up returns a user and no session. The old code still closed the dialog and treated the person as signed in. The next request had no token and failed. On an iPhone, the confirmation link also opened Safari, so the app never saw the confirmation.

3. **Password reset could not get back into the app.** The link was hard-coded to the website. There was no custom URL scheme and no associated domain. A second bug then replaced `/reset-password` with `/` as soon as the page loaded, which can throw away the reset token before the form uses it.

4. **The session was stored where iOS can delete it.** After a real sign-in, killing the app could drop the web view's local storage. The person came back signed out.

5. **A database bug broke every new account for about three weeks in spring 2026.** From roughly 24 April to 15 May 2026, the `handle_new_user` trigger failed and Supabase returned "Database error saving new user." Migration `015` fixes that, and the auth service is answering now. If someone tried the app in that window, this is the bug they hit. It is not an Apple certificate problem.

6. **Sign in with Apple was never built.** If the report was "the Apple button does not work," that is because there was no Apple button. Apple's rule that requires Sign in with Apple applies when an app offers Google or Facebook login. This app only offered email, so Apple did not require the button. It is still the login people expect in an iOS app, and it is the one that does not depend on a confirmation email.

Signing certificates are not in the repo, so this review cannot see an expiry date. An Apple distribution certificate lasts one year. One created with the app (March to June 2026) would still be valid on 14 November 2026. An older one would not. An expired certificate blocks a new upload. It does not log existing users out of an app that is already installed. Open Xcode once and read the signing status. That is the only reliable check.

### What this pull request changes

- On the iPhone, sign-in no longer uses the web lock that hangs. The session is stored with Capacitor Preferences, which survives a relaunch.
- Sign-up with no session stays on the form and tells the person to confirm the email.
- Password reset and confirmation use `partiqule://auth/callback` inside the app, and the website no longer wipes a `/reset-password` link.
- The iPhone sign-in form has a Sign in with Apple button. It uses a small plugin that talks to Apple's own sign-in API and then hands the token to Supabase. It does not include the Google or Facebook SDKs.
- The app entitlement and the `partiqule` URL scheme are in the Xcode project.
- The website does not show the Apple button. On the web, email still works, and a bad password now shows a plain sentence. That path was clicked through in Chrome against the live Supabase project.

The App Store build that is already installed does not contain any of this. It ships when you archive a new build.

### What you have to do

These cannot be done from the repo.

1. **Rotate the admin password and the Upstash token** described above, before more people clone the public repo.

2. **In Supabase, Authentication, URL Configuration**, allow these redirect URLs:
   - `partiqule://auth/callback`
   - `https://partiqule.com/reset-password`
   - `https://partiqule.com/`
   
   Until `partiqule://auth/callback` is allowed, the app's reset email still falls back to the website.

3. **In the Apple Developer account** (team `39AMCG49RK`):
   - Open the App ID `com.partiqule.app` and turn on Sign in with Apple.
   - Create a Sign in with Apple key. Download the `.p8` file once. Note the Key ID. Do not commit the `.p8` file. If it leaks, revoke it and make a new one.
   - Confirm the distribution certificate and the provisioning profile are unexpired. Xcode shows this on the Signing tab.

4. **In Supabase, Authentication, Providers, Apple**, turn the provider on.
   - Client IDs: `com.partiqule.app`
   - The dashboard may also ask for the Services ID secret (a JWT you generate from the `.p8`, the Key ID, and the team id). For the native button, the bundle id is the client id that matters. Supabase's own Apple guide is the form to follow. Do not paste the `.p8` into the repo or into Slack.

5. **On a Mac**, open `frontend/ios/App/App.xcodeproj`, let the Swift packages download, and archive. The new entitlement will fail to sign until step 3 is done. That failure is expected, and it is the signal that the capability is not on the App ID yet.

6. **Ship the build.** Test three paths on a phone: email sign-in for an existing account, a brand-new account (including the confirmation email), and Sign in with Apple. The Apple sheet should appear. If Supabase still has the Apple provider off, the app says so in a sentence instead of spinning.

7. **Keep Supabase from pausing.** The project is awake today. On the free plan it sleeps after a stretch of inactivity, and sign-in dies for everyone until you wake it.

## How the repo looks to a reviewer

Before this pull request, the README described a smaller and older app: 205 products, a two-pass model, dark mode, and Amazon's old API. The real app is a calibration library of 3,156 products, deterministic scorers, an iOS app, subscriptions, and a second "ask" product. About 4,600 dependency files were committed. A reviewer who opened `CLAUDE.md` first would think the project was an unedited chat log.

The product itself looks finished. The home page is a real consumer app, not a demo scaffold. The gap was the front door of the repo.

This pull request replaces the README, adds this map, stops tracking dependencies and build output, and puts two screenshots in `docs/`. The code that will impress a technical reader is the scoring, not the size of `App.jsx`:

- `backend/textileScorer.js`
- `backend/foodScorer.js`
- `backend/calibration.js`
- the substance rules in `server.js` that refuse to flag a chemical the label does not contain

Worth doing next, if the goal is a strong first impression:

1. Ship the iOS build so the sign-in fix is real, not just in git.
2. Rotate the two leaked credentials.
3. Give a reviewer a way to see one score without your personal subscription. Today a clone stops at the login wall.
4. Add two or three result-screen screenshots next to the home screenshot.
5. Leave `App.jsx` and `server.js` alone for now. Splitting them is a long rewrite, and the README now points at the files that are worth reading.

## Plan to make it demoable

1. Rotate the admin key and the Upstash token. Update Railway. This is the only urgent item.
2. Do the Apple and Supabase steps in the sign-in section, then archive a new iOS build and try the three login paths on a phone.
3. For a recruiter on a laptop: `npm install` in both folders, `npm test` in `backend`, `npm run dev` in `frontend`. The home page and the sign-in form work with no keys. Say up front that a live score needs a subscribed account.
4. If you want them to finish a scan on their own, add a single demo account in Supabase with an active subscription, or a clearly labeled sample-result mode that does not call the paid model. That is a small follow-up. It was not done here, because a hidden bypass of the paywall would be the wrong fix.
5. Keep Railway and Supabase on a plan that does not sleep. The API process has already stayed up since the last deploy. The risk is Supabase pausing, not the Node code failing to start.
