import { finishEntity } from '@flighthq/entity/contract';
import type {
  AppWindow,
  CanvasSurface,
  EntityConstruction,
  HostCanvasCapability,
  NativeSurfaceHandle,
} from '@flighthq/types/contract';

import { allocateSurface } from './surface.ts';

// Allocates a drawable in the given window, sized in device pixels, and acquires a 2D context on it.
// Returns null when the host cannot rasterize 2D on it.
export function createCanvasSurface(
  capability: Readonly<HostCanvasCapability>,
  window: Readonly<AppWindow>,
  width: number,
  height: number,
  options?: Readonly<CanvasRenderingContext2DSettings>,
): CanvasSurface | null {
  const handle = capability.create(window, width, height, options);
  if (handle === null) return null;
  return createCanvasSurfaceFromNativeHandle(capability, handle, options);
}

// Acquires a 2D context on a drawable the caller already owns. The caller keeps ownership of it.
export function createCanvasSurfaceFromNativeHandle(
  capability: Readonly<HostCanvasCapability>,
  handle: NativeSurfaceHandle,
  options?: Readonly<CanvasRenderingContext2DSettings>,
): CanvasSurface | null {
  const surface = allocateSurface<CanvasSurface>(handle);
  surface.__brand = 'CanvasSurface' as const;
  const context = capability.acquire(surface as CanvasSurface, options);
  if (context === null) return null;
  (surface as EntityConstruction<CanvasSurface>).context = context;
  return finishEntity(surface);
}

export function destroyCanvasSurface(
  capability: Readonly<HostCanvasCapability>,
  surface: Readonly<CanvasSurface>,
): void {
  capability.release(surface);
}
