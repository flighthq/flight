// glTF bedrock plus the camera core family: perspective and orthographic placement.
// ★ THE SELECTIVE ENTRY IS `parseGltfWithCoreFeatureHandlers`, which reads with the core-feature handlers it is
// given and resolves no preset. The zero-config `parseGltf` costs all three core families by construction.
import { parseGltfWithCoreFeatureHandlers, registerGltfCameraHandlers } from '@flighthq/scene3d-formats';

const coreFeatureHandlers = [];
registerGltfCameraHandlers(coreFeatureHandlers);

export const result = parseGltfWithCoreFeatureHandlers('{}', coreFeatureHandlers);
