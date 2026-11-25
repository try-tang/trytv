'use client';

/**
 * 视频源「导入」面板：把一段贴进来的 JSON、一个本地文件或一份订阅地址，
 * 解析成「点播源 + 直播源」的候选清单，勾选后入库。
 *
 * 为什么要单独一个面板（而不是复用「订阅 URL」输入框）：
 * - 用户手里常常是群里转发的一整段 JSON，没有可访问的 URL；
 * - 订阅导入是「信我，直接入库」，一次失败就全失败；这里先给预览，
 *   哪条能导、哪条为什么导不进来都写清楚，用户自己决定勾哪几条；
 * - 同一份配置可能是 TVBox、可能是 LunaTV 的 api_site、也可能是我们自己导出的格式，
 *   格式识别放在服务端统一做（`src/lib/source-text-import.ts`），前端只管展示。
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Icon } from './icon';
import { SectionTitle } from './settings-shared';
import { useToast } from './toast';
import { cn } from '@/lib/utils';
import {
  IMPORT_FORMAT_LABEL,
  type ImportFormat,
  type ImportedLiveSource,
  type ImportedVodSource,
} from '@/lib/source-text-import';

type Tab = 'paste' | 'file' | 'url';

interface PreviewState {
  format: ImportFormat;
  name?: string;
  note?: string;
  sources: ImportedVodSource[];
  liveSources: ImportedLiveSource[];
}

interface Props {
  /** 已存在（按 URL 去重）的点播源地址 */
  existingVod: string[];
  /** 已存在的直播源地址 */
  existingLive: string[];
  onImport: (payload: { sources: ImportedVodSource[]; liveSources: ImportedLiveSource[] }) => void | Promise<void>;
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'paste', label: '粘贴 JSON' },
  { id: 'file', label: '选择文件' },
  { id: 'url', label: '订阅地址' },
];

export function SourceImportPanel({ existingVod, existingLive, onImport }: Props) {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('paste');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [pickedVod, setPickedVod] = useState<Set<string>>(new Set());
  const [pickedLive, setPickedLive] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const existingVodSet = useMemo(
    () => new Set(existingVod.map((u) => u.replace(/\/+$/, ''))),
    [existingVod]
  );
  const existingLiveSet = useMemo(
    () => new Set(existingLive.map((u) => u.replace(/\/+$/, ''))),
    [existingLive]
  );
  const isDup = (kind: 'vod' | 'live', url: string) => {
    const key = url.replace(/\/+$/, '');
    return kind === 'vod' ? existingVodSet.has(key) : existingLiveSet.has(key);
  };

  const applyPreview = useCallback((data: PreviewState) => {
    setPreview(data);
    // 默认勾选「库里还没有的」，已有的默认不勾，避免重复点两次就多出一堆同名源
    const norm = (u: string) => u.replace(/\/+$/, '');
    const vodKeys = new Set(existingVod.map(norm));
    const liveKeys = new Set(existingLive.map(norm));
    setPickedVod(new Set(data.sources.map((s) => s.url).filter((u) => !vodKeys.has(norm(u)))));
    setPickedLive(
      new Set(data.liveSources.map((s) => s.url).filter((u) => !liveKeys.has(norm(u))))
    );
  }, [existingVod, existingLive]);

  const parseText = async (payload: string) => {
    setBusy(true);
    try {
      const res = await fetch('/api/source-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: payload }),
      });
      const data = (await res.json()) as PreviewState & { error?: string };
      if (!res.ok || data.error) throw new Error(data.error || `解析失败（HTTP ${res.status}）`);
      applyPreview(data);
      toast(
        `识别为${IMPORT_FORMAT_LABEL[data.format]}：${data.sources.length} 个点播源、${data.liveSources.length} 个直播源`,
        'success'
      );
    } catch (err) {
      setPreview(null);
      toast(err instanceof Error ? err.message : '解析失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  const parseUrl = async () => {
    const target = url.trim();
    if (!/^https?:\/\//i.test(target)) {
      toast('订阅地址需以 http:// 或 https:// 开头', 'warning');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/source-import?url=${encodeURIComponent(target)}`, {
        cache: 'no-store',
      });
      const data = (await res.json()) as PreviewState & { error?: string };
      if (!res.ok || data.error) throw new Error(data.error || `拉取失败（HTTP ${res.status}）`);
      applyPreview(data);
      toast(
        `识别为${IMPORT_FORMAT_LABEL[data.format]}：${data.sources.length} 个点播源、${data.liveSources.length} 个直播源`,
        'success'
      );
    } catch (err) {
      setPreview(null);
      toast(err instanceof Error ? err.message : '拉取失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  const pickFile = async (file: File) => {
    try {
      const content = await file.text();
      setText(content);
      setTab('paste');
      await parseText(content);
    } catch {
      toast('读取文件失败', 'error');
    }
  };

  const toggle = (kind: 'vod' | 'live', url: string) => {
    const setter = kind === 'vod' ? setPickedVod : setPickedLive;
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const doImport = async () => {
    if (!preview) return;
    const sources = preview.sources.filter((s) => pickedVod.has(s.url));
    const liveSources = preview.liveSources.filter((s) => pickedLive.has(s.url));
    if (sources.length === 0 && liveSources.length === 0) {
      toast('先勾选至少一个源', 'warning');
      return;
    }
    setBusy(true);
    try {
      await onImport({ sources, liveSources });
      toast(`已导入 ${sources.length} 个点播源、${liveSources.length} 个直播源`, 'success');
      setPreview(null);
      setText('');
      setUrl('');
    } catch (err) {
      toast(err instanceof Error ? err.message : '导入失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  const pickedCount = pickedVod.size + pickedLive.size;
  const totalCount = preview ? preview.sources.length + preview.liveSources.length : 0;

  return (
    <section>
      <SectionTitle
        title="导入视频源"
        hint="粘贴、选文件或填订阅地址，先看清单再挑着导入；支持 LibreTV 源列表、TVBox 配置、LunaTV 的 api_site"
      />

      <div className="flex gap-1.5 mb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs transition-colors',
              tab === t.id ? 'bg-accent text-on-accent' : 'bg-chip text-muted hover:text-content'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'paste' && (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'把配置贴在这里，例如：\n{"sources":[{"name":"演示","url":"https://example.com/api.php/provide/vod"}]}'}
            className="input w-full h-36 font-mono text-xs resize-y"
            spellCheck={false}
          />
          <div className="flex gap-2">
            <button
              className="btn-primary btn-sm flex-1"
              disabled={busy || !text.trim()}
              onClick={() => void parseText(text)}
            >
              {busy ? '解析中…' : '解析并预览'}
            </button>
            <button className="btn-ghost btn-sm" disabled={!text.trim()} onClick={() => setText('')}>
              清空
            </button>
          </div>
        </div>
      )}

      {tab === 'file' && (
        <div className="space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept=".json,.txt,application/json,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void pickFile(f);
              e.target.value = '';
            }}
          />
          <button
            className="btn-ghost w-full py-6 border border-dashed border-line rounded-lg text-xs text-muted hover:text-content"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            <Icon name="file" className="w-4 h-4 mx-auto mb-1" />
            点这里选择一个 .json / .txt 配置文件
          </button>
          <p className="text-[11px] text-faint leading-relaxed">
            文件只在本地读取后发给本站解析接口，不会上传到第三方。
          </p>
        </div>
      )}

      {tab === 'url' && (
        <div className="space-y-2">
          <input
            className="input w-full"
            placeholder="https://example.com/config.json"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void parseUrl();
            }}
          />
          <button className="btn-primary btn-sm w-full" disabled={busy || !url.trim()} onClick={() => void parseUrl()}>
            {busy ? '拉取中…' : '拉取并预览'}
          </button>
        </div>
      )}

      {preview && (
        <div className="mt-3 rounded-lg border border-line bg-chip/40 p-2.5 space-y-2">
          <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
            <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent">
              {IMPORT_FORMAT_LABEL[preview.format]}
            </span>
            {preview.name && <span className="text-muted truncate">{preview.name}</span>}
            <span className="text-faint">共 {totalCount} 条，已勾 {pickedCount} 条</span>
          </div>
          {preview.note && (
            <p className="text-[11px] text-warning leading-relaxed">跳过说明：{preview.note}</p>
          )}

          {preview.sources.length > 0 && (
            <div>
              <div className="flex items-center justify-between text-[11px] text-muted mb-1">
                <span>点播源 {preview.sources.length}</span>
                <button
                  className="text-faint hover:text-content"
                  onClick={() =>
                    setPickedVod((prev) =>
                      prev.size === preview.sources.length ? new Set() : new Set(preview.sources.map((s) => s.url))
                    )
                  }
                >
                  {pickedVod.size === preview.sources.length ? '全不选' : '全选'}
                </button>
              </div>
              <ul className="max-h-52 overflow-y-auto scrollbar-thin divide-y divide-line/60">
                {preview.sources.map((s) => {
                  const dup = isDup('vod', s.url);
                  return (
                    <li key={s.url} className="py-1.5 flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-sky-500"
                        checked={pickedVod.has(s.url)}
                        onChange={() => toggle('vod', s.url)}
                        aria-label={`选择 ${s.name}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-content truncate">
                          {s.name}
                          {dup && <span className="ml-1 text-[10px] text-faint">（已存在）</span>}
                        </div>
                        <div className="text-[10px] text-faint truncate">{s.url}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {preview.liveSources.length > 0 && (
            <div>
              <div className="flex items-center justify-between text-[11px] text-muted mb-1">
                <span>直播源 {preview.liveSources.length}</span>
                <button
                  className="text-faint hover:text-content"
                  onClick={() =>
                    setPickedLive((prev) =>
                      prev.size === preview.liveSources.length
                        ? new Set()
                        : new Set(preview.liveSources.map((s) => s.url))
                    )
                  }
                >
                  {pickedLive.size === preview.liveSources.length ? '全不选' : '全选'}
                </button>
              </div>
              <ul className="max-h-40 overflow-y-auto scrollbar-thin divide-y divide-line/60">
                {preview.liveSources.map((s) => {
                  const dup = isDup('live', s.url);
                  return (
                    <li key={s.url} className="py-1.5 flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-sky-500"
                        checked={pickedLive.has(s.url)}
                        onChange={() => toggle('live', s.url)}
                        aria-label={`选择 ${s.name}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-content truncate">
                          {s.name}
                          {dup && <span className="ml-1 text-[10px] text-faint">（已存在）</span>}
                        </div>
                        <div className="text-[10px] text-faint truncate">{s.url}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button className="btn-primary btn-sm flex-1" disabled={busy || pickedCount === 0} onClick={() => void doImport()}>
              {busy ? '导入中…' : `导入选中的 ${pickedCount} 条`}
            </button>
            <button className="btn-ghost btn-sm" onClick={() => setPreview(null)}>
              取消
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
