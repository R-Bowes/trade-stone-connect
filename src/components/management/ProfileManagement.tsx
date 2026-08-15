import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { LogoCropDialog } from "./LogoCropDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertCircle, X, Upload, Wrench } from "lucide-react";
import { CONTRACTOR_TRADES } from "@/constants/trades";
import { UK_VAT_REGISTRATION_THRESHOLD } from "@/constants/tax";
import { ChangePasswordCard } from "@/components/ui/ChangePasswordCard";
import { StripeConnect } from "@/components/management/StripeConnect";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

interface Profile {
  full_name: string;
  email: string;
  phone: string;
  company_name: string;
  trades: string[];
  location: string;
  postcode: string;
  service_area_radius_miles: number | null;
  service_area_center_lat: number | null;
  service_area_center_lng: number | null;
  bio: string;
  logo_url: string;
}

interface GeocodeResult {
  latitude: number;
  longitude: number;
  admin_district: string | null;
  outcode: string;
}

const allTrades = [...CONTRACTOR_TRADES];

// service_area_radius_miles is canonical (Step-0 audit: the old
// working_radius text label was collected but never used in search).
// 'Nationwide' is dropped from this picker -- coverage_type = 'national'
// is admin-set only, no self-serve path sets it.
const radiusOptions = [5, 10, 15, 20, 25, 30, 50, 100];

export function ProfileManagement() {
  const [profile, setProfile] = useState<Profile>({
    full_name: "",
    email: "",
    phone: "",
    company_name: "",
    trades: [],
    location: "",
    postcode: "",
    service_area_radius_miles: null,
    service_area_center_lat: null,
    service_area_center_lng: null,
    bio: "",
    logo_url: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isContractor, setIsContractor] = useState(false);
  // VAT status is canonical on finance_settings.vat_status, not
  // profiles.vat_registered (FINANCE-AUDIT.md Landmine L1 — profiles.
  // vat_registered/vat_number are deprecated, kept only to avoid a schema
  // break, no longer read or written here).
  const [vatRegistered, setVatRegistered] = useState(false);
  const [vatNumber, setVatNumber] = useState("");
  const [vatStatusLoaded, setVatStatusLoaded] = useState<string | null>(null);
  const [tradeSearch, setTradeSearch] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState("");
  const [resolvedTown, setResolvedTown] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const isProfileIncomplete = isContractor && (
    profile.trades.length === 0 || !profile.location || !profile.service_area_radius_miles || !profile.logo_url
  );

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error) throw error;

      if (data) {
        const rawTrades = (data as any).trades;
        let trades: string[] = [];
        if (Array.isArray(rawTrades) && rawTrades.length > 0) {
          trades = rawTrades;
        }

        const contractorProfile = data.user_type === "contractor";
        setIsContractor(contractorProfile);
        setProfile({
          full_name: data.full_name || "",
          email: data.email || "",
          phone: data.phone || "",
          company_name: data.company_name || "",
          trades,
          location: (data as any).location || "",
          postcode: (data as any).postcode || "",
          service_area_radius_miles: (data as any).service_area_radius_miles ?? null,
          service_area_center_lat: (data as any).service_area_center_lat ?? null,
          service_area_center_lng: (data as any).service_area_center_lng ?? null,
          bio: (data as any).bio || "",
          logo_url: (data as any).logo_url || "",
        });

        if (contractorProfile) {
          const { data: financeSettingsRow } = await supabase
            .from("finance_settings")
            .select("vat_status, vat_number")
            .eq("contractor_id", user.id)
            .maybeSingle();
          const status = financeSettingsRow?.vat_status ?? "not_registered";
          setVatStatusLoaded(status);
          setVatRegistered(status !== "not_registered");
          setVatNumber(financeSettingsRow?.vat_number ?? "");
        }
      }
    } catch (error) {
      console.error("Error loading profile:", error);
      toast({
        title: "Error",
        description: "Failed to load profile",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !userId) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: "Invalid file type", description: "Please upload a JPG, PNG, or WebP image.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Image must be under 5MB.", variant: "destructive" });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCropSrc(reader.result as string);
      setCropOpen(true);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCroppedUpload = async (blob: Blob) => {
    if (!userId) return;
    setUploading(true);
    try {
      const filePath = `${userId}/logo.png`;
      const { error: uploadError } = await supabase.storage
        .from("logos")
        .upload(filePath, blob, { upsert: true, contentType: "image/png" });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from("logos").getPublicUrl(filePath);
      const logoUrl = `${publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ logo_url: logoUrl })
        .eq("user_id", userId);
      if (updateError) throw updateError;

      setProfile((prev) => ({ ...prev, logo_url: logoUrl }));
      setCropOpen(false);
      toast({ title: "Logo uploaded", description: "Your company logo has been updated." });
    } catch (error) {
      console.error("Error uploading logo:", error);
      toast({ title: "Upload failed", description: "Failed to upload logo. Please try again.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  // Resolves the postcode to lat/lng via the geocode-postcode edge function
  // and shows the returned admin_district as a "recognised as" confirmation.
  // A failed geocode never blocks saving -- it just leaves
  // service_area_center_lat/_lng unchanged, same fallback posture as
  // Commit 4's ILIKE path covers for any contractor without coordinates.
  const handlePostcodeBlur = async () => {
    const postcode = profile.postcode.trim();
    if (!postcode) return;
    setGeocoding(true);
    setGeocodeError("");
    setResolvedTown(null);
    try {
      const result = await invokeEdgeFunction<GeocodeResult>("geocode-postcode", {
        body: { postcode },
      });
      setProfile((prev) => ({
        ...prev,
        service_area_center_lat: result.latitude,
        service_area_center_lng: result.longitude,
      }));
      setResolvedTown(result.admin_district ?? result.outcode);
    } catch (e: any) {
      setGeocodeError(e.message ?? "Couldn't resolve that postcode.");
    } finally {
      setGeocoding(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const updateData: any = {
        full_name: profile.full_name,
        email: profile.email,
        phone: profile.phone,
        company_name: profile.company_name,
      };

      if (isContractor) {
        updateData.trades = profile.trades;
        updateData.location = profile.location;
        updateData.postcode = profile.postcode || null;
        updateData.service_area_radius_miles = profile.service_area_radius_miles;
        updateData.service_area_center_lat = profile.service_area_center_lat;
        updateData.service_area_center_lng = profile.service_area_center_lng;
        // Kept in sync in parallel, same as ContractorOnboarding.tsx --
        // ContractorProfile.tsx's public display ("Works within X miles of
        // Y") still reads working_radius, so it must not go stale the
        // moment a contractor edits their radius through this screen.
        // Deprecated in place per the migration's comment, not orphaned.
        updateData.working_radius = profile.service_area_radius_miles
          ? `${profile.service_area_radius_miles} miles`
          : null;
        updateData.bio = profile.bio;
      }

      const { error } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("user_id", user.id);

      if (error) throw error;

      if (isContractor) {
        // 'flat_rate' is also a registered state — only step DOWN to
        // 'not_registered' when unchecked, never silently downgrade an
        // existing flat_rate contractor to 'standard' just because this
        // simple toggle doesn't offer a scheme picker (that lives in the
        // dedicated Finance Settings screen).
        const nextVatStatus = vatRegistered
          ? (vatStatusLoaded === "flat_rate" ? "flat_rate" : "standard")
          : "not_registered";
        const vatPayload = {
          vat_status: nextVatStatus,
          vat_number: vatRegistered ? vatNumber.trim() : null,
        };

        const { data: existingFinanceSettings } = await supabase
          .from("finance_settings")
          .select("id")
          .eq("contractor_id", user.id)
          .maybeSingle();

        const { error: fsError } = existingFinanceSettings
          ? await supabase.from("finance_settings").update(vatPayload).eq("contractor_id", user.id)
          : await supabase.from("finance_settings").insert({ contractor_id: user.id, ...vatPayload });

        if (fsError) throw fsError;
        setVatStatusLoaded(nextVatStatus);
      }

      toast({ title: "Success", description: "Profile updated successfully" });
    } catch (error) {
      console.error("Error saving profile:", error);
      toast({ title: "Error", description: "Failed to save profile", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleTrade = (trade: string) => {
    setProfile((prev) => {
      const exists = prev.trades.includes(trade);
      return {
        ...prev,
        trades: exists ? prev.trades.filter((t) => t !== trade) : [...prev.trades, trade],
      };
    });
  };

  const removeTrade = (trade: string) => {
    setProfile((prev) => ({
      ...prev,
      trades: prev.trades.filter((t) => t !== trade),
    }));
  };

  const filteredTrades = tradeSearch
    ? allTrades.filter((t) => t.toLowerCase().includes(tradeSearch.toLowerCase()))
    : allTrades;

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isProfileIncomplete && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-sm">Complete Your Profile</p>
              <p className="text-sm text-muted-foreground">
                Upload your logo, select at least one trade, set your location, and choose a working radius so customers can find you in the contractor directory.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isContractor && (
        <Card>
          <CardHeader>
            <CardTitle>Company Logo</CardTitle>
            <CardDescription>Upload your company logo — this appears on your public profile and directory listing *</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <Avatar className="h-24 w-24 border-2 border-dashed border-muted-foreground/30">
                <AvatarImage src={profile.logo_url} alt="Company logo" />
                <AvatarFallback className="bg-muted">
                  <Wrench className="h-10 w-10 text-muted-foreground" />
                </AvatarFallback>
              </Avatar>
              <div className="space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className={!profile.logo_url ? "border-primary/50" : ""}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {profile.logo_url ? "Change Logo" : "Upload Logo"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  JPG, PNG or WebP. Max 5MB. You'll crop before uploading.
                </p>
              </div>
            </div>
            <LogoCropDialog
              open={cropOpen}
              onOpenChange={setCropOpen}
              imageSrc={cropSrc || ""}
              onCropComplete={handleCroppedUpload}
              uploading={uploading}
            />
          </CardContent>
        </Card>
      )}

      {isContractor && (
        <Card>
          <CardHeader>
            <CardTitle>Trades & Service Area</CardTitle>
            <CardDescription>Select all trades you offer — these help customers find you in the directory</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Your Trades *</Label>
              {profile.trades.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {profile.trades.map((trade) => (
                    <Badge key={trade} variant="default" className="gap-1 pr-1">
                      {trade}
                      <button
                        type="button"
                        onClick={() => removeTrade(trade)}
                        className="ml-1 rounded-full p-0.5 hover:bg-primary-foreground/20"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <Input
                placeholder="Search trades..."
                value={tradeSearch}
                onChange={(e) => setTradeSearch(e.target.value)}
                className={profile.trades.length === 0 ? "border-primary/50" : ""}
              />
              <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-1">
                {filteredTrades.map((trade) => (
                  <label
                    key={trade}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm"
                  >
                    <Checkbox
                      checked={profile.trades.includes(trade)}
                      onCheckedChange={() => toggleTrade(trade)}
                    />
                    {trade}
                  </label>
                ))}
                {filteredTrades.length === 0 && (
                  <p className="text-sm text-muted-foreground px-2 py-1">No trades match your search</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Location *</Label>
              <Input
                id="location"
                placeholder="e.g. Manchester, London SE1"
                value={profile.location}
                onChange={(e) => setProfile({ ...profile, location: e.target.value })}
                className={!profile.location ? "border-primary/50" : ""}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="postcode">Postcode</Label>
              <Input
                id="postcode"
                placeholder="e.g. M1 1AE"
                value={profile.postcode}
                onChange={(e) => {
                  setProfile({ ...profile, postcode: e.target.value });
                  setResolvedTown(null);
                }}
                onBlur={() => void handlePostcodeBlur()}
              />
              {geocoding ? (
                <p className="text-xs text-muted-foreground">Looking that up…</p>
              ) : geocodeError ? (
                <p className="text-xs text-destructive">{geocodeError}</p>
              ) : resolvedTown ? (
                <p className="text-xs text-green-700">Recognised as {resolvedTown}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Lets clients searching nearby areas find you, not just exact location matches.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="working_radius">Working Radius *</Label>
              <Select
                value={profile.service_area_radius_miles != null ? String(profile.service_area_radius_miles) : ""}
                onValueChange={(val) => setProfile({ ...profile, service_area_radius_miles: parseInt(val, 10) })}
              >
                <SelectTrigger id="working_radius" className={!profile.service_area_radius_miles ? "border-primary/50" : ""}>
                  <SelectValue placeholder="Select working radius" />
                </SelectTrigger>
                <SelectContent>
                  {radiusOptions.map((r) => (
                    <SelectItem key={r} value={String(r)}>{r} miles</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Bio / About</Label>
              <Textarea
                id="bio"
                placeholder="Tell potential customers about your experience and services..."
                value={profile.bio}
                onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                rows={4}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {isContractor && (
        <Card>
          <CardHeader>
            <CardTitle>VAT Registration</CardTitle>
            <CardDescription>
              If your taxable turnover exceeds £{UK_VAT_REGISTRATION_THRESHOLD.toLocaleString("en-GB")} you must register for VAT. Once registered, your invoices will default to 20% VAT.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="vat_registered"
                checked={vatRegistered}
                onChange={(e) => {
                  setVatRegistered(e.target.checked);
                  if (!e.target.checked) setVatNumber("");
                }}
                className="h-4 w-4"
              />
              <Label htmlFor="vat_registered" className="cursor-pointer">I am VAT registered</Label>
            </div>
            {vatRegistered && (
              <div className="space-y-2">
                <Label htmlFor="vat_number">VAT Number</Label>
                <Input
                  id="vat_number"
                  placeholder="GB123456789"
                  value={vatNumber}
                  onChange={(e) => setVatNumber(e.target.value.toUpperCase())}
                  className="max-w-xs font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Format: GB followed by 9 digits (e.g. GB123456789). This will appear on all invoices.
                </p>
                <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                  Your invoices will automatically default to 20% VAT. You remain responsible for tracking your total turnover across all income sources.
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>Update your business profile details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full_name">Full Name</Label>
            <Input
              id="full_name"
              value={profile.full_name}
              onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={profile.email}
              onChange={(e) => setProfile({ ...profile, email: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              value={profile.phone}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="company_name">Company Name</Label>
            <Input
              id="company_name"
              value={profile.company_name}
              onChange={(e) => setProfile({ ...profile, company_name: e.target.value })}
            />
          </div>

          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment Account</CardTitle>
          <CardDescription>Manage your Stripe account to receive invoice payments from clients.</CardDescription>
        </CardHeader>
        <CardContent>
          <StripeConnect />
        </CardContent>
      </Card>

      <ChangePasswordCard />
    </div>
  );
}