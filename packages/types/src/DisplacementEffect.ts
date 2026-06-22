import type { RenderEffect } from './RenderEffect';

// Heat-haze / shimmer: warp the sample position by an animated sine field for a refractive-air or
// underwater wobble. `seed` animates it frame to frame.
export interface DisplacementEffect extends RenderEffect {
  kind: 'DisplacementEffect';
  intensity?: number; // max warp in pixels. Default 8.
  frequency?: number; // wave count across the frame. Default 12.
  seed?: number; // animate frame to frame.
}
