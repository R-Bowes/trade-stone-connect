// Deploy: supabase functions deploy generate-quote-pdf
// Required secrets: SUPABASE_URL, ADMIN_SECRET_KEY
// Storage bucket: generated-documents (private) — see
// 20260727150000_generated_documents_bucket_and_rls.sql

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { PDFDocument, StandardFonts } from "npm:pdf-lib@1.17.1";
import {
  createBrandedPage,
  drawContractorHeader,
  drawLineItemsTable,
  drawTotalsBlock,
  formatDocNumber,
  wrapText,
  DARK,
  MID,
  NAVY,
  WHITE,
  PALE,
  MARGIN,
  PAGE_WIDTH,
  PAGE_HEIGHT,
  LineItem,
} from "../_shared/pdfBranding.ts";

const ALLOWED_ORIGINS = [
  "https://tradesltd.co.uk",
  "https://www.tradesltd.co.uk",
  "http://localhost:5173",
  "http://localhost:4173",
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

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Frontend historically wrote items JSONB in snake_case (see
// SendQuoteDialog.tsx), but this parses both shapes defensively since the
// JSONB is untyped storage.
function normalizeItems(raw: unknown): LineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const r = item as Record<string, unknown>;
    const quantity = Number(r.quantity ?? 0);
    const unitPrice = Number(r.unit_price ?? r.unitPrice ?? 0);
    const total = Number(r.total ?? quantity * unitPrice);
    return {
      description: String(r.description ?? ""),
      quantity,
      unit_price: unitPrice,
      total,
    };
  });
}

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

interface IssuedQuote {
  id: string;
  contractor_id: string;
  quote_number: number;
  title: string;
  description: string | null;
  client_name: string;
  business_name: string | null;
  client_email: string;
  client_phone: string | null;
  client_address: string | null;
  items: unknown;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  deposit_required: boolean | null;
  deposit_percentage: number | null;
  deposit_amount: number | null;
  deposit_paid: boolean | null;
  completion_time: string | null;
  terms: string | null;
  notes: string | null;
  created_at: string;
  valid_until: string;
  payment_schedule: unknown;
}

interface PaymentScheduleStage {
  stage_number: number;
  title: string;
  percentage: number | null;
  trigger_type: string;
  trigger_date: string | null;
}

function normalizeStages(raw: unknown): PaymentScheduleStage[] {
  const stages = (raw as Record<string, unknown> | null)?.stages;
  if (!Array.isArray(stages)) return [];
  return stages.map((s) => {
    const r = s as Record<string, unknown>;
    return {
      stage_number: Number(r.stage_number ?? 0),
      title: String(r.title ?? ""),
      percentage: r.percentage != null ? Number(r.percentage) : null,
      trigger_type: String(r.trigger_type ?? "milestone"),
      trigger_date: r.trigger_date ? String(r.trigger_date) : null,
    };
  }).sort((a, b) => a.stage_number - b.stage_number);
}

const TRIGGER_LABEL: Record<string, string> = {
  on_acceptance: "On acceptance",
  milestone: "On milestone",
  date: "On date",
};

async function buildQuotePdf(quote: IssuedQuote, contractor: ContractorProfile): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let { page, y } = createBrandedPage(pdfDoc, { font: regular });

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN + 40) {
      ({ page, y } = createBrandedPage(pdfDoc, { font: regular }));
    }
  };

  y = await drawContractorHeader(page, y, contractor, regular, bold);

  const docNumber = formatDocNumber("Q", contractor.ts_profile_code ?? "", quote.quote_number);

  ensureSpace(60);
  y -= 10;
  page.drawText("QUOTATION", { x: MARGIN, y, size: 20, font: bold, color: NAVY });
  const numW = bold.widthOfTextAtSize(docNumber, 12);
  page.drawText(docNumber, { x: PAGE_WIDTH - MARGIN - numW, y: y + 4, size: 12, font: bold, color: NAVY });
  y -= 20;

  page.drawText(`Date issued: ${fmtDate(quote.created_at)}`, { x: MARGIN, y, size: 9, font: regular, color: MID });
  y -= 13;
  page.drawText(`Valid until: ${fmtDate(quote.valid_until)}`, { x: MARGIN, y, size: 9, font: regular, color: MID });
  y -= 24;

  // ── Client details ────────────────────────────────────────────────────────
  ensureSpace(80);
  page.drawText("CLIENT", { x: MARGIN, y, size: 8, font: bold, color: MID });
  y -= 14;
  page.drawText(quote.client_name, { x: MARGIN, y, size: 11, font: bold, color: DARK });
  y -= 14;
  if (quote.business_name) {
    page.drawText(quote.business_name, { x: MARGIN, y, size: 9, font: regular, color: DARK });
    y -= 13;
  }
  // Platform communications invariant: no phone/email on generated documents
  // — all contact goes via TradeStone messaging.
  for (const line of [quote.client_address].filter(Boolean)) {
    page.drawText(line as string, { x: MARGIN, y, size: 9, font: regular, color: DARK });
    y -= 13;
  }
  y -= 8;

  // ── Job title + description ─────────────────────────────────────────────────
  ensureSpace(40);
  page.drawText(quote.title, { x: MARGIN, y, size: 13, font: bold, color: NAVY });
  y -= 16;
  if (quote.description) {
    const lines = wrapText(quote.description, regular, 9, PAGE_WIDTH - 2 * MARGIN);
    for (const line of lines) {
      ensureSpace(14);
      page.drawText(line, { x: MARGIN, y, size: 9, font: regular, color: DARK });
      y -= 13;
    }
  }
  y -= 12;

  // ── Line items ────────────────────────────────────────────────────────────
  const items = normalizeItems(quote.items);
  ensureSpace(20 * (items.length + 1) + 20);
  y = drawLineItemsTable(page, y, items, regular, bold);
  y -= 10;

  // ── Totals ────────────────────────────────────────────────────────────────
  // A quotation is an offer document — it must never show live payment status
  // (deposit_paid). That belongs on the completion certificate only, which is
  // a post-completion record.
  ensureSpace(80);
  y = drawTotalsBlock(page, y, quote.subtotal, quote.tax_rate, quote.tax_amount, quote.total, regular, bold);
  if (quote.deposit_required && quote.deposit_percentage != null) {
    ensureSpace(14);
    const depositLine = quote.deposit_amount != null
      ? `Deposit required: ${quote.deposit_percentage}% — £${quote.deposit_amount.toFixed(2)}`
      : `Deposit required: ${quote.deposit_percentage}%`;
    page.drawText(depositLine, { x: MARGIN, y, size: 9, font: regular, color: MID });
    y -= 20;
  }

  const scheduleStages = normalizeStages(quote.payment_schedule);
  if (scheduleStages.length > 0) {
    ensureSpace(20 * (scheduleStages.length + 1) + 30);
    y -= 6;
    page.drawText("PAYMENT SCHEDULE", { x: MARGIN, y, size: 8, font: bold, color: MID });
    y -= 16;

    const tableWidth = PAGE_WIDTH - 2 * MARGIN;
    const colTrigger = MARGIN + tableWidth * 0.55;
    const colAmount = MARGIN + tableWidth * 0.8;
    const rowHeight = 18;

    page.drawRectangle({ x: MARGIN, y: y - rowHeight + 4, width: tableWidth, height: rowHeight, color: NAVY });
    const headerY = y - 12;
    page.drawText("Stage", { x: MARGIN + 6, y: headerY, size: 8, font: bold, color: WHITE });
    page.drawText("Trigger", { x: colTrigger, y: headerY, size: 8, font: bold, color: WHITE });
    const pctW = bold.widthOfTextAtSize("%", 8);
    page.drawText("%", { x: PAGE_WIDTH - MARGIN - 6 - pctW - 70, y: headerY, size: 8, font: bold, color: WHITE });
    const amtW = bold.widthOfTextAtSize("Amount", 8);
    page.drawText("Amount", { x: PAGE_WIDTH - MARGIN - 6 - amtW, y: headerY, size: 8, font: bold, color: WHITE });
    y -= rowHeight;

    scheduleStages.forEach((stage, i) => {
      if (i % 2 === 0) {
        page.drawRectangle({ x: MARGIN, y: y - rowHeight + 4, width: tableWidth, height: rowHeight, color: PALE });
      }
      const rowY = y - 12;
      const stageAmount = stage.percentage != null ? (quote.total * stage.percentage) / 100 : 0;
      page.drawText(`${stage.stage_number}. ${stage.title}`, { x: MARGIN + 6, y: rowY, size: 8, font: regular, color: DARK });
      page.drawText(TRIGGER_LABEL[stage.trigger_type] ?? stage.trigger_type, { x: colTrigger, y: rowY, size: 8, font: regular, color: DARK });
      const pctText = stage.percentage != null ? `${stage.percentage}%` : "—";
      const pctTextW = regular.widthOfTextAtSize(pctText, 8);
      page.drawText(pctText, { x: PAGE_WIDTH - MARGIN - 6 - pctTextW - 70, y: rowY, size: 8, font: regular, color: DARK });
      const amtText = `£${stageAmount.toFixed(2)}`;
      const amtTextW = regular.widthOfTextAtSize(amtText, 8);
      page.drawText(amtText, { x: PAGE_WIDTH - MARGIN - 6 - amtTextW, y: rowY, size: 8, font: regular, color: DARK });
      y -= rowHeight;
    });
    y -= 12;
  }

  if (quote.completion_time) {
    ensureSpace(16);
    page.drawText(`Estimated completion: ${quote.completion_time}`, { x: MARGIN, y, size: 9, font: regular, color: DARK });
    y -= 18;
  }

  if (quote.terms) {
    ensureSpace(20);
    page.drawText("TERMS", { x: MARGIN, y, size: 8, font: bold, color: MID });
    y -= 13;
    for (const line of wrapText(quote.terms, regular, 9, PAGE_WIDTH - 2 * MARGIN)) {
      ensureSpace(14);
      page.drawText(line, { x: MARGIN, y, size: 9, font: regular, color: DARK });
      y -= 13;
    }
    y -= 8;
  }

  if (quote.notes) {
    ensureSpace(20);
    page.drawText("NOTES", { x: MARGIN, y, size: 8, font: bold, color: MID });
    y -= 13;
    for (const line of wrapText(quote.notes, regular, 9, PAGE_WIDTH - 2 * MARGIN)) {
      ensureSpace(14);
      page.drawText(line, { x: MARGIN, y, size: 9, font: regular, color: DARK });
      y -= 13;
    }
  }

  if (scheduleStages.length > 0) {
    y -= 8;
    ensureSpace(20);
    for (const line of wrapText(
      "Any variations to the agreed scope of work will be documented and require your written approval before additional charges apply.",
      regular, 8, PAGE_WIDTH - 2 * MARGIN,
    )) {
      ensureSpace(12);
      page.drawText(line, { x: MARGIN, y, size: 8, font: regular, color: MID });
      y -= 12;
    }
  }

  return pdfDoc.save();
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
    const { quote_id } = body as { quote_id?: string };
    if (!quote_id) return jsonResponse(400, { error: "quote_id is required" }, cors);

    const { data: quote, error: quoteErr } = await supabase
      .from("issued_quotes")
      .select(
        "id, contractor_id, quote_number, title, description, client_name, business_name, " +
        "client_email, client_phone, client_address, items, subtotal, tax_rate, tax_amount, total, " +
        "deposit_required, deposit_percentage, deposit_amount, deposit_paid, completion_time, terms, " +
        "notes, created_at, valid_until, payment_schedule",
      )
      .eq("id", quote_id)
      .maybeSingle();
    if (quoteErr) {
      console.error("[generate-quote-pdf] quote fetch failed:", quoteErr);
      return jsonResponse(500, { error: "Failed to load quote" }, cors);
    }
    if (!quote) return jsonResponse(404, { error: "Quote not found" }, cors);

    // Two-step ownership check: resolve caller's profile id, compare against
    // the quote's contractor_id.
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", userData.user.id)
      .single();
    if (!callerProfile || quote.contractor_id !== callerProfile.id) {
      return jsonResponse(403, { error: "Forbidden" }, cors);
    }

    const { data: contractor, error: contractorErr } = await supabase
      .from("profiles")
      .select("full_name, company_name, ts_profile_code, address, phone, email, vat_number, logo_url")
      .eq("id", quote.contractor_id)
      .single();
    if (contractorErr || !contractor) {
      console.error("[generate-quote-pdf] contractor profile fetch failed:", contractorErr);
      return jsonResponse(500, { error: "Failed to load contractor profile" }, cors);
    }

    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await buildQuotePdf(quote as unknown as IssuedQuote, contractor as ContractorProfile);
    } catch (err) {
      console.error("[generate-quote-pdf] PDF generation failed:", err);
      return jsonResponse(500, { error: "Failed to generate PDF" }, cors);
    }

    const filePath = `quotes/${quote.contractor_id}/${quote.id}.pdf`;
    const { error: uploadErr } = await supabase.storage
      .from("generated-documents")
      .upload(filePath, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (uploadErr) {
      console.error("[generate-quote-pdf] upload failed:", uploadErr);
      return jsonResponse(500, { error: "Failed to upload PDF" }, cors);
    }

    const { data: signedData, error: signErr } = await supabase.storage
      .from("generated-documents")
      .createSignedUrl(filePath, 60 * 60 * 48);
    if (signErr || !signedData) {
      console.error("[generate-quote-pdf] signed URL failed:", signErr);
      return jsonResponse(500, { error: "Failed to create download link" }, cors);
    }

    return jsonResponse(200, { url: signedData.signedUrl }, cors);
  } catch (err) {
    console.error("[generate-quote-pdf] unexpected error:", err);
    return jsonResponse(500, { error: "Internal server error" }, cors);
  }
});
