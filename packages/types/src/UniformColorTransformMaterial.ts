import type { ColorTransform } from './ColorTransform';
import type { Material } from './Material';

// Per-batch color transform. The value lives on the material and uploads as a single GL
// uniform for the whole batch — the material renderer declares instanceFloatCount = 0 and
// has no packInstance. A node needs no trait; a different colorTransform value means a
// different material, which breaks the batch on its own. Cheapest path for tinting a whole
// group or layer uniformly.
//
// Use ColorTransformMaterial instead when many nodes need distinct tints while staying in
// one batch.
export interface UniformColorTransformMaterial extends Material {
  colorTransform: ColorTransform;
}

export const UniformColorTransformMaterialKind: unique symbol = Symbol('UniformColorTransformMaterial');
