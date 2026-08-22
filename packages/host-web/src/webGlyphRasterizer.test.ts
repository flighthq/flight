import {
  explainGlyphRasterizerBackend,
  getGlyphRasterizerBackend,
  installGlyphRasterizerHostBackend,
  resetGlyphRasterizerBackendForTest,
} from '@flighthq/glyphatlas/contract';
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

  it('reports available when the canvas API is present', () => {
    enableHostWebGlyphRasterizer();
    expect(explainGlyphRasterizerBackend()).toEqual({ layer: 'host', viability: 'available' });
  });

  it('reports runtime-api-unavailable when no canvas context can be acquired', () => {
    const saved = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
    try {
      enableHostWebGlyphRasterizer();
    } finally {
      HTMLCanvasElement.prototype.getContext = saved;
    }
    expect(explainGlyphRasterizerBackend()).toEqual({ layer: 'host', viability: 'runtime-api-unavailable' });
  });

  it('installs a real backend object even when runtime API is unavailable', () => {
    const saved = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
    try {
      enableHostWebGlyphRasterizer();
    } finally {
      HTMLCanvasElement.prototype.getContext = saved;
    }
    const backend = getGlyphRasterizerBackend();
    expect(backend.rasterize).toBeTypeOf('function');
    expect(backend.rasterize(65, { fontFamily: 'x', fontSize: 16 })).toBeNull();
  });

  it('does not conflict with a prior install of the same backend via direct install', () => {
    enableHostWebGlyphRasterizer();
    const backend = getGlyphRasterizerBackend();
    installGlyphRasterizerHostBackend(backend, true);
    expect(explainGlyphRasterizerBackend().viability).not.toBe('provider-conflict');
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
