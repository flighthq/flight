import type { SurfaceMaterial } from './SurfaceMaterial';
import type { Texture } from './Texture';

// Classic Blinn-Phong shading: diffuse plus a half-vector specular lobe (cheaper, smoother
// highlights than reflection-vector Phong). `diffuse`/`specular` are packed sRgb-albedo RGBA
// (with their maps); `shininess` is the specular exponent; `normalMap`/`normalScale` perturb
// the surface normal. `alphaMap` is a linear coverage texture whose green channel multiplies the
// final alpha (the dedicated opacity map, separate from `diffuseMap`'s own alpha); it takes effect
// only when `alphaMode` is 'blend' or 'mask'.
export interface BlinnPhongMaterial extends SurfaceMaterial {
  readonly kind: typeof BlinnPhongMaterialKind;
  alphaMap: Texture | null;
  diffuse: number;
  diffuseMap: Texture | null;
  normalMap: Texture | null;
  normalScale: number;
  shininess: number;
  specular: number;
  specularMap: Texture | null;
}

export const BlinnPhongMaterialKind = 'BlinnPhongMaterial';
