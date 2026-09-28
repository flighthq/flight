// glTF bedrock plus the animation core family: keyframe samplers and channel-to-node binding.
// ★ THE SELECTIVE ENTRY IS `parseGltfWithCoreFeatureHandlers`, which reads with the core-feature handlers it is
// given and resolves no preset. The zero-config `parseGltf` costs all three core families by construction.
import { parseGltfWithCoreFeatureHandlers, registerGltfAnimationHandlers } from '@flighthq/scene3d-formats';

const coreFeatureHandlers = [];
registerGltfAnimationHandlers(coreFeatureHandlers);

export const result = parseGltfWithCoreFeatureHandlers('{}', coreFeatureHandlers);
