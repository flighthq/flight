import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  createWebGlyphRasterizerBackend,
  initializeWebGlyphRasterizerBackend,
  webHostGlyphRasterizer,
} from './webGlyphRasterizer';

describe('createWebGlyphRasterizerBackend', () => {
  it('constructs a backend with rasterize and measureMetrics', () => {
    const backend = createWebGlyphRasterizerBackend();
    expect(backend.rasterize).toBeTypeOf('function');
    expect(backend.measureMetrics).toBeTypeOf('function');
  });

  it('constructs an identity-bearing provider Entity', () => {
    expect(EntityRuntimeKey in createWebGlyphRasterizerBackend()).toBe(true);
  });

  it('returns distinct instances on each call', () => {
    expect(createWebGlyphRasterizerBackend()).not.toBe(createWebGlyphRasterizerBackend());
  });

  it('rasterize returns null when no canvas context is available', () => {
    const backend = createWebGlyphRasterizerBackend();
    const saved = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
    try {
      expect(backend.rasterize(65, { fontFamily: 'x', fontSize: 16 })).toBeNull();
    } finally {
      HTMLCanvasElement.prototype.getContext = saved;
    }
  });

  it('measureMetrics returns null when no canvas context is available', () => {
    const backend = createWebGlyphRasterizerBackend();
    const saved = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
    try {
      expect(backend.measureMetrics!({ fontFamily: 'x', fontSize: 16 })).toBeNull();
    } finally {
      HTMLCanvasElement.prototype.getContext = saved;
    }
  });
});

describe('initializeWebGlyphRasterizerBackend', () => {
  it('is the construction initializer of createWebGlyphRasterizerBackend', () => {
    expect(typeof initializeWebGlyphRasterizerBackend).toBe('function');
  });
});
describe('webHostGlyphRasterizer', () => {
  it('is an Entity with rasterize and measureMetrics', () => {
    expect(EntityRuntimeKey in webHostGlyphRasterizer).toBe(true);
    expect(webHostGlyphRasterizer.rasterize).toBeTypeOf('function');
    expect(webHostGlyphRasterizer.measureMetrics).toBeTypeOf('function');
  });

  it('is a stable singleton', () => {
    expect(webHostGlyphRasterizer).toBe(webHostGlyphRasterizer);
  });
});
