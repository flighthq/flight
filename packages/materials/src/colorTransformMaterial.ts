import { createEntity } from '@flighthq/entity';
import type { ColorTransform, ColorTransformMaterial, UniformColorTransformMaterial } from '@flighthq/types';
import { ColorTransformMaterialKind, UniformColorTransformMaterialKind } from '@flighthq/types';

import { createColorTransform } from './colorTransform';

// Per-instance color transform. Carries no value: the backend material renderer reads each
// node's HasColorTransform trait and packs it as per-instance attribute data, so many
// independently-tinted nodes stay in one batch.
export function createColorTransformMaterial(): ColorTransformMaterial {
  return createEntity({ kind: ColorTransformMaterialKind });
}

// Per-batch color transform. The value lives on the material and uploads as a single uniform;
// a different value means a different material, which breaks the batch on its own.
export function createUniformColorTransformMaterial(colorTransform?: ColorTransform): UniformColorTransformMaterial {
  return createEntity({
    kind: UniformColorTransformMaterialKind,
    colorTransform: colorTransform ?? createColorTransform(),
  });
}
