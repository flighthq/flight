import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { CanvasSurface, EntityConstruction, HostCanvasCapability, HostTarget } from '@flighthq/types/contract';

// Allocates a drawable of the given backing-store size in device pixels and acquires a 2D context on it.
// Returns null when the host cannot rasterize 2D.
export function createCanvasSurface(
  capability: Readonly<HostCanvasCapability>,
  width: number,
  height: number,
  options?: Readonly<CanvasRenderingContext2DSettings>,
): CanvasSurface | null {
  const target = capability.create(width, height, options);
  if (target === null) return null;
  return createCanvasSurfaceFromTarget(capability, target, options);
}

// Acquires a 2D context on a target the host already holds. The caller keeps ownership of the drawable.
export function createCanvasSurfaceFromTarget(
  capability: Readonly<HostCanvasCapability>,
  target: HostTarget,
  options?: Readonly<CanvasRenderingContext2DSettings>,
): CanvasSurface | null {
  const context = capability.acquire(target, options);
  if (context === null) return null;
  const surface = allocateEntity<CanvasSurface>();
  initializeCanvasSurface(surface, target, context);
  return finishEntity(surface);
}

export function destroyCanvasSurface(
  capability: Readonly<HostCanvasCapability>,
  surface: Readonly<CanvasSurface>,
): void {
  capability.release(surface.target);
}

function initializeCanvasSurface(
  surface: EntityConstruction<CanvasSurface>,
  target: HostTarget,
  context: CanvasRenderingContext2D,
): void {
  surface.__brand = 'CanvasSurface' as const;
  surface.context = context;
  surface.target = target;
}
