/** Arabic text for activation errors (safe for the browser). */
export function licenseErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : "";
  const known: Record<string, string> = {
    LICENSE_INVALID: "كود التفعيل غير صحيح. اتأكد إنك نسخته كامل من غير نقص",
    LICENSE_WRONG_DEVICE: "الكود ده متصدّر لجهاز تاني. ابعت رقم الجهاز اللي قدامك للمطوّر عشان يصدر لك كود جديد",
    LICENSE_REVOKED: "الكود ده اتوقف. تواصل مع المطوّر",
    LICENSE_DEVICE_LIMIT: "الكود ده متفعّل بالفعل على جهاز تاني. تواصل مع المطوّر لنقله",
    LICENSE_TOO_MANY_ATTEMPTS: "محاولات كتير غلط. جرّب بعد شوية",
    LICENSE_OFFLINE: "أول تفعيل محتاج اتصال بالإنترنت. اتأكد من النت وجرّب تاني",
    LICENSE_SERVER_NOT_SET: "إعدادات التفعيل ناقصة في النسخة دي. تواصل مع المطوّر",
    LICENSE_BAD_REPLY: "رد غير متوقع من سيرفر التفعيل. جرّب تاني",
  };
  const code = Object.keys(known).find((k) => text.includes(k));
  return code ? known[code] : /[\u0600-\u06FF]/.test(text) ? text : "تعذر التفعيل. جرّب تاني";
}
