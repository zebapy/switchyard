import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { PaneKind } from '../../types/pane';
import { useWorkspaceStore } from '../../stores/workspace';
import { pendingPaneInput } from './pendingInput';

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

// Custom OSC code the backend emits when an agent command exits and the pane
// drops to a plain shell. Must match AGENT_EXIT_OSC in src-tauri/src/pty.rs.
const AGENT_EXIT_OSC = 8765;

// Regex to match ANSI SGR sequences with RGB foreground color: ESC[38;2;R;G;Bm
const ANSI_RGB_FG_RE = /\x1b\[(?:[0-9;]*;)?38;2;(\d{1,3});(\d{1,3});(\d{1,3})(?:;[0-9]*)*m/g;

// Bracketed-paste wrappers: the agent TUI treats the wrapped text as a single
// paste (multi-line safe, not submitted), and the trailing CR submits it.
const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';
const INITIAL_INPUT_IDLE_MS = 800; // Quiet period after first output → ready.
const INITIAL_INPUT_CAP_MS = 4000; // Hard cap from first output.

// Decode a base64 string to bytes in a single tight loop. Faster than
// Uint8Array.from(atob(s), cb) under heavy PTY output (no per-byte callback).
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const length = binary.length;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// WebGL2 is required by the GPU renderer. Probe before loading the addon so we
// fall back to the (slower) DOM renderer instead of throwing on machines/webviews
// without it.
function webgl2Available(): boolean {
  const canvas = document.createElement('canvas');
  return !!canvas.getContext('webgl2');
}

interface UseTerminalOptions {
  paneId: string;
  kind: PaneKind;
  cwd: string;
  command?: string;
  tmuxSession?: string;
  agent?: string;
  isActive: boolean;
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
  tmuxSession,
  agent,
  isActive,
  onTitleChange,
}: UseTerminalOptions) {
  const termRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const spawnedRef = useRef(false);

  // FitAddon always reserves a fixed 14px gutter on the right for a scrollbar.
  // macOS/WebKit (Tauri's webview) draws the scrollbar as an overlay, so that
  // gutter stays permanently empty — the agent/terminal content stops short of
  // the pane's right edge and reads as off-centre ("not full width"). After the
  // base fit, recompute cols against the full container width to reclaim it.
  const fit = useCallback(() => {
    const container = termRef.current;
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!container || !terminal || !fitAddon) return;
    if (container.clientWidth === 0 || container.clientHeight === 0) return;

    fitAddon.fit();

    const screen = terminal.element?.querySelector('.xterm-screen') as HTMLElement | null;
    if (!screen || terminal.cols === 0) return;

    // After fit, the screen is exactly cols * cellWidth wide, so this recovers
    // the real cell width without reaching into xterm internals.
    const cellWidth = screen.clientWidth / terminal.cols;
    if (cellWidth === 0) return;

    const cols = Math.max(2, Math.floor(container.clientWidth / cellWidth));
    if (cols !== terminal.cols) {
      terminal.resize(cols, terminal.rows);
    }
  }, []);

  const focus = useCallback(() => {
    fit();
    terminalRef.current?.focus();
  }, [fit]);

  useEffect(() => {
    if (!termRef.current || spawnedRef.current) return;
    spawnedRef.current = true;
    let disposed = false;

    // Prompt to "type" into this pane once the agent has booted (e.g. from the
    // diff-comment composer). Consumed once, then dropped from the registry.
    const initial = pendingPaneInput.get(paneId);

    const terminal = new Terminal({
      fontSize: 13,
      fontFamily: "'IBM Plex Mono', 'JetBrains Mono', Menlo, Monaco, monospace",
      theme: {
        background: '#101216',
        foreground: '#cfd3da',
        cursor: '#ffae5c',
        selectionBackground: '#2a2f38',
        black: '#24272e',
        red: '#f0758a',
        green: '#6fd08c',
        yellow: '#f9e2af',
        blue: '#7cc7ff',
        magenta: '#c79bff',
        cyan: '#7fd9c7',
        white: '#c7ccd4',
        brightBlack: '#646b76',
        brightRed: '#f0758a',
        brightGreen: '#6fd08c',
        brightYellow: '#f9e2af',
        brightBlue: '#7cc7ff',
        brightMagenta: '#c79bff',
        brightCyan: '#7fd9c7',
        brightWhite: '#e6e8ec',
      },
      cursorBlink: true,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(termRef.current);

    // GPU renderer: offloads high-throughput terminal painting (agent streaming)
    // off the main thread. Falls back to the DOM renderer when WebGL2 is missing
    // or its context is lost.
    let webglAddon: WebglAddon | undefined;
    if (webgl2Available()) {
      webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon?.dispose();
        webglAddon = undefined;
      });
      terminal.loadAddon(webglAddon);
    }

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const initialFitFrame = requestAnimationFrame(() => {
      fit();
      if (isActive) {
        terminal.focus();
      }
    });

    const initialFitTimer = window.setTimeout(() => {
      fit();
      if (isActive) {
        terminal.focus();
      }
    }, 50);

    // Capture title changes
    if (onTitleChange) {
      terminal.onTitleChange(onTitleChange);
    }

    // Agent status detection state
    let lastOutputTime = 0;
    let recentText = '';
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let detectedAccentColor: string | null = null;
    let agentExited = false;
    const setAgentStatus = useWorkspaceStore.getState().setAgentStatus;
    const setAgentAccentColor = useWorkspaceStore.getState().setAgentAccentColor;
    const setAgentExited = useWorkspaceStore.getState().setAgentExited;

    // Initial-input injection: once the agent stops producing output for a beat
    // (or a hard cap elapses), paste the pending prompt and submit it.
    let sentInitial = false;
    let initialIdleTimer: ReturnType<typeof setTimeout> | undefined;
    let initialCapTimer: ReturnType<typeof setTimeout> | undefined;

    function clearInitialTimers() {
      clearTimeout(initialIdleTimer);
      clearTimeout(initialCapTimer);
    }

    function sendInitial() {
      if (sentInitial || !initial) return;
      sentInitial = true;
      clearInitialTimers();
      const payload = `${PASTE_START}${initial}${PASTE_END}\r`;
      invoke('pty_write', {
        id: paneId,
        data: Array.from(new TextEncoder().encode(payload)),
      }).catch(console.error);
      pendingPaneInput.delete(paneId);
    }

    function noteOutputForInitial() {
      if (sentInitial || !initial) return;
      if (initialCapTimer === undefined) {
        initialCapTimer = setTimeout(sendInitial, INITIAL_INPUT_CAP_MS);
      }
      clearTimeout(initialIdleTimer);
      initialIdleTimer = setTimeout(sendInitial, INITIAL_INPUT_IDLE_MS);
    }

    // Backend emits this OSC marker once the agent command exits and the pane
    // drops to a plain shell. Swallow it (return true) and re-label the pane.
    const oscDisposable = terminal.parser.registerOscHandler(AGENT_EXIT_OSC, () => {
      if (kind === 'Agent') {
        agentExited = true;
        clearTimeout(idleTimer);
        setAgentExited(paneId);
      }
      return true;
    });

    function detectAgentStatus(text: string) {
      if (kind !== 'Agent' || agentExited) return;

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

    // Listen for PTY output BEFORE spawning to avoid losing early output
    let unlisten: (() => void) | undefined;
    listen<PtyOutputPayload>(`pty-output-${paneId}`, (event) => {
      const bytes = base64ToBytes(event.payload.data);
      terminal.write(bytes);
      // Drive the initial-input timing off real output so we type only once the
      // agent's TUI has rendered and gone quiet.
      if (initial) {
        noteOutputForInitial();
      }
      // Decode for agent status detection
      if (kind === 'Agent') {
        const decoder = new TextDecoder('utf-8', { fatal: false });
        detectAgentStatus(decoder.decode(bytes));
      }
    }).then((fn) => {
      if (disposed) {
        fn();
        return;
      }

      unlisten = fn;

      // Spawn PTY only after listener is registered
      const rows = terminal.rows;
      const cols = terminal.cols;
      invoke('pty_spawn', {
        id: paneId,
        kind,
        cwd,
        command: command ?? null,
        tmuxSession: tmuxSession ?? null,
        agent: agent ?? null,
      }).then(() => {
        invoke('pty_resize', { id: paneId, rows, cols }).catch(console.error);
      }).catch((err) => {
        terminal.writeln(`\r\nFailed to spawn: ${err}`);
      });
    }).catch((err) => {
      terminal.writeln(`\r\nFailed to register output listener: ${err}`);
    });

    // Handle resize
    const resizeDisposable = terminal.onResize(({ rows, cols }) => {
      invoke('pty_resize', { id: paneId, rows, cols }).catch(console.error);
    });

    // ResizeObserver for container
    const observer = new ResizeObserver(() => {
      fit();
    });
    observer.observe(termRef.current);

    return () => {
      disposed = true;
      spawnedRef.current = false;
      cancelAnimationFrame(initialFitFrame);
      window.clearTimeout(initialFitTimer);
      clearTimeout(idleTimer);
      clearInitialTimers();
      observer.disconnect();
      resizeDisposable.dispose();
      oscDisposable.dispose();
      selectionDisposable.dispose();
      dataDisposable.dispose();
      binaryDisposable.dispose();
      unlisten?.();
      webglAddon?.dispose();
      terminal.dispose();
      invoke('pty_kill', { id: paneId }).catch(console.error);
    };
  }, [paneId, kind, cwd, command, tmuxSession, agent, onTitleChange, fit]);

  useEffect(() => {
    if (!isActive || !terminalRef.current) {
      return;
    }

    const frameId = requestAnimationFrame(() => {
      focus();
    });

    return () => cancelAnimationFrame(frameId);
  }, [isActive, focus]);

  return { termRef, fit, focus };
}
