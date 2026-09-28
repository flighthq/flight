import { parseGltfWithCoreFeatureHandlers, registerGltfSkinHandlers } from '@flighthq/scene3d-formats';
// glTF bedrock plus the skin core family: joint lists and inverse-bind matrices.
// ★ THE SELECTIVE ENTRY IS `parseGltfWithCoreFeatureHandlers`, which reads with the core-feature handlers it is
// given and resolves no preset. The zero-config `parseGltf` costs all three core families by construction.
import type { GltfCoreFeatureHandler } from '@flighthq/types';

const coreFeatureHandlers: GltfCoreFeatureHandler[] = [];
registerGltfSkinHandlers(coreFeatureHandlers);

export const result = parseGltfWithCoreFeatureHandlers('{}', coreFeatureHandlers);
