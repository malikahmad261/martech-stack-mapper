import { Fragment, type ReactNode } from 'react';

// Minimal markdown for assistant replies: paragraphs, ### headings, - and 1. lists, > quotes,
// **bold**, _italic_ and `code`. Enough for scripted replies without pulling in a parser.

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  // _italic_ only at word boundaries, so names like consult_booked stay intact.
  const re = /(\*\*[^*]+\*\*|`[^`]+`|(?<!\w)_[^_\n]+_(?!\w))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) out.push(<strong key={i++} className="font-semibold text-slate-900">{t.slice(2, -2)}</strong>);
    else if (t.startsWith('`')) out.push(<code key={i++} className="rounded bg-slate-100 px-1 py-px font-mono text-[11px] text-slate-800">{t.slice(1, -1)}</code>);
    else out.push(<em key={i++} className="text-slate-500">{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split('\n');
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith('### ')) {
      blocks.push(<h4 key={k++} className="pt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{inline(line.slice(4))}</h4>);
      i++;
    } else if (line.startsWith('>')) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) quote.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push(
        <blockquote key={k++} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <Markdown text={quote.join('\n')} />
        </blockquote>,
      );
    } else if (/^(- |\d+\. )/.test(line)) {
      const ordered = /^\d+\. /.test(line);
      const items: string[] = [];
      while (i < lines.length && /^(- |\d+\. )/.test(lines[i])) items.push(lines[i++].replace(/^(- |\d+\. )/, ''));
      const List = ordered ? 'ol' : 'ul';
      blocks.push(
        <List key={k++} className={ordered ? 'list-decimal space-y-1 pl-5' : 'list-disc space-y-1 pl-4'}>
          {items.map((it, j) => (
            <li key={j}>{inline(it)}</li>
          ))}
        </List>,
      );
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(- |\d+\. |### |>)/.test(lines[i])) para.push(lines[i++]);
      blocks.push(
        <p key={k++}>
          {para.map((p, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              {inline(p)}
            </Fragment>
          ))}
        </p>,
      );
    }
  }
  return <div className="space-y-2 text-sm leading-relaxed text-slate-700">{blocks}</div>;
}
