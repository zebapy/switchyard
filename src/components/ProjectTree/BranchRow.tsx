import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { ContextMenu } from '@base-ui-components/react/context-menu';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useWorkspaceStore } from '../../stores/workspace';
import { useProjectsStore } from '../../stores/projects';
import { goToWorkspace } from '../../router';
import { findLinearIdentifier } from '../../lib/linearIdentifier';
import { SessionRow } from './SessionRow';
import { AddMenu } from './AddMenu';
import { ArchiveConfirmDialog } from './ArchiveConfirmDialog';
import { ChevronIcon, BaseBranchIcon, WorktreeIcon, ArchiveIcon, GitHostIcon, LinearIcon } from '../icons';
import { openBranchOnRemote, hostLabel } from '../../lib/openBranchOnRemote';
import type { WorktreeInfo, PrInfo, WorktreeArchiveStatus } from '../../types/project';

const menuPopupClass =
  'z-[300] min-w-[210px] rounded-[10px] border border-line bg-side p-[5px] font-ui ' +
  'text-[13px] text-ink shadow-[0_16px_48px_rgba(0,0,0,0.5)] outline-none';
const menuItemClass =
  'flex items-center gap-[9px] rounded-[7px] px-[9px] py-[7px] cursor-pointer select-none ' +
  'text-ink-dim outline-none data-[highlighted]:bg-hover data-[highlighted]:text-ink ' +
  'data-[disabled]:cursor-not-allowed data-[disabled]:text-ink-faint data-[disabled]:data-[highlighted]:bg-transparent';
const menuIconClass = 'grid w-4 place-items-center text-ink-faint';
const menuStatusClass = 'px-[9px] pb-[3px] pt-[4px] text-[11px] leading-snug text-ink-faint';
const menuSeparatorClass = 'my-[5px] h-px bg-line';

function basename(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? path;
}

function prClass(state: string, draft = false): string {
  const s = state.toLowerCase();
  if (s === 'merged') return 'pr-merged border-[rgba(199,155,255,0.3)] text-ai';
  if (s === 'closed') return 'pr-closed border-[rgba(240,117,138,0.3)] text-del';
  if (draft) return 'pr-draft border-line text-ink-dim';
  return 'pr-open border-[rgba(111,208,140,0.25)] text-add';
}

interface ArchiveMenuItemsProps {
  /** The base/main worktree can never be archived. */
  isMain: boolean;
  /** Status fetch is in flight. */
  loading: boolean;
  /** Archive eligibility + warnings, or null before the first fetch / on error. */
  status: WorktreeArchiveStatus | null;
  /** Message from a failed archive attempt, shown in place of the status. */
  error: string | null;
  onArchive: () => void;
}

/** Context-menu body for a worktree row: the archive action plus a status line
 *  explaining any blocker or the uncommitted work that archiving would discard. */
function ArchiveMenuItems({ isMain, loading, status, error, onArchive }: ArchiveMenuItemsProps) {
  if (isMain) {
    return (
      <>
        <ContextMenu.Item className={menuItemClass} disabled>
          <span className={menuIconClass}><ArchiveIcon size={14} /></span> Archive worktree
        </ContextMenu.Item>
        <div className={menuStatusClass}>The base branch worktree cannot be archived.</div>
      </>
    );
  }

  const canArchive = !loading && (status?.can_archive ?? false);
  const dirtyLines = (status?.uncommitted_added ?? 0) + (status?.uncommitted_deleted ?? 0);

  return (
    <>
      <ContextMenu.Item className={menuItemClass} disabled={!canArchive} onClick={onArchive}>
        <span className={menuIconClass}><ArchiveIcon size={14} /></span> Archive worktree
      </ContextMenu.Item>
      {error && <div className={`${menuStatusClass} text-del`}>{error}</div>}
      {!error && loading && <div className={menuStatusClass}>Checking status…</div>}
      {!error && !loading && status && !status.can_archive && status.blocked_reason && (
        <div className={`${menuStatusClass} text-del`}>{status.blocked_reason}</div>
      )}
      {!error && !loading && status?.can_archive && dirtyLines > 0 && (
        <div className={menuStatusClass}>
          {dirtyLines} uncommitted line{dirtyLines === 1 ? '' : 's'} will be discarded.
        </div>
      )}
    </>
  );
}

interface BranchRowProps {
  /** Base project path — used for worktree delete + script registration. */
  projectPath: string;
  worktree: WorktreeInfo;
  /** Shown in the meta slot on the base branch. */
  pr?: PrInfo | null;
}

export function BranchRow({ projectPath, worktree, pr }: BranchRowProps) {
  const path = worktree.path;
  const isMain = worktree.is_main;
  const win = useWorkspaceStore((s) => s.windows.get(path));
  const activeWindowId = useWorkspaceStore((s) => s.activeWindowId);
  const revealNonce = useWorkspaceStore((s) => s.revealNonce);
  const rowRef = useRef<HTMLDivElement>(null);
  const panes = useWorkspaceStore((s) => s.panes);
  const switchWindow = useWorkspaceStore((s) => s.switchWindow);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const addTab = useWorkspaceStore((s) => s.addTab);
  const archiveWorktree = useProjectsStore((s) => s.archiveWorktree);
  const getWorktreeArchiveStatus = useProjectsStore((s) => s.getWorktreeArchiveStatus);
  const expandProject = useProjectsStore((s) => s.expandProject);
  const defaultAgent = useProjectsStore((s) => s.agents[0]?.command);
  const remoteHost = useProjectsStore((s) => s.gitHosts.get(projectPath)?.host ?? null);
  const linearIssuePrefixes = useProjectsStore((s) => s.linearIssuePrefixes);

  const tabs = win?.tabs ?? [];
  const [open, setOpen] = useState(isMain || tabs.length > 0);
  const [archiveStatus, setArchiveStatus] = useState<WorktreeArchiveStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const inWorkspace = useLocation().pathname.startsWith('/workspace');
  const isWindowActive = activeWindowId === path && inWorkspace;

  // Whenever a tab in this branch's window is focused or navigated to — the
  // window becoming active (Cmd+1-9, window cycling, focusing a pane, session
  // restore), the active tab changing within an already-active window, or an
  // explicit reveal request (dashboard tile / session row click, which bumps
  // revealNonce so re-selecting the same tab still fires) — reveal it in the
  // sidebar: open the session list, expand the parent project, and scroll the
  // row into view. Keying on the active tab too means focusing a tab re-reveals
  // it even after a manual collapse.
  const activeTabId = win?.activeTabId;
  useEffect(() => {
    if (activeWindowId !== path) return;
    setOpen(true);
    expandProject(projectPath);
    rowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeWindowId, activeTabId, revealNonce, path, projectPath, expandProject]);
  const branchName = worktree.branch ?? basename(path);
  const hasDiff = worktree.added > 0 || worktree.deleted > 0;

  // Clicking the row opens this Workspace: reveal its active (or first) tab, or
  // start the default agent if it has no sessions yet. Per Q6c the row also expands
  // the inline session list.
  const openWorkspace = () => {
    setOpen(true);
    if (tabs.length > 0) {
      switchWindow(path);
      setActiveTab(win?.activeTabId ?? tabs[0].id);
    } else {
      addTab(path, branchName, { kind: 'Agent', cwd: path, agent: defaultAgent });
    }
    goToWorkspace();
  };

  const toggleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen((v) => !v);
  };

  // Fetch fresh archive eligibility — dirty counts and lock state can change
  // between opens. The base worktree never queries.
  const fetchArchiveStatus = () => {
    if (isMain) return;
    setArchiveError(null);
    setArchiveStatus(null);
    setStatusLoading(true);
    getWorktreeArchiveStatus(projectPath, basename(path))
      .then(setArchiveStatus)
      .catch(() => setArchiveStatus(null))
      .finally(() => setStatusLoading(false));
  };

  const handleMenuOpenChange = (menuOpen: boolean) => {
    if (!menuOpen) return;
    fetchArchiveStatus();
  };

  // The row's archive button is the same action as the context menu — confirm
  // first, refreshing the dirty-line count so the discard warning is accurate.
  const handleArchiveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    fetchArchiveStatus();
    setConfirmArchive(true);
  };

  const dirtyLines =
    (archiveStatus?.uncommitted_added ?? 0) + (archiveStatus?.uncommitted_deleted ?? 0);

  const handleArchive = () => setConfirmArchive(true);

  const runArchive = () => {
    setConfirmArchive(false);
    archiveWorktree(projectPath, basename(path)).catch((e) => setArchiveError(String(e)));
  };

  const openOnRemote = () => {
    openBranchOnRemote(path, branchName).catch(() => null);
  };

  // A Linear issue identifier (e.g. FDY-123) embedded in this worktree's branch
  // or path, matched against the user's configured team prefixes.
  const linearIssueId = findLinearIdentifier(`${branchName} ${path}`, linearIssuePrefixes);

  const openLinearIssue = () => {
    if (!linearIssueId) return;
    invoke<string | null>('linear_issue_url', { identifier: linearIssueId })
      .then((url) => (url ? openUrl(url) : null))
      .catch(() => null);
  };

  return (
    <div ref={rowRef} className="relative">
      <ContextMenu.Root onOpenChange={handleMenuOpenChange}>
        <ContextMenu.Trigger
          render={
            <button
              onClick={openWorkspace}
              title={path}
              className={
                'group relative flex w-full items-center gap-[7px] rounded-lg px-2 py-1.5 text-left transition-colors ' +
                (isWindowActive
                  ? "bg-active before:absolute before:-left-2.5 before:top-1/2 before:h-[15px] before:w-[3px] before:-translate-y-1/2 before:rounded-[3px] before:bg-ember-strong before:content-['']"
                  : 'hover:bg-hover')
              }
            />
          }
        >
        <span
          role="button"
          tabIndex={-1}
          onClick={toggleOpen}
          aria-label={open ? 'Collapse sessions' : 'Expand sessions'}
          className={`grid cursor-pointer place-items-center rounded text-ink-faint transition-transform duration-200 hover:text-ink ${open ? 'rotate-90' : ''}`}
        >
          <ChevronIcon size={11} />
        </span>
        <span className={`grid place-items-center ${isMain ? 'text-ink-dim' : 'text-ink-faint'}`}>
          {isMain ? <BaseBranchIcon size={14} /> : <WorktreeIcon size={14} />}
        </span>
        <span className={`min-w-0 flex-1 truncate font-mono text-[13px] font-medium tracking-[-0.2px] ${isWindowActive ? 'text-ink' : 'text-ink-dim'}`}>
          {branchName}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-[7px]">
          {pr && (
            <span
              className={`inline-flex items-center rounded-full border px-[7px] font-mono text-xs font-medium leading-[17px] ${prClass(pr.state, pr.draft)}`}
              title={pr.draft ? `${pr.url} (draft)` : pr.url}
            >
              #{pr.number}
              {pr.ci_status && (
                <span className={`ml-1 ${pr.ci_status === 'passing' ? 'text-add' : pr.ci_status === 'failing' ? 'text-del' : 'text-[#f9e2af]'}`}>
                  {pr.ci_status === 'passing' ? '✓' : pr.ci_status === 'failing' ? '✗' : '◌'}
                </span>
              )}
            </span>
          )}
          {hasDiff && (
            <span className="inline-flex items-center gap-1.5 font-mono text-xs font-medium">
              <span className="text-add before:opacity-80 before:content-['+']">{worktree.added}</span>
              <span className="text-del before:opacity-80 before:content-['−']">{worktree.deleted}</span>
            </span>
          )}
          {!isMain && (
            <span
              role="button"
              tabIndex={-1}
              onClick={handleArchiveClick}
              title="Archive worktree"
              className="grid size-[18px] cursor-pointer place-items-center rounded-md text-ink-faint opacity-0 transition group-hover:opacity-100 hover:bg-hover hover:text-del"
            >
              <ArchiveIcon size={12} />
            </span>
          )}
        </span>
        </ContextMenu.Trigger>

        <ContextMenu.Portal>
          <ContextMenu.Positioner className="z-[300]">
            <ContextMenu.Popup className={menuPopupClass}>
              {linearIssueId && (
                <ContextMenu.Item className={menuItemClass} onClick={openLinearIssue}>
                  <span className={menuIconClass}><LinearIcon size={14} /></span>
                  Open Linear issue {linearIssueId}
                </ContextMenu.Item>
              )}
              <ContextMenu.Item className={menuItemClass} onClick={openOnRemote}>
                <span className={menuIconClass}><GitHostIcon host={remoteHost} size={14} /></span>
                Open branch on {hostLabel(remoteHost)}
              </ContextMenu.Item>
              <ContextMenu.Separator className={menuSeparatorClass} />
              <ArchiveMenuItems
                isMain={isMain}
                loading={statusLoading}
                status={archiveStatus}
                error={archiveError}
                onArchive={handleArchive}
              />
            </ContextMenu.Popup>
          </ContextMenu.Positioner>
        </ContextMenu.Portal>
      </ContextMenu.Root>

      <ArchiveConfirmDialog
        isOpen={confirmArchive}
        branchName={branchName}
        dirtyLines={dirtyLines}
        onCancel={() => setConfirmArchive(false)}
        onConfirm={runArchive}
      />

      <div className={`grid transition-[grid-template-rows] duration-[260ms] ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="relative pl-[19px] before:absolute before:left-2 before:-top-0.5 before:bottom-2 before:w-px before:bg-guide before:content-['']">
            {/* Preview tabs are left out — the tree lists what the user committed
                to, not what they glanced at. ⌘N still counts every tab in the
                strip, so `index` stays the tab's real position and the hints
                here read 1, 2, 4 when a preview sits between them. */}
            {tabs.map((tab, index) => (tab.preview ? null : (
              <SessionRow
                key={tab.id}
                windowPath={path}
                tab={tab}
                panes={panes}
                isActiveTab={isWindowActive && win?.activeTabId === tab.id}
                activePaneId={win?.activePaneId ?? null}
                index={index}
                tabCount={tabs.length}
                windowActive={isWindowActive}
              />
            )))}
            <AddMenu
              windowPath={path}
              label={branchName}
              scriptsProjectPath={isMain ? projectPath : undefined}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
