import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { PaneKind } from '../../types/pane';
import { useWorkspaceStore } from '../../stores/workspace';

// Patterns that indicate the agent is waiting for user input
const WAITING_PATTERNS = [
  /Allow|Deny/,           // Permission prompts
  /\(y\/n\)/i,            // Yes/no prompts
  /\(Y\/n\)/,             // Yes/no prompts
  /\? \(/,                // Question with options
  /Do you want to/i,      // Confirmation prompts
  /Press Enter/i,         // Press enter prompts
];

// Braille spinner characters indicate active work
const SPINNER_CHARS = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⣾⣽⣻⢿⡿⣟⣯⣷';

const IDLE_TIMEOUT_MS = 4000;   // No output for 4s → idle

// Regex to match ANSI SGR sequences with RGB foreground color: ESC[38;2;R;G;Bm
const ANSI_RGB_FG_RE = /\x1b\[(?:[0-9;]*;)?38;2;(\d{1,3});(\d{1,3});(\d{1,3})(?:;[0-9]*)*m/g;

interface UseTerminalOptions {
  paneId: string;
  kind: PaneKind;
  cwd: string;
  command?: string;
  onTitleChange?: (title: string) => void;
}

interface PtyOutputPayload {
  id: string;
  data: string; // base64
}

export function useTerminal({
  paneId,
  kind,
  cwd,
  command,
  onTitleChange,
}: UseTerminalOptions) {
  const termRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const spawnedRef = useRef(false);

  const fit = useCallback(() => {
    fitAddonRef.current?.fit();
  }, []);

  useEffect(() => {
    if (!termRef.current || spawnedRef.current) return;
    spawnedRef.current = true;

    const terminal = new Terminal({
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace",
      theme: {
        background: '#1e1e2e',
        foreground: '#cdd6f4',
        cursor: '#f5e0dc',
        selectionBackground: '#45475a',
        black: '#45475a',
        red: '#f38ba8',
        green: '#a6e3a1',
        yellow: '#f9e2af',
        blue: '#89b4fa',
        magenta: '#f5c2e7',
        cyan: '#94e2d5',
        white: '#bac2de',
        brightBlack: '#585b70',
        brightRed: '#f38ba8',
        brightGreen: '#a6e3a1',
        brightYellow: '#f9e2af',
        brightBlue: '#89b4fa',
        brightMagenta: '#f5c2e7',
        brightCyan: '#94e2d5',
        brightWhite: '#a6adc8',
      },
      cursorBlink: true,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(termRef.current);

    // Try WebGL renderer
    try {
      terminal.loadAddon(new WebglAddon());
    } catch {
      // WebGL not available, fall back to canvas
    }

    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Capture title changes
    if (onTitleChange) {
      terminal.onTitleChange(onTitleChange);
    }

    // Agent status detection state
    let lastOutputTime = 0;
    let recentText = '';
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let detectedAccentColor: string | null = null;
    const setAgentStatus = useWorkspaceStore.getState().setAgentStatus;
    const setAgentAccentColor = useWorkspaceStore.getState().setAgentAccentColor;

    function detectAgentStatus(text: string) {
      if (kind !== 'Agent') return;

      lastOutputTime = Date.now();
      // Keep a sliding window of recent text for pattern matching
      recentText = (recentText + text).slice(-500);

      // Check for waiting patterns first (higher priority)
      for (const pattern of WAITING_PATTERNS) {
        if (pattern.test(recentText)) {
          setAgentStatus(paneId, 'waiting');
          recentText = ''; // Reset to avoid re-triggering
          return;
        }
      }

      // Check for spinner chars → working
      let hasSpinner = false;
      for (const ch of text) {
        if (SPINNER_CHARS.includes(ch)) {
          hasSpinner = true;
          break;
        }
      }
      if (hasSpinner || text.length > 10) {
        setAgentStatus(paneId, 'working');
      }

      // Detect accent color: extract RGB foreground color near spinner chars
      // Claude Code renders spinners with its accent color via ANSI RGB sequences
      if (hasSpinner && !detectedAccentColor) {
        // Look for the most recent RGB foreground color in this chunk
        ANSI_RGB_FG_RE.lastIndex = 0;
        let lastMatch: RegExpExecArray | null = null;
        let match: RegExpExecArray | null;
        while ((match = ANSI_RGB_FG_RE.exec(text)) !== null) {
          lastMatch = match;
        }
        if (lastMatch) {
          const r = parseInt(lastMatch[1], 10);
          const g = parseInt(lastMatch[2], 10);
          const b = parseInt(lastMatch[3], 10);
          // Skip near-white/near-black colors as they're likely not accent
          if (!(r > 220 && g > 220 && b > 220) && !(r < 30 && g < 30 && b < 30)) {
            const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            detectedAccentColor = hex;
            setAgentAccentColor(paneId, hex);
          }
        }
      }

      // Reset idle timer
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        const elapsed = Date.now() - lastOutputTime;
        if (elapsed >= IDLE_TIMEOUT_MS) {
          setAgentStatus(paneId, 'idle');
        }
      }, IDLE_TIMEOUT_MS);
    }

    // Listen for PTY output
    let unlisten: (() => void) | undefined;
    listen<PtyOutputPayload>(`pty-output-${paneId}`, (event) => {
      const bytes = Uint8Array.from(atob(event.payload.data), (c) => c.charCodeAt(0));
      terminal.write(bytes);
      // Decode for agent status detection
      if (kind === 'Agent') {
        const decoder = new TextDecoder('utf-8', { fatal: false });
        detectAgentStatus(decoder.decode(bytes));
      }
    }).then((fn) => {
      unlisten = fn;
    });

    // Copy to clipboard on text selection (like most terminal emulators)
    const selectionDisposable = terminal.onSelectionChange(() => {
      const selection = terminal.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection).catch(() => {
          // Clipboard API may not be available in all contexts
        });
      }
    });

    // Custom key handler: Ctrl+Shift+V to paste, Ctrl+Shift+C to copy
    terminal.attachCustomKeyEventHandler((event) => {
      // Ctrl+Shift+V → paste from clipboard
      if (event.ctrlKey && event.shiftKey && event.key === 'V' && event.type === 'keydown') {
        navigator.clipboard.readText().then((text) => {
          if (text) {
            const encoder = new TextEncoder();
            invoke('pty_write', {
              id: paneId,
              data: Array.from(encoder.encode(text)),
            }).catch(console.error);
          }
        }).catch(() => {});
        return false; // Prevent default handling
      }
      // Ctrl+Shift+C → copy selection (fallback if auto-copy missed it)
      if (event.ctrlKey && event.shiftKey && event.key === 'C' && event.type === 'keydown') {
        const selection = terminal.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection).catch(() => {});
        }
        return false;
      }
      return true; // Let all other keys pass through
    });

    // Send keyboard input to PTY
    const dataDisposable = terminal.onData((data) => {
      const encoder = new TextEncoder();
      invoke('pty_write', {
        id: paneId,
        data: Array.from(encoder.encode(data)),
      }).catch(console.error);
    });

    // Send binary input (mouse events, etc.)
    const binaryDisposable = terminal.onBinary((data) => {
      const bytes = Array.from(data, (c) => c.charCodeAt(0));
      invoke('pty_write', { id: paneId, data: bytes }).catch(console.error);
    });

    // Spawn PTY
    const rows = terminal.rows;
    const cols = terminal.cols;
    invoke('pty_spawn', {
      id: paneId,
      kind,
      cwd,
      command: command ?? null,
    }).then(() => {
      // Resize to actual terminal size
      invoke('pty_resize', { id: paneId, rows, cols }).catch(console.error);
    }).catch((err) => {
      terminal.writeln(`\r\nFailed to spawn: ${err}`);
    });

    // Handle resize
    const resizeDisposable = terminal.onResize(({ rows, cols }) => {
      invoke('pty_resize', { id: paneId, rows, cols }).catch(console.error);
    });

    // ResizeObserver for container
    const observer = new ResizeObserver(() => {
      fitAddon.fit();
    });
    observer.observe(termRef.current);

    return () => {
      clearTimeout(idleTimer);
      observer.disconnect();
      resizeDisposable.dispose();
      selectionDisposable.dispose();
      dataDisposable.dispose();
      binaryDisposable.dispose();
      unlisten?.();
      terminal.dispose();
      invoke('pty_kill', { id: paneId }).catch(console.error);
    };
  }, [paneId, kind, cwd, command, onTitleChange]);

  return { termRef, fit };
}
