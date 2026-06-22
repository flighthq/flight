import { createImageResourceFromImageElement } from './imageResourceFrom';
import { createTextureAtlas } from './textureAtlas';
import {
  createTilesetFromAtlas,
  createTilesetFromImageResource,
  loadTilesetFromArrayBuffer,
  loadTilesetFromBase64,
  loadTilesetFromBlob,
  loadTilesetFromUrl,
} from './tilesetFrom';

function makeAtlas(width: number, height: number) {
  const source = createImageResourceFromImageElement({ width, height } as HTMLImageElement);
  return createTextureAtlas({ image: source });
}

// Stub img.decode() so async load functions resolve immediately in jsdom.
beforeEach(() => {
  HTMLImageElement.prototype.decode = vi.fn().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (HTMLImageElement.prototype as Partial<HTMLImageElement>).decode;
});

describe('createTilesetFromAtlas', () => {
  it('derives rows and columns from atlas image dimensions', () => {
    const atlas = makeAtlas(64, 32);
    const tileset = createTilesetFromAtlas(atlas, 32, 32);

    expect(tileset.columns).toBe(2);
    expect(tileset.rows).toBe(1);
    expect(tileset.tileWidth).toBe(32);
    expect(tileset.tileHeight).toBe(32);
  });

  it('initializes atlas regions for each tile', () => {
    const atlas = makeAtlas(64, 32);
    createTilesetFromAtlas(atlas, 32, 32);

    expect(atlas.regions).toHaveLength(2);
  });

  it('uses the provided atlas', () => {
    const atlas = makeAtlas(32, 32);
    const tileset = createTilesetFromAtlas(atlas, 32, 32);

    expect(tileset.atlas).toBe(atlas);
  });

  it('yields zero rows and columns when atlas image is null', () => {
    const atlas = createTextureAtlas();
    const tileset = createTilesetFromAtlas(atlas, 32, 32);

    expect(tileset.rows).toBe(0);
    expect(tileset.columns).toBe(0);
    expect(atlas.regions).toHaveLength(0);
  });
});

describe('createTilesetFromImageResource', () => {
  it('creates an atlas and tileset from an ImageResource', () => {
    const source = createImageResourceFromImageElement({ width: 128, height: 64 } as HTMLImageElement);
    const tileset = createTilesetFromImageResource(source, 32, 32);

    expect(tileset.columns).toBe(4);
    expect(tileset.rows).toBe(2);
    expect(tileset.atlas?.image).toBe(source);
  });

  it('initializes regions for each tile', () => {
    const source = createImageResourceFromImageElement({ width: 64, height: 32 } as HTMLImageElement);
    const tileset = createTilesetFromImageResource(source, 32, 32);

    expect(tileset.atlas?.regions).toHaveLength(2);
  });
});

describe('loadTilesetFromArrayBuffer', () => {
  it('resolves to a Tileset with tileWidth and tileHeight set', async () => {
    const buf = new ArrayBuffer(16);
    new Uint8Array(buf).set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const tileset = await loadTilesetFromArrayBuffer(buf, 32, 16);

    expect(tileset.tileWidth).toBe(32);
    expect(tileset.tileHeight).toBe(16);
    expect(tileset.atlas?.image?.source).toBeInstanceOf(HTMLImageElement);
  });

  it('throws when mime type cannot be detected', async () => {
    const buf = new ArrayBuffer(16);
    await expect(loadTilesetFromArrayBuffer(buf, 32, 32)).rejects.toThrow('Unable to determine image type');
  });
});

describe('loadTilesetFromBase64', () => {
  it('resolves to a Tileset with the correct tile dimensions', async () => {
    const tileset = await loadTilesetFromBase64('abc123', 'image/png', 16, 16);
    expect(tileset.tileWidth).toBe(16);
    expect(tileset.tileHeight).toBe(16);
    expect(tileset.atlas?.image?.source).toBeInstanceOf(HTMLImageElement);
  });
});

describe('loadTilesetFromBlob', () => {
  it('resolves to a Tileset with a non-null atlas image', async () => {
    const blob = new Blob([], { type: 'image/png' });
    const tileset = await loadTilesetFromBlob(blob, 32, 32);
    expect(tileset.atlas?.image?.source).toBeInstanceOf(HTMLImageElement);
  });
});

describe('loadTilesetFromUrl', () => {
  it('resolves to a Tileset with the correct tile dimensions', async () => {
    const tileset = await loadTilesetFromUrl('data:image/png;base64,abc', 32, 32);
    expect(tileset.tileWidth).toBe(32);
    expect(tileset.tileHeight).toBe(32);
    expect(tileset.atlas?.image?.source).toBeInstanceOf(HTMLImageElement);
  });
});
