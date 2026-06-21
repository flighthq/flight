// Shared per-backend contract for the filter-gradient-bevel-parity test.
//
// A parity test lays out two tiles: a REFERENCE tile (the canonical CPU/surface filter, blitted as a
// plain bitmap — identical bytes on every backend) and a NATIVE tile (the same source pushed through
// THIS backend's real filter path). app.ts is backend-agnostic; each render.<backend>.ts implements
// this contract so app.ts never branches on the renderer.
//
// The gradient bevel has NO CSS-filter native path (unlike blur). The contract therefore absorbs the
// difference this way:
//   - DOM / Canvas: there is no native CSS gradient-bevel, so the "native" tile is the SAME composited
//     surface bitmap as the reference tile. Parity holds by construction. drawNativeGradientBevel is a
//     no-op; the bitmap is drawn by the normal render. (app.ts supplies both bitmaps.)
//   - WebGL: the native gradient bevel is a multi-pass shader (applyGradientBevelFilterToWebGL) into
//     offscreen render targets, composited onto the screen after the scene. drawNativeGradientBevel
//     runs that GPU pass; it is a no-op on DOM/Canvas.
// A backend implements whichever path is real for it and leaves the other a no-op, so app.ts can call
// drawNativeGradientBevel unconditionally.
import type { DisplayObject, GradientBevelFilter, ImageResource } from '@flighthq/sdk';

export interface NativeGradientBevelSpec {
  // The source image whose ALPHA edges the native bevel reads (same pixels the reference filtered).
  source: ImageResource;
  // The gradient-bevel descriptor — colors/ratios/alphas/angle/distance/blur/strength/bevelType.
  filter: Readonly<Omit<GradientBevelFilter, 'type'>>;
  // Top-left of the native tile in logical (CSS-pixel) scene coordinates.
  x: number;
  y: number;
  // Tile edge length in logical pixels (square).
  tile: number;
}

export interface ParityTarget {
  kind: 'canvas' | 'dom' | 'webgl';
  width: number;
  height: number;
  // Device-pixel scale: the backing store is width × scale (1 for DOM, devicePixelRatio otherwise).
  scale: number;
  // Shader backends (WebGL): run the offscreen multi-pass gradient bevel and composite it at the
  // native tile. No-op on DOM/Canvas (their native tile is the reference bitmap, drawn by render()).
  drawNativeGradientBevel?(spec: Readonly<NativeGradientBevelSpec>): void;
  render(root: DisplayObject): void;
}
