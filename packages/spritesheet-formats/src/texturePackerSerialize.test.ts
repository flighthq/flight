import { parseTexturePackerSpritesheet } from './texturePackerParse';
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
});
