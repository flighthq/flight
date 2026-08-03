import type { Scene3DMaterialTextureRegistry, ShadedMaterial } from '@flighthq/types/contract';
import { ShadedMaterialKind } from '@flighthq/types/contract';

import { registerScene3DMaterialTextures } from './sceneMaterialTextureRegistry';

// Lists the ShadedMaterial base maps. Registered separately from the surface-material listers'
// PBR/unlit set so an app that never uses the shaded base pays nothing for it.
//
// Registering it is an optimization, not a prerequisite: resolution falls back to every resource-backed
// texture when a material kind has no lister (see getScene3DResourceTextures), so the cost of omitting
// it is a texture fetched that no mesh-attached material needed — not an unresolved map. It IS a
// prerequisite for revealScene3DResourcesOnResolve, which needs texture→owning-node and has no other
// way to get it; without the lister a ShadedMaterial node is simply never faded in.
//
// `getScene3DRequirements` reports this registration for every material kind in a document that carries
// image resources, which is how a caller finds it without knowing the registry exists.
//
// The base maps only. A modifier in `material.modifiers` may carry its own textures (AnimatedNormal,
// VertexDisplace, Dissolve, Emissive), and those need a per-modifier lister registry of their own — the
// shape `extensionListers` already has for PBR extensions. No importer emits modifiers yet, so that
// registry would have nothing to dispatch today.
export function registerShadedScene3DMaterialTextures(registry: Scene3DMaterialTextureRegistry): void {
  registerScene3DMaterialTextures(registry, ShadedMaterialKind, (material, out): void => {
    const shaded = material as Readonly<ShadedMaterial>;
    if (shaded.diffuseMap !== null) out.push(shaded.diffuseMap);
    if (shaded.normalMap !== null) out.push(shaded.normalMap);
    if (shaded.specularMap !== null) out.push(shaded.specularMap);
  });
}
