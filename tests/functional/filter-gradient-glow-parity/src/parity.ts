// Shared per-backend contract for the gradient-glow parity test.
//
// A parity test lays out two tiles: a REFERENCE tile (the canonical CPU/surface filter, blitted as a
// plain bitmap — identical bytes on every backend) and a NATIVE tile (the same source pushed through
// THIS backend's real filter path). app.ts is backend-agnostic; each render.<backend>.ts implements
// this contract so app.ts never branches on the renderer.
//
// Gradient glow has no CSS-filter form (the gradient ramp keyed off a blurred silhouette is not
// expressible as a `filter:` string), so unlike filter-blur-parity there is no Canvas/DOM native path:
//   - DOM / Canvas: there is no native filter pass. The "native" tile is the SAME CPU/surface reference
//     bitmap (drawNativeGradientGlow is a no-op; app.ts draws the reference bytes as the native tile).
//     Parity holds by construction there; the WebGL comparison is the meaningful one.
//   - WebGL: the native glow is a multi-pass shader into offscreen render targets (a tint pass, a box
//     blur, and a gradient-ramp lookup), composited onto the screen after the scene.
//     `drawNativeGradientGlow(spec)` runs that GPU pass; it is a no-op on DOM/Canvas.
import type { DisplayObject, GradientGlowFilter, ImageResource } from '@flighthq/sdk';

export interface NativeGradientGlowSpec {
  // The source image to glow natively (the same pixels the reference tile glowed on the CPU).
  source: ImageResource;
  // The filter descriptor, identical to the one the surface reference used.
  filter: Readonly<Omit<GradientGlowFilter, 'type'>>;
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
  // Shader backends (WebGL): run the offscreen multi-pass glow and composite it at the native tile.
  // No-op on DOM/Canvas (their native tile is the reference bitmap drawn by app.ts). Called immediately
  // before/around render().
  drawNativeGradientGlow?(spec: Readonly<NativeGradientGlowSpec>): void;
  render(root: DisplayObject): void;
}
