'use client';

/**
 * 账号相关的小工具：带 JSON 的 fetch 与「什么时候需要登录」的判断。
 *
 * 原来这套逻辑只写在 /admin 页里（组件内部的 useCallback），
 * 现在设置抽屉的「站点与账号」页也要用，抽出来避免两份实现漂移。
 */

const ADMIN_COOKIE = 'ltv_session';

/** 带 JSON 头的 fetch；非 2xx 时把服务端的 error 文案抛出来 */
export async function authFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    cache: 'no-store',
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error || `请求失败（HTTP ${res.status}）`;
    throw new Error(msg);
  }
  return data as T;
}

/** 浏览器侧看站长会话 cookie 是否还在（只判有效期，真正的签名校验在服务端） */
export function hasAdminCookie(): boolean {
  if (typeof document === 'undefined') return false;
  const hit = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${ADMIN_COOKIE}=`));
  if (!hit) return false;
  const token = decodeURIComponent(hit.slice(ADMIN_COOKIE.length + 1));
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return false;
  const exp = Number(token.slice(0, dot));
  return Number.isFinite(exp) && Date.now() < exp;
}
