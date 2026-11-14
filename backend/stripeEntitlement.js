// Pure Stripe decisions. The server calls Stripe. These functions decide
// what to write and which subscriptions to cancel.

const LIVE_STATUSES = new Set(["active", "trialing", "past_due"]);
const CANCEL_ON_DELETE = new Set([
  "active", "trialing", "past_due", "unpaid", "paused", "incomplete",
]);

function planCheckout(subscriptions) {
  const live = (subscriptions || []).filter((s) => s && LIVE_STATUSES.has(s.status));
  if (live.length > 0) return { action: "portal", reason: "already_subscribed" };
  return { action: "checkout", offerTrial: !(subscriptions || []).length };
}

function newerLiveSubscriptionIds(subscriptions) {
  const live = (subscriptions || [])
    .filter((s) => s && LIVE_STATUSES.has(s.status))
    .slice()
    .sort((a, b) => (a.created || 0) - (b.created || 0));
  if (live.length <= 1) return [];
  return live.slice(1).map((s) => s.id).filter(Boolean);
}

function subscriptionIdsToCancelOnDelete(subscriptions) {
  return (subscriptions || [])
    .filter((s) => s && CANCEL_ON_DELETE.has(s.status) && s.id)
    .map((s) => s.id);
}

function userIdFromStripeObject(obj) {
  if (!obj || typeof obj !== "object") return null;
  const id = obj.metadata && obj.metadata.userId;
  if (typeof id === "string" && id) return id;
  if (typeof obj.client_reference_id === "string" && obj.client_reference_id) {
    return obj.client_reference_id;
  }
  return null;
}

function customerIdFromStripe(value) {
  if (typeof value === "string" && value) return value;
  if (value && typeof value.id === "string") return value.id;
  return null;
}

function profileFromStripeSubscription(sub) {
  const status = (sub && sub.status) || null;
  const entitled = status === "active" || status === "trialing" || status === "past_due";
  const trialEnd = sub && sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;
  const periodEnd = sub && sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null;
  return {
    subscription_status: status,
    is_subscribed: entitled,
    trial_ends_at: status === "trialing" ? trialEnd : null,
    subscription_ends_at: periodEnd,
    stripe_customer_id: customerIdFromStripe(sub && sub.customer),
  };
}

// A completed Checkout session means the person finished paying or
// starting the trial. Write that even when the subscription event has
// not arrived yet. A later subscription event overwrites this with the
// precise status.
function profileFromCompletedCheckout(session, subscription) {
  if (subscription) return profileFromStripeSubscription(subscription);
  return {
    subscription_status: "active",
    is_subscribed: true,
    trial_ends_at: null,
    subscription_ends_at: null,
    stripe_customer_id: customerIdFromStripe(session && session.customer),
  };
}

module.exports = {
  LIVE_STATUSES,
  planCheckout,
  newerLiveSubscriptionIds,
  subscriptionIdsToCancelOnDelete,
  userIdFromStripeObject,
  profileFromStripeSubscription,
  profileFromCompletedCheckout,
};
