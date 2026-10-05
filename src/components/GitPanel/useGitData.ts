import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { CheckRun, DiffSource, FileStatus } from '../../types/gitpanel';

/** Changed files for one diff source. Reloads when path, source, or base changes.
 *  `base` is the branch a `base` diff compares against; `null` = repo default. */
export function useChangedFiles(path: string | null, source: DiffSource, base: string | null = null) {
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(() => {
    if (!path) {
      setFiles([]);
      return;
    }
    setLoading(true);
    setError('');
    invoke<FileStatus[]>('git_changed_files', { path, source, base })
      .then((result) => setFiles(result))
      .catch((e) => {
        setFiles([]);
        setError(String(e));
      })
      .finally(() => setLoading(false));
  }, [path, source, base]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { files, loading, error, reload };
}

/** Unified-diff text for the selected file. Empty when no file is selected. */
export function useFileDiff(
  path: string | null,
  file: string | null,
  source: DiffSource,
  base: string | null = null,
) {
  const [diff, setDiff] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!path || !file) {
      setDiff('');
      setError('');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    invoke<string>('git_file_diff', { path, file, source, base })
      .then((result) => {
        if (!cancelled) setDiff(result);
      })
      .catch((e) => {
        if (cancelled) return;
        setDiff('');
        setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, file, source, base]);

  return { diff, loading, error };
}

/**
 * Every file path in the repo's working tree (tracked + untracked, gitignore
 * respected). Powers the Files tab. Only fetches while `enabled` is true so the
 * walk is skipped when the Files tab isn't showing.
 */
export function useRepoTree(path: string | null, enabled: boolean) {
  const [paths, setPaths] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(() => {
    if (!path || !enabled) {
      setPaths([]);
      return;
    }
    setLoading(true);
    setError('');
    invoke<string[]>('git_list_tree', { path })
      .then((result) => setPaths(result))
      .catch((e) => {
        setPaths([]);
        setError(String(e));
      })
      .finally(() => setLoading(false));
  }, [path, enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { paths, loading, error, reload };
}

/** UTF-8 contents of a single repo file, for the in-app File viewer pane. */
export function useFileContent(path: string | null, file: string | null) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!path || !file) {
      setContent('');
      setError('');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    invoke<string>('read_file_text', { path, file })
      .then((result) => {
        if (!cancelled) setContent(result);
      })
      .catch((e) => {
        if (cancelled) return;
        setContent('');
        setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, file]);

  return { content, loading, error };
}

/** The repo's default branch name (e.g. "main"), for the "vs base" label. */
export function useDefaultBranch(path: string | null) {
  const [branch, setBranch] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setBranch(null);
      return;
    }
    let cancelled = false;
    invoke<string | null>('git_default_branch', { path })
      .then((result) => {
        if (!cancelled) setBranch(result);
      })
      .catch(() => {
        if (!cancelled) setBranch(null);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return branch;
}

function anyRunning(checks: CheckRun[]): boolean {
  return checks.some((check) => check.status !== 'completed');
}

/**
 * PR check-runs for the current branch. Polls every 10s while any check is
 * still running, then stops once they all settle.
 */
export function useChecks(path: string | null) {
  const [checks, setChecks] = useState<CheckRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchChecks = useCallback(() => {
    if (!path) return Promise.resolve();
    return invoke<CheckRun[]>('github_pr_checks', { path })
      .then((result) => setChecks(result))
      .catch((e) => {
        setChecks([]);
        setError(String(e));
      });
  }, [path]);

  const reload = useCallback(() => {
    if (!path) {
      setChecks([]);
      return;
    }
    setLoading(true);
    setError('');
    fetchChecks().finally(() => setLoading(false));
  }, [path, fetchChecks]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!path || !anyRunning(checks)) return;
    const id = window.setTimeout(() => {
      fetchChecks();
    }, 10000);
    return () => window.clearTimeout(id);
  }, [path, checks, fetchChecks]);

  return { checks, loading, error, reload };
}
