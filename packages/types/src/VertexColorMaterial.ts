import type { Material3D } from './Material3D';

// Uses the mesh's reserved `color0` vertex attribute directly as unlit surface color. `tint` is
// a packed sRgb-albedo RGBA multiplier over the interpolated vertex color. No maps. Full
// fidelity on every backend.
export interface VertexColorMaterial extends Material3D {
  readonly kind: typeof VertexColorMaterialKind;
  tint: number;
}

export const VertexColorMaterialKind = 'VertexColorMaterial';
