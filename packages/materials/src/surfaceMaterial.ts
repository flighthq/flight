import type { AlphaType, Kind, MaterialAlphaMode, SurfaceMaterial } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

import { createMaterial } from './material';

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

// Returns the alpha mode of the material. The alpha mode controls how a material resolves
// coverage: 'opaque' ignores base-color alpha, 'mask' hard-cuts at `alphaCutoff`, 'blend'
// alpha-blends. Callers typically branch on this to configure blend state.
export function getMaterialAlphaMode(source: Readonly<SurfaceMaterial>): MaterialAlphaMode {
  return source.alphaMode;
}

// Returns true when the material's alpha mode is 'blend'. Blended materials require a
// sorted draw order and a GPU blend equation.
export function isMaterialBlended(source: Readonly<SurfaceMaterial>): boolean {
  return source.alphaMode === 'blend';
}

// Returns true when the material's alpha mode is 'mask'. Masked materials discard fragments
// whose alpha is below `alphaCutoff`; no blend state is required.
export function isMaterialMasked(source: Readonly<SurfaceMaterial>): boolean {
  return source.alphaMode === 'mask';
}

// Returns true when the material's alpha mode is 'opaque'. Opaque materials ignore the
// base-color alpha channel; no blend state or discard is required.
export function isMaterialOpaque(source: Readonly<SurfaceMaterial>): boolean {
  return source.alphaMode === 'opaque';
}

const DEFAULT_ALPHA_CUTOFF = 0.5;
const DEFAULT_ALPHA_MODE: MaterialAlphaMode = 'opaque';
const DEFAULT_ALPHA_TYPE: AlphaType = 'straight';
const DEFAULT_DOUBLE_SIDED = false;
