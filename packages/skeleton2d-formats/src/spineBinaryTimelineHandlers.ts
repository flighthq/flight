import type { SpineBinaryRegistry, SpineBinaryTimelineContext } from '@flighthq/types/contract';
import { SpineBinaryTimelineKind } from '@flighthq/types/contract';

import { spineBinaryTimelineReaders } from './spineBinaryParse';
import { registerSpineBinaryTimelineHandler } from './spineBinaryRegistry';

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
  spineBinaryTimelineReaders.bone(context);
}

export function spineBinaryDeformTimelineHandler(context: SpineBinaryTimelineContext): void {
  spineBinaryTimelineReaders.deform(context);
}

export function spineBinaryDrawOrderTimelineHandler(context: SpineBinaryTimelineContext): void {
  spineBinaryTimelineReaders.drawOrder(context);
}

export function spineBinaryEventTimelineHandler(context: SpineBinaryTimelineContext): void {
  spineBinaryTimelineReaders.event(context);
}

export function spineBinaryIkTimelineHandler(context: SpineBinaryTimelineContext): void {
  spineBinaryTimelineReaders.ik(context);
}

export function spineBinaryPathTimelineHandler(context: SpineBinaryTimelineContext): void {
  spineBinaryTimelineReaders.path(context);
}

export function spineBinarySlotTimelineHandler(context: SpineBinaryTimelineContext): void {
  spineBinaryTimelineReaders.slot(context);
}

export function spineBinaryTransformTimelineHandler(context: SpineBinaryTimelineContext): void {
  spineBinaryTimelineReaders.transform(context);
}
