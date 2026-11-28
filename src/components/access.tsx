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
import { useAppStore } from '@/lib/store';
import { syncAfterLogin } from '@/lib/watch-sync';
import { useToast } from './toast';

/**
 * 站点访问策略与登录态。
 *
 * 这里只放「谁可以看、我是谁」这一层判断，具体登录动作走：
 * - 注册用户：/api/user（cookie ltv_user）
 * - 站长：/api/auth（cookie ltv_session）
 *
 * 站长登录成功后必须让整个前端立刻知道，否则会出现「弹窗说登录成功、
 * 顶栏还写着登录、进 /admin 又被要密码」的割裂感。做法是统一走一个
 * 全站事件 + refresh()，凡是登录/登出的地方都调 announceAccessChanged()。
 */

export type AccessMode = 'open' | 'login' | 'members';

/** 全站广播：访问策略或登录态变了，所有消费者重新拉一次 */
export const ACCESS_CHANGED_EVENT = 'trytv:access-changed';

export function announceAccessChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(ACCESS_CHANGED_EVENT));
}

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
  /** 私密短剧入口是否开启（后台「站点设置」） */
  shortsEnabled: boolean;
  /** 是否过滤成人内容（后台「站点设置」） */
  adultFilter: boolean;
  /** 站长还在用内置默认密码 admin（提示他尽快改掉） */
  usingDefaultPassword: boolean;
  /** 站点里已有的注册账号数（0 表示是单人部署） */
  userCount: number;
  /** 是否能看内容 */
  canView: boolean;
  /** 是否需要（并且值得）挡住内容：open 模式永远 false */
  gated: boolean;
  refresh: () => Promise<void>;
  loginUser: (username: string, password: string) => Promise<void>;
  registerUser: (username: string, password: string, nick?: string) => Promise<void>;
  logoutUser: () => Promise<void>;
  /** 站长登录：成功后立即把 admin 置为 true 并广播，调用方不用再 refresh */
  loginAdmin: (password: string) => Promise<void>;
  /** 站长登出（清 ltv_session），与 loginAdmin 对称 */
  logoutAdmin: () => Promise<void>;
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
  shortsEnabled: true,
  adultFilter: false,
  usingDefaultPassword: false,
  userCount: 0,
  canView: true,
  gated: false,
  refresh: async () => {},
  loginUser: async () => {},
  registerUser: async () => {},
  logoutUser: async () => {},
  loginAdmin: async () => {},
  logoutAdmin: async () => {},
};

const AccessContext = createContext<AccessState>(DEFAULTS);

export function useAccess(): AccessState {
  return useContext(AccessContext);
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return (text ? JSON.parse(text) : null) as T;
  } catch {
    return null as T;
  }
}

async function userRequest<T>(init?: RequestInit): Promise<T> {
  const res = await fetch('/api/user', {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    cache: 'no-store',
  });
  const data = await readJson<T & { error?: string }>(res);
  if (!res.ok) {
    throw new Error(data?.error || `请求失败（HTTP ${res.status}）`);
  }
  return data as T;
}

interface UserPayload {
  ok: true;
  loggedIn: boolean;
  user: CurrentUser | null;
  adminLoggedIn?: boolean;
  accessMode: AccessMode;
  allowRegister: boolean;
  siteName: string | null;
  slogan: string | null;
  banner: string | null;
}

interface StatusPayload {
  verified?: boolean;
  usingDefaultPassword?: boolean;
  accessMode?: AccessMode;
  allowRegister?: boolean;
  siteName?: string | null;
  slogan?: string | null;
  banner?: string | null;
  adultFilter?: boolean;
  shortsEnabled?: boolean;
  userCount?: number;
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
  const [shortsEnabled, setShortsEnabled] = useState(true);
  const [adultFilter, setAdultFilter] = useState(false);
  const [usingDefaultPassword, setUsingDefaultPassword] = useState(false);
  const [userCount, setUserCount] = useState(0);
  const [ready, setReady] = useState(false);

  /**
   * 一次性把「我是谁 + 站点策略」拉全。
   *
   * 两个来源各有分工：
   * - /api/user   → 注册用户、访问模式、文案（顺带下发 adminLoggedIn）
   * - /api/status → 站长 cookie 的权威判定 + 短剧/成人过滤开关
   * 两个都失败也要 setReady(true)，否则整个前端会永远停在骨架态。
   */
  const refresh = useCallback(async () => {
    const [userRes, statusRes] = await Promise.allSettled([
      userRequest<UserPayload>({ method: 'GET' }),
      fetch('/api/status', { cache: 'no-store' })
        .then((r) => (r.ok ? readJson<StatusPayload>(r) : null))
        .catch(() => null),
    ]);

    if (userRes.status === 'fulfilled') {
      const data = userRes.value;
      setUser(data.loggedIn ? data.user : null);
      setAccessMode(data.accessMode || 'open');
      setAllowRegister(data.allowRegister !== false);
      setSiteName(data.siteName ?? null);
      setSlogan(data.slogan ?? null);
      setBanner(data.banner ?? null);
      if (typeof data.adminLoggedIn === 'boolean') setAdmin(data.adminLoggedIn);
    }

    if (statusRes.status === 'fulfilled' && statusRes.value) {
      const s = statusRes.value;
      setAdmin(Boolean(s.verified));
      setUsingDefaultPassword(Boolean(s.usingDefaultPassword));
      if (typeof s.shortsEnabled === 'boolean') setShortsEnabled(s.shortsEnabled);
      if (typeof s.adultFilter === 'boolean') {
        setAdultFilter(s.adultFilter);
        // 成人内容过滤的「源头」在后台站点设置：本地没被用户手动改过时以服务端为准
        const store = useAppStore.getState();
        if (!store.yellowFilterTouched) store.updateSettings({ yellowFilter: s.adultFilter });
      }
      if (s.accessMode) setAccessMode(s.accessMode);
      if (typeof s.allowRegister === 'boolean') setAllowRegister(s.allowRegister);
      if (typeof s.userCount === 'number') setUserCount(s.userCount);
      setSiteName(s.siteName ?? null);
      setSlogan(s.slogan ?? null);
      setBanner(s.banner ?? null);
    }

    setReady(true);
  }, []);

  // 首屏拉一次；并订阅全站「登录态变了」广播
  useEffect(() => {
    let alive = true;
    void refresh();
    const onChange = () => {
      if (alive) void refresh();
    };
    window.addEventListener(ACCESS_CHANGED_EVENT, onChange);
    return () => {
      alive = false;
      window.removeEventListener(ACCESS_CHANGED_EVENT, onChange);
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
      // 登录后把观影记录 / 待看清单与服务端对齐（服务端没记录就把本地认领上去）
      void syncAfterLogin()
        .then((r) => {
          if (r.merged) toast(`已同步观影记录（${r.count} 条）`, 'success');
        })
        .catch(() => {});
      announceAccessChanged();
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
      // 新账号在服务端是空的，这里把本机已有记录认领过去，换设备登录就能看到
      void syncAfterLogin().catch(() => {});
      announceAccessChanged();
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
      announceAccessChanged();
      toast('已退出登录', 'info');
    }
  }, [queryClient, toast]);

  /**
   * 站长登录：直接 POST /api/auth。
   *
   * 关键点是「拿到 200 就地把 admin 置 true」——不必等下一轮 /api/status，
   * 弹窗 onSuccess 里立刻渲染「已登录」，随后 announceAccessChanged() 会让
   * 顶栏、我的页、/admin 的 AdminGate 一起刷新。
   */
  const loginAdmin = useCallback(
    async (password: string) => {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await readJson<{ error?: string; success?: boolean }>(res);
      if (!res.ok) throw new Error(data?.error || '站长密码不正确');
      setAdmin(true);
      // 让 useQuery 里 /api/status 的缓存失效，AdminGate 之类的消费者同步更新
      await queryClient.invalidateQueries({ queryKey: STATUS_QUERY_KEY });
      announceAccessChanged();
      toast('站长已登录', 'success');
    },
    [queryClient, toast]
  );

  const logoutAdmin = useCallback(async () => {
    try {
      await fetch('/api/auth', { method: 'DELETE' });
    } finally {
      setAdmin(false);
      await queryClient.invalidateQueries({ queryKey: STATUS_QUERY_KEY });
      announceAccessChanged();
      toast('已退出站长登录', 'info');
    }
  }, [queryClient, toast]);

  const canView = useMemo(() => {
    if (accessMode === 'open') return true;
    return admin || Boolean(user);
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
      shortsEnabled,
      adultFilter,
      usingDefaultPassword,
      userCount,
      canView,
      gated: accessMode !== 'open' && !canView,
      refresh,
      loginUser,
      registerUser,
      logoutUser,
      loginAdmin,
      logoutAdmin,
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
      shortsEnabled,
      adultFilter,
      usingDefaultPassword,
      userCount,
      canView,
      refresh,
      loginUser,
      registerUser,
      logoutUser,
      loginAdmin,
      logoutAdmin,
    ]
  );

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}
