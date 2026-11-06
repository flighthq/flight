import type { GltfCoreFeatureHandler } from './contract.scene3d-formats-types.ts';
import { GltfCamerasCoreFeatureHandler } from './gltfCameras.ts';
import { registerGltfCoreFeatureHandler } from './gltfCoreFeatureRegistry.ts';

// Registers Flight's glTF camera family into a caller-owned feature list.
export function registerGltfCameraHandlers(handlers: GltfCoreFeatureHandler[]): void {
  registerGltfCoreFeatureHandler(handlers, GltfCamerasCoreFeatureHandler);
}
