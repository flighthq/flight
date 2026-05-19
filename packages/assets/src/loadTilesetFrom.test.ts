import {
  loadTilesetFromArrayBuffer,
  loadTilesetFromBase64,
  loadTilesetFromBlob,
  loadTilesetFromURL,
} from './loadTilesetFrom';

// Stub img.decode() so async load functions resolve immediately in jsdom.
beforeEach(() => {
  HTMLImageElement.prototype.decode = vi.fn().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (HTMLImageElement.prototype as Partial<HTMLImageElement>).decode;
});

describe('loadTilesetFromArrayBuffer', () => {
  it('resolves to a Tileset with tileWidth and tileHeight set', async () => {
    const buf = new ArrayBuffer(16);
    new Uint8Array(buf).set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const tileset = await loadTilesetFromArrayBuffer(buf, 32, 16);

    expect(tileset.tileWidth).toBe(32);
    expect(tileset.tileHeight).toBe(16);
    expect(tileset.atlas?.image?.src).toBeInstanceOf(HTMLImageElement);
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
    expect(tileset.atlas?.image?.src).toBeInstanceOf(HTMLImageElement);
  });
});

describe('loadTilesetFromBlob', () => {
  it('resolves to a Tileset with a non-null atlas image', async () => {
    const blob = new Blob([], { type: 'image/png' });
    const tileset = await loadTilesetFromBlob(blob, 32, 32);
    expect(tileset.atlas?.image?.src).toBeInstanceOf(HTMLImageElement);
  });
});

describe('loadTilesetFromURL', () => {
  it('resolves to a Tileset with the correct tile dimensions', async () => {
    const tileset = await loadTilesetFromURL('data:image/png;base64,abc', 32, 32);
    expect(tileset.tileWidth).toBe(32);
    expect(tileset.tileHeight).toBe(32);
    expect(tileset.atlas?.image?.src).toBeInstanceOf(HTMLImageElement);
  });
});
