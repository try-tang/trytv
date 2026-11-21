'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { STATUS_QUERY_KEY } from '@/lib/client-api';
import { useToast } from './toast';

/**
 * 站点访问策略 + 本站账号状态（客户端）。
 *
 * 数据来源是 /api/status（与 AuthProvider、Providers 共用同一 query，不会多发请求）。
 * 这里只负责三件事：
 * 1. 告诉 UI 「现在谁能看」：open / login / members；
 * 2. 站长密码登录态（admin）与普通账号登录态（user）分开暴露，后台只认前者；
 * 3. 登录 / 注册 / 登出三个动作，成功后统一失效查询缓存。
 */

export type AccessMode = 'open' | 'login' | 'members';

export interface CurrentUser {
  id: string;
  username: string;
  nick?: string;
  role: 'user' | 'admin';
  createdAt: number;
  lastLoginAt?: number;
}

interface AccessState {
  ready: boolean;
  accessMode: AccessMode;
  allowRegister: boolean;
  /** 站长密码已登录 */
  admin: boolean;
  /** 本站账号已登录 */
  user: CurrentUser | null;
  /** 后台覆盖的站名 / 口号 / 顶部提示（null 表示用代码默认值） */
  siteName: string | null;
  slogan: string | null;
  banner: string | null;
  /** 是否能看内容 */
  canView: boolean;
  /** 是否需要（并且值得）挡住内容：open 模式永远 false */
  gated: boolean;
  refresh: () => Promise<void>;
  loginUser: (username: string, password: string) => Promise<void>;
  registerUser: (username: string, password: string, nick?: string) => Promise<void>;
  logoutUser: () => Promise<void>;
}

const DEFAULTS: AccessState = {
  ready: false,
  accessMode: 'open',
  allowRegister: true,
  admin: false,
  user: null,
  siteName: null,
  slogan: null,
  banner: null,
  canView: true,
  gated: false,
  refresh: async () => {},
  loginUser: async () => {},
  registerUser: async () => {},
  logoutUser: async () => {},
};

const AccessContext = createContext<AccessState>(DEFAULTS);

export function useAccess(): AccessState {
  return useContext(AccessContext);
}

async function userRequest<T>(init?: RequestInit): Promise<T> {
  const res = await fetch('/api/user', {
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
    const msg =
      (data as { error?: string } | null)?.error || `请求失败（HTTP ${res.status}）`;
    throw new Error(msg);
  }
  return data as T;
}

export function AccessProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [accessMode, setAccessMode] = useState<AccessMode>('open');
  const [allowRegister, setAllowRegister] = useState(true);
  const [admin, setAdmin] = useState(false);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [siteName, setSiteName] = useState<string | null>(null);
  const [slogan, setSlogan] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await userRequest<{
        loggedIn: boolean;
        user: CurrentUser | null;
        accessMode: AccessMode;
        allowRegister: boolean;
        siteName: string | null;
        slogan: string | null;
        banner: string | null;
        adminLoggedIn?: boolean;
      }>({ method: 'GET' });
      setUser(data.loggedIn ? data.user : null);
      setAccessMode(data.accessMode || 'open');
      setAllowRegister(data.allowRegister !== false);
      setSiteName(data.siteName ?? null);
      setSlogan(data.slogan ?? null);
      setBanner(data.banner ?? null);
      if (typeof data.adminLoggedIn === 'boolean') setAdmin(data.adminLoggedIn);
    } catch {
      /* 拉不到就按 open 处理，不挡用户 */
    } finally {
      setReady(true);
    }
  }, []);

  // 站长态来自 /api/status（与 AuthProvider 共用同一 query key）
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch('/api/status', { cache: 'no-store' });
        if (!res.ok) throw new Error('status failed');
        const s = (await res.json()) as {
          verified?: boolean;
          accessMode?: AccessMode;
          allowRegister?: boolean;
          siteName?: string | null;
          slogan?: string | null;
          banner?: string | null;
        };
        if (!alive) return;
        setAdmin(Boolean(s.verified));
        if (s.accessMode) setAccessMode(s.accessMode);
        if (typeof s.allowRegister === 'boolean') setAllowRegister(s.allowRegister);
        setSiteName(s.siteName ?? null);
        setSlogan(s.slogan ?? null);
        setBanner(s.banner ?? null);
      } catch {
        /* 忽略 */
      }
      if (alive) void refresh();
    })();
    return () => {
      alive = false;
    };
  }, [refresh]);

  const loginUser = useCallback(
    async (username: string, password: string) => {
      await userRequest<{ ok: true; user: CurrentUser }>({
        method: 'POST',
        body: JSON.stringify({ action: 'login', username, password }),
      });
      await refresh();
      await queryClient.invalidateQueries();
      toast('登录成功', 'success');
    },
    [queryClient, refresh, toast]
  );

  const registerUser = useCallback(
    async (username: string, password: string, nick?: string) => {
      await userRequest<{ ok: true; user: CurrentUser }>({
        method: 'POST',
        body: JSON.stringify({ action: 'register', username, password, nick }),
      });
      await refresh();
      await queryClient.invalidateQueries();
      toast('注册成功，已自动登录', 'success');
    },
    [queryClient, refresh, toast]
  );

  const logoutUser = useCallback(async () => {
    try {
      await userRequest<{ ok: true }>({ method: 'DELETE' });
    } finally {
      setUser(null);
      await queryClient.invalidateQueries({ queryKey: STATUS_QUERY_KEY });
      toast('已退出登录', 'info');
    }
  }, [queryClient, toast]);

  const canView = useMemo(() => {
    if (accessMode === 'open') return true;
    if (accessMode === 'login') return admin || Boolean(user);
    return Boolean(user) || admin;
  }, [accessMode, admin, user]);

  const value = useMemo<AccessState>(
    () => ({
      ready,
      accessMode,
      allowRegister,
      admin,
      user,
      siteName,
      slogan,
      banner,
      canView,
      gated: accessMode !== 'open' && !canView,
      refresh,
      loginUser,
      registerUser,
      logoutUser,
    }),
    [
      ready,
      accessMode,
      allowRegister,
      admin,
      user,
      siteName,
      slogan,
      banner,
      canView,
      refresh,
      loginUser,
      registerUser,
      logoutUser,
    ]
  );

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}
