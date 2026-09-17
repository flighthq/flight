import type { HostSurfaceCreateCapability } from '@flighthq/types/contract';

export function createRenderSurface(
  creator: Readonly<HostSurfaceCreateCapability>,
  width: number,
  height: number,
  pixelRatio = 1,
): HTMLCanvasElement {
  const surface = creator.createRenderSurface(width, height, pixelRatio);
  _surfaceCreators.set(surface, creator);
  return surface;
}

export function destroyRenderSurface(surface: HTMLCanvasElement): void {
  const creator = _surfaceCreators.get(surface);
  if (creator === undefined) return;
  _surfaceCreators.delete(surface);
  creator.destroyRenderSurface(surface);
}

const _surfaceCreators = new WeakMap<HTMLCanvasElement, Readonly<HostSurfaceCreateCapability>>();
