import type { SpineBinaryRegistry, SpineBinarySectionContext } from '@flighthq/types/contract';
import { SpineBinarySectionKind } from '@flighthq/types/contract';

import {
  spineBinaryAnimationsSectionReader,
  spineBinaryBonesSectionReader,
  spineBinaryEventsSectionReader,
  spineBinaryIkConstraintsSectionReader,
  spineBinaryPathConstraintsSectionReader,
  spineBinarySkinsSectionReader,
  spineBinarySlotsSectionReader,
  spineBinaryTransformConstraintsSectionReader,
} from './spineBinaryParse';
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
  spineBinaryAnimationsSectionReader(context);
}

export function spineBinaryBonesSectionHandler(context: SpineBinarySectionContext): void {
  spineBinaryBonesSectionReader(context);
}

export function spineBinaryEventsSectionHandler(context: SpineBinarySectionContext): void {
  spineBinaryEventsSectionReader(context);
}

export function spineBinaryIkConstraintsSectionHandler(context: SpineBinarySectionContext): void {
  spineBinaryIkConstraintsSectionReader(context);
}

export function spineBinaryPathConstraintsSectionHandler(context: SpineBinarySectionContext): void {
  spineBinaryPathConstraintsSectionReader(context);
}

export function spineBinarySkinsSectionHandler(context: SpineBinarySectionContext): void {
  spineBinarySkinsSectionReader(context);
}

export function spineBinarySlotsSectionHandler(context: SpineBinarySectionContext): void {
  spineBinarySlotsSectionReader(context);
}

export function spineBinaryTransformConstraintsSectionHandler(context: SpineBinarySectionContext): void {
  spineBinaryTransformConstraintsSectionReader(context);
}
