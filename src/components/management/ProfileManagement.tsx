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

interface Profile {
  full_name: string;
  email: string;
  phone: string;
  company_name: string;
  trades: string[];
  location: string;
  working_radius: string;
  bio: string;
  logo_url: string;
}

const allTrades = [...CONTRACTOR_TRADES];

const radiusOptions = [
  "5 miles", "10 miles", "15 miles", "20 miles", "25 miles", "30 miles", "50 miles", "100 miles", "Nationwide"
];

export function ProfileManagement() {
  const [profile, setProfile] = useState<Profile>({
    full_name: "",
    email: "",
    phone: "",
    company_name: "",
    trades: [],
    location: "",
    working_radius: "",
    bio: "",
    logo_url: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isContractor, setIsContractor] = useState(false);
  const [tradeSearch, setTradeSearch] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const isProfileIncomplete = isContractor && (
    profile.trades.length === 0 || !profile.location || !profile.working_radius || !profile.logo_url
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
        const rawTrade = (data as any).trade;
        let trades: string[] = [];
        if (Array.isArray(rawTrades) && rawTrades.length > 0) {
          trades = rawTrades;
        } else if (rawTrade) {
          trades = [rawTrade];
        }

        setIsContractor(data.user_type === "contractor");
        setProfile({
          full_name: data.full_name || "",
          email: data.email || "",
          phone: data.phone || "",
          company_name: data.company_name || "",
          trades,
          location: (data as any).location || "",
          working_radius: (data as any).working_radius || "",
          bio: (data as any).bio || "",
          logo_url: (data as any).logo_url || "",
        });
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
        updateData.trade = profile.trades[0] || null;
        updateData.location = profile.location;
        updateData.working_radius = profile.working_radius;
        updateData.bio = profile.bio;
      }

      const { error } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("user_id", user.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Profile updated successfully",
      });
    } catch (error) {
      console.error("Error saving profile:", error);
      toast({
        title: "Error",
        description: "Failed to save profile",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleTrade = (trade: string) => {
    setProfile((prev) => {
      const exists = prev.trades.includes(trade);
      return {
        ...prev,
        trades: exists
          ? prev.trades.filter((t) => t !== trade)
          : [...prev.trades, trade],
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
              <Label htmlFor="working_radius">Working Radius *</Label>
              <Select value={profile.working_radius} onValueChange={(val) => setProfile({ ...profile, working_radius: val })}>
                <SelectTrigger id="working_radius" className={!profile.working_radius ? "border-primary/50" : ""}>
                  <SelectValue placeholder="Select working radius" />
                </SelectTrigger>
                <SelectContent>
                  {radiusOptions.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
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
    </div>
  );
}
