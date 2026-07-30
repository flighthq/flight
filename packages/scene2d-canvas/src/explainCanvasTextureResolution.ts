import { getTextureSourceKind } from '@flighthq/texture/contract';
import type { CanvasRenderState, Texture, TextureResolutionExplanation } from '@flighthq/types/contract';

import { getCanvasRenderStateRuntime } from './canvasRenderState';

export function explainCanvasTextureResolution(
  state: CanvasRenderState,
  texture: Readonly<Texture>,
): TextureResolutionExplanation {
  const kind = getTextureSourceKind(texture);
  if (kind === null) return { kind, status: 'missing-kind' };
  return {
    kind,
    status:
      getCanvasRenderStateRuntime(state).canvasTextureResolverRegistry?.has(kind) === true
        ? 'registered'
        : 'missing-resolver',
  };
}
