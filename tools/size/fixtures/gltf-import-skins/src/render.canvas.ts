// glTF bedrock plus the skin core family: joint lists and inverse-bind matrices.
// ★ THE SELECTIVE ENTRY IS `parseGltfWithCoreFeatureHandlers`, which reads with the core-feature handlers it is
// given and resolves no preset. The zero-config `parseGltf` costs all three core families by construction.
import { parseGltfWithCoreFeatureHandlers, registerGltfSkinHandlers } from '@flighthq/scene3d-formats';

const coreFeatureHandlers = [];
registerGltfSkinHandlers(coreFeatureHandlers);

export const result = parseGltfWithCoreFeatureHandlers('{}', coreFeatureHandlers);
