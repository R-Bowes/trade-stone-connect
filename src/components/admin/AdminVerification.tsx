import { CSSProperties, Fragment, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

type PendingCredential = {
  id: string;
  contractor_id: string;
  name: string;
  issuer: string | null;
  credential_type: string | null;
  reference_number: string | null;
  document_path: string | null;
  expires_at: string | null;
  created_at: string | null;
};

type VerificationRow = {
  contractor_id: string;
  current_tier: number;
  identity_verified: boolean;
  phone_verified: boolean;
  insurance_verified: boolean;
  insurance_expires_at: string | null;
  dbs_verified: boolean;
  dbs_expires_at: string | null;
  companies_house_status: string | null;
  suspended: boolean;
  suspended_reason: string | null;
  updated_at: string;
};

type ProfileLite = {
  id: string;
  full_name: string | null;
  ts_profile_code: string | null;
};

type Credential = {
  id: string;
  name: string;
  issuer: string | null;
  verified: boolean | null;
  verified_at: string | null;
  expires_at: string | null;
  rejection_reason: string | null;
};

type TierFilter = 'all' | 1 | 2 | 3 | 4;

const thStyle: CSSProperties = {
  textAlign: 'left', padding: '10px 16px', color: 'rgba(255,255,255,0.4)',
  fontWeight: 500, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em',
};
const btn: CSSProperties = {
  background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6,
  color: 'rgba(255,255,255,0.5)', fontSize: 12, padding: '4px 10px', cursor: 'pointer', marginRight: 4,
};
const btnSuccess: CSSProperties = {
  background: 'none', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 6,
  color: '#4ade80', fontSize: 12, padding: '4px 10px', cursor: 'pointer', marginRight: 4,
};
const btnDanger: CSSProperties = {
  background: 'none', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 6,
  color: '#f87171', fontSize: 12, padding: '4px 10px', cursor: 'pointer', marginRight: 4,
};
const countStyle: CSSProperties = { color: 'rgba(255,255,255,0.35)', fontSize: 12, marginBottom: 12 };
const emptyState = (msg: string) => (
  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, padding: '32px 16px' }}>{msg}</div>
);
const inputS: CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 7,
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#e8eef4', fontSize: 14, outline: 'none', boxSizing: 'border-box',
};
const labelS: CSSProperties = { fontSize: 12, color: 'rgba(255,255,255,0.45)', display: 'block', marginBottom: 5 };
const overlay: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 50,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const modal: CSSProperties = {
  background: '#0f1f3d', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
  padding: 32, minWidth: 400, maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto',
};
const btnPrimary: CSSProperties = {
  background: '#f07820', border: 'none', borderRadius: 7, color: '#fff',
  fontSize: 13, fontWeight: 600, padding: '9px 20px', cursor: 'pointer',
};
const btnSecondary: CSSProperties = {
  background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 7,
  color: 'rgba(255,255,255,0.5)', fontSize: 13, padding: '9px 20px', cursor: 'pointer',
};

const TIER_LABEL: Record<number, string> = { 1: 'Registered', 2: 'ID Verified', 3: 'Compliance Verified', 4: 'Fully Verified' };
const TIER_COLOR: Record<number, string> = { 1: 'rgba(255,255,255,0.4)', 2: '#60a5fa', 3: '#f07820', 4: '#4ade80' };

function Check({ ok }: { ok: boolean }) {
  return <span style={{ color: ok ? '#4ade80' : '#f87171', fontWeight: 700 }}>{ok ? '✓' : '✕'}</span>;
}

export default function AdminVerification() {
  const [pending, setPending] = useState<PendingCredential[]>([]);
  const [verifications, setVerifications] = useState<VerificationRow[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, ProfileLite>>({});
  const [credentialCounts, setCredentialCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedCredentials, setExpandedCredentials] = useState<Credential[]>([]);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [suspendingId, setSuspendingId] = useState<string | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const db = supabase as any;

    const [pendingRes, verificationRes] = await Promise.all([
      db.from('contractor_credentials')
        .select('id, contractor_id, name, issuer, credential_type, reference_number, document_path, expires_at, created_at')
        .eq('verified', false)
        .is('rejection_reason', null)
        .order('created_at', { ascending: true }),
      db.from('contractor_verification')
        .select('contractor_id, current_tier, identity_verified, phone_verified, insurance_verified, insurance_expires_at, dbs_verified, dbs_expires_at, companies_house_status, suspended, suspended_reason, updated_at')
        .order('current_tier', { ascending: true }),
    ]);

    const pendingRows: PendingCredential[] = pendingRes.data || [];
    const verificationRows: VerificationRow[] = verificationRes.data || [];
    setPending(pendingRows);
    setVerifications(verificationRows);

    const contractorIds = Array.from(new Set([
      ...pendingRows.map((r) => r.contractor_id),
      ...verificationRows.map((r) => r.contractor_id),
    ]));

    if (contractorIds.length > 0) {
      const { data: profileRows } = await db
        .from('profiles')
        .select('id, full_name, ts_profile_code')
        .in('id', contractorIds);
      const map: Record<string, ProfileLite> = {};
      for (const p of profileRows || []) map[p.id] = p;
      setProfileMap(map);

      const { data: credRows } = await db
        .from('contractor_credentials')
        .select('contractor_id, verified')
        .in('contractor_id', contractorIds)
        .eq('verified', true);
      const counts: Record<string, number> = {};
      for (const c of credRows || []) counts[c.contractor_id] = (counts[c.contractor_id] || 0) + 1;
      setCredentialCounts(counts);
    }

    setLoading(false);
  }

  async function handleViewDocument(path: string) {
    const { data, error } = await supabase.storage.from('contractor-compliance-documents').createSignedUrl(path, 300);
    if (error || !data) { setMsg(`Error: ${error?.message || 'Could not open document'}`); return; }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function handleVerify(credentialId: string) {
    setMsg('');
    const { data, error } = await (supabase as any).rpc('admin_verify_credential', { p_credential_id: credentialId, p_approve: true });
    if (error) { setMsg(`Error: ${error.message}`); return; }
    setMsg(`Credential verified — contractor advanced to Tier ${data?.current_tier ?? '?'}.`);
    await loadData();
  }

  async function handleReject() {
    if (!rejectingId) return;
    const { error } = await (supabase as any).rpc('admin_verify_credential', {
      p_credential_id: rejectingId, p_approve: false, p_rejection_reason: rejectionReason || null,
    });
    if (error) { setMsg(`Error: ${error.message}`); }
    setRejectingId(null);
    setRejectionReason('');
    await loadData();
  }

  async function handleExpand(contractorId: string) {
    if (expandedId === contractorId) { setExpandedId(null); return; }
    setExpandedId(contractorId);
    const { data } = await (supabase as any)
      .from('contractor_credentials')
      .select('id, name, issuer, verified, verified_at, expires_at, rejection_reason')
      .eq('contractor_id', contractorId)
      .order('display_order', { ascending: true });
    setExpandedCredentials(data || []);
  }

  async function updateVerification(contractorId: string, patch: Record<string, unknown>) {
    setMsg('');
    const { error } = await (supabase as any).rpc('admin_update_verification', { p_contractor_id: contractorId, ...patch });
    if (error) { setMsg(`Error: ${error.message}`); return; }
    await loadData();
  }

  async function handleSuspend() {
    if (!suspendingId) return;
    await updateVerification(suspendingId, { p_suspended: true, p_suspended_reason: suspendReason || null });
    setSuspendingId(null);
    setSuspendReason('');
  }

  async function handleUnsuspend(contractorId: string) {
    await updateVerification(contractorId, { p_suspended: false });
  }

  const filteredVerifications = useMemo(() => {
    if (tierFilter === 'all') return verifications;
    return verifications.filter((v) => v.current_tier === tierFilter);
  }, [verifications, tierFilter]);

  const tierBreakdown = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const v of verifications) counts[v.current_tier] = (counts[v.current_tier] || 0) + 1;
    return counts;
  }, [verifications]);

  if (loading) return <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading...</div>;

  return (
    <div>
      {msg && (
        <div style={{ fontSize: 13, color: msg.startsWith('Error') ? '#f87171' : '#4ade80', marginBottom: 16 }}>{msg}</div>
      )}

      {/* Tier breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 32 }}>
        {[1, 2, 3, 4].map((t) => (
          <div key={t} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 22, fontWeight: 600, color: TIER_COLOR[t] }}>{tierBreakdown[t] || 0}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>Tier {t} — {TIER_LABEL[t]}</div>
          </div>
        ))}
      </div>

      {/* Pending queue */}
      <h3 style={{ color: '#e8eef4', fontSize: 16, fontWeight: 600, margin: '0 0 12px' }}>Pending Verifications</h3>
      {pending.length === 0 ? emptyState('No pending credential submissions') : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginBottom: 40 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              {['Contractor', 'Credential', 'Type', 'Reference', 'Document', 'Expires', 'Actions'].map((h) => <th key={h} style={thStyle}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {pending.map((c) => {
              const profile = profileMap[c.contractor_id];
              return (
                <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ color: '#e8eef4' }}>{profile?.full_name || '—'}</div>
                    <div style={{ fontSize: 11, color: '#f07820', fontFamily: 'monospace' }}>{profile?.ts_profile_code}</div>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#e8eef4' }}>
                    {c.name}
                    {c.issuer && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{c.issuer}</div>}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.6)' }}>{c.credential_type || '—'}</td>
                  <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', fontSize: 12 }}>{c.reference_number || '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    {c.document_path
                      ? <button style={btn} onClick={() => handleViewDocument(c.document_path as string)}>View Document</button>
                      : <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                    {c.expires_at ? new Date(c.expires_at).toLocaleDateString('en-GB') : '—'}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <button style={btnSuccess} onClick={() => handleVerify(c.id)}>Verify</button>
                    <button style={btnDanger} onClick={() => setRejectingId(c.id)}>Reject</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Overview table */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ color: '#e8eef4', fontSize: 16, fontWeight: 600, margin: 0 }}>Contractor Verification Overview</h3>
        <select value={String(tierFilter)} onChange={(e) => setTierFilter(e.target.value === 'all' ? 'all' : Number(e.target.value) as TierFilter)} style={{ ...inputS, width: 160, cursor: 'pointer' }}>
          <option value="all">All tiers</option>
          <option value="1">Tier 1</option>
          <option value="2">Tier 2</option>
          <option value="3">Tier 3</option>
          <option value="4">Tier 4</option>
        </select>
      </div>
      <div style={countStyle}>{filteredVerifications.length} contractors</div>
      {filteredVerifications.length === 0 ? emptyState('No contractors match this filter') : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              {['Contractor', 'TS Code', 'Tier', 'Identity', 'Phone', 'Insurance', 'DBS', 'Companies House', 'Credentials', 'Updated', ''].map((h) => <th key={h} style={thStyle}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filteredVerifications.map((v) => {
              const profile = profileMap[v.contractor_id];
              const isExpanded = expandedId === v.contractor_id;
              return (
                <Fragment key={v.contractor_id}>
                  <tr
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}
                    onClick={() => handleExpand(v.contractor_id)}
                  >
                    <td style={{ padding: '12px 16px', color: '#e8eef4' }}>{profile?.full_name || '—'}</td>
                    <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', fontSize: 12 }}>{profile?.ts_profile_code}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 500, background: 'rgba(255,255,255,0.08)', color: TIER_COLOR[v.current_tier] }}>
                        Tier {v.current_tier}
                      </span>
                      {v.suspended && <span style={{ marginLeft: 6, fontSize: 11, color: '#f87171' }}>Suspended</span>}
                    </td>
                    <td style={{ padding: '12px 16px' }}><Check ok={v.identity_verified} /></td>
                    <td style={{ padding: '12px 16px' }}><Check ok={v.phone_verified} /></td>
                    <td style={{ padding: '12px 16px' }}><Check ok={v.insurance_verified} /></td>
                    <td style={{ padding: '12px 16px' }}><Check ok={v.dbs_verified} /></td>
                    <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>{v.companies_house_status || '—'}</td>
                    <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.6)' }}>{credentialCounts[v.contractor_id] || 0}</td>
                    <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{new Date(v.updated_at).toLocaleDateString('en-GB')}</td>
                    <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.3)' }}>{isExpanded ? '▲' : '▼'}</td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={10} style={{ padding: '16px 24px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
                          <div style={{ flex: '1 1 260px' }}>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Credentials</div>
                            {expandedCredentials.length === 0 ? (
                              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>No credentials submitted.</div>
                            ) : (
                              expandedCredentials.map((c) => (
                                <div key={c.id} style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 6 }}>
                                  {c.name} {c.issuer ? `· ${c.issuer}` : ''} —{' '}
                                  <span style={{ color: c.verified ? '#4ade80' : c.rejection_reason ? '#f87171' : 'rgba(255,255,255,0.4)' }}>
                                    {c.verified ? 'Verified' : c.rejection_reason ? `Rejected: ${c.rejection_reason}` : 'Pending'}
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                          <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Manual actions</div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>
                              <input type="checkbox" checked={v.identity_verified} onChange={(e) => updateVerification(v.contractor_id, { p_identity_verified: e.target.checked })} />
                              Identity verified
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>
                              <input type="checkbox" checked={v.phone_verified} onChange={(e) => updateVerification(v.contractor_id, { p_phone_verified: e.target.checked })} />
                              Phone verified
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>
                              <input type="checkbox" checked={v.dbs_verified} onChange={(e) => updateVerification(v.contractor_id, { p_dbs_verified: e.target.checked })} />
                              DBS verified
                            </label>
                            <div>
                              <label style={labelS}>DBS expiry</label>
                              <input
                                type="date"
                                defaultValue={v.dbs_expires_at || ''}
                                onBlur={(e) => e.target.value && updateVerification(v.contractor_id, { p_dbs_expires_at: e.target.value })}
                                style={inputS}
                              />
                            </div>
                            <div>
                              <label style={labelS}>Companies House status</label>
                              <select
                                defaultValue={v.companies_house_status || ''}
                                onChange={(e) => e.target.value && updateVerification(v.contractor_id, { p_companies_house_status: e.target.value })}
                                style={{ ...inputS, cursor: 'pointer' }}
                              >
                                <option value="">—</option>
                                <option value="active">Active</option>
                                <option value="dissolved">Dissolved</option>
                                <option value="not_applicable">Not applicable</option>
                              </select>
                            </div>
                            {v.suspended ? (
                              <button style={btnSuccess} onClick={() => handleUnsuspend(v.contractor_id)}>Reinstate</button>
                            ) : (
                              <button style={btnDanger} onClick={() => setSuspendingId(v.contractor_id)}>Suspend contractor</button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Reject dialog */}
      {rejectingId && (
        <div style={overlay} onClick={() => { setRejectingId(null); setRejectionReason(''); }}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: '#e8eef4', fontSize: 18, fontWeight: 600, margin: '0 0 20px' }}>Reject Credential</h2>
            <label style={labelS}>Reason</label>
            <textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} style={{ ...inputS, minHeight: 80, resize: 'vertical' }} placeholder="e.g. Document illegible, reference number doesn't match register" />
            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              <button onClick={() => { setRejectingId(null); setRejectionReason(''); }} style={btnSecondary}>Cancel</button>
              <button onClick={handleReject} style={{ ...btnPrimary, background: '#ef4444' }}>Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* Suspend dialog */}
      {suspendingId && (
        <div style={overlay} onClick={() => { setSuspendingId(null); setSuspendReason(''); }}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: '#f87171', fontSize: 18, fontWeight: 600, margin: '0 0 20px' }}>Suspend Contractor</h2>
            <label style={labelS}>Reason</label>
            <textarea value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} style={{ ...inputS, minHeight: 80, resize: 'vertical' }} placeholder="Reason for suspension" />
            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              <button onClick={() => { setSuspendingId(null); setSuspendReason(''); }} style={btnSecondary}>Cancel</button>
              <button onClick={handleSuspend} style={{ ...btnPrimary, background: '#ef4444' }}>Suspend</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
