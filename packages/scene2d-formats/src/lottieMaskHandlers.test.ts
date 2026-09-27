import { LottieMaskKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { lottieAdditiveMaskHandler } from './lottieMask.ts';
import { lottieAllMaskHandlers, registerLottieMaskHandlers } from './lottieMaskHandlers.ts';
import { createLottieRegistry } from './lottieRegistry.ts';

// The handler's own test asserts that the preset installs it for its mode. What is left here is what only the family
// can answer: that the family is exactly this one member and that installing it touches no other registry.
describe('lottieAllMaskHandlers', () => {
  it('contains every built-in mask handler', () => {
    expect(lottieAllMaskHandlers).toEqual([lottieAdditiveMaskHandler]);
  });
});

describe('registerLottieMaskHandlers', () => {
  // ★ THE FAMILY IS DELIBERATELY NARROWER THAN THE FORMAT. Lottie declares seven mask modes; Flight carries one, so
  // the registrar installs one entry and the other six resolve to no handler. Asserting the absence is what keeps a
  // future half-written mode from registering itself before it works.
  it('registers the additive mode alone, and no layer or shape item handlers', () => {
    const registry = createLottieRegistry();
    registerLottieMaskHandlers(registry);
    expect(registry.maskHandlers.map((entry) => entry.kind)).toEqual([LottieMaskKind.Additive]);
    expect(registry.layerHandlers).toEqual([]);
    expect(registry.shapeItemHandlers).toEqual([]);
  });
});
