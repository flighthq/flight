import type { GltfCoreFeatureHandler } from '@flighthq/types/contract';

import { GltfCamerasCoreFeatureHandler } from './gltfCameras';
import { registerGltfCoreFeatureHandler } from './gltfCoreFeatureRegistry';

// Registers Flight's glTF camera family into a caller-owned feature list.
export function registerGltfCameraHandlers(handlers: GltfCoreFeatureHandler[]): void {
  registerGltfCoreFeatureHandler(handlers, GltfCamerasCoreFeatureHandler);
}
