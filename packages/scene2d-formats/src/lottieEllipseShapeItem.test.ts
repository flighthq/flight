import { getNodeChildAt, getNodeChildCount } from '@flighthq/node/contract';
import type { LottieShapeItemHandler, LottieShapeItemKind } from '@flighthq/types/contract';
import { LottieShapeItemKind as Kind } from '@flighthq/types/contract';
import type { LottieDocument, LottieLayer, LottieShapePath, Node2D } from '@flighthq/types/contract';
import { ShapeKind, SpriteKind, TextLabelKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { lottieEllipseShapeItemHandler } from './lottieEllipseShapeItem.ts';
import { createScene2DFromLottieDocument } from './lottieImport.ts';
import { createLottieRegistry, getLottieShapeItemHandler } from './lottieRegistry.ts';
import { registerLottieShapeItemHandlers } from './lottieShapeItemHandlers.ts';
import { createLottieTestDocument, findLottieTestNodeByKind } from './lottieTestFixtures.ts';
import { createReadyImageResourceForTest } from './testHelper.ts';

// The registration check the family test also makes, kept here so each item's test can assert BOTH halves of its
// identity: that the handler behaves, and that the zero-config family installs this exact function for its kind.
function expectRegisteredShapeItem(kind: LottieShapeItemKind, handler: LottieShapeItemHandler): void {
  const registry = createLottieRegistry();
  registerLottieShapeItemHandlers(registry);
  expect(getLottieShapeItemHandler(registry, kind)).toBe(handler);
}

// ★ MOVED, NOT REWRITTEN. These assertions lived beside eight other handlers' while this one's interpretation was a
// one-line shim into the document core. They are unchanged: the point of the move is locality, and editing them at
// the same time would make a behaviour change indistinguishable from a relocation.

describe('lottieEllipseShapeItemHandler', () => {
  it('is the built-in Ellipse shape item handler', () => {
    expectRegisteredShapeItem(Kind.Ellipse, lottieEllipseShapeItemHandler);
  });
});

describe('lottieEllipseShapeItemHandler', () => {
  it('is exercised through createScene2DFromLottieDocument shape layer dispatch', () => {
    const result = createScene2DFromLottieDocument(
      createLottieTestDocument([
        {
          ind: 1,
          ip: 0,
          nm: 'ellipse',
          op: 60,
          shapes: [
            { p: { k: [10, 10] }, s: { k: [20, 20] }, ty: 'el' },
            { c: { k: [1, 0, 0] }, o: { k: 100 }, ty: 'fl' },
          ],
          ty: 4,
        },
      ]),
    );
    const shape = findLottieTestNodeByKind(result.root, ShapeKind);
    expect(shape).not.toBeNull();
  });
});
