import { logOnce } from '@flighthq/log/contract';
import type { LogState } from '@flighthq/log/contract';
import { areRenderRegistriesGuardsEnabled, enableRenderRegistriesGuards } from '@flighthq/render/contract';
import type { WgpuRenderState } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { getWgpuRenderStateRuntime } from './wgpuRenderState.ts';

export function areWgpuTextureResolverGuardsEnabled(state: WgpuRenderState): boolean {
  return areRenderRegistriesGuardsEnabled(state);
}

export function enableWgpuTextureResolverGuards(state: WgpuRenderState, logState: LogState | null): void {
  enableRenderRegistriesGuards(state, logState);
  const runtime = getWgpuRenderStateRuntime(state);
  runtime.mipmapDegradedGuard = (degradedState) => warnOnMipmapDegradation(logState, degradedState);
}

function warnOnMipmapDegradation(logState: LogState | null, state: WgpuRenderState): void {
  if (logState === null) return;
  // The render guards take no clock, so the warning is stamped at time zero.
  logOnce(
    logState,
    0,
    'render-wgpu:mipmap-degraded',
    LogLevel.Warn,
    {
      message:
        'bindWgpuBitmapTexture: mipmaps requested but no WGPU mipmap generator registered — texture allocated with a single mip level (bilinear fallback). Call registerWgpuMipmapGeneration(state) to enable trilinear/anisotropic sampling.',
      state,
    },
    'render-wgpu',
  );
}
