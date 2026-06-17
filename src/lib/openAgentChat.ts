import { useProjectsStore } from '../stores/projects';
import { useWorkspaceStore } from '../stores/workspace';
import { goToWorkspace } from '../router';
import { pendingPaneInput } from '../components/Terminal/pendingInput';

interface OpenAgentChatArgs {
  /** Project root the new tab belongs to. */
  projectPath: string;
  /** Working directory the agent spawns in. */
  cwd: string;
  /** Tab label. */
  label: string;
  /** Initial prompt, "typed" into the agent once its TUI is ready. */
  prompt: string;
  /** Agent command to launch; defaults to the first configured agent. */
  agentCommand?: string;
}

/**
 * Open a new agent chat tab and deliver an initial prompt to it. The prompt is
 * registered in {@link pendingPaneInput} so useTerminal pastes it once the PTY
 * is ready, rather than passing it as a launch arg.
 */
export function openAgentChat({ projectPath, cwd, label, prompt, agentCommand }: OpenAgentChatArgs) {
  const command = agentCommand ?? useProjectsStore.getState().agents[0]?.command;
  useWorkspaceStore.getState().addTab(projectPath, label, {
    kind: 'Agent',
    cwd,
    agent: command || undefined,
    label,
  });
  const newPaneId = useWorkspaceStore.getState().getActiveWindow()?.activePaneId;
  if (newPaneId) pendingPaneInput.set(newPaneId, prompt);
  goToWorkspace();
}
