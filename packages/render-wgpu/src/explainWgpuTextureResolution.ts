import { getTextureBackingKind } from '@flighthq/texture/contract';
import type { TextureLike, TextureResolutionExplanation, WgpuRenderState } from '@flighthq/types/contract';

import { getWgpuRenderStateRuntime } from './wgpuRenderState';

export function explainWgpuTextureResolution(
  state: WgpuRenderState,
  texture: Readonly<TextureLike>,
): TextureResolutionExplanation {
  const kind = getTextureBackingKind(texture);
  if (kind === null) return { kind, status: 'missing-kind' };
  return {
    kind,
    status:
      getWgpuRenderStateRuntime(state).wgpuTextureResolverRegistry?.has(kind) === true
        ? 'registered'
        : 'missing-resolver',
  };
}
