import type { SpineBinaryRegistry, SpineBinarySectionHandler } from '@flighthq/types/contract';
import { SpineBinarySectionKind } from '@flighthq/types/contract';

import { spineBinaryAnimationsSectionHandler } from './spineBinaryAnimationsHandler.ts';
import { spineBinaryBonesSectionHandler } from './spineBinaryBonesHandler.ts';
import { registerSpineBinarySectionHandler } from './spineBinaryRegistry.ts';
import { spineBinarySkinsSectionHandler } from './spineBinarySkinsHandler.ts';
import { spineBinarySlotsSectionHandler } from './spineBinarySlotsHandler.ts';
import {
  spineBinaryEventsSectionHandler,
  spineBinaryIkConstraintsSectionHandler,
  spineBinaryPathConstraintsSectionHandler,
  spineBinaryTransformConstraintsSectionHandler,
} from './spineBinaryStubHandlers.ts';

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

export {
  spineBinaryAnimationsSectionHandler,
  spineBinaryBonesSectionHandler,
  spineBinaryEventsSectionHandler,
  spineBinaryIkConstraintsSectionHandler,
  spineBinaryPathConstraintsSectionHandler,
  spineBinarySkinsSectionHandler,
  spineBinarySlotsSectionHandler,
  spineBinaryTransformConstraintsSectionHandler,
};

export const spineBinaryAllSectionHandlers: readonly SpineBinarySectionHandler[] = [
  spineBinaryAnimationsSectionHandler,
  spineBinaryBonesSectionHandler,
  spineBinaryEventsSectionHandler,
  spineBinaryIkConstraintsSectionHandler,
  spineBinaryPathConstraintsSectionHandler,
  spineBinarySkinsSectionHandler,
  spineBinarySlotsSectionHandler,
  spineBinaryTransformConstraintsSectionHandler,
];
