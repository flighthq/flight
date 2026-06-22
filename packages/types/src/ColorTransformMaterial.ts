import type { Material } from './Material';

// Per-instance color transform. The value is sourced from each node's HasColorTransform
// trait and packed as additional instance attribute data (8 floats: 4 multiplier + 4
// offset), applied per-vertex in the shader. Many independently-tinted nodes stay in a
// single batch — the material renderer declares instanceFloatCount = 8 and implements
// packInstance. Every node in the batch is expected to carry the trait; how a node without
// it is handled is between the user and the registered material renderer.
//
// Use UniformColorTransformMaterial instead when one tint applies to a whole group and the
// per-instance cost is not warranted.
export interface ColorTransformMaterial extends Material {}

export const ColorTransformMaterialKind = 'ColorTransformMaterial';
