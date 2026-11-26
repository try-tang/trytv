/**
 * 站点预置数据源（`.data/sources.json`）。
 *
 * 与 `site-data.ts` 一样是「一进程一文件 + 串行写队列」，但单独一个文件，
 * 因为数据源是整台实例的点播 / 直播清单，和站点业务数据（求片、赞赏、通知）生命周期不同：
 * 备份、迁移、换一份源清单时不该动到留言。
 *
 * 这里存的是**预置**源。站长在设置抽屉里自定义的源仍然在浏览器 localStorage，
 * 这份文件由后台「配置 → sources.json」编辑，服务端 `/api/sources` 只读地发给前端做合并参考。
 */

import fs from 'fs';
import path from 'path';
import type { EditableSourceConfig } from './admin-config';

export type PresetVodSource = EditableSourceConfig['sources'][number];
export type PresetLiveSource = EditableSourceConfig['liveSources'][number];

export interface PresetSources {
  sources: PresetVodSource[];
  liveSources: PresetLiveSource[];
  updatedAt: number;
}

const DEFAULT_SOURCES: PresetSources = { sources: [], liveSources: [], updatedAt: 0 };

function sourcesFile(): string {
  const dir = process.env.SITE_DATA_DIR || path.join(process.cwd(), '.data');
  return path.join(dir, 'sources.json');
}

let cache: PresetSources | null = null;
let writeChain: Promise<unknown> = Promise.resolve();

function readFile(): PresetSources {
  if (cache) return cache;
  const file = sourcesFile();
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as Partial<PresetSources>;
    cache = {
      sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      liveSources: Array.isArray(parsed.liveSources) ? parsed.liveSources : [],
      updatedAt: Number(parsed.updatedAt) || 0,
    };
  } catch {
    // 缺失或损坏都按空清单处理；损坏时留一份 .bak 方便排查
    try {
      if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
    } catch {
      /* 备份失败不影响主流程 */
    }
    cache = JSON.parse(JSON.stringify(DEFAULT_SOURCES)) as PresetSources;
  }
  return cache;
}

function persist(data: PresetSources): void {
  const file = sourcesFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

export function getPresetSources(): PresetSources {
  const data = readFile();
  return {
    sources: data.sources.map((s) => ({ ...s })),
    liveSources: data.liveSources.map((s) => ({ ...s })),
    updatedAt: data.updatedAt,
  };
}

/** 整体替换（后台编辑器保存时用）：调用方已校验过，这里只做上限截断 */
export function replacePresetSources(input: {
  sources: PresetVodSource[];
  liveSources: PresetLiveSource[];
}): Promise<PresetSources> {
  const run = async (): Promise<PresetSources> => {
    const data = readFile();
    data.sources = input.sources.map((s) => ({ ...s }));
    data.liveSources = input.liveSources.map((s) => ({ ...s }));
    data.updatedAt = Date.now();
    persist(data);
    return getPresetSources();
  };
  const next = writeChain.then(run, run);
  writeChain = next.catch(() => undefined);
  return next;
}

/** 当前实际生效的源数量（后台概览卡用） */
export function presetStats(): { vod: number; live: number; updatedAt: number } {
  const data = readFile();
  return { vod: data.sources.length, live: data.liveSources.length, updatedAt: data.updatedAt };
}
