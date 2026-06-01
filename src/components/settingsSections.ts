export interface SettingsSection {
  id: string;
  label: string;
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: 'default-folder', label: 'Default Folder' },
  { id: 'added-projects', label: 'Added Projects' },
  { id: 'worktrees', label: 'Worktrees' },
  { id: 'agents', label: 'Agents' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'linear', label: 'Linear' },
  { id: 'github', label: 'GitHub' },
  { id: 'pull-requests', label: 'Pull requests' },
  { id: 'settings-file', label: 'Settings file' },
];
