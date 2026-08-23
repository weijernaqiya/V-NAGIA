export interface TableOfContentsEntry {
  id: string;
  level: 2 | 3;
  title: string;
}

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const stripMarkdown = (value: string) => value
  .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/\[\[([^\]]+)\]\]/g, '$1')
  .replace(/\{\{旁注:([^}]+)\}\}/g, '$1')
  .replace(/^:::annotation.*$|^:::$/gm, '')
  .replace(/\^\{([^}]+)\}|_\{([^}]+)\}/g, '$1$2')
  .replace(/[*_~`>#-]/g, '')
  .trim();

const slugify = (value: string, fallback: string) => {
  const slug = stripMarkdown(value)
    .toLocaleLowerCase('zh-CN')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
};

const safeUrl = (value: string, kind: 'link' | 'image') => {
  const source = value.trim();
  if (source.startsWith('/') || source.startsWith('#')) return source;
  if (/^https?:\/\//i.test(source)) return source;
  if (kind === 'link' && /^mailto:/i.test(source)) return source;
  if (kind === 'image' && /^(blob:|data:image\/(?:jpeg|png|webp|gif);base64,)/i.test(source)) {
    return source;
  }
  return '#';
};

const renderInline = (value: string) => {
  const codeTokens: string[] = [];
  let html = escapeHtml(value).replace(/`([^`]+)`/g, (_match, code: string) => {
    const index = codeTokens.push(`<code>${code}</code>`) - 1;
    return `@@CODE${index}@@`;
  });

  html = html
    .replace(/\{\{旁注:([^}]+)\}\}/g, (_match, note: string) => (
      `<span class="writing-margin-note"><button type="button" data-margin-note-toggle aria-expanded="false" aria-label="展开旁注">※</button><span>${note}</span></span>`
    ))
    .replace(/\[\[([^\]]+)\]\]/g, (_match, target: string) => {
      const label = target.trim();
      const href = `/writing/search?q=${encodeURIComponent(label)}`;
      return `<a class="writing-prose__wiki-link" href="${href}">${label}</a>`;
    })
    .replace(/!\[([^\]]*)\]\(([^\s)]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_match, alt, src) => (
      `<img src="${escapeHtml(safeUrl(src, 'image'))}" alt="${alt}" loading="lazy" />`
    ))
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => (
      `<a href="${escapeHtml(safeUrl(href, 'link'))}">${label}</a>`
    ))
    .replace(/\[\^([^\]]+)\]/g, (_match, id: string) => (
      `<sup class="writing-footnote-ref"><a id="footnote-ref-${id}" href="#footnote-${id}" aria-label="脚注 ${id}">${id}</a></sup>`
    ))
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/\^\{([^}]+)\}/g, '<sup>$1</sup>')
    .replace(/_\{([^}]+)\}/g, '<sub>$1</sub>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/@@CODE(\d+)@@/g, (_match, index: string) => codeTokens[Number(index)] ?? '');

  return html;
};

const isBlockStart = (line: string, nextLine = '') => Boolean(
  /^#{1,6}\s/.test(line)
  || /^```/.test(line)
  || /^:::annotation(?:\s|$)/.test(line)
  || /^>\s?/.test(line)
  || /^[-*+]\s+/.test(line)
  || /^\d+\.\s+/.test(line)
  || /^(-{3,}|_{3,}|\*{3,})$/.test(line.trim())
  || /^!\[[^\]]*\]\([^)]+\)$/.test(line.trim())
  || (line.includes('|') && /^\s*\|?\s*:?-+/.test(nextLine))
);

const renderTable = (rows: string[]) => {
  const cells = rows.map((row) => row.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()));
  const [headers, _divider, ...body] = cells;
  return [
    '<div class="writing-prose__table-wrap"><table>',
    `<thead><tr>${headers.map((cell) => `<th>${renderInline(cell)}</th>`).join('')}</tr></thead>`,
    `<tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`).join('')}</tbody>`,
    '</table></div>',
  ].join('');
};

/*
 * 这是刻意受限的 Markdown 渲染器：先转义原始 HTML，再开放写作系统需要的语法。
 * 它适合当前受信任的本地作品和编辑预览，但不是未来多人投稿场景的服务端净化器；
 * 接入远程内容后仍应在服务端使用成熟 Markdown 管线和 HTML sanitizer。
 */
export const renderWritingMarkdown = (source: string) => {
  const normalized = source.replace(/\r\n?/g, '\n');
  const footnotes = new Map<string, string>();
  const lines = normalized.split('\n').filter((line) => {
    const match = line.match(/^\[\^([^\]]+)\]:\s*(.+)$/);
    if (!match) return true;
    footnotes.set(match[1], match[2]);
    return false;
  });

  const output: string[] = [];
  let index = 0;
  let paragraphIndex = 0;
  let headingIndex = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const annotation = line.match(/^:::annotation(?:\s+(.+))?\s*$/);
    if (annotation) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !/^:::\s*$/.test(lines[index])) {
        body.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const title = annotation[1]?.trim() || '作者批注';
      const content = body
        .join('\n')
        .split(/\n{2,}/)
        .filter((paragraph) => paragraph.trim())
        .map((paragraph) => `<p>${renderInline(paragraph.replace(/\n/g, ' '))}</p>`)
        .join('');
      output.push(`<details class="writing-annotation"><summary>${renderInline(title)}</summary>${content}</details>`);
      continue;
    }

    const fence = line.match(/^```([\w-]*)\s*$/);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      output.push(`<pre><code data-language="${escapeHtml(fence[1] || 'text')}">${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = Math.min(6, heading[1].length);
      const id = slugify(heading[2], `section-${++headingIndex}`);
      output.push(`<h${level} id="${id}">${renderInline(heading[2])}<a class="writing-prose__anchor" href="#${id}" aria-label="复制此章节链接">¶</a></h${level}>`);
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^>\s?/, ''));
        index += 1;
      }
      const featured = quote[0]?.trim() === '[!FEATURED]';
      if (featured) quote.shift();
      output.push(`<blockquote${featured ? ' class="writing-prose__featured-quote"' : ''}>${quote.map(renderInline).join('<br />')}</blockquote>`);
      continue;
    }

    const unordered = /^[-*+]\s+/.test(line);
    const ordered = /^\d+\.\s+/.test(line);
    if (unordered || ordered) {
      const tag = ordered ? 'ol' : 'ul';
      const pattern = ordered ? /^\d+\.\s+/ : /^[-*+]\s+/;
      const items: string[] = [];
      while (index < lines.length && pattern.test(lines[index])) {
        items.push(lines[index].replace(pattern, ''));
        index += 1;
      }
      output.push(`<${tag}>${items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</${tag}>`);
      continue;
    }

    if (line.includes('|') && /^\s*\|?\s*:?-+/.test(lines[index + 1] ?? '')) {
      const tableRows = [line, lines[index + 1]];
      index += 2;
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        tableRows.push(lines[index]);
        index += 1;
      }
      output.push(renderTable(tableRows));
      continue;
    }

    if (/^(-{3,}|_{3,}|\*{3,})$/.test(line.trim())) {
      output.push('<hr />');
      index += 1;
      continue;
    }

    const figure = line.trim().match(/^!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)$/);
    if (figure) {
      const [, alt, rawSrc, caption] = figure;
      const src = escapeHtml(safeUrl(rawSrc, 'image'));
      output.push(`<figure><img src="${src}" alt="${escapeHtml(alt)}" loading="lazy" />${caption ? `<figcaption>${renderInline(caption)}</figcaption>` : ''}</figure>`);
      index += 1;
      continue;
    }

    const paragraph: string[] = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index], lines[index + 1])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    paragraphIndex += 1;
    const paragraphId = `p-${paragraphIndex}`;
    output.push(`<p id="${paragraphId}">${renderInline(paragraph.join(' '))}<a class="writing-prose__paragraph-anchor" href="#${paragraphId}" aria-label="复制此段链接">¶</a></p>`);
  }

  if (footnotes.size > 0) {
    output.push('<section class="writing-footnotes" aria-labelledby="footnotes-title"><h2 id="footnotes-title">脚注</h2><ol>');
    footnotes.forEach((note, id) => {
      output.push(`<li id="footnote-${escapeHtml(id)}">${renderInline(note)} <a class="writing-footnotes__return" href="#footnote-ref-${escapeHtml(id)}" aria-label="返回正文">↩</a></li>`);
    });
    output.push('</ol></section>');
  }

  return output.join('\n');
};

export const extractWritingTableOfContents = (source: string): TableOfContentsEntry[] => {
  let headingIndex = 0;
  return source
    .replace(/```[\s\S]*?```/g, '')
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = line.match(/^(#{2,3})\s+(.+)$/);
      if (!match) return [];
      const level = match[1].length as 2 | 3;
      const title = stripMarkdown(match[2]);
      return [{ id: slugify(match[2], `section-${++headingIndex}`), level, title }];
    });
};

export const countWritingText = (source: string) => {
  const plain = stripMarkdown(source.replace(/```[\s\S]*?```/g, ' '));
  const characters = Array.from(plain.replace(/\s/g, '')).length;
  const cjkCharacters = (plain.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) ?? []).length;
  const latinWords = plain
    .replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu, ' ')
    .match(/[\p{Letter}\p{Number}]+(?:['’-][\p{Letter}\p{Number}]+)*/gu)?.length ?? 0;

  return {
    characters,
    words: cjkCharacters + latinWords,
  };
};
