import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const stripePromise = loadStripe("pk_test_51T0jcrAB5s9xl5hIfwaVbwe5aSfpdC5DpsE4YmkhJUGSBVPIUVCPOnCK87pv0WKUBo0LUZoXcZfhsIglMsJFfUAK00QZD2E4Xn");

interface Props {
  quoteId: string;
  totalAmount: number;
  depositAmount?: number;
  contractorName: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function CheckoutForm({
  quoteId,
  depositAmount,
  totalAmount,
  onSuccess,
}: {
  quoteId: string;
  depositAmount: number;
  totalAmount: number;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const remaining = totalAmount - depositAmount;

  const handlePay = async () => {
    if (!stripe || !elements) return;
    setLoading(true);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: "if_required",
    });

    if (error) {
      toast({
        title: "Payment failed",
        description: error.message ?? "Please try again.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    // Payment succeeded — create the job
    try {
      const { data: quote } = await supabase
        .from("issued_quotes")
        .select("contractor_id, recipient_id, title, client_address")
        .eq("id", quoteId)
        .single();

      if (quote) {
        const { error: jobError } = await supabase.from("jobs").insert({
          contractor_id: quote.contractor_id,
          customer_id: quote.recipient_id,
          issued_quote_id: quoteId,
          title: quote.title,
          location: quote.client_address ?? null,
          status: "scheduled",
          contract_value: totalAmount,
        });

        if (jobError) {
          console.error("Job creation failed", jobError);
          toast({
            title: "Payment taken but job creation failed",
            description: "Please contact support with your quote reference.",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
      }
    } catch (err) {
      console.error("Job creation error", err);
    }

    toast({
      title: "Deposit paid",
      description: "Your job is confirmed!",
    });
    setLoading(false);
    onSuccess();
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-muted/40 p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total job value</span>
          <span className="font-medium">£{totalAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-semibold" style={{ color: "#f07820" }}>
          <span>Deposit due now</span>
          <span>£{depositAmount.toFixed(2)}</span>
        </div>
        <Separator />
        <div className="flex justify-between text-muted-foreground">
          <span>Remaining on completion</span>
          <span>£{remaining.toFixed(2)}</span>
        </div>
      </div>

      <PaymentElement />

      <Button
        onClick={handlePay}
        disabled={loading}
        className="w-full text-white font-semibold"
        style={{ backgroundColor: "#f07820" }}
      >
        {loading ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing…</>
        ) : (
          `Pay £${depositAmount.toFixed(2)} deposit`
        )}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Secured by Stripe · Funds held until job confirmed complete
      </p>
    </div>
  );
}

export function DepositPaymentDialog({
  quoteId,
  totalAmount,
  depositAmount: propDeposit,
  contractorName,
  open,
  onClose,
  onSuccess,
}: Props) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [resolvedDeposit, setResolvedDeposit] = useState<number>(
    propDeposit ?? totalAmount * 0.25
  );
  const [initialising, setInitialising] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!open || clientSecret) return;

    const init = async () => {
      setInitialising(true);
      setError(null);

      const { data, error: fnError } = await supabase.functions.invoke("accept-quote", {
        body: { quote_id: quoteId },
      });

      if (fnError || !data?.client_secret) {
        const msg = data?.error ?? fnError?.message ?? "Could not set up payment";
        setError(msg);
        toast({ title: "Payment setup failed", description: msg, variant: "destructive" });
        setInitialising(false);
        return;
      }

      setClientSecret(data.client_secret);
      if (data.deposit_amount) setResolvedDeposit(data.deposit_amount);
      setInitialising(false);
    };

    init();
  }, [open, quoteId]);

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm job with {contractorName}</DialogTitle>
          <DialogDescription>
            Pay the deposit to secure your booking. The remaining balance is due on completion.
          </DialogDescription>
        </DialogHeader>

        {initialising && (
          <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Setting up secure payment…
          </div>
        )}

        {error && !initialising && (
          <p className="text-sm text-destructive py-2">{error}</p>
        )}

        {clientSecret && !initialising && (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: {
                theme: "night",
                variables: { colorPrimary: "#f07820" },
              },
            }}
          >
            <CheckoutForm
              quoteId={quoteId}
              depositAmount={resolvedDeposit}
              totalAmount={totalAmount}
              onSuccess={() => {
                onSuccess();
                handleClose();
              }}
            />
          </Elements>
        )}
      </DialogContent>
    </Dialog>
  );
}