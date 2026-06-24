interface IconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

interface SvgProps extends IconProps {
  children: React.ReactNode;
  fill?: boolean;
  viewBox?: string;
}

function Svg({ size = 14, className, strokeWidth = 1.5, children, fill = false, viewBox = '0 0 16 16' }: SvgProps) {
  if (fill) {
    return (
      <svg width={size} height={size} viewBox={viewBox} fill="currentColor" className={className}>
        {children}
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

export function ChevronIcon({ size = 11, className }: IconProps) {
  return <Svg size={size} className={className} strokeWidth={1.8}><path d="M6 4l4 4-4 4" /></Svg>;
}

export function ArrowLeftIcon({ size = 16, className }: IconProps) {
  return <Svg size={size} className={className} strokeWidth={1.8}><path d="M10 3l-5 5 5 5" /><path d="M5 8h6" /></Svg>;
}

export function ArrowRightIcon({ size = 16, className }: IconProps) {
  return <Svg size={size} className={className} strokeWidth={1.8}><path d="M6 3l5 5-5 5" /><path d="M11 8H5" /></Svg>;
}

export function GearIcon({ size = 15, className }: IconProps) {
  return (
    <Svg size={size} className={className} viewBox="0 0 24 24" strokeWidth={2}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Svg>
  );
}

export function RepoIcon({ size = 15, className }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={1.4}>
      <path d="M4 2.5h7a1 1 0 011 1v10l-3-2-3 2v-10a1 1 0 00-1-1H4z" />
      <path d="M4 2.5a1 1 0 00-1 1v9" />
    </Svg>
  );
}

export function BaseBranchIcon({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <circle cx="8" cy="8" r="2.4" />
      <path d="M8 2v3.2M8 10.4V14" />
    </Svg>
  );
}

export function WorktreeIcon({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <circle cx="5" cy="4" r="1.6" />
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="11" cy="7" r="1.6" />
      <path d="M5 5.6v4.8M5 8.4h3.2a3 3 0 003-3v-.4" />
    </Svg>
  );
}

export function TermIcon({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={1.4}>
      <rect x="2.3" y="3.3" width="11.4" height="9.4" rx="1.6" />
      <path d="M5 7l1.8 1.4L5 9.8M8.6 9.8h3" />
    </Svg>
  );
}

export function AiIcon({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} className={className} fill>
      <path d="M8 1.6l1.15 4 .1.25.25.1 4 1.15-4 1.15-.25.1-.1.25-1.15 4-1.15-4-.1-.25-.25-.1-4-1.15 4-1.15.25-.1.1-.25z" />
    </Svg>
  );
}

// ── agent brand glyphs (original line/fill marks, not official logos) ────────
export function ClaudeIcon({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} className={className} fill>
      <path d="M8 1.4l1.1 4.1 3.4-2.4-2 3.6 4 .9-4 .9 2 3.6-3.4-2.4L8 17.4l-1.1-4.7-3.4 2.4 2-3.6-4-.9 4-.9-2-3.6 3.4 2.4z" />
    </Svg>
  );
}

export function OpenAiIcon({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={1.3}>
      <path d="M8 2.2a2.3 2.3 0 00-2 1.15 2.3 2.3 0 00-1.55 3.4 2.3 2.3 0 000 3.3A2.3 2.3 0 006 13.45a2.3 2.3 0 004 0 2.3 2.3 0 001.55-3.4 2.3 2.3 0 000-3.3A2.3 2.3 0 0010 3.35 2.3 2.3 0 008 2.2z" />
      <path d="M8 5.4v5.2M5.6 6.7l4.8 2.6M10.4 6.7L5.6 9.3" />
    </Svg>
  );
}

export function GeminiIcon({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} className={className} fill>
      <path d="M8 1.5c.3 3.4 3.1 6.2 6.5 6.5-3.4.3-6.2 3.1-6.5 6.5-.3-3.4-3.1-6.2-6.5-6.5C4.9 7.7 7.7 4.9 8 1.5z" />
    </Svg>
  );
}

export function CursorIcon({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={1.4}>
      <path d="M3.2 2.6l9.4 4.7-4 1.2-1.2 4z" />
    </Svg>
  );
}

export function CopilotIcon({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={1.4}>
      <path d="M2.5 9.5c0-2 1.4-3 2.6-3 .9 0 1.4.4 2.9.4s2-.4 2.9-.4c1.2 0 2.6 1 2.6 3v1.2c0 1.5-2.3 2.6-5.5 2.6S2.5 12.2 2.5 10.7z" />
      <path d="M5.5 6.5C5.8 4.4 6.6 3.5 8 3.5s2.2.9 2.5 3" />
      <circle cx="6.2" cy="9.6" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="9.8" cy="9.6" r="0.7" fill="currentColor" stroke="none" />
    </Svg>
  );
}

interface AgentGlyphProps extends IconProps {
  name?: string;
  command?: string;
}

/** Pick a brand glyph for a configured agent by matching its name/command;
 *  falls back to the generic AI spark for unknown agents. */
export function AgentGlyph({ name = '', command = '', size, className }: AgentGlyphProps) {
  const key = `${name} ${command}`.toLowerCase();
  if (key.includes('claude')) return <ClaudeIcon size={size} className={className} />;
  if (key.includes('codex') || key.includes('openai') || key.includes('gpt') || key.includes('chatgpt'))
    return <OpenAiIcon size={size} className={className} />;
  if (key.includes('gemini')) return <GeminiIcon size={size} className={className} />;
  if (key.includes('cursor')) return <CursorIcon size={size} className={className} />;
  if (key.includes('copilot')) return <CopilotIcon size={size} className={className} />;
  return <AiIcon size={size} className={className} />;
}

// ── git hosting provider marks (official single-colour logos, inherit currentColor) ─
export function GitHubIcon({ size = 15, className }: IconProps) {
  return (
    <Svg size={size} className={className} fill>
      <path d="M8 .2a8 8 0 00-2.53 15.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 014 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8 8 0 008 .2z" />
    </Svg>
  );
}

export function GitLabIcon({ size = 15, className }: IconProps) {
  return (
    <Svg size={size} className={className} fill viewBox="0 0 24 24">
      <path d="M23.6 9.59l-.03-.09L20.3.98a.85.85 0 00-.34-.4.87.87 0 00-1 .05.87.87 0 00-.29.44l-2.2 6.75H7.54L5.33 1.07a.86.86 0 00-.29-.44.87.87 0 00-1-.05.86.86 0 00-.34.4L.43 9.5l-.03.09a6.07 6.07 0 002.01 7.01l.01.01.03.02 4.98 3.73 2.46 1.86 1.5 1.13a1.01 1.01 0 001.22 0l1.5-1.13 2.46-1.86 5.01-3.75.01-.01a6.07 6.07 0 002.01-7z" />
    </Svg>
  );
}

export function BitbucketIcon({ size = 15, className }: IconProps) {
  return (
    <Svg size={size} className={className} fill viewBox="0 0 24 24">
      <path d="M.78 1.21a.77.77 0 00-.77.9l3.26 19.8c.08.5.52.87 1.02.88H19.95a.77.77 0 00.77-.65l3.27-20.03a.77.77 0 00-.77-.9zM14.52 15.53H9.52L8.17 8.47h7.56z" />
    </Svg>
  );
}

interface GitHostIconProps extends IconProps {
  /** Provider key from the backend: "github" | "gitlab" | "bitbucket", or null. */
  host?: string | null;
}

/** Show a project's git hosting provider mark based on where its remote lives;
 *  falls back to the generic repo icon for unknown/self-hosted hosts. */
export function GitHostIcon({ host, size = 15, className }: GitHostIconProps) {
  if (host === 'github') return <GitHubIcon size={size} className={className} />;
  if (host === 'gitlab') return <GitLabIcon size={size} className={className} />;
  if (host === 'bitbucket') return <BitbucketIcon size={size} className={className} />;
  return <RepoIcon size={size} className={className} />;
}

export function SplitIcon({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={1.4}>
      <rect x="2.3" y="3.3" width="11.4" height="9.4" rx="1.6" />
      <path d="M8 3.6v9.4" />
    </Svg>
  );
}

export function SplitBadgeIcon({ size = 10, className }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={1.6}>
      <rect x="2.5" y="3" width="11" height="10" rx="1.2" />
      <path d="M8 3v10" />
    </Svg>
  );
}

export function PlusIcon({ size = 13, className }: IconProps) {
  return <Svg size={size} className={className} strokeWidth={1.7}><path d="M8 3v10M3 8h10" /></Svg>;
}

/** Git branch ending in a plus — "create a worktree from a source". */
export function BranchPlusIcon({ size = 13, className }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={1.4}>
      <circle cx="4.5" cy="4" r="1.5" />
      <circle cx="4.5" cy="12" r="1.5" />
      <path d="M4.5 5.5v5M4.5 8.6h2.3A2.6 2.6 0 009.4 6" />
      <path d="M11.5 3.6v3.4M9.8 5.3h3.4" />
    </Svg>
  );
}

export function ExternalLinkIcon({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={1.4}>
      <path d="M9 3.3h3.7V7" />
      <path d="M12.7 3.3L7 9" />
      <path d="M11.2 9.4v2.3a1 1 0 01-1 1H4.3a1 1 0 01-1-1V5.8a1 1 0 011-1h2.3" />
    </Svg>
  );
}

export function RefreshIcon({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={1.5}>
      <path d="M13 8a5 5 0 11-1.46-3.54" />
      <path d="M13 3v2.5h-2.5" />
    </Svg>
  );
}

export function FolderIcon({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={1.4}>
      <path d="M2 5.2v6.4a1 1 0 001 1h10a1 1 0 001-1V6.2a1 1 0 00-1-1H7.8L6.4 3.6H3a1 1 0 00-1 1z" />
    </Svg>
  );
}

export function CodeIcon({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={1.5}>
      <path d="M5.5 5.5L2.5 8l3 2.5M10.5 5.5L13.5 8l-3 2.5M9.2 4l-2.4 8" />
    </Svg>
  );
}

export function FolderPlusIcon({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={1.4}>
      <path d="M2 5.2v6.4a1 1 0 001 1h10a1 1 0 001-1V6.2a1 1 0 00-1-1H7.8L6.4 3.6H3a1 1 0 00-1 1z" />
      <path d="M8 7.6v3.2M6.4 9.2h3.2" />
    </Svg>
  );
}

export function SearchIcon({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={1.6}>
      <circle cx="7" cy="7" r="4.2" />
      <path d="M10.2 10.2L14 14" />
    </Svg>
  );
}

export function DashboardIcon({ size = 15, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
    </Svg>
  );
}

export function DotsIcon({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <circle cx="8" cy="3.5" r="1.1" />
      <circle cx="8" cy="8" r="1.1" />
      <circle cx="8" cy="12.5" r="1.1" />
    </Svg>
  );
}

export function CloseIcon({ size = 16, className }: IconProps) {
  return <Svg size={size} className={className} strokeWidth={1.6}><path d="M4 4l8 8M12 4l-8 8" /></Svg>;
}

/** Archive box: a lidded crate with a pull slot. */
export function ArchiveIcon({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={1.4}>
      <rect x="2.3" y="3" width="11.4" height="2.8" rx="0.8" />
      <path d="M3.3 5.8v6a1 1 0 001 1h7.4a1 1 0 001-1v-6" />
      <path d="M6.4 8.2h3.2" />
    </Svg>
  );
}

export function BrandMark({ size = 16, className }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={1.6}>
      <circle cx="4" cy="4" r="1.7" />
      <circle cx="4" cy="12" r="1.7" />
      <circle cx="12" cy="7.5" r="1.7" />
      <path d="M4 5.7v4.6M4 8h3.6a3 3 0 003-3" />
    </Svg>
  );
}

/** Generic right-panel toggle: a framed rectangle with a docked right column. */
export function PanelRightIcon({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={1.4}>
      <rect x="2.3" y="3.3" width="11.4" height="9.4" rx="1.6" />
      <path d="M10 3.6v8.8" />
    </Svg>
  );
}

export function ListIcon({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={1.5}>
      <path d="M5.5 4.5h8M5.5 8h8M5.5 11.5h8" />
      <path d="M2.7 4.5h.01M2.7 8h.01M2.7 11.5h.01" strokeWidth={2} />
    </Svg>
  );
}

export function TreeIcon({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={1.5}>
      <path d="M3 3.5v9M3 6h3.5M3 9.5h3.5" />
      <path d="M7 4.5h6.5M7 6h4M7 9h6.5M7 10.5h4" strokeWidth={1.3} />
    </Svg>
  );
}

/** Stacked diff rows — the "inline / unified diffs" view toggle. */
export function RowsIcon({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={1.4}>
      <rect x="2.5" y="2.6" width="11" height="4" rx="1" />
      <rect x="2.5" y="9.4" width="11" height="4" rx="1" />
      <path d="M4.6 4.6h4.2M4.6 11.4h4.2" strokeWidth={1.2} />
    </Svg>
  );
}

export function SplitSquareIcon({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
      <path d="M8 2.5v11" />
    </Svg>
  );
}

export function ClearIcon({ size = 14, className }: IconProps) {
  return <Svg size={size} className={className}><path d="M3 4h10M6 4V3h4v1M5 4l.5 9h5L11 4" /></Svg>;
}

export function CheckIcon({ size = 13, className }: IconProps) {
  return <Svg size={size} className={className} strokeWidth={2}><path d="M3.3 8.6l3 3 6.4-7.2" /></Svg>;
}

export function SortIcon({ size = 14, className }: IconProps) {
  return <Svg size={size} className={className}><path d="M3 4h9M3 8h6M3 12h3" /></Svg>;
}

export function HelpIcon({ size = 15, className }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={1.5}>
      <circle cx="8" cy="8" r="6.3" />
      <path d="M6.1 6.15a1.9 1.9 0 0 1 3.6.6c0 1.25-1.8 1.55-1.8 2.75" />
      <circle cx="8" cy="11.5" r="0.6" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function BugIcon({ size = 13, className }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={1.4}>
      <rect x="5" y="5.3" width="6" height="7.2" rx="3" />
      <path d="M8 3v2.3M5.6 3.6l1.1 1.4M10.4 3.6 9.3 5M4.9 8H2.6M11.1 8h2.3M5.1 10.8 3 11.9M10.9 10.8 13 11.9M5.1 6.2 3 5.1M10.9 6.2 13 5.1" />
    </Svg>
  );
}

export function SparkleIcon({ size = 13, className }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={1.4}>
      <path d="M8 2.4c.45 2.75 1.4 3.7 4.15 4.15C9.4 7 8.45 7.95 8 10.7 7.55 7.95 6.6 7 3.85 6.55 6.6 6.1 7.55 5.15 8 2.4z" />
    </Svg>
  );
}

// ── new-worktree modal source icons ─────────────────────────────────────
export function LinearIcon({ size = 13, className }: IconProps) {
  return <Svg size={size} className={className} fill><path d="M8 1.7L14.3 8 8 14.3 1.7 8z" /></Svg>;
}

export function IssueIcon({ size = 13, className }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={1.4}>
      <circle cx="8" cy="8" r="5.4" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function GitBranchIcon({ size = 13, className }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={1.4}>
      <circle cx="5" cy="4" r="1.5" />
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="11" cy="6" r="1.5" />
      <path d="M5 5.5v5M5 8.5h3.2a2.8 2.8 0 002.8-1.2" />
    </Svg>
  );
}

export function PrIcon({ size = 13, className }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={1.4}>
      <circle cx="4.5" cy="4" r="1.5" />
      <circle cx="4.5" cy="12" r="1.5" />
      <circle cx="11.5" cy="12" r="1.5" />
      <path d="M4.5 5.5v5M11.5 10.5V8a2.5 2.5 0 00-2.5-2.5H7.2" />
      <path d="M8.6 4L7 5.5 8.6 7" />
    </Svg>
  );
}
