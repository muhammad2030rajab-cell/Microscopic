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
  type DraftTest,
  type Flag,
} from "@/lib/medical";
import { getNormalRange } from "@/lib/tests-catalog";
import {
  defaultLab,
  type LabProfile,
} from "@/lib/store";
import type { LabReport } from "@/lib/lab-reports";
import { cn, formatSlashDate, visitIdFrom } from "@/lib/utils";
import { ReportQrCode } from "./report-qr-code";
import { RangeBar } from "./range-bar";
import { SampleBarcode } from "./sample-barcode";
import { S, ageSexValue, summaryLine, text, type Pair, type ReportLang } from "@/lib/report-strings";

/* =========================================
   BILINGUAL LABEL
   "English / عربي" -> English on the left, Arabic on the right.
   Labels without an Arabic part (e.g. "Age / Sex") render as-is.
   ========================================= */

const ARABIC = /[\u0600-\u06FF]/;

function BiLabel({ text }: { text: string }) {
  const i = text.indexOf(" / ");
  const en = i === -1 ? text : text.slice(0, i);
  const ar = i === -1 ? "" : text.slice(i + 3);

  if (!ARABIC.test(ar)) return <>{text}</>;

  return (
    <span className="lab-bi">
      <span>{en}</span>
      <span className="lab-bi-ar">{ar}</span>
    </span>
  );
}

/** Label in the chosen language; side-by-side layout only in bilingual mode. */
function Lbl({ lang, pair }: { lang: ReportLang; pair: Pair }) {
  if (lang === "bi") return <BiLabel text={text("bi", pair)} />;
  return <>{text(lang, pair)}</>;
}

/* =========================================
   GROUP TESTS
   ========================================= */

function groupTests(report: LabReport) {
  const groups: {
    en: string;
    ar: string;
    tests: DraftTest[];
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
   RESULT SUMMARY
   ========================================= */

function summarize(report: LabReport) {
  let measured = 0;
  let outside = 0;
  let critical = 0;

  for (const test of report.tests) {
    if (!test.value.trim()) continue;
    measured += 1;

    const interp = interpretResult(
      test.name,
      test.value,
      report.gender,
      test.customRange,
      report.age,
      test.categoryId,
    );
    const isCrit = isCritical(test.name, test.value);

    if (isCrit) critical += 1;
    if (
      isCrit ||
      interp.flag === "high" ||
      interp.flag === "low" ||
      interp.flag === "abnormal"
    ) {
      outside += 1;
    }
  }

  return { measured, outside, critical };
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
  lang = "bi",
}: {
  report: LabReport;
  lab: LabProfile;
  interactive?: boolean;
  /** "bi" (default, English + Arabic), "en" or "ar". */
  lang?: ReportLang;
}) {
  const rtl = lang === "ar";
  const brand = { ...defaultLab, ...lab };
  const groups = groupTests(report);
  const summary = summarize(report);

  const visit = visitIdFrom(report.id);
  const requested = formatSlashDate(
    report.createdAt,
  );
  const collected = report.collectedAt ? formatSlashDate(report.collectedAt) : null;

  return (
    <article
      dir={rtl ? "rtl" : "ltr"}
      lang={rtl ? "ar" : "en"}
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
          {brand.logoUrl ? (
            <img src={brand.logoUrl} alt="" aria-hidden className="lab-logo size-11 rounded-lg object-cover" />
          ) : (
            <span
              className="lab-logo"
              aria-hidden
            >
              <FlaskConical className="size-6" />
            </span>
          )}

          <div>
            <p className="font-display text-xl font-semibold leading-tight sm:text-2xl">
              {brand.name}
            </p>

            <p className="text-[0.72rem] font-medium tracking-[0.04em] text-teal">
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
            {text(lang, S.labReport)}
          </p>

          <p className="text-[0.7rem] font-medium tracking-[0.03em] text-muted">
            {text(lang, S.clinicalSub)}
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
                ? text(lang, S.finalReport)
                : text(lang, S.prelimReport)}
            </p>

            <p className="text-[0.62rem] text-muted">
              {report.status === "approved"
                ? text(lang, S.approved)
                : text(lang, S.notApproved)}
            </p>
          </div>
        </div>
      </div>

      {/* =========================================
          PATIENT INFORMATION
         ========================================= */}

      <div className="lab-patient-grid mt-5">
        <InfoCell
          label={S.patientName} lang={lang}
          value={report.patientName}
          rtl
        />

        <InfoCell
          label={S.patientCode} lang={lang}
          value={
            report.patientCode || "—"
          }
          mono
        />

        <InfoCell
          label={S.ageSex} lang={lang}
          value={ageSexValue(lang, report.age, report.gender)}
        />

        <InfoCell
          label={S.phone} lang={lang}
          value={report.phone || "—"}
          mono
        />

        <InfoCell
          label={S.referredBy} lang={lang}
          value={report.doctor || "—"}
          rtl
        />

        {/* National ID intentionally removed */}

        <InfoCell
          label={S.requestDate} lang={lang}
          value={requested}
        />

        {collected ? (
          <InfoCell
            label={S.collectionDate} lang={lang}
            value={collected}
          />
        ) : null}

        <InfoCell
          label={S.reportId} lang={lang}
          value={visit}
          mono
        />

        <InfoCell
          label={S.sampleId} lang={lang}
          value={
            report.sampleId || "—"
          }
          mono
        />

        <div className="lab-info-cell lab-barcode-cell">
          <span className="lab-info-label">
            <Lbl lang={lang} pair={S.sampleBarcode} />
          </span>

          <div className="lab-barcode-wrap">
            <SampleBarcode
              value={
                report.sampleId ||
                visit
              }
            />

            <span className="font-mono text-[0.62rem] tabular-nums">
              {report.sampleId || visit}
            </span>
          </div>
        </div>
      </div>

      {/* =========================================
          RESULT SUMMARY
         ========================================= */}

      {summary.measured > 0 ? (
        <div
          className={cn(
            "lab-summary mt-4",
            summary.outside === 0
              ? "lab-summary-ok"
              : "lab-summary-flag",
          )}
        >
          {lang !== "ar" ? (
            <span className="lab-summary-en">
              {summaryLine("en", summary)}
            </span>
          ) : null}

          {lang !== "en" ? (
            <span dir="rtl" className="lab-summary-ar">
              {summaryLine("ar", summary)}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* =========================================
          RESULTS TITLE
         ========================================= */}

      <div className="mt-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-ink" />

        <h2 className="font-display text-lg font-semibold tracking-[0.16em] sm:text-xl">
          {text(lang, S.labResults)}
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
              {lang !== "en" ? (
                <span>
                  {group.ar}
                </span>
              ) : null}

              {lang !== "ar" ? (
                <span>
                  {profileTitle(group.en)}
                </span>
              ) : null}
            </div>

            <div className="lab-scroll">
              <table className="lab-grid w-full text-sm">
                <thead>
                  <tr>
                    <th className="w-[34%]">
                      <Lbl lang={lang} pair={S.test} />
                    </th>

                    <th className="w-[13%]">
                      <Lbl lang={lang} pair={S.result} />
                    </th>

                    <th className="w-[8%]">
                      {text(lang, S.flag)}
                    </th>

                    <th className="w-[12%]">
                      {text(lang, S.unit)}
                    </th>

                    <th>
                      <Lbl lang={lang} pair={S.reference} />
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
                          report.age,
                          test.categoryId,
                        );

                      const interp =
                        interpretResult(
                          test.name,
                          test.value,
                          report.gender,
                          test.customRange,
                          report.age,
                          test.categoryId,
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

                      const low =
                        !critical &&
                        interp.flag ===
                          "low";

                      const glucose =
                        isGlucose(
                          test.name,
                        );

                      return (
                        <tr
                          key={`${test.categoryId}-${test.name}`}
                          className={
                            low
                              ? "lab-row-low"
                              : abnormal
                                ? "lab-row-abnormal"
                                : undefined
                          }
                        >
                          {/* TEST NAME */}
                          <td className="font-medium">
                            <span dir="ltr" className="block text-start">
                              {displayName(
                                test.name,
                              )}
                            </span>

                            {test.calculated ? (
                              <span className="ms-1 text-[0.62rem] font-normal italic text-muted">
                                {text(lang === "ar" ? "ar" : "en", S.calculated)}
                              </span>
                            ) : null}
                          </td>

                          {/* RESULT */}
                          <td className="tabular-nums font-semibold text-ink">
                            {abnormal ? (
                              <span
                                className={cn(
                                  "lab-abnormal-result",
                                  low &&
                                    "lab-abnormal-low",
                                )}
                              >
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
                              <>
                                <span>
                                  {rangeLabel(
                                    test.name,
                                    range,
                                    report.gender,
                                    lang,
                                  )}
                                </span>

                                <RangeBar
                                  range={range}
                                  value={test.value}
                                  flag={interp.flag}
                                  critical={critical}
                                />
                              </>
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
            {text(lang === "ar" ? "ar" : "en", S.notes)}
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
            {text(lang === "ar" ? "ar" : "en", S.flagMeaning)}
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span>
              — {text(lang === "ar" ? "ar" : "en", S.normal)}
            </span>

            <span className="inline-flex items-center gap-1 text-high">
              <ArrowUp className="size-3.5" />
              {text(lang === "ar" ? "ar" : "en", S.high)}
            </span>

            <span className="inline-flex items-center gap-1 text-[var(--color-flag-low)]">
              <ArrowDown className="size-3.5" />
              {text(lang === "ar" ? "ar" : "en", S.low)}
            </span>

            <span className="inline-flex items-center gap-1 text-high">
              <TriangleAlert className="size-3.5" />
              {text(lang === "ar" ? "ar" : "en", S.critical)}
            </span>
          </div>
        </div>

        <div className="lab-verification">
          <p className="text-[0.68rem] tracking-[0.03em] text-muted">
            {text(lang, S.verified)}
          </p>

          <p className="mt-1 font-semibold">
            {report.status === "approved"
              ? text(lang === "ar" ? "ar" : "en", S.finalApproved)
              : text(lang === "ar" ? "ar" : "en", S.pendingApproval)}
          </p>

          {report.status ===
            "approved" &&
          report.approvedAt ? (
            <p className="mt-0.5 text-[0.68rem] text-muted">
              {text(lang === "ar" ? "ar" : "en", S.approvedOn)}{" "}
              {formatSlashDate(
                report.approvedAt,
              )}
            </p>
          ) : null}

          <p className="mt-2 font-display text-base italic text-ink">
            {brand.doctorName ||
              text(lang === "ar" ? "ar" : "en", S.laboratoryDirector)}
          </p>

          <p className="text-xs font-semibold">
            {text(lang === "ar" ? "ar" : "en", S.labDirector)}
          </p>

          {report.status === "approved" ? <ReportQrCode reportId={report.id} caption={text(lang === "ar" ? "ar" : "en", S.scanToVerify)} /> : null}

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
              text(lang === "ar" ? "ar" : "en", S.laboratory)}
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
          {text(lang === "ar" ? "ar" : "en", S.footer)}
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
  lang,
  value,
  rtl = false,
  mono = false,
}: {
  label: Pair;
  lang: ReportLang;
  value: string;
  rtl?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="lab-info-cell">
      <span className="lab-info-label">
        <Lbl lang={lang} pair={label} />
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
  lang: ReportLang = "bi",
) {
  const sex =
    gender === "أنثى"
      ? "Female"
      : "Male";

  // Arabic sheet: ranges are stored in Arabic already ("حتى 5.2"), keep them.
  if (lang === "ar") {
    if (name === "Hemoglobin") {
      return (
        <span>
          {range}

          <span className="mt-0.5 block text-muted">
            ({S.forAgeSex.ar} · {gender})
          </span>
        </span>
      );
    }
    return range;
  }

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
        className="size-4 text-[var(--color-flag-low)]"
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
