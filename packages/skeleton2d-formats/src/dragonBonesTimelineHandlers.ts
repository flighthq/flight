import type { DragonBonesRegistry, DragonBonesTimelineHandler } from '@flighthq/types/contract';
import { DragonBonesTimelineKind } from '@flighthq/types/contract';

import { dragonBonesBoneTimelineHandler } from './dragonBonesBoneTimelineHandler.ts';
import { registerDragonBonesTimelineHandler } from './dragonBonesRegistry.ts';
import { dragonBonesSlotTimelineHandler } from './dragonBonesSlotTimelineHandler.ts';
import {
  dragonBonesDeformTimelineHandler,
  dragonBonesIkTimelineHandler,
  dragonBonesZOrderTimelineHandler,
} from './dragonBonesStubHandlers.ts';

export function registerDragonBonesTimelineHandlers(registry: DragonBonesRegistry): void {
  registerDragonBonesTimelineHandler(registry, DragonBonesTimelineKind.Bone, dragonBonesBoneTimelineHandler);
  registerDragonBonesTimelineHandler(registry, DragonBonesTimelineKind.Deform, dragonBonesDeformTimelineHandler);
  registerDragonBonesTimelineHandler(registry, DragonBonesTimelineKind.Ik, dragonBonesIkTimelineHandler);
  registerDragonBonesTimelineHandler(registry, DragonBonesTimelineKind.Slot, dragonBonesSlotTimelineHandler);
  registerDragonBonesTimelineHandler(registry, DragonBonesTimelineKind.ZOrder, dragonBonesZOrderTimelineHandler);
}

export const dragonBonesAllTimelineHandlers: readonly DragonBonesTimelineHandler[] = [
  dragonBonesBoneTimelineHandler,
  dragonBonesDeformTimelineHandler,
  dragonBonesIkTimelineHandler,
  dragonBonesSlotTimelineHandler,
  dragonBonesZOrderTimelineHandler,
];
