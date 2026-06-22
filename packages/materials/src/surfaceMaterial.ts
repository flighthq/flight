import type { AlphaType, Kind, MaterialAlphaMode, SurfaceMaterial } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

import { createMaterial } from './material';

const DEFAULT_ALPHA_CUTOFF = 0.5;
const DEFAULT_ALPHA_MODE: MaterialAlphaMode = 'opaque';
const DEFAULT_ALPHA_TYPE: AlphaType = 'straight';
const DEFAULT_DOUBLE_SIDED = false;

// Builds a SurfaceMaterial carrying `kind` and the shared trailer at its defaults: opaque,
// single-sided, straight alpha, Normal blend, a 0.5 mask cutoff. Every 3D material constructor
// starts from this and adds its own maps and scalars. The result is a plain entity; callers
// mutate the returned object to set their fields before returning it.
export function createSurfaceMaterial(kind: Kind): SurfaceMaterial {
  const material = createMaterial(kind) as SurfaceMaterial;
  material.alphaCutoff = DEFAULT_ALPHA_CUTOFF;
  material.alphaMode = DEFAULT_ALPHA_MODE;
  material.alphaType = DEFAULT_ALPHA_TYPE;
  material.blendMode = BlendMode.Normal;
  material.doubleSided = DEFAULT_DOUBLE_SIDED;
  return material;
}
