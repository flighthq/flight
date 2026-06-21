// Shared per-backend contract for the filter-outer-glow-parity test (modeled on filter-blur-parity).
//
// A parity test lays out two tiles: a REFERENCE tile (the canonical CPU/surface filter, blitted as a
// plain bitmap — identical bytes on every backend) and a NATIVE tile (the same source pushed through
// THIS backend's real filter path). app.ts is backend-agnostic; each render.<backend>.ts implements
// this contract so app.ts never branches on the renderer.
//
// The two filter shapes differ by backend and this contract absorbs that difference:
//   - DOM / Canvas: the native glow is a CSS drop-shadow filter string bound to a scene node; the
//     normal render draws it. `applyNativeGlow(node, filter)` binds the filter; the node must already
//     be in `root`.
//   - WebGL: the native glow is a tint+box-blur shader chain into offscreen render targets, with the
//     source composited on top — applyOuterGlowFilterToWebGL already produces the finished glow+source
//     in `dest`. `drawNativeGlow(spec)` runs that GPU pass and composites it; it is a no-op on DOM/Canvas.
// A backend implements whichever path is real for it and leaves the other a no-op, so app.ts can call
// both unconditionally.
import type { Bitmap, DisplayObject, ImageResource, OuterGlowFilter } from '@flighthq/sdk';

export interface NativeGlowSpec {
  // The source image to glow natively (the same pixels the reference tile glowed on the CPU).
  source: ImageResource;
  // The full filter descriptor — color, blur, strength, alpha — applied by the GPU pass.
  filter: Readonly<OuterGlowFilter>;
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
  // CSS-filter backends (DOM/Canvas): bind the native glow to a scene node drawn by the normal render.
  // No-op on WebGL. `node` must already be attached under the root passed to render().
  applyNativeGlow(node: Bitmap, filter: Readonly<OuterGlowFilter>): void;
  // Shader backends (WebGL): run the offscreen glow chain and composite it at the native tile.
  // No-op on DOM/Canvas. Called after applyNativeGlow, immediately before/around render().
  drawNativeGlow?(spec: Readonly<NativeGlowSpec>): void;
  render(root: DisplayObject): void;
}
