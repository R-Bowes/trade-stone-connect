import { CSSProperties, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

type PaymentRow = {
  id: string;
  amount: number;
  platform_fee: number | null;
  payee_id: string | null;
  status: string | null;
  type: string | null;
  stripe_payment_intent_id: string | null;
  created_at: string | null;
};

type ProfileLite = { id: string; full_name: string | null; ts_profile_code: string | null };

const thStyle: CSSProperties = {
  textAlign: 'left', padding: '10px 16px', color: 'rgba(255,255,255,0.4)',
  fontWeight: 500, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em',
};
const emptyState = (msg: string) => (
  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, padding: '32px 16px' }}>{msg}</div>
);

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

export default function AdminRevenue() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, ProfileLite>>({});
  const [avgJobValue, setAvgJobValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const db = supabase as any;
    const [paymentsRes, jobsRes] = await Promise.all([
      db.from('payments')
        .select('id, amount, platform_fee, payee_id, status, type, stripe_payment_intent_id, created_at')
        .eq('status', 'completed')
        .order('created_at', { ascending: false }),
      db.from('jobs').select('contract_value').not('contract_value', 'is', null),
    ]);

    const paymentRows: PaymentRow[] = paymentsRes.data || [];
    setPayments(paymentRows);

    const jobValues: number[] = (jobsRes.data || []).map((j: { contract_value: number }) => j.contract_value).filter((v: number) => v != null);
    setAvgJobValue(jobValues.length > 0 ? jobValues.reduce((a, b) => a + b, 0) / jobValues.length : null);

    const payeeIds = Array.from(new Set(paymentRows.map((p) => p.payee_id).filter(Boolean))) as string[];
    if (payeeIds.length > 0) {
      const { data: profileRows } = await db.from('profiles').select('id, full_name, ts_profile_code').in('id', payeeIds);
      const map: Record<string, ProfileLite> = {};
      for (const p of profileRows || []) map[p.id] = p;
      setProfileMap(map);
    }

    setLoading(false);
  }

  const totalPlatformFees = useMemo(
    () => payments.reduce((sum, p) => sum + (p.platform_fee || 0), 0),
    [payments]
  );

  const monthlyRevenue = useMemo(() => {
    const now = new Date();
    const months: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const byMonth: Record<string, number> = Object.fromEntries(months.map((m) => [m, 0]));
    for (const p of payments) {
      if (!p.created_at) continue;
      const key = monthKey(p.created_at);
      if (key in byMonth) byMonth[key] += p.platform_fee || 0;
    }
    return months.map((m) => ({ month: m, label: monthLabel(m), value: byMonth[m] }));
  }, [payments]);

  const maxMonthly = Math.max(1, ...monthlyRevenue.map((m) => m.value));

  const revenueByContractor = useMemo(() => {
    const byContractor: Record<string, number> = {};
    for (const p of payments) {
      if (!p.payee_id) continue;
      byContractor[p.payee_id] = (byContractor[p.payee_id] || 0) + (p.platform_fee || 0);
    }
    return Object.entries(byContractor)
      .map(([contractorId, total]) => ({ contractorId, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [payments]);

  const paymentMethodSplit = useMemo(() => {
    let stripeCount = 0, stripeTotal = 0, manualCount = 0, manualTotal = 0;
    for (const p of payments) {
      const isManual = p.type === 'manual' || !p.stripe_payment_intent_id;
      if (isManual) { manualCount++; manualTotal += p.amount; }
      else { stripeCount++; stripeTotal += p.amount; }
    }
    return { stripeCount, stripeTotal, manualCount, manualTotal };
  }, [payments]);

  if (loading) return <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading...</div>;

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Total platform fees', value: `£${totalPlatformFees.toFixed(2)}` },
          { label: 'Average job value', value: avgJobValue != null ? `£${avgJobValue.toFixed(2)}` : '—' },
          { label: 'Completed payments', value: payments.length },
          { label: 'Stripe / Manual', value: `${paymentMethodSplit.stripeCount} / ${paymentMethodSplit.manualCount}` },
        ].map((s) => (
          <div key={s.label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '20px 24px' }}>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#fff', marginBottom: 4 }}>{s.value}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Monthly chart */}
      <h3 style={{ color: '#e8eef4', fontSize: 16, fontWeight: 600, margin: '0 0 16px' }}>Monthly Platform Revenue (last 12 months)</h3>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 140, marginBottom: 40, padding: '0 4px' }}>
        {monthlyRevenue.map((m) => (
          <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div
              title={`£${m.value.toFixed(2)}`}
              style={{ width: '100%', maxWidth: 28, height: Math.max(2, (m.value / maxMonthly) * 110), background: '#f07820', borderRadius: '3px 3px 0 0' }}
            />
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{m.label}</span>
          </div>
        ))}
      </div>

      {/* Revenue by contractor */}
      <h3 style={{ color: '#e8eef4', fontSize: 16, fontWeight: 600, margin: '0 0 12px' }}>Top Contractors by Platform Fee Generated</h3>
      {revenueByContractor.length === 0 ? emptyState('No completed payments yet') : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginBottom: 40 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              {['#', 'Contractor', 'TS Code', 'Platform Fees Generated'].map((h) => <th key={h} style={thStyle}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {revenueByContractor.map((r, i) => {
              const profile = profileMap[r.contractorId];
              return (
                <tr key={r.contractorId} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.4)' }}>{i + 1}</td>
                  <td style={{ padding: '12px 16px', color: '#e8eef4' }}>{profile?.full_name || r.contractorId.slice(0, 8)}</td>
                  <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', fontSize: 12 }}>{profile?.ts_profile_code || '—'}</td>
                  <td style={{ padding: '12px 16px', color: '#4ade80' }}>£{r.total.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Payment method split */}
      <h3 style={{ color: '#e8eef4', fontSize: 16, fontWeight: 600, margin: '0 0 12px' }}>Payment Method Split</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '20px 24px' }}>
          <div style={{ fontSize: 22, fontWeight: 600, color: '#60a5fa' }}>£{paymentMethodSplit.stripeTotal.toFixed(2)}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Stripe · {paymentMethodSplit.stripeCount} payments</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '20px 24px' }}>
          <div style={{ fontSize: 22, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>£{paymentMethodSplit.manualTotal.toFixed(2)}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Manual · {paymentMethodSplit.manualCount} payments</div>
        </div>
      </div>
    </div>
  );
}
