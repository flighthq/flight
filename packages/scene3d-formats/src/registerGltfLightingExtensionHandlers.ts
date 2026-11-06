import type { GltfExtensionHandler } from './contract.scene3d-formats-types.ts';
import { registerGltfExtensionHandler } from './gltfExtensionHandlerRegistry.ts';
import { GltfPunctualLightsExtensionHandler } from './gltfPunctualLights.ts';

// Registers Flight's glTF lighting-extension family into a caller-owned extension list.
export function registerGltfLightingExtensionHandlers(handlers: GltfExtensionHandler[]): void {
  registerGltfExtensionHandler(handlers, GltfPunctualLightsExtensionHandler);
}
