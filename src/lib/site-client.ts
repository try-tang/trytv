'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * 站点互动数据的客户端封装（求片 / 赞赏留言 / 站长通知）。
 *
 * 读写都走后端 JSON 存储（src/lib/site-data.ts），所以多设备、多浏览器看到的是同一份数据。
 * 这里只做薄封装 + 简单的本地缓存，避免重复请求。
 */

export interface RequestEntry {
  id: string;
  title: string;
  note?: string;
  nick?: string;
  status: 'pending' | 'done' | 'rejected';
  createdAt: number;
  updatedAt: number;
  reply?: string;
}

export interface TipEntry {
  id: string;
  nick?: string;
  amount: number;
  content?: string;
  status: 'pending' | 'shown' | 'hidden';
  createdAt: number;
}

export interface NoticeInfo {
  body: string;
  version: number;
  updatedAt: number;
  enabled: boolean;
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
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
    const msg =
      (data as { error?: string } | null)?.error || `请求失败（HTTP ${res.status}）`;
    throw new Error(msg);
  }
  return data as T;
}

/** 求片：提交 + 按昵称查进度 */
export const requestApi = {
  submit: (input: { title: string; note?: string; nick?: string }) =>
    jsonFetch<{ ok: true; item: RequestEntry }>('/api/request', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  mine: (nick: string) =>
    jsonFetch<{ ok: true; items: RequestEntry[] }>(
      `/api/request?nick=${encodeURIComponent(nick)}`
    ),

  latest: () =>
    jsonFetch<{ ok: true; items: RequestEntry[] }>('/api/request?scope=latest'),
};

/** 赞赏留言 */
export const tipApi = {
  submit: (input: { amount: number; nick?: string; content?: string }) =>
    jsonFetch<{ ok: true; item: TipEntry }>('/api/tip', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  wall: () => jsonFetch<{ ok: true; total: number; items: TipEntry[] }>('/api/tip'),
};

/** 站长通知 */
export const noticeApi = {
  get: () => jsonFetch<{ ok: true; notice: NoticeInfo }>('/api/notice'),
};

const SEEN_NOTICE_KEY = 'kan_kan_notice_seen';

/**
 * 站长通知：只在「有新版本且未读过」时返回内容，读完记版本号。
 * 对应原站 notice-modal 的弹出时机（站点更新后弹一次）。
 */
export function useNoticePopup() {
  const [notice, setNotice] = useState<NoticeInfo | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    noticeApi
      .get()
      .then(({ notice: n }) => {
        if (!alive || !n || !n.enabled || !n.body) return;
        let seen = 0;
        try {
          seen = Number(localStorage.getItem(SEEN_NOTICE_KEY) || '0') || 0;
        } catch {
          /* 隐私模式下不可读，当没读过处理 */
        }
        if (n.version > seen) {
          setNotice(n);
          setOpen(true);
        }
      })
      .catch(() => {
        /* 通知拉不到不影响主流程 */
      });
    return () => {
      alive = false;
    };
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    if (notice) {
      try {
        localStorage.setItem(SEEN_NOTICE_KEY, String(notice.version));
      } catch {
        /* 忽略 */
      }
    }
  }, [notice]);

  return { notice, open, close };
}
