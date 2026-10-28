import type { LogState } from '@flighthq/log/contract';
import { logOnce } from '@flighthq/log/contract';
import type { GlRenderState } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { getGlScene3DRuntime } from './glScene3DRuntime.ts';

// Returns whether the scene color-space guard is installed on `state` (enableGlScene3DColorSpaceGuards).
export function areGlScene3DColorSpaceGuardsEnabled(state: GlRenderState): boolean {
  return getGlScene3DRuntime(state).colorSpaceGuard != null;
}

// Installs the shakeable scene color-space guard on `state`: when renderGlScene3D renders straight to the
// canvas (no bound render target), its linear HDR radiance reaches the 8-bit canvas with no present pass
// to apply the sRGB encode, so the frame looks dark. renderGlScene3D reaches this guard only through its
// nullable scene-runtime slot and warns once. Not calling this — the production default — costs the draw
// path nothing: the message and the @flighthq/log dependency live only in this separately-imported
// module. Idempotent.
export function enableGlScene3DColorSpaceGuards(state: GlRenderState, logState: LogState | null): void {
  getGlScene3DRuntime(state).colorSpaceGuard = (): void => warnGlScene3DDrawnToCanvas(logState);
}

function warnGlScene3DDrawnToCanvas(logState: LogState | null): void {
  if (logState === null) return;
  logOnce(
    logState,
    0,
    'scene-gl:scene-drawn-to-canvas-unencoded',
    LogLevel.Warn,
    {
      message:
        'renderGlScene3D: scene drawn directly to the canvas — linear radiance is not sRGB-encoded (output will be dark). Render into a target and present with presentGlScene3D, or draw through the effect pipeline.',
    },
    'scene-gl',
  );
}
