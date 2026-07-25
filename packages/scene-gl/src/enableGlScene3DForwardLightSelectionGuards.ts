import { logOnce } from '@flighthq/log';
import type { GlRenderState, Scene3DLightsLike } from '@flighthq/types';
import { LogLevel } from '@flighthq/types';

import { getGlScene3DRuntime } from './glScene3DRuntime';

// Returns whether the forward-light selection guard is installed on `state`.
export function areGlScene3DForwardLightSelectionGuardsEnabled(state: GlRenderState): boolean {
  return getGlScene3DRuntime(state).forwardLightSelectionGuard != null;
}

// Installs the shakeable forward-light selection guard on `state`. drawGlScene3D reaches this guard
// only when point or spot input exceeds MAX_FORWARD_LIGHTS and no prepared per-object selection list
// was supplied. The message and @flighthq/log dependency remain outside the core draw module.
export function enableGlScene3DForwardLightSelectionGuards(state: GlRenderState): void {
  getGlScene3DRuntime(state).forwardLightSelectionGuard = warnGlScene3DForwardLightSelectionRequired;
}

function warnGlScene3DForwardLightSelectionRequired(lights: Readonly<Scene3DLightsLike>): void {
  logOnce(
    'scene-gl:forward-light-selection-required',
    LogLevel.Warn,
    {
      message:
        'drawGlScene3D: punctual lights exceed MAX_FORWARD_LIGHTS and will be input-order truncated — call prepareGlScene3DForwardLights after prepareScene3DRender and pass its result to drawGlScene3D.',
      pointLightCount: lights.point?.length ?? 0,
      spotLightCount: lights.spot?.length ?? 0,
    },
    'scene-gl',
  );
}
