// Tree-building (DOM-style) XML parser sufficient for atlas and plist file formats.
// Not a general-purpose XML parser, but handles namespaced/extra attributes and elements,
// both double-quoted and single-quoted attribute values, XML entity escapes
// (&amp; &lt; &gt; &quot; &apos; plus numeric references), XML comments (<!-- -->),
// CDATA sections (<![CDATA[...]]>), the XML declaration, and DOCTYPE.

import type { XmlElement } from '@flighthq/types/contract';

/** Parse all attributes from an element's attribute string.
 *  Supports double-quoted and single-quoted values and XML entity escapes. */
export function parseXmlAttributes(attrs: string): Record<string, string> {
  const result: Record<string, string> = {};
  // Match name="value" or name='value', capturing both quote styles
  const re = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrs)) !== null) {
    const attrName = m[1];
    const value = m[2] !== undefined ? m[2] : (m[3] ?? '');
    result[attrName] = decodeXmlEntities(value);
  }
  return result;
}

/** Parse a simple XML document into a tree of XmlElement objects.
 *  Returns the root element, or null when the input contains no recognizable element.
 *  Does not validate DTD, namespaces, or processing instructions. */
export function parseXmlDocument(xml: string): XmlElement | null {
  // Normalize: strip comments and normalize line endings.
  let src = stripXmlComments(xml).replace(/\r\n?/g, '\n');

  // Strip XML declaration and DOCTYPE before parsing the root element.
  src = stripXmlDoctypes(src.replace(/<\?[\s\S]*?\?>/g, '')).trim();

  return parseElement(src, { pos: 0 });
}

interface ParseState {
  pos: number;
}

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  quot: '"',
};

function decodeXmlEntities(s: string): string {
  return s.replace(/&(?:#(\d+)|#x([\da-fA-F]+)|(\w+));/g, (_, dec, hex, name) => {
    if (dec) return String.fromCodePoint(parseInt(dec, 10));
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    return XML_ENTITIES[name] ?? _;
  });
}

function parseElement(src: string, state: ParseState): XmlElement | null {
  skipWhitespace(src, state);
  if (state.pos >= src.length || src[state.pos] !== '<') return null;

  // Find the end of the opening tag
  state.pos++; // consume '<'

  // Skip processing instructions
  if (src[state.pos] === '?') {
    const end = src.indexOf('?>', state.pos);
    state.pos = end >= 0 ? end + 2 : src.length;
    return parseElement(src, state);
  }

  // Read element name
  const nameStart = state.pos;
  while (state.pos < src.length && !/[\s>/]/.test(src[state.pos])) state.pos++;
  const name = src.slice(nameStart, state.pos);
  if (!name) return null;

  skipWhitespace(src, state);

  // Read attributes up to the tag end. Track the active quote so a '>' inside a
  // quoted attribute value (e.g. a TexturePacker/Starling value like "a>b") is
  // treated as data rather than ending the tag.
  let attrsStr = '';
  let quote = '';
  while (state.pos < src.length) {
    const ch = src[state.pos];
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '>' || (ch === '/' && src[state.pos + 1] === '>')) {
      break;
    }
    attrsStr += ch;
    state.pos++;
  }

  const selfClosing = src[state.pos] === '/';
  state.pos += selfClosing ? 2 : 1; // consume '/>' or '>'

  const attributes = parseXmlAttributes(attrsStr);
  const children: XmlElement[] = [];
  const content: Array<string | XmlElement> = [];
  let text = '';

  if (!selfClosing) {
    // Parse children until closing tag
    while (state.pos < src.length) {
      if (state.pos >= src.length) break;

      if (src[state.pos] !== '<') {
        // Text node
        const textStart = state.pos;
        while (state.pos < src.length && src[state.pos] !== '<') state.pos++;
        const decoded = decodeXmlEntities(src.slice(textStart, state.pos));
        text += decoded.trim();
        if (decoded !== '') content.push(decoded);
        continue;
      }

      if (src.slice(state.pos, state.pos + 9) === '<![CDATA[') {
        const cdataStart = state.pos + 9;
        const cdataEnd = src.indexOf(']]>', cdataStart);
        const contentEnd = cdataEnd >= 0 ? cdataEnd : src.length;
        const cdata = src.slice(cdataStart, contentEnd);
        text += cdata.trim();
        if (cdata !== '') content.push(cdata);
        state.pos = cdataEnd >= 0 ? cdataEnd + 3 : src.length;
        continue;
      }

      // Check for closing tag
      if (src[state.pos + 1] === '/') {
        // Skip to '>'
        while (state.pos < src.length && src[state.pos] !== '>') state.pos++;
        state.pos++; // consume '>'
        break;
      }

      const child = parseElement(src, state);
      if (child) {
        children.push(child);
        content.push(child);
      }
    }
  }

  return { attributes, children, content, name, text };
}

function skipWhitespace(src: string, state: ParseState): void {
  while (state.pos < src.length && /\s/.test(src[state.pos])) state.pos++;
}

function stripXmlComments(xml: string): string {
  let copyStart = 0;
  let output = '';
  let pos = 0;

  while (pos < xml.length) {
    if (xml.slice(pos, pos + 9) === '<![CDATA[') {
      const cdataEnd = xml.indexOf(']]>', pos + 9);
      pos = cdataEnd >= 0 ? cdataEnd + 3 : xml.length;
      continue;
    }
    if (xml.slice(pos, pos + 4) !== '<!--') {
      pos++;
      continue;
    }

    output += xml.slice(copyStart, pos);
    const commentEnd = xml.indexOf('-->', pos + 4);
    pos = commentEnd >= 0 ? commentEnd + 3 : xml.length;
    copyStart = pos;
  }

  return output + xml.slice(copyStart);
}

function stripXmlDoctypes(xml: string): string {
  let copyStart = 0;
  let output = '';
  let pos = 0;

  while (pos < xml.length) {
    if (xml[pos] !== '<' || xml.slice(pos, pos + 9).toLowerCase() !== '<!doctype') {
      pos++;
      continue;
    }

    output += xml.slice(copyStart, pos);
    pos += 9;

    let internalSubsetDepth = 0;
    let quote = '';
    while (pos < xml.length) {
      const ch = xml[pos];
      if (quote) {
        if (ch === quote) quote = '';
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '[') {
        internalSubsetDepth++;
      } else if (ch === ']' && internalSubsetDepth > 0) {
        internalSubsetDepth--;
      } else if (ch === '>' && internalSubsetDepth === 0) {
        pos++;
        break;
      }
      pos++;
    }

    copyStart = pos;
  }

  return output + xml.slice(copyStart);
}
