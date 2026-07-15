import type { CustomShaderMaterial } from '@flighthq/types';
import { CustomShaderMaterialKind } from '@flighthq/types';

import { createSurfaceMaterial } from './surfaceMaterial';

// User-authored shader material. `shaderKey` references a vertex+fragment pair registered on
// the render state (registerGlCustomMaterialShader); `uniforms` carries flat scalar/vector
// values; `textures` carries named texture bindings. All default to their sentinel (empty key,
// null bags) so a bare createCustomShaderMaterial() is structurally valid for tests and
// serialization even before a shader key is assigned.
export function createCustomShaderMaterial(opts?: Readonly<Partial<CustomShaderMaterial>>): CustomShaderMaterial {
  const material = createSurfaceMaterial(CustomShaderMaterialKind) as CustomShaderMaterial;
  material.shaderKey = opts?.shaderKey ?? '';
  material.textures = opts?.textures ?? null;
  material.uniforms = opts?.uniforms ?? null;
  return material;
}
