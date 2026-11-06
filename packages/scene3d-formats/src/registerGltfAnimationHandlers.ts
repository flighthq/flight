import type { GltfCoreFeatureHandler } from './contract.scene3d-formats-types.ts';
import { GltfAnimationsCoreFeatureHandler } from './gltfAnimations.ts';
import { registerGltfCoreFeatureHandler } from './gltfCoreFeatureRegistry.ts';

// Registers Flight's glTF animation family into a caller-owned feature list.
export function registerGltfAnimationHandlers(handlers: GltfCoreFeatureHandler[]): void {
  registerGltfCoreFeatureHandler(handlers, GltfAnimationsCoreFeatureHandler);
}
