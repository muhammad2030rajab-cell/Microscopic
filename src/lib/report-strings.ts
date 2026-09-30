/**
 * Every fixed piece of wording on the printed report, in both languages.
 * Pure, no imports, unit-testable with plain node.
 *
 *  "bi" — English with the Arabic beside it (the original layout)
 *  "en" — English only
 *  "ar" — Arabic only (test names stay in English: the catalog has no
 *         Arabic names, and lab reports conventionally keep them that way)
 */

export type ReportLang = "bi" | "en" | "ar";

export const REPORT_LANGS: { value: ReportLang; label: string }[] = [
  { value: "bi", label: "ثنائي" },
  { value: "ar", label: "عربي" },
  { value: "en", label: "English" },
];

export function isReportLang(v: unknown): v is ReportLang {
  return v === "bi" || v === "en" || v === "ar";
}

export interface Pair {
  en: string;
  ar: string;
  /** In "bi" mode show only the English side (as the original report did). */
  biEnOnly?: boolean;
}

const p = (en: string, ar: string, biEnOnly = false): Pair => ({ en, ar, biEnOnly });

export const S = {
  // titles / status
  labReport: p("LABORATORY REPORT", "تقرير معملي", true),
  clinicalSub: p("Clinical Laboratory Medicine", "طب المعامل الإكلينيكي", true),
  finalReport: p("FINAL REPORT", "تقرير نهائي", true),
  prelimReport: p("PRELIMINARY REPORT", "تقرير مبدئي", true),
  approved: p("Approved", "معتمد"),
  notApproved: p("Not yet approved", "غير معتمد"),
  labResults: p("LABORATORY RESULTS", "نتائج التحاليل", true),

  // patient block
  patientName: p("Patient Name", "اسم المريض"),
  patientCode: p("Patient Code", "كود المريض"),
  ageSex: p("Age / Sex", "السن / النوع", true),
  phone: p("Phone", "الهاتف"),
  referredBy: p("Referred By", "الطبيب"),
  requestDate: p("Request Date", "تاريخ الطلب"),
  collectionDate: p("Collection Date", "تاريخ السحب"),
  reportId: p("Report ID", "رقم التقرير"),
  sampleId: p("Sample ID", "رقم العينة"),
  sampleBarcode: p("Sample Barcode", "باركود العينة"),
  years: p("Years", "سنة", true),

  // results table
  test: p("Test", "التحليل"),
  result: p("Result", "النتيجة"),
  flag: p("Flag", "العلامة", true),
  unit: p("Unit", "الوحدة", true),
  reference: p("Reference Interval", "المدى المرجعي"),
  calculated: p("calculated", "محسوب", true),
  forAgeSex: p("for Age & Sex", "حسب السن والنوع", true),
  upTo: p("Up to", "حتى", true),
  lessThan: p("Less than", "أقل من", true),
  moreThan: p("More than", "أكثر من", true),

  // summary strip
  allNormal: p("All results are within the reference range", "جميع النتائج ضمن المدى المرجعي", true),
  criticalWord: p("critical", "حرجة", true),

  // notes / legend / verification
  notes: p("Notes:", "ملاحظات:", true),
  flagMeaning: p("Flag Meaning", "معنى العلامات", true),
  normal: p("Normal", "طبيعي", true),
  high: p("High", "مرتفع", true),
  low: p("Low", "منخفض", true),
  critical: p("Critical", "حرج", true),
  verified: p("Verified", "اعتماد"),
  finalApproved: p("FINAL · APPROVED", "نهائي · معتمد", true),
  pendingApproval: p("PENDING APPROVAL", "بانتظار الاعتماد", true),
  approvedOn: p("Approved:", "تاريخ الاعتماد:", true),
  labDirector: p("Lab. Director", "مدير المعمل", true),
  laboratoryDirector: p("Laboratory Director", "مدير المعمل", true),
  laboratory: p("Laboratory", "المعمل", true),
  scanToVerify: p("Scan to verify", "امسح للتحقق", true),
  footer: p(
    "This report is electronically generated. Please verify patient identity and sample information before clinical use.",
    "هذا التقرير صادر إلكترونيًا. يرجى التأكد من هوية المريض وبيانات العينة قبل الاستخدام الطبي.",
    true,
  ),
} satisfies Record<string, Pair>;

/** Plain string for a pair. "bi" joins both sides with " / " unless English-only. */
export function text(lang: ReportLang, pair: Pair): string {
  if (lang === "en") return pair.en;
  if (lang === "ar") return pair.ar;
  return pair.biEnOnly ? pair.en : `${pair.en} / ${pair.ar}`;
}

/** "Age / Sex" value, e.g. "52 Years / Male" or "52 سنة / ذكر". */
export function ageSexValue(lang: ReportLang, age: number | string, gender: string): string {
  if (lang === "ar") return `${age} ${S.years.ar} / ${gender}`;
  return `${age} ${S.years.en} / ${gender === "أنثى" ? "Female" : "Male"}`;
}

export function summaryLine(
  lang: "en" | "ar",
  s: { measured: number; outside: number; critical: number },
): string {
  if (lang === "en") {
    const head =
      s.outside === 0 ? S.allNormal.en : `${s.outside} of ${s.measured} results outside the reference range`;
    return s.critical > 0 ? `${head} (${s.critical} ${S.criticalWord.en})` : head;
  }
  const head =
    s.outside === 0 ? S.allNormal.ar : `${s.outside} من ${s.measured} نتيجة خارج المدى المرجعي`;
  return s.critical > 0 ? `${head} (${s.critical} ${S.criticalWord.ar})` : head;
}
