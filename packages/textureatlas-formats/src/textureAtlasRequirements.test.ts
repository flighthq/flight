import { RequirementFacet } from '@flighthq/types/contract';

import {
  isReadableTextureAtlas,
  parseTextureAtlasRequirements,
  TEXTURE_ATLAS_REQUIREMENT_KEY_NAMESPACE,
} from './textureAtlasRequirements.ts';

// One minimal document per built-in format. Aseprite and TexturePacker share a `{ frames, meta }` shape and are
// told apart by the app each writes, so both fixtures carry the real app strings.
const ASEPRITE = JSON.stringify({
  frames: { 'a 0.png': { duration: 100, frame: { h: 1, w: 1, x: 0, y: 0 } } },
  meta: { app: 'http://www.aseprite.org/', version: '1.3' },
});
const TEXTURE_PACKER = JSON.stringify({
  frames: { 'a.png': { frame: { h: 1, w: 1, x: 0, y: 0 } } },
  meta: { app: 'http://www.codeandweb.com/texturepacker' },
});
const STARLING = '<?xml version="1.0"?><TextureAtlas imagePath="a.png"><SubTexture name="a"/></TextureAtlas>';
const LIBGDX_ATLAS = 'a.png\nsize: 2,2\nformat: RGBA8888\nregion\n  rotate: false\n  xy: 0, 0\n';

describe('isReadableTextureAtlas', () => {
  it.each([
    ['aseprite', ASEPRITE],
    ['libgdxAtlas', LIBGDX_ATLAS],
    ['starling', STARLING],
    ['texturePacker', TEXTURE_PACKER],
  ])('recognises a %s document', (_kind, content) => {
    expect(isReadableTextureAtlas(content)).toBe(true);
  });

  it.each([
    ['empty text', ''],
    ['unrelated JSON', '{"hello":"world"}'],
    ['unrelated XML', '<?xml version="1.0"?><root/>'],
    ['malformed JSON', '{ not json'],
    ['a Cocos plist, which this family does not read', '<?xml version="1.0"?><plist><dict/></plist>'],
  ])('reports %s unreadable', (_label, content) => {
    expect(isReadableTextureAtlas(content)).toBe(false);
  });
});

describe('parseTextureAtlasRequirements', () => {
  it.each([
    ['aseprite', ASEPRITE],
    ['libgdxAtlas', LIBGDX_ATLAS],
    ['starling', STARLING],
    ['texturePacker', TEXTURE_PACKER],
  ])('emits exactly the requirement for the %s parser', (kind, content) => {
    expect(parseTextureAtlasRequirements(content).requirements).toEqual([
      { facet: RequirementFacet.DocumentFormat, key: `${TEXTURE_ATLAS_REQUIREMENT_KEY_NAMESPACE}.${kind}` },
    ]);
  });

  it('emits nothing for content no format recognises', () => {
    expect(parseTextureAtlasRequirements('{"hello":"world"}').requirements).toEqual([]);
  });

  // ★ THE DISCRIMINATION WITH REAL EDGE CASES. Aseprite and TexturePacker JSON differ only by the app string,
  // which is exactly where a re-implemented sniffer would diverge from the parser that actually runs.
  it('separates the two JSON formats the way the registry does', () => {
    expect(keyOf(ASEPRITE)).toBe('textureatlas.aseprite');
    expect(keyOf(TEXTURE_PACKER)).toBe('textureatlas.texturePacker');
  });

  // ★ THE SAME DOCUMENT IS ALSO A SPRITESHEET, AND THAT IS NOT THIS FAMILY'S PROBLEM. Both registries read
  // Aseprite, LibgdxAtlas, Starling and TexturePacker, so one file is legitimately usable as either. This family
  // answers only for itself — a caller analysing a shared extension unions what each family reports.
  it('answers only for this family, with its own namespace', () => {
    for (const content of [ASEPRITE, TEXTURE_PACKER, STARLING, LIBGDX_ATLAS]) {
      expect(keyOf(content)!.startsWith(`${TEXTURE_ATLAS_REQUIREMENT_KEY_NAMESPACE}.`)).toBe(true);
    }
  });
});

function keyOf(content: string): string | undefined {
  return parseTextureAtlasRequirements(content).requirements[0]?.key;
}
