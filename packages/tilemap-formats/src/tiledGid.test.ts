import { describe, expect, it } from 'vitest';

import { decodeTiledGid, getTiledTilesetRefForGid } from './tiledGid';
import { parseTiledTmx } from './tiledXmlParse';

const twoTilesetMap = parseTiledTmx(
  '<map version="1" width="1" height="1" tilewidth="1" tileheight="1">' +
    '<tileset firstgid="1" source="a.tsx"/>' +
    '<tileset firstgid="5" source="b.tsx"/>' +
    '</map>',
)!;

describe('decodeTiledGid', () => {
  it('splits an unflipped gid into its tile id with no flags', () => {
    expect(decodeTiledGid(6)).toEqual({
      flipDiagonal: false,
      flipHorizontal: false,
      flipVertical: false,
      tileId: 6,
    });
  });

  it('recovers the horizontal flip flag and base tile id from a flipped gid', () => {
    // tile id 1 with the horizontal (high) bit set: 1 | 0x80000000.
    expect(decodeTiledGid(2147483649)).toEqual({
      flipDiagonal: false,
      flipHorizontal: true,
      flipVertical: false,
      tileId: 1,
    });
  });

  it('decodes all three flip bits together', () => {
    const gid = (0x80000000 | 0x40000000 | 0x20000000 | 7) >>> 0;
    expect(decodeTiledGid(gid)).toEqual({
      flipDiagonal: true,
      flipHorizontal: true,
      flipVertical: true,
      tileId: 7,
    });
  });
});

describe('getTiledTilesetRefForGid', () => {
  it('finds the ref with the largest firstGid not exceeding the tile id', () => {
    expect(getTiledTilesetRefForGid(twoTilesetMap, 3)?.firstGid).toBe(1);
    expect(getTiledTilesetRefForGid(twoTilesetMap, 5)?.firstGid).toBe(5);
    expect(getTiledTilesetRefForGid(twoTilesetMap, 9)?.firstGid).toBe(5);
  });

  it('returns null for an empty tile', () => {
    expect(getTiledTilesetRefForGid(twoTilesetMap, 0)).toBeNull();
  });
});
