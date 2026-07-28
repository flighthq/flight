import { createTexture } from '@flighthq/texture/contract';

import { createTextureAtlasFromGrid } from './textureAtlasGrid';

describe('createTextureAtlasFromGrid', () => {
  it('attaches the optional Texture', () => {
    const texture = createTexture();
    const atlas = createTextureAtlasFromGrid(
      { columns: 1, imageFile: '', imageHeight: 32, imageWidth: 32, rows: 1 },
      texture,
    );
    expect(atlas.texture).toBe(texture);
  });

  it('derives cells after per-axis margins and spacing', () => {
    const atlas = createTextureAtlasFromGrid({
      columns: 2,
      imageFile: '',
      imageHeight: 38,
      imageWidth: 74,
      marginX: 2,
      marginY: 3,
      rows: 1,
      spacingX: 4,
      spacingY: 2,
    });
    expect(atlas.regions).toHaveLength(2);
    expect(atlas.regions[0]).toMatchObject({ height: 32, width: 33, x: 2, y: 3 });
    expect(atlas.regions[1]).toMatchObject({ height: 32, width: 33, x: 39, y: 3 });
  });

  it('honors explicit cell dimensions without admitting partial trailing cells', () => {
    const atlas = createTextureAtlasFromGrid({
      columns: 2,
      frameHeight: 32,
      frameWidth: 32,
      imageFile: '',
      imageHeight: 35,
      imageWidth: 69,
      marginX: 1,
      marginY: 1,
      rows: 1,
      spacingX: 2,
    });
    expect(atlas.regions.map(({ x, y, width, height }) => ({ height, width, x, y }))).toEqual([
      { height: 32, width: 32, x: 1, y: 1 },
      { height: 32, width: 32, x: 35, y: 1 },
    ]);
  });

  it('numbers and names regions in row-major order', () => {
    const atlas = createTextureAtlasFromGrid({
      columns: 2,
      imageFile: '',
      imageHeight: 16,
      imageWidth: 16,
      namePrefix: 'tile_',
      rows: 2,
    });
    expect(atlas.regions.map(({ id, name, x, y }) => ({ id, name, x, y }))).toEqual([
      { id: 0, name: 'tile_0', x: 0, y: 0 },
      { id: 1, name: 'tile_1', x: 8, y: 0 },
      { id: 2, name: 'tile_2', x: 0, y: 8 },
      { id: 3, name: 'tile_3', x: 8, y: 8 },
    ]);
  });
});
