import type { LottieShapeItemHandler, LottieShapeItemKind } from '@flighthq/types/contract';
import { LottieShapeItemKind as Kind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createLottieRegistry, getLottieShapeItemHandler } from './lottieRegistry.ts';
import {
  lottieAllShapeItemHandlers,
  lottieEllipseShapeItemHandler,
  lottieFillShapeItemHandler,
  lottieGradientFillShapeItemHandler,
  lottieGradientStrokeShapeItemHandler,
  lottiePathShapeItemHandler,
  lottiePolystarShapeItemHandler,
  lottieRectangleShapeItemHandler,
  lottieStrokeShapeItemHandler,
  lottieTrimPathShapeItemHandler,
  registerLottieShapeItemHandlers,
} from './lottieShapeItemHandlers.ts';

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

describe('lottieEllipseShapeItemHandler', () => {
  it('is the built-in Ellipse shape item handler', () => {
    expectRegisteredShapeItem(Kind.Ellipse, lottieEllipseShapeItemHandler);
  });
});

describe('lottieFillShapeItemHandler', () => {
  it('is the built-in Fill shape item handler', () => {
    expectRegisteredShapeItem(Kind.Fill, lottieFillShapeItemHandler);
  });
});

describe('lottieGradientFillShapeItemHandler', () => {
  it('is the built-in GradientFill shape item handler', () => {
    expectRegisteredShapeItem(Kind.GradientFill, lottieGradientFillShapeItemHandler);
  });
});

describe('lottieGradientStrokeShapeItemHandler', () => {
  it('is the built-in GradientStroke shape item handler', () => {
    expectRegisteredShapeItem(Kind.GradientStroke, lottieGradientStrokeShapeItemHandler);
  });
});

describe('lottiePathShapeItemHandler', () => {
  it('is the built-in Path shape item handler', () => {
    expectRegisteredShapeItem(Kind.Path, lottiePathShapeItemHandler);
  });
});

describe('lottiePolystarShapeItemHandler', () => {
  it('is the built-in Polystar shape item handler', () => {
    expectRegisteredShapeItem(Kind.Polystar, lottiePolystarShapeItemHandler);
  });
});

describe('lottieRectangleShapeItemHandler', () => {
  it('is the built-in Rectangle shape item handler', () => {
    expectRegisteredShapeItem(Kind.Rectangle, lottieRectangleShapeItemHandler);
  });
});

describe('lottieStrokeShapeItemHandler', () => {
  it('is the built-in Stroke shape item handler', () => {
    expectRegisteredShapeItem(Kind.Stroke, lottieStrokeShapeItemHandler);
  });
});

describe('lottieTrimPathShapeItemHandler', () => {
  it('is the built-in TrimPath shape item handler', () => {
    expectRegisteredShapeItem(Kind.TrimPath, lottieTrimPathShapeItemHandler);
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
