import { RequirementFacet } from '@flighthq/types/contract';

import {
  isReadableSpritesheet,
  parseSpritesheetRequirements,
  SPRITESHEET_REQUIREMENT_KEY_NAMESPACE,
} from './spritesheetRequirements.ts';

// One minimal document per built-in format. Aseprite writes its app as the full aseprite.org URL and the
// detector keys on that, so the short name 'aseprite' is NOT an Aseprite sheet by this family's reading — I
// checked the detector rather than assuming, after a short-name fixture was read as TexturePacker.
const ASEPRITE = JSON.stringify({
  frames: { 'a 0.png': { duration: 100, frame: { h: 1, w: 1, x: 0, y: 0 } } },
  meta: { app: 'http://www.aseprite.org/', version: '1.3' },
});
const TEXTURE_PACKER = JSON.stringify({
  frames: { 'a.png': { frame: { h: 1, w: 1, x: 0, y: 0 } } },
  meta: { app: 'http://www.codeandweb.com/texturepacker' },
});
const COCOS_PLIST = '<?xml version="1.0"?><plist version="1.0"><dict><key>frames</key><dict/></dict></plist>';
// A ParticleDesigner emitter config: the same container, a different format. It carries `textureFileName` too,
// which is why the discriminant had to be the `frames` dict the Cocos parser requires.
const PARTICLE_DESIGNER_PLIST =
  '<?xml version="1.0"?><plist version="1.0"><dict><key>maxParticles</key><integer>200</integer>' +
  '<key>textureFileName</key><string>spark.png</string></dict></plist>';
const STARLING = '<?xml version="1.0"?><TextureAtlas imagePath="a.png"><SubTexture name="a"/></TextureAtlas>';
const LIBGDX_ATLAS = 'a.png\nsize: 2,2\nformat: RGBA8888\nregion\n  rotate: false\n  xy: 0, 0\n';

describe('isReadableSpritesheet', () => {
  it.each([
    ['Aseprite', ASEPRITE],
    ['CocosPlist', COCOS_PLIST],
    ['LibgdxAtlas', LIBGDX_ATLAS],
    ['Starling', STARLING],
    ['TexturePacker', TEXTURE_PACKER],
  ])('recognises a %s document', (_kind, text) => {
    expect(isReadableSpritesheet(text)).toBe(true);
  });

  // ★ UNKNOWN CONTENT STAYS UNREADABLE RATHER THAN CLAIMING A FALLBACK. There is no default parser, so
  // treating "unrecognised" as some format would ship an implementation that cannot read the file.
  it.each([
    ['empty text', ''],
    ['unrelated JSON', '{"hello":"world"}'],
    ['unrelated XML', '<?xml version="1.0"?><root/>'],
    ['malformed JSON', '{ not json'],
    ['prose', 'this is not a spritesheet'],
    // ★ A PLIST IS A CONTAINER, NOT A FORMAT. ParticleDesigner writes emitter configs as plists, so claiming every
    // plist linked this family's parser into any build whose only plist was a particle config.
    ['a ParticleDesigner emitter plist', PARTICLE_DESIGNER_PLIST],
    ['a bare plist', '<?xml version="1.0"?><plist version="1.0"><dict></dict></plist>'],
  ])('reports %s unreadable', (_label, text) => {
    expect(isReadableSpritesheet(text)).toBe(false);
  });
});

describe('parseSpritesheetRequirements', () => {
  it.each([
    ['Aseprite', ASEPRITE],
    ['CocosPlist', COCOS_PLIST],
    ['LibgdxAtlas', LIBGDX_ATLAS],
    ['Starling', STARLING],
    ['TexturePacker', TEXTURE_PACKER],
  ])('emits exactly the requirement for the %s parser', (kind, text) => {
    expect(parseSpritesheetRequirements(text).requirements).toEqual([
      { facet: RequirementFacet.DocumentFormat, key: `${SPRITESHEET_REQUIREMENT_KEY_NAMESPACE}.${kind}` },
    ]);
  });

  it('emits nothing for content no format recognises', () => {
    expect(parseSpritesheetRequirements('{"hello":"world"}').requirements).toEqual([]);
  });

  // ★ THE REGISTRY'S OWN WINNER FOR DOCUMENTS MORE THAN ONE DETECTOR INSPECTS. Aseprite and TexturePacker both
  // read `{ frames, meta }` JSON and are told apart only by the app string, so this is where a second opinion
  // would diverge from the importer. Asserting both directions proves this function asks the registry.
  it('separates the two JSON formats the way the registry does', () => {
    expect(keyOf(ASEPRITE)).toBe('spritesheet.Aseprite');
    expect(keyOf(TEXTURE_PACKER)).toBe('spritesheet.TexturePacker');
  });

  // Both halves of the plist pair, in one place so they cannot drift: the container is shared, and each family
  // answers only for the document addressed to it.
  it('claims a plist only when it carries the frames dict the Cocos parser reads', () => {
    expect(keyOf(COCOS_PLIST)).toBe('spritesheet.CocosPlist');
    expect(parseSpritesheetRequirements(PARTICLE_DESIGNER_PLIST).requirements).toEqual([]);
  });

  // Starling and CocosPlist are both XML; only the root element separates them, and Starling's detector looks
  // for its own element rather than "is XML", so neither claims the other's document.
  it('separates the two XML formats by their own root elements', () => {
    expect(keyOf(STARLING)).toBe('spritesheet.Starling');
    expect(keyOf(COCOS_PLIST)).toBe('spritesheet.CocosPlist');
  });

  it('covers the document.format facet, so a build knows the question was asked', () => {
    expect(parseSpritesheetRequirements(ASEPRITE).covers).toEqual([RequirementFacet.DocumentFormat]);
  });
});

function keyOf(text: string): string | undefined {
  return parseSpritesheetRequirements(text).requirements[0]?.key;
}
