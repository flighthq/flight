import type { HostImageSource } from './HostImageSource';

// Pixel size of a borrowed host image handle, written into a caller-owned pair rather than allocated.
export interface HostImageDimensions {
  height: number;
  width: number;
}

// Measures a borrowed host handle. `@flighthq/image` never learns what a handle IS — a canvas, a
// decoded bitmap, a video frame, a native texture — so the host that produced the handle is what can
// read its size. Returns false when this resolver does not recognize the handle, leaving `out`
// untouched so a caller keeps the dimensions it already had.
export type HostImageDimensionResolver = (source: HostImageSource, out: HostImageDimensions) => boolean;
