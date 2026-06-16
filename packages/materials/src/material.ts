import { createEntity } from '@flighthq/entity';
import type { Material, UniformColorTransformMaterial } from '@flighthq/types';
import { UniformColorTransformMaterialKind } from '@flighthq/types';

import { equalsColorTransform } from './colorTransform';

export function createMaterial(kind: symbol): Material {
  return createEntity({ kind });
}

// Structural equality for dedup, pooling, and serialization round-trips — NOT the batch
// flush path (batching keys on material by reference). Two materials of the same custom kind
// with no comparable fields here are treated as equal; distinguish those by reference.
export function equalsMaterial(a: Readonly<Material>, b: Readonly<Material>): boolean {
  if (a === b) return true;
  if (a.kind !== b.kind) return false;
  if (a.kind === UniformColorTransformMaterialKind) {
    return equalsColorTransform(
      (a as UniformColorTransformMaterial).colorTransform,
      (b as UniformColorTransformMaterial).colorTransform,
    );
  }
  return true;
}
