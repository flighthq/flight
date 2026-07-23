import { createEntity } from '@flighthq/entity';
import type { ShadedMaterial, ShadedMaterialOptions } from '@flighthq/types';
import { BlendMode, ShadedMaterialKind } from '@flighthq/types';

// The options for `createShadedMaterial`. Every field is optional and defaults to the classic lit
// base at neutral values (white diffuse/specular, shininess 32, no maps, an empty modifier stack);
// `modifiers` is the ordered augmentation stack this base carries.

// Builds the composable lit base material owned by @flighthq/shading — a diffuse + half-vector
// specular surface carrying an ordered `modifiers` stack that the per-backend compile path assembles
// over the shared light block into one program keyed by the stack's define-key. This is the ONLY
// base modifiers attach to in v1. `diffuse`/`specular` are packed sRgb-albedo RGBA (0xrrggbbaa) and
// default to opaque white; `shininess` (the specular exponent) defaults to 32; `normalScale` to 1;
// all maps to null; `modifiers` to an empty stack. The shared SurfaceMaterial trailer starts opaque,
// single-sided, straight alpha, Normal blend, 0.5 mask cutoff — mutate the returned entity to change
// them. The result is an entity (it carries runtime/binding identity), not a plain literal.
export function createShadedMaterial(options?: Readonly<ShadedMaterialOptions>): ShadedMaterial {
  const material = createEntity({ kind: ShadedMaterialKind }) as ShadedMaterial;
  material.alphaCutoff = 0.5;
  material.alphaMode = 'opaque';
  material.alphaType = 'straight';
  material.blendMode = BlendMode.Normal;
  material.diffuse = options?.diffuse ?? 0xffffffff;
  material.diffuseMap = options?.diffuseMap ?? null;
  material.doubleSided = false;
  material.modifiers = options?.modifiers ?? [];
  material.normalMap = options?.normalMap ?? null;
  material.normalScale = options?.normalScale ?? 1;
  material.shininess = options?.shininess ?? 32;
  material.specular = options?.specular ?? 0xffffffff;
  material.specularMap = options?.specularMap ?? null;
  return material;
}
