// Shared per-backend contract for the filter-convolution-parity test.
//
// A parity test lays out two tiles: a REFERENCE tile (the canonical CPU/surface filter, blitted as a
// plain bitmap — identical bytes on every backend) and a NATIVE tile (the same source pushed through
// THIS backend's real filter path). app.ts is backend-agnostic; each render.<backend>.ts implements
// this contract so app.ts never branches on the renderer.
//
// Convolution has NO CSS representation, so unlike blur-parity the native path differs sharply by backend:
//   - Canvas / DOM: there is no native convolution. The "native" tile IS the surface reference bytes
//     (drawn as a plain bitmap), so parity holds by construction; these backends only confirm the tile
//     was emitted and is the filtered (not source) image. `applyNativeConvolution` is a no-op.
//   - WebGL: the native convolution is a single-pass shader (applyConvolutionFilterToWebGL) run over an
//     offscreen render target, then composited onto the screen. `drawNativeConvolution(spec)` runs that
//     GPU pass; it is a no-op on Canvas/DOM. This is the meaningful cross-impl comparison.
// A backend implements whichever path is real for it and leaves the other a no-op, so app.ts can call
// both unconditionally.
import type { ConvolutionFilter, DisplayObject, ImageResource } from '@flighthq/sdk';

export interface NativeConvolutionSpec {
  // The source image to filter natively (the same pixels the reference tile filtered on the CPU).
  source: ImageResource;
  // The convolution kernel — MUST match the kernel used for the surface reference, or parity fails.
  filter: Readonly<Omit<ConvolutionFilter, 'type'>>;
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
  // Reserved for a hypothetical CSS-filter convolution. No backend implements one today; every backend
  // leaves this a no-op. Kept to mirror the blur-parity contract shape.
  applyNativeConvolution(): void;
  // Shader backends (WebGL): run the offscreen single-pass convolution and composite it at the native
  // tile. No-op on DOM/Canvas. Called immediately before/around render().
  drawNativeConvolution?(spec: Readonly<NativeConvolutionSpec>): void;
  render(root: DisplayObject): void;
}
