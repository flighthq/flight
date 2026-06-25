import { parseStarlingSpritesheet, parseStarlingSpritesheetDocument } from './starlingParse';
import { serializeStarlingSpritesheet } from './starlingSerialize';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<TextureAtlas imagePath="atlas.png">
  <SubTexture name="hero" x="0" y="0" width="64" height="64"/>
  <SubTexture name="coin" x="64" y="0" width="32" height="32"/>
</TextureAtlas>`;

const ATLAS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<TextureAtlas imagePath="atlas.png">
  <SubTexture name="hero_idle_0001" x="0" y="0" width="60" height="56"
              frameX="-2" frameY="-4" frameWidth="64" frameHeight="64"
              pivotX="32" pivotY="64"/>
  <SubTexture name="hero_idle_0002" x="60" y="0" width="60" height="56"
              frameX="-2" frameY="-4" frameWidth="64" frameHeight="64"
              pivotX="32" pivotY="64"/>
  <SubTexture name="hero_idle_0003" x="120" y="0" width="60" height="56"
              frameX="-2" frameY="-4" frameWidth="64" frameHeight="64"
              pivotX="32" pivotY="64"/>
  <SubTexture name="fx_spark" x="0" y="56" width="16" height="16"/>
</TextureAtlas>`;

const ROTATED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<TextureAtlas imagePath="sprites.png">
  <SubTexture name="run_001" x="0" y="0" width="32" height="32" rotated="true"/>
  <SubTexture name="run_002" x="32" y="0" width="32" height="32" rotated="true"/>
</TextureAtlas>`;

const MINIMAL_XML = `<TextureAtlas imagePath="mini.png">
  <SubTexture name="tile" x="0" y="0" width="8" height="8"/>
</TextureAtlas>`;

describe('serializeStarlingSpritesheet', () => {
  it('produces a TextureAtlas XML string', () => {
    const data = parseStarlingSpritesheet(XML);
    const serialized = serializeStarlingSpritesheet(data);
    expect(serialized).toContain('<TextureAtlas');
    expect(serialized).toContain('imagePath="atlas.png"');
  });

  it('preserves frame count on round-trip', () => {
    const data = parseStarlingSpritesheet(XML);
    const serialized = serializeStarlingSpritesheet(data);
    const reparsed = parseStarlingSpritesheet(serialized);
    expect(reparsed.frames).toHaveLength(data.frames.length);
  });

  it('round-trips frame names', () => {
    const { data, document } = parseStarlingSpritesheetDocument(ATLAS_XML);
    const data2 = parseStarlingSpritesheet(serializeStarlingSpritesheet(data, document));
    expect(data2.frames.map((f) => f.name)).toEqual(data.frames.map((f) => f.name));
  });

  it('round-trips atlas positions', () => {
    const { data, document } = parseStarlingSpritesheetDocument(ATLAS_XML);
    const data2 = parseStarlingSpritesheet(serializeStarlingSpritesheet(data, document));
    expect(data2.frames[0].x).toBe(data.frames[0].x);
    expect(data2.frames[0].width).toBe(data.frames[0].width);
  });

  it('round-trips trim offsets', () => {
    const { data, document } = parseStarlingSpritesheetDocument(ATLAS_XML);
    const data2 = parseStarlingSpritesheet(serializeStarlingSpritesheet(data, document));
    expect(data2.frames[0].offsetX).toBe(data.frames[0].offsetX);
    expect(data2.frames[0].offsetY).toBe(data.frames[0].offsetY);
  });

  it('round-trips source size', () => {
    const { data, document } = parseStarlingSpritesheetDocument(ATLAS_XML);
    const data2 = parseStarlingSpritesheet(serializeStarlingSpritesheet(data, document));
    expect(data2.frames[0].sourceWidth).toBe(data.frames[0].sourceWidth);
    expect(data2.frames[0].sourceHeight).toBe(data.frames[0].sourceHeight);
  });

  it('round-trips pivot normalised values', () => {
    const { data, document } = parseStarlingSpritesheetDocument(ATLAS_XML);
    const data2 = parseStarlingSpritesheet(serializeStarlingSpritesheet(data, document));
    expect(data2.frames[0].pivotX).toBeCloseTo(data.frames[0].pivotX!);
    expect(data2.frames[0].pivotY).toBeCloseTo(data.frames[0].pivotY!);
  });

  it('round-trips rotated flag', () => {
    const { data, document } = parseStarlingSpritesheetDocument(ROTATED_XML);
    const data2 = parseStarlingSpritesheet(serializeStarlingSpritesheet(data, document));
    expect(data2.frames[0].rotated).toBe(true);
  });

  it('round-trips imagePath', () => {
    const { data, document } = parseStarlingSpritesheetDocument(ATLAS_XML);
    const data2 = parseStarlingSpritesheet(serializeStarlingSpritesheet(data, document));
    expect(data2.imageFile).toBe('atlas.png');
  });

  it('produces well-formed XML with root element', () => {
    const data = parseStarlingSpritesheet(MINIMAL_XML);
    const xml = serializeStarlingSpritesheet(data);
    expect(xml).toContain('<TextureAtlas');
    expect(xml).toContain('<SubTexture');
    expect(xml).toContain('</TextureAtlas>');
  });

  it('omits optional attributes when not needed', () => {
    const data = parseStarlingSpritesheet(MINIMAL_XML);
    const xml = serializeStarlingSpritesheet(data);
    expect(xml).not.toContain('frameX');
    expect(xml).not.toContain('pivotX');
    expect(xml).not.toContain('rotated');
  });

  it('includes frameX/Y when offset is non-zero', () => {
    const { data, document } = parseStarlingSpritesheetDocument(ATLAS_XML);
    const xml = serializeStarlingSpritesheet(data, document);
    expect(xml).toContain('frameX="-2"');
    expect(xml).toContain('frameY="-4"');
  });
});
