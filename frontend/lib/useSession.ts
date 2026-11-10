'use client';

import { useCallback, useEffect, useState } from 'react';

import { ApiError, apiFetch, type Me } from './api';
import { clearToken, getToken } from './token';

/**
 * 会话 hook：先看本地有没有 JWT（后端 /auth/login 签发），再换后端 profile。
 * 后端才是权限真相；这里的 me.role 只用于渲染导航。
 */
export function useSession() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    if (!getToken()) {
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
        clearToken();
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

  const signOut = useCallback(() => {
    clearToken();
    setMe(null);
  }, []);

  return { me, loading, refresh, signOut, setMe };
}
