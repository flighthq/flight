import type { DragonBonesRegistry, DragonBonesSectionHandler } from '@flighthq/types/contract';
import { DragonBonesSectionKind } from '@flighthq/types/contract';

import { dragonBonesAnimationsSectionHandler } from './dragonBonesAnimationsHandler.ts';
import { dragonBonesBonesSectionHandler } from './dragonBonesBonesHandler.ts';
import { registerDragonBonesSectionHandler } from './dragonBonesRegistry.ts';
import { dragonBonesSkinsSectionHandler } from './dragonBonesSkinsHandler.ts';
import { dragonBonesSlotsSectionHandler } from './dragonBonesSlotsHandler.ts';
import { dragonBonesIkConstraintsSectionHandler } from './dragonBonesStubHandlers.ts';

export function registerDragonBonesSectionHandlers(registry: DragonBonesRegistry): void {
  registerDragonBonesSectionHandler(registry, DragonBonesSectionKind.Bones, dragonBonesBonesSectionHandler);
  registerDragonBonesSectionHandler(registry, DragonBonesSectionKind.Skins, dragonBonesSkinsSectionHandler);
  registerDragonBonesSectionHandler(registry, DragonBonesSectionKind.Slots, dragonBonesSlotsSectionHandler);
  registerDragonBonesSectionHandler(registry, DragonBonesSectionKind.Animations, dragonBonesAnimationsSectionHandler);
  registerDragonBonesSectionHandler(
    registry,
    DragonBonesSectionKind.IkConstraints,
    dragonBonesIkConstraintsSectionHandler,
  );
}

export const dragonBonesAllSectionHandlers: readonly DragonBonesSectionHandler[] = [
  dragonBonesAnimationsSectionHandler,
  dragonBonesBonesSectionHandler,
  dragonBonesIkConstraintsSectionHandler,
  dragonBonesSkinsSectionHandler,
  dragonBonesSlotsSectionHandler,
];
