import { imageSourceFromImageElement } from './imageSourceFrom';
import { createTextureAtlas } from './textureAtlas';
import { tilesetFromAtlas, tilesetFromImageSource } from './tilesetFrom';

function makeAtlas(width: number, height: number) {
  const source = imageSourceFromImageElement({ width, height } as HTMLImageElement);
  return createTextureAtlas({ image: source });
}

describe('tilesetFromAtlas', () => {
  it('derives rows and columns from atlas image dimensions', () => {
    const atlas = makeAtlas(64, 32);
    const tileset = tilesetFromAtlas(atlas, 32, 32);

    expect(tileset.columns).toBe(2);
    expect(tileset.rows).toBe(1);
    expect(tileset.tileWidth).toBe(32);
    expect(tileset.tileHeight).toBe(32);
  });

  it('initializes atlas regions for each tile', () => {
    const atlas = makeAtlas(64, 32);
    tilesetFromAtlas(atlas, 32, 32);

    expect(atlas.regions).toHaveLength(2);
  });

  it('uses the provided atlas', () => {
    const atlas = makeAtlas(32, 32);
    const tileset = tilesetFromAtlas(atlas, 32, 32);

    expect(tileset.atlas).toBe(atlas);
  });

  it('yields zero rows and columns when atlas image is null', () => {
    const atlas = createTextureAtlas();
    const tileset = tilesetFromAtlas(atlas, 32, 32);

    expect(tileset.rows).toBe(0);
    expect(tileset.columns).toBe(0);
    expect(atlas.regions).toHaveLength(0);
  });
});

describe('tilesetFromImageSource', () => {
  it('creates an atlas and tileset from an ImageSource', () => {
    const source = imageSourceFromImageElement({ width: 128, height: 64 } as HTMLImageElement);
    const tileset = tilesetFromImageSource(source, 32, 32);

    expect(tileset.columns).toBe(4);
    expect(tileset.rows).toBe(2);
    expect(tileset.atlas?.image).toBe(source);
  });

  it('initializes regions for each tile', () => {
    const source = imageSourceFromImageElement({ width: 64, height: 32 } as HTMLImageElement);
    const tileset = tilesetFromImageSource(source, 32, 32);

    expect(tileset.atlas?.regions).toHaveLength(2);
  });
});
