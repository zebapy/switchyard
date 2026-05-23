import { useEffect } from 'react';
import { useWorkspaceStore } from '../stores/workspace';
import { useProjectsStore } from '../stores/projects';

interface TopBarProps {
  onOpenPalette: () => void;
}

function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  const idx = trimmed.lastIndexOf('/');
  return idx === -1 ? trimmed : trimmed.slice(idx + 1);
}

export function TopBar({ onOpenPalette }: TopBarProps) {
  const activeWindowId = useWorkspaceStore((s) => s.activeWindowId);
  const gitInfo = useProjectsStore((s) => s.gitInfo);
  const refreshGitInfo = useProjectsStore((s) => s.refreshGitInfo);

  useEffect(() => {
    if (!activeWindowId) return;
    if (!gitInfo.has(activeWindowId)) {
      refreshGitInfo(activeWindowId);
    }
  }, [activeWindowId, gitInfo, refreshGitInfo]);

  const projectName = activeWindowId ? basename(activeWindowId) : 'No project';
  const branch = activeWindowId ? gitInfo.get(activeWindowId)?.branch ?? null : null;

  return (
    <div className="relative z-[4] flex h-10 flex-none items-center justify-center border-b border-border bg-bg-dark px-3">
      <button
        type="button"
        onClick={onOpenPalette}
        aria-label="Open command palette"
        title={activeWindowId ?? 'Open command palette'}
        className="inline-flex min-w-[280px] max-w-[560px] cursor-pointer items-center gap-2 rounded-full border border-border bg-surface py-1 pl-3.5 pr-1.5 font-mono text-xs leading-none text-text-dim transition-colors hover:border-border-bright hover:bg-surface-hover hover:text-text"
      >
        <span className="max-w-[220px] truncate font-semibold text-text">
          {projectName}
        </span>
        {branch ? (
          <>
            <span className="text-text-muted">/</span>
            <span className="max-w-[220px] truncate text-accent">{branch}</span>
          </>
        ) : null}
        <kbd className="ml-auto rounded border border-border bg-bg-deep px-1.5 py-[3px] font-mono text-[10px] font-semibold tracking-wider text-text-muted">
          ⌘K
        </kbd>
      </button>
    </div>
  );
}
