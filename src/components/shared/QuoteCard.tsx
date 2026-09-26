import type { ReactNode } from "react";
import { RecordCard, type RecordCardField } from "@/components/shared/RecordCard";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/formatDate";
import { formatGBP } from "@/lib/formatGBP";
import { formatQuoteRef } from "@/lib/documentRefs";
import { toQuoteState, presentState } from "@/lib/statusPresenter";
import { TONE_BADGE_CLASS } from "@/lib/presenterStyles";

export interface QuoteCardVersion {
  id: string;
  version: number;
  status: string;
  recipient_response: string | null;
  viewed_at?: string | null;
  total: number;
  deposit_required: boolean | null;
  deposit_amount: number | null;
  deposit_paid: boolean | null;
}

export interface QuoteCardQuote extends QuoteCardVersion {
  quote_number: number;
  title: string;
  valid_until: string;
  sent_at: string | null;
  enquiry_id: string | null;
}

// A whole-card opacity reduction, not a badge colour — mirrors
// JobManagement.tsx's treatment of a cancelled job. Present, not prominent.
const DIMMED_STATUSES = new Set(["lapsed", "stalled", "expired", "superseded"]);

const EXPIRING_SOON_DAYS = 7;

function depositLabel(v: Pick<QuoteCardVersion, "deposit_required" | "deposit_amount">): string {
  return v.deposit_required && v.deposit_amount != null ? formatGBP(v.deposit_amount) : "None";
}

interface QuoteCardProps {
  /** The governing version, already resolved by resolveGoverningQuote — this card never re-derives it. */
  quote: QuoteCardQuote;
  /** Every version sharing this quote_number, used only for the v1 price/deposit comparison and the draft-revision indicator. */
  versions: QuoteCardQuote[];
  viewer: "contractor" | "recipient";
  counterparty: string;
  /** The issuing contractor's own TS code — needed to compose the full-form reference for a recipient viewer. Irrelevant for a contractor viewer (short form never carries it). */
  contractorCode?: string | null;
  density?: "full" | "compact";
  actions?: ReactNode;
}

export function QuoteCard({ quote, versions, viewer, counterparty, contractorCode, density = "full", actions }: QuoteCardProps) {
  const compact = density === "compact";

  // Fold recipient_response into an effective status the way
  // ReceivedQuotes.tsx already does — status alone misses 'stalled'
  // entirely (it only ever lives on recipient_response) and never reflects
  // an accepted/rejected response ahead of a status write.
  const effectiveStatus =
    quote.recipient_response === "rejected" || quote.status === "rejected"
      ? "rejected"
      : quote.recipient_response === "stalled"
        ? "stalled"
        : quote.recipient_response === "accepted" || quote.status === "accepted"
          ? "accepted"
          : quote.status;

  const state = toQuoteState(effectiveStatus, {
    viewed: !!quote.viewed_at,
    // Revising is always available on both quote surfaces regardless of
    // age — there is no grace-window gate here (that concept is local to
    // useContractorPipeline's work-list visibility, out of scope for a
    // full listing surface) — so a rejected quote always presents as
    // actionable to the contractor, not just within some recent window.
    withinFollowUpWindow: true,
    depositRequired: !!quote.deposit_required,
    depositPaid: !!quote.deposit_paid,
    validUntil: quote.valid_until,
  });
  const result = presentState(state ?? { kind: "quote", status: "draft" }, viewer === "contractor" ? "contractor" : "recipient");
  const badgeClass = TONE_BADGE_CLASS[result.tone];
  // The status the badge actually shows, not the pre-derivation fold above —
  // toQuoteState('sent', {validUntil}) can turn 'sent' into 'expired' at
  // render time, and that derived value never flows back into
  // effectiveStatus. Checking effectiveStatus here missed every
  // derived-expired quote (status stays 'sent' in the DB) — lapsed and
  // superseded were unaffected only because those two are stored statuses,
  // never derived.
  const finalStatus = state?.status ?? effectiveStatus;
  const dimmed = DIMMED_STATUSES.has(finalStatus);

  const reference = viewer === "contractor"
    ? formatQuoteRef(quote.quote_number, { version: quote.version > 1 ? quote.version : undefined })
    : formatQuoteRef(quote.quote_number, { contractorCode: contractorCode ?? undefined, version: quote.version > 1 ? quote.version : undefined });

  const v1 = versions.find((v) => v.version === 1) ?? quote;
  const totalChanged = v1.total !== quote.total;
  const v1HasDeposit = !!v1.deposit_required && v1.deposit_amount != null;
  const currentHasDeposit = !!quote.deposit_required && quote.deposit_amount != null;
  const depositChanged = v1HasDeposit !== currentHasDeposit || v1.deposit_amount !== quote.deposit_amount;

  const latestVersion = versions.reduce((a, b) => (b.version > a.version ? b : a), quote);
  const draftRevisionPending = latestVersion.status === "draft" && latestVersion.id !== quote.id;

  const daysUntilValid = Math.ceil((new Date(quote.valid_until).getTime() - Date.now()) / 86_400_000);
  const expiringSoon = finalStatus === "sent" && daysUntilValid > 0 && daysUntilValid <= EXPIRING_SOON_DAYS;

  const fields: RecordCardField[] = compact
    ? [
        { label: viewer === "contractor" ? "Client" : "Contractor", value: counterparty },
        { label: "Valid until", value: <span className={expiringSoon ? "text-amber-600 font-medium" : undefined}>{formatDate(quote.valid_until)}</span> },
        { label: "Total", value: formatGBP(quote.total) },
      ]
    : [
        { label: viewer === "contractor" ? "Client" : "Contractor", value: counterparty },
        {
          label: "Total",
          value: totalChanged
            ? <span>{formatGBP(v1.total)} <span className="text-muted-foreground">→</span> {formatGBP(quote.total)}</span>
            : formatGBP(quote.total),
        },
        ...(currentHasDeposit || v1HasDeposit
          ? [{
              label: "Deposit required",
              value: depositChanged
                ? <span>{depositLabel(v1)} <span className="text-muted-foreground">→</span> {depositLabel(quote)}</span>
                : depositLabel(quote),
            }]
          : []),
        { label: "Valid until", value: <span className={expiringSoon ? "text-amber-600 font-medium" : undefined}>{formatDate(quote.valid_until)}{expiringSoon ? " — expiring soon" : ""}</span> },
        ...(quote.enquiry_id
          ? [{ label: "Enquiry", value: <span className="inline-flex items-center gap-1"><i className="ti ti-link" style={{ fontSize: 14 }} />Linked</span> }]
          : []),
        { label: "Sent", value: quote.sent_at ? formatDate(quote.sent_at) : "Not sent" },
      ];

  return (
    <div className={dimmed ? "opacity-60" : undefined}>
      <RecordCard
        icon={<i className="ti ti-file-text" style={{ fontSize: 20 }} />}
        title={quote.title}
        reference={reference}
        badges={
          <>
            <Badge className={badgeClass}>{result.label}</Badge>
            {draftRevisionPending && <Badge variant="outline">Revision in draft</Badge>}
          </>
        }
        fields={fields}
        density={density}
        actions={actions}
      />
    </div>
  );
}
