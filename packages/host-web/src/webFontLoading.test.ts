import {
  getFontLoadingBackend,
  hasFontLoadingHostBackend,
  resetFontLoadingBackendForTest,
} from '@flighthq/font/contract';

import {
  createWebFontLoadingBackend,
  enableHostWebFontLoading,
  resetHostWebFontLoadingForTest,
} from './webFontLoading';

afterEach(() => {
  resetFontLoadingBackendForTest();
  resetHostWebFontLoadingForTest();
});

describe('createWebFontLoadingBackend', () => {
  it('returns a backend with all four operations', () => {
    const backend = createWebFontLoadingBackend();
    expect(backend.addFontFace).toBeTypeOf('function');
    expect(backend.checkFontFace).toBeTypeOf('function');
    expect(backend.loadFontFaces).toBeTypeOf('function');
    expect(backend.whenReady).toBeTypeOf('function');
  });
});

describe('enableHostWebFontLoading', () => {
  it('installs the host backend', () => {
    expect(hasFontLoadingHostBackend()).toBe(false);
    enableHostWebFontLoading();
    expect(hasFontLoadingHostBackend()).toBe(true);
  });

  it('is idempotent', () => {
    enableHostWebFontLoading();
    enableHostWebFontLoading();
    expect(hasFontLoadingHostBackend()).toBe(true);
  });
});

describe('resetHostWebFontLoadingForTest', () => {
  it('allows re-enabling after reset', () => {
    enableHostWebFontLoading();
    const first = getFontLoadingBackend();
    resetHostWebFontLoadingForTest();
    resetFontLoadingBackendForTest();
    enableHostWebFontLoading();
    const second = getFontLoadingBackend();
    expect(first).not.toBe(second);
  });
});
