/**
 * Single source of truth for the password rule, shared by client-side hints
 * (admin.setup.tsx, team.tsx) and server-side enforcement (platform-admin.ts,
 * lab-users.ts). Previously each of those four places hard-coded its own
 * "8 characters" check independently — easy to update one and miss another,
 * and 8 plain characters is weak for accounts that can reach real patient
 * data. `minLength` on an <input> is a UX hint only (trivially bypassed), so
 * the server-side check in `passwordPolicyError` is what actually matters.
 */
export const PASSWORD_MIN_LENGTH = 10;

export const PASSWORD_HINT = `${PASSWORD_MIN_LENGTH} أحرف على الأقل، حروف وأرقام معًا`;

/** Returns an Arabic error message if the password fails the policy, or null if it passes. */
export function passwordPolicyError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `كلمة المرور يجب ألا تقل عن ${PASSWORD_MIN_LENGTH} أحرف`;
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "كلمة المرور يجب أن تحتوي على حروف وأرقام معًا";
  }
  return null;
}
