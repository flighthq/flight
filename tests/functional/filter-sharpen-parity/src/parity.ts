// Shared per-backend contract for the sharpen leg of the filter-parity suite.
//
// A parity test lays out two tiles: a REFERENCE tile (the canonical CPU/surface filter, blitted as a
// plain bitmap — identical bytes on every backend) and a NATIVE tile (the same source pushed through
// THIS backend's real filter path). app.ts is backend-agnostic; each render.<backend>.ts implements
// this contract so app.ts never branches on the renderer.
//
// Sharpen (unsharp mask) has NO CSS-filter form: `filter: blur()` exists, but there is no CSS sharpen
// primitive. So unlike blur-parity, the DOM/Canvas "native" tile is the surface reference itself —
// parity holds there by construction, and the WebGL shader path is the meaningful comparison:
//   - DOM / Canvas: drawNativeSharpen is undefined; app.ts blits the CPU reference as the native tile.
//   - WebGL: the native sharpen is a single-pass unsharp-mask shader (applySharpenFilterToWebGL) over
//     offscreen render targets, composited onto the screen after the scene. `drawNativeSharpen(spec)`
//     runs that GPU pass.
// A backend implements the shader path only if it is real for it (WebGL); the others leave it undefined
// and app.ts falls back to drawing the reference bytes as the native tile.
import type { DisplayObject, ImageResource } from '@flighthq/sdk';

export interface NativeSharpenSpec {
  // The source image to sharpen natively (the same pixels the reference tile sharpened on the CPU).
  source: ImageResource;
  blurX: number;
  blurY: number;
  amount: number;
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
  // Shader backends (WebGL): run the offscreen unsharp-mask pass and composite it at the native tile.
  // Undefined on DOM/Canvas, where app.ts draws the CPU reference bytes as the native tile instead.
  drawNativeSharpen?(spec: Readonly<NativeSharpenSpec>): void;
  render(root: DisplayObject): void;
}
