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
    // Layout follows the card's own width (container queries), not the
    // viewport: with the dashboard sidebar open the card is far narrower
    // than the window, and viewport `md:` forced a one-line row that let
    // nowrap field text run underneath the badges. Three layouts:
    //   < @md (28rem)        — single-column stack, full-width action.
    //   @md – < @4xl (56rem) — two lines: title | badges, fields | action.
    //   >= @4xl              — one line: title, fields, badges, action.
    // Every cell is a grid track with min-width 0 or auto, so nothing can
    // overflow into a neighbour; long text truncates instead.
    return (
      <Card className="@container">
        <CardContent className="grid grid-cols-1 items-center gap-2 py-2 px-4 @md:grid-cols-[minmax(0,1fr)_auto] @md:gap-x-4 @md:gap-y-1.5 @4xl:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_auto_auto]">
          <div className="flex items-center gap-2 min-w-0 @md:col-start-1 @md:row-start-1">
            <span className="shrink-0 text-muted-foreground">{icon}</span>
            <span className="min-w-0 text-sm font-medium truncate">{title}</span>
            {reference != null && <span className="shrink-0 text-xs text-muted-foreground font-mono whitespace-nowrap">{reference}</span>}
          </div>

          {fields.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 min-w-0 overflow-hidden text-xs @md:col-start-1 @md:row-start-2 @4xl:col-start-2 @4xl:row-start-1">
              {fields.map((field) => (
                <span key={field.label} className="max-w-full truncate whitespace-nowrap text-muted-foreground">
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

          {badges != null && (
            <div className="flex shrink-0 flex-wrap gap-1.5 @md:col-start-2 @md:row-start-1 @md:justify-self-end @4xl:col-start-3">
              {badges}
            </div>
          )}

          {actions && (
            <div className="flex shrink-0 gap-2 [&>*]:flex-1 @md:col-start-2 @md:row-start-2 @md:justify-self-end @md:[&>*]:flex-none @4xl:col-start-4 @4xl:row-start-1">
              {actions}
            </div>
          )}
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
