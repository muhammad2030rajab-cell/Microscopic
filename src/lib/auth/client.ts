import { createAuthClient } from "better-auth/react";

/**
 * Better Auth client for this React SPA (browser-side).
 *
 * Talks to this app's OWN Better Auth at same-origin `/api/auth/*` via the
 * normal session cookie. Local email/password only — see `login.tsx` for the
 * sign-in form (`authClient.signIn.email`).
 *
 * To sign out call `signOut()` below rather than `authClient.signOut()`
 * directly, so redirect happens after the server confirms the session is gone.
 */
export const authClient = createAuthClient();

/**
 * True when sign-in UI should be shown — i.e. whenever `VITE_AUTH_ENABLED` is
 * not `"false"`.
 */
export const authEnabled = import.meta.env.VITE_AUTH_ENABLED !== "false";

/**
 * Sign out of this app's session, then redirect.
 *
 * The session is an HttpOnly cookie only the server can clear, so this
 * rejects if the server never confirms — callers should catch and let the
 * visitor retry (see `UserButton` in `gates.tsx`).
 */
export async function signOut(redirectTo = "/"): Promise<void> {
  const { error } = await authClient.signOut();
  if (error) throw new Error(error.message ?? "Sign-out failed");
  // Forget the offline copy of the lab profile / pages. Reports still waiting
  // to be sent stay on the device, tied to their lab, so nothing is lost.
  const { clearOfflineCaches } = await import("../offline/sync");
  await clearOfflineCaches();
  window.location.href = redirectTo;
}
