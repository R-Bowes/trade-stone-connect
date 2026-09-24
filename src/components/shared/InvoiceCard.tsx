import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { RecordCard, type RecordCardField } from "@/components/shared/RecordCard";
import { formatDate } from "@/lib/formatDate";
import { formatGBP } from "@/lib/formatGBP";
import { formatInvoiceRef } from "@/lib/documentRefs";
import { depositSettled, isOverdue, daysOverdue, type InvoiceMoneyFields } from "@/lib/invoiceMoney";

export interface InvoiceCardInvoice extends InvoiceMoneyFields {
  id: string;
  invoice_number: number;
  issued_date: string;
  paid_date: string | null;
  subtotal: number | string;
  tax_rate: number | string;
  tax_amount: number | string;
  /** B2B rows only; absent/null for residential. */
  company_id?: string | null;
  period_start?: string | null;
  period_end?: string | null;
}

interface InvoiceCardProps {
  invoice: InvoiceCardInvoice;
  viewer: "contractor" | "business" | "customer";
  /** The client's name for a contractor viewer, the contractor's name otherwise. Always a name, never a TS code. */
  counterparty: string;
  /** The counterparty's TS code, shown beneath their name in the Client/Contractor field. */
  counterpartyCode?: string | null;
  /** Contractor's own TS code, for the full-form reference on business/customer surfaces. */
  contractorCode?: string | null;
  /** Set only for a B2B invoice whose engagement could be resolved. */
  engagementRef?: string | null;
  /** A signal outside the CHECK-constrained status — recipient_response
   *  (paid/stalled/queried), residential only. Rendered as a second badge,
   *  never merged into the derived status badge. */
  secondaryBadge?: { label: string; className: string } | null;
  density?: "full" | "compact";
  actions?: ReactNode;
}

const STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-200" },
  sent: { label: "Sent", className: "bg-amber-100 text-amber-800 border-amber-200" },
  viewed: { label: "Viewed", className: "bg-blue-100 text-blue-800 border-blue-200" },
  paid: { label: "Paid", className: "bg-green-100 text-green-800 border-green-200" },
  void: { label: "Void", className: "bg-slate-200 text-slate-500 border-slate-300" },
};

const num = (v: number | string) => Number(v);

export function InvoiceCard({
  invoice,
  viewer,
  counterparty,
  counterpartyCode,
  contractorCode,
  engagementRef,
  secondaryBadge,
  density = "full",
  actions,
}: InvoiceCardProps) {
  const overdue = isOverdue(invoice);
  const status = STATUS[invoice.status] ?? { label: invoice.status, className: "bg-slate-100 text-slate-700" };
  const tax = num(invoice.tax_amount);
  const deposit = depositSettled(invoice);
  const amountDue = Math.max(0, num(invoice.total) - deposit);
  const showAmountDue = deposit > 0 && (invoice.status === "sent" || invoice.status === "viewed");
  const isB2B = !!invoice.company_id;

  const reference = viewer === "contractor"
    ? formatInvoiceRef(invoice.invoice_number)
    : formatInvoiceRef(invoice.invoice_number, { contractorCode: contractorCode ?? undefined });

  const compact = density === "compact";

  const counterpartyField: RecordCardField = {
    label: viewer === "contractor" ? "Client" : "Contractor",
    value: counterpartyCode ? (
      <>
        {counterparty}
        <div className="font-mono text-xs text-muted-foreground">{counterpartyCode}</div>
      </>
    ) : (
      counterparty
    ),
  };

  const fields: RecordCardField[] = compact
    ? [
        counterpartyField,
        { label: "Due", value: formatDate(invoice.due_date) },
        { label: "Total", value: formatGBP(invoice.total) },
      ]
    : [
        counterpartyField,
        { label: "Issued", value: formatDate(invoice.issued_date) },
        { label: "Due", value: formatDate(invoice.due_date) },
        ...(tax > 0
          ? [
              { label: "Subtotal", value: formatGBP(invoice.subtotal) },
              { label: `VAT (${num(invoice.tax_rate)}%)`, value: formatGBP(tax) },
              { label: "Total", value: formatGBP(invoice.total) },
            ]
          : [{ label: "Total", value: formatGBP(invoice.total) }]),
        ...(showAmountDue ? [{ label: "Amount due", value: formatGBP(amountDue) }] : []),
        ...(isB2B
          ? [
              {
                label: "Billing period",
                value: invoice.period_start && invoice.period_end
                  ? `${formatDate(invoice.period_start)} – ${formatDate(invoice.period_end)}`
                  : "—",
              },
              { label: "Engagement", value: engagementRef ?? "—" },
            ]
          : []),
        ...(invoice.status === "paid" && invoice.paid_date ? [{ label: "Paid", value: formatDate(invoice.paid_date) }] : []),
      ];

  return (
    <RecordCard
      icon={<i className="ti ti-file-invoice" style={{ fontSize: 20 }} />}
      title={counterparty}
      reference={reference}
      badges={
        <>
          {overdue && (
            <Badge className="bg-red-100 text-red-800 border-red-200">
              Overdue{daysOverdue(invoice) > 0 ? ` — ${daysOverdue(invoice)}d` : ""}
            </Badge>
          )}
          <Badge className={status.className}>{status.label}</Badge>
          {secondaryBadge && <Badge className={secondaryBadge.className}>{secondaryBadge.label}</Badge>}
        </>
      }
      fields={fields}
      actions={actions}
      density={density}
    />
  );
}
