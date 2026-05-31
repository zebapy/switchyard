import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import type { AgentStatus } from './types/pane';
import { useWorkspaceStore } from './stores/workspace';
import { useProjectsStore } from './stores/projects';

type NotificationKind = 'waiting' | 'done';

// Whether the OS granted notification permission. Set once by initNotifications.
let permissionGranted = false;

// The pane a notification last fired for. Clicking a desktop notification only
// foregrounds the app (the Tauri plugin emits no JS click event on desktop —
// tauri-apps/plugins-workspace#2150), so we route to this pane on the next
// window-focus-gained edge instead. Cleared once consumed or after the TTL.
let pendingFocusPaneId: string | null = null;
let pendingFocusAt = 0;
const PENDING_FOCUS_TTL_MS = 30_000;

// Map a status transition to a notification, or null when it shouldn't notify.
// "done" fires only on working -> idle: waiting -> idle is the known quirk where
// an untouched prompt simply times out, and undefined -> idle is a fresh pane.
function resolveNotification(
  prev: AgentStatus | undefined,
  next: AgentStatus,
): NotificationKind | null {
  if (next === 'waiting') return 'waiting';
  if (next === 'idle' && prev === 'working') return 'done';
  return null;
}

// Suppress when the user is already looking at the pane: app window focused AND
// the pane is the active pane of the active window.
function isPaneFocused(paneId: string): boolean {
  if (!document.hasFocus()) return false;
  const store = useWorkspaceStore.getState();
  const win = store.findWindowForPane(paneId);
  if (!win) return false;
  return store.activeWindowId === win.projectPath && win.activePaneId === paneId;
}

function buildCopy(paneId: string, kind: NotificationKind): { title: string; body: string } {
  const store = useWorkspaceStore.getState();
  const pane = store.panes.get(paneId);
  const name = pane?.customName || pane?.title || 'Claude';
  const win = store.findWindowForPane(paneId);
  const project = win ? win.projectPath.split('/').pop() ?? win.projectPath : '';
  const where = project ? `${project} · ` : '';
  if (kind === 'waiting') {
    return { title: `Needs your input — ${name}`, body: `${where}Claude hit a prompt` };
  }
  return { title: `Done — ${name}`, body: `${where}Claude finished` };
}

// Request notification permission once at startup.
export async function initNotifications(): Promise<void> {
  let granted = await isPermissionGranted();
  if (!granted) {
    const permission = await requestPermission();
    granted = permission === 'granted';
  }
  permissionGranted = granted;
}

// Fire a notification for a status transition, applying all gates. Called from
// the workspace store's setAgentStatus choke point.
export function maybeNotifyTransition(
  paneId: string,
  prev: AgentStatus | undefined,
  next: AgentStatus,
): void {
  const kind = resolveNotification(prev, next);
  if (!kind) return;
  if (!permissionGranted) return;
  if (!useProjectsStore.getState().desktopNotifications) return;
  if (isPaneFocused(paneId)) return;

  const { title, body } = buildCopy(paneId, kind);
  pendingFocusPaneId = paneId;
  pendingFocusAt = Date.now();
  sendNotification({ title, body });
}

// Return and clear the pane to focus after the app regains focus. Stale ids
// (older than the TTL) are dropped so an unrelated later focus doesn't reroute.
export function consumePendingFocus(): string | null {
  if (!pendingFocusPaneId) return null;
  const id = pendingFocusPaneId;
  pendingFocusPaneId = null;
  if (Date.now() - pendingFocusAt > PENDING_FOCUS_TTL_MS) return null;
  return id;
}
