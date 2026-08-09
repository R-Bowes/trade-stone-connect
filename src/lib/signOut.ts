import type { NavigateFunction } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

/**
 * The one sign-out call site for the whole app — Header.tsx's avatar
 * dropdown and FieldHeader.tsx's field sign-out button both call this
 * instead of duplicating supabase.auth.signOut() + toast + navigate.
 * Keeping it in one place guarantees signing out from /field lands on the
 * same destination ("/") as signing out anywhere else.
 */
export async function performSignOut(navigate: NavigateFunction) {
  const { error } = await supabase.auth.signOut();
  if (error) {
    toast({ variant: "destructive", title: "Logout failed", description: error.message });
    return;
  }

  toast({ title: "Logged out", description: "You have been logged out successfully." });
  navigate("/");
}
