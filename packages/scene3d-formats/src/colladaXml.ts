import type { XmlElement } from '@flighthq/types/contract';

export function colladaChild(element: XmlElement | undefined, name: string): XmlElement | undefined {
  return element?.children.find((entry) => entry.name === name || entry.name.endsWith(`:${name}`));
}

export function colladaChildren(element: XmlElement | undefined, name: string): XmlElement[] {
  if (element === undefined) return [];
  return element.children.filter((entry) => entry.name === name || entry.name.endsWith(`:${name}`));
}

export function colladaDescendants(element: XmlElement, name: string): XmlElement[] {
  const out: XmlElement[] = [];
  walkColladaElement(element, (e) => {
    if (e.name === name || e.name.endsWith(`:${name}`)) out.push(e);
  });
  return out;
}

export function colladaIdOf(element: XmlElement): string | null {
  return element.attributes.id ?? null;
}

export function colladaLocalName(element: XmlElement): string {
  const colon = element.name.indexOf(':');
  return colon >= 0 ? element.name.slice(colon + 1) : element.name;
}

export function colladaNumbers(element: XmlElement | undefined): number[] {
  return element?.text.trim().split(/\s+/).filter(Boolean).map(Number).filter(Number.isFinite) ?? [];
}

export function colladaText(element: XmlElement | undefined, name: string): string | null {
  return colladaChild(element, name)?.text.trim() || null;
}

export function parseColladaFloats(text: string): number[] {
  const parts = text.trim().split(/\s+/);
  const result: number[] = [];
  for (let i = 0; i < parts.length; i++) {
    const v = Number(parts[i]);
    if (!Number.isFinite(v)) continue;
    result.push(v);
  }
  return result;
}

export function walkColladaElement(element: XmlElement, visit: (entry: XmlElement) => void): void {
  visit(element);
  for (const entry of element.children) walkColladaElement(entry, visit);
}
