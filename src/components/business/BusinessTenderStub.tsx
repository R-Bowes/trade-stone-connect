import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Placeholder destination for every tender row/header action until slice 2
// (creation form, detail view, unseal, bid comparison) is built. All of
// "New tender", "Continue", "Unseal", "Review bids", and the terminal-state
// "View" actions route here for now, distinguished only by `mode` so
// slice 2 can split them into real destinations without touching the
// callers in BusinessTendersView.
const MODE_COPY: Record<string, string> = {
  new: "Tender creation is coming in the next build.",
  continue: "Resuming a draft tender is coming in the next build.",
  unseal: "Unsealing bids is coming in the next build.",
  review: "Bid comparison and scoring is coming in the next build.",
  view: "The tender detail view is coming in the next build.",
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
