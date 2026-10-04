/** Live (non-superseded) RAMS for a job, as the field views load it. */
export interface FieldRamsStatus {
  status: string;
  version: number;
}

/**
 * RAMS marker for a field job card: grey "No RAMS", amber "RAMS not signed"
 * for a draft or tailored RAMS, green "RAMS v{n} signed" once signed.
 */
export default function FieldRamsMarker({ rams }: { rams: FieldRamsStatus | null | undefined }) {
  const style = !rams
    ? { bg: "#f3f4f6", fg: "#6b7280", label: "No RAMS" }
    : rams.status === "signed"
      ? { bg: "#f0fdf4", fg: "#166534", label: `RAMS v${rams.version} signed` }
      : { bg: "#fffbeb", fg: "#b45309", label: "RAMS not signed" };
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold"
      style={{ backgroundColor: style.bg, color: style.fg, fontSize: 13 }}
    >
      {rams?.status === "signed" && <i className="ti ti-check" />}
      {style.label}
    </span>
  );
}
