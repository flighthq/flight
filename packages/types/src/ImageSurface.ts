import type { Entity } from './Entity';
import type { ImageResource } from './ImageResource';

// Backend-neutral scratch surface for renderers that replay 2D drawing commands and upload the result.
// The backing store is deliberately opaque: Web hosts may use a private HTMLCanvasElement, while the
// portable contract exposes only the dimensions, drawing context, and uploadable ImageResource actually used by
// consumers. CanvasRenderingContext2D remains a deliberate host-type residue beyond this surface seam.
export interface ImageSurface extends Entity {
  width: number;
  height: number;
  readonly context: CanvasRenderingContext2D;
  readonly image: ImageResource;
}

export interface ImageSurfaceCreator {
  createImageSurface(width: number, height: number): ImageSurface | null;
  destroyImageSurface(surface: ImageSurface): void;
}
