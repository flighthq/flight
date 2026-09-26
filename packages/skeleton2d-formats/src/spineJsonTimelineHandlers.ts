import type { SpineJsonRegistry, SpineJsonTimelineContext, SpineJsonTimelineHandler } from '@flighthq/types/contract';
import { SpineJsonTimelineKind } from '@flighthq/types/contract';

import { registerSpineJsonTimelineHandler } from './spineJsonRegistry.ts';
import {
  spineJsonBoneTimelineReader,
  spineJsonDeformTimelineReader,
  spineJsonDrawOrderTimelineReader,
  spineJsonEventTimelineReader,
  spineJsonIkTimelineReader,
  spineJsonPathTimelineReader,
  spineJsonSlotTimelineReader,
  spineJsonTransformTimelineReader,
} from './spineParse.ts';

export function registerSpineJsonTimelineHandlers(registry: SpineJsonRegistry): void {
  registerSpineJsonTimelineHandler(registry, SpineJsonTimelineKind.Bone, spineJsonBoneTimelineHandler);
  registerSpineJsonTimelineHandler(registry, SpineJsonTimelineKind.Deform, spineJsonDeformTimelineHandler);
  registerSpineJsonTimelineHandler(registry, SpineJsonTimelineKind.DrawOrder, spineJsonDrawOrderTimelineHandler);
  registerSpineJsonTimelineHandler(registry, SpineJsonTimelineKind.Event, spineJsonEventTimelineHandler);
  registerSpineJsonTimelineHandler(registry, SpineJsonTimelineKind.Ik, spineJsonIkTimelineHandler);
  registerSpineJsonTimelineHandler(registry, SpineJsonTimelineKind.Path, spineJsonPathTimelineHandler);
  registerSpineJsonTimelineHandler(registry, SpineJsonTimelineKind.Slot, spineJsonSlotTimelineHandler);
  registerSpineJsonTimelineHandler(registry, SpineJsonTimelineKind.Transform, spineJsonTransformTimelineHandler);
}

export function spineJsonBoneTimelineHandler(
  context: SpineJsonTimelineContext,
  animName: string,
  animEntry: Readonly<Record<string, unknown>>,
): void {
  spineJsonBoneTimelineReader(context, animName, animEntry);
}

export function spineJsonDeformTimelineHandler(
  context: SpineJsonTimelineContext,
  animName: string,
  animEntry: Readonly<Record<string, unknown>>,
): void {
  spineJsonDeformTimelineReader(context, animName, animEntry);
}

export function spineJsonDrawOrderTimelineHandler(
  context: SpineJsonTimelineContext,
  animName: string,
  animEntry: Readonly<Record<string, unknown>>,
): void {
  spineJsonDrawOrderTimelineReader(context, animName, animEntry);
}

export function spineJsonEventTimelineHandler(
  context: SpineJsonTimelineContext,
  animName: string,
  animEntry: Readonly<Record<string, unknown>>,
): void {
  spineJsonEventTimelineReader(context, animName, animEntry);
}

export function spineJsonIkTimelineHandler(
  context: SpineJsonTimelineContext,
  animName: string,
  animEntry: Readonly<Record<string, unknown>>,
): void {
  spineJsonIkTimelineReader(context, animName, animEntry);
}

export function spineJsonPathTimelineHandler(
  context: SpineJsonTimelineContext,
  animName: string,
  animEntry: Readonly<Record<string, unknown>>,
): void {
  spineJsonPathTimelineReader(context, animName, animEntry);
}

export function spineJsonSlotTimelineHandler(
  context: SpineJsonTimelineContext,
  animName: string,
  animEntry: Readonly<Record<string, unknown>>,
): void {
  spineJsonSlotTimelineReader(context, animName, animEntry);
}

export function spineJsonTransformTimelineHandler(
  context: SpineJsonTimelineContext,
  animName: string,
  animEntry: Readonly<Record<string, unknown>>,
): void {
  spineJsonTransformTimelineReader(context, animName, animEntry);
}

export const spineJsonAllTimelineHandlers: readonly SpineJsonTimelineHandler[] = [
  spineJsonBoneTimelineHandler,
  spineJsonDeformTimelineHandler,
  spineJsonDrawOrderTimelineHandler,
  spineJsonEventTimelineHandler,
  spineJsonIkTimelineHandler,
  spineJsonPathTimelineHandler,
  spineJsonSlotTimelineHandler,
  spineJsonTransformTimelineHandler,
];
