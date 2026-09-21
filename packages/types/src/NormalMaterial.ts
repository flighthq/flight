import type { Material3D } from './Material3D';
import type { Texture } from './Texture';

// Pass-infrastructure material: outputs the world- (or view-) space surface normal as color,
// used by normal-buffer-driven passes. `normalMap` perturbs the geometric normal; `normalScale`
// scales the tangent-space perturbation.
export interface NormalMaterial extends Material3D {
  readonly kind: typeof NormalMaterialKind;
  normalMap: Texture | null;
  normalScale: number;
}

export const NormalMaterialKind = 'NormalMaterial';
