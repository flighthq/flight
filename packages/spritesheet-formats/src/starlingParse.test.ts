import { parseStarlingSpritesheet, parseStarlingSpritesheetDocument } from './starlingParse';

// ─── Fixtures ────────────────────────────────────────────────────────────────

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

describe('parseStarlingSpritesheet', () => {
  it('returns a SpritesheetData (not a Parsed object)', () => {
    const result = parseStarlingSpritesheet(ATLAS_XML);
    expect(typeof result.frames).toBe('object');
    expect((result as unknown as Record<string, unknown>).document).toBeUndefined();
  });

  it('parses all SubTexture elements', () => {
    expect(parseStarlingSpritesheet(ATLAS_XML).frames).toHaveLength(4);
  });

  it('maps name, x, y, width, height', () => {
    const data = parseStarlingSpritesheet(ATLAS_XML);
    const frame = data.frames[0];
    expect(frame.name).toBe('hero_idle_0001');
    expect(frame.x).toBe(0);
    expect(frame.y).toBe(0);
    expect(frame.width).toBe(60);
    expect(frame.height).toBe(56);
  });

  it('converts frameX/Y to positive offsetX/Y', () => {
    const data = parseStarlingSpritesheet(ATLAS_XML);
    const frame = data.frames[0];
    expect(frame.offsetX).toBe(2); // -(-2) = 2
    expect(frame.offsetY).toBe(4); // -(-4) = 4
  });

  it('maps frameWidth/Height as sourceWidth/Height', () => {
    const data = parseStarlingSpritesheet(ATLAS_XML);
    const frame = data.frames[0];
    expect(frame.sourceWidth).toBe(64);
    expect(frame.sourceHeight).toBe(64);
  });

  it('falls back to atlas width/height as sourceWidth/Height when no frame attrs', () => {
    const data = parseStarlingSpritesheet(ATLAS_XML);
    const spark = data.frames.find((f) => f.name === 'fx_spark')!;
    expect(spark.sourceWidth).toBe(16);
    expect(spark.sourceHeight).toBe(16);
  });

  it('normalises pivotX/Y to 0–1 range', () => {
    const data = parseStarlingSpritesheet(ATLAS_XML);
    const frame = data.frames[0]; // pivotX=32, sourceWidth=64 → 0.5
    expect(frame.pivotX).toBeCloseTo(0.5);
    expect(frame.pivotY).toBeCloseTo(1.0);
  });

  it('sets pivot to null when absent', () => {
    const data = parseStarlingSpritesheet(ATLAS_XML);
    const spark = data.frames.find((f) => f.name === 'fx_spark')!;
    expect(spark.pivotX).toBeNull();
    expect(spark.pivotY).toBeNull();
  });

  it('maps rotated flag', () => {
    const data = parseStarlingSpritesheet(ROTATED_XML);
    expect(data.frames[0].rotated).toBe(true);
    expect(data.frames[1].rotated).toBe(true);
  });

  it('defaults rotated to false when absent', () => {
    const data = parseStarlingSpritesheet(ATLAS_XML);
    expect(data.frames[0].rotated).toBe(false);
  });

  it('extracts imagePath as imageFile', () => {
    expect(parseStarlingSpritesheet(ATLAS_XML).imageFile).toBe('atlas.png');
    expect(parseStarlingSpritesheet(MINIMAL_XML).imageFile).toBe('mini.png');
  });

  it('infers animations from numbered frame names', () => {
    const data = parseStarlingSpritesheet(ATLAS_XML);
    const anim = data.animations.find((a) => a.name === 'hero_idle');
    expect(anim).toBeDefined();
    expect(anim!.frameNames).toHaveLength(3);
  });

  it('sorts animation frames by numeric suffix', () => {
    const data = parseStarlingSpritesheet(ATLAS_XML);
    const anim = data.animations.find((a) => a.name === 'hero_idle')!;
    expect(anim.frameNames[0]).toBe('hero_idle_0001');
    expect(anim.frameNames[1]).toBe('hero_idle_0002');
    expect(anim.frameNames[2]).toBe('hero_idle_0003');
  });

  it('does not create animation for singleton frames', () => {
    const data = parseStarlingSpritesheet(ATLAS_XML);
    expect(data.animations.find((a) => a.name === 'fx')).toBeUndefined();
    expect(data.animations.find((a) => a.name === 'fx_spark')).toBeUndefined();
  });

  it('uses frameDuration option for inferred animations', () => {
    const data = parseStarlingSpritesheet(ATLAS_XML, { frameDuration: 200 });
    const anim = data.animations[0];
    expect(anim.frameDuration).toBe(200);
  });

  it('defaults frameDuration to 100 when option is absent', () => {
    const data = parseStarlingSpritesheet(ATLAS_XML);
    expect(data.animations[0].frameDuration).toBe(100);
  });

  it('infers run animation from numbered frames', () => {
    const data = parseStarlingSpritesheet(ROTATED_XML);
    expect(data.animations).toHaveLength(1);
    expect(data.animations[0].name).toBe('run');
    expect(data.animations[0].frameNames).toHaveLength(2);
  });

  it('handles a single frame with no numbered pattern', () => {
    const data = parseStarlingSpritesheet(MINIMAL_XML);
    expect(data.frames).toHaveLength(1);
    expect(data.animations).toHaveLength(0);
  });
});

describe('parseStarlingSpritesheetDocument', () => {
  it('returns the same data as parseStarlingSpritesheet', () => {
    const parsed = parseStarlingSpritesheet(ATLAS_XML);
    const { data } = parseStarlingSpritesheetDocument(ATLAS_XML);
    expect(data.frames.length).toBe(parsed.frames.length);
    expect(data.imageFile).toBe(parsed.imageFile);
  });

  it('preserves all SubTexture nodes in document', () => {
    const { document } = parseStarlingSpritesheetDocument(ATLAS_XML);
    expect(document.subTextures).toHaveLength(4);
  });

  it('preserves imagePath in document', () => {
    const { document } = parseStarlingSpritesheetDocument(ATLAS_XML);
    expect(document.imagePath).toBe('atlas.png');
  });

  it('preserves numeric attributes exactly', () => {
    const { document } = parseStarlingSpritesheetDocument(ATLAS_XML);
    const st = document.subTextures[0];
    expect(st.name).toBe('hero_idle_0001');
    expect(st.x).toBe(0);
    expect(st.width).toBe(60);
    expect(st.frameX).toBe(-2);
    expect(st.frameY).toBe(-4);
    expect(st.frameWidth).toBe(64);
    expect(st.frameHeight).toBe(64);
  });
});
