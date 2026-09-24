import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface EmptyStateProps {
  icon: ReactNode;
  message: string;
  action?: ReactNode;
}

/** Shared empty state for card lists — icon, one line, optional action. */
export function EmptyState({ icon, message, action }: EmptyStateProps) {
  return (
    <Card>
      <CardContent className="p-10 text-center flex flex-col items-center gap-3 text-muted-foreground">
        {icon}
        <p>{message}</p>
        {action}
      </CardContent>
    </Card>
  );
}
