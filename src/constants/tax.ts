// UK tax constants used across the Contractor Finance feature.
//
// TODO: these are hardcoded UK-only values, consistent with the rest of the
// platform's current UK-only scope (see CLAUDE.md, I18N-AUDIT.md). When
// multi-country support is built, this should move into a config table
// (e.g. a country-keyed row in `platform_settings`, which already exists as
// a generic key/value table — see FINANCE-AUDIT.md Section C3) rather than
// living as a source constant. Centralising it here first is the
// prerequisite for that move, not a replacement for it.

/**
 * UK VAT registration threshold — rolling 12-month taxable turnover past
 * which a business must register for VAT (HMRC). Current as of the 2024/25
 * tax year. Re-verify against HMRC guidance before assuming this is still
 * current in a later tax year — this is not date-scoped, so it will not
 * warn you when it goes stale.
 */
export const UK_VAT_REGISTRATION_THRESHOLD = 90000;
