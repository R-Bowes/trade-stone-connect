import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { supabase } from '@/integrations/supabase/client';

type Profile = {
  id: string;
  ts_profile_code: string;
  full_name: string;
  user_type: string;
  created_at: string;
};

type Stats = {
  totalProfiles: number;
  contractors: number;
  businesses: number;
  personal: number;
  totalJobs: number;
  totalEnquiries: number;
  totalInvoices: number;
};

export default function AdminDashboard() {
  const isAdmin = useAdminGuard();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'enquiries' | 'jobs' | 'invoices'>('overview');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [enquiries, setEnquiries] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) return;
    loadData();
  }, [isAdmin]);

  async function loadData() {
    setLoading(true);
    const [profilesRes, jobsRes, enquiriesRes, invoicesRes, enquiriesDataRes, jobsDataRes, invoicesDataRes] = await Promise.all([
      supabase.from('profiles').select('id, ts_profile_code, full_name, user_type, created_at').order('created_at', { ascending: false }),
      supabase.from('jobs').select('id', { count: 'exact', head: true }),
      supabase.from('enquiries').select('id', { count: 'exact', head: true }),
      supabase.from('invoices').select('id', { count: 'exact', head: true }),
      (supabase as any).from('enquiries').select('id, status, job_description, location, created_at, customer_id, contractor_id').order('created_at', { ascending: false }),
      (supabase as any).from('jobs').select('id, status, created_at, contractor_id, customer_id').order('created_at', { ascending: false }),
      (supabase as any).from('invoices').select('id, status, total_amount, created_at, invoice_number').order('created_at', { ascending: false }),
    ]);

    const p = profilesRes.data || [];
    setProfiles(p);
    setEnquiries(enquiriesDataRes.data || []);
    setJobs(jobsDataRes.data || []);
    setInvoices(invoicesDataRes.data || []);
    setStats({
      totalProfiles: p.length,
      contractors: p.filter(x => x.user_type === 'contractor').length,
      businesses: p.filter(x => x.user_type === 'business').length,
      personal: p.filter(x => x.user_type === 'personal').length,
      totalJobs: jobsRes.count || 0,
      totalEnquiries: enquiriesRes.count || 0,
      totalInvoices: invoicesRes.count || 0,
    });
    setLoading(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate('/admin/login');
  }

  async function handleSuspend(id: string) {
    await (supabase as any).from('profiles').update({ user_type: 'suspended' }).eq('id', id);
    loadData();
  }

  async function handleReinstate(id: string) {
    await (supabase as any).from('profiles').update({ user_type: 'contractor' }).eq('id', id);
    loadData();
  }

  if (!isAdmin) return null;

  const typeColor: Record<string, { bg: string; color: string }> = {
    contractor: { bg: 'rgba(34,197,94,0.15)', color: '#4ade80' },
    business: { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa' },
    personal: { bg: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' },
    suspended: { bg: 'rgba(248,113,113,0.15)', color: '#f87171' },
  };

  const statusColor: Record<string, { bg: string; color: string }> = {
    open: { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa' },
    pending: { bg: 'rgba(234,179,8,0.15)', color: '#facc15' },
    active: { bg: 'rgba(34,197,94,0.15)', color: '#4ade80' },
    completed: { bg: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' },
    cancelled: { bg: 'rgba(248,113,113,0.15)', color: '#f87171' },
    paid: { bg: 'rgba(34,197,94,0.15)', color: '#4ade80' },
    unpaid: { bg: 'rgba(234,179,8,0.15)', color: '#facc15' },
    overdue: { bg: 'rgba(248,113,113,0.15)', color: '#f87171' },
    accepted: { bg: 'rgba(34,197,94,0.15)', color: '#4ade80' },
    declined: { bg: 'rgba(248,113,113,0.15)', color: '#f87171' },
  };

  const thStyle = { textAlign: 'left' as const, padding: '10px 16px', color: 'rgba(255,255,255,0.4)', fontWeight: 500, fontSize: 12, textTransform: 'uppercase' as const, letterSpacing: '0.06em' };
  const emptyState = (msg: string) => (
    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, padding: '32px 16px' }}>{msg}</div>
  );

  const actionBtnStyle = { background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: 'rgba(255,255,255,0.5)', fontSize: 12, padding: '4px 12px', cursor: 'pointer' };

  return (
    <div style={{ minHeight: '100vh', background: '#0f1f3d', color: '#e8eef4', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#0a1628', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/logo.png" alt="TradeStone" style={{ width: 32, height: 32, objectFit: 'contain' }} />
            <span style={{ fontWeight: 700, fontSize: 18, color: '#f07820' }}>TradeStone</span>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>/</span>
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>Admin</span>
          </div>
          <button
            onClick={handleSignOut}
            style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: 'rgba(255,255,255,0.5)', fontSize: 12, padding: '6px 14px', cursor: 'pointer' }}
          >
            Sign out
          </button>
        </div>
      </div>

      <div style={{ padding: 32 }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 32, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {(['overview', 'users', 'enquiries', 'jobs', 'invoices'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '10px 20px', fontSize: 14, fontWeight: 500,
                color: activeTab === tab ? '#f07820' : 'rgba(255,255,255,0.45)',
                borderBottom: activeTab === tab ? '2px solid #f07820' : '2px solid transparent',
                marginBottom: -1, textTransform: 'capitalize'
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading...</div>
        ) : activeTab === 'overview' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
            {[
              { label: 'Total accounts', value: stats?.totalProfiles },
              { label: 'Contractors', value: stats?.contractors },
              { label: 'Businesses', value: stats?.businesses },
              { label: 'Personal', value: stats?.personal },
              { label: 'Jobs', value: stats?.totalJobs },
              { label: 'Enquiries', value: stats?.totalEnquiries },
              { label: 'Invoices', value: stats?.totalInvoices },
            ].map(s => (
              <div key={s.label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '20px 24px' }}>
                <div style={{ fontSize: 28, fontWeight: 600, color: '#fff', marginBottom: 4 }}>{s.value ?? 0}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
              </div>
            ))}
          </div>
        ) : activeTab === 'users' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {['TS Code', 'Name', 'Type', 'Joined', 'Actions'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {profiles.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ background: 'rgba(240,120,32,0.15)', border: '1px solid rgba(240,120,32,0.3)', color: '#f07820', fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 500 }}>
                      {p.ts_profile_code}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#e8eef4' }}>{p.full_name || '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 500,
                      background: typeColor[p.user_type]?.bg || 'rgba(255,255,255,0.08)',
                      color: typeColor[p.user_type]?.color || 'rgba(255,255,255,0.5)',
                    }}>
                      {p.user_type}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                    {new Date(p.created_at).toLocaleDateString('en-GB')}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {p.user_type !== 'admin' && (
                      p.user_type === 'suspended' ? (
                        <button style={actionBtnStyle} onClick={() => handleReinstate(p.id)}>Reinstate</button>
                      ) : (
                        <button style={actionBtnStyle} onClick={() => handleSuspend(p.id)}>Suspend</button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : activeTab === 'enquiries' ? (
          enquiries.length === 0 ? emptyState('No enquiries yet') : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  {['Description', 'Location', 'Status', 'Created'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {enquiries.map(e => (
                  <tr key={e.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '12px 16px', color: '#e8eef4', maxWidth: 300 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.job_description || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.6)' }}>{e.location || '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 500,
                        background: statusColor[e.status]?.bg || 'rgba(255,255,255,0.08)',
                        color: statusColor[e.status]?.color || 'rgba(255,255,255,0.5)',
                      }}>
                        {e.status || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                      {new Date(e.created_at).toLocaleDateString('en-GB')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : activeTab === 'jobs' ? (
          jobs.length === 0 ? emptyState('No jobs yet') : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  {['Job ID', 'Status', 'Created'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jobs.map(j => (
                  <tr key={j.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ background: 'rgba(240,120,32,0.15)', border: '1px solid rgba(240,120,32,0.3)', color: '#f07820', fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 500, fontFamily: 'monospace' }}>
                        {j.id.slice(0, 8)}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 500,
                        background: statusColor[j.status]?.bg || 'rgba(255,255,255,0.08)',
                        color: statusColor[j.status]?.color || 'rgba(255,255,255,0.5)',
                      }}>
                        {j.status || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                      {new Date(j.created_at).toLocaleDateString('en-GB')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          invoices.length === 0 ? emptyState('No invoices yet') : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  {['Invoice Number', 'Status', 'Amount', 'Created'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ background: 'rgba(240,120,32,0.15)', border: '1px solid rgba(240,120,32,0.3)', color: '#f07820', fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 500 }}>
                        {inv.invoice_number || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 500,
                        background: statusColor[inv.status]?.bg || 'rgba(255,255,255,0.08)',
                        color: statusColor[inv.status]?.color || 'rgba(255,255,255,0.5)',
                      }}>
                        {inv.status || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#e8eef4' }}>
                      {inv.total_amount != null ? `£${Number(inv.total_amount).toFixed(2)}` : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                      {new Date(inv.created_at).toLocaleDateString('en-GB')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  );
}
