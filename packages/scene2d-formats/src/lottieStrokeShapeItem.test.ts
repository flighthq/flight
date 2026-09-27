import type { LottieShapeItemHandler, LottieShapeItemKind } from '@flighthq/types/contract';
import { LottieShapeItemKind as Kind, ShapeKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createScene2DFromLottieDocument } from './lottieImport.ts';
import { createLottieRegistry, getLottieShapeItemHandler } from './lottieRegistry.ts';
import { registerLottieShapeItemHandlers } from './lottieShapeItemHandlers.ts';
import { lottieStrokeShapeItemHandler, mapLottieLineCap, mapLottieLineJoin } from './lottieStrokeShapeItem.ts';
import { createLottieTestDocument, findLottieTestNodeByKind } from './lottieTestFixtures.ts';

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

describe('lottieStrokeShapeItemHandler', () => {
  it('is the built-in Stroke shape item handler', () => {
    expectRegisteredShapeItem(Kind.Stroke, lottieStrokeShapeItemHandler);
  });

  it('creates a stroke paint from a st shape item', () => {
    const result = createScene2DFromLottieDocument(
      createLottieTestDocument([
        {
          ind: 1,
          ip: 0,
          nm: 'stroke',
          op: 60,
          shapes: [
            { p: { k: [10, 10] }, r: { k: 0 }, s: { k: [20, 20] }, ty: 'rc' },
            { c: { k: [0, 0, 1] }, o: { k: 100 }, ty: 'st', w: { k: 2 } },
          ],
          ty: 4,
        },
      ]),
    );
    expect(findLottieTestNodeByKind(result.root, ShapeKind)).not.toBeNull();
  });
});

// ★ SHARED WITH THE GRADIENT STROKE, which is why these two are exported rather than private to the stroke reader.
// The codes are the format's, and the defaults are what an export that omits `lc`/`lj` means — not our preference.
describe('mapLottieLineCap', () => {
  it('maps each cap code and defaults an absent one to none', () => {
    expect(mapLottieLineCap(1)).toBe('none');
    expect(mapLottieLineCap(2)).toBe('round');
    expect(mapLottieLineCap(3)).toBe('square');
    expect(mapLottieLineCap(undefined)).toBe('none');
  });
});

describe('mapLottieLineJoin', () => {
  it('maps each join code and defaults an absent one to miter', () => {
    expect(mapLottieLineJoin(1)).toBe('miter');
    expect(mapLottieLineJoin(2)).toBe('round');
    expect(mapLottieLineJoin(3)).toBe('bevel');
    expect(mapLottieLineJoin(undefined)).toBe('miter');
  });
});
