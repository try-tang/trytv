'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor, { loader, type OnMount } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { authFetch } from '@/lib/auth-client';
import {
  MAX_PRESET_LIVE,
  MAX_PRESET_VOD,
  SECRET_PLACEHOLDER,
  parseConfig,
  parseSourceConfig,
  stringifyConfig,
  type EditableConfig,
  type EditableSourceConfig,
} from '@/lib/admin-config';
import { cn } from '@/lib/utils';

/**
 * 后台「配置」页签 —— 多文件 JSON 编辑器。
 *
 * 形态参考 LunaTV-config 的 web-editor（左侧工具面板 + 中间 Monaco + 底部状态栏），
 * 但数据源换成站点自己的两个文件，不经过 GitHub、不需要 Personal Access Token：
 *
 * - `site.json`    → 站点设置 + 私密短剧清单，保存走 `/api/admin` 的 `config.save`
 * - `sources.json` → 站点预置数据源（点播 / 直播），保存走 `sources.save`，落盘 `.data/sources.json`
 *
 * 两个文件各有自己的「脏」标记：在 A 文件里改了一半切到 B，A 的改动仍然留着。
 * 三态口令：编辑器里的 `shortsPasswordHash` 显示 `<已设置>` / 空串 / 新口令，
 * 服务端据此判断「保留原哈希 / 清除 / 换成新的」——明文永远不会回显。
 */

/**
 * Monaco 走本站自托管：默认会从 cdn.jsdelivr.net 拉整套 vs 目录（约 5MB），
 * 国内网络经常卡住甚至超时，后台就一直停在「正在读取配置」。
 * `public/monaco/vs` 只放了 JSON 编辑需要的子集（脚本见 scripts/sync-monaco.mjs）。
 *
 * 注意 loader 必须从 `@monaco-editor/react` 里取，不能 `import ... from '@monaco-editor/loader'`：
 * react 包自己带了一个嵌套的 loader 实例（1.7.0），运行时用的是它，
 * 直接给顶层 loader 配置 paths 是无效的 —— 组件仍会去连 CDN。
 */
loader.config({ paths: { vs: '/monaco/vs' } });

type ViewTab = 'editor' | 'tree' | 'preview';
type FileId = 'site' | 'sources';

interface ConfigMeta {
  file: string;
  editable: string[];
  readOnly: string[];
  updatedAt?: number;
}

interface CursorInfo {
  line: number;
  column: number;
  selected: number;
}

interface FileEntry {
  /** 后端文件名，顶栏展示与导出都用它 */
  file: string;
  /** 左侧文件列表里的短名 */
  label: string;
  hint: string;
  /** 保存成功后后端返回的规范化文本 */
  text: string;
  /** 进入编辑器时的基线，用来算「未保存」与「改动行数」 */
  baseline: string;
  dirty: boolean;
  loaded: boolean;
  meta: ConfigMeta | null;
  errorInfo: { message: string; line?: number; column?: number } | null;
  lastSaved: number | null;
}

const FILE_ORDER: FileId[] = ['site', 'sources'];

const FILE_META: Record<FileId, { file: string; label: string; hint: string; icon: Parameters<typeof Icon>[0]['name'] }> = {
  site: {
    file: 'site.json',
    label: '站点与短剧',
    hint: 'settings / shorts',
    icon: 'gear',
  },
  sources: {
    file: 'sources.json',
    label: '预置数据源',
    hint: 'sources / liveSources',
    icon: 'link',
  },
};

const emptyEntry = (id: FileId): FileEntry => ({
  file: FILE_META[id].file,
  label: FILE_META[id].label,
  hint: FILE_META[id].hint,
  text: '',
  baseline: '',
  dirty: false,
  loaded: false,
  meta: null,
  errorInfo: null,
  lastSaved: null,
});

/** 每种文件对应的校验函数：前端先拦一道，省一次白跑的网络请求 */
function validate(id: FileId, text: string) {
  return id === 'site' ? parseConfig(text) : parseSourceConfig(text);
}

export function ConfigPanel() {
  const { toast } = useToast();
  const [active, setActive] = useState<FileId>('site');
  const [files, setFiles] = useState<Record<FileId, FileEntry>>({
    site: emptyEntry('site'),
    sources: emptyEntry('sources'),
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<ViewTab>('editor');
  const [wrap, setWrap] = useState(true);
  const [minimap, setMinimap] = useState(false);
  const [lineNumbers, setLineNumbers] = useState(true);
  const [fontSize, setFontSize] = useState(13);
  const [cursor, setCursor] = useState<CursorInfo>({ line: 1, column: 1, selected: 0 });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  /** 每次切换文件都要重建编辑器，否则 Monaco 会把上一个文件的 undo 栈带过来 */
  const [editorKey, setEditorKey] = useState(0);

  const current = files[active];

  const patchFile = useCallback((id: FileId, patch: Partial<FileEntry>) => {
    setFiles((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  /** 格式化后的文本 → 树状视图与预览；解析失败时退回原文 */
  const parsed = useMemo(() => {
    try {
      return { ok: true as const, value: JSON.parse(current.text) as unknown };
    } catch {
      return { ok: false as const, value: null };
    }
  }, [current.text]);

  const loadOne = useCallback(
    async (id: FileId) => {
      setLoading(true);
      patchFile(id, { errorInfo: null });
      try {
        if (id === 'site') {
          const data = await authFetch<{ config: EditableConfig; meta: ConfigMeta }>(
            '/api/admin?res=config'
          );
          const text = stringifyConfig(data.config);
          patchFile('site', {
            text,
            baseline: text,
            dirty: false,
            loaded: true,
            meta: data.meta,
            lastSaved: Date.now(),
          });
        } else {
          const data = await authFetch<{ sources: EditableSourceConfig; meta: ConfigMeta }>(
            '/api/admin?res=sources'
          );
          const text = stringifyConfig(data.sources);
          patchFile('sources', {
            text,
            baseline: text,
            dirty: false,
            loaded: true,
            meta: data.meta,
            lastSaved: Date.now(),
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : '读取配置失败';
        patchFile(id, { errorInfo: { message } });
        toast(message, 'error');
      } finally {
        setLoading(false);
      }
    },
    [patchFile, toast]
  );

  // 首次进入只拉当前文件；切到另一个文件时才拉它，免得一次打两个接口
  useEffect(() => {
    if (!files[active].loaded) void loadOne(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const switchFile = useCallback(
    (id: FileId) => {
      if (id === active) return;
      setActive(id);
      setCollapsed(new Set());
      setCursor({ line: 1, column: 1, selected: 0 });
      setEditorKey((k) => k + 1);
    },
    [active]
  );

  const save = useCallback(async () => {
    const target = files[active];
    const check = validate(active, target.text);
    if (!check.ok) {
      patchFile(active, { errorInfo: { message: check.error, line: check.line, column: check.column } });
      toast('JSON 有错误，先修好再保存', 'error');
      const editor = editorRef.current;
      if (editor && check.line) {
        editor.revealLineInCenter(check.line);
        editor.setPosition({ lineNumber: check.line, column: check.column ?? 1 });
        editor.focus();
      }
      return;
    }

    setSaving(true);
    patchFile(active, { errorInfo: null });
    try {
      if (active === 'site') {
        const data = await authFetch<{
          config: EditableConfig;
          stats: { total: number; dropped: number };
        }>('/api/admin', {
          method: 'POST',
          body: JSON.stringify({ action: 'config.save', json: target.text }),
        });
        const text = stringifyConfig(data.config);
        patchFile('site', { text, baseline: text, dirty: false, lastSaved: Date.now() });
        if (data.stats.dropped > 0) {
          toast(
            `已保存，但有 ${data.stats.dropped} 条短剧缺字段被丢弃（需要 title，以及 url 或分集）`,
            'warning'
          );
        } else {
          toast('配置已保存，立即生效', 'success');
        }
      } else {
        const data = await authFetch<{
          sources: EditableSourceConfig;
          stats: { vod: number; live: number };
        }>('/api/admin', {
          method: 'POST',
          body: JSON.stringify({ action: 'sources.save', json: target.text }),
        });
        const text = stringifyConfig(data.sources);
        patchFile('sources', { text, baseline: text, dirty: false, lastSaved: Date.now() });
        toast(`数据源已保存：点播 ${data.stats.vod} 个，直播 ${data.stats.live} 个`, 'success');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存失败';
      patchFile(active, { errorInfo: { message } });
      toast(message, 'error');
    } finally {
      setSaving(false);
    }
  }, [active, files, patchFile, toast]);

  const format = useCallback(() => {
    const check = validate(active, current.text);
    if (!check.ok) {
      patchFile(active, { errorInfo: { message: check.error, line: check.line, column: check.column } });
      toast('JSON 有错误，无法格式化', 'error');
      return;
    }
    const text = stringifyConfig(
      active === 'site' ? (check.value as EditableConfig) : (check.value as EditableSourceConfig)
    );
    patchFile(active, { text, dirty: text !== current.baseline });
    toast('已格式化', 'success');
  }, [active, current.baseline, current.text, patchFile, toast]);

  const minify = useCallback(() => {
    const check = validate(active, current.text);
    if (!check.ok) {
      patchFile(active, { errorInfo: { message: check.error, line: check.line, column: check.column } });
      toast('JSON 有错误，无法压缩', 'error');
      return;
    }
    const text = JSON.stringify(check.value);
    patchFile(active, { text, dirty: text !== current.baseline });
    toast('已压缩为一行', 'success');
  }, [active, current.baseline, current.text, patchFile, toast]);

  const validateOnly = useCallback(() => {
    const check = validate(active, current.text);
    if (check.ok) {
      patchFile(active, { errorInfo: null });
      if (active === 'site') {
        const shorts = (check.value as { shorts?: unknown[] }).shorts ?? [];
        toast(`校验通过：${shorts.length} 条短剧，settings 字段正常`, 'success');
      } else {
        const value = check.value as { sources: unknown[]; liveSources: unknown[] };
        toast(`校验通过：点播 ${value.sources.length} 个，直播 ${value.liveSources.length} 个`, 'success');
      }
    } else {
      patchFile(active, { errorInfo: { message: check.error, line: check.line, column: check.column } });
      toast('校验没通过，看下方提示', 'error');
    }
  }, [active, current.text, patchFile, toast]);

  const download = useCallback(() => {
    const blob = new Blob([current.text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${active === 'site' ? 'site' : 'sources'}-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('已导出到下载目录', 'success');
  }, [active, current.text, toast]);

  const upload = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const content = String(reader.result ?? '');
        const check = validate(active, content);
        patchFile(active, {
          text: content,
          dirty: content !== current.baseline,
          errorInfo: check.ok ? null : { message: check.error, line: check.line, column: check.column },
        });
        toast(
          check.ok ? `已载入 ${file.name}` : `${file.name} 有格式问题，检查后再保存`,
          check.ok ? 'success' : 'warning'
        );
      };
      reader.readAsText(file, 'utf-8');
    },
    [active, current.baseline, patchFile, toast]
  );

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(current.text);
      toast('已复制到剪贴板', 'success');
    } catch {
      toast('浏览器拒绝了剪贴板权限', 'error');
    }
  }, [current.text, toast]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        void loadOne(active);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active, loadOne, save]);

  const onMount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.onDidChangeCursorSelection((e) => {
      const pos = e.selection.getStartPosition();
      const selected = editor.getModel()?.getValueInRange(e.selection).length ?? 0;
      setCursor({ line: pos.lineNumber, column: pos.column, selected });
    });
  };

  const lines = useMemo(() => current.text.split('\n').length, [current.text]);
  const dirtyCount = FILE_ORDER.filter((id) => files[id].dirty).length;

  return (
    <div className="rounded-xl border border-line bg-card overflow-hidden">
      {/* 顶栏：文件信息 + 主操作 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface/60 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="code" className="w-4 h-4 text-accent shrink-0" />
          <span className="text-sm font-semibold text-content shrink-0">{current.file}</span>
          <span className="text-[11px] text-faint">
            {current.text.length.toLocaleString()} 字符 · {lines} 行
          </span>
          {current.dirty && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/15 text-warning">未保存</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => void loadOne(active)}
            disabled={loading}
          >
            <Icon name="refresh" className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            重新载入
          </button>
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={() => void save()}
            disabled={saving || loading || !current.loaded}
          >
            <Icon name="check" className="w-3.5 h-3.5" />
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row">
        {/* 左侧工具面板 */}
        <aside className="lg:w-56 shrink-0 border-b lg:border-b-0 lg:border-r border-line bg-surface/30 p-2.5 space-y-3">
          <ToolGroup title="文件">
            {FILE_ORDER.map((id) => {
              const entry = files[id];
              const meta = FILE_META[id];
              const on = id === active;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => switchFile(id)}
                  className={cn(
                    'w-full text-left rounded-md border px-2 py-1.5 transition-colors',
                    on
                      ? 'border-accent/60 bg-accent/10 text-content'
                      : 'border-line bg-chip/40 text-muted hover:text-content hover:bg-hover'
                  )}
                >
                  <span className="flex items-center gap-1.5 text-[11px] font-medium">
                    <Icon name={meta.icon} className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{meta.label}</span>
                    {entry.dirty && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-warning shrink-0" />}
                  </span>
                  <span className="block pl-5 text-[10px] text-faint truncate">{meta.hint}</span>
                </button>
              );
            })}
          </ToolGroup>

          <ToolGroup title="导入导出">
            <ToolButton icon="download" onClick={download} label="导出当前文件" />
            <ToolButton icon="file" onClick={() => fileInputRef.current?.click()} label="导入到当前文件" />
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload(file);
                e.target.value = '';
              }}
            />
          </ToolGroup>

          <ToolGroup title="JSON">
            <ToolButton icon="sort" onClick={format} label="格式化" />
            <ToolButton icon="collapse" onClick={minify} label="压缩" />
            <ToolButton icon="check" onClick={validateOnly} label="校验" />
            <ToolButton icon="copy" onClick={() => void copy()} label="复制全文" />
          </ToolGroup>

          <ToolGroup title="显示">
            <Toggle label="自动换行" checked={wrap} onChange={setWrap} />
            <Toggle label="缩略图" checked={minimap} onChange={setMinimap} />
            <Toggle label="行号" checked={lineNumbers} onChange={setLineNumbers} />
            <label className="block text-[11px] text-faint pt-1">
              字号 <span className="text-content">{fontSize}px</span>
              <input
                type="range"
                min={11}
                max={20}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-full mt-1 accent-accent"
                aria-label="字号"
              />
            </label>
          </ToolGroup>

          <div className="text-[11px] text-faint leading-relaxed border-t border-line pt-2">
            {active === 'site' ? (
              <>
                只接受 <code className="text-accent">settings</code> 与{' '}
                <code className="text-accent">shorts</code>。
                <br />
                求片 / 赞赏 / 通知有各自页签，这里改不到。
                <br />
                口令写 <code className="text-warning">{SECRET_PLACEHOLDER}</code> 表示不改，留空表示清除。
              </>
            ) : (
              <>
                站点预置数据源。点播最多 {MAX_PRESET_VOD} 个、直播最多 {MAX_PRESET_LIVE} 个。
                <br />
                也能直接粘贴 LunaTV 的{' '}
                <code className="text-accent">api_site</code> 或裸数组，保存时会自动归一成本文件格式。
                <br />
                这里改的是「整台实例的预置清单」，访客自己勾选的源仍在各自浏览器里。
              </>
            )}
          </div>
        </aside>

        {/* 主编辑区 */}
        <div className="min-w-0 flex-1 flex flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-line px-2">
            <div className="flex">
              {(
                [
                  { id: 'editor' as const, label: '编辑器' },
                  { id: 'tree' as const, label: '树状视图' },
                  { id: 'preview' as const, label: '预览' },
                ]
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setView(t.id)}
                  className={cn(
                    'px-2.5 py-1.5 text-xs border-b-2 -mb-px transition-colors',
                    view === t.id ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-content'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {view === 'tree' && (
              <div className="flex items-center gap-1">
                <button type="button" className="btn-ghost btn-sm !py-1 !text-[11px]" onClick={() => setCollapsed(new Set())}>
                  全部展开
                </button>
                <button
                  type="button"
                  className="btn-ghost btn-sm !py-1 !text-[11px]"
                  onClick={() => setCollapsed(new Set(collectPaths(parsed.value)))}
                >
                  全部收起
                </button>
              </div>
            )}
          </div>

          {!current.loaded ? (
            <div className="h-[520px] flex items-center justify-center text-xs text-faint">正在读取配置…</div>
          ) : view === 'editor' ? (
            <Editor
              key={editorKey}
              height="520px"
              defaultLanguage="json"
              value={current.text}
              onChange={(v) => {
                const text = v ?? '';
                patchFile(active, { text, dirty: text !== current.baseline });
              }}
              onMount={onMount}
              theme="vs-dark"
              options={{
                fontSize,
                wordWrap: wrap ? 'on' : 'off',
                minimap: { enabled: minimap },
                lineNumbers: lineNumbers ? 'on' : 'off',
                scrollBeyondLastLine: false,
                tabSize: 2,
                formatOnPaste: true,
                automaticLayout: true,
                renderLineHighlight: 'line',
                smoothScrolling: true,
                padding: { top: 8, bottom: 8 },
                scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
              }}
            />
          ) : view === 'tree' ? (
            <div className="h-[520px] overflow-auto p-2 text-xs font-mono scrollbar-thin">
              {parsed.ok ? (
                <JsonTree
                  value={parsed.value}
                  path="$"
                  collapsed={collapsed}
                  toggle={(p) =>
                    setCollapsed((prev) => {
                      const next = new Set(prev);
                      if (next.has(p)) next.delete(p);
                      else next.add(p);
                      return next;
                    })
                  }
                />
              ) : (
                <div className="text-danger p-2">JSON 解析失败，切回编辑器看具体位置。</div>
              )}
            </div>
          ) : (
            <pre className="h-[520px] overflow-auto p-3 text-xs font-mono text-muted whitespace-pre-wrap scrollbar-thin">
              {parsed.ok ? JSON.stringify(parsed.value, null, 2) : current.text}
            </pre>
          )}

          {/* 状态栏 */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface/60 px-3 py-1.5 text-[11px] text-faint">
            <div className="flex items-center gap-3">
              <span>
                行 {cursor.line}，列 {cursor.column}
              </span>
              {cursor.selected > 0 && <span>选中 {cursor.selected} 字符</span>}
              <span>UTF-8</span>
              {dirtyCount > 0 && (
                <span className="text-warning">
                  {dirtyCount} 个文件待保存
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {current.errorInfo ? (
                <span className="text-danger truncate max-w-[420px]" title={current.errorInfo.message}>
                  {current.errorInfo.message}
                  {current.errorInfo.line
                    ? `（第 ${current.errorInfo.line} 行第 ${current.errorInfo.column ?? 1} 列）`
                    : ''}
                </span>
              ) : (
                <span className="text-success">JSON 正常</span>
              )}
              <span>
                最后保存：
                {current.lastSaved
                  ? new Date(current.lastSaved).toLocaleTimeString('zh-CN', { hour12: false })
                  : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-faint mb-1.5">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function ToolButton({
  icon,
  label,
  onClick,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-1.5 rounded-md border border-line bg-chip/40 px-2 py-1.5 text-[11px] text-muted hover:text-content hover:bg-hover transition-colors"
    >
      <Icon name={icon} className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-accent"
      />
      {label}
    </label>
  );
}

/** 收集所有可折叠路径（「全部收起」用） */
function collectPaths(value: unknown, path = '$', out: string[] = []): string[] {
  if (value && typeof value === 'object') {
    out.push(path);
    const entries = Array.isArray(value)
      ? value.map((v, i) => [String(i), v] as const)
      : Object.entries(value as Record<string, unknown>);
    for (const [k, v] of entries)
      collectPaths(v, Array.isArray(value) ? `${path}[${k}]` : `${path}.${k}`, out);
  }
  return out;
}

/** 轻量树状视图：不引第三方库，几百个节点足够快 */
function JsonTree({
  value,
  path,
  name,
  collapsed,
  toggle,
}: {
  value: unknown;
  path: string;
  name?: string;
  collapsed: Set<string>;
  toggle: (p: string) => void;
}) {
  const isArray = Array.isArray(value);
  const isObject = !!value && typeof value === 'object';
  const isOpen = !collapsed.has(path);

  if (!isArray && !isObject) {
    return (
      <div className="flex gap-1.5 py-0.5">
        {name !== undefined && <span className="text-accent">{name}:</span>}
        <span className={primitiveClass(value)}>{formatPrimitive(value)}</span>
      </div>
    );
  }

  const entries = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>);
  const count = entries.length;

  return (
    <div className={name === undefined ? '' : 'pl-3 border-l border-line/60'}>
      <button
        type="button"
        onClick={() => toggle(path)}
        className="flex items-center gap-1 py-0.5 text-left hover:text-content"
      >
        <Icon name={isOpen ? 'collapse' : 'arrowRight'} className="w-3 h-3 text-faint shrink-0" />
        {name !== undefined && <span className="text-accent">{name}:</span>}
        <span className="text-faint">{isArray ? `[${count}]` : `{${count}}`}</span>
      </button>
      {isOpen && (
        <div className="pl-1">
          {entries.map(([k, v]) => (
            <JsonTree
              key={k}
              value={v}
              name={isArray ? `[${k}]` : k}
              path={isArray ? `${path}[${k}]` : `${path}.${k}`}
              collapsed={collapsed}
              toggle={toggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function formatPrimitive(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v);
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  return String(v);
}

function primitiveClass(v: unknown): string {
  if (typeof v === 'string') return 'text-warning break-all';
  if (typeof v === 'number') return 'text-success';
  if (typeof v === 'boolean') return 'text-accent';
  return 'text-faint';
}
