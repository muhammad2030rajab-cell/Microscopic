/**
 * Client-only "Download PDF" for a report.
 *
 * Renders the already-visible print sheet DOM to a canvas (html2canvas) and
 * places it on a single PDF page sized to match (jsPDF) — so the button
 * downloads a real .pdf file in one click, instead of relying on the person
 * to open the browser's print dialog and manually choose "Save as PDF"
 * (which is what the old "حفظ PDF" button did: it only called
 * `window.print()`).
 *
 * Trade-off, stated plainly: this rasterizes the report (the PDF holds an
 * image, not selectable/searchable text). The alternative — a real
 * vector-text PDF — needs either a headless browser (Puppeteer/Chromium,
 * impractical to run reliably in a Vercel serverless function without extra
 * buildpack packages like @sparticuz/chromium) or rebuilding the entire
 * report layout a second time in a PDF-specific renderer (e.g.
 * @react-pdf/renderer, which also needs its own Arabic RTL text-shaping
 * setup to render correctly). Both are substantially larger efforts. For a
 * document whose purpose is to be printed, archived, or emailed as-is, a
 * crisp rasterized page is normally an acceptable trade for shipping a
 * one-click export now.
 *
 * Single-page only: if the captured content is taller than one A4 page, the
 * PDF page grows to fit it (rather than cropping), so nothing is ever cut
 * off — but very long reports won't get a clean page 2/3 split the way
 * browser printing does. In practice lab reports here are designed as one
 * fixed A4 sheet (see `.lab-sheet` in styles.css), so this should not come
 * up for a normal report.
 *
 * NEW DEPENDENCIES — not yet in package.json. Before this works, run:
 *   npm install html2canvas jspdf
 * (Could not verify the install or a real build here — this review has no
 * network access. Test the button after installing.)
 */
export async function downloadReportPdf(element: HTMLElement, filename: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const canvas = await html2canvas(element, {
    scale: 2, // 2x device pixels for a print-quality (not screen-blurry) result
    useCORS: true,
    backgroundColor: "#ffffff",
  });

  const imgData = canvas.toDataURL("image/png");
  const pageWidthMm = 210; // A4 portrait width
  const pageHeightMm = (canvas.height * pageWidthMm) / canvas.width;

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    // Use a real A4 page when the content fits it; otherwise size the page
    // to the content itself so nothing gets cropped (see docstring above).
    format: pageHeightMm > 297 ? [pageWidthMm, pageHeightMm] : "a4",
  });

  pdf.addImage(imgData, "PNG", 0, 0, pageWidthMm, pageHeightMm);
  pdf.save(filename);
}
