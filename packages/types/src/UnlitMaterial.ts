import type { RenderTexture } from './RenderTexture';
import type { SurfaceMaterial } from './SurfaceMaterial';
import type { Texture } from './Texture';
import type { VideoTexture } from './VideoTexture';

// Lighting-independent flat color. `baseColor` is packed sRgb-albedo RGBA; `baseColorMap`
// tints it. Full fidelity on every backend including Canvas2D.
//
// `baseColorVideoMap` is the dynamic, per-frame sibling of `baseColorMap`: a live VideoTexture
// bound into the same color-map slot so a mesh samples a decoding video stream. It is a distinct
// slot rather than a union in `baseColorMap` so the still-image and video paths stay separately
// typed — a renderer branches on which slot is set. When both are set the video map wins (it is the
// more specific, dynamic source); a backend without a video path ignores it and falls back to
// `baseColorMap`. GL and WebGPU upload it through their dynamic frameId-gated texture paths.
//
// `baseColorRenderMap` is the render-first sibling: a backend target whose resolved attachment is
// sampled directly without a CPU upload. It remains a distinct slot for the same reason as video,
// keeping ordinary still-image materials independent from render-to-texture support. A ready render
// map wins video and still maps; an unavailable one falls back through those existing slots.
export interface UnlitMaterial extends SurfaceMaterial {
  baseColor: number;
  baseColorMap: Texture | null;
  baseColorRenderMap: RenderTexture | null;
  baseColorVideoMap: VideoTexture | null;
}

export const UnlitMaterialKind = 'UnlitMaterial';
