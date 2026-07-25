import { logOnce } from '@flighthq/log';
import type { SceneLightsLike, WgpuRenderState } from '@flighthq/types';
import { LogLevel } from '@flighthq/types';

import { getWgpuSceneRuntime } from './wgpuSceneRuntime';

export function areWgpuSceneForwardLightSelectionGuardsEnabled(state: WgpuRenderState): boolean {
  return getWgpuSceneRuntime(state).forwardLightSelectionGuard != null;
}

export function enableWgpuSceneForwardLightSelectionGuards(state: WgpuRenderState): void {
  getWgpuSceneRuntime(state).forwardLightSelectionGuard = warnSelectionRequired;
}

function warnSelectionRequired(lights: Readonly<SceneLightsLike>): void {
  logOnce(
    'scene-wgpu:forward-light-selection-required',
    LogLevel.Warn,
    {
      message:
        'drawWgpuScene: punctual lights exceed MAX_FORWARD_LIGHTS and will be input-order truncated — call prepareWgpuSceneForwardLights after prepareSceneRender and pass its result to drawWgpuScene.',
      pointLightCount: lights.point?.length ?? 0,
      spotLightCount: lights.spot?.length ?? 0,
    },
    'scene-wgpu',
  );
}
