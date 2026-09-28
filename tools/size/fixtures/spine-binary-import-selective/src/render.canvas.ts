import {
  createSpineBinaryRegistry,
  parseSpineSkeletonBinaryWithRegistry,
  registerSpineBinarySectionHandler,
  spineBinaryBonesSectionHandler,
  spineBinarySlotsSectionHandler,
} from '@flighthq/skeleton2d-formats/contract';
import { SpineBinarySectionKind } from '@flighthq/types/contract';

const registry = createSpineBinaryRegistry();
registerSpineBinarySectionHandler(registry, SpineBinarySectionKind.Bones, spineBinaryBonesSectionHandler);
registerSpineBinarySectionHandler(registry, SpineBinarySectionKind.Slots, spineBinarySlotsSectionHandler);

export const skeleton = parseSpineSkeletonBinaryWithRegistry(new Uint8Array(0), registry);
