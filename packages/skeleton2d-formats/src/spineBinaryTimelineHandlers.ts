import type { SpineBinaryRegistry, SpineBinaryTimelineHandler } from '@flighthq/types/contract';
import { SpineBinaryTimelineKind } from '@flighthq/types/contract';

import { spineBinaryBoneTimelineHandler } from './spineBinaryBoneTimelineHandler.ts';
import { spineBinaryDrawOrderTimelineHandler } from './spineBinaryDrawOrderTimelineHandler.ts';
import { registerSpineBinaryTimelineHandler } from './spineBinaryRegistry.ts';
import { spineBinarySlotTimelineHandler } from './spineBinarySlotTimelineHandler.ts';
import {
  spineBinaryDeformTimelineHandler,
  spineBinaryEventTimelineHandler,
  spineBinaryIkTimelineHandler,
  spineBinaryPathTimelineHandler,
  spineBinaryTransformTimelineHandler,
} from './spineBinaryStubTimelineHandlers.ts';

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

export {
  spineBinaryBoneTimelineHandler,
  spineBinaryDeformTimelineHandler,
  spineBinaryDrawOrderTimelineHandler,
  spineBinaryEventTimelineHandler,
  spineBinaryIkTimelineHandler,
  spineBinaryPathTimelineHandler,
  spineBinarySlotTimelineHandler,
  spineBinaryTransformTimelineHandler,
};

export const spineBinaryAllTimelineHandlers: readonly SpineBinaryTimelineHandler[] = [
  spineBinaryBoneTimelineHandler,
  spineBinaryDeformTimelineHandler,
  spineBinaryDrawOrderTimelineHandler,
  spineBinaryEventTimelineHandler,
  spineBinaryIkTimelineHandler,
  spineBinaryPathTimelineHandler,
  spineBinarySlotTimelineHandler,
  spineBinaryTransformTimelineHandler,
];
