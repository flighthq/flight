import type { SpineBinaryRegistry, SpineBinarySectionContext } from '@flighthq/types/contract';
import { SpineBinarySectionKind } from '@flighthq/types/contract';

import { spineBinarySectionReaders } from './spineBinaryParse';
import { registerSpineBinarySectionHandler } from './spineBinaryRegistry';

/** Registers all eight top-level Spine 4.1 section handlers. */
export function registerSpineBinarySectionHandlers(registry: SpineBinaryRegistry): void {
  registerSpineBinarySectionHandler(registry, SpineBinarySectionKind.Animations, spineBinaryAnimationsSectionHandler);
  registerSpineBinarySectionHandler(registry, SpineBinarySectionKind.Bones, spineBinaryBonesSectionHandler);
  registerSpineBinarySectionHandler(registry, SpineBinarySectionKind.Events, spineBinaryEventsSectionHandler);
  registerSpineBinarySectionHandler(
    registry,
    SpineBinarySectionKind.IkConstraints,
    spineBinaryIkConstraintsSectionHandler,
  );
  registerSpineBinarySectionHandler(
    registry,
    SpineBinarySectionKind.PathConstraints,
    spineBinaryPathConstraintsSectionHandler,
  );
  registerSpineBinarySectionHandler(registry, SpineBinarySectionKind.Skins, spineBinarySkinsSectionHandler);
  registerSpineBinarySectionHandler(registry, SpineBinarySectionKind.Slots, spineBinarySlotsSectionHandler);
  registerSpineBinarySectionHandler(
    registry,
    SpineBinarySectionKind.TransformConstraints,
    spineBinaryTransformConstraintsSectionHandler,
  );
}

export function spineBinaryAnimationsSectionHandler(context: SpineBinarySectionContext): void {
  spineBinarySectionReaders.animations(context);
}

export function spineBinaryBonesSectionHandler(context: SpineBinarySectionContext): void {
  spineBinarySectionReaders.bones(context);
}

export function spineBinaryEventsSectionHandler(context: SpineBinarySectionContext): void {
  spineBinarySectionReaders.events(context);
}

export function spineBinaryIkConstraintsSectionHandler(context: SpineBinarySectionContext): void {
  spineBinarySectionReaders.ikConstraints(context);
}

export function spineBinaryPathConstraintsSectionHandler(context: SpineBinarySectionContext): void {
  spineBinarySectionReaders.pathConstraints(context);
}

export function spineBinarySkinsSectionHandler(context: SpineBinarySectionContext): void {
  spineBinarySectionReaders.skins(context);
}

export function spineBinarySlotsSectionHandler(context: SpineBinarySectionContext): void {
  spineBinarySectionReaders.slots(context);
}

export function spineBinaryTransformConstraintsSectionHandler(context: SpineBinarySectionContext): void {
  spineBinarySectionReaders.transformConstraints(context);
}
