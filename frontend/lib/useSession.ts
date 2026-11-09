'use client';

import { useCallback, useEffect, useState } from 'react';

import { ApiError, apiFetch, type Me } from './api';
import { supabase } from './supabase';

/**
 * 会话 hook：先看 Supabase 有没有 session，再用 JWT 换后端 profile。
 * 后端才是权限真相；这里的 me.role 只用于渲染导航。
 */
export function useSession() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setMe(null);
      setLoading(false);
      return null;
    }
    try {
      const profile = await apiFetch<Me>('/auth/me');
      setMe(profile);
      return profile;
    } catch (error) {
      // 账号被禁用或 profile 缺失：清掉本地会话，避免反复 401
      if (error instanceof ApiError && (error.status === 401 || error.code === 'ACCOUNT_DISABLED')) {
        await supabase.auth.signOut();
      }
      setMe(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setMe(null);
  }, []);

  return { me, loading, refresh, signOut, setMe };
}
