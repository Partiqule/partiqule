// iOS session helpers.
//
// Paying subscribers were coming back to the iPhone app signed out.
// The app is a Capacitor web view, and three things in that web view
// caused it:
//
// 1. The session lived in localStorage. iOS drops that store when it
//    reclaims the web view, so the next launch had no refresh token.
// 2. Supabase refreshes the access token on a timer and deletes the
//    saved session when a refresh fails. The web view's visibility
//    events are a bad signal for "the app is in the foreground," so a
//    refresh could run while the phone was asleep, fail, and wipe a
//    good login. A second refresh that still holds the previous
//    refresh token does the same thing, because Supabase rotates that
//    token and then rejects the old one.
// 3. supabase-js also takes a browser lock (navigator.locks) around
//    every auth call. That lock often never finishes in this web view,
//    so Sign in sits on "Please wait..." and a refresh can stall until
//    the library gives up and clears the session.
//
// Native sign-in stores the session in Capacitor Preferences, pauses
// token refresh while the app is backgrounded, and keeps one backup of
// the last saved session so a single failed refresh can be undone.
// A real Sign out deletes both copies.
//
// A billing lookup error used to be stored as "not subscribed." That
// path is in backend/subscriptionState.js. It does not clear the session.
//
// Sign in with Apple is a small local plugin. Email links come back
// through partiqule://auth/callback.

import { createClient } from "@supabase/supabase-js";

export const NATIVE_AUTH_CALLBACK = "partiqule://auth/callback";
const BACKUP_SUFFIX = "::backup";

let lockTail = Promise.resolve();
let explicitSignOut = false;

// One-at-a-time lock that does not touch navigator.locks.
export function inProcessLock(_name, _acquireTimeout, fn) {
  const run = lockTail.then(() => fn(), () => fn());
  lockTail = run.then(() => undefined, () => undefined);
  return run;
}

export function noteExplicitSignOut() { explicitSignOut = true; }
export function clearExplicitSignOut() { explicitSignOut = false; }

export function refreshActionForAppState(isActive) {
  return isActive ? "start" : "stop";
}

function readLegacy(key) {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLegacy(key, value) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, value);
  } catch {}
}

// prefs: { get(key) -> string|null, set(key, value), remove(key) }
export function createDurableAuthStorage(prefs, { isExplicitSignOut } = {}) {
  const explicit = () => (isExplicitSignOut ? isExplicitSignOut() : explicitSignOut);
  const backupKey = (key) => key + BACKUP_SUFFIX;

  return {
    async getItem(key) {
      try {
        const primary = await prefs.get(key);
        if (primary != null) return primary;
        if (!explicit()) {
          const backup = await prefs.get(backupKey(key));
          if (backup != null) {
            await prefs.set(key, backup);
            return backup;
          }
        }
      } catch {}
      const legacy = readLegacy(key);
      if (legacy != null && !explicit()) {
        try { await prefs.set(key, legacy); } catch {}
      }
      return legacy;
    },
    async setItem(key, value) {
      try {
        await prefs.set(key, value);
        // The value just written is the source of truth. A backup of an
        // older token must not be restored over it.
        await prefs.remove(backupKey(key));
        return;
      } catch {}
      writeLegacy(key, value);
    },
    async removeItem(key) {
      if (explicit()) {
        try {
          await prefs.remove(key);
          await prefs.remove(backupKey(key));
        } catch {}
        try { localStorage.removeItem(key); } catch {}
        return;
      }
      try {
        const existing = await prefs.get(key);
        const backup = await prefs.get(backupKey(key));
        if (existing != null && existing === backup) {
          // Same token already failed once. Keeping it would loop.
          await prefs.remove(key);
          await prefs.remove(backupKey(key));
          return;
        }
        if (existing != null) await prefs.set(backupKey(key), existing);
        await prefs.remove(key);
      } catch {}
    },
  };
}

function capacitorPrefs() {
  let prefsPromise = null;
  const load = () => {
    if (!prefsPromise) {
      prefsPromise = import("@capacitor/preferences")
        .then((mod) => mod.Preferences)
        .catch(() => null);
    }
    return prefsPromise;
  };
  return {
    async get(key) {
      const Preferences = await load();
      if (!Preferences) return null;
      const { value } = await Preferences.get({ key });
      return value ?? null;
    },
    async set(key, value) {
      const Preferences = await load();
      if (!Preferences) throw new Error("Preferences unavailable");
      await Preferences.set({ key, value });
    },
    async remove(key) {
      const Preferences = await load();
      if (!Preferences) return;
      await Preferences.remove({ key });
    },
  };
}

function preferencesStorage() {
  return createDurableAuthStorage(capacitorPrefs());
}

export function createPartiquleSupabase(url, key, { isNative } = {}) {
  if (!isNative) return createClient(url, key);
  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // The native app boots at capacitor://localhost, not on the email link.
      // Callbacks are handled from the partiqule:// URL instead.
      detectSessionInUrl: false,
      storage: preferencesStorage(),
      lock: inProcessLock,
    },
  });
}

export function authRedirectUrl(kind, isNative) {
  if (isNative) return NATIVE_AUTH_CALLBACK;
  const origin = (typeof window !== "undefined" && window.location && window.location.origin)
    ? window.location.origin
    : "https://partiqule.com";
  return kind === "recovery" ? `${origin}/reset-password` : `${origin}/`;
}

// Pull tokens out of a partiqule://auth/callback URL.
// Supabase may put them in the hash (implicit) or the query (PKCE code).
export function parseAuthCallbackUrl(raw) {
  if (!raw || typeof raw !== "string") return null;
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "partiqule:") return null;
  if (url.hostname !== "auth") return null;

  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  const hashParams = new URLSearchParams(hash);
  const pick = (name) => hashParams.get(name) || url.searchParams.get(name);
  const parsed = {
    access_token: pick("access_token"),
    refresh_token: pick("refresh_token"),
    code: pick("code"),
    type: pick("type"),
    error: pick("error_description") || pick("error"),
  };
  if (!parsed.access_token && !parsed.refresh_token && !parsed.code && !parsed.error && !parsed.type) {
    return null;
  }
  return parsed;
}

export function friendlyAuthError(message) {
  const text = String(message || "");
  if (/database error saving new user/i.test(text)) {
    return "The account could not be saved. That is a server setup problem, not your password. Try again in a few minutes.";
  }
  if (/email not confirmed/i.test(text)) {
    return "Confirm your email first. Open the message from Partiqule, then come back and sign in.";
  }
  if (/invalid login credentials/i.test(text)) {
    return "That email and password do not match.";
  }
  if (/provider .*not enabled|unsupported provider|validation failed/i.test(text)) {
    return "Apple sign-in is not turned on for this project yet. Use email and password for now.";
  }
  return text || "Something went wrong. Please try again.";
}

export function isAppleCancel(error) {
  const text = `${error?.message || ""} ${error?.code || ""} ${error?.errorMessage || ""}`;
  return /cancel/i.test(text);
}

export async function signInWithAppleNative(supabase) {
  const { PartiquleAppleSignIn } = await import("partiqule-apple-sign-in");
  const res = await PartiquleAppleSignIn.authorize();
  const idToken = res?.idToken;
  if (!idToken) {
    throw new Error("Apple did not return a sign-in token.");
  }
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: idToken,
  });
  if (error) throw error;
  const displayName = [res.givenName, res.familyName].filter(Boolean).join(" ").trim();
  return { user: data.user, session: data.session, displayName };
}

// Returns an unsubscribe function. No-ops when the App plugin is missing.
export async function listenForAuthCallback(supabase, onEvent) {
  const { App } = await import("@capacitor/app");
  const handle = await App.addListener("appUrlOpen", async ({ url }) => {
    const parsed = parseAuthCallbackUrl(url);
    if (!parsed) return;
    if (parsed.error) {
      onEvent({ type: "error", message: friendlyAuthError(parsed.error) });
      return;
    }
    try {
      if (parsed.code) {
        const { error } = await supabase.auth.exchangeCodeForSession(parsed.code);
        if (error) throw error;
      } else if (parsed.access_token && parsed.refresh_token) {
        const { error } = await supabase.auth.setSession({
          access_token: parsed.access_token,
          refresh_token: parsed.refresh_token,
        });
        if (error) throw error;
      }
      onEvent({ type: parsed.type || "signed_in" });
    } catch (error) {
      onEvent({ type: "error", message: friendlyAuthError(error?.message) });
    }
  });
  return () => { handle.remove(); };
}

// Marks the following removeItem calls as a real sign-out so the backup
// copy is deleted too. The flag is cleared when this function returns,
// which is after supabase has already removed the stored session.
export async function signOutPartiqule(supabase) {
  noteExplicitSignOut();
  try {
    await supabase.auth.signOut();
  } finally {
    clearExplicitSignOut();
  }
}

// WKWebView visibility is not a reliable "app is in the foreground" signal.
// Capacitor's appStateChange is. startAutoRefresh also turns off the
// library's own visibility watcher, so the two cannot both refresh and
// invalidate the refresh token.
export async function bindNativeAuthLifecycle(supabase) {
  const { App } = await import("@capacitor/app");
  const apply = (isActive) => {
    if (refreshActionForAppState(isActive) === "start") return supabase.auth.startAutoRefresh();
    return supabase.auth.stopAutoRefresh();
  };
  const handle = await App.addListener("appStateChange", ({ isActive }) => {
    apply(!!isActive).catch(() => {});
  });
  await apply(true);
  return () => { handle.remove(); };
}
