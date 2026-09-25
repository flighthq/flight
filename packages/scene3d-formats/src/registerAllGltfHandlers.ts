import type { GltfCoreFeatureHandler, GltfExtensionHandler } from '@flighthq/types/contract';

import { registerGltfAnimationHandlers } from './registerGltfAnimationHandlers.ts';
import { registerGltfCameraHandlers } from './registerGltfCameraHandlers.ts';
import { registerGltfLightingExtensionHandlers } from './registerGltfLightingExtensionHandlers.ts';
import { registerGltfMaterialExtensionHandlers } from './registerGltfMaterialExtensionHandlers.ts';
import { registerGltfSkinHandlers } from './registerGltfSkinHandlers.ts';

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
