import { createEntity } from '@flighthq/entity/contract';
import type {
  Kind,
  Material,
  Scene3DMaterialTextureLister,
  Scene3DMaterialTextureRegistry,
  StandardPbrMaterial,
  Texture,
  UnlitMaterial,
} from '@flighthq/types/contract';
import { StandardPbrMaterialKind, UnlitMaterialKind } from '@flighthq/types/contract';

export function createScene3DMaterialTextureRegistry(): Scene3DMaterialTextureRegistry {
  return createEntity({ listers: new Map() });
}

// Looks up the lister for `material.kind` and, when present, appends the material's non-null Textures
// to `out`. An unregistered kind appends nothing. Does not clear `out` — it accumulates across the
// materials of a mesh.
export function getScene3DMaterialTextures(
  registry: Readonly<Scene3DMaterialTextureRegistry>,
  material: Readonly<Material>,
  out: Texture[],
): void {
  const lister = registry.listers.get(material.kind);
  if (lister !== undefined) lister(material, out);
}

// Registers the built-in surface-material listers (StandardPbrMaterial and UnlitMaterial). Opt-in so
// it carries no top-level side effect; callers that build their own registry invoke it explicitly.
export function registerBuiltInScene3DMaterialTextures(registry: Scene3DMaterialTextureRegistry): void {
  registerScene3DMaterialTextures(registry, StandardPbrMaterialKind, listStandardPbrMaterialTextures);
  registerScene3DMaterialTextures(registry, UnlitMaterialKind, listUnlitMaterialTextures);
}

// Binds `lister` to `kind` (last-write-wins; overriding a built-in with a custom lister is a
// feature, not an error — no registration guard).
export function registerScene3DMaterialTextures(
  registry: Scene3DMaterialTextureRegistry,
  kind: Kind,
  lister: Scene3DMaterialTextureLister,
): void {
  registry.listers.set(kind, lister);
}

function listStandardPbrMaterialTextures(material: Readonly<Material>, out: Texture[]): void {
  const pbr = material as Readonly<StandardPbrMaterial>;
  if (pbr.baseColorMap !== null) out.push(pbr.baseColorMap);
  if (pbr.emissiveMap !== null) out.push(pbr.emissiveMap);
  if (pbr.metallicRoughnessMap !== null) out.push(pbr.metallicRoughnessMap);
  if (pbr.normalMap !== null) out.push(pbr.normalMap);
  if (pbr.occlusionMap !== null) out.push(pbr.occlusionMap);
}

function listUnlitMaterialTextures(material: Readonly<Material>, out: Texture[]): void {
  const unlit = material as Readonly<UnlitMaterial>;
  if (unlit.baseColorMap !== null) out.push(unlit.baseColorMap);
}
