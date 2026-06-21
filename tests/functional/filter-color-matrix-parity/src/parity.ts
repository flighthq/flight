// Shared per-backend contract for the filter-parity suite (color-matrix variant).
//
// A parity test lays out two tiles: a REFERENCE tile (the canonical CPU/surface filter, blitted as a
// plain bitmap — identical bytes on every backend) and a NATIVE tile (the same source pushed through
// THIS backend's real filter path). app.ts is backend-agnostic; each render.<backend>.ts implements
// this contract so app.ts never branches on the renderer.
//
// Color-matrix has NO CSS-filter form, so the per-backend split here differs from blur:
//   - DOM / Canvas: there is no native CSS color-matrix path, so the "native" tile is the CPU/surface
//     result drawn as a plain bitmap — parity holds by construction. drawNativeColorMatrix is a no-op.
//   - WebGL: the native filter is a single-pass shader into an offscreen render target, composited onto
//     the screen after the scene. drawNativeColorMatrix(spec) runs that GPU pass.
// A backend implements whichever path is real for it and leaves the other a no-op, so app.ts can call
// both unconditionally. The WebGL tile is the meaningful comparison.
import type { ColorMatrixFilter, DisplayObject, ImageResource } from '@flighthq/sdk';

export interface NativeColorMatrixSpec {
  // The source image to transform natively (the same pixels the reference tile transformed on the CPU).
  source: ImageResource;
  // The 4×5 (20-value) color matrix in OpenFL/Flash order — the same matrix the CPU reference used.
  filter: Readonly<ColorMatrixFilter>;
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
  // Shader backends (WebGL): run the offscreen single-pass color-matrix and composite it at the native
  // tile. No-op on DOM/Canvas (where the native tile is drawn as the CPU result bitmap instead).
  drawNativeColorMatrix?(spec: Readonly<NativeColorMatrixSpec>): void;
  render(root: DisplayObject): void;
}
