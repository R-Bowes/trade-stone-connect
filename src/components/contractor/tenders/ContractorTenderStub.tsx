import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Mirrors BusinessTenderStub.tsx's role: a shared "coming soon" destination
// for contractor-side tender actions not yet built. Decline now has a real
// destination (a dialog on the brief itself); Ask a question still lands
// here (clarifications slice) — split out independently once it's built,
// without touching the brief that routes to it.
const MODE_COPY: Record<string, string> = {
  ask: "Asking clarification questions is coming in the next build.",
  apply: "Submitting an application is coming in the next build.",
};

interface Props {
  mode: string;
  onBack: () => void;
}

export function ContractorTenderStub({ mode, onBack }: Props) {
  return (
    <div className="p-6 max-w-lg">
      <Card>
        <CardContent className="p-8 text-center">
          <i className="ti ti-tools text-4xl text-muted-foreground mb-4 block" />
          <h3 className="text-lg font-medium mb-2">Coming soon</h3>
          <p className="text-muted-foreground mb-6">{MODE_COPY[mode] ?? MODE_COPY.apply}</p>
          <Button variant="outline" onClick={onBack}>
            Back to tender
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
