import { useEffect, useMemo } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { SettingsNav } from '../components/Sidebar/SettingsNav';
import { SettingsPage } from '../components/SettingsPage';
import { useZenStore } from './zenStore';

/**
 * The standard Settings surfaces (nav + section pages) reuse react-router for
 * section routing and back navigation, but Zen mounts instead of the router.
 * Rather than fork those components, host them inside a private in-memory router
 * so ⌘, opens Settings without leaving Zen.
 */
function SettingsShell() {
  return (
    <div className="flex h-full w-full">
      <aside className="flex w-[260px] shrink-0 flex-col overflow-hidden border-r border-line bg-linear-to-b from-side2 to-side">
        <SettingsNav />
      </aside>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-canvas">
        <SettingsPage />
      </main>
    </div>
  );
}

/**
 * The router's oldest history entry. Both `SettingsNav`'s Back button and
 * `SettingsPage`'s close button `navigate(-1)`, so stepping past the first
 * Settings entry lands here and dismisses the overlay.
 */
function CloseSentinel() {
  useEffect(() => {
    useZenStore.getState().closeSettings();
  }, []);
  return null;
}

export function ZenSettings() {
  const router = useMemo(
    () =>
      createMemoryRouter(
        [
          { path: '/__close', element: <CloseSentinel /> },
          { path: '/settings', element: <SettingsShell /> },
          { path: '/settings/:section', element: <SettingsShell /> },
        ],
        { initialEntries: ['/__close', '/settings'], initialIndex: 1 },
      ),
    [],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      useZenStore.getState().closeSettings();
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-app">
      <RouterProvider router={router} />
    </div>
  );
}
