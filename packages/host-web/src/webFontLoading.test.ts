import { EntityRuntimeKey } from '@flighthq/types/contract';

import { createWebFontLoadingBackend, initializeWebFontLoadingBackend, webHostFontLoading } from './webFontLoading';

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
describe('webHostFontLoading', () => {
  it('is an Entity with all four operations', () => {
    expect(EntityRuntimeKey in webHostFontLoading).toBe(true);
    expect(webHostFontLoading.addFontFace).toBeTypeOf('function');
    expect(webHostFontLoading.checkFontFace).toBeTypeOf('function');
    expect(webHostFontLoading.loadFontFaces).toBeTypeOf('function');
    expect(webHostFontLoading.whenReady).toBeTypeOf('function');
  });

  it('is a stable singleton', () => {
    expect(webHostFontLoading).toBe(webHostFontLoading);
  });
});
