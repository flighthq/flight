import type { TiledParseOptions } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { parseTiledTilesetJson, parseTiledTmj } from './tiledJsonParse';

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

  it('parses a group layer and its nested children', () => {
    const tmj = JSON.stringify({
      height: 2,
      layers: [
        {
          id: 1,
          name: 'top',
          type: 'group',
          layers: [
            { data: [1, 2, 3, 4], height: 2, id: 2, name: 'inner-tiles', type: 'tilelayer', width: 2 },
            { id: 3, image: 'bg.png', name: 'inner-image', type: 'imagelayer' },
          ],
        },
      ],
      tileheight: 32,
      tilewidth: 32,
      type: 'map',
      version: '1.10',
      width: 2,
    });
    const map = parseTiledTmj(tmj)!;
    expect(map.layers).toHaveLength(1);
    const group = map.layers[0];
    if (group.type !== 'group') throw new Error('expected a group layer');
    expect(group.name).toBe('top');
    expect(group.layers).toHaveLength(2);

    const tileChild = group.layers[0];
    if (tileChild.type !== 'tilelayer') throw new Error('expected a tile layer');
    expect(tileChild.name).toBe('inner-tiles');
    expect(Array.from(tileChild.data)).toEqual([1, 2, 3, 4]);

    const imageChild = group.layers[1];
    if (imageChild.type !== 'imagelayer') throw new Error('expected an image layer');
    expect(imageChild.name).toBe('inner-image');
    expect(imageChild.image).toBe('bg.png');
  });

  it('parses a multi-tileset map with two tilesets at different firstgid values', () => {
    const tmj = JSON.stringify({
      height: 1,
      layers: [{ data: [1, 5], height: 1, id: 1, name: 'g', type: 'tilelayer', width: 2 }],
      tileheight: 32,
      tilesets: [
        {
          columns: 2,
          firstgid: 1,
          image: 'terrain.png',
          imageheight: 64,
          imagewidth: 64,
          name: 'terrain',
          tilecount: 4,
          tileheight: 32,
          tilewidth: 32,
        },
        {
          columns: 3,
          firstgid: 5,
          image: 'items.png',
          imageheight: 64,
          imagewidth: 96,
          name: 'items',
          tilecount: 6,
          tileheight: 32,
          tilewidth: 32,
        },
      ],
      tilewidth: 32,
      type: 'map',
      version: '1.10',
      width: 2,
    });
    const map = parseTiledTmj(tmj)!;
    expect(map.tilesets).toHaveLength(2);
    expect(map.tilesets[0].firstGid).toBe(1);
    expect(map.tilesets[0].tileset!.name).toBe('terrain');
    expect(map.tilesets[1].firstGid).toBe(5);
    expect(map.tilesets[1].tileset!.name).toBe('items');
    expect(map.tilesets[1].tileset!.columns).toBe(3);
  });

  it('parses an object group with ellipse and polygon objects', () => {
    const tmj = JSON.stringify({
      height: 1,
      layers: [
        {
          id: 1,
          name: 'objects',
          objects: [
            { ellipse: true, height: 40, id: 1, name: 'circle', type: 'trigger', width: 40, x: 10, y: 20 },
            {
              height: 0,
              id: 2,
              name: 'region',
              polygon: [
                { x: 0, y: 0 },
                { x: 64, y: 0 },
                { x: 64, y: 64 },
                { x: 0, y: 64 },
              ],
              type: 'zone',
              width: 0,
              x: 100,
              y: 200,
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
    expect(layer.objects).toHaveLength(2);

    const ellipseObj = layer.objects[0];
    expect(ellipseObj.ellipse).toBe(true);
    expect(ellipseObj.name).toBe('circle');
    expect(ellipseObj.type).toBe('trigger');
    expect(ellipseObj.width).toBe(40);
    expect(ellipseObj.height).toBe(40);
    expect(ellipseObj.x).toBe(10);
    expect(ellipseObj.y).toBe(20);
    expect(ellipseObj.polygon).toBeNull();

    const polygonObj = layer.objects[1];
    expect(polygonObj.ellipse).toBe(false);
    expect(polygonObj.name).toBe('region');
    expect(polygonObj.type).toBe('zone');
    expect(polygonObj.x).toBe(100);
    expect(polygonObj.y).toBe(200);
    expect(polygonObj.polygon).toEqual([
      { x: 0, y: 0 },
      { x: 64, y: 0 },
      { x: 64, y: 64 },
      { x: 0, y: 64 },
    ]);
  });

  it('returns null on malformed JSON', () => {
    expect(parseTiledTmj('{ not json')).toBeNull();
    expect(parseTiledTmj('42')).toBeNull();
  });
});
