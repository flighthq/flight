// Shared per-backend contract for the filter-drop-shadow-parity test.
//
// A parity test lays out two tiles: a REFERENCE tile (the canonical CPU/surface filter, blitted as a
// plain bitmap — identical bytes on every backend) and a NATIVE tile (the same source pushed through
// THIS backend's real filter path). app.ts is backend-agnostic; each render.<backend>.ts implements
// this contract so app.ts never branches on the renderer.
//
// The two filter shapes differ by backend and this contract absorbs that difference:
//   - DOM / Canvas: the native drop shadow is a CSS `drop-shadow(...)` filter string bound to a scene
//     node; the normal render draws it. `applyNativeDropShadow(node, css)` binds the filter; the node
//     must already be in `root`.
//   - WebGL: the native drop shadow is a tint + box-blur + offset-composite shader sequence into
//     offscreen render targets, composited onto the screen after the scene. `drawNativeDropShadow(spec)`
//     runs that GPU pass; it is a no-op on DOM/Canvas.
// A backend implements whichever path is real for it and leaves the other a no-op, so app.ts can call
// both unconditionally.
import type { Bitmap, DisplayObject, DropShadowFilter, ImageResource } from '@flighthq/sdk';

export interface NativeDropShadowSpec {
  // The source image to shadow natively (the same pixels the reference tile shadowed on the CPU).
  source: ImageResource;
  // The exact filter the reference tile used; the WebGL path passes it straight to the GPU filter.
  filter: Readonly<DropShadowFilter>;
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
  // CSS-filter backends (DOM/Canvas): bind the native drop-shadow CSS to a scene node drawn by the
  // normal render. No-op on WebGL. `node` must already be attached under the root passed to render().
  applyNativeDropShadow(node: Bitmap, css: string): void;
  // Shader backends (WebGL): run the offscreen tint/blur/offset passes and composite at the native tile.
  // No-op on DOM/Canvas. Called after applyNativeDropShadow, immediately before/around render().
  drawNativeDropShadow?(spec: Readonly<NativeDropShadowSpec>): void;
  render(root: DisplayObject): void;
}
