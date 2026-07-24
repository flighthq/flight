import { logOnce } from '@flighthq/log';
import type { GlRenderState, SceneLightsLike } from '@flighthq/types';
import { LogLevel } from '@flighthq/types';

import { getGlSceneRuntime } from './glSceneRuntime';

// Returns whether the forward-light selection guard is installed on `state`.
export function areGlSceneForwardLightSelectionGuardsEnabled(state: GlRenderState): boolean {
  return getGlSceneRuntime(state).forwardLightSelectionGuard != null;
}

// Installs the shakeable forward-light selection guard on `state`. drawGlScene reaches this guard
// only when point or spot input exceeds MAX_FORWARD_LIGHTS and no prepared per-object selection list
// was supplied. The message and @flighthq/log dependency remain outside the core draw module.
export function enableGlSceneForwardLightSelectionGuards(state: GlRenderState): void {
  getGlSceneRuntime(state).forwardLightSelectionGuard = warnGlSceneForwardLightSelectionRequired;
}

function warnGlSceneForwardLightSelectionRequired(lights: Readonly<SceneLightsLike>): void {
  logOnce(
    'scene-gl:forward-light-selection-required',
    LogLevel.Warn,
    {
      message:
        'drawGlScene: punctual lights exceed MAX_FORWARD_LIGHTS and will be input-order truncated — call prepareGlSceneForwardLights after prepareSceneRender and pass its result to drawGlScene.',
      pointLightCount: lights.point?.length ?? 0,
      spotLightCount: lights.spot?.length ?? 0,
    },
    'scene-gl',
  );
}
