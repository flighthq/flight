import type { Scene3DMaterialTextureRegistry, ShadedMaterial } from '@flighthq/types/contract';
import { ShadedMaterialKind } from '@flighthq/types/contract';

import { registerScene3DMaterialTextures } from './sceneMaterialTextureRegistry';

// Lists the ShadedMaterial base maps so the resolver can resolve them. Registered separately from
// registerBuiltInScene3DMaterialTextures' PBR/unlit set so an app that never uses the shaded base pays
// nothing for it — but note that WITHOUT this registration an unlisted kind appends nothing at all, so a
// ShadedMaterial's textures are silently never resolved. Every ShadedMaterial consumer needs it; the AWD2
// importer produces nothing else.
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
