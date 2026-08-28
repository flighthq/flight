import type {
  BackendExplanation,
  BackendOperationExplanation,
  GlyphRasterizedBitmap,
  GlyphRasterizerBackend,
  GlyphRasterizerOperation,
} from '@flighthq/types/contract';

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
  if (_custom !== null) {
    return {
      conflict: _hostConflict,
      layer: 'custom',
      operation: null,
      viability: 'unobserved',
    };
  }
  if (_host !== null) {
    return {
      conflict: _hostConflict,
      layer: 'host',
      operation: _hostObservation !== null ? _hostObservation.operation : null,
      viability: _hostObservation !== null ? _hostObservation.viability : 'unobserved',
    };
  }
  return {
    conflict: false,
    layer: 'host-not-enabled',
    operation: null,
    viability: 'unobserved',
  };
}

// Which layer implements `operation`, and whether anything real does — the per-operation answer
// `explainGlyphRasterizerBackend` cannot give: that one reports a backend is installed, this one reports whether
// THIS operation on it is a genuine implementation or the sentinel standing in.
//
// ★ The sentinel is deliberately not consulted. It answers every operation, so counting it would make
// this report `true` for everything and say nothing at all.
export function explainGlyphRasterizerOperation(operation: GlyphRasterizerOperation): BackendOperationExplanation {
  if (_custom !== null && typeof _custom[operation] === 'function') {
    return { implemented: true, layer: 'custom', operation };
  }
  if (_host !== null && typeof _host[operation] === 'function') {
    return { implemented: true, layer: 'host', operation };
  }
  return { implemented: false, layer: 'sentinel', operation };
}

export function getGlyphRasterizerBackend(): GlyphRasterizerBackend {
  return _custom ?? _host ?? _sentinel;
}

// Whether a real backend implements `operation`, as opposed to the sentinel answering for it.
export function hasGlyphRasterizerOperation(operation: GlyphRasterizerOperation): boolean {
  return explainGlyphRasterizerOperation(operation).implemented;
}

// Installs a host-layer backend. The first install wins: a second call with the same backend
// reference is a silent no-op (idempotence); a second call with a distinct backend sets the
// conflict flag and preserves the original host — explain reports conflict:true, custom still
// wins, and clearing custom reveals the original.
export function installGlyphRasterizerHostBackend(backend: GlyphRasterizerBackend): void {
  if (_host !== null) {
    if (_host !== backend) _hostConflict = true;
    return;
  }
  _host = backend;
}

// Records an observation from a host backend operation. Called by the host backend's rasterize
// and measureMetrics methods after each real call. Later calls replace the prior observation,
// so both loss and recovery are reflected.
export function observeGlyphRasterizerHostResult(operation: 'measureMetrics' | 'rasterize', succeeded: boolean): void {
  _hostObservation = {
    operation,
    viability: succeeded ? 'available' : 'runtime-api-unavailable',
  };
}

export function resetGlyphRasterizerBackendForTest(): void {
  _custom = null;
  _host = null;
  _hostConflict = false;
  _hostObservation = null;
}

export function setGlyphRasterizerBackend(backend: GlyphRasterizerBackend | null): void {
  _custom = backend;
}

let _custom: GlyphRasterizerBackend | null = null;
let _host: GlyphRasterizerBackend | null = null;
let _hostConflict = false;
let _hostObservation: {
  operation: 'measureMetrics' | 'rasterize';
  viability: 'available' | 'runtime-api-unavailable';
} | null = null;

// Sentinel omits the optional measureMetrics — advertising an optional capability it does not
// support would be a false power claim.
const _sentinel: GlyphRasterizerBackend = {
  rasterize(): null {
    return null;
  },
};
