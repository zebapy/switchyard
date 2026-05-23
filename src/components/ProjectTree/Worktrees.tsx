import { useEffect, useMemo, useRef, useState } from 'react';
import { useProjectsStore } from '../../stores/projects';
import { useWorkspaceStore } from '../../stores/workspace';
import { ProjectSections } from './ProjectSections';
import type { WorktreeInfo } from '../../types/project';

interface WorktreesProps {
  projectPath: string;
}

function worktreeName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path;
}

/** Format Unix seconds as a compact relative duration: 30s, 5m, 2h, 3d, 4mo, 2y. */
function relativeTime(unixSeconds: number, now: number = Date.now()): string {
  const deltaSec = Math.max(0, Math.floor(now / 1000) - unixSeconds);
  if (deltaSec < 60) return `${deltaSec}s`;
  const minutes = Math.floor(deltaSec / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  const years = Math.floor(days / 365);
  return `${years}y`;
}

function formatAbsolute(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString();
}

export function Worktrees({ projectPath }: WorktreesProps) {
  const gitInfo = useProjectsStore((s) => s.gitInfo);
  const refreshGitInfo = useProjectsStore((s) => s.refreshGitInfo);
  const createWorktree = useProjectsStore((s) => s.createWorktree);
  const deleteWorktree = useProjectsStore((s) => s.deleteWorktree);
  const addTab = useWorkspaceStore((s) => s.addTab);

  const [showNew, setShowNew] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const git = gitInfo.get(projectPath);

  // List of non-main worktrees. The git crate already lists every linked
  // worktree regardless of filesystem location, including ones under
  // `.claude/worktrees`.
  const worktrees = useMemo<WorktreeInfo[]>(
    () => (git?.worktrees ?? []).filter((w) => !w.is_main),
    [git],
  );

  useEffect(() => {
    if (showNew) inputRef.current?.focus();
  }, [showNew]);

  const handleSubmit = async () => {
    const name = branchName.trim();
    if (!name) {
      setShowNew(false);
      return;
    }
    setError('');
    const newPath = await createWorktree(projectPath, name).catch((e: unknown) => {
      setError(String(e));
      throw e;
    });
    setShowNew(false);
    setBranchName('');
    await refreshGitInfo(projectPath);
    // Worktrees are created with the intent to start work — open the new
    // Window and spawn an agent immediately.
    if (newPath) {
      addTab(newPath, name, { kind: 'Agent' });
    }
  };

  const handleDelete = async (wt: WorktreeInfo) => {
    const name = worktreeName(wt.path);
    await deleteWorktree(projectPath, name).catch((e) => console.error('Failed to delete worktree:', e));
  };

  return (
    <div className="project-section">
      <div className="project-section-header">
        <span className="project-section-label">Worktrees</span>
        <button
          className="project-section-action"
          onClick={(e) => { e.stopPropagation(); setShowNew(true); setBranchName(''); setError(''); }}
        >
          + new worktree
        </button>
      </div>

      {showNew && (
        <div className="worktree-new-row">
          <input
            ref={inputRef}
            type="text"
            placeholder="branch name"
            value={branchName}
            onChange={(e) => { setBranchName(e.target.value); setError(''); }}
            className="worktree-new-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSubmit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setShowNew(false);
                setBranchName('');
                setError('');
              }
            }}
            onBlur={() => {
              setTimeout(() => { setShowNew(false); setBranchName(''); }, 150);
            }}
          />
          {error && <div className="worktree-new-error">{error}</div>}
        </div>
      )}

      {worktrees.length === 0 && !showNew && (
        <div className="project-section-empty">No worktrees</div>
      )}

      {worktrees.map((wt) => (
        <WorktreeRow key={wt.path} worktree={wt} onDelete={() => handleDelete(wt)} />
      ))}
    </div>
  );
}

interface WorktreeRowProps {
  worktree: WorktreeInfo;
  onDelete: () => void;
}

function WorktreeRow({ worktree, onDelete }: WorktreeRowProps) {
  const expandedProjects = useProjectsStore((s) => s.expandedProjects);
  const toggleExpanded = useProjectsStore((s) => s.toggleExpanded);
  const refreshGitInfo = useProjectsStore((s) => s.refreshGitInfo);
  const gitInfo = useProjectsStore((s) => s.gitInfo);

  const isExpanded = expandedProjects.has(worktree.path);
  const name = worktreeName(worktree.path);
  const wtGit = gitInfo.get(worktree.path);
  const branch = wtGit?.branch ?? worktree.branch;

  useEffect(() => {
    if (isExpanded) refreshGitInfo(worktree.path);
  }, [isExpanded, worktree.path, refreshGitInfo]);

  return (
    <div className="worktree-entry">
      <div
        className="worktree-entry-header"
        onClick={() => toggleExpanded(worktree.path)}
        title={worktree.path}
      >
        <span className="worktree-entry-toggle">{isExpanded ? '▾' : '▸'}</span>
        <span className="worktree-entry-name">{name}</span>
        {branch && <span className="worktree-entry-branch">⎇ {branch}</span>}
        {worktree.last_commit_unix !== null && (
          <span
            className="worktree-entry-age"
            title={`Last commit: ${formatAbsolute(worktree.last_commit_unix)}`}
          >
            {relativeTime(worktree.last_commit_unix)}
          </span>
        )}
        <button
          className="worktree-entry-delete"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Delete worktree"
        >
          ✕
        </button>
      </div>
      {isExpanded && (
        <div className="worktree-entry-body">
          <ProjectSections projectPath={worktree.path} projectName={name} />
        </div>
      )}
    </div>
  );
}
