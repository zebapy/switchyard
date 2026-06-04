import { useCallback, useRef } from 'react';
import { useWorkspaceStore } from '../../stores/workspace';
import { PaneContainer } from './PaneContainer';
import type { PaneTree } from '../../types/pane';

interface SplitPaneProps {
  tree: PaneTree;
  tabId: string;
  path: number[];
}

/**
 * A single leaf. Selects ONLY its own pane and a boolean active flag, so an
 * agent-status tick (which replaces the whole `panes` Map but leaves unrelated
 * pane objects reference-stable) re-renders just the one pane that changed,
 * never the entire split tree.
 */
function LeafPane({ paneId }: { paneId: string }) {
  const paneInfo = useWorkspaceStore((s) => s.panes.get(paneId));
  const isActive = useWorkspaceStore((s) => {
    const win = s.activeWindowId ? s.windows.get(s.activeWindowId) : null;
    return win?.activePaneId === paneId;
  });
  if (!paneInfo) return null;
  return <PaneContainer paneInfo={paneInfo} isActive={isActive} />;
}

export function SplitPane({ tree, tabId, path }: SplitPaneProps) {
  const setRatio = useWorkspaceStore((s) => s.setRatio);
  const dividerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (tree.type !== 'split') return;
      e.preventDefault();

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const isHorizontal = tree.direction === 'horizontal';

      const onMouseMove = (e: MouseEvent) => {
        const pos = isHorizontal ? e.clientX - rect.left : e.clientY - rect.top;
        const total = isHorizontal ? rect.width : rect.height;
        const newRatio = pos / total;
        setRatio(tabId, path, newRatio);
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [tree, tabId, path, setRatio],
  );

  if (tree.type === 'leaf') {
    return <LeafPane paneId={tree.paneId} />;
  }

  const isHorizontal = tree.direction === 'horizontal';
  const firstSize = `${tree.ratio * 100}%`;
  const secondSize = `${(1 - tree.ratio) * 100}%`;

  return (
    <div
      ref={containerRef}
      className="split-pane"
      style={{
        display: 'flex',
        flexDirection: isHorizontal ? 'row' : 'column',
        width: '100%',
        height: '100%',
      }}
    >
      <div style={{ flexBasis: firstSize, flexShrink: 0, flexGrow: 0, overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
        <SplitPane tree={tree.children[0]} tabId={tabId} path={[...path, 0]} />
      </div>
      <div
        ref={dividerRef}
        className={
          isHorizontal
            ? 'w-px shrink-0 cursor-col-resize bg-line transition-colors hover:bg-ember-edge'
            : 'h-px shrink-0 cursor-row-resize bg-line transition-colors hover:bg-ember-edge'
        }
        onMouseDown={handleDividerMouseDown}
      />
      <div style={{ flexBasis: secondSize, flexShrink: 0, flexGrow: 0, overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
        <SplitPane tree={tree.children[1]} tabId={tabId} path={[...path, 1]} />
      </div>
    </div>
  );
}
