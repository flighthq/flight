import { describe, expect, it } from 'vitest';

import { parseTiledTilesetJson, parseTiledTmj } from './tiledJsonParse';
import type { TiledParseOptions } from './tiledOptions';

function base64Layer(gids: readonly number[]): string {
  const bytes = new Uint8Array(gids.length * 4);
  const view = new DataView(bytes.buffer);
  gids.forEach((gid, i) => view.setUint32(i * 4, gid, true));
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += table[b0 >> 2] + table[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? table[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? table[b2 & 63] : '=';
  }
  return out;
}

function tmjWithData(data: unknown, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    height: 2,
    layers: [{ data, height: 2, id: 1, name: 'g', type: 'tilelayer', width: 2, ...extra }],
    tilewidth: 32,
    tileheight: 32,
    type: 'map',
    version: '1.10',
    width: 2,
  });
}

describe('parseTiledTilesetJson', () => {
  it('parses a standalone TSJ tileset', () => {
    const tsj = JSON.stringify({
      columns: 3,
      image: 'terrain.png',
      imageheight: 50,
      imagewidth: 50,
      margin: 2,
      name: 'terrain',
      spacing: 1,
      tilecount: 9,
      tileheight: 16,
      tiles: [{ animation: [{ duration: 100, tileid: 0 }], id: 0, type: 'water' }],
      tilewidth: 16,
    });
    const tileset = parseTiledTilesetJson(tsj)!;
    expect(tileset.name).toBe('terrain');
    expect(tileset.image).toBe('terrain.png');
    expect(tileset.columns).toBe(3);
    expect(tileset.tiles[0].animation).toEqual([{ duration: 100, tileId: 0 }]);
  });

  it('returns null on malformed JSON', () => {
    expect(parseTiledTilesetJson('{ not json')).toBeNull();
    expect(parseTiledTilesetJson('[]')).toBeNull();
  });
});

describe('parseTiledTmj', () => {
  it('parses a polygon object and its points', () => {
    const tmj = JSON.stringify({
      height: 1,
      layers: [
        {
          id: 1,
          name: 'shapes',
          objects: [
            {
              id: 1,
              name: 'zone',
              polygon: [
                { x: 0, y: 0 },
                { x: 32, y: 0 },
                { x: 32, y: 32 },
              ],
              type: '',
              x: 4,
              y: 4,
            },
          ],
          type: 'objectgroup',
        },
      ],
      tileheight: 32,
      tilewidth: 32,
      type: 'map',
      version: '1.10',
      width: 1,
    });
    const map = parseTiledTmj(tmj)!;
    const layer = map.layers[0];
    if (layer.type !== 'objectgroup') throw new Error('expected an object group');
    expect(layer.objects[0].polygon).toEqual([
      { x: 0, y: 0 },
      { x: 32, y: 0 },
      { x: 32, y: 32 },
    ]);
  });

  it('decodes an array-data tile layer', () => {
    const map = parseTiledTmj(tmjWithData([1, 5, 2147483649, 6]))!;
    const layer = map.layers[0];
    if (layer.type !== 'tilelayer') throw new Error('expected a tile layer');
    expect(Array.from(layer.data)).toEqual([1, 5, 2147483649, 6]);
  });

  it('decodes a base64 string tile layer', () => {
    const map = parseTiledTmj(tmjWithData(base64Layer([1, 5, 2147483649, 6]), { encoding: 'base64' }))!;
    const layer = map.layers[0];
    if (layer.type !== 'tilelayer') throw new Error('expected a tile layer');
    expect(Array.from(layer.data)).toEqual([1, 5, 2147483649, 6]);
  });

  it('preserves a compressed layer as empty without an inflate seam, and decodes with one', () => {
    const json = tmjWithData(base64Layer([1, 5, 2147483649, 6]), { compression: 'zlib', encoding: 'base64' });

    const dropped = parseTiledTmj(json)!;
    const droppedLayer = dropped.layers[0];
    if (droppedLayer.type !== 'tilelayer') throw new Error('expected a tile layer');
    expect(Array.from(droppedLayer.data)).toEqual([0, 0, 0, 0]);

    const options: TiledParseOptions = { inflate: (bytes) => new Uint8Array(bytes) };
    const decoded = parseTiledTmj(json, options)!;
    const decodedLayer = decoded.layers[0];
    if (decodedLayer.type !== 'tilelayer') throw new Error('expected a tile layer');
    expect(Array.from(decodedLayer.data)).toEqual([1, 5, 2147483649, 6]);
  });

  it('returns null on malformed JSON', () => {
    expect(parseTiledTmj('{ not json')).toBeNull();
    expect(parseTiledTmj('42')).toBeNull();
  });
});
