import { openPath } from '@tauri-apps/plugin-opener';
import { FolderIcon, CodeIcon, CursorIcon, TermIcon } from '../components/icons';

/** An external app a folder can be opened in from an "Open in…" affordance. */
export interface OpenInTarget {
  id: string;
  label: string;
  /** macOS app name passed to `open -a`. Omit to open the folder in Finder. */
  app?: string;
  icon: React.ReactNode;
}

/** The apps offered wherever a folder can be opened externally (workspace header, Zen ⌘O). */
export const OPEN_IN_TARGETS: OpenInTarget[] = [
  { id: 'finder', label: 'Finder', icon: <FolderIcon size={14} /> },
  { id: 'vscode', label: 'VS Code', app: 'Visual Studio Code', icon: <CodeIcon size={14} /> },
  { id: 'cursor', label: 'Cursor', app: 'Cursor', icon: <CursorIcon size={14} /> },
  { id: 'terminal', label: 'Terminal', app: 'Terminal', icon: <TermIcon size={14} /> },
  { id: 'iterm', label: 'iTerm', app: 'iTerm', icon: <TermIcon size={14} /> },
  { id: 'warp', label: 'Warp', app: 'Warp', icon: <TermIcon size={14} /> },
  { id: 'ghostty', label: 'Ghostty', app: 'Ghostty', icon: <TermIcon size={14} /> },
];

/** Open a folder path in the given macOS app (via `open -a`), or Finder when no app is given. */
export function openPathIn(path: string, app?: string): void {
  openPath(path, app).catch(() => null);
}
