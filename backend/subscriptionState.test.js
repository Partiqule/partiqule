const assert = require("node:assert/strict");
const { decideSubscription, gateDecision } = require("./subscriptionState");

const now = Date.parse("2026-11-14T00:00:00Z");

const active = decideSubscription({
  subscription_status: "active",
  is_subscribed: true,
  trial_ends_at: null,
  subscription_ends_at: null,
}, null, now);
assert.equal(active.status, "active");
assert.equal(gateDecision(active).allowed, true);

// The May 2026 incident: paid flag set, status column still null.
const legacyPaid = decideSubscription({
  subscription_status: null,
  is_subscribed: true,
}, null, now);
assert.equal(legacyPaid.status, "active");
assert.equal(gateDecision(legacyPaid).reason, "ok");

const unpaid = decideSubscription({
  subscription_status: null,
  is_subscribed: false,
}, null, now);
assert.equal(unpaid.status, null);
assert.equal(gateDecision(unpaid).allowed, false);
assert.equal(gateDecision(unpaid).reason, "subscription_required");

const missing = decideSubscription(null, { code: "PGRST116", message: "no rows" }, now);
assert.equal(missing.readError, undefined);
assert.equal(gateDecision(missing).allowed, false);

const blip = decideSubscription(null, { code: "500", message: "timeout" }, now);
assert.equal(blip.readError, true);
assert.equal(gateDecision(blip).allowed, true);
assert.equal(gateDecision(blip).reason, "subscription_unconfirmed");

const trialing = decideSubscription({
  subscription_status: "trialing",
  is_subscribed: true,
  trial_ends_at: "2026-11-16T00:00:00Z",
}, null, now);
assert.equal(trialing.status, "trialing");
assert.equal(trialing.trialDaysRemaining, 2);
assert.equal(gateDecision(trialing).allowed, true);

console.log("subscriptionState tests passed");
