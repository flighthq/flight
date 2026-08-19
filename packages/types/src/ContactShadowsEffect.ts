import type { RenderEffect } from './RenderEffect';
export interface ContactShadowsEffect extends RenderEffect {
  kind: 'ContactShadowsEffect';
  /**
   * Occlusion search radius, as the normalized radius forwarded to the SSAO pass (default 0.5). A
   * magnitude with no direction and no origin — it is NOT an offset like `DropShadowEffect.distance`,
   * which is a pixel length along an angle. Named here so the two are not read as the same parameter.
   */
  distance?: number;
  opacity?: number;
  samples?: number;
  smoothness?: number;
}
