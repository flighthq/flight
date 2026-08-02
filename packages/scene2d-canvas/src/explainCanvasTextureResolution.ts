import { getTextureSourceKind } from '@flighthq/texture/contract';
import type { CanvasTextureResolvers, Texture, TextureResolutionExplanation } from '@flighthq/types/contract';

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
