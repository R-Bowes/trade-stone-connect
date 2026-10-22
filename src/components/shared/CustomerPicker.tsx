import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export type CustomerSearchResult = {
  profile_id: string;
  company_id: string | null;
  display_name: string | null;
  ts_code: string | null;
  account_type: string;
  addr_line1: string | null;
  addr_line2: string | null;
  addr_city: string | null;
  addr_region: string | null;
  addr_postcode: string | null;
  addr_country: string | null;
  legacy_address: string | null;
};

export type PickedCustomer =
  | { kind: "on_platform"; result: CustomerSearchResult }
  | { kind: "not_on_tradestone" };

interface CustomerPickerProps {
  picked: PickedCustomer | null;
  onPick: (picked: PickedCustomer) => void;
  onClear: () => void;
  disabled?: boolean;
  /**
   * "ts_p_code": exact personal (TS-P) code only, no name search and no
   * "Not on TradeStone" — the quote-by-TS-code flow. Defaults to "search".
   */
  mode?: "search" | "ts_p_code";
}

const HOMEOWNER_ONLY = "Only homeowner (TS-P) codes can be quoted this way.";
const TS_P_CODE = /^TS-P-[A-Z0-9]{4,}$/i;

/** Why a query can't be looked up in ts_p_code mode, or null when it can. */
function tsPCodeProblem(query: string): string | null {
  if (/^TS-[BC]-/i.test(query)) return HOMEOWNER_ONLY;
  if (!TS_P_CODE.test(query)) return "Enter the customer's full TS-P code, for example TS-P-1A2B3C.";
  return null;
}

/**
 * Search by TS code or name, restricted server-side (search_customers RPC)
 * to accounts an exact code always resolves, a name search only returns
 * accounts the caller already has a relationship with. Picking a result
 * hands the full row back to the caller; the name is masked and the
 * address left out when there is no relationship. "Not on TradeStone"
 * keeps the recipient unlinked.
 */
export function CustomerPicker({ picked, onPick, onClear, disabled, mode = "search" }: CustomerPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const codeOnly = mode === "ts_p_code";

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    if (codeOnly) {
      const problem = tsPCodeProblem(trimmed);
      if (problem) {
        setError(problem);
        setResults([]);
        setSearching(false);
        return;
      }
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      void supabase
        .rpc("search_customers", { p_query: trimmed })
        .then(({ data, error: rpcError }) => {
          if (rpcError) {
            setError(rpcError.message);
            setResults([]);
          } else {
            const rows = (data ?? []) as CustomerSearchResult[];
            // Some business accounts carry TS-P codes; the account type,
            // not the prefix, decides.
            if (codeOnly && rows.some((r) => r.account_type !== "personal")) {
              setError(HOMEOWNER_ONLY);
              setResults([]);
            } else {
              setError(null);
              setResults(rows);
            }
          }
          setSearching(false);
        });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, codeOnly]);

  if (picked) {
    const label = picked.kind === "not_on_tradestone"
      ? "Not on TradeStone"
      : (picked.result.display_name ?? "Customer");
    const code = picked.kind === "on_platform" ? picked.result.ts_code : null;
    return (
      <div className="flex items-center justify-between rounded-md border px-3 py-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{label}</p>
          {code && <p className="font-mono text-xs text-muted-foreground">{code}</p>}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClear} disabled={disabled}>
          <i className="ti ti-x" aria-hidden="true" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={codeOnly ? "TS-P code, e.g. TS-P-1A2B3C" : "Search by TS code or name"}
          disabled={disabled}
        />
        {open && query.trim().length >= 2 && (
          <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md">
            {searching ? (
              <p className="p-3 text-sm text-muted-foreground">Searching…</p>
            ) : error ? (
              <p className="p-3 text-sm text-destructive">{error}</p>
            ) : results.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                {codeOnly ? "No TradeStone account has that code." : "No matches."}
              </p>
            ) : (
              <ul className="max-h-56 overflow-y-auto">
                {results.map((r) => (
                  <li key={r.profile_id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => { onPick({ kind: "on_platform", result: r }); setOpen(false); setQuery(""); }}
                    >
                      <span className="truncate">{r.display_name ?? "—"}</span>
                      <span className="ml-2 shrink-0 font-mono text-xs text-muted-foreground">{r.ts_code}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      {!codeOnly && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-muted-foreground"
          onClick={() => { onPick({ kind: "not_on_tradestone" }); setOpen(false); setQuery(""); }}
          disabled={disabled}
        >
          Not on TradeStone
        </Button>
      )}
    </div>
  );
}

/** One-line display address for a picked customer, for forms that still use a single free-text address field (the invoice form). */
export function composeCustomerAddress(result: CustomerSearchResult): string {
  const parts = [result.addr_line1, result.addr_line2, result.addr_city, result.addr_region, result.addr_postcode, result.addr_country];
  const structured = parts.map((p) => p?.trim()).filter((p): p is string => !!p).join(", ");
  return structured || result.legacy_address || "";
}

/** Shared label, so both forms present the picker field consistently. */
export function CustomerPickerField(props: CustomerPickerProps) {
  return (
    <div className="space-y-2">
      <Label>Customer</Label>
      <CustomerPicker {...props} />
    </div>
  );
}
