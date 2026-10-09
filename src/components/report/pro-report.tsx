import { FlaskConical, Globe, Mail, MapPin, Phone } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import type { LabReport } from "@/lib/lab-reports";
import { isCritical, interpretResult, type Flag } from "@/lib/medical";
import { getNormalRange } from "@/lib/tests-catalog";
import { defaultLab, type LabProfile } from "@/lib/store";
import { ageToYears } from "@/lib/age";
import { accentPalette, normalizeDesign, type ReportTemplate } from "@/lib/report-design";
import { S, ageSexValue, summaryLine, text, type Pair, type ReportLang } from "@/lib/report-strings";
import { cn, formatSlashDate, visitIdFrom } from "@/lib/utils";
import { formatUnit } from "@/lib/unit-format";
import { normalizeIntake, sampleLine } from "@/lib/report-intake";
import {
  AdaGlucoseRange,
  displayName,
  groupTests,
  isGlucose,
  languageFromSetting,
  profileTitle,
  rangeLabel,
  summarize,
} from "./print-view";
import { RangeBar } from "./range-bar";
import { ReportQrCode } from "./report-qr-code";
import { SampleBarcode } from "./sample-barcode";
import "./pro-report.css";

/** English on top, Arabic under it (bilingual); a single language otherwise. */
function PairLabel({ pair, lang }: { pair: Pair; lang: ReportLang }) {
  if (lang === "bi" && !pair.biEnOnly) {
    return (
      <>
        <span className="rp-l-en">{pair.en}</span>
        <span className="rp-l-ar" dir="rtl">{pair.ar}</span>
      </>
    );
  }
  return <span className="rp-l-en">{text(lang, pair)}</span>;
}

function Cell({ label, lang, value, mono, wide }: { label: Pair; lang: ReportLang; value: ReactNode; rtl?: boolean; mono?: boolean; wide?: boolean }) {
  return (
    <div className={cn("rp-cell", wide && "rp-cell-wide")}>
      <span className="rp-label"><PairLabel pair={label} lang={lang} /></span>
      <span className={cn("rp-value", mono && "rp-mono")} dir={mono ? "ltr" : "auto"}>{value || "—"}</span>
    </div>
  );
}

/** Text flags (H / L / HH / LL / A) — they survive black-and-white printing and photocopies. */
function flagCode(flag: Flag, critical: boolean): { code: string; tone: "high" | "low" | "crit" | "none" } {
  if (critical) return { code: flag === "low" ? "LL" : "HH", tone: "crit" };
  if (flag === "high") return { code: "H", tone: "high" };
  if (flag === "abnormal") return { code: "A", tone: "high" };
  if (flag === "low") return { code: "L", tone: "low" };
  return { code: "", tone: "none" };
}

export function ProReportSheet({ report, lab, lang: langProp, variant = "pro" }: { report: LabReport; lab: LabProfile; lang?: ReportLang; interactive?: boolean; variant?: ReportTemplate }) {
  const lang: ReportLang = langProp ?? languageFromSetting(lab.reportLanguage);
  const rtl = lang === "ar";
  const l2: "ar" | "en" = rtl ? "ar" : "en";
  const brand = { ...defaultLab, ...lab };
  const design = normalizeDesign(brand.design);
  const letterhead = design.paper === "letterhead";
  const isFinal = report.status !== "cancelled";
  const signature = isFinal ? brand.assets?.signatureUrl : null;
  const stamp = isFinal ? brand.assets?.stampUrl : null;
  const groups = groupTests(report);
  const summary = summarize(report);
  const visit = visitIdFrom(report.id);
  const sampleText = report.intake ? sampleLine(normalizeIntake(report.intake), lang === "ar" ? "ar" : "en") : "";
  const criticalTests = report.tests.filter((t) => t.value.trim() && isCritical(t.name, t.value));
  const requested = formatSlashDate(report.createdAt);
  const collected = report.collectedAt ? formatSlashDate(report.collectedAt) : null;
  const sampleCode = report.sampleId || visit;

  const pal = accentPalette(design.accent);
  const style = {
    "--rp-accent": pal.accent,
    "--rp-accent-deep": pal.deep,
    "--rp-accent-2": pal.soft,
    "--rp-tint": pal.tint,
    "--rp-line": pal.line,
    "--rp-fg": pal.fg,
    "--rp-fg-soft": pal.fgSoft,
  } as CSSProperties;

  const primaryName = rtl ? brand.name : brand.nameEn || brand.name;
  const secondaryName = lang === "bi" && brand.name && brand.name !== primaryName ? brand.name : "";
  const longName = Math.max(primaryName.length, secondaryName.length) > 34;

  const contacts: { icon: ReactNode; value: string; ltr?: boolean }[] = [
    brand.address ? { icon: <MapPin />, value: brand.address } : null,
    brand.phone ? { icon: <Phone />, value: brand.phone, ltr: true } : null,
    brand.email ? { icon: <Mail />, value: brand.email, ltr: true } : null,
    brand.website ? { icon: <Globe />, value: brand.website, ltr: true } : null,
  ].filter(Boolean) as { icon: ReactNode; value: string; ltr?: boolean }[];

  return (
    <div className="rp-wrap">
      <article className={cn("rp-sheet", letterhead && "rp-letterhead")} data-variant={variant} dir={rtl ? "rtl" : "ltr"} lang={rtl ? "ar" : "en"} style={style}>
        {/* The page margin (not padding) keeps the pre-printed letterhead clear on EVERY page. */}
        <style>
          {letterhead
            ? `@media print{@page{size:A4 portrait;margin:${design.letterheadTopMm}mm 0 ${design.letterheadBottomMm}mm 0}}`
            : `@media print{@page{size:A4 portrait;margin:0 0 13mm 0;@bottom-center{content:counter(page) " / " counter(pages);font:8.5px sans-serif;color:#64748b}}}`}
        </style>

        {!isFinal ? (
          <div className="report-watermark" data-watermark aria-hidden>
            <span>{text(l2, S.cancelledReport)}</span>
          </div>
        ) : null}

        <table className="rp-pages">
          <thead>
            <tr>
              <td>
                {letterhead ? (
                  <div className="rp-lh-gap no-print" style={{ height: `${design.letterheadTopMm}mm` }} aria-hidden>
                    <span>{text(l2, S.letterheadSpace)}</span>
                  </div>
                ) : (
                  <header className={cn("rp-header", longName && "rp-long")}>
                    <div className="rp-brand">
                      {brand.logoUrl ? (
                        <img src={brand.logoUrl} alt="" aria-hidden className="rp-logo" />
                      ) : (
                        <span className="rp-logo rp-logo-default" aria-hidden><FlaskConical /></span>
                      )}
                      <div className="rp-brand-text">
                        <p className="rp-name">{primaryName}</p>
                        {secondaryName ? <p className="rp-name-2" dir="rtl">{secondaryName}</p> : null}
                        <p className="rp-tagline">{text(l2, S.medicalLaboratory)}</p>
                      </div>
                    </div>
                    {contacts.length ? (
                      <ul className="rp-contact">
                        {contacts.map((c) => (
                          <li key={c.value}>
                            <span className="rp-ico" aria-hidden>{c.icon}</span>
                            <span dir={c.ltr ? "ltr" : undefined}>{c.value}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </header>
                )}
                {!letterhead ? <div className="rp-rule" aria-hidden /> : null}
                {/* Slim identity line: repeats on every printed page so a loose page is never anonymous. */}
                <div className="rp-strip">
                  <span className="rp-strip-name" dir="auto">{report.patientName}</span>
                  <span dir="ltr">{report.patientCode || "—"}</span>
                  <span dir="auto">{ageSexValue(lang, report.age, report.gender, report.ageUnit)}</span>
                  {design.showReportId ? <span className="rp-mono" dir="ltr">{visit}</span> : null}
                </div>
              </td>
            </tr>
          </thead>

          <tfoot>
            <tr>
              <td>
                <footer className="rp-footer">
                  {!letterhead && (brand.website || brand.phone || brand.email) ? (
                    <p className="rp-footer-contact">
                      {[brand.website, brand.phone, brand.email].filter(Boolean).map((v) => <span key={v} dir="ltr">{v}</span>)}
                    </p>
                  ) : null}
                  {design.footerNote ? <p className="rp-footer-note">{design.footerNote}</p> : null}
                  <p className="rp-disclaimer">{text(l2, S.footer)}</p>
                </footer>
                {!letterhead ? <div className="rp-rule rp-rule-bottom" aria-hidden /> : null}
              </td>
            </tr>
          </tfoot>

          <tbody>
            <tr>
              <td>
                <div className="rp-title">
                  <div>
                    <h1>{text(l2, S.labReport)}</h1>
                    <p>{text(l2, S.clinicalSub)}</p>
                  </div>
                  {design.showStatus ? (
                    <span className={cn("rp-status", isFinal ? "rp-status-final" : "rp-status-prelim")}>
                      <i aria-hidden />
                      {isFinal ? text(l2, S.finalReport) : text(l2, S.cancelledReport)}
                    </span>
                  ) : null}
                </div>

                <section className="rp-patient">
                  <div className="rp-patient-grid">
                    <Cell label={S.patientName} lang={lang} value={report.patientName} rtl wide />
                    <Cell label={S.patientCode} lang={lang} value={report.patientCode} mono />
                    <Cell label={S.ageSex} lang={lang} value={ageSexValue(lang, report.age, report.gender, report.ageUnit)} />
                    <Cell label={S.referredBy} lang={lang} value={report.doctor} rtl wide />
                    <Cell label={S.phone} lang={lang} value={report.phone} mono />
                    <Cell label={S.requestDate} lang={lang} value={requested} />
                    {collected ? <Cell label={S.collectionDate} lang={lang} value={collected} /> : null}
                    {design.showReportId ? <Cell label={S.reportId} lang={lang} value={visit} mono /> : null}
                    <Cell label={S.sampleId} lang={lang} value={report.sampleId} mono />
                  </div>
                  <div className="rp-patient-side">
                    <div className="rp-barcode"><SampleBarcode value={sampleCode} /></div>
                  </div>
                </section>
                {sampleText ? <p className="rp-sample" dir="auto">{sampleText}</p> : null}

                {summary.measured > 0 && design.showSummary ? (
                  <div className={cn("rp-summary", summary.outside === 0 ? "rp-summary-ok" : "rp-summary-flag")}>
                    {lang !== "ar" ? <span>{summaryLine("en", summary)}</span> : null}
                    {lang !== "en" ? <span dir="rtl">{summaryLine("ar", summary)}</span> : null}
                  </div>
                ) : null}

                {summary.critical > 0 && design.showSummary ? (
                  <div className="rp-critical" role="alert">
                    <b>{text(l2, S.criticalValues)}</b>
                    <ul>
                      {criticalTests.map((t) => (
                        <li key={`${t.categoryId}-${t.name}`}>
                          <span dir="ltr">{displayName(t.name)}</span>
                          <b dir="ltr">{t.value} {formatUnit(t.unit)}</b>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {groups.map((group) => (
                  <section key={group.en} className="rp-section">
                    <div className="rp-sec-head">
                      {lang !== "ar" ? <span className="rp-sec-en">{profileTitle(group.en)}</span> : null}
                      {lang !== "en" ? <span className="rp-sec-ar" dir="rtl">{group.ar}</span> : null}
                    </div>
                    <div className="rp-scroll">
                      <table className="rp-table">
                        <colgroup>
                          <col className="rp-c-test" /><col className="rp-c-res" />{design.showFlags ? <col className="rp-c-flag" /> : null}<col className="rp-c-unit" /><col />
                        </colgroup>
                        <thead>
                          <tr>
                            <th><PairLabel pair={S.test} lang={lang} /></th>
                            <th><PairLabel pair={S.result} lang={lang} /></th>
                            {design.showFlags ? <th className="rp-th-flag"><PairLabel pair={S.flag} lang={lang} /></th> : null}
                            <th><PairLabel pair={S.unit} lang={lang} /></th>
                            <th><PairLabel pair={S.reference} lang={lang} /></th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.tests.map((test) => {
                            const years = ageToYears(report.age, report.ageUnit);
                            const range = test.customRange || getNormalRange(test.name, report.gender, years, test.categoryId);
                            const interp = interpretResult(test.name, test.value, report.gender, test.customRange, years, test.categoryId);
                            const critical = isCritical(test.name, test.value);
                            const { code, tone } = flagCode(interp.flag, critical);
                            return (
                              <tr key={`${test.categoryId}-${test.name}`} className={cn(tone === "crit" && "rp-row-crit", tone === "high" && "rp-row-high", tone === "low" && "rp-row-low")}>
                                <td className="rp-t-name">
                                  <span dir="ltr">{displayName(test.name)}</span>
                                  {test.calculated ? <em>{text(l2, S.calculated)}</em> : null}
                                </td>
                                <td className={cn("rp-t-res", tone !== "none" && `rp-res-${tone}`)}>{test.value}</td>
                                {design.showFlags ? <td className="rp-t-flag">{code ? <b className={`rp-flag rp-flag-${tone}`}>{code}</b> : <span className="rp-dash">—</span>}</td> : null}
                                <td className="rp-t-unit" dir="ltr">{formatUnit(test.unit) || "—"}</td>
                                <td className="rp-t-ref">
                                  {isGlucose(test.name) ? (
                                    <AdaGlucoseRange value={test.value} />
                                  ) : (
                                    <>
                                      <span>{rangeLabel(test.name, range, report.gender, lang)}</span>
                                      <RangeBar range={range} value={test.value} flag={interp.flag} critical={critical} />
                                    </>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ))}

                {report.notes ? (
                  <p className="rp-notes"><strong>{text(l2, S.notes)}</strong> {report.notes}</p>
                ) : null}

                {design.showFlags ? (
                <div className="rp-legend">
                  <span><b className="rp-flag rp-flag-high">H</b> {text(l2, S.flagHigh)}</span>
                  <span><b className="rp-flag rp-flag-low">L</b> {text(l2, S.flagLow)}</span>
                  <span><b className="rp-flag rp-flag-crit">HH / LL</b> {text(l2, S.flagCritical)}</span>
                  <span><b className="rp-flag rp-flag-high">A</b> {text(l2, S.flagAbnormal)}</span>
                </div>
                ) : null}

                <section className="rp-sign">
                  <div className="rp-sign-col">
                    <div className="rp-sign-box" />
                    <p className="rp-sign-role">{text(l2, S.labSpecialist)}</p>
                  </div>
                  <div className="rp-sign-mid">
                    {stamp ? <img src={stamp} alt="" className="rp-stamp" /> : null}
                    {isFinal && design.showQr ? <ReportQrCode reportId={report.id} caption={text(l2, S.scanToVerify)} /> : null}
                  </div>
                  <div className="rp-sign-col">
                    <div className="rp-sign-box">{signature ? <img src={signature} alt="" className="rp-signature" /> : null}</div>
                    <p className="rp-sign-name">{brand.doctorName || text(l2, S.laboratoryDirector)}</p>
                    {brand.doctorDegree ? <p className="rp-sign-sub">{brand.doctorDegree}</p> : null}
                    <p className="rp-sign-role">{text(l2, S.pathologist)}</p>
                    {isFinal ? null : <p className="rp-sign-sub">{text(l2, S.cancelledReport)}</p>}
                  </div>
                </section>

                <p className="rp-end">— {text(l2, S.endOfReport)} —</p>
              </td>
            </tr>
          </tbody>
        </table>
      </article>
    </div>
  );
}
