import type { SurfaceMaterial } from './SurfaceMaterial';
import type { Texture } from './Texture';

// Classic diffuse-only Lambertian shading. `diffuse` is packed sRgb-albedo RGBA, `diffuseMap`
// tints it; `emissive`/`emissiveMap` add self-illumination.
export interface LambertMaterial extends SurfaceMaterial {
  diffuse: number;
  diffuseMap: Texture | null;
  emissive: number;
  emissiveMap: Texture | null;
}

export const LambertMaterialKind: unique symbol = Symbol('LambertMaterial');
