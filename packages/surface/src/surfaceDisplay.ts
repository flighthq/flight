import type { HostTargetDisplayCapability, Surface } from '@flighthq/types/contract';

// Sets the size a surface is presented at, in logical pixels. Independent of the backing-store size
// passed to surface creation: their ratio is the app's render scale, which equals the device pixel ratio
// only when the app chooses that. A host that cannot present — headless, offscreen — has no display
// capability to pass, which is the compile-time form of the same fact.
export function setSurfaceDisplaySize(
  capability: Readonly<HostTargetDisplayCapability>,
  surface: Readonly<Surface>,
  width: number,
  height: number,
): void {
  capability.setDisplaySize(surface.target, width, height);
}
