import { AlertCircle, Inbox, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const LoadingState = ({ message = "Loading..." }: { message?: string }) => (
  <div className="flex min-h-[220px] items-center justify-center">
    <div className="flex items-center gap-2 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span>{message}</span>
    </div>
  </div>
);

export const ErrorState = ({
  message,
  onRetry,
  retryLabel = "Retry",
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) => (
  <div className="flex min-h-[220px] items-center justify-center">
    <div className="max-w-md rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-center">
      <div className="mb-2 flex items-center justify-center gap-2 font-semibold text-destructive">
        <AlertCircle className="h-4 w-4" />
        <span>Something went wrong</span>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{message}</p>
      {onRetry ? (
        <Button variant="outline" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  </div>
);

export const EmptyState = ({
  message,
  ctaLabel,
  onCta,
}: {
  message: string;
  ctaLabel?: string;
  onCta?: () => void;
}) => (
  <div className="flex min-h-[220px] items-center justify-center">
    <div className="max-w-md rounded-lg border border-border bg-card p-4 text-center">
      <div className="mb-2 flex items-center justify-center gap-2 font-semibold">
        <Inbox className="h-4 w-4 text-muted-foreground" />
        <span>Nothing here yet</span>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{message}</p>
      {ctaLabel && onCta ? (
        <Button onClick={onCta}>{ctaLabel}</Button>
      ) : null}
    </div>
  </div>
);
