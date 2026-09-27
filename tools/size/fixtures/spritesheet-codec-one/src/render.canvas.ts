// What a build pays when it names the spritesheet codec its content actually uses.
//
// ★ THE PAIR THIS BELONGS TO IS THE WHOLE POINT. `spritesheet-codec-all` names the registry preset instead, and the
// difference between the two is what selecting a codec directly saves. That number is also the reason the manifest
// plugin has no spritesheet analyzer: a generated manifest could only install its choice through
// `applySpritesheetImportOptions`, which reaches the registry initializer and seeds the FULL preset — so the
// analyzer promised this fixture's cost and delivered the other one's.
import { parseTexturePackerSpritesheet } from '@flighthq/spritesheet-formats';

export const sheet = parseTexturePackerSpritesheet(
  JSON.stringify({ frames: {}, meta: { app: 'texturepacker', image: 'atlas.png' } }),
);
