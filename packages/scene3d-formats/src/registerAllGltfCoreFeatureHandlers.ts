import type { GltfCoreFeatureHandler } from '@flighthq/types/contract';

import { registerGltfAnimationHandlers } from './registerGltfAnimationHandlers';
import { registerGltfCameraHandlers } from './registerGltfCameraHandlers';
import { registerGltfSkinHandlers } from './registerGltfSkinHandlers';

// Registers every optional glTF core-section family shipped by Flight. The caller owns the list and may
// replace any built-in afterward by registering another handler with the same source-section kind.
export function registerAllGltfCoreFeatureHandlers(handlers: GltfCoreFeatureHandler[]): void {
  registerGltfAnimationHandlers(handlers);
  registerGltfCameraHandlers(handlers);
  registerGltfSkinHandlers(handlers);
}
