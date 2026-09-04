import { EntityRuntimeKey } from '@flighthq/types/contract';

import { createWebFontLoadingBackend, initializeWebFontLoadingBackend, webFontLoadingBackend } from './webFontLoading';

describe('createWebFontLoadingBackend', () => {
  it('returns an Entity', () => {
    expect(EntityRuntimeKey in createWebFontLoadingBackend()).toBe(true);
  });

  it('returns a backend with all four operations', () => {
    const backend = createWebFontLoadingBackend();
    expect(backend.addFontFace).toBeTypeOf('function');
    expect(backend.checkFontFace).toBeTypeOf('function');
    expect(backend.loadFontFaces).toBeTypeOf('function');
    expect(backend.whenReady).toBeTypeOf('function');
  });

  it('returns distinct instances on each call', () => {
    expect(createWebFontLoadingBackend()).not.toBe(createWebFontLoadingBackend());
  });
});

describe('initializeWebFontLoadingBackend', () => {
  it('is the construction initializer of createWebFontLoadingBackend', () => {
    expect(typeof initializeWebFontLoadingBackend).toBe('function');
  });
});
describe('webFontLoadingBackend', () => {
  it('is an Entity with all four operations', () => {
    expect(EntityRuntimeKey in webFontLoadingBackend).toBe(true);
    expect(webFontLoadingBackend.addFontFace).toBeTypeOf('function');
    expect(webFontLoadingBackend.checkFontFace).toBeTypeOf('function');
    expect(webFontLoadingBackend.loadFontFaces).toBeTypeOf('function');
    expect(webFontLoadingBackend.whenReady).toBeTypeOf('function');
  });

  it('is a stable singleton', () => {
    expect(webFontLoadingBackend).toBe(webFontLoadingBackend);
  });
});
