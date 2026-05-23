import { useCallback } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjectsStore } from '../stores/projects';

interface SettingsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsOverlay({ isOpen, onClose }: SettingsOverlayProps) {
  const scanRoot = useProjectsStore((s) => s.scanRoot);
  const setScanRoot = useProjectsStore((s) => s.setScanRoot);
  const addedProjects = useProjectsStore((s) => s.addedProjects);
  const addProjectPath = useProjectsStore((s) => s.addProjectPath);
  const removeProjectPath = useProjectsStore((s) => s.removeProjectPath);
  const useTmux = useProjectsStore((s) => s.useTmux);
  const setUseTmux = useProjectsStore((s) => s.setUseTmux);

  const handlePickScanRoot = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Default folder for new projects',
    });
    if (typeof selected === 'string') {
      await setScanRoot(selected);
    }
  }, [setScanRoot]);

  const handleAddProject = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select project folder',
    });
    if (typeof selected === 'string') {
      await addProjectPath(selected);
    }
  }, [addProjectPath]);

  if (!isOpen) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-content" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </div>

        <div className="settings-section">
          <h3>Default folder</h3>
          <p className="settings-description">
            Parent folder used when creating new projects.
          </p>
          <div className="settings-row">
            <span className="settings-value" title={scanRoot || '(not set)'}>
              {scanRoot || '(not set)'}
            </span>
            <button className="settings-button" onClick={handlePickScanRoot}>
              Change…
            </button>
          </div>
        </div>

        <div className="settings-section">
          <h3>Added projects</h3>
          <p className="settings-description">
            Folders shown in the project tree.
          </p>
          {addedProjects.length === 0 && (
            <p className="settings-empty">No projects added yet.</p>
          )}
          {addedProjects.length > 0 && (
            <ul className="settings-list">
              {addedProjects.map((path) => (
                <li key={path} className="settings-list-row">
                  <span className="settings-list-path" title={path}>
                    {path}
                  </span>
                  <button
                    className="settings-button settings-button--danger"
                    onClick={() => removeProjectPath(path)}
                    aria-label={`Remove ${path}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button className="settings-button" onClick={handleAddProject}>
            + Add folder
          </button>
        </div>

        <div className="settings-section">
          <h3>Terminal</h3>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={useTmux}
              onChange={(e) => setUseTmux(e.target.checked)}
            />
            <span>Use tmux for session persistence</span>
          </label>
          <p className="settings-description">
            Keeps terminal panes alive across app restarts when tmux is available.
          </p>
        </div>
      </div>
    </div>
  );
}
