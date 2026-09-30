import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { X } from "lucide-react";
import { initials, MAX_COMPARE_RECIPIENTS } from "@/lib/quoteRequestFields";
import type { ShortlistContractor } from "@/lib/compareShortlist";

interface ShortlistConfirmationProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shortlist: ShortlistContractor[];
  onRemove: (id: string) => void;
  onContinue: () => void;
}

/**
 * The reconsideration point, deliberately placed BEFORE the job-details
 * form — once someone has typed a full description they'll send it to
 * whoever happens to be ticked rather than go back and reconsider. This
 * is the only place a contractor can be removed from the comparison
 * before the enquiry is actually sent.
 */
export function ShortlistConfirmation({ open, onOpenChange, shortlist, onRemove, onContinue }: ShortlistConfirmationProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request quotes from {shortlist.length} contractor{shortlist.length !== 1 ? "s" : ""}</DialogTitle>
          <DialogDescription>
            Review your shortlist before describing the job — you'll send one enquiry to everyone listed here.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {shortlist.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No contractors selected yet.</p>
          ) : (
            shortlist.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-md border p-2.5">
                <Avatar className="h-9 w-9">
                  {c.avatarUrl && <AvatarImage src={c.avatarUrl} alt={c.name} />}
                  <AvatarFallback className="text-xs font-heading">{initials(c.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  {c.tsCode && <p className="text-xs text-muted-foreground font-mono">{c.tsCode}</p>}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  aria-label={`Remove ${c.name}`}
                  onClick={() => onRemove(c.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
          {shortlist.length >= MAX_COMPARE_RECIPIENTS && (
            <p className="text-xs text-muted-foreground">You've reached the limit of {MAX_COMPARE_RECIPIENTS} contractors.</p>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={shortlist.length === 0} onClick={onContinue} className="flex-1">
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
