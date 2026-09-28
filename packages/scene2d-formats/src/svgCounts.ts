import type { XmlElement } from '@flighthq/types/contract';
import { SvgClipKind, SvgElementKind } from '@flighthq/types/contract';
import { parseXmlDocument } from '@flighthq/xml/contract';

export function collectSvgCounts(source: string): Map<string, number> | null {
  const document = parseXmlDocument(source);
  if (document === null || svgLocalName(document.name) !== 'svg') return null;
  const counts = new Map<string, number>();
  tallyElements(counts, document);
  return counts;
}

function elementKindName(name: string): string | null {
  switch (name) {
    case 'a':
    case 'g':
    case 'svg':
    case 'switch':
      return SvgElementKind.Container;
    case 'circle':
    case 'ellipse':
    case 'line':
    case 'path':
    case 'polygon':
    case 'polyline':
    case 'rect':
      return SvgElementKind.Geometry;
    case 'image':
      return SvgElementKind.Image;
    case 'text':
      return SvgElementKind.Text;
    case 'use':
      return SvgElementKind.Use;
    default:
      return null;
  }
}

function svgLocalName(name: string): string {
  const colon = name.indexOf(':');
  return colon === -1 ? name : name.slice(colon + 1);
}

/**
 * Tallies what a document asks for, element by element.
 *
 * ★ CLIPPING IS COUNTED AS AN ATTRIBUTE, NOT AN ELEMENT, because that is where a document asks for it. A `<clipPath>`
 * that nothing references costs nothing — it is a definition, like an unreferenced gradient — while `clip-path` on any
 * element is the request that needs the clip family registered. `mask` counts the same way: Flight lowers it onto the
 * same hard region, so it needs the same reader.
 */
function tallyElements(counts: Map<string, number>, element: Readonly<XmlElement>): void {
  const kind = elementKindName(svgLocalName(element.name));
  if (kind !== null) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  if (element.attributes['clip-path'] !== undefined || element.attributes.mask !== undefined) {
    counts.set(SvgClipKind.Path, (counts.get(SvgClipKind.Path) ?? 0) + 1);
  }
  for (const child of element.children) {
    tallyElements(counts, child);
  }
}
