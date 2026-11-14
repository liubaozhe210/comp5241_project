'use client';

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // 构建期提示，避免部署时静默白屏
  console.warn('[supabase] NEXT_PUBLIC_SUPABASE_URL / ANON_KEY 未配置');
}

/**
 * 浏览器端 Supabase 客户端。
 * 只用 publishable/anon key 做登录拿 JWT；所有业务数据都走后端，不直连数据库。
 */
export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
