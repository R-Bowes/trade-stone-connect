import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Mirrors BusinessTenderStub.tsx's role: a shared "coming soon" destination
// for every contractor-side tender action not yet built. Ask a question,
// Decline, and Start application all land here this slice — split into
// real destinations independently once each is built, without touching
// the brief that routes to them.
const MODE_COPY: Record<string, string> = {
  ask: "Asking clarification questions is coming in the next build.",
  decline: "Declining an invitation is coming in the next build.",
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
