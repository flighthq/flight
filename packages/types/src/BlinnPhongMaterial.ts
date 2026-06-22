import type { SurfaceMaterial } from './SurfaceMaterial';
import type { Texture } from './Texture';

// Classic Blinn-Phong shading: diffuse plus a half-vector specular lobe (cheaper, smoother
// highlights than reflection-vector Phong). `diffuse`/`specular` are packed sRgb-albedo RGBA
// (with their maps); `shininess` is the specular exponent; `normalMap`/`normalScale` perturb
// the surface normal.
export interface BlinnPhongMaterial extends SurfaceMaterial {
  diffuse: number;
  diffuseMap: Texture | null;
  normalMap: Texture | null;
  normalScale: number;
  shininess: number;
  specular: number;
  specularMap: Texture | null;
}

export const BlinnPhongMaterialKind: unique symbol = Symbol('BlinnPhongMaterial');
