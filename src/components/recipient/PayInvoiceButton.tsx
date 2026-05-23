import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Loader2, ExternalLink } from "lucide-react";

export const PayInvoiceButton = ({
  invoiceId,
  amount,
  status,
  onPaymentComplete,
}: {
  invoiceId: string;
  amount: number;
  status: string;
  onPaymentComplete: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  if (status === "paid") return null;

  const handlePayNow = async () => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await supabase.functions.invoke("create-invoice-payment", {
        body: { invoice_id: invoiceId },
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (response.error) throw new Error(response.error.message);
      if (!response.data?.url) throw new Error("No payment URL returned.");

      window.location.href = response.data.url;
    } catch (error: any) {
      toast({
        title: "Payment error",
        description: error.message || "Could not start payment. Please try again.",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        disabled={loading}
        size="sm"
        className="bg-[#f07820] hover:bg-[#d4651a] text-white border-0"
      >
        <CreditCard className="h-4 w-4 mr-2" />
        Pay Now
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Pay Invoice — £{amount.toFixed(2)}</DialogTitle>
            <DialogDescription>
              You will be taken to a secure Stripe payment page. Once complete
              you will be returned to your dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-2">
            <Button
              onClick={handlePayNow}
              disabled={loading}
              className="w-full bg-[#f07820] hover:bg-[#d4651a] text-white border-0"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Redirecting to Stripe...
                </>
              ) : (
                <>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Pay £{amount.toFixed(2)} securely
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={loading}
              className="w-full"
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};