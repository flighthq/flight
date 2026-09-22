import type { SwfTagFamily, SwfTagFamilyDispatch, SwfTagFamilyRegistry } from '@flighthq/types/contract';

// Turning a registry into the table a tag walk runs on. This module imports no family, which is what
// makes the boundary structural rather than a favour from a tree shaker: the importer reaches only this
// file, so a build that assembles its own registry has no family it did not name anywhere in its module
// graph — not merely unreferenced in it. `createSwfDefaultTagFamilyRegistry`, which does name all ten,
// is in a file of its own for exactly that reason.

// The order registered families are consulted in when a placed character has to become a node, and the
// order their resolve and resource phases run in. A character id is defined exactly once — a second
// definition under the same id is refused at the tag — so at most one family ever claims one, and this
// order only decides which is asked first.
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

// Expands every registered family's tag list into one flat table, once per import. The per-tag cost of
// the walk is therefore a single lookup however many families are registered, rather than a scan.
export function createSwfTagFamilyDispatch(registry: Readonly<SwfTagFamilyRegistry>): SwfTagFamilyDispatch {
  const dispatch = new Map<number, Readonly<SwfTagFamily>>();
  for (const family of getSwfTagFamilies(registry)) {
    for (const tag of family.tags) dispatch.set(tag, family);
  }
  return dispatch;
}

// The registered families, in instantiation order. Skipping the empty slots here is what keeps every
// later phase a plain iteration.
export function getSwfTagFamilies(registry: Readonly<SwfTagFamilyRegistry>): Readonly<SwfTagFamily>[] {
  const families: Readonly<SwfTagFamily>[] = [];
  for (const slot of SWF_TAG_FAMILY_INSTANTIATION_ORDER) {
    const family = registry[slot];
    if (family !== undefined && family !== null) families.push(family);
  }
  return families;
}
