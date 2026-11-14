// Run from frontend/: node src/auth/nativeAuth.test.js
import assert from "node:assert/strict";
import {
  parseAuthCallbackUrl,
  authRedirectUrl,
  friendlyAuthError,
  isAppleCancel,
  createDurableAuthStorage,
  refreshActionForAppState,
  noteExplicitSignOut,
  clearExplicitSignOut,
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

function memoryPrefs() {
  const map = new Map();
  return {
    get: async (key) => (map.has(key) ? map.get(key) : null),
    set: async (key, value) => { map.set(key, value); },
    remove: async (key) => { map.delete(key); },
    map,
  };
}

clearExplicitSignOut();
const prefs = memoryPrefs();
const storage = createDurableAuthStorage(prefs);

await storage.setItem("sb-session", "token-A");
assert.equal(await storage.getItem("sb-session"), "token-A");

// A failed refresh deletes the key. The last value is kept once.
await storage.removeItem("sb-session");
assert.equal(prefs.map.has("sb-session"), false);
assert.equal(await storage.getItem("sb-session"), "token-A");

// The same token failing a second time is a dead token. Drop it.
await storage.removeItem("sb-session");
assert.equal(await storage.getItem("sb-session"), null);

// A newer token saved and then deleted (the refresh-rotation race) comes back.
await storage.setItem("sb-session", "token-B");
await storage.setItem("sb-session", "token-C");
await storage.removeItem("sb-session");
assert.equal(await storage.getItem("sb-session"), "token-C");

// A real sign-out deletes the backup too.
noteExplicitSignOut();
await storage.removeItem("sb-session");
clearExplicitSignOut();
assert.equal(await storage.getItem("sb-session"), null);
assert.equal(prefs.map.has("sb-session::backup"), false);

assert.equal(refreshActionForAppState(true), "start");
assert.equal(refreshActionForAppState(false), "stop");

console.log("nativeAuth tests passed");
