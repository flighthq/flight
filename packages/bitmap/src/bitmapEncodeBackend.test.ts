import type { BitmapEncodeBackend } from '@flighthq/types/contract';

import {
  explainBitmapEncodeBackend,
  explainBitmapEncodeOperation,
  getBitmapEncodeBackend,
  hasBitmapEncodeHostBackend,
  hasBitmapEncodeOperation,
  installBitmapEncodeHostBackend,
  observeBitmapEncodeHostResult,
  resetBitmapEncodeBackendForTest,
  setBitmapEncodeBackend,
} from './bitmapEncodeBackend';

function createBackend(supportedFormats: BitmapEncodeBackend['supportedFormats'] = ['jpeg', 'png']) {
  return {
    encodeBitmap: vi.fn(() => new Uint8Array([1])),
    supportedFormats,
  } satisfies BitmapEncodeBackend;
}

afterEach(() => {
  resetBitmapEncodeBackendForTest();
});

describe('explainBitmapEncodeBackend', () => {
  it('reports absence, host installation, and custom precedence', () => {
    expect(explainBitmapEncodeBackend()).toEqual({
      conflict: false,
      layer: 'host-not-enabled',
      operation: null,
      viability: 'unobserved',
    });
    installBitmapEncodeHostBackend(createBackend());
    expect(explainBitmapEncodeBackend()).toMatchObject({ layer: 'host' });
    setBitmapEncodeBackend(createBackend());
    expect(explainBitmapEncodeBackend()).toMatchObject({ layer: 'custom' });
  });
});

describe('explainBitmapEncodeOperation', () => {
  it('distinguishes sentinel, host, and custom layers', () => {
    expect(explainBitmapEncodeOperation('encodeBitmap')).toEqual({
      implemented: false,
      layer: 'sentinel',
      operation: 'encodeBitmap',
    });
    installBitmapEncodeHostBackend(createBackend());
    expect(explainBitmapEncodeOperation('encodeBitmap')).toEqual({
      implemented: true,
      layer: 'host',
      operation: 'encodeBitmap',
    });
    setBitmapEncodeBackend(createBackend());
    expect(explainBitmapEncodeOperation('encodeBitmap')).toEqual({
      implemented: true,
      layer: 'custom',
      operation: 'encodeBitmap',
    });
  });
});

describe('getBitmapEncodeBackend', () => {
  it('returns custom over host and null when neither is installed', () => {
    const host = createBackend();
    const custom = createBackend();
    expect(getBitmapEncodeBackend()).toBeNull();
    installBitmapEncodeHostBackend(host);
    expect(getBitmapEncodeBackend()).toBe(host);
    setBitmapEncodeBackend(custom);
    expect(getBitmapEncodeBackend()).toBe(custom);
    setBitmapEncodeBackend(null);
    expect(getBitmapEncodeBackend()).toBe(host);
  });
});

describe('hasBitmapEncodeHostBackend', () => {
  it('reports host occupancy independently of a custom backend', () => {
    setBitmapEncodeBackend(createBackend());
    expect(hasBitmapEncodeHostBackend()).toBe(false);
    installBitmapEncodeHostBackend(createBackend());
    expect(hasBitmapEncodeHostBackend()).toBe(true);
  });
});

describe('hasBitmapEncodeOperation', () => {
  it('does not count the sentinel as support', () => {
    expect(hasBitmapEncodeOperation('encodeBitmap')).toBe(false);
    installBitmapEncodeHostBackend(createBackend());
    expect(hasBitmapEncodeOperation('encodeBitmap')).toBe(true);
  });
});

describe('installBitmapEncodeHostBackend', () => {
  it('keeps the first host and records a conflicting later identity', () => {
    const first = createBackend();
    installBitmapEncodeHostBackend(first);
    installBitmapEncodeHostBackend(first);
    expect(explainBitmapEncodeBackend().conflict).toBe(false);
    installBitmapEncodeHostBackend(createBackend());
    expect(getBitmapEncodeBackend()).toBe(first);
    expect(explainBitmapEncodeBackend().conflict).toBe(true);
  });
});

describe('observeBitmapEncodeHostResult', () => {
  it.each([
    [true, 'available'],
    [false, 'runtime-api-unavailable'],
  ] as const)('records host viability for result %s', (succeeded, viability) => {
    installBitmapEncodeHostBackend(createBackend());
    observeBitmapEncodeHostResult('encodeBitmap', succeeded);
    expect(explainBitmapEncodeBackend()).toMatchObject({ operation: 'encodeBitmap', viability });
  });
});

describe('resetBitmapEncodeBackendForTest', () => {
  it('clears custom, host, conflict, and observation state', () => {
    installBitmapEncodeHostBackend(createBackend());
    installBitmapEncodeHostBackend(createBackend());
    setBitmapEncodeBackend(createBackend());
    observeBitmapEncodeHostResult('encodeBitmap', false);
    resetBitmapEncodeBackendForTest();
    expect(getBitmapEncodeBackend()).toBeNull();
    expect(explainBitmapEncodeBackend()).toEqual({
      conflict: false,
      layer: 'host-not-enabled',
      operation: null,
      viability: 'unobserved',
    });
  });
});

describe('setBitmapEncodeBackend', () => {
  it('replaces and clears only the custom layer', () => {
    const host = createBackend();
    const first = createBackend();
    const second = createBackend();
    installBitmapEncodeHostBackend(host);
    setBitmapEncodeBackend(first);
    setBitmapEncodeBackend(second);
    expect(getBitmapEncodeBackend()).toBe(second);
    setBitmapEncodeBackend(null);
    expect(getBitmapEncodeBackend()).toBe(host);
  });
});
