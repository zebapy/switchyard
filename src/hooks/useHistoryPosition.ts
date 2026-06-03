import { useEffect, useState } from 'react';
import { router } from '../router';

/**
 * react-router stamps each history entry with a numeric `idx` in
 * `window.history.state`. Tracking the current idx plus the highest idx seen
 * lets us derive whether back/forward navigation is possible — react-router
 * itself does not expose `canGoBack` / `canGoForward`.
 */
let maxIdx = 0;

function readIdx(): number {
  return (window.history.state?.idx as number | undefined) ?? 0;
}

interface HistoryPosition {
  canGoBack: boolean;
  canGoForward: boolean;
}

export function useHistoryPosition(): HistoryPosition {
  const [{ idx, max }, setPosition] = useState(() => {
    const idx = readIdx();
    maxIdx = Math.max(maxIdx, idx);
    return { idx, max: maxIdx };
  });

  useEffect(() => {
    const update = () => {
      const idx = readIdx();
      // A PUSH truncates any forward entries, so the new idx becomes the ceiling.
      if (router.state.historyAction === 'PUSH') maxIdx = idx;
      else maxIdx = Math.max(maxIdx, idx);
      setPosition({ idx, max: maxIdx });
    };
    update();
    return router.subscribe(update);
  }, []);

  return { canGoBack: idx > 0, canGoForward: idx < max };
}
