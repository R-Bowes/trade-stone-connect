import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Building2, Loader2, ArrowLeft, Save } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { LoadingState, ErrorState } from "@/components/AsyncState";

interface BusinessProfile {
  full_name: string;
  email: string;
  phone: string | null;
}

interface Company {
  id: string;
  name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postcode: string | null;
}

const BusinessSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const [profile, setProfile] = useState<BusinessProfile>({
    full_name: "",
    email: "",
    phone: "",
  });

  const [company, setCompany] = useState<Company>({
    id: "",
    name: "",
    address_line1: "",
    address_line2: "",
    city: "",
    postcode: "",
  });

  const [notifications, setNotifications] = useState({
    newQuotes: true,
    invoiceUpdates: true,
    jobStatusChanges: true,
    panelInvites: true,
  });

  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      setLoadError(null);

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        navigate("/auth");
        return;
      }

      const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select("id, user_type, full_name, email, phone")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileError || !profileRow) {
        setLoadError("Unable to load your profile.");
        setLoading(false);
        return;
      }

      if (profileRow.user_type !== "business") {
        navigate(`/dashboard/${profileRow.user_type}`);
        return;
      }

      setProfileId(profileRow.id);
      setProfile({
        full_name: profileRow.full_name ?? "",
        email: profileRow.email ?? user.email ?? "",
        phone: profileRow.phone ?? "",
      });

      const { data: companyRow } = await supabase
        .from("companies")
        .select("id, name, address_line1, address_line2, city, postcode")
        .eq("owner_id", profileRow.id)
        .maybeSingle();

      if (companyRow) {
        setCompanyId(companyRow.id);
        setCompany({
          id: companyRow.id,
          name: companyRow.name ?? "",
          address_line1: companyRow.address_line1 ?? "",
          address_line2: companyRow.address_line2 ?? "",
          city: companyRow.city ?? "",
          postcode: companyRow.postcode ?? "",
        });
      }

      setLoading(false);
    };

    load();
  }, [navigate]);

  const handleSave = async () => {
    if (!profileId) return;
    setSaving(true);

    try {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: profile.full_name,
          phone: profile.phone || null,
        })
        .eq("id", profileId);

      if (profileError) throw profileError;

      if (companyId) {
        const { error: companyError } = await supabase
          .from("companies")
          .update({
            name: company.name,
            address_line1: company.address_line1 || null,
            address_line2: company.address_line2 || null,
            city: company.city || null,
            postcode: company.postcode || null,
          })
          .eq("id", companyId);

        if (companyError) throw companyError;
      } else if (company.name) {
        const { data: newCompany, error: insertError } = await supabase
          .from("companies")
          .insert({
            owner_id: profileId,
            name: company.name,
            address_line1: company.address_line1 || null,
            address_line2: company.address_line2 || null,
            city: company.city || null,
            postcode: company.postcode || null,
          })
          .select("id")
          .single();

        if (insertError) throw insertError;
        setCompanyId(newCompany.id);
      }

      toast({ title: "Settings saved", description: "Your business profile has been updated." });
    } catch (err) {
      console.error("Save error:", err);
      toast({ title: "Save failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <LoadingState message="Loading settings..." />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <ErrorState message={loadError} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="mb-8">
          <Link
            to="/dashboard/business"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
          <div className="flex items-center gap-2 mt-2">
            <Building2 className="h-7 w-7 text-primary" />
            <h1 className="font-heading text-2xl font-bold">Business Settings</h1>
          </div>
          <p className="text-muted-foreground mt-1">Manage your company profile and preferences.</p>
        </div>

        <div className="space-y-6">
          {/* Contact details */}
          <Card>
            <CardHeader>
              <CardTitle>Contact Details</CardTitle>
              <CardDescription>Your name and contact information</CardDescription>
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
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={profile.email}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">Email cannot be changed here. Contact support if needed.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={profile.phone ?? ""}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  placeholder="+44 7700 000000"
                />
              </div>
            </CardContent>
          </Card>

          {/* Company details */}
          <Card>
            <CardHeader>
              <CardTitle>Company Details</CardTitle>
              <CardDescription>Your registered business information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="company_name">Company Name</Label>
                <Input
                  id="company_name"
                  value={company.name}
                  onChange={(e) => setCompany({ ...company, name: e.target.value })}
                  placeholder="Acme Property Management Ltd"
                />
              </div>
              <Separator />
              <p className="text-sm font-medium">Registered Address</p>
              <div className="space-y-2">
                <Label htmlFor="address_line1">Address Line 1</Label>
                <Input
                  id="address_line1"
                  value={company.address_line1 ?? ""}
                  onChange={(e) => setCompany({ ...company, address_line1: e.target.value })}
                  placeholder="123 Business Street"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address_line2">Address Line 2 (optional)</Label>
                <Input
                  id="address_line2"
                  value={company.address_line2 ?? ""}
                  onChange={(e) => setCompany({ ...company, address_line2: e.target.value })}
                  placeholder="Suite 4"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={company.city ?? ""}
                    onChange={(e) => setCompany({ ...company, city: e.target.value })}
                    placeholder="London"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postcode">Postcode</Label>
                  <Input
                    id="postcode"
                    value={company.postcode ?? ""}
                    onChange={(e) => setCompany({ ...company, postcode: e.target.value })}
                    placeholder="EC1A 1BB"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notification preferences */}
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Choose what you'd like to be notified about</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {[
                { key: "newQuotes", label: "New quotes received", description: "When a contractor sends you a quote" },
                { key: "invoiceUpdates", label: "Invoice updates", description: "Payment confirmations and new invoices" },
                { key: "jobStatusChanges", label: "Job status changes", description: "When a job moves to a new stage" },
                { key: "panelInvites", label: "Panel activity", description: "Contractor panel requests and updates" },
              ].map(({ key, label, description }) => (
                <div key={key} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{description}</p>
                  </div>
                  <Switch
                    checked={notifications[key as keyof typeof notifications]}
                    onCheckedChange={(checked) =>
                      setNotifications({ ...notifications, [key]: checked })
                    }
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} className="min-w-32">
              {saving ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>
              ) : (
                <><Save className="mr-2 h-4 w-4" />Save Changes</>
              )}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default BusinessSettings;
