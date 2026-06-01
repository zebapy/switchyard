import type { PanelTab } from '../../stores/gitPanel';
import { RepoIcon, GitBranchIcon, PrIcon } from '../icons';

interface PanelTabsProps {
  tab: PanelTab;
  onChange: (tab: PanelTab) => void;
}

interface TabDef {
  id: PanelTab;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabDef[] = [
  { id: 'files', label: 'Files', icon: <RepoIcon size={12} /> },
  { id: 'changes', label: 'Changes', icon: <GitBranchIcon size={12} /> },
  { id: 'review', label: 'Review', icon: <PrIcon size={12} /> },
];

export function PanelTabs({ tab, onChange }: PanelTabsProps) {
  return (
    <div role="tablist" aria-label="Git panel sections" className="flex flex-none border-b border-line">
      {TABS.map((def) => {
        const active = tab === def.id;
        return (
          <button
            key={def.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(def.id)}
            className={
              'flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-2 text-[12px] transition-colors ' +
              (active
                ? 'border-ember text-ink'
                : 'border-transparent text-ink-faint hover:bg-hover hover:text-ink-dim')
            }
          >
            <span className="grid place-items-center">{def.icon}</span>
            {def.label}
          </button>
        );
      })}
    </div>
  );
}
