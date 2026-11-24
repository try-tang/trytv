'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor, { loader, type OnMount } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { authFetch } from '@/lib/auth-client';
import {
  SECRET_PLACEHOLDER,
  parseConfig,
  stringifyConfig,
  type EditableConfig,
} from '@/lib/admin-config';
import { cn } from '@/lib/utils';

/**
 * 后台「配置」页签 —— JSON 配置编辑器。
 *
 * 形态参考 LunaTV-config 的 web-editor（左侧工具面板 + 中间 Monaco + 底部状态栏），
 * 但数据源换成站点自己的 `.data/site.json`：不经过 GitHub、不需要 Personal Access Token，
 * 保存走 `/api/admin` 的 `config.save` 动作，只回写 settings 与 shorts 两个字段。
 *
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

export function ConfigPanel() {
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [meta, setMeta] = useState<ConfigMeta | null>(null);
  const [view, setView] = useState<ViewTab>('editor');
  const [wrap, setWrap] = useState(true);
  const [minimap, setMinimap] = useState(false);
  const [lineNumbers, setLineNumbers] = useState(true);
  const [fontSize, setFontSize] = useState(13);
  const [cursor, setCursor] = useState<CursorInfo>({ line: 1, column: 1, selected: 0 });
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [errorInfo, setErrorInfo] = useState<{ message: string; line?: number; column?: number } | null>(
    null
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /** 格式化后的文本 → 用于树状视图与预览；解析失败时退回原文 */
  const parsed = useMemo(() => {
    try {
      return { ok: true as const, value: JSON.parse(text) as unknown };
    } catch {
      return { ok: false as const, value: null };
    }
  }, [text]);

  const applyServerConfig = useCallback((config: EditableConfig, m?: ConfigMeta) => {
    setText(stringifyConfig(config));
    if (m) setMeta(m);
    setDirty(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorInfo(null);
    try {
      const data = await authFetch<{ config: EditableConfig; meta: ConfigMeta }>(
        '/api/admin?res=config'
      );
      applyServerConfig(data.config, data.meta);
      setLoaded(true);
      setLastSaved(Date.now());
    } catch (err) {
      const message = err instanceof Error ? err.message : '读取配置失败';
      setErrorInfo({ message });
      toast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [applyServerConfig, toast]);

  useEffect(() => {
    void load();
    // 只在挂载时拉一次；之后的刷新由站长手动点「重新载入」
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(async () => {
    const check = parseConfig(text);
    if (!check.ok) {
      setErrorInfo({ message: check.error, line: check.line, column: check.column });
      toast('JSON 有错误，先修好再保存', 'error');
      // 跳到出错行，省得手动找
      const editor = editorRef.current;
      if (editor && check.line) {
        editor.revealLineInCenter(check.line);
        editor.setPosition({ lineNumber: check.line, column: check.column ?? 1 });
        editor.focus();
      }
      return;
    }
    setSaving(true);
    setErrorInfo(null);
    try {
      const data = await authFetch<{
        config: EditableConfig;
        stats: { total: number; dropped: number };
      }>('/api/admin', {
        method: 'POST',
        body: JSON.stringify({ action: 'config.save', json: text }),
      });
      applyServerConfig(data.config);
      setLastSaved(Date.now());
      if (data.stats.dropped > 0) {
        toast(
          `已保存，但有 ${data.stats.dropped} 条短剧缺字段被丢弃（需要 title，以及 url 或分集）`,
          'warning'
        );
      } else {
        toast('配置已保存，立即生效', 'success');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存失败';
      setErrorInfo({ message });
      toast(message, 'error');
    } finally {
      setSaving(false);
    }
  }, [applyServerConfig, text, toast]);

  const format = useCallback(() => {
    const check = parseConfig(text);
    if (!check.ok) {
      setErrorInfo({ message: check.error, line: check.line, column: check.column });
      toast('JSON 有错误，无法格式化', 'error');
      return;
    }
    setText(stringifyConfig(check.value));
    setDirty(true);
    toast('已格式化', 'success');
  }, [text, toast]);

  const minify = useCallback(() => {
    const check = parseConfig(text);
    if (!check.ok) {
      setErrorInfo({ message: check.error, line: check.line, column: check.column });
      toast('JSON 有错误，无法压缩', 'error');
      return;
    }
    setText(JSON.stringify(check.value));
    setDirty(true);
    toast('已压缩为一行', 'success');
  }, [text, toast]);

  const validate = useCallback(() => {
    const check = parseConfig(text);
    if (check.ok) {
      setErrorInfo(null);
      const shorts = check.value.shorts ?? [];
      toast(`校验通过：${shorts.length} 条短剧，settings 字段正常`, 'success');
    } else {
      setErrorInfo({ message: check.error, line: check.line, column: check.column });
      toast('校验没通过，看下方提示', 'error');
    }
  }, [text, toast]);

  const download = useCallback(() => {
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `site-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('已导出到下载目录', 'success');
  }, [text, toast]);

  const upload = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const content = String(reader.result ?? '');
        setText(content);
        setDirty(true);
        const check = parseConfig(content);
        setErrorInfo(
          check.ok ? null : { message: check.error, line: check.line, column: check.column }
        );
        toast(check.ok ? `已载入 ${file.name}` : `${file.name} 有格式问题，检查后再保存`, check.ok ? 'success' : 'warning');
      };
      reader.readAsText(file, 'utf-8');
    },
    [toast]
  );

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast('已复制到剪贴板', 'success');
    } catch {
      toast('浏览器拒绝了剪贴板权限', 'error');
    }
  }, [text, toast]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        void load();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [load, save]);

  const onMount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.onDidChangeCursorSelection((e) => {
      const pos = e.selection.getStartPosition();
      const selected = editor.getModel()?.getValueInRange(e.selection).length ?? 0;
      setCursor({ line: pos.lineNumber, column: pos.column, selected });
    });
  };

  const lines = useMemo(() => text.split('\n').length, [text]);

  return (
    <div className="rounded-xl border border-line bg-card overflow-hidden">
      {/* 顶栏：文件信息 + 主操作 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface/60 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="code" className="w-4 h-4 text-accent shrink-0" />
          <span className="text-sm font-semibold text-content shrink-0">
            {meta?.file ?? 'site.json'}
          </span>
          <span className="text-[11px] text-faint">
            {text.length.toLocaleString()} 字符 · {lines} 行
          </span>
          {dirty && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/15 text-warning">
              未保存
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" className="btn-ghost btn-sm" onClick={() => void load()} disabled={loading}>
            <Icon name="refresh" className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            重新载入
          </button>
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={() => void save()}
            disabled={saving || loading || !loaded}
          >
            <Icon name="check" className="w-3.5 h-3.5" />
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row">
        {/* 左侧工具面板 */}
        <aside className="lg:w-52 shrink-0 border-b lg:border-b-0 lg:border-r border-line bg-surface/30 p-2.5 space-y-3">
          <ToolGroup title="文件">
            <ToolButton icon="download" onClick={download} label="导出 JSON" />
            <ToolButton icon="file" onClick={() => fileInputRef.current?.click()} label="导入 JSON" />
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
            <ToolButton icon="check" onClick={validate} label="校验" />
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
            只接受 <code className="text-accent">settings</code> 与{' '}
            <code className="text-accent">shorts</code> 两个字段。
            <br />
            求片 / 赞赏 / 通知有各自页签，这里改不到。
            <br />
            口令写 <code className="text-warning">{SECRET_PLACEHOLDER}</code> 表示不改，
            留空表示清除。
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
                    view === t.id
                      ? 'border-accent text-accent'
                      : 'border-transparent text-muted hover:text-content'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {view === 'tree' && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="btn-ghost btn-sm !py-1 !text-[11px]"
                  onClick={() => setCollapsed(new Set())}
                >
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

          {loading ? (
            <div className="h-[420px] flex items-center justify-center text-xs text-faint">
              正在读取配置…
            </div>
          ) : view === 'editor' ? (
            <Editor
              height="420px"
              defaultLanguage="json"
              value={text}
              onChange={(v) => {
                setText(v ?? '');
                setDirty(true);
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
            <div className="h-[420px] overflow-auto p-2 text-xs font-mono scrollbar-thin">
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
            <pre className="h-[420px] overflow-auto p-3 text-xs font-mono text-muted whitespace-pre-wrap scrollbar-thin">
              {parsed.ok ? stringifyConfig(parsed.value as EditableConfig) : text}
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
            </div>
            <div className="flex items-center gap-3">
              {errorInfo ? (
                <span className="text-danger truncate max-w-[420px]" title={errorInfo.message}>
                  {errorInfo.message}
                  {errorInfo.line ? `（第 ${errorInfo.line} 行第 ${errorInfo.column ?? 1} 列）` : ''}
                </span>
              ) : (
                <span className="text-success">JSON 正常</span>
              )}
              <span>
                最后保存：
                {lastSaved ? new Date(lastSaved).toLocaleTimeString('zh-CN', { hour12: false }) : '—'}
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
    for (const [k, v] of entries) collectPaths(v, Array.isArray(value) ? `${path}[${k}]` : `${path}.${k}`, out);
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
        <Icon
          name={isOpen ? 'collapse' : 'arrowRight'}
          className="w-3 h-3 text-faint shrink-0"
        />
        {name !== undefined && <span className="text-accent">{name}:</span>}
        <span className="text-faint">
          {isArray ? `[${count}]` : `{${count}}`}
        </span>
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
