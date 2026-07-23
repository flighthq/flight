import type { SurfaceShadowBlurOptions } from './SurfaceShadowBlurOptions';

export interface SurfaceInnerGlowOptions extends SurfaceShadowBlurOptions {
  /** Packed 0xRRGGBBAA inner glow color. Default 0xff0000ff (opaque red). */
  color?: number;
  /** Overall intensity multiplier applied to the glow alpha. Default 1. */
  intensity?: number;
}
