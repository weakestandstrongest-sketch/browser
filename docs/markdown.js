// Small, safe Markdown renderer for AI replies. All input is HTML-escaped first.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);

function inline(raw) {
  const codes = [];
  let s = escapeHTML(raw).replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
}

const isBullet = (l) => /^\s*[-*•]\s+/.test(l);
const isOrdered = (l) => /^\s*\d+[.)]\s+/.test(l);
const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
const isTableRule = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const isBlockStart = (l) => /^```/.test(l) || /^#{1,4}\s/.test(l) || isBullet(l) || isOrdered(l) || /^>\s?/.test(l) || isTableRow(l);
const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

export function renderMarkdown(src) {
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${escapeHTML(buf.join('\n'))}</code></pre>`);
    } else if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push('<hr>');
      i++;
    } else if (/^#{1,4}\s/.test(line)) {
      const [, hashes, text] = line.match(/^(#{1,4})\s+(.*)$/);
      const level = Math.min(hashes.length + 2, 6);
      out.push(`<h${level}>${inline(text)}</h${level}>`);
      i++;
    } else if (isBullet(line) || isOrdered(line)) {
      const ordered = isOrdered(line);
      const test = ordered ? isOrdered : isBullet;
      const items = [];
      while (i < lines.length && test(lines[i])) items.push(lines[i++].replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ''));
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${tag}>`);
    } else if (isTableRow(line) && i + 1 < lines.length && isTableRule(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]));
      out.push(
        '<div class="table-wrap"><table><thead><tr>' +
          head.map((c) => `<th>${inline(c)}</th>`).join('') +
          '</tr></thead><tbody>' +
          rows.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
          '</tbody></table></div>'
      );
    } else if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${buf.map(inline).join('<br>')}</blockquote>`);
    } else if (!line.trim()) {
      i++;
    } else {
      const buf = [];
      while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i]) && !/^(-{3,}|\*{3,})\s*$/.test(lines[i])) {
        buf.push(lines[i++]);
      }
      if (!buf.length) buf.push(lines[i++]);
      out.push(`<p>${buf.map(inline).join('<br>')}</p>`);
    }
  }
  return out.join('');
}
