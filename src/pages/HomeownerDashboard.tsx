import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import HomeownerLayout from "@/components/layout/HomeownerLayout";
import { HelpSystemProvider } from "@/components/help/HelpSystemProvider";
import { ClientJobsView } from "@/components/management/ClientJobsView";
import { ReceivedQuotes } from "@/components/recipient/ReceivedQuotes";
import { ReceivedInvoices } from "@/components/recipient/ReceivedInvoices";
import { EnquiryList } from "@/components/personal/EnquiryList";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { HomeownerMessageInbox } from "@/components/homeowner/HomeownerMessageInbox";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ErrorState, LoadingState } from "@/components/AsyncState";

// ── Overview ──────────────────────────────────────────────────────────────────

interface OverviewJob {
  id: string;
  title: string;
  status: string;
  start_date: string | null;
  contract_value: number;
  created_at: string;
}

interface PendingQuote {
  id: string;
  title: string;
  total: number;
  quote_number: string | null;
}

interface PendingInvoice {
  id: string;
  invoice_number: string | null;
  total: number;
  due_date: string;
}

function HomeownerOverview({ profileId, userId }: { profileId: string; userId: string }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activeJobs, setActiveJobs] = useState<OverviewJob[]>([]);
  const [nextVisit, setNextVisit] = useState<string | null>(null);
  const [outstandingAmount, setOutstandingAmount] = useState(0);
  const [pendingQuotes, setPendingQuotes] = useState<PendingQuote[]>([]);
  const [pendingInvoices, setPendingInvoices] = useState<PendingInvoice[]>([]);

  useEffect(() => {
    const load = async () => {
      const [jobsResult, quotesResult, invoicesResult] = await Promise.all([
        supabase
          .from("jobs")
          .select("id, title, status, start_date, contract_value, created_at")
          .eq("customer_id", profileId)
          .order("created_at", { ascending: false }),

        supabase
          .from("issued_quotes")
          .select("id, title, total, quote_number")
          .eq("recipient_id", profileId)
          .eq("status", "sent")
          .is("recipient_response", null)
          .order("created_at", { ascending: false })
          .limit(5),

        supabase
          .from("invoices")
          .select("id, invoice_number, total, due_date, recipient_response")
          .eq("recipient_id", userId)
          .order("due_date", { ascending: true }),
      ]);

      const jobs = (jobsResult.data ?? []) as OverviewJob[];
      const inProgress = jobs.filter((j) => j.status === "in_progress");
      setActiveJobs(inProgress);

      const soonest = inProgress
        .filter((j) => j.start_date)
        .sort((a, b) => new Date(a.start_date!).getTime() - new Date(b.start_date!).getTime())
        .at(0)?.start_date ?? null;
      setNextVisit(soonest);

      setPendingQuotes((quotesResult.data ?? []) as PendingQuote[]);

      type InvoiceRow = PendingInvoice & { recipient_response: string | null };
      const allInvoices = (invoicesResult.data ?? []) as InvoiceRow[];
      const unpaid = allInvoices.filter((inv) => inv.recipient_response !== "paid");
      setPendingInvoices(
        unpaid.slice(0, 5).map(({ id, invoice_number, total, due_date }) => ({
          id, invoice_number, total, due_date,
        }))
      );
      setOutstandingAmount(unpaid.reduce((sum, inv) => sum + Number(inv.total), 0));

      setLoading(false);
    };

    load().catch(() => setLoading(false));
  }, [profileId, userId]);

  const awaitingYou = pendingQuotes.length + pendingInvoices.length;

  if (loading) {
    return (
      <div className="p-6 flex justify-center items-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Active jobs</p>
            <p className="text-3xl font-bold">{activeJobs.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Awaiting you</p>
            <p className={`text-3xl font-bold ${awaitingYou > 0 ? "text-orange-500" : ""}`}>
              {awaitingYou}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Next visit</p>
            <p className="text-base font-semibold leading-snug">
              {nextVisit ? format(new Date(nextVisit), "d MMM yyyy") : "None scheduled"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Outstanding</p>
            <p className={`text-3xl font-bold ${outstandingAmount > 0 ? "text-red-600" : ""}`}>
              £{outstandingAmount.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Action needed */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <i className="ti ti-bell" style={{ fontSize: 16 }} />
            Action needed
            {awaitingYou > 0 && (
              <Badge className="bg-orange-100 text-orange-700 border-0 ml-1">{awaitingYou}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {awaitingYou === 0 ? (
            <p className="text-sm text-muted-foreground">You are all up to date.</p>
          ) : (
            <div className="space-y-2">
              {pendingQuotes.map((q) => (
                <div
                  key={q.id}
                  className="flex items-center justify-between gap-4 p-3 rounded-lg border"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">Quote: {q.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {q.quote_number && (
                        <span className="font-mono mr-2">{q.quote_number}</span>
                      )}
                      £{Number(q.total).toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => navigate("/dashboard/homeowner?view=quotes")}
                  >
                    Review
                  </Button>
                </div>
              ))}
              {pendingInvoices.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between gap-4 p-3 rounded-lg border"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      Invoice {inv.invoice_number ?? "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Due {format(new Date(inv.due_date), "d MMM yyyy")}
                      {" · "}
                      £{Number(inv.total).toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => navigate("/dashboard/homeowner?view=invoices")}
                  >
                    Pay
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active jobs list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-lg font-semibold">Active jobs</h2>
          <button
            onClick={() => navigate("/dashboard/homeowner?view=jobs")}
            style={{
              fontSize: 13,
              color: "#f07820",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            View all
          </button>
        </div>

        {activeJobs.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <i
                className="ti ti-briefcase"
                style={{ fontSize: 32, color: "#9ca3af", display: "block", marginBottom: 8 }}
              />
              <p className="text-sm text-muted-foreground">
                No active jobs. Accept a quote to get started.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {activeJobs.slice(0, 5).map((job) => (
              <Card
                key={job.id}
                className="cursor-pointer hover:shadow-sm transition-shadow"
                onClick={() => navigate("/dashboard/homeowner?view=jobs")}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{job.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(job.created_at), "d MMM yyyy")}
                        {job.contract_value > 0 &&
                          ` · £${Number(job.contract_value).toLocaleString("en-GB", { minimumFractionDigits: 2 })}`}
                      </p>
                    </div>
                    <Badge className="bg-blue-100 text-blue-800 border-0 shrink-0">
                      In Progress
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Messages ──────────────────────────────────────────────────────────────────

interface Conversation {
  id: string;
  subject: string;
  last_message_at: string | null;
}

interface Message {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
}

function HomeownerMessages({ profileId, userId }: { profileId: string; userId: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const fetchConversations = useCallback(async () => {
    const { data, error } = await supabase
      .from("conversations")
      .select("id, subject, last_message_at")
      .or(`initiator_id.eq.${profileId},recipient_id.eq.${profileId}`)
      .order("last_message_at", { ascending: false });

    if (error) {
      console.error("Error loading conversations:", error);
    } else {
      setConversations((data ?? []) as Conversation[]);
    }
    setLoading(false);
  }, [profileId]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const openThread = async (conv: Conversation) => {
    setSelected(conv);
    setMessages([]);
    setThreadLoading(true);
    const { data } = await supabase
      .from("messages")
      .select("id, content, created_at, sender_id")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true });
    setMessages((data ?? []) as Message[]);
    setThreadLoading(false);
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !selected) return;
    setSending(true);
    try {
      const { error } = await supabase.from("messages").insert({
        conversation_id: selected.id,
        sender_id: userId,
        content: newMessage.trim(),
      });
      if (error) throw error;

      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", selected.id);

      setNewMessage("");
      const { data } = await supabase
        .from("messages")
        .select("id, content, created_at, sender_id")
        .eq("conversation_id", selected.id)
        .order("created_at", { ascending: true });
      setMessages((data ?? []) as Message[]);
    } catch {
      toast({ title: "Failed to send message", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex justify-center items-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (selected) {
    return (
      <div className="p-6 space-y-4">
        <button
          onClick={() => { setSelected(null); fetchConversations(); }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 13,
            color: "#6b7280",
            padding: 0,
          }}
        >
          <i className="ti ti-arrow-left" style={{ fontSize: 16 }} />
          Back to messages
        </button>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{selected.subject}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {threadLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : messages.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No messages yet.</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {messages.map((msg) => {
                  const isMine = msg.sender_id === userId;
                  return (
                    <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                          isMine
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground"
                        }`}
                      >
                        <p>{msg.content}</p>
                        <p
                          className={`text-xs mt-1 ${
                            isMine ? "text-primary-foreground/70" : "text-muted-foreground"
                          }`}
                        >
                          {format(new Date(msg.created_at), "d MMM yyyy HH:mm")}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2 pt-2 border-t">
              <Textarea
                placeholder="Write a message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                rows={2}
                className="flex-1 resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
              />
              <Button
                onClick={handleSend}
                disabled={sending || !newMessage.trim()}
                className="self-end"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <i className="ti ti-send" style={{ fontSize: 16 }} />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {conversations.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <i
              className="ti ti-messages"
              style={{ fontSize: 40, color: "#9ca3af", display: "block", marginBottom: 12 }}
            />
            <p className="font-medium mb-1">No messages yet</p>
            <p className="text-sm text-muted-foreground">
              Conversations with your contractors will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {conversations.map((conv, i) => (
              <button
                key={conv.id}
                onClick={() => openThread(conv)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  padding: "14px 16px",
                  background: "none",
                  border: "none",
                  borderBottom:
                    i < conversations.length - 1 ? "1px solid #f3f4f6" : "none",
                  cursor: "pointer",
                  textAlign: "left",
                  gap: 12,
                }}
              >
                <p
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: "#111827",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    minWidth: 0,
                  }}
                >
                  {conv.subject}
                </p>
                {conv.last_message_at && (
                  <p style={{ fontSize: 12, color: "#9ca3af", whiteSpace: "nowrap", flexShrink: 0 }}>
                    {format(new Date(conv.last_message_at), "d MMM yyyy")}
                  </p>
                )}
              </button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────

function HomeownerSettings() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [tsCode, setTsCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? "");

      const { data } = await supabase
        .from("profiles")
        .select("full_name, phone, location, ts_profile_code")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data) {
        const p = data as {
          full_name: string | null;
          phone: string | null;
          location: string | null;
          ts_profile_code: string | null;
        };
        setFullName(p.full_name ?? "");
        setPhone(p.phone ?? "");
        setLocation(p.location ?? "");
        setTsCode(p.ts_profile_code ?? null);
      }
      setLoading(false);
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          location: location.trim() || null,
        } as any)
        .eq("user_id", user.id);

      if (error) throw error;
      toast({ title: "Settings saved" });
    } catch {
      toast({ title: "Failed to save settings", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex justify-center items-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {tsCode && (
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                Account code
              </Label>
              <p
                style={{ fontFamily: "'Roboto Mono', monospace", fontSize: 13 }}
                className="mt-1 px-3 py-2 bg-muted rounded"
              >
                {tsCode}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="hw-full-name">Full name</Label>
            <Input
              id="hw-full-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hw-email">Email</Label>
            <Input id="hw-email" value={email} disabled className="bg-muted" />
            <p className="text-xs text-muted-foreground">
              Email address cannot be changed here.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hw-phone">Phone</Label>
            <Input
              id="hw-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 07700 900000"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hw-location">Location / postcode</Label>
            <Input
              id="hw-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. SW1A 1AA"
            />
          </div>

          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save changes
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ── HomeownerDashboard ────────────────────────────────────────────────────────

export default function HomeownerDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeView = searchParams.get("view") ?? "dashboard";

  const [userId, setUserId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoadError(null);
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError) {
        setLoadError("Unable to validate your session.");
        setLoading(false);
        return;
      }
      if (!user) {
        navigate("/login");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, user_type")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileError) {
        setLoadError("Unable to load your profile.");
        setLoading(false);
        return;
      }

      if (profile?.user_type && profile.user_type !== "personal") {
        navigate(`/dashboard/${profile.user_type}`, { replace: true });
        return;
      }

      setUserId(user.id);
      // profiles.id === profiles.user_id per CHECK constraint
      setProfileId(profile?.id ?? user.id);
      setLoading(false);
    };

    load();
  }, [navigate]);

  const renderView = () => {
    if (!userId || !profileId) return null;

    switch (activeView) {
      case "jobs":
        return <div className="p-6"><ClientJobsView /></div>;

      case "quotes":
        return <div className="p-6"><ReceivedQuotes /></div>;

      case "enquiries":
        return (
          <div className="p-6">
            <EnquiryList profileId={profileId} myUserId={userId} />
          </div>
        );

      case "invoices":
        return <div className="p-6"><ReceivedInvoices /></div>;

      case "messages":
  return (
    <div className="p-6">
      <HomeownerMessageInbox />
    </div>
  );

      case "settings":
        return <HomeownerSettings />;

      default:
        return <HomeownerOverview profileId={profileId} userId={userId} />;
    }
  };

  if (loadError) {
    return (
      <HomeownerLayout>
        <ErrorState message={loadError} onRetry={() => window.location.reload()} />
      </HomeownerLayout>
    );
  }

  if (loading || !userId || !profileId) {
    return (
      <HomeownerLayout>
        <LoadingState message="Loading your dashboard..." />
      </HomeownerLayout>
    );
  }

  return (
    <HelpSystemProvider profileId={profileId} role="personal">
      <HomeownerLayout>{renderView()}</HomeownerLayout>
    </HelpSystemProvider>
  );
}
