import { logOnce } from '@flighthq/log/contract';
import { getTextureSourceKind } from '@flighthq/texture/contract';
import type { DomRenderState, DomTextureResolver, Texture, TextureSourceKind } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { getDomRenderStateRuntime } from './domRenderState';

export function areDomTextureResolverGuardsEnabled(state: DomRenderState): boolean {
  return getDomRenderStateRuntime(state).domTextureResolverRegistry instanceof GuardedDomTextureResolverRegistry;
}

export function enableDomTextureResolverGuards(state: DomRenderState): void {
  const runtime = getDomRenderStateRuntime(state);
  if (runtime.domTextureResolverRegistry instanceof GuardedDomTextureResolverRegistry) return;
  const guarded = new GuardedDomTextureResolverRegistry();
  runtime.domTextureResolverRegistry?.forEach((resolver, kind) => guarded.set(kind, resolver));
  runtime.domTextureResolverRegistry = guarded;
}

class GuardedDomTextureResolverRegistry extends Map<TextureSourceKind, DomTextureResolver> {
  override get(kind: TextureSourceKind): DomTextureResolver | undefined {
    return super.get(kind) ?? warnMissingDomTextureResolver;
  }
}

function warnMissingDomTextureResolver(_state: DomRenderState, texture: Readonly<Texture>): CanvasImageSource | null {
  const kind = getTextureSourceKind(texture);
  if (kind === null) return null;
  logOnce(
    `scene2d-dom:texture-resolver-missing:${kind}`,
    LogLevel.Warn,
    {
      kind,
      message:
        'resolveDomTexture: texture source kind has no registered resolver — call registerDomTextureResolver(state, sourceKind, resolver)',
      texture,
    },
    'scene2d-dom',
  );
  return null;
}
