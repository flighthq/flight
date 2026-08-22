import type { BackendExplanation, GlyphRasterizedBitmap, GlyphRasterizerBackend } from '@flighthq/types/contract';

export function createStubGlyphRasterizerBackend(): GlyphRasterizerBackend {
  return {
    rasterize(_codepoint, options): GlyphRasterizedBitmap | null {
      const size = Math.max(1, Math.round(options.fontSize));
      const width = Math.max(1, Math.round(size * 0.6));
      const height = Math.max(1, Math.round(size * 0.7));
      const pixels = new Uint8ClampedArray(width * height * 4);
      pixels.fill(255);
      return {
        advance: width + Math.max(1, Math.round(size * 0.1)),
        bearingX: 0,
        bearingY: height,
        height,
        pixels,
        width,
      };
    },
  };
}

export function explainGlyphRasterizerBackend(): BackendExplanation {
  if (_custom !== null) return { layer: 'custom', viability: 'available' };
  if (_host !== null) {
    if (_hostConflict) return { layer: 'host', viability: 'provider-conflict' };
    return { layer: 'host', viability: _hostViable ? 'available' : 'runtime-api-unavailable' };
  }
  return { layer: 'host-not-enabled', viability: 'available' };
}

export function getGlyphRasterizerBackend(): GlyphRasterizerBackend {
  return _custom ?? _host ?? _sentinel;
}

// Installs a host-layer backend. The first install wins: a second call with the same backend
// reference is a silent no-op (idempotence); a second call with a distinct backend sets the
// provider-conflict flag and preserves the original host — explain reports provider-conflict,
// custom still wins, and clearing custom reveals the original.
export function installGlyphRasterizerHostBackend(backend: GlyphRasterizerBackend, viable: boolean): void {
  if (_host !== null) {
    if (_host !== backend) _hostConflict = true;
    return;
  }
  _host = backend;
  _hostViable = viable;
}

export function resetGlyphRasterizerBackendForTest(): void {
  _custom = null;
  _host = null;
  _hostViable = false;
  _hostConflict = false;
}

export function setGlyphRasterizerBackend(backend: GlyphRasterizerBackend | null): void {
  _custom = backend;
}

let _custom: GlyphRasterizerBackend | null = null;
let _host: GlyphRasterizerBackend | null = null;
let _hostViable = false;
let _hostConflict = false;

// Sentinel omits the optional measureMetrics — advertising an optional capability it does not
// support would be a false power claim.
const _sentinel: GlyphRasterizerBackend = {
  rasterize(): null {
    return null;
  },
};
