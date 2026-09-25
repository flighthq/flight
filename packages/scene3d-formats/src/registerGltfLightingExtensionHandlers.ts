import type { GltfExtensionHandler } from '@flighthq/types/contract';

import { registerGltfExtensionHandler } from './gltfExtensionHandlerRegistry.ts';
import { GltfPunctualLightsExtensionHandler } from './gltfPunctualLights.ts';

// Registers Flight's glTF lighting-extension family into a caller-owned extension list.
export function registerGltfLightingExtensionHandlers(handlers: GltfExtensionHandler[]): void {
  registerGltfExtensionHandler(handlers, GltfPunctualLightsExtensionHandler);
}
