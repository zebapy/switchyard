import { useWorkspaceStore } from '../stores/workspace';
import { goToWorkspace } from '../router';

interface CloudSessionTarget {
  projectPath: string;
  projectName: string;
}

interface StartCloudSessionArgs extends CloudSessionTarget {
  task: string;
}

// Cloud sessions are driven through the `claude` CLI — there is no public API.
// Running them as Agent panes lets the Rust side shell-quote the task and drop
// back to a shell on exit, so the printed claude.ai/code URL stays visible.

/** `claude --cloud "<task>"`: start a cloud session on the project's GitHub remote. */
export function startCloudSession({ projectPath, projectName, task }: StartCloudSessionArgs) {
  useWorkspaceStore.getState().addTab(projectPath, projectName, {
    kind: 'Agent',
    cwd: projectPath,
    agent: 'claude --cloud',
    command: task,
    label: `Cloud: ${projectName}`,
  });
  goToWorkspace();
}

/** `claude --teleport`: pick a cloud session and pull its branch + conversation locally. */
export function teleportCloudSession({ projectPath, projectName }: CloudSessionTarget) {
  useWorkspaceStore.getState().addTab(projectPath, projectName, {
    kind: 'Agent',
    cwd: projectPath,
    agent: 'claude --teleport',
    label: `Teleport: ${projectName}`,
  });
  goToWorkspace();
}
