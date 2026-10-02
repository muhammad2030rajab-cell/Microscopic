/**
 * أدوات رقم الهاتف: بتقبل أرقام عربية أو إنجليزية، وبتجهّز الرقم لروابط واتساب.
 * الافتراضي مصر (+20) لأن الأرقام المحلية بتبدأ بـ 01.
 */

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EXTENDED_ARABIC_INDIC = "۰۱۲۳۴۵۶۷۸۹";

/** يرجّع الأرقام فقط (بالإنجليزي)، ويشيل المسافات والرموز و + . */
export function phoneDigits(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(EXTENDED_ARABIC_INDIC.indexOf(d)))
    .replace(/\D/g, "");
}

/** رقم صالح = من 10 لـ 15 رقم (يغطي 01xxxxxxxxx والأرقام الدولية). */
export function isValidPhone(raw: string | null | undefined): boolean {
  const digits = phoneDigits(raw);
  return digits.length >= 10 && digits.length <= 15;
}

/** الرقم بصيغة واتساب الدولية بدون + (مثال: 01012345678 ← 201012345678). */
export function toWhatsAppNumber(raw: string | null | undefined): string | null {
  let digits = phoneDigits(raw);
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = `20${digits.slice(1)}`;
  else if (digits.length === 10 && digits.startsWith("1")) digits = `20${digits}`;
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}
