// Generated from crates/flight-xml/src/xml_query.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { XmlElement } from './types.ts';
import { getXmlRecordValue, parseXmlNumberNative, xmlTrim } from './xmlNative.ts';

/**
 * The attribute value for `name`, or None when the element has no such attribute.
 */
export function getXmlElementAttribute(element: Readonly<XmlElement>, name: string): string | null {
  return getXmlRecordValue(element.attributes, name);
}

/**
 * The attribute value for `name` parsed as a number, or None when the
 * attribute is absent or does not parse to a finite number.
 */
export function getXmlElementAttributeNumber(element: Readonly<XmlElement>, name: string): number | null {
  const value = getXmlRecordValue(element.attributes, name);
  if (value === null) {
    return null;
  }
  if (xmlTrim(value).length === 0) {
    return null;
  }
  const parsed = parseXmlNumberNative(value);
  if (parsed === null) {
    return null;
  }
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return null;
}

/**
 * The first direct child element with tag name `name`, or None when none matches.
 * Returns a cloned shared handle, so the caller keeps the node alive independently.
 */
export function getXmlElementChildByName(element: Readonly<XmlElement>, name: string): XmlElement | null {
  for (const child of element.children) {
    if (child!.name === name) {
      return child;
    }
  }
  return null;
}

/**
 * All direct child elements with tag name `name`, in document order (empty when none match).
 * Returns cloned shared handles, so the caller keeps the nodes alive independently.
 */
export function getXmlElementChildrenByName(element: Readonly<XmlElement>, name: string): XmlElement[] {
  let out: XmlElement[] = [] as never[];
  for (const child of element.children) {
    if (child!.name === name) {
      out.push(child);
    }
  }
  return out;
}
