import type { Bitmap, HostImageProvider } from '@flighthq/types/contract';
import { BitmapTextureSourceKind } from '@flighthq/types/contract';

import { createWebImageBackend, initializeWebImageBackend, webHostImage } from './webImage';

function hostWith(backend = webHostImage): { readonly graphics: { readonly image: HostImageProvider } } {
  return { graphics: { image: backend } } as { readonly graphics: { readonly image: HostImageProvider } };
}

describe('createWebImageBackend', () => {
  it('returns a fresh entity each call', () => {
    const a = createWebImageBackend();
    const b = createWebImageBackend();
    expect(a).not.toBe(b);
    expect(a.loadImageFromUrl).toBeDefined();
    expect(a.createImageFromBitmap).toBeDefined();
  });
});

describe('initializeWebImageBackend', () => {
  it('is the construction initializer of createWebImageBackend', () => {
    expect(typeof initializeWebImageBackend).toBe('function');
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
describe('webHostImage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('materializes a Bitmap to an ImageResource via canvas', () => {
    const host = hostWith();
    const result = host.graphics.image.createImageFromBitmap!(createTestBitmap());
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
  });

  it('exposes createImageFromBitmap', () => {
    expect(webHostImage.createImageFromBitmap).toBeDefined();
  });
});
