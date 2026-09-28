// glTF bedrock alone: meshes, materials, textures, nodes and scenes, with no optional core family and no
// extension. This is the floor every other glTF row is measured against.
// ★ THE SELECTIVE ENTRY IS `parseGltfWithCoreFeatureHandlers`, which reads with the core-feature handlers it is
// given and resolves no preset. The zero-config `parseGltf` costs all three core families by construction.
import { parseGltfWithCoreFeatureHandlers } from '@flighthq/scene3d-formats';

export const result = parseGltfWithCoreFeatureHandlers('{}', []);
