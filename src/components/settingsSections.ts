export interface SettingsSection {
  id: string;
  label: string;
}

export interface SettingsGroup {
  id: string;
  label: string;
  sections: SettingsSection[];
}

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    id: 'projects',
    label: 'Projects',
    sections: [
      { id: 'default-folder', label: 'Default folder' },
      { id: 'added-projects', label: 'Added projects' },
    ],
  },
  {
    id: 'worktrees',
    label: 'Worktrees',
    sections: [
      { id: 'worktrees', label: 'Location' },
      { id: 'worktree-prompt', label: 'Prompt' },
    ],
  },
  {
    id: 'integrations',
    label: 'Integrations',
    sections: [
      { id: 'linear', label: 'Linear' },
      { id: 'github', label: 'GitHub' },
      { id: 'pull-requests', label: 'Pull requests' },
    ],
  },
  {
    id: 'general',
    label: 'General',
    sections: [
      { id: 'agents', label: 'Agents' },
      { id: 'terminal', label: 'Terminal' },
      { id: 'zen-mode', label: 'Zen Mode' },
      { id: 'notifications', label: 'Notifications' },
      { id: 'settings-file', label: 'Settings file' },
    ],
  },
];

export const SETTINGS_SECTIONS: SettingsSection[] = SETTINGS_GROUPS.flatMap((group) => group.sections);
