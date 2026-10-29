import type { XmlElement } from '@flighthq/types/contract';

export type XmlRecord<Key extends string, Value> = Record<Key, Value>;

export function createXmlRecord(): XmlRecord<string, string> {
  return {};
}

export function getXmlRecordValue(record: Readonly<XmlRecord<string, string>>, key: string): string | null {
  const value = record[key];
  return value === undefined ? null : value;
}

export function parseXmlNumberNative(value: string): number | null {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
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
