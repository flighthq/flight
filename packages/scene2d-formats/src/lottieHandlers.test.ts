import { describe, expect, it } from 'vitest';

import { registerAllLottieHandlers } from './lottieHandlers.ts';
import { registerLottieLayerHandlers } from './lottieLayerHandlers.ts';
import { createLottieRegistry } from './lottieRegistry.ts';
import { registerLottieShapeItemHandlers } from './lottieShapeItemHandlers.ts';

describe('registerAllLottieHandlers', () => {
  it('registers both handler families', () => {
    const registry = createLottieRegistry();
    registerAllLottieHandlers(registry);
    const layers = createLottieRegistry();
    registerLottieLayerHandlers(layers);
    const shapeItems = createLottieRegistry();
    registerLottieShapeItemHandlers(shapeItems);
    expect(registry.layerHandlers).toEqual(layers.layerHandlers);
    expect(registry.shapeItemHandlers).toEqual(shapeItems.shapeItemHandlers);
  });
});
