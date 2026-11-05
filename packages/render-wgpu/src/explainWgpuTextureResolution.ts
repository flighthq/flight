import { getTextureSourceKind } from '@flighthq/texture/contract';
import type { TextureLike, TextureResolutionExplanation } from '@flighthq/types/contract';

import type { WgpuRenderState } from './contract.render-wgpu-types.ts';
import { getWgpuRenderStateRuntime } from './wgpuRenderState.ts';

export function explainWgpuTextureResolution(
  state: WgpuRenderState,
  texture: Readonly<TextureLike>,
): TextureResolutionExplanation {
  const kind = getTextureSourceKind(texture);
  if (kind === null) return { kind, status: 'missing-kind' };
  return {
    kind,
    status: getWgpuRenderStateRuntime(state).registries.textureResolvers.has(kind) ? 'registered' : 'missing-resolver',
  };
}
