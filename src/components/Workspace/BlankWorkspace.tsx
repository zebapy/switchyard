import { useMemo, useState } from 'react';
import { useProjectsStore } from '../../stores/projects';
import { useWorkspaceStore } from '../../stores/workspace';
import type { PaneKind } from '../../types/pane';
import type { ProjectInfo } from '../../types/project';

interface QuickAction {
  kind: PaneKind;
  label: string;
}

const ACTIONS: QuickAction[] = [
  { kind: 'Agent', label: '+ Agent' },
  { kind: 'Shell', label: '+ Terminal' },
  { kind: 'Lazygit', label: '+ Lazygit' },
];

export function BlankWorkspace() {
  const projects = useProjectsStore((s) => s.projects);
  const addTab = useWorkspaceStore((s) => s.addTab);

  const [pickerOpen, setPickerOpen] = useState<QuickAction | null>(null);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const top = projects.filter((p) => !p.worktree_parent);
    if (!query) return top;
    const q = query.toLowerCase();
    return top.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, query]);

  const handleSpawn = (project: ProjectInfo) => {
    if (!pickerOpen) return;
    addTab(project.path, project.name, { kind: pickerOpen.kind });
    setPickerOpen(null);
    setQuery('');
  };

  return (
    <div className="blank-workspace">
      <div className="blank-workspace-inner">
        <h2 className="blank-workspace-title">No project open</h2>
        <p className="blank-workspace-hint">
          Pick a project from the sidebar, or start something below.
        </p>
        <div className="blank-workspace-actions">
          {ACTIONS.map((action) => (
            <button
              key={action.kind}
              className="blank-workspace-action"
              onClick={() => setPickerOpen(action)}
            >
              {action.label}
            </button>
          ))}
        </div>

        {pickerOpen && (
          <div className="blank-workspace-picker" onClick={() => setPickerOpen(null)}>
            <div className="blank-workspace-picker-panel" onClick={(e) => e.stopPropagation()}>
              <div className="blank-workspace-picker-header">
                Pick a project for <strong>{pickerOpen.label}</strong>
              </div>
              <input
                autoFocus
                className="blank-workspace-picker-input"
                placeholder="Filter projects…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setPickerOpen(null);
                  if (e.key === 'Enter' && filtered[0]) handleSpawn(filtered[0]);
                }}
              />
              <div className="blank-workspace-picker-list">
                {filtered.map((p) => (
                  <button
                    key={p.path}
                    className="blank-workspace-picker-item"
                    onClick={() => handleSpawn(p)}
                  >
                    <span className="blank-workspace-picker-name">{p.name}</span>
                    <span className="blank-workspace-picker-path">{p.path}</span>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <div className="blank-workspace-picker-empty">No matching projects.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
