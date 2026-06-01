import { useMemo, useState } from 'react';
import { ChevronIcon, FolderIcon } from '../icons';

interface FileTreeProps {
  /** Repo-relative file paths (forward-slashed). */
  paths: string[];
  loading: boolean;
  error: string;
  /** Open a file (repo-relative path) — e.g. as a workspace viewer tab. */
  onOpenFile: (path: string) => void;
}

// ── Tree model ────────────────────────────────────────────────────────────────

interface TreeNode {
  /** Display name (folder chains like `src/components` merge into one row). */
  name: string;
  /** Full repo-relative path: directory for folders, file for leaves. */
  path: string;
  isFile: boolean;
  children: TreeNode[];
}

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', isFile: false, children: [] };
  for (const filePath of paths) {
    const parts = filePath.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const dirPath = parts.slice(0, i + 1).join('/');
      let child = node.children.find((c) => !c.isFile && c.path === dirPath);
      if (!child) {
        child = { name: parts[i], path: dirPath, isFile: false, children: [] };
        node.children.push(child);
      }
      node = child;
    }
    node.children.push({ name: parts[parts.length - 1], path: filePath, isFile: true, children: [] });
  }
  root.children = root.children.map(collapseChain);
  return sortNode(root).children;
}

/** Merge a folder with a single sub-folder into one row (e.g. `src/components`). */
function collapseChain(node: TreeNode): TreeNode {
  let current = node;
  while (!current.isFile && current.children.length === 1 && !current.children[0].isFile) {
    const only = current.children[0];
    current = { name: `${current.name}/${only.name}`, path: only.path, isFile: false, children: only.children };
  }
  current.children = current.children.map(collapseChain);
  return current;
}

/** Folders first, then files; alphabetical within each group. */
function sortNode(node: TreeNode): TreeNode {
  node.children.sort((a, b) => {
    const aFile = a.isFile ? 1 : 0;
    const bFile = b.isFile ? 1 : 0;
    if (aFile !== bFile) return aFile - bFile;
    return a.name.localeCompare(b.name);
  });
  node.children = node.children.map(sortNode);
  return node;
}

interface TreeRowsProps {
  nodes: TreeNode[];
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onOpenFile: (path: string) => void;
}

function TreeRows({ nodes, depth, expanded, onToggle, onOpenFile }: TreeRowsProps) {
  return (
    <>
      {nodes.map((node) => {
        const indent = 8 + depth * 12;
        if (node.isFile) {
          return (
            <button
              key={node.path}
              type="button"
              onClick={() => onOpenFile(node.path)}
              title={node.path}
              style={{ paddingLeft: indent + 16 }}
              className="flex w-full items-center gap-2 rounded-md py-1 pr-2 text-left text-[12.5px] text-ink-dim transition-colors hover:bg-hover hover:text-ink"
            >
              <span className="min-w-0 flex-1 truncate font-mono">{node.name}</span>
            </button>
          );
        }
        const isOpen = expanded.has(node.path);
        return (
          <div key={node.path}>
            <button
              type="button"
              onClick={() => onToggle(node.path)}
              style={{ paddingLeft: indent }}
              className="flex w-full items-center gap-1 rounded-md py-1 pr-2 text-left text-[12px] text-ink-dim transition-colors hover:bg-hover hover:text-ink"
            >
              <span className="grid w-3 flex-none place-items-center text-ink-faint">
                <ChevronIcon size={10} className={isOpen ? 'rotate-90' : ''} />
              </span>
              <span className="grid flex-none place-items-center text-ink-faint">
                <FolderIcon size={12} />
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-ink-faint">{node.name}</span>
            </button>
            {isOpen && (
              <TreeRows
                nodes={node.children}
                depth={depth + 1}
                expanded={expanded}
                onToggle={onToggle}
                onOpenFile={onOpenFile}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

/** Files tab: a browsable tree of the whole codebase. Clicking a file opens it
 *  in a workspace viewer tab. */
export function FileTree({ paths, loading, error, onOpenFile }: FileTreeProps) {
  const tree = useMemo(() => buildTree(paths), [paths]);
  // Empty by default → every folder starts collapsed (unlike the diff tree,
  // which starts fully expanded).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleFolder = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
      {error && <p className="px-1 py-2 text-[12px] text-del">{error}</p>}
      {!error && loading && paths.length === 0 && (
        <p className="px-1 py-2 text-[12px] text-ink-faint">Loading…</p>
      )}
      {!error && !loading && paths.length === 0 && (
        <p className="px-1 py-2 text-[12px] text-ink-faint">No files.</p>
      )}
      {paths.length > 0 && (
        <TreeRows nodes={tree} depth={0} expanded={expanded} onToggle={toggleFolder} onOpenFile={onOpenFile} />
      )}
    </div>
  );
}
