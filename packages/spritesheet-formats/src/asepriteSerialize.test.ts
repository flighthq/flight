import { parseAsepriteSpritesheet, parseAsepriteSpritesheetDocument } from './asepriteParse';
import { serializeAsepriteSpritesheet } from './asepriteSerialize';

const HASH_JSON = JSON.stringify({
  frames: {
    'frame0.aseprite': {
      duration: 100,
      frame: { h: 32, w: 32, x: 0, y: 0 },
      rotated: false,
      sourceSize: { h: 32, w: 32 },
      spriteSourceSize: { h: 32, w: 32, x: 0, y: 0 },
      trimmed: false,
    },
  },
  meta: {
    app: 'https://www.aseprite.org/',
    format: 'RGBA8888',
    frameTags: [],
    image: 'sprite.png',
    scale: '1',
    size: { h: 32, w: 64 },
    version: '1.3',
  },
});

const ROUNDTRIP_HASH_JSON = JSON.stringify({
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

const ROUNDTRIP_ARRAY_JSON = JSON.stringify({
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

const ROUNDTRIP_NO_TAGS_JSON = JSON.stringify({
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

describe('serializeAsepriteSpritesheet', () => {
  it('produces valid JSON that can be reparsed', () => {
    const data = parseAsepriteSpritesheet(HASH_JSON);
    const serialized = serializeAsepriteSpritesheet(data);
    const reparsed = JSON.parse(serialized) as Record<string, unknown>;
    expect(reparsed).toHaveProperty('frames');
    expect(reparsed).toHaveProperty('meta');
  });

  it('preserves frame count', () => {
    const data = parseAsepriteSpritesheet(HASH_JSON);
    const serialized = serializeAsepriteSpritesheet(data);
    const reparsed = parseAsepriteSpritesheet(serialized);
    expect(reparsed.frames).toHaveLength(data.frames.length);
  });

  it('serializes array variant when option is set', () => {
    const data = parseAsepriteSpritesheet(HASH_JSON);
    const serialized = serializeAsepriteSpritesheet(data, undefined, { variant: 'array' });
    const parsed = JSON.parse(serialized) as { frames: unknown[] };
    expect(Array.isArray(parsed.frames)).toBe(true);
  });

  it('round-trips frame names', () => {
    const { data, document } = parseAsepriteSpritesheetDocument(ROUNDTRIP_HASH_JSON);
    const data2 = parseAsepriteSpritesheet(serializeAsepriteSpritesheet(data, document));
    expect(data2.frames.map((f) => f.name)).toEqual(data.frames.map((f) => f.name));
  });

  it('round-trips frame positions', () => {
    const { data, document } = parseAsepriteSpritesheetDocument(ROUNDTRIP_HASH_JSON);
    const data2 = parseAsepriteSpritesheet(serializeAsepriteSpritesheet(data, document));
    expect(data2.frames[0].x).toBe(data.frames[0].x);
    expect(data2.frames[0].width).toBe(data.frames[0].width);
    expect(data2.frames[2].offsetX).toBe(data.frames[2].offsetX);
  });

  it('round-trips variable per-frame durations', () => {
    const { data, document } = parseAsepriteSpritesheetDocument(ROUNDTRIP_HASH_JSON);
    const data2 = parseAsepriteSpritesheet(serializeAsepriteSpritesheet(data, document));
    expect(data2.animations[0].frameDurations).toEqual([100, 150]);
  });

  it('round-trips uniform durations as null frameDurations', () => {
    const { data, document } = parseAsepriteSpritesheetDocument(ROUNDTRIP_ARRAY_JSON);
    const data2 = parseAsepriteSpritesheet(serializeAsepriteSpritesheet(data, document));
    expect(data2.animations[0].frameDurations).toBeNull();
    expect(data2.animations[0].frameDuration).toBe(80);
  });

  it('round-trips animation names and directions', () => {
    const { data, document } = parseAsepriteSpritesheetDocument(ROUNDTRIP_HASH_JSON);
    const data2 = parseAsepriteSpritesheet(serializeAsepriteSpritesheet(data, document));
    expect(data2.animations[0].name).toBe('run');
    expect(data2.animations[1].name).toBe('jump');
    expect(data2.animations[1].direction).toBe('reverse');
  });

  it('preserves layer metadata through the document', () => {
    const { data, document } = parseAsepriteSpritesheetDocument(ROUNDTRIP_HASH_JSON);
    const json2 = serializeAsepriteSpritesheet(data, document);
    const { document: doc2 } = parseAsepriteSpritesheetDocument(json2);
    expect(doc2.meta.layers).toHaveLength(1);
  });

  it('emits array variant when existing is array', () => {
    const { data, document } = parseAsepriteSpritesheetDocument(ROUNDTRIP_ARRAY_JSON);
    const parsed = JSON.parse(serializeAsepriteSpritesheet(data, document));
    expect(Array.isArray(parsed.frames)).toBe(true);
    expect(parsed.frames[0].filename).toBeDefined();
  });

  it('emits hash variant by default', () => {
    const { data, document } = parseAsepriteSpritesheetDocument(ROUNDTRIP_HASH_JSON);
    const parsed = JSON.parse(serializeAsepriteSpritesheet(data, document));
    expect(Array.isArray(parsed.frames)).toBe(false);
  });

  it('respects variant override option', () => {
    const { data, document } = parseAsepriteSpritesheetDocument(ROUNDTRIP_HASH_JSON);
    const parsed = JSON.parse(serializeAsepriteSpritesheet(data, document, { variant: 'array' }));
    expect(Array.isArray(parsed.frames)).toBe(true);
  });

  it('produces valid JSON', () => {
    const data = parseAsepriteSpritesheet(ROUNDTRIP_NO_TAGS_JSON);
    expect(() => JSON.parse(serializeAsepriteSpritesheet(data))).not.toThrow();
  });
});
