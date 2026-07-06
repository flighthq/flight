// Shared per-backend contract for the filter-pixelate-parity test.
//
// A parity test lays out two tiles: a REFERENCE tile (the canonical CPU/surface filter, blitted as a
// plain bitmap — identical bytes on every backend) and a NATIVE tile (the same source pushed through
// THIS backend's real filter path). app.ts is backend-agnostic; each render.<backend>.ts implements
// this contract so app.ts never branches on the renderer.
//
// Pixelate has NO CSS-filter equivalent, so unlike blur-parity there is no CSS native path:
//   - DOM / Canvas: there is no native pixelate path. The "native" tile is the surface pixelate result
//     itself, drawn as the same reference bitmap — parity holds by construction. drawNativePixelate is
//     a no-op there; the meaningful GPU comparison is Gl.
//   - Gl: the native pixelate is a single-pass shader (applyPixelateFilterToGl) into an offscreen
//     render target, composited onto the screen after the scene. `drawNativePixelate(spec)` runs that
//     GPU pass; it is a no-op on DOM/Canvas.
// A backend implements whichever path is real for it and leaves the other a no-op, so app.ts can call
// both unconditionally.
import type { DisplayObject, ImageResource } from '@flighthq/sdk';

export interface NativePixelateSpec {
  // The source image to pixelate natively (the same pixels the reference tile pixelated on the CPU).
  source: ImageResource;
  // Block edge length in logical pixels; must match the surface reference's blockSize and the tile size.
  blockSize: number;
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
  // Shader backends (Gl): run the offscreen pixelate pass and composite it at the native tile.
  // No-op on DOM/Canvas (which draw the reference surface as the native tile instead).
  drawNativePixelate?(spec: Readonly<NativePixelateSpec>): void;
  render(root: DisplayObject): void;
}
