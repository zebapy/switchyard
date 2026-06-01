/**
 * Transient registry of text to "type" into an agent pane right after it spawns.
 * Keyed by paneId. Set by whoever opens the pane (e.g. the diff comment composer);
 * consumed once by useTerminal when the PTY is ready, then deleted. Module-level
 * (not React state, not persisted) so it fires exactly once and never survives a
 * reload.
 */
export const pendingPaneInput = new Map<string, string>();
