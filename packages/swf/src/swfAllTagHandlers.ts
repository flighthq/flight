import type { SwfTagHandler } from '@flighthq/types/contract';

import { swfBitmapTagFamily } from './swfBitmapTagFamily.ts';
import { swfControlTagFamily } from './swfControlTagFamily.ts';
import { swfFontTagFamily } from './swfFontTagFamily.ts';
import { swfPlacementTagFamily } from './swfPlacementTagFamily.ts';
import { swfScriptTagFamily } from './swfScriptTagFamily.ts';
import { swfShapeTagFamily } from './swfShapeTagFamily.ts';
import { swfSoundTagFamily } from './swfSoundTagFamily.ts';
import { swfSpriteTagFamily } from './swfSpriteTagFamily.ts';
import { swfTextTagFamily } from './swfTextTagFamily.ts';
import { swfVideoTagFamily } from './swfVideoTagFamily.ts';

/**
 * Every tag handler Flight reads a SWF with — the full-support preset.
 *
 * This is the only module that names all ten families, which is what keeps the boundary structural
 * rather than a favour from a tree shaker: a build that names its own handlers never reaches this file,
 * so the families it left out are absent from its module graph rather than merely unreferenced in it.
 *
 * The order is load-bearing and is the order the retired named-slot registry consulted its slots in.
 * Handlers are asked in array order when a placed character has to become a node, so preserving it
 * preserves which handler claims a character that more than one could.
 */
export const swfAllTagHandlers: readonly SwfTagHandler[] = [
  ...swfTextTagFamily,
  ...swfBitmapTagFamily,
  ...swfVideoTagFamily,
  ...swfShapeTagFamily,
  ...swfSpriteTagFamily,
  ...swfControlTagFamily,
  ...swfFontTagFamily,
  ...swfPlacementTagFamily,
  ...swfScriptTagFamily,
  ...swfSoundTagFamily,
];
