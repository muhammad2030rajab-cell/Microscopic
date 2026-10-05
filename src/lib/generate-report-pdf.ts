import { paginate } from "@/lib/pdf-pagination";

/**
 * Client-only "Download PDF" for a report.
 *
 * How it works (and what it deliberately does):
 *  1. The visible report is CLONED into an off-screen host that is exactly A4 wide (794 CSS px),
 *     so the PDF looks the same on a phone and on a desktop. (Capturing the visible element used to
 *     give a phone-width layout squeezed onto the page.)
 *  2. The clone is rasterised once with html2canvas.
 *  3. If it fits one A4 page it is placed as is. If not, it is cut into A4 pages at row/block
 *     boundaries (see pdf-pagination.ts), never through a table row. For the pro templates the
 *     header (and footer) are repeated on every page, and every page gets "n / N".
 *
 * Trade-off, stated plainly: the PDF holds images, not selectable text. A vector-text PDF needs a
 * headless browser or a second PDF-specific layout engine (see git history of this file for the
 * discussion); for a document that is printed, archived or sent on WhatsApp a crisp raster is the
 * pragmatic choice.
 *
 * html2canvas cannot parse modern CSS colour functions (color-mix(), oklch(), color()). Nothing in the
 * report sheets may use them: derived colours are computed in JS (report-design.ts: accentPalette).
 */

const A4_W_PX = 794; // 210 mm at 96 dpi
const A4_H_PX = 1123; // 297 mm at 96 dpi
const PAGE_NUMBER_RESERVE = 38; // px kept free at the bottom of every multi-page page
const MAX_CANVAS_PIXELS = 14_000_000; // stay under iOS Safari's ~16.7M-pixel canvas limit

/** Elements after which a page break is allowed (their bottom edge). */
const BREAK_AFTER = [
  ".rp-table tbody tr",
  ".lab-grid tbody tr",
  ".rp-title",
  ".rp-patient",
  ".rp-summary",
  ".rp-notes",
  ".rp-legend",
  ".rp-sign",
  ".rp-end",
].join(",");

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitForImages(root: HTMLElement): Promise<void> {
  const pending = [...root.querySelectorAll("img")]
    .filter((img) => !img.complete)
    .map((img) => new Promise<void>((resolve) => { img.onload = () => resolve(); img.onerror = () => resolve(); }));
  if (pending.length) await Promise.race([Promise.all(pending), new Promise((r) => setTimeout(r, 4000))]);
}

export async function buildReportPdf(element: HTMLElement): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);

  // Behind the app (z-index -1) rather than far off-screen: html2canvas renders elements that are
  // laid out in the viewport more reliably than ones at left:-10000px.
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = `position:fixed;left:0;top:0;z-index:-1;width:${A4_W_PX}px;background:#fff;pointer-events:none;`;
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".lab-sheet, .rp-sheet").forEach((el) => el.classList.add("is-exporting"));
  host.appendChild(clone);
  document.body.appendChild(host);

  try {
    await nextFrame();
    await nextFrame();
    if (document.fonts?.ready) await document.fonts.ready;
    await waitForImages(clone);

    const target = (clone.querySelector(".rp-sheet") ?? clone.querySelector(".print-sheet") ?? clone) as HTMLElement;
    const rect = target.getBoundingClientRect();
    const total = Math.ceil(rect.height);
    const rel = (el: Element, edge: "top" | "bottom") => el.getBoundingClientRect()[edge] - rect.top;

    const thead = target.querySelector(".rp-pages > thead");
    const tfoot = target.querySelector(".rp-pages > tfoot");
    const headerHeight = thead ? Math.round(rel(thead, "bottom")) : 0;
    const footerHeight = tfoot ? Math.round(total - rel(tfoot, "top")) : 0;
    const breakpoints = [...target.querySelectorAll(BREAK_AFTER)].map((el) => rel(el, "bottom"));

    const slices = paginate({ totalHeight: total, pageHeight: A4_H_PX, headerHeight, footerHeight, bottomReserve: PAGE_NUMBER_RESERVE, breakpoints });

    // "Preliminary" watermark: one big one is fine on a single page; across pages it would land on a
    // single page only, so it is taken out of the capture and drawn on every page below.
    const watermark = target.querySelector<HTMLElement>("[data-watermark]");
    const watermarkText = watermark?.textContent?.trim() ?? "";
    if (watermark && slices.length > 1) watermark.remove();

    const scale = Math.max(1, Math.min(2, Math.sqrt(MAX_CANVAS_PIXELS / (A4_W_PX * total))));
    const canvas = await html2canvas(target, {
      scale,
      useCORS: true,
      backgroundColor: "#ffffff",
      windowWidth: A4_W_PX,
      width: A4_W_PX,
    });

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    if (slices.length === 1) {
      // One page: exactly what is on screen.
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 210, (total * 210) / A4_W_PX);
    } else {
      const k = canvas.width / A4_W_PX; // real canvas pixels per CSS px
      const page = document.createElement("canvas");
      page.width = canvas.width;
      page.height = Math.round(A4_H_PX * k);
      const ctx = page.getContext("2d");
      if (!ctx) throw new Error("canvas unavailable");

      slices.forEach((slice, i) => {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, page.width, page.height);
        // header (repeats), body slice, footer (repeats, sits above the page number)
        if (headerHeight > 0) ctx.drawImage(canvas, 0, 0, canvas.width, headerHeight * k, 0, 0, canvas.width, headerHeight * k);
        ctx.drawImage(canvas, 0, slice.from * k, canvas.width, (slice.to - slice.from) * k, 0, headerHeight * k, canvas.width, (slice.to - slice.from) * k);
        if (footerHeight > 0) {
          ctx.drawImage(canvas, 0, (total - footerHeight) * k, canvas.width, footerHeight * k, 0, (A4_H_PX - PAGE_NUMBER_RESERVE - footerHeight) * k, canvas.width, footerHeight * k);
        }
        if (watermarkText) {
          ctx.save();
          ctx.translate(page.width / 2, (A4_H_PX / 2) * k);
          ctx.rotate(-Math.PI / 6);
          ctx.fillStyle = "rgba(180, 83, 9, 0.1)";
          ctx.font = `800 ${74 * k}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(watermarkText, 0, 0);
          ctx.restore();
        }
        ctx.fillStyle = "#64748b";
        ctx.font = `${9 * k}px sans-serif`;
        ctx.textBaseline = "alphabetic";
        ctx.textAlign = "center";
        ctx.fillText(`${i + 1} / ${slices.length}`, page.width / 2, (A4_H_PX - 14) * k);

        if (i > 0) pdf.addPage();
        pdf.addImage(page.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 210, 297);
      });
    }

    return pdf.output("blob");
  } finally {
    host.remove();
  }
}

/** Saves a Blob as a file download (what jsPDF.save() did before the build step was split out). */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function downloadReportPdf(element: HTMLElement, filename: string): Promise<void> {
  saveBlob(await buildReportPdf(element), filename);
}

/** True when this browser can hand a PDF file to the system share sheet (Android Chrome, iOS Safari...). */
export function canSharePdfFile(file: File): boolean {
  try {
    return typeof navigator !== "undefined" && typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}
