import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { CanvasSurface, EntityConstruction, HostTarget } from '@flighthq/types/contract';

export function createCanvasSurface(target: HostTarget, context: CanvasRenderingContext2D): CanvasSurface {
  const surface = allocateEntity<CanvasSurface>();
  initializeCanvasSurface(surface, target, context);
  return finishEntity(surface);
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
