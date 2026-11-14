// One real score before a card.
//
// A subscribed account never consumes this allowance. A visitor is tracked
// by a guest id the browser stores. A signed-in account is tracked by user
// id, so a new account still gets one score after the visitor score.

const GUEST_ID_RE = /^[A-Za-z0-9_-]{8,80}$/;

function normalizeGuestId(raw) {
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  if (!GUEST_ID_RE.test(id)) return null;
  return id;
}

function decideFreeScan({ entitled, alreadyUsed }) {
  if (entitled) return { allowed: true, reason: "ok", markUsed: false };
  if (!alreadyUsed) return { allowed: true, reason: "free_scan", markUsed: true };
  return { allowed: false, reason: "subscription_required", markUsed: false };
}

function isScoredResult(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  if (body.status === "needs_confirmation" || body.status === "need_better_photo") return false;
  return typeof body.score === "number" || typeof body.overall_score === "number";
}

module.exports = { normalizeGuestId, decideFreeScan, isScoredResult };
