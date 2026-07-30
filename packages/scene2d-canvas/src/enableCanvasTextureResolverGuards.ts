import { logOnce } from '@flighthq/log/contract';
import { getTextureSourceKind } from '@flighthq/texture/contract';
import type { CanvasRenderState, CanvasTextureResolver, Texture, TextureSourceKind } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { getCanvasRenderStateRuntime } from './canvasRenderState';

export function areCanvasTextureResolverGuardsEnabled(state: CanvasRenderState): boolean {
  return (
    getCanvasRenderStateRuntime(state).canvasTextureResolverRegistry instanceof GuardedCanvasTextureResolverRegistry
  );
}

export function enableCanvasTextureResolverGuards(state: CanvasRenderState): void {
  const runtime = getCanvasRenderStateRuntime(state);
  if (runtime.canvasTextureResolverRegistry instanceof GuardedCanvasTextureResolverRegistry) return;
  const guarded = new GuardedCanvasTextureResolverRegistry();
  runtime.canvasTextureResolverRegistry?.forEach((resolver, kind) => guarded.set(kind, resolver));
  runtime.canvasTextureResolverRegistry = guarded;
}

class GuardedCanvasTextureResolverRegistry extends Map<TextureSourceKind, CanvasTextureResolver> {
  override get(kind: TextureSourceKind): CanvasTextureResolver | undefined {
    return super.get(kind) ?? warnMissingCanvasTextureResolver;
  }
}

function warnMissingCanvasTextureResolver(
  _state: CanvasRenderState,
  texture: Readonly<Texture>,
): CanvasImageSource | null {
  const kind = getTextureSourceKind(texture);
  if (kind === null) return null;
  logOnce(
    `scene2d-canvas:texture-resolver-missing:${kind}`,
    LogLevel.Warn,
    {
      kind,
      message:
        'resolveCanvasTexture: texture source kind has no registered resolver — call registerCanvasTextureResolver(state, sourceKind, resolver)',
      texture,
    },
    'scene2d-canvas',
  );
  return null;
}
