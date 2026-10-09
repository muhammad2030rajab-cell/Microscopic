import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { ReportWizard } from "@/components/report/wizard";
import { getCurrentLab, type LabProfileData } from "@/lib/lab-access";
import { getLabReport } from "@/lib/lab-reports";
import { listLabCatalog, type LabCatalogRow } from "@/lib/lab-catalog";
import type { Draft } from "@/lib/store";
import { getCurrentLabPermissions } from "@/lib/lab-users";
import { loadLocalEdit } from "@/lib/sync-engine/offline-fallback";

export const Route = createFileRoute("/reports/edit/$id")({
  loader: async ({ params }) => {
    try {
      const [lab, report, catalog, access] = await Promise.all([
        getCurrentLab(),
        getLabReport({ data: { id: params.id } }),
        listLabCatalog(),
        getCurrentLabPermissions(),
      ]);
      return { lab, report, catalog, canEdit: access.permissions["reports.edit"] === true, blocked: false };
    } catch (err) {
      // No connection: edit the copy kept on this device; the change is queued and sent when the connection is back.
      const local = await loadLocalEdit<LabProfileData, LabCatalogRow>(err, params.id);
      if (local) {
        return {
          lab: local.lab as LabProfileData | null,
          report: local.report as unknown as Awaited<ReturnType<typeof getLabReport>>,
          catalog: local.catalog,
          canEdit: local.canEdit,
          blocked: local.blocked,
        };
      }
      return { lab: null as LabProfileData | null, report: null, catalog: [] as LabCatalogRow[], canEdit: false, blocked: false };
    }
  },
  component: EditReportPage,
});

function EditReportPage() {
  const { lab, report, catalog, canEdit, blocked } = Route.useLoaderData();
  if (!lab) return <Navigate to="/login" replace />;
  if (blocked && report) {
    return (
      <AppShell>
        <div className="mx-auto max-w-lg py-16 text-center">
          <h1 className="font-display text-2xl font-semibold">فيه تعديل سابق محتاج مراجعة</h1>
          <p className="mt-3 text-sm leading-7 text-muted">آخر تعديل على التقرير ده اتحفظ على الجهاز بس الخادم ماقبلهوش (غالبًا حد عدّل التقرير أو اعتمده في الوقت ده). اتصل بالنت وراجعه قبل ما تعدّل تاني.</p>
          <Link to="/reports/$id" params={{ id: report.id }} className="mt-6 inline-flex text-sm text-teal hover:underline">رجوع للتقرير</Link>
        </div>
      </AppShell>
    );
  }
  if (!canEdit || !report || report.status === "cancelled") return <Navigate to={report ? "/reports/$id" : "/reports"} params={report ? { id: report.id } : undefined} />;
  const draft: Draft = {
    patientName: report.patientName, patientCode: report.patientCode, age: String(report.age), ageUnit: report.ageUnit ?? "years", gender: report.gender,
    phone: report.phone || "", nationalId: report.nationalId || "", doctor: report.doctor,
    collectedAt: report.collectedAt || new Date().toISOString().slice(0, 10),
    selectedCategoryIds: Array.from(new Set(report.tests.map((t) => t.categoryId))),
    tests: report.tests, notes: report.notes || "", intake: report.intake, step: 0,
  };
  return <AppShell><ReportWizard catalog={catalog} editReport={{ id: report.id, draft }} labId={lab.lab_id} /></AppShell>;
}
