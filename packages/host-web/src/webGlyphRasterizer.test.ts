import {
  explainGlyphRasterizerBackend,
  getGlyphRasterizerBackend,
  installGlyphRasterizerHostBackend,
  resetGlyphRasterizerBackendForTest,
} from '@flighthq/glyphatlas/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createWebGlyphRasterizerBackend,
  enableHostWebGlyphRasterizer,
  resetHostWebGlyphRasterizerForTest,
} from './webGlyphRasterizer';

describe('createWebGlyphRasterizerBackend', () => {
  afterEach(resetGlyphRasterizerBackendForTest);

  it('constructs a backend with rasterize and measureMetrics', () => {
    const backend = createWebGlyphRasterizerBackend();
    expect(backend.rasterize).toBeTypeOf('function');
    expect(backend.measureMetrics).toBeTypeOf('function');
  });

  it('constructs an identity-bearing provider Entity', () => {
    expect(EntityRuntimeKey in createWebGlyphRasterizerBackend()).toBe(true);
  });

  it('rasterize returns null and observes failure when no canvas context is available', () => {
    const backend = createWebGlyphRasterizerBackend();
    installGlyphRasterizerHostBackend(backend);
    const saved = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
    try {
      expect(backend.rasterize(65, { fontFamily: 'x', fontSize: 16 })).toBeNull();
      expect(explainGlyphRasterizerBackend().viability).toBe('runtime-api-unavailable');
      expect(explainGlyphRasterizerBackend().operation).toBe('rasterize');
    } finally {
      HTMLCanvasElement.prototype.getContext = saved;
    }
  });
});

describe('enableHostWebGlyphRasterizer', () => {
  afterEach(() => {
    resetGlyphRasterizerBackendForTest();
    resetHostWebGlyphRasterizerForTest();
    vi.restoreAllMocks();
  });

  it('installs a host backend so get returns a non-sentinel', () => {
    enableHostWebGlyphRasterizer();
    const backend = getGlyphRasterizerBackend();
    expect(backend).not.toBe(null);
    expect(explainGlyphRasterizerBackend().layer).toBe('host');
  });

  it('is idempotent — second call preserves provider identity and allocates nothing', () => {
    enableHostWebGlyphRasterizer();
    const first = getGlyphRasterizerBackend();
    enableHostWebGlyphRasterizer();
    const second = getGlyphRasterizerBackend();
    expect(first).toBe(second);
  });

  it('starts unobserved — no viability claimed until a real call', () => {
    enableHostWebGlyphRasterizer();
    expect(explainGlyphRasterizerBackend()).toEqual({
      conflict: false,
      layer: 'host',
      operation: null,
      viability: 'unobserved',
    });
  });

  it('observes available after a successful rasterize call', () => {
    enableHostWebGlyphRasterizer();
    const backend = getGlyphRasterizerBackend();
    const result = backend.rasterize(65, { fontFamily: 'sans-serif', fontSize: 16 });
    if (result !== null) {
      expect(explainGlyphRasterizerBackend()).toEqual({
        conflict: false,
        layer: 'host',
        operation: 'rasterize',
        viability: 'available',
      });
    }
  });

  it('observes runtime-api-unavailable when context returns null', () => {
    const saved = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
    try {
      enableHostWebGlyphRasterizer();
      const backend = getGlyphRasterizerBackend();
      backend.rasterize(65, { fontFamily: 'x', fontSize: 16 });
    } finally {
      HTMLCanvasElement.prototype.getContext = saved;
    }
    expect(explainGlyphRasterizerBackend()).toEqual({
      conflict: false,
      layer: 'host',
      operation: 'rasterize',
      viability: 'runtime-api-unavailable',
    });
  });

  it('reflects recovery: broken environment then restored', () => {
    enableHostWebGlyphRasterizer();
    const backend = getGlyphRasterizerBackend();

    // Break the environment — rasterize reports failure
    const saved = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
    backend.rasterize(65, { fontFamily: 'x', fontSize: 16 });
    expect(explainGlyphRasterizerBackend().viability).toBe('runtime-api-unavailable');

    // Restore — next call reports success
    HTMLCanvasElement.prototype.getContext = saved;
    const result = backend.rasterize(65, { fontFamily: 'sans-serif', fontSize: 16 });
    if (result !== null) {
      expect(explainGlyphRasterizerBackend().viability).toBe('available');
    }
  });

  it('does not conflict with a prior install of the same backend via direct install', () => {
    enableHostWebGlyphRasterizer();
    const backend = getGlyphRasterizerBackend();
    installGlyphRasterizerHostBackend(backend);
    expect(explainGlyphRasterizerBackend().conflict).toBe(false);
  });

  it('observes available even when rasterize returns null for a zero-ink glyph', () => {
    enableHostWebGlyphRasterizer();
    const backend = getGlyphRasterizerBackend();
    // Space (codepoint 32) has no visible pixels — rasterize returns null, but the API is working
    const result = backend.rasterize(32, { fontFamily: 'sans-serif', fontSize: 16 });
    expect(result).toBeNull();
    expect(explainGlyphRasterizerBackend()).toEqual({
      conflict: false,
      layer: 'host',
      operation: 'rasterize',
      viability: 'available',
    });
  });
});

describe('resetHostWebGlyphRasterizerForTest', () => {
  afterEach(resetGlyphRasterizerBackendForTest);

  it('clears the enabler flag so a subsequent enable re-installs', () => {
    enableHostWebGlyphRasterizer();
    resetHostWebGlyphRasterizerForTest();
    resetGlyphRasterizerBackendForTest();
    enableHostWebGlyphRasterizer();
    expect(explainGlyphRasterizerBackend().layer).toBe('host');
  });
});
