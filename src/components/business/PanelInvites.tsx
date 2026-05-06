import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  CheckCircle2,
  XCircle,
  Loader2,
  Users,
  Clock,
} from "lucide-react";

interface PanelInvite {
  id: string;
  status: string | null;
  tier: string | null;
  notes: string | null;
  created_at: string | null;
  company_name: string | null;
  company_city: string | null;
  company_email: string | null;
}

interface PanelInvitesProps {
  profileId: string; // profiles.id
}

const tierLabels: Record<string, string> = {
  preferred: "Preferred",
  approved: "Approved",
  under_review: "Under Review",
};

export const PanelInvites = ({ profileId }: PanelInvitesProps) => {
  const { toast } = useToast();
  const [invites, setInvites] = useState<PanelInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);

  const loadInvites = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("contractor_panel")
      .select("id, status, tier, notes, created_at, company_id")
      .eq("contractor_id", profileId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error", description: "Could not load panel invites.", variant: "destructive" });
      setLoading(false);
      return;
    }

    // Hydrate with company data
    const hydrated: PanelInvite[] = await Promise.all(
      (data || []).map(async (row) => {
        if (!row.company_id) return {
          ...row, company_name: null, company_city: null, company_email: null,
        };

        const { data: company } = await supabase
          .from("companies")
          .select("name, city, email")
          .eq("id", row.company_id)
          .maybeSingle();

        return {
          ...row,
          company_name: company?.name ?? null,
          company_city: company?.city ?? null,
          company_email: company?.email ?? null,
        };
      })
    );

    setInvites(hydrated);
    setLoading(false);
  }, [profileId, toast]);

  useEffect(() => {
    loadInvites();
  }, [loadInvites]);

  const respond = async (inviteId: string, accept: boolean) => {
    setActioning(inviteId);

    const { error } = await supabase
      .from("contractor_panel")
      .update({
        status: accept ? "approved" : "removed",
        ...(accept ? { approved_at: new Date().toISOString() } : {}),
      })
      .eq("id", inviteId);

    if (error) {
      toast({ title: "Error", description: "Failed to respond to invite.", variant: "destructive" });
      setActioning(null);
      return;
    }

    toast({
      title: accept ? "Invite accepted" : "Invite declined",
      description: accept
        ? "You have joined the contractor panel."
        : "You have declined the panel invite.",
    });

    setActioning(null);
    loadInvites();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (invites.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-lg">Panel Invitations</h3>
        <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
          {invites.length} pending
        </Badge>
      </div>

      {invites.map((invite) => (
        <Card key={invite.id} className="border-yellow-200 bg-yellow-50/30">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold">
                      {invite.company_name ?? "A business"}
                    </p>
                    {invite.tier && (
                      <Badge variant="outline" className="text-xs">
                        {tierLabels[invite.tier] ?? invite.tier}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {invite.company_city && (
                      <p className="text-sm text-muted-foreground">{invite.company_city}</p>
                    )}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {new Date(invite.created_at!).toLocaleDateString("en-GB")}
                    </div>
                  </div>
                  {invite.notes && (
                    <p className="text-sm text-muted-foreground mt-1 italic">"{invite.notes}"</p>
                  )}
                </div>
              </div>

              <div className="flex gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-50"
                  disabled={actioning === invite.id}
                  onClick={() => respond(invite.id, false)}
                >
                  {actioning === invite.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <XCircle className="h-3 w-3 mr-1" />
                  )}
                  Decline
                </Button>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  disabled={actioning === invite.id}
                  onClick={() => respond(invite.id, true)}
                >
                  {actioning === invite.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                  )}
                  Accept
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
