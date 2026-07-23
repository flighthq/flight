import {
  SpritesheetFormatKindAseprite,
  SpritesheetFormatKindCocosPlist,
  SpritesheetFormatKindLibgdxAtlas,
  SpritesheetFormatKindStarling,
  SpritesheetFormatKindTexturePacker,
} from '@flighthq/types';
import type { SpritesheetParseOptions } from '@flighthq/types';

import {
  detectSpritesheetFormat,
  getSpritesheetFormat,
  parseSpritesheet,
  registerSpritesheetFormat,
} from './spritesheetDetect';

const TEXTURE_PACKER_JSON = JSON.stringify({
  frames: {},
  meta: {
    app: 'https://www.codeandweb.com/texturepacker',
    format: 'RGBA8888',
    image: 'atlas.png',
    scale: 1,
    size: { h: 128, w: 128 },
    version: '1.0',
  },
});

const ASEPRITE_JSON = JSON.stringify({
  frames: {},
  meta: {
    app: 'https://www.aseprite.org/',
    format: 'RGBA8888',
    frameTags: [],
    image: 'sprite.png',
    scale: '1',
    size: { h: 64, w: 64 },
    version: '1.3',
  },
});

const STARLING_XML = `<?xml version="1.0" encoding="UTF-8"?>
<TextureAtlas imagePath="atlas.png">
  <SubTexture name="hero" x="0" y="0" width="64" height="64"/>
</TextureAtlas>`;

const LIBGDX_ATLAS = `
atlas.png
size: 128, 64
format: RGBA8888
filter: Linear, Linear
repeat: none
hero
  rotate: false
  xy: 0, 0
  size: 64, 64
  orig: 64, 64
  offset: 0, 0
  index: -1
`;

const COCOS_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>frames</key>
  <dict>
    <key>hero.png</key>
    <dict>
      <key>textureRect</key>
      <string>{{0,0},{64,64}}</string>
    </dict>
  </dict>
  <key>metadata</key>
  <dict>
    <key>textureFileName</key>
    <string>atlas.png</string>
  </dict>
</dict>
</plist>`;

describe('detectSpritesheetFormat', () => {
  it('detects TexturePacker JSON', () => {
    expect(detectSpritesheetFormat(TEXTURE_PACKER_JSON)).toBe(SpritesheetFormatKindTexturePacker);
  });

  it('detects Aseprite JSON', () => {
    expect(detectSpritesheetFormat(ASEPRITE_JSON)).toBe(SpritesheetFormatKindAseprite);
  });

  it('detects Starling XML', () => {
    expect(detectSpritesheetFormat(STARLING_XML)).toBe(SpritesheetFormatKindStarling);
  });

  it('detects Cocos plist XML', () => {
    expect(detectSpritesheetFormat(COCOS_PLIST)).toBe(SpritesheetFormatKindCocosPlist);
  });

  it('detects libGDX atlas', () => {
    expect(detectSpritesheetFormat(LIBGDX_ATLAS)).toBe(SpritesheetFormatKindLibgdxAtlas);
  });

  it('returns null for unknown format', () => {
    expect(detectSpritesheetFormat('completely unknown content')).toBeNull();
  });
});

describe('getSpritesheetFormat', () => {
  it('returns the registered entry for a known kind', () => {
    const entry = getSpritesheetFormat(SpritesheetFormatKindTexturePacker);
    expect(entry).not.toBeNull();
    expect(typeof entry?.detect).toBe('function');
    expect(typeof entry?.parse).toBe('function');
  });

  it('returns null for an unknown kind', () => {
    expect(getSpritesheetFormat('acme.NonExistent')).toBeNull();
  });

  it('reflects a format registered via registerSpritesheetFormat', () => {
    const kind = 'test.GetFormatTest';
    const detect = (text: string) => text.startsWith('GFT:');
    registerSpritesheetFormat(kind, {
      detect,
      parse: () => ({ animations: [], frames: [], imageFile: '', imageHeight: 0, imageWidth: 0, scale: 1 }),
    });
    const entry = getSpritesheetFormat(kind);
    expect(entry).not.toBeNull();
    expect(entry?.detect).toBe(detect);
  });
});

describe('parseSpritesheet', () => {
  it('auto-detects and parses TexturePacker JSON', () => {
    const data = parseSpritesheet(TEXTURE_PACKER_JSON);
    expect(data).not.toBeNull();
    expect(data?.imageFile).toBe('atlas.png');
  });

  it('auto-detects and parses Aseprite JSON', () => {
    const data = parseSpritesheet(ASEPRITE_JSON);
    expect(data).not.toBeNull();
    expect(data?.imageFile).toBe('sprite.png');
  });

  it('auto-detects and parses Starling XML', () => {
    const data = parseSpritesheet(STARLING_XML);
    expect(data).not.toBeNull();
    expect(data?.frames[0]?.name).toBe('hero');
  });

  it('returns null for unknown format', () => {
    const data = parseSpritesheet('unknown format content here');
    expect(data).toBeNull();
  });

  it('respects explicit formatKind override', () => {
    const data = parseSpritesheet(TEXTURE_PACKER_JSON, SpritesheetFormatKindTexturePacker);
    expect(data).not.toBeNull();
  });

  it('passes frameDuration option to parsers', () => {
    const json = JSON.stringify({
      frames: {},
      meta: {
        app: 'https://www.codeandweb.com/texturepacker',
        format: 'RGBA8888',
        frameTags: [{ direction: 'forward', from: 0, name: 'run', to: 0 }],
        image: 'atlas.png',
        scale: 1,
        size: { h: 64, w: 64 },
        version: '1.0',
      },
    });
    const opts: SpritesheetParseOptions = { frameDuration: 250 };
    const data = parseSpritesheet(json, SpritesheetFormatKindTexturePacker, opts);
    // frameTags reference frame index 0 which doesn't exist → animation gets empty frameNames
    // But the option is passed without throwing
    expect(data).not.toBeNull();
  });
});

describe('registerSpritesheetFormat', () => {
  it('allows registering a custom format', () => {
    const customKind = 'test.CustomFormat';
    registerSpritesheetFormat(customKind, {
      detect: (text) => text.startsWith('CUSTOM:'),
      parse: () => ({
        animations: [],
        frames: [
          {
            height: 10,
            name: 'custom',
            offsetX: 0,
            offsetY: 0,
            pivotX: null,
            pivotY: null,
            rotated: false,
            sourceHeight: 10,
            sourceWidth: 10,
            width: 10,
            x: 0,
            y: 0,
          },
        ],
        imageFile: 'custom.png',
        imageHeight: 10,
        imageWidth: 10,
        scale: 1,
      }),
    });

    expect(detectSpritesheetFormat('CUSTOM: data here')).toBe(customKind);
    const data = parseSpritesheet('CUSTOM: data here');
    expect(data?.imageFile).toBe('custom.png');
  });
});
