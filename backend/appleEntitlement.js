// Pure Apple entitlement decisions. Signature checks live in appleVerify.js.
// These functions only see a transaction Apple has already verified.

const BUNDLE_ID = "com.partiqule.app";
const PRODUCT_ID = "com.partiqule.app.premium.monthly";

const REVOKE_TYPES = new Set(["EXPIRED", "GRACE_PERIOD_EXPIRED", "REFUND", "REVOKE"]);

function iso(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function entitlementFromTransaction(tx, nowMs) {
  const now = nowMs || Date.now();
  if (!tx || typeof tx !== "object") return { ok: false, reason: "missing_transaction" };
  if (tx.bundleId && tx.bundleId !== BUNDLE_ID) {
    return { ok: false, reason: "wrong_bundle" };
  }
  if (tx.productId && tx.productId !== PRODUCT_ID) {
    return { ok: false, reason: "wrong_product" };
  }
  const expiresAt = iso(tx.expiresDate);
  const originalTransactionId = tx.originalTransactionId || null;
  if (tx.revocationDate) {
    return {
      ok: true,
      entitled: false,
      status: "revoked",
      expiresAt,
      originalTransactionId,
    };
  }
  const trialing = tx.offerType === 1 || tx.offerDiscountType === "FREE_TRIAL";
  if (typeof tx.expiresDate === "number" && tx.expiresDate <= now) {
    return {
      ok: true,
      entitled: false,
      status: "expired",
      expiresAt,
      originalTransactionId,
    };
  }
  return {
    ok: true,
    entitled: true,
    status: trialing ? "trialing" : "active",
    expiresAt,
    originalTransactionId,
  };
}

function entitlementFromNotification(input, nowMs) {
  const note = input || {};
  if (note.notificationType === "TEST") return { ok: true, ignore: true };
  if (!note.transaction) return { ok: true, ignore: true };
  const base = entitlementFromTransaction(note.transaction, nowMs);
  if (!base.ok) return base;
  const type = note.notificationType;
  if (type === "DID_FAIL_TO_RENEW" && note.subtype === "GRACE_PERIOD") {
    const graceEnd = iso(note.gracePeriodExpiresDate) || base.expiresAt;
    return { ...base, entitled: true, status: "past_due", expiresAt: graceEnd, ignore: false };
  }
  if (REVOKE_TYPES.has(type) || type === "DID_FAIL_TO_RENEW") {
    const status = type === "REFUND" || type === "REVOKE" ? "revoked" : "expired";
    return { ...base, entitled: false, status, ignore: false };
  }
  return { ...base, ignore: false };
}

function columnsFromAppleEntitlement(ent) {
  return {
    subscription_status: ent.status,
    is_subscribed: !!ent.entitled,
    subscription_ends_at: ent.expiresAt || null,
    trial_ends_at: ent.status === "trialing" ? (ent.expiresAt || null) : null,
  };
}

module.exports = {
  BUNDLE_ID,
  PRODUCT_ID,
  entitlementFromTransaction,
  entitlementFromNotification,
  columnsFromAppleEntitlement,
};
