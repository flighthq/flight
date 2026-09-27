import { LottieLayerKind as Kind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { lottieImageLayerHandler } from './lottieImageLayer.ts';
import { lottieAllLayerHandlers, registerLottieLayerHandlers } from './lottieLayerHandlers.ts';
import { lottieNullLayerHandler } from './lottieNullLayer.ts';
import { lottiePrecompositionLayerHandler } from './lottiePrecompositionLayer.ts';
import { createLottieRegistry } from './lottieRegistry.ts';
import { lottieShapeLayerHandler } from './lottieShapeLayer.ts';
import { lottieSolidLayerHandler } from './lottieSolidLayer.ts';
import { lottieTextLayerHandler } from './lottieTextLayer.ts';

// Each handler's own test asserts that the preset installs it for its kind. What is left here is what only the family
// can answer: that the family is exactly these six and that installing it touches no other registry.
describe('lottieAllLayerHandlers', () => {
  it('contains every built-in layer handler', () => {
    expect(lottieAllLayerHandlers).toContain(lottieImageLayerHandler);
    expect(lottieAllLayerHandlers).toContain(lottieNullLayerHandler);
    expect(lottieAllLayerHandlers).toContain(lottiePrecompositionLayerHandler);
    expect(lottieAllLayerHandlers).toContain(lottieShapeLayerHandler);
    expect(lottieAllLayerHandlers).toContain(lottieSolidLayerHandler);
    expect(lottieAllLayerHandlers).toContain(lottieTextLayerHandler);
    expect(lottieAllLayerHandlers).toHaveLength(6);
  });
});

describe('registerLottieLayerHandlers', () => {
  it('registers exactly one handler for every layer kind and no shape item handlers', () => {
    const registry = createLottieRegistry();
    registerLottieLayerHandlers(registry);
    expect(registry.layerHandlers.map((entry) => entry.kind).sort()).toEqual(Object.values(Kind).sort());
    expect(registry.shapeItemHandlers).toEqual([]);
  });
});
