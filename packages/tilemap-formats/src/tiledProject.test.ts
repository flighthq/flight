import { createTileset } from '@flighthq/tileset';
import type { TiledTilesetResolver } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { buildTilemapLayersFromTiled } from './tiledProject';
import { parseTiledTmx } from './tiledXmlParse';

function mapWithLayerData(data: string): ReturnType<typeof parseTiledTmx> {
  return parseTiledTmx(
    '<map version="1" width="2" height="2" tilewidth="16" tileheight="16">' +
      '<tileset firstgid="1" source="a.tsx"/>' +
      '<tileset firstgid="5" source="b.tsx"/>' +
      `<layer id="1" name="g" width="2" height="2"><data encoding="csv">${data}</data></layer>` +
      '<objectgroup id="2" name="o"><object id="1" x="0" y="0"/></objectgroup>' +
      '</map>',
  );
}

const tilesetA = createTileset({ columns: 2, rows: 2, tileHeight: 16, tileWidth: 16 });
const tilesetB = createTileset({ columns: 2, rows: 2, tileHeight: 16, tileWidth: 16 });

const resolve: TiledTilesetResolver = (ref) => {
  if (ref.firstGid === 1) return tilesetA;
  if (ref.firstGid === 5) return tilesetB;
  return null;
};

describe('buildTilemapLayersFromTiled', () => {
  it('splits a two-tileset layer into one TilemapData per tileset with local ids', () => {
    const map = mapWithLayerData('1,5,2147483649,6')!;
    const result = buildTilemapLayersFromTiled(map, 0, resolve)!;
    expect(result).toHaveLength(2);

    expect(result[0].tileset).toBe(tilesetA);
    // Cell 2's GID has the flip bit set; its tile id (1) still resolves to tileset A as local id 0.
    expect(Array.from(result[0].tiles)).toEqual([0, -1, 0, -1]);

    expect(result[1].tileset).toBe(tilesetB);
    expect(Array.from(result[1].tiles)).toEqual([-1, 0, -1, 1]);
    expect(result[1].columns).toBe(2);
    expect(result[1].rows).toBe(2);
  });

  it('returns a one-element array for a single-tileset layer', () => {
    const map = mapWithLayerData('1,2,1,2')!;
    const result = buildTilemapLayersFromTiled(map, 0, resolve)!;
    expect(result).toHaveLength(1);
    expect(result[0].tileset).toBe(tilesetA);
    expect(Array.from(result[0].tiles)).toEqual([0, 1, 0, 1]);
  });

  it('leaves an unresolved tileset empty while projecting the resolved one', () => {
    const map = mapWithLayerData('1,5,1,5')!;
    const onlyA: TiledTilesetResolver = (ref) => (ref.firstGid === 1 ? tilesetA : null);
    const result = buildTilemapLayersFromTiled(map, 0, onlyA)!;
    expect(result).toHaveLength(1);
    expect(result[0].tileset).toBe(tilesetA);
    expect(Array.from(result[0].tiles)).toEqual([0, -1, 0, -1]);
  });

  it('returns null when no referenced tileset resolves', () => {
    const map = mapWithLayerData('1,5,2147483649,6')!;
    expect(buildTilemapLayersFromTiled(map, 0, () => null)).toBeNull();
  });

  it('returns null for a non-tile layer or an out-of-range index', () => {
    const map = mapWithLayerData('1,5,2147483649,6')!;
    expect(buildTilemapLayersFromTiled(map, 1, resolve)).toBeNull();
    expect(buildTilemapLayersFromTiled(map, 9, resolve)).toBeNull();
  });
});
