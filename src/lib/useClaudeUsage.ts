import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';

export type UsageWindow = {
  used_percentage: number;
  resets_at: number | null;
};

export type ClaudeUsage = {
  session: UsageWindow | null;
  week: UsageWindow | null;
};

const POLL_MS = 30_000;

/**
 * Polls Claude Code subscription usage (5-hour session + 7-day week windows)
 * read from `~/.claude/statusline-last-input.json`. Returns null until the
 * first read resolves.
 */
export function useClaudeUsage(): ClaudeUsage | null {
  const [usage, setUsage] = useState<ClaudeUsage | null>(null);

  useEffect(() => {
    let active = true;

    const load = () => {
      invoke<ClaudeUsage>('get_claude_usage').then((next) => {
        if (active) setUsage(next);
      });
    };

    load();
    const id = setInterval(load, POLL_MS);

    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  return usage;
}
