// Shared per-backend contract for the filter-inner-glow-parity test.
//
// A parity test lays out two tiles: a REFERENCE tile (the canonical CPU/surface inner-glow filter,
// blitted as a plain bitmap — identical bytes on every backend) and a NATIVE tile (the same source
// pushed through THIS backend's real filter path). app.ts is backend-agnostic; each render.<backend>.ts
// implements this contract so app.ts never branches on the renderer.
//
// Inner glow has NO CSS representation, so the backend split differs from the blur-parity template:
//   - DOM / Canvas: there is no native CSS inner-glow string. The "native" tile is the surface result
//     itself, drawn as a plain bitmap — parity holds by construction there. `applyNativeGlow` is the
//     no-op these backends use (they draw the reference bytes as the native tile in app.ts).
//   - WebGL: the native inner glow is a multi-pass shader (invert-tint → box-blur → clip → composite)
//     over offscreen render targets, composited onto the screen after the scene. `drawNativeGlow(spec)`
//     runs that GPU pass; it is a no-op on DOM/Canvas. WebGL is the meaningful comparison.
// A backend implements whichever path is real for it and leaves the other a no-op, so app.ts can call
// both unconditionally.
import type { Bitmap, DisplayObject, ImageResource, InnerGlowFilter } from '@flighthq/sdk';

export interface NativeGlowSpec {
  // The source image to glow natively (the same pixels the reference tile glowed on the CPU).
  source: ImageResource;
  // The inner-glow descriptor — same config the CPU reference used.
  filter: Readonly<Omit<InnerGlowFilter, 'type'>>;
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
  // Non-WebGL backends have no native inner-glow path; this is a no-op there (the native tile is the
  // surface reference, drawn directly in app.ts). No-op on WebGL too — kept for contract symmetry.
  applyNativeGlow(node: Bitmap, filter: Readonly<Omit<InnerGlowFilter, 'type'>>): void;
  // Shader backends (WebGL): run the offscreen multi-pass inner glow and composite it at the native tile.
  // No-op on DOM/Canvas. Called after applyNativeGlow, immediately before/around render().
  drawNativeGlow?(spec: Readonly<NativeGlowSpec>): void;
  render(root: DisplayObject): void;
}
