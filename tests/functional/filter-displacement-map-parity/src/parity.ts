// Shared per-backend contract for the displacement-map filter-parity test.
//
// A parity test lays out two tiles: a REFERENCE tile (the canonical CPU/surface filter, blitted as a
// plain bitmap — identical bytes on every backend) and a NATIVE tile (the same source pushed through
// THIS backend's real filter path). app.ts is backend-agnostic; each render.<backend>.ts implements
// this contract so app.ts never branches on the renderer.
//
// DisplacementMapFilter has NO CSS form, so the two filter shapes differ from the blur suite:
//   - DOM / Canvas: there is no native CSS displacement filter. The "native" tile is the CPU/surface
//     result drawn as a plain bitmap — parity holds by construction there, and `drawNativeDisplacement`
//     is a no-op on those backends. The CSS path of the blur suite has no analogue here.
//   - Gl: the native displacement is a single-pass shader (applyDisplacementMapFilterToGl) that
//     samples the source (unit 0) at a UV offset driven by the displacement map (unit 1), into an
//     offscreen render target composited onto the screen after the scene. `drawNativeDisplacement(spec)`
//     runs that GPU pass.
// A backend implements whichever path is real for it and leaves the other a no-op, so app.ts can call
// both unconditionally.
import type { DisplacementMapFilter, DisplayObject, ImageResource } from '@flighthq/sdk';

export interface NativeDisplacementSpec {
  // The source image to warp natively (the same pixels the reference tile warped on the CPU).
  source: ImageResource;
  // The displacement-map image (drives the per-pixel UV offset; channels selected by componentX/Y).
  map: ImageResource;
  // The filter descriptor (mode, componentX/Y, scaleX/Y) — same instance the surface reference used.
  filter: Readonly<Omit<DisplacementMapFilter, 'type'>>;
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
  // Shader backends (Gl): run the offscreen single-pass displacement and composite it at the native
  // tile. No-op on DOM/Canvas (which draw the surface result directly as the native tile). Called before
  // render().
  drawNativeDisplacement?(spec: Readonly<NativeDisplacementSpec>): void;
  render(root: DisplayObject): void;
}
