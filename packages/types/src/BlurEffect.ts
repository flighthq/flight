import type { RenderEffect } from './RenderEffect';

// Plain separable Gaussian blur — the spatial-effect primitive underneath soft spreads (glow, shadow,
// bloom). `blurX`/`blurY` are the Gaussian standard deviations in pixels along each axis (CSS
// `blur(Xpx)` uses sigma = X), so the backends match the CSS and surface references. A blur reads
// neighboring texels, so it bounces through an offscreen target rather than folding into the draw —
// the defining property of an Effect rather than an Adjustment.
export interface BlurEffect extends RenderEffect {
  kind: 'BlurEffect';
  blurX?: number;
  blurY?: number;
}
