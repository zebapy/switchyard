import { useCallback, useRef } from 'react';
import { useWorkspaceStore } from '../../stores/workspace';
import { PaneContainer } from './PaneContainer';
import type { PaneTree } from '../../types/pane';

interface SplitPaneProps {
  tree: PaneTree;
  tabId: string;
  path: number[];
}

export function SplitPane({ tree, tabId, path }: SplitPaneProps) {
  const panes = useWorkspaceStore((s) => s.panes);
  const activeWindowId = useWorkspaceStore((s) => s.activeWindowId);
  const windows = useWorkspaceStore((s) => s.windows);
  const activePaneId = activeWindowId ? windows.get(activeWindowId)?.activePaneId ?? null : null;
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
    const paneInfo = panes.get(tree.paneId);
    if (!paneInfo) return null;
    return (
      <PaneContainer
        paneInfo={paneInfo}
        isActive={tree.paneId === activePaneId}
      />
    );
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
        className={`split-divider split-divider--${isHorizontal ? 'horizontal' : 'vertical'}`}
        onMouseDown={handleDividerMouseDown}
      />
      <div style={{ flexBasis: secondSize, flexShrink: 0, flexGrow: 0, overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
        <SplitPane tree={tree.children[1]} tabId={tabId} path={[...path, 1]} />
      </div>
    </div>
  );
}
