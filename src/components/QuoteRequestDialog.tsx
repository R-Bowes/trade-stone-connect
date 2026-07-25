import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Camera, Lock } from "lucide-react";

interface QuoteRequestDialogProps {
  isOpen: boolean;
  onClose: () => void;
  contractorId: string;
  contractorName: string;
  contractorTsCode?: string | null;
  contractorAvatarUrl?: string | null;
}

const JOB_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "repair", label: "Repair" },
  { value: "service", label: "Service" },
  { value: "installation", label: "Installation" },
  { value: "inspection", label: "Inspection" },
  { value: "emergency_callout", label: "Emergency callout" },
  { value: "other", label: "Other" },
];

const PRIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: "low", label: "Low — flexible timing" },
  { value: "medium", label: "Medium — within a few weeks" },
  { value: "high", label: "High — within days" },
  { value: "emergency", label: "Emergency — ASAP" },
];

const TIMELINE_OPTIONS = [
  "Within 1 week",
  "Within 2 weeks",
  "Within 1 month",
  "Within 3 months",
  "Flexible / no rush",
];

const BUDGET_OPTIONS = [
  "Under £100",
  "£100 – £250",
  "£250 – £500",
  "£500 – £1,000",
  "£1,000 – £2,500",
  "£2,500 – £5,000",
  "£5,000+",
  "Not sure — need a quote",
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const QuoteRequestDialog = ({
  isOpen,
  onClose,
  contractorId,
  contractorName,
  contractorTsCode,
  contractorAvatarUrl,
}: QuoteRequestDialogProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  // Auto-populated from profile (hidden — never rendered)
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [tsProfileCode, setTsProfileCode] = useState("");

  // Required fields
  const [title, setTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobType, setJobType] = useState("");
  const [location, setLocation] = useState("");

  // Optional fields
  const [priority, setPriority] = useState("");
  const [timeline, setTimeline] = useState("");
  const [budgetRange, setBudgetRange] = useState("");
  const [accessNotes, setAccessNotes] = useState("");
  const [photos, setPhotos] = useState<FileList | null>(null);

  // Auth check + profile fetch
  useEffect(() => {
    if (!isOpen) return;

    const loadProfile = async () => {
      setIsLoadingProfile(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        onClose();
        toast({
          title: "Login Required",
          description: "Please log in to request a quote.",
          variant: "destructive",
        });
        navigate("/auth");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, email, phone, location, ts_profile_code")
        .eq("user_id", user.id)
        .single();

      if (profile) {
        setCustomerName(profile.full_name || "");
        setCustomerEmail(user.email || profile.email || "");
        setCustomerPhone(profile.phone || "");
        setTsProfileCode(profile.ts_profile_code || "");
        setLocation(profile.location || "");
      } else {
        setCustomerEmail(user.email || "");
      }

      setIsLoadingProfile(false);
    };

    loadProfile();
  }, [isOpen, navigate, onClose, toast]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setTitle("");
      setJobDescription("");
      setJobType("");
      setLocation("");
      setPriority("");
      setTimeline("");
      setBudgetRange("");
      setAccessNotes("");
      setPhotos(null);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast({ title: "Required", description: "Please give the job a short title.", variant: "destructive" });
      return;
    }
    if (!jobDescription.trim()) {
      toast({ title: "Required", description: "Please describe the job.", variant: "destructive" });
      return;
    }
    if (!jobType) {
      toast({ title: "Required", description: "Please select a job type.", variant: "destructive" });
      return;
    }
    if (!location.trim()) {
      toast({ title: "Required", description: "Please enter the site address.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const additionalDetails: Record<string, string> = {};
      if (tsProfileCode) additionalDetails.ts_profile_code = tsProfileCode;

      const { data: result, error } = await supabase.functions.invoke("send-quote-notification", {
        body: {
          contractor_id: contractorId,
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone || null,
          project_title: title.trim(),
          project_description: jobDescription,
          project_location: location,
          job_type: jobType,
          priority: priority || null,
          access_notes: accessNotes.trim() || null,
          budget_range: budgetRange || null,
          timeline: timeline || null,
          additional_details: Object.keys(additionalDetails).length > 0 ? additionalDetails : null,
          contractorName,
        },
      });

      if (error) throw error;

      if (result && !result.success) {
        if (result.error?.includes("Too many")) {
          toast({
            title: "Too Many Requests",
            description: "You've submitted too many quote requests. Please wait a few minutes and try again.",
            variant: "destructive",
          });
          return;
        }
        throw new Error(result.error || "Failed to submit quote");
      }

      if (result?.enquiry_id) {
        supabase.functions
          .invoke("notify-contractor", { body: { enquiry_id: result.enquiry_id } })
          .catch(console.error);

        if (photos && photos.length > 0) {
          const { data: authData } = await supabase.auth.getUser();
          if (authData.user) {
            const uploadedPaths: string[] = [];
            for (const file of Array.from(photos)) {
              const ext = file.name.split(".").pop() || "jpg";
              const path = `${authData.user.id}/${result.enquiry_id}/${crypto.randomUUID()}.${ext}`;
              const { error: uploadError } = await supabase.storage
                .from("enquiry-photos")
                .upload(path, file);
              if (uploadError) {
                console.error("Enquiry photo upload failed:", uploadError);
                continue;
              }
              uploadedPaths.push(path);
            }
            if (uploadedPaths.length > 0) {
              await supabase
                .from("enquiries")
                .update({ photo_urls: uploadedPaths })
                .eq("id", result.enquiry_id);
            }
          }
        }
      }

      toast({
        title: "Enquiry sent",
        description: `Your enquiry has been sent. ${contractorName} will respond shortly.`,
      });

      onClose();
    } catch (error) {
      console.error("Error submitting quote request:", error);
      toast({
        title: "Error",
        description: "Failed to send your enquiry. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Avatar className="h-11 w-11">
              {contractorAvatarUrl && <AvatarImage src={contractorAvatarUrl} alt={contractorName} />}
              <AvatarFallback className="font-heading">{initials(contractorName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <DialogTitle className="leading-snug">Request a quote from {contractorName}</DialogTitle>
              {contractorTsCode && (
                <p className="text-xs text-muted-foreground font-mono">{contractorTsCode}</p>
              )}
            </div>
          </div>
          <DialogDescription className="sr-only">
            Describe the work you need and we'll send your request.
          </DialogDescription>
        </DialogHeader>

        {isLoadingProfile ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2 text-muted-foreground">Loading...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">
                What do you need done? <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                placeholder="e.g. Boiler service, kitchen refit, broken lock"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="jobDescription">
                Describe the work in detail <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="jobDescription"
                placeholder="Include make/model of any equipment, access details, anything the contractor should know before quoting"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                className="min-h-24"
                required
              />
            </div>

            {/* Job type */}
            <div className="space-y-2">
              <Label>
                Job type <span className="text-destructive">*</span>
              </Label>
              <Select value={jobType} onValueChange={setJobType} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select job type" />
                </SelectTrigger>
                <SelectContent>
                  {JOB_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Site address */}
            <div className="space-y-2">
              <Label htmlFor="location">
                Site address <span className="text-destructive">*</span>
              </Label>
              <Input
                id="location"
                placeholder="Start typing an address..."
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                required
              />
            </div>

            {/* Priority */}
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Timeline */}
            <div className="space-y-2">
              <Label>Preferred timeline</Label>
              <Select value={timeline} onValueChange={setTimeline}>
                <SelectTrigger>
                  <SelectValue placeholder="Select timeline" />
                </SelectTrigger>
                <SelectContent>
                  {TIMELINE_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Budget */}
            <div className="space-y-2">
              <Label>Budget range</Label>
              <Select value={budgetRange} onValueChange={setBudgetRange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select budget range" />
                </SelectTrigger>
                <SelectContent>
                  {BUDGET_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Access and site notes */}
            <div className="space-y-2">
              <Label htmlFor="accessNotes">Access and site notes</Label>
              <Textarea
                id="accessNotes"
                placeholder="e.g. Parking on street, key with neighbour, dog in garden, specific access hours"
                value={accessNotes}
                onChange={(e) => setAccessNotes(e.target.value)}
                className="min-h-16"
              />
            </div>

            {/* Photos */}
            <div className="space-y-2">
              <Label
                htmlFor="photos"
                className="flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              >
                <Camera className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm font-medium">Tap to add photos of the job</span>
                <span className="text-xs text-muted-foreground">Helps the contractor quote accurately</span>
              </Label>
              <Input
                id="photos"
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="sr-only"
                onChange={(e) => {
                  const files = e.target.files;
                  if (files && files.length > 5) {
                    toast({ title: "Too many photos", description: "You can upload up to 5 photos.", variant: "destructive" });
                    e.target.value = "";
                    return;
                  }
                  setPhotos(files);
                }}
              />
              {photos && photos.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {photos.length} of 5 photo{photos.length !== 1 ? "s" : ""} selected
                </p>
              )}
            </div>

            <Alert>
              <Lock className="h-4 w-4" />
              <AlertDescription>
                Your contact details are never shared with the contractor. All communication happens securely through TradeStone.
              </AlertDescription>
            </Alert>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit enquiry
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default QuoteRequestDialog;
