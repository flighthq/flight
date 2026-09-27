import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import {
  SpritesheetFormatKindAseprite,
  SpritesheetFormatKindCocosPlist,
  SpritesheetFormatKindLibgdxAtlas,
  SpritesheetFormatKindStarling,
  SpritesheetFormatKindTexturePacker,
} from '@flighthq/types/contract';
import type { SpritesheetData, SpritesheetFormatKind, SpritesheetParseOptions } from '@flighthq/types/contract';

import {
  applySpritesheetImportOptions,
  detectSpritesheetFormat,
  getSpritesheetFormat,
  getSpritesheetFormatKinds,
  parseSpritesheet,
  registerSpritesheetFormat,
  spritesheetAllFormats,
  unregisterSpritesheetFormat,
} from './spritesheetDetect.ts';

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

describe('applySpritesheetImportOptions', () => {
  // ★ THE BUILT-INS ARE ALREADY SEEDED BY THE TIME ANY TEST RUNS, because the registry seeds itself on first
  // access. So "installs only what you name" cannot be shown on a built-in kind — re-registering one keeps its
  // original position by design. A custom kind is the honest vehicle, and it is how the surrounding tests
  // exercise registration too.
  it('installs a named format and nothing else', () => {
    const kind = 'acme.SeamTest' as SpritesheetFormatKind;
    expect(getSpritesheetFormat(kind)).toBeNull();
    applySpritesheetImportOptions({
      formats: [{ entry: { detect: () => false, parse: () => emptySpritesheetData() }, kind }],
    });
    expect(getSpritesheetFormat(kind)).not.toBeNull();
    unregisterSpritesheetFormat(kind);
    expect(getSpritesheetFormat(kind)).toBeNull();
  });

  it('installs nothing for empty options, rather than falling back to the built-ins', () => {
    const before = getSpritesheetFormatKinds();
    applySpritesheetImportOptions({});
    expect(getSpritesheetFormatKinds()).toEqual(before);
  });
});

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
      parse: () =>
        (() => {
          const out = allocateEntity<any>();
          out.animations = [];
          out.frames = [];
          out.imageFile = '';
          out.imageHeight = 0;
          out.imageWidth = 0;
          out.scale = 1;
          return finishEntity(out);
        })(),
    });
    const entry = getSpritesheetFormat(kind);
    unregisterSpritesheetFormat(kind);
    expect(entry).not.toBeNull();
    expect(entry?.detect).toBe(detect);
  });
});

describe('getSpritesheetFormatKinds', () => {
  it('enumerates sorted bound kinds and stops naming one after it is unregistered', () => {
    const kind = 'test.Enumeration';
    registerSpritesheetFormat(kind, {
      detect: () => false,
      parse: () =>
        (() => {
          const out = allocateEntity<any>();
          out.animations = [];
          out.frames = [];
          out.imageFile = '';
          out.imageHeight = 0;
          out.imageWidth = 0;
          out.scale = 1;
          return finishEntity(out);
        })(),
    });
    expect(getSpritesheetFormatKinds()).toEqual([
      SpritesheetFormatKindAseprite,
      SpritesheetFormatKindCocosPlist,
      SpritesheetFormatKindLibgdxAtlas,
      SpritesheetFormatKindStarling,
      SpritesheetFormatKindTexturePacker,
      kind,
    ]);

    unregisterSpritesheetFormat(kind);

    expect(getSpritesheetFormatKinds()).not.toContain(kind);
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

  it('forwards supplied image dimensions to the Starling parser', () => {
    const data = parseSpritesheet(STARLING_XML, SpritesheetFormatKindStarling, {
      imageHeight: 128,
      imageWidth: 256,
    });
    expect(data?.imageWidth).toBe(256);
    expect(data?.imageHeight).toBe(128);
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
      parse: () =>
        (() => {
          const out = allocateEntity<any>();
          out.animations = [];
          out.frames = [
            (() => {
              const out = allocateEntity<any>();
              out.height = 10;
              out.name = 'custom';
              out.offsetX = 0;
              out.offsetY = 0;
              out.pivotX = null;
              out.pivotY = null;
              out.rotated = false;
              out.sourceHeight = 10;
              out.sourceWidth = 10;
              out.width = 10;
              out.x = 0;
              out.y = 0;
              return finishEntity(out);
            })(),
          ];
          out.imageFile = 'custom.png';
          out.imageHeight = 10;
          out.imageWidth = 10;
          out.scale = 1;
          return finishEntity(out);
        })(),
    });

    expect(detectSpritesheetFormat('CUSTOM: data here')).toBe(customKind);
    const data = parseSpritesheet('CUSTOM: data here');
    unregisterSpritesheetFormat(customKind);
    expect(data?.imageFile).toBe('custom.png');
  });
});

describe('registry ordering', () => {
  // The detectors overlap, so which format wins is decided by registration order, not by the
  // detectors alone. Nothing pinned that before: reordering the seeding calls would have silently
  // routed a whole format to the wrong parser, which produces a wrong result rather than an error.
  const ASEPRITE_DOC = JSON.stringify({
    frames: {},
    meta: { app: 'http://www.aseprite.org/', image: 'a.png', scale: '1', size: { h: 1, w: 1 }, version: '1.3' },
  });

  it('an Aseprite export also satisfies the TexturePacker detector', () => {
    // The premise of the ordering requirement — asserted so the test below cannot quietly become
    // vacuous if the TexturePacker detector is ever narrowed.
    const texturePacker = getSpritesheetFormat(SpritesheetFormatKindTexturePacker);
    expect(texturePacker).not.toBeNull();
    expect(texturePacker!.detect(ASEPRITE_DOC)).toBe(true);
  });

  it('resolves an overlapping document to the narrower format, not the broader one', () => {
    expect(detectSpritesheetFormat(ASEPRITE_DOC)).toBe(SpritesheetFormatKindAseprite);
  });

  it('parses an overlapping document with the narrower parser', () => {
    const data = parseSpritesheet(ASEPRITE_DOC);
    expect(data).not.toBeNull();
  });
});

describe('spritesheetAllFormats', () => {
  // ★ THE ORDERING CONSTRAINT, AS DATA. An Aseprite export also satisfies the TexturePacker detector, so the
  // narrower format must come first or every Aseprite file is routed to the wrong parser without erroring.
  // `describe('registry ordering')` pins the behaviour; this pins the list a caller is handed, which is the
  // thing someone could reasonably alphabetise.
  it('places Aseprite before the broader TexturePacker', () => {
    const kinds = spritesheetAllFormats.map((format) => format.kind);
    expect(kinds.indexOf(SpritesheetFormatKindAseprite)).toBeLessThan(
      kinds.indexOf(SpritesheetFormatKindTexturePacker),
    );
  });

  it('covers exactly the built-in kinds the registry holds', () => {
    expect([...spritesheetAllFormats.map((format) => format.kind)].sort()).toEqual(
      [...getSpritesheetFormatKinds()].sort(),
    );
  });

  // A descriptor has to carry the SAME entry the registry resolved, or a catalog row naming a descriptor would
  // name an implementation the importer does not use.
  it('carries the entry identity the registry holds for each kind', () => {
    for (const format of spritesheetAllFormats) {
      expect(getSpritesheetFormat(format.kind)).toBe(format.entry);
    }
  });

  it('names each kind once', () => {
    const kinds = spritesheetAllFormats.map((format) => format.kind);
    expect(kinds.length).toBe(new Set(kinds).size);
  });
});

describe('unregisterSpritesheetFormat', () => {
  it('removes a format from detection and direct resolution', () => {
    const kind = 'test.RemovedFormat';
    registerSpritesheetFormat(kind, {
      detect: (text) => text.startsWith('REMOVED:'),
      parse: () =>
        (() => {
          const out = allocateEntity<any>();
          out.animations = [];
          out.frames = [];
          out.imageFile = '';
          out.imageHeight = 0;
          out.imageWidth = 0;
          out.scale = 1;
          return finishEntity(out);
        })(),
    });

    unregisterSpritesheetFormat(kind);

    expect(detectSpritesheetFormat('REMOVED: data')).toBeNull();
    expect(getSpritesheetFormat(kind)).toBeNull();
  });
});

// The smallest valid SpritesheetData, built the way the surrounding tests build one: allocate, fill every field
// the type declares, finish. A literal would not carry the entity identity the type requires.
function emptySpritesheetData(): SpritesheetData {
  const out = allocateEntity<SpritesheetData>();
  out.animations = [];
  out.frames = [];
  out.imageFile = '';
  out.imageHeight = 0;
  out.imageWidth = 0;
  out.scale = 1;
  return finishEntity(out);
}
