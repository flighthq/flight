import { logOnce } from '@flighthq/log/contract';
import { areRenderRegistriesGuardsEnabled, enableRenderRegistriesGuards } from '@flighthq/render/contract';
import type { WgpuRenderState } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { getWgpuRenderStateRuntime } from './wgpuRenderState';

export function areWgpuTextureResolverGuardsEnabled(state: WgpuRenderState): boolean {
  return areRenderRegistriesGuardsEnabled(state);
}

export function enableWgpuTextureResolverGuards(state: WgpuRenderState): void {
  enableRenderRegistriesGuards(state);
  const runtime = getWgpuRenderStateRuntime(state);
  runtime.mipmapDegradedGuard = warnOnMipmapDegradation;
}

function warnOnMipmapDegradation(state: WgpuRenderState): void {
  logOnce(
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
