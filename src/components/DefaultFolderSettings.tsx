import { useCallback } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjectsStore } from '../stores/projects';

const h3Class = 'mb-2.5 text-xs font-semibold text-ink';
const descClass = 'mb-2.5 text-xs text-ink-faint';
const rowClass = 'flex items-center gap-3 rounded-[9px] border border-line bg-app px-2.5 py-2';
const valClass = 'flex-1 truncate font-mono text-xs text-ink-dim';
const btnClass = 'rounded-lg border border-line bg-app px-[11px] py-1.5 text-xs text-ink-dim transition hover:border-guide hover:bg-hover hover:text-ink';

export function DefaultFolderSettings() {
  const scanRoot = useProjectsStore((s) => s.scanRoot);
  const setScanRoot = useProjectsStore((s) => s.setScanRoot);

  const handlePickScanRoot = useCallback(async () => {
    const sel = await open({ directory: true, multiple: false, title: 'Default folder for new projects' });
    if (typeof sel === 'string') await setScanRoot(sel);
  }, [setScanRoot]);

  return (
    <div>
      <h3 className={h3Class}>Default folder</h3>
      <p className={descClass}>Parent folder used when creating new projects.</p>
      <div className={rowClass}>
        <span className={valClass} title={scanRoot || '(not set)'}>{scanRoot || '(not set)'}</span>
        <button className={btnClass} onClick={handlePickScanRoot}>Change…</button>
      </div>
    </div>
  );
}
