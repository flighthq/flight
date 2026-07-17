import type { Modifier } from './Modifier';
import type { SurfaceMaterial } from './SurfaceMaterial';
import type { Texture } from './Texture';

// The composable lit base material owned by @flighthq/shading: a diffuse + half-vector-specular
// surface (the classic lit path) that carries an ordered `modifiers` stack of compiled shader
// augmentations. It is a THIRD assembly over the shared light block — the @flighthq/scene-gl
// compiler reuses GL_MESH_LIGHT_BLOCK_GLSL / glLitProgram exactly as the PBR and classic assemblies
// do, never forking a second light loop — and assembles `base + ordered modifiers` into ONE program
// keyed by the stack's feature-set define-key.
//
// `diffuse`/`specular` are packed sRgb-albedo RGBA (0xrrggbbaa) with their optional maps;
// `shininess` is the specular exponent; `normalMap`/`normalScale` perturb the base normal (before
// any Normal-slot modifier). Modifiers attach ONLY to this base in v1 — they do not stack on the
// @flighthq/materials PBR/classic kinds (the accepted v1 cost); the modifier<->base boundary is a
// contract over the slot taxonomy plus the shared light block, so exposing the same hooks on those
// kinds later is additive.
//
// `modifiers` is ordered: the compiler groups it by slot into a deterministic feature-set, so the
// same stack always produces the same compiled variant and a scene round-trips. Sharing one
// ShadedMaterial instance across nodes batches them by feature-set; a different feature-set breaks
// the batch (a different compiled program).
export interface ShadedMaterial extends SurfaceMaterial {
  diffuse: number;
  diffuseMap: Texture | null;
  modifiers: readonly Modifier[];
  normalMap: Texture | null;
  normalScale: number;
  shininess: number;
  specular: number;
  specularMap: Texture | null;
}

export const ShadedMaterialKind = 'ShadedMaterial';
