// Shared per-backend contract for the filter-median-parity test.
//
// A parity test lays out two tiles: a REFERENCE tile (the canonical CPU/surface median filter, blitted
// as a plain bitmap — identical bytes on every backend) and a NATIVE tile (the same source pushed
// through THIS backend's real filter path). app.ts is backend-agnostic; each render.<backend>.ts
// implements this contract so app.ts never branches on the renderer.
//
// The median filter has NO CSS form, so the two filter shapes here differ from the blur-parity seam:
//   - DOM / Canvas: there is no native CSS median. The "native" tile is the surface/CPU result itself,
//     blitted as a plain bitmap (parity holds by construction). `applyNativeMedian` is a no-op; the
//     native tile is added to the scene as an ordinary bitmap by app.ts.
//   - Gl: the native median is a single-pass shader into an offscreen render target, composited onto
//     the screen after the scene. `drawNativeMedian(spec)` runs that GPU pass; it is a no-op on DOM/Canvas.
// A backend implements whichever path is real for it and leaves the other a no-op, so app.ts can call
// both unconditionally.
import type { Bitmap, DisplayObject, ImageResource, MedianFilter } from '@flighthq/sdk';

export interface NativeMedianSpec {
  // The source image to filter natively (the same pixels the reference tile filtered on the CPU).
  source: ImageResource;
  radius: number;
  // Top-left of the native tile in logical (CSS-pixel) scene coordinates.
  x: number;
  y: number;
  // Tile edge length in logical pixels (square).
  tile: number;
}

export interface ParityTarget {
  kind: 'canvas' | 'dom' | 'webgl' | 'webgpu';
  width: number;
  height: number;
  // Device-pixel scale: the backing store is width × scale (1 for DOM, devicePixelRatio otherwise).
  scale: number;
  // No-op everywhere for median (there is no native CSS median); kept for symmetry with the parity seam
  // so app.ts can call it unconditionally.
  applyNativeMedian(node: Bitmap, filter: Readonly<MedianFilter>): void;
  // Shader backends (Gl): run the offscreen single-pass median and composite it at the native tile.
  // No-op on DOM/Canvas. Called after applyNativeMedian, immediately before/around render().
  drawNativeMedian?(spec: Readonly<NativeMedianSpec>): void;
  render(root: DisplayObject): void;
}
