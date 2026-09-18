import type { AppWindow } from './AppWindow';
import type { Entity } from './Entity';
import type { NativeSurfaceHandle, Surface } from './Surface';

// Canvas 2D drawable lifecycle, in the same two lanes as HostGlCapability: `create` allocates a drawable
// from a window, and every other operation addresses the Surface. A host that rasterizes 2D through
// something other than a browser canvas — cairo on an X drawable, Direct2D on an HWND — implements the
// same calls over its own drawable.
export interface HostCanvasCapability extends Entity {
  acquire(
    surface: Readonly<Surface>,
    options?: Readonly<CanvasRenderingContext2DSettings>,
  ): CanvasRenderingContext2D | null;
  create(
    window: Readonly<AppWindow>,
    width: number,
    height: number,
    options?: Readonly<CanvasRenderingContext2DSettings>,
  ): NativeSurfaceHandle | null;
  release(surface: Readonly<Surface>): void;
}
