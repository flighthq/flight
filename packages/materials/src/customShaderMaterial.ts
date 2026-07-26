import type { CustomShaderMaterial } from '@flighthq/types/contract';
import { CustomShaderMaterialKind } from '@flighthq/types/contract';

import { createSurfaceMaterial } from './surfaceMaterial';

// User-authored shader material. `shaderKey` references backend-native source registered on the
// render state (registerGlCustomMaterialShader or registerWgpuCustomMaterialShader); `uniforms`
// carries flat scalar/vector values and `textures` carries named bindings. All default to their
// sentinel (empty key, null bags) so a bare material remains structurally valid before registration.
export function createCustomShaderMaterial(opts?: Readonly<Partial<CustomShaderMaterial>>): CustomShaderMaterial {
  const material = createSurfaceMaterial(CustomShaderMaterialKind, opts) as CustomShaderMaterial;
  material.shaderKey = opts?.shaderKey ?? '';
  material.textures = opts?.textures ?? null;
  material.uniforms = opts?.uniforms ?? null;
  return material;
}
