import { memo, useState, type ReactNode, isValidElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Check, Copy, FilePlus2 } from 'lucide-react';
import { useStore } from '../lib/store';
import { normalizePath } from '../lib/files';

function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return '';
}

function CodeBlock({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const child = Array.isArray(children) ? children[0] : children;
  const className = isValidElement(child) ? ((child.props as { className?: string }).className ?? '') : '';
  const lang = className.match(/language-([\w+-]+)/)?.[1] ?? '';
  const code = textOf(children).replace(/\n$/, '');
  const pathHint = code.split('\n')[0].match(/^(?:\/\/|#|<!--|\/\*)\s*([\w./-]+\.\w+)/)?.[1];

  const apply = () => {
    const s = useStore.getState();
    const path = window.prompt('Apply this code to file:', pathHint ?? s.codebase.activePath ?? `snippet.${lang || 'txt'}`);
    if (!path) return;
    const p = normalizePath(path);
    s.writeFile(p, code + '\n');
    s.openFile(p);
    s.toast(`Applied to ${p}`, 'success');
  };

  return (
    <div className="group my-3 overflow-hidden rounded-xl border border-line bg-bg">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5 text-[11px] text-faint">
        <span className="font-mono">{pathHint ?? (lang || 'code')}</span>
        <span className="flex gap-1">
          <button onClick={apply} className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted hover:text-fg" title="Apply to a file">
            <FilePlus2 size={12} /> Apply
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            }}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted hover:text-fg"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
          </button>
        </span>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[12.5px] leading-[1.6]">{children}</pre>
    </div>
  );
}

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="prose-float">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
