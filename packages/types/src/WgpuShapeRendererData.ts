import type { CanvasSurface } from './CanvasSurface';
import type { ImageResource } from './ImageResource';
import type { RendererData } from './RendererData';
import type { WgpuShapeMeshBuffers } from './WgpuRenderState';
import type { WgpuShapeMesh } from './WgpuShapeMesh';

// NodeRenderer-private scratch for a Shape node on the WebGPU backend, held in the opaque RendererData slot.
// It lives in the header layer because the three shape strategies — mesh-only, raster-only, and the
// hybrid that composes them — are separate modules so an app pays only for the one it registers, and all
// three read and write this same per-node cache. Mirrors GlShapeRendererData.
//
// The two halves are independent: `meshes` plus `meshBuffers` cache the tessellated form, and
// `surface`/`image` plus the last* fields cache the rasterized form. A strategy touches only its own half,
// and the surface is allocated on first rasterization rather than with the node, so a mesh-only scene
// carries none. `surface` provides the 2D drawing context; `image` is the uploadable texture source.
export interface WgpuShapeRendererData extends RendererData {
  image: ImageResource | null;
  lastContentId: number;
  lastH: number;
  lastPixelRatio: number;
  lastW: number;
  meshBuffers: WgpuShapeMeshBuffers;
  meshVersion: number;
  meshes: WgpuShapeMesh[] | null;
  surface: CanvasSurface | null;
}
