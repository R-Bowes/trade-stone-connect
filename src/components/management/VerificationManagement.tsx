import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSignedPhotoUrls } from "@/hooks/useSignedPhotoUrls";
import { Loader2, Upload, ShieldCheck, ShieldAlert, CircleCheck, Circle, Trash2, ExternalLink, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";

const BUCKET = "contractor-compliance-documents";

interface VerificationRow {
  current_tier: number;
  insurance_expires_at: string | null;
  insurance_verified: boolean;
  dbs_expires_at: string | null;
  dbs_verified: boolean;
  companies_house_status: string | null;
  suspended: boolean;
  suspended_reason: string | null;
}

interface RegisterCheck {
  id: string;
  register_name: string;
  registration_number: string | null;
  status: string;
  expires_at: string | null;
}

interface CredentialRow {
  id: string;
  name: string;
  issuer: string | null;
  credential_type: string | null;
  verified: boolean | null;
  verified_at: string | null;
  expires_at: string | null;
  document_path: string | null;
}

interface ComplianceGate {
  passes_gate: boolean;
  blocking_reasons: string[];
}

const TIER_INFO = [
  { tier: 1, label: "Claimed", unlocks: "Build a public profile" },
  { tier: 2, label: "Identity Confirmed", unlocks: "Take low-value homeowner jobs" },
  { tier: 3, label: "Compliance Verified", unlocks: "Mid-to-high value homeowner work" },
  { tier: 4, label: "Credential Verified", unlocks: "B2B and FM panel eligibility" },
];

const REGISTER_LABELS: Record<string, string> = {
  gas_safe: "Gas Safe",
  niceic: "NICEIC",
  napit: "NAPIT",
  fgas: "F-Gas",
};

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

function StatusBadge({ status, label }: { status: string; label?: string }) {
  const variant = status === "verified" ? "default" : status === "expired" || status === "revoked" ? "destructive" : "secondary";
  return <Badge variant={variant} className={label ? undefined : "capitalize"}>{label ?? status.replace(/_/g, " ")}</Badge>;
}

export function VerificationManagement() {
  const [loading, setLoading] = useState(true);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [verification, setVerification] = useState<VerificationRow | null>(null);
  const [registerChecks, setRegisterChecks] = useState<RegisterCheck[]>([]);
  const [credentials, setCredentials] = useState<CredentialRow[]>([]);
  const [gate, setGate] = useState<ComplianceGate | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [credName, setCredName] = useState("");
  const [credIssuer, setCredIssuer] = useState("");
  const [credType, setCredType] = useState<string>("");
  const [expiryDate, setExpiryDate] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const documentPaths = credentials.map((c) => c.document_path).filter((p): p is string => !!p);
  const { urls: signedDocUrls } = useSignedPhotoUrls(BUCKET, documentPaths);

  // "Current" = latest expires_at, matching the customer-facing RLS policy's
  // own definition exactly — not upload order. At most two insurance rows
  // ever exist (trigger-enforced), so this is cheap and needs no memoing.
  const insuranceCreds = credentials
    .filter((c) => c.credential_type === "insurance")
    .sort((a, b) => (b.expires_at ?? "").localeCompare(a.expires_at ?? ""));
  const currentInsurance = insuranceCreds[0] ?? null;
  const previousInsurance = insuranceCreds[1] ?? null;
  const otherCredentials = credentials.filter((c) => c.credential_type !== "insurance");

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!profile) { setLoading(false); return; }
    setProfileId(profile.id);

    const [verificationRes, registerRes, credentialsRes, gateRes] = await Promise.all([
      supabase.from("contractor_verification").select("*").eq("contractor_id", profile.id).maybeSingle(),
      supabase.from("contractor_register_checks").select("*").eq("contractor_id", profile.id).order("checked_at", { ascending: false }),
      supabase.from("contractor_credentials").select("*").eq("contractor_id", profile.id).order("created_at", { ascending: false }),
      supabase.rpc("check_contractor_compliance", { p_contractor_id: profile.id }),
    ]);

    setVerification((verificationRes.data as VerificationRow | null) ?? null);
    setRegisterChecks((registerRes.data as RegisterCheck[]) ?? []);
    setCredentials((credentialsRes.data as CredentialRow[]) ?? []);
    setGate((gateRes.data as unknown as ComplianceGate | null) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Documents must be under 10MB.", variant: "destructive" });
      return;
    }
    setSelectedFile(file);
    if (!credName) setCredName(file.name.replace(/\.[^/.]+$/, ""));
  };

  const resetForm = () => {
    setCredName("");
    setCredIssuer("");
    setCredType("");
    setExpiryDate("");
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const isInsurance = credType === "insurance";

  const handleUpload = async () => {
    if (!profileId || !credName.trim()) return;
    if (isInsurance && !expiryDate) return;
    setUploading(true);
    try {
      let documentPath: string | null = null;
      if (selectedFile) {
        const fileId = crypto.randomUUID();
        const ext = selectedFile.name.split(".").pop() ?? "pdf";
        documentPath = `${profileId}/${fileId}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(documentPath, selectedFile, { contentType: selectedFile.type || "application/octet-stream" });
        if (uploadError) throw uploadError;
      }

      const { error: insertError } = await supabase
        .from("contractor_credentials")
        .insert({
          contractor_id: profileId,
          name: credName.trim(),
          issuer: credIssuer.trim() || null,
          credential_type: credType || null,
          expires_at: isInsurance ? expiryDate : null,
          verified: false,
          display_order: credentials.length,
          document_path: documentPath,
        });
      if (insertError) throw insertError;

      toast(
        isInsurance
          ? { title: "Insurance shared", description: "Customers on your current and recent jobs can now view this." }
          : { title: "Credential added", description: "It's now listed on your public profile as stated by you. A TradeStone admin may separately mark it Verified here." },
      );
      setDialogOpen(false);
      resetForm();
      load();
    } catch (error) {
      console.error("Error uploading credential:", error);
      toast({ title: "Upload failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("contractor_credentials").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", variant: "destructive" });
      return;
    }
    setCredentials((prev) => prev.filter((c) => c.id !== id));
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const currentTier = verification?.current_tier ?? 1;
  // Self-declared insurance (contractor_credentials, credential_type =
  // 'insurance') is the live source for this card now — contractor_verification's
  // insurance_expires_at/insurance_verified have no write path anywhere in the
  // product today (system-verified fields only; left untouched, not read here).
  const insuranceDays = daysUntil(currentInsurance?.expires_at ?? null);

  return (
    <div className="space-y-6">
      {/* Tier progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {gate?.passes_gate ? <ShieldCheck className="h-5 w-5 text-green-600" /> : <ShieldAlert className="h-5 w-5 text-amber-500" />}
            Verification — Tier {currentTier} of 4
          </CardTitle>
          <CardDescription>
            Verification tiers are pass/fail gates, not scores. They determine what work you can access on TradeStone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={(currentTier / 4) * 100} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TIER_INFO.map((t) => (
              <div key={t.tier} className={`flex items-start gap-2 p-3 rounded-lg border ${t.tier <= currentTier ? "bg-muted/50" : ""}`}>
                {t.tier <= currentTier ? (
                  <CircleCheck className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                )}
                <div>
                  <p className="text-sm font-medium">Tier {t.tier} — {t.label}</p>
                  <p className="text-xs text-muted-foreground">Unlocks: {t.unlocks}</p>
                </div>
              </div>
            ))}
          </div>

          {!gate?.passes_gate && gate?.blocking_reasons && gate.blocking_reasons.length > 0 && (
            <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-400 mb-1">To unlock the next tier:</p>
              <ul className="text-sm text-amber-700 dark:text-amber-500 list-disc pl-4 space-y-0.5">
                {gate.blocking_reasons.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            </div>
          )}

          {verification?.suspended && (
            <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/5">
              <p className="text-sm font-medium text-destructive">Account suspended</p>
              {verification.suspended_reason && <p className="text-sm text-muted-foreground">{verification.suspended_reason}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Insurance — self-declared, shared with customers. Never a "verified"
          claim: no badge, matching CustomerJobDocuments.tsx's own precedent
          of omitting a verified/pending badge where there's no honest review
          step behind it. */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Public liability insurance</CardTitle>
            <CardDescription>Shared with customers on your current and recent jobs — not reviewed by TradeStone.</CardDescription>
          </div>
          <Button size="sm" onClick={() => { resetForm(); setCredType("insurance"); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            {currentInsurance ? "Renew" : "Add"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {!currentInsurance ? (
            <p className="text-sm text-muted-foreground">No insurance on file yet.</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <span className="text-sm">
                  Expires {currentInsurance.expires_at && new Date(currentInsurance.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                  {insuranceDays !== null && (
                    <span className={insuranceDays < 14 ? "text-destructive font-medium" : "text-muted-foreground"}>
                      {" "}({insuranceDays >= 0 ? `${insuranceDays} days remaining` : "expired"})
                    </span>
                  )}
                </span>
                {currentInsurance.document_path && signedDocUrls[currentInsurance.document_path] && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={signedDocUrls[currentInsurance.document_path]} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Provided by you — not checked by TradeStone.</p>
            </>
          )}
          {previousInsurance && (
            <p className="text-xs text-muted-foreground">
              Previous certificate{previousInsurance.expires_at && ` (expired ${new Date(previousInsurance.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })})`} kept on file for dispute reference — not shown to customers.
              {previousInsurance.document_path && signedDocUrls[previousInsurance.document_path] && (
                <>
                  {" "}
                  <a
                    href={signedDocUrls[previousInsurance.document_path]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    View
                  </a>
                </>
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Register checks */}
      <Card>
        <CardHeader>
          <CardTitle>Trade register checks</CardTitle>
          <CardDescription>Gas Safe, NICEIC, NAPIT, F-Gas — shown here once verified.</CardDescription>
        </CardHeader>
        <CardContent>
          {registerChecks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No register checks on file yet.</p>
          ) : (
            <div className="space-y-3">
              {registerChecks.map((rc) => (
                <div key={rc.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{REGISTER_LABELS[rc.register_name] ?? rc.register_name}</p>
                    {rc.registration_number && <p className="text-xs text-muted-foreground font-mono">{rc.registration_number}</p>}
                  </div>
                  <StatusBadge status={rc.status} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Credentials */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Credentials</CardTitle>
              <CardDescription>
                NVQ, City &amp; Guilds, manufacturer accreditations. Listed on your public profile as stated by you as
                soon as you add them — TradeStone does not check them. A TradeStone admin may separately review one and
                mark it Verified here; that review does not affect whether it's shown publicly.
              </CardDescription>
            </div>
            <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Add credential
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {otherCredentials.length === 0 ? (
            <p className="text-sm text-muted-foreground">No credentials submitted yet.</p>
          ) : (
            <div className="space-y-3">
              {otherCredentials.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 border rounded-lg gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{c.name}</p>
                    {c.issuer && <p className="text-sm text-muted-foreground truncate">{c.issuer}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <StatusBadge status={c.verified ? "verified" : "pending"} label={c.verified ? undefined : "Awaiting review"} />
                    {c.document_path && signedDocUrls[c.document_path] && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={signedDocUrls[c.document_path]} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => handleDelete(c.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isInsurance ? "Public liability insurance" : "Add credential"}</DialogTitle>
            <DialogDescription>
              {isInsurance
                ? "Upload your current certificate and its expiry date."
                : "Submit a qualification or accreditation for a TradeStone admin to review."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cred-type">What is this?</Label>
              <Select value={credType || "other"} onValueChange={(v) => setCredType(v === "other" ? "" : v)}>
                <SelectTrigger id="cred-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="other">Qualification or accreditation</SelectItem>
                  <SelectItem value="insurance">Public liability insurance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isInsurance && (
              <div className="space-y-2">
                <Label htmlFor="cred-expiry">Expiry date *</Label>
                <Input id="cred-expiry" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
              </div>
            )}
            <div className="space-y-2 relative">
              <Label>Proof document</Label>
              {/* iOS Safari drops file inputs hidden via display:none — keep it
                  in-flow with a near-zero, transparent, non-interactive box
                  instead (see JobPhotosTab.tsx). */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="absolute w-px h-px overflow-hidden opacity-0 pointer-events-none"
                onChange={handleFileSelect}
              />
              <Button variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />
                {selectedFile ? selectedFile.name : "Choose file (optional)"}
              </Button>
              <p className="text-xs text-muted-foreground">Max 10MB</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cred-name">{isInsurance ? "Policy name *" : "Credential name *"}</Label>
              <Input
                id="cred-name"
                value={credName}
                onChange={(e) => setCredName(e.target.value)}
                placeholder={isInsurance ? "e.g. Public liability insurance" : "e.g. NVQ Level 3 Plumbing"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cred-issuer">{isInsurance ? "Insurer" : "Awarding body"}</Label>
              <Input
                id="cred-issuer"
                value={credIssuer}
                onChange={(e) => setCredIssuer(e.target.value)}
                placeholder={isInsurance ? "e.g. Aviva" : "e.g. City & Guilds"}
              />
            </div>
            {isInsurance && (
              <p className="text-xs text-muted-foreground">
                This will be visible to every customer of every job you take, including the expiry date.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={uploading}>Cancel</Button>
            <Button onClick={handleUpload} disabled={uploading || !credName.trim() || (isInsurance && !expiryDate)}>
              {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isInsurance ? "Share with my customers" : "Submit for verification"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
