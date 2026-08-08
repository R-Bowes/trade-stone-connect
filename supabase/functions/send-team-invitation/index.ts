// supabase/functions/send-team-invitation/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Sends (or resends) a branded HTML invite email for a team_invitations row
// that the frontend has already inserted (or is re-sending). Notifier only —
// does not create or mutate the invitation row itself; the contractor's own
// RLS-scoped insert/select of team_invitations happens client-side.
//   POST /functions/v1/send-team-invitation { invitation_id }
// Caller must be authenticated as the invitation's own contractor — verified
// here rather than relied on RLS, since this function reads via service role.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { buildEmail, buildSubject } from "../_shared/emailTemplate.ts";

const ALLOWED_ORIGINS = [
  "https://tradesltd.co.uk",
  "https://www.tradesltd.co.uk",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:8080",
];

const getCorsHeaders = (origin: string | null): HeadersInit => {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get("Origin"));

  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("ADMIN_SECRET_KEY")!,
      { auth: { persistSession: false } },
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json(401, { success: false, error: "Unauthorized" });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return json(401, { success: false, error: "Unauthorized" });
    }

    const body = await req.json();
    const invitation_id: string | undefined = body?.invitation_id;
    if (!invitation_id || typeof invitation_id !== "string") {
      return json(400, { success: false, error: "invitation_id required" });
    }

    const { data: invitation, error: invitationError } = await supabase
      .from("team_invitations")
      .select("id, team_member_id, contractor_id, email, token, status")
      .eq("id", invitation_id)
      .maybeSingle();

    if (invitationError || !invitation) {
      console.error("[send-team-invitation] invitation fetch failed:", invitationError);
      return json(404, { success: false, error: "Invitation not found" });
    }

    // The contractor calling this must own the invitation. profiles.id ==
    // profiles.user_id == auth.uid() by construction (CLAUDE.md).
    const { data: contractorProfile } = await supabase
      .from("profiles")
      .select("id, full_name, company_name")
      .eq("id", invitation.contractor_id)
      .maybeSingle();

    if (!contractorProfile || contractorProfile.id !== userData.user.id) {
      return json(403, { success: false, error: "Not authorised to send this invitation" });
    }

    if (invitation.status !== "pending") {
      return json(400, { success: false, error: `Invitation is ${invitation.status}, not pending` });
    }

    const { data: teamMember } = await supabase
      .from("team_members")
      .select("full_name")
      .eq("id", invitation.team_member_id)
      .maybeSingle();

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("[send-team-invitation] RESEND_API_KEY secret is not set");
      return json(500, { success: false, error: "Email service not configured" });
    }

    const publicUrl = Deno.env.get("SITE_URL") ?? "https://tradesltd.co.uk";
    const emailData = {
      contractorName: contractorProfile.company_name || contractorProfile.full_name || "your employer",
      memberName: teamMember?.full_name || "there",
      ctaUrl: `${publicUrl}/invite/${invitation.token}`,
    };

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: "TradeStone <noreply@tradesltd.co.uk>",
        to: [invitation.email],
        subject: buildSubject("team_invitation", emailData),
        html: buildEmail("team_invitation", emailData),
      }),
    });

    if (!emailRes.ok) {
      const resendError = await emailRes.json();
      console.error("[send-team-invitation] Resend API error:", resendError);
      return json(500, { success: false, error: "Failed to send email" });
    }

    console.log(`[send-team-invitation] email sent to ${invitation.email} for invitation ${invitation_id}`);
    return json(200, { success: true });
  } catch (error: unknown) {
    console.error("[send-team-invitation] unexpected error:", error);
    return json(500, { success: false, error: "Internal server error" });
  }
});
