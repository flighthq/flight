import type { Surface } from './Surface.ts';

// A Canvas 2D rendering surface: a host-allocated drawable with an acquired 2D drawing context. Used for
// both presentation (via HostCanvasCapability.create/acquire) and offscreen allocation (via createSurface).
// Backing store dimensions are read live from the drawable rather than mirrored here.
// CanvasRenderingContext2D remains a deliberate host-type residue at this seam.
export interface CanvasSurface extends Surface {
  readonly __brand: 'CanvasSurface';
  readonly context: CanvasRenderingContext2D;
}
