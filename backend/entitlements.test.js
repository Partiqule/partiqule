const assert = require("node:assert/strict");
const { decideSubscription, gateDecision } = require("./subscriptionState");
const { decideFreeScan, normalizeGuestId, isScoredResult } = require("./freeScan");
const {
  planCheckout,
  newerLiveSubscriptionIds,
  subscriptionIdsToCancelOnDelete,
  userIdFromStripeObject,
  profileFromStripeSubscription,
  profileFromCompletedCheckout,
} = require("./stripeEntitlement");
const {
  entitlementFromTransaction,
  entitlementFromNotification,
  columnsFromAppleEntitlement,
} = require("./appleEntitlement");

const now = Date.parse("2026-11-14T00:00:00Z");

// Legacy paid row: flag set, no status, no end date. Stays allowed.
const legacy = decideSubscription({
  subscription_status: null,
  is_subscribed: true,
  trial_ends_at: null,
  subscription_ends_at: null,
}, null, now);
assert.equal(legacy.status, "active");
assert.equal(gateDecision(legacy, { nowMs: now }).allowed, true);

// A paid period that ended yesterday still covers the person. The grace
// window is there so a late renewal does not lock them out.
const justEnded = decideSubscription({
  subscription_status: "active",
  is_subscribed: true,
  subscription_ends_at: "2026-11-13T00:00:00Z",
}, null, now);
assert.equal(gateDecision(justEnded, { nowMs: now }).allowed, true);

// A paid period that ended months ago, with no renewal, does not.
const longExpired = decideSubscription({
  subscription_status: "active",
  is_subscribed: true,
  subscription_ends_at: "2026-01-01T00:00:00Z",
}, null, now);
assert.equal(gateDecision(longExpired, { nowMs: now }).allowed, false);

// past_due stays in during Stripe's retry, until the end date plus grace.
const pastDue = decideSubscription({
  subscription_status: "past_due",
  is_subscribed: true,
  subscription_ends_at: "2026-11-20T00:00:00Z",
}, null, now);
assert.equal(gateDecision(pastDue, { nowMs: now }).reason, "ok");

// A trial whose end has passed does not keep access.
const expiredTrial = decideSubscription({
  subscription_status: "trialing",
  is_subscribed: true,
  trial_ends_at: "2026-11-01T00:00:00Z",
}, null, now);
assert.equal(gateDecision(expiredTrial, { nowMs: now }).allowed, false);
assert.equal(gateDecision(expiredTrial, { nowMs: now, freeScanAvailable: true }).reason, "free_scan");

// Canceled is off, even if an end date is still ahead.
const canceled = decideSubscription({
  subscription_status: "canceled",
  is_subscribed: false,
  subscription_ends_at: "2026-12-01T00:00:00Z",
}, null, now);
assert.equal(gateDecision(canceled, { nowMs: now }).reason, "subscription_required");

// A database blip is not "unpaid".
const blip = decideSubscription(null, { code: "500", message: "timeout" }, now);
assert.equal(gateDecision(blip, { nowMs: now }).reason, "subscription_unconfirmed");

assert.equal(normalizeGuestId("short"), null);
assert.equal(normalizeGuestId("guest-12345678"), "guest-12345678");
assert.deepEqual(decideFreeScan({ entitled: true, alreadyUsed: true }), {
  allowed: true, reason: "ok", markUsed: false,
});
assert.equal(decideFreeScan({ entitled: false, alreadyUsed: false }).reason, "free_scan");
assert.equal(decideFreeScan({ entitled: false, alreadyUsed: true }).allowed, false);
assert.equal(isScoredResult({ score: 4 }), true);
assert.equal(isScoredResult({ status: "needs_confirmation", score: 4 }), false);

assert.equal(planCheckout([]).action, "checkout");
assert.equal(planCheckout([]).offerTrial, true);
assert.equal(planCheckout([{ id: "sub_old", status: "canceled" }]).offerTrial, false);
assert.equal(planCheckout([{ id: "sub_live", status: "trialing" }]).action, "portal");
assert.deepEqual(
  newerLiveSubscriptionIds([
    { id: "sub_old", status: "active", created: 10 },
    { id: "sub_new", status: "trialing", created: 20 },
    { id: "sub_dead", status: "canceled", created: 30 },
  ]),
  ["sub_new"],
);
assert.deepEqual(
  subscriptionIdsToCancelOnDelete([
    { id: "sub_trial", status: "trialing" },
    { id: "sub_done", status: "canceled" },
    { id: "sub_due", status: "past_due" },
  ]),
  ["sub_trial", "sub_due"],
);

const stripeSub = {
  status: "trialing",
  trial_end: 1763164800,
  current_period_end: 1763164800,
  customer: "cus_123",
  metadata: { userId: "user-1" },
};
const patch = profileFromStripeSubscription(stripeSub);
assert.equal(patch.is_subscribed, true);
assert.equal(patch.subscription_status, "trialing");
assert.equal(patch.stripe_customer_id, "cus_123");
assert.equal(patch.trial_ends_at, new Date(1763164800 * 1000).toISOString());
assert.equal(userIdFromStripeObject(stripeSub), "user-1");
assert.equal(userIdFromStripeObject({ client_reference_id: "user-2" }), "user-2");

const fromSession = profileFromCompletedCheckout(
  { customer: "cus_9", status: "complete" },
  null,
);
assert.equal(fromSession.is_subscribed, true);
assert.equal(fromSession.stripe_customer_id, "cus_9");

const activeApple = entitlementFromTransaction({
  bundleId: "com.partiqule.app",
  productId: "com.partiqule.app.premium.monthly",
  expiresDate: now + 10 * 24 * 60 * 60 * 1000,
  originalTransactionId: "1000001",
  offerType: 1,
}, now);
assert.equal(activeApple.entitled, true);
assert.equal(activeApple.status, "trialing");

const forgedShape = entitlementFromTransaction({
  bundleId: "com.partiqule.app",
  productId: "com.partiqule.app.premium.monthly",
  expiresDate: now + 1000,
  revocationDate: now - 1000,
  originalTransactionId: "1000002",
}, now);
assert.equal(forgedShape.entitled, false);
assert.equal(forgedShape.status, "revoked");

const wrongProduct = entitlementFromTransaction({
  bundleId: "com.partiqule.app",
  productId: "com.other.app",
  expiresDate: now + 1000,
}, now);
assert.equal(wrongProduct.ok, false);

const expiredNote = entitlementFromNotification({
  notificationType: "EXPIRED",
  transaction: {
    bundleId: "com.partiqule.app",
    productId: "com.partiqule.app.premium.monthly",
    expiresDate: now + 1000,
    originalTransactionId: "1000003",
  },
}, now);
assert.equal(expiredNote.entitled, false);
assert.equal(expiredNote.status, "expired");

const refundNote = entitlementFromNotification({
  notificationType: "REFUND",
  transaction: {
    bundleId: "com.partiqule.app",
    productId: "com.partiqule.app.premium.monthly",
    expiresDate: now + 1000,
    originalTransactionId: "1000004",
  },
}, now);
assert.equal(refundNote.status, "revoked");
assert.equal(refundNote.entitled, false);

const grace = entitlementFromNotification({
  notificationType: "DID_FAIL_TO_RENEW",
  subtype: "GRACE_PERIOD",
  gracePeriodExpiresDate: now + 5 * 24 * 60 * 60 * 1000,
  transaction: {
    bundleId: "com.partiqule.app",
    productId: "com.partiqule.app.premium.monthly",
    expiresDate: now - 1000,
    originalTransactionId: "1000005",
  },
}, now);
assert.equal(grace.entitled, true);
assert.equal(grace.status, "past_due");

const renewed = entitlementFromNotification({
  notificationType: "DID_RENEW",
  transaction: {
    bundleId: "com.partiqule.app",
    productId: "com.partiqule.app.premium.monthly",
    expiresDate: now + 30 * 24 * 60 * 60 * 1000,
    originalTransactionId: "1000006",
  },
}, now);
assert.equal(renewed.entitled, true);
assert.equal(renewed.status, "active");
const cols = columnsFromAppleEntitlement(renewed);
assert.equal(cols.is_subscribed, true);
assert.equal(cols.trial_ends_at, null);

assert.equal(entitlementFromNotification({ notificationType: "TEST" }, now).ignore, true);

console.log("entitlements tests passed");
