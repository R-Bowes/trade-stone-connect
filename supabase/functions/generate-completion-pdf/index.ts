// Deploy: supabase functions deploy generate-completion-pdf
// Required secrets: SUPABASE_URL, ADMIN_SECRET_KEY
// Storage bucket: generated-documents (private) — see
// 20260727150000_generated_documents_bucket_and_rls.sql
//
// HARD RULE: this PDF shows ONLY the accepted contractor's quote for the job
// it is generated for. It is scoped by jobs.issued_quote_id — never by
// job_id on the quotes table — so it can never surface a losing bid under
// the Projects competing-quotes model.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { PDFDocument, StandardFonts } from "npm:pdf-lib@1.17.1";
import {
  createBrandedPage,
  drawContractorHeader,
  drawLineItemsTable,
  drawTotalsBlock,
  drawTick,
  formatDocNumber,
  wrapText,
  sanitizeForPdf,
  DARK,
  MID,
  NAVY,
  WHITE,
  PALE,
  LINE,
  MARGIN,
  PAGE_WIDTH,
  LineItem,
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

function fmtDateTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).replace(",", ",");
}

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

interface Job {
  id: string;
  job_number: number;
  title: string;
  location: string | null;
  contractor_id: string;
  customer_id: string;
  issued_quote_id: string | null;
  created_at: string;
  actual_start: string | null;
  completed_at: string | null;
  contractor_signed_off_at: string | null;
  signed_off_at: string | null;
  // Site signature — captured on site by a team member. Deliberately
  // separate from signed_off_at (customer's own attested act) and
  // contractor_signed_off_at (contractor's own counter-signature); see
  // 20260808130000's column comments.
  site_signed_off_at: string | null;
  site_signed_off_name: string | null;
  site_signed_off_by: string | null;
}

interface ChecklistItemRow {
  item_text: string;
  stage: string;
  checked_by_name: string | null;
  checked_at: string | null;
}

interface IssuedQuoteSummary {
  created_at: string;
  accepted_at: string | null;
  client_name: string;
  items: unknown;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
}

interface PhotoRow {
  storage_path: string | null;
}

interface PaidInvoice {
  invoice_number: number;
  total: number;
  paid_date: string | null;
}

const VARIATION_REASON_LABELS: Record<string, string> = {
  client_request: "Client requested change",
  unforeseen_works: "Unforeseen works discovered",
  design_change: "Design change",
  regulatory_requirement: "Regulatory requirement",
  material_substitution: "Material substitution",
  other: "Other",
};

interface VariationRow {
  variation_number: number;
  title: string;
  reason: string;
  amount: number;
  status: string;
  responded_at: string | null;
}

const CERTIFICATE_TYPE_LABELS: Record<string, string> = {
  gas_safety: "Gas Safety Certificate (CP12)",
  electrical_eic: "Electrical Installation Certificate",
  electrical_minor_works: "Minor Electrical Works Certificate",
  fgas: "FGAS Certificate",
  building_regs: "Building Regulations Sign-off",
  fire_alarm: "Fire Alarm Certificate",
  pat_testing: "PAT Testing Certificate",
  pressure_test: "Pressure Test Certificate",
  commissioning: "Commissioning Certificate",
  manufacturer_warranty: "Manufacturer Warranty",
  workmanship_warranty: "Workmanship Warranty",
  other: "Other Certificate",
};

interface CertificateRow {
  certificate_type: string;
  certificate_name: string;
  certificate_number: string | null;
  issuer: string | null;
  issued_date: string;
  expiry_date: string | null;
  warranty_duration_months: number | null;
}

async function buildCompletionPdf(
  job: Job,
  contractor: ContractorProfile,
  quote: IssuedQuoteSummary | null,
  clientName: string,
  photos: PhotoRow[],
  invoice: PaidInvoice | null,
  certificates: CertificateRow[],
  variations: VariationRow[],
  checklistItems: ChecklistItemRow[],
  siteSignature: { storagePath: string; capturedByName: string | null } | null,
  fetchPhotoBytes: (path: string) => Promise<Uint8Array | null>,
): Promise<Uint8Array> {
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

  const jobRef = formatDocNumber("J", contractor.ts_profile_code ?? "", job.job_number);

  ensureSpace(60);
  y -= 10;
  page.drawText("COMPLETION CERTIFICATE", { x: MARGIN, y, size: 20, font: bold, color: NAVY });
  const refW = bold.widthOfTextAtSize(jobRef, 12);
  page.drawText(jobRef, { x: PAGE_WIDTH - MARGIN - refW, y: y + 4, size: 12, font: bold, color: NAVY });
  y -= 22;

  page.drawText(sanitizeForPdf(job.title), { x: MARGIN, y, size: 13, font: bold, color: DARK });
  y -= 16;
  page.drawText(`Client: ${sanitizeForPdf(clientName)}`, { x: MARGIN, y, size: 9, font: regular, color: MID });
  y -= 13;
  if (job.location) {
    page.drawText(`Location: ${sanitizeForPdf(job.location)}`, { x: MARGIN, y, size: 9, font: regular, color: MID });
    y -= 13;
  }
  y -= 12;

  // ── Timeline ─────────────────────────────────────────────────────────────
  ensureSpace(24);
  page.drawText("TIMELINE", { x: MARGIN, y, size: 8, font: bold, color: MID });
  y -= 16;

  const timelineEntries: Array<{ label: string; date: string | null }> = [
    { label: "Job created", date: fmtDateTime(job.created_at) },
    { label: "Quote issued", date: quote ? fmtDateTime(quote.created_at) : null },
    { label: "Quote accepted", date: quote ? fmtDateTime(quote.accepted_at) : null },
    { label: "Job started", date: fmtDateTime(job.actual_start) },
    { label: "Job completed", date: fmtDateTime(job.completed_at) },
    { label: "Contractor signed off", date: fmtDateTime(job.contractor_signed_off_at) },
    { label: "Client signed off", date: fmtDateTime(job.signed_off_at) },
  ];

  for (const entry of timelineEntries) {
    if (!entry.date) continue;
    ensureSpace(16);
    page.drawCircle({ x: MARGIN + 3, y: y + 3, size: 2.5, color: NAVY });
    page.drawText(entry.label, { x: MARGIN + 14, y, size: 9, font: bold, color: DARK });
    page.drawText(entry.date, { x: MARGIN + 180, y, size: 9, font: regular, color: MID });
    y -= 16;
  }
  y -= 10;

  // ── Quote breakdown (accepted contractor only) ──────────────────────────────
  if (quote) {
    ensureSpace(24);
    page.drawText("QUOTE BREAKDOWN", { x: MARGIN, y, size: 8, font: bold, color: MID });
    y -= 16;

    const items = normalizeItems(quote.items);
    ensureSpace(20 * (items.length + 1) + 20);
    y = drawLineItemsTable(page, y, items, regular, bold);
    y -= 10;

    ensureSpace(70);
    y = drawTotalsBlock(page, y, quote.subtotal, quote.tax_rate, quote.tax_amount, quote.total, regular, bold);
    y -= 10;
  }

  // ── Checklist (completed items only) ────────────────────────────────────────
  if (checklistItems.length > 0) {
    ensureSpace(24);
    page.drawText("CHECKLIST", { x: MARGIN, y, size: 8, font: bold, color: MID });
    y -= 16;

    for (const item of checklistItems) {
      ensureSpace(26);
      const lines = wrapText(sanitizeForPdf(item.item_text), regular, 9, PAGE_WIDTH - 2 * MARGIN - 16);
      drawTick(page, MARGIN, y - 6, NAVY);
      for (const [i, line] of lines.entries()) {
        if (i > 0) ensureSpace(13);
        page.drawText(line, { x: MARGIN + 14, y, size: 9, font: regular, color: DARK });
        if (i < lines.length - 1) y -= 13;
      }
      const who = [item.checked_by_name ? sanitizeForPdf(item.checked_by_name) : null, item.checked_at ? fmtDateTime(item.checked_at) : null]
        .filter((p): p is string => !!p)
        .join(" — ");
      if (who) {
        const whoW = regular.widthOfTextAtSize(who, 8);
        page.drawText(who, { x: PAGE_WIDTH - MARGIN - whoW, y, size: 8, font: regular, color: MID });
      }
      y -= 15;
    }
    y -= 6;
  }

  // ── Photos ────────────────────────────────────────────────────────────────
  const MAX_PHOTOS = 12;
  const shownPhotos = photos.slice(0, MAX_PHOTOS);
  if (shownPhotos.length > 0) {
    ensureSpace(24);
    page.drawText("SITE PHOTOS", { x: MARGIN, y, size: 8, font: bold, color: MID });
    y -= 16;

    const cols = 3;
    const gap = 10;
    const cellW = (PAGE_WIDTH - 2 * MARGIN - gap * (cols - 1)) / cols;
    const cellH = cellW * 0.75;

    let col = 0;
    ensureSpace(cellH + 10);
    let rowY = y;

    for (const photo of shownPhotos) {
      if (!photo.storage_path) continue;
      const bytes = await fetchPhotoBytes(photo.storage_path);
      if (!bytes) continue; // fetch failed — skip gracefully

      let image;
      try {
        image = photo.storage_path.match(/\.png$/i)
          ? await pdfDoc.embedPng(bytes)
          : await pdfDoc.embedJpg(bytes);
      } catch {
        continue; // corrupt/unsupported image bytes — skip gracefully
      }

      if (col === cols) {
        col = 0;
        rowY -= cellH + gap;
        y = rowY;
        ensureSpace(cellH + 10);
        rowY = y;
      }

      const dim = image.scaleToFit(cellW, cellH);
      const cellX = MARGIN + col * (cellW + gap);
      page.drawImage(image, {
        x: cellX + (cellW - dim.width) / 2,
        y: rowY - cellH + (cellH - dim.height) / 2,
        width: dim.width,
        height: dim.height,
      });
      col++;
    }
    y = rowY - cellH - 14;

    if (photos.length > MAX_PHOTOS) {
      ensureSpace(14);
      page.drawText("Additional photos available on TradeStone", {
        x: MARGIN, y, size: 8, font: regular, color: MID,
      });
      y -= 16;
    }
  }

  // ── Site signature ───────────────────────────────────────────────────────
  // Deliberately its own section, separate from the Timeline's contractor/
  // customer sign-off dates: this is a THIRD, distinct attestation — the
  // contractor (via a team member) asserting that someone signed on site —
  // not the customer's own authenticated act (Timeline: "Client signed
  // off") and not the contractor's own counter-signature (Timeline:
  // "Contractor signed off"). Never merge these.
  if (job.site_signed_off_at && siteSignature) {
    ensureSpace(24);
    page.drawText("SITE SIGNATURE", { x: MARGIN, y, size: 8, font: bold, color: MID });
    y -= 16;

    const sigBytes = await fetchPhotoBytes(siteSignature.storagePath);
    if (sigBytes) {
      try {
        const sigImage = siteSignature.storagePath.match(/\.png$/i)
          ? await pdfDoc.embedPng(sigBytes)
          : await pdfDoc.embedJpg(sigBytes);
        const sigDim = sigImage.scaleToFit(220, 90);
        ensureSpace(sigDim.height + 10);
        page.drawImage(sigImage, { x: MARGIN, y: y - sigDim.height, width: sigDim.width, height: sigDim.height });
        page.drawRectangle({
          x: MARGIN, y: y - sigDim.height, width: sigDim.width, height: sigDim.height,
          borderColor: LINE, borderWidth: 0.75,
        });
        y -= sigDim.height + 10;
      } catch {
        // corrupt/unsupported signature image bytes — fall through to the
        // attestation text below, which stands on its own regardless.
      }
    }

    ensureSpace(28);
    page.drawText(`Signed by: ${job.site_signed_off_name ? sanitizeForPdf(job.site_signed_off_name) : "Unknown"}`, { x: MARGIN, y, size: 9, font: bold, color: DARK });
    y -= 13;
    const capturedLine = [
      fmtDateTime(job.site_signed_off_at),
      siteSignature.capturedByName ? `Captured by ${sanitizeForPdf(siteSignature.capturedByName)}` : null,
    ].filter((p): p is string => !!p).join("   ·   ");
    page.drawText(capturedLine, { x: MARGIN, y, size: 8, font: regular, color: MID });
    y -= 16;
  }

  // ── Payment ──────────────────────────────────────────────────────────────
  if (invoice) {
    ensureSpace(50);
    page.drawText("PAYMENT", { x: MARGIN, y, size: 8, font: bold, color: MID });
    y -= 16;
    const invRef = formatDocNumber("INV", contractor.ts_profile_code ?? "", invoice.invoice_number);
    page.drawText(`Invoice: ${invRef}`, { x: MARGIN, y, size: 9, font: regular, color: DARK });
    y -= 13;
    page.drawText(`Amount paid: £${invoice.total.toFixed(2)}`, { x: MARGIN, y, size: 9, font: regular, color: DARK });
    y -= 13;
    if (invoice.paid_date) {
      page.drawText(`Date paid: ${fmtDateTime(invoice.paid_date)}`, { x: MARGIN, y, size: 9, font: regular, color: DARK });
      y -= 13;
    }
  }

  // ── Certificates & Warranties ───────────────────────────────────────────
  if (certificates.length > 0) {
    ensureSpace(24);
    y -= 6;
    page.drawText("CERTIFICATES & WARRANTIES", { x: MARGIN, y, size: 8, font: bold, color: MID });
    y -= 16;

    for (const cert of certificates) {
      ensureSpace(28);
      const typeLabel = sanitizeForPdf(CERTIFICATE_TYPE_LABELS[cert.certificate_type] ?? cert.certificate_type);
      page.drawText(sanitizeForPdf(cert.certificate_name), { x: MARGIN, y, size: 9, font: bold, color: DARK });
      const typeW = regular.widthOfTextAtSize(typeLabel, 8);
      page.drawText(typeLabel, { x: PAGE_WIDTH - MARGIN - typeW, y, size: 8, font: regular, color: MID });
      y -= 13;

      const detailParts = [
        cert.certificate_number ? `No. ${sanitizeForPdf(cert.certificate_number)}` : null,
        cert.issuer ? `Issuer: ${sanitizeForPdf(cert.issuer)}` : null,
        `Issued: ${fmtDateTime(cert.issued_date)?.split(",")[0] ?? cert.issued_date}`,
        cert.expiry_date ? `Expires: ${fmtDateTime(cert.expiry_date)?.split(",")[0] ?? cert.expiry_date}` : null,
        cert.warranty_duration_months ? `Duration: ${cert.warranty_duration_months} months` : null,
      ].filter((p): p is string => !!p);

      if (detailParts.length > 0) {
        const detailLine = detailParts.join("   ·   ");
        const lines = wrapText(detailLine, regular, 8, PAGE_WIDTH - 2 * MARGIN);
        for (const line of lines) {
          ensureSpace(12);
          page.drawText(line, { x: MARGIN, y, size: 8, font: regular, color: MID });
          y -= 12;
        }
      }
      y -= 4;
    }

    ensureSpace(14);
    page.drawText("Certificate documents are available for download on TradeStone.", {
      x: MARGIN, y, size: 8, font: regular, color: MID,
    });
    y -= 16;
  }

  // ── Variations ────────────────────────────────────────────────────────────
  const approvedVariations = variations.filter((v) => v.status === "approved");
  if (approvedVariations.length > 0) {
    ensureSpace(24);
    y -= 6;
    page.drawText("VARIATIONS", { x: MARGIN, y, size: 8, font: bold, color: MID });
    y -= 16;

    const tableWidth = PAGE_WIDTH - 2 * MARGIN;
    const colTitle = MARGIN + 30;
    const colReason = MARGIN + tableWidth * 0.42;
    const colAmount = MARGIN + tableWidth * 0.72;
    const colDate = MARGIN + tableWidth * 0.86;
    const rowHeight = 18;

    page.drawRectangle({ x: MARGIN, y: y - rowHeight + 4, width: tableWidth, height: rowHeight, color: NAVY });
    const headerY = y - 12;
    page.drawText("#", { x: MARGIN + 6, y: headerY, size: 8, font: bold, color: WHITE });
    page.drawText("Title / Reason", { x: colTitle, y: headerY, size: 8, font: bold, color: WHITE });
    page.drawText("Amount", { x: colAmount, y: headerY, size: 8, font: bold, color: WHITE });
    page.drawText("Approved", { x: colDate, y: headerY, size: 8, font: bold, color: WHITE });
    y -= rowHeight;

    for (const [i, v] of approvedVariations.entries()) {
      ensureSpace(rowHeight + 4);
      if (i % 2 === 0) {
        page.drawRectangle({ x: MARGIN, y: y - rowHeight + 4, width: tableWidth, height: rowHeight, color: PALE });
      }
      const rowY = y - 12;
      page.drawText(String(v.variation_number), { x: MARGIN + 6, y: rowY, size: 8, font: regular, color: DARK });
      page.drawText(sanitizeForPdf(v.title), { x: colTitle, y: rowY, size: 8, font: regular, color: DARK });
      page.drawText(sanitizeForPdf(VARIATION_REASON_LABELS[v.reason] ?? v.reason), { x: colReason, y: rowY, size: 7, font: regular, color: MID });
      const amtText = `${v.amount >= 0 ? "+" : ""}£${v.amount.toFixed(2)}`;
      page.drawText(amtText, { x: colAmount, y: rowY, size: 8, font: regular, color: DARK });
      page.drawText(v.responded_at ? (fmtDateTime(v.responded_at)?.split(",")[0] ?? "") : "", { x: colDate, y: rowY, size: 8, font: regular, color: DARK });
      y -= rowHeight;
    }
    y -= 10;

    const originalTotal = quote?.total ?? 0;
    const variationTotal = approvedVariations.reduce((sum, v) => sum + v.amount, 0);
    const finalTotal = originalTotal + variationTotal;
    ensureSpace(16);
    page.drawText(
      `Original contract: £${originalTotal.toFixed(2)}   |   Approved variations: ${variationTotal >= 0 ? "+" : ""}£${variationTotal.toFixed(2)}   |   Final contract value: £${finalTotal.toFixed(2)}`,
      { x: MARGIN, y, size: 8, font: bold, color: NAVY },
    );
    y -= 18;
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
    const { job_id } = body as { job_id?: string };
    if (!job_id) return jsonResponse(400, { error: "job_id is required" }, cors);

    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select(
        "id, job_number, title, location, contractor_id, customer_id, issued_quote_id, " +
        "created_at, actual_start, completed_at, contractor_signed_off_at, signed_off_at, " +
        "site_signed_off_at, site_signed_off_name, site_signed_off_by",
      )
      .eq("id", job_id)
      .maybeSingle();
    if (jobErr) {
      console.error("[generate-completion-pdf] job fetch failed:", jobErr);
      return jsonResponse(500, { error: "Failed to load job" }, cors);
    }
    if (!job) return jsonResponse(404, { error: "Job not found" }, cors);

    if (userData.user.id !== job.contractor_id && userData.user.id !== job.customer_id) {
      return jsonResponse(403, { error: "Forbidden" }, cors);
    }

    const { data: contractor, error: contractorErr } = await supabase
      .from("profiles")
      .select("full_name, company_name, ts_profile_code, address, phone, email, vat_number, logo_url")
      .eq("id", job.contractor_id)
      .single();
    if (contractorErr || !contractor) {
      console.error("[generate-completion-pdf] contractor profile fetch failed:", contractorErr);
      return jsonResponse(500, { error: "Failed to load contractor profile" }, cors);
    }

    // Accepted-contractor-only quote scope: keyed strictly off
    // jobs.issued_quote_id, never job_id on the quotes table.
    let quote: IssuedQuoteSummary | null = null;
    if (job.issued_quote_id) {
      const { data: quoteRow } = await supabase
        .from("issued_quotes")
        .select("created_at, accepted_at, client_name, items, subtotal, tax_rate, tax_amount, total")
        .eq("id", job.issued_quote_id)
        .maybeSingle();
      quote = quoteRow as IssuedQuoteSummary | null;
    }

    let clientName = quote?.client_name ?? null;
    if (!clientName) {
      const { data: clientProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", job.customer_id)
        .maybeSingle();
      clientName = clientProfile?.full_name ?? "Client";
    }

    // 'both'/'public' are not real visibility values — job_photos_visibility_check
    // permits only 'internal'/'customer' live, so that half of the original OR
    // clause could never match and this always returned zero rows. Fixed to the
    // real customer-facing value. Signature captures are job_photos rows too
    // (tags @> {signature}) but are NOT a job photo — excluded here; they get
    // their own SITE SIGNATURE section below instead.
    const { data: photoRows } = await supabase
      .from("job_photos")
      .select("storage_path, photo_approval_status, visibility")
      .eq("job_id", job_id)
      .or("photo_approval_status.eq.approved,visibility.eq.customer")
      .not("tags", "cs", '{signature}')
      .limit(12);
    const photos = (photoRows ?? []) as PhotoRow[];

    // Site signature — captured on site by a team member, distinct from
    // signed_off_at/by (the customer's own attested act) and
    // contractor_signed_off_at/name (the contractor's own counter-signature).
    // Never conflated in this document — see the dedicated section below.
    let siteSignature: { storagePath: string; capturedByName: string | null } | null = null;
    if (job.site_signed_off_at) {
      const { data: sigRow } = await supabase
        .from("job_photos")
        .select("storage_path")
        .eq("job_id", job_id)
        .contains("tags", ["signature"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let capturedByName: string | null = null;
      if (job.site_signed_off_by) {
        const { data: capturerProfile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", job.site_signed_off_by)
          .maybeSingle();
        capturedByName = capturerProfile?.full_name ?? null;
      }

      if (sigRow?.storage_path) {
        siteSignature = { storagePath: sigRow.storage_path, capturedByName };
      }
    }

    // Checklist — completed items only, with who ticked them and when.
    const { data: checklistRows } = await supabase
      .from("job_checklist_items")
      .select("item_text, stage, is_checked, checked_by, checked_at")
      .eq("job_id", job_id)
      .eq("is_checked", true)
      .order("stage", { ascending: true })
      .order("sort_order", { ascending: true });

    const checkedByIds = Array.from(
      new Set((checklistRows ?? []).map((r) => r.checked_by).filter((id): id is string => !!id)),
    );
    let checkedByNames: Record<string, string> = {};
    if (checkedByIds.length > 0) {
      const { data: checkerProfiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", checkedByIds);
      for (const p of checkerProfiles ?? []) {
        if (p.full_name) checkedByNames[p.id] = p.full_name;
      }
    }
    const checklistItems: ChecklistItemRow[] = (checklistRows ?? []).map((r) => ({
      item_text: r.item_text,
      stage: r.stage,
      checked_by_name: r.checked_by ? checkedByNames[r.checked_by] ?? null : null,
      checked_at: r.checked_at,
    }));

    const { data: invoiceRow } = await supabase
      .from("invoices")
      .select("invoice_number, total, paid_date")
      .eq("job_id", job_id)
      .eq("status", "paid")
      .maybeSingle();
    const invoice = invoiceRow as PaidInvoice | null;

    const { data: certificateRows } = await supabase
      .from("job_certificates")
      .select("certificate_type, certificate_name, certificate_number, issuer, issued_date, expiry_date, warranty_duration_months")
      .eq("job_id", job_id)
      .order("issued_date", { ascending: false });
    const certificates = (certificateRows ?? []) as CertificateRow[];

    const { data: variationRows } = await supabase
      .from("job_variations")
      .select("variation_number, title, reason, amount, status, responded_at")
      .eq("job_id", job_id)
      .eq("status", "approved")
      .order("variation_number", { ascending: true });
    const variations = (variationRows ?? []) as VariationRow[];

    const fetchPhotoBytes = async (path: string): Promise<Uint8Array | null> => {
      try {
        const { data, error } = await supabase.storage.from("job-photos").download(path);
        if (error || !data) return null;
        return new Uint8Array(await data.arrayBuffer());
      } catch {
        return null;
      }
    };

    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await buildCompletionPdf(
        job as Job,
        contractor as ContractorProfile,
        quote,
        clientName,
        photos,
        invoice,
        certificates,
        variations,
        checklistItems,
        siteSignature,
        fetchPhotoBytes,
      );
    } catch (err) {
      console.error("[generate-completion-pdf] PDF generation failed:", err);
      return jsonResponse(500, { error: "Failed to generate PDF" }, cors);
    }

    const filePath = `completions/${job_id}.pdf`;
    const { error: uploadErr } = await supabase.storage
      .from("generated-documents")
      .upload(filePath, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (uploadErr) {
      console.error("[generate-completion-pdf] upload failed:", uploadErr);
      return jsonResponse(500, { error: "Failed to upload PDF" }, cors);
    }

    const { data: signedData, error: signErr } = await supabase.storage
      .from("generated-documents")
      .createSignedUrl(filePath, 60 * 60 * 48);
    if (signErr || !signedData) {
      console.error("[generate-completion-pdf] signed URL failed:", signErr);
      return jsonResponse(500, { error: "Failed to create download link" }, cors);
    }

    return jsonResponse(200, { url: signedData.signedUrl }, cors);
  } catch (err) {
    console.error("[generate-completion-pdf] unexpected error:", err);
    return jsonResponse(500, { error: "Internal server error" }, cors);
  }
});
