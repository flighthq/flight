import type { CanvasSurface } from './CanvasSurface';
import type { GlShapeMesh } from './GlShapeMesh';
import type { ImageResource } from './ImageResource';
import type { RendererData } from './RendererData';

// NodeRenderer-private scratch for a Shape node on the WebGL backend, held in the opaque RendererData slot.
// It lives in the header layer because the three shape strategies — mesh-only, raster-only, and the
// hybrid that composes them — are separate modules so an app pays only for the one it registers, and all
// three read and write this same per-node cache.
//
// The two halves are independent: `meshes` caches the tessellated form (null when some region has none),
// and `surface`/`image` plus the last* fields cache the rasterized form. A strategy touches only its own
// half. `surface` provides the 2D drawing context; `image` is the uploadable texture source.
export interface GlShapeRendererData extends RendererData {
  image: ImageResource | null;
  lastContentId: number;
  lastH: number;
  lastPixelRatio: number;
  lastW: number;
  meshVersion: number;
  meshes: GlShapeMesh[] | null;
  surface: CanvasSurface | null;
}
