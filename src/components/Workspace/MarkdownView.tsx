import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { openUrl } from '@tauri-apps/plugin-opener';

interface MarkdownViewProps {
  content: string;
}

/** Open http(s) links in the system browser; ignore in-page/relative anchors. */
function handleLinkClick(event: React.MouseEvent<HTMLAnchorElement>, href: string | undefined) {
  event.preventDefault();
  if (href && /^https?:\/\//i.test(href)) openUrl(href).catch(() => null);
}

/** Element styling tuned to the app's graphite + ember palette. Raw HTML in the
 *  source is escaped by react-markdown (no rehype-raw), so this is safe to show
 *  for any file. */
const components: Components = {
  h1: ({ children }) => (
    <h1 className="mb-3 mt-6 border-b border-line pb-1.5 text-[22px] font-semibold text-ink first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2.5 mt-6 border-b border-line-soft pb-1 text-[18px] font-semibold text-ink first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => <h3 className="mb-2 mt-5 text-[15.5px] font-semibold text-ink first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mb-2 mt-4 text-[13.5px] font-semibold text-ink first:mt-0">{children}</h4>,
  h5: ({ children }) => <h5 className="mb-1.5 mt-4 text-[12.5px] font-semibold text-ink-dim first:mt-0">{children}</h5>,
  h6: ({ children }) => <h6 className="mb-1.5 mt-4 text-[12px] font-semibold uppercase tracking-wide text-ink-faint first:mt-0">{children}</h6>,
  p: ({ children }) => <p className="my-2.5 leading-relaxed text-ink-dim">{children}</p>,
  a: ({ href, children }) => (
    <a href={href} onClick={(e) => handleLinkClick(e, href)} className="text-url underline-offset-2 hover:underline">
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="my-2.5 ml-5 list-disc space-y-1 text-ink-dim marker:text-ink-faint">{children}</ul>,
  ol: ({ children }) => <ol className="my-2.5 ml-5 list-decimal space-y-1 text-ink-dim marker:text-ink-faint">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed [&>ul]:my-1 [&>ol]:my-1">{children}</li>,
  input: ({ checked, type }) =>
    type === 'checkbox' ? (
      <input type="checkbox" checked={checked} readOnly className="mr-1.5 -mb-px accent-ember" />
    ) : null,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-ember-edge pl-3 text-ink-faint [&>p]:text-ink-faint">{children}</blockquote>
  ),
  hr: () => <hr className="my-5 border-line" />,
  img: ({ src, alt }) => <img src={typeof src === 'string' ? src : undefined} alt={alt} className="my-3 max-w-full rounded-md border border-line" />,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="text-ink-faint line-through">{children}</del>,
  code: ({ className, children }) => {
    const text = String(children);
    const isBlock = /language-/.test(className ?? '') || text.includes('\n');
    if (isBlock) return <code className="font-mono text-[12.5px] text-ink-dim">{children}</code>;
    return <code className="rounded border border-line-soft bg-active px-1 py-0.5 font-mono text-[12px] text-ember">{children}</code>;
  },
  pre: ({ children }) => (
    <pre className="scroll-thin my-3 overflow-x-auto rounded-md border border-line bg-side p-3 leading-relaxed">{children}</pre>
  ),
  table: ({ children }) => (
    <div className="scroll-thin my-3 overflow-x-auto">
      <table className="w-full border-collapse text-[12.5px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-side">{children}</thead>,
  th: ({ children }) => <th className="border border-line px-3 py-1.5 text-left font-semibold text-ink">{children}</th>,
  td: ({ children }) => <td className="border border-line px-3 py-1.5 text-ink-dim">{children}</td>,
};

/** Rendered markdown view for the File pane. */
export function MarkdownView({ content }: MarkdownViewProps) {
  return (
    <div className="mx-auto max-w-[820px] px-6 py-5 text-[13.5px]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
