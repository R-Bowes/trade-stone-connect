import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertCircle } from "lucide-react";

interface Profile {
  full_name: string;
  email: string;
  phone: string;
  company_name: string;
  trade: string;
  location: string;
  working_radius: string;
  bio: string;
}

const trades = [
  "Agricultural Technician", "Air-craft Engineer", "Automation Technician", "Auto Mechanic",
  "Boilermaker", "Bricklayer / Mason", "Carpentry", "Carpenter", "Carpet Installer",
  "Concrete Finisher", "Construction Inspector", "Construction Manager", "Consultant",
  "Crane Operator", "Drywall Installer / Finisher", "Electrician", "Energy Efficiency Consultant",
  "Elevator Mechanic", "Farmer", "Flooring Installer", "Gardener", "General Building",
  "Glazier", "Heavy Equipment Operator", "HVAC Technician", "Insulation Worker", "Ironworker",
  "Landscaper", "Machinist", "Mechanical Installer", "Painter and Decorator", "Plasterer",
  "Plumber", "Rigger", "Roofer", "Scaffolder", "Security System Installer", "Sheet Metal Worker",
  "Smart Home Technician", "Solar Panel Installer", "Tiler", "Tree Surgeon / Arborist",
  "Welder", "Wind Turbine Technician"
];

const radiusOptions = [
  "5 miles", "10 miles", "15 miles", "20 miles", "25 miles", "30 miles", "50 miles", "100 miles", "Nationwide"
];

export function ProfileManagement() {
  const [profile, setProfile] = useState<Profile>({
    full_name: "",
    email: "",
    phone: "",
    company_name: "",
    trade: "",
    location: "",
    working_radius: "",
    bio: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isContractor, setIsContractor] = useState(false);
  const { toast } = useToast();

  const isProfileIncomplete = isContractor && (!profile.trade || !profile.location);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error) throw error;

      if (data) {
        setIsContractor(data.user_type === "contractor");
        setProfile({
          full_name: data.full_name || "",
          email: data.email || "",
          phone: data.phone || "",
          company_name: data.company_name || "",
          trade: (data as any).trade || "",
          location: (data as any).location || "",
          working_radius: (data as any).working_radius || "",
          bio: (data as any).bio || "",
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
        updateData.trade = profile.trade;
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
                Set your trade and location below so customers can find you in the contractor directory.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isContractor && (
        <Card>
          <CardHeader>
            <CardTitle>Trade & Service Area</CardTitle>
            <CardDescription>These details help customers find you in the directory</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="trade">Primary Trade *</Label>
              <Select value={profile.trade} onValueChange={(val) => setProfile({ ...profile, trade: val })}>
                <SelectTrigger id="trade" className={!profile.trade ? "border-primary/50" : ""}>
                  <SelectValue placeholder="Select your trade" />
                </SelectTrigger>
                <SelectContent>
                  {trades.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Label htmlFor="working_radius">Working Radius</Label>
              <Select value={profile.working_radius} onValueChange={(val) => setProfile({ ...profile, working_radius: val })}>
                <SelectTrigger id="working_radius">
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
