import type { RenderEffect } from './RenderEffect';

export interface GodRaysEffect extends RenderEffect {
  kind: 'GodRaysEffect'; // [HDR]
  /**
   * The light's horizontal position as a fraction of the frame, 0 at the LEFT edge and 1 at the right.
   *
   * ★ THE ORIGIN IS PART OF THE CONTRACT, NOT THE BACKEND'S BUSINESS. See `centerY`.
   */
  centerX?: number;
  /**
   * The light's vertical position as a fraction of the frame, **0 at the TOP edge and 1 at the bottom** —
   * the same top-left origin the authoring layer uses everywhere else, so `centerY: 0.4` names the row a
   * reader would call 40% down the picture.
   *
   * ★ THIS ORIGIN IS DECLARED BECAUSE ITS ABSENCE WAS A SHIPPED BUG. The two backends' effect passes use
   * opposite texture-space conventions — Gl's fullscreen quad carries bottom-left-origin texcoords, Wgpu's
   * carries top-left — and both runners forwarded this value untouched. The same `centerY: 0.4` therefore
   * placed the light 240 px down on Wgpu and 360 px down on Gl: the rays radiated from different points,
   * the shader text was identical on both sides, and nothing in the type said which one was right.
   *
   * A runner must NORMALISE this value into its own texture space at its own seam, exactly as the SDK
   * converts degrees to radians at the authoring/math boundary rather than letting each caller guess.
   */
  centerY?: number;
  density?: number;
  decay?: number;
  weight?: number;
  exposure?: number;
  samples?: number;
}
