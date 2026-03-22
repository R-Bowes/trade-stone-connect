import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Loader2 } from "lucide-react";

const stripePromise = loadStripe("pk_test_51T0jcrAB5s9xl5hIfwaVbwe5aSfpdC5DpsE4YmkhJUGSBVPIUVCPOnCK87pv0WKUBo0LUZoXcZfhsIglMsJFfUAK00QZD2E4Xn");

const CheckoutForm = ({
  invoiceId,
  amount,
  onSuccess,
}: {
  invoiceId: string;
  amount: number;
  onSuccess: () => void;
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/dashboard`,
      },
      redirect: "if_required",
    });

    if (error) {
      toast({
        title: "Payment Failed",
        description: error.message,
        variant: "destructive",
      });
      setLoading(false);
    } else {
      await supabase
        .from("invoices")
        .update({ status: "paid", paid_date: new Date().toISOString() })
        .eq("id", invoiceId);

      toast({
        title: "Payment Successful!",
        description: `£${amount.toFixed(2)} paid successfully.`,
      });
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      <Button type="submit" disabled={loading || !stripe} className="w-full">
        {loading ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing...</>
        ) : (
          `Pay £${amount.toFixed(2)}`
        )}
      </Button>
    </form>
  );
};

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
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  if (status === "paid") return null;

  const handleOpenPayment = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const response = await supabase.functions.invoke("create-payment-intent", {
        body: { invoiceId },
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (response.error) throw new Error(response.error.message);

      setClientSecret(response.data.clientSecret);
      setOpen(true);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Could not initialise payment. Please try again.",
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  return (
    <>
      <Button onClick={handleOpenPayment} disabled={loading} size="sm">
        {loading ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Loading...</>
        ) : (
          <><CreditCard className="h-4 w-4 mr-2" />Pay Now</>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pay Invoice — £{amount.toFixed(2)}</DialogTitle>
          </DialogHeader>
          {clientSecret && (
            <Elements
              stripe={stripePromise}
              options={{ clientSecret, appearance: { theme: "stripe" } }}
            >
              <CheckoutForm
                invoiceId={invoiceId}
                amount={amount}
                onSuccess={() => {
                  setOpen(false);
                  onPaymentComplete();
                }}
              />
            </Elements>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
