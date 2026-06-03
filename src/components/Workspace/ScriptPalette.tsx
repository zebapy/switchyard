import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useUiStore } from '../../stores/ui';
import { useProjectsStore } from '../../stores/projects';
import { useWorkspaceStore } from '../../stores/workspace';
import { fuzzyMatch } from '../CommandPalette/fuzzyMatch';
import { SearchIcon } from '../icons';
import type { ScriptSource, ScriptEntry } from '../../types/scripts';

interface FlatItem {
  src: ScriptSource;
  script: ScriptEntry;
}

/** Relative directory shown in a group header, e.g. "packages/web/". Root shows "./". */
function relativeDir(dir: string, projectPath: string): string {
  if (dir === projectPath) return './';
  const prefix = projectPath.endsWith('/') ? projectPath : `${projectPath}/`;
  const rel = dir.startsWith(prefix) ? dir.slice(prefix.length) : dir;
  return `${rel}/`;
}

function badgeClass(lang: string): string {
  if (lang === 'py') return 'text-ai border-[rgba(199,155,255,0.4)] bg-[rgba(199,155,255,0.12)]';
  return 'text-ember border-ember-edge bg-ember-tint';
}

/**
 * "New script…" command palette. Auto-discovers every package.json / pyproject.toml
 * under the project, groups scripts by manifest, and runs the selected one in a new
 * tab with the detected runner (npm/pnpm/yarn/bun · pdm/uv).
 */
export function ScriptPalette() {
  const { open, projectPath, windowPath, label } = useUiStore((s) => s.scriptPalette);
  const closeScriptPalette = useUiStore((s) => s.closeScriptPalette);
  const showPane = useUiStore((s) => s.showPane);
  const discoverScripts = useProjectsStore((s) => s.discoverScripts);
  const addTab = useWorkspaceStore((s) => s.addTab);

  const [sources, setSources] = useState<ScriptSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch manifests whenever the palette opens for a project.
  useEffect(() => {
    if (!open || !projectPath) return;
    setSources([]);
    setError(null);
    setQuery('');
    setSelectedIdx(0);
    setLoading(true);
    let cancelled = false;
    discoverScripts(projectPath)
      .then((found) => {
        if (!cancelled) setSources(found);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      cancelled = true;
    };
  }, [open, projectPath, discoverScripts]);

  const groups = useMemo(() => {
    const q = query.trim();
    return sources
      .map((src) => {
        const scripts = [...src.scripts].sort((a, b) => a.name.localeCompare(b.name));
        const items = q
          ? scripts.filter((s) => fuzzyMatch(q, `${s.name} ${s.command} ${src.project_name}`))
          : scripts;
        return { src, items };
      })
      .filter((g) => g.items.length > 0);
  }, [sources, query]);

  const flat = useMemo<FlatItem[]>(
    () => groups.flatMap((g) => g.items.map((script) => ({ src: g.src, script }))),
    [groups],
  );

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  // Keep the selected row visible.
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${selectedIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  if (!open) return null;

  const run = (item: FlatItem | undefined) => {
    if (!item || !windowPath) return;
    addTab(windowPath, label ?? '', {
      kind: 'Custom',
      command: `${item.src.runner} run ${item.script.name}`,
      cwd: item.src.dir,
      label: `${label ?? item.src.project_name}: ${item.script.name}`,
    });
    showPane();
    closeScriptPalette();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(flat[selectedIdx]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeScriptPalette();
    }
  };

  let lastPath: string | null = null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-[rgba(6,7,9,0.6)] pt-[12vh] backdrop-blur-[3px]"
      onClick={closeScriptPalette}
    >
      <div
        className="flex max-h-[64vh] w-[560px] flex-col overflow-hidden rounded-2xl border border-line bg-side shadow-[0_30px_80px_-22px_rgba(0,0,0,0.85)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-line-soft px-[15px] py-3">
          <SearchIcon size={15} className="flex-none text-ink-faint" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
            placeholder="Search scripts…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
          {!loading && (
            <span className="text-[11px] tabular-nums text-ink-faint">
              {flat.length} {flat.length === 1 ? 'script' : 'scripts'}
            </span>
          )}
        </div>

        <div ref={listRef} className="scroll-thin overflow-y-auto p-1.5">
          {loading && (
            <div className="p-[18px] text-center text-[13px] text-ink-faint">Scanning project…</div>
          )}
          {!loading && error && (
            <div className="p-[18px] text-center text-[13px] text-del">{error}</div>
          )}
          {!loading && !error && flat.length === 0 && (
            <div className="p-[18px] text-center text-[13px] text-ink-faint">
              {sources.length === 0
                ? 'No package.json or pyproject.toml scripts found.'
                : `No scripts match “${query.trim()}”`}
            </div>
          )}

          {!loading &&
            !error &&
            flat.map((item, idx) => {
              const header = item.src.manifest_path !== lastPath;
              lastPath = item.src.manifest_path;
              const selected = idx === selectedIdx;
              return (
                <Fragment key={`${item.src.manifest_path}:${item.script.name}`}>
                  {header && (
                    <div className="sticky top-0 z-[2] mt-0.5 flex items-center gap-2 border-b border-line-soft bg-side px-2.5 pb-1.5 pt-2 first:mt-0">
                      <span
                        className={`flex-none rounded-[5px] border px-1.5 py-px font-mono text-[10px] font-semibold lowercase ${badgeClass(item.src.lang)}`}
                      >
                        {item.src.runner}
                      </span>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-dim">
                        {item.src.project_name}
                      </span>
                      <span className="truncate font-mono text-[10.5px] text-ink-ghost">
                        {projectPath ? relativeDir(item.src.dir, projectPath) : ''}
                        <span className="text-ink-faint">{item.src.manifest}</span>
                      </span>
                    </div>
                  )}
                  <div
                    data-idx={idx}
                    className={`flex cursor-pointer items-center gap-3 rounded-[8px] px-2.5 py-[7px] ${selected ? 'bg-hover' : ''}`}
                    onClick={() => run(item)}
                    onMouseMove={() => setSelectedIdx(idx)}
                  >
                    <span className={`w-[14px] flex-none text-center font-mono text-[13px] ${selected ? 'text-ember' : 'text-ink-faint'}`}>
                      ▸
                    </span>
                    <span className={`flex-none text-[13.5px] font-semibold ${selected ? 'text-ink' : 'text-ink-dim'}`}>
                      {item.script.name}
                    </span>
                    <span className={`min-w-0 flex-1 truncate font-mono text-[12px] ${selected ? 'text-ink-dim' : 'text-ink-faint'}`}>
                      {item.script.command}
                    </span>
                    {selected && (
                      <span className="flex-none font-mono text-[11px] text-ink-faint">
                        {item.src.runner} run {item.script.name}
                      </span>
                    )}
                  </div>
                </Fragment>
              );
            })}
        </div>
      </div>
    </div>
  );
}
