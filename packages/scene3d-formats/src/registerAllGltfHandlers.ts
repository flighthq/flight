import type { GltfCoreFeatureHandler, GltfExtensionHandler } from '@flighthq/types/contract';

import { registerGltfAnimationHandlers } from './registerGltfAnimationHandlers';
import { registerGltfCameraHandlers } from './registerGltfCameraHandlers';
import { registerGltfLightingExtensionHandlers } from './registerGltfLightingExtensionHandlers';
import { registerGltfMaterialExtensionHandlers } from './registerGltfMaterialExtensionHandlers';
import { registerGltfSkinHandlers } from './registerGltfSkinHandlers';

// Registers every optional glTF family shipped by Flight across the parser's two caller-owned lists.
// Registering another handler with the same source-native kind afterward replaces the built-in.
export function registerAllGltfHandlers(
  coreFeatureHandlers: GltfCoreFeatureHandler[],
  extensionHandlers: GltfExtensionHandler[],
): void {
  registerGltfAnimationHandlers(coreFeatureHandlers);
  registerGltfCameraHandlers(coreFeatureHandlers);
  registerGltfSkinHandlers(coreFeatureHandlers);
  registerGltfMaterialExtensionHandlers(extensionHandlers);
  registerGltfLightingExtensionHandlers(extensionHandlers);
}
