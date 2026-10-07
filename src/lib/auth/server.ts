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
import { APIError, createAuthMiddleware } from "better-auth/api";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { getCookie } from "@tanstack/react-start/server";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { ensureDbReady, getPglite, getSql } from "../db";
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

/** True on a real Vercel deploy (set automatically by Vercel). */
export const isHostedDeploy = process.env.VERCEL === "1";

/**
 * Returns an Arabic/English description of what is missing for a safe hosted
 * deploy, or null when everything required is set. Without BETTER_AUTH_SECRET
 * every serverless instance signs sessions with a different random key (users
 * get "logged in" then bounced back), and without DATABASE_URL the app falls
 * back to a throw-away in-memory database.
 */
export function hostedConfigProblem(): string | null {
  if (!isHostedDeploy) return null;
  const missing = ["BETTER_AUTH_SECRET", "DATABASE_URL"].filter(
    (k) => !process.env[k]?.trim(),
  );
  return missing.length ? `Missing required environment variables on Vercel: ${missing.join(", ")}` : null;
}

{
  const problem = hostedConfigProblem();
  if (problem) console.error(`[auth] ${problem}`);
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
// No `https://*.vercel.app` wildcard: that would trust every other tenant on
// vercel.app. Vercel injects this project's own production/deployment hosts.
const vercelHosts = [env("VERCEL_PROJECT_PRODUCTION_URL"), env("VERCEL_URL")]
  .filter((h): h is string => Boolean(h))
  .map((h) => `https://${h}`);

/**
 * Hub mode: this process is the lab's local server on the Windows PC (see HUB.md).
 * Phones reach it over plain http on the lab Wi-Fi, where a `Secure` / `__Host-`
 * cookie would be refused by the browser, so both are switched off here and ONLY here.
 * Never set HUB_MODE on the cloud deployment.
 */
export const isHubMode = env("HUB_MODE") === "1" && !isHostedDeploy; // never on Vercel

/** Extra origins the hub accepts, e.g. "http://192.168.1.20:8080,http://lab-pc:8080". */
const hubOrigins = (env("HUB_TRUSTED_ORIGINS") ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const trustedOrigins: string[] = [
  "https://microscopic.vercel.app",
  ...(explicitBaseURL ? [explicitBaseURL] : []),
  ...vercelHosts,
  ...LOCAL_DEV_ORIGINS,
  ...(isHubMode ? hubOrigins : []),
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
const cookiePrefix = isHubMode ? "app-auth" : "__Host-app-auth";
export const SESSION_TOKEN_COOKIE = `${cookiePrefix}.session_token`;

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

  // Public sign-up is only for bootstrapping the FIRST platform admin
  // (/admin/setup). After that, accounts are created server-side by admins
  // (auth.api.signUpEmail has no HTTP request, so it is not affected).
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email" || !ctx.request) return;
      let adminExists = true; // fail closed
      try {
        const sql = await getSql();
        const rows = await sql<{ exists: boolean }>`select exists(select 1 from platform_admins) as exists`;
        adminExists = Boolean(rows[0]?.exists);
      } catch (err) {
        // Fail closed, but say why (console only: this file must not import *.server modules).
        console.error("auth.signup_gate_check_failed", String(err));
        adminExists = true;
      }
      if (adminExists) {
        throw new APIError("FORBIDDEN", { message: "Sign-up is disabled" });
      }
    }),
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
      secure: !isHubMode,
      sameSite: "lax",
      path: "/",
    },

    cookies: {
      session_token: {
        name: SESSION_TOKEN_COOKIE,
      },

      session_data: {
        name: `${cookiePrefix}.session_data`,
      },

      account_data: {
        name: `${cookiePrefix}.account_data`,
      },

      dont_remember: {
        name: `${cookiePrefix}.dont_remember`,
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
