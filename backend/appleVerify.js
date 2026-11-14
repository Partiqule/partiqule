// Verifies App Store signed transactions and App Store Server Notifications V2.
// The signature is checked against Apple's public root certificates. The
// words inside an unverified receipt are never treated as a purchase.
//
// APPLE_ISSUER_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY are optional. They
// are only used when the phone sends a transaction id without the signed
// transaction, and the server has to ask Apple for the signed copy.
// Missing keys reject that one request. They do not change anyone who is
// already paid.

const fs = require("fs");
const path = require("path");
const { BUNDLE_ID } = require("./appleEntitlement");

function loadRoots() {
  const dir = path.join(__dirname, "certs");
  return ["AppleRootCA-G3.cer", "AppleRootCA-G2.cer"].map((name) => {
    return fs.readFileSync(path.join(dir, name));
  });
}

function appAppleId() {
  const raw = process.env.APPLE_APP_APPLE_ID || "6761738421";
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function bundleId() {
  return process.env.APPLE_BUNDLE_ID || BUNDLE_ID;
}

function isJws(value) {
  return typeof value === "string" && value.split(".").length === 3 && value.length > 20;
}

function apiCredentials() {
  const issuerId = process.env.APPLE_ISSUER_ID || "";
  const keyId = process.env.APPLE_KEY_ID || "";
  const privateKey = (process.env.APPLE_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
  if (!issuerId || !keyId || !privateKey) return null;
  return { issuerId, keyId, privateKey };
}

async function verifyWithEitherEnvironment(fn) {
  const { SignedDataVerifier, Environment } = require("@apple/app-store-server-library");
  const roots = loadRoots();
  const attempts = [
    [Environment.PRODUCTION, appAppleId()],
    [Environment.SANDBOX, undefined],
  ];
  let lastStatus = null;
  for (const [environment, appleId] of attempts) {
    try {
      const verifier = new SignedDataVerifier(roots, false, environment, bundleId(), appleId);
      const value = await fn(verifier);
      return { ok: true, value, environment };
    } catch (e) {
      lastStatus = e && (e.status || e.message) ? String(e.status || e.message).slice(0, 80) : "verification_failed";
    }
  }
  return { ok: false, reason: "verification_failed", detail: lastStatus };
}

async function verifySignedTransaction(signedTransaction) {
  if (!isJws(signedTransaction)) return { ok: false, reason: "signed_transaction_required" };
  const result = await verifyWithEitherEnvironment((verifier) => {
    return verifier.verifyAndDecodeTransaction(signedTransaction);
  });
  if (!result.ok) return result;
  return { ok: true, transaction: result.value, environment: result.environment };
}

async function verifyNotification(signedPayload) {
  if (!isJws(signedPayload)) return { ok: false, reason: "signed_payload_required" };
  const note = await verifyWithEitherEnvironment((verifier) => {
    return verifier.verifyAndDecodeNotification(signedPayload);
  });
  if (!note.ok) return note;
  const decoded = note.value || {};
  let transaction = null;
  let gracePeriodExpiresDate = null;
  const signedTx = decoded.data && decoded.data.signedTransactionInfo;
  if (signedTx) {
    const tx = await verifySignedTransaction(signedTx);
    if (!tx.ok) return tx;
    transaction = tx.transaction;
  }
  const signedRenewal = decoded.data && decoded.data.signedRenewalInfo;
  if (signedRenewal) {
    const renewal = await verifyWithEitherEnvironment((verifier) => {
      return verifier.verifyAndDecodeRenewalInfo(signedRenewal);
    });
    if (renewal.ok && renewal.value) gracePeriodExpiresDate = renewal.value.gracePeriodExpiresDate || null;
  }
  return {
    ok: true,
    notificationType: decoded.notificationType || null,
    subtype: decoded.subtype || null,
    transaction,
    gracePeriodExpiresDate,
  };
}

async function fetchSignedTransaction(transactionId) {
  const creds = apiCredentials();
  if (!creds) return { ok: false, reason: "api_not_configured" };
  if (!transactionId || typeof transactionId !== "string") {
    return { ok: false, reason: "missing_transaction_id" };
  }
  const { AppStoreServerAPIClient, Environment } = require("@apple/app-store-server-library");
  for (const environment of [Environment.PRODUCTION, Environment.SANDBOX]) {
    try {
      const client = new AppStoreServerAPIClient(
        creds.privateKey,
        creds.keyId,
        creds.issuerId,
        bundleId(),
        environment,
      );
      const info = await client.getTransactionInfo(transactionId);
      if (info && info.signedTransactionInfo) {
        return { ok: true, signedTransactionInfo: info.signedTransactionInfo };
      }
    } catch {
      // The other environment is the one that owns this transaction id.
    }
  }
  return { ok: false, reason: "transaction_not_found" };
}

async function resolveSignedTransaction(receipt, transactionId) {
  if (isJws(receipt)) return verifySignedTransaction(receipt);
  if (transactionId) {
    const fetched = await fetchSignedTransaction(String(transactionId));
    if (!fetched.ok) return fetched;
    return verifySignedTransaction(fetched.signedTransactionInfo);
  }
  return { ok: false, reason: "signed_transaction_required" };
}

module.exports = {
  isJws,
  verifySignedTransaction,
  verifyNotification,
  fetchSignedTransaction,
  resolveSignedTransaction,
};
