import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface LatexTextProps {
  text: string;
  className?: string;
}

/**
 * Split text on $...$ delimiters and render math with KaTeX.
 * Supports inline math only: $formula$
 * Escaped dollar signs (\$) are treated as literal.
 */
function parseLatexSegments(raw: string): Array<{ type: 'text' | 'math'; content: string }> {
  if (!raw) return [];
  const segments: Array<{ type: 'text' | 'math'; content: string }> = [];
  // Match $...$ but not \$, and not empty $$
  const regex = /(?<!\\)\$(.+?)(?<!\\)\$/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: raw.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'math', content: match[1] });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < raw.length) {
    segments.push({ type: 'text', content: raw.slice(lastIndex) });
  }

  return segments;
}

function renderMath(latex: string): string {
  try {
    return katex.renderToString(latex, {
      throwOnError: false,
      displayMode: false,
      strict: false,
      trust: false,
    });
  } catch {
    return escapeHtml(latex);
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function LatexText({ text, className }: LatexTextProps) {
  const segments = useMemo(() => parseLatexSegments(text), [text]);

  if (!text) return null;
  // Fast path: no math delimiters
  if (segments.length === 1 && segments[0].type === 'text') {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.type === 'math' ? (
          <span
            key={i}
            className="inline-block align-middle"
            dangerouslySetInnerHTML={{ __html: renderMath(seg.content) }}
          />
        ) : (
          <span key={i}>{seg.content}</span>
        )
      )}
    </span>
  );
}
