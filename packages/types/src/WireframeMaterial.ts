import type { SurfaceMaterial } from './SurfaceMaterial';

// Edge-only debug shading via barycentric/fwidth line rendering. `color` is the packed
// sRgb-albedo RGBA line color; `thickness` is the line width in pixels. No maps.
export interface WireframeMaterial extends SurfaceMaterial {
  color: number;
  thickness: number;
}

export const WireframeMaterialKind: unique symbol = Symbol('WireframeMaterial');
