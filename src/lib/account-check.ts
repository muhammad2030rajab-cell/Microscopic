import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";

/**
 * يتنادى من شاشة الدخول بعد فشل تسجيل الدخول فقط، عشان نفرّق بين
 * "لا يوجد حساب" و"كلمة المرور غير صحيحة".
 *
 * تنبيه أمني: ده بيكشف وجود الحساب من عدمه (account enumeration). متحدد بسقف
 * عام بسيط لكل نسخة سيرفر عشان نقلل إساءة الاستخدام؛ لو السقف اتعدّى بنرجع
 * `null` والشاشة بتعرض الرسالة العامة.
 */
const WINDOW_MS = 60_000;
const MAX_CHECKS_PER_WINDOW = 60;
const recentChecks: number[] = [];

function allowCheck(now = Date.now()): boolean {
  while (recentChecks.length && now - recentChecks[0] > WINDOW_MS) recentChecks.shift();
  if (recentChecks.length >= MAX_CHECKS_PER_WINDOW) return false;
  recentChecks.push(now);
  return true;
}

export const accountExists = createServerFn({ method: "POST" }).handler(
  async ({ data }: { data: { email: string } }): Promise<boolean | null> => {
    const email = typeof data?.email === "string" ? data.email.trim().toLowerCase() : "";
    if (!email || email.length > 254) return null;
    if (!allowCheck()) return null;

    const sql = await getSql();
    const rows = await sql<{ id: string }>`
      select id from "user" where lower(email) = ${email} limit 1
    `;
    return rows.length > 0;
  },
);
