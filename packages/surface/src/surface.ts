import type { HostSurfaceCreateCapability } from '@flighthq/types/contract';

export function createSurface(
  creator: Readonly<HostSurfaceCreateCapability>,
  width: number,
  height: number,
): HTMLCanvasElement {
  const surface = creator.createSurface(width, height);
  _surfaceCreators.set(surface, creator);
  return surface;
}

export function destroySurface(surface: HTMLCanvasElement): void {
  const creator = _surfaceCreators.get(surface);
  if (creator === undefined) return;
  _surfaceCreators.delete(surface);
  creator.destroySurface(surface);
}

const _surfaceCreators = new WeakMap<HTMLCanvasElement, Readonly<HostSurfaceCreateCapability>>();
