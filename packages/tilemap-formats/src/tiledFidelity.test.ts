import { describe, expect, it } from 'vitest';

import { parseTiledTmj } from './tiledJsonParse';
import { formatTiledTmj } from './tiledTmjFormat';
import { formatTiledTmx } from './tiledTmxFormat';
import { parseTiledTmx } from './tiledXmlParse';

// Every field this sweep added, in one document per front-end, so a round trip proves the whole set
// rather than each field in isolation. Each construct carries a NON-DEFAULT value: a field that
// defaults to the same thing it parses to would round-trip even if the parser dropped it entirely.
const fidelityTmx = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<map version="1.10" orientation="hexagonal" renderorder="right-down" width="2" height="1" tilewidth="16" tileheight="16" infinite="0" staggeraxis="y" staggerindex="odd" hexsidelength="8">',
  ' <tileset firstgid="1" name="base" tilewidth="16" tileheight="16" tilecount="2" columns="2" objectalignment="bottomleft">',
  '  <tileoffset x="3" y="-5"/>',
  '  <image source="base.png" width="32" height="16"/>',
  ' </tileset>',
  ' <layer id="1" name="ground" class="terrain" tintcolor="#ff8800" parallaxx="0.5" parallaxy="0.25" width="2" height="1"><data encoding="csv">1,2</data></layer>',
  ' <objectgroup id="2" name="objs">',
  '  <object id="1" name="rot" x="4" y="6" width="8" height="8" rotation="45" visible="0"/>',
  ' </objectgroup>',
  ' <imagelayer id="3" name="bg" repeatx="1" repeaty="1"><image source="sky.png"/></imagelayer>',
  '</map>',
].join('\n');

describe('Tiled document fidelity', () => {
  it('carries object rotation and visibility through TMX', () => {
    const map = parseTiledTmx(fidelityTmx)!;
    const group = map.layers[1];
    expect(group.type).toBe('objectgroup');
    if (group.type !== 'objectgroup') return;
    expect(group.objects[0].rotation).toBe(45);
    expect(group.objects[0].visible).toBe(false);
  });

  it('carries layer tint, parallax and class through TMX', () => {
    const layer = parseTiledTmx(fidelityTmx)!.layers[0];
    expect(layer.tintColor).toBe(0xff8800ff);
    expect(layer.parallaxX).toBe(0.5);
    expect(layer.parallaxY).toBe(0.25);
    expect(layer.class).toBe('terrain');
  });

  it('defaults parallax to lockstep, not to zero, when the document declares none', () => {
    // 0 would freeze the layer against the camera; the Tiled default is 1.
    const map = parseTiledTmx(fidelityTmx.replace(' parallaxx="0.5" parallaxy="0.25"', ''))!;
    expect(map.layers[0].parallaxX).toBe(1);
    expect(map.layers[0].parallaxY).toBe(1);
  });

  it('carries map stagger and hex parameters through TMX', () => {
    const map = parseTiledTmx(fidelityTmx)!;
    expect(map.staggerAxis).toBe('y');
    expect(map.staggerIndex).toBe('odd');
    expect(map.hexSideLength).toBe(8);
  });

  it('leaves stagger parameters null for an orthogonal map, so re-emit adds no attributes', () => {
    const map = parseTiledTmx(fidelityTmx.replace('hexagonal', 'orthogonal'))!;
    const text = formatTiledTmx({ ...map, hexSideLength: null, staggerAxis: null, staggerIndex: null });
    expect(text).not.toContain('staggeraxis');
    expect(text).not.toContain('hexsidelength');
  });

  it('carries tileset tile offset and object alignment through TMX', () => {
    const tileset = parseTiledTmx(fidelityTmx)!.tilesets[0].tileset!;
    expect(tileset.tileOffsetX).toBe(3);
    expect(tileset.tileOffsetY).toBe(-5);
    expect(tileset.objectAlignment).toBe('bottomleft');
  });

  it('carries image-layer repeat through TMX', () => {
    const layer = parseTiledTmx(fidelityTmx)!.layers[2];
    expect(layer.type).toBe('imagelayer');
    if (layer.type !== 'imagelayer') return;
    expect(layer.repeatX).toBe(true);
    expect(layer.repeatY).toBe(true);
  });

  it('round-trips every added field through TMX', () => {
    const map = parseTiledTmx(fidelityTmx)!;
    expect(parseTiledTmx(formatTiledTmx(map))).toEqual(map);
  });

  it('round-trips every added field through TMJ, and TMJ agrees with TMX', () => {
    const map = parseTiledTmx(fidelityTmx)!;
    const viaJson = parseTiledTmj(formatTiledTmj(map));
    // The two front-ends must produce the same document for the same map, or a caller who switches
    // format silently loses whichever fields only one side models.
    expect(viaJson).toEqual(map);
  });
});
