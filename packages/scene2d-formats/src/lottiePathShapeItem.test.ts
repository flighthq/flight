import { getNodeChildAt, getNodeChildCount } from '@flighthq/node/contract';
import type { LottieShapeItemHandler, LottieShapeItemKind } from '@flighthq/types/contract';
import { LottieShapeItemKind as Kind } from '@flighthq/types/contract';
import type { LottieDocument, LottieLayer, LottieShapePath, Node2D } from '@flighthq/types/contract';
import { ShapeKind, SpriteKind, TextLabelKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createScene2DFromLottieDocument } from './lottieImport.ts';
import { lottiePathShapeItemHandler } from './lottiePathShapeItem.ts';
import { createLottieRegistry, getLottieShapeItemHandler } from './lottieRegistry.ts';
import { registerLottieShapeItemHandlers } from './lottieShapeItemHandlers.ts';
import { createLottieTestDocument, findLottieTestNodeByKind, lottieTestSquarePath } from './lottieTestFixtures.ts';
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

describe('lottiePathShapeItemHandler', () => {
  it('is the built-in Path shape item handler', () => {
    expectRegisteredShapeItem(Kind.Path, lottiePathShapeItemHandler);
  });
});

describe('lottiePathShapeItemHandler', () => {
  it('creates a path from a sh shape item', () => {
    const result = createScene2DFromLottieDocument(
      createLottieTestDocument([
        {
          ind: 1,
          ip: 0,
          nm: 'path',
          op: 60,
          shapes: [
            { ks: { k: lottieTestSquarePath(0, 0, 10) }, ty: 'sh' },
            { c: { k: [1, 0, 0] }, o: { k: 100 }, ty: 'fl' },
          ],
          ty: 4,
        },
      ]),
    );
    expect(findLottieTestNodeByKind(result.root, ShapeKind)).not.toBeNull();
  });
});
