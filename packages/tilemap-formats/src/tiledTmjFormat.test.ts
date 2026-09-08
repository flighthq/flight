import { describe, expect, it } from 'vitest';

import { parseTiledTilesetJson, parseTiledTmj } from './tiledJsonParse';
import { formatTiledTilesetJson, formatTiledTmj } from './tiledTmjFormat';
import { formatTiledTileset } from './tiledTmxFormat';
import { parseTiledTileset, parseTiledTmx } from './tiledXmlParse';

// Mirrors the TMX round-trip fixture: every modeled construct in one document, so a single re-parse
// proves the set rather than each field alone.
const richTmx = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<map version="1.10" tiledversion="1.10.2" orientation="orthogonal" renderorder="right-down" width="2" height="2" tilewidth="16" tileheight="16" infinite="0" backgroundcolor="#204060">',
  ' <properties><property name="name" value="demo"/><property name="score" type="int" value="10"/></properties>',
  ' <tileset firstgid="1" name="base" tilewidth="16" tileheight="16" tilecount="4" columns="2">',
  '  <tileoffset x="2" y="4"/>',
  '  <image source="base.png" width="32" height="32"/>',
  '  <tile id="0" type="lava"><animation><frame tileid="0" duration="200"/></animation></tile>',
  ' </tileset>',
  ' <tileset firstgid="5" source="extra.tsx"/>',
  ' <layer id="1" name="ground" width="2" height="2"><data encoding="csv">1,2,5,2147483649</data></layer>',
  ' <objectgroup id="2" name="objs">',
  '  <object id="1" name="p" type="marker" x="1" y="2" rotation="90"><point/></object>',
  ' </objectgroup>',
  ' <imagelayer id="3" name="bg"><image source="sky.png"/></imagelayer>',
  ' <group id="4" name="grp">',
  '  <layer id="5" name="over" width="2" height="2"><data encoding="csv">0,0,1,1</data></layer>',
  ' </group>',
  '</map>',
].join('\n');

const richTsx = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<tileset name="base" tilewidth="16" tileheight="16" tilecount="4" columns="2" objectalignment="center">',
  ' <tileoffset x="1" y="2"/>',
  ' <image source="base.png" width="32" height="32"/>',
  ' <tile id="1" type="wall"><properties><property name="solid" type="bool" value="true"/></properties></tile>',
  '</tileset>',
].join('\n');

describe('formatTiledTilesetJson', () => {
  it('agrees with the TSJ formatter, so a tileset survives either sidecar format', () => {
    const tileset = parseTiledTileset(richTsx)!;
    expect(parseTiledTilesetJson(formatTiledTilesetJson(tileset))).toEqual(
      parseTiledTileset(formatTiledTileset(tileset)),
    );
  });

  it('round-trips parse -> format -> parse for a standalone tileset', () => {
    const tileset = parseTiledTileset(richTsx)!;
    expect(parseTiledTilesetJson(formatTiledTilesetJson(tileset))).toEqual(tileset);
  });

  it('marks the document a tileset and omits the firstgid it has no map to sit in', () => {
    const text = formatTiledTilesetJson(parseTiledTileset(richTsx)!);
    expect(JSON.parse(text).type).toBe('tileset');
    expect(JSON.parse(text).firstgid).toBeUndefined();
  });
});

describe('formatTiledTmj', () => {
  it('round-trips parse -> format -> parse for the modeled fields', () => {
    const map = parseTiledTmx(richTmx)!;
    expect(parseTiledTmj(formatTiledTmj(map))).toEqual(map);
  });

  it('writes tile layer data as a plain GID array, readable without an inflate seam', () => {
    const map = parseTiledTmx(richTmx)!;
    const layer = JSON.parse(formatTiledTmj(map)).layers[0];
    // A flipped GID exceeds 2^31, so it must survive as a number rather than being written signed.
    expect(layer.data).toEqual([1, 2, 5, 2147483649]);
    expect(layer.encoding).toBeUndefined();
  });

  it('emits external tileset refs by source and embedded tilesets inline', () => {
    const tilesets = JSON.parse(formatTiledTmj(parseTiledTmx(richTmx)!)).tilesets;
    expect(tilesets[1]).toEqual({ firstgid: 5, source: 'extra.tsx' });
    expect(tilesets[0].name).toBe('base');
    expect(tilesets[0].tileoffset).toEqual({ x: 2, y: 4 });
  });

  it('reports next ids past the largest present, including inside group layers', () => {
    const out = JSON.parse(formatTiledTmj(parseTiledTmx(richTmx)!));
    // Layer ids run to 5 inside the group, so a re-emit Tiled can keep editing needs 6, not 5.
    expect(out.nextlayerid).toBe(6);
    expect(out.nextobjectid).toBe(2);
  });
});
