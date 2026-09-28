import { parseGltfWithCoreFeatureHandlers, registerGltfAnimationHandlers } from '@flighthq/scene3d-formats';
// glTF bedrock plus the animation core family: keyframe samplers and channel-to-node binding.
// ★ THE SELECTIVE ENTRY IS `parseGltfWithCoreFeatureHandlers`, which reads with the core-feature handlers it is
// given and resolves no preset. The zero-config `parseGltf` costs all three core families by construction.
import type { GltfCoreFeatureHandler } from '@flighthq/types';

const coreFeatureHandlers: GltfCoreFeatureHandler[] = [];
registerGltfAnimationHandlers(coreFeatureHandlers);

export const result = parseGltfWithCoreFeatureHandlers('{}', coreFeatureHandlers);
