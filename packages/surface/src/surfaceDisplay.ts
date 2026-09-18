import type { HostSurfaceDisplayCapability, HostSurfaceResizeCapability, Surface } from '@flighthq/types/contract';

// Resizes a surface's backing store, in device pixels. The context or acquisition reads the new size
// live, so nothing on the surface has to be updated alongside it.
export function resizeSurface(
  capability: Readonly<HostSurfaceResizeCapability>,
  surface: Readonly<Surface>,
  width: number,
  height: number,
): void {
  capability.resize(surface, width, height);
}

// Sets the size a surface is presented at, in logical pixels. Independent of the backing-store size: the
// ratio is the app's render scale, which equals the device pixel ratio only when the app chooses that.
export function setSurfaceDisplaySize(
  capability: Readonly<HostSurfaceDisplayCapability>,
  surface: Readonly<Surface>,
  width: number,
  height: number,
): void {
  capability.setDisplaySize(surface, width, height);
}
