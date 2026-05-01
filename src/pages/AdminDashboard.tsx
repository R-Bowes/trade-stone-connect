import { CSSProperties, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { supabase } from '@/integrations/supabase/client';
import { adminDb } from '@/integrations/supabase/adminClient';

// ─── Types ────────────────────────────────────────────────────────────────────

type Profile = {
  id: string;
  ts_profile_code: string;
  full_name: string;
  user_type: string;
  email: string | null;
  trades: string[] | null;
  location: string | null;
  bio: string | null;
  stripe_account_id: string | null;
  is_verified: boolean | null;
  created_at: string;
};

type AdminUser = {
  id: string;
  user_id: string;
  email: string;
  role: string;
  created_at: string;
};

type Enquiry = {
  id: string;
  status: string;
  job_description: string | null;
  location: string | null;
  created_at: string;
  customer_id: string | null;
  contractor_id: string | null;
};

type Job = {
  id: string;
  status: string;
  created_at: string;
  contractor_id: string | null;
  customer_id: string | null;
};

type Invoice = {
  id: string;
  status: string;
  total_amount: number | null;
  created_at: string;
  invoice_number: string | null;
};

type Conversation = {
  id: string;
  initiator_id: string;
  recipient_id: string;
  subject: string;
  created_at: string;
  last_message_at: string | null;
  messages: { id: string; sender_id: string; content: string; created_at: string }[];
};

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

type ActivityEntry = {
  id: string;
  admin_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
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

type Tab = 'overview' | 'users' | 'enquiries' | 'jobs' | 'invoices' | 'messages' | 'admins' | 'settings' | 'activity';

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { isAdmin, role: adminRole, adminId, adminEmail } = useAdminGuard();
  const navigate = useNavigate();
  const isSuperAdmin = adminRole === 'super_admin';

  const [activeTab, setActiveTab] = useState<Tab>('overview');

  // Data
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [contractors, setContractors] = useState<Profile[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  // Platform settings form state
  const [commTier1, setCommTier1] = useState('6');
  const [commTier2, setCommTier2] = useState('4');
  const [commTier3, setCommTier3] = useState('2.5');
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [platformEmailName, setPlatformEmailName] = useState('TradeStone');
  const [platformEmailAddress, setPlatformEmailAddress] = useState('noreply@tradestone.com');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState('');

  // UI state — profile actions
  const [profileSlideOver, setProfileSlideOver] = useState<Profile | null>(null);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [editFields, setEditFields] = useState({ full_name: '', trade: '', location: '', bio: '', user_type: '' });
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // UI state — admin management
  const [createAdminOpen, setCreateAdminOpen] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newAdminRole, setNewAdminRole] = useState<'admin' | 'super_admin'>('admin');
  const [adminActionError, setAdminActionError] = useState('');
  const [removeAdminId, setRemoveAdminId] = useState<string | null>(null);

  // UI state — enquiry actions
  const [reassignModal, setReassignModal] = useState<Enquiry | null>(null);
  const [reassignContractorId, setReassignContractorId] = useState('');
  const [cancelEnquiryId, setCancelEnquiryId] = useState<string | null>(null);

  // UI state — job actions
  const [markCompleteJobId, setMarkCompleteJobId] = useState<string | null>(null);
  const [raiseDisputeJobId, setRaiseDisputeJobId] = useState<string | null>(null);
  const [disputeNote, setDisputeNote] = useState('');

  // UI state — invoice actions
  const [markPaidInvoiceId, setMarkPaidInvoiceId] = useState<string | null>(null);
  const [voidInvoiceId, setVoidInvoiceId] = useState<string | null>(null);

  // UI state — messages
  const [messagesSlideOver, setMessagesSlideOver] = useState<Conversation | null>(null);
  const [conversationMessages, setConversationMessages] = useState<Message[]>([]);
  const [convLoading, setConvLoading] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    loadData();
  }, [isAdmin]);

  async function loadData() {
    setLoading(true);
    const db = adminDb as any;

    const [
      profilesRes,
      jobsCountRes,
      enquiriesCountRes,
      invoicesCountRes,
      enquiriesDataRes,
      jobsDataRes,
      invoicesDataRes,
      conversationsRes,
      adminUsersRes,
      activityRes,
      settingsRes,
    ] = await Promise.all([
      db.from('profiles')
        .select('id, ts_profile_code, full_name, user_type, email, trades, location, bio, stripe_account_id, is_verified, created_at')
        .order('created_at', { ascending: false }),
      db.from('jobs').select('id', { count: 'exact', head: true }),
      db.from('enquiries').select('id', { count: 'exact', head: true }),
      db.from('invoices').select('id', { count: 'exact', head: true }),
      db.from('enquiries')
        .select('id, status, job_description, location, created_at, customer_id, contractor_id')
        .order('created_at', { ascending: false }),
      db.from('jobs')
        .select('id, status, created_at, contractor_id, customer_id')
        .order('created_at', { ascending: false }),
      db.from('invoices')
        .select('id, status, total_amount, created_at, invoice_number')
        .order('created_at', { ascending: false }),
      db.from('conversations')
        .select('id, initiator_id, recipient_id, subject, created_at, last_message_at, messages(id, sender_id, content, created_at)')
        .order('created_at', { ascending: false })
        .limit(200),
      db.from('admin_users')
        .select('id, user_id, email, role, created_at')
        .order('created_at', { ascending: true }),
      db.from('admin_activity_log')
        .select('id, admin_id, action, target_type, target_id, details, created_at')
        .order('created_at', { ascending: false })
        .limit(200),
      db.from('platform_settings').select('key, value'),
    ]);

    if (profilesRes.error)      console.error('[Admin] profiles query failed:',      profilesRes.error.message,      profilesRes.error.code, profilesRes.error.details);
    if (jobsCountRes.error)     console.error('[Admin] jobs count failed:',           jobsCountRes.error.message,     jobsCountRes.error.code, jobsCountRes.error.details);
    if (enquiriesCountRes.error) console.error('[Admin] enquiries count failed:',     enquiriesCountRes.error.message, enquiriesCountRes.error.code, enquiriesCountRes.error.details);
    if (invoicesCountRes.error) console.error('[Admin] invoices count failed:',       invoicesCountRes.error.message,  invoicesCountRes.error.code, invoicesCountRes.error.details);
    if (enquiriesDataRes.error) console.error('[Admin] enquiries query failed:',      enquiriesDataRes.error.message,  enquiriesDataRes.error.code, enquiriesDataRes.error.details);
    if (jobsDataRes.error)      console.error('[Admin] jobs query failed:',           jobsDataRes.error.message,       jobsDataRes.error.code, jobsDataRes.error.details);
    if (invoicesDataRes.error)  console.error('[Admin] invoices query failed:',       invoicesDataRes.error.message,   invoicesDataRes.error.code, invoicesDataRes.error.details);
    if (conversationsRes.error) console.error('[Admin] conversations query failed:',  conversationsRes.error.message,  conversationsRes.error.code, conversationsRes.error.details);
    if (adminUsersRes.error)    console.error('[Admin] admin_users query failed:',    adminUsersRes.error.message,     adminUsersRes.error.code, adminUsersRes.error.details);
    if (activityRes.error)      console.error('[Admin] activity log query failed:',   activityRes.error.message,       activityRes.error.code, activityRes.error.details);
    if (settingsRes.error)      console.error('[Admin] platform_settings failed:',    settingsRes.error.message,       settingsRes.error.code, settingsRes.error.details);

    const p: Profile[] = profilesRes.data || [];
    if (!profilesRes.error && p.length === 0) {
      console.warn('[Admin] profiles query returned 0 rows with no error — RLS may be blocking results. Ensure is_platform_admin() returns true for this user or set VITE_SUPABASE_SERVICE_ROLE_KEY.');
    }
    setProfiles(p);
    setContractors(p.filter((x: Profile) => x.user_type === 'contractor'));
    setEnquiries(enquiriesDataRes.data || []);
    setJobs(jobsDataRes.data || []);
    setInvoices(invoicesDataRes.data || []);
    setConversations(conversationsRes.data || []);
    setAdminUsers(adminUsersRes.data || []);
    setActivityLog(activityRes.data || []);

    const settings: Record<string, string> = {};
    for (const row of (settingsRes.data || [])) {
      settings[row.key] = row.value;
    }
    setCommTier1(settings['commission_tier_1'] || '6');
    setCommTier2(settings['commission_tier_2'] || '4');
    setCommTier3(settings['commission_tier_3'] || '2.5');
    setMaintenanceMode(settings['maintenance_mode'] === 'true');
    setPlatformEmailName(settings['platform_email_name'] || 'TradeStone');
    setPlatformEmailAddress(settings['platform_email_address'] || 'noreply@tradestone.com');

    setStats({
      totalProfiles: p.length,
      contractors: p.filter((x: Profile) => x.user_type === 'contractor').length,
      businesses: p.filter((x: Profile) => x.user_type === 'business').length,
      personal: p.filter((x: Profile) => x.user_type === 'personal').length,
      totalJobs: jobsCountRes.count || 0,
      totalEnquiries: enquiriesCountRes.count || 0,
      totalInvoices: invoicesCountRes.count || 0,
    });
    setLoading(false);
  }

  async function logActivity(action: string, targetType: string, targetId: string, details?: Record<string, unknown>) {
    if (!adminId) return;
    await (adminDb as any).from('admin_activity_log').insert({
      admin_id: adminId,
      action,
      target_type: targetType,
      target_id: targetId,
      details: details || null,
    });
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate('/admin/login');
  }

  // ── Users ────────────────────────────────────────────────────────────────

  async function handleSuspend(id: string) {
    await (adminDb as any).from('profiles').update({ user_type: 'suspended' }).eq('id', id);
    await logActivity('suspend_user', 'user', id);
    loadData();
  }

  async function handleReinstate(id: string) {
    await (adminDb as any).from('profiles').update({ user_type: 'contractor' }).eq('id', id);
    await logActivity('reinstate_user', 'user', id);
    loadData();
  }

  async function handleVerifyContractor(id: string, current: boolean | null) {
    await (adminDb as any).from('profiles').update({ is_verified: !current }).eq('id', id);
    await logActivity(current ? 'unverify_contractor' : 'verify_contractor', 'user', id);
    loadData();
  }

  async function handleEditProfile() {
    if (!editingProfile) return;
    await (adminDb as any).from('profiles').update({
      full_name: editFields.full_name,
      trades: editFields.trade ? [editFields.trade] : null,
      location: editFields.location || null,
      bio: editFields.bio || null,
      user_type: editFields.user_type,
    }).eq('id', editingProfile.id);
    await logActivity('edit_profile', 'user', editingProfile.id, editFields as unknown as Record<string, unknown>);
    setEditingProfile(null);
    loadData();
  }

  async function handleDeleteAccount(id: string) {
    await (adminDb as any).from('profiles').update({
      email: `deleted_${id}@tradestone.com`,
      full_name: 'Deleted Account',
      is_active: false,
    }).eq('id', id);
    await logActivity('delete_account', 'user', id);
    setDeleteConfirmId(null);
    loadData();
  }

  // ── Admins ───────────────────────────────────────────────────────────────

  async function handleCreateAdmin() {
    setAdminActionError('');
    if (!newAdminEmail || !newAdminPassword) {
      setAdminActionError('Email and password are required.');
      return;
    }
    // auth.admin.createUser requires service_role key. With the anon key this
    // call will fail — create the auth user in the Supabase dashboard first,
    // then it will be inserted into admin_users here.
    const { data: authData, error: createError } = await (supabase as any).auth.admin.createUser({
      email: newAdminEmail,
      password: newAdminPassword,
      email_confirm: true,
    });
    if (createError || !authData?.user) {
      setAdminActionError(
        createError?.message?.includes('not allowed') || createError?.status === 403
          ? 'Admin user creation requires service role access. Create the auth user in the Supabase dashboard, then add their user_id to admin_users manually.'
          : (createError?.message || 'Failed to create user.')
      );
      return;
    }
    const { error: insertError } = await (adminDb as any).from('admin_users').insert({
      user_id: authData.user.id,
      email: newAdminEmail,
      role: newAdminRole,
    });
    if (insertError) { setAdminActionError(insertError.message); return; }
    await logActivity('create_admin', 'admin', authData.user.id, { email: newAdminEmail, role: newAdminRole });
    setCreateAdminOpen(false);
    setNewAdminEmail('');
    setNewAdminPassword('');
    setNewAdminRole('admin');
    loadData();
  }

  async function handleRemoveAdmin(id: string) {
    const target = adminUsers.find(a => a.id === id);
    if (!target) return;
    if (target.user_id === adminId) { alert('You cannot remove yourself.'); return; }
    const superAdmins = adminUsers.filter(a => a.role === 'super_admin');
    if (target.role === 'super_admin' && superAdmins.length <= 1) {
      alert('Cannot remove the last super admin.');
      return;
    }
    await (adminDb as any).from('admin_users').delete().eq('id', id);
    await logActivity('remove_admin', 'admin', id, { email: target.email });
    setRemoveAdminId(null);
    loadData();
  }

  // ── Enquiries ────────────────────────────────────────────────────────────

  async function handleCancelEnquiry(id: string) {
    await (adminDb as any).from('enquiries').update({ status: 'cancelled' }).eq('id', id);
    await logActivity('cancel_enquiry', 'enquiry', id);
    setCancelEnquiryId(null);
    loadData();
  }

  async function handleReassignEnquiry() {
    if (!reassignModal || !reassignContractorId) return;
    await (adminDb as any).from('enquiries').update({ contractor_id: reassignContractorId }).eq('id', reassignModal.id);
    await logActivity('reassign_enquiry', 'enquiry', reassignModal.id, { new_contractor_id: reassignContractorId });
    setReassignModal(null);
    setReassignContractorId('');
    loadData();
  }

  // ── Jobs ─────────────────────────────────────────────────────────────────

  async function handleMarkJobComplete(id: string) {
    await (adminDb as any).from('jobs').update({ status: 'completed' }).eq('id', id);
    await logActivity('mark_job_complete', 'job', id);
    setMarkCompleteJobId(null);
    loadData();
  }

  async function handleRaiseDispute(id: string) {
    await (adminDb as any).from('disputes').insert({
      job_id: id,
      raised_by: adminId || null,
      status: 'open',
      notes: disputeNote || null,
    });
    await logActivity('raise_dispute', 'job', id, { notes: disputeNote });
    setRaiseDisputeJobId(null);
    setDisputeNote('');
    loadData();
  }

  // ── Invoices ─────────────────────────────────────────────────────────────

  async function handleMarkInvoicePaid(id: string) {
    await (adminDb as any).from('invoices').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', id);
    await logActivity('mark_invoice_paid', 'invoice', id);
    setMarkPaidInvoiceId(null);
    loadData();
  }

  async function handleVoidInvoice(id: string) {
    await (adminDb as any).from('invoices').update({ status: 'voided' }).eq('id', id);
    await logActivity('void_invoice', 'invoice', id);
    setVoidInvoiceId(null);
    loadData();
  }

  // ── Messages ─────────────────────────────────────────────────────────────

  async function handleViewConversation(conv: Conversation) {
    setMessagesSlideOver(conv);
    setConvLoading(true);
    const { data } = await (adminDb as any)
      .from('messages')
      .select('id, conversation_id, sender_id, content, created_at')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true });
    setConversationMessages(data || []);
    setConvLoading(false);
  }

  // ── Platform settings ────────────────────────────────────────────────────

  async function handleSavePlatformSettings() {
    setSettingsSaving(true);
    setSettingsMsg('');
    const updates = [
      { key: 'commission_tier_1', value: commTier1 },
      { key: 'commission_tier_2', value: commTier2 },
      { key: 'commission_tier_3', value: commTier3 },
      { key: 'maintenance_mode', value: maintenanceMode ? 'true' : 'false' },
      { key: 'platform_email_name', value: platformEmailName },
      { key: 'platform_email_address', value: platformEmailAddress },
    ];
    for (const u of updates) {
      await (adminDb as any).from('platform_settings').upsert({
        key: u.key,
        value: u.value,
        updated_at: new Date().toISOString(),
        updated_by: adminId || null,
      }, { onConflict: 'key' });
    }
    await logActivity('update_platform_settings', 'settings', 'platform_settings', {
      commission_tier_1: commTier1,
      commission_tier_2: commTier2,
      commission_tier_3: commTier3,
      maintenance_mode: String(maintenanceMode),
    });
    setSettingsMsg('Settings saved.');
    setSettingsSaving(false);
  }

  if (!isAdmin) return null;

  // ─── Style constants ─────────────────────────────────────────────────────

  const typeColor: Record<string, { bg: string; color: string }> = {
    contractor: { bg: 'rgba(34,197,94,0.15)', color: '#4ade80' },
    business:   { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa' },
    personal:   { bg: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' },
    suspended:  { bg: 'rgba(248,113,113,0.15)', color: '#f87171' },
  };

  const statusColor: Record<string, { bg: string; color: string }> = {
    new:       { bg: 'rgba(168,85,247,0.15)',   color: '#c084fc' },
    open:      { bg: 'rgba(59,130,246,0.15)',    color: '#60a5fa' },
    pending:   { bg: 'rgba(234,179,8,0.15)',     color: '#facc15' },
    quoted:    { bg: 'rgba(59,130,246,0.15)',    color: '#60a5fa' },
    active:    { bg: 'rgba(34,197,94,0.15)',     color: '#4ade80' },
    accepted:  { bg: 'rgba(34,197,94,0.15)',     color: '#4ade80' },
    completed: { bg: 'rgba(255,255,255,0.08)',   color: 'rgba(255,255,255,0.5)' },
    declined:  { bg: 'rgba(248,113,113,0.15)',   color: '#f87171' },
    cancelled: { bg: 'rgba(248,113,113,0.15)',   color: '#f87171' },
    paid:      { bg: 'rgba(34,197,94,0.15)',     color: '#4ade80' },
    unpaid:    { bg: 'rgba(234,179,8,0.15)',     color: '#facc15' },
    overdue:   { bg: 'rgba(248,113,113,0.15)',   color: '#f87171' },
    voided:    { bg: 'rgba(255,255,255,0.06)',   color: 'rgba(255,255,255,0.3)' },
  };

  const badge = (s: string): CSSProperties => ({
    fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 500,
    background: statusColor[s]?.bg || 'rgba(255,255,255,0.08)',
    color: statusColor[s]?.color || 'rgba(255,255,255,0.5)',
  });

  const thStyle: CSSProperties = {
    textAlign: 'left', padding: '10px 16px', color: 'rgba(255,255,255,0.4)',
    fontWeight: 500, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em',
  };
  const countStyle: CSSProperties = {
    color: 'rgba(255,255,255,0.35)', fontSize: 12, marginBottom: 12,
  };

  const btn: CSSProperties = {
    background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6,
    color: 'rgba(255,255,255,0.5)', fontSize: 12, padding: '4px 10px', cursor: 'pointer', marginRight: 4,
  };
  const btnDanger: CSSProperties = {
    background: 'none', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 6,
    color: '#f87171', fontSize: 12, padding: '4px 10px', cursor: 'pointer', marginRight: 4,
  };
  const btnSuccess: CSSProperties = {
    background: 'none', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 6,
    color: '#4ade80', fontSize: 12, padding: '4px 10px', cursor: 'pointer', marginRight: 4,
  };
  const overlay: CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 50,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const modal: CSSProperties = {
    background: '#0f1f3d', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
    padding: 32, minWidth: 400, maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto',
  };
  const inputS: CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 7,
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
    color: '#e8eef4', fontSize: 14, outline: 'none', boxSizing: 'border-box',
  };
  const labelS: CSSProperties = { fontSize: 12, color: 'rgba(255,255,255,0.45)', display: 'block', marginBottom: 5 };
  const btnPrimary: CSSProperties = {
    background: '#f07820', border: 'none', borderRadius: 7, color: '#fff',
    fontSize: 13, fontWeight: 600, padding: '9px 20px', cursor: 'pointer',
  };
  const btnSecondary: CSSProperties = {
    background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 7,
    color: 'rgba(255,255,255,0.5)', fontSize: 13, padding: '9px 20px', cursor: 'pointer',
  };

  const emptyState = (msg: string) => (
    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, padding: '32px 16px' }}>{msg}</div>
  );

  const allTabs: Tab[] = [
    'overview', 'users', 'enquiries', 'jobs', 'invoices', 'messages',
    ...(isSuperAdmin ? ['admins', 'settings'] as Tab[] : []),
    'activity',
  ];
  const tabLabel: Record<Tab, string> = {
    overview: 'Overview', users: 'Users', enquiries: 'Enquiries',
    jobs: 'Jobs', invoices: 'Invoices', messages: 'Messages',
    admins: 'Admins', settings: 'Settings', activity: 'Activity Log',
  };

  const adminEmailMap = Object.fromEntries(adminUsers.map(a => [a.id, a.email]));

  // Client-side profile lookup — used for enquiry contractor/customer columns
  // and message participant display
  const profileMap = Object.fromEntries(
    profiles.map(p => [p.id, p.full_name || p.email || p.id.slice(0, 8)])
  );

  // ─── Render ───────────────────────────────────────────────────────────────

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
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 500, marginLeft: 4,
              background: isSuperAdmin ? 'rgba(240,120,32,0.2)' : 'rgba(59,130,246,0.15)',
              color: isSuperAdmin ? '#f07820' : '#60a5fa',
              border: `1px solid ${isSuperAdmin ? 'rgba(240,120,32,0.35)' : 'rgba(59,130,246,0.3)'}`,
            }}>
              {isSuperAdmin ? 'Super Admin' : 'Admin'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>{adminEmail}</span>
            <button onClick={handleSignOut} style={btnSecondary}>Sign out</button>
          </div>
        </div>
      </div>

      <div style={{ padding: 32 }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 32, borderBottom: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap' }}>
          {allTabs.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '10px 20px', fontSize: 14, fontWeight: 500,
              color: activeTab === tab ? '#f07820' : 'rgba(255,255,255,0.45)',
              borderBottom: activeTab === tab ? '2px solid #f07820' : '2px solid transparent',
              marginBottom: -1,
            }}>
              {tabLabel[tab]}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading...</div>
        ) : (
          <>
            {/* ── OVERVIEW ─────────────────────────────────────────────── */}
            {activeTab === 'overview' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
                {[
                  { label: 'Total accounts', value: stats?.totalProfiles },
                  { label: 'Contractors',    value: stats?.contractors },
                  { label: 'Businesses',     value: stats?.businesses },
                  { label: 'Personal',       value: stats?.personal },
                  { label: 'Jobs',           value: stats?.totalJobs },
                  { label: 'Enquiries',      value: stats?.totalEnquiries },
                  { label: 'Invoices',       value: stats?.totalInvoices },
                ].map(s => (
                  <div key={s.label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '20px 24px' }}>
                    <div style={{ fontSize: 28, fontWeight: 600, color: '#fff', marginBottom: 4 }}>{s.value ?? 0}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* ── USERS ────────────────────────────────────────────────── */}
            {activeTab === 'users' && (
              <>
                <div style={countStyle}>{profiles.length} records</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      {['TS Code', 'Name', 'Type', 'Joined', 'Actions'].map(h => <th key={h} style={thStyle}>{h}</th>)}
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
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 500, background: typeColor[p.user_type]?.bg || 'rgba(255,255,255,0.08)', color: typeColor[p.user_type]?.color || 'rgba(255,255,255,0.5)' }}>
                            {p.user_type}
                          </span>
                          {p.is_verified && (
                            <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 20, fontWeight: 500, background: 'rgba(34,197,94,0.15)', color: '#4ade80', marginLeft: 5 }}>✓</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                          {new Date(p.created_at).toLocaleDateString('en-GB')}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <button style={btn} onClick={() => setProfileSlideOver(p)}>View</button>
                          <button style={btn} onClick={() => { setEditingProfile(p); setEditFields({ full_name: p.full_name || '', trade: p.trades?.[0] || '', location: p.location || '', bio: p.bio || '', user_type: p.user_type }); }}>Edit</button>
                          {p.user_type === 'contractor' && (
                            <button style={p.is_verified ? btnDanger : btnSuccess} onClick={() => handleVerifyContractor(p.id, p.is_verified)}>
                              {p.is_verified ? 'Unverify' : 'Verify'}
                            </button>
                          )}
                          {p.user_type === 'suspended'
                            ? <button style={btn} onClick={() => handleReinstate(p.id)}>Reinstate</button>
                            : <button style={btn} onClick={() => handleSuspend(p.id)}>Suspend</button>
                          }
                          {isSuperAdmin && (
                            <button style={btnDanger} onClick={() => setDeleteConfirmId(p.id)}>Delete</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {/* ── ENQUIRIES ────────────────────────────────────────────── */}
            {activeTab === 'enquiries' && (
              enquiries.length === 0 ? emptyState('No enquiries yet') : (
                <>
                  <div style={countStyle}>Showing {enquiries.length} enquiries</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        {['Description', 'Location', 'Contractor', 'Customer', 'Status', 'Created', 'Actions'].map(h => <th key={h} style={thStyle}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {enquiries.map(e => (
                        <tr key={e.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '12px 16px', color: '#e8eef4', maxWidth: 200 }}>
                            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {e.job_description || '—'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.6)' }}>{e.location || '—'}</td>
                          <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
                            {e.contractor_id ? (profileMap[e.contractor_id] || e.contractor_id.slice(0, 8)) : <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>}
                          </td>
                          <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
                            {e.customer_id ? (profileMap[e.customer_id] || e.customer_id.slice(0, 8)) : <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>}
                          </td>
                          <td style={{ padding: '12px 16px' }}><span style={badge(e.status)}>{e.status || '—'}</span></td>
                          <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                            {new Date(e.created_at).toLocaleDateString('en-GB')}
                          </td>
                          <td style={{ padding: '10px 16px' }}>
                            {e.status !== 'cancelled' && (
                              <>
                                <button style={btn} onClick={() => { setReassignModal(e); setReassignContractorId(e.contractor_id || ''); }}>Reassign</button>
                                <button style={btnDanger} onClick={() => setCancelEnquiryId(e.id)}>Cancel</button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )
            )}

            {/* ── JOBS ─────────────────────────────────────────────────── */}
            {activeTab === 'jobs' && (
              jobs.length === 0 ? emptyState('No jobs yet') : (
                <>
                  <div style={countStyle}>{jobs.length} records</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        {['Job ID', 'Status', 'Created', 'Actions'].map(h => <th key={h} style={thStyle}>{h}</th>)}
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
                          <td style={{ padding: '12px 16px' }}><span style={badge(j.status)}>{j.status || '—'}</span></td>
                          <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                            {new Date(j.created_at).toLocaleDateString('en-GB')}
                          </td>
                          <td style={{ padding: '10px 16px' }}>
                            {isSuperAdmin && j.status !== 'completed' && (
                              <button style={btnSuccess} onClick={() => setMarkCompleteJobId(j.id)}>Mark Complete</button>
                            )}
                            <button style={btn} onClick={() => setRaiseDisputeJobId(j.id)}>Raise Dispute</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )
            )}

            {/* ── INVOICES ─────────────────────────────────────────────── */}
            {activeTab === 'invoices' && (
              invoices.length === 0 ? emptyState('No invoices yet') : (
                <>
                  <div style={countStyle}>{invoices.length} records</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        {['Invoice No.', 'Status', 'Amount', 'Created', 'Actions'].map(h => <th key={h} style={thStyle}>{h}</th>)}
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
                          <td style={{ padding: '12px 16px' }}><span style={badge(inv.status)}>{inv.status || '—'}</span></td>
                          <td style={{ padding: '12px 16px', color: '#e8eef4' }}>
                            {inv.total_amount != null ? `£${Number(inv.total_amount).toFixed(2)}` : '—'}
                          </td>
                          <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                            {new Date(inv.created_at).toLocaleDateString('en-GB')}
                          </td>
                          <td style={{ padding: '10px 16px' }}>
                            {isSuperAdmin && inv.status !== 'paid' && inv.status !== 'voided' && (
                              <button style={btnSuccess} onClick={() => setMarkPaidInvoiceId(inv.id)}>Mark Paid</button>
                            )}
                            {isSuperAdmin && inv.status !== 'voided' && inv.status !== 'paid' && (
                              <button style={btnDanger} onClick={() => setVoidInvoiceId(inv.id)}>Void</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )
            )}

            {/* ── MESSAGES ─────────────────────────────────────────────── */}
            {activeTab === 'messages' && (
              conversations.length === 0 ? emptyState('No conversations yet') : (
                <>
                  <div style={countStyle}>{conversations.length} conversations</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        {['Participants', 'Subject', 'Last Message', 'Created', 'Action'].map(h => <th key={h} style={thStyle}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {conversations.map(conv => {
                        const msgs = conv.messages || [];
                        const lastMsg = msgs.length > 0
                          ? [...msgs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
                          : null;
                        return (
                          <tr key={conv.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '12px 16px' }}>
                              <div style={{ fontSize: 13, color: '#e8eef4' }}>
                                {profileMap[conv.initiator_id] || conv.initiator_id.slice(0, 8)}
                              </div>
                              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                                + {profileMap[conv.recipient_id] || conv.recipient_id.slice(0, 8)}
                              </div>
                            </td>
                            <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.7)', maxWidth: 180 }}>
                              <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {conv.subject || '—'}
                              </span>
                            </td>
                            <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.5)', maxWidth: 240, fontSize: 13 }}>
                              {lastMsg
                                ? lastMsg.content.length > 80
                                  ? lastMsg.content.slice(0, 80) + '…'
                                  : lastMsg.content
                                : <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>
                              }
                            </td>
                            <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.4)', fontSize: 13, whiteSpace: 'nowrap' }}>
                              {new Date(conv.created_at).toLocaleDateString('en-GB')}
                            </td>
                            <td style={{ padding: '10px 16px' }}>
                              <button style={btn} onClick={() => handleViewConversation(conv)}>View</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )
            )}

            {/* ── ADMINS ───────────────────────────────────────────────── */}
            {activeTab === 'admins' && isSuperAdmin && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <div style={countStyle}>{adminUsers.length} records</div>
                  <button style={btnPrimary} onClick={() => setCreateAdminOpen(true)}>+ Create Admin</button>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      {['Email', 'Role', 'Created', 'Actions'].map(h => <th key={h} style={thStyle}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {adminUsers.map(a => (
                      <tr key={a.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '12px 16px', color: '#e8eef4' }}>{a.email}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 500,
                            background: a.role === 'super_admin' ? 'rgba(240,120,32,0.15)' : 'rgba(59,130,246,0.15)',
                            color: a.role === 'super_admin' ? '#f07820' : '#60a5fa',
                          }}>
                            {a.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                          {new Date(a.created_at).toLocaleDateString('en-GB')}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {a.user_id === adminId
                            ? <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>You</span>
                            : <button style={btnDanger} onClick={() => setRemoveAdminId(a.id)}>Remove</button>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── PLATFORM SETTINGS ────────────────────────────────────── */}
            {activeTab === 'settings' && isSuperAdmin && (
              <div style={{ maxWidth: 580 }}>
                <div style={{ marginBottom: 32 }}>
                  <h3 style={{ color: '#e8eef4', fontSize: 16, fontWeight: 600, margin: '0 0 20px' }}>Commission Rates</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                    {[
                      { label: '£0 – £500',     val: commTier1, set: setCommTier1 },
                      { label: '£500 – £2,000', val: commTier2, set: setCommTier2 },
                      { label: '£2,000+',        val: commTier3, set: setCommTier3 },
                    ].map(t => (
                      <div key={t.label}>
                        <label style={labelS}>{t.label}</label>
                        <div style={{ position: 'relative' }}>
                          <input
                            value={t.val}
                            onChange={e => t.set(e.target.value)}
                            style={{ ...inputS, paddingRight: 28 }}
                            type="number" step="0.1" min="0" max="100"
                          />
                          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 32 }}>
                  <h3 style={{ color: '#e8eef4', fontSize: 16, fontWeight: 600, margin: '0 0 20px' }}>Platform Email</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label style={labelS}>Sender Name</label>
                      <input value={platformEmailName} onChange={e => setPlatformEmailName(e.target.value)} style={inputS} />
                    </div>
                    <div>
                      <label style={labelS}>Sender Address</label>
                      <input value={platformEmailAddress} onChange={e => setPlatformEmailAddress(e.target.value)} style={inputS} type="email" />
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: 32 }}>
                  <h3 style={{ color: '#e8eef4', fontSize: 16, fontWeight: 600, margin: '0 0 16px' }}>Maintenance Mode</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }} onClick={() => setMaintenanceMode(!maintenanceMode)}>
                    <div style={{
                      width: 44, height: 24, borderRadius: 12, position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                      background: maintenanceMode ? '#f07820' : 'rgba(255,255,255,0.15)',
                    }}>
                      <div style={{
                        position: 'absolute', top: 2, left: maintenanceMode ? 22 : 2,
                        width: 20, height: 20, borderRadius: 10, background: '#fff', transition: 'left 0.2s',
                      }} />
                    </div>
                    <span style={{ fontSize: 14, color: maintenanceMode ? '#f07820' : 'rgba(255,255,255,0.5)' }}>
                      {maintenanceMode ? 'ON — non-admins see a maintenance banner' : 'Off'}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <button onClick={handleSavePlatformSettings} disabled={settingsSaving} style={{ ...btnPrimary, opacity: settingsSaving ? 0.6 : 1 }}>
                    {settingsSaving ? 'Saving…' : 'Save Settings'}
                  </button>
                  {settingsMsg && <span style={{ fontSize: 13, color: '#4ade80' }}>{settingsMsg}</span>}
                </div>
              </div>
            )}

            {/* ── ACTIVITY LOG ─────────────────────────────────────────── */}
            {activeTab === 'activity' && (
              activityLog.length === 0 ? emptyState('No activity recorded yet') : (
                <>
                  <div style={countStyle}>{activityLog.length} records</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        {['Time', 'Admin', 'Action', 'Target', 'ID'].map(h => <th key={h} style={thStyle}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {activityLog.map(entry => (
                        <tr key={entry.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '9px 16px', color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap', fontSize: 12 }}>
                            {new Date(entry.created_at).toLocaleString('en-GB')}
                          </td>
                          <td style={{ padding: '9px 16px', color: 'rgba(255,255,255,0.55)' }}>
                            {entry.admin_id ? (adminEmailMap[entry.admin_id] || entry.admin_id.slice(0, 8)) : '—'}
                          </td>
                          <td style={{ padding: '9px 16px', color: '#e8eef4', fontFamily: 'monospace', fontSize: 12 }}>{entry.action}</td>
                          <td style={{ padding: '9px 16px', color: 'rgba(255,255,255,0.45)' }}>{entry.target_type || '—'}</td>
                          <td style={{ padding: '9px 16px', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', fontSize: 11 }}>
                            {entry.target_id ? entry.target_id.slice(0, 14) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )
            )}
          </>
        )}
      </div>

      {/* ═══ MODALS ═══════════════════════════════════════════════════════════ */}

      {/* Profile slide-over */}
      {profileSlideOver && (
        <div style={overlay} onClick={() => setProfileSlideOver(null)}>
          <div
            style={{ ...modal, position: 'fixed', right: 0, top: 0, bottom: 0, borderRadius: '12px 0 0 12px', maxHeight: '100vh', minWidth: 380 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ color: '#e8eef4', fontSize: 18, fontWeight: 600, margin: 0 }}>User Profile</h2>
              <button onClick={() => setProfileSlideOver(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>
            {([
              ['TS Code',         profileSlideOver.ts_profile_code],
              ['Full Name',       profileSlideOver.full_name],
              ['Email',           profileSlideOver.email],
              ['Account Type',    profileSlideOver.user_type],
              ['Trade',           profileSlideOver.trades?.join(', ')],
              ['Location',        profileSlideOver.location],
              ['Bio',             profileSlideOver.bio],
              ['Stripe Account',  profileSlideOver.stripe_account_id],
              ['Verified',        profileSlideOver.is_verified ? 'Yes' : 'No'],
              ['Created',         new Date(profileSlideOver.created_at).toLocaleString('en-GB')],
            ] as [string, string | null | undefined][]).map(([lbl, val]) => (
              <div key={lbl} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{lbl}</div>
                <div style={{ fontSize: 14, color: val ? '#e8eef4' : 'rgba(255,255,255,0.2)' }}>{val || '—'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit profile */}
      {editingProfile && (
        <div style={overlay} onClick={() => setEditingProfile(null)}>
          <div style={modal} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: '#e8eef4', fontSize: 18, fontWeight: 600, margin: '0 0 24px' }}>Edit Profile</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={labelS}>Full Name</label><input value={editFields.full_name} onChange={e => setEditFields(f => ({ ...f, full_name: e.target.value }))} style={inputS} /></div>
              <div>
                <label style={labelS}>Account Type</label>
                <select value={editFields.user_type} onChange={e => setEditFields(f => ({ ...f, user_type: e.target.value }))} style={{ ...inputS, cursor: 'pointer' }}>
                  {['contractor', 'business', 'personal', 'suspended'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div><label style={labelS}>Trade</label><input value={editFields.trade} onChange={e => setEditFields(f => ({ ...f, trade: e.target.value }))} style={inputS} /></div>
              <div><label style={labelS}>Location</label><input value={editFields.location} onChange={e => setEditFields(f => ({ ...f, location: e.target.value }))} style={inputS} /></div>
              <div><label style={labelS}>Bio</label><textarea value={editFields.bio} onChange={e => setEditFields(f => ({ ...f, bio: e.target.value }))} style={{ ...inputS, minHeight: 80, resize: 'vertical' }} /></div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditingProfile(null)} style={btnSecondary}>Cancel</button>
              <button onClick={handleEditProfile} style={btnPrimary}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete account confirm */}
      {deleteConfirmId && (
        <div style={overlay} onClick={() => setDeleteConfirmId(null)}>
          <div style={modal} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: '#f87171', fontSize: 18, fontWeight: 600, margin: '0 0 12px' }}>Delete Account</h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginBottom: 24 }}>
              This will anonymise the email to <code style={{ color: '#f07820' }}>deleted_[id]@tradestone.com</code> and set <code style={{ color: '#f07820' }}>is_active = false</code>. This cannot be undone from the dashboard.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteConfirmId(null)} style={btnSecondary}>Cancel</button>
              <button onClick={() => handleDeleteAccount(deleteConfirmId)} style={{ ...btnPrimary, background: '#ef4444' }}>Delete Account</button>
            </div>
          </div>
        </div>
      )}

      {/* Create admin */}
      {createAdminOpen && (
        <div style={overlay} onClick={() => { setCreateAdminOpen(false); setAdminActionError(''); }}>
          <div style={modal} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: '#e8eef4', fontSize: 18, fontWeight: 600, margin: '0 0 24px' }}>Create Admin Account</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={labelS}>Email</label><input value={newAdminEmail} onChange={e => setNewAdminEmail(e.target.value)} style={inputS} type="email" /></div>
              <div><label style={labelS}>Password</label><input value={newAdminPassword} onChange={e => setNewAdminPassword(e.target.value)} style={inputS} type="password" /></div>
              <div>
                <label style={labelS}>Role</label>
                <select value={newAdminRole} onChange={e => setNewAdminRole(e.target.value as 'admin' | 'super_admin')} style={{ ...inputS, cursor: 'pointer' }}>
                  <option value="admin">Admin</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>
            </div>
            {adminActionError && (
              <div style={{ fontSize: 13, color: '#f87171', background: 'rgba(248,113,113,0.1)', padding: '10px 14px', borderRadius: 8, marginTop: 14 }}>
                {adminActionError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              <button onClick={() => { setCreateAdminOpen(false); setAdminActionError(''); }} style={btnSecondary}>Cancel</button>
              <button onClick={handleCreateAdmin} style={btnPrimary}>Create Admin</button>
            </div>
          </div>
        </div>
      )}

      {/* Remove admin confirm */}
      {removeAdminId && (
        <div style={overlay} onClick={() => setRemoveAdminId(null)}>
          <div style={modal} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: '#f87171', fontSize: 18, fontWeight: 600, margin: '0 0 12px' }}>Remove Admin</h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginBottom: 24 }}>
              Remove <strong style={{ color: '#e8eef4' }}>{adminUsers.find(a => a.id === removeAdminId)?.email}</strong> from admin access? They will no longer be able to log in to the admin panel.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setRemoveAdminId(null)} style={btnSecondary}>Cancel</button>
              <button onClick={() => handleRemoveAdmin(removeAdminId)} style={{ ...btnPrimary, background: '#ef4444' }}>Remove Admin</button>
            </div>
          </div>
        </div>
      )}

      {/* Reassign enquiry */}
      {reassignModal && (
        <div style={overlay} onClick={() => setReassignModal(null)}>
          <div style={modal} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: '#e8eef4', fontSize: 18, fontWeight: 600, margin: '0 0 24px' }}>Reassign Enquiry</h2>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, margin: '0 0 20px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {reassignModal.job_description?.slice(0, 80) || 'Enquiry'}
            </p>
            <div>
              <label style={labelS}>Assign to Contractor</label>
              <select value={reassignContractorId} onChange={e => setReassignContractorId(e.target.value)} style={{ ...inputS, cursor: 'pointer' }}>
                <option value="">— Select contractor —</option>
                {contractors.map(c => (
                  <option key={c.id} value={c.id}>{c.full_name || c.email || c.id.slice(0, 8)}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              <button onClick={() => setReassignModal(null)} style={btnSecondary}>Cancel</button>
              <button onClick={handleReassignEnquiry} disabled={!reassignContractorId} style={{ ...btnPrimary, opacity: reassignContractorId ? 1 : 0.5, cursor: reassignContractorId ? 'pointer' : 'not-allowed' }}>
                Reassign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel enquiry confirm */}
      {cancelEnquiryId && (
        <div style={overlay} onClick={() => setCancelEnquiryId(null)}>
          <div style={modal} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: '#f87171', fontSize: 18, fontWeight: 600, margin: '0 0 12px' }}>Cancel Enquiry</h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginBottom: 24 }}>
              Set this enquiry status to <strong>cancelled</strong>. Notify both parties separately as needed.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setCancelEnquiryId(null)} style={btnSecondary}>Go Back</button>
              <button onClick={() => handleCancelEnquiry(cancelEnquiryId)} style={{ ...btnPrimary, background: '#ef4444' }}>Confirm Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Mark job complete confirm */}
      {markCompleteJobId && (
        <div style={overlay} onClick={() => setMarkCompleteJobId(null)}>
          <div style={modal} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: '#e8eef4', fontSize: 18, fontWeight: 600, margin: '0 0 12px' }}>Mark Job Complete</h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginBottom: 24 }}>
              Force this job to <strong>completed</strong> status. This action is logged.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setMarkCompleteJobId(null)} style={btnSecondary}>Cancel</button>
              <button onClick={() => handleMarkJobComplete(markCompleteJobId)} style={btnPrimary}>Mark Complete</button>
            </div>
          </div>
        </div>
      )}

      {/* Raise dispute */}
      {raiseDisputeJobId && (
        <div style={overlay} onClick={() => { setRaiseDisputeJobId(null); setDisputeNote(''); }}>
          <div style={modal} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: '#e8eef4', fontSize: 18, fontWeight: 600, margin: '0 0 24px' }}>Raise Dispute</h2>
            <div>
              <label style={labelS}>Notes (optional)</label>
              <textarea value={disputeNote} onChange={e => setDisputeNote(e.target.value)} style={{ ...inputS, minHeight: 80, resize: 'vertical' }} placeholder="Describe the reason for the dispute…" />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              <button onClick={() => { setRaiseDisputeJobId(null); setDisputeNote(''); }} style={btnSecondary}>Cancel</button>
              <button onClick={() => handleRaiseDispute(raiseDisputeJobId)} style={btnPrimary}>Raise Dispute</button>
            </div>
          </div>
        </div>
      )}

      {/* Mark invoice paid confirm */}
      {markPaidInvoiceId && (
        <div style={overlay} onClick={() => setMarkPaidInvoiceId(null)}>
          <div style={modal} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: '#e8eef4', fontSize: 18, fontWeight: 600, margin: '0 0 12px' }}>Mark Invoice as Paid</h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginBottom: 24 }}>
              Manually mark this invoice as <strong>paid</strong>. Use only when payment was received outside of Stripe.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setMarkPaidInvoiceId(null)} style={btnSecondary}>Cancel</button>
              <button onClick={() => handleMarkInvoicePaid(markPaidInvoiceId)} style={btnPrimary}>Mark Paid</button>
            </div>
          </div>
        </div>
      )}

      {/* Void invoice confirm */}
      {voidInvoiceId && (
        <div style={overlay} onClick={() => setVoidInvoiceId(null)}>
          <div style={modal} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: '#f87171', fontSize: 18, fontWeight: 600, margin: '0 0 12px' }}>Void Invoice</h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginBottom: 24 }}>
              Set this invoice to <strong>voided</strong>. This cannot be undone from the dashboard.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setVoidInvoiceId(null)} style={btnSecondary}>Cancel</button>
              <button onClick={() => handleVoidInvoice(voidInvoiceId)} style={{ ...btnPrimary, background: '#ef4444' }}>Void Invoice</button>
            </div>
          </div>
        </div>
      )}

      {/* Conversation thread slide-over */}
      {messagesSlideOver && (
        <div style={overlay} onClick={() => { setMessagesSlideOver(null); setConversationMessages([]); }}>
          <div
            style={{ ...modal, position: 'fixed', right: 0, top: 0, bottom: 0, borderRadius: '12px 0 0 12px', maxHeight: '100vh', minWidth: 440, maxWidth: 560, display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, flexShrink: 0 }}>
              <div>
                <h2 style={{ color: '#e8eef4', fontSize: 17, fontWeight: 600, margin: '0 0 4px' }}>
                  {messagesSlideOver.subject || 'Conversation'}
                </h2>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                  {profileMap[messagesSlideOver.initiator_id] || messagesSlideOver.initiator_id.slice(0, 8)}
                  <span style={{ margin: '0 6px', color: 'rgba(255,255,255,0.2)' }}>↔</span>
                  {profileMap[messagesSlideOver.recipient_id] || messagesSlideOver.recipient_id.slice(0, 8)}
                </div>
              </div>
              <button onClick={() => { setMessagesSlideOver(null); setConversationMessages([]); }} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 20, cursor: 'pointer', flexShrink: 0, marginLeft: 12 }}>✕</button>
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 16, paddingTop: 16, flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {convLoading ? (
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Loading messages…</div>
              ) : conversationMessages.length === 0 ? (
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>No messages in this conversation.</div>
              ) : (
                conversationMessages.map(msg => (
                  <div key={msg.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#e8eef4' }}>
                        {profileMap[msg.sender_id] || msg.sender_id.slice(0, 8)}
                      </span>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginLeft: 12 }}>
                        {new Date(msg.created_at).toLocaleString('en-GB')}
                      </span>
                    </div>
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 1.55 }}>
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
