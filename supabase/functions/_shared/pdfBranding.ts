// supabase/functions/_shared/pdfBranding.ts
// ─────────────────────────────────────────────────────────────────────────────
// Shared pdf-lib building blocks for TradeStone's server-generated PDFs
// (generate-quote-pdf, generate-completion-pdf). Mirrors the visual language
// of generateInvoicePdf.ts (client-side jsPDF invoice) and the layout
// conventions established in generate-project-contract/index.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { PDFDocument, PDFFont, PDFPage, rgb, RGB } from "npm:pdf-lib@1.17.1";

export const PAGE_WIDTH = 595;
export const PAGE_HEIGHT = 842;
export const MARGIN = 50;
export const MARGIN_TOP = 60;

export const NAVY = rgb(26 / 255, 39 / 255, 68 / 255);
export const ORANGE = rgb(240 / 255, 120 / 255, 32 / 255);
export const WHITE = rgb(1, 1, 1);
export const DARK = rgb(0.1, 0.1, 0.1);
export const MID = rgb(0.4, 0.4, 0.4);
export const PALE = rgb(0.96, 0.96, 0.96);
export const LINE = rgb(0.85, 0.85, 0.85);

const FOOTER_TEXT = "Powered by TradeStone · tradesltd.co.uk";

// ── User-text sanitisation ──────────────────────────────────────────────────
// pdf-lib's standard fonts are WinAnsi-encoded (~Windows-1252) and THROW on
// any code point outside that set — this is what took the whole PDF down
// when a ✓ (U+2713) landed in drawText. Verified directly against
// @pdf-lib/standard-fonts' own shipped encoding table (not guessed): ASCII,
// Latin-1 supplement (café, naïve, etc.), and a defined set of typographic
// punctuation — em/en dash, curly quotes, bullet, ellipsis, trademark, euro
// — are all safe. Checkmarks, arrows, emoji, and most non-Latin scripts are
// not, and there is no server-side control over what a customer types into
// a job title, a checklist item on a phone keyboard, or a signatory name.
// Every user-supplied string must go through this before any drawText call.
const WINANSI_EXTRA_SAFE = new Set([
  0x20ac, // €
  0x2018, 0x2019, // ‘ ’
  0x201c, 0x201d, // “ ”
  0x2013, 0x2014, // – —
  0x2022, // •
  0x2026, // …
  0x2122, // ™
  0x2039, 0x203a, // ‹ ›
  0x2020, 0x2021, // † ‡
  0x2030, // ‰
  0x0152, 0x0153, // Œ œ
  0x0160, 0x0161, // Š š
  0x0178, 0x017d, 0x017e, // Ÿ Ž ž
  0x0192, // ƒ
  0x02c6, 0x02dc, // ˆ ˜
]);

export function sanitizeForPdf(text: string): string {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0x3f;
    if ((cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff) || WINANSI_EXTRA_SAFE.has(cp)) {
      out += ch;
    } else {
      out += "?";
    }
  }
  return out;
}

// ── Vector tick ──────────────────────────────────────────────────────────────
// Replaces a drawn "✓" glyph, which pdf-lib's WinAnsi standard fonts cannot
// encode (confirmed: not in the 218-entry table). No custom font embed —
// disproportionate for one glyph. x/y is the tick's bottom-left origin.
export function drawTick(page: PDFPage, x: number, y: number, color: RGB, size = 8): void {
  const s = size / 8;
  page.drawLine({ start: { x: x, y: y + 3 * s }, end: { x: x + 2.5 * s, y: y }, thickness: 1.3, color });
  page.drawLine({ start: { x: x + 2.5 * s, y: y }, end: { x: x + 7 * s, y: y + 6 * s }, thickness: 1.3, color });
}

// ── Text helpers ────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
export function wrapText(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const candidate = cur ? `${cur} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxW && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = candidate;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawRightAligned(
  page: PDFPage,
  text: string,
  rightX: number,
  y: number,
  size: number,
  font: PDFFont,
  color: RGB,
) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: rightX - w, y, size, font, color });
}

// ── Page + footer ────────────────────────────────────────────────────────────

export interface CreateBrandedPageOptions {
  /** Regular (non-bold) font, used to render the footer text. */
  font: PDFFont;
}

export interface BrandedPageResult {
  page: PDFPage;
  /** Usable Y position just below the top margin. */
  y: number;
}

export function createBrandedPage(
  pdfDoc: PDFDocument,
  options: CreateBrandedPageOptions,
): BrandedPageResult {
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const { font } = options;

  const footerSize = 10;
  const footerY = 30;
  const footerW = font.widthOfTextAtSize(FOOTER_TEXT, footerSize);
  page.drawText(FOOTER_TEXT, {
    x: (PAGE_WIDTH - footerW) / 2,
    y: footerY,
    size: footerSize,
    font,
    color: NAVY,
  });

  return { page, y: PAGE_HEIGHT - MARGIN_TOP };
}

// ── Contractor header ────────────────────────────────────────────────────────

export interface ContractorHeaderInfo {
  full_name: string | null;
  company_name?: string | null;
  ts_profile_code: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  vat_number: string | null;
  logo_url?: string | null;
}

export async function drawContractorHeader(
  page: PDFPage,
  y: number,
  contractor: ContractorHeaderInfo,
  font: PDFFont,
  boldFont: PDFFont,
): Promise<number> {
  const startY = y;
  let cursorY = y;
  let textX = MARGIN;
  // Bottom edge of the logo, if one was drawn — tracked separately from
  // cursorY because the logo and the text column are two independent
  // vertical extents from the same startY (logo at MARGIN, text at
  // textX). The returned cursor must clear whichever is taller, or
  // content drawn after this call overlaps a logo whose text column
  // (name/code/address/VAT) is shorter than 56px — exactly what happened
  // with "COMPLETION CERTIFICATE" overlapping the logo image.
  let logoBottomY: number | null = null;

  // TODO: remote logo embedding. pdf-lib needs raw PNG/JPG bytes, not a URL —
  // fetch, sniff content-type, embed. Any failure (network, unsupported
  // format, corrupt bytes) is swallowed so a bad logo never breaks the PDF.
  if (contractor.logo_url) {
    try {
      const res = await fetch(contractor.logo_url);
      if (res.ok) {
        const bytes = new Uint8Array(await res.arrayBuffer());
        const contentType = res.headers.get("content-type") ?? "";
        const isPng = contentType.includes("png") || /\.png($|\?)/i.test(contractor.logo_url);
        const isJpg = contentType.includes("jpeg") || contentType.includes("jpg") ||
          /\.jpe?g($|\?)/i.test(contractor.logo_url);

        const image = isPng
          ? await page.doc.embedPng(bytes)
          : isJpg
          ? await page.doc.embedJpg(bytes)
          : null;

        if (image) {
          const dim = image.scaleToFit(56, 56);
          const logoY = startY - dim.height;
          page.drawImage(image, {
            x: MARGIN,
            y: logoY,
            width: dim.width,
            height: dim.height,
          });
          textX = MARGIN + 70;
          logoBottomY = logoY;
        }
      }
    } catch (_err) {
      // logo fetch/embed failed — continue without it
    }
  }

  const name = sanitizeForPdf(contractor.company_name || contractor.full_name || "Contractor");
  cursorY -= 16;
  page.drawText(name, { x: textX, y: cursorY, size: 16, font: boldFont, color: NAVY });

  if (contractor.ts_profile_code) {
    cursorY -= 14;
    page.drawText(contractor.ts_profile_code, { x: textX, y: cursorY, size: 10, font, color: MID });
  }

  // Platform communications invariant: no phone/email on generated documents
  // — all contact goes via TradeStone messaging.
  const detailLines = [
    contractor.address,
    contractor.vat_number ? `VAT: ${contractor.vat_number}` : null,
  ].filter((l): l is string => Boolean(l));

  for (const line of detailLines) {
    cursorY -= 13;
    page.drawText(sanitizeForPdf(line), { x: textX, y: cursorY, size: 10, font, color: DARK });
  }

  if (logoBottomY !== null) {
    cursorY = Math.min(cursorY, logoBottomY);
  }

  return cursorY - 10;
}

// ── Line items table ──────────────────────────────────────────────────────────

export interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface LineItemsTableOptions {
  currency?: string;
}

export function drawLineItemsTable(
  page: PDFPage,
  y: number,
  items: LineItem[],
  font: PDFFont,
  boldFont: PDFFont,
  options: LineItemsTableOptions = {},
): number {
  const currency = options.currency ?? "£";
  const tableWidth = PAGE_WIDTH - 2 * MARGIN;
  const colQty = MARGIN + tableWidth * 0.55;
  const colUnit = MARGIN + tableWidth * 0.72;
  const rowHeight = 20;

  let cursorY = y;

  // Header row
  page.drawRectangle({
    x: MARGIN,
    y: cursorY - rowHeight + 4,
    width: tableWidth,
    height: rowHeight,
    color: NAVY,
  });
  const headerTextY = cursorY - 14;
  page.drawText("Description", { x: MARGIN + 6, y: headerTextY, size: 9, font: boldFont, color: WHITE });
  drawRightAligned(page, "Qty", colUnit - 8, headerTextY, 9, boldFont, WHITE);
  drawRightAligned(page, "Unit Price", MARGIN + tableWidth - 90, headerTextY, 9, boldFont, WHITE);
  drawRightAligned(page, "Total", MARGIN + tableWidth - 6, headerTextY, 9, boldFont, WHITE);
  cursorY -= rowHeight;

  items.forEach((item, i) => {
    if (i % 2 === 0) {
      page.drawRectangle({
        x: MARGIN,
        y: cursorY - rowHeight + 4,
        width: tableWidth,
        height: rowHeight,
        color: PALE,
      });
    }
    const rowTextY = cursorY - 14;
    page.drawText(sanitizeForPdf(item.description), { x: MARGIN + 6, y: rowTextY, size: 9, font, color: DARK });
    drawRightAligned(page, String(item.quantity), colUnit - 8, rowTextY, 9, font, DARK);
    drawRightAligned(page, `${currency}${item.unit_price.toFixed(2)}`, MARGIN + tableWidth - 90, rowTextY, 9, font, DARK);
    drawRightAligned(page, `${currency}${item.total.toFixed(2)}`, MARGIN + tableWidth - 6, rowTextY, 9, font, DARK);
    cursorY -= rowHeight;
  });

  return cursorY - 6;
}

// ── Totals block ──────────────────────────────────────────────────────────────

export interface TotalsBlockOptions {
  currency?: string;
  depositAmount?: number | null;
  depositPaid?: boolean | null;
}

export function drawTotalsBlock(
  page: PDFPage,
  y: number,
  subtotal: number,
  taxRate: number,
  taxAmount: number,
  total: number,
  font: PDFFont,
  boldFont: PDFFont,
  options: TotalsBlockOptions = {},
): number {
  const currency = options.currency ?? "£";
  const rightX = PAGE_WIDTH - MARGIN;
  const labelX = rightX - 160;
  let cursorY = y - 10;

  const row = (label: string, value: string, size = 10, f: PDFFont = font, color: RGB = DARK) => {
    page.drawText(label, { x: labelX, y: cursorY, size, font: f, color });
    drawRightAligned(page, value, rightX, cursorY, size, f, color);
    cursorY -= size + 8;
  };

  row("Subtotal", `${currency}${subtotal.toFixed(2)}`);
  row(`VAT (${taxRate}%)`, `${currency}${taxAmount.toFixed(2)}`);

  if (options.depositAmount != null) {
    row(
      "Deposit",
      `${currency}${options.depositAmount.toFixed(2)}${options.depositPaid ? " (paid)" : ""}`,
    );
  }

  page.drawLine({
    start: { x: labelX, y: cursorY + 4 },
    end: { x: rightX, y: cursorY + 4 },
    thickness: 0.75,
    color: LINE,
  });
  cursorY -= 8;

  row("Total", `${currency}${total.toFixed(2)}`, 14, boldFont, NAVY);

  return cursorY - 6;
}

// ── Document number formatting ────────────────────────────────────────────────
// Duplicated from src/lib/documentRefs.ts (formatQuoteRef/formatJobRef/
// formatInvoiceRef) — Edge Functions cannot import from src/lib. Any format
// change must be applied in both places.

function stripContractorCodePrefix(code: string): string {
  return code.replace(/^TS-C-/, "");
}

export function formatDocNumber(prefix: string, code: string, seq: number): string {
  const num = String(seq).padStart(4, "0");
  return `${prefix}-${stripContractorCodePrefix(code)}-${num}`;
}
