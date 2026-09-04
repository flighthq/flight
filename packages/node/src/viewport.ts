import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Viewport, ViewportLike, EntityConstruction } from '@flighthq/types/contract';

export function createViewport(obj?: Readonly<ViewportLike>): Viewport {
  const out = allocateEntity<Viewport>();
  initializeViewport(out, obj);
  return finishEntity(out);
}

// Returns the viewport's aspect ratio (width / height), or 1 for a degenerate (zero-height) rect. A 3D
// camera reads its projection aspect from this (`setCamera3DAspect(camera, getViewportAspect(viewport))`).
export function getViewportAspect(viewport: Readonly<Viewport>): number {
  return viewport.height !== 0 ? viewport.width / viewport.height : 1;
}

// Allocates a Viewport — the bedrock drawable rectangle a scene renders into. Defaults to a zero-origin
// rect at unit device-pixel ratio; pass fields to override. Passive plain data: a Viewport does not own a
// drawable (a renderable surface is a Viewport paired with a RenderTarget).
export function initializeViewport(out: EntityConstruction<Viewport>, obj?: Readonly<ViewportLike>): void {
  out.devicePixelRatio = obj?.devicePixelRatio ?? 1;
  out.height = obj?.height ?? 0;
  out.width = obj?.width ?? 0;
  out.x = obj?.x ?? 0;
  out.y = obj?.y ?? 0;
}
