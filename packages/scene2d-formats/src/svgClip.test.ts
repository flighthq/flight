import { getNodeChildAt } from '@flighthq/node/contract';
import type { ImportDiagnostic, Node2D, XmlElement } from '@flighthq/types/contract';
import { parseXmlDocument } from '@flighthq/xml/contract';
import { describe, expect, it } from 'vitest';

import { usesSvgObjectBoundingBoxUnits } from './svgClip.ts';
import { createScene2DFromSvgDocument } from './svgImport.ts';

describe('applySvgElementClip', () => {
  it('lowers a clip-path reference onto the node clip', () => {
    expect(
      clipped('<clipPath id="c"><rect width="2" height="2"/></clipPath>', 'clip-path="url(#c)"').clip,
    ).not.toBeNull();
  });

  // ★ EVERY ELEMENT IS ASKED, WHICH IS WHY THIS IS NOT A FAMILY YET. An element with no `clip-path` is left alone rather
  // than given an empty region, and that has to hold for a shape as well as a group, since the walk asks both.
  it('leaves an element with no clip-path unclipped', () => {
    expect(clipped('', '').clip).toBeNull();
  });

  // A clip whose reference names nothing is a document defect: the element is reported and left unclipped rather than
  // clipped to nothing, which would silently erase it.
  it('reports an unresolved reference and leaves the element visible', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const node = clipped('', 'clip-path="url(#missing)"', diagnostics);
    expect(node.clip).toBeNull();
    expect(diagnostics.map((entry) => entry.kind)).toContain('svg.unresolved-clip-reference');
  });

  // A `<clipPath>` may itself contain a `use`, which is the second reading of `use` in the importer — the clip's own,
  // with its own recursion guard. What it must do is produce the same region the referenced geometry would.
  it('resolves a use inside a clipPath', () => {
    const defs = '<defs><rect id="r" width="2" height="2"/></defs><clipPath id="c"><use href="#r"/></clipPath>';
    expect(clipped(defs, 'clip-path="url(#c)"').clip).not.toBeNull();
  });
});

describe('usesSvgObjectBoundingBoxUnits', () => {
  // ★ THIS READS `clipPathUnits`, NOT `gradientUnits` — the two are different attributes on different elements, and it
  // lived beside the gradient reader for a while on the strength of the name alone. A bare `<clipPath>` is therefore
  // false: user space is the default for clipping, where a gradient's default is the bounding box.
  it('is true only when clipPathUnits names the bounding box', () => {
    expect(usesSvgObjectBoundingBoxUnits(element('<clipPath clipPathUnits="objectBoundingBox"/>'))).toBe(true);
    expect(usesSvgObjectBoundingBoxUnits(element('<clipPath/>'))).toBe(false);
    expect(usesSvgObjectBoundingBoxUnits(element('<clipPath clipPathUnits="userSpaceOnUse"/>'))).toBe(false);
  });

  it('reads maskContentUnits instead when the element is a mask', () => {
    expect(usesSvgObjectBoundingBoxUnits(element('<mask maskContentUnits="objectBoundingBox"/>'))).toBe(true);
    expect(usesSvgObjectBoundingBoxUnits(element('<mask clipPathUnits="objectBoundingBox"/>'))).toBe(false);
  });
});

function clipped(defs: string, attributes: string, diagnostics?: ImportDiagnostic[]): Node2D {
  const node = getNodeChildAt(
    createScene2DFromSvgDocument(`<svg>${defs}<g ${attributes}><rect width="4" height="4"/></g></svg>`, diagnostics),
    0,
  ) as Node2D | null;
  expect(node).not.toBeNull();
  return node!;
}

function element(xml: string): Readonly<XmlElement> {
  const document = parseXmlDocument(xml);
  expect(document).not.toBeNull();
  return document!;
}
