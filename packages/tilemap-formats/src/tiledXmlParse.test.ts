import { describe, expect, it } from 'vitest';

import { decodeTiledGid } from './tiledGid';
import { parseTiledTilesetJson, parseTiledTmj } from './tiledJsonParse';
import type { TiledParseOptions } from './tiledOptions';
import { parseTiledTileset, parseTiledTmx } from './tiledXmlParse';

// A 2x2 orthogonal map with a CSV tile layer drawing from two tilesets (firstgid 1 and 5), one
// embedded tileset and one external `source="ext.tsx"` ref, an object group with a point and a
// rectangle, and a typed property block. Cell (0,1) sets the horizontal flip bit on tile id 1.
const orthogonalTmx = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<map version="1.10" tiledversion="1.10.2" orientation="orthogonal" renderorder="right-down" width="2" height="2" tilewidth="32" tileheight="32" infinite="0" backgroundcolor="#ff8800">',
  ' <properties>',
  '  <property name="author" value="flight"/>',
  '  <property name="level" type="int" value="3"/>',
  '  <property name="hard" type="bool" value="true"/>',
  ' </properties>',
  ' <tileset firstgid="1" name="A" tilewidth="32" tileheight="32" tilecount="4" columns="2">',
  '  <image source="a.png" width="64" height="64"/>',
  ' </tileset>',
  ' <tileset firstgid="5" source="ext.tsx"/>',
  ' <layer id="1" name="ground" width="2" height="2">',
  '  <data encoding="csv">1,5,2147483649,6</data>',
  ' </layer>',
  ' <objectgroup id="2" name="things">',
  '  <object id="1" name="spawn" type="marker" x="16" y="16"><point/></object>',
  '  <object id="2" name="wall" type="collider" x="0" y="0" width="32" height="32"/>',
  ' </objectgroup>',
  '</map>',
].join('\n');

const orthogonalTmj = JSON.stringify({
  backgroundcolor: '#ff8800',
  height: 2,
  infinite: false,
  layers: [
    {
      data: [1, 5, 2147483649, 6],
      height: 2,
      id: 1,
      name: 'ground',
      opacity: 1,
      type: 'tilelayer',
      visible: true,
      width: 2,
    },
    {
      id: 2,
      name: 'things',
      objects: [
        { id: 1, name: 'spawn', point: true, type: 'marker', x: 16, y: 16 },
        { height: 32, id: 2, name: 'wall', type: 'collider', width: 32, x: 0, y: 0 },
      ],
      opacity: 1,
      type: 'objectgroup',
      visible: true,
    },
  ],
  orientation: 'orthogonal',
  properties: [
    { name: 'author', type: 'string', value: 'flight' },
    { name: 'level', type: 'int', value: 3 },
    { name: 'hard', type: 'bool', value: true },
  ],
  renderorder: 'right-down',
  tiledversion: '1.10.2',
  tileheight: 32,
  tilesets: [
    {
      columns: 2,
      firstgid: 1,
      image: 'a.png',
      imageheight: 64,
      imagewidth: 64,
      name: 'A',
      tilecount: 4,
      tileheight: 32,
      tiles: [],
      tilewidth: 32,
    },
    { firstgid: 5, source: 'ext.tsx' },
  ],
  tilewidth: 32,
  type: 'map',
  version: '1.10',
  width: 2,
});

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

function tmxWithData(dataElement: string): string {
  return `<map version="1" width="2" height="2" tilewidth="32" tileheight="32"><layer id="1" name="g" width="2" height="2">${dataElement}</layer></map>`;
}

describe('parseTiledTileset', () => {
  it('parses a standalone TSX tileset with per-tile animation and properties', () => {
    const tsx = [
      '<tileset name="terrain" tilewidth="16" tileheight="16" tilecount="9" columns="3" spacing="1" margin="2">',
      ' <image source="terrain.png" width="50" height="50"/>',
      ' <properties><property name="solid" type="bool" value="true"/></properties>',
      ' <tile id="0" type="water">',
      '  <animation><frame tileid="0" duration="100"/><frame tileid="1" duration="120"/></animation>',
      ' </tile>',
      '</tileset>',
    ].join('\n');
    const tileset = parseTiledTileset(tsx)!;
    expect(tileset.name).toBe('terrain');
    expect(tileset.image).toBe('terrain.png');
    expect(tileset.imageWidth).toBe(50);
    expect(tileset.columns).toBe(3);
    expect(tileset.spacing).toBe(1);
    expect(tileset.margin).toBe(2);
    expect(tileset.properties).toEqual([{ name: 'solid', type: 'bool', value: true }]);
    expect(tileset.tiles).toHaveLength(1);
    expect(tileset.tiles[0].type).toBe('water');
    expect(tileset.tiles[0].animation).toEqual([
      { duration: 100, tileId: 0 },
      { duration: 120, tileId: 1 },
    ]);
  });

  it('returns null when the root is not a tileset', () => {
    expect(parseTiledTileset('<map/>')).toBeNull();
    expect(parseTiledTileset('not xml')).toBeNull();
  });
});

describe('parseTiledTmx', () => {
  it('parses map metadata, orientation, and background color', () => {
    const map = parseTiledTmx(orthogonalTmx)!;
    expect(map.orientation).toBe('orthogonal');
    expect(map.renderOrder).toBe('right-down');
    expect(map.width).toBe(2);
    expect(map.height).toBe(2);
    expect(map.tileWidth).toBe(32);
    expect(map.infinite).toBe(false);
    expect(map.version).toBe('1.10');
    expect(map.tiledVersion).toBe('1.10.2');
    expect(map.backgroundColor).toBe(0xff8800ff);
  });

  it('parses typed properties', () => {
    const map = parseTiledTmx(orthogonalTmx)!;
    expect(map.properties).toEqual([
      { name: 'author', type: 'string', value: 'flight' },
      { name: 'level', type: 'int', value: 3 },
      { name: 'hard', type: 'bool', value: true },
    ]);
  });

  it('parses embedded and external tileset refs', () => {
    const map = parseTiledTmx(orthogonalTmx)!;
    expect(map.tilesets).toHaveLength(2);
    expect(map.tilesets[0].firstGid).toBe(1);
    expect(map.tilesets[0].source).toBeNull();
    expect(map.tilesets[0].tileset?.name).toBe('A');
    expect(map.tilesets[0].tileset?.image).toBe('a.png');
    expect(map.tilesets[1].firstGid).toBe(5);
    expect(map.tilesets[1].source).toBe('ext.tsx');
    expect(map.tilesets[1].tileset).toBeNull();
  });

  it('preserves raw GIDs including the flip bit', () => {
    const map = parseTiledTmx(orthogonalTmx)!;
    const layer = map.layers[0];
    expect(layer.type).toBe('tilelayer');
    if (layer.type !== 'tilelayer') return;
    expect(Array.from(layer.data)).toEqual([1, 5, 2147483649, 6]);
    expect(decodeTiledGid(layer.data[2])).toMatchObject({ flipHorizontal: true, tileId: 1 });
  });

  it('parses object groups with point and rectangle objects', () => {
    const map = parseTiledTmx(orthogonalTmx)!;
    const layer = map.layers[1];
    expect(layer.type).toBe('objectgroup');
    if (layer.type !== 'objectgroup') return;
    expect(layer.objects).toHaveLength(2);
    expect(layer.objects[0]).toMatchObject({ name: 'spawn', point: true, type: 'marker', x: 16, y: 16 });
    expect(layer.objects[1]).toMatchObject({ ellipse: false, height: 32, name: 'wall', point: false, width: 32 });
  });

  it('decodes base64 and csv layer data to the same GIDs', () => {
    const csv = parseTiledTmx(tmxWithData('<data encoding="csv">1,5,2147483649,6</data>'))!;
    const b64 = parseTiledTmx(tmxWithData(`<data encoding="base64">${base64Layer([1, 5, 2147483649, 6])}</data>`))!;
    const csvLayer = csv.layers[0];
    const b64Layer = b64.layers[0];
    if (csvLayer.type !== 'tilelayer' || b64Layer.type !== 'tilelayer') throw new Error('expected tile layers');
    expect(Array.from(b64Layer.data)).toEqual(Array.from(csvLayer.data));
  });

  it('preserves a compressed layer as an empty grid without an inflate seam, and decodes with one', () => {
    const payload = base64Layer([1, 5, 2147483649, 6]);
    const tmx = tmxWithData(`<data encoding="base64" compression="gzip">${payload}</data>`);

    const dropped = parseTiledTmx(tmx)!;
    const droppedLayer = dropped.layers[0];
    if (droppedLayer.type !== 'tilelayer') throw new Error('expected a tile layer');
    expect(Array.from(droppedLayer.data)).toEqual([0, 0, 0, 0]);

    const options: TiledParseOptions = { inflate: (bytes) => new Uint8Array(bytes) };
    const decoded = parseTiledTmx(tmx, options)!;
    const decodedLayer = decoded.layers[0];
    if (decodedLayer.type !== 'tilelayer') throw new Error('expected a tile layer');
    expect(Array.from(decodedLayer.data)).toEqual([1, 5, 2147483649, 6]);
  });

  it('parses to a document equivalent to the TMJ form', () => {
    expect(parseTiledTmx(orthogonalTmx)).toEqual(parseTiledTmj(orthogonalTmj));
    // Cross-check that the TSJ/TSX embedded tileset shapes also match.
    expect(
      parseTiledTilesetJson(
        '{"name":"A","tilewidth":32,"tileheight":32,"tilecount":4,"columns":2,"image":"a.png","imagewidth":64,"imageheight":64,"tiles":[]}',
      ),
    ).toEqual(
      parseTiledTileset(
        '<tileset name="A" tilewidth="32" tileheight="32" tilecount="4" columns="2"><image source="a.png" width="64" height="64"/></tileset>',
      ),
    );
  });

  it('returns null for malformed input', () => {
    expect(parseTiledTmx('<foo/>')).toBeNull();
    expect(parseTiledTmx('garbage')).toBeNull();
  });
});
