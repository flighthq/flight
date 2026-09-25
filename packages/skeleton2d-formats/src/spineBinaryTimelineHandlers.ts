import type { SpineBinaryRegistry, SpineBinaryTimelineContext } from '@flighthq/types/contract';
import { SpineBinaryTimelineKind } from '@flighthq/types/contract';

import {
  spineBinaryBoneTimelineReader,
  spineBinaryDeformTimelineReader,
  spineBinaryDrawOrderTimelineReader,
  spineBinaryEventTimelineReader,
  spineBinaryIkTimelineReader,
  spineBinaryPathTimelineReader,
  spineBinarySlotTimelineReader,
  spineBinaryTransformTimelineReader,
} from './spineBinaryParse.ts';
import { registerSpineBinaryTimelineHandler } from './spineBinaryRegistry.ts';

/** Registers all eight animation timeline-family handlers. */
export function registerSpineBinaryTimelineHandlers(registry: SpineBinaryRegistry): void {
  registerSpineBinaryTimelineHandler(registry, SpineBinaryTimelineKind.Bone, spineBinaryBoneTimelineHandler);
  registerSpineBinaryTimelineHandler(registry, SpineBinaryTimelineKind.Deform, spineBinaryDeformTimelineHandler);
  registerSpineBinaryTimelineHandler(registry, SpineBinaryTimelineKind.DrawOrder, spineBinaryDrawOrderTimelineHandler);
  registerSpineBinaryTimelineHandler(registry, SpineBinaryTimelineKind.Event, spineBinaryEventTimelineHandler);
  registerSpineBinaryTimelineHandler(registry, SpineBinaryTimelineKind.Ik, spineBinaryIkTimelineHandler);
  registerSpineBinaryTimelineHandler(registry, SpineBinaryTimelineKind.Path, spineBinaryPathTimelineHandler);
  registerSpineBinaryTimelineHandler(registry, SpineBinaryTimelineKind.Slot, spineBinarySlotTimelineHandler);
  registerSpineBinaryTimelineHandler(registry, SpineBinaryTimelineKind.Transform, spineBinaryTransformTimelineHandler);
}

export function spineBinaryBoneTimelineHandler(context: SpineBinaryTimelineContext): void {
  spineBinaryBoneTimelineReader(context);
}

export function spineBinaryDeformTimelineHandler(context: SpineBinaryTimelineContext): void {
  spineBinaryDeformTimelineReader(context);
}

export function spineBinaryDrawOrderTimelineHandler(context: SpineBinaryTimelineContext): void {
  spineBinaryDrawOrderTimelineReader(context);
}

export function spineBinaryEventTimelineHandler(context: SpineBinaryTimelineContext): void {
  spineBinaryEventTimelineReader(context);
}

export function spineBinaryIkTimelineHandler(context: SpineBinaryTimelineContext): void {
  spineBinaryIkTimelineReader(context);
}

export function spineBinaryPathTimelineHandler(context: SpineBinaryTimelineContext): void {
  spineBinaryPathTimelineReader(context);
}

export function spineBinarySlotTimelineHandler(context: SpineBinaryTimelineContext): void {
  spineBinarySlotTimelineReader(context);
}

export function spineBinaryTransformTimelineHandler(context: SpineBinaryTimelineContext): void {
  spineBinaryTransformTimelineReader(context);
}
