import type { GlShapeMesh } from './GlShapeMesh';
import type { Image } from './Image';

// The offscreen 2D surface a rasterizing shape strategy replays into, wrapped as an Image so the shared
// quad-batch writer treats a canvas-backed shape uniformly with bitmaps and atlases. Allocated on the
// first shape that actually rasterizes, so a scene drawn entirely through the mesh path carries none.
export interface GlShapeRasterSurface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  image: Image;
}

// Renderer-private scratch for a Shape node on the WebGL backend, held in the opaque RendererData slot.
// It lives in the header layer because the three shape strategies — mesh-only, raster-only, and the
// hybrid that composes them — are separate modules so an app pays only for the one it registers, and all
// three read and write this same per-node cache.
//
// The two halves are independent: `meshes` caches the tessellated form (null when some region has none),
// and `surface` plus the last* fields cache the rasterized form. A strategy touches only its own half.
export interface GlShapeRendererData {
  surface: GlShapeRasterSurface | null;
  lastContentId: number;
  lastPixelRatio: number;
  lastW: number;
  lastH: number;
  meshVersion: number;
  meshes: GlShapeMesh[] | null;
}
