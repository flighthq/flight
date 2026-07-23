import type { SurfaceShadowBlurOptions } from './SurfaceShadowBlurOptions';

export interface SurfaceGlowOptions extends SurfaceShadowBlurOptions {
  /** Packed 0xRRGGBBAA glow color. Default 0xff0000ff (opaque red). */
  color?: number;
  /** Overall intensity multiplier applied to the glow alpha. Default 1. */
  intensity?: number;
}
