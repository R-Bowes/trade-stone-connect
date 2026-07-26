import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from "recharts";
import {
  format, startOfMonth, endOfMonth, subMonths, subWeeks, startOfWeek, endOfWeek,
  differenceInHours, differenceInDays, isWithinInterval,
} from "date-fns";

const NAVY = "#1a2744";
const ORANGE = "#f07820";
const GREEN = "#16a34a";
const AMBER = "#d97706";
const RED = "#dc2626";
const BAR_GREEN = "#059669";

type Period = "month" | "3months" | "12months" | "all";

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "month", label: "This month" },
  { value: "3months", label: "3 months" },
  { value: "12months", label: "12 months" },
  { value: "all", label: "All time" },
];

interface InvoiceRow {
  id: string;
  total: number;
  status: string;
  paid_date: string | null;
  due_date: string;
  issued_date: string;
  client_email: string | null;
  client_name: string;
}

interface QuoteRow {
  id: string;
  total: number;
  status: string;
  created_at: string;
  enquiry_id: string | null;
}

interface JobRow {
  id: string;
  contract_value: number | null;
  status: string;
  start_date: string | null;
  completed_at: string | null;
  actual_start: string | null;
  customer_id: string | null;
}

interface EnquiryRow {
  id: string;
  created_at: string;
  source: string | null;
}

interface ViewEventRow {
  created_at: string;
}

interface SearchAppearanceRow {
  appearance_date: string;
  appearance_count: number;
}

interface ScheduleEventRow {
  start_time: string;
  status: string;
}

function gbp(n: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n);
}

function periodRange(period: Period): { start: Date; end: Date; prevStart: Date | null; prevEnd: Date | null } {
  const now = new Date();
  switch (period) {
    case "month": {
      const start = startOfMonth(now);
      const prevStart = startOfMonth(subMonths(now, 1));
      const prevEnd = endOfMonth(subMonths(now, 1));
      return { start, end: now, prevStart, prevEnd };
    }
    case "3months": {
      const start = subMonths(now, 3);
      return { start, end: now, prevStart: subMonths(now, 6), prevEnd: start };
    }
    case "12months": {
      const start = subMonths(now, 12);
      return { start, end: now, prevStart: subMonths(now, 24), prevEnd: start };
    }
    case "all":
    default:
      return { start: new Date(0), end: now, prevStart: null, prevEnd: null };
  }
}

function inRange(dateStr: string | null, start: Date, end: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return isWithinInterval(d, { start, end });
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <Card className="border border-border">
      <CardContent className="pt-6">
        <div className="text-xs font-semibold tracking-wide" style={{ color: "#9ca3af" }}>{label}</div>
        <div className="text-2xl font-bold mt-1" style={{ color: NAVY, fontFamily: "'Roboto Mono', monospace" }}>{value}</div>
        {sub && <div className="text-xs mt-1" style={{ color: accent ?? "#6b7280" }}>{sub}</div>}
      </CardContent>
    </Card>
  );
}

interface BarSegment {
  label: string;
  value: number;
  color: string;
}

function ProportionalBar({ segments }: { segments: BarSegment[] }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  return (
    <div>
      <div style={{ display: "flex", width: "100%", height: 26, borderRadius: 6, overflow: "hidden", background: "#f3f4f6" }}>
        {total === 0 ? (
          <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 11, color: "#9ca3af" }}>No data yet</span>
          </div>
        ) : (
          segments.map(seg => {
            const pct = (seg.value / total) * 100;
            if (pct <= 0) return null;
            return (
              <div
                key={seg.label}
                style={{
                  width: `${pct}%`,
                  background: seg.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "width 0.2s ease",
                }}
              >
                {pct >= 8 && (
                  <span style={{ fontSize: 11, color: "white", fontWeight: 600 }}>{pct.toFixed(0)}%</span>
                )}
              </div>
            );
          })
        )}
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
        {segments.map(seg => {
          const pct = total > 0 ? (seg.value / total) * 100 : 0;
          return (
            <div key={seg.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6b7280" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: seg.color, display: "inline-block", flexShrink: 0 }} />
              {seg.label} {pct.toFixed(0)}%
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="font-heading text-lg font-bold mt-8 mb-3"
      style={{ color: NAVY, borderLeft: `3px solid ${ORANGE}`, paddingLeft: 10 }}
    >
      {children}
    </h2>
  );
}

function trendLabel(current: number, previous: number | null, lowerIsBetter = false): { text: string; color: string } | null {
  if (previous === null || previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const improved = lowerIsBetter ? pct < 0 : pct > 0;
  const sign = pct > 0 ? "+" : "";
  return {
    text: `${sign}${pct.toFixed(0)}% vs prev period`,
    color: pct === 0 ? "#6b7280" : improved ? GREEN : AMBER,
  };
}

const ContractorKPIInsights = () => {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("3months");

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [enquiries, setEnquiries] = useState<EnquiryRow[]>([]);
  const [viewEvents, setViewEvents] = useState<ViewEventRow[]>([]);
  const [searchAppearances, setSearchAppearances] = useState<SearchAppearanceRow[]>([]);
  const [upcomingVisitCount, setUpcomingVisitCount] = useState(0);
  const [panelCount, setPanelCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      const id = profile?.id;
      if (!id) { setLoading(false); return; }
      setProfileId(id);

      const now = new Date();
      const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const [
        invoicesRes, quotesRes, jobsRes, enquiriesRes, viewsRes, searchRes, visitsRes, panelRes,
      ] = await Promise.all([
        supabase.from("invoices")
          .select("id, total, status, paid_date, due_date, issued_date, client_email, client_name")
          .eq("contractor_id", id),
        supabase.from("issued_quotes")
          .select("id, total, status, created_at, enquiry_id")
          .eq("contractor_id", id),
        supabase.from("jobs")
          .select("id, contract_value, status, start_date, completed_at, actual_start, customer_id")
          .eq("contractor_id", id),
        supabase.from("enquiries")
          .select("id, created_at, source")
          .eq("contractor_id", id),
        supabase.from("profile_view_events")
          .select("created_at")
          .eq("profile_id", id),
        supabase.from("search_appearance_daily")
          .select("appearance_date, appearance_count")
          .eq("profile_id", id),
        supabase.from("schedule_events")
          .select("start_time, status", { count: "exact", head: true })
          .eq("contractor_id", id)
          .neq("status", "cancelled")
          .gte("start_time", now.toISOString())
          .lte("start_time", thirtyDaysOut.toISOString()),
        supabase.from("panel_prequalification")
          .select("id", { count: "exact", head: true })
          .eq("contractor_id", id),
      ]);

      setInvoices((invoicesRes.data ?? []) as InvoiceRow[]);
      setQuotes((quotesRes.data ?? []) as QuoteRow[]);
      setJobs((jobsRes.data ?? []) as JobRow[]);
      setEnquiries((enquiriesRes.data ?? []) as EnquiryRow[]);
      setViewEvents((viewsRes.data ?? []) as ViewEventRow[]);
      setSearchAppearances((searchRes.data ?? []) as SearchAppearanceRow[]);
      setUpcomingVisitCount(visitsRes.count ?? 0);
      setPanelCount(panelRes.count ?? 0);
      setLoading(false);
    };
    load();
  }, []);

  const { start, end, prevStart, prevEnd } = useMemo(() => periodRange(period), [period]);

  // ── Money ────────────────────────────────────────────────────────────
  const money = useMemo(() => {
    const paidInPeriod = invoices.filter(i => i.status === "paid" && inRange(i.paid_date, start, end));
    const revenue = paidInPeriod.reduce((s, i) => s + Number(i.total), 0);
    const avgJobValue = paidInPeriod.length > 0 ? revenue / paidInPeriod.length : 0;
    const outstandingInvoices = invoices.filter(i => i.status === "sent" || i.status === "overdue" || i.status === "viewed");
    const outstanding = outstandingInvoices.reduce((s, i) => s + Number(i.total), 0);

    const byClient = new Map<string, number>();
    for (const inv of paidInPeriod) {
      const key = inv.client_email || inv.client_name || "Unknown";
      byClient.set(key, (byClient.get(key) ?? 0) + Number(inv.total));
    }
    const topClientAmount = Math.max(0, ...Array.from(byClient.values()));
    const topClientConcentration = revenue > 0 ? (topClientAmount / revenue) * 100 : 0;
    const clientCount = byClient.size;

    const scheduledValue = jobs
      .filter(j => j.status === "scheduled" || j.status === "in_progress")
      .reduce((s, j) => s + Number(j.contract_value ?? 0), 0);
    const cashFlowOutlook = scheduledValue + outstanding;

    const monthlyRevenue: { label: string; revenue: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const mStart = startOfMonth(subMonths(now(), i));
      const mEnd = endOfMonth(subMonths(now(), i));
      const total = invoices
        .filter(inv => inv.status === "paid" && inRange(inv.paid_date, mStart, mEnd))
        .reduce((s, inv) => s + Number(inv.total), 0);
      monthlyRevenue.push({ label: format(mStart, "MMM"), revenue: total });
    }

    return { revenue, avgJobValue, outstanding, topClientConcentration, clientCount, cashFlowOutlook, monthlyRevenue };
  }, [invoices, jobs, start, end]);

  // ── Visibility ───────────────────────────────────────────────────────
  const visibility = useMemo(() => {
    const viewsInPeriod = viewEvents.filter(v => inRange(v.created_at, start, end));
    const profileViews = viewsInPeriod.length;
    const searchAppearancesTotal = searchAppearances
      .filter(s => inRange(s.appearance_date, start, end))
      .reduce((sum, s) => sum + s.appearance_count, 0);
    const enquiriesInPeriod = enquiries.filter(e => inRange(e.created_at, start, end));
    const viewToEnquiryRate = profileViews > 0 ? (enquiriesInPeriod.length / profileViews) * 100 : 0;

    const weeklyViews: { label: string; views: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const wStart = startOfWeek(subWeeks(now(), i));
      const wEnd = endOfWeek(subWeeks(now(), i));
      const count = viewEvents.filter(v => inRange(v.created_at, wStart, wEnd)).length;
      weeklyViews.push({ label: format(wStart, "d MMM"), views: count });
    }

    const sourceTotals = {
      marketplace: enquiriesInPeriod.filter(e => (e.source ?? "marketplace") === "marketplace").length,
      direct: enquiriesInPeriod.filter(e => e.source === "direct").length,
      panel: enquiriesInPeriod.filter(e => e.source === "panel").length,
    };

    return { profileViews, searchAppearancesTotal, viewToEnquiryRate, weeklyViews, sourceTotals };
  }, [viewEvents, searchAppearances, enquiries, start, end]);

  // ── Win rate and speed ──────────────────────────────────────────────
  const speed = useMemo(() => {
    const computeForRange = (rStart: Date, rEnd: Date) => {
      const quotesInRange = quotes.filter(q => q.status !== "draft" && q.status !== "superseded" && inRange(q.created_at, rStart, rEnd));
      const won = quotesInRange.filter(q => q.status === "accepted").length;
      const winRate = quotesInRange.length > 0 ? (won / quotesInRange.length) * 100 : 0;

      const responseHours: number[] = [];
      for (const q of quotesInRange) {
        if (!q.enquiry_id) continue;
        const enq = enquiries.find(e => e.id === q.enquiry_id);
        if (!enq) continue;
        responseHours.push(differenceInHours(new Date(q.created_at), new Date(enq.created_at)));
      }
      const avgResponseHours = responseHours.length > 0 ? responseHours.reduce((a, b) => a + b, 0) / responseHours.length : 0;

      return { winRate, avgResponseHours, quoteCount: quotesInRange.length };
    };

    const current = computeForRange(start, end);
    const previous = prevStart && prevEnd ? computeForRange(prevStart, prevEnd) : null;

    const completionDays: number[] = [];
    for (const j of jobs) {
      if (!j.completed_at || !j.actual_start) continue;
      if (!inRange(j.completed_at, start, end)) continue;
      completionDays.push(differenceInDays(new Date(j.completed_at), new Date(j.actual_start)));
    }
    const avgCompletionDays = completionDays.length > 0 ? completionDays.reduce((a, b) => a + b, 0) / completionDays.length : 0;

    const paidInPeriod = invoices.filter(i => i.status === "paid" && inRange(i.paid_date, start, end));
    let onTime = 0, late = 0;
    for (const inv of paidInPeriod) {
      if (!inv.paid_date) continue;
      if (new Date(inv.paid_date) <= new Date(inv.due_date)) onTime++;
      else late++;
    }
    const overdueNow = invoices.filter(i => i.status === "overdue").length;

    return {
      winRate: current.winRate,
      avgResponseHours: current.avgResponseHours,
      avgCompletionDays,
      collection: [{ label: "Invoices", onTime, late, overdue: overdueNow }],
      winRateTrend: previous ? trendLabel(current.winRate, previous.winRate) : null,
    };
  }, [quotes, enquiries, jobs, invoices, start, end, prevStart, prevEnd]);

  // ── Growth ───────────────────────────────────────────────────────────
  const growth = useMemo(() => {
    const quotesInPeriod = quotes.filter(q => q.status !== "draft" && q.status !== "superseded" && inRange(q.created_at, start, end));
    const avgQuoteValue = quotesInPeriod.length > 0 ? quotesInPeriod.reduce((s, q) => s + Number(q.total), 0) / quotesInPeriod.length : 0;

    const prevQuotes = prevStart && prevEnd
      ? quotes.filter(q => q.status !== "draft" && q.status !== "superseded" && inRange(q.created_at, prevStart, prevEnd))
      : [];
    const prevAvgQuoteValue = prevQuotes.length > 0 ? prevQuotes.reduce((s, q) => s + Number(q.total), 0) / prevQuotes.length : null;

    const respHours = (rangeQuotes: QuoteRow[]) => {
      const hrs: number[] = [];
      for (const q of rangeQuotes) {
        if (!q.enquiry_id) continue;
        const enq = enquiries.find(e => e.id === q.enquiry_id);
        if (!enq) continue;
        hrs.push(differenceInHours(new Date(q.created_at), new Date(enq.created_at)));
      }
      return hrs.length > 0 ? hrs.reduce((a, b) => a + b, 0) / hrs.length : 0;
    };
    const currentResponseHours = respHours(quotesInPeriod);
    const prevResponseHours = prevQuotes.length > 0 ? respHours(prevQuotes) : null;

    // New vs repeat: for jobs starting in this period, was this customer's
    // first-ever job before this period started?
    const jobsInPeriod = jobs.filter(j => inRange(j.start_date, start, end) && j.customer_id);
    let newClients = 0, repeatClients = 0;
    const seenThisPeriod = new Set<string>();
    for (const j of jobsInPeriod) {
      if (!j.customer_id || seenThisPeriod.has(j.customer_id)) continue;
      seenThisPeriod.add(j.customer_id);
      const earlierJob = jobs.find(other =>
        other.customer_id === j.customer_id && other.start_date &&
        new Date(other.start_date) < start
      );
      if (earlierJob) repeatClients++; else newClients++;
    }
    const totalClients = newClients + repeatClients;
    const repeatRate = totalClients > 0 ? (repeatClients / totalClients) * 100 : 0;

    return {
      avgQuoteValue,
      avgQuoteValueTrend: trendLabel(avgQuoteValue, prevAvgQuoteValue),
      currentResponseHours,
      responseTimeTrend: prevResponseHours !== null ? trendLabel(currentResponseHours, prevResponseHours, true) : null,
      newClients,
      repeatClients,
      repeatRate,
    };
  }, [quotes, enquiries, jobs, start, end, prevStart, prevEnd]);

  // ── Activity ─────────────────────────────────────────────────────────
  const activity = useMemo(() => {
    const jobsCompleted = jobs.filter(j => inRange(j.completed_at, start, end)).length;

    const dayCounts = new Map<string, number>();
    const jobsWithStart = jobs.filter(j => inRange(j.start_date, start, end));
    for (const j of jobsWithStart) {
      const day = format(new Date(j.start_date as string), "EEEE");
      dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
    }
    let busiestDay = "—";
    let maxCount = 0;
    for (const [day, count] of dayCounts) {
      if (count > maxCount) { maxCount = count; busiestDay = day; }
    }

    const monthlyVolume: { label: string; jobs: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const mStart = startOfMonth(subMonths(now(), i));
      const mEnd = endOfMonth(subMonths(now(), i));
      const count = jobs.filter(j => inRange(j.start_date, mStart, mEnd)).length;
      monthlyVolume.push({ label: format(mStart, "MMM"), jobs: count });
    }

    return { jobsCompleted, busiestDay, monthlyVolume };
  }, [jobs, start, end]);

  const invoiceCollectionTotal = speed.collection[0].onTime + speed.collection[0].late + speed.collection[0].overdue;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-muted-foreground text-sm">Loading insights…</p>
      </div>
    );
  }

  if (!profileId) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-muted-foreground text-sm">Sign in as a contractor to view your insights.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6" style={{ fontFamily: "Lexend, sans-serif" }}>
      {/* Period selector */}
      <div className="flex justify-end mb-4">
        <div className="inline-flex rounded-lg border p-1 bg-white">
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              style={{
                background: period === opt.value ? ORANGE : "transparent",
                color: period === opt.value ? "white" : "#6b7280",
                border: "none",
                borderRadius: 6,
                padding: "6px 14px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Money */}
      <SectionHeading>Money</SectionHeading>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Revenue" value={gbp(money.revenue)} />
        <StatCard label="Avg job value" value={gbp(money.avgJobValue)} />
        <StatCard label="Outstanding" value={gbp(money.outstanding)} />
        <StatCard label="Cash flow outlook" value={gbp(money.cashFlowOutlook)} sub="Scheduled + unpaid" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <Card className="border border-border md:col-span-2">
          <CardHeader><CardTitle className="text-sm">Monthly revenue (last 6 months)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={money.monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v) => `£${v}`} />
                <Tooltip formatter={(v: number) => gbp(v)} />
                <Bar dataKey="revenue" fill={NAVY} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border border-border">
          <CardHeader><CardTitle className="text-sm">Top client concentration</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" style={{ color: money.topClientConcentration > 50 ? AMBER : NAVY }}>
              {money.topClientConcentration.toFixed(0)}%
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {money.clientCount === 0 ? "No paying clients yet" : money.clientCount === 1 ? "1 client" : `across ${money.clientCount} clients`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Visibility */}
      <SectionHeading>Visibility</SectionHeading>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Profile views" value={String(visibility.profileViews)} />
        <StatCard label="Search appearances" value={String(visibility.searchAppearancesTotal)} />
        <StatCard label="View-to-enquiry rate" value={`${visibility.viewToEnquiryRate.toFixed(1)}%`} />
        <StatCard label="Enquiries" value={String(enquiries.filter(e => inRange(e.created_at, start, end)).length)} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <Card className="border border-border">
          <CardHeader><CardTitle className="text-sm">Weekly profile views (last 12 weeks)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={visibility.weeklyViews}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={12} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="views" stroke={ORANGE} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border border-border">
          <CardHeader><CardTitle className="text-sm">Enquiry source</CardTitle></CardHeader>
          <CardContent>
            <ProportionalBar
              segments={[
                { label: "Marketplace", value: visibility.sourceTotals.marketplace, color: NAVY },
                { label: "Direct", value: visibility.sourceTotals.direct, color: ORANGE },
                { label: "Panel", value: visibility.sourceTotals.panel, color: BAR_GREEN },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      {/* Win rate and speed */}
      <SectionHeading>Win rate and speed</SectionHeading>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Quote win rate"
          value={`${speed.winRate.toFixed(0)}%`}
          sub={speed.winRateTrend?.text}
          accent={speed.winRateTrend?.color}
        />
        <StatCard label="Avg response time" value={speed.avgResponseHours < 24 ? `${speed.avgResponseHours.toFixed(1)}h` : `${(speed.avgResponseHours / 24).toFixed(1)}d`} />
        <StatCard label="Avg completion" value={`${speed.avgCompletionDays.toFixed(1)} days`} />
        <StatCard label="Overdue invoices" value={String(speed.collection[0].overdue)} accent={speed.collection[0].overdue > 0 ? RED : undefined} />
      </div>
      <div className="mt-4">
        <Card className="border border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Invoice collection this period</CardTitle>
            <span className="text-sm font-semibold" style={{ color: NAVY }}>
              {invoiceCollectionTotal > 0 ? `${((speed.collection[0].onTime / invoiceCollectionTotal) * 100).toFixed(0)}% on time` : "No invoices yet"}
            </span>
          </CardHeader>
          <CardContent>
            <ProportionalBar
              segments={[
                { label: "On-time", value: speed.collection[0].onTime, color: BAR_GREEN },
                { label: "Late", value: speed.collection[0].late, color: AMBER },
                { label: "Overdue", value: speed.collection[0].overdue, color: RED },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      {/* Growth */}
      <SectionHeading>Growth</SectionHeading>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard
          label="Avg quote value"
          value={gbp(growth.avgQuoteValue)}
          sub={growth.avgQuoteValueTrend?.text}
          accent={growth.avgQuoteValueTrend?.color}
        />
        <StatCard
          label="Response time"
          value={growth.currentResponseHours < 24 ? `${growth.currentResponseHours.toFixed(1)}h` : `${(growth.currentResponseHours / 24).toFixed(1)}d`}
          sub={growth.responseTimeTrend?.text}
          accent={growth.responseTimeTrend?.color}
        />
        <StatCard
          label="Repeat client rate"
          value={`${growth.repeatRate.toFixed(0)}%`}
          sub={`${growth.newClients} new · ${growth.repeatClients} repeat`}
        />
      </div>

      {/* Activity */}
      <SectionHeading>Activity</SectionHeading>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Jobs completed" value={String(activity.jobsCompleted)} />
        <StatCard label="Panels" value={String(panelCount)} />
        <StatCard label="Upcoming visits" value={String(upcomingVisitCount)} sub="Next 30 days" />
        <StatCard label="Busiest day" value={activity.busiestDay} />
      </div>
      <div className="mt-4 mb-8">
        <Card className="border border-border">
          <CardHeader><CardTitle className="text-sm">Monthly job volume (last 6 months)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={activity.monthlyVolume}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" fontSize={12} />
                <YAxis fontSize={12} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="jobs" fill={NAVY} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

function now(): Date {
  return new Date();
}

export default ContractorKPIInsights;
