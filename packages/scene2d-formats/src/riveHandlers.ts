import type { RiveImportRegistry } from '@flighthq/types/contract';

import { registerRiveAssetHandlers } from './riveAssets';
import { registerRiveClippingHandlers } from './riveClipping';
import { registerRiveDrawOrderHandlers } from './riveDrawOrder';
import { registerRiveLayoutHandlers } from './riveLayout';
import { registerRiveShapeHandlers } from './riveShapeNode';
import { registerRivePaintHandlers } from './riveShapePaint';
import { registerRivePathHandlers } from './riveShapePath';
import { registerRiveSkeletonHandlers } from './riveSkeleton';
import { registerRiveSoloHandlers } from './riveSolo';
import { registerRiveStateMachineHandlers } from './riveStateMachine';
import { registerRiveTextHandlers } from './riveText';

/**
 * Installs every Rive family this package reads, in the order their passes depend on each other.
 *
 * Registration order is pass order, and three of these orderings are load-bearing. Clipping reads the
 * path records collected during the component walk, so it must run before the shape pass replaces
 * them with freshly built ones. Draw order and solo both rearrange or hide nodes, and want the tree
 * still in file order when they do. The skeleton must exist before animation channels bind against
 * its setup pose, because a Rive keyframe states an absolute value and the binder composes a delta
 * from the pose.
 *
 * Pulling this in costs every family. A caller that wants less builds the registry itself and calls
 * only the registrars it needs; the families are independent, and each one's absence costs exactly
 * the content it reads.
 */
export function registerAllRiveHandlers(registry: RiveImportRegistry): void {
  registerRivePathHandlers(registry);
  registerRivePaintHandlers(registry);
  registerRiveTextHandlers(registry);
  registerRiveAssetHandlers(registry);
  registerRiveClippingHandlers(registry);
  registerRiveDrawOrderHandlers(registry);
  registerRiveSoloHandlers(registry);
  registerRiveShapeHandlers(registry);
  registerRiveSkeletonHandlers(registry);
  registerRiveLayoutHandlers(registry);
  registerRiveStateMachineHandlers(registry);
}
