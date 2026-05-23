import { useEffect, useMemo, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjectsStore } from '../../stores/projects';
import { useWorkspaceStore } from '../../stores/workspace';

interface ProjectScriptsProps {
  projectPath: string;
  projectName: string;
}

function packageDir(pkgPath: string): string {
  return pkgPath.replace(/\/package\.json$/, '');
}

function relativeDir(pkgPath: string, projectPath: string): string {
  const dir = packageDir(pkgPath);
  if (dir === projectPath) return 'package.json';
  if (dir.startsWith(projectPath + '/')) return dir.slice(projectPath.length + 1) + '/package.json';
  return pkgPath;
}

export function ProjectScripts({ projectPath, projectName }: ProjectScriptsProps) {
  const projectScripts = useProjectsStore((s) => s.projectScripts);
  const scriptData = useProjectsStore((s) => s.scriptData);
  const loadScriptData = useProjectsStore((s) => s.loadScriptData);
  const addProjectScript = useProjectsStore((s) => s.addProjectScript);
  const removeProjectScript = useProjectsStore((s) => s.removeProjectScript);

  const addTab = useWorkspaceStore((s) => s.addTab);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string>('');

  const pkgPaths = useMemo(
    () => projectScripts.get(projectPath) ?? [],
    [projectScripts, projectPath],
  );

  useEffect(() => {
    for (const path of pkgPaths) {
      if (!scriptData.has(path)) {
        loadScriptData(path).catch((e) => console.error('Failed to load scripts:', e));
      }
    }
  }, [pkgPaths, scriptData, loadScriptData]);

  const handlePickPackageJson = async () => {
    setError('');
    const selected = await open({
      title: 'Select package.json',
      defaultPath: projectPath,
      multiple: false,
      filters: [{ name: 'package.json', extensions: ['json'] }],
    });
    if (!selected) return;
    const path = selected as string;
    if (!path.endsWith('/package.json') && !path.endsWith('\\package.json')) {
      setError('File must be named package.json');
      return;
    }
    await addProjectScript(projectPath, path);
  };

  const handleToggleCollapse = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleRunScript = (pkgPath: string, scriptName: string) => {
    const cwd = packageDir(pkgPath);
    const command = `npm run ${scriptName}`;
    addTab(projectPath, projectName, {
      kind: 'Custom',
      command,
      cwd,
      label: `${projectName}: ${scriptName}`,
    });
  };

  return (
    <div className="project-section">
      <div className="project-section-header">
        <span className="project-section-label">Scripts</span>
        <button className="project-section-action" onClick={handlePickPackageJson}>
          + new script
        </button>
      </div>
      {error && <div className="project-section-error">{error}</div>}
      {pkgPaths.length === 0 && (
        <div className="project-section-empty">No scripts. Pick a package.json to begin.</div>
      )}
      {pkgPaths.map((pkgPath) => {
        const isCollapsed = collapsed.has(pkgPath);
        const scripts = scriptData.get(pkgPath);
        const scriptNames = scripts ? Object.keys(scripts).sort() : [];
        return (
          <div key={pkgPath} className="pkg-json-entry">
            <div className="pkg-json-row">
              <button
                className="pkg-json-toggle"
                onClick={() => handleToggleCollapse(pkgPath)}
                title={isCollapsed ? 'Expand' : 'Collapse'}
              >
                {isCollapsed ? '▸' : '▾'}
              </button>
              <span className="pkg-json-path" title={pkgPath}>
                {relativeDir(pkgPath, projectPath)}
              </span>
              <button
                className="pkg-json-remove"
                onClick={() => removeProjectScript(projectPath, pkgPath)}
                title="Remove from Scripts"
              >
                ✕
              </button>
            </div>
            {!isCollapsed && (
              <div className="pkg-scripts">
                {scripts === undefined && (
                  <div className="pkg-script-empty">Loading…</div>
                )}
                {scripts !== undefined && scriptNames.length === 0 && (
                  <div className="pkg-script-empty">No scripts defined</div>
                )}
                {scriptNames.map((name) => (
                  <button
                    key={name}
                    className="pkg-script-btn"
                    onClick={() => handleRunScript(pkgPath, name)}
                    title={scripts?.[name]}
                  >
                    <span className="pkg-script-name">{name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
