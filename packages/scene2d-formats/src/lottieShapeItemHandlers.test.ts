import type { LottieShapeItemHandler, LottieShapeItemKind } from '@flighthq/types/contract';
import { LottieShapeItemKind as Kind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { lottieEllipseShapeItemHandler } from './lottieEllipseShapeItem.ts';
import { lottieFillShapeItemHandler } from './lottieFillShapeItem.ts';
import {
  lottieGradientFillShapeItemHandler,
  lottieGradientStrokeShapeItemHandler,
} from './lottieGradientShapeItems.ts';
import { lottiePathShapeItemHandler } from './lottiePathShapeItem.ts';
import { lottiePolystarShapeItemHandler } from './lottiePolystarShapeItem.ts';
import { lottieRectangleShapeItemHandler } from './lottieRectangleShapeItem.ts';
import { createLottieRegistry, getLottieShapeItemHandler } from './lottieRegistry.ts';
import { lottieAllShapeItemHandlers, registerLottieShapeItemHandlers } from './lottieShapeItemHandlers.ts';
import { lottieStrokeShapeItemHandler } from './lottieStrokeShapeItem.ts';
import { lottieTrimPathShapeItemHandler } from './lottieTrimPathShapeItem.ts';

function expectRegisteredShapeItem(kind: LottieShapeItemKind, handler: LottieShapeItemHandler): void {
  const registry = createLottieRegistry();
  registerLottieShapeItemHandlers(registry);
  expect(getLottieShapeItemHandler(registry, kind)).toBe(handler);
}

describe('lottieAllShapeItemHandlers', () => {
  it('contains every built-in shape item handler', () => {
    expect(lottieAllShapeItemHandlers).toContain(lottieEllipseShapeItemHandler);
    expect(lottieAllShapeItemHandlers).toContain(lottieFillShapeItemHandler);
    expect(lottieAllShapeItemHandlers).toContain(lottieGradientFillShapeItemHandler);
    expect(lottieAllShapeItemHandlers).toContain(lottieGradientStrokeShapeItemHandler);
    expect(lottieAllShapeItemHandlers).toContain(lottiePathShapeItemHandler);
    expect(lottieAllShapeItemHandlers).toContain(lottiePolystarShapeItemHandler);
    expect(lottieAllShapeItemHandlers).toContain(lottieRectangleShapeItemHandler);
    expect(lottieAllShapeItemHandlers).toContain(lottieStrokeShapeItemHandler);
    expect(lottieAllShapeItemHandlers).toContain(lottieTrimPathShapeItemHandler);
    expect(lottieAllShapeItemHandlers).toHaveLength(9);
  });
});

describe('registerLottieShapeItemHandlers', () => {
  it('registers exactly one handler for every shape item kind and no layer handlers', () => {
    const registry = createLottieRegistry();
    registerLottieShapeItemHandlers(registry);
    expect(registry.shapeItemHandlers.map((entry) => entry.kind).sort()).toEqual(Object.values(Kind).sort());
    expect(registry.layerHandlers).toEqual([]);
  });
});
