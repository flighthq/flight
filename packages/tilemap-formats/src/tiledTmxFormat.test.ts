import { describe, expect, it } from 'vitest';

import { formatTiledTmx } from './tiledTmxFormat';
import { parseTiledTmx } from './tiledXmlParse';

// A map exercising every modeled TMX construct: background + typed properties, an embedded tileset
// with an animated tile, an external tileset ref, a CSV tile layer (with a flipped GID), an object
// group (point / polygon-with-property), an image layer, and a nested group layer.
const richTmx = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<map version="1.10" tiledversion="1.10.2" orientation="orthogonal" renderorder="right-down" width="2" height="2" tilewidth="16" tileheight="16" infinite="0" backgroundcolor="#204060">',
  ' <properties><property name="name" value="demo"/><property name="score" type="int" value="10"/></properties>',
  ' <tileset firstgid="1" name="base" tilewidth="16" tileheight="16" tilecount="4" columns="2">',
  '  <image source="base.png" width="32" height="32"/>',
  '  <tile id="0" type="lava"><animation><frame tileid="0" duration="200"/></animation></tile>',
  ' </tileset>',
  ' <tileset firstgid="5" source="extra.tsx"/>',
  ' <layer id="1" name="ground" width="2" height="2"><data encoding="csv">1,2,5,2147483649</data></layer>',
  ' <objectgroup id="2" name="objs">',
  '  <object id="1" name="p" type="marker" x="1" y="2"><point/></object>',
  '  <object id="2" type="poly" x="0" y="0"><polygon points="0,0 8,0 8,8"/><properties><property name="tag" value="zone"/></properties></object>',
  ' </objectgroup>',
  ' <imagelayer id="3" name="bg"><image source="sky.png"/></imagelayer>',
  ' <group id="4" name="grp">',
  '  <layer id="5" name="over" width="2" height="2"><data encoding="csv">0,0,1,1</data></layer>',
  ' </group>',
  '</map>',
].join('\n');

describe('formatTiledTmx', () => {
  it('round-trips parse -> format -> parse for the modeled fields', () => {
    const map = parseTiledTmx(richTmx)!;
    const reparsed = parseTiledTmx(formatTiledTmx(map));
    expect(reparsed).toEqual(map);
  });

  it('writes tile layers as CSV data', () => {
    const map = parseTiledTmx(richTmx)!;
    const text = formatTiledTmx(map);
    expect(text).toContain('<data encoding="csv">');
    expect(text).toContain('1,2,5,2147483649');
  });

  it('emits external tileset refs by source and embedded tilesets inline', () => {
    const map = parseTiledTmx(richTmx)!;
    const text = formatTiledTmx(map);
    expect(text).toContain('<tileset firstgid="5" source="extra.tsx"/>');
    expect(text).toContain('firstgid="1" name="base"');
  });
});
