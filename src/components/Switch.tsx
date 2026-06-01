import { Switch as BaseSwitch } from '@base-ui-components/react/switch';

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  ariaLabel: string;
}

export function Switch({ checked, onCheckedChange, ariaLabel }: SwitchProps) {
  return (
    <BaseSwitch.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={ariaLabel}
      className="relative inline-flex h-[22px] w-[38px] shrink-0 cursor-pointer items-center rounded-full border border-line bg-app px-0.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ember/50 data-[checked]:border-ember data-[checked]:bg-ember"
    >
      <BaseSwitch.Thumb className="size-4 rounded-full bg-ink-faint shadow-sm transition-transform data-[checked]:translate-x-4 data-[checked]:bg-[#1a1206]" />
    </BaseSwitch.Root>
  );
}
