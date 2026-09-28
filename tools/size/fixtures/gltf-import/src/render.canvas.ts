// glTF with the zero-config parser — the control the core-feature subsets are priced against.
// ★ THE SELECTIVE ENTRY IS `parseGltfWithCoreFeatureHandlers`, which reads with the core-feature handlers it is
// given and resolves no preset. The zero-config `parseGltf` costs all three core families by construction.
import { parseGltf } from '@flighthq/scene3d-formats';

export const result = parseGltf('{}');
