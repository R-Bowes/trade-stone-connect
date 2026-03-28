# TradeStone Manual QA Script: Enquiry → Paid Invoice (Homeowner + Contractor)

This is a complete non-developer, click-by-click QA script for validating the full TradeStone flow using **two browser windows**:
- **Window A**: Homeowner account
- **Window B**: Contractor account

It includes, for every step:
1. Exact action to take
2. Expected result in the app
3. What to verify in Supabase
4. What to verify in Stripe

---

## 0) Preconditions (do these once before testing)

### Actions
1. Open TradeStone in two separate browser windows (or one normal + one incognito).
2. Prepare two unique test emails:
   - `homeowner+<timestamp>@example.com`
   - `contractor+<timestamp>@example.com`
3. Have one sample image file ready (`.jpg` or `.png`, < 5MB).
4. In Stripe Dashboard, ensure you are in **Test mode**.
5. Keep these dashboards open in separate tabs:
   - Supabase project dashboard
   - Stripe dashboard

### Expected result
- You can sign in separately as each role without session clashes.

### Supabase checks
- None yet.

### Stripe checks
- Confirm “Viewing test data” toggle is ON.

---

## 1) Homeowner signs up and submits an enquiry with a photo

### Actions (Window A: Homeowner)
1. Go to Auth page.
2. Sign up as a **Homeowner** using the test homeowner email.
3. Complete any required onboarding fields.
4. Navigate to Personal Dashboard.
5. In enquiry form, fill:
   - Title: `QA Kitchen Leak <date/time>`
   - Description: `Leak under sink. Needs urgent repair.`
   - Postcode/location: realistic value
6. Upload 1 photo in “Photos (optional, up to 3)”.
7. Submit enquiry.

### Expected app result
- Success toast/message appears (e.g., enquiry submitted).
- The enquiry appears in homeowner list with status `new`.
- Photo count shows `1 photo(s)`.

### Supabase checks
In **Table Editor**:
1. `public.enquiries`
   - New row exists with matching `title`, `description`, `location`.
   - `homeowner_id` = homeowner profile/user ID.
   - `status` = `new`.
   - `enquiry_photo_paths` contains one path.
2. `storage.objects`
   - New object in bucket `enquiry-photos`.
   - Object path starts with `<enquiry_id>/...`.

### Stripe checks
- No Stripe object should be created at this stage.

---

## 2) Contractor receives and views the enquiry in real time

### Actions (Window B: Contractor)
1. Sign up/login as **Contractor** with contractor email.
2. Open Contractor Dashboard → Enquiries area.
3. Keep page open while homeowner submits enquiry (from step 1).
4. Observe whether new enquiry appears without refresh.

### Expected app result
- Real-time toast appears (“New enquiry received” or similar).
- New enquiry card appears at top with homeowner details, title, location, timestamp.

### Supabase checks
1. `public.enquiries`
   - Same enquiry row visible and unchanged except possible contractor-facing reads.
2. (Optional) if assigned flow exists in your environment:
   - `contractor_id` may be set if enquiry is direct-routed.

### Stripe checks
- No Stripe records expected.

---

## 3) Contractor creates and sends a quote

### Actions (Window B: Contractor)
1. Open the enquiry.
2. Start quote creation flow.
3. Fill quote details:
   - Quote title and scope matching enquiry
   - At least 2 line items (labor + materials)
   - Valid totals
   - Recipient email = homeowner email
4. Send the quote.

### Expected app result
- Quote appears in contractor quote list as `sent`/active.
- Confirmation toast appears.

### Supabase checks
1. `public.issued_quotes`
   - New row exists with:
     - `contractor_id` = contractor
     - `recipient_id` = homeowner user/profile ID (if populated by flow)
     - `client_email` = homeowner email
     - `items` JSON includes entered line items
     - `status` and/or `recipient_response` still unaccepted
2. If source enquiry is linked:
   - `public.enquiries.status` may move to `replied`.

### Stripe checks
- No payment intent/checkout session should exist yet.

---

## 4) Homeowner views and accepts the quote

### Actions (Window A: Homeowner)
1. Open homeowner dashboard section for received quotes.
2. Open the new quote.
3. Verify totals/line items.
4. Click **Accept**.

### Expected app result
- Quote shows badge/status `Accepted`.
- Success message appears.

### Supabase checks
1. `public.issued_quotes`
   - `recipient_response` = `accepted`
   - `responded_at` is populated.
2. Notification tables (if present) may get a new notification row for contractor.

### Stripe checks
- Still no payment object created by accepting a quote.

---

## 5) Job is automatically created and appears in contractor's job list

### Actions
1. Immediately after quote acceptance, switch to Window B.
2. Open/refresh Job Management.
3. Find newly created job.

### Expected app result
- New job appears automatically (typically status `scheduled`).
- Job title/scope aligns with accepted quote.

### Supabase checks
1. `public.jobs`
   - New row exists with:
     - `issued_quote_id` = accepted quote ID
     - `contractor_id` = contractor
     - `client_id` = homeowner
     - `status` = `scheduled`
     - `contract_value` = quote total

### Stripe checks
- No Stripe objects yet.

---

## 6) Contractor moves job to in_progress

### Actions (Window B)
1. In Job Management, open the new job card.
2. Move status from `scheduled` → `in_progress`.

### Expected app result
- Status chip updates to `In progress`.
- Transition persists after refresh.

### Supabase checks
1. `public.jobs`
   - Same job row now has `status = in_progress`.

### Stripe checks
- No Stripe changes expected.

---

## 7) Contractor logs timesheets for three days

### Actions (Window B)
1. Go to Timesheet Management.
2. Select the job.
3. For contractor row (and/or assigned worker), enter hours on 3 days in the selected week, e.g.:
   - Mon: 7.5
   - Tue: 8.0
   - Wed: 6.5
4. Wait for each cell save to complete.

### Expected app result
- Entered values remain after tab switch/refresh.
- Weekly total updates correctly.

### Supabase checks
1. `public.timesheets`
   - Three rows exist for same `job_id` + `worker_id` and distinct `date`s.
   - `hours` match entered values.
   - `approved` initially false.

### Stripe checks
- No Stripe impact.

---

## 8) Contractor approves the timesheet

### Actions (Window B)
1. In same week grid, click **Approve** for worker row.

### Expected app result
- Approval button switches to `Approved`.
- Cells become non-editable (locked).

### Supabase checks
1. `public.timesheets`
   - Rows in selected week for that `job_id` + `worker_id` now have `approved = true`.

### Stripe checks
- No Stripe impact.

---

## 9) Contractor adds a snag item and resolves it

### Actions (Window B)
1. In Job Management, move job to `snagging` if needed.
2. Add snag item: `Sealant touch-up behind sink`.
3. Mark snag as resolved.

### Expected app result
- Snag item appears in list, then shows resolved state.

### Supabase checks
1. `public.job_snag_items`
   - New row with `job_id`, `title`, `is_resolved = false` on creation.
   - Same row updates to `is_resolved = true` with `resolved_at` timestamp after resolve.

### Stripe checks
- No Stripe impact.

---

## 10) Contractor moves job to complete

### Actions (Window B)
1. Change job status from `snagging` → `complete`.

### Expected app result
- Status updates to `Complete`.
- If unresolved snags existed, app would block; with all resolved it should pass.

### Supabase checks
1. `public.jobs`
   - `status = complete` for test job.

### Stripe checks
- No Stripe impact.

---

## 11) Contractor generates and sends an invoice

### Actions (Window B)
1. From completed job, click **Generate Invoice**.
2. Confirm line items (quote + approved rechargeables if present).
3. Set due date.
4. Send invoice.

### Expected app result
- Invoice appears in contractor invoices list as `sent`/`pending`.
- Shareable payment link exists (`/pay/<invoice_id>` pattern).

### Supabase checks
1. `public.invoices`
   - New row with:
     - `contractor_id` = contractor
     - `client_id`/`recipient_id` = homeowner
     - `job_id` = completed job
     - `status` = `pending` (or app-equivalent sent state)
     - totals/subtotal/tax populated
     - `stripe_payment_intent_id` populated after send action (if created then)
2. If your flow logs notifications:
   - New invoice notification row exists.

### Stripe checks
1. Stripe **PaymentIntents** (or Checkout Sessions depending configured flow):
   - A new test payment object exists for invoice amount.
   - Metadata includes invoice and contractor references.
2. If Connect is enabled:
   - Destination connected account should be contractor account.

---

## 12) Homeowner pays the invoice via Stripe (test card 4242 4242 4242 4242)

### Actions (Window A)
1. Open received invoice or direct payment link.
2. Click pay.
3. In Stripe payment page, use:
   - Card number: `4242 4242 4242 4242`
   - Any future expiry date
   - Any CVC
   - Any postcode
4. Submit payment.

### Expected app result
- Payment succeeds with Stripe success confirmation.
- Returning to app shows invoice paid (or pending then paid after webhook delay).

### Supabase checks
1. `public.invoices`
   - `status` updates to `paid`.
   - `paid_date` populated.
   - `recipient_response` may update to `paid` if your UI writes it.
2. (Optional) payments/audit table if implemented should show settlement event.

### Stripe checks
1. Payment object shows `succeeded`.
2. Event log contains success event (`payment_intent.succeeded` and/or checkout completion).

---

## 13) Contractor sees invoice marked as paid

### Actions (Window B)
1. Open contractor invoices list.
2. Refresh once if needed.

### Expected app result
- Invoice status badge is `Paid`.
- Revenue/pending KPI cards update accordingly.

### Supabase checks
1. `public.invoices`
   - Same invoice remains `paid`.

### Stripe checks
- Payment remains succeeded; no disputes/failed capture.

---

## 14) Stripe platform fee is visible in Stripe dashboard

### Actions (Stripe Dashboard)
1. Open the payment linked to this invoice.
2. Open transfer/application fee details.

### Expected result
- Platform fee value is present (non-null and expected percent/amount).

### Supabase checks
- Typically none required unless you mirror fee data in DB.

### Stripe checks
1. In payment details:
   - `application_fee_amount` is present.
   - Destination charge/transfer data references contractor connected account.
2. In balance transactions, fee amount matches expected calculation.

---

## 15) End-to-end pass criteria (quick summary)

The test **passes** only if all are true:
1. Enquiry created with photo path stored.
2. Contractor receives enquiry in real time.
3. Quote sent and accepted.
4. Job auto-created from accepted quote.
5. Job progresses to in-progress → snagging → complete.
6. 3 days of timesheets saved and approved.
7. Invoice sent and paid through Stripe test card.
8. Contractor sees paid status.
9. Stripe shows succeeded payment + platform fee.

---

## Top 5 likely failure points + what to check

## 1) Real-time enquiry does not appear for contractor
- **Symptoms:** Contractor must refresh manually; no toast.
- **Check:**
  - Supabase Realtime subscription exists for `public.enquiries` INSERT.
  - Enquiry row has visibility conditions met (`status='new'`, contractor routing logic).
  - Browser console for Realtime/WebSocket errors.

## 2) Photo upload fails on enquiry submission
- **Symptoms:** Enquiry saves but no photo, or submission errors.
- **Check:**
  - `storage.objects` has/has not created file under `enquiry-photos`.
  - `enquiry_photo_paths` on `public.enquiries` updated after upload.
  - File type/size within allowed limits.
  - Storage RLS policy allows homeowner on path `<enquiry_id>/...`.

## 3) Accepting quote does not auto-create job
- **Symptoms:** Quote accepted but no job appears.
- **Check:**
  - `public.issued_quotes.recipient_response = accepted`.
  - Insert into `public.jobs` attempted and succeeded.
  - RLS policy permits homeowner acceptance flow to insert job row.
  - UI catches and logs job creation errors in console.

## 4) Invoice marked pending forever after successful Stripe payment
- **Symptoms:** Stripe says succeeded, app still shows pending.
- **Check:**
  - Stripe webhook endpoint configured and receiving events.
  - Relevant webhook event delivered successfully (no 4xx/5xx).
  - Webhook handler can match `invoiceId` metadata to DB invoice row.
  - `public.invoices.status` and `paid_date` update query succeeds under service role.

## 5) Platform fee missing in Stripe payment
- **Symptoms:** Payment succeeded but fee is 0/null.
- **Check:**
  - PaymentIntent created with application fee amount.
  - Connect destination account is present and valid.
  - Fee config/env vars are set in deployed edge function.
  - Payment was created by the intended invoice flow (not a bypass/manual payment).

---

## Suggested evidence to capture during QA

For each major milestone, save a screenshot:
1. Homeowner submitted enquiry with photo count.
2. Contractor real-time enquiry arrival.
3. Quote sent and quote accepted.
4. Auto-created job and status transitions.
5. Timesheet entries + approval.
6. Snag item created/resolved.
7. Invoice sent.
8. Stripe successful payment screen.
9. Contractor invoice marked paid.
10. Stripe fee breakdown.

This makes regression triage dramatically faster.
