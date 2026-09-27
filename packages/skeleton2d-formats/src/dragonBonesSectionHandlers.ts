import type {
  DragonBonesRegistry,
  DragonBonesSectionContext,
  DragonBonesSectionHandler,
} from '@flighthq/types/contract';
import { DragonBonesSectionKind } from '@flighthq/types/contract';

import {
  dragonBonesAnimationsSectionReader,
  dragonBonesBonesSectionReader,
  dragonBonesIkConstraintsSectionReader,
  dragonBonesSkinsSectionReader,
  dragonBonesSlotsSectionReader,
} from './dragonBonesParse.ts';
import { registerDragonBonesSectionHandler } from './dragonBonesRegistry.ts';

export function dragonBonesAnimationsSectionHandler(context: DragonBonesSectionContext): void {
  dragonBonesAnimationsSectionReader(context);
}

export function dragonBonesBonesSectionHandler(context: DragonBonesSectionContext): void {
  dragonBonesBonesSectionReader(context);
}

export function dragonBonesIkConstraintsSectionHandler(context: DragonBonesSectionContext): void {
  dragonBonesIkConstraintsSectionReader(context);
}

export function dragonBonesSkinsSectionHandler(context: DragonBonesSectionContext): void {
  dragonBonesSkinsSectionReader(context);
}

export function dragonBonesSlotsSectionHandler(context: DragonBonesSectionContext): void {
  dragonBonesSlotsSectionReader(context);
}

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
