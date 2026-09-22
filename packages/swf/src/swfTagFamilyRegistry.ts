import type { SwfTagFamilyRegistry } from '@flighthq/types/contract';

import { swfBitmapTagFamily } from './swfBitmapTagFamily';
import { swfControlTagFamily } from './swfControlTagFamily';
import { swfFontTagFamily } from './swfFontTagFamily';
import { swfPlacementTagFamily } from './swfPlacementTagFamily';
import { swfScriptTagFamily } from './swfScriptTagFamily';
import { swfShapeTagFamily } from './swfShapeTagFamily';
import { swfSoundTagFamily } from './swfSoundTagFamily';
import { swfSpriteTagFamily } from './swfSpriteTagFamily';
import { createSwfTagFamilyRegistry } from './swfTagFamilyDispatch';
import { swfTextTagFamily } from './swfTextTagFamily';
import { swfVideoTagFamily } from './swfVideoTagFamily';

// The one file that names every family, and therefore the one edge by which a build can acquire all ten.
// Nothing in the importer imports it: the tag walk takes a registry it was handed and reaches the
// families only through that value, so a caller who assembles their own never links this module and
// never links the nine families they left out.

// Every family, which is what reproduces the importer's full behavior. A caller who wants less builds
// the registry themselves and pays for nothing they left out.
export function createSwfDefaultTagFamilyRegistry(): SwfTagFamilyRegistry {
  return createSwfTagFamilyRegistry({
    bitmap: swfBitmapTagFamily,
    control: swfControlTagFamily,
    font: swfFontTagFamily,
    placement: swfPlacementTagFamily,
    script: swfScriptTagFamily,
    shape: swfShapeTagFamily,
    sound: swfSoundTagFamily,
    sprite: swfSpriteTagFamily,
    text: swfTextTagFamily,
    video: swfVideoTagFamily,
  });
}
