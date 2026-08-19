import type { RenderEffect } from './RenderEffect';

export interface RadialBlurEffect extends RenderEffect {
  kind: 'RadialBlurEffect';
  /**
   * Horizontal centre of the radial smear as a fraction of the frame, 0 at the LEFT edge and 1 at the
   * right (default 0.5). X has the same origin on every backend, so no runner converts it.
   */
  centerX?: number;
  /**
   * Vertical centre of the radial smear as a fraction of the frame, 0 at the TOP edge and 1 at the
   * bottom (default 0.5).
   *
   * Screen space: origin top-left, +Y down, angles measured from +X toward +Y — clockwise as
   * displayed. Each runner converts into its own texcoord space at its own seam.
   *
   * ★ THE Gl RUNNER FLIPS THIS AND THE Wgpu RUNNER DOES NOT, and both are correct: Gl's fullscreen
   * quad is bottom-left origin and Wgpu's is top-left. A centred blur is its own mirror, so 0.5 cannot
   * show a missing conversion — the scene uses an off-centre value for exactly that reason.
   */
  centerY?: number;
  strength?: number;
  samples?: number;
}
