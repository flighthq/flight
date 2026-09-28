import type { XmlElement } from '@flighthq/types/contract';

export function parseSvgCoordinate(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return value.trim().endsWith('%') ? parsed / 100 : parsed;
}

export function parseSvgCssNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : fallback;
}

export function parseSvgLength(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseSvgNumberList(value: string): number[] {
  const matches = value.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi);
  return matches?.map(Number) ?? [];
}

export function parseUrlReference(value: string | null): string | null {
  if (value === null) return null;
  const match = /^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)$/.exec(value.trim());
  return match?.[1] ?? null;
}

/**
 * Reading numbers, names and references out of an SVG element's attributes.
 *
 * ★ BEDROCK EVERY SVG FEATURE STANDS ON, which is why it is one module and not part of any of them. A geometry
 * element's `x`, a gradient's `href`, a `use`'s offset and a text run's `dx` are the same three questions asked of
 * different attributes, and each of the five element families would otherwise carry its own copy of the answer.
 *
 * `svgLocalName` drops the namespace prefix because SVG in the wild is written both ways — `<svg:rect>` and `<rect>` are
 * the same element — and every dispatch in this importer keys on the local name.
 */
export function svgAttribute(element: Readonly<XmlElement>, name: string): string | null {
  return element.attributes[name] ?? element.attributes[`xlink:${name}`] ?? null;
}

export function svgFirstNumber(value: string | null, fallback: number): number {
  return parseSvgNumberList(value ?? '')[0] ?? fallback;
}

export function svgLocalName(name: string): string {
  const colon = name.indexOf(':');
  return colon === -1 ? name : name.slice(colon + 1);
}

export function svgNumberAttribute(element: Readonly<XmlElement>, name: string, fallback: number): number {
  return parseSvgLength(svgAttribute(element, name), fallback);
}

export function svgOptionalNumberAttribute(element: Readonly<XmlElement>, name: string): number | null {
  const value = svgAttribute(element, name);
  if (value === null) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function visitSvgElements(
  element: Readonly<XmlElement>,
  visitor: (element: Readonly<XmlElement>) => void,
): void {
  visitor(element);
  for (const child of element.children) visitSvgElements(child, visitor);
}
