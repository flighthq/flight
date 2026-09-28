import { parseGltfWithCoreFeatureHandlers, registerGltfLightingExtensionHandlers } from '@flighthq/scene3d-formats';
// glTF bedrock plus KHR_lights_punctual, which is the one extension family that links `@flighthq/lighting`.
// ★ THE SELECTIVE ENTRY IS `parseGltfWithCoreFeatureHandlers`, which reads with the core-feature handlers it is
// given and resolves no preset. The zero-config `parseGltf` costs all three core families by construction.
import type { GltfExtensionHandler } from '@flighthq/types';

const extensionHandlers: GltfExtensionHandler[] = [];
registerGltfLightingExtensionHandlers(extensionHandlers);

export const result = parseGltfWithCoreFeatureHandlers('{}', [], undefined, { extensionHandlers });
