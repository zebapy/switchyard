import { useState } from 'react';

interface RenameFieldProps {
  initialValue: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
  className?: string;
}

/** Inline text field for renaming a sidebar pane. Enter commits, Escape cancels. */
export function RenameField({ initialValue, onCommit, onCancel, className }: RenameFieldProps) {
  const [value, setValue] = useState(initialValue);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onCommit(value);
  };

  return (
    <form onSubmit={handleSubmit} className="min-w-0 flex-1">
      <input
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => onCommit(value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
        }}
        onClick={(event) => event.stopPropagation()}
        className={
          'w-full rounded-[5px] border border-line bg-app px-1 py-0 text-[13px] text-ink outline-none focus:border-ember-edge ' +
          (className ?? '')
        }
      />
    </form>
  );
}
