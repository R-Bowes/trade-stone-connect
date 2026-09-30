import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Camera, Lock, X, Users } from "lucide-react";
import { AddressInput, EMPTY_ADDRESS, composeAddressString, type AddressValue } from "@/components/shared/AddressInput";
import {
  JOB_TYPE_OPTIONS, PRIORITY_OPTIONS, TIMELINE_OPTIONS, BUDGET_OPTIONS,
  MAX_ENQUIRY_PHOTOS, isAddressComplete, isHeic, convertHeicToJpeg,
} from "@/lib/quoteRequestFields";
import type { ShortlistContractor } from "@/lib/compareShortlist";

interface CompareQuoteRequestDialogProps {
  isOpen: boolean;
  onClose: () => void;
  shortlist: ShortlistContractor[];
  onSent: () => void;
  source?: "marketplace" | "direct" | "panel";
}

/**
 * The job-details step of the compare-quotes flow — same field set as
 * QuoteRequestDialog.tsx (deliberately not imported from it; that file is
 * do-not-touch), filled in once and sent to every contractor on the
 * shortlist via send-quote-notification-multi rather than QuoteRequestDialog's
 * single-contractor edge function.
 */
export function CompareQuoteRequestDialog({ isOpen, onClose, shortlist, onSent, source = "marketplace" }: CompareQuoteRequestDialogProps) {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  const [title, setTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobType, setJobType] = useState("");
  const [address, setAddress] = useState<AddressValue>(EMPTY_ADDRESS);
  const [profileLocationHint, setProfileLocationHint] = useState<string | null>(null);

  const [priority, setPriority] = useState("");
  const [timeline, setTimeline] = useState("");
  const [budgetRange, setBudgetRange] = useState("");
  const [accessNotes, setAccessNotes] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    const loadProfile = async () => {
      setIsLoadingProfile(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        onClose();
        toast({ title: "Login Required", description: "Please log in to request quotes.", variant: "destructive" });
        navigate("/auth");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, email, phone, location")
        .eq("user_id", user.id)
        .single();
      if (profile) {
        setCustomerName(profile.full_name || "");
        setCustomerEmail(user.email || profile.email || "");
        setCustomerPhone(profile.phone || "");
        setProfileLocationHint(profile.location || null);
      } else {
        setCustomerEmail(user.email || "");
      }
      setIsLoadingProfile(false);
    };
    loadProfile();
  }, [isOpen, navigate, onClose, toast]);

  useEffect(() => {
    const urls = photos.map((file) => URL.createObjectURL(file));
    setPhotoPreviewUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [photos]);

  useEffect(() => {
    if (!isOpen) {
      setTitle("");
      setJobDescription("");
      setJobType("");
      setAddress(EMPTY_ADDRESS);
      setProfileLocationHint(null);
      setPriority("");
      setTimeline("");
      setBudgetRange("");
      setAccessNotes("");
      setPhotos([]);
    }
  }, [isOpen]);

  const removePhoto = (index: number) => setPhotos((prev) => prev.filter((_, i) => i !== index));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (shortlist.length === 0) {
      toast({ title: "No contractors selected", description: "Go back and choose at least one contractor.", variant: "destructive" });
      return;
    }
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
    if (!isAddressComplete(address)) {
      toast({ title: "Required", description: "Please enter the site address, including country.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("send-quote-notification-multi", {
        body: {
          contractors: shortlist.map((c) => ({ id: c.id, name: c.name })),
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone || null,
          project_title: title.trim(),
          project_description: jobDescription,
          project_location: composeAddressString(address),
          job_type: jobType,
          priority: priority || null,
          access_notes: accessNotes.trim() || null,
          budget_range: budgetRange || null,
          timeline: timeline || null,
          source,
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
        throw new Error(result.error || "Failed to submit quote request");
      }

      if (result?.enquiry_id) {
        const { error: addrError } = await supabase
          .from("enquiries")
          .update({
            addr_line1: address.addr_line1,
            addr_line2: address.addr_line2,
            addr_city: address.addr_city,
            addr_region: address.addr_region,
            addr_postcode: address.addr_postcode,
            addr_country: address.addr_country,
          })
          .eq("id", result.enquiry_id);
        if (addrError) console.error("Failed to save structured address for comparison enquiry:", addrError);

        if (photos.length > 0) {
          const { data: authData } = await supabase.auth.getUser();
          if (authData.user) {
            const uploadedPaths: string[] = [];
            for (const file of photos) {
              const ext = file.name.split(".").pop() || "jpg";
              const path = `${authData.user.id}/${result.enquiry_id}/${crypto.randomUUID()}.${ext}`;
              const { error: uploadError } = await supabase.storage.from("enquiry-photos").upload(path, file);
              if (uploadError) {
                console.error("Enquiry photo upload failed:", uploadError);
                continue;
              }
              uploadedPaths.push(path);
            }
            if (uploadedPaths.length > 0) {
              await supabase.from("enquiries").update({ photo_urls: uploadedPaths }).eq("id", result.enquiry_id);
            }
          }
        }
      }

      toast({
        title: "Enquiry sent",
        description: `Your enquiry has been sent to ${shortlist.length} contractor${shortlist.length !== 1 ? "s" : ""}.`,
      });
      onSent();
    } catch (error) {
      console.error("Error submitting comparison quote request:", error);
      toast({ title: "Error", description: "Failed to send your enquiry. Please try again.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto overflow-x-hidden box-border">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted">
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="leading-snug">
                Request quotes from {shortlist.length} contractor{shortlist.length !== 1 ? "s" : ""}
              </DialogTitle>
            </div>
          </div>
          <DialogDescription className="sr-only">
            Describe the work once — we'll send it to everyone on your shortlist.
          </DialogDescription>
        </DialogHeader>

        {isLoadingProfile ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2 text-muted-foreground">Loading...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cq-title">
                What do you need done? <span className="text-destructive">*</span>
              </Label>
              <Input
                id="cq-title"
                placeholder="e.g. Boiler service, kitchen refit, broken lock"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cq-jobDescription">
                Describe the work in detail <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="cq-jobDescription"
                placeholder="Include make/model of any equipment, access details, anything a contractor should know before quoting"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                className="min-h-24"
                required
              />
            </div>

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

            <div className="space-y-2">
              <Label>
                Site address <span className="text-destructive">*</span>
              </Label>
              <AddressInput value={address} onChange={setAddress} required disabled={isSubmitting} legacyValue={profileLocationHint} />
            </div>

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

            <div className="space-y-2">
              <Label htmlFor="cq-accessNotes">Access and site notes</Label>
              <Textarea
                id="cq-accessNotes"
                placeholder="e.g. Parking on street, key with neighbour, dog in garden, specific access hours"
                value={accessNotes}
                onChange={(e) => setAccessNotes(e.target.value)}
                className="min-h-16"
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="cq-photos"
                className="flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              >
                <Camera className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm font-medium">Tap to add photos of the job</span>
                <span className="text-xs text-muted-foreground">Helps contractors quote accurately</span>
              </Label>
              <Input
                id="cq-photos"
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="sr-only"
                onChange={async (e) => {
                  const input = e.target;
                  const files = input.files;
                  if (!files || files.length === 0) return;
                  const selected = Array.from(files);
                  input.value = "";

                  const processed: File[] = [];
                  const failed: string[] = [];
                  for (const file of selected) {
                    if (isHeic(file)) {
                      try {
                        processed.push(await convertHeicToJpeg(file));
                      } catch (err) {
                        console.error("HEIC conversion failed:", err);
                        failed.push(file.name);
                      }
                    } else {
                      processed.push(file);
                    }
                  }

                  if (failed.length > 0) {
                    toast({ title: "Some photos couldn't be processed", description: failed.join(", "), variant: "destructive" });
                  }

                  setPhotos((prev) => {
                    const combined = [...prev, ...processed];
                    if (combined.length > MAX_ENQUIRY_PHOTOS) {
                      toast({ title: "Too many photos", description: `You can upload up to ${MAX_ENQUIRY_PHOTOS} photos.`, variant: "destructive" });
                      return combined.slice(0, MAX_ENQUIRY_PHOTOS);
                    }
                    return combined;
                  });
                }}
              />
              {photos.length > 0 && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {photoPreviewUrls.map((url, index) => (
                      <div key={url} className="relative h-20 w-20 shrink-0 rounded-md overflow-hidden border">
                        <img src={url} alt="" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removePhoto(index)}
                          aria-label="Remove photo"
                          className="absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {photos.length} photo{photos.length !== 1 ? "s" : ""} selected
                  </p>
                </div>
              )}
            </div>

            <Alert>
              <Lock className="h-4 w-4" />
              <AlertDescription>
                Your contact details are never shared with contractors. All communication happens securely through TradeStone.
                Each contractor will know their quote is one of several — never how many, or who else was asked.
              </AlertDescription>
            </Alert>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send to {shortlist.length} contractor{shortlist.length !== 1 ? "s" : ""}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
