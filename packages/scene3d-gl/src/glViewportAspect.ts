import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import type { GlRenderState } from '@flighthq/types/contract';

// Resolves the authoritative draw-time perspective aspect from the active GL pass. This stays an
// internal backend fact: callers provide a camera, while the current destination determines mapping.
export function getGlScene3DViewportAspect(state: Readonly<GlRenderState>): number {
  const viewport = getGlRenderStateRuntime(state).renderTargetViewport ?? state.canvas;
  return viewport.width > 0 && viewport.height > 0 ? viewport.width / viewport.height : 1;
}
