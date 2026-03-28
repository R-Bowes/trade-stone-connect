import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";

type PublicInvoice = {
  id: string;
  invoice_number: string | null;
  client_name: string;
  due_date: string;
  status: string;
  items: Array<{ description: string; quantity: number; unit_price: number; total: number }>;
  subtotal: number;
  tax_amount: number;
  total: number;
};

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "");

function PaymentForm({ total }: { total: number }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.href,
      },
      redirect: "if_required",
    });

    setLoading(false);
    if (error) {
      setMessage(error.message ?? "Payment failed");
      return;
    }

    setMessage("Payment successful. Thank you.");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      <Button className="w-full" disabled={!stripe || loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : `Pay £${total.toFixed(2)}`}
      </Button>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </form>
  );
}

export default function PayInvoicePage() {
  const { invoiceId } = useParams();
  const [invoice, setInvoice] = useState<PublicInvoice | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInvoiceAndPayment = async () => {
      if (!invoiceId) return;
      setLoading(true);

      const paymentResponse = await supabase.functions.invoke("create-payment-intent", {
        body: {
          action: "create_client_secret",
          invoiceId,
        },
      });

      if (paymentResponse.error) {
        setError(paymentResponse.error.message || "Could not initialise payment.");
      } else {
        const invoiceData = paymentResponse.data.invoice as PublicInvoice;
        setInvoice({
          ...invoiceData,
          items: Array.isArray(invoiceData.items) ? invoiceData.items : [],
        });
        setClientSecret(paymentResponse.data.clientSecret);
      }

      setLoading(false);
    };

    fetchInvoiceAndPayment();
  }, [invoiceId]);

  const statusBadge = useMemo(() => {
    if (!invoice) return null;
    if (invoice.status === "paid") return <Badge className="bg-green-100 text-green-800">Paid</Badge>;
    if (invoice.status === "overdue") return <Badge className="bg-red-100 text-red-800">Overdue</Badge>;
    return <Badge className="bg-amber-100 text-amber-800">Payment due</Badge>;
  }, [invoice]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (error || !invoice) {
    return <div className="min-h-screen flex items-center justify-center text-destructive">{error ?? "Invoice unavailable."}</div>;
  }

  return (
    <div className="min-h-screen bg-muted/30 p-4 md:p-8">
      <div className="mx-auto max-w-4xl grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Invoice {invoice.invoice_number ?? invoice.id}</CardTitle>
            <CardDescription>
              {invoice.client_name} • Due {invoice.due_date}
            </CardDescription>
            {statusBadge}
          </CardHeader>
          <CardContent className="space-y-3">
            {invoice.items.map((item, idx) => (
              <div key={`${item.description}-${idx}`} className="flex justify-between text-sm">
                <span>{item.description} × {item.quantity}</span>
                <span>£{Number(item.total).toFixed(2)}</span>
              </div>
            ))}
            <Separator />
            <div className="flex justify-between text-sm"><span>Subtotal</span><span>£{Number(invoice.subtotal).toFixed(2)}</span></div>
            <div className="flex justify-between text-sm"><span>VAT</span><span>£{Number(invoice.tax_amount).toFixed(2)}</span></div>
            <div className="flex justify-between font-semibold"><span>Total</span><span>£{Number(invoice.total).toFixed(2)}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pay securely</CardTitle>
            <CardDescription>Card payment powered by Stripe</CardDescription>
          </CardHeader>
          <CardContent>
            {invoice.status === "paid" ? (
              <p className="text-green-700 font-medium">This invoice has already been paid.</p>
            ) : clientSecret ? (
              <Elements stripe={stripePromise} options={{ clientSecret }}>
                <PaymentForm total={Number(invoice.total)} />
              </Elements>
            ) : (
              <p className="text-destructive">Could not initialise payment.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
