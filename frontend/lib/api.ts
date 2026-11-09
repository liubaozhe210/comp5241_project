import { supabase } from './supabase';

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000';

export type Role = 'student' | 'teacher' | 'admin';

export type Me = {
  id: string;
  login_id: string;
  name: string;
  email: string;
  role: Role;
  status: 'active' | 'disabled';
  locale: string;
};

export type Course = {
  id: string;
  code: string;
  name: string;
  description: string;
  teacher_id: string;
  semester: string;
  status: 'draft' | 'published' | 'archived';
  enrollment_policy: 'open' | 'approval' | 'closed';
  capacity: number;
  approved_count: number;
};

export type Enrollment = {
  id: string;
  course_id: string;
  student_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'dropped';
  source: 'self_apply' | 'teacher_add';
};

export type Material = {
  id: string;
  course_id: string;
  title: string;
  description: string;
  original_name: string;
  size_bytes: number;
  pages: number | null;
  created_at: string | null;
};

export class ApiError extends Error {
  status: number;
  code: string;
  detail: unknown;

  constructor(status: number, code: string, detail?: unknown) {
    super(code);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }

  /** 是否属于"未登录/无权限"，便于页面决定是否跳登录 */
  get isAuthIssue() {
    return this.status === 401 || (this.status === 403 && this.code === 'ACCOUNT_DISABLED');
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const auth = await authHeader();
  Object.entries(auth).forEach(([k, v]) => headers.set(k, v));
  if (init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers, cache: 'no-store' });
  } catch {
    throw new ApiError(0, 'NETWORK');
  }

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, (body as { code?: string })?.code ?? `HTTP_${res.status}`, (body as { detail?: unknown })?.detail);
  }
  return body as T;
}

/** 把后端错误码翻成当前语言的提示，取不到就用通用文案 */
export function errorText(error: unknown, t: (key: string) => string): string {
  if (error instanceof ApiError) {
    if (error.code === 'NETWORK') return t('errors.network');
    if (error.status === 401) return t('errors.unauthorized');
    const key = `errors.${error.code}`;
    const text = t(key);
    return text === key ? t('errors.generic') : text;
  }
  return t('errors.generic');
}
