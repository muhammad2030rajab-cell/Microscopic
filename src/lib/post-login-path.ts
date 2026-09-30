/**
 * Where a signed-in visitor belongs. One rule, shared by the login form and the
 * welcome page, so a returning user is not asked to sign in again.
 * Pure, no imports.
 */
export type AccessKind = { type: "admin" | "lab" | string };

export function postLoginPath(access: AccessKind | null | undefined): "/admin" | "/lab" | null {
  if (!access) return null;
  if (access.type === "admin") return "/admin";
  if (access.type === "lab") return "/lab";
  return null; // signed in but not linked to an admin or an active lab
}
