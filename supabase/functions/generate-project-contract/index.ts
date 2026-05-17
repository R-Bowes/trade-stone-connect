// Deploy: supabase functions deploy generate-project-contract
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Storage bucket: project-contracts (public) — created automatically on first run

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const PLATFORM = "TradeStone";

const ALLOWED_ORIGINS = [
  "https://tradesltd.co.uk",
  "https://www.tradesltd.co.uk",
  "http://localhost:5173",
  "http://localhost:4173",
];

const getCorsHeaders = (origin: string | null): HeadersInit => {
  const allowed =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
};

const jsonResponse = (
  status: number,
  payload: Record<string, unknown>,
  cors: HeadersInit,
) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtGBP(n: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ── Word-wrap helper ──────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
function wrapText(text: string, font: any, size: number, maxW: number): string[] {
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

// ── Types ─────────────────────────────────────────────────────────────────────

type PhaseJson = {
  title: string;
  description: string | null;
  cost: number;
  duration_days: number;
  start_date: string;
};

type ProfileSnap = {
  full_name: string | null;
  company_name: string | null;
  ts_profile_code: string | null;
};

function partyLabel(p: ProfileSnap) {
  return p.company_name || p.full_name || "Unknown";
}

function materialsLabel(m: string | null) {
  if (!m) return "To be agreed";
  return (
    { contractor: "Contractor supplied", client: "Client supplied", mixed: "Mixed" }[m] ?? m
  );
}

// ── PDF builder ───────────────────────────────────────────────────────────────

async function buildContractPdf(opts: {
  contractRef: string;
  project: {
    title: string;
    description: string | null;
    address_line_1: string | null;
    address_line_2: string | null;
    city: string | null;
    postcode: string | null;
    deposit_required: boolean | null;
    deposit_percentage: number | null;
    retention_percentage: number | null;
  };
  proposal: {
    phases: PhaseJson[];
    total_cost: number | null;
    timeline_start: string | null;
    timeline_end: string | null;
    materials_responsibility: string | null;
    payment_terms: string | null;
  };
  client: ProfileSnap;
  contractor: ProfileSnap;
}): Promise<Uint8Array> {
  const { contractRef, project, proposal, client, contractor } = opts;

  const pdfDoc = await PDFDocument.create();
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Page constants (A4 in points)
  const PW = 595, PH = 842, M = 50, CW = PW - 2 * M;

  // Colours
  const NAVY   = rgb(15 / 255,  39 / 255,  68 / 255);
  const ORANGE = rgb(240 / 255, 120 / 255, 32 / 255);
  const DARK   = rgb(0.10, 0.10, 0.10);
  const MID    = rgb(0.35, 0.35, 0.35);
  const PALE   = rgb(0.96, 0.96, 0.96);
  const LINEC  = rgb(0.82, 0.82, 0.82);
  const WHITE  = rgb(1, 1, 1);

  // Shared mutable state — all inner helpers close over these
  let page = pdfDoc.addPage([PW, PH]);
  let y = PH;

  const ensureSpace = (needed: number) => {
    if (y - needed < M + 30) {
      page = pdfDoc.addPage([PW, PH]);
      y = PH - M;
    }
  };

  // deno-lint-ignore no-explicit-any
  const dt = (text: string, x: number, yPos: number, size: number, font: any, color: any) =>
    page.drawText(text, { x, y: yPos, size, font, color });

  const hline = (x1: number, y1: number, x2: number, y2: number) =>
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.5, color: LINEC });

  // deno-lint-ignore no-explicit-any
  const fillRect = (rx: number, ry: number, rw: number, rh: number, color: any) =>
    page.drawRectangle({ x: rx, y: ry, width: rw, height: rh, color });

  // ── Header bar (first page only) ────────────────────────────────────────────
  fillRect(0, PH - 60, PW, 60, NAVY);
  dt(PLATFORM, M, PH - 33, 20, bold, WHITE);
  dt("Contract Agreement", M, PH - 49, 9, regular, rgb(0.72, 0.77, 0.85));
  const refW = bold.widthOfTextAtSize(contractRef, 9);
  dt(contractRef, PW - M - refW, PH - 36, 9, bold, ORANGE);
  y = PH - 80;

  // ── Section heading ──────────────────────────────────────────────────────────
  const section = (label: string) => {
    ensureSpace(28);
    y -= 16;
    fillRect(M, y - 2, CW, 18, PALE);
    page.drawText(label.toUpperCase(), { x: M + 6, y: y + 3, size: 8, font: bold, color: NAVY });
    y -= 12;
  };

  // ── Key-value row ────────────────────────────────────────────────────────────
  const kv = (label: string, value: string, lw = 140) => {
    ensureSpace(18);
    y -= 14;
    page.drawText(label, { x: M,      y, size: 9, font: bold,    color: MID  });
    page.drawText(value, { x: M + lw, y, size: 9, font: regular, color: DARK });
  };

  // ── PARTIES ──────────────────────────────────────────────────────────────────
  section("Parties");
  kv("Client",
    `${partyLabel(client)}${client.ts_profile_code ? `  (${client.ts_profile_code})` : ""}`);
  kv("Contractor",
    `${partyLabel(contractor)}${contractor.ts_profile_code ? `  (${contractor.ts_profile_code})` : ""}`);

  // ── PROJECT DETAILS ──────────────────────────────────────────────────────────
  section("Project Details");
  kv("Title", project.title);

  const loc = [project.address_line_1, project.address_line_2, project.city, project.postcode]
    .filter(Boolean).join(", ");
  if (loc) kv("Location", loc);

  if (project.description) {
    ensureSpace(18);
    y -= 14;
    page.drawText("Description", { x: M, y, size: 9, font: bold, color: MID });
    const lines = wrapText(project.description, regular, 9, CW - 145).slice(0, 10);
    let first = true;
    for (const l of lines) {
      if (!first) { ensureSpace(14); y -= 12; }
      page.drawText(l, { x: M + 140, y, size: 9, font: regular, color: DARK });
      first = false;
    }
  }

  // ── PHASE BREAKDOWN ──────────────────────────────────────────────────────────
  section("Phase Breakdown");

  const COL = { PHASE: M, DESC: M + 130, COST: M + 290, DAYS: M + 360, START: M + 405 };
  const ROW_H = 18;

  ensureSpace(ROW_H + 6);
  y -= 6;
  fillRect(M, y - ROW_H + 4, CW, ROW_H, NAVY);
  const thY = y - 10;
  dt("Phase",       COL.PHASE + 4, thY, 7.5, bold, WHITE);
  dt("Description", COL.DESC  + 4, thY, 7.5, bold, WHITE);
  dt("Cost",        COL.COST  + 4, thY, 7.5, bold, WHITE);
  dt("Days",        COL.DAYS  + 4, thY, 7.5, bold, WHITE);
  dt("Start date",  COL.START + 4, thY, 7.5, bold, WHITE);
  y -= ROW_H;

  for (let i = 0; i < proposal.phases.length; i++) {
    const ph = proposal.phases[i];
    ensureSpace(ROW_H + 2);
    if (i % 2 === 0) fillRect(M, y - ROW_H + 6, CW, ROW_H, PALE);

    // Truncate phase title to fit column
    let title = `${i + 1}. ${ph.title}`;
    while (bold.widthOfTextAtSize(title, 8) > 120 && title.length > 3) title = title.slice(0, -1);

    // Truncate description to fit column
    let desc = ph.description ?? "";
    const DESC_MAX = 148;
    if (desc && regular.widthOfTextAtSize(desc, 8) > DESC_MAX) {
      while (regular.widthOfTextAtSize(desc + "…", 8) > DESC_MAX && desc.length) desc = desc.slice(0, -1);
      desc += "…";
    }

    const ry = y - 10;
    dt(title,                   COL.PHASE + 4, ry, 8, bold,    DARK);
    if (desc) dt(desc,          COL.DESC  + 4, ry, 8, regular, MID);
    dt(fmtGBP(ph.cost),        COL.COST  + 4, ry, 8, regular, DARK);
    dt(String(ph.duration_days),COL.DAYS  + 4, ry, 8, regular, DARK);
    dt(fmtDate(ph.start_date), COL.START + 4, ry, 8, regular, DARK);
    y -= ROW_H;
  }
  hline(M, y + 6, M + CW, y + 6);

  // ── FINANCIAL SUMMARY ────────────────────────────────────────────────────────
  section("Financial Summary");
  if (proposal.total_cost != null) kv("Total contract value", fmtGBP(proposal.total_cost));

  if (project.deposit_required && project.deposit_percentage != null) {
    const depositAmt = proposal.total_cost
      ? (proposal.total_cost * project.deposit_percentage) / 100
      : null;
    kv("Deposit",
      `${project.deposit_percentage}%${depositAmt ? `  (${fmtGBP(depositAmt)})` : ""}`);
  }
  if (project.retention_percentage != null && project.retention_percentage > 0) {
    kv("Retention", `${project.retention_percentage}% until practical completion`);
  }

  // ── TIMELINE ─────────────────────────────────────────────────────────────────
  section("Timeline");
  if (proposal.timeline_start) kv("Start date", fmtDate(proposal.timeline_start));
  if (proposal.timeline_end)   kv("End date",   fmtDate(proposal.timeline_end));

  // ── TERMS ─────────────────────────────────────────────────────────────────────
  section("Terms");
  kv("Materials", materialsLabel(proposal.materials_responsibility));
  if (proposal.payment_terms) {
    // Single-line truncation for payment terms
    let terms = proposal.payment_terms;
    const termsMax = CW - 145;
    if (regular.widthOfTextAtSize(terms, 9) > termsMax) {
      while (regular.widthOfTextAtSize(terms + "…", 9) > termsMax && terms.length) terms = terms.slice(0, -1);
      terms += "…";
    }
    kv("Payment terms", terms);
  }

  // ── SIGNATURES ────────────────────────────────────────────────────────────────
  ensureSpace(130);
  y -= 22;
  page.drawText("SIGNATURES", { x: M, y, size: 8, font: bold, color: NAVY });
  y -= 8;
  page.drawLine({ start: { x: M, y }, end: { x: M + CW, y }, thickness: 0.5, color: LINEC });
  y -= 18;

  const SIG_W = (CW - 20) / 2;
  const BOX_H = 86;
  const sigY = y;

  [{ bx: M, who: client, label: "CLIENT" }, { bx: M + SIG_W + 20, who: contractor, label: "CONTRACTOR" }]
    .forEach(({ bx, who, label }) => {
      page.drawRectangle({ x: bx, y: sigY - BOX_H, width: SIG_W, height: BOX_H, color: rgb(0.98, 0.98, 0.98) });
      page.drawText(label,            { x: bx + 8, y: sigY - 14, size: 7.5, font: bold,    color: NAVY });
      page.drawText(partyLabel(who),  { x: bx + 8, y: sigY - 26, size: 8,   font: regular, color: DARK });
      if (who.ts_profile_code) {
        page.drawText(who.ts_profile_code, { x: bx + 8, y: sigY - 37, size: 7, font: regular, color: MID });
      }
      page.drawText("Signature:", { x: bx + 8, y: sigY - 53, size: 8, font: regular, color: MID });
      page.drawLine({ start: { x: bx + 72, y: sigY - 51 }, end: { x: bx + SIG_W - 8, y: sigY - 51 }, thickness: 0.7, color: LINEC });
      page.drawText("Date:", { x: bx + 8, y: sigY - 69, size: 8, font: regular, color: MID });
      page.drawLine({ start: { x: bx + 42, y: sigY - 67 }, end: { x: bx + SIG_W - 8, y: sigY - 67 }, thickness: 0.7, color: LINEC });
    });

  // ── FOOTER (stamped on every page after all content is laid out) ─────────────
  const genDate = new Date().toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
  const footerText = `Generated by ${PLATFORM}  ·  ${genDate}`;
  const pageCount = pdfDoc.getPageCount();

  for (let i = 0; i < pageCount; i++) {
    const pg = pdfDoc.getPage(i);
    const pw = pg.getWidth();
    pg.drawLine({ start: { x: M, y: M + 20 }, end: { x: pw - M, y: M + 20 }, thickness: 0.5, color: LINEC });

    const ftW = regular.widthOfTextAtSize(footerText, 7.5);
    pg.drawText(footerText, { x: (pw - ftW) / 2, y: M + 8, size: 7.5, font: regular, color: MID });

    const pgLabel = `Page ${i + 1} of ${pageCount}`;
    const pgW = regular.widthOfTextAtSize(pgLabel, 7.5);
    pg.drawText(pgLabel, { x: pw - M - pgW, y: M + 8, size: 7.5, font: regular, color: MID });
  }

  return pdfDoc.save();
}

// ── Request handler ───────────────────────────────────────────────────────────

serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = getCorsHeaders(origin);

  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse(401, { error: "Unauthorized" }, cors);

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !userData.user) return jsonResponse(401, { error: "Unauthorized" }, cors);

    // Parse body
    const body = await req.json();
    const { proposal_id, project_id, triggered_by: triggeredByInput } = body as {
      proposal_id?: string;
      project_id?: string;
      triggered_by?: string;
    };
    const triggeredBy = triggeredByInput ?? "accepted_proposal";
    if (!proposal_id || !project_id) {
      return jsonResponse(400, { error: "proposal_id and project_id are required" }, cors);
    }

    // Fetch project
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select(
        "title, description, address_line_1, address_line_2, city, postcode, " +
        "budget, deposit_required, deposit_percentage, retention_percentage, posted_by",
      )
      .eq("id", project_id)
      .single();
    if (projErr || !project) return jsonResponse(404, { error: "Project not found" }, cors);

    // Verify caller is the project poster
    const { data: caller } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", userData.user.id)
      .single();
    if (!caller || project.posted_by !== caller.id) {
      return jsonResponse(403, { error: "Forbidden" }, cors);
    }

    // Fetch accepted proposal
    const { data: proposal, error: propErr } = await supabase
      .from("project_proposals")
      .select(
        "phases, total_cost, timeline_start, timeline_end, " +
        "materials_responsibility, payment_terms, contractor_id, status",
      )
      .eq("id", proposal_id)
      .eq("project_id", project_id)
      .single();
    if (propErr || !proposal) return jsonResponse(404, { error: "Proposal not found" }, cors);

    // Fetch client + contractor profiles in parallel
    const [clientRes, contractorRes] = await Promise.all([
      supabase.from("profiles").select("full_name, company_name, ts_profile_code").eq("id", project.posted_by).single(),
      supabase.from("profiles").select("full_name, company_name, ts_profile_code").eq("id", proposal.contractor_id).single(),
    ]);
    const client: ProfileSnap = clientRes.data ?? { full_name: null, company_name: null, ts_profile_code: null };
    const contractorProfile: ProfileSnap = contractorRes.data ?? { full_name: null, company_name: null, ts_profile_code: null };

    // Contract reference: CON-{8-char project id}-{YYYYMMDD}
    const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const contractRef = `CON-${project_id.slice(0, 8).toUpperCase()}-${dateStamp}`;

    // Generate PDF
    const pdfBytes = await buildContractPdf({
      contractRef,
      project: project as Parameters<typeof buildContractPdf>[0]["project"],
      proposal: {
        phases: (proposal.phases as unknown as PhaseJson[]) ?? [],
        total_cost: proposal.total_cost,
        timeline_start: proposal.timeline_start,
        timeline_end: proposal.timeline_end,
        materials_responsibility: proposal.materials_responsibility,
        payment_terms: proposal.payment_terms,
      },
      client,
      contractor: contractorProfile,
    });

    // Ensure bucket exists (idempotent — silently ignores "already exists")
    await supabase.storage.createBucket("project-contracts", { public: true }).catch(() => {});

    // Upload PDF
    const filePath = `${project_id}/${contractRef}.pdf`;
    const { error: uploadErr } = await supabase.storage
      .from("project-contracts")
      .upload(filePath, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (uploadErr) {
      console.error("[generate-project-contract] upload failed:", uploadErr);
      return jsonResponse(500, { error: "Failed to upload contract document" }, cors);
    }

    const { data: urlData } = supabase.storage.from("project-contracts").getPublicUrl(filePath);
    const documentUrl = urlData.publicUrl;

    // Determine next version number
    const { data: maxRow } = await supabase
      .from("project_contracts")
      .select("version")
      .eq("project_id", project_id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = maxRow ? maxRow.version + 1 : 1;

    // Insert project_contracts row
    const { data: contractRow, error: insertErr } = await supabase
      .from("project_contracts")
      .insert({
        project_id,
        version: nextVersion,
        document_url: documentUrl,
        triggered_by: triggeredBy,
      })
      .select("id")
      .single();
    if (insertErr || !contractRow) {
      console.error("[generate-project-contract] insert failed:", insertErr);
      return jsonResponse(500, { error: "Failed to save contract record" }, cors);
    }

    return jsonResponse(200, { contract_id: contractRow.id, document_url: documentUrl }, cors);
  } catch (err) {
    console.error("[generate-project-contract] unexpected error:", err);
    return jsonResponse(500, { error: "Internal server error" }, cors);
  }
});
