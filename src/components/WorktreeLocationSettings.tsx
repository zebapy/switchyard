import { useProjectsStore } from '../stores/projects';

const h3Class = 'mb-2.5 text-xs font-semibold text-ink';
const descClass = 'mb-2.5 text-xs text-ink-faint';
const wtOptionClass = 'flex cursor-pointer items-start gap-2.5 rounded-[9px] border border-line bg-app px-2.5 py-2 transition hover:border-guide';
const wtOptionSelectedClass = 'flex cursor-pointer items-start gap-2.5 rounded-[9px] border border-ember-edge bg-ember-tint px-2.5 py-2 transition';

export function WorktreeLocationSettings() {
  const worktreeLocation = useProjectsStore((s) => s.worktreeLocation);
  const setWorktreeLocation = useProjectsStore((s) => s.setWorktreeLocation);

  return (
    <div>
      <h3 className={h3Class}>Location</h3>
      <p className={descClass}>Where new git worktrees are created.</p>
      <div className="flex flex-col gap-1.5">
        <label className={worktreeLocation === 'project' ? wtOptionSelectedClass : wtOptionClass}>
          <input
            type="radio"
            name="worktree-location"
            className="mt-0.5 accent-ember"
            checked={worktreeLocation === 'project'}
            onChange={() => setWorktreeLocation('project')}
          />
          <span className="flex-1">
            <span className="block text-[13px] text-ink">In the project</span>
            <span className="block font-mono text-xs text-ink-faint">{'<project>/.claude/worktrees/<branch>'}</span>
          </span>
        </label>
        <label className={worktreeLocation === 'global' ? wtOptionSelectedClass : wtOptionClass}>
          <input
            type="radio"
            name="worktree-location"
            className="mt-0.5 accent-ember"
            checked={worktreeLocation === 'global'}
            onChange={() => setWorktreeLocation('global')}
          />
          <span className="flex-1">
            <span className="block text-[13px] text-ink">In a global folder</span>
            <span className="block font-mono text-xs text-ink-faint">{'~/.switchyard/<project>/<branch>'}</span>
          </span>
        </label>
      </div>
    </div>
  );
}
