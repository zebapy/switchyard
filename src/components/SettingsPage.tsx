import { useCallback, useEffect, useRef } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjectsStore } from '../stores/projects';
import { useUiStore } from '../stores/ui';
import { CloseIcon } from './icons';
import { AgentSettings } from './AgentSettings';
import { LinearSettings } from './LinearSettings';
import { GithubSettings } from './GithubSettings';
import { PrTemplateSettings } from './PrTemplateSettings';
import { SettingsFileSection } from './SettingsFileSection';
import { Switch } from './Switch';
import { SETTINGS_SECTIONS } from './settingsSections';

interface SettingsPageProps {
  onClose: () => void;
}

const sectionClass = 'mb-[18px] border-b border-line pb-4 last:mb-0 last:border-b-0 last:pb-0';
const h3Class = 'mb-2.5 text-xs font-semibold text-ink';
const descClass = 'mb-2.5 text-xs text-ink-faint';
const rowClass = 'flex items-center gap-3 rounded-[9px] border border-line bg-app px-2.5 py-2';
const valClass = 'flex-1 truncate font-mono text-xs text-ink-dim';
const btnClass = 'rounded-lg border border-line bg-app px-[11px] py-1.5 text-xs text-ink-dim transition hover:border-ember-edge hover:bg-ember-tint hover:text-ember';
const wtOptionClass = 'flex cursor-pointer items-start gap-2.5 rounded-[9px] border border-line bg-app px-2.5 py-2 transition hover:border-ember-edge';
const wtOptionSelectedClass = 'flex cursor-pointer items-start gap-2.5 rounded-[9px] border border-ember-edge bg-ember-tint px-2.5 py-2 transition';

export function SettingsPage({ onClose }: SettingsPageProps) {
  const scanRoot = useProjectsStore((s) => s.scanRoot);
  const setScanRoot = useProjectsStore((s) => s.setScanRoot);
  const addedProjects = useProjectsStore((s) => s.addedProjects);
  const addProjectPath = useProjectsStore((s) => s.addProjectPath);
  const removeProjectPath = useProjectsStore((s) => s.removeProjectPath);
  const useTmux = useProjectsStore((s) => s.useTmux);
  const setUseTmux = useProjectsStore((s) => s.setUseTmux);
  const desktopNotifications = useProjectsStore((s) => s.desktopNotifications);
  const setDesktopNotifications = useProjectsStore((s) => s.setDesktopNotifications);
  const worktreeLocation = useProjectsStore((s) => s.worktreeLocation);
  const setWorktreeLocation = useProjectsStore((s) => s.setWorktreeLocation);

  const setSettingsSection = useUiStore((s) => s.setSettingsSection);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setSettingsSection(visible[0].target.id);
      },
      { root, rootMargin: '0px 0px -70% 0px', threshold: 0 },
    );
    for (const section of SETTINGS_SECTIONS) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [setSettingsSection]);

  const handlePickScanRoot = useCallback(async () => {
    const sel = await open({ directory: true, multiple: false, title: 'Default folder for new projects' });
    if (typeof sel === 'string') await setScanRoot(sel);
  }, [setScanRoot]);

  const handleAddProject = useCallback(async () => {
    const sel = await open({ directory: true, multiple: false, title: 'Select project folder' });
    if (typeof sel === 'string') await addProjectPath(sel);
  }, [addProjectPath]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="flex shrink-0 items-center justify-between border-b border-line px-6 py-4">
        <h2 className="text-base font-bold text-ink">Settings</h2>
        <button
          onClick={onClose}
          aria-label="Close settings"
          className="grid size-7 place-items-center rounded-md text-ink-faint hover:bg-hover hover:text-ink"
        >
          <CloseIcon size={16} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="mx-auto w-full max-w-[640px]">
            <div id="default-folder" className={sectionClass}>
              <h3 className={h3Class}>Default Folder</h3>
              <p className={descClass}>Parent folder used when creating new projects.</p>
              <div className={rowClass}>
                <span className={valClass} title={scanRoot || '(not set)'}>{scanRoot || '(not set)'}</span>
                <button className={btnClass} onClick={handlePickScanRoot}>Change…</button>
              </div>
            </div>

            <div id="added-projects" className={sectionClass}>
              <h3 className={h3Class}>Added Projects</h3>
              <p className={descClass}>Folders shown in the project tree.</p>
              {addedProjects.length === 0 && <p className="mb-2.5 text-xs italic text-ink-ghost">No projects added yet.</p>}
              {addedProjects.length > 0 && (
                <ul className="mb-2.5 flex flex-col gap-1.5">
                  {addedProjects.map((path) => (
                    <li key={path} className={rowClass}>
                      <span className={valClass} title={path}>{path}</span>
                      <button
                        className="rounded-lg border border-line bg-app px-[11px] py-1.5 text-xs text-ink-dim transition hover:border-[rgba(240,117,138,0.4)] hover:bg-[rgba(240,117,138,0.08)] hover:text-del"
                        onClick={() => removeProjectPath(path)}
                        aria-label={`Remove ${path}`}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button className={btnClass} onClick={handleAddProject}>+ Add folder</button>
            </div>

            <div id="worktrees" className={sectionClass}>
              <h3 className={h3Class}>Worktrees</h3>
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

            <div id="agents" className={sectionClass}>
              <AgentSettings />
            </div>

            <div id="terminal" className={sectionClass}>
              <h3 className={h3Class}>Terminal</h3>
              <label className="mb-1.5 flex cursor-pointer items-center gap-2 text-[13px] text-ink">
                <span className="flex-1">Use tmux for session persistence</span>
                <Switch checked={useTmux} onCheckedChange={setUseTmux} ariaLabel="Use tmux for session persistence" />
              </label>
              <p className={descClass}>Keeps terminal panes alive across app restarts when tmux is available.</p>
            </div>

            <div id="notifications" className={sectionClass}>
              <h3 className={h3Class}>Notifications</h3>
              <label className="mb-1.5 flex cursor-pointer items-center gap-2 text-[13px] text-ink">
                <span className="flex-1">Desktop notifications</span>
                <Switch checked={desktopNotifications} onCheckedChange={setDesktopNotifications} ariaLabel="Desktop notifications" />
              </label>
              <p className={descClass}>Notify when an agent needs input or finishes a turn.</p>
            </div>

            <div id="linear" className={sectionClass}>
              <LinearSettings />
            </div>

            <div id="github" className={sectionClass}>
              <GithubSettings />
            </div>

            <div id="pull-requests" className={sectionClass}>
              <PrTemplateSettings />
            </div>

            <div id="settings-file">
              <SettingsFileSection />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
