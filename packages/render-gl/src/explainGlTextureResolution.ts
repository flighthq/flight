import { getTextureBackingKind } from '@flighthq/texture/contract';
import type { GlRenderState, TextureLike, TextureResolutionExplanation } from '@flighthq/types/contract';

import { getGlRenderStateRuntime } from './glRenderState';

export function explainGlTextureResolution(
  state: GlRenderState,
  texture: Readonly<TextureLike>,
): TextureResolutionExplanation {
  const kind = getTextureBackingKind(texture);
  if (kind === null) return { kind, status: 'missing-kind' };
  return {
    kind,
    status:
      getGlRenderStateRuntime(state).glTextureResolverRegistry?.has(kind) === true ? 'registered' : 'missing-resolver',
  };
}
