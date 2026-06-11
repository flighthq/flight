import { loadTexturePacker, parseTexturePacker } from './parse';
import { serializeTexturePacker } from './serialize';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const HASH_JSON = JSON.stringify({
  frames: {
    'hero/idle_0.png': {
      frame: { x: 0, y: 0, w: 60, h: 56 },
      rotated: false,
      trimmed: true,
      spriteSourceSize: { x: 2, y: 4, w: 60, h: 56 },
      sourceSize: { w: 64, h: 64 },
      pivot: { x: 0.5, y: 1.0 },
    },
    'hero/idle_1.png': {
      frame: { x: 60, y: 0, w: 60, h: 56 },
      rotated: false,
      trimmed: true,
      spriteSourceSize: { x: 2, y: 4, w: 60, h: 56 },
      sourceSize: { w: 64, h: 64 },
      pivot: { x: 0.5, y: 1.0 },
    },
    'fx/spark.png': {
      frame: { x: 0, y: 56, w: 16, h: 16 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 },
      sourceSize: { w: 16, h: 16 },
    },
  },
  meta: {
    app: 'https://www.codeandweb.com/texturepacker',
    version: '1.0',
    image: 'atlas.png',
    format: 'RGBA8888',
    size: { w: 256, h: 128 },
    scale: '2',
    frameTags: [{ name: 'idle', from: 0, to: 1, direction: 'forward' }],
  },
});

const ARRAY_JSON = JSON.stringify({
  frames: [
    {
      filename: 'hero/idle_0.png',
      frame: { x: 0, y: 0, w: 60, h: 56 },
      rotated: false,
      trimmed: true,
      spriteSourceSize: { x: 2, y: 4, w: 60, h: 56 },
      sourceSize: { w: 64, h: 64 },
      pivot: { x: 0.5, y: 1.0 },
    },
    {
      filename: 'hero/run_0.png',
      frame: { x: 60, y: 0, w: 32, h: 32 },
      rotated: true,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 },
      sourceSize: { w: 32, h: 32 },
    },
  ],
  meta: {
    app: 'https://www.codeandweb.com/texturepacker',
    version: '1.0',
    image: 'sprites.png',
    format: 'RGBA8888',
    size: { w: 128, h: 64 },
    scale: 1,
  },
});

const MINIMAL_HASH_JSON = JSON.stringify({
  frames: {
    'a.png': {
      frame: { x: 0, y: 0, w: 10, h: 10 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 10, h: 10 },
      sourceSize: { w: 10, h: 10 },
    },
  },
  meta: {
    app: 'tp',
    version: '1.0',
    image: 'a.png',
    format: 'RGBA8888',
    size: { w: 64, h: 64 },
    scale: '1',
  },
});

// ─── loadTexturePacker ───────────────────────────────────────────────────────

describe('loadTexturePacker — full round-trip, returns { data, document }', () => {
  it('returns the same data as parseTexturePacker', () => {
    const parsed = parseTexturePacker(HASH_JSON);
    const { data } = loadTexturePacker(HASH_JSON);
    expect(data.frames.length).toBe(parsed.frames.length);
    expect(data.imageFile).toBe(parsed.imageFile);
    expect(data.imageWidth).toBe(parsed.imageWidth);
    expect(data.imageHeight).toBe(parsed.imageHeight);
  });

  it('preserves the original document for Hash variant', () => {
    const { document } = loadTexturePacker(HASH_JSON);
    expect(Array.isArray(document.frames)).toBe(false);
    expect((document.frames as Record<string, unknown>)['hero/idle_0.png']).toBeDefined();
  });

  it('preserves the original document for Array variant', () => {
    const { document } = loadTexturePacker(ARRAY_JSON);
    expect(Array.isArray(document.frames)).toBe(true);
    expect((document.frames as unknown[])[0]).toBeDefined();
  });

  it('preserves meta fields in document', () => {
    const { document } = loadTexturePacker(HASH_JSON);
    expect(document.meta.app).toBe('https://www.codeandweb.com/texturepacker');
    expect(document.meta.version).toBe('1.0');
    expect(document.meta.format).toBe('RGBA8888');
  });
});

// ─── parseTexturePacker ──────────────────────────────────────────────────────

describe('parseTexturePacker — lightweight, returns SpritesheetData directly', () => {
  it('returns a SpritesheetData (not a Parsed object)', () => {
    const result = parseTexturePacker(HASH_JSON);
    expect(typeof result.frames).toBe('object');
    expect((result as unknown as Record<string, unknown>).document).toBeUndefined();
  });

  it('parses frame count from Hash variant', () => {
    expect(parseTexturePacker(HASH_JSON).frames).toHaveLength(3);
  });

  it('parses frame count from Array variant', () => {
    expect(parseTexturePacker(ARRAY_JSON).frames).toHaveLength(2);
  });

  it('maps atlas position and size', () => {
    const data = parseTexturePacker(HASH_JSON);
    const frame = data.frames.find((f) => f.name === 'hero/idle_0.png')!;
    expect(frame.x).toBe(0);
    expect(frame.y).toBe(0);
    expect(frame.width).toBe(60);
    expect(frame.height).toBe(56);
  });

  it('maps frame name from Hash key', () => {
    const data = parseTexturePacker(HASH_JSON);
    expect(data.frames.map((f) => f.name)).toContain('hero/idle_0.png');
    expect(data.frames.map((f) => f.name)).toContain('fx/spark.png');
  });

  it('maps frame name from Array filename field', () => {
    const data = parseTexturePacker(ARRAY_JSON);
    expect(data.frames[0].name).toBe('hero/idle_0.png');
    expect(data.frames[1].name).toBe('hero/run_0.png');
  });

  it('preserves trim offset', () => {
    const data = parseTexturePacker(HASH_JSON);
    const frame = data.frames.find((f) => f.name === 'hero/idle_0.png')!;
    expect(frame.offsetX).toBe(2);
    expect(frame.offsetY).toBe(4);
  });

  it('preserves source size', () => {
    const data = parseTexturePacker(HASH_JSON);
    const frame = data.frames.find((f) => f.name === 'hero/idle_0.png')!;
    expect(frame.sourceWidth).toBe(64);
    expect(frame.sourceHeight).toBe(64);
  });

  it('maps pivot when present', () => {
    const data = parseTexturePacker(HASH_JSON);
    const frame = data.frames.find((f) => f.name === 'hero/idle_0.png')!;
    expect(frame.pivotX).toBe(0.5);
    expect(frame.pivotY).toBe(1.0);
  });

  it('sets pivot to null when absent', () => {
    const data = parseTexturePacker(HASH_JSON);
    const frame = data.frames.find((f) => f.name === 'fx/spark.png')!;
    expect(frame.pivotX).toBeNull();
    expect(frame.pivotY).toBeNull();
  });

  it('maps rotated flag', () => {
    const data = parseTexturePacker(ARRAY_JSON);
    expect(data.frames[0].rotated).toBe(false);
    expect(data.frames[1].rotated).toBe(true);
  });

  it('maps image file from meta', () => {
    expect(parseTexturePacker(HASH_JSON).imageFile).toBe('atlas.png');
    expect(parseTexturePacker(ARRAY_JSON).imageFile).toBe('sprites.png');
  });

  it('maps atlas size from meta', () => {
    const data = parseTexturePacker(HASH_JSON);
    expect(data.imageWidth).toBe(256);
    expect(data.imageHeight).toBe(128);
  });

  it('parses numeric string scale', () => {
    expect(parseTexturePacker(HASH_JSON).scale).toBe(2);
  });

  it('parses numeric scale directly', () => {
    expect(parseTexturePacker(ARRAY_JSON).scale).toBe(1);
  });

  it('parses animations from frameTags', () => {
    const data = parseTexturePacker(HASH_JSON);
    expect(data.animations).toHaveLength(1);
    expect(data.animations[0].name).toBe('idle');
    expect(data.animations[0].direction).toBe('forward');
  });

  it('maps animation frameNames to the correct frames', () => {
    const data = parseTexturePacker(HASH_JSON);
    const anim = data.animations[0];
    expect(anim.frameNames).toHaveLength(2);
    expect(anim.frameNames[0]).toBe('hero/idle_0.png');
    expect(anim.frameNames[1]).toBe('hero/idle_1.png');
  });

  it('produces empty animations when no frameTags present', () => {
    expect(parseTexturePacker(ARRAY_JSON).animations).toHaveLength(0);
    expect(parseTexturePacker(MINIMAL_HASH_JSON).animations).toHaveLength(0);
  });

  it('handles frames with no trim (offsetX/Y = 0)', () => {
    const data = parseTexturePacker(HASH_JSON);
    const frame = data.frames.find((f) => f.name === 'fx/spark.png')!;
    expect(frame.offsetX).toBe(0);
    expect(frame.offsetY).toBe(0);
  });
});

// ─── serializeTexturePacker round-trips ──────────────────────────────────────

describe('serializeTexturePacker — round-trip via loadTexturePacker', () => {
  it('round-trips frame positions (Hash variant)', () => {
    const { data, document } = loadTexturePacker(HASH_JSON);
    const json2 = serializeTexturePacker(data, document);
    const data2 = parseTexturePacker(json2);
    expect(data2.frames.map((f) => f.name).sort()).toEqual(data.frames.map((f) => f.name).sort());
  });

  it('round-trips image file and size', () => {
    const { data, document } = loadTexturePacker(HASH_JSON);
    const data2 = parseTexturePacker(serializeTexturePacker(data, document));
    expect(data2.imageFile).toBe(data.imageFile);
    expect(data2.imageWidth).toBe(data.imageWidth);
    expect(data2.imageHeight).toBe(data.imageHeight);
  });

  it('round-trips frame x/y/width/height', () => {
    const { data, document } = loadTexturePacker(HASH_JSON);
    const data2 = parseTexturePacker(serializeTexturePacker(data, document));
    const orig = data.frames.find((f) => f.name === 'hero/idle_0.png')!;
    const rt = data2.frames.find((f) => f.name === 'hero/idle_0.png')!;
    expect(rt.x).toBe(orig.x);
    expect(rt.y).toBe(orig.y);
    expect(rt.width).toBe(orig.width);
    expect(rt.height).toBe(orig.height);
  });

  it('round-trips pivot values', () => {
    const { data, document } = loadTexturePacker(HASH_JSON);
    const data2 = parseTexturePacker(serializeTexturePacker(data, document));
    const rt = data2.frames.find((f) => f.name === 'hero/idle_0.png')!;
    expect(rt.pivotX).toBe(0.5);
    expect(rt.pivotY).toBe(1.0);
  });

  it('round-trips animations via frameTags', () => {
    const { data, document } = loadTexturePacker(HASH_JSON);
    const data2 = parseTexturePacker(serializeTexturePacker(data, document));
    expect(data2.animations).toHaveLength(data.animations.length);
    expect(data2.animations[0].name).toBe(data.animations[0].name);
  });

  it('emits array variant when existing document is array variant', () => {
    const { data, document } = loadTexturePacker(ARRAY_JSON);
    const json2 = serializeTexturePacker(data, document);
    const parsed = JSON.parse(json2);
    expect(Array.isArray(parsed.frames)).toBe(true);
  });

  it('emits hash variant by default', () => {
    const { data, document } = loadTexturePacker(HASH_JSON);
    const json2 = serializeTexturePacker(data, document);
    const parsed = JSON.parse(json2);
    expect(Array.isArray(parsed.frames)).toBe(false);
  });

  it('respects variant override option', () => {
    const { data, document } = loadTexturePacker(HASH_JSON);
    const json2 = serializeTexturePacker(data, document, { variant: 'array' });
    const parsed = JSON.parse(json2);
    expect(Array.isArray(parsed.frames)).toBe(true);
  });

  it('produces valid JSON', () => {
    const data = parseTexturePacker(MINIMAL_HASH_JSON);
    expect(() => JSON.parse(serializeTexturePacker(data))).not.toThrow();
  });
});
