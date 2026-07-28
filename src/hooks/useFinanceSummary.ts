import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subYears } from "date-fns";
import { getTaxYear } from "@/hooks/useMileage";
import type { Database } from "@/integrations/supabase/types";

type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
type ExpenseRow = Database["public"]["Tables"]["expenses"]["Row"];
type MileageTrip = Database["public"]["Tables"]["mileage_trips"]["Row"];
type FinanceSettingsRow = Database["public"]["Tables"]["finance_settings"]["Row"];
type ExpenseCategoryRow = Database["public"]["Tables"]["expense_categories"]["Row"];

export const VAT_THRESHOLD = 90000;

export type Period = "currentTaxYear" | "previousTaxYear" | "currentQuarter" | "custom";

export type ProfitAndLoss = {
  totalIncome: number;
  vatCharged: number;
  invoiceCount: number;

  totalExpenses: number;
  totalMileage: number;
  totalCosts: number;

  expensesByCategory: { category: string; amount: number }[];

  grossProfit: number;
  profitMargin: number;

  monthlyBreakdown: {
    month: string;
    income: number;
    expenses: number;
    mileage: number;
    profit: number;
  }[];
};

export type QuarterVat = {
  quarter: string;
  outputVat: number;
  inputVat: number;
  netVat: number;
};

export type VatPosition = {
  vatStatus: "not_registered" | "standard" | "flat_rate";

  outputVat: number;
  inputVat: number;
  netVatOwed: number;

  flatRatePercentage: number | null;
  flatRateVatDue: number;
  flatRateFirstYearDiscount: boolean;

  rollingTurnover: number;
  vatThreshold: number;
  thresholdPercentage: number;

  quarterlyBreakdown: QuarterVat[];
};

/** UK tax-year bounds for a "YYYY-YY" label, e.g. "2026-27" -> 6 Apr 2026 – 5 Apr 2027. */
function taxYearBounds(taxYearLabel: string): { start: Date; end: Date } {
  const startYear = parseInt(taxYearLabel.split("-")[0], 10);
  const start = new Date(startYear, 3, 6, 0, 0, 0, 0);
  const end = new Date(startYear + 1, 3, 5, 23, 59, 59, 999);
  return { start, end };
}

function previousTaxYearLabel(label: string): string {
  const startYear = parseInt(label.split("-")[0], 10) - 1;
  const endYearShort = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endYearShort}`;
}

/**
 * Limited-company financial year, anchored on financial_year_end_month/day.
 * Day-length edge cases (e.g. anchor day 31 in a 30-day month) aren't
 * specially handled — Slice 1's settings UI doesn't validate against actual
 * month lengths either, so this stays consistent with what's enforceable
 * upstream.
 */
function financialYearBounds(anchorMonth: number, anchorDay: number, referenceDate: Date): { start: Date; end: Date } {
  const y = referenceDate.getFullYear();
  const anchorThisYear = new Date(y, anchorMonth - 1, anchorDay, 23, 59, 59, 999);
  const end = referenceDate <= anchorThisYear ? anchorThisYear : new Date(y + 1, anchorMonth - 1, anchorDay, 23, 59, 59, 999);
  const start = new Date(end.getFullYear() - 1, anchorMonth - 1, anchorDay + 1, 0, 0, 0, 0);
  return { start, end };
}

/** UK tax-year-aligned quarter containing referenceDate: Q1 Apr-Jun … Q4 Jan-Mar. */
function currentQuarterBounds(referenceDate: Date): { start: Date; end: Date } {
  const month = referenceDate.getMonth() + 1;
  const year = referenceDate.getFullYear();
  let startMonth: number;
  let startYear = year;
  if (month >= 4 && month <= 6) startMonth = 4;
  else if (month >= 7 && month <= 9) startMonth = 7;
  else if (month >= 10 && month <= 12) startMonth = 10;
  else startMonth = 1;
  const start = new Date(startYear, startMonth - 1, 1, 0, 0, 0, 0);
  const end = new Date(startYear, startMonth - 1 + 3, 0, 23, 59, 59, 999);
  return { start, end };
}

/**
 * Label for the calendar-month quarter STARTING at `cursor` (always the 1st
 * of Apr/Jul/Oct/Jan). Deliberately does not delegate to getTaxYear(cursor)
 * — getTaxYear correctly treats 1–5 April as still part of the PRIOR tax
 * year (the SA tax year starts 6 April), but a Q1 quarter bucket is always
 * "Apr-Jun of tax year starting that April" regardless of the fact that its
 * first 5 calendar days technically precede the 6 April cutover. Using
 * getTaxYear here mislabelled Q1 as e.g. "2025-26" instead of "2026-27".
 */
function quarterLabelForDate(cursor: Date): string {
  const month = cursor.getMonth() + 1;
  const year = cursor.getFullYear();
  let n: number;
  let taxYearStartYear: number;
  if (month >= 4 && month <= 6) { n = 1; taxYearStartYear = year; }
  else if (month >= 7 && month <= 9) { n = 2; taxYearStartYear = year; }
  else if (month >= 10 && month <= 12) { n = 3; taxYearStartYear = year; }
  else { n = 4; taxYearStartYear = year - 1; } // Jan-Mar belongs to the tax year that started the previous April
  const endYearShort = String((taxYearStartYear + 1) % 100).padStart(2, "0");
  return `Q${n} ${taxYearStartYear}-${endYearShort}`;
}

/**
 * Enumerate the calendar-month quarters (Apr-Jun, Jul-Sep, Oct-Dec, Jan-Mar)
 * that meaningfully overlap [start, end], clipped to that range. Calendar
 * quarters don't tile perfectly into a 6 Apr–5 Apr tax year (there's an
 * inherent ~5-day mismatch at the boundary), so a quarter is only included
 * if its clipped overlap is at least 14 days — this both excludes a
 * spurious near-empty trailing quarter at the tax-year boundary and, by
 * clipping start/end, stops Apr 1-5 transactions (which belong to the PRIOR
 * tax year) from being double-counted into the new year's Q1 data.
 */
function getQuartersInRange(start: Date, end: Date): { label: string; start: Date; end: Date }[] {
  const quarters: { label: string; start: Date; end: Date }[] = [];
  let cursor = currentQuarterBounds(start).start;
  let guard = 0;
  while (cursor <= end && guard < 40) {
    const qCalEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 3, 0, 23, 59, 59, 999);
    const overlapStart = cursor < start ? start : cursor;
    const overlapEnd = qCalEnd > end ? end : qCalEnd;
    const overlapDays = (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24);
    if (overlapDays >= 14) {
      quarters.push({ label: quarterLabelForDate(cursor), start: overlapStart, end: overlapEnd });
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 3, 1, 0, 0, 0, 0);
    guard += 1;
  }
  return quarters;
}

export function getPeriodDates(
  period: Period,
  financeSettings: FinanceSettingsRow | null,
  customRange?: { start: string; end: string } | null,
): { start: Date; end: Date } {
  const now = new Date();

  if (period === "custom" && customRange?.start && customRange?.end) {
    const [sy, sm, sd] = customRange.start.split("-").map(Number);
    const [ey, em, ed] = customRange.end.split("-").map(Number);
    return {
      start: new Date(sy, sm - 1, sd, 0, 0, 0, 0),
      end: new Date(ey, em - 1, ed, 23, 59, 59, 999),
    };
  }

  if (period === "currentQuarter") {
    return currentQuarterBounds(now);
  }

  const useFinancialYear = financeSettings?.business_type === "limited_company"
    && financeSettings.financial_year_end_month
    && financeSettings.financial_year_end_day;

  if (period === "previousTaxYear") {
    if (useFinancialYear) {
      const current = financialYearBounds(financeSettings!.financial_year_end_month!, financeSettings!.financial_year_end_day!, now);
      return financialYearBounds(financeSettings!.financial_year_end_month!, financeSettings!.financial_year_end_day!, subYears(current.start, 1));
    }
    return taxYearBounds(previousTaxYearLabel(getTaxYear(now)));
  }

  // currentTaxYear (default)
  if (useFinancialYear) {
    return financialYearBounds(financeSettings!.financial_year_end_month!, financeSettings!.financial_year_end_day!, now);
  }
  return taxYearBounds(getTaxYear(now));
}

function inRange(dateStr: string | null, start: Date, end: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d >= start && d <= end;
}

export function useFinanceSummary() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [trips, setTrips] = useState<MileageTrip[]>([]);
  const [categories, setCategories] = useState<ExpenseCategoryRow[]>([]);
  const [financeSettings, setFinanceSettings] = useState<FinanceSettingsRow | null>(null);
  const [loading, setLoading] = useState(true);

  const [period, setPeriod] = useState<Period>("currentTaxYear");
  const [customRange, setCustomRange] = useState<{ start: string; end: string } | null>(null);

  const fetchAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profileRow) {
      setLoading(false);
      return;
    }

    const [
      { data: invoiceRows },
      { data: expenseRows },
      { data: tripRows },
      { data: categoryRows },
      { data: settingsRow },
    ] = await Promise.all([
      supabase.from("invoices").select("*").eq("contractor_id", profileRow.id),
      supabase.from("expenses").select("*").eq("contractor_id", profileRow.id),
      supabase.from("mileage_trips").select("*").eq("contractor_id", profileRow.id),
      supabase
        .from("expense_categories")
        .select("*")
        .or(`owner_contractor_id.is.null,owner_contractor_id.eq.${profileRow.id}`),
      supabase.from("finance_settings").select("*").eq("contractor_id", profileRow.id).maybeSingle(),
    ]);

    setInvoices(invoiceRows ?? []);
    setExpenses(expenseRows ?? []);
    setTrips(tripRows ?? []);
    setCategories(categoryRows ?? []);
    setFinanceSettings(settingsRow ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const periodDates = useMemo(
    () => getPeriodDates(period, financeSettings, customRange),
    [period, financeSettings, customRange],
  );

  // HMRC parent category name for an expense: resolve via category_id ->
  // (its own name if it's a parent, or its parent's name if it's a
  // subcategory) -> falls back to the denormalised `category` text for
  // legacy rows with no category_id, so nothing gets silently dropped from
  // the roll-up.
  const parentCategoryName = useCallback(
    (expense: ExpenseRow): string => {
      if (!expense.category_id) return expense.category || "Other";
      const cat = categories.find((c) => c.id === expense.category_id);
      if (!cat) return expense.category || "Other";
      if (!cat.parent_id) return cat.name;
      const parent = categories.find((c) => c.id === cat.parent_id);
      return parent?.name ?? cat.name;
    },
    [categories],
  );

  const pnl: ProfitAndLoss = useMemo(() => {
    const { start, end } = periodDates;

    const paidInvoices = invoices.filter((inv) => inv.status === "paid" && inRange(inv.paid_date, start, end));
    const totalIncome = paidInvoices.reduce((sum, inv) => sum + Number(inv.total), 0);
    const vatCharged = paidInvoices.reduce((sum, inv) => sum + Number(inv.tax_amount), 0);

    const periodExpenses = expenses.filter((e) => inRange(e.expense_date, start, end));
    const totalExpenses = periodExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

    const periodTrips = trips.filter((t) => inRange(t.trip_date, start, end));
    const totalMileage = periodTrips.reduce((sum, t) => sum + Number(t.claim_amount), 0);

    const totalCosts = totalExpenses + totalMileage;

    const categoryTotals = new Map<string, number>();
    for (const e of periodExpenses) {
      const name = parentCategoryName(e);
      categoryTotals.set(name, (categoryTotals.get(name) ?? 0) + Number(e.amount));
    }
    const expensesByCategory = Array.from(categoryTotals.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);

    const grossProfit = totalIncome - totalCosts;
    const profitMargin = totalIncome > 0 ? (grossProfit / totalIncome) * 100 : 0;

    const months = start <= end ? eachMonthOfInterval({ start, end }) : [];
    const monthlyBreakdown = months.map((m) => {
      const mStart = startOfMonth(m) < start ? start : startOfMonth(m);
      const mEnd = endOfMonth(m) > end ? end : endOfMonth(m);
      const income = paidInvoices
        .filter((inv) => inRange(inv.paid_date, mStart, mEnd))
        .reduce((sum, inv) => sum + Number(inv.total), 0);
      const monthExpenses = periodExpenses
        .filter((e) => inRange(e.expense_date, mStart, mEnd))
        .reduce((sum, e) => sum + Number(e.amount), 0);
      const mileage = periodTrips
        .filter((t) => inRange(t.trip_date, mStart, mEnd))
        .reduce((sum, t) => sum + Number(t.claim_amount), 0);
      return {
        month: format(m, "MMM yyyy"),
        income,
        expenses: monthExpenses,
        mileage,
        profit: income - monthExpenses - mileage,
      };
    });

    return {
      totalIncome,
      vatCharged,
      invoiceCount: paidInvoices.length,
      totalExpenses,
      totalMileage,
      totalCosts,
      expensesByCategory,
      grossProfit,
      profitMargin,
      monthlyBreakdown,
    };
  }, [invoices, expenses, trips, periodDates, parentCategoryName]);

  const vatPosition: VatPosition = useMemo(() => {
    const { start, end } = periodDates;
    const vatStatus = (financeSettings?.vat_status ?? "not_registered") as VatPosition["vatStatus"];

    const paidInvoices = invoices.filter((inv) => inv.status === "paid" && inRange(inv.paid_date, start, end));
    const outputVat = paidInvoices.reduce((sum, inv) => sum + Number(inv.tax_amount), 0);

    const periodExpenses = expenses.filter((e) => inRange(e.expense_date, start, end));
    const inputVat = periodExpenses
      .filter((e) => e.vat_reclaimable)
      .reduce((sum, e) => sum + Number(e.vat_amount ?? 0), 0);

    const netVatOwed = outputVat - inputVat;

    const flatRatePercentage = financeSettings?.flat_rate_percentage ?? null;
    const totalIncomeIncVat = paidInvoices.reduce((sum, inv) => sum + Number(inv.total), 0);
    let flatRateFirstYearDiscount = false;
    if (financeSettings?.flat_rate_start_date) {
      const startDate = new Date(financeSettings.flat_rate_start_date);
      const oneYearOn = new Date(startDate);
      oneYearOn.setFullYear(oneYearOn.getFullYear() + 1);
      flatRateFirstYearDiscount = new Date() <= oneYearOn;
    }
    const effectiveFlatRate = flatRatePercentage !== null
      ? Math.max(0, flatRatePercentage - (flatRateFirstYearDiscount ? 1 : 0))
      : 0;
    const flatRateVatDue = totalIncomeIncVat * (effectiveFlatRate / 100);

    // Rolling 12-month turnover: HMRC counts taxable supplies when invoiced,
    // not when paid, and this is independent of the period selector — it's
    // always "as of today", not the selected reporting period.
    const rollingStart = subYears(new Date(), 1);
    const rollingTurnover = invoices
      .filter((inv) => inv.status !== "draft" && inRange(inv.issued_date, rollingStart, new Date()))
      .reduce((sum, inv) => sum + Number(inv.total), 0);
    const thresholdPercentage = (rollingTurnover / VAT_THRESHOLD) * 100;

    const quarters = getQuartersInRange(start, end);
    const quarterlyBreakdown: QuarterVat[] = quarters.map((q) => {
      const qOutput = invoices
        .filter((inv) => inv.status === "paid" && inRange(inv.paid_date, q.start, q.end))
        .reduce((sum, inv) => sum + Number(inv.tax_amount), 0);
      const qInput = expenses
        .filter((e) => e.vat_reclaimable && inRange(e.expense_date, q.start, q.end))
        .reduce((sum, e) => sum + Number(e.vat_amount ?? 0), 0);
      return { quarter: q.label, outputVat: qOutput, inputVat: qInput, netVat: qOutput - qInput };
    });

    return {
      vatStatus,
      outputVat,
      inputVat,
      netVatOwed,
      flatRatePercentage,
      flatRateVatDue,
      flatRateFirstYearDiscount,
      rollingTurnover,
      vatThreshold: VAT_THRESHOLD,
      thresholdPercentage,
      quarterlyBreakdown,
    };
  }, [invoices, expenses, periodDates, financeSettings]);

  return {
    pnl,
    vatPosition,
    period,
    setPeriod,
    customRange,
    setCustomRange,
    financeSettings,
    loading,
    refetch: fetchAll,
  };
}
