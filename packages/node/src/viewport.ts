import { createEntity } from '@flighthq/entity';
import type { Viewport, ViewportLike } from '@flighthq/types';

// Allocates a Viewport — the bedrock drawable rectangle a scene renders into. Defaults to a zero-origin
// rect at unit device-pixel ratio; pass fields to override. Passive plain data: a Viewport does not own a
// drawable (a renderable surface is a Viewport paired with a RenderTarget).
export function createViewport(obj?: Readonly<ViewportLike>): Viewport {
  return createEntity({
    devicePixelRatio: obj?.devicePixelRatio ?? 1,
    height: obj?.height ?? 0,
    width: obj?.width ?? 0,
    x: obj?.x ?? 0,
    y: obj?.y ?? 0,
  });
}

// Returns the viewport's aspect ratio (width / height), or 1 for a degenerate (zero-height) rect. A 3D
// camera reads its projection aspect from this (`setCamera3DAspect(camera, getViewportAspect(viewport))`).
export function getViewportAspect(viewport: Readonly<Viewport>): number {
  return viewport.height !== 0 ? viewport.width / viewport.height : 1;
}
