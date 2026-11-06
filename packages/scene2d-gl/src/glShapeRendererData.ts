import type { ImageResource } from '@flighthq/image/contract';
import type { RendererData } from '@flighthq/node/contract';
import type { CanvasSurface } from '@flighthq/surface/contract';

import type { GlShapeMesh } from './types.ts';

// NodeRenderer-private scratch for a Shape node on the WebGL backend, held in the opaque RendererData slot.
// The mesh and raster strategies share this cache while remaining separately registerable.
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
