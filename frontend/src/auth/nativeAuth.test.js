// Run from frontend/: node src/auth/nativeAuth.test.js
import assert from "node:assert/strict";
import {
  parseAuthCallbackUrl,
  authRedirectUrl,
  friendlyAuthError,
  isAppleCancel,
  NATIVE_AUTH_CALLBACK,
} from "./nativeAuth.js";

const recovery = parseAuthCallbackUrl(
  "partiqule://auth/callback#access_token=aaa&refresh_token=bbb&type=recovery"
);
assert.equal(recovery.access_token, "aaa");
assert.equal(recovery.refresh_token, "bbb");
assert.equal(recovery.type, "recovery");
assert.equal(recovery.code, null);

const pkce = parseAuthCallbackUrl("partiqule://auth/callback?code=xyz&type=signup");
assert.equal(pkce.code, "xyz");
assert.equal(pkce.type, "signup");

assert.equal(parseAuthCallbackUrl("https://partiqule.com/reset-password#access_token=aaa"), null);
assert.equal(parseAuthCallbackUrl("partiqule://auth/callback"), null);
assert.equal(parseAuthCallbackUrl(""), null);

assert.equal(authRedirectUrl("recovery", true), NATIVE_AUTH_CALLBACK);
assert.equal(authRedirectUrl("signup", true), NATIVE_AUTH_CALLBACK);
assert.equal(authRedirectUrl("recovery", false), "https://partiqule.com/reset-password");

assert.match(friendlyAuthError("Database error saving new user"), /server setup/i);
assert.match(friendlyAuthError("Email not confirmed"), /Confirm your email/i);
assert.equal(friendlyAuthError("Provider (issuer) is not enabled"), "Apple sign-in is not turned on for this project yet. Use email and password for now.");
assert.equal(isAppleCancel({ message: "The user canceled the authorization attempt." }), true);
assert.equal(isAppleCancel({ message: "network down" }), false);

console.log("nativeAuth tests passed");
