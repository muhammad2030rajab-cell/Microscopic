import { createFileRoute, Navigate } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { ReportWizard } from "@/components/report/wizard";
import { getCurrentLab } from "@/lib/lab-access";
import { listLabCatalog } from "@/lib/lab-catalog";
import { getCurrentLabPermissions } from "@/lib/lab-users";

export const Route = createFileRoute("/new")({
  loader: async () => {
    try {
      const [lab, catalog, access] = await Promise.all([getCurrentLab(), listLabCatalog(), getCurrentLabPermissions()]);
      return { lab, catalog, canCreate: access.permissions["reports.create"] === true };
    } catch {
      return { lab: null, catalog: [], canCreate: false };
    }
  },
  component: NewReportPage,
});

function NewReportPage() {
  const { lab, catalog, canCreate } = Route.useLoaderData();
  if (!lab) return <Navigate to="/login" replace />;
  if (!canCreate) return <Navigate to="/reports" replace />;
  return (
    <AppShell lab={{ name: lab.lab_name, nameEn: lab.lab_name_en, doctorName: lab.doctor_name, doctorSpecialty: lab.doctor_specialty }}>
      <ReportWizard catalog={catalog} />
    </AppShell>
  );
}
