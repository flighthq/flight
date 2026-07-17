import { logOnce } from '@flighthq/log';
import type { GlRenderState } from '@flighthq/types';
import { LogLevel } from '@flighthq/types';

import { getGlSceneRuntime } from './glSceneRuntime';

// Returns whether the scene color-space guard is installed on `state` (enableGlSceneColorSpaceGuards).
export function areGlSceneColorSpaceGuardsEnabled(state: GlRenderState): boolean {
  return getGlSceneRuntime(state).colorSpaceGuard != null;
}

// Installs the shakeable scene color-space guard on `state`: when drawGlScene renders straight to the
// canvas (no bound render target), its linear HDR radiance reaches the 8-bit canvas with no present pass
// to apply the sRGB encode, so the frame looks dark. drawGlScene reaches this guard only through its
// nullable scene-runtime slot and warns once. Not calling this — the production default — costs the draw
// path nothing: the message and the @flighthq/log dependency live only in this separately-imported
// module. Idempotent.
export function enableGlSceneColorSpaceGuards(state: GlRenderState): void {
  getGlSceneRuntime(state).colorSpaceGuard = warnGlSceneDrawnToCanvas;
}

function warnGlSceneDrawnToCanvas(): void {
  logOnce(
    'scene-gl:scene-drawn-to-canvas-unencoded',
    LogLevel.Warn,
    {
      message:
        'drawGlScene: scene drawn directly to the canvas — linear radiance is not sRGB-encoded (output will be dark). Render into a target and present with presentGlScene, or draw through the effect pipeline.',
    },
    'scene-gl',
  );
}
