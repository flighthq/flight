import { parseGltfWithCoreFeatureHandlers, registerAllGltfHandlers } from '@flighthq/scene3d-formats';
// glTF with every family Flight ships: the three core features and both extension families.
// ★ THE SELECTIVE ENTRY IS `parseGltfWithCoreFeatureHandlers`, which reads with the core-feature handlers it is
// given and resolves no preset. The zero-config `parseGltf` costs all three core families by construction.
import type { GltfCoreFeatureHandler, GltfExtensionHandler } from '@flighthq/scene3d-formats/contract';

const coreFeatureHandlers: GltfCoreFeatureHandler[] = [];
const extensionHandlers: GltfExtensionHandler[] = [];
registerAllGltfHandlers(coreFeatureHandlers, extensionHandlers);

export const result = parseGltfWithCoreFeatureHandlers('{}', coreFeatureHandlers, undefined, { extensionHandlers });
