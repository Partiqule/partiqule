const assert = require("node:assert/strict");
const { verifySignedTransaction, verifyNotification, isJws } = require("./appleVerify");

async function main() {
  assert.equal(isJws("not-a-token"), false);
  assert.equal(isJws("headerheader.payloadpayload.signaturesign"), true);

  // A made-up token has no Apple certificate chain. It must not decode
  // into a purchase.
  const forged = await verifySignedTransaction("headerheader.payloadpayload.signaturesign");
  assert.equal(forged.ok, false);
  assert.equal(forged.transaction, undefined);

  const note = await verifyNotification("aaaa.bbbb.cccc");
  assert.equal(note.ok, false);

  const missing = await verifySignedTransaction("");
  assert.equal(missing.reason, "signed_transaction_required");

  console.log("appleVerify tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
