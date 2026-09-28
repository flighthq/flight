import { getNodeChildAt, getNodeChildCount } from '@flighthq/node/contract';
import type { SvgElementHandler, SvgElementKind } from '@flighthq/types/contract';
import { SvgElementKind as Kind } from '@flighthq/types/contract';
import { SpriteKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { registerSvgElementHandlers } from './svgElementHandlers.ts';
import { svgImageElementHandler } from './svgImageElement.ts';
import { createScene2DFromSvgDocument } from './svgImport.ts';
import { createSvgRegistry, getSvgElementHandler } from './svgRegistry.ts';
import { createReadyImageResourceForTest } from './testHelper.ts';

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

describe('svgImageElementHandler', () => {
  it('is the built-in Image element handler', () => {
    expectRegisteredElement(Kind.Image, svgImageElementHandler);
  });

  it('is exercised through createScene2DFromSvgDocument for image elements', () => {
    const image = createReadyImageResourceForTest();
    const root = createScene2DFromSvgDocument('<svg><image href="test.png" width="10" height="10"/></svg>', undefined, {
      resolveImageResource: () => image,
    });
    const bitmap = getNodeChildAt(root, 0);
    expect(bitmap).not.toBeNull();
    expect(bitmap!.kind).toBe(SpriteKind);
  });
});
