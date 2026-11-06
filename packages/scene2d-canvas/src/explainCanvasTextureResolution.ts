import { getTextureSourceKind } from '@flighthq/texture/contract';
import type { Texture } from '@flighthq/texture/contract';
import type { TextureResolutionExplanation } from '@flighthq/types/contract';

import type { CanvasTextureResolvers } from './types/CanvasTextureResolver.ts';

export function explainCanvasTextureResolution(
  resolvers: Readonly<CanvasTextureResolvers>,
  texture: Readonly<Texture>,
): TextureResolutionExplanation {
  const kind = getTextureSourceKind(texture);
  if (kind === null) return { kind, status: 'missing-kind' };
  return {
    kind,
    status: resolvers.registry?.has(kind) === true ? 'registered' : 'missing-resolver',
  };
}
