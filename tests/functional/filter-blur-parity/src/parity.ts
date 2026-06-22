// Shared per-backend contract for the filter-parity suite.
//
// A parity test lays out two tiles: a REFERENCE tile (the canonical CPU/surface filter, blitted as a
// plain bitmap — identical bytes on every backend) and a NATIVE tile (the same source pushed through
// THIS backend's real filter path). app.ts is backend-agnostic; each render.<backend>.ts implements
// this contract so app.ts never branches on the renderer.
//
// The two filter shapes differ by backend and this contract absorbs that difference:
//   - DOM / Canvas: the native blur is a CSS filter string bound to a scene node; the normal render
//     draws it. `applyNativeBlur(node, filter)` binds the filter; the node must already be in `root`.
//   - Gl: the native blur is a multi-pass shader into offscreen render targets, composited onto the
//     screen after the scene. `drawNativeBlur(spec)` runs that GPU pass; it is a no-op on DOM/Canvas.
// A backend implements whichever path is real for it and leaves the other a no-op, so app.ts can call
// both unconditionally.
import type { Bitmap, BlurFilter, DisplayObject, ImageResource } from '@flighthq/sdk';

export interface NativeBlurSpec {
  // The source image to blur natively (the same pixels the reference tile blurred on the CPU).
  source: ImageResource;
  blurX: number;
  blurY: number;
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
  // CSS-filter backends (DOM/Canvas): bind the native blur to a scene node drawn by the normal render.
  // No-op on Gl. `node` must already be attached under the root passed to render().
  applyNativeBlur(node: Bitmap, filter: Readonly<BlurFilter>): void;
  // Shader backends (Gl): run the offscreen multi-pass blur and composite it at the native tile.
  // No-op on DOM/Canvas. Called after applyNativeBlur, immediately before/around render().
  drawNativeBlur?(spec: Readonly<NativeBlurSpec>): void;
  render(root: DisplayObject): void;
}
