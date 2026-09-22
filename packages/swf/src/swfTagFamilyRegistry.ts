import type { SwfTagFamily, SwfTagFamilyDispatch, SwfTagFamilyRegistry } from '@flighthq/types/contract';

import { swfBitmapTagFamily } from './swfBitmapTagFamily';
import { swfControlTagFamily } from './swfControlTagFamily';
import { swfFontTagFamily } from './swfFontTagFamily';
import { swfPlacementTagFamily } from './swfPlacementTagFamily';
import { swfScriptTagFamily } from './swfScriptTagFamily';
import { swfShapeTagFamily } from './swfShapeTagFamily';
import { swfSoundTagFamily } from './swfSoundTagFamily';
import { swfSpriteTagFamily } from './swfSpriteTagFamily';
import { swfTextTagFamily } from './swfTextTagFamily';
import { swfVideoTagFamily } from './swfVideoTagFamily';

// Turning a registry into the table a tag walk runs on, and the one factory that names every family.
//
// Nothing else in the importer imports a family module. That is the whole mechanism: a build that
// assembles its own registry never reaches this file, so the nine families it did not ask for are not in
// its module graph at all — not merely unreferenced in it.

// The order registered families are consulted in when a placed character has to become a node. A
// character id is defined exactly once — a second definition under the same id is refused at the tag —
// so at most one family ever claims one, and this order only decides which is asked first.
export const SWF_TAG_FAMILY_INSTANTIATION_ORDER = [
  'text',
  'bitmap',
  'video',
  'shape',
  'sprite',
  'control',
  'font',
  'placement',
  'script',
  'sound',
] as const satisfies readonly (keyof SwfTagFamilyRegistry)[];

// Every family, which is what reproduces the importer's full behavior. A caller that wants less builds
// the registry itself and pays for nothing it left out.
export function createSwfDefaultTagFamilyRegistry(): SwfTagFamilyRegistry {
  return {
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
  };
}

// Expands every registered family's tag list into one flat table, once per import. The per-tag cost of
// the walk is therefore a single lookup however many families are registered, rather than a scan.
export function createSwfTagFamilyDispatch(registry: Readonly<SwfTagFamilyRegistry>): SwfTagFamilyDispatch {
  const dispatch = new Map<number, Readonly<SwfTagFamily>>();
  for (const family of getSwfTagFamilies(registry)) {
    for (const tag of family.tags) dispatch.set(tag, family);
  }
  return dispatch;
}

// The registered families in instantiation order, which is also the order their resolve and resource
// phases run in. Skipping the empty slots here is what keeps every later phase a plain iteration.
export function getSwfTagFamilies(registry: Readonly<SwfTagFamilyRegistry>): Readonly<SwfTagFamily>[] {
  const families: Readonly<SwfTagFamily>[] = [];
  for (const slot of SWF_TAG_FAMILY_INSTANTIATION_ORDER) {
    const family = registry[slot];
    if (family !== undefined && family !== null) families.push(family);
  }
  return families;
}
