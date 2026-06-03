import { createHashRouter } from 'react-router';
import { RootLayout } from './routes/RootLayout';
import { WorkspaceRoute } from './routes/WorkspaceRoute';
import { Dashboard } from './components/Dashboard/Dashboard';
import { SettingsPage } from './components/SettingsPage';

/**
 * Hash history is used because the app is a Tauri webview with no server: hash
 * routing survives reloads and the asset protocol without 404s, and keeps the
 * active route visible/debuggable in the URL.
 */
export const router = createHashRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'workspace', element: <WorkspaceRoute /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'settings/:section', element: <SettingsPage /> },
    ],
  },
]);

/**
 * Navigation helpers usable from anywhere — React components, Zustand stores,
 * keybinding module code, and Tauri event listeners — without threading
 * `useNavigate` through every caller. They drive the same router instance.
 */
export function goToDashboard() {
  router.navigate('/');
}

export function goToWorkspace() {
  router.navigate('/workspace');
}

export function goToSettings(section?: string) {
  router.navigate(section ? `/settings/${section}` : '/settings');
}
