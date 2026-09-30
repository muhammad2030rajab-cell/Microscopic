import { useEffect } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { ReportWizard } from "@/components/report/wizard";
import { getCurrentLab, type LabProfileData } from "@/lib/lab-access";
import { listLabCatalog, type LabCatalogRow } from "@/lib/lab-catalog";
import { getCurrentLabPermissions } from "@/lib/lab-users";
import { loadBootstrap, saveBootstrap } from "@/lib/offline/bootstrap-cache";
import { isNetworkError } from "@/lib/offline/network-error";
import { requestPageCache } from "@/lib/offline/sync";

type NewReportData = {
  lab: LabProfileData | null;
  catalog: LabCatalogRow[];
  canCreate: boolean;
  /** true = served from the device copy because there is no connection */
  offline: boolean;
  /** true = offline and this device has never opened this page online */
  unavailableOffline: boolean;
};

export const Route = createFileRoute("/new")({
  loader: async (): Promise<NewReportData> => {
    try {
      const [lab, catalog, access] = await Promise.all([getCurrentLab(), listLabCatalog(), getCurrentLabPermissions()]);
      return { lab, catalog, canCreate: access.permissions["reports.create"] === true, offline: false, unavailableOffline: false };
    } catch (error) {
      // Only in the browser, and only for "no answer" failures — a real auth or
      // permission error must still send the user to sign in.
      if (typeof window !== "undefined" && isNetworkError(error, navigator.onLine)) {
        const cached = loadBootstrap<LabProfileData, LabCatalogRow>();
        if (cached) {
          return { lab: cached.lab, catalog: cached.catalog, canCreate: cached.canCreate, offline: true, unavailableOffline: false };
        }
        return { lab: null, catalog: [], canCreate: false, offline: true, unavailableOffline: true };
      }
      return { lab: null, catalog: [], canCreate: false, offline: false, unavailableOffline: false };
    }
  },
  component: NewReportPage,
});

function NewReportPage() {
  const { lab, catalog, canCreate, offline, unavailableOffline } = Route.useLoaderData();

  // Online and signed in: refresh the device copy so this page also opens with
  // no connection next time.
  useEffect(() => {
    if (!lab || !canCreate || offline) return;
    saveBootstrap({ lab, catalog, canCreate, labId: lab.lab_id });
    requestPageCache("/new");
  }, [lab, catalog, canCreate, offline]);

  if (unavailableOffline) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md rounded-lg border border-line bg-elevated p-5 text-sm leading-7">
          <h1 className="mb-2 font-display text-lg font-semibold">لا يوجد اتصال</h1>
          <p className="text-ink-soft">
            علشان تشتغل بدون إنترنت لازم تفتح صفحة "تقرير جديد" مرة واحدة وأنت متصل. بعدها تفتح وحدها حتى بدون شبكة.
          </p>
        </div>
      </AppShell>
    );
  }
  if (!lab) return <Navigate to="/login" replace />;
  if (!canCreate) return <Navigate to="/reports" replace />;
  return (
    <AppShell>
      <ReportWizard catalog={catalog} labId={lab.lab_id} />
    </AppShell>
  );
}
