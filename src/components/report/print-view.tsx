import {
  ArrowDown,
  ArrowUp,
  FlaskConical,
  TriangleAlert,
} from "lucide-react";
import {
  interpretResult,
  isCritical,
  parseValue,
  type Flag,
} from "@/lib/medical";
import { getNormalRange } from "@/lib/tests-catalog";
import {
  defaultLab,
  type LabProfile,
  type Report,
  type SavedTest,
} from "@/lib/store";
import { cn, formatSlashDate, visitIdFrom } from "@/lib/utils";

/* =========================================
   GROUP TESTS
   ========================================= */

function groupTests(report: Report) {
  const groups: {
    en: string;
    ar: string;
    tests: SavedTest[];
  }[] = [];

  const index = new Map<string, number>();

  for (const test of report.tests) {
    const key = test.categoryEn;
    let i = index.get(key);

    if (i == null) {
      i = groups.length;
      index.set(key, i);

      groups.push({
        en: test.categoryEn,
        ar: test.categoryAr,
        tests: [],
      });
    }

    groups[i].tests.push(test);
  }

  return groups;
}

/* =========================================
   PROFILE TITLE
   ========================================= */

function profileTitle(en: string) {
  if (en === "Diabetes") return "Diabetes Profile";
  if (en === "Complete Blood Count") return "Anemia Profile";
  if (en === "Liver Functions") return "Liver Functions Profile";
  if (en === "Kidney Functions") return "Kidney Functions Profile";
  if (en === "Lipid Profile") return "Lipid Profile";
  if (en === "Thyroid") return "Thyroid Profile";

  return `${en} Profile`;
}

/* =========================================
   GLUCOSE
   ========================================= */

function isGlucose(name: string) {
  return /glucose|fbs/i.test(name);
}

/* =========================================
   PRINT VIEW
   ========================================= */

export function PrintView({
  report,
  lab,
}: {
  report: Report;
  lab: LabProfile;
  interactive?: boolean;
}) {
  const brand = { ...defaultLab, ...lab };
  const groups = groupTests(report);

  const sex =
    report.gender === "أنثى"
      ? "Female"
      : "Male";

  const visit = visitIdFrom(report.id);
  const requested = formatSlashDate(
    report.createdAt,
  );

  return (
    <article
      dir="ltr"
      className="print-sheet lab-sheet relative mx-auto w-full max-w-4xl overflow-hidden bg-elevated text-ink shadow-[var(--shadow-sheet)]"
    >
      {/* =========================================
          CORNER DECORATION
         ========================================= */}

      <div
        className="lab-corner"
        aria-hidden
      >
        <span className="lab-corner-navy" />
        <span className="lab-corner-red" />
      </div>

      {/* =========================================
          HEADER
         ========================================= */}

      <header className="lab-header">
        <div className="flex items-center gap-3">
          <span
            className="lab-logo"
            aria-hidden
          >
            <FlaskConical className="size-6" />
          </span>

          <div>
            <p className="font-display text-xl font-semibold leading-tight sm:text-2xl">
              {brand.name}
            </p>

            <p className="text-[0.68rem] font-medium tracking-[0.18em] text-teal uppercase">
              {brand.nameEn}
            </p>

            {brand.doctorSpecialty ? (
              <p className="mt-1 text-xs text-muted">
                {brand.doctorSpecialty}
              </p>
            ) : null}
          </div>
        </div>

        <div
          dir="rtl"
          className="text-end text-xs leading-relaxed text-ink-soft"
        >
          <p className="font-semibold text-ink">
            {brand.name}
          </p>

          {brand.address ? (
            <p>{brand.address}</p>
          ) : null}

          {brand.phone ? (
            <p dir="ltr">
              {brand.phone}
            </p>
          ) : null}
        </div>
      </header>

      {/* =========================================
          REPORT TITLE
         ========================================= */}

      <div className="lab-titlebar">
        <div>
          <p className="font-display text-lg font-semibold tracking-[0.12em] sm:text-xl">
            LABORATORY REPORT
          </p>

          <p className="text-[0.65rem] font-medium tracking-[0.2em] text-muted uppercase">
            Clinical Laboratory Medicine
          </p>
        </div>

        <div className="lab-report-status">
          <span
            className={cn(
              "lab-status-dot",
              report.status === "approved"
                ? "lab-status-approved"
                : "lab-status-pending",
            )}
          />

          <div>
            <p className="font-semibold">
              {report.status === "approved"
                ? "FINAL REPORT"
                : "PRELIMINARY REPORT"}
            </p>

            <p className="text-[0.62rem] text-muted">
              {report.status === "approved"
                ? "Approved / معتمد"
                : "Not yet approved / غير معتمد"}
            </p>
          </div>
        </div>
      </div>

      {/* =========================================
          PATIENT INFORMATION
         ========================================= */}

      <div className="lab-patient-grid mt-5">
        <InfoCell
          label="Patient Name / اسم المريض"
          value={report.patientName}
          rtl
        />

        <InfoCell
          label="Patient Code / كود المريض"
          value={
            report.patientCode || "—"
          }
          mono
        />

        <InfoCell
          label="Age / Sex"
          value={`${report.age} Years / ${sex}`}
        />

        <InfoCell
          label="Phone / الهاتف"
          value={report.phone || "—"}
          mono
        />

        <InfoCell
          label="Referred By / الطبيب"
          value={report.doctor || "—"}
          rtl
        />

        {/* National ID intentionally removed */}

        <InfoCell
          label="Request Date / تاريخ الطلب"
          value={requested}
        />

        <InfoCell
          label="Report ID / رقم التقرير"
          value={visit}
          mono
        />

        <InfoCell
          label="Sample ID / رقم العينة"
          value={
            report.sampleId || "—"
          }
          mono
        />

        <div className="lab-info-cell lab-barcode-cell">
          <span className="lab-info-label">
            Sample Barcode / باركود العينة
          </span>

          <div className="lab-barcode-wrap">
            <span
              className="lab-barcode"
              aria-hidden="true"
            />

            <span className="font-mono text-[0.62rem] tabular-nums">
              {report.sampleId || visit}
            </span>
          </div>
        </div>
      </div>

      {/* =========================================
          RESULTS TITLE
         ========================================= */}

      <div className="mt-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-ink" />

        <h2 className="font-display text-lg font-semibold tracking-[0.16em] sm:text-xl">
          LABORATORY RESULTS
        </h2>

        <span className="h-px flex-1 bg-ink" />
      </div>

      {/* =========================================
          RESULTS
         ========================================= */}

      <div className="mt-6 space-y-6">
        {groups.map((group) => (
          <section key={group.en}>
            <div className="lab-section-heading">
              <span>
                {group.ar}
              </span>

              <span>
                {profileTitle(group.en)}
              </span>
            </div>

            <div className="lab-scroll">
              <table className="lab-grid w-full text-sm">
                <thead>
                  <tr>
                    <th className="w-[34%]">
                      Test / التحليل
                    </th>

                    <th className="w-[13%]">
                      Result / النتيجة
                    </th>

                    <th className="w-[8%]">
                      Flag
                    </th>

                    <th className="w-[12%]">
                      Unit
                    </th>

                    <th>
                      Reference Interval / المدى المرجعي
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {group.tests.map(
                    (test) => {
                      const range =
                        test.customRange ||
                        getNormalRange(
                          test.name,
                          report.gender,
                        );

                      const interp =
                        interpretResult(
                          test.name,
                          test.value,
                          report.gender,
                          test.customRange,
                        );

                      const critical =
                        isCritical(
                          test.name,
                          test.value,
                        );

                      const abnormal =
                        critical ||
                        interp.flag ===
                          "high" ||
                        interp.flag ===
                          "abnormal" ||
                        interp.flag ===
                          "low";

                      const glucose =
                        isGlucose(
                          test.name,
                        );

                      return (
                        <tr
                          key={`${test.categoryId}-${test.name}`}
                        >
                          {/* TEST NAME */}
                          <td className="font-medium">
                            <span className="block">
                              {displayName(
                                test.name,
                              )}
                            </span>

                            {test.calculated ? (
                              <span className="ms-1 text-[0.6rem] font-normal uppercase text-muted">
                                calculated
                              </span>
                            ) : null}
                          </td>

                          {/* RESULT */}
                          <td className="tabular-nums font-semibold text-ink">
                            {abnormal ? (
                              <span className="lab-abnormal-result">
                                {test.value}
                              </span>
                            ) : (
                              test.value
                            )}
                          </td>

                          {/* FLAG */}
                          <td>
                            <FlagMark
                              flag={
                                interp.flag
                              }
                              critical={
                                critical
                              }
                            />
                          </td>

                          {/* UNIT */}
                          <td className="text-ink-soft">
                            {test.unit || "—"}
                          </td>

                          {/* REFERENCE RANGE */}
                          <td className="text-xs">
                            {glucose ? (
                              <AdaGlucoseRange
                                value={
                                  test.value
                                }
                              />
                            ) : (
                              <span>
                                {rangeLabel(
                                  test.name,
                                  range,
                                  report.gender,
                                )}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    },
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>

      {/* =========================================
          NOTES
         ========================================= */}

      {report.notes ? (
        <p className="mt-5 border border-ink px-3 py-2 text-sm">
          <span className="font-semibold">
            Notes:
          </span>{" "}
          {report.notes}
        </p>
      ) : null}

      {/* =========================================
          FINAL SECTION
         ========================================= */}

      <div className="lab-final-grid mt-8">
        <div className="lab-flag-legend">
          <p className="font-semibold text-ink">
            Flag Meaning
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span>
              — Normal
            </span>

            <span className="inline-flex items-center gap-1 text-high">
              <ArrowUp className="size-3.5" />
              High
            </span>

            <span className="inline-flex items-center gap-1 text-high">
              <ArrowDown className="size-3.5" />
              Low
            </span>

            <span className="inline-flex items-center gap-1 text-high">
              <TriangleAlert className="size-3.5" />
              Critical
            </span>
          </div>
        </div>

        <div className="lab-verification">
          <p className="text-[0.62rem] uppercase tracking-[0.12em] text-muted">
            Verified / اعتماد
          </p>

          <p className="mt-1 font-semibold">
            {report.status === "approved"
              ? "FINAL · APPROVED"
              : "PENDING APPROVAL"}
          </p>

          {report.status ===
            "approved" &&
          report.approvedAt ? (
            <p className="mt-0.5 text-[0.68rem] text-muted">
              Approved:{" "}
              {formatSlashDate(
                report.approvedAt,
              )}
            </p>
          ) : null}

          <p className="mt-2 font-display text-base italic text-ink">
            {brand.doctorName ||
              "Laboratory Director"}
          </p>

          <p className="text-xs font-semibold">
            Lab. Director
          </p>

          {brand.doctorDegree ? (
            <p className="text-[0.68rem] text-muted">
              {brand.doctorDegree}
            </p>
          ) : null}
        </div>
      </div>

      {/* =========================================
          FOOTER
         ========================================= */}

      <footer className="mt-6 border-t border-ink pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-soft">
          <span>
            {brand.website ||
              brand.address ||
              "Laboratory"}
          </span>

          {brand.phone ? (
            <span dir="ltr">
              {brand.phone}
            </span>
          ) : null}

          {brand.email ? (
            <span>
              {brand.email}
            </span>
          ) : null}
        </div>

        <p className="mt-2 text-center text-[0.62rem] text-muted">
          This report is electronically
          generated. Please verify patient
          identity and sample information
          before clinical use.
        </p>
      </footer>
    </article>
  );
}

/* =========================================
   INFO CELL
   ========================================= */

function InfoCell({
  label,
  value,
  rtl = false,
  mono = false,
}: {
  label: string;
  value: string;
  rtl?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="lab-info-cell">
      <span className="lab-info-label">
        {label}
      </span>

      <span
        dir={
          rtl
            ? "rtl"
            : "ltr"
        }
        className={cn(
          "lab-info-value",
          mono &&
            "font-mono tabular-nums",
        )}
      >
        {value || "—"}
      </span>
    </div>
  );
}

/* =========================================
   DISPLAY NAMES
   ========================================= */

function displayName(name: string) {
  if (name === "SGPT (ALT)") {
    return "Alanine Aminotransferase (ALT / s.GPT)";
  }

  if (name === "SGOT (AST)") {
    return "Aspartate Aminotransferase (AST / s.GOT)";
  }

  if (name === "Fasting Glucose") {
    return "Fasting Blood Sugar (FBS)";
  }

  if (name === "Hemoglobin") {
    return "Hemoglobin (Hb)";
  }

  return name;
}

/* =========================================
   REFERENCE RANGE
   ========================================= */

function rangeLabel(
  name: string,
  range: string,
  gender: "ذكر" | "أنثى",
) {
  const sex =
    gender === "أنثى"
      ? "Female"
      : "Male";

  if (name === "Hemoglobin") {
    return (
      <span>
        {range.replace(
          "حتى",
          "Up to",
        )}

        <span className="mt-0.5 block text-muted">
          (for Age & Sex · {sex})
        </span>
      </span>
    );
  }

  if (range.startsWith("حتى")) {
    return `Up to ${range
      .replace("حتى", "")
      .trim()}`;
  }

  if (range.startsWith("أقل من")) {
    return `Less than ${range
      .replace("أقل من", "")
      .trim()}`;
  }

  if (range.startsWith("أكثر من")) {
    return `More than ${range
      .replace("أكثر من", "")
      .trim()}`;
  }

  return range;
}

/* =========================================
   GLUCOSE REFERENCE
   ========================================= */

function AdaGlucoseRange({
  value,
}: {
  value: string;
}) {
  const n = parseValue(value);

  const band =
    n == null
      ? ""
      : n < 100
        ? "ok"
        : n <= 125
          ? "pre"
          : "dm";

  return (
    <table className="lab-nested w-full">
      <tbody>
        <tr
          className={
            band === "ok"
              ? "lab-band-ok"
              : undefined
          }
        >
          <td>
            Less than 100
          </td>

          <td>
            Non-Diabetic
          </td>
        </tr>

        <tr
          className={
            band === "pre"
              ? "lab-band-pre"
              : undefined
          }
        >
          <td>
            100 – 125
          </td>

          <td>
            Pre-Diabetic
          </td>
        </tr>

        <tr
          className={
            band === "dm"
              ? "lab-band-dm"
              : undefined
          }
        >
          <td>
            More than 125
          </td>

          <td>
            Diabetic (must be confirmed)
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/* =========================================
   FLAG
   ========================================= */

function FlagMark({
  flag,
  critical,
}: {
  flag: Flag;
  critical: boolean;
}) {
  if (critical) {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-high"
        title="Critical"
      >
        {flag === "high" ? (
          <ArrowUp className="size-4" />
        ) : (
          <ArrowDown className="size-4" />
        )}

        <TriangleAlert className="size-4" />
      </span>
    );
  }

  if (
    flag === "high" ||
    flag === "abnormal"
  ) {
    return (
      <ArrowUp
        className="size-4 text-high"
        aria-label="Abnormal High"
      />
    );
  }

  if (flag === "low") {
    return (
      <ArrowDown
        className="size-4 text-high"
        aria-label="Abnormal Low"
      />
    );
  }

  return (
    <span className="text-muted">
      —
    </span>
  );
}
