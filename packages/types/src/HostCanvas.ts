import type { Entity } from './Entity';
import type { HostTarget } from './HostTarget';

// Canvas 2D drawable lifecycle, in the same two lanes as HostGlCapability: `create` allocates a drawable
// and returns its identity, `acquire` adopts a target the host already knows. A host that rasterizes 2D
// through something other than a browser canvas (cairo on an X drawable, Direct2D on an HWND) implements
// the same two calls over its own drawable. CanvasRenderingContext2D remains a deliberate host-type
// residue at this seam, as it is on ImageSurface.
export interface HostCanvasCapability extends Entity {
  acquire(target: HostTarget, options?: Readonly<CanvasRenderingContext2DSettings>): CanvasRenderingContext2D | null;
  create(width: number, height: number, options?: Readonly<CanvasRenderingContext2DSettings>): HostTarget | null;
  release(target: HostTarget): void;
}
