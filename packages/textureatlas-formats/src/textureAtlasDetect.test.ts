import {
  TextureAtlasFormatKindAseprite,
  TextureAtlasFormatKindLibgdxAtlas,
  TextureAtlasFormatKindStarling,
  TextureAtlasFormatKindTexturePacker,
} from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { detectTextureAtlasFormat } from './textureAtlasDetect';

const STARLING_XML = `<?xml version="1.0" encoding="UTF-8"?>
<TextureAtlas imagePath="atlas.png">
  <SubTexture name="hero_idle" x="0" y="0" width="64" height="64"/>
</TextureAtlas>`;

const LIBGDX_ATLAS = `
atlas.png
size: 256,256
format: RGBA8888
filter: Nearest,Nearest
repeat: none
hero_idle
  rotate: false
  xy: 0, 0
  size: 64, 64
  orig: 64, 64
  offset: 0, 0
  index: -1`;

const ASEPRITE_JSON = JSON.stringify({
  frames: {
    hero_idle: {
      frame: { x: 0, y: 0, w: 64, h: 64 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 64, h: 64 },
      sourceSize: { w: 64, h: 64 },
      duration: 100,
    },
  },
  meta: { app: 'https://www.aseprite.org/', image: 'atlas.png', size: { w: 64, h: 64 }, scale: 1 },
});

const TEXTUREPACKER_JSON = JSON.stringify({
  frames: {
    hero_idle: {
      frame: { x: 0, y: 0, w: 64, h: 64 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 64, h: 64 },
      sourceSize: { w: 64, h: 64 },
    },
  },
  meta: { app: 'https://www.codeandweb.com/texturepacker', image: 'atlas.png', size: { w: 64, h: 64 }, scale: 1 },
});

describe('detectTextureAtlasFormat', () => {
  it('detects Starling XML by its <TextureAtlas> root', () => {
    expect(detectTextureAtlasFormat(STARLING_XML)).toBe(TextureAtlasFormatKindStarling);
  });

  it('detects a libGDX / Spine text atlas by its header and region blocks', () => {
    expect(detectTextureAtlasFormat(LIBGDX_ATLAS)).toBe(TextureAtlasFormatKindLibgdxAtlas);
  });

  it('detects Aseprite JSON by its meta.app string', () => {
    expect(detectTextureAtlasFormat(ASEPRITE_JSON)).toBe(TextureAtlasFormatKindAseprite);
  });

  it('detects TexturePacker JSON by its meta.app string', () => {
    expect(detectTextureAtlasFormat(TEXTUREPACKER_JSON)).toBe(TextureAtlasFormatKindTexturePacker);
  });

  it('detects an array-shaped Aseprite document', () => {
    const arrayDoc = JSON.stringify({
      frames: [{ filename: 'a', frame: { x: 0, y: 0, w: 1, h: 1 }, duration: 50 }],
      meta: { app: 'aseprite' },
    });
    expect(detectTextureAtlasFormat(arrayDoc)).toBe(TextureAtlasFormatKindAseprite);
  });

  it('falls back to the per-frame duration field when meta.app is unrecognised', () => {
    const asepriteNoApp = JSON.stringify({ frames: { a: { duration: 100 } }, meta: { app: 'unknown' } });
    const packerNoApp = JSON.stringify({ frames: { a: { rotated: false } }, meta: { app: 'unknown' } });
    expect(detectTextureAtlasFormat(asepriteNoApp)).toBe(TextureAtlasFormatKindAseprite);
    expect(detectTextureAtlasFormat(packerNoApp)).toBe(TextureAtlasFormatKindTexturePacker);
  });

  it('returns null for unrecognised, empty, or malformed input', () => {
    expect(detectTextureAtlasFormat('')).toBeNull();
    expect(detectTextureAtlasFormat('   ')).toBeNull();
    expect(detectTextureAtlasFormat('not a known format')).toBeNull();
    expect(detectTextureAtlasFormat('{ not json')).toBeNull();
    expect(detectTextureAtlasFormat('<plist><dict></dict></plist>')).toBeNull();
    expect(detectTextureAtlasFormat('{"meta":{"app":"aseprite"}}')).toBeNull();
    expect(detectTextureAtlasFormat('[1,2,3]')).toBeNull();
  });
});
