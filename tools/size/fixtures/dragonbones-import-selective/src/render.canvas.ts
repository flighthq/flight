import {
  createDragonBonesRegistry,
  dragonBonesBonesSectionHandler,
  dragonBonesSlotsSectionHandler,
  parseDragonBonesSkeletonWithRegistry,
  registerDragonBonesSectionHandler,
} from '@flighthq/skeleton2d-formats/contract';
import { DragonBonesSectionKind } from '@flighthq/types/contract';

const registry = createDragonBonesRegistry();
registerDragonBonesSectionHandler(registry, DragonBonesSectionKind.Bones, dragonBonesBonesSectionHandler);
registerDragonBonesSectionHandler(registry, DragonBonesSectionKind.Slots, dragonBonesSlotsSectionHandler);

export const skeleton = parseDragonBonesSkeletonWithRegistry(
  JSON.stringify({
    compatibleVersion: '5.5',
    version: '5.5',
    armature: [{ bone: [{ name: 'root' }], slot: [{ bone: 'root', name: 's' }] }],
  }),
  registry,
);
