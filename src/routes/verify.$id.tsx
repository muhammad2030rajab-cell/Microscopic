import { createFileRoute } from "@tanstack/react-router";
import { BadgeCheck, ShieldAlert } from "lucide-react";
import { verifyReport } from "@/lib/report-verification";
import { formatSlashDate } from "@/lib/utils";

export const Route = createFileRoute("/verify/$id")({
  loader: async ({ params }) => {
    try {
      return await verifyReport({ data: { id: params.id } });
    } catch {
      return { valid: false as const };
    }
  },
  component: VerifyPage,
});

function VerifyPage() {
  const result = Route.useLoaderData();
  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-paper px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-elevated p-6 text-center shadow-sm sm:p-8">
        {result.valid ? (
          <>
            <div className="mx-auto grid size-16 place-items-center rounded-full bg-ok/10 text-ok"><BadgeCheck className="size-9" /></div>
            <h1 className="mt-4 font-display text-xl font-semibold">تقرير أصلي ومعتمد ✅</h1>
            <p className="mt-1 text-sm text-muted">Verified Genuine Report</p>
            <div className="mt-5 space-y-2 rounded-xl bg-paper p-4 text-right text-sm">
              <Row label="المعمل" value={result.labName} />
              <Row label="اسم المريض" value={result.patientName} />
              <Row label="رقم العينة" value={result.sampleId} />
              {result.collectedAt ? <Row label="تاريخ السحب" value={formatSlashDate(result.collectedAt)} /> : null}
              {result.approvedAt ? <Row label="تاريخ الاعتماد" value={formatSlashDate(result.approvedAt)} /> : null}
            </div>
          </>
        ) : (
          <>
            <div className="mx-auto grid size-16 place-items-center rounded-full bg-high/10 text-high"><ShieldAlert className="size-9" /></div>
            <h1 className="mt-4 font-display text-xl font-semibold">لا يمكن التحقق من هذا التقرير</h1>
            <p className="mt-2 text-sm leading-6 text-muted">إما أن الرابط غير صحيح، أو أن التقرير لم يُعتمد بعد من المعمل.</p>
          </>
        )}
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return <div className="flex items-center justify-between border-b border-line/60 pb-2 last:border-0 last:pb-0"><span className="text-muted">{label}</span><span className="font-medium">{value}</span></div>;
}
