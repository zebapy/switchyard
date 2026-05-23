import { useEffect, useState } from 'react';
import { homeDir } from '@tauri-apps/api/path';

let cached: string | null = null;
let inflight: Promise<string> | null = null;

function loadHomeDir(): Promise<string> {
  if (cached !== null) return Promise.resolve(cached);
  if (!inflight) {
    inflight = homeDir().then((h) => {
      cached = h.replace(/\/$/, '');
      return cached;
    });
  }
  return inflight;
}

export function useHomeDir(): string | null {
  const [home, setHome] = useState<string | null>(cached);
  useEffect(() => {
    if (cached !== null) {
      setHome(cached);
      return;
    }
    loadHomeDir().then(setHome);
  }, []);
  return home;
}

export function displayDir(path: string, home: string | null): string {
  if (home && (path === home || path.startsWith(home + '/'))) {
    return '~' + path.slice(home.length);
  }
  return path;
}
