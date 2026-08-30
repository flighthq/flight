import type { GlyphRasterizedBitmap, GlyphRasterizerBackend, GlyphRasterizerOperation } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { afterEach, describe, expect, it } from 'vitest';

import { createGlyphAtlas, deriveGlyphMetricsFromFontSize } from './glyphAtlas';
import { getGlyphAtlasEntry } from './glyphAtlasEntry';
import { getGlyphAtlasMetrics } from './glyphAtlasMetrics';
import {
  createStubGlyphRasterizerBackend,
  explainGlyphRasterizerBackend,
  explainGlyphRasterizerOperation,
  getGlyphRasterizerBackend,
  hasGlyphRasterizerOperation,
  installGlyphRasterizerHostBackend,
  observeGlyphRasterizerHostResult,
  resetGlyphRasterizerBackendForTest,
  setGlyphRasterizerBackend,
} from './glyphRasterizerBackend';

function fakeBackend(tag?: string): GlyphRasterizerBackend & { _tag: string } {
  return { _tag: tag ?? 'fake', rasterize: () => null };
}

function taggedBackend(advance: number): GlyphRasterizerBackend {
  return {
    rasterize(_codepoint, options): GlyphRasterizedBitmap {
      const size = Math.max(1, Math.round(options.fontSize));
      return {
        advance,
        bearingX: 0,
        bearingY: size,
        height: size,
        pixels: new Uint8ClampedArray(size * size * 4),
        width: size,
      };
    },
  };
}

describe('createStubGlyphRasterizerBackend', () => {
  it('returns an Entity', () => {
    expect(EntityRuntimeKey in createStubGlyphRasterizerBackend()).toBe(true);
  });

  it('emits a non-blank opaque-white box for any codepoint without a font or canvas', () => {
    const backend = createStubGlyphRasterizerBackend();
    const bitmap = backend.rasterize(65, { fontFamily: 'missing-font', fontSize: 20 })!;

    expect(bitmap).not.toBeNull();
    expect(bitmap.width).toBeGreaterThan(0);
    expect(bitmap.height).toBeGreaterThan(0);
    expect(bitmap.pixels.length).toBe(bitmap.width * bitmap.height * 4);
    expect(bitmap.pixels.every((v) => v === 255)).toBe(true);
  });

  it('sizes the box and advance from the requested fontSize', () => {
    const backend = createStubGlyphRasterizerBackend();
    const small = backend.rasterize(65, { fontFamily: 'x', fontSize: 10 })!;
    const large = backend.rasterize(65, { fontFamily: 'x', fontSize: 40 })!;

    expect(large.width).toBeGreaterThan(small.width);
    expect(large.height).toBeGreaterThan(small.height);
    expect(large.advance).toBeGreaterThan(large.width);
  });

  it('is deterministic — the same codepoint and size give the same box regardless of font', () => {
    const backend = createStubGlyphRasterizerBackend();
    const a = backend.rasterize(66, { fontFamily: 'a', fontSize: 24 })!;
    const b = backend.rasterize(66, { fontFamily: 'b', fontSize: 24 })!;

    expect(a.width).toBe(b.width);
    expect(a.height).toBe(b.height);
    expect(a.advance).toBe(b.advance);
  });
});

describe('explainGlyphRasterizerBackend', () => {
  afterEach(resetGlyphRasterizerBackendForTest);

  it('reports host-not-enabled/unobserved when nothing is installed', () => {
    expect(explainGlyphRasterizerBackend()).toEqual({
      conflict: false,
      layer: 'host-not-enabled',
      operation: null,
      viability: 'unobserved',
    });
  });

  it('reports custom/unobserved when a custom backend is installed', () => {
    setGlyphRasterizerBackend(fakeBackend());
    expect(explainGlyphRasterizerBackend()).toEqual({
      conflict: false,
      layer: 'custom',
      operation: null,
      viability: 'unobserved',
    });
  });

  it('reports host/unobserved when the host is installed but never exercised', () => {
    installGlyphRasterizerHostBackend(fakeBackend('host'));
    expect(explainGlyphRasterizerBackend()).toEqual({
      conflict: false,
      layer: 'host',
      operation: null,
      viability: 'unobserved',
    });
  });

  it('reports host/available after a successful rasterize observation', () => {
    installGlyphRasterizerHostBackend(fakeBackend('host'));
    observeGlyphRasterizerHostResult('rasterize', true);
    expect(explainGlyphRasterizerBackend()).toEqual({
      conflict: false,
      layer: 'host',
      operation: 'rasterize',
      viability: 'available',
    });
  });

  it('reports host/runtime-api-unavailable after a failed rasterize observation', () => {
    installGlyphRasterizerHostBackend(fakeBackend('host'));
    observeGlyphRasterizerHostResult('rasterize', false);
    expect(explainGlyphRasterizerBackend()).toEqual({
      conflict: false,
      layer: 'host',
      operation: 'rasterize',
      viability: 'runtime-api-unavailable',
    });
  });

  it('reports custom even when host is also installed', () => {
    installGlyphRasterizerHostBackend(fakeBackend('host'));
    setGlyphRasterizerBackend(fakeBackend('custom'));
    expect(explainGlyphRasterizerBackend()).toEqual({
      conflict: false,
      layer: 'custom',
      operation: null,
      viability: 'unobserved',
    });
  });

  it('reports conflict:true when a distinct second host is installed', () => {
    installGlyphRasterizerHostBackend(fakeBackend('first'));
    installGlyphRasterizerHostBackend(fakeBackend('second'));
    expect(explainGlyphRasterizerBackend()).toEqual({
      conflict: true,
      layer: 'host',
      operation: null,
      viability: 'unobserved',
    });
  });

  it('custom reports conflict:true from the host layer underneath', () => {
    installGlyphRasterizerHostBackend(fakeBackend('first'));
    installGlyphRasterizerHostBackend(fakeBackend('second'));
    setGlyphRasterizerBackend(fakeBackend('custom'));
    expect(explainGlyphRasterizerBackend()).toEqual({
      conflict: true,
      layer: 'custom',
      operation: null,
      viability: 'unobserved',
    });
  });
});

describe('explainGlyphRasterizerOperation', () => {
  afterEach(() => {
    resetGlyphRasterizerBackendForTest();
  });

  // ★ With nothing installed, the sentinel still answers every call,
  // so a query resolving through the getter would report every operation implemented. It must not.
  it('reports sentinel and no implementation when nothing is installed', () => {
    resetGlyphRasterizerBackendForTest();
    for (const operation of OPTIONAL_OPERATIONS) {
      expect(explainGlyphRasterizerOperation(operation)).toEqual({ implemented: false, layer: 'sentinel', operation });
    }
  });

  // ★ THE ARM THAT ACTUALLY CATCHES A SENTINEL COUNTED AS SUPPORT. Optional operations are not enough:
  // the sentinel does not implement those either, so a query resolving through getGlyphRasterizerBackend() would
  // agree by accident. A REQUIRED operation is the one the sentinel does answer, so this is where a
  // getter-based implementation reports a lie.
  it('reports a required operation as unimplemented when only the sentinel serves it', () => {
    resetGlyphRasterizerBackendForTest();
    expect(explainGlyphRasterizerOperation('rasterize')).toEqual({
      implemented: false,
      layer: 'sentinel',
      operation: 'rasterize',
    });
  });

  it('reports a custom backend as implementing only what it provides', () => {
    setGlyphRasterizerBackend(partialBackend());
    for (const operation of OPTIONAL_OPERATIONS) {
      expect(hasGlyphRasterizerOperation(operation)).toBe(false);
    }
    expect(explainGlyphRasterizerOperation(OPTIONAL_OPERATIONS[0]).layer).toBe('sentinel');
  });

  it('reports an operation the backend does provide', () => {
    const operation = OPTIONAL_OPERATIONS[0];
    setGlyphRasterizerBackend({ ...partialBackend(), [operation]: () => undefined } as GlyphRasterizerBackend);
    expect(explainGlyphRasterizerOperation(operation)).toEqual({ implemented: true, layer: 'custom', operation });
  });

  it('falls through to the host for an operation the custom backend omits', () => {
    const operation = OPTIONAL_OPERATIONS[0];
    installGlyphRasterizerHostBackend({ ...partialBackend(), [operation]: () => undefined } as GlyphRasterizerBackend);
    setGlyphRasterizerBackend(partialBackend());
    expect(explainGlyphRasterizerOperation(operation)).toEqual({ implemented: true, layer: 'host', operation });
  });
});

describe('getGlyphRasterizerBackend', () => {
  afterEach(resetGlyphRasterizerBackendForTest);

  it('returns the sentinel when nothing is installed', () => {
    const backend = getGlyphRasterizerBackend();
    expect(backend.rasterize(65, { fontFamily: 'x', fontSize: 16 })).toBeNull();
  });

  it('returns the custom backend when installed', () => {
    const custom = fakeBackend('custom');
    setGlyphRasterizerBackend(custom);
    expect(getGlyphRasterizerBackend()).toBe(custom);
  });

  it('returns the host backend when installed and no custom', () => {
    const host = fakeBackend('host');
    installGlyphRasterizerHostBackend(host);
    expect(getGlyphRasterizerBackend()).toBe(host);
  });

  it('prefers custom over host', () => {
    const custom = fakeBackend('custom');
    const host = fakeBackend('host');
    installGlyphRasterizerHostBackend(host);
    setGlyphRasterizerBackend(custom);
    expect(getGlyphRasterizerBackend()).toBe(custom);
  });
});

describe('hasGlyphRasterizerOperation', () => {
  afterEach(() => {
    resetGlyphRasterizerBackendForTest();
  });

  it('agrees with explainGlyphRasterizerOperation for every optional operation', () => {
    setGlyphRasterizerBackend(partialBackend());
    for (const operation of OPTIONAL_OPERATIONS) {
      expect(hasGlyphRasterizerOperation(operation)).toBe(explainGlyphRasterizerOperation(operation).implemented);
    }
  });
});

describe('installGlyphRasterizerHostBackend', () => {
  afterEach(resetGlyphRasterizerBackendForTest);

  it('installs a host backend that get returns', () => {
    const host = fakeBackend('host');
    installGlyphRasterizerHostBackend(host);
    expect(getGlyphRasterizerBackend()).toBe(host);
  });

  it('is idempotent — calling twice with the same backend preserves identity', () => {
    const host = fakeBackend('host');
    installGlyphRasterizerHostBackend(host);
    installGlyphRasterizerHostBackend(host);
    expect(getGlyphRasterizerBackend()).toBe(host);
    expect(explainGlyphRasterizerBackend().conflict).toBe(false);
  });

  it('does not last-write-win — a distinct second host preserves the original', () => {
    const first = fakeBackend('first');
    const second = fakeBackend('second');
    installGlyphRasterizerHostBackend(first);
    installGlyphRasterizerHostBackend(second);
    expect(getGlyphRasterizerBackend()).toBe(first);
  });

  it('flags conflict when a distinct second host is installed', () => {
    installGlyphRasterizerHostBackend(fakeBackend('first'));
    installGlyphRasterizerHostBackend(fakeBackend('second'));
    expect(explainGlyphRasterizerBackend().conflict).toBe(true);
  });

  it('clearing custom reveals the original host even after a conflict', () => {
    const first = fakeBackend('first');
    installGlyphRasterizerHostBackend(first);
    installGlyphRasterizerHostBackend(fakeBackend('second'));
    setGlyphRasterizerBackend(fakeBackend('custom'));
    setGlyphRasterizerBackend(null);
    expect(getGlyphRasterizerBackend()).toBe(first);
  });
});

describe('observeGlyphRasterizerHostResult', () => {
  afterEach(resetGlyphRasterizerBackendForTest);

  it('transitions host from unobserved to available on successful rasterize', () => {
    installGlyphRasterizerHostBackend(fakeBackend('host'));
    expect(explainGlyphRasterizerBackend().viability).toBe('unobserved');
    observeGlyphRasterizerHostResult('rasterize', true);
    expect(explainGlyphRasterizerBackend()).toEqual({
      conflict: false,
      layer: 'host',
      operation: 'rasterize',
      viability: 'available',
    });
  });

  it('transitions host from unobserved to runtime-api-unavailable on failed rasterize', () => {
    installGlyphRasterizerHostBackend(fakeBackend('host'));
    observeGlyphRasterizerHostResult('rasterize', false);
    expect(explainGlyphRasterizerBackend()).toEqual({
      conflict: false,
      layer: 'host',
      operation: 'rasterize',
      viability: 'runtime-api-unavailable',
    });
  });

  it('records measureMetrics observation', () => {
    installGlyphRasterizerHostBackend(fakeBackend('host'));
    observeGlyphRasterizerHostResult('measureMetrics', true);
    expect(explainGlyphRasterizerBackend()).toEqual({
      conflict: false,
      layer: 'host',
      operation: 'measureMetrics',
      viability: 'available',
    });
  });

  it('later call replaces prior — loss: available to runtime-api-unavailable', () => {
    installGlyphRasterizerHostBackend(fakeBackend('host'));
    observeGlyphRasterizerHostResult('rasterize', true);
    expect(explainGlyphRasterizerBackend().viability).toBe('available');
    observeGlyphRasterizerHostResult('rasterize', false);
    expect(explainGlyphRasterizerBackend().viability).toBe('runtime-api-unavailable');
  });

  it('later call replaces prior — recovery: runtime-api-unavailable to available', () => {
    installGlyphRasterizerHostBackend(fakeBackend('host'));
    observeGlyphRasterizerHostResult('rasterize', false);
    expect(explainGlyphRasterizerBackend().viability).toBe('runtime-api-unavailable');
    observeGlyphRasterizerHostResult('rasterize', true);
    expect(explainGlyphRasterizerBackend().viability).toBe('available');
  });

  it('observation persists under custom mask — visible after custom removal', () => {
    installGlyphRasterizerHostBackend(fakeBackend('host'));
    observeGlyphRasterizerHostResult('rasterize', true);
    setGlyphRasterizerBackend(fakeBackend('custom'));
    expect(explainGlyphRasterizerBackend().layer).toBe('custom');
    setGlyphRasterizerBackend(null);
    expect(explainGlyphRasterizerBackend()).toEqual({
      conflict: false,
      layer: 'host',
      operation: 'rasterize',
      viability: 'available',
    });
  });
});

describe('per-call GlyphAtlas precedence', () => {
  afterEach(resetGlyphRasterizerBackendForTest);

  it('walks sentinel → host → custom → per-call override with distinguishable output', () => {
    const hostBackend = taggedBackend(100);
    const customBackend = taggedBackend(200);
    const perCallBackend = taggedBackend(300);
    const atlasOpts = { fontFamily: 'x', fontSize: 16, height: 256, width: 256 };

    // Step 1: sentinel — rasterize returns null, entry is null
    const atlas1 = createGlyphAtlas(atlasOpts);
    expect(getGlyphAtlasEntry(atlas1, 65)).toBeNull();

    // Step 2: install host (advance=100)
    installGlyphRasterizerHostBackend(hostBackend);
    const atlas2 = createGlyphAtlas(atlasOpts);
    expect(getGlyphAtlasEntry(atlas2, 65)?.advance).toBe(100);

    // Step 3: set custom (advance=200, custom > host)
    setGlyphRasterizerBackend(customBackend);
    const atlas3 = createGlyphAtlas(atlasOpts);
    expect(getGlyphAtlasEntry(atlas3, 65)?.advance).toBe(200);

    // Step 4: per-call override (advance=300, per-call > custom > host)
    const atlas4 = createGlyphAtlas({ ...atlasOpts, rasterizerBackend: perCallBackend });
    expect(getGlyphAtlasEntry(atlas4, 65)?.advance).toBe(300);

    // Step 5: clear custom — per-call atlas still bound to its backend
    setGlyphRasterizerBackend(null);
    expect(getGlyphAtlasEntry(atlas4, 66)?.advance).toBe(300);
    // New atlas without override falls to host
    const atlas5 = createGlyphAtlas(atlasOpts);
    expect(getGlyphAtlasEntry(atlas5, 65)?.advance).toBe(100);
  });
});

describe('provider call-order independence', () => {
  afterEach(resetGlyphRasterizerBackendForTest);

  it('custom-before-host resolves to custom', () => {
    const custom = fakeBackend('custom');
    const host = fakeBackend('host');
    setGlyphRasterizerBackend(custom);
    installGlyphRasterizerHostBackend(host);
    expect(getGlyphRasterizerBackend()).toBe(custom);
    expect(explainGlyphRasterizerBackend().layer).toBe('custom');
  });

  it('host-before-custom resolves to custom', () => {
    const custom = fakeBackend('custom');
    const host = fakeBackend('host');
    installGlyphRasterizerHostBackend(host);
    setGlyphRasterizerBackend(custom);
    expect(getGlyphRasterizerBackend()).toBe(custom);
    expect(explainGlyphRasterizerBackend().layer).toBe('custom');
  });

  it('clearing custom after both are set reveals host regardless of install order', () => {
    const custom = fakeBackend('custom');
    const host = fakeBackend('host');

    setGlyphRasterizerBackend(custom);
    installGlyphRasterizerHostBackend(host);
    setGlyphRasterizerBackend(null);
    expect(getGlyphRasterizerBackend()).toBe(host);

    resetGlyphRasterizerBackendForTest();
    installGlyphRasterizerHostBackend(host);
    setGlyphRasterizerBackend(custom);
    setGlyphRasterizerBackend(null);
    expect(getGlyphRasterizerBackend()).toBe(host);
  });
});

describe('provider conflict and identity', () => {
  afterEach(resetGlyphRasterizerBackendForTest);

  it('custom masks host — host is preserved and revealed on custom removal', () => {
    const host = fakeBackend('host');
    installGlyphRasterizerHostBackend(host);
    setGlyphRasterizerBackend(fakeBackend('custom'));
    expect(getGlyphRasterizerBackend()).not.toBe(host);

    setGlyphRasterizerBackend(null);
    expect(getGlyphRasterizerBackend()).toBe(host);
  });

  it('replacing custom preserves host', () => {
    const host = fakeBackend('host');
    installGlyphRasterizerHostBackend(host);
    setGlyphRasterizerBackend(fakeBackend('a'));
    setGlyphRasterizerBackend(fakeBackend('b'));
    setGlyphRasterizerBackend(null);
    expect(getGlyphRasterizerBackend()).toBe(host);
  });

  it('the sentinel is a single stable identity', () => {
    const a = getGlyphRasterizerBackend();
    const b = getGlyphRasterizerBackend();
    expect(a).toBe(b);
  });

  it('the sentinel does not have measureMetrics — property is absent, not undefined', () => {
    const sentinel = getGlyphRasterizerBackend();
    expect('measureMetrics' in sentinel).toBe(false);
  });
});

describe('resetGlyphRasterizerBackendForTest', () => {
  it('clears custom, host, and observation back to initial state', () => {
    setGlyphRasterizerBackend(fakeBackend('custom'));
    installGlyphRasterizerHostBackend(fakeBackend('host'));
    observeGlyphRasterizerHostResult('rasterize', true);
    resetGlyphRasterizerBackendForTest();
    expect(explainGlyphRasterizerBackend()).toEqual({
      conflict: false,
      layer: 'host-not-enabled',
      operation: null,
      viability: 'unobserved',
    });
  });

  it('clears the conflict flag', () => {
    installGlyphRasterizerHostBackend(fakeBackend('a'));
    installGlyphRasterizerHostBackend(fakeBackend('b'));
    expect(explainGlyphRasterizerBackend().conflict).toBe(true);
    resetGlyphRasterizerBackendForTest();
    expect(explainGlyphRasterizerBackend()).toEqual({
      conflict: false,
      layer: 'host-not-enabled',
      operation: null,
      viability: 'unobserved',
    });
  });
});

// Per-operation availability for GlyphRasterizerBackend. The operations below are the ones the interface declares
// OPTIONAL, so a host that omits them is compliant rather than broken — that is the absence-of-an-export
// ruling, and this is the query that makes it observable.
const OPTIONAL_OPERATIONS: readonly GlyphRasterizerOperation[] = ['measureMetrics'];

describe('sentinel consumer fallback via GlyphAtlas', () => {
  afterEach(resetGlyphRasterizerBackendForTest);

  it('GlyphAtlas metrics fall back to deriveGlyphMetricsFromFontSize when sentinel lacks measureMetrics', () => {
    const atlas = createGlyphAtlas({ fontFamily: 'x', fontSize: 16, height: 64, width: 64 });
    const metrics = getGlyphAtlasMetrics(atlas);
    const expected = deriveGlyphMetricsFromFontSize(16);
    expect(metrics.ascent).toBe(expected.ascent);
    expect(metrics.descent).toBe(expected.descent);
    expect(metrics.lineGap).toBe(expected.lineGap);
  });
});

describe('setGlyphRasterizerBackend', () => {
  afterEach(resetGlyphRasterizerBackendForTest);

  it('installs a custom backend', () => {
    const custom = fakeBackend('custom');
    setGlyphRasterizerBackend(custom);
    expect(getGlyphRasterizerBackend()).toBe(custom);
  });

  it('reveals the host layer when cleared with null', () => {
    const host = fakeBackend('host');
    const custom = fakeBackend('custom');
    installGlyphRasterizerHostBackend(host);
    setGlyphRasterizerBackend(custom);
    expect(getGlyphRasterizerBackend()).toBe(custom);

    setGlyphRasterizerBackend(null);
    expect(getGlyphRasterizerBackend()).toBe(host);
    expect(explainGlyphRasterizerBackend().layer).toBe('host');
  });

  it('falls to sentinel when cleared with null and no host', () => {
    const custom = fakeBackend('custom');
    setGlyphRasterizerBackend(custom);
    setGlyphRasterizerBackend(null);
    expect(explainGlyphRasterizerBackend()).toEqual({
      conflict: false,
      layer: 'host-not-enabled',
      operation: null,
      viability: 'unobserved',
    });
  });
});

// A host implementing only the REQUIRED members — partial support declared by absence.
function partialBackend(): GlyphRasterizerBackend {
  return {
    rasterize: (() => undefined) as never,
  } as GlyphRasterizerBackend;
}
