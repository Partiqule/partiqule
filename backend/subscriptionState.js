// Pure subscription decisions, split out of server.js so they can be tested
// without booting Express.
//
// A failed profile read must not look like "this person is not subscribed."
// Paying iOS users were shown the paywall, and in the worst case the app
// treated that the same as being signed out, when Supabase blipped.
//
// A stored end date does not cut off a legacy row that has no end date.
// Those rows stay paid. An explicit end date lapses only after a grace
// window, so a late renewal notice does not lock a paying person out the
// morning the period rolls over. Apple billing retry can run about 16 days.

const ENTITLED_STATUSES = new Set(["active", "trialing", "past_due"]);
const ACCESS_GRACE_MS = 16 * 24 * 60 * 60 * 1000;

function emptyState(extra) {
  return {
    status: null,
    trialDaysRemaining: null,
    currentPeriodEnd: null,
    trialEndsAt: null,
    subscriptionEndsAt: null,
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
    trialEndsAt: row.trial_ends_at || null,
    subscriptionEndsAt: row.subscription_ends_at || null,
  };
}

function endStillCovers(iso, nowMs, graceMs) {
  if (!iso) return true;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return true;
  return t + graceMs >= nowMs;
}

function gateDecision(sub, opts) {
  const now = opts && opts.nowMs ? opts.nowMs : Date.now();
  if (sub && sub.readError) {
    return { allowed: true, reason: "subscription_unconfirmed" };
  }
  if (sub && ENTITLED_STATUSES.has(sub.status)) {
    if (sub.status === "trialing") {
      const end = sub.trialEndsAt || sub.currentPeriodEnd;
      // A trial with no end date stays open. A trial whose end has passed
      // does not get the long renewal grace. That grace is for a paid
      // period whose renewal notice is late.
      if (!end || new Date(end).getTime() >= now) {
        return { allowed: true, reason: "ok" };
      }
    } else if (endStillCovers(sub.subscriptionEndsAt, now, ACCESS_GRACE_MS)) {
      return { allowed: true, reason: "ok" };
    }
  }
  if (opts && opts.freeScanAvailable) {
    return { allowed: true, reason: "free_scan" };
  }
  return { allowed: false, reason: "subscription_required" };
}

module.exports = {
  decideSubscription,
  gateDecision,
  ENTITLED_STATUSES,
  ACCESS_GRACE_MS,
};
