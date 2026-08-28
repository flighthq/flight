import * as imageContract from '@flighthq/image/contract';
import type { Bitmap, ImageBackend } from '@flighthq/types/contract';
import { BitmapTextureSourceKind } from '@flighthq/types/contract';

import { enableHostWebImage, resetHostWebImageForTest } from './webImage';

describe('enableHostWebImage', () => {
  afterEach(() => {
    resetHostWebImageForTest();
    imageContract.resetImageBackendForTest();
    vi.restoreAllMocks();
  });

  it('delegates Bitmap materialization and records the observation', () => {
    enableHostWebImage();
    const result = imageContract.getImageBackend().createImageFromBitmap!(createTestBitmap());
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
    expect(imageContract.explainImageBackend()).toMatchObject({
      operation: 'createImageFromBitmap',
      viability: 'available',
    });
  });

  it('does not advertise Bitmap materialization when the inner provider omits it', () => {
    const inner: ImageBackend = { loadImageFromUrl: vi.fn() };
    vi.spyOn(imageContract, 'createWebImageBackend').mockReturnValue(inner);
    enableHostWebImage();
    expect(imageContract.getImageBackend().createImageFromBitmap).toBeUndefined();
  });

  it('does not throw on first call', () => {
    expect(() => enableHostWebImage()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWebImage();
    expect(() => enableHostWebImage()).not.toThrow();
  });
});

describe('resetHostWebImageForTest', () => {
  afterEach(() => {
    resetHostWebImageForTest();
    imageContract.resetImageBackendForTest();
  });

  it('allows re-enabling after reset', () => {
    enableHostWebImage();
    resetHostWebImageForTest();
    expect(() => enableHostWebImage()).not.toThrow();
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
