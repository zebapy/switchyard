import { useEffect, useMemo } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { SettingsNav } from '../components/Sidebar/SettingsNav';
import { SettingsPage } from '../components/SettingsPage';
import { SettingsExitProvider } from '../components/SettingsExitContext';
import { useZenStore } from './zenStore';

/**
 * The standard Settings surfaces (nav + section pages) reuse react-router for
 * section routing, but Zen mounts instead of the router. Rather than fork those
 * components, host them inside a private in-memory router so ⌘, opens Settings
 * without leaving Zen.
 */
function SettingsShell() {
  return (
    <div className="flex h-full w-full">
      <aside className="flex w-[260px] shrink-0 flex-col overflow-hidden border-r border-line bg-linear-to-b from-side2 to-side">
        {/* Zen floats the macOS traffic lights over the toolbar band, which this
            overlay covers. Reserve a draggable strip so the Back button below
            clears the lights instead of colliding with them. */}
        <div data-tauri-drag-region className="h-[38px] shrink-0" />
        <SettingsNav />
      </aside>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-canvas">
        <SettingsPage />
      </main>
    </div>
  );
}

export function ZenSettings() {
  const router = useMemo(
    () =>
      createMemoryRouter([
        { path: '/settings', element: <SettingsShell /> },
        { path: '/settings/:section', element: <SettingsShell /> },
      ], { initialEntries: ['/settings'] }),
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
      <SettingsExitProvider exit={() => useZenStore.getState().closeSettings()}>
        <RouterProvider router={router} />
      </SettingsExitProvider>
    </div>
  );
}
