import { parseStarling, parseStarlingDocument } from './parse';
import { serializeStarling } from './serialize';

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

// ─── parseStarlingDocument ────────────────────────────────────────────────────────────

describe('parseStarling — lightweight, returns SpritesheetData directly', () => {
  it('returns a SpritesheetData (not a Parsed object)', () => {
    const result = parseStarling(ATLAS_XML);
    expect(typeof result.frames).toBe('object');
    expect((result as unknown as Record<string, unknown>).document).toBeUndefined();
  });

  it('parses all SubTexture elements', () => {
    expect(parseStarling(ATLAS_XML).frames).toHaveLength(4);
  });

  it('maps name, x, y, width, height', () => {
    const data = parseStarling(ATLAS_XML);
    const frame = data.frames[0];
    expect(frame.name).toBe('hero_idle_0001');
    expect(frame.x).toBe(0);
    expect(frame.y).toBe(0);
    expect(frame.width).toBe(60);
    expect(frame.height).toBe(56);
  });

  it('converts frameX/Y to positive offsetX/Y', () => {
    const data = parseStarling(ATLAS_XML);
    const frame = data.frames[0];
    expect(frame.offsetX).toBe(2); // -(-2) = 2
    expect(frame.offsetY).toBe(4); // -(-4) = 4
  });

  it('maps frameWidth/Height as sourceWidth/Height', () => {
    const data = parseStarling(ATLAS_XML);
    const frame = data.frames[0];
    expect(frame.sourceWidth).toBe(64);
    expect(frame.sourceHeight).toBe(64);
  });

  it('falls back to atlas width/height as sourceWidth/Height when no frame attrs', () => {
    const data = parseStarling(ATLAS_XML);
    const spark = data.frames.find((f) => f.name === 'fx_spark')!;
    expect(spark.sourceWidth).toBe(16);
    expect(spark.sourceHeight).toBe(16);
  });

  it('normalises pivotX/Y to 0–1 range', () => {
    const data = parseStarling(ATLAS_XML);
    const frame = data.frames[0]; // pivotX=32, sourceWidth=64 → 0.5
    expect(frame.pivotX).toBeCloseTo(0.5);
    expect(frame.pivotY).toBeCloseTo(1.0);
  });

  it('sets pivot to null when absent', () => {
    const data = parseStarling(ATLAS_XML);
    const spark = data.frames.find((f) => f.name === 'fx_spark')!;
    expect(spark.pivotX).toBeNull();
    expect(spark.pivotY).toBeNull();
  });

  it('maps rotated flag', () => {
    const data = parseStarling(ROTATED_XML);
    expect(data.frames[0].rotated).toBe(true);
    expect(data.frames[1].rotated).toBe(true);
  });

  it('defaults rotated to false when absent', () => {
    const data = parseStarling(ATLAS_XML);
    expect(data.frames[0].rotated).toBe(false);
  });

  it('extracts imagePath as imageFile', () => {
    expect(parseStarling(ATLAS_XML).imageFile).toBe('atlas.png');
    expect(parseStarling(MINIMAL_XML).imageFile).toBe('mini.png');
  });

  it('infers animations from numbered frame names', () => {
    const data = parseStarling(ATLAS_XML);
    const anim = data.animations.find((a) => a.name === 'hero_idle');
    expect(anim).toBeDefined();
    expect(anim!.frameNames).toHaveLength(3);
  });

  it('sorts animation frames by numeric suffix', () => {
    const data = parseStarling(ATLAS_XML);
    const anim = data.animations.find((a) => a.name === 'hero_idle')!;
    expect(anim.frameNames[0]).toBe('hero_idle_0001');
    expect(anim.frameNames[1]).toBe('hero_idle_0002');
    expect(anim.frameNames[2]).toBe('hero_idle_0003');
  });

  it('does not create animation for singleton frames', () => {
    const data = parseStarling(ATLAS_XML);
    expect(data.animations.find((a) => a.name === 'fx')).toBeUndefined();
    expect(data.animations.find((a) => a.name === 'fx_spark')).toBeUndefined();
  });

  it('uses frameDuration option for inferred animations', () => {
    const data = parseStarling(ATLAS_XML, { frameDuration: 200 });
    const anim = data.animations[0];
    expect(anim.frameDuration).toBe(200);
  });

  it('defaults frameDuration to 100 when option is absent', () => {
    const data = parseStarling(ATLAS_XML);
    expect(data.animations[0].frameDuration).toBe(100);
  });

  it('infers run animation from numbered frames', () => {
    const data = parseStarling(ROTATED_XML);
    expect(data.animations).toHaveLength(1);
    expect(data.animations[0].name).toBe('run');
    expect(data.animations[0].frameNames).toHaveLength(2);
  });

  it('handles a single frame with no numbered pattern', () => {
    const data = parseStarling(MINIMAL_XML);
    expect(data.frames).toHaveLength(1);
    expect(data.animations).toHaveLength(0);
  });
});

// ─── parseStarling ───────────────────────────────────────────────────────────

describe('parseStarlingDocument — full round-trip, returns { data, document }', () => {
  it('returns the same data as parseStarling', () => {
    const parsed = parseStarling(ATLAS_XML);
    const { data } = parseStarlingDocument(ATLAS_XML);
    expect(data.frames.length).toBe(parsed.frames.length);
    expect(data.imageFile).toBe(parsed.imageFile);
  });

  it('preserves all SubTexture nodes in document', () => {
    const { document } = parseStarlingDocument(ATLAS_XML);
    expect(document.subTextures).toHaveLength(4);
  });

  it('preserves imagePath in document', () => {
    const { document } = parseStarlingDocument(ATLAS_XML);
    expect(document.imagePath).toBe('atlas.png');
  });

  it('preserves numeric attributes exactly', () => {
    const { document } = parseStarlingDocument(ATLAS_XML);
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

// ─── serializeStarling round-trips ───────────────────────────────────────────

describe('serializeStarling — round-trip via parseStarlingDocument', () => {
  it('round-trips frame names', () => {
    const { data, document } = parseStarlingDocument(ATLAS_XML);
    const data2 = parseStarling(serializeStarling(data, document));
    expect(data2.frames.map((f) => f.name)).toEqual(data.frames.map((f) => f.name));
  });

  it('round-trips atlas positions', () => {
    const { data, document } = parseStarlingDocument(ATLAS_XML);
    const data2 = parseStarling(serializeStarling(data, document));
    expect(data2.frames[0].x).toBe(data.frames[0].x);
    expect(data2.frames[0].width).toBe(data.frames[0].width);
  });

  it('round-trips trim offsets', () => {
    const { data, document } = parseStarlingDocument(ATLAS_XML);
    const data2 = parseStarling(serializeStarling(data, document));
    expect(data2.frames[0].offsetX).toBe(data.frames[0].offsetX);
    expect(data2.frames[0].offsetY).toBe(data.frames[0].offsetY);
  });

  it('round-trips source size', () => {
    const { data, document } = parseStarlingDocument(ATLAS_XML);
    const data2 = parseStarling(serializeStarling(data, document));
    expect(data2.frames[0].sourceWidth).toBe(data.frames[0].sourceWidth);
    expect(data2.frames[0].sourceHeight).toBe(data.frames[0].sourceHeight);
  });

  it('round-trips pivot normalised values', () => {
    const { data, document } = parseStarlingDocument(ATLAS_XML);
    const data2 = parseStarling(serializeStarling(data, document));
    expect(data2.frames[0].pivotX).toBeCloseTo(data.frames[0].pivotX!);
    expect(data2.frames[0].pivotY).toBeCloseTo(data.frames[0].pivotY!);
  });

  it('round-trips rotated flag', () => {
    const { data, document } = parseStarlingDocument(ROTATED_XML);
    const data2 = parseStarling(serializeStarling(data, document));
    expect(data2.frames[0].rotated).toBe(true);
  });

  it('round-trips imagePath', () => {
    const { data, document } = parseStarlingDocument(ATLAS_XML);
    const data2 = parseStarling(serializeStarling(data, document));
    expect(data2.imageFile).toBe('atlas.png');
  });

  it('produces well-formed XML with root element', () => {
    const data = parseStarling(MINIMAL_XML);
    const xml = serializeStarling(data);
    expect(xml).toContain('<TextureAtlas');
    expect(xml).toContain('<SubTexture');
    expect(xml).toContain('</TextureAtlas>');
  });

  it('omits optional attributes when not needed', () => {
    const data = parseStarling(MINIMAL_XML);
    const xml = serializeStarling(data);
    expect(xml).not.toContain('frameX');
    expect(xml).not.toContain('pivotX');
    expect(xml).not.toContain('rotated');
  });

  it('includes frameX/Y when offset is non-zero', () => {
    const { data, document } = parseStarlingDocument(ATLAS_XML);
    const xml = serializeStarling(data, document);
    expect(xml).toContain('frameX="-2"');
    expect(xml).toContain('frameY="-4"');
  });
});
