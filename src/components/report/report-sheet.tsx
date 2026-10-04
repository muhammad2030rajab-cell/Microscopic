import { PrintView } from "@/components/report/print-view";
import { ProReportSheet } from "@/components/report/pro-report";
import { normalizeDesign, type ReportTemplate } from "@/lib/report-design";
import type { LabReport } from "@/lib/lab-reports";
import type { LabProfile } from "@/lib/store";
import type { ReportLang } from "@/lib/report-strings";

/**
 * The one place that decides which printed layout is used. `template` overrides the lab's own
 * choice (used by the template gallery and by the per-device picker on the report page).
 */
export function ReportSheet(props: { report: LabReport; lab: LabProfile; lang?: ReportLang; interactive?: boolean; template?: ReportTemplate }) {
  const { template, ...rest } = props;
  const chosen = template ?? normalizeDesign(props.lab.design).template;
  return chosen === "standard" ? <PrintView {...rest} /> : <ProReportSheet {...rest} variant={chosen} />;
}
