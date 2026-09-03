import { createImageResourceFromCanvas, createImageResourceFromImageElement } from '@flighthq/image/contract';
import { getTextureSource } from '@flighthq/texture/contract';
import type { HasGraphicsImage, ImageBackend, ImageResource } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  createTextureAtlasFromCanvas,
  createTextureAtlasFromImageBitmap,
  createTextureAtlasFromImageElement,
  createTextureAtlasFromImageResource,
  loadTextureAtlasFromBase64,
  loadTextureAtlasFromBlob,
  loadTextureAtlasFromBytes,
  loadTextureAtlasFromUrl,
} from './textureAtlasFrom';

function createTestImageBackend(): ImageBackend {
  return {
    [EntityRuntimeKey]: undefined,
    async loadImageFromUrl(url, crossOrigin, signal): Promise<ImageResource> {
      signal?.throwIfAborted();
      const img = new Image();
      if (crossOrigin !== undefined) img.crossOrigin = crossOrigin;
      img.src = url;
      await img.decode();
      return createImageResourceFromImageElement(img);
    },
  };
}

const host: HasGraphicsImage = { graphics: { image: createTestImageBackend() } } as HasGraphicsImage;

beforeEach(() => {
  HTMLImageElement.prototype.decode = vi.fn().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (HTMLImageElement.prototype as Partial<HTMLImageElement>).decode;
});

describe('createTextureAtlasFromCanvas', () => {
  it('wraps a canvas with correct dimensions', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const atlas = createTextureAtlasFromCanvas(canvas);

    expect((getTextureSource(atlas.texture!) as ImageResource | null)?.source).toBe(canvas);
    expect(getTextureSource(atlas.texture!)?.width).toBe(320);
    expect(getTextureSource(atlas.texture!)?.height).toBe(240);
  });

  it('starts with an empty regions array', () => {
    const canvas = document.createElement('canvas');
    expect(createTextureAtlasFromCanvas(canvas).regions).toHaveLength(0);
  });

  it('returns a new object each call', () => {
    const canvas = document.createElement('canvas');
    expect(createTextureAtlasFromCanvas(canvas)).not.toBe(createTextureAtlasFromCanvas(canvas));
  });
});

describe('createTextureAtlasFromImageBitmap', () => {
  it('wraps an ImageBitmap with correct dimensions', () => {
    const bitmap = { width: 64, height: 128, close: () => {} } as ImageBitmap;
    const atlas = createTextureAtlasFromImageBitmap(bitmap);

    expect((getTextureSource(atlas.texture!) as ImageResource | null)?.source).toBe(bitmap);
    expect(getTextureSource(atlas.texture!)?.width).toBe(64);
    expect(getTextureSource(atlas.texture!)?.height).toBe(128);
  });

  it('returns a new object each call', () => {
    const bitmap = { width: 1, height: 1, close: () => {} } as ImageBitmap;
    expect(createTextureAtlasFromImageBitmap(bitmap)).not.toBe(createTextureAtlasFromImageBitmap(bitmap));
  });
});

describe('createTextureAtlasFromImageElement', () => {
  it('wraps an HTMLImageElement with correct dimensions', () => {
    const img = { width: 200, height: 100 } as HTMLImageElement;
    const atlas = createTextureAtlasFromImageElement(img);

    expect((getTextureSource(atlas.texture!) as ImageResource | null)?.source).toBe(img);
    expect(getTextureSource(atlas.texture!)?.width).toBe(200);
    expect(getTextureSource(atlas.texture!)?.height).toBe(100);
  });

  it('returns a new object each call', () => {
    const img = document.createElement('img');
    expect(createTextureAtlasFromImageElement(img)).not.toBe(createTextureAtlasFromImageElement(img));
  });
});

describe('createTextureAtlasFromImageResource', () => {
  it('uses the provided ImageResource as the atlas image', () => {
    const source = createImageResourceFromImageElement({ width: 128, height: 64 } as HTMLImageElement);
    const atlas = createTextureAtlasFromImageResource(source);

    expect(getTextureSource(atlas.texture!)).toBe(source);
    expect(getTextureSource(atlas.texture!)?.width).toBe(128);
    expect(getTextureSource(atlas.texture!)?.height).toBe(64);
  });

  it('starts with an empty regions array', () => {
    const source = createImageResourceFromImageElement({ width: 1, height: 1 } as HTMLImageElement);
    expect(createTextureAtlasFromImageResource(source).regions).toHaveLength(0);
  });

  it('returns a new object each call', () => {
    const source = createImageResourceFromImageElement({ width: 1, height: 1 } as HTMLImageElement);
    expect(createTextureAtlasFromImageResource(source)).not.toBe(createTextureAtlasFromImageResource(source));
  });
});

describe('loadTextureAtlasFromBase64', () => {
  it('resolves to a TextureAtlas with a non-null image', async () => {
    const atlas = await loadTextureAtlasFromBase64(host, 'abc123', 'image/png');
    expect((getTextureSource(atlas.texture!) as ImageResource | null)?.source).toBeInstanceOf(HTMLImageElement);
  });
});

describe('loadTextureAtlasFromBlob', () => {
  it('resolves to a TextureAtlas with a non-null image', async () => {
    const blob = new Blob([], { type: 'image/png' });
    const atlas = await loadTextureAtlasFromBlob(host, blob);
    expect((getTextureSource(atlas.texture!) as ImageResource | null)?.source).toBeInstanceOf(HTMLImageElement);
  });
});

describe('loadTextureAtlasFromBytes', () => {
  it('resolves to a TextureAtlas with a non-null image', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);
    const atlas = await loadTextureAtlasFromBytes(host, bytes);

    expect(getTextureSource(atlas.texture!)).not.toBeNull();
    expect((getTextureSource(atlas.texture!) as ImageResource | null)?.source).toBeInstanceOf(HTMLImageElement);
  });

  it('starts with an empty regions array', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);
    const atlas = await loadTextureAtlasFromBytes(host, bytes);

    expect(atlas.regions).toHaveLength(0);
  });

  it('throws when mime type cannot be detected', async () => {
    const bytes = new Uint8Array(16);
    await expect(loadTextureAtlasFromBytes(host, bytes)).rejects.toThrow('Unable to determine image type');
  });
});

describe('loadTextureAtlasFromUrl', () => {
  it('resolves to a TextureAtlas whose image src is an HTMLImageElement', async () => {
    const atlas = await loadTextureAtlasFromUrl(host, 'data:image/png;base64,abc');
    expect((getTextureSource(atlas.texture!) as ImageResource | null)?.source).toBeInstanceOf(HTMLImageElement);
  });
});
