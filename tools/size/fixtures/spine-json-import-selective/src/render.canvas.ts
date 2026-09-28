// Selective Spine JSON import registering only bones and slots. This omits animation, easing,
// and the skins/timeline handlers, proving those packages tree-shake out when unused.
import {
  createSpineJsonRegistry,
  parseSpineSkeletonWithRegistry,
  registerSpineJsonSectionHandler,
  spineJsonBonesSectionHandler,
  spineJsonSlotsSectionHandler,
} from '@flighthq/skeleton2d-formats/contract';
import { SpineJsonSectionKind } from '@flighthq/types/contract';

const registry = createSpineJsonRegistry();
registerSpineJsonSectionHandler(registry, SpineJsonSectionKind.Bones, spineJsonBonesSectionHandler);
registerSpineJsonSectionHandler(registry, SpineJsonSectionKind.Slots, spineJsonSlotsSectionHandler);

export const skeleton = parseSpineSkeletonWithRegistry(
  JSON.stringify({ bones: [{ name: 'root' }], slots: [{ bone: 'root', name: 's' }] }),
  registry,
);
