import { getNodeChildAt, getNodeChildCount } from '@flighthq/node/contract';
import type { SvgElementHandler, SvgElementKind } from '@flighthq/types/contract';
import { SvgElementKind as Kind } from '@flighthq/types/contract';
import { ShapeKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { registerSvgElementHandlers } from './svgElementHandlers.ts';
import { svgGeometryElementHandler } from './svgGeometryElement.ts';
import { createScene2DFromSvgDocument } from './svgImport.ts';
import { createSvgRegistry, getSvgElementHandler } from './svgRegistry.ts';

// The registration check the family test also makes, kept here so each element's test can assert BOTH halves of its
// identity: that the handler behaves, and that the zero-config family installs this exact function for its kind.
function expectRegisteredElement(kind: SvgElementKind, handler: SvgElementHandler): void {
  const registry = createSvgRegistry();
  registerSvgElementHandlers(registry);
  expect(getSvgElementHandler(registry, kind)).toBe(handler);
}

// ★ MOVED, NOT REWRITTEN. This assertion lived in the document core's test while this element's interpretation was a
// one-line shim into that core. It is unchanged: the point of the move is locality, and editing it at the same time
// would make a behaviour change indistinguishable from a relocation.

describe('svgGeometryElementHandler', () => {
  it('is the built-in Geometry element handler', () => {
    expectRegisteredElement(Kind.Geometry, svgGeometryElementHandler);
  });

  it('is exercised through createScene2DFromSvgDocument for rect elements', () => {
    const root = createScene2DFromSvgDocument('<svg><rect width="10" height="10"/></svg>');
    const shape = getNodeChildAt(root, 0);
    expect(shape).not.toBeNull();
    expect(shape!.kind).toBe(ShapeKind);
  });
});
