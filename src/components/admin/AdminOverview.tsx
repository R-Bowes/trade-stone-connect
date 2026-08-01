import { CSSProperties, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type OverviewStats = {
  totalProfiles: number;
  contractors: number;
  businesses: number;
  personal: number;
  totalJobs: number;
  totalEnquiries: number;
  totalInvoices: number;
};

const TIER_COLOR: Record<number, string> = { 1: 'rgba(255,255,255,0.4)', 2: '#60a5fa', 3: '#f07820', 4: '#4ade80' };
const TIER_LABEL: Record<number, string> = { 1: 'Registered', 2: 'ID Verified', 3: 'Compliance Verified', 4: 'Fully Verified' };

export default function AdminOverview({ stats }: { stats: OverviewStats | null }) {
  const [tierCounts, setTierCounts] = useState<Record<number, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 });

  useEffect(() => {
    (supabase as any)
      .from('contractor_verification')
      .select('current_tier')
      .then(({ data }: { data: { current_tier: number }[] | null }) => {
        const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
        for (const row of data || []) counts[row.current_tier] = (counts[row.current_tier] || 0) + 1;
        setTierCounts(counts);
      });
  }, []);

  const cardStyle: CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '20px 24px' };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Total accounts', value: stats?.totalProfiles },
          { label: 'Contractors', value: stats?.contractors },
          { label: 'Businesses', value: stats?.businesses },
          { label: 'Personal', value: stats?.personal },
          { label: 'Jobs', value: stats?.totalJobs },
          { label: 'Enquiries', value: stats?.totalEnquiries },
          { label: 'Invoices', value: stats?.totalInvoices },
        ].map((s) => (
          <div key={s.label} style={cardStyle}>
            <div style={{ fontSize: 28, fontWeight: 600, color: '#fff', marginBottom: 4 }}>{s.value ?? 0}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <h3 style={{ color: '#e8eef4', fontSize: 16, fontWeight: 600, margin: '0 0 16px' }}>Verification breakdown</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
        {[1, 2, 3, 4].map((t) => (
          <div key={t} style={cardStyle}>
            <div style={{ fontSize: 24, fontWeight: 600, color: TIER_COLOR[t] }}>{tierCounts[t] || 0}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Tier {t} — {TIER_LABEL[t]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
