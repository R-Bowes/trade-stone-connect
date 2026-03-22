import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const TRADES = [
  "Plumbing", "Electrical", "Gas & Heating", "Roofing", "Carpentry",
  "Plastering", "Painting & Decorating", "Tiling", "Flooring", "Glazing",
  "Bricklaying", "Landscaping", "Damp Proofing", "Insulation", "General Building"
];

const RADII = ["5 miles", "10 miles", "15 miles", "25 miles", "50 miles", "Nationwide"];

const ContractorOnboarding = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    account_type: "",
    full_name: "",
    company_name: "",
    phone: "",
    website: "",
    address: "",
    location: "",
    working_radius: "25 miles",
    trades: [] as string[],
    hourly_rate: "",
    years_experience: "",
    bio: "",
    is_available: true,
  });

  const update = (field: string, value: any) =>
    setForm((f) => ({ ...f, [field]: value }));

  const toggleTrade = (trade: string) =>
    setForm((f) => ({
      ...f,
      trades: f.trades.includes(trade)
        ? f.trades.filter((t) => t !== trade)
        : [...f.trades, trade],
    }));

  const canProceed = () => {
    if (step === 1) return form.account_type !== "";
    if (step === 2) return form.full_name.trim() !== "" && form.phone.trim() !== "";
    if (step === 3) return form.trades.length > 0 && form.location.trim() !== "";
    if (step === 4) return form.bio.trim().length >= 20;
    return true;
  };

  const save = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: form.full_name,
          company_name: form.company_name,
          phone: form.phone,
          website: form.website,
          address: form.address,
          location: form.location,
          working_radius: form.working_radius,
          trades: form.trades,
          trade: form.trades[0] || "",
          hourly_rate: form.hourly_rate ? parseFloat(form.hourly_rate) : null,
          years_experience: form.years_experience ? parseInt(form.years_experience) : null,
          bio: form.bio,
          is_available: form.is_available,
          onboarding_completed: true,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      if (error) throw error;

      toast({ title: "Profile created!", description: "Welcome to TradeStone." });
      navigate("/dashboard/contractor");
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F4EF] flex items-center justify-center p-6">
      <div className="w-full max-w-lg">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-2xl font-bold text-[#1C2B3A]" style={{ fontFamily: "Georgia, serif" }}>
            Trade<span className="text-[#E8640A]">Stone</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Contractor setup — step {step} of 4</p>
        </div>

        {/* Progress */}
        <div className="h-1.5 bg-[#E5E0D8] rounded-full mb-8 overflow-hidden">
          <div
            className="h-full bg-[#E8640A] rounded-full transition-all duration-300"
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-[#E5E0D8] p-8 mb-4">

          {/* Step 1 — Account type */}
          {step === 1 && (
            <div>
              <h2 className="text-xl font-bold text-[#1C2B3A] mb-2">How do you work?</h2>
              <p className="text-sm text-muted-foreground mb-6">This helps us set up your account correctly.</p>
              {[
                { value: "sole_trader", label: "Sole trader", desc: "I work on my own or with occasional help" },
                { value: "company", label: "Limited company", desc: "I run a registered business with a team" },
              ].map((opt) => (
                <div
                  key={opt.value}
                  onClick={() => update("account_type", opt.value)}
                  className={`border-2 rounded-xl p-4 mb-3 cursor-pointer transition-all ${
                    form.account_type === opt.value
                      ? "border-[#E8640A] bg-orange-50"
                      : "border-[#E5E0D8] hover:border-gray-300"
                  }`}
                >
                  <div className="font-bold text-sm text-[#1C2B3A]">{opt.label}</div>
                  <div className="text-xs text-muted-foreground mt-1">{opt.desc}</div>
                </div>
              ))}
            </div>
          )}

          {/* Step 2 — Details */}
          {step === 2 && (
            <div>
              <h2 className="text-xl font-bold text-[#1C2B3A] mb-2">Your details</h2>
              <p className="text-sm text-muted-foreground mb-6">This appears on your profile and quotes.</p>
              <div className="space-y-4">
                {[
                  { label: "Your full name", field: "full_name", placeholder: "Jamie Harrison", required: true },
                  { label: "Business name", field: "company_name", placeholder: "Harrison Plumbing Ltd" },
                  { label: "Phone number", field: "phone", placeholder: "07700 900000", required: true },
                  { label: "Website", field: "website", placeholder: "www.harrisonplumbing.co.uk" },
                  { label: "Business address", field: "address", placeholder: "14 Maple Street, Manchester" },
                ].map((f) => (
                  <div key={f.field}>
                    <Label className="text-xs font-bold tracking-wide text-[#1C2B3A] uppercase">
                      {f.label}{f.required && <span className="text-[#E8640A] ml-0.5">*</span>}
                    </Label>
                    <Input
                      className="mt-1.5"
                      value={(form as any)[f.field]}
                      onChange={(e) => update(f.field, e.target.value)}
                      placeholder={f.placeholder}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 3 — Trades & location */}
          {step === 3 && (
            <div>
              <h2 className="text-xl font-bold text-[#1C2B3A] mb-2">Your trades & area</h2>
              <p className="text-sm text-muted-foreground mb-5">Select everything you offer — homeowners search by trade.</p>

              <Label className="text-xs font-bold tracking-wide text-[#1C2B3A] uppercase mb-3 block">
                Trades <span className="text-[#E8640A]">*</span>
              </Label>
              <div className="flex flex-wrap gap-2 mb-5">
                {TRADES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTrade(t)}
                    className={`px-3 py-1.5 rounded-full text-sm font-semibold border-2 transition-all ${
                      form.trades.includes(t)
                        ? "border-[#E8640A] bg-orange-50 text-[#E8640A]"
                        : "border-[#E5E0D8] text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="mb-4">
                <Label className="text-xs font-bold tracking-wide text-[#1C2B3A] uppercase mb-1.5 block">
                  Base location <span className="text-[#E8640A]">*</span>
                </Label>
                <Input
                  value={form.location}
                  onChange={(e) => update("location", e.target.value)}
                  placeholder="Manchester"
                />
              </div>

              <div className="mb-4">
                <Label className="text-xs font-bold tracking-wide text-[#1C2B3A] uppercase mb-2 block">
                  How far will you travel?
                </Label>
                <div className="flex flex-wrap gap-2">
                  {RADII.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => update("working_radius", r)}
                      className={`px-3 py-1.5 rounded-full text-sm font-semibold border-2 transition-all ${
                        form.working_radius === r
                          ? "border-[#1C2B3A] bg-[#1C2B3A] text-white"
                          : "border-[#E5E0D8] text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-bold tracking-wide text-[#1C2B3A] uppercase mb-1.5 block">Hourly rate (£)</Label>
                  <Input value={form.hourly_rate} onChange={(e) => update("hourly_rate", e.target.value)} placeholder="65" type="number" />
                </div>
                <div>
                  <Label className="text-xs font-bold tracking-wide text-[#1C2B3A] uppercase mb-1.5 block">Years experience</Label>
                  <Input value={form.years_experience} onChange={(e) => update("years_experience", e.target.value)} placeholder="8" type="number" />
                </div>
              </div>
            </div>
          )}

          {/* Step 4 — Bio */}
          {step === 4 && (
            <div>
              <h2 className="text-xl font-bold text-[#1C2B3A] mb-2">Tell homeowners about yourself</h2>
              <p className="text-sm text-muted-foreground mb-6">A good bio gets more enquiries. Be specific about what you do best.</p>

              <div className="mb-5">
                <Label className="text-xs font-bold tracking-wide text-[#1C2B3A] uppercase mb-1.5 block">
                  Your bio <span className="text-[#E8640A]">*</span>
                </Label>
                <textarea
                  value={form.bio}
                  onChange={(e) => update("bio", e.target.value)}
                  rows={5}
                  placeholder="e.g. Gas Safe registered plumber with 10 years experience in Manchester. I specialise in boiler installations, bathroom fit-outs and emergency callouts. All work is fully insured and guaranteed."
                  className="w-full px-3 py-2 border border-input rounded-md text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className={`text-xs mt-1 text-right ${form.bio.length >= 20 ? "text-green-600" : "text-muted-foreground"}`}>
                  {form.bio.length} characters{form.bio.length < 20 && " — minimum 20"}
                </p>
              </div>

              <div className="bg-[#F7F4EF] rounded-xl p-4 mb-5">
                <Label className="text-xs font-bold tracking-wide text-[#1C2B3A] uppercase mb-3 block">Availability</Label>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#1C2B3A]">Available for new work</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Shows a green badge on your profile</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => update("is_available", !form.is_available)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${form.is_available ? "bg-[#E8640A]" : "bg-gray-300"}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all shadow ${form.is_available ? "left-5" : "left-0.5"}`} />
                  </button>
                </div>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <p className="text-xs font-bold text-green-800 mb-1">What happens next</p>
                <p className="text-xs text-green-700 leading-relaxed">
                  Your profile goes live immediately. You'll then be taken to your dashboard where you can start receiving leads, building quotes and getting paid through TradeStone.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex gap-3">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} className="flex-1">
              Back
            </Button>
          )}
          <Button
            onClick={() => step < 4 ? setStep(step + 1) : save()}
            disabled={!canProceed() || saving}
            className="flex-[2] bg-[#1C2B3A] hover:bg-[#E8640A] text-white transition-colors"
          >
            {saving ? "Saving..." : step < 4 ? "Continue →" : "Complete setup →"}
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Your data is encrypted and never shared without your permission.
        </p>
      </div>
    </div>
  );
};

export default ContractorOnboarding;
