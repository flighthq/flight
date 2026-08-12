import { getTextureSourceKind } from '@flighthq/texture/contract';
import type { DomRenderState, Texture, TextureResolutionExplanation } from '@flighthq/types/contract';
import { RegistryEntryState } from '@flighthq/types/contract';

import { getDomRenderStateRuntime } from './domRenderState';

export function explainDomTextureResolution(
  state: DomRenderState,
  texture: Readonly<Texture>,
): TextureResolutionExplanation {
  const kind = getTextureSourceKind(texture);
  if (kind === null) return { kind, status: 'missing-kind' };
  return {
    kind,
    status:
      getDomRenderStateRuntime(state).registries.textureResolvers.entries.get(kind)?.state === RegistryEntryState.Bound
        ? 'registered'
        : 'missing-resolver',
  };
}
