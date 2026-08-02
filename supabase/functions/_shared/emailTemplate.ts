// supabase/functions/_shared/emailTemplate.ts
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for all TradeStone transactional email HTML.
// Import and call buildEmail(type, data) from any Edge Function.
// ─────────────────────────────────────────────────────────────────────────────

export type EmailType =
  | "new_enquiry"
  | "quote_request_confirmation"
  | "quote_action"
  | "overdue_invoice"
  | "payment_received"
  | "cert_expiry"
  | "insurance_expiry"
  | "cooling_off_notice";

// ── Per-type data shapes ──────────────────────────────────────────────────────

export interface NewEnquiryData {
  customerRef: string;       // e.g. "TS-P-76159D"
  location: string;
  description: string;
  receivedAt: string;        // human-readable date string
  ctaUrl: string;
}

export interface QuoteRequestConfirmationData {
  customerName: string;
  contractorName: string;
  projectTitle: string;
  projectDescription: string;
  ctaUrl: string;
}

export interface QuoteActionData {
  recipientName: string;
  actorName: string;
  contextLabel: string;      // e.g. "Q-4AE203-0011"
  actionLabel: string;       // e.g. "Accepted", "Declined", "Query Raised"
  message?: string;
  isConfirmation: boolean;   // true = sent to actor as confirmation, false = sent to contractor
  ctaUrl: string;
}

export interface OverdueInvoiceData {
  clientName: string;
  invoiceRef: string;        // e.g. "INV-0014"
  dueDate: string;
  payUrl: string;
}

export interface PaymentReceivedData {
  contractorName: string;
  invoiceRef: string;
  amount: string;            // formatted, e.g. "£285.00"
  ctaUrl: string;
}

export interface CertExpiryData {
  contractorName: string;
  certs: Array<{
    workerName: string;
    certName: string;
    expiryDate: string;      // human-readable date string
    daysRemaining: number;
  }>;
  ctaUrl: string;
}

export interface InsuranceExpiryData {
  contractorName: string;
  expiryDate: string;      // human-readable date string
  daysRemaining: number;
  ctaUrl: string;
}

export interface CoolingOffNoticeData {
  consumerName: string;
  jobTitle: string;
  coolingOffEndDate: string;  // formatted DD MMMM YYYY
  ctaUrl: string;
}

export type EmailData =
  | NewEnquiryData
  | QuoteRequestConfirmationData
  | QuoteActionData
  | OverdueInvoiceData
  | PaymentReceivedData
  | CertExpiryData
  | InsuranceExpiryData
  | CoolingOffNoticeData;

// ── Colour / accent map ───────────────────────────────────────────────────────

const ACCENT: Record<EmailType, { bar: string; pill: string; pillBg: string; btn: string }> = {
  new_enquiry:                  { bar: "#f07820", pill: "#f07820", pillBg: "#fff4eb", btn: "#f07820" },
  quote_request_confirmation:   { bar: "#3b82f6", pill: "#2563eb", pillBg: "#eff6ff", btn: "#2563eb" },
  quote_action:                 { bar: "#22c55e", pill: "#16a34a", pillBg: "#f0fdf4", btn: "#16a34a" },
  overdue_invoice:              { bar: "#ef4444", pill: "#dc2626", pillBg: "#fef2f2", btn: "#dc2626" },
  payment_received:             { bar: "#22c55e", pill: "#16a34a", pillBg: "#f0fdf4", btn: "#16a34a" },
  cert_expiry:                  { bar: "#f59e0b", pill: "#d97706", pillBg: "#fffbeb", btn: "#d97706" },
  insurance_expiry:             { bar: "#f59e0b", pill: "#d97706", pillBg: "#fffbeb", btn: "#d97706" },
  cooling_off_notice:           { bar: "#3b82f6", pill: "#2563eb", pillBg: "#eff6ff", btn: "#2563eb" },
};

// ── Shared shell ──────────────────────────────────────────────────────────────

function shell(type: EmailType, inner: string): string {
  const a = ACCENT[type];
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<style>
body,table,td,p,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;margin:0;padding:0;}
body{background-color:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;}
table{border-collapse:collapse;}
a{color:#f07820;text-decoration:none;}
</style>
</head>
<body>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:40px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

  <!-- HEADER -->
  <tr><td style="background:#1a2744;border-radius:12px 12px 0 0;padding:26px 36px 22px;">
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.05em;text-transform:uppercase;">
      TRADE<span style="color:#f07820;">STONE</span>
    </div>
    <div style="font-size:10px;font-weight:400;color:rgba(255,255,255,0.4);letter-spacing:0.1em;text-transform:uppercase;margin-top:3px;">
      Trades Platform
    </div>
  </td></tr>

  <!-- ACCENT BAR -->
  <tr><td style="background:${a.bar};height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>

  <!-- BODY -->
  <tr><td style="background:#ffffff;padding:32px 36px 28px;">
    ${inner}
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:#1a2744;border-radius:0 0 12px 12px;padding:18px 36px;text-align:center;">
    <p style="font-size:10px;color:rgba(255,255,255,0.3);line-height:1.8;margin:0;">
      TradeStone Group Ltd &nbsp;&middot;&nbsp; Company No. 17229262<br/>
      82a James Carter Road, Mildenhall, IP28 7DE<br/>
      <a href="https://tradesltd.co.uk" style="color:rgba(255,255,255,0.45);text-decoration:underline;">tradesltd.co.uk</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── Detail card row helper ────────────────────────────────────────────────────

function drow(label: string, value: string, mono = false): string {
  const valStyle = mono
    ? "font-family:'Courier New',Courier,monospace;font-size:12px;font-weight:700;color:#1a2744;letter-spacing:0.04em;"
    : "font-size:13px;font-weight:500;color:#1a2744;line-height:1.4;";
  return `<tr>
    <td width="96" style="font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.07em;padding:11px 0 11px 16px;border-bottom:1px solid #eef0f3;vertical-align:top;">${label}</td>
    <td style="${valStyle}padding:11px 16px 11px 0;border-bottom:1px solid #eef0f3;">${value}</td>
  </tr>`;
}

function detailCard(rows: Array<{ label: string; value: string; mono?: boolean }>, lastRowBorderless = true): string {
  const rowsHtml = rows.map((r, i) => {
    const isLast = i === rows.length - 1;
    const style = isLast && lastRowBorderless
      ? drow(r.label, r.value, r.mono).replace(/border-bottom:1px solid #eef0f3;/g, "border-bottom:none;")
      : drow(r.label, r.value, r.mono);
    return style;
  }).join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fb;border:1px solid #e5e7eb;border-left:3px solid #1a2744;border-radius:6px;margin-bottom:24px;overflow:hidden;">
    ${rowsHtml}
  </table>`;
}

// ── Pill ──────────────────────────────────────────────────────────────────────

function pill(type: EmailType, label: string): string {
  const a = ACCENT[type];
  return `<div style="display:inline-block;background:${a.pillBg};color:${a.pill};font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;padding:3px 10px;border-radius:4px;margin-bottom:14px;">${label}</div>`;
}

// ── CTA button ────────────────────────────────────────────────────────────────

function ctaButton(type: EmailType, label: string, url: string): string {
  const a = ACCENT[type];
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
    <tr><td align="center">
      <a href="${url}" style="display:inline-block;background:${a.btn};color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:0.03em;padding:13px 30px;border-radius:7px;text-decoration:none;">${label} &rarr;</a>
    </td></tr>
  </table>`;
}

// ── Shared footer note ────────────────────────────────────────────────────────

function footerNote(note: string): string {
  return `<hr style="border:none;border-top:1px solid #f0f2f5;margin:0 0 18px;"/>
  <p style="font-size:11px;color:#9ca3af;text-align:center;line-height:1.7;margin:0;">${note}</p>`;
}

function headline(text: string): string {
  return `<div style="font-size:19px;font-weight:700;color:#1a2744;line-height:1.3;margin-bottom:7px;">${text}</div>`;
}

function subtext(text: string): string {
  return `<div style="font-size:13px;font-weight:400;color:#6b7280;line-height:1.65;margin-bottom:24px;">${text}</div>`;
}

// ── Cert expiry list table ────────────────────────────────────────────────────

function certExpiryTable(certs: CertExpiryData["certs"]): string {
  const headerCell = (label: string) =>
    `<td style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.07em;padding:8px 12px;">${label}</td>`;
  const rows = certs.map((c) => `<tr>
      <td style="font-size:12px;font-weight:600;color:#1a2744;padding:10px 12px;border-bottom:1px solid #eef0f3;">${c.workerName}</td>
      <td style="font-size:12px;color:#374151;padding:10px 12px;border-bottom:1px solid #eef0f3;">${c.certName}</td>
      <td style="font-size:12px;color:#374151;padding:10px 12px;border-bottom:1px solid #eef0f3;white-space:nowrap;">${c.expiryDate}</td>
      <td style="font-size:12px;font-weight:600;color:#d97706;padding:10px 12px;border-bottom:1px solid #eef0f3;white-space:nowrap;">${c.daysRemaining} day${c.daysRemaining === 1 ? "" : "s"}</td>
    </tr>`).join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fb;border:1px solid #e5e7eb;border-left:3px solid #f59e0b;border-radius:6px;margin-bottom:24px;overflow:hidden;">
    <tr>${headerCell("Worker")}${headerCell("Certification")}${headerCell("Expires")}${headerCell("Remaining")}</tr>
    ${rows}
  </table>`;
}

// ── buildEmail ────────────────────────────────────────────────────────────────

export function buildEmail(type: EmailType, data: EmailData): string {
  switch (type) {

    // ── 01 New enquiry → contractor ──────────────────────────────────────────
    case "new_enquiry": {
      const d = data as NewEnquiryData;
      const inner = [
        pill(type, "New Enquiry"),
        headline("You have a new enquiry"),
        subtext("A customer has submitted an enquiry via TradeStone. Log in to review the details and respond with a quote."),
        detailCard([
          { label: "Customer",    value: d.customerRef, mono: true },
          { label: "Location",    value: d.location },
          { label: "Description", value: d.description },
          { label: "Received",    value: d.receivedAt },
        ]),
        ctaButton(type, "View Enquiry &amp; Quote", d.ctaUrl),
        footerNote("Sent because you are a registered contractor on TradeStone."),
      ].join("\n");
      return shell(type, inner);
    }

    // ── 02 Quote request confirmation → customer ─────────────────────────────
    case "quote_request_confirmation": {
      const d = data as QuoteRequestConfirmationData;
      const inner = [
        pill(type, "Request Sent"),
        headline("Your enquiry has been sent"),
        subtext(`Your enquiry has been sent to <strong>${d.contractorName}</strong>. They'll review the details and come back to you with a quote.`),
        detailCard([
          { label: "Contractor",  value: d.contractorName },
          { label: "Job title",   value: d.projectTitle },
          { label: "Description", value: d.projectDescription },
        ]),
        ctaButton(type, "View on TradeStone", d.ctaUrl),
        footerNote("Sent because you submitted an enquiry on TradeStone."),
      ].join("\n");
      return shell(type, inner);
    }

    // ── 03 Quote action (accepted / declined / query etc.) ───────────────────
    case "quote_action": {
      const d = data as QuoteActionData;

      // Colour override: declined/rejected → red, everything else → green
      const isNegative = ["Declined", "Rejected"].includes(d.actionLabel);
      const accentOverride = isNegative
        ? { bar: "#ef4444", pill: "#dc2626", pillBg: "#fef2f2", btn: "#1a2744" }
        : ACCENT[type];

      const pillHtml = `<div style="display:inline-block;background:${accentOverride.pillBg};color:${accentOverride.pill};font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;padding:3px 10px;border-radius:4px;margin-bottom:14px;">Quote ${d.actionLabel}</div>`;
      const btnHtml  = `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;"><tr><td align="center"><a href="${d.ctaUrl}" style="display:inline-block;background:${accentOverride.btn};color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:0.03em;padding:13px 30px;border-radius:7px;text-decoration:none;">View on TradeStone &rarr;</a></td></tr></table>`;
      const barOverride = `<tr><td style="background:${accentOverride.bar};height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>`;

      const headlineText = d.isConfirmation
        ? `Your response has been sent`
        : `Your quote was ${d.actionLabel.toLowerCase()}`;
      const subtextText = d.isConfirmation
        ? `You responded to <strong>${d.contextLabel}</strong> with: <strong>${d.actionLabel}</strong>.`
        : `<strong>${d.actorName}</strong> has ${d.actionLabel.toLowerCase()} your quote <strong>${d.contextLabel}</strong>.`;

      const rows: Array<{ label: string; value: string; mono?: boolean }> = [
        { label: "Quote ref", value: d.contextLabel, mono: true },
        { label: "Action",    value: d.actionLabel },
      ];
      if (d.message) rows.push({ label: "Message", value: d.message });

      const inner = [
        pillHtml,
        headline(headlineText),
        subtext(subtextText),
        detailCard(rows),
        btnHtml,
        footerNote("Sent because you have an active quote on TradeStone."),
      ].join("\n");

      // Inject bar override directly — swap the default bar in shell output
      return shell(type, inner).replace(
        `background:${ACCENT[type].bar};height:4px`,
        `background:${accentOverride.bar};height:4px`
      );
    }

    // ── 04 Overdue invoice → client ──────────────────────────────────────────
    case "overdue_invoice": {
      const d = data as OverdueInvoiceData;
      const inner = [
        pill(type, "Payment Overdue"),
        headline(`Invoice ${d.invoiceRef} is overdue`),
        subtext(`Hi ${d.clientName}, your invoice was due on <strong>${d.dueDate}</strong> and has not yet been paid. Please settle the balance at your earliest convenience.`),
        detailCard([
          { label: "Invoice",  value: d.invoiceRef, mono: true },
          { label: "Due date", value: d.dueDate },
          { label: "Status",   value: `<span style="color:#dc2626;font-weight:600;">Overdue</span>` },
        ]),
        ctaButton(type, "Pay Now", d.payUrl),
        footerNote("You are receiving this because you have an outstanding invoice on TradeStone."),
      ].join("\n");
      return shell(type, inner);
    }

    // ── 05 Payment received → contractor ────────────────────────────────────
    case "payment_received": {
      const d = data as PaymentReceivedData;
      const inner = [
        pill(type, "Payment Received"),
        headline("You've been paid"),
        subtext(`Great news — your client has paid invoice <strong>${d.invoiceRef}</strong>. The funds will be transferred to your account via Stripe.`),
        detailCard([
          { label: "Invoice", value: d.invoiceRef, mono: true },
          { label: "Amount",  value: `<span style="font-size:15px;font-weight:700;color:#1a2744;">${d.amount}</span>` },
          { label: "Status",  value: `<span style="color:#16a34a;font-weight:600;">&#10003; Paid</span>` },
        ]),
        ctaButton(type, "View Dashboard", d.ctaUrl),
        footerNote("Sent because you are a registered contractor on TradeStone."),
      ].join("\n");
      return shell(type, inner);
    }

    // ── 06 Certification expiring soon → contractor ──────────────────────────
    case "cert_expiry": {
      const d = data as CertExpiryData;
      const count = d.certs.length;
      const inner = [
        pill(type, "Certification Expiring"),
        headline(count === 1 ? "A team certification is expiring soon" : `${count} team certifications are expiring soon`),
        subtext(`Hi ${d.contractorName}, the following team certification${count === 1 ? " is" : "s are"} due to expire within the next 30 days. Renew or update the record before it lapses.`),
        certExpiryTable(d.certs),
        ctaButton(type, "Manage Team Certifications", d.ctaUrl),
        footerNote("Sent because you are a registered contractor on TradeStone."),
      ].join("\n");
      return shell(type, inner);
    }

    // ── 07 Public liability insurance expiring soon → contractor ─────────────
    case "insurance_expiry": {
      const d = data as InsuranceExpiryData;
      const inner = [
        pill(type, "Insurance Expiring"),
        headline("Your public liability insurance is expiring soon"),
        subtext(`Hi ${d.contractorName}, your public liability insurance on file is due to expire on <strong>${d.expiryDate}</strong>. Upload a renewed certificate before it lapses to stay at your current verification tier — if it expires, your verification will drop to Tier 2 and you may lose access to jobs that require Tier 3.`),
        detailCard([
          { label: "Expires",   value: d.expiryDate },
          { label: "Remaining", value: `<span style="color:#d97706;font-weight:600;">${d.daysRemaining} day${d.daysRemaining === 1 ? "" : "s"}</span>` },
        ]),
        ctaButton(type, "Update Insurance Details", d.ctaUrl),
        footerNote("Sent because you are a registered contractor on TradeStone."),
      ].join("\n");
      return shell(type, inner);
    }

    // ── 08 Cooling-off prescribed information → consumer ─────────────────────
    case "cooling_off_notice": {
      const d = data as CoolingOffNoticeData;
      const inner = [
        pill(type, "Your Cancellation Rights"),
        headline("Your Cancellation Rights"),
        subtext(
          `Hi ${d.consumerName}, under the Consumer Contracts Regulations 2013, you have the right to cancel ` +
          `the contract for <strong>${d.jobTitle}</strong> within <strong>14 days</strong> without giving any reason. ` +
          `The cancellation period will expire on <strong>${d.coolingOffEndDate}</strong>.`
        ),
        detailCard([
          { label: "Job",         value: d.jobTitle },
          { label: "Cancel by",   value: d.coolingOffEndDate },
        ]),
        subtext(
          `To exercise your right to cancel, you must inform us by a clear statement — click "Cancel within ` +
          `cooling-off period" on your job details, or contact us at <a href="mailto:support@tradesltd.co.uk">support@tradesltd.co.uk</a>.<br/><br/>` +
          `<strong>Starting work before the cooling-off period ends:</strong> if you'd like the contractor to begin work ` +
          `before the 14 days are up, you must give your explicit consent on your job details. By doing so you ` +
          `acknowledge that if the work is completed before the cooling-off period ends you will lose your right to ` +
          `cancel, and if you cancel after work has begun you will be liable for a proportionate amount for the work ` +
          `already carried out.`
        ),
        ctaButton(type, "View Job & Cancellation Rights", d.ctaUrl),
        footerNote("Sent because you accepted a quote on TradeStone as a consumer."),
      ].join("\n");
      return shell(type, inner);
    }
  }
}

// ── Subject line helpers ──────────────────────────────────────────────────────

export function buildSubject(type: EmailType, data: EmailData): string {
  switch (type) {
    case "new_enquiry":
      return "New enquiry received — TradeStone";
    case "quote_request_confirmation":
      return "Enquiry sent — TradeStone";
    case "quote_action": {
      const d = data as QuoteActionData;
      return d.isConfirmation
        ? `Your response to ${d.contextLabel} — TradeStone`
        : `${d.contextLabel} ${d.actionLabel} — TradeStone`;
    }
    case "overdue_invoice": {
      const d = data as OverdueInvoiceData;
      return `Payment overdue — ${d.invoiceRef} — TradeStone`;
    }
    case "payment_received": {
      const d = data as PaymentReceivedData;
      return `Payment received — ${d.invoiceRef} — TradeStone`;
    }
    case "cert_expiry":
      return "Team certification expiring soon";
    case "insurance_expiry": {
      const d = data as InsuranceExpiryData;
      return `Insurance expiring in ${d.daysRemaining} day${d.daysRemaining === 1 ? "" : "s"} — TradeStone`;
    }
    case "cooling_off_notice": {
      const d = data as CoolingOffNoticeData;
      return `Your Cancellation Rights — ${d.jobTitle} — TradeStone`;
    }
  }
}
