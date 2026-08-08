import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";

const NAVY = "#1a2744";
const ORANGE = "#f07820";

type PreviewState =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "found"; email: string; contractorName: string };

type AcceptOutcome =
  | { kind: "expired" }
  | { kind: "already_accepted" }
  | { kind: "wrong_email" }
  | { kind: "already_bound" }
  | { kind: "revoked" }
  | { kind: "other"; message: string };

function classifyAcceptError(message: string): AcceptOutcome {
  const m = message.toLowerCase();
  if (m.includes("already been accepted")) return { kind: "already_accepted" };
  if (m.includes("expired")) return { kind: "expired" };
  if (m.includes("different email")) return { kind: "wrong_email" };
  if (m.includes("already been bound")) return { kind: "already_bound" };
  if (m.includes("revoked")) return { kind: "revoked" };
  return { kind: "other", message };
}

const OUTCOME_COPY: Record<AcceptOutcome["kind"], { title: string; body: string }> = {
  expired: {
    title: "This invitation has expired",
    body: "Ask your employer to resend the invitation from their Team page.",
  },
  already_accepted: {
    title: "Already accepted",
    body: "This invitation has already been used. Log in with the account you signed up with.",
  },
  wrong_email: {
    title: "Wrong email address",
    body: "This invitation was sent to a different email address. Log in or sign up using that exact address.",
  },
  already_bound: {
    title: "Already linked",
    body: "This invitation has already been linked to an account.",
  },
  revoked: {
    title: "Invitation revoked",
    body: "Your employer has revoked this invitation. Ask them to send a new one.",
  },
  other: {
    title: "Couldn't accept invitation",
    body: "Something went wrong. Please try again or contact your employer.",
  },
};

export default function AcceptTeamInvite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [preview, setPreview] = useState<PreviewState>({ kind: "loading" });
  const [session, setSession] = useState<"checking" | "authed" | "unauthed">("checking");
  const [accepting, setAccepting] = useState(false);
  const [outcome, setOutcome] = useState<AcceptOutcome | null>(null);
  const [checkEmailSent, setCheckEmailSent] = useState(false);

  // A returning visitor who already has an account (created on an earlier
  // attempt at this same invitation) must not default back into the signup
  // path — supabase-js's signUp() on an already-registered, already-
  // confirmed email returns a 200 with no error and no session (an
  // anti-enumeration decoy, see handleSignup below), which looked
  // indistinguishable from a real "check your email" state and stranded
  // real invitations forever. Persist "this email already has an account"
  // per-token so a fresh mount of this page defaults straight to login.
  const accountExistsKey = token ? `ts_invite_account_exists_${token}` : null;
  const [mode, setMode] = useState<"login" | "signup">(() =>
    accountExistsKey && localStorage.getItem(accountExistsKey) === "1" ? "login" : "signup",
  );
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setPreview({ kind: "invalid" });
      return;
    }
    (async () => {
      const { data, error } = await supabase.rpc("get_team_invitation_preview", { p_token: token });
      if (error || !data || data.length === 0) {
        setPreview({ kind: "invalid" });
        return;
      }
      setPreview({ kind: "found", email: data[0].email, contractorName: data[0].contractor_name });
    })();
  }, [token]);

  useEffect(() => {
    // Two-pronged, not just a one-shot getSession(): when the email
    // confirmation link redirects back here with auth tokens in the URL
    // fragment, the Supabase client parses them ASYNCHRONOUSLY. A single
    // getSession() call can race ahead of that parsing and resolve to "no
    // session" before it lands, permanently missing the "now authed, go
    // accept" trigger below (confirmed: this was silently stranding
    // real invitations in `pending`, profile_id never set). subscribing to
    // onAuthStateChange also catches the SIGNED_IN event that URL-detection
    // fires once it completes, whichever way the race would have gone.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, authSession) => {
      setSession(authSession ? "authed" : "unauthed");
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession((prev) => (prev === "authed" ? prev : data.session ? "authed" : "unauthed"));
    });

    return () => subscription.unsubscribe();
  }, []);

  const attemptAccept = async () => {
    if (!token) return;
    setAccepting(true);
    setOutcome(null);
    const { error } = await supabase.rpc("accept_team_invitation", { p_token: token });
    setAccepting(false);
    if (error) {
      setOutcome(classifyAcceptError(error.message));
      return;
    }
    navigate("/field", { replace: true });
  };

  useEffect(() => {
    if (session === "authed" && preview.kind === "found" && !accepting && !outcome) {
      void attemptAccept();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, preview]);

  const handleLogin = async () => {
    if (preview.kind !== "found") return;
    setFormError(null);
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email: preview.email, password });
    setSubmitting(false);
    if (error) {
      setFormError(error.message);
      return;
    }
    setSession("authed");
  };

  const handleSignup = async () => {
    if (preview.kind !== "found") return;
    if (!fullName.trim()) {
      setFormError("Enter your full name");
      return;
    }
    if (password.length < 6) {
      setFormError("Password must be at least 6 characters");
      return;
    }
    setFormError(null);
    setSubmitting(true);
    const { data, error } = await supabase.auth.signUp({
      email: preview.email,
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: `${window.location.origin}/invite/${token}`,
      },
    });
    setSubmitting(false);
    if (error) {
      setFormError(error.message);
      return;
    }

    // Anti-enumeration decoy: signUp() on an email that's already
    // registered AND confirmed returns 200, no error, no session — and a
    // synthetic user with an EMPTY identities array (a genuine new signup
    // always has exactly one). Confirmed against the live Auth API before
    // writing this check — do not "fix" this by loosening it, the empty
    // array is the only reliable signal available client-side.
    const isDecoy = Array.isArray(data.user?.identities) && data.user.identities.length === 0;
    if (isDecoy) {
      if (accountExistsKey) localStorage.setItem(accountExistsKey, "1");
      setMode("login");
      setFormError("An account with this email already exists — sign in below to accept the invitation.");
      return;
    }

    if (data.session) {
      // Email confirmation is off for this project instance — session
      // exists immediately.
      setSession("authed");
    } else {
      if (accountExistsKey) localStorage.setItem(accountExistsKey, "1");
      setCheckEmailSent(true);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#f0f2f5" }}>
      <div style={{ backgroundColor: NAVY }} className="py-6 px-4 text-center">
        <div
          style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
          className="text-2xl font-bold uppercase tracking-wide text-white"
        >
          TRADE<span style={{ color: ORANGE }}>STONE</span>
        </div>
      </div>

      <div className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border p-6">
          {preview.kind === "loading" && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: NAVY }} />
            </div>
          )}

          {preview.kind === "invalid" && (
            <div className="text-center py-6 space-y-2">
              <h1 className="text-lg font-semibold" style={{ color: NAVY, fontFamily: "Lexend, sans-serif" }}>
                Invitation not found
              </h1>
              <p className="text-sm text-muted-foreground">
                This invitation link is invalid or has expired. Ask your employer to send a new one.
              </p>
            </div>
          )}

          {preview.kind === "found" && outcome && (
            <div className="text-center py-6 space-y-2">
              <h1 className="text-lg font-semibold" style={{ color: NAVY, fontFamily: "Lexend, sans-serif" }}>
                {OUTCOME_COPY[outcome.kind].title}
              </h1>
              <p className="text-sm text-muted-foreground">{OUTCOME_COPY[outcome.kind].body}</p>
              {(outcome.kind === "already_accepted" || outcome.kind === "wrong_email") && (
                <Button className="w-full mt-4" onClick={() => navigate("/login")} style={{ backgroundColor: ORANGE }}>
                  Go to login
                </Button>
              )}
            </div>
          )}

          {preview.kind === "found" && !outcome && accepting && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: NAVY }} />
              <p className="text-sm text-muted-foreground">Linking your account…</p>
            </div>
          )}

          {preview.kind === "found" && !outcome && !accepting && session === "unauthed" && !checkEmailSent && (
            <>
              <div className="text-center mb-5">
                <h1 className="text-lg font-semibold" style={{ color: NAVY, fontFamily: "Lexend, sans-serif" }}>
                  Join {preview.contractorName}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Accept your invitation to get job list, timesheet and site tool access.
                </p>
              </div>

              <Tabs value={mode} onValueChange={(v) => setMode(v as "login" | "signup")} className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="signup">New account</TabsTrigger>
                  <TabsTrigger value="login">I already have one</TabsTrigger>
                </TabsList>

                <TabsContent value="signup" className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="invite_email_signup">Email</Label>
                    <Input id="invite_email_signup" value={preview.email} disabled />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="invite_full_name">Full name</Label>
                    <Input id="invite_full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="invite_password_signup">Password</Label>
                    <Input
                      id="invite_password_signup"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  {formError && <p className="text-sm text-red-600">{formError}</p>}
                  <Button
                    className="w-full"
                    style={{ backgroundColor: ORANGE }}
                    disabled={submitting}
                    onClick={handleSignup}
                  >
                    {submitting ? "Creating account…" : "Create account & accept"}
                  </Button>
                </TabsContent>

                <TabsContent value="login" className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="invite_email_login">Email</Label>
                    <Input id="invite_email_login" value={preview.email} disabled />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="invite_password_login">Password</Label>
                    <Input
                      id="invite_password_login"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  {formError && <p className="text-sm text-red-600">{formError}</p>}
                  <Button
                    className="w-full"
                    style={{ backgroundColor: NAVY }}
                    disabled={submitting}
                    onClick={handleLogin}
                  >
                    {submitting ? "Logging in…" : "Log in & accept"}
                  </Button>
                </TabsContent>
              </Tabs>
            </>
          )}

          {preview.kind === "found" && checkEmailSent && (
            <div className="text-center py-6 space-y-2">
              <h1 className="text-lg font-semibold" style={{ color: NAVY, fontFamily: "Lexend, sans-serif" }}>
                Check your email
              </h1>
              <p className="text-sm text-muted-foreground">
                We've sent a confirmation link to {preview.email}. Open it to finish accepting your invitation.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
