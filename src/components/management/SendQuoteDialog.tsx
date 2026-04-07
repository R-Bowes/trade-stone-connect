import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Enquiry = {
  id: string;
  contractor_id: string | null;
  customer_name: string;
  customer_email: string;
  job_description: string;
  location: string;
  preferred_timeline: string | null;
  budget_range: string | null;
  status: string;
  created_at: string;
};

interface SendQuoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enquiry: Enquiry;
  onSuccess?: () => void;
}

export function SendQuoteDialog({ open, onOpenChange, enquiry, onSuccess }: SendQuoteDialogProps) {
  const { toast } = useToast();
  const [projectTitle, setProjectTitle] = useState("Quote for requested work");
  const [projectDescription, setProjectDescription] = useState("");
  const [timeline, setTimeline] = useState("");
  const [budgetRange, setBudgetRange] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProjectDescription(enquiry.job_description || "");
    setTimeline(enquiry.preferred_timeline || "");
    setBudgetRange(enquiry.budget_range || "");
    setProjectTitle(`Quote for ${enquiry.customer_name}`);
  }, [open, enquiry]);

  const handleSubmit = async () => {
    if (!enquiry.contractor_id) {
      toast({
        title: "Missing contractor profile",
        description: "Cannot send quote without a valid contractor profile.",
        variant: "destructive",
      });
      return;
    }

    if (!projectTitle.trim() || !projectDescription.trim()) {
      toast({
        title: "Required fields missing",
        description: "Please add a title and description before sending.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const { error: quoteError } = await supabase.from("quotes").insert({
        contractor_id: enquiry.contractor_id,
        customer_name: enquiry.customer_name,
        customer_email: enquiry.customer_email,
        project_title: projectTitle.trim(),
        project_description: projectDescription.trim(),
        project_location: enquiry.location || null,
        budget_range: budgetRange || null,
        timeline: timeline || null,
        status: "pending",
      });

      if (quoteError) throw quoteError;

      const { error: enquiryError } = await supabase
        .from("enquiries")
        .update({ status: "replied" })
        .eq("id", enquiry.id);

      if (enquiryError) throw enquiryError;

      toast({
        title: "Quote sent",
        description: `Quote sent to ${enquiry.customer_name}.`,
      });
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to send quote:", error);
      toast({
        title: "Could not send quote",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Send Quote</DialogTitle>
          <DialogDescription>
            Create a quote for {enquiry.customer_name} ({enquiry.customer_email}).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="quote-title">Project title</Label>
            <Input
              id="quote-title"
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
              placeholder="Quote title"
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="quote-description">Project description</Label>
            <Textarea
              id="quote-description"
              value={projectDescription}
              onChange={(e) => setProjectDescription(e.target.value)}
              className="min-h-28"
              disabled={submitting}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quote-timeline">Timeline</Label>
              <Input
                id="quote-timeline"
                value={timeline}
                onChange={(e) => setTimeline(e.target.value)}
                placeholder="e.g. 2-3 weeks"
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quote-budget">Budget / amount</Label>
              <Input
                id="quote-budget"
                value={budgetRange}
                onChange={(e) => setBudgetRange(e.target.value)}
                placeholder="e.g. GBP 2,400"
                disabled={submitting}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Quote"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
