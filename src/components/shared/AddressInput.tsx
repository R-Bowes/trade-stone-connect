// src/components/shared/AddressInput.tsx
//
// Shared structured address input, adopted by every TradeStone form that
// captures a postal address (QuoteRequestDialog, SendQuoteDialog,
// RamsEditor). Writes only the addr_* columns added in
// 20260817150000_structured_address_schema.sql -- country, line1, line2,
// city, region, postcode.
//
// NO geocoding service is wired up here -- no Google Places, no Mapbox, no
// API key. addr_lat / addr_lng / addr_place_id are deliberately NOT part of
// AddressValue and are never written by this component; they stay null
// until a later brief adds a resolution provider.
//
// Controlled component -- no internal source of truth for the address
// itself. The caller owns state and passes value/onChange, matching every
// other field in the three adopting files: plain useState + shadcn/ui
// Input/Select, not react-hook-form. src/components/ui/form.tsx (the
// shadcn react-hook-form wrapper) exists in this repo but is imported
// nowhere in src/ -- confirmed before writing this file -- so this
// component does not introduce that pattern either.
//
// Country is required and gates every other field: an address with no
// country attached is exactly the ambiguity this component exists to
// remove. Region/postcode LABELS vary by country (County/State/Province,
// Postcode/ZIP code/Postal code) but the underlying columns
// (addr_region, addr_postcode) are the same regardless of country -- only
// the label and the postcode validation pattern change.

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type CountryCode = "GB" | "US" | "CA";

/**
 * Mirrors the addr_* columns exactly. addr_lat/addr_lng/addr_place_id are
 * intentionally NOT part of this value -- no geocoding source exists yet
 * to populate them.
 */
export interface AddressValue {
  addr_line1: string | null;
  addr_line2: string | null;
  addr_city: string | null;
  addr_region: string | null;
  addr_postcode: string | null;
  addr_country: CountryCode | null;
}

export const EMPTY_ADDRESS: AddressValue = {
  addr_line1: null,
  addr_line2: null,
  addr_city: null,
  addr_region: null,
  addr_postcode: null,
  addr_country: null,
};

const COUNTRY_OPTIONS: { value: CountryCode; label: string }[] = [
  { value: "GB", label: "United Kingdom (GB)" },
  { value: "US", label: "United States (US)" },
  { value: "CA", label: "Canada (CA)" },
];

const COUNTRY_NAME: Record<CountryCode, string> = {
  GB: "United Kingdom",
  US: "United States",
  CA: "Canada",
};

const REGION_LABEL: Record<CountryCode, string> = {
  GB: "County",
  US: "State",
  CA: "Province",
};

const POSTCODE_LABEL: Record<CountryCode, string> = {
  GB: "Postcode",
  US: "ZIP code",
  CA: "Postal code",
};

// Standard UK postcode format (the gov.uk-recommended pattern).
const GB_POSTCODE =
  /^(GIR 0AA|((([A-Z][0-9]{1,2})|(([A-Z][A-HJ-Y][0-9]{1,2})|(([A-Z][0-9][A-Z])|([A-Z][A-HJ-Y][0-9][A-Z]?))))\s?[0-9][A-Z]{2}))$/i;
// 5 digits, or ZIP+4 with a hyphen.
const US_ZIP = /^\d{5}(-\d{4})?$/;
// Letter-digit-letter, optional space, digit-letter-digit.
const CA_POSTAL = /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i;

const POSTCODE_PATTERN: Record<CountryCode, RegExp> = {
  GB: GB_POSTCODE,
  US: US_ZIP,
  CA: CA_POSTAL,
};

/**
 * Renders the structured fields as one human-readable line, in address
 * order, skipping any part that isn't filled in. Used to dual-write the
 * legacy free-text column alongside the structured addr_* fields -- see
 * each adopting component's save handler for the fallback rule (never
 * blank out an existing legacy value just because the structured fields
 * were left untouched).
 */
export function composeAddressString(value: AddressValue): string {
  const parts = [
    value.addr_line1,
    value.addr_line2,
    value.addr_city,
    value.addr_region,
    value.addr_postcode,
    value.addr_country ? COUNTRY_NAME[value.addr_country] : null,
  ];
  return parts
    .map((p) => p?.trim())
    .filter((p): p is string => !!p)
    .join(", ");
}

export interface AddressInputProps {
  value: AddressValue;
  onChange: (value: AddressValue) => void;
  /**
   * Shows the required-field asterisk on labels. Does not itself block
   * submission -- each adopting form does its own submit-time check on
   * `value`, matching how every other required field in these forms
   * already works.
   */
  required?: boolean;
  disabled?: boolean;
  /**
   * Optional read-only prior free-text value -- an existing legacy
   * column, or a stored profile location -- shown as helper text beneath
   * the fields. Never parsed into the structured fields; the user
   * retypes it if it's still correct.
   */
  legacyValue?: string | null;
  /** Disambiguates element ids if more than one AddressInput is ever mounted on the same page. */
  idPrefix?: string;
  className?: string;
}

export function AddressInput({
  value,
  onChange,
  required,
  disabled,
  legacyValue,
  idPrefix = "addr",
  className,
}: AddressInputProps) {
  const [postcodeWarning, setPostcodeWarning] = useState<string | null>(null);

  const country = value.addr_country;
  const fieldsDisabled = disabled || !country;

  const set = <K extends keyof AddressValue>(key: K, v: AddressValue[K]) =>
    onChange({ ...value, [key]: v });

  const handlePostcodeBlur = () => {
    if (!country) return;
    const raw = value.addr_postcode?.trim();
    if (!raw) {
      setPostcodeWarning(null);
      return;
    }
    // Normalise to uppercase on blur for GB and CA only -- US ZIP codes
    // are numeric and are never reformatted.
    const normalised = country === "GB" || country === "CA" ? raw.toUpperCase() : raw;
    if (normalised !== value.addr_postcode) {
      set("addr_postcode", normalised);
    }
    const valid = POSTCODE_PATTERN[country].test(normalised);
    setPostcodeWarning(
      valid
        ? null
        : `This doesn't look like a valid ${POSTCODE_LABEL[country]} for ${COUNTRY_NAME[country]} — you can still save it.`
    );
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-country`}>
          Country {required && <span className="text-destructive">*</span>}
        </Label>
        <Select
          value={country ?? undefined}
          onValueChange={(v) => onChange({ ...value, addr_country: v as CountryCode })}
        >
          <SelectTrigger id={`${idPrefix}-country`} disabled={disabled}>
            <SelectValue placeholder="Select country" />
          </SelectTrigger>
          <SelectContent>
            {COUNTRY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!country && (
          <p className="text-xs text-muted-foreground">Select a country to enter the rest of the address.</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-line1`}>
          Address line 1 {required && <span className="text-destructive">*</span>}
        </Label>
        <Input
          id={`${idPrefix}-line1`}
          value={value.addr_line1 ?? ""}
          onChange={(e) => set("addr_line1", e.target.value || null)}
          disabled={fieldsDisabled}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-line2`}>Address line 2 (optional)</Label>
        <Input
          id={`${idPrefix}-line2`}
          value={value.addr_line2 ?? ""}
          onChange={(e) => set("addr_line2", e.target.value || null)}
          disabled={fieldsDisabled}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-city`}>
          City {required && <span className="text-destructive">*</span>}
        </Label>
        <Input
          id={`${idPrefix}-city`}
          value={value.addr_city ?? ""}
          onChange={(e) => set("addr_city", e.target.value || null)}
          disabled={fieldsDisabled}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-region`}>
            {country ? REGION_LABEL[country] : "County / State / Province"}{" "}
            {required && <span className="text-destructive">*</span>}
          </Label>
          <Input
            id={`${idPrefix}-region`}
            value={value.addr_region ?? ""}
            onChange={(e) => set("addr_region", e.target.value || null)}
            disabled={fieldsDisabled}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-postcode`}>
            {country ? POSTCODE_LABEL[country] : "Postcode"}{" "}
            {required && <span className="text-destructive">*</span>}
          </Label>
          <Input
            id={`${idPrefix}-postcode`}
            value={value.addr_postcode ?? ""}
            onChange={(e) => set("addr_postcode", e.target.value || null)}
            onBlur={handlePostcodeBlur}
            disabled={fieldsDisabled}
          />
          {postcodeWarning && <p className="text-xs text-amber-600">{postcodeWarning}</p>}
        </div>
      </div>

      {legacyValue && (
        <p className="text-xs text-muted-foreground">
          Previously entered as: <span className="italic">{legacyValue}</span>
        </p>
      )}
    </div>
  );
}
