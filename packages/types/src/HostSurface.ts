import type { Surface } from './Surface.ts';

// Sets the size a surface is presented at, in logical pixels. Its own slot rather than a member of the
// resize capability because the two are independently absent: an offscreen or headless host resizes its
// backing store and has no presented size at all, and an omitted slot is the honest report there. The
// ratio between this and the backing store is the app's render scale, which equals the device pixel ratio
// only when the app chooses that — supersampling and dynamic resolution scaling both depend on the two
// staying separate. A surface this host did not allocate is a no-op, not an error.
export interface HostSurfaceDisplayCapability {
  setDisplaySize(surface: Readonly<Surface>, width: number, height: number): void;
}

// Resizes a surface's backing store, in device pixels. Distinct from the display size above.
export interface HostSurfaceResizeCapability {
  resize(surface: Readonly<Surface>, width: number, height: number): void;
}
