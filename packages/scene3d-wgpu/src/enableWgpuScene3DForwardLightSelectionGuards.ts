import type { LogState } from '@flighthq/log/contract';
import { logOnce } from '@flighthq/log/contract';
import type { Scene3DLightsLike, WgpuRenderState } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { getWgpuScene3DRuntime } from './wgpuScene3DRuntime.ts';

export function areWgpuScene3DForwardLightSelectionGuardsEnabled(state: WgpuRenderState): boolean {
  return getWgpuScene3DRuntime(state).forwardLightSelectionGuard != null;
}

export function enableWgpuScene3DForwardLightSelectionGuards(state: WgpuRenderState, logState: LogState | null): void {
  getWgpuScene3DRuntime(state).forwardLightSelectionGuard = (lights): void => warnSelectionRequired(logState, lights);
}

function warnSelectionRequired(logState: LogState | null, lights: Readonly<Scene3DLightsLike>): void {
  if (logState === null) return;
  logOnce(
    logState,
    0,
    'scene-wgpu:forward-light-selection-required',
    LogLevel.Warn,
    {
      message:
        'renderWgpuScene3D: punctual lights exceed MAX_FORWARD_LIGHTS and will be input-order truncated — call prepareWgpuScene3DForwardLights after prepareScene3DRender and pass its result to renderWgpuScene3D.',
      pointLightCount: lights.point?.length ?? 0,
      spotLightCount: lights.spot?.length ?? 0,
    },
    'scene-wgpu',
  );
}
