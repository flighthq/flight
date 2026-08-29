import type { Image } from './Image';

// Backend-neutral scratch surface for renderers that replay 2D drawing commands and upload the result.
// The backing store is deliberately opaque: Web hosts may use a private HTMLCanvasElement, while the
// portable contract exposes only the dimensions, drawing context, and uploadable Image actually used by
// consumers. CanvasRenderingContext2D remains a deliberate host-type residue beyond this surface seam.
export interface Raster2DSurface {
  width: number;
  height: number;
  readonly context: CanvasRenderingContext2D;
  readonly image: Image;
}

export interface Raster2DSurfaceProvider {
  createRaster2DSurface(width: number, height: number): Raster2DSurface | null;
}
