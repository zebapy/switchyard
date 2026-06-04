import { lazy, Suspense, type ReactNode } from 'react';
import { createHashRouter } from 'react-router';
import { RootLayout } from './routes/RootLayout';

// Routes are split into their own chunks so the initial load only pulls the
// app chrome (RootLayout) plus whichever route is shown first — the Dashboard,
// the whole Workspace pane stack (xterm/diff2html/shiki), and the Settings form
// tree no longer all ship in one eager bundle.
const Dashboard = lazy(() =>
  import('./components/Dashboard/Dashboard').then((m) => ({ default: m.Dashboard })),
);
const WorkspaceRoute = lazy(() =>
  import('./routes/WorkspaceRoute').then((m) => ({ default: m.WorkspaceRoute })),
);
const SettingsPage = lazy(() =>
  import('./components/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);

function lazyRoute(node: ReactNode): ReactNode {
  return <Suspense fallback={null}>{node}</Suspense>;
}

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
      { index: true, element: lazyRoute(<Dashboard />) },
      { path: 'workspace', element: lazyRoute(<WorkspaceRoute />) },
      { path: 'settings', element: lazyRoute(<SettingsPage />) },
      { path: 'settings/:section', element: lazyRoute(<SettingsPage />) },
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
