import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface RecordCardField {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
}

interface RecordCardProps {
  icon: ReactNode;
  title: ReactNode;
  /** Rendered in font-mono under the title. */
  reference?: ReactNode;
  /** Right-aligned in the header. */
  badges?: ReactNode;
  /** Rendered above the field grid (e.g. a description), full density only. */
  lead?: ReactNode;
  fields: RecordCardField[];
  /** Sections. Wrap each in RecordSection to get the divider. */
  children?: ReactNode;
  /** Rendered only when present, and only in full density. */
  actions?: ReactNode;
  /** compact renders the header, fields and actions, tighter-spaced: no lead, no sections. */
  density?: "full" | "compact";
}

/** A divided section inside a RecordCard. */
export function RecordSection({ children, className = "space-y-3" }: { children: ReactNode; className?: string }) {
  return <div className={`border-t pt-3 ${className}`}>{children}</div>;
}

/**
 * Layout shell shared by the engagement, work order and job cards: header
 * (icon, title, mono reference, badges), responsive field grid, divided
 * sections, optional actions row. It owns no data.
 */
export function RecordCard({ icon, title, reference, badges, lead, fields, children, actions, density = "full" }: RecordCardProps) {
  const compact = density === "compact";

  if (compact) {
    // A genuine row, not a shrunk full card: everything on one line
    // (wrapping only when the viewport forces it), no header/content split.
    return (
      <Card>
        <CardContent className="flex items-center gap-4 py-2 px-4 flex-wrap">
          <div className="flex items-center gap-2 min-w-0 shrink-0">
            <span className="text-muted-foreground">{icon}</span>
            <span className="text-sm font-medium truncate">{title}</span>
            {reference != null && <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">{reference}</span>}
          </div>

          {fields.length > 0 && (
            <div className="flex items-center gap-x-4 gap-y-1 text-xs flex-1 min-w-0 flex-wrap">
              {fields.map((field) => (
                <span key={field.label} className="whitespace-nowrap text-muted-foreground">
                  {field.label}:{" "}
                  <span className="text-foreground">
                    {field.icon ? (
                      <span className="inline-flex items-center gap-1">{field.icon}{field.value}</span>
                    ) : (
                      field.value
                    )}
                  </span>
                </span>
              ))}
            </div>
          )}

          {badges != null && <div className="flex gap-1.5 flex-wrap shrink-0">{badges}</div>}
          {actions && <div className="flex gap-2 shrink-0">{actions}</div>}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="shrink-0 text-muted-foreground">{icon}</span>
            <div className="min-w-0">
              <CardTitle className="text-base">{title}</CardTitle>
              {reference != null && <p className="text-xs text-muted-foreground font-mono">{reference}</p>}
            </div>
          </div>
          {badges != null && <div className="flex gap-2 flex-wrap">{badges}</div>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {lead}

        {fields.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            {fields.map((field) => (
              <div key={field.label}>
                <p className="text-muted-foreground text-xs">{field.label}</p>
                <p>
                  {field.icon ? (
                    <span className="inline-flex items-center gap-1">{field.icon}{field.value}</span>
                  ) : (
                    field.value
                  )}
                </p>
              </div>
            ))}
          </div>
        )}

        {children}

        {actions && <div className="flex flex-wrap gap-2 pt-1">{actions}</div>}
      </CardContent>
    </Card>
  );
}
