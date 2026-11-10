"use client";

// Client-side session token holder. The token is an opaque server-issued
// credential for THIS device session; it is the only thing the client ever
// sends. It is never a name or role - attribution is resolved server-side.
// The desktop main window loads the local Next.js HTTP server and uses the
// normal Server Action transport. localStorage persists the opaque bearer
// token across reloads; validity/expiry is always checked on the server.
// This is not protection from same-origin script or local device compromise.

const KEY = "mbm_session_token";
const NAME_KEY = "mbm_session_name";

export function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY);
}

export function setSession(token: string, name: string) {
  window.localStorage.setItem(KEY, token);
  window.localStorage.setItem(NAME_KEY, name);
}

export function getSessionName(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(NAME_KEY);
}

export function clearSession() {
  window.localStorage.removeItem(KEY);
  window.localStorage.removeItem(NAME_KEY);
}
