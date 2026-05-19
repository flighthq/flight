import {
  loadTextureAtlasFromArrayBuffer,
  loadTextureAtlasFromBase64,
  loadTextureAtlasFromBlob,
  loadTextureAtlasFromURL,
} from './loadTextureAtlasFrom';

// Stub img.decode() so async load functions resolve immediately in jsdom.
beforeEach(() => {
  HTMLImageElement.prototype.decode = vi.fn().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (HTMLImageElement.prototype as Partial<HTMLImageElement>).decode;
});

describe('loadTextureAtlasFromArrayBuffer', () => {
  it('resolves to a TextureAtlas with a non-null image', async () => {
    const buf = new ArrayBuffer(16);
    new Uint8Array(buf).set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const atlas = await loadTextureAtlasFromArrayBuffer(buf);

    expect(atlas.image).not.toBeNull();
    expect(atlas.image?.src).toBeInstanceOf(HTMLImageElement);
  });

  it('starts with an empty regions array', async () => {
    const buf = new ArrayBuffer(16);
    new Uint8Array(buf).set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const atlas = await loadTextureAtlasFromArrayBuffer(buf);

    expect(atlas.regions).toHaveLength(0);
  });

  it('throws when mime type cannot be detected', async () => {
    const buf = new ArrayBuffer(16);
    await expect(loadTextureAtlasFromArrayBuffer(buf)).rejects.toThrow('Unable to determine image type');
  });
});

describe('loadTextureAtlasFromBase64', () => {
  it('resolves to a TextureAtlas with a non-null image', async () => {
    const atlas = await loadTextureAtlasFromBase64('abc123', 'image/png');
    expect(atlas.image?.src).toBeInstanceOf(HTMLImageElement);
  });
});

describe('loadTextureAtlasFromBlob', () => {
  it('resolves to a TextureAtlas with a non-null image', async () => {
    const blob = new Blob([], { type: 'image/png' });
    const atlas = await loadTextureAtlasFromBlob(blob);
    expect(atlas.image?.src).toBeInstanceOf(HTMLImageElement);
  });
});

describe('loadTextureAtlasFromURL', () => {
  it('resolves to a TextureAtlas whose image src is an HTMLImageElement', async () => {
    const atlas = await loadTextureAtlasFromURL('data:image/png;base64,abc');
    expect(atlas.image?.src).toBeInstanceOf(HTMLImageElement);
  });
});
