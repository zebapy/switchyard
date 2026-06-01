import { CloseIcon } from './icons';

interface HelpOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

const KEYBINDINGS = [
  { section: 'Global', bindings: [
    { key: 'Ctrl+Space / ⌘K', desc: 'Command palette' },
    { key: '⌘/ / F1', desc: 'Keyboard shortcuts' },
    { key: '⌘,', desc: 'Settings' },
    { key: '⌘⇧E', desc: 'Focus project tree' },
    { key: '⌘B', desc: 'Toggle sidebar' },
    { key: 'Ctrl+Q', desc: 'Quit' },
  ]},
  { section: 'Tree', bindings: [
    { key: 'j / ↓', desc: 'Navigate down' },
    { key: 'k / ↑', desc: 'Navigate up' },
    { key: 'Enter / Space', desc: 'Expand / collapse' },
    { key: '/', desc: 'Filter' },
    { key: '?', desc: 'Help' },
    { key: 'q / Esc', desc: 'Blur / clear filter' },
  ]},
  { section: 'Windows', bindings: [
    { key: 'Ctrl+`', desc: 'Next window' },
    { key: 'Ctrl+Shift+`', desc: 'Previous window' },
  ]},
  { section: 'Sessions', bindings: [
    { key: '⌘T', desc: 'New terminal' },
    { key: '⌘⇧T', desc: 'New chat' },
    { key: '⌘↵', desc: 'New agent' },
    { key: 'Ctrl+Tab', desc: 'Next session' },
    { key: 'Ctrl+Shift+Tab', desc: 'Previous session' },
    { key: '⌘1…8', desc: 'Switch session by number' },
    { key: '⌘9', desc: 'Last session' },
    { key: '⌘⇧W', desc: 'Close session' },
  ]},
  { section: 'Pane', bindings: [
    { key: '⌘D', desc: 'Split right' },
    { key: '⌘⇧D', desc: 'Split down' },
    { key: '⌘] / ⌘[', desc: 'Next / previous pane' },
    { key: '⌘W', desc: 'Close pane' },
    { key: '⌘⇧X', desc: 'Detach pane (keep tmux)' },
  ]},
];

export function HelpOverlay({ isOpen, onClose }: HelpOverlayProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[rgba(6,7,9,0.6)] backdrop-blur-[3px]"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-[540px] overflow-y-auto rounded-2xl border border-line bg-side p-6 shadow-[0_30px_80px_-22px_rgba(0,0,0,0.85)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">Keyboard shortcuts</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid size-7 place-items-center rounded-md text-ink-faint hover:bg-hover hover:text-ink"
          >
            <CloseIcon size={16} />
          </button>
        </div>
        {KEYBINDINGS.map((section) => (
          <div key={section.section} className="mb-[18px]">
            <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-ghost">{section.section}</h3>
            <div className="flex flex-col gap-1.5">
              {section.bindings.map((b) => (
                <div key={b.key} className="flex items-center gap-3 text-[13px] text-ink">
                  <kbd className="min-w-[110px] rounded-md border border-line bg-app px-1.5 py-0.5 text-center font-mono text-xs text-ember">{b.key}</kbd>
                  <span>{b.desc}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
