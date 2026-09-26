import type { SpineJsonRegistry, SpineJsonSectionContext, SpineJsonSectionHandler } from '@flighthq/types/contract';
import { SpineJsonSectionKind } from '@flighthq/types/contract';

import { registerSpineJsonSectionHandler } from './spineJsonRegistry.ts';
import {
  spineJsonAnimationsSectionReader,
  spineJsonBonesSectionReader,
  spineJsonEventsSectionReader,
  spineJsonIkConstraintsSectionReader,
  spineJsonPathConstraintsSectionReader,
  spineJsonSkinsSectionReader,
  spineJsonSlotsSectionReader,
  spineJsonTransformConstraintsSectionReader,
} from './spineParse.ts';

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

export function spineJsonAnimationsSectionHandler(context: SpineJsonSectionContext): void {
  spineJsonAnimationsSectionReader(context);
}

export function spineJsonBonesSectionHandler(context: SpineJsonSectionContext): void {
  spineJsonBonesSectionReader(context);
}

export function spineJsonEventsSectionHandler(context: SpineJsonSectionContext): void {
  spineJsonEventsSectionReader(context);
}

export function spineJsonIkConstraintsSectionHandler(context: SpineJsonSectionContext): void {
  spineJsonIkConstraintsSectionReader(context);
}

export function spineJsonPathConstraintsSectionHandler(context: SpineJsonSectionContext): void {
  spineJsonPathConstraintsSectionReader(context);
}

export function spineJsonSkinsSectionHandler(context: SpineJsonSectionContext): void {
  spineJsonSkinsSectionReader(context);
}

export function spineJsonSlotsSectionHandler(context: SpineJsonSectionContext): void {
  spineJsonSlotsSectionReader(context);
}

export function spineJsonTransformConstraintsSectionHandler(context: SpineJsonSectionContext): void {
  spineJsonTransformConstraintsSectionReader(context);
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
