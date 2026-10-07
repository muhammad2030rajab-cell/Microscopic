/** Pure rules for platform invitation codes (no imports: unit-tested with plain node). */

export const INVITE_LABEL_MAX = 60;
export const INVITE_MAX_USES = 100;
export const INVITE_MAX_DAYS = 365;

export type InviteStatus = "active" | "used_up" | "expired" | "revoked";

export function inviteStatus(
  invite: { uses: number; maxUses: number; expiresAt: Date | string | null; revokedAt: Date | string | null },
  now: Date = new Date(),
): InviteStatus {
  if (invite.revokedAt) return "revoked";
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() <= now.getTime()) return "expired";
  if (invite.uses >= invite.maxUses) return "used_up";
  return "active";
}

export type NewInvite = { ok: true; label: string; maxUses: number; expiresInDays: number | null } | { ok: false; error: string };

export function validateNewInvite(input: { label?: unknown; maxUses?: unknown; expiresInDays?: unknown }): NewInvite {
  const label = typeof input.label === "string" ? input.label.replace(/\s+/g, " ").trim() : "";
  if (label.length > INVITE_LABEL_MAX) return { ok: false, error: `الاسم أطول من ${INVITE_LABEL_MAX} حرف` };
  const maxUses = Number(input.maxUses ?? 1);
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > INVITE_MAX_USES) return { ok: false, error: `عدد المرات من 1 إلى ${INVITE_MAX_USES}` };
  let expiresInDays: number | null = null;
  if (input.expiresInDays !== null && input.expiresInDays !== undefined && input.expiresInDays !== "") {
    const d = Number(input.expiresInDays);
    if (!Number.isInteger(d) || d < 1 || d > INVITE_MAX_DAYS) return { ok: false, error: `مدة الصلاحية من 1 إلى ${INVITE_MAX_DAYS} يوم` };
    expiresInDays = d;
  }
  return { ok: true, label, maxUses, expiresInDays };
}

export type NewLabSignup =
  | { ok: true; labName: string; ownerName: string; username: string }
  | { ok: false; error: "LAB_NAME_INVALID" | "OWNER_NAME_TOO_LONG" | "USERNAME_INVALID" };

/** The lab name, the owner's name and username typed on /join. (The password rule lives in password-policy.ts.) */
export function validateNewLab(input: { labName: unknown; ownerName: unknown; username: unknown }): NewLabSignup {
  const labName = typeof input.labName === "string" ? input.labName.replace(/\s+/g, " ").trim() : "";
  if (labName.length < 2 || labName.length > 80) return { ok: false, error: "LAB_NAME_INVALID" };
  const ownerName = typeof input.ownerName === "string" ? input.ownerName.replace(/\s+/g, " ").trim() : "";
  if (ownerName.length > 60) return { ok: false, error: "OWNER_NAME_TOO_LONG" };
  const username = typeof input.username === "string" ? input.username.trim().toLowerCase() : "";
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return { ok: false, error: "USERNAME_INVALID" };
  return { ok: true, labName, ownerName, username };
}

const MESSAGES: Record<string, string> = {
  INVITE_CODE_INVALID: "الكود غير صحيح أو انتهت صلاحيته",
  INVITE_TOO_MANY_ATTEMPTS: "محاولات كتير غلط. جرّب بعد شوية",
  LAB_NAME_INVALID: "اسم المعمل من 2 إلى 80 حرف",
  LAB_NAME_TAKEN: "اسم المعمل موجود بالفعل. اكتب اسم مختلف",
  OWNER_NAME_TOO_LONG: "الاسم أطول من 60 حرف",
  USERNAME_INVALID: "اسم المستخدم 3-40 حرف إنجليزي أو أرقام أو ._-",
  USERNAME_TAKEN: "اسم المستخدم مستخدم. اختار غيره",
  SIGNUP_FAILED: "تعذر إنشاء الحساب. جرّب تاني",
};

/** The Arabic message for an error thrown by the invitation functions (password-policy text passes through). */
export function inviteErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error ?? "");
  return MESSAGES[text] ?? (/[\u0600-\u06FF]/.test(text) ? text : MESSAGES.SIGNUP_FAILED);
}
