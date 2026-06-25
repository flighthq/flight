import { parseTexturePackerSpritesheet, parseTexturePackerSpritesheetDocument } from './texturePackerParse';
import { serializeTexturePackerSpritesheet } from './texturePackerSerialize';

const HASH_JSON = JSON.stringify({
  frames: {
    'hero.png': {
      frame: { h: 64, w: 64, x: 0, y: 0 },
      rotated: false,
      sourceSize: { h: 64, w: 64 },
      spriteSourceSize: { h: 64, w: 64, x: 0, y: 0 },
      trimmed: false,
    },
  },
  meta: {
    app: 'https://www.codeandweb.com/texturepacker',
    format: 'RGBA8888',
    image: 'atlas.png',
    scale: 1,
    size: { h: 128, w: 128 },
    version: '1.0',
  },
});

const ROUNDTRIP_HASH_JSON = JSON.stringify({
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

const ROUNDTRIP_ARRAY_JSON = JSON.stringify({
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

const ROUNDTRIP_MINIMAL_JSON = JSON.stringify({
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

describe('serializeTexturePackerSpritesheet', () => {
  it('produces valid JSON with frames and meta', () => {
    const data = parseTexturePackerSpritesheet(HASH_JSON);
    const serialized = serializeTexturePackerSpritesheet(data);
    const reparsed = JSON.parse(serialized) as Record<string, unknown>;
    expect(reparsed).toHaveProperty('frames');
    expect(reparsed).toHaveProperty('meta');
  });

  it('preserves frame count on round-trip', () => {
    const data = parseTexturePackerSpritesheet(HASH_JSON);
    const serialized = serializeTexturePackerSpritesheet(data);
    const reparsed = parseTexturePackerSpritesheet(serialized);
    expect(reparsed.frames).toHaveLength(data.frames.length);
  });

  it('serializes array variant when option is set', () => {
    const data = parseTexturePackerSpritesheet(HASH_JSON);
    const serialized = serializeTexturePackerSpritesheet(data, undefined, { variant: 'array' });
    const parsed = JSON.parse(serialized) as { frames: unknown[] };
    expect(Array.isArray(parsed.frames)).toBe(true);
  });

  it('round-trips frame positions (Hash variant)', () => {
    const { data, document } = parseTexturePackerSpritesheetDocument(ROUNDTRIP_HASH_JSON);
    const json2 = serializeTexturePackerSpritesheet(data, document);
    const data2 = parseTexturePackerSpritesheet(json2);
    expect(data2.frames.map((f) => f.name).sort()).toEqual(data.frames.map((f) => f.name).sort());
  });

  it('round-trips image file and size', () => {
    const { data, document } = parseTexturePackerSpritesheetDocument(ROUNDTRIP_HASH_JSON);
    const data2 = parseTexturePackerSpritesheet(serializeTexturePackerSpritesheet(data, document));
    expect(data2.imageFile).toBe(data.imageFile);
    expect(data2.imageWidth).toBe(data.imageWidth);
    expect(data2.imageHeight).toBe(data.imageHeight);
  });

  it('round-trips frame x/y/width/height', () => {
    const { data, document } = parseTexturePackerSpritesheetDocument(ROUNDTRIP_HASH_JSON);
    const data2 = parseTexturePackerSpritesheet(serializeTexturePackerSpritesheet(data, document));
    const orig = data.frames.find((f) => f.name === 'hero/idle_0.png')!;
    const rt = data2.frames.find((f) => f.name === 'hero/idle_0.png')!;
    expect(rt.x).toBe(orig.x);
    expect(rt.y).toBe(orig.y);
    expect(rt.width).toBe(orig.width);
    expect(rt.height).toBe(orig.height);
  });

  it('round-trips pivot values', () => {
    const { data, document } = parseTexturePackerSpritesheetDocument(ROUNDTRIP_HASH_JSON);
    const data2 = parseTexturePackerSpritesheet(serializeTexturePackerSpritesheet(data, document));
    const rt = data2.frames.find((f) => f.name === 'hero/idle_0.png')!;
    expect(rt.pivotX).toBe(0.5);
    expect(rt.pivotY).toBe(1.0);
  });

  it('round-trips animations via frameTags', () => {
    const { data, document } = parseTexturePackerSpritesheetDocument(ROUNDTRIP_HASH_JSON);
    const data2 = parseTexturePackerSpritesheet(serializeTexturePackerSpritesheet(data, document));
    expect(data2.animations).toHaveLength(data.animations.length);
    expect(data2.animations[0].name).toBe(data.animations[0].name);
  });

  it('emits array variant when existing document is array variant', () => {
    const { data, document } = parseTexturePackerSpritesheetDocument(ROUNDTRIP_ARRAY_JSON);
    const json2 = serializeTexturePackerSpritesheet(data, document);
    const parsed = JSON.parse(json2);
    expect(Array.isArray(parsed.frames)).toBe(true);
  });

  it('emits hash variant by default', () => {
    const { data, document } = parseTexturePackerSpritesheetDocument(ROUNDTRIP_HASH_JSON);
    const json2 = serializeTexturePackerSpritesheet(data, document);
    const parsed = JSON.parse(json2);
    expect(Array.isArray(parsed.frames)).toBe(false);
  });

  it('respects variant override option', () => {
    const { data, document } = parseTexturePackerSpritesheetDocument(ROUNDTRIP_HASH_JSON);
    const json2 = serializeTexturePackerSpritesheet(data, document, { variant: 'array' });
    const parsed = JSON.parse(json2);
    expect(Array.isArray(parsed.frames)).toBe(true);
  });

  it('produces valid JSON', () => {
    const data = parseTexturePackerSpritesheet(ROUNDTRIP_MINIMAL_JSON);
    expect(() => JSON.parse(serializeTexturePackerSpritesheet(data))).not.toThrow();
  });
});
