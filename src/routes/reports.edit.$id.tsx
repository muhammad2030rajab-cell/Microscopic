import { createFileRoute, Navigate } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { ReportWizard } from "@/components/report/wizard";
import { getCurrentLab, type LabProfileData } from "@/lib/lab-access";
import { getLabReport } from "@/lib/lab-reports";
import { listLabCatalog, type LabCatalogRow } from "@/lib/lab-catalog";
import type { Draft } from "@/lib/store";
import { getCurrentLabPermissions } from "@/lib/lab-users";

export const Route = createFileRoute("/reports/edit/$id")({
  loader: async ({ params }) => {
    try {
      const [lab, report, catalog, access] = await Promise.all([
        getCurrentLab(),
        getLabReport({ data: { id: params.id } }),
        listLabCatalog(),
        getCurrentLabPermissions(),
      ]);
      return { lab, report, catalog, canEdit: access.permissions["reports.edit"] === true };
    } catch {
      return { lab: null as LabProfileData | null, report: null, catalog: [] as LabCatalogRow[], canEdit: false };
    }
  },
  component: EditReportPage,
});

function EditReportPage() {
  const { lab, report, catalog, canEdit } = Route.useLoaderData();
  if (!lab) return <Navigate to="/login" replace />;
  if (!canEdit || !report || report.status !== "draft") return <Navigate to={report ? "/reports/$id" : "/reports"} params={report ? { id: report.id } : undefined} />;
  const draft: Draft = {
    patientName: report.patientName, patientCode: report.patientCode, age: String(report.age), ageUnit: report.ageUnit ?? "years", gender: report.gender,
    phone: report.phone || "", nationalId: report.nationalId || "", doctor: report.doctor,
    collectedAt: report.collectedAt || new Date().toISOString().slice(0, 10),
    selectedCategoryIds: Array.from(new Set(report.tests.map((t) => t.categoryId))),
    tests: report.tests, notes: report.notes || "", step: 0,
  };
  return <AppShell><ReportWizard catalog={catalog} editReport={{ id: report.id, draft }} /></AppShell>;
}
