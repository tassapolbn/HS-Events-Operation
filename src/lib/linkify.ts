/**
 * Finds web addresses in text so they can be shown as links.
 *
 * Task notes often carry a Google Drive, Canva or map link pasted as plain
 * text. These helpers turn http(s):// and www. addresses into links, in plain
 * text and in sanitized rich text, without touching links that already exist.
 * No DOM here, so the rules can be tested on their own.
 */

export interface FoundLink {
  start: number;
  end: number;
  href: string;
}

// An address runs until a space, a quote, an angle bracket or a non-ASCII
// character, because Thai text often follows a link without a space.
const CANDIDATE = /\b(?:https?:\/\/|www\.)[^\s<>"'\u0080-￿]+/gi;
const CLOSERS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

const count = (text: string, char: string) => text.split(char).length - 1;

/** Drops punctuation that ends a sentence rather than the address */
function trimEnd(url: string): string {
  let out = url;
  for (;;) {
    const last = out.charAt(out.length - 1);
    if ('.,;:!?*'.includes(last) && last) {
      out = out.slice(0, -1);
    } else if (CLOSERS[last] && count(out, CLOSERS[last]) < count(out, last)) {
      out = out.slice(0, -1);
    } else {
      return out;
    }
  }
}

/**
 * The web addresses in a piece of text. In `html` mode the text is a text
 * segment of sanitized HTML, where an address also ends at an entity such as
 * &nbsp; (but &amp; belongs to it).
 */
export function findLinks(text: string, html = false): FoundLink[] {
  const links: FoundLink[] = [];
  for (const match of text.matchAll(CANDIDATE)) {
    let url = match[0];
    if (html) {
      const entity = url.search(/&(?!amp;)#?[a-z0-9]+;/i);
      if (entity >= 0) url = url.slice(0, entity);
    }
    url = trimEnd(url);
    // A bare "https://" or "www." is not an address
    if (!/[a-z0-9]/i.test(url.replace(/^(?:https?:\/\/|www\.)/i, ''))) continue;
    const start = match.index ?? 0;
    links.push({ start, end: start + url.length, href: /^www\./i.test(url) ? `https://${url}` : url });
  }
  return links;
}

/** Plain text split into text and links, for rendering with React */
export function linkifyText(text: string): Array<{ text: string; href?: string }> {
  const parts: Array<{ text: string; href?: string }> = [];
  let at = 0;
  for (const link of findLinks(text)) {
    if (link.start > at) parts.push({ text: text.slice(at, link.start) });
    parts.push({ text: text.slice(link.start, link.end), href: link.href });
    at = link.end;
  }
  if (at < text.length || parts.length === 0) parts.push({ text: text.slice(at) });
  return parts;
}

/**
 * Sanitized HTML with every bare address turned into a link that opens in a
 * new tab. Existing links and tag attributes are left exactly as they are.
 */
export function linkifyHtml(html: string): string {
  let insideLink = 0;
  return html
    .split(/(<[^>]*>)/)
    .map((part) => {
      if (part.startsWith('<')) {
        if (/^<a[\s>]/i.test(part)) insideLink++;
        else if (/^<\/a\s*>/i.test(part)) insideLink = Math.max(0, insideLink - 1);
        return part;
      }
      if (insideLink || !part) return part;
      const links = findLinks(part, true);
      if (links.length === 0) return part;
      let out = '';
      let at = 0;
      for (const link of links) {
        out += `${part.slice(at, link.start)}<a href="${link.href}" target="_blank" rel="noopener noreferrer">${part.slice(link.start, link.end)}</a>`;
        at = link.end;
      }
      return out + part.slice(at);
    })
    .join('');
}
