import jsPDF from "jspdf";
import { format } from "date-fns";
import { formatQuoteRef, formatInvoiceRef } from "@/lib/documentRefs";

export async function generateJobRecordPdf(opts: {
  job: {
    id: string;
    title: string;
    status: string;
    quote_number: number | null;
    location: string | null;
    start_date: string | null;
    actual_end: string | null;
    contract_value: number;
    signed_off_at: string | null;
  };
  contractor: {
    full_name: string | null;
    company_name: string | null;
    ts_profile_code: string | null;
    logo_url: string | null;
  };
  client: {
    full_name: string;
    ts_profile_code: string | null;
    location: string | null;
  };
  teamMembers: { full_name: string }[];
  totalHoursLogged: number;
  invoice: {
    invoice_number: number;
    status: string;
    total: number;
    due_date: string;
    paid_date: string | null;
  } | null;
}): Promise<void> {
  const { job, contractor, client, teamMembers, totalHoursLogged, invoice } = opts;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;

  let yPos = margin;

  // Logo — fetch and embed, same pattern as generateInvoicePdf.ts
  if (contractor.logo_url) {
    try {
      const res = await fetch(contractor.logo_url);
      const blob = await res.blob();
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      try {
        doc.addImage(base64, "PNG", margin, yPos, 24, 24);
        yPos += 28;
      } catch {
        // logo failed to render — skip silently
      }
    } catch {
      // logo fetch failed — skip silently
    }
  }

  // ── Header band (navy, full width, 50px) ─────────────────────────────────
  const bandY = yPos;
  doc.setFillColor(26, 39, 68);
  doc.rect(0, bandY, pageWidth, 50, "F");

  // Left: "JOB RECORD" label in orange
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(240, 120, 32);
  doc.text("JOB RECORD", margin + 4, bandY + 11);

  // Left: job title in white
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  const titleLines = doc.splitTextToSize(job.title, pageWidth / 2 - margin) as string[];
  doc.text(titleLines[0] || job.title, margin + 4, bandY + 22);

  // Left: quote reference in muted white
  if (job.quote_number != null) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(180, 200, 220);
    doc.text(
      formatQuoteRef(job.quote_number, { contractorCode: contractor.ts_profile_code ?? undefined }),
      margin + 4, bandY + 32
    );
  }

  // Right: status pill (white bg, navy text)
  const statusText = job.status.replace(/_/g, " ").toUpperCase();
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  const pillTW = doc.getTextWidth(statusText);
  const pillPad = 3;
  const pillW = pillTW + pillPad * 2;
  const pillX = pageWidth - margin - pillW;
  doc.setFillColor(255, 255, 255);
  doc.rect(pillX, bandY + 7, pillW, 7, "F");
  doc.setTextColor(26, 39, 68);
  doc.text(statusText, pillX + pillPad, bandY + 12.5);

  // Right: "Generated {today}"
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 200, 220);
  doc.text(
    `Generated ${format(new Date(), "dd MMM yyyy")}`,
    pageWidth - margin,
    bandY + 23,
    { align: "right" }
  );

  yPos = bandY + 56;

  // ── Client / Contractor row ───────────────────────────────────────────────
  const colMid = pageWidth / 2;
  const rowStart = yPos;

  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(140, 140, 140);
  doc.text("CLIENT", margin, rowStart + 5);

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(26, 39, 68);
  doc.text(client.full_name, margin, rowStart + 13);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  let leftY = rowStart + 20;
  if (client.ts_profile_code) { doc.text(client.ts_profile_code, margin, leftY); leftY += 5; }
  if (client.location) { doc.text(client.location, margin, leftY); }

  doc.setDrawColor(220, 220, 220);
  doc.line(colMid, rowStart, colMid, rowStart + 30);

  const rightX = colMid + 5;
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(140, 140, 140);
  doc.text("CONTRACTOR", rightX, rowStart + 5);

  const contractorName = contractor.company_name || contractor.full_name || "Contractor";
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(26, 39, 68);
  doc.text(contractorName, rightX, rowStart + 13);

  if (contractor.ts_profile_code) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(contractor.ts_profile_code, rightX, rowStart + 20);
  }

  yPos = rowStart + 34;
  doc.setDrawColor(220, 220, 220);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 7;

  // ── Key facts row (four columns) ─────────────────────────────────────────
  const factColW = (pageWidth - margin * 2) / 4;
  const facts = [
    { label: "STARTED", value: job.start_date ? format(new Date(job.start_date), "dd MMM yyyy") : "—" },
    { label: "COMPLETED", value: job.actual_end ? format(new Date(job.actual_end), "dd MMM yyyy") : "—" },
    { label: "HOURS LOGGED", value: `${totalHoursLogged.toFixed(1)}h` },
    { label: "CONTRACT VALUE", value: `£${Number(job.contract_value).toFixed(2)}` },
  ];

  const factsY = yPos;
  facts.forEach((f, i) => {
    const x = margin + i * factColW;
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(140, 140, 140);
    doc.text(f.label, x, factsY + 4);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(26, 39, 68);
    doc.text(f.value, x, factsY + 12);
    if (i < 3) {
      doc.setDrawColor(220, 220, 220);
      doc.line(x + factColW, factsY, x + factColW, factsY + 17);
    }
  });

  yPos = factsY + 20;
  doc.setDrawColor(220, 220, 220);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 7;

  // ── Team section ──────────────────────────────────────────────────────────
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(140, 140, 140);
  doc.text("TEAM", margin, yPos + 4);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(26, 39, 68);
  const teamText = teamMembers.length > 0 ? teamMembers.map(m => m.full_name).join(", ") : "—";
  doc.text(teamText, margin, yPos + 11);

  yPos += 18;
  doc.setDrawColor(220, 220, 220);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 7;

  // ── Invoice section ───────────────────────────────────────────────────────
  if (invoice) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(140, 140, 140);
    doc.text("INVOICE", margin, yPos + 4);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(26, 39, 68);
    doc.text(
      formatInvoiceRef(invoice.invoice_number, { contractorCode: contractor.ts_profile_code ?? undefined }),
      margin, yPos + 11
    );

    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`Due: ${format(new Date(invoice.due_date), "dd MMM yyyy")}`, margin, yPos + 17);

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(26, 39, 68);
    doc.text(`£${Number(invoice.total).toFixed(2)}`, pageWidth - margin, yPos + 11, { align: "right" });

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    if (invoice.status === "paid") {
      doc.setTextColor(22, 163, 74);
      doc.text("PAID", pageWidth - margin, yPos + 17, { align: "right" });
      if (invoice.paid_date) {
        doc.setFont("helvetica", "normal");
        doc.text(format(new Date(invoice.paid_date), "dd MMM yyyy"), pageWidth - margin, yPos + 22, { align: "right" });
      }
    } else {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      doc.text(invoice.status.toUpperCase(), pageWidth - margin, yPos + 17, { align: "right" });
    }

    yPos += 28;
    doc.setDrawColor(220, 220, 220);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 7;
  }

  // ── Sign-off section ──────────────────────────────────────────────────────
  if (job.signed_off_at) {
    doc.setFillColor(220, 252, 231);
    doc.rect(margin, yPos, pageWidth - margin * 2, 18, "F");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(21, 128, 61);
    doc.text("Customer sign-off confirmed", margin + 4, yPos + 7);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(
      format(new Date(job.signed_off_at), "dd MMM yyyy 'at' HH:mm"),
      margin + 4,
      yPos + 13
    );
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(160, 160, 160);
  doc.text(
    "Powered by TradeStone · tradesltd.co.uk",
    pageWidth / 2,
    pageHeight - 10,
    { align: "center" }
  );

  doc.save(`job-record-${job.id.slice(0, 8)}.pdf`);
}
