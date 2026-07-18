import { useMemo } from 'react';
import { useZenStore } from './zenStore';
import { OPEN_IN_TARGETS, openPathIn } from '../lib/openIn';
import { ZenMenu, type ZenMenuItem } from './ZenMenu';

/** ⌘O — pick an external app to open the current Zen directory in. Anchored below
 *  the top-right "⌘O open" button, mirroring the sort menu's placement. */
export function ZenOpenIn({ dir }: { dir: string }) {
  const closeOpenIn = useZenStore((s) => s.closeOpenIn);

  const items = useMemo<ZenMenuItem[]>(
    () =>
      OPEN_IN_TARGETS.map((target) => ({
        id: target.id,
        label: target.label,
        icon: target.icon,
        onSelect: () => { openPathIn(dir, target.app); closeOpenIn(); },
      })),
    [dir, closeOpenIn],
  );

  return (
    <ZenMenu
      label="Open in…"
      anchor="top-right"
      width={420}
      items={items}
      onClose={closeOpenIn}
      emptyText="No matching apps"
    />
  );
}
