import type { LottieLayerHandler, LottieLayerKind } from '@flighthq/types/contract';
import { LottieLayerKind as Kind } from '@flighthq/types/contract';
import { ShapeKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createScene2DFromLottieDocument } from './lottieImport.ts';
import { registerLottieLayerHandlers } from './lottieLayerHandlers.ts';
import { createLottieRegistry, getLottieLayerHandler } from './lottieRegistry.ts';
import { lottieSolidLayerHandler } from './lottieSolidLayer.ts';
import { createLottieTestDocument, findLottieTestNodeByKind } from './lottieTestFixtures.ts';

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

describe('lottieSolidLayerHandler', () => {
  it('is the built-in Solid layer handler', () => {
    expectRegisteredLayer(Kind.Solid, lottieSolidLayerHandler);
  });

  it('creates a solid color shape', () => {
    const result = createScene2DFromLottieDocument(
      createLottieTestDocument([{ ind: 1, ip: 0, nm: 'solid', op: 60, sc: '#ff0000', sh: 50, sw: 50, ty: 1 }]),
    );
    expect(findLottieTestNodeByKind(result.root, ShapeKind)).not.toBeNull();
  });
});
