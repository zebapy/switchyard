import type { ReactElement, ReactNode } from 'react';
import { Tooltip as BaseTooltip } from '@base-ui-components/react/tooltip';

const popupClass =
  'z-[400] rounded-md border border-line bg-side2 px-2 py-1 font-ui text-[11px] ' +
  'leading-none text-ink shadow-[0_8px_24px_rgba(0,0,0,0.45)] outline-none ' +
  'select-none origin-[var(--transform-origin)] ' +
  'transition-[transform,opacity] data-[starting-style]:opacity-0 data-[ending-style]:opacity-0';

interface TooltipProps {
  /** Text shown in the tooltip bubble. */
  label: ReactNode;
  /** The trigger element. Receives the tooltip trigger props via `render`. */
  children: ReactElement<Record<string, unknown>>;
  /** Side to place the tooltip. Defaults to top. */
  side?: 'top' | 'right' | 'bottom' | 'left';
}

/**
 * Instant tooltip (no hover delay) built on Base UI. Use instead of the native
 * `title` attribute so the bubble appears immediately and is styled to match.
 */
export function Tooltip({ label, children, side = 'top' }: TooltipProps) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger delay={0} closeDelay={0} render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side={side} sideOffset={6} className="z-[400]">
          <BaseTooltip.Popup className={popupClass}>{label}</BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
