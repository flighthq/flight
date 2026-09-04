import type { CompressedImageData } from '@flighthq/types/contract';
import { CompressedImageTextureSourceKind, ImageTextureSourceKind } from '@flighthq/types/contract';

import {
  cloneImageResource,
  createCompressedImageResource,
  createImageResource,
  initializeCompressedImageResource,
  invalidateImageResource,
  isImageResourceEmpty,
} from './imageResource';

function makeCompressed(): CompressedImageData {
  return {
    container: {
      depth: 1,
      faces: 1,
      format: 'bc3',
      height: 4,
      layers: 1,
      levels: [{ byteLength: 16, byteOffset: 0, height: 4, width: 4 }],
      mipLevels: 1,
      supercompression: 'None',
      width: 4,
    },
    payload: new Uint8Array(16),
  };
}

describe('cloneImageResource', () => {
  it('shares the host source under an independent identity and version', () => {
    const source = document.createElement('canvas');
    source.width = 4;
    source.height = 5;
    const resource = createImageResource(source);
    resource.version = 3;
    const copy = cloneImageResource(resource);
    expect(copy).not.toBe(resource);
    expect(copy.source).toBe(source);
    expect(copy.version).toBe(3);
    copy.version++;
    expect(resource.version).toBe(3);
  });
});

describe('createCompressedImageResource', () => {
  it('wraps the compressed payload as a distinct source', () => {
    const compressed = makeCompressed();
    const image = createCompressedImageResource(compressed);
    expect(image.kind).toBe(CompressedImageTextureSourceKind);
    expect(image.compressed).toBe(compressed);
    expect(image.width).toBe(4);
    expect(image.height).toBe(4);
  });
});

describe('createImageResource', () => {
  it('wraps one host source with its dimensions and declared kind', () => {
    const source = document.createElement('canvas');
    source.width = 8;
    source.height = 6;
    const resource = createImageResource(source);
    expect(resource.kind).toBe(ImageTextureSourceKind);
    expect(resource.source).toBe(source);
    expect(resource.width).toBe(8);
    expect(resource.height).toBe(6);
  });
});

describe('initializeCompressedImageResource', () => {
  it('is the construction initializer of createCompressedImageResource', () => {
    expect(typeof initializeCompressedImageResource).toBe('function');
  });
});

describe('invalidateImageResource', () => {
  it('refreshes host dimensions and advances the version', () => {
    const source = document.createElement('canvas');
    const resource = createImageResource(source);
    source.width = 12;
    source.height = 9;
    invalidateImageResource(resource);
    expect(resource.width).toBe(12);
    expect(resource.height).toBe(9);
    expect(resource.version).toBe(1);
  });
});
describe('isImageResourceEmpty', () => {
  it('reports a zero-sized host image', () => {
    expect(isImageResourceEmpty(createImageResource(globalThis.document.createElement('img')))).toBe(true);
  });
});
