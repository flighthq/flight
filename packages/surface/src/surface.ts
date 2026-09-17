import type { HostSurfaceCreateCapability } from '@flighthq/types/contract';

export function createSurface(
  creator: Readonly<HostSurfaceCreateCapability>,
  width: number,
  height: number,
): HTMLCanvasElement {
  return creator.createSurface(width, height);
}

export function destroySurface(creator: Readonly<HostSurfaceCreateCapability>, surface: HTMLCanvasElement): void {
  creator.destroySurface(surface);
}
