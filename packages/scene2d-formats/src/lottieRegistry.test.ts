import type { LottieLayerHandler, LottieShapeItemHandler } from '@flighthq/types/contract';
import { LottieLayerKind, LottieShapeItemKind } from '@flighthq/types/contract';

import {
  createLottieRegistry,
  getLottieLayerHandler,
  getLottieShapeItemHandler,
  registerLottieLayerHandler,
  registerLottieShapeItemHandler,
  unregisterLottieLayerHandler,
  unregisterLottieShapeItemHandler,
} from './lottieRegistry.ts';

describe('createLottieRegistry', () => {
  it('creates independent empty registries', () => {
    const first = createLottieRegistry();
    const second = createLottieRegistry();
    expect(first.layerHandlers).toEqual([]);
    expect(first.shapeItemHandlers).toEqual([]);
    registerLottieLayerHandler(first, LottieLayerKind.Shape, () => {});
    expect(first.layerHandlers).toHaveLength(1);
    expect(second.layerHandlers).toEqual([]);
  });
});

describe('getLottieLayerHandler', () => {
  it('returns null for an unregistered layer kind', () => {
    expect(getLottieLayerHandler(createLottieRegistry(), LottieLayerKind.Shape)).toBeNull();
  });
});

describe('getLottieShapeItemHandler', () => {
  it('returns null for an unregistered shape item kind', () => {
    expect(getLottieShapeItemHandler(createLottieRegistry(), LottieShapeItemKind.Fill)).toBeNull();
  });
});

describe('registerLottieLayerHandler', () => {
  it('is last-write-wins without moving the registered key', () => {
    const registry = createLottieRegistry();
    const first: LottieLayerHandler = () => {};
    const second: LottieLayerHandler = () => {};
    registerLottieLayerHandler(registry, LottieLayerKind.Shape, first);
    registerLottieLayerHandler(registry, LottieLayerKind.Shape, second);
    expect(registry.layerHandlers).toHaveLength(1);
    expect(getLottieLayerHandler(registry, LottieLayerKind.Shape)).toBe(second);
  });

  it('accepts extensions outside the built-in layer vocabulary', () => {
    const registry = createLottieRegistry();
    const handler: LottieLayerHandler = () => {};
    registerLottieLayerHandler(registry, 99, handler);
    expect(getLottieLayerHandler(registry, 99)).toBe(handler);
  });
});

describe('registerLottieShapeItemHandler', () => {
  it('is last-write-wins without moving the registered key', () => {
    const registry = createLottieRegistry();
    const first: LottieShapeItemHandler = () => {};
    const second: LottieShapeItemHandler = () => {};
    registerLottieShapeItemHandler(registry, LottieShapeItemKind.Fill, first);
    registerLottieShapeItemHandler(registry, LottieShapeItemKind.Fill, second);
    expect(registry.shapeItemHandlers).toHaveLength(1);
    expect(getLottieShapeItemHandler(registry, LottieShapeItemKind.Fill)).toBe(second);
  });

  it('accepts extensions outside the built-in shape item vocabulary', () => {
    const registry = createLottieRegistry();
    const handler: LottieShapeItemHandler = () => {};
    registerLottieShapeItemHandler(registry, 'vendorShape', handler);
    expect(getLottieShapeItemHandler(registry, 'vendorShape')).toBe(handler);
  });
});

describe('unregisterLottieLayerHandler', () => {
  it('removes only a present layer handler', () => {
    const registry = createLottieRegistry();
    registerLottieLayerHandler(registry, LottieLayerKind.Shape, () => {});
    expect(unregisterLottieLayerHandler(registry, LottieLayerKind.Shape)).toBe(true);
    expect(unregisterLottieLayerHandler(registry, LottieLayerKind.Shape)).toBe(false);
  });
});

describe('unregisterLottieShapeItemHandler', () => {
  it('removes only a present shape item handler', () => {
    const registry = createLottieRegistry();
    registerLottieShapeItemHandler(registry, LottieShapeItemKind.Fill, () => {});
    expect(unregisterLottieShapeItemHandler(registry, LottieShapeItemKind.Fill)).toBe(true);
    expect(unregisterLottieShapeItemHandler(registry, LottieShapeItemKind.Fill)).toBe(false);
  });
});
