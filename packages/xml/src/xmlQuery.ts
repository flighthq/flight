// Read-only query helpers over a parsed XmlElement tree, so consumers stop
// hand-filtering `children` and `attributes` at every call site. All lookups
// return a sentinel (null) rather than throwing when the name is absent.

import type { XmlElement } from './xmlParse';

/** The attribute value for `name`, or null when the element has no such attribute. */
export function getXmlElementAttribute(element: Readonly<XmlElement>, name: string): string | null {
  const value = element.attributes[name];
  return value !== undefined ? value : null;
}

/** The attribute value for `name` parsed as a number, or null when the
 *  attribute is absent or does not parse to a finite number. */
export function getXmlElementAttributeNumber(element: Readonly<XmlElement>, name: string): number | null {
  const value = element.attributes[name];
  if (value === undefined || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** The first direct child element with tag name `name`, or null when none matches. */
export function getXmlElementChildByName(element: Readonly<XmlElement>, name: string): XmlElement | null {
  for (const child of element.children) {
    if (child.name === name) return child;
  }
  return null;
}

/** All direct child elements with tag name `name`, in document order (empty when none match). */
export function getXmlElementChildrenByName(element: Readonly<XmlElement>, name: string): XmlElement[] {
  return element.children.filter((child) => child.name === name);
}
