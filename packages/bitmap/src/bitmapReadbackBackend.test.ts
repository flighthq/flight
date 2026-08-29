import type { BitmapReadbackBackend } from '@flighthq/types/contract';

import {
  getBitmapReadbackBackend,
  hasBitmapReadbackHostBackend,
  installBitmapReadbackHostBackend,
  resetBitmapReadbackBackendForTest,
  setBitmapReadbackBackend,
} from './bitmapReadbackBackend';

afterEach(() => {
  resetBitmapReadbackBackendForTest();
});

describe('getBitmapReadbackBackend', () => {
  it('prefers a custom backend over the installed host backend', () => {
    const host = createBackend();
    const custom = createBackend();
    installBitmapReadbackHostBackend(host);
    setBitmapReadbackBackend(custom);

    expect(getBitmapReadbackBackend()).toBe(custom);
  });
});

describe('hasBitmapReadbackHostBackend', () => {
  it('reports only host installation', () => {
    setBitmapReadbackBackend(createBackend());
    expect(hasBitmapReadbackHostBackend()).toBe(false);
    installBitmapReadbackHostBackend(createBackend());
    expect(hasBitmapReadbackHostBackend()).toBe(true);
  });
});

describe('installBitmapReadbackHostBackend', () => {
  it('keeps the first installed host backend', () => {
    const first = createBackend();
    installBitmapReadbackHostBackend(first);
    installBitmapReadbackHostBackend(createBackend());

    expect(getBitmapReadbackBackend()).toBe(first);
  });
});

describe('resetBitmapReadbackBackendForTest', () => {
  it('clears custom and host backends', () => {
    installBitmapReadbackHostBackend(createBackend());
    setBitmapReadbackBackend(createBackend());

    resetBitmapReadbackBackendForTest();

    expect(getBitmapReadbackBackend()).toBeNull();
    expect(hasBitmapReadbackHostBackend()).toBe(false);
  });
});

describe('setBitmapReadbackBackend', () => {
  it('sets and clears the custom backend', () => {
    const backend = createBackend();
    setBitmapReadbackBackend(backend);
    expect(getBitmapReadbackBackend()).toBe(backend);
    setBitmapReadbackBackend(null);
    expect(getBitmapReadbackBackend()).toBeNull();
  });
});

function createBackend(): BitmapReadbackBackend {
  return { readBitmap: () => ({ bitmap: null, reason: 'ok' }) };
}
