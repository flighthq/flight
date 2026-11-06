import type { GltfCoreFeatureHandler } from './contract.scene3d-formats-types.ts';
import { registerGltfCoreFeatureHandler } from './gltfCoreFeatureRegistry.ts';
import { GltfSkinsCoreFeatureHandler } from './gltfSkins.ts';

// Registers Flight's glTF skin/skeleton family into a caller-owned feature list.
export function registerGltfSkinHandlers(handlers: GltfCoreFeatureHandler[]): void {
  registerGltfCoreFeatureHandler(handlers, GltfSkinsCoreFeatureHandler);
}
