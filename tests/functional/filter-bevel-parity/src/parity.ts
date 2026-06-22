// Shared per-backend contract for the filter-parity suite (bevel variant).
//
// A parity test lays out two tiles: a REFERENCE tile (the canonical CPU/surface filter, blitted as a
// plain bitmap — identical bytes on every backend) and a NATIVE tile (the same source pushed through
// THIS backend's real filter path). app.ts is backend-agnostic; each render.<backend>.ts implements
// this contract so app.ts never branches on the renderer.
//
// Unlike blur, the bevel filter has NO CSS native path — Canvas/DOM cannot express a directional
// inner-bevel edge mask with a CSS filter string. So on Canvas/DOM the "native" tile is the surface
// reference itself (parity holds by construction there), and only Gl runs a real native path:
//   - Gl: the native bevel is a multi-pass shader (tint + box blur + offset blits) into offscreen
//     render targets, composited onto the screen after the scene. `drawNativeBevel(spec)` runs that GPU
//     pass; it is a no-op on Canvas/DOM. Gl is the meaningful comparison.
import type { BevelFilter, Bitmap, DisplayObject, ImageResource } from '@flighthq/sdk';

export interface NativeBevelSpec {
  // The source image to bevel natively (the same pixels the reference tile beveled on the CPU).
  source: ImageResource;
  // The full bevel filter descriptor (angle, distance, colors, blur, strength, bevelType).
  filter: Readonly<BevelFilter>;
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
  // CSS-filter backends (Canvas/DOM) have no native bevel; `node` is the reference bitmap they draw as
  // the native tile. This hook is a no-op on every backend (kept for contract symmetry with blur).
  applyNativeBevel(node: Bitmap): void;
  // Shader backends (Gl): run the offscreen multi-pass bevel and composite it at the native tile.
  // No-op on Canvas/DOM. Called after applyNativeBevel, immediately before/around render().
  drawNativeBevel?(spec: Readonly<NativeBevelSpec>): void;
  render(root: DisplayObject): void;
}
