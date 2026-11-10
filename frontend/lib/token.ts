'use client';

/**
 * 浏览器端 JWT 存取（后端 /auth/login 签发，存 localStorage）。
 * 替代原先 Supabase Auth 的 persistSession。
 */
const TOKEN_KEY = 'coursehub.access_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
}
