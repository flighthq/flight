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

describe('image bitmap composer registry', () => {
  it('registers, enumerates, and removes a composer by its open kind', () => {
    registerImageBitmapComposer('acme/raw-raster', composer);

    expect(hasImageBitmapComposer('acme/raw-raster')).toBe(true);
    expect(getImageBitmapComposer('acme/raw-raster')).toBe(composer);
    expect(getImageBitmapComposerKinds()).toEqual(['acme/raw-raster']);

    unregisterImageBitmapComposer('acme/raw-raster');
    expect(getImageBitmapComposer('acme/raw-raster')).toBeNull();
  });

  it('uses the final registration for a kind', () => {
    const replacement: ImageBitmapComposer = () => null;
    registerImageBitmapComposer('acme/raw-raster', composer);
    registerImageBitmapComposer('acme/raw-raster', replacement);

    expect(getImageBitmapComposer('acme/raw-raster')).toBe(replacement);
  });

  it('returns an enumeration detached from registry state', () => {
    registerImageBitmapComposer('acme/raw-raster', composer);
    (getImageBitmapComposerKinds() as string[]).length = 0;

    expect(getImageBitmapComposerKinds()).toEqual(['acme/raw-raster']);
  });
});
