import { getTextureBackingKind } from '@flighthq/texture/contract';
import type { DomRenderState, Texture, TextureResolutionExplanation } from '@flighthq/types/contract';

import { getDomRenderStateRuntime } from './domRenderState';

export function explainDomTextureResolution(
  state: DomRenderState,
  texture: Readonly<Texture>,
): TextureResolutionExplanation {
  const kind = getTextureBackingKind(texture);
  if (kind === null) return { kind, status: 'missing-kind' };
  return {
    kind,
    status:
      getDomRenderStateRuntime(state).domTextureResolverRegistry?.has(kind) === true
        ? 'registered'
        : 'missing-resolver',
  };
}
