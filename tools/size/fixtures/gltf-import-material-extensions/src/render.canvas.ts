import { parseGltfWithCoreFeatureHandlers, registerGltfMaterialExtensionHandlers } from '@flighthq/scene3d-formats';
// glTF bedrock plus the eleven KHR material extensions, and no core family at all — the combination that
// shows extension weight is independent of the core-feature preset.
// ★ THE SELECTIVE ENTRY IS `parseGltfWithCoreFeatureHandlers`, which reads with the core-feature handlers it is
// given and resolves no preset. The zero-config `parseGltf` costs all three core families by construction.
import type { GltfExtensionHandler } from '@flighthq/types';

const extensionHandlers: GltfExtensionHandler[] = [];
registerGltfMaterialExtensionHandlers(extensionHandlers);

export const result = parseGltfWithCoreFeatureHandlers('{}', [], undefined, { extensionHandlers });
