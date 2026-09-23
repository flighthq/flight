import type { AppWindow } from './AppWindow';
import type { CanvasSurface } from './CanvasSurface';
import type { NativeSurfaceHandle, Surface } from './Surface';

// Canvas 2D drawable lifecycle for presentation and offscreen surfaces. Presentation: `create` allocates
// a drawable from a window, `acquire`/`release` bracket context use. Offscreen: `createSurface` allocates
// a headless drawable at device-pixel dimensions, `destroySurface` frees it. ImageResource production from
// a surface goes through the separate host.image seam (HostImageCapability.createImageFromSurface), not
// here. A host that rasterizes 2D through something other than a browser canvas — cairo on an X drawable,
// Direct2D on an HWND — implements the same calls over its own drawable.
export interface HostCanvasCapability {
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
  createSurface(width: number, height: number): CanvasSurface | null;
  destroySurface(surface: CanvasSurface): void;
  release(surface: Readonly<Surface>): void;
}
