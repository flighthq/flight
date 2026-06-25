import { parseAsepriteSpritesheet } from './asepriteParse';
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
});
