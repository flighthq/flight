// What a build pays for auto-detection across every spritesheet format — the registry route, named honestly.
//
// Its pair, `spritesheet-codec-one`, names a single codec directly. A caller who wants detection genuinely wants
// every codec and this is its real price; what must not happen is a build asking for one format and paying this.
import { applySpritesheetImportOptions, parseSpritesheet, spritesheetAllFormats } from '@flighthq/spritesheet-formats';

applySpritesheetImportOptions({ formats: spritesheetAllFormats });

export const sheet = parseSpritesheet(
  JSON.stringify({ frames: {}, meta: { app: 'texturepacker', image: 'atlas.png' } }),
);
