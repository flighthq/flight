import type { RenderEffect } from './RenderEffect';
export interface ContactShadowsEffect extends RenderEffect {
  kind: 'ContactShadowsEffect';
  distance?: number;
  opacity?: number;
  samples?: number;
  smoothness?: number;
}
