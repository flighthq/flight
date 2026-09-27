import { RequirementFacet } from '@flighthq/types/contract';

import {
  isReadableTilemapDocument,
  parseTilemapRequirements,
  TILEMAP_REQUIREMENT_KEY_NAMESPACE,
} from './tilemapRequirements.ts';

// One minimal document per built-in format. Each carries the invariant its own detector reads: an XML root
// element name, or Tiled's `type` field.
const TMX = '<?xml version="1.0"?><map version="1.10" width="1" height="1" tilewidth="8" tileheight="8"/>';
const TSX = '<?xml version="1.0"?><tileset version="1.10" name="t" tilewidth="8" tileheight="8" tilecount="1"/>';
const TMJ = JSON.stringify({ height: 1, layers: [], tileheight: 8, tilewidth: 8, type: 'map', width: 1 });
const TSJ = JSON.stringify({ image: 't.png', tilecount: 1, tileheight: 8, tilewidth: 8, type: 'tileset' });

describe('isReadableTilemapDocument', () => {
  it.each([
    ['TiledTmx', TMX],
    ['TiledTmj', TMJ],
    ['TiledTsx', TSX],
    ['TiledTsj', TSJ],
  ])('recognises a %s document', (_kind, text) => {
    expect(isReadableTilemapDocument(text)).toBe(true);
  });

  // ★ UNKNOWN CONTENT STAYS UNREADABLE RATHER THAN CLAIMING A FALLBACK. There is no default parser, so treating
  // "unrecognised" as some format would ship an implementation that cannot read the file. This matters more here
  // than for most families: `.json` and `.xml` are shared with several other formats, so the detector is asked
  // about a great many documents that are none of its business.
  it.each([
    ['empty text', ''],
    ['unrelated JSON', '{"hello":"world"}'],
    ['unrelated XML', '<?xml version="1.0"?><svg/>'],
    ['a JSON document declaring another Tiled type', '{"type":"objecttemplate"}'],
    ['malformed JSON', '{ not json'],
    ['prose', 'this is not a tilemap'],
  ])('reports %s unreadable', (_label, text) => {
    expect(isReadableTilemapDocument(text)).toBe(false);
  });
});

describe('parseTilemapRequirements', () => {
  it.each([
    ['TiledTmx', TMX],
    ['TiledTmj', TMJ],
    ['TiledTsx', TSX],
    ['TiledTsj', TSJ],
  ])('emits exactly the requirement for the %s parser', (kind, text) => {
    expect(parseTilemapRequirements(text).requirements).toEqual([
      { facet: RequirementFacet.DocumentFormat, key: `${TILEMAP_REQUIREMENT_KEY_NAMESPACE}.${kind}` },
    ]);
  });

  it('emits nothing for content no format recognises', () => {
    expect(parseTilemapRequirements('{"hello":"world"}').requirements).toEqual([]);
  });

  // ★ THE MAP-VS-TILESET ANSWER IS THE WHOLE POINT OF THIS INVENTORY. The two roles are separate parsers, so a
  // build that resolved the wrong one links an implementation that returns null for its own content. Both
  // directions are asserted in both representations, because the discrimination is different in each: the root
  // element in XML, Tiled's `type` in JSON.
  it('separates map from tileset in both representations', () => {
    expect(keyOf(TMX)).toBe('tilemap.TiledTmx');
    expect(keyOf(TSX)).toBe('tilemap.TiledTsx');
    expect(keyOf(TMJ)).toBe('tilemap.TiledTmj');
    expect(keyOf(TSJ)).toBe('tilemap.TiledTsj');
  });

  it('covers the document.format facet, so a build knows the question was asked', () => {
    expect(parseTilemapRequirements(TMX).covers).toEqual([RequirementFacet.DocumentFormat]);
  });
});

function keyOf(text: string): string | undefined {
  return parseTilemapRequirements(text).requirements[0]?.key;
}
