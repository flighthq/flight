import type { GlyphRasterizerBackend } from '@flighthq/types/contract';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createStubGlyphRasterizerBackend,
  explainGlyphRasterizerBackend,
  getGlyphRasterizerBackend,
  installGlyphRasterizerHostBackend,
  resetGlyphRasterizerBackendForTest,
  setGlyphRasterizerBackend,
} from './glyphRasterizerBackend';

function fakeBackend(tag?: string): GlyphRasterizerBackend & { _tag: string } {
  return { _tag: tag ?? 'fake', rasterize: () => null };
}

describe('createStubGlyphRasterizerBackend', () => {
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

  it('reports host-not-enabled when nothing is installed', () => {
    expect(explainGlyphRasterizerBackend()).toEqual({ layer: 'host-not-enabled', viability: 'available' });
  });

  it('reports custom when a custom backend is installed', () => {
    setGlyphRasterizerBackend(fakeBackend());
    expect(explainGlyphRasterizerBackend()).toEqual({ layer: 'custom', viability: 'available' });
  });

  it('reports host/available when the host backend is installed with viable=true', () => {
    installGlyphRasterizerHostBackend(fakeBackend('host'), true);
    expect(explainGlyphRasterizerBackend()).toEqual({ layer: 'host', viability: 'available' });
  });

  it('reports host/runtime-api-unavailable when installed with viable=false', () => {
    installGlyphRasterizerHostBackend(fakeBackend('unavailable'), false);
    expect(explainGlyphRasterizerBackend()).toEqual({ layer: 'host', viability: 'runtime-api-unavailable' });
  });

  it('reports custom even when host is also installed', () => {
    installGlyphRasterizerHostBackend(fakeBackend('host'), true);
    setGlyphRasterizerBackend(fakeBackend('custom'));
    expect(explainGlyphRasterizerBackend()).toEqual({ layer: 'custom', viability: 'available' });
  });

  it('reports custom even when host is installed with runtime-api-unavailable', () => {
    installGlyphRasterizerHostBackend(fakeBackend('unavailable'), false);
    setGlyphRasterizerBackend(fakeBackend('custom'));
    expect(explainGlyphRasterizerBackend()).toEqual({ layer: 'custom', viability: 'available' });
  });

  it('reports provider-conflict when a distinct second host is installed', () => {
    installGlyphRasterizerHostBackend(fakeBackend('first'), true);
    installGlyphRasterizerHostBackend(fakeBackend('second'), true);
    expect(explainGlyphRasterizerBackend()).toEqual({ layer: 'host', viability: 'provider-conflict' });
  });

  it('custom still wins over a conflicted host', () => {
    installGlyphRasterizerHostBackend(fakeBackend('first'), true);
    installGlyphRasterizerHostBackend(fakeBackend('second'), true);
    setGlyphRasterizerBackend(fakeBackend('custom'));
    expect(explainGlyphRasterizerBackend()).toEqual({ layer: 'custom', viability: 'available' });
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
    installGlyphRasterizerHostBackend(host, true);
    expect(getGlyphRasterizerBackend()).toBe(host);
  });

  it('returns the unavailable host backend (not sentinel) when viable=false', () => {
    const unavailable = fakeBackend('unavailable');
    installGlyphRasterizerHostBackend(unavailable, false);
    expect(getGlyphRasterizerBackend()).toBe(unavailable);
  });

  it('prefers custom over host', () => {
    const custom = fakeBackend('custom');
    const host = fakeBackend('host');
    installGlyphRasterizerHostBackend(host, true);
    setGlyphRasterizerBackend(custom);
    expect(getGlyphRasterizerBackend()).toBe(custom);
  });
});

describe('installGlyphRasterizerHostBackend', () => {
  afterEach(resetGlyphRasterizerBackendForTest);

  it('installs a host backend that get returns', () => {
    const host = fakeBackend('host');
    installGlyphRasterizerHostBackend(host, true);
    expect(getGlyphRasterizerBackend()).toBe(host);
  });

  it('is idempotent — calling twice with the same backend preserves identity', () => {
    const host = fakeBackend('host');
    installGlyphRasterizerHostBackend(host, true);
    installGlyphRasterizerHostBackend(host, true);
    expect(getGlyphRasterizerBackend()).toBe(host);
    expect(explainGlyphRasterizerBackend()).toEqual({ layer: 'host', viability: 'available' });
  });

  it('does not last-write-win — a distinct second host preserves the original', () => {
    const first = fakeBackend('first');
    const second = fakeBackend('second');
    installGlyphRasterizerHostBackend(first, true);
    installGlyphRasterizerHostBackend(second, true);
    expect(getGlyphRasterizerBackend()).toBe(first);
  });

  it('flags conflict when a distinct second host is installed', () => {
    installGlyphRasterizerHostBackend(fakeBackend('first'), true);
    installGlyphRasterizerHostBackend(fakeBackend('second'), true);
    expect(explainGlyphRasterizerBackend().viability).toBe('provider-conflict');
  });

  it('clearing custom reveals the original host even after a conflict', () => {
    const first = fakeBackend('first');
    installGlyphRasterizerHostBackend(first, true);
    installGlyphRasterizerHostBackend(fakeBackend('second'), true);
    setGlyphRasterizerBackend(fakeBackend('custom'));
    setGlyphRasterizerBackend(null);
    expect(getGlyphRasterizerBackend()).toBe(first);
  });
});

describe('provider call-order independence', () => {
  afterEach(resetGlyphRasterizerBackendForTest);

  it('custom-before-host resolves to custom', () => {
    const custom = fakeBackend('custom');
    const host = fakeBackend('host');
    setGlyphRasterizerBackend(custom);
    installGlyphRasterizerHostBackend(host, true);
    expect(getGlyphRasterizerBackend()).toBe(custom);
    expect(explainGlyphRasterizerBackend().layer).toBe('custom');
  });

  it('host-before-custom resolves to custom', () => {
    const custom = fakeBackend('custom');
    const host = fakeBackend('host');
    installGlyphRasterizerHostBackend(host, true);
    setGlyphRasterizerBackend(custom);
    expect(getGlyphRasterizerBackend()).toBe(custom);
    expect(explainGlyphRasterizerBackend().layer).toBe('custom');
  });

  it('clearing custom after both are set reveals host regardless of install order', () => {
    const custom = fakeBackend('custom');
    const host = fakeBackend('host');

    setGlyphRasterizerBackend(custom);
    installGlyphRasterizerHostBackend(host, true);
    setGlyphRasterizerBackend(null);
    expect(getGlyphRasterizerBackend()).toBe(host);

    resetGlyphRasterizerBackendForTest();
    installGlyphRasterizerHostBackend(host, true);
    setGlyphRasterizerBackend(custom);
    setGlyphRasterizerBackend(null);
    expect(getGlyphRasterizerBackend()).toBe(host);
  });
});

describe('provider conflict and identity', () => {
  afterEach(resetGlyphRasterizerBackendForTest);

  it('custom masks host — host is preserved and revealed on custom removal', () => {
    const host = fakeBackend('host');
    installGlyphRasterizerHostBackend(host, true);
    setGlyphRasterizerBackend(fakeBackend('custom'));
    expect(getGlyphRasterizerBackend()).not.toBe(host);

    setGlyphRasterizerBackend(null);
    expect(getGlyphRasterizerBackend()).toBe(host);
  });

  it('replacing custom preserves host', () => {
    const host = fakeBackend('host');
    installGlyphRasterizerHostBackend(host, true);
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

  it('the sentinel does not have measureMetrics', () => {
    const sentinel = getGlyphRasterizerBackend();
    expect(sentinel.measureMetrics).toBeUndefined();
  });
});

describe('resetGlyphRasterizerBackendForTest', () => {
  it('clears custom, host, viable, and conflict back to initial state', () => {
    setGlyphRasterizerBackend(fakeBackend('custom'));
    installGlyphRasterizerHostBackend(fakeBackend('host'), true);
    resetGlyphRasterizerBackendForTest();
    expect(explainGlyphRasterizerBackend()).toEqual({ layer: 'host-not-enabled', viability: 'available' });
  });

  it('clears the conflict flag', () => {
    installGlyphRasterizerHostBackend(fakeBackend('a'), true);
    installGlyphRasterizerHostBackend(fakeBackend('b'), true);
    expect(explainGlyphRasterizerBackend().viability).toBe('provider-conflict');
    resetGlyphRasterizerBackendForTest();
    expect(explainGlyphRasterizerBackend()).toEqual({ layer: 'host-not-enabled', viability: 'available' });
  });
});

describe('runtime-API-unavailable scenario', () => {
  afterEach(resetGlyphRasterizerBackendForTest);

  it('host installed with viable=false reports runtime-api-unavailable and returns the backend', () => {
    const unavailable = fakeBackend('unavailable');
    installGlyphRasterizerHostBackend(unavailable, false);
    expect(getGlyphRasterizerBackend()).toBe(unavailable);
    expect(explainGlyphRasterizerBackend()).toEqual({ layer: 'host', viability: 'runtime-api-unavailable' });
  });

  it('custom still overrides even when host API is unavailable', () => {
    installGlyphRasterizerHostBackend(fakeBackend('unavailable'), false);
    const custom = fakeBackend('custom');
    setGlyphRasterizerBackend(custom);
    expect(getGlyphRasterizerBackend()).toBe(custom);
    expect(explainGlyphRasterizerBackend().layer).toBe('custom');
  });

  it('removing custom with unavailable host reveals that host backend', () => {
    const unavailable = fakeBackend('unavailable');
    installGlyphRasterizerHostBackend(unavailable, false);
    setGlyphRasterizerBackend(fakeBackend('custom'));
    setGlyphRasterizerBackend(null);
    expect(getGlyphRasterizerBackend()).toBe(unavailable);
    expect(explainGlyphRasterizerBackend()).toEqual({ layer: 'host', viability: 'runtime-api-unavailable' });
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
    installGlyphRasterizerHostBackend(host, true);
    setGlyphRasterizerBackend(custom);
    expect(getGlyphRasterizerBackend()).toBe(custom);

    setGlyphRasterizerBackend(null);
    expect(getGlyphRasterizerBackend()).toBe(host);
    expect(explainGlyphRasterizerBackend()).toEqual({ layer: 'host', viability: 'available' });
  });

  it('falls to sentinel when cleared with null and no host', () => {
    const custom = fakeBackend('custom');
    setGlyphRasterizerBackend(custom);
    setGlyphRasterizerBackend(null);
    expect(explainGlyphRasterizerBackend()).toEqual({ layer: 'host-not-enabled', viability: 'available' });
  });
});
