// Deploy: supabase functions deploy generate-rams-pdf
// Required secrets: SUPABASE_URL, ADMIN_SECRET_KEY
// Storage bucket: generated-documents (private) — path rams/{job_id}.pdf,
// see 20260802100000_rams.sql for the storage read policy.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import {
  createBrandedPage,
  drawContractorHeader,
  formatDocNumber,
  wrapText,
  DARK,
  MID,
  NAVY,
  MARGIN,
  PAGE_WIDTH,
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
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

const RISK_COLOR: Record<string, ReturnType<typeof rgb>> = {
  high: rgb(0.86, 0.15, 0.15),
  medium: rgb(0.85, 0.55, 0.05),
  low: rgb(0.09, 0.55, 0.2),
};

interface Hazard {
  hazard: string;
  risk_level: "low" | "medium" | "high";
  control_measures: string;
  residual_risk: "low" | "medium" | "high";
}

interface MethodStep {
  step_number: number;
  description: string;
  responsible: string;
}

interface JobRamsRow {
  id: string;
  job_id: string;
  contractor_id: string;
  site_address: string | null;
  job_description: string | null;
  hazards: Hazard[];
  method_steps: MethodStep[];
  ppe_requirements: string[];
  emergency_procedures: string | null;
  additional_notes: string | null;
  tailored_at: string | null;
  tailored_by: string | null;
  status: string;
  signed_off_at: string | null;
  signed_off_by_name: string | null;
  signed_off_by_role: string | null;
}

interface Job {
  id: string;
  job_number: number;
  title: string;
  location: string | null;
  contractor_id: string;
  customer_id: string;
  company_id: string | null;
  issued_quote_id: string | null;
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

async function buildRamsPdf(
  ramsRow: JobRamsRow,
  job: Job,
  contractor: ContractorProfile,
  clientName: string,
  assessorName: string,
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
  page.drawText("RISK ASSESSMENT & METHOD STATEMENT", { x: MARGIN, y, size: 16, font: bold, color: NAVY });
  const refW = bold.widthOfTextAtSize(jobRef, 12);
  page.drawText(jobRef, { x: PAGE_WIDTH - MARGIN - refW, y: y + 2, size: 12, font: bold, color: NAVY });
  y -= 30;

  // ── Section 1: Job details ──────────────────────────────────────────────
  ensureSpace(24);
  page.drawText("1. JOB DETAILS", { x: MARGIN, y, size: 10, font: bold, color: MID });
  y -= 16;

  const detailRows: [string, string][] = [
    ["Site address", ramsRow.site_address || job.location || "—"],
    ["Job description", ramsRow.job_description || job.title],
    ["Date of assessment", fmtDate(ramsRow.tailored_at ?? new Date().toISOString())],
    ["Assessor", assessorName],
    ["Client", clientName],
  ];
  for (const [label, value] of detailRows) {
    ensureSpace(14);
    page.drawText(`${label}:`, { x: MARGIN, y, size: 9, font: bold, color: DARK });
    const lines = wrapText(value, regular, 9, PAGE_WIDTH - 2 * MARGIN - 130);
    page.drawText(lines[0] ?? "", { x: MARGIN + 130, y, size: 9, font: regular, color: DARK });
    y -= 13;
    for (const extra of lines.slice(1)) {
      ensureSpace(13);
      page.drawText(extra, { x: MARGIN + 130, y, size: 9, font: regular, color: DARK });
      y -= 13;
    }
  }
  y -= 8;

  // ── Section 2: Hazard register ──────────────────────────────────────────
  ensureSpace(30);
  page.drawText("2. HAZARD REGISTER", { x: MARGIN, y, size: 10, font: bold, color: MID });
  y -= 16;

  const tableWidth = PAGE_WIDTH - 2 * MARGIN;
  const colHazard = MARGIN;
  const colRisk = MARGIN + tableWidth * 0.28;
  const colControl = MARGIN + tableWidth * 0.42;
  const colResidual = MARGIN + tableWidth * 0.84;

  if (ramsRow.hazards.length === 0) {
    ensureSpace(14);
    page.drawText("No hazards recorded.", { x: MARGIN, y, size: 9, font: regular, color: MID });
    y -= 16;
  }

  for (const h of ramsRow.hazards) {
    const hazardLines = wrapText(h.hazard, regular, 8, colRisk - colHazard - 6);
    const controlLines = wrapText(h.control_measures, regular, 8, colResidual - colControl - 6);
    const rowLines = Math.max(hazardLines.length, controlLines.length, 1);
    const rowHeight = rowLines * 10 + 6;

    ensureSpace(rowHeight + 4);
    const rowTop = y;

    page.drawText(hazardLines[0] ?? "", { x: colHazard, y: rowTop, size: 8, font: regular, color: DARK });
    hazardLines.slice(1).forEach((l, i) => page.drawText(l, { x: colHazard, y: rowTop - (i + 1) * 10, size: 8, font: regular, color: DARK }));

    const riskColor = RISK_COLOR[h.risk_level] ?? DARK;
    page.drawText(h.risk_level.toUpperCase(), { x: colRisk, y: rowTop, size: 8, font: bold, color: riskColor });

    controlLines.forEach((l, i) => page.drawText(l, { x: colControl, y: rowTop - i * 10, size: 8, font: regular, color: DARK }));

    const residualColor = RISK_COLOR[h.residual_risk] ?? DARK;
    page.drawText(h.residual_risk.toUpperCase(), { x: colResidual, y: rowTop, size: 8, font: bold, color: residualColor });

    y = rowTop - rowHeight;
    page.drawLine({ start: { x: MARGIN, y: y + 4 }, end: { x: MARGIN + tableWidth, y: y + 4 }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
    y -= 4;
  }
  y -= 8;

  // ── Section 3: Method statement ─────────────────────────────────────────
  ensureSpace(24);
  page.drawText("3. METHOD STATEMENT", { x: MARGIN, y, size: 10, font: bold, color: MID });
  y -= 16;

  if (ramsRow.method_steps.length === 0) {
    ensureSpace(14);
    page.drawText("No method steps recorded.", { x: MARGIN, y, size: 9, font: regular, color: MID });
    y -= 16;
  }

  for (const step of ramsRow.method_steps) {
    const lines = wrapText(step.description, regular, 9, PAGE_WIDTH - 2 * MARGIN - 30);
    ensureSpace(lines.length * 12 + 14);
    page.drawText(`${step.step_number}.`, { x: MARGIN, y, size: 9, font: bold, color: NAVY });
    lines.forEach((l, i) => page.drawText(l, { x: MARGIN + 20, y: y - i * 12, size: 9, font: regular, color: DARK }));
    y -= lines.length * 12;
    if (step.responsible) {
      page.drawText(`Responsible: ${step.responsible}`, { x: MARGIN + 20, y, size: 8, font: regular, color: MID });
      y -= 12;
    }
    y -= 4;
  }
  y -= 6;

  // ── Section 4: PPE requirements ─────────────────────────────────────────
  ensureSpace(24);
  page.drawText("4. PPE REQUIREMENTS", { x: MARGIN, y, size: 10, font: bold, color: MID });
  y -= 16;

  if (ramsRow.ppe_requirements.length === 0) {
    ensureSpace(14);
    page.drawText("No PPE requirements recorded.", { x: MARGIN, y, size: 9, font: regular, color: MID });
    y -= 16;
  } else {
    const cols = 2;
    const colWidth = tableWidth / cols;
    ramsRow.ppe_requirements.forEach((item, i) => {
      const col = i % cols;
      if (col === 0) ensureSpace(14);
      page.drawText(`✓ ${item}`, { x: MARGIN + col * colWidth, y, size: 9, font: regular, color: DARK });
      if (col === cols - 1) y -= 14;
    });
    if (ramsRow.ppe_requirements.length % cols !== 0) y -= 14;
  }
  y -= 8;

  // ── Section 5: Emergency procedures ─────────────────────────────────────
  ensureSpace(24);
  page.drawText("5. EMERGENCY PROCEDURES", { x: MARGIN, y, size: 10, font: bold, color: MID });
  y -= 16;
  const emergencyLines = wrapText(ramsRow.emergency_procedures || "Not specified.", regular, 9, tableWidth);
  for (const line of emergencyLines) {
    ensureSpace(13);
    page.drawText(line, { x: MARGIN, y, size: 9, font: regular, color: DARK });
    y -= 13;
  }
  y -= 8;

  // ── Section 6: Additional notes ─────────────────────────────────────────
  if (ramsRow.additional_notes) {
    ensureSpace(24);
    page.drawText("6. ADDITIONAL NOTES", { x: MARGIN, y, size: 10, font: bold, color: MID });
    y -= 16;
    const noteLines = wrapText(ramsRow.additional_notes, regular, 9, tableWidth);
    for (const line of noteLines) {
      ensureSpace(13);
      page.drawText(line, { x: MARGIN, y, size: 9, font: regular, color: DARK });
      y -= 13;
    }
    y -= 8;
  }

  // ── Section 7: Declaration ──────────────────────────────────────────────
  ensureSpace(70);
  page.drawText("7. DECLARATION", { x: MARGIN, y, size: 10, font: bold, color: MID });
  y -= 16;
  page.drawText("This RAMS has been specifically prepared for the above works.", { x: MARGIN, y, size: 9, font: regular, color: DARK });
  y -= 15;
  page.drawText(`Tailored by: ${ramsRow.tailored_by ?? "—"}`, { x: MARGIN, y, size: 9, font: regular, color: DARK });
  page.drawText(`Date: ${fmtDate(ramsRow.tailored_at)}`, { x: MARGIN + 260, y, size: 9, font: regular, color: DARK });
  y -= 15;
  if (ramsRow.status === "signed") {
    page.drawText(`Signed off by: ${ramsRow.signed_off_by_name ?? "—"}`, { x: MARGIN, y, size: 9, font: regular, color: DARK });
    y -= 13;
    page.drawText(`Role: ${ramsRow.signed_off_by_role ?? "—"}`, { x: MARGIN, y, size: 9, font: regular, color: DARK });
    page.drawText(`Date: ${fmtDate(ramsRow.signed_off_at)}`, { x: MARGIN + 260, y, size: 9, font: regular, color: DARK });
    y -= 15;
  }

  // ── Disclaimer footer ────────────────────────────────────────────────────
  ensureSpace(40);
  const disclaimer = "This document is provided as a tool to assist with health and safety planning. The contractor remains responsible for ensuring all risk assessments are adequate and site-specific. TradeStone does not provide professional health and safety advice.";
  const disclaimerLines = wrapText(disclaimer, regular, 7, tableWidth);
  for (const line of disclaimerLines) {
    ensureSpace(10);
    page.drawText(line, { x: MARGIN, y, size: 7, font: regular, color: MID });
    y -= 9;
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
    const { job_rams_id } = body as { job_rams_id?: string };
    if (!job_rams_id) return jsonResponse(400, { error: "job_rams_id is required" }, cors);

    const { data: ramsRow, error: ramsErr } = await supabase
      .from("job_rams")
      .select("*")
      .eq("id", job_rams_id)
      .maybeSingle();
    if (ramsErr) {
      console.error("[generate-rams-pdf] job_rams fetch failed:", ramsErr);
      return jsonResponse(500, { error: "Failed to load RAMS" }, cors);
    }
    if (!ramsRow) return jsonResponse(404, { error: "RAMS not found" }, cors);

    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("id, job_number, title, location, contractor_id, customer_id, company_id, issued_quote_id")
      .eq("id", ramsRow.job_id)
      .maybeSingle();
    if (jobErr || !job) {
      console.error("[generate-rams-pdf] job fetch failed:", jobErr);
      return jsonResponse(500, { error: "Failed to load job" }, cors);
    }

    // Auth: contractor must own the RAMS, or be a party on the job
    // (homeowner customer, or a member of the job's company for B2B/FM).
    let authorised = userData.user.id === job.contractor_id || userData.user.id === job.customer_id;
    if (!authorised && job.company_id) {
      const [{ data: ownedCompany }, { data: membership }] = await Promise.all([
        supabase.from("companies").select("id").eq("id", job.company_id).eq("owner_id", userData.user.id).maybeSingle(),
        supabase.from("business_members").select("id").eq("company_id", job.company_id).eq("profile_id", userData.user.id).eq("status", "active").maybeSingle(),
      ]);
      authorised = !!ownedCompany || !!membership;
    }
    if (!authorised) return jsonResponse(403, { error: "Forbidden" }, cors);

    const { data: contractor, error: contractorErr } = await supabase
      .from("profiles")
      .select("full_name, company_name, ts_profile_code, address, phone, email, vat_number, logo_url")
      .eq("id", job.contractor_id)
      .single();
    if (contractorErr || !contractor) {
      console.error("[generate-rams-pdf] contractor profile fetch failed:", contractorErr);
      return jsonResponse(500, { error: "Failed to load contractor profile" }, cors);
    }

    let clientName: string | null = null;
    if (job.issued_quote_id) {
      const { data: quoteRow } = await supabase
        .from("issued_quotes")
        .select("client_name")
        .eq("id", job.issued_quote_id)
        .maybeSingle();
      clientName = quoteRow?.client_name ?? null;
    }
    if (!clientName) {
      const { data: clientProfile } = await supabase
        .from("profiles")
        .select("full_name, company_name")
        .eq("id", job.customer_id)
        .maybeSingle();
      clientName = clientProfile?.company_name || clientProfile?.full_name || "Client";
    }

    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await buildRamsPdf(
        ramsRow as JobRamsRow,
        job as Job,
        contractor as ContractorProfile,
        clientName,
        (ramsRow as JobRamsRow).tailored_by || contractor.full_name || "Assessor",
      );
    } catch (err) {
      console.error("[generate-rams-pdf] PDF generation failed:", err);
      return jsonResponse(500, { error: "Failed to generate PDF" }, cors);
    }

    const filePath = `rams/${job.id}.pdf`;
    const { error: uploadErr } = await supabase.storage
      .from("generated-documents")
      .upload(filePath, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (uploadErr) {
      console.error("[generate-rams-pdf] upload failed:", uploadErr);
      return jsonResponse(500, { error: "Failed to upload PDF" }, cors);
    }

    const nowIso = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from("job_rams")
      .update({ pdf_storage_path: filePath, pdf_generated_at: nowIso })
      .eq("id", job_rams_id);
    if (updateErr) {
      console.error("[generate-rams-pdf] failed to record pdf metadata:", updateErr);
    }

    const { data: signedData, error: signErr } = await supabase.storage
      .from("generated-documents")
      .createSignedUrl(filePath, 60 * 60 * 48);
    if (signErr || !signedData) {
      console.error("[generate-rams-pdf] signed URL failed:", signErr);
      return jsonResponse(500, { error: "Failed to create download link" }, cors);
    }

    return jsonResponse(200, { url: signedData.signedUrl }, cors);
  } catch (err) {
    console.error("[generate-rams-pdf] unexpected error:", err);
    return jsonResponse(500, { error: "Internal server error" }, cors);
  }
});
