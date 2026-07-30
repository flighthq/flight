import { logOnce } from '@flighthq/log/contract';
import { getTextureBackingKind } from '@flighthq/texture/contract';
import type { CanvasRenderState, CanvasTextureResolver, Texture, TextureBackingKind } from '@flighthq/types/contract';
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

class GuardedCanvasTextureResolverRegistry extends Map<TextureBackingKind, CanvasTextureResolver> {
  override get(kind: TextureBackingKind): CanvasTextureResolver | undefined {
    return super.get(kind) ?? warnMissingCanvasTextureResolver;
  }
}

function warnMissingCanvasTextureResolver(
  _state: CanvasRenderState,
  texture: Readonly<Texture>,
): CanvasImageSource | null {
  const kind = getTextureBackingKind(texture);
  if (kind === null) return null;
  logOnce(
    `scene2d-canvas:texture-resolver-missing:${kind}`,
    LogLevel.Warn,
    {
      kind,
      message:
        'resolveCanvasTexture: texture backing kind has no registered resolver — call registerCanvasTextureResolver(state, backingKind, resolver)',
      texture,
    },
    'scene2d-canvas',
  );
  return null;
}
