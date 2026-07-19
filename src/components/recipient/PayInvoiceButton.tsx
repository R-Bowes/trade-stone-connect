import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CreditCard } from "lucide-react";

/**
 * Converged on the single invoice-payment path (readiness-audit R1-2):
 * PayInvoicePage.tsx / create-payment-intent (PaymentIntent + Elements),
 * the same mechanism the emailed overdue-reminder link uses. This button
 * is now just a shortcut into that page for a client already in their
 * dashboard — create-invoice-payment (Checkout Session) has been retired.
 */
export const PayInvoiceButton = ({
  invoiceId,
  status,
}: {
  invoiceId: string;
  status: string;
}) => {
  const navigate = useNavigate();

  if (status === "paid") return null;

  return (
    <Button
      onClick={() => navigate(`/pay/${invoiceId}`)}
      size="sm"
      className="bg-[#f07820] hover:bg-[#d4651a] text-white border-0"
    >
      <CreditCard className="h-4 w-4 mr-2" />
      Pay Now
    </Button>
  );
};
