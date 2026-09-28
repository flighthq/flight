import type { SpineJsonRegistry, SpineJsonTimelineHandler } from '@flighthq/types/contract';
import { SpineJsonTimelineKind } from '@flighthq/types/contract';

import { spineJsonBoneTimelineHandler } from './spineJsonBoneTimelineHandler.ts';
import { spineJsonDrawOrderTimelineHandler } from './spineJsonDrawOrderTimelineHandler.ts';
import { registerSpineJsonTimelineHandler } from './spineJsonRegistry.ts';
import { spineJsonSlotTimelineHandler } from './spineJsonSlotTimelineHandler.ts';
import {
  spineJsonDeformTimelineHandler,
  spineJsonEventTimelineHandler,
  spineJsonIkTimelineHandler,
  spineJsonPathTimelineHandler,
  spineJsonTransformTimelineHandler,
} from './spineJsonStubHandlers.ts';

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
