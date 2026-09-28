import type { SpineJsonRegistry, SpineJsonSectionHandler } from '@flighthq/types/contract';
import { SpineJsonSectionKind } from '@flighthq/types/contract';

import { spineJsonAnimationsSectionHandler } from './spineJsonAnimationsHandler.ts';
import { spineJsonBonesSectionHandler } from './spineJsonBonesHandler.ts';
import { registerSpineJsonSectionHandler } from './spineJsonRegistry.ts';
import { spineJsonSkinsSectionHandler } from './spineJsonSkinsHandler.ts';
import { spineJsonSlotsSectionHandler } from './spineJsonSlotsHandler.ts';
import {
  spineJsonEventsSectionHandler,
  spineJsonIkConstraintsSectionHandler,
  spineJsonPathConstraintsSectionHandler,
  spineJsonTransformConstraintsSectionHandler,
} from './spineJsonStubHandlers.ts';

export function registerSpineJsonSectionHandlers(registry: SpineJsonRegistry): void {
  registerSpineJsonSectionHandler(registry, SpineJsonSectionKind.Bones, spineJsonBonesSectionHandler);
  registerSpineJsonSectionHandler(registry, SpineJsonSectionKind.Slots, spineJsonSlotsSectionHandler);
  registerSpineJsonSectionHandler(registry, SpineJsonSectionKind.Skins, spineJsonSkinsSectionHandler);
  registerSpineJsonSectionHandler(registry, SpineJsonSectionKind.Events, spineJsonEventsSectionHandler);
  registerSpineJsonSectionHandler(registry, SpineJsonSectionKind.IkConstraints, spineJsonIkConstraintsSectionHandler);
  registerSpineJsonSectionHandler(
    registry,
    SpineJsonSectionKind.PathConstraints,
    spineJsonPathConstraintsSectionHandler,
  );
  registerSpineJsonSectionHandler(
    registry,
    SpineJsonSectionKind.TransformConstraints,
    spineJsonTransformConstraintsSectionHandler,
  );
  registerSpineJsonSectionHandler(registry, SpineJsonSectionKind.Animations, spineJsonAnimationsSectionHandler);
}

export const spineJsonAllSectionHandlers: readonly SpineJsonSectionHandler[] = [
  spineJsonAnimationsSectionHandler,
  spineJsonBonesSectionHandler,
  spineJsonEventsSectionHandler,
  spineJsonIkConstraintsSectionHandler,
  spineJsonPathConstraintsSectionHandler,
  spineJsonSkinsSectionHandler,
  spineJsonSlotsSectionHandler,
  spineJsonTransformConstraintsSectionHandler,
];
