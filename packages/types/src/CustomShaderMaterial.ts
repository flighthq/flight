import type { SurfaceMaterial } from './SurfaceMaterial';
import type { Texture } from './Texture';

// User-authored shader material: the caller supplies a GLSL vertex + fragment pair registered
// under `shaderKey`, a flat `uniforms` bag of scalar and vector values, and an optional
// `textures` bag of named texture bindings. The renderer looks up the compiled program by key,
// uploads the built-in camera/model uniforms, then iterates the caller's uniforms and textures.
// This is the 3D-material analog of CustomShaderEffect (the post-process custom shader): both
// are keyed by a string into a per-state source registry, but CustomShaderMaterial participates
// in the 3D mesh draw pipeline (bind/draw, depth, cull) rather than the 2D fullscreen pass.
export interface CustomShaderMaterial extends SurfaceMaterial {
  kind: 'CustomShaderMaterial';
  shaderKey: string;
  textures: Record<string, Texture> | null;
  uniforms: Record<string, number | number[]> | null;
}

export const CustomShaderMaterialKind = 'CustomShaderMaterial';
