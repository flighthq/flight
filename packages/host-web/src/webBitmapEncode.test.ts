import { encodeBitmap } from '@flighthq/bitmap/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Bitmap, HostBitmapEncodeCapability } from '@flighthq/types/contract';
import { BitmapTextureSourceKind } from '@flighthq/types/contract';

import { webHostBitmapEncode } from './webBitmapEncode.ts';

function createTestBitmap(): Bitmap {
  const out = allocateEntity<Bitmap>();
  out.alphaType = 'straight';
  out.gamut = 'srgb';
  out.data = new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]);
  out.format = 'rgba8unorm';
  out.height = 1;
  out.kind = BitmapTextureSourceKind;
  out.version = 0;
  out.width = 2;
  return finishEntity(out);
}

function hostWith(backend = webHostBitmapEncode): HostBitmapEncodeCapability {
  return backend;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('webHostBitmapEncode', () => {
  it('reports its supported encode formats', () => {
    expect(webHostBitmapEncode.supportedFormats).toEqual(['jpeg', 'png']);
  });
});
