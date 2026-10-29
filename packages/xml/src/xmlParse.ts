// Generated from crates/flight-xml/src/xml_parse.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { XmlContent, XmlElement } from './types.ts';
import type { XmlRecord, XmlScanner } from './xmlNative.ts';
import {
  createXmlRecord,
  createXmlScanner,
  decodeXmlEntitiesNative,
  expandXmlEntitiesNative,
  parseXmlAttributesNative,
  prepareXmlDocumentNative,
  pushXmlElementContent,
  pushXmlTextContent,
  xmlIsWhitespace,
  xmlScannerFind,
  xmlScannerLength,
  xmlScannerStartsWith,
  xmlScannerUnitAt,
  xmlTrim,
  xmlUtf16Slice,
} from './xmlNative.ts';

interface ParseState {
  depth: number;
  depthExceeded: boolean;
  pos: number;
}

/**
 * Authored XML rarely nests beyond a few dozen elements. This leaves an order of magnitude of
 * margin while stopping recursion well below the engine-dependent call-stack limit.
 */
const MAX_XML_ELEMENT_DEPTH: number = 256;

function isTagNameEnd(unit: number): boolean {
  return xmlIsWhitespace(unit) || unit === 62 || unit === 47;
}

function skipWhitespace(scanner: Readonly<XmlScanner>, position: number): number {
  const len = xmlScannerLength(scanner);
  while (position < len && xmlIsWhitespace(xmlScannerUnitAt(scanner, position))) {
    position += 1;
  }
  return position;
}

function parseElement(source: string, scanner: Readonly<XmlScanner>, state: ParseState): XmlElement | null {
  if (state.depth >= MAX_XML_ELEMENT_DEPTH) {
    state.depthExceeded = true;
    return null;
  }
  const len = xmlScannerLength(scanner);
  state.pos = skipWhitespace(scanner, state.pos);
  if (state.pos >= len || xmlScannerUnitAt(scanner, state.pos) !== 60) {
    return null;
  }
  state.pos += 1;
  if (state.pos < len && xmlScannerUnitAt(scanner, state.pos) === 63) {
    const instructionEnd = xmlScannerFind(scanner, '?>', state.pos);
    if (instructionEnd !== null) {
      const end = instructionEnd;
      state.pos = end + 2;
    } else {
      state.pos = len;
    }
    return parseElement(source, scanner, state);
  }
  const nameStart = state.pos;
  while (state.pos < len && !isTagNameEnd(xmlScannerUnitAt(scanner, state.pos))) {
    state.pos += 1;
  }
  const name = xmlUtf16Slice(source, nameStart, state.pos);
  if (name.length === 0) {
    return null;
  }
  state.pos = skipWhitespace(scanner, state.pos);
  const attributesStart = state.pos;
  let quote: number = 0;
  while (state.pos < len) {
    const unit = xmlScannerUnitAt(scanner, state.pos);
    if (quote !== 0) {
      if (unit === quote) {
        quote = 0;
      }
    } else {
      if (unit === 34 || unit === 39) {
        quote = unit;
      } else {
        if (unit === 62 || (unit === 47 && state.pos + 1 < len && xmlScannerUnitAt(scanner, state.pos + 1) === 62)) {
          break;
        }
      }
    }
    state.pos += 1;
  }
  const attributesSource = xmlUtf16Slice(source, attributesStart, state.pos);
  const selfClosing = state.pos < len && xmlScannerUnitAt(scanner, state.pos) === 47;
  state.pos += selfClosing ? 2 : 1;
  const attributes = parseXmlAttributes(attributesSource);
  let children: XmlElement[] = [] as never[];
  let content: XmlContent[] = [] as never[];
  let text = '';
  if (!selfClosing) {
    while (state.pos < len) {
      if (xmlScannerUnitAt(scanner, state.pos) !== 60) {
        const textStart = state.pos;
        while (state.pos < len && xmlScannerUnitAt(scanner, state.pos) !== 60) {
          state.pos += 1;
        }
        const decoded = decodeXmlEntitiesNative(xmlUtf16Slice(source, textStart, state.pos));
        text += xmlTrim(decoded);
        if (decoded.length !== 0) {
          pushXmlTextContent(content, decoded);
        }
        continue;
      }
      if (xmlScannerStartsWith(scanner, state.pos, '<![CDATA[')) {
        const cdataStart = state.pos + 9;
        const cdataEnd = xmlScannerFind(scanner, ']]>', cdataStart);
        if (cdataEnd !== null) {
          const end = cdataEnd;
          const cdata = xmlUtf16Slice(source, cdataStart, end);
          text += xmlTrim(cdata);
          if (cdata.length !== 0) {
            pushXmlTextContent(content, cdata);
          }
          state.pos = end + 3;
        } else {
          const cdata = xmlUtf16Slice(source, cdataStart, len);
          text += xmlTrim(cdata);
          if (cdata.length !== 0) {
            pushXmlTextContent(content, cdata);
          }
          state.pos = len;
        }
        continue;
      }
      if (state.pos + 1 < len && xmlScannerUnitAt(scanner, state.pos + 1) === 47) {
        while (state.pos < len && xmlScannerUnitAt(scanner, state.pos) !== 62) {
          state.pos += 1;
        }
        if (state.pos < len) {
          state.pos += 1;
        }
        break;
      }
      state.depth += 1;
      const parsedChild = parseElement(source, scanner, state);
      state.depth -= 1;
      if (state.depthExceeded) {
        return null;
      }
      if (parsedChild !== null) {
        const child = parsedChild;
        const childRef: XmlElement = child;
        children.push(childRef);
        pushXmlElementContent(content, childRef);
      }
    }
  }
  return { attributes: attributes, children: children, content: content, name: name, text: text };
}

/**
 * Parse all attributes from an element's attribute string.
 * Supports double-quoted and single-quoted values and XML entity escapes.
 */
export function parseXmlAttributes(attributes: string): XmlRecord<string, string> {
  return parseXmlAttributesNative(attributes);
}

/**
 * Parse a simple XML document into a tree of XmlElement objects.
 * Returns the root element, or None when the input contains no recognizable element.
 * Does not validate DTD, namespaces, or processing instructions.
 */
export function parseXmlDocument(xml: string): XmlElement | null {
  let entities = createXmlRecord();
  let source = prepareXmlDocumentNative(xml, entities);
  source = xmlTrim(source);
  const expanded = expandXmlEntitiesNative(source, entities);
  const scanner = createXmlScanner(expanded);
  let state = { depth: 0, depthExceeded: false, pos: 0 };
  return parseElement(expanded, scanner, state);
}
