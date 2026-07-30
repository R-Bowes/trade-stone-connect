import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

function StatusBadge({ status }: { status: string }) {
  const variant = status === "verified" ? "default" : status === "expired" || status === "revoked" ? "destructive" : "secondary";
  return <Badge variant={variant} className="capitalize">{status.replace(/_/g, " ")}</Badge>;
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const documentPaths = credentials.map((c) => c.document_path).filter((p): p is string => !!p);
  const { urls: signedDocUrls } = useSignedPhotoUrls(BUCKET, documentPaths);

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
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleUpload = async () => {
    if (!profileId || !credName.trim()) return;
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
          verified: false,
          display_order: credentials.length,
          document_path: documentPath,
        });
      if (insertError) throw insertError;

      toast({ title: "Credential submitted", description: "It will show as pending until TradeStone verifies it against the awarding body." });
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
  const insuranceDays = daysUntil(verification?.insurance_expires_at ?? null);

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

      {/* Insurance */}
      <Card>
        <CardHeader>
          <CardTitle>Public liability insurance</CardTitle>
          <CardDescription>Cross-checked against your insurer — self-declared dates alone don't verify this.</CardDescription>
        </CardHeader>
        <CardContent>
          {!verification?.insurance_expires_at ? (
            <p className="text-sm text-muted-foreground">No insurance on file yet.</p>
          ) : (
            <div className="flex items-center gap-3">
              <StatusBadge status={verification.insurance_verified ? "verified" : "pending"} />
              <span className="text-sm">
                Expires {new Date(verification.insurance_expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                {insuranceDays !== null && (
                  <span className={insuranceDays < 14 ? "text-destructive font-medium" : "text-muted-foreground"}>
                    {" "}({insuranceDays >= 0 ? `${insuranceDays} days remaining` : "expired"})
                  </span>
                )}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Register checks */}
      <Card>
        <CardHeader>
          <CardTitle>Trade register checks</CardTitle>
          <CardDescription>Gas Safe, NICEIC, NAPIT, F-Gas — checked against the live register, not a photo of a card.</CardDescription>
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
              <CardDescription>NVQ, City & Guilds, manufacturer accreditations — confirmed against the awarding body.</CardDescription>
            </div>
            <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Add credential
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {credentials.length === 0 ? (
            <p className="text-sm text-muted-foreground">No credentials submitted yet.</p>
          ) : (
            <div className="space-y-3">
              {credentials.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 border rounded-lg gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{c.name}</p>
                    {c.issuer && <p className="text-sm text-muted-foreground truncate">{c.issuer}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <StatusBadge status={c.verified ? "verified" : "pending"} />
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
            <DialogTitle>Add credential</DialogTitle>
            <DialogDescription>Submit a qualification or accreditation for TradeStone to verify against the awarding body.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
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
              <Label htmlFor="cred-name">Credential name *</Label>
              <Input id="cred-name" value={credName} onChange={(e) => setCredName(e.target.value)} placeholder="e.g. NVQ Level 3 Plumbing" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cred-issuer">Awarding body</Label>
              <Input id="cred-issuer" value={credIssuer} onChange={(e) => setCredIssuer(e.target.value)} placeholder="e.g. City & Guilds" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={uploading}>Cancel</Button>
            <Button onClick={handleUpload} disabled={uploading || !credName.trim()}>
              {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit for verification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
