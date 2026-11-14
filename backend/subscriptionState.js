// Pure subscription decisions, split out of server.js so they can be tested
// without booting Express.
//
// A failed profile read must not look like "this person is not subscribed."
// Paying iOS users were shown the paywall, and in the worst case the app
// treated that the same as being signed out, when Supabase blipped.

function emptyState(extra) {
  return {
    status: null,
    trialDaysRemaining: null,
    currentPeriodEnd: null,
    ...(extra || {}),
  };
}

function decideSubscription(row, error, nowMs) {
  if (error) {
    // PostgREST "no rows" is a real answer: this account has no profile.
    if (error.code === "PGRST116") return emptyState();
    return emptyState({ readError: true });
  }
  if (!row) return emptyState();

  let status = row.subscription_status || null;
  // Paid rows written before subscription_status existed, or written by a
  // path that only flipped the boolean. Treat those as active.
  if (!status && row.is_subscribed === true) status = "active";

  let trialDaysRemaining = null;
  if (status === "trialing" && row.trial_ends_at) {
    const ms = new Date(row.trial_ends_at).getTime() - (nowMs || Date.now());
    trialDaysRemaining = Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  }
  return {
    status,
    trialDaysRemaining,
    currentPeriodEnd: row.trial_ends_at || row.subscription_ends_at || null,
  };
}

function gateDecision(sub) {
  if (sub && sub.readError) {
    return { allowed: true, reason: "subscription_unconfirmed" };
  }
  if (sub && (sub.status === "trialing" || sub.status === "active")) {
    return { allowed: true, reason: "ok" };
  }
  return { allowed: false, reason: "subscription_required" };
}

module.exports = { decideSubscription, gateDecision };
