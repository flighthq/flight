import { getNodeChildAt, getNodeChildCount } from '@flighthq/node/contract';
import type { LottieShapeItemHandler, LottieShapeItemKind } from '@flighthq/types/contract';
import { LottieShapeItemKind as Kind } from '@flighthq/types/contract';
import type { LottieDocument, LottieLayer, LottieShapePath, Node2D } from '@flighthq/types/contract';
import { ShapeKind, SpriteKind, TextLabelKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  lottieGradientFillShapeItemHandler,
  lottieGradientStrokeShapeItemHandler,
} from './lottieGradientShapeItems.ts';
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

describe('lottieGradientFillShapeItemHandler', () => {
  it('is the built-in GradientFill shape item handler', () => {
    expectRegisteredShapeItem(Kind.GradientFill, lottieGradientFillShapeItemHandler);
  });
});

describe('lottieGradientFillShapeItemHandler', () => {
  it('creates a gradient fill paint', () => {
    const result = createScene2DFromLottieDocument(
      createLottieTestDocument([
        {
          ind: 1,
          ip: 0,
          nm: 'gfill',
          op: 60,
          shapes: [
            { p: { k: [10, 10] }, r: { k: 0 }, s: { k: [20, 20] }, ty: 'rc' },
            {
              e: { k: [100, 0] },
              g: { k: { k: [0, 1, 0, 0, 1, 0, 0, 1] }, p: 2 },
              s: { k: [0, 0] },
              t: 1,
              ty: 'gf',
            },
          ],
          ty: 4,
        },
      ]),
    );
    expect(findLottieTestNodeByKind(result.root, ShapeKind)).not.toBeNull();
  });
});

describe('lottieGradientStrokeShapeItemHandler', () => {
  it('is the built-in GradientStroke shape item handler', () => {
    expectRegisteredShapeItem(Kind.GradientStroke, lottieGradientStrokeShapeItemHandler);
  });
});

describe('lottieGradientStrokeShapeItemHandler', () => {
  it('creates a gradient stroke paint', () => {
    const result = createScene2DFromLottieDocument(
      createLottieTestDocument([
        {
          ind: 1,
          ip: 0,
          nm: 'gstroke',
          op: 60,
          shapes: [
            { p: { k: [10, 10] }, r: { k: 0 }, s: { k: [20, 20] }, ty: 'rc' },
            {
              e: { k: [100, 0] },
              g: { k: { k: [0, 1, 0, 0, 1, 0, 0, 1] }, p: 2 },
              o: { k: 100 },
              s: { k: [0, 0] },
              t: 1,
              ty: 'gs',
              w: { k: 2 },
            },
          ],
          ty: 4,
        },
      ]),
    );
    expect(findLottieTestNodeByKind(result.root, ShapeKind)).not.toBeNull();
  });
});
