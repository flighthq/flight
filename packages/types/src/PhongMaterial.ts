import type { SurfaceMaterial } from './SurfaceMaterial';
import type { Texture } from './Texture';

// Classic Phong shading: diffuse plus a reflection-vector specular lobe. `diffuse`/`specular`
// are packed sRgb-albedo RGBA (with their maps); `shininess` is the specular exponent;
// `normalMap`/`normalScale` perturb the surface normal.
export interface PhongMaterial extends SurfaceMaterial {
  diffuse: number;
  diffuseMap: Texture | null;
  normalMap: Texture | null;
  normalScale: number;
  shininess: number;
  specular: number;
  specularMap: Texture | null;
}

export const PhongMaterialKind: unique symbol = Symbol('PhongMaterial');
