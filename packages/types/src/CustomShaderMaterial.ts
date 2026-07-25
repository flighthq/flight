import type { SurfaceMaterial } from './SurfaceMaterial';
import type { Texture } from './Texture';

// User-authored shader material: the caller registers backend-native shader source under
// `shaderKey` (a GLSL vertex/fragment pair on GL or a complete fixed-ABI WGSL module on WGPU),
// plus a flat `uniforms` bag of scalar/vector values and optional named texture bindings.
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
