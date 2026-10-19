// Route inventory for the mobile layout audit.
// Source of truth: src/App.tsx (top-level routes) and the ?view= switches in
// ContractorDashboard / BusinessDashboard / HomeownerDashboard.

export const BASE_URL = process.env.AUDIT_BASE_URL ?? "http://localhost:8080";

export const WIDTHS = [320, 375, 390, 430];
export const DESKTOP_WIDTHS = [768, 1280];

// Known public test contractor (CLAUDE.md "Key IDs").
const TEST_CONTRACTOR_CODE = "TS-C-4AE203";

export const PUBLIC_ROUTES = [
  "/",
  "/contractors",
  "/contracts",
  "/how-it-works",
  `/contractor/${TEST_CONTRACTOR_CODE}`,
  "/marketplace",
  "/marketplace/materials",
  "/marketplace/equipment",
  "/marketplace/tools",
  "/marketplace/item/00000000-0000-0000-0000-000000000000",
  "/auth",
  "/login",
  "/terms",
  "/privacy",
  "/cookies",
  "/about",
  "/pay/00000000-0000-0000-0000-000000000000",
  "/reset-password",
  "/invite",
  "/admin/login",
  "/this-route-does-not-exist",
];

const CONTRACTOR_VIEWS = [
  "dashboard", "enquiries", "issued-quotes", "jobs", "projects", "work-orders",
  "engagements", "messages", "rams-templates", "checklist-templates", "schedule",
  "service-visits", "team", "availability", "timesheets", "inventory", "invoices",
  "finance-settings", "clients", "photos", "documents", "canvas-editor",
  "share-profile", "business-card-editor", "verification", "my-scores", "tenders",
  "contracts", "panel-invites", "panel-compliance", "ppm-visits", "profile", "settings",
];

const BUSINESS_VIEWS = [
  "dashboard", "jobs", "projects", "work-orders", "service-requests", "requests",
  "approvals", "tenders", "tender-form", "sites", "assets", "groups", "ppm-compliance",
  "site-autonomy", "service-categories", "site-contacts", "panel", "invoices", "billing",
  "spend", "messages", "team", "settings",
];

const PERSONAL_VIEWS = [
  "dashboard", "projects", "jobs", "quotes", "enquiries", "hire", "invoices", "messages", "settings",
];

export const ACCOUNT_ROUTES = {
  contractor: [
    ...CONTRACTOR_VIEWS.map((v) => `/dashboard/contractor?view=${v}`),
    "/dashboard/contractor?view=dashboard#audit-tour",
    "/kpi-insights",
    "/business",
    "/notifications",
    "/onboarding/contractor",
    "/field",
    "/site-portal",
  ],
  business: [
    ...BUSINESS_VIEWS.map((v) => `/dashboard/business?view=${v}`),
    "/dashboard/business/settings",
    "/notifications",
    "/site-portal",
  ],
  personal: [
    ...PERSONAL_VIEWS.map((v) => `/dashboard/homeowner?view=${v}`),
    "/notifications",
  ],
};

// ── Click allowlist ─────────────────────────────────────────────────────────
// The audit runs against the live Supabase project and live Stripe, so it must
// never change data. It may click ONLY the controls listed here, and only
// through safeClick(). Each entry was checked in source: clicking it sets UI
// state (opens a dialog, sheet, panel or menu) and writes nothing. Anything
// not listed is never clicked. Add an entry only after reading its onClick.
//
//   label     the button's visible text (or aria-label), matched exactly; a
//             RegExp must be anchored (^...$). Visible text, not the
//             accessibility name: Tabler icon glyphs (CSS ::before) and status
//             badges would otherwise change the name.
//   inDialog  true: must be inside an open [role=dialog]; false: must not be
//             (stops e.g. a dialog's own "Add Asset" submit matching the
//             page's "Add Asset" opener)
export const SAFE_OPENERS = {
  view: { label: "View", inDialog: false, source: "JobManagement / BusinessJobsView setSelected; IssuedQuotes openQuote (state only)" },
  // The toggle carries the RAMS status badge in its text, e.g. "Edit RAMS Draft".
  ramsToggle: { label: /^(Edit|View) RAMS( (Draft|Tailored|Signed Off))?$/, inDialog: true, source: "JobManagement setShowRams toggle (state only)" },
  createInvoice: { label: "Create Invoice", inDialog: false, source: "InvoiceManagement setDialogOpen (form opens, nothing saved)" },
  moreTab: { label: "More", inDialog: false, source: "ContractorLayout setMobileOpen" },
  openMenu: { label: "Open menu", inDialog: false, source: "BusinessLayout / HomeownerLayout setMobileOpen" },
  addSite: { label: "Add Site", inDialog: false, source: "MaintenanceManagement openCreate (form opens, nothing saved)" },
  addAsset: { label: "Add Asset", inDialog: false, source: "MaintenanceManagement openCreate (form opens, nothing saved)" },
  inviteContractor: { label: "Invite Contractor", inDialog: false, source: "PanelManagement setInviteOpen" },
  newRequest: { label: "New request", inDialog: false, source: "BusinessRequestsView setDialogOpen" },
  contactCta: { label: "Contact", inDialog: false, source: "ContractorProfile handleEnquire: signed out navigates to /auth, signed in opens the enquiry dialog" },
};

// The only way the audit clicks anything. `scope` narrows the search (e.g. one
// job card). Throws if the key is not allowlisted or the element found does not
// carry exactly the allowlisted name in the allowed place.
export const safeClick = async (page, key, scope = page) => {
  const entry = SAFE_OPENERS[key];
  if (!entry) throw new Error(`safeClick: "${key}" is not on the click allowlist`);
  const candidates = scope.locator("button");
  const n = await candidates.count();
  for (let i = n - 1; i >= 0; i--) {
    const el = candidates.nth(i);
    if (!(await el.isVisible())) continue;
    const ok = await el.evaluate(
      (node, { source, flags, exact, inDialog }) => {
        const text = (node.innerText || "").trim().replace(/\s+/g, " ");
        const aria = (node.getAttribute("aria-label") || "").trim();
        const match = (v) => (exact != null ? v === exact : new RegExp(source, flags).test(v));
        return (match(text) || match(aria)) && !!node.closest('[role="dialog"]') === inDialog;
      },
      entry.label instanceof RegExp
        ? { source: entry.label.source, flags: entry.label.flags, exact: null, inDialog: entry.inDialog }
        : { source: null, flags: null, exact: entry.label, inDialog: entry.inDialog },
    );
    if (!ok) continue;
    await el.click({ timeout: 10000 });
    return;
  }
  throw new Error(`safeClick: no visible "${entry.label}" button (${entry.inDialog ? "inside" : "outside"} a dialog)`);
};

// Dialogs / sheets opened by script. Each opener is best-effort: it depends on
// the signed-in account having data (a job, a quote, ...). A failed opener is
// recorded as "not reached", never as a pass. Openers call safeClick() only.
// Job cards show their reference (J-0020). Prefer J-0020, the job reported
// from a phone (a business job), else the first job listed.
const openJob = async (page) => {
  const reported = page.locator(".rounded-lg.border").filter({ hasText: "J-0020" }).last();
  await safeClick(page, "view", (await reported.count()) ? reported : page);
};

export const DIALOG_OPENERS = [
  { name: "contractor-job-detail", account: "contractor", route: "/dashboard/contractor?view=jobs", open: openJob },
  {
    name: "contractor-job-rams-editor",
    account: "contractor",
    route: "/dashboard/contractor?view=jobs",
    open: async (page) => {
      await openJob(page);
      await safeClick(page, "ramsToggle", page.getByRole("dialog"));
      await page.waitForTimeout(1500);
    },
  },
  { name: "contractor-quote-view", account: "contractor", route: "/dashboard/contractor?view=issued-quotes", open: (page) => safeClick(page, "view") },
  { name: "contractor-create-invoice", account: "contractor", route: "/dashboard/contractor?view=invoices", open: (page) => safeClick(page, "createInvoice") },
  { name: "contractor-more-menu", account: "contractor", route: "/dashboard/contractor?view=dashboard", open: (page) => safeClick(page, "moreTab") },
  { name: "business-job-detail", account: "business", route: "/dashboard/business?view=jobs", open: (page) => safeClick(page, "view") },
  { name: "business-add-site", account: "business", route: "/dashboard/business?view=sites", open: (page) => safeClick(page, "addSite") },
  { name: "business-add-asset", account: "business", route: "/dashboard/business?view=assets", open: (page) => safeClick(page, "addAsset") },
  { name: "business-invite-contractor", account: "business", route: "/dashboard/business?view=panel", open: (page) => safeClick(page, "inviteContractor") },
  { name: "business-new-request", account: "business", route: "/dashboard/business?view=requests", open: (page) => safeClick(page, "newRequest") },
  { name: "business-open-menu", account: "business", route: "/dashboard/business?view=dashboard", open: (page) => safeClick(page, "openMenu") },
  { name: "public-contact", account: "public", route: "/contractor/TS-C-4AE203", open: (page) => safeClick(page, "contactCta") },
];
