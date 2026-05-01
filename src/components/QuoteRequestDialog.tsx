import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Camera } from "lucide-react";

interface QuoteRequestDialogProps {
  isOpen: boolean;
  onClose: () => void;
  contractorId: string;
  contractorName: string;
}

const TIMELINE_OPTIONS = [
  "As soon as possible",
  "Within 1 week",
  "Within 1 month",
  "Flexible",
];

const BUDGET_OPTIONS = [
  "Under £500",
  "£500–£2,000",
  "£2,000–£5,000",
  "£5,000–£10,000",
  "£10,000+",
  "I'd like a full quote first",
];

const QuoteRequestDialog = ({ isOpen, onClose, contractorId, contractorName }: QuoteRequestDialogProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  // Auto-populated from profile (hidden)
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [tsProfileCode, setTsProfileCode] = useState("");

  // Visible form fields
  const [jobDescription, setJobDescription] = useState("");
  const [location, setLocation] = useState("");
  const [timeline, setTimeline] = useState("");
  const [budgetRange, setBudgetRange] = useState("");
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
      setJobDescription("");
      setLocation("");
      setTimeline("");
      setBudgetRange("");
      setPhotos(null);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!jobDescription.trim()) {
      toast({ title: "Required", description: "Please describe the job.", variant: "destructive" });
      return;
    }
    if (!location.trim()) {
      toast({ title: "Required", description: "Please enter the job location.", variant: "destructive" });
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
          project_title: "Quote Request",
          project_description: jobDescription,
          project_location: location,
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
      }

      toast({
        title: "Quote Request Sent!",
        description: `Your quote request has been sent. ${contractorName} will respond shortly.`,
      });

      onClose();
    } catch (error) {
      console.error("Error submitting quote request:", error);
      toast({
        title: "Error",
        description: "Failed to send quote request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Request Quote from {contractorName}</DialogTitle>
          <DialogDescription>
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
            {/* 1. Job Description */}
            <div className="space-y-2">
              <Label htmlFor="jobDescription">
                Job description <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="jobDescription"
                placeholder="Describe the work you need done…"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                className="min-h-24"
                required
              />
            </div>

            {/* 2. Location */}
            <div className="space-y-2">
              <Label htmlFor="location">
                Job location (where the work is needed) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="location"
                placeholder="e.g. 123 High Street, London"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                required
              />
            </div>

            {/* 3. Timeline */}
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

            {/* 4. Budget */}
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

            {/* 5. Photos */}
            <div className="space-y-2">
              <Label htmlFor="photos" className="flex items-center gap-1.5">
                <Camera className="h-4 w-4" /> Photos (optional)
              </Label>
              <Input
                id="photos"
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setPhotos(e.target.files)}
                className="cursor-pointer"
              />
              {photos && photos.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {photos.length} photo{photos.length !== 1 ? "s" : ""} selected
                </p>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send Quote Request
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default QuoteRequestDialog;
