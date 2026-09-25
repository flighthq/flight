import type { Material3D } from './Material3D.ts';
import type { Texture } from './Texture.ts';

// Classic diffuse-only Lambertian shading. `diffuse` is packed sRgb-albedo RGBA, `diffuseMap`
// tints it; `emissive`/`emissiveMap` add self-illumination.
export interface LambertMaterial extends Material3D {
  readonly kind: typeof LambertMaterialKind;
  diffuse: number;
  diffuseMap: Texture | null;
  emissive: number;
  emissiveMap: Texture | null;
}

export const LambertMaterialKind = 'LambertMaterial';
