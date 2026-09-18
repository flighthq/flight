import type { Surface } from './HostTarget';

// A Canvas 2D rendering surface: the binding of a target to a 2D drawing context. Created by
// createCanvasSurface, which allocates the drawable through HostCanvasCapability, or by
// createCanvasSurfaceFromTarget for a target the host already holds. Backing store dimensions are read
// live from the drawable rather than mirrored here.
export interface CanvasSurface extends Surface {
  readonly __brand: 'CanvasSurface';
  readonly context: CanvasRenderingContext2D;
}
