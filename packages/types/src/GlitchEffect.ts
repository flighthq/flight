import type { RenderEffect } from './RenderEffect';

// Digital glitch: horizontal block tears (rows displaced by a per-block hash), RGB channel separation,
// and occasional bright scanline corruption. `seed` animates it frame to frame (data-moshing look).
export interface GlitchEffect extends RenderEffect {
  kind: 'GlitchEffect';
  intensity?: number; // overall strength 0..1; scales tear displacement + corruption frequency.
  blockSize?: number; // height in pixels of a tear block (smaller = finer tearing). Default 24.
  colorShift?: number; // RGB channel separation in pixels at full tear. Default 8.
  seed?: number; // animate frame to frame.
}
