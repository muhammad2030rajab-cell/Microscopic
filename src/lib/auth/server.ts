/**
 * Self-hosted Better Auth for THIS app (server-only).
 *
 * The app runs its own Better Auth at `/api/auth/*`, so the session cookie
 * stays on this app's own origin. Sign-in is local email/password only
 * (toggled via `./email-password`) — no external identity broker, no
 * federated OAuth, no live-preview popup flow.
 *
 * Modes:
 *   - Real deploy (Vercel): `DATABASE_URL` + `BETTER_AUTH_SECRET` +
 *     `BETTER_AUTH_URL` are set, so auth persists in real Postgres.
 *   - Local dev without a database: falls back to the embedded PGLite DB
 *     (wiped on restart) — fine for local trying-out, not for real users.
 *   - Off (`VITE_AUTH_ENABLED=false`): no auth; `requireUserId` resolves a
 *     dev user, and throws fail-closed once `DATABASE_URL` is set (see
 *     `verify.server.ts`).
 *
 * NEVER import this from client code — it pulls in `pg` + server-only
 * Better Auth internals. The client uses `@/lib/auth/client`; components
 * read the user via `@/lib/auth/use-current-user`; server functions get a
 * verified id via `@/lib/auth/middleware`.
 */
import { betterAuth } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { getCookie } from "@tanstack/react-start/server";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { ensureDbReady, getPglite } from "../db";
import { emailAndPasswordEnabled } from "./email-password";
import { pgliteDialect } from "./pglite-dialect";

// Kick (and share) PGLite bootstrap as soon as the auth server module loads.
void ensureDbReady();

/**
 * Local-dev/PGLite secret must outlive module reloads: PGLite (and its
 * session rows) is stored on `globalThis`, so an HMR re-eval of this file
 * must NOT mint a new signing secret or every existing session becomes
 * invalid mid-dev. Process restart clears both the secret and PGLite together.
 */
const globalAuthRef = globalThis as typeof globalThis & {
  __appAuthDevSecret__?: string;
};

function devAuthSecret(): string {
  globalAuthRef.__appAuthDevSecret__ ??= randomBytes(32).toString("hex");
  return globalAuthRef.__appAuthDevSecret__;
}

/** Read an env var, treating empty/whitespace as unset. */
const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

// Explicit off-switch. Set `VITE_AUTH_ENABLED=true` when you provision auth;
// leave unset/"false" to force auth off everywhere (dev user).
const authDisabled = env("VITE_AUTH_ENABLED") === "false";

/** True when real sign-in is active (auth enforced). */
export const authConfigured = !authDisabled && emailAndPasswordEnabled;

// This app's own Better Auth origin. Set `BETTER_AUTH_URL` to your deployed
// public URL (e.g. https://labs.example.com). Falls back to local dev.
const explicitBaseURL = env("BETTER_AUTH_URL");

const LOCAL_DEV_ORIGINS: string[] = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://[::1]:8080",
];

const baseURL = explicitBaseURL ?? "http://localhost:8080";

// Origins Better Auth accepts on credentialed POSTs (sign-up/sign-in, etc.).
// Missing entries here surface as FORBIDDEN "Invalid origin".
const trustedOrigins: string[] = [
  "https://microscopic.vercel.app",
  "https://*.vercel.app",
  ...(explicitBaseURL ? [explicitBaseURL] : []),
  ...LOCAL_DEV_ORIGINS,
];

const databaseUrl = env("DATABASE_URL");

// Real Postgres when `DATABASE_URL` is set (deployed apps), else the app's
// embedded PGLite (local dev) via a Kysely dialect — so Better Auth persists
// to the SAME DB as app data, including email/password users. Both use the
// Better Auth schema from `migrations/auth/0001_auth.sql`.
const database = databaseUrl
  ? new Pool({ connectionString: databaseUrl })
  : {
      dialect: pgliteDialect(() => getPglite()),
      type: "postgres" as const,
    };

/** Session token cookie name. */
export const SESSION_TOKEN_COOKIE = "__Host-app-auth.session_token";

export const auth = betterAuth({
  baseURL,

  // Deployed apps must set BETTER_AUTH_SECRET. Local dev: process-stable
  // secret on globalThis so HMR doesn't invalidate PGLite-backed sessions.
  secret: env("BETTER_AUTH_SECRET") ?? devAuthSecret(),

  database,

  // CSRF / origin check for credentialed auth POSTs (email sign-up/sign-in, …).
  // The deployed Vercel origin is explicitly trusted above.
  trustedOrigins,

  // Cache the session in the short-lived signed `session_data` cookie so reads
  // (incl. the client's `/get-session`) skip the DB — this shrinks the
  // "loading" window and reduces auth flicker. Gate on `isPending`; SSR the session.
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 300,
    },
  },

  // Local email/password — toggled only via `./email-password` (not a plugin).
  ...(emailAndPasswordEnabled
    ? {
        emailAndPassword: {
          enabled: true,
        },
      }
    : {}),

  // `__Host-` prefixed cookies: the browser REFUSES any same-named cookie that
  // carries a `Domain` attribute — an extra hardening layer against cookie
  // injection from a compromised subdomain. Requires Secure + Path=/ + no
  // Domain, so we drop Better Auth's auto `__Secure-` prefix
  // (`useSecureCookies: false`) and set Secure + the names ourselves.
  // (Browsers allow Secure cookies on `http://localhost`, so local dev still works.)
  advanced: {
    useSecureCookies: false,

    defaultCookieAttributes: {
      secure: true,
      sameSite: "lax",
      path: "/",
    },

    cookies: {
      session_token: {
        name: SESSION_TOKEN_COOKIE,
      },

      session_data: {
        name: "__Host-app-auth.session_data",
      },

      account_data: {
        name: "__Host-app-auth.account_data",
      },

      dont_remember: {
        name: "__Host-app-auth.dont_remember",
      },
    },
  },

  plugins: [
    // Bridges Better Auth's Set-Cookie into TanStack Start responses. MUST be
    // last so it runs after every other plugin's hooks.
    tanstackStartCookies(),
  ],
});

export function readSessionToken(): string | null {
  return getCookie(SESSION_TOKEN_COOKIE) ?? null;
}
