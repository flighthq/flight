import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { ShadedMaterial, ShadedMaterialOptions } from '@flighthq/types/contract';
import { BlendMode, ShadedMaterialKind } from '@flighthq/types/contract';

// The options for `createShadedMaterial`. Every field is optional and defaults to the classic lit
// base at neutral values (white diffuse/specular, shininess 32, no maps, an empty modifier stack);
// `modifiers` is the ordered augmentation stack this base carries.

// Builds the composable lit base material owned by @flighthq/shading — a diffuse + half-vector
// specular surface carrying an ordered `modifiers` stack that the per-backend compile path assembles
// over the shared light block into one program keyed by the stack's define-key. This is the ONLY
// base modifiers attach to in v1. `diffuse`/`specular` are packed sRgb-albedo RGBA (0xrrggbbaa) and
// default to opaque white; `shininess` (the specular exponent) defaults to 32; `normalScale` to 1;
// all maps to null; `modifiers` to an empty stack. The shared SurfaceMaterial trailer is forwarded from
// `options` (ShadedMaterialOptions extends SurfaceMaterialOptions), falling back to opaque, single-sided,
// straight alpha, Normal blend, 0.5 mask cutoff — so a masked/blended ShadedMaterial is expressible at
// construction, exactly as for BlinnPhong/PBR. The result is an entity (it carries runtime/binding
// identity), not a plain literal.
export function createShadedMaterial(options?: Readonly<ShadedMaterialOptions>): ShadedMaterial {
  const out = allocateEntity<ShadedMaterial>();
  out.kind = ShadedMaterialKind;
  out.alphaCutoff = options?.alphaCutoff ?? 0.5;
  out.alphaMode = options?.alphaMode ?? 'opaque';
  out.blendMode = options?.blendMode ?? BlendMode.Normal;
  out.diffuse = options?.diffuse ?? 0xffffffff;
  out.diffuseMap = options?.diffuseMap ?? null;
  out.doubleSided = options?.doubleSided ?? false;
  out.modifiers = options?.modifiers ?? [];
  out.normalMap = options?.normalMap ?? null;
  out.normalScale = options?.normalScale ?? 1;
  out.shininess = options?.shininess ?? 32;
  out.specular = options?.specular ?? 0xffffffff;
  out.specularMap = options?.specularMap ?? null;
  return finishEntity(out);
}
