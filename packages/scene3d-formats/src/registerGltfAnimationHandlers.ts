import type { GltfCoreFeatureHandler } from '@flighthq/types/contract';

import { GltfAnimationsCoreFeatureHandler } from './gltfAnimations';
import { registerGltfCoreFeatureHandler } from './gltfCoreFeatureRegistry';

// Registers Flight's glTF animation family into a caller-owned feature list.
export function registerGltfAnimationHandlers(handlers: GltfCoreFeatureHandler[]): void {
  registerGltfCoreFeatureHandler(handlers, GltfAnimationsCoreFeatureHandler);
}
