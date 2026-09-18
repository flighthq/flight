import type { Surface } from './Surface';

// A Canvas 2D rendering surface: a host-allocated drawable with an acquired 2D drawing context. Backing
// store dimensions are read live from the drawable rather than mirrored here. CanvasRenderingContext2D
// remains a deliberate host-type residue at this seam, as it is on ImageSurface.
export interface CanvasSurface extends Surface {
  readonly __brand: 'CanvasSurface';
  readonly context: CanvasRenderingContext2D;
}
