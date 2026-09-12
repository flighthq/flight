import { createImageResource, registerHostImageDimensionResolver } from '@flighthq/image/contract';
import { getTextureSource } from '@flighthq/texture/contract';
import type { HostImageProvider, ImageResource } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  createTextureAtlasFromImageResource,
  loadTextureAtlasFromBase64,
  loadTextureAtlasFromBlob,
  loadTextureAtlasFromBytes,
  loadTextureAtlasFromUrl,
} from './textureAtlasFrom';

// The <img> this fake host decodes is measured by the host, so the test registers the one-line resolver
// a browser host would install rather than depending on host-web from a portable package's tests.
registerHostImageDimensionResolver((source: unknown, out: { height: number; width: number }) => {
  const sized = source as { height: number; width: number };
  out.height = sized.height;
  out.width = sized.width;
  return true;
});

function createTestImageBackend(): HostImageProvider {
  return {
    [EntityRuntimeKey]: undefined,
    async loadImageFromUrl(url, crossOrigin, signal): Promise<ImageResource> {
      signal?.throwIfAborted();
      const img = new Image();
      if (crossOrigin !== undefined) img.crossOrigin = crossOrigin;
      img.src = url;
      await img.decode();
      return createImageResource(img);
    },
  };
}

const host: { readonly graphics: { readonly image: HostImageProvider } } = {
  graphics: { image: createTestImageBackend() },
} as { readonly graphics: { readonly image: HostImageProvider } };

beforeEach(() => {
  HTMLImageElement.prototype.decode = vi.fn().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (HTMLImageElement.prototype as Partial<HTMLImageElement>).decode;
});

describe('createTextureAtlasFromImageResource', () => {
  it('uses the provided ImageResource as the atlas image', () => {
    const source = createImageResource({ width: 128, height: 64 } as HTMLImageElement);
    const atlas = createTextureAtlasFromImageResource(source);

    expect(getTextureSource(atlas.texture!)).toBe(source);
    expect(getTextureSource(atlas.texture!)?.width).toBe(128);
    expect(getTextureSource(atlas.texture!)?.height).toBe(64);
  });

  it('starts with an empty regions array', () => {
    const source = createImageResource({ width: 1, height: 1 } as HTMLImageElement);
    expect(createTextureAtlasFromImageResource(source).regions).toHaveLength(0);
  });

  it('returns a new object each call', () => {
    const source = createImageResource({ width: 1, height: 1 } as HTMLImageElement);
    expect(createTextureAtlasFromImageResource(source)).not.toBe(createTextureAtlasFromImageResource(source));
  });
});

describe('loadTextureAtlasFromBase64', () => {
  it('resolves to a TextureAtlas with a non-null image', async () => {
    const atlas = await loadTextureAtlasFromBase64(host.graphics.image, 'abc123', 'image/png');
    expect((getTextureSource(atlas.texture!) as ImageResource | null)?.source).toBeInstanceOf(HTMLImageElement);
  });
});

describe('loadTextureAtlasFromBlob', () => {
  it('resolves to a TextureAtlas with a non-null image', async () => {
    const blob = new Blob([], { type: 'image/png' });
    const atlas = await loadTextureAtlasFromBlob(host.graphics.image, blob);
    expect((getTextureSource(atlas.texture!) as ImageResource | null)?.source).toBeInstanceOf(HTMLImageElement);
  });
});

describe('loadTextureAtlasFromBytes', () => {
  it('resolves to a TextureAtlas with a non-null image', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);
    const atlas = await loadTextureAtlasFromBytes(host.graphics.image, bytes);

    expect(getTextureSource(atlas.texture!)).not.toBeNull();
    expect((getTextureSource(atlas.texture!) as ImageResource | null)?.source).toBeInstanceOf(HTMLImageElement);
  });

  it('starts with an empty regions array', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);
    const atlas = await loadTextureAtlasFromBytes(host.graphics.image, bytes);

    expect(atlas.regions).toHaveLength(0);
  });

  it('throws when mime type cannot be detected', async () => {
    const bytes = new Uint8Array(16);
    await expect(loadTextureAtlasFromBytes(host.graphics.image, bytes)).rejects.toThrow(
      'Unable to determine image type',
    );
  });
});

describe('loadTextureAtlasFromUrl', () => {
  it('resolves to a TextureAtlas whose image src is an HTMLImageElement', async () => {
    const atlas = await loadTextureAtlasFromUrl(host.graphics.image, 'data:image/png;base64,abc');
    expect((getTextureSource(atlas.texture!) as ImageResource | null)?.source).toBeInstanceOf(HTMLImageElement);
  });
});
