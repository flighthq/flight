import type { RenderEffect } from './RenderEffect';

export interface TiltShiftEffect extends RenderEffect {
  kind: 'TiltShiftEffect';
  /**
   * Centre of the focus band on Y, 0 at the TOP edge and 1 at the bottom — the same orientation an
   * author reads the picture in, and the same convention GodRaysEffect.centerY uses.
   *
   * This is a value in the DESCRIPTOR's space, not in any backend's texture space. A runner must
   * normalise it into its own at its own seam, exactly as the SDK converts degrees to radians: the Gl
   * runner flips it because its fullscreen quad is bottom-left-origin, while the Wgpu and Canvas
   * runners pass it straight through. A centred band cannot reveal a runner that skips the
   * conversion, because the distance is symmetric about 0.5.
   */
  center?: number;
  width?: number; // focus band height.
  blur?: number;
}
