import type { ComponentType } from 'react';
import { useUiStore } from '../stores/ui';
import { CloseIcon } from './icons';
import { DefaultFolderSettings } from './DefaultFolderSettings';
import { AddedProjectsSettings } from './AddedProjectsSettings';
import { WorktreeLocationSettings } from './WorktreeLocationSettings';
import { IssuePromptSettings } from './IssuePromptSettings';
import { LinearSettings } from './LinearSettings';
import { GithubSettings } from './GithubSettings';
import { PrTemplateSettings } from './PrTemplateSettings';
import { AgentSettings } from './AgentSettings';
import { TerminalSettings } from './TerminalSettings';
import { NotificationsSettings } from './NotificationsSettings';
import { SettingsFileSection } from './SettingsFileSection';

interface SettingsPageProps {
  onClose: () => void;
}

const SECTION_COMPONENTS: Record<string, ComponentType> = {
  'default-folder': DefaultFolderSettings,
  'added-projects': AddedProjectsSettings,
  worktrees: WorktreeLocationSettings,
  'worktree-prompt': IssuePromptSettings,
  linear: LinearSettings,
  github: GithubSettings,
  'pull-requests': PrTemplateSettings,
  agents: AgentSettings,
  terminal: TerminalSettings,
  notifications: NotificationsSettings,
  'settings-file': SettingsFileSection,
};

export function SettingsPage({ onClose }: SettingsPageProps) {
  const settingsSection = useUiStore((s) => s.settingsSection);
  const ActiveSection = SECTION_COMPONENTS[settingsSection] ?? DefaultFolderSettings;

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

      <div key={settingsSection} className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto w-full max-w-[640px]">
          <ActiveSection />
        </div>
      </div>
    </div>
  );
}
