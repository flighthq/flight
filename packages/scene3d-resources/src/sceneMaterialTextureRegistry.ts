import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  ExtendedPbrMaterial,
  Kind,
  Material,
  Scene3DMaterialTextureLister,
  Scene3DMaterialTextureRegistry,
  Scene3DPbrExtensionTextureLister,
  StandardPbrMaterial,
  StandardPbrMaterialProperties,
  Texture,
  UnlitMaterial,
} from '@flighthq/types/contract';
import { ExtendedPbrMaterialKind, StandardPbrMaterialKind, UnlitMaterialKind } from '@flighthq/types/contract';

export function createScene3DMaterialTextureRegistry(): Scene3DMaterialTextureRegistry {
  const out = allocateEntity<Scene3DMaterialTextureRegistry>();
  initializeScene3DMaterialTextureRegistry(out);
  return finishEntity(out);
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

// Whether `kind` has a lister at all. getScene3DMaterialTextures appends nothing for an unregistered
// kind, which is indistinguishable from a material that genuinely has no maps — this is the query that
// separates the two, and it is what explainScene3DResourceCoverage reports through.
export function hasScene3DMaterialTextureLister(
  registry: Readonly<Scene3DMaterialTextureRegistry>,
  kind: Kind,
): boolean {
  return registry.listers.has(kind);
}

export function initializeScene3DMaterialTextureRegistry(
  out: EntityConstruction<Scene3DMaterialTextureRegistry>,
): void {
  out.extensionListers = new Map();
  out.listers = new Map();
}

export function registerExtendedPbrScene3DMaterialTextures(registry: Scene3DMaterialTextureRegistry): void {
  registerScene3DMaterialTextures(registry, ExtendedPbrMaterialKind, (material, out): void => {
    const extended = material as Readonly<ExtendedPbrMaterial>;
    listStandardPbrPropertiesTextures(extended.standard, out);
    for (let i = 0; i < extended.extensions.length; i++) {
      const extension = extended.extensions[i];
      const lister = registry.extensionListers.get(extension.kind);
      if (lister !== undefined) lister(extension, out);
    }
  });
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

export function registerScene3DPbrExtensionTextures(
  registry: Scene3DMaterialTextureRegistry,
  kind: Kind,
  lister: Scene3DPbrExtensionTextureLister,
): void {
  registry.extensionListers.set(kind, lister);
}

export function registerStandardPbrScene3DMaterialTextures(registry: Scene3DMaterialTextureRegistry): void {
  registerScene3DMaterialTextures(registry, StandardPbrMaterialKind, listStandardPbrMaterialTextures);
}

export function registerUnlitScene3DMaterialTextures(registry: Scene3DMaterialTextureRegistry): void {
  registerScene3DMaterialTextures(registry, UnlitMaterialKind, listUnlitMaterialTextures);
}

function listStandardPbrMaterialTextures(material: Readonly<Material>, out: Texture[]): void {
  listStandardPbrPropertiesTextures(material as Readonly<StandardPbrMaterial>, out);
}

function listStandardPbrPropertiesTextures(pbr: Readonly<StandardPbrMaterialProperties>, out: Texture[]): void {
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
