/**
 * Was this failure "the request never got an answer" (offline, dropped
 * connection) as opposed to "the server answered with an error"?
 *
 * Only the first kind may be retried automatically. A server rejection
 * (validation, permissions) will fail again, so it must surface to the user.
 */
export function isNetworkError(err: unknown, online?: boolean): boolean {
  if (online === false) return true;
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; message?: string };
  const msg = String(e.message ?? "");
  if (e.name === "TypeError") return /fetch|network|load failed|connection/i.test(msg);
  return /failed to fetch|networkerror|network request failed|load failed|err_internet_disconnected|econnrefused|econnreset/i.test(
    msg,
  );
}
