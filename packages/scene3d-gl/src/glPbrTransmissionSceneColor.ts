import type { GlPbrTransmissionSceneColor, GlRenderState } from '@flighthq/types/contract';

import { getGlScene3DRuntime } from './glScene3DRuntime';

// Selects the caller-owned, resolved opaque-scene texture sampled by later transmission draws.
// Passing null disables refraction.
export function setGlPbrTransmissionSceneColor(
  state: GlRenderState,
  sceneColor: Readonly<GlPbrTransmissionSceneColor> | null,
): void {
  getGlScene3DRuntime(state).pbrTransmissionSceneColor = sceneColor;
}
