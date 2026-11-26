/** 后台各面板共用的类型（与 src/lib/site-data.ts、stats() 保持一致） */

export interface SettingsInfo {
  accessMode: 'open' | 'login' | 'members';
  allowRegister: boolean;
  siteName?: string;
  slogan?: string;
  banner?: string;
  /** 私密短剧入口开关 */
  shortsEnabled?: boolean;
  /** 短剧口令是否已设置（只回布尔，回显不了明文） */
  shortsPasswordHash?: string;
  shortsPasswordAt?: number;
  /** 成人内容过滤（站点级开关） */
  adultFilter?: boolean;
  updatedAt: number;
}

export interface ShortInfo {
  id: string;
  title: string;
  url: string;
  poster?: string;
  desc?: string;
}

export interface AccountInfo {
  id: string;
  username: string;
  nick?: string;
  role: 'user' | 'admin';
  createdAt: number;
  lastLoginAt?: number;
  disabled?: boolean;
}

export interface Stats {
  requests: { total: number; pending: number; done: number };
  tips: { total: number; pending: number; shown: number; amount: number };
  notice: { enabled: boolean; version: number };
  settings?: {
    accessMode: 'open' | 'login' | 'members';
    allowRegister: boolean;
    shortsEnabled?: boolean;
    shortsPasswordSet?: boolean;
    adultFilter?: boolean;
  };
  users?: { total: number; active: number };
  shorts?: { total: number };
  /** 站点预置数据源数量（sources.json） */
  preset?: { vod: number; live: number; updatedAt: number };
}

export type { RequestEntry, TipEntry, NoticeInfo } from '@/lib/site-client';
