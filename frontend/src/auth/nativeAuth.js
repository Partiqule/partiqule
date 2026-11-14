// iOS sign-in helpers.
//
// The Apple app is a Capacitor WKWebView around this same React code.
// Two things in that webview break ordinary Supabase email sign-in:
//
// 1. supabase-js takes a Web Locks lock (navigator.locks) around every
//    auth call. WKWebView's lock implementation often never settles, so
//    the Sign in button stays on "Please wait..." forever.
// 2. The session is stored in localStorage, which iOS can drop. The
//    person signs in, leaves the app, and comes back signed out.
//
// Native sign-in therefore uses an in-process lock and Capacitor
// Preferences. Web keeps the library defaults.
//
// Sign in with Apple is a small local plugin (AuthenticationServices only,
// no Google or Facebook SDK). The identity token is exchanged with
// supabase.auth.signInWithIdToken. Email links come back through the
// partiqule://auth/callback scheme because the app has no universal link.

import { createClient } from "@supabase/supabase-js";

export const NATIVE_AUTH_CALLBACK = "partiqule://auth/callback";

let lockTail = Promise.resolve();

// One-at-a-time lock that does not touch navigator.locks.
export function inProcessLock(_name, _acquireTimeout, fn) {
  const run = lockTail.then(() => fn(), () => fn());
  lockTail = run.then(() => undefined, () => undefined);
  return run;
}

function preferencesStorage() {
  let prefsPromise = null;
  const loadPrefs = () => {
    if (!prefsPromise) {
      prefsPromise = import("@capacitor/preferences")
        .then((mod) => mod.Preferences)
        .catch(() => null);
    }
    return prefsPromise;
  };

  return {
    async getItem(key) {
      const Preferences = await loadPrefs();
      if (Preferences) {
        try {
          const { value } = await Preferences.get({ key });
          if (value != null) return value;
        } catch {}
      }
      // Older builds kept the session in localStorage. Copy it once so a
      // relaunch still finds it after iOS clears the webview store.
      try {
        const legacy = localStorage.getItem(key);
        if (legacy != null && Preferences) {
          try { await Preferences.set({ key, value: legacy }); } catch {}
        }
        return legacy;
      } catch {
        return null;
      }
    },
    async setItem(key, value) {
      const Preferences = await loadPrefs();
      if (Preferences) {
        try {
          await Preferences.set({ key, value });
          return;
        } catch {}
      }
      try { localStorage.setItem(key, value); } catch {}
    },
    async removeItem(key) {
      const Preferences = await loadPrefs();
      if (Preferences) {
        try {
          await Preferences.remove({ key });
          return;
        } catch {}
      }
      try { localStorage.removeItem(key); } catch {}
    },
  };
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
