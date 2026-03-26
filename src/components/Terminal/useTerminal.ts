import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { PaneKind } from '../../types/pane';

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

    // Listen for PTY output
    let unlisten: (() => void) | undefined;
    listen<PtyOutputPayload>(`pty-output-${paneId}`, (event) => {
      const bytes = Uint8Array.from(atob(event.payload.data), (c) => c.charCodeAt(0));
      terminal.write(bytes);
    }).then((fn) => {
      unlisten = fn;
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
      observer.disconnect();
      resizeDisposable.dispose();
      dataDisposable.dispose();
      binaryDisposable.dispose();
      unlisten?.();
      terminal.dispose();
      invoke('pty_kill', { id: paneId }).catch(console.error);
    };
  }, [paneId, kind, cwd, command, onTitleChange]);

  return { termRef, fit };
}
