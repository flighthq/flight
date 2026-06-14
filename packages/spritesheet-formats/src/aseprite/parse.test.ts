import { parseAseprite, parseAsepriteDocument } from './parse';
import { serializeAseprite } from './serialize';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const HASH_JSON = JSON.stringify({
  frames: {
    'sprite 0.aseprite': {
      frame: { x: 0, y: 0, w: 32, h: 32 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 },
      sourceSize: { w: 32, h: 32 },
      duration: 100,
    },
    'sprite 1.aseprite': {
      frame: { x: 32, y: 0, w: 32, h: 32 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 },
      sourceSize: { w: 32, h: 32 },
      duration: 150,
    },
    'sprite 2.aseprite': {
      frame: { x: 64, y: 0, w: 30, h: 28 },
      rotated: false,
      trimmed: true,
      spriteSourceSize: { x: 1, y: 2, w: 30, h: 28 },
      sourceSize: { w: 32, h: 32 },
      duration: 200,
    },
    'sprite 3.aseprite': {
      frame: { x: 96, y: 0, w: 32, h: 32 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 },
      sourceSize: { w: 32, h: 32 },
      duration: 100,
    },
  },
  meta: {
    app: 'https://www.aseprite.org/',
    version: '1.3',
    image: 'sprite.png',
    format: 'RGBA8888',
    size: { w: 128, h: 32 },
    scale: '1',
    frameTags: [
      { name: 'run', from: 0, to: 1, direction: 'forward' },
      { name: 'jump', from: 2, to: 3, direction: 'reverse' },
    ],
    layers: [{ name: 'Layer 1', opacity: 255, blendMode: 'normal' }],
  },
});

const ARRAY_JSON = JSON.stringify({
  frames: [
    {
      filename: 'anim 0.aseprite',
      frame: { x: 0, y: 0, w: 16, h: 16 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 },
      sourceSize: { w: 16, h: 16 },
      duration: 80,
    },
    {
      filename: 'anim 1.aseprite',
      frame: { x: 16, y: 0, w: 16, h: 16 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 },
      sourceSize: { w: 16, h: 16 },
      duration: 80,
    },
  ],
  meta: {
    app: 'https://www.aseprite.org/',
    version: '1.3',
    image: 'anim.png',
    format: 'RGBA8888',
    size: { w: 32, h: 16 },
    scale: '1',
    frameTags: [{ name: 'idle', from: 0, to: 1, direction: 'pingpong' }],
  },
});

const NO_TAGS_JSON = JSON.stringify({
  frames: {
    'solo 0.aseprite': {
      frame: { x: 0, y: 0, w: 8, h: 8 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 8, h: 8 },
      sourceSize: { w: 8, h: 8 },
      duration: 100,
    },
  },
  meta: {
    app: 'https://www.aseprite.org/',
    version: '1.3',
    image: 'solo.png',
    format: 'RGBA8888',
    size: { w: 8, h: 8 },
    scale: '1',
    frameTags: [],
  },
});

// ─── parseAsepriteDocument ────────────────────────────────────────────────────────────

describe('parseAseprite — lightweight, returns SpritesheetData directly', () => {
  it('returns a SpritesheetData (not a Parsed object)', () => {
    const result = parseAseprite(HASH_JSON);
    expect(typeof result.frames).toBe('object');
    expect((result as unknown as Record<string, unknown>).document).toBeUndefined();
  });

  it('parses frame count from Hash variant', () => {
    expect(parseAseprite(HASH_JSON).frames).toHaveLength(4);
  });

  it('parses frame count from Array variant', () => {
    expect(parseAseprite(ARRAY_JSON).frames).toHaveLength(2);
  });

  it('maps frame name from Hash key', () => {
    const data = parseAseprite(HASH_JSON);
    expect(data.frames[0].name).toBe('sprite 0.aseprite');
    expect(data.frames[2].name).toBe('sprite 2.aseprite');
  });

  it('maps frame name from Array filename field', () => {
    const data = parseAseprite(ARRAY_JSON);
    expect(data.frames[0].name).toBe('anim 0.aseprite');
    expect(data.frames[1].name).toBe('anim 1.aseprite');
  });

  it('maps atlas position and size', () => {
    const data = parseAseprite(HASH_JSON);
    expect(data.frames[0].x).toBe(0);
    expect(data.frames[0].y).toBe(0);
    expect(data.frames[0].width).toBe(32);
    expect(data.frames[0].height).toBe(32);
  });

  it('maps trim offset', () => {
    const data = parseAseprite(HASH_JSON);
    const trimmed = data.frames[2];
    expect(trimmed.offsetX).toBe(1);
    expect(trimmed.offsetY).toBe(2);
    expect(trimmed.sourceWidth).toBe(32);
    expect(trimmed.sourceHeight).toBe(32);
  });

  it('has null pivots (Aseprite format has no pivot data)', () => {
    const data = parseAseprite(HASH_JSON);
    expect(data.frames[0].pivotX).toBeNull();
    expect(data.frames[0].pivotY).toBeNull();
  });

  it('maps image file and atlas size', () => {
    const data = parseAseprite(HASH_JSON);
    expect(data.imageFile).toBe('sprite.png');
    expect(data.imageWidth).toBe(128);
    expect(data.imageHeight).toBe(32);
  });

  it('parses animations from frameTags', () => {
    const data = parseAseprite(HASH_JSON);
    expect(data.animations).toHaveLength(2);
    expect(data.animations[0].name).toBe('run');
    expect(data.animations[1].name).toBe('jump');
  });

  it('maps animation direction', () => {
    const data = parseAseprite(HASH_JSON);
    expect(data.animations[0].direction).toBe('forward');
    expect(data.animations[1].direction).toBe('reverse');
  });

  it('maps animation frameNames via tag from/to indices', () => {
    const data = parseAseprite(HASH_JSON);
    expect(data.animations[0].frameNames).toEqual(['sprite 0.aseprite', 'sprite 1.aseprite']);
    expect(data.animations[1].frameNames).toEqual(['sprite 2.aseprite', 'sprite 3.aseprite']);
  });

  it('sets frameDurations when per-frame durations vary', () => {
    const data = parseAseprite(HASH_JSON);
    const run = data.animations[0];
    // frames 0 and 1 have durations 100 and 150 — they differ
    expect(run.frameDurations).toEqual([100, 150]);
    expect(run.frameDuration).toBe(100);
  });

  it('sets frameDurations to null when all frame durations are uniform', () => {
    const data = parseAseprite(ARRAY_JSON);
    const idle = data.animations[0];
    // both frames have duration 80
    expect(idle.frameDurations).toBeNull();
    expect(idle.frameDuration).toBe(80);
  });

  it('produces empty animations when frameTags array is empty', () => {
    expect(parseAseprite(NO_TAGS_JSON).animations).toHaveLength(0);
  });

  it('maps pingpong direction from Array variant', () => {
    const data = parseAseprite(ARRAY_JSON);
    expect(data.animations[0].direction).toBe('pingpong');
  });
});

// ─── parseAseprite ───────────────────────────────────────────────────────────

describe('parseAsepriteDocument — full round-trip, returns { data, document }', () => {
  it('returns the same data as parseAseprite', () => {
    const parsed = parseAseprite(HASH_JSON);
    const { data } = parseAsepriteDocument(HASH_JSON);
    expect(data.frames.length).toBe(parsed.frames.length);
    expect(data.imageFile).toBe(parsed.imageFile);
  });

  it('preserves the original Hash document', () => {
    const { document } = parseAsepriteDocument(HASH_JSON);
    expect(Array.isArray(document.frames)).toBe(false);
    expect((document.frames as Record<string, unknown>)['sprite 0.aseprite']).toBeDefined();
  });

  it('preserves the original Array document', () => {
    const { document } = parseAsepriteDocument(ARRAY_JSON);
    expect(Array.isArray(document.frames)).toBe(true);
  });

  it('preserves layers in document meta', () => {
    const { document } = parseAsepriteDocument(HASH_JSON);
    expect(document.meta.layers).toHaveLength(1);
    expect(document.meta.layers![0].name).toBe('Layer 1');
  });
});

// ─── serializeAseprite round-trips ───────────────────────────────────────────

describe('serializeAseprite — round-trip via parseAsepriteDocument', () => {
  it('round-trips frame names', () => {
    const { data, document } = parseAsepriteDocument(HASH_JSON);
    const data2 = parseAseprite(serializeAseprite(data, document));
    expect(data2.frames.map((f) => f.name)).toEqual(data.frames.map((f) => f.name));
  });

  it('round-trips frame positions', () => {
    const { data, document } = parseAsepriteDocument(HASH_JSON);
    const data2 = parseAseprite(serializeAseprite(data, document));
    expect(data2.frames[0].x).toBe(data.frames[0].x);
    expect(data2.frames[0].width).toBe(data.frames[0].width);
    expect(data2.frames[2].offsetX).toBe(data.frames[2].offsetX);
  });

  it('round-trips variable per-frame durations', () => {
    const { data, document } = parseAsepriteDocument(HASH_JSON);
    const data2 = parseAseprite(serializeAseprite(data, document));
    expect(data2.animations[0].frameDurations).toEqual([100, 150]);
  });

  it('round-trips uniform durations as null frameDurations', () => {
    const { data, document } = parseAsepriteDocument(ARRAY_JSON);
    const data2 = parseAseprite(serializeAseprite(data, document));
    expect(data2.animations[0].frameDurations).toBeNull();
    expect(data2.animations[0].frameDuration).toBe(80);
  });

  it('round-trips animation names and directions', () => {
    const { data, document } = parseAsepriteDocument(HASH_JSON);
    const data2 = parseAseprite(serializeAseprite(data, document));
    expect(data2.animations[0].name).toBe('run');
    expect(data2.animations[1].name).toBe('jump');
    expect(data2.animations[1].direction).toBe('reverse');
  });

  it('preserves layer metadata through the document', () => {
    const { data, document } = parseAsepriteDocument(HASH_JSON);
    const json2 = serializeAseprite(data, document);
    const { document: doc2 } = parseAsepriteDocument(json2);
    expect(doc2.meta.layers).toHaveLength(1);
  });

  it('emits array variant when existing is array', () => {
    const { data, document } = parseAsepriteDocument(ARRAY_JSON);
    const parsed = JSON.parse(serializeAseprite(data, document));
    expect(Array.isArray(parsed.frames)).toBe(true);
    expect(parsed.frames[0].filename).toBeDefined();
  });

  it('emits hash variant by default', () => {
    const { data, document } = parseAsepriteDocument(HASH_JSON);
    const parsed = JSON.parse(serializeAseprite(data, document));
    expect(Array.isArray(parsed.frames)).toBe(false);
  });

  it('respects variant override option', () => {
    const { data, document } = parseAsepriteDocument(HASH_JSON);
    const parsed = JSON.parse(serializeAseprite(data, document, { variant: 'array' }));
    expect(Array.isArray(parsed.frames)).toBe(true);
  });

  it('produces valid JSON', () => {
    const data = parseAseprite(NO_TAGS_JSON);
    expect(() => JSON.parse(serializeAseprite(data))).not.toThrow();
  });
});
