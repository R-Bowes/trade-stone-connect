import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, CheckCircle, AlertCircle, Loader2, ExternalLink } from "lucide-react";

export const StripeConnect = () => {
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [stripeStatus, setStripeStatus] = useState<"not_connected" | "pending" | "active">("not_connected");
  const { toast } = useToast();

  useEffect(() => {
    checkStripeStatus();

    // Handle return from Stripe onboarding
    const params = new URLSearchParams(window.location.search);
    if (params.get("stripe") === "success") {
      toast({
        title: "Stripe Connected!",
        description: "Your account is being verified. You can now receive payments.",
      });
      window.history.replaceState({}, "", window.location.pathname);
      checkStripeStatus();
    } else if (params.get("stripe") === "refresh") {
      toast({
        title: "Stripe Setup Incomplete",
        description: "Please complete your Stripe onboarding to receive payments.",
        variant: "destructive",
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const checkStripeStatus = async () => {
    setChecking(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_account_id")
      .eq("user_id", user.id)
      .single();

    const accountId = (profile as any)?.stripe_account_id;
    setStripeAccountId(accountId || null);

    if (accountId) {
      setStripeStatus("pending");
    } else {
      setStripeStatus("not_connected");
    }

    setChecking(false);
  };

  const handleConnectStripe = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const response = await supabase.functions.invoke("create-connect-account", {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (response.error) throw new Error(response.error.message);

      const { url } = response.data;
      window.location.href = url;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to connect Stripe. Please try again.",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm text-muted-foreground">Checking payment status...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Payment Setup
        </CardTitle>
        <CardDescription>
          Connect your Stripe account to receive invoice payments directly from clients.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {stripeStatus === "not_connected" && (
          <>
            <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <p className="text-sm text-yellow-800">
                You haven't connected a payment account yet. Clients won't be able to pay your invoices online.
              </p>
            </div>
            <Button onClick={handleConnectStripe} disabled={loading} className="w-full">
              {loading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Connecting...</>
              ) : (
                <><CreditCard className="h-4 w-4 mr-2" />Connect Stripe Account</>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Powered by Stripe. TradeStone takes a 3.5% platform fee on payments.
            </p>
          </>
        )}

        {stripeStatus === "pending" && (
          <>
            <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <CheckCircle className="h-4 w-4 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-blue-800">Stripe Account Connected</p>
                <p className="text-xs text-blue-600">Account ID: {stripeAccountId}</p>
              </div>
              <Badge variant="outline" className="ml-auto">Active</Badge>
            </div>
            <Button variant="outline" onClick={handleConnectStripe} disabled={loading} className="w-full">
              <ExternalLink className="h-4 w-4 mr-2" />
              Manage Stripe Account
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};
