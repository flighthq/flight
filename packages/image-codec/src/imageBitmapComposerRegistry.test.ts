import type { ImageBitmapComposer } from '@flighthq/types/contract';

import {
  clearImageBitmapComposers,
  getImageBitmapComposer,
  getImageBitmapComposerKinds,
  hasImageBitmapComposer,
  registerImageBitmapComposer,
  unregisterImageBitmapComposer,
} from './imageBitmapComposerRegistry';

const composer: ImageBitmapComposer = () => null;

afterEach(() => {
  clearImageBitmapComposers();
});

describe('clearImageBitmapComposers', () => {
  it('removes every registered composer', () => {
    registerImageBitmapComposer('acme/raw-raster', composer);
    clearImageBitmapComposers();

    expect(hasImageBitmapComposer('acme/raw-raster')).toBe(false);
  });
});

describe('getImageBitmapComposer', () => {
  it('returns the registered composer or null for a missing kind', () => {
    expect(getImageBitmapComposer('acme/raw-raster')).toBeNull();
    registerImageBitmapComposer('acme/raw-raster', composer);

    expect(getImageBitmapComposer('acme/raw-raster')).toBe(composer);
  });
});

describe('getImageBitmapComposerKinds', () => {
  it('returns an insertion-ordered enumeration detached from registry state', () => {
    registerImageBitmapComposer('acme/raw-raster', composer);
    expect(getImageBitmapComposerKinds()).toEqual(['acme/raw-raster']);
    (getImageBitmapComposerKinds() as string[]).length = 0;

    expect(getImageBitmapComposerKinds()).toEqual(['acme/raw-raster']);
  });
});

describe('hasImageBitmapComposer', () => {
  it('reports whether a kind is registered', () => {
    expect(hasImageBitmapComposer('acme/raw-raster')).toBe(false);
    registerImageBitmapComposer('acme/raw-raster', composer);

    expect(hasImageBitmapComposer('acme/raw-raster')).toBe(true);
  });
});

describe('registerImageBitmapComposer', () => {
  it('uses the final registration for a kind', () => {
    const replacement: ImageBitmapComposer = () => null;
    registerImageBitmapComposer('acme/raw-raster', composer);
    registerImageBitmapComposer('acme/raw-raster', replacement);

    expect(getImageBitmapComposer('acme/raw-raster')).toBe(replacement);
  });
});

describe('unregisterImageBitmapComposer', () => {
  it('removes one registered kind', () => {
    registerImageBitmapComposer('acme/raw-raster', composer);
    unregisterImageBitmapComposer('acme/raw-raster');

    expect(getImageBitmapComposer('acme/raw-raster')).toBeNull();
  });
});
