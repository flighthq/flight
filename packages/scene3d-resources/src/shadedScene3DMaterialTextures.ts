import type { Scene3DMaterialTextureRegistry, ShadedMaterial } from '@flighthq/types/contract';
import { ShadedMaterialKind } from '@flighthq/types/contract';

import { registerScene3DMaterialTextures } from './sceneMaterialTextureRegistry';

// Lists the ShadedMaterial base maps. Registered separately from the surface-material listers'
// PBR/unlit set so an app that never uses the shaded base pays nothing for it.
//
// Registration is a prerequisite for revealScene3DResourcesOnResolve to wait for these maps. Without the
// lister, an all-unlisted mesh keeps its starting alpha and gets no fade. A mixed mesh with a listed
// material carrying pending textures is hidden, but it can reveal when only those listed textures settle
// while a ShadedMaterial map is still pending, so the shaded map may pop in later.
//
// The requirement-set successor is documented in agents/registration-lifecycle.md; see its status header
// for the program authorization this registration builds under.
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
