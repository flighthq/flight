import type { SurfaceMaterial } from './SurfaceMaterial';

// Uses the mesh's reserved `color0` vertex attribute directly as unlit surface color. `tint` is
// a packed sRgb-albedo RGBA multiplier over the interpolated vertex color. No maps. Full
// fidelity on every backend.
export interface VertexColorMaterial extends SurfaceMaterial {
  tint: number;
}

export const VertexColorMaterialKind: unique symbol = Symbol('VertexColorMaterial');
