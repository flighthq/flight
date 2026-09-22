import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  SwfTagFamily,
  SwfTagFamilyDispatch,
  SwfTagFamilyRegistry,
} from '@flighthq/types/contract';

// The registry a SWF is read through, and the flat table it expands into. This module imports no family,
// which is what makes the boundary structural rather than a favour from a tree shaker: the importer
// reaches only this file, so a build that assembles its own registry has no family it did not name
// anywhere in its module graph — not merely unreferenced in it. `createSwfDefaultTagFamilyRegistry`,
// which does name all ten, is in a file of its own for exactly that reason.

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

// A registry carrying exactly the families the caller names. Slots left out stay empty, and everything
// behind them — their parsing, their resolution, their resource construction, and the packages those
// reach — is absent from the build rather than merely unused in it.
export function createSwfTagFamilyRegistry(
  families: Readonly<Partial<SwfTagFamilyRegistry>> = {},
): SwfTagFamilyRegistry {
  const out = allocateEntity<SwfTagFamilyRegistry>();
  initializeSwfTagFamilyRegistry(out, families);
  return finishEntity(out);
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

// The flat tag-code table this registry was expanded into when it was built. The per-tag cost of a walk
// is therefore a single lookup however many families are registered, rather than a scan.
export function getSwfTagFamilyDispatch(registry: Readonly<SwfTagFamilyRegistry>): SwfTagFamilyDispatch {
  return registry.dispatch;
}

export function initializeSwfTagFamilyRegistry(
  out: EntityConstruction<SwfTagFamilyRegistry>,
  families: Readonly<Partial<SwfTagFamilyRegistry>>,
): void {
  const dispatch = new Map<number, Readonly<SwfTagFamily>>();
  for (const slot of SWF_TAG_FAMILY_INSTANTIATION_ORDER) {
    const family = families[slot] ?? null;
    out[slot] = family;
    // Expanding here rather than per import is what makes "the table is built once" a property of the
    // registry rather than a convention every caller has to keep.
    if (family !== null) {
      for (const tag of family.tags) dispatch.set(tag, family);
    }
  }
  out.dispatch = dispatch;
}
