import type { RenderTexture } from './RenderTexture';
import type { SurfaceMaterial } from './SurfaceMaterial';
import type { Texture } from './Texture';

// Lighting-independent flat color. `baseColor` is packed sRgb-albedo RGBA; `baseColorMap`
// tints it from any registered backing, including a still image or live video host handle. Full
// fidelity on every backend including Canvas2D.
//
// `baseColorRenderMap` is the render-first sibling: a backend target whose resolved attachment is
// sampled directly without a CPU upload. It remains a distinct slot for the same reason as video,
// keeping ordinary still-image materials independent from render-to-texture support. A ready render
// map wins video and still maps; an unavailable one falls back through those existing slots.
export interface UnlitMaterial extends SurfaceMaterial {
  baseColor: number;
  baseColorMap: Texture | null;
  baseColorRenderMap: RenderTexture | null;
}

export const UnlitMaterialKind = 'UnlitMaterial';
