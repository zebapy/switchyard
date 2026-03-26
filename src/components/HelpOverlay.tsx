interface HelpOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

const KEYBINDINGS = [
  { section: 'Global', bindings: [
    { key: 'Ctrl+Space', desc: 'Command Palette' },
    { key: 'Ctrl+E', desc: 'Focus Project Tree' },
    { key: 'Ctrl+Q', desc: 'Quit' },
    { key: 'Ctrl+A', desc: 'New Agent' },
    { key: 'Ctrl+T', desc: 'New Terminal' },
  ]},
  { section: 'Tree', bindings: [
    { key: 'j / ↓', desc: 'Navigate Down' },
    { key: 'k / ↑', desc: 'Navigate Up' },
    { key: 'Enter / Space', desc: 'Toggle / Select' },
    { key: 'p', desc: 'Pin / Unpin' },
    { key: 'd', desc: 'Remove Worktree' },
    { key: '/', desc: 'Filter' },
    { key: '?', desc: 'Help' },
    { key: 'q / Esc', desc: 'Quit / Clear Filter' },
  ]},
  { section: 'Pane', bindings: [
    { key: 'Ctrl+N', desc: 'Next Pane' },
    { key: 'Ctrl+P', desc: 'Previous Pane' },
    { key: 'Ctrl+X', desc: 'Close Pane' },
  ]},
];

export function HelpOverlay({ isOpen, onClose }: HelpOverlayProps) {
  if (!isOpen) return null;

  return (
    <div className="help-overlay" onClick={onClose}>
      <div className="help-content" onClick={(e) => e.stopPropagation()}>
        <div className="help-header">
          <h2>Keyboard Shortcuts</h2>
          <button className="help-close" onClick={onClose}>✕</button>
        </div>
        {KEYBINDINGS.map((section) => (
          <div key={section.section} className="help-section">
            <h3>{section.section}</h3>
            <div className="help-bindings">
              {section.bindings.map((b) => (
                <div key={b.key} className="help-binding">
                  <kbd>{b.key}</kbd>
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
