import type { GlShapeMesh } from './GlShapeMesh';
import type { Raster2DSurface } from './Raster2DSurface';
import type { RendererData } from './RendererData';

// Renderer-private scratch for a Shape node on the WebGL backend, held in the opaque RendererData slot.
// It lives in the header layer because the three shape strategies — mesh-only, raster-only, and the
// hybrid that composes them — are separate modules so an app pays only for the one it registers, and all
// three read and write this same per-node cache.
//
// The two halves are independent: `meshes` caches the tessellated form (null when some region has none),
// and `surface` plus the last* fields cache the rasterized form. A strategy touches only its own half.
export interface GlShapeRendererData extends RendererData {
  surface: Raster2DSurface | null;
  lastContentId: number;
  lastPixelRatio: number;
  lastW: number;
  lastH: number;
  meshVersion: number;
  meshes: GlShapeMesh[] | null;
}
