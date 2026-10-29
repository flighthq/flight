import type { XmlElement } from './types.ts';

export type XmlRecord<Key extends string, Value> = Record<Key, Value>;
export type XmlScanner = string;

const MAX_XML_ENTITY_PASSES = 8;
const MAX_XML_ENTITY_GROWTH = 16;
const MAX_XML_ENTITY_BUDGET = 65536;

export function createXmlRecord(): XmlRecord<string, string> {
  return {};
}

export function createXmlScanner(value: string): XmlScanner {
  return value;
}

export function decodeXmlEntitiesNative(source: string): string {
  return source.replace(/&(?:#(\d+)|#x([\da-fA-F]+)|(\w+));/g, (reference, decimal, hexadecimal, name) => {
    const numeric = decimal ?? hexadecimal;
    if (numeric !== undefined) {
      const codePoint = Number.parseInt(numeric, decimal !== undefined ? 10 : 16);
      if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return reference;
      return String.fromCodePoint(codePoint);
    }
    return xmlEntityReplacement(name) ?? reference;
  });
}

export function expandXmlEntitiesNative(source: string, entities: Readonly<XmlRecord<string, string>>): string {
  if (Object.keys(entities).length === 0) return source;
  let output = source;
  const budget = source.length * MAX_XML_ENTITY_GROWTH + MAX_XML_ENTITY_BUDGET;
  for (let pass = 0; pass < MAX_XML_ENTITY_PASSES; pass += 1) {
    let expanded = false;
    const next = output.replace(/&([\w:.-]+);/g, (reference, name) => {
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

export function getXmlRecordValue(record: Readonly<XmlRecord<string, string>>, key: string): string | null {
  const value = record[key];
  return value === undefined ? null : value;
}

export function parseXmlAttributesNative(attrs: string): XmlRecord<string, string> {
  const result = createXmlRecord();
  const expression = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(attrs)) !== null) {
    result[match[1]] = decodeXmlEntitiesNative(match[2] ?? match[3] ?? '');
  }
  return result;
}

export function parseXmlNumberNative(value: string): number | null {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function prepareXmlDocumentNative(xml: string, entities: XmlRecord<string, string>): string {
  return stripXmlDoctypes(stripProcessingInstructions(stripXmlComments(xml).replace(/\r\n?/g, '\n')), entities);
}

export function pushXmlElementContent(out: Array<string | XmlElement>, value: XmlElement): void {
  out.push(value);
}

export function pushXmlTextContent(out: Array<string | XmlElement>, value: string): void {
  out.push(value);
}

export function setXmlRecordValue(record: XmlRecord<string, string>, key: string, value: string): void {
  record[key] = value;
}

export function xmlIsWhitespace(unit: number): boolean {
  return /\s/u.test(String.fromCharCode(unit));
}

export function xmlRecordIsEmpty(record: Readonly<XmlRecord<string, string>>): boolean {
  return Object.keys(record).length === 0;
}

export function xmlScannerFind(scanner: Readonly<XmlScanner>, pattern: string, start: number): number | null {
  const position = scanner.indexOf(pattern, start);
  return position < 0 ? null : position;
}

export function xmlScannerLength(scanner: Readonly<XmlScanner>): number {
  return scanner.length;
}

export function xmlScannerStartsWith(scanner: Readonly<XmlScanner>, start: number, pattern: string): boolean {
  return scanner.startsWith(pattern, start);
}

export function xmlScannerUnitAt(scanner: Readonly<XmlScanner>, position: number): number {
  return scanner.charCodeAt(position);
}

export function xmlStringFromCodePoint(codePoint: number): string | null {
  if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return null;
  return String.fromCodePoint(codePoint);
}

export function xmlTrim(value: string): string {
  return value.trim();
}

export function xmlUtf16Slice(value: string, start: number, end: number): string {
  return value.slice(start, end);
}

function collectXmlEntityDeclarations(doctype: string, out: XmlRecord<string, string>): void {
  const declaration = /<!ENTITY\s+([\w:.-]+)\s*(?:"([^"]*)"|'([^']*)')\s*>/g;
  let match: RegExpExecArray | null;
  while ((match = declaration.exec(doctype)) !== null) {
    out[match[1]] = match[2] ?? match[3] ?? '';
  }
}

function stripProcessingInstructions(xml: string): string {
  let copyStart = 0;
  let output = '';
  let position = 0;
  while (position < xml.length) {
    if (!xml.startsWith('<?', position)) {
      position += 1;
      continue;
    }
    output += xml.slice(copyStart, position);
    const end = xml.indexOf('?>', position + 2);
    position = end < 0 ? xml.length : end + 2;
    copyStart = position;
  }
  return output + xml.slice(copyStart);
}

function stripXmlComments(xml: string): string {
  let copyStart = 0;
  let output = '';
  let position = 0;
  while (position < xml.length) {
    if (xml.startsWith('<![CDATA[', position)) {
      const end = xml.indexOf(']]>', position + 9);
      position = end < 0 ? xml.length : end + 3;
      continue;
    }
    if (!xml.startsWith('<!--', position)) {
      position += 1;
      continue;
    }
    output += xml.slice(copyStart, position);
    const end = xml.indexOf('-->', position + 4);
    position = end < 0 ? xml.length : end + 3;
    copyStart = position;
  }
  return output + xml.slice(copyStart);
}

function stripXmlDoctypes(xml: string, out: XmlRecord<string, string>): string {
  let copyStart = 0;
  let output = '';
  let position = 0;
  while (position < xml.length) {
    if (xml[position] !== '<' || xml.slice(position, position + 9).toLowerCase() !== '<!doctype') {
      position += 1;
      continue;
    }
    output += xml.slice(copyStart, position);
    const doctypeStart = position;
    position += 9;
    let internalSubsetDepth = 0;
    let quote = '';
    while (position < xml.length) {
      const character = xml[position];
      if (quote !== '') {
        if (character === quote) quote = '';
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '[') {
        internalSubsetDepth += 1;
      } else if (character === ']' && internalSubsetDepth > 0) {
        internalSubsetDepth -= 1;
      } else if (character === '>' && internalSubsetDepth === 0) {
        position += 1;
        break;
      }
      position += 1;
    }
    collectXmlEntityDeclarations(xml.slice(doctypeStart, position), out);
    copyStart = position;
  }
  return output + xml.slice(copyStart);
}

function xmlEntityReplacement(name: string): string | null {
  if (name === 'amp') return '&';
  if (name === 'apos') return "'";
  if (name === 'gt') return '>';
  if (name === 'lt') return '<';
  if (name === 'quot') return '"';
  return null;
}
