import type { Raster2DSurface } from './Raster2DSurface';
import type { RendererData } from './RendererData';
import type { WgpuShapeMeshBuffers } from './WgpuRenderState';
import type { WgpuShapeMesh } from './WgpuShapeMesh';

// Renderer-private scratch for a Shape node on the WebGPU backend, held in the opaque RendererData slot.
// It lives in the header layer because the three shape strategies — mesh-only, raster-only, and the
// hybrid that composes them — are separate modules so an app pays only for the one it registers, and all
// three read and write this same per-node cache. Mirrors GlShapeRendererData.
//
// The two halves are independent: `meshes` plus `meshBuffers` cache the tessellated form, and `surface`
// plus the last* fields cache the rasterized form. A strategy touches only its own half, and the surface
// is allocated on first rasterization rather than with the node, so a mesh-only scene carries none.
export interface WgpuShapeRendererData extends RendererData {
  surface: Raster2DSurface | null;
  lastContentId: number;
  lastPixelRatio: number;
  lastW: number;
  lastH: number;
  meshVersion: number;
  meshes: WgpuShapeMesh[] | null;
  meshBuffers: WgpuShapeMeshBuffers;
}
