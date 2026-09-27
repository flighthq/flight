import type {
  DragonBonesRegistry,
  DragonBonesTimelineContext,
  DragonBonesTimelineHandler,
} from '@flighthq/types/contract';
import { DragonBonesTimelineKind } from '@flighthq/types/contract';

import {
  dragonBonesBoneTimelineReader,
  dragonBonesDeformTimelineReader,
  dragonBonesIkTimelineReader,
  dragonBonesSlotTimelineReader,
  dragonBonesZOrderTimelineReader,
} from './dragonBonesParse.ts';
import { registerDragonBonesTimelineHandler } from './dragonBonesRegistry.ts';

export function dragonBonesBoneTimelineHandler(
  context: DragonBonesTimelineContext,
  animName: string,
  animEntry: Readonly<Record<string, unknown>>,
): void {
  dragonBonesBoneTimelineReader(context, animName, animEntry);
}

export function dragonBonesDeformTimelineHandler(
  context: DragonBonesTimelineContext,
  animName: string,
  animEntry: Readonly<Record<string, unknown>>,
): void {
  dragonBonesDeformTimelineReader(context, animName, animEntry);
}

export function dragonBonesIkTimelineHandler(
  context: DragonBonesTimelineContext,
  animName: string,
  animEntry: Readonly<Record<string, unknown>>,
): void {
  dragonBonesIkTimelineReader(context, animName, animEntry);
}

export function dragonBonesSlotTimelineHandler(
  context: DragonBonesTimelineContext,
  animName: string,
  animEntry: Readonly<Record<string, unknown>>,
): void {
  dragonBonesSlotTimelineReader(context, animName, animEntry);
}

export function dragonBonesZOrderTimelineHandler(
  context: DragonBonesTimelineContext,
  animName: string,
  animEntry: Readonly<Record<string, unknown>>,
): void {
  dragonBonesZOrderTimelineReader(context, animName, animEntry);
}

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
