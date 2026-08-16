// Tree-building (DOM-style) XML parser sufficient for atlas and plist file formats.
// Not a general-purpose XML parser, but handles namespaced/extra attributes and elements,
// both double-quoted and single-quoted attribute values, XML entity escapes
// (&amp; &lt; &gt; &quot; &apos; plus numeric references), general entities declared in a DOCTYPE's
// internal subset, XML comments (<!-- -->), CDATA sections (<![CDATA[...]]>), the XML declaration,
// and DOCTYPE.

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

  // Strip XML declaration and DOCTYPE before parsing the root element. The DOCTYPE is discarded but
  // its internal subset is read on the way out, because a general entity's replacement text is markup
  // and so has to be substituted into the source before the tree is built, not decoded out of a text
  // node afterwards.
  const entities: Record<string, string> = {};
  src = stripXmlDoctypes(src.replace(/<\?[\s\S]*?\?>/g, ''), entities).trim();

  return parseElement(expandXmlEntities(src, entities), { depth: 0, depthExceeded: false, pos: 0 });
}

interface ParseState {
  depth: number;
  depthExceeded: boolean;
  pos: number;
}

// An entity may nest a few levels legitimately; past that a document is recursing, not composing.
const MAX_XML_ENTITY_PASSES = 8;
const MAX_XML_ENTITY_GROWTH = 16;
const MAX_XML_ENTITY_BUDGET = 65536;

// Authored XML rarely nests beyond a few dozen elements. This leaves an order of magnitude of margin
// while stopping recursion well below the engine-dependent call-stack limit.
const MAX_XML_ELEMENT_DEPTH = 256;

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  quot: '"',
};

/**
 * Substitutes declared general entities into the source ahead of parsing.
 *
 * A replacement may itself reference an entity, so expansion repeats until it settles. Both the pass
 * count and the resulting size are capped: entities that reference each other are otherwise an
 * exponential bomb ("billion laughs"), and the budget is what keeps a hostile document costing
 * bounded work. Exhausting the budget stops expansion and keeps what resolved, since a partially
 * expanded document still parses.
 *
 * Only the predefined five and declared general entities substitute. An undeclared reference is left
 * alone for `decodeXmlEntities` to see as text.
 */
function expandXmlEntities(src: string, entities: Readonly<Record<string, string>>): string {
  let output = src;
  const budget = src.length * MAX_XML_ENTITY_GROWTH + MAX_XML_ENTITY_BUDGET;
  for (let pass = 0; pass < MAX_XML_ENTITY_PASSES; pass++) {
    let expanded = false;
    const next = output.replace(/&([\w:.-]+);/g, (reference: string, name: string) => {
      const replacement = entities[name];
      if (replacement === undefined) return reference;
      expanded = true;
      return replacement;
    });
    if (!expanded || next.length > budget) return output;
    output = next;
  }
  return output;
}

function decodeXmlEntities(s: string): string {
  return s.replace(/&(?:#(\d+)|#x([\da-fA-F]+)|(\w+));/g, (reference, dec, hex, name) => {
    const numeric = dec ?? hex;
    if (numeric !== undefined) {
      const codepoint = parseInt(numeric, dec !== undefined ? 10 : 16);
      if (codepoint > 0x10ffff || (codepoint >= 0xd800 && codepoint <= 0xdfff)) return reference;
      return String.fromCodePoint(codepoint);
    }
    return XML_ENTITIES[name] ?? reference;
  });
}

function parseElement(src: string, state: ParseState): XmlElement | null {
  if (state.depth >= MAX_XML_ELEMENT_DEPTH) {
    state.depthExceeded = true;
    return null;
  }
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

      state.depth++;
      const child = parseElement(src, state);
      state.depth--;
      if (state.depthExceeded) return null;
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

/**
 * Removes every DOCTYPE, collecting the general entities its internal subset declares into `out`.
 *
 * Parameter entities (`<!ENTITY % name …>`) and external ones (`SYSTEM` / `PUBLIC`) are deliberately
 * not collected: an external entity resolves a URL or a file path at parse time, which is a document
 * reading whatever the process can reach, so the parser has no business honoring one.
 */
function stripXmlDoctypes(xml: string, out: Record<string, string>): string {
  let copyStart = 0;
  let output = '';
  let pos = 0;

  while (pos < xml.length) {
    if (xml[pos] !== '<' || xml.slice(pos, pos + 9).toLowerCase() !== '<!doctype') {
      pos++;
      continue;
    }

    output += xml.slice(copyStart, pos);
    const doctypeStart = pos;
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

    collectXmlEntityDeclarations(xml.slice(doctypeStart, pos), out);
    copyStart = pos;
  }

  return output + xml.slice(copyStart);
}

// The name must be followed directly by a quoted replacement, which is what excludes both the
// parameter form (a `%` where the name belongs) and the external form (a SYSTEM/PUBLIC keyword where
// the quote belongs) without testing for either.
function collectXmlEntityDeclarations(doctype: string, out: Record<string, string>): void {
  const declaration = /<!ENTITY\s+([\w:.-]+)\s*(?:"([^"]*)"|'([^']*)')\s*>/g;
  let match: RegExpExecArray | null;
  while ((match = declaration.exec(doctype)) !== null) {
    out[match[1]] = match[2] ?? match[3] ?? '';
  }
}
