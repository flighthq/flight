import type { GlRenderState } from '@flighthq/render-gl/contract';

import type { GlPbrTransmissionSceneColor } from './contract.scene3d-gl-types.ts';
import { getGlScene3DRuntime } from './glScene3DRuntime.ts';

// Selects the caller-owned, resolved opaque-scene texture sampled by later transmission draws.
// Passing null disables refraction.
export function setGlPbrTransmissionSceneColor(
  state: GlRenderState,
  sceneColor: Readonly<GlPbrTransmissionSceneColor> | null,
): void {
  getGlScene3DRuntime(state).pbrTransmissionSceneColor = sceneColor;
}
