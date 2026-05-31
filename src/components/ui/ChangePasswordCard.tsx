import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const MIN_LENGTH = 8;

export function ChangePasswordCard() {
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (password.length < MIN_LENGTH) {
      toast({ title: `Password must be at least ${MIN_LENGTH} characters`, variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: "Password changed", description: "Your password has been updated." });
      setPassword("");
      setConfirm("");
    } catch (error) {
      console.error("Password change failed:", error);
      toast({
        title: "Could not change password",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
        <CardDescription>Update the password you use to sign in.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="change-password">New password</Label>
          <Input
            id="change-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="change-confirm">Confirm new password</Label>
          <Input
            id="change-confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={submitting}
            autoComplete="new-password"
          />
        </div>
        <div className="flex justify-end">
          <Button onClick={() => void handleSubmit()} disabled={submitting || !password || !confirm}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Update password
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}