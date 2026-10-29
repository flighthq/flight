// Generated from crates/flight-xml/src/xml_parse.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { XmlContent, XmlElement } from './types.ts';
import type { XmlRecord } from './xmlNative.ts';
import {
  createXmlRecord,
  getXmlRecordValue,
  pushXmlElementContent,
  pushXmlTextContent,
  setXmlRecordValue,
  xmlIsWhitespace,
  xmlRecordIsEmpty,
  xmlStringFromCodePoint,
  xmlTrim,
  xmlUtf16Slice,
} from './xmlNative.ts';

interface ParseState {
  depth: number;
  depthExceeded: boolean;
  pos: number;
}

/**
 * An entity may nest a few levels legitimately; past that a document is recursing, not composing.
 */
const MAX_XML_ENTITY_PASSES: number = 8;

const MAX_XML_ENTITY_GROWTH: number = 16;

const MAX_XML_ENTITY_BUDGET: number = 65536;

/**
 * Authored XML rarely nests beyond a few dozen elements. This leaves an order of magnitude of
 * margin while stopping recursion well below the engine-dependent call-stack limit.
 */
const MAX_XML_ELEMENT_DEPTH: number = 256;

function utf16Units(value: string): number[] {
  return Array.from({ length: value.length }, (_, index) => value.charCodeAt(index));
}

function utf16StartsWith(units: Readonly<number[]>, start: number, pattern: string): boolean {
  const patternUnits: number[] = Array.from({ length: pattern.length }, (_, index) => pattern.charCodeAt(index));
  if (start + patternUnits.length > units.length) {
    return false;
  }
  let index: number = 0;
  while (index < patternUnits.length) {
    if (units[start + index] !== patternUnits[index]) {
      return false;
    }
    index += 1;
  }
  return true;
}

function findInUnits(units: Readonly<number[]>, pattern: string, start: number): number | null {
  const patternUnits: number[] = Array.from({ length: pattern.length }, (_, index) => pattern.charCodeAt(index));
  if (patternUnits.length === 0) {
    return start;
  }
  let position = start;
  while (position + patternUnits.length <= units.length) {
    let matches = true;
    let index: number = 0;
    while (index < patternUnits.length) {
      if (units[position + index] !== patternUnits[index]) {
        matches = false;
        break;
      }
      index += 1;
    }
    if (matches) {
      return position;
    }
    position += 1;
  }
  return null;
}

function isNameChar(unit: number): boolean {
  return (
    (unit >= 48 && unit <= 57) ||
    (unit >= 65 && unit <= 90) ||
    (unit >= 97 && unit <= 122) ||
    unit === 95 ||
    unit === 58 ||
    unit === 46 ||
    unit === 45
  );
}

function isTagNameEnd(unit: number): boolean {
  return xmlIsWhitespace(unit) || unit === 62 || unit === 47;
}

function isWordChar(unit: number): boolean {
  return (unit >= 48 && unit <= 57) || (unit >= 65 && unit <= 90) || (unit >= 97 && unit <= 122) || unit === 95;
}

function isDecimalDigit(unit: number): boolean {
  return unit >= 48 && unit <= 57;
}

function isHexDigit(unit: number): boolean {
  return isDecimalDigit(unit) || (unit >= 65 && unit <= 70) || (unit >= 97 && unit <= 102);
}

function parseCodePoint(units: Readonly<number[]>, start: number, end: number, radix: number): number | null {
  let value: number = 0;
  let position = start;
  while (position < end) {
    const unit = units[position];
    let digit: number;
    if (unit >= 48 && unit <= 57) {
      digit = (unit - 48) >>> 0;
    } else {
      if (unit >= 65 && unit <= 70) {
        digit = (unit - 65 + 10) >>> 0;
      } else {
        if (unit >= 97 && unit <= 102) {
          digit = (unit - 97 + 10) >>> 0;
        } else {
          return null;
        }
      }
    }
    if (digit >= radix || value > 0x10ffff / radix) {
      return null;
    }
    value = value * radix + digit;
    if (value > 0x10ffff) {
      return null;
    }
    position += 1;
  }
  return value;
}

function skipWhitespace(units: Readonly<number[]>, pos: number): void {
  while (pos < units.length && xmlIsWhitespace(units[pos])) {
    pos += 1;
  }
}

/**
 * Collects general entity declarations from a DOCTYPE's internal subset.
 *
 * Parameter entities (`<!ENTITY % name ...>`) and external ones (`SYSTEM` / `PUBLIC`) are
 * deliberately not collected: an external entity resolves a URL or a file path at parse time,
 * which is a document reading whatever the process can reach, so the parser has no business
 * honoring one.
 */
function collectXmlEntityDeclarations(doctype: string, out: XmlRecord<string, string>): void {
  const units = utf16Units(doctype);
  const len = units.length;
  let pos = 0;
  while (pos + 8 <= len) {
    if (!utf16StartsWith(units, pos, '<!ENTITY')) {
      pos += 1;
      continue;
    }
    pos += 8;
    const wsStart = pos;
    while (pos < len && xmlIsWhitespace(units[pos])) {
      pos += 1;
    }
    if (pos === wsStart) {
      continue;
    }
    const nameStart = pos;
    while (pos < len && isNameChar(units[pos])) {
      pos += 1;
    }
    if (pos === nameStart) {
      continue;
    }
    const name = xmlUtf16Slice(doctype, nameStart, pos);
    while (pos < len && xmlIsWhitespace(units[pos])) {
      pos += 1;
    }
    if (pos >= len) {
      break;
    }
    const quote = units[pos];
    if (quote !== 34 && quote !== 39) {
      continue;
    }
    pos += 1;
    const valueStart = pos;
    while (pos < len && units[pos] !== quote) {
      pos += 1;
    }
    if (pos >= len) {
      break;
    }
    const value = xmlUtf16Slice(doctype, valueStart, pos);
    pos += 1;
    while (pos < len && xmlIsWhitespace(units[pos])) {
      pos += 1;
    }
    if (pos < len && units[pos] === 62) {
      setXmlRecordValue(out, name, value);
      pos += 1;
    }
  }
}

function decodeXmlEntities(source: string): string {
  const units = utf16Units(source);
  const len = units.length;
  let result = '';
  let pos = 0;
  let copyStart = 0;
  while (pos < len) {
    if (units[pos] !== 38) {
      pos += 1;
      continue;
    }
    const ampPos = pos;
    pos += 1;
    if (pos >= len) {
      break;
    }
    if (units[pos] === 35) {
      pos += 1;
      const isHex = pos < len && units[pos] === 120;
      if (isHex) {
        pos += 1;
      }
      const numStart = pos;
      if (isHex) {
        while (pos < len && isHexDigit(units[pos])) {
          pos += 1;
        }
      } else {
        while (pos < len && isDecimalDigit(units[pos])) {
          pos += 1;
        }
      }
      if (pos > numStart && pos < len && units[pos] === 59) {
        const radix: number = isHex ? 16 : 10;
        if (parseCodePoint(units, numStart, pos, radix) !== null) {
          const codePoint = parseCodePoint(units, numStart, pos, radix);
          if (xmlStringFromCodePoint(codePoint) !== null) {
            const replacement = xmlStringFromCodePoint(codePoint);
            result += xmlUtf16Slice(source, copyStart, ampPos);
            result += replacement;
            pos += 1;
            copyStart = pos;
            continue;
          }
        }
        pos += 1;
        continue;
      }
      continue;
    }
    const nameStart = pos;
    while (pos < len && isWordChar(units[pos])) {
      pos += 1;
    }
    if (pos > nameStart && pos < len && units[pos] === 59) {
      const name = xmlUtf16Slice(source, nameStart, pos);
      if (xmlEntityReplacement(name) !== null) {
        const replacement = xmlEntityReplacement(name);
        result += xmlUtf16Slice(source, copyStart, ampPos);
        result += replacement;
        pos += 1;
        copyStart = pos;
        continue;
      }
      pos += 1;
    }
  }
  result += xmlUtf16Slice(source, copyStart, len);
  return result;
}

/**
 * Substitutes declared general entities into the source ahead of parsing.
 */
function expandXmlEntities(src: string, entities: Readonly<XmlRecord<string, string>>): string {
  if (xmlRecordIsEmpty(entities)) {
    return String(src);
  }
  const sourceUnits = utf16Units(src);
  let output = String(src);
  const budget = sourceUnits.length * MAX_XML_ENTITY_GROWTH + MAX_XML_ENTITY_BUDGET;
  let pass: number = 0;
  while (pass < MAX_XML_ENTITY_PASSES) {
    let expanded = false;
    const next = replaceEntityReferences(output, entities, expanded);
    if (!expanded || utf16Units(next).length > budget) {
      return output;
    }
    output = next;
    pass += 1;
  }
  return output;
}

function parseElement(src: string, units: Readonly<number[]>, state: ParseState): XmlElement | null {
  if (state.depth >= MAX_XML_ELEMENT_DEPTH) {
    state.depthExceeded = true;
    return null;
  }
  const len = units.length;
  skipWhitespace(units, state.pos);
  if (state.pos >= len || units[state.pos] !== 60) {
    return null;
  }
  state.pos += 1;
  if (state.pos < len && units[state.pos] === 63) {
    if (findInUnits(units, '?>', state.pos) !== null) {
      const end = findInUnits(units, '?>', state.pos);
      state.pos = end + 2;
    } else {
      state.pos = len;
    }
    return parseElement(src, units, state);
  }
  const nameStart = state.pos;
  while (state.pos < len && !isTagNameEnd(units[state.pos])) {
    state.pos += 1;
  }
  const name = xmlUtf16Slice(src, nameStart, state.pos);
  if (name.length === 0) {
    return null;
  }
  skipWhitespace(units, state.pos);
  const attrsStart = state.pos;
  let quote: number = 0;
  while (state.pos < len) {
    const unit = units[state.pos];
    if (quote !== 0) {
      if (unit === quote) {
        quote = 0;
      }
    } else {
      if (unit === 34 || unit === 39) {
        quote = unit;
      } else {
        if (unit === 62 || (unit === 47 && state.pos + 1 < len && units[state.pos + 1] === 62)) {
          break;
        }
      }
    }
    state.pos += 1;
  }
  const attrsStr = xmlUtf16Slice(src, attrsStart, state.pos);
  const selfClosing = state.pos < len && units[state.pos] === 47;
  state.pos += selfClosing ? 2 : 1;
  const attributes = parseXmlAttributes(attrsStr);
  let children: XmlElement[] = [] as never[];
  let content: XmlContent[] = [] as never[];
  let text = '';
  if (!selfClosing) {
    while (state.pos < len) {
      if (units[state.pos] !== 60) {
        const textStart = state.pos;
        while (state.pos < len && units[state.pos] !== 60) {
          state.pos += 1;
        }
        const decoded = decodeXmlEntities(xmlUtf16Slice(src, textStart, state.pos));
        text += xmlTrim(decoded);
        if (decoded.length !== 0) {
          pushXmlTextContent(content, decoded);
        }
        continue;
      }
      if (utf16StartsWith(units, state.pos, '<![CDATA[')) {
        const cdataStart = state.pos + 9;
        if (findInUnits(units, ']]>', cdataStart) !== null) {
          const end = findInUnits(units, ']]>', cdataStart);
          const cdata = xmlUtf16Slice(src, cdataStart, end);
          text += xmlTrim(cdata);
          if (cdata.length !== 0) {
            pushXmlTextContent(content, cdata);
          }
          state.pos = end + 3;
        } else {
          const cdata = xmlUtf16Slice(src, cdataStart, len);
          text += xmlTrim(cdata);
          if (cdata.length !== 0) {
            pushXmlTextContent(content, cdata);
          }
          state.pos = len;
        }
        continue;
      }
      if (state.pos + 1 < len && units[state.pos + 1] === 47) {
        while (state.pos < len && units[state.pos] !== 62) {
          state.pos += 1;
        }
        if (state.pos < len) {
          state.pos += 1;
        }
        break;
      }
      state.depth += 1;
      const child = parseElement(src, units, state);
      state.depth -= 1;
      if (state.depthExceeded) {
        return null;
      }
      if (child !== null) {
        const child = child;
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
export function parseXmlAttributes(attrs: string): XmlRecord<string, string> {
  const units = utf16Units(attrs);
  const len = units.length;
  let result = createXmlRecord();
  let pos = 0;
  while (pos < len) {
    while (pos < len && !isNameChar(units[pos])) {
      pos += 1;
    }
    if (pos >= len) {
      break;
    }
    const nameStart = pos;
    while (pos < len && isNameChar(units[pos])) {
      pos += 1;
    }
    const name = xmlUtf16Slice(attrs, nameStart, pos);
    while (pos < len && xmlIsWhitespace(units[pos])) {
      pos += 1;
    }
    if (pos >= len || units[pos] !== 61) {
      continue;
    }
    pos += 1;
    while (pos < len && xmlIsWhitespace(units[pos])) {
      pos += 1;
    }
    if (pos >= len) {
      break;
    }
    const quote = units[pos];
    if (quote !== 34 && quote !== 39) {
      continue;
    }
    pos += 1;
    const valueStart = pos;
    while (pos < len && units[pos] !== quote) {
      pos += 1;
    }
    const value = xmlUtf16Slice(attrs, valueStart, pos);
    if (pos < len) {
      pos += 1;
    }
    setXmlRecordValue(result, name, decodeXmlEntities(value));
  }
  return result;
}

/**
 * Parse a simple XML document into a tree of XmlElement objects.
 * Returns the root element, or None when the input contains no recognizable element.
 * Does not validate DTD, namespaces, or processing instructions.
 */
export function parseXmlDocument(xml: string): XmlElement | null {
  let src = stripXmlComments(xml);
  src = normalizeXmlLineEndings(src);
  let entities = createXmlRecord();
  src = stripProcessingInstructions(src);
  src = stripXmlDoctypes(src, entities);
  src = xmlTrim(src);
  const expanded = expandXmlEntities(src, entities);
  const units = utf16Units(expanded);
  let state = { depth: 0, depthExceeded: false, pos: 0 };
  return parseElement(expanded, units, state);
}

function replaceEntityReferences(
  src: string,
  entities: Readonly<XmlRecord<string, string>>,
  expanded: boolean,
): string {
  const units = utf16Units(src);
  const len = units.length;
  let result = '';
  let pos = 0;
  let copyStart = 0;
  while (pos < len) {
    if (units[pos] !== 38) {
      pos += 1;
      continue;
    }
    const ampPos = pos;
    pos += 1;
    const nameStart = pos;
    while (pos < len && isNameChar(units[pos])) {
      pos += 1;
    }
    if (pos > nameStart && pos < len && units[pos] === 59) {
      const name = xmlUtf16Slice(src, nameStart, pos);
      if (getXmlRecordValue(entities, name) !== null) {
        const replacement = getXmlRecordValue(entities, name);
        result += xmlUtf16Slice(src, copyStart, ampPos);
        result += replacement;
        expanded.value = true;
        pos += 1;
        copyStart = pos;
        continue;
      }
      pos += 1;
    }
  }
  result += xmlUtf16Slice(src, copyStart, len);
  return result;
}

function normalizeXmlLineEndings(xml: string): string {
  const units = utf16Units(xml);
  let output = '';
  let position: number = 0;
  let copyStart: number = 0;
  while (position < units.length) {
    if (units[position] !== 13) {
      position += 1;
      continue;
    }
    output += xmlUtf16Slice(xml, copyStart, position);
    output += '\n';
    position += 1;
    if (position < units.length && units[position] === 10) {
      position += 1;
    }
    copyStart = position;
  }
  output += xmlUtf16Slice(xml, copyStart, units.length);
  return output;
}

function stripProcessingInstructions(xml: string): string {
  const units = utf16Units(xml);
  let output = '';
  let pos = 0;
  let copyStart = 0;
  while (pos < units.length) {
    if (utf16StartsWith(units, pos, '<?')) {
      output += xmlUtf16Slice(xml, copyStart, pos);
      pos += 2;
      if (findInUnits(units, '?>', pos) !== null) {
        const end = findInUnits(units, '?>', pos);
        pos = end + 2;
      } else {
        pos = units.length;
      }
      copyStart = pos;
    } else {
      pos += 1;
    }
  }
  output += xmlUtf16Slice(xml, copyStart, units.length);
  return output;
}

function stripXmlComments(xml: string): string {
  const units = utf16Units(xml);
  let output = '';
  let pos = 0;
  let copyStart = 0;
  while (pos < units.length) {
    if (utf16StartsWith(units, pos, '<![CDATA[')) {
      if (findInUnits(units, ']]>', pos + 9) !== null) {
        const end = findInUnits(units, ']]>', pos + 9);
        pos = end + 3;
      } else {
        pos = units.length;
      }
      continue;
    }
    if (utf16StartsWith(units, pos, '<!--')) {
      output += xmlUtf16Slice(xml, copyStart, pos);
      if (findInUnits(units, '-->', pos + 4) !== null) {
        const end = findInUnits(units, '-->', pos + 4);
        pos = end + 3;
      } else {
        pos = units.length;
      }
      copyStart = pos;
      continue;
    }
    pos += 1;
  }
  output += xmlUtf16Slice(xml, copyStart, units.length);
  return output;
}

function asciiCaseInsensitiveAt(units: Readonly<number[]>, start: number, expected: string): boolean {
  const expectedUnits = utf16Units(expected);
  if (start + expectedUnits.length > units.length) {
    return false;
  }
  let index: number = 0;
  while (index < expectedUnits.length) {
    let actual = units[start + index];
    if (actual >= 65 && actual <= 90) {
      actual += 32;
    }
    if (actual !== expectedUnits[index]) {
      return false;
    }
    index += 1;
  }
  return true;
}

function stripXmlDoctypes(xml: string, out: XmlRecord<string, string>): string {
  const units = utf16Units(xml);
  const len = units.length;
  let output = '';
  let pos = 0;
  let copyStart = 0;
  while (pos < len) {
    if (units[pos] !== 60 || !asciiCaseInsensitiveAt(units, pos, '<!doctype')) {
      pos += 1;
      continue;
    }
    output += xmlUtf16Slice(xml, copyStart, pos);
    const doctypeStart = pos;
    pos += 9;
    let internalSubsetDepth: number = 0;
    let quote: number = 0;
    while (pos < len) {
      const unit = units[pos];
      if (quote !== 0) {
        if (unit === quote) {
          quote = 0;
        }
      } else {
        if (unit === 34 || unit === 39) {
          quote = unit;
        } else {
          if (unit === 91) {
            internalSubsetDepth += 1;
          } else {
            if (unit === 93 && internalSubsetDepth > 0) {
              internalSubsetDepth -= 1;
            } else {
              if (unit === 62 && internalSubsetDepth === 0) {
                pos += 1;
                break;
              }
            }
          }
        }
      }
      pos += 1;
    }
    collectXmlEntityDeclarations(xmlUtf16Slice(xml, doctypeStart, pos), out);
    copyStart = pos;
  }
  output += xmlUtf16Slice(xml, copyStart, len);
  return output;
}

function xmlEntityReplacement(name: string): string | null {
  if (name === 'amp') {
    return '&';
  }
  if (name === 'apos') {
    return "'";
  }
  if (name === 'gt') {
    return '>';
  }
  if (name === 'lt') {
    return '<';
  }
  if (name === 'quot') {
    return '"';
  }
  return null;
}
