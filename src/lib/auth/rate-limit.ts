/**
 * Brute-force protection for the sign-in endpoints (pure, no server imports,
 * so it can be unit-tested with plain `node --test`).
 *
 * Better Auth counts EVERY request to a path per client IP inside a window and
 * answers 429 once `max` is passed. Defaults below: 10 sign-in attempts per
 * 5 minutes per IP (a lab's staff usually share one IP, so it is not tighter),
 * 5 sign-ups per hour, and a generous 300/min for everything else (the client
 * polls /get-session). Tune with env vars, no code change:
 *   AUTH_SIGNIN_MAX, AUTH_SIGNIN_WINDOW_SECONDS
 */

export type RateRule = { window: number; max: number };

const DEFAULT_SIGNIN: RateRule = { window: 300, max: 10 };

/** Positive integer from an env string, else the fallback. */
export function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function signInRule(env: Record<string, string | undefined>): RateRule {
  return {
    window: positiveInt(env.AUTH_SIGNIN_WINDOW_SECONDS, DEFAULT_SIGNIN.window),
    max: positiveInt(env.AUTH_SIGNIN_MAX, DEFAULT_SIGNIN.max),
  };
}

/**
 * `usePostgres`: real Postgres is shared by every serverless instance, so the
 * counters live there (table "rateLimit", migration 0036). The embedded PGLite /
 * local hub is a single process, where in-memory counters are correct and need
 * no table.
 */
export function authRateLimit(env: Record<string, string | undefined>, usePostgres: boolean) {
  return {
    enabled: true, // Better Auth only enables it in production by default
    window: 60,
    max: 300,
    storage: usePostgres ? ("database" as const) : ("memory" as const),
    customRules: {
      "/sign-in/email": signInRule(env),
      "/sign-up/email": { window: 3600, max: 5 },
    } as Record<string, RateRule>,
  };
}

/** Arabic message for a 429 from the auth API; `retryAfter` is in seconds. */
export function rateLimitMessage(retryAfter?: number | string | null): string {
  const secs = Number(retryAfter);
  if (!Number.isFinite(secs) || secs <= 0) {
    return "محاولات دخول كتير. استنى شوية وحاول تاني.";
  }
  const mins = Math.ceil(secs / 60);
  return mins <= 1
    ? "محاولات دخول كتير. حاول تاني بعد دقيقة."
    : `محاولات دخول كتير. حاول تاني بعد ${mins} دقيقة.`;
}
