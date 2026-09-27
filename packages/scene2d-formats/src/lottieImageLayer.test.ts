import type { LottieLayerHandler, LottieLayerKind } from '@flighthq/types/contract';
import { LottieLayerKind as Kind } from '@flighthq/types/contract';
import { SpriteKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { lottieImageLayerHandler } from './lottieImageLayer.ts';
import { createScene2DFromLottieDocument } from './lottieImport.ts';
import { registerLottieLayerHandlers } from './lottieLayerHandlers.ts';
import { createLottieRegistry, getLottieLayerHandler } from './lottieRegistry.ts';
import { findLottieTestNodeByKind } from './lottieTestFixtures.ts';
import { createReadyImageResourceForTest } from './testHelper.ts';

// The registration check the family test also makes, kept here so each layer's test can assert BOTH halves of its
// identity: that the handler behaves, and that the zero-config family installs this exact function for its kind.
function expectRegisteredLayer(kind: LottieLayerKind, handler: LottieLayerHandler): void {
  const registry = createLottieRegistry();
  registerLottieLayerHandlers(registry);
  expect(getLottieLayerHandler(registry, kind)).toBe(handler);
}

// ★ MOVED, NOT REWRITTEN. This assertion lived in the document core's test while this layer's interpretation
// was a one-line shim into the core. It is unchanged: the point of the move is locality, and editing it at the
// same time would make a behaviour change indistinguishable from a relocation.

describe('lottieImageLayerHandler', () => {
  it('is the built-in Image layer handler', () => {
    expectRegisteredLayer(Kind.Image, lottieImageLayerHandler);
  });

  it('creates a sprite for an image layer', () => {
    const image = createReadyImageResourceForTest();
    const result = createScene2DFromLottieDocument(
      {
        assets: [{ h: 10, id: 'img_0', p: 'test.png', u: '', w: 10 }],
        fr: 30,
        h: 100,
        ip: 0,
        layers: [{ ind: 1, ip: 0, nm: 'img', op: 60, refId: 'img_0', ty: 2 }],
        op: 60,
        w: 100,
      },
      undefined,
      { resolveImageResource: () => image },
    );
    expect(findLottieTestNodeByKind(result.root, SpriteKind)).not.toBeNull();
  });
});
