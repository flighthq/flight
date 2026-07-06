// Shared per-backend contract for the inner-shadow filter-parity test.
//
// A parity test lays out two tiles: a REFERENCE tile (the canonical CPU/surface filter, blitted as a
// plain bitmap — identical bytes on every backend) and a NATIVE tile (the same source pushed through
// THIS backend's real filter path). app.ts is backend-agnostic; each render.<backend>.ts implements
// this contract so app.ts never branches on the renderer.
//
// Inner shadow has NO CSS form (computeInnerShadowFilterCss does not exist — CSS cannot clip a shadow to
// a shape's interior), so unlike blur-parity there is no CSS native path:
//   - DOM / Canvas: there is no native inner-shadow primitive. The "native" tile draws the SAME surface
//     reference bitmap, so parity holds by construction; these backends only prove the harness wiring.
//     `applyNativeInnerShadow` is a no-op kept for symmetry with the blur seam.
//   - Gl: the native inner shadow is a multi-pass shader (applyInnerShadowFilterToGl) into offscreen
//     render targets, composited onto the screen after the scene. `drawNativeInnerShadow(spec)` runs that
//     GPU pass; it is a no-op on DOM/Canvas. Gl is the meaningful comparison this test exists for.
// A backend implements whichever path is real for it and leaves the other a no-op, so app.ts can call
// both unconditionally.
import type { Bitmap, DisplayObject, ImageResource, InnerShadowFilter } from '@flighthq/sdk';

export interface NativeInnerShadowSpec {
  // The source image to filter natively (the same pixels the reference tile filtered on the CPU).
  source: ImageResource;
  // The inner-shadow descriptor — the same config the surface reference used.
  filter: Readonly<InnerShadowFilter>;
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
  // Inner shadow has no CSS form, so this is a no-op on every backend. Kept to mirror the blur-parity
  // seam shape; `node` must already be attached under the root passed to render().
  applyNativeInnerShadow(node: Bitmap, filter: Readonly<InnerShadowFilter>): void;
  // Shader backends (Gl): run the offscreen multi-pass inner shadow and composite it at the native
  // tile. No-op on DOM/Canvas. Called after applyNativeInnerShadow, immediately before/around render().
  drawNativeInnerShadow?(spec: Readonly<NativeInnerShadowSpec>): void;
  render(root: DisplayObject): void;
}
