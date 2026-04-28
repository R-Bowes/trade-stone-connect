import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

export function useAdminGuard() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/admin/login'); return; }

      const { data } = await (supabase as any)
        .from('admin_users')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!data) { navigate('/admin/login'); return; }
      setIsAdmin(true);
    }
    check();
  }, [navigate]);

  return isAdmin;
}