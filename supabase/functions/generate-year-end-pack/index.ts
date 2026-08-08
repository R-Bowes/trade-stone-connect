// Deploy: supabase functions deploy generate-year-end-pack
// Required secrets: SUPABASE_URL, ADMIN_SECRET_KEY
// Storage bucket: generated-documents (private) — path year-end/{contractor_id}/{tax_year}.pdf
//
// Tax-year math (getTaxYearBounds) mirrors src/hooks/useFinanceSummary.ts's
// taxYearBounds/getTaxYear and src/hooks/useMileage.ts's getTaxYear —
// duplicated here because Edge Functions cannot import from src/ (same
// constraint documented in documentRefs.ts / pdfBranding.ts). Any change to
// UK-tax-year semantics must be applied in all three places.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { PDFDocument, PDFFont, PDFPage, StandardFonts } from "npm:pdf-lib@1.17.1";
import {
  createBrandedPage,
  drawContractorHeader,
  formatDocNumber,
  wrapText,
  DARK,
  MID,
  NAVY,
  ORANGE,
  PALE,
  LINE,
  WHITE,
  MARGIN,
  PAGE_WIDTH,
  PAGE_HEIGHT,
} from "../_shared/pdfBranding.ts";

const ALLOWED_ORIGINS = [
  "https://tradesltd.co.uk",
  "https://www.tradesltd.co.uk",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:8080",
];

const getCorsHeaders = (origin: string | null): HeadersInit => {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
};

const jsonResponse = (status: number, payload: Record<string, unknown>, cors: HeadersInit) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const DISCLAIMER = "This document is a financial summary, not tax advice. Consult a qualified accountant for tax filing purposes.";
const VAT_THRESHOLD = 90000;

// ── UK tax-year math (duplicated from src/hooks — see header note) ─────────

function getTaxYearBounds(taxYearLabel: string): { start: Date; end: Date } {
  const startYear = parseInt(taxYearLabel.split("-")[0], 10);
  return {
    start: new Date(startYear, 3, 6, 0, 0, 0, 0),
    end: new Date(startYear + 1, 3, 5, 23, 59, 59, 999),
  };
}

function getTaxYear(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const startYear = month > 4 || (month === 4 && day >= 6) ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

function currentQuarterBounds(referenceDate: Date): { start: Date; end: Date } {
  const month = referenceDate.getMonth() + 1;
  const year = referenceDate.getFullYear();
  let startMonth: number;
  if (month >= 4 && month <= 6) startMonth = 4;
  else if (month >= 7 && month <= 9) startMonth = 7;
  else if (month >= 10 && month <= 12) startMonth = 10;
  else startMonth = 1;
  return {
    start: new Date(year, startMonth - 1, 1, 0, 0, 0, 0),
    end: new Date(year, startMonth - 1 + 3, 0, 23, 59, 59, 999),
  };
}

function quarterLabelForDate(cursor: Date): string {
  const month = cursor.getMonth() + 1;
  const year = cursor.getFullYear();
  let n: number;
  let taxYearStartYear: number;
  if (month >= 4 && month <= 6) { n = 1; taxYearStartYear = year; }
  else if (month >= 7 && month <= 9) { n = 2; taxYearStartYear = year; }
  else if (month >= 10 && month <= 12) { n = 3; taxYearStartYear = year; }
  else { n = 4; taxYearStartYear = year - 1; }
  return `Q${n} ${taxYearStartYear}-${String((taxYearStartYear + 1) % 100).padStart(2, "0")}`;
}

function getQuartersInRange(start: Date, end: Date): { label: string; start: Date; end: Date }[] {
  const quarters: { label: string; start: Date; end: Date }[] = [];
  let cursor = currentQuarterBounds(start).start;
  let guard = 0;
  while (cursor <= end && guard < 40) {
    const qCalEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 3, 0, 23, 59, 59, 999);
    const overlapStart = cursor < start ? start : cursor;
    const overlapEnd = qCalEnd > end ? end : qCalEnd;
    const overlapDays = (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24);
    if (overlapDays >= 14) {
      quarters.push({ label: quarterLabelForDate(cursor), start: overlapStart, end: overlapEnd });
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 3, 1, 0, 0, 0, 0);
    guard += 1;
  }
  return quarters;
}

function inRange(dateStr: string | null, start: Date, end: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d >= start && d <= end;
}

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function gbp(n: number): string {
  return `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Generic table + page helpers ────────────────────────────────────────────

interface TableColumn {
  label: string;
  width: number; // fraction of table width, 0-1
  align?: "left" | "right";
}

interface PdfCtx {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  page: PDFPage;
  y: number;
}

function newPage(ctx: PdfCtx) {
  const { page, y } = createBrandedPage(ctx.doc, { font: ctx.font });
  ctx.page = page;
  ctx.y = y;
  // Second footer line (disclaimer) — createBrandedPage only draws the
  // "Powered by TradeStone" line, so this is added on top of it here.
  const size = 7;
  const w = ctx.font.widthOfTextAtSize(DISCLAIMER, size);
  ctx.page.drawText(DISCLAIMER, { x: (PAGE_WIDTH - w) / 2, y: 18, size, font: ctx.font, color: MID });
}

function ensureSpace(ctx: PdfCtx, needed: number) {
  if (ctx.y - needed < MARGIN + 40) newPage(ctx);
}

function drawRight(ctx: PdfCtx, text: string, rightX: number, y: number, size: number, font: PDFFont, color = DARK) {
  const w = font.widthOfTextAtSize(text, size);
  ctx.page.drawText(text, { x: rightX - w, y, size, font, color });
}

function drawSectionTitle(ctx: PdfCtx, title: string) {
  ensureSpace(ctx, 30);
  ctx.y -= 6;
  ctx.page.drawText(title, { x: MARGIN, y: ctx.y, size: 16, font: ctx.bold, color: NAVY });
  ctx.y -= 20;
}

function drawSubheading(ctx: PdfCtx, text: string) {
  ensureSpace(ctx, 20);
  ctx.page.drawText(text, { x: MARGIN, y: ctx.y, size: 10, font: ctx.bold, color: MID });
  ctx.y -= 16;
}

function drawTable(ctx: PdfCtx, columns: TableColumn[], rows: string[][]) {
  const tableWidth = PAGE_WIDTH - 2 * MARGIN;
  const rowHeight = 18;

  const colX: number[] = [];
  let cursor = MARGIN;
  for (const col of columns) {
    colX.push(cursor);
    cursor += col.width * tableWidth;
  }

  const drawHeader = () => {
    ensureSpace(ctx, rowHeight + 4);
    ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - rowHeight + 4, width: tableWidth, height: rowHeight, color: NAVY });
    const textY = ctx.y - 13;
    columns.forEach((col, i) => {
      if (col.align === "right") {
        drawRight(ctx, col.label, colX[i] + col.width * tableWidth - 6, textY, 8.5, ctx.bold, WHITE);
      } else {
        ctx.page.drawText(col.label, { x: colX[i] + 4, y: textY, size: 8.5, font: ctx.bold, color: WHITE });
      }
    });
    ctx.y -= rowHeight;
  };

  drawHeader();

  rows.forEach((row, i) => {
    ensureSpace(ctx, rowHeight + 4);
    // Re-draw header if we just paginated mid-table (ensureSpace triggers a
    // newPage() which resets y — detect via a stripe-index reset isn't
    // reliable, so header repeats simply based on remaining space each row).
    if (i % 2 === 0) {
      ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - rowHeight + 4, width: tableWidth, height: rowHeight, color: PALE });
    }
    const textY = ctx.y - 13;
    row.forEach((cell, ci) => {
      const col = columns[ci];
      if (col.align === "right") {
        drawRight(ctx, cell, colX[ci] + col.width * tableWidth - 6, textY, 8.5, ctx.font, DARK);
      } else {
        ctx.page.drawText(cell, { x: colX[ci] + 4, y: textY, size: 8.5, font: ctx.font, color: DARK });
      }
    });
    ctx.y -= rowHeight;
  });

  ctx.y -= 8;
}

function drawTotalsLine(ctx: PdfCtx, label: string, value: string, opts: { bold?: boolean; color?: typeof DARK } = {}) {
  ensureSpace(ctx, 18);
  const font = opts.bold ? ctx.bold : ctx.font;
  const color = opts.color ?? DARK;
  ctx.page.drawText(label, { x: MARGIN, y: ctx.y, size: 10, font, color });
  drawRight(ctx, value, PAGE_WIDTH - MARGIN, ctx.y, 10, font, color);
  ctx.y -= 16;
}

// ── Data shapes ──────────────────────────────────────────────────────────

interface ContractorProfile {
  full_name: string | null;
  company_name: string | null;
  ts_profile_code: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  vat_number: string | null;
  logo_url: string | null;
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = getCorsHeaders(origin);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("ADMIN_SECRET_KEY")!,
      { auth: { persistSession: false } },
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse(401, { error: "Unauthorized" }, cors);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !userData.user) return jsonResponse(401, { error: "Unauthorized" }, cors);

    const body = await req.json();
    const { tax_year } = body as { tax_year?: string };
    if (!tax_year || !/^\d{4}-\d{2}$/.test(tax_year)) {
      return jsonResponse(400, { error: "tax_year is required, e.g. '2026-27'" }, cors);
    }

    const { data: profileRow, error: profileErr } = await supabase
      .from("profiles")
      .select("id, full_name, company_name, ts_profile_code, address, phone, email, vat_number, logo_url")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (profileErr || !profileRow) {
      return jsonResponse(404, { error: "Contractor profile not found" }, cors);
    }
    const contractorId = profileRow.id as string;
    const contractor = profileRow as unknown as ContractorProfile;

    const { start, end } = getTaxYearBounds(tax_year);

    const [
      { data: settingsRow },
      { data: invoiceRows },
      { data: expenseRows },
      { data: categoryRows },
      { data: tripRows },
      { data: vehicleRows },
    ] = await Promise.all([
      supabase.from("finance_settings").select("*").eq("contractor_id", contractorId).maybeSingle(),
      supabase.from("invoices").select("*").eq("contractor_id", contractorId),
      supabase.from("expenses").select("*").eq("contractor_id", contractorId),
      supabase
        .from("expense_categories")
        .select("*")
        .or(`owner_contractor_id.is.null,owner_contractor_id.eq.${contractorId}`),
      supabase.from("mileage_trips").select("*").eq("contractor_id", contractorId),
      supabase.from("contractor_vehicles").select("*").eq("contractor_id", contractorId),
    ]);

    const invoices = invoiceRows ?? [];
    const expenses = expenseRows ?? [];
    const categories = categoryRows ?? [];
    const trips = (tripRows ?? []).filter((t) => t.tax_year === tax_year);
    const vehicles = vehicleRows ?? [];

    const paidInvoices = invoices.filter((inv) => inv.status === "paid" && inRange(inv.paid_date, start, end));
    const periodExpenses = expenses.filter((e) => inRange(e.expense_date, start, end));

    const parentCategoryName = (categoryId: string | null, fallback: string): string => {
      if (!categoryId) return fallback;
      const cat = categories.find((c) => c.id === categoryId);
      if (!cat) return fallback;
      if (!cat.parent_id) return cat.name;
      return categories.find((c) => c.id === cat.parent_id)?.name ?? cat.name;
    };

    // ── Build PDF ─────────────────────────────────────────────────────────

    const pdfDoc = await PDFDocument.create();
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const ctx: PdfCtx = { doc: pdfDoc, font: regular, bold, page: pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]), y: PAGE_HEIGHT };
    // Replace the placeholder page with a properly branded first page
    pdfDoc.removePage(0);
    newPage(ctx);

    // ── Page 1: Cover ────────────────────────────────────────────────────
    ctx.y = await drawContractorHeader(ctx.page, ctx.y, contractor, regular, bold);
    ctx.y -= 40;
    ctx.page.drawText("FINANCIAL SUMMARY", { x: MARGIN, y: ctx.y, size: 24, font: bold, color: NAVY });
    ctx.y -= 30;
    ctx.page.drawText(
      `Tax year: ${start.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} — ${end.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`,
      { x: MARGIN, y: ctx.y, size: 12, font: regular, color: DARK },
    );
    ctx.y -= 60;
    ctx.page.drawText("Prepared by TradeStone · tradesltd.co.uk", { x: MARGIN, y: ctx.y, size: 10, font: regular, color: MID });
    ctx.y -= 16;
    ctx.page.drawText(`Generated ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`, {
      x: MARGIN, y: ctx.y, size: 10, font: regular, color: MID,
    });

    // ── Page 2: Income Summary ──────────────────────────────────────────
    newPage(ctx);
    drawSectionTitle(ctx, "Income Summary");
    drawSubheading(ctx, `${paidInvoices.length} paid invoice${paidInvoices.length === 1 ? "" : "s"} in period`);

    if (paidInvoices.length > 0) {
      drawTable(
        ctx,
        [
          { label: "Invoice #", width: 0.16 },
          { label: "Client", width: 0.32 },
          { label: "Amount", width: 0.16, align: "right" },
          { label: "VAT", width: 0.12, align: "right" },
          { label: "Status", width: 0.1 },
          { label: "Paid Date", width: 0.14, align: "right" },
        ],
        paidInvoices.map((inv) => [
          formatDocNumber("INV", contractor.ts_profile_code ?? "", inv.invoice_number),
          inv.client_name,
          gbp(Number(inv.total)),
          gbp(Number(inv.tax_amount)),
          "Paid",
          fmtDate(inv.paid_date),
        ]),
      );
    } else {
      ensureSpace(ctx, 20);
      ctx.page.drawText("No paid invoices in this tax year.", { x: MARGIN, y: ctx.y, size: 10, font: regular, color: MID });
      ctx.y -= 20;
    }

    const totalInvoiced = paidInvoices.reduce((s, i) => s + Number(i.total), 0);
    const totalVatCharged = paidInvoices.reduce((s, i) => s + Number(i.tax_amount), 0);
    ensureSpace(ctx, 60);
    ctx.y -= 6;
    drawTotalsLine(ctx, "Total invoiced", gbp(totalInvoiced), { bold: true });
    drawTotalsLine(ctx, "Total VAT charged", gbp(totalVatCharged));
    drawTotalsLine(ctx, "Total received", gbp(totalInvoiced), { bold: true, color: NAVY });

    // ── Page 3: Expense Summary ──────────────────────────────────────────
    newPage(ctx);
    drawSectionTitle(ctx, "Expense Summary");

    const categorized = new Map<string, typeof periodExpenses>();
    for (const e of periodExpenses) {
      const name = parentCategoryName(e.category_id, e.category || "Other");
      const list = categorized.get(name) ?? [];
      list.push(e);
      categorized.set(name, list);
    }

    let grandTotal = 0;
    for (const [category, items] of Array.from(categorized.entries()).sort((a, b) => b[1].length - a[1].length)) {
      const categoryTotal = items.reduce((s, e) => s + Number(e.amount), 0);
      grandTotal += categoryTotal;
      drawSubheading(ctx, category.toUpperCase());
      drawTable(
        ctx,
        [
          { label: "Date", width: 0.14 },
          { label: "Description", width: 0.32 },
          { label: "Vendor", width: 0.2 },
          { label: "Amount", width: 0.15, align: "right" },
          { label: "VAT Reclaim", width: 0.19, align: "right" },
        ],
        items.map((e) => [
          fmtDate(e.expense_date),
          e.description,
          e.vendor ?? "—",
          gbp(Number(e.amount)),
          e.vat_reclaimable ? gbp(Number(e.vat_amount ?? 0)) : "—",
        ]),
      );
      drawTotalsLine(ctx, `${category} subtotal`, gbp(categoryTotal), { bold: true });
      ctx.y -= 6;
    }

    if (periodExpenses.length === 0) {
      ensureSpace(ctx, 20);
      ctx.page.drawText("No expenses logged in this tax year.", { x: MARGIN, y: ctx.y, size: 10, font: regular, color: MID });
      ctx.y -= 20;
    }

    ensureSpace(ctx, 20);
    drawTotalsLine(ctx, "Grand total (expenses)", gbp(grandTotal), { bold: true, color: NAVY });

    const totalMiles = trips.reduce((s, t) => s + Number(t.miles), 0);
    const totalMileageClaim = trips.reduce((s, t) => s + Number(t.claim_amount), 0);
    if (trips.length > 0) {
      ctx.y -= 10;
      drawSubheading(ctx, "MILEAGE");
      drawTotalsLine(ctx, "Total miles", totalMiles.toLocaleString("en-GB"));
      drawTotalsLine(ctx, "Total claim amount", gbp(totalMileageClaim), { bold: true });

      const byVehicle = new Map<string, { miles: number; claim: number }>();
      for (const t of trips) {
        const v = byVehicle.get(t.vehicle_id) ?? { miles: 0, claim: 0 };
        v.miles += Number(t.miles);
        v.claim += Number(t.claim_amount);
        byVehicle.set(t.vehicle_id, v);
      }
      for (const [vehicleId, totals] of byVehicle.entries()) {
        const vehicleName = vehicles.find((v) => v.id === vehicleId)?.name ?? "Unknown vehicle";
        drawTotalsLine(ctx, `  ${vehicleName}`, `${totals.miles.toLocaleString("en-GB")}mi — ${gbp(totals.claim)}`);
      }
    }

    // ── Page 4: P&L Statement ────────────────────────────────────────────
    newPage(ctx);
    drawSectionTitle(ctx, "Profit & Loss Statement");

    const totalCosts = grandTotal + totalMileageClaim;
    const grossProfit = totalInvoiced - totalCosts;
    const profitMargin = totalInvoiced > 0 ? (grossProfit / totalInvoiced) * 100 : 0;

    drawSubheading(ctx, "INCOME");
    drawTotalsLine(ctx, "Invoiced income (paid)", gbp(totalInvoiced));
    drawTotalsLine(ctx, "Total Income", gbp(totalInvoiced), { bold: true });
    ctx.y -= 10;

    drawSubheading(ctx, "COST OF SALES");
    for (const [category, items] of categorized.entries()) {
      const categoryTotal = items.reduce((s, e) => s + Number(e.amount), 0);
      drawTotalsLine(ctx, category, gbp(categoryTotal));
    }
    if (totalMileageClaim > 0) drawTotalsLine(ctx, "Mileage Claims", gbp(totalMileageClaim));
    drawTotalsLine(ctx, "Total Costs", gbp(totalCosts), { bold: true });
    ctx.y -= 10;

    drawSubheading(ctx, "PROFIT");
    drawTotalsLine(ctx, "Gross Profit", gbp(grossProfit), { bold: true, color: grossProfit >= 0 ? NAVY : DARK });
    drawTotalsLine(ctx, "Profit Margin", `${profitMargin.toFixed(1)}%`);

    // ── Page 5: VAT Summary ──────────────────────────────────────────────
    newPage(ctx);
    drawSectionTitle(ctx, "VAT Summary");

    const vatStatus = settingsRow?.vat_status ?? "not_registered";

    if (vatStatus === "standard") {
      const inputVat = periodExpenses.filter((e) => e.vat_reclaimable).reduce((s, e) => s + Number(e.vat_amount ?? 0), 0);
      const netVat = totalVatCharged - inputVat;
      drawTotalsLine(ctx, "Output VAT (charged)", gbp(totalVatCharged));
      drawTotalsLine(ctx, "Input VAT (reclaimable)", gbp(inputVat));
      drawTotalsLine(ctx, netVat >= 0 ? "Net VAT owed to HMRC" : "Net VAT reclaimable", gbp(Math.abs(netVat)), { bold: true, color: NAVY });
      ctx.y -= 10;

      drawSubheading(ctx, "QUARTERLY BREAKDOWN");
      const quarters = getQuartersInRange(start, end);
      drawTable(
        ctx,
        [
          { label: "Quarter", width: 0.3 },
          { label: "Output VAT", width: 0.23, align: "right" },
          { label: "Input VAT", width: 0.23, align: "right" },
          { label: "Net VAT", width: 0.24, align: "right" },
        ],
        quarters.map((q) => {
          const qOutput = invoices
            .filter((inv) => inv.status === "paid" && inRange(inv.paid_date, q.start, q.end))
            .reduce((s, inv) => s + Number(inv.tax_amount), 0);
          const qInput = expenses
            .filter((e) => e.vat_reclaimable && inRange(e.expense_date, q.start, q.end))
            .reduce((s, e) => s + Number(e.vat_amount ?? 0), 0);
          return [q.label, gbp(qOutput), gbp(qInput), gbp(qOutput - qInput)];
        }),
      );

      ctx.y -= 10;
      drawSubheading(ctx, "SA103 BOX MAPPING (GUIDANCE ONLY)");
      const materialsSub = (categorized.get("Materials & Stock")?.reduce((s, e) => s + Number(e.amount), 0) ?? 0)
        + (categorized.get("Subcontractor Costs")?.reduce((s, e) => s + Number(e.amount), 0) ?? 0);
      const vehicleExp = categorized.get("Vehicle & Travel")?.reduce((s, e) => s + Number(e.amount), 0) ?? 0;
      const otherExp = Math.max(0, totalCosts - materialsSub - vehicleExp);
      drawTable(
        ctx,
        [
          { label: "SA103 Box", width: 0.18 },
          { label: "Description", width: 0.42 },
          { label: "TradeStone Value", width: 0.4, align: "right" },
        ],
        [
          ["Box 15", "Turnover", gbp(totalInvoiced)],
          ["Box 17", "Cost of goods", gbp(materialsSub)],
          ["Box 18", "Car/van expenses", gbp(vehicleExp)],
          ["Box 20", "Wages/salaries", "N/A"],
          ["Box 25", "Other expenses", gbp(otherExp)],
          ["Box 29", "Total expenses", gbp(totalCosts)],
        ],
      );
      ensureSpace(ctx, 40);
      const noteLines = wrapText(
        "These mappings are for guidance only. Your accountant may categorise items differently based on your specific circumstances.",
        regular, 8.5, PAGE_WIDTH - 2 * MARGIN,
      );
      for (const line of noteLines) {
        ctx.page.drawText(line, { x: MARGIN, y: ctx.y, size: 8.5, font: regular, color: MID });
        ctx.y -= 12;
      }
    } else if (vatStatus === "flat_rate") {
      const flatRatePct = settingsRow?.flat_rate_percentage ?? 0;
      let firstYearDiscount = false;
      if (settingsRow?.flat_rate_start_date) {
        const startDate = new Date(settingsRow.flat_rate_start_date);
        const oneYearOn = new Date(startDate);
        oneYearOn.setFullYear(oneYearOn.getFullYear() + 1);
        firstYearDiscount = new Date() <= oneYearOn;
      }
      const effectiveRate = Math.max(0, flatRatePct - (firstYearDiscount ? 1 : 0));
      const flatRateDue = totalInvoiced * (effectiveRate / 100);

      drawTotalsLine(ctx, "Flat rate percentage", `${flatRatePct.toFixed(1)}%${firstYearDiscount ? " (1% first-year discount applied)" : ""}`);
      drawTotalsLine(ctx, "Total income (inc VAT)", gbp(totalInvoiced));
      drawTotalsLine(ctx, "VAT due to HMRC", gbp(flatRateDue), { bold: true, color: NAVY });
      ctx.y -= 10;

      drawSubheading(ctx, "QUARTERLY BREAKDOWN");
      const quarters = getQuartersInRange(start, end);
      drawTable(
        ctx,
        [
          { label: "Quarter", width: 0.34 },
          { label: "Income (inc VAT)", width: 0.33, align: "right" },
          { label: "Flat Rate VAT Due", width: 0.33, align: "right" },
        ],
        quarters.map((q) => {
          const qIncome = invoices
            .filter((inv) => inv.status === "paid" && inRange(inv.paid_date, q.start, q.end))
            .reduce((s, inv) => s + Number(inv.total), 0);
          return [q.label, gbp(qIncome), gbp(qIncome * (effectiveRate / 100))];
        }),
      );
    } else {
      const rollingStart = new Date();
      rollingStart.setFullYear(rollingStart.getFullYear() - 1);
      const rollingTurnover = invoices
        .filter((inv) => inv.status !== "draft" && inRange(inv.issued_date, rollingStart, new Date()))
        .reduce((s, inv) => s + Number(inv.total), 0);
      const thresholdPct = (rollingTurnover / VAT_THRESHOLD) * 100;

      drawTotalsLine(ctx, "VAT status", "Not registered");
      drawTotalsLine(ctx, "Rolling 12-month turnover", gbp(rollingTurnover));
      drawTotalsLine(ctx, "VAT registration threshold", gbp(VAT_THRESHOLD));
      drawTotalsLine(ctx, "Position", `${thresholdPct.toFixed(1)}% of threshold`, { bold: true, color: thresholdPct >= 80 ? ORANGE : NAVY });
    }

    // ── Page 6: Aged Debtors Snapshot (only if unpaid invoices exist) ────
    // Overdue is derived from due_date, never stored — see src/lib/invoiceMoney.ts.
    const unpaidAtYearEnd = invoices.filter((inv) => (inv.status === "sent" || inv.status === "viewed"));
    if (unpaidAtYearEnd.length > 0) {
      newPage(ctx);
      drawSectionTitle(ctx, "Aged Debtors Snapshot");
      drawSubheading(ctx, `As at ${end.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`);

      const buckets: Record<"current" | "thirty" | "sixty" | "ninety", number> = { current: 0, thirty: 0, sixty: 0, ninety: 0 };
      const rows = unpaidAtYearEnd.map((inv) => {
        const ageDays = Math.floor((end.getTime() - new Date(inv.issued_date).getTime()) / (1000 * 60 * 60 * 24));
        const bucketKey: "current" | "thirty" | "sixty" | "ninety" =
          ageDays <= 30 ? "current" : ageDays <= 60 ? "thirty" : ageDays <= 90 ? "sixty" : "ninety";
        buckets[bucketKey] += Number(inv.total);
        return [
          formatDocNumber("INV", contractor.ts_profile_code ?? "", inv.invoice_number),
          inv.client_name,
          gbp(Number(inv.total)),
          `${ageDays}d`,
          inv.due_date && new Date(inv.due_date) < end ? "Overdue" : "Sent",
        ];
      });

      drawTable(
        ctx,
        [
          { label: "Invoice #", width: 0.2 },
          { label: "Client", width: 0.32 },
          { label: "Amount", width: 0.18, align: "right" },
          { label: "Age", width: 0.15, align: "right" },
          { label: "Status", width: 0.15 },
        ],
        rows,
      );

      ctx.y -= 4;
      drawTotalsLine(ctx, "Current (0-30 days)", gbp(buckets.current));
      drawTotalsLine(ctx, "30-60 days", gbp(buckets.thirty));
      drawTotalsLine(ctx, "60-90 days", gbp(buckets.sixty));
      drawTotalsLine(ctx, "90+ days", gbp(buckets.ninety));
      drawTotalsLine(ctx, "Total outstanding", gbp(buckets.current + buckets.thirty + buckets.sixty + buckets.ninety), { bold: true, color: NAVY });
    }

    const pdfBytes = await pdfDoc.save();

    const filePath = `year-end/${contractorId}/${tax_year}.pdf`;
    const { error: uploadErr } = await supabase.storage
      .from("generated-documents")
      .upload(filePath, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (uploadErr) {
      console.error("[generate-year-end-pack] upload failed:", uploadErr);
      return jsonResponse(500, { error: "Failed to upload PDF" }, cors);
    }

    const { data: signedData, error: signErr } = await supabase.storage
      .from("generated-documents")
      .createSignedUrl(filePath, 60 * 60 * 48);
    if (signErr || !signedData) {
      console.error("[generate-year-end-pack] signed URL failed:", signErr);
      return jsonResponse(500, { error: "Failed to create download link" }, cors);
    }

    return jsonResponse(200, { url: signedData.signedUrl }, cors);
  } catch (err) {
    console.error("[generate-year-end-pack] unexpected error:", err);
    return jsonResponse(500, { error: "Internal server error" }, cors);
  }
});
