import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

export type AdminRole = 'admin' | 'super_admin';

type AdminGuardState = {
  isAdmin: boolean | null;
  role: AdminRole;
  adminId: string;
  adminEmail: string;
};

export function useAdminGuard(): AdminGuardState {
  const [state, setState] = useState<AdminGuardState>({
    isAdmin: null,
    role: 'admin',
    adminId: '',
    adminEmail: '',
  });
  const navigate = useNavigate();

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/admin/login'); return; }

      const { data } = await (supabase as any)
        .from('admin_users')
        .select('id, email, role')
        .eq('user_id', user.id)
        .single();

      if (!data) { navigate('/admin/login'); return; }

      setState({
        isAdmin: true,
        role: (data.role === 'super_admin' ? 'super_admin' : 'admin') as AdminRole,
        adminId: data.id,
        adminEmail: data.email || user.email || '',
      });
    }
    check();
  }, [navigate]);

  return state;
}
