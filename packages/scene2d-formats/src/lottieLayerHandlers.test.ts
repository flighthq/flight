import type { LottieLayerHandler, LottieLayerKind } from '@flighthq/types/contract';
import { LottieLayerKind as Kind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  lottieAllLayerHandlers,
  lottieImageLayerHandler,
  lottieNullLayerHandler,
  lottiePrecompositionLayerHandler,
  lottieShapeLayerHandler,
  lottieSolidLayerHandler,
  lottieTextLayerHandler,
  registerLottieLayerHandlers,
} from './lottieLayerHandlers.ts';
import { createLottieRegistry, getLottieLayerHandler } from './lottieRegistry.ts';

function expectRegisteredLayer(kind: LottieLayerKind, handler: LottieLayerHandler): void {
  const registry = createLottieRegistry();
  registerLottieLayerHandlers(registry);
  expect(getLottieLayerHandler(registry, kind)).toBe(handler);
}

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

describe('lottieImageLayerHandler', () => {
  it('is the built-in Image layer handler', () => {
    expectRegisteredLayer(Kind.Image, lottieImageLayerHandler);
  });
});

describe('lottieNullLayerHandler', () => {
  it('is the built-in Null layer handler', () => {
    expectRegisteredLayer(Kind.Null, lottieNullLayerHandler);
  });
});

describe('lottiePrecompositionLayerHandler', () => {
  it('is the built-in Precomposition layer handler', () => {
    expectRegisteredLayer(Kind.Precomposition, lottiePrecompositionLayerHandler);
  });
});

describe('lottieShapeLayerHandler', () => {
  it('is the built-in Shape layer handler', () => {
    expectRegisteredLayer(Kind.Shape, lottieShapeLayerHandler);
  });
});

describe('lottieSolidLayerHandler', () => {
  it('is the built-in Solid layer handler', () => {
    expectRegisteredLayer(Kind.Solid, lottieSolidLayerHandler);
  });
});

describe('lottieTextLayerHandler', () => {
  it('is the built-in Text layer handler', () => {
    expectRegisteredLayer(Kind.Text, lottieTextLayerHandler);
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
