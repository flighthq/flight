import type { ImageResource } from './ImageResource';

// Backend-neutral scratch surface for renderers that replay 2D drawing commands and upload the result.
// The backing store is deliberately opaque: Web hosts may use a private HTMLCanvasElement, while the
// portable contract exposes only the dimensions, drawing context, and uploadable ImageResource actually used by
// consumers. CanvasRenderingContext2D remains a deliberate host-type residue beyond this surface seam.
export interface Raster2DSurface {
  width: number;
  height: number;
  readonly context: CanvasRenderingContext2D;
  readonly image: ImageResource;
}

export interface Raster2DSurfaceProvider {
  createRaster2DSurface(width: number, height: number): Raster2DSurface | null;
  // Called by @flighthq/render's destroyRaster2DSurface routing, which preserves the creator identity
  // across process-global provider changes. Consumers destroy through that free function, not directly.
  destroyRaster2DSurface(surface: Raster2DSurface): void;
}
