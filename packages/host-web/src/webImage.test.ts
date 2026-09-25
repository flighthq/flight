import type { Bitmap, HostImageCapability } from '@flighthq/types/contract';
import { BitmapTextureSourceKind } from '@flighthq/types/contract';

import { webHostImage } from './webImage.ts';

function hostWith(backend = webHostImage): { readonly graphics: { readonly image: HostImageCapability } } {
  return { graphics: { image: backend } } as { readonly graphics: { readonly image: HostImageCapability } };
}

describe('webHostImage', () => {
  it('exposes the image load and create operations', () => {
    expect(webHostImage.loadImageFromUrl).toBeDefined();
    expect(webHostImage.createImageFromBitmap).toBeDefined();
  });
});

function createTestBitmap(): Bitmap {
  return {
    alphaType: 'straight',
    gamut: 'srgb',
    data: new Uint8ClampedArray(4),
    format: 'rgba8unorm',
    height: 1,
    kind: BitmapTextureSourceKind,
    version: 0,
    width: 1,
  } as Bitmap;
}
