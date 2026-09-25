import { getTextureSourceKind } from '@flighthq/texture/contract';
import type { GlRenderState, TextureLike, TextureResolutionExplanation } from '@flighthq/types/contract';

import { getGlRenderStateRuntime } from './glRenderState.ts';

export function explainGlTextureResolution(
  state: GlRenderState,
  texture: Readonly<TextureLike>,
): TextureResolutionExplanation {
  const kind = getTextureSourceKind(texture);
  if (kind === null) return { kind, status: 'missing-kind' };
  return {
    kind,
    status: getGlRenderStateRuntime(state).registries.textureResolvers.has(kind) ? 'registered' : 'missing-resolver',
  };
}
