# LOCATION-AUDIT.md

STEP-0 SCHEMA AUDIT: STRUCTURED LOCATION CAPTURE
Read-only. Queried the live database (project ref `tnvxfzmdjpsswjszwbvf`) via
`npx supabase db query --linked` against `information_schema` / `pg_catalog`,
plus direct source reads for code-path questions. No files modified, no
migrations written.

---

## A. CONTRACTOR SIDE

### A1. Location-related columns on `profiles` (live)

| column | type | nullable | default | non-null rows (of 7) |
|---|---|---|---|---|
| `address` | text | YES | — | 1 |
| `location` | text | YES | — | 2 |
| `postcode` | text | YES | — | 1 |
| `coverage_type` | text | NO | `'radius'` | 7 |
| `service_area_center_lat` | numeric | YES | — | 1 |
| `service_area_center_lng` | numeric | YES | — | 1 |
| `service_area_radius_miles` | integer | YES | — | 1 |
| `working_radius` | text | YES | — | 1 |
| `country_code` | text | NO | `'GB'` | 7 |

Table has 7 total rows. Only one contractor has a fully populated
geocoded service area (postcode, lat/lng, radius all set); two have a
free-text `location` at all.

### A2. `public_pro_profiles` view — exposed vs excluded

Exposes: `id, user_id, full_name, company_name, ts_profile_code, user_type,
location, working_radius, bio, trades, avatar_url, logo_url, is_verified,
is_available, hourly_rate, years_experience, rating, review_count,
completed_jobs, is_active, created_at, updated_at, profile_is_published,
cover_url, cta_label, social_links, service_area_center_lat,
service_area_center_lng, service_area_radius_miles, postcode,
coverage_type`.

Deliberately excludes: `address` (full free-text business address —
correctly withheld from the public directory) and `country_code`. The
`country_code` exclusion looks unintentional rather than deliberate — see
§E20.

### A3. `service_area_center_lat` / `_lng`

1 row populated of 7. Written from `src/hooks/useContractors.ts`'s
`geocode-postcode` edge-function client in two places:
`src/pages/ContractorOnboarding.tsx` (`handlePostcodeBlur`, on postcode-field
blur during onboarding) and `src/components/management/ProfileManagement.tsx`
(same pattern, on profile edit). Both persist `service_area_center_lat/_lng`
directly off the edge function's response; nothing else writes these columns
(no trigger, no DB default).

### A4. `coverage_type` distribution

All 7 profile rows: `radius` (7). No `national` or any other value present
in live data, even though the app code (`useContractors.ts`) has a fully
built `national` branch — it's simply unused so far.

### A5. `service_area_radius_miles` distribution, and `working_radius`

Distribution: `15` miles (1 row), `NULL` (6 rows).

**`working_radius` is NOT unreferenced in `src/` — the audit question's
premise is wrong; confirmed by grep, not assumed.** It is written, read, and
*displayed* in 9 files. Specifically:
- Written as a derived display string (`` `${service_area_radius_miles} miles` ``)
  alongside the numeric `service_area_radius_miles` in `ProfileManagement.tsx`
  and `ContractorOnboarding.tsx` — `CanvasEditor.tsx:13`'s own comment states
  the intent precisely: *"service_area_radius_miles is now canonical
  (Step-0 audit: working_radius deprecation note) — working_radius stays
  written [for now]."*
- Read and rendered in `CanvasEditor.tsx:448` ("...covering a **{radius}**
  radius") and selected in `ProfileEditor.tsx:157` / `ContractorDashboard.tsx:1546`.
- **Genuinely unreferenced only in `useContractors.ts`'s search/ranking
  logic** — `ProfileManagement.tsx:47`'s own comment confirms: *"working_radius
  text label was collected but never used in search."* That narrower claim is
  true; the broader "unreferenced in src/" claim is not.

---

## B. DIRECTORY SEARCH — THE BOURNEMOUTH PROBLEM

**Correction to the audit's framing: this is materially better than a naive
string-match search already implies.** `src/hooks/useContractors.ts` (as of
the current build) does real geocoding + haversine distance, not just ILIKE.

### B6/B7. What the "Location or postcode" field queries against

File: `src/components/ContractorDirectory.tsx` (the input) →
`src/hooks/useContractors.ts` (the query logic), querying `public_pro_profiles`.

Both — the code branches on whether the typed string is shaped like a full
UK postcode:

- `UK_POSTCODE_REGEX = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i` (full postcode
  shape only, not a bare outcode) — if it matches, the term is sent to the
  `geocode-postcode` edge function, resolved to lat/lng via postcodes.io, and
  distance is calculated: contractors are bounding-box prefiltered on
  `(service_area_center_lat, service_area_center_lng)` then exact haversine
  distance is computed client-side against each contractor's own
  `service_area_radius_miles`. Rank 1 = within 5 miles ("home area"), rank 2
  = within their stated radius, rank 3 = `coverage_type = 'national'`.
- If the geocode fails (place name, malformed/unrecognised postcode, or a
  transient postcodes.io failure) **or** a matching contractor has no usable
  coordinates yet, it falls back to `ILIKE '%term%'` on `location` (rank 4,
  or the sole path when nothing resolved). ILIKE is a contains-match, not
  exact or prefix-only.

### B8. "Bournemouth" search against a contractor whose `location` = "Southampton" who would travel there

Confirmed from code, not assumed:
- If the contractor has `service_area_center_lat/_lng` + `service_area_radius_miles`
  set (radius big enough to cover the Southampton–Bournemouth distance,
  ~24 miles), a geocode-resolvable "Bournemouth" search **would** surface
  them at rank 2 — the actual distance-vs-radius calculation is what runs,
  not a text match on `location`.
- If that contractor has **not** geocoded (no lat/lng, or no postcode ever
  set/blurred — true for 6 of the 7 live profile rows today, §A3), the
  search falls into the rank-4 ILIKE fallback, which does `location ILIKE
  '%Bournemouth%'`. Their `location` string is "Southampton" — this does
  **not** contain "Bournemouth", so **they are missed**, exactly as the
  audit's premise describes. So the gap is real, but scoped: it only bites
  un-geocoded contractors (currently the large majority of live rows), not
  the search design itself.
- If "Bournemouth" isn't a full postcode (a bare place name, which it is
  here), `UK_POSTCODE_REGEX` never matches, so the geocode call is never
  attempted regardless — postcodes.io can't resolve a place name to begin
  with (code comment at `useContractors.ts:44-49` states this explicitly).
  Only a postcode search (e.g. "BH1 1AA") can ever hit the distance-ranked
  path. **A place-name-only search always goes straight to the rank-4 ILIKE
  fallback for every contractor, geocoded or not** — this is the actual gap:
  place-name search never benefits from the geometry logic at all, only
  postcode search does.

### B9. Every geocoding call in the codebase

One, client-invoked, server-executed: `supabase/functions/geocode-postcode/index.ts`.
- API: `postcodes.io` (`https://api.postcodes.io/postcodes/{postcode}`) — free,
  no API key, no key storage anywhere (confirmed: no `POSTCODES_IO` or similar
  secret referenced in the function or `.env.example`).
- Called from: `src/hooks/useContractors.ts` (directory search),
  `src/pages/ContractorOnboarding.tsx` (`handlePostcodeBlur`), and
  `src/components/management/ProfileManagement.tsx` (`handlePostcodeBlur`).
- The edge function requires an authenticated caller (validates the JWT via
  `auth.getUser()` before calling postcodes.io) — an anonymous visitor
  browsing the public directory and typing a postcode still triggers this
  call as an authenticated request from whatever session context invokes it;
  unauthenticated calls get a 401 and fall back to ILIKE.

### B10. Location search vs trade filter — composition

Independent, then combined via `AND` at the query level. `useContractors.ts`'s
`baseQuery()` builds trade + name/company/code filtering identically on every
location branch (`.eq("user_type", "contractor")`, `.eq("profile_is_published",
true)`, optional `.or(...)` for name/company/TS-code search, optional `.or(...)`
for trade). The location logic (geocode/haversine or ILIKE) is layered as
**additional** `.eq()`/`.not()`/`.gte()`/`.lte()`/`.ilike()` calls appended to
that same base query — never a separate query merged client-side. So a
search with both a trade and a location term returns only contractors
matching both.

---

## C. JOB AND QUOTE LOCATION (the actual gap)

### C11. `jobs.location` / `issued_quotes.client_address`

| column | type | nullable | non-null rows |
|---|---|---|---|
| `jobs.location` | text | YES | 1 of 15 |
| `issued_quotes.client_address` | text | YES | 0 of 22 |

**Every live `issued_quotes` row has a NULL `client_address`.** Write paths
found in `src/` and `supabase/functions/`:
- `jobs.location`: written exclusively by the `mint_job_from_quote` RPC (see
  §C15) — no client-side `INSERT`/`UPDATE` of `jobs.location` found anywhere
  in `src/` (job creation is server-side only, per CLAUDE.md's "job creation
  is a manual mint" section — the RPC replaced the old
  `createJobFromQuote.ts`, which no longer exists).
- `issued_quotes.client_address`: per `mint_job_from_quote`'s own comment,
  intended to be written by `SendQuoteDialog.tsx` at quote-send time
  ("now written at quote-send time by SendQuoteDialog.tsx"). Grepped
  `SendQuoteDialog.tsx` — **no `client_address` write found in the current
  file.** This is either stale-comment drift or a field that predates the
  current send flow; either way it explains the 0-of-22 non-null count above
  directly — the comment describes an intent that the live code doesn't
  currently fulfil. Flag for follow-up; not fixed here (read-only audit).

### C12. `enquiries` location columns and write path

Columns: `location text NOT NULL` (free text — no lat/lng, no postcode
column on `enquiries` itself), plus `company_id`, `site_id`, `asset_id`
(uuid, all nullable — the B2B linkage added in 20260612120000) and
`country_code text NOT NULL DEFAULT 'GB'` (20260811090000).

`location` is required at the DB level (`NOT NULL`) — every enquiry must
carry a free-text location string regardless of whether `site_id` is also
set. No DB-level cross-check ties `location` to the linked site's actual
address (consistent with CLAUDE.md's documented app-enforced-only
`site_id`↔`company_id` consistency rule).

### C13. Tenders — structured location, free text, or inherited from sites?

**Neither directly on `tenders` — inherited from sites, exclusively.** The
`tenders` table (full column list pulled from live DB) has **no** location
column at all — no `location`, `address`, `postcode`, or lat/lng. It carries
only `site_visit_required boolean NOT NULL`. Location comes entirely through
the `tender_sites` join table (`tender_id`, `site_id NOT NULL` — confirmed
`site_id` is `NOT NULL` on `tender_sites`), which resolves to `sites`' own
address columns (§C14).

**Separate finding, not asked for directly but load-bearing for this
question:** `src/pages/TenderDetail.tsx` (route `/projects/:id`) does **not**
query the `tenders`/`tender_sites` tables at all — it queries a different,
live, currently-**empty** table called `projects`
(`.from("projects").select("...city, postcode...")`, `TenderDetail.tsx:151-158`).
`projects` is a separate legacy tendering system with its own structured
address columns (`address_line_1`, `address_line_2`, `city`, `postcode` —
see full DDL below) that predates the current `tenders`/`T-`/`TA-`/`TE-`
system CLAUDE.md documents. CLAUDE.md already flags `enquiries.project_id`
as "pre-Projects experimentation... untouched; do not assume its semantics
until Projects work begins" — this confirms that system is still live code
(a protected route, `App.tsx:144`) even though the table itself holds 0 rows
today. **Two parallel, structurally different location models for tendering
currently coexist in the live app**: `tenders`→`tender_sites`→`sites` (no
direct location columns, current) and `projects` (direct
`address_line_1/2`/`city`/`postcode` columns, legacy, 0 rows, but still
reachable via a live route). Worth resolving before building anything new on
either.

`projects` full DDL (location-relevant columns only, live):
`address_line_1 text NULL`, `address_line_2 text NULL`, `city text NULL`,
`postcode text NULL`. No `country_code` column on `projects` either.

### C14. `sites` — full DDL, referencing tables, nullability

Full column list (live): `id uuid NOT NULL`, `company_id uuid NOT NULL`,
`name text NOT NULL`, `address text NOT NULL`, `postcode text NOT NULL`,
`is_active boolean`, `created_at`, `updated_at`, `reference text`,
`address_line1 text`, `address_line2 text`, `city text`, `notes text`,
`created_by uuid`, `status text NOT NULL`, `ts_site_code text NOT NULL`.

**`sites` has no `country_code` column** — the only Tier-A/address-bearing
table 20260811090000 did *not* touch. See §E20/§E22 — this means a site's
country cannot currently be read off the row itself.

Note the address duplication already live on this one table: both a single
free-text `address` (`NOT NULL`) **and** structured `address_line1` /
`address_line2` / `city` (all nullable) coexist. CLAUDE.md documents
`address_line1/2, city, postcode, notes, status, created_by` as "canonical"
per migration 20260612120000, but the older plain `address` column is still
`NOT NULL` and still live — not dropped, not deprecated in any comment found.

Tables referencing `site_id` (12 total, nullability per live schema):
`assets.site_id NOT NULL`, `engagement_ppm_schedules.site_id`,
`engagement_sites.site_id`, `enquiries.site_id` (nullable),
`jobs.site_id` (nullable), `service_contracts.site_id`,
`service_requests.site_id`, `site_autonomy_config.site_id`,
`site_contacts.site_id`, `site_group_members.site_id`,
`tender_sites.site_id NOT NULL`, `work_orders.site_id`.

### C15. `mint_job_from_quote` — does it copy free text or resolve via site_id?

**Both, in a deliberate priority order — copies free text primarily, with
`site_id` FK carried alongside but not used to derive the text.** Relevant
lines, quoted directly from the live function body:

```sql
-- Site address: prefer the quote's own client_address (now written at
-- quote-send time by SendQuoteDialog.tsx), fall back to the source
-- enquiry's location for quotes issued before that fix. NULL only when
-- neither exists (no enquiry at all) — genuinely no data upstream.
v_location := COALESCE(v_quote.client_address, v_enquiry.location);
...
INSERT INTO public.jobs (
  contractor_id, customer_id, issued_quote_id, title, description, location,
  status, contract_value, start_date, scheduled_start,
  company_id, site_id, asset_id
) VALUES (
  v_quote.contractor_id, v_quote.recipient_id, p_quote_id,
  v_title, v_quote.description, v_location,
  'scheduled', v_quote.total,
  v_confirmed_event.start_time::date, v_confirmed_event.start_time,
  v_enquiry.company_id, v_enquiry.site_id, v_enquiry.asset_id
)
```

So `jobs.location` is always a plain string, copied from
`issued_quotes.client_address` (falling back to `enquiries.location`) —
never resolved through `sites`' structured columns even when `site_id` is
present on the same insert. `jobs.site_id` is populated (from the enquiry)
purely as an FK for other features (asset/company scoping, compliance,
etc.) — it is not consulted to build the `location` text at all. Given
§C11's finding that `client_address` is 0-of-22 populated live, `v_location`
resolves to `enquiry.location` (or NULL, if there's no enquiry) for every
job minted so far.

---

## D. DISPLAY AND EXISTING UX

### D16. Every place `src/` displays a job or contractor location

- `src/components/management/JobManagement.tsx:945` — contractor's own job
  detail card, full `jobs.location` string with a `MapPin` icon, guarded
  `{selectedJob.location && (...)}` (nothing shown if null).
- `src/components/contractor/EnquiryDetailSheet.tsx:301` — enquiry detail,
  `{enquiry.location || "—"}`.
- `src/components/ContractorDirectory.tsx` (via `ContractorCard`, mapped at
  `ContractorDirectory.tsx:154`) — `contractor.location ?? ""` on directory
  cards.
- `src/pages/ContractorProfile.tsx` — public contractor profile
  (`working_radius` display confirmed at line 1011's select list;
  `location` is part of the same profile object rendered on this page).
- `src/pages/TenderDetail.tsx:359,429-432` — `[tender.city, tender.postcode]`
  joined, but reading from the legacy `projects` table (§C13), not `tenders`.
- `src/components/profile/CanvasEditor.tsx:448` — "Based in **{location}**,
  covering a **{working_radius}** radius" composed display string on the
  contractor's editable public-profile canvas.

Not found: any display of `jobs.location`, `enquiry.location`, or
contractor `location` resolved to structured components (town/postcode
broken out) anywhere — every display is the single free-text string as
stored, or (for tenders/projects) a two-field join of `city`+`postcode`.

### D17. Is a job's location visible to contractors browsing open work before award?

**No open/unassigned job-browsing screen exists to test this against.**
Per CLAUDE.md's own B2B-enquiry note: *"There is no open/unassigned
contractor SELECT arm on the live enquiries table... business-created
enquiries should have `contractor_id` set (a panel contractor pick) at
creation."* Grepped for an open-work/marketplace browsing surface
(`WorkOrderInbox.tsx`, `ServiceRequestQueue.tsx`, `TenderDetail.tsx`) — these
all show location, but only to a contractor already on the relevant panel
(`WorkOrderInbox.tsx`) or with an invited/joined access path
(`TenderDetail.tsx`'s `projects`/`tenders` flows) — full address/structured
location visible at that point, not redacted to town-only. There is no
"blind" pre-award browsing tier in this codebase today where a job's precise
location must be withheld — the granularity question therefore doesn't
currently arise; every screen that shows a job at all shows the full stored
`location` string.

---

## E. COUNTRY DIMENSION

### E18. `geocode-postcode` edge function — full behaviour

`supabase/functions/geocode-postcode/index.ts`. Requires a valid JWT
(`Authorization: Bearer <token>`, validated via `serviceClient.auth.getUser`)
— returns 401 otherwise. Takes `{ postcode: string }`, URL-encodes it
unchanged (no pre-validation regex inside the function itself — see §E19 for
where that validation actually lives, which is client-side, not here) and
calls `https://api.postcodes.io/postcodes/{postcode}`. Maps `404` → 422 "not
recognised", `429` → 429 rate-limit message, non-OK/non-JSON → 502, success →
`{ latitude, longitude, admin_district, outcode }`. Does not write to any
table itself (pure resolve-and-return, per its own header comment).

**Confirmed UK-only by construction**: postcodes.io's `/postcodes/{postcode}`
endpoint is a UK Royal Mail PAF-derived postcode lookup with no other-country
mode — there is no country parameter anywhere in the call, and the function
has no branch for any other geocoding provider. A US ZIP code or Canadian
postal code passed to this function will simply 404 against postcodes.io
(read as "not recognised", identical UX to a typo) — there is no country
routing logic to catch that distinction. This function cannot resolve a
non-UK address today.

### E19. Postcode validation regexes — file, line, pattern

Exactly one, found by direct grep for the actual pattern shape (not the word
"postcode", which false-matches unrelated things across 50+ files):

```
src/hooks/useContractors.ts:50
const UK_POSTCODE_REGEX = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
```

Used only to decide whether a directory-search term is *shaped* like a full
UK postcode before attempting a geocode call (§B7) — not used as a
form-field validator anywhere. **No postcode format validation exists on
either the `ContractorOnboarding.tsx` or `ProfileManagement.tsx` postcode
input** — both fields are `required` (non-empty) only; any string, UK-shaped
or not, is accepted and persisted to `profiles.postcode`, and geocoding is
attempted regardless (postcodes.io will simply fail/404 on a non-UK string,
producing the "wasn't recognised" error rather than a country-aware message).

### E20. Which tables carry `country_code` (post-20260811090000), and can sites/jobs/enquiries resolve to a country?

Confirmed live, columns are `NOT NULL DEFAULT 'GB'` on all seven, with a
`CHECK (country_code IN ('GB','US','CA'))` and, on the three money tables,
an additional country↔currency pairing check:

`profiles`, `companies`, `jobs`, `enquiries`, `issued_quotes`, `invoices`,
`payments`.

**Not present on: `sites`, `tenders`, `projects`, `assets`.**

- `jobs` and `enquiries` **can** resolve to a country today — directly, off
  their own `country_code` column (defaulted `'GB'`, immutable via
  `prevent_country_currency_change()` trigger).
- `sites` **cannot** — no column at all. A site's country must currently be
  inferred (there is nothing to infer it *from* — `sites` carries no country
  signal whatsoever, not even indirectly via `companies.country_code`
  through a join that anything in `src/` actually performs). Given `jobs`
  and `enquiries` both carry `site_id` (nullable) *and* their own
  `country_code`, a job/enquiry with a site in one country and its own
  `country_code` stamped from a different signal (e.g. the creating user's
  profile) could silently disagree with its site — no constraint ties them
  together. Not observed in live data (only 1 `sites` row, `GB`-only
  dataset) but structurally possible from the schema alone.
- `public_pro_profiles` excludes `country_code` from its public projection
  (§A2) even though the base `profiles` table now carries it — this looks
  like an oversight relative to the rest of the migration's intent (Tier A =
  "the tables an address/location feature would need," per the migration's
  own comment), not a deliberate redaction like `address` is.

### E21. Places assuming a UK address shape

- `src/pages/ContractorOnboarding.tsx:318-340` and
  `src/components/management/ProfileManagement.tsx:426-436` — both label
  the field literally "Postcode" / "Your postcode", both use the UK-format
  placeholder `"M1 1AE"`, and both trigger a UK-only geocode
  (`geocode-postcode`) on blur. No "ZIP / postal code" alternate label, no
  country selector to branch the placeholder or the geocode call.
- `src/pages/BusinessSettings.tsx:254` — phone field placeholder
  `"+44 7700 000000"` (UK mobile shape hard-coded into the placeholder
  text; the field itself is free text, not validated to this shape).
- `supabase/functions/create-connect-account/index.ts:110` — Stripe Connect
  account creation hard-codes `country: "GB"` for every contractor's Express
  account, regardless of `profiles.country_code`. This is a real
  country-assumption bug-in-waiting the moment `country_code` ever becomes
  non-`'GB'` for a live signup — Stripe Connect account country cannot be
  changed after creation, so this is not a display-only issue.
- **Not found**: any address form with a distinct "County" field, or a
  fixed multi-line UK address block. `ContractorOnboarding.tsx`'s business
  address is a single free-text field (`"14 Maple Street, Manchester"`
  placeholder) — no line-count or county assumption baked into the form
  structure itself, only the postcode/phone spots above.

### E22. Other stored country data

- `profiles.country_code`, `companies.country_code`, `jobs.country_code`,
  `enquiries.country_code`, `issued_quotes.country_code`,
  `invoices.country_code`, `payments.country_code` — all `'GB'`-defaulted,
  covered in §E20.
- `create-connect-account/index.ts`'s hard-coded Stripe `country: "GB"`
  (§E21) — the only Stripe-account country data point found; it is written,
  not merely read, and is not sourced from any `country_code` column.
- No phone country-code field (the `+44` above is placeholder text inside a
  free-text `phone` column, not a separate country-code field/dropdown).
- NOT PRESENT: any other country field, ISO country dropdown, or stored
  geo-country reference beyond what's listed above.

---

## F. HOUSEKEEPING

### F23. Highest applied migration timestamp

`20260811090000` (`supabase_migrations.schema_migrations`, live, matches the
filename of the country_code/currency migration read in full above). Next
four most recent, for context: `20260810120000`, `20260808140000`,
`20260808130000`, `20260808120000`.

### F24. `trade_averages.region` — live row count and distinct values

31 rows total. **`region` is `NULL` on all 31 rows** — zero distinct
non-null values. Whatever regional pricing/averages feature this column was
built for is entirely unpopulated in live data today.

### F25. Postcode/ZIP reference data

**NOT PRESENT.** Searched `information_schema.tables` for any table named
suggestively of postcode districts, towns, provinces, states, or regions —
zero matches. The only geographic resolution mechanism in the entire system
is the external postcodes.io API call (§E18) — there is no local lookup
table of UK postcode districts, US ZIP codes, or any other region/state
reference data anywhere in the database.

---

## Summary of items that contradict CLAUDE.md or the audit's own framing

1. **`working_radius` is not "genuinely unreferenced"** (§A5) — it's
   actively written and displayed in 9 files; only its use *inside the
   search/ranking query* is retired, which is a narrower and already
   correctly-commented fact in the code itself.
2. **The directory search is not naive string matching** (§B) — real
   geocoding + haversine distance ranking already exists and is wired up;
   the actual residual gap is (a) contractors who haven't geocoded yet
   (6 of 7 live rows) falling back to ILIKE, and (b) place-name searches
   (as opposed to postcode searches) never reaching the geometry path at
   all, by design.
3. **Two parallel tendering/location models coexist live** — `tenders` (no
   location columns, resolves via `tender_sites`→`sites`) and `projects`
   (direct `address_line_1/2`/`city`/`postcode`, 0 rows, but still served by
   a live protected route, `TenderDetail.tsx` via `/projects/:id`). CLAUDE.md
   flags `project_id` as pre-existing/unexplored but does not flag that the
   UI still actively queries it.
4. **`mint_job_from_quote`'s own inline comment describes a write path
   (`SendQuoteDialog.tsx` writing `client_address`) that doesn't appear to
   exist in the current file** — consistent with `client_address` being
   0-of-22 populated live.
5. **`sites` was not included in the 20260811090000 country_code rollout**,
   despite `jobs`/`enquiries` (which both reference `site_id`) all getting
   it — a site's country cannot be read off its own row today.
6. **`public_pro_profiles` excludes `country_code`** even though it's now a
   `profiles` column — looks like an oversight, not a deliberate redaction
   like the `address` exclusion clearly is.
7. **Stripe Connect account creation hard-codes `country: "GB"`**
   (`create-connect-account/index.ts:110`), independent of
   `profiles.country_code` — a live landmine for the day `country_code` is
   first used non-UK, since Stripe Connect account country is immutable
   post-creation.