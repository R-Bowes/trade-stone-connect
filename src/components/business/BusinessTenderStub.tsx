import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Placeholder destination for every tender action not yet built. "New
// tender" and draft "Continue" now go to the real essentials form
// (BusinessTenderForm, slice 2) instead of here. What's left routing to
// this stub: "Unseal", "Review bids", the terminal-state "View" actions,
// and "Publish" from inside the form itself — distinguished only by
// `mode` so each can be split into a real destination independently,
// without touching its caller.
const MODE_COPY: Record<string, string> = {
  unseal: "Unsealing bids is coming in the next build.",
  review: "Bid comparison and scoring is coming in the next build.",
  view: "The tender detail view is coming in the next build.",
  publish: "Publishing a tender is coming in the next build.",
};

export function BusinessTenderStub() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode") ?? "view";

  return (
    <div className="p-6 max-w-lg">
      <Card>
        <CardContent className="p-8 text-center">
          <i className="ti ti-tools text-4xl text-muted-foreground mb-4 block" />
          <h3 className="text-lg font-medium mb-2">Coming soon</h3>
          <p className="text-muted-foreground mb-6">
            {MODE_COPY[mode] ?? MODE_COPY.view}
          </p>
          <Button variant="outline" onClick={() => navigate("/dashboard/business?view=tenders")}>
            Back to Tenders
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
