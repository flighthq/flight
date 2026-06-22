import type { SurfaceMaterial } from './SurfaceMaterial';
import type { Texture } from './Texture';

// Lighting-independent flat color. `baseColor` is packed sRgb-albedo RGBA; `baseColorMap`
// tints it. Full fidelity on every backend including Canvas2D.
export interface UnlitMaterial extends SurfaceMaterial {
  baseColor: number;
  baseColorMap: Texture | null;
}

export const UnlitMaterialKind: unique symbol = Symbol('UnlitMaterial');
