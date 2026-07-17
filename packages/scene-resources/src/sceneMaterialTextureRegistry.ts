import type { Kind, Material, StandardPbrMaterial, Texture, UnlitMaterial } from '@flighthq/types';
import { StandardPbrMaterialKind, UnlitMaterialKind } from '@flighthq/types';

// Appends a material's non-null Textures to `out`. One lister per material kind: the seam that lets
// resource discovery enumerate a material's texture slots without per-kind reflection. A lister
// reads only the slots its concrete material declares (cast from the base Material), so unregistered
// kinds contribute nothing and unused listers tree-shake out.
export type SceneMaterialTextureLister = (material: Readonly<Material>, out: Texture[]) => void;

// Open registry mapping a material `kind` to its texture lister. Users register listers for custom
// material kinds; the built-in listers are opt-in via registerBuiltInSceneMaterialTextures so a
// resolver never carries slot knowledge for materials it does not use.
export interface SceneMaterialTextureRegistry {
  listers: Map<Kind, SceneMaterialTextureLister>;
}

export function createSceneMaterialTextureRegistry(): SceneMaterialTextureRegistry {
  return { listers: new Map() };
}

// Looks up the lister for `material.kind` and, when present, appends the material's non-null Textures
// to `out`. An unregistered kind appends nothing. Does not clear `out` — it accumulates across the
// materials of a mesh.
export function getSceneMaterialTextures(
  registry: Readonly<SceneMaterialTextureRegistry>,
  material: Readonly<Material>,
  out: Texture[],
): void {
  const lister = registry.listers.get(material.kind);
  if (lister !== undefined) lister(material, out);
}

// Registers the built-in surface-material listers (StandardPbrMaterial and UnlitMaterial). Opt-in so
// it carries no top-level side effect; callers that build their own registry invoke it explicitly.
export function registerBuiltInSceneMaterialTextures(registry: SceneMaterialTextureRegistry): void {
  registerSceneMaterialTextures(registry, StandardPbrMaterialKind, listStandardPbrMaterialTextures);
  registerSceneMaterialTextures(registry, UnlitMaterialKind, listUnlitMaterialTextures);
}

// Binds `lister` to `kind` (last-write-wins; overriding a built-in with a custom lister is a
// feature, not an error — no registration guard).
export function registerSceneMaterialTextures(
  registry: SceneMaterialTextureRegistry,
  kind: Kind,
  lister: SceneMaterialTextureLister,
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
