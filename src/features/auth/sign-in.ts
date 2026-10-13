import { LOGIN_URL } from "@/features/api/client";

const attemptKey = "pax:sign-in-attempt";

export function currentSignInUrl() {
  const { pathname, search, hash } = window.location;
  return `${LOGIN_URL}?${new URLSearchParams({ returnTo: pathname + search + hash })}`;
}

export function startSignIn() {
  // Bound automatic navigation if cookies are blocked or a callback cannot
  // restore a session. The visible sign-in link remains available for retry.
  try {
    const age = Date.now() - Number(sessionStorage.getItem(attemptKey));
    if (age >= 0 && age < 15_000) return;
    sessionStorage.setItem(attemptKey, String(Date.now()));
  } catch {
    // Storage is optional; authentication remains in the gateway cookies.
  }
  window.location.replace(currentSignInUrl());
}

export function clearSignInAttempt() {
  try {
    sessionStorage.removeItem(attemptKey);
  } catch {
    // Private browsing can make storage unavailable.
  }
}
