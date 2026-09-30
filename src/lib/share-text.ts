/**
 * Text for sharing a report over WhatsApp / email. Pure, no imports.
 *
 * Two modes:
 *  - "link"    (default): no patient name, no results — only that the report is
 *              ready and a link to check it is genuine. Nothing sensitive leaves
 *              the app if the message goes to the wrong chat.
 *  - "results": the patient's name and every result as plain text. The UI makes
 *              the user confirm the recipient before this can be sent.
 */

export type ShareMode = "link" | "results";

export interface ShareInput {
  mode: ShareMode;
  labName: string;
  patientName: string;
  age: number | string;
  gender: string;
  doctor?: string;
  tests: { name: string; value: string; unit: string }[];
  critical: { name: string; value: string }[];
  verifyUrl: string;
  approved: boolean;
}

export interface ShareMessage {
  subject: string;
  body: string;
}

export function buildShareMessage(i: ShareInput): ShareMessage {
  if (i.mode === "link") {
    return {
      subject: `تقرير تحليل — ${i.labName}`,
      body: [
        `تقرير التحاليل الخاص بك من ${i.labName} جاهز.`,
        i.approved ? `للتأكد من صحة التقرير: ${i.verifyUrl}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }

  const entered = i.tests.filter((t) => t.value.trim());
  const lines = [
    `تقرير تحليل — ${i.labName}`,
    `المريض: ${i.patientName} (${i.age} ${i.gender})`,
    i.doctor ? `الطبيب المحيل: ${i.doctor}` : null,
    "",
    ...entered.map((t) => `${t.name}: ${t.value}${t.unit ? ` ${t.unit}` : ""}`),
    i.critical.length ? `\n⚠️ قيم حرجة: ${i.critical.map((t) => `${t.name} (${t.value})`).join("، ")}` : null,
    i.approved ? `\nللتأكد من صحة التقرير: ${i.verifyUrl}` : null,
  ].filter((l): l is string => l !== null);

  return { subject: `تقرير تحليل — ${i.patientName}`, body: lines.join("\n") };
}

export function whatsappUrl(message: ShareMessage): string {
  return `https://wa.me/?text=${encodeURIComponent(message.body)}`;
}

export function mailtoUrl(message: ShareMessage): string {
  return `mailto:?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.body)}`;
}
