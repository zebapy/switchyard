import { useCallback } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjectsStore } from '../stores/projects';

const h3Class = 'mb-2.5 text-xs font-semibold text-ink';
const descClass = 'mb-2.5 text-xs text-ink-faint';
const rowClass = 'flex items-center gap-3 rounded-[9px] border border-line bg-app px-2.5 py-2';
const valClass = 'flex-1 truncate font-mono text-xs text-ink-dim';
const btnClass = 'rounded-lg border border-line bg-app px-[11px] py-1.5 text-xs text-ink-dim transition hover:border-ember-edge hover:bg-ember-tint hover:text-ember';
const removeBtnClass = 'rounded-lg border border-line bg-app px-[11px] py-1.5 text-xs text-ink-dim transition hover:border-[rgba(240,117,138,0.4)] hover:bg-[rgba(240,117,138,0.08)] hover:text-del';

export function AddedProjectsSettings() {
  const addedProjects = useProjectsStore((s) => s.addedProjects);
  const addProjectPath = useProjectsStore((s) => s.addProjectPath);
  const removeProjectPath = useProjectsStore((s) => s.removeProjectPath);

  const handleAddProject = useCallback(async () => {
    const sel = await open({ directory: true, multiple: false, title: 'Select project folder' });
    if (typeof sel === 'string') await addProjectPath(sel);
  }, [addProjectPath]);

  return (
    <div>
      <h3 className={h3Class}>Added projects</h3>
      <p className={descClass}>Folders shown in the project tree.</p>
      {addedProjects.length === 0 && <p className="mb-2.5 text-xs italic text-ink-ghost">No projects added yet.</p>}
      {addedProjects.length > 0 && (
        <ul className="mb-2.5 flex flex-col gap-1.5">
          {addedProjects.map((path) => (
            <li key={path} className={rowClass}>
              <span className={valClass} title={path}>{path}</span>
              <button className={removeBtnClass} onClick={() => removeProjectPath(path)} aria-label={`Remove ${path}`}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <button className={btnClass} onClick={handleAddProject}>+ Add folder</button>
    </div>
  );
}
