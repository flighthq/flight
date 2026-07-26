import type { Material } from './Material';

// The authorable unlit textured material used by the standard 2D draw pipeline. Geometry renderers
// supply the texture and per-instance data; the material is the stable family identity that material
// features promote without changing batch identity.
export interface StandardMaterial extends Material {
  readonly kind: StandardMaterialKind;
}

export const StandardMaterialKind = 'StandardMaterial';
export type StandardMaterialKind = typeof StandardMaterialKind;
