# Improvement plan

Reviewed 14 November 2026 from `cursor/ios-signin-and-review-636c`. This is a recommendation. No application code was changed. The tour of the repo, the secret scan, and the iOS sign-in fix are in [CODEBASE_MAP.md](CODEBASE_MAP.md). This file does not repeat that work.

## Five lines on the top three

A new account is stored as unpaid, and the app opens the paywall before any score. The site says the trial needs no card. Web checkout collects a card, and the Apple button describes a free trial the purchase call never requests.

Apple marks the account paid from the text of the receipt. The server does not check Apple's signature, and a cancellation or expiry never clears the paid flag.

Stripe can take a card and leave the account unpaid when the subscription event arrives before the customer is linked. A second checkout leaves the first subscription billing, the website has no cancel button, and deleting the account stops only an already-active Stripe plan.

## What this means for the 284-person test

The scoring library can answer a known product quickly. The test fails earlier than that. A follower who taps the site or the app is asked to create an account, confirm email, and hand over a card before they see a number. Fix that path first. Fix Apple and Stripe in the same pass, so the first person who pays stays paid and is not billed twice. The camera redesign, the food-engine promotion, and splitting the two large files can wait until someone has paid.

Things already written up in the codebase map, and left out of the ranking below: rotate the admin password and the Upstash token, ship an iOS build of the sign-in fix, turn on Sign in with Apple in Apple and Supabase, and keep Supabase on a plan that stays awake. Those are still the operational steps. They are dashboard work, not new code.

## Why GitHub shows pull request 1 as not passing

Pull request 1 is mergeable. GitHub's `mergeable_state` is `unstable`, which means a status check failed. There is no GitHub Actions workflow in the repo, so the red mark is not a test run.

On commit `26c0511abb0db6adf3894c416a7a46e752dea42b` the combined commit status is `failure`. The only status is Vercel, description "Deployment has failed," for deployment `dpl_7fcjMf1WCXi2QLUTdoiXVo3tPNQg`. The separate check named "Vercel Preview Comments" succeeded. That check is the comment bot. The build log itself sits in the Vercel project, and this review could not open it. The codebase map records that `npm run build` in `frontend` succeeded on this branch, so this document does not claim the source fails to compile. The failing check is the preview deploy.

## How to read each item

Effort is the size of the change. **Small** is a few files and a test. **Medium** crosses the app and the API. **Large** is a new billing integration or a scoring change that needs a comparison pass before it is shown to people. "Helps" is which of revenue, reliability, security, or portfolio value moves.

---

### 1. Let a person see one score before a card

**What is wrong.** A scan is refused unless the account is `trialing` or `active` (`enforceScanGate` in `backend/server.js`, around lines 705 to 716, called from `POST /analyze` around lines 6403 to 6415). A brand-new profile is inserted with `is_subscribed` false and no trial end (`backend/migrations/015_fix_handle_new_user_search_path.sql`, lines 40 to 41). Nothing in signup writes `subscription_status` or `trial_ends_at`.

After a successful sign-in, the app calls the subscription check and opens the paywall as soon as the answer is unpaid (`frontend/src/App.jsx`, around line 9139). The scan button does the same before the request (`App.jsx`, around lines 8405 to 8412).

The words disagree with that gate:

- The pricing section says "7 days free when you create an account" and "No card required up front" (`App.jsx`, around lines 7378 to 7380).
- The pre-signup modal says "10 scans free" (`FREE_LIMIT` is 10, around lines 7661 and 9195 to 9200). That counter only moves after a scan that the unpaid check already blocked (around lines 8455 to 8461), so the 10 free scans cannot happen.
- Web checkout always sets `trial_period_days: 7` and the comment above it says Stripe collects the card up front (`backend/server.js`, around lines 9986 to 9991).
- The Apple paywall says "No charge until day 8" (`App.jsx`, around line 9220). `purchaseProduct` is called with the product id and the subscription type only (around lines 7928 to 7931). The call does not request an introductory offer. Whether App Store Connect has a 7-day offer is outside this repo. The button text also prints the price string, which already ends in "/month," and then adds "a month" (the default price string is `$4.99/month` at line 7634).

Signup with email confirmation shows "Check your email" and does not sign the person in (`App.jsx`, around lines 5723 to 5728). The path to a first score is: create account, open the email, sign in, see the paywall, enter a card.

**Why it matters.** This is the revive-or-sunset question. Two hundred eighty-four followers will judge the product on the first minute. Today that minute is an account form and a card form. The score they came for is behind both. A card-first trial also trains people to expect a charge, which is a hard ask from an Instagram bio.

**Effort.** Medium. Give a small number of scans, or one sample result, to a signed-in account before checkout. Make the site, the paywall, and Stripe say the same thing about the card. A hidden bypass of the paywall for everyone would be the wrong fix. The gate should stay. The first result should happen before it.

**Helps.** Revenue.

### 2. Check Apple's signature, and turn access off when Apple does

**What is wrong.** The live purchase path is `POST /apple-iap-confirm` (`backend/server.js`, around lines 11049 to 11110). It requires a login, which closed the older hole where any caller could send a user id and become premium. The receipt check that replaced it does not do what the comment claims.

`verifyAppleReceipt` (around lines 11006 to 11027) accepts a three-part token, base64-decodes the middle, and checks that `bundleId` is `com.partiqule.app` and `productId` is `com.partiqule.app.premium.monthly`. The comment on lines 11007 to 11009 says the signature is not verified. A signed-in person can build that middle section themselves. The server then sets `is_subscribed: true` (around lines 11093 to 11100).

The same function reads `expiresDate` and then, for an active purchase, stores `subscription_ends_at` as null (line 11099). `gateDecision` in `backend/subscriptionState.js` (lines 42 to 49) allows access for status `active` or `trialing` and never looks at the end date. A trial whose `trial_ends_at` is already past still passes, because the gate looks at the status word only.

`POST /apple-webhook` (around lines 10536 to 10545) logs the body and returns 200. Apple will not retry, and the profile is unchanged. Restore in the app (`App.jsx`, around lines 7866 to 7869) shows "No active Partiqule subscription found" and returns without clearing the paid flag.

The older `POST /verify-apple-receipt` (around lines 10517 to 10527) is a stub and does not grant access. The grant is only `/apple-iap-confirm`. The legacy `verifyReceipt` branch (around lines 11029 to 11043) checks Apple's status and the bundle id. It does not require the monthly product, and if the receipt has no `in_app` entries the handler still writes status `active`.

The body `transactionId` is logged and not compared to the receipt. `originalTransactionId` is not stored, so a later Apple notice could not be matched to an account even after the webhook is built.

**Why it matters.** Two failures sit on this one path. A person who reads the public server can grant their own account premium. A person who pays, then cancels in Apple Settings, keeps Partiqule access, because nothing clears the flag. The sign-in fix stopped paying people from being locked out. This is the remaining money bug: access that Apple has ended, and access Apple never sold.

**Effort.** Large. Verify the StoreKit 2 signature against Apple's keys, reject expired transactions, store `originalTransactionId`, and handle App Store Server Notifications so refunds, cancels, and billing failures update the same profile row the scan gate reads. Until that lands, treat every iOS "active" row as "paid at least once," not "paid right now."

**Helps.** Security, revenue, reliability.

### 3. Make one Stripe subscription stick, and let a web subscriber cancel

**What is wrong.** `POST /create-checkout` (`backend/server.js`, around lines 9975 to 10007) takes `userId` and `email` from the body. It does not require a login, and it does not look for a subscription the account already has. Each call passes `customer_email`, so Stripe opens a new customer. The success handler writes that new customer id onto the profile (around lines 10153 to 10166) and does not set the paid status.

The handler that does set the status, `writeSubscriptionState` (around lines 10126 to 10133), looks the account up by `stripe_customer_id` and returns without writing if the link is not there yet. Stripe does not promise that `customer.subscription.created` arrives after `checkout.session.completed`. When the subscription event arrives first, it is discarded. The account stays unpaid until some later subscription event.

A second checkout overwrites `stripe_customer_id`. The first subscription is still a live Stripe subscription. Later events for the old customer no longer find the account, so a cancellation of the old subscription never reaches the profile, and the card keeps being charged.

`invoice.payment_failed` only logs (around lines 10179 to 10181). A later `customer.subscription.updated` with status `past_due` does clear the paid flag, because only `active` and `trialing` count (line 10136). During Stripe's retry window the person can be locked out and then charged when the retry succeeds.

On the website, the "Manage subscription" button is inside the iPhone-only branch (`App.jsx`, around lines 9374 to 9382). A web subscriber sees "You're subscribed" and no cancel control. There is no Stripe customer-portal route in `server.js`.

Delete account (`server.js`, around lines 9093 to 9102) cancels Stripe subscriptions whose status is exactly `active`. A `trialing` subscription is left in place, and it converts to a charge after the account is gone. The dialog in the app says the deletion will "cancel any active subscription" (`App.jsx`, around line 9164). Apple billing is not cancelled by this route at all. Apple has to be cancelled by the subscriber in their Apple ID subscriptions. The iPhone purchase screen also gives up after 12 seconds and offers "Subscribe on partiqule.com" (`App.jsx`, around lines 7910 to 7914 and 9239 to 9242) without cancelling the App Store purchase, which may still complete.

**Why it matters.** This is how a paying person loses access, and how a person gets charged twice. The follower test will include at least a few people who tap subscribe, see the paywall again, and assume the product took their money. A second group will subscribe on the phone and again on the site because the phone told them to. A third group will delete the account during the trial and still be billed on day eight.

**Effort.** Medium. Require the login on checkout, refuse a second subscription while one is active, write the paid status in the same step that stores the customer id, open a Stripe customer portal from Settings on the web, cancel `trialing` as well as `active` on delete, and say plainly on the iPhone that Apple billing continues until they cancel it there. Drop the 12-second jump to the website, or make that link restore the same account instead of starting a second cashier.

**Helps.** Reliability, revenue.

### 4. Give every result a share card a follower can post

**What is wrong.** The only share control on a result is "Compare and share," and it renders when a cleaner alternative exists (`App.jsx`, around lines 12465 to 12478). The card it builds is a side-by-side comparison (`ShareCompareCard`, around lines 1069 to 1108), on a white background, and it shares only when the phone accepts a file. There is no card for the score by itself.

The build already writes a public page per calibrated product (`frontend/scripts/generate-product-pages.js`). The app never links to `/products/...` (no match in `frontend/src/App.jsx`). Those pages put a `Product` review in the page header with `ratingCount` of `"1"` and a `ratingValue` of `10` minus the safety score (around lines 150 to 175). A safety score of 1 becomes a 9.0 star rating, from a review the page attributes to Partiqule. Most pages use the site-wide preview image. The script says per-product images are opt-in so the repo does not fill up with thousands of PNGs (around lines 137 to 147).

**Why it matters.** The 284 followers are an audience that shares pictures. A score they cannot post does not leave their phone. The public pages could be that post, and the app never hands them out. The star markup is also a trust problem for a product whose whole pitch is honest numbers: search engines are being given a one-review star rating the app itself does not show.

**Effort.** Medium for a single-score share image plus a link to the existing product page when the product is in the library. Small to remove the invented star rating from the generated pages.

**Helps.** Revenue, portfolio.

### 5. Show the fast food score when the engine already has one

**What is wrong.** Clothing with a readable fiber label, and personal care with a readable ingredient list, skip the model (`backend/server.js`, the textile block around line 6768 and the personal-care block around lines 6779 to 6804). Food does not. `scoreFoodEngine` runs on a text scan in about the time of a function call, and the comment says the result is logged and is not what the person sees (around lines 8445 to 8479). The response still waits on Pass 1, and often Pass 2.

A known product in the calibration library returns without that wait. The slow path is a name or a photo the library does not contain. The server also warms unknown names by calling `POST /analyze` with no login (`warmCache`, around lines 11295 to 11304). The scan gate rejects that call, so the warm-up no longer scores those products.

**Why it matters.** Haiku is the meter that runs up. The daily cap is 500 calls and the monthly cap is 5,000 (`server.js`, around lines 2328 to 2329), shared by every feature that calls the model. A photo of a snack from someone in the test can sit on Pass 1 for the whole request. The fast scorer is already written (`backend/foodScorer.js`). It is waiting on a decision to trust it, not on a new design.

**Effort.** Medium, after reading the `food_scorer_shadow` logs the server already prints. When the engine reports `scored`, return that number and skip Pass 1. When it reports `insufficient_coverage`, keep the model. Turning it on for every food with no comparison would put an unreviewed number in front of people. That is the wrong shortcut.

**Helps.** Cost, reliability.

### 6. A photo still stops for confirmation before the score

**What is wrong.** The marketing page leads with the camera (`App.jsx`, around lines 7297 to 7299). On a photo, confidence under 0.30 asks for another picture, and confidence under 0.45 asks "Is that right?" before scoring (`server.js`, around lines 6604 to 6632). If the name is confident and the lookup still misses, food asks again (around lines 7163 to 7180) and clothing asks a third way, with an editable name (around lines 7190 to 7215).

**Why it matters.** A follower's first action is likely a photo of whatever is on the counter. Two confirmation cards plus a model call is a long time to a number, on top of the account wall in item 1. The confirmations exist because a wrong name used to produce a confident wrong score. They should stay for a genuinely unreadable photo. They should not be the normal path for a package with a readable name.

**Effort.** Medium. Score a readable name immediately when the library or the fast scorer has an answer, and keep the confirm step for the miss. A camera frame that tells the person to fill the label is a larger follow-up. The code already names that as the reason clothing labels come back unreadable. It is real, and it is not the first change for this test.

**Helps.** Revenue, reliability.

### 7. The model is callable without a subscription

**What is wrong.** These routes call Claude and do not use `enforceScanGate`:

- `POST /ask` allows anonymous callers. The limit is 20 an hour per address when Redis is up, and the limiter allows the call when Redis is missing or errors (`backend/ask.js`, around lines 2489 to 2507 and 771 to 786).
- `POST /api/recipe-ingredients` is behind the in-memory limiter only, then calls the model (`server.js`, around lines 10683 to 10709).
- `POST /enrich-explanation` calls the model for any textile-shaped body, with no login (`server.js`, around lines 8892 to 8973).

The hourly limiter in `server.js` (around lines 726 to 748) trusts `userId` in the body before the scan handler replaces it with the id from the login token. A caller can send any id and take that bucket, including the higher paid cap if that profile is subscribed. The scan itself still requires a real subscription. The spend and the rate-limit bucket do not.

`GET /spike/stream` (around lines 10949 to 10973) is a leftover public endpoint the comment says to delete. It holds the connection open for four seconds and does not call the model.

The API host is in the public website, and the repo is public. The 500-call daily cap is the backstop. It is one bucket for real scans and for these open routes.

**Why it matters.** A quiet product can still get an unexpected model bill, and that bill competes with the scans from the follower test. Closing the open routes is cheaper than raising the cap.

**Effort.** Small. Require the same login and subscription as `/analyze`, and key the rate limit off the verified user id. Delete `/spike/stream`.

**Helps.** Cost, security.

### 8. Run the tests on every push, including the payment decisions

**What is wrong.** The repo has no `.github/workflows` directory. GitHub's workflow list for this project is empty, which is why pull request 1 has no test check (see the status section above).

`backend/package.json` runs two files: `scoring-regression-test.js` and `subscriptionState.test.js`. These files exist and are not in that script: `backend/flagDetection.test.js`, `backend/intelMatch.test.js`, `backend/productFamilies.test.js`, and `frontend/src/auth/nativeAuth.test.js`. The frontend package has no test script.

`subscriptionState.test.js` covers the paid-flag fallback and a database error. It does not cover receipt parsing, the Stripe customer-link race, or an expired trial still counting as access. The Apple and Stripe bugs above have no test that would fail today.

**Why it matters.** A recruiter opens the pull request, sees a red X, and the red X is a host deploy rather than the tests. A green test job is the thing that makes the scoring library look finished. It is also the thing that would have kept a made-up Apple receipt from granting premium.

**Effort.** Small. One workflow that runs `npm test` in `backend`, the auth test in `frontend`, and the other three backend test files. Add cases for an unsigned receipt, an expired transaction, a trial date in the past, and a Stripe event that arrives before the customer id exists.

**Helps.** Portfolio, reliability.

### 9. Point the public pages and the app at the same product

**What is wrong.** The generated product pages are a real public catalog. The in-app result never sends the person there (item 4). The pages also describe a missing reason as a microplastic concern even when the product is not that kind of product (`generate-product-pages.js`, the default description around lines 133 to 135). `childScore` on those pages is filled only when the calibration entry has `kidsFloor` (around line 115), while the live scan path now computes a child score from the adult score when no kid-specific bump applies (`computeChildScore` in `server.js`, around lines 2070 to 2076). The public page and the app can show different child numbers for the same product.

**Why it matters.** For the test, these pages are the thing a follower can open without an account, and the thing a recruiter can click. They should show the same score the app would show, and they should be the link the app shares. Right now they are a second, quieter product.

**Effort.** Small to align the child score and drop the microplastic default. Medium once item 4 links the app to the page.

**Helps.** Revenue, portfolio.

### 10. Keep the two large files, and make the small ones the front door

**What is wrong.** `frontend/src/App.jsx` is 13,126 lines. `backend/server.js` is 12,218 lines. The README already points a reader at `textileScorer.js`, `foodScorer.js`, `personalCareScorer.js`, and `calibration.js`. That pointer is right. `CLAUDE.md` at the root still describes older behavior (the codebase map notes this). A reader who opens it first meets a long agent notebook, including internal incident write-ups, ahead of the code that is worth reading.

The food section of the README says food has a deterministic scorer in the same breath as clothing. The server still hides the food score in a log line (item 5). A careful reader will notice.

**Why it matters.** As a portfolio, the impressive part is the scoring, the substance rules, and the fact that a known product does not wait on a model. The files that bury that are the risk. Splitting `App.jsx` and `server.js` before the follower test spends the time the test needs on a rewrite that does not change a single scan.

**Effort.** Small to add a "start here" paragraph that stays true, and to either label the food scorer as logged-only or do item 5. Large, and deferrable, to split the two big files.

**Helps.** Portfolio.

---

## Order if the test is the next thing you do

1. Item 1, so a follower sees a score.
2. Items 2 and 3, so the first payment behaves.
3. Item 4, so that score can be posted.
4. Item 8, so the next change has a green check that is actually a test.
5. Items 5, 6, and 7 when the model bill or the slow scans show up in the test.
6. Item 10's rewrite stays on the shelf.

Ship the iPhone build from the sign-in branch before any of this is judged on a phone. The App Store build people have today does not contain that fix.
