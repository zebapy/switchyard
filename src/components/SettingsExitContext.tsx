import { createContext, useContext, type ReactNode } from 'react';

/**
 * How the surrounding shell leaves Settings. The standard app returns to the
 * route it was on before Settings opened; Zen dismisses its Settings overlay.
 * Leaving is deliberately not history back — switching sections pushes history
 * entries, so `navigate(-1)` would step between sections instead of exiting.
 */
const SettingsExitContext = createContext<(() => void) | null>(null);

export function SettingsExitProvider({
  exit,
  children,
}: {
  exit: () => void;
  children: ReactNode;
}) {
  return <SettingsExitContext.Provider value={exit}>{children}</SettingsExitContext.Provider>;
}

export function useExitSettings() {
  const exit = useContext(SettingsExitContext);
  if (!exit) throw new Error('useExitSettings must be used inside a SettingsExitProvider');
  return exit;
}
