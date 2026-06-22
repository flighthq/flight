import type { BlinnPhongMaterial, LambertMaterial, PhongMaterial } from '@flighthq/types';
import { BlinnPhongMaterialKind, LambertMaterialKind, PhongMaterialKind } from '@flighthq/types';

import { createSurfaceMaterial } from './surfaceMaterial';

// Classic Blinn-Phong material: diffuse plus a half-vector specular lobe. `diffuse`/`specular`
// default to white, `shininess` to 32, `normalScale` to 1, all maps to null.
export function createBlinnPhongMaterial(opts?: Readonly<Partial<BlinnPhongMaterial>>): BlinnPhongMaterial {
  const material = createSurfaceMaterial(BlinnPhongMaterialKind) as BlinnPhongMaterial;
  material.diffuse = opts?.diffuse ?? 0xffffffff;
  material.diffuseMap = opts?.diffuseMap ?? null;
  material.normalMap = opts?.normalMap ?? null;
  material.normalScale = opts?.normalScale ?? 1;
  material.shininess = opts?.shininess ?? 32;
  material.specular = opts?.specular ?? 0xffffffff;
  material.specularMap = opts?.specularMap ?? null;
  return material;
}

// Classic diffuse-only Lambertian material. `diffuse` defaults to white, `emissive` to opaque
// black (no self-illumination), both maps to null.
export function createLambertMaterial(opts?: Readonly<Partial<LambertMaterial>>): LambertMaterial {
  const material = createSurfaceMaterial(LambertMaterialKind) as LambertMaterial;
  material.diffuse = opts?.diffuse ?? 0xffffffff;
  material.diffuseMap = opts?.diffuseMap ?? null;
  material.emissive = opts?.emissive ?? 0x000000ff;
  material.emissiveMap = opts?.emissiveMap ?? null;
  return material;
}

// Classic Phong material: diffuse plus a reflection-vector specular lobe. `diffuse`/`specular`
// default to white, `shininess` to 32, `normalScale` to 1, all maps to null.
export function createPhongMaterial(opts?: Readonly<Partial<PhongMaterial>>): PhongMaterial {
  const material = createSurfaceMaterial(PhongMaterialKind) as PhongMaterial;
  material.diffuse = opts?.diffuse ?? 0xffffffff;
  material.diffuseMap = opts?.diffuseMap ?? null;
  material.normalMap = opts?.normalMap ?? null;
  material.normalScale = opts?.normalScale ?? 1;
  material.shininess = opts?.shininess ?? 32;
  material.specular = opts?.specular ?? 0xffffffff;
  material.specularMap = opts?.specularMap ?? null;
  return material;
}
