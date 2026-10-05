/**
 * Page splitting for the "Download PDF" button. Pure (no DOM) so it can be unit-tested.
 *
 * The report is captured as ONE tall image. To make a multi-page PDF we cut that image into A4
 * pages, only at allowed places (the bottom edge of a table row or a block), never through a row,
 * and (for the pro templates) repeat the header and footer on every page.
 * All numbers are in the same unit (CSS px of the captured sheet).
 */
export type PaginateInput = {
  /** Total height of the captured sheet. */
  totalHeight: number;
  /** Height of one A4 page at the sheet's width. */
  pageHeight: number;
  /** Repeating header: occupies [0, headerHeight] and is drawn at the top of every page. */
  headerHeight: number;
  /** Repeating footer: occupies [totalHeight - footerHeight, totalHeight], drawn at the bottom of every page. */
  footerHeight: number;
  /** Space kept free at the very bottom of every page (page number). */
  bottomReserve: number;
  /** Y positions where a page break is allowed (bottom edges of rows / blocks). */
  breakpoints: number[];
};

export type PageSlice = { from: number; to: number };

export function paginate(input: PaginateInput): PageSlice[] {
  const { totalHeight, pageHeight, headerHeight, footerHeight, bottomReserve } = input;
  const bodyStart = headerHeight;
  const bodyEnd = totalHeight - footerHeight;

  // Fits on one page: keep the sheet exactly as it looks on screen (footer right under the content).
  if (totalHeight <= pageHeight) return [{ from: 0, to: totalHeight }];

  const capacity = pageHeight - headerHeight - footerHeight - bottomReserve;
  if (capacity <= 40) throw new Error("page too small for header + footer");

  const points = [...new Set(input.breakpoints.map((p) => Math.round(p)))].filter((p) => p > bodyStart && p < bodyEnd).sort((a, b) => a - b);

  const slices: PageSlice[] = [];
  let start = bodyStart;
  while (start < bodyEnd - 0.5) {
    const limit = start + capacity;
    if (bodyEnd <= limit + 0.5) {
      slices.push({ from: start, to: bodyEnd });
      break;
    }
    // Largest allowed break that still fits on this page; a hard cut only when nothing fits.
    let cut = limit;
    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i] <= limit && points[i] > start + 1) {
        cut = points[i];
        break;
      }
    }
    slices.push({ from: start, to: cut });
    start = cut;
  }
  return slices;
}
