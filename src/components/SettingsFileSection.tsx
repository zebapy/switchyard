import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openPath } from '@tauri-apps/plugin-opener';

const h3Class = 'mb-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-ghost';
const descClass = 'mb-2.5 text-xs text-ink-faint';
const rowClass = 'flex items-center gap-3 rounded-[9px] border border-line bg-app px-2.5 py-2';
const valClass = 'flex-1 truncate font-mono text-xs text-ink-dim';
const btnClass =
  'rounded-lg border border-line bg-app px-[11px] py-1.5 text-xs text-ink-dim transition hover:border-guide hover:bg-hover hover:text-ink disabled:cursor-default disabled:opacity-50';
const codeClass = 'rounded border border-line-soft bg-side px-1 py-0.5 font-mono text-[11px] text-ember';

/** Path of the folder containing `path` (everything before the last separator). */
function parentDir(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut > 0 ? path.slice(0, cut) : path;
}

/** Settings are stored as JSON on disk; this section lets the user open that
 *  file in their editor and validate it against the generated JSON Schema. */
export function SettingsFileSection() {
  const [path, setPath] = useState('');

  useEffect(() => {
    invoke<string>('settings_file_path')
      .then(setPath)
      .catch(() => setPath(''));
  }, []);

  const openFile = () => {
    if (path) openPath(path).catch(() => null);
  };

  const reveal = () => {
    if (path) openPath(parentDir(path)).catch(() => null);
  };

  return (
    <div>
      <h3 className={h3Class}>Settings file</h3>
      <p className={descClass}>
        All settings are stored as JSON you can edit directly. Your editor can validate it against{' '}
        <code className={codeClass}>settings.schema.json</code> (referenced from the file’s{' '}
        <code className={codeClass}>$schema</code>). Changes are picked up next time the app reads settings.
      </p>
      <div className={rowClass}>
        <span className={valClass} title={path || 'Locating settings file…'}>
          {path || 'Locating settings file…'}
        </span>
        <button type="button" className={btnClass} onClick={reveal} disabled={!path}>
          Show in Finder
        </button>
        <button type="button" className={btnClass} onClick={openFile} disabled={!path}>
          Open
        </button>
      </div>
    </div>
  );
}
