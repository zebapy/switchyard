import { useMemo, useState } from 'react';
import type { DiffSource, FileStatus } from '../../types/gitpanel';
import type { FileView } from '../../stores/gitPanel';
import { ChevronIcon, FolderIcon, ListIcon, TreeIcon } from '../icons';

interface ChangedFilesProps {
  source: DiffSource;
  onSourceChange: (source: DiffSource) => void;
  defaultBranch: string | null;
  files: FileStatus[];
  loading: boolean;
  error: string;
  selectedFile?: string | null;
  onSelectFile: (path: string) => void;
  fileView: FileView;
  onFileViewChange: (view: FileView) => void;
}

const SHORT: Record<string, string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  untracked: 'U',
  typechange: 'T',
  conflicted: '!',
};

const STATUS_COLOR: Record<string, string> = {
  added: 'text-green',
  untracked: 'text-green',
  deleted: 'text-del',
  conflicted: 'text-del',
  modified: 'text-ember',
  renamed: 'text-ember',
  copied: 'text-ember',
  typechange: 'text-ember',
};

function basename(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? path;
}

function dirname(path: string): string {
  const parts = path.replace(/\/+$/, '').split('/');
  parts.pop();
  return parts.join('/');
}

interface SegmentProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function Segment({ active, onClick, children }: SegmentProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex-1 rounded-md px-2 py-1 text-[11.5px] transition-colors ' +
        (active ? 'bg-active text-ink' : 'text-ink-faint hover:bg-hover hover:text-ink-dim')
      }
    >
      {children}
    </button>
  );
}

interface FileRowProps {
  file: FileStatus;
  selected: boolean;
  onSelect: () => void;
  /** Left padding in px (tree indentation). */
  indent: number;
  /** Show the parent directory after the name (used by the flat list). */
  showDir: boolean;
}

function FileRow({ file, selected, onSelect, indent, showDir }: FileRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      title={file.path}
      style={{ paddingLeft: indent }}
      className={
        'group flex w-full items-center gap-2 rounded-md py-1 pr-2 text-left text-[12.5px] transition-colors ' +
        (selected ? 'bg-active text-ink' : 'text-ink-dim hover:bg-hover hover:text-ink')
      }
    >
      <span className={`w-3 flex-none text-center font-mono text-[11px] ${STATUS_COLOR[file.status] ?? 'text-ink-faint'}`}>
        {SHORT[file.status] ?? '?'}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono">
        {basename(file.path)}
        {showDir && dirname(file.path) && (
          <span className="ml-1.5 text-[11px] text-ink-ghost">{dirname(file.path)}</span>
        )}
      </span>
      {file.added > 0 && <span className="flex-none font-mono text-[11px] text-green">+{file.added}</span>}
      {file.deleted > 0 && <span className="flex-none font-mono text-[11px] text-del">−{file.deleted}</span>}
    </button>
  );
}

// ── Tree model ────────────────────────────────────────────────────────────────

interface TreeNode {
  /** Display name for this segment (folders may merge single-child chains). */
  name: string;
  /** Full path: directory path for folders, file path for leaves. */
  path: string;
  file?: FileStatus;
  children: TreeNode[];
}

function buildTree(files: FileStatus[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', children: [] };
  for (const file of files) {
    const parts = file.path.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const dirPath = parts.slice(0, i + 1).join('/');
      let child = node.children.find((c) => !c.file && c.path === dirPath);
      if (!child) {
        child = { name: parts[i], path: dirPath, children: [] };
        node.children.push(child);
      }
      node = child;
    }
    node.children.push({ name: parts[parts.length - 1], path: file.path, file, children: [] });
  }
  root.children = root.children.map(collapseChain);
  return sortNode(root).children;
}

/** Merge a folder that has a single sub-folder into one row (e.g. `src/components`). */
function collapseChain(node: TreeNode): TreeNode {
  let current = node;
  while (!current.file && current.children.length === 1 && !current.children[0].file) {
    const only = current.children[0];
    current = { name: `${current.name}/${only.name}`, path: only.path, children: only.children };
  }
  current.children = current.children.map(collapseChain);
  return current;
}

/** Folders first, then files; alphabetical within each group. */
function sortNode(node: TreeNode): TreeNode {
  node.children.sort((a, b) => {
    const aFolder = a.file ? 1 : 0;
    const bFolder = b.file ? 1 : 0;
    if (aFolder !== bFolder) return aFolder - bFolder;
    return a.name.localeCompare(b.name);
  });
  node.children = node.children.map(sortNode);
  return node;
}

interface TreeRowsProps {
  nodes: TreeNode[];
  depth: number;
  collapsed: Set<string>;
  onToggle: (path: string) => void;
  selectedFile?: string | null;
  onSelectFile: (path: string) => void;
}

function TreeRows({ nodes, depth, collapsed, onToggle, selectedFile, onSelectFile }: TreeRowsProps) {
  return (
    <>
      {nodes.map((node) => {
        const indent = 8 + depth * 12;
        if (node.file) {
          return (
            <FileRow
              key={node.path}
              file={node.file}
              selected={selectedFile === node.path}
              onSelect={() => onSelectFile(node.path)}
              indent={indent + 16}
              showDir={false}
            />
          );
        }
        const isCollapsed = collapsed.has(node.path);
        return (
          <div key={node.path}>
            <button
              type="button"
              onClick={() => onToggle(node.path)}
              style={{ paddingLeft: indent }}
              className="flex w-full items-center gap-1 rounded-md py-1 pr-2 text-left text-[12px] text-ink-dim transition-colors hover:bg-hover hover:text-ink"
            >
              <span className="grid w-3 flex-none place-items-center text-ink-faint">
                <ChevronIcon size={10} className={isCollapsed ? '' : 'rotate-90'} />
              </span>
              <span className="grid flex-none place-items-center text-ink-faint">
                <FolderIcon size={12} />
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-ink-faint">{node.name}</span>
            </button>
            {!isCollapsed && (
              <TreeRows
                nodes={node.children}
                depth={depth + 1}
                collapsed={collapsed}
                onToggle={onToggle}
                selectedFile={selectedFile}
                onSelectFile={onSelectFile}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

interface ViewToggleProps {
  fileView: FileView;
  onFileViewChange: (view: FileView) => void;
}

function ViewToggle({ fileView, onFileViewChange }: ViewToggleProps) {
  const btn = (view: FileView, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => onFileViewChange(view)}
      title={label}
      aria-label={label}
      aria-pressed={fileView === view}
      className={
        'grid size-[22px] place-items-center rounded transition-colors ' +
        (fileView === view ? 'bg-active text-ember' : 'text-ink-faint hover:bg-hover hover:text-ink')
      }
    >
      {icon}
    </button>
  );
  return (
    <div className="flex flex-none items-center gap-0.5">
      {btn('tree', 'Tree view', <TreeIcon size={13} />)}
      {btn('list', 'List view', <ListIcon size={13} />)}
    </div>
  );
}

export function ChangedFiles({
  source,
  onSourceChange,
  defaultBranch,
  files,
  loading,
  error,
  selectedFile,
  onSelectFile,
  fileView,
  onFileViewChange,
}: ChangedFilesProps) {
  const tree = useMemo(() => (fileView === 'tree' ? buildTree(files) : []), [files, fileView]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleFolder = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-none items-center gap-1.5 px-2 pt-2">
        <div className="flex flex-1 gap-1">
          <Segment active={source === 'unstaged'} onClick={() => onSourceChange('unstaged')}>
            Unstaged
          </Segment>
          <Segment active={source === 'staged'} onClick={() => onSourceChange('staged')}>
            Staged
          </Segment>
          <Segment active={source === 'base'} onClick={() => onSourceChange('base')}>
            vs {defaultBranch ?? 'main'}
          </Segment>
        </div>
        <ViewToggle fileView={fileView} onFileViewChange={onFileViewChange} />
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
        {error && <p className="px-1 py-2 text-[12px] text-del">{error}</p>}
        {!error && loading && files.length === 0 && (
          <p className="px-1 py-2 text-[12px] text-ink-faint">Loading…</p>
        )}
        {!error && !loading && files.length === 0 && (
          <p className="px-1 py-2 text-[12px] text-ink-faint">No changes.</p>
        )}

        {fileView === 'list' &&
          files.map((file) => (
            <FileRow
              key={file.path}
              file={file}
              selected={selectedFile === file.path}
              onSelect={() => onSelectFile(file.path)}
              indent={8}
              showDir
            />
          ))}

        {fileView === 'tree' && files.length > 0 && (
          <TreeRows
            nodes={tree}
            depth={0}
            collapsed={collapsed}
            onToggle={toggleFolder}
            selectedFile={selectedFile}
            onSelectFile={onSelectFile}
          />
        )}
      </div>
    </div>
  );
}
